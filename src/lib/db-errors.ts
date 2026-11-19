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

/** Duplicate value on a unique key (error 1062), e.g. two people given the same running number at once. */
export function isDuplicateKey(error: unknown): boolean {
  const e = error as { code?: string; errno?: number } | null;
  return !!e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062);
}
