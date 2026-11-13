# Tracker rows waiting to be added (13 Nov 2026)

The Claude Docs tracker service was unavailable. Add these to the Master Tracker when it is back, then delete this file.
Source: second full read of the outside review (R3, 13 Nov 2026).

## Priority 1 (after 1.20)
- 1.21 One reconciliation report: sales to receivables to ledger, purchases to creditors and stock to ledger, stock value to inventory account, bank statement to cash and bank accounts, each showing matches / does not match. (R3 FIN-02.) Not started.
- 1.22 Tests for the money flows on a disposable database: owner-paid expense, partial expense payment, purchase with rejection and return, sale with return and exchange, month close blocking, plus role checks (cashier cannot approve own expense or see owner money, branch manager cannot read another branch, auditor read-only). (R3 QA-01, acceptance 1-4, 6, 7.) Second half of 1.20. Not started.
- 1.23 Double-press protection: the same bill, payment, refund, follow-up or posting submitted twice at once creates one event. Bills already have a guard; prove or fix the rest. (R3 acceptance 5.) Not started.
- 1.24 Restore rehearsal: restore a full backup (database, triggers, PRIVATE_DIR and MEDIA_DIR files) into a fresh empty database and compare totals and downloads. (R3 acceptance 8, OPS-02.) Waiting on owner: needs a spare empty database.

## Priority 4 (parked, owner picks later)
- 4.18 Retail and buying controls: three-way match, duplicate supplier-bill detection, price override approval, cashier shift reconciliation, stock count variance approval, offline recovery, printer support. Overlaps 4.1.
- 4.19 Customer management upgrades: lead assignment and response time, duplicate customer detection, consent and unsubscribe register, one inbox, ticket response targets and escalation, campaign results.
- 4.20 Social channels: Facebook and Instagram scheduling and results, YouTube upload, Google Business posts, post-to-sale tracking.
- 4.21 Loans and bank finance (replaces 2.8): parked, no loans today.

## Status cells that are out of date in the tables
- 1.15 to 1.19: now Done (change log has the dates).
- 1.20: first part built (GitHub checks), waiting for owner's Done after checking the Actions tab.
- 4.13: now Parked (owner decision 13 Nov). 4.14: waiting on owner.
- 1.14, 2.3, 2.8, 1.2: closed by owner, no work needed.

## Change-log row to add
13 Nov 2026: Second full read of the outside review. Checked the SaaS section against code (true, covered by parked 4.13). Added 1.21 to 1.24 and 4.18 to 4.21. The review's tsc error needs generated route types; the GitHub check generates them first.
