import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';

const parseConcurrency = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NOTIFICATIONS_CONCURRENCY = parseConcurrency(
  process.env.NOTIFICATIONS_WORKER_CONCURRENCY,
  2,
);

@Injectable()
@Processor('notifications', { concurrency: NOTIFICATIONS_CONCURRENCY })
export class NotificationsConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(
    job: Job<{ messageId?: string; overrideEmail?: string }>,
  ): Promise<void> {
    if (job.name !== 'send') {
      this.logger.debug(`Ignoring notification job ${job.id} (${job.name}).`);
      return;
    }

    const messageId = job.data?.messageId;
    if (!messageId) {
      this.logger.warn(`Notification job ${job.id} missing messageId.`);
      return;
    }

    await this.notificationsService.processMessage(
      messageId,
      job.data?.overrideEmail,
      job,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.logger.error(
      `Notification job failed: ${job?.id ?? 'unknown'}`,
      err?.stack ?? String(err),
    );
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(
      `Notification worker error: ${err?.message ?? err}`,
      err?.stack,
    );
  }
}
