import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { otpAuthUrl } from "@/lib/totp";
import { hasTwoStep, pendingSecret, backupCodesLeft } from "@/lib/two-step";
import {
  startTwoStepAction, confirmTwoStepAction, turnOffTwoStepAction, newBackupCodesAction,
} from "@/lib/two-step-actions";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ done?: string; error?: string }> };

export default function SecurityPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SecurityContent {...props} />
    </Suspense>
  );
}

async function SecurityContent({ searchParams }: Props) {
  const user = await requireUser();
  if (user.role !== "GROUP_OWNER" && user.role !== "ACCOUNTANT") redirect("/dashboard");
  const query = await searchParams;

  let on = false, secret: string | null = null, left = 0, tablesMissing = false;
  try {
    on = await hasTwoStep(user.id);
    secret = on ? null : await pendingSecret(user.id);
    left = on ? await backupCodesLeft(user.id) : 0;
  } catch { tablesMissing = true; }

  const jar = await cookies();
  const justCodes = (jar.get("abhiram_backup_codes")?.value ?? "").split(",").filter(Boolean);

  const qr = secret ? await QRCode.toDataURL(otpAuthUrl(secret, user.email), { margin: 1, width: 220 }) : null;
  const big = { padding: "14px 18px", fontSize: 16 } as const;

  return (
    <main className={styles.page}>
      <h1>Two-step login</h1>
      <p>
        With two-step login, a password alone is not enough. After the password you type a 6-digit code from an
        app on your phone (Google Authenticator or Microsoft Authenticator). It is optional, and recommended for
        the owner and the accountant.
      </p>

      {query.done && <p role="status" style={{ color: "#166534" }}>{query.done}</p>}
      {query.error && <p role="alert" style={{ color: "#b91c1c" }}>{query.error}</p>}

      {tablesMissing && (
        <p role="alert" style={{ color: "#b91c1c" }}>The database file 065_two_step_login has not been run yet.</p>
      )}

      {justCodes.length > 0 && (
        <section style={{ border: "2px solid #166534", borderRadius: 10, padding: 16, margin: "16px 0" }}>
          <h2>Your backup codes — save them now</h2>
          <p>Each code works once if you lose your phone. They are shown only this time. Write them down or keep them somewhere safe.</p>
          <ul style={{ columns: 2, fontFamily: "monospace", fontSize: 18, listStyle: "none", padding: 0 }}>
            {justCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}

      {!tablesMissing && !on && !secret && (
        <form action={startTwoStepAction}>
          <button type="submit" style={big}>Turn on two-step login</button>
        </form>
      )}

      {!tablesMissing && !on && secret && qr && (
        <section style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <h2>Step 1: scan this in your authenticator app</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={220} height={220} />
          <p>Cannot scan? In the app choose &ldquo;enter a setup key&rdquo; and type: <strong style={{ fontFamily: "monospace" }}>{secret}</strong></p>
          <h2>Step 2: type the 6-digit code the app shows</h2>
          <form action={confirmTwoStepAction} style={{ display: "grid", gap: 10 }}>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required placeholder="123456" style={big} />
            <button type="submit" style={big}>Confirm and turn on</button>
          </form>
        </section>
      )}

      {!tablesMissing && on && (
        <section style={{ display: "grid", gap: 18, maxWidth: 420 }}>
          <p role="status" style={{ color: "#166534" }}><strong>Two-step login is ON.</strong> Backup codes left: {left}.</p>
          <form action={newBackupCodesAction} style={{ display: "grid", gap: 8 }}>
            <label>Get new backup codes (the old ones stop working). Type a code from the app:
              <input name="code" inputMode="numeric" maxLength={8} required placeholder="123456" />
            </label>
            <button type="submit">Make new backup codes</button>
          </form>
          <form action={turnOffTwoStepAction} style={{ display: "grid", gap: 8 }}>
            <label>Turn two-step login off. Type a code from the app:
              <input name="code" inputMode="numeric" maxLength={8} required placeholder="123456" />
            </label>
            <button type="submit">Turn off</button>
          </form>
        </section>
      )}
    </main>
  );
}
