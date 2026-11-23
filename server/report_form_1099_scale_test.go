package books

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The performance acceptance of the 1099 Summary and Detail (1099 report spec
// §8, plan D11): the eight runs of the report on the Expenses by Vendor's
// payables book with the 1099 marks of writeForm1099Dataset (writeEBVDataset,
// then one bulk pass: every tenth vendor tracked, half of the expense
// accounts with a box, every fifth bill payment entry a card payment), and a
// check of each SQL statement's query plan against the A/R Aging's plan bars
// with this report's large tables. The plan check, the pass check and the
// small-book agreement run in every test run; the S and L sizes start only
// with BOOKS_SCALE=1 (TestForm1099DatasetPassTimeAtS, TestForm1099Scale). The
// harness is report_scale_harness_test.go.

// form1099LargeTables are the 1099 report's large tables (spec §8).
var form1099LargeTables = []string{"books_journal_lines", "books_cash_basis_lines", "books_journal_entries"}

// f1099StatsFileName is the file in testdata of the L book's statistics
// (written by TestForm1099Scale), which TestForm1099QueryPlans replays.
const f1099StatsFileName = "form_1099_stats.json"

// f1099BalanceTables are the stored month totals. The pass moves lines to
// other accounts and leaves these as they were (plan D11), so no run of the
// report may read them.
var f1099BalanceTables = []string{"books_account_balances", cashBalancesCollection}

// f1099EntriesByKey is a read of books_journal_entries by its primary key.
var f1099EntriesByKey = regexp.MustCompile(`USING (?:COVERING )?INDEX sqlite_autoindex_books_journal_entries_1 \(id=\?\)`)

// f1099WholePeriod is run 1's Period: every day of data.
func f1099WholePeriod(data apDataset) map[string]any { return ebvWholePeriod(data) }

// f1099With is run 1's params with more params on top.
func f1099With(data apDataset, more map[string]any) map[string]any {
	out := map[string]any{"period": f1099WholePeriod(data)}
	for k, v := range more {
		out[k] = v
	}
	return out
}

// f1099BusiestBox is the 1099 vendor and the box ("" for Not reported) with
// the most payment rows of the book (spec §3 What counts): posted ledger lines
// of entries that are not deferred documents and cash-basis rows a payment
// wrote, on Cost of goods sold, Expense and Other expense accounts, of a
// tracked vendor; ties by vendor id, then box. Run 7 opens its box row.
func f1099BusiestBox(t testing.TB, b apBook) (string, string) {
	t.Helper()
	params := dbx.Params{"posted": true, "blank": "", "tracked": true}
	in := func(prefix string, values []string) string {
		names := make([]string, len(values))
		for i, v := range values {
			name := fmt.Sprintf("%s%d", prefix, i)
			params[name] = v
			names[i] = "{:" + name + "}"
		}
		return strings.Join(names, ", ")
	}
	deferred := in("d", deferredDocTypes())
	types := in("t", typesInGroup("expense"))
	var row struct {
		Vendor string `db:"vendor"`
		Box    string `db:"box"`
	}
	err := b.app.DB().NewQuery("SELECT x.vendor AS vendor, a.form_1099_box AS box FROM (" +
		"SELECT l.vendor AS vendor, l.account AS account FROM books_journal_lines l JOIN books_journal_entries e ON e.id = l.entry " +
		"WHERE l.posted = {:posted} AND l.vendor != {:blank} AND e.doc_type NOT IN (" + deferred + ") " +
		"UNION ALL SELECT c.vendor AS vendor, c.account AS account FROM " + cashLinesCollection + " c " +
		"WHERE c.posted = {:posted} AND c.vendor != {:blank} AND c.payment_entry != {:blank}" +
		") x JOIN books_accounts a ON a.id = x.account JOIN books_vendors v ON v.id = x.vendor " +
		"WHERE a.type IN (" + types + ") AND v.track_1099 = {:tracked} " +
		"GROUP BY x.vendor, a.form_1099_box ORDER BY COUNT(*) DESC, x.vendor, a.form_1099_box LIMIT 1").Bind(params).One(&row)
	if err != nil {
		t.Fatalf("read the box row with the most payments: %v", err)
	}
	return row.Vendor, row.Box
}

// f1099BusiestBoxKey is the group key of the busiest box row (f1099BusiestBox)
// in run 2 (Show = All 1099 vendors), as the view sends it when a reader
// presses the row.
func f1099BusiestBoxKey(t *testing.T, b apBook, data apDataset) []any {
	t.Helper()
	vendor, box := f1099BusiestBox(t, b)
	res, err := run1099Err(t, b.app, b.reader, f1099With(data, map[string]any{"show": "tracked"}), reports.Options{Today: data.lastDay})
	if err != nil {
		t.Fatalf("run 2 for the busiest box row: %v", err)
	}
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 2 {
			continue
		}
		own, _ := r.GroupKey[0].(string)
		key, _ := r.GroupKey[1].(string)
		if own == vendor && key == box {
			return r.GroupKey
		}
	}
	t.Fatalf("%s: run 2 has no box row %q of vendor %s; rows %q", data.size.name, box, vendor, bsLabels(res))
	return nil
}

// form1099Runs are the eight runs of spec §8 on data; boxKey is the group key
// of the box row with the most payments (run 7, f1099BusiestBoxKey).
func form1099Runs(b apBook, data apDataset, boxKey []any) []arRun {
	day := reports.Options{Today: data.lastDay}
	tracked := map[string]any{"show": "tracked"}
	return []arRun{
		{name: "1 default", params: f1099With(data, nil), opts: day, wholeBook: true},
		{name: "2 all 1099 vendors", params: f1099With(data, tracked), opts: day, wholeBook: true},
		{name: "3 not tracked", params: f1099With(data, map[string]any{"show": "untracked"}), opts: day, wholeBook: true},
		{name: "4 1099-NEC", params: f1099With(data, map[string]any{"form": "nec"}), opts: day, wholeBook: true},
		{name: "5 largest reportable", params: f1099With(data, map[string]any{"order": "amount"}), opts: day, wholeBook: true},
		{name: "6 five vendors", params: f1099With(data, map[string]any{"show": "tracked", "vendors": data.picked}), opts: day, bound: true},
		{name: "7 box opened", params: f1099With(data, tracked),
			opts:      reports.Options{Today: data.lastDay, Expand: [][]any{boxKey}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		// Run 8 is the CSV export of run 1, so it exports on run 1's day.
		{name: "8 CSV export", params: f1099With(data, nil), opts: day, export: true, wholeBook: true},
	}
}

// f1099Result runs r (not the export) as the Books reader.
func f1099Result(t *testing.T, b apBook, r arRun) *reports.Result {
	t.Helper()
	res, err := run1099Err(t, b.app, b.reader, r.params, r.opts)
	if err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
	return res
}

// f1099ScaleExport is run r's CSV export as the Books reader.
func f1099ScaleExport(t *testing.T, b apBook, r arRun) (string, error) {
	t.Helper()
	return exportShippedCSVErr(t, b.app, form1099Shipped(), form1099Key, r.opts.Today, b.reader, r.params)
}

// f1099ExecErr runs r as the Books reader (run 8: the CSV export). An export
// that fails is a failure, but with mayRefuse (the L book) a refusal with
// exactly ebvExportCap is spec §8's export bar too.
func f1099ExecErr(t *testing.T, b apBook, r arRun, mayRefuse bool) error {
	t.Helper()
	if !r.export {
		_, err := run1099Err(t, b.app, b.reader, r.params, r.opts)
		return err
	}
	_, err := f1099ScaleExport(t, b, r)
	switch {
	case err == nil:
		return nil
	case !mayRefuse:
		return err
	case vbRefusal(err) != ebvExportCap:
		return fmt.Errorf("the export failed with %v, want the CSV or a refusal with exactly %q", err, ebvExportCap)
	}
	return nil
}

// f1099RecordRunErr runs r and returns each distinct SELECT it ran, in order.
// An export is run once first: its first call ships the report on the app.
func f1099RecordRunErr(t *testing.T, b apBook, r arRun, mayRefuse bool) ([]string, error) {
	t.Helper()
	if r.export {
		if err := f1099ExecErr(t, b, r, mayRefuse); err != nil {
			return nil, err
		}
	}
	var runErr error
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
	}, func() { runErr = f1099ExecErr(t, b, r, mayRefuse) })
	return out, runErr
}

// f1099ReadsBalances names the stored month table a statement's plan steps
// read, "" for none. The plan, not the text: a collection lookup names the
// table in a WHERE and reads _collections.
func f1099ReadsBalances(steps []planStep) string {
	for _, table := range f1099BalanceTables {
		if slices.ContainsFunc(steps, func(p planStep) bool { return slices.Contains(p.Tables, table) }) {
			return table
		}
	}
	return ""
}

// f1099SetOf is statements as a set.
func f1099SetOf(statements []string) map[string]bool {
	out := map[string]bool{}
	for _, s := range statements {
		out[s] = true
	}
	return out
}

// f1099AddsTo names, for each run that opens a row (adds), the run whose row
// it opens: run 7 is run 2 with the busiest box row opened (spec §8).
var f1099AddsTo = map[string]string{"7 box opened": "2 all 1099 vendors"}

// f1099BoundIn reports whether statement of run is checked as bound: a bound
// run's statements, and the statements an adds run records that the run it
// adds to (f1099AddsTo) does not. recorded holds each run's statements by run
// name. An adds run with no named base, or a base that is not in runs or
// recorded nothing, has every statement bound, so a wrong name cannot pass a
// whole-book SCAN.
func f1099BoundIn(runs []arRun, run arRun, statement string, recorded map[string]map[string]bool) bool {
	if run.bound {
		return true
	}
	if !run.adds {
		return false
	}
	base := f1099AddsTo[run.name]
	if !slices.ContainsFunc(runs, func(r arRun) bool { return r.name == base }) {
		return true
	}
	return !recorded[base][statement]
}

// f1099CheckRunsInto records each run's statements and checks every plan
// under each reading: the plan bars with form1099LargeTables (the statements
// run 7 records and run 2 does not are bound, f1099BoundIn), books_journal_entries read by
// its primary key only, no read of the stored month totals, and at least one
// SELECT that reads books_journal_lines. With fails, each failure is recorded
// under its run and the next run goes on; with fails nil it fails t. With
// mayRefuse the export may be refused with ebvExportCap (the L book).
func f1099CheckRunsInto(t *testing.T, b apBook, runs []arRun, mayRefuse bool, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep), fails *ebvFailures) {
	t.Helper()
	failRun := func(run, format string, args ...any) {
		t.Helper()
		if fails == nil {
			t.Errorf("run %s: "+format, append([]any{run}, args...)...)
			return
		}
		fails.add(run, format, args...)
	}
	recorded := map[string]map[string]bool{}
	for _, run := range runs {
		statements, err := f1099RecordRunErr(t, b, run, mayRefuse)
		if err != nil {
			if fails == nil {
				t.Fatalf("run %s: %v", run.name, err)
			}
			fails.add(run.name, "%v", err)
			continue
		}
		recorded[run.name] = f1099SetOf(statements)
		for _, reading := range readings {
			var steps []planStep
			if reading.stats == nil && !reading.analyze {
				steps = explainStatements(t, b.app, statements)
			} else {
				steps, _ = explainReading(t, b.app, reading, statements)
			}
			readsLines := false
			for i, s := range statements {
				own := arStepsOf(steps, i)
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, "books_journal_lines") }) {
					readsLines = true
				}
				for _, p := range own {
					if slices.Contains(p.Tables, arEntries) && !f1099EntriesByKey.MatchString(p.Detail) {
						failRun(run.name, "%s: step %q reads books_journal_entries, want only by its primary key\nstatement: %s",
							reading.name, p.Detail, s)
					}
				}
				if table := f1099ReadsBalances(own); table != "" {
					failRun(run.name, "%s: a statement reads %s, which the 1099 pass leaves as it was (plan D11)\nstatement: %s",
						reading.name, table, s)
				}
				r := run
				r.reading = reading.name
				r.bound = f1099BoundIn(runs, run, s, recorded)
				if fails == nil {
					checkPlanBars(t, r, s, own, form1099LargeTables)
					continue
				}
				rec := &arPlanRecorder{TB: t}
				checkPlanBars(rec, r, s, own, form1099LargeTables)
				for _, e := range rec.errs {
					fails.add(run.name, "plan bar: %s", e)
				}
			}
			if !readsLines {
				failRun(run.name, "%s: none of its %d SELECTs reads books_journal_lines: the statement recorder is wired wrong",
					reading.name, len(statements))
			}
			if record != nil {
				record(run, reading, statements, steps)
			}
		}
	}
}

// f1099Count is the number of rows of table.
func f1099Count(t testing.TB, app core.App, table string) int {
	t.Helper()
	var n int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + table).Row(&n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

// f1099ExpenseNet is the sum of debit less credit of table's rows on Cost of
// goods sold, Expense and Other expense accounts.
func f1099ExpenseNet(t testing.TB, app core.App, table string) int64 {
	t.Helper()
	params := dbx.Params{}
	names := []string{}
	for i, ty := range typesInGroup("expense") {
		name := fmt.Sprintf("t%d", i)
		params[name] = ty
		names = append(names, "{:"+name+"}")
	}
	var net int64
	if err := app.DB().NewQuery("SELECT CAST(COALESCE(SUM(x.debit - x.credit), 0) AS INTEGER) FROM " + table +
		" x JOIN books_accounts a ON a.id = x.account WHERE a.type IN (" + strings.Join(names, ", ") + ")").Bind(params).Row(&net); err != nil {
		t.Fatalf("sum the expense rows of %s: %v", table, err)
	}
	return net
}

// f1099ExpenseAccounts are the book's Cost of goods sold, Expense and Other
// expense accounts.
func f1099ExpenseAccounts(t testing.TB, app core.App) []*core.Record {
	t.Helper()
	all, err := app.FindAllRecords("books_accounts")
	if err != nil {
		t.Fatalf("read the accounts: %v", err)
	}
	types := typesInGroup("expense")
	var out []*core.Record
	for _, a := range all {
		if slices.Contains(types, a.GetString("type")) {
			out = append(out, a)
		}
	}
	return out
}

// f1099WithinOne reports whether got is within one of want.
func f1099WithinOne(got int, want float64) bool { return math.Abs(float64(got)-want) <= 1 }

func TestForm1099DatasetPass(t *testing.T) {
	// The same plan without the pass: the plan comes from a fixed seed, so the
	// two books hold the same rows but for the pass.
	before := newAPBook(t)
	beforeData := writeEBVDataset(t, before, apSmall)
	b := newAPBook(t)
	data := writeForm1099Dataset(t, b, apSmall)

	// Every tenth vendor is tracked for 1099.
	vendors, err := b.app.FindRecordsByIds("books_vendors", data.vendors)
	if err != nil || len(vendors) != len(data.vendors) || len(vendors) == 0 {
		t.Fatalf("read the %d vendors of the dataset: %d read, %v", len(data.vendors), len(vendors), err)
	}
	tracked := 0
	for _, v := range vendors {
		if v.GetBool("track_1099") {
			tracked++
		}
	}
	if want := float64(len(vendors)) / 10; !f1099WithinOne(tracked, want) {
		t.Errorf("%d of the %d vendors have track_1099, want 10 %% (%.1f) within one", tracked, len(vendors), want)
	}

	// Half of the expense accounts have a box: NEC 1 and three MISC boxes.
	accounts := f1099ExpenseAccounts(t, b.app)
	boxes := map[string]bool{}
	boxed := 0
	for _, a := range accounts {
		if box := a.GetString("form_1099_box"); box != "" {
			boxed++
			boxes[box] = true
		}
	}
	if !f1099WithinOne(boxed, float64(len(accounts))/2) {
		t.Errorf("%d of the %d expense accounts have a box, want half within one", boxed, len(accounts))
	}
	misc := 0
	for box := range boxes {
		if strings.HasPrefix(box, misc1099Prefix) {
			misc++
		}
	}
	if !boxes["nec_1"] || misc != 3 {
		t.Errorf("the expense accounts have the boxes %v, want NEC 1 and three MISC boxes", slices.Sorted(maps.Keys(boxes)))
	}
	// The lines moved to the boxed accounts: a vendor's lines are on them in
	// both layers, so the runs read boxed rows.
	for _, table := range []string{arLines, cashLinesCollection} {
		var n int
		if err := b.app.DB().NewQuery("SELECT COUNT(*) FROM " + table + " x JOIN books_accounts a ON a.id = x.account " +
			"WHERE a.form_1099_box != {:blank} AND x.vendor != {:blank}").Bind(dbx.Params{"blank": ""}).Row(&n); err != nil {
			t.Fatalf("count the vendor rows of %s on boxed accounts: %v", table, err)
		}
		if n == 0 {
			t.Errorf("%s has no vendor row on an account with a box, want half of the vendors' expense lines moved there", table)
		}
	}

	// Every fifth bill payment entry is a card payment, and no other entry.
	var payments, cards, otherCards int
	q := func(sql string, into *int) {
		t.Helper()
		if err := b.app.DB().NewQuery(sql).Bind(dbx.Params{"kind": apKindPayment, "card": true}).Row(into); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	q("SELECT COUNT(*) FROM books_journal_entries WHERE doc_type = {:kind}", &payments)
	q("SELECT COUNT(*) FROM books_journal_entries WHERE doc_type = {:kind} AND card_payment = {:card}", &cards)
	q("SELECT COUNT(*) FROM books_journal_entries WHERE doc_type != {:kind} AND card_payment = {:card}", &otherCards)
	if want := float64(payments) / 5; payments == 0 || !f1099WithinOne(cards, want) {
		t.Errorf("%d of the %d bill payment entries have card_payment, want 20 %% (%.1f) within one", cards, payments, want)
	}
	if otherCards != 0 {
		t.Errorf("%d entries that are not bill payments have card_payment, want 0", otherCards)
	}
	// Each line and each cash row holds its entry's card mark and doc type
	// after the pass, and both tables hold card rows: a run that reads the
	// copies reads what the entries say.
	requireCopiesMatch(t, b.app, "after the 1099 pass")

	// No row count of the large tables changes, and the expense rows add up
	// to what they did.
	for _, table := range form1099LargeTables {
		if got, want := f1099Count(t, b.app, table), f1099Count(t, before.app, table); got != want {
			t.Errorf("%s: %d rows after the pass, want %d, as before it", table, got, want)
		}
	}
	for _, table := range []string{arLines, cashLinesCollection} {
		if got, want := f1099ExpenseNet(t, b.app, table), f1099ExpenseNet(t, before.app, table); got != want {
			t.Errorf("%s: the expense accounts' debit less credit = %d after the pass, want %d, as before it", table, got, want)
		}
	}

	// The Expenses by Vendor gives the same Total on Accrual and on Cash.
	for _, method := range []string{"accrual", "cash"} {
		params := map[string]any{"period": ebvWholePeriod(data), "method": method}
		got := ebvTotal(t, runEBV(t, b.app, b.reader, params, reports.Options{Today: data.lastDay}))
		want := ebvTotal(t, runEBV(t, before.app, before.reader,
			map[string]any{"period": ebvWholePeriod(beforeData), "method": method}, reports.Options{Today: beforeData.lastDay}))
		if got != want {
			t.Errorf("Expenses by Vendor on %s: the Total = %d after the pass, want %d, as before it", method, got, want)
		}
	}

	// No statement of the eight runs reads the stored month totals, which the
	// pass leaves as they were (plan D11).
	runs := form1099Runs(b, data, f1099BusiestBoxKey(t, b, data))
	if len(runs) != 8 {
		t.Fatalf("form1099Runs gives %d runs, want the 8 of spec §8", len(runs))
	}
	for _, run := range runs {
		statements, err := f1099RecordRunErr(t, b, run, false)
		if err != nil {
			t.Fatalf("run %s: %v", run.name, err)
		}
		if len(statements) == 0 {
			t.Errorf("run %s records no SELECT", run.name)
		}
		steps := explainStatements(t, b.app, statements)
		for i, s := range statements {
			if table := f1099ReadsBalances(arStepsOf(steps, i)); table != "" {
				t.Errorf("run %s reads %s, which the pass leaves as it was\nstatement: %s", run.name, table, s)
			}
		}
	}
}

func TestForm1099DatasetPassTimeAtS(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 times the 1099 pass at S (plan D11)")
	}
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apS)

	type timed struct {
		at        time.Duration
		statement string
	}
	var mu sync.Mutex
	var seen []timed
	started := time.Now()
	recordStatements(t, b.app, func(statement string) {
		mu.Lock()
		defer mu.Unlock()
		seen = append(seen, timed{at: time.Since(started), statement: statement})
	}, func() { writeForm1099Pass(t, b, data) })
	took := time.Since(started)

	// A statement's time is from the end of the one before it to its own end
	// (the log runs when a statement ends). The bulk row writer's inserts are
	// not in the log (it turns the log off for them).
	var last time.Duration
	for i, s := range seen {
		text := strings.Join(strings.Fields(s.statement), " ")
		if len(text) > 240 {
			text = text[:240] + "…"
		}
		t.Logf("pass statement %d: %s: %s", i+1, s.at-last, text)
		last = s.at
	}
	t.Logf("S: the 1099 pass took %s over %d logged statements", took, len(seen))
	if took > 30*time.Second {
		t.Errorf("S: the 1099 pass took %s, want 30s or less (plan D11)", took)
	}
}

func TestForm1099QueryPlans(t *testing.T) {
	b := newAPBook(t)
	data := writeForm1099Dataset(t, b, apSmall)
	runs := form1099Runs(b, data, f1099BusiestBoxKey(t, b, data))

	t.Run("the bars name this report's large tables", func(t *testing.T) {
		whole := arRun{name: "1 default", wholeBook: true, reading: "hand-written"}
		for _, table := range form1099LargeTables {
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, whole, "SELECT 1", []planStep{
				{ID: 2, Detail: "SCAN v", Tables: []string{"books_vendors"}},
				{ID: 3, Detail: "SCAN x", Tables: []string{table}},
			}, form1099LargeTables)
			if len(rec.errs) == 0 {
				t.Errorf("checkPlanBars passes a SCAN of %s inside a loop, want a failure", table)
			}
		}
	})

	// Run 7 opens a box row of run 2: run 2's statements are whole-book reads
	// in run 7 too, and only what run 7 adds is bound. The proof uses a
	// statement that run 2 runs and run 1 does not (the read of the tracked
	// vendors' rows), so a base taken from run 1 fails it.
	t.Run("run 7 is bound only where it adds to run 2", func(t *testing.T) {
		recorded := map[string]map[string]bool{}
		var opened []string
		for _, i := range []int{0, 1, 6} {
			statements, err := f1099RecordRunErr(t, b, runs[i], false)
			if err != nil {
				t.Fatalf("run %s: %v", runs[i].name, err)
			}
			recorded[runs[i].name] = f1099SetOf(statements)
			if i == 6 {
				opened = statements
			}
		}
		first, second, seventh := runs[0].name, runs[1].name, runs[6]
		scan := []planStep{{ID: 2, Detail: "SCAN c", Tables: []string{cashLinesCollection}}}
		barsFail := func(s string) bool {
			r := seventh
			r.reading = "hand-written"
			r.bound = f1099BoundIn(runs, seventh, s, recorded)
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, r, s, scan, form1099LargeTables)
			return len(rec.errs) > 0
		}
		inSecondOnly, added := 0, 0
		for k, s := range opened {
			switch {
			case recorded[second][s]:
				if !recorded[first][s] {
					inSecondOnly++
				}
				if barsFail(s) {
					t.Errorf("run 7, statement %d (run 2 runs it too): an outermost SCAN of %s fails the bars, want it permitted as in run 2",
						k+1, cashLinesCollection)
				}
			default:
				added++
				if !barsFail(s) {
					t.Errorf("run 7, statement %d (the opened box, not in run 2): an outermost SCAN of %s passes the bars, want it refused as bound",
						k+1, cashLinesCollection)
				}
			}
		}
		if inSecondOnly == 0 {
			t.Errorf("run 7 records no statement that run 2 runs and run 1 does not, want the tracked vendors' read; %d statements", len(opened))
		}
		if added == 0 {
			t.Errorf("run 7 records no statement that run 2 does not, want the opened box's read; %d statements", len(opened))
		}
	})

	// The no-statistics reading comes first, so a missing statistics file does
	// not hide its result.
	f1099CheckRunsInto(t, b, runs, false, []arReading{{name: "no statistics"}}, nil, nil)
	t.Run("run 3 reads the copies on the line tables, no entry (no statistics)", func(t *testing.T) {
		f1099CheckRun3Reads(t, b, runs[2], arReading{name: "no statistics"})
	})

	t.Run("L statistics", func(t *testing.T) {
		if _, err := os.Stat(filepath.Join("testdata", f1099StatsFileName)); err != nil {
			t.Skipf("testdata/%s is not there yet (%v): the BOOKS_SCALE run of TestForm1099Scale writes it", f1099StatsFileName, err)
		}
		lStats := arLStatReading(t, "L statistics", f1099StatsFileName)
		if len(lStats.stats) == 0 || len(lStats.stat4) == 0 {
			t.Fatalf("testdata/%s has %d sqlite_stat1 rows and %d sqlite_stat4 rows, want both above 0",
				f1099StatsFileName, len(lStats.stats), len(lStats.stat4))
		}
		if stale := f1099StaleIndexStats(t, b.app, lStats.stats); stale != "" {
			t.Skipf("testdata/%s holds the statistics of an older book (%s): the BOOKS_SCALE run of TestForm1099Scale writes it again", f1099StatsFileName, stale)
		}
		f1099CheckRunsInto(t, b, runs, false, []arReading{lStats}, nil, nil)
		f1099CheckRun3Reads(t, b, runs[2], lStats)
	})
}

// f1099LineIndexes are the covering indexes of the two line tables
// (migration 2100000036), which hold the card mark and the doc type copied
// from the entry (spec §11 Q21 changed, probe 3).
var f1099LineIndexes = map[string]string{
	"books_journal_lines": "idx_books_jlines_account_date_covering",
	cashLinesCollection:   "idx_books_cash_basis_lines_account_date_covering",
}

// f1099StaleIndexStats names a sqlite_stat1 row of stats for a covering index
// of f1099LineIndexes whose column count is not the index's column count in
// the schema (stat holds the row count, then one figure per column): such
// statistics were taken of a book with the older index. "" when every row fits.
func f1099StaleIndexStats(t testing.TB, app core.App, stats []arStat) string {
	t.Helper()
	for _, idx := range f1099LineIndexes {
		var columns int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM pragma_index_info({:idx})").
			Bind(dbx.Params{"idx": idx}).Row(&columns); err != nil {
			t.Fatalf("read the columns of %s: %v", idx, err)
		}
		for _, s := range stats {
			if s.Idx == nil || *s.Idx != idx {
				continue
			}
			if got := len(strings.Fields(s.Stat)) - 1; got != columns {
				return fmt.Sprintf("%s: statistics of %d columns, the index has %d", idx, got, columns)
			}
		}
	}
	return ""
}

// f1099CheckRun3Reads checks run 3 (Show = Not tracked for 1099) under reading
// (spec §11 Q21 changed: the 1,000 ms bar of §8 needs it): no statement of the
// run reads books_journal_entries, because the card mark and the doc type are
// read from the line tables; and the statement that builds w reads
// books_journal_lines and books_cash_basis_lines, each only by USING COVERING
// INDEX, so no line's table row is read (probe 3, phase C).
func f1099CheckRun3Reads(t *testing.T, b apBook, run arRun, reading arReading) {
	t.Helper()
	statements, err := f1099RecordRunErr(t, b, run, false)
	if err != nil {
		t.Fatalf("run %s: %v", run.name, err)
	}
	var steps []planStep
	if reading.stats == nil && !reading.analyze {
		steps = explainStatements(t, b.app, statements)
	} else {
		steps, _ = explainReading(t, b.app, reading, statements)
	}
	builds := 0
	for i, s := range statements {
		own := arStepsOf(steps, i)
		for _, p := range own {
			if slices.Contains(p.Tables, arEntries) {
				t.Errorf("run %s, %s: step %q reads books_journal_entries, want no read of it (the line tables hold the card mark and the doc type)\nstatement: %s",
					run.name, reading.name, p.Detail, s)
			}
		}
		if !strings.Contains(s, "w AS MATERIALIZED (") {
			continue
		}
		builds++
		for _, table := range []string{"books_journal_lines", cashLinesCollection} {
			reads := 0
			for _, p := range own {
				if !slices.Contains(p.Tables, table) {
					continue
				}
				reads++
				if !strings.Contains(p.Detail, "USING COVERING INDEX "+f1099LineIndexes[table]) {
					t.Errorf("run %s, %s: w reads %s by step %q, want only USING COVERING INDEX %s\nstatement: %s",
						run.name, reading.name, table, p.Detail, f1099LineIndexes[table], s)
				}
			}
			if reads == 0 {
				t.Errorf("run %s, %s: the statement that builds w reads no %s, want it read by USING COVERING INDEX %s\nstatement: %s",
					run.name, reading.name, table, f1099LineIndexes[table], s)
			}
		}
	}
	if builds == 0 {
		t.Errorf("run %s, %s: none of its %d SELECTs builds w (\"w AS MATERIALIZED (\"), want one", run.name, reading.name, len(statements))
	}
}

// f1099Figures are a row's Reportable, Excluded (0 for a blank cell) and All
// payments.
type f1099Figures struct{ Reportable, Excluded, All int64 }

func f1099FiguresOf(t *testing.T, r reports.Row) f1099Figures {
	t.Helper()
	exc, _ := moneyCell(t, r, "excluded")
	return f1099Figures{Reportable: amt(t, r, "reportable"), Excluded: exc, All: amt(t, r, "all")}
}

// f1099VendorFigures are a run's vendor rows: vendor id → its figures, and
// the vendor ids in result order. It fails a run that shows one vendor two times or a
// row with no vendor.
func f1099VendorFigures(t *testing.T, what string, res *reports.Result) (map[string]f1099Figures, []string) {
	t.Helper()
	out := map[string]f1099Figures{}
	var order []string
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 1 {
			continue
		}
		vendor, _ := r.GroupKey[0].(string)
		if vendor == "" {
			t.Errorf("%s: a vendor row with no vendor (%q), want none", what, r.Label)
		}
		if _, dup := out[vendor]; dup {
			t.Errorf("%s: two rows for vendor %q", what, vendor)
		}
		out[vendor] = f1099FiguresOf(t, r)
		order = append(order, vendor)
	}
	return out, order
}

// f1099BoxFigures are a run's box rows: "<vendor id>/<box>" → its figures.
func f1099BoxFigures(t *testing.T, res *reports.Result) map[string]f1099Figures {
	t.Helper()
	out := map[string]f1099Figures{}
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 2 {
			continue
		}
		vendor, _ := r.GroupKey[0].(string)
		box, _ := r.GroupKey[1].(string)
		out[vendor+"/"+box] = f1099FiguresOf(t, r)
	}
	return out
}

// f1099SumOf adds the figures of vendors.
func f1099SumOf(figures map[string]f1099Figures, vendors []string) f1099Figures {
	var sum f1099Figures
	for _, v := range vendors {
		f := figures[v]
		sum.Reportable += f.Reportable
		sum.Excluded += f.Excluded
		sum.All += f.All
	}
	return sum
}

// f1099OnePage fails a run that has a second page.
func f1099OnePage(t *testing.T, what string, res *reports.Result) {
	t.Helper()
	if res.Page != nil && res.Page.Next != "" {
		t.Fatalf("%s at the small size has a second page, want every row on the first", what)
	}
}

// f1099CSVTotal is the CSV's Total line: its Reportable and All payments, by
// the headings of the columns.
func f1099CSVTotal(t *testing.T, text string) (int64, int64) {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v", err)
	}
	head := slices.IndexFunc(records, func(r []string) bool { return slices.Contains(r, "Reportable") })
	at := slices.IndexFunc(records, func(r []string) bool { return len(r) >= 2 && r[0] == "Total" })
	if head < 0 || at < 0 {
		t.Fatalf("the CSV has no heading line with Reportable (%d) or no Total line (%d); lines %d", head, at, len(records))
	}
	rep, all := slices.Index(records[head], "Reportable"), slices.Index(records[head], "All payments")
	if all < 0 {
		t.Fatalf("the CSV headings %q have no All payments", records[head])
	}
	return int64(apCSVCents(t, records[at][rep])), int64(apCSVCents(t, records[at][all]))
}

func TestForm1099RunsAgreeWithSmallBook(t *testing.T) {
	b := newAPBook(t)
	data := writeForm1099Dataset(t, b, apSmall)
	boxKey := f1099BusiestBoxKey(t, b, data)
	runs := form1099Runs(b, data, boxKey)
	trackedOf := map[string]bool{}
	vendors, err := b.app.FindRecordsByIds("books_vendors", data.vendors)
	if err != nil {
		t.Fatalf("read the vendors: %v", err)
	}
	for _, v := range vendors {
		trackedOf[v.Id] = v.GetBool("track_1099")
	}

	// Run 2 (All 1099 vendors) is what the other runs are held to.
	all := f1099Result(t, b, runs[1])
	f1099OnePage(t, "run 2", all)
	allVendors, _ := f1099VendorFigures(t, "run 2", all)
	allBoxes := f1099BoxFigures(t, all)
	if len(allVendors) < 2 {
		t.Fatalf("run 2 shows %d 1099 vendors, want two or more", len(allVendors))
	}
	for v := range allVendors {
		if !trackedOf[v] {
			t.Errorf("run 2 (All 1099 vendors) shows vendor %s, which is not tracked", v)
		}
	}

	// Run 3: only untracked vendors.
	untracked := f1099Result(t, b, runs[2])
	f1099OnePage(t, "run 3", untracked)
	untrackedVendors, _ := f1099VendorFigures(t, "run 3", untracked)
	if len(untrackedVendors) == 0 {
		t.Errorf("run 3 (Not tracked for 1099) shows no vendor, want the untracked vendors with payment rows")
	}
	for v := range untrackedVendors {
		if trackedOf[v] {
			t.Errorf("run 3 (Not tracked for 1099) shows vendor %s, which is tracked", v)
		}
	}

	// For each vendor, All payments is the Expenses by Vendor's Total on Cash.
	ebv := ebvTotalsOf(t, "Expenses by Vendor on Cash", runEBV(t, b.app, b.reader,
		map[string]any{"period": f1099WholePeriod(data), "method": "cash"}, reports.Options{Today: data.lastDay}))
	shown := map[string]f1099Figures{}
	for _, m := range []map[string]f1099Figures{allVendors, untrackedVendors} {
		for v, f := range m {
			shown[v] = f
		}
	}
	for v, f := range shown {
		if want := int64(ebv[v]); f.All != want {
			t.Errorf("vendor %s: All payments = %d, want the Expenses by Vendor's Total on Cash %d", v, f.All, want)
		}
	}
	for v, total := range ebv {
		if _, ok := shown[v]; v != "" && total != 0 && !ok {
			t.Errorf("vendor %s has %d in the Expenses by Vendor on Cash and no row in runs 2 and 3", v, total)
		}
	}

	// With a threshold of 0, every 1099 vendor with a Reportable of 0 or more
	// reaches it, so runs 4 and 5 show rows.
	saveSettings(t, b.app, map[string]any{"threshold_1099": 0})

	// Run 4: only NEC 1 box rows, each as run 2 gives it.
	nec := f1099Result(t, b, runs[3])
	necBoxes := f1099BoxFigures(t, nec)
	if len(necBoxes) == 0 {
		t.Errorf("run 4 (1099-NEC) shows no box row, want the NEC 1 rows")
	}
	for key, f := range necBoxes {
		if !strings.HasSuffix(key, "/nec_1") {
			t.Errorf("run 4 (1099-NEC) shows the box row %s, want only NEC 1 rows", key)
			continue
		}
		if want := allBoxes[key]; f != want {
			t.Errorf("run 4: the box row %s = %+v, want run 2's %+v", key, f, want)
		}
	}

	// Run 5: in Reportable order, largest first.
	largest := f1099Result(t, b, runs[4])
	largestVendors, order := f1099VendorFigures(t, "run 5", largest)
	if len(order) < 2 {
		t.Errorf("run 5 shows %d vendors, want two or more to check the order", len(order))
	}
	for i := 1; i < len(order); i++ {
		if prev, cur := largestVendors[order[i-1]].Reportable, largestVendors[order[i]].Reportable; cur > prev {
			t.Errorf("run 5 (Largest reportable): vendor %s (%d) is below vendor %s (%d), want Reportable largest first",
				order[i], cur, order[i-1], prev)
		}
	}

	// Run 1: a threshold at the middle 1099 vendor's Reportable shows exactly
	// the vendors at or above it (at it too), and the Total adds them.
	var reportables []int64
	for _, f := range allVendors {
		reportables = append(reportables, f.Reportable)
	}
	sort.Slice(reportables, func(i, j int) bool { return reportables[i] < reportables[j] })
	threshold := reportables[len(reportables)/2]
	if reportables[0] >= threshold {
		t.Fatalf("the 1099 vendors' Reportable %v leave no vendor below %d, want one to check the threshold", reportables, threshold)
	}
	saveSettings(t, b.app, map[string]any{"threshold_1099": threshold})
	first := f1099Result(t, b, runs[0])
	f1099OnePage(t, "run 1", first)
	firstVendors, firstOrder := f1099VendorFigures(t, "run 1", first)
	want := map[string]f1099Figures{}
	for v, f := range allVendors {
		if f.Reportable >= threshold {
			want[v] = f
		}
	}
	if !reflect.DeepEqual(firstVendors, want) {
		t.Errorf("run 1 (threshold %d) shows %v, want the 1099 vendors at or above it %v", threshold, firstVendors, want)
	}
	if got, sum := f1099FiguresOf(t, totalOf(t, first)), f1099SumOf(firstVendors, firstOrder); got != sum {
		t.Errorf("run 1: the Total row = %+v, want the shown vendors' sum %+v", got, sum)
	}

	// Run 6: only the picked vendors, each as run 2 gives it.
	picked := f1099Result(t, b, runs[5])
	pickedVendors, _ := f1099VendorFigures(t, "run 6", picked)
	if len(pickedVendors) == 0 {
		t.Errorf("run 6 (vendors %v, All 1099 vendors) shows no vendor, want the tracked picked vendors", data.picked)
	}
	for v, f := range pickedVendors {
		if !slices.Contains(data.picked, v) {
			t.Errorf("run 6 shows vendor %s, which is not one of the picked %v", v, data.picked)
			continue
		}
		if f != allVendors[v] {
			t.Errorf("run 6: vendor %s = %+v, want run 2's %+v", v, f, allVendors[v])
		}
	}
	for _, v := range data.picked {
		if _, ok := allVendors[v]; ok {
			if _, shown := pickedVendors[v]; !shown {
				t.Errorf("run 6 has no row for the picked 1099 vendor %s, which run 2 shows", v)
			}
		}
	}

	// Run 7: the opened box's payments add up to its box row.
	opened := f1099Result(t, b, runs[6])
	f1099OnePage(t, "run 7", opened)
	at := slices.IndexFunc(opened.Rows, func(r reports.Row) bool {
		return r.Kind == reports.KindGroup && r.Level == 2 && reflect.DeepEqual(r.GroupKey, boxKey)
	})
	if at < 0 {
		t.Fatalf("run 7 has no box row %v; rows %q", boxKey, bsLabels(opened))
	}
	boxRow := opened.Rows[at]
	under := ebvLinesUnder(t, opened, boxRow)
	if len(under) < 2 {
		t.Errorf("run 7 opens the box row %v into %d payment rows, want two or more", boxKey, len(under))
	}
	var sum f1099Figures
	for _, r := range under {
		f := f1099FiguresOf(t, r)
		sum.Reportable += f.Reportable
		sum.Excluded += f.Excluded
		sum.All += f.All
	}
	if got := f1099FiguresOf(t, boxRow); got != sum {
		t.Errorf("run 7: the box row %v = %+v, want its payments' sum %+v", boxKey, got, sum)
	}

	// Run 8: the CSV's Total line is run 1's Total.
	text, err := f1099ScaleExport(t, b, runs[7])
	if err != nil {
		t.Fatalf("run 8 (CSV): %v", err)
	}
	total := f1099FiguresOf(t, totalOf(t, first))
	if rep, all := f1099CSVTotal(t, text); rep != total.Reportable || all != total.All {
		t.Errorf("run 8 (CSV): the Total line's Reportable, All payments = %d, %d, want run 1's %d, %d",
			rep, all, total.Reportable, total.All)
	}
}

// f1099ExportOutcome is what run r's CSV export gave, in words for the Runs
// table: the CSV and its rows under the headings, core's refusal, or the
// failure.
func f1099ExportOutcome(t *testing.T, b apBook, r arRun) string {
	t.Helper()
	text, err := f1099ScaleExport(t, b, r)
	if err != nil {
		if refusal := vbRefusal(err); refusal != "" {
			return fmt.Sprintf("refused: %q", refusal)
		}
		return fmt.Sprintf("failed: %v", err)
	}
	return fmt.Sprintf("gave the CSV, %d rows", f1099CSVRows(t, text))
}

// f1099CSVRows is the number of CSV lines under the heading line.
func f1099CSVRows(t *testing.T, text string) int {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v", err)
	}
	head := slices.IndexFunc(records, func(r []string) bool { return slices.Contains(r, "Reportable") })
	if head < 0 {
		t.Fatalf("the CSV has no heading line with Reportable; lines %d", len(records))
	}
	return len(records) - head - 1
}

// f1099RunsTable is the Runs table of report-1099-perf-results.md: the
// Expenses by Vendor's table (ebvRunsTable), with the export run's row stating
// exportAtL, what the export gave at L (f1099ExportOutcome).
// The Result is ebvRunsTable's; the export bar at L takes the CSV or core's
// refusal (spec §8), and an export that gave neither is a recorded failure.
func f1099RunsTable(names []string, export map[string]bool, statements map[string]int, medians map[string]map[string]time.Duration, failures map[string][]string, exportAtL string) string {
	lines := strings.Split(ebvRunsTable(names, export, statements, medians, failures), "\n")
	for _, name := range names {
		if !export[name] {
			continue
		}
		prefix := fmt.Sprintf("| %s |", name)
		at := slices.IndexFunc(lines, func(l string) bool { return strings.HasPrefix(l, prefix) })
		if at < 0 {
			continue
		}
		cells := strings.Split(lines[at], " | ")
		result := strings.TrimSuffix(cells[len(cells)-1], " |")
		bar := apBar(true)
		lines[at] = fmt.Sprintf("| %s | %d | %s | %s (%s) | n/a | %s at S, Total = run 1's; at L the CSV or core's refusal %q, %s | %s |",
			name, statements[name], medians[apS.name][name], medians[apL.name][name], exportAtL, bar, ebvExportCap, bar, result)
	}
	return strings.Join(lines, "\n")
}

// writeF1099Stats runs a real ANALYZE of the book (rolled back) and writes the
// sqlite_stat1 and sqlite_stat4 rows it wrote to dir/f1099StatsFileName as an
// arStatsFile, the shape arLStatReading reads.
func writeF1099Stats(t testing.TB, app core.App, dir string) arStatsFile {
	t.Helper()
	_, stat1, stat4 := explainReadingStats(t, app, arReading{name: "after ANALYZE", analyze: true}, nil)
	file := arStatsFile{Stat1: stat1, Stat4: stat4}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatalf("encode the statistics: %v", err)
	}
	path := filepath.Join(dir, f1099StatsFileName)
	if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return file
}

func TestForm1099Scale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the S and L runs of spec §8")
	}
	type planRec struct {
		run, reading string
		statements   []string
		steps        []planStep
	}
	medians := map[string]map[string]time.Duration{}
	written := map[string]time.Duration{}
	var plans []planRec
	var runNames []string
	statementCount := map[string]int{}
	exportRun := map[string]bool{}
	exportAtL := "not run"
	fails := newEBVFailures(nil)

	for _, size := range []apSize{apS, apL} {
		t.Run(size.name, func(t *testing.T) {
			fails.report = t.Errorf
			b := newAPBook(t)
			started := time.Now()
			data := writeForm1099Dataset(t, b, size)
			written[size.name] = time.Since(started)
			t.Logf("%s: wrote the dataset with the 1099 pass in %s", size.name, written[size.name])

			isL := size.name == apL.name
			runs := form1099Runs(b, data, f1099BusiestBoxKey(t, b, data))
			medians[size.name] = map[string]time.Duration{}
			runNames = nil
			for _, run := range runs {
				runNames = append(runNames, run.name)
				exportRun[run.name] = run.export
				var first error
				median := arMedian(func() {
					if err := f1099ExecErr(t, b, run, isL); err != nil && first == nil {
						first = err
					}
				})
				if first != nil {
					fails.add(run.name, "at %s: %v", size.name, first)
				}
				medians[size.name][run.name] = median
				t.Logf("%s run %s: median %s", size.name, run.name, median)
				if isL && run.export {
					// The export bar takes the CSV or core's refusal: record which.
					exportAtL = f1099ExportOutcome(t, b, run)
					t.Logf("L run %s: %s", run.name, exportAtL)
				}
			}
			if !isL {
				// Run 8 at S: the CSV, its Total line run 1's, within the export bar.
				export := runs[7]
				text, err := f1099ScaleExport(t, b, export)
				if err != nil {
					fails.add(export.name, "at S: %v", err)
				} else if res, err := run1099Err(t, b.app, b.reader, runs[0].params, runs[0].opts); err != nil {
					fails.add(export.name, "at S: run %s for the Total: %v", runs[0].name, err)
				} else {
					total := f1099FiguresOf(t, totalOf(t, res))
					if rep, all := f1099CSVTotal(t, text); rep != total.Reportable || all != total.All {
						fails.add(export.name, "at S: the CSV's Total line = %d, %d, want run 1's %d, %d", rep, all, total.Reportable, total.All)
					}
				}
				if bar := apBar(true); medians[size.name][export.name] > bar {
					fails.add(export.name, "at S: median %s, want %s or less", medians[size.name][export.name], bar)
				}
			}
			readings := []arReading{{name: "no statistics"}, {name: "after ANALYZE", analyze: true}}
			f1099CheckRunsInto(t, b, runs, isL, readings, func(run arRun, reading arReading, statements []string, steps []planStep) {
				statementCount[run.name] = len(statements)
				if isL {
					plans = append(plans, planRec{run: run.name, reading: reading.name, statements: statements, steps: steps})
				}
			}, fails)
			if !isL {
				return
			}
			writeF1099Stats(t, b.app, "testdata")
			ebvCheckLMedians(runNames, exportRun, medians, fails)
		})
	}

	out := os.Getenv("BOOKS_SCALE_OUT")
	if out == "" {
		return
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatalf("make %s: %v", out, err)
	}
	commit := "unknown"
	if raw, err := exec.Command("git", "rev-parse", "HEAD").Output(); err == nil {
		commit = strings.TrimSpace(string(raw))
	}
	var res strings.Builder
	fmt.Fprintf(&res, "# 1099 Summary and Detail performance results\n\n")
	fmt.Fprintf(&res, "- Machine: %s/%s, %d CPUs, %s\n- Date: %s\n- Commit: %s\n\n",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), time.Now().Format(time.DateTime), commit)
	fmt.Fprintf(&res, "| dataset write with the 1099 pass | S %s | L %s |\n|---|---|---|\n", written[apS.name], written[apL.name])
	fmt.Fprintf(&res, "\n## Runs\n\n")
	res.WriteString(f1099RunsTable(runNames, exportRun, statementCount, medians, fails.byRun, exportAtL))
	fmt.Fprintf(&res, "\n## Statements (L)\n\n")
	var plansText strings.Builder
	fmt.Fprintf(&plansText, "# 1099 Summary and Detail query plans (L)\n")
	for i := 0; i+1 < len(plans); i += 2 {
		before, after := plans[i], plans[i+1]
		for k, s := range before.statements {
			fmt.Fprintf(&res, "- run %s, statement %d: before ANALYZE: %s; after ANALYZE: %s\n",
				before.run, k+1, arReads(arStepsOf(before.steps, k)), arReads(arStepsOf(after.steps, k)))
			fmt.Fprintf(&plansText, "\n## Run %s, statement %d\n\n```sql\n%s\n```\n\n%s:\n\n```\n%s```\n\n%s:\n\n```\n%s```\n",
				before.run, k+1, s, before.reading, arPlanText(arStepsOf(before.steps, k)), after.reading, arPlanText(arStepsOf(after.steps, k)))
		}
	}
	for name, body := range map[string][]byte{
		"report-1099-perf-results.md": []byte(res.String()),
		"report-1099-perf-plans.md":   []byte(plansText.String()),
	} {
		if err := os.WriteFile(filepath.Join(out, name), body, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}

// TestForm1099ScaleRunsTableStatesExportOutcome runs, on apSmall, the parts of
// TestForm1099Scale's results file that run without BOOKS_SCALE: the export
// row of the Runs table states what the export gave at L (the CSV and its row
// count, or core's refusal), not a refusal whatever the export did.
func TestForm1099ScaleRunsTableStatesExportOutcome(t *testing.T) {
	b := newAPBook(t)
	data := writeForm1099Dataset(t, b, apSmall)
	runs := form1099Runs(b, data, f1099BusiestBoxKey(t, b, data))
	export := runs[7]
	if !export.export {
		t.Fatalf("run %s is not the export run", export.name)
	}

	// The small book's export gives the CSV, and the outcome names its rows.
	text, err := f1099ScaleExport(t, b, export)
	if err != nil {
		t.Fatalf("run %s: %v", export.name, err)
	}
	gave := f1099ExportOutcome(t, b, export)
	if want := fmt.Sprintf("gave the CSV, %d rows", f1099CSVRows(t, text)); gave != want || f1099CSVRows(t, text) == 0 {
		t.Fatalf("run %s outcome %q, want %q with one or more rows", export.name, gave, want)
	}

	var names []string
	exportRun := map[string]bool{}
	statements := map[string]int{}
	medians := map[string]map[string]time.Duration{apS.name: {}, apL.name: {}}
	for _, run := range runs {
		names = append(names, run.name)
		exportRun[run.name] = run.export
		statements[run.name] = 1
		medians[apS.name][run.name] = time.Millisecond
		medians[apL.name][run.name] = time.Millisecond
	}
	row := func(table, name string) string {
		t.Helper()
		for line := range strings.SplitSeq(table, "\n") {
			cells := strings.Split(strings.Trim(strings.TrimSpace(line), "|"), "|")
			if len(cells) >= 2 && strings.TrimSpace(cells[0]) == name {
				return line
			}
		}
		t.Fatalf("the Runs table has no row for run %s:\n%s", name, table)
		return ""
	}
	refused := fmt.Sprintf("refused: %q", ebvExportCap)
	for _, c := range []struct{ outcome, not string }{{gave, "refused"}, {refused, "gave the CSV"}} {
		line := row(f1099RunsTable(names, exportRun, statements, medians, map[string][]string{}, c.outcome), export.name)
		if !strings.Contains(line, c.outcome) || strings.Contains(line, c.not) {
			t.Errorf("run %s at L %s: the Runs row is %q, want it to state %q and not %q", export.name, c.outcome, line, c.outcome, c.not)
		}
	}
}
