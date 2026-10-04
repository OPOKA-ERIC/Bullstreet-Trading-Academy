-- Bullstreet Academy - state diagnostic
-- Run each numbered statement separately in the Supabase SQL Editor.
-- Every one of these reads only the catalog; none of them change anything.

-- 1. Which helper functions actually exist?
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('current_role', 'handle_new_user', 'guard_profile_role');

-- 2. Which tables exist?
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;

-- 3. Which tables have RLS switched on?
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 4. Which policies exist?
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. What type is tasks.day_id?
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tasks'
  and column_name = 'day_id';

-- 6. How many rows did the seeds create?
select count(*) as test_questions from public.test_questions;
select count(*) as tasks from public.tasks;
select count(*) as profiles from public.profiles;
select count(*) as user_roles from public.user_roles;