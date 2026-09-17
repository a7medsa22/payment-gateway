# Project Context: Payment Gateway Microservice

## 1. Overview
The **Payment Gateway** is a production-grade, provider-agnostic payment processing microservice. It provides a unified API surface for processing credit cards, digital wallets, authorizations, captures, and refunds while abstracting underlying provider details (Stripe, Paymob).

---

## 2. Technical Stack
- **Framework**: NestJS 11 (Express platform)
- **Language**: TypeScript 5.7 (Target ES2023)
- **Persistence**: PostgreSQL 16 managed via TypeORM 0.3
- **Financial Arithmetic**: Decimal.js for arbitrary-precision math (zero floating-point)
- **Validation**: `class-validator` and `class-transformer`
- **Documentation**: OpenAPI / Swagger (`@nestjs/swagger`)
- **Containerization**: Docker & Docker Compose

---

## 3. Directory Layout & Boundaries

```
src/
├── domain/                  # Enterprise business logic (zero framework dependencies)
│   ├── aggregates/          # Aggregate roots (Payment, Transaction)
│   ├── entities/            # Domain entities
│   ├── value-objects/       # Immutable value objects (Money, Currency, IdempotencyKey)
│   ├── enums/               # Domain status and provider enums
│   └── exceptions/          # Business rule violation errors
├── application/             # Application business rules
│   ├── use-cases/           # Payment flows (CreatePayment, RefundPayment, etc.)
│   ├── ports/               # Abstract interfaces (Repositories, Payment Gateways)
│   └── dtos/                # Application command/query payloads
├── infrastructure/          # Adapters and frameworks
│   ├── persistence/         # TypeORM database schemas, entities, repositories, migrations
│   └── payment-providers/   # Provider adapters (StripeAdapter, etc.)
├── presentation/            # External interfaces
│   ├── http/                # REST Controllers, guards, interceptors, exception filters
│   └── dtos/                # API Request and Response DTOs
└── shared/                  # Cross-cutting primitives (Result, Clock, UUID)
```

---

## 4. Key External Integrations
- **Stripe**: Credit card tokenization, PaymentIntents API, webhooks with cryptographic signature verification.
- **Paymob**: Planned integration for regional MENA payment rails (kiosks, mobile wallets).
