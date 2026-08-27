import { DomainException } from "@domain/exceptions/domain.exception";
import { Money } from "@domain/value-objects/money.vo";
import { PaymentStatus } from "@shared/constants/payment.constants";
import { UUID } from "crypto";

type PaymentId = UUID;
type PayerId = string;
interface CreatePaymentProps {
    id: PaymentId;
    money: Money;
    payer: PayerId;
}

export class Payment {
    
    private constructor(
        private readonly id: PaymentId,
        private readonly money: Money,
        private status: PaymentStatus,
        private readonly payer: string,
        private providerPaymentId?: string,
    ) { }
    static create(props: CreatePaymentProps):Payment {
        if (!props.id) throw new DomainException('Payment id is required')
        if (!props.payer) throw new DomainException('payment provider not found')
        return new Payment(
            props.id,
            props.money,
            PaymentStatus.CREATED,
            props.payer,
        )
    }
    start(): void {
        if(this.status !== PaymentStatus.CREATED)
            throw new DomainException('Payment already started')
        this.status = PaymentStatus.PENDING;
    }
    markAsSuccess():void{
        this.ensureStatus(
            PaymentStatus.PENDING,
            PaymentStatus.PROCESSING,
            PaymentStatus.REQUIRES_ACTION,
            PaymentStatus.FAILED
        );
        this.status = PaymentStatus.SUCCEEDED;
    }
       
    markAsFailed():void{
        this.ensureStatus(
            PaymentStatus.PROCESSING,
            PaymentStatus.REQUIRES_ACTION,
            PaymentStatus.SUCCEEDED
        )
        this.status = PaymentStatus.FAILED;
    }
    
     private ensureStatus(...statuses: PaymentStatus[]): void {
    if (!statuses.includes(this.status)) {
      throw new DomainException(
        `Cannot mark payment as succeeded from status: ${this.status}`,
      );
    }

}