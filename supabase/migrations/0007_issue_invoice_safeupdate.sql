-- Fixes issue_invoice() from 0006, which failed from the app with
-- "UPDATE requires a WHERE clause".
--
-- Supabase loads pg-safeupdate for requests that come through its API. It refuses
-- any UPDATE or DELETE without a WHERE clause, as a guard against wiping a whole
-- table by accident, and that includes statements inside functions the API calls.
-- The counter update had no WHERE because invoice_counter only ever has one row.
-- The SQL editor doesn't load pg-safeupdate, which is why the 0006 check script
-- passed there.
--
-- The only change from 0006 is "where id" on the counter update. Replacing the
-- function keeps its owner, security definer and grants. Nothing else in 0006
-- updates or deletes without a WHERE.

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
  -- "where id" matches the table's only row (id is always true); see the top of 0007.
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
