-- Run after schema.sql as the SQL Editor's postgres role. Fixtures roll back.
begin;
insert into auth.users(id, email) values
  ('dd000000-0000-4000-8000-000000000001', 'dicedle-check-a@example.invalid'),
  ('dd000000-0000-4000-8000-000000000002', 'dicedle-check-b@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = 'dd000000-0000-4000-8000-000000000001';
do $$
declare saved jsonb;
begin
  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3]]'::jsonb));
  assert saved->'record'->>'score' = '5', 'Safe roll score';
  assert (select count(*) from public.dicedle_runs) = 1, 'Player sees own row';

  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[6,6]]'::jsonb));
  assert saved->'record'->>'score' = '5', 'Stale conflicting device cannot replace saved roll';

  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3],[6,6]]'::jsonb), null, true);
  assert saved->'record'->>'score' = '5', 'Guest import cannot replace existing account run';

  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3],[3,4]]'::jsonb));
  assert saved->'record'->>'score' = '12', 'Busting seven is added';
  assert saved->'record'->>'outcome' = 'busted', 'Busting run finalized';
  assert saved->'record'->>'rollCount' = '2', 'Busting roll counted';

  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3],[6,6],[6,6]]'::jsonb));
  assert saved->'record'->>'score' = '12', 'Bust is immutable';
  begin
    perform public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[3,4],[2,3]]'::jsonb));
    raise exception 'Expected post-bust dice to be rejected';
  exception when raise_exception then
    if sqlerrm = 'Expected post-bust dice to be rejected' then raise; end if;
  end;
  begin
    perform public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[0,9]]'::jsonb));
    raise exception 'Expected invalid dice to be rejected';
  exception when raise_exception then
    if sqlerrm = 'Expected invalid dice to be rejected' then raise; end if;
  end;
  begin
    update public.dicedle_runs set run = null;
    raise exception 'Expected direct writes to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claim.sub = 'dd000000-0000-4000-8000-000000000002';
do $$
declare saved jsonb;
begin
  assert (select count(*) from public.dicedle_runs) = 0, 'Other players cannot read first player';
  begin
    perform public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3]]'::jsonb), null, false, 'dd000000-0000-4000-8000-000000000001');
    raise exception 'Expected changed account identity to be rejected';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.dicedle_runs) = 0, 'Changed session cannot save a previous account request';
  saved := public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[6,6]]'::jsonb));
  assert saved->'record'->>'score' = '12', 'Second player saves independently';
  assert (select count(*) from public.dicedle_runs) = 1, 'Second player sees only own row';
end $$;

set local request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3]]'::jsonb));
    raise exception 'Expected sessionless save to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.dicedle_runs;
    raise exception 'Expected guest read to be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_dicedle_run(current_date, jsonb_build_object('date', current_date::text, 'rolls', '[[2,3]]'::jsonb));
    raise exception 'Expected guest save to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
