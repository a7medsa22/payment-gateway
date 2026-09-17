# Architecture Decision Records (ADRs)

This log records significant architectural and technical decisions made in the `payment-gateway` project.

---

## ADR-001: Adoption of Clean Architecture & DDD
- **Status**: Accepted
- **Context**: Payment processing requires strict business invariants, auditability, and long-term maintainability. Framework coupling (e.g., tying models directly to TypeORM entities) causes fragile domain logic and tight vendor lock-in.
- **Decision**: Segregate the codebase into Domain, Application, Infrastructure, and Presentation layers. The Domain layer has zero external framework dependencies.
- **Consequences**: Requires explicit mapping between domain entities and persistence/HTTP schemas, but guarantees testability and business rule isolation.

---

## ADR-002: Arbitrary-Precision Financial Arithmetic with Decimal.js
- **Status**: Accepted
- **Context**: Standard JavaScript numbers use IEEE 754 double-precision floats, leading to rounding inaccuracies (e.g., `0.1 + 0.2 !== 0.3`). In financial software, rounding errors are unacceptable.
- **Decision**: Encapsulate all monetary logic inside a `Money` Value Object backed by `decimal.js`. Primitive floats/numbers are disallowed for currency values.
- **Consequences**: All arithmetic must be conducted through Value Object methods (`add()`, `subtract()`, `multiply()`).

---

## ADR-003: Provider-Agnostic Gateway Abstraction
- **Status**: Accepted
- **Context**: The gateway needs to support Stripe today and regional providers (e.g., Paymob) in the future without changing core payment workflows.
- **Decision**: Define an abstract `IPaymentGatewayPort` in the Application layer. Infrastructure provides vendor-specific implementations (`StripePaymentGatewayAdapter`).
- **Consequences**: All vendor-specific errors, webhook payloads, and status codes must be mapped into unified domain concepts.

---

## ADR-004: Mandatory Idempotency for State-Mutating Operations
- **Status**: Accepted
- **Context**: Distributed network calls and client retries can cause duplicate payment charges or duplicate refunds.
- **Decision**: Require an `Idempotency-Key` header on payment and refund operations. Persist and check idempotency records before executing external transactions.
- **Consequences**: Requires an idempotency tracking store/table and TTL management.

---

## ADR-005: Explicit Mappers Between Layers
- **Status**: Accepted
- **Context**: Reusing TypeORM entities or HTTP DTOs across the application leaks database columns and request formatting into core domain models.
- **Decision**: Maintain dedicated persistence entities (`payment.orm-entity.ts`) and presentation DTOs, converted strictly via explicit mappers (`PaymentMapper`).
- **Consequences**: Slight increase in boilerplate code, with maximum decoupling and schema migration independence.
