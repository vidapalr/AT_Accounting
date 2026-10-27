/**
 * Who may open what.
 *
 * Deny by default: every page and action that is not listed under a feature
 * here stays Group Owner only. Features map to roles below; the sidebar and
 * the server-side checks both read this one table, so they cannot disagree.
 */

export type Role =
  | "GROUP_OWNER"
  | "ACCOUNTANT"
  | "DIVISION_MANAGER"
  | "CASHIER"
  | "INVESTOR"
  | "LENDER"
  | "AUDITOR";

/** Who may approve stock given away free (others can only ask). */
export function canApproveFreeStock(role: string): boolean {
  return role === "GROUP_OWNER" || role === "ACCOUNTANT";
}

/** Turning count shortages into lost stock changes the books: not for the cashier. */
export function canWriteOffStockCount(role: string): boolean {
  return role === "GROUP_OWNER" || role === "ACCOUNTANT";
}

/** The most a cashier can note as shop spending in one entry, in rupees. Above this the owner or accountant records it. */
export const CASHIER_SPENDING_LIMIT = 5000;

/** Joining two customer records into one is not for the cashier. */
export function canMergeCustomers(role: string): boolean {
  return role === "GROUP_OWNER" || role === "ACCOUNTANT";
}

/** Roles that can sign in to this portal today. */
export const LOGIN_ROLES: Role[] = ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER", "AUDITOR", "INVESTOR"];

/** Roles the owner can hand out from the Users page. */
export const ASSIGNABLE_ROLES: Role[] = ["ACCOUNTANT", "CASHIER", "DIVISION_MANAGER", "AUDITOR", "INVESTOR"];

export const ROLE_LABELS: Record<string, string> = {
  GROUP_OWNER: "Group Owner (full access)",
  ACCOUNTANT: "Accountant",
  CASHIER: "Cashier / Billing",
  DIVISION_MANAGER: "Manager (one division)",
  AUDITOR: "Auditor (view only)",
  INVESTOR: "Investor (own investment only)",
};

export const ROLE_SUMMARY: Record<string, string> = {
  GROUP_OWNER: "Everything, including opening balances, posting, periods, investors and users.",
  ACCOUNTANT:
    "Dashboard, reports, sales, returns, purchases, suppliers, products, expenses and advances. Cannot post to the ledger, change opening balances, periods, investors, bank set-up or users.",
  CASHIER: "Sales and billing, sales returns and customers. Nothing else.",
  DIVISION_MANAGER:
    "Runs the shop floor of one division: sales and billing, returns, customers, stock, stock count, cash closing, shop spending and free-stock requests. Division pages show only that division. No purchases, reports, profit, bank or user set-up.",
  INVESTOR:
    "Sees only their own investment: money put in and paid back, their profit share for any period, and their agreement terms. Nothing else in the portal.",
  AUDITOR:
    "Can only look: reports, every ledger entry, account balances and the change history. Cannot add, change or post anything.",
};

export type Feature =
  | "dashboard"
  | "reports"
  | "sales"
  | "returns"
  | "purchases"
  | "products"
  | "expenses"
  | "stock"
  | "supplier_returns"
  | "free_stock"
  | "approval_items"
  | "cash_closing"
  | "stock_count"
  | "audit_view"
  | "shop_spending"
  | "salary"
  | "both_sides"
  | "online_orders"
  | "investor_view"
  | "customers";

const FEATURE_ROLES: Record<Feature, Role[]> = {
  dashboard: ["GROUP_OWNER", "ACCOUNTANT"],
  reports: ["GROUP_OWNER", "ACCOUNTANT", "AUDITOR"],
  sales: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  returns: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  purchases: ["GROUP_OWNER", "ACCOUNTANT"],
  products: ["GROUP_OWNER", "ACCOUNTANT"],
  expenses: ["GROUP_OWNER", "ACCOUNTANT"],
  stock: ["GROUP_OWNER", "ACCOUNTANT", "DIVISION_MANAGER"],
  supplier_returns: ["GROUP_OWNER", "ACCOUNTANT"],
  // Everyone can ask for free stock; only owner and accountant approve it.
  free_stock: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  approval_items: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  cash_closing: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  stock_count: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  // Read-only pages for the auditor (every ledger line, change history).
  audit_view: ["GROUP_OWNER", "AUDITOR"],
  // Anyone at the counter can note small cash spending (the cashier has a limit); salary is for owner and accountant.
  shop_spending: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
  salary: ["GROUP_OWNER", "ACCOUNTANT"],
  // Suppliers who are also customers: link them and set one amount off against the other.
  both_sides: ["GROUP_OWNER", "ACCOUNTANT"],
  // Orders customers place on the public shop; staff confirm and reply.
  online_orders: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"],
  // An investor sees only their own investment (the page filters to the investor tied to the login).
  investor_view: ["INVESTOR"],
  customers: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER", "DIVISION_MANAGER"],
};

export function canAccess(role: string, feature: Feature): boolean {
  return (FEATURE_ROLES[feature] as string[]).includes(role);
}

/** Page prefixes that belong to a feature. Anything not listed is owner only. */
const PATH_FEATURES: Array<[string, Feature]> = [
  ["/dashboard", "dashboard"],
  ["/accounting/audit", "audit_view"],
  ["/accounting/reports", "reports"],
  ["/accounting/sales-purchase-report", "reports"],
  ["/accounting/product-profitability", "reports"],
  ["/accounting/account-balances", "reports"],
  ["/accounting/cash-flow", "reports"],
  ["/accounting/online-orders", "online_orders"],
  ["/accounting/offers", "products"],
  ["/accounting/sales", "sales"],
  ["/accounting/invoices", "sales"],
  ["/accounting/returns", "returns"],
  ["/accounting/purchases", "purchases"],
  ["/accounting/purchase-management", "purchases"],
  ["/accounting/purchase-orders", "purchases"],
  ["/accounting/stock-transfers", "purchases"],
  ["/accounting/suppliers", "purchases"],
  ["/accounting/products", "products"],
  ["/accounting/product-categories", "products"],
  ["/accounting/catalogue", "products"],
  ["/accounting/customers", "customers"],
  ["/accounting/customer-ageing", "customers"],
  ["/accounting/supplier-returns", "supplier_returns"],
  ["/accounting/supplier-statement", "supplier_returns"],
  ["/accounting/free-stock", "free_stock"],
  ["/accounting/approval-items", "approval_items"],
  ["/accounting/cash-closing", "cash_closing"],
  ["/accounting/shop-spending", "shop_spending"],
  ["/accounting/salaries", "salary"],
  ["/accounting/staff-advances", "salary"],
  ["/accounting/both-sides", "both_sides"],
  ["/accounting/my-investment", "investor_view"],
  ["/accounting/stock-count", "stock_count"],
  ["/accounting/low-stock", "stock"],
  ["/accounting/stock", "stock"],
  ["/accounting/stock-reports", "stock"],
  ["/accounting/warehouse-inventory", "stock"],
  ["/accounting/branch-inventory", "stock"],
  ["/accounting/expenses", "expenses"],
  ["/accounting/fixed-assets", "expenses"],
  ["/accounting/advances-deposits", "expenses"],
];

export function featureForPath(path: string): Feature | null {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  for (const [prefix, feature] of PATH_FEATURES) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

export function canOpenPath(role: string, path: string): boolean {
  if (role === "GROUP_OWNER") return true;
  const feature = featureForPath(path);
  return feature !== null && canAccess(role, feature);
}

/** Where a person lands after sign-in, or when they open something they may not. */
export function homePath(role: string): string {
  if (canAccess(role, "dashboard")) return "/dashboard";
  if (canAccess(role, "sales")) return "/accounting/sales";
  if (role === "AUDITOR") return "/accounting/reports";
  if (role === "INVESTOR") return "/accounting/my-investment";
  return "/login";
}

/** Only the owner or accountant can change a day that has already been closed. */
export function canRedoCashClosing(role: string): boolean {
  return role === "GROUP_OWNER" || role === "ACCOUNTANT";
}

/** Only the owner or accountant can give a discount to close a bill. */
export function canGiveBillDiscount(role: string): boolean {
  return role === "GROUP_OWNER" || role === "ACCOUNTANT";
}
