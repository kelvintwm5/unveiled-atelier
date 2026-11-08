-- Checks for the client_reminders table and activity_notes column in 0008. Not a
-- migration: run it by hand in the Supabase SQL editor after applying 0008, or
-- whenever they change.
--
-- Everything happens inside one transaction that is rolled back at the end, so it
-- leaves no rows behind. A failed check stops the script with an error that says
-- which one. Success ends with one result row, "Client reminder checks passed".
-- The SQL editor's admin role skips RLS, so access is checked by confirming that
-- RLS is on and the policy exists, not by acting as a browser.

begin;

do $$
declare
  v_client uuid;
  v_ok     boolean;
begin
  insert into clients (name, activity_notes)
    values ('Check client', 'Called about lace')
    returning id into v_client;

  if (select activity_notes from clients where id = v_client) <> 'Called about lace' then
    raise exception 'activity_notes did not save';
  end if;

  insert into client_reminders (client_id, remind_on, note)
    values (v_client, date '2026-12-01', 'Follow up');

  -- A blank note would send an empty line in the morning digest.
  begin
    insert into client_reminders (client_id, remind_on, note) values (v_client, date '2026-12-01', '   ');
    raise exception 'blank note was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into client_reminders (client_id, remind_on, note) values (v_client, null, 'No date');
    raise exception 'missing date was accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into client_reminders (client_id, remind_on, note)
      values (gen_random_uuid(), date '2026-12-01', 'No such client');
    raise exception 'unknown client was accepted';
  exception when foreign_key_violation then null;
  end;

  -- The app hides clients through archived_at. A real delete must stay blocked.
  begin
    delete from clients where id = v_client;
    raise exception 'client with a reminder was deleted';
  exception when foreign_key_violation then null;
  end;

  select relrowsecurity into v_ok from pg_class where oid = 'public.client_reminders'::regclass;
  if not v_ok then
    raise exception 'RLS is off on client_reminders';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'client_reminders'
      and policyname = 'owners_all_client_reminders'
      and qual like '%is_app_owner%'
      and with_check like '%is_app_owner%'
  ) then
    raise exception 'owner policy is missing on client_reminders';
  end if;
end;
$$;

select 'Client reminder checks passed' as result;

rollback;
