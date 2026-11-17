import { Suspense } from "react";

import { requireGroupOwner } from "@/lib/auth";
import { saveBrandAction } from "@/lib/brand-actions";
import { BRAND_KEYS } from "@/lib/brand-core";
import { businessSettings } from "@/lib/business-settings";
import { OPTIONAL_MODULES, parseModulesOff } from "@/lib/navigation";
import { Field, PageHeader, ResultNotice, Section } from "@/components/ui";
import { bigButton, fieldFull, formGrid } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ result?: string }> };

const FIELDS: Array<{ key: keyof typeof BRAND_KEYS; label: string; hint?: string }> = [
  { key: "groupName", label: "Group or company name", hint: "Printed at the top of vouchers, letters and reports" },
  { key: "shopName", label: "Shop name customers see", hint: "Bills, website, WhatsApp messages" },
  { key: "tagline", label: "Tagline", hint: "A short line under the name (optional)" },
  { key: "place", label: "Town or area", hint: "e.g. Main Road, Springfield" },
  { key: "description", label: "About the shop", hint: "One or two sentences for the website" },
  { key: "parentLine", label: "Line under the name on bills", hint: "e.g. A part of Acme Group (optional)" },
  { key: "watermark", label: "Faint text behind bills" },
  { key: "shopPhone", label: "Shop phone", hint: "Printed on bills and vouchers" },
  { key: "ownerPhone", label: "Owner's phone on invoices", hint: "Printed on invoices and estimates only" },
  { key: "email", label: "Email" },
  { key: "websites", label: "Website addresses" },
  { key: "appName", label: "Name of this app", hint: "Top bar, exports, authenticator app" },
  { key: "logoSmall", label: "Small logo", hint: "Address of the picture, e.g. /brand/logo-192.png" },
  { key: "logoLarge", label: "Large logo", hint: "e.g. /brand/logo-512.png" },
  { key: "logoPrint", label: "Logo for printing", hint: "e.g. /brand/logo-print.png" },
];

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const saved = await businessSettings(user.legal_business_id, [...Object.values(BRAND_KEYS), "shop_nav_links", "modules_off"]);
  const off = parseModulesOff(saved.modules_off ?? "");

  return (
    <main style={{ maxWidth: 980 }}>
      <PageHeader title="Brand and modules" intro="Everything this business prints and shows: name, phone, logo and website words; and which parts of the app it uses." />
      <ResultNotice result={q.result} messages={{
        saved: { tone: "ok", text: "Saved. Bills, letters, the website and messages now use these details." },
        logo: { tone: "error", text: "A logo must be a picture address starting with / or https://." },
      }} />
      <form action={saveBrandAction}>
        <Section title="Name, contact and logo">
          <div style={formGrid}>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input name={BRAND_KEYS[f.key]} defaultValue={saved[BRAND_KEYS[f.key]] ?? ""} maxLength={255} style={fieldFull} />
              </Field>
            ))}
          </div>
        </Section>
        <Section title="Website quick links">
          <Field label="Links in the shop header" hint="Label|search words, separated by ; for example: Sarees|saree; Cotton sets|cotton">
            <input name="shop_nav_links" defaultValue={saved.shop_nav_links ?? ""} maxLength={255} style={fieldFull} />
          </Field>
        </Section>
        <Section title="Parts of the app this business uses">
          <div style={formGrid}>
            {OPTIONAL_MODULES.map((m) => (
              <label key={m.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name={`module_${m.key}`} value="1" defaultChecked={!off.has(m.key)} /> {m.label}
              </label>
            ))}
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>A part that is switched off disappears from the menu. Selling, money, reports, accounting and set-up are always on.</p>
        </Section>
        <button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save</button>
      </form>
    </main>
  );
}

export default function BrandPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
