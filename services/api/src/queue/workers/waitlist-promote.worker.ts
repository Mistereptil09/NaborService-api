import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WaitlistPromoteJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { Evenement } from '../../modules/events/entities/evenement.entity';
import { EventParticipant } from '../../modules/events/entities/event-participant.entity';
import { EventsGateway } from '../../modules/events/events.gateway';
import { EventStatusEnum, ParticipantStatusEnum } from '../../common/enums';
import { NotificationsService } from '../../modules/messaging/notifications.service';

@Processor('waitlist-promote', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('waitlist-promote', attemptsMade)
        : 1000;
    },
  },
})
export class WaitlistPromoteWorker extends WorkerHost {
  private readonly logger = new Logger(WaitlistPromoteWorker.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<WaitlistPromoteJobPayload>): Promise<any> {
    try {
      const { eventId } = job.data;

      await this.dataSource.transaction(async (manager) => {
        const event = await manager.findOne(Evenement, {
          where: { id: eventId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!event) {
          throw new UnrecoverableError(`Event ${eventId} not found`);
        }

        if (event.status !== EventStatusEnum.OPEN || !event.maxParticipants) {
          return;
        }

        const participantCount = await manager.count(EventParticipant, {
          where: { eventId, status: ParticipantStatusEnum.REGISTERED },
        });

        const spotsAvailable = event.maxParticipants - participantCount;
        if (spotsAvailable <= 0) {
          return;
        }

        const waitlistedParticipants = await manager.find(EventParticipant, {
          where: { eventId, status: ParticipantStatusEnum.WAITLISTED },
          order: { registeredAt: 'ASC' },
          take: spotsAvailable,
          relations: ['user'],
        });

        if (waitlistedParticipants.length === 0) {
          return;
        }

        for (const participant of waitlistedParticipants) {
          participant.status = ParticipantStatusEnum.REGISTERED;
          participant.promotedAt = new Date();
          await manager.save(participant);

          try {
            await this.notificationsService.create({
              userId: participant.userId,
              type: 'waitlist_place',
              payload: {
                eventTitle: event.title,
                eventId: event.id,
                firstName: participant.user.firstName,
              },
            });
          } catch (error: any) {
            this.logger.warn(
              `waitlist_place notification failed for ${participant.userId}: ${error?.message ?? error}`,
            );
          }

          this.eventsGateway.emitParticipantAdded(eventId, participant.userId);
        }
      });
    } catch (error: any) {
      if (error instanceof UnrecoverableError) {
        throw error;
      }
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WaitlistPromoteJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'waitlist-promote',
        eventId: job.data?.eventId,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
