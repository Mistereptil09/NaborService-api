import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export type MongoHealthState = 'healthy' | 'degraded' | 'down';

/**
 * Tracks MongoDB health via Mongoose connection events.
 *
 * When MongoDB goes down, services that depend on it (media, chat,
 * contracts, tickets) should check isHealthy() before attempting
 * operations and return a graceful error instead of crashing.
 */
@Injectable()
export class MongoHealthService implements OnModuleInit {
  private readonly logger = new Logger(MongoHealthService.name);
  private state: MongoHealthState = 'healthy';
  private consecutiveErrors = 0;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  private readonly errorThreshold = 5;
  private readonly probeIntervalMs = 60_000;

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  onModuleInit() {
    // Mongoose connection events
    this.connection.on('connected', () => this.onConnect());
    this.connection.on('disconnected', () => this.onDisconnect());
    this.connection.on('error', () => this.onError());

    // Check initial state
    if (this.connection.readyState !== 1) {
      this.state = 'degraded';
      this.logger.warn('MongoDB not connected at startup — marked DEGRADED');
    }
  }

  // ── Public API ───────────────────────────────────────────────

  isHealthy(): boolean {
    return this.state === 'healthy' || this.state === 'degraded';
  }

  getState(): MongoHealthState {
    return this.state;
  }

  // ── Event handlers ───────────────────────────────────────────

  private onConnect() {
    this.consecutiveErrors = 0;
    if (this.state !== 'healthy') {
      this.state = 'healthy';
      this.stopProbing();
      this.logger.log('MongoDB recovered — marked HEALTHY.');
    }
  }

  private onDisconnect() {
    this.state = 'degraded';
    this.logger.warn('MongoDB disconnected — marked DEGRADED.');
  }

  private onError() {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.errorThreshold && this.state !== 'down') {
      this.state = 'down';
      this.logger.error(
        `MongoDB marked DOWN after ${this.consecutiveErrors} consecutive errors. ` +
        'MongoDB-dependent features (media, chat, contracts) will return 503 until recovery.',
      );
      this.startProbing();
    } else if (this.state === 'healthy') {
      this.state = 'degraded';
    }
  }

  // ── Probing ──────────────────────────────────────────────────

  private startProbing(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(() => this.probe(), this.probeIntervalMs);
  }

  private stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async probe(): Promise<void> {
    try {
      const admin = this.connection.db?.admin();
      if (admin) {
        await admin.ping();
        // If we get here, MongoDB is back — Mongoose will emit 'connected'
        this.onConnect();
      }
    } catch {
      // Still down — keep probing
    }
  }
}
