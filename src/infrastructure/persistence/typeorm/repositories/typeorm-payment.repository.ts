import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

    // Atomicity guarantee: Explicit transaction for aggregate root + children
    await this.dataSource.transaction(async (manager) => {
      await manager.save(PaymentSchema, paymentSchema);
      if (transactionSchemas.length > 0) {
        await manager.save(TransactionSchema, transactionSchemas);
      }
    });
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
}
