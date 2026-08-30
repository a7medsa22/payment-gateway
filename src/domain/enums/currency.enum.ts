export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'EGP',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
