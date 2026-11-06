# Bank connection by file — design

Status: approved at the design gate 2026-11-05 (auto-helix unit p4-bank-connection): direction C; open questions 1–17 as recommended; the drag-and-drop `[platform]` item signed off. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, … hash dedupe"; "Later: … live bank feeds"), §Interface (sidebar "Banking"), §Ledger rules, §Risks ("A bank-import spec uploads a fixture file through the UI"). Built against books `books/p3-transfer`@52f9ebd, core main@5355b5fa.

## 1. Goal

A bookkeeper connects a Books bank or credit card account to Banking and uploads the statement files exported from the bank's website, so the import units that follow can turn those files into transactions to review.

## 2. Where it lives

- Route `books/banking` (`screens/banking/index.tsx`). The selected account is the query param `?account=<connectionId>`; without it, or with an id that is not a connection, the page selects the first connection in chart order (account number, then name).
- Sidebar entry "Banking" (lucide `Landmark`), first in the top group, above "Lists" (the Books spec orders the sidebar Dashboard, Banking, Sales, Expenses, Reports, …; there is no Dashboard yet). It is shown to every Books user who can read.
- No + New action and no Lists hub card. The phone New button (`NewFab`) stays on the page; the page bottom takes `useFabClearanceStyle()` so the last file row is not under it.

## 3. Behavior

### Words

- A **connection** is a Books account (Bank or Credit card type) that is set up to receive bank files. "Connect" and "Disconnect" are the user-facing verbs. Books has no live bank feed; every connection is by file.
- A **bank file** is one statement file the user exported from the bank and uploaded to one connection.

### The page with no connection

- Title "Banking", a help icon (`HelpIcon topic="books:banking"`), and the introduction band:
  - "Bring in your bank transactions by file"
  - Three numbered steps: "1 Connect a bank or credit card account from your chart of accounts." "2 Sign in to your bank's website and export a statement as CSV, OFX, QFX or QBO." "3 Upload the file here. Books keeps it until you import its transactions."
  - A core `Button` "Connect account" (writers only).
- A read-only user sees the same band without the button and the line "No bank accounts are connected yet. A bookkeeper or an admin can connect one."

### The page with connections

- Header: title "Banking", help icon, and "Connect account" (writers only; on a phone an icon button with the label "Connect account" for screen readers).
- **Account strip**: one card per connection, in chart order. A card shows the account name with its number ("1000 Business Checking"), its type ("Bank" / "Credit card"), "In Books" and the account's own posted balance (`ownBalance`, normal side positive, so a card owing $3,410.17 reads $3,410.17; `text-danger` below zero), the bank name and last four digits when set ("First Community Bank ••4821"), and "2 files waiting" (or "No files waiting"). Pressing a card selects it (`router.setParams({ account })`); the selected card has a `border-primary` border and `accessibilityState={{ selected: true }}`. On wide the cards wrap in rows; on a phone the strip scrolls sideways (cards 240 wide) and the selected card scrolls into view.
- **Account panel** under the strip, for the selected connection:
  - Heading: the account name with number, a "Bank details" line (bank name and ••last4, or "No bank details" in `text-muted-foreground`), and a More menu (writers only; items render only while open, lesson 8): "Edit bank details", "View register" (opens the account register `books/accounts/<accountId>`), "Disconnect". Readers get "View register" as a plain link instead of the menu.
  - **Upload area** (writers only): a dashed `rounded-xl border border-dashed border-border p-8` block with lucide `Upload`, the sentence "Drag the file you exported from your bank here, or choose it" on web and "Choose the file you exported from your bank" on native, a core `Button` "Choose file", and the rule line "One CSV, OFX, QFX or QBO file at a time, up to 5 MB." On web it is wrapped in core `DropZone` (overlay label "Drop the bank file here").
  - **Files list**, newest upload first: each row shows the file name (one line, ellipsis), a format chip ("CSV" / "OFX"), the size ("48 KB", "1.2 MB"), "Uploaded Nov 3, 2026 by Ana Ruiz", and the status "Waiting to import". A writer gets a "Remove" button on a row whose status is `uploaded`. On wide the rows are a table (Name, Format, Size, Uploaded, Status, actions); on a phone each file is a card with the name on the first line and the rest under it.
  - With no files: "No files uploaded yet. Upload the statement you exported from your bank." (readers: "No files uploaded yet.").
- The account panel does not list transactions. The import units add those to this panel later.

### Connect account

- "Connect account" opens a core `Dialog` (a sheet on a phone) titled "Connect a bank account", with:
  - **Account** — core `SelectInput` over active accounts of type Bank or Credit card that are not connected yet, in chart order, indented by depth (`filteredAccountOptions` with the bank predicate, `indent`). Each option is "1010 Business Savings".
  - **Bank name** — core `TextInput`, optional, at most 100 characters, hint "As it appears on your statement".
  - **Last 4 digits** — core `TextInput`, optional, `keyboardType="number-pad"`, exactly four digits when given. Hint "Helps you tell accounts at the same bank apart".
  - Buttons: Cancel, Connect.
- When no account can be connected (every Bank and Credit card account is connected, or none exists), the dialog shows "Every bank and credit card account is already connected." or "Your chart of accounts has no bank or credit card account." and a link "Open Chart of Accounts" (`books/accounts`) instead of the Account picker; Connect is disabled.
- Validation is one zod schema (`connectionSchema`) through `zodResolver`:
  - Account empty: "Choose the account to connect".
  - Bank name over 100 characters: "A bank name can have at most 100 characters".
  - Last 4 digits not four digits: "Enter the last 4 digits, or leave this blank".
- Connect inserts the connection through `useMutation` (pbtsdb `insert`). On success the dialog closes and the page selects the new connection (`?account=<id>`), whose panel shows the upload area. A server refusal shows in the dialog's `FormErrorSummary` (`rootErrorOnly`, enabled once submitted).

### Edit bank details

- "Edit bank details" opens the same dialog titled "Bank details for 1000 Business Checking" with Bank name and Last 4 digits only (the account cannot change; to use another account, disconnect and connect it). Buttons Cancel, Save. Same schema minus Account; update through `useMutation`.

### Upload a file

- "Choose file" calls core `usePickFiles().pickFiles({ sources: ['documents'], multiple: false })` (web: file input; native: document picker). No type filter is passed to the picker; the file is checked after it is chosen. On web a drop on the area is the same as a pick.
- The chosen file is checked with one zod schema (`bankFileSchema`) over its name and size; the first issue shows under the upload area in `text-danger` with `accessibilityRole="alert"`:
  - Not ending in .csv, .ofx, .qfx or .qbo (any case): "Choose a CSV, OFX, QFX or QBO file".
  - Size 0: "This file is empty".
  - Over 5 MB (5,242,880 bytes): "Choose a file of 5 MB or less".
  - A drop of two or more files: "Drop one file at a time".
- A valid file uploads at once: `uploadRecordWithFile({ collection: 'books_bank_files', fields: { id: newRecordId(), connection }, file, fileField: 'file' })`, then `acceptServerRow(filesCollection, row, 'books.banking.upload')` so the row shows before the realtime echo. While it uploads, the area shows "Uploading oct-2026.csv…" with an activity indicator, its button is disabled, and the drop zone is disabled.
- After success the file is the first row of the list and the area shows "oct-2026.csv uploaded." for this panel until the next pick.
- A server refusal shows under the area as the server wrote it, with its final period (see Server rules). A transport failure shows "The file could not be uploaded. Check your connection and try again." and logs `log.warn('books.banking', …)`. The user picks the file again to retry.
- While the server cannot take writes (read-only mode), "Choose file", Connect, Save, Remove and Disconnect are disabled (core `useServerActionState`), and a drop is ignored.

### Remove a file

- "Remove" opens a core `Dialog` "Remove oct-2026.csv?" with the line "The uploaded file is deleted. Nothing in your books changes." and buttons Cancel, "Remove file". It deletes the row through `useMutation` (pbtsdb `delete`). The server allows it only while the file's status is `uploaded`.

### Disconnect

- "Disconnect" opens a core `Dialog` "Disconnect 1000 Business Checking?" with "Its 2 files waiting to import are deleted. The account, its balance and its journal entries stay in Books." (with no files: "The account, its balance and its journal entries stay in Books.") and buttons Cancel, "Disconnect". It deletes the connection through `useMutation`; PocketBase deletes its files (cascade). The page then evicts those file rows (`evictRows`) and selects the first remaining connection, or shows the no-connection page.
- The server refuses a disconnect while any file of the connection has a status other than `uploaded` (no file reaches another status in this unit; the import units set it): "1000 Business Checking has imported transactions, so it cannot be disconnected."

### Elsewhere in Books

- Chart of Accounts: deleting, making inactive, or changing the type of a connected account is refused by the server with a message that names Banking (see Server rules). The existing account panel and delete dialog already show server refusals; no client change.
- No change to registers, journal entries, reports or search.

### States

- Loading: the page shows `LoadingState` until access, settings and the connections query are ready. After that the header and the account strip stay on screen; while the selected connection's files query is not ready (first load, or after a card press), only the account panel shows `LoadingState` (decided by the human 2026-11-05, so a card press does not flash the whole page).
- Error: "Books could not load your bank accounts." with Retry, which calls `recoverLiveQueries` once over the failed queries (merged recoveries, as the reports and transfer screens do).
- A user with no Books access never reaches the page (the shell hides Books).
- Access: Books write access (bookkeeper or admin) connects, edits bank details, uploads, removes files and disconnects. A read-only user sees the strip, the panel and the files, with no upload area, no Remove, no More menu and no Connect.

### Focus and keyboard

- "Wide" means core `useBreakpoint()` is not `'mobile'`.
- Connect account opens with Account focused (core `SelectInput` `autoFocus`) on web when wide; on a phone and on native nothing is focused.
- Edit bank details opens with Bank name focused when wide, so a phone's soft keyboard does not cover the sheet.
- In the Connect and Edit bank details dialogs, ⌘↵ submits (Connect / Save) from any field (`allowInInputs`), and Esc cancels through the layer stack.
- In the Remove file and Disconnect dialogs, ⌘↵ confirms and Esc cancels.
- Page keys, active only while no dialog is open: `n` opens Connect account, `u` opens Choose file for the selected connection. Each key is registered only while its action is offered (Books write access and the server takes writes; `u` also needs a selected connection), so the ⇧? list shows only keys that work.
- The `books:banking` help topic lists every key with Mac glyphs.

## 4. Data

### New collections — migration `2100000008_create_books_banking.js`

(2100000007 is taken by p2-tax-rates' sales-tax migration in the other lane; Books is unreleased, so later banking units edit this file in place.)

`books_bank_connections`

| field | type | notes |
|---|---|---|
| `account` | relation → `books_accounts`, required, maxSelect 1, cascadeDelete false | unique index `(account)` |
| `institution` | text, max 100 | "Bank name"; optional |
| `account_mask` | text, max 4, pattern `^(\d{4})?$` | "Last 4 digits"; optional |
| `created_by` | relation → users | stamped from the request's auth user |
| `created`, `updated` | autodate | |

Rules: list/view `READ`; create `WRITE && created_by unset`; update `WRITE && account unset && created_by unset`; delete `WRITE`.

`books_bank_files`

| field | type | notes |
|---|---|---|
| `connection` | relation → `books_bank_connections`, required, maxSelect 1, cascadeDelete true | |
| `file` | file, required, maxSelect 1, maxSize 5242880, `protected: true` | no mimeTypes list (CSV and OFX sniff as text/plain); Go checks the content |
| `name` | text, max 255 | stamped from the upload's original name |
| `format` | select `csv`, `ofx`, required | stamped from the content |
| `size` | number, onlyInt, min 0 | stamped from the upload; the quota size field |
| `content_hash` | text, max 64, required | sha256 hex of the bytes, stamped; unique index `(content_hash)` |
| `status` | select `uploaded`, `imported`, `failed`, required | stamped `uploaded` on create; this unit never changes it |
| `uploaded_by` | relation → users | stamped from the request's auth user |
| `created`, `updated` | autodate | |
| index | `(connection, created)` | the files list order |

Rules: list/view `READ`; create `WRITE && name, format, size, content_hash, status, uploaded_by unset`; update `null` (no client update in this unit); delete `WRITE && status = "uploaded"`.

### Server rules (Go, `books/server/banking.go`, guards run inside `serialized`)

- Connection create: the account must exist, be active and be of type `bank` or `credit_card` — "Only an active bank or credit card account can be connected."; it must not be connected yet — "1010 Business Savings is already connected." (checked before the unique index, so the refusal has a message).
- Connection delete: refused when any of its files has `status != 'uploaded'` (message above).
- File create (`OnRecordCreateRequest`, before PocketBase validation, so every refusal is a top-level message that `uploadRecordWithFile` keeps):
  - no file or an empty file — "This file is empty."
  - extension not in `bankFileExtensions` (`.csv`, `.ofx`, `.qfx`, `.qbo`, case-insensitive) — "Choose a CSV, OFX, QFX or QBO file."
  - over 5 MB — "Choose a file of 5 MB or less."
  - content sniff (`sniffBankFile`, first 4 KB): contains `OFXHEADER` or `<OFX>` (case-insensitive) → `ofx`; else no NUL byte and a first non-blank line with a comma, semicolon or tab → `csv`; else — "This does not look like a CSV or OFX bank file."
  - the connection does not exist — "The bank account connection does not exist."
  - a file with the same `content_hash` exists anywhere in Books — "oct-2026.csv was already uploaded to 1000 Business Checking on Nov 3, 2026." (the stored file's name, account and upload day).
  - Then it stamps `name`, `format`, `size`, `content_hash`, `status = uploaded`, `uploaded_by`.
- Account guards (`checkAccountChange`, `checkAccountDelete` in `server/accounts.go`), for an account with a connection:
  - type change — "1000 Business Checking is connected to Banking, so its type cannot change. Disconnect it first."
  - made inactive — "1000 Business Checking is connected to Banking. Disconnect it before making it inactive."
  - delete — "1000 Business Checking is connected to Banking. Disconnect it before deleting it."
- The bank account types are one list in Go (`bankAccountTypes`) and one in TS (`BANK_ACCOUNT_TYPES`, `lib/bank-connections.ts`), drift-tested by `tests/bank-connections.test.ts` against the Go source, as the transfer types are.

### Registrations

- Quota: `books_bank_files` in `quotaSources()` with `SizeField: "size"` and no `OwnerField` (the files are the company's records, so they count only toward the organization total).
- Audit: `books_bank_connections` (label: the account's "number name", e.g. "1000 Business Checking") and `books_bank_files` (label: the file name).
- OAuth: both collections read-write for `books:read` / `books:write`.
- Offboarding: nothing. Connections and files stay attributed to the anonymized user, as ledger rows do.
- Search: nothing.

### Client reads (`useLiveQuery`, explicit query keys)

- Connections: one query (`bankConnectionsQuery`, key `books.banking.connections`): `books_bank_connections` joined to its account (the strip sorts by account number, so a join, not `materialize`), left-joined to the account's aggregated balance totals, and left-joined to an aggregated count and latest `created` of the connection's `uploaded` files. One row per connection: `id`, `account`, `accountName`, `accountNumber`, `accountType`, `institution`, `accountMask`, `debitTotal`, `creditTotal`, `waitingCount`, `lastUploadAt`.
- Connectable accounts (dialog only): the chart (`accountsWithBalances`, key `books.banking.accounts`) filtered to active bank and credit card accounts with no connection.
- Files of the selected connection (key `books.banking.files`): `books_bank_files` where `connection = id`, ordered `created` desc, with `materialize()` of `uploaded_by` (name).
- Settings: currency (`useBooksSettings`). Access: `useBooksAccess`.

### Client writes

- Connection insert, update and delete: `useMutation` generators over the pbtsdb collection.
- File upload: `uploadRecordWithFile` (core; the sanctioned file-bytes exception), then `acceptServerRow`.
- File delete: `useMutation` (pbtsdb `delete`).
- `collections.ts` registers both collections `onDemand`; `books_bank_connections` with relations `account`, `created_by`; `books_bank_files` with `connection`, `uploaded_by`; server-stamped fields in `omitOnInsert`.

### Seed and fixture

- `lib/bank-connection-fixture.ts`: typed against the generated `BooksBankConnections` / `BooksBankFiles` (`satisfies`); connections for `1000 Business Checking` (First Community Bank, 4821) and `2100 Company Card` (Northwind Card Services, 0937); four files on checking (CSV and OFX, a 60-character name that must truncate, one 1.2 MB size), none on the card; the CSV and OFX sample texts (six rows each, dated after mid-2026).
- `seed.ts`: connects 1000 Business Checking (with one uploaded CSV file, `checking-2026-09.csv`, from the fixture text, through a superuser multipart create so the Go hook stamps it) and 2100 Company Card (no files). 1010 Business Savings stays unconnected for the e2e spec.

### Help

`books/help/banking.md` — "To bring your bank transactions into Books, connect the account and upload the file your bank exports." Steps (Banking → Connect account; export from the bank's website; Choose file or drag it in on the web), formats and the 5 MB limit, duplicate files, removing a file, disconnecting, the keyboard shortcuts (⌘↵, Esc, `n`, `u`), and what the import units add next (worded as present behavior only). Cross-linked from `account-register.md` and `chart-of-accounts.md`. `tests/help-banking.test.ts` as the other help tests. Help screenshots per the Books help-screenshot script.

### Tests the plan must carry

- Go: every refusal above; the stamps; the cascade on disconnect; the duplicate-hash race (two creates inside `serialized`); the account guards; `registrations_test.go` (quota, audit, oauth).
- Vitest: `bankFileSchema`, `connectionSchema`, the drift test, `bankConnectionsQuery` against real local collections (the accounts harness).
- E2E (`tests/e2e/banking.spec.ts`, desktop): connect 1010 Business Savings, upload the fixture CSV through the file chooser (`page.waitForEvent('filechooser')`, since core's picker clicks a dynamic input), see it listed, upload it again and see the duplicate refusal, try a `.pdf` and see the type message, remove the file, disconnect, and end with 1010 unconnected. Keyboard: `n` opens Connect with Account focused, ⌘↵ submits from the Bank name field, Esc closes a dialog, `u` opens the file chooser, ⌘↵ confirms Remove; a read-only user's ⇧? list shows no `n`/`u`. Phone (390×844) run: the strip scrolls and selects, the panel and the file cards render, the dialog opens as a sheet (navigate at the default viewport, then resize).

## 5. Cut

- Automatic import from a linked bank ("Find your bank", bank logos, "Recommended") — live bank feeds are "Later" in the Books spec.
- "See how it works" video — Books help topics replace it.
- Tabs App transactions, Rules, Tags, Receipts — rules are v1.1; the others are not Books features.
- TXT files — the spec says CSV/OFX; a bank's TXT export is usually CSV and can be renamed.
- Several files in one upload — one file per upload keeps each refusal tied to its file.
- An "Upload transactions" action that uploads before an account is chosen — every file belongs to a connection; the account is chosen by selecting its card.
- Creating a new Books account inside the connect dialog — the Chart of Accounts owns account creation, and the starter chart already has checking, savings and a credit card.
- Downloading or opening an uploaded file — the import units read it on the server; nobody needs it back in this unit.
- An upload progress bar — files are at most 5 MB.
- A statement ("bank") balance on the card — it comes from the file, which this unit does not parse; the parser unit adds it.
- A "Connected" mark in the Chart of Accounts.
- Connecting account types other than Bank and Credit card.

## 6. Platform notes

- `[platform]` Dragging a file onto the upload area works on web only: core `DropZone` renders its children only on native. The "Choose file" button (document picker on native, file input on web) does the same on both. Signed off by the human at the design gate 2026-11-05 (as the Chart of Accounts import was on 2026-10-22).
- Account autofocus in Connect is web only (core `SelectInput` focus is a no-op on iOS/Android), the same rule p3-transfer's forms follow.
- Everything else is the same on web and native: core `usePickFiles` and `uploadRecordWithFile` cover both. `keyboardType="number-pad"` on Last 4 digits applies on native only; web accepts the same text.

## 7. Sparks carried

- Three short numbered steps explain the flow: numerals `text-2xl font-semibold text-muted-foreground tabular-nums`, lines `text-base text-foreground`, in a `rounded-xl border border-border bg-surface-secondary p-6` band; the action is a core `Button`.
- The drop area is large and plainly the place the file goes: core `DropZone` around a `rounded-xl border border-dashed border-border p-8 items-center gap-3` block with lucide `Upload` (`useThemeColor('muted-foreground')`) and a core `Button` "Choose file".
- Dropped: "automatic import is Recommended, with bank logos" (no live feeds; no third-party brand imagery).
- No core extension.

## 8. Non-goals

- No parsing of the file's rows, no bank transactions, no row dedupe, no column mapping — `p4-bank-import-parser` and `p4-import-mapping`.
- No For review / Reviewed / Excluded tabs — `p4-for-review` (they belong in the account panel).
- No reconciliation, no statement balance.
- No change to posting, registers, reports or search.
- No new endpoint: every write is a PocketBase collection write.

## 9. Contracts for later units

- `books_bank_files.status`: `uploaded` (this unit), `imported` and `failed` (set by Go in the import units). Remove and Disconnect depend on it, so an import unit that sets `imported` makes the file and its connection permanent.
- `books_bank_files.format` (`csv` | `ofx`) and `content_hash` are what the parser reads; the stored file is `protected`, so the parser reads it from the app's filesystem in Go, not by URL.
- The account panel (`BankAccountPanel`) is where the import and review units add their content, under the upload area.
- `BankFileDrop` + `useBankFileUpload(connectionId)` are the upload step `p4-import-mapping` reuses; that unit starts from a stored file, so its "which account" step reads the file's connection.
