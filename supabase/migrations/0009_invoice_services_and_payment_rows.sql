-- Replaces the hard-coded 50% deposit with rows Esther adds herself, and adds a
-- library of reusable services.
--
-- Before: the totals under the line items came from a fixed rule (50% now, 50%
-- later, plus a matching security deposit on rentals). She may collect in full
-- upfront, take a different deposit, or hold a different security deposit.
--
-- After: service lines add up to a subtotal, and optional payment rows below it
-- each add or subtract. Amount payable = subtotal + adds - deducts.
--
-- Non-destructive: no column or row is dropped. Issued invoices print from their
-- frozen totals, so none of them change.
--
-- Apply this immediately before merging. Between the two, the old app's deposit
-- and final invoices are refused at issue (safely: no number is used), because it
-- sends a 50% payable that the stored rows no longer add up to.

-- ── Reusable services ─────────────────────────────────────────────────────────

-- Standard wording and, optionally, a standard price. Picking one copies it into
-- a line item, so there's no foreign key: editing or deleting a service later
-- changes nothing already written with it. Same reasoning as invoice_clauses.
create table invoice_services (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (btrim(title) <> ''),
  description    text,
  default_amount numeric(12,2) check (default_amount > 0),   -- null: priced case by case
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger invoice_services_set_updated_at
  before update on invoice_services
  for each row execute function set_updated_at();

alter table invoice_services enable row level security;

create policy owners_all_invoice_services on invoice_services
  for all using (is_app_owner()) with check (is_app_owner());

-- ── Payment rows ──────────────────────────────────────────────────────────────

-- Payment rows live with the line items rather than in a table of their own, so
-- they inherit what that table already has: frozen on issue by
-- invoice_line_items_guard, covered by RLS, saved atomically by
-- save_invoice_draft, deleted with their draft.
--
-- The tag keeps a refundable security deposit distinguishable from a veil sale,
-- which the P&L will need if it ever reads invoices.
alter table invoice_line_items
  add column line_type text not null default 'service'
    check (line_type in ('service', 'add', 'deduct')),
  add constraint payment_rows_are_single
    check (line_type = 'service' or quantity = 1);

-- ── Invoice type ──────────────────────────────────────────────────────────────

-- 'full' is for a price collected in one go. The type no longer drives any money:
-- it sets the wording on the PDF and whether a final links to its deposit.
alter table invoices
  drop constraint invoices_kind_check,
  add constraint invoices_kind_check check (kind in ('full', 'deposit', 'final'));

-- ── Saving a draft ────────────────────────────────────────────────────────────

-- The only change from 0006 is storing line_type.
create or replace function save_invoice_draft(p_id uuid, p_invoice jsonb, p_lines jsonb)
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
  insert into invoice_line_items (invoice_id, position, title, description, quantity, unit_amount, line_type)
  select v_id,
         (t.ord - 1)::int,
         coalesce(btrim(t.line ->> 'title'), ''),
         nullif(btrim(t.line ->> 'description'), ''),
         (t.line ->> 'quantity')::int,
         (t.line ->> 'unit_amount')::numeric,
         coalesce(t.line ->> 'line_type', 'service')
  from jsonb_array_elements(p_lines) with ordinality as t(line, ord);

  return v_id;
end;
$$;

-- ── Issuing ───────────────────────────────────────────────────────────────────

-- Changes from 0007:
--   * The subtotal counts service lines only.
--   * The amount payable is worked out here from the stored rows, and the browser's
--     last totals row has to match it. Until now the database took that figure on
--     trust, because the 50% rule lived only in the browser.
--   * Totals rows may be negative (a deduction); the amount payable still can't be.
create or replace function issue_invoice(p_id uuid, p_subtotal numeric, p_totals jsonb)
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
  v_shown    numeric(12,2);
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

  select count(*) filter (where line_type = 'service'),
         coalesce(sum(quantity * unit_amount) filter (where line_type = 'service'), 0),
         coalesce(sum(case line_type when 'deduct' then -(quantity * unit_amount)
                                     else quantity * unit_amount end), 0)
    into v_lines, v_subtotal, v_payable
    from invoice_line_items where invoice_id = p_id;
  if v_lines = 0 then
    raise exception 'Add at least one line item before issuing.';
  end if;
  if exists (select 1 from invoice_line_items
             where invoice_id = p_id and (btrim(title) = '' or unit_amount <= 0)) then
    raise exception 'Every line item and payment row needs a title and an amount above zero.';
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
       or (e ->> 'amount')::numeric <> round((e ->> 'amount')::numeric, 2)
  ) then
    raise exception 'The invoice totals are malformed.';
  end if;
  -- The last row is always the amount payable now.
  v_shown := (p_totals -> -1 ->> 'amount')::numeric;
  if v_shown is distinct from v_payable then
    raise exception 'The invoice adds up to % but the screen showed %. Reload and check the invoice.', v_payable, v_shown;
  end if;
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
  -- "where id" matches the table's only row; see the top of 0007.
  update invoice_counter set next_no = next_no + 1 where id returning next_no - 1 into v_no;

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
