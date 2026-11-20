package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The refusal texts of apply credit spec §3, as the client gets them.
const (
	wantMemoApplyNotPosted             = "Only a posted credit memo is applied to invoices."
	wantMemoApplyDraftInvoice          = "This invoice is not open. Clear it to continue."
	wantInvoiceVoidCredited            = "Credit memos are applied to this invoice. Remove them first."
	wantCreditMemoVoidApplied          = "This credit is applied to invoices. Remove it from those invoices first."
	wantMemoCorrectionCustomerApplied  = "This credit is applied to invoices, so its customer cannot change."
	wantInvoiceCorrectionCustomerCreds = "Credit memos are applied to this invoice, so its customer cannot change."

	memoApplicationsCol = "books_credit_memo_applications"
	memoApplyCreditDay  = "2026-11-12"
	memoApplyInvoiceDay = "2026-11-04"
	memoApplyDay        = "2026-11-16"
)

func wantMemoApplyInvoiceNotOpen(number string) string {
	return fmt.Sprintf("Invoice %s is not open. Clear it to continue.", number)
}

func wantMemoApplyAboveInvoice(number, open string) string {
	return fmt.Sprintf("Invoice %s: the credit is more than its open balance of %s.", number, open)
}

func wantMemoApplyAboveUnapplied(number, left string) string {
	return fmt.Sprintf("Credit memo %s has %s of unapplied credit. Clear it or lower the amount.", number, left)
}

func wantMemoCorrectionBelowApplied(applied string) string {
	return fmt.Sprintf("%s of this credit is applied to invoices. Its total cannot be below that.", applied)
}

func wantMemoCorrectionBelowAll(sum string) string {
	return fmt.Sprintf("%s of this credit is applied or refunded. Its total cannot be below that.", sum)
}

func wantMemoCorrectionApplyDate(number, day string) string {
	return fmt.Sprintf("This credit is applied to invoice %s on %s. Date the credit memo on or before that day.", number, day)
}

func wantInvoiceCorrectionBelowAll(sum string) string {
	return fmt.Sprintf("Payments and credits of %s are applied to this invoice. Its total cannot be below that.", sum)
}

// memoApplyEnv is one book with the ledger, the invoice, credit memo, refund
// receipt, payment, write-off and credit memo application guards bound, the
// three forms hosts, the receipt env's accounts, Harborview Dental and
// Riverside Clinic, and 6050 Bad debts for a write-off.
type memoApplyEnv struct {
	*refundReceiptEnv
	wo     *writeOffEnv
	client *restClient
}

func newMemoApplyEnv(t *testing.T) *memoApplyEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, creditMemoKind)
	registerSalesDocGuards(app, refundReceiptKind)
	registerPaymentGuards(app)
	registerWriteOffGuards(app)
	registerCreditMemoApplications(app)
	// Core keeps one set of bound hosts per app, so the three are bound in one call.
	bindHostsByKey(t, app, invoiceKind.HostKey, creditMemoHostKey, refundReceiptHostKey)
	rr := refundReceiptEnvOn(t, app)
	wo := &writeOffEnv{
		receiptEnv: rr.receiptEnv,
		badDebts:   mkNumberedAccount(t, app, "Bad debts", "6050", "expense", "bad_debts"),
		actor:      rr.users.bookkeeper.Id,
	}
	return &memoApplyEnv{refundReceiptEnv: rr, wo: wo}
}

func (me *memoApplyEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if me.client == nil {
		me.client = newRestClient(t, me.app)
	}
	return me.client
}

// invoice posts a one-line, non-taxable invoice of customer dated
// memoApplyInvoiceDay.
func (me *memoApplyEnv) invoice(t testing.TB, customer *core.Record, total int64) *core.Record {
	t.Helper()
	return me.wo.postedInvoiceOn(t, customer, memoApplyInvoiceDay, total)
}

// postedMemo posts a one-line, non-taxable credit memo of customer dated day.
func (me *memoApplyEnv) postedMemo(t testing.TB, customer *core.Record, day string, total int64) *core.Record {
	t.Helper()
	memo := me.mkCreditMemo(t, map[string]any{"customer": customer.Id, "date": day})
	mkCreditMemoLine(t, me.app, memo, 0, item(me.service, 1, total, false))
	return mustPostCreditMemo(t, me.app, memo.Id, me.users.bookkeeper.Id)
}

// applyAs sends one application create as user.
func (me *memoApplyEnv) applyAs(t testing.TB, user, memo, invoice *core.Record, amount int64, day string) restAnswer {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"credit_memo": memo.Id, "invoice": invoice.Id, "amount": amount, "date": day})
	if err != nil {
		t.Fatal(err)
	}
	status, out := me.rest(t).send(t, user, http.MethodPost, "/api/collections/"+memoApplicationsCol+"/records", string(raw))
	return restAnswer{status: status, body: out}
}

// applyBy applies amount of memo to invoice on day as user and returns the
// application as stored.
func (me *memoApplyEnv) applyBy(t testing.TB, user, memo, invoice *core.Record, amount int64, day string) *core.Record {
	t.Helper()
	a := me.applyAs(t, user, memo, invoice, amount, day)
	if a.status != http.StatusOK {
		t.Fatalf("apply %d of credit memo %s to invoice %s answered %d; body: %s",
			amount, memo.GetString("number"), invoice.GetString("number"), a.status, a.body)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(a.body), &created); err != nil || created.ID == "" {
		t.Fatalf("read the created application: %v; body: %s", err, a.body)
	}
	return reload(t, me.app, memoApplicationsCol, created.ID)
}

func (me *memoApplyEnv) apply(t testing.TB, memo, invoice *core.Record, amount int64, day string) *core.Record {
	t.Helper()
	return me.applyBy(t, me.users.bookkeeper, memo, invoice, amount, day)
}

// removeAs sends one application delete as user.
func (me *memoApplyEnv) removeAs(t testing.TB, user, application *core.Record) restAnswer {
	t.Helper()
	status, out := me.rest(t).send(t, user, http.MethodDelete,
		"/api/collections/"+memoApplicationsCol+"/records/"+application.Id, "")
	return restAnswer{status: status, body: out}
}

func (me *memoApplyEnv) remove(t testing.TB, application *core.Record) {
	t.Helper()
	if a := me.removeAs(t, me.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("a writer's delete of the application answered %d, want 204; body: %s", a.status, a.body)
	}
}

// requireMemo checks the memo's stored balance and applied.
func requireMemo(t testing.TB, app core.App, memo *core.Record, balance, applied int) {
	t.Helper()
	r := reload(t, app, "books_credit_memos", memo.Id)
	if got, want := [2]int{r.GetInt("balance"), r.GetInt("applied")}, [2]int{balance, applied}; got != want {
		t.Errorf("credit memo %s balance/applied = %v, want %v", memo.GetString("number"), got, want)
	}
}

func requireMemoApplicationCount(t testing.TB, app core.App, want int64, where ...dbx.Expression) {
	t.Helper()
	if n, err := app.CountRecords(memoApplicationsCol, where...); err != nil || n != want {
		t.Errorf("%d credit memo applications stored (err %v), want %d", n, err, want)
	}
}

func requireMemoApplyClean(t testing.TB, app core.App) {
	t.Helper()
	requireNoDrift(t, app)
	requireNoDocumentDrift(t, app)
}

func TestCreditMemoApplication_RefusalsComeInTheSpecOrder(t *testing.T) {
	me := newMemoApplyEnv(t)
	posted := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	draft := me.mkCreditMemo(t, map[string]any{"date": memoApplyCreditDay})
	mkCreditMemoLine(t, me.app, draft, 0, item(me.service, 1, 25000, false))
	voidInv := me.invoice(t, me.customer, 10000)
	if err := voidInvoiceAs(me.app, voidInv.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("void an invoice: %v", err)
	}
	others := me.invoice(t, me.riverside, 10000)
	open := me.invoice(t, me.customer, 10000)

	me.applyAs(t, me.users.bookkeeper, draft, voidInv, 1000, memoApplyDay).
		requireField(t, "credit_memo", wantMemoApplyNotPosted)
	me.applyAs(t, me.users.bookkeeper, posted, others, 1000, memoApplyDay).
		requireField(t, "invoice", wantMemoApplyInvoiceNotOpen(others.GetString("number")))
	// Above the invoice's 100.00 and the memo's 250.00: the invoice is checked first.
	me.applyAs(t, me.users.bookkeeper, posted, open, 30000, memoApplyDay).
		requireField(t, "invoice", wantMemoApplyAboveInvoice(open.GetString("number"), "$100.00"))

	requireMemoApplicationCount(t, me.app, 0)
	requireMemo(t, me.app, posted, 25000, 0)
	requireInvoiceBalance(t, me.app, open, 10000)
	requireInvoiceBalance(t, me.app, others, 10000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_CreateAndDeleteMoveBothBalancesAndApplied(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	entries := journalEntryCount(t, me.app)

	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	if got := application.GetString("applied_by"); got != me.users.bookkeeper.Id {
		t.Errorf("applied_by = %q, want the writer %q", got, me.users.bookkeeper.Id)
	}
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemo(t, me.app, memo, 10000, 15000)
	if got := journalEntryCount(t, me.app); got != entries {
		t.Errorf("%d journal entries after the application, want %d: an application posts no entry", got, entries)
	}
	requireMemoApplyClean(t, me.app)

	me.remove(t, application)
	requireMemoApplicationCount(t, me.app, 0)
	requireInvoiceBalance(t, me.app, inv, 40000)
	requireMemo(t, me.app, memo, 25000, 0)
	if got := journalEntryCount(t, me.app); got != entries {
		t.Errorf("%d journal entries after the delete, want %d: a delete posts no entry", got, entries)
	}
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_APartOfAnInvoiceLeavesItPosted(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)

	me.apply(t, memo, inv, 15000, memoApplyDay)
	requireInvoiceStatus(t, me.app, inv, statusPosted)
	requireInvoiceBalance(t, me.app, inv, 40000-15000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_ManyMemosAndManyInvoicesSum(t *testing.T) {
	me := newMemoApplyEnv(t)
	first := me.invoice(t, me.customer, 40000)
	second := me.invoice(t, me.customer, 30000)
	memoA := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	memoB := me.postedMemo(t, me.customer, memoApplyCreditDay, 20000)

	// Two memos on one invoice.
	me.apply(t, memoA, first, 10000, memoApplyDay)
	me.apply(t, memoB, first, 12000, memoApplyDay)
	// One memo on two invoices.
	me.apply(t, memoA, second, 9000, memoApplyDay)

	requireInvoiceBalance(t, me.app, first, 40000-10000-12000)
	requireInvoiceBalance(t, me.app, second, 30000-9000)
	requireMemo(t, me.app, memoA, 25000-19000, 19000)
	requireMemo(t, me.app, memoB, 20000-12000, 12000)
	requireMemoApplicationCount(t, me.app, 3)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_AFullCreditIsNoWriteOff(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 10000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)

	me.apply(t, memo, inv, 10000, memoApplyDay)
	requireWrittenOff(t, me.app, inv, 0, 0)
	requireMemo(t, me.app, memo, 15000, 10000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_IsNeverUpdated(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	other := me.invoice(t, me.customer, 30000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	otherMemo := me.postedMemo(t, me.customer, memoApplyCreditDay, 20000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)

	status, body := me.rest(t).send(t, me.users.bookkeeper, http.MethodPatch,
		"/api/collections/"+memoApplicationsCol+"/records/"+application.Id, `{"amount":1000}`)
	restAnswer{status: status, body: body}.requireRefused(t, "a client update of amount")

	for field, value := range map[string]any{
		"amount": 1000, "date": "2026-11-17", "invoice": other.Id, "credit_memo": otherMemo.Id,
	} {
		t.Run(field, func(t *testing.T) {
			err := setFields(t, me.app, memoApplicationsCol, application.Id, map[string]any{field: value})
			requireRefusalText(t, err, wantApplicationNotChanged)
		})
	}

	stored := reload(t, me.app, memoApplicationsCol, application.Id)
	if stored.GetInt("amount") != 15000 || stored.GetString("date") != memoApplyDay ||
		stored.GetString("invoice") != inv.Id || stored.GetString("credit_memo") != memo.Id {
		t.Errorf("application after the refusals = amount %d, date %q, invoice %q, memo %q; want it unchanged",
			stored.GetInt("amount"), stored.GetString("date"), stored.GetString("invoice"), stored.GetString("credit_memo"))
	}
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemo(t, me.app, memo, 10000, 15000)
	requireMemoApplyClean(t, me.app)
}

// The delete of the user who applied the credit unlinks applied_by: that
// update is the one the guard lets through.
func TestCreditMemoApplication_DeletingTheApplierClearsAppliedBy(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	applier := mkUser(t, me.app, "member")
	setPkgAccess(t, me.app, applier, "full")
	application := me.applyBy(t, applier, memo, inv, 15000, memoApplyDay)
	if got := application.GetString("applied_by"); got != applier.Id {
		t.Fatalf("applied_by = %q, want the applier %q", got, applier.Id)
	}

	if err := me.app.Delete(applier); err != nil {
		t.Fatalf("the delete of the applier was refused: %v", err)
	}
	stored := reload(t, me.app, memoApplicationsCol, application.Id)
	if got := stored.GetString("applied_by"); got != "" {
		t.Errorf("applied_by = %q after the applier's delete, want empty", got)
	}
	if stored.GetInt("amount") != 15000 {
		t.Errorf("application amount = %d after the applier's delete, want 15000", stored.GetInt("amount"))
	}
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemo(t, me.app, memo, 10000, 15000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_DeleteOnTheCloseDate(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	setCloseDate(t, me.app, memoApplyDay)

	me.removeAs(t, me.users.bookkeeper, application).requireMessage(t, wantClosedThrough(memoApplyDay))
	requireMemoApplicationCount(t, me.app, 1)

	// A write with no user (a hook, a migration) is held to the close date too.
	stored := reload(t, me.app, memoApplicationsCol, application.Id)
	requireRefusalText(t, me.app.Delete(stored), wantClosedThrough(memoApplyDay))
	requireMemoApplicationCount(t, me.app, 1)
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemo(t, me.app, memo, 10000, 15000)

	grantOverride(t, me.app, me.users.bookkeeper, time.Now().Add(time.Hour))
	me.remove(t, application)
	requireMemoApplicationCount(t, me.app, 0)
	requireInvoiceBalance(t, me.app, inv, 40000)
	requireMemo(t, me.app, memo, 25000, 0)
	requireMemoApplyClean(t, me.app)
}

func TestInvoiceVoid_RefusedWhileACreditMemoIsApplied(t *testing.T) {
	actor := func(me *memoApplyEnv) string { return me.users.bookkeeper.Id }

	t.Run("a credit only", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 15000, memoApplyDay)

		requireMessageOnlyRefusal(t, voidInvoiceAs(me.app, inv.Id, actor(me)), wantInvoiceVoidCredited)
		requireInvoiceStatus(t, me.app, inv, statusPosted)
		requireMemoApplyClean(t, me.app)
	})
	t.Run("a posted write-off is named first", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 15000, memoApplyDay)
		me.wo.mkWriteOff(t, inv, map[string]any{"date": "2026-11-17"})

		requireRefusalText(t, voidInvoiceAs(me.app, inv.Id, actor(me)), wantInvoiceWrittenOff)
		requireInvoiceStatus(t, me.app, inv, statusPosted)
		requireMemoApplyClean(t, me.app)
	})
	t.Run("the credit is named before a payment", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 15000, memoApplyDay)
		me.wo.pay(t, inv, memoApplyDay, 5000)

		requireMessageOnlyRefusal(t, voidInvoiceAs(me.app, inv.Id, actor(me)), wantInvoiceVoidCredited)
		requireInvoiceStatus(t, me.app, inv, statusPosted)
		requireInvoiceBalance(t, me.app, inv, 20000)
		requireMemoApplyClean(t, me.app)
	})
}

func TestCreditMemoVoid_RefusedWhileApplied(t *testing.T) {
	t.Run("an application only", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 15000, memoApplyDay)

		requireMessageOnlyRefusal(t, voidCreditMemoAs(me.app, memo.Id, me.users.bookkeeper.Id), wantCreditMemoVoidApplied)
		if s := reload(t, me.app, "books_credit_memos", memo.Id).GetString("status"); s != statusPosted {
			t.Errorf("memo status %q after the refusal, want posted", s)
		}
		requireMemo(t, me.app, memo, 10000, 15000)
		requireMemoApplyClean(t, me.app)
	})
	t.Run("the application is named before a payout", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 15000, memoApplyDay)
		me.postedPayout(t, memo, 5000)

		requireMessageOnlyRefusal(t, voidCreditMemoAs(me.app, memo.Id, me.users.bookkeeper.Id), wantCreditMemoVoidApplied)
		requireMemo(t, me.app, memo, 5000, 15000)
		requireMemoApplyClean(t, me.app)
	})
}

func TestInvoiceCorrection_TakesTheCreditApplications(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	me.wo.pay(t, inv, memoApplyDay, 5000)

	draft := me.invoiceCorrection(t, inv, me.customer, 40000)
	if err := postInvoiceAs(me.app, draft.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the invoice correction: %v", err)
	}
	requireApplicationOf(t, me.app, application, "invoice", draft.Id)
	requireMemoApplicationCount(t, me.app, 0, dbx.HashExp{"invoice": inv.Id})
	requireInvoiceBalance(t, me.app, draft, 40000-5000-15000)
	requireMemo(t, me.app, memo, 10000, 15000)
	requireMemoApplyClean(t, me.app)
}

func requireApplicationOf(t testing.TB, app core.App, application *core.Record, field, want string) {
	t.Helper()
	if got := reload(t, app, memoApplicationsCol, application.Id).GetString(field); got != want {
		t.Errorf("application %s = %q, want %q", field, got, want)
	}
}

// The three below-total texts carry no field key; the customer texts carry the
// key the payments' customer text has (none).
func TestInvoiceCorrection_RefusedBelowCreditsOrForAnotherCustomer(t *testing.T) {
	cases := []struct {
		name     string
		pay      int64
		total    int64
		customer func(me *memoApplyEnv) *core.Record
		want     string
	}{
		{"a total below payments and credits", 10000, 24999, func(me *memoApplyEnv) *core.Record { return me.customer }, wantInvoiceCorrectionBelowAll("$250.00")},
		{"another customer with a credit only", 0, 40000, func(me *memoApplyEnv) *core.Record { return me.riverside }, wantInvoiceCorrectionCustomerCreds},
		{"another customer with a payment too", 10000, 40000, func(me *memoApplyEnv) *core.Record { return me.riverside }, wantInvoiceCorrectionCustomer},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			me := newMemoApplyEnv(t)
			inv := me.invoice(t, me.customer, 40000)
			memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
			application := me.apply(t, memo, inv, 15000, memoApplyDay)
			if tc.pay > 0 {
				me.wo.pay(t, inv, memoApplyDay, tc.pay)
			}
			draft := me.invoiceCorrection(t, inv, tc.customer(me), tc.total)

			requireMessageOnlyRefusal(t, postInvoiceAs(me.app, draft.Id, me.users.bookkeeper.Id), tc.want)
			requireInvoiceStatus(t, me.app, inv, statusPosted)
			requireApplicationOf(t, me.app, application, "invoice", inv.Id)
			requireMemoApplyClean(t, me.app)
		})
	}

	t.Run("a total below payments only keeps the payments text", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		me.wo.pay(t, inv, memoApplyDay, 30000)
		draft := me.invoiceCorrection(t, inv, me.customer, 29999)

		requireMessageOnlyRefusal(t, postInvoiceAs(me.app, draft.Id, me.users.bookkeeper.Id), wantInvoiceCorrectionBelow30000)
		requireInvoiceStatus(t, me.app, inv, statusPosted)
		requireMemoApplyClean(t, me.app)
	})
}

func TestCreditMemoCorrection_TakesTheApplications(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)

	draft := me.memoCorrection(t, memo, 25000, nil)
	if err := postCreditMemoAs(me.app, draft.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the credit memo correction: %v", err)
	}
	requireApplicationOf(t, me.app, application, "credit_memo", draft.Id)
	requireMemo(t, me.app, draft, 10000, 15000)
	if got := reload(t, me.app, "books_credit_memos", memo.Id).GetInt("applied"); got != 0 {
		t.Errorf("the replaced memo's applied = %d, want 0", got)
	}
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoCorrection_RefusedWhileApplied(t *testing.T) {
	cases := []struct {
		name   string
		payout int64
		total  int64
		fields func(me *memoApplyEnv) map[string]any
		check  func(t *testing.T, err error)
	}{
		{
			name: "a total below the applied credit", total: 14999,
			fields: func(*memoApplyEnv) map[string]any { return nil },
			check: func(t *testing.T, err error) {
				requireMessageOnlyRefusal(t, err, wantMemoCorrectionBelowApplied("$150.00"))
			},
		},
		{
			name: "a total below the applied and refunded credit", payout: 8000, total: 22999,
			fields: func(*memoApplyEnv) map[string]any { return nil },
			check: func(t *testing.T, err error) {
				requireMessageOnlyRefusal(t, err, wantMemoCorrectionBelowAll("$230.00"))
			},
		},
		{
			name: "another customer", total: 25000,
			fields: func(me *memoApplyEnv) map[string]any { return map[string]any{"customer": me.riverside.Id} },
			check: func(t *testing.T, err error) {
				requireFieldRefusal(t, err, "customer", wantMemoCorrectionCustomerApplied)
			},
		},
		{
			name: "a date after the earliest apply date", total: 25000,
			fields: func(*memoApplyEnv) map[string]any { return map[string]any{"date": "2026-11-17"} },
			check: func(t *testing.T, err error) {
				requireFieldRefusal(t, err, "date", wantMemoCorrectionApplyDate("1001", "Nov 16, 2026"))
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			me := newMemoApplyEnv(t)
			inv := me.invoice(t, me.customer, 40000)
			if inv.GetString("number") != "1001" {
				t.Fatalf("invoice number %q, want 1001", inv.GetString("number"))
			}
			memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
			application := me.apply(t, memo, inv, 15000, memoApplyDay)
			if tc.payout > 0 {
				me.postedPayout(t, memo, tc.payout)
			}
			draft := me.memoCorrection(t, memo, tc.total, tc.fields(me))
			next := nextCreditMemoNumber(t, me.app)

			tc.check(t, postCreditMemoAs(me.app, draft.Id, me.users.bookkeeper.Id))
			requireCreditMemoNotPosted(t, me.app, draft.Id, next)
			requireApplicationOf(t, me.app, application, "credit_memo", memo.Id)
			requireMemo(t, me.app, memo, int(25000-15000-tc.payout), 15000)
			requireMemoApplyClean(t, me.app)
		})
	}

	t.Run("a refund only keeps the refund text", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.postedPayout(t, memo, 8000)
		draft := me.memoCorrection(t, memo, 7999, nil)

		requireMessageOnlyRefusal(t, postCreditMemoAs(me.app, draft.Id, me.users.bookkeeper.Id), wantCreditMemoCorrectionBelow("$80.00"))
		requireMemo(t, me.app, memo, 17000, 0)
		requireMemoApplyClean(t, me.app)
	})

	t.Run("the earliest apply date itself is taken", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		application := me.apply(t, memo, inv, 15000, memoApplyDay)
		draft := me.memoCorrection(t, memo, 25000, map[string]any{"date": memoApplyDay})

		if err := postCreditMemoAs(me.app, draft.Id, me.users.bookkeeper.Id); err != nil {
			t.Fatalf("a correction dated the apply date was refused: %v", err)
		}
		requireApplicationOf(t, me.app, application, "credit_memo", draft.Id)
		requireMemo(t, me.app, draft, 10000, 15000)
		requireMemoApplyClean(t, me.app)
	})
}

// A memo of 250.00 with 150.00 applied pays out at most 100.00.
func TestRefundReceiptPayout_CappedByTheAppliedCredit(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	me.apply(t, memo, inv, 15000, memoApplyDay)

	above, _ := me.draftPayout(t, memo, 10001, nil)
	requireFieldRefusal(t, postRefundReceiptAs(me.app, above.Id, me.users.bookkeeper.Id),
		"credit_memo", wantRefundAboveCredit("$100.00", memo.GetString("number")))
	requireMemo(t, me.app, memo, 10000, 15000)

	whole, _ := me.draftPayout(t, memo, 10000, nil)
	if err := postRefundReceiptAs(me.app, whole.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("a payout of the whole unapplied credit was refused: %v", err)
	}
	requireMemo(t, me.app, memo, 0, 15000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_AWriteOffTakesTheRest(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)

	me.wo.mkWriteOff(t, inv, map[string]any{"date": "2026-11-17"})
	requireWrittenOff(t, me.app, inv, 0, 40000-15000)
	requireMemoApplyClean(t, me.app)

	me.remove(t, application)
	requireWrittenOff(t, me.app, inv, 15000, 25000)
	requireMemo(t, me.app, memo, 25000, 0)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_DriftIsFoundAndRepaired(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	me.apply(t, memo, inv, 15000, memoApplyDay)
	requireMemoApplyClean(t, me.app)

	if _, err := me.app.DB().NewQuery("UPDATE books_credit_memos SET applied = 1 WHERE id = {:id}").
		Bind(dbx.Params{"id": memo.Id}).Execute(); err != nil {
		t.Fatalf("set the memo's applied: %v", err)
	}
	setInvoiceBalanceRaw(t, me.app, inv.Id, 1)

	drifts, err := verifyDocumentBalances(me.app)
	if err != nil {
		t.Fatal(err)
	}
	var memoApplied, invoiceBalance bool
	for _, d := range drifts {
		if d.Document == memo.Id && d.Field == "applied" && d.Stored == 1 && d.Want == 15000 {
			memoApplied = true
		}
		if d.Document == inv.Id && d.Field == "balance" && d.Stored == 1 && d.Want == 25000 {
			invoiceBalance = true
		}
	}
	if !memoApplied {
		t.Errorf("drifts %+v name no applied drift of the memo (stored 1, want 15000)", drifts)
	}
	if !invoiceBalance {
		t.Errorf("drifts %+v name no balance drift of the invoice (stored 1, want 25000)", drifts)
	}

	if _, err := rebuildDocumentBalances(me.app); err != nil {
		t.Fatal(err)
	}
	requireMemo(t, me.app, memo, 10000, 15000)
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_AnInactiveCustomerStillApplies(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	makeCustomerInactive(t, me.app, me.customer)

	me.apply(t, memo, inv, 15000, memoApplyDay)
	requireInvoiceBalance(t, me.app, inv, 25000)
	requireMemo(t, me.app, memo, 10000, 15000)
	requireMemoApplyClean(t, me.app)
}

func TestCreditMemoApplication_ASubCustomersInvoiceIsAnotherParty(t *testing.T) {
	me := newMemoApplyEnv(t)
	kids := mkCustomer(t, me.app, "Harborview Kids", me.customer.Id)
	inv := me.invoice(t, kids, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)

	me.applyAs(t, me.users.bookkeeper, memo, inv, 15000, memoApplyDay).
		requireField(t, "invoice", wantMemoApplyInvoiceNotOpen(inv.GetString("number")))
	requireMemoApplicationCount(t, me.app, 0)
	requireInvoiceBalance(t, me.app, inv, 40000)
	requireMemo(t, me.app, memo, 25000, 0)
	requireMemoApplyClean(t, me.app)
}
