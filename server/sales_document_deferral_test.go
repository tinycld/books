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

// batchAs is one /api/batch call as user, with the operations in order.
func batchAs(t testing.TB, user *core.Record, want int, content []string, ops ...string) apiReq {
	t.Helper()
	return apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, user),
		body: batchBody(ops...), want: want, content: content,
	}
}

func (pe *postingEnv) batchAsBookkeeper(t *testing.T, want int, content []string, ops ...string) apiReq {
	t.Helper()
	return batchAs(t, pe.users.bookkeeper, want, content, ops...)
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

func docHeaderOp(kind salesDocKind, docID, body string) string {
	return fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/%s/records/%s","body":%s}`, kind.Collection, docID, body)
}

// threeLines are two items and a percent line that applies to the second.
func (pe *postingEnv) threeLines() []map[string]any {
	return []map[string]any{
		item(pe.service, 3, 45000, false),
		item(pe.accessPoint, 2, 18900, true),
		percentLine(pe.discount, -100000),
	}
}

// threeLineInvoice saves a draft with the Denver group and threeLines, each
// line a single write.
func (pe *postingEnv) threeLineInvoice(t testing.TB) *core.Record {
	t.Helper()
	inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	for i, line := range pe.threeLines() {
		mkInvoiceLine(t, pe.app, inv, i, line)
	}
	return inv
}

// requireSamePosting compares the tax lines and the journal lines of two
// posted invoices, in order.
func requireSamePosting(t testing.TB, app core.App, gotID, wantID string) {
	t.Helper()
	rows := func(collection, field, id string, cells ...string) string {
		records, err := app.FindRecordsByFilter(collection, field+" = {:id}", "position,id", 0, 0, dbx.Params{"id": id})
		if err != nil {
			t.Fatal(err)
		}
		out := make([]string, len(records))
		for i, r := range records {
			for _, cell := range cells {
				out[i] += r.GetString(cell) + " "
			}
		}
		return strings.Join(out, "| ")
	}
	got, want := reload(t, app, "books_invoices", gotID), reload(t, app, "books_invoices", wantID)
	if got.GetString("status") != statusPosted || want.GetString("status") != statusPosted {
		t.Fatalf("status = %s and %s, want both posted", got.GetString("status"), want.GetString("status"))
	}
	gotTax := rows("books_invoice_tax_lines", "invoice", gotID, "component", "rate_ppm", "taxable_amount", "amount")
	wantTax := rows("books_invoice_tax_lines", "invoice", wantID, "component", "rate_ppm", "taxable_amount", "amount")
	if wantTax == "" || gotTax != wantTax {
		t.Errorf("tax lines = %q, want %q", gotTax, wantTax)
	}
	gotEntry := rows("books_journal_lines", "entry", got.GetString("entry"), "account", "debit", "credit")
	wantEntry := rows("books_journal_lines", "entry", want.GetString("entry"), "account", "debit", "credit")
	if wantEntry == "" || gotEntry != wantEntry {
		t.Errorf("entry lines = %q, want %q", gotEntry, wantEntry)
	}
}

// Review Focus 4: the post reads settled lines, and the owner restates nothing
// after it.
func TestDocDeferral_APostInTheBatchReadsSettledLines(t *testing.T) {
	pe := costEnv(t)
	single := pe.threeLineInvoice(t)
	mustPostInvoice(t, pe.app, single.Id, pe.users.bookkeeper.Id)

	batched := bigInvoice(t, pe, 2)
	saw := docRevision(t, pe.app, "books_invoices", batched.Id)
	old, err := salesDocLines(pe.app, invoiceKind, batched.Id)
	if err != nil {
		t.Fatal(err)
	}
	ops := []string{docLineDeleteOp(invoiceKind, old[1].Id), docLineDeleteOp(invoiceKind, old[0].Id)}
	ops = append(ops, docLineCreateOps(t, invoiceKind, batched.Id, pe.threeLines())...)
	ops = append(ops, docHeaderOp(invoiceKind, batched.Id, fmt.Sprintf(`{"status":"posted","revision":%d}`, saw+1)))

	pe.batchAsBookkeeper(t, http.StatusOK, []string{`"status":"posted"`}, ops...).run(t, pe.app)

	requireSameDocRows(t, pe.app, invoiceKind, batched.Id, single.Id)
	requireSamePosting(t, pe.app, batched.Id, single.Id)
	if got := docRevision(t, pe.app, "books_invoices", batched.Id); got != saw+1 {
		t.Errorf("revision = %d, want %d", got, saw+1)
	}
	requireNoDrift(t, pe.app)
}

func TestDocDeferral_AHeaderSaveInTheBatchKeepsOneRevision(t *testing.T) {
	pe := costEnv(t)
	single := pe.threeLineInvoice(t)
	batched := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	saw := docRevision(t, pe.app, "books_invoices", batched.Id)
	ops := docLineCreateOps(t, invoiceKind, batched.Id, pe.threeLines())
	ops = append(ops, docHeaderOp(invoiceKind, batched.Id, fmt.Sprintf(`{"memo":"October work","revision":%d}`, saw+1)))

	pe.batchAsBookkeeper(t, http.StatusOK, []string{"October work"}, ops...).run(t, pe.app)

	requireSameDocRows(t, pe.app, invoiceKind, batched.Id, single.Id)
	saved := reload(t, pe.app, "books_invoices", batched.Id)
	if saved.GetInt("revision") != saw+1 || saved.GetString("memo") != "October work" {
		t.Errorf("revision/memo = %d/%q, want %d/October work", saved.GetInt("revision"), saved.GetString("memo"), saw+1)
	}
}

// The header write settles the lines itself, so the owner does not save the
// header a second time (each header save rewrites the search index).
func TestDocDeferral_AHeaderSaveInTheBatchSavesTheHeaderOneTime(t *testing.T) {
	pe := costEnv(t)
	inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	ops := docLineCreateOps(t, invoiceKind, inv.Id, pe.threeLines())
	ops = append(ops, docHeaderOp(invoiceKind, inv.Id, fmt.Sprintf(`{"memo":"October work","revision":%d}`, saw+1)))

	saves := countStatements(t, pe.app,
		func(statement string) bool { return strings.HasPrefix(statement, "UPDATE `books_invoices` SET") },
		func() { pe.batchAsBookkeeper(t, http.StatusOK, []string{"October work"}, ops...).run(t, pe.app) })

	if saves != 1 {
		t.Fatalf("%d saves of the header, want 1", saves)
	}
}

// An invoice made from an estimate closes it inside the invoice's create. The
// owner restates no closed estimate, so the close settles the lines.
func TestDocDeferral_AnEstimateClosedInTheBatchKeepsSettledLines(t *testing.T) {
	ce := newConversionEnv(t)
	enableBatch(t, ce.app)
	est := ce.mkEstimate(t, nil) // one item line of 450.00
	ops := []string{
		docLineCreateOp(t, estimateKind, est.Id, 1, percentLine(ce.service, -100000)),
		docLineCreateOp(t, estimateKind, est.Id, 2, subtotalLine()),
		fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_invoices/records","body":{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","estimate":%q}}`,
			ce.customer.Id, est.Id),
	}

	batchAs(t, ce.users.bookkeeper, http.StatusOK, []string{est.Id}, ops...).run(t, ce.app)

	closed := reload(t, ce.app, "books_estimates", est.Id)
	if closed.GetString("status") != statusClosed {
		t.Fatalf("status = %s, want closed", closed.GetString("status"))
	}
	lines, err := salesDocLines(ce.app, estimateKind, est.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprint(lineAmountsOf(lines)); got != "[45000 -4500 40500]" {
		t.Errorf("line amounts = %s, want [45000 -4500 40500]", got)
	}
	if closed.GetInt("subtotal") != 40500 || closed.GetInt("total") != 40500 {
		t.Errorf("subtotal/total = %d/%d, want 40500/40500", closed.GetInt("subtotal"), closed.GetInt("total"))
	}
}

func TestDocDeferral_LineWritesAfterTheHeaderWriteAreSettled(t *testing.T) {
	pe := costEnv(t)
	single := pe.threeLineInvoice(t)
	batched := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	mkInvoiceLine(t, pe.app, batched, 0, pe.threeLines()[0])
	saw := docRevision(t, pe.app, "books_invoices", batched.Id)
	ops := []string{
		docHeaderOp(invoiceKind, batched.Id, fmt.Sprintf(`{"memo":"header first","revision":%d}`, saw+1)),
		docLineCreateOp(t, invoiceKind, batched.Id, 1, pe.threeLines()[1]),
		docLineCreateOp(t, invoiceKind, batched.Id, 2, pe.threeLines()[2]),
	}

	pe.batchAsBookkeeper(t, http.StatusOK, []string{"header first"}, ops...).run(t, pe.app)

	requireSameDocRows(t, pe.app, invoiceKind, batched.Id, single.Id)
	if got := docRevision(t, pe.app, "books_invoices", batched.Id); got != saw+1 {
		t.Errorf("revision = %d, want %d", got, saw+1)
	}
}

// Review Focus 2: the client's delete of a draft.
func TestDocDeferral_ADeleteOfTheDocumentAfterItsLines(t *testing.T) {
	pe := costEnv(t)
	inv := pe.threeLineInvoice(t)
	lines, err := salesDocLines(pe.app, invoiceKind, inv.Id)
	if err != nil {
		t.Fatal(err)
	}
	var ops []string
	for i := len(lines) - 1; i >= 0; i-- {
		ops = append(ops, docLineDeleteOp(invoiceKind, lines[i].Id))
	}
	ops = append(ops, fmt.Sprintf(`{"method":"DELETE","url":"/api/collections/books_invoices/records/%s"}`, inv.Id))

	pe.batchAsBookkeeper(t, http.StatusOK, nil, ops...).run(t, pe.app)

	requireLineCount(t, pe.app, inv, 0)
	if _, err := pe.app.FindRecordById("books_invoices", inv.Id); err == nil {
		t.Fatal("the invoice is still stored")
	}
}

// Review Focus 3: each document has its own owner.
func TestDocDeferral_TwoDocumentsInOneBatch(t *testing.T) {
	pe := costEnv(t)
	single := pe.threeLineInvoice(t)
	a := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	b := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	var ops []string
	for i, line := range pe.threeLines() {
		ops = append(ops, docLineCreateOp(t, invoiceKind, a.Id, i, line), docLineCreateOp(t, invoiceKind, b.Id, i, line))
	}

	pe.batchAsBookkeeper(t, http.StatusOK, []string{a.Id, b.Id}, ops...).run(t, pe.app)

	requireSameDocRows(t, pe.app, invoiceKind, a.Id, single.Id)
	requireSameDocRows(t, pe.app, invoiceKind, b.Id, single.Id)
	for _, id := range []string{a.Id, b.Id} {
		if got := docRevision(t, pe.app, "books_invoices", id); got != 2 {
			t.Errorf("revision of %s = %d, want 2", id, got)
		}
	}
}

func TestDocDeferral_AnEstimateAndASalesReceipt(t *testing.T) {
	// The receipt env has no discount product; any product names a percent line.
	lines := func(re *receiptEnv) []map[string]any {
		return []map[string]any{
			item(re.service, 3, 45000, false),
			item(re.accessPoint, 2, 18900, true),
			percentLine(re.service, -100000),
			subtotalLine(),
			percentLine(re.service, 50000),
			descriptionLine("Work done at the annex office."),
			item(re.service, 1.5, 28000, true),
		}
	}
	check := func(t *testing.T, re *receiptEnv, kind salesDocKind, batched, single *core.Record) {
		t.Helper()
		enableBatch(t, re.app)
		for i, line := range lines(re) {
			line[kind.ParentField], line["position"] = single.Id, i
			if _, err := saveNew(re.app, kind.LinesCollection, line); err != nil {
				t.Fatalf("save line %d: %v", i+1, err)
			}
		}
		before := docRevision(t, re.app, kind.Collection, batched.Id)

		batchAs(t, re.users.bookkeeper, http.StatusOK, []string{batched.Id},
			docLineCreateOps(t, kind, batched.Id, lines(re))...).run(t, re.app)

		requireSameDocRows(t, re.app, kind, batched.Id, single.Id)
		if reload(t, re.app, kind.Collection, batched.Id).GetInt("total") == 0 {
			t.Error("total = 0, want the lines' total")
		}
		if got := docRevision(t, re.app, kind.Collection, batched.Id); got != before+1 {
			t.Errorf("revision = %d, want %d", got, before+1)
		}
	}
	t.Run("estimate", func(t *testing.T) {
		ee := newEstimateEnv(t)
		fields := map[string]any{"tax_rate": ee.denver.Id}
		check(t, ee.receiptEnv, estimateKind, ee.mkEstimate(t, fields), ee.mkEstimate(t, fields))
	})
	t.Run("sales receipt", func(t *testing.T) {
		re := newReceiptEnv(t)
		fields := map[string]any{"tax_rate": re.denver.Id}
		check(t, re, salesReceiptKind, re.mkReceipt(t, fields), re.mkReceipt(t, fields))
	})
}

// The short path stores an item's own amount, so it holds the line to the
// line limit itself: the schema's max would refuse it first with its own text.
func TestDocDeferral_ALinePastTheLineLimitKeepsItsText(t *testing.T) {
	pe := costEnv(t)
	inv := pe.mkInvoice(t, nil)
	pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{fmt.Sprintf(wantLineTooLarge, 4)},
		docLineCreateOp(t, invoiceKind, inv.Id, 3, item(pe.service, bigQty, bigRate+1, false))).run(t, pe.app)
	requireLineCount(t, pe.app, inv, 0)
}

// requireNoDeferralMarks fails when a deferring or dirty mark of any
// transaction is left: the marks are process-wide and keyed by transaction, so
// a later request never reads a leaked one and only this count shows it.
func requireNoDeferralMarks(t testing.TB) {
	t.Helper()
	txMarks.Range(func(key, _ any) bool {
		name := key.(txMarkKey).name
		if strings.HasSuffix(name, ".deferring") || strings.HasSuffix(name, ".dirty") {
			t.Errorf("mark %s of %s is left after the batch", name, key.(txMarkKey).id)
		}
		return true
	})
}

func TestDocDeferral_TheMarksDoNotOutliveTheBatch(t *testing.T) {
	deleteFirst := func(t *testing.T, pe *postingEnv, first *core.Record) apiReq {
		return apiReq{
			method: http.MethodDelete, url: "/api/collections/books_invoice_lines/records/" + first.Id,
			token: tokenFor(t, pe.users.bookkeeper), want: http.StatusBadRequest,
			content: []string{fmt.Sprintf(wantPercentTarget, 1)},
		}
	}
	t.Run("after a batch that commits", func(t *testing.T) {
		pe := costEnv(t)
		inv, first := pe.itemThenPercent(t)
		batch := pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id},
			docLineCreateOp(t, invoiceKind, inv.Id, 2, item(pe.service, 1, 100, false)))
		apiSeq(t, pe.app, batch, deleteFirst(t, pe, first))
		requireLineCount(t, pe.app, inv, 3)
		requireNoDeferralMarks(t)
	})
	t.Run("after a batch whose later operation is refused", func(t *testing.T) {
		pe := costEnv(t)
		inv, _ := pe.itemThenPercent(t)
		pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{fmt.Sprintf(wantNeedsProduct, 4)},
			docLineCreateOp(t, invoiceKind, inv.Id, 2, item(pe.service, 1, 100, false)),
			docLineCreateOp(t, invoiceKind, inv.Id, 3, map[string]any{"kind": "item", "quantity": 1, "rate": 100})).run(t, pe.app)
		requireLineCount(t, pe.app, inv, 2)
		requireNoDeferralMarks(t)
	})
	t.Run("after a batch that is refused", func(t *testing.T) {
		pe := costEnv(t)
		inv, first := pe.itemThenPercent(t)
		batch := pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{fmt.Sprintf(wantPercentTarget, 1)},
			docLineDeleteOp(invoiceKind, first.Id))
		apiSeq(t, pe.app, batch, deleteFirst(t, pe, first))
		requireLineCount(t, pe.app, inv, 2)
		requireNoDeferralMarks(t)
	})
}

func docLineUpdateOp(kind salesDocKind, lineID, body string) string {
	return fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/%s/records/%s","body":%s}`, kind.LinesCollection, lineID, body)
}

// The client writes updates by position. Stored: a note, an item, a percent
// line of the item. The note moves to the end. After the first update the item
// and the note are both at position 0; the item's id sorts first (the ids are
// fixed for that), so the percent line has the note above it, a state a single
// write refuses.
func TestDocDeferral_AMoveThroughAStateThatIsNotValid(t *testing.T) {
	pe := costEnv(t)
	inv := pe.mkInvoice(t, nil)
	withID := func(id string, fields map[string]any) map[string]any {
		fields["id"] = id
		return fields
	}
	note := mkInvoiceLine(t, pe.app, inv, 0, withID("moveline0000002", descriptionLine("Note")))
	first := mkInvoiceLine(t, pe.app, inv, 1, withID("moveline0000001", item(pe.service, 1, 5000, false)))
	percent := mkInvoiceLine(t, pe.app, inv, 2, percentLine(pe.discount, 100000))
	requireRefused(t, setFields(t, pe.app, "books_invoice_lines", first.Id, map[string]any{"position": 0}),
		fmt.Sprintf(wantPercentTarget, 3))

	pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id},
		docLineUpdateOp(invoiceKind, first.Id, `{"position":0}`),
		docLineUpdateOp(invoiceKind, percent.Id, `{"position":1}`),
		docLineUpdateOp(invoiceKind, note.Id, `{"position":2}`)).run(t, pe.app)

	lines, err := salesDocLines(pe.app, invoiceKind, inv.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 3 || lines[0].Id != first.Id || lines[1].Id != percent.Id || lines[2].Id != note.Id {
		t.Fatalf("the lines are not in the order item, percent, note")
	}
	if got := fmt.Sprint(lineAmountsOf(lines)); got != "[5000 500 0]" {
		t.Errorf("line amounts = %s, want [5000 500 0]", got)
	}
	requireInvoiceTotals(t, pe.app, inv.Id, 5500, 0, 5500)
}

// Stored: one line of 100.00, not taxable, under the Denver group. The save
// adds a taxable credit of -95.00 and removes the tax. With the stored tax the
// credit's own tax takes the total below zero; with no tax the total is 5.00.
func taxChangeOps(t *testing.T, pe *postingEnv, headerBody func(revision int) string) (*core.Record, int, []string) {
	t.Helper()
	inv := pe.mkInvoice(t, map[string]any{"tax_rate": pe.denverByAgency.Id})
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 10000, false))
	saw := docRevision(t, pe.app, "books_invoices", inv.Id)
	return inv, saw, []string{
		docLineCreateOp(t, invoiceKind, inv.Id, 1, item(pe.service, 1, -9500, true)),
		docHeaderOp(invoiceKind, inv.Id, headerBody(saw+1)),
	}
}

func TestDocDeferral_ATaxChangeWithTheHeaderLast(t *testing.T) {
	pe := costEnv(t)
	inv, saw, ops := taxChangeOps(t, pe, func(revision int) string {
		return fmt.Sprintf(`{"tax_rate":"","revision":%d}`, revision)
	})

	pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id}, ops...).run(t, pe.app)

	requireInvoiceTotals(t, pe.app, inv.Id, 500, 0, 500)
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != saw+1 {
		t.Errorf("revision = %d, want %d", got, saw+1)
	}
}

func TestDocDeferral_ATaxChangeAndThePostWithTheHeaderLast(t *testing.T) {
	pe := costEnv(t)
	inv, saw, ops := taxChangeOps(t, pe, func(revision int) string {
		return fmt.Sprintf(`{"tax_rate":"","status":"posted","revision":%d}`, revision)
	})

	pe.batchAsBookkeeper(t, http.StatusOK, []string{`"status":"posted"`}, ops...).run(t, pe.app)

	requireInvoiceTotals(t, pe.app, inv.Id, 500, 0, 500)
	if got := docRevision(t, pe.app, "books_invoices", inv.Id); got != saw+1 {
		t.Errorf("revision = %d, want %d", got, saw+1)
	}
	requireNoDrift(t, pe.app)
}

// The count of lines runs at each create, on the lines stored then: a save
// sends its removes before its inserts.
func TestDocDeferral_AtTheLineLimitTheRemoveGoesFirst(t *testing.T) {
	ops := func(t *testing.T, pe *postingEnv) (*core.Record, string, string) {
		t.Helper()
		inv := bigInvoice(t, pe, maxDocumentLines)
		lines, err := salesDocLines(pe.app, invoiceKind, inv.Id)
		if err != nil {
			t.Fatal(err)
		}
		return inv, docLineDeleteOp(invoiceKind, lines[0].Id), invoiceLineCreateOp(inv.Id, pe.service, maxDocumentLines, 200)
	}
	t.Run("the remove first is accepted", func(t *testing.T) {
		pe := costEnv(t)
		inv, remove, insert := ops(t, pe)
		pe.batchAsBookkeeper(t, http.StatusOK, []string{inv.Id}, remove, insert).run(t, pe.app)
		requireLineCount(t, pe.app, inv, maxDocumentLines)
	})
	t.Run("the insert first is refused", func(t *testing.T) {
		pe := costEnv(t)
		inv, remove, insert := ops(t, pe)
		pe.batchAsBookkeeper(t, http.StatusBadRequest, []string{wantTooManyLines}, insert, remove).run(t, pe.app)
		requireLineCount(t, pe.app, inv, maxDocumentLines)
	})
}
