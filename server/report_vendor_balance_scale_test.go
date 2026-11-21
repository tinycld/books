package books

import (
	"encoding/csv"
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

	"tinycld.org/core/reports"
)

// The performance acceptance of the Vendor Balance (spec §8): the seven runs
// of the report on the A/P Aging's payables book (writeAPDataset, the shared
// harness), and a check of each SQL statement's query plan against the A/R
// Aging's plan bars with this report's large tables. The plan check runs at a
// small size in every test run (TestVendorBalanceQueryPlans); the S and L
// sizes start only with BOOKS_SCALE=1 (TestVendorBalanceScale).

// vbLargeTables are the Vendor Balance's large tables (spec §8).
var vbLargeTables = []string{"books_journal_lines", "books_journal_entries"}

// vbBusiestVendor is the vendor with the most posted Accounts payable lines
// (run 6 opens it), ties by id.
func vbBusiestVendor(t testing.TB, b apBook) string {
	t.Helper()
	var vendor string
	err := b.app.DB().NewQuery("SELECT vendor FROM books_journal_lines WHERE account = {:payable} AND vendor != '' " +
		"GROUP BY vendor ORDER BY COUNT(*) DESC, vendor LIMIT 1").Bind(dbx.Params{"payable": b.payable.Id}).Row(&vendor)
	if err != nil {
		t.Fatalf("read the busiest vendor: %v", err)
	}
	return vendor
}

// vbVendorKeyOf is the group key of vendor's row in run 1 (the default run on
// data's last day), as the view sends it when a reader opens the row.
func vbVendorKeyOf(t *testing.T, b apBook, data apDataset, vendor string) []any {
	t.Helper()
	res, err := runVBErr(t, b.app, b.reader, nil, reports.Options{Today: data.lastDay})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	row, ok := cbGroupRow(res, 1, vendor)
	if !ok {
		t.Fatalf("%s: run 1 has no row for the busiest vendor %s; rows %q", data.size.name, vendor, bsLabels(res))
	}
	return row.GroupKey
}

// vbRuns are the seven runs of spec §8 on data; vendorKey is the busiest
// vendor's group key (run 6).
func vbRuns(b apBook, data apDataset, vendorKey []any) []arRun {
	day := reports.Options{Today: data.lastDay}
	return []arRun{
		{name: "1 default", opts: day, wholeBook: true},
		{name: "2 past day", params: map[string]any{"asOf": data.midDay}, opts: day, wholeBook: true},
		{name: "3 largest balance", params: map[string]any{"order": "balance"}, opts: day, wholeBook: true},
		{name: "4 with activity", params: map[string]any{"rows": "activity"}, opts: day, wholeBook: true},
		{name: "5 five vendors", params: map[string]any{"vendors": data.picked}, opts: day, bound: true},
		{name: "6 vendor opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{vendorKey}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		// Run 7 is the CSV export of run 1, so it exports on run 1's day.
		{name: "7 CSV export", opts: day, export: true, wholeBook: true},
	}
}

// vbResult runs r (not the export) as the Books reader.
func vbResult(t *testing.T, b apBook, r arRun) *reports.Result {
	t.Helper()
	res, err := runVBErr(t, b.app, b.reader, r.params, r.opts)
	if err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
	return res
}

// vbExportCap is core's refusal of a CSV export past its 50,000-row cap
// (spec §8, "Run 7 and core's export cap").
const vbExportCap = "This report has more than 50,000 rows. Narrow the period."

// vbRefusal is the message of a refused export (exportShippedCSVErr's error:
// the status and the JSON body core answers); "" when err holds no 422 body.
func vbRefusal(err error) string {
	if err == nil {
		return ""
	}
	_, body, ok := strings.Cut(err.Error(), "body: ")
	if !ok {
		return ""
	}
	var answer struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
	}
	if json.Unmarshal([]byte(body), &answer) != nil || answer.Status != 422 {
		return ""
	}
	return answer.Message
}

// vbExec runs r as the Books reader (run 7: the CSV export). With refused, an
// export must be refused with exactly vbExportCap (the L book is far past the
// cap); without it, an export must succeed. Anything else ends the test.
func vbExec(t *testing.T, b apBook, r arRun, refused bool) {
	t.Helper()
	if !r.export {
		vbResult(t, b, r)
		return
	}
	_, err := exportShippedCSVErr(t, b.app, vendorBalanceShipped(), vendorBalanceKey, r.opts.Today, b.reader, r.params)
	switch {
	case !refused && err != nil:
		t.Fatalf("run %s: %v", r.name, err)
	case refused && err == nil:
		t.Fatalf("run %s: the export succeeded, want it refused with %q", r.name, vbExportCap)
	case refused && vbRefusal(err) != vbExportCap:
		t.Fatalf("run %s: the export failed with %v, want it refused with exactly %q", r.name, err, vbExportCap)
	}
}

// vbCSVTotal is the cents of the Total line of a CSV export.
func vbCSVTotal(t *testing.T, text string) int64 {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v", err)
	}
	at := slices.IndexFunc(records, func(r []string) bool { return len(r) >= 2 && r[0] == "Total" })
	if at < 0 {
		t.Fatalf("the CSV has no Total line; lines %d", len(records))
	}
	return int64(apCSVCents(t, records[at][1]))
}

// recordVBRun runs r and returns each distinct SELECT it ran, in order. An
// export is run once first: its first call ships the report on the app. With
// refused, the export must be refused (vbExec); a refusal still runs the
// statements the cap check reads.
func recordVBRun(t *testing.T, b apBook, r arRun, refused bool) []string {
	t.Helper()
	if r.export {
		vbExec(t, b, r, refused)
	}
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
	}, func() { vbExec(t, b, r, refused) })
	return out
}

// vbCheckRuns records each run's statements and checks every plan under each
// reading against the bars with vbLargeTables. The statements that run 6
// records and run 1 does not are bound. It fails a run that records no SELECT
// reading books_journal_lines. With refused, the export run must be refused
// (the L book).
func vbCheckRuns(t *testing.T, b apBook, runs []arRun, refused bool, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat)) {
	t.Helper()
	base := map[string]bool{}
	for _, run := range runs {
		statements := recordVBRun(t, b, run, refused)
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
			readsLines := false
			for i, s := range statements {
				own := arStepsOf(steps, i)
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, "books_journal_lines") }) {
					readsLines = true
				}
				r := run
				r.reading = reading.name
				r.bound = run.bound || (run.adds && !base[s])
				checkPlanBars(t, r, s, own, vbLargeTables)
			}
			if !readsLines {
				t.Errorf("run %s, %s: none of its %d SELECTs reads books_journal_lines: the statement recorder is wired wrong",
					run.name, reading.name, len(statements))
			}
			if record != nil {
				record(run, reading, statements, steps, stats)
			}
		}
	}
}

func TestVendorBalanceQueryPlans(t *testing.T) {
	b := newAPBook(t)
	data := writeAPDataset(t, b, apSmall)
	runs := vbRuns(b, data, vbVendorKeyOf(t, b, data, vbBusiestVendor(t, b)))

	t.Run("the bars name this report's large tables", func(t *testing.T) {
		whole := arRun{name: "1 default", wholeBook: true, reading: "hand-written"}
		for _, table := range vbLargeTables {
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, whole, "SELECT 1", []planStep{
				{ID: 2, Detail: "SCAN v", Tables: []string{"books_vendors"}},
				{ID: 3, Detail: "SCAN x", Tables: []string{table}},
			}, vbLargeTables)
			if len(rec.errs) == 0 {
				t.Errorf("checkPlanBars passes a SCAN of %s inside a loop, want a failure", table)
			}
		}
	})

	// The no-statistics reading comes first, so a missing statistics file does
	// not hide its result.
	vbCheckRuns(t, b, runs, false, []arReading{{name: "no statistics"}}, nil)
	lStats := arLStats(t, "vendor_balance_stat1.json")
	vbCheckRuns(t, b, runs, false, []arReading{{name: "L statistics", stats: lStats}}, nil)
}

// vbTotalsOf are a run's vendor rows: vendor id ("" for No vendor) → its
// Balance. It fails a run that shows one vendor two times.
func vbTotalsOf(t *testing.T, what string, res *reports.Result) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, r := range vbVendorRows(res) {
		vendor, _ := r.GroupKey[0].(string)
		if _, dup := out[vendor]; dup {
			t.Errorf("%s: two rows for vendor %q", what, vendor)
		}
		out[vendor] = int(amt(t, r, "balance"))
	}
	return out
}

// vbNonZero is the record's sum of open items per vendor, the vendors whose
// sum is 0 left out: the Non-zero rows a ledger balance gives.
func vbNonZero(items map[string]apItem) map[string]int {
	out := map[string]int{}
	for v, total := range apVendorTotals(items) {
		if total != 0 {
			out[v] = total
		}
	}
	return out
}

// vbRequireTotals fails when a run's vendor rows differ from want, naming
// each vendor that differs.
func vbRequireTotals(t *testing.T, what string, got, want map[string]int) {
	t.Helper()
	if reflect.DeepEqual(got, want) {
		return
	}
	var diffs []string
	for v, w := range want {
		if g, ok := got[v]; !ok || g != w {
			diffs = append(diffs, fmt.Sprintf("vendor %q: report %d (shown %v), record %d", v, g, ok, w))
		}
	}
	for v, g := range got {
		if _, ok := want[v]; !ok {
			diffs = append(diffs, fmt.Sprintf("vendor %q: report %d, not in the record", v, g))
		}
	}
	sort.Strings(diffs)
	t.Errorf("%s: %d vendor rows differ from the writer's record (%d in the report, %d in the record):\n%s",
		what, len(diffs), len(got), len(want), strings.Join(diffs[:min(len(diffs), 20)], "\n"))
}

// vbLineOf is one posted Accounts payable line as books_journal_lines holds it.
type vbLineOf struct {
	ID     string `db:"id"`
	Vendor string `db:"vendor"`
	Date   string `db:"date"`
}

// vbPayableLines are the posted Accounts payable lines on or before day, by
// date then id, read from books_journal_lines.
func vbPayableLines(t *testing.T, b apBook, day string) []vbLineOf {
	t.Helper()
	var out []vbLineOf
	err := b.app.DB().NewQuery("SELECT l.id, l.vendor, l.date FROM books_journal_lines l " +
		"JOIN books_accounts a ON a.id = l.account " +
		"WHERE a.type = 'accounts_payable' AND l.posted = TRUE AND l.date <= {:day} ORDER BY l.date, l.id").
		Bind(dbx.Params{"day": day}).All(&out)
	if err != nil {
		t.Fatalf("read the posted Accounts payable lines: %v", err)
	}
	return out
}

// vbPageRows is the counted rows of a run's first page (core's
// runLimits.pageSize: group, opening, detail and subtotal rows; a Total is not
// counted).
const vbPageRows = 200

// vbVendorLinesInOrder are the row ids of vendor's posted Accounts payable
// lines on or before day, in the report's order of opened lines: date,
// entry.posted_at, position (balanceLineKeys), then core's row id.
func vbVendorLinesInOrder(t *testing.T, b apBook, vendor, day string) []string {
	t.Helper()
	var ids []string
	err := b.app.DB().NewQuery("SELECT l.id FROM books_journal_lines l " +
		"JOIN books_journal_entries e ON e.id = l.entry " +
		"JOIN books_accounts a ON a.id = l.account " +
		"WHERE a.type = 'accounts_payable' AND l.posted = TRUE AND l.vendor = {:vendor} AND l.date <= {:day} " +
		"ORDER BY l.date, e.posted_at, l.position, l.id").
		Bind(dbx.Params{"vendor": vendor, "day": day}).Column(&ids)
	if err != nil {
		t.Fatalf("read the vendor's posted Accounts payable lines: %v", err)
	}
	for i, id := range ids {
		ids[i] = "d:" + id
	}
	return ids
}

func TestVendorBalanceRunsAgreeWithSmallBook(t *testing.T) {
	b := newAPBook(t)
	data := writeAPDataset(t, b, apSmall)
	busiest := vbBusiestVendor(t, b)
	runs := vbRuns(b, data, vbVendorKeyOf(t, b, data, busiest))

	if len(data.openLast) == 0 || len(data.openMid) == 0 {
		t.Fatalf("the writer's record has %d open items on the last day and %d on the middle day, want some on each",
			len(data.openLast), len(data.openMid))
	}
	if apVendorTotals(data.openLast)[""] == 0 {
		t.Fatalf("the record's open items with no vendor sum to 0 on the last day, want a No vendor row to check")
	}

	// Runs 1 and 2: a vendor's ledger balance is the sum of its open items (a
	// settled item adds 0), No vendor is the items with no vendor, and the
	// Total is the record's sum.
	first := vbResult(t, b, runs[0])
	firstTotals := vbTotalsOf(t, "run 1", first)
	vbRequireTotals(t, "run 1 (the last day)", firstTotals, vbNonZero(data.openLast))
	if got, want := vbTotal(t, first), int64(apSumOwed(data.openLast)); got != want {
		t.Errorf("run 1: the Total row = %d, want %d, the record's sum", got, want)
	}
	past := vbResult(t, b, runs[1])
	vbRequireTotals(t, "run 2 (the middle day)", vbTotalsOf(t, "run 2", past), vbNonZero(data.openMid))
	if got, want := vbTotal(t, past), int64(apSumOwed(data.openMid)); got != want {
		t.Errorf("run 2: the Total row = %d, want %d, the record's sum on the middle day", got, want)
	}

	// Run 3: run 1's rows, largest balance first, No vendor last, ties by name.
	type vendorLine struct {
		vendor, label string
		balance       int64
	}
	linesOf := func(res *reports.Result) []vendorLine {
		var out []vendorLine
		for _, r := range vbVendorRows(res) {
			vendor, _ := r.GroupKey[0].(string)
			out = append(out, vendorLine{vendor: vendor, label: r.Label, balance: amt(t, r, "balance")})
		}
		return out
	}
	wantLargest := linesOf(first)
	sort.SliceStable(wantLargest, func(i, j int) bool {
		a, c := wantLargest[i], wantLargest[j]
		if (a.vendor == "") != (c.vendor == "") {
			return c.vendor == ""
		}
		if a.balance != c.balance {
			return a.balance > c.balance
		}
		return strings.ToLower(a.label) < strings.ToLower(c.label)
	})
	if got := linesOf(vbResult(t, b, runs[2])); !reflect.DeepEqual(got, wantLargest) {
		t.Errorf("run 3 (Largest balance) vendor rows =\n%+v\nwant run 1's rows, largest first, No vendor last, ties by name\n%+v", got, wantLargest)
	}

	// Run 4 (With activity): every row of run 1, and one row at 0 for each
	// other vendor with a posted Accounts payable line on or before the day.
	lines := vbPayableLines(t, b, data.lastDay)
	wantActivity := map[string]int{}
	for _, l := range lines {
		if _, ok := wantActivity[l.Vendor]; !ok {
			wantActivity[l.Vendor] = 0
		}
	}
	for v, total := range firstTotals {
		wantActivity[v] = total
	}
	if len(wantActivity) == len(firstTotals) {
		t.Fatalf("every vendor with a posted Accounts payable line has a balance; want one that adds up to 0 to check With activity")
	}
	vbRequireTotals(t, "run 4 (With activity)", vbTotalsOf(t, "run 4", vbResult(t, b, runs[3])), wantActivity)

	// Run 5: exactly the five picked vendors, each with its run 1 balance, and
	// no No vendor row.
	wantFive := map[string]int{}
	for _, v := range data.picked {
		wantFive[v] = firstTotals[v]
	}
	if len(wantFive) != 5 {
		t.Fatalf("data.picked = %v, want five vendors", data.picked)
	}
	vbRequireTotals(t, fmt.Sprintf("run 5 (vendors %v)", data.picked), vbTotalsOf(t, "run 5", vbResult(t, b, runs[4])), wantFive)

	// Run 6: the busiest vendor opens into one row per posted Accounts payable
	// line of that vendor, in date order, adding up to its balance.
	opened := vbResult(t, b, runs[5])
	vendorRow, ok := cbGroupRow(opened, 1, busiest)
	if !ok {
		t.Fatalf("run 6 has no row for the busiest vendor %s; rows %q", busiest, bsLabels(opened))
	}
	var wantIDs []string
	dateOf := map[string]string{}
	for _, l := range lines {
		if l.Vendor == busiest {
			wantIDs = append(wantIDs, "d:"+l.ID)
			dateOf["d:"+l.ID] = l.Date
		}
	}
	if len(wantIDs) < 2 {
		t.Fatalf("the busiest vendor has %d posted Accounts payable lines, want two or more", len(wantIDs))
	}
	under := vbLinesUnder(t, opened, vendorRow)
	var gotIDs, gotDates []string
	sum := int64(0)
	for _, r := range under {
		gotIDs = append(gotIDs, r.ID)
		gotDates = append(gotDates, dateOf[r.ID])
		sum += amt(t, r, "balance")
	}
	if opened.Page != nil && opened.Page.Next != "" {
		// The first page is full: the vendor's lines take what the counted rows
		// before them leave, and they are the vendor's first lines in the
		// report's order.
		ordered := vbVendorLinesInOrder(t, b, busiest, data.lastDay)
		before := 0
		for _, r := range opened.Rows {
			if r.ID == vendorRow.ID {
				before++
				break
			}
			if r.Kind != reports.KindTotal && (r.Kind != reports.KindComputed || r.Section != "") {
				before++
			}
		}
		k := min(len(ordered), vbPageRows-before)
		if k < 1 {
			t.Fatalf("run 6's first page has %d counted rows up to the busiest vendor, want room for one of its lines in %d", before, vbPageRows)
		}
		if !reflect.DeepEqual(gotIDs, ordered[:k]) {
			t.Errorf("run 6's first page opens the busiest vendor into rows %v, want its first %d lines in the report's order (date, entry posted at, position) %v", gotIDs, k, ordered[:k])
		}
	} else {
		sorted := slices.Clone(gotIDs)
		slices.Sort(sorted)
		want := slices.Clone(wantIDs)
		slices.Sort(want)
		if !reflect.DeepEqual(sorted, want) {
			t.Errorf("run 6 opens the busiest vendor into rows %v, want one per posted Accounts payable line of it %v", gotIDs, wantIDs)
		}
		if got := amt(t, vendorRow, "balance"); sum != got {
			t.Errorf("run 6: the busiest vendor's line rows add up to %d, want its Balance %d", sum, got)
		}
	}
	for _, id := range gotIDs {
		if _, ok := dateOf[id]; !ok {
			t.Errorf("run 6: row %s under the busiest vendor is no posted Accounts payable line of it", id)
		}
	}
	if !slices.IsSorted(gotDates) {
		t.Errorf("run 6: the busiest vendor's line rows are dated %v, want date order", gotDates)
	}

	// Run 7: the CSV's Total line is run 1's Total.
	text := exportShippedCSV(t, b.app, vendorBalanceShipped(), vendorBalanceKey, runs[6].opts.Today, b.reader, runs[6].params)
	if got, want := vbCSVTotal(t, text), vbTotal(t, first); got != want {
		t.Errorf("run 7 (CSV): the Total line = %d, want run 1's Total %d", got, want)
	}
}

func TestVendorBalanceScale(t *testing.T) {
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
	var plans []planRec
	var stat1 []arStat
	var runNames []string
	statementCount := map[string]int{}
	exportRun := map[string]bool{}

	for _, size := range []apSize{apS, apL} {
		t.Run(size.name, func(t *testing.T) {
			b := newAPBook(t)
			started := time.Now()
			data := writeAPDataset(t, b, size)
			t.Logf("%s: wrote the dataset in %s", size.name, time.Since(started))
			counts[size.name] = apCountsOf(t, b, data)
			apRequireCounts(t, size.name, counts[size.name])

			runs := vbRuns(b, data, vbVendorKeyOf(t, b, data, vbBusiestVendor(t, b)))
			medians[size.name] = map[string]time.Duration{}
			// Run 7 (spec §8, "Run 7 and core's export cap"): at S the export
			// succeeds; at L every call, the warm-up too, is refused with
			// vbExportCap, and its median is the median of the refusals.
			refused := size.name == apL.name
			for _, run := range runs {
				medians[size.name][run.name] = arMedian(func() { vbExec(t, b, run, refused) })
				t.Logf("%s run %s: median %s", size.name, run.name, medians[size.name][run.name])
			}
			if !refused {
				export := runs[slices.IndexFunc(runs, func(r arRun) bool { return r.export })]
				text, err := exportShippedCSVErr(t, b.app, vendorBalanceShipped(), vendorBalanceKey, export.opts.Today, b.reader, export.params)
				if err != nil {
					t.Fatalf("run %s at S: %v", export.name, err)
				}
				if got, want := vbCSVTotal(t, text), vbTotal(t, vbResult(t, b, runs[0])); got != want {
					t.Errorf("run %s at S: the CSV's Total line = %d, want run 1's Total %d", export.name, got, want)
				}
				if s, bar := medians[size.name][export.name], apBar(true); s > bar {
					t.Errorf("run %s at S: median %s, want %s or less", export.name, s, bar)
				}
				return
			}

			runNames = nil
			for _, run := range runs {
				runNames = append(runNames, run.name)
				exportRun[run.name] = run.export
			}
			readings := []arReading{{name: "no statistics"}, {name: "after ANALYZE", analyze: true}}
			vbCheckRuns(t, b, runs, refused, readings, func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat) {
				statementCount[run.name] = len(statements)
				plans = append(plans, planRec{run: run.name, reading: reading.name, statements: statements, steps: steps})
				if reading.analyze {
					stat1 = stats
				}
			})
			for _, name := range runNames {
				l, s := medians[apL.name][name], medians[apS.name][name]
				if bar := apBar(exportRun[name]); l > bar {
					t.Errorf("run %s at L: median %s, want %s or less", name, l, bar)
				}
				// The L-over-S ratio bar does not apply to run 7: at L it is a refusal.
				if exportRun[name] {
					continue
				}
				if s <= 0 {
					t.Errorf("run %s has no S median, want one to hold the L run to 15 times it", name)
				} else if l > 15*s {
					t.Errorf("run %s: L median %s is %.1f times its S median %s, want 15 or less", name, l, float64(l)/float64(s), s)
				}
			}
		})
	}

	if stat1 != nil {
		stats, err := json.MarshalIndent(stat1, "", "  ")
		if err != nil {
			t.Fatalf("encode sqlite_stat1: %v", err)
		}
		if err := os.WriteFile(filepath.Join("testdata", "vendor_balance_stat1.json"), append(stats, '\n'), 0o644); err != nil {
			t.Fatalf("write testdata/vendor_balance_stat1.json: %v", err)
		}
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
	fmt.Fprintf(&res, "# Vendor Balance performance results\n\n")
	fmt.Fprintf(&res, "- Machine: %s/%s, %d CPUs, %s\n- Date: %s\n- Commit: %s\n\n",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), time.Now().Format(time.DateTime), commit)
	fmt.Fprintf(&res, "## Row counts\n\n| | S | L |\n|---|---|---|\n")
	fmt.Fprintf(&res, "| books_journal_lines | %d | %d |\n", counts[apS.name].lines, counts[apL.name].lines)
	for _, c := range apCountRows {
		fmt.Fprintf(&res, "| %s | %d | %d |\n", c.name, c.get(counts[apS.name]), c.get(counts[apL.name]))
	}
	fmt.Fprintf(&res, "\n## Runs\n\n| Run | Statements | S median | L median | Ratio | Bar | Result |\n|---|---|---|---|---|---|---|\n")
	for _, name := range runNames {
		s, l := medians[apS.name][name], medians[apL.name][name]
		bar := apBar(exportRun[name])
		if exportRun[name] {
			result := "pass"
			if l > bar || s <= 0 || s > bar {
				result = "fail"
			}
			fmt.Fprintf(&res, "| %s | %d | %s | %s (refused: %q) | n/a | %s at S, Total = run 1's; at L refused with that message, %s | %s |\n",
				name, statementCount[name], s, l, vbExportCap, bar, bar, result)
			continue
		}
		ratio := 0.0
		if s > 0 {
			ratio = float64(l) / float64(s)
		}
		result := "pass"
		if l > bar || s <= 0 || ratio > 15 {
			result = "fail"
		}
		fmt.Fprintf(&res, "| %s | %d | %s | %s | %.1f | %s, ratio 15 | %s |\n", name, statementCount[name], s, l, ratio, bar, result)
	}
	fmt.Fprintf(&res, "\n## Statements (L)\n\n")
	var plansText strings.Builder
	fmt.Fprintf(&plansText, "# Vendor Balance query plans (L)\n")
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
		"vendor-balance-perf-results.md": []byte(res.String()),
		"vendor-balance-perf-plans.md":   []byte(plansText.String()),
	} {
		if err := os.WriteFile(filepath.Join(out, name), body, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}
