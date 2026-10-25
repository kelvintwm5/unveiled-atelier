# AGENTS.md

Project context for coding agents (Claude Code, Codex, and others). This file is the
single source of truth for project rules. Tool-specific notes live in their own files
(e.g. `CLAUDE.md`), which import this one.

## Purpose

Unveiled Atelier is the back-office app for Esther's bridal veil business in Singapore
(sole proprietorship, files Form B/B1 with IRAS). It covers:

- **Invoicing**: deposit and final invoices for rental and bespoke veils
- **P&L**: transaction ledger, monthly summary, IRAS 4-line tax summary
- **Pricing calculator**: suggested prices from material cost and labour
- **Client tracker**: pipeline, activity log, follow-ups
- **AI chat**: questions over the business data, via the Anthropic API

There are two audiences, and both must keep working:

1. **Owner mode**: Esther signs in and works with real data.
2. **Demo mode**: portfolio visitors use fictional data with no sign-in.

The app is single-tenant: one business, one or two users. Don't add multi-tenant
abstractions (orgs, workspaces, per-user sheets).

## Current state: moving from Google Sheets to Supabase

- **Target:** Supabase Postgres is the system of record for invoices, transactions
  (P&L), and clients/activities. It starts empty. There is no import of the old
  Sheets data.
- **Legacy:** `src/lib/sheets.ts`, `src/lib/clientData.ts`, and the logging/numbering
  half of `src/lib/invoices.ts` read and write a Google Sheet through the user's
  Google OAuth token. They are being replaced one module at a time.
- **Rules during the move:**
  - Don't add new Google Sheets reads or writes.
  - When a module moves to Supabase, delete its Sheets code in the same change. Don't
    leave the two running side by side.
  - Invoices will be generated as PDFs in the app (see "Decisions"). The Google
    Docs/Drive generation code in `src/lib/invoices.ts` is legacy and goes away
    together with the Sheets code.
  - Once no Sheets, Docs or Drive code is left, remove `GOOGLE_API_SCOPES` from
    `src/lib/supabase.ts`. Google sign-in then needs only the basic profile and email
    scopes.

## Stack

| Layer      | Choice                                                                     |
|------------|----------------------------------------------------------------------------|
| UI         | React 18, Vite 5, TypeScript (strict), Tailwind CSS 3. SPA; `AppShell` switches views (no router) |
| Data       | Supabase: Postgres, Auth (Google provider), Row Level Security, Storage (issued invoice PDFs) |
| PDFs       | `@react-pdf/renderer`: the same React component (`src/components/InvoiceDocument.tsx`) draws the preview and the PDF. It is ~450 KB gzipped, so it's loaded on demand only through `src/lib/invoicePdf.ts`; never import it statically |
| Server     | Vercel serverless functions in `api/`                                      |
| AI         | `@anthropic-ai/sdk`, called only from `api/`                               |
| Hosting    | Vercel. Every push to `main` auto-deploys to production                    |

## Layout

```
api/                    Vercel serverless functions (server-side; secrets live here)
  chat.ts               Anthropic chat endpoint
src/
  App.tsx               Auth state machine: landing | demo | app
  pages/                LandingPage, AppShell (layout + view switching)
  views/                One screen per file: XxxView.tsx
  components/           Shared UI (Sidebar)
  lib/                  Data access and domain logic, one module per domain
    supabase.ts         Supabase client + Google sign-in
    demoData.ts         Demo fixtures
  types/index.ts        Shared TypeScript types
supabase/migrations/    Numbered SQL migrations (NNNN_description.sql)
create_sheet.py,        Legacy one-off scripts that built the Google Sheet. Not part
bridal_budget.py        of the app. Remove once the Sheets code is gone.
```

## Commands

```bash
npm install
npm run dev      # Vite on :5173. /api routes do NOT run here
vercel dev       # Vite plus /api functions; needed for chat
npm run build    # tsc + vite build
npm test         # Vitest, for the pure domain modules in src/lib
```

- `tsconfig.json` includes only `src/`, so `npm run build` does **not** type-check `api/`.
- Tests use Vitest and sit next to the module they test (`src/lib/xxx.test.ts`).
  Domain logic (money, invoice totals, tax lines) gets tests. There's no linter yet.
- SQL changes get a rolled-back check script in `supabase/checks/` (see
  `0006_invoice_checks.sql`), run by hand in the SQL editor after the migration.

## Architecture principles

1. **The database owns the rules money depends on.** Invoice numbers come from the
   database (a sequence or a locked counter), never from "read max + 1" in the browser.
   Invariants are encoded as `not null`, `check`, `unique` and foreign-key
   constraints. Monthly P&L and IRAS figures come from SQL views/functions, or from
   a single pure TypeScript module with tests. Never compute them inside a component.
2. **One data-access module per domain in `src/lib/`.** Views call functions such as
   `listInvoices()` or `createTransaction()`. Views never import the Supabase client
   and never call `fetch` directly. The lib module maps between DB rows (`snake_case`)
   and TS types (`camelCase`), so column names stay out of the UI.
3. **Demo mode is a data source like any other.** Every read function takes the mode.
   In demo mode it returns fixtures without touching the network. Writes in demo mode
   are either disabled or local to the session. Demo mode never touches Supabase.
4. **Access control is RLS, not UI.** Every table gets `enable row level security`
   plus policies, normally `using (is_app_owner()) with check (is_app_owner())`.
   To grant access, insert into `app_owners` from the Supabase SQL editor. The repo
   is public, so owner emails stay out of migrations (see `0003_owner_access_note.sql`).
   Don't hardcode emails in policies. A disabled button is a convenience, not a
   security control.
5. **Secrets stay server-side.** Anything prefixed `VITE_` ships to every browser.
   The Supabase anon key is public by design. The `service_role` key and
   `ANTHROPIC_API_KEY` belong only in `api/` (Vercel env vars), never in `VITE_` vars.
6. **Invoices are editable as drafts and immutable once issued.** Drafts can be
   edited freely and have no invoice number. Issuing an invoice assigns the number,
   freezes a snapshot of everything (line items, totals, client details, all text),
   and stores the PDF. To change an issued invoice, use "void & reissue": the old
   invoice is kept and marked void, with a link to its replacement. Never edit an
   issued invoice in place. A final invoice links to its deposit invoice by id.
7. **Schema changes only through migrations.** Add a new numbered file in
   `supabase/migrations/`. Never edit a migration that has already been applied, and
   never change the schema in the Supabase dashboard without capturing the change in
   a migration.
   Every `UPDATE` and `DELETE` needs a `WHERE`, even in a function and even on a
   one-row table (`where id`): Supabase's API runs pg-safeupdate, which rejects them
   otherwise. The SQL editor and local tests don't, so they won't catch it (see 0007).
8. **Stay small.** One owner, low volume. Prefer plain functions and SQL to new
   libraries. A new dependency needs a stated reason.

## Domain rules

- **Currency:** SGD only. Stored as `numeric(12,2)`. Format through one shared
  formatter. Do sums across many rows in SQL rather than in JS floats.
- **Dates and time zone:** the business runs on `Asia/Singapore`. Compute "today" in
  SGT. `new Date().toISOString().slice(0, 10)` is the UTC date, which is wrong before
  08:00 SGT. Store calendar dates as `date` and instants as `timestamptz`.
- **Identity:** reference records by `uuid` id, never by name. Two clients can share
  a name.
- **Invoice numbers:** `UA-YYYY-NNNN`. NNNN is one counter that started at 1800 and
  keeps counting across years (it doesn't reset each year). YYYY is the issue year in
  SGT. Numbers must never repeat. The last number issued from the Google Sheet was
  UA-2026-1820, so the database counter (`invoice_counter`, 0006) starts at 1821.
  Only `issue_invoice()` assigns numbers.
- **Invoice kinds:** template `rental` | `bespoke`, type `deposit` | `final`.
  - Deposit: subtotal, 50% booking deposit, amount payable = 50%.
  - Final (bespoke): remaining 50%.
  - Final (rental): remaining 50% plus a refundable security deposit equal to that
    50%, so the amount payable equals the subtotal.
  - The booking deposit is 50% rounded to the cent; the remaining balance is the
    subtotal minus that deposit, so the two invoices always add up to the subtotal.
  - The one implementation is `buildTotalsRows` in `src/lib/invoiceTotals.ts`, with
    tests. `issue_invoice()` stores its rows and checks the subtotal against the lines.
- **Invoice lifecycle:** `draft → issued → void`.
  - Draft PDFs carry a "DRAFT" watermark and no number.
  - The issued PDF is uploaded to Supabase Storage. It is the record of what the
    client received. It can also be regenerated from the issued snapshot.
- **Where custom wording goes on an invoice:**
  - The description of each line item.
  - An optional client note under the client details.
  - A terms section. It starts from the default terms for that template (rental or
    bespoke) and can be edited for each invoice.
  - Owner-editable data in the app, not code: a clause library of reusable snippets,
    the default terms, and business details (PayNow, bank, address).
  - Text formatting: plain multi-line text, where lines that start with `- ` become
    bullets. Hold off on a rich-text editor until it's clearly needed.
  - Changing the defaults never changes invoices that were already issued.
- **Who changes what:** Esther edits invoice content and settings in the app. PDF
  layout, new fields, and calculation rules are code changes.
- **IRAS 4-line statement:** one per calendar year. Revenue, gross profit (currently
  equal to revenue), allowable business expenses, adjusted profit. This is a reporting
  aid, not tax advice. Changes to how items are treated for tax need the owner's
  sign-off.
- **Client pipeline:** stages `Inquiry → Consultation → Fitting → Confirmed →
  Completed`, or `Lost`. Veil types are `Rental`, `Bespoke Veil`, `Bespoke Rental`,
  `TBD`. The DB `check` constraints are the source of truth, and the TS unions in
  `src/types` must match them.

## Anthropic API usage

- Only server-side, in `api/`. The browser calls `/api/chat`.
- Keep the model id in one constant.
- The endpoint must verify the caller (Supabase JWT plus the owner check) before it
  spends tokens. `api/chat.ts` does this by calling `is_app_owner()` as the caller.
  A request without a token is a demo request: the server uses its own demo
  fixtures, ignores data in the body, and caps message, history and reply size.
  There's no rate limit yet. Add one if demo traffic gets costly.
- Context sent to the model leaves our infrastructure. Send only what the question
  needs, and leave out client emails and phone numbers unless the task requires them.
- Treat business data in prompts as data, not instructions.

## Conventions

- TypeScript strict mode. Avoid `any`. Where an external API forces it, narrow the
  value right at the boundary.
- One default-exported function component per file. Screens are `views/XxxView.tsx`;
  shared pieces go in `components/`.
- Styling uses Tailwind utilities. Palette: `stone` for neutrals, `rose-800` for the
  accent, `emerald`/`red` for gains and losses, `amber` for demo indicators. The
  Pinyon Script and Cormorant Garamond fonts are for the logo only.
- Every view must work at 375px wide. Esther mostly uses her phone.
- Errors: lib functions throw an `Error` with a message a user can read, and views
  catch it and show it inline. Never silently swallow errors on any path that issues
  numbers or moves money.
- Env vars: declare every `VITE_` variable in `src/vite-env.d.ts` and `.env.example`.
- Comments explain *why*, not *what*. Match the existing tone; the codebase is also
  learning material (see below).
- Commits: imperative mood, sentence case, one logical change per commit (see
  `git log`).

## Working with the maintainer

Kelvin is a product manager who builds this partly to grow his technical fluency.
For any non-trivial choice (schema, auth, a new library, structure), explain the
reasoning, the alternatives, and the tradeoff in plain language, and tie it to what
it means for the product. Simple questions get simple answers.

Ask before you:
- add a dependency
- change auth or RLS
- write a destructive migration (drop, rename, change a column type)
- do anything that touches live data or real Google Drive files
- push to `main`, because that deploys to production

## Never

- Commit `.env`, `credentials.json`, or `token.json`.
- Put the `service_role` key or `ANTHROPIC_API_KEY` in a `VITE_` variable.
- Add new Google Sheets reads or writes.
- Disable RLS or add a permissive `using (true)` policy to make something work.

## Decisions

- **2026-10-10: invoices are generated as PDFs, not Google Docs.**
  - Why:
    - Editing the Docs by hand let the document drift away from the recorded data.
    - Keeping Docs meant keeping a Google token alive alongside the Supabase
      session, which Supabase doesn't refresh.
    - The restricted `drive` scope kept the app in Google's OAuth test mode.
    - The Docs API code that inserts text by character position was fragile.
  - What it costs: the owner can't freely restyle the layout. Mitigations are the
    editable wording slots, the clause library, and settings in the app.
  - Revisit if Esther regularly needs free-form layout on individual invoices.
