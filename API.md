# API Documentation

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Payment Endpoints](#payment-endpoints)
- [Subscription Endpoints](#subscription-endpoints)
- [Webhook Endpoints](#webhook-endpoints)
- [Health Check Endpoints](#health-check-endpoints)
- [Response Codes](#response-codes)

---

## Overview

**Base URL**: `https://api.example.domain.com`

**API Version**: `v1`

**Content Type**: `application/json`

**Date Format**: ISO 8601 (`2026-02-05T10:30:00Z`)

---

## Authentication

All API requests (except webhooks and health checks) require JWT authentication.

### Obtaining a Token

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

### Using the Token

Include the token in the `Authorization` header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiration

Access tokens expire after 1 hour. Use the refresh token to obtain a new access token:

```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Rate Limiting

**Limit**: 100 requests per 15-minute window per user

**Headers Returned**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1675612800
```

**Rate Limit Exceeded Response**:
```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Rate Limit Exceeded",
  "retryAfter": 900
}
```

---

## Error Handling

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "amount",
      "message": "Amount must be greater than 0"
    }
  ],
  "timestamp": "2026-02-05T10:30:00Z",
  "path": "/api/v1/payments"
}
```

### Common Error Codes

| Status Code | Error | Description |
|------------|-------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists or conflict |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 502 | Bad Gateway | Upstream service error |
| 503 | Service Unavailable | Service temporarily unavailable |

---

## Payment Endpoints

### Create Payment

Create a new one-time payment.

**Endpoint**: `POST /api/v1/payments`

**Authentication**: Required

**Request Body**:
```json
{
  "amount": 99.99,
  "currency": "USD",
  "provider": "stripe",
  "paymentMethod": "card",
  "metadata": {
    "orderId": "order-123",
    "productId": "product-456",
    "customField": "value"
  },
  "returnUrl": "https://yourapp.com/payment/success",
  "cancelUrl": "https://yourapp.com/payment/cancel"
}
```

**Request Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Payment amount (must be > 0) |
| currency | string | Yes | ISO 4217 currency code (USD, EUR, EGP, etc.) |
| provider | string | No | Payment provider (stripe, paymob). Auto-selected if not provided |
| paymentMethod | string | Yes | Payment method type (card, bank_account, wallet) |
| metadata | object | No | Custom metadata (max 50 keys, 500 chars per value) |
| returnUrl | string | No | URL to redirect after successful payment |
| cancelUrl | string | No | URL to redirect after cancelled payment |

**Response**: `201 Created`
```json
{
  "id": "pay_1a2b3c4d5e6f",
  "userId": "user_123456",
  "amount": 99.99,
  "currency": "USD",
  "status": "pending",
  "provider": "stripe",
  "providerPaymentId": "pi_1a2b3c4d5e6f",
  "clientSecret": "pi_1a2b3c4d5e6f_secret_xyz123",
  "metadata": {
    "orderId": "order-123",
    "productId": "product-456"
  },
  "createdAt": "2026-02-05T10:30:00Z",
  "updatedAt": "2026-02-05T10:30:00Z"
}
```

**cURL Example**:
```bash
curl -X POST https://api.example.domain.com/api/v1/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.99,
    "currency": "USD",
    "provider": "stripe",
    "paymentMethod": "card",
    "metadata": {
      "orderId": "order-123"
    }
  '
```

---

### Get Payment

Retrieve details of a specific payment.

**Endpoint**: `GET /api/v1/payments/:id`

**Authentication**: Required

**Path Parameters**:
- `id` (string, required): Payment ID

**Response**: `200 OK`
```json
{
  "id": "pay_1a2b3c4d5e6f",
  "userId": "user_123456",
  "amount": 99.99,
  "currency": "USD",
  "status": "succeeded",
  "provider": "stripe",
  "providerPaymentId": "pi_1a2b3c4d5e6f",
  "metadata": {
    "orderId": "order-123"
  },
  "createdAt": "2026-02-05T10:30:00Z",
  "updatedAt": "2026-02-05T10:35:00Z",
  "succeededAt": "2026-02-05T10:35:00Z"
}
```

**cURL Example**:
```bash
curl -X GET https://api.example.domain.com/api/v1/payments/pay_1a2b3c4d5e6f \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### List Payments

Get a paginated list of payments for the authenticated user.

**Endpoint**: `GET /api/v1/payments`

**Authentication**: Required

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| status | string | - | Filter by status (pending, processing, succeeded, failed, refunded) |
| provider | string | - | Filter by provider (stripe, paymob) |
| startDate | string | - | Filter payments after this date (ISO 8601) |
| endDate | string | - | Filter payments before this date (ISO 8601) |
| sortBy | string | createdAt | Sort field |
| sortOrder | string | desc | Sort order (asc, desc) |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "pay_1a2b3c4d5e6f",
      "amount": 99.99,
      "currency": "USD",
      "status": "succeeded",
      "provider": "stripe",
      "createdAt": "2026-02-05T10:30:00Z"
    },
    {
      "id": "pay_9z8y7x6w5v4u",
      "amount": 49.99,
      "currency": "USD",
      "status": "pending",
      "provider": "stripe",
      "createdAt": "2026-02-04T15:20:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

**cURL Example**:
```bash
curl -X GET "https://api.example.domain.com/api/v1/payments?page=1&limit=20&status=succeeded" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### Verify Payment

Manually verify a payment status with the provider.

**Endpoint**: `POST /api/v1/payments/:id/verify`

**Authentication**: Required

**Path Parameters**:
- `id` (string, required): Payment ID

**Response**: `200 OK`
```json
{
  "id": "pay_1a2b3c4d5e6f",
  "status": "succeeded",
  "amount": 99.99,
  "currency": "USD",
  "verifiedAt": "2026-02-05T10:35:00Z",
  "providerStatus": "succeeded",
  "providerData": {
    "chargeId": "ch_1a2b3c4d5e6f",
    "last4": "4242",
    "brand": "visa"
  }
}
```

**cURL Example**:
```bash
curl -X POST https://api.example.domain.com/api/v1/payments/pay_1a2b3c4d5e6f/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### Refund Payment

Issue a full or partial refund for a payment.

**Endpoint**: `POST /api/v1/payments/:id/refund`

**Authentication**: Required

**Path Parameters**:
- `id` (string, required): Payment ID

**Request Body**:
```json
{
  "amount": 49.99,
  "reason": "customer_request",
  "metadata": {
    "ticketId": "ticket-789"
  }
}
```

**Request Parameters**:

| Field    | Type   | Required | Description |
|----------|--------|----------|-------------|
| amount   | number | No       |Refund amount (defaults to full refund) |
| reason   | string | No       |Refund reason (duplicate, fraudulent, customer_request) |
| metadata | object | No        | Custom metadata |

**Response**: `200 OK`
```json
{
  "id": "ref_1a2b3c4d5e6f",
  "paymentId": "pay_1a2b3c4d5e6f",
  "amount": 49.99,
  "currency": "USD",
  "status": "succeeded",
  "reason": "customer_request",
  "createdAt": "2026-02-05T11:00:00Z"
}
```

**cURL Example**:
```bash
curl -X POST https://api.example.domain.com/api/v1/payments/pay_1a2b3c4d5e6f/refund \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 49.99,
    "reason": "customer_request"
  }'
```

---

## Subscription Endpoints

### Create Subscription

Create a new recurring subscription.

**Endpoint**: `POST /api/v1/subscriptions`

**Authentication**: Required

**Request Body**:
```json
{
  "planId": "plan_monthly_premium",
  "paymentMethodId": "pm_1a2b3c4d5e6f",
  "provider": "stripe",
  "billingInterval": "monthly",
  "startDate": "2026-02-05T00:00:00Z",
  "trialDays": 14,
  "metadata": {
    "campaignId": "campaign-123"
  }
}
```

**Request Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| planId | string | Yes | Subscription plan identifier |
| paymentMethodId | string | Yes | Saved payment method ID |
| provider | string | No | Payment provider (auto-selected if not provided) |
| billingInterval | string | Yes | Billing cycle (monthly, yearly, quarterly) |
| startDate | string | No | Subscription start date (defaults to now) |
| trialDays | number | No | Trial period in days |
| metadata | object | No | Custom metadata |

**Response**: `201 Created`
```json
{
  "id": "sub_1a2b3c4d5e6f",
  "userId": "user_123456",
  "planId": "plan_monthly_premium",
  "status": "active",
  "provider": "stripe",
  "providerSubscriptionId": "sub_1a2b3c4d5e6f",
  "billingInterval": "monthly",
  "currentPeriodStart": "2026-02-05T10:30:00Z",
  "currentPeriodEnd": "2026-03-05T10:30:00Z",
  "trialEnd": "2026-02-19T10:30:00Z",
  "cancelAtPeriodEnd": false,
  "metadata": {
    "campaignId": "campaign-123"
  },
  "createdAt": "2026-02-05T10:30:00Z",
  "updatedAt": "2026-02-05T10:30:00Z"
}
```

---

### Get Subscription

Retrieve details of a specific subscription.

**Endpoint**: `GET /api/v1/subscriptions/:id`

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "id": "sub_1a2b3c4d5e6f",
  "userId": "user_123456",
  "planId": "plan_monthly_premium",
  "status": "active",
  "provider": "stripe",
  "billingInterval": "monthly",
  "currentPeriodStart": "2026-02-05T10:30:00Z",
  "currentPeriodEnd": "2026-03-05T10:30:00Z",
  "cancelAtPeriodEnd": false,
  "createdAt": "2026-02-05T10:30:00Z"
}
```

---

### List Subscriptions

Get a paginated list of subscriptions.

**Endpoint**: `GET /api/v1/subscriptions`

**Authentication**: Required

**Query Parameters**: Same as List Payments

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "sub_1a2b3c4d5e6f",
      "planId": "plan_monthly_premium",
      "status": "active",
      "billingInterval": "monthly",
      "currentPeriodEnd": "2026-03-05T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

---

### Cancel Subscription

Cancel a subscription (immediate or at period end).

**Endpoint**: `POST /api/v1/subscriptions/:id/cancel`

**Authentication**: Required

**Request Body**:
```json
{
  "cancelAtPeriodEnd": true,
  "reason": "too_expensive",
  "feedback": "Found a better alternative"
}
```

**Response**: `200 OK`
```json
{
  "id": "sub_1a2b3c4d5e6f",
  "status": "active",
  "cancelAtPeriodEnd": true,
  "canceledAt": "2026-02-05T11:00:00Z",
  "cancelReason": "too_expensive",
  "currentPeriodEnd": "2026-03-05T10:30:00Z"
}
```

---

### Update Subscription

Update subscription details (plan, payment method).

**Endpoint**: `PATCH /api/v1/subscriptions/:id`

**Authentication**: Required

**Request Body**:
```json
{
  "planId": "plan_yearly_premium",
  "paymentMethodId": "pm_9z8y7x6w5v4u",
  "prorationBehavior": "always_invoice"
}
```

**Response**: `200 OK`
```json
{
  "id": "sub_1a2b3c4d5e6f",
  "planId": "plan_yearly_premium",
  "status": "active",
  "upcomingInvoice": {
    "amount": 499.99,
    "date": "2026-02-05T11:00:00Z"
  }
}
```

---

### Resume Subscription

Resume a cancelled subscription.

**Endpoint**: `POST /api/v1/subscriptions/:id/resume`

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "id": "sub_1a2b3c4d5e6f",
  "status": "active",
  "cancelAtPeriodEnd": false,
  "resumedAt": "2026-02-05T11:00:00Z"
}
```

---

## Webhook Endpoints

### Stripe Webhook

Receive and process Stripe webhook events.

**Endpoint**: `POST /api/v1/webhooks/stripe`

**Authentication**: Signature verification (Stripe-Signature header)

**Headers**:
```
Stripe-Signature: t=1614556800,v1=abc123def456...
```

**Request Body**: Raw JSON payload from Stripe

**Response**: `200 OK`
```json
{
  "received": true,
  "eventId": "evt_1a2b3c4d5e6f"
}
```

**Supported Event Types**:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

### Paymob Webhook

Receive and process Paymob webhook events.

**Endpoint**: `POST /api/v1/webhooks/paymob`

**Authentication**: HMAC signature verification

**Headers**:
```
X-Paymob-Signature: abc123def456...
```

**Response**: `200 OK`
```json
{
  "received": true,
  "transactionId": "txn_1a2b3c4d5e6f"
}
```

---

## Health Check Endpoints

### Liveness Probe

Check if the service is alive.

**Endpoint**: `GET /health/live`

**Authentication**: Not required

**Response**: `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

### Readiness Probe

Check if the service is ready to accept traffic.

**Endpoint**: `GET /health/ready`

**Authentication**: Not required

**Response**: `200 OK`
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "rabbitmq": "ok",
    "stripe": "ok",
    "paymob": "ok"
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

**Failed Response**: `503 Service Unavailable`
```json
{
  "status": "error",
  "checks": {
    "database": "ok",
    "rabbitmq": "error",
    "stripe": "ok",
    "paymob": "ok"
  },
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

### Detailed Health Check

Get comprehensive health information.

**Endpoint**: `GET /health`

**Authentication**: Not required

**Response**: `200 OK`
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 86400,
  "timestamp": "2026-02-05T10:30:00Z",
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 5,
      "connections": {
        "active": 10,
        "idle": 5,
        "total": 15
      }
    },
    "rabbitmq": {
      "status": "ok",
      "responseTime": 3,
      "connections": 2
    },
    "stripe": {
      "status": "ok",
      "responseTime": 120
    },
    "paymob": {
      "status": "ok",
      "responseTime": 150
    }
  },
  "metrics": {
    "totalPayments": 12345,
    "totalSubscriptions": 678,
    "paymentsToday": 45
  }
}
```

---

## Response Codes

### Success Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request successful, no content returned |

### Client Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request format or parameters |
| 401 | Unauthorized | Authentication required or failed |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |

### Server Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Upstream service error |
| 503 | Service Unavailable | Service temporarily unavailable |
| 504 | Gateway Timeout | Upstream service timeout |

---

## API Versioning

The API uses URL-based versioning:

- Current version: `/api/v1/`
- Future versions: `/api/v2/`, `/api/v3/`, etc.

Older versions will be supported for at least 12 months after a new version is released.

---

## Idempotency

For POST requests that create resources, you can include an `Idempotency-Key` header to safely retry requests:

```bash
curl -X POST https://api.example.domain.com/api/v1/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Idempotency-Key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{"amount": 99.99, "currency": "USD"}'
```

The same idempotency key will return the same response for 24 hours.

---

## Pagination

All list endpoints support pagination with the following query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Pagination metadata is included in the response:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

---

## Testing

### Sandbox Environment

**Base URL**: `https://sandbox-api.example.domain.com`

### Test Cards (Stripe)

| Card Number | Description |
|-------------|-------------|
| 4242424242424242 | Successful payment |
| 4000000000000002 | Declined payment |
| 4000002500003155 | Requires authentication |

### Test Credentials (Paymob)

Contact support for test API keys and credentials.

---

## Support

For API support, contact:
- **Email**: api-support@example.domain.com
- **Documentation**: https://docs.example.domain.com
- **Status Page**: https://status.example.domain.com