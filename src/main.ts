import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './presentation/filters/http-exception.filter';
import { SensitiveDataRedactionInterceptor } from './presentation/interceptors/sensitive-data-redaction.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // REST API Global Versioning Prefix
  app.setGlobalPrefix('api/v1');

  // Global DTO Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Domain & HTTP Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Sensitive Data Redaction Interceptor (prevents credential leakage in logs)
  app.useGlobalInterceptors(new SensitiveDataRedactionInterceptor());

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Payment Gateway API')
    .setDescription(
      'Production-grade Payment Microservice following Clean Architecture & DDD',
    )
    .setVersion('1.0')
    .addTag('Payments', 'Payment processing and lifecycle operations')
    .addTag('Webhooks', 'Provider webhook event ingestion')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
