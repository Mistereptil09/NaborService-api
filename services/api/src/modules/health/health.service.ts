import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import type { Driver } from 'neo4j-driver';
import { NEO4J_DRIVER } from '../../database/neo4j/neo4j.constants';
import { REDIS_CLIENT } from '../../database/redis.module';

export interface ServiceStatus {
  status: 'up' | 'down';
  dependency: 'hard' | 'soft';
  latency_ms?: number;
  error?: string;
}

export type ReadinessStatus = 'ok' | 'degraded' | 'critical';

export interface ReadinessResponse {
  status: ReadinessStatus;
  timestamp: string;
  uptime: number;
  services: {
    postgresql: ServiceStatus;
    mongodb: ServiceStatus;
    neo4j: ServiceStatus;
    redis: ServiceStatus;
  };
}

/** Services required for the server to function. Down = critical. */
const SOFT_DEPS = new Set(['mongodb', 'neo4j']);

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongoConnection: Connection,
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  async checkReadiness(): Promise<ReadinessResponse> {
    const [postgresql, mongodb, neo4jStatus, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkMongo(),
      this.checkNeo4j(),
      this.checkRedis(),
    ]);

    const services = { postgresql, mongodb, neo4j: neo4jStatus, redis };
    const downServices = Object.entries(services).filter(
      ([, s]) => s.status === 'down',
    );

    let status: ReadinessStatus;
    if (downServices.length === 0) {
      status = 'ok';
    } else if (downServices.every(([name]) => SOFT_DEPS.has(name))) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };
  }

  private async checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', dependency: 'hard', latency_ms: Date.now() - start };
    } catch (error: any) {
      this.logger.error(`PostgreSQL health check failed: ${error.message}`);
      return { status: 'down', dependency: 'hard', error: error.message };
    }
  }

  private async checkMongo(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (!this.mongoConnection || this.mongoConnection.readyState !== 1) {
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        const stateName = this.mongoConnection
          ? states[this.mongoConnection.readyState] ?? 'unknown'
          : 'no connection';
        return { status: 'down', dependency: 'soft', error: `MongoDB not connected (state: ${stateName})` };
      }
      const db = this.mongoConnection.db;
      if (!db) {
        return { status: 'down', dependency: 'soft', error: 'MongoDB connection established but db handle is undefined' };
      }
      await db.admin().ping();
      return { status: 'up', dependency: 'soft', latency_ms: Date.now() - start };
    } catch (error: any) {
      this.logger.error(`MongoDB health check failed: ${error.message}`);
      return { status: 'down', dependency: 'soft', error: error.message };
    }
  }

  private async checkNeo4j(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.neo4jDriver.verifyConnectivity();
      return { status: 'up', dependency: 'soft', latency_ms: Date.now() - start };
    } catch (error: any) {
      this.logger.error(`Neo4j health check failed: ${error.message}`);
      return { status: 'down', dependency: 'soft', error: error.message };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (this.redisClient.status !== 'ready') {
        return { status: 'down', dependency: 'hard', error: `Redis not ready (status: ${this.redisClient.status})` };
      }
      await this.redisClient.ping();
      return { status: 'up', dependency: 'hard', latency_ms: Date.now() - start };
    } catch (error: any) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return { status: 'down', dependency: 'hard', error: error.message };
    }
  }
}
