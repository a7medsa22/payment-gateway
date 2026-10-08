import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const secretKey =
      config.get<string>('providers.stripe.secretKey') ||
      process.env.STRIPE_SECRET_KEY ||
      'sk_test_placeholder';
    const apiVersion =
      config.get<string>('providers.stripe.apiVersion') || '2023-10-16';

    return new Stripe(secretKey, {
      apiVersion: apiVersion as Stripe.LatestApiVersion,
      timeout: 20_000,
      maxNetworkRetries: 2,
      telemetry: false,
    });
  },
};
