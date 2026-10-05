import {
  DomainException,
  PaymentException,
} from '@domain/exceptions/domain.exception';
import { Money } from '@domain/value-objects/money.vo';
import { Clock, systemClock } from '@domain/clock';
import {
  FailureReason,
  PaymentProvider,
  PaymentStatus,
  TransactionStatus,
  TransactionType,
} from '@domain/enums';
import { Transaction } from '@domain/entities/transaction.entity';

export interface PaymentProps {
  id: string;
  merchantId: string;
  userId: string;
  amount: Money;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId?: string;
  paymentMethodType?: string;
  description?: string;
  errorCode?: string;
  failureReason?: FailureReason;
  transactions?: Transaction[];
  succeededAt?: Date;
  failedAt?: Date;
  expiredAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

type PaymentCtorProps = PaymentProps & { createdAt: Date; updatedAt: Date };

/**
 * Payment Aggregate Root State Machine:
 *
 *            ┌──────────────────────────────────────────────┐
 *            │                                              │
 * CREATED ──start()──→ PENDING ──process()──→ PROCESSING    │
 *   │                    │                      │           │
 *   │   cancel()/expire()│   cancel()/expire()  │ cancel()/ │
 *   │                    │                      │ expire()  │
 *   │                    │   succeed()          │ succeed() │
 *   │                    ├──────────────────→ SUCCEEDED      │
 *   │                    │   fail()             │ fail()     │
 *   │                    ├──────────────────→ FAILED         │
 *   │                    │                      │            │
 *   ├───────────────────→├──────────────────────→ CANCELLED  │
 *   ├───────────────────→├──────────────────────→ EXPIRED    │
 *   └────────────────────┘                                   │
 */
export class Payment {
  private readonly _id: string;
  private readonly _merchantId: string;
  private readonly _userId: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _provider: PaymentProvider;
  private _providerPaymentId?: string;
  private _paymentMethodType?: string;
  private _description?: string;
  private _errorCode?: string;
  private _failureReason?: FailureReason;
  private readonly _transactions: Transaction[];
  private _succeededAt?: Date;
  private _failedAt?: Date;
  private _expiredAt?: Date;
  private _cancelledAt?: Date;
  private _refundedAt?: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private readonly _clock: Clock;
  private _version?: number;

  private constructor(props: PaymentCtorProps, clock: Clock) {
    this._id = props.id;
    this._merchantId = props.merchantId;
    this._clock = clock;
    this._userId = props.userId;
    this._amount = props.amount;
    this._status = props.status;
    this._provider = props.provider;
    this._providerPaymentId = props.providerPaymentId;
    this._paymentMethodType = props.paymentMethodType;
    this._description = props.description;
    this._errorCode = props.errorCode;
    this._failureReason = props.failureReason;
    this._transactions = props.transactions ? [...props.transactions] : [];
    this._succeededAt = props.succeededAt;
    this._failedAt = props.failedAt;
    this._expiredAt = props.expiredAt;
    this._cancelledAt = props.cancelledAt;
    this._refundedAt = props.refundedAt;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._version = props.version;
  }

  static create(
    props: Omit<PaymentProps, 'status' | 'createdAt' | 'updatedAt'>,
    clock: Clock = systemClock,
  ): Payment {
    if (!props.merchantId) throw new DomainException('MerchantId is required');
    if (!props.userId) throw new DomainException('UserId is required');
    if (!props.provider)
      throw new DomainException('Payment provider is required');

    const now = clock.now();
    return new Payment(
      {
        ...props,
        status: PaymentStatus.CREATED,
        transactions: [],
        createdAt: now,
        updatedAt: now,
      },
      clock,
    );
  }

  static reconstitute(
    props: PaymentProps,
    clock: Clock = systemClock,
  ): Payment {
    const now = clock.now();
    return new Payment(
      {
        ...props,
        transactions: props.transactions ?? [],
        createdAt: props.createdAt ?? now,
        updatedAt: props.updatedAt ?? now,
      },
      clock,
    );
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get merchantId(): string {
    return this._merchantId;
  }

  get userId(): string {
    return this._userId;
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get amount(): Money {
    return this._amount;
  }

  get provider(): PaymentProvider {
    return this._provider;
  }

  get providerPaymentId(): string | undefined {
    return this._providerPaymentId;
  }

  get paymentMethodType(): string | undefined {
    return this._paymentMethodType;
  }

  get description(): string | undefined {
    return this._description;
  }

  get errorCode(): string | undefined {
    return this._errorCode;
  }

  get failureReason(): FailureReason | undefined {
    return this._failureReason;
  }

  get transactions(): readonly Transaction[] {
    return [...this._transactions];
  }

  get totalCharged(): Money {
    const successfulCharges = this._transactions.filter(
      (t) => t.type === TransactionType.CHARGE && t.isSuccessful(),
    );
    if (successfulCharges.length === 0) {
      return Money.zero(this._amount.currency);
    }
    return successfulCharges.reduce(
      (acc, t) => acc.add(t.amount),
      Money.zero(this._amount.currency),
    );
  }

  get totalRefunded(): Money {
    const successfulRefunds = this._transactions.filter(
      (t) => t.isRefund() && t.isSuccessful(),
    );
    if (successfulRefunds.length === 0) {
      return Money.zero(this._amount.currency);
    }
    return successfulRefunds.reduce(
      (acc, t) => acc.add(t.amount),
      Money.zero(this._amount.currency),
    );
  }

  get pendingRefundTotal(): Money {
    return this._transactions
      .filter((t) => t.isRefund() && t.isPending())
      .reduce((acc, t) => acc.add(t.amount), Money.zero(this._amount.currency));
  }

  /** Charged − refunded − reserved (pending) refunds. */
  get refundableAmount(): Money {
    if (
      this._status !== PaymentStatus.SUCCEEDED &&
      this._status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      return Money.zero(this._amount.currency);
    }
    return this.totalCharged
      .subtract(this.totalRefunded)
      .subtract(this.pendingRefundTotal);
  }

  get succeededAt(): Date | undefined {
    return this._succeededAt;
  }

  get failedAt(): Date | undefined {
    return this._failedAt;
  }

  get refundedAt(): Date | undefined {
    return this._refundedAt;
  }

  get expiredAt(): Date | undefined {
    return this._expiredAt;
  }

  get cancelledAt(): Date | undefined {
    return this._cancelledAt;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get version(): number | undefined {
    return this._version;
  }

  /** @internal Called by the repository after a successful write. */
  markPersisted(version: number): void {
    this._version = version;
  }

  setProviderPaymentId(providerPaymentId: string): void {
    if (!providerPaymentId) {
      throw new DomainException('Provider payment ID cannot be empty');
    }
    this._providerPaymentId = providerPaymentId;
    this._updatedAt = this._clock.now();
  }

  // Business Logic Methods

  start(): void {
    if (this._status !== PaymentStatus.CREATED)
      throw new PaymentException('Payment already started');

    const now = this._clock.now();
    this._status = PaymentStatus.PENDING;
    this._updatedAt = now;
  }

  process(): void {
    if (this._status !== PaymentStatus.PENDING)
      throw new PaymentException('Payment must be pending to be processed');

    const now = this._clock.now();
    this._status = PaymentStatus.PROCESSING;
    this._updatedAt = now;
  }

  succeed(providerTransactionId?: string): void {
    this.ensureStatus(
      'succeed',
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
    );

    this._status = PaymentStatus.SUCCEEDED;
    if (providerTransactionId) {
      this._providerPaymentId = providerTransactionId;
    }
    const now = this._clock.now();
    this._succeededAt = now;
    this._updatedAt = now;
    this._errorCode = undefined;
    this._failureReason = undefined;

    // Aggregate manages child Transaction creation
    const chargeTransaction = Transaction.createInternal(
      {
        id: crypto.randomUUID(),
        paymentId: this._id,
        type: TransactionType.CHARGE,
        status: TransactionStatus.SUCCEEDED,
        amount: this._amount,
        provider: this._provider,
        providerTransactionId,
        description: 'Payment charge',
        processedAt: now,
      },
      this._clock,
    );
    this._transactions.push(chargeTransaction);
  }

  fail(errorCode: string, failureReason: FailureReason): void {
    this.ensureStatus(
      'fail',
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
    );

    this._status = PaymentStatus.FAILED;
    this._errorCode = errorCode;
    this._failureReason = failureReason;
    const now = this._clock.now();
    this._failedAt = now;
    this._updatedAt = now;
  }

  cancel(errorCode: string, failureReason: FailureReason): void {
    this.ensureStatus(
      'cancel',
      PaymentStatus.CREATED,
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
    );

    this._status = PaymentStatus.CANCELLED;
    this._errorCode = errorCode;
    this._failureReason = failureReason;
    const now = this._clock.now();
    this._cancelledAt = now;
    this._updatedAt = now;
  }

  expire(errorCode: string, failureReason: FailureReason): void {
    this.ensureStatus(
      'expire',
      PaymentStatus.CREATED,
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
    );

    this._status = PaymentStatus.EXPIRED;
    this._errorCode = errorCode;
    this._failureReason = failureReason;
    const now = this._clock.now();
    this._expiredAt = now;
    this._updatedAt = now;
  }

  /** Step 1: reserve funds as a PENDING refund transaction. Status unchanged. */
  requestRefund(refundAmount?: Money, reason?: string): Transaction {
    const effective = refundAmount ?? this.refundableAmount;
    this.assertRefundable(effective); // single source of truth (M2)

    const isFull = this.totalRefunded
      .add(this.pendingRefundTotal)
      .add(effective)
      .equals(this.totalCharged);

    const tx = Transaction.createInternal(
      {
        id: crypto.randomUUID(),
        paymentId: this._id,
        type: isFull ? TransactionType.REFUND : TransactionType.PARTIAL_REFUND,
        status: TransactionStatus.PENDING,
        amount: effective,
        provider: this._provider,
        description: reason ?? (isFull ? 'Full refund' : 'Partial refund'),
      },
      this._clock,
    );
    this._transactions.push(tx);
    this._updatedAt = this._clock.now();
    return tx;
  }

  /** Step 2a: provider confirmed. Idempotent. */
  confirmRefund(refundTxId: string, providerRefundId?: string): void {
    const tx = this.getRefundTx(refundTxId);
    if (tx.isSuccessful()) return;
    if (providerRefundId) tx.attachProviderTransactionId(providerRefundId);
    tx.markAsSucceeded(this._clock);

    const now = this._clock.now();
    const fullyRefunded = this.totalRefunded.equals(this.totalCharged);
    this._status = fullyRefunded
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;
    if (fullyRefunded) this._refundedAt = now;
    this._updatedAt = now;
  }

  /** Step 2b: provider accepted but still processing. */
  markRefundPending(refundTxId: string, providerRefundId: string): void {
    this.getRefundTx(refundTxId).attachProviderTransactionId(providerRefundId);
    this._updatedAt = this._clock.now();
  }

  /** Step 2c: provider definitively rejected → releases the reserved amount. Idempotent. */
  failRefund(refundTxId: string): void {
    const tx = this.getRefundTx(refundTxId);
    if (tx.isFailed()) return;
    tx.markAsFailed(this._clock);
    this._updatedAt = this._clock.now();
  }

  /** @deprecated Use requestRefund + confirmRefund */
  refund(
    refundAmount?: Money,
    reason?: string,
    providerRefundId?: string,
  ): void {
    const tx = this.requestRefund(refundAmount, reason);
    this.confirmRefund(tx.id, providerRefundId);
  }

  private assertRefundable(amount: Money): void {
    if (
      this._status !== PaymentStatus.SUCCEEDED &&
      this._status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new PaymentException(
        `Cannot refund payment from status: ${this._status}`,
      );
    }
    if (!this._providerPaymentId) {
      throw new PaymentException(
        'Cannot refund payment without provider payment ID',
      );
    }
    if (amount.isZero() || !amount.isPositive()) {
      throw new DomainException('Refund amount must be positive');
    }
    if (amount.currency !== this._amount.currency) {
      throw new DomainException(
        `Refund currency mismatch: expected ${this._amount.currency}, got ${amount.currency}`,
      );
    }
    amount.assertCurrencyPrecision(); // M1, see 1.5.6
    if (amount.isGreaterThan(this.refundableAmount)) {
      throw new DomainException(
        `Refund amount (${amount.amount}) exceeds refundable amount (${this.refundableAmount.amount})`,
      );
    }
  }

  private getRefundTx(id: string): Transaction {
    const tx = this._transactions.find((t) => t.id === id && t.isRefund());
    if (!tx) throw new DomainException(`Refund transaction ${id} not found`);
    return tx;
  }

  private ensureStatus(action: string, ...statuses: PaymentStatus[]): void {
    if (!statuses.includes(this._status)) {
      throw new PaymentException(
        `Cannot mark payment as ${action} from status: ${this._status}`,
      );
    }
  }
}
