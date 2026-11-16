package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/security"
)

// A bill payment (pay-bills spec §3.7, §4.1): there is no draft. The client
// writes each payment as a create with status posted and its lines in one
// batch; the create's request hook posts it after the lines exist. A Go save
// has no request and never posts, so these tests write every bill payment
// through /api/batch, as the client does.

// The refusal texts of the bill payment guards, as the client gets them
// (PocketBase adds a final period to a text that has none). Written out here,
// not read from the consts, so a change of wording fails this file too.
const (
	wantBillPaySelectOne       = "Select at least one bill to pay."
	wantBillPayTooManyBills    = "A bill payment can pay at most 250 bills."
	wantBillPayBillsFixed      = "The bills of a posted bill payment cannot change."
	wantBillPayPostedFixed     = "A posted or void bill payment cannot be changed."
	wantBillPayCorrectionVndr  = "A bill payment correction keeps its vendor."
	wantBillPayEditMissing     = "The bill payment being edited does not exist."
	wantBillPayOnlyPostedEdits = "Only a posted bill payment can be edited."
	wantBillPayEntryFromPost   = "A bill payment entry comes only from posting its bill payment."
	wantClosedOnPayDay         = "The books are closed through 2026-11-10. Ask a Books admin for a close-date override to post on 2026-11-10."

	billPayDay        = "2026-11-10"
	billPaySequenceID = "booksseqbillpay"
	billPaymentsCol   = "books_bill_payments"
	billPayLinesCol   = "books_bill_payment_lines"
)

func wantBillNotOpen(number string) string {
	return fmt.Sprintf("Bill %s is not open. Clear it to continue.", number)
}

func wantBillTwice(number string) string {
	return fmt.Sprintf("Bill %s is already on this payment.", number)
}

func wantBillPaymentAboveZero(number string) string {
	return fmt.Sprintf("Bill %s: enter a payment more than 0.", number)
}

func wantBillAboveBalance(number, open string) string {
	return fmt.Sprintf("Bill %s: the payment is more than its open balance of %s.", number, open)
}

// billPayEnv is an expense env (the e2e chart's 1000 Business Checking, 1010
// Business Savings, 1100 Accounts receivable, 2100 Company Card, the expense
// accounts and the vendors Summit IT Services, Office Supply World and the
// inactive Pacific Power) with 2000 Accounts Payable, the bill, expense and
// bill payment guards bound and batch requests on. rest serves REST calls
// through one router, so a test may make many calls on one app.
type billPayEnv struct {
	*expenseEnv
	payable *core.Record
	client  *restClient
}

func newBillPayEnv(t *testing.T) *billPayEnv {
	t.Helper()
	bp := newBillPayEnvWithoutPayable(t)
	bp.payable = mkNumberedAccount(t, bp.app, "Accounts Payable", "2000", "accounts_payable", "accounts_payable")
	return bp
}

// newBillPayEnvWithoutPayable leaves the A/P accounts to the test, so it can
// choose which one each bill credits (posting credits the first active one in
// chart order).
func newBillPayEnvWithoutPayable(t *testing.T) *billPayEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, billKind.HostKey, expenseKind.HostKey)
	registerBillPaymentGuards(env.app)
	enableBatch(t, env.app)
	return &billPayEnv{expenseEnv: expenseEnvOn(t, env)}
}

// rest builds the env's router on first use. Do not mix it with apiReq on the
// same app: each builds the router through OnServe.
func (bp *billPayEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if bp.client == nil {
		bp.client = newRestClient(t, bp.app)
	}
	return bp.client
}

// restClient sends REST calls through PocketBase's real router, so the rules
// and request hooks run as they do in production.
type restClient struct {
	mux http.Handler
}

func newRestClient(t testing.TB, app *tests.TestApp) *restClient {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	var mux http.Handler
	serve := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serve, func(e *core.ServeEvent) error {
		built, err := e.Router.BuildMux()
		mux = built
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return &restClient{mux: mux}
}

func (c *restClient) send(t testing.TB, user *core.Record, method, url, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != nil {
		req.Header.Set("Authorization", tokenFor(t, user))
	}
	rec := httptest.NewRecorder()
	c.mux.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

// batchAnswer is the answer of one /api/batch call.
type batchAnswer struct {
	status int
	body   string
}

func (bp *billPayEnv) batch(t testing.TB, user *core.Record, ops ...string) batchAnswer {
	t.Helper()
	status, body := bp.rest(t).send(t, user, http.MethodPost, "/api/batch", batchBody(ops...))
	return batchAnswer{status: status, body: body}
}

func (a batchAnswer) requireOK(t testing.TB) {
	t.Helper()
	if a.status != http.StatusOK {
		t.Fatalf("batch status = %d, want 200; body: %s", a.status, a.body)
	}
}

// batchFailure is the failed operation of a refused batch: its index in the
// batch, its message and its field messages.
type batchFailure struct {
	index   string
	message string
	fields  map[string]string
}

func (a batchAnswer) failure(t testing.TB) batchFailure {
	t.Helper()
	if a.status != http.StatusBadRequest {
		t.Fatalf("batch status = %d, want 400; body: %s", a.status, a.body)
	}
	var parsed struct {
		Data struct {
			Requests map[string]struct {
				Response struct {
					Message string                     `json:"message"`
					Data    map[string]json.RawMessage `json:"data"`
				} `json:"response"`
			} `json:"requests"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(a.body), &parsed); err != nil {
		t.Fatalf("parse the batch answer: %v; body: %s", err, a.body)
	}
	if len(parsed.Data.Requests) != 1 {
		t.Fatalf("the batch answer names %d failed operations, want 1; body: %s", len(parsed.Data.Requests), a.body)
	}
	for index, op := range parsed.Data.Requests {
		f := batchFailure{index: index, message: op.Response.Message, fields: map[string]string{}}
		for field, raw := range op.Response.Data {
			var item struct {
				Message string `json:"message"`
			}
			_ = json.Unmarshal(raw, &item)
			f.fields[field] = item.Message
		}
		return f
	}
	return batchFailure{}
}

// requireField checks a guard refusal keyed by field, with want on the
// refusal and on the field, so the client shows it under that field.
func (f batchFailure) requireField(t testing.TB, field, want string) {
	t.Helper()
	got, ok := f.fields[field]
	if !ok {
		t.Fatalf("refusal %q names fields %v, want %q", f.message, f.fields, field)
	}
	if got != want || f.message != want {
		t.Errorf("refusal on %s = %q (message %q), want %q", field, got, f.message, want)
	}
}

func (f batchFailure) requireMessage(t testing.TB, want string) {
	t.Helper()
	if f.message != want {
		t.Errorf("refusal message = %q, want %q", f.message, want)
	}
}

func (f batchFailure) requireNamesField(t testing.TB, field string) {
	t.Helper()
	if _, ok := f.fields[field]; !ok {
		t.Errorf("refusal %q names fields %v, want %q among them", f.message, f.fields, field)
	}
}

func newRecordID() string {
	return security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
}

func createOp(t testing.TB, collection string, body map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"method": http.MethodPost,
		"url":    "/api/collections/" + collection + "/records",
		"body":   body,
	})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// payBody is a bill payment create as the client writes it: a new id, the
// vendor, Check from 1000 Business Checking with no Ref no., the open-period
// pay day and status posted, with the fields given over it.
func (bp *billPayEnv) payBody(vendor *core.Record, fields map[string]any) map[string]any {
	body := map[string]any{
		"id": newRecordID(), "vendor": vendor.Id, "paid_from": bp.checking1000.Id,
		"payment_method": "check", "reference_no": "", "date": billPayDay, "status": "posted",
	}
	for k, v := range fields {
		body[k] = v
	}
	return body
}

// payLine is one bill payment line: the bill and the amount paid on it.
type payLine struct {
	bill   *core.Record
	amount int64
}

// payOps is the payment create followed by one line create per payLine, at
// positions 0, 1, … — the client's order.
func payOps(t testing.TB, body map[string]any, lines ...payLine) []string {
	t.Helper()
	ops := []string{createOp(t, billPaymentsCol, body)}
	for i, l := range lines {
		ops = append(ops, lineOp(t, body["id"].(string), l.bill, i, l.amount))
	}
	return ops
}

func lineOp(t testing.TB, paymentID string, bill *core.Record, position int, amount int64) string {
	t.Helper()
	return createOp(t, billPayLinesCol, map[string]any{
		"payment": paymentID, "bill": bill.Id, "amount": amount, "position": position,
	})
}

// pay posts one bill payment as the bookkeeper and returns it as stored.
func (bp *billPayEnv) pay(t testing.TB, vendor *core.Record, fields map[string]any, lines ...payLine) *core.Record {
	t.Helper()
	body := bp.payBody(vendor, fields)
	bp.batch(t, bp.users.bookkeeper, payOps(t, body, lines...)...).requireOK(t)
	return reload(t, bp.app, billPaymentsCol, body["id"].(string))
}

// postedBill saves a draft bill of vendor with one account line of total on
// 6200 Software Subscriptions and posts it; bills take 1001, 1002, … in the
// order they post.
func (bp *billPayEnv) postedBill(t testing.TB, vendor *core.Record, total int64) *core.Record {
	t.Helper()
	bill := mkBill(t, bp.app, vendor, nil)
	mkBillLine(t, bp.app, bill, 0, accountLine(bp.software, total))
	return mustPostBill(t, bp.app, bill.Id, bp.users.bookkeeper.Id)
}

// voidBillPaymentAs voids a posted bill payment as actor through a Go save, the
// path a person's PATCH reaches once the request hook has stamped the voider.
func voidBillPaymentAs(app core.App, paymentID, actor string) error {
	r, err := app.FindRecordById(billPaymentsCol, paymentID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func requireBillPaymentCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(billPaymentsCol); err != nil || n != want {
		t.Errorf("%d bill payments stored (err %v), want %d", n, err, want)
	}
}

func requireBillPaymentLineCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(billPayLinesCol); err != nil || n != want {
		t.Errorf("%d bill payment lines stored (err %v), want %d", n, err, want)
	}
}

func requireBillBalance(t testing.TB, app core.App, bill *core.Record, want int) {
	t.Helper()
	if got := reload(t, app, "books_bills", bill.Id).GetInt("balance"); got != want {
		t.Errorf("bill %s balance = %d, want %d", bill.GetString("number"), got, want)
	}
}

func nextBillPaymentNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", billPaySequenceID).GetInt("next_number")
}

func linesOfBillPayment(t testing.TB, app core.App, paymentID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(billPayLinesCol, "payment = {:p}", "position", 0, 0, dbx.Params{"p": paymentID})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestBillPayment_BatchPostsThePayment(t *testing.T) {
	bp := newBillPayEnv(t)
	first := bp.postedBill(t, bp.summit, 30000)
	second := bp.postedBill(t, bp.summit, 40000)

	// The body names another poster: the request hook stamps the bookkeeper.
	p := bp.pay(t, bp.summit, map[string]any{"reference_no": "1050", "posted_by": bp.users.admin.Id},
		payLine{first, 30000}, payLine{second, 25000})

	if got, want := [4]any{p.GetString("status"), p.GetString("number"), p.GetInt("sequence"), p.GetInt("total")},
		[4]any{statusPosted, "1001", 1001, 55000}; got != want {
		t.Errorf("payment status/number/sequence/total = %v, want %v", got, want)
	}
	if p.GetString("entry") == "" || p.GetString("posted_at") == "" {
		t.Errorf("payment entry %q posted_at %q, want both set", p.GetString("entry"), p.GetString("posted_at"))
	}
	if got := p.GetString("posted_by"); got != bp.users.bookkeeper.Id {
		t.Errorf("posted_by = %q, want the bookkeeper %q (not the body's %q)", got, bp.users.bookkeeper.Id, bp.users.admin.Id)
	}
	if p.GetString("vendor") != bp.summit.Id || p.GetString("paid_from") != bp.checking1000.Id || p.GetString("reference_no") != "1050" {
		t.Errorf("payment vendor %q paid_from %q reference_no %q, want Summit IT Services, 1000 and 1050",
			p.GetString("vendor"), p.GetString("paid_from"), p.GetString("reference_no"))
	}
	if got := len(linesOfBillPayment(t, bp.app, p.Id)); got != 2 {
		t.Errorf("%d lines on the payment, want 2", got)
	}
	if got := nextBillPaymentNumber(t, bp.app); got != 1002 {
		t.Errorf("bill payment sequence next_number = %d after the post, want 1002", got)
	}
}

// A create outside a batch has no lines: the request hook refuses it before
// the create, and nothing is stored.
func TestBillPayment_SingleCreateIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	body, err := json.Marshal(bp.payBody(bp.summit, nil))
	if err != nil {
		t.Fatal(err)
	}
	status, answer := bp.rest(t).send(t, bp.users.bookkeeper, http.MethodPost,
		"/api/collections/"+billPaymentsCol+"/records", string(body))
	if status != http.StatusBadRequest || !strings.Contains(answer, wantBillPaySelectOne) {
		t.Errorf("single create = %d %s, want 400 with %q", status, answer, wantBillPaySelectOne)
	}
	requireBillPaymentCount(t, bp.app, 0)
}

func TestBillPayment_BatchWithNoLineIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	bp.postedBill(t, bp.summit, 30000)
	f := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, nil))...).failure(t)
	f.requireMessage(t, wantBillPaySelectOne)
	requireBillPaymentCount(t, bp.app, 0)
	if got := nextBillPaymentNumber(t, bp.app); got != 1001 {
		t.Errorf("bill payment sequence next_number = %d after a refused batch, want 1001", got)
	}
}

func TestBillPayment_CreateAsVoidIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	answer := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, map[string]any{"status": "void"}), payLine{bill, 10000})...)
	if answer.status != http.StatusBadRequest {
		t.Errorf("a void create answered %d, want 400; body: %s", answer.status, answer.body)
	}
	requireBillPaymentCount(t, bp.app, 0)
	requireBillPaymentLineCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, bill, 30000)
}

// The create rule pins the fields Books writes; posted_by is stamped by the
// request hook instead (TestBillPayment_BatchPostsThePayment).
func TestBillPayment_ServerFieldsRefusedOnCreate(t *testing.T) {
	bp := newBillPayEnv(t)
	paid := bp.postedBill(t, bp.summit, 30000)
	open := bp.postedBill(t, bp.summit, 40000)
	existing := bp.pay(t, bp.summit, nil, payLine{paid, 30000})

	cases := map[string]any{
		"number":      "1001",
		"sequence":    1001,
		"total":       10000,
		"entry":       existing.GetString("entry"),
		"posted_at":   "2026-11-10 10:00:00.000Z",
		"voided_by":   bp.users.bookkeeper.Id,
		"replaced_by": existing.Id,
	}
	for field, value := range cases {
		t.Run(field, func(t *testing.T) {
			answer := bp.batch(t, bp.users.bookkeeper,
				payOps(t, bp.payBody(bp.summit, map[string]any{field: value}), payLine{open, 10000})...)
			if answer.status != http.StatusBadRequest {
				t.Errorf("a create that sets %s answered %d, want 400; body: %s", field, answer.status, answer.body)
			}
			requireBillPaymentCount(t, bp.app, 1)
			requireBillBalance(t, bp.app, open, 40000)
		})
	}
}

// A line pays a posted bill of the payment's vendor; a draft, a void and
// another vendor's bill are refused under the line's position.
func TestBillPaymentLine_RefusesABillThatIsNotOpenForTheVendor(t *testing.T) {
	bp := newBillPayEnv(t)
	actor := bp.users.bookkeeper.Id
	good := bp.postedBill(t, bp.summit, 30000)

	draft := mkBill(t, bp.app, bp.summit, nil)
	mkBillLine(t, bp.app, draft, 0, accountLine(bp.software, 20000))
	voided := bp.postedBill(t, bp.summit, 20000)
	if err := voidBillAs(bp.app, voided.Id, actor); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	others := bp.postedBill(t, bp.officeSupply, 20000)

	f := bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, nil), payLine{good, 10000}, payLine{draft, 10000})...).failure(t)
	// A draft bill has no number yet.
	if got := f.fields["lines.1"]; !strings.HasPrefix(got, "Bill ") || !strings.HasSuffix(got, " is not open. Clear it to continue.") {
		t.Errorf("draft bill refusal on lines.1 = %q (fields %v), want \"Bill <n> is not open. Clear it to continue.\"", got, f.fields)
	}

	for name, bill := range map[string]*core.Record{"a void bill": voided, "another vendor's bill": others} {
		t.Run(name, func(t *testing.T) {
			f := bp.batch(t, bp.users.bookkeeper,
				payOps(t, bp.payBody(bp.summit, nil), payLine{good, 10000}, payLine{bill, 10000})...).failure(t)
			f.requireField(t, "lines.1", wantBillNotOpen(reload(t, bp.app, "books_bills", bill.Id).GetString("number")))
		})
	}
	requireBillPaymentCount(t, bp.app, 0)
	requireBillPaymentLineCount(t, bp.app, 0)
}

func TestBillPaymentLine_RefusesASecondLineAndAZeroAmount(t *testing.T) {
	bp := newBillPayEnv(t)
	first := bp.postedBill(t, bp.summit, 30000)
	second := bp.postedBill(t, bp.summit, 40000)

	f := bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, nil), payLine{first, 10000}, payLine{first, 5000})...).failure(t)
	f.requireField(t, "lines.1", wantBillTwice(first.GetString("number")))

	f = bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, nil), payLine{first, 10000}, payLine{second, 0})...).failure(t)
	f.requireField(t, "lines.1", wantBillPaymentAboveZero(second.GetString("number")))

	requireBillPaymentCount(t, bp.app, 0)
	requireBillPaymentLineCount(t, bp.app, 0)
}

func TestBillPayment_RefusesThe251stBill(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	env := ledgerEnvOn(t, app)
	checking := mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking")
	vendor := mkVendor(t, app, "Alder Supply")
	// 251 posted bills written before the bill and bill payment guards are
	// bound, so the test does not post 251 bills; the guard counts the lines.
	bills := make([]*core.Record, 251)
	for i := range bills {
		bills[i] = saveRecord(t, app, "books_bills", map[string]any{
			"vendor": vendor.Id, "status": "posted", "number": fmt.Sprint(2001 + i), "sequence": 2001 + i,
			"date": billDay, "due_date": billDueDay, "subtotal": 100, "total": 100, "balance": 100, "currency": "USD",
		})
	}
	registerSalesDocGuards(app, billKind)
	bindHostsByKey(t, app, billKind.HostKey)
	registerBillPaymentGuards(app)
	enableBatch(t, app)

	body := map[string]any{
		"id": newRecordID(), "vendor": vendor.Id, "paid_from": checking.Id, "payment_method": "check",
		"date": billPayDay, "status": "posted",
	}
	lines := make([]payLine, len(bills))
	for i, b := range bills {
		lines[i] = payLine{b, 100}
	}
	client := newRestClient(t, app)
	status, answer := client.send(t, env.users.bookkeeper, http.MethodPost, "/api/batch", batchBody(payOps(t, body, lines...)...))
	batchAnswer{status: status, body: answer}.failure(t).requireMessage(t, wantBillPayTooManyBills)
	requireBillPaymentCount(t, app, 0)
	requireBillPaymentLineCount(t, app, 0)
}

func TestBillPayment_PaidFromMustBeAnActivePaymentAccount(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	if err := setFields(t, bp.app, "books_accounts", bp.revenue.Id, map[string]any{"number": "4000"}); err != nil {
		t.Fatalf("number Consulting Income 4000: %v", err)
	}
	oldBank := mkNumberedAccount(t, bp.app, "Old Checking", "1020", "bank", "checking")
	makeAccountInactive(t, bp.app, oldBank)

	f := bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, map[string]any{"paid_from": bp.revenue.Id}), payLine{bill, 10000})...).failure(t)
	f.requireField(t, "paid_from", wantExpenseNotPaymentAccount)

	f = bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, map[string]any{"paid_from": oldBank.Id}), payLine{bill, 10000})...).failure(t)
	f.requireField(t, "paid_from", wantExpensePaidFromInactive("1020 Old Checking"))

	f = bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, map[string]any{"paid_from": "zzzzzzzzzzzzzzz"}), payLine{bill, 10000})...).failure(t)
	f.requireNamesField(t, "paid_from")

	requireBillPaymentCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, bill, 30000)

	// A credit card account pays too.
	p := bp.pay(t, bp.summit, map[string]any{"paid_from": bp.card2100.Id, "payment_method": "credit_card"}, payLine{bill, 10000})
	if p.GetString("status") != statusPosted || p.GetString("paid_from") != bp.card2100.Id {
		t.Errorf("payment from 2100 Company Card: status %q paid_from %q, want posted from 2100", p.GetString("status"), p.GetString("paid_from"))
	}
}

// payment_method is a PAYMENT_METHODS key and reference_no holds at most 40
// characters: the schema refuses the create, keyed by the field. Each case has
// its own app: apiReq allows one call per app.
func TestBillPayment_SchemaRefusesMethodAndReference(t *testing.T) {
	cases := map[string]any{"payment_method": "cheque", "reference_no": strings.Repeat("x", 41)}
	for field, value := range cases {
		t.Run(field, func(t *testing.T) {
			bp := newBillPayEnv(t)
			bill := bp.postedBill(t, bp.summit, 30000)
			ops := payOps(t, bp.payBody(bp.summit, map[string]any{field: value}), payLine{bill, 10000})
			req := batchAs(t, bp.users.bookkeeper, http.StatusBadRequest, []string{`"` + field + `":{`}, ops...)
			req.after = func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords(billPaymentsCol); n != 0 {
					t.Errorf("%d bill payments after a refused create, want 0", n)
				}
			}
			req.run(t, bp.app)
		})
	}
}

// A correction did not choose Paid from again, but posting needs an active
// account: a correction from a Paid from that became inactive is refused.
func TestBillPaymentCorrection_RefusesAnInactiveStoredPaidFrom(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	original := bp.pay(t, bp.summit, map[string]any{"paid_from": bp.savings1010.Id, "payment_method": "bank_transfer"},
		payLine{bill, 10000})
	makeAccountInactive(t, bp.app, bp.savings1010)

	f := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, map[string]any{
		"replaces": original.Id, "paid_from": bp.savings1010.Id, "payment_method": "bank_transfer",
	}), payLine{bill, 20000})...).failure(t)
	f.requireField(t, "paid_from", wantExpensePaidFromInactive("1010 Business Savings"))

	requireBillPaymentCount(t, bp.app, 1)
	if s := reload(t, bp.app, billPaymentsCol, original.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refused correction, want posted", s)
	}
	requireBillBalance(t, bp.app, bill, 20000)
}

func TestBillPayment_ReaderCannotVoid(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	p := bp.pay(t, bp.summit, nil, payLine{bill, 10000})

	status, body := bp.rest(t).send(t, bp.users.readOnly, http.MethodPatch,
		"/api/collections/"+billPaymentsCol+"/records/"+p.Id, `{"status":"void"}`)
	if status != http.StatusNotFound {
		t.Errorf("a reader's void answered %d %s, want 404 (the update rule)", status, body)
	}
	if s := reload(t, bp.app, billPaymentsCol, p.Id).GetString("status"); s != statusPosted {
		t.Errorf("status %q after a reader's void, want posted", s)
	}
	requireBillBalance(t, bp.app, bill, 20000)
}

func TestBillPayment_RefusesABadDate(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	f := bp.batch(t, bp.users.bookkeeper,
		payOps(t, bp.payBody(bp.summit, map[string]any{"date": "2026-13-40"}), payLine{bill, 10000})...).failure(t)
	f.requireNamesField(t, "date")
	requireBillPaymentCount(t, bp.app, 0)
}

func TestBillPayment_HonorsCloseDate(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	setCloseDate(t, bp.app, billPayDay)

	f := bp.batch(t, bp.users.bookkeeper, payOps(t, bp.payBody(bp.summit, nil), payLine{bill, 10000})...).failure(t)
	f.requireMessage(t, wantClosedOnPayDay)
	requireBillPaymentCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, bill, 30000)
	if got := nextBillPaymentNumber(t, bp.app); got != 1001 {
		t.Errorf("bill payment sequence next_number = %d after a refused post, want 1001", got)
	}
}

// An inactive vendor still gets paid: its bills were posted while it was
// active.
func TestBillPayment_InactiveVendorDoesNotBlock(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.officeSupply, 30000)
	makeVendorInactive(t, bp.app, bp.officeSupply)

	p := bp.pay(t, bp.officeSupply, nil, payLine{bill, 30000})
	if p.GetString("status") != statusPosted || p.GetString("number") != "1001" {
		t.Errorf("payment of an inactive vendor: status %q number %q, want posted 1001", p.GetString("status"), p.GetString("number"))
	}
	requireBillBalance(t, bp.app, bill, 0)
}

// A posted payment's lines are fixed: a line create in a later batch, a line
// update and a line delete are refused.
func TestBillPaymentLine_PostedPaymentsBillsDoNotChange(t *testing.T) {
	bp := newBillPayEnv(t)
	first := bp.postedBill(t, bp.summit, 30000)
	second := bp.postedBill(t, bp.summit, 40000)
	p := bp.pay(t, bp.summit, nil, payLine{first, 10000})
	line := linesOfBillPayment(t, bp.app, p.Id)[0]

	f := bp.batch(t, bp.users.bookkeeper, lineOp(t, p.Id, second, 1, 5000)).failure(t)
	f.requireMessage(t, wantBillPayBillsFixed)

	requireRefusalText(t, setFields(t, bp.app, billPayLinesCol, line.Id, map[string]any{"amount": 20000}), wantBillPayBillsFixed)
	requireRefusalText(t, bp.app.Delete(reload(t, bp.app, billPayLinesCol, line.Id)), wantBillPayBillsFixed)

	requireBillPaymentLineCount(t, bp.app, 1)
	if got := reload(t, bp.app, billPayLinesCol, line.Id).GetInt("amount"); got != 10000 {
		t.Errorf("line amount = %d after the refusals, want 10000", got)
	}
	requireBillBalance(t, bp.app, first, 20000)
	requireBillBalance(t, bp.app, second, 40000)
}

func TestBillPayment_PostedIsNotChanged(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	p := bp.pay(t, bp.summit, map[string]any{"reference_no": "1050"}, payLine{bill, 10000})

	err := setFields(t, bp.app, billPaymentsCol, p.Id, map[string]any{"reference_no": "1051"})
	requireRefusalText(t, err, wantBillPayPostedFixed)
	if got := reload(t, bp.app, billPaymentsCol, p.Id).GetString("reference_no"); got != "1050" {
		t.Errorf("reference_no = %q after the refusal, want 1050", got)
	}
}

// There is no client delete of a bill payment: void it instead.
func TestBillPayment_DeleteIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	p := bp.pay(t, bp.summit, nil, payLine{bill, 10000})

	status, body := bp.rest(t).send(t, bp.users.bookkeeper, http.MethodDelete,
		"/api/collections/"+billPaymentsCol+"/records/"+p.Id, "")
	if status < 400 {
		t.Errorf("a bookkeeper's delete answered %d %s, want a refusal", status, body)
	}
	if _, err := bp.app.FindRecordById(billPaymentsCol, p.Id); err != nil {
		t.Fatalf("the bill payment is gone: %v", err)
	}
	requireBillPaymentLineCount(t, bp.app, 1)
}

func TestBillPayment_ReaderBatchIsRefused(t *testing.T) {
	bp := newBillPayEnv(t)
	bill := bp.postedBill(t, bp.summit, 30000)
	answer := bp.batch(t, bp.users.readOnly, payOps(t, bp.payBody(bp.summit, nil), payLine{bill, 10000})...)
	if answer.status != http.StatusBadRequest {
		t.Errorf("a reader's batch answered %d, want 400; body: %s", answer.status, answer.body)
	}
	requireBillPaymentCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, bill, 30000)
}

// twoVendorBills posts one bill of 30000 for Alder Supply and one of 40000 for
// Zephyr Power.
func (bp *billPayEnv) twoVendorBills(t *testing.T) (alder, zephyr, alderBill, zephyrBill *core.Record) {
	t.Helper()
	alder = mkVendor(t, bp.app, "Alder Supply")
	zephyr = mkVendor(t, bp.app, "Zephyr Power")
	alderBill = bp.postedBill(t, alder, 30000)
	zephyrBill = bp.postedBill(t, zephyr, 40000)
	return alder, zephyr, alderBill, zephyrBill
}

// The client writes the vendors in reverse display-name order; the last
// payment in a batch posts first, so the numbers follow display-name order.
func TestBillPayment_BatchNumbersTheVendorsInNameOrder(t *testing.T) {
	bp := newBillPayEnv(t)
	alder, zephyr, alderBill, zephyrBill := bp.twoVendorBills(t)
	zBody := bp.payBody(zephyr, nil)
	aBody := bp.payBody(alder, nil)
	ops := append(payOps(t, zBody, payLine{zephyrBill, 40000}), payOps(t, aBody, payLine{alderBill, 30000})...)
	bp.batch(t, bp.users.bookkeeper, ops...).requireOK(t)

	a := reload(t, bp.app, billPaymentsCol, aBody["id"].(string))
	z := reload(t, bp.app, billPaymentsCol, zBody["id"].(string))
	if got := [2]string{a.GetString("number"), z.GetString("number")}; got != [2]string{"1001", "1002"} {
		t.Errorf("Alder Supply / Zephyr Power numbers = %v, want [1001 1002]", got)
	}
	requireBillBalance(t, bp.app, alderBill, 0)
	requireBillBalance(t, bp.app, zephyrBill, 0)
}

// A refusal in one payment's post fails the whole batch; the answer names
// that payment's create as the failed operation, keyed by its line.
func TestBillPayment_BatchRefusalNamesThePaymentAndStoresNothing(t *testing.T) {
	bp := newBillPayEnv(t)
	alder, zephyr, alderBill, zephyrBill := bp.twoVendorBills(t)
	zBody := bp.payBody(zephyr, nil)
	aBody := bp.payBody(alder, nil)
	// Operations: 0 Zephyr's payment, 1 its line, 2 Alder's payment, 3 its line.
	ops := append(payOps(t, zBody, payLine{zephyrBill, 40000}), payOps(t, aBody, payLine{alderBill, 40000})...)

	f := bp.batch(t, bp.users.bookkeeper, ops...).failure(t)
	if f.index != "2" {
		t.Errorf("failed operation = %s, want 2 (Alder Supply's payment create)", f.index)
	}
	f.requireField(t, "lines.0", wantBillAboveBalance(alderBill.GetString("number"), "$300.00"))

	requireBillPaymentCount(t, bp.app, 0)
	requireBillPaymentLineCount(t, bp.app, 0)
	requireBillBalance(t, bp.app, alderBill, 30000)
	requireBillBalance(t, bp.app, zephyrBill, 40000)
	if got := nextBillPaymentNumber(t, bp.app); got != 1001 {
		t.Errorf("bill payment sequence next_number = %d after a refused batch, want 1001", got)
	}
	if n, err := bp.app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "bill_payment"}); err != nil || n != 0 {
		t.Errorf("%d bill payment entries (err %v), want 0", n, err)
	}
}

// A bill payment's entry is named "Bill payment 1004" ("This bill payment");
// its doc type is one only posting the payment writes.
func TestBillPayment_EntryNounsAndName(t *testing.T) {
	if noun, this, draft := entryNouns("bill_payment"); [3]string{noun, this, draft} != [3]string{"Bill payment", "This bill payment", "Bill payment"} {
		t.Errorf("entryNouns(bill_payment) = %q, %q, %q; want Bill payment, This bill payment, Bill payment", noun, this, draft)
	}
	if docTypeBillPayment != "bill_payment" || !documentDocTypes[docTypeBillPayment] {
		t.Errorf("docTypeBillPayment %q in documentDocTypes %v, want bill_payment and true", docTypeBillPayment, documentDocTypes[docTypeBillPayment])
	}
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(billPaymentsCol)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Set("number", "1004")
	if got := billPaymentName(r); got != "Bill payment 1004" {
		t.Errorf("billPaymentName = %q, want Bill payment 1004", got)
	}
}
