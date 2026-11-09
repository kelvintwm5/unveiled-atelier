-- Checks for payments, security deposits and closed bookings in 0011. Not a
-- migration: run it by hand in the Supabase SQL editor after applying 0011, or
-- whenever they change.
--
-- Same shape as 0009_invoice_payment_checks.sql: one transaction, rolled back at the
-- end, so it leaves no rows behind and the counter goes back to where it was.
-- Success ends with one result row, "Payment checks passed".

begin;

insert into app_owners (email, note) values ('checks@example.invalid', 'rolled back');

-- Saves and issues an invoice. p_payable goes in the last totals row, which is the
-- only one issue_invoice() reads.
create function pg_temp.issued(p_invoice jsonb, p_lines jsonb, p_subtotal numeric, p_payable numeric)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  v_id := save_invoice_draft(null, '{"template":"rental","client_name":"Check Bride"}'::jsonb || p_invoice, p_lines);
  perform issue_invoice(v_id, p_subtotal, jsonb_build_array(jsonb_build_object('label', 'Amount Payable Now', 'amount', p_payable, 'bold', true)));
  return v_id;
end;
$$;

-- Runs a statement that must fail, with this text in its message.
create function pg_temp.refuses(p_sql text, p_message text)
returns void language plpgsql as $$
declare
  v_error text;
begin
  begin
    execute p_sql;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null then
    raise exception 'Should have been refused: %', p_sql;
  end if;
  if v_error not like '%' || p_message || '%' then
    raise exception 'Refused for the wrong reason: % (%)', p_sql, v_error;
  end if;
end;
$$;

do $$
declare
  v_today  date := (now() at time zone 'Asia/Singapore')::date;
  v_year   int  := extract(year from (now() at time zone 'Asia/Singapore'))::int;
  v_base   numeric;
  v_rev    numeric;
  v_no     int;
  v_dep    uuid;
  v_final  uuid;
  v_only   uuid;
  v_draft  uuid;
  v_tx     uuid;
  pay      invoice_payments;
  tx       transactions;
  n        int;
  veil     constant text := '{"title":"Veil","quantity":1,"unit_amount":800}';
  sec_row  constant text := '{"title":"Refundable security deposit","quantity":1,"unit_amount":50,"line_type":"add"}';
  balance  constant text := '{"title":"Balance due later","quantity":1,"unit_amount":500,"line_type":"deduct"}';
begin
  perform set_config('request.jwt.claims', '{"email": "checks@example.invalid"}', true);
  select revenue into v_base from iras_summary(v_year);

  -- ── The split ───────────────────────────────────────────────────────────────
  -- $800 veil, $300 deposit, $50 security: $350 payable.
  v_dep := pg_temp.issued('{"kind":"deposit"}', ('[' || veil || ',' || balance || ',' || sec_row || ']')::jsonb, 800, 350);
  pay := record_invoice_payment(v_dep, v_today, 'PayNow');
  if pay.price_amount <> 300 or pay.security_amount <> 50 then
    raise exception 'split: expected 300 and 50, got % and %', pay.price_amount, pay.security_amount;
  end if;

  select * into tx from transactions where invoice_id = v_dep and source = 'invoice_payment';
  if not found or tx.amount <> 300 or tx.type <> 'Income' or tx.transaction_date <> v_today or tx.payment_method <> 'PayNow' then
    raise exception 'the Income row is wrong or missing';
  end if;
  v_tx := tx.id;

  select revenue into v_rev from iras_summary(v_year);
  if v_rev <> v_base + 300 then
    raise exception 'IRAS revenue should rise by the price only, not the security deposit: % to %', v_base, v_rev;
  end if;

  perform pg_temp.refuses(format('select record_invoice_payment(%L, %L, null)', v_dep, v_today), 'already marked paid');

  -- ── Payment dates and states ────────────────────────────────────────────────
  v_only := pg_temp.issued('{"kind":"full"}', ('[' || veil || ']')::jsonb, 800, 800);
  perform pg_temp.refuses(format('select record_invoice_payment(%L, %L, null)', v_only, v_today + 1), 'future');
  perform void_invoice(v_only, 'check');
  perform pg_temp.refuses(format('select record_invoice_payment(%L, %L, null)', v_only, v_today), 'Only an issued invoice');

  -- ── A paid invoice can't be voided or reissued ──────────────────────────────
  perform pg_temp.refuses(format('select void_invoice(%L, null)', v_dep), 'marked paid');

  select next_no into v_no from invoice_counter;
  v_draft := save_invoice_draft(null,
    format('{"template":"rental","kind":"deposit","client_name":"Check Bride","replaces_invoice_id":"%s"}', v_dep)::jsonb,
    ('[' || veil || ',' || balance || ']')::jsonb);
  perform pg_temp.refuses(
    format('select issue_invoice(%L, 800, %L::jsonb)', v_draft, '[{"label":"Amount Payable Now","amount":300,"bold":true}]'),
    'marked paid');
  if (select next_no from invoice_counter) <> v_no then
    raise exception 'a refused reissue used up a number';
  end if;

  -- ── Linked transactions ─────────────────────────────────────────────────────
  perform pg_temp.refuses(format('delete from transactions where id = %L', v_tx), 'Undo it on the invoice');
  perform pg_temp.refuses(format('update transactions set amount = 1 where id = %L', v_tx), 'Undo it on the invoice');
  perform pg_temp.refuses(format('update transactions set transaction_date = %L where id = %L', v_today - 1, v_tx), 'Undo it on the invoice');
  perform pg_temp.refuses(format('update transactions set type = %L where id = %L', 'Expense', v_tx), 'Undo it on the invoice');
  perform pg_temp.refuses(format('update transactions set source = null, invoice_id = null where id = %L', v_tx), 'Only recording a payment');
  perform pg_temp.refuses(
    format($q$insert into transactions (type, amount, description, invoice_id, source) values ('Income', 1, 'x', %L, 'invoice_payment')$q$, v_only),
    'Only recording a payment');

  update transactions set notes = 'still editable' where id = v_tx;
  if (select notes from transactions where id = v_tx) <> 'still editable' then
    raise exception 'notes on a linked transaction should stay editable';
  end if;

  -- ── The security deposit: keeping some ──────────────────────────────────────
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 51, %L)', v_dep, v_today, 'too much'), 'between');
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 20, %L)', v_dep, v_today, '  '), 'why');
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 20, %L)', v_dep, v_today + 1, 'tear'), 'future');
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 20, %L)', v_dep, v_today - 1, 'tear'), 'before the deposit');

  pay := settle_security_deposit(v_dep, v_today, 20, 'Tear in the lace');
  if pay.security_kept <> 20 or pay.security_settled_on <> v_today or pay.security_note <> 'Tear in the lace' then
    raise exception 'settling did not record the outcome';
  end if;
  select * into tx from transactions where invoice_id = v_dep and source = 'security_kept';
  if not found or tx.amount <> 20 or tx.type <> 'Income' or tx.notes <> 'Tear in the lace' then
    raise exception 'the kept deposit should be an Income row of 20';
  end if;

  select revenue into v_rev from iras_summary(v_year);
  if v_rev <> v_base + 320 then
    raise exception 'IRAS revenue should include the amount kept: expected %, got %', v_base + 320, v_rev;
  end if;

  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 0, null)', v_dep, v_today), 'already been settled');
  perform pg_temp.refuses(format('select undo_invoice_payment(%L)', v_dep), 'security deposit first');

  perform undo_security_settlement(v_dep);
  if exists (select 1 from transactions where invoice_id = v_dep and source = 'security_kept') then
    raise exception 'undoing the settlement should remove the Income row';
  end if;

  -- ── The security deposit: returned in full ──────────────────────────────────
  pay := settle_security_deposit(v_dep, v_today, 0, null);
  if pay.security_kept <> 0 then raise exception 'returned in full should keep 0'; end if;
  if exists (select 1 from transactions where invoice_id = v_dep and source = 'security_kept') then
    raise exception 'a deposit returned in full must not reach Transactions';
  end if;
  perform undo_security_settlement(v_dep);

  -- ── Closing a booking ───────────────────────────────────────────────────────
  perform pg_temp.refuses(format('select close_booking(%L, %L, null)', v_only, v_today), 'Only a deposit');
  pay := close_booking(v_dep, v_today, 'Client cancelled');
  if pay.booking_closed_on <> v_today then raise exception 'close_booking did not record the date'; end if;
  if not exists (select 1 from transactions where invoice_id = v_dep and source = 'invoice_payment') then
    raise exception 'closing a booking must keep the income';
  end if;
  perform pg_temp.refuses(format('select close_booking(%L, %L, null)', v_dep, v_today), 'already closed');
  perform pg_temp.refuses(format('select undo_invoice_payment(%L)', v_dep), 'Reopen');
  perform reopen_booking(v_dep);
  perform pg_temp.refuses(format('select reopen_booking(%L)', v_dep), 'isn''t closed');

  -- ── Undoing a payment ───────────────────────────────────────────────────────
  perform undo_invoice_payment(v_dep);
  if exists (select 1 from invoice_payments where invoice_id = v_dep)
     or exists (select 1 from transactions where invoice_id = v_dep) then
    raise exception 'undoing a payment should remove the payment and its Income row';
  end if;
  perform pg_temp.refuses(format('select undo_invoice_payment(%L)', v_dep), 'isn''t marked paid');
  perform pg_temp.refuses(format('select close_booking(%L, %L, null)', v_dep, v_today), 'Only a paid deposit');

  select revenue into v_rev from iras_summary(v_year);
  if v_rev <> v_base then
    raise exception 'after undoing everything, IRAS revenue should be back to %, got %', v_base, v_rev;
  end if;

  -- ── A final that only collects a security deposit ───────────────────────────
  perform record_invoice_payment(v_dep, v_today, null);
  v_final := pg_temp.issued(
    format('{"kind":"final","deposit_invoice_id":"%s"}', v_dep)::jsonb,
    ('[' || veil || ',{"title":"Less: deposit paid","quantity":1,"unit_amount":800,"line_type":"deduct"},' || sec_row || ']')::jsonb,
    800, 50);
  pay := record_invoice_payment(v_final, v_today, null);
  if pay.price_amount <> 0 or pay.security_amount <> 50 then
    raise exception 'security-only final: expected 0 and 50, got % and %', pay.price_amount, pay.security_amount;
  end if;
  select count(*) into n from transactions where invoice_id = v_final;
  if n <> 0 then raise exception 'a security-only payment must not reach Transactions'; end if;

  perform pg_temp.refuses(format('select close_booking(%L, %L, null)', v_dep, v_today), 'already has a final');

  -- A paid invoice with no security deposit has nothing to settle.
  v_only := pg_temp.issued('{"kind":"full"}', ('[' || veil || ']')::jsonb, 800, 800);
  perform record_invoice_payment(v_only, v_today, null);
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 0, null)', v_only, v_today), 'no security deposit');

  -- ── Hand-entered rows are untouched ─────────────────────────────────────────
  insert into transactions (type, amount, description) values ('Expense', 10, 'Thread') returning id into v_tx;
  update transactions set amount = 12 where id = v_tx;
  delete from transactions where id = v_tx;

  -- ── Access ──────────────────────────────────────────────────────────────────
  if not exists (select 1 from pg_policies where tablename = 'invoice_payments' and policyname = 'owners_read_invoice_payments') then
    raise exception 'invoice_payments should have its read policy';
  end if;
  if (select count(*) from pg_policies where tablename = 'invoice_payments') <> 1 then
    raise exception 'invoice_payments should have no write policies';
  end if;

  perform set_config('request.jwt.claims', '{"email": "stranger@example.invalid"}', true);
  perform pg_temp.refuses(format('select record_invoice_payment(%L, %L, null)', v_dep, v_today), 'Only the owner');
  perform pg_temp.refuses(format('select undo_invoice_payment(%L)', v_dep), 'Only the owner');
  perform pg_temp.refuses(format('select settle_security_deposit(%L, %L, 0, null)', v_dep, v_today), 'Only the owner');
  perform pg_temp.refuses(format('select undo_security_settlement(%L)', v_dep), 'Only the owner');
  perform pg_temp.refuses(format('select close_booking(%L, %L, null)', v_dep, v_today), 'Only the owner');
  perform pg_temp.refuses(format('select reopen_booking(%L)', v_dep), 'Only the owner');
end;
$$;

-- Only reached if every check above passed.
select 'Payment checks passed' as result;

rollback;
