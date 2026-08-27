import { CreatePaymentInput } from "@application/use-cases/create-payment/create-payment.input";
import { PaymentRepository } from "@application/repositories/payment.repository";
import { Money } from "@domain/value-objects/money.vo";
import { Currency, PaymentProvider } from "@shared/constants/payment.constants";
import { Payment } from "@domain/aggregates/payment.aggregate";

export class CreatePaymentUseCase {
    constructor(
        private  paymentRepository: PaymentRepository,
    ) {}
    async execute(input: CreatePaymentInput) {
        //1-check and convert (amount,currency) from Money
        const money = Money.from(input.amount, input.currency as Currency);
        //2 create Id for payment
        const id = crypto.randomUUID();
        //3-create payment
        const payment = Payment.create({
            id,
            userId: input.userId,
            amount: money,
            provider: input.provider as PaymentProvider,
        })
        //5-Start procces of payment
        payment.start();
        //6-save payment
        await this.paymentRepository.save(payment);
        //7-return 
        return payment
    }
}