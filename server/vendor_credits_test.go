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

// The vendor credit's guards (vendor credit spec §3.1, §4): the vendor credit
// is one more kind of the shared document layer, the mirror of a bill as the
// credit memo is the mirror of an invoice: the vendor required, the bill's two
// line tables, no tax, no terms, no due date, no address, and a balance only
// the server writes.

// The refusal texts of the vendor credit guards, as the client gets them
// (PocketBase adds a final period to a text that has none). Written out here,
// not read from the consts, so a change of wording fails this file too.
const (
	wantVendorCreditTotalNegative  = "A vendor credit total cannot be below zero. Use a bill."
	wantVendorCreditZeroTotal      = "A vendor credit total must be more than zero to post."
	wantVendorCreditTotalTooLarge  = "The vendor credit total is more than Books can store."
	wantVendorCreditTooManyLines   = "A vendor credit holds at most 250 lines."
	wantVendorCreditNotDraft       = "A posted or void vendor credit cannot be changed."
	wantVendorCreditDeleteDraft    = "Only a draft vendor credit can be deleted."
	wantVendorCreditLineStays      = "A line stays on its vendor credit."
	wantVendorCreditLineNotDraft   = "Only the lines of a draft vendor credit can change."
	wantVendorCreditUnknownKind    = "Line %d: a vendor credit line is an account line or a product line."
	wantVendorCreditPostedFromForm = "A draft vendor credit is posted from the vendor credit form."
	wantAccountRequired            = "Account line 1: Account is required."

	vendorCreditDay        = "2026-11-12"
	vendorCreditSequenceID = "booksseqvcredit"
)

func wantDuplicateCreditNo(vendor, ref, other string) string {
	return fmt.Sprintf("%s already has credit no. %s (%s).", vendor, ref, other)
}

// vendorCreditEnv is the bill env (the e2e chart's 1500, 6200, 6210 and the
// inactive 6900; Summit IT Services, Office Supply World, Pacific Power; the
// purchased products) with the ledger env's Rent numbered 6100, and Pacific
// Power active again: the fixture's credits are Pacific Power's.
type vendorCreditEnv struct {
	*billEnv
}

// newVendorCreditEnv binds the vendor credit guards and the generated
// books:vendor_credit forms host before it builds the book.
func newVendorCreditEnv(t *testing.T) *vendorCreditEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, vendorCreditKind)
	bindVendorCreditHost(t, env.app)
	return vendorCreditEnvOn(t, env)
}

// newBillAndVendorCreditEnv binds the bill and the vendor credit guards and
// both forms hosts on one book (core keeps one set of bound hosts per app, so
// both are bound in one call).
func newBillAndVendorCreditEnv(t *testing.T) *vendorCreditEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, vendorCreditKind)
	bindHostsByKey(t, env.app, billKind.HostKey, vendorCreditHostKey)
	return vendorCreditEnvOn(t, env)
}

func vendorCreditEnvOn(t *testing.T, env *ledgerEnv) *vendorCreditEnv {
	t.Helper()
	be := billEnvOn(t, env)
	if err := setFields(t, env.app, "books_accounts", env.rent.Id, map[string]any{"number": "6100"}); err != nil {
		t.Fatalf("number Rent 6100: %v", err)
	}
	if err := setFields(t, env.app, "books_vendors", be.pacificPower.Id, map[string]any{"inactive": false}); err != nil {
		t.Fatalf("make Pacific Power active: %v", err)
	}
	return &vendorCreditEnv{billEnv: be}
}

// newVendorCreditOn saves a draft vendor credit through the app, so every
// guard runs, with the fields given over a valid default (the vendor, dated
// vendorCreditDay), and returns what the guards said. A nil vendor leaves the
// field out.
func newVendorCreditOn(app core.App, vendor *core.Record, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"status": "draft", "date": vendorCreditDay}
	if vendor != nil {
		all["vendor"] = vendor.Id
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_vendor_credits", all)
}

func mkVendorCreditOn(t testing.TB, app core.App, vendor *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newVendorCreditOn(app, vendor, fields)
	if err != nil {
		t.Fatalf("save a draft vendor credit for %s: %v", vendor.GetString("display_name"), err)
	}
	return r
}

func (ve *vendorCreditEnv) newVendorCredit(vendor *core.Record, fields map[string]any) (*core.Record, error) {
	return newVendorCreditOn(ve.app, vendor, fields)
}

func (ve *vendorCreditEnv) mkVendorCredit(t testing.TB, vendor *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	return mkVendorCreditOn(t, ve.app, vendor, fields)
}

// newVendorCreditLine saves one line of the credit at position through the
// app, so every guard and the restatement run, and returns what they said.
func newVendorCreditLine(app core.App, vc *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"vendor_credit": vc.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_vendor_credit_lines", all)
}

func mkVendorCreditLine(t testing.TB, app core.App, vc *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newVendorCreditLine(app, vc, position, fields)
	if err != nil {
		t.Fatalf("save vendor credit line %d: %v", position+1, err)
	}
	return r
}

// requireVendorCreditTotal checks the stored subtotal and total: a vendor
// credit has no tax, so they are one figure.
func requireVendorCreditTotal(t testing.TB, app core.App, id string, total int) {
	t.Helper()
	r := reload(t, app, "books_vendor_credits", id)
	if got := [2]int{r.GetInt("subtotal"), r.GetInt("total")}; got != [2]int{total, total} {
		t.Errorf("vendor credit subtotal/total = %v, want %v", got, [2]int{total, total})
	}
}

func requireVendorCreditBalance(t testing.TB, app core.App, id string, want int) {
	t.Helper()
	if got := reload(t, app, "books_vendor_credits", id).GetInt("balance"); got != want {
		t.Errorf("vendor credit balance = %d, want %d", got, want)
	}
}

func requireVendorCreditLineCount(t testing.TB, app core.App, vc *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_vendor_credit_lines", dbx.HashExp{"vendor_credit": vc.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the vendor credit, want %d", n, want)
	}
}

func requireVendorCreditCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_vendor_credits"); err != nil || n != want {
		t.Errorf("%d vendor credits stored (err %v), want %d", n, err, want)
	}
}

// setVendorCreditStatus writes status straight to the table, past every hook,
// so the line and delete guards can be held to a posted credit without
// posting it.
func setVendorCreditStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_vendor_credits SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set vendor credit %s %s: %v", id, status, err)
	}
}

// postVendorCreditAs posts a draft vendor credit as actor, as the client's
// PATCH {"status":"posted"} does once the request hook has stamped the poster.
func postVendorCreditAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById("books_vendor_credits", id)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostVendorCredit(t testing.TB, app core.App, id, actor string) *core.Record {
	t.Helper()
	if err := postVendorCreditAs(app, id, actor); err != nil {
		t.Fatalf("post vendor credit %s: %v", id, err)
	}
	return reload(t, app, "books_vendor_credits", id)
}

// voidVendorCreditAs voids a posted vendor credit as actor.
func voidVendorCreditAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById("books_vendor_credits", id)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func TestVendorCredit_DraftSaves(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"memo": "October overbilling"})
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.rent, 5000))

	got := reload(t, ve.app, "books_vendor_credits", vc.Id)
	if got.GetString("status") != statusDraft || got.GetString("vendor") != ve.pacificPower.Id ||
		got.GetString("number") != "" || got.GetInt("balance") != 0 || got.GetString("currency") != "USD" {
		t.Errorf("vendor credit status %q vendor %q number %q balance %d currency %q, want a USD draft of Pacific Power with no number and balance 0",
			got.GetString("status"), got.GetString("vendor"), got.GetString("number"), got.GetInt("balance"), got.GetString("currency"))
	}
	requireVendorCreditTotal(t, ve.app, vc.Id, 5000)
}

func TestVendorCredit_RequiresAVendor(t *testing.T) {
	ve := newVendorCreditEnv(t)
	_, err := ve.newVendorCredit(nil, nil)
	requireSchemaRefusal(t, err, "vendor")
	requireVendorCreditCount(t, ve.app, 0)
}

func TestVendorCredit_RefusesABadDate(t *testing.T) {
	ve := newVendorCreditEnv(t)
	_, err := ve.newVendorCredit(ve.pacificPower, map[string]any{"date": "2026-13-40"})
	requireFieldRefusal(t, err, "date", wantDocumentDay)
	requireVendorCreditCount(t, ve.app, 0)
}

func TestVendorCredit_SchemaRefusesALongCreditNo(t *testing.T) {
	ve := newVendorCreditEnv(t)
	_, err := ve.newVendorCredit(ve.pacificPower, map[string]any{"ref_no": strings.Repeat("7", 41)})
	requireSchemaRefusal(t, err, "ref_no")
	requireVendorCreditCount(t, ve.app, 0)

	vc := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": strings.Repeat("7", 40)})
	if got := len(reload(t, ve.app, "books_vendor_credits", vc.Id).GetString("ref_no")); got != 40 {
		t.Errorf("ref_no has %d characters, want 40", got)
	}
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestVendorCredit_ServerFieldsRefused(t *testing.T) {
	body := func(ve *vendorCreditEnv, extra string) string {
		return fmt.Sprintf(`{"vendor":%q,"status":"draft","date":%q%s}`, ve.pacificPower.Id, vendorCreditDay, extra)
	}

	t.Run("a draft with no server field is created", func(t *testing.T) {
		ve := newVendorCreditEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_vendor_credits/records",
			token: tokenFor(t, ve.users.bookkeeper), body: body(ve, ""), want: http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) { requireVendorCreditCount(t, app, 1) },
		}.run(t, ve.app)
	})

	for name, extra := range map[string]func(t testing.TB, ve *vendorCreditEnv) string{
		"number":   func(testing.TB, *vendorCreditEnv) string { return `,"number":"1001"` },
		"sequence": func(testing.TB, *vendorCreditEnv) string { return `,"sequence":1001` },
		"total":    func(testing.TB, *vendorCreditEnv) string { return `,"total":100` },
		"subtotal": func(testing.TB, *vendorCreditEnv) string { return `,"subtotal":100` },
		"balance":  func(testing.TB, *vendorCreditEnv) string { return `,"balance":100` },
		"currency": func(testing.TB, *vendorCreditEnv) string { return `,"currency":"USD"` },
		// A real entry and real users, so only the rule can refuse the relation.
		"entry": func(t testing.TB, ve *vendorCreditEnv) string {
			return fmt.Sprintf(`,"entry":%q`, ve.sale(t, vendorCreditDay, 100).Id)
		},
		"posted_by": func(t testing.TB, ve *vendorCreditEnv) string {
			return fmt.Sprintf(`,"posted_by":%q`, ve.users.admin.Id)
		},
		"voided_by": func(t testing.TB, ve *vendorCreditEnv) string {
			return fmt.Sprintf(`,"voided_by":%q`, ve.users.admin.Id)
		},
	} {
		t.Run(name, func(t *testing.T) {
			ve := newVendorCreditEnv(t)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_vendor_credits/records",
				token: tokenFor(t, ve.users.bookkeeper), body: body(ve, extra(t, ve)), want: http.StatusBadRequest,
				after: func(t testing.TB, app *tests.TestApp) { requireVendorCreditCount(t, app, 0) },
			}.run(t, ve.app)
		})
	}
}

func TestVendorCredit_ReaderCannotCreate(t *testing.T) {
	ve := newVendorCreditEnv(t)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_vendor_credits/records",
		token: tokenFor(t, ve.users.readOnly),
		body:  fmt.Sprintf(`{"vendor":%q,"status":"draft","date":%q}`, ve.pacificPower.Id, vendorCreditDay),
		want:  http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) { requireVendorCreditCount(t, app, 0) },
	}.run(t, ve.app)
}

func TestVendorCredit_RefusesNegativeTotal(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.designTools, 1000))

	_, err := newVendorCreditLine(ve.app, vc, 1, accountLine(ve.designTools, -1001))
	requireRefusalText(t, err, wantVendorCreditTotalNegative)
	requireVendorCreditLineCount(t, ve.app, vc, 1)
	requireVendorCreditTotal(t, ve.app, vc.Id, 1000)
}

// An account line of −$10.00 saves while the credit's total stays at or above
// zero.
func TestVendorCreditLine_NegativeAccountLineSavesWhileTheTotalStaysAtOrAboveZero(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.designTools, 6418))
	credit := mkVendorCreditLine(t, ve.app, vc, 1, accountLine(ve.designTools, -1000))

	if got := reload(t, ve.app, "books_vendor_credit_lines", credit.Id).GetInt("amount"); got != -1000 {
		t.Errorf("line 2 amount = %d, want -1000", got)
	}
	requireVendorCreditTotal(t, ve.app, vc.Id, 5418)
}

func TestVendorCredit_RefusesTooLargeTotal(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	for i := 0; i < 9; i++ {
		mkVendorCreditLine(t, ve.app, vc, i, accountLine(ve.software, maxAmount))
	}
	requireVendorCreditTotal(t, ve.app, vc.Id, 9_000_000_000_000_000)

	// A tenth line takes the total past maxStoredAmount (2^53-1).
	_, err := newVendorCreditLine(ve.app, vc, 9, accountLine(ve.software, maxAmount))
	requireRefusalText(t, err, wantVendorCreditTotalTooLarge)
	requireVendorCreditLineCount(t, ve.app, vc, 9)
}

// The bound counts the lines of both tables together.
func TestVendorCreditLine_RefusesTheLine251st(t *testing.T) {
	env := newLedgerEnv(t)
	ve := vendorCreditEnvOn(t, env)
	// 249 lines written before the vendor credit guards are bound, so the test
	// does not wait on 249 restatements; the guard counts what is stored.
	vc := saveRecord(t, env.app, "books_vendor_credits", map[string]any{
		"vendor": ve.officeSupply.Id, "status": "draft", "date": vendorCreditDay, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		fields := map[string]any{"vendor_credit": vc.Id, "position": i, "kind": "account", "account": ve.software.Id, "amount": 100}
		if i%2 == 1 {
			fields = map[string]any{"vendor_credit": vc.Id, "position": i, "kind": "item", "product": ve.accessPoint.Id, "quantity": 1, "rate": 100}
		}
		saveRecord(t, env.app, "books_vendor_credit_lines", fields)
	}
	registerSalesDocGuards(env.app, vendorCreditKind)
	bindVendorCreditHost(t, env.app)

	mkVendorCreditLine(t, env.app, vc, 249, accountLine(ve.software, 100))
	_, err := newVendorCreditLine(env.app, vc, 250, productLine(ve.accessPoint, 1, 100))
	requireRefusalText(t, err, wantVendorCreditTooManyLines)
	requireVendorCreditLineCount(t, env.app, vc, 250)
}

// Every save refuses an account line whose account is not an expense type,
// with the bill's text.
func TestVendorCreditLine_AccountMustBeAnExpense(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.pacificPower, nil)

	_, err := newVendorCreditLine(ve.app, vc, 0, accountLine(ve.equipment, 12500))
	requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 1, "Office Equipment"))
	requireVendorCreditLineCount(t, ve.app, vc, 0)

	line := mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.rent, 5000))
	err = setFields(t, ve.app, "books_vendor_credit_lines", line.Id, map[string]any{"account": ve.equipment.Id})
	requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 1, "Office Equipment"))
	if got := reload(t, ve.app, "books_vendor_credit_lines", line.Id).GetString("account"); got != ve.rent.Id {
		t.Errorf("account = %s after the refusal, want 6100 Rent", got)
	}
}

// Lesson 34: one case per required cell of each row kind of the host. A
// vendor credit's line is checked as a bill's: each case is saved on a bill
// and on a vendor credit of the same app, and the credit's outcome is the
// bill's (a refusal with the same text, or none); where the text is known it
// is checked too.
func TestVendorCreditLine_EachRequiredCellAsTheBill(t *testing.T) {
	ve := newBillAndVendorCreditEnv(t)
	cases := []struct {
		name string
		line map[string]any
		// refused says the bill refuses the line; want is the text when it is
		// pinned here, "" for the bill's text, whatever it is.
		refused bool
		want    string
	}{
		{"an account line with no account",
			map[string]any{"kind": "account", "amount": 12500}, true, wantAccountRequired},
		{"an account line with amount 0",
			accountLine(ve.software, 0), true, fmt.Sprintf(wantBillAmountNotZero, 1)},
		{"an account line with no amount",
			map[string]any{"kind": "account", "account": ve.software.Id}, true, fmt.Sprintf(wantBillAmountNotZero, 1)},
		{"an account line with a product",
			billLineWith(accountLine(ve.software, 12500), map[string]any{"product": ve.accessPoint.Id}), true, wantPurchaseAccountLineCells},
		{"a product line with an account",
			billLineWith(productLine(ve.accessPoint, 3, 12140), map[string]any{"account": ve.software.Id}), true, wantBillProductLineAccount},
		{"a product line with no product",
			map[string]any{"kind": "item", "quantity": 1, "rate": 12140}, true, ""},
		{"a product line with no quantity",
			map[string]any{"kind": "item", "product": ve.accessPoint.Id, "rate": 12140}, false, ""},
		{"a product line with no rate",
			map[string]any{"kind": "item", "product": ve.accessPoint.Id, "quantity": 1}, false, ""},
		{"a product line with a client-written amount",
			billLineWith(productLine(ve.accessPoint, 3, 12140), map[string]any{"amount": 500}), true, wantLineAmountByBooks},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bill := mkBill(t, ve.app, ve.officeSupply, nil)
			vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
			_, billErr := newBillLine(ve.app, bill, 0, tc.line)
			_, creditErr := newVendorCreditLine(ve.app, vc, 0, tc.line)
			if tc.refused && billErr == nil {
				t.Fatalf("the bill saved %s", tc.name)
			}
			if (billErr == nil) != (creditErr == nil) {
				t.Fatalf("bill refusal %v, vendor credit refusal %v; want the same outcome", billErr, creditErr)
			}
			if creditErr == nil {
				return
			}
			if tc.want != "" {
				requireRefusalText(t, creditErr, tc.want)
			}
			if got, want := apiErrorOf(t, creditErr).Message, apiErrorOf(t, billErr).Message; got != want {
				t.Errorf("vendor credit refusal %q, want the bill's %q", got, want)
			}
			requireVendorCreditLineCount(t, ve.app, vc, 0)
		})
	}

	t.Run("each kind with its own cells is accepted", func(t *testing.T) {
		vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
		mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.designTools, 6418))
		line := mkVendorCreditLine(t, ve.app, vc, 1, productLine(ve.patchCable, 15, 310))
		if got := reload(t, ve.app, "books_vendor_credit_lines", line.Id).GetInt("amount"); got != 4650 {
			t.Errorf("product line amount = %d, want 15 x 310 = 4650", got)
		}
		requireVendorCreditTotal(t, ve.app, vc.Id, 11068)
	})
}

func TestVendorCreditLine_RefusesAKindThatIsNotAVendorCreditLine(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	_, err := newVendorCreditLine(ve.app, vc, 0, map[string]any{"kind": "percent", "product": ve.accessPoint.Id, "percent_ppm": -100000})
	requireRefusalText(t, err, fmt.Sprintf(wantVendorCreditUnknownKind, 1))
	requireVendorCreditLineCount(t, ve.app, vc, 0)
}

// Two vendor credits of one vendor cannot carry the same vendor's credit no.
// while the first is not void; the number is compared after trimming.
func TestVendorCredit_RefusesADuplicateCreditNo(t *testing.T) {
	ve := newVendorCreditEnv(t)
	first := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": "CM-8841"})
	mkVendorCreditLine(t, ve.app, first, 0, accountLine(ve.rent, 5000))

	if err := setFields(t, ve.app, "books_vendor_credits", first.Id, map[string]any{"memo": "October overbilling"}); err != nil {
		t.Fatalf("an edit of the credit that holds the number was refused: %v", err)
	}

	_, err := ve.newVendorCredit(ve.pacificPower, map[string]any{"ref_no": " CM-8841 "})
	requireFieldRefusal(t, err, "ref_no", wantDuplicateCreditNo("Pacific Power", "CM-8841", "a draft vendor credit"))
	requireVendorCreditCount(t, ve.app, 1)

	second := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": "CM-8842"})
	err = setFields(t, ve.app, "books_vendor_credits", second.Id, map[string]any{"ref_no": "CM-8841"})
	requireFieldRefusal(t, err, "ref_no", wantDuplicateCreditNo("Pacific Power", "CM-8841", "a draft vendor credit"))

	posted := mustPostVendorCredit(t, ve.app, first.Id, ve.users.bookkeeper.Id)
	_, err = ve.newVendorCredit(ve.pacificPower, map[string]any{"ref_no": "CM-8841"})
	requireFieldRefusal(t, err, "ref_no",
		wantDuplicateCreditNo("Pacific Power", "CM-8841", "Vendor credit "+posted.GetString("number")))
}

func TestVendorCredit_CreditNoDoesNotClash(t *testing.T) {
	// Each case has its own book: a credit one case saves would clash in the next.
	firstCredit := func(t *testing.T) (*vendorCreditEnv, *core.Record) {
		t.Helper()
		ve := newBillAndVendorCreditEnv(t)
		first := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": "CM-8841"})
		mkVendorCreditLine(t, ve.app, first, 0, accountLine(ve.rent, 5000))
		return ve, first
	}

	t.Run("for another vendor", func(t *testing.T) {
		ve, _ := firstCredit(t)
		ve.mkVendorCredit(t, ve.officeSupply, map[string]any{"ref_no": "CM-8841"})
	})

	t.Run("for an empty number", func(t *testing.T) {
		ve, _ := firstCredit(t)
		ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": ""})
		ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": ""})
	})

	t.Run("when the first is void", func(t *testing.T) {
		ve, first := firstCredit(t)
		mustPostVendorCredit(t, ve.app, first.Id, ve.users.bookkeeper.Id)
		if err := voidVendorCreditAs(ve.app, first.Id, ve.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the first vendor credit: %v", err)
		}
		ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": "CM-8841"})
	})

	t.Run("for a correction of the first", func(t *testing.T) {
		ve, first := firstCredit(t)
		mustPostVendorCredit(t, ve.app, first.Id, ve.users.bookkeeper.Id)
		ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"ref_no": "CM-8841", "replaces": first.Id})
	})

	t.Run("with a bill of the same vendor and the same number", func(t *testing.T) {
		ve, _ := firstCredit(t)
		// A bill after the credit, and a credit after a bill.
		mkBill(t, ve.app, ve.pacificPower, map[string]any{"ref_no": "CM-8841"})
		mkBill(t, ve.app, ve.officeSupply, map[string]any{"ref_no": "88412"})
		ve.mkVendorCredit(t, ve.officeSupply, map[string]any{"ref_no": "88412"})
	})
}

func TestVendorCredit_PostedCannotChange(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.pacificPower, map[string]any{"memo": "October overbilling"})
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.rent, 5000))
	setVendorCreditStatus(t, ve.app, vc.Id, statusPosted)

	err := setFields(t, ve.app, "books_vendor_credits", vc.Id, map[string]any{"memo": "Changed"})
	requireRefusalText(t, err, wantVendorCreditNotDraft)
	if got := reload(t, ve.app, "books_vendor_credits", vc.Id).GetString("memo"); got != "October overbilling" {
		t.Errorf("memo = %q after the refusal, want October overbilling", got)
	}
}

func TestVendorCredit_DeleteOnlyDraft(t *testing.T) {
	ve := newVendorCreditEnv(t)
	posted := ve.mkVendorCredit(t, ve.pacificPower, nil)
	mkVendorCreditLine(t, ve.app, posted, 0, accountLine(ve.rent, 5000))
	setVendorCreditStatus(t, ve.app, posted.Id, statusPosted)

	err := ve.app.Delete(reload(t, ve.app, "books_vendor_credits", posted.Id))
	requireRefusalText(t, err, wantVendorCreditDeleteDraft)
	if _, err := ve.app.FindRecordById("books_vendor_credits", posted.Id); err != nil {
		t.Fatalf("the posted vendor credit is gone: %v", err)
	}
	requireVendorCreditLineCount(t, ve.app, posted, 1)

	draft := ve.mkVendorCredit(t, ve.officeSupply, nil)
	mkVendorCreditLine(t, ve.app, draft, 0, accountLine(ve.designTools, 6418))
	mkVendorCreditLine(t, ve.app, draft, 1, productLine(ve.patchCable, 15, 310))
	if err := ve.app.Delete(reload(t, ve.app, "books_vendor_credits", draft.Id)); err != nil {
		t.Fatalf("delete a draft vendor credit: %v", err)
	}
	if _, err := ve.app.FindRecordById("books_vendor_credits", draft.Id); err == nil {
		t.Error("the deleted draft is still there")
	}
	requireVendorCreditLineCount(t, ve.app, draft, 0)
}

func TestVendorCreditLine_StaysOnItsVendorCredit(t *testing.T) {
	ve := newVendorCreditEnv(t)
	first := ve.mkVendorCredit(t, ve.officeSupply, nil)
	second := ve.mkVendorCredit(t, ve.officeSupply, nil)
	line := mkVendorCreditLine(t, ve.app, first, 0, accountLine(ve.designTools, 6418))

	err := setFields(t, ve.app, "books_vendor_credit_lines", line.Id, map[string]any{"vendor_credit": second.Id})
	requireRefusalText(t, err, wantVendorCreditLineStays)
	if got := reload(t, ve.app, "books_vendor_credit_lines", line.Id).GetString("vendor_credit"); got != first.Id {
		t.Errorf("line vendor_credit = %q after the refusal, want the first credit", got)
	}
	requireVendorCreditLineCount(t, ve.app, second, 0)
}

func TestVendorCreditLine_RefusedOnPostedVendorCredit(t *testing.T) {
	ve := newVendorCreditEnv(t)
	vc := ve.mkVendorCredit(t, ve.officeSupply, nil)
	line := mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.designTools, 6418))
	setVendorCreditStatus(t, ve.app, vc.Id, statusPosted)

	_, err := newVendorCreditLine(ve.app, vc, 1, accountLine(ve.designTools, 100))
	requireRefusalText(t, err, wantVendorCreditLineNotDraft)
	err = setFields(t, ve.app, "books_vendor_credit_lines", line.Id, map[string]any{"amount": 7000})
	requireRefusalText(t, err, wantVendorCreditLineNotDraft)
	requireVendorCreditLineCount(t, ve.app, vc, 1)
	requireVendorCreditTotal(t, ve.app, vc.Id, 6418)
}

// A posted or void vendor credit comes only from posting a draft; a create
// that asks for either is refused with the vendor credit's text, and nothing
// is stored. (An update of a draft to posted is how the form posts.)
func TestVendorCredit_CreateAsPostedIsRefused(t *testing.T) {
	ve := newVendorCreditEnv(t)
	for _, status := range []string{statusPosted, statusVoid} {
		_, err := ve.newVendorCredit(ve.pacificPower, map[string]any{"status": status})
		requireRefusalText(t, err, wantVendorCreditPostedFromForm)
	}
	requireVendorCreditCount(t, ve.app, 0)
}

// A vendor credit's entry is named "Vendor credit 1002" ("This vendor credit",
// "Draft vendor credit"), its doc type is one only posting the document
// writes, and its kind is the mirror of a bill: a Credit kind that debits its
// total (Accounts payable) and credits the lines.
func TestVendorCredit_EntryNounsDocTypeAndKind(t *testing.T) {
	if noun, this, draft := entryNouns("vendor_credit"); [3]string{noun, this, draft} != [3]string{"Vendor credit", "This vendor credit", "Draft vendor credit"} {
		t.Errorf("entryNouns(vendor_credit) = %q, %q, %q; want Vendor credit, This vendor credit, Draft vendor credit", noun, this, draft)
	}
	if docTypeVendorCredit != "vendor_credit" || !documentDocTypes[docTypeVendorCredit] {
		t.Errorf("docTypeVendorCredit %q in documentDocTypes %v, want vendor_credit and true", docTypeVendorCredit, documentDocTypes[docTypeVendorCredit])
	}
	if got := [3]string{vendorCreditsCollection, vendorCreditLinesCollection, vendorCreditApplicationsCollection}; got != [3]string{"books_vendor_credits", "books_vendor_credit_lines", "books_vendor_credit_applications"} {
		t.Errorf("collections %v, want books_vendor_credits, books_vendor_credit_lines, books_vendor_credit_applications", got)
	}
	if vendorCreditHostKey != "books:vendor_credit" || vendorCreditDraftName != "a draft vendor credit" {
		t.Errorf("vendorCreditHostKey %q vendorCreditDraftName %q, want books:vendor_credit and a draft vendor credit", vendorCreditHostKey, vendorCreditDraftName)
	}
	k := vendorCreditKind
	if k.DocType != docTypeVendorCredit || k.Lifecycle != lifecyclePosting || k.Collection != vendorCreditsCollection ||
		k.LinesCollection != vendorCreditLinesCollection || k.TaxLinesCollection != "" || k.ParentField != "vendor_credit" ||
		k.HostKey != vendorCreditHostKey || k.Party != partyVendor || k.PartyCollection != "books_vendors" || k.AddressField != "" {
		t.Errorf("vendorCreditKind = %+v, want books_vendor_credits / books_vendor_credit_lines on parent vendor_credit, host books:vendor_credit, party vendor, no tax lines, no address", k)
	}
	if !k.CustomerRequired || k.HasTax || !k.TracksBalance || !k.Credit {
		t.Errorf("vendorCreditKind CustomerRequired %v HasTax %v TracksBalance %v Credit %v; want a required vendor, no tax, a balance, a Credit kind",
			k.CustomerRequired, k.HasTax, k.TracksBalance, k.Credit)
	}
	if k.DebitAccount == nil || k.CreditAccount != nil || k.BeforePost == nil || k.Replace == nil || k.CheckHeader == nil {
		t.Errorf("vendorCreditKind DebitAccount set %v, CreditAccount set %v, BeforePost set %v, Replace set %v, CheckHeader set %v; want a debit side only, the purchase line check, the attachments move and the header check",
			k.DebitAccount != nil, k.CreditAccount != nil, k.BeforePost != nil, k.Replace != nil, k.CheckHeader != nil)
	}
	if fmt.Sprint(k.LineTables) != fmt.Sprint([]string{purchaseAccountLinesKey, purchaseItemLinesKey}) {
		t.Errorf("vendorCreditKind LineTables %v, want the purchase account and item tables", k.LineTables)
	}
	if k.Msgs.PartyInactive != msgVendorInactive {
		t.Errorf("vendorCreditKind PartyInactive %q, want the shared msgVendorInactive", k.Msgs.PartyInactive)
	}
}
