package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/reports"
)

// Posting a bill (spec §3.7): draft → posted writes a numbered journal entry
// with doc type bill: one debit per account (each account line's account,
// each product line's product expense account read at posting), summed per
// account in chart order, and one credit to Accounts payable for the total;
// every line names the vendor. These tests post and void through a Go save of
// the bill's status, the path the client's PATCH reaches after the request
// hook stamps the actor.

const wantBillZeroTotal = "A bill total must be more than zero to post."

func wantAccountInactive(n int, name string) string {
	return fmt.Sprintf("Account line %d: %s is inactive. Choose an active account.", n, name)
}

func wantProductNotPurchased(n int, name string) string {
	return fmt.Sprintf("Product line %d: %s is not purchased. Turn on “I purchase this” for it first.", n, name)
}

// billPostingEnv is a bill env with 2000 Accounts payable in the chart.
type billPostingEnv struct {
	*billEnv
	payable *core.Record
}

func newBillPostingEnv(t *testing.T) *billPostingEnv {
	t.Helper()
	be := newBillEnv(t)
	return &billPostingEnv{
		billEnv: be,
		payable: mkNumberedAccount(t, be.app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
	}
}

// officeSupplyBill saves the fixture's Office Supply World bill: account lines
// 6210 18745 and 6210 -3890; product lines Wireless access point 3 x 12140
// (expense 6200) and Cat6 patch cable, 10 ft 12 x 310 (expense 6210). Total
// 54995.
func (pe *billPostingEnv) officeSupplyBill(t testing.TB) *core.Record {
	t.Helper()
	bill := mkBill(t, pe.app, pe.officeSupply, map[string]any{"memo": "Q4 supplies and the back-office access points"})
	mkBillLine(t, pe.app, bill, 0, accountLine(pe.designTools, 18745))
	mkBillLine(t, pe.app, bill, 1, accountLine(pe.designTools, -3890))
	mkBillLine(t, pe.app, bill, 2, productLine(pe.accessPoint, 3, 12140))
	mkBillLine(t, pe.app, bill, 3, productLine(pe.patchCable, 12, 310))
	requireBillTotal(t, pe.app, bill.Id, 54995)
	return bill
}

func nextBillNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", "booksseqbill000").GetInt("next_number")
}

// requireBillNotPosted checks that a refused post wrote nothing: the bill is a
// draft with no number, entry or stamp, no entry names it, and the bill
// sequence did not move.
func requireBillNotPosted(t testing.TB, app core.App, billID string, nextNumber int) {
	t.Helper()
	bill := reload(t, app, "books_bills", billID)
	if bill.GetString("status") != statusDraft || bill.GetString("number") != "" || bill.GetString("entry") != "" ||
		bill.GetString("posted_at") != "" {
		t.Errorf("bill after a refused post: status %q number %q entry %q posted_at %q, want a draft with none",
			bill.GetString("status"), bill.GetString("number"), bill.GetString("entry"), bill.GetString("posted_at"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": billID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the bill (err %v), want 0", n, err)
	}
	if got := nextBillNumber(t, app); got != nextNumber {
		t.Errorf("bill sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

// splitPayable takes the one Accounts payable line out of lines.
func splitPayable(t testing.TB, lines []entryLine, payable string) (entryLine, []entryLine) {
	t.Helper()
	var found []entryLine
	var rest []entryLine
	for _, l := range lines {
		if l.account == payable {
			found = append(found, l)
			continue
		}
		rest = append(rest, l)
	}
	if len(found) != 1 {
		t.Fatalf("%d Accounts payable lines in %v, want 1", len(found), lines)
	}
	return found[0], rest
}

func TestBillPost_WritesTheEntry(t *testing.T) {
	pe := newBillPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	if got := nextBillNumber(t, pe.app); got != 1001 {
		t.Fatalf("a fresh book's bill sequence next_number = %d, want 1001", got)
	}
	bill := pe.officeSupplyBill(t)

	posted := mustPostBill(t, pe.app, bill.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("bill status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("bill posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if got := nextBillNumber(t, pe.app); got != 1002 {
		t.Errorf("bill sequence next_number = %d after the post, want 1002", got)
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted bill names no entry")
	}
	entry := reload(t, pe.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, "bill", "document", bill.Id, "1001", billDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if entry.GetString("memo") != "Q4 supplies and the back-office access points" || entry.GetString("posted_by") != actor {
		t.Errorf("entry memo %q posted_by %q, want the bill memo and the poster", entry.GetString("memo"), entry.GetString("posted_by"))
	}

	// 6200 takes the access points (36420); 6210 the two account lines and
	// the patch cables (18745 - 3890 + 3720 = 18575); Accounts payable the
	// total. Every line names the vendor and no customer.
	v := pe.officeSupply.Id
	got := entryLinesOf(t, pe.app, entryID)
	ap, debits := splitPayable(t, got, pe.payable.Id)
	if want := (entryLine{account: pe.payable.Id, credit: 54995, vendor: v}); ap != want {
		t.Errorf("Accounts payable line = %+v, want %+v", ap, want)
	}
	want := []entryLine{
		{account: pe.software.Id, debit: 36420, vendor: v},
		{account: pe.designTools.Id, debit: 18575, vendor: v},
	}
	if fmt.Sprint(debits) != fmt.Sprint(want) {
		t.Errorf("debit lines =\n%v\nwant (chart order)\n%v", debits, want)
	}
	if entry.GetInt("total") != 54995 {
		t.Errorf("entry total %d, want 54995", entry.GetInt("total"))
	}
	requireNoDrift(t, pe.app)
}

// An account whose lines sum below zero takes a credit line; Accounts payable
// is credited for the total.
func TestBillPost_CreditsAnAccountThatNetsBelowZero(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := mkBill(t, pe.app, pe.summit, nil)
	mkBillLine(t, pe.app, bill, 0, accountLine(pe.software, 50000))
	mkBillLine(t, pe.app, bill, 1, accountLine(pe.designTools, -10000))
	posted := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id)

	v := pe.summit.Id
	ap, rest := splitPayable(t, entryLinesOf(t, pe.app, posted.GetString("entry")), pe.payable.Id)
	if want := (entryLine{account: pe.payable.Id, credit: 40000, vendor: v}); ap != want {
		t.Errorf("Accounts payable line = %+v, want %+v", ap, want)
	}
	want := []entryLine{
		{account: pe.software.Id, debit: 50000, vendor: v},
		{account: pe.designTools.Id, credit: 10000, vendor: v},
	}
	if fmt.Sprint(rest) != fmt.Sprint(want) {
		t.Errorf("account lines =\n%v\nwant\n%v", rest, want)
	}
}

// A product line's account is the product's expense account when the bill
// posts, not when the line was saved.
func TestBillPost_ReadsTheProductsExpenseAccountAtPosting(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := pe.officeSupplyBill(t)
	if err := setFields(t, pe.app, "books_products", pe.patchCable.Id, map[string]any{"expense_account": pe.software.Id}); err != nil {
		t.Fatalf("move the patch cable's expense account to 6200: %v", err)
	}
	posted := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id)

	v := pe.officeSupply.Id
	_, debits := splitPayable(t, entryLinesOf(t, pe.app, posted.GetString("entry")), pe.payable.Id)
	want := []entryLine{
		{account: pe.software.Id, debit: 36420 + 3720, vendor: v},
		{account: pe.designTools.Id, debit: 18745 - 3890, vendor: v},
	}
	if fmt.Sprint(debits) != fmt.Sprint(want) {
		t.Errorf("debit lines =\n%v\nwant\n%v", debits, want)
	}
}

func TestBillPost_CreatesPayablesWhenMissing(t *testing.T) {
	be := newBillEnv(t)
	if n, _ := be.app.CountRecords("books_accounts", dbx.HashExp{"type": "accounts_payable"}); n != 0 {
		t.Fatalf("the chart already has %d A/P accounts", n)
	}
	bill := mkBill(t, be.app, be.summit, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.software, 128000))
	posted := mustPostBill(t, be.app, bill.Id, be.users.bookkeeper.Id)

	ap, err := be.app.FindRecordsByFilter("books_accounts", "type = 'accounts_payable'", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ap) != 1 || ap[0].GetString("name") != "Accounts payable" || ap[0].GetString("number") != "2000" {
		t.Fatalf("A/P accounts after the post = %v, want one 2000 Accounts payable", ap)
	}
	line, _ := splitPayable(t, entryLinesOf(t, be.app, posted.GetString("entry")), ap[0].Id)
	if line.credit != 128000 {
		t.Errorf("Accounts payable line %+v, want a 128000 credit", line)
	}
}

func TestBillPost_RefusesAnInactiveVendor(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := pe.officeSupplyBill(t)
	makeVendorInactive(t, pe.app, pe.officeSupply)

	err := postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Office Supply World"))
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

func TestBillPost_RefusesAnInactiveAccount(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := mkBill(t, pe.app, pe.summit, nil)
	mkBillLine(t, pe.app, bill, 0, accountLine(pe.pettyCash, 41286))

	err := postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantAccountInactive(1, "Old Petty Cash"))
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

func TestBillPost_RefusesAnInactiveProduct(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := mkBill(t, pe.app, pe.officeSupply, nil)
	mkBillLine(t, pe.app, bill, 0, accountLine(pe.designTools, 18745))
	mkBillLine(t, pe.app, bill, 1, productLine(pe.accessPoint, 3, 12140))
	makeProductInactive(t, pe.app, pe.accessPoint)

	err := postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Wireless access point"))
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

func TestBillPost_RefusesAProductThatIsNotPurchased(t *testing.T) {
	pe := newBillPostingEnv(t)
	paper, err := newProduct(pe.app, map[string]any{
		"type": "non_inventory", "name": "Printer paper, case", "income_account": pe.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save Printer paper, case: %v", err)
	}
	bill := mkBill(t, pe.app, pe.officeSupply, nil)
	mkBillLine(t, pe.app, bill, 0, productLine(paper, 2, 4250))

	err = postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantProductNotPurchased(1, "Printer paper, case"))
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

func TestBillPost_RefusesZeroTotal(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := mkBill(t, pe.app, pe.summit, nil)
	mkBillLine(t, pe.app, bill, 0, accountLine(pe.software, 10000))
	mkBillLine(t, pe.app, bill, 1, accountLine(pe.designTools, -10000))
	requireBillTotal(t, pe.app, bill.Id, 0)

	err := postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantBillZeroTotal)
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

func TestBillPost_HonorsCloseDate(t *testing.T) {
	pe := newBillPostingEnv(t)
	bill := pe.officeSupplyBill(t)
	setCloseDate(t, pe.app, billDay)

	err := postBillAs(pe.app, bill.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-04. Ask a Books admin for a close-date override to post on 2026-11-04.")
	requireBillNotPosted(t, pe.app, bill.Id, 1001)
}

// A correction posts under its original's number, voids the original with
// replaced_by, and keeps the original's vendor after it became inactive.
func TestBillCorrection_TakesTheNumberAndKeepsAnInactiveVendor(t *testing.T) {
	pe := newBillPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	original := mustPostBill(t, pe.app, pe.officeSupplyBill(t).Id, actor)
	originalEntry := original.GetString("entry")
	makeVendorInactive(t, pe.app, pe.officeSupply)

	draft, err := newBill(pe.app, pe.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	if err != nil {
		t.Fatalf("save the correction draft for the original's inactive vendor: %v", err)
	}
	mkBillLine(t, pe.app, draft, 0, accountLine(pe.designTools, 20000))
	if err := postBillAs(pe.app, draft.Id, actor); err != nil {
		t.Fatalf("post the correction of an inactive vendor's bill: %v", err)
	}
	corrected := reload(t, pe.app, "books_bills", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != "1001" || corrected.GetInt("sequence") != 1001 {
		t.Errorf("correction status %q number %q sequence %d, want posted, 1001, 1001",
			corrected.GetString("status"), corrected.GetString("number"), corrected.GetInt("sequence"))
	}
	if got := nextBillNumber(t, pe.app); got != 1002 {
		t.Errorf("bill sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, pe.app, "books_bills", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	newEntry := reload(t, pe.app, "books_journal_entries", corrected.GetString("entry"))
	if newEntry.GetString("replaces") != originalEntry || newEntry.GetString("number") != "1001" || newEntry.GetString("doc_type") != "bill" {
		t.Errorf("correction entry replaces %q number %q doc_type %q, want the original's entry, 1001, bill",
			newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("doc_type"))
	}
	for i, l := range entryLinesOf(t, pe.app, newEntry.Id) {
		if l.vendor != pe.officeSupply.Id || l.customer != "" {
			t.Errorf("correction entry line %d vendor %q customer %q, want the original's vendor and no customer", i+1, l.vendor, l.customer)
		}
	}
	requireNoDrift(t, pe.app)
}

// A void writes the void reversal and keeps the number; the General Ledger
// reads Type "Bill" on the bill's entry and "Void reversal of <n>" on its
// reversal, each naming the vendor.
func TestBillVoid_ReversesAndKeepsNumber(t *testing.T) {
	pe := newBillPostingEnv(t)
	registerBooksSources(t)
	bill := pe.officeSupplyBill(t)
	entryID := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id).GetString("entry")

	if err := voidBillAs(pe.app, bill.Id, pe.users.admin.Id); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	voided := reload(t, pe.app, "books_bills", bill.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != pe.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("bill status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the bill's entry status %q, want void", s)
	}
	rev := findReversal(t, pe.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "bill", "1001", billDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	revAP, _ := splitPayable(t, entryLinesOf(t, pe.app, rev.Id), pe.payable.Id)
	if revAP.debit != 54995 || revAP.vendor != pe.officeSupply.Id {
		t.Errorf("reversal Accounts payable line %+v, want a 54995 debit naming the vendor", revAP)
	}
	requireNoDrift(t, pe.app)

	res := runGL(t, pe.app, pe.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the bill's Accounts payable line", entryID, cols{"Bill", "1001", "Office Supply World"}},
		{"the void reversal's Accounts payable line", rev.Id, cols{"Void reversal of 1001", "1001", "Office Supply World"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, pe.app, w.entry, pe.payable))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A person's REST create of a bill entry is refused with the bill's text, and
// nothing is stored.
func TestCreate_BillEntryOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"date":"2026-11-04","doc_type":"bill","status":"draft","origin":"manual"}`,
		want:    http.StatusBadRequest,
		content: []string{"A bill entry comes only from posting its bill."},
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "bill"}); n != 0 {
				t.Errorf("%d bill entries stored, want 0", n)
			}
		},
	}.run(t, env.app)
}

// The server never reads the Bill lines setting: a bill with lines of both
// kinds posts while the setting says Accounts only.
func TestBillPost_IgnoresTheBillLinesSetting(t *testing.T) {
	pe := newBillPostingEnv(t)
	if got := reload(t, pe.app, "books_settings", settingsID).GetString("purchase_lines"); got != "both" {
		t.Fatalf("seeded purchase_lines = %q, want both", got)
	}
	if err := setFields(t, pe.app, "books_settings", settingsID, map[string]any{"purchase_lines": "accounts"}); err != nil {
		t.Fatalf("set purchase_lines to accounts: %v", err)
	}
	bill := pe.officeSupplyBill(t)
	posted := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" {
		t.Errorf("bill status %q number %q, want posted 1001", posted.GetString("status"), posted.GetString("number"))
	}
}
