import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventRegisterJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { Evenement } from '../../modules/events/entities/evenement.entity';
import { EventParticipant } from '../../modules/events/entities/event-participant.entity';
import { EventsGateway } from '../../modules/events/events.gateway';
import { EventStatusEnum, ParticipantStatusEnum } from '../../common/enums';

@Processor('event-register', {
  concurrency: 10,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('event-register', attemptsMade)
        : 1000;
    },
  },
})
export class EventRegisterWorker extends WorkerHost {
  private readonly logger = new Logger(EventRegisterWorker.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<EventRegisterJobPayload>): Promise<any> {
    try {
      const { eventId, userId } = job.data;

      await this.dataSource.transaction(async (manager) => {
        const event = await manager.findOne(Evenement, {
          where: { id: eventId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!event) {
          throw new UnrecoverableError(`Event ${eventId} not found`);
        }

        if (event.status !== EventStatusEnum.OPEN) {
          throw new UnrecoverableError(
            `Event ${eventId} is not open for registration (status: ${event.status})`,
          );
        }

        const participantCount = await manager.count(EventParticipant, {
          where: { eventId, status: ParticipantStatusEnum.REGISTERED },
        });

        if (
          event.maxParticipants &&
          participantCount >= event.maxParticipants
        ) {
          this.eventsGateway.emitRegistrationFailed(
            eventId,
            userId,
            'EVENT_FULL',
          );
          throw new UnrecoverableError(`Event ${eventId} is full`);
        }

        const existing = await manager.findOne(EventParticipant, {
          where: { eventId, userId },
        });

        if (existing) {
          if (existing.status === ParticipantStatusEnum.REGISTERED) {
            throw new UnrecoverableError(
              `User ${userId} already registered for event ${eventId}`,
            );
          } else {
            existing.status = ParticipantStatusEnum.REGISTERED;
            await manager.save(existing);
          }
        } else {
          const participant = manager.create(EventParticipant, {
            eventId,
            userId,
            status: ParticipantStatusEnum.REGISTERED,
          });
          await manager.save(participant);
        }
      });

      this.eventsGateway.emitParticipantAdded(
        job.data.eventId,
        job.data.userId,
      );
    } catch (error: any) {
      if (error instanceof UnrecoverableError) {
        throw error;
      }
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EventRegisterJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'event-register',
        eventId: job.data?.eventId,
        userId: job.data?.userId,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
