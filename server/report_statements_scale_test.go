package books

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The scale measure of the Trial Balance, the Balance Sheet and Transaction
// Detail by Account (p5-report-engine-scale): the General Ledger's scale book
// with cash-basis rows (writeStatementsScaleBook) and its bar (glMonthBar,
// glLongRunBar). The book check runs in every test run (TestStatementsScaleBook);
// the three sizes start only with BOOKS_SCALE=1 (TestStatementsScale).
//
// The bars are the human's (2026-11-20), at 500,000 lines: Transaction Detail
// with an Accounts filter 1 s for a month and 2 s for a year; Transaction
// Detail with no Accounts filter 2 s (month and year); a Trial Balance with an
// Accounts filter 1 s; the Trial Balance of all accounts 2 s; the Balance
// Sheet as of, Accrual and Cash, 2 s. How the bar maps:
//   - Transaction Detail has a period and an Accounts filter, as the General
//     Ledger has: the runs with an Accounts filter carry the General Ledger's
//     month and year bars; the two with none are held to the year bar (2 s).
//   - A statement "as of" a day has no period: its figure is the whole history
//     up to that day. A Trial Balance with an Accounts filter is held to the
//     month bar. The Trial Balance of every account and the Balance Sheet (it
//     has no Accounts filter, and it reads two days: the as-of day and the
//     same day a year earlier) are held to the year bar.

// stCashEvery is the share of the book's entries that get cash-basis rows: one
// entry in stCashEvery.
const stCashEvery = 4

// writeStatementsScaleBook is the General Ledger's scale book with cash-basis
// rows, which the bulk writer does not write: for one entry in stCashEvery,
// each of its posted lines taken out again (debit and credit changed over) on
// the line's own day, as the cash basis takes out an unpaid invoice. An
// entry's cash rows add to zero, so a Cash run stays in balance, and a Cash
// run reads about a quarter more rows than an Accrual run. The bulk insert
// does not pass through syncCashLineRows, so the book's stored cash months
// (books_cash_basis_balances) are written here too, as that writer keeps them:
// one row for each account and month with a cash row.
func writeStatementsScaleBook(t *testing.T, size arSize) glScaleBook {
	t.Helper()
	b := writeGLScaleBook(t, size)
	_, err := b.app.DB().NewQuery(`INSERT INTO books_cash_basis_lines (id, document_kind, entry, account, customer, debit, credit, date, posted, memo, currency, position, created, updated)
SELECT 'c' || substr(lower(hex(randomblob(8))), 1, 14), 'invoice', l.entry, l.account, l.customer, l.credit, l.debit, l.date, true, '', l.currency, l.position, '', ''
FROM books_journal_lines l JOIN books_journal_entries e ON e.id = l.entry
WHERE l.posted IS true AND e.rowid % {:n} = 0`).Bind(map[string]any{"n": stCashEvery}).Execute()
	if err != nil {
		t.Fatalf("write the cash-basis rows: %v", err)
	}
	_, err = b.app.DB().NewQuery(`INSERT INTO books_cash_basis_balances (id, account, period, month_start, debit_total, credit_total, currency, created, updated)
SELECT 'm' || substr(lower(hex(randomblob(8))), 1, 14), account, substr(date, 1, 7), substr(date, 1, 7) || '-01', SUM(debit), SUM(credit), MAX(currency), '', ''
FROM books_cash_basis_lines WHERE posted IS true GROUP BY account, substr(date, 1, 7)`).Execute()
	if err != nil {
		t.Fatalf("write the stored cash months: %v", err)
	}
	return b
}

// stScaleRun is one run of one of the three reports.
type stScaleRun struct {
	name    string
	shipped func() reports.Shipped
	params  map[string]any
	// bar is the most the run's median may take at 500,000 lines; 0 for a
	// run with no bar.
	bar time.Duration
}

// stScaleRuns are the runs of the measure, on the day of the book's last line.
func stScaleRuns(b glScaleBook) []stScaleRun {
	month := glPeriod(b.lastDay[:8]+"01", b.lastDay)
	year := glPeriod(b.lastDay[:5]+"01-01", b.lastDay)
	busy := []string{b.receivable.Id}
	three := []string{b.receivable.Id, b.incomes[0].Id, b.docs.checking.Id}
	return []stScaleRun{
		{name: "TB 1 all accounts, as of", shipped: trialBalanceShipped, params: map[string]any{"asOf": b.lastDay}, bar: glLongRunBar},
		{name: "TB 2 busy account, as of", shipped: trialBalanceShipped, params: map[string]any{"asOf": b.lastDay, "accounts": busy}, bar: glMonthBar},
		{name: "TB 3 three accounts, as of", shipped: trialBalanceShipped, params: map[string]any{"asOf": b.lastDay, "accounts": three}, bar: glMonthBar},
		{name: "BS 1 accrual, as of", shipped: balanceSheetShipped, params: map[string]any{"asOf": b.lastDay}, bar: glLongRunBar},
		{name: "BS 2 cash, as of", shipped: balanceSheetShipped, params: map[string]any{"asOf": b.lastDay, "method": "cash"}, bar: glLongRunBar},
		{name: "TD 1 all accounts, month", shipped: transactionDetailShipped, params: map[string]any{"period": month}, bar: glLongRunBar},
		{name: "TD 2 all accounts, year", shipped: transactionDetailShipped, params: map[string]any{"period": year}, bar: glLongRunBar},
		{name: "TD 3 busy account, month", shipped: transactionDetailShipped, params: map[string]any{"period": month, "accounts": busy}, bar: glMonthBar},
		{name: "TD 4 small account, month", shipped: transactionDetailShipped, params: map[string]any{"period": month, "accounts": []string{b.incomes[0].Id}}, bar: glMonthBar},
		{name: "TD 5 three accounts, year", shipped: transactionDetailShipped, params: map[string]any{"period": year, "accounts": three}, bar: glLongRunBar},
		{name: "TD 6 busy account, month, cash", shipped: transactionDetailShipped, params: map[string]any{"period": month, "accounts": busy, "method": "cash"}, bar: glMonthBar},
	}
}

func (r stScaleRun) exec(t *testing.T, b glScaleBook) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(r.shipped().Spec)
	if err != nil {
		t.Fatalf("Load %s: %v", r.name, err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range r.params {
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("param %s: %v", id, err)
		}
		given[id] = raw
	}
	return reports.Run(context.Background(), b.app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: reports.Options{Today: b.lastDay}, Auth: b.reader,
	})
}

// stScaleStatements are the distinct SELECTs of r, in order.
func stScaleStatements(t *testing.T, b glScaleBook, r stScaleRun) []string {
	t.Helper()
	var mu sync.Mutex
	seen := map[string]bool{}
	var out []string
	recordStatements(t, b.app, func(statement string) {
		s := strings.TrimSpace(statement)
		upper := strings.ToUpper(s)
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}, func() { _, _ = r.exec(t, b) })
	return out
}

// stGroupRows counts the group rows of res: the accounts of a Trial Balance,
// the sections of Transaction Detail, the outline rows of a Balance Sheet.
func stGroupRows(res *reports.Result) int {
	n := 0
	for _, row := range res.Rows {
		if row.Kind == reports.KindGroup {
			n++
		}
	}
	return n
}

// stPeriodHasLines is true when r has no period (a run "as of" a day) or the
// book has a posted journal line dated within r's period.
func stPeriodHasLines(t *testing.T, b glScaleBook, r stScaleRun) bool {
	t.Helper()
	period, ok := r.params["period"].(map[string]any)
	if !ok {
		return true
	}
	var n int
	if err := b.app.DB().NewQuery("SELECT count(*) FROM books_journal_lines WHERE posted IS true AND date >= {:from} AND date <= {:to}").
		Bind(map[string]any{"from": period["from"], "to": period["to"]}).Row(&n); err != nil {
		t.Fatal(err)
	}
	return n > 0
}

// TestStatementsScaleBook: the book has cash-basis rows that add to zero, and
// every run of the measure answers on it. A run "as of" a day and a run whose
// period holds a line show group rows (the small book has no line in its last
// month; the sizes of TestStatementsScale have).
func TestStatementsScaleBook(t *testing.T) {
	b := writeStatementsScaleBook(t, arSmall)
	var cashRows, cashNet int64
	if err := b.app.DB().NewQuery("SELECT count(*), COALESCE(sum(debit - credit), 0) FROM books_cash_basis_lines").Row(&cashRows, &cashNet); err != nil {
		t.Fatal(err)
	}
	if cashRows == 0 || cashNet != 0 {
		t.Fatalf("the book has %d cash-basis rows with a net of %d, want some rows and a net of 0", cashRows, cashNet)
	}
	// The stored cash months equal the cash rows, or a Cash Balance Sheet of
	// this book would not be the book's.
	requireCashMonthsEqualRows(t, b.app)
	if drifts, err := verifyCashBalances(b.app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyCashBalances on the scale book = %d drifts, err %v; want none", len(drifts), err)
	}
	results := map[string]*reports.Result{}
	for _, run := range stScaleRuns(b) {
		res, err := run.exec(t, b)
		if err != nil {
			t.Fatalf("run %s: %v", run.name, err)
		}
		results[run.name] = res
		if stPeriodHasLines(t, b, run) && stGroupRows(res) == 0 {
			t.Errorf("run %s has no group row (%d rows)", run.name, len(res.Rows))
		}
	}
	if stSameFigures(results["BS 1 accrual, as of"], results["BS 2 cash, as of"]) {
		t.Error("the cash Balance Sheet has the same figures as the accrual one: a Cash run does not read the cash-basis rows")
	}
}

// stSameFigures is true when a and b hold the same rows with the same cells.
func stSameFigures(a, b *reports.Result) bool {
	if len(a.Rows) != len(b.Rows) {
		return false
	}
	for i := range a.Rows {
		if !reflect.DeepEqual(a.Rows[i].Cells, b.Rows[i].Cells) {
			return false
		}
	}
	return true
}

// TestStatementsScaleBars pins each run's bar, so a change of a bar or of the
// run list is a change of this test (the bar is the human's, 2026-11-20).
func TestStatementsScaleBars(t *testing.T) {
	account := func() *core.Record { return core.NewRecord(core.NewBaseCollection("accounts")) }
	b := glScaleBook{lastDay: "2026-11-20", incomes: []*core.Record{account()}}
	b.receivable = account()
	b.docs = &paymentEnv{ledgerEnv: &ledgerEnv{checking: account()}}
	want := map[string]time.Duration{
		"TB 1 all accounts, as of":       2 * time.Second,
		"TB 2 busy account, as of":       time.Second,
		"TB 3 three accounts, as of":     time.Second,
		"BS 1 accrual, as of":            2 * time.Second,
		"BS 2 cash, as of":               2 * time.Second,
		"TD 1 all accounts, month":       2 * time.Second,
		"TD 2 all accounts, year":        2 * time.Second,
		"TD 3 busy account, month":       time.Second,
		"TD 4 small account, month":      time.Second,
		"TD 5 three accounts, year":      2 * time.Second,
		"TD 6 busy account, month, cash": time.Second,
	}
	// method: "" is absent (accrual); accounts: the filter's size; day: the
	// param that sets the report's day.
	type pins struct {
		method   string
		accounts int
		day      string
	}
	wantParams := map[string]pins{
		"TB 1 all accounts, as of":       {"", 0, "asOf"},
		"TB 2 busy account, as of":       {"", 1, "asOf"},
		"TB 3 three accounts, as of":     {"", 3, "asOf"},
		"BS 1 accrual, as of":            {"", 0, "asOf"},
		"BS 2 cash, as of":               {"cash", 0, "asOf"},
		"TD 1 all accounts, month":       {"", 0, "period"},
		"TD 2 all accounts, year":        {"", 0, "period"},
		"TD 3 busy account, month":       {"", 1, "period"},
		"TD 4 small account, month":      {"", 1, "period"},
		"TD 5 three accounts, year":      {"", 3, "period"},
		"TD 6 busy account, month, cash": {"cash", 1, "period"},
	}
	runs := stScaleRuns(b)
	for _, run := range runs {
		method, _ := run.params["method"].(string)
		accounts, _ := run.params["accounts"].([]string)
		day := "none"
		if _, ok := run.params["asOf"]; ok {
			day = "asOf"
		} else if _, ok := run.params["period"]; ok {
			day = "period"
		}
		if got, wantPins := (pins{method, len(accounts), day}), wantParams[run.name]; got != wantPins {
			t.Errorf("run %q has the params %+v, want %+v", run.name, got, wantPins)
		}
	}
	if len(runs) != len(want) {
		t.Fatalf("the measure has %d runs, want %d", len(runs), len(want))
	}
	for _, run := range runs {
		bar, ok := want[run.name]
		if !ok {
			t.Errorf("run %q has no bar in this test", run.name)
			continue
		}
		if run.bar != bar {
			t.Errorf("run %q has the bar %s, want %s", run.name, run.bar, bar)
		}
	}
}

// TestStatementsScale measures each run at 10,000, 100,000 and 500,000 journal
// lines (median of 5) and holds the bar at 500,000 lines. A run core refuses
// (its time limit) is recorded as refused; a refused run with a bar fails it.
// With BOOKS_SCALE_OUT=<dir> it writes st-results.md (the times) and
// st-plans.md (each long statement of each run at each size: its time, its
// rows, its reads of the line tables).
func TestStatementsScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the Trial Balance, Balance Sheet and Transaction Detail runs at 10k, 100k and 500k lines")
	}
	var results, plans strings.Builder
	fmt.Fprintf(&results, "# Trial Balance, Balance Sheet and Transaction Detail scale results\n\n| lines | run | median of 5 | group rows | rows |\n|---|---|---|---|---|\n")
	for _, size := range glScaleSizes() {
		t.Run(size.name, func(t *testing.T) {
			started := time.Now()
			b := writeStatementsScaleBook(t, size)
			t.Logf("%s: wrote %d lines in %s", size.name, b.lines, time.Since(started).Round(time.Second))
			last := size.name == "500k"
			refused := map[string]bool{}
			for _, run := range stScaleRuns(b) {
				began := time.Now()
				res, err := run.exec(t, b)
				took := time.Since(began)
				if err != nil && !errors.Is(err, reports.ErrTimeout) {
					t.Fatalf("run %s at %s lines: %v", run.name, size.name, err)
				}
				if err != nil {
					refused[run.name] = true
					fmt.Fprintf(&results, "| %d | %s | refused after %s: %v | n/a | n/a |\n", b.lines, run.name, took.Round(time.Millisecond), err)
					t.Logf("%s run %s: refused after %s: %v", size.name, run.name, took.Round(time.Millisecond), err)
					if last && run.bar > 0 {
						t.Errorf("run %s at %s lines was refused: %v", run.name, size.name, err)
					}
					continue
				}
				median := arMedian(func() {
					if _, err := run.exec(t, b); err != nil {
						t.Fatalf("run %s at %s lines, repeated: %v", run.name, size.name, err)
					}
				})
				fmt.Fprintf(&results, "| %d | %s | %s | %d | %d |\n", b.lines, run.name, median.Round(time.Millisecond), stGroupRows(res), len(res.Rows))
				t.Logf("%s run %s: median %s", size.name, run.name, median.Round(time.Millisecond))
				if run.bar > 0 && stGroupRows(res) == 0 {
					t.Errorf("run %s at %s lines has no group row: its time measures nothing", run.name, size.name)
				}
				if last && run.bar > 0 && median > run.bar {
					t.Errorf("run %s at %s lines: median %s, want %s or less", run.name, size.name, median, run.bar)
				}
			}
			// A refused run's statements would each take the time limit
			// again: its plans are read with no time.
			for _, run := range stScaleRuns(b) {
				statements := stScaleStatements(t, b, run)
				steps := explainStatements(t, b.app, statements)
				fmt.Fprintf(&plans, "\n## %s lines, run %s\n", size.name, run.name)
				for i, s := range statements {
					if len(s) < 1000 {
						continue
					}
					if refused[run.name] {
						fmt.Fprintf(&plans, "\n### statement %d: not timed (the run was refused), %d chars\n\n```\n", i, len(s))
					} else {
						d, n := arProfileTime(t, b.arBook, s)
						fmt.Fprintf(&plans, "\n### statement %d: %s, %d rows, %d chars\n\n```\n", i, d.Round(100*time.Microsecond), n, len(s))
					}
					for _, step := range steps {
						if step.Statement == i && (strings.Contains(step.Detail, "books_journal_lines") || strings.Contains(step.Detail, "books_cash_basis_lines") || strings.Contains(step.Detail, "books_account_balances") || scaleOpenGroupStep(step.Detail)) {
							fmt.Fprintf(&plans, "%s\n", step.Detail)
						}
					}
					fmt.Fprintf(&plans, "```\n")
				}
			}
		})
		// After each size, so a timeout in a later size keeps the earlier results.
		writeStatementsScaleOut(t, results.String(), plans.String())
	}
}

// writeStatementsScaleOut writes st-results.md and st-plans.md under
// BOOKS_SCALE_OUT (nothing when it is unset).
func writeStatementsScaleOut(t *testing.T, results, plans string) {
	t.Helper()
	out := os.Getenv("BOOKS_SCALE_OUT")
	if out == "" {
		return
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatalf("make %s: %v", out, err)
	}
	for name, text := range map[string]string{"st-results.md": results, "st-plans.md": plans} {
		if err := os.WriteFile(filepath.Join(out, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// periodRowsRead is true for a step that reads a line table's rows of the
// period: a scan, or a search by the account and the day, which core's cut of
// the rows to the open sections (an IN over gord in each part) lets SQLite
// use. A search by entry is a page row's lookup, not the period's rows.
func periodRowsRead(detail string) bool {
	switch {
	case detail == "SCAN books_journal_lines" || detail == "SCAN books_cash_basis_lines":
		return true
	case strings.HasPrefix(detail, "SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date "):
		return true
	}
	return strings.HasPrefix(detail, "SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_date ")
}

// readsEverySection is true when a step of the statement scans gord or searches
// t1, so that each open section would read the period's rows. The one scan of
// gord that stays is inside a list SQLite builds once (the open keys): a scan
// under a CORRELATED subquery, or outside any list, runs for each row.
func readsEverySection(steps []planStep) bool {
	for _, step := range steps {
		if strings.HasPrefix(step.Detail, "SEARCH t1 ") {
			return true
		}
	}
	for _, step := range stepsRunPerRow(steps) {
		if strings.Contains(step.Detail, "SCAN gord") {
			return true
		}
	}
	return false
}

// TestTransactionDetailReadsItsPeriodRowsOnce: the page statement of a run
// with no Accounts filter reads the period's rows once, and each row finds
// its open section through an index on the open sections. Read the other way
// (the open sections first), every section read every row of the period: a
// section's key is the id of a joined account, which no index on the rows
// holds. The statement reads the period's rows (each line table once) into
// w, and each select that joins the open sections (gord) scans its rows and
// searches gord by the keys: the cut to the sections the page can reach (gcut,
// wl) and the page itself.
func TestTransactionDetailReadsItsPeriodRowsOnce(t *testing.T) {
	b := writeStatementsScaleBook(t, arSmall)
	for _, run := range stScaleRuns(b) {
		if run.name != "TD 2 all accounts, year" {
			continue
		}
		var page []string
		for _, s := range stScaleStatements(t, b, run) {
			if strings.Contains(s, "JOIN gord ON") {
				page = append(page, s)
			}
		}
		if len(page) != 1 {
			t.Fatalf("%d page statements that join the open sections, want 1", len(page))
		}
		var steps []string
		// reads counts the reads of the period's line-table rows (a scan, or a
		// search by account and day: periodRowsRead); searched and
		// scanned are the selects (a step's parent) that search gord by its
		// automatic index and that scan the rows (t1 over the union source, d
		// over computed rows, w over the period's rows read once). The list of
		// open keys that cuts w is built once and left out of these counts
		// (stepsRunPerRow); the must-not-appear guard reads every step.
		reads, searched, scanned := 0, map[int]bool{}, map[int]bool{}
		all := explainStatements(t, b.app, page)
		for _, step := range all {
			if scaleOpenGroupStep(step.Detail) {
				steps = append(steps, step.Detail)
			}
		}
		for _, step := range stepsRunPerRow(all) {
			switch {
			case periodRowsRead(step.Detail):
				reads++
			case strings.HasPrefix(step.Detail, "SEARCH gord USING AUTOMATIC "):
				searched[step.Parent] = true
			case step.Detail == "SCAN t1" || step.Detail == "SCAN d" || step.Detail == "SCAN w":
				scanned[step.Parent] = true
			}
		}
		plan := strings.Join(steps, "\n")
		if readsEverySection(all) {
			t.Fatalf("every open section reads the period's rows:\n%s", plan)
		}
		if reads != 2 {
			t.Fatalf("the period's rows of the line tables are read %d times, want each table once", reads)
		}
		if len(searched) == 0 {
			t.Fatalf("the rows do not find their section by its keys:\n%s", plan)
		}
		for parent := range searched {
			if !scanned[parent] {
				t.Fatalf("a select searches the open sections but does not scan its rows (step %d):\n%s", parent, plan)
			}
		}
		return
	}
	t.Fatal("the measure has no run TD 2 all accounts, year")
}
