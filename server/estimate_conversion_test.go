package books

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"tinycld.org/core/forms"
)

// Converting an estimate to an invoice (spec §3.7): the invoice's first save
// closes the estimate in the same transaction; deleting the draft invoice or
// voiding the posted one reopens it; a correction keeps it closed and, when it
// posts, the estimate moves to it. The texts are written out, not read from the
// consts, so a change of wording fails here too. PocketBase adds a final period
// to a text without one.
const (
	wantEstimateCustomer = "An invoice from an estimate bills the estimate's customer."
	wantKeepsEstimate    = "An invoice keeps the estimate it was made from."
)

func wantEstimateRejected(number string) string {
	return fmt.Sprintf("Estimate %s is rejected. Set it to Pending or Accepted to convert it.", number)
}

func wantAlreadyOnInvoice(estimate, invoice string) string {
	return fmt.Sprintf("Estimate %s is already on invoice %s.", estimate, invoice)
}

func wantAlreadyOnDraftInvoice(estimate string) string {
	return fmt.Sprintf("Estimate %s is already on a draft invoice.", estimate)
}

func wantEstimateCustomerInactive(name string) string {
	return name + " is inactive. Make the customer active to convert this estimate."
}

// conversionEnv is receiptEnv's book (Harborview Dental, the products, Denver
// combined, 1100 Accounts receivable) on an app with the ledger hooks, the
// invoice guards and the estimate guards bound, and both forms hosts bound in
// one call, as the server binds them at boot.
type conversionEnv struct {
	*receiptEnv
}

func newConversionEnv(t *testing.T) *conversionEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, estimateKind)
	bindHostsByKey(t, app, invoiceKind.HostKey, estimateKind.HostKey)
	return &conversionEnv{receiptEnv: receiptEnvOn(t, app)}
}

// bindHostsByKey binds the generated forms hosts named by keys in one call:
// core keeps one set of bound hosts per app.
func bindHostsByKey(t *testing.T, app core.App, keys ...string) {
	t.Helper()
	defs, err := forms.LoadHosts(generatedHostsPath)
	if err != nil {
		t.Fatalf("load the generated forms hosts: %v", err)
	}
	hosts := make([]forms.Host, 0, len(keys))
	for _, key := range keys {
		host := defs.Host(key)
		if host == nil {
			t.Fatalf("%s has no %s host: run `pnpm run packages:generate` in the tinycld repo", generatedHostsPath, key)
		}
		hosts = append(hosts, *host)
	}
	forms.BindHooks(app, &forms.Defs{Hosts: hosts})
}

// mkEstimate saves an estimate for Harborview Dental through the app, with the
// fields given over a valid Pending one, and one Monthly bookkeeping line.
func (ce *conversionEnv) mkEstimate(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"customer": ce.customer.Id, "status": statusPending, "date": estimateTestDay}
	for k, v := range fields {
		all[k] = v
	}
	r, err := saveNew(ce.app, "books_estimates", all)
	if err != nil {
		t.Fatalf("save an estimate: %v", err)
	}
	mkEstimateLine(t, ce.app, r, 0, item(ce.service, 1, 45000, false))
	return reload(t, ce.app, "books_estimates", r.Id)
}

func (ce *conversionEnv) mkAccepted(t testing.TB) *core.Record {
	t.Helper()
	return ce.mkEstimate(t, map[string]any{
		"status": statusAccepted, "accepted_by": "Dr. Lena Ortiz", "accepted_date": "2026-11-05",
	})
}

// newInvoiceFrom saves a draft invoice for Harborview Dental naming estimate,
// through the app, with the fields given, and returns what the guards said.
func (ce *conversionEnv) newInvoiceFrom(estimate *core.Record, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"estimate": estimate.Id}
	for k, v := range fields {
		all[k] = v
	}
	return newInvoice(ce.app, ce.customer, all)
}

// convert saves a draft invoice from estimate with one line, so it can post.
func (ce *conversionEnv) convert(t testing.TB, estimate *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	inv, err := ce.newInvoiceFrom(estimate, fields)
	if err != nil {
		t.Fatalf("save an invoice from estimate %s: %v", estimate.GetString("number"), err)
	}
	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 1, 45000, false))
	return reload(t, ce.app, "books_invoices", inv.Id)
}

func (ce *conversionEnv) post(t testing.TB, invoice *core.Record) *core.Record {
	t.Helper()
	return mustPostInvoice(t, ce.app, invoice.Id, ce.users.bookkeeper.Id)
}

func (ce *conversionEnv) void(t testing.TB, invoice *core.Record) {
	t.Helper()
	if err := voidInvoiceAs(ce.app, invoice.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void invoice %s: %v", invoice.GetString("number"), err)
	}
}

// estimateState is what conversion changes on an estimate.
type estimateState struct {
	status, invoice, acceptedBy, acceptedDate string
}

func estimateStateOf(t testing.TB, app core.App, id string) estimateState {
	t.Helper()
	r := reload(t, app, "books_estimates", id)
	return estimateState{
		status: r.GetString("status"), invoice: r.GetString("invoice"),
		acceptedBy: r.GetString("accepted_by"), acceptedDate: r.GetString("accepted_date"),
	}
}

func requireEstimateState(t testing.TB, app core.App, id string, want estimateState) {
	t.Helper()
	if got := estimateStateOf(t, app, id); got != want {
		t.Errorf("estimate status/invoice/accepted_by/accepted_date = %+v, want %+v", got, want)
	}
}

func requireInvoiceCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_invoices")
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d invoices stored, want %d", n, want)
	}
}

func requireInvoiceEstimate(t testing.TB, app core.App, invoiceID, want string) {
	t.Helper()
	if got := reload(t, app, "books_invoices", invoiceID).GetString("estimate"); got != want {
		t.Errorf("invoice estimate = %q, want %q", got, want)
	}
}

var acceptedOrtiz = estimateState{status: statusAccepted, acceptedBy: "Dr. Lena Ortiz", acceptedDate: "2026-11-05"}

func closedOn(invoiceID string, open estimateState) estimateState {
	open.status, open.invoice = statusClosed, invoiceID
	return open
}

func TestConversion_PendingEstimateClosesAtTheInvoiceCreate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	inv, err := ce.newInvoiceFrom(est, nil)
	if err != nil {
		t.Fatalf("save an invoice from a pending estimate: %v", err)
	}
	requireInvoiceEstimate(t, ce.app, inv.Id, est.Id)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
}

func TestConversion_AcceptedEstimateClosesAndKeepsItsAcceptance(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	inv, err := ce.newInvoiceFrom(est, nil)
	if err != nil {
		t.Fatalf("save an invoice from an accepted estimate: %v", err)
	}
	requireInvoiceEstimate(t, ce.app, inv.Id, est.Id)
	requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, acceptedOrtiz))
}

func TestConversion_RefusesARejectedEstimate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, map[string]any{"status": statusRejected})
	_, err := ce.newInvoiceFrom(est, nil)
	requireRefusalText(t, err, wantEstimateRejected(est.GetString("number")))
	requireInvoiceCount(t, ce.app, 0)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusRejected})
}

func TestConversion_RefusesAnEstimateOnAnotherDraftInvoice(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	first := ce.convert(t, est, nil)

	_, err := ce.newInvoiceFrom(est, nil)
	requireRefusalText(t, err, wantAlreadyOnDraftInvoice(est.GetString("number")))
	requireInvoiceCount(t, ce.app, 1)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: first.Id})
}

func TestConversion_RefusesAnEstimateOnAnotherPostedInvoice(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	first := ce.post(t, ce.convert(t, est, nil))

	_, err := ce.newInvoiceFrom(est, nil)
	requireRefusalText(t, err, wantAlreadyOnInvoice(est.GetString("number"), first.GetString("number")))
	requireInvoiceCount(t, ce.app, 1)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: first.Id})
}

// A void invoice no longer holds the estimate: voiding reopened it, and a new
// invoice from it closes it again.
func TestConversion_AnEstimateWhoseOnlyInvoiceIsVoidConvertsAgain(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	first := ce.post(t, ce.convert(t, est, nil))
	ce.void(t, first)

	second, err := ce.newInvoiceFrom(est, nil)
	if err != nil {
		t.Fatalf("save a second invoice from an estimate whose invoice is void: %v", err)
	}
	requireInvoiceEstimate(t, ce.app, second.Id, est.Id)
	requireEstimateState(t, ce.app, est.Id, closedOn(second.Id, acceptedOrtiz))
}

func TestConversion_RefusesAnotherCustomerAtCreate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	other := mkCustomer(t, ce.app, "Second Clinic", "")

	_, err := ce.newInvoiceFrom(est, map[string]any{"customer": other.Id})
	requireFieldRefusal(t, err, "customer", wantEstimateCustomer)
	requireInvoiceCount(t, ce.app, 0)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusPending})
}

func TestConversion_RefusesAnotherCustomerOnADraftUpdate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	inv := ce.convert(t, est, nil)
	other := mkCustomer(t, ce.app, "Second Clinic", "")

	err := setFields(t, ce.app, "books_invoices", inv.Id, map[string]any{"customer": other.Id})
	requireFieldRefusal(t, err, "customer", wantEstimateCustomer)
	if got := reload(t, ce.app, "books_invoices", inv.Id).GetString("customer"); got != ce.customer.Id {
		t.Errorf("invoice customer = %q after the refusal, want Harborview Dental", got)
	}
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
}

func TestConversion_AnInvoiceKeepsItsEstimate(t *testing.T) {
	for name, change := range map[string]func(ce *conversionEnv, t testing.TB) string{
		"changed to another estimate": func(ce *conversionEnv, t testing.TB) string {
			return ce.mkEstimate(t, map[string]any{"memo": "Another quote"}).Id
		},
		"cleared": func(*conversionEnv, testing.TB) string { return "" },
	} {
		t.Run(name, func(t *testing.T) {
			ce := newConversionEnv(t)
			est := ce.mkEstimate(t, nil)
			inv := ce.convert(t, est, nil)
			to := change(ce, t)

			err := setFields(t, ce.app, "books_invoices", inv.Id, map[string]any{"estimate": to})
			requireRefusalText(t, err, wantKeepsEstimate)
			requireInvoiceEstimate(t, ce.app, inv.Id, est.Id)
			requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
		})
	}
}

// An invoice made without an estimate never gains one: the estimate is set only
// by the create, the write that closes the estimate.
func TestConversion_AnUpdateNeverSetsTheEstimate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	inv := ce.mkInvoice(t, nil)

	err := setFields(t, ce.app, "books_invoices", inv.Id, map[string]any{"estimate": est.Id})
	requireRefusalText(t, err, wantKeepsEstimate)
	requireInvoiceEstimate(t, ce.app, inv.Id, "")
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusPending})
}

func (ce *conversionEnv) mkInvoice(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newInvoice(ce.app, ce.customer, fields)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	return r
}

// The REST paths of the client. Each subtest has its own app: apiReq allows
// one call per app.
func TestConversion_REST(t *testing.T) {
	t.Run("a create naming an estimate closes it", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, ce.users.bookkeeper), want: http.StatusOK,
			body: fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","estimate":%q}`,
				ce.customer.Id, est.Id),
			content: []string{fmt.Sprintf(`"estimate":%q`, est.Id)},
			after: func(t testing.TB, app *tests.TestApp) {
				invoices, err := app.FindAllRecords("books_invoices", dbx.HashExp{"estimate": est.Id})
				if err != nil || len(invoices) != 1 {
					t.Fatalf("%d invoices name the estimate (err %v), want 1", len(invoices), err)
				}
				requireEstimateState(t, app, est.Id, estimateState{status: statusClosed, invoice: invoices[0].Id})
			},
		}.run(t, ce.app)
	})

	t.Run("an update that sets the estimate of an invoice made without one is refused", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		inv := ce.mkInvoice(t, nil)
		apiReq{
			method: http.MethodPatch, url: "/api/collections/books_invoices/records/" + inv.Id,
			token: tokenFor(t, ce.users.bookkeeper), want: http.StatusBadRequest,
			body:    fmt.Sprintf(`{"estimate":%q}`, est.Id),
			content: []string{wantKeepsEstimate},
			after: func(t testing.TB, app *tests.TestApp) {
				requireInvoiceEstimate(t, app, inv.Id, "")
				requireEstimateState(t, app, est.Id, estimateState{status: statusPending})
			},
		}.run(t, ce.app)
	})

	t.Run("an update that clears the estimate is refused", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkEstimate(t, nil)
		inv := ce.convert(t, est, nil)
		apiReq{
			method: http.MethodPatch, url: "/api/collections/books_invoices/records/" + inv.Id,
			token: tokenFor(t, ce.users.bookkeeper), want: http.StatusBadRequest,
			body:    `{"estimate":""}`,
			content: []string{wantKeepsEstimate},
			after: func(t testing.TB, app *tests.TestApp) {
				requireInvoiceEstimate(t, app, inv.Id, est.Id)
				requireEstimateState(t, app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
			},
		}.run(t, ce.app)
	})

	// The invoice and its estimate name each other. The delete clears both links
	// (PocketBase unlinks a deleted row's references); the closed estimate's guard
	// must not refuse that, and the estimate reopens.
	t.Run("deleting the draft invoice reopens the estimate", func(t *testing.T) {
		ce := newConversionEnv(t)
		est := ce.mkAccepted(t)
		inv := ce.convert(t, est, nil)
		requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, acceptedOrtiz))
		apiReq{
			method: http.MethodDelete, url: "/api/collections/books_invoices/records/" + inv.Id,
			token: tokenFor(t, ce.users.bookkeeper), want: http.StatusNoContent,
			after: func(t testing.TB, app *tests.TestApp) {
				if _, err := app.FindRecordById("books_invoices", inv.Id); err == nil {
					t.Error("the deleted draft invoice is still there")
				}
				requireEstimateState(t, app, est.Id, acceptedOrtiz)
			},
		}.run(t, ce.app)
	})
}

func TestConversion_DeletingTheDraftInvoiceReopensTheEstimate(t *testing.T) {
	for name, tc := range map[string]struct {
		mk   func(ce *conversionEnv, t testing.TB) *core.Record
		want estimateState
	}{
		"as accepted when it has an accepted date": {
			mk:   func(ce *conversionEnv, t testing.TB) *core.Record { return ce.mkAccepted(t) },
			want: acceptedOrtiz,
		},
		"as pending when it has none": {
			mk:   func(ce *conversionEnv, t testing.TB) *core.Record { return ce.mkEstimate(t, nil) },
			want: estimateState{status: statusPending},
		},
	} {
		t.Run(name, func(t *testing.T) {
			ce := newConversionEnv(t)
			est := tc.mk(ce, t)
			inv := ce.convert(t, est, nil)
			requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, tc.want))

			if err := ce.app.Delete(reload(t, ce.app, "books_invoices", inv.Id)); err != nil {
				t.Fatalf("delete the draft invoice from an estimate: %v", err)
			}
			if _, err := ce.app.FindRecordById("books_invoices", inv.Id); err == nil {
				t.Error("the deleted draft invoice is still there")
			}
			requireEstimateState(t, ce.app, est.Id, tc.want)
		})
	}
}

func TestConversion_VoidingThePostedInvoiceReopensTheEstimate(t *testing.T) {
	for name, tc := range map[string]struct {
		mk   func(ce *conversionEnv, t testing.TB) *core.Record
		want estimateState
	}{
		"as accepted when it has an accepted date": {
			mk:   func(ce *conversionEnv, t testing.TB) *core.Record { return ce.mkAccepted(t) },
			want: acceptedOrtiz,
		},
		"as pending when it has none": {
			mk:   func(ce *conversionEnv, t testing.TB) *core.Record { return ce.mkEstimate(t, nil) },
			want: estimateState{status: statusPending},
		},
	} {
		t.Run(name, func(t *testing.T) {
			ce := newConversionEnv(t)
			est := tc.mk(ce, t)
			inv := ce.post(t, ce.convert(t, est, nil))
			requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, tc.want))

			ce.void(t, inv)
			if got := reload(t, ce.app, "books_invoices", inv.Id).GetString("status"); got != statusVoid {
				t.Fatalf("invoice status = %q after the void, want void", got)
			}
			requireEstimateState(t, ce.app, est.Id, tc.want)
		})
	}
}

// A correction of the posted invoice carries its estimate: it saves while the
// original still names the estimate, and its post moves the estimate to it.
func TestConversion_ACorrectionMovesTheEstimateWhenItPosts(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	original := ce.post(t, ce.convert(t, est, nil))

	correction := ce.convert(t, est, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	requireInvoiceEstimate(t, ce.app, correction.Id, est.Id)
	requireEstimateState(t, ce.app, est.Id, closedOn(original.Id, acceptedOrtiz))

	ce.post(t, correction)
	if got := reload(t, ce.app, "books_invoices", original.Id).GetString("status"); got != statusVoid {
		t.Fatalf("original status = %q after the correction posted, want void", got)
	}
	requireEstimateState(t, ce.app, est.Id, closedOn(correction.Id, acceptedOrtiz))
}

func TestConversion_DeletingACorrectionDraftKeepsTheEstimateOnTheOriginal(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	original := ce.post(t, ce.convert(t, est, nil))
	correction := ce.convert(t, est, map[string]any{"replaces": original.Id})

	if err := ce.app.Delete(reload(t, ce.app, "books_invoices", correction.Id)); err != nil {
		t.Fatalf("delete the correction draft: %v", err)
	}
	requireEstimateState(t, ce.app, est.Id, closedOn(original.Id, acceptedOrtiz))
}

// Only Books' conversion writes move a closed estimate; a person's update is
// still refused.
func TestConversion_APersonStillCannotChangeAClosedEstimate(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	inv := ce.convert(t, est, nil)
	requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, acceptedOrtiz))

	for name, fields := range map[string]map[string]any{
		"a memo edit":     {"memo": "Changed after closing"},
		"a reopen":        {"status": statusPending},
		"an invoice drop": {"invoice": ""},
	} {
		t.Run(name, func(t *testing.T) {
			err := setFields(t, ce.app, "books_estimates", est.Id, fields)
			requireRefusalText(t, err, wantEstimateClosedUnchanged)
			requireEstimateState(t, ce.app, est.Id, closedOn(inv.Id, acceptedOrtiz))
		})
	}
}

// The invoice create and the estimate's close are one transaction: when the
// close fails, the invoice is not stored and the estimate is as it was.
func TestConversion_ARefusedCreateLeavesTheEstimateAsItWas(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkAccepted(t)
	before := reload(t, ce.app, "books_estimates", est.Id)
	ce.app.OnRecordUpdate("books_estimates").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("status") == statusClosed {
			return errors.New("the estimate store is unavailable")
		}
		return e.Next()
	})

	if _, err := ce.newInvoiceFrom(est, nil); err == nil {
		t.Fatal("the invoice create saved although closing its estimate failed")
	}
	requireInvoiceCount(t, ce.app, 0)
	after := reload(t, ce.app, "books_estimates", est.Id)
	for _, field := range []string{"status", "invoice", "accepted_by", "accepted_date", "updated"} {
		if after.GetString(field) != before.GetString(field) {
			t.Errorf("estimate %s = %q after the refused create, want %q", field, after.GetString(field), before.GetString(field))
		}
	}
}

// The invoice from an estimate cannot change its customer, so the shared
// "Choose an active customer" text would be a dead end.
func TestConversion_RefusesAnInactiveEstimateCustomerUntilItIsActive(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	if err := setCustomer(t, ce.app, ce.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Harborview Dental inactive: %v", err)
	}

	_, err := ce.newInvoiceFrom(est, nil)
	requireFieldRefusal(t, err, "customer", wantEstimateCustomerInactive("Harborview Dental"))
	requireInvoiceCount(t, ce.app, 0)
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusPending})

	if err := setCustomer(t, ce.app, ce.customer.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Harborview Dental active again: %v", err)
	}
	inv, err := ce.newInvoiceFrom(est, nil)
	if err != nil {
		t.Fatalf("save the invoice once the customer is active: %v", err)
	}
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
}

// The Post of a draft invoice from an estimate meets the same dead end when the
// customer was made inactive after the conversion: its customer cannot change,
// so the refusal says to make the customer active.
func TestConversion_PostRefusesAnInactiveEstimateCustomer(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	inv := ce.convert(t, est, nil)
	if err := setCustomer(t, ce.app, ce.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Harborview Dental inactive: %v", err)
	}

	err := postInvoiceAs(ce.app, inv.Id, ce.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "customer", wantEstimateCustomerInactive("Harborview Dental"))
	if got := reload(t, ce.app, "books_invoices", inv.Id).GetString("status"); got != statusDraft {
		t.Errorf("invoice status = %q, want %q", got, statusDraft)
	}
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})
}

// The invoice's lines stay editable and run the shared line guards.
func TestConversion_TheInvoiceLinesKeepTheSharedGuards(t *testing.T) {
	ce := newConversionEnv(t)
	est := ce.mkEstimate(t, nil)
	inv, err := ce.newInvoiceFrom(est, nil)
	if err != nil {
		t.Fatalf("save an invoice from an estimate: %v", err)
	}
	// The estimate is closed now; the invoice's lines are not frozen with it.
	requireEstimateState(t, ce.app, est.Id, estimateState{status: statusClosed, invoice: inv.Id})

	_, err = newInvoiceLine(ce.app, inv, 0, item(ce.retired, 1, 1000, false))
	requireRefusalText(t, err, wantProductInactive(1, "Old retainer"))
	requireLineCount(t, ce.app, inv, 0)

	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 2, 45000, false))
	requireLineCount(t, ce.app, inv, 1)
	requireInvoiceTotals(t, ce.app, inv.Id, 90000, 0, 90000)
}
