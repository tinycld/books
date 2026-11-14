package books

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// docLineCreateOp is one batch operation that creates a line of a sales
// document, as the client's save writes it.
func docLineCreateOp(t testing.TB, kind salesDocKind, docID string, position int, fields map[string]any) string {
	t.Helper()
	body := map[string]any{kind.ParentField: docID, "position": position}
	for k, v := range fields {
		body[k] = v
	}
	raw, err := json.Marshal(map[string]any{
		"method": http.MethodPost,
		"url":    "/api/collections/" + kind.LinesCollection + "/records",
		"body":   body,
	})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func docLineDeleteOp(kind salesDocKind, lineID string) string {
	return fmt.Sprintf(`{"method":"DELETE","url":"/api/collections/%s/records/%s"}`, kind.LinesCollection, lineID)
}

func docLineCreateOps(t testing.TB, kind salesDocKind, docID string, lines []map[string]any) []string {
	t.Helper()
	ops := make([]string, len(lines))
	for i, line := range lines {
		ops[i] = docLineCreateOp(t, kind, docID, i, line)
	}
	return ops
}

func (pe *postingEnv) batchAsBookkeeper(t *testing.T, want int, content []string, ops ...string) apiReq {
	t.Helper()
	return apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, pe.users.bookkeeper),
		body: batchBody(ops...), want: want, content: content,
	}
}

// twelveLines has every kind of line, a percent line after an item and after
// a subtotal, and a subtotal after a percent line.
func (pe *postingEnv) twelveLines() []map[string]any {
	return []map[string]any{
		item(pe.service, 3, 45000, false),
		item(pe.accessPoint, 2, 18900, true),
		percentLine(pe.discount, -100000),
		item(pe.patchCable, 12, 875, true),
		subtotalLine(),
		percentLine(pe.discount, -50000),
		descriptionLine("Work done at the annex office."),
		item(pe.service, 1.5, 28000, false),
		item(pe.accessPoint, 1, 100, true),
		percentLine(pe.discount, 100000),
		subtotalLine(),
		item(pe.patchCable, 1, 999, true),
	}
}

// requireSameDocRows compares the stored lines (kind and amount, in order) and
// the three totals of two documents of one kind.
func requireSameDocRows(t testing.TB, app core.App, kind salesDocKind, gotID, wantID string) {
	t.Helper()
	got, err := salesDocLines(app, kind, gotID)
	if err != nil {
		t.Fatal(err)
	}
	want, err := salesDocLines(app, kind, wantID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("%d lines, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i].GetString("kind") != want[i].GetString("kind") || got[i].GetInt("amount") != want[i].GetInt("amount") {
			t.Errorf("line %d: kind/amount = %s/%d, want %s/%d", i+1,
				got[i].GetString("kind"), got[i].GetInt("amount"), want[i].GetString("kind"), want[i].GetInt("amount"))
		}
	}
	g, w := reload(t, app, kind.Collection, gotID), reload(t, app, kind.Collection, wantID)
	for _, field := range []string{"subtotal", "tax_total", "total"} {
		if g.GetInt(field) != w.GetInt(field) {
			t.Errorf("%s = %d, want %d", field, g.GetInt(field), w.GetInt(field))
		}
	}
}

// countStatements runs fn and returns how many SQL statements whose text match
// accepts the app ran meanwhile, reads and writes. A batch runs on another
// goroutine, so the count is atomic.
func countStatements(t testing.TB, app *tests.TestApp, match func(sql string) bool, fn func()) int {
	t.Helper()
	var n atomic.Int64
	seen := func(statement string) {
		if match(statement) {
			n.Add(1)
		}
	}
	for _, builder := range []dbx.Builder{app.ConcurrentDB(), app.NonconcurrentDB()} {
		db, ok := builder.(*dbx.DB)
		if !ok {
			t.Fatalf("the app's builder is %T, want *dbx.DB", builder)
		}
		oldQuery, oldExec := db.QueryLogFunc, db.ExecLogFunc
		db.QueryLogFunc = func(_ context.Context, _ time.Duration, statement string, _ *sql.Rows, _ error) {
			seen(statement)
		}
		db.ExecLogFunc = func(_ context.Context, _ time.Duration, statement string, _ sql.Result, _ error) {
			seen(statement)
		}
		defer func() { db.QueryLogFunc, db.ExecLogFunc = oldQuery, oldExec }()
	}
	fn()
	return int(n.Load())
}

// isInvoiceLinesRead matches a read of all lines of one invoice (salesDocLines).
func isInvoiceLinesRead(statement string) bool {
	return strings.Contains(statement, "FROM `books_invoice_lines` WHERE [[books_invoice_lines.invoice]]")
}

func TestDocDeferral_ABatchOfLineWritesStoresTheSameRowsAsSingleWrites(t *testing.T) {
	pe := costEnv(t)
	batched := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	single := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	for i, line := range pe.twelveLines() {
		mkInvoiceLine(t, pe.app, single, i, line)
	}

	pe.batchAsBookkeeper(t, http.StatusOK, []string{batched.Id},
		docLineCreateOps(t, invoiceKind, batched.Id, pe.twelveLines())...).run(t, pe.app)

	requireSameDocRows(t, pe.app, invoiceKind, batched.Id, single.Id)
	if got := docRevision(t, pe.app, "books_invoices", batched.Id); got != 2 {
		t.Errorf("revision = %d, want 2: one increase for the batch", got)
	}
	if reload(t, pe.app, "books_invoices", batched.Id).GetInt("total") == 0 {
		t.Error("total = 0, want the lines' total")
	}
}

func TestDocDeferral_ABatchReadsTheLinesAFixedNumberOfTimes(t *testing.T) {
	reads := func(lines int) int {
		pe := costEnv(t)
		inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
		ops := make([]string, lines)
		for i := range ops {
			ops[i] = invoiceLineCreateOp(inv.Id, pe.service, i, 100)
		}
		n := countStatements(t, pe.app, isInvoiceLinesRead, func() {
			pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id}, ops...).run(t, pe.app)
		})
		requireLineCount(t, pe.app, inv, int64(lines))
		return n
	}
	fifty, hundred := reads(50), reads(100)
	if fifty == 0 {
		t.Fatal("no read of the invoice's lines was counted: the statement text changed")
	}
	if fifty != hundred || fifty > 3 {
		t.Fatalf("reads of all lines: %d for 50 creates, %d for 100; want the same number, at most 3", fifty, hundred)
	}
}

func TestDocDeferral_ARefusedFinalStateChangesNothing(t *testing.T) {
	t.Run("a percent line with no target", func(t *testing.T) {
		pe := costEnv(t)
		inv := pe.mkInvoice(t, nil)
		pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{fmt.Sprintf(wantPercentTarget, 1)},
			docLineCreateOp(t, invoiceKind, inv.Id, 0, percentLine(pe.discount, -100000))).run(t, pe.app)
		requireLineCount(t, pe.app, inv, 0)
	})
	t.Run("a total past the limit", func(t *testing.T) {
		pe := costEnv(t)
		inv := pe.mkInvoice(t, nil)
		// Ten lines of 10^15 cents, the most one line holds: 10^16 is past 2^53-1.
		var ops []string
		for i := 0; i < 10; i++ {
			ops = append(ops, docLineCreateOp(t, invoiceKind, inv.Id, i, item(pe.service, bigQty, bigRate, false)))
		}
		pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{wantTotalTooLarge}, ops...).run(t, pe.app)
		requireLineCount(t, pe.app, inv, 0)
		requireInvoiceTotals(t, pe.app, inv.Id, 0, 0, 0)
	})
}

// itemThenPercent is a draft invoice with one item line and a percent line
// that applies to it; it returns the invoice and the item line.
func (pe *postingEnv) itemThenPercent(t testing.TB) (*core.Record, *core.Record) {
	t.Helper()
	inv := pe.mkInvoice(t, nil)
	first := mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 5000, false))
	mkInvoiceLine(t, pe.app, inv, 1, percentLine(pe.discount, 100000))
	return inv, first
}

// Decision F1: only the lines the batch leaves are checked.
func TestDocDeferral_AStateInBetweenIsNotChecked(t *testing.T) {
	pe := costEnv(t)
	inv, first := pe.itemThenPercent(t)

	pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id},
		docLineDeleteOp(invoiceKind, first.Id),
		docLineCreateOp(t, invoiceKind, inv.Id, 0, item(pe.service, 2, 500, false))).run(t, pe.app)

	lines, err := salesDocLines(pe.app, invoiceKind, inv.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || lines[0].GetInt("amount") != 1000 || lines[1].GetInt("amount") != 100 {
		t.Fatalf("lines = %v, want an item of 1000 and a percent line of 100", lineAmountsOf(lines))
	}
	requireInvoiceTotals(t, pe.app, inv.Id, 1100, 0, 1100)
}

func lineAmountsOf(lines []*core.Record) []int {
	out := make([]int, len(lines))
	for i, l := range lines {
		out[i] = l.GetInt("amount")
	}
	return out
}

// Decision F5: one REST write and a Go write check every state.
func TestDocDeferral_ASingleRequestAndAGoWriteKeepTheirRefusal(t *testing.T) {
	pe := costEnv(t)
	inv, first := pe.itemThenPercent(t)

	requireRefused(t, pe.app.Delete(first), fmt.Sprintf(wantPercentTarget, 1))
	apiReq{
		method: http.MethodDelete, url: "/api/collections/books_invoice_lines/records/" + first.Id,
		token: tokenFor(t, pe.users.bookkeeper), want: http.StatusBadRequest,
		content: []string{fmt.Sprintf(wantPercentTarget, 1)},
	}.run(t, pe.app)
	requireLineCount(t, pe.app, inv, 2)
}
