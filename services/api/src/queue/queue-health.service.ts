import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueMetrics, QueueHealthResponse } from './interfaces/queue-health.interfaces';

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);
  private readonly queues: Map<string, Queue> = new Map();

  constructor(
    @InjectQueue('neo4j-sync') neo4jSyncQueue: Queue,
    @InjectQueue('email') emailQueue: Queue,
    @InjectQueue('pdf-generation') pdfGenerationQueue: Queue,
    @InjectQueue('stripe-webhook') stripeWebhookQueue: Queue,
    @InjectQueue('waitlist-promote') waitlistPromoteQueue: Queue,
    @InjectQueue('rgpd-anonymise') rgpdAnonymiseQueue: Queue,
    @InjectQueue('crypto-rotation') cryptoRotationQueue: Queue,
    @InjectQueue('event-register') eventRegisterQueue: Queue,
    @InjectQueue('contract-expiration') contractExpirationQueue: Queue,
  ) {
    this.queues.set('neo4j-sync', neo4jSyncQueue);
    this.queues.set('email', emailQueue);
    this.queues.set('pdf-generation', pdfGenerationQueue);
    this.queues.set('stripe-webhook', stripeWebhookQueue);
    this.queues.set('waitlist-promote', waitlistPromoteQueue);
    this.queues.set('rgpd-anonymise', rgpdAnonymiseQueue);
    this.queues.set('crypto-rotation', cryptoRotationQueue);
    this.queues.set('event-register', eventRegisterQueue);
    this.queues.set('contract-expiration', contractExpirationQueue);
  }

  async getMetrics(): Promise<QueueHealthResponse> {
    try {
      const queueMetrics: Record<string, QueueMetrics> = {};
      
      const promises = Array.from(this.queues.entries()).map(async ([name, queue]) => {
        const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
        queueMetrics[name] = {
          active: counts.active || 0,
          waiting: counts.waiting || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
        };
      });

      await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000)),
      ]);

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        queues: queueMetrics,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve queue metrics', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Metrics temporarily unavailable',
      };
    }
  }
}
