# Acceptance and screen verification

These are planned scenarios, not completed results. Use an isolated test database and provider accounts. Record commit, schema level, role, fixture IDs, expected result and observed result. Keep real customer details out of screenshots.

## Screen evidence

For every route in the [136-screen catalogue](SCREENS.md), capture populated, empty, validation/error and relevant role-denied states. For financial screens include filters and print/export evidence. Dynamic routes need representative records.

Name evidence by route/role/state, for example `accounting-follow-ups-cashier-empty.png`. Retain fixture and commit details in an evidence manifest. No screenshots are included in this delivery; extracted headings and fields are not rendered evidence.

## End-to-end scenarios

| Area | Scenario | Expected evidence |
| --- | --- | --- |
| Login | Valid/invalid password, disabled user, origin, throttling and logout | Correct redirects; no unauthorized sessions |
| Two-step | Lookup failure, wrong/replayed/backup code, expired challenge | No bypass on unknown state; single-use verification |
| Roles/scope | Every role; direct URLs, forged actions, other division/party IDs | Server-side rejection and scoped data |
| Purchase | PO, partial/duplicate receipts, batched payments, return | Stock, supplier dues and money movements reconcile |
| Inventory | Last-unit concurrency, transfer, count, damage, free/approval stock | No duplicate movement; approval limits respected |
| Sales | Cash/bank/credit, partial payment, discount, delivery, offers/rewards | Invoice, stock cost, collected and outstanding amounts agree |
| Returns | Partial/repeated return, damage, refund/cancellation, exchange | Quantity and credit stay within available original amounts |
| Expenses | Initial/later payments using business/personal/investor money | Correct account effects without double counting |
| Cash closing | Denominations, shortage/excess, destinations, redo | Counted totals reconcile; restricted actions denied |
| Customers | Duplicate phone, merge, history, ageing, supplier set-off | References preserved; settlement counted once |
| Follow-ups | Done/Move, retry, failed second write, more than 300 tasks | Atomic/idempotent updates and complete accessible results |
| Funding | Activate/amend, overlapping effective scopes, receipt/return/payout | Correct approved version, capacity and participation |
| Journals | Concurrent/duplicate post, unbalanced input, closed period, reversal | One intended balanced effect with audit evidence |
| Closing/reports | Pending postings, source versus ledger, month/year transition | Exceptions visible; trial balance and roll-forwards agree |
| Shop | Account verification/reset, price tampering, concurrent last-item order | Server prices/stock prevail; account privacy holds |
| Documents | Invalid type/size/key, forbidden user, print log, redeploy | Correct access and persistence |
| Messaging | Preview, explicit test send, retries, duplicate/invalid callbacks | Authorized delivery with visible status and deduplication |
| Recovery | SQL/files, denied trigger export, isolated restore | Complete data/files/guards and usable encrypted records |
| UI | Desktop/mobile, keyboard, labels, errors, print pagination | Accessible controls and readable, consistent totals |

## Financial reconciliation packet

Retain opening trial balance, source transactions, journal export, closing trial balance, stock quantity/value roll-forward, bank/cash roll-forward, receivables/payables and funding movements for one test period. Explain every operational-versus-ledger difference and capture posting failures before/after reconciliation. A balanced trial balance alone does not prove completeness or correct classification.
