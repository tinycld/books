package books

// The two golden files of this file, testdata/receivable_statements.json and
// testdata/ar_aging_spec_full.json, hold the text of every statement the A/R
// Aging's stored rows are written with and the whole A/R Aging spec as it was
// before the open-items engine was extracted. They change only with a new A/R
// Aging scale run: docs/plans/ar-aging-evidence/perf-plans.md and
// testdata/ar_aging_stat1.json are recorded against these texts. With
// BOOKS_GOLDEN=1 the two tests write their files and fail with "golden
// written".

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	receivableStatementsFile = "testdata/receivable_statements.json"
	arAgingSpecFullFile      = "testdata/ar_aging_spec_full.json"
)

// receivableStatements is the shape of receivableStatementsFile.
type receivableStatements struct {
	Columns      string   `json:"columns"`
	Queries      []string `json:"queries"`
	Settled      string   `json:"settled"`
	SettledWhere string   `json:"settledWhere"`
	Settle       string   `json:"settle"`
	SettleWhere  string   `json:"settleWhere"`
}

func writingGolden() bool { return os.Getenv("BOOKS_GOLDEN") == "1" }

func TestReceivableStatementsKeepTheirText(t *testing.T) {
	got := receivableStatements{
		Columns:      receivableItems.Columns,
		Queries:      receivableItems.Queries,
		Settled:      receivableItems.settledSQL(""),
		SettledWhere: receivableItems.settledSQL("WHERE customer = 'x'"),
		Settle:       receivableItems.settleSQL(""),
		SettleWhere:  receivableItems.settleSQL("WHERE item = 'x'"),
	}
	if writingGolden() {
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		enc.SetIndent("", "  ")
		if err := enc.Encode(got); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(receivableStatementsFile, buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Fatal("golden written")
	}
	raw, err := os.ReadFile(receivableStatementsFile)
	if err != nil {
		t.Fatalf("read %s: %v", receivableStatementsFile, err)
	}
	var want receivableStatements
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatalf("parse %s: %v", receivableStatementsFile, err)
	}
	same := func(name, got, want string) {
		t.Helper()
		if got != want {
			t.Errorf("%s changed:\n got %q\nwant %q", name, got, want)
		}
	}
	same("receivableItems.Columns", got.Columns, want.Columns)
	if len(got.Queries) != len(want.Queries) {
		t.Fatalf("receivableItems.Queries has %d queries, want %d", len(got.Queries), len(want.Queries))
	}
	for i := range want.Queries {
		same(fmt.Sprintf("receivableItems.Queries[%d]", i), got.Queries[i], want.Queries[i])
	}
	same(`receivableItems.settledSQL("")`, got.Settled, want.Settled)
	same(`receivableItems.settledSQL("WHERE customer = 'x'")`, got.SettledWhere, want.SettledWhere)
	same(`receivableItems.settleSQL("")`, got.Settle, want.Settle)
	same(`receivableItems.settleSQL("WHERE item = 'x'")`, got.SettleWhere, want.SettleWhere)
}

func TestARAgingSpecKeepsItsJSON(t *testing.T) {
	got := mustJSON(arAgingSpec())
	if writingGolden() {
		if err := os.WriteFile(arAgingSpecFullFile, got, 0o644); err != nil {
			t.Fatal(err)
		}
		t.Fatal("golden written")
	}
	want, err := os.ReadFile(arAgingSpecFullFile)
	if err != nil {
		t.Fatalf("read %s: %v", arAgingSpecFullFile, err)
	}
	if string(got) != string(want) {
		t.Errorf("the A/R Aging spec JSON changed:\n got %s\nwant %s", got, want)
	}
	if rev := arAgingShipped().Revision; rev != 2 {
		t.Errorf("arAgingShipped().Revision = %d, want 2", rev)
	}
}

// zzOpenItemsColumns are the columns of the second table's query, without
// settled.
const zzOpenItemsColumns = "id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date"

// zzOpenItemsSQL gives three rows: item A of vendor v1 is two rows that add to
// zero on 2026-03-05; item B of v1 is one row that stays open.
const zzOpenItemsSQL = "SELECT column1 AS id, column2 AS source, column3 AS vendor, column4 AS entry, column5 AS date, " +
	"column6 AS currency, column7 AS debit, column8 AS credit, column9 AS item, column10 AS item_kind, " +
	"column11 AS item_number, column12 AS item_seq, column13 AS due_date FROM (VALUES " +
	"('zzrowa1', 'line', 'v1', 'e1', '2026-03-01', 'USD', 10000, 0, 'A', 'bill', '7', 7, '2026-03-31'), " +
	"('zzrowa2', 'line', 'v1', 'e2', '2026-03-05', 'USD', 0, 10000, 'A', 'bill', '7', 7, '2026-03-31'), " +
	"('zzrowb1', 'line', 'v1', 'e3', '2026-03-02', 'USD', 2500, 0, 'B', 'bill', '8', 8, '2026-04-01')" +
	") WHERE TRUE"

func TestOpenItemsEngineOnASecondTable(t *testing.T) {
	env := newLedgerEnv(t)
	app := env.app
	exec := func(sql string) {
		t.Helper()
		if _, err := app.DB().NewQuery(sql).Execute(); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	exec(`CREATE TABLE zz_open_items (
		id TEXT PRIMARY KEY, source TEXT, vendor TEXT, entry TEXT, date TEXT, currency TEXT,
		debit INTEGER, credit INTEGER, item TEXT, item_kind TEXT, item_number TEXT,
		item_seq INTEGER, due_date TEXT, settled TEXT)`)
	table := openItemsTable{
		Collection: "zz_open_items",
		Party:      "vendor",
		Columns:    zzOpenItemsColumns,
		Queries:    []string{zzOpenItemsSQL},
		Open:       openItemDay,
		Noun:       "test",
		ReadOnly:   "no",
	}
	inTx := func(name string, fn func(tx core.App) error) {
		t.Helper()
		if err := app.RunInTransaction(fn); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	type storedRow struct {
		ID      string `db:"id"`
		Item    string `db:"item"`
		Settled string `db:"settled"`
	}
	stored := func() []storedRow {
		t.Helper()
		var rows []storedRow
		if err := app.DB().NewQuery("SELECT id, item, settled FROM zz_open_items ORDER BY id").All(&rows); err != nil {
			t.Fatalf("read zz_open_items: %v", err)
		}
		return rows
	}
	verify := func() []ItemDrift {
		t.Helper()
		drifts, err := table.verify(app)
		if err != nil {
			t.Fatalf("verify: %v", err)
		}
		return drifts
	}
	requireOneDrift := func(when, id, problem string) {
		t.Helper()
		drifts := verify()
		if len(drifts) != 1 || drifts[0].ID != id || drifts[0].Problem != problem {
			t.Fatalf("%s: drifts = %+v, want one %q drift on %s", when, drifts, problem, id)
		}
	}

	inTx("rebuild", table.rebuild)
	rows := stored()
	want := []storedRow{
		{"zzrowa1", "A", "2026-03-05"},
		{"zzrowa2", "A", "2026-03-05"},
		{"zzrowb1", "B", openItemDay},
	}
	if len(rows) != len(want) {
		t.Fatalf("rebuild stored %d rows %+v, want 3", len(rows), rows)
	}
	for i := range want {
		if rows[i] != want[i] {
			t.Errorf("stored row %d = %+v, want %+v", i, rows[i], want[i])
		}
	}
	if drifts := verify(); len(drifts) != 0 {
		t.Fatalf("verify after rebuild = %+v, want no drift", drifts)
	}

	exec("UPDATE zz_open_items SET settled = '2026-01-01' WHERE id = 'zzrowb1'")
	requireOneDrift("a wrong settled day", "zzrowb1", "settled")
	exec("UPDATE zz_open_items SET settled = '" + openItemDay + "' WHERE id = 'zzrowb1'")

	exec("DELETE FROM zz_open_items WHERE id = 'zzrowb1'")
	requireOneDrift("a deleted row", "zzrowb1", "missing")
	exec("INSERT INTO zz_open_items (" + zzOpenItemsColumns + ", settled) VALUES " +
		"('zzrowb1', 'line', 'v1', 'e3', '2026-03-02', 'USD', 2500, 0, 'B', 'bill', '8', 8, '2026-04-01', '" + openItemDay + "')")

	exec("INSERT INTO zz_open_items (" + zzOpenItemsColumns + ", settled) VALUES " +
		"('zzrowc1', 'line', 'v1', 'e4', '2026-03-03', 'USD', 900, 0, 'C', 'bill', '9', 9, '2026-04-02', '" + openItemDay + "')")
	requireOneDrift("a row the query does not give", "zzrowc1", "stale")

	inTx("repair", table.repair)
	if drifts := verify(); len(drifts) != 0 {
		t.Fatalf("verify after repair = %+v, want no drift", drifts)
	}
	if rows := stored(); len(rows) != 3 {
		t.Fatalf("repair left %d rows %+v, want 3", len(rows), rows)
	}

	// A refresh of item A inside a transaction: its stored rows are stale (a
	// wrong amount, a wrong settled day), so the refresh reads their pairs,
	// deletes them, inserts the rows the narrowed query gives and settles A.
	exec("UPDATE zz_open_items SET debit = 9999, settled = '2026-01-01' WHERE item = 'A'")
	itemA := dbx.Params{"item": "A"}
	inTx("refresh of item A", func(tx core.App) error {
		return table.refresh(tx, "item = {:item}", itemA, itemPart{query: zzOpenItemsSQL, where: " AND column9 = {:item}"})
	})
	if drifts := verify(); len(drifts) != 0 {
		t.Fatalf("verify after a refresh of item A = %+v, want no drift", drifts)
	}
	rows = stored()
	if len(rows) != len(want) {
		t.Fatalf("the refresh of item A left %d rows %+v, want 3", len(rows), rows)
	}
	for i := range want {
		if rows[i] != want[i] {
			t.Errorf("after the refresh of item A, stored row %d = %+v, want %+v", i, rows[i], want[i])
		}
	}

	err := table.refresh(app, "item = {:item}", itemA)
	const refused = "books: test rows are refreshed only inside the transaction of the write"
	if err == nil || err.Error() != refused {
		t.Fatalf("refresh outside a transaction = %v, want %q", err, refused)
	}
}
