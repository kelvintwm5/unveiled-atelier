-- Checks for transaction attachments in 0010. Not a migration: run it by hand in
-- the Supabase SQL editor after applying 0010.
--
-- Everything happens inside one transaction that is rolled back at the end, so it
-- leaves no rows behind. A failed check stops the script with an error that says
-- which one; success ends with the notice "Transaction attachment checks passed".

begin;

do $$
declare
  b storage.buckets;
  n int;
begin
  -- The two columns are all-or-nothing.
  begin
    insert into transactions (type, description, amount, attachment_path)
    values ('Income', 'Check: path without a name', 1, 'check.jpg');
    raise exception 'constraint: a path without a name was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into transactions (type, description, amount, attachment_name)
    values ('Income', 'Check: name without a path', 1, 'receipt.jpg');
    raise exception 'constraint: a name without a path was accepted';
  exception when check_violation then null;
  end;

  insert into transactions (type, description, amount, transaction_date)
  values ('Income', 'Check: no file', 1, '1999-01-01');
  insert into transactions (type, description, amount, transaction_date, attachment_path, attachment_name)
  values ('Expense', 'Check: with a file', 1, '1999-01-01', 'check.jpg', 'receipt.jpg');

  -- The bucket is private and enforces its own limits.
  select * into b from storage.buckets where id = 'transaction-files';
  if not found then raise exception 'bucket: transaction-files is missing'; end if;
  if b.public then raise exception 'bucket: transaction-files must be private'; end if;
  if b.file_size_limit is distinct from 10485760 then
    raise exception 'bucket: expected a 10 MB limit, got %', b.file_size_limit;
  end if;
  if not b.allowed_mime_types @> array['image/jpeg', 'image/heic', 'application/pdf']
     or b.allowed_mime_types && array['image/svg+xml', 'text/html'] then
    raise exception 'bucket: unexpected file types: %', b.allowed_mime_types;
  end if;

  -- Read, upload and delete, each for owners only, and nothing else.
  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('owners_read_transaction_files', 'owners_upload_transaction_files', 'owners_delete_transaction_files')
    and roles = '{authenticated}'
    and coalesce(qual, with_check) like '%is_app_owner()%'
    and coalesce(qual, with_check) like '%transaction-files%';
  if n <> 3 then raise exception 'policies: expected 3 owner-only policies, found %', n; end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and coalesce(qual, with_check) like '%transaction-files%';
  if n <> 3 then raise exception 'policies: expected exactly 3 on this bucket, found %', n; end if;

  -- The SQL editor's admin role skips RLS, so switch to a signed-out visitor.
  begin
    set local role anon;
    insert into storage.objects (bucket_id, name) values ('transaction-files', 'check-anon.jpg');
    raise exception 'access: a signed-out visitor could upload a file';
  exception when insufficient_privilege then null;
  end;

  raise notice 'Transaction attachment checks passed';
end;
$$;

rollback;
