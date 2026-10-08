import { Injectable, Inject, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentGateway,
  CreatePaymentGatewayRequest,
  CreatePaymentGatewayResult,
  RefundPaymentGatewayRequest,
  RefundPaymentGatewayResult,
  RetrievedPaymentDetails,
} from '@application/ports/payment-gateway.port';
import { PaymentGatewayException } from '@application/exceptions/payment-gateway.exception';
import { STRIPE_CLIENT } from './stripe-client.provider';

@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(
    @Optional()
    @Inject(STRIPE_CLIENT)
    stripeOrKey?: Stripe | string,
    apiVersion?: string,
  ) {
    if (typeof stripeOrKey === 'string') {
      this.stripe = new Stripe(stripeOrKey, {
        apiVersion: (apiVersion as Stripe.LatestApiVersion) || '2023-10-16',
        timeout: 20_000,
        maxNetworkRetries: 2,
        telemetry: false,
      });
    } else if (stripeOrKey) {
      this.stripe = stripeOrKey;
    } else {
      this.stripe = new Stripe('sk_test_placeholder', {
        apiVersion: (apiVersion as Stripe.LatestApiVersion) || '2023-10-16',
        timeout: 20_000,
        maxNetworkRetries: 2,
        telemetry: false,
      });
    }
  }

  async createPayment(
    request: CreatePaymentGatewayRequest,
  ): Promise<CreatePaymentGatewayResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: request.amount,
          currency: request.currency.toLowerCase(),
          description: request.description,
          metadata: {
            paymentId: request.paymentId,
          },
        },
        { idempotencyKey: request.idempotencyKey },
      );

      return {
        providerPaymentId: paymentIntent.id,
        status: this.mapStatus(paymentIntent.status),
        clientSecret: paymentIntent.client_secret ?? undefined,
      };
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async refundPayment(
    request: RefundPaymentGatewayRequest,
  ): Promise<RefundPaymentGatewayResult> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: request.providerPaymentId,
          amount: request.amount,
          metadata: {
            paymentId: request.paymentId,
            refundTxId: request.refundTxId,
            ...(request.reason ? { reason: request.reason } : {}),
          },
        },
        { idempotencyKey: `refund:${request.refundTxId}` },
      );

      return {
        providerRefundId: refund.id,
        status:
          refund.status === 'succeeded'
            ? 'succeeded'
            : refund.status === 'failed'
              ? 'failed'
              : 'pending',
      };
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async retrievePayment(
    providerPaymentId: string,
  ): Promise<RetrievedPaymentDetails> {
    try {
      const intent =
        await this.stripe.paymentIntents.retrieve(providerPaymentId);

      let status: 'pending' | 'succeeded' | 'failed' | 'canceled';
      if (intent.status === 'succeeded') {
        status = 'succeeded';
      } else if (intent.status === 'canceled') {
        status = 'canceled';
      } else if (
        intent.status === 'requires_payment_method' &&
        intent.last_payment_error
      ) {
        status = 'failed';
      } else {
        status = 'pending';
      }

      return {
        status,
        amount: intent.amount,
        currency: intent.currency.toUpperCase(),
        clientSecret: intent.client_secret ?? undefined,
      };
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  private mapStatus(
    stripeStatus: Stripe.PaymentIntent.Status,
  ): 'pending' | 'succeeded' | 'failed' {
    switch (stripeStatus) {
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private handleStripeError(error: unknown): PaymentGatewayException {
    if (error instanceof Stripe.errors.StripeCardError) {
      return new PaymentGatewayException(`Payment declined: ${error.message}`, false, {
        cause: error,
      });
    }

    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return new PaymentGatewayException(
        `Invalid payment request: ${error.message}`,
        false,
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return new PaymentGatewayException(
        'Payment provider authentication failed',
        false,
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return new PaymentGatewayException(
        'Payment provider rate limit exceeded',
        false,
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeIdempotencyError) {
      return new PaymentGatewayException(
        `Payment provider idempotency error: ${error.message}`,
        false,
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeConnectionError) {
      return new PaymentGatewayException('Payment provider unavailable', true, {
        cause: error,
      });
    }

    if (error instanceof Stripe.errors.StripeAPIError) {
      return new PaymentGatewayException(
        `Payment provider error: ${error.message}`,
        true,
        { cause: error },
      );
    }

    return new PaymentGatewayException('Unexpected payment provider error', true, {
      cause: error,
    });
  }
}
