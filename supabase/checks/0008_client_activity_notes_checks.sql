-- Checks for the activity_notes column in 0008 and for how "deleting" a client
-- works. Not a migration: run it by hand in the Supabase SQL editor after applying
-- 0008, or whenever they change.
--
-- Everything happens inside one transaction that is rolled back at the end, so it
-- leaves no rows behind. A failed check stops the script with an error that says
-- which one. Success ends with one result row, "Client profile checks passed".

begin;

do $$
declare
  v_client uuid;
begin
  insert into clients (name, activity_notes)
    values ('Check client', 'Called about lace')
    returning id into v_client;

  if (select activity_notes from clients where id = v_client) <> 'Called about lace' then
    raise exception 'activity_notes did not save';
  end if;

  update clients set activity_notes = null where id = v_client;
  if (select activity_notes from clients where id = v_client) is not null then
    raise exception 'activity_notes could not be cleared';
  end if;

  -- The app hides clients through archived_at. A client with history must not be
  -- erasable by accident.
  insert into activities (client_id, notes) values (v_client, 'First call');
  begin
    delete from clients where id = v_client;
    raise exception 'client with activity was deleted';
  exception when foreign_key_violation then null;
  end;

  update clients set archived_at = now() where id = v_client;
  if not exists (select 1 from clients where id = v_client and archived_at is not null) then
    raise exception 'client could not be hidden';
  end if;
end;
$$;

select 'Client profile checks passed' as result;

rollback;
