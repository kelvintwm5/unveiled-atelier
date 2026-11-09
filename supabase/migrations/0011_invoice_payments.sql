-- Records when an invoice is paid, and feeds Transactions from it.
--
-- Before: the app knew what was billed but not what was paid, and income was typed
-- into Transactions by hand. After: "Mark as paid" records the payment and creates
-- the Income row in one go.
--
-- The rules, from Esther:
--   income counts only when she's paid
--   a refundable security deposit is held, not earned, so it stays out of
--     Transactions. Only an amount she keeps for damage becomes income, on the day
--     she keeps it
--   each invoice is paid once, in full. A deposit and its final are two invoices
--   paid deposits are non-refundable, so a cancelled booking keeps its income
--
-- Non-destructive: one new table, two new empty columns, new functions and triggers.
-- Apply this BEFORE merging the app change. The new app asks for these columns and
-- this table when it loads, so without them the Invoices and Transactions screens
-- fail. The old app ignores them.

create table invoice_payments (
  id                    uuid primary key default gen_random_uuid(),
  -- Unique: clients don't part-pay. A separate table because an issued invoice is
  -- frozen (invoices_guard), and being paid doesn't change what the client was sent.
  invoice_id            uuid not null unique references invoices(id) on delete restrict,
  paid_on               date not null,
  payment_method        text,
  price_amount          numeric(12,2) not null check (price_amount >= 0),
  security_amount       numeric(12,2) not null default 0 check (security_amount >= 0),
  -- Held means security_amount > 0 and security_settled_on is null. Once settled,
  -- whatever wasn't kept went back to the client.
  security_settled_on   date,
  security_kept         numeric(12,2),
  security_note         text,
  -- A paid deposit whose client cancelled: the income stays, no final will follow.
  booking_closed_on     date,
  booking_closed_reason text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint invoice_payments_some_money
    check (price_amount + security_amount > 0),
  constraint invoice_payments_settled_complete
    check ((security_settled_on is null) = (security_kept is null)),
  constraint invoice_payments_settled_has_deposit
    check (security_settled_on is null or security_amount > 0),
  constraint invoice_payments_kept_within_deposit
    check (security_kept is null or (security_kept >= 0 and security_kept <= security_amount)),
  constraint invoice_payments_kept_has_reason
    check (coalesce(security_kept, 0) = 0 or btrim(coalesce(security_note, '')) <> '')
);

create trigger invoice_payments_set_updated_at
  before update on invoice_payments
  for each row execute function set_updated_at();

-- Owners read; the functions below are the only way to write, so a payment and its
-- Income row can never get out of step.
alter table invoice_payments enable row level security;

create policy owners_read_invoice_payments on invoice_payments
  for select using (is_app_owner());

-- ── Linking transactions to invoices ──────────────────────────────────────────

-- Both empty on a row typed in by hand. reference_no already shows the invoice
-- number, but it's free text; these say the row belongs to the invoice.
alter table transactions
  add column invoice_id uuid references invoices(id) on delete restrict,
  add column source     text check (source in ('invoice_payment', 'security_kept')),
  add constraint transactions_source_complete
    check ((invoice_id is null) = (source is null));

-- At most one income row of each kind per invoice. Also the index for the foreign key.
create unique index transactions_one_per_invoice_source
  on transactions (invoice_id, source) where invoice_id is not null;

-- A linked row mirrors a payment, so what the payment decides can only change from
-- the invoice. Notes and attachments stay editable: a photo of the damage goes here.
create function transactions_guard() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- Local to the transaction, set only by the functions below (like unveiled.issuing).
  if current_setting('unveiled.payments', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.invoice_id is not null or new.source is not null then
      raise exception 'Only recording a payment can link a transaction to an invoice.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.source is not null then
      raise exception 'This income was recorded from invoice %. Undo it on the invoice.', old.reference_no;
    end if;
    return old;
  end if;

  if (new.invoice_id, new.source) is distinct from (old.invoice_id, old.source) then
    raise exception 'Only recording a payment can link a transaction to an invoice.';
  end if;
  if old.source is not null
     and (new.amount, new.type, new.transaction_date) is distinct from (old.amount, old.type, old.transaction_date) then
    raise exception 'This income was recorded from invoice %. Undo it on the invoice to change the amount, type or date.', old.reference_no;
  end if;
  return new;
end;
$$;

create trigger transactions_guard
  before insert or update or delete on transactions
  for each row execute function transactions_guard();

-- A paid invoice can't be voided, which also covers void & reissue because
-- issue_invoice() voids the invoice it replaces. If a correction changed the amount,
-- carrying the payment over would show money she never received.
create function invoices_paid_guard() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if exists (select 1 from invoice_payments where invoice_id = new.id) then
    raise exception 'Invoice % is marked paid. Undo the payment first.', old.invoice_no;
  end if;
  return new;
end;
$$;

create trigger invoices_paid_guard
  before update on invoices
  for each row
  when (new.status = 'void' and old.status is distinct from 'void')
  execute function invoices_paid_guard();

-- ── Recording a payment ───────────────────────────────────────────────────────

-- The split comes from the invoice's own rows, never from the browser.
create function record_invoice_payment(p_id uuid, p_paid_on date, p_method text)
returns invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  inv        invoices;
  pay        invoice_payments;
  v_security numeric(12,2);
  v_price    numeric(12,2);
begin
  if not is_app_owner() then
    raise exception 'Only the owner can record payments.' using errcode = '42501';
  end if;
  select * into inv from invoices where id = p_id for update;
  if not found then
    raise exception 'That invoice no longer exists. Reload the page.';
  end if;
  if inv.status <> 'issued' then
    raise exception 'Only an issued invoice can be marked paid.';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Singapore')::date then
    raise exception 'The payment date can''t be in the future.';
  end if;
  if exists (select 1 from invoice_payments where invoice_id = p_id) then
    raise exception 'Invoice % is already marked paid.', inv.invoice_no;
  end if;

  -- The same label invoiceTotals.ts writes and reads.
  select coalesce(sum(quantity * unit_amount), 0) into v_security
    from invoice_line_items
   where invoice_id = p_id and line_type = 'add'
     and lower(btrim(title)) = 'refundable security deposit';
  v_price := inv.amount_payable - v_security;
  if v_price < 0 then
    raise exception 'The security deposit on invoice % is more than its total.', inv.invoice_no;
  end if;

  insert into invoice_payments (invoice_id, paid_on, payment_method, price_amount, security_amount)
  values (p_id, p_paid_on, nullif(btrim(p_method), ''), v_price, v_security)
  returning * into pay;

  -- $0 when a deposit already covered the price and this only collects the security.
  if v_price > 0 then
    perform set_config('unveiled.payments', 'on', true);
    insert into transactions (
      transaction_date, type, amount, category, description, payment_method,
      client_name, client_id, reference_no, invoice_id, source
    ) values (
      p_paid_on, 'Income', v_price,
      case inv.template when 'rental' then 'Veil Rental' else 'Bespoke Veils' end,
      case inv.template when 'rental' then 'Rental ' else 'Bespoke ' end ||
        case inv.kind when 'deposit' then 'deposit' when 'final' then 'final payment' else 'full payment' end ||
        ' – ' || inv.client_name,
      nullif(btrim(p_method), ''), inv.client_name, inv.client_id, inv.invoice_no, p_id, 'invoice_payment'
    );
    perform set_config('unveiled.payments', 'off', true);
  end if;

  return pay;
end;
$$;

-- Returns the path of any file attached to the removed row, so the app can delete it.
create function undo_invoice_payment(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pay    invoice_payments;
  v_path text;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can undo payments.' using errcode = '42501';
  end if;
  select * into pay from invoice_payments where invoice_id = p_id for update;
  if not found then
    raise exception 'That invoice isn''t marked paid.';
  end if;
  if pay.security_settled_on is not null then
    raise exception 'Undo what happened to the security deposit first.';
  end if;
  if pay.booking_closed_on is not null then
    raise exception 'Reopen the booking first.';
  end if;

  perform set_config('unveiled.payments', 'on', true);
  delete from transactions
   where invoice_id = p_id and source = 'invoice_payment'
   returning attachment_path into v_path;
  perform set_config('unveiled.payments', 'off', true);
  delete from invoice_payments where invoice_id = p_id;
  return v_path;
end;
$$;

-- ── The security deposit ──────────────────────────────────────────────────────

-- p_kept = 0 means it all went back to the client, and nothing reaches Transactions.
-- Anything kept is income on the day she keeps it, because that's when it's hers.
create function settle_security_deposit(p_id uuid, p_settled_on date, p_kept numeric, p_reason text)
returns invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invoices;
  pay invoice_payments;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can settle security deposits.' using errcode = '42501';
  end if;
  select * into inv from invoices where id = p_id;
  select * into pay from invoice_payments where invoice_id = p_id for update;
  if not found then
    raise exception 'That invoice isn''t marked paid.';
  end if;
  if pay.security_amount = 0 then
    raise exception 'Invoice % has no security deposit.', inv.invoice_no;
  end if;
  if pay.security_settled_on is not null then
    raise exception 'The security deposit on invoice % has already been settled.', inv.invoice_no;
  end if;
  if p_settled_on is null or p_settled_on > (now() at time zone 'Asia/Singapore')::date then
    raise exception 'The date can''t be in the future.';
  end if;
  if p_settled_on < pay.paid_on then
    raise exception 'The date can''t be before the deposit was paid.';
  end if;
  if p_kept is null or p_kept < 0 or p_kept > pay.security_amount or p_kept <> round(p_kept, 2) then
    raise exception 'The amount kept must be between $0 and the security deposit.';
  end if;
  if p_kept > 0 and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why the security deposit is being kept.';
  end if;

  update invoice_payments
     set security_settled_on = p_settled_on,
         security_kept       = p_kept,
         security_note       = nullif(btrim(p_reason), '')
   where invoice_id = p_id
   returning * into pay;

  if p_kept > 0 then
    perform set_config('unveiled.payments', 'on', true);
    insert into transactions (
      transaction_date, type, amount, category, description,
      client_name, client_id, reference_no, notes, invoice_id, source
    ) values (
      p_settled_on, 'Income', p_kept, 'Security Deposit Kept',
      'Security deposit kept – ' || inv.client_name,
      inv.client_name, inv.client_id, inv.invoice_no, btrim(p_reason), p_id, 'security_kept'
    );
    perform set_config('unveiled.payments', 'off', true);
  end if;

  return pay;
end;
$$;

-- Returns the path of any file attached to the removed row, so the app can delete it.
create function undo_security_settlement(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pay    invoice_payments;
  v_path text;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can settle security deposits.' using errcode = '42501';
  end if;
  select * into pay from invoice_payments where invoice_id = p_id for update;
  if not found or pay.security_settled_on is null then
    raise exception 'That security deposit hasn''t been settled.';
  end if;

  perform set_config('unveiled.payments', 'on', true);
  delete from transactions
   where invoice_id = p_id and source = 'security_kept'
   returning attachment_path into v_path;
  perform set_config('unveiled.payments', 'off', true);

  update invoice_payments
     set security_settled_on = null, security_kept = null, security_note = null
   where invoice_id = p_id;
  return v_path;
end;
$$;

-- ── Cancelled bookings ────────────────────────────────────────────────────────

-- Not a void: the invoice was valid and she keeps the money. It only says no final
-- will follow. An unpaid deposit from a client who disappeared is voided instead.
create function close_booking(p_id uuid, p_closed_on date, p_reason text)
returns invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invoices;
  pay invoice_payments;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can close bookings.' using errcode = '42501';
  end if;
  select * into inv from invoices where id = p_id;
  if not found or inv.kind <> 'deposit' then
    raise exception 'Only a deposit invoice has a booking to close.';
  end if;
  select * into pay from invoice_payments where invoice_id = p_id for update;
  if not found then
    raise exception 'Only a paid deposit can be closed. Void an unpaid one instead.';
  end if;
  if pay.booking_closed_on is not null then
    raise exception 'This booking is already closed.';
  end if;
  if exists (select 1 from invoices where deposit_invoice_id = p_id and kind = 'final' and status = 'issued') then
    raise exception 'This booking already has a final invoice.';
  end if;
  if p_closed_on is null or p_closed_on > (now() at time zone 'Asia/Singapore')::date then
    raise exception 'The date can''t be in the future.';
  end if;

  update invoice_payments
     set booking_closed_on = p_closed_on, booking_closed_reason = nullif(btrim(p_reason), '')
   where invoice_id = p_id
   returning * into pay;
  return pay;
end;
$$;

create function reopen_booking(p_id uuid)
returns invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  pay invoice_payments;
begin
  if not is_app_owner() then
    raise exception 'Only the owner can reopen bookings.' using errcode = '42501';
  end if;
  update invoice_payments
     set booking_closed_on = null, booking_closed_reason = null
   where invoice_id = p_id and booking_closed_on is not null
   returning * into pay;
  if not found then
    raise exception 'That booking isn''t closed.';
  end if;
  return pay;
end;
$$;
