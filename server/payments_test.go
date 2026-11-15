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

// The refusal texts of the payment guards (receive payment spec §4.3), as the
// client gets them (PocketBase adds a final period). Written out here, not read
// from the consts, so a change of wording fails this file too.
const (
	wantPaymentAmountRequired   = "Enter the amount received."
	wantPaymentAmountTooLarge   = "The amount is more than Books can store."
	wantPaymentTooManyInvoices  = "A payment can apply to at most 500 invoices."
	wantPaymentInvoicesNotDraft = "Only the invoices of a draft payment can change."
	wantPaymentPostedFixed      = "A posted or void payment cannot be changed."
	wantPaymentDeleteNotDraft   = "Only a draft payment can be deleted."
	wantPaymentEntryFromPost    = "A payment entry comes only from posting its payment."
	paymentTestDay              = "2026-11-10"
	paymentSequenceID           = "booksseqpayment"
)

func wantNotPostedInvoiceOfCustomer(number string) string {
	return fmt.Sprintf("Invoice %s is not a posted invoice of this customer.", number)
}

func wantInvoiceAlreadyOnPayment(number string) string {
	return fmt.Sprintf("Invoice %s is already on this payment.", number)
}

func wantApplicationAboveZero(number string) string {
	return fmt.Sprintf("Invoice %s: enter a payment more than 0.", number)
}

// paymentEnv is a migrated app with the ledger hooks, the invoice guards and
// the payment guards bound, on the accounts of the e2e book a payment reads
// (1000 Business Checking, 1010 Business Savings, 1100 Accounts receivable,
// 1200 Undeposited funds, 3900 Retained earnings, 4000 Consulting Income),
// a non-taxable service on 4000 and its own customer, Harborview Dental.
type paymentEnv struct {
	*ledgerEnv
	savings, receivable, undeposited *core.Record
	customer, service                *core.Record
}

func newPaymentEnv(t *testing.T) *paymentEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerPaymentGuards(app)
	bindInvoiceHost(t, app)
	return paymentEnvOn(t, app)
}

// paymentEnvOn adds the e2e accounts, users, the service and the customer to an
// app whose hooks are already bound, so they pass through them.
func paymentEnvOn(t *testing.T, app *tests.TestApp) *paymentEnv {
	t.Helper()
	env := &ledgerEnv{
		app:      app,
		users:    newLevelUsers(t, app),
		checking: mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		revenue:  mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income"),
		rent:     mkNumberedAccount(t, app, "Rent", "6100", "expense", "rent_lease"),
	}
	pe := &paymentEnv{
		ledgerEnv:   env,
		savings:     mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		receivable:  mkNumberedAccount(t, app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		undeposited: mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
	}
	mkRetainedEarnings(t, app, "3900")
	service, err := newProduct(app, map[string]any{
		"type": "service", "name": "Monthly bookkeeping", "income_account": env.revenue.Id, "taxable": false,
	})
	if err != nil {
		t.Fatalf("save the service: %v", err)
	}
	pe.service = service
	pe.customer = mkCustomer(t, app, "Harborview Dental", "")
	return pe
}

// postedInvoice saves a draft invoice of customer with one non-taxable line of
// total and posts it, through every guard; invoices take 1001, 1002, … in the
// order they post.
func (pe *paymentEnv) postedInvoice(t testing.TB, customer *core.Record, total int64) *core.Record {
	t.Helper()
	inv, err := newInvoice(pe.app, customer, nil)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, total, false))
	return mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
}

// newPayment saves a draft payment through the app, so every guard runs, with
// the fields given over a valid default (Harborview Dental, 500.00, no Deposit
// to), and returns what the guards said.
func (pe *paymentEnv) newPayment(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"customer": pe.customer.Id, "status": "draft", "date": paymentTestDay, "amount": 50000,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(pe.app, "books_payments", all)
}

func (pe *paymentEnv) mkPayment(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := pe.newPayment(fields)
	if err != nil {
		t.Fatalf("save a draft payment: %v", err)
	}
	return r
}

// newApplication saves one application of payment to invoice through the app.
func newApplication(app core.App, payment, invoice *core.Record, position int, amount int64) (*core.Record, error) {
	return saveNew(app, "books_payment_applications", map[string]any{
		"payment": payment.Id, "invoice": invoice.Id, "amount": amount, "position": position,
	})
}

func mkApplication(t testing.TB, app core.App, payment, invoice *core.Record, position int, amount int64) *core.Record {
	t.Helper()
	r, err := newApplication(app, payment, invoice, position, amount)
	if err != nil {
		t.Fatalf("save application %d: %v", position+1, err)
	}
	return r
}

// mkPaymentRow saves a payment with saveRecord on an app whose payment guards
// may not be bound (the delete-guard tests of customers and accounts), with the
// fields given over a valid draft.
func mkPaymentRow(t testing.TB, app core.App, customer *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"customer": customer.Id, "status": "draft", "date": paymentTestDay, "amount": 50000, "currency": "USD",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveRecord(t, app, "books_payments", all)
}

// setPaymentStatus writes status straight to the table, past every hook, so a
// guard test holds a posted payment without posting it.
func setPaymentStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_payments SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set payment %s %s: %v", id, status, err)
	}
}

func requireApplicationCount(t testing.TB, app core.App, payment *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_payment_applications", dbx.HashExp{"payment": payment.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d applications on the payment, want %d", n, want)
	}
}

func requirePaymentCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_payments"); err != nil || n != want {
		t.Errorf("%d payments stored (err %v), want %d", n, err, want)
	}
}

func TestPayment_DraftWithNoDepositToSaves(t *testing.T) {
	pe := newPaymentEnv(t)
	r, err := pe.newPayment(map[string]any{"amount": 50000})
	if err != nil {
		t.Fatalf("a draft payment with customer, date, amount and no Deposit to was refused: %v", err)
	}
	stored := reload(t, pe.app, "books_payments", r.Id)
	if got, want := [4]any{stored.GetString("customer"), stored.GetString("status"), stored.GetInt("amount"), stored.GetString("deposit_to")},
		[4]any{pe.customer.Id, statusDraft, 50000, ""}; got != want {
		t.Errorf("stored customer/status/amount/deposit_to = %v, want %v", got, want)
	}
}

func TestPayment_RefusesInactiveCustomerWhenItChanges(t *testing.T) {
	pe := newPaymentEnv(t)
	oldMill := mkCustomer(t, pe.app, "Old Mill Bakery", "")
	makeCustomerInactive(t, pe.app, oldMill)
	_, err := pe.newPayment(map[string]any{"customer": oldMill.Id})
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))
	requirePaymentCount(t, pe.app, 0)

	// A stored draft keeps a customer that became inactive after it was chosen:
	// only a change of customer is checked.
	riverside := mkCustomer(t, pe.app, "Riverside Clinic", "")
	r := pe.mkPayment(t, map[string]any{"customer": riverside.Id})
	makeCustomerInactive(t, pe.app, riverside)
	if err := setFields(t, pe.app, "books_payments", r.Id, map[string]any{"memo": "Second check"}); err != nil {
		t.Fatalf("a memo edit of a draft whose customer became inactive was refused: %v", err)
	}
	if got := reload(t, pe.app, "books_payments", r.Id).GetString("memo"); got != "Second check" {
		t.Errorf("memo = %q, want Second check", got)
	}
}

// A correction draft did not choose its customer again: its create may name
// the original's inactive customer, but no other inactive one.
func TestPayment_CorrectionDraftKeepsTheOriginalsInactiveCustomer(t *testing.T) {
	pe := newPaymentEnv(t)
	original := pe.mkPayment(t, map[string]any{"amount": 25000})
	mustPostPayment(t, pe.app, original.Id, pe.users.bookkeeper.Id)
	makeCustomerInactive(t, pe.app, pe.customer)

	draft, err := pe.newPayment(map[string]any{"replaces": original.Id, "amount": 30000})
	if err != nil {
		t.Fatalf("a correction draft naming the original's inactive customer was refused: %v", err)
	}
	if got := reload(t, pe.app, "books_payments", draft.Id).GetString("customer"); got != pe.customer.Id {
		t.Errorf("correction customer = %q, want the original's", got)
	}

	oldMill := mkCustomer(t, pe.app, "Old Mill Bakery", "")
	makeCustomerInactive(t, pe.app, oldMill)
	_, err = pe.newPayment(map[string]any{"replaces": original.Id, "customer": oldMill.Id})
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))
	requirePaymentCount(t, pe.app, 2)
}

func TestPayment_RefusesABadDate(t *testing.T) {
	pe := newPaymentEnv(t)
	_, err := pe.newPayment(map[string]any{"date": "2026-13-40"})
	requireRefusedOnField(t, err, "date")
	requirePaymentCount(t, pe.app, 0)
}

func TestPayment_SchemaRefusesReferenceAndPaymentMethod(t *testing.T) {
	pe := newPaymentEnv(t)
	_, err := pe.newPayment(map[string]any{"reference_no": strings.Repeat("x", 41)})
	requireSchemaRefusal(t, err, "reference_no")
	_, err = pe.newPayment(map[string]any{"payment_method": "cheque"})
	requireSchemaRefusal(t, err, "payment_method")
	requirePaymentCount(t, pe.app, 0)

	r := pe.mkPayment(t, map[string]any{"reference_no": strings.Repeat("x", 40), "payment_method": "check"})
	stored := reload(t, pe.app, "books_payments", r.Id)
	if stored.GetString("payment_method") != "check" || len(stored.GetString("reference_no")) != 40 {
		t.Errorf("stored payment_method %q reference_no %q, want check and 40 characters",
			stored.GetString("payment_method"), stored.GetString("reference_no"))
	}
}

func TestPayment_RefusesAnAmountOfZeroOrTooLarge(t *testing.T) {
	pe := newPaymentEnv(t)
	_, err := pe.newPayment(map[string]any{"amount": 0})
	requireFieldRefusal(t, err, "amount", wantPaymentAmountRequired)
	_, err = pe.newPayment(map[string]any{"amount": maxStoredAmount + 1})
	requireFieldRefusal(t, err, "amount", wantPaymentAmountTooLarge)
	requirePaymentCount(t, pe.app, 0)

	r := pe.mkPayment(t, map[string]any{"amount": maxStoredAmount})
	if got := reload(t, pe.app, "books_payments", r.Id).GetInt("amount"); got != maxStoredAmount {
		t.Errorf("stored amount %d, want maxStoredAmount", got)
	}
}

func TestPayment_RefusesADepositToThatIsNotAnActiveDepositAccount(t *testing.T) {
	pe := newPaymentEnv(t)
	oldBank := mkNumberedAccount(t, pe.app, "Old Checking", "1020", "bank", "checking")
	makeAccountInactive(t, pe.app, oldBank)

	for name, account := range map[string]*core.Record{"4000 Consulting Income": pe.revenue, "an inactive bank account": oldBank} {
		t.Run(name, func(t *testing.T) {
			_, err := pe.newPayment(map[string]any{"deposit_to": account.Id})
			requireFieldRefusal(t, err, "deposit_to", wantDepositInvalid)
		})
	}
	requirePaymentCount(t, pe.app, 0)

	for _, account := range []*core.Record{pe.checking, pe.undeposited} {
		r := pe.mkPayment(t, map[string]any{"deposit_to": account.Id})
		if got := reload(t, pe.app, "books_payments", r.Id).GetString("deposit_to"); got != account.Id {
			t.Errorf("deposit_to = %q, want %s", got, account.GetString("name"))
		}
	}
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestPayment_ServerFieldsRefusedOnCreate(t *testing.T) {
	body := func(pe *paymentEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"draft","date":%q,"amount":50000%s}`, pe.customer.Id, paymentTestDay, extra)
	}
	paymentsAfter := func(want int64) func(t testing.TB, app *tests.TestApp) {
		return func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_payments"); n != want {
				t.Errorf("%d payments after the create, want %d", n, want)
			}
		}
	}

	t.Run("a draft with no server field is created", func(t *testing.T) {
		pe := newPaymentEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_payments/records",
			token: tokenFor(t, pe.users.bookkeeper), body: body(pe, ""), want: http.StatusOK,
			after: paymentsAfter(1),
		}.run(t, pe.app)
	})

	cases := map[string]func(t testing.TB, pe *paymentEnv) (extra string, stored int64){
		"number":    func(testing.TB, *paymentEnv) (string, int64) { return `,"number":"1001"`, 0 },
		"applied":   func(testing.TB, *paymentEnv) (string, int64) { return `,"applied":100`, 0 },
		"credited":  func(testing.TB, *paymentEnv) (string, int64) { return `,"credited":100`, 0 },
		"posted_at": func(testing.TB, *paymentEnv) (string, int64) { return `,"posted_at":"2026-11-10 10:00:00.000Z"`, 0 },
		// A real entry and a real payment, so only the rule can refuse the relation.
		"entry": func(t testing.TB, pe *paymentEnv) (string, int64) {
			return fmt.Sprintf(`,"entry":%q`, pe.sale(t, paymentTestDay, 100).Id), 0
		},
		"replaced_by": func(t testing.TB, pe *paymentEnv) (string, int64) {
			return fmt.Sprintf(`,"replaced_by":%q`, pe.mkPayment(t, nil).Id), 1
		},
	}
	for name, extra := range cases {
		t.Run(name, func(t *testing.T) {
			pe := newPaymentEnv(t)
			text, stored := extra(t, pe)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_payments/records",
				token: tokenFor(t, pe.users.bookkeeper), body: body(pe, text), want: http.StatusBadRequest,
				after: paymentsAfter(stored),
			}.run(t, pe.app)
		})
	}
}

func TestPaymentApplication_RefusesAnInvoiceThatIsNotAPostedInvoiceOfTheCustomer(t *testing.T) {
	pe := newPaymentEnv(t)
	actor := pe.users.bookkeeper.Id
	p := pe.mkPayment(t, nil)

	draft, err := newInvoice(pe.app, pe.customer, nil)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, pe.app, draft, 0, item(pe.service, 1, 30000, false))
	voided := pe.postedInvoice(t, pe.customer, 20000)
	if err := voidInvoiceAs(pe.app, voided.Id, actor); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	northwind := mkCustomer(t, pe.app, "Northwind Traders", "")
	others := pe.postedInvoice(t, northwind, 40000)

	_, err = newApplication(pe.app, p, draft, 0, 10000)
	// A draft invoice has no number yet.
	apiErr := apiErrorOf(t, err)
	if !strings.HasPrefix(apiErr.Message, "Invoice ") || !strings.HasSuffix(apiErr.Message, " is not a posted invoice of this customer.") {
		t.Errorf("draft invoice refusal = %q, want \"Invoice <n> is not a posted invoice of this customer.\"", apiErr.Message)
	}
	_, err = newApplication(pe.app, p, voided, 0, 10000)
	requireRefusalText(t, err, wantNotPostedInvoiceOfCustomer(voided.GetString("number")))
	_, err = newApplication(pe.app, p, others, 0, 10000)
	requireRefusalText(t, err, wantNotPostedInvoiceOfCustomer(others.GetString("number")))
	requireApplicationCount(t, pe.app, p, 0)
}

func TestPaymentApplication_RefusesASecondApplicationAndAZeroAmount(t *testing.T) {
	pe := newPaymentEnv(t)
	p := pe.mkPayment(t, nil)
	inv := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	mkApplication(t, pe.app, p, inv, 0, 10000)

	_, err := newApplication(pe.app, p, inv, 1, 5000)
	requireRefusalText(t, err, wantInvoiceAlreadyOnPayment(inv.GetString("number")))
	_, err = newApplication(pe.app, p, second, 1, 0)
	requireRefusalText(t, err, wantApplicationAboveZero(second.GetString("number")))
	requireApplicationCount(t, pe.app, p, 1)

	// The same invoice on another payment is not a second application.
	other := pe.mkPayment(t, nil)
	mkApplication(t, pe.app, other, inv, 0, 5000)
}

func TestPaymentApplication_RefusesThe501st(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	pe := paymentEnvOn(t, app)
	// 501 posted invoices and 499 applications written before the invoice and
	// payment guards are bound, so the test does not post 501 invoices; the
	// guard counts what is stored.
	p := mkPaymentRow(t, app, pe.customer, nil)
	invoices := make([]*core.Record, 501)
	for i := range invoices {
		invoices[i] = mkInvoiceRow(t, app, pe.customer, map[string]any{
			"status": "posted", "number": fmt.Sprint(2001 + i), "sequence": 2001 + i, "subtotal": 100, "total": 100,
		})
	}
	for i := 0; i < 499; i++ {
		saveRecord(t, app, "books_payment_applications", map[string]any{
			"payment": p.Id, "invoice": invoices[i].Id, "amount": 100, "position": i,
		})
	}
	registerSalesDocGuards(app, invoiceKind)
	registerPaymentGuards(app)

	mkApplication(t, app, p, invoices[499], 499, 100)
	_, err := newApplication(app, p, invoices[500], 500, 100)
	requireRefusalText(t, err, wantPaymentTooManyInvoices)
	requireApplicationCount(t, app, p, 500)
}

func TestPaymentApplication_RefusedOnPostedPayment(t *testing.T) {
	pe := newPaymentEnv(t)
	p := pe.mkPayment(t, nil)
	inv := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)
	application := mkApplication(t, pe.app, p, inv, 0, 10000)
	setPaymentStatus(t, pe.app, p.Id, statusPosted)

	err := setFields(t, pe.app, "books_payment_applications", application.Id, map[string]any{"amount": 20000})
	requireRefusalText(t, err, wantPaymentInvoicesNotDraft)
	_, err = newApplication(pe.app, p, second, 1, 5000)
	requireRefusalText(t, err, wantPaymentInvoicesNotDraft)
	err = pe.app.Delete(reload(t, pe.app, "books_payment_applications", application.Id))
	requireRefusalText(t, err, wantPaymentInvoicesNotDraft)

	requireApplicationCount(t, pe.app, p, 1)
	if got := reload(t, pe.app, "books_payment_applications", application.Id).GetInt("amount"); got != 10000 {
		t.Errorf("application amount = %d after the refusal, want 10000", got)
	}
}

func TestPayment_PostedIsNotChanged(t *testing.T) {
	pe := newPaymentEnv(t)
	p := pe.mkPayment(t, map[string]any{"memo": "First check"})
	setPaymentStatus(t, pe.app, p.Id, statusPosted)

	err := setFields(t, pe.app, "books_payments", p.Id, map[string]any{"memo": "Changed"})
	requireRefusalText(t, err, wantPaymentPostedFixed)
	if got := reload(t, pe.app, "books_payments", p.Id).GetString("memo"); got != "First check" {
		t.Errorf("memo = %q after the refusal, want First check", got)
	}
}

func TestPayment_DeleteOnlyDraft(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.postedInvoice(t, pe.customer, 30000)
	second := pe.postedInvoice(t, pe.customer, 40000)

	posted := pe.mkPayment(t, nil)
	mkApplication(t, pe.app, posted, inv, 0, 10000)
	setPaymentStatus(t, pe.app, posted.Id, statusPosted)
	requireRefusalText(t, pe.app.Delete(reload(t, pe.app, "books_payments", posted.Id)), wantPaymentDeleteNotDraft)
	if _, err := pe.app.FindRecordById("books_payments", posted.Id); err != nil {
		t.Fatalf("the posted payment is gone: %v", err)
	}
	requireApplicationCount(t, pe.app, posted, 1)

	draft := pe.mkPayment(t, nil)
	mkApplication(t, pe.app, draft, inv, 0, 10000)
	mkApplication(t, pe.app, draft, second, 1, 20000)
	if err := pe.app.Delete(reload(t, pe.app, "books_payments", draft.Id)); err != nil {
		t.Fatalf("delete a draft payment: %v", err)
	}
	if _, err := pe.app.FindRecordById("books_payments", draft.Id); err == nil {
		t.Error("the draft payment is still there")
	}
	requireApplicationCount(t, pe.app, draft, 0)
}
