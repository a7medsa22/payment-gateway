---
name: payment-domain
description: Domain knowledge, financial precision rules, payment state machines, idempotency handling, and provider integrations for the payment-gateway service.
---

# Payment Domain Skill

This skill provides domain-specific knowledge and invariants for developing features within the `payment-gateway` microservice.

---

## 1. Core Domain Invariants

### Financial Precision (Zero Floats)
- **Always use `Money` Value Object**: Never represent monetary amounts using primitive numbers or floats.
- **Backing Library**: Amounts are backed by `Decimal.js` to eliminate IEEE-754 floating-point inaccuracies.
- **Base Units**: Explicitly convert between major units (dollars/euros/EGP) and minor units (cents/piastres) when interfacing with external gateways like Stripe (which expects minor units as integers).

### Idempotency
- All payment creation and refund requests **must** require an `IdempotencyKey`.
- Identical requests with the same idempotency key within the expiration window must return the existing transaction state rather than executing a duplicate charge.

---

## 2. Payment Lifecycle & State Machine

The `PaymentStatus` enum defines the state machine:
`CREATED` -> `PENDING` -> `PROCESSING` -> `REQUIRES_ACTION` -> `SUCCEEDED` / `FAILED` / `CANCELLED` / `EXPIRED`
Post-success transitions: `SUCCEEDED` -> `PARTIALLY_REFUNDED` -> `REFUNDED`

```
               ┌──────────┐
               │ CREATED  │
               └────┬─────┘
                    │
                    ▼
               ┌──────────┐
               │ PENDING  │
               └────┬─────┘
                    │
                    ▼
               ┌──────────┐      3D Secure / Action
               │PROCESSING├────────────────────────┐
               └────┬─────┘                        │
                    │                              ▼
                    │                     ┌─────────────────┐
                    │                     │ REQUIRES_ACTION │
                    │                     └────────┬────────┘
                    ├──────────────────────────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
┌─────────┐   ┌───────────┐   ┌─────────┐
│SUCCEEDED│   │  FAILED   │   │CANCELLED│
└────┬────┘   └───────────┘   └─────────┘
     │
     ├──────────────────────┐
     ▼                      ▼
┌──────────────────┐  ┌──────────┐
│PARTIALLY_REFUNDED│  │ REFUNDED │
└────────┬─────────┘  └──────────┘
         │                  ▲
         └──────────────────┘
```

- **Terminal States**: `FAILED`, `CANCELLED`, `EXPIRED`, and `REFUNDED` are immutable. Once reached, the payment cannot transition to any other status.
- State transitions must be validated directly within the `Payment` aggregate (`payment.succeed()`, `payment.fail()`, `payment.refund()`).

---

## 3. Provider Abstraction (Stripe & Paymob)

- **Provider Agnosticism**: Application use cases must only interact with `IPaymentGatewayPort`. No Stripe SDK types may leak into `domain/` or `application/`.
- **Supported Providers**:
  - `STRIPE`: Credit cards, 3D Secure redirects, automated webhooks.
  - `PAYMOB` (Planned): Mobile wallets, credit cards, kiosk payments.
- **Provider Reference**: Store the external transaction/intent ID in `providerPaymentId` on the payment aggregate.

---

## 4. Webhooks & Replay Protection

1. **Cryptographic Validation**: Never trust incoming webhook payloads without validating the signature header using the provider's signing secret.
2. **Deduplication**: Store processed webhook event IDs to prevent replay attacks and duplicate processing.
3. **Out-of-Order Webhooks**: Handle cases where a `payment_intent.succeeded` event arrives before a local `createPayment` response is saved by using atomic state checks.
