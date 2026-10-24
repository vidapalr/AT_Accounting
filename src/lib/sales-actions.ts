
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { findOrCreateCustomer, customerDuesPaise } from "@/lib/customers";
import { normalizePhone } from "@/lib/customer-phone";
import { db } from "@/lib/db";
import { divisionOfBranch } from "@/lib/division-context";
import { requireAccess } from "@/lib/auth";
import { releaseItemsForSale } from "@/lib/approval-stock";

const PAGE = "/accounting/sales";

type SaleLineInput = {
  variantId: number;
  quantity: string;
  price: string;
  discount: string;
  overrideReason?: string;
};

type PaymentInput = {
  method: string;
  amount: string;
  reference?: string;
  account: string;
};

const PAYMENT_METHODS = new Set([
  "CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER",
]);

function parseAmount(value: string): bigint {
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid monetary amount");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function moneyFromPaise(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${String(
    abs % 100n
  ).padStart(2, "0")}`;
}

function parseQty(value: string): bigint {
  if (!/^\d{1,11}(\.\d{1,3})?$/.test(value)) {
    throw new Error("Invalid quantity");
  }
  const [whole, fraction = ""] = value.split(".");
  const qty = BigInt(whole) * 1000n +
    BigInt(fraction.padEnd(3, "0"));
  if (qty <= 0n) throw new Error("Quantity must be positive");
  return qty;
}

function lineGross(pricePaise: bigint, qtyMilli: bigint): bigint {
  // Round to the nearest paisa.
  return (pricePaise * qtyMilli + 500n) / 1000n;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d;
}

function errorRedirect(message: string): never {
  redirect(`${PAGE}?result=${encodeURIComponent(message)}`);
}

export async function createSaleAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;

  const branchId = Number(form.get("branch_id"));
  const saleDate = String(form.get("invoice_date") ?? "");
  const customerName = String(form.get("customer_name") ?? "").trim();
  const customerPhone = String(form.get("customer_phone") ?? "").trim();
  const remarks = String(form.get("remarks") ?? "").trim();
  // Set when a saved draft is being confirmed: the same invoice is posted, not a new one.
  // (The button that sends this does not reliably send its own name/value, so this field decides.)
  const draftField = Number(form.get("confirm_draft_id") ?? 0);
  const confirmDraftId = Number.isSafeInteger(draftField) && draftField > 0 ? draftField : 0;
  const mode = confirmDraftId > 0 ? "POSTED" : String(form.get("mode") ?? "DRAFT");
  // Items a customer took on approval and has now decided to buy (comma separated item ids).
  const approvalItemIds =
    mode === "POSTED"
      ? String(form.get("approval_item_ids") ?? "")
          .split(",")
          .map(v => Number(v.trim()))
          .filter(v => Number.isSafeInteger(v) && v > 0)
          .slice(0, 100)
      : [];

  if (
    !Number.isSafeInteger(branchId) ||
    branchId <= 0 ||
    !validDate(saleDate) ||
    !["DRAFT", "POSTED"].includes(mode) ||
    customerName.length > 150 ||
    customerPhone.length > 20 ||
    remarks.length > 500
  ) {
    errorRedirect("invalid");
  }

  const phone10 = normalizePhone(customerPhone);
  if (customerPhone !== "" && phone10 === null) {
    errorRedirect("invalid-phone");
  }

  const DIVISION_ID = await divisionOfBranch(businessId, branchId);
  if (DIVISION_ID === null) errorRedirect("invalid-branch");

  let lines: SaleLineInput[];
  let payments: PaymentInput[];

  try {
    lines = JSON.parse(String(form.get("lines_json") ?? "[]"));
    payments = JSON.parse(String(form.get("payments_json") ?? "[]"));

    if (!Array.isArray(lines) || !Array.isArray(payments)) {
      throw new Error("Invalid payload");
    }
  } catch {
    errorRedirect("invalid");
  }

  if (
    lines.length === 0 ||
    lines.length > 100 ||
    payments.length > 10
  ) {
    errorRedirect("invalid-lines");
  }

  type PreparedLine = {
    variantId: number;
    qty: string;
    qtyMilli: bigint;
    price: string;
    discount: string;
    total: string;
    grossPaise: bigint;
    discountPaise: bigint;
    totalPaise: bigint;
    reason: string | null;
  };

  let preparedLines: PreparedLine[] = [];
  const requestedBySku = new Map<number, bigint>();
  let totalLineValue = 0n;
  let invoiceDiscount = 0n;
  let grandTotal = 0n;
  let paymentTotal = 0n;

  try {
    preparedLines = lines.map(line => {
      if (
        !Number.isSafeInteger(line.variantId) ||
        line.variantId <= 0
      ) {
        throw new Error("Invalid SKU");
      }

      const qtyMilli = parseQty(line.quantity);
      const pricePaise = parseAmount(line.price);
      const discountPaise = parseAmount(line.discount || "0");
      const grossPaise = lineGross(pricePaise, qtyMilli);

      if (discountPaise > grossPaise) {
        throw new Error("Line discount exceeds amount");
      }

      const totalPaise = grossPaise - discountPaise;
      const reason = (line.overrideReason ?? "").trim();

      if (reason.length > 300) {
        throw new Error("Override reason too long");
      }

      return {
        variantId: line.variantId,
        qty: line.quantity,
        qtyMilli,
        price: moneyFromPaise(pricePaise),
        discount: moneyFromPaise(discountPaise),
        total: moneyFromPaise(totalPaise),
        grossPaise,
        discountPaise,
        totalPaise,
        reason: reason || null,
      };
    });

    for (const line of preparedLines) {
      requestedBySku.set(
        line.variantId,
        (requestedBySku.get(line.variantId) ?? 0n) +
          line.qtyMilli
      );
    }

    totalLineValue = preparedLines.reduce(
      (sum, line) => sum + line.totalPaise, 0n
    );

    invoiceDiscount = parseAmount(
      String(form.get("invoice_discount") ?? "0")
    );

    if (invoiceDiscount > totalLineValue) {
      throw new Error("Invoice discount exceeds subtotal");
    }

    grandTotal = totalLineValue - invoiceDiscount;

    for (const payment of payments) {
      if (!PAYMENT_METHODS.has(payment.method)) {
        throw new Error("Invalid payment method");
      }
      if ((payment.reference ?? "").length > 150) {
        throw new Error("Payment reference too long");
      }

      const amount = parseAmount(payment.amount);
      if (amount <= 0n) throw new Error("Invalid payment");
      paymentTotal += amount;
    }

    if (paymentTotal > grandTotal) {
      throw new Error("Payment exceeds invoice");
    }

    if (mode === "DRAFT" && payments.length > 0) {
      throw new Error("Draft cannot record payments");
    }
  } catch {
    errorRedirect("invalid-amount");
  }

  const conn = await db.getConnection();
  let result = "failed";
  let createdId = 0;

  try {
    await conn.beginTransaction();

    // Shared serialization lock for stock-changing operations.
    // Stock transfer dispatch uses this same lock.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      throw new Error("Business not found");
    }

    const [branches] = await conn.execute<RowDataPacket[]>(
      `SELECT id, branch_code
       FROM acct_branches
       WHERE legal_business_id = ?
         AND division_id = ?
         AND id = ?
         AND status = 'ACTIVE'`,
      [businessId, DIVISION_ID, branchId]
    );

    const [locations] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_inventory_locations
       WHERE legal_business_id = ?
         AND division_id = ?
         AND branch_id = ?
         AND location_type = 'RETAIL'
         AND status = 'ACTIVE'
       ORDER BY id`,
      [businessId, DIVISION_ID, branchId]
    );

    if (branches.length !== 1 || locations.length !== 1) {
      result = "invalid-branch";
    } else {
      type ResolvedPayment = PaymentInput & {
        bankAccountId: number | null;
        cashAccountId: number | null;
        accountType: string;
        paymentAccount: string;
      };

      const resolvedPayments: ResolvedPayment[] = [];

      for (const payment of payments) {
        const account = String(payment.account ?? "");
        const [kind, rawId] = account.split(":");
        const accountId = Number(rawId);

        if (
          !["BANK", "CASH"].includes(kind) ||
          !Number.isSafeInteger(accountId) ||
          accountId <= 0
        ) {
          throw new Error("Invalid payment receiving account");
        }

        if (payment.method === "CASH" && kind !== "CASH") {
          throw new Error("Cash requires a cash account");
        }

        if (payment.method !== "CASH" && kind !== "BANK") {
          throw new Error("Non-cash payment requires a bank account");
        }

        if (kind === "BANK") {
          const [bank] = await conn.execute<RowDataPacket[]>(
            `SELECT id, ownership_type
             FROM acct_bank_accounts
             WHERE legal_business_id = ?
               AND id = ?
               AND status = 'ACTIVE'
               AND verification_status = 'VERIFIED'
               AND can_receive = 1`,
            [businessId, accountId]
          );

          if (bank.length !== 1) {
            throw new Error("Bank account unavailable");
          }

          resolvedPayments.push({
            ...payment,
            bankAccountId: accountId,
            cashAccountId: null,
            accountType:
              payment.method === "UPI" ? "UPI"
              : payment.method === "CARD" ? "CARD"
              : "BANK",
            paymentAccount:
              bank[0].ownership_type === "INVESTOR"
                ? "INVESTMENT_BANKING"
                : "ABHIRAM_GROUP",
          });
        } else {
          const [cash] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_cash_accounts
             WHERE legal_business_id = ?
               AND id = ?
               AND status = 'ACTIVE'
               AND (division_id IS NULL OR division_id = ?)`,
            [businessId, accountId, DIVISION_ID]
          );

          if (cash.length !== 1) {
            throw new Error("Cash account unavailable");
          }

          resolvedPayments.push({
            ...payment,
            bankAccountId: null,
            cashAccountId: accountId,
            accountType: "CASH",
            paymentAccount: "CASH",
          });
        }
      }

      const locationId = Number(locations[0].id);
      const ids = preparedLines.map(l => l.variantId);
      const placeholders = ids.map(() => "?").join(",");

      const [variants] = await conn.execute<RowDataPacket[]>(
        `SELECT v.id, v.status, v.unit_of_measure,
                p.status AS product_status
         FROM acct_product_variants v
         JOIN acct_products p
           ON p.legal_business_id = v.legal_business_id
          AND p.division_id = v.division_id
          AND p.id = v.product_id
         WHERE v.legal_business_id = ?
           AND v.division_id = ?
           AND v.id IN (${placeholders})`,
        [businessId, DIVISION_ID, ...ids]
      );

      if (
        variants.length !== preparedLines.length ||
        variants.some(v =>
          v.status !== "ACTIVE" ||
          v.product_status !== "ACTIVE"
        )
      ) {
        result = "invalid-product";
      } else {
        // Validate quantity precision for unit-based inventory.
        for (const line of preparedLines) {
          const variant = variants.find(
            v => Number(v.id) === line.variantId
          );
          if (
            variant?.unit_of_measure !== "METER" &&
            line.qtyMilli % 1000n !== 0n
          ) {
            throw new Error("Whole unit required");
          }
        }

        if (mode === "POSTED") {
          // Goods the customer kept come back to the shelf first, so this bill takes them out the normal way.
          await releaseItemsForSale(conn, {
            businessId,
            divisionId: DIVISION_ID,
            userId: user.id,
            shopLocationId: locationId,
            date: saleDate,
            itemIds: approvalItemIds,
            billedMilliByVariant: requestedBySku,
          });

          for (const line of preparedLines) {
            const [stock] = await conn.execute<RowDataPacket[]>(
              `SELECT
                 COALESCE(SUM(quantity_change), 0) AS qty,
                 COALESCE(SUM(
                   CASE WHEN quantity_change > 0
                     THEN total_cost ELSE -total_cost END
                 ), 0) AS stock_value
               FROM acct_stock_movements
               WHERE legal_business_id = ?
                 AND division_id = ?
                 AND location_id = ?
                 AND variant_id = ?`,
              [
                businessId, DIVISION_ID,
                locationId, line.variantId,
              ]
            );

            // Decimal comparison by scaling, not floating arithmetic.
            const actualQty = parseSignedQty(String(stock[0].qty));
            if (
              actualQty <
              (requestedBySku.get(line.variantId) ?? 0n)
            ) {
              result = "insufficient-stock";
              break;
            }
          }
        }

        if (result !== "insufficient-stock") {
          let draftInvoiceNo: string | null = null;
          if (confirmDraftId > 0) {
            const [drafts] = await conn.execute<RowDataPacket[]>(
              `SELECT invoice_no FROM acct_sales_headers
               WHERE id = ? AND legal_business_id = ? AND branch_id = ? AND status = 'DRAFT'
               FOR UPDATE`,
              [confirmDraftId, businessId, branchId]
            );
            if (drafts.length !== 1) throw new Error("DRAFT_GONE");
            const [anyPay] = await conn.execute<RowDataPacket[]>(
              `SELECT id FROM acct_sales_payments WHERE legal_business_id = ? AND sale_id = ? LIMIT 1`,
              [businessId, confirmDraftId]
            );
            if (anyPay.length > 0) throw new Error("DRAFT_GONE");
            draftInvoiceNo = String(drafts[0].invoice_no);
          }

          let invoiceNo: string;
          if (draftInvoiceNo !== null) {
            invoiceNo = draftInvoiceNo;
          } else {
            const branchPrefix = String(
              branches[0].branch_code
            ).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);

            if (branchPrefix.length !== 2) {
              throw new Error("Branch code must contain two letters");
            }

            const prefix = `AB_AT_${branchPrefix}_SA`;

            await conn.execute(
              `INSERT INTO acct_document_sequences (
                 legal_business_id, document_type,
                 code_prefix, last_number
               ) VALUES (?, 'SALE', ?, 0)
               ON DUPLICATE KEY UPDATE id = id`,
              [businessId, prefix]
            );

            const [seq] = await conn.execute<RowDataPacket[]>(
              `SELECT id, last_number
               FROM acct_document_sequences
               WHERE legal_business_id = ?
                 AND document_type = 'SALE'
                 AND code_prefix = ?
               FOR UPDATE`,
              [businessId, prefix]
            );

            // Never reuse a number: also look at invoices already saved with this
            // prefix (imported or older ones may be ahead of the counter).
            const [used] = await conn.execute<RowDataPacket[]>(
              `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(invoice_no, '_', -1) AS UNSIGNED)), 0) AS top
               FROM acct_sales_headers
               WHERE legal_business_id = ?
                 AND invoice_no LIKE ?`,
              [businessId, `${prefix}\\_%`]
            );
            const counter = BigInt(seq[0].last_number);
            const highest = BigInt(used[0]?.top ?? 0);
            const number = (counter > highest ? counter : highest) + 1n;

            await conn.execute(
              `UPDATE acct_document_sequences
               SET last_number = ?
               WHERE id = ?`,
              [number.toString(), seq[0].id]
            );

            invoiceNo =
              `${prefix}_${number.toString().padStart(2, "0")}`;

          }

          const subtotal = preparedLines.reduce(
            (sum, l) => sum + l.grossPaise, 0n
          );
          const lineDiscountTotal = preparedLines.reduce(
            (sum, l) => sum + l.discountPaise, 0n
          );
          const totalDiscount = lineDiscountTotal + invoiceDiscount;

          const customer = phone10
            ? await findOrCreateCustomer(conn, {
                businessId, userId: user.id, name: customerName, phone10,
              })
            : null;

          if (customer && mode === "POSTED" && customer.credit_limit_paise > 0n) {
            const creditNow = grandTotal - paymentTotal;
            if (creditNow > 0n) {
              const dues = await customerDuesPaise(conn, businessId, customer.id);
              if (dues + creditNow > customer.credit_limit_paise) {
                throw new Error("CREDIT_LIMIT");
              }
            }
          }

          if (confirmDraftId > 0) {
            // A draft has no stock movements and no payments, so only its lines are replaced.
            await conn.execute(
              `DELETE FROM acct_sales_lines
               WHERE legal_business_id = ? AND sale_id = ?`,
              [businessId, confirmDraftId]
            );
            await conn.execute(
              `UPDATE acct_sales_headers
               SET invoice_date = ?, customer_name = ?, customer_phone = ?, customer_id = ?,
                   status = 'POSTED', subtotal = ?, discount_amount = ?, grand_total = ?,
                   remarks = ?, posted_by = ?, posted_at = CURRENT_TIMESTAMP
               WHERE id = ? AND legal_business_id = ? AND status = 'DRAFT'`,
              [
                saleDate,
                customerName || customer?.full_name || null,
                phone10 ?? null, customer?.id ?? null,
                moneyFromPaise(subtotal),
                moneyFromPaise(totalDiscount),
                moneyFromPaise(grandTotal),
                remarks || null, user.id,
                confirmDraftId, businessId,
              ]
            );
            createdId = confirmDraftId;
          } else {
            const [header] = await conn.execute<ResultSetHeader>(
              `INSERT INTO acct_sales_headers (
                 legal_business_id, division_id,
                 branch_id, location_id, invoice_no,
                 invoice_date, customer_name, customer_phone, customer_id,
                 status, subtotal, discount_amount,
                 grand_total, remarks, created_by,
                 posted_by, posted_at
               ) VALUES (
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 ${mode === "POSTED" ? "CURRENT_TIMESTAMP" : "NULL"}
               )`,
              [
                businessId, DIVISION_ID, branchId,
                locationId, invoiceNo, saleDate,
                customerName || customer?.full_name || null,
                phone10 ?? null, customer?.id ?? null,
                mode, moneyFromPaise(subtotal),
                moneyFromPaise(totalDiscount),
                moneyFromPaise(grandTotal),
                remarks || null, user.id,
                mode === "POSTED" ? user.id : null,
              ]
            );

            createdId = header.insertId;
          }

          if (approvalItemIds.length > 0) {
            await conn.execute(
              `UPDATE acct_approval_items SET sale_id = ?
               WHERE legal_business_id = ? AND status = 'KEPT'
                 AND id IN (${approvalItemIds.map(() => "?").join(",")})`,
              [createdId, businessId, ...approvalItemIds]
            );
          }

          for (const line of preparedLines) {
            const [minRows] = await conn.execute<RowDataPacket[]>(
              `SELECT tl.min_selling_price
               FROM acct_stock_transfer_lines tl
               JOIN acct_stock_transfers t
                 ON t.id = tl.transfer_id
                AND t.legal_business_id = tl.legal_business_id
                AND t.division_id = tl.division_id
               WHERE t.legal_business_id = ?
                 AND t.division_id = ?
                 AND t.to_location_id = ?
                 AND t.status = 'RECEIVED'
                 AND tl.variant_id = ?
               ORDER BY t.received_at DESC, t.id DESC
               LIMIT 1`,
              [
                businessId, DIVISION_ID,
                locationId, line.variantId,
              ]
            );

            // Price guidance is informational and never blocks billing.
            const minPrice = minRows.length
              ? String(minRows[0].min_selling_price)
              : null;

            let unitCost: string | null = null;
            let totalCost: string | null = null;

            if (mode === "POSTED") {
              const [valuation] = await conn.execute<RowDataPacket[]>(
                `SELECT
                   COALESCE(SUM(quantity_change), 0) AS qty,
                   COALESCE(SUM(
                     CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END
                   ), 0) AS stock_value
                 FROM acct_stock_movements
                 WHERE legal_business_id = ?
                   AND division_id = ?
                   AND location_id = ?
                   AND variant_id = ?`,
                [
                  businessId, DIVISION_ID,
                  locationId, line.variantId,
                ]
              );

              const qty = parseSignedQty(String(valuation[0].qty));
              const stockValue = parseSignedMoney(
                String(valuation[0].stock_value)
              );

              if (qty < line.qtyMilli || stockValue < 0n) {
                throw new Error("Stock valuation mismatch");
              }

              const cost4 = qty > 0n
                ? (stockValue * 100000n + qty / 2n) / qty
                : 0n;
              // cost4 is the unit cost scaled to 4 decimals.
              unitCost =
                `${cost4 / 10000n}.${String(
                  cost4 % 10000n
                ).padStart(4, "0")}`;

              const costPaise =
                (cost4 * line.qtyMilli + 50000n) / 100000n;

              totalCost = moneyFromPaise(costPaise);
            }

            const [detail] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_sales_lines (
                   legal_business_id, division_id,
                   sale_id, variant_id, quantity, unit_price,
                   minimum_selling_price, discount_amount,
                   line_total, price_override_reason,
                   unit_cost, total_cost
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  businessId, DIVISION_ID,
                  createdId, line.variantId,
                  line.qty, line.price,
                  minPrice, line.discount, line.total,
                  line.reason, unitCost, totalCost,
                ]
              );

            if (mode === "POSTED") {
              await conn.execute(
                `INSERT INTO acct_stock_movements (
                   legal_business_id, division_id,
                   location_id, variant_id, movement_date,
                   movement_type, source_type, source_id,
                   source_line_id, quantity_change,
                   unit_cost, total_cost, remarks,
                   created_by
                 ) VALUES (
                   ?, ?, ?, ?, ?, 'SALE',
                   'SALES_INVOICE', ?, ?, -?,
                   ?, ?, 'Retail sale', ?
                 )`,
                [
                  businessId, DIVISION_ID,
                  locationId, line.variantId, saleDate,
                  createdId, detail.insertId,
                  line.qty, unitCost, totalCost,
                  user.id,
                ]
              );
            }
          }

          if (mode === "POSTED") {
            for (const payment of resolvedPayments) {
              await conn.execute(
                `INSERT INTO acct_sales_payments (
                   legal_business_id,
                   division_id,
                   sale_id,
                   payment_date,
                   payment_method,
                   payment_account_type,
                   bank_account_id,
                   cash_account_id,
                   payment_account,
                   amount,
                   payment_reference,
                   status,
                   created_by
                 ) VALUES (
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?
                 )`,
                [
                  businessId,
                  DIVISION_ID,
                  createdId,
                  saleDate,
                  payment.method,
                  payment.accountType,
                  payment.bankAccountId,
                  payment.cashAccountId,
                  payment.paymentAccount,
                  moneyFromPaise(parseAmount(payment.amount)),
                  (payment.reference ?? "").trim() || null,
                  user.id,
                ]
              );
            }
          }

          await conn.commit();
          result = "created";
        }
      }
    }

    if (result !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (error instanceof Error && error.message === "DRAFT_GONE") {
      result = "not-editable";
    } else if (error instanceof Error && error.message === "APPROVAL_GONE") {
      result = "approval-gone";
    } else if (error instanceof Error && error.message === "APPROVAL_MISMATCH") {
      result = "approval-mismatch";
    } else if (error instanceof Error && error.message === "CREDIT_LIMIT") {
      result = "credit-limit";
    } else {
      console.error("Sale creation failed:", error);
      result = "failed";
    }
  } finally {
    conn.release();
  }

  if (result === "created") {
    // If this bill was started from a staff WhatsApp "sold" report, mark it done.
    const reportId = Number(String(form.get("report_id") ?? ""));
    if (Number.isSafeInteger(reportId) && reportId > 0) {
      await db
        .execute(
          `UPDATE acct_stock_drafts
              SET status = 'DONE', decided_by = ?, decided_at = NOW(), result_note = ?
            WHERE id = ? AND legal_business_id = ? AND action = 'SOLD'
              AND status IN ('PENDING', 'DONE')`,
          [user.id, `Invoice created (sale #${createdId}).`, reportId, user.legal_business_id]
        )
        .catch(() => {});
    }
    revalidatePath(PAGE);
    revalidatePath("/accounting/stock");
    redirect(`${PAGE}?result=created&id=${createdId}`);
  }

  errorRedirect(result);
}

export async function updateSaleAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const branchId = Number(form.get("branch_id"));
  const saleDate = String(form.get("invoice_date") ?? "");
  const customerName = String(form.get("customer_name") ?? "").trim();
  const customerPhone = String(form.get("customer_phone") ?? "").trim();
  const remarks = String(form.get("remarks") ?? "").trim();

  if (
    !Number.isSafeInteger(saleId) ||
    saleId <= 0 ||
    !Number.isSafeInteger(branchId) ||
    branchId <= 0 ||
    !validDate(saleDate) ||
    customerName.length > 150 ||
    customerPhone.length > 20 ||
    remarks.length > 500
  ) {
    redirect(`${PAGE}?result=invalid-edit`);
  }

  const phone10 = normalizePhone(customerPhone);
  if (customerPhone !== "" && phone10 === null) {
    redirect(`${PAGE}?result=invalid-phone`);
  }

  const DIVISION_ID = await divisionOfBranch(businessId, branchId);
  if (DIVISION_ID === null) redirect(`${PAGE}?result=invalid-branch`);

  let lines: SaleLineInput[];
  let preparedLines: Array<{
    variantId: number;
    qty: string;
    qtyMilli: bigint;
    price: string;
    discount: string;
    total: string;
    grossPaise: bigint;
    discountPaise: bigint;
    totalPaise: bigint;
    reason: string | null;
  }>;
  const requestedBySku = new Map<number, bigint>();
  let invoiceDiscount = 0n;
  let grandTotal = 0n;

  try {
    lines = JSON.parse(String(form.get("lines_json") ?? "[]"));
    if (
      !Array.isArray(lines) ||
      lines.length === 0 ||
      lines.length > 100
    ) {
      throw new Error("Invalid invoice lines");
    }

    preparedLines = lines.map(line => {
      if (
        !Number.isSafeInteger(line.variantId) ||
        line.variantId <= 0
      ) {
        throw new Error("Invalid SKU");
      }

      const qtyMilli = parseQty(line.quantity);
      const pricePaise = parseAmount(line.price);
      const discountPaise = parseAmount(line.discount || "0");
      const grossPaise = lineGross(pricePaise, qtyMilli);
      if (discountPaise > grossPaise) {
        throw new Error("Discount exceeds line total");
      }

      const reason = (line.overrideReason ?? "").trim();
      if (reason.length > 300) {
        throw new Error("Override reason too long");
      }

      const totalPaise = grossPaise - discountPaise;
      return {
        variantId: line.variantId,
        qty: line.quantity,
        qtyMilli,
        price: moneyFromPaise(pricePaise),
        discount: moneyFromPaise(discountPaise),
        total: moneyFromPaise(totalPaise),
        grossPaise,
        discountPaise,
        totalPaise,
        reason: reason || null,
      };
    });

    for (const line of preparedLines) {
      requestedBySku.set(
        line.variantId,
        (requestedBySku.get(line.variantId) ?? 0n) +
          line.qtyMilli
      );
    }

    const lineTotal = preparedLines.reduce(
      (sum, line) => sum + line.totalPaise,
      0n
    );
    invoiceDiscount = parseAmount(
      String(form.get("invoice_discount") ?? "0")
    );
    if (invoiceDiscount > lineTotal) {
      throw new Error("Invoice discount exceeds subtotal");
    }
    grandTotal = lineTotal - invoiceDiscount;
  } catch {
    redirect(`${PAGE}?result=invalid-edit&id=${saleId}`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();
    await conn.execute(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    const [headers] = await conn.execute<RowDataPacket[]>(
      `SELECT
         id,
         branch_id,
         location_id,
         status,
         DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
         invoice_no
       FROM acct_sales_headers
       WHERE legal_business_id = ?
         AND division_id = ?
         AND id = ?
       FOR UPDATE`,
      [businessId, DIVISION_ID, saleId]
    );
    const header = headers[0];

    const [inLedger] = header
      ? await conn.execute<RowDataPacket[]>(
          `SELECT id FROM acct_journal_entries
           WHERE legal_business_id = ? AND source_type = 'SALES_INVOICE'
             AND source_id = ? AND status IN ('POSTED', 'REVERSED') LIMIT 1`,
          [businessId, saleId]
        )
      : [[] as RowDataPacket[]];

    if (!header || !["DRAFT", "POSTED"].includes(header.status)) {
      result = "not-editable";
    } else if (inLedger.length > 0) {
      // Posted journals are permanent. Corrections go through a return.
      result = "in-ledger";
    } else if (
      Number(header.branch_id) !== branchId ||
      (header.status === "POSTED" &&
        String(header.invoice_date) !== saleDate)
    ) {
      result = "invalid-edit";
    } else {
      const [oldLines] = await conn.execute<RowDataPacket[]>(
        `SELECT
           id,
           variant_id,
           quantity,
           unit_cost,
           total_cost,
           unit_price,
           discount_amount,
           line_total,
           price_override_reason
         FROM acct_sales_lines
         WHERE legal_business_id = ?
           AND division_id = ?
           AND sale_id = ?
         ORDER BY id
         FOR UPDATE`,
        [businessId, DIVISION_ID, saleId]
      );
      const [recordedPayments] =
        await conn.execute<RowDataPacket[]>(
          `SELECT amount
           FROM acct_sales_payments
           WHERE legal_business_id = ?
             AND division_id = ?
             AND sale_id = ?
             AND status = 'RECORDED'
           FOR UPDATE`,
          [businessId, DIVISION_ID, saleId]
        );
      const collected = recordedPayments.reduce(
        (sum, payment) =>
          sum + parseAmount(String(payment.amount)),
        0n
      );

      if (collected > grandTotal) {
        result = "payments-exceed-total";
      } else {
        const ids = preparedLines.map(line => line.variantId);
        const placeholders = ids.map(() => "?").join(",");
        const [variants] = await conn.execute<RowDataPacket[]>(
          `SELECT v.id, v.status, v.unit_of_measure,
                  p.status AS product_status
           FROM acct_product_variants v
           JOIN acct_products p
             ON p.legal_business_id = v.legal_business_id
            AND p.division_id = v.division_id
            AND p.id = v.product_id
           WHERE v.legal_business_id = ?
             AND v.division_id = ?
             AND v.id IN (${placeholders})`,
          [businessId, DIVISION_ID, ...ids]
        );

        const existingVariantIds = new Set(
          oldLines.map(line => Number(line.variant_id))
        );
        if (
          variants.length !== preparedLines.length ||
          variants.some(variant =>
            (
              variant.status !== "ACTIVE" ||
              variant.product_status !== "ACTIVE"
            ) &&
            !existingVariantIds.has(Number(variant.id))
          )
        ) {
          result = "invalid-product";
        } else {
          const oldByVariant = new Map<number, {
            qtyMilli: bigint;
            valuePaise: bigint;
          }>();

          for (const line of oldLines) {
            const variantId = Number(line.variant_id);
            const current = oldByVariant.get(variantId) ?? {
              qtyMilli: 0n,
              valuePaise: 0n,
            };
            current.qtyMilli += parseQty(String(line.quantity));

            if (header.status === "POSTED") {
              if (
                line.unit_cost === null ||
                line.total_cost === null
              ) {
                throw new Error(
                  "Posted invoice line has no inventory cost"
                );
              }
              current.valuePaise += parseAmount(
                String(line.total_cost)
              );
            }
            oldByVariant.set(variantId, current);
          }

          const variantCosts = new Map<number, {
            unitCost: string;
            totalCost: string;
          }>();

          if (header.status === "POSTED") {
            for (const line of preparedLines) {
              const variant = variants.find(
                row => Number(row.id) === line.variantId
              );
              if (
                variant?.unit_of_measure !== "METER" &&
                line.qtyMilli % 1000n !== 0n
              ) {
                throw new Error("Whole unit required");
              }

              const [balances] = await conn.execute<RowDataPacket[]>(
                `SELECT
                   COALESCE(SUM(quantity_change), 0) AS quantity,
                   COALESCE(SUM(
                     CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END
                   ), 0) AS stock_value
                 FROM acct_stock_movements
                 WHERE legal_business_id = ?
                   AND division_id = ?
                   AND location_id = ?
                   AND variant_id = ?`,
                [
                  businessId,
                  DIVISION_ID,
                  header.location_id,
                  line.variantId,
                ]
              );
              const balance = balances[0];
              const currentQty =
                parseSignedQty(String(balance.quantity));
              const currentValue =
                parseSignedMoney(String(balance.stock_value));
              const restored = oldByVariant.get(line.variantId) ?? {
                qtyMilli: 0n,
                valuePaise: 0n,
              };
              const availableQty = currentQty + restored.qtyMilli;
              const availableValue =
                currentValue + restored.valuePaise;

              if (
                availableQty <
                (requestedBySku.get(line.variantId) ?? 0n)
              ) {
                result = "insufficient-stock";
                break;
              }
              if (availableQty <= 0n || availableValue < 0n) {
                result = "valuation-invalid";
                break;
              }

              const cost4 =
                (availableValue * 100000n + availableQty / 2n) /
                availableQty;
              const unitCost =
                `${cost4 / 10000n}.${String(
                  cost4 % 10000n
                ).padStart(4, "0")}`;
              const totalCost = moneyFromPaise(
                (cost4 * line.qtyMilli + 50000n) / 100000n
              );
              variantCosts.set(line.variantId, {
                unitCost,
                totalCost,
              });
            }
          } else {
            for (const line of preparedLines) {
              const variant = variants.find(
                row => Number(row.id) === line.variantId
              );
              if (
                variant?.unit_of_measure !== "METER" &&
                line.qtyMilli % 1000n !== 0n
              ) {
                throw new Error("Whole unit required");
              }
            }
          }

          if (
            result !== "insufficient-stock" &&
            result !== "valuation-invalid"
          ) {
            const oldSnapshot = oldLines.map(line => ({
              variant_id: Number(line.variant_id),
              quantity: String(line.quantity),
              unit_price: String(line.unit_price),
              discount_amount: String(line.discount_amount),
              line_total: String(line.line_total),
            }));

            const adjustmentDate = new Intl.DateTimeFormat(
              "en-CA",
              {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }
            ).format(new Date());

            if (header.status === "POSTED") {
              for (const line of oldLines) {
                await conn.execute(
                  `INSERT INTO acct_stock_movements (
                     legal_business_id, division_id,
                     location_id, variant_id, movement_date,
                     movement_type, source_type, source_id,
                     source_line_id, quantity_change,
                     unit_cost, total_cost, remarks,
                     created_by
                   ) VALUES (
                     ?, ?, ?, ?, ?,
                     'SALES_RETURN', 'SALES_INVOICE_EDIT',
                     ?, ?, ?, ?, ?, ?, ?
                   )`,
                  [
                    businessId,
                    DIVISION_ID,
                    header.location_id,
                    line.variant_id,
                    adjustmentDate,
                    saleId,
                    line.id,
                    line.quantity,
                    line.unit_cost,
                    line.total_cost,
                    `Invoice ${header.invoice_no} edit: reverse previous line`,
                    user.id,
                  ]
                );
              }
            }

            await conn.execute(
              `DELETE FROM acct_sales_lines
               WHERE legal_business_id = ?
                 AND division_id = ?
                 AND sale_id = ?`,
              [businessId, DIVISION_ID, saleId]
            );

            const subtotal = preparedLines.reduce(
              (sum, line) => sum + line.grossPaise,
              0n
            );
            const lineDiscountTotal = preparedLines.reduce(
              (sum, line) => sum + line.discountPaise,
              0n
            );
            const discountTotal =
              lineDiscountTotal + invoiceDiscount;

            const customer = phone10
              ? await findOrCreateCustomer(conn, {
                  businessId, userId: user.id, name: customerName, phone10,
                })
              : null;

            await conn.execute(
              `UPDATE acct_sales_headers
               SET customer_name = ?,
                   customer_phone = ?,
                   customer_id = ?,
                   invoice_date = ?,
                   subtotal = ?,
                   discount_amount = ?,
                   grand_total = ?,
                   remarks = ?
               WHERE legal_business_id = ?
                 AND division_id = ?
                 AND id = ?`,
              [
                customerName || customer?.full_name || null,
                phone10 ?? null,
                customer?.id ?? null,
                saleDate,
                moneyFromPaise(subtotal),
                moneyFromPaise(discountTotal),
                moneyFromPaise(grandTotal),
                remarks || null,
                businessId,
                DIVISION_ID,
                saleId,
              ]
            );

            const newSnapshot = [];
            for (const line of preparedLines) {
              const [minimumRows] =
                await conn.execute<RowDataPacket[]>(
                  `SELECT tl.min_selling_price
                   FROM acct_stock_transfer_lines tl
                   JOIN acct_stock_transfers t
                     ON t.id = tl.transfer_id
                    AND t.legal_business_id = tl.legal_business_id
                    AND t.division_id = tl.division_id
                   WHERE t.legal_business_id = ?
                     AND t.division_id = ?
                     AND t.to_location_id = ?
                     AND t.status = 'RECEIVED'
                     AND tl.variant_id = ?
                   ORDER BY t.received_at DESC, t.id DESC
                   LIMIT 1`,
                  [
                    businessId,
                    DIVISION_ID,
                    header.location_id,
                    line.variantId,
                  ]
                );

              const cost = variantCosts.get(line.variantId);
              const [inserted] =
                await conn.execute<ResultSetHeader>(
                  `INSERT INTO acct_sales_lines (
                     legal_business_id, division_id,
                     sale_id, variant_id, quantity, unit_price,
                     minimum_selling_price, discount_amount,
                     line_total, price_override_reason,
                     unit_cost, total_cost
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    businessId,
                    DIVISION_ID,
                    saleId,
                    line.variantId,
                    line.qty,
                    line.price,
                    minimumRows.length
                      ? String(minimumRows[0].min_selling_price)
                      : null,
                    line.discount,
                    line.total,
                    line.reason,
                    cost?.unitCost ?? null,
                    cost?.totalCost ?? null,
                  ]
                );

              if (header.status === "POSTED" && cost) {
                await conn.execute(
                  `INSERT INTO acct_stock_movements (
                     legal_business_id, division_id,
                     location_id, variant_id, movement_date,
                     movement_type, source_type, source_id,
                     source_line_id, quantity_change,
                     unit_cost, total_cost, remarks,
                     created_by
                   ) VALUES (
                     ?, ?, ?, ?, ?, 'SALE',
                     'SALES_INVOICE', ?, ?, -?,
                     ?, ?, 'Corrected retail sale', ?
                   )`,
                  [
                    businessId,
                    DIVISION_ID,
                    header.location_id,
                    line.variantId,
                    adjustmentDate,
                    saleId,
                    inserted.insertId,
                    line.qty,
                    cost.unitCost,
                    cost.totalCost,
                    user.id,
                  ]
                );
              }

              newSnapshot.push({
                variant_id: line.variantId,
                quantity: line.qty,
                unit_price: line.price,
                discount_amount: line.discount,
                line_total: line.total,
              });
            }

            await conn.execute(
              `INSERT INTO acct_audit_events (
                 legal_business_id, actor_user_id, action,
                 subject_type, subject_id, details_json
               ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                businessId,
                user.id,
                "SALES_INVOICE_UPDATED",
                "SALES_INVOICE",
                saleId,
                JSON.stringify({
                  invoice_no: header.invoice_no,
                  status: header.status,
                  previous_lines: oldSnapshot,
                  updated_lines: newSnapshot,
                  grand_total: moneyFromPaise(grandTotal),
                  recorded_payments_preserved: true,
                }),
              ]
            );

            await conn.commit();
            result = "updated";
          }
        }
      }
    }

    if (result !== "updated") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Sale update failed:", error);
    result = "failed";
  } finally {
    conn.release();
  }

  if (result === "updated") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/stock");
    redirect(`${PAGE}?result=updated&id=${saleId}`);
  }

  redirect(
    `${PAGE}?result=${encodeURIComponent(result)}&edit=${saleId}`
  );
}

function parseSignedQty(value: string): bigint {
  if (value.startsWith("-")) {
    return -parseQty(value.slice(1));
  }
  if (Number(value) === 0) return 0n;
  return parseQty(value);
}

function parseSignedMoney(value: string): bigint {
  if (value.startsWith("-")) {
    return -parseAmount(value.slice(1));
  }
  return parseAmount(value);
}
