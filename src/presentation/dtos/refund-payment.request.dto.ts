import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { Currency, SUPPORTED_CURRENCIES } from '@domain/enums';

export class RefundPaymentRequestDto {
  @ApiProperty({
    description: 'ID of the user requesting the refund (ownership check)',
    example: 'usr_abc123',
  })
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({
    description:
      'Partial refund amount as a decimal string. If omitted, a full refund of the remaining balance is executed.',
    example: '19.99',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a valid positive decimal string with up to 4 decimal places',
  })
  amount?: string;

  @ApiPropertyOptional({
    description: 'ISO 4217 3-letter currency code (must match payment currency)',
    enum: SUPPORTED_CURRENCIES,
    example: 'USD',
  })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency?: Currency;

  @ApiPropertyOptional({
    description: 'Reason for the refund',
    example: 'Customer requested cancellation',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
