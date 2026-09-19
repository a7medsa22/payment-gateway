import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  Currency,
  PaymentProvider,
  SUPPORTED_CURRENCIES,
} from '@domain/enums';

export class CreatePaymentRequestDto {
  @ApiProperty({
    description: 'Unique identifier of the user creating the payment',
    example: 'usr_abc123',
  })
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @ApiProperty({
    description: 'Payment amount as a decimal string (up to 4 decimal places)',
    example: '49.99',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a valid positive decimal string with up to 4 decimal places',
  })
  amount!: string;

  @ApiProperty({
    description: 'ISO 4217 3-letter currency code',
    enum: SUPPORTED_CURRENCIES,
    example: 'USD',
  })
  @IsNotEmpty()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency!: Currency;

  @ApiProperty({
    description: 'Payment provider name',
    enum: PaymentProvider,
    example: PaymentProvider.STRIPE,
  })
  @IsNotEmpty()
  @IsEnum(PaymentProvider, {
    message: `provider must be one of: ${Object.values(PaymentProvider).join(', ')}`,
  })
  provider!: PaymentProvider;

  @ApiPropertyOptional({
    description: 'Optional description of the payment',
    example: 'Monthly subscription payment',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
