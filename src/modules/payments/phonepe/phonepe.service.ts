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
  PhonepeOAuthTokenResponse,
  type PhonepePayResponse,
  PhonepeRefundPayload,
  type PhonepeRefundResponse,
  type PhonepeRefundStatusResponse,
  PhonepeSubscriptionExecutePayload,
  PhonepeSubscriptionExecuteResponse,
  PhonepeSubscriptionNotifyPayload,
  PhonepeSubscriptionNotifyResponse,
  PhonepeSubscriptionOrderStatusResponse,
  PhonepeSubscriptionSetupPayload,
  PhonepeSubscriptionSetupResponse,
  PhonepeSubscriptionStatusResponse,
  type PhonepeStatusResponse,
} from './phonepe.types';

@Injectable()
export class PhonepeService {
  private client: StandardCheckoutClient | null = null;
  private oAuthTokenCache:
    | {
        accessToken: string;
        tokenType: string;
        expiresAtMs: number;
      }
    | undefined;

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

  async setupSubscription(
    payload: PhonepeSubscriptionSetupPayload,
  ): Promise<PhonepeSubscriptionSetupResponse> {
    try {
      const setupMessage = this.configService
        .get<string>('PHONEPE_PAYMENT_MESSAGE')
        ?.trim();
      const subscriptionType =
        this.configService.get<string>('PHONEPE_SUBSCRIPTION_TYPE') ??
        'RECURRING';
      const subscriptionProductType =
        this.configService.get<string>('PHONEPE_SUBSCRIPTION_PRODUCT_TYPE') ??
        'UPI_MANDATE';

      const response = await this.requestRecurringApi<PhonepeSubscriptionSetupResponse>(
        'POST',
        '/checkout/v2/pay',
        {
          merchantOrderId: payload.merchantOrderId,
          amount: payload.amount,
          expireAfter: payload.expireAfterSeconds,
          metaInfo: this.normalizeMetaInfo(payload.metaInfo),
          paymentFlow: {
            type:
              this.configService.get<string>(
                'PHONEPE_SUBSCRIPTION_SETUP_FLOW_TYPE',
              ) ?? 'SUBSCRIPTION_CHECKOUT_SETUP',
            ...(setupMessage ? { message: setupMessage } : {}),
            merchantUrls: {
              redirectUrl: payload.redirectUrl,
              cancelRedirectUrl: payload.cancelRedirectUrl ?? payload.redirectUrl,
            },
            subscriptionDetails: {
              subscriptionType,
              merchantSubscriptionId: payload.merchantSubscriptionId,
              authWorkflowType: payload.authWorkflowType,
              amountType: payload.amountType,
              maxAmount: payload.maxAmount,
              frequency: payload.frequency,
              expireAt: payload.expireAt,
              ...(subscriptionProductType
                ? { productType: subscriptionProductType }
                : {}),
            },
          },
        },
      );

      if (!response.redirectUrl) {
        const fallbackRedirectUrl =
          this.readString(response, ['paymentFlow', 'redirectUrl']) ??
          this.readString(response, ['instrumentResponse', 'redirectUrl']) ??
          this.readString(response, ['data', 'redirectUrl']);
        if (fallbackRedirectUrl) {
          return {
            ...response,
            redirectUrl: fallbackRedirectUrl,
          };
        }
      }

      return response;
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_SETUP_FAILED',
        'Subscription setup initiation failed.',
        error,
      );
    }
  }

  async checkSubscriptionSetupStatus(
    merchantOrderId: string,
    details = true,
  ): Promise<PhonepeSubscriptionOrderStatusResponse> {
    try {
      const query = new URLSearchParams({ details: details ? 'true' : 'false' });
      return await this.requestRecurringApi(
        'GET',
        `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?${query.toString()}`,
      );
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_STATUS_FAILED',
        'Subscription setup status lookup failed.',
        error,
      );
    }
  }

  async checkSubscriptionStatus(
    merchantSubscriptionId: string,
    details = true,
  ): Promise<PhonepeSubscriptionStatusResponse> {
    try {
      const query = new URLSearchParams({ details: details ? 'true' : 'false' });
      return await this.requestRecurringApi(
        'GET',
        `/subscriptions/v2/${encodeURIComponent(merchantSubscriptionId)}/status?${query.toString()}`,
      );
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_STATUS_FAILED',
        'Subscription status lookup failed.',
        error,
      );
    }
  }

  async checkSubscriptionRedemptionStatus(
    merchantOrderId: string,
    details = true,
  ): Promise<PhonepeSubscriptionOrderStatusResponse> {
    try {
      const query = new URLSearchParams({ details: details ? 'true' : 'false' });
      return await this.requestRecurringApi(
        'GET',
        `/subscriptions/v2/order/${encodeURIComponent(merchantOrderId)}/status?${query.toString()}`,
      );
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_REDEMPTION_STATUS_FAILED',
        'Subscription redemption status lookup failed.',
        error,
      );
    }
  }

  async notifySubscriptionRedemption(
    payload: PhonepeSubscriptionNotifyPayload,
  ): Promise<PhonepeSubscriptionNotifyResponse> {
    try {
      return await this.requestRecurringApi(
        'POST',
        '/subscriptions/v2/notify',
        {
          merchantOrderId: payload.merchantOrderId,
          amount: payload.amount,
          expireAt: payload.expireAt,
          metaInfo: this.normalizeMetaInfo(payload.metaInfo),
          paymentFlow: {
            type:
              this.configService.get<string>(
                'PHONEPE_SUBSCRIPTION_REDEMPTION_FLOW_TYPE',
              ) ?? 'SUBSCRIPTION_REDEMPTION',
            merchantSubscriptionId: payload.merchantSubscriptionId,
            redemptionRetryStrategy:
              payload.redemptionRetryStrategy ??
              this.configService.get<string>(
                'PHONEPE_SUBSCRIPTION_RETRY_STRATEGY',
              ) ??
              'STANDARD_RETRY',
            autoDebit:
              payload.autoDebit ??
              (this.configService.get<boolean>('PHONEPE_SUBSCRIPTION_AUTO_DEBIT') ??
                true),
          },
        },
      );
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_NOTIFY_FAILED',
        'Subscription redemption notify failed.',
        error,
      );
    }
  }

  async executeSubscriptionRedemption(
    payload: PhonepeSubscriptionExecutePayload,
  ): Promise<PhonepeSubscriptionExecuteResponse> {
    try {
      return await this.requestRecurringApi(
        'POST',
        '/subscriptions/v2/redeem',
        {
          merchantOrderId: payload.merchantOrderId,
        },
      );
    } catch (error) {
      throw this.mapProviderError(
        'PHONEPE_SUBSCRIPTION_EXECUTE_FAILED',
        'Subscription redemption execution failed.',
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

  private getPgBaseUrl() {
    const envValue = this.configService.get<string>('PHONEPE_ENV') ?? 'SANDBOX';
    return envValue.toUpperCase() === 'PRODUCTION'
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  private getOAuthBaseUrl() {
    const envValue = this.configService.get<string>('PHONEPE_ENV') ?? 'SANDBOX';
    return envValue.toUpperCase() === 'PRODUCTION'
      ? 'https://api.phonepe.com/apis/identity-manager'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  private async requestRecurringApi<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, unknown>,
  ) {
    const url = `${this.getPgBaseUrl()}${path}`;
    const buildHeaders = (authorization: string) =>
      ({
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-source': 'API',
        'x-source-version': 'V2',
        'x-source-platform': 'BACKEND_NODE_SDK',
        'x-source-platform-version': '2.0.1',
      }) as Record<string, string>;

    const execute = async (authorization: string) =>
      fetch(url, {
        method,
        headers: buildHeaders(authorization),
        body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      });

    let response = await execute(await this.getOAuthAuthorizationHeader());
    if (response.status === 401) {
      response = await execute(await this.getOAuthAuthorizationHeader(true));
    }

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);

    if (!response.ok) {
      throw {
        status: response.status,
        statusText: response.statusText,
        responseBody: parsed ?? rawText,
      };
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const wrapped = parsed as Record<string, unknown>;
      if (wrapped.success === false) {
        throw {
          status: response.status,
          statusText: response.statusText,
          responseBody: wrapped,
        };
      }

      if (
        wrapped.data &&
        typeof wrapped.data === 'object' &&
        !Array.isArray(wrapped.data)
      ) {
        return {
          ...(wrapped.data as Record<string, unknown>),
          _raw: wrapped,
        } as T;
      }
    }

    return (parsed ?? {}) as T;
  }

  private normalizeMetaInfo(metaInfo?: Record<string, unknown>) {
    if (!metaInfo || typeof metaInfo !== 'object') {
      return undefined;
    }

    const entries = Object.entries(metaInfo).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    if (!entries.length) {
      return undefined;
    }

    const isUdfShape = entries.every(([key]) =>
      /^udf([1-9]|1[0-5])$/i.test(key),
    );
    const normalized: Record<string, string> = {};

    if (isUdfShape) {
      for (const [key, value] of entries) {
        const udfKey = key.toLowerCase();
        normalized[udfKey] = this.toMetaString(value, udfKey);
      }
      return normalized;
    }

    let idx = 1;
    for (const [, value] of entries) {
      if (idx > 15) {
        break;
      }
      const udfKey = `udf${idx}`;
      normalized[udfKey] = this.toMetaString(value, udfKey);
      idx += 1;
    }

    return Object.keys(normalized).length ? normalized : undefined;
  }

  private toMetaString(value: unknown, udfKey: string) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else {
      try {
        raw = JSON.stringify(value);
      } catch {
        raw = String(value);
      }
    }
    const limit = /^udf(1[1-5])$/.test(udfKey) ? 50 : 256;
    return raw.slice(0, limit);
  }

  private readString(
    source: Record<string, unknown>,
    path: string[],
  ): string | undefined {
    let current: unknown = source;
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === 'string' ? current : undefined;
  }

  private async getOAuthAuthorizationHeader(forceRefresh = false) {
    if (
      !forceRefresh &&
      this.oAuthTokenCache &&
      Date.now() < this.oAuthTokenCache.expiresAtMs - 30_000
    ) {
      return `${this.oAuthTokenCache.tokenType} ${this.oAuthTokenCache.accessToken}`;
    }

    const clientId = this.getRequired('PHONEPE_CLIENT_ID');
    const clientSecret = this.getRequired('PHONEPE_CLIENT_SECRET');
    const clientVersion = String(
      this.configService.get<number>('PHONEPE_CLIENT_VERSION') ?? 1,
    );

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      client_version: clientVersion,
      grant_type: 'client_credentials',
    });

    const response = await fetch(`${this.getOAuthBaseUrl()}/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText) as
      | PhonepeOAuthTokenResponse
      | undefined;

    if (!response.ok || !parsed?.access_token || !parsed?.token_type) {
      throw this.mapProviderError(
        'PHONEPE_OAUTH_FAILED',
        'PhonePe OAuth token generation failed.',
        {
          status: response.status,
          statusText: response.statusText,
          responseBody: parsed ?? rawText,
        },
      );
    }

    const expiresAtMs =
      typeof parsed.expires_at === 'number'
        ? parsed.expires_at * 1000
        : Date.now() + (parsed.expires_in ?? 900) * 1000;

    this.oAuthTokenCache = {
      accessToken: parsed.access_token,
      tokenType: parsed.token_type,
      expiresAtMs,
    };

    return `${parsed.token_type} ${parsed.access_token}`;
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
      status: (error as { status?: number }).status,
      statusText: (error as { statusText?: string }).statusText,
      responseBody: (error as { responseBody?: unknown }).responseBody,
    };
  }

  private tryParseJson(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
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
