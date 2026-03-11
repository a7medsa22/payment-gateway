export enum PaymentStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    REQUIRES_ACTION = 'requires_action',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded',
    PARTIALLY_REFUNDED = 'partially_refunded',
}
export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYMOB = 'paymob',
}


export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR',
] as const;

export type Currency = typeof SUPPORTED_CURRENCIES[number];
