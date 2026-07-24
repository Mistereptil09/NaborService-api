import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { NEO4J_DRIVER } from '../../database/neo4j/neo4j.constants';
import { Driver } from 'neo4j-driver';

export type Neo4jHealthState = 'healthy' | 'degraded' | 'down';

@Injectable()
export class Neo4jHealthService implements OnModuleInit {
  private readonly logger = new Logger(Neo4jHealthService.name);
  private state: Neo4jHealthState = 'healthy';
  private consecutiveFailures = 0;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  private readonly failureThreshold = 5;

  private readonly probeIntervalMs = 60_000;

  constructor(@Inject(NEO4J_DRIVER) private readonly driver: Driver) {}

  onModuleInit() {
    this.probeConnectivity().catch(() => {
      this.logger.warn('Neo4j not available at startup — marking degraded');
      this.state = 'degraded';
    });
  }

  isHealthy(): boolean {
    return this.state === 'healthy' || this.state === 'degraded';
  }

  getState(): Neo4jHealthState {
    return this.state;
  }

  recordFailure(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.failureThreshold) {
      if (this.state !== 'down') {
        this.state = 'down';
        this.logger.error(
          `Neo4j marked DOWN after ${this.consecutiveFailures} consecutive sync failures. ` +
            'Sync jobs will be skipped until Neo4j recovers. Reconciliation will catch up.',
        );
        this.startProbing();
      }
    } else if (this.state === 'healthy') {
      this.state = 'degraded';
      this.logger.warn(
        `Neo4j marked DEGRADED after ${this.consecutiveFailures} consecutive sync failures.`,
      );
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state !== 'healthy') {
      this.state = 'healthy';
      this.stopProbing();
      this.logger.log('Neo4j recovered — marked HEALTHY.');
    }
  }

  private startProbing(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(
      () => this.probeConnectivity(),
      this.probeIntervalMs,
    );
  }

  private stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async probeConnectivity(): Promise<void> {
    try {
      await this.driver.verifyConnectivity();
      if (this.state === 'down') {
        this.recordSuccess();
      }
    } catch {
      // Still down — keep probing
    }
  }
}
