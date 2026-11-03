import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * Database files (migrations) and one thing each of them creates. If that thing is missing from the
 * live database, the file has not been run there. Files that only change data or settings are not listed.
 */
type Marker = { file: string; table: string; column?: string; index?: string };

export const MIGRATION_MARKERS: Marker[] = [
  { file: "005_returns_refunds_damages", table: "acct_sales_returns" },
  { file: "007_business_settings", table: "acct_business_settings" },
  { file: "008_whatsapp_reports", table: "acct_whatsapp_recipients" },
  { file: "010_customers", table: "acct_customers" },
  { file: "011_catalogue_media", table: "acct_product_media" },
  { file: "012_customer_messages", table: "acct_customer_messages" },
  { file: "013_stock_reports", table: "acct_stock_reporters" },
  { file: "014_online_shop", table: "acct_products", column: "show_in_shop" },
  { file: "015_instagram_posts", table: "acct_instagram_posts" },
  { file: "016_shop_prices", table: "acct_product_variants", column: "shop_price" },
  { file: "017_gst_ready", table: "acct_sales_headers", column: "gst_applied" },
  { file: "018_supplier_returns_free_stock", table: "acct_supplier_returns" },
  { file: "019_items_on_approval", table: "acct_approval_items" },
  { file: "020_cash_closing", table: "acct_cash_closings" },
  { file: "022_sale_submit_token", table: "acct_sales_headers", column: "submit_token" },
  { file: "023_stock_count_low_stock", table: "acct_product_variants", column: "low_stock_level" },
  { file: "025_auditor_adjustments", table: "acct_auditor_adjustments" },
  { file: "026_salaries_and_spending", table: "acct_employees" },
  { file: "027_party_link_setoff", table: "acct_party_setoffs" },
  { file: "028_purchase_orders", table: "acct_purchase_orders" },
  { file: "029_manager_investor_logins", table: "acct_user_access", column: "scope_division_id" },
  { file: "030_fixed_assets", table: "acct_fixed_assets" },
  { file: "031_staff_advances", table: "acct_staff_advances" },
  { file: "032_cash_denominations", table: "acct_cash_closings", column: "denominations_json" },
  { file: "033_online_orders", table: "acct_online_orders" },
  { file: "034_online_details_offers", table: "acct_offers" },
  { file: "035_shop_customers", table: "acct_shop_customers" },
  { file: "036_shop_password_resets", table: "acct_shop_password_resets" },
  { file: "037_owner_money", table: "acct_owner_money" },
  { file: "038_invoice_shares", table: "acct_invoice_shares" },
  { file: "039_cash_taken_destination", table: "acct_cash_closings", column: "taken_to" },
  { file: "040_funding_confirmation", table: "acct_funding_transactions", column: "verified_by" },
  { file: "041_shop_email_verification", table: "acct_shop_email_verifications" },
  { file: "042_sale_delivery_charge", table: "acct_sales_headers", column: "shipping_charge" },
  { file: "043_stock_finds", table: "acct_stock_finds" },
  { file: "044_exchange", table: "acct_sales_payments", column: "exchange_return_id" },
  { file: "046_chatbot", table: "acct_bot_answers" },
  { file: "047_investor_returns", table: "acct_funding_transactions", column: "return_treatment" },
  { file: "048_estimates_address", table: "acct_sales_headers", column: "customer_address" },
  { file: "049_social_posts", table: "acct_instagram_posts", column: "channel" },
  { file: "050_exchange_index", table: "acct_sales_payments", index: "idx_sales_payments_exchange_return" },
  { file: "051_posting_failures", table: "acct_posting_failures" },
  { file: "053_return_delivery_refund", table: "acct_sales_returns", column: "delivery_value" },
  { file: "060_selling_prices", table: "acct_selling_prices" },
  { file: "061_bank_statements", table: "acct_bank_statement_lines" },
  { file: "062_staff_record", table: "acct_employee_pay_history" },
  { file: "063_rewards", table: "acct_sale_rewards" },
  { file: "064_offer_branches", table: "acct_offers", column: "branch_id" },
  { file: "065_two_step_login", table: "acct_user_totp" },
  { file: "059_quantity_prices", table: "acct_product_variants", column: "qty_price_10" },
  { file: "058_document_register", table: "acct_document_log" },
  { file: "057_expense_payee", table: "acct_expenses", column: "payee_name" },
  { file: "056_vouchers", table: "acct_vouchers" },
  { file: "054_login_attempts", table: "acct_login_attempts" },
  { file: "052_stock_movement_key", table: "acct_stock_movements", index: "uq_stock_source_line_v2" },
];

/** The files from the list above that are not in the live database yet. */
export async function missingMigrations(pool: Pool): Promise<string[]> {
  const [cols] = await pool.query<RowDataPacket[]>(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()`
  );
  const [idx] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT table_name AS t, index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE()`
  );
  const tables = new Set(cols.map((r) => String(r.t)));
  const columns = new Set(cols.map((r) => `${r.t}.${r.c}`));
  const indexes = new Set(idx.map((r) => `${r.t}.${r.i}`));
  return MIGRATION_MARKERS.filter((m) =>
    m.column ? !columns.has(`${m.table}.${m.column}`)
    : m.index ? !indexes.has(`${m.table}.${m.index}`)
    : !tables.has(m.table)
  ).map((m) => m.file);
}
