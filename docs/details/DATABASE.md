# Database Schema Documentation

## Table of Contents

- [Overview](#overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Tables](#tables)
- [Indexes](#indexes)
- [Constraints](#constraints)
- [Migrations](#migrations)
- [Data Types](#data-types)

---

## Overview

The Payment Microservice uses PostgreSQL 14+ as its primary database. The schema is designed to support:

- ACID transactions for financial data
- Efficient querying and indexing
- Audit trails and historical data
- Multi-provider payment support
- Subscription and recurring billing

### Database Configuration

```yaml
Database: payment_service
Encoding: UTF8
Locale: en_US.UTF-8
Timezone: UTC
Connection Pool: 10-50 connections
```

---

## Entity Relationship Diagram

```
┌─────────────────┐         ┌──────────────────┐
│     users       │         │  payment_methods │
│─────────────────│         │──────────────────│
│ id (PK)         │────────<│ id (PK)          │
│ email           │         │ user_id (FK)     │
│ name            │         │ provider         │
│ created_at      │         │ type             │
└─────────────────┘         │ last4            │
        │                   │ is_default       │
        │                   └──────────────────┘
        │
        │
        ├──────────────────────────────────┐
        │                                  │
        ▼                                  ▼
┌─────────────────┐              ┌──────────────────┐
│    payments     │              │  subscriptions   │
│─────────────────│              │──────────────────│
│ id (PK)         │              │ id (PK)          │
│ user_id (FK)    │              │ user_id (FK)     │
│ amount          │              │ plan_id          │
│ currency        │              │ status           │
│ status          │              │ provider         │
│ provider        │              │ billing_interval │
│ provider_pay_id │              │ current_period   │
│ metadata        │              │ trial_end        │
│ created_at      │              └──────────────────┘
└─────────────────┘                       │
        │                                 │
        │                                 │
        ▼                                 ▼
┌─────────────────┐              ┌──────────────────┐
│  transactions   │              │ subscription_    │
│─────────────────│              │   invoices       │
│ id (PK)         │              │──────────────────│
│ payment_id (FK) │              │ id (PK)          │
│ subscription_id │              │ subscription_id  │
│ type            │              │ amount           │
│ amount          │              │ status           │
│ status          │              │ paid_at          │
│ provider_tx_id  │              └──────────────────┘
└─────────────────┘


┌─────────────────┐
│ webhook_events  │
│─────────────────│
│ id (PK)         │
│ provider        │
│ event_type      │
│ payload         │
│ processed       │
│ created_at      │
└─────────────────┘
```

---

## Tables

### 1. users

Stores user account information.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    country_code VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| email | VARCHAR(255) | No | User email (unique) |
| name | VARCHAR(255) | No | User full name |
| phone | VARCHAR(50) | Yes | Phone number |
| country_code | VARCHAR(2) | Yes | ISO 3166-1 alpha-2 country code |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Last update timestamp |
| deleted_at | TIMESTAMPTZ | Yes | Soft delete timestamp |

---

### 2. payments

Stores one-time payment transactions.

```sql
CREATE TYPE payment_status AS ENUM (
    'pending',
    'processing',
    'requires_action',
    'succeeded',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded'
);

CREATE TYPE payment_provider AS ENUM (
    'stripe',
    'paymob'
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount DECIMAL(19, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    provider payment_provider NOT NULL,
    provider_payment_id VARCHAR(255),
    client_secret VARCHAR(500),
    payment_method_type VARCHAR(50),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    error_code VARCHAR(100),
    error_message TEXT,
    succeeded_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT payments_provider_id_unique UNIQUE (provider, provider_payment_id)
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider ON payments(provider);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX idx_payments_metadata ON payments USING gin(metadata);
```

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| user_id | UUID | No | Reference to users table |
| amount | DECIMAL(19,4) | No | Payment amount (must be > 0) |
| currency | VARCHAR(3) | No | ISO 4217 currency code |
| status | ENUM | No | Payment status |
| provider | ENUM | No | Payment provider |
| provider_payment_id | VARCHAR(255) | Yes | Provider's payment ID |
| client_secret | VARCHAR(500) | Yes | Client secret for payment confirmation |
| payment_method_type | VARCHAR(50) | Yes | Type of payment method used |
| description | TEXT | Yes | Payment description |
| metadata | JSONB | No | Custom metadata |
| error_code | VARCHAR(100) | Yes | Error code if failed |
| error_message | TEXT | Yes | Error message if failed |
| succeeded_at | TIMESTAMPTZ | Yes | Success timestamp |
| failed_at | TIMESTAMPTZ | Yes | Failure timestamp |
| refunded_at | TIMESTAMPTZ | Yes | Refund timestamp |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Last update timestamp |

---

### 3. subscriptions

Stores recurring subscription information.

```sql
CREATE TYPE subscription_status AS ENUM (
    'active',
    'past_due',
    'cancelled',
    'expired',
    'trialing',
    'incomplete'
);

CREATE TYPE billing_interval AS ENUM (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly'
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id VARCHAR(255) NOT NULL,
    status subscription_status NOT NULL DEFAULT 'active',
    provider payment_provider NOT NULL,
    provider_subscription_id VARCHAR(255),
    billing_interval billing_interval NOT NULL,
    billing_amount DECIMAL(19, 4) NOT NULL,
    billing_currency VARCHAR(3) NOT NULL,
    payment_method_id UUID REFERENCES payment_methods(id),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancel_reason VARCHAR(255),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT subscriptions_provider_id_unique UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_current_period_end ON subscriptions(current_period_end);
CREATE INDEX idx_subscriptions_created_at ON subscriptions(created_at DESC);
```

**Columns**:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| user_id | UUID | No | Reference to users table |
| plan_id | VARCHAR(255) | No | Subscription plan identifier |
| status | ENUM | No | Subscription status |
| provider | ENUM | No | Payment provider |
| provider_subscription_id | VARCHAR(255) | Yes | Provider's subscription ID |
| billing_interval | ENUM | No | How often billing occurs |
| billing_amount | DECIMAL(19,4) | No | Amount charged per interval |
| billing_currency | VARCHAR(3) | No | ISO 4217 currency code |
| payment_method_id | UUID | Yes | Default payment method |
| current_period_start | TIMESTAMPTZ | No | Current billing period start |
| current_period_end | TIMESTAMPTZ | No | Current billing period end |
| trial_start | TIMESTAMPTZ | Yes | Trial period start |
| trial_end | TIMESTAMPTZ | Yes | Trial period end |
| cancel_at_period_end | BOOLEAN | No | Whether to cancel at period end |
| cancel_reason | VARCHAR(255) | Yes | Reason for cancellation |
| cancelled_at | TIMESTAMPTZ | Yes | Cancellation timestamp |
| ended_at | TIMESTAMPTZ | Yes | Subscription end timestamp |
| metadata | JSONB | No | Custom metadata |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Last update timestamp |

---

### 4. transactions

Records all financial transactions (charges, refunds, payouts).

```sql
CREATE TYPE transaction_type AS ENUM (
    'charge',
    'refund',
    'partial_refund',
    'payout',
    'adjustment'
);

CREATE TYPE transaction_status AS ENUM (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'cancelled'
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status transaction_status NOT NULL DEFAULT 'pending',
    provider payment_provider NOT NULL,
    provider_transaction_id VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT transaction_payment_or_subscription CHECK (
        (payment_id IS NOT NULL AND subscription_id IS NULL) OR
        (payment_id IS NULL AND subscription_id IS NOT NULL)
    )
);

CREATE INDEX idx_transactions_payment_id ON transactions(payment_id);
CREATE INDEX idx_transactions_subscription_id ON transactions(subscription_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
```

---

### 5. payment_methods

Stores saved payment methods for users.

```sql
CREATE TYPE payment_method_type AS ENUM (
    'card',
    'bank_account',
    'wallet'
);

CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider payment_provider NOT NULL,
    provider_method_id VARCHAR(255) NOT NULL,
    type payment_method_type NOT NULL,
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    bank_name VARCHAR(255),
    bank_account_last4 VARCHAR(4),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT payment_methods_provider_id_unique UNIQUE (provider, provider_method_id)
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_provider ON payment_methods(provider);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(user_id, is_default);
CREATE INDEX idx_payment_methods_is_active ON payment_methods(is_active);
```

---

### 6. subscription_invoices

Records invoices generated for subscriptions.

```sql
CREATE TYPE invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'void',
    'uncollectible'
);

CREATE TABLE subscription_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE,
    amount DECIMAL(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    provider payment_provider NOT NULL,
    provider_invoice_id VARCHAR(255),
    payment_id UUID REFERENCES payments(id),
    due_date TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    voided_at TIMESTAMP WITH TIME ZONE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscription_invoices_subscription_id ON subscription_invoices(subscription_id);
CREATE INDEX idx_subscription_invoices_status ON subscription_invoices(status);
CREATE INDEX idx_subscription_invoices_due_date ON subscription_invoices(due_date);
CREATE INDEX idx_subscription_invoices_created_at ON subscription_invoices(created_at DESC);
```

---

### 7. webhook_events

Stores incoming webhook events for processing and audit.

```sql
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider payment_provider NOT NULL,
    provider_event_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(500),
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    retry_count INTEGER DEFAULT 0,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT webhook_events_provider_id_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_payload ON webhook_events USING gin(payload);
```

---

### 8. idempotency_keys

Ensures idempotent API requests.

```sql
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_path VARCHAR(500) NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_idempotency_keys_key ON idempotency_keys(key);
CREATE INDEX idx_idempotency_keys_user_id ON idempotency_keys(user_id);
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
```

---

## Indexes

### Primary Indexes

All tables have primary key indexes on the `id` column (UUID).

### Secondary Indexes

**Performance Optimization**:

1. **Foreign Key Indexes**: All foreign key columns are indexed
2. **Status Indexes**: Status columns for efficient filtering
3. **Timestamp Indexes**: Created_at columns for chronological queries
4. **Composite Indexes**: User + status combinations

**JSONB Indexes**:

```sql
-- GIN indexes for JSONB columns
CREATE INDEX idx_payments_metadata ON payments USING gin(metadata);
CREATE INDEX idx_subscriptions_metadata ON subscriptions USING gin(metadata);
CREATE INDEX idx_webhook_events_payload ON webhook_events USING gin(payload);
```

**Partial Indexes**:

```sql
-- Active subscriptions only
CREATE INDEX idx_active_subscriptions 
ON subscriptions(user_id) 
WHERE status = 'active';

-- Unprocessed webhooks
CREATE INDEX idx_unprocessed_webhooks 
ON webhook_events(created_at) 
WHERE processed = false;
```

---

## Constraints

### Primary Keys

All tables use UUID primary keys:
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### Foreign Keys

```sql
-- Payments
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT

-- Subscriptions
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)

-- Transactions
FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
```

### Check Constraints

```sql
-- Positive amounts
CHECK (amount > 0)

-- Valid email format
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')

-- Transaction must reference either payment or subscription
CHECK (
    (payment_id IS NOT NULL AND subscription_id IS NULL) OR
    (payment_id IS NULL AND subscription_id IS NOT NULL)
)
```

### Unique Constraints

```sql
-- Email uniqueness
UNIQUE (email)

-- Provider payment ID uniqueness
UNIQUE (provider, provider_payment_id)

-- Provider subscription ID uniqueness
UNIQUE (provider, provider_subscription_id)

-- Invoice number uniqueness
UNIQUE (invoice_number)
```

---

## Migrations

### Migration Strategy

We use TypeORM migrations for database schema changes:

```typescript
// Example migration
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePaymentsTable1707123456789 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'payments',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    // ... other columns
                ],
            }),
            true,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('payments');
    }
}
```

### Running Migrations

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migrations
npm run migration:show
```

---

## Data Types

### Numeric Types

| Column | PostgreSQL Type | Precision | Range |
|--------|----------------|-----------|-------|
| amount | DECIMAL(19, 4) | 19 digits, 4 decimals | ±99,999,999,999,999.9999 |
| billing_amount | DECIMAL(19, 4) | 19 digits, 4 decimals | Same as above |

**Why DECIMAL(19, 4)?**
- Handles amounts up to 99 quadrillion
- 4 decimal places for sub-cent precision
- No floating-point rounding errors

### Text Types

| Usage | Type | Max Length |
|-------|------|------------|
| Email | VARCHAR(255) | 255 chars |
| Provider IDs | VARCHAR(255) | 255 chars |
| Description | TEXT | Unlimited |
| Currency | VARCHAR(3) | 3 chars (ISO 4217) |

### JSON Types

JSONB is used for flexible metadata storage:
- Supports indexing with GIN indexes
- Efficient storage and querying
- Schema-less for extensibility

---

## Query Examples

### Find User's Active Subscriptions

```sql
SELECT * FROM subscriptions
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000'
  AND status = 'active'
ORDER BY created_at DESC;
```

### Calculate Total Revenue by Provider

```sql
SELECT 
    provider,
    COUNT(*) as payment_count,
    SUM(amount) as total_amount,
    currency
FROM payments
WHERE status = 'succeeded'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY provider, currency
ORDER BY total_amount DESC;
```

### Find Failed Payments Needing Retry

```sql
SELECT p.*, u.email
FROM payments p
JOIN users u ON p.user_id = u.id
WHERE p.status = 'failed'
  AND p.created_at >= NOW() - INTERVAL '7 days'
  AND p.metadata->>'retry_count' < '3'
ORDER BY p.created_at DESC;
```

### Get Subscription Renewal Schedule

```sql
SELECT 
    s.*,
    u.email,
    u.name
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE s.status = 'active'
  AND s.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY s.current_period_end ASC;
```

---

## Backup and Recovery

### Backup Strategy

```bash
# Full database backup
pg_dump -U postgres payment_service > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump -U postgres payment_service | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Schema only
pg_dump -U postgres --schema-only payment_service > schema.sql
```

### Restore

```bash
# Restore from backup
psql -U postgres payment_service < backup_20260205_103000.sql

# Restore from compressed
gunzip -c backup_20260205_103000.sql.gz | psql -U postgres payment_service
```

---

## Performance Tuning

### Connection Pooling

```typescript
// TypeORM configuration
{
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: 5432,
  database: 'payment_service',
  extra: {
    max: 50,              // Maximum pool size
    min: 10,              // Minimum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}
```

### Query Optimization

1. **Use EXPLAIN ANALYZE** to understand query performance
2. **Add indexes** for frequently queried columns
3. **Avoid N+1 queries** with proper joins
4. **Use pagination** for large result sets
5. **Leverage JSONB indexes** for metadata queries

### Monitoring

Monitor these metrics:
- Active connections
- Slow query log
- Table bloat
- Index usage
- Cache hit ratio

```sql
-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Find slow queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

---

## Security Considerations

1. **Row-Level Security**: Implement RLS for multi-tenant isolation
2. **Encrypted Columns**: Sensitive data encryption at rest
3. **Audit Logging**: Track all data modifications
4. **Access Control**: Least privilege principle for database users
5. **Regular Updates**: Keep PostgreSQL version updated

---

This schema provides a solid foundation for a production-ready payment microservice with proper normalization, indexing, and constraints to ensure data integrity and performance.