# Transfer — design

Status: approved at the design gate 2026-11-04 (auto-helix unit p3-transfer): direction A; open questions 1–14 as recommended. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Purchases: … Transfer"), §Ledger rules, §Interface, §Forms. Built against books main@0377271, core main@3eb7915e.

## 1. Goal

A bookkeeper moves an amount from one balance-sheet account to another on a date, and Books posts it as one balanced, numbered, immutable record.

## 2. Where it lives

- `books/transfers/new` — new transfer. `?from=<accountId>` starts with that "From" account (from a register). `?replaces=<id>` edits a posted transfer (a correction that keeps its number).
- `books/transfers/[id]` — a draft transfer opens in the form; a posted or void transfer opens read-only. An id that is a journal entry of another type replaces itself with `books/entries/<id>`.
- Entry points: the + New menu, column "Other", item "Transfer" (after "Journal entry"); a "Transfer" button in the register header of an account a transfer may use (it opens `books/transfers/new?from=<account>`); every place that opens an entry (Journal Entries list row and menu, register entry drawer "Open", federated search) opens a transfer at `books/transfers/<id>`.
- No sidebar entry and no Lists hub entry. Transfers are listed in the Journal Entries list and in each account's register.
- Both routes are pushed pages. The phone New button (`NewFab`) is hidden on them (`hidesNewFab` gains `transfers`).

## 3. Behavior

### The form (new, draft, and edit of a posted transfer)

- The form has five fields: **From** (account), **To** (account), **Amount**, **Date**, **Memo**. Labels: "Transfer from", "Transfer to", "Amount", "Date", "Memo".
- From and To are core `SelectInput`s over the chart of accounts in chart order, indented by depth (`filteredAccountOptions`, `indent`). They offer only active accounts of these types: Bank, Other current asset, Fixed asset, Other asset, Credit card, Other current liability, Long-term liability, Equity. Accounts receivable, Accounts payable, and every income, cost of goods sold and expense type are not offered.
- A stored account that the list does not offer (it became inactive, or its type changed) shows by name in the trigger (`triggerLabel`), so an old draft or an edit shows what it holds; posting it is refused by the server with the line message (see Refusals).
- Under each picked account the form shows its current balance: "Balance $1,201.00" (`formatMoney`, `tabular-nums`, `text-muted-foreground`; a negative balance in `text-danger`). It is the account's own posted balance, the figure the Chart of Accounts shows (`accountsWithBalances` + `ownBalance`). It is not as of the transfer date and does not show the balance after the transfer. With no account picked, no balance line shows.
- Books neither warns nor blocks when the amount is more than the From balance (an overdraft or a card paid past zero is real).
- Amount is a core `TextInput` (`keyboardType="decimal-pad"` on native) parsed with `parseAmountText` (lib/entry-lines.ts) to integer cents in the books currency. On blur a valid amount is rewritten to its plain form (`formatAmountOnBlur`).
- Date is core `DateField`, default today (`todayIso()`).
- Memo is core `TextAreaInput`, at most 4000 characters (the entry `memo` limit). It is the entry memo; lines carry no memo, so the register shows the entry memo.
- The header shows the title ("New transfer" for a new form, "Draft transfer" for a saved draft, which has no number yet, and "Edit TR-3" for a correction of a posted transfer), the status badge (`EntryStatusBadge`), a help icon (`HelpIcon topic="books:transfers"`), and the amount as the largest figure on the screen (`text-2xl font-semibold`; "—" while the amount is blank or invalid; "Too large" over the limit).
- An edit of a posted transfer shows one line under the header: "Posting this replaces TR-3 under the same number. The original is voided. Until you post, TR-3 stays as it is."
- Validation is one zod schema (`transferSchema(currency)`) through `zodResolver`. Save draft and Post use the same schema, so a transfer draft is always complete:
  - From empty: "Choose the account the money comes from".
  - To empty: "Choose the account the money goes to".
  - To equal to From: "Choose two different accounts" (on To).
  - Amount not a number: "Enter an amount like 1,234.50". Zero or less: "Enter an amount more than 0". Over 10^15 cents: "The amount is too large".
  - Date not a real day: "Enter a date as YYYY-MM-DD".
  - Memo over 4000 characters: "A memo can have at most 4000 characters".
- Field errors render inline under each field (core inputs draw their own). Server refusals render in `FormErrorSummary` (`rootErrorOnly`, enabled once submitted, `keepIsSubmitted`), except the line refusals mapped below.
- The action bar is the journal entry form's bar, sticky at the bottom: Cancel, Save draft, Post, Post & new on wide; on a phone Cancel, Save draft, Post, and More (Post & new). An existing draft adds "Delete draft" to More (wide shows More too when there is a draft), which opens the existing `DeleteDraftDialog`.
- Cancel with unsaved edits opens the existing `DiscardDialog` ("Discard changes?"); without edits it leaves at once.
- After Post the screen replaces itself with `books/transfers/<id>` (the read-only view). Post & new replaces itself with a fresh `books/transfers/new`, keeping `?from` if the form was opened with one. Save draft stays on the form at `books/transfers/<id>`.
- A save runs as the journal entry save does (`useEntrySave`, with the new `docType` parameter): insert the draft entry (`doc_type: 'transfer'`, `origin: 'manual'`, `replaces` when editing), write the two lines, then set `status: 'posted'` for a post. A post refused after the draft was written leaves a complete draft and keeps the form on screen with the refusal; the next save updates that draft. The form is held through the write by a synchronous store flag set before the mutation (the opening-balances pattern), so the optimistic `posted` status does not swap the form out from under a refusal.
- Writing needs Books write access (bookkeeper or admin). Without it, `books/transfers/new` shows "You need bookkeeper access to create transfers" with a back link; the register button and the + New item do not show (the + New menu already hides for non-writers).

### Refusals from the server

- "Line 1: …" maps to the From field, "Line 2: …" to the To field (the server orders a transfer's lines From then To). They render under that field as the root error `root.from` / `root.to`, in `text-danger`.
- Every other refusal (close date, a stale number sequence, a balance-row overflow, "Books sets these fields itself") shows in the summary above the form, as written by the server, with its final period.
- A refusal that arrives after the user left the form is logged (`log.warn('books.transfer', …)`) and not shown.

### The read-only view (posted or void)

- Header: back link, "Transfer TR-3", status badge (Posted / Void), help icon, the amount as the big figure.
- Body, in the band: "From" account name with number, an arrow, "To" account name with number; Date ("Oct 21, 2026", `formatDay`); Memo (or nothing when blank). Below: "Posted by Ana Ruiz, Oct 21, 2026, 3:14 PM" (`stampText`); for a void, also "Voided by …".
- Actions for a writer on a posted transfer: **Edit** (opens `books/transfers/new?replaces=<id>`, replacing this screen) and **Void** (the existing `VoidDialog`: "A reversing entry is posted in the original period. The number is kept."). After a void the view stays and shows Void. A void transfer and a reader get no actions.
- A link "View journal entry" opens `books/entries/<id>`, which shows the two lines.
- No one-click Reverse and no auto-reverse on a transfer.

### States

- Loading: `LoadingState` until access, settings, accounts (with balances) and, for an id, the entry and its lines are ready.
- Error: one message "Books could not load this transfer." with Retry, which calls `recoverLiveQueries` once over the failed queries (merged recoveries).
- Not found (no entry with the id): "This transfer does not exist" with a back link.
- Wrong type (an entry whose `doc_type` is not `transfer`): replaces itself with `books/entries/<id>`.
- An edit (`?replaces`) of an entry that is not a posted transfer: "This transfer cannot be edited" with a back link.

### Elsewhere in Books

- Journal Entries list: a transfer row shows Type "Transfer" and its number (TR-3). Its row menu: Open (to `books/transfers/<id>`), Edit (to `books/transfers/new?replaces=<id>`), Void; no Reverse. Drafts keep Delete. The list stays the list of every entry; no type filter is added.
- Opening balance entries: the Journal Entries Edit item for an `opening_balance` entry opens the Opening balances screen in edit mode instead of the journal entry form (today the server refuses that form's post). This is the same `entryActions`/route change.
- The journal entry read-only view (`books/entries/<id>`) of a transfer shows type "Transfer"; its Edit opens the transfer form; Reverse is not offered.
- Account register: a transfer line shows type "Transfer"; the entry drawer's Open goes to `books/transfers/<id>`. The register header shows a "Transfer" button next to "New journal entry" when the account's type may be used in a transfer and the user can write.
- Federated search: a transfer hit reads "Transfer TR-3" ("Draft transfer", "Transfer TR-3 (void)") with row id `transfer:<id>`, and opens `books/transfers/<id>`.
- Settings → Numbering shows a second card, "Transfers", with its prefix and next number.
- Audit log label: "Transfer TR-3" / "Draft transfer <date>".

### Keyboard

Added at the eval gate (2026-11-05, human): "for forms like this that will be used a lot for data entry, we should: autofocus the first input; set keyboard shortcuts for the each of action buttons."

- The transfer form (new, draft, and edit of a posted transfer) focuses "Transfer from" when it opens, at every width, without opening its menu; after Post & new the fresh form focuses "Transfer from" again. On iOS and Android the trigger takes no focus (core `SelectInput` `autoFocus` does nothing there).
- The journal entry form (new, draft, and edit of a posted entry) focuses its Date field when it opens in a web browser on a wide screen. On a phone-size screen (core `useBreakpoint` is `mobile`) and on iOS and Android at every size, nothing takes focus, so the soft keyboard does not cover the form (human, 2026-11-05).
- The transfer form and the journal entry form (both draw `EntryActionBar`) have these keys: Post ⌘↵ (`$mod+Enter`), Post & new ⌘⇧↵ (`$mod+Shift+Enter`), Save draft ⌘S (`$mod+s`), Cancel Esc (`Escape`), and Delete draft ⌘⌫ (`$mod+Backspace`, a saved draft only; it opens the Delete draft dialog). They are registered with `allowInInputs`, so they also work while a text field has focus.
- The transfer read view and the journal entry read view have these keys: Edit E (`e`) and Void V (`v`, which opens the Void dialog). The journal entry read view also has Reverse R (`r`, which opens the Reverse dialog; human, 2026-11-05). Each read key is registered only while its action is offered, so core's list shows R only where Reverse is offered. They do nothing while a text field has focus.
- A key does nothing when its button is hidden, disabled or busy, or the user cannot write. While the form holds the keys, ⌘S is always taken, so the browser's own Save Page never opens.
- While a dialog or sheet is open, the screen's keys do nothing. Escape closes only the open menu, dialog or sheet. Core menus push no shortcut scope: while a menu is open, the form's keys do nothing from the menu's search field or its trigger, but a key pressed with focus on a menu row still reaches the screen.
- Each key has a description and a group, so core's keyboard shortcut list (⇧?) shows it while its screen is open.
- The help topics (transfers, journal entries) list the keys and say that the first field has focus when the form opens in a web browser.

## 4. Data

No new collection. A transfer is a `books_journal_entries` row with `doc_type = 'transfer'` and `origin = 'manual'`, and exactly two `books_journal_lines`:

| position | account | debit | credit |
|---|---|---|---|
| 0 | From | 0 | amount |
| 1 | To | amount | 0 |

Reading a transfer back takes From as the line with the credit and To as the line with the debit (not by position). A void's reversal and a correction keep `doc_type = 'transfer'` (`newReversalDraft` copies it; `voidReplaced` requires the same type and origin).

Migrations, edited in place (Books is unreleased; earlier units did the same):

- `2100000001_create_books_settings.js`: `books_doc_sequences.doc_type` values `['journal', 'transfer']`; seed row `id: booksseqtransfer`, `doc_type: transfer`, `prefix: 'TR-'`, `next_number: 1`.
- `2100000002_create_books_ledger.js`: `books_journal_entries.doc_type` values `['journal', 'transfer']`. Rules unchanged (create already takes any `doc_type`; update already pins it).

Server (Go, `books/server/`):

- New `transfers.go` with `checkTransfer(tx, entry, lines)`, called from `postEntry` after `validateLines` when `doc_type = transfer` and the entry is not a reversal (`reverses` empty). It refuses:
  - not exactly two lines: "A transfer has two lines: the account the money comes from and the account it goes to."
  - line 1 not a credit or line 2 not a debit: "Line 1: a transfer moves money out of this account, so it takes a credit." / "Line 2: a transfer moves money into this account, so it takes a debit."
  - the same account on both lines: "Line 2: choose an account other than the one the money comes from."
  - an account type not in `transferAccountTypes`: "Line n: <name> cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account."
  - `auto_reverse_on` set: "A transfer cannot reverse automatically."
- `checkNewEntry` refuses `doc_type = transfer` with `origin = opening_balance`: "An opening balance entry cannot be a transfer."
- `reversalTarget` (server/reversal.go, inside the update's `serialized` transaction) refuses the post of a reversal whose target is a transfer unless it is the void's own reversal (`origin = void_reversal`): "A transfer cannot be reversed. Void it or edit it instead." (human, 2026-11-05: "server should refuse it too"). A transfer's void and its correction still post their void reversal.
- `entryName` reads the type: "Transfer TR-3" / "This transfer". The audit label (`audit.go entryLabel`) and the search title (`entryHitTitle`) do the same; the search query adds `c.doc_type`, and a transfer hit takes id `transfer:<id>`, kind `transfer`.
- The transfer account types are one list, `server/transfer_account_types.json`, embedded by Go (`//go:embed`, as `account_types.json` is). The client list `TRANSFER_ACCOUNT_TYPES` (lib/transfer.ts) is drift-tested against that file by `tests/transfer.test.ts`, as `tests/account-types.test.ts` reads `account_types.json`.

Client reads (all `useLiveQuery` with explicit query keys):

- Accounts with balances: `accountsWithBalances(accountsCollection, balancesCollection)` (query key `books.transfer.accounts`), giving options and balances.
- Settings: currency (`useBooksSettings`).
- For an id: the entry (`useRecord`-style live query by id) with `materialize()` of `posted_by` / `voided_by` users, and its lines (`where entry = id`, ordered by position). Key `books.transfer.entry` / `books.transfer.lines`.
- Sequence for the read view number is on the entry; nothing else.

Client writes: `useEntrySave` gains a `docType` prop (default `'journal'`); the transfer submit hook maps form values to the two lines. Draft delete uses the existing delete path (`DeleteDraftDialog`); void uses `useEntryDialogs`.

Seed and fixture:

- `lib/transfer-fixture.ts`: typed against the generated `BooksJournalEntries` / `BooksJournalLines` (`satisfies`); posted, draft, void and correction transfers; a long memo; accounts named by `seed-accounts.ts` numbers.
- `lib/seed-accounts.ts` gains `1010 Business Savings` (bank, savings). `tests/expense-account-options.test.ts` lists the whole seeded chart, so its expected list gains it.
- `seed.ts` posts one transfer (Business Checking → Business Savings) dated after mid-2026 (the shared e2e DB holds close date 2026-06-30 for a few seconds).

Help: `books/help/transfers.md` ("To move money between accounts, …"), cross-linked from `journal-entries.md` and `account-register.md`; `tests/help-transfers.test.ts` like the other help tests.

## 5. Cut

- Attachments on a transfer — the spec scopes attachments to bills and expenses in v0.
- Make recurring — recurring transactions are v1.1.
- Clear button — Cancel and Post & new cover it.
- Change-history (clock) icon on the form — the audit log screen is its own unit (p5-audit-log).
- Feedback link — not a Books feature.
- Register "Add transaction" type dropdown — only Journal entry and Transfer exist yet; the register gets a plain "Transfer" button.
- Inline transfer entry in a register row — the register is read-only in v0.
- Payee on a transfer — a transfer has no party.
- A typed reference number — Books assigns the number at posting.
- A Transfers list screen — transfers appear in the Journal Entries list and the registers; a purchase list unit may add one.
- One-click Reverse and auto-reverse for a transfer — Edit and Void cover corrections.
- A warning when the amount passes the From balance.

## 6. Platform notes

Every behavior is the same on web and native, except these. `keyboardType="decimal-pad"` applies on native only, as the journal entry amount cells do; web gets the plain keyboard, which accepts the same text. The "Transfer from" focus works on web only (core `SelectInput` `autoFocus` does nothing on iOS and Android; accepted by the human). The journal entry Date takes focus in a web browser on a wide screen only, never on iOS or Android, phones or tablets, where a focused field opens the soft keyboard over the form (signed-off platform item, human, 2026-11-05). On native the keys work only on iOS with a hardware keyboard (core's iOS shortcut provider); Android has no shortcut capture (core's Android provider is a passthrough). On web the form keys also fire while a text field (amount, memo, date, a journal cell), the From trigger or a button has focus: core reads them before the focused element (core checkpoint 9, tinycld #436), and the element never sees a key a shortcut takes.

## 7. Sparks carried

- From → to with balances: two `SelectInput` rows, balance lines `text-sm text-muted-foreground tabular-nums` (`text-danger` when negative), lucide `ArrowRight` on wide and `ArrowDown` on a phone between them, colour `useThemeColor('muted-foreground')`.
- The amount is the largest figure: the header figure `text-2xl font-semibold text-foreground`, top right on wide, under the title on a phone.
- One band for what moves the money: `rounded-xl border border-border bg-surface-secondary p-4` holds From, To, Amount and Date; Memo sits below on `bg-background`.
- No core extension.

## 8. Non-goals

- No new collection, endpoint, or report source. Reports that show a Type column (p5-general-ledger, p5-journal-report) read `doc_type`; they label `transfer` themselves.
- No change to journal entry posting rules for `doc_type = journal`.
- No change to the Journal Entries list filters or columns.
- No multi-currency transfer.
- No transfer between two books or two organizations.
- No bank-feed matching of a transfer (p4 banking units may create transfers through this record shape).
