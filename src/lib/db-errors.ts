/** MySQL/MariaDB "table does not exist" (error 1146): the only error that may mean "migration not run yet". */
export function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; errno?: number } | null;
  return !!e && (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146);
}

/** "Unknown column" (error 1054): a column added by a migration that has not been run yet. */
export function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; errno?: number } | null;
  return !!e && (e.code === "ER_BAD_FIELD_ERROR" || e.errno === 1054);
}
