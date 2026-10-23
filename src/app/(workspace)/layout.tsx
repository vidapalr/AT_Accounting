import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { canOpenPath, ROLE_LABELS } from "@/lib/access";
import { NAVIGATION } from "@/lib/navigation";
import SidebarNav from "@/components/SidebarNav";
import BrandLogo from "@/components/BrandLogo";
import styles from "./workspace.module.css";

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
  const user = await requireUser();

  const sections = NAVIGATION
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canOpenPath(user.role, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><BrandLogo size={34} /></div>
          <div>
            <strong>Abhiram Group</strong>
            <span>Accounting</span>
          </div>
        </div>

        <SidebarNav sections={sections} />
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <div>
            <strong>Abhiram Group Accounting</strong>
            <small>Financial Year 2026–27</small>
          </div>

          <div className={styles.userArea}>
            <span>{user.full_name} · {ROLE_LABELS[user.role] ?? user.role}</span>
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
