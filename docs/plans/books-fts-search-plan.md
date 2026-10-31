# Books Full-Text Search and Paged Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Books search reads SQLite FTS5 indexes for every search source, and the Customers, Vendors and Products and services lists load one server-filtered, server-sorted page at a time.

**Architecture:** Five FTS5 tables (one per search source) are created by a new Books migration and kept in step by core's `fts.RegisterSync`; `searchBooks` matches with core's `fts.SanitizeQueryWithExclusions` and keeps its per-kind order and interleave. Each list sorts on a new server-maintained `sort_key` column (case and accents folded; a sub-customer's key starts with its parent's, so one ordered query is the whole tree). The list hooks move from one no-`where` `useLiveQuery` to `useLiveInfiniteQuery` (TanStack DB `setWindow` under the hood), whose `where` (search + inactive filter) and `orderBy` pbtsdb sends to PocketBase; the next page is asked for with a cursor on `sort_key` only when the person scrolls near the end.

**Tech Stack:** Go (PocketBase 0.40, `tinycld.org/core/fts`, `tinycld.org/core/search`), SQLite FTS5 (`porter unicode61`), TypeScript, pbtsdb 2.1.0, `@tanstack/db` 0.12.1 / `@tanstack/react-db` 0.5.5 (`useLiveInfiniteQuery`), Playwright, vitest.

**Spec:** Run manifest unit `p2-books-fts-search` in `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml` (covers: "FTS5 index and queries for every Books search source (accounts, journal entries, customers, vendors, products and services)"; "paged, server-filtered record lists for customers, vendors and products and services (search, inactive filter and sort on the server; only the visible pages in the store)"), and `/Users/nas/code/tinycld/docs/superpowers/specs/2026-10-21-books-design.md` (Interface: "Every list uses one pattern: search, filter chips … cards on phones"). Facts from earlier units: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-books-fts-search/memories.md`.

## HUMAN DECISION

None. No decision in this unit needs the human:

- No core change and no pbtsdb change is needed. Core's `fts` package already exports what Books needs (`fts.Config`, `fts.Column`, `fts.RegisterSync`, `fts.SanitizeQueryWithExclusions`). Books does not call `fts.Search`: its `Scope` is an interface with unexported methods, built for per-record owner or membership scopes, and Books reads by Books level (`searchBooks` checks the level first, as today). pbtsdb 2.1.0 already pages (`cursor` and `offset` in `loadSubset`, see its README "Paging") and pushes `ilike` to PocketBase `~`.
- The behavior changes below follow from the unit's own words ("FTS5", "on the server"). They are listed so the reviewer sees them; none is a product choice this plan makes on its own.

## Behavior changes the reviewer will see

1. **App search (palette and CLI) matches the start of words**, as mail, boards and calendar already do: FTS5 prefix terms with porter stemming; case and accents are ignored. "wind" no longer finds "Northwind"; "100%" now finds "1000 Widgets" too (the `%` is not a word character). **Accepted by the human, 2026-10-31.**
2. **List search runs on the server** with PocketBase `~` (SQLite `LIKE`) over the same columns as before (customers and vendors: display name, company, email, phone; products: name, SKU, sales description). SQLite folds case for A to Z only, so "ÉCOLE" no longer finds "école" in a list (it still does in the app search). `%`, `_` and `\` in the typed text cut it into pieces that must all appear (`100% off` finds rows holding "100" and "off"). **Accepted by the human, 2026-10-31.**
3. **List order is the server's**: by `sort_key` (case and accents folded, then code-point order), then id. For Latin names this is the order the client's `localeCompare` gave; for some other scripts it can differ from the device locale's order.
4. **Lists load 50 rows, then the next 50 as the person scrolls near the end.** The store holds the pages scrolled into, not the whole collection. A search, the Show inactive switch and the sort are request parameters.

## Global Constraints

- Workspace: `/Users/nas/tmp/tinycld/books` (members `tinycld` with core at `tinycld/core`, `books`, `boards`, `calendar`, `mail`). Books is on branch `books/p2-books-fts-search`; core is on `main` and is never edited by this plan.
- Never edit anything under `/Users/nas/tmp/tinycld/books/tinycld/`. Generated files (pbSchema, routes) are produced by `pnpm run packages:generate` and are gitignored; never commit them.
- Books is unreleased (`package.json` version `0.1.0`, no git tags, no CHANGELOG): edit migrations 2100000003, 2100000004 and 2100000005 in place, and add the new one as `2100000006` (the highest today is `2100000005_create_books_products.js`).
- Run the TypeScript tools through the workspace `node_modules/.bin`. `tinycld-pkg` spawns bare `tsc`/`biome`/`vitest` from `PATH`; run without the workspace bin first on `PATH` it picks up a global `tsc` 5.8 and reports false errors, and `pnpm exec` triggers a workspace install in this workspace (run memory). Use exactly:
  - check: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
  - one vitest file: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/<file>`
  - biome on your files: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write <files>`
  - e2e: `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- <spec path>` (the path after `--` filters by file; probed with `--list`)
  - Go: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run '<regexp>' -count=1`
  - types after a migration edit: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
- Before Task 1 the books typecheck shows about 75 errors, all from a stale generated schema (1099 columns). `packages:generate` in Task 1 removes them. Any error left after that is real: fix it at its source; never skip a check.
- pbtsdb rules (CLAUDE.md): data through `useLiveQuery`/`useLiveInfiniteQuery` and `useMutation` only; every Books `useLiveQuery` passes an explicit `queryKey`; row types derive from the query; no `useEffect`; no `any`; no biome-ignore.
- Never pass one argument to TanStack `or()` or `and()`: pbtsdb compiles a one-argument `or` into a broken filter (`(x || )`, seen in a probe).
- PocketBase appends a final period to every error message (memory p2-customers).
- E2E: never `page.goto` for in-app moves; `page.unroute` while a handler runs hands the request on, so use `page.unrouteAll({ behavior: 'wait' })` (memory p2-customers). Cover the phone viewport only where the phone path runs different code (here: `ListCards`).
- E2E data: `list-paging.spec.ts` seeds its rows with a superuser write and drives everything else through the UI against the real server. This extends the CLAUDE.md seed exception for this spec only (approved by the human, 2026-10-31); no other spec may seed this way. Paging is never faked with `page.route`. The existing `page.route` fakes of a list state (loading, empty, all-inactive, load error) stay (Task 5, Step 8).
- Local e2e runs only the new and changed spec files; CI runs the full suite.
- Commit messages name no assistant and link no session.

## Review Focus

1. A person types a search one key at a time while each server answer is still loading: the search field must keep focus and every typed character (the list keeps the last settled rows and toolbar while the next query loads). Pinned in Task 5 (e2e step 6 of the vendors test).
2. A list search holding `%`, `_` or `\` (for example `100%` or `C:\`): no error banner, and the text is matched literally, never as a wildcard or as a broken PocketBase filter. Pinned in Task 4 (`searchPieces`, `listFilter` filter strings) and Task 5 (e2e step 5 of the vendors test).
3. A top-level customer is renamed: its sub-customers must move with it in the list order, not stay under the old name. Pinned in Task 1 (`TestSortKey_RenamingAParentMovesItsSubCustomers`).
4. An app-search term made only of symbols (`"`, `*`, `-`, `(`): Books must return no rows and no error (an error marks Books "partial" in the palette). Pinned in Task 3 (`TestSearch_SymbolOnlyTermsFindNothing`).
5. A record created, renamed or deleted after the index exists: found by its new text, not by its old text, and not after delete. Pinned in Task 2 (`TestSearchIndex_FollowsCreateRenameAndDelete`).

---

## File map

Server (Go, `books/server/`):
- Create `sort_keys.go` — `sortName`, `ensureRecordID`, `customerSortKey`, `rekeySubCustomers`, separators.
- Create `sort_keys_test.go`.
- Modify `customers.go`, `vendors.go`, `products.go` — set `sort_key` in the guards; re-key sub-customers after a parent's write.
- Modify `audit.go` — log `sort_key` changes redacted, as the hidden `name_key` is.
- Create `search_index.go` — the five `fts.Config`s and `registerSearchIndex`.
- Create `search_index_test.go` — `newSearchEnv`, index tests.
- Modify `register.go` — call `registerSearchIndex`.
- Modify `search.go` — FTS queries; delete the LIKE helpers.
- Modify `search_test.go`, `env_test.go`, `registrations_test.go`.

Migrations (`books/pb-migrations/`):
- Modify `2100000003_create_books_customers.js`, `2100000004_create_books_vendors.js`, `2100000005_create_books_products.js` — `sort_key` field and index.
- Create `2100000006_create_books_search_index.js` — five FTS5 tables.

Client (`books/tinycld/books/`):
- Create `lib/list-search.ts`, `lib/list-state.ts`, `lib/near-end.ts`, `hooks/useListFilters.ts`.
- Modify `lib/customer-tree.ts`, `lib/party-list.ts`, `lib/product-list.ts`, `lib/list-query.ts`, `hooks/useRecordList.ts`, `hooks/useCustomersQuery.ts`, `hooks/useVendorsQuery.ts`, `hooks/useProductsQuery.ts`, `components/ListTable.tsx`, `components/ListCards.tsx`, `components/party/PartyList.tsx`, `components/customers/CustomersList.tsx`, `components/vendors/VendorsList.tsx`, `components/products/ProductsList.tsx`, `collections.ts`, `forms/hosts.ts`, `seed.ts` (comment), `lib/customer-form-fixture.ts`, `lib/vendor-form-fixture.ts`, `lib/products-services-fixture.ts`.
- Delete `hooks/useCustomersList.ts`.

Tests (`books/tests/`):
- Create `list-search.test.ts`, `list-state.test.ts`, `near-end.test.ts`, `e2e/superuser-seed.ts`, `e2e/list-paging.spec.ts`.
- Modify `customer-tree.test.ts`, `party-list.test.ts`, `product-list.test.ts`, `collections.test.ts`, `customer-host.test.ts`, `vendor-host.test.ts`, `product-host.test.ts`, `help-customers.test.ts`, `help-vendors.test.ts`, `help-products-services.test.ts`, `e2e/customer-form-list.spec.ts`, `e2e/vendor-form-list.spec.ts`, `e2e/customer-form-page.spec.ts` (comments).

Help (`books/help/`): modify `customers.md`, `vendors.md`, `products-services.md`, `navigating-books.md`.

---

### Task 1: Server sort keys for customers, vendors and products

**Files:**
- Create: `books/server/sort_keys.go`, `books/server/sort_keys_test.go`
- Modify: `books/server/customers.go`, `books/server/vendors.go`, `books/server/products.go`, `books/server/audit.go`
- Test: `books/server/registrations_test.go` (one audit test)
- Modify: `books/pb-migrations/2100000003_create_books_customers.js`, `2100000004_create_books_vendors.js`, `2100000005_create_books_products.js`
- Modify: `books/tinycld/books/collections.ts`, `books/tinycld/books/forms/hosts.ts`, `books/tinycld/books/seed.ts`, `books/tinycld/books/lib/customer-form-fixture.ts`, `books/tinycld/books/lib/vendor-form-fixture.ts`, `books/tinycld/books/lib/products-services-fixture.ts`
- Test: `books/tests/collections.test.ts`, `books/tests/customer-host.test.ts`, `books/tests/vendor-host.test.ts`, `books/tests/product-host.test.ts`

**Interfaces:**
- Produces (Go): `sortName(trimmed string) string`; `const sortIDSep = "\x1f"`, `const sortChildSep = "\x1e"`; `ensureRecordID(r *core.Record)`; `customerSortKey(app core.App, r *core.Record) (string, error)`; `rekeySubCustomers(tx core.App, parent *core.Record) error`.
- Produces (schema): a readable, sortable, filterable text column `sort_key` on `books_customers` (max 2000), `books_vendors` and `books_products` (max 1000), indexed `(sort_key, id)`; the generated TS row types gain `sort_key: string`. Vendors and products: `sort_key = sortName(name)`. Customers: top-level `sortName(display_name) + "\x1f" + id`; sub-customer `parent.sort_key + "\x1e" + sortName(display_name) + "\x1f" + id`.

- [ ] **Step 1: Write the failing Go tests**

Create `books/server/sort_keys_test.go`:

```go
package books

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The sort form folds case and accents, so "Émile" sorts among the e's, and
// drops what a PocketBase filter string cannot carry before its closing quote.
func TestSortName_FoldsCaseAndAccentsAndDropsControls(t *testing.T) {
	for in, want := range map[string]string{
		"Émile Café": "emile cafe",
		"ÉMILE":      "emile",
		"Straße":     "strasse",
		"Ångström":   "angstrom",
		`Back\slash`: "back/slash",
		"tab\there":  "tabhere",
		"日本":         "日本",
	} {
		if got := sortName(in); got != want {
			t.Errorf("sortName(%q) = %q, want %q", in, got, want)
		}
	}
}

// customerNamesInListOrder reads every customer in the list's order: by
// sort_key, then id, in SQLite's byte order, as PocketBase sorts them.
func customerNamesInListOrder(t testing.TB, app core.App) string {
	t.Helper()
	var names []string
	if err := app.DB().NewQuery("SELECT display_name FROM books_customers ORDER BY sort_key, id").Column(&names); err != nil {
		t.Fatal(err)
	}
	return strings.Join(names, ",")
}

// Sub-customers follow their parent, before a top-level customer whose name
// only starts with the parent's, and case does not move a name.
func TestSortKey_CustomersSortAsATree(t *testing.T) {
	env := newLedgerEnv(t)
	alder := mkCustomer(t, env.app, "Alder", "")
	mkCustomer(t, env.app, "Alder Farms", "")
	mkCustomer(t, env.app, "Birch Mills", "")
	mkCustomer(t, env.app, "Zeta Annex", alder.Id)
	mkCustomer(t, env.app, "beta annex", alder.Id)
	if got, want := customerNamesInListOrder(t, env.app), "Alder,beta annex,Zeta Annex,Alder Farms,Birch Mills"; got != want {
		t.Fatalf("list order %s, want %s", got, want)
	}
}

// Renaming a top-level customer moves its sub-customers with it: each one's key
// starts again with the parent's new key, in the same transaction.
func TestSortKey_RenamingAParentMovesItsSubCustomers(t *testing.T) {
	env := newLedgerEnv(t)
	alder := mkCustomer(t, env.app, "Alder", "")
	mkCustomer(t, env.app, "Birch Mills", "")
	sub := mkCustomer(t, env.app, "Annex", alder.Id)
	renamed := reload(t, env.app, "books_customers", alder.Id)
	renamed.Set("display_name", "Zinc Holdings")
	if err := env.app.Save(renamed); err != nil {
		t.Fatal(err)
	}
	if got, want := customerNamesInListOrder(t, env.app), "Birch Mills,Zinc Holdings,Annex"; got != want {
		t.Fatalf("list order after the rename %s, want %s", got, want)
	}
	parentKey := reload(t, env.app, "books_customers", alder.Id).GetString("sort_key")
	if key := reload(t, env.app, "books_customers", sub.Id).GetString("sort_key"); !strings.HasPrefix(key, parentKey+sortChildSep) {
		t.Fatalf("sub-customer key %q does not start with the parent's %q", key, parentKey)
	}
}

// A customer saved without an id gets one in the guard, so its key can name it.
func TestSortKey_ANewCustomerKeyNamesItsID(t *testing.T) {
	env := newLedgerEnv(t)
	c := mkCustomer(t, env.app, "Émile Supply", "")
	if got, want := reload(t, env.app, "books_customers", c.Id).GetString("sort_key"), "emile supply"+sortIDSep+c.Id; got != want {
		t.Fatalf("sort_key %q, want %q", got, want)
	}
}

func TestSortKey_VendorsAndProductsSortByName(t *testing.T) {
	env := newLedgerEnv(t)
	vendor := mkVendor(t, env.app, "Émile Supply")
	if got := reload(t, env.app, "books_vendors", vendor.Id).GetString("sort_key"); got != "emile supply" {
		t.Fatalf("vendor sort_key %q", got)
	}
	renamed := reload(t, env.app, "books_vendors", vendor.Id)
	renamed.Set("display_name", "Zeta Freight")
	if err := env.app.Save(renamed); err != nil {
		t.Fatal(err)
	}
	if got := reload(t, env.app, "books_vendors", vendor.Id).GetString("sort_key"); got != "zeta freight" {
		t.Fatalf("renamed vendor sort_key %q", got)
	}
	product := mkService(t, env.app, "Ångström Tuning", mkIncomeAccount(t, env.app))
	if got := reload(t, env.app, "books_products", product.Id).GetString("sort_key"); got != "angstrom tuning" {
		t.Fatalf("product sort_key %q", got)
	}
}

// A reader sees sort_key and pages by it, as a list's cursor request does: it
// is not hidden, so a non-superuser may sort and filter on it.
func TestSortKey_AReaderSortsAndPagesByIt(t *testing.T) {
	env := newLedgerEnv(t)
	mkVendor(t, env.app, "Alpha Freight")
	mkVendor(t, env.app, "Beta Freight")
	filter := url.QueryEscape(`inactive = false && sort_key > "alpha freight"`)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_vendors/records?sort=sort_key,id&perPage=51&filter=" + filter,
		token:   tokenFor(t, env.users.readOnly),
		want:    http.StatusOK,
		content: []string{`"totalItems":1`, `"display_name":"Beta Freight"`, `"sort_key":"beta freight"`},
	}.run(t, env.app)
}
```

Append to `books/server/registrations_test.go` (after `TestAudit_RedactsTheCompanyTaxID`):

```go
// sort_key is the server's list order, not something a person wrote: a rename
// logs it as the hidden name_key is logged, a redacted change, never the raw key.
func TestAudit_RedactsTheSortKey(t *testing.T) {
	app, users := newAuditedApp(t)
	vendor := saveRecord(t, app, "books_vendors", map[string]any{"display_name": "Sorted Co"})
	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_vendors/records/" + vendor.Id,
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"display_name":"Zeta Sorted Co"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			row := awaitAuditRow(t, app, "books_vendors", "updated", vendor.Id)
			changes := auditJSONField(t, row, "changes")
			if !reflect.DeepEqual(changes["sort_key"], redactedChange) {
				t.Errorf("changes.sort_key = %#v, want %#v", changes["sort_key"], redactedChange)
			}
			requireNoLeak(t, row, "zeta sorted co")
		},
	}.run(t, app)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSortName|TestSortKey|TestAudit_RedactsTheSortKey' -count=1`
Expected: FAIL to compile: `undefined: sortName`, `undefined: sortChildSep`, `undefined: sortIDSep`.

- [ ] **Step 3: Add the column to the three migrations (edited in place: Books is unreleased)**

In `books/pb-migrations/2100000003_create_books_customers.js`, after the UNIQUENESS paragraph (the line `// '', so they are siblings of each other.`), insert:

```js
//
// SORT KEY. sort_key orders the customers list on the server and in the
// client's store alike (server/sort_keys.go): a top-level customer's key is its
// display name case- and accent-folded, then \x1f and its id; a sub-customer's
// key is its parent's key, \x1e, then its own. So one query ordered by
// (sort_key, id) is the whole tree, each customer followed by its
// sub-customers. Only the Go guard sets it, on every create and update;
// renaming a parent re-keys its sub-customers in the same transaction. It is
// not hidden: the list sorts, filters and pages on it.
```

Replace

```js
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    ...AUTODATES,
```

with

```js
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    { name: 'sort_key', type: 'text', max: 2000 },
                    ...AUTODATES,
```

and replace

```js
            'CREATE INDEX idx_books_customers_form ON books_customers (form)',
        ]
```

with

```js
            'CREATE INDEX idx_books_customers_form ON books_customers (form)',
            'CREATE INDEX idx_books_customers_sort ON books_customers (sort_key, id)',
        ]
```

In `books/pb-migrations/2100000004_create_books_vendors.js`, after the line `// index, and the index is the backstop for that check.` (end of the UNIQUENESS paragraph), insert:

```js
//
// SORT KEY. sort_key is the display name case- and accent-folded
// (server/sort_keys.go). Only the Go guard sets it, on every create and update.
// The vendors list sorts and pages on (sort_key, id), so it is not hidden.
```

Replace

```js
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_vendors_name ON books_vendors (name_key)',
                    'CREATE INDEX idx_books_vendors_form ON books_vendors (form)',
                ],
```

with

```js
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    { name: 'sort_key', type: 'text', max: 1000 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_vendors_name ON books_vendors (name_key)',
                    'CREATE INDEX idx_books_vendors_form ON books_vendors (form)',
                    'CREATE INDEX idx_books_vendors_sort ON books_vendors (sort_key, id)',
                ],
```

In `books/pb-migrations/2100000005_create_books_products.js`, after the line `// may repeat.` (end of the UNIQUENESS paragraph), insert:

```js
//
// SORT KEY. sort_key is the name case- and accent-folded (server/sort_keys.go).
// Only the Go guard sets it, on every create and update. The products list
// sorts and pages on (sort_key, id), so it is not hidden.
```

Replace

```js
                { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_products_name ON books_products (name_key)',
                'CREATE INDEX idx_books_products_form ON books_products (form)',
            ],
```

with

```js
                { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                { name: 'sort_key', type: 'text', max: 1000 },
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_products_name ON books_products (name_key)',
                'CREATE INDEX idx_books_products_form ON books_products (form)',
                'CREATE INDEX idx_books_products_sort ON books_products (sort_key, id)',
            ],
```

- [ ] **Step 4: Write the sort key code**

Create `books/server/sort_keys.go`:

```go
package books

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// A sort key orders a Books list on the server and in the client's store
// alike: PocketBase sorts and pages on it in SQLite's byte order, and the list
// query sorts the store's rows on it lexically, so both see one plain string.
const (
	// sortIDSep ends a name's sort form, before the id that breaks ties. It
	// sorts below every character sortName keeps, so "acme" and its
	// sub-customers sort before "acme co".
	sortIDSep = "\x1f"
	// sortChildSep joins a parent's key and a sub-customer's own part. The
	// parent's whole key is the sub-customer's prefix, so a sub-customer sorts
	// right after its parent and before the next top-level customer.
	sortChildSep = "\x1e"
)

// sortName is a name's sort form: case-folded and with accents dropped, so
// "Émile" sorts among the e's. It drops control characters (the separators
// above are control characters) and turns a backslash into a slash: a list's
// next-page cursor carries the key inside a PocketBase filter string, which
// has no escape for a backslash before its closing quote.
func sortName(trimmed string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(cases.Fold().String(trimmed)) {
		switch {
		case unicode.Is(unicode.Mn, r), unicode.IsControl(r):
		case r == '\\':
			b.WriteRune('/')
		default:
			b.WriteRune(r)
		}
	}
	return norm.NFC.String(b.String())
}

// ensureRecordID gives a new record its id before the write, as PocketBase
// would during it, so a key that names the id can be built in the guard.
func ensureRecordID(r *core.Record) {
	if r.Id == "" {
		r.Set("id", core.GenerateDefaultRandomId())
	}
}

// customerSortKey puts every sub-customer right after its parent: a top-level
// customer's key is its sort name and id, a sub-customer's is its parent's key,
// sortChildSep, then its own sort name and id.
func customerSortKey(app core.App, r *core.Record) (string, error) {
	own := sortName(r.GetString("display_name")) + sortIDSep + r.Id
	parentID := r.GetString("parent")
	if parentID == "" {
		return own, nil
	}
	parent, err := app.FindRecordById("books_customers", parentID)
	if err != nil {
		return "", fmt.Errorf("books: read the parent customer's sort key: %w", err)
	}
	return parent.GetString("sort_key") + sortChildSep + own, nil
}

// rekeySubCustomers saves each sub-customer of a top-level customer whose key
// no longer starts with the parent's, so its guard builds it again from the
// parent's new key. It runs after the parent's write, inside the same
// transaction, so the list never shows a sub-customer under its old name.
func rekeySubCustomers(tx core.App, parent *core.Record) error {
	if parent.GetString("parent") != "" {
		return nil
	}
	subs, err := tx.FindRecordsByFilter("books_customers", "parent = {:parent}", "", 0, 0, dbx.Params{"parent": parent.Id})
	if err != nil {
		return fmt.Errorf("books: read the sub-customers to re-key: %w", err)
	}
	prefix := parent.GetString("sort_key") + sortChildSep
	for _, sub := range subs {
		if strings.HasPrefix(sub.GetString("sort_key"), prefix) {
			continue
		}
		if err := tx.Save(sub); err != nil {
			return fmt.Errorf("books: re-key sub-customer %s: %w", sub.Id, err)
		}
	}
	return nil
}
```

In `books/server/customers.go`, replace the whole `registerCustomerGuard` function and the three-line comment above it with:

```go
// Every customer guard reads other customers (the parent, sub-customers,
// siblings) inside serialized, so no other customer write can commit between
// the check and the write it allows.
func registerCustomerGuard(app core.App) {
	bindSerializedGuard(app, "books_customers", func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			ensureRecordID(r)
		}
		if err := validateCustomer(tx, stored, r); err != nil {
			return err
		}
		if stored == nil {
			return nil
		}
		return checkCustomerInactive(tx, stored, r)
	})
	// Bound after the guard, so it runs inside the guard's transaction (e.App is
	// the transaction there) and after the write it wraps.
	app.OnRecordUpdate("books_customers").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return rekeySubCustomers(e.App, e.Record)
	})
	app.OnRecordDelete("books_customers").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			subs, err := tx.CountRecords("books_customers", dbx.HashExp{"parent": e.Record.Id})
			if err != nil {
				return err
			}
			if subs > 0 {
				return refuse(msgDeleteHasSubs)
			}
			return nil
		})
	})
}
```

In `validateCustomer` (same file), replace the doc comment and the last line:

```go
// validateCustomer stores the display name trimmed, then checks the parent,
// both addresses and the name among the customer's siblings. stored is the
// record before an update, nil on a create.
```
with
```go
// validateCustomer stores the display name trimmed, then checks the parent,
// both addresses and the name among the customer's siblings, and sets the
// sort key. stored is the record before an update, nil on a create.
```
and
```go
	return validateSiblingName(app, stored, r, name)
}
```
with
```go
	if err := validateSiblingName(app, stored, r, name); err != nil {
		return err
	}
	key, err := customerSortKey(app, r)
	if err != nil {
		return err
	}
	r.Set("sort_key", key)
	return nil
}
```

In `books/server/vendors.go` (`validateVendor`), replace

```go
	name := strings.TrimSpace(r.GetString("display_name"))
	r.Set("display_name", name)
```
with
```go
	name := strings.TrimSpace(r.GetString("display_name"))
	r.Set("display_name", name)
	// sort_key belongs to the guard too, set before any early return.
	r.Set("sort_key", sortName(name))
```

In `books/server/products.go` (`validateProduct`), replace

```go
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
```
with
```go
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
	// sort_key belongs to the guard too, set before any early return.
	r.Set("sort_key", sortName(name))
```

In `books/server/audit.go` (`auditedCollections`), log `sort_key` redacted, as the hidden `name_key` already is:

```go
		"books_customers":       {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"sort_key"}},
		"books_vendors":         {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"tax_id", "sort_key"}},
		"books_products":        {ExtractLabel: audit.LabelFromField("name"), Redact: []string{"sort_key"}},
```
(these replace the three existing lines for those collections; gofmt aligns them).

- [ ] **Step 5: Run the Go tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSortName|TestSortKey|TestAudit' -count=1`
Expected: PASS.

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -count=1`
Expected: PASS (every customer, vendor and product test still holds; the guards only add a column).

- [ ] **Step 6: Regenerate the types and update the client to the new column (tests first)**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: exits 0; `grep -n "sort_key" /Users/nas/tmp/tinycld/books/tinycld/core/types/pbSchema.ts` shows `sort_key: string` in `BooksCustomers`, `BooksVendors` and `BooksProducts`.

In `books/tests/collections.test.ts`, change the customers and vendors assertions:

```ts
        // The guard sets name_key and sort_key on every write, so the client never sends them.
        expect(calls.get('books_customers')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
        expect(calls.get('books_vendors')?.omitOnInsert).toEqual(
            expect.arrayContaining(['created', 'updated', 'name_key', 'sort_key'])
        )
```

and the products assertion:

```ts
    // The guard sets name_key and sort_key and the server stamps currency, so the client
    // never sends them on a product; a bundle row sends every column it has.
    it('never inserts a product or bundle row column the server sets', () => {
        const { calls } = register()
        expect(calls.get('books_products')?.omitOnInsert).toEqual([
            'created',
            'updated',
            'name_key',
            'sort_key',
            'currency',
        ])
```

In `books/tests/customer-host.test.ts`, `books/tests/vendor-host.test.ts` and `books/tests/product-host.test.ts`, add `sort_key: true,` right after `name_key: true,` in `ALL_COLUMNS`.

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/collections.test.ts tests/customer-host.test.ts tests/vendor-host.test.ts tests/product-host.test.ts`
Expected: FAIL: `omitOnInsert` lacks `sort_key`; each host's `columns` lacks `sort_key`.

- [ ] **Step 7: Client edits for the new column**

`books/tinycld/books/collections.ts`: change the three `omitOnInsert` lines to

```ts
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key'] as const,
```
(customers and vendors) and
```ts
        omitOnInsert: ['created', 'updated', 'name_key', 'sort_key', 'currency'] as const,
```
(products), and in the products comment change `The guard sets name_key and the server stamps currency.` to `The guard sets name_key and sort_key, and the server stamps currency.`

`books/tinycld/books/forms/hosts.ts`: in each of the three `columns` lists add `'sort_key',` right after `'name_key',`; change the comments `// Every column, \`id\` and the server-only \`name_key\` too: a custom key must` to `// Every column, \`id\` and the server-only \`name_key\` and \`sort_key\` too: a custom key must`, and the products comment to `// Every column, \`id\` and the server-only \`name_key\`, \`sort_key\` and \`currency\` too: a custom key`.

`books/tinycld/books/lib/customer-form-fixture.ts`: replace

```ts
type ServerOnlyColumn = ColumnOf<BooksCustomers, 'name_key'>

// The generated type holds JSON columns as `any`, which would reach every
// reader of a fixture row untyped. The fixture row keeps them typed and is
// still assignable to `BooksCustomers` without `name_key`. A null
// shipping_address means "same as billing address". The row never carries
// `name_key`, as a live query sees the row: the generated type has the
// column, but it is hidden, so a non-superuser never receives it, and the
// server's guard sets it on every write.
```
with
```ts
type ServerOnlyColumn = ColumnOf<BooksCustomers, 'name_key' | 'sort_key'>

// The generated type holds JSON columns as `any`, which would reach every
// reader of a fixture row untyped. The fixture row keeps them typed and is
// still assignable to `BooksCustomers` without `name_key` and `sort_key`. A
// null shipping_address means "same as billing address". The row never
// carries `name_key` (hidden, so a non-superuser never receives it) or
// `sort_key`: the server's guard sets both on every write.
```

`books/tinycld/books/lib/vendor-form-fixture.ts`: replace

```ts
// reader of a fixture row untyped, so the fixture keeps them typed. The row
// never carries `name_key`: it is hidden, so a live query never receives it,
// and the server's guard sets it on every write. `expense_account` is a
```
with
```ts
// reader of a fixture row untyped, so the fixture keeps them typed. The row
// never carries `name_key` (hidden, so a live query never receives it) or
// `sort_key`: the server's guard sets both on every write. `expense_account` is a
```
and `ColumnOf<BooksVendors, 'address' | 'fields' | 'name_key' | 'expense_account'>` with `ColumnOf<BooksVendors, 'address' | 'fields' | 'name_key' | 'sort_key' | 'expense_account'>`.

`books/tinycld/books/lib/products-services-fixture.ts`: replace

```ts
// reader of a fixture row untyped, so the fixture keeps it typed. The row never
// carries `name_key`: it is hidden, so a live query never receives it, and the
// server's guard sets it on every write. `currency` is stamped by the server on
```
with
```ts
// reader of a fixture row untyped, so the fixture keeps it typed. The row never
// carries `name_key` (hidden, so a live query never receives it) or `sort_key`:
// the server's guard sets both on every write. `currency` is stamped by the server on
```
and `ColumnOf<BooksProducts, 'fields' | 'name_key' | 'income_account' | 'expense_account'>` with `ColumnOf<BooksProducts, 'fields' | 'name_key' | 'sort_key' | 'income_account' | 'expense_account'>`.

`books/tinycld/books/seed.ts`: replace `// A fixture row has no name_key (CustomerFixtureRecord omits it), so the seed` / `// never sends one: the server's guard sets it.` with `// A fixture row has no name_key or sort_key (CustomerFixtureRecord omits them),` / `// so the seed never sends them: the server's guard sets both.`

- [ ] **Step 8: Run the client checks**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/collections.test.ts tests/customer-host.test.ts tests/vendor-host.test.ts tests/product-host.test.ts`
Expected: PASS.

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write tinycld/books/collections.ts tinycld/books/forms/hosts.ts tinycld/books/seed.ts tinycld/books/lib/customer-form-fixture.ts tinycld/books/lib/vendor-form-fixture.ts tinycld/books/lib/products-services-fixture.ts tests/collections.test.ts tests/customer-host.test.ts tests/vendor-host.test.ts tests/product-host.test.ts`
Then: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
Expected: biome, tsc and vitest all pass. A tsc error naming `sort_key` in a file not listed here is a fixture or test that builds a full row: add `'sort_key'` to that file's server-only omit list (as above) or `sort_key: ''` to its row, never a cast.

- [ ] **Step 9: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add server/sort_keys.go server/sort_keys_test.go server/customers.go server/vendors.go server/products.go server/audit.go server/registrations_test.go pb-migrations/2100000003_create_books_customers.js pb-migrations/2100000004_create_books_vendors.js pb-migrations/2100000005_create_books_products.js tinycld/books/collections.ts tinycld/books/forms/hosts.ts tinycld/books/seed.ts tinycld/books/lib/customer-form-fixture.ts tinycld/books/lib/vendor-form-fixture.ts tinycld/books/lib/products-services-fixture.ts tests/collections.test.ts tests/customer-host.test.ts tests/vendor-host.test.ts tests/product-host.test.ts && git commit -m "feat(books): server sort keys for customers, vendors and products"
```

---

### Task 2: FTS5 index tables kept in step with the records

**Files:**
- Create: `books/pb-migrations/2100000006_create_books_search_index.js`
- Create: `books/server/search_index.go`, `books/server/search_index_test.go`
- Modify: `books/server/register.go`, `books/server/env_test.go`, `books/server/registrations_test.go`

**Interfaces:**
- Consumes: the record guards (Task 1 unchanged otherwise).
- Produces (Go): constants `accountsIndex = "fts_books_accounts"`, `entriesIndex = "fts_books_journal_entries"`, `customersIndex = "fts_books_customers"`, `vendorsIndex = "fts_books_vendors"`, `productsIndex = "fts_books_products"`; `var searchIndexes []fts.Config`; `registerSearchIndex(app *pocketbase.PocketBase)`; test helpers `ledgerEnvOn(t *testing.T, app *tests.TestApp) *ledgerEnv`, `newSearchEnv(t *testing.T) *ledgerEnv`, `indexed(t testing.TB, app core.App, index, term string) string`.
- Index columns: accounts `name, number, description`; journal entries `number, memo`; customers `display_name, company, email`; vendors `display_name, company, email, legal_name`; products `name, sku, sales_description` (the columns the LIKE search read; never a tax ID, phone, notes or purchase description).

- [ ] **Step 1: Write the failing tests**

In `books/server/env_test.go`, replace the whole `newLedgerEnv` function with:

```go
func newLedgerEnv(t *testing.T) *ledgerEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	return ledgerEnvOn(t, app)
}

// ledgerEnvOn adds one user per level and three accounts to an app whose hooks
// are already bound, so the accounts pass through them.
func ledgerEnvOn(t *testing.T, app *tests.TestApp) *ledgerEnv {
	t.Helper()
	return &ledgerEnv{
		app:      app,
		users:    newLevelUsers(t, app),
		checking: mkAccount(t, app, "Checking", "bank", "checking"),
		revenue:  mkAccount(t, app, "Consulting Income", "income", "service_income"),
		rent:     mkAccount(t, app, "Rent", "expense", "rent_lease"),
	}
}
```

Create `books/server/search_index_test.go`:

```go
package books

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/fts"
)

// newSearchEnv is newLedgerEnv with the search index kept in step. The sync
// hooks are bound before the env's accounts are saved, so those are indexed too.
func newSearchEnv(t *testing.T) *ledgerEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSearchIndex(&pocketbase.PocketBase{App: app})
	return ledgerEnvOn(t, app)
}

// indexed lists, in id order, the record ids an index holds for a term.
func indexed(t testing.TB, app core.App, index, term string) string {
	t.Helper()
	var ids []string
	if err := app.DB().NewQuery("SELECT record_id FROM "+index+" WHERE "+index+" MATCH {:m} ORDER BY record_id").
		Bind(dbx.Params{"m": fts.SanitizeQuery(term)}).Column(&ids); err != nil {
		t.Fatalf("read %s for %q: %v", index, term, err)
	}
	return strings.Join(ids, ",")
}

func setField(t testing.TB, app core.App, r *core.Record, field, value string) {
	t.Helper()
	fresh := reload(t, app, r.Collection().Name, r.Id)
	fresh.Set(field, value)
	if err := app.Save(fresh); err != nil {
		t.Fatalf("set %s of %s: %v", field, r.Id, err)
	}
}

// The migration's tables and the Go configs name the same columns: a column
// the sync writes but the table lacks would fail every insert, silently.
func TestSearchIndex_TablesHoldTheConfiguredColumns(t *testing.T) {
	app := newBooksApp(t)
	for _, cfg := range searchIndexes {
		cols := []string{"record_id"}
		for _, c := range cfg.Columns {
			cols = append(cols, c.FTS)
		}
		var rows int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM (SELECT " + strings.Join(cols, ", ") + " FROM " + cfg.Table + ")").Row(&rows); err != nil {
			t.Errorf("%s: %v", cfg.Table, err)
		}
		if _, err := app.FindCollectionByNameOrId(cfg.Collection); err != nil {
			t.Errorf("%s indexes %s: %v", cfg.Table, cfg.Collection, err)
		}
	}
	if len(searchIndexes) != 5 {
		t.Fatalf("%d indexes, want one per search source (5)", len(searchIndexes))
	}
}

// A record is found by its text from its first save, by its new text after a
// rename (never by the old), and no longer after a delete.
func TestSearchIndex_FollowsCreateRenameAndDelete(t *testing.T) {
	env := newSearchEnv(t)
	income := mkIncomeAccount(t, env.app)
	kinds := []struct {
		index, field string
		record       *core.Record
	}{
		{customersIndex, "display_name", mkCustomer(t, env.app, "Quillon Studio", "")},
		{vendorsIndex, "display_name", mkVendor(t, env.app, "Quillon Freight")},
		{productsIndex, "name", mkService(t, env.app, "Quillon Review", income)},
	}
	for _, k := range kinds {
		if got := indexed(t, env.app, k.index, "quillon"); got != k.record.Id {
			t.Fatalf("%s: quillon found %q, want %s", k.index, got, k.record.Id)
		}
		setField(t, env.app, k.record, k.field, "Tamsin")
		if got := indexed(t, env.app, k.index, "quillon"); got != "" {
			t.Fatalf("%s: the old name still finds %q", k.index, got)
		}
		if got := indexed(t, env.app, k.index, "tamsin"); got != k.record.Id {
			t.Fatalf("%s: tamsin found %q, want %s", k.index, got, k.record.Id)
		}
		if err := env.app.Delete(reload(t, env.app, k.record.Collection().Name, k.record.Id)); err != nil {
			t.Fatalf("delete %s: %v", k.record.Id, err)
		}
		if got := indexed(t, env.app, k.index, "tamsin"); got != "" {
			t.Fatalf("%s: a deleted record is still found: %q", k.index, got)
		}
	}

	account := mkAccount(t, env.app, "Quillon Reserve", "bank", "checking")
	if got := indexed(t, env.app, accountsIndex, "quillon"); got != account.Id {
		t.Fatalf("accounts: quillon found %q", got)
	}
	setField(t, env.app, account, "name", "Tamsin Reserve")
	if indexed(t, env.app, accountsIndex, "quillon") != "" || indexed(t, env.app, accountsIndex, "tamsin") != account.Id {
		t.Fatal("accounts: the index did not follow the rename")
	}

	// A draft is found by its memo; posting gives it a number, found too.
	draft := env.sale(t, "2026-05-01", 100)
	setField(t, env.app, draft, "memo", "Quillon deposit")
	if got := indexed(t, env.app, entriesIndex, "quillon"); got != draft.Id {
		t.Fatalf("entries: quillon found %q", got)
	}
	posted := mustPost(t, env.app, draft.Id, "")
	if got := indexed(t, env.app, entriesIndex, posted.GetString("number")); got != draft.Id {
		t.Fatalf("entries: number %q found %q", posted.GetString("number"), got)
	}
}
```

In `books/server/registrations_test.go` (`TestRegister_BindsEachPartOnce`), replace

```go
	registerAudit(&pocketbase.PocketBase{App: parts})
```
with
```go
	registerAudit(&pocketbase.PocketBase{App: parts})
	registerSearchIndex(&pocketbase.PocketBase{App: parts})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSearchIndex|TestRegister' -count=1`
Expected: FAIL to compile: `undefined: registerSearchIndex`, `undefined: searchIndexes`, `undefined: customersIndex`.

- [ ] **Step 3: Write the migration**

Create `books/pb-migrations/2100000006_create_books_search_index.js`:

```js
/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books search: one FTS5 table per search source. server/search_index.go names
// the same columns and keeps each row in step with its record through core's
// fts.RegisterSync (delete then insert on every create and update, delete on
// delete). The columns are what a person recalls a record by; never a tax ID,
// a phone, notes or a purchase description. porter + unicode61, as mail,
// boards and calendar index: a word matches by its stem, case and accents are
// ignored.
//
// The backfill copies the rows that exist when this migration runs. On a new
// database there are none; every later write reaches the index through the
// sync hooks.
const INDEXES = [
    {
        table: 'fts_books_accounts',
        source: 'books_accounts',
        columns: ['name', 'number', 'description'],
    },
    {
        table: 'fts_books_journal_entries',
        source: 'books_journal_entries',
        columns: ['number', 'memo'],
    },
    {
        table: 'fts_books_customers',
        source: 'books_customers',
        columns: ['display_name', 'company', 'email'],
    },
    {
        table: 'fts_books_vendors',
        source: 'books_vendors',
        columns: ['display_name', 'company', 'email', 'legal_name'],
    },
    {
        table: 'fts_books_products',
        source: 'books_products',
        columns: ['name', 'sku', 'sales_description'],
    },
]

migrate(
    app => {
        for (const index of INDEXES) {
            const columns = index.columns.join(', ')
            app.db()
                .newQuery(
                    `CREATE VIRTUAL TABLE ${index.table} USING fts5(record_id UNINDEXED, ${columns}, tokenize='porter unicode61')`
                )
                .execute()
            app.db()
                .newQuery(
                    `INSERT INTO ${index.table} (record_id, ${columns}) SELECT id, ${columns} FROM ${index.source}`
                )
                .execute()
        }
    },
    app => {
        for (const index of INDEXES) {
            app.db().newQuery(`DROP TABLE IF EXISTS ${index.table}`).execute()
        }
    }
)
```

- [ ] **Step 4: Write the configs and register them**

Create `books/server/search_index.go`:

```go
package books

import (
	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/fts"
)

// The FTS5 tables Books search reads, created by
// pb-migrations/2100000006_create_books_search_index.js.
const (
	accountsIndex  = "fts_books_accounts"
	entriesIndex   = "fts_books_journal_entries"
	customersIndex = "fts_books_customers"
	vendorsIndex   = "fts_books_vendors"
	productsIndex  = "fts_books_products"
)

// searchIndexes keep each FTS row in step with its record. The columns repeat
// the migration's. Scope is left out: Books never calls fts.Search, whose
// scopes are per record; searchBooks checks the person's Books level first, as
// every Books read does.
var searchIndexes = []fts.Config{
	{Slug: "books", Collection: "books_accounts", Table: accountsIndex, Columns: ftsColumns("name", "number", "description")},
	{Slug: "books", Collection: "books_journal_entries", Table: entriesIndex, Columns: ftsColumns("number", "memo")},
	{Slug: "books", Collection: "books_customers", Table: customersIndex, Columns: ftsColumns("display_name", "company", "email")},
	{Slug: "books", Collection: "books_vendors", Table: vendorsIndex, Columns: ftsColumns("display_name", "company", "email", "legal_name")},
	{Slug: "books", Collection: "books_products", Table: productsIndex, Columns: ftsColumns("name", "sku", "sales_description")},
}

// ftsColumns indexes each field under its own name.
func ftsColumns(fields ...string) []fts.Column {
	cols := make([]fts.Column, len(fields))
	for i, f := range fields {
		cols[i] = fts.Column{FTS: f, Field: f}
	}
	return cols
}

// registerSearchIndex binds the index-sync hooks only. fts.Register would also
// mount GET /api/books/search, and Books has no in-app search box to serve:
// core's federated /api/search is the one reader.
func registerSearchIndex(app *pocketbase.PocketBase) {
	for _, cfg := range searchIndexes {
		fts.RegisterSync(app, cfg)
	}
}
```

In `books/server/register.go`, replace

```go
	search.RegisterSources(searchSource())
```
with
```go
	registerSearchIndex(app)
	search.RegisterSources(searchSource())
```

- [ ] **Step 5: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSearchIndex|TestRegister' -count=1`
Expected: PASS.

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -count=1`
Expected: PASS (the search tests still use the LIKE search on `newLedgerEnv` until Task 3).

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add pb-migrations/2100000006_create_books_search_index.js server/search_index.go server/search_index_test.go server/register.go server/env_test.go server/registrations_test.go && git commit -m "feat(books): FTS5 index for every search source, kept in step by core's sync"
```

---

### Task 3: Books search reads the FTS5 indexes

**Files:**
- Modify: `books/server/search.go`
- Test: `books/server/search_test.go`

**Interfaces:**
- Consumes: `newSearchEnv`, the index constants (Task 2); `fts.SanitizeQueryWithExclusions(include, exclude string) string` from core (returns `""` when the include text has no word).
- Produces: `searchBooks(app core.App, userID string, q search.Query) (search.Result, error)` (same signature); `indexQuery` with `run(ctx, app, match string, window int, hits any) (int, error)`. Deleted: `likeWhere`, `anyColumnLike`, `escapeLike`.

- [ ] **Step 1: Write the failing tests**

In `books/server/search_test.go`:

1. Replace every `env := newLedgerEnv(t)` with `env := newSearchEnv(t)` (Edit with replace_all; 16 places today).
2. Add `"context"` and `"errors"` to the imports.
3. Replace the whole `TestSearch_ExcludesAndEscapesWildcards` function with:

```go
// A term matches the start of a word: "100%" is the word 100, so it finds both
// accounts, and a term inside a word finds nothing. An excluded term drops
// every row it matches.
func TestSearch_MatchesWordStartsAndExcludes(t *testing.T) {
	env := newSearchEnv(t)
	club := mkAccount(t, env.app, "100% Club", "expense", "other_business_expenses")
	widgets := mkAccount(t, env.app, "1000 Widgets", "cost_of_goods_sold", "supplies_materials")
	find := func(include, exclude []string) search.Result {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: include, Exclude: exclude, Limit: 10})
		if err != nil {
			t.Fatalf("%v -%v: %v", include, exclude, err)
		}
		return res
	}
	if got, want := rowIDs(find([]string{"100%"}, nil).Rows), "account:"+club.Id+",account:"+widgets.Id; got != want {
		t.Fatalf("100%% matched %s, want %s", got, want)
	}
	if got := rowIDs(find([]string{"sulting"}, nil).Rows); got != "" {
		t.Fatalf("a term inside a word matched %s", got)
	}
	if got := rowIDs(find([]string{"income"}, []string{"consulting"}).Rows); got != "" {
		t.Fatalf("exclude kept %s", got)
	}
	if got := rowIDs(find([]string{"income"}, nil).Rows); got != "account:"+env.revenue.Id {
		t.Fatalf("without the exclude, income matched %s", got)
	}
}

// A term with no word in it leaves FTS5 nothing to match. Books finds nothing
// and does not fail: a failed source shows Books as failed in the palette.
func TestSearch_SymbolOnlyTermsFindNothing(t *testing.T) {
	env := newSearchEnv(t)
	for _, term := range []string{`"`, "*", "-", "()", "^", "%"} {
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil || len(res.Rows) != 0 || res.Total != 0 {
			t.Fatalf("%q: rows %s total %d err %v", term, rowIDs(res.Rows), res.Total, err)
		}
	}
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"rent"}, Exclude: []string{"*"}, Limit: 10})
	if err != nil || rowIDs(res.Rows) != "account:"+env.rent.Id {
		t.Fatalf("an excluded symbol changed the hits: rows %s err %v", rowIDs(res.Rows), err)
	}
}

func TestSearch_IgnoresCaseAndAccents(t *testing.T) {
	env := newSearchEnv(t)
	cafe := mkSearchCustomer(t, env, map[string]any{"display_name": "Café Olé"})
	for _, term := range []string{"cafe", "CAFÉ", "ole"} {
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		if got := rowIDs(customerRows(res.Rows)); got != "customer:"+cafe.Id {
			t.Fatalf("%q found customers %q, want customer:%s", term, got, cafe.Id)
		}
	}
}

// A renamed vendor is found by its new name only.
func TestSearch_FollowsARename(t *testing.T) {
	env := newSearchEnv(t)
	v := mkSearchVendor(t, env, map[string]any{"display_name": "Quillon Freight"})
	renamed := reload(t, env.app, "books_vendors", v.Id)
	renamed.Set("display_name", "Tamsin Freight")
	if err := env.app.Save(renamed); err != nil {
		t.Fatal(err)
	}
	old, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"quillon"}, Limit: 10})
	if len(vendorRows(old.Rows)) != 0 {
		t.Fatalf("the old name still finds %s", rowIDs(old.Rows))
	}
	res, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"tamsin"}, Limit: 10})
	if rows := vendorRows(res.Rows); rowIDs(rows) != "vendor:"+v.Id || rows[0].Title != "Tamsin Freight" {
		t.Fatalf("tamsin found %s", rowIDs(res.Rows))
	}
}

// The aggregator ends a source's context when its time is up; the source must
// not run its queries after that.
func TestSearch_StopsWhenTheContextEnded(t *testing.T) {
	env := newSearchEnv(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"rent"}, Limit: 10, Ctx: ctx})
	if !errors.Is(err, context.Canceled) || len(res.Rows) != 0 {
		t.Fatalf("rows %s err %v, want context.Canceled", rowIDs(res.Rows), err)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSearch_' -count=1`
Expected: FAIL in `TestSearch_MatchesWordStartsAndExcludes` (the LIKE search finds only "100% Club" for "100%") and `TestSearch_IgnoresCaseAndAccents` ("cafe" does not match "Café" through LIKE). `TestSearch_SymbolOnlyTermsFindNothing`, `TestSearch_FollowsARename` and `TestSearch_StopsWhenTheContextEnded` already pass on the LIKE search; they pin behavior the FTS search must keep (Review Focus 4).

- [ ] **Step 3: Rewrite the search to read the indexes**

Replace the whole of `books/server/search.go` with:

```go
package books

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/fts"
	"tinycld.org/core/search"
)

// searchSource contributes accounts, journal entries, customers, vendors and
// products to core's federated /api/search. Each kind is read from its FTS5
// index (server/search_index.go). Rows are shaped here so the palette and the
// CLI show the same thing; the client adapter
// (tinycld/books/search-adapter.ts) only navigates.
func searchSource() search.Source {
	return search.Source{
		Slug:  "books",
		Label: "Books",
		// Mirrors manifest.ts nav.order, the cross-package ranking tie-break.
		Order:  30,
		Scopes: []string{scopeRead},
		Search: searchBooks,
	}
}

const defaultSearchLimit = 20

func searchBooks(app core.App, userID string, q search.Query) (search.Result, error) {
	// A direct query: the collection rules do not run here, so the level
	// they read is checked first.
	level, err := levelForUser(app, userID)
	if err != nil {
		return search.Result{}, err
	}
	// fts owns the FTS5 quoting. A term with no word in it (only symbols)
	// leaves no match, and FTS5 refuses an empty MATCH, so that finds nothing.
	match := fts.SanitizeQueryWithExclusions(strings.Join(q.Include, " "), strings.Join(q.Exclude, " "))
	if !level.CanRead() || match == "" {
		return search.Result{}, nil
	}
	limit := q.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	offset := max(q.Offset, 0)
	window := offset + limit
	ctx := q.Context()

	accounts, accountTotal, err := searchAccounts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	entries, entryTotal, err := searchEntries(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	customers, customerTotal, err := searchParties(ctx, app, match, window, customerSource)
	if err != nil {
		return search.Result{}, err
	}
	vendors, vendorTotal, err := searchParties(ctx, app, match, window, vendorSource)
	if err != nil {
		return search.Result{}, err
	}
	products, productTotal, err := searchProducts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	rows := interleave(accounts, entries, customers, vendors, products)
	total := accountTotal + entryTotal + customerTotal + vendorTotal + productTotal
	return search.Result{Rows: page(rows, offset, limit), Total: total}, nil
}

// interleave takes one row from each list in turn, then what is left of the
// longer lists, so a query that matches many of one kind (a number matches
// account numbers and entry numbers) still shows the others on its first
// page. Each list holds its first window hits in order, so the first window
// rows here are the same whichever page asks.
func interleave(lists ...[]search.Row) []search.Row {
	size, longest := 0, 0
	for _, l := range lists {
		size += len(l)
		longest = max(longest, len(l))
	}
	rows := make([]search.Row, 0, size)
	for i := range longest {
		for _, l := range lists {
			if i < len(l) {
				rows = append(rows, l[i])
			}
		}
	}
	return rows
}

// indexQuery reads one search source from its FTS5 index: the index rows that
// match, joined to their records (aliased c), narrowed by where, in order.
// Every identifier is a constant of this file; only the match and the window
// are bound. A record deleted behind a stale index row drops out at the join.
type indexQuery struct {
	index, table, joins, where, columns, order string
}

// run counts every hit and loads the first window of them into hits. Each
// kind keeps a fixed order (by name, entries by date) rather than FTS rank:
// core ranks the merged rows by how well their visible text matches, and a
// fixed order keeps the pages of one query stable.
func (iq indexQuery) run(ctx context.Context, app core.App, match string, window int, hits any) (int, error) {
	from := " FROM " + iq.index + " JOIN " + iq.table + " c ON c.id = " + iq.index + ".record_id" + iq.joins +
		" WHERE " + iq.index + " MATCH {:match}"
	if iq.where != "" {
		from += " AND " + iq.where
	}
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*)"+from).WithContext(ctx).
		Bind(dbx.Params{"match": match}).Row(&total); err != nil {
		return 0, fmt.Errorf("books: count %s hits: %w", iq.table, err)
	}
	if err := app.DB().NewQuery("SELECT "+iq.columns+from+" ORDER BY "+iq.order+" LIMIT {:window}").
		WithContext(ctx).Bind(dbx.Params{"match": match, "window": window}).All(hits); err != nil {
		return 0, fmt.Errorf("books: search %s: %w", iq.table, err)
	}
	return total, nil
}

type accountHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Number   string `db:"number"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

var accountsQuery = indexQuery{
	index: accountsIndex, table: "books_accounts",
	columns: "c.id, c.name, c.number, c.type, c.inactive", order: "c.name, c.id",
}

func searchAccounts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []accountHit
	total, err := accountsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := typeLabel(h.Type)
		if h.Number != "" {
			subtitle = h.Number + " · " + subtitle
		}
		rows = append(rows, search.Row{
			ID:       "account:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Account",
			Fields:   map[string]any{"kind": "account", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type entryHit struct {
	ID     string `db:"id"`
	Number string `db:"number"`
	Memo   string `db:"memo"`
	Date   string `db:"date"`
	Status string `db:"status"`
}

// A void's reversal repeats the voided entry's number, and the voided entry
// is the one a person looks for, so reversals are left out.
var entriesQuery = indexQuery{
	index: entriesIndex, table: "books_journal_entries", where: "c.origin != 'void_reversal'",
	columns: "c.id, c.number, c.memo, c.date, c.status", order: "c.date DESC, c.id",
}

func searchEntries(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []entryHit
	total, err := entriesQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		rows = append(rows, search.Row{
			ID:       "entry:" + h.ID,
			Title:    entryHitTitle(h),
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": "journal_entry", "status": h.Status},
		})
	}
	return rows, total, nil
}

type partyHit struct {
	ID          string `db:"id"`
	DisplayName string `db:"display_name"`
	Company     string `db:"company"`
	Email       string `db:"email"`
	Inactive    bool   `db:"inactive"`
	ParentName  string `db:"parent_name"`
}

// partySource names a kind of party (a person or company the books deal
// with): the row id prefix and kind, the Meta label, and its index query.
type partySource struct {
	kind, meta string
	query      indexQuery
}

// The parent join only labels a customer hit ("Parent : Child"): the match
// stays on the child's own index row, and the LEFT JOIN on the unique parent
// id adds or drops no rows, so the count and the rows agree.
var customerSource = partySource{
	kind: "customer", meta: "Customer",
	query: indexQuery{
		index: customersIndex, table: "books_customers",
		joins:   " LEFT JOIN books_customers p ON p.id = c.parent",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, COALESCE(p.display_name, '') AS parent_name",
		order:   "c.display_name, c.id",
	},
}

// A vendor's index also holds its legal name, never its tax ID; the hit shows
// neither.
var vendorSource = partySource{
	kind: "vendor", meta: "Vendor",
	query: indexQuery{
		index: vendorsIndex, table: "books_vendors",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, '' AS parent_name",
		order:   "c.display_name, c.id",
	},
}

// partyHitTitle uses the client's "Parent : Child" label form, so two rows of
// the same name under different parents are told apart.
func partyHitTitle(h partyHit) string {
	if h.ParentName == "" {
		return h.DisplayName
	}
	return h.ParentName + " : " + h.DisplayName
}

func searchParties(ctx context.Context, app core.App, match string, window int, src partySource) ([]search.Row, int, error) {
	var hits []partyHit
	total, err := src.query.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Company
		if subtitle == "" {
			subtitle = h.Email
		}
		rows = append(rows, search.Row{
			ID:       src.kind + ":" + h.ID,
			Title:    partyHitTitle(h),
			Subtitle: subtitle,
			Meta:     src.meta,
			Fields:   map[string]any{"kind": src.kind, "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type productHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Sku      string `db:"sku"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

// The index holds the sales description but not the purchase one: the sales
// text is what a customer reads and what a person recalls an item by.
var productsQuery = indexQuery{
	index: productsIndex, table: "books_products",
	columns: "c.id, c.name, c.sku, c.type, c.inactive", order: "c.name, c.id",
}

func searchProducts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []productHit
	total, err := productsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Sku
		if subtitle == "" {
			subtitle = productTypeLabel(h.Type)
		}
		rows = append(rows, search.Row{
			ID:       "product:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Product or service",
			Fields:   map[string]any{"kind": "product", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

func entryHitTitle(h entryHit) string {
	switch {
	case h.Number == "":
		return "Draft journal entry"
	case h.Status == statusVoid:
		return "Journal entry " + h.Number + " (void)"
	}
	return "Journal entry " + h.Number
}

func page(rows []search.Row, offset, limit int) []search.Row {
	if offset >= len(rows) {
		return nil
	}
	end := min(offset+limit, len(rows))
	return rows[offset:end]
}
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestSearch' -count=1`
Expected: PASS, including the unchanged tests (FindsCustomers, FindsVendors, FindsVendorsByLegalName, FindsProducts, the interleave and paging tests, HidesVoidReversals, NoAccessFindsNothing, SubCustomerTitleNamesItsParent, LimitOffsetAndTheDefaultLimit). Each still holds with word-start matching: every term those tests use starts a word in the indexed text, and every term they expect to miss lives only in a column the index does not hold (phone, notes, account number, tax ID, purchase description).

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go vet ./... && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add server/search.go server/search_test.go && git commit -m "feat(books): search reads the FTS5 indexes"
```

---

### Task 4: Pure building blocks for the paged lists

**Files:**
- Create: `books/tinycld/books/lib/list-search.ts`, `books/tinycld/books/lib/list-state.ts`, `books/tinycld/books/lib/near-end.ts`
- Modify: `books/tinycld/books/lib/customer-tree.ts` (add `customerTreeRows`)
- Test: `books/tests/list-search.test.ts`, `books/tests/list-state.test.ts`, `books/tests/near-end.test.ts`, `books/tests/customer-tree.test.ts` (add a block)

**Interfaces:**
- Consumes: `sort_key` on the row types (Task 1).
- Produces:
  - `lib/list-search.ts`: `LIST_PAGE_SIZE = 50`; `SORT_KEY_ORDER`, `ID_ORDER` (TanStack orderBy options); `type ListFilters = { search: string; showInactive: boolean }`; `searchPieces(text: string): string[]`; `hasListFilter(filters: ListFilters): boolean`; `listFilter(columns: { isActive: ReturnType<typeof eq>; text: readonly [TextColumn, TextColumn, ...TextColumn[]] }, filters: ListFilters)`; `anyRecordState(isNeeded: boolean, probe: { isReady: boolean; data: readonly unknown[] | undefined }): boolean | undefined`.
  - `lib/list-state.ts`: `listViewState(input: { isReady: boolean; isError: boolean; rowCount: number; anyRecord: boolean | undefined; search: string; showInactive: boolean }): PartyListViewState`; `type ShownList<Row> = { rows: readonly Row[]; viewState: PartyListViewState }`; `keepLastSettled<Row>(prev: ShownList<Row> | undefined, now: ShownList<Row>): { next: ShownList<Row> | undefined; shown: ShownList<Row> }`.
  - `lib/near-end.ts`: `NEAR_END_PX = 600`; `isNearEnd(metrics: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } }): boolean`.
  - `lib/customer-tree.ts`: `customerTreeRows<T extends TreeCustomer>(rows: readonly (T & { parentRow: T | undefined })[]): PartyListRow<T>[]`.

- [ ] **Step 1: Write the failing tests**

Create `books/tests/list-search.test.ts`:

```ts
import { createLiveQueryCollection, eq } from '@tanstack/db'
import { createCollection, disconnectRealtime } from 'pbtsdb/core'
import PocketBase, { BaseAuthStore } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'
import {
    anyRecordState,
    hasListFilter,
    type ListFilters,
    listFilter,
    searchPieces,
} from '../tinycld/books/lib/list-search'

// A PocketBase client that keeps the filter of every request and answers with no rows,
// so a query's `where` shows as the filter the real pbtsdb sends the server.
class FilterRecorder extends PocketBase {
    filters: string[] = []

    constructor() {
        super('http://127.0.0.1:1', new BaseAuthStore())
        this.autoCancellation(false)
    }

    override async send<T = unknown>(
        _path: string,
        options: { query?: Record<string, unknown>; filter?: unknown }
    ): Promise<T> {
        this.filters.push(String(options.filter ?? options.query?.filter ?? ''))
        return { page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] } as T
    }
}

// The filter one vendors list query sends for `filters`.
async function vendorFilter(filters: ListFilters) {
    const pb = new FilterRecorder()
    disconnectRealtime(pb)
    const newCollection = createCollection(pb)
    const books = registerCollections(newCollection as never, { users: newCollection('users') } as never)
    const query = createLiveQueryCollection(q =>
        q.from({ vendor: books.books_vendors }).where(({ vendor }) =>
            listFilter(
                {
                    isActive: eq(vendor.inactive, false),
                    text: [vendor.display_name, vendor.company, vendor.email, vendor.phone],
                },
                filters
            )
        )
    )
    await query.preload()
    await query.cleanup()
    return pb.filters
}

const TEXT = (term: string) =>
    `display_name ~ "%${term}%" || company ~ "%${term}%" || email ~ "%${term}%" || phone ~ "%${term}%"`

describe('searchPieces', () => {
    it('trims the text and keeps inner spaces', () => {
        expect(searchPieces('  cedar and pine ')).toEqual(['cedar and pine'])
    })

    it('cuts the text where %, _ or \\ stood', () => {
        expect(searchPieces('100% off')).toEqual(['100', 'off'])
        expect(searchPieces('a_b\\c')).toEqual(['a', 'b', 'c'])
        expect(searchPieces('C:\\')).toEqual(['C:'])
    })

    it('leaves nothing of a text made only of those characters', () => {
        expect(searchPieces('%_\\ ')).toEqual([])
        expect(searchPieces('')).toEqual([])
    })
})

describe('hasListFilter', () => {
    it('filters unless Show inactive is on and there is nothing to search', () => {
        expect(hasListFilter({ search: '', showInactive: false })).toBe(true)
        expect(hasListFilter({ search: 'harbor', showInactive: true })).toBe(true)
        expect(hasListFilter({ search: ' %% ', showInactive: true })).toBe(false)
        expect(hasListFilter({ search: '', showInactive: true })).toBe(false)
    })
})

describe('listFilter, as pbtsdb sends it to the server', () => {
    it('keeps active rows only', async () => {
        expect(await vendorFilter({ search: '', showInactive: false })).toEqual(['inactive = false'])
    })

    it('matches the text in any column, with Show inactive on', async () => {
        expect(await vendorFilter({ search: 'Harbor', showInactive: true })).toEqual([
            `(${TEXT('Harbor')})`,
        ])
    })

    it('needs every piece, and the inactive filter, when both apply', async () => {
        expect(await vendorFilter({ search: '100% off', showInactive: false })).toEqual([
            `((${TEXT('100')}) && (${TEXT('off')}) && inactive = false)`,
        ])
    })

    it('escapes a quote in the text', async () => {
        expect(await vendorFilter({ search: 'say "hi"', showInactive: true })).toEqual([
            `(${TEXT('say \\"hi\\"')})`,
        ])
    })
})

describe('anyRecordState', () => {
    it('is true while the list shows rows, without asking', () => {
        expect(anyRecordState(false, { isReady: false, data: undefined })).toBe(true)
    })

    it('is unknown until the one-row query answers', () => {
        expect(anyRecordState(true, { isReady: false, data: undefined })).toBeUndefined()
    })

    it('says whether that query found a row', () => {
        expect(anyRecordState(true, { isReady: true, data: [] })).toBe(false)
        expect(anyRecordState(true, { isReady: true, data: [{ id: 'a' }] })).toBe(true)
    })
})
```

Create `books/tests/list-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { keepLastSettled, listViewState } from '../tinycld/books/lib/list-state'
import type { PartyListViewState } from '../tinycld/books/lib/party-list'

const viewState = (input: Partial<Parameters<typeof listViewState>[0]>) =>
    listViewState({
        isReady: true,
        isError: false,
        rowCount: 0,
        anyRecord: true,
        search: '',
        showInactive: false,
        ...input,
    })

describe('listViewState', () => {
    it('shows an error first', () => {
        expect(viewState({ isError: true, isReady: false })).toBe('error')
    })

    it('loads until the page is ready', () => {
        expect(viewState({ isReady: false, rowCount: 3 })).toBe('loading')
    })

    it('is ready with rows', () => {
        expect(viewState({ rowCount: 3, anyRecord: undefined })).toBe('ready')
    })

    it('waits for the one-row query before it calls an empty page anything', () => {
        expect(viewState({ anyRecord: undefined })).toBe('loading')
    })

    it('is empty when no record exists at all', () => {
        expect(viewState({ anyRecord: false })).toBe('empty')
        expect(viewState({ anyRecord: false, search: 'harbor' })).toBe('empty')
    })

    it('says all-inactive only for the default view', () => {
        expect(viewState({})).toBe('all-inactive')
        expect(viewState({ search: ' %% ' })).toBe('all-inactive')
    })

    it('says no-match for a search or with Show inactive on', () => {
        expect(viewState({ search: 'harbor' })).toBe('no-match')
        expect(viewState({ showInactive: true })).toBe('no-match')
    })
})

describe('keepLastSettled', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    const shown = (rows: { id: string }[], state: PartyListViewState) => ({
        rows,
        viewState: state,
    })

    it('shows a settled list and keeps it', () => {
        const now = shown([a], 'ready')
        expect(keepLastSettled(undefined, now)).toEqual({ next: now, shown: now })
    })

    it('keeps the last settled rows and state while the next query loads', () => {
        const prev = shown([a], 'no-match')
        const result = keepLastSettled(prev, shown([], 'loading'))
        expect(result.next).toBe(prev)
        expect(result.shown).toBe(prev)
    })

    it('shows loading when nothing settled yet', () => {
        const now = shown([], 'loading')
        expect(keepLastSettled(undefined, now)).toEqual({ next: undefined, shown: now })
    })

    it('returns the kept value itself when nothing changed, so the caller sets no state', () => {
        const prev = shown([a, b], 'ready')
        expect(keepLastSettled(prev, shown([a, b], 'ready')).next).toBe(prev)
    })

    it('replaces the kept value when the rows or the state change', () => {
        const prev = shown([a], 'ready')
        const now = shown([a, b], 'ready')
        expect(keepLastSettled(prev, now).next).toBe(now)
        const failed = shown([], 'error')
        expect(keepLastSettled(prev, failed)).toEqual({ next: failed, shown: failed })
    })
})
```

Create `books/tests/near-end.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isNearEnd, NEAR_END_PX } from '../tinycld/books/lib/near-end'

const at = (y: number) => ({
    contentOffset: { y },
    layoutMeasurement: { height: 800 },
    contentSize: { height: 2800 },
})

describe('isNearEnd', () => {
    it('is false at the top of a long list', () => {
        expect(isNearEnd(at(0))).toBe(false)
    })

    it('turns true within NEAR_END_PX of the end', () => {
        expect(isNearEnd(at(2800 - 800 - NEAR_END_PX - 1))).toBe(false)
        expect(isNearEnd(at(2800 - 800 - NEAR_END_PX))).toBe(true)
        expect(isNearEnd(at(2000))).toBe(true)
    })

    it('is true for a list shorter than its view', () => {
        expect(
            isNearEnd({
                contentOffset: { y: 0 },
                layoutMeasurement: { height: 800 },
                contentSize: { height: 300 },
            })
        ).toBe(true)
    })
})
```

In `books/tests/customer-tree.test.ts`, add `customerTreeRows,` to the `../tinycld/books/lib/customer-tree` import list (after `customerRows,`), and append:

```ts
describe('customerTreeRows', () => {
    const alder = treeCustomer({ id: 'alder', display_name: 'Alder' })
    const annex = treeCustomer({ id: 'annex', display_name: 'Annex', parent: 'alder' })
    const barn = treeCustomer({ id: 'barn', display_name: 'Barn', parent: 'alder' })
    const birch = treeCustomer({ id: 'birch', display_name: 'Birch' })
    const loaded = (c: TreeCustomer, parentRow?: TreeCustomer) => ({ ...c, parentRow })
    const shape = (rows: ReturnType<typeof customerTreeRows<TreeCustomer>>) =>
        rows.map(row => [row.party.id, row.depth])

    it("keeps the server's order and indents each sub-customer under the parent above it", () => {
        const rows = customerTreeRows([
            loaded(alder),
            loaded(annex, alder),
            loaded(barn, alder),
            loaded(birch),
        ])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['annex', 1],
            ['barn', 1],
            ['birch', 0],
        ])
    })

    it("shows a matching sub-customer's parent above it, once", () => {
        const rows = customerTreeRows([loaded(annex, alder), loaded(barn, alder), loaded(birch)])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['annex', 1],
            ['barn', 1],
            ['birch', 0],
        ])
    })

    it('does not repeat a parent that matched itself', () => {
        expect(shape(customerTreeRows([loaded(alder), loaded(annex, alder)]))).toEqual([
            ['alder', 0],
            ['annex', 1],
        ])
    })

    it('shows a sub-customer whose parent has not loaded as a top-level row', () => {
        expect(shape(customerTreeRows([loaded(annex)]))).toEqual([['annex', 0]])
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/list-search.test.ts tests/list-state.test.ts tests/near-end.test.ts tests/customer-tree.test.ts`
Expected: FAIL: `Failed to resolve import "../tinycld/books/lib/list-search"` (and list-state, near-end); `customerTreeRows is not a function`.

- [ ] **Step 3: Write the code**

Create `books/tinycld/books/lib/list-search.ts`:

```ts
import { and, type eq, ilike, or } from '@tanstack/db'

// One page of a Books list. The list's query asks for one row more, to know whether
// another page follows.
export const LIST_PAGE_SIZE = 50

// Books lists order by sort_key, then id. The order is lexical (by code unit): TanStack
// DB builds a string cursor for the next page only for a lexical order, and the store
// then sorts as SQLite does on the server. A row the server has not answered yet has no
// sort_key and sorts first until the server's row lands.
export const SORT_KEY_ORDER = { direction: 'asc', stringSort: 'lexical', nulls: 'first' } as const
export const ID_ORDER = { direction: 'asc', stringSort: 'lexical' } as const

export type ListFilters = { search: string; showInactive: boolean }

type TextColumn = Parameters<typeof ilike>[0]
type Clause = ReturnType<typeof eq>

// The typed search, cut where `%`, `_` or `\` stood. PocketBase's `~` and SQLite's LIKE
// read those as wildcards or as an escape, and TanStack DB's local `ilike` reads `%` and
// `_` as wildcards, so a piece holds none of them and both sides match it as plain text.
export function searchPieces(text: string): string[] {
    return text
        .split(/[%_\\]/)
        .map(piece => piece.trim())
        .filter(piece => piece !== '')
}

// Whether the list's query needs a `where` at all.
export function hasListFilter(filters: ListFilters): boolean {
    return !filters.showInactive || searchPieces(filters.search).length > 0
}

// The list's `where`: every piece of the search in one of the text columns, and only
// active rows unless Show inactive is on. pbtsdb sends it to the server as the request
// filter, and TanStack DB applies it to the rows in the store. `and` and `or` never get
// one argument: pbtsdb turns a one-argument `or` into a broken filter. Call it only when
// `hasListFilter` is true.
export function listFilter(
    columns: { isActive: Clause; text: readonly [TextColumn, TextColumn, ...TextColumn[]] },
    filters: ListFilters
) {
    const clauses = searchPieces(filters.search).map(piece => {
        const [first, second, ...rest] = columns.text.map(column => ilike(column, `%${piece}%`))
        return or(first, second, ...rest)
    })
    if (!filters.showInactive) clauses.push(columns.isActive)
    const [first, second, ...rest] = clauses
    return second === undefined ? first : and(first, second, ...rest)
}

// Whether any record exists. It is asked only while the list shows none (the one-row
// query that answers runs only then), and is undefined until that query answers.
export function anyRecordState(
    isNeeded: boolean,
    probe: { isReady: boolean; data: readonly unknown[] | undefined }
): boolean | undefined {
    if (!isNeeded) return true
    if (!probe.isReady) return undefined
    return (probe.data?.length ?? 0) > 0
}
```

Create `books/tinycld/books/lib/list-state.ts`:

```ts
import { searchPieces } from './list-search'
import type { PartyListViewState } from './party-list'

// The state of a server-filtered list. The page holds only matching rows, so an empty
// page needs `anyRecord` (does any record exist?) to tell 'empty' from 'all-inactive'
// and 'no-match'. 'all-inactive' is only the default view hiding every record: a search
// that finds nothing is 'no-match' whatever the inactive filter.
export function listViewState(input: {
    isReady: boolean
    isError: boolean
    rowCount: number
    anyRecord: boolean | undefined
    search: string
    showInactive: boolean
}): PartyListViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.rowCount > 0) return 'ready'
    if (input.anyRecord === undefined) return 'loading'
    if (!input.anyRecord) return 'empty'
    const hidesOnlyInactive = searchPieces(input.search).length === 0 && !input.showInactive
    return hidesOnlyInactive ? 'all-inactive' : 'no-match'
}

export type ShownList<Row> = { rows: readonly Row[]; viewState: PartyListViewState }

function sameRows<Row>(a: readonly Row[], b: readonly Row[]) {
    return a.length === b.length && a.every((row, i) => row === b[i])
}

// A new search or Show inactive starts a new query, which loads before it shows. Until
// it settles the last settled rows and state stay on screen, so the toolbar (and the
// search field the person is typing in) stays mounted. The kept value is replaced only
// when its contents differ, so a caller that stores it converges.
export function keepLastSettled<Row>(
    prev: ShownList<Row> | undefined,
    now: ShownList<Row>
): { next: ShownList<Row> | undefined; shown: ShownList<Row> } {
    if (now.viewState === 'loading') return { next: prev, shown: prev ?? now }
    if (prev && prev.viewState === now.viewState && sameRows(prev.rows, now.rows)) {
        return { next: prev, shown: prev }
    }
    return { next: now, shown: now }
}
```

Create `books/tinycld/books/lib/near-end.ts`:

```ts
// How close to the end of a scrolled list the next page starts loading: about ten rows,
// so the rows are there before the person reaches the end.
export const NEAR_END_PX = 600

type ScrollMetrics = {
    contentOffset: { y: number }
    layoutMeasurement: { height: number }
    contentSize: { height: number }
}

export function isNearEnd({ contentOffset, layoutMeasurement, contentSize }: ScrollMetrics): boolean {
    return contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_END_PX
}
```

In `books/tinycld/books/lib/customer-tree.ts`, add after `customerPartyRows`:

```ts
// The list's rows from the server, in sort_key order, which is already the tree: each
// top-level customer is followed by its sub-customers (server/sort_keys.go). A search
// keeps only matching rows, so a matching sub-customer whose parent did not match
// brings `parentRow` (the query's materialized parent), shown above it once. A
// sub-customer whose parent has not loaded yet is a top-level row.
export function customerTreeRows<T extends TreeCustomer>(
    rows: readonly (T & { parentRow: T | undefined })[]
): PartyListRow<T>[] {
    const out: PartyListRow<T>[] = []
    let shownParent = ''
    for (const row of rows) {
        if (row.parent === '') {
            out.push({ party: row, depth: 0 })
            shownParent = row.id
            continue
        }
        if (row.parent !== shownParent && row.parentRow) {
            out.push({ party: row.parentRow, depth: 0 })
            shownParent = row.parentRow.id
        }
        out.push({ party: row, depth: row.parent === shownParent ? 1 : 0 })
    }
    return out
}
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/list-search.test.ts tests/list-state.test.ts tests/near-end.test.ts tests/customer-tree.test.ts`
Expected: PASS. (The four `listFilter` strings were read from the real pbtsdb 2.1.0 converter in a probe.)

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write tinycld/books/lib/list-search.ts tinycld/books/lib/list-state.ts tinycld/books/lib/near-end.ts tinycld/books/lib/customer-tree.ts tests/list-search.test.ts tests/list-state.test.ts tests/near-end.test.ts tests/customer-tree.test.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add tinycld/books/lib/list-search.ts tinycld/books/lib/list-state.ts tinycld/books/lib/near-end.ts tinycld/books/lib/customer-tree.ts tests/list-search.test.ts tests/list-state.test.ts tests/near-end.test.ts tests/customer-tree.test.ts && git commit -m "feat(books): list search, list state and tree rows for server-paged lists"
```

---

### Task 5: Customers, vendors and products lists page from the server

**Files:**
- Create: `books/tests/e2e/superuser-seed.ts`, `books/tests/e2e/list-paging.spec.ts`, `books/tinycld/books/hooks/useListFilters.ts`
- Modify: `books/tinycld/books/hooks/useRecordList.ts`, `hooks/useCustomersQuery.ts`, `hooks/useVendorsQuery.ts`, `hooks/useProductsQuery.ts`, `lib/list-query.ts`, `lib/party-list.ts`, `lib/customer-tree.ts`, `lib/product-list.ts`, `components/ListTable.tsx`, `components/ListCards.tsx`, `components/party/PartyList.tsx`, `components/customers/CustomersList.tsx`, `components/vendors/VendorsList.tsx`, `components/products/ProductsList.tsx`, `collections.ts` (comments)
- Delete: `books/tinycld/books/hooks/useCustomersList.ts`
- Modify tests: `books/tests/e2e/customer-form-list.spec.ts`, `books/tests/e2e/vendor-form-list.spec.ts`, `books/tests/e2e/customer-form-page.spec.ts` (comments), `books/tests/party-list.test.ts`, `books/tests/customer-tree.test.ts`, `books/tests/product-list.test.ts`, `books/tests/collections.test.ts` (comments)

**Interfaces:**
- Consumes: everything Task 4 produces; `sort_key` (Task 1).
- Produces:
  - `useListFilters(): { query: string; setQuery(text: string): void; clearSearch(): void; showInactive: boolean; setShowInactive(value: boolean): void }`, `type ListFilterState = ReturnType<typeof useListFilters>`.
  - `type PagedListSource<Row> = { rows: readonly Row[]; isReady: boolean; isError: boolean; anyRecord: boolean | undefined; loadMore(): void }`.
  - `useRecordList<Row>(filters: ListFilterState, source: PagedListSource<Row>): RecordListState<Row>`; `RecordListState<Row>` gains `onNearEnd(): void`, and `rows` becomes `readonly Row[]`.
  - `useVendorsQuery(filters: ListFilters)`, `useProductsQuery(filters: ListFilters)`, `useCustomersQuery(filters: ListFilters)`: each returns `PagedListSource<…> & { retry(): void }`. `VendorRecord`, `ProductRecord`, `CustomerRecord` keep their names.
  - `retryListQuery(queries: Parameters<typeof recoverLiveQueries>[0]['queries'], logContext: string): void`.
  - `ListTable` and `ListCards` take `onNearEnd(): void`; `ListTable`'s vertical scroller has test id `<testID>-rows`.
  - E2E: `superuserClient(): Promise<PocketBase>`, `type Seeded = { collection: string; id: string }`, `deleteSeeded(pb: PocketBase, seeded: readonly Seeded[]): Promise<void>`, `runStamp(): string` in `tests/e2e/superuser-seed.ts`.

- [ ] **Step 1: Write the superuser seed helper (probed once against the e2e server before this plan: it signed in, created a vendor, a customer with a sub-customer and a service product through the Books guards, and deleted them newest first)**

No core e2e helper signs in as the superuser (`@tinycld/core/e2e-helpers` re-exports `tinycld/tests/e2e/helpers.ts`, which has none); mail keeps its own copy in `mail/tests/helpers.ts`. Books gets its own, with the defaults `scripts/e2e-serve.ts` creates the superuser with.

Create `books/tests/e2e/superuser-seed.ts`:

```ts
import PocketBase from 'pocketbase'

// A PocketBase client signed in as the e2e server's superuser, for the one spec the
// human allowed to seed list rows directly (list-paging.spec.ts; its header says why).
// scripts/e2e-serve.ts creates this superuser from the same variables and defaults.
const PB_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? 7200}`
const SUPERUSER_EMAIL = process.env.ADMIN_USER_LOGIN || 'admin@tinycld.org'
const SUPERUSER_PASSWORD = process.env.ADMIN_USER_PW || 'AdminPass1234!'

export async function superuserClient(): Promise<PocketBase> {
    const pb = new PocketBase(PB_URL)
    pb.autoCancellation(false)
    await pb.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD)
    return pb
}

export type Seeded = { collection: string; id: string }

// Deletes seeded rows newest first, so a sub-customer goes before its parent.
export async function deleteSeeded(pb: PocketBase, seeded: readonly Seeded[]) {
    for (const row of [...seeded].reverse()) {
        await pb.collection(row.collection).delete(row.id)
    }
}

// A word unique to one run, put in every seeded name: a search for it shows only that
// run's rows, whatever other specs add to the shared database meanwhile.
export function runStamp(): string {
    return `pg${Date.now().toString(36)}`
}
```

- [ ] **Step 2: Write the failing e2e spec**

Create `books/tests/e2e/list-paging.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'
import { PARTY_ROW_HEIGHT } from '../../tinycld/books/lib/party-list'
import {
    customerEntry,
    expectEntriesInOrder,
    openCustomersList,
    searchCustomers,
} from './customer-form-helpers'
import { openProductsList, productEntry, searchProducts } from './products-services-helpers'
import { DESKTOP, openBooks, PHONE, textLeft, textTop } from './record-form-helpers'
import { deleteSeeded, runStamp, type Seeded, superuserClient } from './superuser-seed'
import { openVendorsList, searchVendors, vendorEntries, vendorEntry } from './vendor-form-helpers'

// Books lists page from the server: a list asks PocketBase for one page (50 rows and one
// to look ahead), sorted and filtered there, and asks for the next page, by a cursor on
// sort_key, only when the person scrolls near its end. Search, Show inactive, the sort
// and scrolling to load more are driven through the UI against the real server.
//
// SEEDED BY A SUPERUSER WRITE. Each describe seeds about 60 rows with a superuser
// client (superuser-seed.ts). This extends the CLAUDE.md seed exception; the human
// approved it for this spec only (2026-10-31). Why: paging needs more rows than one
// page, and creating 50 or more records through the New form takes minutes per list
// on every run. What this therefore does NOT cover: record creation. No row here is
// created through the form, so read this spec as coverage of listing, searching,
// filtering, sorting and paging existing records only; the customer, vendor and
// products form specs cover creation.
//
// ISOLATION. Every seeded name holds a word unique to the run (`runStamp`) and starts
// with "Zz Paging", so it sorts after the fixtures other specs read at the top of a
// list. Each test searches for the run's word, so rows other specs add never enter its
// pages, and afterAll deletes every seeded row. The requests are only watched
// (`page.on('request')`), never answered or changed.

const two = (n: number) => String(n).padStart(2, '0')

// Keeps the URL of every list request the page sends for `collection`.
function watchListRequests(page: Page, collection: string): URL[] {
    const seen: URL[] = []
    page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === `/api/collections/${collection}/records`) seen.push(url)
    })
    return seen
}

const filterOf = (url: URL | undefined) => url?.searchParams.get('filter') ?? ''
const isCursor = (url: URL) => filterOf(url).includes('sort_key >')
const isListPage = (url: URL) => url.searchParams.get('sort') === 'sort_key,id'
const textFilter = (term: string) =>
    `display_name ~ "%${term}%" || company ~ "%${term}%" || email ~ "%${term}%" || phone ~ "%${term}%"`

// The first page's request for a search: sorted, no cursor, filtered on the term.
function searchRequest(seen: readonly URL[], term: string) {
    return seen.find(url => isListPage(url) && !isCursor(url) && filterOf(url).includes(term))
}

async function scrollToEnd(page: Page, testId: string) {
    await page.getByTestId(testId).evaluate(el => {
        el.scrollTop = el.scrollHeight
    })
}

async function scrollToRow(page: Page, testId: string, index: number) {
    await page.getByTestId(testId).evaluate((el, top) => {
        el.scrollTop = top
    }, index * PARTY_ROW_HEIGHT)
}

test.describe('vendors list pages from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const vendor = (label: string) => `Zz Paging ${stamp} ${label}`
    const lowerFable = `zz paging ${stamp} fable`

    test.beforeAll(async () => {
        const pb = await superuserClient()
        const create = async (display_name: string, inactive = false) => {
            const row = await pb.collection('books_vendors').create({ display_name, inactive })
            seeded.push({ collection: 'books_vendors', id: row.id })
        }
        // Created in reverse order, so the order the list shows is the server's sort.
        for (let n = 57; n >= 1; n--) await create(vendor(`Vendor ${two(n)}`))
        // The sort folds case and accents: Eagle, Écho, fable, then the Vendor rows.
        await create(lowerFable)
        await create(vendor('Écho'))
        await create(vendor('Eagle'))
        await create(vendor('Vendor 99'), true)
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page at a time; search, sort and Show inactive on the server (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_vendors')
        await openVendorsList(page)

        // (1) The search is a request filter (`~` on every text column, active rows only)
        //     for one page of 50 and a row to look ahead, sorted by the server.
        await searchVendors(page, stamp)
        await expect(vendorEntry(page, vendor('Eagle'))).toBeVisible()
        const searched = searchRequest(seen, stamp)
        expect(searched?.searchParams.get('perPage')).toBe('51')
        expect(filterOf(searched)).toBe(`((${textFilter(stamp)}) && inactive = false)`)

        // (2) The server's order ignores case and accents.
        const order = [vendor('Eagle'), vendor('Écho'), lowerFable, vendor('Vendor 01')]
        for (const [index, name] of order.entries()) {
            await expect(vendorEntries(page).nth(index)).toContainText(name)
        }

        // (3) Only the first page is loaded until the person scrolls near the end.
        expect(seen.some(isCursor)).toBe(false)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-table-rows')
                return seen.some(isCursor)
            })
            .toBe(true)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-table-rows')
                return vendorEntry(page, vendor('Vendor 57')).count()
            })
            .toBe(1)
        await expect(vendorEntry(page, vendor('Vendor 99'))).toHaveCount(0)

        // (4) Show inactive drops the inactive filter from the request.
        await searchVendors(page, `${stamp} Vendor 99`)
        await expect(page.getByTestId('vendors-no-match')).toBeVisible()
        await page.getByTestId('vendors-show-inactive').click()
        await expect(vendorEntry(page, vendor('Vendor 99'))).toBeVisible()
        expect(
            seen.some(url => filterOf(url) === `(${textFilter(`${stamp} Vendor 99`)})`)
        ).toBe(true)
        await page.getByTestId('vendors-show-inactive').click()

        // (5) `%` is not a wildcard: it cuts the text, and the list keeps working.
        await searchVendors(page, `${stamp} Vendor 0%`)
        await expect(vendorEntries(page)).toHaveCount(9)
        await expect(page.getByTestId('vendors-banner')).toHaveCount(0)

        // (6) Typing a key at a time keeps the field focused while each answer loads.
        const input = page.getByTestId('vendors-search')
        await input.fill('')
        await input.pressSequentially(`${stamp} Vendor 1`)
        await expect(input).toBeFocused()
        await expect(input).toHaveValue(`${stamp} Vendor 1`)
        await expect(vendorEntries(page)).toHaveCount(10)
    })

    // At PHONE only for vendors: the phone path renders ListCards, other scrolling code
    // than the desktop table; the customers and products cards share it.
    test('the next page loads as the cards scroll (phone)', async ({ page }) => {
        await openBooks(page, PHONE)
        const seen = watchListRequests(page, 'books_vendors')
        await openVendorsList(page)
        await searchVendors(page, stamp)
        await expect(vendorEntry(page, vendor('Eagle'))).toBeVisible()
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-cards')
                return seen.some(isCursor)
            })
            .toBe(true)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-cards')
                return vendorEntry(page, vendor('Vendor 57')).count()
            })
            .toBe(1)
    })
})

test.describe('customers list pages its tree from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const customer = (n: number) => `Zz Paging ${stamp} Customer ${two(n)}`
    const sub = (n: number) => `Zz Paging ${stamp} Sub ${two(n)}`

    // Customer 01 alone, customers 02 to 30 each with one sub-customer, customer 31
    // alone: 60 rows. In the tree order row 50 is customer 26, the last row of the first
    // page, and its sub-customer is the first row of the second.
    test.beforeAll(async () => {
        const pb = await superuserClient()
        const parents = new Map<number, string>()
        for (let n = 31; n >= 1; n--) {
            const row = await pb.collection('books_customers').create({ display_name: customer(n) })
            seeded.push({ collection: 'books_customers', id: row.id })
            parents.set(n, row.id)
        }
        for (let n = 30; n >= 2; n--) {
            const row = await pb
                .collection('books_customers')
                .create({ display_name: sub(n), parent: parents.get(n) })
            seeded.push({ collection: 'books_customers', id: row.id })
        }
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page boundary keeps the tree; a matching sub-customer shows its parent (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_customers')
        await openCustomersList(page)
        await searchCustomers(page, stamp)
        await expect(customerEntry(page, customer(1))).toBeVisible()
        expect(searchRequest(seen, stamp)?.searchParams.get('perPage')).toBe('51')
        expect(seen.some(isCursor)).toBe(false)

        await expect
            .poll(async () => {
                await scrollToEnd(page, 'customers-table-rows')
                return seen.some(isCursor)
            })
            .toBe(true)
        await scrollToRow(page, 'customers-table-rows', 45)
        const list = page.getByTestId('customers-list')
        const names = [customer(26), sub(26), customer(27)]
        await expect
            .poll(async () => {
                const tops = await Promise.all(names.map(name => textTop(list, name)))
                return tops.every((top, i) => top >= 0 && (i === 0 || top > tops[i - 1]))
            })
            .toBe(true)
        await expect
            .poll(
                async () =>
                    (await textLeft(customerEntry(page, sub(26)), sub(26))) -
                    (await textLeft(customerEntry(page, customer(26)), customer(26)))
            )
            .toBeGreaterThan(8)

        // Only the sub-customer matches; its parent shows above it, the parent's other
        // rows do not.
        await searchCustomers(page, `${stamp} Sub 30`)
        await expectEntriesInOrder(page, [customer(30), sub(30)])
    })
})

test.describe('products list pages from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const product = (n: number) => `Zz Paging ${stamp} Product ${two(n)}`

    test.beforeAll(async () => {
        const pb = await superuserClient()
        // 4000 Consulting Income is a seeded income account (lib/seed-accounts.ts).
        const income = await pb.collection('books_accounts').getFirstListItem('number = "4000"')
        for (let n = 60; n >= 1; n--) {
            const row = await pb
                .collection('books_products')
                .create({ type: 'service', name: product(n), income_account: income.id })
            seeded.push({ collection: 'books_products', id: row.id })
        }
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page at a time as the table scrolls (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_products')
        await openProductsList(page)
        await searchProducts(page, stamp)
        await expect(productEntry(page, product(1))).toBeVisible()
        const searched = searchRequest(seen, stamp)
        expect(searched?.searchParams.get('perPage')).toBe('51')
        expect(filterOf(searched)).toBe(
            `((name ~ "%${stamp}%" || sku ~ "%${stamp}%" || sales_description ~ "%${stamp}%") && inactive = false)`
        )
        expect(seen.some(isCursor)).toBe(false)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'products-table-rows')
                return productEntry(page, product(60)).count()
            })
            .toBe(1)
        expect(seen.some(isCursor)).toBe(true)
    })
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/list-paging.spec.ts`
Expected: FAIL. The seed succeeds (the guards set `sort_key`, Task 1). Step (1) of the vendors test fails with `Expected: "51" Received: undefined` (today's list request has no `sort`); the phone test times out in its poll for a `sort_key >` request; the customers and products tests fail on `perPage`. afterAll still deletes the seeded rows.

- [ ] **Step 4: Shared list plumbing**

Create `books/tinycld/books/hooks/useListFilters.ts`:

```ts
import { useState } from 'react'

// The search text and Show inactive of one list. They live in the list's layout, which
// stays mounted while records open and close, so they survive that; the list's query
// reads them, so the server filters by them.
export function useListFilters() {
    const [query, setQuery] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    return {
        query,
        setQuery,
        clearSearch: () => setQuery(''),
        showInactive,
        setShowInactive,
    }
}

export type ListFilterState = ReturnType<typeof useListFilters>
```

Replace the whole of `books/tinycld/books/hooks/useRecordList.ts` with:

```ts
import { useState } from 'react'
import { keepLastSettled, listViewState, type ShownList } from '../lib/list-state'
import type { PartyListViewState } from '../lib/party-list'
import type { ListFilterState } from './useListFilters'

export type RecordListState<Row> = {
    rows: readonly Row[]
    viewState: PartyListViewState
    query: string
    setQuery(text: string): void
    clearSearch(): void
    showInactive: boolean
    setShowInactive(value: boolean): void
    // Asks for the next page; the table and the cards call it as they scroll near the end.
    onNearEnd(): void
}

// What a list's paged query gives the list.
export type PagedListSource<Row> = {
    rows: readonly Row[]
    isReady: boolean
    isError: boolean
    anyRecord: boolean | undefined
    loadMore(): void
}

// A list's rows and state from its paged query. While the query for a new search or
// Show inactive loads, the last settled rows and state stay on screen (keepLastSettled),
// so the toolbar and the search field being typed in stay mounted.
export function useRecordList<Row>(
    filters: ListFilterState,
    source: PagedListSource<Row>
): RecordListState<Row> {
    const now: ShownList<Row> = {
        rows: source.rows,
        viewState: listViewState({
            isReady: source.isReady,
            isError: source.isError,
            rowCount: source.rows.length,
            anyRecord: source.anyRecord,
            search: filters.query,
            showInactive: filters.showInactive,
        }),
    }
    const [kept, setKept] = useState<ShownList<Row>>()
    const { next, shown } = keepLastSettled(kept, now)
    if (next !== kept) setKept(next)
    return {
        rows: shown.rows,
        viewState: shown.viewState,
        query: filters.query,
        setQuery: filters.setQuery,
        clearSearch: filters.clearSearch,
        showInactive: filters.showInactive,
        setShowInactive: filters.setShowInactive,
        onNearEnd: source.loadMore,
    }
}
```

Replace the whole of `books/tinycld/books/lib/list-query.ts` with:

```ts
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

// Rebuilds a list's failed queries (a disabled one is undefined and skipped). The
// collection stays out of `sources`: the open record and other readers use it too, and a
// cleaned source empties them.
export function retryListQuery(
    queries: Parameters<typeof recoverLiveQueries>[0]['queries'],
    logContext: string
): void {
    void recoverLiveQueries({
        queries,
        sources: [],
        onError: err => log.error(logContext, err),
    })
}
```

In `books/tinycld/books/components/ListTable.tsx`:
- change the react-native import to `import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, Text, View, type ViewStyle } from 'react-native'` and add `import { isNearEnd } from '../lib/near-end'`;
- add `onNearEnd(): void` to `ListTableProps<Row>` (after `renderRow`) and to the destructured props;
- before `return`, add

```tsx
    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        rowWindow.onScroll(event)
        if (isNearEnd(event.nativeEvent)) onNearEnd()
    }
```

- on the inner vertical `ScrollView`, add `testID={\`${testID}-rows\`}` and change `onScroll={rowWindow.onScroll}` to `onScroll={onScroll}`;
- change the comment above the function to `// A windowed table: below \`minWidth\` it scrolls sideways, the header stays on top while the` / `// rows scroll under it, and nearing the end asks for the next page (\`onNearEnd\`).`

In `books/tinycld/books/components/ListCards.tsx`:
- change the react-native import to `import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, useWindowDimensions, View } from 'react-native'` and add `import { isNearEnd } from '../lib/near-end'`;
- add `onNearEnd(): void` to `ListCardsProps<Row>` and to the destructured props;
- before `return`, add the same `onScroll` function as in ListTable, and change `onScroll={rowWindow.onScroll}` to `onScroll={onScroll}`;
- change the comment to `// A windowed card list for phones: every card is drawn at the height \`heightOf\` gives it,` / `// and nearing the end asks for the next page (\`onNearEnd\`).`

In `books/tinycld/books/components/party/PartyList.tsx`, add `onNearEnd={list.onNearEnd}` to both `<ListTable` and `<ListCards`.

- [ ] **Step 5: The three paged queries**

Replace the whole of `books/tinycld/books/hooks/useVendorsQuery.ts` with:

```ts
import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import { retryListQuery } from '../lib/list-query'
import {
    anyRecordState,
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'

// One page of vendors at a time, filtered and ordered by the server: the search, the
// inactive filter and the order are the query's, so only the pages scrolled into reach
// the store. A one-row query runs only while the page is empty, to tell "no vendors"
// from "none to show".
export function useVendorsQuery(filters: ListFilters) {
    const [vendorsCollection] = useStore('books_vendors')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ vendor: vendorsCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ vendor }) =>
                      listFilter(
                          {
                              isActive: eq(vendor.inactive, false),
                              text: [vendor.display_name, vendor.company, vendor.email, vendor.phone],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ vendor }) => vendor.sort_key, SORT_KEY_ORDER)
                .orderBy(({ vendor }) => vendor.id, ID_ORDER)
        },
        {
            queryKey: ['books.vendors.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const isEmpty = query.isReady && query.data.length === 0
    const anyQuery = useLiveQuery({
        queryKey: ['books.vendors.any', isEmpty],
        query: q =>
            isEmpty
                ? q
                      .from({ vendor: vendorsCollection })
                      .orderBy(({ vendor }) => vendor.id, ID_ORDER)
                      .limit(1)
                : undefined,
    })
    const data = query.data
    const rows = useMemo(() => data.map(vendor => ({ party: vendor, depth: 0 as const })), [data])
    return {
        rows,
        isReady: query.isReady,
        isError: query.isError || anyQuery.isError,
        anyRecord: anyRecordState(isEmpty, anyQuery),
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
        // The open vendor's record reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery([query.collection, anyQuery.collection], 'books.vendors'),
    }
}

export type VendorRecord = ReturnType<typeof useVendorsQuery>['rows'][number]['party']
```

Replace the whole of `books/tinycld/books/hooks/useProductsQuery.ts` with:

```ts
import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { retryListQuery } from '../lib/list-query'
import {
    anyRecordState,
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'

// One page of products at a time, filtered and ordered by the server, so only the pages
// scrolled into reach the store. A one-row query runs only while the page is empty, to
// tell "no products" from "none to show".
export function useProductsQuery(filters: ListFilters) {
    const [productsCollection] = useStore('books_products')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ product: productsCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ product }) =>
                      listFilter(
                          {
                              isActive: eq(product.inactive, false),
                              text: [product.name, product.sku, product.sales_description],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ product }) => product.sort_key, SORT_KEY_ORDER)
                .orderBy(({ product }) => product.id, ID_ORDER)
        },
        {
            queryKey: ['books.products.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const isEmpty = query.isReady && query.data.length === 0
    const anyQuery = useLiveQuery({
        queryKey: ['books.products.any', isEmpty],
        query: q =>
            isEmpty
                ? q
                      .from({ product: productsCollection })
                      .orderBy(({ product }) => product.id, ID_ORDER)
                      .limit(1)
                : undefined,
    })
    return {
        rows: query.data,
        isReady: query.isReady,
        isError: query.isError || anyQuery.isError,
        anyRecord: anyRecordState(isEmpty, anyQuery),
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
        // The open product's record reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery([query.collection, anyQuery.collection], 'books.products'),
    }
}

export type ProductRecord = ReturnType<typeof useProductsQuery>['rows'][number]
```

Replace the whole of `books/tinycld/books/hooks/useCustomersQuery.ts` with:

```ts
import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { customerTreeRows } from '../lib/customer-tree'
import { retryListQuery } from '../lib/list-query'
import {
    anyRecordState,
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'

// One page of customers at a time, filtered and ordered by the server. sort_key orders
// the tree (each customer followed by its sub-customers, server/sort_keys.go), so a page
// is a slice of the tree. A search keeps only matching customers; each row's parent is
// materialized, so a matching sub-customer shows under its parent even when the parent
// did not match. A one-row query runs only while the page is empty, to tell "no
// customers" from "none to show".
export function useCustomersQuery(filters: ListFilters) {
    const [customersCollection] = useStore('books_customers')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ customer: customersCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ customer }) =>
                      listFilter(
                          {
                              isActive: eq(customer.inactive, false),
                              text: [
                                  customer.display_name,
                                  customer.company,
                                  customer.email,
                                  customer.phone,
                              ],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ customer }) => customer.sort_key, SORT_KEY_ORDER)
                .orderBy(({ customer }) => customer.id, ID_ORDER)
                .select(({ customer }) => ({
                    ...customer,
                    parentRow: materialize(
                        q
                            .from({ parent: customersCollection })
                            .where(({ parent }) => eq(parent.id, customer.parent))
                            .findOne()
                    ),
                }))
        },
        {
            queryKey: ['books.customers.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const isEmpty = query.isReady && query.data.length === 0
    const anyQuery = useLiveQuery({
        queryKey: ['books.customers.any', isEmpty],
        query: q =>
            isEmpty
                ? q
                      .from({ customer: customersCollection })
                      .orderBy(({ customer }) => customer.id, ID_ORDER)
                      .limit(1)
                : undefined,
    })
    const data = query.data
    const rows = useMemo(() => customerTreeRows(data), [data])
    return {
        rows,
        isReady: query.isReady,
        isError: query.isError || anyQuery.isError,
        anyRecord: anyRecordState(isEmpty, anyQuery),
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
        // The parent picker reads the collection too, so the retry leaves it alone.
        retry: () => retryListQuery([query.collection, anyQuery.collection], 'books.customers'),
    }
}

export type CustomerRecord = ReturnType<typeof useCustomersQuery>['rows'][number]['party']
```

(These query shapes, `useLiveInfiniteQuery` with a materialized parent and the conditional one-row `useLiveQuery`, typechecked in a probe with `display_name` standing in for the then-missing `sort_key`; a probe against real pbtsdb with fake rows carrying `sort_key` showed the first request `sort=sort_key,id&perPage=51` with the `where` as its filter, a next-page request with `sort_key > "<last key>"`, the store holding only the loaded rows, and `query.data` keeping its identity across renders.)

- [ ] **Step 6: The three lists**

`books/tinycld/books/components/vendors/VendorsList.tsx`:
- replace `import { useRecordList } from '../../hooks/useRecordList'` with `import { useListFilters } from '../../hooks/useListFilters'` and `import { useRecordList } from '../../hooks/useRecordList'`;
- replace `import { partyRows, partyTitle } from '../../lib/party-list'` with `import { partyTitle } from '../../lib/party-list'`;
- replace

```tsx
    const source = useVendorsQuery()
    const list = useRecordList(
        { records: source.vendors, isReady: source.isReady, isError: source.isError },
        partyRows
    )
```
with
```tsx
    const filters = useListFilters()
    const source = useVendorsQuery({ search: filters.query, showInactive: filters.showInactive })
    const list = useRecordList(filters, source)
```

`books/tinycld/books/components/products/ProductsList.tsx`:
- add `import { useListFilters } from '../../hooks/useListFilters'`;
- remove `productRows,` from the `../../lib/product-list` import;
- replace

```tsx
    const source = useProductsQuery()
    const list = useRecordList(
        { records: source.products, isReady: source.isReady, isError: source.isError },
        productRows
    )
```
with
```tsx
    const filters = useListFilters()
    const source = useProductsQuery({ search: filters.query, showInactive: filters.showInactive })
    const list = useRecordList(filters, source)
```
- add `onNearEnd={list.onNearEnd}` to `<ListTable<ProductRecord>` and `<ListCards<ProductRecord>`.

`books/tinycld/books/components/customers/CustomersList.tsx`:
- replace `import { useCustomersList } from '../../hooks/useCustomersList'` with `import { useListFilters } from '../../hooks/useListFilters'`, and add `import { useRecordList } from '../../hooks/useRecordList'`;
- replace

```tsx
    const source = useCustomersQuery()
    const list = useCustomersList(source)
```
with
```tsx
    const filters = useListFilters()
    const source = useCustomersQuery({ search: filters.query, showInactive: filters.showInactive })
    const list = useRecordList(filters, source)
```

Delete `books/tinycld/books/hooks/useCustomersList.ts`.

- [ ] **Step 7: Remove the client-side search, filter and sort**

`books/tinycld/books/lib/party-list.ts`: delete `comparePartyNames`, `partyMatches`, `partyRows` and `partyListViewState` (and their comments); keep `PartyListViewState`, `ListRecord` and everything else.

`books/tinycld/books/lib/customer-tree.ts`: delete `compareCustomerNames`, `customerMatches`, `customerRows`, `CustomerListRow`, `customerPartyRows`, `CustomerListViewState` and `customerListViewState` (and their comments); change the import to `import { type PartyListRow } from './party-list'` (biome will sort it to `import type { PartyListRow } from './party-list'`). Keep `TreeCustomer`, `customerTreeRows`, `PICKER_LIMIT`, `pickerOptions`, `usableParentId`.

`books/tinycld/books/lib/product-list.ts`: delete `compareProductNames`, `productMatches` and `productRows` (and their comments).

`books/tests/party-list.test.ts`: delete `describe('partyRows', …)` and `describe('partyListViewState', …)`, remove `partyListViewState` and `partyRows` from the import, then delete each helper biome reports unused (`noUnusedVariables`; expected: `LOWER`, `KESTREL`, `ROWS`, `names`, `ids`).

`books/tests/customer-tree.test.ts`: delete the `compareCustomerNames`, `customerMatches`, `customerRows order`, `customerRows inactive filter`, `customerRows search` and `customerListViewState` blocks, remove those four names from the import, and delete the helpers left unused (expected: `LOWER`, `ORPHAN`, `ROWS`, `sparseCustomer`, `names`, `shape`).

`books/tests/product-list.test.ts`: delete the `productRows sorting` and `productRows filters` blocks, remove `productMatches` and `productRows` from the import, and delete the helpers left unused (expected: `names`, `ids`, and any of `ACCESS_POINT`, `CONSULTATION`, `PAPER`, `OFFICE_NETWORK`, `withoutSku` no other block reads).

`books/tinycld/books/collections.ts` comments:
- customers: `// No relations: the customers list materializes each row's parent with a` / `// subquery on this same collection, so nothing is filed through a relation.`
- vendors: `// No relations: the list loads one page of vendors at a time; the expense` / `// account picker reads books_accounts itself.`
- products: `// No relations: the list loads one page of products at a time; a bundle's` / `// rows, the product picker and the account pickers read their own` / `// collections. The guard sets name_key and sort_key, and the server stamps currency.`

`books/tests/collections.test.ts`: change the comments above `declares no relations on customers` to `// The customers list materializes each row's parent through a subquery on the` / `// same collection, so the collection files no related rows.`, above `declares no relations on vendors` to `// The vendors list loads one page at a time, and the expense account picker` / `// reads books_accounts itself.`, and the products one (`// The products list loads every product in one query; …`) to start `// The products list loads one page at a time; …` (keep the rest of that comment).

- [ ] **Step 8: Give the existing state fakes the server's row shape**

These `page.route` fakes stay as they are: none of them fakes paging, each fakes one list state the real server cannot be made to show on demand (the human allowed this, 2026-10-31):
- `customer-form-list.spec.ts` and `vendor-form-list.spec.ts`: (0) the held first load answered empty (loading, then the no-records state), (1b) the all-inactive answer, (2) the 400 load error and its Retry; each also cuts realtime for those steps.
- `customer-form-actions.spec.ts` (the refused delete and the failed has-sub-customers check), `customer-form-page.spec.ts` (the held and the failed has-sub-customers check), `vendor-1099-settings.spec.ts` (the held vendors load, the refused accounts load), `products-services-form.spec.ts` (the refused accounts and access loads): untouched.

The only change is the fake rows: a list row now carries `sort_key`, so the faked rows carry one too.

`books/tests/e2e/customer-form-list.spec.ts`, in `inactiveRecord`, replace

```ts
        parent: '',
```
with
```ts
        parent: '',
        // The guard's key for a top-level customer (server/sort_keys.go).
        sort_key: `${displayName.toLowerCase()}\u001f${id}`,
```

`books/tests/e2e/vendor-form-list.spec.ts`, in `asRecord`, replace

```ts
        expense_account: '',
    }
```
with
```ts
        expense_account: '',
        // The guard's key (server/sort_keys.go).
        sort_key: row.display_name.toLowerCase(),
    }
```

The all-inactive answer is static (both rows inactive, whatever the filter): the page's `inactive = false` query gets them, TanStack DB's local `where` drops them, and the one-row query (no `where`) finds them, so the list shows "No active …" as before.

`books/tests/e2e/customer-form-page.spec.ts` (comments only, the code stays): replace `// Holds every customers load that could answer "has sub-customers": the whole list (no` / `// filter) and any load filtered on \`parent\`. A load by id (the open record) goes through.` with `// Holds every customers load filtered on \`parent\` (the has-sub-customers check) and any` / `// load with no filter. The list's pages and a load by id (the open record) go through.`, and replace `// The picker stays locked while the has-sub-customers check loads. The list's` / `// load and the check are held, so the form shows before the check answers.` with `// The picker stays locked while the has-sub-customers check loads. The check is` / `// held, so the form shows before it answers.`

- [ ] **Step 9: Run the checks and the e2e**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write tinycld/books/hooks tinycld/books/lib tinycld/books/components tinycld/books/collections.ts tests/party-list.test.ts tests/customer-tree.test.ts tests/product-list.test.ts tests/collections.test.ts tests/e2e/superuser-seed.ts tests/e2e/list-paging.spec.ts tests/e2e/customer-form-list.spec.ts tests/e2e/vendor-form-list.spec.ts tests/e2e/customer-form-page.spec.ts`
Then: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
Expected: PASS.

Run the new and changed spec files only (CI runs the full suite):
`cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/list-paging.spec.ts tests/e2e/customer-form-list.spec.ts tests/e2e/vendor-form-list.spec.ts tests/e2e/customer-form-page.spec.ts`
Expected: PASS (list-paging: 4 tests). The list specs drive search, Show inactive and the sub-customer tree against the real server's LIKE and sort, and their state fakes still show loading, empty, all-inactive and error. After the run, no "Zz Paging" row is left (afterAll). A failure is real: read the trace and fix the cause (never a timeout or a retry).

- [ ] **Step 10: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add -A tinycld/books tests && git commit -m "feat(books): customers, vendors and products lists page from the server"
```

(`git add -A tinycld/books tests` stages the deleted `hooks/useCustomersList.ts` too; check `git status --short` first that nothing outside this task is staged.)

---

### Task 6: Help topics say how search matches

**Files:**
- Modify: `books/help/customers.md`, `books/help/vendors.md`, `books/help/products-services.md`, `books/help/navigating-books.md`
- Test: `books/tests/help-customers.test.ts`, `books/tests/help-vendors.test.ts`, `books/tests/help-products-services.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` of `books/tests/help-customers.test.ts`:

```ts
    it('says the app search matches the start of words', () => {
        expect(body).toContain('It matches words that start with what you type')
    })

    it('says the list loads more customers as you scroll', () => {
        expect(body).toContain('The list loads more customers as you scroll down.')
    })
```

Append inside the `describe` of `books/tests/help-vendors.test.ts`:

```ts
    it('says the app search matches the start of words', () => {
        expect(body).toContain('It matches words that start with what you type')
    })
```

Append inside the `describe` of `books/tests/help-products-services.test.ts`:

```ts
    it('explains finding a product from the app search', () => {
        expect(body).toContain('To find a product or service from anywhere in the app, use the app search.')
        expect(body).toContain('It matches words that start with what you type')
    })
```

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/help-customers.test.ts tests/help-vendors.test.ts tests/help-products-services.test.ts`
Expected: FAIL on the new tests (text not found).

- [ ] **Step 2: Edit the topics**

`books/help/customers.md`, section "Find a customer": replace the two paragraphs with

```markdown
To find a customer in the list, type in the search field above the list. The list shows the customers whose display name, company, email or phone contains the text. A sub-customer that matches keeps its parent in view. The list loads more customers as you scroll down.

To find a customer from anywhere in the app, use the app search. Search finds customers by display name, company or email. It matches words that start with what you type, so “north” finds “Northwind Traders” but “wind” does not, and it ignores case and accents. Choose a result to open that customer.
```

`books/help/vendors.md`, section "Find a vendor": replace the two paragraphs with

```markdown
To find a vendor in the list, type in the search field above the list. The list shows the vendors whose display name, company, email or phone contains the text. The list loads more vendors as you scroll down.

To find a vendor from anywhere in the app, use the app search. Search finds vendors by display name, company, email or legal name. Search never finds a vendor by its tax ID. It matches words that start with what you type, so “harb” finds “Harbor Freight Logistics” but “bor” does not, and it ignores case and accents. Choose a result to open that vendor.
```

`books/help/products-services.md`, section "Find a product or service": replace the paragraph with

```markdown
To find a product or service, type in the search field above the list. Search finds products by name, SKU or sales description. The list loads more items as you scroll down.

To find a product or service from anywhere in the app, use the app search. It matches words that start with what you type, and it ignores case and accents. Choose a result to open that item.
```

`books/help/navigating-books.md`: after the first paragraph, add

```markdown
To find an account, a journal entry, a customer, a vendor, or a product or service from anywhere in the app, use the app search. It matches words that start with what you type, and it ignores case and accents.
```

- [ ] **Step 3: Run the tests and regenerate the bundled help**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/help-customers.test.ts tests/help-vendors.test.ts tests/help-products-services.test.ts`
Expected: PASS (the existing sentence checks, such as `Search finds products by name, SKU or sales description.` and `use the app search. Search finds vendors by display name, company, email or legal name.`, still hold).

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books && git add help/customers.md help/vendors.md help/products-services.md help/navigating-books.md tests/help-customers.test.ts tests/help-vendors.test.ts tests/help-products-services.test.ts && git commit -m "docs(books): help says how search matches and that lists load as you scroll"
```

Then offer the human to add the search behavior to the website docs (CLAUDE.md asks after a user-facing feature); do not write website docs unasked.

---

### Task 7: Verification and push

- [ ] **Step 1: Go**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go vet ./... && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 2: TypeScript**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
Expected: PASS.

- [ ] **Step 3: The new and changed e2e spec files only**

No full local suite: CI runs it on the PR.

Run: `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/list-paging.spec.ts tests/e2e/customer-form-list.spec.ts tests/e2e/vendor-form-list.spec.ts tests/e2e/customer-form-page.spec.ts`
Expected: PASS. Any red test is diagnosed at its root and fixed at the source, whoever's change it looks like; never a re-run, a longer timeout or a skip.

- [ ] **Step 4: Confirm nothing outside Books changed, then push**

Run: `git -C /Users/nas/tmp/tinycld/books/tinycld status --short`
Expected: no output (core untouched; generated files are gitignored).

Run: `git -C /Users/nas/tmp/tinycld/books/books status --short`
Expected: no output (every task committed its work).

Run: `git -C /Users/nas/tmp/tinycld/books/books push -u origin books/p2-books-fts-search`
Expected: the branch is on the remote. The driver opens the PR; CI runs the full suite there. A red CI check is diagnosed and fixed at its source, never re-run or skipped.
