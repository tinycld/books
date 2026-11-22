package books

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
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

// The performance acceptance of the Expenses by Vendor (spec §8): the eight
// runs of the report on the A/P Aging's payables book with its cash-basis rows
// (writeEBVDataset: writeAPDataset, then a bulk pass that writes the
// books_cash_basis_lines rows posting writes, then rebuildCashBalances for the
// stored cash months; never rebuildCashBasis, plan decision D7), and a check of each SQL statement's query plan against the
// A/R Aging's plan bars with this report's large tables. The plan check runs
// at a small size in every test run (TestExpensesByVendorQueryPlans); the S
// and L sizes start only with BOOKS_SCALE=1 (TestExpensesByVendorScale). The
// harness is report_scale_harness_test.go.

// ebvLargeTables are the Expenses by Vendor's large tables (spec §8).
var ebvLargeTables = []string{"books_journal_lines", "books_cash_basis_lines", "books_journal_entries"}

// ebvExportCap is core's refusal of a CSV export past its 50,000-row cap
// (spec §8, "Run 8 and core's export cap").
const ebvExportCap = "This report has more than 50,000 rows. Narrow the period."

// ebvBusiestVendor is the vendor with the most posted lines on the book's
// expense account (run 7 opens it), ties by id.
func ebvBusiestVendor(t testing.TB, b apBook) string {
	t.Helper()
	var vendor string
	err := b.app.DB().NewQuery("SELECT vendor FROM books_journal_lines WHERE account = {:expense} AND posted = {:posted} AND vendor != {:blank} " +
		"GROUP BY vendor ORDER BY COUNT(*) DESC, vendor LIMIT 1").Bind(dbx.Params{"expense": b.expense.Id, "posted": true, "blank": ""}).Row(&vendor)
	if err != nil {
		t.Fatalf("read the busiest vendor: %v", err)
	}
	return vendor
}

// ebvWholePeriod is run 1's Period: every day of data.
func ebvWholePeriod(data apDataset) map[string]any { return ebvPeriod(data.firstDay, data.lastDay) }

// ebvMidPeriod is run 2's Period: the month before data.midDay's month, that
// month and the month after.
func ebvMidPeriod(data apDataset) map[string]any {
	mid, err := time.Parse(time.DateOnly, data.midDay)
	if err != nil {
		panic(fmt.Sprintf("data.midDay %q is no ISO day", data.midDay))
	}
	month := time.Date(mid.Year(), mid.Month(), 1, 0, 0, 0, 0, time.UTC)
	return ebvPeriod(month.AddDate(0, -1, 0).Format(time.DateOnly), month.AddDate(0, 2, -1).Format(time.DateOnly))
}

// ebvWith is run 1's params with more params on top.
func ebvWith(data apDataset, more map[string]any) map[string]any {
	out := map[string]any{"period": ebvWholePeriod(data)}
	for k, v := range more {
		out[k] = v
	}
	return out
}

// ebvVendorKeyOf is the group key of vendor's row in run 1, as the view sends
// it when a reader opens the row.
func ebvVendorKeyOf(t *testing.T, b apBook, data apDataset, vendor string) []any {
	t.Helper()
	res := runEBV(t, b.app, b.reader, ebvWith(data, nil), reports.Options{Today: data.lastDay})
	row, ok := cbGroupRow(res, 1, vendor)
	if !ok {
		t.Fatalf("%s: run 1 has no row for the busiest vendor %s; rows %q", data.size.name, vendor, bsLabels(res))
	}
	return row.GroupKey
}

// ebvRuns are the eight runs of spec §8 on data; vendorKey is the busiest
// vendor's group key (run 7).
func ebvRuns(b apBook, data apDataset, vendorKey []any) []arRun {
	day := reports.Options{Today: data.lastDay}
	return []arRun{
		{name: "1 default", params: ebvWith(data, nil), opts: day, wholeBook: true},
		{name: "2 middle months", params: map[string]any{"period": ebvMidPeriod(data)}, opts: day, wholeBook: true},
		{name: "3 cash", params: ebvWith(data, map[string]any{"method": "cash"}), opts: day, wholeBook: true},
		{name: "4 largest expenses", params: ebvWith(data, map[string]any{"order": "amount"}), opts: day, wholeBook: true},
		{name: "5 with activity", params: ebvWith(data, map[string]any{"rows": "activity"}), opts: day, wholeBook: true},
		{name: "6 five vendors", params: ebvWith(data, map[string]any{"vendors": data.picked}), opts: day, bound: true},
		{name: "7 vendor opened", params: ebvWith(data, nil),
			opts:      reports.Options{Today: data.lastDay, Expand: [][]any{vendorKey}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		// Run 8 is the CSV export of run 1, so it exports on run 1's day.
		{name: "8 CSV export", params: ebvWith(data, nil), opts: day, export: true, wholeBook: true},
	}
}

// ebvResult runs r (not the export) as the Books reader.
func ebvResult(t *testing.T, b apBook, r arRun) *reports.Result {
	t.Helper()
	res, err := runEBVErr(t, b.app, b.reader, r.params, r.opts)
	if err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
	return res
}

// ebvExport is run r's CSV export as the Books reader.
func ebvExport(t *testing.T, b apBook, r arRun) (string, error) {
	t.Helper()
	return exportShippedCSVErr(t, b.app, expensesByVendorShipped(), expensesByVendorKey, r.opts.Today, b.reader, r.params)
}

// ebvExec runs r as the Books reader (run 8: the CSV export). With refused, an
// export must be refused with exactly ebvExportCap (the L book is far past the
// cap); without it, an export must succeed. Anything else ends the test.
func ebvExec(t *testing.T, b apBook, r arRun, refused bool) {
	t.Helper()
	if err := ebvExecErr(t, b, r, refused); err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
}

// ebvExecErr is ebvExec that returns the run's failure (a run error, an export
// that fails, or one refused with another status or message) in place of
// ending the test.
func ebvExecErr(t *testing.T, b apBook, r arRun, refused bool) error {
	t.Helper()
	if !r.export {
		_, err := runEBVErr(t, b.app, b.reader, r.params, r.opts)
		return err
	}
	_, err := ebvExport(t, b, r)
	switch {
	case !refused && err != nil:
		return err
	case refused && err == nil:
		return fmt.Errorf("the export succeeded, want it refused with %q", ebvExportCap)
	case refused && vbRefusal(err) != ebvExportCap:
		return fmt.Errorf("the export failed with %v, want it refused with exactly %q", err, ebvExportCap)
	}
	return nil
}

// ebvFailures keeps the failures each run recorded, by run name (plan D11
// item 4), for ebvRunsTable. report, when set, reports each one as it is
// added (TestExpensesByVendorScale gives t.Errorf, so the test still fails).
type ebvFailures struct {
	report func(format string, args ...any)
	byRun  map[string][]string
}

func newEBVFailures(report func(format string, args ...any)) *ebvFailures {
	return &ebvFailures{report: report, byRun: map[string][]string{}}
}

func (f *ebvFailures) add(run, format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	f.byRun[run] = append(f.byRun[run], msg)
	if f.report != nil {
		f.report("run %s: %s", run, msg)
	}
}

// ebvTimeRun is the median of r (arMedian). A call that fails is recorded for
// r once, with its first failure, and the timing goes on.
func ebvTimeRun(t *testing.T, b apBook, r arRun, refused bool, size string, fails *ebvFailures) time.Duration {
	t.Helper()
	var first error
	median := arMedian(func() {
		if err := ebvExecErr(t, b, r, refused); err != nil && first == nil {
			first = err
		}
	})
	if first != nil {
		fails.add(r.name, "at %s: %v", size, first)
	}
	return median
}

// recordEBVRun runs r and returns each distinct SELECT it ran, in order. An
// export is run once first: its first call ships the report on the app.
func recordEBVRun(t *testing.T, b apBook, r arRun, refused bool) []string {
	t.Helper()
	statements, err := recordEBVRunErr(t, b, r, refused)
	if err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
	return statements
}

// recordEBVRunErr is recordEBVRun that returns the run's failure in place of
// ending the test.
func recordEBVRunErr(t *testing.T, b apBook, r arRun, refused bool) ([]string, error) {
	t.Helper()
	if r.export {
		if err := ebvExecErr(t, b, r, refused); err != nil {
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
	}, func() { runErr = ebvExecErr(t, b, r, refused) })
	return out, runErr
}

// ebvCashRun is the run that must read books_cash_basis_lines (Method = Cash).
const ebvCashRun = "3 cash"

// ebvCheckRuns records each run's statements and checks every plan under each
// reading against the bars with ebvLargeTables. The statements that run 7
// records and run 1 does not are bound. It fails a run that records no SELECT
// reading books_journal_lines, and run 3 when it records none reading
// books_cash_basis_lines. With refused, the export run must be refused (the L
// book).
func ebvCheckRuns(t *testing.T, b apBook, runs []arRun, refused bool, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat)) {
	t.Helper()
	ebvCheckRunsInto(t, b, runs, refused, readings, record, nil)
}

// ebvCheckRunsInto is ebvCheckRuns that, with fails, records each failure (a
// run error, a refusal with another status or message, a plan bar) under its
// run and goes on with the next run; with fails nil it fails t as
// ebvCheckRuns does.
func ebvCheckRunsInto(t *testing.T, b apBook, runs []arRun, refused bool, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat), fails *ebvFailures) {
	t.Helper()
	failRun := func(run, format string, args ...any) {
		t.Helper()
		if fails == nil {
			t.Errorf("run %s: "+format, append([]any{run}, args...)...)
			return
		}
		fails.add(run, format, args...)
	}
	base := map[string]bool{}
	for _, run := range runs {
		statements, err := recordEBVRunErr(t, b, run, refused)
		if err != nil {
			if fails == nil {
				t.Fatalf("run %s: %v", run.name, err)
			}
			fails.add(run.name, "%v", err)
			continue
		}
		if run.name == runs[0].name {
			for _, s := range statements {
				base[s] = true
			}
		}
		for _, reading := range readings {
			var steps []planStep
			var stats []arStat
			if reading.stats == nil && !reading.analyze {
				steps = explainStatements(t, b.app, statements)
			} else {
				steps, stats = explainReading(t, b.app, reading, statements)
			}
			readsLines, readsCash := false, false
			for i, s := range statements {
				own := arStepsOf(steps, i)
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, "books_journal_lines") }) {
					readsLines = true
				}
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, cashLinesCollection) }) {
					readsCash = true
				}
				r := run
				r.reading = reading.name
				r.bound = run.bound || (run.adds && !base[s])
				if fails == nil {
					checkPlanBars(t, r, s, own, ebvLargeTables)
					continue
				}
				rec := &arPlanRecorder{TB: t}
				checkPlanBars(rec, r, s, own, ebvLargeTables)
				for _, e := range rec.errs {
					fails.add(run.name, "plan bar: %s", e)
				}
			}
			if !readsLines {
				failRun(run.name, "%s: none of its %d SELECTs reads books_journal_lines: the statement recorder is wired wrong",
					reading.name, len(statements))
			}
			if run.name == ebvCashRun && !readsCash {
				failRun(run.name, "%s: none of its %d SELECTs reads books_cash_basis_lines: the Cash run reads no cash-basis rows",
					reading.name, len(statements))
			}
			if record != nil {
				record(run, reading, statements, steps, stats)
			}
		}
	}
}

// ebvPostedReversal is the void reversal entry of entry in a posters' book.
func ebvPostedReversal(t *testing.T, app core.App, entry string) string {
	t.Helper()
	var id string
	if err := app.DB().Select("id").From("books_journal_entries").Where(dbx.HashExp{"reverses": entry}).Row(&id); err != nil {
		t.Fatalf("read the void reversal of entry %s: %v", entry, err)
	}
	return id
}

// ebvCashRowKeys are the books_cash_basis_lines rows whose entry is in
// entries (after mapping), each as its columns (id, created and updated left
// out) with ids mapped by idMap and document numbers in the memo by numbers,
// sorted.
func ebvCashRowKeys(t *testing.T, app core.App, entries map[string]bool, idMap, numbers map[string]string) []string {
	t.Helper()
	var ids []string
	if err := app.DB().Select("id").From(cashLinesCollection).OrderBy("id").Column(&ids); err != nil {
		t.Fatalf("read the cash-basis rows: %v", err)
	}
	ignored := map[string]bool{"id": true, "created": true, "updated": true}
	var out []string
	for _, id := range ids {
		row := arRawRow(t, app, cashLinesCollection, id)
		if !entries[arMapped(row["entry"].String, idMap)] {
			continue
		}
		if memo := row["memo"]; memo.Valid {
			for from, to := range numbers {
				memo.String = strings.ReplaceAll(memo.String, " "+from+" ", " "+to+" ")
			}
			row["memo"] = sql.NullString{String: memo.String, Valid: true}
		}
		cols := make([]string, 0, len(row))
		for col := range row {
			if !ignored[col] {
				cols = append(cols, col)
			}
		}
		sort.Strings(cols)
		parts := make([]string, len(cols))
		for i, col := range cols {
			parts[i] = col + "=" + arNormal(row, col, idMap)
		}
		out = append(out, strings.Join(parts, " "))
	}
	sort.Strings(out)
	return out
}

func TestExpensesByVendorBulkCashRowsMatchPosters(t *testing.T) {
	// The posters' book.
	pb := newAPBook(t)
	admin := pb.users.admin.Id
	v := apVendor(t, pb, "Mirror Supply")
	bill := apBill(t, pb, v, "2026-08-04", "2026-09-03", 100000)
	pay := apPayBills(t, pb, v, "2026-09-10", map[string]int{bill.Id: 30000})
	credit := apVendorCredit(t, pb, v, "2026-10-01", 50000)
	application := apApply(t, pb, credit, bill, "2026-10-05", 20000)
	refund := apRefund(t, pb, v, "2026-10-09", map[string]int{credit.Id: 5000})
	voided := apBill(t, pb, v, "2026-08-20", "2026-09-19", 40000)
	if err := voidBillAs(pb.app, voided.Id, admin); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	voidPay := apPayBills(t, pb, v, "2026-09-20", map[string]int{bill.Id: 10000})
	if err := voidBillPaymentAs(pb.app, voidPay.Id, admin); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}

	// The bulk writer's book with the same plan, a second app.
	bb := newAPBook(t)
	bv := apVendor(t, bb, "Mirror Supply")
	actor, voider := bb.users.bookkeeper.Id, bb.users.admin.Id
	data := writeEBVDataset(t, bb, apSize{name: "mirror", plan: []apDoc{
		{kind: apKindBill, vendor: bv.Id, date: "2026-08-04", due: "2026-09-03", cents: 100000, actor: actor},
		{kind: apKindPayment, vendor: bv.Id, date: "2026-09-10", parts: []apPart{{doc: 0, cents: 30000}}, actor: actor},
		{kind: apKindCredit, vendor: bv.Id, date: "2026-10-01", cents: 50000, actor: actor},
		{kind: apKindApplication, vendor: bv.Id, date: "2026-10-05", cents: 20000, bill: 0, credit: 2, actor: actor},
		{kind: apKindRefund, vendor: bv.Id, date: "2026-10-09", parts: []apPart{{doc: 2, cents: 5000}}, actor: actor},
		{kind: apKindBill, vendor: bv.Id, date: "2026-08-20", due: "2026-09-19", cents: 40000, actor: actor, void: true, voider: voider},
		{kind: apKindPayment, vendor: bv.Id, date: "2026-09-20", parts: []apPart{{doc: 0, cents: 10000}}, actor: actor,
			void: true, voider: voider},
	}})

	// The records both books share by role: a bulk id maps to the posted one,
	// as TestAPAgingBulkWriterMatchesPosters maps them.
	idMap := map[string]string{
		bv.Id: v.Id, bb.payable.Id: pb.payable.Id, bb.expense.Id: pb.expense.Id, bb.bank.Id: pb.bank.Id,
		bb.users.bookkeeper.Id: pb.users.bookkeeper.Id, bb.users.admin.Id: pb.users.admin.Id,
	}
	numbers := map[string]string{}
	match := func(what string, bulk, posted []string) {
		t.Helper()
		if len(bulk) != len(posted) {
			t.Fatalf("%s: the bulk writer wrote %d rows, posting wrote %d", what, len(bulk), len(posted))
		}
		for i := range bulk {
			idMap[bulk[i]] = posted[i]
		}
	}
	posted := []struct {
		doc   *core.Record
		entry string
	}{
		{bill, bill.GetString("entry")},
		{pay, pay.GetString("entry")},
		{credit, credit.GetString("entry")},
		{application, ""},
		{refund, refund.GetString("entry")},
		{voided, voided.GetString("entry")},
		{voidPay, voidPay.GetString("entry")},
	}
	if len(data.docs) != len(posted) {
		t.Fatalf("the bulk writer wrote %d documents, want %d", len(data.docs), len(posted))
	}
	postedEntries := map[string]bool{}
	for i, p := range posted {
		w := data.docs[i]
		match("document", []string{w.id}, []string{p.doc.Id})
		if p.entry == "" {
			continue
		}
		if w.number != "" && p.doc.GetString("number") != "" {
			numbers[w.number] = p.doc.GetString("number")
		}
		postedEntries[p.entry] = true
		match(arEntries, []string{w.entry}, []string{p.entry})
		match(arLines, w.lines, arIDsWhere(t, pb.app, arLines, "entry", p.entry))
		if w.reversal == "" {
			continue
		}
		reversal := ebvPostedReversal(t, pb.app, p.entry)
		postedEntries[reversal] = true
		match(arEntries, []string{w.reversal}, []string{reversal})
		match(arLines, w.reversalLines, arIDsWhere(t, pb.app, arLines, "entry", reversal))
	}

	want := ebvCashRowKeys(t, pb.app, postedEntries, nil, nil)
	got := ebvCashRowKeys(t, bb.app, postedEntries, idMap, numbers)
	// The posters' book holds a row of each kind D3 names, so an equal set
	// proves each kind.
	for _, memo := range []string{
		"Unpaid bill (cash basis)", " paid (cash basis)", " paid by vendor credit (cash basis)",
		" applied (cash basis)", " refunded (cash basis)", "Unapplied vendor credit (cash basis)",
	} {
		if !slices.ContainsFunc(want, func(k string) bool { return strings.Contains(k, memo) }) {
			t.Errorf("the posters' book has no cash-basis row with the memo %q; rows:\n%s", memo, strings.Join(want, "\n"))
		}
	}
	if !reflect.DeepEqual(got, want) {
		var missing, stray []string
		for _, k := range want {
			if !slices.Contains(got, k) {
				missing = append(missing, k)
			}
		}
		for _, k := range got {
			if !slices.Contains(want, k) {
				stray = append(stray, k)
			}
		}
		t.Errorf("the bulk book's books_cash_basis_lines rows (ids mapped to the posted ones) differ from the posters' "+
			"(%d bulk, %d posted).\nPosted, not in the bulk book:\n%s\nIn the bulk book, not posted:\n%s",
			len(got), len(want), strings.Join(missing, "\n"), strings.Join(stray, "\n"))
	}
}

// ebvTableRows are every row of table, each as its columns (id, created and
// updated left out), sorted.
func ebvTableRows(t *testing.T, app core.App, table string) []string {
	t.Helper()
	var ids []string
	if err := app.DB().Select("id").From(table).OrderBy("id").Column(&ids); err != nil {
		t.Fatalf("read %s: %v", table, err)
	}
	ignored := map[string]bool{"id": true, "created": true, "updated": true}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		row := arRawRow(t, app, table, id)
		cols := make([]string, 0, len(row))
		for col := range row {
			if !ignored[col] {
				cols = append(cols, col)
			}
		}
		sort.Strings(cols)
		parts := make([]string, len(cols))
		for i, col := range cols {
			parts[i] = col + "=" + arNormal(row, col, nil)
		}
		out = append(out, strings.Join(parts, " "))
	}
	sort.Strings(out)
	return out
}

// ebvRowsDiffer names the rows of table that are in before and not in after,
// and the reverse; "" when the two sets are equal.
func ebvRowsDiffer(table string, before, after []string) string {
	if reflect.DeepEqual(before, after) {
		return ""
	}
	var gone, added []string
	for _, k := range before {
		if !slices.Contains(after, k) {
			gone = append(gone, k)
		}
	}
	for _, k := range after {
		if !slices.Contains(before, k) {
			added = append(added, k)
		}
	}
	return fmt.Sprintf("%s: %d rows written, %d after the rebuild.\nWritten, gone after the rebuild:\n%s\nAfter the rebuild, not written:\n%s",
		table, len(before), len(after), strings.Join(gone, "\n"), strings.Join(added, "\n"))
}

func TestExpensesByVendorBulkCashRowsMatchRebuild(t *testing.T) {
	sizes := []apSize{apSmall}
	if os.Getenv("BOOKS_SCALE") == "1" {
		sizes = append(sizes, apS)
	}
	for _, size := range sizes {
		t.Run(size.name, func(t *testing.T) {
			b := newAPBook(t)
			writeEBVDataset(t, b, size)
			lines := ebvTableRows(t, b.app, cashLinesCollection)
			months := ebvTableRows(t, b.app, cashBalancesCollection)

			changed, err := rebuildCashBasis(b.app)
			if err != nil {
				t.Fatalf("%s: rebuildCashBasis: %v", size.name, err)
			}
			if changed != 0 {
				t.Errorf("%s: rebuildCashBasis changed %d cash-basis rows of the bulk book, want 0", size.name, changed)
			}
			fixed := 0
			if err := b.app.RunInTransaction(func(tx core.App) error {
				n, err := rebuildCashBalances(tx)
				fixed = n
				return err
			}); err != nil {
				t.Fatalf("%s: rebuildCashBalances: %v", size.name, err)
			}
			if fixed != 0 {
				t.Errorf("%s: rebuildCashBalances changed %d stored cash months of the bulk book, want 0", size.name, fixed)
			}

			linesAfter := ebvTableRows(t, b.app, cashLinesCollection)
			monthsAfter := ebvTableRows(t, b.app, cashBalancesCollection)
			if diff := ebvRowsDiffer(cashLinesCollection, lines, linesAfter); diff != "" {
				t.Errorf("%s: %s", size.name, diff)
			}
			if diff := ebvRowsDiffer(cashBalancesCollection, months, monthsAfter); diff != "" {
				t.Errorf("%s: %s", size.name, diff)
			}
			// A book with no cash rows at all would pass the checks above.
			if len(linesAfter) == 0 || len(monthsAfter) == 0 {
				t.Errorf("%s: the book has %d cash-basis rows and %d stored cash months after the rebuild, want both above 0",
					size.name, len(linesAfter), len(monthsAfter))
			}
		})
	}
}

func TestExpensesByVendorQueryPlans(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	runs := ebvRuns(b, data, ebvVendorKeyOf(t, b, data, ebvBusiestVendor(t, b)))

	t.Run("the bars name this report's large tables", func(t *testing.T) {
		whole := arRun{name: "1 default", wholeBook: true, reading: "hand-written"}
		for _, table := range ebvLargeTables {
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, whole, "SELECT 1", []planStep{
				{ID: 2, Detail: "SCAN v", Tables: []string{"books_vendors"}},
				{ID: 3, Detail: "SCAN x", Tables: []string{table}},
			}, ebvLargeTables)
			if len(rec.errs) == 0 {
				t.Errorf("checkPlanBars passes a SCAN of %s inside a loop, want a failure", table)
			}
		}
	})

	// The no-statistics reading comes first, so a missing statistics file does
	// not hide its result.
	ebvCheckRuns(t, b, runs, false, []arReading{{name: "no statistics"}}, nil)
	// Plan D11 item 5: the L book's statistics are the sqlite_stat1 AND the
	// sqlite_stat4 rows a real ANALYZE of it writes (the scale run writes the
	// file). The stat1 rows alone do not give the planner of the L book: with
	// them it searches books_journal_lines, with stat4 too it scans it
	// (cp3-l-diagnosis.md (a)).
	lStats := arLStatReading(t, "L statistics", "expenses_by_vendor_stats.json")
	if len(lStats.stats) == 0 || len(lStats.stat4) == 0 {
		t.Fatalf("testdata/expenses_by_vendor_stats.json has %d sqlite_stat1 rows and %d sqlite_stat4 rows, want both above 0",
			len(lStats.stats), len(lStats.stat4))
	}
	ebvCheckRuns(t, b, runs, false, []arReading{lStats}, nil)
}

// A reading that replays the sqlite_stat1 and sqlite_stat4 rows a real ANALYZE
// wrote gives the planner of that ANALYZE (plan D11 item 5): every statement of
// every run has the same plan under both. TestExpensesByVendorQueryPlans holds
// the L book's plans to the bars through such a replay.
func TestExplainReadingReplaysAnalyze(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	runs := ebvRuns(b, data, ebvVendorKeyOf(t, b, data, ebvBusiestVendor(t, b)))
	seen := map[string]bool{}
	var statements []string
	for _, run := range runs {
		for _, s := range recordEBVRun(t, b, run, false) {
			if !seen[s] {
				seen[s] = true
				statements = append(statements, s)
			}
		}
	}
	if len(statements) == 0 {
		t.Fatal("the runs recorded no SELECT")
	}

	analyzed, stat1, stat4 := explainReadingStats(t, b.app, arReading{name: "after ANALYZE", analyze: true}, statements)
	if len(stat1) == 0 || len(stat4) == 0 {
		t.Fatalf("ANALYZE wrote %d sqlite_stat1 rows and %d sqlite_stat4 rows, want both above 0", len(stat1), len(stat4))
	}
	stat4Tables := map[string]bool{}
	for _, s := range stat4 {
		stat4Tables[s.Tbl] = true
	}
	if !stat4Tables["books_journal_lines"] {
		t.Errorf("the sqlite_stat4 rows ANALYZE wrote have none of books_journal_lines; tables %v", stat4Tables)
	}
	replayed, _ := explainReading(t, b.app, arReading{name: "replay of that ANALYZE", stats: stat1, stat4: stat4}, statements)
	for i, s := range statements {
		got, want := arPlanText(arStepsOf(replayed, i)), arPlanText(arStepsOf(analyzed, i))
		if got != want {
			t.Errorf("statement %d: the plan under the replay of the ANALYZE rows differs from the plan after ANALYZE.\n"+
				"After ANALYZE:\n%s\nReplayed:\n%s\nstatement: %s", i+1, want, got, s)
		}
	}
}

// ebvRunsTable writes the Runs table of expenses-by-vendor-perf-results.md
// from the medians and each run's recorded failures (plan D11 item 4): a run
// with a recorded failure (a run error, a refusal with another status or
// message, a plan bar) is "fail" whatever its medians.
func TestEBVRunsTableMarksRecordedFailures(t *testing.T) {
	names := []string{"1 default", "3 cash", "8 CSV export"}
	export := map[string]bool{"8 CSV export": true}
	statements := map[string]int{"1 default": 7, "3 cash": 7, "8 CSV export": 42}
	medians := map[string]map[string]time.Duration{
		apS.name: {"1 default": 20 * time.Millisecond, "3 cash": 30 * time.Millisecond, "8 CSV export": 900 * time.Millisecond},
		apL.name: {"1 default": 200 * time.Millisecond, "3 cash": 300 * time.Millisecond, "8 CSV export": 4 * time.Second},
	}
	failures := map[string][]string{
		"3 cash":       {"after ANALYZE: statement 6 SCAN books_journal_lines"},
		"8 CSV export": {"L: the export failed with status 408, want 422 with \"" + ebvExportCap + "\""},
	}
	table := ebvRunsTable(names, export, statements, medians, failures)

	result := func(name string) string {
		t.Helper()
		for line := range strings.SplitSeq(table, "\n") {
			cells := strings.Split(strings.Trim(strings.TrimSpace(line), "|"), "|")
			if len(cells) < 2 || strings.TrimSpace(cells[0]) != name {
				continue
			}
			return strings.TrimSpace(cells[len(cells)-1])
		}
		t.Fatalf("the Runs table has no row for run %s:\n%s", name, table)
		return ""
	}
	if got := result("1 default"); got != "pass" {
		t.Errorf("run 1 default, no failure and under its bars: Result = %q, want pass\n%s", got, table)
	}
	if got := result("3 cash"); got != "fail" {
		t.Errorf("run 3 cash, a plan bar failure and medians under the bars: Result = %q, want fail\n%s", got, table)
	}
	if got := result("8 CSV export"); got != "fail" {
		t.Errorf("run 8, a 408 export failure and medians under the bar: Result = %q, want fail\n%s", got, table)
	}
}

// TestExpensesByVendorScaleRecordsFailuresAndStats runs, on apSmall, the parts
// of TestExpensesByVendorScale that run without BOOKS_SCALE (plan D11 items 4
// and 5). Run 8 is held to the L rule (refused with ebvExportCap), which the
// small book's export does not meet: the failure is recorded for run 8 alone,
// in the timing and in the plan checks, the other runs are still checked, and
// the Runs table marks run 8 "fail". The statistics file holds the sqlite_stat1
// and sqlite_stat4 rows of a real ANALYZE, and arLStatReading reads them back.
func TestExpensesByVendorScaleRecordsFailuresAndStats(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	runs := ebvRuns(b, data, ebvVendorKeyOf(t, b, data, ebvBusiestVendor(t, b)))
	export := runs[7]
	fails := newEBVFailures(nil)

	median := ebvTimeRun(t, b, export, true, apL.name, fails)
	if got := len(fails.byRun[export.name]); got != 1 {
		t.Fatalf("run %s timed with a refusal it does not get: %d recorded failures %v, want 1", export.name, got, fails.byRun[export.name])
	}
	if !strings.Contains(fails.byRun[export.name][0], "the export succeeded, want it refused") {
		t.Errorf("run %s: recorded failure %q, want the export that succeeded", export.name, fails.byRun[export.name][0])
	}

	statements := map[string]int{}
	ebvCheckRunsInto(t, b, runs, true, []arReading{{name: "no statistics"}}, func(run arRun, _ arReading, s []string, _ []planStep, _ []arStat) {
		statements[run.name] = len(s)
	}, fails)
	if got := len(fails.byRun[export.name]); got != 2 {
		t.Errorf("run %s after the plan checks: %d recorded failures %v, want 2 (the timing and the plan check)", export.name, got, fails.byRun[export.name])
	}
	var names []string
	exportRun := map[string]bool{}
	medians := map[string]map[string]time.Duration{apS.name: {}, apL.name: {}}
	for _, run := range runs[:7] {
		if f := fails.byRun[run.name]; len(f) > 0 {
			t.Errorf("run %s: recorded failures %v, want none (only run 8 fails)", run.name, f)
		}
		if statements[run.name] == 0 {
			t.Errorf("run %s: no statements recorded, want the plan checks to go on after run 8's failure", run.name)
		}
	}
	for _, run := range runs {
		names = append(names, run.name)
		exportRun[run.name] = run.export
		medians[apS.name][run.name] = time.Millisecond
		medians[apL.name][run.name] = time.Millisecond
	}
	medians[apL.name][export.name] = median

	table := ebvRunsTable(names, exportRun, statements, medians, fails.byRun)
	result := func(name string) string {
		t.Helper()
		for line := range strings.SplitSeq(table, "\n") {
			cells := strings.Split(strings.Trim(strings.TrimSpace(line), "|"), "|")
			if len(cells) >= 2 && strings.TrimSpace(cells[0]) == name {
				return strings.TrimSpace(cells[len(cells)-1])
			}
		}
		t.Fatalf("the Runs table has no row for run %s:\n%s", name, table)
		return ""
	}
	if got := result(export.name); got != "fail" {
		t.Errorf("run %s with recorded failures: Result = %q, want fail\n%s", export.name, got, table)
	}
	if got := result(runs[0].name); got != "pass" {
		t.Errorf("run %s with no failure: Result = %q, want pass\n%s", runs[0].name, got, table)
	}

	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "testdata"), 0o755); err != nil {
		t.Fatalf("make testdata: %v", err)
	}
	wrote := writeEBVStats(t, b.app, filepath.Join(dir, "testdata"))
	if len(wrote.Stat1) == 0 || len(wrote.Stat4) == 0 {
		t.Fatalf("the statistics file has %d sqlite_stat1 rows and %d sqlite_stat4 rows, want both above 0", len(wrote.Stat1), len(wrote.Stat4))
	}
	if !slices.ContainsFunc(wrote.Stat4, func(s arStat4) bool { return s.Tbl == "books_journal_lines" }) {
		t.Errorf("the statistics file has no sqlite_stat4 row of books_journal_lines")
	}
	t.Chdir(dir)
	read := arLStatReading(t, "L statistics", ebvStatsFileName)
	if !reflect.DeepEqual(read.stats, wrote.Stat1) {
		t.Errorf("arLStatReading read %d sqlite_stat1 rows that differ from the %d written", len(read.stats), len(wrote.Stat1))
	}
	if !reflect.DeepEqual(read.stat4, wrote.Stat4) {
		t.Errorf("arLStatReading read %d sqlite_stat4 rows that differ from the %d written", len(read.stat4), len(wrote.Stat4))
	}
}

// ebvTotalsOf are a run's vendor rows: vendor id ("" for No vendor) → its
// Total. It fails a run that shows one vendor two times.
func ebvTotalsOf(t *testing.T, what string, res *reports.Result) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, r := range ebvVendorRows(res) {
		vendor, _ := r.GroupKey[0].(string)
		if _, dup := out[vendor]; dup {
			t.Errorf("%s: two rows for vendor %q", what, vendor)
		}
		out[vendor] = int(amt(t, r, "amount"))
	}
	return out
}

// ebvPlanSums are the writer's plan's expense per vendor ("" for none) in
// from..to: a bill adds its total, a vendor credit takes its total off, a
// void document adds 0 (its reversal cancels it), and a manual line on the
// expense account adds its debit less its credit. All sums the vendor is in
// are kept, 0 too.
func ebvPlanSums(plan []apDoc, expense, from, to string) map[string]int {
	out := map[string]int{}
	for _, d := range plan {
		if d.date < from || d.date > to {
			continue
		}
		switch {
		case d.kind == apKindBill:
			out[d.vendor] += 0
			if !d.void {
				out[d.vendor] += d.cents
			}
		case d.kind == apKindCredit:
			out[d.vendor] += 0
			if !d.void {
				out[d.vendor] -= d.cents
			}
		case d.kind == apKindJournal:
			for _, l := range d.lines {
				if l.account == expense {
					out[l.vendor] += l.debit - l.credit
				}
			}
		}
	}
	return out
}

// ebvNonZero is sums with the sums of 0 left out.
func ebvNonZero(sums map[string]int) map[string]int {
	out := map[string]int{}
	for v, s := range sums {
		if s != 0 {
			out[v] = s
		}
	}
	return out
}

// ebvSum adds the values of sums.
func ebvSum(sums map[string]int) int64 {
	var total int64
	for _, s := range sums {
		total += int64(s)
	}
	return total
}

func TestExpensesByVendorRunsAgreeWithSmallBook(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	busiest := ebvBusiestVendor(t, b)
	runs := ebvRuns(b, data, ebvVendorKeyOf(t, b, data, busiest))
	plan := ebvPlanSums(data.plan, b.expense.Id, data.firstDay, data.lastDay)
	if plan[""] == 0 {
		t.Fatalf("the writer's plan has no expense line with no vendor in the period, want a No vendor row to check")
	}

	// Run 1: each vendor's Total is its bills less its vendor credits (a void
	// document at 0), No vendor is the manual lines on the expense account,
	// and the Total row adds them all.
	first := ebvResult(t, b, runs[0])
	firstTotals := ebvTotalsOf(t, "run 1", first)
	vbRequireTotals(t, "run 1 (every day of the book)", firstTotals, ebvNonZero(plan))
	if got, want := ebvTotal(t, first), ebvSum(plan); got != want {
		t.Errorf("run 1: the Total row = %d, want %d, the plan's sum", got, want)
	}

	// Run 3: the Cash Total is the Cash Profit and Loss's three expense
	// sections for the same period.
	cash := ebvResult(t, b, runs[2])
	pl := runPL(t, b.app, profitAndLossShipped(), b.reader,
		map[string]any{"period": ebvWholePeriod(data), "method": "cash"}, reports.Options{Today: data.lastDay})
	if got, want := ebvTotal(t, cash), plExpenseSections(t, pl); got != want {
		t.Errorf("run 3 (Cash): the Total row = %d, want the Cash Profit and Loss's Cost of goods sold + Expenses + Other expenses %d", got, want)
	}
	if ebvTotal(t, cash) == ebvTotal(t, first) {
		t.Errorf("run 3 (Cash): the Total %d equals run 1's (Accrual), want the open bills and credits left out", ebvTotal(t, cash))
	}

	// Run 5 (With activity): every row of run 1, and one row at 0 for each
	// vendor whose lines of the period add up to 0.
	activity := ebvTotalsOf(t, "run 5", ebvResult(t, b, runs[4]))
	vbRequireTotals(t, "run 5 (With activity)", activity, plan)
	for v, total := range activity {
		if _, shown := firstTotals[v]; !shown && total != 0 {
			t.Errorf("run 5 adds vendor %q at %d, want only vendors at 0 added", v, total)
		}
	}

	// Run 6: exactly the five picked vendors, each with its run 1 Total, and
	// no No vendor row.
	wantFive := map[string]int{}
	for _, v := range data.picked {
		wantFive[v] = firstTotals[v]
	}
	if len(wantFive) != 5 {
		t.Fatalf("data.picked = %v, want five vendors", data.picked)
	}
	five := ebvResult(t, b, runs[5])
	vbRequireTotals(t, fmt.Sprintf("run 6 (vendors %v)", data.picked), ebvTotalsOf(t, "run 6", five), wantFive)
	if got, want := ebvTotal(t, five), ebvSum(wantFive); got != want {
		t.Errorf("run 6: the Total row = %d, want %d, the picked vendors' sum", got, want)
	}

	// Run 7: the busiest vendor opens into one row per posted line of it on the
	// expense account, adding up to its Total.
	opened := ebvResult(t, b, runs[6])
	if opened.Page != nil && opened.Page.Next != "" {
		t.Fatalf("run 7 at the small size has a second page, want the busiest vendor's lines on the first")
	}
	vendorRow, ok := cbGroupRow(opened, 1, busiest)
	if !ok {
		t.Fatalf("run 7 has no row for the busiest vendor %s; rows %q", busiest, bsLabels(opened))
	}
	var wantLines int
	if err := b.app.DB().NewQuery("SELECT COUNT(*) FROM books_journal_lines WHERE account = {:expense} AND posted = {:posted} " +
		"AND vendor = {:vendor} AND date BETWEEN {:from} AND {:to}").Bind(dbx.Params{
		"expense": b.expense.Id, "posted": true, "vendor": busiest, "from": data.firstDay, "to": data.lastDay,
	}).Row(&wantLines); err != nil {
		t.Fatalf("count the busiest vendor's lines: %v", err)
	}
	under := ebvLinesUnder(t, opened, vendorRow)
	if len(under) != wantLines || wantLines < 2 {
		t.Errorf("run 7 opens the busiest vendor into %d rows, want one per posted expense line of it (%d, two or more)", len(under), wantLines)
	}
	if got, want := ebvLinesSum(ebvLinesOf(t, under)), amt(t, vendorRow, "amount"); got != want {
		t.Errorf("run 7: the busiest vendor's opened lines add up to %d, want its Total %d", got, want)
	}

	// Run 8: the CSV's Total line is run 1's Total.
	text, err := ebvExport(t, b, runs[7])
	if err != nil {
		t.Fatalf("run 8 (CSV): %v", err)
	}
	if got, want := vbCSVTotal(t, text), ebvTotal(t, first); got != want {
		t.Errorf("run 8 (CSV): the Total line = %d, want run 1's Total %d", got, want)
	}
}

// ebvStatsFileName is the file in testdata of the L book's statistics, which
// TestExpensesByVendorQueryPlans replays (arLStatReading).
const ebvStatsFileName = "expenses_by_vendor_stats.json"

// writeEBVStats runs a real ANALYZE of the book (rolled back) and writes the
// sqlite_stat1 and sqlite_stat4 rows it wrote to dir/ebvStatsFileName as an
// arStatsFile, the shape arLStatReading reads.
func writeEBVStats(t testing.TB, app core.App, dir string) arStatsFile {
	t.Helper()
	_, stat1, stat4 := explainReadingStats(t, app, arReading{name: "after ANALYZE", analyze: true}, nil)
	file := arStatsFile{Stat1: stat1, Stat4: stat4}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatalf("encode the statistics: %v", err)
	}
	path := filepath.Join(dir, ebvStatsFileName)
	if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return file
}

// ebvCheckSExport records run 8's failures at S: an export that fails, a CSV
// Total that is not run 1's, a median over the bar.
func ebvCheckSExport(t *testing.T, b apBook, first, export arRun, median time.Duration, fails *ebvFailures) {
	t.Helper()
	text, err := ebvExport(t, b, export)
	if err != nil {
		fails.add(export.name, "at S: %v", err)
	} else if res, err := runEBVErr(t, b.app, b.reader, first.params, first.opts); err != nil {
		fails.add(export.name, "at S: run %s for the Total: %v", first.name, err)
	} else if got, want := vbCSVTotal(t, text), ebvTotal(t, res); got != want {
		fails.add(export.name, "at S: the CSV's Total line = %d, want run 1's Total %d", got, want)
	}
	if bar := apBar(true); median > bar {
		fails.add(export.name, "at S: median %s, want %s or less", median, bar)
	}
}

// ebvCheckLMedians records the median bars of each run at L: apBar, and for
// runs 1 to 7 no more than 15 times the S median.
func ebvCheckLMedians(names []string, export map[string]bool, medians map[string]map[string]time.Duration, fails *ebvFailures) {
	for _, name := range names {
		l, s := medians[apL.name][name], medians[apS.name][name]
		if bar := apBar(export[name]); l > bar {
			fails.add(name, "at L: median %s, want %s or less", l, bar)
		}
		// The L-over-S ratio bar does not apply to run 8: at L it is a refusal.
		if export[name] {
			continue
		}
		if s <= 0 {
			fails.add(name, "no S median, want one to hold the L run to 15 times it")
		} else if l > 15*s {
			fails.add(name, "L median %s is %.1f times its S median %s, want 15 or less", l, float64(l)/float64(s), s)
		}
	}
}

// ebvScaleSize is one size of TestExpensesByVendorScale on a book that holds
// data: one warm-up and the median of 5 of each run of ebvRuns, run 8's S
// checks at S, and the plan bars of each statement of each run under no
// statistics and after ANALYZE, at S and at L (spec §8). Each failure is
// recorded into fails under its run; record gets each run's statements and
// plans under each reading. Run 8 (spec §8, "Run 8 and core's export cap"): at
// S the export succeeds; at L every call, the warm-up too, is refused with
// ebvExportCap, and its median is the median of the refusals.
func ebvScaleSize(t *testing.T, b apBook, data apDataset, size apSize, fails *ebvFailures, record func(run arRun, reading arReading, statements []string, steps []planStep)) ([]arRun, map[string]time.Duration) {
	t.Helper()
	runs := ebvRuns(b, data, ebvVendorKeyOf(t, b, data, ebvBusiestVendor(t, b)))
	refused := size.name == apL.name
	medians := map[string]time.Duration{}
	for _, run := range runs {
		medians[run.name] = ebvTimeRun(t, b, run, refused, size.name, fails)
		t.Logf("%s run %s: median %s", size.name, run.name, medians[run.name])
	}
	if !refused {
		export := runs[slices.IndexFunc(runs, func(r arRun) bool { return r.export })]
		ebvCheckSExport(t, b, runs[0], export, medians[export.name], fails)
	}
	readings := []arReading{{name: "no statistics"}, {name: "after ANALYZE", analyze: true}}
	ebvCheckRunsInto(t, b, runs, refused, readings, func(run arRun, reading arReading, statements []string, steps []planStep, _ []arStat) {
		record(run, reading, statements, steps)
	}, fails)
	return runs, medians
}

// TestExpensesByVendorScaleSChecksPlanBars runs ebvScaleSize at S on apSmall
// (no BOOKS_SCALE): the plan bars of each run are checked at S too, under no
// statistics and after ANALYZE, and their failures go into the failures the
// Runs table reads (fix round 1 of checkpoint 3, item 2).
func TestExpensesByVendorScaleSChecksPlanBars(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	fails := newEBVFailures(t.Errorf)
	checked := map[string][]string{}
	runs, medians := ebvScaleSize(t, b, data, apS, fails, func(run arRun, reading arReading, statements []string, _ []planStep) {
		if len(statements) == 0 {
			t.Errorf("run %s under %s: no statements recorded", run.name, reading.name)
		}
		checked[run.name] = append(checked[run.name], reading.name)
	})
	if len(runs) != 8 {
		t.Fatalf("ebvScaleSize ran %d runs, want the 8 of spec §8", len(runs))
	}
	want := []string{"no statistics", "after ANALYZE"}
	for _, run := range runs {
		if got := checked[run.name]; !slices.Equal(got, want) {
			t.Errorf("run %s at S: plan bars checked under %q, want %q", run.name, got, want)
		}
		if medians[run.name] <= 0 {
			t.Errorf("run %s at S: no median", run.name)
		}
	}
}

func TestExpensesByVendorScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the S and L runs of spec §8")
	}
	type planRec struct {
		run, reading string
		statements   []string
		steps        []planStep
	}
	medians := map[string]map[string]time.Duration{}
	counts := map[string]apCounts{}
	cashRows := map[string]int{}
	written := map[string]time.Duration{}
	var plans []planRec
	var runNames []string
	statementCount := map[string]int{}
	exportRun := map[string]bool{}
	// Each failure is recorded for its run, for the Runs table, and reported
	// with t.Errorf, so the test fails and the other runs and files go on.
	fails := newEBVFailures(nil)

	for _, size := range []apSize{apS, apL} {
		t.Run(size.name, func(t *testing.T) {
			fails.report = t.Errorf
			b := newAPBook(t)
			started := time.Now()
			data := writeEBVDataset(t, b, size)
			written[size.name] = time.Since(started)
			t.Logf("%s: wrote the dataset and its cash-basis rows in %s", size.name, written[size.name])
			counts[size.name] = apCountsOf(t, b, data)
			apRequireCounts(t, size.name, counts[size.name])
			var cashCount int
			if err := b.app.DB().NewQuery("SELECT COUNT(*) FROM " + cashLinesCollection).Row(&cashCount); err != nil {
				t.Fatalf("count the cash-basis rows: %v", err)
			}
			cashRows[size.name] = cashCount
			if cashCount == 0 {
				t.Fatalf("%s: the dataset has no cash-basis rows, want the rows posting writes", size.name)
			}

			refused := size.name == apL.name
			var runs []arRun
			runs, medians[size.name] = ebvScaleSize(t, b, data, size, fails, func(run arRun, reading arReading, statements []string, steps []planStep) {
				statementCount[run.name] = len(statements)
				// The plans file and the Statements section are the L book's.
				if refused {
					plans = append(plans, planRec{run: run.name, reading: reading.name, statements: statements, steps: steps})
				}
			})
			runNames = nil
			for _, run := range runs {
				runNames = append(runNames, run.name)
				exportRun[run.name] = run.export
			}
			if !refused {
				return
			}
			writeEBVStats(t, b.app, "testdata")
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
	fmt.Fprintf(&res, "# Expenses by Vendor performance results\n\n")
	fmt.Fprintf(&res, "- Machine: %s/%s, %d CPUs, %s\n- Date: %s\n- Commit: %s\n\n",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), time.Now().Format(time.DateTime), commit)
	fmt.Fprintf(&res, "## Row counts\n\n| | S | L |\n|---|---|---|\n")
	fmt.Fprintf(&res, "| books_journal_lines | %d | %d |\n", counts[apS.name].lines, counts[apL.name].lines)
	fmt.Fprintf(&res, "| books_cash_basis_lines | %d | %d |\n", cashRows[apS.name], cashRows[apL.name])
	for _, c := range apCountRows {
		fmt.Fprintf(&res, "| %s | %d | %d |\n", c.name, c.get(counts[apS.name]), c.get(counts[apL.name]))
	}
	fmt.Fprintf(&res, "| dataset write with the bulk cash-basis rows and rebuildCashBalances | %s | %s |\n", written[apS.name], written[apL.name])
	fmt.Fprintf(&res, "\n## Runs\n\n")
	res.WriteString(ebvRunsTable(runNames, exportRun, statementCount, medians, fails.byRun))
	fmt.Fprintf(&res, "\n## Statements (L)\n\n")
	var plansText strings.Builder
	fmt.Fprintf(&plansText, "# Expenses by Vendor query plans (L)\n")
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
		"expenses-by-vendor-perf-results.md": []byte(res.String()),
		"expenses-by-vendor-perf-plans.md":   []byte(plansText.String()),
	} {
		if err := os.WriteFile(filepath.Join(out, name), body, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}
