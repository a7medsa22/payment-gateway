# Payment Microservice

A production-ready, scalable payment processing microservice built with NestJS and Clean Architecture principles. This service provides a unified interface for handling payments and subscriptions across multiple payment providers while maintaining flexibility, maintainability, and extensibility.

## 📋 Overview

The Payment Microservice is a reusable, provider-agnostic solution designed to handle complex payment workflows in modern distributed systems. It abstracts the complexity of integrating multiple payment providers behind a clean, consistent API while providing robust event-driven communication with other services in your ecosystem.

### Purpose and Value

This microservice solves the challenge of managing multiple payment providers in a scalable, maintainable way. Instead of tightly coupling your application to specific payment gateway SDKs, this service provides:

- **Provider Flexibility**: Easily switch between or add payment providers without changing your core business logic
- **Unified Interface**: Consistent API regardless of the underlying payment provider
- **Event-Driven Architecture**: Seamless integration with other services through RabbitMQ messaging
- **Production Ready**: Built with enterprise-grade patterns for reliability, security, and scalability
- **Developer Experience**: Clean architecture ensures code is testable, maintainable, and easy to understand
- **Multi-Tenancy Ready**: Support for multiple payment providers per deployment with intelligent routing

Whether you're building a SaaS platform, e-commerce application, or marketplace, this service provides the foundation for reliable payment processing without vendor lock-in.

---

## ✨ Features

### Payment Processing
- ✅ One-time payment creation and processing
- ✅ Recurring subscription management
- ✅ Payment verification and confirmation
- ✅ Refund processing
- ✅ Payment method management
- ✅ Multi-currency support

### Provider Integration
- ✅ **Stripe** integration (cards, ACH, wallets)
- ✅ **Paymob** integration (MENA region support)
- ✅ Provider-per-payment strategy
- ✅ Automatic provider selection based on rules
- ✅ Easy extension for additional providers

### Architecture
- ✅ Clean Architecture with clear layer separation
- ✅ Domain-Driven Design principles
- ✅ Event-driven communication via RabbitMQ
- ✅ PostgreSQL for reliable data persistence
- ✅ Idempotent operations
- ✅ Comprehensive error handling

### Security & Compliance
- ✅ PCI-DSS compliant design (no sensitive card data storage)
- ✅ Webhook signature verification
- ✅ API authentication and authorization
- ✅ Rate limiting and request throttling
- ✅ Encrypted sensitive data at rest

### Observability
- ✅ Structured logging
- ✅ Health check endpoints
- ✅ Metrics collection (Prometheus-ready)
- ✅ Distributed tracing support
- ✅ Audit trail for all payment operations

---

## 🏗️ Architecture

### High-Level Overview - Enterprise Grade ✨

```
┌─────────────────────────────────────────────────────────────────┐
│            Payment Microservice (DDD + Clean Architecture)      │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │ Presentation │──────│  Application │──────│    Domain    │   │
│  │   (API)      │      │  (Use Cases) │      │  (Aggregates)│   │
│  └──────────────┘      └──────────────┘      └──────────────┘   │
│         │                      │                      │         │
│    Controllers           Unit of Work          Aggregate Roots  │
│    Guards                Commands/Queries      Domain Service   │
│    Interceptors            DTOs                Value Objects    │
│                              │                 Domain Events    │
│                    ┌──────────────────┐                         │
│                    │ Infrastructure   │                         │
│                    │  (Adapters)      │                         │
│                    └──────────────────┘                         │
│                          Repositories                           │
│                          Event Publisher                        │
│                          Provider Adapters                      │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    RabbitMQ            PostgreSQL          Payment Providers
  (Events)            (Unit of Work)      (Circuit Breaker)
```

### Enterprise Patterns Implemented ⭐

**Domain Layer** - Pure business logic (NO infrastructure dependencies)
- ✅ **Aggregate Roots**: Payment (contains Transactions)
- ✅ **Value Objects**: Money (Decimal.js for precision)
- ✅ **Domain Events**: Automatic event collection
- ✅ **Domain Services**: Provider selection, validation
- ✅ **Specifications**: Business rule encapsulation

**Application Layer** - Use case orchestration (NO domain logic)
- ✅ **Commands**: CQRS pattern
- ✅ **Unit of Work**: Transaction management
- ✅ **Idempotency**: Duplicate prevention
- ✅ **Event Publishing**: Atomic with database commits

**Infrastructure Layer** - External adapters
- ✅ **Repositories**: With optimistic locking
- ✅ **Provider Adapters**: Anti-corruption layer
- ✅ **Event Publisher**: Domain event to message broker
- ✅ **Circuit Breaker**: Provider fault tolerance

**Presentation Layer** - HTTP/gRPC interfaces
- ✅ **Controllers**: Thin API layer
- ✅ **Authentication**: JWT with guards
- ✅ **Validation**: Input sanitization
- ✅ **Exception Filters**: Consistent error responses

### Key Improvements Over Basic Implementation

🔥 **Financial Safety**
- Money calculations use Decimal.js (no floating-point errors)
- All transactions are atomic (Unit of Work pattern)

🔥 **Data Consistency**
- Aggregate pattern ensures invariants
- Optimistic locking prevents race conditions
- Events auto-published with database commits

🔥 **Operational Excellence**
- Idempotency prevents duplicate charges
- Correlation IDs for distributed tracing
- Circuit breakers prevent cascading failures

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 14.x
- RabbitMQ >= 3.11.x
- Docker & Docker Compose (optional but recommended)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/a7medsa22/payment-gateway.git
cd payment-gateway
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start infrastructure services (PostgreSQL, RabbitMQ)**
```bash
docker-compose up -d postgres rabbitmq
```

5. **Run database migrations**
```bash
npm run migration:run
```

6. **Start the service**
```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The service will be available at `http://localhost:3000`

### Docker Deployment

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f payment-service

# Stop services
docker-compose down
```

---

## 📚 Documentation

- **[Architecture Documentation](./docs/documentation/ARCHITECTURE.md)** - Detailed architecture and design decisions
- **[API Reference](./docs/API.md)** - Complete API documentation with examples
- **[Database Schema](./docs/DATABASE.md)** - Database design and relationships
- **[Event System](./docs/EVENTS.md)** - Event-driven architecture and message formats
- **[Provider Integration Guide](./docs/PROVIDERS.md)** - Adding new payment providers
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Development Guide](./docs/DEVELOPMENT.md)** - Development setup and guidelines
- **[Security Guide](./docs/SECURITY.md)** - Security best practices and compliance
- **[Testing Guide](./TESTING.md)** - Testing strategies and examples
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

---

## 🔌 API Overview

### Authentication

All API requests require authentication via JWT token:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.yourdomain.com/api/v1/payments
```

### Core Endpoints

**Payments**
```
POST   /api/v1/payments           # Create a new payment
GET    /api/v1/payments/:id       # Get payment details
GET    /api/v1/payments           # List payments (paginated)
POST   /api/v1/payments/:id/verify    # Verify payment status
POST   /api/v1/payments/:id/refund    # Refund a payment
```

**Subscriptions**
```
POST   /api/v1/subscriptions      # Create subscription
GET    /api/v1/subscriptions/:id  # Get subscription details
GET    /api/v1/subscriptions      # List subscriptions
POST   /api/v1/subscriptions/:id/cancel  # Cancel subscription
PATCH  /api/v1/subscriptions/:id  # Update subscription
```

**Webhooks**
```
POST   /api/v1/webhooks/stripe    # Stripe webhook handler
POST   /api/v1/webhooks/paymob    # Paymob webhook handler
```

### Example: Create Payment

```bash
curl -X POST https://api.yourdomain.com/api/v1/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "amount": 99.99,
    "currency": "USD",
    "provider": "stripe",
    "paymentMethod": "card",
    "metadata": {
      "orderId": "order-456"
    }
  '
```

Response:
```json
{
  "id": "pay_1a2b3c4d",
  "userId": "user-123",
  "amount": 99.99,
  "currency": "USD",
  "status": "pending",
  "provider": "stripe",
  "providerPaymentId": "pi_1a2b3c4d",
  "clientSecret": "pi_1a2b3c4d_secret_xyz",
  "createdAt": "2026-02-05T10:30:00Z"
}
```

For complete API documentation, see [API.md](./docs/API.md)

---

## 🔄 Event System

The service publishes events to RabbitMQ for asynchronous processing:

### Published Events

- `payment.created` - New payment initiated
- `payment.succeeded` - Payment completed successfully
- `payment.failed` - Payment failed
- `payment.refunded` - Payment refunded
- `subscription.created` - New subscription created
- `subscription.renewed` - Subscription renewed
- `subscription.cancelled` - Subscription cancelled
- `subscription.expired` - Subscription expired

### Event Example

```json
{
  "eventId": "evt_1a2b3c4d",
  "eventType": "payment.succeeded",
  "timestamp": "2026-02-05T10:30:00Z",
  "aggregateId": "pay_1a2b3c4d",
  "data": {
    "paymentId": "pay_1a2b3c4d",
    "userId": "user-123",
    "amount": 99.99,
    "currency": "USD",
    "provider": "stripe",
    "metadata": {
      "orderId": "order-456"
    }
  }
}
```

For detailed event documentation, see [EVENTS.md](./docs/EVENTS.md)

---

## 🛠️ Configuration

### Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=payment_service
DATABASE_USER=postgres
DATABASE_PASSWORD=your_secure_password
DATABASE_SSL=true

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=payment.events
RABBITMQ_QUEUE_PREFIX=payment_service

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_API_VERSION=2023-10-16

# Paymob
PAYMOB_API_KEY=your_api_key
PAYMOB_SECRET_KEY=your_secret_key
PAYMOB_INTEGRATION_ID=your_integration_id

# Security
JWT_SECRET=your_jwt_secret
JWT_EXPIRATION=1h
API_RATE_LIMIT=100
API_RATE_WINDOW=15m

# Observability
LOG_LEVEL=info
ENABLE_METRICS=true
ENABLE_TRACING=true
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Specific test file
npm run test -- payment.service.spec.ts
```

### Test Coverage Goals

- Unit Tests: > 80% coverage
- Integration Tests: Critical paths covered
- E2E Tests: All API endpoints tested

For detailed testing guide, see [TESTING.md](./docs/TESTING.md)

---

## 🚢 Deployment

### Docker

```bash
# Build image
docker build -t payment-service:latest .

# Run container
docker run -d \
  --name payment-service \
  -p 3000:3000 \
  --env-file .env.production \
  payment-service:latest
```

### Kubernetes

```bash
# Apply configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Check status
kubectl get pods -n payment-service
```

### Health Checks

```bash
# Liveness probe
curl http://localhost:3000/health/live

# Readiness probe
curl http://localhost:3000/health/ready

# Detailed health check
curl http://localhost:3000/health
```

For complete deployment guide, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🔐 Security

- **PCI Compliance**: Service is designed to minimize PCI scope
- **No Card Storage**: Card data never touches your servers
- **Webhook Verification**: All webhooks signatures are verified
- **API Authentication**: JWT-based authentication required
- **Rate Limiting**: Protection against abuse
- **Input Validation**: All inputs validated and sanitized
- **Encryption**: Sensitive data encrypted at rest
- **Audit Logging**: Complete audit trail of all operations

For security best practices, see [SECURITY.md](./SECURITY.md)

---

## 📊 Monitoring

### Metrics

The service exposes Prometheus metrics at `/metrics`:

- `payment_created_total` - Total payments created
- `payment_succeeded_total` - Total successful payments
- `payment_failed_total` - Total failed payments
- `payment_processing_duration_seconds` - Payment processing time
- `subscription_active_total` - Active subscriptions count
- `webhook_received_total` - Webhooks received

### Logging

Structured JSON logging with log levels:
- **ERROR**: System errors requiring immediate attention
- **WARN**: Warning conditions
- **INFO**: General informational messages
- **DEBUG**: Detailed debug information

### Alerting

Recommended alerts:
- Payment success rate drops below 95%
- Webhook processing failures
- Database connection issues
- High API error rates
- Service health check failures

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards

- Follow NestJS best practices
- Maintain Clean Architecture principles
- Write unit tests for new features
- Update documentation
- Follow conventional commits

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🆘 Support

- **Documentation**: [Full documentation](./docs)
- **Issues**: [GitHub Issues](https://github.com/a7medsa22/payment-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/a7medsa22/payment-gateway/discussions)
- **Email**: ahmedsalahsotohy@gmail.com

---

## 🗺️ Roadmap

### Current Version (v1.0)
- ✅ Stripe and Paymob integration
- ✅ One-time payments
- ✅ Subscription management
- ✅ Event-driven architecture
- ✅ PostgreSQL persistence

### Upcoming Features (v1.1)
- 🔄 PayPal integration
- 🔄 Apple Pay / Google Pay support
- 🔄 Payment dispute handling
- 🔄 Advanced analytics dashboard
- 🔄 Multi-tenant support

### Future Considerations (v2.0)
- 💡 Cryptocurrency payment support
- 💡 AI-powered fraud detection
- 💡 GraphQL API
- 💡 Payment orchestration for complex flows
- 💡 Low-code payment workflow builder

---

## 🙏 Acknowledgments

- NestJS team for the excellent framework
- Stripe and Paymob for comprehensive payment APIs
- The open-source community for inspiration and tools

---

**Built with ❤️ using NestJS and Clean Architecture**