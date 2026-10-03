# Bullstreet Academy — 2-Month Infrastructure Budget

**Prepared for:** Kenedy Haggai Okello (Kenny Black)
**Date:** 10 September 2026
**Period:** Month 1 – Month 2 (Launch Window)

---

## 1. Summary

| Category | 2-Month Total |
|----------|--------------|
| One-Time Costs | $12 |
| Monthly Subscriptions | $150 |
| Payment Processing | 1.4–3.5% per sale (no monthly fee) |
| **Total to Set Aside** | **$175** |
| **Recommended Budget (with buffer)** | **$250** |

---

## 2. One-Time Costs

| Item | Provider | Purpose | Cost |
|------|----------|---------|------|
| Domain Registration | Namecheap | bullstreetacademy.com (annual renewal) | $12 |

> Paid once at launch. Covers domain ownership for 12 months.

---

## 3. Monthly Subscriptions

| Service | Provider | Purpose | Monthly Cost | 2-Month Cost |
|---------|----------|---------|-------------|-------------|
| Website Hosting | Vercel Pro | Host the landing page + student portal | $20 | $40 |
| Video Hosting | Cloudflare Stream | Private video hosting for course content | $5–10 | $10–20 |
| Database | Supabase Pro | PostgreSQL database (users, orders, enrollments) | $25 | $50 |
| Email Service | Resend Pro | Transactional emails (receipts, credentials, password resets) | $20 | $40 |
| **Subtotal** | | | **$70–75** | **$140–150** |

### Service Breakdown

**Vercel Pro — $20/mo**
- Hosts the static website (index.html, student.html, styles.css, script.js)
- Automatic HTTPS, global CDN, fast load times
- Required for commercial use (free tier does not allow business sites)

**Cloudflare Stream — $5–10/mo**
- $5/mo base fee for account access
- $5 per 1,000 minutes of video stored
- $1 per 1,000 minutes of video delivered (streamed to students)
- Early-stage estimate: ~$5–10/mo with low student volume
- Scales with usage — only pay for what students actually watch

**Supabase Pro — $25/mo**
- Hosts the PostgreSQL database
- Stores user accounts, orders, enrollment records, course metadata
- 8 GB database storage (more than enough for初期)
- 100,000 monthly active users included
- Email support, daily backups, no inactivity pausing

**Resend Pro — $20/mo**
- Sends transactional emails: enrollment confirmations, login credentials, password resets, payment receipts
- 50,000 emails per month (no daily cap)
- Sufficient for hundreds of students per month
- Includes open/link tracking, webhooks, and analytics

---

## 4. Payment Processing (Flutterwave)

| Fee Type | Rate |
|----------|------|
| Mobile Money (MTN / Airtel) | ~1.4% per transaction |
| International Card (Visa / Mastercard) | ~3.5% per transaction |
| Account Setup | Free |
| Monthly Fee | Free |

### Revenue Examples

| Package | Price | Mobile Money Fee (~1.4%) | Card Fee (~3.5%) |
|---------|-------|-------------------------|-------------------|
| Retail Video Sessions | $170 | $2.38 | $5.95 |
| Retail 5-Day Intensive | $200 | $2.80 | $7.00 |
| Retail 4-Weeks Package | $249 | $3.49 | $8.72 |
| Institutional Video Sessions | $1,000 | $14.00 | $35.00 |
| Institutional 5-Day Intensive | $1,390 | $19.46 | $48.65 |
| Institutional 4-Weeks Package | $1,400 | $19.60 | $49.00 |

> Payment processing fees are deducted from revenue, not from the infrastructure budget. These figures are for planning purposes only.

---

## 5. Budget Summary

### Option A — Minimum Viable (Not Recommended)

| Item | 2-Month Cost |
|------|-------------|
| Domain | $12 |
| Namecheap Stellar Hosting | $12 |
| Cloudflare Stream | $10 |
| Supabase Free Tier | $0 |
| Resend Free Tier | $0 |
| **Total** | **$34** |

> Not recommended for a commercial launch. Free tiers have limitations: database pauses after inactivity, email capped at 100/day, no production-grade support.

### Option B — Recommended (All Paid Services)

| Item | 2-Month Cost |
|------|-------------|
| Domain | $12 |
| Vercel Pro Hosting | $40 |
| Cloudflare Stream | $20 |
| Supabase Pro | $50 |
| Resend Pro | $40 |
| **Total** | **$162** |
| **With Buffer** | **$175–250** |

---

## 6. What the Client Needs to Do

| Action | Provider | Cost | Status |
|--------|----------|------|--------|
| Purchase domain (bullstreetacademy.com) | Namecheap | $12 | Pending |
| Create Cloudflare account | Cloudflare | Free | Pending |
| Create Flutterwave business account | Flutterwave | Free | Pending |
| Create Supabase account | Supabase | Free (paid plan activated at build) | Pending |
| Create Resend account | Resend | Free (paid plan activated at build) | Pending |
| Create Vercel account | Vercel | Free (paid plan activated at build) | Pending |

---

## 7. Important Notes

1. **All subscription costs are billed monthly.** There are no long-term contracts or annual commitments required.
2. **Flutterwave charges nothing upfront.** Fees are only deducted from actual student payments.
3. **Cloudflare Stream scales with usage.** The $5–10/mo estimate is for early-stage. As video content and student numbers grow, this may increase.
4. **Supabase and Resend paid plans are activated during the build phase.** Both offer free tiers that can be used during development at no cost.
5. **The $250 recommended budget includes an $88 buffer** for overages, unexpected costs, or small add-ons during the 2-month launch window.

---

## 8. After 2 Months

Once the platform is live and generating revenue, the monthly recurring cost stabilizes at approximately **$70–75/mo**. This should be covered by the first few student enrollments:

| If you sell... | Revenue | Covers monthly cost? |
|----------------|---------|---------------------|
| 1 Retail 4-Weeks Package | $249 | Yes — 3.3 months of infra |
| 1 Institutional Video Sessions | $1,000 | Yes — 13.3 months of infra |
| 1 Institutional 4-Weeks Package | $1,400 | Yes — 18.7 months of infra |

---

*End of budget document.*
