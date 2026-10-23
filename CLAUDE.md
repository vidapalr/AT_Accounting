# Abhiram Group Accounting – standing instructions

Read `docs/ROADMAP.md` for goals, phases and the page audit. Read `AGENTS.md` before writing Next.js code.

## The owner and how to work with him

- The owner is a business owner, not a developer. He runs PowerShell on Windows (`npm.cmd`, not `npm`) and uses phpMyAdmin for database changes.
- **Every delivery ends with the same three-step block** (keep it short, exact, copy-paste):
  1. PowerShell: `cd E:\Projects\abhiram-accounting`, `git checkout feat/ledger-dry-run`, `git pull`
  2. Database changes: the named migration file(s) to paste in the phpMyAdmin SQL tab, or "none"
  3. `npm.cmd install` only if a package was added, then `npm.cmd run build`, `npm.cmd run dev`, open the page, and one line saying what to check. If red text appears he pastes it back.
- Ask him only what truly needs his decision; otherwise decide, go ahead, and say what was decided.
- Hosting auto-deploys from git. Merging to `main` is going live, and migrations are NOT applied automatically: run them in phpMyAdmin first (see ROADMAP section 7). Keep work on `feat/ledger-dry-run` until he says to go live.

## Design rules for everything built (owner's instructions, 23 Oct 2026)

1. **Clean look.** Plenty of white space, one calm colour scheme, no clutter, consistent headings and buttons, nothing decorative that does not help.
2. **Easy flow.** A person always knows where they are and what comes next: clear page titles, next-step links (sale saved -> view invoice -> take payment), plain names in the menu, no duplicate pages for one job.
3. **Easy for low-level employees.** Plain words (no accounting jargon on staff screens), big obvious buttons, few fields, sensible defaults, confirmation before anything that cannot be undone, helpful messages when something is wrong. Staff screens work on a phone.
4. Staff only see what their role allows (see `src/lib/access.ts`); deny by default.

## Business rules already decided (do not re-ask)

- Money is exact (paise/bigint). Posted journals are immutable; fix by reversal.
- Profit levels: gross, operating, net, shown separately for branch, division and group. Set-up costs are an asset, not a loss.
- Investor shares: shared 100% cap per profit basis across group, division and branch; group-level investors at most 49% (owner keeps at least 51%, configurable); changes split the period at the effective date; each agreement calculated once.
- Customers buy both on credit and paid. Wholesale/GST is future: keep fields ready, do not switch it on yet.
- Reports to staff and investors go by WhatsApp tap-to-send (free). Automatic paid WhatsApp API is optional and not wanted for now.
- Future goals: ecommerce site, Instagram auto-posts with videos, one-click new-stock share to customers, employees updating stock through WhatsApp (as drafts to approve), many divisions and branches.
