import test from "node:test";
import assert from "node:assert/strict";
import { classifyFlow, buildCashFlow } from "../src/lib/reports/cash-flow.ts";

test("entries are sorted into day-to-day, deposits and owner money", () => {
  assert.equal(classifyFlow("SALES_RECEIPT").section, "OPERATING");
  assert.equal(classifyFlow("PURCHASE_PAYMENT").section, "OPERATING");
  assert.equal(classifyFlow("DEPOSIT_PAID").section, "INVESTING");
  assert.equal(classifyFlow("INVESTOR_FUNDING").section, "FINANCING");
  assert.equal(classifyFlow("SETUP_CAPITALISATION").section, "OTHER");
  assert.equal(classifyFlow(null).section, "OTHER");
  assert.equal(classifyFlow("AUDITOR_ADJUSTMENT").section, "OTHER");
});

test("opening plus movement equals closing, and nothing that moved is hidden", () => {
  const flow = buildCashFlow(
    [
      { sourceType: "SALES_RECEIPT", netPaise: 5000000n },
      { sourceType: "SALES_RECEIPT", netPaise: 1000000n },
      { sourceType: "PURCHASE_PAYMENT", netPaise: -2885000n },
      { sourceType: "DEPOSIT_PAID", netPaise: -500000n },
      { sourceType: "OPENING_BALANCE", netPaise: 1323400n },
      { sourceType: "JOURNAL_REVERSAL", netPaise: -10000n },
    ],
    100000n
  );
  const operating = flow.sections.find((s) => s.section === "OPERATING");
  assert.equal(operating.total, 5000000n + 1000000n - 2885000n);
  assert.equal(operating.lines.length, 2); // customers and suppliers
  assert.equal(flow.movement, 5000000n + 1000000n - 2885000n - 500000n + 1323400n - 10000n);
  assert.equal(flow.closingPaise, 100000n + flow.movement);
});

test("a kind with nothing in it is left out", () => {
  const flow = buildCashFlow([{ sourceType: "SALES_RECEIPT", netPaise: 0n }], 0n);
  assert.equal(flow.sections.length, 0);
});
