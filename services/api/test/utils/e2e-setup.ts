import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

export async function createTestingApp(): Promise<INestApplication> {
  if (process.env.POSTGRES_DB !== 'nabor_db_test') {
    console.warn(
      'Warning: Tests are not running against nabor_db_test. Wiping dev DB!',
    );
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('v1');

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

export async function clearDatabase(app: INestApplication) {
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;

  const tableNames = entities
    .map((entity) => `"${entity.tableName}"`)
    .join(', ');
  if (tableNames.length > 0) {
    await dataSource.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
  }
}

export async function clearQueues(app: INestApplication) {
  const queues = [
    'neo4j-sync',
    'email',
    'pdf-generation',
    'stripe-webhook',
    'waitlist-promote',
    'rgpd-anonymise',
    'crypto-rotation',
    'event-register',
    'contract-expiration',
  ];
  for (const queueName of queues) {
    try {
      const queue = app.get<Queue>(getQueueToken(queueName), { strict: false });
      if (queue) {
        await queue.drain(true);
      }
    } catch {
      // Ignore if queue not found
    }
  }
}

export async function clearRedis(app: INestApplication) {
  try {
    await clearQueues(app);
    const redis = app.get('REDIS_CLIENT', { strict: false });
    if (!redis || typeof redis.keys !== 'function') return;

    const patterns = ['ratelimit:*', 'totp:*', 'refresh:*', 'sso:*', 'reset:*'];

    for (const pattern of patterns) {
      const keys: string[] = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch {
    // Ignore if Redis client not found
  }
}

export async function waitForQueueJob(
  app: INestApplication,
  queueName: string,
  jobId: string,
  timeoutMs = 5000,
): Promise<Job | undefined> {
  const queue = app.get<Queue>(getQueueToken(queueName), { strict: false });
  if (!queue) return undefined;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await queue.getJob(jobId);
    if (job && (await job.isCompleted())) {
      return job;
    }
    if (job && (await job.isFailed())) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return queue.getJob(jobId);
}

export async function clearQueueJobs(app: INestApplication) {
  const queues = [
    'neo4j-sync',
    'email',
    'pdf-generation',
    'stripe-webhook',
    'waitlist-promote',
    'rgpd-anonymise',
    'crypto-rotation',
    'event-register',
    'contract-expiration',
  ];
  for (const queueName of queues) {
    try {
      const queue = app.get<Queue>(getQueueToken(queueName), { strict: false });
      if (queue) {
        await queue.clean(0, 100, 'failed');
        await queue.clean(0, 100, 'completed');
        await queue.drain(true);
      }
    } catch {
      // Ignore
    }
  }
}
