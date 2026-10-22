
import { Suspense } from "react";
import {
  Building2,
  Wallet,
  Package,
  TrendingUp,
  Users,
  ShieldCheck,
} from "lucide-react";
import { requireGroupOwner } from "@/lib/auth";
import styles from "./dashboard.module.css";

const modules = [
  { name: "Business Divisions", icon: Building2 },
  { name: "Accounting & Ledger", icon: Wallet },
  { name: "Inventory & Purchases", icon: Package },
  { name: "Sales & Reports", icon: TrendingUp },
  { name: "Investors & Lenders", icon: Users },
  { name: "Taxation & Compliance", icon: ShieldCheck },
];

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className={styles.page}>Loading...</main>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireGroupOwner();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>ABHIRAM GROUP</p>
          <h1>Accounting Dashboard</h1>
          <p className={styles.subtitle}>
            Welcome, {user.full_name}
          </p>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button className={styles.logout} type="submit">
            Logout
          </button>
        </form>
      </header>

      <div className={styles.content}>
        <section className={styles.welcome}>
          <h2>Group Financial Management</h2>
          <p>
            Your secure accounting workspace is ready.
            Business modules will be enabled step by step.
          </p>
          <span>Role: {user.role}</span>
        </section>

        <section className={styles.grid}>
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article
                key={module.name}
                className={styles.card}
              >
                <Icon size={28} />
                <h3>{module.name}</h3>
                <p>Coming in the next development stages</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
