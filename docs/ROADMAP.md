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

**Phase 2 – Multi-division readiness (started 23 Oct: active-division picker, sales take the division from the branch, readiness checklist; still to do: per-user division/branch scope, division manager role).** User scope by division and branch; division-aware pages and settings; new division/branch checklist (locations, price lists, accounts) so opening one is a form, not a code change.

**Phase 3 – Catalogue and media (built 23 Oct: photos and videos per product, cover photo, New stock arrivals fed by goods receipts, copy-ready messages; still to do: public catalogue feed, customer WhatsApp share, MEDIA_DIR on the server).** Product photos and short videos stored once against the product; "new stock" event created when a purchase is received; public catalogue feed that other channels read.

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

Migrations so far (see GO_LIVE for the full list): 001 investor capital account; 002 missing live columns; 003 set-up costs; 004 opening date; 005 returns, refunds, damaged stock; 006 set-up cost asset; 007 business settings; 008 WhatsApp reports; 009 barcodes for existing products; 010 customers; 011 catalogue photos and new-stock events; 012 customer message log; 013 staff stock reports (WhatsApp); 014 online shop switch per product; 015 Instagram post history; 016 shop price per size/colour; 017 GST-ready columns (switched off); 018 supplier returns (debit notes), supplier refunds and free stock; 019 items on approval (customer takes items home to try); 020 daily cash closing.

## 8. Known open items

- Opening balance: post it, then close October.
- Investor deposits not yet entered (the investor bank shows a negative balance until they are).
- A supplier payment of ₹1,41,525 is recorded with a cash method but came from a bank account.
- Funding transaction types (funding received, principal repaid, returns paid) have no ledger rules yet.
- Settings screens: owner minimum (51%), funding limit (₹10 lakh), low-stock level.
- Expense form needs a "set-up cost" checkbox.
- Repo hygiene: private uploads are committed, there is no base schema file, billing uses floating-point money in one form, login has no rate limit, the website and accounting app share one database, expired sessions are never cleaned.

## Staff stock reports (WhatsApp)
Built: staff text lines like "DAMAGED SKU 2 torn" to the business number (or the owner pastes them). Lines become drafts on /accounting/stock-reports. Approve: damaged/lost reduces stock; count shows the difference; received/sold are acknowledged with links to Buy stock / Sell. Needs env WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET for the automatic webhook (/api/whatsapp/webhook).
Received lines: "Make purchase" opens Buy stock pre-filled (item, quantity, warehouse); saving the purchase marks the reports done. Sold lines: "Make bill" opens billing pre-filled (item, quantity, price, branch); saving the bill marks the report done. Not yet: WhatsApp replies to staff.

## Instagram helper
Built (free): /accounting/catalogue/instagram?product=ID gives a ready caption + hashtags, copy button, Share to Instagram (phone share sheet) and Save to phone. Reached from New stock arrivals and each product page. Not yet: automatic posting through the Instagram business API (needs a Meta business account and review).

## Online shop (v1)
Built: public /shop and /shop/[id] (no login). Only products switched on ("Show on online shop" on the product photos page) appear. Price = latest suggested price from received transfers; "Out of stock" from stock movements; Order on WhatsApp opens a message to the number saved on the Catalogue page. Public media: /api/shop/media/[id] (published products only).
Not yet: cart and online payment, wholesale/GST prices, shop link in the menu for customers, SEO sitemap, a product-page link on the home page.

## Meta catalogue feed
Built: /shop/feed.csv (public) lists shop-enabled products that have a price and a photo, one row per size/colour, for Meta Commerce Manager (scheduled data feed). One catalogue then serves the WhatsApp Business catalogue and Instagram Shopping. Env SHOP_PUBLIC_URL sets the address Meta should use. Set-up steps are on the Catalogue page.
Not yet: automatic Instagram posting via the API; the shop link inside customer WhatsApp messages.

## Automatic Instagram posting
Built: "Post now" on /accounting/catalogue/instagram posts the photo (JPG) or video (as a reel) with the caption through Meta Graph API. Shows only when server settings INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN and SHOP_PUBLIC_URL exist. Product must be switched on for the shop (Instagram fetches the file from /api/shop/media/ID). Posts are logged in acct_instagram_posts. Request logic is unit-tested with a mock; NOT yet tested against live Meta (no token/network in the build sandbox).
IDs given by owner: Instagram User ID 1429287470264568, Meta Business ID 1107115578575302 (identifiers, not secrets). The access token is never stored in code or chat.

Shop links: home page has a "Shop online" button; the new-stock WhatsApp message adds the shop link (single product or /shop) when SHOP_PUBLIC_URL is set and the product is switched on.

Bulk shop switches on the Catalogue page: show all in-stock products, show every active product, hide everything (with confirmation); "On the shop now" count and a no-photo warning.

Shop price = the maximum selling price from the newest received stock transfer (falls back to the suggested price). The Shop prices page (/accounting/catalogue/prices) lets the owner override it per size/colour (migration 016).

Bulk photos: /accounting/catalogue/photos lists products without a photo with one file box each; one Save uploads them all (images only, JPG/PNG/WebP up to 8 MB). Shop grid now fits 2 products per row on phones.

Part payments: "Take payment" button now shows on Recent Sales, the Invoices list and the inline view for any posted invoice with a balance; the invoice page has a top banner, an anchor, and a clear message when no cash/bank account exists.

## GST-ready foundation (switched off)
Built: owner page /accounting/gst-settings (not registered / regular / composition, GSTIN, state, prices include GST, start date); bulk page /accounting/products/gst for HSN code and rate per product; migration 017 adds hsn/rate on products and tax columns (taxable value, CGST, SGST, IGST, cess, ITC flag) on sales and purchase lines plus place of supply on invoices. Helpers in src/lib/gst.ts (state from GSTIN, HSN/rate checks, CGST/SGST/IGST split). Invoices and bills are unchanged while GST is off.
Not yet (do when the owner registers, with the CA): tax calculation on invoices and purchases, tax invoice format and numbering, credit notes, GST ledger accounts and posting, GSTR-1 / GSTR-3B exports, purchase matching, e-invoice if needed.

## Supplier returns and free stock (owner list items 1 and 2)
Built: "Return goods to supplier" (/accounting/supplier-returns): pick a received purchase, the place the goods are now, quantities, reason, optional agreed value and the supplier's own credit note number. Stock leaves at the purchase cost; a numbered debit note (DN-0001, printable) is made. The supplier's agreed value is credited against what we owe (default); a shortfall against cost goes to account 5160 Loss on Supplier Returns. Then: Refund (money back into a bank/cash account, allowed only while the supplier actually holds credit for us and never more than the return) and Replacement items (link a later received purchase from the same supplier; no ledger effect). A return reduces the payable on its own bill (supplier bills page, payment page, payment checks, WhatsApp "suppliers to pay").
Supplier statement (/accounting/supplier-statement): every supplier's bills, payments, returns, refunds, running balance ("You owe" / "Supplier owes you"), ageing (30/60/90/over) with payments and returns counted against the oldest bills first, print, and tap-to-send WhatsApp.
Give stock free (/accounting/free-stock): place, items, who, why. Cashier can only ask; owner and accountant are approved at once or approve/turn down waiting requests. Stock leaves at average cost; the cost is booked to account 6045 Gifts and Free Stock, an ordinary business expense (shows in running expenses by division/branch).
Ledger: SUPPLIER_RETURN (Dr Payables [+ Dr 5160] / Cr Inventory), SUPPLIER_REFUND (Dr bank/cash / Cr Payables; cash is booked to the cash account's branch), FREE_STOCK (Dr 6045 / Cr Inventory), posted with the other pending entries on Reports.
Not yet: cancelling a posted return or free-stock entry (use a reversing journal for now); GST debit note and input-tax reversal (do with the GST build); using supplier credit on a specific bill (credit already reduces the bill it came from).
Note for later: cash payments to suppliers use no branch on the journal while cash ledger accounts require one; check this when the first cash supplier payment is posted.

## Owner's running list (Oct 2026)

- Draft bills can now be confirmed from the Sales, Invoices and bill pages (same invoice number kept, stock and payments taken at confirmation).
- Mobile number can be added or changed on any bill; if the number already belongs to another customer record, the Customers page offers "join the two" (bills and messages move, old record hidden, nothing deleted).
- Items on approval (migration 019): items leave the shelf into a per-division "With customers" place, no accounting entry while out. Outcomes per item: keeps it (bill is pre-filled; stock comes back to the shelf and is sold in the same step), came back fine (back on the shelf), came back damaged (recorded as damaged stock). Overdue = past the "due back" day, with a tap-to-send WhatsApp reminder.
- Known gaps: a posted supplier return or free-stock entry cannot be cancelled yet (use a reversing journal); existing cash purchase payments may fail posting because cash accounts need a branch.
- Customer ageing (no migration): "Who owes, and how long" page lists unpaid amounts by age (30/60/90), payments counted against the oldest bill first, with a tap-to-send WhatsApp reminder. Reminders are manual taps, nothing is sent automatically.
- Daily cash closing (migration 020): per cash drawer per day, expected = last counted cash + customer cash payments + supplier cash refunds - cash refunds, expenses and supplier payments - cash taken to bank/owner. The count is entered by hand; a mismatch needs a note. Control record only, no accounting entry. Only owner/accountant can change a closed day. Cash deposits to the bank are entered in the "taken to bank or owner" box for now.
- Part of a supplier payment paid by an investor (no migration): on the purchase payments page, "Part of this was paid by an investor" reduces the payment and adds a linked payment from the investor's bank in one step (bill total paid unchanged, audit entry written). If the original was already posted, Reports flags it for the usual reversal and repost.
- A reversed journal no longer counts as posted: once the owner reverses a journal, its record (if still valid) shows as pending again and "post pending entries" posts it with its current values. A reversed journal for a record that no longer exists is no longer listed as "no longer valid".
- Journals the app created from records (supplier payments, sales, expenses and so on) can now be reversed by the owner from the journal page. A journal with a reversal is treated as not posted for the ledger status, so its record shows as pending again and is re-posted with its current figures.
- Discount to close a bill (migration 021): on an invoice, owner or accountant can give a discount (with a reason) when the customer pays a little short. It is recorded as a "Discount" payment, the bill shows as paid, reports do not count it as money received, and it posts to Sales discounts.
- Double-tap protection (migration 022): the Confirm sale button locks after one press and each bill form carries a one-time token, so the same submission can never create two bills. Duplicates already created are cleaned up with Return or refund.
- Count stock and Running low (migration 023): count a shop or warehouse, see short and extra items; owner or accountant can write shortages off as lost stock (posts like other lost stock); extras are only listed. Running low lists items at or below a minimum you set, with a WhatsApp share.
- Auditor login (migration 024): owner adds a person with access "Auditor (view only)" on the Users page. The auditor sees Reports, account balances, Every ledger line (search by date, account, kind, words) and Change history (who did what, when). Nothing can be added, changed or posted by that login.
- Download for the auditor (no migration): Excel (day book, trial balance, accounts) and two Tally XML files (ledgers, then vouchers filed as Sales, Receipt, Payment, Purchase, Credit Note, Debit Note, Journal). Only posted entries are included. The Tally files are built to Tally Prime import format but have not been opened in Tally yet; the auditor should try one month first.
- Auditor adjustments (migration 025): owner records a change the auditor asked for (date, reason, up to 6 balanced lines). It posts at once as its own entry (ADJ-0001) and can be reversed from the journal page. Original entries are never edited.
- Backup (no migration): owner downloads a full compressed SQL copy of all accounting tables (sessions left out) from the Backup page; the dashboard reminds the owner after 7 days without one. Restore is by phpMyAdmin Import and replaces the accounting data. Tested by restoring into a scratch database.
- Where the money went (no migration): cash flow of cash and bank money for any dates: start, money from customers, paid to suppliers, costs, deposits, owner and investor money, other entries, end. Ties to the money held. Open to the owner, accountant and auditor.
- Shop spending and Salaries (migration 026): "Shop spending" lets any staff note small cash spending in a one-minute form (cashier limit ₹5,000 per entry); it is saved as a normal expense paid from the chosen cash drawer, so it reaches the books and the cash count. "Salaries" is a monthly pay run for owner and accountant: add people, pay each once per month from cash or bank, send a WhatsApp pay slip. Both use the Expenses tables. Staff advances are not built yet.
- Both sides (migration 027): a supplier who is also a customer (or the reverse) can be linked on "Both sides" (suggested by same mobile number, or added as the other kind in one tap). Both records stay; pages show "they owe us / we owe them / net". "Set off" cancels the smaller amount against the larger with no cash or bank: each ticked bill gets a SET_OFF payment (oldest first) and one journal posts Dr 2000 Payables / Cr 1100 Receivables (source PARTY_SETOFF). No undo button; fix mistakes by reversing the journal or a correcting entry.
- Purchase orders (migration 028): write an order to a supplier (items, agreed price, expected date), send it by WhatsApp tap-to-send, list what is waiting for delivery (late ones in red). "Goods arrived" makes an ordinary purchase DRAFT with the items and prices copied; quantities are corrected there before posting. Orders touch no stock, money or ledger.
- Manager and investor logins (migration 029): "Manager (one division)" runs the floor (sales, returns, customers, stock, stock count, cash closing, shop spending, free-stock requests) and sees only their division on division pages; group-wide lists such as customers are still shared. "Investor" lands on "My investment": own agreements, money put in and paid back, profit share for any dates (from the same engine as Investor Profit Shares), payments list, printable. Everything else is blocked. Set both up on the Users page (pick the division or the investor).
- Fixed assets (migration 030): a register of shop fittings, machines, computers etc. An asset is paid from bank or cash (or marked "already in my books"), posts Dr 1500 Fixed Assets; one button works out straight-line monthly depreciation (from the purchase month, up to last finished month, late assets catch up) posting Dr 6100 / Cr 1510 per month; sold, scrapped or given-away assets leave the books with the loss or gain in 6110. Accounts 1500, 1510, 6100, 6110 are added by the migration. Not built: part-disposals, revaluation, reducing-balance method.
- Staff advances (migration 031): give an advance from a cash drawer or bank (Dr 1330 Staff Advances, not an expense); the Salaries page offers to take part or all of it off the next salary (suggests the monthly deduction set on the advance). The salary expense stays the full salary; the part that clears an advance is an expense payment with method ADVANCE (Dr 2200 / Cr 1330, no cash or bank). Cash closing, account balances and the bank/cash report now also count advances and fixed-asset purchases and sales.
- Cash note counter (migration 032): on "Close the day" the "Count by notes" button lets staff enter how many ₹500/200/100/50/20/10 notes and the coin total; the total fills the counted amount, and the counts are saved and shown on the closing. Typing the amount directly still works.
- Separate shop address (`src/proxy.ts`): `textiles.abhiraminc.com` shows only the public shop (/shop, shop images); every other page there jumps to the accounting address, and old accounting.abhiraminc.com/shop links jump to the shop address. Localhost is untouched. Set `SHOP_PUBLIC_URL=https://textiles.abhiraminc.com` in Hostinger. Later `abhitextiles` can replace the host via `TEXTILES_HOST`.
- Automatic posting (no migration): the owner switches "Automatic posting" ON on the Reports page (starts OFF). When ON, new records are posted to the ledger on their own whenever the Dashboard, Reports or a report's status note loads (at most once every 45 seconds), and by the secured call `/api/ledger/auto-post` (header `Authorization: Bearer <CRON_SECRET>`; Hostinger cron every 15 minutes). Only records that were never posted are handled, each on its own; anything posted-then-reversed, changed, in a closed period or with a problem is left for a person. Audit action: LEDGER_AUTO_POSTED.
- Year end (no migration; menu: Months and years, then Year end): the books are continuous (balance sheet is cumulative), so nothing is carried forward by hand. Step 1 "Start year" creates the next April-March year row and its 12 months and opens April (before this, nothing created the year row, so posting would have stopped on 1 April 2027). Step 2 "Close year" is available only after the year has ended, needs every record in the ledger, no review items and no draft journals, then closes all its months and locks the year. The periods page now also creates the year row. Depreciation and the last stock count are links in the checklist. A closing journal that moves profit into capital is NOT posted (reports read ranges of dates, so it would distort them); the auditor does that in Tally.
- New storefront Phase 1 (migration 033, textiles.abhiraminc.com): fresh look under /shop (warm colours, hero, fabric filters and search, product page with photo gallery, size/colour picker, quantity, Add to cart), cart kept in the customer's browser (prices and stock refreshed from the server), checkout with country (worldwide), address and phone, thank-you page with order number WEB-00001. The order is saved as "REQUESTED" in acct_online_orders (prices always recomputed on the server; out-of-stock and unpriced items refused; hidden spam field; 5 orders per 10 minutes per connection). Staff page "Online orders" (owner, accountant, cashier): reply on WhatsApp or email, confirm with a shipping charge, make the bill on New sale, mark done, or cancel; the dashboard shows how many new orders wait. Nothing touches stock or the books until staff bill it. NOT yet: automatic "make a sale from this order", online payment gateway, automatic shipping charges, other currencies, order status page for customers.
- Shop-ready products and Offers (migration 034): (1) "Online details" on each product's catalogue page: description, highlights, care, size guide, a crossed-out price per size/colour and a photo per colour (choosing a colour on the shop changes the picture). The shop product page is now boutique style: colour and size pickers (and a Style picker when items share size and colour), price with "Save %", sections for Description, Size guide, Care, Shipping. (2) Offers page (menu: Selling > Offers; owner and accountant): name, where (Store only / Online only / Both), kind (percent off, rupees off, special price), covers (everything, one fabric, chosen products), optional dates, pause/delete. The best single offer wins; offers never stack. Online: crossed-out old price, offer tag, and the order line records the list price and offer name. Store: the offer fills the line discount on the bill (staff can still change it; uses the existing discount so the books are unchanged). Not built: coupon codes, offers on a whole bill (e.g. buy 2 get 1), customer-specific offers.
- Shop front page redesign (no migration): indigo hero with arch-shaped photos and a block-print dot pattern, colours taken from the fabrics (indigo, rani pink, turmeric), Young Serif headings with Hanken Grotesk text (loaded from Google Fonts at build), "Shop sarees / Shop cotton sets" buttons, three arch tiles (Sarees, Cotton sets, Kalamkari link to searches), "Fresh on the shelf" (only when more than 8 products), borderless product cards, WhatsApp help block, offer bar on top when an online offer is running. Photos used on the home page are /public/images/textiles/*.webp: replace those files to change the pictures.
- Website customer accounts and "Make the bill" (migration 035): to place an order a customer must create an account (name, email, phone, password of 8+ characters) and log in; guests are sent to the login page and the cart is kept; the order API refuses anyone not logged in. Separate from staff logins (own cookie `abhiram_shop_session`, 30 days, bcrypt, login and sign-up attempts limited, JSON-only endpoints under /api/shop/account/*). "My account" page lists the customer's orders with their status. Orders are linked to the customer (shop_customer_id). Staff: Online orders has "Make the bill" which opens New sale filled with the items (list price plus the offer as a line discount), customer name and phone (Indian numbers only), and remembers the bill (sale_id), shown as "Billed as invoice ...". NOT yet: email verification, "forgot password" (needs an email service), staff screen to block or reset a website customer, shipping on the bill.
- Shop emails (done): forgot/reset password for website customers (036), staff "Website customers" screen (block, unblock, send reset email), and order emails (received, confirmed, done, cancelled) through the shop mailbox. Settings (Hostinger server settings only): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, optional SHOP_NOTIFY_EMAIL and SHOP_PUBLIC_URL.
- Review fixes (done): private_uploads untracked and ignored; "Accounting health" page (waiting entries by type, skipped/review reasons, opening balance status, safety rules, last auto-post); backup page shows whether safety triggers were included and has a second download for uploaded documents and photos (/api/backup/files); shop says an order is a request confirmed after a stock check; "My investment" shown only to investors. Still to do: save base schema (docs/SCHEMA_EXPORT.md), stock reservation for online orders (decision), restore test, quantity price tiers, CRM follow-ups.
- Owner money in and out (migration 037): /accounting/owner-money (owner only) records money the owner puts into, or takes from, a business bank or cash account. Posts automatically: put in = Dr bank/cash, Cr 3000 Proprietor Capital; taken out = the reverse. Separate from investor funding (Money received and returned), which still stays Draft with no verify step or ledger rule.
- WhatsApp bill and drawer check (migration 038): "Send bill on WhatsApp" on the invoice page opens WhatsApp to the customer's number with a private link (/shop/bill/<token>, 128-bit, read-only, no staff data); needs a valid mobile and a confirmed sale. Cash closing now shows "Does the drawer match the books?": book cash for that drawer on the day, less cash taken to bank/owner (recorded on closings but not in the ledger), against the counted amount.
- Cash taken away now reaches the books (migration 039): closing asks where the cash went (a business bank account, or the owner). Posts automatically: bank up (or Proprietor Capital down) and the cash drawer down. Closings made before this stay unposted and are still subtracted in the "drawer against the books" check. Once a day's cash taken is in the books it cannot be changed from the closing screen (reverse the journal first).
