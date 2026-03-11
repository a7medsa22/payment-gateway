import { registerAs } from '@nestjs/config';
import { PaymentProvider } from '@shared/constants/payment.constants';

export default registerAs('providers', () => ({
  defaultProvider:
    (process.env.PAYMENT_DEFAULT_PROVIDER as PaymentProvider) ||
    PaymentProvider.STRIPE,
  stripe: {
    enabled: process.env.STRIPE_ENABLED
      ? process.env.STRIPE_ENABLED === 'true'
      : true,
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  paymob: {
    enabled: process.env.PAYMOB_ENABLED
      ? process.env.PAYMOB_ENABLED === 'true'
      : false,
    apiKey: process.env.PAYMOB_API_KEY || '',
    integrationId: process.env.PAYMOB_INTEGRATION_ID
      ? parseInt(process.env.PAYMOB_INTEGRATION_ID, 10)
      : undefined,
    iframeId: process.env.PAYMOB_IFRAME_ID
      ? parseInt(process.env.PAYMOB_IFRAME_ID, 10)
      : undefined,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET || '',
  },
}));
