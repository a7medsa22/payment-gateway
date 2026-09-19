import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreatePaymentUseCase } from '@application/use-cases/create-payment/create-payment.use-case';
import { GetPaymentUseCase } from '@application/use-cases/get-payment/get-payment.use-case';
import { RefundPaymentUseCase } from '@application/use-cases/refund-payment/refund-payment.use-case';
import { PaymentResultDto } from '@application/dtos/payment-result.dto';
import { PaymentDetailDto } from '@application/dtos/payment-detail.dto';
import { RefundResultDto } from '@application/dtos/refund-result.dto';
import { CreatePaymentRequestDto } from '../dtos/create-payment.request.dto';
import { RefundPaymentRequestDto } from '../dtos/refund-payment.request.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    private readonly refundPaymentUseCase: RefundPaymentUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create and authorize a new payment' })
  @ApiResponse({
    status: 201,
    description: 'Payment successfully created and initialized with gateway',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or domain validation failure',
  })
  @ApiResponse({
    status: 502,
    description: 'Upstream payment gateway failure',
  })
  async create(
    @Body() dto: CreatePaymentRequestDto,
  ): Promise<PaymentResultDto> {
    return this.createPaymentUseCase.execute({
      userId: dto.userId,
      amount: dto.amount,
      currency: dto.currency,
      provider: dto.provider,
      description: dto.description,
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payment details by ID' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiQuery({
    name: 'userId',
    description: 'ID of the requesting user (ownership check)',
    required: true,
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Payment found and details returned',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requesting user does not own this payment',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  async findOne(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ): Promise<PaymentDetailDto> {
    return this.getPaymentUseCase.execute(id, userId);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate a full or partial refund for a payment' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Refund processed successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requesting user does not own this payment',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: 422,
    description: 'Payment is not in a refundable state or refund amount exceeds balance',
  })
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundPaymentRequestDto,
  ): Promise<RefundResultDto> {
    return this.refundPaymentUseCase.execute({
      paymentId: id,
      userId: dto.userId,
      amount: dto.amount,
      currency: dto.currency,
      reason: dto.reason,
    });
  }
}
