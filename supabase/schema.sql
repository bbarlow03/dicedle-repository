-- Run once in the Supabase SQL Editor. Re-running this file is safe.
begin;

create table if not exists public.dicedle_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  run jsonb,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, run_date)
);

alter table public.dicedle_runs enable row level security;
revoke all on table public.dicedle_runs from anon, authenticated;
grant select on table public.dicedle_runs to authenticated;
drop policy if exists "Players read their own runs" on public.dicedle_runs;
create policy "Players read their own runs" on public.dicedle_runs
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes go through this function. Identity comes from the verified session,
-- never from a user_id supplied by the browser. A row lock serializes devices.
create or replace function public.dicedle_scoring_version()
returns integer language sql stable set search_path = ''
as $$ select 2; $$;
revoke all on function public.dicedle_scoring_version() from public, anon;
grant execute on function public.dicedle_scoring_version() to authenticated;

create or replace function public.save_dicedle_run(
  p_day date, p_run jsonb default null, p_record jsonb default null,
  p_import boolean default false, p_expected_user uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  player uuid := auth.uid();
  saved public.dicedle_runs%rowtype;
  incoming jsonb;
  dice jsonb;
  total numeric := 0;
  count_rolls integer;
  roll_sum integer;
  index_roll integer := 0;
  scoring_index integer := 0;
  bonus_multiplier numeric := 1;
  bonus_start integer := 0;
  scoring_version integer := 1;
  previous_double boolean := false;
  ended boolean := false;
begin
  if player is null then raise exception 'Sign in to save a run' using errcode = '42501'; end if;
  if player is distinct from p_expected_user then raise exception 'Account changed' using errcode = '42501'; end if;
  if p_day is null or p_day > current_date + 1 then raise exception 'Invalid run date'; end if;

  if p_run is not null then
    if jsonb_typeof(p_run) <> 'object' or p_run->>'date' is distinct from p_day::text
      or jsonb_typeof(p_run->'rolls') is distinct from 'array' then
      raise exception 'Invalid run';
    end if;
    count_rolls := jsonb_array_length(p_run->'rolls');
    if count_rolls < 1 or count_rolls > 10000 then raise exception 'Invalid number of rolls'; end if;
    if p_run ? 'scoringVersion' then
      if jsonb_typeof(p_run->'scoringVersion') <> 'number' or p_run->>'scoringVersion' not in ('1', '2') then
        raise exception 'Invalid scoring version';
      end if;
      scoring_version := (p_run->>'scoringVersion')::integer;
    end if;
    if scoring_version = 2 then
      if jsonb_typeof(p_run->'bonusStart') is distinct from 'number'
        or coalesce(p_run->>'bonusStart', '') !~ '^[0-9]{1,5}$' then raise exception 'Invalid bonus start'; end if;
      bonus_start := (p_run->>'bonusStart')::integer;
      if bonus_start > count_rolls then raise exception 'Invalid bonus start'; end if;
    elsif p_run ? 'bonusStart' then
      raise exception 'Unexpected bonus start';
    end if;

    for dice in select value from jsonb_array_elements(p_run->'rolls') loop
      if jsonb_typeof(dice) <> 'array' then raise exception 'Invalid dice'; end if;
      if jsonb_array_length(dice) <> 2 or (dice->>0) !~ '^[1-6]$' or (dice->>1) !~ '^[1-6]$'
        or jsonb_typeof(dice->0) <> 'number' or jsonb_typeof(dice->1) <> 'number' then raise exception 'Invalid dice'; end if;
      if ended then raise exception 'A run cannot continue after seven'; end if;
      roll_sum := (dice->>0)::integer + (dice->>1)::integer;
      if scoring_version = 2 and scoring_index >= bonus_start then
        -- Only the last legacy double arms the first roll under the new rules.
        if scoring_index = bonus_start and previous_double then bonus_multiplier := 2; end if;
        total := total + roll_sum * bonus_multiplier;
        bonus_multiplier := case when (dice->>0) = (dice->>1) then bonus_multiplier * 2 else 1 end;
      else
        total := total + roll_sum;
      end if;
      if total > 9007199254740991 then raise exception 'Score outside supported range'; end if;
      previous_double := (dice->>0) = (dice->>1);
      ended := roll_sum = 7;
      scoring_index := scoring_index + 1;
    end loop;
    incoming := jsonb_build_object('version', 1, 'id', p_day::text, 'mode', 'daily',
      'date', p_day::text, 'score', total, 'rollCount', count_rolls,
      'outcome', case when ended then 'busted' when p_day < current_date - 1 then 'day-ended' else 'in-progress' end,
      'recordedAt', floor(extract(epoch from clock_timestamp()) * 1000));
    if scoring_version = 2 then
      incoming := incoming || jsonb_build_object('scoringVersion', 2, 'bonusStart', bonus_start);
    end if;
  else
    -- Imported history keeps its original rules and totals.
    if jsonb_typeof(p_record) is distinct from 'object'
      or p_record->>'date' is distinct from p_day::text or p_record->>'id' is distinct from p_day::text
      or p_record->>'mode' is distinct from 'daily' or p_record->>'version' is distinct from '1'
      or coalesce(p_record->>'outcome', '') not in ('busted', 'day-ended')
      or jsonb_typeof(p_record->'version') is distinct from 'number'
      or jsonb_typeof(p_record->'score') is distinct from 'number'
      or jsonb_typeof(p_record->'rollCount') is distinct from 'number'
      or coalesce(p_record->>'rollCount', '') !~ '^[1-9][0-9]{0,4}$'
      or coalesce(p_record->>'score', '') !~ '^[0-9]{1,16}$' then raise exception 'Invalid historical record'; end if;
    count_rolls := (p_record->>'rollCount')::integer;
    if count_rolls > 10000 then raise exception 'Invalid historical record'; end if;
    if p_record ? 'scoringVersion' then
      if jsonb_typeof(p_record->'scoringVersion') <> 'number' or p_record->>'scoringVersion' not in ('1', '2') then
        raise exception 'Invalid scoring version';
      end if;
      scoring_version := (p_record->>'scoringVersion')::integer;
    end if;
    if scoring_version = 2 then
      if jsonb_typeof(p_record->'bonusStart') is distinct from 'number'
        or coalesce(p_record->>'bonusStart', '') !~ '^[0-9]{1,5}$' then raise exception 'Invalid bonus start'; end if;
      bonus_start := (p_record->>'bonusStart')::integer;
      if bonus_start > count_rolls then raise exception 'Invalid bonus start'; end if;
    elsif p_record ? 'bonusStart' then raise exception 'Unexpected bonus start';
    end if;
    if (p_record->>'score')::numeric < count_rolls * 2
      or (p_record->>'score')::numeric > (case when scoring_version = 2 then 9007199254740991 else count_rolls * 12 end) then
      raise exception 'Invalid historical score';
    end if;
    incoming := p_record || jsonb_build_object('recordedAt', floor(extract(epoch from clock_timestamp()) * 1000));
  end if;

  insert into public.dicedle_runs(user_id, run_date, run, record)
    values (player, p_day, p_run, incoming) on conflict do nothing;
  select * into saved from public.dicedle_runs
    where user_id = player and run_date = p_day for update;

  if not p_import and saved.run is not null and saved.record->>'outcome' = 'in-progress'
    and p_run is not null and jsonb_array_length(p_run->'rolls') > jsonb_array_length(saved.run->'rolls') then
    for index_roll in 0..jsonb_array_length(saved.run->'rolls') - 1 loop
      if (saved.run->'rolls'->index_roll) is distinct from (p_run->'rolls'->index_roll) then
        return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
      end if;
    end loop;
    -- A stale client cannot remove bonuses or rewrite their activation boundary.
    if saved.run->>'scoringVersion' = '2' then
      if scoring_version <> 2 or (saved.run->>'bonusStart')::integer <> bonus_start then
        return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
      end if;
    elsif scoring_version = 2 and bonus_start <> jsonb_array_length(saved.run->'rolls') then
      return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
    end if;
    update public.dicedle_runs set run = p_run, record = incoming, updated_at = now()
      where user_id = player and run_date = p_day returning * into saved;
  end if;
  return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
end;
$$;
revoke all on function public.save_dicedle_run(date, jsonb, jsonb, boolean, uuid) from public, anon;
grant execute on function public.save_dicedle_run(date, jsonb, jsonb, boolean, uuid) to authenticated;
commit;

-- Username setup. Keep this section aligned with usernames.sql, which upgrades
-- existing projects without requiring any changes to saved runs.
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
