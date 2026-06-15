import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { NEO4J_DRIVER } from '../../database/neo4j/neo4j.constants';
import { Driver } from 'neo4j-driver';

export type Neo4jHealthState = 'healthy' | 'degraded' | 'down';

/**
 * Circuit breaker for Neo4j.
 *
 * Tracks consecutive sync job failures. After a threshold, marks Neo4j as
 * "down" so that services stop enqueuing doomed sync jobs. Probes Neo4j
 * periodically when down, and resets to "healthy" when connectivity returns.
 */
@Injectable()
export class Neo4jHealthService implements OnModuleInit {
  private readonly logger = new Logger(Neo4jHealthService.name);
  private state: Neo4jHealthState = 'healthy';
  private consecutiveFailures = 0;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  /** Number of consecutive failures before marking Neo4j as down. */
  private readonly failureThreshold = 5;

  /** Delay between probes when down (ms). */
  private readonly probeIntervalMs = 60_000;

  constructor(
    @Inject(NEO4J_DRIVER) private readonly driver: Driver,
  ) {}

  onModuleInit() {
    // Proactively verify connectivity at startup
    this.probeConnectivity().catch(() => {
      this.logger.warn('Neo4j not available at startup — marking degraded');
      this.state = 'degraded';
    });
  }

  // ── Public API ───────────────────────────────────────────────

  /** Whether services should enqueue neo4j-sync jobs. */
  isHealthy(): boolean {
    return this.state === 'healthy' || this.state === 'degraded';
  }

  /** Current health state. */
  getState(): Neo4jHealthState {
    return this.state;
  }

  /** Called by the Neo4jSyncWorker when a job fails. */
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

  /** Called by the Neo4jSyncWorker when a job succeeds. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state !== 'healthy') {
      this.state = 'healthy';
      this.stopProbing();
      this.logger.log('Neo4j recovered — marked HEALTHY.');
    }
  }

  // ── Probing ──────────────────────────────────────────────────

  private startProbing(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(() => this.probeConnectivity(), this.probeIntervalMs);
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
