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
  | "LENDER";

/** Roles that can sign in to this portal today. */
export const LOGIN_ROLES: Role[] = ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"];

/** Roles the owner can hand out from the Users page. */
export const ASSIGNABLE_ROLES: Role[] = ["ACCOUNTANT", "CASHIER"];

export const ROLE_LABELS: Record<string, string> = {
  GROUP_OWNER: "Group Owner (full access)",
  ACCOUNTANT: "Accountant",
  CASHIER: "Cashier / Billing",
};

export const ROLE_SUMMARY: Record<string, string> = {
  GROUP_OWNER: "Everything, including opening balances, posting, periods, investors and users.",
  ACCOUNTANT:
    "Dashboard, reports, sales, returns, purchases, suppliers, products, expenses and advances. Cannot post to the ledger, change opening balances, periods, investors, bank set-up or users.",
  CASHIER: "Sales and billing, sales returns and customers. Nothing else.",
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
  | "customers";

const FEATURE_ROLES: Record<Feature, Role[]> = {
  dashboard: ["GROUP_OWNER", "ACCOUNTANT"],
  reports: ["GROUP_OWNER", "ACCOUNTANT"],
  sales: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"],
  returns: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"],
  purchases: ["GROUP_OWNER", "ACCOUNTANT"],
  products: ["GROUP_OWNER", "ACCOUNTANT"],
  expenses: ["GROUP_OWNER", "ACCOUNTANT"],
  stock: ["GROUP_OWNER", "ACCOUNTANT"],
  customers: ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"],
};

export function canAccess(role: string, feature: Feature): boolean {
  return (FEATURE_ROLES[feature] as string[]).includes(role);
}

/** Page prefixes that belong to a feature. Anything not listed is owner only. */
const PATH_FEATURES: Array<[string, Feature]> = [
  ["/dashboard", "dashboard"],
  ["/accounting/reports", "reports"],
  ["/accounting/sales-purchase-report", "reports"],
  ["/accounting/product-profitability", "reports"],
  ["/accounting/account-balances", "reports"],
  ["/accounting/sales", "sales"],
  ["/accounting/invoices", "sales"],
  ["/accounting/returns", "returns"],
  ["/accounting/purchases", "purchases"],
  ["/accounting/purchase-management", "purchases"],
  ["/accounting/stock-transfers", "purchases"],
  ["/accounting/suppliers", "purchases"],
  ["/accounting/products", "products"],
  ["/accounting/product-categories", "products"],
  ["/accounting/catalogue", "products"],
  ["/accounting/customers", "customers"],
  ["/accounting/stock", "stock"],
  ["/accounting/stock-reports", "stock"],
  ["/accounting/warehouse-inventory", "stock"],
  ["/accounting/branch-inventory", "stock"],
  ["/accounting/expenses", "expenses"],
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
  return "/login";
}
