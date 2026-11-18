/**
 * The side menu, grouped the way the work is done. Plain words on purpose: staff should never have to
 * guess what a menu item means.
 *
 * - Who sees an item is decided by canOpenPath() in access.ts, so adding an item never shows it to
 *   someone who cannot open the page. A header with nothing left for a person is hidden.
 * - Each header belongs to a MODULE. A company can switch modules off (business setting modules_off,
 *   e.g. "investors,shop"), which hides those headers: the same app fits a company that does not need them.
 * - A future mobile app reads this same list (it is plain data), so the phone menu matches the web menu.
 */

export type NavItem = {
  label: string;
  href: string;
  /** One short line shown on hover. */
  hint?: string;
};

export type NavModule =
  | "core"
  | "sales"
  | "crm"
  | "purchases"
  | "inventory"
  | "catalogue"
  | "marketing"
  | "money"
  | "hr"
  | "reports"
  | "accounting"
  | "investors"
  | "setup";

export type NavSection = {
  id: string;
  label: string;
  icon:
    | "home" | "customers" | "sell" | "buy" | "stock" | "reports" | "investors" | "accounting"
    | "setup" | "whatsapp" | "products" | "money" | "people";
  module: NavModule;
  items: NavItem[];
};

/** Modules a company may switch off (core, accounting and set-up always stay). */
export const OPTIONAL_MODULES: Array<{ key: NavModule; label: string }> = [
  { key: "crm", label: "Customers and follow-ups" },
  { key: "purchases", label: "Buying" },
  { key: "inventory", label: "Stock" },
  { key: "catalogue", label: "Products and online shop" },
  { key: "marketing", label: "WhatsApp and social media" },
  { key: "hr", label: "Staff and salaries" },
  { key: "investors", label: "Investors and owner money" },
];

export const NAVIGATION: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: "home",
    module: "core",
    items: [
      { label: "Dashboard", href: "/dashboard", hint: "Today's sales, profit and money at a glance" },
      { label: "Insights", href: "/accounting/insights", hint: "Best sellers, who owes, slow stock, what is about to run out" },
      { label: "Approvals", href: "/accounting/approvals", hint: "Entries above a limit waiting for a check or a final approval" },
      { label: "My investment", href: "/accounting/my-investment", hint: "Your money in, paid back, and your profit share" },
    ],
  },
  {
    id: "sell",
    label: "Selling",
    icon: "sell",
    module: "sales",
    items: [
      { label: "New sale / bill", href: "/accounting/sales", hint: "Make a bill and take payment" },
      { label: "Invoices", href: "/accounting/invoices", hint: "Find, view and print past bills" },
      { label: "Returns and refunds", href: "/accounting/returns", hint: "Customer returns, refunds, damaged stock" },
      { label: "Items on approval", href: "/accounting/approval-items", hint: "Customer takes items home to try, pays only for what they keep" },
      { label: "Online orders", href: "/accounting/online-orders", hint: "Orders customers placed on the website" },
      { label: "Offers", href: "/accounting/offers", hint: "Discounts for the store, the website, or both" },
      { label: "Coupons", href: "/accounting/offers/coupons", hint: "Codes that take rupees or a percentage off a whole bill" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "customers",
    module: "crm",
    items: [
      { label: "All customers", href: "/accounting/customers", hint: "Customer list, history and credit limits" },
      { label: "Money customers owe", href: "/accounting/customers?view=dues", hint: "Customers with unpaid bills" },
      { label: "Who owes, and how long", href: "/accounting/customer-ageing", hint: "Unpaid bills by age, with a WhatsApp reminder" },
      { label: "Follow-ups", href: "/accounting/follow-ups", hint: "Who to call or message today" },
      { label: "Leads", href: "/accounting/leads", hint: "People who asked but have not bought yet" },
      { label: "Sales pipeline", href: "/accounting/deals", hint: "Bigger or wholesale deals, from enquiry to won" },
      { label: "Customer tickets", href: "/accounting/tickets", hint: "Complaints, exchange requests, alterations" },
      { label: "Website customers", href: "/accounting/shop-customers", hint: "People with an account on the website" },
    ],
  },
  {
    id: "buy",
    label: "Buying",
    icon: "buy",
    module: "purchases",
    items: [
      { label: "Purchase orders", href: "/accounting/purchase-orders", hint: "Order from a supplier, then turn it into a purchase when goods arrive" },
      { label: "Buy stock (purchases)", href: "/accounting/purchases", hint: "Record stock bought from suppliers" },
      { label: "Supplier bills and payments", href: "/accounting/purchase-management", hint: "Receive goods and pay supplier bills" },
      { label: "Pay a supplier", href: "/accounting/pay-supplier", hint: "One payment, spread over their oldest bills" },
      { label: "Return goods to supplier", href: "/accounting/supplier-returns", hint: "Send items back and get credit, refund or replacement" },
      { label: "Suppliers", href: "/accounting/suppliers", hint: "People you buy from" },
      { label: "Supplier statement", href: "/accounting/supplier-statement", hint: "What you owe each supplier, and how old it is" },
      { label: "Both sides (customer and supplier)", href: "/accounting/both-sides", hint: "People who buy from us and sell to us: link them and set off" },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    icon: "stock",
    module: "inventory",
    items: [
      { label: "Stock on hand", href: "/accounting/stock", hint: "What is in every warehouse and shop right now" },
      { label: "Move stock", href: "/accounting/stock-transfers", hint: "Send stock between warehouse and shops" },
      { label: "Count stock", href: "/accounting/stock-count", hint: "Count what is on the shelf and compare with the books" },
      { label: "Running low", href: "/accounting/low-stock", hint: "Items below the minimum you set, ready to reorder" },
      { label: "Give stock free", href: "/accounting/free-stock", hint: "Gifts, samples and promotions (a business expense)" },
      { label: "Piece tracking", href: "/accounting/serials", hint: "Give one-of-a-kind pieces their own code" },
      { label: "Find by lot", href: "/accounting/lots", hint: "Trace a batch to its supplier and customers" },
      { label: "Staff stock reports", href: "/accounting/stock-reports", hint: "Approve what staff report on WhatsApp" },
    ],
  },
  {
    id: "products",
    label: "Products and shop",
    icon: "products",
    module: "catalogue",
    items: [
      { label: "Products", href: "/accounting/products", hint: "Product list, sizes and colours" },
      { label: "Product groups", href: "/accounting/product-categories", hint: "Categories for products" },
      { label: "Selling prices", href: "/accounting/products/selling-prices", hint: "Change the minimum, maximum and usual price of a product" },
      { label: "Quantity prices", href: "/accounting/products/quantity-prices", hint: "Lower price per piece when a customer buys more" },
      { label: "Website prices", href: "/accounting/catalogue/prices", hint: "Price shown on the online shop, per size and colour" },
      { label: "HSN codes and GST rates", href: "/accounting/products/gst", hint: "Tax details for each product (ready for GST)" },
      { label: "Photos and videos", href: "/accounting/catalogue", hint: "Photos and videos of every product; switch products on for the shop" },
      { label: "New stock arrivals", href: "/accounting/catalogue/new-stock", hint: "Newly received stock, ready to announce" },
    ],
  },
  {
    id: "marketing",
    label: "WhatsApp and social",
    icon: "whatsapp",
    module: "marketing",
    items: [
      { label: "Tell customers about new stock", href: "/accounting/catalogue/share", hint: "Ready messages and photos to share" },
      { label: "Send new stock on WhatsApp", href: "/accounting/catalogue/broadcast", hint: "Automatic messages to customers who agreed" },
      { label: "Music for reels", href: "/accounting/catalogue/reels/music", hint: "Songs to use in product reels" },
      { label: "WhatsApp chatbot", href: "/accounting/chatbot", hint: "Quick answers, chats that need a person" },
      { label: "WhatsApp message log", href: "/accounting/chatbot/log", hint: "Where each bill or photo message stopped" },
      { label: "Send reports on WhatsApp", href: "/accounting/whatsapp", hint: "Daily and monthly reports to your team" },
    ],
  },
  {
    id: "money",
    label: "Daily cash and spending",
    icon: "money",
    module: "money",
    items: [
      { label: "Close the day (cash count)", href: "/accounting/cash-closing", hint: "Count the cash drawer and compare with what the system expects" },
      { label: "Expenses", href: "/accounting/expenses", hint: "Rent, electricity, transport and other costs" },
      { label: "Shop spending", href: "/accounting/shop-spending", hint: "Note small cash spending: auto, tea, packing, repairs" },
      { label: "Advances and deposits", href: "/accounting/advances-deposits", hint: "Money paid in advance or as deposit" },
      { label: "Fixed assets", href: "/accounting/fixed-assets", hint: "Shop fittings, machines, computers: cost, yearly wear and value now" },
    ],
  },
  {
    id: "people",
    label: "Staff",
    icon: "people",
    module: "hr",
    items: [
      { label: "Payroll (pay the month)", href: "/accounting/payroll", hint: "Work out pay with PF, ESI, professional tax and income tax, then pay" },
      { label: "Statutory dues and returns", href: "/accounting/payroll/dues", hint: "PF, ESI, professional tax and TDS owed to the government; files to upload; tax certificates" },
      { label: "Staff records", href: "/accounting/salaries", hint: "People, salaries, joining and leaving, letters" },
      { label: "Staff advances", href: "/accounting/staff-advances", hint: "Money given to staff before payday, taken off their salary" },
      { label: "Letter templates", href: "/accounting/letter-templates", hint: "Wording of offer, joining, salary and leaving letters" },
      { label: "Payroll settings", href: "/accounting/payroll/settings", hint: "Switch PF, ESI, professional tax and TDS on; how a salary is split" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "reports",
    module: "reports",
    items: [
      { label: "Profit and balance sheet", href: "/accounting/reports", hint: "Gross, operating and net profit; what the business owns and owes" },
      { label: "Where the money went", href: "/accounting/cash-flow", hint: "Money in and out of cash and bank, and what is left" },
      { label: "Money in bank and cash", href: "/accounting/account-balances", hint: "Where the money is and how it moved" },
      { label: "Sales and purchase report", href: "/accounting/sales-purchase-report", hint: "Day-by-day sales, purchases and profit" },
      { label: "Product profit", href: "/accounting/product-profitability", hint: "Which products earn the most" },
      { label: "Budget against actual", href: "/accounting/budgets", hint: "Monthly targets and spending limits per branch" },
      { label: "Printed papers", href: "/accounting/documents", hint: "Who printed which bill or voucher, reprints with reasons" },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: "accounting",
    module: "accounting",
    items: [
      { label: "Journals", href: "/accounting/journals", hint: "Every accounting entry" },
      { label: "Every ledger line", href: "/accounting/audit/ledger", hint: "Search every posted entry by date, account or words (view only)" },
      { label: "Bank statement check", href: "/accounting/bank-statement", hint: "Upload your bank file and match it with the books" },
      { label: "Accounting health", href: "/accounting/health", hint: "Is everything in the books? What is waiting and why" },
      { label: "Books check", href: "/accounting/reconciliation", hint: "Do the books agree with the records, account by account" },
      { label: "Month close", href: "/accounting/month-close", hint: "Checklist before closing a month" },
      { label: "Months and years", href: "/accounting/periods", hint: "Open and close accounting months" },
      { label: "Year end", href: "/accounting/year-end", hint: "Start the new year and close the old one" },
      { label: "Income tax and year-end pack", href: "/accounting/tax", hint: "Advance tax, tax statement, loans, depreciation and one download for your accountant" },
      { label: "Auditor adjustments", href: "/accounting/auditor-adjustments", hint: "Record a change your auditor asked for, as its own dated entry" },
      { label: "Download for the auditor", href: "/accounting/audit/export", hint: "Excel and Tally files of the books" },
      { label: "Change history", href: "/accounting/audit/changes", hint: "Who did what, and when" },
      { label: "Chart of accounts", href: "/accounting/chart-of-accounts", hint: "The list of accounts" },
      { label: "Account mapping", href: "/accounting/account-mapping", hint: "Which account each kind of entry is posted to" },
      { label: "Opening balances", href: "/accounting/opening-balances", hint: "What the business started with" },
    ],
  },
  {
    id: "investors",
    label: "Investors and owner",
    icon: "investors",
    module: "investors",
    items: [
      { label: "Owner money in and out", href: "/accounting/owner-money", hint: "Your own money put into, or taken from, the business" },
      { label: "Owner accounts", href: "/accounting/owner-accounts", hint: "Business money held in your name, and what was paid from it" },
      { label: "Investors and lenders", href: "/funding", hint: "People who put money into the business" },
      { label: "Agreements", href: "/funding/agreements", hint: "Profit-sharing and loan agreements" },
      { label: "Profit shares", href: "/accounting/investor-shares", hint: "What each investor has earned" },
      { label: "Money received and returned", href: "/funding/transactions", hint: "Deposits, repayments and profit paid out" },
      { label: "Investor money by account", href: "/accounting/investment-accounts", hint: "Investor funds and what was spent from them" },
      { label: "Share register", href: "/funding/participation", hint: "Who holds what share, by division and branch" },
      { label: "Share check", href: "/funding/reconciliation", hint: "Check that shares add up correctly" },
    ],
  },
  {
    id: "setup",
    label: "Set-up",
    icon: "setup",
    module: "setup",
    items: [
      { label: "Business details", href: "/group", hint: "Legal details, people and documents of the business" },
      { label: "Brand and modules", href: "/accounting/brand", hint: "Name, logo, phone and words printed on bills and the website; parts of the app in use" },
      { label: "Divisions", href: "/divisions" },
      { label: "Branches", href: "/branches" },
      { label: "Bank accounts", href: "/accounting/bank-accounts" },
      { label: "Cash accounts", href: "/accounting/cash-accounts" },
      { label: "Users and access", href: "/users", hint: "Who can sign in and what they can open" },
      { label: "Group rules", href: "/accounting/group-rules", hint: "Least share you keep; funding limits" },
      { label: "GST settings", href: "/accounting/gst-settings", hint: "Not registered yet; keeps the app ready" },
      { label: "Bill terms", href: "/accounting/bill-terms", hint: "Terms and conditions printed on every bill" },
      { label: "Two-step login", href: "/accounting/security", hint: "Authenticator code after your password" },
      { label: "Backup", href: "/accounting/backup", hint: "Download a full copy of your accounting data" },
    ],
  },
  {
    id: "cutover",
    label: "One-time cut-over",
    icon: "setup",
    module: "setup",
    items: [
      { label: "Investor bank links", href: "/accounting/investor-bank-scopes", hint: "One-time set-up" },
      { label: "Change investor scope", href: "/accounting/investor-scope-amendment", hint: "One-time set-up" },
      { label: "Earlier funding entries", href: "/accounting/historical-funding", hint: "One-time set-up" },
      { label: "Cut-over check", href: "/accounting/cutover-reconciliation", hint: "One-time set-up" },
      { label: "Cut-over check by agreement", href: "/accounting/cutover-reconciliation/agreements", hint: "One-time set-up" },
    ],
  },
];

/** "investors, shop" -> the modules switched off (unknown words and core modules are ignored). */
export function parseModulesOff(raw: string): Set<NavModule> {
  const allowed = new Set(OPTIONAL_MODULES.map((m) => m.key));
  return new Set(raw.split(",").map((w) => w.trim().toLowerCase()).filter((w): w is NavModule => allowed.has(w as NavModule)));
}

/** The menu for one person: only modules the company uses, only items the role may open, no empty headers. */
export function menuFor(canOpen: (href: string) => boolean, modulesOff: Set<NavModule> = new Set()): NavSection[] {
  return NAVIGATION
    .filter((section) => !modulesOff.has(section.module))
    .map((section) => ({ ...section, items: section.items.filter((item) => canOpen(item.href)) }))
    .filter((section) => section.items.length > 0);
}

/** The item whose address is the longest match for this page, so only one is highlighted. */
export function activeHref(pathname: string, sections: NavSection[]): string | null {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
