# Change checklist (use for every update)

Copy this list into the pull request or delivery note and tick each line. A change is not done until every line is ticked or marked "not needed" with a reason.

## 1. Plan
- [ ] The item is on the Master Tracker with its priority; the tracker line says what "done" means.
- [ ] Decided which module it belongs to (see `src/lib/navigation.ts` modules) and which roles may use it (`src/lib/access.ts`).

## 2. Code rules (no exceptions)
- [ ] **No fixed company values.** No business id, division id, branch id, company name, phone, address, domain, logo path or account code written in code. Use:
  - company: `currentBusinessId()` (`src/lib/tenant.ts`) or `user.legal_business_id`
  - division: `getActiveDivisionId(user)` / `getActiveDivision(user)`
  - names, phones, logos: `getBrand()` (`src/lib/brand.ts`)
  - other per-company choices: `businessSetting()` (`src/lib/business-settings.ts`)
  - ledger accounts: a role from `ACCOUNT` (`src/lib/ledger/posting-rules.ts`); the company's own code comes from Account mapping
  - installation settings (hosts, secrets): `src/lib/app-config.ts` and environment variables
- [ ] **No copied code.** Styles from `src/lib/ui/styles.ts`, money and dates from `src/lib/format.ts`, screen parts from `src/components/ui`. If you are about to paste a block from another file, move it to a shared module instead.
- [ ] Every page and server action starts with `requireAccess()` / `requireGroupOwner()`; every query filters by `legal_business_id`.
- [ ] Money in paise (`bigint`); posted journals never edited (reverse instead).
- [ ] Business logic in `src/lib` (pure functions where possible), not inside pages, so the future mobile app can reuse it.
- [ ] Plain words on screen, big buttons, works on a phone (owner's design rules in `CLAUDE.md`).

## 3. Database
- [ ] New migration file `migrations/NNN_short_name.sql` from `docs/templates/MIGRATION_TEMPLATE.sql`: idempotent, `legal_business_id` on every new table, no data for one company except clearly labelled seed rows.
- [ ] Code still works before the migration is run (missing table = feature hidden, not a crash) where possible.

## 4. Tests and checks
- [ ] Unit test for every new pure function (`tests/*.test.mjs`).
- [ ] `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` all pass.
- [ ] Opened the screen on a phone-sized window and a desktop.

## 5. Delivery
- [ ] Docs updated: `docs/ROADMAP.md` (technical record), `docs/current/*` regenerated with `node scripts/generate-project-docs.mjs`, env names in `docs/current/ENVIRONMENT.md`.
- [ ] Master Tracker: status changed, change-log line added.
- [ ] Delivery note ends with the three-step block from `CLAUDE.md` (pull, migrations, build and what to check).
