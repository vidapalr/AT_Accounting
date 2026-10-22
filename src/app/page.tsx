
import { Building2, Database, ShieldCheck } from "lucide-react";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ABHIRAM GROUP</p>
        <h1>Accounting & Financial Management</h1>
        <p>
          Centralized accounting, investments, business
          divisions, taxation and financial reporting.
        </p>
      </header>

      <section className={styles.grid}>
        <div className={styles.card}>
          <Building2 size={28} />
          <h2>Business Divisions</h2>
          <p>Manage Textiles and other Group activities.</p>
        </div>

        <div className={styles.card}>
          <Database size={28} />
          <h2>Central Accounting</h2>
          <p>Maintain Group-wide financial records.</p>
        </div>

        <div className={styles.card}>
          <ShieldCheck size={28} />
          <h2>Investor Access</h2>
          <p>Secure division-specific financial visibility.</p>
        </div>
      </section>

      <section className={styles.status}>
        <h2>Application Status</h2>
        <p>Next.js application initialized successfully.</p>
        <span>Step 1 — Project Foundation</span>
      </section>
    </main>
  );
}
