import { Currency, SUPPORTED_CURRENCIES, PaymentProvider } from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';

export function validateCurrency(value: string): Currency {
  if (!SUPPORTED_CURRENCIES.includes(value as Currency)) {
    throw new DomainException(`Unsupported currency: ${value}`);
  }
  return value as Currency;
}

export function validateProvider(value: string): PaymentProvider {
  const validProviders = Object.values(PaymentProvider);
  if (!validProviders.includes(value as PaymentProvider)) {
    throw new DomainException(`Unsupported payment provider: ${value}`);
  }
  return value as PaymentProvider;
}
