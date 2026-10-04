-- Bullstreet Academy - canonical schema
-- Run this in Supabase SQL Editor (or `supabase db push`).
-- It is IDEMPOTENT: safe to run against the existing project without losing data.

-- ============================================================================
-- 0. Authorisation source of truth.
-- The role lookup MUST NOT live in `profiles`: the profiles policy calls
-- current_role(), so reading the role from profiles would re-enter that policy
-- and Postgres aborts with "infinite recursion detected in policy for relation
-- profiles" (42P17). user_roles has a plain `user_id = auth.uid()` policy and
-- nothing ever reads another user's role row, so no cycle can form.
-- profiles.role is kept in sync for the client; see the role-guard trigger.
-- ============================================================================
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null default 'student'
);

-- The function MUST exist before any policy references it.
create or replace function public.current_role()
returns text
language sql
stable
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

grant execute on function public.current_role() to authenticated, anon;

alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select using (user_id = auth.uid());

drop policy if exists user_roles_update_admin on public.user_roles;
create policy user_roles_update_admin on public.user_roles
  for update using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin on public.user_roles
  for insert with check (public.current_role() in ('tutor','admin'));

-- ============================================================================
-- 1. Tables
-- ============================================================================
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  role           text not null default 'student',
  diagnosis_code text,
  created_at     timestamptz not null default now()
);

create table if not exists public.test_questions (
  id              uuid primary key default gen_random_uuid(),
  scenario        text not null,
  option_a        text not null,
  option_b        text not null,
  tendency_a      text not null,
  tendency_b      text not null,
  time_limit_secs int  not null default 5,
  order_idx       int  not null default 0,
  is_active       boolean not null default true
);

create table if not exists public.assessment_results (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  results_json      jsonb,
  tendency_scores   jsonb,
  diagnosis_code    text,
  total_time_ms     int,
  click_speed_avg_ms int
);

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  summary        text,
  instructions   text,
  type           text not null default 'manual',      -- 'auto' | 'manual'
  input_type     text not null default 'text',       -- 'mcq' | 'text'
  options        jsonb,                              -- mcq options: ["A","B",...]
  correct_answer text,                               -- mcq: index of correct option as text
  diagnosis_code text,                               -- null = applies to every diagnosis
  day_id         int,                                -- legacy: uuid on older deployments, unused by the app
  day_label      text,                               -- display grouping, e.g. 'Day 1'
  sort_order     int  not null default 0,            -- global ordering across the whole path
  max_attempts   int  not null default 3,
  allow_retry    boolean not null default true,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.task_variants (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  variant_number int  not null,
  title          text,
  instructions   text,
  options        jsonb
);

create table if not exists public.rubric_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  order_idx   int  not null default 0,
  label       text not null,
  is_critical boolean not null default false
);

create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  task_id        uuid not null references public.tasks(id) on delete cascade,
  task_variant_id uuid references public.task_variants(id) on delete set null,
  attempt_number int  not null default 1,
  content_json   jsonb,
  files_json     jsonb,
  status         text not null default 'submitted',  -- submitted|in_review|passed|failed
  submitted_at   timestamptz not null default now(),
  graded_at      timestamptz,
  graded_by      uuid references auth.users(id) on delete set null,
  score          numeric,
  feedback       text
);

create table if not exists public.submission_rubric (
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  rubric_item_id uuid not null references public.rubric_items(id) on delete cascade,
  passed         boolean not null default false,
  primary key (submission_id, rubric_item_id)
);

create table if not exists public.user_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  day_id       int,
  status       text not null default 'locked',        -- locked|available|submitted|passed|failed
  unlocked_at  timestamptz,
  completed_at timestamptz,
  primary key (user_id, task_id)
);

create table if not exists public.verification_links (
  source_task_id       uuid not null references public.tasks(id) on delete cascade,
  verification_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (source_task_id)
);

-- ============================================================================
-- 2. Columns that may be missing on an older deployment
-- ============================================================================
alter table public.tasks              add column if not exists summary        text;
alter table public.tasks              add column if not exists options        jsonb;
alter table public.tasks              add column if not exists correct_answer text;
alter table public.tasks              add column if not exists diagnosis_code text;
alter table public.tasks              add column if not exists day_label      text;
alter table public.tasks              add column if not exists sort_order     int not null default 0;
alter table public.tasks              add column if not exists is_active      boolean not null default true;

-- day_id is uuid on the pre-existing deployment and is no longer read by the
-- app (day_label + sort_order drive ordering), so make it optional rather than
-- guessing its type. If you want to restore the link to public.days later,
-- backfill with: update tasks t set day_id = d.id from days d where d.order_idx = ...
alter table public.tasks              alter column day_id drop not null;
alter table public.user_progress      alter column day_id drop not null;

alter table public.task_variants      add column if not exists options        jsonb;
alter table public.profiles           add column if not exists diagnosis_code text;

-- Guarantees required by supabase-js `.upsert(..., { onConflict })`.
-- These tables pre-date this file, so their PRIMARY KEYs were never applied -
-- dedupe first, then add the unique indexes explicitly. Re-running is a no-op.
delete from public.user_progress a using public.user_progress b
  where a.ctid < b.ctid and a.user_id = b.user_id and a.task_id = b.task_id;
delete from public.submission_rubric a using public.submission_rubric b
  where a.ctid < b.ctid and a.submission_id = b.submission_id and a.rubric_item_id = b.rubric_item_id;
delete from public.verification_links a using public.verification_links b
  where a.ctid < b.ctid and a.source_task_id = b.source_task_id;

create unique index if not exists user_progress_user_task_key
  on public.user_progress (user_id, task_id);
create unique index if not exists submission_rubric_submission_item_key
  on public.submission_rubric (submission_id, rubric_item_id);
create unique index if not exists verification_links_source_key
  on public.verification_links (source_task_id);
create unique index if not exists task_variants_task_number_key
  on public.task_variants (task_id, variant_number);
create unique index if not exists profiles_id_key
  on public.profiles (id);

create index if not exists tasks_active_order_idx
  on public.tasks (is_active, sort_order);
create index if not exists submissions_user_task_idx
  on public.submissions (user_id, task_id, attempt_number desc);
create index if not exists submissions_status_idx
  on public.submissions (status, submitted_at);
create index if not exists assessment_results_user_idx
  on public.assessment_results (user_id, created_at desc);

-- ============================================================================
-- 3. Signup creates both rows; role changes are tutor-only and stay in sync
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A student must not be able to promote themselves by updating their own
-- profile row, so role changes are reverted unless the caller is a tutor.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null when this runs from the SQL editor (direct table access),
  -- so role management from the dashboard still works. Only requests coming
  -- through PostgREST are guarded, which is where self-escalation would happen.
  if auth.uid() is not null and new.role is distinct from old.role then
    if public.current_role() not in ('tutor','admin') then
      new.role := old.role;
    else
      insert into public.user_roles (user_id, role)
      values (new.id, new.role)
      on conflict (user_id) do update set role = excluded.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Existing users
insert into public.profiles (id, full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email)
from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select p.id, coalesce(nullif(p.role, ''), 'student')
from public.profiles p
on conflict (user_id) do update set role = excluded.role;

-- ============================================================================
-- 4. Row Level Security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.test_questions     enable row level security;
alter table public.assessment_results enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_variants      enable row level security;
alter table public.rubric_items       enable row level security;
alter table public.submissions        enable row level security;
alter table public.submission_rubric  enable row level security;
alter table public.user_progress      enable row level security;
alter table public.verification_links enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.current_role() in ('tutor','admin'));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- test_questions: readable by any signed-in user, writable by tutors
drop policy if exists test_questions_read on public.test_questions;
create policy test_questions_read on public.test_questions
  for select using (auth.role() = 'authenticated');

drop policy if exists test_questions_write on public.test_questions;
create policy test_questions_write on public.test_questions
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

-- assessment_results: own rows only
drop policy if exists assessment_results_own on public.assessment_results;
create policy assessment_results_own on public.assessment_results
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tasks / variants / rubrics: students read, tutors write
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks
  for select using (auth.role() = 'authenticated');

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

drop policy if exists task_variants_read on public.task_variants;
create policy task_variants_read on public.task_variants
  for select using (auth.role() = 'authenticated');

drop policy if exists task_variants_write on public.task_variants;
create policy task_variants_write on public.task_variants
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

drop policy if exists rubric_items_read on public.rubric_items;
create policy rubric_items_read on public.rubric_items
  for select using (auth.role() = 'authenticated');

drop policy if exists rubric_items_write on public.rubric_items;
create policy rubric_items_write on public.rubric_items
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

-- submissions: student sees own, tutor sees all; students may insert own
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (user_id = auth.uid() or public.current_role() in ('tutor','admin'));

drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions
  for insert with check (user_id = auth.uid());

drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions
  for update using (user_id = auth.uid() or public.current_role() in ('tutor','admin'))
  with check (user_id = auth.uid() or public.current_role() in ('tutor','admin'));

-- submission_rubric
drop policy if exists submission_rubric_select on public.submission_rubric;
create policy submission_rubric_select on public.submission_rubric
  for select using (
    exists (select 1 from public.submissions s
            where s.id = submission_id
              and (s.user_id = auth.uid() or public.current_role() in ('tutor','admin')))
  );

drop policy if exists submission_rubric_write on public.submission_rubric;
create policy submission_rubric_write on public.submission_rubric
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

-- user_progress
drop policy if exists user_progress_select on public.user_progress;
create policy user_progress_select on public.user_progress
  for select using (user_id = auth.uid() or public.current_role() in ('tutor','admin'));

drop policy if exists user_progress_write on public.user_progress;
create policy user_progress_write on public.user_progress
  for all using (user_id = auth.uid() or public.current_role() in ('tutor','admin'))
  with check (user_id = auth.uid() or public.current_role() in ('tutor','admin'));

-- verification_links
drop policy if exists verification_links_read on public.verification_links;
create policy verification_links_read on public.verification_links
  for select using (auth.role() = 'authenticated');

drop policy if exists verification_links_write on public.verification_links;
create policy verification_links_write on public.verification_links
  for all using (public.current_role() in ('tutor','admin'))
  with check (public.current_role() in ('tutor','admin'));

-- ============================================================================
-- 5. Private storage bucket for submissions
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

drop policy if exists submissions_upload_own on storage.objects;
create policy submissions_upload_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists submissions_read_own on storage.objects;
create policy submissions_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.current_role() in ('tutor','admin'))
  );

-- ============================================================================
-- 6. Seed - Impulse Test questions (skipped if already present)
-- ============================================================================
insert into public.test_questions (scenario, option_a, option_b, tendency_a, tendency_b, time_limit_secs, order_idx)
select * from (values
  ('You are down 2% on the day and the trade is approaching your stop. What do you do?',
   'RED: Move the stop further away to give it room','GREEN: Respect the stop and exit',
   'Revenge','Discipline',5,1),
  ('A setup you flagged 20 minutes ago has not triggered yet. Price is drifting away from your level.',
   'RED: Enter now before it disappears','GREEN: Wait for your level to trigger',
   'FOMO','Patience',5,2),
  ('You have three ideas for tomorrow. You start researching all of them in depth at 11pm.',
   'RED: Keep researching until you are certain','GREEN: Pick the cleanest A+ setup and stop',
   'Analysis_Paralysis','Discipline',5,3),
  ('You have taken 5 winners in a row this week. Your position size on trade 6 is:',
   'RED: Larger, you are clearly on a roll','GREEN: Same size, process not results',
   'Overconfidence','Discipline',5,4),
  ('It is 14:00. You have already taken 4 trades today, all small winners. Your rule cap is 3.',
   'RED: One more quick scalp before the close','GREEN: Stop, you are at your cap',
   'Overtrading','Discipline',5,5),
  ('The candle you are watching is moving fast. Your finger is already on the button.',
   'RED: Enter immediately, do not overthink','GREEN: Wait for the close to confirm',
   'Fear_Of_Missing/Impatience','Patience',4,6),
  ('You are up 4% on the day. Do you take profit?',
   'RED: Hold for more, the trend is strong','GREEN: Take partial profit and protect the gain',
   'Overconfidence','Discipline',5,7),
  ('Two red candles print in one minute. Your instinct is to jump in and "catch the bounce".',
   'RED: Buy the bounce immediately','GREEN: Wait for structure to confirm the reversal',
   'Fear_Of_Missing/Impatience','Patience',4,8),
  ('You review a losing trade and realise you broke your own entry rule.',
   'RED: Accept the loss and move on','GREEN: Journal it and name the exact rule you broke',
   'Action','Discipline',5,9),
  ('Nothing interesting has printed for two hours. The chart is flat.',
   'RED: Force a trade to avoid boredom','GREEN: No setup, no trade - sit out',
   'Overtrading','Discipline',6,10)
) as v(scenario, option_a, option_b, tendency_a, tendency_b, time_limit_secs, order_idx)
where not exists (select 1 from public.test_questions limit 1);

-- ============================================================================
-- 7. Seed - Rehab tasks (skipped per-title, so re-running is safe)
-- ============================================================================
insert into public.tasks (title, summary, instructions, type, input_type, diagnosis_code, day_label, sort_order, max_attempts)
select * from (values
  ('Day 1 - Pre-Trade Routine',
   'Write the 5-step routine you will run before every entry.',
   'Before you place a single order tomorrow, write your pre-trade routine as exactly 5 numbered steps. Each step must be an observable action (not a feeling). Then explain in 3 sentences what happens to you when you skip step 1.',
   'manual','text', null, 'Day 1', 10, 3),

  ('Day 2 - Position Sizing From Your Account',
   'Calculate risk per trade from a fixed account size.',
   'You have a $1,000 account and you decide to risk 1% per trade ($10). A setup gives you a 20 pip stop on GBP/USD. (a) What is your position size in lots? (b) If the same setup has a 40 pip stop, what changes and why? (c) Write the one sentence you will say to yourself when you feel like doubling the size.',
   'manual','text', null, 'Day 2', 20, 3),

  ('Day 3 - Journal Audit: Your Last 20 Trades',
   'Find the single pattern that cost you the most.',
   'Pull your last 20 trades. (a) How many violated your entry rule? (b) How many moved a stop? (c) Of your losses, what percentage came from trades that broke a rule versus trades that followed one? (d) State the single most expensive pattern in one sentence.',
   'manual','text', null, 'Day 3', 30, 3),

  ('Revenge Path 1 - The 24-Hour Cooling Rule',
   'Convert your impulse response into a written protocol.',
   'You have just closed a losing trade and your next instinct is to immediately re-enter to "get it back". Write your cooling-off protocol: the exact rule, the exact duration, and what you are allowed to do during that window. Then describe the physical sensation you get when you want to override it.',
   'manual','text', 'Revenge', 'Day 4 - Your Path', 40, 3),

  ('FOMO Path 1 - Confirmation Before Entry',
   'Define what "confirmation" means for your setups.',
   'FOMO enters late. For each of your three main setups, write the specific confirmation signal you will wait for before entry (not "a candle" - the exact condition). Then explain how you will feel when price runs away without you, and what you will do instead.',
   'manual','text', 'FOMO', 'Day 4 - Your Path', 50, 3),

  ('Overtrading Path 1 - The Daily Cap',
   'Set and justify a hard trade limit.',
   'Choose your maximum number of trades per day. (a) State the number and the evidence for it. (b) Write the exact rule you follow when you hit the cap but still see a setup. (c) Describe the boredom or restlessness you feel at the cap and how you will work with it rather than trade through it.',
   'manual','text', 'Overtrading', 'Day 4 - Your Path', 60, 3),

  ('Overconfidence Path 1 - Downsize After Wins',
   'Build a rule that punishes your own streak.',
   'Your wins are inflating your size. (a) Write the rule that forces you to reduce size after 2 consecutive winners. (b) Explain why reducing after wins protects your account. (c) State what you will tell yourself when the urge to size up appears.',
   'manual','text', 'Overconfidence', 'Day 4 - Your Path', 70, 3),

  ('Analysis Paralysis Path 1 - The 15-Minute Decision Box',
   'Impose a hard ceiling on analysis time.',
   'You research past the point of decision. (a) Set a maximum analysis time per setup. (b) Write the exact question your analysis must answer to justify entry. (c) Describe what you will do when the timer expires without an answer.',
   'manual','text', 'Analysis_Paralysis', 'Day 4 - Your Path', 80, 3),

  ('Impatience Path 1 - Entry Trigger Discipline',
   'Replace impulse entries with trigger-based entries.',
   'You rush entries. For each of your three main setups, write the exact price or condition that triggers entry - something that cannot fire early. Then describe your physical urge to "get in before it moves" and the exact phrase you will use to talk yourself out of it.',
   'manual','text', 'Fear_Of_Missing/Impatience', 'Day 4 - Your Path', 90, 3),

  ('Patience Path 1 - Profit-Taking Rules',
   'Convert holding behaviour into a rule.',
   'You wait well but over-hold. (a) Write the exact condition that takes partial profit. (b) Write the condition that moves your stop to breakeven. (c) Explain what losing an unrealised gain feels like and how you will accept it.',
   'manual','text', 'Patience', 'Day 4 - Your Path', 100, 3),

  ('Decisive Path 1 - Validate Before You Act',
   'Keep the speed, add the check.',
   'You act fast but skip confirmation. (a) Write the one validation check you will never skip. (b) Explain what speed has cost you. (c) Write the rule that tells you when "fast" has become "careless".',
   'manual','text', 'Action', 'Day 4 - Your Path', 110, 3),

  ('Disciplined Path 1 - Stretch the Edge',
   'Raise the bar without raising the risk.',
   'Your baseline is solid. (a) Identify the setup you take most often and write how you could raise its win rate by 10%. (b) State one habit you will add to make your current edge repeatable under pressure. (c) Describe how you will know if you have broken your own discipline.',
   'manual','text', 'Discipline', 'Day 4 - Your Path', 120, 3)
) as v(title, summary, instructions, type, input_type, diagnosis_code, day_label, sort_order, max_attempts)
where not exists (select 1 from public.tasks limit 1);

-- Rubric for the universal Day 1 task
insert into public.rubric_items (task_id, order_idx, label, is_critical)
select t.id, v.order_idx, v.label, v.is_critical
from public.tasks t
join (values
  (1, 'Lists exactly 5 numbered, observable steps', true),
  (2, 'Every step is an action, not a feeling or intention', true),
  (3, 'Identifies what happens when step 1 is skipped', false),
  (4, 'Written in the trader''s own words and specific to their routine', false)
) as v(order_idx, label, is_critical) on true
where t.title = 'Day 1 - Pre-Trade Routine'
  and not exists (select 1 from public.rubric_items where task_id = t.id);

-- Verification: passing Day 1 unlocks Day 2
insert into public.verification_links (source_task_id, verification_task_id)
select s.id, v.id
from public.tasks s, public.tasks v
where s.title = 'Day 1 - Pre-Trade Routine'
  and v.title = 'Day 2 - Position Sizing From Your Account'
  and not exists (
    select 1 from public.verification_links vl where vl.source_task_id = s.id
  );

-- Alternate retry formats
insert into public.task_variants (task_id, variant_number, title, instructions)
select t.id, 1, 'Day 1 - Pre-Trade Routine (Format B)',
  'Describe your pre-trade routine as a single paragraph as if briefing a new trader. No lists. Then state in one sentence the single step of the original five that you most often skip, and why.'
from public.tasks t
where t.title = 'Day 1 - Pre-Trade Routine'
  and not exists (select 1 from public.task_variants where task_id = t.id and variant_number = 1);