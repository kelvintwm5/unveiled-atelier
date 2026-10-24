-- Invoices: drafts, issuing with a database-assigned number, voiding, and the
-- owner-editable settings and clause library that invoices draw their wording from.
-- Replaces the "Invoices" tab in the Google Sheet and the Google Docs templates.
-- Starts empty: invoices issued from the Sheet are not imported.
--
-- The lifecycle is draft → issued → void.
--   draft  : edited freely, no number. Can be deleted.
--   issued : has a number and is frozen. What the client received.
--   void   : kept for the record, never deleted. If it was replaced, the
--            replacement points back at it (replaces_invoice_id).
--
-- Three layers keep an issued invoice frozen:
--   1. RLS lets the browser write only draft rows.
--   2. issue_invoice / void_invoice / attach_invoice_pdf are the only ways past
--      that, and they check is_app_owner() themselves.
--   3. A trigger refuses changes to issued rows for everyone, including the SQL
--      editor's admin role, which skips RLS.

-- ── Settings ───────────────────────────────────────────────────────────────────

-- One row, enforced by a boolean primary key that can only be true. Kept as data
-- rather than code so Esther can change her bank details or terms without a
-- deploy. Issuing copies the business details into the invoice, so changing them
-- here never changes an invoice that was already sent.
create table invoice_settings (
  id                    boolean primary key default true check (id),
  business_name         text,
  address               text,
  email                 text,
  phone                 text,
  paynow                text,   -- UEN or mobile number
  bank_name             text,
  bank_account_name     text,
  bank_account_no       text,
  default_terms_rental  text,
  default_terms_bespoke text,
  updated_at            timestamptz not null default now()
);

-- Empty on purpose: the repo is public, so the real details are entered in the app.
insert into invoice_settings default values;

create trigger invoice_settings_set_updated_at
  before update on invoice_settings
  for each row execute function set_updated_at();

-- Reusable wording Esther can drop into a line description, the client note or
-- the terms. Inserting a clause copies its text, so editing a clause later
-- changes nothing already written with it.
create table invoice_clauses (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (btrim(title) <> ''),
  body       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invoice_clauses_set_updated_at
  before update on invoice_clauses
  for each row execute function set_updated_at();

-- ── Invoices ───────────────────────────────────────────────────────────────────

create table invoices (
  id         uuid primary key default gen_random_uuid(),
  status     text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  template   text not null check (template in ('rental', 'bespoke')),
  kind       text not null check (kind in ('deposit', 'final')),

  -- Client details are copied in, not looked up through client_id, so fixing a
  -- typo in the client tracker never rewrites an invoice the client already has.
  -- client_id is only a link back to the tracker, and is optional.
  client_id    uuid references clients(id) on delete restrict,
  client_name  text not null default '',   -- '' is allowed on a draft; issuing requires a name
  client_email text,
  client_phone text,
  pws_date     date,
  wedding_date date,

  -- Plain multi-line text. Lines starting with "- " print as bullets.
  client_note text,
  terms       text,   -- starts as the template's default terms, then edited per invoice

  -- A final invoice points at the deposit invoice it settles. Deposits issued
  -- from the Google Sheet aren't in this table, so for those the final records
  -- the old number as text instead.
  deposit_invoice_id uuid references invoices(id) on delete restrict,
  legacy_deposit_no  text,

  -- Set on a draft that will replace an issued invoice. Issuing the draft voids
  -- the old one in the same transaction. One column holds the link both ways:
  -- "what replaced X" is the invoice whose replaces_invoice_id is X.
  replaces_invoice_id uuid unique references invoices(id) on delete restrict,

  -- Set by issue_invoice(), never by the browser.
  invoice_no        text unique check (invoice_no ~ '^UA-[0-9]{4}-[0-9]{4,}$'),
  issued_on         date,          -- the issue date in Singapore, as printed
  issued_at         timestamptz,
  subtotal          numeric(12,2),
  amount_payable    numeric(12,2),
  totals            jsonb,         -- the printed totals rows: [{label, amount, bold}]
  business_snapshot jsonb,         -- invoice_settings' business details at the moment of issue
  pdf_path          text,          -- object name in the "invoices" Storage bucket

  voided_at   timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deposit_link_only_on_finals
    check (kind = 'final' or (deposit_invoice_id is null and legacy_deposit_no is null)),
  constraint one_deposit_link
    check (deposit_invoice_id is null or legacy_deposit_no is null),
  constraint not_linked_to_itself
    check (deposit_invoice_id <> id and replaces_invoice_id <> id),
  -- A draft carries none of the issue fields; an issued or void invoice has all
  -- of them (except the PDF, which is uploaded just after issuing).
  constraint issue_fields_match_status check (
    case when status = 'draft' then
      invoice_no is null and issued_on is null and issued_at is null and subtotal is null
      and amount_payable is null and totals is null and business_snapshot is null and pdf_path is null
    else
      invoice_no is not null and issued_on is not null and issued_at is not null and subtotal is not null
      and amount_payable is not null and totals is not null and business_snapshot is not null
    end
  ),
  constraint void_fields_match_status
    check ((status = 'void') = (voided_at is not null))
);

-- Postgres does not index foreign keys automatically.
create index invoices_client_id_idx on invoices (client_id) where client_id is not null;
create index invoices_deposit_invoice_id_idx on invoices (deposit_invoice_id) where deposit_invoice_id is not null;

-- A deposit is settled by at most one live final invoice. A voided final doesn't
-- count, so a final can be voided and reissued.
create unique index invoices_one_final_per_deposit
  on invoices (deposit_invoice_id) where status = 'issued' and kind = 'final';

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

create table invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  -- cascade: deleting a draft takes its lines with it. Issued invoices can't be
  -- deleted at all (see the trigger below), so this never removes issued lines.
  invoice_id  uuid not null references invoices(id) on delete cascade,
  position    int  not null,
  title       text not null default '',   -- issuing requires a title
  description text,
  quantity    int  not null default 1 check (quantity > 0),
  unit_amount numeric(12,2) not null default 0 check (unit_amount >= 0),   -- issuing requires > 0
  unique (invoice_id, position)
);

-- ── Numbering ──────────────────────────────────────────────────────────────────

-- One row holding the next number. Issuing takes it with UPDATE ... RETURNING,
-- which locks the row until the transaction ends. Two invoices issued at the
-- same moment therefore queue rather than both reading the same number.
--
-- Why not a Postgres sequence: a sequence hands out its number even if the
-- transaction later fails, which leaves gaps. Here a failed issue rolls the
-- counter back too, so the numbers have no gaps.
--
-- The number never resets: only the year in UA-YYYY-NNNN changes. It continues
-- from the Google Sheet, whose last invoice was UA-2026-1820.
create table invoice_counter (
  id      boolean primary key default true check (id),
  next_no int not null check (next_no > 0)
);

insert into invoice_counter (next_no) values (1821);

-- UA-<year of p_at in Singapore>-<number, at least 4 digits>. Plain lpad would cut
-- 12345 down to 1234, hence the greatest(). Kept separate so the year boundary
-- can be tested without waiting for New Year.
create function invoice_number(p_no int, p_at timestamptz) returns text
  language sql
  stable
  set search_path = public
as $$
  select 'UA-' || to_char(p_at at time zone 'Asia/Singapore', 'YYYY') || '-' || lpad(p_no::text, greatest(4, length(p_no::text)), '0');
$$;

-- ── Freezing issued invoices ──────────────────────────────────────────────────

create function invoices_guard() returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  -- The only columns that may still change once an invoice is issued.
  still_mutable constant text[] := array['status', 'voided_at', 'void_reason', 'pdf_path', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Invoice % has been issued and can''t be deleted. Void it instead.', old.invoice_no;
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    -- Only issue_invoice() may give a draft a number, so that numbers come from
    -- the counter and nowhere else, not even a hand-written UPDATE in the SQL editor.
    if new.status <> 'draft' and current_setting('unveiled.issuing', true) is distinct from 'on' then
      raise exception 'A draft can only be issued through issue_invoice().';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - still_mutable) is distinct from (to_jsonb(old) - still_mutable) then
    raise exception 'Invoice % has been issued and can''t be changed. Void it and issue a replacement.', old.invoice_no;
  end if;
  if new.status = 'draft' or (old.status = 'void' and new.status <> 'void') then
    raise exception 'Invoice % can''t go back to %.', old.invoice_no, new.status;
  end if;
  if old.status = 'void' and (new.voided_at, new.void_reason) is distinct from (old.voided_at, old.void_reason) then
    raise exception 'Invoice % is already void.', old.invoice_no;
  end if;
  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'The PDF for invoice % is already stored and can''t be replaced.', old.invoice_no;
  end if;
  return new;
end;
$$;

create trigger invoices_guard
  before update or delete on invoices
  for each row execute function invoices_guard();

-- Line items belong to their invoice: once it's issued, its lines are frozen too.
create function invoice_line_items_guard() returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into v_status from invoices where id = old.invoice_id;
    -- Not found means the draft itself is being deleted and this is the cascade.
    if v_status is not null and v_status <> 'draft' then
      raise exception 'The lines of an issued invoice can''t be changed.';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status into v_status from invoices where id = new.invoice_id;
    if v_status is distinct from 'draft' then
      raise exception 'Lines can only be added to a draft invoice.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger invoice_line_items_guard
  before insert or update or delete on invoice_line_items
  for each row execute function invoice_line_items_guard();

-- ── Row level security ────────────────────────────────────────────────────────

alter table invoice_settings   enable row level security;
alter table invoice_clauses    enable row level security;
alter table invoices           enable row level security;
alter table invoice_line_items enable row level security;
-- No policies at all: the counter is reachable only through issue_invoice().
alter table invoice_counter    enable row level security;

-- The single settings row already exists, so there's nothing to insert or delete.
create policy owners_read_invoice_settings on invoice_settings
  for select using (is_app_owner());
create policy owners_update_invoice_settings on invoice_settings
  for update using (is_app_owner()) with check (is_app_owner());

create policy owners_all_invoice_clauses on invoice_clauses
  for all using (is_app_owner()) with check (is_app_owner());

-- Owners read everything but write only drafts. "with check" on update stops the
-- browser from turning a draft into an issued invoice with a number of its own
-- choosing; that only happens inside issue_invoice().
create policy owners_read_invoices on invoices
  for select using (is_app_owner());
create policy owners_insert_draft_invoices on invoices
  for insert with check (is_app_owner() and status = 'draft');
create policy owners_update_draft_invoices on invoices
  for update using (is_app_owner() and status = 'draft') with check (is_app_owner() and status = 'draft');
create policy owners_delete_draft_invoices on invoices
  for delete using (is_app_owner() and status = 'draft');

-- The trigger above already limits writes to the lines of drafts.
create policy owners_all_invoice_line_items on invoice_line_items
  for all using (is_app_owner()) with check (is_app_owner());

-- ── Saving a draft ─────────────────────────────────────────────────────────────

-- Saves a draft and replaces its lines in one transaction, so a dropped connection
-- can't leave a draft with half its lines. p_id null creates a new draft. Returns
-- the draft's id.
--
-- Security invoker (the default), unlike the functions below: RLS still decides
-- what the caller may write, so this can only ever touch a draft. The fields are
-- listed one by one so the browser can't set status, a number or totals here.
create function save_invoice_draft(p_id uuid, p_invoice jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'The line items are missing.';
  end if;

  if v_id is null then
    insert into invoices (template, kind)
    values (p_invoice ->> 'template', p_invoice ->> 'kind')
    returning id into v_id;
  end if;

  update invoices set
    template            = p_invoice ->> 'template',
    kind                = p_invoice ->> 'kind',
    client_id           = (p_invoice ->> 'client_id')::uuid,
    client_name         = coalesce(btrim(p_invoice ->> 'client_name'), ''),
    client_email        = nullif(btrim(p_invoice ->> 'client_email'), ''),
    client_phone        = nullif(btrim(p_invoice ->> 'client_phone'), ''),
    pws_date            = (p_invoice ->> 'pws_date')::date,
    wedding_date        = (p_invoice ->> 'wedding_date')::date,
    client_note         = nullif(btrim(p_invoice ->> 'client_note'), ''),
    terms               = nullif(btrim(p_invoice ->> 'terms'), ''),
    deposit_invoice_id  = (p_invoice ->> 'deposit_invoice_id')::uuid,
    legacy_deposit_no   = nullif(btrim(p_invoice ->> 'legacy_deposit_no'), ''),
    replaces_invoice_id = (p_invoice ->> 'replaces_invoice_id')::uuid
  where id = v_id and status = 'draft';
  if not found then
    raise exception 'That draft no longer exists or has already been issued. Reload the page.';
  end if;

  delete from invoice_line_items where invoice_id = v_id;
  insert into invoice_line_items (invoice_id, position, title, description, quantity, unit_amount)
  select v_id,
         (t.ord - 1)::int,
         coalesce(btrim(t.line ->> 'title'), ''),
         nullif(btrim(t.line ->> 'description'), ''),
         (t.line ->> 'quantity')::int,
         (t.line ->> 'unit_amount')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(line, ord);

  return v_id;
end;
$$;

-- ── Issuing, voiding, storing the PDF ─────────────────────────────────────────
--
-- These three are security definer: they run with the rights of the function's
-- owner, which skips RLS. That's what lets them change rows the policies above
-- freeze. In exchange each one checks is_app_owner() first, and pins search_path
-- so a caller can't swap in their own tables.

-- Issues a draft in one transaction: either all of this happens or none of it.
--
-- The 50% deposit rules live in one place, src/lib/invoiceTotals.ts, which
-- also draws the live preview. The browser sends the subtotal and the totals rows
-- it showed. This function recomputes the subtotal from the stored lines with
-- exact numeric arithmetic and refuses if the two disagree, so what gets issued is
-- what Esther saw and what the lines add up to.
create function issue_invoice(p_id uuid, p_subtotal numeric, p_totals jsonb)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv        invoices;
  linked     invoices;
  v_lines    int;
  v_subtotal numeric(12,2);
  v_payable  numeric(12,2);
  v_no       int;
  v_now      timestamptz := now();
begin
  if not is_app_owner() then
    raise exception 'Only the owner can issue invoices.' using errcode = '42501';
  end if;

  select * into inv from invoices where id = p_id for update;
  if not found then
    raise exception 'That invoice no longer exists. Reload the page.';
  end if;
  if inv.status <> 'draft' then
    raise exception 'Invoice % has already been issued.', inv.invoice_no;
  end if;
  if btrim(inv.client_name) = '' then
    raise exception 'Add the client''s name before issuing.';
  end if;

  select count(*), coalesce(sum(quantity * unit_amount), 0)
    into v_lines, v_subtotal
    from invoice_line_items where invoice_id = p_id;
  if v_lines = 0 then
    raise exception 'Add at least one line item before issuing.';
  end if;
  if exists (select 1 from invoice_line_items
             where invoice_id = p_id and (btrim(title) = '' or unit_amount <= 0)) then
    raise exception 'Every line item needs a title and an amount above zero.';
  end if;
  if p_subtotal is distinct from v_subtotal then
    raise exception 'The line items add up to % but the screen showed %. Reload and check the invoice.', v_subtotal, p_subtotal;
  end if;

  if jsonb_typeof(p_totals) is distinct from 'array' or jsonb_array_length(p_totals) = 0 then
    raise exception 'The invoice totals are missing.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_totals) e
    where jsonb_typeof(e -> 'label')  is distinct from 'string'
       or jsonb_typeof(e -> 'amount') is distinct from 'number'
       or jsonb_typeof(e -> 'bold')   is distinct from 'boolean'
       or (e ->> 'amount')::numeric < 0
       or (e ->> 'amount')::numeric <> round((e ->> 'amount')::numeric, 2)
  ) then
    raise exception 'The invoice totals are malformed.';
  end if;
  -- The last row is always the amount payable now.
  v_payable := (p_totals -> -1 ->> 'amount')::numeric;
  if v_payable <= 0 then
    raise exception 'The amount payable must be above zero.';
  end if;

  if inv.deposit_invoice_id is not null then
    select * into linked from invoices where id = inv.deposit_invoice_id;
    if linked.kind is distinct from 'deposit' or linked.status is distinct from 'issued' then
      raise exception 'The linked deposit invoice must be an issued (not void) deposit.';
    end if;
  end if;

  if inv.replaces_invoice_id is not null then
    select * into linked from invoices where id = inv.replaces_invoice_id for update;
    if linked.status is distinct from 'issued' then
      raise exception 'Invoice % is already void, so there''s nothing to replace.', linked.invoice_no;
    end if;
    if linked.kind <> inv.kind then
      raise exception 'A % invoice can only be replaced by another % invoice.', linked.kind, linked.kind;
    end if;
    -- Voided first, so a replacement final doesn't collide with the one it replaces
    -- in invoices_one_final_per_deposit.
    update invoices
       set status = 'void', voided_at = v_now,
           void_reason = coalesce(void_reason, 'Replaced')
     where id = linked.id;
  end if;

  -- Takes the number and locks the counter row until this transaction ends.
  update invoice_counter set next_no = next_no + 1 returning next_no - 1 into v_no;

  -- Local to this transaction: lets invoices_guard allow the draft → issued change.
  perform set_config('unveiled.issuing', 'on', true);

  update invoices set
    status            = 'issued',
    invoice_no        = invoice_number(v_no, v_now),
    issued_at         = v_now,
    issued_on         = (v_now at time zone 'Asia/Singapore')::date,
    subtotal          = v_subtotal,
    amount_payable    = v_payable,
    totals            = p_totals,
    business_snapshot = (
      select jsonb_build_object(
        'businessName',    s.business_name,
        'address',         s.address,
        'email',           s.email,
        'phone',           s.phone,
        'paynow',          s.paynow,
        'bankName',        s.bank_name,
        'bankAccountName', s.bank_account_name,
        'bankAccountNo',   s.bank_account_no)
      from invoice_settings s)
  where id = p_id
  returning * into inv;

  perform set_config('unveiled.issuing', 'off', true);
  return inv;
end;
$$;

-- Voids an issued invoice that won't be replaced, e.g. a cancelled booking.
-- To correct an invoice instead, issue a draft with replaces_invoice_id set.
create function void_invoice(p_id uuid, p_reason text)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invoices;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can void invoices.' using errcode = '42501';
  end if;
  select * into inv from invoices where id = p_id for update;
  if not found then
    raise exception 'That invoice no longer exists. Reload the page.';
  end if;
  if inv.status <> 'issued' then
    raise exception 'Only an issued invoice can be voided.';
  end if;
  update invoices
     set status = 'void', voided_at = now(), void_reason = nullif(btrim(p_reason), '')
   where id = p_id
   returning * into inv;
  return inv;
end;
$$;

-- Records where the issued PDF is stored. Only once per invoice, only under the
-- invoice's own number, and only if the file is actually in the bucket.
create function attach_invoice_pdf(p_id uuid, p_path text)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invoices;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can store invoice PDFs.' using errcode = '42501';
  end if;
  select * into inv from invoices where id = p_id for update;
  if not found then
    raise exception 'That invoice no longer exists. Reload the page.';
  end if;
  if inv.status = 'draft' then
    raise exception 'A draft has no stored PDF.';
  end if;
  if inv.pdf_path is not null then
    if inv.pdf_path = p_path then
      return inv;   -- a retry after a dropped connection; nothing to do
    end if;
    raise exception 'The PDF for invoice % is already stored.', inv.invoice_no;
  end if;
  if p_path is distinct from inv.invoice_no || '.pdf' then
    raise exception 'The PDF for invoice % must be stored as %.pdf.', inv.invoice_no, inv.invoice_no;
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'invoices' and name = p_path) then
    raise exception 'The PDF for invoice % hasn''t finished uploading.', inv.invoice_no;
  end if;
  update invoices set pdf_path = p_path where id = p_id returning * into inv;
  return inv;
end;
$$;

-- ── Storage for issued PDFs ───────────────────────────────────────────────────

-- Private: files are reached only through short-lived signed links that the
-- owner's session requests. PDFs only, 10 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf']);

-- Read and upload, but no update or delete policy: once a PDF is stored the app
-- can't overwrite or remove it. An upload is accepted only as <invoice_no>.pdf
-- for an issued invoice that has no PDF yet.
create policy owners_read_invoice_pdfs on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and public.is_app_owner());

create policy owners_upload_invoice_pdfs on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and public.is_app_owner()
    and exists (
      select 1 from public.invoices i
      where i.invoice_no || '.pdf' = objects.name
        and i.status <> 'draft'
        and i.pdf_path is null
    )
  );
