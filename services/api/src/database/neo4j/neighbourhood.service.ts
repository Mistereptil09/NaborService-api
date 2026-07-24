import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Neo4jService } from './neo4j.service';
import {
  UpsertNeighbourhoodDto,
  NeighbourhoodWithAdjacencies,
  NearbyNeighbourhood,
} from './interfaces/neighbourhood.interfaces';

@Injectable()
export class NeighbourhoodService {
  constructor(private readonly neo4jService: Neo4jService) {}

  private toNum(val: any): number {
    if (val === null || val === undefined) return 0;
    return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  }

  async upsert(data: UpsertNeighbourhoodDto): Promise<void> {
    const cypher = `
      MERGE (n:Neighbourhood { pg_id: $pgId })
      ON CREATE SET 
        n.name = $name,
        n.city = $city,
        n.zip_code = $zipCode,
        n.country = $country,
        n.centroid = point({latitude: $latitude, longitude: $longitude, crs: 'wgs-84'}),
        n.geometry = $geometry,
        n.area_m2 = $areaM2,
        n.created_at = datetime(),
        n.updated_at = datetime()
      ON MATCH SET 
        n.name = $name,
        n.city = $city,
        n.zip_code = $zipCode,
        n.country = $country,
        n.centroid = point({latitude: $latitude, longitude: $longitude, crs: 'wgs-84'}),
        n.geometry = $geometry,
        n.area_m2 = $areaM2,
        n.updated_at = datetime()
    `;
    await this.neo4jService.run(cypher, {
      pgId: data.pgId,
      name: data.name,
      city: data.city,
      zipCode: data.zipCode,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      geometry: data.geometry,
      areaM2: data.areaM2,
    });
  }

  async findByPgId(pgId: string): Promise<NeighbourhoodWithAdjacencies | null> {
    const cypher = `
      MATCH (n:Neighbourhood { pg_id: $pgId })
      OPTIONAL MATCH (n)-[:ADJACENT_TO]-(adj:Neighbourhood)
      RETURN n, collect(adj.pg_id) as adjacentIds
    `;
    const result = await this.neo4jService.run(cypher, { pgId });
    if (result.records.length === 0) return null;

    const record = result.records[0];
    const node = record.get('n');
    const properties = node.properties;
    const adjacentIds = record.get('adjacentIds') as string[];

    const centroidPoint = properties.centroid;
    const latitude = centroidPoint
      ? centroidPoint.y || centroidPoint.latitude
      : 0;
    const longitude = centroidPoint
      ? centroidPoint.x || centroidPoint.longitude
      : 0;

    return {
      pgId: properties.pg_id,
      name: properties.name,
      city: properties.city,
      zipCode: properties.zip_code,
      country: properties.country,
      centroid: { latitude, longitude },
      geometry: properties.geometry,
      areaM2: this.toNum(properties.area_m2),
      createdAt: new Date(properties.created_at.toString()),
      updatedAt: new Date(properties.updated_at.toString()),
      adjacentIds: adjacentIds.filter(Boolean),
    };
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<NearbyNeighbourhood[]> {
    const cypher = `
      WITH point({latitude: $lat, longitude: $lng, crs: 'wgs-84'}) as queryPoint
      MATCH (n:Neighbourhood)
      WHERE point.distance(n.centroid, queryPoint) <= $radiusMeters
      RETURN n.pg_id as pgId, n.name as name, n.city as city, point.distance(n.centroid, queryPoint) as distanceMeters
      ORDER BY distanceMeters ASC
      LIMIT 5
    `;
    const result = await this.neo4jService.run(cypher, {
      lat,
      lng,
      radiusMeters,
    });
    return result.records.map((record) => ({
      pgId: record.get('pgId') as string,
      name: record.get('name') as string,
      city: record.get('city') as string,
      distanceMeters: this.toNum(record.get('distanceMeters')),
    }));
  }

  async findAll(): Promise<
    {
      pgId: string;
      name: string;
      city: string;
      zipCode: string;
      country: string;
    }[]
  > {
    const cypher = `
      MATCH (n:Neighbourhood)
      RETURN n.pg_id AS pgId, n.name AS name, n.city AS city, n.zip_code AS zipCode, n.country AS country
      ORDER BY n.name ASC
    `;
    const result = await this.neo4jService.run(cypher);
    return result.records.map((r) => ({
      pgId: r.get('pgId') as string,
      name: r.get('name') as string,
      city: r.get('city') as string,
      zipCode: r.get('zipCode') as string,
      country: r.get('country') as string,
    }));
  }

  async findMembers(
    pgId: string,
  ): Promise<{ pgId: string; visibility: string }[]> {
    const cypher = `
      MATCH (u:User)-[:LIVES_IN]->(n:Neighbourhood {pg_id: $pgId})
      WHERE u.deleted_at IS NULL
      RETURN u.pg_id AS pgId, u.visibility AS visibility
      ORDER BY u.pg_id ASC
    `;
    const result = await this.neo4jService.run(cypher, { pgId });
    return result.records.map((r) => ({
      pgId: r.get('pgId') as string,
      visibility: (r.get('visibility') as string) ?? 'public',
    }));
  }

  async delete(pgId: string): Promise<void> {
    const checkCypher = `
      MATCH (n:Neighbourhood { pg_id: $pgId })
      OPTIONAL MATCH (u:User)-[:LIVES_IN]->(n)
      RETURN count(u) as residentCount
    `;
    const checkResult = await this.neo4jService.run(checkCypher, { pgId });
    if (checkResult.records.length === 0) {
      throw new NotFoundException(`Neighbourhood with ID ${pgId} not found`);
    }

    const residentCount = this.toNum(
      checkResult.records[0].get('residentCount'),
    );
    if (residentCount > 0) {
      throw new ConflictException(
        `Neighbourhood has ${residentCount} active residents and cannot be deleted`,
      );
    }

    const deleteCypher = `
      MATCH (n:Neighbourhood { pg_id: $pgId })
      DETACH DELETE n
    `;
    await this.neo4jService.run(deleteCypher, { pgId });
  }

  async replaceAdjacencies(
    pgId: string,
    adjacentPgIds: string[],
  ): Promise<void> {
    await this.neo4jService.runInTransaction(async (tx) => {
      const existResult = await tx.run(
        'MATCH (n:Neighbourhood { pg_id: $pgId }) RETURN n',
        { pgId },
      );
      if (existResult.records.length === 0) {
        throw new NotFoundException(`Neighbourhood with ID ${pgId} not found`);
      }

      await tx.run(
        'MATCH (n:Neighbourhood { pg_id: $pgId })-[r:ADJACENT_TO]-() DELETE r',
        { pgId },
      );

      if (adjacentPgIds && adjacentPgIds.length > 0) {
        await tx.run(
          `
          UNWIND $adjacentPgIds as adjId
          MATCH (n:Neighbourhood { pg_id: $pgId }), (adj:Neighbourhood { pg_id: adjId })
          MERGE (n)-[:ADJACENT_TO]->(adj)
          `,
          { pgId, adjacentPgIds },
        );
      }
    });
  }
}
