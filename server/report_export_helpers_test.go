package books

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/reports"
)

// exportShippedCSVErr is the CSV export of the shipped report with key as
// reader, run on the day today: core exports a stored report by id, so it
// ships the report and Books' shares on app, then posts to
// /api/reports/export through the app's router. The first call on an app sets
// it up (no stored row with key yet); core's shipped registry is global, so
// the test resets it when it ends. A refused export is returned as the error;
// a failed setup ends the test.
func exportShippedCSVErr(t testing.TB, app core.App, shipped reports.Shipped, key, today string, reader *core.Record, params map[string]any) (string, error) {
	t.Helper()
	if _, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": key}); err != nil {
		t.Cleanup(reports.ResetForTesting)
		reports.Register(app)
		reports.RegisterShipped(shipped)
		// Core stores a shipped report only when an owner or admin exists to own it.
		mkUser(t, app, "owner")
		if err := reports.ReconcileShipped(app); err != nil {
			t.Fatalf("ReconcileShipped: %v", err)
		}
		if err := reconcileBooksReportShares(app); err != nil {
			t.Fatalf("reconcileBooksReportShares: %v", err)
		}
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": key})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", key, err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	body := mustJSON(map[string]any{
		"reportId": row.Id, "format": "csv", "params": given,
		"options": map[string]any{"today": today},
	})

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	out := ""
	err = app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		req := httptest.NewRequest(http.MethodPost, "/api/reports/export", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", tokenFor(t, reader))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			return fmt.Errorf("export: status %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
		out = rec.Body.String()
		return nil
	})
	return out, err
}

// exportShippedCSV is exportShippedCSVErr that ends the test on a refused
// export.
func exportShippedCSV(t testing.TB, app core.App, shipped reports.Shipped, key, today string, reader *core.Record, params map[string]any) string {
	t.Helper()
	out, err := exportShippedCSVErr(t, app, shipped, key, today, reader, params)
	if err != nil {
		t.Fatal(err)
	}
	return out
}
