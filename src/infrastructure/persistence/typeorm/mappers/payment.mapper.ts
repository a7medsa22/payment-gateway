import { Payment } from '@domain/aggregates/payment.aggregate';
import { Transaction } from '@domain/entities/transaction.entity';
import { Money } from '@domain/value-objects/money.vo';
import {
  Currency,
  FailureReason,
  PaymentProvider,
  PaymentStatus,
  TransactionStatus,
  TransactionType,
} from '@domain/enums';
import { PaymentSchema } from '../schemas/payment.schema';
import { TransactionSchema } from '../schemas/transaction.schema';

export interface PersistenceResult {
  paymentSchema: PaymentSchema;
  transactionSchemas: TransactionSchema[];
}

export class PaymentMapper {
  static toPersistence(payment: Payment): PersistenceResult {
    const paymentSchema = new PaymentSchema();
    paymentSchema.id = payment.id;
    paymentSchema.userId = payment.userId;
    paymentSchema.amount = payment.amount.amount;
    paymentSchema.currency = payment.amount.currency;
    paymentSchema.status = payment.status;
    paymentSchema.provider = payment.provider;
    paymentSchema.providerPaymentId = payment.providerPaymentId;
    paymentSchema.paymentMethodType = payment.paymentMethodType;
    paymentSchema.description = payment.description;
    paymentSchema.errorCode = payment.errorCode;
    paymentSchema.failureReason = payment.failureReason;
    paymentSchema.succeededAt = payment.succeededAt;
    paymentSchema.failedAt = payment.failedAt;
    paymentSchema.refundedAt = payment.refundedAt;
    paymentSchema.cancelledAt = payment.cancelledAt;
    paymentSchema.expiredAt = payment.expiredAt;
    paymentSchema.createdAt = payment.createdAt;
    paymentSchema.updatedAt = payment.updatedAt;

    const transactionSchemas = payment.transactions.map((tx) => {
      const txSchema = new TransactionSchema();
      txSchema.id = tx.id;
      txSchema.paymentId = tx.paymentId;
      txSchema.type = tx.type;
      txSchema.status = tx.status;
      txSchema.amount = tx.amount.amount;
      txSchema.currency = tx.amount.currency;
      txSchema.provider = tx.provider;
      txSchema.providerTransactionId = tx.providerTransactionId;
      txSchema.description = tx.description;
      txSchema.metadata = tx.metadata;
      txSchema.processedAt = tx.processedAt;
      txSchema.createdAt = tx.createdAt;
      return txSchema;
    });

    return { paymentSchema, transactionSchemas };
  }

  static toDomain(
    paymentSchema: PaymentSchema,
    transactionSchemas?: TransactionSchema[],
  ): Payment {
    const txSource = transactionSchemas ?? paymentSchema.transactions ?? [];

    const transactions = txSource.map((txSchema) =>
      Transaction.reconstitute({
        id: txSchema.id,
        paymentId: txSchema.paymentId,
        type: txSchema.type as TransactionType,
        status: txSchema.status as TransactionStatus,
        amount: Money.from(txSchema.amount, txSchema.currency as Currency),
        provider: txSchema.provider as PaymentProvider,
        providerTransactionId: txSchema.providerTransactionId,
        description: txSchema.description,
        metadata: txSchema.metadata,
        processedAt: txSchema.processedAt
          ? new Date(txSchema.processedAt)
          : undefined,
        createdAt: txSchema.createdAt
          ? new Date(txSchema.createdAt)
          : undefined,
      }),
    );

    return Payment.reconstitute({
      id: paymentSchema.id,
      userId: paymentSchema.userId,
      amount: Money.from(
        paymentSchema.amount,
        paymentSchema.currency as Currency,
      ),
      status: paymentSchema.status as PaymentStatus,
      provider: paymentSchema.provider as PaymentProvider,
      providerPaymentId: paymentSchema.providerPaymentId,
      paymentMethodType: paymentSchema.paymentMethodType,
      description: paymentSchema.description,
      errorCode: paymentSchema.errorCode,
      failureReason: paymentSchema.failureReason as FailureReason | undefined,
      transactions,
      succeededAt: paymentSchema.succeededAt
        ? new Date(paymentSchema.succeededAt)
        : undefined,
      failedAt: paymentSchema.failedAt
        ? new Date(paymentSchema.failedAt)
        : undefined,
      refundedAt: paymentSchema.refundedAt
        ? new Date(paymentSchema.refundedAt)
        : undefined,
      cancelledAt: paymentSchema.cancelledAt
        ? new Date(paymentSchema.cancelledAt)
        : undefined,
      expiredAt: paymentSchema.expiredAt
        ? new Date(paymentSchema.expiredAt)
        : undefined,
      createdAt: new Date(paymentSchema.createdAt),
      updatedAt: new Date(paymentSchema.updatedAt),
      version: paymentSchema.version,
    });
  }
}
