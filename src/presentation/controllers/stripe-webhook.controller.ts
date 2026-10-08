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
import { HandlePaymentWebhookUseCase } from '@application/use-cases/handle-payment-webhook/handle-payment-webhook.use-case';
import { StripeWebhookEventMapper } from '@infrastructure/gateways/stripe-webhook-event.mapper';
import { STRIPE_CLIENT } from '@infrastructure/gateways/stripe-client.provider';
import { RawBody } from '../decorators/raw-body.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly webhookEventRepository: WebhookEventRepository;
  private readonly handlePaymentWebhookUseCase: HandlePaymentWebhookUseCase;

  constructor(
    private readonly configService: ConfigService,
    @Inject('WebhookEventRepository')
    webhookEventRepositoryOrPaymentRepo:
      | WebhookEventRepository
      | PaymentRepository,
    @Optional()
    @Inject(HandlePaymentWebhookUseCase)
    handlePaymentWebhookUseCaseOrWebhookRepo?:
      | HandlePaymentWebhookUseCase
      | WebhookEventRepository,
    @Optional()
    @Inject(STRIPE_CLIENT)
    stripeClient?: Stripe,
  ) {
    if (
      handlePaymentWebhookUseCaseOrWebhookRepo &&
      'claim' in handlePaymentWebhookUseCaseOrWebhookRepo
    ) {
      // Legacy signature: (configService, paymentRepository, webhookEventRepository, stripeClient)
      this.webhookEventRepository = handlePaymentWebhookUseCaseOrWebhookRepo;
      this.handlePaymentWebhookUseCase = new HandlePaymentWebhookUseCase(
        webhookEventRepositoryOrPaymentRepo as PaymentRepository,
        this.webhookEventRepository,
      );
    } else {
      // Clean Architecture signature: (configService, webhookEventRepository, handlePaymentWebhookUseCase, stripeClient)
      this.webhookEventRepository =
        webhookEventRepositoryOrPaymentRepo as WebhookEventRepository;
      this.handlePaymentWebhookUseCase =
        handlePaymentWebhookUseCaseOrWebhookRepo as HandlePaymentWebhookUseCase;
    }

    const secretKey =
      this.configService.get<string>('providers.stripe.secretKey') ||
      process.env.STRIPE_SECRET_KEY ||
      'sk_test_placeholder';
    const apiVersion = this.configService.get<string>(
      'providers.stripe.apiVersion',
    );

    this.stripe =
      stripeClient ??
      new Stripe(secretKey, {
        apiVersion: (apiVersion as Stripe.LatestApiVersion) || '2023-10-16',
        timeout: 20_000,
        maxNetworkRetries: 2,
        telemetry: false,
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
      const providerEvent = StripeWebhookEventMapper.toDomain(event);
      const status = await this.handlePaymentWebhookUseCase.execute(
        'STRIPE',
        providerEvent,
      );
      return { received: true, status };
    } catch (error) {
      await this.webhookEventRepository
        .markFailed('STRIPE', event.id, (error as Error).message)
        .catch(() => undefined);
      throw error;
    }
  }
}
