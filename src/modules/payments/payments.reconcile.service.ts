import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsReconcileService {
  private readonly logger = new Logger(PaymentsReconcileService.name);
  private lastRunAt = 0;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(60000)
  async reconcileTick() {
    const intervalSeconds =
      this.configService.get<number>('PAYMENTS_RECONCILE_INTERVAL_SECONDS') ?? 60;
    if (intervalSeconds <= 0) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRunAt < intervalSeconds * 1000 - 500) {
      return;
    }
    this.lastRunAt = now;

    try {
      const expired = await this.paymentsService.expireStaleOrders();
      const reconciled = await this.paymentsService.reconcilePendingOrders();

      if (expired.expired || reconciled.reconciled) {
        this.logger.log(
          `Reconcile tick: expired=${expired.expired} reconciled=${reconciled.reconciled}`,
        );
      }
    } catch (err) {
      this.logger.warn(`Reconcile tick failed: ${(err as Error)?.message ?? String(err)}`);
    }
  }
}
