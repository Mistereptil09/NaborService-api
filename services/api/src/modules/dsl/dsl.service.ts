import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Repository } from 'typeorm';
import { DslQuery } from './dsl-query.entity';

export interface DslParseResult {
  collection: string;
  filter: Record<string, unknown>;
  order: Record<string, unknown> | null;
  limit: number;
  projection: Record<string, number>;
}

export interface DslAuditEntry {
  id: string;
  userId: string;
  userRole: string;
  query: string;
  collection: string;
  filter: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  limit: number;
  resultCount: number | null;
  hasError: boolean;
  errorMessage: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

@Injectable()
export class DslService {
  private readonly logger = new Logger(DslService.name);
  private readonly dslUrl: string;

  constructor(
    @InjectRepository(DslQuery)
    private readonly dslQueryRepository: Repository<DslQuery>,
    private readonly configService: ConfigService,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {
    this.dslUrl =
      this.configService.get<string>('DSL_SERVICE_URL') ||
      'http://dsl-service:8000';
  }

  async parseQuery(query: string): Promise<DslParseResult> {
    try {
      const response = await fetch(`${this.dslUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const body = await response.json();

      if (response.status === 400) {
        throw new BadRequestException(body.detail || 'Requête DSL invalide');
      }

      if (response.status === 403) {
        throw new ForbiddenException(body.detail || 'Collection non autorisée');
      }

      if (!response.ok) {
        throw new InternalServerErrorException(
          `DSL service error: ${response.status}`,
        );
      }

      return body as DslParseResult;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      this.logger.error(
        `DSL service unavailable: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Service DSL indisponible',
      );
    }
  }

  async executeQuery(query: string): Promise<{
    collection: string;
    filter: Record<string, unknown>;
    order: Record<string, unknown> | null;
    limit: number;
    projection: Record<string, number>;
    resultCount: number;
    results: unknown[];
  }> {
    const parsed = await this.parseQuery(query);

    const db = this.mongoConnection.db;
    if (!db) {
      throw new InternalServerErrorException('MongoDB not connected');
    }

    const cursor = db
      .collection(parsed.collection)
      .find(parsed.filter, { projection: parsed.projection })
      .limit(parsed.limit);

    if (parsed.order) {
      cursor.sort(parsed.order as Record<string, 1 | -1>);
    }

    const results = await cursor.toArray();
    const resultCount = results.length;

    return {
      ...parsed,
      resultCount,
      results,
    };
  }

  async logQuery(params: {
    userId: string;
    userRole: string;
    query: string;
    collection: string;
    filter: Record<string, unknown> | null;
    order: Record<string, unknown> | null;
    limit: number;
    resultCount: number | null;
    hasError: boolean;
    errorMessage: string | null;
    ipAddress: string | null;
  }): Promise<void> {
    try {
      const entry = this.dslQueryRepository.create(params);
      await this.dslQueryRepository.save(entry);
    } catch (error) {
      // Non-bloquant : le log d'audit ne doit pas faire échouer la requête
      this.logger.error(
        `Failed to log DSL query: ${(error as Error).message}`,
      );
    }
  }

  async getAuditHistory(
    offset: number = 0,
    limit: number = 50,
  ): Promise<{ entries: DslAuditEntry[]; total: number }> {
    const [entries, total] = await this.dslQueryRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: Math.min(limit, 100),
    });

    return { entries, total };
  }
}
