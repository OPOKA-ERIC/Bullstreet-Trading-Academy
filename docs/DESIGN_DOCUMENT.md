# Bullstreet Academy — Website Design Document

**Version:** 1.0
**Date:** 03 September 2026
**Status:** In Development (MVP complete, production architecture pending)

---

## 1. Project Overview

Bullstreet Academy is a professional online trading education platform serving two learner tracks: **Retail Trader** and **Institutional Trader**. The website currently exists as a **static front-end prototype** (`index.html`, `student.html`, `styles.css`, `script.js`, `logo.jpeg`) built to benchmark on the G7FX institutional-education model.

This document defines the current implementation, the intended production architecture (with particular focus on **payment and authentication**), visual design system, and content structure.

---

## 2. Business Concept

### 2.1 Tracks (Curriculum)
- **Track 1 — Retail Trader Track:** 4-week structured syllabus (platform setup, key levels, trends/patterns, indicators, session liquidity, psychology).
- **Track 2 — Institutional Track:** 33 enterprise videos across 2 phases:
  - Phase 1: Foundation & DOM Mastery (21 videos)
  - Phase 2: Order Flow & Execution Mastery (12 videos)
  - Includes free custom DOM software (retail value $2,500).

### 2.2 Packages (track-agnostic)
| Package | Description |
|---------|-------------|
| 5-Day Intensive | Fast-paced live delivery |
| 4-Weeks Comprehensive | High-engagement framework (Most Popular) |
| Video Sessions | Fully self-paced HD archive |

### 2.3 Pricing Matrix (USD)
| Track | 5-Day | 4-Weeks | Video |
|-------|-------|---------|-------|
| Retail | $200 | $249 | $170 |
| Institutional | $1,390 | $1,400 | $1,000 |

### 2.4 Support Policy
- **Premium Live Tiers (5-Day & 4-Weeks):** Full lifetime support, zero recurring fees, all future updates free.
- **Self-Paced Tier (Video):** Baseline recorded modules; ongoing support requires monthly subscription; upgradeable via tuition-differential top-up at any time.

---

## 3. Goals & Non-Goals

### Goals
- Clearly present both tracks and all packages in a conversion-focused, institutional-styled landing page.
- Provide a Student Login flow that routes the user to the portal for their enrolled track.
- Deliver a student portal showing enrolled content and progress.
- Establish an architecture that supports real payments and authentication in production.

### Non-Goals (current MVP)
- No real payment processing (simulated in MSV).
- No real backend database / auth (localStorage only, demo).
- No video hosting / LMS integration yet (content is listed statically).

---

## 4. Visual Design System

### 4.1 Brand
- **Name:** Bullstreet Academy (BSA)
- **Logo:** `logo.jpeg` (holds the institutional bull/market motif)

### 4.2 Color Palette
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0a0e17` | Base dark background |
| `--bg-2` | `#0f1524` | Alternate section background |
| `--bg-3` | `#131b2e` | Cards / inputs inner |
| `--bg-card` | `#111a2c` | Card surface |
| `--border` | `#1e2a45` | Borders, dividers |
| `--text` | `#e8ecf4` | Primary text |
| `--text-muted` | `#9aa7bd` | Secondary text |
| `--green` | `#22c55e` | Primary accent, CTAs, success |
| `--green-2` | `#16a34a` | Gradient partner |
| `--gold` | `#d4af37` | Secondary accent, badges, premium |
| `--gold-2` | `#b8962e` | Gradient partner |

Dark institutional "trading floor" aesthetic, green/gold accent, benchmarked on G7FX.

### 4.3 Typography
- **Headings:** Sora (weights 400–800)
- **Body:** Inter (weights 400–800)

### 4.4 Components
- Buttons: `btn-primary`, `btn-outline`, `btn-ghost`, sizes `sm`/`lg`/`block`
- Cards: `card` with hover border/glow
- Tags/badges, pills, tabs (`tab-btn`), accordions (`faq-item`)
- Modal system (`modal-overlay.open`) for login & join
- Progress bars (portal)
- Responsive breakpoints: 900px, 720px

---

## 5. Information Architecture / Pages

| File | Purpose | Route (production) |
|------|---------|--------------------|
| `index.html` | Landing page (single page w/ scroll sections) | `/` |
| `student.html` | Student portal (post-login, per-track) | `/dashboard` (protected) |
| `styles.css` | Shared design system | — |
| `script.js` | Landing page interactivity | — |

### Landing page sections (in order)
1. Sticky nav (with Student Login)
2. Hero (headline, CTAs, stats)
3. Why Bullstreet (4 value cards)
4. Choose Your Track (Retail vs Institutional)
5. Syllabus (tabbed: Retail 4-weeks + Institutional 2 phases)
6. Pricing (tabbed Retail/Institutional, support policy)
7. Join CTA (4-step enrolment flow)
8. FAQ (accordion)
9. Footer (with risk disclosure)

### Student portal
- Welcome header (signed-in email)
- Track selector (Retail / Institutional)
- Track content: module/section lists, included assets, progress bar
- Logout

---

## 6. Current Front-End Architecture

### 6.1 Tech Stack (MVP)
- **Plain HTML5 / CSS3 / vanilla JavaScript** — no framework, no build step.
- **Fonts:** Google Fonts (Sora + Inter).
- **State (demo):** `localStorage` keys:
  - `bsa_logged_in` → `{ email }`
  - `bsa_track` → `retail` | `institutional`
  - `bsa_progress_*` → percent for portal progress bar
- **Hosting:** static file hosting (works as-is on any static host).

### 6.2 Current Flow (as implemented)
1. User clicks **Student Login** → modal opens.
2. Enters email + password → **simulated** validation.
3. Confirms track (Retail/Institutional).
4. Redirects to `student.html?track=...` → portal shows that track's content.
5. Portal has Logout → clears session → back to landing.

> **Note:** Authentication and payment are currently *simulated* (confirm/alerts) — see Section 7/8 for production design.

---

## 7. Production Architecture — Payment & Authentication

> Target: move from static prototype to a real, secure, multi-tenant learning platform.

### 7.1 Recommended Stack
- **Frontend:** keep static HTML/CSS/JS (or migrate to React/Next for maintainability) — served via CDN.
- **Backend/API:** Node.js (Express) or Next.js API routes — REST endpoints.
- **Database:** PostgreSQL (primary) — users, orders, enrollments, content metadata.
- **Auth:** JWT + HTTP-only secure cookies (or managed Auth0 / Clerk).
- **Payments:** **Stripe** (checkout + webhooks) — PCI-compliant, simplest path. Optional PayPal.
- **Content/LMS:** A video-hosting provider (Vimeo OTT, Mux, or YouTube Private) gated by backend entitlements.

### 7.2 Data Model (core tables)

**users**
- id (PK)
- email (unique)
- password_hash (bcrypt/argon2)
- full_name
- role (`student` | `admin`)
- created_at

**plans**
- id (PK)
- track (`retail` | `institutional`)
- package (`5_day` | `4_week` | `video`)
- name
- price_cents
- currency (`USD`)
- is_recurring (boolean — video tier)
- support_tier (`lifetime` | `self_paced`)

**orders**
- id (PK)
- user_id (FK)
- plan_id (FK)
- stripe_session_id / payment_id
- status (`pending` | `paid` | `refunded`)
- amount_cents
- created_at

**enrollments**
- id (PK)
- user_id (FK)
- plan_id (FK)
- granted_at
- expires_at (nullable — self-paced monthly)
- status (`active` | `expired` | `upgraded`)

**content_nodes** (module/section/video metadata)
- id, track, phase, section, title, video_url, sort_order, downloadable

### 7.3 Payment Flow (Stripe)
```
User selects plan (frontend) 
   → POST /api/checkout { plan_id }
   → Backend creates enrolment draft + Stripe Checkout Session
   → Redirect user to Stripe Hosted Checkout
   → User pays
   → Stripe Webhook → POST /api/webhooks/stripe { event }
       ├─ checkout.session.completed → mark order PAID
       └─ grant/activate enrollment (lifetime or expires_at = +1 month)
   → Email confirmation + credentials sent to user
   → User logs in → dashboard shows granted track/package
```

**Webhook best practices**
- Verify Stripe signature (`stripe-signature` header + webhook secret).
- Idempotency keys to avoid duplicate grants.
- Record raw event for audit.

### 7.4 Authentication Flow (JWT + HttpOnly cookie)
```
Register/Login (POST /api/auth/login)
   → verify credentials (bcrypt compare)
   → issue JWT { sub, role } 
   → set HttpOnly, Secure, SameSite=Lax cookie
   → frontend reads /api/me to hydrate session
Protected route (e.g. /dashboard)
   → middleware verifies JWT cookie
   → loads enrollments via DB
   → only renders modules the user is entitled to
Logout → clear cookie
```
**Security:**
- Passwords hashed with **bcrypt** (cost ≥ 12) or **argon2id**.
- JWT short-lived access + refresh token rotation.
- CSRF mitigation (SameSite cookies + CSRF token for mutating endpoints).
- Rate limiting on login/checkout endpoints.
- Email verification + password reset (tokens).

### 7.5 Entitlement / Access Control
- Enrollment grants access per `plan_id`.
- Video tier `expires_at` checked on each dashboard load; if expired, show "subscribe to continue".
- Upgrade path: top-up endpoint computes tuition differential → creates a new Stripe session for the difference → upgrades `enrollments.status` to `upgraded` (lifetime).

### 7.6 Admin
- Admin role can: manage users, plans, grant/revoke enrollments, view orders, mark refunds.

---

## 8. Security & Compliance

- **PCI:** Rely on Stripe hosted checkout — never store card data.
- **PII/Data Protection:** encrypt at rest, minimal data collection, backup policy.
- **Risk Disclosure:** footer already present; add acceptance on enrolment.
- **Rate limiting & abuse protection** on all public endpoints.
- **HTTPS only** in production; CSP headers; cookie flags.
- **Refund policy:** enforce via Stripe refunds + `orders.status`.

---

## 9. Roadmap

### Phase A — Current (MVP) ✅
Static landing + simulated login/payment + static student portal.

### Phase B — Foundation (Next)
- Backend API + PostgreSQL
- Real Stripe checkout + webhooks
- JWT auth + HttpOnly sessions
- Email service (transactional — enrolment, receipts, password reset)
- Convert student portal to dynamic dashboard driven by `/api`

### Phase C — LMS & Content
- Video hosting integration with per-user entitlements
- Progress persistence to DB
- Downloads for DOM template / course files
- Admin dashboard

### Phase D — Scale
- Marketing blog / SEO
- Localized pricing / multi-currency
- Analytics & A/B testing
- Community / support-in-portal

---

## 10. Key Technical Decisions (summary)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payments | Stripe (hosted checkout + webhooks) | PCI-compliant, reliable, low effort |
| Auth | JWT + HttpOnly cookie | Stateless, secure, simple for SPA+API |
| Store | PostgreSQL | Relational integrity for orders/enrollments |
| Password hashing | bcrypt/argon2id | Industry standard |
| Delivery model | 2 tracks × 3 packages | Full flexibility per business spec |
| Design | Dark + green/gold, G7FX-benchmarked | Institutional credibility & conversion |
