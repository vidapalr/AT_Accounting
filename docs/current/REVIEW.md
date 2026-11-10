# Code review — 10 November 2026

Baseline: `9f8c44e95deba0b6da2d1657a5aaa8d0b0515269`. This is a focused manual review supported by a complete structural inventory of the selected source directories. It is **not a completed manual audit of all 102,575 lines**. No application defects were changed in this documentation delivery.

## Findings

### F01 — High: two-step lookup errors fall back to password-only login

Evidence: [two-step.ts](../../src/lib/two-step.ts), lines 16–21; [login handler](../../src/app/api/auth/login/route.ts), lines 55–61.

`hasTwoStep()` returns false for every SQL exception, including errors other than a missing pre-migration table. After a correct password, the login handler creates a full session when that function returns false. If the TOTP lookup fails while credential/session queries still work, a user who enabled two-step verification can receive a session without a code. This is a confirmed code path; an operational failure was not injected here.

Recommendation: reject login on an indeterminate two-step state. Prefer verified schema readiness at deployment over silently bypassing authentication controls.

Acceptance: force the TOTP query to fail for an enabled account while session insertion remains available. No session should be issued. Also test disabled/enabled two-step accounts, expired challenges and replayed codes.

### F02 — Medium: follow-up completion can partially save and duplicate next notes

Evidence: [follow-up-actions.ts](../../src/lib/follow-up-actions.ts), lines 40–44; [follow-ups page](../../src/app/(workspace)/accounting/follow-ups/page.tsx), line 16.

Done first updates `follow_done_at`, then optionally inserts the result/next follow-up using a separate pool execution. There is no shared transaction. If the insert fails, the original note is already completed, but the page says “Nothing was changed.” Repeating the request can insert multiple next notes because completion does not require `follow_done_at IS NULL` or check that this request won the transition.

Recommendation: complete and create the next note in one transaction; use a locking read or conditional update with affected-row checking, and make retries idempotent. Revalidate customer history and follow-up views together.

Acceptance: induce failure between update and insert; the old note should remain pending with no new note. Submit Done concurrently twice and verify at most one next note. Ensure failure messages match persisted state.

### F03 — High operational risk: private documents depend on release-directory persistence

Evidence: [document-storage.ts](../../src/lib/document-storage.ts), lines 13–16; compare [media-storage.ts](../../src/lib/media-storage.ts) and the historical [deployment warning](../GO_LIVE.md).

Product media supports an external `MEDIA_DIR`, but private agreements/evidence always use `<process.cwd()>/private_uploads`. If deployment replaces that directory without a persistent mount or copy step, database records survive while files disappear. Hosting mounts were not inspected: this is a deployment-dependent risk, not an observed incident.

Recommendation: configure a persistent document directory or validate/document a persistent mount; include documents and media in backup/restore checks.

Acceptance: upload a test document, redeploy staging and download the same document; repeat after restoring to a fresh instance.

### F04 — Medium: the full lint gate crashes before completing

`npm.cmd run lint` reports ESLint 9.39.5 and `TypeError: Cannot mix BigInt and other types, use explicit conversions`, at [supplier return detail](../../src/app/(workspace)/accounting/supplier-returns/[id]/page.tsx), line 181, rule `jsx-a11y/role-supports-aria-props`, inside `jsx-ast-utils` expression evaluation.

This is a tooling failure, not proof that application arithmetic fails at runtime. It can hide later lint findings.

Recommendation: isolate the rule interaction and use a compatible dependency fix or equivalent JSX expression refactor. Re-run full lint without broadly disabling accessibility rules.

Acceptance: lint completes with a normal results summary for the full repository.

### F05 — Medium: follow-up lists silently truncate and mask read failures

Evidence: [follow-ups page](../../src/app/(workspace)/accounting/follow-ups/page.tsx), lines 33–47.

The page limits leads and notes to 300 rows each without pagination or a truncation indication. Older overdue rows can push newer tasks out of view. A lead-query exception is ignored; a note-query exception is presented as a missing migration regardless of actual cause. A database failure can resemble “Nothing to follow up.”

Recommendation: provide pagination or visible limited-results totals. Distinguish schema-not-ready errors from other query failures and retain server diagnostics.

Acceptance: create more than 300 due entries and verify all can be reached; induce read failure and verify the UI does not claim there are no follow-ups.

### F06 — Medium: migration markers are weaker than migration completeness

Evidence: [migration-check.ts](../../src/lib/migration-check.ts), marker for 078; [078 SQL](../../migrations/078_follow_ups.sql).

The marker checks only `follow_up_on`. Partial application can leave this column present while `follow_done_at` or the index is absent, reporting readiness while the feature fails. This is a general limitation of one-marker-per-migration detection.

Recommendation: use an applied-migration ledger with verified completion, or validate all required objects for each feature.

Acceptance: a partial 078 schema must be reported as incomplete, including the missing required objects.

### F07 — Medium operational risk: SQL backup can omit journal guards

Evidence: [backup-dump.ts](../../src/lib/backup-dump.ts), trigger export catch ending at line 82.

Trigger export errors write a comment and allow the backup to continue. A completed data download can omit guards that prevent editing posted journals. Whether this occurs depends on database permissions/errors and was not reproduced here.

Recommendation: prominently report incomplete trigger export and verify expected triggers before approving a restore.

Acceptance: deny trigger metadata access in a test environment and verify a warning; restore a complete backup and test posted-entry guards.

## Focused observations

- Staff tokens are random and SQL stores hashes; session lookup checks current user/access status. Login checks origin and calls a login-attempt guard. Staff login currently filters to legal business 1.
- Feature policy is centralized, but individual queries/actions must enforce row scope. Follow-up/customer records are business-wide in the current schema; manager access to them needs an explicit policy decision before labeling it a confirmed division leak.
- Ledger posting has open-period checks, locks, balanced-line checks and duplicate-source handling. Full concurrency and close-versus-post races remain untested.
- Sales, returns, receipts and expenses contain transactional paths. Their presence does not prove every branch is atomic.
- Shop ordering reloads prices, checks email status, locks variants and checks availability in the transaction. `emailOrderStatus` catches failures, preventing that helper from turning a committed order into a failed response.
- Private documents use generated keys and path validation. Endpoint access/upload behavior still needs browser/integration checks.
- Development database/schema endpoints return 404 outside development; they are unauthenticated in development.

## Checks performed

| Check | Result |
| --- | --- |
| `npm.cmd test` | 257 tests; 253 passed, 0 failed, 4 skipped |
| Database integration | Four agreement-version cases skipped; required `_test` database configuration not enabled |
| `npm.cmd run lint` | Crashed in accessibility-rule evaluation; F04 |
| Documentation generator | 136 screens, 36 endpoints, 136 table definitions, 174 FK declarations, 78 migrations |
| Generator syntax | `node --check scripts/generate-project-docs.mjs` passed |
| Generator lint | `npx.cmd eslint scripts/generate-project-docs.mjs` passed |
| Documentation integrity | 2,545 local links checked; no missing targets; balanced code fences; all 136 CREATE tables present in dictionary and diagrams |
| Patch whitespace | `git diff --check` passed (Git reported normal Windows line-ending conversion notice) |
| Production build | Not run for this documentation-only change |
| Browser/screenshots, live DB, migrations, restore, external integrations | Not run |

Tests printed Node's existing module-type warning for imported TypeScript modules. Passing helper tests does not replace skipped integration/browser checks.

## Remaining line-by-line review

Use [REVIEW_COVERAGE.md](REVIEW_COVERAGE.md) as the backlog. Record commit, exact line ranges manually reviewed, callers/callees traced, findings and verification evidence. Do not label indexed files as manually reviewed merely because tests pass.

Review order: authentication/public endpoints; sales/payments/returns/stock; expenses/cash/owner/investor flows; posting/reversal/close; funding versions/capacity; reports/exports; documents/backups/integrations; UI states/accessibility and remaining helpers/styles/scripts. A full review needs a disposable schema-complete database and sanitized fixtures. No unresolved module is certified by this pass.
