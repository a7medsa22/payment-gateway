import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentGateway,
  CreatePaymentGatewayRequest,
  CreatePaymentGatewayResult,
} from '@application/ports/payment-gateway.port';
import { PaymentGatewayException } from './payment-gateway.exception';

@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(secretKey: string, apiVersion?: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: (apiVersion as Stripe.LatestApiVersion) || '2023-10-16',
    });
  }

  async createPayment(
    request: CreatePaymentGatewayRequest,
  ): Promise<CreatePaymentGatewayResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency.toLowerCase(),
        description: request.description,
        metadata: {
          paymentId: request.paymentId,
        },
      });

      return {
        providerPaymentId: paymentIntent.id,
        status: this.mapStatus(paymentIntent.status),
        clientSecret: paymentIntent.client_secret ?? undefined,
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
      return new PaymentGatewayException(`Payment declined: ${error.message}`, {
        cause: error,
      });
    }

    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return new PaymentGatewayException(
        `Invalid payment request: ${error.message}`,
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return new PaymentGatewayException(
        'Payment provider authentication failed',
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return new PaymentGatewayException(
        'Payment provider rate limit exceeded',
        { cause: error },
      );
    }

    if (error instanceof Stripe.errors.StripeConnectionError) {
      return new PaymentGatewayException('Payment provider unavailable', {
        cause: error,
      });
    }

    if (error instanceof Stripe.errors.StripeAPIError) {
      return new PaymentGatewayException(
        `Payment provider error: ${error.message}`,
        { cause: error },
      );
    }

    return new PaymentGatewayException('Unexpected payment provider error', {
      cause: error,
    });
  }
}
