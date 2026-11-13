package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The refusal texts of the estimate guards, as the client gets them (PocketBase
// adds a final period). Written out here, not read from the consts, so a change
// of wording fails this file too. The shared day and tax rate texts are
// wantDocumentDay and wantDocumentTaxInactive (sales_receipts_test.go).
const (
	wantEstimateTotalNegative     = "An estimate total cannot be below zero."
	wantEstimateTotalTooLarge     = "The estimate total is more than Books can store."
	wantEstimateTooManyLines      = "An estimate can have at most 250 lines."
	wantEstimateLineStays         = "A line stays on its estimate."
	wantEstimateClosesFromInvoice = "An estimate closes only when an invoice is made from it."
	wantEstimateClosedUnchanged   = "A closed estimate cannot be changed."
	wantEstimateClosedNoDelete    = "A closed estimate cannot be deleted."
	wantEstimateClosedLines       = "The lines of a closed estimate cannot change."
	wantExpirationBeforeDate      = "Expiration date can't be before the estimate date."
	wantAcceptedDateRequired      = "Enter the accepted date."
	estimateTestDay               = "2026-11-04"
	estimateSequenceID            = "booksseqestimat"
)

// estimateEnv is the e2e chart, products, tax rates and Harborview Dental of
// receiptEnvOn, on an app with the ledger hooks and the estimate guards bound
// and the generated books:estimate host bound, so the line guard reads its row
// kinds. An estimate never posts: every test on it ends with no journal entry.
type estimateEnv struct {
	*receiptEnv
}

func newEstimateEnv(t *testing.T) *estimateEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, estimateKind)
	bindEstimateHost(t, app)
	requireNoEntriesAtEnd(t, app)
	return &estimateEnv{receiptEnv: receiptEnvOn(t, app)}
}

// requireNoEntriesAtEnd fails the test when, at its end, the book holds any
// journal entry: spec §3.11, estimates never post. The cleanup runs before the
// app's own, which newBooksApp registered first.
func requireNoEntriesAtEnd(t *testing.T, app core.App) {
	t.Helper()
	t.Cleanup(func() {
		n, err := app.CountRecords("books_journal_entries")
		if err != nil || n != 0 {
			t.Errorf("%d journal entries (err %v) after estimate writes, want 0: an estimate never posts", n, err)
		}
	})
}

// newEstimate saves an estimate through the app, so every guard runs, with the
// fields given over a valid Pending estimate for Harborview Dental, and returns
// what the guards said.
func (ee *estimateEnv) newEstimate(fields map[string]any) (*core.Record, error) {
	all := map[string]any{"customer": ee.customer.Id, "status": "pending", "date": estimateTestDay}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(ee.app, "books_estimates", all)
}

func (ee *estimateEnv) mkEstimate(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := ee.newEstimate(fields)
	if err != nil {
		t.Fatalf("save an estimate: %v", err)
	}
	return r
}

// newEstimateLine saves one line of estimate at position through the app, so
// every guard and the restatement run.
func newEstimateLine(app core.App, estimate *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"estimate": estimate.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_estimate_lines", all)
}

func mkEstimateLine(t testing.TB, app core.App, estimate *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newEstimateLine(app, estimate, position, fields)
	if err != nil {
		t.Fatalf("save estimate line %d: %v", position+1, err)
	}
	return r
}

// mkEstimateRow saves a Pending estimate with saveRecord on an app whose
// estimate guards may not be bound (the delete-guard tests of customers,
// products and tax rates), with the fields given over a valid row.
func mkEstimateRow(t testing.TB, app core.App, customer *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"customer": customer.Id, "status": "pending", "date": estimateTestDay, "currency": "USD",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveRecord(t, app, "books_estimates", all)
}

func requireEstimateTotals(t testing.TB, app core.App, id string, subtotal, tax, total int) {
	t.Helper()
	r := reload(t, app, "books_estimates", id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("tax_total"), r.GetInt("total")}; got != [3]int{subtotal, tax, total} {
		t.Errorf("estimate subtotal/tax_total/total = %v, want %v", got, [3]int{subtotal, tax, total})
	}
}

func requireEstimateLineCount(t testing.TB, app core.App, estimate *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_estimate_lines", dbx.HashExp{"estimate": estimate.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the estimate, want %d", n, want)
	}
}

func requireEstimateCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_estimates")
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d estimates stored, want %d", n, want)
	}
}

func estimateNextNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", estimateSequenceID).GetInt("next_number")
}

func requireEstimateNumber(t testing.TB, app core.App, id, number string, sequence int) {
	t.Helper()
	r := reload(t, app, "books_estimates", id)
	if r.GetString("number") != number || r.GetInt("sequence") != sequence {
		t.Errorf("estimate number %q sequence %d, want %q and %d", r.GetString("number"), r.GetInt("sequence"), number, sequence)
	}
}

// closeEstimate stores status closed as checkpoint 3's conversion will: a Go
// save under the converting mark, the only path the guards let close an
// estimate. The mark is cleared before the function returns.
func closeEstimate(t testing.TB, app core.App, id string) {
	t.Helper()
	done := markConverting(app, id)
	defer done()
	r := reload(t, app, "books_estimates", id)
	r.Set("status", "closed")
	if err := app.Save(r); err != nil {
		t.Fatalf("close the estimate under the converting mark: %v", err)
	}
	if got := reload(t, app, "books_estimates", id).GetString("status"); got != "closed" {
		t.Fatalf("status = %q after closing, want closed", got)
	}
}

// Spec §3.6: there is no draft. The create takes the next estimate number in
// the same write.
func TestEstimate_CreateTakesTheNextNumber(t *testing.T) {
	ee := newEstimateEnv(t)
	first := ee.mkEstimate(t, nil)
	requireEstimateNumber(t, ee.app, first.Id, "1001", 1001)
	if got := reload(t, ee.app, "books_estimates", first.Id).GetString("status"); got != "pending" {
		t.Errorf("status = %q, want pending", got)
	}
	second := ee.mkEstimate(t, nil)
	requireEstimateNumber(t, ee.app, second.Id, "1002", 1002)
	if next := estimateNextNumber(t, ee.app); next != 1003 {
		t.Errorf("estimate next_number = %d, want 1003", next)
	}
}

func TestEstimate_RefusedCreateTakesNoNumber(t *testing.T) {
	ee := newEstimateEnv(t)
	oldMill := mkCustomer(t, ee.app, "Old Mill Bakery", "")
	if err := setCustomer(t, ee.app, oldMill.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Old Mill Bakery inactive: %v", err)
	}
	_, err := ee.newEstimate(map[string]any{"customer": oldMill.Id})
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))
	requireEstimateCount(t, ee.app, 0)
	if next := estimateNextNumber(t, ee.app); next != 1001 {
		t.Errorf("estimate next_number = %d after a refused create, want 1001", next)
	}
	r := ee.mkEstimate(t, nil)
	requireEstimateNumber(t, ee.app, r.Id, "1001", 1001)
}

func TestEstimate_AcceptedCreateKeepsTheAcceptance(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, map[string]any{
		"status": "accepted", "accepted_by": "Dr. Lena Ortiz", "accepted_date": "2026-11-05",
	})
	stored := reload(t, ee.app, "books_estimates", r.Id)
	if stored.GetString("status") != "accepted" || stored.GetString("accepted_by") != "Dr. Lena Ortiz" ||
		stored.GetString("accepted_date") != "2026-11-05" {
		t.Errorf("stored status %q accepted_by %q accepted_date %q, want accepted, Dr. Lena Ortiz, 2026-11-05",
			stored.GetString("status"), stored.GetString("accepted_by"), stored.GetString("accepted_date"))
	}
}

func TestEstimate_AcceptedNeedsTheAcceptedDate(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{"status": "accepted", "accepted_by": "Dr. Lena Ortiz"})
	requireFieldRefusal(t, err, "accepted_date", wantAcceptedDateRequired)
	requireEstimateCount(t, ee.app, 0)
}

// Spec §3.3: the server clears Accepted by and Accepted date when the status
// leaves accepted for pending or rejected.
func TestEstimate_LeavingAcceptedClearsTheAcceptance(t *testing.T) {
	for _, to := range []string{"pending", "rejected"} {
		t.Run(to, func(t *testing.T) {
			ee := newEstimateEnv(t)
			r := ee.mkEstimate(t, map[string]any{
				"status": "accepted", "accepted_by": "Dr. Lena Ortiz", "accepted_date": "2026-11-05",
			})
			if err := setFields(t, ee.app, "books_estimates", r.Id, map[string]any{"status": to}); err != nil {
				t.Fatalf("set the accepted estimate to %s: %v", to, err)
			}
			stored := reload(t, ee.app, "books_estimates", r.Id)
			if stored.GetString("status") != to || stored.GetString("accepted_by") != "" || stored.GetString("accepted_date") != "" {
				t.Errorf("stored status %q accepted_by %q accepted_date %q, want %s with both acceptance fields empty",
					stored.GetString("status"), stored.GetString("accepted_by"), stored.GetString("accepted_date"), to)
			}
		})
	}
}

func TestEstimate_StatusChangesFreely(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	for _, step := range []map[string]any{
		{"status": "accepted", "accepted_date": "2026-11-05"},
		{"status": "rejected"},
		{"status": "pending"},
	} {
		if err := setFields(t, ee.app, "books_estimates", r.Id, step); err != nil {
			t.Fatalf("set the estimate to %v: %v", step["status"], err)
		}
		if got := reload(t, ee.app, "books_estimates", r.Id).GetString("status"); got != step["status"] {
			t.Errorf("status = %q, want %v", got, step["status"])
		}
	}
	requireEstimateNumber(t, ee.app, r.Id, "1001", 1001)
}

func TestEstimate_ClosedOnlyFromAnInvoice(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{"status": "closed"})
	requireRefusalText(t, err, wantEstimateClosesFromInvoice)
	requireEstimateCount(t, ee.app, 0)

	r := ee.mkEstimate(t, nil)
	err = setFields(t, ee.app, "books_estimates", r.Id, map[string]any{"status": "closed"})
	requireRefusalText(t, err, wantEstimateClosesFromInvoice)
	if got := reload(t, ee.app, "books_estimates", r.Id).GetString("status"); got != "pending" {
		t.Errorf("status = %q after the refusal, want pending", got)
	}
}

func TestEstimate_ClosedEstimateIsFrozen(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, map[string]any{"memo": "Annex quote"})
	mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 45000, false))
	closeEstimate(t, ee.app, r.Id)

	for name, fields := range map[string]map[string]any{
		"a memo edit":       {"memo": "Changed after closing"},
		"a status change":   {"status": "pending"},
		"an accepted reset": {"status": "accepted", "accepted_date": "2026-11-05"},
	} {
		t.Run(name, func(t *testing.T) {
			err := setFields(t, ee.app, "books_estimates", r.Id, fields)
			requireRefusalText(t, err, wantEstimateClosedUnchanged)
			stored := reload(t, ee.app, "books_estimates", r.Id)
			if stored.GetString("status") != "closed" || stored.GetString("memo") != "Annex quote" {
				t.Errorf("stored status %q memo %q after the refusal, want closed and Annex quote",
					stored.GetString("status"), stored.GetString("memo"))
			}
		})
	}

	requireRefusalText(t, ee.app.Delete(reload(t, ee.app, "books_estimates", r.Id)), wantEstimateClosedNoDelete)
	if _, err := ee.app.FindRecordById("books_estimates", r.Id); err != nil {
		t.Fatalf("the closed estimate is gone: %v", err)
	}
	requireEstimateLineCount(t, ee.app, r, 1)
}

func TestEstimateLine_RefusedOnClosedEstimate(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	line := mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 45000, false))
	closeEstimate(t, ee.app, r.Id)

	_, err := newEstimateLine(ee.app, r, 1, item(ee.service, 1, 100, false))
	requireRefusalText(t, err, wantEstimateClosedLines)
	err = setFields(t, ee.app, "books_estimate_lines", line.Id, map[string]any{"quantity": 2})
	requireRefusalText(t, err, wantEstimateClosedLines)
	err = ee.app.Delete(reload(t, ee.app, "books_estimate_lines", line.Id))
	requireRefusalText(t, err, wantEstimateClosedLines)

	requireEstimateLineCount(t, ee.app, r, 1)
	if got := reload(t, ee.app, "books_estimate_lines", line.Id).GetFloat("quantity"); got != 1 {
		t.Errorf("quantity = %v after the refusal, want 1", got)
	}
	requireEstimateTotals(t, ee.app, r.Id, 45000, 0, 45000)
}

// Spec §3.6: a deleted estimate leaves a gap; numbers are never reused.
func TestEstimate_DeleteCascadesAndKeepsTheNumber(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 45000, false))
	mkEstimateLine(t, ee.app, r, 1, descriptionLine("Annex"))
	requireEstimateNumber(t, ee.app, r.Id, "1001", 1001)

	if err := ee.app.Delete(reload(t, ee.app, "books_estimates", r.Id)); err != nil {
		t.Fatalf("delete a pending estimate: %v", err)
	}
	if _, err := ee.app.FindRecordById("books_estimates", r.Id); err == nil {
		t.Error("the deleted estimate is still there")
	}
	requireEstimateLineCount(t, ee.app, r, 0)

	next := ee.mkEstimate(t, nil)
	requireEstimateNumber(t, ee.app, next.Id, "1002", 1002)
}

// Spec §3.6: Delete is allowed while no invoice names the estimate. The refusal
// names the newest invoice that does; a draft has no number yet.
func TestEstimate_DeleteRefusedWhileAVoidInvoiceNamesIt(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	inv := ce.post(t, ce.convert(t, est, nil))
	ce.void(t, inv)
	if err := setFields(t, ce.app, "books_estimates", est.Id, map[string]any{"status": statusRejected}); err != nil {
		t.Fatalf("set the reopened estimate to rejected: %v", err)
	}

	err := ce.app.Delete(reload(t, ce.app, "books_estimates", est.Id))
	requireRefusalText(t, err, fmt.Sprintf("Estimate %s has invoice %s. Set it to Rejected instead.",
		est.GetString("number"), inv.GetString("number")))
	if _, err := ce.app.FindRecordById("books_estimates", est.Id); err != nil {
		t.Fatalf("the refused estimate is gone: %v", err)
	}
	requireEstimateLineCount(t, ce.app, est, 1)
}

func TestEstimate_DeleteRefusedWhileADraftInvoiceNamesIt(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	ce.convert(t, est, nil)
	// No person can reopen a closed estimate; the test forces it with a Go save
	// under the converting mark, so only the naming draft invoice can refuse.
	done := markConverting(ce.app, est.Id)
	forced := reload(t, ce.app, "books_estimates", est.Id)
	forced.Set("status", statusRejected)
	err := ce.app.Save(forced)
	done()
	if err != nil {
		t.Fatalf("force the estimate to rejected: %v", err)
	}

	err = ce.app.Delete(reload(t, ce.app, "books_estimates", est.Id))
	requireRefusalText(t, err, fmt.Sprintf("Estimate %s has a draft invoice. Set it to Rejected instead.",
		est.GetString("number")))
	if _, err := ce.app.FindRecordById("books_estimates", est.Id); err != nil {
		t.Fatalf("the refused estimate is gone: %v", err)
	}
	requireEstimateLineCount(t, ce.app, est, 1)
}

func TestEstimate_ExpirationNotBeforeTheDate(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{"date": "2026-11-04", "expiration_date": "2026-11-03"})
	requireFieldRefusal(t, err, "expiration_date", wantExpirationBeforeDate)
	requireEstimateCount(t, ee.app, 0)

	same := ee.mkEstimate(t, map[string]any{"date": "2026-11-04", "expiration_date": "2026-11-04"})
	if got := reload(t, ee.app, "books_estimates", same.Id).GetString("expiration_date"); got != "2026-11-04" {
		t.Errorf("expiration_date = %q, want 2026-11-04", got)
	}
	none := ee.mkEstimate(t, map[string]any{"expiration_date": ""})
	if got := reload(t, ee.app, "books_estimates", none.Id).GetString("expiration_date"); got != "" {
		t.Errorf("expiration_date = %q, want none", got)
	}
}

func TestEstimate_RefusesABadExpirationDate(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{"expiration_date": "2026-13-40"})
	requireFieldRefusal(t, err, "expiration_date", wantDocumentDay)
	requireEstimateCount(t, ee.app, 0)
}

func TestEstimate_RefusesNegativeTotal(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	mkEstimateLine(t, ee.app, r, 0, item(ee.service, 1, 1000, false))

	_, err := newEstimateLine(ee.app, r, 1, item(ee.service, 1, -1001, false))
	requireRefusalText(t, err, wantEstimateTotalNegative)
	requireEstimateLineCount(t, ee.app, r, 1)
	requireEstimateTotals(t, ee.app, r.Id, 1000, 0, 1000)
}

func TestEstimate_RefusesTooLargeTotal(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	for i := 0; i < 9; i++ {
		mkEstimateLine(t, ee.app, r, i, item(ee.service, bigQty, bigRate, false))
	}
	requireEstimateTotals(t, ee.app, r.Id, 9_000_000_000_000_000, 0, 9_000_000_000_000_000)

	_, err := newEstimateLine(ee.app, r, 9, item(ee.service, bigQty, bigRate, false))
	requireRefusalText(t, err, wantEstimateTotalTooLarge)
	requireEstimateLineCount(t, ee.app, r, 9)
}

func TestEstimateLine_RefusesTheLine251st(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	requireNoEntriesAtEnd(t, app)
	re := receiptEnvOn(t, app)
	// 249 lines written before the guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	r := mkEstimateRow(t, app, re.customer, nil)
	for i := 0; i < 249; i++ {
		saveRecord(t, app, "books_estimate_lines", map[string]any{
			"estimate": r.Id, "kind": "description", "description": fmt.Sprintf("Note %d", i+1), "position": i,
		})
	}
	registerSalesDocGuards(app, estimateKind)
	bindEstimateHost(t, app)

	mkEstimateLine(t, app, r, 249, descriptionLine("Note 250"))
	_, err := newEstimateLine(app, r, 250, descriptionLine("Note 251"))
	requireRefusalText(t, err, wantEstimateTooManyLines)
	requireEstimateLineCount(t, app, r, 250)
}

func TestEstimate_RefusesInactiveTaxRate(t *testing.T) {
	ee := newEstimateEnv(t)
	boulder := mkTaxRate(t, ee.app, "Boulder city", 38600, ee.cityDept)
	if err := setTaxRate(t, ee.app, boulder.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Boulder city inactive: %v", err)
	}
	_, err := ee.newEstimate(map[string]any{"tax_rate": boulder.Id})
	requireFieldRefusal(t, err, "tax_rate", wantDocumentTaxInactive)
	requireEstimateCount(t, ee.app, 0)
}

func TestEstimateLine_StaysOnItsEstimate(t *testing.T) {
	ee := newEstimateEnv(t)
	first := ee.mkEstimate(t, nil)
	second := ee.mkEstimate(t, nil)
	line := mkEstimateLine(t, ee.app, first, 0, item(ee.service, 2, 45000, false))
	requireEstimateTotals(t, ee.app, first.Id, 90000, 0, 90000)

	err := setFields(t, ee.app, "books_estimate_lines", line.Id, map[string]any{"estimate": second.Id})
	requireRefusalText(t, err, wantEstimateLineStays)
	if got := reload(t, ee.app, "books_estimate_lines", line.Id).GetString("estimate"); got != first.Id {
		t.Errorf("line estimate = %q after the refusal, want the first estimate", got)
	}
	requireEstimateLineCount(t, ee.app, second, 0)
}

// The line guard reads the books:estimate host and the shared product checks.
func TestEstimateLine_RefusesAnInactiveProduct(t *testing.T) {
	ee := newEstimateEnv(t)
	r := ee.mkEstimate(t, nil)
	_, err := newEstimateLine(ee.app, r, 0, item(ee.retired, 1, 1000, false))
	requireRefusalText(t, err, wantProductInactive(1, "Old retainer"))
	requireEstimateLineCount(t, ee.app, r, 0)
}

func TestEstimate_SchemaRefusesALongAcceptedBy(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{
		"status": "accepted", "accepted_date": "2026-11-05", "accepted_by": strings.Repeat("x", 201),
	})
	requireSchemaRefusal(t, err, "accepted_by")
	requireEstimateCount(t, ee.app, 0)

	r := ee.mkEstimate(t, map[string]any{
		"status": "accepted", "accepted_date": "2026-11-05", "accepted_by": strings.Repeat("x", 200),
	})
	if got := len(reload(t, ee.app, "books_estimates", r.Id).GetString("accepted_by")); got != 200 {
		t.Errorf("accepted_by has %d characters, want 200", got)
	}
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestEstimate_ServerFieldsRefused(t *testing.T) {
	body := func(ee *estimateEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"pending","date":%q%s}`, ee.customer.Id, estimateTestDay, extra)
	}
	requireNoEstimate := func(t testing.TB, app *tests.TestApp) {
		if n, _ := app.CountRecords("books_estimates"); n != 0 {
			t.Errorf("%d estimates after a create that set a server field, want 0", n)
		}
	}

	t.Run("an estimate with no server field is created and numbered", func(t *testing.T) {
		ee := newEstimateEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_estimates/records",
			token: tokenFor(t, ee.users.bookkeeper), body: body(ee, ""), want: http.StatusOK,
			content: []string{`"number":"1001"`},
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_estimates"); n != 1 {
					t.Errorf("%d estimates after a valid create, want 1", n)
				}
			},
		}.run(t, ee.app)
	})

	for name, extra := range map[string]func(t testing.TB, ee *estimateEnv) string{
		"number":   func(testing.TB, *estimateEnv) string { return `,"number":"1001"` },
		"total":    func(testing.TB, *estimateEnv) string { return `,"total":100` },
		"currency": func(testing.TB, *estimateEnv) string { return `,"currency":"USD"` },
		// A real invoice, so only the rule can refuse the relation.
		"invoice": func(t testing.TB, ee *estimateEnv) string {
			return fmt.Sprintf(`,"invoice":%q`, mkInvoiceRow(t, ee.app, ee.customer, nil).Id)
		},
	} {
		t.Run(name, func(t *testing.T) {
			ee := newEstimateEnv(t)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_estimates/records",
				token: tokenFor(t, ee.users.bookkeeper), body: body(ee, extra(t, ee)), want: http.StatusBadRequest,
				after: requireNoEstimate,
			}.run(t, ee.app)
		})
	}
}

func TestEstimate_ReaderCannotCreate(t *testing.T) {
	ee := newEstimateEnv(t)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_estimates/records",
		token: tokenFor(t, ee.users.readOnly),
		body:  fmt.Sprintf(`{"customer":%q,"status":"pending","date":%q}`, ee.customer.Id, estimateTestDay),
		want:  http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_estimates"); n != 0 {
				t.Errorf("%d estimates after a reader's create, want 0", n)
			}
			if next := estimateNextNumber(t, app); next != 1001 {
				t.Errorf("estimate next_number = %d after a reader's create, want 1001", next)
			}
		},
	}.run(t, ee.app)
}
