-- Lets a transaction carry one file, usually the photo or PDF of a receipt.
--
-- Non-destructive: two new empty columns and a new bucket. Apply this BEFORE
-- merging the app change. The new app asks for these columns when it loads the
-- ledger, so without them the Transactions screen fails. The old app ignores them.

-- Where the file is, and what Esther called it. The stored object gets a random
-- name because phone file names can hold characters Storage refuses, and two
-- receipts can both be IMG_0001.jpg. Sums and the IRAS figures never read these.
alter table transactions
  add column attachment_path text,   -- object name in the "transaction-files" bucket
  add column attachment_name text,   -- the file's original name, for display
  add constraint transactions_attachment_complete
    check ((attachment_path is null) = (attachment_name is null));

-- ── Storage for attachments ───────────────────────────────────────────────────

-- Private, like the invoices bucket: receipts carry business details, so a file
-- is reached only through a short-lived signed link that the owner's session
-- requests. Limits are enforced here so they hold whatever the browser sends.
-- Photos and PDFs only: SVG and HTML can carry scripts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transaction-files', 'transaction-files', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
);

-- Unlike an issued invoice PDF, an attachment isn't a frozen record: Esther can
-- swap or remove a wrong photo, so owners may delete here. There's still no
-- update policy. A replacement is a new object with a new random name.
create policy owners_read_transaction_files on storage.objects
  for select to authenticated
  using (bucket_id = 'transaction-files' and public.is_app_owner());

create policy owners_upload_transaction_files on storage.objects
  for insert to authenticated
  with check (bucket_id = 'transaction-files' and public.is_app_owner());

create policy owners_delete_transaction_files on storage.objects
  for delete to authenticated
  using (bucket_id = 'transaction-files' and public.is_app_owner());
