# Payment Gateway

A payment processing microservice built with **NestJS**, **Clean Architecture**, and **Domain-Driven Design** principles. Designed to support multiple payment providers (Stripe, Paymob) behind a unified, provider-agnostic interface.

---

## Current Status

> **Early Development — Architecture & Domain Foundation**
>
> The project has a partial domain layer and a minimal application skeleton.
> Infrastructure (database, provider adapters) and presentation (HTTP API) layers are not yet implemented.
> There are no working API endpoints at this time.

---

## Architecture Summary

The project follows **Clean Architecture** with four layers:

```
Presentation → Application → Domain
                    ↑
Infrastructure ─────┘
```

| Layer | Responsibility | Status |
|:---|:---|:---|
| **Domain** | Business rules, aggregates, value objects, state machines | ⚠️ Partial |
| **Application** | Use case orchestration, port interfaces | ⚠️ Minimal |
| **Infrastructure** | Database (TypeORM/PostgreSQL), provider adapters (Stripe/Paymob) | ❌ Not started |
| **Presentation** | HTTP controllers, request validation, error handling | ❌ Not started |

**Core Design Principles:**
- Dependencies point inward — Domain has zero external dependencies
- Abstractions are introduced only when justified, not for architectural aesthetics
- Financial precision via `Decimal.js` (Money value object)
- Provider agnosticism — Domain/Application know nothing about Stripe or Paymob specifics

For the detailed architectural reference, see [`docs/documentation/ARCHITECTURE.md`](./docs/documentation/ARCHITECTURE.md).

---

## Tech Stack

| Category | Technology |
|:---|:---|
| Framework | NestJS 11 |
| Language | TypeScript 5.7 |
| Database | PostgreSQL 16 (via TypeORM) |
| Financial Math | Decimal.js |
| Payment Providers | Stripe, Paymob (planned) |
| Validation | class-validator, class-transformer |
| API Docs | Swagger (@nestjs/swagger) |
| Containerization | Docker, Docker Compose |

---

## Getting Started

### Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 14.x (or Docker)
- pnpm (recommended) or npm

### Setup

```bash
# Clone
git clone https://github.com/a7medsa22/payment-gateway.git
cd payment-gateway

# Install dependencies
pnpm install

# Start PostgreSQL (via Docker)
docker-compose up -d postgres

# Start development server
pnpm run start:dev
```

> **Note:** The application boots but does not expose any API endpoints until the Presentation layer is implemented (Phase 5).

---

## 🗺️ Project Roadmap

### Phase 0 — Foundation & Cleanup
**Status:** Completed ✅

Make the repository internally consistent before adding features.

- [x] Remove obsolete duplicate Payment model (`payment.ts` — `payment.aggregate.ts` is canonical)
- [x] Fix interface naming mismatch (`ICreatePayment` → `CreatePaymentInput`)
- [x] Fix directory typo (`creat-payment/` → `create-payment/`)
- [x] Fix config env var mismatch (`DB_HOST` vs `DATABASE_HOST`)
- [x] Evaluate and clean empty placeholder files
- [x] Consolidate root `ARCHITECTURE.md` into `docs/documentation/`
- [x] Remove `amqplib` unused dependency & RabbitMQ config

**Done when:** Project compiles cleanly. No duplicates. No naming mismatches. Documentation reflects reality.

---

### Phase 1 — Domain Core
**Status:** Completed ✅

Build a coherent, framework-independent Payment domain model.

- [x] Move domain enums from `shared/constants/` to `domain/enums/`
- [x] Evolve Transaction into child entity of Payment aggregate
- [x] Finalize Payment state machine (added `process()` transition)
- [x] Write unit tests for Payment aggregate
- [x] Write unit tests for Money value object
- [x] Write unit tests for Transaction entity

**Done when:** Domain has zero infrastructure imports. All state transitions tested. Aggregate boundary enforced.

---

### Phase 2 — Application Core & Ports
**Status:** Not Started

Define application contracts and complete use case orchestration.

- [ ] Define `PaymentGateway` port interface
- [ ] Expand `PaymentRepository` port (`findById`, `update`)
- [ ] Fix `CreatePaymentUseCase` (validation, gateway call, return DTO)
- [ ] (Conditional) `RefundPaymentUseCase` if refunds are confirmed in scope
- [ ] Write use case tests with mocked ports

**Done when:** Use cases are testable with mocked ports. No unsafe type casts. Use cases return DTOs.

---

### Phase 3 — Persistence
**Status:** Not Started

Implement database layer.

- [ ] Create TypeORM schemas (separate from domain objects)
- [ ] Create domain ↔ schema mappers
- [ ] Implement `TypeOrmPaymentRepository`
- [ ] Configure TypeORM, create migrations

**Done when:** Payments persist in PostgreSQL. Domain objects have no TypeORM decorators.

---

### Phase 4 — Payment Provider Integration
**Status:** Not Started

Implement Stripe adapter.

- [ ] Implement `StripePaymentGateway` (implements `PaymentGateway` port)
- [ ] Stripe request/response mapping
- [ ] Error translation
- [ ] (Optional) `PaymobPaymentGateway` if required

**Done when:** System creates payments through Stripe end-to-end. No Stripe types leak inward.

---

### Phase 5 — HTTP API & Webhooks
**Status:** Not Started

Expose functionality via REST API.

- [ ] Payment controller (create, get)
- [ ] Request validation DTOs
- [ ] Domain exception → HTTP response filter
- [ ] Webhook controller (Stripe)
- [ ] NestJS module wiring + Swagger
- [ ] Authentication boundary decision

**Done when:** `POST /api/v1/payments` works end-to-end via HTTP.

---

### Phase 6 — Production Reliability
**Status:** Not Started

Harden for production. Each pattern must be justified.

- [ ] Idempotency (prevent duplicate charges)
- [ ] E2E tests
- [ ] Health checks
- [ ] Structured logging
- [ ] Rate limiting
- [ ] Error response hardening

**Done when:** E2E tests pass. System is deployable to staging.

---

### Phase 7 — Messaging & Distributed Capabilities
**Status:** Not Started — Future / As Needed

> Not required for the first working version.

- [ ] Domain Events + Event Publisher
- [ ] RabbitMQ integration
- [ ] Circuit Breaker
- [ ] Distributed tracing
- [ ] Subscription management (if needed)

**Done when:** Per-feature, only when justified by concrete requirements.

---

## Documentation

| Document | Description |
|:---|:---|
| [`docs/documentation/ARCHITECTURE.md`](./docs/documentation/ARCHITECTURE.md) | Detailed architecture, layer rules, domain model, payment flow, problems, decisions, full roadmap with exit criteria |
| [`docs/API.md`](./docs/API.md) | API endpoint reference (planned — not yet implemented) |
| [`docs/details/DATABASE.md`](./docs/details/DATABASE.md) | Database schema documentation (planned) |

---

## License

MIT License — see [LICENSE](./LICENSE).

---

## Author

**Ahamed Sotohy** — [ahmedsalahsotohy@gmail.com](mailto:ahmedsalahsotohy@gmail.com) — [@a7medsa22](https://github.com/a7medsa22)