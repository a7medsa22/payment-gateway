# Phase 6 Execution Tracker (Plan v2)

This document tracks execution state, completed micro-tasks, pending steps, and verified exit criteria across development turns.

---

## Overall Status Dashboard

- **Current Stage:** `Stage 2: DB-Enforced Idempotency & Concurrency`
- **Completed Stages:** `Stage 1.5: Critical Financial Correctness & Locking`
- **Total Progress:** 1 / 6 Stages Completed

| Stage | Name | Status | Verified By |
|:---|:---|:---|:---|
| **Stage 1.5** | Critical Financial Correctness & Locking | ✅ Completed | Unit + Concurrency Integration (100% Pass) |
| **Stage 2** | DB-Enforced Idempotency & Concurrency | 🔄 Ready to Start | Unit + Idempotency Replay Integration |
| **Stage 3** | Security & Configuration Hardening | ⏳ Queued | Config Boot Check + Throttler Spec |
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
