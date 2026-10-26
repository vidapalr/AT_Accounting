import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_SUMMARY } from "@/lib/access";
import {
  addUserAction,
  changeRoleAction,
  resetPasswordAction,
  setUserStatusAction,
} from "@/lib/user-actions";
import styles from "../accounting/accounting.module.css";

type Props = { searchParams: Promise<{ done?: string; error?: string }> };

export default function UsersPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading users…</p>}>
      <UsersContent {...props} />
    </Suspense>
  );
}

async function UsersContent({ searchParams }: Props) {
  const owner = await requireGroupOwner();
  const query = await searchParams;

  const [users] = await db.execute<RowDataPacket[]>(
    `SELECT u.id, u.full_name, u.email, u.status,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created,
            MAX(a.role) AS role, MAX(a.scope_division_id) AS scope_division_id, MAX(a.party_id) AS party_id
     FROM acct_app_users u
     JOIN acct_user_access a ON a.user_id = u.id AND a.legal_business_id = ?
     GROUP BY u.id, u.full_name, u.email, u.status, u.created_at
     ORDER BY u.id`,
    [owner.legal_business_id]
  );

  const [divisions] = await db.execute<RowDataPacket[]>(
    `SELECT id, name FROM acct_divisions WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY id`, [owner.legal_business_id]);
  const [parties] = await db.execute<RowDataPacket[]>(
    `SELECT id, full_name FROM acct_funding_parties WHERE legal_business_id = ? ORDER BY full_name`, [owner.legal_business_id]);
  const scopeFields = (divisionId: unknown, partyId: unknown) => (
    <>
      <select name="scope_division_id" defaultValue={divisionId ? String(divisionId) : ""} aria-label="Division (for a Manager)">
        <option value="">Division (for a Manager)…</option>
        {divisions.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>)}
      </select>{" "}
      <select name="party_id" defaultValue={partyId ? String(partyId) : ""} aria-label="Investor (for an Investor login)">
        <option value="">Investor (for an Investor login)…</option>
        {parties.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.full_name)}</option>)}
      </select>
    </>
  );

  return (
    <main className={styles.page}>
      <h1>Users &amp; Access</h1>
      <p>
        Add the people who work in this portal and choose what each can open. Anything not listed for a role
        stays hidden from them and is blocked on the server too.
      </p>

      {query.done && <p role="status" style={{ color: "#166534" }}>{query.done}</p>}
      {query.error && <p role="alert" style={{ color: "#b91c1c" }}>{query.error}</p>}

      <h2>People</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isOwner = String(u.role) === "GROUP_OWNER";
            const isMe = Number(u.id) === owner.id;
            return (
              <tr key={String(u.id)}>
                <td>{String(u.full_name)}{isMe ? " (you)" : ""}</td>
                <td>{String(u.email)}</td>
                <td>{ROLE_LABELS[String(u.role)] ?? String(u.role)}</td>
                <td>{String(u.status) === "ACTIVE" ? "Active" : "Disabled"}</td>
                <td>
                  {isOwner ? (
                    "—"
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      <form action={changeRoleAction}>
                        <input type="hidden" name="user_id" value={String(u.id)} />
                        <select name="role" defaultValue={String(u.role)}>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>{" "}
                        {scopeFields(u.scope_division_id, u.party_id)}{" "}
                        <button type="submit">Change access</button>
                      </form>
                      <form action={resetPasswordAction}>
                        <input type="hidden" name="user_id" value={String(u.id)} />
                        <input type="password" name="password" placeholder="New password" minLength={10} autoComplete="new-password" required />{" "}
                        <button type="submit">Set new password</button>
                      </form>
                      <form action={setUserStatusAction}>
                        <input type="hidden" name="user_id" value={String(u.id)} />
                        <input type="hidden" name="status" value={String(u.status) === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                        <button type="submit">{String(u.status) === "ACTIVE" ? "Disable login" : "Enable login"}</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Add a person</h2>
      <form action={addUserAction} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <label>Full name<input name="full_name" required maxLength={160} /></label>
        <label>Email (used to sign in)<input type="email" name="email" required maxLength={190} /></label>
        <label>
          Access
          <select name="role" defaultValue="ACCOUNTANT">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label>
          Only for a Manager (division) or an Investor (which investor)
          <div style={{ display: "grid", gap: 6 }}>{scopeFields(null, null)}</div>
        </label>
        <label>
          Starting password (10+ characters, with a letter and a number)
          <input type="password" name="password" required minLength={10} autoComplete="new-password" />
        </label>
        <button type="submit">Add person</button>
      </form>

      <h2>What each access level can open</h2>
      <ul>
        {["GROUP_OWNER", ...ASSIGNABLE_ROLES].map((r) => (
          <li key={r}><strong>{ROLE_LABELS[r]}:</strong> {ROLE_SUMMARY[r]}</li>
        ))}
      </ul>
    </main>
  );
}
