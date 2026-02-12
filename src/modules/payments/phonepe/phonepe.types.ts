export interface PhonepePayResponse {
  success: boolean;
  code?: string;
  message?: string;
  data?: {
    instrumentResponse?: {
      redirectInfo?: {
        url?: string;
      };
    };
    redirectUrl?: string;
  };
}

export interface PhonepeStatusResponse {
  success: boolean;
  code?: string;
  message?: string;
  data?: {
    merchantTransactionId?: string;
    transactionId?: string;
    amount?: number;
    state?: string;
    status?: string;
    responseCode?: string;
    paymentInstrument?: Record<string, unknown>;
  };
}
