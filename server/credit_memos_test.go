package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The credit memo's guards (spec §3.1, §4.3): the credit memo is one more kind
// of the sales document layer, with the customer required, no terms, no due
// date, and an optional link to a posted invoice of the same customer.

// The refusal texts of the credit memo guards, as the client gets them
// (PocketBase adds a final period to a text that has none). Written out here,
// not read from the consts, so a change of wording fails this file too.
const (
	wantCreditMemoTotalNegative = "A credit memo total cannot be below zero. Use an invoice."
	wantCreditMemoTotalTooLarge = "The credit memo total is more than Books can store."
	wantCreditMemoTooManyLines  = "A credit memo can have at most 250 lines."
	wantCreditMemoZeroTotal     = "A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft."
	wantCreditMemoInvoice       = "Choose a posted invoice of this customer."
	wantCreditMemoNotDraft      = "A posted or void credit memo cannot be changed."
	wantCreditMemoDeleteDraft   = "Only a draft credit memo can be deleted."
	wantCreditMemoLineStays     = "A line stays on its credit memo."
	wantCreditMemoLineNotDraft  = "Only the lines of a draft credit memo can change."
	wantCreditMemoUnknownKind   = "Line %d: a credit memo line is an item, description, subtotal or percent line."
	creditMemoDay               = "2026-11-10"
	creditMemoSequenceID        = "booksseqcreditm"
)

// creditMemoEnv is the receipt env (the e2e chart's 1000 Business Checking,
// 1100 Accounts receivable, 4000 Consulting Income and 4100 Hardware sales,
// Harborview Dental, Monthly bookkeeping, Wireless access point, the inactive
// Old retainer, and a Denver combined group of three agencies) with the
// invoice and credit memo guards bound and both forms hosts, so a test can
// post the invoice a memo names. discount is a service a percent line names.
type creditMemoEnv struct {
	*receiptEnv
	discount *core.Record
}

func newCreditMemoEnv(t *testing.T) *creditMemoEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, creditMemoKind)
	// Core keeps one set of bound hosts per app, so both are bound in one call.
	bindHostsByKey(t, app, invoiceKind.HostKey, creditMemoHostKey)
	return creditMemoEnvOn(t, app)
}

func creditMemoEnvOn(t *testing.T, app *tests.TestApp) *creditMemoEnv {
	t.Helper()
	re := receiptEnvOn(t, app)
	discount, err := newProduct(app, map[string]any{"type": "service", "name": "Discount", "income_account": re.revenue.Id})
	if err != nil {
		t.Fatalf("save the discount product: %v", err)
	}
	return &creditMemoEnv{receiptEnv: re, discount: discount}
}

// newCreditMemo saves a draft credit memo through the app, so every guard
// runs, with the fields given over a valid default (Harborview Dental, dated
// creditMemoDay), and returns what the guards said.
func (ce *creditMemoEnv) newCreditMemo(fields map[string]any) (*core.Record, error) {
	all := map[string]any{"customer": ce.customer.Id, "status": "draft", "date": creditMemoDay}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(ce.app, "books_credit_memos", all)
}

func (ce *creditMemoEnv) mkCreditMemo(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := ce.newCreditMemo(fields)
	if err != nil {
		t.Fatalf("save a draft credit memo: %v", err)
	}
	return r
}

// newCreditMemoLine saves one line of memo at position through the app, so
// every guard and the restatement run.
func newCreditMemoLine(app core.App, memo *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"credit_memo": memo.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_credit_memo_lines", all)
}

func mkCreditMemoLine(t testing.TB, app core.App, memo *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newCreditMemoLine(app, memo, position, fields)
	if err != nil {
		t.Fatalf("save credit memo line %d: %v", position+1, err)
	}
	return r
}

func requireCreditMemoTotals(t testing.TB, app core.App, id string, subtotal, tax, total int) {
	t.Helper()
	r := reload(t, app, "books_credit_memos", id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("tax_total"), r.GetInt("total")}; got != [3]int{subtotal, tax, total} {
		t.Errorf("credit memo subtotal/tax_total/total = %v, want %v", got, [3]int{subtotal, tax, total})
	}
}

func requireCreditMemoLineCount(t testing.TB, app core.App, memo *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_credit_memo_lines", dbx.HashExp{"credit_memo": memo.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the credit memo, want %d", n, want)
	}
}

func requireCreditMemoCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_credit_memos"); err != nil || n != want {
		t.Errorf("%d credit memos stored (err %v), want %d", n, err, want)
	}
}

// setCreditMemoStatus writes status straight to the table, past every hook, so
// a guard test holds a posted memo without posting it.
func setCreditMemoStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_credit_memos SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set credit memo %s %s: %v", id, status, err)
	}
}

// postCreditMemoAs posts a draft credit memo as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postCreditMemoAs(app core.App, memoID, actor string) error {
	r, err := app.FindRecordById("books_credit_memos", memoID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostCreditMemo(t testing.TB, app core.App, memoID, actor string) *core.Record {
	t.Helper()
	if err := postCreditMemoAs(app, memoID, actor); err != nil {
		t.Fatalf("post credit memo %s: %v", memoID, err)
	}
	return reload(t, app, "books_credit_memos", memoID)
}

func voidCreditMemoAs(app core.App, memoID, actor string) error {
	r, err := app.FindRecordById("books_credit_memos", memoID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

// postedInvoiceFor posts a one-line invoice of amount for customer.
func (ce *creditMemoEnv) postedInvoiceFor(t testing.TB, customer *core.Record, amount int64) *core.Record {
	t.Helper()
	inv, err := newInvoice(ce.app, customer, nil)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 1, amount, false))
	return mustPostInvoice(t, ce.app, inv.Id, ce.users.bookkeeper.Id)
}

func TestCreditMemo_DraftSaves(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, map[string]any{"memo": "Returned hardware"})
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 25000, false))

	got := reload(t, ce.app, "books_credit_memos", memo.Id)
	if got.GetString("status") != statusDraft || got.GetString("customer") != ce.customer.Id ||
		got.GetString("number") != "" || got.GetInt("balance") != 0 || got.GetString("currency") != "USD" {
		t.Errorf("credit memo status %q customer %q number %q balance %d currency %q, want a USD draft of Harborview Dental with no number and balance 0",
			got.GetString("status"), got.GetString("customer"), got.GetString("number"), got.GetInt("balance"), got.GetString("currency"))
	}
	requireCreditMemoTotals(t, ce.app, memo.Id, 25000, 0, 25000)
}

func TestCreditMemo_RequiresACustomer(t *testing.T) {
	ce := newCreditMemoEnv(t)
	_, err := ce.newCreditMemo(map[string]any{"customer": ""})
	requireRefusedOnField(t, err, "customer")
	requireCreditMemoCount(t, ce.app, 0)
}

func TestCreditMemo_RefusesABadDate(t *testing.T) {
	ce := newCreditMemoEnv(t)
	_, err := ce.newCreditMemo(map[string]any{"date": "2026-13-40"})
	requireFieldRefusal(t, err, "date", wantDocumentDay)
	requireCreditMemoCount(t, ce.app, 0)
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestCreditMemo_ServerFieldsRefused(t *testing.T) {
	body := func(ce *creditMemoEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q%s}`, ce.customer.Id, creditMemoDay, extra)
	}

	t.Run("a draft with no server field is created", func(t *testing.T) {
		ce := newCreditMemoEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_credit_memos/records",
			token: tokenFor(t, ce.users.bookkeeper), body: body(ce, ""), want: http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) { requireCreditMemoCount(t, app, 1) },
		}.run(t, ce.app)
	})

	for name, extra := range map[string]func(t testing.TB, ce *creditMemoEnv) string{
		"number":    func(testing.TB, *creditMemoEnv) string { return `,"number":"1001"` },
		"sequence":  func(testing.TB, *creditMemoEnv) string { return `,"sequence":1001` },
		"total":     func(testing.TB, *creditMemoEnv) string { return `,"total":100` },
		"subtotal":  func(testing.TB, *creditMemoEnv) string { return `,"subtotal":100` },
		"tax_total": func(testing.TB, *creditMemoEnv) string { return `,"tax_total":100` },
		"balance":   func(testing.TB, *creditMemoEnv) string { return `,"balance":100` },
		// The cents of the memo's applications are server-written, as its
		// balance is (apply credit spec §4.2).
		"applied":  func(testing.TB, *creditMemoEnv) string { return `,"applied":100` },
		"currency": func(testing.TB, *creditMemoEnv) string { return `,"currency":"USD"` },
		// A real entry and real users, so only the rule can refuse the relation.
		"entry": func(t testing.TB, ce *creditMemoEnv) string {
			return fmt.Sprintf(`,"entry":%q`, ce.sale(t, creditMemoDay, 100).Id)
		},
		"posted_by": func(t testing.TB, ce *creditMemoEnv) string {
			return fmt.Sprintf(`,"posted_by":%q`, ce.users.admin.Id)
		},
		"voided_by": func(t testing.TB, ce *creditMemoEnv) string {
			return fmt.Sprintf(`,"voided_by":%q`, ce.users.admin.Id)
		},
	} {
		t.Run(name, func(t *testing.T) {
			ce := newCreditMemoEnv(t)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_credit_memos/records",
				token: tokenFor(t, ce.users.bookkeeper), body: body(ce, extra(t, ce)), want: http.StatusBadRequest,
				after: func(t testing.TB, app *tests.TestApp) { requireCreditMemoCount(t, app, 0) },
			}.run(t, ce.app)
		})
	}

	// An update that sends applied is refused too, on a draft and on a posted
	// memo, and the stored value stays 0. The update rule refuses it, and
	// PocketBase answers a failed update rule with 404.
	for _, posted := range []bool{false, true} {
		name := "an update of a draft's applied"
		if posted {
			name = "an update of a posted memo's applied"
		}
		t.Run(name, func(t *testing.T) {
			ce := newCreditMemoEnv(t)
			memo := ce.mkCreditMemo(t, nil)
			mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 25000, false))
			if posted {
				mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
				if err := setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"applied": 100}); err == nil {
					t.Error("a person's update of a posted memo's applied was saved")
				}
			}
			apiReq{
				method: http.MethodPatch, url: "/api/collections/books_credit_memos/records/" + memo.Id,
				token: tokenFor(t, ce.users.bookkeeper), body: `{"applied":100}`, want: http.StatusNotFound,
				after: func(t testing.TB, app *tests.TestApp) {
					if got := reload(t, app, "books_credit_memos", memo.Id).GetInt("applied"); got != 0 {
						t.Errorf("credit memo applied = %d after the refused update, want 0", got)
					}
				},
			}.run(t, ce.app)
		})
	}
}

func TestCreditMemo_ReaderCannotCreate(t *testing.T) {
	ce := newCreditMemoEnv(t)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_credit_memos/records",
		token: tokenFor(t, ce.users.readOnly),
		body:  fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q}`, ce.customer.Id, creditMemoDay),
		want:  http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) { requireCreditMemoCount(t, app, 0) },
	}.run(t, ce.app)
}

func TestCreditMemo_RefusesNegativeTotal(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 1000, false))

	_, err := newCreditMemoLine(ce.app, memo, 1, item(ce.service, 1, -1001, false))
	requireRefusalText(t, err, wantCreditMemoTotalNegative)
	requireCreditMemoLineCount(t, ce.app, memo, 1)
	requireCreditMemoTotals(t, ce.app, memo.Id, 1000, 0, 1000)
}

func TestCreditMemo_RefusesTooLargeTotal(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, nil)
	for i := 0; i < 9; i++ {
		mkCreditMemoLine(t, ce.app, memo, i, item(ce.service, bigQty, bigRate, false))
	}
	requireCreditMemoTotals(t, ce.app, memo.Id, 9_000_000_000_000_000, 0, 9_000_000_000_000_000)

	// A tenth line takes the total past maxStoredAmount (2^53-1).
	_, err := newCreditMemoLine(ce.app, memo, 9, item(ce.service, bigQty, bigRate, false))
	requireRefusalText(t, err, wantCreditMemoTotalTooLarge)
	requireCreditMemoLineCount(t, ce.app, memo, 9)
}

func TestCreditMemoLine_RefusesTheLine251st(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	ce := creditMemoEnvOn(t, app)
	// 249 lines written before the guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	memo := saveRecord(t, app, "books_credit_memos", map[string]any{
		"customer": ce.customer.Id, "status": "draft", "date": creditMemoDay, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		saveRecord(t, app, "books_credit_memo_lines", map[string]any{
			"credit_memo": memo.Id, "kind": "description", "description": fmt.Sprintf("Note %d", i+1), "position": i,
		})
	}
	registerSalesDocGuards(app, creditMemoKind)
	bindCreditMemoHost(t, app)

	mkCreditMemoLine(t, app, memo, 249, descriptionLine("Note 250"))
	_, err := newCreditMemoLine(app, memo, 250, descriptionLine("Note 251"))
	requireRefusalText(t, err, wantCreditMemoTooManyLines)
	requireCreditMemoLineCount(t, app, memo, 250)
}

func TestCreditMemo_PostedCannotChange(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, map[string]any{"memo": "Returned hardware"})
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 25000, false))
	setCreditMemoStatus(t, ce.app, memo.Id, statusPosted)

	err := setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"memo": "Changed"})
	requireRefusalText(t, err, wantCreditMemoNotDraft)
	if got := reload(t, ce.app, "books_credit_memos", memo.Id).GetString("memo"); got != "Returned hardware" {
		t.Errorf("memo = %q after the refusal, want Returned hardware", got)
	}
}

func TestCreditMemo_DeleteOnlyDraft(t *testing.T) {
	ce := newCreditMemoEnv(t)
	posted := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, posted, 0, item(ce.service, 1, 25000, false))
	stale := reload(t, ce.app, "books_credit_memos", posted.Id)
	setCreditMemoStatus(t, ce.app, posted.Id, statusPosted)

	requireRefusalText(t, ce.app.Delete(stale), wantCreditMemoDeleteDraft)
	if _, err := ce.app.FindRecordById("books_credit_memos", posted.Id); err != nil {
		t.Fatalf("the posted credit memo is gone: %v", err)
	}
	requireCreditMemoLineCount(t, ce.app, posted, 1)

	draft := ce.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, ce.app, draft, 0, item(ce.service, 1, 25000, false))
	mkCreditMemoLine(t, ce.app, draft, 1, descriptionLine("Returned at the front office"))
	if err := ce.app.Delete(reload(t, ce.app, "books_credit_memos", draft.Id)); err != nil {
		t.Fatalf("delete a draft credit memo: %v", err)
	}
	if _, err := ce.app.FindRecordById("books_credit_memos", draft.Id); err == nil {
		t.Error("the deleted draft is still there")
	}
	requireCreditMemoLineCount(t, ce.app, draft, 0)
}

func TestCreditMemoLine_StaysOnItsCreditMemo(t *testing.T) {
	ce := newCreditMemoEnv(t)
	first := ce.mkCreditMemo(t, nil)
	second := ce.mkCreditMemo(t, nil)
	line := mkCreditMemoLine(t, ce.app, first, 0, item(ce.service, 2, 45000, false))
	requireCreditMemoTotals(t, ce.app, first.Id, 90000, 0, 90000)

	err := setFields(t, ce.app, "books_credit_memo_lines", line.Id, map[string]any{"credit_memo": second.Id})
	requireRefusalText(t, err, wantCreditMemoLineStays)
	if got := reload(t, ce.app, "books_credit_memo_lines", line.Id).GetString("credit_memo"); got != first.Id {
		t.Errorf("line credit_memo = %q after the refusal, want the first memo", got)
	}
	requireCreditMemoLineCount(t, ce.app, second, 0)
}

func TestCreditMemoLine_RefusedOnPostedCreditMemo(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, nil)
	line := mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 25000, false))
	setCreditMemoStatus(t, ce.app, memo.Id, statusPosted)

	_, err := newCreditMemoLine(ce.app, memo, 1, item(ce.service, 1, 100, false))
	requireRefusalText(t, err, wantCreditMemoLineNotDraft)
	err = setFields(t, ce.app, "books_credit_memo_lines", line.Id, map[string]any{"quantity": 2})
	requireRefusalText(t, err, wantCreditMemoLineNotDraft)
	requireCreditMemoLineCount(t, ce.app, memo, 1)
	requireCreditMemoTotals(t, ce.app, memo.Id, 25000, 0, 25000)
}

// Lesson 34: the Go line check reads the cells each row kind of the host
// requires. A credit memo's line is checked as an invoice's: each case is saved
// on an invoice and on a credit memo of the same app, and the memo's outcome
// is the invoice's (a refusal with the same text, or none).
func TestCreditMemoLine_EachRequiredCellAsTheInvoice(t *testing.T) {
	ce := newCreditMemoEnv(t)
	cases := []struct {
		name  string
		above []map[string]any
		line  map[string]any
		// want is the memo's refusal text; "" is the invoice's outcome, whatever it is.
		want string
	}{
		{"an item line with no product", nil,
			map[string]any{"kind": "item", "quantity": 1, "rate": 100}, fmt.Sprintf(wantNeedsProduct, 1)},
		{"an item line with no quantity", nil,
			map[string]any{"kind": "item", "product": ce.service.Id, "rate": 45000}, fmt.Sprintf(wantQuantityNotPositive, 1)},
		{"an item line with no rate", nil,
			map[string]any{"kind": "item", "product": ce.service.Id, "quantity": 1}, ""},
		{"a percent line with no percent", []map[string]any{item(ce.service, 1, 45000, false)},
			map[string]any{"kind": "percent", "product": ce.discount.Id}, ""},
		{"a percent line with no product", []map[string]any{item(ce.service, 1, 45000, false)},
			map[string]any{"kind": "percent", "percent_ppm": -100000}, fmt.Sprintf(wantNeedsProduct, 2)},
		{"a percent line under a description line",
			[]map[string]any{item(ce.service, 1, 45000, false), descriptionLine("Annex")},
			percentLine(ce.discount, -100000), fmt.Sprintf(wantPercentTarget, 3)},
		{"a description line with no description", nil,
			map[string]any{"kind": "description"}, fmt.Sprintf(wantNeedsDesc, 1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inv := ce.mkInvoice(t)
			memo := ce.mkCreditMemo(t, nil)
			for i, above := range tc.above {
				mkInvoiceLine(t, ce.app, inv, i, above)
				mkCreditMemoLine(t, ce.app, memo, i, above)
			}
			_, invoiceErr := newInvoiceLine(ce.app, inv, len(tc.above), tc.line)
			_, memoErr := newCreditMemoLine(ce.app, memo, len(tc.above), tc.line)
			if tc.want != "" {
				requireRefusalText(t, invoiceErr, tc.want)
				requireRefusalText(t, memoErr, tc.want)
				requireCreditMemoLineCount(t, ce.app, memo, int64(len(tc.above)))
				return
			}
			if (invoiceErr == nil) != (memoErr == nil) {
				t.Fatalf("invoice refusal %v, credit memo refusal %v; want the same outcome", invoiceErr, memoErr)
			}
			if invoiceErr != nil {
				if got, want := apiErrorOf(t, memoErr).Message, apiErrorOf(t, invoiceErr).Message; got != want {
					t.Errorf("credit memo refusal %q, want the invoice's %q", got, want)
				}
			}
		})
	}

	t.Run("an unknown kind", func(t *testing.T) {
		memo := ce.mkCreditMemo(t, nil)
		_, err := newCreditMemoLine(ce.app, memo, 0, map[string]any{"kind": "account", "account": ce.revenue.Id, "amount": 100})
		requireRefusalText(t, err, fmt.Sprintf(wantCreditMemoUnknownKind, 1))
		requireCreditMemoLineCount(t, ce.app, memo, 0)
	})

	t.Run("each kind with its own cells is accepted", func(t *testing.T) {
		memo := ce.mkCreditMemo(t, nil)
		mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 45000, false))
		mkCreditMemoLine(t, ce.app, memo, 1, subtotalLine())
		mkCreditMemoLine(t, ce.app, memo, 2, percentLine(ce.discount, -100000))
		mkCreditMemoLine(t, ce.app, memo, 3, descriptionLine("Annex"))
		requireCreditMemoTotals(t, ce.app, memo.Id, 40500, 0, 40500)
	})
}

// mkInvoice saves a draft invoice of Harborview Dental.
func (ce *creditMemoEnv) mkInvoice(t testing.TB) *core.Record {
	t.Helper()
	inv, err := newInvoice(ce.app, ce.customer, nil)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	return inv
}

func TestCreditMemoLine_RefusesAnInactiveProduct(t *testing.T) {
	ce := newCreditMemoEnv(t)
	memo := ce.mkCreditMemo(t, nil)
	_, err := newCreditMemoLine(ce.app, memo, 0, item(ce.retired, 1, 1000, false))
	requireRefusalText(t, err, wantProductInactive(1, "Old retainer"))
	requireCreditMemoLineCount(t, ce.app, memo, 0)
}

func TestCreditMemo_RefusesAnInactiveTaxRate(t *testing.T) {
	ce := newCreditMemoEnv(t)
	boulder := mkTaxRate(t, ce.app, "Boulder city", 38600, ce.cityDept)
	if err := setTaxRate(t, ce.app, boulder.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Boulder city inactive: %v", err)
	}
	_, err := ce.newCreditMemo(map[string]any{"tax_rate": boulder.Id})
	requireFieldRefusal(t, err, "tax_rate", wantDocumentTaxInactive)
	requireCreditMemoCount(t, ce.app, 0)
}

// The invoice link (spec §3.2, §4.3, Q2): a memo may name a posted invoice of
// its own customer, and nothing else.
func TestCreditMemo_InvoiceLinkGuard(t *testing.T) {
	ce := newCreditMemoEnv(t)
	posted := ce.postedInvoiceFor(t, ce.customer, 45000)
	draftInvoice := ce.mkInvoice(t)
	mkInvoiceLine(t, ce.app, draftInvoice, 0, item(ce.service, 1, 45000, false))
	voided := ce.postedInvoiceFor(t, ce.customer, 30000)
	if err := voidInvoiceAs(ce.app, voided.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void an invoice: %v", err)
	}
	riverside := mkCustomer(t, ce.app, "Riverside Clinic", "")
	othersInvoice := ce.postedInvoiceFor(t, riverside, 20000)

	t.Run("a posted invoice of the same customer is linked", func(t *testing.T) {
		memo := ce.mkCreditMemo(t, map[string]any{"invoice": posted.Id})
		if got := reload(t, ce.app, "books_credit_memos", memo.Id).GetString("invoice"); got != posted.Id {
			t.Errorf("invoice = %q, want the posted invoice", got)
		}
	})

	for name, invoiceID := range map[string]string{
		"a draft invoice":            draftInvoice.Id,
		"a void invoice":             voided.Id,
		"another customer's invoice": othersInvoice.Id,
		"an invoice that is not":     "nosuchinvoice01",
	} {
		t.Run(name+" is refused", func(t *testing.T) {
			before, _ := ce.app.CountRecords("books_credit_memos")
			_, err := ce.newCreditMemo(map[string]any{"invoice": invoiceID})
			requireFieldRefusal(t, err, "invoice", wantCreditMemoInvoice)
			requireCreditMemoCount(t, ce.app, before)

			memo := ce.mkCreditMemo(t, nil)
			err = setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"invoice": invoiceID})
			requireFieldRefusal(t, err, "invoice", wantCreditMemoInvoice)
			if got := reload(t, ce.app, "books_credit_memos", memo.Id).GetString("invoice"); got != "" {
				t.Errorf("invoice = %q after the refusal, want none", got)
			}
		})
	}

	t.Run("another customer on a linked draft is refused", func(t *testing.T) {
		memo := ce.mkCreditMemo(t, map[string]any{"invoice": posted.Id})
		err := setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"customer": riverside.Id})
		requireFieldRefusal(t, err, "invoice", wantCreditMemoInvoice)
		if got := reload(t, ce.app, "books_credit_memos", memo.Id).GetString("customer"); got != ce.customer.Id {
			t.Errorf("customer = %q after the refusal, want Harborview Dental", got)
		}
	})

	t.Run("clearing the link saves", func(t *testing.T) {
		memo := ce.mkCreditMemo(t, map[string]any{"invoice": posted.Id})
		if err := setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"invoice": ""}); err != nil {
			t.Fatalf("clear the invoice link: %v", err)
		}
		if got := reload(t, ce.app, "books_credit_memos", memo.Id).GetString("invoice"); got != "" {
			t.Errorf("invoice = %q, want none", got)
		}
	})
}

// Q18: a void keeps the link. The guard runs only when invoice or customer
// changes, so a draft whose invoice was voided after the link was stored still
// saves and posts.
func TestCreditMemo_LinkedDraftOfAVoidedInvoiceSavesAndPosts(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv := ce.postedInvoiceFor(t, ce.customer, 45000)
	memo := ce.mkCreditMemo(t, map[string]any{"invoice": inv.Id})
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 10000, false))
	if err := voidInvoiceAs(ce.app, inv.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the linked invoice: %v", err)
	}

	if err := setFields(t, ce.app, "books_credit_memos", memo.Id, map[string]any{"memo": "Returned after the void"}); err != nil {
		t.Fatalf("a memo edit of a draft whose invoice was voided was refused: %v", err)
	}
	posted := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetString("invoice") != inv.Id || posted.GetString("memo") != "Returned after the void" {
		t.Errorf("credit memo status %q invoice %q memo %q, want posted, linked to the void invoice, with the new memo",
			posted.GetString("status"), posted.GetString("invoice"), posted.GetString("memo"))
	}
}

// Spec §3.7, Q18: a correction keeps its original's link, so it saves after
// that invoice was voided; a correction that names another invoice is checked.
func TestCreditMemo_CorrectionKeepsTheOriginalsLink(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	inv := ce.postedInvoiceFor(t, ce.customer, 45000)
	original := ce.mkCreditMemo(t, map[string]any{"invoice": inv.Id})
	mkCreditMemoLine(t, ce.app, original, 0, item(ce.service, 1, 10000, false))
	mustPostCreditMemo(t, ce.app, original.Id, actor)
	if err := voidInvoiceAs(ce.app, inv.Id, actor); err != nil {
		t.Fatalf("void the linked invoice: %v", err)
	}

	correction, err := ce.newCreditMemo(map[string]any{"replaces": original.Id, "invoice": inv.Id})
	if err != nil {
		t.Fatalf("a correction with its original's invoice and customer was refused: %v", err)
	}
	mkCreditMemoLine(t, ce.app, correction, 0, item(ce.service, 1, 12000, false))
	if got := mustPostCreditMemo(t, ce.app, correction.Id, actor); got.GetString("invoice") != inv.Id {
		t.Errorf("posted correction invoice = %q, want the original's", got.GetString("invoice"))
	}

	t.Run("a correction that names another invoice is checked", func(t *testing.T) {
		second := ce.postedInvoiceFor(t, ce.customer, 30000)
		memo := ce.mkCreditMemo(t, map[string]any{"invoice": second.Id})
		mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 10000, false))
		mustPostCreditMemo(t, ce.app, memo.Id, actor)
		draftInvoice := ce.mkInvoice(t)
		mkInvoiceLine(t, ce.app, draftInvoice, 0, item(ce.service, 1, 45000, false))

		_, err := ce.newCreditMemo(map[string]any{"replaces": memo.Id, "invoice": draftInvoice.Id})
		requireFieldRefusal(t, err, "invoice", wantCreditMemoInvoice)
		_, err = ce.newCreditMemo(map[string]any{"replaces": memo.Id, "invoice": inv.Id})
		requireFieldRefusal(t, err, "invoice", wantCreditMemoInvoice)
	})
}
