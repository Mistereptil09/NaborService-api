import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

  /**
   * Create or update a Neighbourhood node
   */
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

  /**
   * Retrieve a Neighbourhood node and its adjacent IDs
   */
  async findByPgId(pgId: string): Promise<NeighbourhoodWithAdjacencies | null> {
    const cypher = `
      MATCH (n:Neighbourhood { pg_id: $pgId })
      OPTIONAL MATCH (n)-[:ADJACENT_TO]-(adj:Neighbourhood)
      RETURN n, collect(adj.pg_id) as adjacentIds
    `;
    const result = await this.neo4jService.run(cypher, { pgId });
    if (result.records.length === 0) return null;

    const record = result.records[0];
    const node = record.get('n') as any;
    const properties = node.properties;
    const adjacentIds = record.get('adjacentIds') as string[];

    const centroidPoint = properties.centroid;
    const latitude = centroidPoint ? centroidPoint.y || centroidPoint.latitude : 0;
    const longitude = centroidPoint ? centroidPoint.x || centroidPoint.longitude : 0;

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

  /**
   * Proximity centroid query return up to 5 Neighbourhood nodes within a radius
   */
  async findNearby(lat: number, lng: number, radiusMeters: number): Promise<NearbyNeighbourhood[]> {
    const cypher = `
      WITH point({latitude: $lat, longitude: $lng, crs: 'wgs-84'}) as queryPoint
      MATCH (n:Neighbourhood)
      WHERE point.distance(n.centroid, queryPoint) <= $radiusMeters
      RETURN n.pg_id as pgId, n.name as name, n.city as city, point.distance(n.centroid, queryPoint) as distanceMeters
      ORDER BY distanceMeters ASC
      LIMIT 5
    `;
    const result = await this.neo4jService.run(cypher, { lat, lng, radiusMeters });
    return result.records.map(record => ({
      pgId: record.get('pgId') as string,
      name: record.get('name') as string,
      city: record.get('city') as string,
      distanceMeters: this.toNum(record.get('distanceMeters')),
    }));
  }

  /**
   * Delete a Neighbourhood node only when safe (no active residents)
   */
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

    const residentCount = this.toNum(checkResult.records[0].get('residentCount'));
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

  /**
   * Replace ADJACENT_TO relations for the Neighbourhood atomically within a single transaction
   */
  async replaceAdjacencies(pgId: string, adjacentPgIds: string[]): Promise<void> {
    await this.neo4jService.runInTransaction(async (tx) => {
      // 1. Verify existence
      const existResult = await tx.run(
        'MATCH (n:Neighbourhood { pg_id: $pgId }) RETURN n',
        { pgId },
      );
      if (existResult.records.length === 0) {
        throw new NotFoundException(`Neighbourhood with ID ${pgId} not found`);
      }

      // 2. Delete existing adjacencies
      await tx.run(
        'MATCH (n:Neighbourhood { pg_id: $pgId })-[r:ADJACENT_TO]-() DELETE r',
        { pgId },
      );

      // 3. Create new adjacencies
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
