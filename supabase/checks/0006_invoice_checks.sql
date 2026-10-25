-- Checks for the invoice tables and functions in 0006. Not a migration: run it by
-- hand in the Supabase SQL editor after applying 0006, or whenever they change.
--
-- Everything happens inside one transaction that is rolled back at the end, so it
-- leaves no rows behind and the counter goes back to where it was. A failed check
-- stops the script with an error that says which one. Success ends with one result
-- row, "Invoice checks passed". (The SQL editor shows only the last statement's
-- result and doesn't display notices, so the result is a row, not a notice.)
--
-- issue_invoice() checks is_app_owner(), so the script makes a throwaway owner and
-- pretends to be signed in as them (request.jwt.claims is where Supabase puts the
-- signed-in user's token). The SQL editor's admin role skips RLS, so this checks
-- the numbering and the freezing, not the browser's access.

begin;

insert into app_owners (email, note) values ('checks@example.invalid', 'rolled back');

do $$
declare
  v_start  int;
  v_year   text := to_char(now() at time zone 'Asia/Singapore', 'YYYY');
  dep      invoices;
  fin      invoices;
  rep      invoices;
  r        invoices;
  v_id     uuid;
  n        int;
  -- What src/lib/invoiceTotals.ts produces for a S$1,000.00 subtotal.
  dep_rows constant jsonb := '[{"label":"Subtotal","amount":1000,"bold":false},
                               {"label":"Booking Deposit Required (50%)","amount":500,"bold":false},
                               {"label":"Amount Payable Now","amount":500,"bold":true}]';
  fin_rows constant jsonb := '[{"label":"Remaining Balance (50%)","amount":500,"bold":false},
                               {"label":"Security Deposit (Refundable)","amount":500,"bold":false},
                               {"label":"Amount Payable Now","amount":1000,"bold":true}]';
begin
  perform set_config('request.jwt.claims', '{"email": "checks@example.invalid"}', true);
  select next_no into v_start from invoice_counter;

  -- ── Year boundary ───────────────────────────────────────────────────────────
  -- 15:59 UTC on 31 Dec is 23:59 in Singapore; 16:00 UTC is already New Year there.
  if invoice_number(1821, '2026-12-31 15:59:00+00') <> 'UA-2026-1821' then
    raise exception 'invoice_number: 23:59 SGT on 31 Dec should still be 2026';
  end if;
  if invoice_number(1821, '2026-12-31 23:30:00+00') <> 'UA-2027-1821' then
    raise exception 'invoice_number: 31 Dec 23:30 UTC is 1 Jan in Singapore, so 2027';
  end if;
  if invoice_number(12345, '2026-06-01 00:00:00+00') <> 'UA-2026-12345' then
    raise exception 'invoice_number: a 5-digit number should not be cut';
  end if;

  -- ── A deposit draft, issued ─────────────────────────────────────────────────
  insert into invoices (template, kind, client_name) values ('rental', 'deposit', 'Check Bride')
    returning * into dep;
  insert into invoice_line_items (invoice_id, position, title, quantity, unit_amount) values
    (dep.id, 0, 'Veil rental', 2, 400.00),
    (dep.id, 1, 'Blusher',     1, 200.00);

  -- A subtotal that disagrees with the lines is refused, and the failed attempt
  -- doesn't use up a number.
  begin
    perform issue_invoice(dep.id, 999.99, dep_rows);
    raise exception 'issue_invoice accepted the wrong subtotal';
  exception when raise_exception then
    if sqlerrm not like 'The line items add up to%' then raise; end if;
  end;
  select next_no into n from invoice_counter;
  if n <> v_start then raise exception 'a failed issue used up number %', v_start; end if;

  -- The browser can't number a draft itself, even through a plain UPDATE.
  begin
    update invoices set status = 'issued' where id = dep.id;
    raise exception 'a draft was issued without issue_invoice()';
  exception when raise_exception then
    if sqlerrm not like 'A draft can only be issued%' then raise; end if;
  end;

  dep := issue_invoice(dep.id, 1000.00, dep_rows);
  if dep.invoice_no <> 'UA-' || v_year || '-' || v_start::text then
    raise exception 'first issue: expected number %, got %', v_start, dep.invoice_no;
  end if;
  if (dep.status, dep.subtotal, dep.amount_payable) is distinct from ('issued'::text, 1000.00::numeric, 500.00::numeric) then
    raise exception 'first issue: got status %, subtotal %, payable %', dep.status, dep.subtotal, dep.amount_payable;
  end if;
  if dep.issued_on <> (now() at time zone 'Asia/Singapore')::date then
    raise exception 'issued_on should be today in Singapore, got %', dep.issued_on;
  end if;
  if dep.business_snapshot is null or not dep.business_snapshot ? 'paynow' then
    raise exception 'business_snapshot was not copied from invoice_settings';
  end if;

  -- ── Issued means frozen ────────────────────────────────────────────────────
  begin
    update invoices set client_name = 'Someone Else' where id = dep.id;
    raise exception 'an issued invoice was edited';
  exception when raise_exception then
    if sqlerrm not like '%can''t be changed%' then raise; end if;
  end;
  begin
    update invoice_line_items set unit_amount = 1 where invoice_id = dep.id;
    raise exception 'a line of an issued invoice was edited';
  exception when raise_exception then
    if sqlerrm not like '%issued invoice can''t be changed%' then raise; end if;
  end;
  begin
    insert into invoice_line_items (invoice_id, position, title, unit_amount) values (dep.id, 9, 'Extra', 1);
    raise exception 'a line was added to an issued invoice';
  exception when raise_exception then
    if sqlerrm not like 'Lines can only be added to a draft%' then raise; end if;
  end;
  begin
    delete from invoice_line_items where invoice_id = dep.id;
    raise exception 'a line of an issued invoice was deleted';
  exception when raise_exception then
    if sqlerrm not like '%issued invoice can''t be changed%' then raise; end if;
  end;
  begin
    delete from invoices where id = dep.id;
    raise exception 'an issued invoice was deleted';
  exception when raise_exception then
    if sqlerrm not like '%can''t be deleted%' then raise; end if;
  end;
  begin
    perform issue_invoice(dep.id, 1000.00, dep_rows);
    raise exception 'an invoice was issued twice';
  exception when raise_exception then
    if sqlerrm not like '%already been issued%' then raise; end if;
  end;

  -- The PDF path is set once, and only once the file is in Storage.
  begin
    perform attach_invoice_pdf(dep.id, dep.invoice_no || '.pdf');
    raise exception 'a PDF path was recorded with no file in Storage';
  exception when raise_exception then
    if sqlerrm not like '%hasn''t finished uploading%' then raise; end if;
  end;
  update invoices set pdf_path = dep.invoice_no || '.pdf' where id = dep.id;
  begin
    update invoices set pdf_path = 'other.pdf' where id = dep.id;
    raise exception 'a stored PDF path was replaced';
  exception when raise_exception then
    if sqlerrm not like '%already stored%' then raise; end if;
  end;

  -- ── A final from that deposit takes the next number ────────────────────────
  insert into invoices (template, kind, client_name, deposit_invoice_id)
    values ('rental', 'final', 'Check Bride', dep.id) returning * into fin;
  insert into invoice_line_items (invoice_id, position, title, quantity, unit_amount)
    select fin.id, position, title, quantity, unit_amount from invoice_line_items where invoice_id = dep.id;
  fin := issue_invoice(fin.id, 1000.00, fin_rows);
  if fin.invoice_no <> 'UA-' || v_year || '-' || (v_start + 1)::text then
    raise exception 'second issue: expected number %, got %', v_start + 1, fin.invoice_no;
  end if;
  if fin.amount_payable <> 1000.00 then
    raise exception 'rental final: payable should be the subtotal, got %', fin.amount_payable;
  end if;

  -- A second live final against the same deposit is refused.
  insert into invoices (template, kind, client_name, deposit_invoice_id)
    values ('rental', 'final', 'Check Bride', dep.id) returning id into v_id;
  insert into invoice_line_items (invoice_id, position, title, unit_amount) values (v_id, 0, 'Veil', 1000);
  begin
    perform issue_invoice(v_id, 1000.00, fin_rows);
    raise exception 'two finals were issued against one deposit';
  exception when unique_violation then null;
  end;
  delete from invoices where id = v_id;   -- a draft can be deleted, lines and all

  -- ── Void & reissue ─────────────────────────────────────────────────────────
  insert into invoices (template, kind, client_name, deposit_invoice_id, replaces_invoice_id)
    values ('rental', 'final', 'Check Bride (corrected)', dep.id, fin.id) returning * into rep;
  insert into invoice_line_items (invoice_id, position, title, unit_amount) values (rep.id, 0, 'Veil rental', 1000);
  rep := issue_invoice(rep.id, 1000.00, fin_rows);
  select * into r from invoices where id = fin.id;
  if r.status <> 'void' or r.voided_at is null then
    raise exception 'void & reissue: the replaced invoice should be void, got %', r.status;
  end if;
  select count(*) into n from invoices where replaces_invoice_id = fin.id and id = rep.id and status = 'issued';
  if n <> 1 then raise exception 'void & reissue: the replacement should point back at %', fin.invoice_no; end if;
  if rep.invoice_no <> 'UA-' || v_year || '-' || (v_start + 2)::text then
    raise exception 'third issue: expected number %, got %', v_start + 2, rep.invoice_no;
  end if;
  begin
    update invoices set status = 'issued' where id = fin.id;
    raise exception 'a void invoice came back to life';
  exception when raise_exception then
    if sqlerrm not like '%can''t go back%' then raise; end if;
  end;

  -- Voiding without a replacement, e.g. a cancelled booking.
  r := void_invoice(rep.id, 'Booking cancelled');
  if (r.status, r.void_reason) is distinct from ('void'::text, 'Booking cancelled'::text) then
    raise exception 'void_invoice: got %, %', r.status, r.void_reason;
  end if;

  -- ── Constraints ────────────────────────────────────────────────────────────
  begin
    insert into invoices (template, kind, client_name, deposit_invoice_id) values ('rental', 'deposit', 'X', dep.id);
    raise exception 'a deposit invoice was linked to a deposit';
  exception when check_violation then null;
  end;
  begin
    insert into invoices (template, kind, client_name, invoice_no) values ('rental', 'deposit', 'X', 'UA-2026-0001');
    raise exception 'a draft was given a number';
  exception when check_violation then null;
  end;
  begin
    insert into invoices (template, kind) values ('rental', 'deposit') returning id into v_id;
    insert into invoice_line_items (invoice_id, position, title, quantity, unit_amount) values (v_id, 0, 'X', 0, 1);
    raise exception 'a quantity of 0 was accepted';
  exception when check_violation then null;
  end;

  -- An empty draft can't be issued.
  insert into invoices (template, kind, client_name) values ('bespoke', 'deposit', 'Empty') returning id into v_id;
  begin
    perform issue_invoice(v_id, 0, dep_rows);
    raise exception 'an invoice with no lines was issued';
  exception when raise_exception then
    if sqlerrm not like 'Add at least one line%' then raise; end if;
  end;

  -- Three numbers used, no gaps.
  select next_no into n from invoice_counter;
  if n <> v_start + 3 then raise exception 'counter: expected %, got %', v_start + 3, n; end if;

end;
$$;

-- Only reached if every check above passed.
select 'Invoice checks passed' as result;

rollback;
