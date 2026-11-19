package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The write-off guards (write-off spec §4.3): a write-off is made posted, takes
// the whole open balance of a posted invoice, and is changed only by its void.
// The refusal texts are written out here, not read from the consts, so a
// change of wording fails this file too (PocketBase adds a final period).
const (
	wantWriteOffStatus     = "A write-off is posted when it is made."
	wantWriteOffAccount    = "Choose an active expense account."
	wantWriteOffChange     = "A write-off is not changed. Void it and write the invoice off again."
	wantWriteOffDelete     = "A write-off is voided, not deleted."
	wantInvoiceWrittenOff  = "This invoice is written off. Void the write-off first."
	wantWriteOffAccountOf1 = "This account is the write-off account of 1 write-off and cannot be deleted. Make it inactive instead."
	wantWriteOffAccountOf2 = "This account is the write-off account of 2 write-offs and cannot be deleted. Make it inactive instead."

	writeOffDay       = "2026-11-10"
	writeOffsTable    = "books_write_offs"
	writeOffSequence  = "booksseqwriteof"
	writeOffTestMemo  = "Customer closed the business"
	writeOffCasesFile = "testdata/write_off_cases.json"
)

func wantWriteOffNoBalance(number string) string {
	return fmt.Sprintf("Invoice %s has no open balance.", number)
}

func wantWriteOffAmount(number, balance string) string {
	return fmt.Sprintf("The open balance of invoice %s is now %s. Check it and write it off again.", number, balance)
}

// writeOffEnv is one book with the ledger hooks, the invoice, sales receipt,
// payment and write-off guards bound, on the receipt env's accounts
// (1000/1010/1100/1200/3900/4000/4100, 6100 Rent), Harborview Dental and the
// Denver combined group, plus 6050 Bad debts, an other expense account and an
// inactive expense account.
type writeOffEnv struct {
	*receiptEnv
	badDebts, otherExpense, oldExpense *core.Record
	actor                              string
}

func newWriteOffEnv(t *testing.T) *writeOffEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerSalesDocGuards(app, salesReceiptKind)
	registerPaymentGuards(app)
	registerWriteOffGuards(app)
	bindSalesDocHosts(t, app)
	re := receiptEnvOn(t, app)
	we := &writeOffEnv{
		receiptEnv:   re,
		badDebts:     mkNumberedAccount(t, app, "Bad debts", "6050", "expense", "bad_debts"),
		otherExpense: mkNumberedAccount(t, app, "Penalties", "8100", "other_expense", "penalties_settlements"),
		oldExpense:   mkNumberedAccount(t, app, "Old bad debts", "6060", "expense", "bad_debts"),
		actor:        re.users.bookkeeper.Id,
	}
	makeAccountInactive(t, app, we.oldExpense)
	return we
}

// postedInvoiceOn posts an invoice of customer dated day (due the same day)
// with one non-taxable line of total and no tax rate.
func (we *writeOffEnv) postedInvoiceOn(t testing.TB, customer *core.Record, day string, total int64) *core.Record {
	t.Helper()
	inv, err := newInvoice(we.app, customer, map[string]any{"date": day, "due_date": day})
	if err != nil {
		t.Fatalf("save a draft invoice dated %s: %v", day, err)
	}
	mkInvoiceLine(t, we.app, inv, 0, item(we.service, 1, total, false))
	return mustPostInvoice(t, we.app, inv.Id, we.actor)
}

// postedInvoice posts an invoice of Harborview Dental dated 2026-11-04.
func (we *writeOffEnv) postedInvoice(t testing.TB, total int64) *core.Record {
	t.Helper()
	return we.postedInvoiceOn(t, we.customer, "2026-11-04", total)
}

// pay posts a payment of Harborview Dental into 1000 Business Checking dated
// day, all of it applied to inv.
func (we *writeOffEnv) pay(t testing.TB, inv *core.Record, day string, amount int64) *core.Record {
	t.Helper()
	p, err := saveNew(we.app, "books_payments", map[string]any{
		"customer": inv.GetString("customer"), "status": "draft", "date": day, "amount": amount, "deposit_to": we.checking.Id,
	})
	if err != nil {
		t.Fatalf("save a draft payment dated %s: %v", day, err)
	}
	mkApplication(t, we.app, p, inv, 0, amount)
	return mustPostPayment(t, we.app, p.Id, we.actor)
}

// newWriteOff saves a write-off of inv through the app, as the dialog's one
// insert does once the request hook has stamped posted_by: posted, dated
// writeOffDay, to 6050 Bad debts, of the invoice's stored balance, with the
// fields given over that default.
func (we *writeOffEnv) newWriteOff(inv *core.Record, fields map[string]any) (*core.Record, error) {
	stored, err := we.app.FindRecordById("books_invoices", inv.Id)
	if err != nil {
		return nil, err
	}
	all := map[string]any{
		"invoice": inv.Id, "status": statusPosted, "date": writeOffDay, "account": we.badDebts.Id,
		"amount": stored.GetInt("balance"), "memo": writeOffTestMemo, "posted_by": we.actor,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(we.app, writeOffsTable, all)
}

func (we *writeOffEnv) mkWriteOff(t testing.TB, inv *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	r, err := we.newWriteOff(inv, fields)
	if err != nil {
		t.Fatalf("write off invoice %s: %v", inv.GetString("number"), err)
	}
	return reload(t, we.app, writeOffsTable, r.Id)
}

// voidWriteOffAs voids a write-off as actor, as the page's PATCH
// {"status":"void"} does once the request hook has stamped the voider.
func voidWriteOffAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById(writeOffsTable, id)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func requireWriteOffCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(writeOffsTable); err != nil || n != want {
		t.Errorf("%d write-offs stored (err %v), want %d", n, err, want)
	}
}

func requireWrittenOff(t testing.TB, app core.App, invoice *core.Record, balance, writtenOff int) {
	t.Helper()
	r := reload(t, app, "books_invoices", invoice.Id)
	if got, want := [2]int{r.GetInt("balance"), r.GetInt("written_off")}, [2]int{balance, writtenOff}; got != want {
		t.Errorf("invoice %s balance/written_off = %v, want %v", invoice.GetString("number"), got, want)
	}
}

func requireInvoiceStatus(t testing.TB, app core.App, invoice *core.Record, want string) {
	t.Helper()
	if s := reload(t, app, "books_invoices", invoice.Id).GetString("status"); s != want {
		t.Errorf("invoice %s status %q, want %q", invoice.GetString("number"), s, want)
	}
}

// writeOffCase is one row of the case table the TypeScript schema and the Go
// create guard share (write_off_cases.json).
type writeOffCase struct {
	Name        string `json:"name"`
	InvoiceDate string `json:"invoiceDate"`
	CloseDate   string `json:"closeDate"`
	HasOverride bool   `json:"hasOverride"`
	Date        string `json:"date"`
	Account     string `json:"account"`
	MemoLength  int    `json:"memoLength"`
	Field       string `json:"field"`
	Message     string `json:"message"`
	Go          bool   `json:"go"`
}

func loadWriteOffCases(t *testing.T) []writeOffCase {
	t.Helper()
	raw, err := os.ReadFile(writeOffCasesFile)
	if err != nil {
		t.Fatalf("read %s: %v", writeOffCasesFile, err)
	}
	var cases []writeOffCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse %s: %v", writeOffCasesFile, err)
	}
	if len(cases) < 11 {
		t.Fatalf("%s holds %d cases, want every case of the plan", writeOffCasesFile, len(cases))
	}
	return cases
}

// accountOf is the account a case names by kind.
func (we *writeOffEnv) accountOf(t *testing.T, kind string) string {
	t.Helper()
	switch kind {
	case "expense":
		return we.badDebts.Id
	case "other_expense":
		return we.otherExpense.Id
	case "income":
		return we.revenue.Id
	case "inactive":
		return we.oldExpense.Id
	case "":
		return ""
	}
	t.Fatalf("case account %q is no kind this test knows", kind)
	return ""
}

func TestWriteOff_CreateRunsEveryCase(t *testing.T) {
	for _, c := range loadWriteOffCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			we := newWriteOffEnv(t)
			inv := we.postedInvoiceOn(t, we.customer, c.InvoiceDate, 50000)
			if c.CloseDate != "" {
				setCloseDate(t, we.app, c.CloseDate)
			}
			if c.HasOverride {
				grantOverride(t, we.app, we.users.bookkeeper, time.Now().Add(time.Hour))
			}
			r, err := we.newWriteOff(inv, map[string]any{
				"date": c.Date, "account": we.accountOf(t, c.Account), "amount": 50000,
				"memo": strings.Repeat("x", c.MemoLength),
			})
			if c.Field == "" {
				if err != nil {
					t.Fatalf("the write-off was refused: %v", err)
				}
				stored := reload(t, we.app, writeOffsTable, r.Id)
				if stored.GetString("status") != statusPosted || stored.GetString("number") != "1001" {
					t.Errorf("write-off status %q number %q, want posted 1001", stored.GetString("status"), stored.GetString("number"))
				}
				requireWrittenOff(t, we.app, inv, 0, 50000)
				return
			}
			requireRefusedOnField(t, err, c.Field)
			if c.Message != "" {
				requireFieldRefusal(t, err, c.Field, c.Message)
			}
			requireWriteOffCount(t, we.app, 0)
			requireWrittenOff(t, we.app, inv, 50000, 0)
		})
	}
}

func TestWriteOff_CreateRefusesAStatusOtherThanPosted(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	_, err := we.newWriteOff(inv, map[string]any{"status": statusVoid})
	requireRefusalText(t, err, wantWriteOffStatus)
	requireWriteOffCount(t, we.app, 0)
	requireWrittenOff(t, we.app, inv, 50000, 0)
}

// The create rule and the guard pin the server fields for REST. Each subtest
// has its own app: apiReq allows one call per app.
func TestWriteOff_ServerFieldsRefusedOnCreate(t *testing.T) {
	body := func(we *writeOffEnv, inv *core.Record, extra string) string {
		return fmt.Sprintf(`{"invoice":%q,"status":"posted","date":%q,"account":%q,"amount":50000%s}`,
			inv.Id, writeOffDay, we.badDebts.Id, extra)
	}
	writeOffsAfter := func(want int64) func(t testing.TB, app *tests.TestApp) {
		return func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords(writeOffsTable); n != want {
				t.Errorf("%d write-offs after the create, want %d", n, want)
			}
		}
	}

	t.Run("a write-off with no server field is created", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_write_offs/records",
			token: tokenFor(t, we.users.bookkeeper), body: body(we, inv, ""), want: http.StatusOK,
			after: writeOffsAfter(1),
		}.run(t, we.app)
	})

	cases := map[string]func(t testing.TB, we *writeOffEnv) string{
		"number":   func(testing.TB, *writeOffEnv) string { return `,"number":"1001"` },
		"sort_key": func(testing.TB, *writeOffEnv) string { return `,"sort_key":"2026-11-10 0001001"` },
		// The invoice's own customer, so only the server-field rule can refuse it.
		"customer": func(_ testing.TB, we *writeOffEnv) string { return fmt.Sprintf(`,"customer":%q`, we.customer.Id) },
		// The request's own user, so only the server-field rule can refuse it.
		"posted_by": func(_ testing.TB, we *writeOffEnv) string {
			return fmt.Sprintf(`,"posted_by":%q`, we.users.bookkeeper.Id)
		},
		// A real entry, so only the server-field rule can refuse the relation.
		"entry": func(t testing.TB, we *writeOffEnv) string {
			return fmt.Sprintf(`,"entry":%q`, we.sale(t, writeOffDay, 100).Id)
		},
	}
	for name, extra := range cases {
		t.Run(name, func(t *testing.T) {
			we := newWriteOffEnv(t)
			inv := we.postedInvoice(t, 50000)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_write_offs/records",
				token: tokenFor(t, we.users.bookkeeper), body: body(we, inv, extra(t, we)), want: http.StatusBadRequest,
				after: writeOffsAfter(0),
			}.run(t, we.app)
		})
	}
}

// The guard itself refuses a server field a caller inside Books sets.
func TestWriteOff_CreateRefusesServerFieldsInTheBody(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	for name, value := range map[string]any{
		"number": "1001", "customer": we.customer.Id, "sort_key": "2026-11-10 0001001",
		"entry": we.sale(t, writeOffDay, 100).Id,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := we.newWriteOff(inv, map[string]any{name: value})
			if err == nil {
				t.Fatalf("a write-off whose body sets %s was saved", name)
			}
			requireWriteOffCount(t, we.app, 0)
			requireWrittenOff(t, we.app, inv, 50000, 0)
		})
	}
}

func TestWriteOff_CreateRefusesAnInvoiceWithNoOpenBalance(t *testing.T) {
	we := newWriteOffEnv(t)

	t.Run("a draft invoice", func(t *testing.T) {
		draft, err := newInvoice(we.app, we.customer, nil)
		if err != nil {
			t.Fatalf("save a draft invoice: %v", err)
		}
		mkInvoiceLine(t, we.app, draft, 0, item(we.service, 1, 50000, false))
		_, err = we.newWriteOff(draft, map[string]any{"amount": 50000})
		apiErr := apiErrorOf(t, err)
		// A draft invoice has no number yet.
		if !strings.HasPrefix(apiErr.Message, "Invoice ") || !strings.HasSuffix(apiErr.Message, " has no open balance.") {
			t.Errorf("draft invoice refusal = %q, want \"Invoice <n> has no open balance.\"", apiErr.Message)
		}
		if _, ok := apiErr.Data["invoice"]; !ok {
			t.Errorf("draft invoice refusal data %v names no field invoice", apiErr.Data)
		}
	})

	t.Run("a void invoice", func(t *testing.T) {
		voided := we.postedInvoice(t, 30000)
		if err := voidInvoiceAs(we.app, voided.Id, we.actor); err != nil {
			t.Fatalf("void the invoice: %v", err)
		}
		_, err := we.newWriteOff(voided, map[string]any{"amount": 30000})
		requireFieldRefusal(t, err, "invoice", wantWriteOffNoBalance(voided.GetString("number")))
	})

	t.Run("a paid invoice", func(t *testing.T) {
		paid := we.postedInvoice(t, 20000)
		we.pay(t, paid, writeOffDay, 20000)
		requireWrittenOff(t, we.app, paid, 0, 0)
		_, err := we.newWriteOff(paid, map[string]any{"amount": 0})
		requireFieldRefusal(t, err, "invoice", wantWriteOffNoBalance(paid.GetString("number")))
	})

	requireWriteOffCount(t, we.app, 0)
}

// The amount is the whole open balance (Q1); a balance that changed while the
// dialog was open is refused with the stored balance in the text.
func TestWriteOff_CreateRefusesAnAmountThatIsNotTheBalance(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	we.pay(t, inv, writeOffDay, 10000)
	requireWrittenOff(t, we.app, inv, 40000, 0)
	want := wantWriteOffAmount(inv.GetString("number"), "$400.00")

	for _, amount := range []int64{30000, 45000} {
		_, err := we.newWriteOff(inv, map[string]any{"amount": amount})
		requireFieldRefusal(t, err, "amount", want)
	}
	requireWriteOffCount(t, we.app, 0)
	requireWrittenOff(t, we.app, inv, 40000, 0)

	we.mkWriteOff(t, inv, map[string]any{"amount": 40000})
	requireWrittenOff(t, we.app, inv, 0, 40000)
}

func TestWriteOff_AnInactiveCustomerDoesNotBlockIt(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	makeCustomerInactive(t, we.app, we.customer)

	wo := we.mkWriteOff(t, inv, nil)
	if wo.GetString("status") != statusPosted || wo.GetString("customer") != we.customer.Id {
		t.Errorf("write-off status %q customer %q, want posted with Harborview Dental", wo.GetString("status"), wo.GetString("customer"))
	}
	requireWrittenOff(t, we.app, inv, 0, 50000)
}

func TestWriteOff_UpdateOnlyVoids(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	other := we.postedInvoice(t, 20000)
	wo := we.mkWriteOff(t, inv, nil)

	for field, value := range map[string]any{
		"date": "2026-11-12", "account": we.otherExpense.Id, "amount": 40000, "memo": "Changed", "invoice": other.Id,
	} {
		t.Run("a change of "+field+" on a posted write-off", func(t *testing.T) {
			err := setFields(t, we.app, writeOffsTable, wo.Id, map[string]any{field: value})
			requireRefusalText(t, err, wantWriteOffChange)
			after := reload(t, we.app, writeOffsTable, wo.Id)
			if after.GetString("status") != statusPosted || after.GetString("invoice") != inv.Id || after.GetInt("amount") != 50000 ||
				after.GetString("memo") != writeOffTestMemo || after.GetString("date") != writeOffDay || after.GetString("account") != we.badDebts.Id {
				t.Errorf("write-off after the refused change: %v", after.PublicExport())
			}
		})
	}

	if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
		t.Fatalf("void the write-off with only its status: %v", err)
	}
	if s := reload(t, we.app, writeOffsTable, wo.Id).GetString("status"); s != statusVoid {
		t.Fatalf("write-off status %q after the void, want void", s)
	}

	for field, value := range map[string]any{"memo": "Changed", "status": statusPosted, "date": "2026-11-12"} {
		t.Run("a change of "+field+" on a void write-off", func(t *testing.T) {
			err := setFields(t, we.app, writeOffsTable, wo.Id, map[string]any{field: value})
			requireRefusalText(t, err, wantWriteOffChange)
			after := reload(t, we.app, writeOffsTable, wo.Id)
			if after.GetString("status") != statusVoid || after.GetString("memo") != writeOffTestMemo {
				t.Errorf("void write-off status %q memo %q after the refused change, want void and its memo",
					after.GetString("status"), after.GetString("memo"))
			}
		})
	}
	requireWrittenOff(t, we.app, inv, 50000, 0)
}

// PocketBase clears posted_by and voided_by of a deleted user by saving the
// write-off; the update guard takes that save and nothing else changes.
func TestWriteOff_ClearingADeletedUserIsTaken(t *testing.T) {
	we := newWriteOffEnv(t)
	poster := mkUser(t, we.app, "guest")
	setPkgAccess(t, we.app, poster, "full")
	voider := mkUser(t, we.app, "guest")
	setPkgAccess(t, we.app, voider, "full")

	postedInv := we.postedInvoice(t, 50000)
	voidInv := we.postedInvoice(t, 20000)
	posted := we.mkWriteOff(t, postedInv, map[string]any{"posted_by": poster.Id})
	voided := we.mkWriteOff(t, voidInv, map[string]any{"posted_by": poster.Id})
	if err := voidWriteOffAs(we.app, voided.Id, voider.Id); err != nil {
		t.Fatalf("void the second write-off: %v", err)
	}

	if err := we.app.Delete(reload(t, we.app, "users", voider.Id)); err != nil {
		t.Fatalf("delete the user who voided a write-off: %v", err)
	}
	if err := we.app.Delete(reload(t, we.app, "users", poster.Id)); err != nil {
		t.Fatalf("delete the user who posted two write-offs: %v", err)
	}
	p := reload(t, we.app, writeOffsTable, posted.Id)
	v := reload(t, we.app, writeOffsTable, voided.Id)
	if p.GetString("posted_by") != "" || v.GetString("posted_by") != "" || v.GetString("voided_by") != "" {
		t.Errorf("links after the deletes: posted_by %q / %q voided_by %q, want all cleared",
			p.GetString("posted_by"), v.GetString("posted_by"), v.GetString("voided_by"))
	}
	if got, want := [4]string{p.GetString("status"), p.GetString("number"), v.GetString("status"), v.GetString("number")},
		[4]string{statusPosted, "1001", statusVoid, "1002"}; got != want {
		t.Errorf("status/number after the deletes = %v, want %v", got, want)
	}
	requireWrittenOff(t, we.app, postedInv, 0, 50000)
	requireWrittenOff(t, we.app, voidInv, 20000, 0)
}

func TestWriteOff_DeleteIsRefused(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	wo := we.mkWriteOff(t, inv, nil)

	requireRefusalText(t, we.app.Delete(reload(t, we.app, writeOffsTable, wo.Id)), wantWriteOffDelete)
	if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	requireRefusalText(t, we.app.Delete(reload(t, we.app, writeOffsTable, wo.Id)), wantWriteOffDelete)
	requireWriteOffCount(t, we.app, 1)
}

func TestInvoiceVoid_RefusedWhileAPostedWriteOffNamesIt(t *testing.T) {
	t.Run("a written-off invoice", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		wo := we.mkWriteOff(t, inv, nil)

		requireRefusalText(t, voidInvoiceAs(we.app, inv.Id, we.actor), wantInvoiceWrittenOff)
		requireInvoiceStatus(t, we.app, inv, statusPosted)
		requireWrittenOff(t, we.app, inv, 0, 50000)

		if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
			t.Fatalf("void the write-off: %v", err)
		}
		if err := voidInvoiceAs(we.app, inv.Id, we.actor); err != nil {
			t.Fatalf("void the invoice after its write-off was voided: %v", err)
		}
		requireInvoiceStatus(t, we.app, inv, statusVoid)
	})

	// The write-off check runs before the payment check.
	t.Run("a paid-in-part invoice whose rest is written off", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		we.pay(t, inv, writeOffDay, 10000)
		we.mkWriteOff(t, inv, map[string]any{"amount": 40000})

		requireRefusalText(t, voidInvoiceAs(we.app, inv.Id, we.actor), wantInvoiceWrittenOff)
		requireInvoiceStatus(t, we.app, inv, statusPosted)
		requireWrittenOff(t, we.app, inv, 0, 40000)
	})
}

// correctionDraft saves a draft correction of original with one line of total.
func (we *writeOffEnv) correctionDraft(t testing.TB, original *core.Record, total int64) *core.Record {
	t.Helper()
	draft, err := newInvoice(we.app, we.customer, map[string]any{
		"replaces": original.Id, "date": original.GetString("date"), "due_date": original.GetString("due_date"),
	})
	if err != nil {
		t.Fatalf("save the correction draft: %v", err)
	}
	mkInvoiceLine(t, we.app, draft, 0, item(we.service, 1, total, false))
	return draft
}

func TestInvoiceCorrection_RefusedWhileAPostedWriteOffNamesIt(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	wo := we.mkWriteOff(t, inv, nil)
	draft := we.correctionDraft(t, inv, 45000)
	next := nextInvoiceNumber(t, we.app)

	requireRefusalText(t, postInvoiceAs(we.app, draft.Id, we.actor), wantInvoiceWrittenOff)
	requireInvoiceNotPosted(t, we.app, draft.Id, next)
	requireInvoiceStatus(t, we.app, inv, statusPosted)
	requireWrittenOff(t, we.app, inv, 0, 50000)

	if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	corrected := mustPostInvoice(t, we.app, draft.Id, we.actor)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != inv.GetString("number") {
		t.Errorf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), inv.GetString("number"))
	}
	requireInvoiceStatus(t, we.app, inv, statusVoid)
	requireWrittenOff(t, we.app, corrected, 45000, 0)
}

// written_off is a server field: a person's write of it is refused, on a
// posted invoice with and without a write-off.
func TestInvoiceWrittenOff_APersonCannotSetIt(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	if err := setFields(t, we.app, "books_invoices", inv.Id, map[string]any{"written_off": 100}); err == nil {
		t.Error("a person's update of a posted invoice's written_off was saved")
	}
	requireWrittenOff(t, we.app, inv, 50000, 0)

	we.mkWriteOff(t, inv, nil)
	if err := setFields(t, we.app, "books_invoices", inv.Id, map[string]any{"written_off": 0}); err == nil {
		t.Error("a person's update of a written-off invoice's written_off was saved")
	}
	requireWrittenOff(t, we.app, inv, 0, 50000)
}

// The account delete guard counts the write-offs that name the account,
// posted or void, before the journal-lines check.
func TestAccount_DeleteRefusedWhileWriteOffsNameIt(t *testing.T) {
	we := newWriteOffEnv(t)
	deleteBadDebts := func() error {
		return we.app.Delete(reload(t, we.app, "books_accounts", we.badDebts.Id))
	}
	first := we.mkWriteOff(t, we.postedInvoice(t, 50000), nil)
	requireMessageOnlyRefusal(t, deleteBadDebts(), wantWriteOffAccountOf1)

	if err := voidWriteOffAs(we.app, first.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	requireMessageOnlyRefusal(t, deleteBadDebts(), wantWriteOffAccountOf1)

	we.mkWriteOff(t, we.postedInvoice(t, 20000), nil)
	requireMessageOnlyRefusal(t, deleteBadDebts(), wantWriteOffAccountOf2)
	reload(t, we.app, "books_accounts", we.badDebts.Id)
	if n, err := we.app.CountRecords(writeOffsTable, dbx.HashExp{"account": we.badDebts.Id}); err != nil || n != 2 {
		t.Errorf("%d write-offs name 6050 Bad debts (err %v), want 2", n, err)
	}
}
