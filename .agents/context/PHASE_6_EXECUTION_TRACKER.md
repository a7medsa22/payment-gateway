# Phase 6 Execution Tracker (Plan v2)

This document tracks execution state, completed micro-tasks, pending steps, and verified exit criteria across development turns.

---

## Overall Status Dashboard

- **Current Stage:** `Stage 3: Security & Configuration Hardening`
- **Completed Stages:** `Stage 1.5: Critical Financial Correctness & Locking`, `Stage 2: DB-Enforced Idempotency & Concurrency`
- **Total Progress:** 2 / 6 Stages Completed

| Stage | Name | Status | Verified By |
|:---|:---|:---|:---|
| **Stage 1.5** | Critical Financial Correctness & Locking | ✅ Completed | Unit + Concurrency Integration (100% Pass) |
| **Stage 2** | DB-Enforced Idempotency & Concurrency | ✅ Completed | Unit (229/229) + Integration Scenarios 1-8 (100% Pass) |
| **Stage 3** | Security & Configuration Hardening | 🔄 Ready to Start | Config Boot Check + Throttler Spec |
| **Stage 4** | Observability & Automated Reconciliation | ⏳ Queued | Terminus + Scheduler Integration |
| **Stage 5** | Testing & CI Pipeline | ⏳ Queued | CI Workflow + Test Suite |
| **Stage 6** | Production Simulation & Deployment | ⏳ Queued | Compose + Smoke Test + k6 |

---

## Stage 1.5 Micro-Task Breakdown

- [x] **Task 1.5.1: Real Optimistic Locking**
  - [x] Domain: Add `ConcurrencyException` to `domain.exception.ts`
  - [x] Domain: Make `_version` mutable via `markPersisted()` on `Payment` aggregate
  - [x] Infrastructure: Replace `save()` in `typeorm-payment.repository.ts` with atomic conditional `UPDATE ... WHERE version = :version`
  - [x] Application: Implement `withConcurrencyRetry<T>(fn, attempts)` in `src/application/utils/`
  - [x] Presentation: Update `http-exception.filter.ts` to map `ConcurrencyException` to HTTP 409 Conflict
  - [x] Tests: Verify unit tests pass for optimistic lock behavior
- [x] **Task 1.5.2: Move `PaymentGatewayException` to Application + Classify Ambiguity**
  - [x] Create `src/application/exceptions/payment-gateway.exception.ts` with `ambiguous: boolean`
  - [x] Update `stripe-payment-gateway.ts` to classify network/API 5xx errors as ambiguous=true, and declines/4xx as ambiguous=false
  - [x] Remove old infrastructure exception and update imports
- [x] **Task 1.5.3: Refund State Machine (Reserve -> Execute -> Confirm)**
  - [x] Domain: Update `Transaction` entity (`attachProviderTransactionId`, `isPending`)
  - [x] Domain: Add `pendingRefundTotal`, `requestRefund()`, `confirmRefund()`, `markRefundPending()`, `failRefund()`, `assertRefundable()` to `Payment` aggregate
  - [x] Application: Update `RefundPaymentGatewayRequest` port with required `refundTxId` & `amount`
  - [x] Infrastructure: Pass `idempotencyKey: refund:${request.refundTxId}` in `StripePaymentGateway`
  - [x] Application: Rewrite `refund-payment.use-case.ts` with reserve-execute-confirm flow & tenant 404 rule
  - [x] Application: Align tenant lookup in `get-payment.use-case.ts` to single 404
- [x] **Task 1.5.4: Ambiguous Gateway Errors on Create**
  - [x] Application: Keep payment PENDING on ambiguous gateway errors in `create-payment.use-case.ts`
- [x] **Task 1.5.5: Webhook Lost-Event Fix + Amount Verification**
  - [x] Application/Infrastructure: Define `WebhookEventStatus` & `ClaimResult` in port
  - [x] Infrastructure: Implement atomic `claim()` with `insert().orIgnore()` in repository
  - [x] Presentation: Update `stripe-webhook.controller.ts` to use `claim()` and verify amounts
- [x] **Task 1.5.6: Reject Unsupported Currency Precision**
  - [x] Domain: Implement `assertCurrencyPrecision()` on `Money` value object
  - [x] Presentation: Tighten request DTO validation regexes
- [x] **Task 1.5.7: TypeORM Migration Baseline**
  - [x] Update `typeorm.config.ts` and `database.config.ts` (`synchronize: false`)
  - [x] Generate `InitialSchema` migration with partial unique index
- [x] **Task 1.5.8: Real-Database Integration Test Harness**
  - [x] Add `docker-compose.test.yml`
  - [x] Implement `test/integration/concurrency.integration.spec.ts`

---

## Stage 2 Micro-Task Breakdown

- [x] **Task 2.1: DB-Enforced Idempotency for Create Payment**
  - [x] Domain: Add `idempotencyKey` to `PaymentProps` & `Payment` aggregate
  - [x] Schema: Add `idempotency_key` with partial unique index `uq_payments_merchant_idempotency` (`WHERE "idempotency_key" IS NOT NULL`)
  - [x] Persistence: Map `idempotencyKey` bidirectionally in `PaymentMapper`
  - [x] Exceptions: Create `DuplicateIdempotencyKeyException` and `IdempotencyKeyMismatchException` (mapped to HTTP 422)
  - [x] Port & Repo: Add `findByIdempotencyKey` to `PaymentRepository` port and map Postgres 23505 in `TypeOrmPaymentRepository`
  - [x] Gateway: Add `idempotencyKey` to `CreatePaymentGatewayRequest` & implement `retrievePayment` in `StripePaymentGateway`
  - [x] Application: Rewrite `CreatePaymentUseCase` with replay matching, safe pending recovery, concurrent winner reload, and deterministic Stripe key derivation (`create:${payment.id}`)
  - [x] Migration: Generate TypeORM migration `AddIdempotencyKeys`
- [x] **Task 2.2: DB-Enforced Idempotency for Refunds**
  - [x] Domain: Add `idempotencyKey` to `TransactionProps` and `Transaction` entity
  - [x] Domain: Update `Payment.requestRefund(amount, reason, idempotencyKey)` to return existing refund transaction on key match (or throw 422 if amount differs); added `recordExternalRefund(amount, providerRefundId)`
  - [x] Schema: Add `idempotency_key` to `TransactionSchema` with partial unique index `uq_transactions_payment_idempotency`
  - [x] Application: Pass `idempotencyKey` in `RefundPaymentUseCase` and replay on already succeeded/pending refund transactions
  - [x] Presentation: Read and validate `Idempotency-Key` header (`/^[A-Za-z0-9_\-:.]{8,255}$/`) in `PaymentController`
- [x] **Task 2.3: Redis Infrastructure + Fast Path Idempotency Interceptor**
  - [x] Dependencies: Install `ioredis`
  - [x] Config: Add `redis.config.ts`
  - [x] Store: Implement `IdempotencyStore` with `tryAcquire`, `complete` (storing `bodyHash`), `release`, `hashBody`, and fail-open logging
  - [x] Module: Create `RedisModule` with `REDIS_CLIENT` provider and `RedisLifecycle` (`onApplicationShutdown`), import into `AppModule`
  - [x] Presentation: Rewrite `IdempotencyInterceptor` handling fast path acquisition, 400 validation, 409 `ConflictException` on `IN_FLIGHT`, 422 on body hash mismatch, response caching, and `Idempotency-Replayed` header
  - [x] Tests: Create comprehensive unit tests in `idempotency.interceptor.spec.ts` (9/9 pass)
- [x] **Task 2.4: Shared, Hardened Stripe Client**
  - [x] Provider: Create `stripeClientProvider` (`STRIPE_CLIENT`) with pinned API version, 20s timeout, maxNetworkRetries: 2
  - [x] Module: Register and export `STRIPE_CLIENT` in `PaymentModule`
  - [x] Gateways: Inject `STRIPE_CLIENT` into `StripePaymentGateway` and `StripeWebhookController` (removing inline client creation)
- [x] **Task 2.5: Provider-Agnostic Webhooks + Use Case**
  - [x] Port: Define `ProviderWebhookEvent` discriminating 7 event kinds (`payment.succeeded`, `payment.failed`, `payment.canceled`, `refund.succeeded`, `refund.failed`, `dispute.created`, `ignored`)
  - [x] Infrastructure: Implement `StripeWebhookEventMapper`
  - [x] Application: Implement `HandlePaymentWebhookUseCase` with event processing, amount/currency validation, terminal state protection (`requires_review`), and concurrency retry
  - [x] Presentation: Refactor `StripeWebhookController` to delegate to use case
  - [x] Tests: Create unit tests in `handle-payment-webhook.use-case.spec.ts` (14/14 pass)
- [x] **Task 2.6: Concurrency & Idempotency Integration Testing**
  - [x] Extend `concurrency.integration.spec.ts` with Scenario 7 (duplicate payment idempotency key rejected with `DuplicateIdempotencyKeyException`) and Scenario 8 (duplicate transaction idempotency key rejected by partial unique index)
  - [x] All 8 integration test scenarios verified against PostgreSQL (100% pass)

---

## Stage 2 Exit Criteria Checklist

- [x] `UNIQUE(merchant_id, idempotency_key)` on payments; `(payment_id, idempotency_key)` on transactions
- [x] Same key + same body → identical response (including `clientSecret`); same key + different body → 422
- [x] Ambiguous create failure + client retry → **same** PaymentIntent (Stripe key `create:<paymentId>`)
- [x] Interceptor: concurrent → 409, replay header set, errors propagate correctly (unit-tested)
- [x] One shared Stripe client with timeout, retries, pinned API version
- [x] Webhook logic in an application use case; refund/cancel/dispute events handled
- [x] All test suites passing (`pnpm test`: 20/20 suites, 229/229 tests; `pnpm test:integration`: 8/8 tests; `pnpm build`: 0 errors)
