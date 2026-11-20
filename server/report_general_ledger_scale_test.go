package books

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The scale measure of the General Ledger (p5-report-engine-scale): the A/R
// Aging bulk writer's book (report_ar_aging_scale_test.go) with its income
// spread over glIncomeAccounts accounts and its monthly balances stored, and
// the runs of the report with and without an Accounts filter. The book check
// runs in every test run (TestGLScaleBook); the three sizes start only with
// BOOKS_SCALE=1 (TestGLScale).

// glIncomeAccounts is the number of income accounts the book's income lines
// are spread over, so that the report has about as many sections as a real
// chart of accounts.
const glIncomeAccounts = 100

// glScaleSize is the A/R Aging S book scaled to lines journal lines.
func glScaleSize(name string, lines int) arSize {
	f := func(n, least int) int { return max(n*lines/arS.lines, least) }
	return arSize{
		name: name, lines: lines, customers: f(arS.customers, 30), subCustomers: f(arS.subCustomers, 3),
		voidInvoices: f(arS.voidInvoices, 2), closedInvoices: f(arS.closedInvoices, 80), openInvoices: f(arS.openInvoices, 15),
		partPayments: f(arS.partPayments, 3), pairPayments: f(arS.pairPayments, 8), creditPayments: f(arS.creditPayments, 3),
		voidPayments: f(arS.voidPayments, 3), voidPaymentApps: f(arS.voidPaymentApps, 2),
		memos: f(arS.memos, 4), manual: f(arS.manual, 10),
	}
}

// glScaleSizes are the three sizes of the unit: 10,000, 100,000 and 500,000
// journal lines (the last is the A/R Aging L book).
func glScaleSizes() []arSize {
	l := arL
	l.name = "500k"
	return []arSize{glScaleSize("10k", 10000), glScaleSize("100k", 100000), l}
}

// glScaleBook is a written book: its accounts and the day of its runs.
type glScaleBook struct {
	arBook
	lastDay string
	// incomes are the glIncomeAccounts accounts the income lines moved to.
	incomes []*core.Record
	lines   int
}

// writeGLScaleBook writes size's book, moves each income line to one of
// glIncomeAccounts new income accounts (by its row number, so every month of
// every account has lines), and stores the monthly balances as posting does.
// The bulk writer writes no balance rows.
func writeGLScaleBook(t *testing.T, size arSize) glScaleBook {
	t.Helper()
	b := newARBook(t)
	arJournalPrefix(t, b)
	data := writeARDataset(t, b, size)
	book := glScaleBook{arBook: b, lastDay: data.lastDay}
	for i := range glIncomeAccounts {
		book.incomes = append(book.incomes, mkNumberedAccount(t, b.app, fmt.Sprintf("Income %03d", i), fmt.Sprintf("41%02d", i), "income", "service_income"))
	}
	err := b.app.RunInTransaction(func(tx core.App) error {
		for i, a := range book.incomes {
			if _, err := tx.DB().NewQuery("UPDATE books_journal_lines SET account = {:to} WHERE account = {:from} AND rowid % {:n} = {:i}").
				Bind(map[string]any{"to": a.Id, "from": b.income.Id, "n": glIncomeAccounts + 1, "i": i}).Execute(); err != nil {
				return err
			}
		}
		_, err := tx.DB().NewQuery(`INSERT INTO books_account_balances (id, account, period, month_start, debit_total, credit_total, currency, created, updated)
SELECT 'b' || substr(lower(hex(randomblob(8))), 1, 14), account, substr(date, 1, 7), substr(date, 1, 7) || '-01', sum(debit), sum(credit), min(currency), '', ''
FROM books_journal_lines WHERE posted IS true GROUP BY account, substr(date, 1, 7)`).Execute()
		return err
	})
	if err != nil {
		t.Fatalf("spread the income and store the balances: %v", err)
	}
	if err := b.app.DB().NewQuery("SELECT count(*) FROM books_journal_lines").Row(&book.lines); err != nil {
		t.Fatal(err)
	}
	return book
}

// glScaleRun is one run of the report.
type glScaleRun struct {
	name   string
	params map[string]any
	// filtered is a run with an Accounts filter: the unit's 1 s bar is its.
	filtered bool
}

// glScaleRuns are the runs of the measure: the default period (this month to
// date) and the year to date, with no Accounts filter, with one busy account
// (Accounts receivable: a line of every invoice, payment and credit memo),
// with one small account (one of the income accounts) and with three accounts.
func glScaleRuns(b glScaleBook) []glScaleRun {
	month := glPeriod(b.lastDay[:8]+"01", b.lastDay)
	year := glPeriod(b.lastDay[:5]+"01-01", b.lastDay)
	three := []string{b.receivable.Id, b.incomes[0].Id, b.docs.checking.Id}
	return []glScaleRun{
		{name: "1 all accounts, month", params: map[string]any{"period": month}},
		{name: "2 all accounts, year", params: map[string]any{"period": year}},
		{name: "3 busy account, month", params: map[string]any{"period": month, "accounts": []string{b.receivable.Id}}, filtered: true},
		// Rows: All, so the section shows also in a month with no line of it.
		{name: "4 small account, month", params: map[string]any{"period": month, "rows": "all", "accounts": []string{b.incomes[0].Id}}, filtered: true},
		{name: "5 three accounts, year", params: map[string]any{"period": year, "accounts": three}, filtered: true},
	}
}

func (r glScaleRun) exec(t *testing.T, b glScaleBook) (*reports.Result, error) {
	t.Helper()
	return runGLErr(t, b.app, b.reader, r.params, reports.Options{Today: b.lastDay})
}

// glScaleStatements are the distinct SELECTs of r, in order.
func glScaleStatements(t *testing.T, b glScaleBook, r glScaleRun) []string {
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

// glSectionAccounts are the account ids of the sections of res, in order.
func glSectionAccounts(res *reports.Result) []string {
	var out []string
	for _, row := range res.Rows {
		if row.Kind != reports.KindGroup || len(row.GroupKey) == 0 {
			continue
		}
		id, _ := row.GroupKey[0].(string)
		out = append(out, id)
	}
	return out
}

// glExpectedSections are the picked accounts a filtered run must show: all of
// them when the run has rows "all", else those with a posted line dated within
// the run's period (an account with no line in it has no section by design).
func glExpectedSections(t *testing.T, b glScaleBook, r glScaleRun, picked []string) []string {
	t.Helper()
	if r.params["rows"] == "all" {
		return picked
	}
	period, _ := r.params["period"].(map[string]any)
	var out []string
	for _, id := range picked {
		var n int
		err := b.app.DB().NewQuery("SELECT count(*) FROM books_journal_lines WHERE account = {:a} AND posted IS true AND substr(date, 1, 10) >= {:from} AND substr(date, 1, 10) <= {:to}").
			Bind(map[string]any{"a": id, "from": period["from"], "to": period["to"]}).Row(&n)
		if err != nil {
			t.Fatal(err)
		}
		if n > 0 {
			out = append(out, id)
		}
	}
	return out
}

// TestGLScaleBook: the scale book is a ledger posting could have written (its
// stored monthly balances agree with its lines, the income is spread), and a
// run with an Accounts filter shows the picked accounts' sections only.
func TestGLScaleBook(t *testing.T) {
	b := writeGLScaleBook(t, arSmall)
	drifts, err := verifyBalances(b.app)
	if err != nil {
		t.Fatalf("verifyBalances: %v", err)
	}
	if len(drifts) > 0 {
		t.Fatalf("the stored balances differ from the lines in %d rows, first %+v", len(drifts), drifts[0])
	}
	var badIDs int
	if err := b.app.DB().NewQuery("SELECT count(*) FROM books_account_balances WHERE length(id) != 15").Row(&badIDs); err != nil {
		t.Fatal(err)
	}
	if badIDs != 0 {
		t.Fatalf("%d stored balance rows have an id that is not 15 characters", badIDs)
	}
	var moved int
	if err := b.app.DB().NewQuery("SELECT count(DISTINCT account) FROM books_journal_lines WHERE account IN (SELECT id FROM books_accounts WHERE name LIKE 'Income ___')").Row(&moved); err != nil {
		t.Fatal(err)
	}
	if moved < glIncomeAccounts/2 {
		t.Fatalf("income lines are on %d of the %d income accounts, want half or more", moved, glIncomeAccounts)
	}
	for _, run := range glScaleRuns(b) {
		res, err := run.exec(t, b)
		if err != nil {
			t.Fatalf("run %s: %v", run.name, err)
		}
		got := glSectionAccounts(res)
		if len(got) == 0 {
			t.Fatalf("run %s has no section", run.name)
		}
		if !run.filtered {
			continue
		}
		picked, _ := run.params["accounts"].([]string)
		for _, id := range got {
			if !slices.Contains(picked, id) {
				t.Fatalf("run %s shows a section of account %s, which it did not pick (%v)", run.name, id, picked)
			}
		}
		for _, id := range glExpectedSections(t, b, run, picked) {
			if !slices.Contains(got, id) {
				t.Fatalf("run %s shows no section of the picked account %s (sections %v)", run.name, id, got)
			}
		}
	}
}

// TestGLScale measures each run at 10,000, 100,000 and 500,000 journal lines
// (median of 5) and holds the unit's bar: a run with an Accounts filter takes
// 1 s or less at 500,000 lines. A run core refuses (its time limit) is
// recorded as refused; a refused filtered run fails the bar. With
// BOOKS_SCALE_OUT=<dir> it writes gl-results.md (the times) and gl-plans.md
// (each statement of each run at each size: its time, its rows, its plan).
func TestGLScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the General Ledger runs at 10k, 100k and 500k lines")
	}
	const bar = time.Second
	var results, plans strings.Builder
	fmt.Fprintf(&results, "# General Ledger scale results\n\n| lines | run | median of 5 | sections on the page |\n|---|---|---|---|\n")
	for _, size := range glScaleSizes() {
		t.Run(size.name, func(t *testing.T) {
			started := time.Now()
			b := writeGLScaleBook(t, size)
			t.Logf("%s: wrote %d lines in %s", size.name, b.lines, time.Since(started).Round(time.Second))
			last := size.name == "500k"
			for _, run := range glScaleRuns(b) {
				began := time.Now()
				res, err := run.exec(t, b)
				took := time.Since(began)
				if err != nil {
					fmt.Fprintf(&results, "| %d | %s | refused after %s: %v | n/a |\n", b.lines, run.name, took.Round(time.Millisecond), err)
					t.Logf("%s run %s: refused after %s: %v", size.name, run.name, took.Round(time.Millisecond), err)
					if last && run.filtered {
						t.Errorf("run %s at %s lines was refused: %v", run.name, size.name, err)
					}
					continue
				}
				median := arMedian(func() { _, _ = run.exec(t, b) })
				fmt.Fprintf(&results, "| %d | %s | %s | %d |\n", b.lines, run.name, median.Round(time.Millisecond), len(glSectionAccounts(res)))
				t.Logf("%s run %s: median %s", size.name, run.name, median.Round(time.Millisecond))
				if last && run.filtered && median > bar {
					t.Errorf("run %s at %s lines: median %s, want %s or less", run.name, size.name, median, bar)
				}
			}
			// Every size writes its plans, so a run of one size
			// (-run 'TestGLScale$/100k$') records them too.
			for _, run := range glScaleRuns(b) {
				statements := glScaleStatements(t, b, run)
				steps := explainStatements(t, b.app, statements)
				fmt.Fprintf(&plans, "\n## %s lines, run %s\n", size.name, run.name)
				for i, s := range statements {
					if len(s) < 1000 {
						continue
					}
					d, n := arProfileTime(t, b.arBook, s)
					fmt.Fprintf(&plans, "\n### statement %d: %s, %d rows, %d chars\n\n```\n", i, d.Round(100*time.Microsecond), n, len(s))
					for _, step := range steps {
						if step.Statement == i && strings.Contains(step.Detail, "books_journal_lines") {
							fmt.Fprintf(&plans, "%s\n", step.Detail)
						}
					}
					fmt.Fprintf(&plans, "```\n")
				}
			}
		})
		// After each size, so a timeout in a later size keeps the earlier results.
		writeGLScaleOut(t, results.String(), plans.String())
	}
}

// writeGLScaleOut writes gl-results.md and gl-plans.md under BOOKS_SCALE_OUT
// (nothing when it is unset).
func writeGLScaleOut(t *testing.T, results, plans string) {
	t.Helper()
	out := os.Getenv("BOOKS_SCALE_OUT")
	if out == "" {
		return
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatalf("make %s: %v", out, err)
	}
	for name, text := range map[string]string{"gl-results.md": results, "gl-plans.md": plans} {
		if err := os.WriteFile(filepath.Join(out, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
