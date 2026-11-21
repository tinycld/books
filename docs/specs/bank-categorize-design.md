# Categorize, split, or transfer a bank transaction — design

Status: approved at the design gate 2026-11-20 (auto-helix unit p4-categorize-split, feature `bank-categorize`): direction A, every open-question recommendation accepted (questions 1–18, including question 10: the drawer goes to the next For review row after Categorize, Transfer, Match and Exclude). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, For review / Reviewed / Excluded tabs, match / categorize / split / exclude"; "in-app help for every feature"), §Ledger rules (posting is the point of enforcement; posted entries are voided, never deleted) and §Interface. Builds on `books/docs/specs/for-review-design.md` (the queue, the drawer and its `children` slot, the selection bar, Exclude) and `books/docs/specs/bank-match-design.md` (the Match section, `books_bank_matches`, the Reviewed tab's In Books column, Undo). Built against books `books/p2-statements`@3886a1f, core @654110f8.

This draft is written for direction A of the artboards (the ways are tabs in the drawer) and for the recommended answer of each open question of the design packet. A different pick at the gate changes §2 and the sections the packet names.

## 1. Goal

A bookkeeper puts an imported bank transaction that is not yet in Books into the books in one step: one account, several accounts (a split), or a transfer to another account. The bank transaction is then reviewed, and the step can be undone.

## 2. Where it lives

- The Banking page, inside the account panel's For review and Reviewed tabs (p4-for-review). No new route, no sidebar entry, no new tab.
- The transaction drawer (`BankTxnDrawer`) of a For review transaction: a **way switch** in the `children` slot, under the fields, with three ways: **Categorize** · **Match** · **Transfer**. One way's section shows at a time. Match is the section of p4-match, unchanged.
- The drawer of a Reviewed transaction that was categorized or transferred: an **Added to Books** section in the place of p4-match's Matched to section.
- The selection bar of the For review tab: **Categorize** for the chosen rows, which opens a dialog.
- The Reviewed list's In Books column: the text for a transaction that was added.
- Exclude stays where p4-for-review put it (the drawer's action at the bottom, the selection bar, key E). This unit does not change it.

## 3. Behavior

### Words

- To **categorize** a bank transaction is to say which account its money belongs to. Books posts one journal entry for it: one line on the bank or card account for the bank amount, and one line on the chosen account.
- A **split** is a categorize with two or more lines, each with its own account, amount and memo. The lines add up to the bank amount.
- To **record as a transfer** is to say that the money moved between this account and another balance-sheet account of the books (a bank account, a credit card, a loan). Books posts one transfer. A payment of a credit card from a bank account is a transfer.
- A transaction that was categorized or transferred is **added**: Books made a new Books transaction for it. A matched transaction (p4-match) used one that was there.
- The **payee** is the customer or vendor the money came from or went to. It is optional.

### The way switch (For review, writers)

- Core `SetupTabs`, test id `bank-way` (tabs `bank-way-categorize`, `bank-way-match`, `bank-way-transfer`), directly above the section it controls, under a top border (`border-t border-border pt-4`).
- The way a transaction opens with: **Match** when Books has one or more suggestions for it (p4-match's rule), **Categorize** when it has none. The suggestions decide this when they have loaded; until then the section shows core `LoadingState`.
- The Match tab shows the count of suggestions when there are any: "Match (1)".
- The way is kept in the banking UI store (`txnWay`); it resets when the drawer shows another transaction or closes.
- A reader sees no way switch. A reader sees the Match section's list as p4-match draws it for a reader when there are suggestions, and nothing when there are none.
- A Reviewed or Excluded transaction has no way switch.

### Categorize

- Fields, top to bottom, in one column (the inline drawer is 380 wide):
  - **Payee** — Books `SearchPicker` over active customers and vendors (`linePartyOptions`, groups "Customers" and "Vendors"), with a "No payee" choice. Optional. Test id `bank-cat-payee`.
  - **Account** — Books `SearchPicker` over the chart, grouped by account type, sub-accounts indented (`filteredAccountOptions`, `indent`), labels "6400 Office and general". Required. Test id `bank-cat-account-0`. It lists every active account but three kinds: the connection's own account, Accounts receivable accounts and Accounts payable accounts.
  - **Memo** — core `TextInput`, at most 4000 characters, test id `bank-cat-memo`. It starts as the bank description.
- Under the fields: **Split** (a link button, `text-primary`, 44 high, test id `bank-cat-split`), then the submit button.
- **Categorize** (`ShortcutButton`, key ⌘↵, test id `bank-cat-submit`) posts the transaction. It is disabled, with the hint "Choose an account.", while no account is chosen.
- The entry Books posts: dated the bank date; memo from the Memo field; line 1 on the connection's account for the bank amount (a credit for money out, a debit for money in); line 2 on the chosen account for the same amount on the other side; the payee named on both lines. It is a journal entry ("Journal entry 1042"), numbered from the journal sequence, and it opens, is edited and is voided as every journal entry.
- The form has no date field and no amount field: both are the bank's.

### Split

- Pressing **Split** changes the Account field into a list of lines and adds a second line. Each line is a card (`border border-border rounded-md p-3`, test id `bank-cat-line-<n>`): **Account** (the same picker, test id `bank-cat-account-<n>`), then one row with **Amount** (Books money text field as `MoneyInput` draws it, `tabular-nums`, right aligned, test id `bank-cat-amount-<n>`) and **Memo** (optional, at most 1000 characters, test id `bank-cat-line-memo-<n>`), and a remove button (Lucide `X`, 44 pt, label "Remove line 2", test id `bank-cat-remove-<n>`).
- The first line starts with the whole bank amount. A new line starts with the amount that remains, when it is not 0.
- **Add a line** (outline `ShortcutButton`, key ⌥↵, test id `bank-cat-add-line`) adds a line, up to 50 lines (`CATEGORIZE_MAX_LINES`). At 50 the button is disabled with the hint "A split holds at most 50 lines."
- An amount is typed as money without a sign for the transaction's own direction: on a Spent transaction "86.47" is money spent on that account. A negative amount ("-30.00") is the other direction: on a Received transaction of $970.00, lines "1,000.00 Service income" and "-30.00 Bank charges and fees" add up. An amount of 0 is refused: "Enter an amount other than 0."
- A totals line under the lines (test id `bank-cat-totals`): "Split $970.00 of $970.00" and, when they differ, "Remaining $120.00" (or "Over by $120.00") in `text-danger`.
- Categorize is enabled only when every line has an account and an amount and the lines add up to the bank amount. While disabled it has the hint "The lines must add up to $970.00."
- Removing a line until one is left returns to the one-account form; that line's amount goes back to the bank amount.
- The entry Books posts for a split: line 1 on the connection's account for the bank amount, then one line for each split line in order, with the line's memo. A positive amount goes on the side opposite the bank line; a negative amount goes on the bank line's side.

### Transfer

- Fields: **To account** for a Spent transaction, **From account** for a Received one — Books `SearchPicker` over the active accounts a transfer may use (`transferAccountOptions`, `TRANSFER_ACCOUNT_TYPES`) without the connection's own account; required; test id `bank-transfer-account`. **Memo** — as in Categorize; test id `bank-transfer-memo`.
- One line of text over the fields says what will be recorded: "A transfer of $500.00 from 1010 Business checking." (Spent) or "A transfer of $500.00 into 1010 Business checking." (Received) (`text-sm text-muted-foreground`).
- **Record transfer** (`ShortcutButton`, key ⌘↵, test id `bank-transfer-submit`). Disabled, with the hint "Choose the other account.", while no account is chosen.
- Books posts a transfer (`doc_type` transfer, "Transfer 1008"), dated the bank date: line 1 credits the account the money left, line 2 debits the account it entered (the shape `checkTransfer` enforces). It opens, is edited and is voided as every transfer.
- When the other account is also connected, its own bank file holds the other side of the movement; that bank transaction then shows this transfer as a match suggestion (p4-match), and the user matches it there. The help topic says so.

### Sending, success and refusal (Categorize and Transfer)

- While the write is sent, the submit button shows "Categorizing…" / "Recording…" with core `ButtonSpinner` (a disabled `Button` takes the `ShortcutButton`'s place, as `MatchSubmit` does), and the fields, the way switch and the drawer's Exclude are disabled. The form stays mounted through the write (a synchronous store flag set before the mutation, memory p1-opening-balances), so a refusal is not lost.
- Success: the drawer shows the next transaction of the For review list (the row under the one that left, or the row above when it was the last), opened with its own default way. When the list has no other row, the drawer closes. The result line under the toolbar reads "Added Journal entry 1042." / "Added Transfer 1008." (`text-sm text-muted-foreground`, `accessibilityLiveRegion="polite"`).
- The same rule now holds for the drawer's Match (p4-match) and Exclude (p4-for-review): after each, the drawer shows the next For review transaction and does not close. Their result lines stay as they are.
- A refusal keeps the drawer on the transaction and shows the server's message: under the field it names (the Account of line n, an amount) when the server names a field, otherwise in `text-danger` under the totals line (`accessibilityRole="alert"`, test id `bank-cat-refusal`). The server's refusals: the transaction is already reviewed or is excluded (p4-match's texts); the bank date is on or before the close date (the posting text of `checkClosePeriod`); an account is inactive, missing, the connection's own, or an Accounts receivable or Accounts payable account; the lines do not add up; a transfer account is not a transfer account.
- A transport failure logs `log.warn('books.banking', …)` and shows "The transaction could not be sent. Check your connection and try again."
- While the server cannot take writes, the submit buttons and the selection bar's Categorize are disabled (core `useServerActionState`, with its hint).
- Changing the way, or opening another transaction, while the form has typed values drops them with no question: the form is three fields, and the drawer is not a navigation.

### Categorize many rows

- With rows chosen on For review, the selection bar gains **Categorize** (outline, test id `bank-review-categorize-chosen`) after Match and before Exclude.
- It opens a core `Dialog`, title "Categorize 6 transactions", with the line "Spent $412.30 · Received $0.00" (the selection bar's sums), **Account** (required; the Categorize account picker; focus on open through `useFocusOnOpen`), **Payee** (optional), and the buttons Cancel and **Categorize** (`Dialog.ActionButton`, `DIALOG_SUBMIT_SHORTCUT`). Zod: the account is required ("Choose an account.").
- Each chosen row becomes one categorized transaction on that account with that payee and its own bank description as the memo. The rows are sent 50 at a time in parallel (the batch runner of p4-for-review, outcome `{ done, failed }`; `BatchKind` gains `categorize`).
- While the batch runs, the dialog's button shows "Categorizing…" with core `ButtonSpinner` and the bar's other actions are disabled (the page's one batch). When it ends the dialog closes.
- Result line: "Categorized 6 transactions." A refusal keeps the failed rows chosen and shows the server's message when every failure has the same one, otherwise "2 of 6 transactions could not be categorized. Try again." (the wording rules of `batchResultText`).
- The dialog has no split and no transfer: those are made one transaction at a time in the drawer.

### Reviewed tab

- In Books column (p4-match): a transaction that was added reads "Added · Journal entry 1042" or "Added · Transfer 1008", a link to the Books transaction (`entryHref`). Phone cards show the same text as their third line.
- The drawer of an added transaction shows **Added to Books** (test id `bank-added-section`): the Books transaction as a link row (type and number, date, payee, amount), then for a categorized one its lines (account label, memo when present, amount; `tabular-nums`), "Added Nov 18, 2026 by Ana Ruiz" (test id `bank-added-by`), and for writers **Undo** (`ShortcutButton` outline, key Z, test id `bank-added-undo`).
- Undo voids the Books transaction (Books posts its void reversal; the number is kept) and returns the bank transaction to For review. The drawer closes and the result line reads "Undone. Journal entry 1042 is void and the transaction is back in For review."
- A refusal of the undo (the close date; an entry that cannot be voided) keeps the drawer open and shows the server's message.
- There is no edit of an added transaction in the drawer. To change it, the user presses Undo and categorizes again, or edits the journal entry or the transfer on its own screen.

### When an added Books transaction changes elsewhere

- Voiding the journal entry or the transfer from its own screen, or editing it there (an edit voids the original and posts a correction), returns the bank transaction to For review in the same server transaction, as p4-match does for a matched one. The correction is then a match suggestion when its amount still fits, and the user matches it.
- Disconnecting the account removes its bank transactions and, with them, the records of what was added. The journal entries and transfers stay posted: they are in the books.

### Keyboard (web and iOS hardware keyboard)

Each key is registered only while its action is offered:

- C — show the Categorize way and focus its Account field (drawer open on a For review transaction, writers). With the drawer closed and rows chosen, C opens the Categorize dialog of the selection bar.
- T — show the Transfer way and focus its account field.
- ⇧M — show the Match way. (M alone stays p4-match's Match button, so a second press cannot match by accident.)
- ⌘↵ — Categorize or Record transfer, from any field of the form.
- ⌥↵ — Add a line (the first press is Split).
- ⌘⌫ — remove the split line that holds the focus.
- Z — Undo (drawer open on an added Reviewed transaction, writers).
- Esc — in a field of the form, leaves the field (the focus returns to the page, so the list keys J, K, E work again); with no field focused, closes the drawer (p4-for-review).
- Focus: when the Categorize or Transfer way shows on a transaction a writer opened, the focus goes to its account field (web); typing opens the picker (`typeToOpen`). After the pick, the focus goes to Memo. The plain letters C, T, Z and the list's keys are not registered `allowInInputs`, so in a text field they are text; ⌘↵, ⌥↵ and ⌘⌫ are.
- Tab order: Payee, Account, Memo, Split, Categorize; in a split, each line's Account, Amount, Memo (the remove button is out of the Tab order, `tabIndex={-1}`; ⌘⌫ and a press reach it), then Add a line, Categorize.
- The help topic lists the keys with Mac glyphs.

### Empty, loading, error and read-only states

- The way switch and its section appear when the transaction and the suggestions have loaded; until then core `LoadingState` (the Match section's own loading state).
- The pickers' accounts and payees: while they load, the picker shows its loading row (`SearchPicker` `isLoading`); a failed read shows the picker's "could not load" row with Retry (`loadFailed`, `onRetry` → `recoverLiveQueries`), and the submit button stays disabled.
- A book with no account to choose (every other account inactive): the picker's empty text "No account to choose. Add one in Chart of Accounts."
- Added to Books: loading → core `LoadingState`; error → "Books could not load this transaction's entry." with Retry.
- Read-only user: no way switch, no Categorize or Transfer form, no selection bar action, no Undo, no keys C, T, ⇧M, Z; the In Books text and link and the Added to Books section's facts show.

## 4. Data

### Schema (new migration `pb-migrations/2100000035_create_books_bank_categorizations.js`)

- `books_bank_categorizations` — one row for each bank transaction that was added; a writer creates it to categorize or transfer and deletes it to undo. Books 0.1.0 is unreleased, so there is no upgrade path.
  - `bank_transaction` (relation to `books_bank_transactions`, required, cascade delete, unique index).
  - `kind` (select, required: `categorize`, `transfer`).
  - `customer` (relation to `books_customers`, optional), `vendor` (relation to `books_vendors`, optional); at most one is set.
  - `memo` (text, max 4000).
  - `lines` (json, max 65536 bytes): for `categorize`, 1 to 50 objects `{ account: <id>, amount: <integer minor units, not 0>, memo: <text up to 1000> }`; for `transfer`, exactly one `{ account, amount, memo: "" }` whose amount is the bank amount without its sign.
  - Server-stamped: `connection` (relation), `entry` (relation to `books_journal_entries`), `created_by` (users), `created`, `updated`.
  - Rules: list and view `READ`; create `WRITE && unset('connection', 'entry', 'created_by')`; update none; delete `WRITE`.
  - Indexes: unique on `bank_transaction`; unique on `entry` where `entry != ''`.
- No change to `books_bank_transactions`, `books_bank_matches`, `books_bank_match_lines`, `books_journal_entries` or their rules. No new doc type, no new origin, no new number sequence.

### Server (`server/bank_categorize.go`, registered from `Register`)

- Create request hook: stamp `created_by` (`stampActor`).
- Create model hook, inside `serializedThen`:
  1. Check: read the bank transaction; stamp `connection`; refuse unless it is For review (`msgBankMatchReviewed`, `msgBankMatchExcluded`); refuse both a customer and a vendor ("Choose a customer or a vendor, not both."); parse `lines` and refuse a bad shape ("Line 2: choose an account.", "Line 2: enter an amount other than 0.", "A split holds at most 50 lines."); refuse an account that is the connection's own ("Line 1: choose an account other than 1010 Business checking."), an Accounts receivable or Accounts payable account ("Line 1: record a customer payment with Receive payment, or a bill payment with Pay bills, then match it."); refuse a sum that is not the bank amount ("The lines total $850.00. The bank transaction is $970.00."). For `transfer`: one line, and the amount is the bank amount.
  2. After the save: build the entry as a draft (`doc_type` journal or transfer, `origin` manual, date = the bank date, memo, `created_by` = the actor) and its lines in order with the payee on each (`customer` / `vendor` of `books_journal_lines`), then post it as the actor through `postDraft`, so `postEntry` runs every ledger rule (close date, balance, active accounts, `checkTransfer`, numbering, `maxStoredAmount`). Then save a `books_bank_matches` row for the bank transaction and the entry's line on the connection's account; its own hook (p4-match) writes the `books_bank_match_lines` row and moves the bank transaction to `reviewed`. Then stamp `entry` on the categorization. Any refusal rolls all of it back.
- Delete model hook (the undo), inside `serializedThen`: when the entry is still posted, void it as the actor (`status` void, `voided_by`), which runs `transitionEntry`: `unmatchEntry` deletes the match and the bank transaction returns to For review, and `voidEntry` posts the reversal. A delete that is the cascade of a removed bank transaction (a disconnect) voids nothing: the hook reads the bank transaction first and stops when it is gone.
- `transitionEntry` (server/entries.go), on a void: after `unmatchEntry`, `uncategorizeEntry(tx, entryID)` deletes the categorization row that names the entry, so a void or an edit made on the entry's own screen leaves no row behind. The delete hook above sees an entry that is already void and does nothing more.
- A request delete of a `books_bank_matches` row whose bank transaction has a categorization is refused ("This transaction was added to Books. Use Undo to void its entry."), in a delete request hook, so the entry is never left posted with no bank transaction. The model path (the void's own `unmatchEntry`) passes.
- Audit: `books_bank_categorizations` joins the audited collections (`server/audit.go`), label "<bank date> <bank description>" (`bankTransactionLabel`), type label "Bank categorization". `TestRegister_BindsEachPartOnce` gains the new part.
- OAuth: the collection joins the Books scopes map beside `books_bank_matches` (`server/oauth_scopes.go`).

### Reads (`useLiveQuery` with `{ query, queryKey }`)

- **Account options** (key `books.categorize.accounts`): `books_accounts`, active, ordered as the chart; filtered in a pure helper (`categorizeAccountOptions`: not the connection's account, not A/R, not A/P) and grouped by type. **Transfer options**: the same rows through `transferAccountOptions`.
- **Payee options**: `useLinePartyOptions(term, isOpen)` (the journal entry line's party picker read).
- **Reviewed list**: the paged query gains `materialize()` of the row's `books_bank_categorizations` row (`kind`, `entry`) for the In Books text. It is its own query shape, not a conditional spread (lesson 35).
- **Added to Books** (key `books.categorize.added`): the categorization by `bank_transaction` (`findOne`) with `materialize()` of its entry, the entry's lines with their accounts, the customer or vendor, and the `created_by` name — one query, with `loadFailed` / `retryLoad` as a Books dialog read (memory p2-tax-rates).

### Writes

- Categorize / Record transfer: one pbtsdb `insert` into `books_bank_categorizations` (`{ id: newRecordId(), bank_transaction, kind, customer, vendor, memo, lines }`) through `useMutation`. It is one row; Go writes every other row in the hook's transaction, so the client keeps no multi-row order. The bank transaction's status is not written by the client: the row leaves For review when the server's update arrives by realtime, so the button shows its busy text until the insert settles (memory p4-for-review).
- Categorize many: one insert for each chosen row, 50 in parallel per step, outcome `{ done, failed }` (`useReviewBatch` gains the kind `categorize`).
- Undo: one pbtsdb `delete` of the categorization row.
- Money: amounts are integer minor units from `moneyInputCents` (the shared rounding helper); the form does no arithmetic on dollars. An amount above `maxLineAmount` (`lib/money-text.ts`) is refused in the zod schema with the transfer form's text (`TRANSFER_ERRORS`, `lib/transfer.ts`).

### Form (zod, `useForm` + `zodResolver` from `@tinycld/core/ui/form`)

- `categorizeSchema(bankAmount, currency)` in `lib/bank-categorize.ts`: `payee` (option id or ''), `memo` (max 4000), `lines` (`useFieldArray`, 1 to 50: `account` required "Choose an account.", `amount` text that reads as money and is not 0, `memo` max 1000), and a `.superRefine()` that puts "The lines must add up to $970.00." on the form root when they do not. `bankTransferSchema`: `account` required ("Choose the other account."), `memo` (max 4000). `batchCategorizeSchema`: `account` required, `payee`.
- Server refusals go through `handleMutationErrorsWithForm`; a message that starts "Line n:" is mapped to that line's field by a pure helper (`categorizeRefusalField`), as `transferRefusalField` does.
- The submit buttons read their enabled state from the schema's result (`formState.isValid`, mode `onChange`), not from a hand-made boolean.

### Client modules

- `lib/bank-categorize.ts`: `CATEGORIZE_MAX_LINES`, `TxnWay`, `defaultWay(suggestionCount)`, `categorizeAccountOptions(accounts, connectionAccountId)`, `categorizeSchema`, `bankTransferSchema`, `batchCategorizeSchema`, `splitTotals(bankAmount, lines)` (split, remaining), `categorizeLines(values, bankAmount)` (the `lines` json), `transferLine(bankAmount, accountId)`, `transferSummaryText(amount, accountLabel, currency)`, `addedText(kind, entry)` ("Added · Journal entry 1042"), `addedResultText(entry)`, `categorizeResultText(outcome)`, `undoAddedText(entry)`, `categorizeRefusalField(message)`, `nextTxnId(rows, id)`.
- `hooks/useBankCategorize.ts` (the drawer's Categorize and Transfer forms: options, form, totals, the insert, the refusal), `hooks/useBankAdded.ts` (the Added to Books section and Undo), `hooks/useCategorizeChosen.ts` (the dialog and the batch).
- `stores/banking-ui-store.ts` gains `txnWay` ('categorize' | 'match' | 'transfer' | null), `isAdding` (the hold-the-form flag) and `openNextTxn(rows)`; `openTxn`, `closeTxn` and `closeAll` reset them; `BankingDialog` gains `categorize-chosen`.
- `lib/review-shortcuts.ts` gains the batch key C (`categorize`, offered to a writer on For review with rows chosen and the drawer closed, while no batch runs and the server takes writes). The drawer's C, T, ⇧M, Z and the form keys come from `ShortcutButton`s and `useRegisterShortcuts` in the drawer's scope (`list` with the page's owner for the inline drawer, the layer's `modal` scope for the overlay drawer and the sheet, as p4-match found).
- Components in `components/banking/categorize/`: `TxnWaySwitch`, `CategorizeSection`, `CategorizeLineCard`, `SplitTotals`, `TransferSection`, `AddedToBooks`, `CategorizeChosenDialog`, `PayeePicker`, `CategorizeAccountPicker`. `BankingScreenView` passes `TxnWaySwitch` and the chosen section to `BankTxnDrawer` as `children` (the Match section moves under the switch); `ReviewSelectionBar` gains the Categorize action; `ReviewTable` / `ReviewCards` draw `addedText` in the In Books cell.
- `hooks/useReviewDrawer.ts` and `hooks/useBankMatch.ts`: after Exclude and after Match, the drawer opens the next row (`openNextTxn`) in place of `closeTxn`.

### Shared files

`server/register.go`, `server/registrations_test.go`, `server/audit.go`, `server/oauth_scopes.go`, `server/entries.go`, `tinycld/books/collections.ts`, `tinycld/books/types.ts` and `tinycld/books/seed.ts` are also edited by units of other lanes. This unit's edits there are additions only (one registration, one test entry, one audited collection, one scope row, one call in the void branch, the new collection, the seed lines).

### Fixture and seed

- `lib/bank-categorize-fixture.ts` (scratch route data, typed with `satisfies` against the generated record types once the migration exists; accounts named by `seed.ts` ACCOUNTS numbers, lesson 17): on 1000 Business Checking, For review rows with no suggestion (Spent and Received), one with one suggestion, a Received row for a three-line split with a negative line, a row for a transfer to the card account; Reviewed rows added as a journal entry (one line and a split) and as a transfer; a 70-character description; an account with a long name; a vendor with a long name.
- `seed.ts`: the seeded review statement (`REVIEW_SEED_STATEMENT`) gains one Spent line that the seed then categorizes as superuser through a `books_bank_categorizations` create (the same Go hook), so the Reviewed tab and the help screenshots show an added row. The plan first lists every spec that counts the seeded For review rows (`for-review.spec.ts` asserts 4 rows under one search) and every report spec that reads the month and the account of the new entry (lessons 1, 33), and picks the line's memo, month and account so none of them changes.

### Help

- New topic `help/bank-categorize.md` ("Categorize a bank transaction", tags banking, categorize, split, transfer, review): the three ways and when to use each; categorize with an account and a payee; split, with the negative line example; record as a transfer, credit card payments included, and the match on the other account; what Books posts and where to find it; categorize many rows; Undo and what a void does; the close date; who can do what; the keys. `bank-review.md`, `bank-match.md` and `banking.md` link to it. Images through `help/screenshots.ts`. `tests/help-bank-categorize.test.ts` as the other help tests.

### Tests the plan must carry

- Vitest: `defaultWay`, `categorizeAccountOptions`, `categorizeSchema` (one line, split equal, short, over, a negative line, 0, 51 lines, an amount above the limit), `splitTotals`, `categorizeLines`, `transferLine`, `addedText`, the result texts, `categorizeRefusalField`, `nextTxnId` (middle, last, only row), the key map additions, the fixture.
- Go: the create hook (each refusal above; the posted entry's lines, sides, payee, memo, date and number for Spent and Received, for a split with a negative line, for a transfer in each direction; the match row and the reviewed move; the stamped fields; a reader refused by the rule; two concurrent creates for one bank transaction: one wins; a closed date refused and nothing written), the delete hook (void, reversal, back to For review; the close date refusal), a void and an edit of the entry from the entries path (the row is gone, the transaction is For review), the refused request delete of the match, disconnect (rows gone, entries stay posted), the audit and OAuth registrations.
- E2E in four files, `tests/e2e/bank-categorize.spec.ts`, `bank-categorize-split.spec.ts`, `bank-categorize-transfer.spec.ts` and `bank-categorize-batch.spec.ts`, with shared steps in `tests/e2e/bank-categorize-helpers.ts`; titles prefixed `bank-categorize:`; each test imports its own small OFX file through the UI with a per-run memo and amount, dated in a month no report spec's empty-state test reads, and finds its rows with the search:
  - A row with no suggestion opens on Categorize with the focus in Account; pick an account and a payee, ⌘↵; the result line names the entry; the row is on Reviewed with "Added · Journal entry n"; the link opens the entry with the two lines and the payee.
  - Split a Received row into three lines with a negative one; the totals line and the disabled button while short; Categorize; the entry has four lines.
  - Record a transfer to the card account; the transfer opens in the transfer screen.
  - A row with a suggestion opens on Match; ⇧M, C and T change the way.
  - After Categorize the drawer shows the next row; after the last row it closes. Match and Exclude do the same.
  - Categorize three chosen rows from the selection bar's dialog.
  - Undo returns the row to For review and the entry is void.
  - Void the entry on its own screen: the bank transaction is back in For review.
  - A refusal (`route.fulfill({ status: 400 })` on the create) keeps the drawer on the transaction with the message.
  - Read-only user: no switch, no form, the In Books link.
  - Phone (390×844, navigate wide then resize): the sheet with the way switch, a split of two lines, Categorize.
  - The specs of p4-for-review and p4-match that assert the drawer closes after Exclude or Match are changed to the new rule in the same checkpoint that changes it.

## 5. Cut

- Client or project and Billable — projects and job costing are "Later" in the Books scope.
- Tags — no tag store exists in Books; classes and locations are "Later".
- A receipt or other attachment on the categorized transaction — attachments are on bills and expenses (Books scope); a journal entry has none.
- A proposed category in the row, and bank rules — v1.1 ("bank rules").
- "Record as credit card payment" as a fourth way — it is a transfer to or from a credit card account.
- Sales tax on a categorized amount — tax is entered on sales documents; a bank line posts its whole amount to the chosen accounts.
- A date or amount field in the form — both are the bank's; to post another date, enter the transaction in Books and match it.
- Categorizing to Accounts receivable or Accounts payable — record the payment (Receive payment, Pay bills) and match it.
- Creating an Expense, a Bank Deposit or a Sales Receipt document from the bank transaction — a categorized transaction is a journal entry; the user who wants the document enters it and matches it.
- Adding a new account, customer or vendor from inside the picker.
- Split or transfer for many chosen rows.
- An edit of an added transaction inside the drawer — Undo and categorize again.
- A percent split.

## 6. Platform notes

- None new. Keys run on web and with an iOS hardware keyboard, and every action has a visible button; first-field focus and type-to-open pickers are web only (standing approvals, 2026-11-11). The drawer, the pickers, the split cards, the dialog and the mutations run on web and native.

## 7. Sparks carried

- The ways to handle a transaction are one line of choices directly above the form: core `SetupTabs` with three values over one mounted section.
- The bank's own text stays in view while the user decides: the drawer's fact rows stay above the form, and Memo starts as the bank description.
- No core design-system extension.

## 8. Non-goals

- No new endpoint: a categorization is a collection row with a Go hook, as a match and an import are.
- No new document type, number sequence, entry origin or route: the posted transaction is a journal entry or a transfer.
- No change to the For review table's columns or widths, to the suggestion rule, or to the Match section's own behavior other than where the drawer goes after a match.
- No change to the `books_bank_transactions` update rule: a client still cannot set `reviewed`.
- No change to Exclude other than where the drawer goes after it.
- No 1099, sales tax or cash-basis rule of its own: the posted journal entry follows the rules every journal entry follows.

## Engine reach (self-review 5)

- Way switch: core `SetupTabs` (`tabs`, `value`, `onChange`, `testID`), as `BankingTabs` uses it.
- Pickers: Books `SearchPicker` (`options` with `group` and `indent`, `noneOption`, `isLoading`, `loadFailed`, `onRetry`, `emptyText`, `autoFocus`, `typeToOpen`) with `useSearchPicker`; account options from `filteredAccountOptions` (`lib/account-options.ts`); payee options from `linePartyOptions` / `useLinePartyOptions`.
- Form and inline refusals: `useForm`, `useFieldArray`, `useController`, `zodResolver` (all exported by `@tinycld/core/ui/form`); core `TextInput` draws its own field error; the root error (the sum) is a text under the totals line; server refusals through `handleMutationErrorsWithForm` (`@tinycld/core/lib/errors`).
- Amount field: the money text field of `components/MoneyInput.tsx` is bound to the opening-balances form (`Control<OpeningFormValues>`); the plan extracts its input part for a `useController` of this form, with `moneyInputCents` / `moneyInputText` (`lib/money-input.ts`).
- Buttons and keys: core `ShortcutButton` (`shortcut: { keys, scope }`, `scopeOwner`, `serverAction`, `variant`); `$mod+Enter`, `Alt+Enter` and `$mod+Backspace` are modified keys, which core matches in the capture phase before a focused text field; `Dialog.ActionButton` with `DIALOG_SUBMIT_SHORTCUT` in the dialog; the batch key through `useRegisterShortcuts` in `lib/review-shortcuts.ts`.
- Dialog focus: Books `hooks/useFocusOnOpen.ts`.
- Write of the categorization: one pbtsdb insert of one row; every other row is written by Go in the hook's transaction (`serializedThen`; a nested save joins the transaction, as `postDocument` does).
- Posting: `postDraft` → the entries update hook → `postEntry`; the match through a model save of `books_bank_matches`, whose hook is p4-match's; the void through a model save of the entry (`transitionEntry`).
- Server availability: core `useServerActionState`. Recovery: core `recoverLiveQueries` with Books `mergeRecoveries`.
