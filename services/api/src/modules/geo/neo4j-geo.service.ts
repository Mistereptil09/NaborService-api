import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import * as turf from '@turf/turf';

export interface NeighbourhoodAssignment {
  neighbourhoodId: string;
  method: 'polygon' | 'nearest-centroid';
}

export interface ProximityResult {
  entityPgId: string;
  entityType: 'listing' | 'event' | 'user';
  neighbourhoodId: string;
  distanceMeters: number;
  geoScore: number;
}

export interface NeighbourhoodMetadata {
  pg_id: string;
  name: string;
  city: string;
  zip_code: string;
  country: string;
}

export interface NeighbourhoodWithAdjacencies {
  pg_id: string;
  centroid: { latitude: number; longitude: number };
  area_m2: number;
  adjacent_pg_ids: string[];
}

@Injectable()
export class Neo4jGeoService {
  private readonly logger = new Logger(Neo4jGeoService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  async assignNeighbourhood(
    lat: number,
    lng: number,
  ): Promise<NeighbourhoodAssignment | null> {
    const point = turf.point([lng, lat]);

    const query = `MATCH (n:Neighbourhood) RETURN n.pg_id AS pg_id, n.geometry AS geometry`;
    const result = await this.neo4jService.run(query, {});

    for (const record of result.records) {
      const pgId = record.get('pg_id');
      const geometryStr = record.get('geometry');
      if (!geometryStr) continue;
      try {
        const geometry = JSON.parse(geometryStr);
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
          continue;
        }
        if (turf.booleanPointInPolygon(point, geometry)) {
          return { neighbourhoodId: pgId, method: 'polygon' };
        }
      } catch (e) {
        this.logger.warn(`Failed to parse geometry for neighbourhood ${pgId}`);
      }
    }

    const fallbackQuery = `
      MATCH (n:Neighbourhood)
      WHERE n.centroid IS NOT NULL
      WITH n, point.distance(point({latitude: $lat, longitude: $lng, crs: 'WGS-84'}), n.centroid) AS dist
      WHERE dist <= 50000
      RETURN n.pg_id AS pg_id
      ORDER BY dist ASC
      LIMIT 1
    `;
    const fallbackResult = await this.neo4jService.run(fallbackQuery, {
      lat,
      lng,
    });
    if (fallbackResult.records.length > 0) {
      return {
        neighbourhoodId: fallbackResult.records[0].get('pg_id'),
        method: 'nearest-centroid',
      };
    }

    return null;
  }

  async computeGeoScore(
    userNeighbourhoodId: string,
    targetNeighbourhoodId: string,
  ): Promise<number> {
    if (userNeighbourhoodId === targetNeighbourhoodId) return 3;

    const query = `
      MATCH p = shortestPath((u:Neighbourhood {pg_id: $userNbId})-[:ADJACENT_TO*1..2]-(t:Neighbourhood {pg_id: $targetNbId}))
      RETURN length(p) AS hops
    `;
    const result = await this.neo4jService.run(query, {
      userNbId: userNeighbourhoodId,
      targetNbId: targetNeighbourhoodId,
    });
    if (result.records.length === 0) return 0;

    const hops = result.records[0].get('hops');
    if (hops === 1) return 2;
    if (hops === 2) return 1;
    return 0;
  }

  async findProximityEntities(
    userNeighbourhoodId: string,
    maxResults: number = 50,
  ): Promise<ProximityResult[]> {
    const checkQuery = `MATCH (n:Neighbourhood {pg_id: $userNbId}) RETURN n.pg_id AS id`;
    const checkResult = await this.neo4jService.run(checkQuery, {
      userNbId: userNeighbourhoodId,
    });
    if (checkResult.records.length === 0) {
      throw new Error('User neighbourhood assignment required');
    }

    const query = `
      MATCH (userNb:Neighbourhood {pg_id: $userNbId})
      MATCH p = (userNb)-[:ADJACENT_TO*0..2]-(targetNb:Neighbourhood)
      WITH userNb, targetNb, length(p) AS hops
      MATCH (entity)-[r:POSTED_IN|HOSTED_IN|LIVES_IN]->(targetNb)
      WHERE labels(entity)[0] IN ['Listing', 'Event', 'User']
      WITH entity, targetNb, hops, point.distance(userNb.centroid, targetNb.centroid) AS distance
      ORDER BY distance ASC, entity.pg_id ASC
      LIMIT toInteger($maxResults)
      RETURN 
        entity.pg_id AS entityPgId,
        labels(entity)[0] AS entityType,
        targetNb.pg_id AS neighbourhoodId,
        distance,
        CASE hops
          WHEN 0 THEN 3
          WHEN 1 THEN 2
          WHEN 2 THEN 1
          ELSE 0
        END AS geoScore
    `;

    const result = await this.neo4jService.run(query, {
      userNbId: userNeighbourhoodId,
      maxResults,
    });
    return result.records.map((record) => ({
      entityPgId: record.get('entityPgId'),
      entityType: record.get('entityType').toLowerCase(),
      neighbourhoodId: record.get('neighbourhoodId'),
      distanceMeters: record.get('distance'),
      geoScore: record.get('geoScore'),
    }));
  }

  async createNeighbourhood(
    polygon: GeoJSON.Polygon,
    metadata: NeighbourhoodMetadata,
  ): Promise<NeighbourhoodWithAdjacencies> {
    this.validatePolygon(polygon);

    const centroidFeature = turf.centroid(polygon);
    const [lng, lat] = centroidFeature.geometry.coordinates;
    const areaM2 = turf.area(polygon);

    const geomStr = JSON.stringify(polygon);

    const createQuery = `
      CREATE (n:Neighbourhood {
        pg_id: $pgId,
        name: $name,
        city: $city,
        zip_code: $zipCode,
        country: $country,
        centroid: point({latitude: $lat, longitude: $lng, crs: 'WGS-84'}),
        geometry: $geometry,
        area_m2: $area,
        created_at: datetime(),
        updated_at: datetime()
      })
      RETURN n.pg_id AS id
    `;

    await this.neo4jService.run(createQuery, {
      pgId: metadata.pg_id,
      name: metadata.name,
      city: metadata.city,
      zipCode: metadata.zip_code,
      country: metadata.country,
      lat,
      lng,
      geometry: geomStr,
      area: areaM2,
    });

    return await this.updateAdjacencies(
      metadata.pg_id,
      polygon,
      lat,
      lng,
      areaM2,
    );
  }

  async updateNeighbourhoodPolygon(
    pgId: string,
    polygon: GeoJSON.Polygon,
  ): Promise<NeighbourhoodWithAdjacencies> {
    this.validatePolygon(polygon);

    const centroidFeature = turf.centroid(polygon);
    const [lng, lat] = centroidFeature.geometry.coordinates;
    const areaM2 = turf.area(polygon);

    const geomStr = JSON.stringify(polygon);

    const updateQuery = `
      MATCH (n:Neighbourhood {pg_id: $pgId})
      SET n.centroid = point({latitude: $lat, longitude: $lng, crs: 'WGS-84'}),
          n.geometry = $geometry,
          n.area_m2 = $area,
          n.updated_at = datetime()
      RETURN n.pg_id AS id
    `;

    const result = await this.neo4jService.run(updateQuery, {
      pgId,
      lat,
      lng,
      geometry: geomStr,
      area: areaM2,
    });

    if (result.records.length === 0) {
      throw new BadRequestException('Neighbourhood not found');
    }

    await this.neo4jService.run(
      `MATCH (n:Neighbourhood {pg_id: $pgId})-[r:ADJACENT_TO]-() DELETE r`,
      { pgId },
    );

    return await this.updateAdjacencies(pgId, polygon, lat, lng, areaM2);
  }

  private validatePolygon(polygon: any) {
    if (
      !polygon ||
      polygon.type !== 'Polygon' ||
      !Array.isArray(polygon.coordinates)
    ) {
      throw new BadRequestException('Invalid GeoJSON Polygon');
    }
    for (const ring of polygon.coordinates) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 1000) {
        throw new BadRequestException(
          'Polygon rings must have between 4 and 1000 positions',
        );
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new BadRequestException('Polygon rings must be closed');
      }
    }
    try {
      const feature = turf.polygon(polygon.coordinates);
      const kinks = turf.kinks(feature);
      if (kinks.features.length > 0) {
        throw new BadRequestException('Polygon must not self-intersect');
      }
    } catch (e) {
      throw new BadRequestException(`Polygon validation failed: ${e.message}`);
    }
  }

  private async updateAdjacencies(
    pgId: string,
    polygon: GeoJSON.Polygon,
    lat: number,
    lng: number,
    areaM2: number,
  ): Promise<NeighbourhoodWithAdjacencies> {
    const query = `MATCH (n:Neighbourhood) WHERE n.pg_id <> $pgId RETURN n.pg_id AS pg_id, n.geometry AS geometry`;
    const result = await this.neo4jService.run(query, { pgId });

    const adjacentIds: string[] = [];
    const polyFeature = turf.polygon(polygon.coordinates);

    for (const record of result.records) {
      const otherId = record.get('pg_id');
      const otherGeomStr = record.get('geometry');
      if (!otherGeomStr) continue;

      try {
        const otherGeom = JSON.parse(otherGeomStr);
        if (otherGeom.type !== 'Polygon' && otherGeom.type !== 'MultiPolygon')
          continue;

        if (turf.booleanIntersects(polyFeature, otherGeom)) {
          adjacentIds.push(otherId);
        }
      } catch (e) {
        // ignore invalid geometries in DB
      }
    }

    if (adjacentIds.length > 0) {
      const relQuery = `
        MATCH (a:Neighbourhood {pg_id: $pgId})
        MATCH (b:Neighbourhood) WHERE b.pg_id IN $adjacentIds
        MERGE (a)-[:ADJACENT_TO]-(b)
      `;
      await this.neo4jService.run(relQuery, { pgId, adjacentIds });
    }

    return {
      pg_id: pgId,
      centroid: { latitude: lat, longitude: lng },
      area_m2: areaM2,
      adjacent_pg_ids: adjacentIds,
    };
  }
}
