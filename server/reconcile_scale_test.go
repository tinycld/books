package books

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// TestReconcileLinesScale (reconcile spec §4 Schema, the view): the work
// screen's lines query over an account with 20,000 posted lines that are not
// cleared answers in under 2 s and seeks the lines by account. It is slow, so
// it runs only with BOOKS_SCALE=1 (the driver runs it).
func TestReconcileLinesScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("set BOOKS_SCALE=1 to run the reconcile lines scale test")
	}
	const n = 20000
	r := newRtEnv(t)
	// The rows are written past the hooks: the posting hooks would make the
	// setup take minutes, and the test measures the read, not the post.
	err := r.app.RunInTransaction(func(tx core.App) error {
		bare := tx.UnsafeWithoutHooks()
		entries, err := bare.FindCollectionByNameOrId("books_journal_entries")
		if err != nil {
			return err
		}
		lines, err := bare.FindCollectionByNameOrId("books_journal_lines")
		if err != nil {
			return err
		}
		start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		for i := range n {
			day := start.AddDate(0, 0, i%270).Format(time.DateOnly)
			e := core.NewRecord(entries)
			e.Load(map[string]any{
				"id": newRecordID(), "date": day, "status": "posted", "doc_type": "journal", "origin": "manual",
				"currency": "USD", "number": fmt.Sprintf("S%d", i+1), "memo": "scale",
			})
			if err := bare.Save(e); err != nil {
				return err
			}
			for pos, side := range []struct {
				account       *core.Record
				debit, credit int
			}{{r.savings, 100 + i%50, 0}, {r.rent, 0, 100 + i%50}} {
				l := core.NewRecord(lines)
				l.Load(map[string]any{
					"id": newRecordID(), "entry": e.Id, "account": side.account.Id, "debit": side.debit, "credit": side.credit,
					"position": pos, "currency": "USD", "posted": true, "date": day,
				})
				if err := bare.Save(l); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("write %d lines: %v", n, err)
	}

	params := dbx.Params{"a": r.savings.Id, "d": "2026-12-31"}
	began := time.Now()
	rows, err := r.app.FindRecordsByFilter(rtView, "account = {:a} && date <= {:d}", "date", 0, 0, params)
	took := time.Since(began)
	if err != nil {
		t.Fatalf("the lines query: %v", err)
	}
	if len(rows) != n {
		t.Errorf("the lines query returned %d rows, want %d", len(rows), n)
	}
	if took > 2*time.Second {
		t.Errorf("the lines query took %v, want under 2s", took)
	}
	requireLinesSeekByAccount(t, planOf(t, r.app, rvScreenQuery, params))
}
