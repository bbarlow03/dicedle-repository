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
  total integer := 0;
  count_rolls integer;
  roll_sum integer;
  index_roll integer := 0;
  ended boolean := false;
begin
  if player is null then raise exception 'Sign in to save a run' using errcode = '42501'; end if;
  -- Prevent an in-flight request from saving to a newly switched SDK session.
  if player is distinct from p_expected_user then raise exception 'Account changed' using errcode = '42501'; end if;
  if p_day is null or p_day > current_date + 1 then raise exception 'Invalid run date'; end if;

  if p_run is not null then
    if jsonb_typeof(p_run) <> 'object' or p_run->>'date' is distinct from p_day::text
      or jsonb_typeof(p_run->'rolls') is distinct from 'array' then
      raise exception 'Invalid run';
    end if;
    count_rolls := jsonb_array_length(p_run->'rolls');
    if count_rolls < 1 or count_rolls > 10000 then raise exception 'Invalid number of rolls'; end if;
    for dice in select value from jsonb_array_elements(p_run->'rolls') loop
      if jsonb_typeof(dice) <> 'array' then raise exception 'Invalid dice'; end if;
      if jsonb_array_length(dice) <> 2 or (dice->>0) !~ '^[1-6]$' or (dice->>1) !~ '^[1-6]$'
        or jsonb_typeof(dice->0) <> 'number' or jsonb_typeof(dice->1) <> 'number' then
        raise exception 'Invalid dice';
      end if;
      if ended then raise exception 'A run cannot continue after seven'; end if;
      roll_sum := (dice->>0)::integer + (dice->>1)::integer;
      total := total + roll_sum;
      ended := roll_sum = 7;
    end loop;
    incoming := jsonb_build_object('version', 1, 'id', p_day::text, 'mode', 'daily',
      'date', p_day::text, 'score', total, 'rollCount', count_rolls,
      'outcome', case when ended then 'busted' when p_day < current_date - 1 then 'day-ended' else 'in-progress' end,
      'recordedAt', floor(extract(epoch from clock_timestamp()) * 1000));
  else
    -- Historical guest records predate accounts and have totals, not raw dice.
    -- Preserve those records on explicit import, without treating them as rolls.
    if jsonb_typeof(p_record) is distinct from 'object'
      or p_record->>'date' is distinct from p_day::text
      or p_record->>'id' is distinct from p_day::text
      or p_record->>'mode' is distinct from 'daily'
      or p_record->>'version' is distinct from '1'
      or coalesce(p_record->>'outcome', '') not in ('busted', 'day-ended')
      or jsonb_typeof(p_record->'version') is distinct from 'number'
      or jsonb_typeof(p_record->'score') is distinct from 'number'
      or jsonb_typeof(p_record->'rollCount') is distinct from 'number'
      or coalesce(p_record->>'rollCount', '') !~ '^[1-9][0-9]{0,4}$'
      or (p_record->>'rollCount')::integer > 10000
      or coalesce(p_record->>'score', '') !~ '^[0-9]{1,6}$'
      or (p_record->>'score')::integer < (p_record->>'rollCount')::integer * 2
      or (p_record->>'score')::integer > (p_record->>'rollCount')::integer * 12 then
      raise exception 'Invalid historical record';
    end if;
    incoming := p_record || jsonb_build_object('recordedAt', floor(extract(epoch from clock_timestamp()) * 1000));
  end if;

  insert into public.dicedle_runs(user_id, run_date, run, record)
    values (player, p_day, p_run, incoming) on conflict do nothing;
  select * into saved from public.dicedle_runs
    where user_id = player and run_date = p_day for update;

  -- An existing finalized run or imported summary is immutable. Longer runs
  -- may extend only the exact saved dice prefix; conflicting devices get it back.
  if not p_import and saved.run is not null and saved.record->>'outcome' = 'in-progress'
    and p_run is not null and jsonb_array_length(p_run->'rolls') > jsonb_array_length(saved.run->'rolls') then
    for index_roll in 0..jsonb_array_length(saved.run->'rolls') - 1 loop
      if (saved.run->'rolls'->index_roll) is distinct from (p_run->'rolls'->index_roll) then
        return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
      end if;
    end loop;
    update public.dicedle_runs set run = p_run, record = incoming, updated_at = now()
      where user_id = player and run_date = p_day returning * into saved;
  end if;
  return jsonb_build_object('run_date', saved.run_date, 'run', saved.run, 'record', saved.record);
end;
$$;

revoke all on function public.save_dicedle_run(date, jsonb, jsonb, boolean, uuid) from public, anon;
grant execute on function public.save_dicedle_run(date, jsonb, jsonb, boolean, uuid) to authenticated;
commit;
