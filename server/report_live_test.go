package books

import (
	"bytes"
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// shippedNotLive says, for every report Books ships, whether it is NOT live
// (the human's decision of 2026-11-20): the six reports that read every
// journal line do not update by themselves, and the reader presses Refresh.
// A new shipped report is added here, with its answer.
var shippedNotLive = map[string]bool{
	"books.general_ledger":           true,
	"books.transaction_detail":       true,
	"books.trial_balance":            true,
	"books.balance_sheet":            true,
	"books.journal":                  true,
	"books.profit_and_loss_by_month": true,

	"books.profit_and_loss":     false,
	"books.customer_balance":    false,
	"books.audit_log":           false,
	"books.ar_aging":            false,
	"books.sales_by_customer":   false,
	"books.sales_by_product":    false,
	"books.sales_tax_liability": false,

	// Added after the decision: the A/P Aging and the Open Items statement
	// read stored item rows, and the Balance Forward statement reads only the
	// Accounts receivable lines of its customers in its period.
	"books.ap_aging":                  false,
	"books.statement_balance_forward": false,
	"books.statement_open_items":      false,
	// Like the Customer Balance: its rows are sums per vendor, and an opened
	// vendor reads only its own lines.
	"books.vendor_balance": false,
}

// requireManual fails unless res is a manual run: marked, and with no topic.
func requireManual(t *testing.T, res *reports.Result) {
	t.Helper()
	if !res.Manual || len(res.Topics) != 0 {
		t.Errorf("manual = %v, topics = %v, want a manual run with no topic", res.Manual, res.Topics)
	}
}

// liveRun is what the test reads of a run endpoint answer.
type liveRun struct {
	Manual bool     `json:"manual"`
	Topics []string `json:"topics"`
}

// savedOnly are the topics core adds to the run of a saved report; a manual
// run of one carries only these.
var savedOnly = []string{"collection/report_shares", "collection/reports"}

// Every shipped Books report runs through core's run endpoint as a Books
// reader: exactly the six of shippedNotLive are manual, and every other one
// carries data topics. A copy of a live report and a report built over
// journal lines are manual too.
func TestShippedReportsNotLive(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	reports.Register(app)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	rows, err := app.FindRecordsByFilter("reports", "shipped_key != ''", "shipped_key", 0, 0)
	if err != nil {
		t.Fatalf("read the shipped reports: %v", err)
	}
	var keys []string
	for _, row := range rows {
		keys = append(keys, row.GetString("shipped_key"))
	}
	if want := slices.Sorted(maps.Keys(shippedNotLive)); !slices.Equal(keys, want) {
		t.Fatalf("shipped reports = %v, want %v: list a new report in shippedNotLive", keys, want)
	}

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	err = app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		run := func(body map[string]any) (liveRun, error) {
			body["options"] = map[string]any{"today": "2026-11-09"}
			req := httptest.NewRequest(http.MethodPost, "/api/reports/run", bytes.NewReader(mustJSON(body)))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", tokenFor(t, reader))
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			var out liveRun
			if rec.Code != http.StatusOK {
				return out, fmt.Errorf("status %d, want 200; body: %s", rec.Code, rec.Body.String())
			}
			return out, json.Unmarshal(rec.Body.Bytes(), &out)
		}

		for _, row := range rows {
			key := row.GetString("shipped_key")
			got, err := run(map[string]any{"reportId": row.Id})
			if err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
			if got.Manual != shippedNotLive[key] {
				t.Errorf("%s: manual = %v, want %v", key, got.Manual, shippedNotLive[key])
			}
			// A manual run follows no data: it keeps only the topics of the
			// saved report itself. A live run follows its data too.
			if hasData := !slices.Equal(got.Topics, savedOnly); hasData == got.Manual {
				t.Errorf("%s: manual = %v with topics %v", key, got.Manual, got.Topics)
			}
		}

		// The Profit and Loss stays live over the journal lines.
		for _, row := range rows {
			if row.GetString("shipped_key") != profitAndLossKey {
				continue
			}
			got, err := run(map[string]any{"reportId": row.Id})
			if err != nil {
				return err
			}
			if !slices.Contains(got.Topics, "collection/books_journal_lines") {
				t.Errorf("Profit and Loss topics = %v, want collection/books_journal_lines", got.Topics)
			}
		}

		// A draft is never the shipped record: the same spec, posted as a
		// copy or from the builder, is manual and follows nothing.
		drafts := map[string]json.RawMessage{
			"a copy of the Profit and Loss":     profitAndLossShipped().Spec,
			"a copy of the Customer Balance":    customerBalanceShipped().Spec,
			"a copy of the Vendor Balance":      vendorBalanceShipped().Spec,
			"a copy of the Audit Log":           auditLogShipped().Spec,
			"a report built over journal lines": json.RawMessage(debitToDay),
		}
		for name, spec := range drafts {
			got, err := run(map[string]any{"spec": spec})
			if err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			if !got.Manual || len(got.Topics) != 0 {
				t.Errorf("%s: manual = %v, topics = %v, want a manual run with no topic", name, got.Manual, got.Topics)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Only the five reports that read the journal lines and stay live declare
// Live. A report that does not read them needs no mark.
func TestShippedLiveDeclarations(t *testing.T) {
	all := []reports.Shipped{
		trialBalanceShipped(), generalLedgerShipped(), balanceSheetShipped(), journalShipped(),
		profitAndLossShipped(), profitAndLossByMonthShipped(), transactionDetailShipped(),
		salesTaxLiabilityShipped(), customerBalanceShipped(), arAgingShipped(),
		salesByCustomerShipped(), salesByProductShipped(), auditLogShipped(),
		apAgingShipped(), statementBalanceForwardShipped(), statementOpenItemsShipped(),
		vendorBalanceShipped(),
	}
	var live []string
	for _, s := range all {
		if s.Live {
			live = append(live, s.Key)
		}
	}
	slices.Sort(live)
	want := []string{"books.audit_log", "books.customer_balance", "books.profit_and_loss", "books.statement_balance_forward", "books.vendor_balance"}
	if !slices.Equal(live, want) {
		t.Errorf("shipped reports with Live = %v, want %v", live, want)
	}
}
