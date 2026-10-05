import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConcurrencyException } from '@domain/exceptions/domain.exception';
import { PaymentRepository } from '@application/ports/payment.repository';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { PaymentSchema } from '../schemas/payment.schema';
import { TransactionSchema } from '../schemas/transaction.schema';
import { PaymentMapper } from '../mappers/payment.mapper';

@Injectable()
export class TypeOrmPaymentRepository implements PaymentRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentSchema)
    private readonly paymentRepo: Repository<PaymentSchema>,
    @InjectRepository(TransactionSchema)
    private readonly transactionRepo: Repository<TransactionSchema>,
  ) {}

  async save(payment: Payment): Promise<void> {
    const { paymentSchema, transactionSchemas } =
      PaymentMapper.toPersistence(payment);

    const newVersion = await this.dataSource.transaction(async (manager) => {
      let version: number;

      if (payment.version === undefined) {
        // New aggregate → INSERT (fails on duplicate id)
        paymentSchema.version = 1;
        const { transactions, ...paymentInsertValues } = paymentSchema;
        await manager.insert(PaymentSchema, paymentInsertValues as any);
        version = 1;
      } else {
        // Existing aggregate → UPDATE … WHERE id = ? AND version = ?
        const { id, version: _v, createdAt, transactions, ...cols } =
          paymentSchema;
        // undefined → null so cleared fields (e.g. errorCode) are actually cleared
        const values = Object.fromEntries(
          Object.entries(cols).map(([k, v]) => [k, v ?? null]),
        );

        const result = await manager
          .createQueryBuilder()
          .update(PaymentSchema)
          .set({ ...values, version: () => 'version + 1' })
          .where('id = :id AND version = :version', {
            id: payment.id,
            version: payment.version,
          })
          .execute();

        if (result.affected === 0) {
          throw new ConcurrencyException(payment.id);
        }
        version = payment.version + 1;
      }

      // Upsert children: new refund txs are inserted, PENDING → SUCCEEDED updates apply
      if (transactionSchemas.length > 0) {
        await manager.upsert(TransactionSchema, transactionSchemas as any, {
          conflictPaths: ['id'],
          skipUpdateIfNoValuesChanged: true,
        });
      }

      return version;
    });

    payment.markPersisted(newVersion);
  }

  async findById(id: string): Promise<Payment | null> {
    const paymentSchema = await this.paymentRepo.findOne({
      where: { id },
    });

    if (!paymentSchema) {
      return null;
    }

    const transactionSchemas = await this.transactionRepo.find({
      where: { paymentId: id },
      order: { createdAt: 'ASC' },
    });

    return PaymentMapper.toDomain(paymentSchema, transactionSchemas);
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<Payment | null> {
    const paymentSchema = await this.paymentRepo.findOne({
      where: { providerPaymentId },
    });

    if (!paymentSchema) {
      return null;
    }

    const transactionSchemas = await this.transactionRepo.find({
      where: { paymentId: paymentSchema.id },
      order: { createdAt: 'ASC' },
    });

    return PaymentMapper.toDomain(paymentSchema, transactionSchemas);
  }
}
