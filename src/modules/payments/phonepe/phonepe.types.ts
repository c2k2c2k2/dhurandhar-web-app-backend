import type {
  CallbackResponse,
  OrderStatusResponse,
  RefundResponse,
  RefundStatusResponse,
  StandardCheckoutPayResponse,
} from 'pg-sdk-node';

export type PhonepePayResponse = StandardCheckoutPayResponse;
export type PhonepeStatusResponse = OrderStatusResponse;
export type PhonepeRefundResponse = RefundResponse;
export type PhonepeRefundStatusResponse = RefundStatusResponse;
export type PhonepeCallbackResponse = CallbackResponse;

export interface PhonepeInitiatePaymentPayload {
  merchantOrderId: string;
  amount: number;
  redirectUrl: string;
  message?: string;
  expireAfterSeconds?: number;
  disablePaymentRetry?: boolean;
}

export interface PhonepeRefundPayload {
  merchantRefundId: string;
  originalMerchantOrderId: string;
  amount: number;
}

export interface PhonepeOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  issued_at?: number;
  expires_at?: number;
  session_expires_at?: number;
  refresh_token?: string;
}

export interface PhonepeSubscriptionSetupPayload {
  merchantOrderId: string;
  amount: number;
  redirectUrl: string;
  cancelRedirectUrl?: string;
  expireAfterSeconds?: number;
  merchantSubscriptionId: string;
  authWorkflowType: string;
  amountType: string;
  maxAmount: number;
  frequency: string;
  expireAt: number;
  metaInfo?: Record<string, unknown>;
}

export interface PhonepeSubscriptionSetupResponse {
  orderId?: string;
  state?: string;
  redirectUrl?: string;
  [key: string]: unknown;
}

export interface PhonepeSubscriptionOrderStatusResponse
  extends PhonepeStatusResponse {
  paymentFlow?: {
    type?: string;
    subscriptionId?: string;
    merchantSubscriptionId?: string;
    [key: string]: unknown;
  };
}

export interface PhonepeSubscriptionNotifyPayload {
  merchantSubscriptionId: string;
  merchantOrderId: string;
  amount: number;
  expireAt?: number;
  metaInfo?: Record<string, unknown>;
  autoDebit?: boolean;
  redemptionRetryStrategy?: string;
}

export interface PhonepeSubscriptionNotifyResponse {
  state?: string;
  orderId?: string;
  merchantOrderId?: string;
  [key: string]: unknown;
}

export interface PhonepeSubscriptionExecutePayload {
  merchantOrderId: string;
}

export interface PhonepeSubscriptionExecuteResponse {
  state?: string;
  orderId?: string;
  merchantOrderId?: string;
  transactionId?: string;
  paymentDetails?: Array<{
    transactionId?: string;
    state?: string;
    amount?: number;
    timestamp?: number;
  }>;
  [key: string]: unknown;
}

export interface PhonepeSubscriptionStatusResponse {
  state?: string;
  merchantSubscriptionId?: string;
  subscriptionId?: string;
  [key: string]: unknown;
}
