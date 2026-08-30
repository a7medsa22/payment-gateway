export const ROUTING_KEYS = {
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
} as const;

export const PAYMENT_EVENTS = {
  CREATED: 'PaymentCreated',
  SUCCEEDED: 'PaymentSucceeded',
  FAILED: 'PaymentFailed',
  REFUNDED: 'PaymentRefunded',
} as const;
