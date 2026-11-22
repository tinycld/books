# Bank Deposit — design

Status: APPROVED at the design gate 2026-11-21 (auto-helix unit p2-bank-deposit, feature `bank-deposit`): the human picked direction A and accepted the recommended answer of every open question Q1–Q10 as written in this spec; the (Qn) marks below are decisions, not open points. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Ledger rules ("Received payments go to Undeposited Funds until a Bank Deposit."; "Posted documents are voided (reversing entry, number kept), never deleted. Drafts can be deleted. Document numbers are sequential per type …, assigned at posting."; "Posted entries are immutable. The UI shows a normal "Edit"; underneath, it reverses the posted entry and posts the corrected one."), §Scope ("Purchases: … Bank Deposit, Transfer"), `books/GLOSSARY.md` ("Bank Deposit: A group of received payments, plus any extra lines, that arrive at the bank together. Moves money out of Undeposited Funds."). Contracts honored: `receive-payment-design.md` (§5 Cut: "Bank deposit grouping and the guard that a deposited payment cannot be voided or edited — p2-bank-deposit"; the payment layer and its keys), `sales-receipt-form-design.md` and `vendor-refund-design.md` and `refund-receipt-form-design.md` (documents that post on Undeposited funds), `bank-match-design.md` (a Books transaction is a posted line on the bank account; a void removes a match), `transfer-design.md` (key map, entry nouns), `report-drill-down-design.md` (`server/entry_routes.json`). Points the spec sources do not answer are marked (Qn) and carry the recommended answer of the design packet. Built against books `books/p4-categorize-split`@a9827d57, core `books/p4-categorize-split`@acb010dd. Direction A of the artboards (Q1).

## 1. Goal

A bookkeeper records one trip to the bank: picks the bank account and the date, ticks the money that waits in Undeposited funds, adds any other money that went in with it, and posts a numbered deposit that moves the total from Undeposited funds into the bank account, so the bank account shows one line that equals the bank statement's line.

## 2. Where it lives

- `books/deposits/new` — new deposit. `?replaces=<id>` edits a posted deposit (a correction that keeps its number).
- `books/deposits/[id]` — a draft opens in the form; a posted or void deposit opens in the read view.
- Screens `screens/deposits/new.tsx`, `screens/deposits/[id].tsx`, `screens/deposits/_layout.tsx`. Both routes are pushed pages; `hidesNewFab` gains `deposits`.
- Entry points: + New → column "Other" → "Bank deposit", after "Transfer" (`lib/new-actions.ts`, id `deposit`). The Journal Entries list, account registers, the entry drawer, General Ledger, Journal, report drill-down, the Banking page's match links and Books search open a deposit at `books/deposits/<id>` (`server/entry_routes.json` row `"deposit": "deposits"`). The read view of a deposited payment, sales receipt, vendor refund or refund receipt links to its deposit (§3.10).
- No list screen and no sidebar entry (Q7): as a transfer, a deposit is found through Journal Entries, the bank account's register and search.
- Not a forms host: the spec's §Forms host list does not name it. The form is a Books `useForm` + zod screen, as the receive-payment form. No Settings → Forms entry, no custom fields.

## 3. Behavior

### 3.1 Words

- An **undeposited item** is one posted journal line on an account whose detail type is Undeposited funds (`undeposited_funds`), whose entry is posted, is not void, is not the reversal of a void and is not a deposit's own entry, and that no posted deposit holds (Q2). A line that debits the account is money in (a positive amount): a received payment, a sales receipt, a vendor refund, a journal entry. A line that credits the account is money out (a negative amount): a refund receipt paid from Undeposited funds, a transfer out, a journal entry.
- An **other funds line** is money in this deposit that is not an undeposited item: it names an account and an amount.
- **Deposit total** = the sum of the ticked items + the sum of the other funds lines.

### 3.2 Speed and keyboard

- On open (new, draft, correction) Deposit to has focus on web at every width; after Post & new the fresh form focuses Deposit to again. Nothing takes focus on iOS and Android (standing approval).
- Tab order: Deposit to → Deposit date → item 1 tick box → item 2 tick box … → "Clear selection" → other funds line 1 (Received from → Account → Description → Amount → Remove) → line 2 … → "Add line" → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Each item row has one Tab stop, its tick box; Space toggles the focused box. The header tick box is a press target only (`tabIndex={-1}`); ⌥A does what it does.
- Deposit to is a core `SelectInput` (`autoFocus`). Received from is the Books `LinePartyPicker` and Account a Books `SearchPicker`: Enter, Space, ↓ or a printable character opens each (type-to-open, web); native opens every picker by tap.
- In an other funds Amount cell, Enter (native: the return key) moves to the next line's Received from; on the last line it adds a line and moves there. The cell selects its whole value on focus.
- Every action button with a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`; a key whose action sits in More is registered with the menu row's `shortcut` text. Every key is in core's ⇧? sheet, group "Bank deposit"; form keys use `allowInInputs`. Each key is registered only while its action is offered.

| Where | Action | Key |
|---|---|---|
| Form | Post | ⌘↵ |
| Form | Post & new | ⌘⇧↵ |
| Form | Save draft | ⌘S |
| Form | Cancel (Discard dialog when dirty) | Esc |
| Form | Delete draft (saved draft only) | ⌘⌫ |
| Form | Select every listed item / clear them when all are ticked | ⌥A |
| Form | Clear selection | ⌥⌫ |
| Form | Add an other funds line | ⌥↵ |
| Other funds line (focus inside it) | Remove line | ⌘⌥⌫ |
| Read view | Edit | E |
| Read view | Void | V |
| Read view | View journal entry | J |

- A key does nothing when its button is hidden, disabled or busy, or the user cannot write. While a dialog is open the screen's keys do nothing; Esc closes only the open layer.

### 3.3 Header band

One band (`rounded-xl border border-border bg-surface-secondary p-4`); its fields wrap when the band is narrower than they are; stacked in Tab order on a phone.

- **Deposit to** (required): core `SelectInput` over active accounts of type `bank` (Q9), chart order, "<number> <name>", indented by depth (`SelectOption.indent`). Default: the first active bank account in chart order (the vendor refund's Refunded to rule); with no bank account the select is empty with the text "Add a bank account to the chart of accounts". Under it, once picked, "Balance $5,627.38" (`PaidFromBalance`, `text-danger` when negative). A stored inactive account shows by name only for the value it mounted with.
- **Deposit date** (required): core `DateField`, default today.
- Header right: title ("Bank deposit" new, "Draft deposit" draft, "Edit deposit 1004" correction), status badge, `HelpIcon topic="books:bank-deposits"`, and the big figure "Deposit total $1,500.00" (`formatMoney`; "—" while an other funds amount is invalid; "Too large" over the stored-amount limit). Wide: top right. Phone: under the title.

### 3.4 Undeposited items

- Heading "Undeposited funds" and the count "3 items · $1,750.00" (count and sum of the listed items).
- Rows: every undeposited item (§3.1), oldest date first, then entry number. A draft also lists every item its stored rows name; a correction also lists the items its original holds (they are ticked). An item that a stored row names and that can no longer be deposited (its entry is void, or another deposit holds it) stays listed, ticked, with the refusal text under its row (§3.7), so the user can untick it.
- Wide (list at or above the grid's least width, computed from its columns: the tick column 44, 5 × 95, the gaps and the row padding): a grid with a header tick box and columns **Received from** (the line's customer or vendor; "—" when the line names none), **Transaction** ("Payment 1004", a `text-primary` link that opens the document through `entryHref`, pushed; when the chart has more than one Undeposited funds account with items, the account "1200 Undeposited funds" muted under it), **Date**, **Payment** ("Check · 98765": the source document's payment method label and reference no., `paymentText` with no account; a journal entry or transfer shows its line memo), **Amount** (right-aligned, `tabular-nums`; money out reads "−$20.00"). Every data column is flex with a least width of 95 px; header and rows share the column style constants; long text ellipsizes inside its cell; the grid never scrolls sideways.
- Below the grid's least width: one card per item: tick box and Received from on the first line with the amount at the right, "Payment 1004 · Oct 3, 2026" as the link line, the payment text under it. A "Select all" tick box over the cards does what the header tick box does (lesson 28).
- The whole row or card is the press target for the tick (the link is its own target). Pressing the Received from or Date header sorts by it; pressing again reverses (an arrow marks the sorted column). The default order is Date.
- The header tick box, "Select all" and ⌥A tick every listed item, or clear them all when every one is ticked. "Clear selection" (a link button under the list, ⌥⌫) clears every tick.
- Under the list, right-aligned under the Amount column (`TotalLine`s): **Selected** ("2 of 3 · $1,500.00").
- An item is deposited whole: a row has no amount input.
- Empty (no undeposited item and no stored row): "Nothing waits in Undeposited funds. Payments and sales receipts that you deposit to Undeposited funds show here." The form still posts with other funds lines alone.
- Loading: a skeleton of three rows. A failed read: the Books error banner with Retry (`recoverLiveQueries`, merged recoveries).
- No paging: one list in the page scroller. The server takes at most 500 items in a deposit; over that the form refuses "A deposit holds at most 500 items."

### 3.5 Other funds (Q3)

- A section under the items, heading "Other funds", hint "Money in this deposit that is not from a listed payment, such as interest or a refund. A negative amount takes money out, such as a fee or cash kept back." It starts with no line and an "Add line" button (⌥↵); a draft or correction with stored lines shows them.
- Each line: **Received from** (optional; `LinePartyPicker` over active customers and vendors; it names the party on the journal line), **Account** (required; `SearchPicker` over active accounts in chart order except accounts of type `accounts_receivable` and `accounts_payable`, and except the account chosen in Deposit to; "<number> <name>"), **Description** (optional text ≤ 1000), **Amount** (required; `MoneyInput`, right-aligned; a negative amount is accepted; zero is not: "Enter an amount other than 0"), **Remove** (icon button, label "Remove line 2").
- Wide (section at or above the table's least width: 4 × 95, the remove column 44, the gaps): a table whose columns are flex with a least width of 95 px, header and rows on shared constants. Below it: one card per line with the fields stacked and Remove in the card's first line.
- Under the lines, when one or more exist: **Other funds** total (`TotalLine`).
- At most 100 lines; "Add line" disables at the limit with the hint "A deposit holds at most 100 other funds lines."

### 3.6 Totals, validation and saving

- Under both sections, right-aligned: **Selected items** $1,500.00, **Other funds** $250.00 (only with lines), **Deposit total** $1,750.00 (`border-t border-border font-semibold`).
- Left of the totals: **Memo** (textarea ≤ 4000, hint "Only your team sees this. Saved as the journal entry memo.").
- One zod schema `depositSchema(currency)` through `useForm` + `zodResolver`, the same for Save draft and Post: Deposit to a listed option; Deposit date a real day (`isIsoDay`); each other funds line's Account required, Description ≤ 1000, Amount a money value other than 0 within the stored-amount limit; Memo ≤ 4000; and through `.superRefine`: at least one ticked item or one line ("Select an item or add a line to deposit."), Deposit total above zero ("The deposit total must be above $0.00."), Deposit total within the stored-amount limit, the date not before a ticked item's date ("Payment 1004 is dated Oct 12, 2026, after the deposit date.", under that row) (Q6). Every amount is integer cents through the shared money helpers.
- Action bar (the shared `DocumentActionBar`, sticky): wide Cancel, Save draft, Post (primary), Post & new, More (Delete draft, on a saved draft); phone Cancel, Save draft, Post, More (Post & new, Delete draft). On `?replaces`: Cancel, Save (primary, ⌘↵).
- Save writes through `useMutation`, as the payment's writes: (1) insert or update the `books_deposits` row as a draft; (2) the row plans (`planTableWrites` / `createTablePlans`) over `books_deposit_items` (one row per ticked item) and `books_deposit_lines`; (3) for Post, an update that sets `status: 'posted'`. The three steps are separate transactions yielded in order, so the insert of step 1 and the update of step 3 never merge. A synchronous Zustand flag set before the mutation holds the form through the write (the payment save store pattern). A post refused after the draft was written leaves the draft and shows the refusal.
- After Post: replace with `books/deposits/<id>` (read view). Post & new: replace with a fresh `books/deposits/new`. Save draft stays at `books/deposits/<id>`. Save on `?replaces`: replace with the correction's read view.
- Cancel, or any navigation away, with edits opens the Discard dialog (`useFormLeaveGuard`); without edits it leaves at once. Delete draft opens `DeleteDraftDialog` ("Delete this draft deposit? This can't be undone.").
- Refusals: Deposit to and Deposit date under those fields; an item's refusal under its row (root `items.<n>`); a line's under that line's field (`lines.<n>.<field>`); the rest (close date, sequence, limit) in `FormErrorSummary` with PocketBase's final period. A refusal after the user left is logged (`log.warn('books.deposit', …)`).
- Writers only (bookkeeper or admin). A non-writer at `books/deposits/new` sees "You need bookkeeper access to record deposits"; + New hides for non-writers already. Offline: the write buttons disable (`useWritesAvailable`).

### 3.7 A deposit (server)

- **Guards** (inside `serialized`): Deposit to exists, is active and has type `bank`; the date is a real day; at most 500 items and 100 lines; each item's line is on an Undeposited funds account and listed once in the deposit; each other funds line's account exists, is active, is not of type `accounts_receivable` or `accounts_payable` and is not Deposit to; its amount is not 0 and is within the stored-amount limit; its customer or vendor exists (at most one of the two). Items and lines are written only while their deposit is a draft.
- **Posting** (draft → posted, one transaction, through `postDocument` with doc type `deposit`): allocate the number from the `deposit` sequence (Settings → Numbering "Deposits", no prefix, next 1001) (Q8); re-read each item's line and refuse, keyed `items.<n>`: "Payment 1004 is void." (its entry is not posted, or is a void reversal), "Payment 1004 is already in Deposit 1002." (a posted deposit holds the line), "Payment 1004 is dated after the deposit date."; refuse a total that is not above zero ("The deposit total must be above $0.00."); write each item's `amount` (debit − credit of its line), `entry` and `posted = true`; create the journal entry (`doc_type deposit`, `origin document`, `document = deposit.id`, the deposit date, the memo): one debit to Deposit to for the total; for each Undeposited funds account, one line for the net of its ticked items (a credit when the net is above zero, a debit when it is below; no line at zero); one line per other funds line on its account (a credit for a positive amount, a debit for a negative one) with its description as the line memo and its customer or vendor; post through `postEntry` (close date, balance, accounts); write `entry`, `number`, `total`, `items_total`, `lines_total`, `posted_by`, `posted_at`.
- **Correction** (`replaces`): as the payment's (`voidReplaced` pattern): the original's items are released (`posted = false`), the original becomes void with `replaced_by`, the correction takes its number and holds its own items. The original must be posted.
- **Void** (posted → void): the reversing entry in the original period, the number kept, the items released, so they are undeposited items again. Refused on or before the close date (the ledger's refusal). A bank match on the deposit's bank line is removed by the existing `unmatchEntry`.
- **The deposited-item guard** (Q5): the entry of a line that a posted deposit holds cannot move to void. The guard sits in `transitionEntry` (`server/entries.go`), the one path a document void, a document correction and a journal entry edit all take, and refuses: "Payment 1004 is in Deposit 1002. Remove it from the deposit first." (the noun and number of the entry through `entryNouns`; the deposit's number). A manual reverse of a journal entry stays allowed: its reversal posts a new line, which is an undeposited item of the other sign.
- **Uniqueness**: a partial unique index on `books_deposit_items (line) WHERE posted = TRUE`, so two deposits that post the same item at once cannot both win.
- Account rules: an account that is the Deposit to of a deposit, or the account of an other funds line, cannot be deleted ("This account is the deposit account of 1 deposit and cannot be deleted. Make it inactive instead." / "… of %d deposits …"; "This account is on 1 deposit line …"). A customer or vendor on an other funds line cannot be deleted ("<Name> is on deposits. Make it inactive instead.").
- A deposit is not a deferred kind of the cash basis: its entry counts as posted on both methods. It writes no document balance and no party balance (its lines cannot name Accounts receivable or Accounts payable).

### 3.8 Read view (posted or void)

- Header as the form: title "Deposit 1004", badge Posted / Void, big figure "Deposit total".
- Body: Deposit to ("1010 Business checking"), Deposit date; **Items deposited** (grid Received from · Transaction link · Date · Payment · Amount, every column flex with a least width of 95 px, no sideways scroll; cards below the grid's least width), read from the deposit's item rows; **Other funds** (Received from · Account · Description · Amount; cards below its least width) when lines exist; Selected items / Other funds / Deposit total; memo; "Posted by <name>, <date time>"; "Voided by …"; "Replaced by 1004 (edited)" on a replaced original.
- Actions (writer, posted): **Edit** (E; `books/deposits/new?replaces=<id>`), **Void** (V; `VoidDialog`: "A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again."), **View journal entry** (J; `books/entries/<entry>`). Writer on a void deposit, and a reader: View journal entry only. No PDF and no Copy.

### 3.9 States

Loading (`LoadingState` until access, settings, the bank accounts and, for an id, the deposit, its items and its lines are ready; the items list has its own skeleton); error "Books could not load this deposit." with Retry (merged recoveries, one per failing read); not found "This deposit does not exist" with a back link; `?replaces` of a deposit that is not posted: "This deposit cannot be edited"; offline: action buttons disabled.

### 3.10 Elsewhere in Books

- **Read views of a deposited document** (payment, sales receipt, vendor refund, refund receipt): a notice line "In Deposit 1002" (a link to the deposit) with the text "To edit or void this payment, remove it from the deposit first." Edit and Void (and their keys E and V) are not offered while the document is in a posted deposit; View journal entry stays. The server guard of §3.7 holds whatever the client offers. A journal entry or transfer with a deposited line shows the server's refusal when Edit is saved or Void is confirmed.
- **Journal Entries list, registers, entry drawer, General Ledger, Journal, Transaction Detail**: Type "Deposit" (`entry_type_labels.json` `docTypes.deposit`), No. "1004"; Open goes to the deposit; Edit opens the correction; Reverse hidden. "Void reversal of 1004".
- **Banking page**: a deposit's bank line is a Books transaction that can be matched ("1 match · Deposit 1004 · Oct 3, 2026"); no code change beyond the label and the route row.
- **Search**: kind `deposit`, title "Deposit 1004 · 1010 Business checking" / "Draft deposit"; number and memo indexed (FTS `fts_books_deposits`).
- **Settings → Numbering**: card "Deposits" (no prefix, next 1001).
- **Audit log**: `books_deposits` audited, labels "Deposit 1004", "Draft deposit"; item and line rows "<deposit>: Payment 1004", "<deposit>: line 2".
- OAuth scopes (rw deposits, items and lines; read the undeposited view), `entryNouns("deposit")`, `entries.go` document-entry checks, the report sources' doc-type option, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters` gains a deposit poster.
- **Help**: new `help/bank-deposits.md` (id `books:bank-deposits`; task-led: record a deposit, what shows in the list and why, money out as a negative item, other funds and a fee or cash kept back, drafts, edit and void, why a deposited payment cannot be edited, find a deposit, the key table with Mac glyphs). `help/receive-payment.md`, `help/sales-receipts.md`, `help/vendor-refunds.md`, `help/refund-receipts.md` and `help/banking.md` link to it where they name Undeposited funds; `help/bank-match.md` names the deposit as the Books transaction that one bank line matches.

## 4. Data

### 4.1 New migration (`<next>_create_books_deposits.js`; the next free number when the plan is written — 2100000036 on this branch today)

- `books_deposits`: `status` select draft/posted/void, `number` text 40 (server), `sequence` number (server), `date` text day (required), `deposit_to` relation books_accounts (required), `memo` text 4000, `total`, `items_total`, `lines_total` number onlyInt (server), `currency` (server), `entry` relation books_journal_entries (server), `replaces` / `replaced_by` relation books_deposits, `posted_by` / `posted_at` / `voided_by` / `voided_at` (server), `sort_key` (server), `created`, `updated`. Rules as the payment's: READ list/view; create `WRITE && status = "draft"` with server fields unset; update `WRITE` with server fields unset and (`status = "draft"` or posted → void); delete `WRITE && status = "draft"`.
- `books_deposit_items`: `deposit` (relation, required, cascade), `line` (relation books_journal_lines, required), `position` onlyInt; server-written: `entry` (relation books_journal_entries), `account`, `customer`, `vendor` (relations), `amount` (number onlyInt, signed), `date` (text day), `doc_type`, `number`, `document` (text), `payment_method`, `reference_no` (text), `posted` (bool). The server fills the copy fields from the line, its entry and its source document when the row is created and again at posting, so the read view and a correction read one collection. Unique (`deposit`, `line`); partial unique (`line`) where `posted = TRUE`; index on `entry`. Rules as the deposit's; create and delete only while the deposit is a draft, server fields unset; no client update.
- `books_deposit_lines`: `deposit` (relation, required, cascade), `customer` (relation books_customers, optional), `vendor` (relation books_vendors, optional), `account` (relation books_accounts, required), `description` text 1000, `amount` number onlyInt (signed, not 0), `position` onlyInt. Rules as the deposit's; writes only while the deposit is a draft.
- `books_undeposited_items` — a view collection (rules READ), one row per undeposited item (§3.1): `id` (the line id), `line`, `entry`, `account`, `date`, `doc_type`, `origin`, `number`, `document`, `customer`, `vendor`, `amount` (debit − credit), `payment_method`, `reference_no`, `memo`. One `SELECT` over `books_journal_lines` joined to `books_accounts` (`detail_type = 'undeposited_funds'`) and `books_journal_entries` (`status = 'posted'`, `origin != 'void_reversal'`, `doc_type != 'deposit'`), `LEFT JOIN` to `books_payments`, `books_sales_receipts`, `books_vendor_refunds` and `books_refund_receipts` on `entry.document` for the payment method and reference no. (`COALESCE`), with `NOT EXISTS` over `books_deposit_items` where `posted = TRUE`; no `UNION ALL` (memory p5-change-signal). The plan confirms each source collection's column names in its migration before it writes the SQL. An index on `books_journal_lines (account, date) WHERE posted = TRUE` serves it when the existing match indexes do not.
- FTS index `fts_books_deposits` over number, memo.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `deposit`; seed row `booksseqdeposit` (15 characters), no prefix, next 1001.
- 2100000002: `books_journal_entries.doc_type` gains `deposit`.
- `server/entry_type_labels.json` `docTypes.deposit = "Deposit"`; `lib/register.ts` `DOC_TYPE_LABELS` and `lib/doc-types.ts` `DOC_TYPES` gain it; `server/entry_routes.json` gains `"deposit": "deposits"`.

### 4.3 Server (Go, `books/server/`)

- `deposits.go` (guards, the item copy fields, the delete refusals), `deposit_posting.go` (posting, correction, void, release), the guard in `entries.go` `transitionEntry` (`depositHolding(tx, entryID)`), `changesignal.RegisterView("books_undeposited_items", "books_journal_lines", "books_journal_entries", "books_accounts", "books_deposit_items", "books_payments", "books_sales_receipts", "books_vendor_refunds", "books_refund_receipts")`, and the registrations of §3.10. Exported for later units: `depositHolding` (p4-reconcile may read it).
- Every guard that reads entry, line or item state before a write runs inside `serialized`.

### 4.4 Client reads (each `useLiveQuery` with `{ query, queryKey }`)

- Undeposited items (key `books.deposit.undeposited`): `books_undeposited_items`, ordered by date then number, with `materialize()` of the customer and the vendor (names) and the account; kept live with core `liveViewOptions('books_undeposited_items')` in `collections.ts`.
- Deposit by id (`findOne`) with `materialize()` of deposit_to, posted_by, voided_by; its items ordered by position with `materialize()` of customer and vendor; its lines ordered by position with `materialize()` of account, customer and vendor. A draft or correction merges its stored items with the undeposited rows by line id in the hook (one reads a filtered view, the other the deposit's own rows; the payment's `useOutstandingInvoices` pattern).
- Bank accounts with balances (`accountsWithBalances`, filtered to type `bank`), the other funds account options (`filteredAccountOptions`), party options (`useLinePartyOptions`), settings (currency).
- "In Deposit 1002" on a source read view: `books_deposit_items` where `entry = <the document's entry>` and `posted = true`, with `materialize()` of the deposit (`findOne`).
- Row types derive from the queries.

### 4.5 Client modules

- `lib/deposit.ts` (pure: `depositTotals`, `toggleItem`, `selectAll`, `isEveryItemTicked`, `clearSelection`, `mergeItems`, `sortItems`, `itemLabel`, `itemPaymentText`), `lib/deposit-schema.ts`, `lib/deposit-values.ts`, `lib/deposit-columns.ts` (the grids' shared column constants and least widths), `lib/deposit-texts.ts`, `lib/deposit-shortcuts.ts`, `lib/deposit-accounts.ts` gains `bankAccountOptions` and `otherFundsAccountOptions`.
- `hooks/useDepositForm.ts`, `useDepositRecord.ts`, `useUndepositedItems.ts`, `useDepositWrites.ts`, `useDepositScreen.ts`, `useDepositShortcuts.ts`, `useDepositReadActions.ts`, `useDepositOf.ts` (the "In Deposit" read).
- `components/deposits/`: `DepositScreen`, `DepositForm`, `DepositBand`, `UndepositedGrid`, `UndepositedCards`, `OtherFundsTable`, `OtherFundsCards`, `DepositTotals`, `DepositReadView`, `DepositReadActions`, `DepositStateNotice`, `InDepositNotice`.
- `stores/deposit-save-store.ts` (the synchronous save flag).
- Shared parts reused unchanged: `DocumentHeader`, `DocumentActionBar` through `DocumentChromeContext`, `SelectBox`, `TotalLine`, `PaidFromBalance`, `LinePartyPicker`, `SearchPicker`, `MoneyInput`, `DiscardDialog`, `DeleteDraftDialog`, `VoidDialog`, `planTableWrites` / `createTablePlans`, `useFormLeaveGuard`. No deposit file copies a payment file: where a payment part is needed with other texts, the plan gives the part its texts as parameters (lesson 8).

### 4.6 Seed and fixture

- `lib/bank-deposit-fixture.ts` (typed with `satisfies` against the generated types once the migration exists; accounts by `seed.ts` ACCOUNTS numbers): five undeposited items (a payment by check, a sales receipt by card, a vendor refund, a refund receipt as money out, a journal entry with no party and a long memo), a long customer name and a large amount, a draft with two items ticked and one other funds line, a posted deposit with three items and two other funds lines (interest in, a bank fee as a negative amount), a void deposit and its correction, the empty state.
- `seed.ts` posts two more sales receipts to Undeposited funds and one deposit that holds one of them plus an interest line, dated after mid-2026 on days no report spec reads, and leaves the seeded payments undeposited. Before it adds them, the plan greps every spec and Go test that reads 1200 Undeposited funds, the bank accounts, the seeded entry counts and the sales receipt rows (lessons 1, 24, 33).

### 4.7 Tests the plan must carry

- Vitest: `lib/deposit.ts` (totals with money out, select all and clear, merge of stored and listed items, sort), the schema (each refusal), the account option filters, the key map, the fixture, the help topic.
- Go: guards (each refusal), posting (entry lines for one and two Undeposited funds accounts, a negative item, a negative other funds line, the total), two deposits posting one item at once (one wins), correction, void and release, the deposited-item guard for a payment, a sales receipt, a vendor refund, a refund receipt and a journal entry (void and correction each), the view (void, void reversal, a deposit's own lines and deposited lines left out; a second Undeposited funds account), delete refusals, audit, search, the transaction-detail poster.
- E2E `tests/e2e/bank-deposit-*.spec.ts`; each test posts its own payment or sales receipt to Undeposited funds through the UI with a per-run memo and reference no., and finds its row by that reference: create and post a deposit of two items and read the bank register line; an other funds line with a negative fee; draft, reopen, post; edit as a correction; void returns the items; a deposited payment has no Edit or Void and links to the deposit, and the server refusal shows on a journal entry; a held and a refused post (`route.fulfill({ status: 400 })`); the keys; read-only user; phone (390×844, navigate wide then resize): cards, "Select all", the action bar's More.

## 5. Cut (Q4)

- **Cash back** (account, memo, amount) — an other funds line with a negative amount on the same account does the same with one control.
- **Payment method and Ref no. on an other funds line** — the Description holds it; the deposit's lines post to the ledger by account and amount only.
- **Editing a payment's method, memo or reference no. in the list** — a posted payment is immutable; it is edited on its own screen as a correction.
- **Tags** — Books has no tags.
- **Attachments on a deposit** — the Books spec scopes attachments to bills and expenses.
- **Paging of the list** — one list; the count line replaces "1-2 of 2".
- **Reorder of other funds lines and "Clear all lines"** — line order does not change what posts; Remove on each line covers it.
- **Depositing part of a payment** — an item is deposited whole.
- **A deposit list screen and a Deposits tab in the Sales lists** — Journal Entries, the bank register and search find a deposit (Q7).
- **Print a deposit slip, PDF, email** — the Books spec lists PDFs for invoices, estimates, statements and reports.
- **Copy a deposit** — a deposit is tied to the items it holds.
- **A deposit to a credit card or other account** — a transfer or a journal entry does that.

## 6. Platform notes

- Keyboard shortcuts: web and iOS with a hardware keyboard; Android has none; every action keeps a visible button (standing approval, 2026-11-11).
- Deposit to autofocus and type-to-open pickers: web only (standing approval, 2026-11-11).
- The row tick by a press on the row, "Select all", the other funds lines and every write run on web and native. A negative other funds amount must be typeable on iOS and Android. The amount cell is the Books `MoneyInput` / `MoneyTextField` with `marksNegative` (`inputMode="decimal"`), the cell the opening balances and the bank categorize split use for a negative amount. The plan reads how that cell takes a minus sign on the native keyboards; when the iOS decimal keyboard gives no minus key, the fix is made in `MoneyTextField` for every caller that accepts a negative amount, not in the deposit form.
- No new platform-only item.

## 7. Sparks carried

- Deposit total is the largest figure: the shared `DocumentHeader` big figure (`text-2xl font-semibold text-foreground tabular-nums`), top right wide, under the title on a phone.
- Selection is the main act: a Books `SelectBox` per row and in the header, the row itself a press target, and the Selected line under the Amount column; totals as `TotalLine`s, the last with `border-t border-border font-semibold`.
- No core extension.

## 8. Non-goals

- No change to where a payment, sales receipt, vendor refund or refund receipt deposits, and no change to the "Sales deposited to" setting.
- No automatic deposit and no rule that groups payments.
- No reconciliation and no cleared marks (p4-reconcile).
- No change to the bank match rules: a deposit is matched as any Books transaction.
- No new endpoint: a deposit is collection rows with Go hooks.
- No multi-currency.

## 9. Engine reach (self-review 5)

- Shortcut buttons: core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`) with `scopeOwner` from core `useShortcutScope`; other keys through core `useRegisterShortcuts` (`allowInInputs`).
- Form and refusals: `useForm` + `zodResolver` + `FormErrorSummary` (`@tinycld/core/ui/form`); other funds lines through react-hook-form `useFieldArray`; field refusals through `handleMutationErrorsWithForm` and the Books `recordRefusalHandler` pattern; the inline row refusal is a root error keyed `items.<n>` drawn under the row, as the payment's `applications.<n>`.
- Fields: core `SelectInput` (`autoFocus`, `SelectOption.indent`), core `DateField`, Books `MoneyInput`, `SearchPicker`, `LinePartyPicker`.
- Multi-row write: three pbtsdb transactions yielded in order from one `useMutation` generator (deposit insert or update; the item and line plans; the status update), the order `usePaymentWrites` uses. No row is inserted and updated in one transaction.
- Live view: Go `changesignal.RegisterView` and core `liveViewOptions` (`@tinycld/core/lib/change-signal`), as `books_bank_match_suggestions`.
- Failed reads: core `recoverLiveQueries` with Books `mergeRecoveries`. Leave guard: core `useLeaveGuard` (`core/components/forms-builder/use-leave-guard.ts`) through Books `useFormLeaveGuard`. Write availability: core `useWritesAvailable` (`core/lib/use-writes-available.ts`).
- Every Behavior bullet has an API above; there is no needs-extension item.
