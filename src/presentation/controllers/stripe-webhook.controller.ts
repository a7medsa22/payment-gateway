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
import { WebhookEventRepository } from '@application/ports/webhook-event.repository';
import { PaymentStatus, FailureReason } from '@domain/enums';
import { WebhookEventStatus } from '@infrastructure/persistence/typeorm/schemas/webhook-event.schema';
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

    // Deduplication check (Persistent WebhookEvent table)
    const isDuplicate = await this.webhookEventRepository.exists(
      'STRIPE',
      event.id,
    );
    if (isDuplicate) {
      this.logger.log(
        `Stripe webhook event ${event.id} already processed. Skipping.`,
      );
      return { received: true, status: 'already_processed' };
    }

    // Persist incoming event record
    await this.webhookEventRepository.record({
      id: crypto.randomUUID(),
      eventId: event.id,
      provider: 'STRIPE',
      eventType: event.type,
      status: WebhookEventStatus.RECEIVED,
      payload: event.data.object as Record<string, unknown>,
    });

    // Handle supported events
    let resultStatus = 'ignored';
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        resultStatus = await this.handlePaymentIntentSucceeded(event.id, intent);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        resultStatus = await this.handlePaymentIntentFailed(event.id, intent);
        break;
      }
      default: {
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
        await this.webhookEventRepository.markProcessed('STRIPE', event.id);
        resultStatus = 'ignored';
      }
    }

    return { received: true, status: resultStatus };
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
