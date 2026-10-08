import Stripe from 'stripe';
import { ProviderWebhookEvent } from '@application/ports/provider-webhook-event';

export class StripeWebhookEventMapper {
  static toDomain(event: Stripe.Event): ProviderWebhookEvent {
    switch (event.type as string) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          kind: 'payment.succeeded',
          eventId: event.id,
          paymentId: intent.metadata?.paymentId,
          providerPaymentId: intent.id,
          amountMinor: intent.amount_received,
          currency: intent.currency,
        };
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          kind: 'payment.failed',
          eventId: event.id,
          paymentId: intent.metadata?.paymentId,
          providerPaymentId: intent.id,
          errorCode: intent.last_payment_error?.code ?? 'payment_failed',
        };
      }

      case 'payment_intent.canceled': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          kind: 'payment.canceled',
          eventId: event.id,
          paymentId: intent.metadata?.paymentId,
          providerPaymentId: intent.id,
        };
      }

      case 'refund.created':
      case 'refund.updated': {
        const refund = event.data.object as Stripe.Refund;
        const providerPaymentId =
          typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : (refund.payment_intent?.id ?? '');

        if (refund.status === 'succeeded') {
          return {
            kind: 'refund.succeeded',
            eventId: event.id,
            providerPaymentId,
            providerRefundId: refund.id,
            refundTxId: refund.metadata?.refundTxId,
            amountMinor: refund.amount,
          };
        }

        if (refund.status === 'failed' || refund.status === 'canceled') {
          return {
            kind: 'refund.failed',
            eventId: event.id,
            providerPaymentId,
            providerRefundId: refund.id,
            refundTxId: refund.metadata?.refundTxId,
          };
        }

        return {
          kind: 'ignored',
          eventId: event.id,
          type: event.type,
        };
      }

      case 'refund.failed': {
        const refund = event.data.object as Stripe.Refund;
        const providerPaymentId =
          typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : (refund.payment_intent?.id ?? '');
        return {
          kind: 'refund.failed',
          eventId: event.id,
          providerPaymentId,
          providerRefundId: refund.id,
          refundTxId: refund.metadata?.refundTxId,
        };
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const providerPaymentId =
          (typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.charge) as string;
        return {
          kind: 'dispute.created',
          eventId: event.id,
          providerPaymentId,
          amountMinor: dispute.amount,
          reason: dispute.reason ?? 'unknown',
        };
      }

      default:
        return {
          kind: 'ignored',
          eventId: event.id,
          type: event.type,
        };
    }
  }
}
