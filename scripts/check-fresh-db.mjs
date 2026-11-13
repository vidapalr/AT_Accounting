// Checks a database that was built from db/base_schema + migrations above 040:
// every table a migration file creates must exist, and the safety triggers must be there.
// Usage: DB_HOST=... DB_PORT=... DB_USERNAME=... DB_PASSWORD=... DB_DATABASE=... node scripts/check-fresh-db.mjs
import { readdirSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
});
const [t] = await conn.query("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = DATABASE()");
const have = new Set(t.map((r) => String(r.n).toLowerCase()));
let bad = 0;
for (const f of readdirSync("migrations").filter((n) => /^\d{3}_.*\.sql$/.test(n) && Number(n.slice(0, 3)) > 40).sort()) {
  const sql = readFileSync(`migrations/${f}`, "utf8");
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gi)) {
    if (!have.has(m[1].toLowerCase())) { console.log(`MISSING table ${m[1]} (from ${f})`); bad++; }
  }
}
const [tr] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.triggers WHERE trigger_schema = DATABASE()");
if (Number(tr[0].c) < 5) { console.log(`Only ${tr[0].c} safety triggers found, expected at least 5`); bad++; }
console.log(`${have.size} tables, ${tr[0].c} triggers, ${bad} problems`);
await conn.end();
process.exit(bad ? 1 : 0);
