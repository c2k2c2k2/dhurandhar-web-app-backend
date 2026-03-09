import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsAutopayService {
  private readonly logger = new Logger(PaymentsAutopayService.name);
  private lastRunAt = 0;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  @Interval(60000)
  async autopayTick() {
    const intervalSeconds = this.siteSettings.getNumber(
      'PAYMENTS_AUTOPAY_INTERVAL_SECONDS',
      300,
      {
        integer: true,
        min: 10,
      },
    );
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRunAt < intervalSeconds * 1000 - 500) {
      return;
    }
    this.lastRunAt = now;

    try {
      const reminders = await this.paymentsService.sendAutoPayRenewalReminders();
      const charges = await this.paymentsService.processDueAutoPayCharges();

      if (reminders.notified || charges.initiated) {
        this.logger.log(
          `AutoPay tick: reminders=${reminders.notified}/${reminders.scanned} charges=${charges.initiated}/${charges.scanned}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `AutoPay tick failed: ${(error as Error)?.message ?? String(error)}`,
      );
    }
  }
}
