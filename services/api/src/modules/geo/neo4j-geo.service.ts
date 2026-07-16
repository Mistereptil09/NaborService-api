import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import { NeighbourhoodService } from '../../database/neo4j/neighbourhood.service';
import { User } from '../users/entities/user.entity';
import { ChatService } from '../messaging/chat.service';
import { GroupRoleEnum, UserRoleEnum } from '../../common/enums';
import { neighbourhoodGroupRoleFor } from '../../common/group-role.util';
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

export interface NeighbourhoodPolygon {
  pg_id: string;
  name: string;
  city: string;
  zip_code: string;
  country: string;
  centroid: { latitude: number; longitude: number } | null;
  area_m2: number | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

@Injectable()
export class Neo4jGeoService {
  private readonly logger = new Logger(Neo4jGeoService.name);

  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly neighbourhoodService: NeighbourhoodService,
    private readonly chatService: ChatService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private toNumber(value: any): number | null {
    if (value === null || value === undefined) return null;
    return typeof value.toNumber === 'function'
      ? value.toNumber()
      : Number(value);
  }

  async assignNeighbourhood(
    lat: number,
    lng: number,
  ): Promise<NeighbourhoodAssignment | null> {
    const point = turf.point([lng, lat]);

    const query = `MATCH (n:Neighbourhood) RETURN n.pg_id AS pg_id, n.geometry AS geometry`;
    const result = await this.neo4jService.run(query, {});

    for (const record of result.records) {
      const pgId = record.get('pg_id');
      const geometryRaw = record.get('geometry');
      if (!geometryRaw) continue;
      try {
        const geometry =
          typeof geometryRaw === 'string'
            ? JSON.parse(geometryRaw)
            : geometryRaw;
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

  async listNeighbourhoodPolygons(): Promise<NeighbourhoodPolygon[]> {
    const query = `
      MATCH (n:Neighbourhood)
      RETURN 
        n.pg_id AS pg_id,
        n.name AS name,
        n.city AS city,
        n.zip_code AS zip_code,
        n.country AS country,
        n.centroid AS centroid,
        n.area_m2 AS area_m2,
        n.geometry AS geometry
      ORDER BY n.name ASC
    `;
    const result = await this.neo4jService.run(query, {});
    const items: NeighbourhoodPolygon[] = [];

    for (const record of result.records) {
      const geometryRaw = record.get('geometry');
      if (!geometryRaw) continue;
      try {
        const geometry =
          typeof geometryRaw === 'string'
            ? JSON.parse(geometryRaw)
            : geometryRaw;
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
          continue;
        }
        const centroid = record.get('centroid');
        const centroidValue = centroid
          ? {
              latitude: centroid.y ?? centroid.latitude,
              longitude: centroid.x ?? centroid.longitude,
            }
          : null;
        items.push({
          pg_id: record.get('pg_id'),
          name: record.get('name'),
          city: record.get('city'),
          zip_code: record.get('zip_code'),
          country: record.get('country'),
          centroid: centroidValue,
          area_m2: this.toNumber(record.get('area_m2')),
          geometry,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to parse geometry for neighbourhood ${record.get('pg_id')}`,
        );
      }
    }

    return items;
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

    // Reject duplicate pg_id
    const existsQuery = `MATCH (n:Neighbourhood {pg_id: $pgId}) RETURN n.pg_id AS id`;
    const existsResult = await this.neo4jService.run(existsQuery, {
      pgId: metadata.pg_id,
    });
    if (existsResult.records.length > 0) {
      throw new ConflictException(
        `A neighbourhood with pg_id "${metadata.pg_id}" already exists`,
      );
    }

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

    const result = await this.updateAdjacencies(
      metadata.pg_id,
      polygon,
      lat,
      lng,
      areaM2,
    );

    // Brand-new neighbourhood has no residents yet — seed the auto-managed
    // group with current staff only; residents join as they set their
    // neighbourhoodId (see UsersService.updateProfile).
    const staff = await this.userRepository.find({
      where: {
        role: In([UserRoleEnum.MODERATOR, UserRoleEnum.ADMIN]),
        deletedAt: IsNull(),
      },
      select: ['id'],
    });
    await this.chatService.ensureNeighbourhoodGroup(
      metadata.pg_id,
      metadata.name,
      staff.map((u) => ({ userId: u.id, role: GroupRoleEnum.ADMIN })),
    );

    return result;
  }

  /** (Re)crée le groupe de discussion du quartier et resynchronise tous ses membres (résidents + staff). Idempotent — sert de backfill/réparation. */
  async syncNeighbourhoodChatGroup(pgId: string) {
    const nb = await this.neighbourhoodService.findByPgId(pgId);
    if (!nb) throw new NotFoundException('Neighbourhood not found');

    const [residents, staff] = await Promise.all([
      this.userRepository.find({
        where: { neighbourhoodId: pgId, deletedAt: IsNull() },
      }),
      this.userRepository.find({
        where: {
          role: In([UserRoleEnum.MODERATOR, UserRoleEnum.ADMIN]),
          deletedAt: IsNull(),
        },
      }),
    ]);

    const residentIds = new Set(residents.map((u) => u.id));
    const members = [
      ...residents.map((u) => ({
        userId: u.id,
        role: neighbourhoodGroupRoleFor(u.role),
      })),
      ...staff
        .filter((u) => !residentIds.has(u.id))
        .map((u) => ({ userId: u.id, role: GroupRoleEnum.ADMIN })),
    ];

    return this.chatService.ensureNeighbourhoodGroup(pgId, nb.name, members);
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

  // ── Admin: Delete ───────────────────────────────────────

  /**
   * Deletes a neighbourhood. Blocked if any user still LIVES_IN it.
   */
  async deleteNeighbourhood(pgId: string): Promise<void> {
    const checkQuery = `
      MATCH (u:User)-[:LIVES_IN]->(n:Neighbourhood {pg_id: $pgId})
      RETURN count(u) > 0 AS hasResidents
    `;
    const checkResult = await this.neo4jService.run(checkQuery, { pgId });
    if (
      checkResult.records.length > 0 &&
      checkResult.records[0].get('hasResidents')
    ) {
      throw new ConflictException(
        'Cannot delete neighbourhood with active residents',
      );
    }

    const deleteQuery = `
      MATCH (n:Neighbourhood {pg_id: $pgId})
      DETACH DELETE n
    `;
    await this.neo4jService.run(deleteQuery, { pgId });
  }

  // ── Admin: Overlap check ────────────────────────────────

  /**
   * Checks a candidate geometry against all existing neighbourhoods.
   * Returns pg_ids of overlapping and adjacent neighbourhoods.
   * Adjacency uses a 0.001° tolerance per CDC §6.12.
   */
  async checkOverlap(
    candidate: GeoJSON.Polygon,
  ): Promise<{ overlapping: string[]; adjacent: string[] }> {
    this.validatePolygon(candidate);
    const candidateFeature = turf.polygon(candidate.coordinates);
    // Buffer for adjacency detection (0.001° ≈ ~111m at the equator)
    const buffered = turf.buffer(candidateFeature, 0.001, { units: 'degrees' });

    const query = `MATCH (n:Neighbourhood) RETURN n.pg_id AS pg_id, n.geometry AS geometry`;
    const result = await this.neo4jService.run(query, {});

    const overlapping: string[] = [];
    const adjacent: string[] = [];

    for (const record of result.records) {
      const pgId = record.get('pg_id');
      const geomStr = record.get('geometry');
      if (!geomStr) continue;

      try {
        const geom =
          typeof geomStr === 'string' ? JSON.parse(geomStr) : geomStr;
        if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') continue;

        const existingFeature = turf.polygon(
          geom.type === 'Polygon' ? geom.coordinates : geom.coordinates[0],
        );

        // True overlap: area intersection > 0
        if (turf.booleanIntersects(candidateFeature, existingFeature)) {
          try {
            const intersection = turf.intersect(
              turf.featureCollection([candidateFeature, existingFeature]),
            ) as any;
            if (intersection && turf.area(intersection) > 0) {
              overlapping.push(pgId);
              continue;
            }
          } catch {
            // intersect may throw on edge-touch geometries
          }
        }

        // Adjacent: touches the buffered polygon but does not overlap
        if (turf.booleanIntersects(buffered as any, existingFeature as any)) {
          adjacent.push(pgId);
        }
      } catch (e) {
        // ignore invalid geometries
      }
    }

    return { overlapping, adjacent };
  }

  // ── Admin: Update metadata + optional geometry ──────────

  /**
   * Updates neighbourhood metadata and optionally recomputes
   * centroid, area, and adjacencies when a new geometry is provided.
   */
  async updateNeighbourhood(
    pgId: string,
    updates: {
      name?: string;
      city?: string;
      zip_code?: string;
      country?: string;
      geometry?: GeoJSON.Polygon;
    },
  ): Promise<NeighbourhoodWithAdjacencies> {
    // Verify the neighbourhood exists
    const existsQuery = `MATCH (n:Neighbourhood {pg_id: $pgId}) RETURN n.pg_id AS id`;
    const existsResult = await this.neo4jService.run(existsQuery, { pgId });
    if (existsResult.records.length === 0) {
      throw new NotFoundException('Neighbourhood not found');
    }

    // Build SET clause from provided metadata fields
    const setParts: string[] = ['n.updated_at = datetime()'];
    const params: any = { pgId };

    if (updates.name !== undefined) {
      setParts.push('n.name = $name');
      params.name = updates.name;
    }
    if (updates.city !== undefined) {
      setParts.push('n.city = $city');
      params.city = updates.city;
    }
    if (updates.zip_code !== undefined) {
      setParts.push('n.zip_code = $zipCode');
      params.zipCode = updates.zip_code;
    }
    if (updates.country !== undefined) {
      setParts.push('n.country = $country');
      params.country = updates.country;
    }

    await this.neo4jService.run(
      `MATCH (n:Neighbourhood {pg_id: $pgId}) SET ${setParts.join(', ')}`,
      params,
    );

    // If geometry was provided, recompute centroid + area + adjacencies
    if (updates.geometry) {
      this.validatePolygon(updates.geometry);
      const centroidFeature = turf.centroid(updates.geometry);
      const [lng, lat] = centroidFeature.geometry.coordinates;
      const areaM2 = turf.area(updates.geometry);
      const geomStr = JSON.stringify(updates.geometry);

      await this.neo4jService.run(
        `MATCH (n:Neighbourhood {pg_id: $pgId})
         SET n.centroid = point({latitude: $lat, longitude: $lng, crs: 'WGS-84'}),
             n.geometry = $geometry,
             n.area_m2 = $area`,
        { pgId, lat, lng, geometry: geomStr, area: areaM2 },
      );

      // Recompute adjacencies
      await this.neo4jService.run(
        `MATCH (n:Neighbourhood {pg_id: $pgId})-[r:ADJACENT_TO]-() DELETE r`,
        { pgId },
      );

      return this.updateAdjacencies(pgId, updates.geometry, lat, lng, areaM2);
    }

    // No geometry change — return current state
    const centroidQuery = `
      MATCH (n:Neighbourhood {pg_id: $pgId})
      RETURN n.centroid AS centroid, n.area_m2 AS area
    `;
    const centroidResult = await this.neo4jService.run(centroidQuery, { pgId });
    const rec = centroidResult.records[0];
    const centroid = rec?.get('centroid');
    const area = this.toNumber(rec?.get('area')) ?? null;

    const adjQuery = `
      MATCH (n:Neighbourhood {pg_id: $pgId})-[:ADJACENT_TO]-(adj:Neighbourhood)
      RETURN collect(adj.pg_id) AS adjacentIds
    `;
    const adjResult = await this.neo4jService.run(adjQuery, { pgId });
    const adjacentIds: string[] =
      adjResult.records[0]?.get('adjacentIds') ?? [];

    return {
      pg_id: pgId,
      centroid: centroid
        ? {
            latitude: centroid.y ?? centroid.latitude,
            longitude: centroid.x ?? centroid.longitude,
          }
        : { latitude: 0, longitude: 0 },
      area_m2: area ?? 0,
      adjacent_pg_ids: adjacentIds,
    };
  }
}
