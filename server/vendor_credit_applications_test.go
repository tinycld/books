package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Applying a vendor credit to bills (vendor credit spec §3.9, §3.10, §4): an
// application is a stored record that posts no journal entry. Its create guard
// runs inside serialized and re-reads the credit and the bill; a create lowers
// the credit's and the bill's balance, a delete raises both again. An
// application is never updated. An applied credit and a bill with credits keep
// their void and correction rules. These tests write every application through
// REST, as the client does, so the rules and the request hooks run.

// The refusal texts of the application guards, as the client gets them.
// Written out here, not read from the consts, so a change of wording fails this
// file too.
const (
	wantApplyCreditNotPosted     = "Only a posted vendor credit is applied to bills."
	wantApplyDraftBillNotOpen    = "This bill is not open. Clear it to continue."
	wantApplyBeforeCreditDate    = "The apply date can't be before the credit date."
	wantApplicationNotChanged    = "A credit application is not changed. Remove it and apply the credit again."
	wantCreditVoidApplied        = "This credit is applied to bills. Remove it from those bills first."
	wantCreditCorrectionVendor   = "This credit is applied to bills, so its vendor cannot change."
	wantBillVoidCreditsApplied   = "Vendor credits are applied to this bill. Remove them first."
	wantBillCorrectionCreditVndr = "Vendor credits are applied to this bill, so its vendor cannot change."

	creditApplicationsCol = "books_vendor_credit_applications"

	// The credit is dated vendorCreditDay (2026-11-12); applications the day
	// after unless a case says otherwise.
	applyDay       = "2026-11-13"
	beforeCreditOn = "2026-11-11"
)

func wantApplyBillNotOpen(number string) string {
	return fmt.Sprintf("Bill %s is not open. Clear it to continue.", number)
}

func wantApplyAboveBillBalance(number, open string) string {
	return fmt.Sprintf("Bill %s: the credit is more than its open balance of %s.", number, open)
}

func wantApplyAboveUnapplied(left string) string {
	return fmt.Sprintf("More than the unapplied credit of %s.", left)
}

func wantCreditCorrectionBelowApplied(applied string) string {
	return fmt.Sprintf("%s of this credit is applied to bills. Its total cannot be below that.", applied)
}

func wantBillCorrectionBelowPaymentsAndCredits(sum string) string {
	return fmt.Sprintf("Payments and credits of %s are applied to this bill. Its total cannot be below that.", sum)
}

func wantBillCorrectionBelowPayments(sum string) string {
	return fmt.Sprintf("Payments of %s are applied to this bill. Its total cannot be below that.", sum)
}

func wantClosedThrough(day string) string {
	return fmt.Sprintf("The books are closed through %s. Ask a Books admin for a close-date override to post on %s.", day, day)
}

// newApplyBook is a bill payment env (the e2e chart's accounts, 2000 Accounts
// Payable, Summit IT Services, Office Supply World and Pacific Power) with the
// bill, vendor credit, bill payment and credit application guards bound, both
// forms hosts, batch requests on, the ledger env's Rent numbered 6100 and
// Pacific Power active.
func newApplyBook(t *testing.T) *billPayEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, vendorCreditKind)
	bindHostsByKey(t, env.app, billKind.HostKey, vendorCreditHostKey)
	registerBillPaymentGuards(env.app)
	registerVendorCreditApplications(env.app)
	enableBatch(t, env.app)
	bp := &billPayEnv{expenseEnv: expenseEnvOn(t, env)}
	bp.payable = mkNumberedAccount(t, env.app, "Accounts Payable", "2000", "accounts_payable", "accounts_payable")
	if err := setFields(t, env.app, "books_accounts", env.rent.Id, map[string]any{"number": "6100"}); err != nil {
		t.Fatalf("number Rent 6100: %v", err)
	}
	if err := setFields(t, env.app, "books_vendors", bp.pacificPower.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Pacific Power active: %v", err)
	}
	return bp
}

// applyEnv is the apply book with the spec's case: a posted credit of 50.00
// from Pacific Power dated vendorCreditDay (Vendor credit 1001, on 6100 Rent),
// and two posted bills of Pacific Power, 30.00 (Bill 1001) and 100.00 (Bill
// 1002).
type applyEnv struct {
	*billPayEnv
	credit, small, large *core.Record
}

func newApplyEnv(t *testing.T) *applyEnv {
	t.Helper()
	bp := newApplyBook(t)
	credit := bp.postedCredit(t, bp.pacificPower, vendorCreditDay, billAmount{bp.rent, 5000})
	small := bp.postedBill(t, bp.pacificPower, 3000)
	large := bp.postedBill(t, bp.pacificPower, 10000)
	return &applyEnv{billPayEnv: bp, credit: credit, small: small, large: large}
}

// postedCredit saves a vendor credit of vendor dated day with one account line
// per amount, and posts it.
func (bp *billPayEnv) postedCredit(t testing.TB, vendor *core.Record, day string, lines ...billAmount) *core.Record {
	t.Helper()
	vc := mkVendorCreditOn(t, bp.app, vendor, map[string]any{"date": day})
	for i, l := range lines {
		mkVendorCreditLine(t, bp.app, vc, i, accountLine(l.account, l.amount))
	}
	return mustPostVendorCredit(t, bp.app, vc.Id, bp.users.bookkeeper.Id)
}

// creditCorrectionOf saves a draft correction of original for vendor with one
// account line per amount.
func (bp *billPayEnv) creditCorrectionOf(t testing.TB, original, vendor *core.Record, lines ...billAmount) *core.Record {
	t.Helper()
	draft := mkVendorCreditOn(t, bp.app, vendor, map[string]any{"replaces": original.Id})
	for i, l := range lines {
		mkVendorCreditLine(t, bp.app, draft, i, accountLine(l.account, l.amount))
	}
	return draft
}

// restAnswer is the answer of one REST call.
type restAnswer struct {
	status int
	body   string
}

// refusal reads a refused call's message and field messages.
func (a restAnswer) refusal(t testing.TB) (string, map[string]string) {
	t.Helper()
	if a.status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", a.status, a.body)
	}
	var parsed struct {
		Message string                     `json:"message"`
		Data    map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal([]byte(a.body), &parsed); err != nil {
		t.Fatalf("parse the refusal: %v; body: %s", err, a.body)
	}
	fields := map[string]string{}
	for field, raw := range parsed.Data {
		var item struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &item)
		fields[field] = item.Message
	}
	return parsed.Message, fields
}

// requireField checks a guard refusal keyed by field, with want on the refusal
// and on the field, so the client shows it under that field.
func (a restAnswer) requireField(t testing.TB, field, want string) {
	t.Helper()
	message, fields := a.refusal(t)
	got, ok := fields[field]
	if !ok {
		t.Fatalf("refusal %q names fields %v, want %q", message, fields, field)
	}
	if got != want || message != want {
		t.Errorf("refusal on %s = %q (message %q), want %q", field, got, message, want)
	}
}

func (a restAnswer) requireMessage(t testing.TB, want string) {
	t.Helper()
	if message, _ := a.refusal(t); message != want {
		t.Errorf("refusal message = %q, want %q", message, want)
	}
}

func (a restAnswer) requireNamesField(t testing.TB, field string) {
	t.Helper()
	message, fields := a.refusal(t)
	if _, ok := fields[field]; !ok {
		t.Errorf("refusal %q names fields %v, want %q among them", message, fields, field)
	}
}

// requireRefused checks a call a rule refuses: any 4xx.
func (a restAnswer) requireRefused(t testing.TB, what string) {
	t.Helper()
	if a.status < 400 || a.status >= 500 {
		t.Errorf("%s answered %d, want a refusal; body: %s", what, a.status, a.body)
	}
}

func applicationBody(credit, bill *core.Record, amount int64, day string) map[string]any {
	return map[string]any{"vendor_credit": credit.Id, "bill": bill.Id, "amount": amount, "date": day}
}

// applyAs sends one application create as user.
func (bp *billPayEnv) applyAs(t testing.TB, user, credit, bill *core.Record, amount int64, day string) restAnswer {
	t.Helper()
	return bp.applyBodyAs(t, user, applicationBody(credit, bill, amount, day))
}

func (bp *billPayEnv) applyBodyAs(t testing.TB, user *core.Record, body map[string]any) restAnswer {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	status, out := bp.rest(t).send(t, user, http.MethodPost, "/api/collections/"+creditApplicationsCol+"/records", string(raw))
	return restAnswer{status: status, body: out}
}

// apply applies amount of credit to bill on day as the bookkeeper and returns
// the application as stored.
func (bp *billPayEnv) apply(t testing.TB, credit, bill *core.Record, amount int64, day string) *core.Record {
	t.Helper()
	a := bp.applyAs(t, bp.users.bookkeeper, credit, bill, amount, day)
	if a.status != http.StatusOK {
		t.Fatalf("apply %d of the credit to bill %s answered %d; body: %s", amount, bill.GetString("number"), a.status, a.body)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(a.body), &created); err != nil || created.ID == "" {
		t.Fatalf("read the created application: %v; body: %s", err, a.body)
	}
	return reload(t, bp.app, creditApplicationsCol, created.ID)
}

// removeAs sends one application delete as user.
func (bp *billPayEnv) removeAs(t testing.TB, user, application *core.Record) restAnswer {
	t.Helper()
	status, out := bp.rest(t).send(t, user, http.MethodDelete,
		"/api/collections/"+creditApplicationsCol+"/records/"+application.Id, "")
	return restAnswer{status: status, body: out}
}

func requireCreditApplicationCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(creditApplicationsCol); err != nil || n != want {
		t.Errorf("%d credit applications stored (err %v), want %d", n, err, want)
	}
}

func requireApplicationNames(t testing.TB, app core.App, application *core.Record, field, want string) {
	t.Helper()
	if got := reload(t, app, creditApplicationsCol, application.Id).GetString(field); got != want {
		t.Errorf("application %s = %q, want %q", field, got, want)
	}
}

func journalEntryCount(t testing.TB, app core.App) int64 {
	t.Helper()
	n, err := app.CountRecords("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// requireOpen checks the credit's and the bills' stored balances.
func (ae *applyEnv) requireOpen(t testing.TB, credit, small, large int) {
	t.Helper()
	requireVendorCreditBalance(t, ae.app, ae.credit.Id, credit)
	requireBillBalance(t, ae.app, ae.small, small)
	requireBillBalance(t, ae.app, ae.large, large)
}

func TestVendorCreditApplication_CreateLowersBothBalances(t *testing.T) {
	ae := newApplyEnv(t)
	ae.requireOpen(t, 5000, 3000, 10000)
	entries := journalEntryCount(t, ae.app)

	first := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	if got := first.GetString("applied_by"); got != ae.users.bookkeeper.Id {
		t.Errorf("applied_by = %q, want the writer %q", got, ae.users.bookkeeper.Id)
	}
	ae.requireOpen(t, 2000, 0, 10000)
	if got := journalEntryCount(t, ae.app); got != entries {
		t.Errorf("%d journal entries after the application, want %d: an application posts no entry", got, entries)
	}
	requireNoDocumentDrift(t, ae.app)

	ae.apply(t, ae.credit, ae.large, 2000, applyDay)
	ae.requireOpen(t, 0, 0, 8000)
	if got := journalEntryCount(t, ae.app); got != entries {
		t.Errorf("%d journal entries after two applications, want %d", got, entries)
	}
	requireCreditApplicationCount(t, ae.app, 2)
	requireNoDocumentDrift(t, ae.app)

	if got, want := vendorCreditApplicationLabel(ae.app, first), "Vendor credit 1001: Bill 1001"; got != want {
		t.Errorf("vendorCreditApplicationLabel = %q, want %q", got, want)
	}
}

func TestVendorCreditApplication_RefusesACreditThatIsNotPosted(t *testing.T) {
	ae := newApplyEnv(t)
	draft := mkVendorCreditOn(t, ae.app, ae.pacificPower, nil)
	mkVendorCreditLine(t, ae.app, draft, 0, accountLine(ae.rent, 5000))
	voided := ae.postedCredit(t, ae.pacificPower, vendorCreditDay, billAmount{ae.rent, 5000})
	if err := voidVendorCreditAs(ae.app, voided.Id, ae.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a credit with no application: %v", err)
	}

	for _, c := range []struct {
		what   string
		credit *core.Record
	}{{"a draft credit", draft}, {"a void credit", voided}} {
		t.Run(c.what, func(t *testing.T) {
			ae.applyAs(t, ae.users.bookkeeper, c.credit, ae.large, 1000, applyDay).
				requireField(t, "vendor_credit", wantApplyCreditNotPosted)
			requireVendorCreditBalance(t, ae.app, c.credit.Id, 0)
			ae.requireOpen(t, 5000, 3000, 10000)
		})
	}
	requireCreditApplicationCount(t, ae.app, 0)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditApplication_RefusesABillThatIsNotOpen(t *testing.T) {
	ae := newApplyEnv(t)
	draftBill := mkBill(t, ae.app, ae.pacificPower, nil)
	mkBillLine(t, ae.app, draftBill, 0, accountLine(ae.software, 3000))
	voidBill := ae.postedBill(t, ae.pacificPower, 3000)
	if err := voidBillAs(ae.app, voidBill.Id, ae.users.bookkeeper.Id); err != nil {
		t.Fatalf("void a bill: %v", err)
	}
	otherVendors := ae.postedBill(t, ae.summit, 3000)

	t.Run("a draft bill, which has no number", func(t *testing.T) {
		ae.applyAs(t, ae.users.bookkeeper, ae.credit, draftBill, 1000, applyDay).
			requireField(t, "bill", wantApplyDraftBillNotOpen)
		requireBillBalance(t, ae.app, draftBill, 0)
		ae.requireOpen(t, 5000, 3000, 10000)
	})
	t.Run("a void bill", func(t *testing.T) {
		ae.applyAs(t, ae.users.bookkeeper, ae.credit, voidBill, 1000, applyDay).
			requireField(t, "bill", wantApplyBillNotOpen(voidBill.GetString("number")))
		requireBillBalance(t, ae.app, voidBill, 0)
		ae.requireOpen(t, 5000, 3000, 10000)
	})
	t.Run("a bill of another vendor", func(t *testing.T) {
		ae.applyAs(t, ae.users.bookkeeper, ae.credit, otherVendors, 1000, applyDay).
			requireField(t, "bill", wantApplyBillNotOpen(otherVendors.GetString("number")))
		requireBillBalance(t, ae.app, otherVendors, 3000)
		ae.requireOpen(t, 5000, 3000, 10000)
	})
	t.Run("a bill with balance 0", func(t *testing.T) {
		ae.apply(t, ae.credit, ae.small, 3000, applyDay)
		ae.requireOpen(t, 2000, 0, 10000)
		ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.small, 1000, applyDay).
			requireField(t, "bill", wantApplyBillNotOpen(ae.small.GetString("number")))
		ae.requireOpen(t, 2000, 0, 10000)
		requireCreditApplicationCount(t, ae.app, 1)
	})
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditApplication_RefusesAnAmountAboveEitherBalance(t *testing.T) {
	ae := newApplyEnv(t)

	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.small, 4000, applyDay).
		requireField(t, "bill", wantApplyAboveBillBalance(ae.small.GetString("number"), "$30.00"))
	ae.requireOpen(t, 5000, 3000, 10000)
	requireCreditApplicationCount(t, ae.app, 0)

	ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, 2500, applyDay).
		requireField(t, "amount", wantApplyAboveUnapplied("$20.00"))
	ae.requireOpen(t, 2000, 0, 10000)
	requireCreditApplicationCount(t, ae.app, 1)
	requireNoDocumentDrift(t, ae.app)
}

// The schema holds amount above 0 (min 1).
func TestVendorCreditApplication_RefusesAnAmountNotAboveZero(t *testing.T) {
	ae := newApplyEnv(t)
	for _, amount := range []int64{0, -1} {
		ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, amount, applyDay).requireNamesField(t, "amount")
		ae.requireOpen(t, 5000, 3000, 10000)
	}
	requireCreditApplicationCount(t, ae.app, 0)
}

func TestVendorCreditApplication_RefusesABadDate(t *testing.T) {
	ae := newApplyEnv(t)

	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, 1000, "2026-13-40").
		requireField(t, "date", wantDocumentDay)
	ae.requireOpen(t, 5000, 3000, 10000)

	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, 1000, beforeCreditOn).
		requireField(t, "date", wantApplyBeforeCreditDate)
	ae.requireOpen(t, 5000, 3000, 10000)

	setCloseDate(t, ae.app, applyDay)
	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, 1000, applyDay).
		requireField(t, "date", wantClosedThrough(applyDay))
	ae.requireOpen(t, 5000, 3000, 10000)
	requireCreditApplicationCount(t, ae.app, 0)

	// The ledger's close-date rule: a writer who holds an unexpired override
	// applies on the close date, and the application records that override.
	override := grantOverride(t, ae.app, ae.users.bookkeeper, time.Now().Add(time.Hour))
	application := ae.apply(t, ae.credit, ae.large, 1000, applyDay)
	requireApplicationNames(t, ae.app, application, "close_override", override.Id)
	ae.requireOpen(t, 4000, 3000, 9000)
	requireCreditApplicationCount(t, ae.app, 1)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditApplication_RulesRefuseAppliedByAndAReader(t *testing.T) {
	ae := newApplyEnv(t)

	body := applicationBody(ae.credit, ae.large, 1000, applyDay)
	body["applied_by"] = ae.users.admin.Id
	ae.applyBodyAs(t, ae.users.bookkeeper, body).requireRefused(t, "a create that sets applied_by")
	requireCreditApplicationCount(t, ae.app, 0)
	ae.requireOpen(t, 5000, 3000, 10000)

	ae.applyAs(t, ae.users.readOnly, ae.credit, ae.large, 1000, applyDay).requireRefused(t, "a reader's create")
	requireCreditApplicationCount(t, ae.app, 0)
	ae.requireOpen(t, 5000, 3000, 10000)

	// close_override is server-written: a client value naming another user's
	// override is refused by the rule or replaced by the writer's own override.
	setCloseDate(t, ae.app, applyDay)
	own := grantOverride(t, ae.app, ae.users.bookkeeper, time.Now().Add(time.Hour))
	others := grantOverride(t, ae.app, ae.users.admin, time.Now().Add(time.Hour))
	body = applicationBody(ae.credit, ae.large, 1000, applyDay)
	body["close_override"] = others.Id
	a := ae.applyBodyAs(t, ae.users.bookkeeper, body)
	if a.status != http.StatusOK {
		if message, _ := a.refusal(t); message == wantClosedThrough(applyDay) {
			t.Fatalf("a create with a client close_override was refused by the close date, not by the rule: the writer holds an override")
		}
		requireCreditApplicationCount(t, ae.app, 0)
		ae.requireOpen(t, 5000, 3000, 10000)
		return
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(a.body), &created); err != nil || created.ID == "" {
		t.Fatalf("read the created application: %v; body: %s", err, a.body)
	}
	stored := reload(t, ae.app, creditApplicationsCol, created.ID)
	requireApplicationNames(t, ae.app, stored, "close_override", own.Id)
	ae.requireOpen(t, 4000, 3000, 9000)
}

// The guard re-reads the credit's balance inside serialized: two creates that
// together pass it are refused at the second, whether in one batch or one
// after the other.
func TestVendorCreditApplication_TheSecondOfTwoCreatesPastTheCreditIsRefused(t *testing.T) {
	ae := newApplyEnv(t)

	ae.batch(t, ae.users.bookkeeper,
		createOp(t, creditApplicationsCol, applicationBody(ae.credit, ae.small, 3000, applyDay)),
		createOp(t, creditApplicationsCol, applicationBody(ae.credit, ae.large, 3000, applyDay)),
	).failure(t).requireField(t, "amount", wantApplyAboveUnapplied("$20.00"))
	requireCreditApplicationCount(t, ae.app, 0)
	ae.requireOpen(t, 5000, 3000, 10000)

	ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	ae.applyAs(t, ae.users.bookkeeper, ae.credit, ae.large, 3000, applyDay).
		requireField(t, "amount", wantApplyAboveUnapplied("$20.00"))
	requireCreditApplicationCount(t, ae.app, 1)
	ae.requireOpen(t, 2000, 0, 10000)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditApplication_IsNeverUpdated(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.large, 3000, applyDay)

	status, body := ae.rest(t).send(t, ae.users.bookkeeper, http.MethodPatch,
		"/api/collections/"+creditApplicationsCol+"/records/"+application.Id, `{"amount":1000}`)
	restAnswer{status: status, body: body}.requireRefused(t, "a client update of amount")

	err := setFields(t, ae.app, creditApplicationsCol, application.Id, map[string]any{"amount": 1000})
	requireRefusalText(t, err, wantApplicationNotChanged)

	if got := reload(t, ae.app, creditApplicationsCol, application.Id).GetInt("amount"); got != 3000 {
		t.Errorf("application amount = %d after the refusals, want 3000", got)
	}
	ae.requireOpen(t, 2000, 3000, 7000)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditApplication_DeleteRestoresBothBalances(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	ae.requireOpen(t, 2000, 0, 10000)

	ae.removeAs(t, ae.users.readOnly, application).requireRefused(t, "a reader's delete")
	requireCreditApplicationCount(t, ae.app, 1)
	ae.requireOpen(t, 2000, 0, 10000)

	if a := ae.removeAs(t, ae.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("a writer's delete answered %d, want 204; body: %s", a.status, a.body)
	}
	requireCreditApplicationCount(t, ae.app, 0)
	ae.requireOpen(t, 5000, 3000, 10000)
	requireNoDocumentDrift(t, ae.app)
}

// A close date set after the application closes it: its delete is refused with
// the ledger's text, and both balances stay.
func TestVendorCreditApplication_DeleteOnOrBeforeTheCloseDateIsRefused(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	setCloseDate(t, ae.app, applyDay)

	ae.removeAs(t, ae.users.bookkeeper, application).requireMessage(t, wantClosedThrough(applyDay))
	requireCreditApplicationCount(t, ae.app, 1)
	ae.requireOpen(t, 2000, 0, 10000)
	requireNoDocumentDrift(t, ae.app)

	// The ledger's close-date rule: a writer who holds an unexpired override
	// removes it, and both balances go back up.
	grantOverride(t, ae.app, ae.users.bookkeeper, time.Now().Add(time.Hour))
	if a := ae.removeAs(t, ae.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("a delete by a writer with an override answered %d, want 204; body: %s", a.status, a.body)
	}
	requireCreditApplicationCount(t, ae.app, 0)
	ae.requireOpen(t, 5000, 3000, 10000)
	requireNoDocumentDrift(t, ae.app)
}

// The inactive rule is for posting: a posted credit of a vendor made inactive
// afterwards still applies to that vendor's open bill.
func TestVendorCreditApplication_AnInactiveVendorStillApplies(t *testing.T) {
	ae := newApplyEnv(t)
	makeVendorInactive(t, ae.app, ae.pacificPower)

	ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	ae.requireOpen(t, 2000, 0, 10000)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditVoid_RefusedWhileApplied(t *testing.T) {
	ae := newApplyEnv(t)
	actor := ae.users.bookkeeper.Id
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)

	requireRefusalText(t, voidVendorCreditAs(ae.app, ae.credit.Id, actor), wantCreditVoidApplied)
	if s := reload(t, ae.app, vendorCreditsCollection, ae.credit.Id).GetString("status"); s != statusPosted {
		t.Errorf("credit status %q after the refusal, want posted", s)
	}
	ae.requireOpen(t, 2000, 0, 10000)

	if a := ae.removeAs(t, ae.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("remove the application answered %d; body: %s", a.status, a.body)
	}
	if err := voidVendorCreditAs(ae.app, ae.credit.Id, actor); err != nil {
		t.Fatalf("void the credit after its application was removed: %v", err)
	}
	voided := reload(t, ae.app, vendorCreditsCollection, ae.credit.Id)
	if voided.GetString("status") != statusVoid || voided.GetInt("balance") != 0 {
		t.Errorf("credit status %q balance %d, want void and 0", voided.GetString("status"), voided.GetInt("balance"))
	}
	requireNoDocumentDrift(t, ae.app)
}

func TestBillVoid_RefusedWhileACreditIsApplied(t *testing.T) {
	ae := newApplyEnv(t)
	actor := ae.users.bookkeeper.Id
	ae.apply(t, ae.credit, ae.large, 3000, applyDay)

	requireRefusalText(t, voidBillAs(ae.app, ae.large.Id, actor), wantBillVoidCreditsApplied)
	if s := reload(t, ae.app, "books_bills", ae.large.Id).GetString("status"); s != statusPosted {
		t.Errorf("bill status %q after the refusal, want posted", s)
	}
	ae.requireOpen(t, 2000, 3000, 7000)

	// A posted payment is named first.
	ae.pay(t, ae.pacificPower, nil, payLine{ae.large, 1000})
	requireRefusalText(t, voidBillAs(ae.app, ae.large.Id, actor), wantBillVoidWithPayments)
	ae.requireOpen(t, 2000, 3000, 6000)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditCorrection_TakesTheApplications(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	draft := ae.creditCorrectionOf(t, ae.credit, ae.pacificPower, billAmount{ae.rent, 4000})

	corrected := mustPostVendorCredit(t, ae.app, draft.Id, ae.users.bookkeeper.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != ae.credit.GetString("number") {
		t.Errorf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), ae.credit.GetString("number"))
	}
	requireApplicationNames(t, ae.app, application, "vendor_credit", draft.Id)
	requireVendorCreditBalance(t, ae.app, draft.Id, 1000)
	requireVendorCreditBalance(t, ae.app, ae.credit.Id, 0)
	requireBillBalance(t, ae.app, ae.small, 0)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditCorrection_RefusedBelowTheApplications(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	draft := ae.creditCorrectionOf(t, ae.credit, ae.pacificPower, billAmount{ae.rent, 2000})
	next := nextVendorCreditNumber(t, ae.app)

	requireRefusalText(t, postVendorCreditAs(ae.app, draft.Id, ae.users.bookkeeper.Id), wantCreditCorrectionBelowApplied("$30.00"))
	requireVendorCreditNotPosted(t, ae.app, draft.Id, next)
	if s := reload(t, ae.app, vendorCreditsCollection, ae.credit.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requireApplicationNames(t, ae.app, application, "vendor_credit", ae.credit.Id)
	ae.requireOpen(t, 2000, 0, 10000)
	requireNoDocumentDrift(t, ae.app)
}

func TestVendorCreditCorrection_RefusesAnotherVendor(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.small, 3000, applyDay)
	draft := ae.creditCorrectionOf(t, ae.credit, ae.officeSupply, billAmount{ae.rent, 5000})
	next := nextVendorCreditNumber(t, ae.app)

	requireRefusalText(t, postVendorCreditAs(ae.app, draft.Id, ae.users.bookkeeper.Id), wantCreditCorrectionVendor)
	requireVendorCreditNotPosted(t, ae.app, draft.Id, next)
	requireApplicationNames(t, ae.app, application, "vendor_credit", ae.credit.Id)
	ae.requireOpen(t, 2000, 0, 10000)
	requireNoDocumentDrift(t, ae.app)
}

// paidAndCredited pays 40.00 of the 100.00 bill and applies 30.00 of the
// credit to it: its balance is 30.00.
func (ae *applyEnv) paidAndCredited(t *testing.T) (payment, application *core.Record) {
	t.Helper()
	payment = ae.pay(t, ae.pacificPower, nil, payLine{ae.large, 4000})
	application = ae.apply(t, ae.credit, ae.large, 3000, applyDay)
	ae.requireOpen(t, 2000, 3000, 3000)
	return payment, application
}

func TestBillCorrection_TakesTheApplicationsWithThePayments(t *testing.T) {
	ae := newApplyEnv(t)
	payment, application := ae.paidAndCredited(t)
	draft := ae.billCorrectionOf(t, ae.large, ae.pacificPower, 8000)

	corrected := mustPostBill(t, ae.app, draft.Id, ae.users.bookkeeper.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != ae.large.GetString("number") {
		t.Errorf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), ae.large.GetString("number"))
	}
	requireApplicationNames(t, ae.app, application, "bill", draft.Id)
	requirePaymentLinesName(t, ae.app, payment, draft)
	requireBillBalance(t, ae.app, corrected, 1000)
	requireBillBalance(t, ae.app, ae.large, 0)
	requireVendorCreditBalance(t, ae.app, ae.credit.Id, 2000)
	requireNoDocumentDrift(t, ae.app)
}

// Below what pays the bill: the text names payments and credits with their sum
// while a credit is applied, and keeps the payments-only text when none is.
func TestBillCorrection_RefusedBelowThePaymentsAndCredits(t *testing.T) {
	t.Run("a payment and a credit", func(t *testing.T) {
		ae := newApplyEnv(t)
		payment, application := ae.paidAndCredited(t)
		draft := ae.billCorrectionOf(t, ae.large, ae.pacificPower, 6000)
		next := nextBillNumber(t, ae.app)

		requireRefusalText(t, postBillAs(ae.app, draft.Id, ae.users.bookkeeper.Id), wantBillCorrectionBelowPaymentsAndCredits("$70.00"))
		requireBillNotPosted(t, ae.app, draft.Id, next)
		requireApplicationNames(t, ae.app, application, "bill", ae.large.Id)
		requirePaymentLinesName(t, ae.app, payment, ae.large)
		ae.requireOpen(t, 2000, 3000, 3000)
		requireNoDocumentDrift(t, ae.app)
	})
	t.Run("a payment only", func(t *testing.T) {
		ae := newApplyEnv(t)
		payment := ae.pay(t, ae.pacificPower, nil, payLine{ae.large, 4000})
		draft := ae.billCorrectionOf(t, ae.large, ae.pacificPower, 3000)
		next := nextBillNumber(t, ae.app)

		requireRefusalText(t, postBillAs(ae.app, draft.Id, ae.users.bookkeeper.Id), wantBillCorrectionBelowPayments("$40.00"))
		requireBillNotPosted(t, ae.app, draft.Id, next)
		requirePaymentLinesName(t, ae.app, payment, ae.large)
		ae.requireOpen(t, 5000, 3000, 6000)
		requireNoDocumentDrift(t, ae.app)
	})
}

func TestBillCorrection_RefusesAnotherVendorWhileACreditIsApplied(t *testing.T) {
	ae := newApplyEnv(t)
	application := ae.apply(t, ae.credit, ae.large, 3000, applyDay)
	draft := ae.billCorrectionOf(t, ae.large, ae.officeSupply, 10000)
	next := nextBillNumber(t, ae.app)

	requireRefusalText(t, postBillAs(ae.app, draft.Id, ae.users.bookkeeper.Id), wantBillCorrectionCreditVndr)
	requireBillNotPosted(t, ae.app, draft.Id, next)
	if s := reload(t, ae.app, "books_bills", ae.large.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %q after the refusal, want posted", s)
	}
	requireApplicationNames(t, ae.app, application, "bill", ae.large.Id)
	ae.requireOpen(t, 2000, 3000, 7000)
	requireNoDocumentDrift(t, ae.app)
}
