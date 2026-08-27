import {
    PaymentProvider,
    TransactionStatus,
    TransactionType,
} from '@shared/constants/payment.constants';
import { Clock, systemClock } from '@domain/clock';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@domain/value-objects/money.vo';
import { DomainException } from '@domain/exceptions/domain.exception';
export interface TransactionProps {
    id?: string;
    paymentId: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: Money;
    provider: PaymentProvider;
    providerTransactionId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    processedAt?: Date;
    createdAt?: Date;
}

export class Transaction {
    private readonly _id: string;
    private readonly _paymentId: string;
    private _type: TransactionType;
    private _status: TransactionStatus;
    private readonly _amount: Money;
    private _provider: PaymentProvider;
    private _providerTransactionId?: string;
    private _description?: string;
    private _metadata?: Record<string, unknown>;
    private _processedAt?: Date;
    private readonly _createdAt?: Date;
    private readonly _clock: Clock;

    constructor(props: TransactionProps, clock: Clock = systemClock) {
        this._id = props.id || uuidv4();
        this._clock = clock;
        this._paymentId = props.paymentId;
        this._type = props.type;
        this._status = props.status;
        this._amount = props.amount;
        this._provider = props.provider;
        this._description = props.description
        this._providerTransactionId = props.providerTransactionId;
        this._metadata = Object.freeze(props.metadata ?? {});
        this._processedAt = props.processedAt;
        this._createdAt = props.createdAt ?? this._clock.now();

        this.validate();
    }

    //  Create charge transaction (used by Payment.markAsSucceeded)
    static create(
        paymentId: string,
        amount: Money,
        provider: PaymentProvider,
        providerTransactionId?: string,
        clock: Clock = systemClock,
    ): Transaction {
        return new Transaction({
            paymentId,
            type: TransactionType.CHARGE,
            status: TransactionStatus.SUCCEEDED,
            amount,
            provider,
            providerTransactionId,
            description: 'Payment charge',
            processedAt: clock.now(),
        });
    }
    //  Reconstitute from database (used by repository)
    static reconstitute(props: TransactionProps, clock: Clock = systemClock): Transaction {
        return new Transaction(props, clock);
    }

    private validate() {
        if (!this._paymentId)
            throw new DomainException(`Transaction must belong to a payment`)
        if (!this._amount.isPositive)
            throw new DomainException('Transaction amount must be positive')
    }

    // Getters
    get id(): string { return this._id; }
    get paymentId(): string { return this._paymentId; }
    get type(): TransactionType { return this._type; }
    get amount(): Money { return this._amount; }
    get status(): TransactionStatus { return this._status; }
    get provider(): PaymentProvider { return this._provider; }
    get providerTransactionId(): string | undefined { return this._providerTransactionId; }
    get description(): string | undefined { return this._description; }
    get metadata(): Record<string, any> { return { ...(this._metadata ?? {}) }; }
    get processedAt(): Date | undefined { return this._processedAt; }
    get createdAt(): Date { return this._createdAt ?? this._clock.now(); }


    // Business logic (called by Payment aggregate)
    markAsProcessing(): void {
        if (this._status !== TransactionStatus.PENDING)
            throw new DomainException('Transaction must be pending to be processed')
        this._status = TransactionStatus.PROCESSING;
    }

    markAsSucceeded(clock: Clock = systemClock): void {
        if (this._status === TransactionStatus.SUCCEEDED) return;
        if (this._status !== TransactionStatus.PROCESSING &&
            this._status !== TransactionStatus.PENDING
        ) { throw new DomainException('Transaction must be pending or processing to succeed') }

        this._status = TransactionStatus.SUCCEEDED;
        this._processedAt = clock.now();
    }
    markAsFailed(clock: Clock = systemClock): void {
        if (this._status === TransactionStatus.FAILED) return;
        if (this._status !== TransactionStatus.PROCESSING)
            throw new DomainException('Transaction must be processing to be failed')
        this._status = TransactionStatus.FAILED;
        this._processedAt = clock.now();
    }

    // Business rules
    isSuccessful(): boolean {
        return this._status === TransactionStatus.SUCCEEDED;
    }
    isFailed(): boolean {
        return this._status === TransactionStatus.FAILED;
    }
    isRefund(): boolean {
        return this._type === TransactionType.REFUND || this._type === TransactionType.PARTIAL_REFUND;
    }

    toJson(): Record<string, any> {
        return {
            id: this._id,
            paymentId: this._paymentId,
            type: this._type,
            amount: this._amount.toJSON(),
            status: this._status,
            provider: this._provider,
            providerTransactionId: this._providerTransactionId,
            description: this._description,
            metadata: this._metadata,
            processedAt: this._processedAt,
            createdAt: this._createdAt,
        };
    }
}