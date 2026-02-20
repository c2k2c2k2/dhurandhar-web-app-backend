import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  Env,
  RefundRequest,
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
} from 'pg-sdk-node';
import {
  PhonepeInitiatePaymentPayload,
  type PhonepeCallbackResponse,
  type PhonepePayResponse,
  PhonepeRefundPayload,
  type PhonepeRefundResponse,
  type PhonepeRefundStatusResponse,
  type PhonepeStatusResponse,
} from './phonepe.types';

@Injectable()
export class PhonepeService {
  private client: StandardCheckoutClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  async initiatePayment(payload: PhonepeInitiatePaymentPayload) {
    try {
      let requestBuilder = StandardCheckoutPayRequest.builder()
        .merchantOrderId(payload.merchantOrderId)
        .amount(payload.amount)
        .redirectUrl(payload.redirectUrl);

      if (payload.message) {
        requestBuilder = requestBuilder.message(payload.message);
      }

      if (payload.expireAfterSeconds) {
        requestBuilder = requestBuilder.expireAfter(payload.expireAfterSeconds);
      }

      if (payload.disablePaymentRetry !== undefined) {
        requestBuilder = requestBuilder.disablePaymentRetry(
          payload.disablePaymentRetry,
        );
      }

      const request = requestBuilder.build();
      const response: PhonepePayResponse = await this.getClient().pay(request);
      const redirectUrl = response.redirectUrl;

      if (!redirectUrl) {
        throw new BadRequestException({
          code: 'PHONEPE_REDIRECT_MISSING',
          message: 'Payment redirect URL missing.',
          details: response,
        });
      }

      return { redirectUrl, response };
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_INIT_FAILED',
        'Payment initiation failed.',
        error,
      );
    }
  }

  async checkStatus(
    merchantOrderId: string,
    details = false,
  ): Promise<PhonepeStatusResponse> {
    try {
      return await this.getClient().getOrderStatus(merchantOrderId, details);
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_STATUS_FAILED',
        'Payment status lookup failed.',
        error,
      );
    }
  }

  async refund(payload: PhonepeRefundPayload): Promise<PhonepeRefundResponse> {
    try {
      const request = RefundRequest.builder()
        .merchantRefundId(payload.merchantRefundId)
        .originalMerchantOrderId(payload.originalMerchantOrderId)
        .amount(payload.amount)
        .build();

      return await this.getClient().refund(request);
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_REFUND_FAILED',
        'Refund initiation failed.',
        error,
      );
    }
  }

  async getRefundStatus(
    merchantRefundId: string,
  ): Promise<PhonepeRefundStatusResponse> {
    try {
      return await this.getClient().getRefundStatus(merchantRefundId);
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_REFUND_STATUS_FAILED',
        'Refund status lookup failed.',
        error,
      );
    }
  }

  validateWebhookSignature(
    authorization?: string,
    rawBody?: string,
  ): PhonepeCallbackResponse | undefined {
    const username =
      this.configService.get<string>('PHONEPE_CALLBACK_USERNAME') ??
      this.configService.get<string>('PHONEPE_WEBHOOK_BASIC_USER');
    const password =
      this.configService.get<string>('PHONEPE_CALLBACK_PASSWORD') ??
      this.configService.get<string>('PHONEPE_WEBHOOK_BASIC_PASS');

    if ((username && !password) || (!username && password)) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message:
          'Both PhonePe callback username and password must be configured.',
      });
    }

    if (!username && !password) {
      return undefined;
    }

    if (!authorization || !rawBody) {
      throw new UnauthorizedException({
        code: 'PHONEPE_WEBHOOK_UNAUTHORIZED',
        message: 'Unauthorized webhook.',
      });
    }

    const callbackUsername = username ?? '';
    const callbackPassword = password ?? '';

    try {
      return this.getClient().validateCallback(
        callbackUsername,
        callbackPassword,
        authorization,
        rawBody,
      );
    } catch (error) {
      if (
        this.isCallbackAuthorizationMatch(
          callbackUsername,
          callbackPassword,
          authorization,
        )
      ) {
        return undefined;
      }

      throw new UnauthorizedException({
        code: 'PHONEPE_WEBHOOK_UNAUTHORIZED',
        message: 'Unauthorized webhook.',
        details: this.serializeError(error),
      });
    }
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

  private getClient() {
    if (this.client) {
      return this.client;
    }

    const clientId = this.getRequired('PHONEPE_CLIENT_ID');
    const clientSecret = this.getRequired('PHONEPE_CLIENT_SECRET');
    const clientVersion =
      this.configService.get<number>('PHONEPE_CLIENT_VERSION') ?? 1;
    const envValue = this.configService.get<string>('PHONEPE_ENV') ?? 'SANDBOX';
    const publishEvents =
      this.configService.get<boolean>('PHONEPE_PUBLISH_EVENTS') ?? false;
    const env =
      envValue.toUpperCase() === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX;

    this.client = StandardCheckoutClient.getInstance(
      clientId,
      clientSecret,
      clientVersion,
      env,
      publishEvents,
    );

    return this.client;
  }

  private mapProviderError(code: string, message: string, error: unknown) {
    return new BadRequestException({
      code,
      message,
      details: this.serializeError(error),
    });
  }

  private serializeError(error: unknown) {
    if (!error || typeof error !== 'object') {
      return error;
    }

    const sdkError = error as {
      message?: string;
      type?: string;
      httpStatusCode?: number;
      phonePeResponse?: unknown;
    };

    return {
      message: sdkError.message,
      type: sdkError.type,
      httpStatusCode: sdkError.httpStatusCode,
      phonePeResponse: sdkError.phonePeResponse,
    };
  }

  private isCallbackAuthorizationMatch(
    username: string,
    password: string,
    authorization: string,
  ) {
    const expectedHash = createHash('sha256')
      .update(`${username}:${password}`)
      .digest('hex');
    return authorization === expectedHash;
  }
}
