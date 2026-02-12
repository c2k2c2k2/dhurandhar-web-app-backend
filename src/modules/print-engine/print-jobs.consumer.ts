import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrintEngineService } from './print-engine.service';

const parseConcurrency = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PRINT_CONCURRENCY = parseConcurrency(
  process.env.PRINT_WORKER_CONCURRENCY,
  1,
);

@Injectable()
@Processor('print-jobs', { concurrency: PRINT_CONCURRENCY })
export class PrintJobsConsumer extends WorkerHost {
  private readonly logger = new Logger(PrintJobsConsumer.name);

  constructor(private readonly printEngineService: PrintEngineService) {
    super();
  }

  async process(job: Job<{ jobId?: string }>): Promise<void> {
    if (job.name !== 'print') {
      this.logger.debug(`Ignoring print job ${job.id} (${job.name}).`);
      return;
    }

    const jobId = job.data?.jobId;
    if (!jobId) {
      this.logger.warn(`Print job ${job.id} missing jobId.`);
      return;
    }

    await this.printEngineService.processJob(jobId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    this.logger.error(
      `Print job failed: ${job?.id ?? 'unknown'}`,
      err?.stack ?? String(err),
    );
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(`Print worker error: ${err?.message ?? err}`, err?.stack);
  }
}
