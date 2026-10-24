-- P&L: the transaction ledger, plus the monthly and IRAS totals computed from it.
-- Replaces the "Transactions", "Monthly Summary" and "IRAS 4-Line Statement" tabs
-- in the Google Sheet. Starts empty: the Sheet's rows are not imported.

create table transactions (
  id               uuid primary key default gen_random_uuid(),
  -- A calendar date as Esther enters it, already in Singapore time. The default
  -- is only for rows added by hand in the SQL editor (see 0004 for why it isn't
  -- current_date).
  transaction_date date not null default ((now() at time zone 'Asia/Singapore')::date),
  type             text not null check (type in ('Income', 'Expense')),
  -- Always positive: type says which way the money moved, so a sign can't
  -- disagree with it.
  amount           numeric(12,2) not null check (amount > 0),
  category         text,
  description      text not null,
  payment_method   text,
  -- The name as it was on the day. Kept even when client_id is set, and the only
  -- name for walk-ins and suppliers who aren't in the client tracker.
  client_name      text,
  -- restrict: a client with money recorded against them can't be deleted by
  -- accident. The app archives clients rather than deleting them.
  client_id        uuid references clients(id) on delete restrict,
  reference_no     text,   -- receipt or invoice number; not unique, supplier receipts can repeat
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index transactions_date_idx on transactions (transaction_date);
-- Postgres does not index foreign keys automatically.
create index transactions_client_id_idx on transactions (client_id) where client_id is not null;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

alter table transactions enable row level security;

create policy owners_all_transactions on transactions
  for all using (is_app_owner()) with check (is_app_owner());

-- ── Totals ────────────────────────────────────────────────────────────────────
--
-- Functions rather than views on purpose. A view runs with its creator's rights
-- by default, which on Supabase skips RLS and would show every transaction to
-- anyone holding the public anon key. These functions are security invoker (the
-- default), so they see exactly the rows the caller's RLS allows: everything for
-- an owner, nothing for anyone else.
--
-- Each one covers one calendar year. The range test on transaction_date can use
-- the index; extract(year from ...) = p_year could not.

-- Months 1-12 (zeros for empty months), then one year-total row with month = null.
-- profit_margin is a fraction (0.25 = 25%), 0 when there is no income.
create function pnl_monthly(p_year int)
returns table (month int, income numeric, expenses numeric, net_profit numeric, profit_margin numeric)
language sql
stable
set search_path = public
as $$
  with months as (
    select generate_series(1, 12) as m
  ),
  tx as (
    select extract(month from transaction_date)::int as m, type, amount
    from transactions
    where transaction_date >= make_date(p_year, 1, 1)
      and transaction_date <  make_date(p_year + 1, 1, 1)
  ),
  -- rollup adds the year-total row, so even the totals are summed here.
  sums as (
    select months.m,
           coalesce(sum(tx.amount) filter (where tx.type = 'Income'), 0)  as inc,
           coalesce(sum(tx.amount) filter (where tx.type = 'Expense'), 0) as exp
    from months
    left join tx on tx.m = months.m
    group by rollup (months.m)
  )
  select m, inc, exp, inc - exp,
         case when inc > 0 then round((inc - exp) / inc, 4) else 0 end
  from sums
  order by m nulls last;
$$;

-- The IRAS Form B/B1 4-line statement for one calendar year. This is a reporting
-- aid, not tax advice. It keeps the Google Sheet's treatment exactly:
--   revenue            = every Income row
--   gross profit       = revenue (no cost of sales deducted)
--   allowable expenses = every Expense row
--   adjusted profit    = revenue - allowable expenses
-- Changing how anything is treated needs Esther's sign-off.
create function iras_summary(p_year int)
returns table (revenue numeric, gross_profit numeric, allowable_expenses numeric, adjusted_profit numeric)
language sql
stable
set search_path = public
as $$
  with sums as (
    select coalesce(sum(amount) filter (where type = 'Income'), 0)  as rev,
           coalesce(sum(amount) filter (where type = 'Expense'), 0) as exp
    from transactions
    where transaction_date >= make_date(p_year, 1, 1)
      and transaction_date <  make_date(p_year + 1, 1, 1)
  )
  select rev, rev, exp, rev - exp from sums;
$$;

-- Years that have at least one transaction, newest first. Fills the year pickers.
create function transaction_years()
returns table (year int)
language sql
stable
set search_path = public
as $$
  select distinct extract(year from transaction_date)::int as y
  from transactions
  order by y desc;
$$;
