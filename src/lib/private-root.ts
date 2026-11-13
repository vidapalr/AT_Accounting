import path from "node:path";

/**
 * Where uploaded private documents live (agreements, bank evidence, vouchers, letters).
 * Set PRIVATE_DIR on the hosting service to a folder OUTSIDE the app folder, so a redeploy
 * from git never replaces it. Without it the old place inside the app folder is used.
 */
export const PRIVATE_ROOT = process.env.PRIVATE_DIR
  ? path.resolve(process.env.PRIVATE_DIR)
  : path.join(process.cwd(), "private_uploads");
