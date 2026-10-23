# Abhiram Group – Business Platform Roadmap

Written 23 Oct 2026. This is the plan the application is being built to. Update it when decisions change.

## 1. What the owner wants (the six targets)

1. **Financial transparency**: every number traceable to a record, one version of the truth.
2. **Ecommerce website** later, with **social posts automatically when new stock arrives**.
3. **Daily stock news on Instagram, with videos**, posted from the system.
4. **Many divisions and branches** later, run smoothly without rebuilding.
5. **New-stock updates to customers on WhatsApp in one click** (today limited to WhatsApp only).
6. **Employees update stock through WhatsApp**, feeding sales and purchases.

Decisions given: customers buy both on credit and paid; wholesale GST invoices are not needed now but will be; hosting auto-deploys from git.

## 2. Design principles (ERP / CRM thinking)

1. **One source of truth per fact.** The ledger answers every money question; stock movements answer every stock question. Reports read from them; they never keep a second copy. (Today `Account Balances`, `Investment Accounts`, `Sales & Purchase Report` and the Dashboard each compute money their own way; this is how numbers drift apart.)
2. **One master per thing.** Products and variants, parties (customers, suppliers, investors, employees), locations. Every channel (shop, website, Instagram, WhatsApp) reads the same master.
3. **Business events, not page-to-page glue.** "Stock received", "sale made", "return made" are events. The ledger, WhatsApp, Instagram and the website each react to the event. Add a channel by listening, not by editing sales code.
4. **Nothing hardcoded to the first division.** Division/branch/location come from the signed-in person's scope. (Today 16 files hard-code division 1 and 9 page titles say "Abhiram Textiles".)
5. **Roles and scope.** Each person sees only the divisions and branches they are given. Owner, accountant and cashier exist; division manager, branch manager and employee-by-WhatsApp come next.
6. **Everything is auditable.** Who did what, when; posted records are never edited, only reversed.
7. **Ready for GST without turning it on.** Fields (GSTIN, HSN, tax rate, place of supply) are designed in; calculation switches on when wholesale starts.

## 3. Module map

| Area | Exists today | Missing |
|---|---|---|
| Group set-up | Group, divisions, branches, locations, banks, cash accounts | Scope per user, per-branch settings |
| Products and stock | Products, variants, categories, stock movements, transfers, damages | Product photos and videos, stock on hand in one view, reorder levels |
| Buying | Suppliers, purchases, receipts, payments | One purchase workspace (order, receive, pay) |
| Selling | Sales/invoices, receipts, returns, refunds | **Customer master**, credit sales and dues, customer statement, quotations |
| Finance | Ledger, periods, profit levels, balance sheet, trial balance, Excel/print, set-up costs | Customer and supplier ledgers, GST, budgets and forecasts |
| Investors | Agreements, versions, funding, shares engine and rules, profit-share report | Investor statements as documents, funding-limit screens |
| People and access | Owner, accountant, cashier | Division/branch manager, employee roles, scoped access |
| Messaging | WhatsApp reports (tap-to-send) | Customer new-stock broadcast, employee stock updates by WhatsApp |
| Channels | None | Catalogue feed, ecommerce site, Instagram posting |

## 4. Phases

**Phase 0 – Foundations (next).** Page audit and menu regrouping (section 6), flow check from start to end, remove hard-coded division 1, one money source of truth. Nothing else is built on a shaky base.

**Phase 1 – Customers (CRM core).** Customer master (phone is the key; retail/wholesale; address; optional GSTIN; credit limit). Credit and paid sales both supported; dues, receipts against old invoices, statement per customer, repeat-customer tracking (visits, spend, last purchase), customer ledger feeding the ledger. Quick-add while billing; existing invoices imported and de-duplicated.

**Phase 2 – Multi-division readiness.** User scope by division and branch; division-aware pages and settings; new division/branch checklist (locations, price lists, accounts) so opening one is a form, not a code change.

**Phase 3 – Catalogue and media.** Product photos and short videos stored once against the product; "new stock" event created when a purchase is received; public catalogue feed that other channels read.

**Phase 4 – Channels.** In this order of value and cost:
1. Employees update stock by WhatsApp (inbound).
2. Customer new-stock share to WhatsApp (one click).
3. Instagram auto-post of new stock and videos.
4. Ecommerce site reading the same catalogue and stock.

**Phase 5 – GST and insight.** GST on invoices for wholesale; trends, forecasts, reorder suggestions.

## 5. Channels: what is free and what is not

| Need | Free route | Paid or limited route | Notes |
|---|---|---|---|
| Employees update stock by WhatsApp | Business-number inbound messages: employees message the number, the system replies inside WhatsApp's 24-hour window | Messages the business starts are charged by Meta | Needs a Meta business account, a number, and a webhook on the server. Employees can only send structured messages (for example `RECEIVED SKU qty`) which become **draft** records for approval. |
| New-stock update to customers | Tap-to-send per customer (built for reports); WhatsApp Business app broadcast lists or a WhatsApp Channel, posted by hand from text and images the system prepares | Fully automatic bulk sending needs the paid API and approved templates, and customers must have opted in | Opt-in tracking will be part of the customer record. |
| Instagram posts and videos | The Instagram publishing API is free to use | Needs a professional Instagram account linked to a Facebook Page and a Meta app; posting for the public may require Meta's app review | Videos are uploaded once on the product and reused. |
| Ecommerce | Own site on the same hosting reading the catalogue | Payment gateway charges per sale | Built after catalogue and stock are clean. |

Prices and limits change; check Meta's current rules before committing.

## 6. Page audit (46 pages)

Proposed menu, grouped by how the work is done:

- **Home**: Dashboard
- **Daily work**: Sales, Invoices, Returns and Refunds, Purchases, Stock Transfers, Expenses and Advances
- **Customers** (new): Customers, Dues
- **Stock and catalogue**: Stock on Hand, Products, Categories, Suppliers
- **Reports**: Reports (profit, balance sheet, trial balance), Money (bank and cash), Sales and Purchase Report, Product Profitability, WhatsApp Reports
- **Investors**: Investors and Lenders, Agreements, Profit Shares, Funding Transactions, Reconciliation
- **Accounting**: Journals, Chart of Accounts, Periods, Opening Balances
- **Set-up**: Group, Divisions, Branches, Bank Accounts, Cash Accounts, Users

Duplicates and overlaps found:

| Pages | Problem | Proposal |
|---|---|---|
| Warehouse Inventory, Branch Inventory | Two 30-line wrappers over the same report (and division 1 fixed) | One **Stock on Hand** page with a location picker |
| Purchases, Purchase Management, Purchase detail, Purchase Payments | One job spread over four pages | One **Purchases** area: order, receive, pay, with next-step links |
| Sales, Invoices, Invoice detail | Entry, list and view are separate with weak links | Keep three, link them: Sale saved → view invoice → print → receive payment |
| Opening Balances, Opening Balance Review | One wizard split in two | One three-step wizard (enter, review and authorise, post); hide once posted |
| Cutover Reconciliation, Agreement Cutover Reconciliation, Historical Funding Entry, Investor Bank Scope Mapping, Investor Scope Amendment | One-time cut-over tools mixed into daily menus | Group under **Investors → Set-up and cut-over** |
| Investors and Lenders, Funding Agreements, Participation Register, Participation Reconciliation, Investment Accounts, Profit Shares | Six views of investor money | One **Investors** area with tabs; Profit Shares is the calculation of record |
| Account Balances, Investment Accounts, Sales and Purchase Report, Reports, Dashboard | Several pages compute money separately from operational tables | Reports and Dashboard read the ledger; operational pages keep operational detail but must reconcile to it |
| Menu names | "Cash of Accounts", "Divison Inventory", "Accounting" (that is Chart of Accounts) | Rename |

Nothing is removed until the owner approves this table. Old links will redirect.

## 7. Go-live checklist (hosting deploys automatically from git)

The hosting service builds and publishes whenever the connected branch changes, so **merging to `main` is going live**. Database changes are not applied automatically.

1. Run every pending file in `migrations/` in phpMyAdmin, in number order, **before** merging. They are safe to run twice.
2. Check environment variables on the hosting service (WhatsApp keys only if automatic sending is used).
3. Merge the pull request. The site rebuilds; the build installs new packages by itself.
4. Open the site, sign in, and check Dashboard, Reports and one invoice.
5. Roll back by reverting the merge if needed; migrations only add things, so they do not need undoing.

Migrations so far: 001 investor capital account; 002 missing live columns; 003 set-up costs; 004 opening date; 005 returns, refunds, damaged stock; 006 set-up cost asset; 007 business settings; 008 WhatsApp reports.

## 8. Known open items

- Opening balance: post it, then close October.
- Investor deposits not yet entered (the investor bank shows a negative balance until they are).
- A supplier payment of ₹1,41,525 is recorded with a cash method but came from a bank account.
- Funding transaction types (funding received, principal repaid, returns paid) have no ledger rules yet.
- Settings screens: owner minimum (51%), funding limit (₹10 lakh), low-stock level.
- Expense form needs a "set-up cost" checkbox.
- Repo hygiene: private uploads are committed, there is no base schema file, billing uses floating-point money in one form, login has no rate limit, the website and accounting app share one database, expired sessions are never cleaned.
