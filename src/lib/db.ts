import { createPool, type Pool } from "mysql2/promise";

const env = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};

const globalForDb = globalThis as typeof globalThis & {
  accountingDb?: Pool;
};

export const db =
  globalForDb.accountingDb ??
  createPool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    database: env.DB_DATABASE,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.accountingDb = db;
}
