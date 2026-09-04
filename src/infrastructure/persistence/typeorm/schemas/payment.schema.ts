import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TransactionSchema } from './transaction.schema';

@Entity('payments')
@Index('idx_payments_user_id', ['userId'])
@Index('idx_payments_status', ['status'])
@Index('idx_payments_provider_payment_id', ['providerPaymentId'])
export class PaymentSchema {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({ type: 'varchar', length: 30 })
  provider!: string;

  @Column({
    name: 'provider_payment_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerPaymentId?: string;

  @Column({
    name: 'payment_method_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  paymentMethodType?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    name: 'error_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  errorCode?: string;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  failureReason?: string;

  @Column({
    name: 'succeeded_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  succeededAt?: Date;

  @Column({
    name: 'failed_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  failedAt?: Date;

  @Column({
    name: 'refunded_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  refundedAt?: Date;

  @Column({
    name: 'cancelled_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  cancelledAt?: Date;

  @Column({
    name: 'expired_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  expiredAt?: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
  })
  updatedAt!: Date;

  @VersionColumn({ default: 1 })
  version!: number;

  // Explicitly NO cascade: true, NO eager: true to guarantee atomicity control
  @OneToMany(() => TransactionSchema, (t) => t.payment)
  transactions?: TransactionSchema[];
}
