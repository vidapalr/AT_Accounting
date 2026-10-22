# AT Accounting review and repair plan

Baseline: `c621e8c8430b4d76b47b91c59300370a48bbff51` (main, 22 October 2026).

## Coverage and limits

This is an initial repository-wide structural audit, with focused manual tracing of expense creation, subsequent payments, account movements, authentication, navigation, dashboard, sales valuation, profitability reports and investor share readers. The companion inventory lists every tracked file at the baseline. Inventory coverage does not mean every line or every business workflow has been validated. Each repair below needs its own transactional and reconciliation checks before it can be marked complete.

No live database credentials or complete database creation/migration history are supplied in this checkout. Existing verification scripts inspect an external schema; they do not recreate it. Database triggers, constraints, historical records and actual closing balances remain unverified. No production data was modified.

## Confirmed findings

1. **Expense payments omitted from account movements.** `src/app/(workspace)/accounting/account-balances/page.tsx` originally queried only sales and supplier payments. Both expense actions persist expense payments but initial creation did not invalidate this page. First repair adds recorded payments against confirmed expenses, including Group overheads, and refreshes the money-flow and sales/purchase report pages after expense writes.
2. **Operational records are separate from journals.** Expense actions, sales actions and goods receipt actions do not themselves write general-ledger journals or call the journal posting action. Database-side posting is unverified. A complete P&L or balance sheet must not assume those operational records already reach the general ledger. Trace and reconcile this before automating postings, to avoid double counting existing database automation.
3. **The dashboard is a placeholder.** `src/app/dashboard/page.tsx` renders static module cards, not financial metrics, and sits outside the workspace route group.
4. **Owner-only access.** `src/lib/auth.ts` filters both login and sessions to business 1, role GROUP_OWNER. A user creation screen alone cannot enable other roles; authentication, every protected action, read query and document endpoint need scoped authorization.
5. **Navigation is fragmented.** Workspace navigation splits warehouse and branch inventory into separate groups, mixes reports into Sales, contains placeholder parent URLs and hardcodes the financial year. Repair the navigation model and dashboard layout together.
6. **Reports are partial, not absent.** The sales/purchase report includes filters, COGS-based gross profit and a separate closing-balance calculation. Product profitability apportions invoice totals to lines with independent rounding. This can cause a paise-level difference against the invoice total. Both use sales as the percentage denominator (gross margin); markup uses cost and must be displayed separately. Operating expenses are not subtracted from gross profit.
7. **Two account representations need reconciliation.** The account-balances page deliberately displays net movement, excluding opening balances, funding and advances. The sales/purchase report has a separate SQL pipeline for closing snapshots. A shared accounting source is needed before claiming either as the complete cash ledger.
8. **Returns and refunds are placeholders.** Invoice pages explicitly describe those workflows as pending. Deposit refunds in the advance module do not implement customer refunds or stock returns.
9. **Partial exports and branding exist.** Inventory has CSV export and transfers have printing. `private_templates/logo.png` exists, but the workspace brand uses text initials. Invoice/report printing and true Excel output need implementation.
10. **Tax, delivery and customer workflows are incomplete.** Sales writes persist totals without a GST breakdown. Supplier WhatsApp fields exist, but there is no report/invoice messaging delivery workflow. Customer name/phone are stored on sales headers without a reusable customer account workflow.
11. **Baseline checks are not clean.** Full ESLint reports six existing errors and eight warnings. These are outside the expense fix; changed files have a separate lint check. There is no standard automated test script in package.json.

## First repair: expense money flow

- Count only `RECORDED` payments whose parent expense is `CONFIRMED`.
- Join parent expense and payment by business, expense ID and nullable division.
- Include Textiles division expenses and unallocated Group overheads; retain the existing Textiles sales/purchase scope.
- Debit the actual selected business bank or cash account.
- Keep investor-bank activity outside Group totals.
- Show owner personal / investor cash payments separately as external payments, without reducing Group funds.
- Preserve unknown accounts, conflicting IDs and ownership mismatches as unallocated for reconciliation.
- Use integer paise for expense amounts, including values beyond JavaScript's safe integer range.
- Both initial payments and later payments use the same read path. Existing eligible payments appear without backfilling or duplicating data.
- This fixes operational payment visibility. It does not post expenses to the general ledger or claim complete closing balances.

Regression command (Node 22.18+ or Node 24): `node --test tests/expense-money-flow.test.mjs`.

Manual database acceptance after deployment to a test environment: create a confirmed expense of 1,000 with a 400 bank payment; expect a 400 debit and 600 outstanding. Add a 250 cash payment; expect a 250 cash debit and 350 outstanding. Repeat with owner personal and investor bank funding; neither reduces Group funds. Check unpaid and draft expenses do not move cash, non-recorded payments are excluded, Group overheads are included, and another business's records are absent. Compare initial and subsequent payment results. Verify details and running net agree with summary totals.

## Ordered work queue

| Order | User issues | Work | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | 1, 2, 12 | Accounting foundation, expense movements, journal integration, opening balances and reconciliation | Every economic event has one auditable effect; trial balance balances; bank/cash reconciles; closed periods reject backdated changes. Expense movement visibility is the first patch only. |
| 2 | 6, 14 | Margin versus markup, discount allocation, inventory valuation, investor profit pools | Invoice net allocations sum exactly; COGS reconciles; profit excludes tax; effective-date shares never exceed 100%; retained Group share and payout basis are explicit; no duplicate allocation across scopes. |
| 3 | 11 | Returns, refunds, exchanges and damaged stock | Original sale linked; returned quantity cannot exceed net sold quantity; original cost restored where resellable; damage loss and cash refund posted independently; repeat submissions do not duplicate effects. |
| 4 | 13 | Optional GST settings and tax-aware documents | Registration effective date, GSTIN, item tax configuration, inclusive/exclusive prices and tax breakdown preserved on each document; unregistered mode supported; historical documents do not change when settings change; tax treatment validated before activation. |
| 5 | 10 | User administration and permissions | Owner can invite/create, disable and scope users; deny unauthorized writes and reads server-side; sessions respect permission changes; cashier/accountant/viewer boundaries tested. |
| 6 | 16 | Customer master and purchase history | Normalize phone numbers, prevent accidental duplicates, support walk-in sales, show linked invoices/returns/outstanding amounts. |
| 7 | 3, 4, 18 | Workspace UI, routes, common branding | Dashboard shares workspace layout; active navigation and mobile layout work; operational menus are ordered; existing logo appears consistently on authorized screens and documents. |
| 8 | 7, 12, 17 | Reports, P&L, balance sheet, print and Excel | Shared ledger definitions; date/scope filters; report-to-ledger drill-down; assets equal liabilities plus capital; print/export agree with displayed totals. |
| 9 | 5, 9 | Dashboard and graphs | Sales, collections, costs, expenses, gross/net profit, receivables and stock KPIs reconcile to reports; trend charts use the same scope and dates; missing values are disclosed. |
| 10 | 8 | WhatsApp invoices and assigned daily reports | Configure recipients and permitted scopes; consent and opt-out handling; server-side credentials; supported provider integration; delivery log, retries and deduplication; test mode before enabling actual scheduled sends. No messages are sent by this patch. |
| 11 | 15 | Forecasts and future trends | Define requested trends first (sales demand, low stock, cash runway); show assumptions, data window, uncertainty and performance against a simple baseline; insufficient history does not produce fabricated forecasts. |

## Before financial release

Obtain a sanitized schema and representative test database. Review transaction statuses, sign conventions, account mapping, effective dates and any triggers. Validate partial payments, unpaid expenses, personal funding, inventory transfers, historical cutover, invoice edits and period locks. Add integration tests against the actual supported schema. Keep each phase in a separate reviewable change; do not combine the entire backlog into one deployment.

## Validation of the first patch

- Six expense money-flow regression tests passed on Node 24.
- Next.js route type generation and `tsc --noEmit` passed.
- ESLint passed for the changed source and test files.
- Production `npm run build` passed (55 pages generated).
- Full repository lint remains blocked by six pre-existing errors and eight warnings; not repaired in this scoped patch.
- Live SQL execution, UI with authenticated financial data and journal reconciliation remain pending a test database.
