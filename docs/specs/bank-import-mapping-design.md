# Bank import with mapping — design

Status: approved at the design gate 2026-11-06 (auto-helix unit p4-import-mapping): direction A (stepped page); open questions 1–12 as recommended; no `[platform]` items. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, … hash dedupe"; "in-app help for every feature"). Builds on `books/docs/specs/bank-connection-design.md` (p4-bank-connection, merged) and the parser contract in `books/docs/plans/2026-11-06-bank-import-parser.md` §Contracts for later units (p4-bank-import-parser, PR tinycld/books#31, merged). Built against books `books/p4-bank-import-parser`@51e0b47, core main@aa16a67.

## 1. Goal

A bookkeeper turns one uploaded bank file into bank transactions of its Books account: for a CSV file they tell Books how the file is laid out and which column is which, then they choose the rows to import; an OFX file goes straight to choosing rows.

## 2. Where it lives

- New route `books/banking/import/[id]` (`screens/banking/import/[id].tsx`), `id` = a `books_bank_files` id. It is pushed from the Banking page and has no sidebar entry.
- Entry points on the Banking page (`BankAccountPanel`, p4-bank-connection):
  - an "Import" button on each file row (writers only);
  - an "Import transactions" button beside the "oct-2026.csv uploaded." line after an upload;
  - the page key `i`.
- The Banking account card (`BankAccountCard`) gains the statement balance line (§3 Statement balance).
- The back link and every "Back to Banking" return with `router.dismissTo(orgHref('books/banking?account=<connectionId>'))` (lesson: a back link to a hub uses `dismissTo`), so the file's account stays selected.

## 3. Behavior

### Words

- An **import** is one run of "Import" on one file: the chosen rows of that file become bank transactions of the file's account. A file can be imported more than once (the rest of its rows later); a row is never added twice.
- A **row** is one transaction line of the file as Books reads it with the mapping. Books counts lines from 1 as written in the file (the parser's `line`), so a message names the line the person can find in the file.

### The import page

- Header: a back link "Banking", the title "Import bank transactions", a help icon (`HelpIcon topic="books:bank-import"`), and two lines:
  - "File: checking-2026-10.csv" with its format chip ("CSV" / "OFX", Banking's `FormatChip`);
  - "Into: 1000 Business Checking" and, when set, the bank details ("First Community Bank ••4821") in `text-muted-foreground`.
- The account is the file's connection's account and cannot change here: every file belongs to the connection it was uploaded to (p4-bank-connection), and files have no update rule. To import into another account, upload the file to that account's card.
- Steps (`ImportSteps`, generalized from the Chart of Accounts import): CSV "Upload · Map columns · Choose transactions"; OFX "Upload · Choose transactions". Upload is always reached (the file exists); the current step is bold with `aria-current="step"`.

### Step: Map columns (CSV only)

- Intro line: "Books matched your file's columns. Check each one before you continue." When the mapping came from an earlier import: "Books used the columns of your last import to 1000 Business Checking. Check each one before you continue."
- **Your file** — a sample table of the file's first 6 rows exactly as written: a "Line" column, then one column per file column headed "Column 1", "Column 2", …; when "first row is a header" is Yes, the first row is drawn bold as the header. Cells are one line with ellipsis, columns at least 120 wide; the table scrolls sideways when it is wider than the screen (phone and wide).
- **About your file** (section heading), three questions, each a core `SelectInput` whose label is the question:
  - "Is the first row a header?" — Yes / No (`header_row`).
  - "How many columns show amounts?" — "One column" / "Two columns: money in and money out" (`amount_columns` `one` / `two`).
  - "What date format does your file use?" — the five `BANK_DATE_FORMATS`, each with an example built from the file's first date cell when it parses in that format, else a fixed example: "MM/DD/YYYY (09/30/2026)", "DD/MM/YYYY (30/09/2026)", "YYYY-MM-DD (2026-09-30)", "MM/DD/YY (09/30/26)", "DD/MM/YY (30/09/26)".
- **Match the columns** (section heading), one `SelectInput` per Books field; options "Column 1: Date" (the header text when the first row is a header, otherwise the first body cell, cut to 30 characters; a blank cell gives "Column 1"):
  - Date, Description;
  - one amount column: Amount, and "Positive amounts are" — "Money in" / "Money out" (`amount_sign` `in_positive` / `out_positive`);
  - two amount columns: Money in, Money out.
  - Memo, Transaction ID and Check number are not mapped for a CSV file (Cut).
- **First rows as Books reads them** — under the selects, the first 3 body rows mapped with the current choices (`previewBankRows`): date as "Sep 30, 2026", description, amount as money ("-$86.47"), or the row's error in `text-danger`. It updates as the person changes a select, so a wrong date format shows at once. While the mapping is not complete (`bankImportSchema(columns)` fails on anything but `lines`), it shows "Books shows your first rows here once every question above has an answer." in `text-muted-foreground` instead of rows, so a missing answer is never quoted as a row error ("… is not a date in the  format."). (Added in phase 3 pass 2.)
- Buttons: "Cancel" (outline; back to Banking) and "Continue". Continue validates the mapping with the parser's `bankImportSchema(columns)` (the `lines` part is checked on the next step); a field error shows under its select (core `SelectInput` draws it) and in `FormErrorSummary` (`showFieldNames={false}`, enabled once Continue was pressed). The texts are the parser's `BANK_IMPORT_ERRORS` and `noColumnText`.

#### How the first mapping is chosen

1. When the account has an earlier import of a CSV file, and every column that import names is a column of this file, its mapping is used (header row, amount columns, date format, columns, sign).
2. Otherwise Books guesses, per field, and leaves a field "not chosen" (placeholder "Choose a column") when it cannot:
   - Header: Yes when no cell of the first row reads as a date in any format and no cell reads as an amount; otherwise No.
   - Columns by header text, case and punctuation ignored, the first match from the left: Date — "date", "posted", "posting date", "transaction date", "trans date"; Description — "description", "payee", "name", "details", "transaction", "memo"; Amount — "amount"; Money in — "credit", "deposit", "deposits", "money in", "paid in"; Money out — "debit", "withdrawal", "withdrawals", "money out", "paid out". Two amount columns when both a money-in and a money-out column are found and no Amount column is.
   - With no header, the Date column is the first column whose body cells all read as dates in some format, the Amount column the first whose body cells all read as amounts, the Description column the first other column with text.
   - Date format: the first of `BANK_DATE_FORMATS` in which every non-blank cell of the date column reads; when none does, not chosen.
   - Sign: Money in (`in_positive`).

### Step: Choose transactions (CSV and OFX)

- Summary line: "38 transactions from Sep 2 to Sep 30, 2026" and, when present, "· 2 with errors · 6 already imported". The days are the first and last readable dates.
- Selection line: "36 selected · Money in $6,125.00 · Money out $1,798.47" (sums of the chosen rows, `formatMoney`, integer cents).
- **The list** (windowed with `useRowWindow`, fixed row height, so 10,000 rows scroll): one row per body row, in file order.
  - Wide: columns check box · Date · Description (memo under it in `text-muted-foreground` when the row has one; OFX only) · Amount (right, `tabular-nums`). The header row has a select-all check box labelled "Select all ready transactions" and the column headers (`ListHeaderCell`).
  - Phone: check box · a two-line block (description; "Sep 30, 2026 · Line 7" in `text-xs text-muted-foreground`) · amount right. The select-all box sits on a bar above the list with the text "Select all".
  - A **ready** row has an enabled check box (`SelectBox`, extracted from `AccountSelectBox`).
  - A row with an **error** has a disabled, empty box and shows "Line 14: \"13/45/2026\" is not a date in the MM/DD/YYYY format." in `text-danger` in place of the description line; its date and amount cells show the raw cells.
  - A row **already imported** (its line is in an earlier import of this file) has a disabled, empty box, `text-muted-foreground` text and "Already imported" in place of the amount's tone.
  - Money in amounts are plain ("$4,250.00"), money out with a minus ("-$86.47"), both `text-foreground`.
- Default: every ready row is chosen. The select-all box is checked when every ready row is chosen, empty when none is, and mixed (`accessibilityState={{ checked: 'mixed' }}`, a dash) otherwise; pressing it chooses all ready rows, or none when all are chosen.
- When any row has an error, a band above the list: "2 rows have errors and cannot be imported. Change the mapping to read them, or import the other rows." with a "Change mapping" button (CSV only; OFX: no button, "Books could not read 2 rows of this OFX file.").
- Buttons: "Back" (CSV only, to Map columns, keeping the choices; outline) or "Cancel" (OFX, to Banking), and `ServerActionButton` "Import 36 transactions" ("Import 1 transaction", "Import" when none is chosen). Pressing it with no row chosen shows "Choose at least one transaction to import." (`bankImportSchema` / `ofxImportSchema`, the `lines` error) in `FormErrorSummary`; the button is not disabled by the count (CLAUDE.md: no `canSubmit` from field values).
- Going Back and changing the mapping keeps each still-ready line chosen; a line that becomes ready for the first time is chosen; an error line is dropped from the choice.
- Nothing to choose:
  - The file has no body row (only a header, or every line blank after the header): "This file has no transactions." and "Back to Banking" (CSV: also "Change mapping", since header Yes may be wrong).
  - Every row is already imported: "Every transaction in this file is already imported." and "Back to Banking".

### Import

- "Import" inserts one `books_bank_imports` row through `useMutation` (pbtsdb `insert`, `newRecordId()`): `file`, the mapping fields (CSV; OFX sends `header_row: false` and zeros, the server applies `OFX_MAPPING`), and `lines` = the chosen line numbers in file order.
- While it runs, the button shows "Importing…" with core `ButtonSpinner`, Back/Cancel, the check boxes and the shortcuts are disabled.
- Success: the steps area is replaced by the result:
  - "Imported 36 transactions into 1000 Business Checking." (`imported`, read from the stored import row).
  - When `duplicates` > 0: "4 chosen transactions were already in Books, so they were skipped." When `imported` is 0: "Nothing new was imported: all 4 chosen transactions were already in Books."
  - Buttons: "Back to Banking" (primary) and, when ready rows of this file are still not imported, "Import more from this file" (re-opens Choose transactions with the remaining rows).
- A refusal: the server's message in `FormErrorSummary` of the current step, through `handleMutationErrorsWithForm` (field-keyed mapping errors go on their fields — on the Choose step they show in the summary; a row error such as "Line 14: …" is top-level). The choice stays. A transport failure: "The import could not be sent. Check your connection and try again." and `log.warn('books.banking', …)`.
- While the server cannot take writes, "Import" is disabled (`ServerActionButton`).

### Banking page changes

- **File rows** (table and cards): a writer gets "Import" (outline, `size="sm"`, test id `bank-file-import-<id>`) on every file, before "Remove" (which stays only for `uploaded` files). The wide actions column grows to fit both buttons. Status texts: "Waiting to import" (uploaded); "Imported: 36 transactions" (imported; the sum of `imported` over the file's imports; "Imported: 1 transaction", "Imported: no new transactions" for 0).
- **After an upload**: the line "oct-2026.csv uploaded." gains a core `Button` "Import transactions" (size `sm`) that opens the import of that file. The upload store keeps the new file's id with the `done` state.
- **Key `i`**: opens the import of the newest `uploaded` file of the selected account; registered only while there is one, the user can write and the server takes writes (the same `offered` rule as `n` and `u`).
- **Statement balance on the account card**: under the "In Books" balance, when the connection has a file with a `statement_date`:
  - "Bank statement" (`text-xs text-muted-foreground`), the amount (`text-base font-semibold tabular-nums`, `text-danger` below zero), and "as of Oct 31, 2026" (`text-xs text-muted-foreground`).
  - The file used is the connection's file with the latest `statement_date`, then the newest `created`.
  - Sign: a Bank account shows `statement_balance` as stated; a Credit card account shows it negated, so a card that owes $3,410.17 (OFX ledger balance -3410.17) reads $3,410.17, the same side as "In Books".
  - A connection with no such file (CSV only, or no file) shows no line and reserves no space (on wide, the cards of one row stretch to the tallest, as they do now).

### States of the import page

- Loading: `LoadingState` until access, the file, its connection and account, the file's contents and the file's earlier imports are ready (the prefill query too, for a CSV file).
- Error: "Books could not load this bank file." with Retry, which calls `recoverLiveQueries` once over every failed query (`mergeRecoveries`).
- Not found (no file with that id, or it was removed): "This bank file is not in Books. It may have been removed." and "Back to Banking".
- Unreadable contents (no contents row, or `bankContentRows` returns null): "Books could not read the rows of this file. Remove it and upload it again." and "Back to Banking"; `log.error('books.banking', …)`.
- Read-only user: "You need bookkeeper access to import bank transactions." and "Back to Banking". The Banking page shows readers no Import button, no "Import transactions" and no `i`.

### Focus and keyboard

- "Wide" means core `useBreakpoint()` is not `'mobile'`.
- Map columns opens with "Is the first row a header?" focused (core `SelectInput` `autoFocus`) on web when wide.
- Choose transactions opens with the select-all box focused on web when wide (Books `useFocusOnOpen`-style ref focus; a no-op on native).
- Keys (core `useRegisterShortcuts`, a `list` scope owned by the page; each registered only while its action is offered):
  - ⌘↵ — Continue (Map columns) or Import (Choose transactions), also from a focused select (`allowInInputs`).
  - Esc — Back (Choose transactions of a CSV file) or Cancel (Map columns, OFX Choose transactions, the result, the states) — "go back one". An open select menu takes Esc first (layer stack).
  - `a` — choose all ready rows, or none when all are chosen (Choose transactions).
  - Space or Enter on a focused check box toggles it (Pressable).
- Banking page: `i` (above).
- The `books:bank-import` topic lists every key with Mac glyphs; `books:banking` adds `i`.

## 4. Data

No new collection, field, migration or Go code. Everything below exists on `books/p4-bank-import-parser`.

### Reads (`useLiveQuery`, explicit query keys)

- The file (key `books.bankImport.file`): `books_bank_files` by id (`findOne`) with `materialize()` of its connection, and the connection's account through a second `materialize()` (number, name, type) — or `useRecord` for the connection and account in the header component. One query per screen.
- Contents (key `books.bankImport.contents`): `books_bank_file_contents` where `file = id`, `findOne`; `rows` parsed with `bankContentRows`, `columns` read as is.
- Earlier imports of the file (key `books.bankImport.earlier`): `books_bank_imports` where `file = id`, selecting `lines`; their union is the "already imported" set. (A line skipped as a duplicate was chosen before, so "Already imported" is true for it as well.)
- Prefill (CSV only, key `books.bankImport.lastMapping`): `books_bank_imports` inner-joined to `books_bank_files` on `file`, where the file's `connection` is this file's connection and its `format = 'csv'`, ordered `created` desc, `limit(1)` — a join, because it filters by the related row (CLAUDE.md).
- Banking file rows (extends `useBankFiles`): a left join of `books_bank_imports` grouped by `file` with `sum(imported)` (one row per file, so the join cannot duplicate a file).
- Statement balance (key `books.banking.statement`, per card): `books_bank_files` where `connection = id` and `statement_date != ''`, ordered `statement_date` desc then `created` desc, `limit(1)`, `findOne`; inside `BankAccountCard` (a row that displays its own related record reads it with its own live query).

### Writes

- `books_bank_imports` insert through `useMutation` (generator, pbtsdb `insert`). Fields: `id`, `file`, `header_row`, `date_column`, `date_format`, `description_column`, `amount_columns`, `amount_column`, `money_in_column`, `money_out_column`, `amount_sign`, `lines`. The server stamps `imported`, `duplicates`, `created_by`, writes `books_bank_transactions` and sets the file's status to `imported`. The result is read from the import row in the store after the mutation (`useRecord` on the new id), not from the mutation's return.

### Client rules (TS)

- From the parser (`lib/bank-import.ts`, unchanged): `bankContentRows`, `previewBankRows`, `mapBankRow`, `bankImportSchema(columns)`, `ofxImportSchema`, `BANK_DATE_FORMATS`, `OFX_COLUMNS`, `OFX_MAPPING`, `BANK_IMPORT_ERRORS`, `noColumnText`, `parseBankDate`, `parseBankAmount`.
- New, `lib/bank-import-guess.ts`: `guessBankMapping(rows, columns)` (§How the first mapping is chosen) and `mappingFromImport(row, columns)` (an earlier import's mapping, or null when a column is out of range).
- New, `lib/bank-import-view.ts`: `columnOptions(rows, headerRow, columns)`, `dateFormatOptions(firstDate)`, `importSummary(preview, already)`, `selectionTotals(preview, chosen)`, `keepChoice(previous, preview, already)`, `importButtonText(count)`, `importResultText(imported, duplicates, accountLabel)`, `statementBalance(file, accountType)`.
- The form: one `useForm` with `zodResolver`. Select fields hold strings (core `SelectInput` compares string values); the resolver schema converts them to numbers and pipes into `bankImportSchema(columns)` so the messages and paths are the parser's. `lines` is a form field (number[]) driven by the check boxes. The preview is computed with `useMemo` over (rows, mapping), not on every check-box press.

### Fixture and seed

- `lib/bank-import-mapping-fixture.ts`: typed with `satisfies` against `BooksBankFileContents` / `BooksBankImports`: a CSV file of 40 rows over Oct 2026 (header "Posted Date,Payee,Debit,Credit,Balance", two amount columns, a 70-character payee that must truncate, two rows with bad dates "13/45/2026" and "Pending", one row with both money in and money out); an OFX file of 12 rows with memos; one earlier import of 6 lines of the CSV; one file with only a header; and a statement for the checking connection (OFX, 2026-10-31, 1,042,317 cents) and the card (2026-10-28, -341,017 cents).
- `seed.ts`: no change needed for the import (the seeded `checking-2026-09.csv` stays `uploaded`; e2e uploads its own files). It uploads one OFX file (`BANK_OFX_SAMPLE` + a `<LEDGERBAL>` block) to 2100 Company Card so the e2e book shows a statement line; the parser stamps it.

### Help

- New topic `help/bank-import.md` ("Import bank transactions", tags banking, import, csv, ofx, mapping): start an import, the mapping questions and how Books guesses, the preview and row errors, choosing rows, what "Already imported" and "skipped" mean, importing a file in parts, the statement balance line, keyboard keys, who can import. It must say: "Import each account's statements in one format. A CSV row and an OFX row are the same transaction only when the date, the amount and the description are all the same, so importing the same month once as CSV and once as OFX can add a transaction twice." `banking.md` links to it (Upload section and the file status), adds `i`, and drops "Books keeps it until you import its transactions" in favour of the link. `tests/help-bank-import.test.ts` as the other help tests; help screenshots through `help/screenshots.ts`.

### Tests the plan must carry

- Vitest: `guessBankMapping` (headers of four bank layouts, no header, dates DD/MM vs MM/DD, nothing guessable), `mappingFromImport`, `keepChoice`, `selectionTotals`, `statementBalance` (bank and card signs), `columnOptions`, `importResultText`, the resolver schema's string → number pipe with the parser messages.
- E2E (`tests/e2e/bank-import-mapping.spec.ts`, titles prefixed `bank-import-mapping:`), on 1000 Business Checking with files whose descriptions carry a per-run unique memo (other specs and workers share the DB; dedupe is per connection):
  - CSV two-column file: upload, "Import transactions", check the guessed mapping, change the date format and see the preview change, Continue, see the bad-date row unselectable with its message, deselect one row, Import, see "Imported N transactions", back on Banking see "Imported: N transactions"; open Import again and see those lines "Already imported" and the deselected one ready; import it.
  - The same rows in a second overlapping file: Import reports them skipped.
  - OFX file: no mapping step; import.
  - No row chosen: the `lines` message.
  - Read-only user: no Import button; the route shows the access message.
  - Statement line on the 2100 Company Card card (seeded OFX).
  - Keyboard: ⌘↵ Continue and Import, Esc Back, `a`, `i` on Banking.
  - Phone (390×844): the mapping selects and the sample table scroll, the row list cards, Import (navigate at the default viewport, then resize).
  - A load error (`route.fulfill({ status: 400 })` on the contents list) shows Retry.

## 5. Cut

- Choosing or changing the account on the import page — the file belongs to the connection it was uploaded to (p4-bank-connection cut "Upload before an account is chosen"; files have no update rule).
- The step rail with check circles and the "automatic import / bank logos" panel of the inspiration — live feeds are "Later"; Books has `ImportSteps`.
- Mapping Memo, Transaction ID and Check number for CSV files — the parser's form schema maps only date, description and amounts; OFX gets them from its fixed columns.
- Previewing which rows the server will skip as duplicates of other files — the dedupe hash is server-only; the result names the count.
- Filters or search in the row list, and sorting — rows stay in file order; 10,000 rows scroll in the windowed list.
- Editing a row's text or amount before import — For review (p4-for-review) is where transactions are changed.
- Undoing an import — imports are never changed or removed (parser rules).
- A link to the imported transactions — For review does not exist yet; p4-for-review adds it.
- A difference between the statement balance and the Books balance, and reconciliation — the reconciliation unit.
- A statement balance from a CSV file — CSV files carry none (parser).

## 6. Platform notes

- None single-platform. The import route uses core `SelectInput`, `Button`, `ServerActionButton`, `FormErrorSummary`, React Native `ScrollView` / `Pressable`; the check box is a Books Pressable. Focus on open (select and select-all box) is web only, as in every Books form (SelectInput focus is a no-op on native). Keys are web only by nature (no hardware keyboard requirement on native).

## 7. Sparks carried

- One plain question per control: each format choice is a core `SelectInput` whose label is the question, in a `gap-4` stack under a `text-base font-semibold text-foreground` section heading.
- A calm checklist with aligned amounts: `SelectBox` (44 pt hit area, 20 pt box, `bg-primary border-primary` + lucide `Check` in `primary-foreground` when chosen, a dash when mixed), fixed-height rows with `border-b border-border`, amounts `text-right tabular-nums`, header cells `ListHeaderCell`.
- Dropped: the step rail with green check circles.
- No core extension.

## 8. Non-goals

- No For review / Reviewed / Excluded tabs, no categorizing, matching or excluding — p4-for-review.
- No change to the parser, the import hook, the dedupe rules or the migration.
- No posting: an import writes bank transactions only; no journal entry, register or report changes.
- No new endpoint; no new collection or field.
