# Bullstreet Academy — Payment & Authentication Architecture

**Version:** 1.0
**Date:** 03 September 2026
**Related:** `docs/DESIGN_DOCUMENT.md`

This document details the production-grade architecture for **payment processing** and **user authentication** for Bullstreet Academy. The current MVP simulates both flows; this is the blueprint to make them real.

---

## 1. High-Level Diagram

```
[ Browser: index.html / student.html ]
        │  HTTPS
        ▼
[ CDN / Static Host ] ── serves HTML/CSS/JS
        │
        ▼
[ API Gateway / Backend (Node.js/Express or Next.js) ]
   │                 │                  │
   ▼                 ▼                  ▼
[ Auth Service ]  [ Payment Service ]  [ Content / Entitlement ]
   │                 │                  │
   ▼                 ▼                  ▼
[ Users DB ]   [ Stripe Checkout ]  [ Enrollments DB ]
                  │  + Webhooks
                  ▼
              [ Email Service ]
```

**Three concerns:**
1. **Authentication** — who the user is.
2. **Payment** — proving they paid.
3. **Entitlement** — what they can access (gated by their enrollment).

---

## 2. Auth Service Design

### 2.1 Authentication Method
**JWT (JSON Web Tokens) delivered via HttpOnly + Secure + SameSite cookies.**
- JWT stored in an HttpOnly cookie → not accessible to JavaScript → **mitigates XSS token theft**.
- Server-side sessions table optional (stateless JWT with refresh-token rotation is recommended).

### 2.2 Tokens
| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access JWT | 15 min | HttpOnly cookie | Authorized calls to API |
| Refresh JWT | 30 days | HttpOnly cookie (rotates) | Issue new access tokens |

JWT payload:
```json
{
  "sub": "user_uuid",
  "role": "student",
  "email": "student@example.com",
  "iat": 1725300000,
  "exp": 1725300900
}
```

### 2.3 Endpoints (REST)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | Public | Create account, send verify email |
| `POST` | `/api/auth/login` | Public | Verify credentials, set cookies |
| `POST` | `/api/auth/logout` | Cookie | Clear cookies |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotate access token |
| `GET` | `/api/auth/me` | Cookie | Return current user + enrollments |
| `POST` | `/api/auth/forgot-password` | Public | Send reset email token |
| `POST` | `/api/auth/reset-password` | Public | Set new password |
| `GET` | `/api/auth/verify-email?token=` | Public | Verify email |

### 2.4 Password Security
- Hash with **bcrypt** (cost ≥ 12) or **argon2id**.
- Never store plaintext. Never log passwords.
- Enforce password policy (min 8 chars, confirmed, rate-limited attempts).

### 2.5 Security Controls
- **Rate limiting**: login (e.g., 5 attempts/15min), register, forgot-password.
- **CSRF**: `SameSite=Lax` cookies + CSRF token for mutating endpoints.
- **Brute force**: lockout + exponential backoff.
- **TLS/HTTPS** only; `Secure` cookie flag.
- **CSP** headers to prevent XSS.
- **Audit log**: login events, password changes, enrolments.

---

## 3. Payment Service Design (Stripe)

### 3.1 Why Stripe
- Fully PCI-DSS compliant — card data never touches our servers.
- Hosted Checkout = minimal custom payment UI.
- Reliable Webhooks for entitlement grants.
- Subscriptions support for self-paced monthly tier.

### 3.2 Payment Flow (one-time + subscription)
```
User on pricing page → clicks "Choose Plan"
   │
   ▼
POST /api/checkout { planId }
   │
   │ 1. Validate plan + user
   │ 2. Create/ensure user (or require login)
   │ 3. Create Stripe Checkout Session:
   │    - line_items: plan
   │    - mode: 'payment' (5-day/4-week) OR 'subscription' (video-tier map to recurring price)
   │    - success_url /api/payment/success
   │    - cancel_url /api/payment/cancel
   │ 4. Record pending order { orderId, stripeSessionId, planId, userId }
   │
   ▼
Redirect user to Stripe Hosted Checkout
   │
   ▼
User pays on Stripe's PCI-compliant page
   │
   ▼
Stripe sends Webhook → POST /api/webhooks/stripe
   ├─ checkout.session.completed
   │    ├─ 1. Look up order by session_id
   │    ├─ 2. Verify amount & plan match
   │    ├─ 3. Mark order 'paid'
   │    ├─ 4. Create/activate enrollment
   │    │     - lifetime tiers → grant forever
   │    │     - self-paced → expires_at = now + 1 month
   │    ├─ 5. Send email (receipt + credentials/access)
   │    └─ 6. Log success (idempotency key)
   ├─ invoice.payment_succeeded   (recurring renewal)
   └─ invoice.payment_failed      (self-paced: notify + grace period)
```

### 3.3 Webhook Reliability
- **Verify signature**: use Stripe's `stripe-signature` header + endpoint secret.
- **Idempotency**: store `event.id`; skip if already processed (prevents duplicate grants on retries).
- **Handle failures**: failed webhook delivery gets retried by Stripe (dlt-managed queue).
- **Manual fallback**: admin dashboard to mark orders paid / grant access if a webhook is ever missed.

### 3.4 Upgrade Path (self-paced → lifetime)
When a Video-tier student tops up to 4-Week tier:
```
POST /api/upgrade { orderId }
   ├─ compute tuition differential (target price − current paid)
   ├─ create Stripe Checkout for the difference
   ├─ pay → webhook
   └─ update enrollments.status = 'upgraded', set lifetime
```

### 3.5 Refunds
- Admin-initiated via Stripe Dashboard or `POST /api/admin/refund`.
- Update `orders.status = 'refunded'`; revoke/grant per policy.

---

## 4. Entitlement / Access Control

### 4.1 Enrollment model
| Field | Type | Notes |
|-------|------|-------|
| `id` | PK | |
| `user_id` | FK | owner |
| `plan_id` | FK | what was bought |
| `granted_at` | timestamp | when |
| `expires_at` | timestamp nullable | `NULL` = lifetime; set = self-paced expiry |
| `status` | enum | `active` / `expired` / `upgraded` |

### 4.2 Entitlement check (on every dashboard load)
1. Verify JWT (auth).
2. Fetch active enrollments for user (join plans + content_nodes).
3. Filter content to only nodes whose `track`/`phase` matches an active enrollment.
4. If `expires_at < now` → show "subscription lapsed; renew/subscribe".

### 4.3 Content gating (LMS)
- Video URLs are **signed/expiring** (Vimeo OTT, Mux, or CloudFront signed URLs) so they can't be shared beyond the enrolled period.
- Downloads (e.g., DOM template `.cht`) generated via signed links, entitlement-checked.

---

## 5. Data Schema (PostgreSQL)

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT DEFAULT 'student',
  email_verified BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plans (
  id            UUID PRIMARY KEY,
  track         TEXT NOT NULL,          -- 'retail' | 'institutional'
  package       TEXT NOT NULL,          -- '5_day' | '4_week' | 'video'
  name          TEXT NOT NULL,
  price_cents   INT NOT NULL,
  currency      TEXT DEFAULT 'USD',
  is_recurring  BOOLEAN DEFAULT false,
  support_tier  TEXT NOT NULL           -- 'lifetime' | 'self_paced'
);

CREATE TABLE orders (
  id               UUID PRIMARY KEY,
  user_id          UUID REFERENCES users(id),
  plan_id          UUID REFERENCES plans(id),
  stripe_session_id TEXT UNIQUE,
  stripe_event_id  TEXT UNIQUE,         -- idempotency
  status           TEXT DEFAULT 'pending',  -- pending|paid|refunded
  amount_cents     INT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE enrollments (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  plan_id     UUID REFERENCES plans(id),
  granted_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ,              -- NULL = lifetime
  status      TEXT DEFAULT 'active'
);

CREATE TABLE content_nodes (
  id         UUID PRIMARY KEY,
  track      TEXT,
  phase      TEXT,                      -- for institutional
  section    TEXT,
  title      TEXT,
  video_url  TEXT,                      -- signed at serve time
  sort_order INT
);
```

---

## 6. Recommended Libraries / Services

### Payment
- **stripe** (official Node SDK)
- Stripe Checkout (hosted) + Subscriptions

### Auth
- **jsonwebtoken** / **jose**
- **bcrypt** or **argon2**
- Optionally **iron-session** or managed **Auth0/Clerk** to reduce boilerplate

### Backend
- **Node.js + Express** or **Next.js API routes + NextAuth** (tightest integration)

### Database
- **PostgreSQL** via **Prisma** or **Drizzle** ORM

### Emails
- **Resend**, **Postmark**, or **SendGrid** (transactional)
- Templates: welcome, payment receipt, credentials, password reset, subscription renewal/lapse

### Video
- **Vimeo OTT / Mux** for private, entitlement-gated video
- **CloudFront signed URLs** for private downloads

---

## 7. Auth & Payment Sequence (end-to-end)

```
1. Student clicks "Enroll" (static) → POST /api/checkout
2. Backend ensures user session exists → creates pending order + Stripe session
3. Student pays on Stripe → redirected to success URL
4. Webhook confirms → order PAID → enrollment granted → email sent
5. Student goes to Student Login → POST /api/auth/login → JWT + cookies set
6. GET /api/auth/me + /api/dashboard → loads granted track/package content
7. Portal renders only entitled modules + progress
8. Self-paced: entitlements checked against expires_at each load
```

---

## 8. Migration Plan from MVP

| MVP (now) | Production (target) |
|-----------|---------------------|
| localStorage session | HttpOnly JWT cookies |
| `confirm()` track choice | Server-side `role`/`enrollments` |
| Simulated payment alert | Stripe Checkout + webhooks |
| Static `student.html` | Dynamic `/dashboard` from `/api` |
| No DB | PostgreSQL (users, orders, plans, enrollments) |
| No email | Transactional email service |
| Progress in localStorage | Progress persisted to DB |

**Recommended build order (Phase B):**
1. Set up Node/Express + PostgreSQL + Prisma.
2. Implement `users` + JWT auth (register, login, me, logout).
3. Define `plans` seed data (6 plans from pricing matrix).
4. Implement Stripe Checkout + webhooks → grants enrollment.
5. Add email service.
6. Convert `student.html` to render from `/api/dashboard`.

---

*End of Payment & Authentication Architecture.*
