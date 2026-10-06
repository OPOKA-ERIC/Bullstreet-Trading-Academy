-- ============================================================================
-- Bullstreet Academy - 0003: test account housekeeping
-- Confirms bullstreets@gmail.com and promotes it to tutor in BOTH user_roles
-- and profiles. Runs as the postgres role via `supabase db push`, so auth.uid()
-- is null and the guard trigger does NOT sync user_roles - update it here.
-- Idempotent: no-ops if the account does not exist (e.g. recreated later).
-- ============================================================================

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'bullstreets@gmail.com';

update public.profiles set role = 'tutor'
where id = (select id from auth.users where email = 'bullstreets@gmail.com');

insert into public.user_roles (user_id, role)
select id, 'tutor' from auth.users where email = 'bullstreets@gmail.com'
on conflict (user_id) do update set role = excluded.role;