-- Checks for the P&L functions in 0005. Not a migration: run it by hand in the
-- Supabase SQL editor after applying 0005, or whenever the functions change.
--
-- Everything happens inside one transaction that is rolled back at the end, so it
-- leaves no rows behind. The test rows are dated 1999 so they can't mix with real
-- data. A failed check stops the script with an error that says which one;
-- success ends with the notice "P&L checks passed".
--
-- The SQL editor runs as an admin role that skips RLS, so this checks the maths,
-- not access control.

begin;

-- The demo dataset (src/lib/demoData.ts), moved to 1999.
insert into transactions (transaction_date, type, description, category, amount) values
  ('1999-01-08', 'Income',  'Bridal gown package', 'Gown Sales',              3800),
  ('1999-01-12', 'Expense', 'Fabric & lace',       'Cost of Goods',            520),
  ('1999-01-18', 'Income',  'Gown alteration',     'Alteration Services',      280),
  ('1999-01-25', 'Expense', 'Instagram ads',       'Marketing & Advertising',  150),
  ('1999-02-03', 'Income',  'Rental deposit',      'Deposits Received',        500),
  ('1999-02-10', 'Income',  'Veil & accessories',  'Accessories',              320),
  ('1999-02-14', 'Expense', 'Studio rental',       'Rental & Utilities',       800),
  ('1999-02-22', 'Expense', 'External tailor',     'Alterations & Tailoring',  180),
  ('1999-03-05', 'Income',  'Gown rental',         'Gown Rental',              650),
  ('1999-03-12', 'Expense', 'Garment bags',        'Packaging & Supplies',      95),
  ('1999-03-20', 'Income',  'Bridal gown',         'Gown Sales',              4200),
  ('1999-03-28', 'Expense', 'Sewing machine',      'Equipment & Tools',        120),
  ('1999-04-05', 'Income',  'Alteration bundle',   'Alteration Services',      480),
  ('1999-04-15', 'Expense', 'Accounting fees',     'Professional Services',    350),
  ('1999-05-02', 'Income',  'Gown sales',          'Gown Sales',              3500),
  -- Year boundaries: these belong to 1998 and 2000 and must not count in 1999.
  ('1998-12-31', 'Income',  'Boundary',            null,                       999),
  ('2000-01-01', 'Expense', 'Boundary',            null,                       999),
  -- Cents must add up exactly (0.10 + 0.20 is not 0.30 in JS floats).
  ('1999-06-01', 'Income',  'Cents',               null,                      0.10),
  ('1999-06-02', 'Income',  'Cents',               null,                      0.20);

do $$
declare
  r record;
  n int;
begin
  -- Monthly: 12 months plus one total row.
  select count(*) into n from pnl_monthly(1999);
  if n <> 13 then raise exception 'pnl_monthly: expected 13 rows, got %', n; end if;

  select * into r from pnl_monthly(1999) where month = 1;
  if (r.income, r.expenses, r.net_profit, r.profit_margin) is distinct from (4080::numeric, 670::numeric, 3410::numeric, 0.8358::numeric) then
    raise exception 'pnl_monthly January: got %', r;
  end if;

  -- February is a loss month: negative net and margin.
  select * into r from pnl_monthly(1999) where month = 2;
  if (r.income, r.expenses, r.net_profit, r.profit_margin) is distinct from (820::numeric, 980::numeric, -160::numeric, -0.1951::numeric) then
    raise exception 'pnl_monthly February: got %', r;
  end if;

  select * into r from pnl_monthly(1999) where month = 6;
  if r.income <> 0.30 then raise exception 'pnl_monthly June: cents should sum to 0.30, got %', r.income; end if;

  -- An empty month is zeros, not missing and not null.
  select * into r from pnl_monthly(1999) where month = 7;
  if (r.income, r.expenses, r.net_profit, r.profit_margin) is distinct from (0::numeric, 0::numeric, 0::numeric, 0::numeric) then
    raise exception 'pnl_monthly July: expected zeros, got %', r;
  end if;

  -- Year total: the boundary rows are excluded.
  select * into r from pnl_monthly(1999) where month is null;
  if (r.income, r.expenses, r.net_profit) is distinct from (13730.30::numeric, 2215::numeric, 11515.30::numeric) then
    raise exception 'pnl_monthly total: got %', r;
  end if;

  -- IRAS: same treatment as the Google Sheet.
  select * into r from iras_summary(1999);
  if (r.revenue, r.gross_profit, r.allowable_expenses, r.adjusted_profit) is distinct from (13730.30::numeric, 13730.30::numeric, 2215::numeric, 11515.30::numeric) then
    raise exception 'iras_summary: got %', r;
  end if;

  -- A year with no data gives zeros, not an empty result.
  select * into r from iras_summary(1901);
  if (r.revenue, r.allowable_expenses, r.adjusted_profit) is distinct from (0::numeric, 0::numeric, 0::numeric) then
    raise exception 'iras_summary empty year: got %', r;
  end if;
  select count(*) into n from pnl_monthly(1901) where income <> 0 or expenses <> 0;
  if n <> 0 then raise exception 'pnl_monthly empty year: % non-zero rows', n; end if;

  select count(*) into n from transaction_years() where year in (1998, 1999, 2000);
  if n <> 3 then raise exception 'transaction_years: expected 1998, 1999 and 2000'; end if;

  -- Constraints reject bad rows.
  begin
    insert into transactions (transaction_date, type, description, amount) values ('1999-01-01', 'Income', 'Zero', 0);
    raise exception 'a zero amount was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into transactions (transaction_date, type, description, amount) values ('1999-01-01', 'Income', 'Negative', -5);
    raise exception 'a negative amount was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into transactions (transaction_date, type, description, amount) values ('1999-01-01', 'Refund', 'Bad type', 5);
    raise exception 'type ''Refund'' was accepted';
  exception when check_violation then null;
  end;

  raise notice 'P&L checks passed';
end;
$$;

rollback;
