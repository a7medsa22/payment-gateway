# Current Phase Tracking

## Active Milestone: Phase 5 — HTTP Presentation Layer & Webhooks

**Project Status**: Core Domain, Application Use Cases, Database Persistence (PostgreSQL / TypeORM), and Stripe Infrastructure Adapter are completed. The active focus is building the external HTTP API and webhook ingestion layer.

---

## Phase History & Status

| Phase | Description | Status |
|:---|:---|:---|
| **Phase 1** | Domain Model (Aggregates, Value Objects, State Machine) | ✅ Completed |
| **Phase 2** | Application Layer (Use Cases, Ports, DTOs) | ✅ Completed |
| **Phase 3** | Persistence Layer (TypeORM Entities, Repositories, Migrations) | ✅ Completed |
| **Phase 4** | Gateway Integration (Stripe Gateway Adapter) | ✅ Completed |
| **Phase 5** | HTTP API Presentation & Webhooks | 🔄 In Progress |
| **Phase 6** | Paymob Regional Provider Integration | ⏳ Pending |
| **Phase 7** | Production Hardening (Rate Limiting, Metrics, E2E Suite) | ⏳ Pending |

---

## Phase 5 Backlog & Task Breakdown

- [ ] **Task 5.1: Payment Controllers**
  - Implement `PaymentController` with routes:
    - `POST /api/v1/payments` (Create & authorize payment)
    - `GET /api/v1/payments/:id` (Retrieve payment details)
    - `POST /api/v1/payments/:id/refund` (Initiate refund)
- [ ] **Task 5.2: Presentation DTOs & Validation**
  - Create request DTOs with `class-validator` rules (`CreatePaymentDto`, `RefundPaymentDto`).
  - Configure Swagger documentation decorators (`@ApiOperation`, `@ApiResponse`).
- [ ] **Task 5.3: Exception Filter & Error Mapping**
  - Implement `HttpExceptionFilter` mapping domain exceptions (`PaymentNotFoundException`, `InvalidPaymentStateException`) to proper HTTP status codes (`400`, `404`, `422`).
- [ ] **Task 5.4: Webhook Handling**
  - Implement `StripeWebhookController` handling `POST /api/v1/webhooks/stripe`.
  - Validate Stripe signatures with raw body parsing before event consumption.
- [ ] **Task 5.5: End-to-End Testing**
  - Write Supertest e2e tests covering the payment lifecycle through the HTTP boundary.

---

## Current Blockers & Notes
- **Blockers**: None.
- **Environment Notes**: Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are populated in `.env` for webhook verification testing.
