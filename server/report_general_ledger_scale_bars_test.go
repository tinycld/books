package books

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// TestGLScaleBars pins the bar of each run of the scale measure at 500,000
// lines (human, 2026-11-20): a filtered run of one month 1 s, a filtered run
// of a year 2 s, a run with no Accounts filter 2 s. It reads the runs only;
// no book is written.
func TestGLScaleBars(t *testing.T) {
	account := func() *core.Record { return core.NewRecord(core.NewBaseCollection("accounts")) }
	b := glScaleBook{lastDay: "2026-11-20", incomes: []*core.Record{account()}}
	b.receivable = account()
	b.docs = &paymentEnv{ledgerEnv: &ledgerEnv{checking: account()}}
	want := map[string]time.Duration{
		"1 all accounts, month":  2 * time.Second,
		"2 all accounts, year":   2 * time.Second,
		"3 busy account, month":  time.Second,
		"4 small account, month": time.Second,
		"5 three accounts, year": 2 * time.Second,
	}
	runs := glScaleRuns(b)
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
			t.Errorf("run %s: bar %s, want %s", run.name, run.bar, bar)
		}
		if run.bar <= 0 {
			t.Errorf("run %s: has no bar: every run has one", run.name)
		}
		if run.filtered != (run.params["accounts"] != nil) {
			t.Errorf("run %s: filtered is %v, but the run's Accounts param is %v", run.name, run.filtered, run.params["accounts"])
		}
	}
}
