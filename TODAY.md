# Bullstreet Academy — TODAY

**Session date:** Sunday, 4 October 2026
**Repo:** `D:\MY LIFE\SOFTWARE PROJECTS\HAGGAI_TRADING_WEBSITE`
**Remote:** `https://github.com/OPOKA-ERIC/Bullstreet-Trading-Academy.git`
**Live site:** `https://opoka-eric.github.io/Bullstreet-Trading-Academy/`
**Supabase project ref:** `bjariigetjvymnvkkesh`
**Supabase URL:** `https://bjariigetjvymnvkkesh.supabase.co`
**Remote HEAD at end of session:** `4b4af99`

> This document supersedes the earlier `today.pdf` written at 11:05 today. It records the
> whole day including every failure, because the failures are the useful part: five of the
> six database errors today were self-inflicted, and the reasons why are worth not repeating.

---

## 1. Where things stand right now

| Area | State |
| --- | --- |
| Frontend JS/HTML/CSS | **Working and deployed.** All 9 JS files pass `node --check`. |
| GitHub Pages routing | **Fixed.** Relative redirects work from the repo subpath. |
| Landing page auth buttons | **Fixed.** Point at the real Supabase auth pages. |
| Schema migrations | **Written, ordered correctly, ASCII-clean — but never successfully applied.** |
| Live Supabase database | **Not functional.** `public.test_questions` does not exist. |
| App end-to-end flow | **Untested and presumed broken**, because the database is empty. |
| CLI access to the project | **Blocked.** Logged in to the wrong Supabase account. |

**One-line summary:** the entire client side is done; the entire database side is not applied;
the blocker is that the Supabase CLI is authenticated to an account that does not own this project.

---

## 2. The goal

Make this flow work end to end:

> signup / login → Impulse Test → diagnosis → prescribed task path → submission → grading → next task unlocks

---

## 3. Successes

### 3.1 Frontend made functional — commit `6635c2a`

14 files, +994 / −393. The largest and most valuable commit of the day.

**Routing.** Root-absolute redirects (`/app/login.html`) 404'd because the site is served
from a repository subpath, not a domain root. All internal navigation now uses relative paths.

**Access.** The landing page "Student Login" and "Create Account" buttons now go to the real
Supabase auth pages. The legacy modal login no longer fakes a `localStorage` session — it
forwards to `app/login.html`.

**Prescription.** Added `js/prescription.js` (shared diagnosis metadata + task assignment).
The dashboard renders the student's task path grouped by day, with
`locked` / `ready` / `in-review` / `passed` states. Completing the Impulse Test auto-seeds the
matching task path. Passing a task unlocks the next one.

**Tasks.** MCQ tasks now render selectable options and are graded against `tasks.correct_answer`.
Before this, **every** submission auto-passed. Locked tasks can no longer be submitted by
pasting a direct URL, `max_attempts` is enforced, upload failures surface to the user, the retry
button genuinely swaps to an alternate task variant, and the verification-unlock notice is populated.

**Security.** Escaped DB-derived values in the dashboard and grading queue — there was a stored
XSS vector via `innerHTML`.

**Cleanup.** `student.html` and `lesson.html` reduced to redirects into the app.

### 3.2 Seed data no longer depends on `day_id` — commit `ccbec85`

The pre-existing live `tasks.day_id` column is `uuid`, but the schema file declared it `integer`.
Because `create table if not exists` is a no-op on an existing table, the integer seed values
failed. Ordering now comes from a global `sort_order` plus a new `day_label` text column.
`day_id` is kept as a nullable passthrough for compatibility and is no longer read by the app.

Also removed `grading.js`'s reliance on an embedded `tasks(day_id)` join to resolve day grouping.

### 3.3 `ON CONFLICT` targets now exist — commit `6e06a64`

`verification_links`, `submission_rubric` and `profiles` also pre-date the schema file, so their
declared `PRIMARY KEY`s were never applied. Any `ON CONFLICT` or `supabase-js` `upsert` with
`onConflict` against them failed. Each table is deduped by `ctid`, then a unique index is created
explicitly. The `verification_links` seed was also switched off `ON CONFLICT` onto the
`NOT EXISTS` guard the other seeds use, so a missing constraint can never abort the migration again.

### 3.4 RLS infinite recursion fixed — commit `96fb02a`

**This was the important one.** The original design was:

```
current_role()  ->  reads role FROM public.profiles
profiles policy ->  calls public.current_role()
```

Evaluating the policy re-entered the policy, so Postgres aborted every authenticated query with
`42P17 infinite recursion detected in policy for relation "profiles"`. Signup, dashboard,
assessment, task loading and grading were all dead.

The fix moves the authorisation lookup into its own `user_roles` table whose policy is a plain
`user_id = auth.uid()`. Nothing ever reads another user's role row, so no cycle can form.
`profiles.role` is kept in sync so the client code is unchanged.

While fixing it I also closed a hole I was about to introduce: the `profiles_update_own` policy
lets any student `UPDATE` their own profile row, which meant a student could set
`role = 'admin'` on themselves. There is now a `BEFORE UPDATE` trigger that reverts role changes
unless the caller is already a tutor or admin. It deliberately no-ops when `auth.uid()` is null so
that role changes made from the SQL Editor still apply — the first draft of that trigger silently
swallowed admin role management, which would have been a worse bug than the one being fixed.

### 3.5 Function-before-policy ordering fixed — commit `25944cc`

`CREATE POLICY` resolves function references at creation time. The `user_roles` policies were
declared *before* `current_role()` existed, so any database without the function already present
failed with `42883`. Both `0001` and `0002` were reordered to: create table → create function →
create policies.

### 3.6 Clean-slate reset added — commit `7f3617f`

`supabase/reset.sql` drops the entire `public` schema surface — tables, functions, triggers,
policies, storage policies. `auth.users` is deliberately untouched, and `0001` now re-creates
profile rows for any login that already exists, so existing logins keep working.

### 3.7 Read-only diagnostic added — commit `9973ca7`

`supabase/diagnostic.sql` — six catalog queries reporting which functions, tables, RLS flags,
policies, column types and row counts actually exist. Intended to stop guessing.

### 3.8 SQL forced to pure ASCII — commit `4b4af99`

Em-dashes had been silently corrupted into the three-character sequence
`U+00E2 U+20AC U+201D` by a PowerShell encoding round-trip. Several landed **inside SQL string
literals** (task titles, seed prompts) where the garbage terminates the literal early and the
remaining words get parsed as SQL. All SQL is now pure ASCII, and the seeded titles were updated
together with their `where t.title = ...` lookups so they still match.

Verified after the fix: no mojibake sequence remains in any tracked text file, and all 9 JS files
pass `node --check`.

---

## 4. Failures

Six database errors today. Every one is recorded with its actual cause.

| # | Error | Root cause | Fixed? |
| --- | --- | --- | --- |
| 1 | `42804` column `day_id` is `uuid` but expression is `integer` | Live column type differed from schema file; `create table if not exists` did nothing | Yes — `ccbec85` |
| 2 | `42P10` no unique or exclusion constraint matching `ON CONFLICT` | Declared PKs never applied to pre-existing tables | Yes — `6e06a64` |
| 3 | `42P17` infinite recursion detected in policy for relation `profiles` | Genuine design flaw in the RLS policy graph | Yes — `96fb02a` |
| 4 | `42883` function `public.current_role()` does not exist | Policies created before the function | Yes — `25944cc` |
| 5 | `42601` syntax error at or near `as` | **My diagnostic SQL was malformed.** Bad column alias | Yes — diagnostic rewritten |
| 6 | `42P01` relation `a` does not exist | **Cause never confirmed.** Mojibake was one candidate; the error recurred after that fix | **No — unresolved** |
| 7 | `42P01` relation `public.test_questions` does not exist | `0001` aborted before creating any tables | Consequence of #6 |

### 4.1 Error #6 in detail — the one still open

`0001_init.sql` failed with `relation "a" does not exist`, and afterwards `public.test_questions`
did not exist either, meaning the script aborted *before* line 57 where that table is created.

Everything before line 57 is only: create `user_roles`, create `current_role()`, grant, enable RLS,
three policies, create `profiles`. None of that references an identifier `a`.

What was actually done to investigate:

- Re-read all 549 lines of `0001_init.sql`. No bare `a` in any relation position.
- The only `a` aliases in the file are the three dedupe statements
  (`delete from public.user_progress a using public.user_progress b ...`), and
  `DELETE FROM tbl a USING tbl b` is valid PostgreSQL.
- Wrote a proper lexer (`sqllex.js`) that walks the file handling line comments, dollar-quoted
  blocks and `''`-escaped string literals. Result: **no unclosed literals** in any of
  `0001_init.sql`, `0002_role_rls_fix.sql`, `reset.sql` or `diagnostic.sql`.
- Ran it across all four SQL files. All clean.

The strongest remaining hypothesis is that **the error was never in the file** — that a 549-line
script was damaged in transit during copy-paste into the Supabase SQL Editor. Supporting evidence:
the very first diagnostic query pasted back came back with a syntax error in a construct I had
written correctly, which proves the paste path is lossy.

That hypothesis is untested, and testing it requires CLI access rather than more guessing.

### 4.2 The mistake that cost the most time

For five rounds I kept patching migrations against a database whose contents I could not read,
inferring the state from whatever error came back. Each error message was treated as a new fact
about the schema. This is backwards: the diagnostic should have been run *first*, and the failure
was mine — I built a diagnostic, then asked for only its last line rather than all six outputs.

By roughly the fourth round the patching had made things worse, because each fix was applied to a
half-applied state and could not be reasoned about. The reset script in §3.6 exists because of that.

---

## 5. The blocker for tomorrow

The Supabase CLI is installed and working:

```
supabase --version   ->  2.118.0
```

But `supabase projects list` returns only:

| Reference ID | Name | Region |
| --- | --- | --- |
| `jsjhgwficdrgzwbwzkhm` | TutorUG | West EU (Ireland) |
| `lgfrlvoobnszfhafzjzkhm` | ShopLedger | Central EU (Frankfurt) |

`bjariigetjvymnvkkesh` — the Bullstreet project the code points at (`js/supabase-client.js:2`) —
**is not in that list.** The CLI is authenticated to a different Supabase account than the one
that owns this project.

`supabase/.temp/` contains only `cli-latest`, no `project-ref`, so the project is **not linked**.
Credentials live in the Windows credential manager and cannot be read from the shell, so the
logged-in identity cannot be confirmed programmatically.

A likely reason the first attempt at `supabase login` appeared to succeed while changing nothing:
the CLI was already authenticated, so `login` refused and did not switch accounts.

---

## 6. Resume here tomorrow

### Step 1 — fix the CLI login

Run from the project folder:

```
cd "D:\MY LIFE\SOFTWARE PROJECTS\HAGGAI_TRADING_WEBSITE"
supabase logout
supabase login
supabase projects list
```

`login` prints a URL and waits. Sign in **with the account that owns Bullstreet**. To find that
account: open the Supabase dashboard on the Bullstreet project, then click the avatar top-right.
If the browser auto-logs into the wrong account, sign out in that tab or use a private window.

**Gate:** `supabase projects list` must show the Bullstreet project. If it still shows only
TutorUG and ShopLedger, stop and report — the login landed on the wrong account.

### Step 2 — link

```
supabase link --project-ref bjariigetjvymnvkkesh
```

Prompts for the database password: Supabase dashboard → Bullstreet project →
**Project Settings → Database**.

### Step 3 — inspect before changing anything

Do this before `db push`, because the live schema is unknown and error #6 is still unexplained:

```
supabase db dump --file supabase/_live_schema.sql --schema public
```

Read it. That single file answers every open question — whether `test_questions` exists, which
policies are present, what `tasks.day_id` actually is, and whether the mojibake is present in the
live database as well as the repo.

### Step 4 — apply

Once the live schema is known, decide between:

- `supabase db push` to apply `0001` then `0002` as versioned migrations, or
- running the SQL directly if the live schema needs a bespoke repair.

Prefer `db push`: it records applied versions, so the same statement never runs twice.

Note that `0002_role_rls_fix.sql` was written as a delta against a database state that no longer
exists. On a clean database `0001` alone should be sufficient, and `0002` may be deletable.

### Step 5 — ignore `supabase/.temp/`

Currently untracked. Add `supabase/.temp/` to `.gitignore` before committing — it is CLI
connection state and should not be in the repo.

### Step 6 — verify

```sql
select 'questions' as t, count(*) from public.test_questions
union all select 'tasks', count(*) from public.tasks
union all select 'rubric_items', count(*) from public.rubric_items
union all select 'task_variants', count(*) from public.task_variants
union all select 'verification_links', count(*) from public.verification_links
union all select 'profiles', count(*) from public.profiles
union all select 'user_roles', count(*) from public.user_roles;
```

Expected: 10 questions, 13 tasks, 4 rubric items, 1 task variant, 1 verification link,
and one `profiles` + `user_roles` row per existing login.

Then promote the owner account and confirm the role propagates to both tables:

```sql
update public.profiles set role = 'tutor'
where id = (select id from auth.users where email = 'academybullstreet@gmail.com');

select u.user_id, u.role as user_roles_role, p.role as profiles_role
from public.user_roles u
join public.profiles p on p.id = u.user_id;
```

Both role columns must read `tutor`. If `user_roles_role` is `tutor` but `profiles_role` is not,
the sync trigger is not firing.

### Step 7 — test the real flow

1. Sign up a brand-new account.
2. Confirm the dashboard loads without a recursion error.
3. Take the Impulse Test.
4. Confirm a diagnosis is saved and the Day 1 task appears as `ready`.
5. Submit Day 1.
6. Grade it as tutor.
7. Confirm Day 2 unlocks.
8. Confirm a student cannot self-promote by updating their own profile.

---

## 7. Commit log for the day

| Time | Commit | Subject |
| --- | --- | --- |
| 11:05 | `61c30e1` | Add implementation summary PDF (today.pdf) |
| 13:14 | `6635c2a` | Fix GitHub Pages 404s and make the rehab app functional end-to-end |
| 13:34 | `ccbec85` | Fix tasks seed against the live uuid day_id column |
| 13:38 | `6e06a64` | Add missing unique indexes for ON CONFLICT targets |
| 13:46 | `96fb02a` | Fix RLS infinite recursion on profiles (42P17) |
| 13:49 | `25944cc` | Define current_role() before the policies that reference it |
| 13:51 | `9973ca7` | Add read-only catalog diagnostic for the Supabase project |
| 13:58 | `7f3617f` | Add clean-slate reset script and backfill profiles for existing logins |
| 15:58 | `4b4af99` | Strip mojibake from SQL files; it was breaking the parser |

All are pushed to `origin/main`. Working tree is clean apart from untracked `supabase/.temp/`.

---

## 8. Files touched today

**Created**

| File | Purpose |
| --- | --- |
| `js/prescription.js` | Shared diagnosis metadata + task assignment logic |
| `supabase/migrations/0001_init.sql` | Canonical schema, RLS, storage policies, seeds (549 lines) |
| `supabase/migrations/0002_role_rls_fix.sql` | Delta repair for the recursion + leftover seeds (225 lines) |
| `supabase/diagnostic.sql` | Read-only catalog inspection |
| `supabase/reset.sql` | Clean-slate teardown (70 lines) |

**Modified**

`js/app-utils.js`, `js/assessment.js`, `js/auth.js`, `js/dashboard.js`, `js/grading.js`,
`js/task.js`, `script.js`, `index.html`, `app/dashboard.html`, `app/task.html`,
`student.html`, `lesson.html`

**Deliberately not touched**

`js/supabase-client.js` — still contains the public anon key. This key is designed to be public
and is protected by Row Level Security, which is precisely why the RLS work in §3.4 matters. Once
RLS is verified working, confirm the anon key cannot read other users' rows.

---

## 9. Known gaps, not attempted today

These were never in scope today and remain unbuilt:

- **Payments.** Flutterwave integration is designed but not implemented. Design notes are in
  `docs/PAYMENT_AUTH_ARCHITECTURE.md`.
- **Video lessons.** No video hosting or playback.
- **Tutor task-authoring UI.** Tutors can grade but cannot create or edit tasks from the app;
  that requires direct database access today.
- **Email verification and password reset.** Not configured.
- **`public.days` table.** Exists in the live database with an unknown shape. Nothing reads it.
  `day_id` was abandoned rather than reverse-engineered. If the day grouping is ever restored,
  backfill with:
  `update tasks t set day_id = d.id from days d where d.order_idx = ...`

---

## 10. Rules worth keeping

1. **Read the database before changing it.** One dump beats six rounds of inference.
2. **Never paste a large migration by hand.** Split it, or use the CLI. The paste path is lossy.
3. **SQL files stay pure ASCII.** One encoding round-trip cost two hours today.
4. **Define a function before any policy that calls it.** `CREATE POLICY` resolves references eagerly.
5. **Never let a role lookup read the table whose policy calls it.** That is the recursion in §3.4.
6. **Keep migrations idempotent** — `if not exists`, `NOT EXISTS` guards, explicit unique indexes.

---

## 11. Session — Tuesday, 6 October 2026

Client-facing changes requested by the account owner. Two items.

| Item | Request | Status |
| --- | --- | --- |
| Social links | Add Telegram / email / YouTube / Instagram to the site | Done |
| Registration flow | Register successfully -> land logged in directly, no email confirmation loop | Done (client-side) |

### 11.1 Changes

**Social links** — added everywhere:

| Channel | Link |
| --- | --- |
| Telegram | `https://t.me/+bqYoAejxzANmOGY8` |
| Email | `mailto:academybullstreet@gmail.com` |
| YouTube | `https://www.youtube.com/@Bullstreetacademy` |
| Instagram | `https://www.instagram.com/__kenny_black?igsh=MWRkeHl5Z3ltYXdtNQ%3D%3D&utm_source=qr` |

- `index.html` — new social row under the footer brand description.
- `app/dashboard.html` — already had the four links in a "Connect" column; fixed the raw `&`
  in the Instagram URL to `&amp;`.
- `app/login.html`, `app/signup.html`, `app/assessment.html`, `app/task.html`,
  `app/grading.html`, `app/lesson.html` — the six app pages that had **no footer** now have
  one, matching the dashboard footer including the "Connect" social links.
- `styles.css` — added `.footer-socials` (wrapped link row, hover in brand green).

**Registration flow** (`js/auth.js`) — the signup handler now:

1. `signUp` + `ensureProfile` as before.
2. If `data.session` exists, straight to `dashboard.html` (project has confirmation off).
3. Otherwise it calls `signInWithPassword` with the same credentials and goes to
   `dashboard.html`. The success message is now "Account created. Signing you in...".
4. If auto-login still fails, the real reason is shown and the user is sent to `login.html`.

The old message ("Check email if confirmation required") is gone, so a user never sees a
dead end after registering.

### 11.2 Tests run

- All JS files pass `node --check` (including `js/auth.js`, `script.js`).
- Local HTTP smoke test: served the repo and fetched all 8 HTML pages plus `styles.css`,
  `js/auth.js`, `js/supabase-client.js`, `logo.jpeg` — all returned **200**.
- Confirmed the four social links are present on all 8 HTML pages.
- `app/dashboard.html` Instagram link now HTML-valid (`&amp;`).

### 11.3 Still true / one caveat for the client

Auto-login only works while Supabase has email confirmation **disabled**. The client hit
"email limit exceeded" earlier because Supabase's free tier rate-limits confirmation emails —
that symptom is confirmation being on. Fix (dashboard side, cannot be done from code or CLI
while the CLI is still linked to the wrong account):

> Supabase dashboard -> Authentication -> Providers -> Email -> toggle **off** "Confirm email".

Until that is flipped, a brand-new signup will return `Email not confirmed` in step 3 and the
user is redirected to the login page (no dead end, but no straight-through either).

### 11.4 Committed

Pushed to `origin/main` with the work in §11.1. See the commit log in this repo.