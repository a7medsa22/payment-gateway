import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  DomainException,
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { ForbiddenAccessException } from '@domain/exceptions/forbidden-access.exception';
import { PaymentGatewayException } from '@infrastructure/gateways/payment-gateway.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let error: string;
    let message: string | string[];

    // Order matters: check from most specific to least specific
    if (exception instanceof ForbiddenAccessException) {
      statusCode = HttpStatus.FORBIDDEN;
      error = 'ForbiddenAccessException';
      message = exception.message;
    } else if (exception instanceof PaymentNotFoundException) {
      statusCode = HttpStatus.NOT_FOUND;
      error = 'PaymentNotFoundException';
      message = exception.message;
    } else if (exception instanceof PaymentException) {
      statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
      error = 'PaymentException';
      message = exception.message;
    } else if (exception instanceof DomainException) {
      statusCode = HttpStatus.BAD_REQUEST;
      error = 'DomainException';
      message = exception.message;
    } else if (exception instanceof PaymentGatewayException) {
      statusCode = HttpStatus.BAD_GATEWAY;
      error = 'PaymentGatewayException';
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        error = (resObj.error as string) || exception.name;
        message = (resObj.message as string | string[]) || exception.message;
      } else {
        error = exception.name;
        message = String(res);
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'InternalServerError';
      message =
        exception instanceof Error ? exception.message : 'Internal server error';
      this.logger.error(
        `Unhandled exception on ${request?.method} ${request?.url}: ${
          exception instanceof Error ? exception.stack : JSON.stringify(exception)
        }`,
      );
    }

    if (statusCode >= 400 && statusCode < 500) {
      this.logger.warn(
        `Client error [${statusCode}] ${error} on ${request?.method} ${request?.url}: ${JSON.stringify(message)}`,
      );
    } else if (statusCode >= 500) {
      this.logger.error(
        `Server error [${statusCode}] ${error} on ${request?.method} ${request?.url}: ${JSON.stringify(message)}`,
      );
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
