package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The vendor refund guards (vendor refund spec §3.6, §4): a draft refund names
// an existing vendor, a real day, a reference no. of at most 40 characters, a
// known payment method, an active Refunded to account that is a bank, a
// credit card or Undeposited funds, and an amount from 1 cent to the stored
// limit; each line names a posted vendor credit of the refund's vendor, once,
// for more than 0, at most 500 lines; the Books-written fields are the
// server's; a posted refund changes only to void, and its lines never.

// The refusal texts of the vendor refund guards, as the client gets them
// (PocketBase adds a final period). Written out here, not read from the
// consts, so a change of wording fails this file too.
const (
	wantRefundTooManyCredits   = "A vendor refund can refund at most 500 vendor credits."
	wantRefundSumNotAmount     = "The refunds must add up to the amount refunded."
	wantRefundAccountType      = "Choose a bank, credit card or Undeposited funds account."
	wantRefundCorrectionVendor = "A vendor refund correction keeps its vendor."
	wantRefundEditMissing      = "The vendor refund being edited does not exist."
	wantRefundOnlyPostedEdits  = "Only a posted vendor refund can be edited."
	wantRefundPostedFixed      = "A posted or void vendor refund cannot be changed."
	wantRefundLinesFixed       = "The vendor credits of a posted vendor refund cannot change."
	wantRefundEntryFromPost    = "A vendor refund entry comes only from posting its vendor refund."

	refundsCol       = "books_vendor_refunds"
	refundLinesCol   = "books_vendor_refund_lines"
	refundSequenceID = "booksseqvrefund"
	// refundDay is after vendorCreditDay (2026-11-12), the day of the credits
	// these tests refund.
	refundDay = "2026-11-14"
)

func wantRefundNotOpen(number string) string {
	return fmt.Sprintf("Vendor credit %s is not open. Clear it to continue.", number)
}

func wantRefundAboveUnapplied(number, unapplied string) string {
	return fmt.Sprintf("Vendor credit %s: the refund is more than its unapplied credit of %s.", number, unapplied)
}

func wantRefundCreditAfterRefund(number string) string {
	return fmt.Sprintf("Vendor credit %s is dated after the refund date.", number)
}

func wantRefundCreditTwice(number string) string {
	return fmt.Sprintf("Vendor credit %s is already on this refund.", number)
}

func wantRefundLineAboveZero(number string) string {
	return fmt.Sprintf("Vendor credit %s: enter a refund more than 0.", number)
}

func wantRefundAccountInactive(account string) string {
	return account + " is inactive. Choose an active account."
}

// refundEnv is the apply book (2000 Accounts Payable, 1000 Business Checking,
// 1010 Business Savings, 2100 Company Card, 6100 Rent, Summit IT Services,
// Office Supply World and an active Pacific Power, with the bill, vendor
// credit, bill payment and credit application guards) with the vendor refund
// guards bound and 1200 Undeposited funds in the chart.
type refundEnv struct {
	*billPayEnv
	undeposited *core.Record
}

func newRefundEnv(t *testing.T) *refundEnv {
	t.Helper()
	bp := newApplyBook(t)
	registerVendorRefundGuards(bp.app)
	return &refundEnv{
		billPayEnv:  bp,
		undeposited: mkNumberedAccount(t, bp.app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
	}
}

// newRefund saves a draft refund through the app, so every guard runs, with
// the fields given over a valid default (Pacific Power, refundDay, 150.00 to
// 1000 Business Checking), and returns what the guards said.
func (re *refundEnv) newRefund(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"vendor": re.pacificPower.Id, "status": statusDraft, "date": refundDay,
		"refunded_to": re.checking1000.Id, "amount": 15000,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(re.app, refundsCol, all)
}

func (re *refundEnv) mkRefund(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := re.newRefund(fields)
	if err != nil {
		t.Fatalf("save a draft vendor refund: %v", err)
	}
	return r
}

// newRefundLine saves one line of refund on credit at position through the app.
func newRefundLine(app core.App, refund, credit *core.Record, position int, amount int64) (*core.Record, error) {
	return saveNew(app, refundLinesCol, map[string]any{
		"refund": refund.Id, "vendor_credit": credit.Id, "amount": amount, "position": position,
	})
}

func mkRefundLine(t testing.TB, app core.App, refund, credit *core.Record, position int, amount int64) *core.Record {
	t.Helper()
	r, err := newRefundLine(app, refund, credit, position, amount)
	if err != nil {
		t.Fatalf("save refund line %d: %v", position+1, err)
	}
	return r
}

// postRefundAs posts a draft refund as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postRefundAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById(refundsCol, id)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostRefund(t testing.TB, app core.App, id, actor string) *core.Record {
	t.Helper()
	if err := postRefundAs(app, id, actor); err != nil {
		t.Fatalf("post vendor refund %s: %v", id, err)
	}
	return reload(t, app, refundsCol, id)
}

func voidRefundAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById(refundsCol, id)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

// refund saves a draft refund of vendor with one line per credit amount and
// posts it.
func (re *refundEnv) refund(t testing.TB, fields map[string]any, lines ...refundLine) *core.Record {
	t.Helper()
	var amount int64
	for _, l := range lines {
		amount += l.amount
	}
	all := map[string]any{"amount": amount}
	for k, v := range fields {
		all[k] = v
	}
	r := re.mkRefund(t, all)
	for i, l := range lines {
		mkRefundLine(t, re.app, r, l.credit, i, l.amount)
	}
	return mustPostRefund(t, re.app, r.Id, re.users.bookkeeper.Id)
}

type refundLine struct {
	credit *core.Record
	amount int64
}

// setRefundStatus writes status straight to the table, past every hook, so a
// guard test holds a posted refund without posting it.
func setRefundStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_vendor_refunds SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set vendor refund %s %s: %v", id, status, err)
	}
}

func requireRefundCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(refundsCol); err != nil || n != want {
		t.Errorf("%d vendor refunds stored (err %v), want %d", n, err, want)
	}
}

func requireRefundLineCount(t testing.TB, app core.App, refund *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords(refundLinesCol, dbx.HashExp{"refund": refund.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the vendor refund, want %d", n, want)
	}
}

func nextRefundNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", refundSequenceID).GetInt("next_number")
}

func TestVendorRefund_DraftSaves(t *testing.T) {
	re := newRefundEnv(t)
	r := re.mkRefund(t, map[string]any{"payment_method": "check", "reference_no": "20417", "memo": "Deposit returned"})
	stored := reload(t, re.app, refundsCol, r.Id)
	if got, want := [5]any{stored.GetString("vendor"), stored.GetString("status"), stored.GetInt("amount"), stored.GetString("refunded_to"), stored.GetString("number")},
		[5]any{re.pacificPower.Id, statusDraft, 15000, re.checking1000.Id, ""}; got != want {
		t.Errorf("stored vendor/status/amount/refunded_to/number = %v, want %v", got, want)
	}
}

func TestVendorRefund_RequiresAKnownVendor(t *testing.T) {
	re := newRefundEnv(t)
	_, err := re.newRefund(map[string]any{"vendor": ""})
	requireRefusedOnField(t, err, "vendor")
	_, err = re.newRefund(map[string]any{"vendor": "zzzzzzzzzzzzzzz"})
	requireRefusedOnField(t, err, "vendor")
	requireRefundCount(t, re.app, 0)
}

func TestVendorRefund_RefusesADateThatIsNotARealDay(t *testing.T) {
	re := newRefundEnv(t)
	for _, day := range []string{"2026-13-40", "2026-02-30"} {
		_, err := re.newRefund(map[string]any{"date": day})
		requireRefusedOnField(t, err, "date")
	}
	requireRefundCount(t, re.app, 0)
}

func TestVendorRefund_RefusesALongReferenceAndAnUnknownMethod(t *testing.T) {
	re := newRefundEnv(t)
	_, err := re.newRefund(map[string]any{"reference_no": strings.Repeat("x", 41)})
	requireRefusedOnField(t, err, "reference_no")
	_, err = re.newRefund(map[string]any{"payment_method": "cheque"})
	requireRefusedOnField(t, err, "payment_method")
	requireRefundCount(t, re.app, 0)

	r := re.mkRefund(t, map[string]any{"reference_no": strings.Repeat("x", 40), "payment_method": "check"})
	stored := reload(t, re.app, refundsCol, r.Id)
	if stored.GetString("payment_method") != "check" || len(stored.GetString("reference_no")) != 40 {
		t.Errorf("stored payment_method %q reference_no %q, want check and 40 characters",
			stored.GetString("payment_method"), stored.GetString("reference_no"))
	}
}

// Refunded to is an active bank, credit card or Undeposited funds account (Q3).
func TestVendorRefund_RefundedToIsAnActiveRefundAccount(t *testing.T) {
	re := newRefundEnv(t)
	_, err := re.newRefund(map[string]any{"refunded_to": re.rent.Id})
	requireFieldRefusal(t, err, "refunded_to", wantRefundAccountType)

	oldBank := mkNumberedAccount(t, re.app, "Old Checking", "1020", "bank", "checking")
	makeAccountInactive(t, re.app, oldBank)
	_, err = re.newRefund(map[string]any{"refunded_to": oldBank.Id})
	requireFieldRefusal(t, err, "refunded_to", wantRefundAccountInactive("1020 Old Checking"))
	requireRefundCount(t, re.app, 0)

	for name, account := range map[string]*core.Record{
		"bank": re.checking1000, "credit_card": re.card2100, "undeposited_funds": re.undeposited,
	} {
		r, err := re.newRefund(map[string]any{"refunded_to": account.Id})
		if err != nil {
			t.Errorf("a refund to the %s account %s was refused: %v", name, account.GetString("name"), err)
			continue
		}
		if got := reload(t, re.app, refundsCol, r.Id).GetString("refunded_to"); got != account.Id {
			t.Errorf("refunded_to = %q, want %s", got, account.GetString("name"))
		}
	}
}

func TestVendorRefund_RefusesAnAmountOfZeroOrTooLarge(t *testing.T) {
	re := newRefundEnv(t)
	_, err := re.newRefund(map[string]any{"amount": 0})
	requireRefusedOnField(t, err, "amount")
	_, err = re.newRefund(map[string]any{"amount": maxStoredAmount + 1})
	requireRefusedOnField(t, err, "amount")
	requireRefundCount(t, re.app, 0)

	r := re.mkRefund(t, map[string]any{"amount": maxStoredAmount})
	if got := reload(t, re.app, refundsCol, r.Id).GetInt("amount"); got != maxStoredAmount {
		t.Errorf("stored amount %d, want maxStoredAmount", got)
	}
}

// A line names a posted vendor credit of the refund's vendor: a draft credit,
// a void credit and another vendor's credit are refused under the line.
func TestVendorRefundLine_RefusesACreditThatIsNotOpen(t *testing.T) {
	re := newRefundEnv(t)
	r := re.mkRefund(t, nil)

	draft := mkVendorCreditOn(t, re.app, re.pacificPower, map[string]any{"date": vendorCreditDay})
	mkVendorCreditLine(t, re.app, draft, 0, accountLine(re.rent, 5000))
	_, err := newRefundLine(re.app, r, draft, 0, 5000)
	apiErr := apiErrorOf(t, err)
	if !strings.HasPrefix(apiErr.Message, "Vendor credit ") || !strings.HasSuffix(apiErr.Message, " is not open. Clear it to continue.") {
		t.Errorf("draft credit refusal = %q, want \"Vendor credit <n> is not open. Clear it to continue.\"", apiErr.Message)
	}
	if _, ok := apiErr.Data["lines.0"]; !ok {
		t.Errorf("draft credit refusal data %v names no lines.0", apiErr.Data)
	}

	others := re.postedCredit(t, re.officeSupply, vendorCreditDay, billAmount{re.rent, 5000})
	_, err = newRefundLine(re.app, r, others, 1, 5000)
	requireFieldRefusal(t, err, "lines.1", wantRefundNotOpen(others.GetString("number")))

	voided := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 5000})
	if err := voidVendorCreditAs(re.app, voided.Id, re.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the credit: %v", err)
	}
	_, err = newRefundLine(re.app, r, voided, 2, 5000)
	requireFieldRefusal(t, err, "lines.2", wantRefundNotOpen(voided.GetString("number")))
	requireRefundLineCount(t, re.app, r, 0)
}

func TestVendorRefundLine_RefusesTheSameCreditTwiceAndAZeroAmount(t *testing.T) {
	re := newRefundEnv(t)
	r := re.mkRefund(t, nil)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})
	mkRefundLine(t, re.app, r, credit, 0, 10000)

	_, err := newRefundLine(re.app, r, credit, 1, 5000)
	requireFieldRefusal(t, err, "lines.1", wantRefundCreditTwice(credit.GetString("number")))
	_, err = newRefundLine(re.app, r, second, 1, 0)
	requireFieldRefusal(t, err, "lines.1", wantRefundLineAboveZero(second.GetString("number")))
	requireRefundLineCount(t, re.app, r, 1)

	// The same credit on another refund is not a second line.
	other := re.mkRefund(t, nil)
	mkRefundLine(t, re.app, other, credit, 0, 5000)
}

func TestVendorRefundLine_RefusesThe501st(t *testing.T) {
	env := newLedgerEnv(t)
	app := env.app
	vendor := mkVendor(t, app, "Cascade Fuel & Fleet")
	bank := mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking")
	// 501 posted credits and 499 lines written before the refund guards are
	// bound, so the test does not post 501 credits; the guard counts what is
	// stored.
	r := saveRecord(t, app, refundsCol, map[string]any{
		"vendor": vendor.Id, "status": statusDraft, "date": refundDay, "refunded_to": bank.Id, "amount": 50100, "currency": "USD",
	})
	credits := make([]*core.Record, 501)
	for i := range credits {
		credits[i] = saveRecord(t, app, "books_vendor_credits", map[string]any{
			"vendor": vendor.Id, "status": statusPosted, "date": vendorCreditDay, "number": fmt.Sprint(2001 + i),
			"sequence": 2001 + i, "total": 100, "balance": 100, "currency": "USD",
		})
	}
	for i := 0; i < 499; i++ {
		saveRecord(t, app, refundLinesCol, map[string]any{
			"refund": r.Id, "vendor_credit": credits[i].Id, "amount": 100, "position": i,
		})
	}
	registerVendorRefundGuards(app)

	mkRefundLine(t, app, r, credits[499], 499, 100)
	_, err := newRefundLine(app, r, credits[500], 500, 100)
	requireRefusalText(t, err, wantRefundTooManyCredits)
	requireRefundLineCount(t, app, r, 500)
}

// The create rule pins the server fields for REST, and a reader cannot create.
func TestVendorRefund_ServerFieldsAndAReaderAreRefusedOnCreate(t *testing.T) {
	re := newRefundEnv(t)
	client := re.rest(t)
	body := func(extra string) string {
		return fmt.Sprintf(`{"vendor":%q,"status":"draft","date":%q,"refunded_to":%q,"amount":15000%s}`,
			re.pacificPower.Id, refundDay, re.checking1000.Id, extra)
	}
	url := "/api/collections/" + refundsCol + "/records"

	if status, out := client.send(t, re.users.bookkeeper, http.MethodPost, url, body("")); status != http.StatusOK {
		t.Fatalf("a bookkeeper's draft with no server field answered %d; body: %s", status, out)
	}
	requireRefundCount(t, re.app, 1)

	for name, extra := range map[string]string{
		"number":    `,"number":"1001"`,
		"sequence":  `,"sequence":1001`,
		"entry":     fmt.Sprintf(`,"entry":%q`, re.sale(t, refundDay, 100).Id),
		"posted_by": fmt.Sprintf(`,"posted_by":%q`, re.users.admin.Id),
	} {
		status, out := client.send(t, re.users.bookkeeper, http.MethodPost, url, body(extra))
		if status != http.StatusBadRequest {
			t.Errorf("a create that writes %s answered %d, want 400; body: %s", name, status, out)
		}
	}
	requireRefundCount(t, re.app, 1)

	status, out := client.send(t, re.users.readOnly, http.MethodPost, url, body(""))
	restAnswer{status: status, body: out}.requireRefused(t, "a reader's create")
	requireRefundCount(t, re.app, 1)
}

func TestVendorRefundLine_RefusedOnAPostedRefund(t *testing.T) {
	re := newRefundEnv(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})
	second := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 12500})
	r := re.mkRefund(t, map[string]any{"amount": 10000})
	line := mkRefundLine(t, re.app, r, credit, 0, 10000)
	setRefundStatus(t, re.app, r.Id, statusPosted)

	_, err := newRefundLine(re.app, r, second, 1, 5000)
	requireRefusalText(t, err, wantRefundLinesFixed)
	err = setFields(t, re.app, refundLinesCol, line.Id, map[string]any{"amount": 20000})
	requireRefusalText(t, err, wantRefundLinesFixed)
	err = re.app.Delete(reload(t, re.app, refundLinesCol, line.Id))
	requireRefusalText(t, err, wantRefundLinesFixed)

	requireRefundLineCount(t, re.app, r, 1)
	if got := reload(t, re.app, refundLinesCol, line.Id).GetInt("amount"); got != 10000 {
		t.Errorf("line amount = %d after the refusal, want 10000", got)
	}
}

// A posted refund changes only to void.
func TestVendorRefund_PostedIsNotChanged(t *testing.T) {
	re := newRefundEnv(t)
	r := re.mkRefund(t, map[string]any{"memo": "First check"})
	setRefundStatus(t, re.app, r.Id, statusPosted)

	err := setFields(t, re.app, refundsCol, r.Id, map[string]any{"memo": "Changed"})
	requireRefusalText(t, err, wantRefundPostedFixed)
	err = setFields(t, re.app, refundsCol, r.Id, map[string]any{"status": statusDraft})
	requireRefusalText(t, err, wantRefundPostedFixed)
	stored := reload(t, re.app, refundsCol, r.Id)
	if stored.GetString("memo") != "First check" || stored.GetString("status") != statusPosted {
		t.Errorf("memo %q status %q after the refusals, want First check and posted", stored.GetString("memo"), stored.GetString("status"))
	}
}

// The delete rule lets a writer delete a draft only; its lines go with it.
func TestVendorRefund_DeleteOnlyDraft(t *testing.T) {
	re := newRefundEnv(t)
	client := re.rest(t)
	credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 30000})

	posted := re.mkRefund(t, map[string]any{"amount": 10000})
	mkRefundLine(t, re.app, posted, credit, 0, 10000)
	setRefundStatus(t, re.app, posted.Id, statusPosted)
	status, out := client.send(t, re.users.bookkeeper, http.MethodDelete, "/api/collections/"+refundsCol+"/records/"+posted.Id, "")
	restAnswer{status: status, body: out}.requireRefused(t, "the delete of a posted refund")
	if _, err := re.app.FindRecordById(refundsCol, posted.Id); err != nil {
		t.Fatalf("the posted refund is gone: %v", err)
	}
	requireRefundLineCount(t, re.app, posted, 1)

	draft := re.mkRefund(t, map[string]any{"amount": 10000})
	mkRefundLine(t, re.app, draft, credit, 0, 10000)
	status, out = client.send(t, re.users.bookkeeper, http.MethodDelete, "/api/collections/"+refundsCol+"/records/"+draft.Id, "")
	if status != http.StatusNoContent {
		t.Fatalf("the delete of a draft refund answered %d; body: %s", status, out)
	}
	if _, err := re.app.FindRecordById(refundsCol, draft.Id); err == nil {
		t.Error("the draft refund is still there")
	}
	requireRefundLineCount(t, re.app, draft, 0)
}

// A person's REST create of a vendor refund entry is refused with the refund's
// text, and nothing is stored.
func TestCreate_VendorRefundEntryOverRESTIsRefused(t *testing.T) {
	re := newRefundEnv(t)
	status, body := re.rest(t).send(t, re.users.bookkeeper, http.MethodPost,
		"/api/collections/books_journal_entries/records",
		`{"date":"2026-11-14","doc_type":"vendor_refund","status":"draft","origin":"manual"}`)
	if status != http.StatusBadRequest || !strings.Contains(body, wantRefundEntryFromPost) {
		t.Errorf("a vendor refund entry create = %d %s, want 400 with %q", status, body, wantRefundEntryFromPost)
	}
	if n, _ := re.app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "vendor_refund"}); n != 0 {
		t.Errorf("%d vendor refund entries stored, want 0", n)
	}
}

// isRefundAccount is the Refunded to rule of Q3: a bank or credit card
// account, or an Undeposited funds account.
func TestIsRefundAccount(t *testing.T) {
	re := newRefundEnv(t)
	for _, c := range []struct {
		account *core.Record
		want    bool
	}{
		{re.checking1000, true}, {re.savings1010, true}, {re.card2100, true}, {re.undeposited, true},
		{re.rent, false}, {re.payable, false}, {re.receivable1100, false}, {re.revenue, false},
	} {
		if got := isRefundAccount(c.account); got != c.want {
			t.Errorf("isRefundAccount(%s, %s/%s) = %v, want %v", c.account.GetString("name"),
				c.account.GetString("type"), c.account.GetString("detail_type"), got, c.want)
		}
	}
}
