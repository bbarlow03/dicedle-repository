-- Run after usernames.sql (or the current schema.sql). All fixtures roll back.
begin;
insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
 ('dd000000-0000-4000-8000-000000000011', 'dicedle-name-a@example.invalid', now(), '{"username":"Dicedle_Sql_A_7391"}'),
 ('dd000000-0000-4000-8000-000000000012', 'dicedle-name-b@example.invalid', now(), '{}'),
 ('dd000000-0000-4000-8000-000000000013', 'dicedle-unconfirmed@example.invalid', null, '{}');
do $$
begin
  assert (select username from public.dicedle_profiles where user_id = 'dd000000-0000-4000-8000-000000000011') = 'Dicedle_Sql_A_7391', 'Signup trigger stores the username';
  begin
    insert into auth.users(id, email, raw_user_meta_data) values
      ('dd000000-0000-4000-8000-000000000014', 'dicedle-duplicate@example.invalid', '{"username":"dicedle_sql_a_7391"}');
    raise exception 'Expected duplicate signup name to be rejected';
  exception when unique_violation then null;
  end;
end $$;

set local role anon;
do $$
begin
  assert not public.dicedle_username_available('DICEDLE_SQL_A_7391'), 'Usernames are case-insensitive';
  assert public.dicedle_username_available('Dicedle_Sql_Free_7391'), 'Valid unused username is available';
  assert not public.dicedle_username_available('<script>'), 'Invalid username is unavailable';
  begin
    perform 1 from public.dicedle_profiles;
    raise exception 'Expected guest profile read to be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_dicedle_username('Dicedle_Sql_Free_7391');
    raise exception 'Expected guest name claim to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'dd000000-0000-4000-8000-000000000012';
do $$
begin
  assert (select count(*) from public.dicedle_profiles) = 0, 'Players cannot read someone else profile';
  assert public.set_dicedle_username('Dicedle_Sql_B_7391') = 'Dicedle_Sql_B_7391', 'Legacy account claims username';
  assert (select count(*) from public.dicedle_profiles) = 1, 'Player sees own profile';
  begin
    perform public.set_dicedle_username('dicedle_sql_a_7391');
    raise exception 'Expected duplicate name claim to be rejected';
  exception when unique_violation then null;
  end;
  begin
    perform public.set_dicedle_username('x');
    raise exception 'Expected invalid name to be rejected';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_dicedle_username('Dicedle_Sql_Free_7391', 'dd000000-0000-4000-8000-000000000011');
    raise exception 'Expected switched-account name claim to be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.dicedle_profiles set username = 'Injected';
    raise exception 'Expected direct profile writes to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claim.sub = 'dd000000-0000-4000-8000-000000000013';
do $$
begin
  begin
    perform public.set_dicedle_username('Dicedle_Sql_Free_7391');
    raise exception 'Expected unconfirmed account claim to be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
