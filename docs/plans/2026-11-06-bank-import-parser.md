# Bank Import Parser and Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Books parses every uploaded CSV or OFX bank file into rows on the server, and imports the rows a person chooses as bank transactions, with no transaction imported twice.

**Architecture:** When a bank file is stored, a Go model hook parses it (CSV: every non-blank line as text cells; OFX: one row per `STMTTRN` in fixed columns, plus the statement balance) and writes one `books_bank_file_contents` row in the same transaction as the file row. The import is a collection write: the client creates a `books_bank_imports` row with the column mapping and the chosen line numbers; its Go create hook (inside `serializedThen`) maps the rows, refuses the whole import when a chosen row has an error, skips duplicates (a file line imported before, or a dedupe hash already on the connection), inserts `books_bank_transactions` rows with status `for_review`, stamps the counts, and marks the file `imported`. The date and amount rules live in Go (the authority) and in `lib/bank-import.ts` (the preview the mapping screen shows); one vector file runs on both sides.

**Tech Stack:** Go (PocketBase 0.40 fork, `encoding/csv`, `golang.org/x/text/encoding/charmap`, `html`), PocketBase JS migrations, TypeScript, zod 4 (through `@tinycld/core/ui/form`), vitest.

**Spec:** `/Users/nas/code/tinycld/docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, For review / Reviewed / Excluded tabs, … hash dedupe"), §Risks ("A bank-import spec uploads a fixture file through the UI"); master plan `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-master-plan.md` Review Focus ("Bank import of the same file twice, and of a file with bad dates: no duplicates; row-level errors shown."); the design this unit builds on, `/Users/nas/tmp/tinycld/books-reports/books/docs/specs/bank-connection-design.md` §9 "Contracts for later units". Run manifest unit `p4-bank-import-parser` (covers `CSV/OFX import`, `dedupe`); the screen that uses this unit is `p4-import-mapping` (Upload a CSV or OFX bank file, pick the Books account, map its columns, and select the rows to import). Outline: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p4-bank-import-parser/plan-outline.md`.

## HUMAN DECISION

None. No decision in this unit needs the human. The choices below follow from the spec's words and the earlier units' contracts; they are listed so the reviewer sees them.

## Behavior choices the reviewer will see

1. **Parsing happens once, on upload.** A file that cannot be parsed is refused at upload with a message (more than 10,000 rows; an OFX file with no statement or with statements for several accounts). Every stored file has its rows.
2. **An import is all or nothing.** When any chosen row has an error (a bad date, no amount), the server refuses the import with the first bad line's message and the count of the others, and imports nothing. The mapping screen shows each row's error beforehand (the TS mirror) and lets nobody choose such a row, so the refusal is a backstop.
3. **Dedupe has two layers.** (a) A line of a file is imported at most once (unique `(file, line)`). (b) Across files, a transaction's `dedupe_hash` is unique: an OFX transaction is keyed by its bank `FITID`; any other row by date, amount, description (case and spacing folded) and its occurrence number among identical rows of the same file, so two real $20.00 purchases on one day are both kept, and the same two in an overlapping statement are both skipped. All keys are scoped to the connection.
4. **A file can be imported more than once** (a person imports some rows now and the rest later); dedupe stops doubles. Every import sets the file's status to `imported`, which makes the file and its connection permanent (the p4-bank-connection contract).
5. **Amounts** are signed integer cents, money in positive. One amount column: positive is money in, unless the import says `out_positive` (card exports that list charges as positive). Two columns: money in minus money out, signs ignored. A row whose amount is 0 is a row error.
6. **Dates**: five formats (`MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YY`, `DD/MM/YY`); `/`, `-` and `.` are all accepted as separators; one-digit months and days are accepted; a time after the date is ignored; a two-digit year is 20YY; the year is at least 1900 (the Books rule of `isIsoDay`).
7. **Transactions are not audited in this unit**: only the server writes them, and the import row that made them is audited. `p4-for-review`, which lets people change them, adds them to the audit list.

## Global Constraints

- Workspace root: `/Users/nas/tmp/tinycld/books-reports`. Books is `/Users/nas/tmp/tinycld/books-reports/books` on branch `books/p4-bank-import-parser`. Core (`/Users/nas/tmp/tinycld/books-reports/tinycld`) is never edited by this plan.
- Books is unreleased (`package.json` version `0.1.0`, no tags): edit `pb-migrations/2100000008_create_books_banking.js` in place; add no new migration file.
- Money is integer minor units (cents), `|amount| <= maxAmount` (`1_000_000_000_000_000`, server/posting.go; `MAX_AMOUNT` in the ledger migration). No float arithmetic on money.
- Accounting dates are `YYYY-MM-DD` text, year >= 1900.
- Every Go guard that reads rows before a write runs inside `serialized`/`serializedThen` (server/ledger.go).
- Refusals use `refuse`, `refuseNamed` (a message that starts with text people typed) or `refuseField` (server/errors.go). Every message ends with a period (PocketBase adds one otherwise).
- No new endpoint: every write is a PocketBase collection write.
- Read files with the Read tool; edit with the Edit tool (hooks block `sed -i` and bare `cat`). In Go write a BOM as `"\xef\xbb\xbf"`.
- Commands (use exactly these; `pnpm exec` triggers a workspace install here):
  - Go: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run '<regexp>' -count=1 .`
  - one vitest file: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/vitest run tests/<file>`
  - typecheck: `cd /Users/nas/tmp/tinycld/books-reports/books && PATH=/Users/nas/tmp/tinycld/books-reports/node_modules/.bin:$PATH tinycld-pkg typecheck`
  - biome on your files: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/biome check --write <files>`
  - types after a migration edit: `cd /Users/nas/tmp/tinycld/books-reports/tinycld && pnpm run packages:generate` (regenerates the gitignored `core/types/pbSchema.ts`; never commit it). Do not run it while an e2e run is in progress.
- Commits: commit only when your prompt says so (the lane's driver commits). Commit messages name no assistant and link no session.

## Review Focus

1. **The same statement imported twice, or two overlapping statements** (Oct 1–31, then Oct 15–Nov 15): no transaction may appear twice, while two identical real purchases on one day must both be kept. Pinned in Task 7 (`TestBankImport_SameLinesTwiceAddNothing`, `TestBankImport_OverlappingStatementAddsOnlyNewRows`, `TestBankImport_KeepsIdenticalRowsOfOneFile`, `TestRace_TheSameLinesImportedTwice`) and Task 6 (`TestBankRowHashes`).
2. **A file with bad dates** (`13/45/2026`, `02/30/2026`, a word in the date column): the import must name the line and the bad text, and import nothing; choosing only the good lines must work. Pinned in Task 7 (`TestBankImport_RefusesABadDateAndImportsNothing`) and the date vectors (Task 2).
3. **The amount formats banks export** (`(5.00)`, `$1,234.56`, `-$5.00`, `5.00-`, `1.234,56`, `12,50`, blank, `12.345`): parsed to the right cents or a clear row error, and the preview (TS) must say exactly what the server will do. Pinned in Task 2 (vectors) and Task 8 (the same vectors in vitest).
4. **CSV files as banks write them**: a UTF-8 BOM, Windows-1252 accents (`Café`), semicolon or tab delimiters, quoted fields with commas, quotes and newlines, CRLF, blank and `,,,` lines, a trailing comma on every line. Pinned in Task 3 (`TestParseBankCSV_*`).
5. **OFX files as banks write them**: SGML with unclosed tags, XML with closing tags, lowercase tags, `&amp;` entities, `NAME` inside `PAYEE`, a missing `</STMTTRN>`, two accounts in one file, no statement at all. Pinned in Task 4 (`TestParseBankOFX_*`).

---

## File map

| File | Task | Purpose |
|---|---|---|
| `pb-migrations/2100000008_create_books_banking.js` | 1, 5 | three new collections; file fields `statement_balance`, `statement_date` |
| `server/oauth_scopes.go`, `server/audit.go`, `server/registrations_test.go` | 1 | registrations of the new collections |
| `server/bank_rules_test.go` (new) | 1 | rules of the new collections |
| `tinycld/books/collections.ts`, `tinycld/books/types.ts`, `tests/collections.test.ts` | 1, 5 | client registration and types |
| `server/bank_values.go` (new), `server/bank_values_test.go` (new), `server/testdata/bank_import_vectors.json` (new) | 2, 6 | date and amount rules; shared vectors |
| `server/bank_csv.go` (new), `server/bank_csv_test.go` (new) | 3 | text decoding and CSV parsing |
| `server/bank_ofx.go` (new), `server/bank_ofx_test.go` (new) | 4 | OFX parsing |
| `server/ledger.go`, `server/banking.go`, `server/bank_contents_test.go` (new), `server/banking_upload_test.go`, `tinycld/books/lib/bank-connection-fixture.ts` | 5 | the upload stores the rows and the statement |
| `server/bank_import_map.go` (new), `server/bank_import_map_test.go` (new) | 6 | mapping, row mapping, dedupe hashes (pure) |
| `server/bank_import.go` (new), `server/bank_import_test.go` (new) | 7 | the import hook |
| `tinycld/books/lib/bank-import.ts` (new), `tests/bank-import.test.ts` (new) | 8 | the TS mirror for the mapping screen |

---

### Task 1: Schema and registrations

**Files:**
- Modify: `pb-migrations/2100000008_create_books_banking.js`
- Modify: `server/oauth_scopes.go`, `server/audit.go`, `server/registrations_test.go`
- Create: `server/bank_rules_test.go`
- Modify: `tinycld/books/collections.ts`, `tinycld/books/types.ts`, `tests/collections.test.ts`

**Interfaces:**
- Consumes: `READ`, `WRITE`, `unset`, `AUTODATES`, `userRef` (already in the migration); `mustSaveBankFile`, `sha256Hex`, `bankCSV` (server/banking_upload_test.go); `newBooksApp`, `newLevelUsers`, `saveRecord`, `tokenFor`, `apiReq`, `allLevels` (server/env_test.go).
- Produces:
  - Collection `books_bank_file_contents` (id `pbc_books_bank_rows`): `file` (relation → files, required, cascadeDelete true, unique), `columns` (int ≥ 0), `rows` (json, maxSize 20971520; `[{ "line": int, "cells": string[] }]`). Rules: list/view `READ`; create/update/delete `null`.
  - Collection `books_bank_imports` (id `pbc_books_bank_imps`): `file` (relation → files, required, cascadeDelete false), `header_row` (bool), `date_column`, `description_column`, `amount_column`, `money_in_column`, `money_out_column` (int ≥ 0, 1-based, 0 = none), `date_format` (select `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YY`, `DD/MM/YY`), `amount_columns` (select `one`, `two`), `amount_sign` (select `in_positive`, `out_positive`), `lines` (json: int[]), `imported`, `duplicates` (int ≥ 0, stamped), `created_by` (stamped). Rules: list/view `READ`; create `WRITE && imported, duplicates, created_by unset`; update/delete `null`.
  - Collection `books_bank_transactions` (id `pbc_books_bank_txns`): `connection`, `file`, `bank_import` (relations, required, cascadeDelete false), `line` (int ≥ 1), `date` (`YYYY-MM-DD`, required), `description`, `memo` (text ≤ 500), `amount` (int, ±10^15), `fitid` (text ≤ 255), `check_number` (text ≤ 32), `dedupe_hash` (text ≤ 64, required, unique), `status` (select `for_review`, `reviewed`, `excluded`, required). Unique `(file, line)`; index `(connection, status, date)`. Rules: list/view `READ`; create/update/delete `null`.
  - Generated TS types `BooksBankFileContents`, `BooksBankImports`, `BooksBankTransactions`, re-exported from `tinycld/books/types.ts`; pbtsdb collections `books_bank_file_contents`, `books_bank_imports`, `books_bank_transactions` returned by `registerCollections`.
  - Go `bankImportLabel(app core.App, r *core.Record) string` (server/audit.go).
  - Test helper `newBankRulesEnv(t *testing.T) *bankRulesEnv` (server/bank_rules_test.go) with fields `app *tests.TestApp`, `users levelUsers`, `file`, `contents`, `bankImport`, `txn *core.Record` — an app with NO hooks bound.

- [ ] **Step 1: Write the failing rule tests**

Create `server/bank_rules_test.go`:

```go
package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// bankRulesEnv is a migrated app with NO hooks bound, so the requests below
// measure the collection rules alone: one user per level, a connected account,
// one stored file, its parsed rows, one import of it and one transaction.
type bankRulesEnv struct {
	app                              *tests.TestApp
	users                            levelUsers
	file, contents, bankImport, txn *core.Record
}

func newBankRulesEnv(t *testing.T) *bankRulesEnv {
	t.Helper()
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	checking := saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Business Checking", "number": "1000", "type": "bank", "detail_type": "checking", "currency": "USD",
	})
	connection := saveRecord(t, app, "books_bank_connections", map[string]any{"account": checking.Id})
	file := mustSaveBankFile(t, app, connection.Id, "oct-2026.csv", sha256Hex([]byte(bankCSV)), "uploaded")
	contents := saveRecord(t, app, "books_bank_file_contents", map[string]any{
		"file": file.Id, "columns": 3,
		"rows": []map[string]any{{"line": 1, "cells": []string{"Date", "Description", "Amount"}}},
	})
	bankImport := saveRecord(t, app, "books_bank_imports", map[string]any{"file": file.Id, "lines": []int{2}})
	txn := saveRecord(t, app, "books_bank_transactions", map[string]any{
		"connection": connection.Id, "file": file.Id, "bank_import": bankImport.Id, "line": 2,
		"date": "2026-09-02", "description": "Deposit", "amount": 425000,
		"dedupe_hash": strings.Repeat("a", 64), "status": "for_review",
	})
	return &bankRulesEnv{app: app, users: users, file: file, contents: contents, bankImport: bankImport, txn: txn}
}

func collectionURL(name string) string { return "/api/collections/" + name + "/records" }

// The parsed rows and the transactions are written by the Go hooks only, and
// an import is never changed or removed once made.
func TestBankRows_OnlyTheServerWrites(t *testing.T) {
	cases := []struct {
		name   string
		method string
		url    func(env *bankRulesEnv) string
		body   func(env *bankRulesEnv) string
	}{
		{"contents create", http.MethodPost,
			func(*bankRulesEnv) string { return collectionURL("books_bank_file_contents") },
			func(env *bankRulesEnv) string { return fmt.Sprintf(`{"file":%q,"columns":1,"rows":[]}`, env.file.Id) }},
		{"contents update", http.MethodPatch,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_file_contents") + "/" + env.contents.Id },
			func(*bankRulesEnv) string { return `{"columns":9}` }},
		{"contents delete", http.MethodDelete,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_file_contents") + "/" + env.contents.Id },
			func(*bankRulesEnv) string { return "" }},
		{"transaction create", http.MethodPost,
			func(*bankRulesEnv) string { return collectionURL("books_bank_transactions") },
			func(env *bankRulesEnv) string {
				return fmt.Sprintf(`{"connection":%q,"file":%q,"bank_import":%q,"line":3,"date":"2026-09-05","amount":-100,"dedupe_hash":"b","status":"for_review"}`,
					env.txn.GetString("connection"), env.file.Id, env.bankImport.Id)
			}},
		{"transaction update", http.MethodPatch,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_transactions") + "/" + env.txn.Id },
			func(*bankRulesEnv) string { return `{"status":"excluded"}` }},
		{"transaction delete", http.MethodDelete,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_transactions") + "/" + env.txn.Id },
			func(*bankRulesEnv) string { return "" }},
		{"import update", http.MethodPatch,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_imports") + "/" + env.bankImport.Id },
			func(*bankRulesEnv) string { return `{"lines":[3]}` }},
		{"import delete", http.MethodDelete,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_imports") + "/" + env.bankImport.Id },
			func(*bankRulesEnv) string { return "" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := newBankRulesEnv(t)
			apiReq{
				method: c.method,
				url:    c.url(env),
				token:  tokenFor(t, env.users.admin),
				body:   c.body(env),
				want:   http.StatusForbidden,
			}.run(t, env.app)
		})
	}
}

// Every Books reader reads the parsed rows, the imports and the transactions;
// a user with no Books access reads none.
func TestBankRows_ReadByBooksReaders(t *testing.T) {
	for _, name := range []string{"books_bank_file_contents", "books_bank_imports", "books_bank_transactions"} {
		for _, level := range allLevels {
			t.Run(name+"/"+string(level), func(t *testing.T) {
				env := newBankRulesEnv(t)
				want := `"totalItems":1`
				if level == LevelNone {
					want = `"totalItems":0`
				}
				apiReq{
					method:  http.MethodGet,
					url:     collectionURL(name),
					token:   tokenFor(t, env.users.byLevel(level)),
					want:    http.StatusOK,
					content: []string{want},
				}.run(t, env.app)
			})
		}
	}
}

// A writer creates an import; the counts and the importer are the server's.
func TestBankImports_CreateRule(t *testing.T) {
	body := func(env *bankRulesEnv, extra string) string {
		return fmt.Sprintf(`{"file":%q,"lines":[2]%s}`, env.file.Id, extra)
	}
	t.Run("a writer imports", func(t *testing.T) {
		env := newBankRulesEnv(t)
		apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
			token: tokenFor(t, env.users.bookkeeper), body: body(env, ""), want: http.StatusOK}.run(t, env.app)
	})
	t.Run("a reader cannot", func(t *testing.T) {
		env := newBankRulesEnv(t)
		apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
			token: tokenFor(t, env.users.readOnly), body: body(env, ""), want: http.StatusBadRequest}.run(t, env.app)
	})
	for _, field := range []string{"imported", "duplicates", "created_by"} {
		t.Run("client sends "+field, func(t *testing.T) {
			env := newBankRulesEnv(t)
			value := `3`
			if field == "created_by" {
				value = fmt.Sprintf("%q", env.users.admin.Id)
			}
			apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
				token: tokenFor(t, env.users.bookkeeper), body: body(env, `,"`+field+`":`+value),
				want: http.StatusBadRequest}.run(t, env.app)
		})
	}
}
```

- [ ] **Step 2: Add the registration tests**

In `server/registrations_test.go`:

Replace line 24 (`var serverOnly = map[string]bool{"books_account_balances": true}`) with:

```go
// serverOnly are the collections only Go writes. The balance rows are derived
// from the ledger; a bank file's parsed rows and its transactions are written
// by the upload and import hooks, and the import row that made them is audited.
var serverOnly = map[string]bool{
	"books_account_balances":   true,
	"books_bank_file_contents": true,
	"books_bank_transactions":  true,
}
```

In `TestOAuth_BankCollectionsAreReadWrite`, change the list to `[]string{"books_bank_connections", "books_bank_files", "books_bank_imports"}` and its comment's first sentence to "A token that records transactions also connects bank accounts, uploads their statement files and imports them." Add after it:

```go
// A file's parsed rows and its transactions are written only by the server,
// so a token reads them and never writes them.
func TestOAuth_BankRowsAreReadOnly(t *testing.T) {
	collections := oauthPackage().Collections
	for _, c := range []string{"books_bank_file_contents", "books_bank_transactions"} {
		got, ok := collections[c]
		if !ok {
			t.Errorf("%s has no OAuth entry", c)
			continue
		}
		if !reflect.DeepEqual(got.Read, []string{scopeRead}) || len(got.Write) != 0 {
			t.Errorf("%s OAuth access = %+v, want read-only %s", c, got, scopeRead)
		}
	}
}

// An import row holds only a file id, so its audit row names the file.
func TestAudit_LabelsABankImportByItsFile(t *testing.T) {
	env := newBankRulesEnv(t)
	imports, ok := auditedCollections(env.app)["books_bank_imports"]
	if !ok {
		t.Fatal("books_bank_imports is not audited")
	}
	if got, want := imports.ExtractLabel(env.bankImport), "oct-2026.csv"; got != want {
		t.Errorf("import label = %q, want %q", got, want)
	}
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBankRows_|TestBankImports_CreateRule|TestOAuth_|TestAudit_' -count=1 .`
Expected: FAIL — `find books_bank_file_contents: … no rows` (the collections do not exist) and missing OAuth/audit entries.

- [ ] **Step 4: Add the collections to the migration**

In `pb-migrations/2100000008_create_books_banking.js`:

1. Extend the header comment: after the FILES paragraph add

```js
//
// IMPORT. A stored file's rows are parsed once, by the Go upload hook, into one
// books_bank_file_contents row (text cells per line; an OFX file in fixed
// columns). A person imports chosen lines by creating a books_bank_imports row
// with the column mapping; its Go hook (server/bank_import.go) maps the rows,
// skips duplicates, writes books_bank_transactions and sets the file to
// `imported`. Only Go writes the parsed rows and the transactions, so they have
// no client write rules; an import is never changed or removed. A file line is
// imported once (unique file, line) and a transaction once per connection
// (unique dedupe_hash).
```

2. Add below `const unset = …`:

```js
const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
// The ledger migration's MAX_AMOUNT: money is integer minor units.
const MAX_AMOUNT = 1000000000000000
// server/bank_values.go bankDateFormats; TestBankDateFormats_MatchTheSchema
// fails when the two drift.
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YY', 'DD/MM/YY']
const column = name => ({ name, type: 'number', onlyInt: true, min: 0 })
const relation = (name, collectionId, cascadeDelete) => ({
    name,
    type: 'relation',
    required: true,
    collectionId,
    cascadeDelete,
    maxSelect: 1,
})
```

3. Replace the inline `app.save(new Collection({ id: 'pbc_books_bank_files', … }))` with `const files = new Collection({ id: 'pbc_books_bank_files', … })` (same object, unchanged) followed by `app.save(files)`, then add:

```js
        app.save(
            new Collection({
                id: 'pbc_books_bank_rows',
                name: 'books_bank_file_contents',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('file', files.id, true),
                    column('columns'),
                    // Up to 10,000 rows of a 5 MB file; server/banking.go refuses a
                    // file whose rows encode larger than this before it saves.
                    { name: 'rows', type: 'json', maxSize: 20971520 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_file_contents_file ON books_bank_file_contents (file)',
                ],
            })
        )
        const imports = new Collection({
            id: 'pbc_books_bank_imps',
            name: 'books_bank_imports',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && ${unset('imported', 'duplicates', 'created_by')}`,
            updateRule: null,
            deleteRule: null,
            fields: [
                relation('file', files.id, false),
                { name: 'header_row', type: 'bool' },
                // Columns are 1-based; 0 is "not chosen".
                column('date_column'),
                { name: 'date_format', type: 'select', maxSelect: 1, values: DATE_FORMATS },
                column('description_column'),
                { name: 'amount_columns', type: 'select', maxSelect: 1, values: ['one', 'two'] },
                column('amount_column'),
                column('money_in_column'),
                column('money_out_column'),
                { name: 'amount_sign', type: 'select', maxSelect: 1, values: ['in_positive', 'out_positive'] },
                // The chosen file line numbers.
                { name: 'lines', type: 'json', maxSize: 1048576 },
                column('imported'),
                column('duplicates'),
                userRef('created_by'),
                ...AUTODATES,
            ],
            indexes: ['CREATE INDEX idx_books_bank_imports_file ON books_bank_imports (file, created)'],
        })
        app.save(imports)
        app.save(
            new Collection({
                id: 'pbc_books_bank_txns',
                name: 'books_bank_transactions',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('connection', connections.id, false),
                    relation('file', files.id, false),
                    relation('bank_import', imports.id, false),
                    { name: 'line', type: 'number', onlyInt: true, min: 1 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'description', type: 'text', max: 500 },
                    { name: 'memo', type: 'text', max: 500 },
                    // Signed minor units: money in is positive.
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'fitid', type: 'text', max: 255 },
                    { name: 'check_number', type: 'text', max: 32 },
                    { name: 'dedupe_hash', type: 'text', required: true, max: 64 },
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['for_review', 'reviewed', 'excluded'],
                    },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_transactions_hash ON books_bank_transactions (dedupe_hash)',
                    'CREATE UNIQUE INDEX idx_books_bank_transactions_line ON books_bank_transactions (file, line)',
                    'CREATE INDEX idx_books_bank_transactions_review ON books_bank_transactions (connection, status, date)',
                ],
            })
        )
```

4. Replace the down function body with:

```js
        for (const name of [
            'books_bank_transactions',
            'books_bank_imports',
            'books_bank_file_contents',
            'books_bank_files',
            'books_bank_connections',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
```

- [ ] **Step 5: Register OAuth and audit**

In `server/oauth_scopes.go`, add to `Collections` (after `"books_bank_files": rw,`):

```go
			"books_bank_imports":       rw,
			"books_bank_file_contents": ro,
			"books_bank_transactions":  ro,
```

and change the doc comment's sentence "and the bank connections and their files are read-write." to "the bank connections, their files and the imports of those files are read-write; a file's parsed rows and the bank transactions, which only the server writes, are read-only." (gofmt aligns the map.)

In `server/audit.go`, add to `auditedCollections` after `"books_bank_files": …`:

```go
		"books_bank_imports": {
			ExtractLabel: func(r *core.Record) string { return bankImportLabel(app, r) },
		},
```

change the comment "and a bank connection by its account." to "a bank connection by its account, and a bank import by its file.", "four labels" to "five labels", and add at the end of the file:

```go
// bankImportLabel names an import by the file it read. A file that cannot be
// read gives "", so the audit row is still written.
func bankImportLabel(app core.App, r *core.Record) string {
	file, err := app.FindRecordById("books_bank_files", r.GetString("file"))
	if err != nil {
		return ""
	}
	return file.GetString("name")
}
```

- [ ] **Step 6: Run the Go tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBankRows_|TestBankImports_CreateRule|TestOAuth_|TestAudit_|TestBank' -count=1 .`
Expected: PASS (the existing banking tests too).

- [ ] **Step 7: Regenerate the types and register the client collections**

Run: `cd /Users/nas/tmp/tinycld/books-reports/tinycld && pnpm run packages:generate`
Expected: `core/types/pbSchema.ts` now has `BooksBankFileContents`, `BooksBankImports`, `BooksBankTransactions`.

In `tinycld/books/types.ts` add `BooksBankFileContents,`, `BooksBankImports,`, `BooksBankTransactions,` after `BooksBankFiles,` (alphabetical).

In `tinycld/books/collections.ts`, after `books_bank_files`:

```ts
    // One row per stored file, written by the server's upload hook: the file's rows
    // as text cells, which the import mapping screen reads. Nothing inserts it here.
    const books_bank_file_contents = newCollection('books_bank_file_contents', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { file: books_bank_files },
        collectionOptions: indexed,
    })

    // One import of chosen lines of a file. The server stamps the counts and who
    // imported, and writes the transactions.
    const books_bank_imports = newCollection('books_bank_imports', {
        omitOnInsert: ['created', 'updated', 'imported', 'duplicates', 'created_by'] as const,
        ...onDemand,
        relations: { file: books_bank_files, created_by: coreStores.users },
        collectionOptions: indexed,
    })

    // Written only by the server's import.
    const books_bank_transactions = newCollection('books_bank_transactions', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: {
            connection: books_bank_connections,
            file: books_bank_files,
            bank_import: books_bank_imports,
        },
        collectionOptions: indexed,
    })
```

and add `books_bank_file_contents,`, `books_bank_imports,`, `books_bank_transactions,` to the returned object after `books_bank_files,`.

In `tests/collections.test.ts`: add the three names to `NAMES` after `'books_bank_files'`; in `declares the relations Banking reads` add

```ts
        expect(calls.get('books_bank_file_contents')?.relations).toEqual({
            file: { name: 'books_bank_files' },
        })
        expect(calls.get('books_bank_imports')?.relations).toEqual({
            file: { name: 'books_bank_files' },
            created_by: { name: 'users' },
        })
        expect(calls.get('books_bank_transactions')?.relations).toEqual({
            connection: { name: 'books_bank_connections' },
            file: { name: 'books_bank_files' },
            bank_import: { name: 'books_bank_imports' },
        })
```

and in `never inserts a banking column the server stamps` add

```ts
        expect(calls.get('books_bank_imports')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'imported',
            'duplicates',
            'created_by',
        ])
```

- [ ] **Step 8: Run vitest, typecheck and biome**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/vitest run tests/collections.test.ts tests/collections-real.test.ts`
Expected: PASS.
Run the typecheck command (Global Constraints). Expected: no errors.
Run biome on `tinycld/books/collections.ts tinycld/books/types.ts tests/collections.test.ts`. Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add pb-migrations/2100000008_create_books_banking.js server/oauth_scopes.go server/audit.go server/registrations_test.go server/bank_rules_test.go tinycld/books/collections.ts tinycld/books/types.ts tests/collections.test.ts && git commit -m "feat(books): bank import collections"
```

---

### Task 2: Date and amount values (Go)

**Files:**
- Create: `server/bank_values.go`
- Create: `server/bank_values_test.go`
- Create: `server/testdata/bank_import_vectors.json`

**Interfaces:**
- Consumes: `maxAmount` (server/posting.go); `newBooksApp` (tests).
- Produces:
  - `var bankDateFormats = []string{"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YY"}`
  - `func parseBankDate(text, format string) (string, error)` — `YYYY-MM-DD` or an error whose `Error()` is the row message.
  - `func parseBankAmount(text string) (int64, error)` — signed cents (0 for `"0.00"`), or an error whose `Error()` is the row message.
  - `func quoteBankText(s string) string` — `"…"` with at most 40 runes, then `…`.
  - Messages `msgBankNoDate`, `msgBankNotDate`, `msgBankNoAmount`, `msgBankNotAmount`, `msgBankAmountDecimals`, `msgBankAmountTooLarge`.
  - `server/testdata/bank_import_vectors.json` with sections `dates` and `amounts` (Task 6 adds `ofxMapping` and `rows`; Task 8 runs all of them in vitest).

- [ ] **Step 1: Write the vectors**

Create `server/testdata/bank_import_vectors.json`:

```json
{
    "dates": [
        { "text": "09/02/2026", "format": "MM/DD/YYYY", "date": "2026-09-02" },
        { "text": "9/2/2026", "format": "MM/DD/YYYY", "date": "2026-09-02" },
        { "text": "09-02-2026", "format": "MM/DD/YYYY", "date": "2026-09-02" },
        { "text": "09/02/2026 12:00 AM", "format": "MM/DD/YYYY", "date": "2026-09-02" },
        { "text": "02/09/2026", "format": "DD/MM/YYYY", "date": "2026-09-02" },
        { "text": "02.09.2026", "format": "DD/MM/YYYY", "date": "2026-09-02" },
        { "text": "2026-09-02", "format": "YYYY-MM-DD", "date": "2026-09-02" },
        { "text": "2026-9-2", "format": "YYYY-MM-DD", "date": "2026-09-02" },
        { "text": "2026-09-02T00:00:00Z", "format": "YYYY-MM-DD", "date": "2026-09-02" },
        { "text": "2026/09/02", "format": "YYYY-MM-DD", "date": "2026-09-02" },
        { "text": "09/02/26", "format": "MM/DD/YY", "date": "2026-09-02" },
        { "text": "02/09/26", "format": "DD/MM/YY", "date": "2026-09-02" },
        { "text": "02/29/2028", "format": "MM/DD/YYYY", "date": "2028-02-29" },
        { "text": "  09/02/2026  ", "format": "MM/DD/YYYY", "date": "2026-09-02" },
        { "text": "", "format": "MM/DD/YYYY", "error": "There is no date." },
        { "text": "   ", "format": "MM/DD/YYYY", "error": "There is no date." },
        { "text": "13/45/2026", "format": "MM/DD/YYYY", "error": "\"13/45/2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "02/30/2026", "format": "MM/DD/YYYY", "error": "\"02/30/2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "02/29/2026", "format": "MM/DD/YYYY", "error": "\"02/29/2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "09/02/26", "format": "MM/DD/YYYY", "error": "\"09/02/26\" is not a date in the MM/DD/YYYY format." },
        { "text": "09/02/2026", "format": "MM/DD/YY", "error": "\"09/02/2026\" is not a date in the MM/DD/YY format." },
        { "text": "2026-09-02", "format": "MM/DD/YYYY", "error": "\"2026-09-02\" is not a date in the MM/DD/YYYY format." },
        { "text": "09//02/2026", "format": "MM/DD/YYYY", "error": "\"09//02/2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "001/02/2026", "format": "MM/DD/YYYY", "error": "\"001/02/2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "01/01/1899", "format": "MM/DD/YYYY", "error": "\"01/01/1899\" is not a date in the MM/DD/YYYY format." },
        { "text": "Sept 2, 2026", "format": "MM/DD/YYYY", "error": "\"Sept 2, 2026\" is not a date in the MM/DD/YYYY format." },
        { "text": "09/02/2026", "format": "YYYY/DD/MM", "error": "\"09/02/2026\" is not a date in the YYYY/DD/MM format." },
        { "text": "This is a very long text that is not a date at all", "format": "YYYY-MM-DD", "error": "\"This is a very long text that is not a d…\" is not a date in the YYYY-MM-DD format." }
    ],
    "amounts": [
        { "text": "4250.00", "cents": 425000 },
        { "text": "-86.47", "cents": -8647 },
        { "text": "+12.5", "cents": 1250 },
        { "text": "1,234.56", "cents": 123456 },
        { "text": "$1,234.56", "cents": 123456 },
        { "text": "-$5.00", "cents": -500 },
        { "text": "$-5.00", "cents": -500 },
        { "text": "(5.00)", "cents": -500 },
        { "text": "($1,200.00)", "cents": -120000 },
        { "text": "5.00-", "cents": -500 },
        { "text": "1.234,56", "cents": 123456 },
        { "text": "1 234,56", "cents": 123456 },
        { "text": "12,50", "cents": 1250 },
        { "text": "12,345", "cents": 1234500 },
        { "text": "1.234.567", "cents": 123456700 },
        { "text": "1,234,567.89", "cents": 123456789 },
        { "text": "€ 12,00", "cents": 1200 },
        { "text": ".50", "cents": 50 },
        { "text": "5.", "cents": 500 },
        { "text": "0", "cents": 0 },
        { "text": "-0.00", "cents": 0 },
        { "text": "10000000000000.00", "cents": 1000000000000000 },
        { "text": "", "error": "There is no amount." },
        { "text": "  ", "error": "There is no amount." },
        { "text": "abc", "error": "\"abc\" is not an amount." },
        { "text": "5 USD", "error": "\"5 USD\" is not an amount." },
        { "text": "--5", "error": "\"--5\" is not an amount." },
        { "text": ",", "error": "\",\" is not an amount." },
        { "text": "1,23,456", "error": "\"1,23,456\" is not an amount." },
        { "text": "1.2.3,4", "error": "\"1.2.3,4\" is not an amount." },
        { "text": "1,234.56.78", "error": "\"1,234.56.78\" is not an amount." },
        { "text": "12.345", "error": "\"12.345\" has more than 2 decimals." },
        { "text": "1,234.567", "error": "\"1,234.567\" has more than 2 decimals." },
        { "text": "10000000000000.01", "error": "\"10000000000000.01\" is too large for Books." },
        { "text": "99999999999999999999", "error": "\"99999999999999999999\" is too large for Books." }
    ]
}
```

- [ ] **Step 2: Write the failing Go test**

Create `server/bank_values_test.go`:

```go
package books

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// bankVectors is the shape of testdata/bank_import_vectors.json, which
// tests/bank-import.test.ts also runs, so the import preview and the server
// read a bank file's values the same way.
type bankVectors struct {
	Dates []struct {
		Text   string `json:"text"`
		Format string `json:"format"`
		Date   string `json:"date"`
		Error  string `json:"error"`
	} `json:"dates"`
	Amounts []struct {
		Text  string `json:"text"`
		Cents *int64 `json:"cents"`
		Error string `json:"error"`
	} `json:"amounts"`
}

func loadBankVectors(t *testing.T) bankVectors {
	t.Helper()
	src, err := os.ReadFile("testdata/bank_import_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v bankVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestParseBankDate_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Dates) == 0 {
		t.Fatal("no date vectors")
	}
	for _, c := range v.Dates {
		got, err := parseBankDate(c.Text, c.Format)
		if c.Error != "" {
			if err == nil || err.Error() != c.Error {
				t.Errorf("parseBankDate(%q, %q) = %q, %v; want error %q", c.Text, c.Format, got, err, c.Error)
			}
			continue
		}
		if err != nil || got != c.Date {
			t.Errorf("parseBankDate(%q, %q) = %q, %v; want %q", c.Text, c.Format, got, err, c.Date)
		}
	}
}

func TestParseBankAmount_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Amounts) == 0 {
		t.Fatal("no amount vectors")
	}
	for _, c := range v.Amounts {
		got, err := parseBankAmount(c.Text)
		if c.Error != "" {
			if err == nil || err.Error() != c.Error {
				t.Errorf("parseBankAmount(%q) = %d, %v; want error %q", c.Text, got, err, c.Error)
			}
			continue
		}
		if c.Cents == nil {
			t.Fatalf("vector %q has neither cents nor error", c.Text)
		}
		if err != nil || got != *c.Cents {
			t.Errorf("parseBankAmount(%q) = %d, %v; want %d", c.Text, got, err, *c.Cents)
		}
	}
}

// The import row's date_format select offers exactly the formats Go reads.
func TestBankDateFormats_MatchTheSchema(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_bank_imports")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("date_format").(*core.SelectField)
	if !ok {
		t.Fatal("books_bank_imports.date_format is not a select field")
	}
	if !slices.Equal(field.Values, bankDateFormats) {
		t.Errorf("date_format values = %v, want bankDateFormats %v", field.Values, bankDateFormats)
	}
}
```

Task 6 adds the `ofxMapping` and `rows` fields to `bankVectors`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankDate_Vectors|TestParseBankAmount_Vectors|TestBankDateFormats_MatchTheSchema' -count=1 .`
Expected: FAIL — `undefined: parseBankDate`, `undefined: parseBankAmount`, `undefined: bankDateFormats`.

- [ ] **Step 4: Write `server/bank_values.go`**

```go
// The values of a bank file's row: its date and its amount. The import
// preview (tinycld/books/lib/bank-import.ts) reads them the same way, and
// testdata/bank_import_vectors.json is run by both sides so they cannot drift.

package books

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// bankDateFormats are the date layouts an import can name. Each accepts "/",
// "-" and "." between its parts and one-digit months and days; a two-digit
// year is 20YY. The books_bank_imports date_format select lists the same
// values (TestBankDateFormats_MatchTheSchema).
var bankDateFormats = []string{"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YY"}

const (
	msgBankNoDate         = "There is no date."
	msgBankNotDate        = "%s is not a date in the %s format."
	msgBankNoAmount       = "There is no amount."
	msgBankNotAmount      = "%s is not an amount."
	msgBankAmountDecimals = "%s has more than 2 decimals."
	msgBankAmountTooLarge = "%s is too large for Books."

	// quotedBankRunes is how much of a cell a message repeats.
	quotedBankRunes = 40
	// bankAmountSpaces are the spaces banks put inside an amount: the space,
	// the tab, and the no-break spaces of French and German formatting.
	bankAmountSpaces = " \t\u00a0\u202f"
	// bankCurrencySigns are dropped from an amount; Books keeps one currency.
	bankCurrencySigns = "$€£¥"
)

// quoteBankText repeats a cell in a message, cut to quotedBankRunes runes.
func quoteBankText(s string) string {
	r := []rune(s)
	if len(r) > quotedBankRunes {
		s = string(r[:quotedBankRunes]) + "…"
	}
	return `"` + s + `"`
}

// parseBankDate reads text as a day in format and returns it as YYYY-MM-DD.
// Only the first word counts, so a time after the date is ignored; for
// YYYY-MM-DD an ISO time after a "T" is too.
func parseBankDate(text, format string) (string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", errors.New(msgBankNoDate)
	}
	bad := fmt.Errorf(msgBankNotDate, quoteBankText(text), format)
	token := strings.Fields(text)[0]
	if format == "YYYY-MM-DD" {
		token, _, _ = strings.Cut(token, "T")
	}
	parts := splitBankDate(token)
	if len(parts) != 3 {
		return "", bad
	}
	var ys, ms, ds string
	switch format {
	case "MM/DD/YYYY", "MM/DD/YY":
		ms, ds, ys = parts[0], parts[1], parts[2]
	case "DD/MM/YYYY", "DD/MM/YY":
		ds, ms, ys = parts[0], parts[1], parts[2]
	case "YYYY-MM-DD":
		ys, ms, ds = parts[0], parts[1], parts[2]
	default:
		return "", bad
	}
	yearDigits := 4
	if strings.HasSuffix(format, "/YY") {
		yearDigits = 2
	}
	if len(ys) != yearDigits || !isASCIIDigits(ys) || !isDayPart(ms) || !isDayPart(ds) {
		return "", bad
	}
	year, _ := strconv.Atoi(ys)
	month, _ := strconv.Atoi(ms)
	day, _ := strconv.Atoi(ds)
	if yearDigits == 2 {
		year += 2000
	}
	if year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) {
		return "", bad
	}
	return fmt.Sprintf("%04d-%02d-%02d", year, month, day), nil
}

// splitBankDate cuts a date at every "/", "-" or ".", keeping empty parts, so
// "09//02/2026" has four parts and is refused.
func splitBankDate(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '/' || s[i] == '-' || s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	return append(parts, s[start:])
}

func isASCIIDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func isDayPart(s string) bool { return len(s) >= 1 && len(s) <= 2 && isASCIIDigits(s) }

func daysInMonth(year, month int) int {
	return time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// parseBankAmount reads an amount as banks write it and returns signed minor
// units. A leading or trailing minus, or parentheses, make it negative; spaces
// and currency signs are dropped. When both "." and "," appear, the later one
// is the decimal mark; a lone "," is the decimal mark only when one or two
// digits follow it; a lone "." always is. Grouped digits must come in threes.
func parseBankAmount(text string) (int64, error) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return 0, errors.New(msgBankNoAmount)
	}
	bad := fmt.Errorf(msgBankNotAmount, quoteBankText(trimmed))
	s := trimmed
	negative := false
	if len(s) >= 2 && s[0] == '(' && s[len(s)-1] == ')' {
		negative = true
		s = s[1 : len(s)-1]
	}
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(bankAmountSpaces, r) || strings.ContainsRune(bankCurrencySigns, r) {
			return -1
		}
		return r
	}, s)
	switch {
	case strings.HasPrefix(s, "-"):
		negative = true
		s = s[1:]
	case strings.HasPrefix(s, "+"):
		s = s[1:]
	case strings.HasSuffix(s, "-"):
		negative = true
		s = s[:len(s)-1]
	}
	if s == "" || strings.Trim(s, "0123456789.,") != "" {
		return 0, bad
	}
	whole, frac, ok := splitBankNumber(s)
	if !ok {
		return 0, bad
	}
	if len(frac) > 2 {
		return 0, fmt.Errorf(msgBankAmountDecimals, quoteBankText(trimmed))
	}
	digits := strings.TrimLeft(whole+(frac+"00")[:2], "0")
	if digits == "" {
		return 0, nil
	}
	tooLarge := fmt.Errorf(msgBankAmountTooLarge, quoteBankText(trimmed))
	if len(digits) > 16 {
		return 0, tooLarge
	}
	cents, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || cents > maxAmount {
		return 0, tooLarge
	}
	if negative {
		cents = -cents
	}
	return cents, nil
}

// splitBankNumber splits digits with "." and "," into the whole part (group
// marks removed) and the fraction, or reports that the marks do not form a
// number.
func splitBankNumber(s string) (whole, frac string, ok bool) {
	dot, comma := strings.LastIndexByte(s, '.'), strings.LastIndexByte(s, ',')
	var decimal, group byte
	switch {
	case dot >= 0 && comma >= 0:
		if dot > comma {
			decimal, group = '.', ','
		} else {
			decimal, group = ',', '.'
		}
	case comma >= 0:
		after := len(s) - comma - 1
		if strings.Count(s, ",") == 1 && after >= 1 && after <= 2 {
			decimal = ','
		} else {
			group = ','
		}
	case dot >= 0:
		if strings.Count(s, ".") == 1 {
			decimal = '.'
		} else {
			group = '.'
		}
	}
	whole = s
	if decimal != 0 {
		i := strings.LastIndexByte(s, decimal)
		whole, frac = s[:i], s[i+1:]
	}
	if strings.ContainsAny(frac, ".,") {
		return "", "", false
	}
	if group != 0 {
		groups := strings.Split(whole, string(group))
		if len(groups[0]) < 1 || len(groups[0]) > 3 {
			return "", "", false
		}
		for _, g := range groups[1:] {
			if len(g) != 3 {
				return "", "", false
			}
		}
		whole = strings.Join(groups, "")
	}
	if strings.ContainsAny(whole, ".,") || (whole == "" && frac == "") {
		return "", "", false
	}
	if whole == "" {
		whole = "0"
	}
	return whole, frac, true
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankDate_Vectors|TestParseBankAmount_Vectors|TestBankDateFormats_MatchTheSchema' -count=1 .`
Expected: PASS. If a vector fails, fix the code, not the vector, unless the vector contradicts the rule written in the function comment (then fix the vector and say so in your report).

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add server/bank_values.go server/bank_values_test.go server/testdata/bank_import_vectors.json && git commit -m "feat(books): read bank file dates and amounts"
```

---

### Task 3: CSV parsing (Go)

**Files:**
- Create: `server/bank_csv.go`
- Create: `server/bank_csv_test.go`

**Interfaces:**
- Consumes: `utf8BOM` (server/banking.go); `refuse` (server/errors.go).
- Produces:
  - `type bankRow struct { Line int \`json:"line"\`; Cells []string \`json:"cells"\` }`
  - `type bankContent struct { Columns int; Rows []bankRow; StatementBalance *int64; StatementDate string }`
  - `const maxBankRows = 10000`; `const msgBankTooManyRows = "This file has more than 10,000 rows. Export a shorter date range from your bank."`
  - `func decodeBankText(data []byte) string` — UTF-8 as is; anything else read as Windows-1252.
  - `func parseBankCSV(data []byte) (bankContent, error)` — every non-blank record, cells trimmed, trailing empty cells dropped, `Line` = the record's first line in the file (1-based), `Columns` = the widest row.

- [ ] **Step 1: Write the failing tests**

Create `server/bank_csv_test.go`:

```go
package books

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func requireRows(t *testing.T, got bankContent, wantColumns int, want []bankRow) {
	t.Helper()
	if got.Columns != wantColumns {
		t.Errorf("columns = %d, want %d", got.Columns, wantColumns)
	}
	if !reflect.DeepEqual(got.Rows, want) {
		t.Errorf("rows =\n%#v\nwant\n%#v", got.Rows, want)
	}
}

func TestParseBankCSV_TheSample(t *testing.T) {
	got, err := parseBankCSV([]byte(bankCSV))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Rows) != 7 || got.Columns != 3 {
		t.Fatalf("%d rows, %d columns; want 7 rows, 3 columns", len(got.Rows), got.Columns)
	}
	if want := (bankRow{Line: 1, Cells: []string{"Date", "Description", "Amount"}}); !reflect.DeepEqual(got.Rows[0], want) {
		t.Errorf("row 0 = %#v, want %#v", got.Rows[0], want)
	}
	if want := (bankRow{Line: 3, Cells: []string{"2026-09-05", "Card purchase - Office Depot", "-86.47"}}); !reflect.DeepEqual(got.Rows[2], want) {
		t.Errorf("row 2 = %#v, want %#v", got.Rows[2], want)
	}
	if got.StatementBalance != nil || got.StatementDate != "" {
		t.Errorf("a CSV file has no statement balance, got %v %q", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankCSV_QuotedFields(t *testing.T) {
	data := "Date,Description,Amount\r\n" +
		"2026-09-02,\"Deposit, Harbor \"\"Design\"\"\",4250.00\r\n" +
		"2026-09-03,\"Two\nlines\",-1.00\r\n" +
		"2026-09-04,After,-2.00\r\n"
	got, err := parseBankCSV([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{
		{Line: 1, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 2, Cells: []string{"2026-09-02", `Deposit, Harbor "Design"`, "4250.00"}},
		{Line: 3, Cells: []string{"2026-09-03", "Two\nlines", "-1.00"}},
		{Line: 5, Cells: []string{"2026-09-04", "After", "-2.00"}},
	})
}

func TestParseBankCSV_Delimiters(t *testing.T) {
	cases := []struct {
		name, data string
		want       []string
	}{
		{"semicolon", "Datum;Omschrijving;Bedrag\n02-09-2026;Koffie, groot;1.234,56\n", []string{"02-09-2026", "Koffie, groot", "1.234,56"}},
		{"tab", "Date\tDescription\tAmount\n2026-09-02\tDeposit, cash\t4250.00\n", []string{"2026-09-02", "Deposit, cash", "4250.00"}},
		{"comma wins a tie", "a,b;c\n1,2;3\n", []string{"1", "2;3"}},
		{"quoted delimiters do not count", "\"a;b;c\",d\n1,2\n", []string{"1", "2"}},
		{"a preamble line has no delimiter", "Rekening 4821\nDatum;Bedrag\n02-09-2026;12,50\n", []string{"Datum", "Bedrag"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := parseBankCSV([]byte(c.data))
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Rows) != 2 || !reflect.DeepEqual(got.Rows[1].Cells, c.want) {
				t.Errorf("rows = %#v, want second row %#v", got.Rows, c.want)
			}
		})
	}
}

func TestParseBankCSV_BOMAndWindows1252(t *testing.T) {
	t.Run("BOM", func(t *testing.T) {
		got, err := parseBankCSV([]byte("\xef\xbb\xbfDate,Amount\n2026-09-02,1.00\n"))
		if err != nil {
			t.Fatal(err)
		}
		if got.Rows[0].Cells[0] != "Date" {
			t.Errorf("first cell = %q, want Date without the BOM", got.Rows[0].Cells[0])
		}
	})
	t.Run("Windows-1252", func(t *testing.T) {
		got, err := parseBankCSV([]byte("2026-09-02,Caf\xe9 Lumi\xe8re \x80,-4.50\n"))
		if err != nil {
			t.Fatal(err)
		}
		if want := "Café Lumière €"; got.Rows[0].Cells[1] != want {
			t.Errorf("cell = %q, want %q", got.Rows[0].Cells[1], want)
		}
	})
	t.Run("UTF-8 stays", func(t *testing.T) {
		got, err := parseBankCSV([]byte("2026-09-02,Café,-4.50\n"))
		if err != nil {
			t.Fatal(err)
		}
		if got.Rows[0].Cells[1] != "Café" {
			t.Errorf("cell = %q, want Café", got.Rows[0].Cells[1])
		}
	})
}

func TestParseBankCSV_SkipsBlankRowsAndTrailingCells(t *testing.T) {
	data := "Account: 4821\n\nDate,Description,Amount,\n,,,\n  \n2026-09-02, Deposit ,4250.00,\n2026-09-03,Fee,-1.00,,\n"
	got, err := parseBankCSV([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{
		{Line: 1, Cells: []string{"Account: 4821"}},
		{Line: 3, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 6, Cells: []string{"2026-09-02", "Deposit", "4250.00"}},
		{Line: 7, Cells: []string{"2026-09-03", "Fee", "-1.00"}},
	})
}

func TestParseBankCSV_RowLimit(t *testing.T) {
	var b strings.Builder
	b.WriteString("Date,Description,Amount\n")
	for i := range maxBankRows - 1 {
		fmt.Fprintf(&b, "2026-09-02,Row %d,1.00\n", i)
	}
	got, err := parseBankCSV([]byte(b.String()))
	if err != nil {
		t.Fatalf("exactly %d rows: %v", maxBankRows, err)
	}
	if len(got.Rows) != maxBankRows {
		t.Fatalf("%d rows, want %d", len(got.Rows), maxBankRows)
	}
	b.WriteString("2026-09-02,One too many,1.00\n")
	_, err = parseBankCSV([]byte(b.String()))
	requireRefused(t, err, "This file has more than 10,000 rows. Export a shorter date range from your bank.")
}

func TestParseBankCSV_HeaderOnly(t *testing.T) {
	got, err := parseBankCSV([]byte("Date,Description,Amount\n"))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{{Line: 1, Cells: []string{"Date", "Description", "Amount"}}})
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankCSV_' -count=1 .`
Expected: FAIL — `undefined: parseBankCSV`, `undefined: bankRow`, `undefined: maxBankRows`.

- [ ] **Step 3: Write `server/bank_csv.go`**

```go
// Parsing a stored bank file into rows of text cells. The file is parsed once,
// when it is stored (server/banking.go); the import maps the cells later with
// the columns the person chose (server/bank_import.go).

package books

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
)

const (
	// maxBankRows bounds one file's rows: a year of a busy account fits, and the
	// mapping screen shows every row.
	maxBankRows        = 10000
	msgBankTooManyRows = "This file has more than 10,000 rows. Export a shorter date range from your bank."
)

// bankRow is one row of a bank file: its first line number in the file
// (1-based) and its cells, trimmed.
type bankRow struct {
	Line  int      `json:"line"`
	Cells []string `json:"cells"`
}

// bankContent is a parsed bank file. Columns is the widest row. An OFX file
// also states its ledger balance (minor units, as the bank states it) and the
// day of that balance; a CSV file has neither.
type bankContent struct {
	Columns          int
	Rows             []bankRow
	StatementBalance *int64
	StatementDate    string
}

// decodeBankText returns the file as text. A file that is not valid UTF-8 is
// read as Windows-1252, the encoding of most bank exports that are not UTF-8
// (an OFX 1 file says CHARSET:1252).
func decodeBankText(data []byte) string {
	if utf8.Valid(data) {
		return string(data)
	}
	text, err := charmap.Windows1252.NewDecoder().Bytes(data)
	if err != nil {
		// Windows-1252 maps every byte, so this does not happen; keep the bytes
		// with invalid sequences replaced rather than refuse the file.
		return strings.ToValidUTF8(string(data), "�")
	}
	return string(text)
}

// parseBankCSV reads every record of a CSV file. Blank records (no cell with
// text) are skipped, cells are trimmed, and empty cells at the end of a row
// are dropped, since many banks end every line with a delimiter.
func parseBankCSV(data []byte) (bankContent, error) {
	text := strings.TrimPrefix(decodeBankText(data), utf8BOM)
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = csvDelimiter(text)
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	var content bankContent
	for {
		record, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return bankContent{}, fmt.Errorf("books: read the CSV file: %w", err)
		}
		line, _ := r.FieldPos(0)
		cells := trimBankCells(record)
		if len(cells) == 0 {
			continue
		}
		if len(content.Rows) == maxBankRows {
			return bankContent{}, refuse(msgBankTooManyRows)
		}
		content.Rows = append(content.Rows, bankRow{Line: line, Cells: cells})
		content.Columns = max(content.Columns, len(cells))
	}
	return content, nil
}

// trimBankCells trims every cell and drops the empty cells at the end; a
// record with no text has no cells.
func trimBankCells(record []string) []string {
	cells := make([]string, len(record))
	last := -1
	for i, c := range record {
		cells[i] = strings.TrimSpace(c)
		if cells[i] != "" {
			last = i
		}
	}
	return cells[:last+1]
}

// csvDelimiter picks the delimiter of the first line that has one (a bank's
// preamble line such as "Account: 4821" has none): the one of ",", ";" and tab
// that appears most often outside quotes, "," on a tie.
func csvDelimiter(text string) rune {
	for line := range strings.SplitSeq(text, "\n") {
		counts := map[rune]int{}
		quoted := false
		for _, c := range line {
			switch {
			case c == '"':
				quoted = !quoted
			case !quoted && (c == ',' || c == ';' || c == '\t'):
				counts[c]++
			}
		}
		if len(counts) == 0 {
			continue
		}
		best := ','
		for _, d := range []rune{';', '\t'} {
			if counts[d] > counts[best] {
				best = d
			}
		}
		return best
	}
	return ','
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankCSV_' -count=1 .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add server/bank_csv.go server/bank_csv_test.go && git commit -m "feat(books): parse bank CSV files"
```

---

### Task 4: OFX parsing (Go)

**Files:**
- Create: `server/bank_ofx.go`
- Create: `server/bank_ofx_test.go`

**Interfaces:**
- Consumes: `bankRow`, `bankContent`, `maxBankRows`, `msgBankTooManyRows`, `decodeBankText` (Task 3); `parseBankAmount`, `parseBankDate` (Task 2); `refuse`.
- Produces:
  - `var ofxColumns = []string{"Date", "Description", "Memo", "Amount", "Transaction ID", "Check number", "Type"}` — the cells of an OFX row, in this order. Date is `YYYY-MM-DD` when `DTPOSTED` starts with 8 digits, else the raw text; Amount is `TRNAMT` as written; Description is `NAME` (or `MEMO` when there is no `NAME`, and then Memo is empty).
  - `func parseBankOFX(data []byte) (bankContent, error)` — `Columns` is always 7; `Line` is the file line of the `<STMTTRN>` tag; `StatementBalance`/`StatementDate` from `LEDGERBAL` when both parse.
  - Messages `msgOFXNoStatement = "This OFX file holds no bank or credit card statement."`, `msgOFXManyStatements = "This file holds statements for %d accounts. Export one account at a time."`.

- [ ] **Step 1: Write the failing tests**

Create `server/bank_ofx_test.go`:

```go
package books

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// ofxStatement is an OFX 1 (SGML) file of one bank statement around trns.
func ofxStatement(trns string) string {
	return "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX>\n" +
		"<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<CURDEF>USD\n<BANKTRANLIST>\n" +
		trns +
		"</BANKTRANLIST>\n" +
		"<LEDGERBAL><BALAMT>-1234.56<DTASOF>20261031120000[-5:EST]</LEDGERBAL>\n" +
		"</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n"
}

func TestParseBankOFX_TheSample(t *testing.T) {
	got, err := parseBankOFX([]byte(bankOFX))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(bankOFX, "<STMTTRN>", 0), Cells: []string{"2026-10-01", "Harbor Design", "", "3100.00", "2026000001", "", "CREDIT"}},
	})
}

func TestParseBankOFX_SGMLFields(t *testing.T) {
	data := ofxStatement(
		"<STMTTRN>\n<TRNTYPE>CHECK\n<DTPOSTED>20261003\n<TRNAMT>-250.00\n<FITID>A1\n<CHECKNUM>1001\n<NAME>Smith &amp; Sons\n<MEMO>Invoice 1042\n</STMTTRN>\n" +
			"<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261004000000.000[-5:EST]\n<TRNAMT>-12.00\n<FITID>A2\n<PAYEE><NAME>Office Depot<ADDR1>1 Main St</PAYEE>\n" +
			"<STMTTRN>\n<TRNTYPE>FEE\n<DTPOSTED>2026\n<TRNAMT>-1.00\n<FITID>A3\n<MEMO>Monthly fee\n</STMTTRN>\n")
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(data, "<STMTTRN>", 0), Cells: []string{"2026-10-03", "Smith & Sons", "Invoice 1042", "-250.00", "A1", "1001", "CHECK"}},
		{Line: lineOf(data, "<STMTTRN>", 1), Cells: []string{"2026-10-04", "Office Depot", "", "-12.00", "A2", "", "DEBIT"}},
		{Line: lineOf(data, "<STMTTRN>", 2), Cells: []string{"2026", "Monthly fee", "", "-1.00", "A3", "", "FEE"}},
	})
	if got.StatementBalance == nil || *got.StatementBalance != -123456 || got.StatementDate != "2026-10-31" {
		t.Errorf("statement = %v %q, want -123456 2026-10-31", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankOFX_XML(t *testing.T) {
	data := `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261005</DTPOSTED><TRNAMT>-49.00</TRNAMT><FITID>C1</FITID><NAME>Clean Getaway Car</NAME></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-3410.17</BALAMT><DTASOF>20261031</DTASOF></LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>
`
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(data, "<STMTTRN>", 0), Cells: []string{"2026-10-05", "Clean Getaway Car", "", "-49.00", "C1", "", "DEBIT"}},
	})
	if got.StatementBalance == nil || *got.StatementBalance != -341017 || got.StatementDate != "2026-10-31" {
		t.Errorf("statement = %v %q, want -341017 2026-10-31", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankOFX_LowercaseAndNoTransactions(t *testing.T) {
	got, err := parseBankOFX([]byte("<ofx>\n<bankmsgsrsv1><stmttrnrs><stmtrs>\n<curdef>USD\n</stmtrs></stmttrnrs></bankmsgsrsv1>\n</ofx>\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Rows) != 0 || got.Columns != 7 || got.StatementBalance != nil {
		t.Errorf("got %#v, want no rows, 7 columns, no balance", got)
	}
}

func TestParseBankOFX_Windows1252(t *testing.T) {
	data := ofxStatement("<STMTTRN>\n<DTPOSTED>20261003\n<TRNAMT>-4.50\n<FITID>B1\n<NAME>Caf\xe9\n</STMTTRN>\n")
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	if got.Rows[0].Cells[1] != "Café" {
		t.Errorf("name = %q, want Café", got.Rows[0].Cells[1])
	}
}

func TestParseBankOFX_Refusals(t *testing.T) {
	two := "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>" +
		"<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST></BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>"
	_, err := parseBankOFX([]byte(two))
	requireRefused(t, err, "This file holds statements for 2 accounts. Export one account at a time.")

	_, err = parseBankOFX([]byte("OFXHEADER:100\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</STATUS></SONRS></SIGNONMSGSRSV1></OFX>"))
	requireRefused(t, err, "This OFX file holds no bank or credit card statement.")

	var b strings.Builder
	for i := range maxBankRows + 1 {
		fmt.Fprintf(&b, "<STMTTRN><DTPOSTED>20261003<TRNAMT>-1.00<FITID>F%d</STMTTRN>\n", i)
	}
	_, err = parseBankOFX([]byte(ofxStatement(b.String())))
	requireRefused(t, err, "This file has more than 10,000 rows.")
}

func TestOFXColumns(t *testing.T) {
	want := []string{"Date", "Description", "Memo", "Amount", "Transaction ID", "Check number", "Type"}
	if !reflect.DeepEqual(ofxColumns, want) {
		t.Errorf("ofxColumns = %v, want %v", ofxColumns, want)
	}
}
```

Add this helper to `bank_ofx_test.go` too (the expected `Line` is the line of each `<STMTTRN>` tag; Task 7 uses it as well). `"</STMTTRN>"` does not contain `"<STMTTRN>"`, so closing tags are not counted:

```go
// lineOf is the 1-based line of the n-th (0-based) occurrence of tag in data.
func lineOf(data, tag string, n int) int {
	at := 0
	for range n + 1 {
		i := strings.Index(data[at:], tag)
		if i < 0 {
			return -1
		}
		at += i + len(tag)
	}
	return strings.Count(data[:at-len(tag)], "\n") + 1
}
```

`lineOf(bankOFX, "<STMTTRN>", 0)` is 9 and the XML test's is 5; when a test fails on `Line`, check the helper against those two before you change the parser.

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankOFX_|TestOFXColumns' -count=1 .`
Expected: FAIL — `undefined: parseBankOFX`, `undefined: ofxColumns`.

- [ ] **Step 3: Write `server/bank_ofx.go`**

```go
// Parsing an OFX bank file (also .qfx and .qbo). OFX 1 is SGML, where a value
// tag is not closed (<NAME>Harbor Design) and an aggregate is; OFX 2 is XML,
// where every tag is closed. One reader serves both: a value is the text after
// a tag up to the next "<", and closing tags of values are ignored.

package books

import (
	"html"
	"strings"
)

const (
	msgOFXNoStatement    = "This OFX file holds no bank or credit card statement."
	msgOFXManyStatements = "This file holds statements for %d accounts. Export one account at a time."
)

// ofxColumns are the cells of an OFX row, in order. The import reads them with
// ofxMapping (server/bank_import_map.go); tinycld/books/lib/bank-import.ts
// mirrors them as OFX_COLUMNS for the mapping screen.
var ofxColumns = []string{"Date", "Description", "Memo", "Amount", "Transaction ID", "Check number", "Type"}

// ofxTxn is one STMTTRN aggregate as it is read.
type ofxTxn struct {
	line                                          int
	date, name, memo, amount, fitid, check, kind string
}

func (t *ofxTxn) set(tag, value string) {
	switch tag {
	case "DTPOSTED":
		t.date = ofxDay(value)
	case "NAME":
		t.name = value
	case "MEMO":
		t.memo = value
	case "TRNAMT":
		t.amount = value
	case "FITID":
		t.fitid = value
	case "CHECKNUM":
		t.check = value
	case "TRNTYPE":
		t.kind = value
	}
}

func (t *ofxTxn) cells() []string {
	description, memo := t.name, t.memo
	if description == "" {
		description, memo = memo, ""
	}
	return []string{t.date, description, memo, t.amount, t.fitid, t.check, t.kind}
}

// ofxDay turns an OFX date-time (YYYYMMDD, then an optional time and zone)
// into YYYY-MM-DD, the day as the bank wrote it. Text that does not start with
// eight digits is kept, so the import shows it in its row error.
func ofxDay(s string) string {
	if len(s) < 8 || !isASCIIDigits(s[:8]) {
		return s
	}
	return s[:4] + "-" + s[4:6] + "-" + s[6:8]
}

// parseBankOFX reads the transactions and the ledger balance of the one bank
// (STMTRS) or credit card (CCSTMTRS) statement of an OFX file. A file with no
// statement, or with statements for several accounts, is refused: a file
// belongs to one connection.
func parseBankOFX(data []byte) (bankContent, error) {
	text := decodeBankText(data)
	content := bankContent{Columns: len(ofxColumns)}
	var (
		statements     int
		txn            *ofxTxn
		inLedger       bool
		balance, asOf  string
		line           = 1
		counted        int
	)
	flush := func() error {
		if txn == nil {
			return nil
		}
		if len(content.Rows) == maxBankRows {
			return refuse(msgBankTooManyRows)
		}
		content.Rows = append(content.Rows, bankRow{Line: txn.line, Cells: txn.cells()})
		txn = nil
		return nil
	}
	for pos := 0; ; {
		open := strings.IndexByte(text[pos:], '<')
		if open < 0 {
			break
		}
		open += pos
		end := strings.IndexByte(text[open:], '>')
		if end < 0 {
			break
		}
		end += open
		line += strings.Count(text[counted:open], "\n")
		counted = open
		tag := strings.ToUpper(strings.TrimSpace(text[open+1 : end]))
		valueEnd := len(text)
		if next := strings.IndexByte(text[end+1:], '<'); next >= 0 {
			valueEnd = end + 1 + next
		}
		value := strings.TrimSpace(html.UnescapeString(text[end+1 : valueEnd]))
		pos = end + 1
		switch tag {
		case "STMTRS", "CCSTMTRS":
			statements++
		case "STMTTRN":
			if err := flush(); err != nil {
				return bankContent{}, err
			}
			txn = &ofxTxn{line: line}
		case "/STMTTRN", "/BANKTRANLIST", "/STMTRS", "/CCSTMTRS", "/OFX":
			if err := flush(); err != nil {
				return bankContent{}, err
			}
		case "LEDGERBAL":
			inLedger = true
		case "/LEDGERBAL":
			inLedger = false
		case "BALAMT":
			if inLedger {
				balance = value
			}
		case "DTASOF":
			if inLedger {
				asOf = value
			}
		default:
			if txn != nil {
				txn.set(tag, value)
			}
		}
	}
	if err := flush(); err != nil {
		return bankContent{}, err
	}
	if statements == 0 {
		return bankContent{}, refuse(msgOFXNoStatement)
	}
	if statements > 1 {
		return bankContent{}, refuse(msgOFXManyStatements, statements)
	}
	if cents, err := parseBankAmount(balance); err == nil {
		if day, err := parseBankDate(ofxDay(asOf), "YYYY-MM-DD"); err == nil {
			content.StatementBalance = &cents
			content.StatementDate = day
		}
	}
	return content, nil
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestParseBankOFX_|TestOFXColumns' -count=1 .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add server/bank_ofx.go server/bank_ofx_test.go && git commit -m "feat(books): parse bank OFX files"
```

---

### Task 5: The upload stores the rows and the statement

**Files:**
- Modify: `pb-migrations/2100000008_create_books_banking.js` (file fields)
- Modify: `server/ledger.go`
- Modify: `server/banking.go`
- Create: `server/bank_contents_test.go`
- Modify: `server/banking_upload_test.go`
- Modify: `tinycld/books/lib/bank-connection-fixture.ts`
- Modify: `tinycld/books/collections.ts`, `tests/collections.test.ts`

**Interfaces:**
- Consumes: `parseBankCSV`, `parseBankOFX`, `bankContent`, `bankRow` (Tasks 3–4); `books_bank_file_contents` (Task 1).
- Produces:
  - `func serializedThen(e *core.RecordEvent, check, after func(tx core.App) error) error` (server/ledger.go) — check, the write, then `after`, in one transaction; `after` may be nil. `serialized(e, check)` calls it with nil.
  - `func readBankBytes(f *filesystem.File) ([]byte, error)` — the bytes, refusing empty and over 5 MB.
  - `func parseStoredBankFile(r *core.Record) (bankContent, types.JSONRaw, error)`; `func encodeBankRows(rows []bankRow) (types.JSONRaw, error)`; `func saveBankContent(tx core.App, file *core.Record, columns int, rows types.JSONRaw) error`; `func stampStatement(r *core.Record, c bankContent)`.
  - Constants `maxBankContentBytes = 20971520`, `msgBankContentTooLarge = "This file is too large to read. Export a shorter date range from your bank."`.
  - File fields `statement_balance` (int, minor units) and `statement_date` (`YYYY-MM-DD` or ""), stamped, pinned unset in the create rule.
  - Every stored file (REST upload or Go `app.Save`) has exactly one `books_bank_file_contents` row; a refused file has none.

- [ ] **Step 1: Write the failing tests**

Create `server/bank_contents_test.go`:

```go
package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// bankContentOf is the stored file's parsed rows.
func bankContentOf(t testing.TB, app core.App, fileID string) (int, []bankRow) {
	t.Helper()
	r, err := app.FindFirstRecordByData("books_bank_file_contents", "file", fileID)
	if err != nil {
		t.Fatalf("find the rows of %s: %v", fileID, err)
	}
	var rows []bankRow
	if err := r.UnmarshalJSONField("rows", &rows); err != nil {
		t.Fatalf("decode rows: %v", err)
	}
	return r.GetInt("columns"), rows
}

func requireNoContents(t testing.TB, app core.App) {
	t.Helper()
	if n, err := app.CountRecords("books_bank_file_contents"); err != nil || n != 0 {
		t.Errorf("%d parsed-row records (err %v), want 0", n, err)
	}
}

func TestBankUpload_StoresTheRows(t *testing.T) {
	env := newBankEnv(t)
	req := env.upload(t, "sep-2026.csv", []byte(bankCSV))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		file := onlyBankFile(t, app, env.connection.Id)
		columns, rows := bankContentOf(t, app, file.Id)
		if columns != 3 || len(rows) != 7 {
			t.Fatalf("%d columns, %d rows; want 3 and 7", columns, len(rows))
		}
		if rows[1].Line != 2 || rows[1].Cells[1] != "Deposit - Harbor Design client payment" {
			t.Errorf("row 1 = %#v", rows[1])
		}
		if file.GetInt("statement_balance") != 0 || file.GetString("statement_date") != "" {
			t.Errorf("a CSV file stamped a statement: %d %q", file.GetInt("statement_balance"), file.GetString("statement_date"))
		}
	}
	req.run(t, env.app)
}

func TestBankUpload_StoresOFXRowsAndStatement(t *testing.T) {
	env := newBankEnv(t)
	data := ofxStatement("<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261003\n<TRNAMT>-12.00\n<FITID>A1\n<NAME>Fee\n</STMTTRN>\n")
	req := env.upload(t, "oct-2026.qfx", []byte(data))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		file := onlyBankFile(t, app, env.connection.Id)
		columns, rows := bankContentOf(t, app, file.Id)
		if columns != 7 || len(rows) != 1 || rows[0].Cells[4] != "A1" {
			t.Errorf("%d columns, rows %#v", columns, rows)
		}
		if file.GetInt("statement_balance") != -123456 || file.GetString("statement_date") != "2026-10-31" {
			t.Errorf("statement = %d %q, want -123456 2026-10-31", file.GetInt("statement_balance"), file.GetString("statement_date"))
		}
	}
	req.run(t, env.app)
}

func TestBankUpload_RefusesAFileItCannotParse(t *testing.T) {
	var many strings.Builder
	many.WriteString("Date,Description,Amount\n")
	for i := range maxBankRows {
		fmt.Fprintf(&many, "2026-09-02,Row %d,1.00\n", i)
	}
	two := "<OFX><STMTRS></STMTRS><CCSTMTRS></CCSTMTRS></OFX>"
	for _, c := range []struct{ name, data, message string }{
		{"rows.csv", many.String(), "This file has more than 10,000 rows. Export a shorter date range from your bank."},
		{"two.ofx", two, "This file holds statements for 2 accounts. Export one account at a time."},
	} {
		t.Run(c.name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, []byte(c.data))
			req.want = http.StatusBadRequest
			req.content = refusedWith(c.message)
			req.after = func(t testing.TB, app *tests.TestApp) {
				requireNoBankFile(t, app)
				requireNoContents(t, app)
			}
			req.run(t, env.app)
		})
	}
}

// A Go caller's file (the model path) gets its rows too.
func TestBankFile_GoCallerGetsRows(t *testing.T) {
	env := newBankEnv(t)
	file := mustSaveBankFile(t, env.app, env.connection.Id, "sep.csv", "h-sep", bankFileStatusUploaded)
	if columns, rows := bankContentOf(t, env.app, file.Id); columns != 3 || len(rows) != 7 {
		t.Errorf("%d columns, %d rows; want 3 and 7", columns, len(rows))
	}
}

// A refused file leaves no rows: they are written in the file's transaction.
func TestBankFile_RefusedFileLeavesNoRows(t *testing.T) {
	env := newBankEnv(t)
	mustSaveBankFile(t, env.app, env.connection.Id, "a.csv", "h1", bankFileStatusUploaded)
	_, err := saveBankFile(env.app, env.connection.Id, "b.csv", "h1", bankFileStatusUploaded)
	requireRefused(t, err, "a.csv was already uploaded to")
	if n, err := env.app.CountRecords("books_bank_file_contents"); err != nil || n != 1 {
		t.Errorf("%d parsed-row records (err %v), want only the stored file's", n, err)
	}
}

// Removing a file, or disconnecting, removes its rows.
func TestBankFile_RemoveDeletesItsRows(t *testing.T) {
	env := newBankEnv(t)
	file := mustSaveBankFile(t, env.app, env.connection.Id, "a.csv", "h1", bankFileStatusUploaded)
	if err := env.app.Delete(file); err != nil {
		t.Fatal(err)
	}
	if n, _ := env.app.CountRecords("books_bank_file_contents", dbx.HashExp{"file": file.Id}); n != 0 {
		t.Errorf("%d parsed-row records left after the file was removed", n)
	}
}

// Rows whose JSON passes the field's maxSize are refused with a message
// before the transaction, not by the schema.
func TestEncodeBankRows_RefusesTooLarge(t *testing.T) {
	rows := []bankRow{{Line: 1, Cells: []string{strings.Repeat("<", 4<<20)}}}
	_, err := encodeBankRows(rows)
	requireRefused(t, err, "This file is too large to read. Export a shorter date range from your bank.")
	raw, err := encodeBankRows(nil)
	if err != nil || string(raw) != "[]" {
		t.Errorf("no rows encode as %q, %v; want []", raw, err)
	}
}
```

In `server/banking_upload_test.go`:

1. In `paddedCSV`, replace `row := []byte("2026-09-30,Padding row to reach the size limit,0.00\n")` with

```go
	// Long rows, so a 5 MB file stays under maxBankRows.
	row := []byte("2026-09-30,Padding row to reach the size limit " + strings.Repeat("x", 900) + ",0.00\n")
```

2. In `TestBankUpload_ClientCannotSetStampedFields`, extend the field list with `"statement_balance", "statement_date"` and `values` with `"statement_balance": "10", "statement_date": "2026-10-31"`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBankUpload_|TestBankFile_|TestEncodeBankRows_' -count=1 .`
Expected: FAIL — `undefined: encodeBankRows`; after a stub, missing contents rows and the unknown `statement_balance` field.

- [ ] **Step 3: Add the file fields to the migration**

In `pb-migrations/2100000008_create_books_banking.js`, in `books_bank_files`:
- the create rule becomes `` `${WRITE} && ${unset('name', 'format', 'size', 'content_hash', 'status', 'uploaded_by', 'statement_balance', 'statement_date')}` ``;
- after `userRef('uploaded_by'),` add

```js
                    // OFX only, stamped from the file: the statement's ledger balance
                    // in minor units as the bank states it (a card's balance owed is
                    // usually negative) and its day. 0 and '' for a CSV file.
                    { name: 'statement_balance', type: 'number', onlyInt: true },
                    { name: 'statement_date', type: 'text', max: 10, pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
```

and add `statement_balance, statement_date` to the header comment's list of fields pinned on a file. Then run `cd /Users/nas/tmp/tinycld/books-reports/tinycld && pnpm run packages:generate`.

- [ ] **Step 4: Add `serializedThen` to `server/ledger.go`**

Replace `serialized` with:

```go
// serialized runs check and the write it guards in one transaction. A
// PocketBase create or update has no transaction of its own, and a delete
// opens one only after the delete hooks run, so a check made outside one can
// pass, a post can commit, and the write then lands on what the check no
// longer saw. The write pool has one connection, so inside the transaction
// no post can commit between the check and the write. e.App is the
// transaction while the write runs, so PocketBase's own write joins it, and
// is restored after.
func serialized(e *core.RecordEvent, check func(tx core.App) error) error {
	return serializedThen(e, check, nil)
}

// serializedThen is serialized with a step after the write, in the same
// transaction, for rows that must exist with the record or not at all (a bank
// file's parsed rows, an import's transactions). after may be nil.
func serializedThen(e *core.RecordEvent, check, after func(tx core.App) error) error {
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := check(tx); err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		if after == nil {
			return nil
		}
		return after(tx)
	})
}
```

- [ ] **Step 5: Parse and store in `server/banking.go`**

1. Add imports `"encoding/json"` and `"github.com/pocketbase/pocketbase/tools/types"`.
2. Add to the first `const` block:

```go
	// maxBankContentBytes is the rows field's maxSize in 2100000008.
	maxBankContentBytes    = 20971520
```

and to the message block: `msgBankContentTooLarge = "This file is too large to read. Export a shorter date range from your bank."`.
3. Replace the `books_bank_files` `OnRecordCreate` binding in `registerBanking` with:

```go
	app.OnRecordCreate("books_bank_files").BindFunc(func(e *core.RecordEvent) error {
		content, rows, err := parseStoredBankFile(e.Record)
		if err != nil {
			return err
		}
		stampStatement(e.Record, content)
		return serializedThen(e,
			func(tx core.App) error { return checkBankFileCreate(tx, e.Record) },
			func(tx core.App) error { return saveBankContent(tx, e.Record, content.Columns, rows) })
	})
```

and add to the function's comment: "A file's rows are parsed before the transaction (parsing reads no row) and stored after the file row, in its transaction, so every stored file has its rows and a refused one has none."
4. Split `readBankUpload`: keep its name, extension and declared-size checks, then call the new `readBankBytes`:

```go
// readBankBytes reads a file's bytes, refusing an empty file and one over the
// limit. One byte past the limit is read, so a reader that holds more than the
// declared size is refused rather than cut silently.
func readBankBytes(f *filesystem.File) ([]byte, error) {
	r, err := f.Reader.Open()
	if err != nil {
		return nil, fmt.Errorf("books: read the uploaded file: %w", err)
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, maxBankFileBytes+1))
	if err != nil {
		return nil, fmt.Errorf("books: read the uploaded file: %w", err)
	}
	if len(data) == 0 {
		return nil, refuse(msgBankFileEmpty)
	}
	if len(data) > maxBankFileBytes {
		return nil, refuse(msgBankFileTooBig)
	}
	return data, nil
}
```

`readBankUpload` after its three cheap checks becomes:

```go
	data, err := readBankBytes(f)
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256(data)
	format, ok := sniffBankFile(data)
	if !ok {
		return "", "", refuse(msgBankFileNotBank)
	}
	return format, hex.EncodeToString(sum[:]), nil
```

5. Add:

```go
// parseStoredBankFile parses the file being stored by its stamped format and
// encodes its rows. The request hook stamped the format; a Go caller sets it.
func parseStoredBankFile(r *core.Record) (bankContent, types.JSONRaw, error) {
	files := r.GetUnsavedFiles("file")
	if len(files) == 0 {
		return bankContent{}, nil, refuse(msgBankFileEmpty)
	}
	data, err := readBankBytes(files[0])
	if err != nil {
		return bankContent{}, nil, err
	}
	var content bankContent
	switch r.GetString("format") {
	case "csv":
		content, err = parseBankCSV(data)
	case "ofx":
		content, err = parseBankOFX(data)
	default:
		return bankContent{}, nil, refuse(msgBankFileNotBank)
	}
	if err != nil {
		return bankContent{}, nil, err
	}
	rows, err := encodeBankRows(content.Rows)
	if err != nil {
		return bankContent{}, nil, err
	}
	return content, rows, nil
}

// encodeBankRows is the rows field's value, refused with a message when it is
// past the field's maxSize (a 5 MB file of characters JSON escapes can be).
func encodeBankRows(rows []bankRow) (types.JSONRaw, error) {
	if rows == nil {
		rows = []bankRow{}
	}
	raw, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("books: encode the file's rows: %w", err)
	}
	if len(raw) > maxBankContentBytes {
		return nil, refuse(msgBankContentTooLarge)
	}
	return types.JSONRaw(raw), nil
}

// saveBankContent stores the file's parsed rows, inside the file's transaction.
func saveBankContent(tx core.App, file *core.Record, columns int, rows types.JSONRaw) error {
	col, err := tx.FindCollectionByNameOrId("books_bank_file_contents")
	if err != nil {
		return fmt.Errorf("books: find books_bank_file_contents: %w", err)
	}
	r := core.NewRecord(col)
	r.Set("file", file.Id)
	r.Set("columns", columns)
	r.Set("rows", rows)
	if err := tx.Save(r); err != nil {
		return fmt.Errorf("books: store the rows of %s: %w", file.GetString("name"), err)
	}
	return nil
}

// stampStatement records an OFX file's ledger balance and its day; a file
// without one (every CSV file) gets 0 and "".
func stampStatement(r *core.Record, c bankContent) {
	if c.StatementBalance == nil {
		r.Set("statement_balance", 0)
		r.Set("statement_date", "")
		return
	}
	r.Set("statement_balance", *c.StatementBalance)
	r.Set("statement_date", c.StatementDate)
}
```

- [ ] **Step 6: Run the Go banking tests**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBank|TestRace_|TestEncodeBankRows_|TestAccountGuards_|TestAudit_LabelsBankRecords|TestRegister_' -count=1 .`
Expected: PASS (new and existing banking tests, the 5 MB test included).

- [ ] **Step 7: Update the client fixture and collections**

In `tinycld/books/lib/bank-connection-fixture.ts`, in `bankFile(...)`'s returned object add `statement_balance: 0,` and `statement_date: '',` after `status: 'uploaded',`.

In `tinycld/books/collections.ts`, add `'statement_balance',` and `'statement_date',` at the end of `books_bank_files`' `omitOnInsert`; in `tests/collections.test.ts` add the same two strings at the end of the expected `books_bank_files` omit list.

Run: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/vitest run tests/collections.test.ts tests/bank-connection-fixture.test.ts tests/bank-connections.test.ts`
Expected: PASS. Run the typecheck and biome on the three TS files. Expected: clean.

- [ ] **Step 8: Run the upload e2e spec**

The upload hook now parses every file, so the existing upload flow must still pass. Check ports 7220/7221 first (rules file), then:
Run: `cd /Users/nas/tmp/tinycld/books-reports/books && E2E_PORT=7220 E2E_PORT_2=7221 pnpm exec tinycld-pkg test:e2e -- banking-upload.spec.ts`
Expected: all pass. A file the spec uploads that the parser now refuses is a parser bug unless the file breaks a rule of this plan (then name it in your report).

- [ ] **Step 9: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add pb-migrations/2100000008_create_books_banking.js server/ledger.go server/banking.go server/bank_contents_test.go server/banking_upload_test.go tinycld/books/lib/bank-connection-fixture.ts tinycld/books/collections.ts tests/collections.test.ts && git commit -m "feat(books): store a bank file's rows when it is uploaded"
```

---

### Task 6: Import mapping and dedupe hashes (pure Go)

**Files:**
- Create: `server/bank_import_map.go`
- Create: `server/bank_import_map_test.go`
- Modify: `server/testdata/bank_import_vectors.json` (add `ofxMapping`, `rows`)
- Modify: `server/bank_values_test.go` (add `OFXMapping` and `Rows` to `bankVectors`)

**Interfaces:**
- Consumes: `parseBankDate`, `parseBankAmount`, `bankDateFormats` (Task 2); `bankRow` (Task 3); `truncateRunes` (server/banking.go); `refuseField` (server/errors.go); `requireFieldRefusal` (server/customers_test.go).
- Produces:
  - `type bankMapping struct` with JSON tags `header_row`, `date_column`, `date_format`, `description_column`, `amount_columns`, `amount_column`, `money_in_column`, `money_out_column`, `amount_sign`, `memo_column`, `fitid_column`, `check_column` (columns 1-based, 0 = none).
  - `var ofxMapping bankMapping` — `{DateColumn:1, DateFormat:"YYYY-MM-DD", DescriptionColumn:2, MemoColumn:3, AmountColumns:"one", AmountColumn:4, AmountSign:"in_positive", FitIDColumn:5, CheckColumn:6}`.
  - `func mappingFromRecord(r *core.Record, format string) bankMapping` (OFX → `ofxMapping`; empty `amount_sign` → `in_positive`); `func (m bankMapping) writeTo(r *core.Record)`.
  - `func checkMapping(m bankMapping, columns int) error` — field refusals (messages below).
  - `type bankTxn struct { Date, Description, Memo string; Amount int64; FitID, CheckNumber string }` (JSON tags `date`, `description`, `memo`, `amount`, `fitid`, `checkNumber`); `type bankRowResult struct { Line int; Txn bankTxn; Err string }`.
  - `func mapBankRow(cells []string, m bankMapping) (bankTxn, error)`; `func mapBankRows(rows []bankRow, m bankMapping) (header int, results []bankRowResult)` (header = the header row's line, 0 when none).
  - `func bankRowHashes(connectionID string, results []bankRowResult) map[int]string` — line → hex sha256; error rows get none.
  - Messages: `msgBankZeroAmount = "The amount is 0."`, `msgBankTwoAmounts = "Both money in and money out have an amount."`, `msgImportChooseDate = "Choose the column that holds the date."`, `msgImportChooseFormat = "Choose the date format of your file."`, `msgImportChooseDescription = "Choose the column that holds the description."`, `msgImportChooseAmountColumns = "Choose how many columns show amounts."`, `msgImportChooseAmount = "Choose the column that holds the amount."`, `msgImportChooseIn = "Choose the column that holds money in."`, `msgImportChooseOut = "Choose the column that holds money out."`, `msgImportSameInOut = "Money in and money out must be different columns."`, `msgImportChooseSign = "Choose whether a positive amount is money in or money out."`, `msgImportNoColumn = "Column %d is not in this file."`.

- [ ] **Step 1: Add the row vectors**

In `server/bank_values_test.go`, add two fields at the end of `bankVectors`: `OFXMapping bankMapping \`json:"ofxMapping"\`` and `Rows []bankRowVector \`json:"rows"\`` (`bankRowVector` is declared in Step 2).

In `server/testdata/bank_import_vectors.json`, add after `"amounts": [...]` (keep the JSON valid):

```json
    "ofxMapping": {
        "header_row": false,
        "date_column": 1,
        "date_format": "YYYY-MM-DD",
        "description_column": 2,
        "memo_column": 3,
        "amount_columns": "one",
        "amount_column": 4,
        "money_in_column": 0,
        "money_out_column": 0,
        "amount_sign": "in_positive",
        "fitid_column": 5,
        "check_column": 6
    },
    "rows": [
        {
            "name": "one amount column",
            "cells": ["09/02/2026", " Deposit - Harbor Design ", "4,250.00"],
            "mapping": { "date_column": 1, "date_format": "MM/DD/YYYY", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive" },
            "txn": { "date": "2026-09-02", "description": "Deposit - Harbor Design", "memo": "", "amount": 425000, "fitid": "", "checkNumber": "" }
        },
        {
            "name": "a card export lists charges as positive",
            "cells": ["2026-09-05", "Office Depot", "86.47"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "out_positive" },
            "txn": { "date": "2026-09-05", "description": "Office Depot", "memo": "", "amount": -8647, "fitid": "", "checkNumber": "" }
        },
        {
            "name": "two columns, money out",
            "cells": ["2026-09-05", "Office Depot", "", "86.47"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "two", "money_in_column": 3, "money_out_column": 4 },
            "txn": { "date": "2026-09-05", "description": "Office Depot", "memo": "", "amount": -8647, "fitid": "", "checkNumber": "" }
        },
        {
            "name": "two columns, money out written negative",
            "cells": ["2026-09-30", "Monthly service fee", "", "-12.00"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "two", "money_in_column": 3, "money_out_column": 4 },
            "txn": { "date": "2026-09-30", "description": "Monthly service fee", "memo": "", "amount": -1200, "fitid": "", "checkNumber": "" }
        },
        {
            "name": "two columns, money in, the other column 0",
            "cells": ["2026-09-02", "Deposit", "4250.00", "0.00"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "two", "money_in_column": 3, "money_out_column": 4 },
            "txn": { "date": "2026-09-02", "description": "Deposit", "memo": "", "amount": 425000, "fitid": "", "checkNumber": "" }
        },
        {
            "name": "two columns, both have an amount",
            "cells": ["2026-09-05", "x", "1.00", "2.00"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "two", "money_in_column": 3, "money_out_column": 4 },
            "error": "Both money in and money out have an amount."
        },
        {
            "name": "two columns, neither has an amount",
            "cells": ["2026-09-05", "x", "", ""],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "two", "money_in_column": 3, "money_out_column": 4 },
            "error": "There is no amount."
        },
        {
            "name": "a zero amount",
            "cells": ["2026-09-30", "Padding", "0.00"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive" },
            "error": "The amount is 0."
        },
        {
            "name": "the date error comes first",
            "cells": ["13/45/2026", "x", "abc"],
            "mapping": { "date_column": 1, "date_format": "MM/DD/YYYY", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive" },
            "error": "\"13/45/2026\" is not a date in the MM/DD/YYYY format."
        },
        {
            "name": "an amount error",
            "cells": ["2026-09-02", "x", "12.345"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive" },
            "error": "\"12.345\" has more than 2 decimals."
        },
        {
            "name": "a short row",
            "cells": ["2026-09-02"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive" },
            "error": "There is no amount."
        },
        {
            "name": "an OFX row",
            "cells": ["2026-10-03", "Smith & Sons", "Invoice 1042", "-250.00", "A1", "1001", "CHECK"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "memo_column": 3, "amount_columns": "one", "amount_column": 4, "amount_sign": "in_positive", "fitid_column": 5, "check_column": 6 },
            "txn": { "date": "2026-10-03", "description": "Smith & Sons", "memo": "Invoice 1042", "amount": -25000, "fitid": "A1", "checkNumber": "1001" }
        },
        {
            "name": "an OFX row with a bad date",
            "cells": ["2026", "Fee", "", "-1.00", "A3", "", "FEE"],
            "mapping": { "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "memo_column": 3, "amount_columns": "one", "amount_column": 4, "amount_sign": "in_positive", "fitid_column": 5, "check_column": 6 },
            "error": "\"2026\" is not a date in the YYYY-MM-DD format."
        }
    ]
```

- [ ] **Step 2: Write the failing tests**

Create `server/bank_import_map_test.go`:

```go
package books

import (
	"strings"
	"testing"
)

// bankRowVector is one row case of testdata/bank_import_vectors.json.
type bankRowVector struct {
	Name    string      `json:"name"`
	Cells   []string    `json:"cells"`
	Mapping bankMapping `json:"mapping"`
	Txn     *bankTxn    `json:"txn"`
	Error   string      `json:"error"`
}

func TestMapBankRow_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Rows) == 0 {
		t.Fatal("no row vectors")
	}
	for _, c := range v.Rows {
		t.Run(c.Name, func(t *testing.T) {
			got, err := mapBankRow(c.Cells, c.Mapping)
			if c.Error != "" {
				if err == nil || err.Error() != c.Error {
					t.Errorf("mapBankRow = %#v, %v; want error %q", got, err, c.Error)
				}
				return
			}
			if err != nil || c.Txn == nil || got != *c.Txn {
				t.Errorf("mapBankRow = %#v, %v; want %#v", got, err, c.Txn)
			}
		})
	}
}

func TestOFXMapping_MatchesTheVectors(t *testing.T) {
	if v := loadBankVectors(t); v.OFXMapping != ofxMapping {
		t.Errorf("ofxMapping = %#v, vectors say %#v", ofxMapping, v.OFXMapping)
	}
}

func TestMapBankRow_CutsLongText(t *testing.T) {
	long := strings.Repeat("é", 600)
	m := ofxMapping
	got, err := mapBankRow([]string{"2026-10-03", long, long, "-1.00", strings.Repeat("f", 300), strings.Repeat("9", 40)}, m)
	if err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(got.Description)); n != 500 {
		t.Errorf("description has %d runes, want 500", n)
	}
	if n := len([]rune(got.Memo)); n != 500 {
		t.Errorf("memo has %d runes, want 500", n)
	}
	if len(got.FitID) != 255 || len(got.CheckNumber) != 32 {
		t.Errorf("fitid %d, check %d; want 255 and 32", len(got.FitID), len(got.CheckNumber))
	}
}

func csvMapping() bankMapping {
	return bankMapping{HeaderRow: true, DateColumn: 1, DateFormat: "YYYY-MM-DD", DescriptionColumn: 2,
		AmountColumns: "one", AmountColumn: 3, AmountSign: "in_positive"}
}

func TestCheckMapping_Refusals(t *testing.T) {
	cases := []struct {
		name   string
		edit   func(m *bankMapping)
		field  string
		want   string
	}{
		{"no date column", func(m *bankMapping) { m.DateColumn = 0 }, "date_column", "Choose the column that holds the date."},
		{"date column past the file", func(m *bankMapping) { m.DateColumn = 9 }, "date_column", "Column 9 is not in this file."},
		{"no date format", func(m *bankMapping) { m.DateFormat = "" }, "date_format", "Choose the date format of your file."},
		{"no description column", func(m *bankMapping) { m.DescriptionColumn = 0 }, "description_column", "Choose the column that holds the description."},
		{"no amount layout", func(m *bankMapping) { m.AmountColumns = "" }, "amount_columns", "Choose how many columns show amounts."},
		{"no amount column", func(m *bankMapping) { m.AmountColumn = 0 }, "amount_column", "Choose the column that holds the amount."},
		{"amount column past the file", func(m *bankMapping) { m.AmountColumn = 4 }, "amount_column", "Column 4 is not in this file."},
		{"bad sign", func(m *bankMapping) { m.AmountSign = "sideways" }, "amount_sign", "Choose whether a positive amount is money in or money out."},
		{"no money in", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyOutColumn = 3 }, "money_in_column", "Choose the column that holds money in."},
		{"no money out", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyInColumn = 3 }, "money_out_column", "Choose the column that holds money out."},
		{"in and out the same", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyInColumn = 3; m.MoneyOutColumn = 3 }, "money_out_column", "Money in and money out must be different columns."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m := csvMapping()
			c.edit(&m)
			requireFieldRefusal(t, checkMapping(m, 3), c.field, c.want)
		})
	}
	if err := checkMapping(csvMapping(), 3); err != nil {
		t.Errorf("a complete mapping was refused: %v", err)
	}
	two := csvMapping()
	two.AmountColumns, two.AmountColumn, two.MoneyInColumn, two.MoneyOutColumn = "two", 0, 3, 2
	if err := checkMapping(two, 3); err != nil {
		t.Errorf("a two-column mapping was refused: %v", err)
	}
	if err := checkMapping(ofxMapping, len(ofxColumns)); err != nil {
		t.Errorf("ofxMapping was refused: %v", err)
	}
}

func TestMapBankRows_HeaderAndErrors(t *testing.T) {
	rows := []bankRow{
		{Line: 1, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 2, Cells: []string{"2026-09-02", "Deposit", "4250.00"}},
		{Line: 4, Cells: []string{"2026-02-30", "Bad", "1.00"}},
	}
	header, results := mapBankRows(rows, csvMapping())
	if header != 1 || len(results) != 2 {
		t.Fatalf("header %d, %d results; want 1 and 2", header, len(results))
	}
	if results[0].Line != 2 || results[0].Err != "" || results[0].Txn.Amount != 425000 {
		t.Errorf("result 0 = %#v", results[0])
	}
	if results[1].Line != 4 || results[1].Err != `"2026-02-30" is not a date in the YYYY-MM-DD format.` {
		t.Errorf("result 1 = %#v", results[1])
	}
	noHeader := csvMapping()
	noHeader.HeaderRow = false
	header, results = mapBankRows(rows, noHeader)
	if header != 0 || len(results) != 3 || results[0].Err == "" {
		t.Errorf("without a header: header %d, results %#v", header, results)
	}
	if header, results := mapBankRows(nil, csvMapping()); header != 0 || len(results) != 0 {
		t.Errorf("no rows: header %d, results %#v", header, results)
	}
}

func TestBankRowHashes(t *testing.T) {
	ok := func(line int, date string, amount int64, description, fitid string) bankRowResult {
		return bankRowResult{Line: line, Txn: bankTxn{Date: date, Amount: amount, Description: description, FitID: fitid}}
	}
	file := []bankRowResult{
		ok(2, "2026-09-06", -2000, "Starbucks", ""),
		ok(3, "2026-09-06", -2000, "STARBUCKS  ", ""),
		{Line: 4, Err: "There is no amount."},
		ok(5, "2026-09-07", -2000, "Starbucks", ""),
		ok(6, "2026-10-03", -25000, "Smith & Sons", "A1"),
	}
	h := bankRowHashes("conn1", file)
	if len(h) != 4 {
		t.Fatalf("%d hashes, want 4 (none for the error row): %v", len(h), h)
	}
	if h[2] == h[3] {
		t.Error("two identical rows of one file share a hash; the second must count as a second occurrence")
	}
	if h[2] == h[5] {
		t.Error("rows on different days share a hash")
	}
	if len(h[2]) != 64 {
		t.Errorf("hash %q is not hex sha256", h[2])
	}
	// The same rows in another file (an overlapping statement) hash the same.
	again := bankRowHashes("conn1", []bankRowResult{ok(10, "2026-09-06", -2000, "starbucks", ""), ok(11, "2026-09-06", -2000, "Starbucks", "")})
	if again[10] != h[2] || again[11] != h[3] {
		t.Error("the same two rows in another file hash differently")
	}
	// A FITID decides alone: the bank's id names the transaction.
	renamed := bankRowHashes("conn1", []bankRowResult{ok(7, "2026-10-04", -25000, "Smith and Sons", "A1")})
	if renamed[7] != h[6] {
		t.Error("an OFX transaction with the same FITID hashes differently")
	}
	// Another connection never matches.
	if other := bankRowHashes("conn2", file); other[2] == h[2] || other[6] == h[6] {
		t.Error("a row hashes the same on another connection")
	}
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestMapBankRow|TestOFXMapping_|TestCheckMapping_|TestMapBankRows_|TestBankRowHashes|TestParseBank' -count=1 .`
Expected: FAIL — `undefined: bankMapping`, `undefined: mapBankRow`, …

- [ ] **Step 4: Write `server/bank_import_map.go`**

```go
// The import's mapping: which column of a bank file's rows holds what, and how
// a row becomes a bank transaction. Pure functions; server/bank_import.go
// reads the rows and writes the transactions. The import preview
// (tinycld/books/lib/bank-import.ts) maps rows the same way, and the row
// vectors in testdata/bank_import_vectors.json run on both sides.

package books

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const (
	// bankHashVersion starts every dedupe key, so a later change of the key
	// can tell old hashes from new ones.
	bankHashVersion         = "books-bank-v1"
	maxBankDescriptionRunes = 500
	maxBankFitIDRunes       = 255
	maxBankCheckRunes       = 32

	msgBankZeroAmount            = "The amount is 0."
	msgBankTwoAmounts            = "Both money in and money out have an amount."
	msgImportChooseDate          = "Choose the column that holds the date."
	msgImportChooseFormat        = "Choose the date format of your file."
	msgImportChooseDescription   = "Choose the column that holds the description."
	msgImportChooseAmountColumns = "Choose how many columns show amounts."
	msgImportChooseAmount        = "Choose the column that holds the amount."
	msgImportChooseIn            = "Choose the column that holds money in."
	msgImportChooseOut           = "Choose the column that holds money out."
	msgImportSameInOut           = "Money in and money out must be different columns."
	msgImportChooseSign          = "Choose whether a positive amount is money in or money out."
	msgImportNoColumn            = "Column %d is not in this file."
)

// bankMapping says which 1-based column holds what (0: none). The first nine
// fields are books_bank_imports fields; memo, FITID and check number are read
// only from an OFX file, whose columns are fixed (ofxMapping).
type bankMapping struct {
	HeaderRow         bool   `json:"header_row"`
	DateColumn        int    `json:"date_column"`
	DateFormat        string `json:"date_format"`
	DescriptionColumn int    `json:"description_column"`
	AmountColumns     string `json:"amount_columns"`
	AmountColumn      int    `json:"amount_column"`
	MoneyInColumn     int    `json:"money_in_column"`
	MoneyOutColumn    int    `json:"money_out_column"`
	AmountSign        string `json:"amount_sign"`
	MemoColumn        int    `json:"memo_column"`
	FitIDColumn       int    `json:"fitid_column"`
	CheckColumn       int    `json:"check_column"`
}

// ofxMapping reads the fixed columns of an OFX row (ofxColumns). OFX amounts
// are signed with money in positive.
var ofxMapping = bankMapping{
	DateColumn: 1, DateFormat: "YYYY-MM-DD", DescriptionColumn: 2, MemoColumn: 3,
	AmountColumns: "one", AmountColumn: 4, AmountSign: "in_positive", FitIDColumn: 5, CheckColumn: 6,
}

// mappingFromRecord is the import row's mapping, or ofxMapping for an OFX
// file, whatever the row says. A blank amount_sign means money in is positive.
func mappingFromRecord(r *core.Record, format string) bankMapping {
	if format == "ofx" {
		return ofxMapping
	}
	m := bankMapping{
		HeaderRow:         r.GetBool("header_row"),
		DateColumn:        r.GetInt("date_column"),
		DateFormat:        r.GetString("date_format"),
		DescriptionColumn: r.GetInt("description_column"),
		AmountColumns:     r.GetString("amount_columns"),
		AmountColumn:      r.GetInt("amount_column"),
		MoneyInColumn:     r.GetInt("money_in_column"),
		MoneyOutColumn:    r.GetInt("money_out_column"),
		AmountSign:        r.GetString("amount_sign"),
	}
	if m.AmountSign == "" {
		m.AmountSign = "in_positive"
	}
	return m
}

// writeTo records the mapping the import used on its row.
func (m bankMapping) writeTo(r *core.Record) {
	r.Set("header_row", m.HeaderRow)
	r.Set("date_column", m.DateColumn)
	r.Set("date_format", m.DateFormat)
	r.Set("description_column", m.DescriptionColumn)
	r.Set("amount_columns", m.AmountColumns)
	r.Set("amount_column", m.AmountColumn)
	r.Set("money_in_column", m.MoneyInColumn)
	r.Set("money_out_column", m.MoneyOutColumn)
	r.Set("amount_sign", m.AmountSign)
}

// checkMapping refuses a mapping that does not name every column it needs, or
// names one past the file's widest row, on the field the mapping form shows.
func checkMapping(m bankMapping, columns int) error {
	if err := checkBankColumn("date_column", m.DateColumn, columns, msgImportChooseDate); err != nil {
		return err
	}
	if !slices.Contains(bankDateFormats, m.DateFormat) {
		return refuseField("date_format", msgImportChooseFormat)
	}
	if err := checkBankColumn("description_column", m.DescriptionColumn, columns, msgImportChooseDescription); err != nil {
		return err
	}
	switch m.AmountColumns {
	case "one":
		if err := checkBankColumn("amount_column", m.AmountColumn, columns, msgImportChooseAmount); err != nil {
			return err
		}
		if m.AmountSign != "in_positive" && m.AmountSign != "out_positive" {
			return refuseField("amount_sign", msgImportChooseSign)
		}
	case "two":
		if err := checkBankColumn("money_in_column", m.MoneyInColumn, columns, msgImportChooseIn); err != nil {
			return err
		}
		if err := checkBankColumn("money_out_column", m.MoneyOutColumn, columns, msgImportChooseOut); err != nil {
			return err
		}
		if m.MoneyInColumn == m.MoneyOutColumn {
			return refuseField("money_out_column", msgImportSameInOut)
		}
	default:
		return refuseField("amount_columns", msgImportChooseAmountColumns)
	}
	return nil
}

func checkBankColumn(field string, column, columns int, choose string) error {
	if column < 1 {
		return refuseField(field, choose)
	}
	if column > columns {
		return refuseField(field, msgImportNoColumn, column)
	}
	return nil
}

// bankTxn is a row read as a bank transaction: amount in signed minor units,
// money in positive.
type bankTxn struct {
	Date        string `json:"date"`
	Description string `json:"description"`
	Memo        string `json:"memo"`
	Amount      int64  `json:"amount"`
	FitID       string `json:"fitid"`
	CheckNumber string `json:"checkNumber"`
}

// bankRowResult is one row mapped: its transaction, or the row's error.
type bankRowResult struct {
	Line int
	Txn  bankTxn
	Err  string
}

// mapBankRows maps every row but the header. header is the header row's line,
// 0 when the mapping has none or the file has no rows.
func mapBankRows(rows []bankRow, m bankMapping) (header int, results []bankRowResult) {
	if m.HeaderRow && len(rows) > 0 {
		header = rows[0].Line
		rows = rows[1:]
	}
	results = make([]bankRowResult, 0, len(rows))
	for _, row := range rows {
		txn, err := mapBankRow(row.Cells, m)
		res := bankRowResult{Line: row.Line, Txn: txn}
		if err != nil {
			res.Err = err.Error()
		}
		results = append(results, res)
	}
	return header, results
}

// mapBankRow reads one row: the date first, then the amount. Text is cut to
// what the transaction fields hold.
func mapBankRow(cells []string, m bankMapping) (bankTxn, error) {
	date, err := parseBankDate(bankCell(cells, m.DateColumn), m.DateFormat)
	if err != nil {
		return bankTxn{}, err
	}
	amount, err := bankRowAmount(cells, m)
	if err != nil {
		return bankTxn{}, err
	}
	return bankTxn{
		Date:        date,
		Description: truncateRunes(bankCell(cells, m.DescriptionColumn), maxBankDescriptionRunes),
		Memo:        truncateRunes(bankCell(cells, m.MemoColumn), maxBankDescriptionRunes),
		Amount:      amount,
		FitID:       truncateRunes(bankCell(cells, m.FitIDColumn), maxBankFitIDRunes),
		CheckNumber: truncateRunes(bankCell(cells, m.CheckColumn), maxBankCheckRunes),
	}, nil
}

// bankCell is the trimmed cell of a 1-based column, "" past the row's end.
func bankCell(cells []string, column int) string {
	if column < 1 || column > len(cells) {
		return ""
	}
	return strings.TrimSpace(cells[column-1])
}

// bankRowAmount is the row's signed amount. Two columns: money in minus money
// out, their signs ignored (banks write money out either way). One column:
// signed as written, flipped when positive means money out.
func bankRowAmount(cells []string, m bankMapping) (int64, error) {
	var amount int64
	if m.AmountColumns == "two" {
		in, out := bankCell(cells, m.MoneyInColumn), bankCell(cells, m.MoneyOutColumn)
		if in == "" && out == "" {
			return 0, errors.New(msgBankNoAmount)
		}
		var inCents, outCents int64
		if in != "" {
			v, err := parseBankAmount(in)
			if err != nil {
				return 0, err
			}
			inCents = absCents(v)
		}
		if out != "" {
			v, err := parseBankAmount(out)
			if err != nil {
				return 0, err
			}
			outCents = absCents(v)
		}
		if inCents != 0 && outCents != 0 {
			return 0, errors.New(msgBankTwoAmounts)
		}
		amount = inCents - outCents
	} else {
		v, err := parseBankAmount(bankCell(cells, m.AmountColumn))
		if err != nil {
			return 0, err
		}
		amount = v
		if m.AmountSign == "out_positive" {
			amount = -amount
		}
	}
	if amount == 0 {
		return 0, errors.New(msgBankZeroAmount)
	}
	return amount, nil
}

func absCents(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

// bankRowHashes keys each mapped row (by line) for dedupe on the connection.
// An OFX transaction is its FITID: the bank's own id. Any other row is its
// date, amount and description (case and spacing folded) and its occurrence
// among the identical rows before it in the file, so two real purchases alike
// in one file stay two, and the same two in an overlapping statement match.
// Error rows have no key.
func bankRowHashes(connectionID string, results []bankRowResult) map[int]string {
	hashes := make(map[int]string, len(results))
	seen := map[string]int{}
	for _, res := range results {
		if res.Err != "" {
			continue
		}
		var key string
		if res.Txn.FitID != "" {
			key = strings.Join([]string{bankHashVersion, connectionID, "fitid", res.Txn.FitID}, "\x1f")
		} else {
			base := strings.Join([]string{
				bankHashVersion, connectionID, "row", res.Txn.Date,
				strconv.FormatInt(res.Txn.Amount, 10), foldBankDescription(res.Txn.Description),
			}, "\x1f")
			seen[base]++
			key = base + "\x1f" + strconv.Itoa(seen[base])
		}
		sum := sha256.Sum256([]byte(key))
		hashes[res.Line] = hex.EncodeToString(sum[:])
	}
	return hashes
}

// foldBankDescription ignores case and spacing, which differ between a bank's
// exports of one transaction.
func foldBankDescription(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestMapBankRow|TestOFXMapping_|TestCheckMapping_|TestMapBankRows_|TestBankRowHashes|TestParseBank' -count=1 .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add server/bank_import_map.go server/bank_import_map_test.go server/bank_values_test.go server/testdata/bank_import_vectors.json && git commit -m "feat(books): map bank rows and key them for dedupe"
```

---

### Task 7: The import hook

**Files:**
- Create: `server/bank_import.go`
- Create: `server/bank_import_test.go`
- Modify: `server/banking.go` (bind the import hooks)

**Interfaces:**
- Consumes: `serializedThen` (Task 5); `mappingFromRecord`, `checkMapping`, `mapBankRows`, `bankRowHashes`, `bankRowResult`, `bankTxn` (Task 6); `stampActor`; `bankFileStatusUploaded`; test helpers `newBankEnv`, `bankEnv`, `apiReq`, `tokenFor`, `bindRace`, `requireRefused`, `requireFieldRefusal`, `reload`, `ofxStatement`, `lineOf`, `sha256Hex`, `bankCSV`.
- Produces:
  - `func registerBankImport(app core.App)` — called from `registerBanking`, so `registerLedger` binds it once (`TestRegister_BindsEachPartOnce` needs no change).
  - `func planBankImport(tx core.App, r *core.Record) (bankImportPlan, error)`; `func applyBankImport(tx core.App, r *core.Record, plan bankImportPlan) error`.
  - Constants `bankFileStatusImported = "imported"`, `bankTxnStatusForReview = "for_review"`.
  - Messages `msgImportFileMissing = "The bank file does not exist."` (field `file`), `msgImportNoLines = "Choose at least one transaction to import."` (field `lines`), `msgImportLinesFormat = "Send the lines to import as a list of line numbers."` (field `lines`), `msgImportHeaderLine = "Line %d is the header row."` (field `lines`), `msgImportUnknownLine = "Line %d is not a transaction in this file."` (field `lines`), `msgImportRowError = "Line %d: %s"`, `msgImportOneMoreError = " 1 more chosen line has an error."`, `msgImportMoreErrors = " %d more chosen lines have errors."` (top-level).
  - After a successful import: one `books_bank_transactions` row per new chosen line (`status` `for_review`), the import row's `imported`/`duplicates`/`created_by` stamped and its mapping written back, and the file's `status` `imported`.

- [ ] **Step 1: Write the failing tests**

Create `server/bank_import_test.go`:

```go
package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// saveBankFileBytes stores data as a bank file on the model path (no request
// hook), the way saveBankFile does, so the upload hook parses these bytes.
func saveBankFileBytes(t testing.TB, app core.App, connectionID, name, format, data string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("books_bank_files")
	if err != nil {
		t.Fatal(err)
	}
	f, err := filesystem.NewFileFromBytes([]byte(data), name)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Set("connection", connectionID)
	r.Set("file", f)
	r.Set("name", name)
	r.Set("format", format)
	r.Set("size", len(data))
	r.Set("content_hash", sha256Hex([]byte(data)))
	r.Set("status", bankFileStatusUploaded)
	if err := app.Save(r); err != nil {
		t.Fatalf("save bank file %s: %v", name, err)
	}
	return r
}

// csvImport is an import of a YYYY-MM-DD, description, amount CSV with a
// header row.
func csvImport(fileID string, lines ...int) map[string]any {
	return map[string]any{
		"file": fileID, "header_row": true, "date_column": 1, "date_format": "YYYY-MM-DD",
		"description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive",
		"lines": lines,
	}
}

// saveImport creates an import on the model path and returns its error, so a
// refusal or a racing goroutine can read it.
func saveImport(app core.App, fields map[string]any) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_bank_imports")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	if err := app.Save(r); err != nil {
		return nil, err
	}
	return r, nil
}

func mustImport(t testing.TB, app core.App, fields map[string]any) *core.Record {
	t.Helper()
	r, err := saveImport(app, fields)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	return r
}

func requireCounts(t testing.TB, r *core.Record, imported, duplicates int) {
	t.Helper()
	if r.GetInt("imported") != imported || r.GetInt("duplicates") != duplicates {
		t.Errorf("imported %d, duplicates %d; want %d and %d", r.GetInt("imported"), r.GetInt("duplicates"), imported, duplicates)
	}
}

func bankTxns(t testing.TB, app core.App, connectionID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("books_bank_transactions", "connection = {:c}", "date,line", 0, 0, dbx.Params{"c": connectionID})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestBankImport_ImportsTheChosenLines(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	body := fmt.Sprintf(`{"id":"bankimport00001","file":%q,"header_row":true,"date_column":1,"date_format":"YYYY-MM-DD","description_column":2,"amount_columns":"one","amount_column":3,"amount_sign":"in_positive","lines":[2,3,4]}`, file.Id)
	apiReq{
		method: http.MethodPost,
		url:    collectionURL("books_bank_imports"),
		token:  tokenFor(t, env.users.bookkeeper),
		body:   body,
		want:   http.StatusOK,
		content: []string{`"imported":3`, `"duplicates":0`},
		after: func(t testing.TB, app *tests.TestApp) {
			imp := reload(t, app, "books_bank_imports", "bankimport00001")
			requireCounts(t, imp, 3, 0)
			if got := imp.GetString("created_by"); got != env.users.bookkeeper.Id {
				t.Errorf("created_by = %q, want the bookkeeper", got)
			}
			if got := reload(t, app, "books_bank_files", file.Id).GetString("status"); got != "imported" {
				t.Errorf("file status = %q, want imported", got)
			}
			txns := bankTxns(t, app, env.connection.Id)
			if len(txns) != 3 {
				t.Fatalf("%d transactions, want 3", len(txns))
			}
			first := txns[0]
			want := map[string]any{
				"line": 2, "date": "2026-09-02", "description": "Deposit - Harbor Design client payment",
				"amount": 425000, "status": "for_review", "file": file.Id, "bank_import": "bankimport00001",
			}
			got := map[string]any{
				"line": first.GetInt("line"), "date": first.GetString("date"), "description": first.GetString("description"),
				"amount": first.GetInt("amount"), "status": first.GetString("status"), "file": first.GetString("file"),
				"bank_import": first.GetString("bank_import"),
			}
			for k, v := range want {
				if got[k] != v {
					t.Errorf("%s = %#v, want %#v", k, got[k], v)
				}
			}
			if len(first.GetString("dedupe_hash")) != 64 {
				t.Errorf("dedupe_hash = %q", first.GetString("dedupe_hash"))
			}
			if txns[1].GetInt("amount") != -8647 {
				t.Errorf("line 3 amount = %d, want -8647", txns[1].GetInt("amount"))
			}
		},
	}.run(t, env.app)
}

func TestBankImport_SameLinesTwiceAddNothing(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3, 4)), 3, 0)
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3, 4, 5)), 1, 3)
	// Another mapping of the same lines still adds nothing: a line is imported once.
	other := csvImport(file.Id, 2, 3)
	other["amount_sign"] = "out_positive"
	requireCounts(t, mustImport(t, env.app, other), 0, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 4 {
		t.Errorf("%d transactions, want 4", n)
	}
}

func TestBankImport_OverlappingStatementAddsOnlyNewRows(t *testing.T) {
	env := newBankEnv(t)
	first := saveBankFileBytes(t, env.app, env.connection.Id, "sep-1.csv", "csv",
		"Date,Description,Amount\n2026-09-02,Deposit,4250.00\n2026-09-05,Office Depot,-86.47\n")
	requireCounts(t, mustImport(t, env.app, csvImport(first.Id, 2, 3)), 2, 0)
	// The next export repeats 09-05 with other spacing and case, and adds 09-09.
	second := saveBankFileBytes(t, env.app, env.connection.Id, "sep-2.csv", "csv",
		"Date,Description,Amount\n2026-09-05,OFFICE  DEPOT,-86.47\n2026-09-09,Card payment,-1200.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(second.Id, 2, 3)), 1, 1)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 3 {
		t.Errorf("%d transactions, want 3", n)
	}
}

func TestBankImport_KeepsIdenticalRowsOfOneFile(t *testing.T) {
	env := newBankEnv(t)
	first := saveBankFileBytes(t, env.app, env.connection.Id, "a.csv", "csv",
		"Date,Description,Amount\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(first.Id, 2, 3)), 2, 0)
	second := saveBankFileBytes(t, env.app, env.connection.Id, "b.csv", "csv",
		"Date,Description,Amount\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(second.Id, 2, 3, 4)), 1, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 3 {
		t.Errorf("%d transactions, want 3", n)
	}
}

func TestBankImport_RefusesABadDateAndImportsNothing(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "bad.csv", "csv",
		"Date,Description,Amount\n09/02/2026,Deposit,4250.00\n13/45/2026,Bad,-1.00\n09/05/2026,Office Depot,-86.47\n02/30/2026,Also bad,-2.00\n")
	fields := csvImport(file.Id, 2, 3, 4, 5)
	fields["date_format"] = "MM/DD/YYYY"
	_, err := saveImport(env.app, fields)
	requireRefused(t, err, `Line 3: "13/45/2026" is not a date in the MM/DD/YYYY format. 1 more chosen line has an error.`)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 0 {
		t.Errorf("%d transactions after a refused import, want 0", n)
	}
	if n, _ := env.app.CountRecords("books_bank_imports"); n != 0 {
		t.Errorf("%d import rows after a refused import, want 0", n)
	}
	if got := reload(t, env.app, "books_bank_files", file.Id).GetString("status"); got != "uploaded" {
		t.Errorf("file status = %q after a refused import, want uploaded", got)
	}
	fields["lines"] = []int{2, 4}
	requireCounts(t, mustImport(t, env.app, fields), 2, 0)
}

func TestBankImport_TwoMoreErrors(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "bad.csv", "csv",
		"Date,Description,Amount\n2026-09-02,a,\n2026-09-03,b,\n2026-09-04,c,\n")
	_, err := saveImport(env.app, csvImport(file.Id, 2, 3, 4))
	requireRefused(t, err, "Line 2: There is no amount. 2 more chosen lines have errors.")
}

func TestBankImport_LineAndMappingRefusals(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	cases := []struct {
		name  string
		edit  func(f map[string]any)
		field string
		want  string
	}{
		{"no lines", func(f map[string]any) { f["lines"] = []int{} }, "lines", "Choose at least one transaction to import."},
		{"lines not numbers", func(f map[string]any) { f["lines"] = []string{"a"} }, "lines", "Send the lines to import as a list of line numbers."},
		{"the header line", func(f map[string]any) { f["lines"] = []int{1, 2} }, "lines", "Line 1 is the header row."},
		{"a line not in the file", func(f map[string]any) { f["lines"] = []int{2, 99} }, "lines", "Line 99 is not a transaction in this file."},
		{"no date column", func(f map[string]any) { f["date_column"] = 0 }, "date_column", "Choose the column that holds the date."},
		{"a missing file", func(f map[string]any) { f["file"] = "nosuchfile00001" }, "file", "The bank file does not exist."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fields := csvImport(file.Id, 2)
			c.edit(fields)
			_, err := saveImport(env.app, fields)
			requireFieldRefusal(t, err, c.field, c.want)
		})
	}
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 0 {
		t.Errorf("%d transactions after refused imports, want 0", n)
	}
}

func TestBankImport_OFXUsesItsOwnColumns(t *testing.T) {
	env := newBankEnv(t)
	data := ofxStatement(
		"<STMTTRN>\n<TRNTYPE>CHECK\n<DTPOSTED>20261003\n<TRNAMT>-250.00\n<FITID>A1\n<CHECKNUM>1001\n<NAME>Smith &amp; Sons\n<MEMO>Invoice 1042\n</STMTTRN>\n" +
			"<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261004\n<TRNAMT>3100.00\n<FITID>A2\n<NAME>Harbor Design\n</STMTTRN>\n")
	file := saveBankFileBytes(t, env.app, env.connection.Id, "oct.qfx", "ofx", data)
	// The client's mapping is ignored for an OFX file.
	imp := mustImport(t, env.app, map[string]any{
		"file": file.Id, "date_column": 0, "lines": []int{lineOf(data, "<STMTTRN>", 0), lineOf(data, "<STMTTRN>", 1)},
	})
	requireCounts(t, imp, 2, 0)
	if imp.GetString("date_format") != "YYYY-MM-DD" || imp.GetInt("amount_column") != 4 {
		t.Errorf("the import row does not record the OFX mapping: %s %d", imp.GetString("date_format"), imp.GetInt("amount_column"))
	}
	txns := bankTxns(t, env.app, env.connection.Id)
	if len(txns) != 2 {
		t.Fatalf("%d transactions, want 2", len(txns))
	}
	got := []string{txns[0].GetString("description"), txns[0].GetString("memo"), txns[0].GetString("fitid"), txns[0].GetString("check_number")}
	if want := []string{"Smith & Sons", "Invoice 1042", "A1", "1001"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("OFX fields = %v, want %v", got, want)
	}
	// A later statement repeats FITID A2 with a corrected name: still a duplicate.
	later := ofxStatement("<STMTTRN>\n<DTPOSTED>20261004\n<TRNAMT>3100.00\n<FITID>A2\n<NAME>HARBOR DESIGN LLC\n</STMTTRN>\n" +
		"<STMTTRN>\n<DTPOSTED>20261006\n<TRNAMT>-9.99\n<FITID>A3\n<NAME>Fee\n</STMTTRN>\n")
	next := saveBankFileBytes(t, env.app, env.connection.Id, "nov.qfx", "ofx", later)
	requireCounts(t, mustImport(t, env.app, map[string]any{
		"file": next.Id, "lines": []int{lineOf(later, "<STMTTRN>", 0), lineOf(later, "<STMTTRN>", 1)},
	}), 1, 1)
}

// Two imports of the same lines at once: the second must see the first's
// transactions and count them as duplicates, not reach the unique indexes.
func TestRace_TheSameLinesImportedTwice(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	var racedImport *core.Record
	raced := bindRace(t, env.app.OnRecordCreate("books_bank_imports"), func() error {
		r, err := saveImport(env.app, csvImport(file.Id, 2, 3))
		racedImport = r
		return err
	})
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3)), 2, 0)
	if err := raced(); err != nil {
		t.Fatalf("the raced import: %v", err)
	}
	requireCounts(t, racedImport, 0, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 2 {
		t.Errorf("%d transactions, want 2", n)
	}
}

// An imported file makes its connection permanent (p4-bank-connection's
// contract), and a reader cannot import.
func TestBankImport_AfterImport(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	mustImport(t, env.app, csvImport(file.Id, 2))
	requireRefused(t, env.app.Delete(env.connection), "1000 Business Checking has imported transactions, so it cannot be disconnected.")
	apiReq{
		method: http.MethodPost,
		url:    collectionURL("books_bank_imports"),
		token:  tokenFor(t, env.users.readOnly),
		body:   fmt.Sprintf(`{"file":%q,"lines":[3]}`, file.Id),
		want:   http.StatusBadRequest,
	}.run(t, env.app)
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBankImport_|TestRace_TheSameLinesImportedTwice' -count=1 .`
Expected: FAIL — imports save with no transactions (no hook yet): counts 0, `requireRefused` gets no refusal.

- [ ] **Step 3: Write `server/bank_import.go`**

```go
// The import of chosen lines of a stored bank file. A person creates a
// books_bank_imports row with the column mapping and the line numbers; the
// create hook below turns those lines into bank transactions waiting for
// review, skipping every line that is already in Books.

package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	bankFileStatusImported = "imported"
	bankTxnStatusForReview = "for_review"
	// bankHashLookupChunk bounds one IN (...) of the dedupe lookup.
	bankHashLookupChunk = 500

	msgImportFileMissing  = "The bank file does not exist."
	msgImportNoLines      = "Choose at least one transaction to import."
	msgImportLinesFormat  = "Send the lines to import as a list of line numbers."
	msgImportHeaderLine   = "Line %d is the header row."
	msgImportUnknownLine  = "Line %d is not a transaction in this file."
	msgImportRowError     = "Line %d: %s"
	msgImportOneMoreError = " 1 more chosen line has an error."
	msgImportMoreErrors   = " %d more chosen lines have errors."
)

// bankNewTxn is a chosen line that is not in Books yet.
type bankNewTxn struct {
	line int
	txn  bankTxn
	hash string
}

// bankImportPlan is what an import writes once its row is saved.
type bankImportPlan struct {
	file       *core.Record
	connection string
	rows       []bankNewTxn
}

// registerBankImport stamps the importer on a request, and runs the import
// on every create (a Go caller's too) inside serializedThen: the dedupe check
// reads the transactions already stored, so two imports of the same lines
// must not both pass it, and the transactions must exist with the import row
// or not at all.
func registerBankImport(app core.App) {
	app.OnRecordCreateRequest("books_bank_imports").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate("books_bank_imports").BindFunc(func(e *core.RecordEvent) error {
		var plan bankImportPlan
		return serializedThen(e,
			func(tx core.App) error {
				p, err := planBankImport(tx, e.Record)
				plan = p
				return err
			},
			func(tx core.App) error { return applyBankImport(tx, e.Record, plan) })
	})
}

// planBankImport checks the import and works out which chosen lines are new.
// It refuses the whole import when a chosen line has an error, and stamps the
// counts and the mapping it used on the import row.
func planBankImport(tx core.App, r *core.Record) (bankImportPlan, error) {
	file, err := tx.FindRecordById("books_bank_files", r.GetString("file"))
	if errors.Is(err, sql.ErrNoRows) {
		return bankImportPlan{}, refuseField("file", msgImportFileMissing)
	}
	if err != nil {
		return bankImportPlan{}, fmt.Errorf("books: read the file to import: %w", err)
	}
	contents, err := tx.FindFirstRecordByData("books_bank_file_contents", "file", file.Id)
	if err != nil {
		return bankImportPlan{}, fmt.Errorf("books: read the rows of bank file %s: %w", file.Id, err)
	}
	var rows []bankRow
	if err := contents.UnmarshalJSONField("rows", &rows); err != nil {
		return bankImportPlan{}, fmt.Errorf("books: decode the rows of bank file %s: %w", file.Id, err)
	}
	m := mappingFromRecord(r, file.GetString("format"))
	if err := checkMapping(m, contents.GetInt("columns")); err != nil {
		return bankImportPlan{}, err
	}
	m.writeTo(r)
	header, results := mapBankRows(rows, m)
	chosen, err := chosenBankLines(r, header, results)
	if err != nil {
		return bankImportPlan{}, err
	}
	if err := refuseBankRowErrors(chosen); err != nil {
		return bankImportPlan{}, err
	}
	connection := file.GetString("connection")
	hashes := bankRowHashes(connection, results)
	taken, err := importedBankLines(tx, file.Id)
	if err != nil {
		return bankImportPlan{}, err
	}
	known, err := knownBankHashes(tx, chosen, hashes)
	if err != nil {
		return bankImportPlan{}, err
	}
	plan := bankImportPlan{file: file, connection: connection}
	duplicates := 0
	for _, res := range chosen {
		hash := hashes[res.Line]
		if taken[res.Line] || known[hash] {
			duplicates++
			continue
		}
		// A FITID repeated inside one file counts once.
		known[hash] = true
		plan.rows = append(plan.rows, bankNewTxn{line: res.Line, txn: res.Txn, hash: hash})
	}
	r.Set("imported", len(plan.rows))
	r.Set("duplicates", duplicates)
	return plan, nil
}

// chosenBankLines is the mapped row of every chosen line, in line order, each
// once. The header line and a line that is not a row of the file are refused.
func chosenBankLines(r *core.Record, header int, results []bankRowResult) ([]bankRowResult, error) {
	var lines []int
	if err := r.UnmarshalJSONField("lines", &lines); err != nil {
		return nil, refuseField("lines", msgImportLinesFormat)
	}
	if len(lines) == 0 {
		return nil, refuseField("lines", msgImportNoLines)
	}
	byLine := make(map[int]bankRowResult, len(results))
	for _, res := range results {
		byLine[res.Line] = res
	}
	slices.Sort(lines)
	lines = slices.Compact(lines)
	chosen := make([]bankRowResult, 0, len(lines))
	for _, line := range lines {
		if header != 0 && line == header {
			return nil, refuseField("lines", msgImportHeaderLine, line)
		}
		res, ok := byLine[line]
		if !ok {
			return nil, refuseField("lines", msgImportUnknownLine, line)
		}
		chosen = append(chosen, res)
	}
	return chosen, nil
}

// refuseBankRowErrors refuses an import with a chosen row that has an error:
// the first one's line and message, and how many more there are.
func refuseBankRowErrors(chosen []bankRowResult) error {
	var bad []bankRowResult
	for _, res := range chosen {
		if res.Err != "" {
			bad = append(bad, res)
		}
	}
	if len(bad) == 0 {
		return nil
	}
	msg := fmt.Sprintf(msgImportRowError, bad[0].Line, bad[0].Err)
	switch more := len(bad) - 1; {
	case more == 1:
		msg += msgImportOneMoreError
	case more > 1:
		msg += fmt.Sprintf(msgImportMoreErrors, more)
	}
	// The row message repeats text from the file; keep it as written.
	return refuseNamed("%s", msg)
}

// importedBankLines are the lines of the file already imported.
func importedBankLines(tx core.App, fileID string) (map[int]bool, error) {
	rows, err := tx.FindAllRecords("books_bank_transactions", dbx.HashExp{"file": fileID})
	if err != nil {
		return nil, fmt.Errorf("books: read the file's imported lines: %w", err)
	}
	taken := make(map[int]bool, len(rows))
	for _, row := range rows {
		taken[row.GetInt("line")] = true
	}
	return taken, nil
}

// knownBankHashes are the chosen rows' hashes already stored on any file.
func knownBankHashes(tx core.App, chosen []bankRowResult, hashes map[int]string) (map[string]bool, error) {
	wanted := make([]any, 0, len(chosen))
	for _, res := range chosen {
		wanted = append(wanted, hashes[res.Line])
	}
	known := map[string]bool{}
	for chunk := range slices.Chunk(wanted, bankHashLookupChunk) {
		rows, err := tx.FindAllRecords("books_bank_transactions", dbx.In("dedupe_hash", chunk...))
		if err != nil {
			return nil, fmt.Errorf("books: look for transactions already imported: %w", err)
		}
		for _, row := range rows {
			known[row.GetString("dedupe_hash")] = true
		}
	}
	return known, nil
}

// applyBankImport writes the new transactions and marks the file imported,
// after the import row is saved (its id is the transactions' bank_import).
func applyBankImport(tx core.App, r *core.Record, plan bankImportPlan) error {
	col, err := tx.FindCollectionByNameOrId("books_bank_transactions")
	if err != nil {
		return fmt.Errorf("books: find books_bank_transactions: %w", err)
	}
	for _, n := range plan.rows {
		t := core.NewRecord(col)
		t.Set("connection", plan.connection)
		t.Set("file", plan.file.Id)
		t.Set("bank_import", r.Id)
		t.Set("line", n.line)
		t.Set("date", n.txn.Date)
		t.Set("description", n.txn.Description)
		t.Set("memo", n.txn.Memo)
		t.Set("amount", n.txn.Amount)
		t.Set("fitid", n.txn.FitID)
		t.Set("check_number", n.txn.CheckNumber)
		t.Set("dedupe_hash", n.hash)
		t.Set("status", bankTxnStatusForReview)
		if err := tx.Save(t); err != nil {
			return fmt.Errorf("books: save line %d of %s: %w", n.line, plan.file.GetString("name"), err)
		}
	}
	if plan.file.GetString("status") == bankFileStatusImported {
		return nil
	}
	plan.file.Set("status", bankFileStatusImported)
	if err := tx.Save(plan.file); err != nil {
		return fmt.Errorf("books: mark %s imported: %w", plan.file.GetString("name"), err)
	}
	return nil
}
```

In `server/banking.go`, add `registerBankImport(app)` as the last line of `registerBanking` (before its closing brace).

Note on the race test: `bindRace` binds its handler after `registerBankImport`'s, so it runs inside the first import's transaction, after `planBankImport`; the raced import waits on the single write connection and plans after the first commits. If `requireCounts(racedImport, 0, 2)` fails because the raced save ran before the plan, re-read `bindRace` (server/race_test.go) and the file-upload race test (`TestRace_TheSameFileUploadedTwice`), which works the same way, before changing anything.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -run 'TestBankImport_|TestRace_|TestBank|TestRegister_' -count=1 .`
Expected: PASS.

- [ ] **Step 5: Run the whole Books Go package once**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books/server && go test -count=1 .`
Expected: PASS (this package only; it takes a few minutes at most). A failure in a test this plan did not touch is a real failure: find its cause and fix it at the source.

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add server/bank_import.go server/bank_import_test.go server/banking.go && git commit -m "feat(books): import chosen bank file lines without duplicates"
```

---

### Task 8: The TS mirror for the mapping screen

**Files:**
- Create: `tinycld/books/lib/bank-import.ts`
- Create: `tests/bank-import.test.ts`

**Interfaces:**
- Consumes: `z` from `@tinycld/core/ui/form`; `server/testdata/bank_import_vectors.json`; Go sources `server/bank_values.go`, `server/bank_import_map.go`, `server/bank_import.go`, `server/bank_ofx.go` (drift tests read them).
- Produces (all exported from `tinycld/books/lib/bank-import.ts`, for `p4-import-mapping`):
  - `BANK_DATE_FORMATS` (readonly tuple), `type BankDateFormat`, `OFX_COLUMNS` (readonly tuple), `MAX_BANK_AMOUNT = 1_000_000_000_000_000`.
  - `type BankValue<T> = { ok: true; value: T } | { ok: false; message: string }`.
  - `parseBankDate(text: string, format: string): BankValue<string>`; `parseBankAmount(text: string): BankValue<number>` (cents).
  - `type BankMapping` (the import row's mapping fields, snake_case, plus optional `memo_column`, `fitid_column`, `check_column`); `OFX_MAPPING: BankMapping`.
  - `type BankTxn = { date: string; description: string; memo: string; amount: number; fitid: string; checkNumber: string }`.
  - `mapBankRow(cells: readonly string[], mapping: BankMapping): BankValue<BankTxn>`.
  - `type BankRow = { line: number; cells: string[] }`; `bankContentRows(value: unknown): BankRow[] | null` (reads `books_bank_file_contents.rows`).
  - `type BankPreviewRow = { line: number; result: BankValue<BankTxn> }`; `previewBankRows(rows: readonly BankRow[], mapping: BankMapping): { headerLine: number | null; rows: BankPreviewRow[] }`.
  - `BANK_VALUE_ERRORS`, `BANK_IMPORT_ERRORS`, `noColumnText(column: number): string`.
  - `bankImportSchema(columns: number)` — zod object over `header_row`, `date_column`, `date_format`, `description_column`, `amount_columns`, `amount_column`, `money_in_column`, `money_out_column`, `amount_sign`, `lines`, with the server's messages on the server's fields; `ofxImportSchema` — `{ lines }` only.

- [ ] **Step 1: Write the failing test**

Create `tests/bank-import.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BANK_DATE_FORMATS,
    BANK_IMPORT_ERRORS,
    BANK_VALUE_ERRORS,
    type BankMapping,
    type BankTxn,
    bankContentRows,
    bankImportSchema,
    MAX_BANK_AMOUNT,
    mapBankRow,
    noColumnText,
    OFX_COLUMNS,
    OFX_MAPPING,
    ofxImportSchema,
    parseBankAmount,
    parseBankDate,
    previewBankRows,
} from '../tinycld/books/lib/bank-import'

const serverFile = (name: string) => readFileSync(join(__dirname, '..', 'server', name), 'utf8')

const goSource = ['bank_values.go', 'bank_import_map.go', 'bank_import.go', 'bank_ofx.go']
    .map(serverFile)
    .join('\n')

function goMessage(name: string): string {
    const match = goSource.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
    if (!match) throw new Error(`no Go constant ${name}`)
    return match[1]
}

function goStringList(name: string): string[] {
    const match = goSource.match(new RegExp(`\\b${name} = \\[\\]string\\{([^}]*)\\}`))
    if (!match) throw new Error(`no Go list ${name}`)
    return [...match[1].matchAll(/"([^"]*)"/g)].map(m => m[1])
}

type Vectors = {
    dates: { text: string; format: string; date?: string; error?: string }[]
    amounts: { text: string; cents?: number; error?: string }[]
    ofxMapping: BankMapping
    rows: { name: string; cells: string[]; mapping: Partial<BankMapping>; txn?: BankTxn; error?: string }[]
}

const vectors: Vectors = JSON.parse(serverFile('testdata/bank_import_vectors.json'))

const BLANK_MAPPING: BankMapping = {
    header_row: false,
    date_column: 0,
    date_format: '',
    description_column: 0,
    amount_columns: '',
    amount_column: 0,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: '',
}

describe('the shared vectors (server/testdata/bank_import_vectors.json)', () => {
    it('has every section', () => {
        expect(vectors.dates.length).toBeGreaterThan(0)
        expect(vectors.amounts.length).toBeGreaterThan(0)
        expect(vectors.rows.length).toBeGreaterThan(0)
    })

    it.each(vectors.dates)('parseBankDate("$text", $format)', ({ text, format, date, error }) => {
        const result = parseBankDate(text, format)
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: date })
    })

    it.each(vectors.amounts)('parseBankAmount("$text")', ({ text, cents, error }) => {
        const result = parseBankAmount(text)
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: cents })
    })

    it.each(vectors.rows)('mapBankRow: $name', ({ cells, mapping, txn, error }) => {
        const result = mapBankRow(cells, { ...BLANK_MAPPING, ...mapping })
        expect(result).toEqual(error ? { ok: false, message: error } : { ok: true, value: txn })
    })

    it('OFX_MAPPING is the server ofxMapping', () => {
        expect(OFX_MAPPING).toEqual(vectors.ofxMapping)
    })
})

describe('drift with the Go sources', () => {
    it('date formats', () => {
        expect([...BANK_DATE_FORMATS]).toEqual(goStringList('bankDateFormats'))
    })

    it('OFX columns', () => {
        expect([...OFX_COLUMNS]).toEqual(goStringList('ofxColumns'))
    })

    it('value messages', () => {
        expect(BANK_VALUE_ERRORS).toEqual({
            noDate: goMessage('msgBankNoDate'),
            noAmount: goMessage('msgBankNoAmount'),
            zeroAmount: goMessage('msgBankZeroAmount'),
            twoAmounts: goMessage('msgBankTwoAmounts'),
        })
    })

    it('import messages', () => {
        expect(BANK_IMPORT_ERRORS).toEqual({
            chooseDate: goMessage('msgImportChooseDate'),
            chooseFormat: goMessage('msgImportChooseFormat'),
            chooseDescription: goMessage('msgImportChooseDescription'),
            chooseAmountColumns: goMessage('msgImportChooseAmountColumns'),
            chooseAmount: goMessage('msgImportChooseAmount'),
            chooseIn: goMessage('msgImportChooseIn'),
            chooseOut: goMessage('msgImportChooseOut'),
            sameInOut: goMessage('msgImportSameInOut'),
            chooseSign: goMessage('msgImportChooseSign'),
            noLines: goMessage('msgImportNoLines'),
        })
        expect(noColumnText(9)).toBe(goMessage('msgImportNoColumn').replace('%d', '9'))
    })

    it('the amount limit', () => {
        expect(serverFile('posting.go')).toContain('const maxAmount = 1_000_000_000_000_000')
        expect(MAX_BANK_AMOUNT).toBe(1_000_000_000_000_000)
    })
})

describe('bankContentRows', () => {
    it('reads the stored rows', () => {
        expect(bankContentRows([{ line: 1, cells: ['Date', 'Amount'] }])).toEqual([
            { line: 1, cells: ['Date', 'Amount'] },
        ])
    })

    it('refuses anything else', () => {
        expect(bankContentRows(null)).toBeNull()
        expect(bankContentRows([{ line: '1', cells: [] }])).toBeNull()
        expect(bankContentRows([{ line: 1, cells: [1] }])).toBeNull()
    })
})

describe('previewBankRows', () => {
    const rows = [
        { line: 1, cells: ['Date', 'Description', 'Amount'] },
        { line: 2, cells: ['2026-09-02', 'Deposit', '4250.00'] },
        { line: 4, cells: ['2026-02-30', 'Bad', '1.00'] },
    ]
    const mapping: BankMapping = {
        ...BLANK_MAPPING,
        header_row: true,
        date_column: 1,
        date_format: 'YYYY-MM-DD',
        description_column: 2,
        amount_columns: 'one',
        amount_column: 3,
        amount_sign: 'in_positive',
    }

    it('skips the header and maps every other row', () => {
        const preview = previewBankRows(rows, mapping)
        expect(preview.headerLine).toBe(1)
        expect(preview.rows.map(row => row.line)).toEqual([2, 4])
        expect(preview.rows[0].result).toEqual({
            ok: true,
            value: { date: '2026-09-02', description: 'Deposit', memo: '', amount: 425000, fitid: '', checkNumber: '' },
        })
        expect(preview.rows[1].result).toEqual({
            ok: false,
            message: '"2026-02-30" is not a date in the YYYY-MM-DD format.',
        })
    })

    it('has no header line without a header row or rows', () => {
        expect(previewBankRows(rows, { ...mapping, header_row: false }).headerLine).toBeNull()
        expect(previewBankRows([], mapping)).toEqual({ headerLine: null, rows: [] })
    })
})

describe('bankImportSchema', () => {
    const complete = {
        header_row: true,
        date_column: 1,
        date_format: 'YYYY-MM-DD',
        description_column: 2,
        amount_columns: 'one',
        amount_column: 3,
        money_in_column: 0,
        money_out_column: 0,
        amount_sign: 'in_positive',
        lines: [2],
    }

    function issues(values: Record<string, unknown>) {
        const result = bankImportSchema(3).safeParse(values)
        return result.success ? [] : result.error.issues.map(issue => [issue.path.join('.'), issue.message])
    }

    it('accepts a complete mapping', () => {
        expect(issues(complete)).toEqual([])
        expect(
            issues({ ...complete, amount_columns: 'two', amount_column: 0, money_in_column: 3, money_out_column: 2 })
        ).toEqual([])
    })

    it.each([
        ['date_column', { date_column: 0 }, BANK_IMPORT_ERRORS.chooseDate],
        ['date_column', { date_column: 9 }, 'Column 9 is not in this file.'],
        ['date_format', { date_format: '' }, BANK_IMPORT_ERRORS.chooseFormat],
        ['description_column', { description_column: 0 }, BANK_IMPORT_ERRORS.chooseDescription],
        ['amount_columns', { amount_columns: '' }, BANK_IMPORT_ERRORS.chooseAmountColumns],
        ['amount_column', { amount_column: 0 }, BANK_IMPORT_ERRORS.chooseAmount],
        ['amount_sign', { amount_sign: '' }, BANK_IMPORT_ERRORS.chooseSign],
        ['money_in_column', { amount_columns: 'two', money_out_column: 3 }, BANK_IMPORT_ERRORS.chooseIn],
        ['money_out_column', { amount_columns: 'two', money_in_column: 3 }, BANK_IMPORT_ERRORS.chooseOut],
        [
            'money_out_column',
            { amount_columns: 'two', money_in_column: 3, money_out_column: 3 },
            BANK_IMPORT_ERRORS.sameInOut,
        ],
        ['lines', { lines: [] }, BANK_IMPORT_ERRORS.noLines],
    ])('%s: %o', (path, change, message) => {
        expect(issues({ ...complete, ...change })).toContainEqual([path, message])
    })

    it('ofxImportSchema needs only lines', () => {
        expect(ofxImportSchema.safeParse({ lines: [9] }).success).toBe(true)
        const result = ofxImportSchema.safeParse({ lines: [] })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues[0].message).toBe(BANK_IMPORT_ERRORS.noLines)
    })
})
```

The `amount_sign: ''` case: the server defaults a blank sign to `in_positive`, but the mapping form must send one, so the client schema asks for it. This is the one place the client is stricter than the server; it is intended.

- [ ] **Step 2: Run the test to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/vitest run tests/bank-import.test.ts`
Expected: FAIL — cannot resolve `../tinycld/books/lib/bank-import`.

- [ ] **Step 3: Write `tinycld/books/lib/bank-import.ts`**

```ts
// The client twin of the server's bank import rules (server/bank_values.go,
// server/bank_import_map.go, server/bank_import.go). The mapping screen previews
// each row with them, so a person sees every row error before importing; the
// server repeats every check. tests/bank-import.test.ts runs the server's vectors
// (server/testdata/bank_import_vectors.json) and drift-tests the texts.
import { z } from '@tinycld/core/ui/form'

export const BANK_DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YY', 'DD/MM/YY'] as const

export type BankDateFormat = (typeof BANK_DATE_FORMATS)[number]

// The cells of an OFX file's row, in order; OFX_MAPPING reads them.
export const OFX_COLUMNS = ['Date', 'Description', 'Memo', 'Amount', 'Transaction ID', 'Check number', 'Type'] as const

// Minor units, the ledger's per-line limit (server/posting.go maxAmount).
export const MAX_BANK_AMOUNT = 1_000_000_000_000_000

export const BANK_VALUE_ERRORS = {
    noDate: 'There is no date.',
    noAmount: 'There is no amount.',
    zeroAmount: 'The amount is 0.',
    twoAmounts: 'Both money in and money out have an amount.',
} as const

export const BANK_IMPORT_ERRORS = {
    chooseDate: 'Choose the column that holds the date.',
    chooseFormat: 'Choose the date format of your file.',
    chooseDescription: 'Choose the column that holds the description.',
    chooseAmountColumns: 'Choose how many columns show amounts.',
    chooseAmount: 'Choose the column that holds the amount.',
    chooseIn: 'Choose the column that holds money in.',
    chooseOut: 'Choose the column that holds money out.',
    sameInOut: 'Money in and money out must be different columns.',
    chooseSign: 'Choose whether a positive amount is money in or money out.',
    noLines: 'Choose at least one transaction to import.',
} as const

export function noColumnText(column: number): string {
    return `Column ${column} is not in this file.`
}

export type BankValue<T> = { ok: true; value: T } | { ok: false; message: string }

const QUOTED_CHARS = 40
const AMOUNT_SPACES = /[ \t\u00a0\u202f]/g
const CURRENCY_SIGNS = /[$€£¥]/g
const DESCRIPTION_CHARS = 500
const FITID_CHARS = 255
const CHECK_CHARS = 32

function cut(text: string, max: number): string {
    const chars = [...text]
    return chars.length > max ? chars.slice(0, max).join('') : text
}

function quoted(text: string): string {
    const chars = [...text]
    return `"${chars.length > QUOTED_CHARS ? `${chars.slice(0, QUOTED_CHARS).join('')}…` : text}"`
}

function fail<T>(message: string): BankValue<T> {
    return { ok: false, message }
}

const DIGITS = /^[0-9]+$/

function dateParts(format: string, parts: string[]): { y: string; m: string; d: string } | null {
    const [a, b, c] = parts
    switch (format) {
        case 'MM/DD/YYYY':
        case 'MM/DD/YY':
            return { m: a, d: b, y: c }
        case 'DD/MM/YYYY':
        case 'DD/MM/YY':
            return { d: a, m: b, y: c }
        case 'YYYY-MM-DD':
            return { y: a, m: b, d: c }
        default:
            return null
    }
}

function isDayPart(part: string): boolean {
    return part.length >= 1 && part.length <= 2 && DIGITS.test(part)
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Only the first word counts, so a time after the date is ignored; for
// YYYY-MM-DD an ISO time after a "T" is too. A two-digit year is 20YY.
export function parseBankDate(text: string, format: string): BankValue<string> {
    const trimmed = text.trim()
    if (trimmed === '') return fail(BANK_VALUE_ERRORS.noDate)
    const bad = fail<string>(`${quoted(trimmed)} is not a date in the ${format} format.`)
    let token = trimmed.split(/\s+/)[0]
    if (format === 'YYYY-MM-DD') token = token.split('T')[0]
    const parts = token.split(/[/.-]/)
    if (parts.length !== 3) return bad
    const named = dateParts(format, parts)
    if (!named) return bad
    const yearDigits = format.endsWith('/YY') ? 2 : 4
    if (named.y.length !== yearDigits || !DIGITS.test(named.y) || !isDayPart(named.m) || !isDayPart(named.d)) {
        return bad
    }
    const year = Number(named.y) + (yearDigits === 2 ? 2000 : 0)
    const month = Number(named.m)
    const day = Number(named.d)
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return bad
    const pad = (n: number) => String(n).padStart(2, '0')
    return { ok: true, value: `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}` }
}

function count(text: string, mark: string): number {
    return text.split(mark).length - 1
}

// Splits digits with "." and "," into the whole part (group marks removed) and
// the fraction: the later mark is the decimal mark when both appear; a lone ","
// is one only with one or two digits after it; a lone "." always is.
function splitBankNumber(text: string): { whole: string; frac: string } | null {
    const dot = text.lastIndexOf('.')
    const comma = text.lastIndexOf(',')
    let decimal = ''
    let group = ''
    if (dot >= 0 && comma >= 0) {
        decimal = dot > comma ? '.' : ','
        group = dot > comma ? ',' : '.'
    } else if (comma >= 0) {
        const after = text.length - comma - 1
        if (count(text, ',') === 1 && after >= 1 && after <= 2) decimal = ','
        else group = ','
    } else if (dot >= 0) {
        if (count(text, '.') === 1) decimal = '.'
        else group = '.'
    }
    let whole = text
    let frac = ''
    if (decimal) {
        const at = text.lastIndexOf(decimal)
        whole = text.slice(0, at)
        frac = text.slice(at + 1)
    }
    if (/[.,]/.test(frac)) return null
    if (group) {
        const groups = whole.split(group)
        if (groups[0].length < 1 || groups[0].length > 3) return null
        if (groups.slice(1).some(g => g.length !== 3)) return null
        whole = groups.join('')
    }
    if (/[.,]/.test(whole) || (whole === '' && frac === '')) return null
    return { whole: whole === '' ? '0' : whole, frac }
}

// An amount as banks write it, in signed minor units.
export function parseBankAmount(text: string): BankValue<number> {
    const trimmed = text.trim()
    if (trimmed === '') return fail(BANK_VALUE_ERRORS.noAmount)
    const bad = fail<number>(`${quoted(trimmed)} is not an amount.`)
    let s = trimmed
    let negative = false
    if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
        negative = true
        s = s.slice(1, -1)
    }
    s = s.replace(AMOUNT_SPACES, '').replace(CURRENCY_SIGNS, '')
    if (s.startsWith('-')) {
        negative = true
        s = s.slice(1)
    } else if (s.startsWith('+')) {
        s = s.slice(1)
    } else if (s.endsWith('-')) {
        negative = true
        s = s.slice(0, -1)
    }
    if (s === '' || /[^0-9.,]/.test(s)) return bad
    const parts = splitBankNumber(s)
    if (!parts) return bad
    if (parts.frac.length > 2) return fail(`${quoted(trimmed)} has more than 2 decimals.`)
    const digits = (parts.whole + `${parts.frac}00`.slice(0, 2)).replace(/^0+/, '')
    if (digits === '') return { ok: true, value: 0 }
    const tooLarge = fail<number>(`${quoted(trimmed)} is too large for Books.`)
    if (digits.length > 16) return tooLarge
    const cents = Number(digits)
    if (cents > MAX_BANK_AMOUNT) return tooLarge
    return { ok: true, value: negative ? -cents : cents }
}

// Columns are 1-based; 0 is "not chosen". The first nine fields are the
// books_bank_imports fields the mapping form sends.
export type BankMapping = {
    header_row: boolean
    date_column: number
    date_format: string
    description_column: number
    amount_columns: string
    amount_column: number
    money_in_column: number
    money_out_column: number
    amount_sign: string
    memo_column?: number
    fitid_column?: number
    check_column?: number
}

export const OFX_MAPPING: BankMapping = {
    header_row: false,
    date_column: 1,
    date_format: 'YYYY-MM-DD',
    description_column: 2,
    memo_column: 3,
    amount_columns: 'one',
    amount_column: 4,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: 'in_positive',
    fitid_column: 5,
    check_column: 6,
}

export type BankTxn = {
    date: string
    description: string
    memo: string
    amount: number
    fitid: string
    checkNumber: string
}

function cell(cells: readonly string[], column: number | undefined): string {
    if (!column || column < 1 || column > cells.length) return ''
    return cells[column - 1].trim()
}

function rowAmount(cells: readonly string[], mapping: BankMapping): BankValue<number> {
    let amount: number
    if (mapping.amount_columns === 'two') {
        const moneyIn = cell(cells, mapping.money_in_column)
        const moneyOut = cell(cells, mapping.money_out_column)
        if (moneyIn === '' && moneyOut === '') return fail(BANK_VALUE_ERRORS.noAmount)
        let inCents = 0
        let outCents = 0
        if (moneyIn !== '') {
            const parsed = parseBankAmount(moneyIn)
            if (!parsed.ok) return parsed
            inCents = Math.abs(parsed.value)
        }
        if (moneyOut !== '') {
            const parsed = parseBankAmount(moneyOut)
            if (!parsed.ok) return parsed
            outCents = Math.abs(parsed.value)
        }
        if (inCents !== 0 && outCents !== 0) return fail(BANK_VALUE_ERRORS.twoAmounts)
        amount = inCents - outCents
    } else {
        const parsed = parseBankAmount(cell(cells, mapping.amount_column))
        if (!parsed.ok) return parsed
        amount = mapping.amount_sign === 'out_positive' ? -parsed.value : parsed.value
    }
    if (amount === 0) return fail(BANK_VALUE_ERRORS.zeroAmount)
    return { ok: true, value: amount }
}

// One row read as a bank transaction: the date first, then the amount.
export function mapBankRow(cells: readonly string[], mapping: BankMapping): BankValue<BankTxn> {
    const date = parseBankDate(cell(cells, mapping.date_column), mapping.date_format)
    if (!date.ok) return date
    const amount = rowAmount(cells, mapping)
    if (!amount.ok) return amount
    return {
        ok: true,
        value: {
            date: date.value,
            description: cut(cell(cells, mapping.description_column), DESCRIPTION_CHARS),
            memo: cut(cell(cells, mapping.memo_column), DESCRIPTION_CHARS),
            amount: amount.value,
            fitid: cut(cell(cells, mapping.fitid_column), FITID_CHARS),
            checkNumber: cut(cell(cells, mapping.check_column), CHECK_CHARS),
        },
    }
}

export type BankRow = { line: number; cells: string[] }

const bankRowsSchema = z.array(z.object({ line: z.number().int().positive(), cells: z.array(z.string()) }))

// books_bank_file_contents.rows as rows, or null when it is not what the server writes.
export function bankContentRows(value: unknown): BankRow[] | null {
    const parsed = bankRowsSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export type BankPreviewRow = { line: number; result: BankValue<BankTxn> }

// Every row but the header, mapped as the server will map it.
export function previewBankRows(
    rows: readonly BankRow[],
    mapping: BankMapping
): { headerLine: number | null; rows: BankPreviewRow[] } {
    const headerLine = mapping.header_row && rows.length > 0 ? rows[0].line : null
    const body = headerLine === null ? rows : rows.slice(1)
    return { headerLine, rows: body.map(row => ({ line: row.line, result: mapBankRow(row.cells, mapping) })) }
}

const linesSchema = z.array(z.number().int().positive()).min(1, BANK_IMPORT_ERRORS.noLines)

// The CSV mapping form, with the server's messages on the server's fields.
export function bankImportSchema(columns: number) {
    return z
        .object({
            header_row: z.boolean(),
            date_column: z.number().int(),
            date_format: z.string(),
            description_column: z.number().int(),
            amount_columns: z.string(),
            amount_column: z.number().int(),
            money_in_column: z.number().int(),
            money_out_column: z.number().int(),
            amount_sign: z.string(),
            lines: linesSchema,
        })
        .superRefine((values, ctx) => {
            const column = (path: string, value: number, choose: string) => {
                if (value < 1) ctx.addIssue({ code: 'custom', path: [path], message: choose })
                else if (value > columns) ctx.addIssue({ code: 'custom', path: [path], message: noColumnText(value) })
            }
            column('date_column', values.date_column, BANK_IMPORT_ERRORS.chooseDate)
            if (!(BANK_DATE_FORMATS as readonly string[]).includes(values.date_format)) {
                ctx.addIssue({ code: 'custom', path: ['date_format'], message: BANK_IMPORT_ERRORS.chooseFormat })
            }
            column('description_column', values.description_column, BANK_IMPORT_ERRORS.chooseDescription)
            if (values.amount_columns === 'one') {
                column('amount_column', values.amount_column, BANK_IMPORT_ERRORS.chooseAmount)
                if (values.amount_sign !== 'in_positive' && values.amount_sign !== 'out_positive') {
                    ctx.addIssue({ code: 'custom', path: ['amount_sign'], message: BANK_IMPORT_ERRORS.chooseSign })
                }
            } else if (values.amount_columns === 'two') {
                column('money_in_column', values.money_in_column, BANK_IMPORT_ERRORS.chooseIn)
                column('money_out_column', values.money_out_column, BANK_IMPORT_ERRORS.chooseOut)
                if (values.money_in_column > 0 && values.money_in_column === values.money_out_column) {
                    ctx.addIssue({ code: 'custom', path: ['money_out_column'], message: BANK_IMPORT_ERRORS.sameInOut })
                }
            } else {
                ctx.addIssue({
                    code: 'custom',
                    path: ['amount_columns'],
                    message: BANK_IMPORT_ERRORS.chooseAmountColumns,
                })
            }
        })
}

// An OFX file's columns are fixed; its import form chooses only the lines.
export const ofxImportSchema = z.object({ lines: linesSchema })
```

- [ ] **Step 4: Run the test to see it pass**

Run: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/vitest run tests/bank-import.test.ts`
Expected: PASS. A vector that passes in Go and fails here is a mirror bug: fix `bank-import.ts`, never the vector.

- [ ] **Step 5: Typecheck and biome**

Run the typecheck command (Global Constraints). Expected: no errors.
Run: `cd /Users/nas/tmp/tinycld/books-reports/books && /Users/nas/tmp/tinycld/books-reports/node_modules/.bin/biome check --write tinycld/books/lib/bank-import.ts tests/bank-import.test.ts`
Expected: clean. Fix any rule biome reports at its source (no `biome-ignore`).

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-reports/books && git add tinycld/books/lib/bank-import.ts tests/bank-import.test.ts && git commit -m "feat(books): bank import preview rules for the mapping screen"
```

---

## Contracts for later units

- **p4-import-mapping** reads the file's one `books_bank_file_contents` row (`useLiveQuery` on `file = <id>` with an explicit `queryKey`), parses `rows` with `bankContentRows`, shows each row with `previewBankRows(rows, mapping)` (an OFX file uses `OFX_MAPPING` and `OFX_COLUMNS`), validates the form with `bankImportSchema(columns)` (CSV) or `ofxImportSchema` (OFX), and inserts one `books_bank_imports` row through `useMutation` (pbtsdb `insert`, `newRecordId()`). A server refusal is field-keyed for the mapping fields, `file` and `lines` (use `handleMutationErrorsWithForm`), and top-level for a row error. The inserted row comes back with `imported` and `duplicates`.
- **p4-for-review** reads `books_bank_transactions` by `connection` and `status` (`for_review` | `reviewed` | `excluded`; `amount` signed minor units, money in positive). It adds the collection's update rule, its audit registration (and removes it from `serverOnly` in `server/registrations_test.go`) and any new fields, editing migration 2100000008 in place.
- **p4-import-mapping owns the account card's statement balance line** (bank-connection-design §5 gave it to "the parser unit"; this unit stores the data, and the card is UI in `BankAccountPanel`, which p4-import-mapping already edits). It reads the newest file with `statement_date` set and shows `statement_balance` as of that day. The driver must put this into p4-import-mapping's plan.
- **File status `failed` is not used.** A file that cannot be parsed is refused at upload, so no stored file is ever `failed`. The value stays in the select so no released contract changes; a later unit that parses after upload may use it.
- **Dedupe across formats.** A CSV row and an OFX row of the same bank transaction match only when their date, amount and description are the same (an OFX row has a FITID and is keyed by it). People should import one connection in one format; the import help topic (p4-import-mapping) must say so.
