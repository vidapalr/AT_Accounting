import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { canOpenPath, ROLE_LABELS } from "@/lib/access";
import { NAVIGATION } from "@/lib/navigation";
import SidebarNav from "@/components/SidebarNav";
import DivisionSwitcher from "@/components/DivisionSwitcher";
import { getActiveDivisionId, listDivisions } from "@/lib/division-context";
import MobileMenu from "@/components/MobileMenu";
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

  const divisions = await listDivisions(user.legal_business_id, user.scope_division_id);
  const activeDivisionId = divisions.length > 1 ? await getActiveDivisionId(user) : (divisions[0]?.id ?? 0);

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

        <MobileMenu>
          <SidebarNav sections={sections} />
        </MobileMenu>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <div>
            <strong>Abhiram Group Accounting</strong>
            <small>Financial Year 2026–27</small>
          </div>

          <div className={styles.userArea}>
            {divisions.length > 1 && user.role !== "INVESTOR" && (
              <DivisionSwitcher divisions={divisions} activeId={activeDivisionId} />
            )}
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
