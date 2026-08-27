export enum PaymentStatus {
  CREATED = 'created',
  PENDING = 'pending',
  PROCESSING = 'processing',
  REQUIRES_ACTION = 'requires_action',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}
export enum FailureReason {
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  EXPIRED_CARD = 'expired_card',
  PAYMENT_DECLINED = 'payment_declined',
  PROVIDER_ERROR = 'provider_error',
  CARD_DECLINED = 'card_declined',
  INVALID_REQUEST = 'invalid_request',
  UNKNOWN = 'unknown',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYMOB = 'paymob',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
}

export enum BillingInterval {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export enum TransactionType {
  CHARGE = 'charge',
  REFUND = 'refund',
  PARTIAL_REFUND = 'partial_refund',
  PAYOUT = 'payout',
  ADJUSTMENT = 'adjustment',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PaymentMethodType {
  CARD = 'card',
  BANK_ACCOUNT = 'bank_account',
  WALLET = 'wallet',
}

export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'EGP',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const ROUTING_KEYS = {
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_EXPIRED: 'subscription.expired',
} as const;

export const PAYMENT_EVENTS = {
  CREATED: 'PaymentCreated',
  SUCCEEDED: 'PaymentSucceeded',
  FAILED: 'PaymentFailed',
  REFUNDED: 'PaymentRefunded',
} as const;

export const SUBSCRIPTION_EVENTS = {
  CREATED: 'SubscriptionCreated',
  UPDATED: 'SubscriptionUpdated',
  CANCELLED: 'SubscriptionCancelled',
  RENEWED: 'SubscriptionRenewed',
  EXPIRED: 'SubscriptionExpired',
} as const;
