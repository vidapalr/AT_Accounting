import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, cleanParam, previousMonth, reportPeriod, parseScope, templateFor, TEMPLATES, REPORT_TYPES, JOB_REPORTS } from "../src/lib/whatsapp/core.ts";

test("phone numbers are normalised to +E.164", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("098765-43210"), "+919876543210");
  assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("919876543210"), "+919876543210");
  assert.equal(normalizePhone("+1 415 555 2671"), "+14155552671");
  for (const bad of ["", "12345", "5876543210", "+91 12345 67890", "abc", "+91987654321"]) assert.equal(normalizePhone(bad), null, bad);
});

test("template values are single-line and bounded", () => {
  assert.equal(cleanParam("a\nb\tc"), "a b c");
  assert.equal(cleanParam("x     y"), "x   y");
  assert.equal(cleanParam(""), "-");
  assert.equal(cleanParam("z".repeat(300)).length, 200);
});

test("monthly reports cover the previous month, daily ones today", () => {
  assert.deepEqual(previousMonth("2026-11-01"), { from: "2026-10-01", to: "2026-10-31", key: "2026-10" });
  assert.deepEqual(previousMonth("2027-01-01"), { from: "2026-12-01", to: "2026-12-31", key: "2026-12" });
  assert.deepEqual(previousMonth("2028-03-01"), { from: "2028-02-01", to: "2028-02-29", key: "2028-02" });
  assert.deepEqual(reportPeriod("DAILY_SALES", "2026-10-22"), { from: "2026-10-22", to: "2026-10-22", key: "2026-10-22" });
  assert.equal(reportPeriod("INVESTOR_STATEMENT", "2026-11-01").key, "2026-10");
});

test("every report type has a template whose placeholders match its parameter count", () => {
  for (const type of REPORT_TYPES) {
    const t = templateFor(type);
    const found = new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    assert.equal(found.size, t.paramCount, type);
    for (let i = 1; i <= t.paramCount; i++) assert.ok(found.has(i), `${type} {{${i}}}`);
  }
  assert.equal(TEMPLATES.length, REPORT_TYPES.length);
  assert.equal(templateFor("ALERTS", { WHATSAPP_TEMPLATE_ALERTS: "my_alerts" }).name, "my_alerts");
});

test("jobs cover every report type exactly once", () => {
  const all = Object.values(JOB_REPORTS).flat().sort();
  assert.deepEqual(all, [...REPORT_TYPES].sort());
});

test("scope values", () => {
  assert.deepEqual(parseScope("G"), { divisionId: null, branchId: null });
  assert.equal(parseScope("D:3").divisionId, 3);
  assert.equal(parseScope("B:7").branchId, 7);
  assert.equal(parseScope("X:1"), null);
});

import { composeMessage, whatsappLink } from "../src/lib/whatsapp/core.ts";

test("tap-to-send message holds the key figures and no PDF promise", () => {
  const daily = {
    type: "DAILY_SALES", title: "Daily Sales Summary", subtitle: "Whole group - 20 Oct 2026",
    params: ["20 Oct 2026", "Whole group", "3", "₹71,650", "₹49,650", "₹24,115"],
    sections: [
      { heading: "Profit for the day", columns: ["", "Amount"], rows: [["Sales", "₹76,100.00"], ["Gross profit", "₹24,115.00"]] },
      { heading: "Invoices", columns: ["Invoice", "Customer", "Total"], rows: [["A1", "X", "₹1"]] },
    ],
  };
  const text = composeMessage(daily, "Owner");
  assert.match(text, /\*Abhiram Group\* - Daily Sales Summary/);
  assert.match(text, /Gross profit: ₹24,115.00/);
  assert.doesNotMatch(text, /Invoices|attached/);

  const inv = composeMessage({ type: "INVESTOR_STATEMENT", title: "t", subtitle: "s", params: ["Test Investor", "October 2026", "₹16,235.00", "1"], sections: [] }, "Test Investor");
  assert.match(inv, /Dear Test Investor/);
  assert.match(inv, /₹16,235.00/);

  const stock = composeMessage({ type: "STOCK_DAILY", title: "Daily Stock Report", subtitle: "s", params: ["d", "p", "22", "1122.5", "31"], sections: [] }, "O");
  assert.match(stock, /Items in stock: 22/);
});

test("whatsapp link uses digits only and encodes the text", () => {
  const url = whatsappLink("+919876543210", "Hi & bye\nline 2");
  assert.equal(url, "https://wa.me/919876543210?text=Hi%20%26%20bye%0Aline%202");
});

test("morning digest is a morning job and reads as plain lines", async () => {
  const core = await import("../src/lib/whatsapp/core.ts");
  assert.ok(core.JOB_REPORTS.morning.includes("MORNING_DIGEST"));
  assert.ok(core.REPORT_TYPES.includes("MORNING_DIGEST"));
  const text = core.composeMessage({
    type: "MORNING_DIGEST", title: "Morning Digest", subtitle: "Whole group - 29 Oct 2026", params: [],
    sections: [{ heading: "Needs you", columns: ["", ""], rows: [["New website orders", "3"]] }],
  }, "Owner");
  assert.match(text, /New website orders: 3/);
});
