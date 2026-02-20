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
