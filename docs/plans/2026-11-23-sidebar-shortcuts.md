# Sidebar Shortcuts and New Section Implementation Plan (part 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Books user a list of sidebar shortcuts stored in a Books collection, and make every e2e helper reach the New actions through one file, so that part 2 can move the New actions into the sidebar.

**Architecture:** One row for each user in a new collection `books_sidebar_shortcuts` holds the whole ordered list as json (`[{ kind, ref }]`); no row means the defaults, a row with `[]` means the user removed them all, and a reorder is one write. A plain-data model (`lib/sidebar-shortcuts.ts`) parses and edits the list, a catalog (`lib/shortcut-catalog.ts`) turns a `screen` or `new` shortcut into a label, icon and route, and one hook (`hooks/useSidebarShortcuts.ts`) reads the row with `useMyLiveQuery` and writes it. This part draws nothing: the sidebar sections, the Customize dialog, the reports inside Books, the Books sections in core Settings, the e2e specs and the help topics are parts 2 and 3 (tasks 8-20 of the outline).

**Tech Stack:** PocketBase JS migration and Go rule tests (`tinycld.org/core/rlstest`), pbtsdb + TanStack DB (`useMyLiveQuery`), zod (from `@tinycld/core/ui/form`), TanStack Query mutation `scope`, vitest + happy-dom, Playwright.

**Spec:** the unit `p1-sidebar-shortcuts` in `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml` (its `covers` list is the scope), the two items the human added on 2026-11-23 (reports open inside Books from a Reports section of the sidebar; the Books settings sections also show in core Settings; both written out in the outline), and the shell it changes, `/Users/nas/tmp/tinycld/books/books/docs/specs/books-shell-design.md`. The outline of all 20 tasks, with the QuickBooks Desktop study and the target layout, is `/Users/nas/tmp/tinycld/auto-helix-books/staging/p1-sidebar-shortcuts/plan-outline.md`; read its first two sections before any task.

## Target layout (recorded from the QuickBooks Desktop study)

QuickBooks Desktop's Left Icon Bar is, top to bottom: a search field; **My Shortcuts**, a list the user edits in *Customize Shortcuts* (add from the available windows, remove, move up and down); then the pane switches My Shortcuts / View Balances / Run Favorite Reports / Open Windows. What is not a shortcut is reached from the menu bar.

The Books sidebar after this unit, the same component in the desktop sidebar and in the phone drawer, on web and native:

1. **Shortcuts** (heading with a Customize action): the user's list, in the user's order. Screens, transaction forms, reports and registers are kinds in this one list.
2. **New** (heading with a fold arrow, closed by default): the New actions under Customers / Vendors / Other. Hidden for a reader.
3. **Reports** (heading with a fold arrow): the Books reports the user can see, shipped and saved or shared, each opening on a Books route that draws core's report view, so the Books sidebar stays; a last row "All reports" opens core's Reports hub. The hub's routes (`/a/reports/*`) do not change.
4. **Go to**: the fixed navigation as it is today without its Reports entry (Dashboard ... Lists, the Accounting fold, Taxes, Settings). It plays the part of QuickBooks' menu bar.

The popover leaves the shell. The round New button stays on phones and opens the drawer at the New section, because core's drawer has no visible control that opens it.

Core's main navigation (the human's addendum of 2026-11-23): the unit has one core task (task 12 of the outline, part 2), and that same task also hides the Reports hub entry of core's main navigation (`nav-reports` in the rail, `more-reports` in the phone More drawer). Only the entry goes; the `/a/reports` routes stay, and "All reports" in the Books sidebar opens them. Core names no package: a package declares in its manifest that it lists its reports in its own navigation, and core reads that from the package registry. This part changes no core file.

## Global Constraints

- Work only in `/Users/nas/tmp/tinycld/books/books`. Never edit `/Users/nas/tmp/tinycld/books/tinycld` (core) or anything under `node_modules`.
- Books runs on web and native: no web-only API in `tinycld/books/**`. Hermes has no `structuredClone`.
- All PocketBase data goes through pbtsdb: `useStore`, `useMyLiveQuery` for my-own-rows, `useMutation` from `@tinycld/core/lib/mutations`. No raw PocketBase call, no new endpoint.
- Never write a value into SQL text. This part writes no SQL.
- Never `any` to pass a type check, never a `biome-ignore`, never `console.*`. Row types come from the generated schema (`tinycld/books/types.ts`), never a hand-written interface.
- A unit test mocks only through the shared harness (`tests/accounts-form-harness.ts`, `tests/silence-log.ts`); never mock a Books hook or component.
- E2E changes data only through the UI. E2E ports: `E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231`; check that 7230 and 7231 are free in the same command; all named spec files in ONE command; when a run needs more than about 4 minutes hand back `NEEDS-RUN: <command>`.
- Package files that Metro loads import each other by relative path (`../lib/x`), never `~/tinycld/books/...`.
- Books names no other package and no deployment concern: it depends on `@tinycld/core` only.
- A migration that is released is frozen. This part adds a NEW migration file, `2100000042`; it edits no other migration.
- No commit message, code comment or file names an AI tool.
- Run tools from `/Users/nas/tmp/tinycld/books/books` with `PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH` (`vitest`, `biome`, `tinycld-pkg typecheck`). Run `biome check --write` only on the files your task names. Never `pnpm install` in a member.
- The commit step of each task is for the runner: an implementer whose prompt says "make no commits" skips it.

## Review Focus

Each line is a condition the unit's scope implies; the test that pins it is named with its task.

1. A stored `items` value this build does not understand (not a list, an unknown kind, a repeat, more than 30) must still give a sidebar, never an error: Task 2 `parseShortcuts` tests; Task 4 "drops what is not a shortcut from a stored list" and "reads a stored value that is not a list as no shortcuts".
2. A user who removed every shortcut must get an empty list, not the defaults again: Task 4 "gives an empty list, not the defaults, to a user who removed every shortcut" and "saves an empty list as an empty list"; Task 1 "an empty list is a value".
3. Two changes made faster than the server answers, by a user with no row yet, must end as ONE row holding the second list: Task 4 "runs two fast saves one after the other on one row"; Task 1 `TestSidebarShortcutRules_OneRowForEachUser`.
4. A user whose access was lowered to read-only after pinning a transaction form must not get a dead entry: Task 3 "finds a screen for every user and a form for a writer only".
5. No user reads or changes another user's list, a Books admin included, and a user with no Books access reads none: Task 1 `ReadOnlyYourOwn`, `Create`, `ChangeOnlyYourOwn`; Task 4 "never reads another user row".

Also pinned: a save the server refuses returns the list to the saved one and tells the user (Task 4); a failed read shows no shortcut instead of the defaults and blocks writes (Task 4).

---

### Task 1: Collection `books_sidebar_shortcuts`

**Files:**
- Create: `pb-migrations/2100000042_create_books_sidebar_shortcuts.js`
- Create: `server/sidebar_shortcuts_rules_test.go`
- Modify: `server/oauth_scopes.go` (the doc comment of `oauthPackage` and the last entry of `Collections`)
- Modify: `server/registrations_test.go:24-104` (a `personalOnly` list, and `TestAudit_CoversEveryCollectionPeopleWrite`)
- Modify: `tinycld/books/collections.ts` (before `return {` near line 1052)
- Modify: `tinycld/books/types.ts` (the export list, after `BooksSettings,`)
- Modify: `tests/collections.test.ts` (the `NAMES` list)
- Modify: `tests/migration-prefixes.test.ts:63-67,113-114` (the migrations that may run after the audit log view)

**Interfaces:**
- Consumes: Go test helpers in `server/env_test.go`: `newBooksApp(t)`, `newLevelUsers(t, app) levelUsers` (fields `none`, `readOnly`, `bookkeeper`, `admin`; `byLevel(Level)`), `allLevels`, `tokenFor(t, user)`, `saveRecord(t, app, collection, fields)`, `apiReq{method, url, token, body, want, content}.run(t, app)`.
- Produces: the pbtsdb store `'books_sidebar_shortcuts'` (`useStore('books_sidebar_shortcuts')`), and the row type `BooksSidebarShortcuts` exported from `tinycld/books/types.ts`: `{ id: string; user: string; items: any; created: string; updated: string }` (generated; `items` is json). Rules: a user with Books read access lists, views, creates, updates and deletes only the row whose `user` is that user; one row for each user (unique index); `items` up to 20000 bytes.

- [ ] **Step 1: Write the failing Go rule tests**

Create `server/sidebar_shortcuts_rules_test.go`:

```go
package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

const shortcutsURL = "/api/collections/books_sidebar_shortcuts/records"

func mkShortcuts(t testing.TB, app *tests.TestApp, userID string) string {
	t.Helper()
	row := saveRecord(t, app, "books_sidebar_shortcuts", map[string]any{
		"user":  userID,
		"items": []map[string]string{{"kind": "screen", "ref": "customers"}},
	})
	return row.Id
}

// A user with Books access reads only the row that names them; a user with no
// Books access reads none, their own included.
func TestSidebarShortcutRules_ReadOnlyYourOwn(t *testing.T) {
	want := map[Level]string{
		LevelNone: `"totalItems":0`, LevelReadOnly: `"totalItems":1`,
		LevelBookkeeper: `"totalItems":1`, LevelAdmin: `"totalItems":1`,
	}
	for _, level := range allLevels {
		t.Run(string(level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			for _, l := range allLevels {
				mkShortcuts(t, app, users.byLevel(l).Id)
			}
			apiReq{
				method:  http.MethodGet,
				url:     shortcutsURL,
				token:   tokenFor(t, users.byLevel(level)),
				want:    http.StatusOK,
				content: []string{want[level]},
			}.run(t, app)
		})
	}
}

func TestSidebarShortcutRules_Create(t *testing.T) {
	items := `[{"kind":"screen","ref":"customers"}]`
	cases := []struct {
		name  string
		level Level
		body  func(u levelUsers) string
		want  int
	}{
		{"a reader saves their own list", LevelReadOnly,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.readOnly.Id, items) }, http.StatusOK},
		{"an empty list is a value", LevelBookkeeper,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":[]}`, u.bookkeeper.Id) }, http.StatusOK},
		{"nobody saves a list for another user", LevelAdmin,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.readOnly.Id, items) }, http.StatusBadRequest},
		{"a user with no Books access saves none", LevelNone,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.none.Id, items) }, http.StatusBadRequest},
		{"a list over the size limit is refused", LevelBookkeeper,
			func(u levelUsers) string {
				return fmt.Sprintf(`{"user":%q,"items":[{"kind":"screen","ref":%q}]}`, u.bookkeeper.Id, strings.Repeat("x", 20001))
			}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPost,
				url:    shortcutsURL,
				token:  tokenFor(t, users.byLevel(tc.level)),
				body:   tc.body(users),
				want:   tc.want,
			}.run(t, app)
		})
	}
}

// One row for each user: the client updates it, so a second create is a bug.
func TestSidebarShortcutRules_OneRowForEachUser(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	mkShortcuts(t, app, users.bookkeeper.Id)
	apiReq{
		method: http.MethodPost,
		url:    shortcutsURL,
		token:  tokenFor(t, users.bookkeeper),
		body:   fmt.Sprintf(`{"user":%q,"items":[]}`, users.bookkeeper.Id),
		want:   http.StatusBadRequest,
	}.run(t, app)
}

func TestSidebarShortcutRules_ChangeOnlyYourOwn(t *testing.T) {
	cases := []struct {
		name   string
		actor  Level
		method string
		body   func(u levelUsers) string
		want   int
	}{
		{"the owner reorders", LevelBookkeeper, http.MethodPatch,
			func(levelUsers) string { return `{"items":[{"kind":"new","ref":"invoice"}]}` }, http.StatusOK},
		{"the owner cannot hand the row to another user", LevelBookkeeper, http.MethodPatch,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q}`, u.admin.Id) }, http.StatusNotFound},
		{"an admin cannot change another user's list", LevelAdmin, http.MethodPatch,
			func(levelUsers) string { return `{"items":[]}` }, http.StatusNotFound},
		{"an admin cannot delete another user's list", LevelAdmin, http.MethodDelete,
			func(levelUsers) string { return "" }, http.StatusNotFound},
		{"the owner deletes the row to get the defaults back", LevelBookkeeper, http.MethodDelete,
			func(levelUsers) string { return "" }, http.StatusNoContent},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			id := mkShortcuts(t, app, users.bookkeeper.Id)
			apiReq{
				method: tc.method,
				url:    shortcutsURL + "/" + id,
				token:  tokenFor(t, users.byLevel(tc.actor)),
				body:   tc.body(users),
				want:   tc.want,
			}.run(t, app)
		})
	}
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test -run 'TestSidebarShortcutRules' .`
Expected: FAIL. The tests that seed a row stop at `find books_sidebar_shortcuts`; the create tests get 404 where they want 200 or 400.

- [ ] **Step 3: Write the migration**

Create `pb-migrations/2100000042_create_books_sidebar_shortcuts.js`:

```js
/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// books_sidebar_shortcuts holds one row for each user who has arranged the Shortcuts
// section of the Books sidebar: `items` is the ordered list of `{ kind, ref }` the client
// reads and writes as one value (lib/sidebar-shortcuts.ts parses it and drops what it does
// not know). A user with no row sees the default shortcuts; a row with an empty list is a
// user who removed them all. The row is the user's own screen arrangement, not company
// data: only its user reads or writes it, it is not in the audit log, and it is deleted
// with its user.
//
// The rule constants repeat 2100000000's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const MINE = `${READ} && user = @request.auth.id`

migrate(
    app => {
        app.save(
            new Collection({
                id: 'pbc_books_shortcuts',
                name: 'books_sidebar_shortcuts',
                type: 'base',
                listRule: MINE,
                viewRule: MINE,
                createRule: `${READ} && @request.body.user = @request.auth.id`,
                updateRule: `${MINE} && @request.body.user:isset = false`,
                deleteRule: MINE,
                fields: [
                    {
                        name: 'user',
                        type: 'relation',
                        required: true,
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    // Not required: an empty list is a valid value, and PocketBase
                    // reads `[]` in a required json field as blank.
                    { name: 'items', type: 'json', maxSize: 20000 },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_shortcuts_user ON books_sidebar_shortcuts (user)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_sidebar_shortcuts'))
    }
)
```

- [ ] **Step 4: Run the rule tests, then the two registry tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test -run 'TestSidebarShortcutRules' .`
Expected: PASS.

Run: `go test -run 'TestAudit_CoversEveryCollectionPeopleWrite|TestOAuth_CoversEveryBooksCollection' .`
Expected: FAIL with exactly these two messages:

```
books_sidebar_shortcuts is neither audited nor listed as server-only
books_sidebar_shortcuts has no OAuth entry and is default-denied to tokens
```

- [ ] **Step 5: Give the collection its OAuth entry and its audit exemption**

In `server/oauth_scopes.go`, add the entry after `documentSendsCollection`:

```go
			documentSendsCollection:            ro,
			"books_sidebar_shortcuts":          ro,
		},
```

and add this sentence at the end of the doc comment of `oauthPackage` (after "the link token is their credential."):

```go
// A user's sidebar shortcuts are read-only: arranging a screen is done in the
// app, not by a token.
```

In `server/registrations_test.go`, add after the `serverOnly` map (before `func booksCollections`):

```go
// personalOnly are the collections that hold one user's own screen arrangement.
// Only that user reads or writes the row and it is not company data, so the
// audit log does not record it.
var personalOnly = map[string]bool{
	"books_sidebar_shortcuts": true,
}
```

and change the check in `TestAudit_CoversEveryCollectionPeopleWrite` from

```go
		if _, ok := audited[c.Name]; !ok && !serverOnly[c.Name] {
			t.Errorf("%s is neither audited nor listed as server-only", c.Name)
```

to

```go
		if _, ok := audited[c.Name]; !ok && !serverOnly[c.Name] && !personalOnly[c.Name] {
			t.Errorf("%s is neither audited nor listed as server-only or personal", c.Name)
```

- [ ] **Step 6: Run the Go tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && gofmt -l . ; go vet . && go test -run 'TestSidebarShortcutRules|TestAudit_|TestOAuth_|TestRegister_' .`
Expected: `gofmt -l` prints nothing; `ok  tinycld.org/packages/books`.

- [ ] **Step 7: Write the failing collections test**

In `tests/collections.test.ts`, add the name at the end of `NAMES`:

```ts
    'books_payment_day_totals',
    'books_sidebar_shortcuts',
]
```

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/collections.test.ts`
Expected: FAIL in "registers every Books collection" (`books_sidebar_shortcuts` is missing from the result).

- [ ] **Step 8: Register the collection and export its type**

In `tinycld/books/collections.ts`, add before `return {` and add the name as the first entry of the returned object:

```ts
    // One row for each user: the Shortcuts section of the Books sidebar. No relations: the
    // row's user is the reader.
    const books_sidebar_shortcuts = newCollection('books_sidebar_shortcuts', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    return {
        books_sidebar_shortcuts,
        books_accounts,
```

Regenerate the schema types from the migrations (no e2e run may be in progress; this writes only generated, gitignored files in core):

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: exit 0, and `command grep -c 'export interface BooksSidebarShortcuts ' core/types/pbSchema.ts` prints `1`.

In `tinycld/books/types.ts`, add the type to the export list, in its alphabetical place:

```ts
    BooksSettings,
    BooksSidebarShortcuts,
    BooksStatements,
```

- [ ] **Step 9: Name the migration in the migration order test**

`tests/migration-prefixes.test.ts` lists every migration that may run after the audit log view. With the new file it fails (this was run):

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/migration-prefixes.test.ts`
Expected: FAIL, 3 tests ("runs only the named later migrations after the audit log view" and the two "holds ..." tests).

Replace the line `const AFTER_AUDIT: string[] = [...RECONCILE, ...REPORT, ...DASHBOARD]` with:

```ts
// Sidebar shortcuts: one user's own screen arrangement takes the next free number after the
// dashboard views. It is not audited and the audit view reads nothing of it.
const SHORTCUTS_SUFFIX = '_create_books_sidebar_shortcuts.js'

const SHORTCUTS = MIGRATIONS.filter(file => file.endsWith(SHORTCUTS_SUFFIX))

const AFTER_AUDIT: string[] = [...RECONCILE, ...REPORT, ...DASHBOARD, ...SHORTCUTS]
```

and in the test "runs only the named later migrations after the audit log view", add after the line `expect(numberOf(DASHBOARD[0])).toBeGreaterThan(numberOf(REPORT[0]))`:

```ts
        expect(SHORTCUTS).toHaveLength(1)
        expect(numberOf(SHORTCUTS[0])).toBeGreaterThan(numberOf(DASHBOARD[0]))
```

- [ ] **Step 10: Run the unit tests and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/collections.test.ts tests/collections-real.test.ts tests/migration-prefixes.test.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: the three test files pass; the typecheck prints no error.

- [ ] **Step 11: Commit**

```bash
git add pb-migrations/2100000042_create_books_sidebar_shortcuts.js server/sidebar_shortcuts_rules_test.go server/oauth_scopes.go server/registrations_test.go tinycld/books/collections.ts tinycld/books/types.ts tests/collections.test.ts tests/migration-prefixes.test.ts
git commit -m "feat(books): books_sidebar_shortcuts collection, one row for each user"
```

---

### Task 2: The shortcut list model

**Files:**
- Create: `tinycld/books/lib/sidebar-shortcuts.ts`
- Test: `tests/sidebar-shortcuts.test.ts`

**Interfaces:**
- Consumes: `z` from `@tinycld/core/ui/form`. Nothing from Task 1.
- Produces (all exported from `tinycld/books/lib/sidebar-shortcuts.ts`):
  - `SHORTCUT_KINDS = ['screen', 'new', 'report', 'register'] as const`, `type ShortcutKind`
  - `type Shortcut = { kind: ShortcutKind; ref: string }`: `screen` ref = a catalog id (Task 3), `new` ref = a `NEW_ACTIONS` id, `report` ref = the `shipped_key` of a shipped report (`books.…`) or the `reports` row id of a saved report, `register` ref = an account id
  - `MAX_SHORTCUTS = 30`
  - `DEFAULT_SHORTCUTS: readonly Shortcut[]` (Customers, Vendors, Products and services, Profit and Loss, Balance Sheet)
  - `shortcutKey(shortcut: Shortcut): string` gives `'<kind>:<ref>'`
  - `parseShortcuts(value: unknown): Shortcut[]`
  - `hasShortcut(list: readonly Shortcut[], shortcut: Shortcut): boolean`
  - `canAddShortcut(list: readonly Shortcut[]): boolean`
  - `addShortcut(list: readonly Shortcut[], shortcut: Shortcut): Shortcut[]`
  - `removeShortcut(list: readonly Shortcut[], key: string): Shortcut[]`
  - `placeShortcut(list: readonly Shortcut[], key: string, index: number): Shortcut[]`
  - `moveShortcut(list: readonly Shortcut[], key: string, by: -1 | 1): Shortcut[]`
  - Every function returns a new array and never changes its argument.

- [ ] **Step 1: Write the failing test**

Create `tests/sidebar-shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
    addShortcut,
    canAddShortcut,
    DEFAULT_SHORTCUTS,
    hasShortcut,
    MAX_SHORTCUTS,
    moveShortcut,
    parseShortcuts,
    placeShortcut,
    removeShortcut,
    type Shortcut,
    shortcutKey,
} from '../tinycld/books/lib/sidebar-shortcuts'

const A: Shortcut = { kind: 'screen', ref: 'customers' }
const B: Shortcut = { kind: 'new', ref: 'invoice' }
const C: Shortcut = { kind: 'report', ref: 'books.balance_sheet' }
const D: Shortcut = { kind: 'register', ref: 'acct00000000001' }

function many(count: number): Shortcut[] {
    return Array.from({ length: count }, (_, i) => ({ kind: 'register', ref: `account-${i}` }))
}

describe('parseShortcuts', () => {
    it('reads a stored list in its order', () => {
        expect(parseShortcuts([B, A, D, C])).toEqual([B, A, D, C])
    })

    it('reads a value that is not a list as no shortcuts', () => {
        for (const value of [null, undefined, '', 'x', 7, {}, { 0: A }]) {
            expect(parseShortcuts(value)).toEqual([])
        }
    })

    it('drops an item that is not a shortcut and keeps the rest', () => {
        const stored = [
            A,
            null,
            'screen:customers',
            { kind: 'bookmark', ref: 'x' },
            { kind: 'screen' },
            { kind: 'screen', ref: '' },
            { kind: 'screen', ref: 7 },
            { kind: 'screen', ref: 'x'.repeat(101) },
            B,
        ]
        expect(parseShortcuts(stored)).toEqual([A, B])
    })

    it('keeps only the kind and the ref of an item', () => {
        expect(parseShortcuts([{ ...A, label: 'Mine', extra: { deep: true } }])).toEqual([A])
    })

    it('keeps the first of two equal items', () => {
        expect(parseShortcuts([A, B, { ...A }, B])).toEqual([A, B])
    })

    it('keeps two kinds with the same ref', () => {
        const screen: Shortcut = { kind: 'screen', ref: 'x' }
        const report: Shortcut = { kind: 'report', ref: 'x' }
        expect(parseShortcuts([screen, report])).toEqual([screen, report])
    })

    it('stops at the limit', () => {
        const parsed = parseShortcuts(many(MAX_SHORTCUTS + 5))
        expect(parsed).toHaveLength(MAX_SHORTCUTS)
        expect(parsed).toEqual(many(MAX_SHORTCUTS))
    })
})

describe('DEFAULT_SHORTCUTS', () => {
    it('is a valid list with no repeat', () => {
        expect(parseShortcuts([...DEFAULT_SHORTCUTS])).toEqual([...DEFAULT_SHORTCUTS])
        expect(DEFAULT_SHORTCUTS.length).toBeGreaterThan(0)
    })
})

describe('addShortcut', () => {
    it('adds at the end and leaves the given list as it was', () => {
        const list = [A, B]
        expect(addShortcut(list, C)).toEqual([A, B, C])
        expect(list).toEqual([A, B])
    })

    it('does not add a shortcut that is in the list', () => {
        expect(addShortcut([A, B], { ...A })).toEqual([A, B])
        expect(hasShortcut([A, B], { ...A })).toBe(true)
        expect(hasShortcut([A, B], C)).toBe(false)
    })

    it('does not add to a full list', () => {
        const full = many(MAX_SHORTCUTS)
        expect(canAddShortcut(full)).toBe(false)
        expect(canAddShortcut(many(MAX_SHORTCUTS - 1))).toBe(true)
        expect(addShortcut(full, A)).toEqual(full)
    })
})

describe('removeShortcut', () => {
    it('removes by key', () => {
        expect(removeShortcut([A, B, C], shortcutKey(B))).toEqual([A, C])
    })

    it('removes the last one, leaving an empty list', () => {
        expect(removeShortcut([A], shortcutKey(A))).toEqual([])
    })

    it('returns the same items for a key that is not in the list', () => {
        expect(removeShortcut([A, B], shortcutKey(C))).toEqual([A, B])
    })
})

describe('moveShortcut and placeShortcut', () => {
    it('moves one place up and one place down', () => {
        expect(moveShortcut([A, B, C], shortcutKey(B), -1)).toEqual([B, A, C])
        expect(moveShortcut([A, B, C], shortcutKey(B), 1)).toEqual([A, C, B])
    })

    it('keeps the first at the top and the last at the bottom', () => {
        expect(moveShortcut([A, B, C], shortcutKey(A), -1)).toEqual([A, B, C])
        expect(moveShortcut([A, B, C], shortcutKey(C), 1)).toEqual([A, B, C])
    })

    it('places at an index and clamps an index outside the list', () => {
        expect(placeShortcut([A, B, C, D], shortcutKey(A), 2)).toEqual([B, C, A, D])
        expect(placeShortcut([A, B, C, D], shortcutKey(D), 0)).toEqual([D, A, B, C])
        expect(placeShortcut([A, B, C], shortcutKey(A), 99)).toEqual([B, C, A])
        expect(placeShortcut([A, B, C], shortcutKey(C), -4)).toEqual([C, A, B])
    })

    it('returns the same items for a key that is not in the list', () => {
        expect(moveShortcut([A, B], shortcutKey(C), 1)).toEqual([A, B])
        expect(placeShortcut([A, B], shortcutKey(C), 0)).toEqual([A, B])
    })

    it('leaves the given list as it was', () => {
        const list = [A, B, C]
        moveShortcut(list, shortcutKey(A), 1)
        placeShortcut(list, shortcutKey(A), 2)
        expect(list).toEqual([A, B, C])
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/sidebar-shortcuts.test.ts`
Expected: FAIL, the import of `../tinycld/books/lib/sidebar-shortcuts` does not resolve.

- [ ] **Step 3: Write the model**

Create `tinycld/books/lib/sidebar-shortcuts.ts`:

```ts
// The Shortcuts section of the Books sidebar: one ordered list for each user, stored whole
// in books_sidebar_shortcuts.items. No icons and no routes here (lib/shortcut-catalog.ts
// has them), so this module stays plain data.
import { z } from '@tinycld/core/ui/form'

// screen: a Books screen, `ref` is its catalog id. new: a transaction form, `ref` is a
// NEW_ACTIONS id. report: a report, `ref` is the shipped_key of a shipped report or the
// row id of a saved one. register: an account's register, `ref` is the account id.
export const SHORTCUT_KINDS = ['screen', 'new', 'report', 'register'] as const
export type ShortcutKind = (typeof SHORTCUT_KINDS)[number]

// The sidebar is one column: more than this is a second navigation, not shortcuts.
export const MAX_SHORTCUTS = 30

const shortcutSchema = z.object({
    kind: z.enum(SHORTCUT_KINDS),
    ref: z.string().min(1).max(100),
})
export type Shortcut = z.infer<typeof shortcutSchema>

export function shortcutKey(shortcut: Shortcut): string {
    return `${shortcut.kind}:${shortcut.ref}`
}

// A user with no stored row gets these. None repeats an entry of the fixed navigation
// under it: each is a screen that is two presses away without a shortcut.
export const DEFAULT_SHORTCUTS: readonly Shortcut[] = [
    { kind: 'screen', ref: 'customers' },
    { kind: 'screen', ref: 'vendors' },
    { kind: 'screen', ref: 'products' },
    { kind: 'report', ref: 'books.profit_and_loss' },
    { kind: 'report', ref: 'books.balance_sheet' },
]

// The stored value as a list. Anything that is not a list is no shortcuts; an item that
// is not a shortcut, or that repeats an earlier one, is dropped, and the list stops at
// MAX_SHORTCUTS. A stored value is never an error for the reader: the row is written by
// the client, and an older or newer client may have written a kind this one does not know.
export function parseShortcuts(value: unknown): Shortcut[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const out: Shortcut[] = []
    for (const item of value) {
        const parsed = shortcutSchema.safeParse(item)
        if (!parsed.success) continue
        const key = shortcutKey(parsed.data)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ kind: parsed.data.kind, ref: parsed.data.ref })
        if (out.length === MAX_SHORTCUTS) break
    }
    return out
}

export function hasShortcut(list: readonly Shortcut[], shortcut: Shortcut): boolean {
    const key = shortcutKey(shortcut)
    return list.some(item => shortcutKey(item) === key)
}

export function canAddShortcut(list: readonly Shortcut[]): boolean {
    return list.length < MAX_SHORTCUTS
}

// At the end of the list. The same list when it is there already or the list is full.
export function addShortcut(list: readonly Shortcut[], shortcut: Shortcut): Shortcut[] {
    if (hasShortcut(list, shortcut) || !canAddShortcut(list)) return [...list]
    return [...list, shortcut]
}

export function removeShortcut(list: readonly Shortcut[], key: string): Shortcut[] {
    return list.filter(item => shortcutKey(item) !== key)
}

// To `index`, clamped to the list. The same list when `key` is not in it.
export function placeShortcut(list: readonly Shortcut[], key: string, index: number): Shortcut[] {
    const from = list.findIndex(item => shortcutKey(item) === key)
    if (from < 0) return [...list]
    const to = Math.max(0, Math.min(list.length - 1, index))
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

// One place up (-1) or down (1).
export function moveShortcut(list: readonly Shortcut[], key: string, by: -1 | 1): Shortcut[] {
    const from = list.findIndex(item => shortcutKey(item) === key)
    if (from < 0) return [...list]
    return placeShortcut(list, key, from + by)
}
```

- [ ] **Step 4: Run the test and the lint**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/sidebar-shortcuts.test.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/lib/sidebar-shortcuts.ts tests/sidebar-shortcuts.test.ts`
Expected: 19 tests pass; biome reports no error.

- [ ] **Step 5: Commit**

```bash
git add tinycld/books/lib/sidebar-shortcuts.ts tests/sidebar-shortcuts.test.ts
git commit -m "feat(books): sidebar shortcut list model"
```

---

### Task 3: The shortcut catalog

**Files:**
- Create: `tinycld/books/lib/shortcut-catalog.ts`
- Test: `tests/shortcut-catalog.test.ts`

**Interfaces:**
- Consumes: from Task 2, `type Shortcut`, `DEFAULT_SHORTCUTS`, `shortcutKey`. From the tree: `NEW_ACTIONS`, `type NewAction` (`tinycld/books/lib/new-actions.ts`: `{ id, label, href, column, available }`); `SIDEBAR_ENTRIES`, `type SidebarEntry`, `LIST_ENTRIES`, `type ListEntry`, `availableOnly` (`tinycld/books/lib/shell-nav.ts`).
- Produces (all exported from `tinycld/books/lib/shortcut-catalog.ts`):
  - `interface ShortcutTarget { shortcut: Shortcut; label: string; icon: LucideIcon; href: string; params?: Record<string, string>; needsWrite: boolean }`. `href` and `params` are what `useOrgHref()` takes: `orgHref(target.href, target.params)`.
  - `screenTargets(sidebar?: readonly SidebarEntry[], lists?: readonly ListEntry[]): ShortcutTarget[]`, `newTargets(actions?: readonly NewAction[]): ShortcutTarget[]`
  - `SCREEN_TARGETS`, `NEW_TARGETS` (the two above with their defaults)
  - `staticTargets(canWrite: boolean, targets?: readonly ShortcutTarget[]): ShortcutTarget[]`: what the Add picker of part 2 lists for the `screen` and `new` kinds
  - `staticTarget(shortcut: Shortcut, canWrite: boolean, targets?: readonly ShortcutTarget[]): ShortcutTarget | null`: null for a `report` or `register` shortcut, an unknown ref, and a form for a reader
  - `REPORT_SHORTCUT_ICON`, `REGISTER_SHORTCUT_ICON` (lucide icons), `REGISTER_SHORTCUT_ROUTE = 'books/accounts/[id]'` (`orgHref(REGISTER_SHORTCUT_ROUTE, { id })`). A report's route is built in part 2 with `shippedReportHref` (`hooks/useShippedReportHref.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/shortcut-catalog.test.ts`:

```ts
import { List } from 'lucide-react-native'
import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS, type NewAction } from '../tinycld/books/lib/new-actions'
import {
    LIST_ENTRIES,
    type ListEntry,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
} from '../tinycld/books/lib/shell-nav'
import {
    NEW_TARGETS,
    newTargets,
    SCREEN_TARGETS,
    screenTargets,
    staticTarget,
    staticTargets,
} from '../tinycld/books/lib/shortcut-catalog'
import { DEFAULT_SHORTCUTS, shortcutKey } from '../tinycld/books/lib/sidebar-shortcuts'

function sidebarEntry(id: string, over: Partial<SidebarEntry> = {}): SidebarEntry {
    return { id, label: `Label ${id}`, icon: List, href: `books/${id}`, available: true, ...over }
}

function listEntry(id: string, over: Partial<ListEntry> = {}): ListEntry {
    return {
        id,
        label: `List ${id}`,
        description: '',
        href: `books/${id}`,
        available: true,
        ...over,
    }
}

function action(id: string, label: string, over: Partial<NewAction> = {}): NewAction {
    return { id, label, href: `books/${id}/new`, column: 'other', available: true, ...over }
}

describe('screenTargets', () => {
    it('lists every sidebar entry with its label, route and params', () => {
        const targets = screenTargets(SIDEBAR_ENTRIES, [])
        expect(targets.map(target => target.shortcut.ref)).toEqual(
            SIDEBAR_ENTRIES.map(entry => entry.id)
        )
        expect(targets.map(target => [target.label, target.href, target.params])).toEqual(
            SIDEBAR_ENTRIES.map(entry => [entry.label, entry.href, entry.params])
        )
        expect(targets.every(target => target.shortcut.kind === 'screen')).toBe(true)
        expect(targets.every(target => !target.needsWrite)).toBe(true)
    })

    it('keeps the params of an entry that has them', () => {
        const [target] = screenTargets([sidebarEntry('x', { params: { package: 'books' } })], [])
        expect(target.params).toEqual({ package: 'books' })
    })

    it('adds the lists that have no sidebar entry, after the sidebar entries', () => {
        const refs = SCREEN_TARGETS.map(target => target.shortcut.ref)
        expect(refs.slice(-3)).toEqual(['customers', 'vendors', 'products'])
        expect(SCREEN_TARGETS.find(target => target.shortcut.ref === 'customers')).toMatchObject({
            label: 'Customers',
            href: 'books/customers',
        })
    })

    it('lists a screen that is a sidebar entry and a list one time, under the sidebar label', () => {
        const targets = screenTargets(
            [sidebarEntry('accounts', { label: 'Chart of Accounts' })],
            [listEntry('accounts', { label: 'Accounts' }), listEntry('customers')]
        )
        expect(targets.map(target => target.label)).toEqual(['Chart of Accounts', 'List customers'])
    })

    it('leaves out an entry that is not available', () => {
        const targets = screenTargets(
            [sidebarEntry('a'), sidebarEntry('b', { available: false })],
            [listEntry('c', { available: false }), listEntry('d')]
        )
        expect(targets.map(target => target.shortcut.ref)).toEqual(['a', 'd'])
    })

    it('gives every screen its own ref', () => {
        const keys = SCREEN_TARGETS.map(target => shortcutKey(target.shortcut))
        expect(new Set(keys).size).toBe(keys.length)
        expect(LIST_ENTRIES.every(entry => keys.includes(`screen:${entry.id}`))).toBe(true)
    })
})

describe('newTargets', () => {
    it('lists every New action as a form that needs write access', () => {
        expect(NEW_TARGETS.map(target => target.shortcut.ref)).toEqual(
            NEW_ACTIONS.map(newAction => newAction.id)
        )
        expect(NEW_TARGETS.every(target => target.needsWrite)).toBe(true)
        expect(NEW_TARGETS.every(target => target.shortcut.kind === 'new')).toBe(true)
    })

    it('labels a form "New <thing>", and keeps a label that is a verb already', () => {
        const label = (ref: string) =>
            NEW_TARGETS.find(target => target.shortcut.ref === ref)?.label
        expect(label('invoice')).toBe('New invoice')
        expect(label('sales_receipt')).toBe('New sales receipt')
        expect(label('journal-entry')).toBe('New journal entry')
        expect(label('deposit')).toBe('New bank deposit')
        expect(label('product')).toBe('New product or service')
        expect(label('pay_bills')).toBe('Pay bills')
        expect(label('receive_payment')).toBe('Receive payment')
    })

    it('leaves out an action that is not available', () => {
        const targets = newTargets([
            action('a', 'Alpha'),
            action('b', 'Beta', { available: false }),
        ])
        expect(targets.map(target => target.label)).toEqual(['New alpha'])
    })
})

describe('staticTargets and staticTarget', () => {
    it('gives a reader the screens and no form', () => {
        const reader = staticTargets(false)
        expect(reader).toEqual(SCREEN_TARGETS)
        expect(staticTargets(true)).toEqual([...SCREEN_TARGETS, ...NEW_TARGETS])
    })

    it('finds a screen for every user and a form for a writer only', () => {
        expect(staticTarget({ kind: 'screen', ref: 'customers' }, false)?.href).toBe(
            'books/customers'
        )
        expect(staticTarget({ kind: 'new', ref: 'invoice' }, true)?.href).toBe('books/invoices/new')
        expect(staticTarget({ kind: 'new', ref: 'invoice' }, false)).toBeNull()
    })

    it('does not mix a screen with a form of the same ref', () => {
        const targets = [
            ...screenTargets([sidebarEntry('x')], []),
            ...newTargets([action('x', 'X')]),
        ]
        expect(staticTarget({ kind: 'screen', ref: 'x' }, true, targets)?.href).toBe('books/x')
        expect(staticTarget({ kind: 'new', ref: 'x' }, true, targets)?.href).toBe('books/x/new')
    })

    it('has no target for a ref it does not know, a report or a register', () => {
        expect(staticTarget({ kind: 'screen', ref: 'payroll' }, true)).toBeNull()
        expect(staticTarget({ kind: 'new', ref: 'paycheck' }, true)).toBeNull()
        expect(staticTarget({ kind: 'report', ref: 'books.balance_sheet' }, true)).toBeNull()
        expect(staticTarget({ kind: 'register', ref: 'customers' }, true)).toBeNull()
    })

    it('has a target for each default screen shortcut', () => {
        const screens = DEFAULT_SHORTCUTS.filter(shortcut => shortcut.kind === 'screen')
        expect(screens.length).toBeGreaterThan(0)
        for (const shortcut of screens) {
            expect(staticTarget(shortcut, false)).not.toBeNull()
        }
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-catalog.test.ts`
Expected: FAIL, the import of `../tinycld/books/lib/shortcut-catalog` does not resolve.

- [ ] **Step 3: Write the catalog**

Create `tinycld/books/lib/shortcut-catalog.ts`:

```ts
// What a sidebar shortcut can point to, with the label, icon and route the sidebar draws it
// with. A screen and a transaction form are known here. A report and a register are known
// only with data (the report's id and title, the account's name), so the sidebar reads
// those rows itself; this module has only their icon and route.
import type { LucideIcon } from 'lucide-react-native'
import { BarChart3, BookOpen, Package, Plus, Truck, Users } from 'lucide-react-native'
import { NEW_ACTIONS, type NewAction } from './new-actions'
import {
    availableOnly,
    LIST_ENTRIES,
    type ListEntry,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
} from './shell-nav'
import type { Shortcut } from './sidebar-shortcuts'

export interface ShortcutTarget {
    shortcut: Shortcut
    label: string
    icon: LucideIcon
    href: string
    params?: Record<string, string>
    // A transaction form: only a user who can write gets it.
    needsWrite: boolean
}

export const REPORT_SHORTCUT_ICON = BarChart3
export const REGISTER_SHORTCUT_ICON = BookOpen
export const REGISTER_SHORTCUT_ROUTE = 'books/accounts/[id]'

const LIST_ICONS: Record<string, LucideIcon> = {
    customers: Users,
    vendors: Truck,
    products: Package,
}

// The actions whose label is what you do, not what you make.
const VERB_ACTIONS = new Set(['pay_bills', 'receive_payment'])

function newLabel(action: NewAction): string {
    if (VERB_ACTIONS.has(action.id)) return action.label
    return `New ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}`
}

// Every sidebar entry, then each list that has no sidebar entry of its own (a list with
// one, Chart of Accounts and Journal Entries, is listed once, under the sidebar's label).
export function screenTargets(
    sidebar: readonly SidebarEntry[] = SIDEBAR_ENTRIES,
    lists: readonly ListEntry[] = LIST_ENTRIES
): ShortcutTarget[] {
    const fromSidebar = availableOnly(sidebar).map(
        (entry): ShortcutTarget => ({
            shortcut: { kind: 'screen', ref: entry.id },
            label: entry.label,
            icon: entry.icon,
            href: entry.href,
            params: entry.params,
            needsWrite: false,
        })
    )
    const taken = new Set(fromSidebar.map(target => target.shortcut.ref))
    const fromLists = availableOnly(lists)
        .filter(entry => !taken.has(entry.id))
        .map(
            (entry): ShortcutTarget => ({
                shortcut: { kind: 'screen', ref: entry.id },
                label: entry.label,
                icon: LIST_ICONS[entry.id] ?? BookOpen,
                href: entry.href,
                needsWrite: false,
            })
        )
    return [...fromSidebar, ...fromLists]
}

export function newTargets(actions: readonly NewAction[] = NEW_ACTIONS): ShortcutTarget[] {
    return availableOnly(actions).map(
        (action): ShortcutTarget => ({
            shortcut: { kind: 'new', ref: action.id },
            label: newLabel(action),
            icon: Plus,
            href: action.href,
            needsWrite: true,
        })
    )
}

export const SCREEN_TARGETS = screenTargets()
export const NEW_TARGETS = newTargets()

// The screens and forms a user can add as a shortcut. A reader gets no form.
export function staticTargets(
    canWrite: boolean,
    targets: readonly ShortcutTarget[] = [...SCREEN_TARGETS, ...NEW_TARGETS]
): ShortcutTarget[] {
    return targets.filter(target => canWrite || !target.needsWrite)
}

// The target of a `screen` or `new` shortcut. Null for a report or a register (the sidebar
// reads those), for a ref this build does not know, and for a form when the user cannot
// write: the sidebar draws nothing for a null.
export function staticTarget(
    shortcut: Shortcut,
    canWrite: boolean,
    targets?: readonly ShortcutTarget[]
): ShortcutTarget | null {
    if (shortcut.kind !== 'screen' && shortcut.kind !== 'new') return null
    const found = staticTargets(canWrite, targets).find(
        target => target.shortcut.kind === shortcut.kind && target.shortcut.ref === shortcut.ref
    )
    return found ?? null
}
```

- [ ] **Step 4: Run the test and the lint**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-catalog.test.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/lib/shortcut-catalog.ts tests/shortcut-catalog.test.ts`
Expected: 14 tests pass; biome reports no error.

- [ ] **Step 5: Commit**

```bash
git add tinycld/books/lib/shortcut-catalog.ts tests/shortcut-catalog.test.ts
git commit -m "feat(books): catalog of what a sidebar shortcut points to"
```

---

### Task 4: The hook `useSidebarShortcuts`

**Files:**
- Create: `tinycld/books/hooks/useSidebarShortcuts.ts`
- Test: `tests/useSidebarShortcuts.test.tsx`

**Interfaces:**
- Consumes: from Task 1, the store `'books_sidebar_shortcuts'` and `type BooksSidebarShortcuts`. From Task 2, `DEFAULT_SHORTCUTS`, `parseShortcuts`, `type Shortcut`. From the tree: `useMyLiveQuery` (`@tinycld/core/lib/use-my-live-query`), `useMutation` (`@tinycld/core/lib/mutations`; it passes TanStack Query's `scope` through), `useStore` (`@tinycld/core/lib/pocketbase`), `useAuth` (`@tinycld/core/lib/auth`), `useToastStore` (`@tinycld/core/lib/stores/toast-store`), `newRecordId` (`pbtsdb/core`), `type LiveRecovery` (`tinycld/books/lib/live-recovery.ts`: `{ queries, sources }`). Test harness (`tests/accounts-form-harness.ts`): `seedBooks({ level })`, `guardedStore<T>(name, rows)` (writes go through the shared handler; call after `seedBooks`), `onDemandStore<T>(name, rows, { field, value })` (refuses the first load that filters on `field = value`), `holdWrites()` (returns the release function), `enteredWrites()` (the row ids of the writes that reached the handler), `refuseNthWrite(nth, error)`, `messageRefusal(message)`, `ME = 'u1'`, `useStoreStub`; `tests/silence-log.ts`: `silenceLog()` (call at module level), `expectLiveQueryError(sourceId)`.
- Produces: `useSidebarShortcuts(): { shortcuts: Shortcut[]; isCustomized: boolean; isReady: boolean; isError: boolean; recovery: LiveRecovery; save(next: Shortcut[]): void; reset(): void; isSaving: boolean }`.
  - `shortcuts` is `[]` until the read is ready and when it failed; `DEFAULT_SHORTCUTS` (a copy) when the user has no row; the parsed stored list when there is a row. It keeps its identity while the stored value is the same.
  - `save(next)` writes the whole list (insert on the first save, update after). `reset()` deletes the row. Both do nothing until the read is ready and not failed. Writes run one at a time.
  - **Contract for the caller:** a write that waits behind an earlier one is not in `shortcuts` until the earlier request returns (`useMutation` with a `scope` runs its `mutationFn`, and so its optimistic write, only then; see the doc comment of `useStagedMutation` in core `lib/mutations.ts`). So a caller never computes `next` from `shortcuts` for each small change. The Customize dialog of part 2 (tasks 10, 11) edits a draft list of its own (add, remove, move change the draft only) and calls `save(draft)` one time, on its Save button; Reset to defaults calls `reset()` one time. This is also QuickBooks' model (Customize Shortcuts has OK and Cancel). The serial scope stays as the guard for two saves in a row.
  - A refused write shows the toast "The shortcut change was not saved." and logs `books.sidebar.shortcuts` at warn; pbtsdb rolls the list back.
  - Part 2 passes `recovery` to core `recoverLiveQueries` for the Retry of a failed read.

- [ ] **Step 1: Write the failing test**

Create `tests/useSidebarShortcuts.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarShortcuts } from '../tinycld/books/hooks/useSidebarShortcuts'
import { DEFAULT_SHORTCUTS, type Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    holdWrites,
    ME,
    messageRefusal,
    onDemandStore,
    refuseNthWrite,
    seedBooks,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused save logs a warning on purpose.
silenceLog()

const STAMP = '2026-11-01 00:00:00.000Z'
const CUSTOMERS: Shortcut = { kind: 'screen', ref: 'customers' }
const INVOICE: Shortcut = { kind: 'new', ref: 'invoice' }
const BALANCE_SHEET: Shortcut = { kind: 'report', ref: 'books.balance_sheet' }

function stored(id: string, user: string, items: unknown): BooksSidebarShortcuts {
    return { id, user, items, created: STAMP, updated: STAMP }
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function renderShortcuts(rows: BooksSidebarShortcuts[]) {
    seedBooks({ level: 'bookkeeper' })
    const store = guardedStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', rows)
    const rendered = renderHook(() => useSidebarShortcuts(), { wrapper })
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return { ...rendered, store }
}

beforeEach(() => {
    useToastStore.setState({ toasts: [] })
})

describe('useSidebarShortcuts read', () => {
    it('gives the defaults to a user with no row', async () => {
        const { result } = await renderShortcuts([])

        expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS])
        expect(result.current.isCustomized).toBe(false)
    })

    it('gives the stored list in its order', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, [INVOICE, CUSTOMERS])])

        expect(result.current.shortcuts).toEqual([INVOICE, CUSTOMERS])
        expect(result.current.isCustomized).toBe(true)
    })

    it('gives an empty list, not the defaults, to a user who removed every shortcut', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, [])])

        expect(result.current.shortcuts).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('never reads another user row', async () => {
        const { result } = await renderShortcuts([stored('theirs', 'u2', [INVOICE])])

        expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS])
        expect(result.current.isCustomized).toBe(false)
    })

    it('drops what is not a shortcut from a stored list', async () => {
        const { result } = await renderShortcuts([
            stored('row1', ME, [CUSTOMERS, { kind: 'bookmark', ref: 'x' }, null, INVOICE]),
        ])

        expect(result.current.shortcuts).toEqual([CUSTOMERS, INVOICE])
    })

    it('reads a stored value that is not a list as no shortcuts', async () => {
        const { result } = await renderShortcuts([stored('row1', ME, 'broken')])

        expect(result.current.shortcuts).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('keeps the same list across renders while the stored value is the same', async () => {
        const { result, rerender } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])
        const first = result.current.shortcuts

        rerender()

        expect(result.current.shortcuts).toBe(first)
    })
})

describe('useSidebarShortcuts save', () => {
    it('makes the row on the first save, for the signed-in user', async () => {
        const { result, store } = await renderShortcuts([])

        act(() => result.current.save([INVOICE]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([INVOICE]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toHaveLength(1)
        expect(store.toArray[0]).toMatchObject({ user: ME, items: [INVOICE] })
        expect(result.current.isCustomized).toBe(true)
    })

    it('updates the row on a later save and makes no second row', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])

        act(() => result.current.save([CUSTOMERS, BALANCE_SHEET]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([CUSTOMERS, BALANCE_SHEET]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray.map(row => row.id)).toEqual(['row1'])
        expect(enteredWrites()).toEqual(['row1'])
    })

    it('saves an empty list as an empty list', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])

        act(() => result.current.save([]))

        await waitFor(() => expect(result.current.shortcuts).toEqual([]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray[0].items).toEqual([])
        expect(result.current.isCustomized).toBe(true)
    })

    it('runs two fast saves one after the other on one row', async () => {
        const { result, store } = await renderShortcuts([])
        const release = holdWrites()

        act(() => result.current.save([INVOICE]))
        act(() => result.current.save([INVOICE, CUSTOMERS]))
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        // The second save waits for the first: it does not reach the server while the
        // first is held.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(enteredWrites()).toHaveLength(1)
        expect(result.current.isSaving).toBe(true)
        release()

        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toHaveLength(1)
        expect(store.toArray[0].items).toEqual([INVOICE, CUSTOMERS])
        const [first, second] = enteredWrites()
        expect(second).toBe(first)
    })

    it('returns to the saved list and tells the user when the server refuses', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [CUSTOMERS])])
        refuseNthWrite(1, messageRefusal('Nope.'))

        act(() => result.current.save([INVOICE]))

        await waitFor(() =>
            expect(useToastStore.getState().toasts.map(toast => toast.title)).toEqual([
                'The shortcut change was not saved.',
            ])
        )
        await waitFor(() => expect(result.current.shortcuts).toEqual([CUSTOMERS]))
        expect(store.toArray[0].items).toEqual([CUSTOMERS])
        expect(result.current.isSaving).toBe(false)
    })
})

describe('useSidebarShortcuts reset', () => {
    it('deletes the row, which brings the defaults back', async () => {
        const { result, store } = await renderShortcuts([stored('row1', ME, [INVOICE])])

        act(() => result.current.reset())

        await waitFor(() => expect(result.current.shortcuts).toEqual([...DEFAULT_SHORTCUTS]))
        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(store.toArray).toEqual([])
        expect(result.current.isCustomized).toBe(false)
    })

    it('writes nothing for a user with no row', async () => {
        const { result } = await renderShortcuts([])

        act(() => result.current.reset())

        await waitFor(() => expect(result.current.isSaving).toBe(false))
        expect(enteredWrites()).toEqual([])
    })
})

describe('useSidebarShortcuts load error', () => {
    function renderRefused() {
        seedBooks({ level: 'bookkeeper' })
        const store = onDemandStore<BooksSidebarShortcuts>(
            'books_sidebar_shortcuts',
            [stored('row1', ME, [INVOICE])],
            { field: 'user', value: ME }
        )
        expectLiveQueryError(store.id)
        return { ...renderHook(() => useSidebarShortcuts(), { wrapper }), store }
    }

    it('shows no shortcut, not the defaults, and writes nothing', async () => {
        const { result, store } = renderRefused()

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.shortcuts).toEqual([])
        expect(result.current.recovery.sources).toEqual([store])
        expect(result.current.recovery.queries).toHaveLength(1)

        act(() => result.current.save([CUSTOMERS]))
        act(() => result.current.reset())
        expect(result.current.isSaving).toBe(false)
        expect(enteredWrites()).toEqual([])
    })

    it('reads the stored list after the recovery', async () => {
        const { result } = renderRefused()
        await waitFor(() => expect(result.current.isError).toBe(true))

        const onError = vi.fn()
        act(() => {
            void recoverLiveQueries({ ...result.current.recovery, onError })
        })

        await waitFor(() => expect(result.current.isError).toBe(false))
        await waitFor(() => expect(result.current.shortcuts).toEqual([INVOICE]))
        expect(onError).not.toHaveBeenCalled()
        expect(result.current.recovery).toEqual({ queries: [], sources: [] })
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/useSidebarShortcuts.test.tsx`
Expected: FAIL, the import of `../tinycld/books/hooks/useSidebarShortcuts` does not resolve.

- [ ] **Step 3: Write the hook**

Create `tinycld/books/hooks/useSidebarShortcuts.ts`:

```ts
import { eq } from '@tanstack/db'
import { useAuth } from '@tinycld/core/lib/auth'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import { DEFAULT_SHORTCUTS, parseShortcuts, type Shortcut } from '../lib/sidebar-shortcuts'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_SHORTCUTS: Shortcut[] = []

// One writer at a time for the whole app: the second of two fast changes runs after the
// first has landed, so it updates the row the first one made instead of making a second.
const WRITE_SCOPE = { id: 'books-sidebar-shortcuts' }

// The optimistic value is rolled back by pbtsdb, so the sidebar returns to the saved list
// with no state of its own here.
function reportSaveError(error: Error) {
    log.warn('books.sidebar.shortcuts', 'the shortcut change was not saved', { error })
    useToastStore.getState().addToast({
        title: 'The shortcut change was not saved.',
        variant: 'error',
        duration: 5000,
    })
}

/**
 * The signed-in user's sidebar shortcuts. `shortcuts` is empty until the read is ready
 * (the sidebar must not draw the defaults and then swap them), the defaults when the
 * user has no row, and the stored list when there is one, an empty list included.
 * `save` writes the whole list and `reset` deletes the row, which brings the defaults
 * back; both do nothing until the read is ready. A failed read returns `isError` and the
 * `recovery` for recoverLiveQueries.
 */
export function useSidebarShortcuts() {
    const [shortcutsCollection] = useStore('books_sidebar_shortcuts')
    const userId = useAuth({ throwIfAnon: false }).user?.id ?? ''
    const {
        data: row,
        isReady,
        isError,
        collection: query,
    } = useMyLiveQuery(
        (q, me) =>
            q
                .from({ row: shortcutsCollection })
                .where(({ row }) => eq(row.user, me.userId))
                .findOne(),
        { queryKey: ['books', 'sidebar-shortcuts'] }
    )

    const items = row?.items
    const isCustomized = row !== undefined
    const shortcuts = useMemo(() => {
        if (!isReady || isError) return NO_SHORTCUTS
        return isCustomized ? parseShortcuts(items) : [...DEFAULT_SHORTCUTS]
    }, [isReady, isError, isCustomized, items])

    // Read when the write runs, not when it was asked for: a write waits for the one
    // before it (WRITE_SCOPE), and that one may have made the row.
    const storedRow = () => shortcutsCollection.toArray.find(stored => stored.user === userId)

    const saveMutation = useMutation({
        scope: WRITE_SCOPE,
        mutationFn: function* (next: Shortcut[]) {
            const stored = storedRow()
            if (stored) {
                yield shortcutsCollection.update(stored.id, draft => {
                    draft.items = next
                })
            } else {
                yield shortcutsCollection.insert({ id: newRecordId(), user: userId, items: next })
            }
        },
        onError: reportSaveError,
    })
    const resetMutation = useMutation({
        scope: WRITE_SCOPE,
        mutationFn: function* () {
            const stored = storedRow()
            if (stored) yield shortcutsCollection.delete(stored.id)
        },
        onError: reportSaveError,
    })

    const canWrite = isReady && !isError && userId !== ''
    const save = (next: Shortcut[]) => {
        if (canWrite) saveMutation.mutate(next)
    }
    const reset = () => {
        if (canWrite) resetMutation.mutate()
    }
    const recovery: LiveRecovery =
        isError && query ? { queries: [query], sources: [shortcutsCollection] } : NO_RECOVERY

    return {
        shortcuts,
        isCustomized,
        isReady,
        isError,
        recovery,
        save,
        reset,
        isSaving: saveMutation.isPending || resetMutation.isPending,
    }
}
```

Two things in it are load-bearing; do not simplify them away:
- `scope: WRITE_SCOPE` on both mutations. Without it the test "runs two fast saves one after the other on one row" fails with two writes at the server at one time (this was run), and on a real server the second write would be a second insert that the unique index refuses.
- `storedRow()` is called inside `mutationFn`, not captured from the render: a queued write must see the row the write before it made.

- [ ] **Step 4: Run the test, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/useSidebarShortcuts.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/hooks/useSidebarShortcuts.ts tests/useSidebarShortcuts.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: 16 tests pass; biome reports no error; the typecheck prints no error.

- [ ] **Step 5: Commit**

```bash
git add tinycld/books/hooks/useSidebarShortcuts.ts tests/useSidebarShortcuts.test.tsx
git commit -m "feat(books): useSidebarShortcuts reads and saves the user's shortcut list"
```

---

### Task 5: One e2e door to the New actions, helpers A

Part 2 (task 9) moves the New actions from the popover into the sidebar. Today 13 e2e helper files and 4 specs each open the popover with their own copy of the same five lines. This task and the next two route them all through one file, with no change of behavior, so that task 9 changes one file. No product code changes in tasks 5, 6 and 7.

**Files:**
- Create: `tests/e2e/new-menu-helpers.ts`
- Modify: `tests/e2e/credit-memo-helpers.ts:22-34`
- Modify: `tests/e2e/bank-deposit-helpers.ts:194-204`
- Modify: `tests/e2e/sales-receipt-helpers.ts:23-34`
- Modify: `tests/e2e/refund-receipt-helpers.ts:1-2,37-48`
- Modify: `tests/e2e/pay-bills-helpers.ts:1-2,113-124`
- Modify: `tests/e2e/estimate-helpers.ts:22-33`
- Modify: `tests/e2e/transfer-helpers.ts:3,33-44`

**Interfaces:**
- Consumes: `isPhone(page)` from `tests/e2e/account-register-helpers.ts`.
- Produces (all exported from `tests/e2e/new-menu-helpers.ts`):
  - `newActionTestId(id: string): string` (`'sales_receipt'` gives `'books-new-sales-receipt'`)
  - `openNewMenu(page: Page): Promise<void>` opens the menu and leaves it open
  - `newActionItem(page: Page, id: string): Locator`
  - `openNewAction(page: Page, id: string): Promise<void>` opens the menu and presses the action
  - `id` is always a `NEW_ACTIONS` id from `tinycld/books/lib/new-actions.ts` (with its underscores or dash as written there, for example `'credit_memo'`, `'journal-entry'`).

- [ ] **Step 1: Write the helper file**

Create `tests/e2e/new-menu-helpers.ts`:

```ts
import type { Locator, Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'

// The one place that knows how a spec reaches the actions of Books' New menu. Every
// helper and spec that starts a transaction from New goes through these three, so a
// change of where the actions live changes this file only.
//
// Today: the round New button (core's FAB, which has no button role) on a phone, the
// sidebar's New text on a wide screen; both open one menu of `books-new-<id>` items.

// The test id of the action with this NEW_ACTIONS id (lib/new-actions.ts). A test id
// never holds an underscore: `sales_receipt` is `books-new-sales-receipt`.
export function newActionTestId(id: string): string {
    return `books-new-${id.replace(/_/g, '-')}`
}

// Books must be open on a screen that shows New (a list, not a form). Opens the menu and
// leaves it open.
export async function openNewMenu(page: Page): Promise<void> {
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
}

// The action's item in the open menu.
export function newActionItem(page: Page, id: string): Locator {
    return page.getByTestId(newActionTestId(id))
}

// Opens the menu and presses the action. The caller checks where it lands.
export async function openNewAction(page: Page, id: string): Promise<void> {
    await openNewMenu(page)
    await newActionItem(page, id).click()
}
```

- [ ] **Step 2: Route the seven helpers through it**

In each file, the function below holds this block (the last line names the file's own test id):

```ts
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-<name>').click()
```

Replace the whole block (all six lines) with the one line in the table, add `import { openNewAction } from './new-menu-helpers'` to the file's imports, and in the comment above the function replace the words "(the phone FAB, or the desktop header's New text)" by "(tests/e2e/new-menu-helpers.ts)" where the comment has them (in most files the words wrap across two comment lines, so search for "the phone FAB"). Leave every other line of the function as it is (the `openEntriesList` / `showEntriesList` call before the block, the URL and title checks after it).

| File | Function | Replacement line | `isPhone` import after the change |
|---|---|---|---|
| `credit-memo-helpers.ts` | `openNewCreditMemo` | `await openNewAction(page, 'credit_memo')` | keep (used elsewhere in the file) |
| `bank-deposit-helpers.ts` | `openNewDeposit` | `await openNewAction(page, 'deposit')` | keep |
| `sales-receipt-helpers.ts` | `openNewSalesReceipt` | `await openNewAction(page, 'sales_receipt')` | keep |
| `refund-receipt-helpers.ts` | `openNewRefundReceipt` | `await openNewAction(page, 'refund_receipt')` | remove line 2, `import { isPhone } from './account-register-helpers'` (this was its only use) |
| `pay-bills-helpers.ts` | `openPayBills` | `await openNewAction(page, 'pay_bills')` | remove line 2, `import { isPhone } from './account-register-helpers'`; keep line 21, `export { DESKTOP, PHONE } from './account-register-helpers'` |
| `estimate-helpers.ts` | `openNewEstimate` | `await openNewAction(page, 'estimate')` | keep |
| `transfer-helpers.ts` | `openNewTransfer` | `await openNewAction(page, 'transfer')` | remove line 3, `import { isPhone } from './account-register-helpers'`; keep line 6, `export { DESKTOP, isPhone, PHONE } from './account-register-helpers'` |

As an example, `openNewCreditMemo` in `tests/e2e/credit-memo-helpers.ts` becomes:

```ts
// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) → Credit memo.
export async function openNewCreditMemo(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'credit_memo')
    await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
}
```

- [ ] **Step 3: Check that no copy is left in the seven files, then lint and typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books/tests/e2e && command grep -c "getByLabel('New'" credit-memo-helpers.ts bank-deposit-helpers.ts sales-receipt-helpers.ts refund-receipt-helpers.ts pay-bills-helpers.ts estimate-helpers.ts transfer-helpers.ts`
Expected: `:0` for each of the seven files.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check --write tests/e2e/new-menu-helpers.ts tests/e2e/credit-memo-helpers.ts tests/e2e/bank-deposit-helpers.ts tests/e2e/sales-receipt-helpers.ts tests/e2e/refund-receipt-helpers.ts tests/e2e/pay-bills-helpers.ts tests/e2e/estimate-helpers.ts tests/e2e/transfer-helpers.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: biome reports no error (it may sort the new import); the typecheck prints no error. An "unused import `isPhone`" error means the table's last column was not followed for that file.

- [ ] **Step 4: Run two specs that use the changed helpers, at phone and desktop widths**

This task has no failing test to start from: it changes test code only and must leave every spec's behavior the same. Its proof is that specs which went through the old lines pass through the new file. `credit-memo-form.spec.ts` opens New on a phone and on a wide screen; `pay-bills-phone.spec.ts` opens it on a phone.

Run (from `/Users/nas/tmp/tinycld/books`, in the foreground):

```bash
lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/credit-memo-form.spec.ts books/tests/e2e/pay-bills-phone.spec.ts
```

Expected: the `Running N tests` line counts only the tests of these two files, and all pass. If the run needs more than about 4 minutes, hand back `NEEDS-RUN:` with this command.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/new-menu-helpers.ts tests/e2e/credit-memo-helpers.ts tests/e2e/bank-deposit-helpers.ts tests/e2e/sales-receipt-helpers.ts tests/e2e/refund-receipt-helpers.ts tests/e2e/pay-bills-helpers.ts tests/e2e/estimate-helpers.ts tests/e2e/transfer-helpers.ts
git commit -m "test(books): one e2e door to the New actions, first helpers"
```

---

### Task 6: One e2e door to the New actions, helpers B

**Files:**
- Modify: `tests/e2e/vendor-refund-helpers.ts:3,130-142`
- Modify: `tests/e2e/bill-helpers.ts:21-33`
- Modify: `tests/e2e/invoice-helpers.ts:2,33-44`
- Modify: `tests/e2e/vendor-credit-helpers.ts:2,20-32`
- Modify: `tests/e2e/expense-helpers.ts:2,19-31`
- Modify: `tests/e2e/receive-payment-helpers.ts:139-147`
- Modify: `tests/e2e/customer-pages-transactions.spec.ts:320-322`

**Interfaces:**
- Consumes: from Task 5, `openNewAction(page: Page, id: string): Promise<void>` exported from `tests/e2e/new-menu-helpers.ts` (it opens the New menu, the round button on a phone or the sidebar's New on a wide screen, and presses the action with that `NEW_ACTIONS` id).
- Produces: nothing new. After this task no helper file in `tests/e2e` opens the New menu on its own.

- [ ] **Step 1: Route the five helpers that hold the six-line block**

In each file, the function below holds this block (the last line names the file's own test id):

```ts
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-<name>').click()
```

Replace the whole block (all six lines) with the one line in the table, add `import { openNewAction } from './new-menu-helpers'` to the file's imports, and in the comment above the function replace the words "the phone FAB, or the desktop header's New text" by "tests/e2e/new-menu-helpers.ts" (the words wrap across two comment lines in most files; search for "the phone FAB"). Leave every other line of the function as it is.

| File | Function | Replacement line | `isPhone` import after the change |
|---|---|---|---|
| `vendor-refund-helpers.ts` | `openNewVendorRefund` | `await openNewAction(page, 'vendor_refund')` | line 3 becomes `import { DESKTOP } from './account-register-helpers'` (this was the only use of `isPhone`) |
| `bill-helpers.ts` | `openNewBill` | `await openNewAction(page, 'bill')` | keep (used elsewhere in the file) |
| `invoice-helpers.ts` | `openNewInvoice` | `await openNewAction(page, 'invoice')` | remove line 2, `import { isPhone } from './account-register-helpers'`; keep line 6, `export { DESKTOP } from './account-register-helpers'` |
| `vendor-credit-helpers.ts` | `openNewVendorCredit` | `await openNewAction(page, 'vendor_credit')` | remove line 2, `import { isPhone } from './account-register-helpers'` |
| `expense-helpers.ts` | `clickNewExpense` | `await openNewAction(page, 'expense')` | remove line 2, `import { isPhone } from './account-register-helpers'` |

- [ ] **Step 2: Route `openNewPayment` and the customer page spec**

`tests/e2e/receive-payment-helpers.ts` (a desktop-only helper, with two lines instead of six). Replace

```ts
    await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    await page.getByTestId('books-new-receive-payment').click()
```

with

```ts
    await openNewAction(page, 'receive_payment')
```

and add `import { openNewAction } from './new-menu-helpers'` to its imports.

`tests/e2e/customer-pages-transactions.spec.ts`, lines 320-322. Replace

```ts
        // The invoice from the sidebar's New menu, pushed over the list; Back returns.
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
        await page.getByTestId('books-new-invoice').click()
```

with

```ts
        // The invoice from the New menu, pushed over the list; Back returns.
        await openNewAction(page, 'invoice')
```

and add `import { openNewAction } from './new-menu-helpers'` to its imports. Do not touch any other `books-new-` line of this spec: the customer page's own "New transaction" menu draws items with the same test ids, and it does not change in this unit.

- [ ] **Step 3: Check that no helper file opens the menu on its own, then lint and typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books/tests/e2e && command grep -lE "getBy(Label|Text)\('New', \{ exact: true \}\)" *-helpers.ts`
Expected: one line only, `new-menu-helpers.ts`.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check --write tests/e2e/vendor-refund-helpers.ts tests/e2e/bill-helpers.ts tests/e2e/invoice-helpers.ts tests/e2e/vendor-credit-helpers.ts tests/e2e/expense-helpers.ts tests/e2e/receive-payment-helpers.ts tests/e2e/customer-pages-transactions.spec.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: biome reports no error; the typecheck prints no error.

- [ ] **Step 4: Run four specs that use the changed files**

As Task 5, this task changes test code only; its proof is that specs pass through the new file. `vendor-refund-phone.spec.ts` opens New on a phone, `vendor-credit-form.spec.ts` and `expense-form.spec.ts` on their own widths, and `customer-pages-transactions.spec.ts` is the spec this task changes (it also goes through the invoice and receive-payment helpers).

Run (from `/Users/nas/tmp/tinycld/books`, in the foreground):

```bash
lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/vendor-refund-phone.spec.ts books/tests/e2e/vendor-credit-form.spec.ts books/tests/e2e/expense-form.spec.ts books/tests/e2e/customer-pages-transactions.spec.ts
```

Expected: the `Running N tests` line counts only the tests of these four files, and all pass. If the run needs more than about 4 minutes, hand back `NEEDS-RUN:` with this command.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/vendor-refund-helpers.ts tests/e2e/bill-helpers.ts tests/e2e/invoice-helpers.ts tests/e2e/vendor-credit-helpers.ts tests/e2e/expense-helpers.ts tests/e2e/receive-payment-helpers.ts tests/e2e/customer-pages-transactions.spec.ts
git commit -m "test(books): one e2e door to the New actions, remaining helpers"
```

---

### Task 7: One e2e door to the New actions, the specs that read the menu

Three specs open the New menu to read its items, not only to press one. They keep their checks; only the way they open the menu and find an item goes through `tests/e2e/new-menu-helpers.ts`. The checks that depend on the menu's structure (an item's next sibling, an item's column) stay as they are: they hold for the popover, and part 2 (task 9) rewrites them with the sidebar section.

These specs are NOT changed by this task, because they only check that the round New button is shown or hidden, or that a reader has no New, which is true for the popover as written (task 9 of part 2 rewrites the two reader checks named in the last section of this plan): `statements-tab.spec.ts`, `journal-entries-read-only.spec.ts`, `bank-deposit-elsewhere.spec.ts`, `credit-memo-form.spec.ts`, `products-services-list.spec.ts`, `vendor-1099-vendors.spec.ts`, `vendor-form-list.spec.ts`, `customer-form-list.spec.ts`.

**Files:**
- Modify: `tests/e2e/journal-entries-list-states.spec.ts:84-85`
- Modify: `tests/e2e/transfer-form.spec.ts:65-71`
- Modify: `tests/e2e/customer-form-page.spec.ts:227-232`

**Interfaces:**
- Consumes: from Task 5, exported from `tests/e2e/new-menu-helpers.ts`: `openNewMenu(page: Page): Promise<void>` (opens the menu and leaves it open), `newActionItem(page: Page, id: string): Locator` (the item of the `NEW_ACTIONS` id in the open menu), `newActionTestId(id: string): string` (`'transfer'` gives `'books-new-transfer'`).
- Produces: nothing new. After this task, the only files in `tests/e2e` that press the New trigger themselves are `new-menu-helpers.ts` and the eight button-visibility specs listed above.

- [ ] **Step 1: `journal-entries-list-states.spec.ts`**

Replace

```ts
        await page.getByLabel('New', { exact: true }).click()
        await expect(page.getByTestId('books-new-journal-entry')).toHaveText('Journal entry')
```

with

```ts
        await openNewMenu(page)
        await expect(newActionItem(page, 'journal-entry')).toHaveText('Journal entry')
```

and add `import { newActionItem, openNewMenu } from './new-menu-helpers'` to its imports (after the `./journal-entries-helpers` import).

- [ ] **Step 2: `transfer-form.spec.ts`**

Replace

```ts
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()

        const item = page.getByTestId('books-new-transfer')
        await expect(item).toHaveText('Transfer')
        await expect(
            page.getByTestId('books-new-journal-entry').locator('xpath=following-sibling::*[1]')
        ).toHaveAttribute('data-testid', 'books-new-transfer')
```

with

```ts
        await openNewMenu(page)

        const item = newActionItem(page, 'transfer')
        await expect(item).toHaveText('Transfer')
        await expect(
            newActionItem(page, 'journal-entry').locator('xpath=following-sibling::*[1]')
        ).toHaveAttribute('data-testid', newActionTestId('transfer'))
```

and add `import { newActionItem, newActionTestId, openNewMenu } from './new-menu-helpers'` to its imports (after the `./journal-entries-helpers` import). The line after the block, `await item.click()`, stays.

- [ ] **Step 3: `customer-form-page.spec.ts`**

Replace

```ts
            if (phone) {
                await fab.click()
            } else {
                await page.getByText('New', { exact: true }).filter({ visible: true }).click()
            }
            const newCustomer = page.getByTestId('books-new-customer')
```

with

```ts
            await openNewMenu(page)
            const newCustomer = newActionItem(page, 'customer')
```

and add `import { newActionItem, openNewMenu } from './new-menu-helpers'` to its imports. Keep line 223, `const fab = page.getByLabel('New', { exact: true })`, and line 239, `if (phone) await expect(fab).toBeHidden()`: they check the button, not the menu, and `phone` is still used there.

- [ ] **Step 4: Lint and typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check --write tests/e2e/journal-entries-list-states.spec.ts tests/e2e/transfer-form.spec.ts tests/e2e/customer-form-page.spec.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: biome reports no error; the typecheck prints no error.

Run: `cd /Users/nas/tmp/tinycld/books/books/tests/e2e && command grep -lE "getByText\('New', \{ exact: true \}\)" *.ts`
Expected: three lines: `new-menu-helpers.ts`, and the two reader checks `statements-tab.spec.ts` and `bank-deposit-elsewhere.spec.ts`.

- [ ] **Step 5: Run the three specs**

As Tasks 5 and 6, this task changes test code only; its proof is that the three specs pass.

Run (from `/Users/nas/tmp/tinycld/books`, in the foreground):

```bash
lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/journal-entries-list-states.spec.ts books/tests/e2e/transfer-form.spec.ts books/tests/e2e/customer-form-page.spec.ts
```

Expected: the `Running N tests` line counts only the tests of these three files, and all pass. If the run needs more than about 4 minutes, hand back `NEEDS-RUN:` with this command.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/journal-entries-list-states.spec.ts tests/e2e/transfer-form.spec.ts tests/e2e/customer-form-page.spec.ts
git commit -m "test(books): specs that read the New menu go through the one door"
```

---

## What parts 2 and 3 take from this part

Part 2 (`docs/plans/2026-11-23-sidebar-shortcuts-part2.md`, tasks 8-15 of the outline) and part 3 (`-part3.md`, tasks 16-20) build on these names; they are final:

- `useSidebarShortcuts()` and its return (Task 4); `Shortcut`, `shortcutKey`, `addShortcut`, `removeShortcut`, `moveShortcut`, `placeShortcut`, `canAddShortcut`, `hasShortcut`, `MAX_SHORTCUTS`, `DEFAULT_SHORTCUTS` (Task 2); `ShortcutTarget`, `staticTarget`, `staticTargets`, `REPORT_SHORTCUT_ICON`, `REGISTER_SHORTCUT_ICON`, `REGISTER_SHORTCUT_ROUTE` (Task 3).
- `tests/e2e/new-menu-helpers.ts` (Task 5): task 9 changes the bodies of `newActionTestId`, `openNewMenu` and `newActionItem` to the sidebar's New section and keeps the four signatures. The fold state of the New section is kept, so the new `openNewMenu` opens the section when it is closed and never toggles it.
- Reader checks that task 9 must rewrite with the new test ids, because they would pass with no meaning after the popover leaves: `tests/e2e/statements-tab.spec.ts:309-310` (`getByLabel('New')` and `books-new-statement` have count 0) and the reader check of `tests/e2e/bank-deposit-elsewhere.spec.ts` (found by `command grep -n "getByText('New'" tests/e2e/bank-deposit-elsewhere.spec.ts`). Each must also assert `newActionItem(page, '<id>')` has count 0 and that the New section heading (`books-sidebar-new-toggle`) is absent. Part 1 leaves them: they are true for the popover as written.
- The Customize dialog works on a draft and saves one time (the contract in Task 4's Interfaces).
- A stored `screen` shortcut whose entry no longer exists (for example `screen:reports` after task 14 takes `reports` out of `SIDEBAR_ENTRIES`) gives `staticTarget` null: the row is not drawn. Task 14 states this in its plan.
- The harness call for a writable shortcuts store in a unit test: `seedBooks({ level })` then `guardedStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', rows)` (Task 4's test file is the example).
