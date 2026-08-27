import { DomainException } from '@domain/exceptions/domain.exception';
import { Money } from '@domain/value-objects/money.vo';
import { Clock, systemClock } from '@domain/clock';
import {
  FailureReason,
  PaymentProvider,
  PaymentStatus,
} from '@shared/constants/payment.constants';

export interface PaymentProps {
  id: string;
  userId: string;
  amount: Money;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId?: string;
  paymentMethodType?: string;
  description?: string;
  errorCode?: string;
  failureReason?: FailureReason;
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

export class Payment {
  private readonly _id: string;
  private readonly _userId: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _provider: PaymentProvider;
  private _providerPaymentId?: string;
  private _paymentMethodType?: string;
  private _description?: string;
  private _errorCode?: string;
  private _failureReason?: FailureReason;
  private _succeededAt?: Date;
  private _failedAt?: Date;
  private _expiredAt?: Date;
  private _cancelledAt?: Date;
  private _refundedAt?: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private readonly _clock: Clock;

  
  private constructor(probs: PaymentCtorProps, clock: Clock) {
    this._id = probs.id 
    this._clock = clock;
    this._userId = probs.userId;
    this._amount = probs.amount;
    this._status = probs.status;
    this._provider = probs.provider;
    this._providerPaymentId = probs.providerPaymentId;
    this._paymentMethodType = probs.paymentMethodType;
    this._description = probs.description;
    this._errorCode = probs.errorCode;
    this._failureReason = probs.failureReason;
    this._succeededAt = probs.succeededAt;
    this._failedAt = probs.failedAt;
    this._expiredAt = probs.expiredAt;
    this._cancelledAt = probs.cancelledAt;
    this._refundedAt = probs.refundedAt;
    this._createdAt = probs.createdAt;
    this._updatedAt = probs.updatedAt;
  }

  static create(
    props: Omit<PaymentProps,  'status' | 'createdAt' | 'updatedAt'>,
    clock: Clock = systemClock,
  ): Payment {

    if (!props.userId) throw new DomainException('UserId is required');
    if (!props.provider)
      throw new DomainException('Payment provider is required');

    const now = clock.now();
    return new Payment(
      {
        ...props,
        status: PaymentStatus.CREATED,
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
        createdAt: props.createdAt ?? now,
        updatedAt: props.updatedAt ?? now,
      },
      clock,
    );
  }

  get id(): string {
    return this._id;
  }

  get userId(): string { return this._userId; }

  get status(): PaymentStatus { return this._status; }

  get amount(): Money { return this._amount; }

  get provider(): PaymentProvider { return this._provider; }

  get providerPaymentId(): string | undefined { return this._providerPaymentId; }


  get paymentMethodType(): string | undefined { return this._paymentMethodType; }

  get description(): string | undefined { return this._description; }


  get errorCode(): string | undefined { return this._errorCode; }

  get failureReason(): string | undefined { return this._failureReason; }

  get succeededAt(): Date | undefined { return this._succeededAt; }

  get failedAt(): Date | undefined {
    return this._failedAt;
  }

  get refundedAt(): Date | undefined {
    return this._refundedAt;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Business Logic Methods

  start(): void {
    if (this.status !== PaymentStatus.CREATED)
      throw new DomainException('Payment already started')

    const now = this._clock.now();
    this._status = PaymentStatus.PENDING;
    this._updatedAt = now;
  }
  succeed(): void {
    this.ensureStatus(
      'succeed',
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
    );

    this._status = PaymentStatus.SUCCEEDED;
    const now = this._clock.now();
    this._succeededAt = now;
    this._updatedAt = now;
    this._errorCode = undefined;
    this._failureReason = undefined;
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

  private ensureStatus(action: string, ...statuses: PaymentStatus[]): void {
    if (!statuses.includes(this._status)) {
      throw new DomainException(
        `Cannot mark payment as ${action} from status: ${this._status}`,
      );
    }
  }
}
