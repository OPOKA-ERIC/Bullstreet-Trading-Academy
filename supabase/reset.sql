-- Bullstreet Academy - clean slate
-- Run this ONCE, then run migrations/0001_init.sql immediately after.
--
-- Why: the project currently has an unknown mix of half-applied migrations.
-- Patching further risks leaving two conflicting sets of policies/functions.
-- There is no production data to lose - only test accounts. Auth logins in
-- auth.users are NOT touched, and 0001 re-creates their profile rows.

-- ---------------------------------------------------------------------------
-- 1. Storage policies (depend on the tables below, drop them first)
-- ---------------------------------------------------------------------------
drop policy if exists "submissions_upload_own" on storage.objects;
drop policy if exists "submissions_read_own" on storage.objects;
drop policy if exists "user_uploads" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Functions
--    CASCADE also removes every policy that references them, which is the
--    cleanest way to clear the old recursive profiles policies.
-- ---------------------------------------------------------------------------
drop function if exists public.guard_profile_role() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_task_unlocked(uuid, uuid) cascade;
drop function if exists public.seed_user_task_assignments() cascade;

-- ---------------------------------------------------------------------------
-- 3. Auth trigger
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

-- ---------------------------------------------------------------------------
-- 4. Tables (CASCADE clears dependent policies, indexes and constraints)
-- ---------------------------------------------------------------------------
drop table if exists public.submission_rubric cascade;
drop table if exists public.verification_links cascade;
drop table if exists public.user_progress cascade;
drop table if exists public.task_variants cascade;
drop table if exists public.rubric_items cascade;
drop table if exists public.submissions cascade;
drop table if exists public.tasks cascade;
drop table if exists public.assessment_results cascade;
drop table if exists public.test_questions cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;

-- ---------------------------------------------------------------------------
-- 5. Anything the catalog still reports (catches tables I forgot to list)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('verification_links')
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Confirm the wipe
-- ---------------------------------------------------------------------------
select 'functions' as object_type, proname as name
from pg_proc where pronamespace = 'public'::regnamespace
union all
select 'table', tablename from pg_tables where schemaname = 'public'
order by 1, 2;