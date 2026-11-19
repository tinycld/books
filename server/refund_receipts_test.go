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

// The refund receipt's guards (spec §3.1, §4.3): one more kind of the sales
// document layer, with an optional customer, a Refund from account (an active
// bank or Undeposited funds account), and at most one source: a posted sales
// receipt of its customer, or a posted credit memo of its customer with
// unapplied credit (a payout).

// The refusal texts of the refund receipt guards, as the client gets them
// (PocketBase adds a final period to a text that has none). Written out here,
// not read from the consts, so a change of wording fails this file too.
const (
	wantRefundTotalNegative  = "A refund receipt total cannot be below zero. Use a sales receipt."
	wantRefundTotalTooLarge  = "The refund receipt total is more than Books can store."
	wantRefundTooManyLines   = "A refund receipt can have at most 250 lines."
	wantRefundZeroTotal      = "A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
	wantRefundFromInvalid    = "Choose an active bank or Undeposited funds account."
	wantRefundNotDraft       = "A posted or void refund receipt cannot be changed."
	wantRefundDeleteDraft    = "Only a draft refund receipt can be deleted."
	wantRefundLineStays      = "A line stays on its refund receipt."
	wantRefundLineNotDraft   = "Only the lines of a draft refund receipt can change."
	wantRefundUnknownKind    = "Line %d: a refund receipt line is an item, description, subtotal or percent line."
	wantRefundOneSource      = "A refund receipt has one source."
	wantRefundSalesReceipt   = "Choose a posted sales receipt of this customer."
	wantRefundCreditMemo     = "Choose a posted credit memo of this customer with unapplied credit."
	wantRefundPayoutStays    = "A payout stays with its credit memo."
	refundReceiptDay         = "2026-11-12"
	refundReceiptSequenceID  = "booksseqrefundr"
	refundReceiptsCollection = "books_refund_receipts"
	refundReceiptLinesCol    = "books_refund_receipt_lines"
)

// refundReceiptEnv is the credit memo env (the e2e chart's 1000 Business
// Checking, 1010 Business Savings, 1100 Accounts receivable, 1200 Undeposited
// funds, 4000 Consulting Income and 4100 Hardware sales, Harborview Dental,
// Monthly bookkeeping, Wireless access point, the inactive Old retainer, a
// Discount service and a Denver combined group of three agencies) with the
// sales receipt, credit memo and refund receipt guards bound and their three
// forms hosts, so a test can post the sales receipt or the credit memo a refund
// names. card is a credit card account, riverside a second active customer.
type refundReceiptEnv struct {
	*creditMemoEnv
	card      *core.Record
	riverside *core.Record
}

func newRefundReceiptEnv(t *testing.T) *refundReceiptEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, salesReceiptKind)
	registerSalesDocGuards(app, creditMemoKind)
	registerSalesDocGuards(app, refundReceiptKind)
	// Core keeps one set of bound hosts per app, so the three are bound in one call.
	bindHostsByKey(t, app, salesReceiptKind.HostKey, creditMemoHostKey, refundReceiptHostKey)
	return refundReceiptEnvOn(t, app)
}

func refundReceiptEnvOn(t *testing.T, app *tests.TestApp) *refundReceiptEnv {
	t.Helper()
	ce := creditMemoEnvOn(t, app)
	return &refundReceiptEnv{
		creditMemoEnv: ce,
		card:          mkNumberedAccount(t, app, "Company Card", "2100", "credit_card", "credit_card"),
		riverside:     mkCustomer(t, app, "Riverside Clinic", ""),
	}
}

// newRefundReceipt saves a draft refund receipt through the app, so every
// guard runs, with the fields given over a valid default (Harborview Dental,
// dated refundReceiptDay, refunded from 1000 Business Checking), and returns
// what the guards said.
func (rr *refundReceiptEnv) newRefundReceipt(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"customer": rr.customer.Id, "status": "draft", "date": refundReceiptDay, "refund_from": rr.checking.Id,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(rr.app, refundReceiptsCollection, all)
}

func (rr *refundReceiptEnv) mkRefundReceipt(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := rr.newRefundReceipt(fields)
	if err != nil {
		t.Fatalf("save a draft refund receipt: %v", err)
	}
	return r
}

// newRefundReceiptLine saves one line of refund at position through the app,
// so every guard and the restatement run.
func newRefundReceiptLine(app core.App, refund *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"refund_receipt": refund.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, refundReceiptLinesCol, all)
}

func mkRefundReceiptLine(t testing.TB, app core.App, refund *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newRefundReceiptLine(app, refund, position, fields)
	if err != nil {
		t.Fatalf("save refund receipt line %d: %v", position+1, err)
	}
	return r
}

func requireRefundReceiptTotals(t testing.TB, app core.App, id string, subtotal, tax, total int) {
	t.Helper()
	r := reload(t, app, refundReceiptsCollection, id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("tax_total"), r.GetInt("total")}; got != [3]int{subtotal, tax, total} {
		t.Errorf("refund receipt subtotal/tax_total/total = %v, want %v", got, [3]int{subtotal, tax, total})
	}
}

func requireRefundReceiptLineCount(t testing.TB, app core.App, refund *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords(refundReceiptLinesCol, dbx.HashExp{"refund_receipt": refund.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the refund receipt, want %d", n, want)
	}
}

func requireRefundReceiptCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(refundReceiptsCollection); err != nil || n != want {
		t.Errorf("%d refund receipts stored (err %v), want %d", n, err, want)
	}
}

// setRefundReceiptStatus writes status straight to the table, past every hook,
// so a guard test holds a posted refund without posting it.
func setRefundReceiptStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_refund_receipts SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set refund receipt %s %s: %v", id, status, err)
	}
}

// postRefundReceiptAs posts a draft refund receipt as actor, as the client's
// PATCH {"status":"posted"} does once the request hook has stamped the poster.
func postRefundReceiptAs(app core.App, refundID, actor string) error {
	r, err := app.FindRecordById(refundReceiptsCollection, refundID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostRefundReceipt(t testing.TB, app core.App, refundID, actor string) *core.Record {
	t.Helper()
	if err := postRefundReceiptAs(app, refundID, actor); err != nil {
		t.Fatalf("post refund receipt %s: %v", refundID, err)
	}
	return reload(t, app, refundReceiptsCollection, refundID)
}

func voidRefundReceiptAs(app core.App, refundID, actor string) error {
	r, err := app.FindRecordById(refundReceiptsCollection, refundID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

// postedReceiptFor posts a one-line sales receipt of amount for customer
// (none when customer is nil), deposited to 1000 Business Checking.
func (rr *refundReceiptEnv) postedReceiptFor(t testing.TB, customer *core.Record, amount int64) *core.Record {
	t.Helper()
	id := ""
	if customer != nil {
		id = customer.Id
	}
	r := rr.mkReceipt(t, map[string]any{"customer": id, "deposit_to": rr.checking.Id})
	mkReceiptLine(t, rr.app, r, 0, item(rr.service, 1, amount, false))
	return mustPostReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
}

// postedMemoFor posts a one-line credit memo of amount for customer, dated
// creditMemoDay.
func (rr *refundReceiptEnv) postedMemoFor(t testing.TB, customer *core.Record, amount int64) *core.Record {
	t.Helper()
	memo := rr.mkCreditMemo(t, map[string]any{"customer": customer.Id})
	mkCreditMemoLine(t, rr.app, memo, 0, item(rr.service, 1, amount, false))
	return mustPostCreditMemo(t, rr.app, memo.Id, rr.users.bookkeeper.Id)
}

func TestRefundReceipt_DraftWithNoCustomerSaves(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r, err := rr.newRefundReceipt(map[string]any{"customer": ""})
	if err != nil {
		t.Fatalf("a draft refund receipt with no customer was refused: %v", err)
	}
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 15000, false))
	stored := reload(t, rr.app, refundReceiptsCollection, r.Id)
	if stored.GetString("customer") != "" || stored.GetString("status") != statusDraft || stored.GetString("number") != "" {
		t.Errorf("stored customer %q status %q number %q, want none, draft, none",
			stored.GetString("customer"), stored.GetString("status"), stored.GetString("number"))
	}
	requireRefundReceiptTotals(t, rr.app, r.Id, 15000, 0, 15000)
}

func TestRefundReceipt_DraftForAnActiveCustomerSaves(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, map[string]any{"memo": "Returned cables"})
	stored := reload(t, rr.app, refundReceiptsCollection, r.Id)
	if stored.GetString("customer") != rr.customer.Id || stored.GetString("status") != statusDraft ||
		stored.GetString("number") != "" || stored.GetString("refund_from") != rr.checking.Id {
		t.Errorf("stored customer %q status %q number %q refund_from %q, want Harborview Dental, draft, none, 1000 Business Checking",
			stored.GetString("customer"), stored.GetString("status"), stored.GetString("number"), stored.GetString("refund_from"))
	}
}

func TestRefundReceipt_RefusesABadDate(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	_, err := rr.newRefundReceipt(map[string]any{"date": "2026-13-40"})
	requireFieldRefusal(t, err, "date", wantDocumentDay)
	requireRefundReceiptCount(t, rr.app, 0)
}

func TestRefundReceipt_SchemaRefusesReferenceAndPaymentMethod(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	_, err := rr.newRefundReceipt(map[string]any{"reference_no": strings.Repeat("x", 41)})
	requireSchemaRefusal(t, err, "reference_no")
	_, err = rr.newRefundReceipt(map[string]any{"payment_method": "cheque"})
	requireSchemaRefusal(t, err, "payment_method")
	requireRefundReceiptCount(t, rr.app, 0)

	r := rr.mkRefundReceipt(t, map[string]any{"reference_no": strings.Repeat("x", 40), "payment_method": "check"})
	stored := reload(t, rr.app, refundReceiptsCollection, r.Id)
	if stored.GetString("payment_method") != "check" || len(stored.GetString("reference_no")) != 40 {
		t.Errorf("stored payment_method %q reference_no %q, want check and 40 characters",
			stored.GetString("payment_method"), stored.GetString("reference_no"))
	}
}

// Spec §3.2, Q3: Refund from is required and lists the sales receipt's deposit
// accounts: an active bank account or an Undeposited funds account.
func TestRefundReceipt_RefundFromIsAnActiveBankOrUndepositedAccount(t *testing.T) {
	rr := newRefundReceiptEnv(t)

	t.Run("no Refund from is refused under refund_from", func(t *testing.T) {
		_, err := rr.newRefundReceipt(map[string]any{"refund_from": ""})
		requireRefusedOnField(t, err, "refund_from")
		requireRefundReceiptCount(t, rr.app, 0)
	})

	closed := mkNumberedAccount(t, rr.app, "Old Checking", "1020", "bank", "checking")
	makeAccountInactive(t, rr.app, closed)
	for name, account := range map[string]*core.Record{
		"an inactive bank account": closed,
		"an income account":        rr.revenue,
		"a credit card account":    rr.card,
	} {
		t.Run(name+" is refused", func(t *testing.T) {
			_, err := rr.newRefundReceipt(map[string]any{"refund_from": account.Id})
			requireFieldRefusal(t, err, "refund_from", wantRefundFromInvalid)
			requireRefundReceiptCount(t, rr.app, 0)
		})
	}

	t.Run("an Undeposited funds account saves", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"refund_from": rr.undeposited.Id})
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("refund_from"); got != rr.undeposited.Id {
			t.Errorf("refund_from = %q, want 1200 Undeposited funds", got)
		}
	})
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestRefundReceipt_ServerFieldsRefused(t *testing.T) {
	body := func(rr *refundReceiptEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q,"refund_from":%q%s}`,
			rr.customer.Id, refundReceiptDay, rr.checking.Id, extra)
	}

	t.Run("a draft with no server field is created", func(t *testing.T) {
		rr := newRefundReceiptEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_refund_receipts/records",
			token: tokenFor(t, rr.users.bookkeeper), body: body(rr, ""), want: http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) { requireRefundReceiptCount(t, app, 1) },
		}.run(t, rr.app)
	})

	for name, extra := range map[string]func(t testing.TB, rr *refundReceiptEnv) string{
		"number":    func(testing.TB, *refundReceiptEnv) string { return `,"number":"1001"` },
		"sequence":  func(testing.TB, *refundReceiptEnv) string { return `,"sequence":1001` },
		"total":     func(testing.TB, *refundReceiptEnv) string { return `,"total":100` },
		"subtotal":  func(testing.TB, *refundReceiptEnv) string { return `,"subtotal":100` },
		"tax_total": func(testing.TB, *refundReceiptEnv) string { return `,"tax_total":100` },
		"currency":  func(testing.TB, *refundReceiptEnv) string { return `,"currency":"USD"` },
		// A real entry and real users, so only the rule can refuse the relation.
		"entry": func(t testing.TB, rr *refundReceiptEnv) string {
			return fmt.Sprintf(`,"entry":%q`, rr.sale(t, refundReceiptDay, 100).Id)
		},
		"posted_by": func(t testing.TB, rr *refundReceiptEnv) string {
			return fmt.Sprintf(`,"posted_by":%q`, rr.users.admin.Id)
		},
		"voided_by": func(t testing.TB, rr *refundReceiptEnv) string {
			return fmt.Sprintf(`,"voided_by":%q`, rr.users.admin.Id)
		},
	} {
		t.Run(name, func(t *testing.T) {
			rr := newRefundReceiptEnv(t)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_refund_receipts/records",
				token: tokenFor(t, rr.users.bookkeeper), body: body(rr, extra(t, rr)), want: http.StatusBadRequest,
				after: func(t testing.TB, app *tests.TestApp) { requireRefundReceiptCount(t, app, 0) },
			}.run(t, rr.app)
		})
	}
}

func TestRefundReceipt_ReaderCannotCreate(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_refund_receipts/records",
		token: tokenFor(t, rr.users.readOnly),
		body: fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q,"refund_from":%q}`,
			rr.customer.Id, refundReceiptDay, rr.checking.Id),
		want:  http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) { requireRefundReceiptCount(t, app, 0) },
	}.run(t, rr.app)
}

// books_refund_receipt_credits is server-written (spec §4.1): no client
// create, update or delete, a reader lists it. The row is written past the
// hooks, as the rules alone are under test. Each subtest has its own app.
func TestRefundReceiptCredits_ServerWrittenAndReadable(t *testing.T) {
	type credits struct {
		rr     *refundReceiptEnv
		refund *core.Record
		memo   *core.Record
		row    *core.Record
	}
	setup := func(t *testing.T) credits {
		t.Helper()
		rr := newRefundReceiptEnv(t)
		memo := rr.postedMemoFor(t, rr.customer, 25000)
		refund := rr.mkRefundReceipt(t, map[string]any{"credit_memo": memo.Id})
		row := saveRecord(t, rr.app, "books_refund_receipt_credits", map[string]any{
			"refund_receipt": refund.Id, "credit_memo": memo.Id, "amount": 10000, "position": 0,
		})
		return credits{rr: rr, refund: refund, memo: memo, row: row}
	}
	requireOneRowOf := func(t testing.TB, app core.App, c credits, amount int) {
		t.Helper()
		rows, err := app.FindAllRecords("books_refund_receipt_credits")
		if err != nil {
			t.Fatalf("read the credits rows: %v", err)
		}
		if len(rows) != 1 || rows[0].Id != c.row.Id || rows[0].GetInt("amount") != amount {
			t.Errorf("credits rows %v, want only %s with amount %d", rows, c.row.Id, amount)
		}
	}

	t.Run("a client create is refused", func(t *testing.T) {
		c := setup(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_refund_receipt_credits/records",
			token: tokenFor(t, c.rr.users.admin),
			body: fmt.Sprintf(`{"refund_receipt":%q,"credit_memo":%q,"amount":500,"position":0}`,
				c.rr.mkRefundReceipt(t, nil).Id, c.memo.Id),
			want:  http.StatusForbidden,
			after: func(t testing.TB, app *tests.TestApp) { requireOneRowOf(t, app, c, 10000) },
		}.run(t, c.rr.app)
	})
	t.Run("a client update is refused", func(t *testing.T) {
		c := setup(t)
		apiReq{
			method: http.MethodPatch, url: "/api/collections/books_refund_receipt_credits/records/" + c.row.Id,
			token: tokenFor(t, c.rr.users.admin), body: `{"amount":1}`, want: http.StatusForbidden,
			after: func(t testing.TB, app *tests.TestApp) { requireOneRowOf(t, app, c, 10000) },
		}.run(t, c.rr.app)
	})
	t.Run("a client delete is refused", func(t *testing.T) {
		c := setup(t)
		apiReq{
			method: http.MethodDelete, url: "/api/collections/books_refund_receipt_credits/records/" + c.row.Id,
			token: tokenFor(t, c.rr.users.admin), want: http.StatusForbidden,
			after: func(t testing.TB, app *tests.TestApp) { requireOneRowOf(t, app, c, 10000) },
		}.run(t, c.rr.app)
	})
	t.Run("a reader lists the rows", func(t *testing.T) {
		c := setup(t)
		apiReq{
			method: http.MethodGet, url: "/api/collections/books_refund_receipt_credits/records",
			token: tokenFor(t, c.rr.users.readOnly), want: http.StatusOK,
			content: []string{`"totalItems":1`, `"id":"` + c.row.Id + `"`, `"credit_memo":"` + c.memo.Id + `"`},
		}.run(t, c.rr.app)
	})
}

func TestRefundReceipt_RefusesNegativeTotal(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 1000, false))

	_, err := newRefundReceiptLine(rr.app, r, 1, item(rr.service, 1, -1001, false))
	requireRefusalText(t, err, wantRefundTotalNegative)
	requireRefundReceiptLineCount(t, rr.app, r, 1)
	requireRefundReceiptTotals(t, rr.app, r.Id, 1000, 0, 1000)
}

func TestRefundReceipt_RefusesTooLargeTotal(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, nil)
	for i := 0; i < 9; i++ {
		mkRefundReceiptLine(t, rr.app, r, i, item(rr.service, bigQty, bigRate, false))
	}
	requireRefundReceiptTotals(t, rr.app, r.Id, 9_000_000_000_000_000, 0, 9_000_000_000_000_000)

	// A tenth line takes the total past maxStoredAmount (2^53-1).
	_, err := newRefundReceiptLine(rr.app, r, 9, item(rr.service, bigQty, bigRate, false))
	requireRefusalText(t, err, wantRefundTotalTooLarge)
	requireRefundReceiptLineCount(t, rr.app, r, 9)
}

func TestRefundReceiptLine_RefusesTheLine251st(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	rr := refundReceiptEnvOn(t, app)
	// 249 lines written before the guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	r := saveRecord(t, app, refundReceiptsCollection, map[string]any{
		"customer": rr.customer.Id, "status": "draft", "date": refundReceiptDay,
		"refund_from": rr.checking.Id, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		saveRecord(t, app, refundReceiptLinesCol, map[string]any{
			"refund_receipt": r.Id, "kind": "description", "description": fmt.Sprintf("Note %d", i+1), "position": i,
		})
	}
	registerSalesDocGuards(app, refundReceiptKind)
	bindRefundReceiptHost(t, app)

	mkRefundReceiptLine(t, app, r, 249, descriptionLine("Note 250"))
	_, err := newRefundReceiptLine(app, r, 250, descriptionLine("Note 251"))
	requireRefusalText(t, err, wantRefundTooManyLines)
	requireRefundReceiptLineCount(t, app, r, 250)
}

func TestRefundReceipt_PostedCannotChange(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, map[string]any{"memo": "Returned cables"})
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 25000, false))
	setRefundReceiptStatus(t, rr.app, r.Id, statusPosted)

	err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"memo": "Changed"})
	requireRefusalText(t, err, wantRefundNotDraft)
	if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("memo"); got != "Returned cables" {
		t.Errorf("memo = %q after the refusal, want Returned cables", got)
	}
}

func TestRefundReceipt_DeleteOnlyDraft(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	posted := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, posted, 0, item(rr.service, 1, 25000, false))
	stale := reload(t, rr.app, refundReceiptsCollection, posted.Id)
	setRefundReceiptStatus(t, rr.app, posted.Id, statusPosted)

	requireRefusalText(t, rr.app.Delete(stale), wantRefundDeleteDraft)
	if _, err := rr.app.FindRecordById(refundReceiptsCollection, posted.Id); err != nil {
		t.Fatalf("the posted refund receipt is gone: %v", err)
	}
	requireRefundReceiptLineCount(t, rr.app, posted, 1)

	draft := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, draft, 0, item(rr.service, 1, 25000, false))
	mkRefundReceiptLine(t, rr.app, draft, 1, descriptionLine("Returned at the front office"))
	if err := rr.app.Delete(reload(t, rr.app, refundReceiptsCollection, draft.Id)); err != nil {
		t.Fatalf("delete a draft refund receipt: %v", err)
	}
	if _, err := rr.app.FindRecordById(refundReceiptsCollection, draft.Id); err == nil {
		t.Error("the deleted draft is still there")
	}
	requireRefundReceiptLineCount(t, rr.app, draft, 0)
}

func TestRefundReceiptLine_StaysOnItsRefundReceipt(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	first := rr.mkRefundReceipt(t, nil)
	second := rr.mkRefundReceipt(t, nil)
	line := mkRefundReceiptLine(t, rr.app, first, 0, item(rr.service, 2, 45000, false))
	requireRefundReceiptTotals(t, rr.app, first.Id, 90000, 0, 90000)

	err := setFields(t, rr.app, refundReceiptLinesCol, line.Id, map[string]any{"refund_receipt": second.Id})
	requireRefusalText(t, err, wantRefundLineStays)
	if got := reload(t, rr.app, refundReceiptLinesCol, line.Id).GetString("refund_receipt"); got != first.Id {
		t.Errorf("line refund_receipt = %q after the refusal, want the first refund", got)
	}
	requireRefundReceiptLineCount(t, rr.app, second, 0)
}

func TestRefundReceiptLine_RefusedOnPostedRefundReceipt(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, nil)
	line := mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 25000, false))
	setRefundReceiptStatus(t, rr.app, r.Id, statusPosted)

	_, err := newRefundReceiptLine(rr.app, r, 1, item(rr.service, 1, 100, false))
	requireRefusalText(t, err, wantRefundLineNotDraft)
	err = setFields(t, rr.app, refundReceiptLinesCol, line.Id, map[string]any{"quantity": 2})
	requireRefusalText(t, err, wantRefundLineNotDraft)
	requireRefundReceiptLineCount(t, rr.app, r, 1)
	requireRefundReceiptTotals(t, rr.app, r.Id, 25000, 0, 25000)
}

// Lesson 8: the Go line check reads the cells each row kind of the host
// requires. A refund receipt's line is checked as a sales receipt's: each case
// is saved on a sales receipt and on a refund receipt of the same app, and the
// refund's outcome is the receipt's (a refusal with the same text, or none).
func TestRefundReceiptLine_EachRequiredCellAsTheSalesReceipt(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	cases := []struct {
		name  string
		above []map[string]any
		line  map[string]any
		// want is the refund's refusal text; "" is the sales receipt's outcome, whatever it is.
		want string
	}{
		{"an item line with no product", nil,
			map[string]any{"kind": "item", "quantity": 1, "rate": 100}, fmt.Sprintf(wantNeedsProduct, 1)},
		{"an item line with no quantity", nil,
			map[string]any{"kind": "item", "product": rr.service.Id, "rate": 45000}, fmt.Sprintf(wantQuantityNotPositive, 1)},
		{"an item line with no rate", nil,
			map[string]any{"kind": "item", "product": rr.service.Id, "quantity": 1}, ""},
		{"a percent line with no percent", []map[string]any{item(rr.service, 1, 45000, false)},
			map[string]any{"kind": "percent", "product": rr.discount.Id}, ""},
		{"a percent line that follows a description line",
			[]map[string]any{item(rr.service, 1, 45000, false), descriptionLine("Annex")},
			percentLine(rr.discount, -100000), fmt.Sprintf(wantPercentTarget, 3)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			receipt := rr.mkReceipt(t, nil)
			refund := rr.mkRefundReceipt(t, nil)
			for i, above := range tc.above {
				mkReceiptLine(t, rr.app, receipt, i, above)
				mkRefundReceiptLine(t, rr.app, refund, i, above)
			}
			_, receiptErr := newReceiptLine(rr.app, receipt, len(tc.above), tc.line)
			_, refundErr := newRefundReceiptLine(rr.app, refund, len(tc.above), tc.line)
			if tc.want != "" {
				requireRefusalText(t, receiptErr, tc.want)
				requireRefusalText(t, refundErr, tc.want)
				requireRefundReceiptLineCount(t, rr.app, refund, int64(len(tc.above)))
				return
			}
			if (receiptErr == nil) != (refundErr == nil) {
				t.Fatalf("sales receipt refusal %v, refund receipt refusal %v; want the same outcome", receiptErr, refundErr)
			}
			if receiptErr != nil {
				if got, want := apiErrorOf(t, refundErr).Message, apiErrorOf(t, receiptErr).Message; got != want {
					t.Errorf("refund receipt refusal %q, want the sales receipt's %q", got, want)
				}
			}
		})
	}

	t.Run("an unknown kind", func(t *testing.T) {
		refund := rr.mkRefundReceipt(t, nil)
		_, err := newRefundReceiptLine(rr.app, refund, 0, map[string]any{"kind": "account", "account": rr.revenue.Id, "amount": 100})
		requireRefusalText(t, err, fmt.Sprintf(wantRefundUnknownKind, 1))
		requireRefundReceiptLineCount(t, rr.app, refund, 0)
	})

	t.Run("each kind with its own cells is accepted", func(t *testing.T) {
		refund := rr.mkRefundReceipt(t, nil)
		mkRefundReceiptLine(t, rr.app, refund, 0, item(rr.service, 1, 45000, false))
		mkRefundReceiptLine(t, rr.app, refund, 1, subtotalLine())
		mkRefundReceiptLine(t, rr.app, refund, 2, percentLine(rr.discount, -100000))
		mkRefundReceiptLine(t, rr.app, refund, 3, descriptionLine("Annex"))
		requireRefundReceiptTotals(t, rr.app, refund.Id, 40500, 0, 40500)
	})
}

func TestRefundReceiptLine_RefusesAnInactiveProduct(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	r := rr.mkRefundReceipt(t, nil)
	_, err := newRefundReceiptLine(rr.app, r, 0, item(rr.retired, 1, 1000, false))
	requireRefusalText(t, err, wantProductInactive(1, "Old retainer"))
	requireRefundReceiptLineCount(t, rr.app, r, 0)
}

func TestRefundReceipt_RefusesAnInactiveTaxRate(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	boulder := mkTaxRate(t, rr.app, "Boulder city", 38600, rr.cityDept)
	if err := setTaxRate(t, rr.app, boulder.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Boulder city inactive: %v", err)
	}
	_, err := rr.newRefundReceipt(map[string]any{"tax_rate": boulder.Id})
	requireFieldRefusal(t, err, "tax_rate", wantDocumentTaxInactive)
	requireRefundReceiptCount(t, rr.app, 0)
}

// A refund has at most one source (spec §4.3).
func TestRefundReceipt_RefusesTwoSources(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.postedReceiptFor(t, rr.customer, 45000)
	memo := rr.postedMemoFor(t, rr.customer, 25000)

	_, err := rr.newRefundReceipt(map[string]any{"sales_receipt": receipt.Id, "credit_memo": memo.Id})
	requireRefusalText(t, err, wantRefundOneSource)
	requireRefundReceiptCount(t, rr.app, 0)
}

// The sales receipt link (spec §3.2, §4.3, Q5): a refund may name a posted
// sales receipt of its own customer (both may have none), and nothing else.
func TestRefundReceipt_SalesReceiptLinkGuard(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	posted := rr.postedReceiptFor(t, rr.customer, 45000)
	walkIn := rr.postedReceiptFor(t, nil, 3500)
	draftReceipt := rr.mkReceipt(t, nil)
	mkReceiptLine(t, rr.app, draftReceipt, 0, item(rr.service, 1, 45000, false))
	voided := rr.postedReceiptFor(t, rr.customer, 30000)
	if err := voidReceiptAs(rr.app, voided.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a sales receipt: %v", err)
	}
	othersReceipt := rr.postedReceiptFor(t, rr.riverside, 20000)

	t.Run("a posted sales receipt of the same customer is linked", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"sales_receipt": posted.Id})
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("sales_receipt"); got != posted.Id {
			t.Errorf("sales_receipt = %q, want the posted receipt", got)
		}
	})

	t.Run("a posted walk-in receipt is linked to a refund with no customer", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"customer": "", "sales_receipt": walkIn.Id})
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("sales_receipt"); got != walkIn.Id {
			t.Errorf("sales_receipt = %q, want the walk-in receipt", got)
		}
	})

	for name, receiptID := range map[string]string{
		"a draft sales receipt":            draftReceipt.Id,
		"a void sales receipt":             voided.Id,
		"another customer's sales receipt": othersReceipt.Id,
		"a sales receipt that is not":      "nosuchreceipt01",
	} {
		t.Run(name+" is refused", func(t *testing.T) {
			before, _ := rr.app.CountRecords(refundReceiptsCollection)
			_, err := rr.newRefundReceipt(map[string]any{"sales_receipt": receiptID})
			requireFieldRefusal(t, err, "sales_receipt", wantRefundSalesReceipt)
			requireRefundReceiptCount(t, rr.app, before)

			r := rr.mkRefundReceipt(t, nil)
			err = setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"sales_receipt": receiptID})
			requireFieldRefusal(t, err, "sales_receipt", wantRefundSalesReceipt)
			if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("sales_receipt"); got != "" {
				t.Errorf("sales_receipt = %q after the refusal, want none", got)
			}
		})
	}

	t.Run("another customer on a linked draft is refused", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"sales_receipt": posted.Id})
		err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"customer": rr.riverside.Id})
		requireFieldRefusal(t, err, "sales_receipt", wantRefundSalesReceipt)
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("customer"); got != rr.customer.Id {
			t.Errorf("customer = %q after the refusal, want Harborview Dental", got)
		}
	})

	t.Run("clearing the link saves", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"sales_receipt": posted.Id})
		if err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"sales_receipt": ""}); err != nil {
			t.Fatalf("clear the sales receipt link: %v", err)
		}
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("sales_receipt"); got != "" {
			t.Errorf("sales_receipt = %q, want none", got)
		}
	})
}

// Q13: a void keeps the link. The guard runs only when the link or the
// customer changes, so a draft whose receipt was voided after the link was
// stored still saves and posts.
func TestRefundReceipt_LinkedDraftOfAVoidedSalesReceiptSavesAndPosts(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	receipt := rr.postedReceiptFor(t, rr.customer, 45000)
	r := rr.mkRefundReceipt(t, map[string]any{"sales_receipt": receipt.Id})
	mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 10000, false))
	if err := voidReceiptAs(rr.app, receipt.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the linked sales receipt: %v", err)
	}

	if err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"memo": "Refunded after the void"}); err != nil {
		t.Fatalf("a memo edit of a draft whose sales receipt was voided was refused: %v", err)
	}
	posted := mustPostRefundReceipt(t, rr.app, r.Id, rr.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetString("sales_receipt") != receipt.Id ||
		posted.GetString("memo") != "Refunded after the void" {
		t.Errorf("refund status %q sales_receipt %q memo %q, want posted, linked to the void receipt, with the new memo",
			posted.GetString("status"), posted.GetString("sales_receipt"), posted.GetString("memo"))
	}
}

// The credit memo link (spec §3.3, §4.3, Q1): a payout names a posted credit
// memo of its customer that has unapplied credit, and keeps it.
func TestRefundReceipt_CreditMemoLinkGuard(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	posted := rr.postedMemoFor(t, rr.customer, 25000)
	draftMemo := rr.mkCreditMemo(t, nil)
	mkCreditMemoLine(t, rr.app, draftMemo, 0, item(rr.service, 1, 25000, false))
	voided := rr.postedMemoFor(t, rr.customer, 30000)
	if err := voidCreditMemoAs(rr.app, voided.Id, rr.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a credit memo: %v", err)
	}
	othersMemo := rr.postedMemoFor(t, rr.riverside, 20000)
	usedUp := rr.postedMemoFor(t, rr.customer, 15000)
	setDocumentBalanceRaw(t, rr.app, "books_credit_memos", usedUp.Id, 0)

	t.Run("a posted memo of the customer with unapplied credit is linked", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"credit_memo": posted.Id})
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("credit_memo"); got != posted.Id {
			t.Errorf("credit_memo = %q, want the posted memo", got)
		}
	})

	for name, memoID := range map[string]string{
		"a draft credit memo":            draftMemo.Id,
		"a void credit memo":             voided.Id,
		"another customer's credit memo": othersMemo.Id,
		"a credit memo with balance 0":   usedUp.Id,
	} {
		t.Run(name+" is refused", func(t *testing.T) {
			before, _ := rr.app.CountRecords(refundReceiptsCollection)
			_, err := rr.newRefundReceipt(map[string]any{"credit_memo": memoID})
			requireFieldRefusal(t, err, "credit_memo", wantRefundCreditMemo)
			requireRefundReceiptCount(t, rr.app, before)
		})
	}

	t.Run("changing the memo of a stored payout is refused", func(t *testing.T) {
		second := rr.postedMemoFor(t, rr.customer, 12000)
		r := rr.mkRefundReceipt(t, map[string]any{"credit_memo": posted.Id})
		err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"credit_memo": second.Id})
		requireRefusalText(t, err, wantRefundPayoutStays)
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("credit_memo"); got != posted.Id {
			t.Errorf("credit_memo = %q after the refusal, want the first memo", got)
		}
	})

	t.Run("clearing the memo of a stored payout is refused", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, map[string]any{"credit_memo": posted.Id})
		err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"credit_memo": ""})
		requireRefusalText(t, err, wantRefundPayoutStays)
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("credit_memo"); got != posted.Id {
			t.Errorf("credit_memo = %q after the refusal, want the memo it named", got)
		}
	})

	t.Run("a plain refund cannot become a payout", func(t *testing.T) {
		r := rr.mkRefundReceipt(t, nil)
		err := setFields(t, rr.app, refundReceiptsCollection, r.Id, map[string]any{"credit_memo": posted.Id})
		requireRefusalText(t, err, wantRefundPayoutStays)
		if got := reload(t, rr.app, refundReceiptsCollection, r.Id).GetString("credit_memo"); got != "" {
			t.Errorf("credit_memo = %q after the refusal, want none", got)
		}
	})
}

// A correction keeps its original's credit memo (spec §3.3, §3.8, §4.3): an
// edit of a payout cannot clear the memo or name another one, and an edit of a
// plain refund cannot add one. Else the post would release the original
// payout's credit and post the correction against income and tax.
func TestRefundReceipt_CorrectionKeepsTheCreditMemo(t *testing.T) {
	rr := newRefundReceiptEnv(t)
	actor := rr.users.bookkeeper.Id
	memo := rr.postedMemoFor(t, rr.customer, 25000)
	second := rr.postedMemoFor(t, rr.customer, 12000)

	payout := rr.mkRefundReceipt(t, map[string]any{"credit_memo": memo.Id})
	mkRefundReceiptLine(t, rr.app, payout, 0, item(rr.service, 1, 10000, false))
	payout = mustPostRefundReceipt(t, rr.app, payout.Id, actor)

	plain := rr.mkRefundReceipt(t, nil)
	mkRefundReceiptLine(t, rr.app, plain, 0, item(rr.service, 1, 10000, false))
	plain = mustPostRefundReceipt(t, rr.app, plain.Id, actor)

	for name, fields := range map[string]map[string]any{
		"a correction of a payout that clears the memo":    {"replaces": payout.Id, "credit_memo": ""},
		"a correction of a payout that names another memo": {"replaces": payout.Id, "credit_memo": second.Id},
		"a correction of a plain refund that names a memo": {"replaces": plain.Id, "credit_memo": memo.Id},
	} {
		t.Run(name+" is refused", func(t *testing.T) {
			before, _ := rr.app.CountRecords(refundReceiptsCollection)
			_, err := rr.newRefundReceipt(fields)
			requireRefusalText(t, err, wantRefundPayoutStays)
			requireRefundReceiptCount(t, rr.app, before)
		})
	}
}
