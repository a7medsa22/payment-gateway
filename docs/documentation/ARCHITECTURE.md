# Architecture Documentation - Enterprise Grade ✨

## Table of Contents

- [Overview](#overview)
- [Enterprise Architecture](#enterprise-architecture)
- [Domain-Driven Design](#domain-driven-design)
- [Critical Patterns Implemented](#critical-patterns-implemented)
- [Layer Architecture](#layer-architecture)
- [Data Flow](#data-flow)
- [Key Improvements](#key-improvements)
- [Architecture Decision Records](#architecture-decision-records)

---

## Overview

The Payment Microservice is built using **Enterprise-Grade DDD + Clean Architecture** with critical patterns for financial systems.

### Core Principles

1. ✅ **Financial Accuracy**: Decimal.js for precise calculations
2. ✅ **Data Consistency**: Unit of Work + Aggregate pattern
3. ✅ **No Duplicate Charges**: Idempotency built-in
4. ✅ **Full Traceability**: Correlation & causation tracking
5. ✅ **Concurrency Safety**: Optimistic locking
6. ✅ **Fault Tolerance**: Circuit breakers for providers

---

## Enterprise Architecture

### Aggregate Root Pattern (DDD)

```typescript
┌─────────────────────────────────────────┐
│         Payment (Aggregate Root)        │
│  - Ensures all invariants               │
│  - Contains domain events               │
│  - Tracks version (optimistic locking)  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Transaction (Child Entity)     │    │
│  │  - Only created by Payment      │    │
│  │  - Private constructor          │    │
│  │  - Cannot exist independently   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Key Points:**
- Payment is the aggregate root
- Transactions are child entities within the aggregate boundary
- Transaction constructor is private - only Payment can create them
- All changes to Payment or Transaction go through Payment methods

**Example:**
```typescript
// ❌ WRONG - Cannot create transaction independently
const transaction = new Transaction({...}); // Error: private constructor

// ✅ CORRECT - Transaction created through aggregate
const payment = Payment.create({...});
const transaction = payment.processRefund(amount); // Payment creates it
```

---

### Unit of Work Pattern

```
┌────────────────────────────────────────────────────┐
│              Use Case Execution                    │
│                                                    │
│  1. unitOfWork.begin()                             │
│     ├─ Start database transaction                  │
│     └─ Initialize event collector                  │
│                                                    │
│  2. Business Logic                                 │
│     ├─ Create/modify aggregates                    │
│     ├─ Domain events auto-added to aggregates      │
│     └─ Save aggregates to UoW                      │
│                                                    │
│  3. unitOfWork.commit()                            │
│     ├─ Collect events from all aggregates          │
│     ├─ Save all changes to database (ACID)         │
│     ├─ Publish all events to message broker        │
│     └─ If any step fails → ROLLBACK everything     │
└────────────────────────────────────────────────────┘
```

**Critical Benefits:**
- Atomic operations: Database + Events together
- Automatic event collection from aggregates
- Transaction safety
- No lost events
- No orphaned database records

**Code Example:**
```typescript
await unitOfWork.begin();
try {
  // Create payment (events auto-added to aggregate)
  const payment = Payment.create({...});
  
  // Save payment (UoW collects its events)
  await unitOfWork.payments.save(payment);
  
  // Commit: saves DB + publishes events atomically
  await unitOfWork.commit();
} catch (error) {
  await unitOfWork.rollback(); // All or nothing
  throw error;
}
```

---

### Money Value Object with Decimal Precision

```typescript
// Problem: JavaScript numbers are floating-point
0.1 + 0.2 = 0.30000000000000004 ❌

// Solution: Decimal.js for exact arithmetic
import Decimal from 'decimal.js';

export class Money {
  private readonly _amount: Decimal;
  
  add(other: Money): Money {
    const result = this._amount.plus(other._amount);
    return new Money(result, this._currency);
  }
}

// Result:
Money.from(0.1, 'USD').add(Money.from(0.2, 'USD'))
// = Money(0.3, 'USD') ✅ CORRECT
```

**Features:**
- Arbitrary precision decimal arithmetic
- Immutable (thread-safe)
- Currency enforcement
- Split payments with `allocate()`
- Provider conversion with `toCents()`

---

## Domain-Driven Design

### Aggregates

**Payment Aggregate:**
```typescript
export class Payment extends AggregateRoot {
  private _id: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _transactions: Transaction[] = []; // Child entities
  
  // Aggregate ensures invariants
  processRefund(amount: Money): Transaction {
    if (!this.canBeRefunded()) {
      throw new DomainException('Cannot refund');
    }
    
    // Creates child entity
    const transaction = Transaction.createRefund(this._id, amount);
    this._transactions.push(transaction);
    
    // Updates own state
    this._status = PaymentStatus.REFUNDED;
    
    // Adds domain event
    this.addDomainEvent(new PaymentRefundedEvent(this, amount));
    
    return transaction;
  }
}
```

**Subscription Aggregate:**
```typescript
export class Subscription extends AggregateRoot {
  private _billingHistory: BillingCycle[] = []; // Child entities
  
  renew(): void {
    if (!this.canBeRenewed()) {
      throw new DomainException('Cannot renew');
    }
    
    const cycle = BillingCycle.createNext(this._currentPeriodEnd);
    this._billingHistory.push(cycle);
    
    this._currentPeriodStart = cycle.start;
    this._currentPeriodEnd = cycle.end;
    
    this.addDomainEvent(new SubscriptionRenewedEvent(this));
  }
}
```

### Domain Events with Correlation

```typescript
export class DomainEvent {
  eventId: string;
  aggregateVersion: number;  // For event sourcing
  correlationId: string;     // Trace entire request
  causationId: string;       // What caused this event
  
  constructor(aggregateId, aggregateVersion, metadata) {
    this.eventId = uuidv4();
    this.aggregateVersion = aggregateVersion;
    this.correlationId = metadata.correlationId || uuidv4();
    this.causationId = metadata.causationId || this.eventId;
  }
}

// Event chain with full tracing:
PaymentCreatedEvent {
  eventId: 'evt_1',
  correlationId: 'req_abc',
  causationId: 'evt_1'
}
  ↓ causes
PaymentSucceededEvent {
  eventId: 'evt_2',
  correlationId: 'req_abc',  // Same request
  causationId: 'evt_1'        // Caused by evt_1
}
```

---

## Critical Patterns Implemented

### 1. Idempotency Pattern

**Problem**: User clicks "Pay" button twice → charged twice

**Solution**: Idempotency key caching

```typescript
export class CreatePaymentUseCase {
  async execute(command: CreatePaymentCommand) {
    // Check cache first
    if (command.idempotencyKey) {
      const cached = await this.idempotency.get(command.idempotencyKey);
      if (cached) return cached; // Return previous result
    }
    
    // Process payment...
    const result = await this.processPayment(command);
    
    // Cache for 24 hours
    if (command.idempotencyKey) {
      await this.idempotency.set(command.idempotencyKey, result, { ttl: 86400 });
    }
    
    return result;
  }
}

// Usage:
const command = new CreatePaymentCommand();
command.idempotencyKey = 'user_123_order_456'; // Unique per operation
```

**Benefits:**
- Prevents duplicate charges
- Safe retries
- Client controls deduplication

---

### 2. Optimistic Locking Pattern

**Problem**: Concurrent updates overwrite each other

```typescript
// Thread 1: Read payment (version 1)
// Thread 2: Read payment (version 1)
// Thread 1: Update payment → version 2 ✓
// Thread 2: Update payment → overwrites Thread 1 ❌
```

**Solution**: Version tracking in aggregates

```typescript
export abstract class AggregateRoot {
  private _version: number = 1;
  
  protected incrementVersion(): void {
    this._version++; // Increments on each state change
  }
}

// Database schema:
@Entity()
export class PaymentSchema {
  @VersionColumn() // TypeORM automatic optimistic locking
  version: number;
}

// Concurrent update attempt:
// Thread 2 tries to update version 1 → throws OptimisticLockError ✓
```

---

### 3. Circuit Breaker Pattern

**Problem**: Payment provider down → cascading failures

**Solution**: Circuit breaker with opossum

```typescript
import CircuitBreaker from 'opossum';

export class StripeAdapter {
  private breaker: CircuitBreaker;
  
  constructor() {
    this.breaker = new CircuitBreaker(this.callStripe.bind(this), {
      timeout: 3000,        // 3 second timeout
      errorThreshold: 50,   // Open after 50% errors
      resetTimeout: 30000,  // Try again after 30 seconds
    });
    
    this.breaker.on('open', () => {
      logger.error('Stripe circuit breaker opened');
      metrics.increment('stripe.circuit_breaker.open');
    });
  }
  
  async createPayment(request) {
    return await this.breaker.fire(request);
  }
}
```

**Benefits:**
- Fast failure when provider is down
- Prevents resource exhaustion
- Auto-recovery when provider returns

---

### 4. Specification Pattern

**Problem**: Business rules scattered everywhere

**Solution**: Encapsulated specifications

```typescript
export interface ISpecification<T> {
  isSatisfiedBy(entity: T): boolean;
  getErrorMessage(): string;
}

export class PaymentCanBeRefundedSpec implements ISpecification<Payment> {
  isSatisfiedBy(payment: Payment): boolean {
    return payment.status === PaymentStatus.SUCCEEDED 
      && payment.amount.isPositive()
      && !this.isRefundWindowExpired(payment);
  }
  
  getErrorMessage(): string {
    return 'Payment cannot be refunded';
  }
  
  private isRefundWindowExpired(payment: Payment): boolean {
    const daysSincePayment = this.getDaysSince(payment.succeededAt);
    return daysSincePayment > 90; // 90-day refund window
  }
}

// Usage in domain:
const spec = new PaymentCanBeRefundedSpec();
if (!spec.isSatisfiedBy(payment)) {
  throw new DomainException(spec.getErrorMessage());
}
```

---

## Layer Architecture

### Domain Layer (Core)

**Purpose**: Pure business logic, no dependencies

**Components:**
```
domain/
├── common/
│   ├── aggregate-root.base.ts      # Base for all aggregates
│   └── domain-event.base.ts        # Event sourcing support
├── aggregates/
│   ├── payment.aggregate.ts        # Payment + Transactions
│   └── subscription.aggregate.ts   # Subscription + Billing Cycles
├── entities/
│   ├── transaction.entity.ts       # Child of Payment
│   └── billing-cycle.entity.ts     # Child of Subscription
├── value-objects/
│   ├── money.vo.ts                 # Decimal.js precision
│   └── payment-status.vo.ts        # Type-safe status
├── services/
│   ├── provider-selection.service.ts  # Domain logic
│   └── payment-validation.service.ts
├── specifications/
│   └── payment.specifications.ts   # Business rules
└── events/
    ├── payment.events.ts
    └── subscription.events.ts
```

**Rules:**
- No infrastructure dependencies
- No framework dependencies
- Pure TypeScript
- Testable without database

---

### Application Layer (Orchestration)

**Purpose**: Use case workflows, no business logic

**Components:**
```
application/
├── commands/                       # CQRS Commands
│   ├── create-payment.command.ts
│   └── refund-payment.command.ts
├── queries/                        # CQRS Queries
│   ├── get-payment.query.ts
│   └── list-payments.query.ts
├── use-cases/
│   ├── payment/
│   │   ├── create-payment.use-case.ts
│   │   └── refund-payment.use-case.ts
│   └── subscription/
│       └── create-subscription.use-case.ts
├── ports/                          # Interfaces for infrastructure
│   ├── unit-of-work.interface.ts
│   ├── payment-provider.interface.ts
│   └── event-publisher.interface.ts
├── services/
│   └── idempotency.service.ts
└── dtos/
    ├── payment-response.dto.ts
    └── subscription-response.dto.ts
```

**Responsibilities:**
- Orchestrate domain objects
- Manage transactions (Unit of Work)
- Handle idempotency
- Transform domain to DTOs
- Does NOT contain business logic

---

### Infrastructure Layer (Adapters)

**Purpose**: External system integration

**Components:**
```
infrastructure/
├── persistence/
│   ├── typeorm/
│   │   ├── schemas/
│   │   │   ├── payment.schema.ts
│   │   │   └── subscription.schema.ts
│   │   ├── repositories/
│   │   │   ├── payment.repository.ts
│   │   │   └── subscription.repository.ts
│   │   └── unit-of-work.ts         # Transaction management
│   └── migrations/
├── providers/
│   ├── stripe/
│   │   ├── stripe.adapter.ts       # Anti-corruption layer
│   │   ├── stripe.mapper.ts        # Domain ↔ Stripe
│   │   └── stripe.circuit-breaker.ts
│   ├── paymob/
│   │   ├── paymob.adapter.ts
│   │   └── paymob.mapper.ts
│   └── provider.factory.ts
├── messaging/
│   ├── rabbitmq/
│   │   ├── rabbitmq.module.ts
│   │   └── event-publisher.ts
│   └── event-handlers/             # Consume events
└── config/
    ├── database.config.ts
    └── providers.config.ts
```

**Adapters:**
- Convert external formats to domain models
- Implement port interfaces from application layer
- Handle external API specifics
- No domain logic

---

### Presentation Layer (API)

**Purpose**: HTTP/gRPC interface

**Components:**
```
presentation/
├── http/
│   ├── controllers/
│   │   ├── payment.controller.ts
│   │   ├── subscription.controller.ts
│   │   └── webhook.controller.ts
│   ├── middleware/
│   │   ├── correlation-id.middleware.ts
│   │   └── logging.middleware.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── idempotency.guard.ts
│   ├── interceptors/
│   │   ├── transform.interceptor.ts
│   │   └── timeout.interceptor.ts
│   └── filters/
│       └── exception.filter.ts
└── grpc/                           # If needed
    └── payment.service.ts
```

---

## Data Flow

### Complete Payment Creation Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ POST /payments
     │ Idempotency-Key: abc123
     │ Correlation-ID: req_xyz
     ▼
┌──────────────────┐
│   Controller     │ 1. Extract headers
│                  │ 2. Validate input
│                  │ 3. Create command
└────┬─────────────┘
     │ CreatePaymentCommand
     ▼
┌──────────────────┐
│   Use Case       │ 4. Check idempotency cache
│                  │ 5. Begin Unit of Work
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ Domain Service   │ 6. Select provider (business rules)
│ (Provider        │
│  Selection)      │
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Payment         │ 7. Payment.create()
│  Aggregate       │    - Validates invariants
│                  │    - Adds PaymentCreatedEvent
│                  │    - Returns aggregate
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ Unit of Work     │ 8. UoW.payments.save(payment)
│                  │    - Collects domain events
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ Payment Provider │ 9. Stripe API call
│ (Stripe)         │    - Creates payment intent
│                  │    - Returns client secret
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Payment         │ 10. payment.setProviderPaymentId()
│  Aggregate       │     - Updates state
│                  │     - Increments version
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ Unit of Work     │ 11. UoW.commit()
│                  │     - Save to database (ACID)
│                  │     - Publish events to RabbitMQ
│                  │     - Both succeed or rollback
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ Idempotency      │ 12. Cache result
│ Service          │     - TTL: 24 hours
└────┬─────────────┘
     │
     ▼
┌──────────┐
│ Response │ PaymentResponseDto
└──────────┘
```

**If Error Occurs Anywhere:**
```
Error → UoW.rollback()
      → No database save
      → No events published
      → Idempotency not cached
      → Error returned to client
```

---

## Key Improvements

### Comparison: Before vs After

| Aspect | Before (Basic) | After (Enterprise) |
|--------|----------------|-------------------|
| **Money** | JavaScript number | Decimal.js precision ✅ |
| **Aggregates** | Anemic entities | Rich aggregates with invariants ✅ |
| **Transactions** | Separate entity | Child within aggregate ✅ |
| **Events** | Manual creation | Auto-collected in aggregates ✅ |
| **Persistence** | Direct repository | Unit of Work pattern ✅ |
| **Idempotency** | None | Built-in caching ✅ |
| **Tracing** | None | Correlation/causation ✅ |
| **Concurrency** | No protection | Optimistic locking ✅ |
| **Providers** | Direct calls | Circuit breakers ✅ |
| **Business Rules** | Scattered | Specifications ✅ |

---

## Architecture Decision Records

### ADR-001: Use Decimal.js for Money

**Status**: ✅ Implemented

**Decision**: All monetary amounts use Decimal.js instead of JavaScript number

**Rationale**:
- Financial calculations require exact precision
- JavaScript number (IEEE 754 float) causes rounding errors
- 0.1 + 0.2 = 0.30000000000000004 is unacceptable for money

**Consequences**:
- ✅ No rounding errors in calculations
- ✅ Safe for financial operations
- ⚠️ Slightly more complex than native numbers
- ⚠️ Need to convert for display

---

### ADR-002: Implement Aggregate Root Pattern

**Status**: ✅ Implemented

**Decision**: Payment is aggregate root containing Transactions

**Rationale**:
- Ensures consistency boundary
- Transaction cannot exist without Payment
- All invariants enforced through Payment methods
- Prevents orphaned transactions

**Consequences**:
- ✅ Data consistency guaranteed
- ✅ Clear ownership
- ✅ Easier to reason about
- ⚠️ Cannot query Transactions independently

---

### ADR-003: Use Unit of Work Pattern

**Status**: ✅ Implemented

**Decision**: All database operations go through Unit of Work

**Rationale**:
- Need atomic operations (database + events)
- Prevent partial failures
- Single transaction boundary
- Automatic event collection

**Consequences**:
- ✅ ACID guarantees
- ✅ No lost events
- ✅ Clean rollback on errors
- ⚠️ Requires all operations in one UoW

---

### ADR-004: Implement Idempotency

**Status**: ✅ Implemented

**Decision**: Use idempotency keys for payment operations

**Rationale**:
- Prevent duplicate charges on network retry
- Client controls deduplication
- Standard practice in payment APIs (Stripe, PayPal)

**Consequences**:
- ✅ Safe retries
- ✅ No duplicate charges
- ✅ Better UX
- ⚠️ Requires cache storage

---

### ADR-005: Correlation and Causation Tracking

**Status**: ✅ Implemented

**Decision**: All events include correlationId and causationId

**Rationale**:
- Enable distributed tracing
- Debug production issues
- Audit trail
- Event sourcing foundation

**Consequences**:
- ✅ Full request tracing
- ✅ Easy debugging
- ✅ Compliance/audit ready
- ⚠️ Slightly more complex events

---

## Conclusion

This architecture provides:

1. ✅ **Financial Accuracy** - Decimal.js precision
2. ✅ **Data Consistency** - Aggregates + Unit of Work
3. ✅ **Operational Safety** - Idempotency + Circuit Breakers
4. ✅ **Observability** - Correlation IDs + Event tracking
5. ✅ **Maintainability** - Clean Architecture + DDD
6. ✅ **Scalability** - Event-driven + Stateless

**Production Ready**: This implementation is suitable for high-volume financial transactions in enterprise environments.