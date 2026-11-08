-- Checks for the payment rows and service library in 0009. Not a migration: run it
-- by hand in the Supabase SQL editor after applying 0009, or whenever they change.
--
-- Same shape as 0006_invoice_checks.sql: one transaction, rolled back at the end,
-- so it leaves no rows behind and the counter goes back to where it was. Success
-- ends with one result row, "Invoice payment checks passed".

begin;

insert into app_owners (email, note) values ('checks@example.invalid', 'rolled back');

do $$
declare
  v_start int;
  r       invoices;
  v_id    uuid;
  n       int;
  -- What src/lib/invoiceTotals.ts produces for each case below.
  full_rows   constant jsonb := '[{"label":"Amount Payable Now","amount":800,"bold":true}]';
  dep_rows    constant jsonb := '[{"label":"Subtotal","amount":800,"bold":false},
                                  {"label":"Balance due later","amount":-500,"bold":false},
                                  {"label":"Amount Payable Now","amount":300,"bold":true}]';
  rental_rows constant jsonb := '[{"label":"Subtotal","amount":800,"bold":false},
                                  {"label":"Less: deposit paid","amount":-400,"bold":false},
                                  {"label":"Refundable security deposit","amount":400,"bold":false},
                                  {"label":"Amount Payable Now","amount":800,"bold":true}]';
begin
  perform set_config('request.jwt.claims', '{"email": "checks@example.invalid"}', true);
  select next_no into v_start from invoice_counter;

  -- ── Full payment: no rows, payable is the subtotal ──────────────────────────
  v_id := save_invoice_draft(null,
    '{"template":"bespoke","kind":"full","client_name":"Check Bride"}',
    '[{"title":"Bespoke veil","quantity":1,"unit_amount":800}]');
  r := issue_invoice(v_id, 800, full_rows);
  if r.status <> 'issued' or r.subtotal <> 800 or r.amount_payable <> 800 then
    raise exception 'full payment: expected issued 800/800, got % %/%', r.status, r.subtotal, r.amount_payable;
  end if;

  -- A row with no line_type is a service line, as the old app sends them.
  select count(*) into n from invoice_line_items where invoice_id = v_id and line_type = 'service';
  if n <> 1 then raise exception 'a line saved without line_type should be a service line'; end if;

  -- ── Deposit of any size, with a deduction row ───────────────────────────────
  v_id := save_invoice_draft(null,
    '{"template":"bespoke","kind":"deposit","client_name":"Check Bride"}',
    '[{"title":"Bespoke veil","quantity":1,"unit_amount":800},
      {"title":"Balance due later","quantity":1,"unit_amount":500,"line_type":"deduct"}]');

  -- The screen showing a payable the rows don't add up to is refused, even when
  -- the subtotal is right, and the failed attempt doesn't use up a number.
  select next_no into n from invoice_counter;
  begin
    perform issue_invoice(v_id, 800, full_rows);
    raise exception 'issue_invoice accepted a payable the rows do not add up to';
  exception when raise_exception then
    if sqlerrm not like 'The invoice adds up to%' then raise; end if;
  end;
  if (select next_no from invoice_counter) <> n then
    raise exception 'a refused issue used up a number';
  end if;

  -- Payment rows don't count towards the subtotal.
  begin
    perform issue_invoice(v_id, 300, dep_rows);
    raise exception 'issue_invoice counted a payment row in the subtotal';
  exception when raise_exception then
    if sqlerrm not like 'The line items add up to%' then raise; end if;
  end;

  r := issue_invoice(v_id, 800, dep_rows);
  if r.amount_payable <> 300 then
    raise exception 'deposit: expected 300 payable, got %', r.amount_payable;
  end if;
  if (r.totals -> 1 ->> 'amount')::numeric <> -500 then
    raise exception 'deposit: the negative row was not stored';
  end if;

  -- ── Rental final: a deduction and a refundable deposit ──────────────────────
  v_id := save_invoice_draft(null,
    '{"template":"rental","kind":"final","client_name":"Check Bride"}',
    '[{"title":"Veil rental","quantity":1,"unit_amount":800},
      {"title":"Less: deposit paid","quantity":1,"unit_amount":400,"line_type":"deduct"},
      {"title":"Refundable security deposit","quantity":1,"unit_amount":400,"line_type":"add"}]');
  r := issue_invoice(v_id, 800, rental_rows);
  if r.subtotal <> 800 or r.amount_payable <> 800 then
    raise exception 'rental final: expected 800/800, got %/%', r.subtotal, r.amount_payable;
  end if;

  -- Payment rows are frozen with their invoice.
  begin
    update invoice_line_items set unit_amount = 1 where invoice_id = v_id and line_type = 'add';
    raise exception 'an issued invoice''s payment row was changed';
  exception when raise_exception then
    if sqlerrm not like 'The lines of an issued invoice%' then raise; end if;
  end;

  -- ── Things that must be refused ─────────────────────────────────────────────

  -- Nothing left to pay.
  v_id := save_invoice_draft(null,
    '{"template":"bespoke","kind":"final","client_name":"Check Bride"}',
    '[{"title":"Bespoke veil","quantity":1,"unit_amount":800},
      {"title":"Less: deposit paid","quantity":1,"unit_amount":800,"line_type":"deduct"}]');
  begin
    perform issue_invoice(v_id, 800, '[{"label":"Amount Payable Now","amount":0,"bold":true}]');
    raise exception 'issue_invoice accepted a payable of zero';
  exception when raise_exception then
    if sqlerrm not like 'The amount payable must be above zero%' then raise; end if;
  end;

  -- A payment row needs a label and an amount.
  v_id := save_invoice_draft(null,
    '{"template":"bespoke","kind":"final","client_name":"Check Bride"}',
    '[{"title":"Bespoke veil","quantity":1,"unit_amount":800},
      {"title":"","quantity":1,"unit_amount":100,"line_type":"deduct"}]');
  begin
    perform issue_invoice(v_id, 800, '[{"label":"Amount Payable Now","amount":700,"bold":true}]');
    raise exception 'issue_invoice accepted an unlabelled payment row';
  exception when raise_exception then
    if sqlerrm not like 'Every line item and payment row%' then raise; end if;
  end;

  -- Payment rows alone aren't an invoice.
  v_id := save_invoice_draft(null,
    '{"template":"bespoke","kind":"full","client_name":"Check Bride"}',
    '[{"title":"Refundable security deposit","quantity":1,"unit_amount":100,"line_type":"add"}]');
  begin
    perform issue_invoice(v_id, 0, '[{"label":"Amount Payable Now","amount":100,"bold":true}]');
    raise exception 'issue_invoice accepted an invoice with no service lines';
  exception when raise_exception then
    if sqlerrm not like 'Add at least one line%' then raise; end if;
  end;

  -- A payment row is always a single row.
  begin
    perform save_invoice_draft(v_id,
      '{"template":"bespoke","kind":"full","client_name":"Check Bride"}',
      '[{"title":"Security","quantity":2,"unit_amount":100,"line_type":"add"}]');
    raise exception 'a payment row was saved with a quantity above 1';
  exception when check_violation then
    null;
  end;

  -- An unknown invoice type or row type.
  begin
    insert into invoices (template, kind) values ('rental', 'instalment');
    raise exception 'an unknown invoice type was accepted';
  exception when check_violation then
    null;
  end;
  begin
    perform save_invoice_draft(v_id,
      '{"template":"bespoke","kind":"full","client_name":"Check Bride"}',
      '[{"title":"Discount","quantity":1,"unit_amount":100,"line_type":"mystery"}]');
    raise exception 'an unknown row type was accepted';
  exception when check_violation then
    null;
  end;

  -- ── Service library ─────────────────────────────────────────────────────────
  insert into invoice_services (title, description) values ('Veil cleaning', 'Dry clean') ;
  insert into invoice_services (title, default_amount) values ('Blusher', 120.50);
  begin
    insert into invoice_services (title) values ('   ');
    raise exception 'a service with a blank title was accepted';
  exception when check_violation then
    null;
  end;
  begin
    insert into invoice_services (title, default_amount) values ('Free', 0);
    raise exception 'a service with a zero price was accepted';
  exception when check_violation then
    null;
  end;

  -- Three invoices issued above, no gaps.
  select next_no into n from invoice_counter;
  if n <> v_start + 3 then raise exception 'counter: expected %, got %', v_start + 3, n; end if;
end;
$$;

-- Only reached if every check above passed.
select 'Invoice payment checks passed' as result;

rollback;
