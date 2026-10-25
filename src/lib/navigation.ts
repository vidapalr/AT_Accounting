/**
 * The sidebar, grouped by how work is actually done. Plain words on purpose:
 * staff should never have to guess what a menu item means.
 *
 * Who sees what is decided by canOpenPath() in access.ts, so adding an item
 * here never shows it to someone who cannot open the page.
 */

export type NavItem = {
  label: string;
  href: string;
  /** One short line shown on hover. */
  hint?: string;
};

export type NavSection = {
  id: string;
  label: string;
  icon: "home" | "customers" | "sell" | "buy" | "work" | "stock" | "reports" | "investors" | "accounting" | "setup";
  items: NavItem[];
};

export const NAVIGATION: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: "home",
    items: [{ label: "Dashboard", href: "/dashboard", hint: "Today's sales, profit and money at a glance" }],
  },
  {
    id: "sell",
    label: "Selling",
    icon: "sell",
    items: [
      { label: "New sale / bill", href: "/accounting/sales", hint: "Make a bill and take payment" },
      { label: "Invoices", href: "/accounting/invoices", hint: "Find, view and print past bills" },
      { label: "Returns and refunds", href: "/accounting/returns", hint: "Customer returns, refunds, damaged stock" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "customers",
    items: [
      { label: "All customers", href: "/accounting/customers", hint: "Customer list, history and credit limits" },
      { label: "Money customers owe", href: "/accounting/customers?view=dues", hint: "Customers with unpaid bills" },
      { label: "Who owes, and how long", href: "/accounting/customer-ageing", hint: "Unpaid bills by age, with a WhatsApp reminder" },
    ],
  },
  {
    id: "buy",
    label: "Buying",
    icon: "buy",
    items: [
      { label: "Buy stock (purchases)", href: "/accounting/purchases", hint: "Record stock bought from suppliers" },
      { label: "Supplier bills and payments", href: "/accounting/purchase-management", hint: "Receive goods and pay supplier bills" },
      { label: "Return goods to supplier", href: "/accounting/supplier-returns", hint: "Send items back and get credit, refund or replacement" },
      { label: "Supplier statement", href: "/accounting/supplier-statement", hint: "What you owe each supplier, and how old it is" },
    ],
  },
  {
    id: "work",
    label: "Other daily work",
    icon: "work",
    items: [
      { label: "Move stock", href: "/accounting/stock-transfers", hint: "Send stock between warehouse and shops" },
      { label: "Give stock free", href: "/accounting/free-stock", hint: "Gifts, samples and promotions (a business expense)" },
      { label: "Close the day (cash count)", href: "/accounting/cash-closing", hint: "Count the cash drawer and compare with what the system expects" },
      { label: "Count stock", href: "/accounting/stock-count", hint: "Count what is on the shelf and compare with the books" },
      { label: "Items on approval", href: "/accounting/approval-items", hint: "Customer takes items home to try, pays only for what they keep" },
      { label: "Shop spending", href: "/accounting/shop-spending", hint: "Note small cash spending: auto, tea, packing, repairs" },
      { label: "Salaries", href: "/accounting/salaries", hint: "Pay the staff each month and send pay slips" },
      { label: "Expenses", href: "/accounting/expenses", hint: "Rent, salaries, transport and other costs" },
      { label: "Advances and deposits", href: "/accounting/advances-deposits", hint: "Money paid in advance or as deposit" },
    ],
  },
  {
    id: "stock",
    label: "Stock and products",
    icon: "stock",
    items: [
      { label: "Stock on hand", href: "/accounting/stock", hint: "What is in every warehouse and shop right now" },
      { label: "Running low", href: "/accounting/low-stock", hint: "Items below the minimum you set, ready to reorder" },
      { label: "Staff stock reports", href: "/accounting/stock-reports", hint: "Approve what staff report on WhatsApp" },
      { label: "Catalogue", href: "/accounting/catalogue", hint: "Photos and videos of every product" },
      { label: "New stock arrivals", href: "/accounting/catalogue/new-stock", hint: "Newly received stock, ready to announce" },
      { label: "Products", href: "/accounting/products", hint: "Product list, sizes and colours" },
      { label: "Product groups", href: "/accounting/product-categories", hint: "Categories for products" },
      { label: "Suppliers", href: "/accounting/suppliers", hint: "People you buy from" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "reports",
    items: [
      { label: "Profit and balance sheet", href: "/accounting/reports", hint: "Gross, operating and net profit; what the group owns and owes" },
      { label: "Where the money went", href: "/accounting/cash-flow", hint: "Money in and out of cash and bank, and what is left" },
      { label: "Money in bank and cash", href: "/accounting/account-balances", hint: "Where the money is and how it moved" },
      { label: "Sales and purchase report", href: "/accounting/sales-purchase-report", hint: "Day-by-day sales, purchases and profit" },
      { label: "Product profit", href: "/accounting/product-profitability", hint: "Which products earn the most" },
      { label: "Send reports on WhatsApp", href: "/accounting/whatsapp", hint: "Daily and monthly reports to your team" },
    ],
  },
  {
    id: "investors",
    label: "Investors",
    icon: "investors",
    items: [
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
    id: "accounting",
    label: "Accounting",
    icon: "accounting",
    items: [
      { label: "Journals", href: "/accounting/journals", hint: "Every accounting entry" },
      { label: "Auditor adjustments", href: "/accounting/auditor-adjustments", hint: "Record a change your auditor asked for, as its own dated entry" },
      { label: "Every ledger line", href: "/accounting/audit/ledger", hint: "Search every posted entry by date, account or words (view only)" },
      { label: "Download for the auditor", href: "/accounting/audit/export", hint: "Excel and Tally files of the books" },
      { label: "Change history", href: "/accounting/audit/changes", hint: "Who did what, and when" },
      { label: "Chart of accounts", href: "/accounting/chart-of-accounts", hint: "The list of accounts" },
      { label: "Months and years", href: "/accounting/periods", hint: "Open and close accounting months" },
      { label: "Opening balances", href: "/accounting/opening-balances", hint: "What the business started with" },
    ],
  },
  {
    id: "setup",
    label: "Set-up",
    icon: "setup",
    items: [
      { label: "Group details", href: "/group" },
      { label: "Divisions", href: "/divisions" },
      { label: "Branches", href: "/branches" },
      { label: "Bank accounts", href: "/accounting/bank-accounts" },
      { label: "Cash accounts", href: "/accounting/cash-accounts" },
      { label: "GST settings", href: "/accounting/gst-settings", hint: "Not registered yet; keeps the app ready" },
      { label: "Backup", href: "/accounting/backup", hint: "Download a full copy of your accounting data" },
      { label: "Users and access", href: "/users", hint: "Who can sign in and what they can open" },
    ],
  },
  {
    id: "cutover",
    label: "One-time cut-over",
    icon: "setup",
    items: [
      { label: "Investor bank links", href: "/accounting/investor-bank-scopes", hint: "One-time set-up" },
      { label: "Change investor scope", href: "/accounting/investor-scope-amendment", hint: "One-time set-up" },
      { label: "Earlier funding entries", href: "/accounting/historical-funding", hint: "One-time set-up" },
      { label: "Cut-over check", href: "/accounting/cutover-reconciliation", hint: "One-time set-up" },
      { label: "Cut-over check by agreement", href: "/accounting/cutover-reconciliation/agreements", hint: "One-time set-up" },
    ],
  },
];

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
