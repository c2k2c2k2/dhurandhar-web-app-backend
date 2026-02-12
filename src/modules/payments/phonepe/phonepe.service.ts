import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PhonepePayResponse, PhonepeStatusResponse } from './phonepe.types';

@Injectable()
export class PhonepeService {
  constructor(private readonly configService: ConfigService) {}

  async initiatePayment(payload: Record<string, unknown>) {
    const apiBase = this.getRequired('PHONEPE_API_BASE_URL');
    const apiPath = this.getRequired('PHONEPE_PAY_PATH');

    const bodyBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const xVerify = this.computeXVerify(bodyBase64, apiPath);

    const response = await this.fetchJson<PhonepePayResponse>(
      new URL(apiPath, apiBase).toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({ request: bodyBase64 }),
      },
    );

    if (!response.success) {
      throw new BadRequestException({
        code: 'PHONEPE_INIT_FAILED',
        message: response.message ?? 'Payment initiation failed.',
        details: response,
      });
    }

    const redirectUrl =
      response.data?.instrumentResponse?.redirectInfo?.url ??
      response.data?.redirectUrl;

    if (!redirectUrl) {
      throw new BadRequestException({
        code: 'PHONEPE_REDIRECT_MISSING',
        message: 'Payment redirect URL missing.',
        details: response,
      });
    }

    return { redirectUrl, response };
  }

  async checkStatus(merchantTransactionId: string) {
    const apiBase = this.getRequired('PHONEPE_API_BASE_URL');
    const template = this.getRequired('PHONEPE_STATUS_PATH');
    const merchantId = this.getRequired('PHONEPE_MERCHANT_ID');
    const apiPath = template
      .replace('{merchantId}', merchantId)
      .replace('{merchantTransactionId}', merchantTransactionId);

    const xVerify = this.computeXVerify('', apiPath);

    const response = await this.fetchJson<PhonepeStatusResponse>(
      new URL(apiPath, apiBase).toString(),
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': merchantId,
        },
      },
    );

    if (!response.success) {
      throw new BadRequestException({
        code: 'PHONEPE_STATUS_FAILED',
        message: response.message ?? 'Payment status lookup failed.',
        details: response,
      });
    }

    return response;
  }

  private computeXVerify(payloadBase64: string, apiPath: string) {
    const saltKey = this.getRequired('PHONEPE_SALT_KEY');
    const saltIndex = this.configService.get<number>('PHONEPE_SALT_INDEX');
    if (saltIndex === undefined || saltIndex === null) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message: 'PHONEPE_SALT_INDEX is missing.',
      });
    }

    const hash = createHash('sha256')
      .update(`${payloadBase64}${apiPath}${saltKey}`)
      .digest('hex');

    return `${hash}###${saltIndex}`;
  }

  private getRequired(key: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message: `${key} is missing.`,
      });
    }
    return value;
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const data = (await response.json()) as T;
    return data;
  }
}
