/**
 * ONE-TIME CUT-OVER ONLY (October 2026). Not part of the product.
 *
 * The first company moved investor agreement #2 from one branch to its whole division during cut-over.
 * The two screens that did it (Investors > One-time cut-over > Change investor scope) refer to those exact
 * records, and every such reference lives here and nowhere else. A new company never uses these screens:
 * future changes go through Agreements > Amend, which works for any agreement.
 * Delete this file, investor-scope-*-actions.ts and the page once the auditor signs off the cut-over.
 */
export const CUTOVER_SCOPE = {
  agreementId: 2,
  partyId: 2,
  amendmentId: 1,
  oldVersionId: 2,
  newVersionId: 3,
  divisionId: 1,
  oldBranchId: 1,
} as const;
