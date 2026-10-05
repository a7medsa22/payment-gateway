import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import Stripe from 'stripe';
import { PaymentRepository } from '@application/ports/payment.repository';
import {
  WebhookEventRepository,
  WebhookEventStatus,
} from '@application/ports/webhook-event.repository';
import { PaymentStatus, FailureReason } from '@domain/enums';
import { RawBody } from '../decorators/raw-body.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('PaymentRepository')
    private readonly paymentRepository: PaymentRepository,
    @Inject('WebhookEventRepository')
    private readonly webhookEventRepository: WebhookEventRepository,
    @Optional()
    @Inject('STRIPE_CLIENT')
    stripeClient?: Stripe,
  ) {
    const secretKey =
      this.configService.get<string>('providers.stripe.secretKey') ||
      'sk_test_placeholder';
    const apiVersion = this.configService.get<string>(
      'providers.stripe.apiVersion',
    );

    this.stripe =
      stripeClient ??
      new Stripe(secretKey, {
        apiVersion: (apiVersion as Stripe.LatestApiVersion) || '2023-10-16',
      });

    this.webhookSecret =
      this.configService.get<string>('providers.stripe.webhookSecret') || '';
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle incoming Stripe webhook events' })
  @ApiHeader({
    name: 'stripe-signature',
    description: 'Stripe webhook HMAC cryptographic signature header',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook event processed, acknowledged, or deduplicated',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing signature header or cryptographic verification failed',
  })
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @RawBody() rawBody: Buffer | string,
  ): Promise<{ received: boolean; status: string }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err: any) {
      this.logger.error(
        `Stripe webhook signature verification failed: ${err.message}`,
      );
      throw new BadRequestException(
        `Webhook signature verification failed: ${err.message}`,
      );
    }

    const claim = await this.webhookEventRepository.claim({
      id: crypto.randomUUID(),
      eventId: event.id,
      provider: 'STRIPE',
      eventType: event.type,
      payload: event.data.object as Record<string, unknown>,
    });

    if (claim === 'processed') {
      return { received: true, status: 'already_processed' };
    }

    try {
      const status = await this.dispatch(event);
      return { received: true, status };
    } catch (error) {
      await this.webhookEventRepository
        .markFailed('STRIPE', event.id, (error as Error).message)
        .catch(() => undefined);
      throw error;
    }
  }

  private async dispatch(event: Stripe.Event): Promise<string> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return this.handlePaymentIntentSucceeded(event.id, intent);
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return this.handlePaymentIntentFailed(event.id, intent);
      }
      default: {
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
        await this.webhookEventRepository.markProcessed('STRIPE', event.id);
        return 'ignored';
      }
    }
  }

  private async handlePaymentIntentSucceeded(
    eventId: string,
    intent: Stripe.PaymentIntent,
  ): Promise<string> {
    const payment = await this.findPaymentForIntent(intent);

    if (!payment) {
      this.logger.warn(`No payment found for Stripe intent ${intent.id}`);
      await this.webhookEventRepository.markProcessed('STRIPE', eventId);
      return 'payment_not_found';
    }

    const amountOk =
      intent.amount_received === payment.amount.toSmallestUnit() &&
      intent.currency === payment.amount.currency.toLowerCase();
    const intentOk =
      !payment.providerPaymentId || payment.providerPaymentId === intent.id;

    if (!amountOk || !intentOk) {
      this.logger.error(
        `[ALERT] PAYMENT_MISMATCH payment=${payment.id} intent=${intent.id} ` +
          `expected=${payment.amount.toSmallestUnit()} ${payment.amount.currency} ` +
          `got=${intent.amount_received} ${intent.currency}`,
      );
      await this.webhookEventRepository.markRequiresReview(
        'STRIPE',
        eventId,
        'amount_or_intent_mismatch',
      );
      return 'requires_review';
    }

    if (
      [
        PaymentStatus.FAILED,
        PaymentStatus.EXPIRED,
        PaymentStatus.CANCELLED,
      ].includes(payment.status)
    ) {
      this.logger.error(
        `[ALERT] CHARGE_ON_TERMINAL_PAYMENT payment=${payment.id} status=${payment.status} intent=${intent.id}`,
      );
      await this.webhookEventRepository.markRequiresReview(
        'STRIPE',
        eventId,
        `succeeded_on_${payment.status}`,
      );
      return 'requires_review';
    }

    // Idempotency: Return immediately if payment is already in terminal SUCCEEDED state
    if (payment.status === PaymentStatus.SUCCEEDED) {
      this.logger.log(
        `Payment ${payment.id} is already in SUCCEEDED state. No-op.`,
      );
      await this.webhookEventRepository.markProcessed('STRIPE', eventId);
      return 'already_succeeded';
    }

    if (payment.status === PaymentStatus.CREATED) {
      payment.start();
    }

    if (
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.PROCESSING
    ) {
      payment.succeed(intent.id);
      await this.paymentRepository.save(payment);
    }

    await this.webhookEventRepository.markProcessed('STRIPE', eventId);
    return 'succeeded';
  }

  private async handlePaymentIntentFailed(
    eventId: string,
    intent: Stripe.PaymentIntent,
  ): Promise<string> {
    const payment = await this.findPaymentForIntent(intent);

    if (!payment) {
      this.logger.warn(`No payment found for Stripe intent ${intent.id}`);
      await this.webhookEventRepository.markProcessed('STRIPE', eventId);
      return 'payment_not_found';
    }

    // Idempotency: Return immediately if payment is already in a terminal failure state
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.EXPIRED
    ) {
      this.logger.log(
        `Payment ${payment.id} is already in terminal failed state (${payment.status}). No-op.`,
      );
      await this.webhookEventRepository.markProcessed('STRIPE', eventId);
      return 'already_failed';
    }

    if (payment.status === PaymentStatus.CREATED) {
      payment.start();
    }

    if (
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.PROCESSING
    ) {
      const errorCode = intent.last_payment_error?.code ?? 'payment_failed';
      payment.fail(errorCode, FailureReason.PROVIDER_ERROR);
      await this.paymentRepository.save(payment);
    }

    await this.webhookEventRepository.markProcessed('STRIPE', eventId);
    return 'failed';
  }

  private async findPaymentForIntent(intent: Stripe.PaymentIntent) {
    const paymentId = intent.metadata?.paymentId;
    if (paymentId) {
      const payment = await this.paymentRepository.findById(paymentId);
      if (payment) return payment;
    }
    return this.paymentRepository.findByProviderPaymentId(intent.id);
  }
}
