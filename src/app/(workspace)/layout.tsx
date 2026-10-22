import { Suspense } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  Layers3,
  BookOpen,
  Package,
  Users,
  BarChart3,
  Store,  
  ChevronDown,
} from "lucide-react";



import { requireGroupOwner } from "@/lib/auth";
import styles from "./workspace.module.css";

const navigation = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    enabled: true,
  },
  {
    label: "Group Master",
    href: "/group",
    icon: Building2,
    enabled: true,
    children: [
      {
        label: "Group Master",
        href: "/group",
        icon: Building2,
        enabled: true,
      },
      {
        label: "Divisions",
        href: "/divisions",
        icon: Layers3,
        enabled: true,
      },
      {
        label: "Branches",
        href: "/branches",
        icon: Store,
        enabled: true,
      },
      {
        label: "Bank Accounts",
        href: "/accounting/bank-accounts",
        icon: BookOpen,
        enabled: true,
        },
      {
        label: "Investors & Lenders",
        href: "/funding",
        icon: Users,
        enabled: true,
      },
    ],
  },
  
  {
    label: "Accounting",
    href: "/accounting/chart-of-accounts",
    icon: BookOpen,
    enabled: true,
    children: [
      {
        label: "Investor Bank Scopes",
        href: "/accounting/investor-bank-scopes",
        enabled: true,
      },
      {
        label: "Opening Balances",
        href: "/accounting/opening-balances",
        enabled: true,
      },
      {
        label: "Review Opening Balances",
        href: "/accounting/opening-balances/review",
        enabled: true,
      },
      {
        label: "Cutover Reconciliation",
        href: "/accounting/cutover-reconciliation",
        enabled: true,
      },
      {
        label: "Agreement-Level Reconciliation",
        href: "/accounting/cutover-reconciliation/agreements",
        enabled: true,
      },
      {
        label: " Historical Funding Entry",
        href: "/accounting/historical-funding",
        enabled: true,
      },
      {
        label: "Accounting",
        href: "/accounting/chart-of-accounts",
        icon: BookOpen,
        enabled: true,
      },
            {
        label: "Periods",
        href: "/accounting/periods",
        enabled: true,
      },
      {
        label: "Journals",
        href: "/accounting/journals",
        enabled: true,
      },
      {
        label: "Cash of Accounts",
        href: "/accounting/cash-accounts",
        enabled: true,
      },
       {
        label: "Investment Accounts",
        href: "/accounting/investment-accounts",
        enabled: true,
      },
      {
        label: "Accounts Balance",
        href: "/accounting/account-balances",
        enabled: true,
      },
      {
        label: "Reports (Profit, Balance Sheet)",
        href: "/accounting/reports",
        enabled: true,
      },
      
      
    ],
  },

  {
    label: "Divison Inventory",
    href: "/group",
    icon: Building2,
    enabled: true,
    children: [
      {
        label: " Warehouse Inventory",
        href: "/accounting/warehouse-inventory",
        enabled: true,
      },
    ],
  },

  {
    label: "Branch Inventory",
    href: "/group",
    icon: Building2,
    enabled: true,
    children: [
      {
        label: " Branch Inventory",
        href: "/accounting/branch-inventory",
        enabled: true,
      },
    ],
  },
  
    
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    enabled: true,
    children: [
      {
        label: " Product Categories",
        href: "/accounting/product-categories",
        enabled: true,
      },
      {
        label: " Product Master",
        href: "/accounting/products",
        enabled: true,
      },
      {
        label: " Supplier Master",
        href: "/accounting/suppliers",
        enabled: true,
      },
      
    ]
  },
  
  {
    label: "Purchase Management",
    href: "/accounting/purchases",
    icon: BarChart3,
    enabled: true,
    children: [
      {
        label: " Purchases",
        href: "/accounting/purchases",
        enabled: true,
      },      
      {
        label: " Purchase Management",
        href: "/accounting/purchase-management",
        enabled: true,
      },
      {
        label: " Stock Transfers",
        href: "/accounting/stock-transfers",
        enabled: true,
      },
      
      
    ]
  },

  {
    label: "Sales & Billing",
    href: "/accounting/sales",
    icon: BookOpen,
    enabled: true,
    children: [
      {
        label: "Sales",
        href: "/accounting/sales",
        enabled: true,
      },
      {
        label: "Invoice Overview",
        href: "/accounting/invoices",
        enabled: true,
      },
      {
        label: "Product Profitability",
        href: "/accounting/product-profitability",
        enabled: true,
      },
      {
        label: "Sales & Purchase Report",
        href: "/accounting/sales-purchase-report",
        enabled: true,
      },
         
    ],
  },
  {
    label: "Expenses",
    href: "/accounting/expenses",
    icon: BookOpen,
    enabled: true,
    children: [
      {
        label: "Expenses",
        href: "/accounting/expenses",
        enabled: true,
      },
      {
        label: "Advances & Deposits",
        href: "/accounting/advances-deposits",
        enabled: true,
      },
    ]
  },
];



export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div>Loading workspace...</div>}>
      <WorkspaceContent>{children}</WorkspaceContent>
    </Suspense>
  );
}

async function WorkspaceContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireGroupOwner();

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>AG</div>
          <div>
            <strong>Abhiram Group</strong>
            <span>Accounting</span>
          </div>
        </div>

        <nav className={styles.navigation}>
          {navigation.map((item) => {
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <div
                  className={styles.disabled}
                  key={item.label}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <small>Soon</small>
                </div>
              );
            }

            if ("children" in item && item.children) {
              return (
                <details
                  className={styles.navGroup}
                  key={item.label}
                >
                  <summary className={styles.navGroupSummary}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                    <ChevronDown
                      className={styles.navGroupChevron}
                      size={16}
                    />
                  </summary>

                  <div className={styles.subNavigation}>
                    
                    {item.children
                      .filter((child) => child.enabled)
                      .map((child) => (
                        <Link
                          href={child.href}
                          className={styles.subNavLink}
                          key={child.href}
                        >
                          {child.label}
                        </Link>
                      ))}
                  </div>
                </details>
              );
            }

            return (
              <Link
                href={item.href}
                className={styles.navLink}
                key={item.href}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <div>
            <strong>Abhiram Group Accounting</strong>
            <small>Financial Year 2026–27</small>
          </div>

          <div className={styles.userArea}>
            <span>{user.full_name}</span>
            <form action="/api/auth/logout" method="POST">
              <button type="submit">Logout</button>
            </form>
          </div>
        </header>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
