# Architecture Documentation

## Table of Contents

- [Overview](#overview)
- [Clean Architecture Principles](#clean-architecture-principles)
- [Layer Architecture](#layer-architecture)
- [Design Patterns](#design-patterns)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Provider Strategy](#provider-strategy)
- [Event-Driven Architecture](#event-driven-architecture)
- [Security Architecture](#security-architecture)
- [Scalability & Performance](#scalability--performance)
- [Architecture Decision Records](#architecture-decision-records)

---

## Overview

The Payment Microservice is built using **Clean Architecture** principles, ensuring separation of concerns, testability, and maintainability. The architecture is designed to be provider-agnostic, allowing seamless integration with multiple payment processors while maintaining a consistent internal API.

### Core Architectural Goals

1. **Independence**: Business logic independent of frameworks, UI, databases, and external services
2. **Testability**: Easy to test without external dependencies
3. **UI Independence**: Can work with different presentation layers
4. **Database Independence**: Can switch databases without changing business logic
5. **Provider Independence**: Can add/remove payment providers without affecting core logic
6. **Maintainability**: Clear structure that's easy to understand and modify

---

## Clean Architecture Principles

### Dependency Rule

Dependencies only point inward. Outer layers can depend on inner layers, but inner layers cannot depend on outer layers.

```
┌─────────────────────────────────────────────────┐
│         Presentation Layer (Controllers)        │
│  ┌───────────────────────────────────────────┐  │
│  │      Infrastructure Layer (Adapters)      │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │   Application Layer (Use Cases)     │  │  │
│  │  │  ┌───────────────────────────────┐  │  │  │
│  │  │  │   Domain Layer (Entities)     │  │  │  │
│  │  │  │                               │  │  │  │
│  │  │  │  • Business Rules             │  │  │  │
│  │  │  │  • Domain Events              │  │  │  │
│  │  │  │  • Value Objects              │  │  │  │
│  │  │  │                               │  │  │  │
│  │  │  └───────────────────────────────┘  │  │  │
│  │  │                                     │  │  │
│  │  │  • Use Cases                       │  │  │
│  │  │  • DTOs                            │  │  │
│  │  │  • Port Interfaces                 │  │  │
│  │  │                                     │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  │                                           │  │
│  │  • Repository Implementations            │  │
│  │  • Payment Provider Adapters             │  │
│  │  • Event Publishers                      │  │
│  │  • External Service Clients              │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  • REST Controllers                             │
│  • GraphQL Resolvers                            │
│  • Message Queue Listeners                      │
│  • Middleware & Guards                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Depends On | Example Components |
|-------|---------------|------------|-------------------|
| **Domain** | Business logic & rules | Nothing | Payment, Subscription entities |
| **Application** | Use case orchestration | Domain | CreatePaymentUseCase |
| **Infrastructure** | External integrations | Application, Domain | StripeProvider, PostgresRepo |
| **Presentation** | API endpoints & UI | Application | PaymentController |

---

## Layer Architecture

### 1. Domain Layer (Core)

**Location**: `src/domain/`

The innermost layer containing enterprise business rules and domain logic.

#### Components

**Entities** (`src/domain/entities/`)
- `Payment`: Represents a payment transaction
- `Subscription`: Represents recurring payment subscription
- `Transaction`: Individual financial transaction record
- `PaymentMethod`: Customer payment method details

**Value Objects** (`src/domain/value-objects/`)
- `Money`: Encapsulates amount and currency
- `PaymentStatus`: Type-safe payment status
- `SubscriptionInterval`: Billing cycle definition
- `PaymentProvider`: Provider enumeration

**Domain Events** (`src/domain/events/`)
- `PaymentCreatedEvent`
- `PaymentSucceededEvent`
- `PaymentFailedEvent`
- `SubscriptionCreatedEvent`
- `SubscriptionCancelledEvent`

**Repository Interfaces** (`src/domain/repositories/`)
- `IPaymentRepository`
- `ISubscriptionRepository`
- `ITransactionRepository`

**Example: Payment Entity**

```typescript
export class Payment {
  private id: string;
  private userId: string;
  private amount: Money;
  private status: PaymentStatus;
  private provider: PaymentProvider;
  private providerPaymentId?: string;
  private metadata: Record<string, any>;
  private createdAt: Date;
  private updatedAt: Date;

  // Business rules
  canBeRefunded(): boolean {
    return this.status === PaymentStatus.SUCCEEDED 
      && this.amount.isGreaterThan(Money.zero());
  }

  markAsSucceeded(providerPaymentId: string): void {
    if (this.status !== PaymentStatus.PENDING) {
      throw new DomainException('Payment must be pending to mark as succeeded');
    }
    this.status = PaymentStatus.SUCCEEDED;
    this.providerPaymentId = providerPaymentId;
    this.updatedAt = new Date();
  }
}
```

---

### 2. Application Layer

**Location**: `src/application/`

Contains application-specific business rules and use case implementations.

#### Components

**Use Cases** (`src/application/use-cases/`)

Payment Use Cases:
- `CreatePaymentUseCase`: Create new payment
- `VerifyPaymentUseCase`: Verify payment completion
- `RefundPaymentUseCase`: Process refund
- `GetPaymentStatusUseCase`: Retrieve payment status
- `ListPaymentsUseCase`: List user payments

Subscription Use Cases:
- `CreateSubscriptionUseCase`: Create recurring subscription
- `CancelSubscriptionUseCase`: Cancel subscription
- `UpdateSubscriptionUseCase`: Modify subscription
- `GetSubscriptionUseCase`: Retrieve subscription details

**DTOs** (`src/application/dtos/`)
- Request DTOs: `CreatePaymentDto`, `CreateSubscriptionDto`
- Response DTOs: `PaymentResponseDto`, `SubscriptionResponseDto`

**Port Interfaces** (`src/application/ports/`)
- `IPaymentProvider`: Payment provider contract
- `IEventPublisher`: Event publishing contract
- `IIdGenerator`: ID generation contract

**Example: CreatePaymentUseCase**

```typescript
@Injectable()
export class CreatePaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    // 1. Create domain entity
    const payment = Payment.create({
      userId: dto.userId,
      amount: new Money(dto.amount, dto.currency),
      provider: dto.provider,
      metadata: dto.metadata,
    });

    // 2. Save to repository
    await this.paymentRepository.save(payment);

    // 3. Get appropriate provider
    const provider = this.paymentProviderFactory.getProvider(dto.provider);

    // 4. Create payment with provider
    const providerResponse = await provider.createPayment({
      amount: payment.amount.value,
      currency: payment.amount.currency,
      metadata: payment.metadata,
    });

    // 5. Update payment with provider details
    payment.setProviderPaymentId(providerResponse.paymentId);
    await this.paymentRepository.save(payment);

    // 6. Publish domain event
    await this.eventPublisher.publish(
      new PaymentCreatedEvent(payment)
    );

    // 7. Return response DTO
    return PaymentResponseDto.fromDomain(payment, providerResponse);
  }
}
```

---

### 3. Infrastructure Layer

**Location**: `src/infrastructure/`

Contains implementations of interfaces defined in inner layers.

#### Components

**Database** (`src/infrastructure/database/`)
- Repository implementations
- TypeORM schemas and entities
- Database migrations
- Connection configuration

**Payment Providers** (`src/infrastructure/payment-providers/`)
- Stripe adapter implementation
- Paymob adapter implementation
- Provider factory
- Provider configuration

**Messaging** (`src/infrastructure/messaging/`)
- RabbitMQ publisher implementation
- Message serialization
- Connection management
- Retry logic

**Example: Stripe Provider Adapter**

```typescript
@Injectable()
export class StripePaymentProvider implements IPaymentProvider {
  private stripe: Stripe;

  constructor(
    @Inject('STRIPE_CONFIG') private config: StripeConfig
  ) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  async createPayment(request: CreatePaymentRequest): Promise<ProviderPaymentResponse> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(request.amount * 100), // Convert to cents
      currency: request.currency.toLowerCase(),
      metadata: request.metadata,
    });

    return {
      paymentId: paymentIntent.id,
      status: this.mapStatus(paymentIntent.status),
      clientSecret: paymentIntent.client_secret,
    };
  }

  async verifyPayment(paymentId: string): Promise<PaymentVerificationResult> {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentId);
    
    return {
      isSuccessful: paymentIntent.status === 'succeeded',
      status: this.mapStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
    };
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      amount: amount ? Math.round(amount * 100) : undefined,
    });

    return {
      refundId: refund.id,
      status: this.mapRefundStatus(refund.status),
      amount: refund.amount / 100,
    };
  }

  async handleWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.config.webhookSecret
    );

    return this.mapWebhookEvent(event);
  }

  private mapStatus(stripeStatus: string): PaymentStatus {
    const statusMap = {
      'requires_payment_method': PaymentStatus.PENDING,
      'requires_confirmation': PaymentStatus.PENDING,
      'requires_action': PaymentStatus.PENDING,
      'processing': PaymentStatus.PROCESSING,
      'succeeded': PaymentStatus.SUCCEEDED,
      'canceled': PaymentStatus.CANCELLED,
    };

    return statusMap[stripeStatus] || PaymentStatus.FAILED;
  }
}
```

---

### 4. Presentation Layer

**Location**: `src/presentation/`

Handles HTTP requests, validation, and response formatting.

#### Components

**Controllers** (`src/presentation/controllers/`)
- `PaymentController`: Payment endpoints
- `SubscriptionController`: Subscription endpoints
- `WebhookController`: Webhook handlers

**Guards** (`src/presentation/guards/`)
- `AuthGuard`: JWT authentication
- `WebhookSignatureGuard`: Webhook signature verification
- `RateLimitGuard`: API rate limiting

**Interceptors** (`src/presentation/interceptors/`)
- `LoggingInterceptor`: Request/response logging
- `TransformInterceptor`: Response transformation
- `ErrorInterceptor`: Error handling

**Example: Payment Controller**

```typescript
@Controller('api/v1/payments')
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
export class PaymentController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentStatusUseCase,
    private readonly refundPaymentUseCase: RefundPaymentUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: User,
  ): Promise<PaymentResponseDto> {
    return await this.createPaymentUseCase.execute({
      ...dto,
      userId: user.id,
    });
  }

  @Get(':id')
  async getPayment(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<PaymentResponseDto> {
    return await this.getPaymentUseCase.execute(id, user.id);
  }

  @Post(':id/refund')
  async refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: User,
  ): Promise<RefundResponseDto> {
    return await this.refundPaymentUseCase.execute(id, dto.amount, user.id);
  }
}
```

---

## Design Patterns

### 1. Strategy Pattern (Payment Providers)

Allows runtime selection of payment provider based on business rules.

```typescript
interface IPaymentProvider {
  createPayment(request: CreatePaymentRequest): Promise<ProviderPaymentResponse>;
  verifyPayment(paymentId: string): Promise<PaymentVerificationResult>;
  refundPayment(paymentId: string, amount?: number): Promise<RefundResult>;
  handleWebhook(payload: string, signature: string): Promise<WebhookEvent>;
}

class PaymentProviderFactory {
  getProvider(providerType: PaymentProvider): IPaymentProvider {
    switch (providerType) {
      case PaymentProvider.STRIPE:
        return this.stripeProvider;
      case PaymentProvider.PAYMOB:
        return this.paymobProvider;
      default:
        throw new UnsupportedProviderError(providerType);
    }
  }
}
```

### 2. Repository Pattern

Abstracts data persistence logic from business logic.

```typescript
interface IPaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  update(payment: Payment): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### 3. Factory Pattern

Creates complex objects with proper initialization.

```typescript
class PaymentFactory {
  static create(dto: CreatePaymentDto): Payment {
    return new Payment({
      id: generateId(),
      userId: dto.userId,
      amount: new Money(dto.amount, dto.currency),
      status: PaymentStatus.PENDING,
      provider: dto.provider,
      metadata: dto.metadata,
      createdAt: new Date(),
    });
  }
}
```

### 4. Event Sourcing (Optional)

Track all payment state changes as immutable events.

```typescript
class PaymentEventStore {
  async append(event: DomainEvent): Promise<void> {
    await this.eventRepository.save({
      eventId: event.id,
      aggregateId: event.aggregateId,
      eventType: event.type,
      payload: event.data,
      timestamp: event.timestamp,
    });
  }

  async getEventsByAggregateId(aggregateId: string): Promise<DomainEvent[]> {
    const events = await this.eventRepository.findByAggregateId(aggregateId);
    return events.map(e => this.deserializeEvent(e));
  }
}
```

### 5. CQRS (Command Query Responsibility Segregation)

Separate read and write operations for better scalability.

```typescript
// Command (Write)
class CreatePaymentCommand {
  constructor(
    public readonly userId: string,
    public readonly amount: number,
    public readonly currency: string,
  ) {}
}

// Query (Read)
class GetPaymentQuery {
  constructor(public readonly paymentId: string) {}
}

// Command Handler
class CreatePaymentCommandHandler {
  async handle(command: CreatePaymentCommand): Promise<string> {
    // Write to primary database
    const payment = Payment.create(command);
    await this.paymentRepository.save(payment);
    return payment.id;
  }
}

// Query Handler
class GetPaymentQueryHandler {
  async handle(query: GetPaymentQuery): Promise<PaymentReadModel> {
    // Read from optimized read database/cache
    return await this.paymentReadRepository.findById(query.paymentId);
  }
}
```

---

## Component Architecture

### Module Structure

```
payment-microservice/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── payment.entity.ts
│   │   │   ├── subscription.entity.ts
│   │   │   └── transaction.entity.ts
│   │   ├── value-objects/
│   │   │   ├── money.vo.ts
│   │   │   ├── payment-status.vo.ts
│   │   │   └── subscription-interval.vo.ts
│   │   ├── events/
│   │   │   ├── payment-created.event.ts
│   │   │   ├── payment-succeeded.event.ts
│   │   │   └── subscription-created.event.ts
│   │   ├── repositories/
│   │   │   ├── payment.repository.interface.ts
│   │   │   └── subscription.repository.interface.ts
│   │   └── exceptions/
│   │       ├── domain.exception.ts
│   │       └── payment.exception.ts
│   │
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── payment/
│   │   │   │   ├── create-payment.use-case.ts
│   │   │   │   ├── verify-payment.use-case.ts
│   │   │   │   └── refund-payment.use-case.ts
│   │   │   └── subscription/
│   │   │       ├── create-subscription.use-case.ts
│   │   │       └── cancel-subscription.use-case.ts
│   │   ├── dtos/
│   │   │   ├── create-payment.dto.ts
│   │   │   └── payment-response.dto.ts
│   │   ├── ports/
│   │   │   ├── payment-provider.interface.ts
│   │   │   └── event-publisher.interface.ts
│   │   └── services/
│   │       └── payment-orchestrator.service.ts
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── repositories/
│   │   │   ├── entities/
│   │   │   └── migrations/
│   │   ├── payment-providers/
│   │   │   ├── stripe/
│   │   │   ├── paymob/
│   │   │   └── provider.factory.ts
│   │   ├── messaging/
│   │   │   ├── rabbitmq/
│   │   │   └── publishers/
│   │   └── config/
│   │       ├── database.config.ts
│   │       └── app.config.ts
│   │
│   ├── presentation/
│   │   ├── controllers/
│   │   │   ├── payment.controller.ts
│   │   │   ├── subscription.controller.ts
│   │   │   └── webhook.controller.ts
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── filters/
│   │   └── validators/
│   │
│   ├── shared/
│   │   ├── decorators/
│   │   ├── utils/
│   │   └── constants/
│   │
│   └── main.ts
```

---

## Data Flow

### Payment Creation Flow

```
┌─────────┐      ┌────────────┐      ┌───────────┐      ┌──────────┐      ┌──────────┐
│ Client  │─────▶│ Controller │─────▶│  UseCase  │─────▶│ Provider │─────▶│  Stripe  │
└─────────┘      └────────────┘      └───────────┘      └──────────┘      └──────────┘
     │                  │                   │                   │                │
     │                  │                   │                   │                │
     │                  │                   ▼                   │                │
     │                  │            ┌──────────────┐           │                │
     │                  │            │  Repository  │           │                │
     │                  │            │   (Save)     │           │                │
     │                  │            └──────────────┘           │                │
     │                  │                   │                   │                │
     │                  │                   ▼                   │                │
     │                  │            ┌──────────────┐           │                │
     │                  │            │   RabbitMQ   │           │                │
     │                  │            │   (Publish)  │           │                │
     │                  │            └──────────────┘           │                │
     │                  │                                       │                │
     │◀─────────────────────────────────────────────────────────────────────────┘
     │             Response with clientSecret
     │
```

### Webhook Processing Flow

```
┌──────────┐      ┌────────────┐      ┌───────────┐      ┌──────────────┐
│  Stripe  │─────▶│  Webhook   │─────▶│  UseCase  │─────▶│  Repository  │
│ Webhook  │      │ Controller │      │           │      │   (Update)   │
└──────────┘      └────────────┘      └───────────┘      └──────────────┘
                         │                   │                    │
                         │                   │                    │
                         ▼                   ▼                    ▼
                  ┌────────────┐      ┌──────────────┐    ┌──────────────┐
                  │  Signature │      │   Domain     │    │   RabbitMQ   │
                  │   Verify   │      │   Events     │    │   (Publish)  │
                  └────────────┘      └──────────────┘    └──────────────┘
```

---

## Provider Strategy

### Provider Selection Logic

```typescript
class ProviderSelectionStrategy {
  selectProvider(payment: Payment): PaymentProvider {
    // Rule 1: Currency-based selection
    if (payment.currency === 'EGP') {
      return PaymentProvider.PAYMOB;
    }

    // Rule 2: Region-based selection
    if (payment.userRegion === 'MENA') {
      return PaymentProvider.PAYMOB;
    }

    // Rule 3: Customer preference
    if (payment.preferredProvider) {
      return payment.preferredProvider;
    }

    // Rule 4: Cost optimization
    if (payment.amount.isLessThan(new Money(50, 'USD'))) {
      return this.getCheapestProvider(payment);
    }

    // Default
    return PaymentProvider.STRIPE;
  }
}
```

### Provider Capabilities Matrix

| Provider | One-time Payments | Subscriptions | Refunds | Currencies | Regions |
|----------|------------------|---------------|---------|------------|---------|
| **Stripe** | ✅ | ✅ | ✅ | 135+ | Global |
| **Paymob** | ✅ | ✅ | ✅ | EGP, SAR, AED | MENA |

---

## Event-Driven Architecture

### Event Flow

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Payment Service │────────▶│    RabbitMQ     │────────▶│ Order Service   │
│  (Publisher)    │         │    Exchange     │         │  (Consumer)     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                    │
                                    ├────────▶┌─────────────────┐
                                    │         │ Billing Service │
                                    │         └─────────────────┘
                                    │
                                    └────────▶┌─────────────────┐
                                              │ Analytics Svc   │
                                              └─────────────────┘
```

### Event Publishing

```typescript
class RabbitMQEventPublisher implements IEventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    const exchange = 'payment.events';
    const routingKey = event.type;
    
    await this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        messageId: event.id,
        timestamp: event.timestamp.getTime(),
        contentType: 'application/json',
      }
    );
  }
}
```

---

## Security Architecture

### Authentication Flow

```
┌────────┐      ┌──────────┐      ┌────────────┐      ┌──────────┐
│ Client │─────▶│   API    │─────▶│    Auth    │─────▶│   JWT    │
│        │      │ Gateway  │      │   Guard    │      │  Verify  │
└────────┘      └──────────┘      └────────────┘      └──────────┘
    │                                     │                  │
    │                                     │                  │
    │                  ┌──────────────────┘                  │
    │                  ▼                                     │
    │           ┌──────────────┐                             │
    │           │  Controller  │◀────────────────────────────┘
    │           └──────────────┘
    │                  │
    │                  ▼
    │           ┌──────────────┐
    └───────────│   Response   │
                └──────────────┘
```

### Webhook Security

```typescript
class WebhookSecurityService {
  verifyStripeSignature(payload: string, signature: string): boolean {
    const computedSignature = crypto
      .createHmac('sha256', this.stripeWebhookSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }

  verifyPaymobSignature(payload: string, signature: string): boolean {
    const computedSignature = crypto
      .createHmac('sha512', this.paymobSecretKey)
      .update(payload)
      .digest('hex');
    
    return computedSignature === signature;
  }
}
```

---

## Scalability & Performance

### Horizontal Scaling

```
              ┌─────────────────┐
              │ Load Balancer   │
              └─────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Instance 1  │ │  Instance 2  │ │  Instance 3  │
└──────────────┘ └──────────────┘ └──────────────┘
        │             │             │
        └─────────────┼─────────────┘
                      │
              ┌───────┴────────┐
              ▼                ▼
        ┌──────────┐    ┌──────────┐
        │PostgreSQL│    │ RabbitMQ │
        └──────────┘    └──────────┘
```

### Caching Strategy

```typescript
class PaymentCacheService {
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // 1. Check cache
    const cached = await this.redis.get(`payment:${paymentId}:status`);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Query database
    const payment = await this.paymentRepository.findById(paymentId);
    
    // 3. Cache result (5 minutes TTL)
    await this.redis.setex(
      `payment:${paymentId}:status`,
      300,
      JSON.stringify(payment.status)
    );

    return payment.status;
  }
}
```

### Database Optimization

- **Connection Pooling**: Reuse database connections
- **Indexing**: Optimize queries with proper indexes
- **Read Replicas**: Distribute read load
- **Query Optimization**: Use efficient queries and projections

```sql
-- Indexes for performance
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_transactions_payment_id ON transactions(payment_id);
```

---

## Architecture Decision Records

### ADR-001: Clean Architecture

**Status**: Accepted

**Context**: Need maintainable, testable architecture that can evolve with business needs.

**Decision**: Adopt Clean Architecture with strict layer separation.

**Consequences**:
- ✅ Clear separation of concerns
- ✅ Easy to test business logic
- ✅ Can swap infrastructure components
- ❌ More boilerplate code
- ❌ Steeper learning curve

---

### ADR-002: Provider Strategy Pattern

**Status**: Accepted

**Context**: Support multiple payment providers with ability to add more.

**Decision**: Use Strategy Pattern with Provider Factory.

**Consequences**:
- ✅ Easy to add new providers
- ✅ Provider-specific logic isolated
- ✅ Runtime provider selection
- ❌ Slight performance overhead from abstraction

---

### ADR-003: Event-Driven Communication

**Status**: Accepted

**Context**: Decouple payment service from other services.

**Decision**: Use RabbitMQ for asynchronous event publishing.

**Consequences**:
- ✅ Loose coupling between services
- ✅ Better resilience and scalability
- ✅ Audit trail through events
- ❌ Eventual consistency
- ❌ Increased system complexity

---

### ADR-004: PostgreSQL for Persistence

**Status**: Accepted

**Context**: Need reliable, ACID-compliant database for financial data.

**Decision**: Use PostgreSQL as primary database.

**Consequences**:
- ✅ ACID transactions
- ✅ Rich querying capabilities
- ✅ Good performance for read/write operations
- ✅ Strong data integrity
- ❌ Vertical scaling limitations

---

## Conclusion

This architecture provides a solid foundation for a production-ready payment microservice. The clean separation of concerns ensures that the system remains maintainable and testable as it evolves. The provider strategy pattern allows for flexibility in payment processing, while the event-driven architecture enables seamless integration with other services in your ecosystem.