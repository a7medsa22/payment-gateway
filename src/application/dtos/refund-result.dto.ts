export interface RefundResultDto {
  paymentId: string;
  status: string;
  amount: string;
  currency: string;
  totalRefunded: string;
  refundableAmount: string;
  refundedAt?: Date;
  refundTransactionId?: string;
  refundStatus?: 'succeeded' | 'pending';
  reason?: string;
}
