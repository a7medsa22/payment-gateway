# RISK_REGISTRY.md

Accepted technical debt and deferred security items for the `payment-gateway` service.
This document is maintained as part of the Phase 5 Security Hardening audit.

Last updated: 2026-09-20

---

## 1. Pessimistic Locking — DEFERRED

| Field | Value |
|-------|-------|
| **Risk** | Race conditions on concurrent refund / status updates |
| **Severity** | Medium |
| **Status** | ✅ Accepted (tech debt) |

**Context:** Adding `lock: { mode: 'pessimistic_write' }` to `findById` would require every caller to run inside an explicit TypeORM `QueryRunner` transaction. This is a significant refactor touching the repository interface, all use cases, and the controller layer.

**Mitigation in place:** TypeORM `@VersionColumn()` is already applied to `PaymentSchema` (optimistic locking). Concurrent writes on the same payment will throw an `OptimisticLockVersionMismatch` error, preventing silent data corruption.

**Resolution path:** Wrap repository operations in `QueryRunner` transactions and enable pessimistic locking in a dedicated refactor ticket.

---

## 2. DoS / Rate Limiting — DEFERRED TO INFRASTRUCTURE

| Field | Value |
|-------|-------|
| **Risk** | Denial of Service via request flooding |
| **Severity** | High |
| **Status** | ✅ Accepted (infra-level concern) |

**Context:** Application-level rate limiting adds complexity without being the right layer of defense for DDoS/flood attacks.

**Mitigation in place:** `@nestjs/throttler` is already listed as a dependency in `package.json` but not yet configured.

**Resolution path:**
1. **Short-term:** Configure `@nestjs/throttler` with per-route limits.
2. **Long-term:** Deploy behind Cloudflare or an API Gateway (AWS, GCP) with WAF rules for volumetric flood protection.

---

## 3. JWT Authentication — userId Passed Explicitly

| Field | Value |
|-------|-------|
| **Risk** | No server-side authentication — userId is trust-on-request |
| **Severity** | Critical (prod) / Accepted (dev) |
| **Status** | ⚠️ Accepted for current development phase |

**Context:** No JWT/auth middleware exists yet. The `userId` is currently passed explicitly in the request body (refund) or as a query param (get payment). Any caller can claim any `userId`.

**Mitigation in place:** IDOR ownership check validates `payment.userId === input.userId` inside the use case. This prevents cross-user data access at the application layer, but relies on the client providing the correct userId.

**Resolution path:** Implement JWT authentication middleware (Passport.js + `@nestjs/passport`). Extract `userId` from the verified JWT payload instead of the request body. Remove the explicit `userId` fields from request DTOs.

---

## 4. Persistent Idempotency Storage — Redis Required

| Field | Value |
|-------|-------|
| **Risk** | Duplicate charges on server restart or horizontal scale-out |
| **Severity** | High |
| **Status** | ⚠️ Accepted for current development phase |

**Context:** The `IdempotencyInterceptor` uses an in-memory `Map` which is ephemeral — it is wiped on every restart and not shared across instances.

**Mitigation in place:** Idempotency check is structurally in place. Single-instance deployments with uptime will benefit from it.

**Resolution path:** Replace the in-memory `Map` in `IdempotencyInterceptor` with a Redis-backed cache (e.g., `ioredis` + `@nestjs/cache-manager`). Set a TTL of 24 hours on keys per Stripe's idempotency key guidelines.

---

## 5. Timing Attack on Webhook Signatures — CONFIRMED SECURE

| Field | Value |
|-------|-------|
| **Risk** | Timing side-channel attack on webhook HMAC verification |
| **Severity** | N/A |
| **Status** | ✅ No action required |

**Verification:** The `StripeWebhookController` uses `this.stripe.webhooks.constructEvent()` at [line 81](file:///c:/Users/TheGenius/Desktop/Master%20folder/payment-gateway/src/presentation/controllers/stripe-webhook.controller.ts#L81). The Stripe SDK's `constructEvent` internally uses `crypto.timingSafeEqual()` for the HMAC comparison, which is constant-time. No manual string comparison is performed.
