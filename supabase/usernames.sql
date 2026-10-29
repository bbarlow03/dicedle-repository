-- Run this migration once in Supabase's SQL Editor for an existing Dicedle project.
-- It can also be re-run safely. Scores and existing Auth users are preserved.
begin;

create table if not exists public.dicedle_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  updated_at timestamptz not null default now()
);
create unique index if not exists dicedle_profiles_username_key
  on public.dicedle_profiles (lower(username));
alter table public.dicedle_profiles enable row level security;
revoke all on table public.dicedle_profiles from anon, authenticated;
grant select on table public.dicedle_profiles to authenticated;
drop policy if exists "Players read their own username" on public.dicedle_profiles;
create policy "Players read their own username" on public.dicedle_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.dicedle_username_available(p_username text)
returns boolean language sql security definer set search_path = '' stable
as $$
  select coalesce(p_username ~ '^[A-Za-z0-9_]{3,24}$', false)
    and not exists (select 1 from public.dicedle_profiles where lower(username) = lower(p_username));
$$;
revoke all on function public.dicedle_username_available(text) from public;
grant execute on function public.dicedle_username_available(text) to anon, authenticated;

create or replace function public.dicedle_create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare chosen text := btrim(new.raw_user_meta_data->>'username');
begin
  -- Existing email-link accounts can choose their username after signing in.
  if chosen is not null then
    insert into public.dicedle_profiles(user_id, username) values (new.id, chosen);
  end if;
  return new;
end;
$$;
revoke all on function public.dicedle_create_profile() from public, anon, authenticated;
drop trigger if exists dicedle_user_created on auth.users;
create trigger dicedle_user_created after insert on auth.users
  for each row execute function public.dicedle_create_profile();

create or replace function public.set_dicedle_username(p_username text, p_expected_user uuid default auth.uid())
returns text language plpgsql security definer set search_path = ''
as $$
declare player uuid := auth.uid(); chosen text := btrim(p_username);
begin
  if player is null or player is distinct from p_expected_user then
    raise exception 'Sign in to update your username' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = player and email_confirmed_at is not null) then
    raise exception 'Confirm your email first' using errcode = '42501';
  end if;
  if chosen is null or chosen !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Use 3-24 letters, numbers, or underscores' using errcode = '22023';
  end if;
  insert into public.dicedle_profiles(user_id, username) values (player, chosen)
    on conflict (user_id) do update set username = excluded.username, updated_at = now();
  return chosen;
end;
$$;
revoke all on function public.set_dicedle_username(text, uuid) from public, anon;
grant execute on function public.set_dicedle_username(text, uuid) to authenticated;
commit;
