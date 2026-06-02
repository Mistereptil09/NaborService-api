import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import neo4j, {
  Driver,
  QueryResult,
  ManagedTransaction,
  RecordShape,
} from 'neo4j-driver';
import { NEO4J_DRIVER, TRANSIENT_ERROR_CODES } from './neo4j.constants';

@Injectable()
export class Neo4jService implements OnModuleDestroy {
  constructor(
    @Inject(NEO4J_DRIVER)
    private readonly driver: Driver,
  ) {}

  async onModuleDestroy() {
    await this.driver.close();
  }

  /**
   * Helper to check if an error is transient (connection/session-related)
   */
  private isTransientError(err: any): boolean {
    if (!err) return false;
    const code = err.code || err.name;
    if (typeof code === 'string') {
      if (code.startsWith('Neo.TransientError.')) return true;
      if (TRANSIENT_ERROR_CODES.includes(code)) return true;
    }
    const message = err.message || '';
    if (
      message.includes('ServiceUnavailable') ||
      message.includes('SessionExpired')
    ) {
      return true;
    }
    return false;
  }

  /**
   * Execute work with exponential backoff retry logic (1s, 5s, 30s)
   */
  private async retryWithBackoff<T>(work: () => Promise<T>): Promise<T> {
    const delays = [1000, 5000, 30000];
    let attempt = 0;

    while (true) {
      try {
        return await work();
      } catch (err) {
        if (this.isTransientError(err) && attempt < delays.length) {
          const delay = delays[attempt];
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Execute a single Cypher query. Opens/closes session automatically.
   */
  async run<T extends RecordShape = RecordShape>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    return this.retryWithBackoff(async () => {
      const session = this.driver.session();
      try {
        return await session.run(cypher, params);
      } finally {
        await session.close();
      }
    });
  }

  /**
   * Execute work within a managed transaction.
   */
  async runInTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
  ): Promise<T> {
    return this.retryWithBackoff(async () => {
      const session = this.driver.session();
      try {
        return await session.executeWrite((tx) => work(tx));
      } finally {
        await session.close();
      }
    });
  }
}
