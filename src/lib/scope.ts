/**
 * Division limits for a "Manager (one division)" login.
 * The owner, accountant, cashier and others have no limit (scope_division_id is empty).
 * A manager can only see and change records of their own division.
 */
export type ScopedUser = { scope_division_id?: number | null };

export function scopeDivision(user: ScopedUser): number | null {
  const id = Number(user.scope_division_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** " AND col = ?" plus its value for a manager, nothing for everyone else. */
export function divisionSql(user: ScopedUser, column: string): { sql: string; params: number[] } {
  const id = scopeDivision(user);
  return id === null ? { sql: "", params: [] } : { sql: ` AND ${column} = ?`, params: [id] };
}

/** May this login work with a record of this division? */
export function canUseDivision(user: ScopedUser, divisionId: number | null | undefined): boolean {
  const id = scopeDivision(user);
  return id === null || Number(divisionId) === id;
}

/** For a manager: is this stock location in their division? Others: always yes (location must still exist). */
export async function locationInScope(user: ScopedUser, businessId: number, locationId: number): Promise<boolean> {
  const id = scopeDivision(user);
  if (id === null) return true;
  const { db } = await import("@/lib/db");
  const [rows] = await db.execute<import("mysql2").RowDataPacket[]>(
    "SELECT division_id FROM acct_inventory_locations WHERE legal_business_id = ? AND id = ?",
    [businessId, locationId]
  );
  return rows[0] !== undefined && Number(rows[0].division_id) === id;
}

/** For a manager: is this cash drawer in their division? */
export async function cashAccountInScope(user: ScopedUser, businessId: number, cashAccountId: number): Promise<boolean> {
  const id = scopeDivision(user);
  if (id === null) return true;
  const { db } = await import("@/lib/db");
  const [rows] = await db.execute<import("mysql2").RowDataPacket[]>(
    "SELECT division_id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ?",
    [businessId, cashAccountId]
  );
  return rows[0] !== undefined && Number(rows[0].division_id) === id;
}
