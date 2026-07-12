import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CallTimeoutJobPayload } from '../../../queue/interfaces/job-payloads';
import { classifyAndThrow } from '../../../queue/utils/error-classifier';
import { getBackoffDelay } from '../../../queue/utils/backoff-strategy';
import { CallsService } from '../calls.service';

@Processor('call-timeout', {
  concurrency: 5,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('call-timeout', attemptsMade)
        : 1000;
    },
  },
})
export class CallTimeoutWorker extends WorkerHost {
  constructor(private readonly callsService: CallsService) {
    super();
  }

  async process(job: Job<CallTimeoutJobPayload>): Promise<void> {
    try {
      await this.callsService.handleRingingTimeout(job.data.callId);
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }
}
