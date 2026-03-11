import { DomainException } from '@domain/exceptions/domain.exception';
import { Money } from '@domain/value-objects/money.vo';
import {
  PaymentProvider,
  PaymentStatus,
} from '@shared/constants/payment.constants';
import { randomUUID } from 'crypto';
export interface PaymentProps {
  id?: string;
  userId: string;
  amount: Money;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId?: string;
  clientSecret?: string;
  paymentMethodType?: string;
  description?: string;
  metadata: Record<string, string | number | boolean>;
  errorCode?: string;
  errorMessage?: string;
  succeededAt?: Date;
  failedAt?: Date;
  refundedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
  transaction?: Transaction[];
}
export class Payment {
  private readonly _id: string;
  private readonly _userId: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _provider: PaymentProvider;
  private _providerPaymentId?: string;
  private _clientSecret?: string;
  private _paymentMethodType?: string;
  private _description?: string;
  private _metadata: Record<string, any>;
  private _errorCode?: string;
  private _errorMessage?: string;
  private _succeededAt?: Date;
  private _failedAt?: Date;
  private _refundedAt?: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(probs: PaymentProps) {
    this._id = probs.id || randomUUID();
    this._userId = probs.userId;
    this._amount = probs.amount;
    this._status = probs.status;
    this._provider = probs.provider;
    this._providerPaymentId = probs.providerPaymentId;
    this._clientSecret = probs.clientSecret;
    this._paymentMethodType = probs.paymentMethodType;
    this._description = probs.description;
    this._metadata = probs.metadata || {};
    this._errorCode = probs.errorCode;
    this._errorMessage = probs.errorMessage;
    this._succeededAt = probs.succeededAt;
    this._failedAt = probs.failedAt;
    this._refundedAt = probs.refundedAt;
    this._createdAt = probs.createdAt || new Date();
    this._updatedAt = probs.updatedAt || new Date();
  }
  static create(
    props: Omit<PaymentProps, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Payment {
    if (props.amount.isZero() || !props.amount.isPositive()) {
      throw new DomainException('Payment amount must be greater than zero');
    }
    if (!props.userId) throw new DomainException('UserId is required');
    if (!props.provider)
      throw new DomainException('Payment provider is required');

    return new Payment({
      ...props,
      status: PaymentStatus.PENDING,
    });
  }

  static reconstitute(props: PaymentProps): Payment {
    return new Payment(props);
  }

  get id(): string {
    return this._id;
  }

  get userId(): string {
    return this._userId;
  }

  get amount(): Money {
    return this._amount;
  }

  get status(): string {
    return this._status;
  }

  get provider(): string {
    return this._provider;
  }

  get providerPaymentId(): string | undefined {
    return this._providerPaymentId;
  }

  get clientSecret(): string | undefined {
    return this._clientSecret;
  }

  get paymentMethodType(): string | undefined {
    return this._paymentMethodType;
  }

  get description(): string | undefined {
    return this._description;
  }

  get metadata(): Record<string, any> {
    return { ...this._metadata };
  }

  get errorCode(): string | undefined {
    return this._errorCode;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
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

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Business Logic Methods
  markAsProcessing(): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new DomainException(
        `Cannot mark payment as processing from status: ${this._status}`,
      );
    }
    this._status = PaymentStatus.PROCESSING;
    this._updatedAt = new Date();
  }
  markAsSucceeded(providerPaymentId: string, paymentMethodType?: string): void {
    this.ensureStatus(
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      PaymentStatus.REQUIRES_ACTION,
    );

    this._status = PaymentStatus.SUCCEEDED;
    this._providerPaymentId = providerPaymentId;
    this._paymentMethodType = paymentMethodType;
    this._succeededAt = new Date();
    this._updatedAt = new Date();
    this._errorCode = undefined;
    this._errorMessage = undefined;
  }
  markAsFailed(errorCode: string, errorMessage: string): void {
    if (
      this._status !== PaymentStatus.PENDING &&
      this._status !== PaymentStatus.PROCESSING &&
      this._status !== PaymentStatus.REQUIRES_ACTION
    ) {
      throw new DomainException(
        `Cannot mark payment as failed from status: ${this._status}`,
      );
    }
    this._status = PaymentStatus.FAILED;
    this._errorCode = errorCode;
    this._errorMessage = errorMessage;
    this._failedAt = new Date();
    this._updatedAt = new Date();
  }

  private ensureStatus(...statuses: PaymentStatus[]): void {
    if (!statuses.includes(this._status)) {
      throw new DomainException(
        `Cannot mark payment as succeeded from status: ${this._status}`,
      );
    }
  }
}
