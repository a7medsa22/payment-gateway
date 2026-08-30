# Architecture Documentation

## Table of Contents

- [1. Overview](#1-overview)
- [2. Architectural Principles](#2-architectural-principles)
- [3. Current Implementation](#3-current-implementation)
- [4. Target Architecture](#4-target-architecture)
- [5. Layer Responsibilities](#5-layer-responsibilities)
- [6. Dependency Rules](#6-dependency-rules)
- [7. Payment Domain Model](#7-payment-domain-model)
- [8. Payment Provider Abstraction](#8-payment-provider-abstraction)
- [9. Payment Lifecycle](#9-payment-lifecycle)
- [10. Current Architectural Problems](#10-current-architectural-problems)
- [11. Decisions & Rationale](#11-decisions--rationale)
- [12. Now / Later / Optional](#12-now--later--optional)
- [13. Phased Implementation Roadmap](#13-phased-implementation-roadmap)
- [14. Exit Criteria](#14-exit-criteria)

---

## 1. Overview

### What This Project Is

A payment gateway microservice built with **NestJS**, following **Clean Architecture** and **Domain-Driven Design** principles. Designed to support multiple payment providers (Stripe, Paymob) behind a unified, provider-agnostic interface.

### Architectural Maturity

> **Current State: Early Domain Skeleton**
>
> The project has a partial domain layer and a minimal application skeleton. Infrastructure and presentation layers are empty. The NestJS application is not wired. No API endpoints, persistence, or provider integrations exist in code.
>
> This is **not production-ready**. This document describes both what exists and what is planned.

---

## 2. Architectural Principles

1. **Clean Architecture** — Dependencies point inward. The Domain has zero external dependencies.
2. **DDD-Lite** — Aggregates protect invariants. Value Objects model domain concepts. No premature patterns.
3. **Financial Precision** — All monetary calculations use `Decimal.js` via the `Money` value object.
4. **Provider Agnosticism** — Domain and Application layers know nothing about Stripe or Paymob specifics.
5. **Introduce abstractions when justified** — No factories, specifications, CQRS, event sourcing, domain events, or message brokers unless there is a real, current need.
6. **Code is the source of truth** — Documentation must never claim a feature is implemented unless the code exists. An installed dependency does not equal an implemented feature.

---

## 3. Current Implementation

This section describes **exactly** what exists in `src/` at the time of writing.

### Directory Structure

```
src/
├── app.module.ts                        # Empty NestJS Module (imports: [])
├── main.ts                              # Standard NestJS bootstrap
├── config/
│   ├── database.config.ts               # PostgreSQL config (NestJS registerAs)
│   └── providers.config.ts              # Stripe & Paymob credentials (NestJS registerAs)
├── shared/
│   └── constants/
│       └── payment.constants.ts         # Enums, currency type, routing keys, event names
├── domain/
│   ├── clock.ts                         # Clock interface + systemClock
│   ├── exceptions/
│   │   └── domain.exception.ts          # DomainException, PaymentException, PaymentNotFoundException
│   ├── value-objects/
│   │   ├── money.vo.ts                  # Money VO (Decimal.js) — fully implemented
│   │   └── payment-status.vo.ts         # Empty file (0 bytes)
│   ├── entities/
│   │   └── transaction.entity.ts        # Transaction entity (standalone, public constructor)
│   ├── aggregates/
│   │   ├── payment.aggregate.ts         # Payment aggregate — canonical, mature (231 lines)
│   │   └── payment.ts                   # Obsolete draft — to be removed (64 lines, syntax errors)
│   ├── common/
│   │   ├── aggregate-root.base.ts       # Empty file (0 bytes)
│   │   └── domain-event.base.ts         # Empty file (0 bytes)
│   └── specifications/
│       └── payment.specifications.ts    # Empty file (0 bytes)
├── application/
│   ├── repositories/
│   │   └── payment.repository.ts        # PaymentRepository port (save only)
│   ├── use-cases/
│   │   └── creat-payment/               # ⚠️ Directory name typo (missing 'e')
│   │       ├── create-payment.input.ts  # Exports CreatePaymentInput
│   │       └── create-payment.use-case.ts  # Imports ICreatePayment (naming mismatch)
│   └── port/                            # Empty directory
├── infrastructure/                      # Empty directory
└── presentation/                        # Empty directory
```

### Component Inventory

#### ✅ Fully Implemented

| Component | File | Notes |
|:---|:---|:---|
| Money Value Object | `domain/value-objects/money.vo.ts` | Decimal.js precision, immutable, currency enforcement, arithmetic, splits, cent conversion |
| Domain Exceptions | `domain/exceptions/domain.exception.ts` | `DomainException` → `PaymentException` → `PaymentNotFoundException` |
| Clock Abstraction | `domain/clock.ts` | `Clock` interface + `systemClock` default. Enables testable time. |
| Config Schemas | `config/database.config.ts`, `config/providers.config.ts` | NestJS `registerAs()` for PostgreSQL and Stripe/Paymob credentials |
| Payment Constants | `shared/constants/payment.constants.ts` | Enums: PaymentStatus, PaymentProvider, Currency, TransactionType, TransactionStatus, FailureReason, etc. |

#### ⚠️ Partially Implemented

| Component | File | Status |
|:---|:---|:---|
| Payment Aggregate | `domain/aggregates/payment.aggregate.ts` | State machine works (start, succeed, fail, cancel, expire). Missing refund transition. Does not manage Transaction children. |
| Transaction Entity | `domain/entities/transaction.entity.ts` | Standalone entity with public constructor. Has state transitions. Not managed by Payment aggregate. |
| PaymentRepository Port | `application/repositories/payment.repository.ts` | Only `save()`. Missing `findById`, `update`. |
| CreatePaymentUseCase | `application/use-cases/creat-payment/create-payment.use-case.ts` | Has import naming mismatch. Unsafe type coercions. No provider gateway call. Returns aggregate directly. |

#### ❌ Empty / Not Implemented

| Item | Status |
|:---|:---|
| `aggregate-root.base.ts` | 0 bytes. Not needed until Domain Events are justified. |
| `domain-event.base.ts` | 0 bytes. Not needed until event publishing exists. |
| `payment-status.vo.ts` | 0 bytes. Evaluate if VO is justified vs keeping PaymentStatus as enum. |
| `payment.specifications.ts` | 0 bytes. Specification Pattern not currently justified. |
| `application/port/` | Empty directory. PaymentGateway port not yet defined. |
| `infrastructure/` | Empty directory. No persistence, no provider adapters. |
| `presentation/` | Empty directory. No HTTP controllers, no API. |
| `AppModule` | Empty module (`imports: []`). Expected at this stage — nothing to wire yet. |

> **Empty placeholder files are not evidence that the corresponding pattern is implemented.** Each placeholder is evaluated on whether the pattern it represents is currently justified.

#### Installed But Unused Dependencies

An installed dependency does not equal an implemented feature.

| Package | Installed | Implemented | Action |
|:---|:---|:---|:---|
| `stripe` | ✅ | ❌ | Keep — will be used in Phase 4 |
| `amqplib` | ✅ | ❌ | Consider removal — no RabbitMQ implementation exists or is planned for core scope |
| `@nestjs/typeorm` + `typeorm` + `pg` | ✅ | ❌ | Keep — will be used in Phase 3 |
| `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` + `bcrypt` | ✅ | ❌ | Evaluate — auth may be external |
| `@nestjs/swagger` | ✅ | ❌ | Keep — will be used in Phase 5 |
| `@nestjs/throttler` | ✅ | ❌ | Keep — will be used in Phase 6 |
| `class-validator` + `class-transformer` | ✅ | ❌ | Keep — will be used in Phase 5 |

#### Obsolete Payment Draft (`payment.ts`)

There are two Payment files in `domain/aggregates/`:

- **`payment.aggregate.ts`** (231 lines) — The canonical, mature implementation. Private constructor, `create()` and `reconstitute()` factories, five state transitions, Clock abstraction, rich property set.
- **`payment.ts`** (64 lines) — An older draft with syntax errors (missing closing brace on `ensureStatus`). Simpler, fewer transitions, different interface shape.

**Decision:** `payment.aggregate.ts` is the canonical Payment Aggregate. `payment.ts` is marked for removal in Phase 0.

---

## 4. Target Architecture

The target is a **realistic Clean Architecture payment gateway** — not an enterprise pattern showcase. Patterns are introduced only when justified by actual requirements.

### Target Directory Structure

```
src/
├── app.module.ts                        # Root module wiring all feature modules
├── main.ts                              # Bootstrap with validation pipe, Swagger
├── domain/
│   ├── aggregates/
│   │   └── payment.aggregate.ts         # Payment aggregate root (canonical, consolidated)
│   ├── entities/
│   │   └── transaction.entity.ts        # Transaction (child of Payment aggregate)
│   ├── value-objects/
│   │   └── money.vo.ts                  # Money (Decimal.js)
│   ├── enums/
│   │   ├── payment-status.enum.ts       # PaymentStatus
│   │   ├── payment-provider.enum.ts     # PaymentProvider (STRIPE, PAYMOB)
│   │   ├── currency.enum.ts             # Currency type + supported currencies
│   │   ├── failure-reason.enum.ts       # FailureReason
│   │   ├── transaction-type.enum.ts     # TransactionType
│   │   └── transaction-status.enum.ts   # TransactionStatus
│   ├── exceptions/
│   │   └── domain.exception.ts          # Domain exception hierarchy
│   └── clock.ts                         # Clock interface
├── application/
│   ├── ports/
│   │   ├── payment.repository.ts        # PaymentRepository interface
│   │   └── payment-gateway.port.ts      # PaymentGateway interface
│   ├── use-cases/
│   │   ├── create-payment/
│   │   │   ├── create-payment.input.ts
│   │   │   └── create-payment.use-case.ts
│   │   └── refund-payment/              # Only if refunds are confirmed in scope
│   │       ├── refund-payment.input.ts
│   │       └── refund-payment.use-case.ts
│   └── dtos/
│       └── payment-result.dto.ts        # Application-level result type
├── infrastructure/
│   ├── persistence/
│   │   ├── typeorm/
│   │   │   ├── schemas/
│   │   │   │   ├── payment.schema.ts
│   │   │   │   └── transaction.schema.ts
│   │   │   ├── repositories/
│   │   │   │   └── typeorm-payment.repository.ts
│   │   │   └── mappers/
│   │   │       └── payment.mapper.ts
│   │   └── typeorm.config.ts
│   ├── providers/
│   │   ├── stripe/
│   │   │   └── stripe-payment.gateway.ts
│   │   └── paymob/                      # Only if required
│   │       └── paymob-payment.gateway.ts
│   └── config/
│       ├── database.config.ts
│       └── providers.config.ts
├── presentation/
│   ├── http/
│   │   ├── controllers/
│   │   │   ├── payment.controller.ts
│   │   │   └── webhook.controller.ts
│   │   ├── dtos/
│   │   │   ├── create-payment.dto.ts
│   │   │   └── payment-response.dto.ts
│   │   └── filters/
│   │       └── domain-exception.filter.ts
│   └── payment.module.ts
└── shared/                              # Only truly cross-cutting, non-domain constants
    └── constants/
        └── injection-tokens.ts          # DI token strings (if needed)
```

### Key Differences: Current → Target

| Aspect | Current | Target |
|:---|:---|:---|
| Payment models | Two competing files | Single canonical aggregate |
| Domain enums | In `shared/constants/` | In `domain/enums/` — domain owns its concepts |
| Transaction | Standalone entity, public constructor | Child of Payment aggregate, controlled creation |
| Application ports | `PaymentRepository.save()` only | Full `PaymentRepository` + `PaymentGateway` port |
| Infrastructure | Empty | TypeORM persistence + Stripe adapter |
| Presentation | Empty | HTTP controllers + validation + error filters |
| NestJS wiring | Empty `AppModule` | Fully wired feature modules |
| Subscriptions | Constants exist, no implementation | Removed from core scope — future/optional |

---

## 5. Layer Responsibilities

### Domain Layer

**Responsibility:** Business concepts, business rules, invariants. Pure TypeScript with zero external dependencies.

**Contains:**
- **Aggregates** — Payment (protects invariants, manages state transitions)
- **Entities** — Transaction (identity-based, part of Payment boundary)
- **Value Objects** — Money (immutable, value-equality)
- **Enums** — PaymentStatus, PaymentProvider, Currency, FailureReason, TransactionType, TransactionStatus
- **Exceptions** — DomainException hierarchy
- **Clock** — Time abstraction for testability

**Rules:**
- ❌ No `@nestjs/*` imports
- ❌ No `typeorm` imports
- ❌ No `stripe` or Paymob SDK imports
- ❌ No HTTP/database/messaging concepts
- ❌ No dependency on `@shared/constants/` for core business concepts
- ✅ Pure TypeScript only
- ✅ Testable without any infrastructure

### Application Layer

**Responsibility:** Use case orchestration. Coordinates domain objects to fulfill a business operation. Does **not** contain domain business rules — those remain in the aggregate.

**Contains:**
- **Use Cases** — Orchestrate: validate input → create/load aggregate → call domain methods → call ports → return result
- **Port Interfaces** — `PaymentRepository`, `PaymentGateway` — abstractions the application depends on
- **Input types** — Plain data structures for use case inputs
- **Result DTOs** — Application-level return types (not aggregates)

**Rules:**
- ✅ Depends on Domain (uses aggregates, value objects, enums)
- ✅ Depends on port interfaces it defines (not their implementations)
- ❌ Does NOT depend on Infrastructure
- ❌ Does NOT know about HTTP, TypeORM, Stripe SDK
- ❌ Does NOT return domain aggregates to callers — returns DTOs

**Domain vs Application logic:**

| Domain Logic (inside aggregate) | Application Logic (inside use case) |
|:---|:---|
| "A payment can only succeed from PENDING or PROCESSING" | "Validate input, create Money, generate ID, create aggregate, call gateway, persist" |
| "Refund amount cannot exceed original" | "Load payment by ID, call domain refund, call gateway refund, save, return result" |
| State transition guards and invariants | Orchestration sequence and coordination |

### Infrastructure Layer

**Responsibility:** Implement external concerns — databases, payment providers, messaging. Adapters translate between the application's port interfaces and external systems.

**Contains:**
- **TypeORM schemas** — Database representation (NOT domain objects)
- **Repository implementations** — Implement `PaymentRepository` port
- **Mappers** — Domain ↔ TypeORM translation
- **Payment provider adapters** — Implement `PaymentGateway` port
- **Configuration** — Database/provider config

**Rules:**
- ✅ Implements interfaces defined in Application layer
- ✅ Depends on Domain (to map to/from domain objects)
- ❌ Business logic does NOT belong here
- ✅ Translates between external formats and domain formats
- ✅ External SDK types stay contained within adapter — never leak outward

### Presentation Layer

**Responsibility:** Transport/interface concerns. HTTP is a delivery mechanism, not business logic.

**Contains:**
- **HTTP Controllers** — Thin: validate request, delegate to use case, return response
- **Request DTOs** — With `class-validator` decorators for input validation
- **Response DTOs** — API response shapes
- **Exception Filters** — Translate domain exceptions → HTTP responses
- **NestJS module wiring** — Feature modules connecting everything

**Rules:**
- ✅ Depends on Application (invokes use cases)
- ❌ Does NOT call domain objects directly
- ❌ Does NOT contain business logic
- ✅ Handles HTTP-specific concerns (status codes, headers, validation)

---

## 6. Dependency Rules

### Inward Dependency Direction

```
Presentation → Application → Domain
                    ↑
Infrastructure ─────┘
```

- **Domain** depends on nothing external.
- **Application** depends on Domain. Defines port interfaces.
- **Infrastructure** implements Application ports. Uses Domain objects for mapping.
- **Presentation** depends on Application (calls use cases).

> **No layer may depend on a layer above it. Infrastructure and Presentation are siblings — they do not depend on each other.**

### Port/Adapter Pattern

Infrastructure adapters implement port interfaces defined in Application:

```
Application Layer
    │
    │ defines interface
    ↓
PaymentGateway (port)
    ↑
    │ implements
    │
Infrastructure Layer
    │
    ├── StripePaymentGateway
    └── PaymobPaymentGateway
```

```
Application Layer
    │
    │ defines interface
    ↓
PaymentRepository (port)
    ↑
    │ implements
    │
Infrastructure Layer
    │
    └── TypeOrmPaymentRepository
```

### Current Dependency Violation

The Domain currently imports from `@shared/constants/payment.constants.ts`:

```
domain/aggregates/payment.aggregate.ts
    → imports PaymentStatus, PaymentProvider, FailureReason from @shared/constants/

domain/entities/transaction.entity.ts
    → imports PaymentProvider, TransactionStatus, TransactionType from @shared/constants/

domain/value-objects/money.vo.ts
    → imports Currency from @shared/constants/
```

This creates an **outward dependency** from Domain to Shared. These are domain concepts and should live in `domain/enums/`. This violation is addressed in Phase 1.

---

## 7. Payment Domain Model

### Payment Aggregate

The canonical Payment aggregate (`payment.aggregate.ts`) is an aggregate root that:

- Has a private constructor — instantiated only via `Payment.create()` or `Payment.reconstitute()`
- Uses `Money` value object for financial amounts
- Uses `Clock` abstraction for testable timestamps
- Enforces state transition invariants via `ensureStatus()` guard

**Current state machine:**

```
CREATED ──start()──→ PENDING
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          SUCCEEDED    FAILED   CANCELLED
              │
         (via succeed())
              │
          EXPIRED
         (from CREATED/PENDING/PROCESSING)
```

Valid transitions:
- `start()`: CREATED → PENDING
- `succeed()`: PENDING | PROCESSING → SUCCEEDED
- `fail()`: PENDING | PROCESSING → FAILED
- `cancel()`: CREATED | PENDING | PROCESSING → CANCELLED
- `expire()`: CREATED | PENDING | PROCESSING → EXPIRED

### Transaction Entity — Aggregate Boundary Decision

**Question:** Should Transaction be a child entity of the Payment aggregate, or a standalone entity?

**Analysis of invariants:**

Transaction represents a financial operation (charge, refund) against a Payment. The following invariants require Payment and Transaction to change atomically:

1. **Refund amount validation** — The total refund amount (sum of refund transactions) cannot exceed the original payment amount. This requires Payment to know all its transactions.
2. **Payment status consistency** — Payment status should reflect the outcome of its transactions (charge succeeded → payment succeeded).
3. **Creation control** — A Transaction should only be created for a valid Payment in the correct state.

These invariants mean that Transaction's lifecycle is **not independent** — it is always in the context of a Payment. An orphaned Transaction has no business meaning.

**Decision:** Transaction should be a child entity within the Payment aggregate boundary.

**Implications:**
- Transaction constructor should be private (or package-scoped) — only Payment creates transactions
- Payment maintains a `Transaction[]` collection
- External code interacts with transactions through Payment aggregate methods
- Both are persisted/loaded together

This is addressed in Phase 1.

### Money Value Object

Fully implemented. Uses `Decimal.js` for arbitrary-precision arithmetic. Key features:

- Immutable — all operations return new instances
- Currency enforcement — operations across different currencies are rejected
- Provider conversion — `toCents()` / `fromCents()` for Stripe-style cent amounts
- Proportional splits — `allocate()` for split payments with remainder handling

---

## 8. Payment Provider Abstraction

### The Naming Distinction

There are two different concepts that must not be confused:

#### `PaymentProvider` — Domain Enum

```
domain/enums/payment-provider.enum.ts

PaymentProvider
    STRIPE = 'stripe'
    PAYMOB = 'paymob'
```

**What it is:** A domain classification. The domain knows that payments are associated with a provider.

**Where it lives:** Domain layer.

**What it's used for:** Stored on Payment aggregate. Identifies which external provider is associated with this payment.

#### `PaymentGateway` — Application Port

```
application/ports/payment-gateway.port.ts

interface PaymentGateway
    createPayment(request): Promise<ProviderPaymentResult>
    // future: refundPayment, verifyPayment
```

**What it is:** An interface defining what capability the application requires from an external payment provider.

**Where it lives:** Application layer.

**What the application knows:** It can call `createPayment()` and receive a result. It does NOT know about Stripe PaymentIntents, Paymob order IDs, or any SDK types.

#### `StripePaymentGateway` / `PaymobPaymentGateway` — Infrastructure Adapters

```
infrastructure/providers/stripe/stripe-payment.gateway.ts

class StripePaymentGateway implements PaymentGateway
    createPayment(request) → calls Stripe SDK → returns ProviderPaymentResult
```

**What it is:** The concrete implementation that contains Stripe SDK details.

**Where it lives:** Infrastructure layer.

**What stays here:** Stripe API calls, Stripe-specific error translation, Stripe types. None of these leak to Application or Domain.

### What Each Layer Knows

| Layer | Knows `PaymentProvider` enum? | Knows `PaymentGateway` interface? | Knows Stripe SDK? |
|:---|:---|:---|:---|
| Domain | ✅ Yes — owns it | ❌ No | ❌ No |
| Application | ✅ Yes — from Domain | ✅ Yes — defines it | ❌ No |
| Infrastructure | ✅ Yes — from Domain | ✅ Yes — implements it | ✅ Yes (inside adapter only) |
| Presentation | ✅ Indirectly — from API request | ❌ No | ❌ No |

### Provider Resolution

A provider factory/resolver is **NOT currently justified**. NestJS DI can provide the correct adapter based on configuration or request context. A factory pattern should be introduced only if:

- Provider selection involves complex domain business rules, or
- Providers are loaded/configured dynamically at runtime

### Preventing SDK Type Leaks

External provider types (Stripe's `PaymentIntent`, Paymob's order response) must **never** appear in Domain or Application layers.

The infrastructure adapter translates:
- **Outbound:** Application request → Provider SDK call
- **Inbound:** Provider SDK response → `ProviderPaymentResult` (application-defined type)

`ProviderPaymentResult` contains only domain-relevant fields: `providerPaymentId`, `status`, `clientSecret` — never Stripe/Paymob-specific types.

---

## 9. Payment Lifecycle

### Domain State vs External Side Effect

This is a critical architectural distinction:

```typescript
payment.start()       // ← Domain state transition (CREATED → PENDING)
```

is NOT the same as:

```typescript
gateway.createPayment(...)  // ← External side effect (calls Stripe/Paymob)
```

The **Domain** changes the Payment's state. The **Application** orchestrates when domain methods and external calls happen. The Domain never calls external systems.

### Current Payment Flow (as implemented)

```
CreatePaymentUseCase.execute(input)
    │
    ├── 1. Create Money from (amount, currency)     ⚠️ unsafe cast: `as Currency`
    ├── 2. Generate UUID
    ├── 3. Payment.create({ id, userId, amount, provider })
    ├── 4. payment.start()                           transitions CREATED → PENDING
    ├── 5. paymentRepository.save(payment)           ⚠️ no implementation exists
    └── 6. return payment                            ⚠️ returns aggregate directly
```

**What's missing:**
- Input validation (currency, provider are raw strings — no validation before domain use)
- External provider call (no PaymentGateway port or adapter)
- Repository implementation (no database)
- Error handling
- Returns aggregate instead of DTO

### Target Payment Flow

```
HTTP Request (POST /api/v1/payments)
    │
    ▼
PaymentController
    ├── Validates request body (class-validator decorators)
    ├── Extracts userId from auth context
    ├── Creates use case input (primitives)
    │
    ▼
CreatePaymentUseCase.execute(input)
    │
    ├── 1. Validate & convert primitives → domain types
    │       ├── Validate currency string → Currency enum
    │       ├── Validate provider string → PaymentProvider enum
    │       └── Money.from(amount, validatedCurrency)
    │
    ├── 2. Create Payment aggregate
    │       └── Payment.create({ ... })     → status = CREATED
    │
    ├── 3. Call PaymentGateway port
    │       └── gateway.createPayment(...)  → returns providerPaymentId
    │       └── (Stripe/Paymob adapter handles SDK internally)
    │
    ├── 4. Update aggregate
    │       ├── payment.start()             → status = PENDING
    │       └── payment.setProviderPaymentId(...)
    │
    ├── 5. Persist via PaymentRepository
    │       └── paymentRepository.save(payment)
    │
    └── 6. Return PaymentResult DTO
            └── Mapped from aggregate — not the aggregate itself
    │
    ▼
PaymentController
    └── Maps to PaymentResponseDto → HTTP 201
```

### Input Boundary Mapping

External input arrives as primitive data:

```typescript
interface CreatePaymentInput {
  userId: string;
  amount: string;
  currency: string;   // primitive
  provider: string;   // primitive
}
```

The domain expects validated types:

```typescript
Payment.create({
  amount: Money,              // value object
  provider: PaymentProvider,  // enum
})
```

**Mapping happens in the use case**, with validation **before** conversion:

```typescript
const currency = validateCurrency(input.currency);    // throws if invalid
const provider = validateProvider(input.provider);     // throws if invalid
const money = Money.from(input.amount, currency);
```

**Never acceptable:**
```typescript
input.currency as Currency      // ← bypasses validation entirely
input.provider as PaymentProvider  // ← unsafe, no guarantee
```

A type assertion (`as`) is only acceptable when a prior validation step has **already guaranteed** the value is valid.

---

## 10. Current Architectural Problems

All problems identified through codebase analysis. No code changes are made in this document — problems are assigned to roadmap phases.

### Critical Problems

| # | Problem | Location | Phase |
|:---|:---|:---|:---|
| 1 | **Obsolete duplicate Payment model** — `payment.ts` is an older draft with syntax errors. `payment.aggregate.ts` is the canonical implementation. Both exist. | `domain/aggregates/` | 0 |
| 2 | **Interface naming mismatch** — Use case imports `ICreatePayment`, file exports `CreatePaymentInput`. Will not compile. | `application/use-cases/creat-payment/` | 0 |
| 3 | **Directory name typo** — `creat-payment/` (missing 'e') | `application/use-cases/` | 0 |
| 4 | **Config env var mismatch** — `database.config.ts` reads `DB_HOST`, `DB_PORT`. `.env` defines `DATABASE_HOST`, `DATABASE_PORT`. | `config/database.config.ts` vs `.env` | 0 |

### Structural Problems

| # | Problem | Location | Phase |
|:---|:---|:---|:---|
| 5 | **Domain enums live in `shared/`** — `PaymentStatus`, `PaymentProvider`, `Currency`, etc. are domain concepts but imported from `@shared/constants/`. Domain depends outward. | `shared/constants/payment.constants.ts` | 1 |
| 6 | **Transaction is standalone** — Public constructor, not owned by Payment aggregate. No aggregate boundary enforcement. | `domain/entities/transaction.entity.ts` | 1 |
| 7 | **PaymentRepository is minimal** — Only `save()`. Missing `findById`, `update`. | `application/repositories/` | 2 |
| 8 | **No PaymentGateway port** — Use case creates/persists a Payment but never calls any external provider. | `application/port/` (empty) | 2 |
| 9 | **Unsafe type coercion** — `input.currency as Currency` and implicit `input.provider` usage with no validation. | `create-payment.use-case.ts` | 2 |

### Design Concerns

| # | Problem | Notes | Phase |
|:---|:---|:---|:---|
| 10 | **Use case returns aggregate directly** | Should return a DTO to prevent domain leaking outward | 2 |
| 11 | **No refund transition** on Payment aggregate | Only add if refunds are confirmed in scope. Do not add prematurely. | 2 (conditional) |
| 12 | **Subscription constants without implementation** | `SubscriptionStatus`, `BillingInterval` enums exist. Zero domain model. Not in core scope. | Optional |
| 13 | **`amqplib` installed but unused** | Installed dependency ≠ implemented feature. No RabbitMQ code exists. | Evaluate for removal |

### Empty Placeholder Files

These are NOT implemented patterns:

| File | Decision |
|:---|:---|
| `aggregate-root.base.ts` | Remove or keep empty. Not needed until Domain Events are justified. |
| `domain-event.base.ts` | Not needed now. Move to a later phase with Domain Events if/when event publishing becomes necessary. |
| `payment-status.vo.ts` | Evaluate in Phase 1: if `PaymentStatus` is adequately represented as an enum, do not create a VO for architectural aesthetics. |
| `payment.specifications.ts` | Do not implement. Specification Pattern is not currently justified. Current business rules are simple enough to remain inside the aggregate. |

### Not a Problem

| Item | Why It's Normal |
|:---|:---|
| Empty `AppModule` | Expected — Infrastructure and Presentation are not implemented. Nothing to wire. |
| Empty `infrastructure/` | Expected — Phase 3/4 concern. |
| Empty `presentation/` | Expected — Phase 5 concern. |

---

## 11. Decisions & Rationale

### ADR-001: Use Decimal.js for Money

**Status:** ✅ Implemented

**Decision:** All monetary amounts use `Decimal.js` via the `Money` value object.

**Rationale:** JavaScript `number` (IEEE 754 float) causes rounding errors. `0.1 + 0.2 = 0.30000000000000004` is unacceptable for financial calculations.

---

### ADR-002: Payment Aggregate as State Machine

**Status:** ✅ Partially Implemented

**Decision:** Payment is an aggregate root with guarded state transitions.

**Rationale:** Payment status changes must be validated — a payment cannot transition from FAILED to SUCCEEDED. The aggregate enforces these invariants via `ensureStatus()`.

---

### ADR-003: Transaction as Child of Payment Aggregate

**Status:** ⚠️ Decided, Not Yet Implemented

**Decision:** Transaction is a child entity within the Payment aggregate boundary, not a standalone entity.

**Rationale:** Invariants such as "total refund cannot exceed original amount" require Payment to know its transactions. Transaction has no independent business meaning outside a Payment. See [Section 7](#7-payment-domain-model) for full analysis.

---

### ADR-004: Domain Enums in Domain Layer

**Status:** ⚠️ Decided, Not Yet Implemented

**Decision:** `PaymentStatus`, `PaymentProvider`, `Currency`, `FailureReason`, `TransactionType`, `TransactionStatus` belong in `domain/enums/`, not `shared/constants/`.

**Rationale:** These describe payment business behavior and state — they are domain concepts. The Domain should not depend outward on a shared layer for its own vocabulary.

---

### ADR-005: PaymentGateway Port Abstraction

**Status:** ⚠️ Decided, Not Yet Implemented

**Decision:** The Application layer defines a `PaymentGateway` port interface. Infrastructure provides Stripe/Paymob adapters. Domain never calls external providers.

**Rationale:** Clean Architecture dependency rule — Application depends on abstractions, not concretions. Stripe SDK types must not leak into Domain or Application.

---

### ADR-006: No Premature Enterprise Patterns

**Status:** ✅ Active Policy

**Decision:** Do not implement CQRS, Event Sourcing, Specification Pattern, Domain Events, Circuit Breaker, Unit of Work, or Message Brokers unless there is a concrete, current need.

**Rationale:** Complexity must be justified by requirements, not by architectural aesthetics. The project should become sophisticated because it *needs to be*, not because documentation says it should be.

---

### ADR-007: Subscriptions Out of Core Scope

**Status:** ✅ Decided

**Decision:** Subscription management is not part of the core payment gateway scope. Constants may remain as reserved identifiers, but no domain model, use case, or infrastructure should be built for subscriptions in the core roadmap.

**Rationale:** The core project should first become a solid payment gateway. Adding subscription complexity before one-time payments work end-to-end is premature.

---

### ADR-008: Authentication as Boundary Concern

**Status:** ⚠️ Pending Architectural Decision

**Decision:** Authentication does not belong inside the Payment domain. It is a Presentation/Application boundary concern.

**Options:**
- (A) Authentication provided by an external API Gateway or identity service — Payment service trusts the incoming context
- (B) Lightweight JWT authentication implemented in the Presentation layer after the core API exists

**No authentication infrastructure should be built before the API boundary (Phase 5) exists.**

---

## 12. Now / Later / Optional

### NOW — Required for Foundation

| Item | Phase |
|:---|:---|
| Remove obsolete `payment.ts` draft | 0 |
| Fix naming mismatch (`ICreatePayment` → `CreatePaymentInput`) | 0 |
| Fix directory typo (`creat-payment` → `create-payment`) | 0 |
| Fix config env var mismatch | 0 |
| Correct README status claims | 0 |
| Move domain enums from `shared/` to `domain/enums/` | 1 |
| Finalize Payment aggregate (consolidate, state transitions) | 1 |
| Resolve Transaction ownership (child of Payment) | 1 |
| Domain unit tests | 1 |
| Define `PaymentGateway` port | 2 |
| Expand `PaymentRepository` port | 2 |
| Fix `CreatePaymentUseCase` (validation, gateway call, return DTO) | 2 |

### LATER — After Core Works

| Item | When | Phase |
|:---|:---|:---|
| TypeORM persistence | After ports defined | 3 |
| Stripe adapter | After port + persistence | 4 |
| HTTP API + NestJS wiring | After all inner layers | 5 |
| Idempotency | After API is functional | 6 |
| Optimistic locking | After persistence works | 6 |
| Webhook verification | After webhook controller | 5-6 |
| Refund use case + domain method | Only if refunds are confirmed in scope | 2+ |
| Rate limiting | After API exists | 6 |
| Health checks | After API exists | 6 |

### OPTIONAL / SCALE-DEPENDENT

These should only be introduced if requirements or scale justify them. Premature implementation adds complexity without value.

| Item | Introduce When |
|:---|:---|
| CQRS | Read and write models diverge significantly |
| Event Sourcing | Regulatory requirement for full state reconstruction |
| Specification Pattern | Validation/refund rules become complex compositional logic |
| Domain Events | Inter-service communication becomes a real requirement |
| AggregateRoot base class | Domain events are implemented and need collection |
| Unit of Work | DB + event publishing need strict atomicity |
| Circuit Breaker | Provider adapters are in production and failure patterns are understood |
| RabbitMQ / Event Publisher | There are real consumers that need events |
| Subscriptions / Billing Cycles | Recurring billing is a confirmed product requirement |
| gRPC | High-performance inter-service communication is needed |
| Distributed Tracing | Running multiple services in production |
| Correlation/Causation IDs | Event publishing and multi-service flows exist |
| Provider Factory/Resolver | Dynamic provider loading or complex business routing rules |
| Domain Services | Provider selection involves complex domain-level business rules |
| Paymob adapter | MENA region support is a real requirement |

---

## 13. Phased Implementation Roadmap

Phases are ordered by **dependency**. Each phase builds on the previous. No phase requires work from a future phase.

---

### Phase 0 — Foundation & Cleanup

**Goal:** Make the repository internally consistent before adding features.

**Why Now:** These are blocking or confusing issues that must be resolved before any meaningful development.

**Tasks:**
- [ ] Remove obsolete `payment.ts` draft — `payment.aggregate.ts` is the canonical Payment Aggregate
- [ ] Update all references/imports that pointed to `payment.ts`
- [ ] Fix interface naming mismatch: use `CreatePaymentInput` as the canonical name throughout
- [ ] Rename directory `creat-payment/` → `create-payment/`, update all import paths
- [ ] Fix config env var mismatch: align `database.config.ts` variable names with `.env` (`DATABASE_HOST` vs `DB_HOST` — pick one consistent source of truth)
- [ ] Remove or explicitly mark empty placeholder files:
  - `aggregate-root.base.ts` — remove or keep empty (not needed now)
  - `domain-event.base.ts` — remove or keep empty (not needed now)
  - `payment-status.vo.ts` — evaluate: if enum is sufficient, remove
  - `payment.specifications.ts` — remove (pattern not justified)
- [ ] Evaluate unused `SubscriptionStatus`, `BillingInterval`, `SUBSCRIPTION_EVENTS`, `ROUTING_KEYS` constants — flag or remove if not in scope
- [ ] Evaluate `amqplib` dependency — consider removing if RabbitMQ is not in core scope
- [ ] Correct README to reflect actual project status (not "v1.0 all features implemented")
- [ ] Consolidate root `ARCHITECTURE.md` — merge useful content into `docs/documentation/ARCHITECTURE.md`, remove duplicate

**Files / Areas Affected:**
- `src/domain/aggregates/payment.ts` (remove)
- `src/application/use-cases/creat-payment/` (rename directory)
- `src/application/use-cases/creat-payment/create-payment.input.ts` (canonical name)
- `src/application/use-cases/creat-payment/create-payment.use-case.ts` (fix import)
- `src/config/database.config.ts` (fix env vars)
- `src/domain/common/` (evaluate placeholders)
- `src/domain/value-objects/payment-status.vo.ts` (evaluate)
- `src/domain/specifications/` (evaluate)
- `README.md` (correct status claims)
- `ARCHITECTURE.md` (root — consolidate)

**Dependencies:** None.

**Expected Result:** Clean starting point. Project compiles. No duplicates. No naming mismatches. Documentation reflects reality.

**Exit Criteria:**
- [ ] Single Payment aggregate file exists (no duplicate)
- [ ] All imports compile without naming errors
- [ ] Directory names are correctly spelled
- [ ] Config reads correct env var names from `.env`
- [ ] README honestly describes current project status
- [ ] One canonical `ARCHITECTURE.md` in `docs/documentation/`
- [ ] No confusing empty placeholder files without clear purpose

---

### Phase 1 — Domain Core

**Goal:** Build a coherent, framework-independent Payment domain model.

**Why Now:** Everything else depends on a correct domain. Application ports, infrastructure adapters, and presentation all consume domain objects.

**Tasks:**
- [ ] Move domain enums from `shared/constants/` to `domain/enums/`:
  - `PaymentStatus` → `domain/enums/payment-status.enum.ts`
  - `PaymentProvider` → `domain/enums/payment-provider.enum.ts`
  - `Currency` + `SUPPORTED_CURRENCIES` → `domain/enums/currency.enum.ts`
  - `FailureReason` → `domain/enums/failure-reason.enum.ts`
  - `TransactionType` → `domain/enums/transaction-type.enum.ts`
  - `TransactionStatus` → `domain/enums/transaction-status.enum.ts`
  - `PaymentMethodType` — evaluate if domain or shared concern
- [ ] Update ALL imports across the codebase from `@shared/constants/` to `@domain/enums/` for moved concepts
- [ ] Reduce `shared/constants/payment.constants.ts` to only truly shared, non-domain constants (or remove if empty)
- [ ] Evolve Transaction into a child entity of Payment aggregate:
  - Make Transaction constructor private/controlled
  - Add `Transaction[]` collection to Payment
  - Transaction creation goes through Payment methods
- [ ] Review and finalize Payment state machine — document all valid transitions
- [ ] Write unit tests for Payment aggregate (all state transitions, guard clauses, edge cases)
- [ ] Write unit tests for Money value object (arithmetic, currency enforcement, edge cases)
- [ ] Write unit tests for Transaction entity (state transitions)

**Files / Areas Affected:**
- `src/domain/enums/` (new directory — enums moved here)
- `src/domain/aggregates/payment.aggregate.ts` (add Transaction management)
- `src/domain/entities/transaction.entity.ts` (restrict constructor)
- `src/shared/constants/payment.constants.ts` (reduce or remove)
- All files that import from `@shared/constants/` (update imports)
- `src/domain/**/*.spec.ts` (new test files)

**Dependencies:** Phase 0 completed.

**Expected Result:** Domain layer is self-contained, well-tested, framework-independent. The aggregate boundary between Payment and Transaction is explicit and enforced.

**Exit Criteria:**
- [ ] Domain has zero `@shared/constants/` imports for business concepts
- [ ] Domain has zero `@nestjs/`, `typeorm`, `stripe` imports
- [ ] All domain enums live in `domain/enums/`
- [ ] Payment aggregate manages Transaction children
- [ ] Payment state transitions are fully tested
- [ ] Money value object is fully tested
- [ ] Domain tests pass in isolation (no infrastructure needed)

---

### Phase 2 — Application Core & Ports

**Goal:** Define application layer contracts (port interfaces) and implement use case orchestration with proper input validation.

**Why Now:** Infrastructure adapters implement these ports. We must define what the application expects before building adapters.

**Tasks:**
- [ ] Define `PaymentGateway` port interface in `application/ports/payment-gateway.port.ts`
  - `createPayment(request): Promise<ProviderPaymentResult>`
  - Define `CreateProviderPaymentRequest` and `ProviderPaymentResult` types
- [ ] Expand `PaymentRepository` port: add `findById(id): Promise<Payment | null>`, `update(payment): Promise<void>`
- [ ] Fix `CreatePaymentUseCase`:
  - Add proper input validation — validate currency and provider strings BEFORE converting to domain types
  - Call `PaymentGateway` port for external provider creation
  - Return application-level DTO, not aggregate
  - No `as Currency` or `as PaymentProvider` — validate first
- [ ] Define `PaymentResult` DTO (application-level return type)
- [ ] (Conditional) If refunds are confirmed in scope: implement `RefundPaymentUseCase` + add refund transition to Payment aggregate
- [ ] Write unit tests for use cases using mocked ports

**Files / Areas Affected:**
- `src/application/ports/payment-gateway.port.ts` (new)
- `src/application/ports/payment.repository.ts` (moved from `repositories/`, expanded)
- `src/application/use-cases/create-payment/` (fix and complete)
- `src/application/use-cases/refund-payment/` (new, conditional)
- `src/application/dtos/` (new)
- `src/application/**/*.spec.ts` (new test files)

**Dependencies:** Phase 1 completed (stable domain model).

**Expected Result:** Application layer fully defines what it needs from infrastructure. Use cases are testable with mocked ports. Input boundary is clean — no unsafe type assertions.

**Exit Criteria:**
- [ ] `PaymentGateway` port interface is defined
- [ ] `PaymentRepository` port has `save`, `findById`, `update`
- [ ] `CreatePaymentUseCase` validates inputs before domain conversion
- [ ] No `as Currency`, `as PaymentProvider` without prior validation
- [ ] Use cases return DTOs, not aggregates
- [ ] Use case tests pass with mocked ports
- [ ] No Stripe/Paymob SDK dependency in Application

---

### Phase 3 — Persistence

**Goal:** Implement database persistence. Payments can be stored and retrieved.

**Why Now:** We need persistence before a working API. Port interfaces from Phase 2 guide the implementation.

**Tasks:**
- [ ] Create TypeORM entity schemas: `PaymentSchema`, `TransactionSchema`
  - These are database representations — NOT domain objects
  - No domain logic in schemas
- [ ] Create mapper: Domain `Payment` ↔ TypeORM `PaymentSchema` (bidirectional)
- [ ] Implement `TypeOrmPaymentRepository` implementing `PaymentRepository` port
- [ ] Configure TypeORM module in NestJS
- [ ] Create initial database migration
- [ ] Consider adding `version` column for future optimistic locking (low cost now)
- [ ] Write integration tests for repository (against test database)

**Files / Areas Affected:**
- `src/infrastructure/persistence/typeorm/schemas/` (new)
- `src/infrastructure/persistence/typeorm/repositories/` (new)
- `src/infrastructure/persistence/typeorm/mappers/` (new)
- `src/infrastructure/persistence/typeorm.config.ts` (new or moved)
- Migration files

**Dependencies:** Phase 2 completed (repository port defined).

**Expected Result:** Payments persist in PostgreSQL. Repository adapter correctly translates between domain and database representations.

**Exit Criteria:**
- [ ] `TypeOrmPaymentRepository` implements `PaymentRepository` port
- [ ] Domain ↔ Schema mapper correctly round-trips a Payment with its Transactions
- [ ] Repository integration tests pass
- [ ] Migration creates correct tables with appropriate constraints/indexes
- [ ] Domain objects have no TypeORM decorators (`@Entity`, `@Column`, etc.)
- [ ] Only Unit of Work introduced if the actual persistence workflow justifies it

---

### Phase 4 — Payment Provider Integration

**Goal:** Communicate with real payment providers. System can process a payment end-to-end.

**Why Now:** Requires Phase 2 (port definition) and Phase 3 (persistence). This is the first time the system actually processes a real payment.

**Tasks:**
- [ ] Implement `StripePaymentGateway` adapter implementing `PaymentGateway` port
- [ ] Map application request → Stripe PaymentIntent creation
- [ ] Map Stripe response → `ProviderPaymentResult`
- [ ] Handle Stripe errors → translate to domain-appropriate exceptions
- [ ] Ensure no Stripe types leak outside the adapter
- [ ] Write tests for the adapter (mocked Stripe SDK)
- [ ] (Optional) Implement `PaymobPaymentGateway` if Paymob is a real requirement

Do NOT introduce Circuit Breaker, retry policies, or timeout wrappers in this phase. Add those in Phase 6 when external integration exists and failure behavior is understood.

**Files / Areas Affected:**
- `src/infrastructure/providers/stripe/stripe-payment.gateway.ts` (new)
- `src/infrastructure/providers/paymob/` (new, optional)

**Dependencies:** Phase 2 (port defined), Phase 3 (persistence for saving results).

**Expected Result:** The system creates a payment intent with Stripe, receives a `providerPaymentId`, and persists the result.

**Exit Criteria:**
- [ ] `StripePaymentGateway` implements `PaymentGateway` port
- [ ] No Stripe types in Domain or Application layers
- [ ] Stripe adapter tests pass (mocked SDK)
- [ ] End-to-end flow: use case → adapter → Stripe → persist works

---

### Phase 5 — HTTP API & Webhooks

**Goal:** Expose payment functionality via REST API. Wire everything with NestJS DI.

**Why Now:** All inner layers are implemented. Now expose them as an HTTP service.

**Tasks:**
- [ ] Create `CreatePaymentDto` with `class-validator` decorators (request validation)
- [ ] Create `PaymentResponseDto` (API response shape)
- [ ] Implement `PaymentController` (POST /payments, GET /payments/:id)
- [ ] Implement `DomainExceptionFilter` (translate domain exceptions → HTTP 400/404/409)
- [ ] Implement `WebhookController` for Stripe webhooks (POST /webhooks/stripe)
- [ ] Wire `PaymentModule` (NestJS module — providers, controllers, imports)
- [ ] Wire `AppModule` (import PaymentModule, ConfigModule, TypeOrmModule)
- [ ] Configure global validation pipe in `main.ts`
- [ ] Set up Swagger documentation
- [ ] Define authentication boundary — decide if auth is internal (JWT guard) or external (API gateway)

**Files / Areas Affected:**
- `src/presentation/http/controllers/` (new)
- `src/presentation/http/dtos/` (new)
- `src/presentation/http/filters/` (new)
- `src/presentation/payment.module.ts` (new)
- `src/app.module.ts` (wire modules)
- `src/main.ts` (validation pipe, Swagger)

**Dependencies:** Phase 3 (persistence) and Phase 4 (provider adapter).

**Expected Result:** A working HTTP API. Payments created via POST request, processed through Stripe, persisted to PostgreSQL, retrieved via GET.

**Exit Criteria:**
- [ ] `POST /api/v1/payments` creates a payment end-to-end
- [ ] `GET /api/v1/payments/:id` retrieves a payment
- [ ] Invalid requests return 400/422 with descriptive errors
- [ ] Domain exceptions map to correct HTTP status codes
- [ ] Swagger documentation is accessible
- [ ] AppModule wires all required modules
- [ ] Authentication responsibility is clearly documented (internal vs external)
- [ ] Webhook endpoint exists and verifies Stripe signatures

---

### Phase 6 — Production Reliability

**Goal:** Make the system production-ready with appropriate reliability patterns.

**Why Now:** The core system works end-to-end. Now make it reliable. Each pattern must have a documented reason for implementation.

**Evaluate and implement where justified:**
- [ ] Idempotency — Prevent duplicate charges (critical for production payment processing)
- [ ] Optimistic locking — Concurrent update protection (add `version` column if not already)
- [ ] Circuit breaker — Provider fault tolerance (only if provider downtime is observed/expected)
- [ ] Rate limiting — Wire `@nestjs/throttler` (protect against abuse)
- [ ] Structured logging — Production-grade log format
- [ ] Health check endpoint — Database/provider connectivity
- [ ] Request correlation IDs — Middleware to trace requests
- [ ] Environment validation — Fail fast on missing required env vars
- [ ] Error response hardening — Ensure no stack traces leak
- [ ] E2E tests — Replace boilerplate with real payment flow tests
- [ ] Review Docker configuration — Production-ready build

Do NOT automatically implement every pattern. Each feature must have a stated reason.

**Dependencies:** Phase 5 completed (working API).

**Exit Criteria:**
- [ ] Each implemented pattern has a documented justification
- [ ] E2E tests cover core payment flows
- [ ] System is deployable to staging
- [ ] Error responses are safe (no internal details leaked)

---

### Phase 7 — Messaging & Distributed Capabilities

**Goal:** Add event-driven and distributed features if and when requirements justify them.

**Why Now:** Only after the core system is working, tested, and deployed.

> **These are NOT required for the first working version of the payment service.** This phase exists as a documented future path, not a commitment.

**Evaluate when needed:**
- [ ] Domain Events — Define event types, add collection to aggregate
- [ ] Event Publisher — Application port for publishing events
- [ ] RabbitMQ integration — Implement event publisher adapter
- [ ] Outbox Pattern — If strict event delivery guarantees are needed
- [ ] Unit of Work — If DB + event publishing need strict atomicity
- [ ] Distributed tracing — When running multiple services
- [ ] gRPC — If high-performance inter-service communication is needed
- [ ] Subscription management — If recurring billing becomes a product requirement

**Dependencies:** Phase 6 completed.

**Exit Criteria:** Per-feature. Each capability added only when there is a concrete, documented need.

---

## 14. Exit Criteria

### Phase Completion Summary

| Phase | Core Question | Done When |
|:---|:---|:---|
| **0 — Foundation** | Is the repo internally consistent? | No duplicates, no naming errors, config aligns, docs reflect reality |
| **1 — Domain** | Is the domain correct and independent? | Zero infrastructure imports, all transitions tested, aggregate boundary enforced |
| **2 — Application** | Are ports defined and use cases testable? | Ports exist, validation is clean, use cases pass with mocked ports |
| **3 — Persistence** | Can payments be stored/retrieved? | Repository implements port, mapper round-trips correctly, integration tests pass |
| **4 — Providers** | Can payments be processed externally? | Stripe adapter works, SDK types don't leak, end-to-end flow works |
| **5 — API** | Can clients use HTTP to create/retrieve payments? | REST endpoints work, validation exists, Swagger is up, modules are wired |
| **6 — Reliability** | Is the system production-ready? | E2E tests pass, logging works, rate limiting active, no leaked internals |
| **7 — Distributed** | Does the system integrate with the broader ecosystem? | Only if justified — each capability has a documented need |

### Consistency Rule

At any point, these three sources must agree:

```
CODE (actual implementation)
    ↓
ARCHITECTURE.md (explains current state + target design)
    ↓
README.md (high-level roadmap + status)
```

The code defines reality. The architecture explains reality and the intended design. The roadmap defines the safest order to evolve from reality to the target.