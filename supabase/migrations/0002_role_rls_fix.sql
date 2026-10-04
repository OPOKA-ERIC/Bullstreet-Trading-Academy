-- Bullstreet Academy - 0002: break the RLS recursion on `profiles`
--
-- WHY: public.current_role() did `select role from profiles ...`, while the
-- profiles policy itself called public.current_role(). Postgres rejects that as
-- "infinite recursion detected in policy for relation profiles" (42P17), which
-- broke every authenticated query - signup, dashboard, assessment, grading.
--
-- FIX: give the role lookup its own table (user_roles) whose policy is a plain
-- `user_id = auth.uid()` with no call back into a role function. Nothing reads
-- anybody else's role row, so there is no cycle to form.
--
-- Idempotent: safe to run on a partially-applied 0001.

-- ============================================================================
-- 1. user_roles - the RLS source of truth for authorisation
-- ============================================================================
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null default 'student'
);

-- ============================================================================
-- 2. current_role() reads user_roles (no policy cycle).
--    MUST be defined before any policy that references it.
-- ============================================================================
create or replace function public.current_role()
returns text
language sql
stable
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

grant execute on function public.current_role() to authenticated, anon;

-- ============================================================================
-- 3. RLS on user_roles - plain own-row policy, no role function, so no cycle
-- ============================================================================
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
-- 3. profiles.role stays in sync so the client (app-utils.js, dashboard.js)
--    can still read it, but a student can no longer promote themselves.
-- ============================================================================
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
      new.role := old.role;                       -- ignore self-escalation
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

-- ============================================================================
-- 4. Signup creates both rows
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

-- ============================================================================
-- 5. Backfill existing users
-- ============================================================================
insert into public.user_roles (user_id, role)
select p.id, coalesce(nullif(p.role, ''), 'student')
from public.profiles p
on conflict (user_id) do update set role = excluded.role;

-- ============================================================================
-- 6. Recreate the policies that reference current_role(), now that it is safe
-- ============================================================================
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.current_role() in ('tutor','admin'));

-- ============================================================================
-- 7. Finish the seeds that 0001 never reached
-- ============================================================================

-- Verification: passing Day 1 unlocks Day 2
insert into public.verification_links (source_task_id, verification_task_id)
select s.id, v.id
from public.tasks s, public.tasks v
where s.title = 'Day 1 - Pre-Trade Routine'
  and v.title = 'Day 2 - Position Sizing From Your Account'
  and not exists (
    select 1 from public.verification_links vl where vl.source_task_id = s.id
  );

-- Alternate retry format for Day 1
insert into public.task_variants (task_id, variant_number, title, instructions)
select t.id, 1, 'Day 1 - Pre-Trade Routine (Format B)',
  'Describe your pre-trade routine as a single paragraph as if briefing a new trader. No lists. Then state in one sentence the single step of the original five that you most often skip, and why.'
from public.tasks t
where t.title = 'Day 1 - Pre-Trade Routine'
  and not exists (
    select 1 from public.task_variants v
    where v.task_id = t.id and v.variant_number = 1
  );

-- Rubric for Day 1 (in case 0001 aborted before it)
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

-- Tasks seed (in case 0001 aborted here)
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