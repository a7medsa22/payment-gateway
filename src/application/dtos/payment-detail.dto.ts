export interface TransactionDto {
  id: string;
  paymentId: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  provider: string;
  providerTransactionId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  processedAt?: Date;
  createdAt: Date;
}

export interface PaymentDetailDto {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId?: string;
  paymentMethodType?: string;
  description?: string;
  errorCode?: string;
  failureReason?: string;
  totalCharged: string;
  totalRefunded: string;
  refundableAmount: string;
  transactions: TransactionDto[];
  succeededAt?: Date;
  failedAt?: Date;
  refundedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
