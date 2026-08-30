import { Payment } from '@domain/aggregates/payment.aggregate';

export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
}
