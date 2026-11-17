package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/reports"
)

// Posting a vendor credit (vendor credit spec §3.1, §4): draft → posted writes
// a numbered journal entry with doc type vendor_credit, the mirror of a bill:
// one debit to Accounts payable for the total and one credit per account (each
// account line's account, each product line's product expense account read at
// posting), summed per account in chart order, a negative sum a debit; every
// line names the vendor. The credit's balance is its total. These tests post
// and void through a Go save of the credit's status, the path the client's
// PATCH reaches after the request hook stamps the actor.

const unappliedVendorCreditMemo = "Unapplied vendor credit (cash basis)"

// vendorCreditPostingEnv is a book with the bill and the vendor credit guards
// and both forms hosts, and 2000 Accounts payable in the chart.
type vendorCreditPostingEnv struct {
	*vendorCreditEnv
	payable *core.Record
}

func newVendorCreditPostingEnv(t *testing.T) *vendorCreditPostingEnv {
	t.Helper()
	ve := newBillAndVendorCreditEnv(t)
	return &vendorCreditPostingEnv{
		vendorCreditEnv: ve,
		payable:         mkNumberedAccount(t, ve.app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
	}
}

// officeSupplyLines are the spec's Office Supply World lines: account lines
// 6210 64.18 and 6210 −10.00, and the product line Cat6 patch cable, 10 ft
// 15 x 3.10, whose expense account is moved to 6200 here. Total 100.68:
// 6200 46.50, 6210 54.18.
func (pe *vendorCreditPostingEnv) officeSupplyLines(t testing.TB) []map[string]any {
	t.Helper()
	if err := setFields(t, pe.app, "books_products", pe.patchCable.Id, map[string]any{"expense_account": pe.software.Id}); err != nil {
		t.Fatalf("move the patch cable's expense account to 6200: %v", err)
	}
	return []map[string]any{
		accountLine(pe.designTools, 6418),
		accountLine(pe.designTools, -1000),
		productLine(pe.patchCable, 15, 310),
	}
}

func (pe *vendorCreditPostingEnv) officeSupplyCredit(t testing.TB) *core.Record {
	t.Helper()
	vc := pe.mkVendorCredit(t, pe.officeSupply, map[string]any{"memo": "Returned patch cables and a billing correction"})
	for i, line := range pe.officeSupplyLines(t) {
		mkVendorCreditLine(t, pe.app, vc, i, line)
	}
	requireVendorCreditTotal(t, pe.app, vc.Id, 10068)
	return vc
}

func nextVendorCreditNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", vendorCreditSequenceID).GetInt("next_number")
}

// requireVendorCreditNotPosted checks that a refused post wrote nothing: the
// credit is a draft with no number, entry, stamp or balance, no entry names
// it, and the vendor credit sequence did not move.
func requireVendorCreditNotPosted(t testing.TB, app core.App, id string, nextNumber int) {
	t.Helper()
	vc := reload(t, app, "books_vendor_credits", id)
	if vc.GetString("status") != statusDraft || vc.GetString("number") != "" || vc.GetString("entry") != "" ||
		vc.GetString("posted_at") != "" || vc.GetInt("balance") != 0 {
		t.Errorf("vendor credit after a refused post: status %q number %q entry %q posted_at %q balance %d, want a draft with none",
			vc.GetString("status"), vc.GetString("number"), vc.GetString("entry"), vc.GetString("posted_at"), vc.GetInt("balance"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": id}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the vendor credit (err %v), want 0", n, err)
	}
	if got := nextVendorCreditNumber(t, app); got != nextNumber {
		t.Errorf("vendor credit sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

// requireBalancedEntry checks that an entry's debits equal its credits.
func requireBalancedEntry(t testing.TB, lines []entryLine) {
	t.Helper()
	debits, credits := 0, 0
	for _, l := range lines {
		debits += l.debit
		credits += l.credit
	}
	if debits != credits || debits == 0 {
		t.Errorf("entry debits %d, credits %d; want equal and not zero", debits, credits)
	}
}

func TestVendorCreditPost_WritesTheEntry(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	if got := nextVendorCreditNumber(t, pe.app); got != 1001 {
		t.Fatalf("a fresh book's vendor credit sequence next_number = %d, want 1001", got)
	}
	vc := pe.officeSupplyCredit(t)

	posted := mustPostVendorCredit(t, pe.app, vc.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("vendor credit status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("vendor credit posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	if posted.GetInt("total") != 10068 || posted.GetInt("balance") != 10068 {
		t.Errorf("vendor credit total %d balance %d, want 10068 and 10068", posted.GetInt("total"), posted.GetInt("balance"))
	}
	if got := nextVendorCreditNumber(t, pe.app); got != 1002 {
		t.Errorf("vendor credit sequence next_number = %d after the post, want 1002", got)
	}
	if got := nextBillNumber(t, pe.app); got != 1001 {
		t.Errorf("bill sequence next_number = %d after a vendor credit post, want 1001 (untouched)", got)
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted vendor credit names no entry")
	}
	entry := reload(t, pe.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), dayOf(entry.GetString("date")),
	}, [6]string{statusPosted, "vendor_credit", "document", vc.Id, "1001", vendorCreditDay}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if entry.GetString("memo") != "Returned patch cables and a billing correction" || entry.GetString("posted_by") != actor {
		t.Errorf("entry memo %q posted_by %q, want the credit's memo and the poster", entry.GetString("memo"), entry.GetString("posted_by"))
	}

	// Accounts payable is debited the total; 6200 is credited the patch cables
	// (4650) and 6210 the two account lines (6418 - 1000 = 5418), in chart
	// order. Every line names the vendor and no customer.
	v := pe.officeSupply.Id
	got := entryLinesOf(t, pe.app, entryID)
	ap, credits := splitPayable(t, got, pe.payable.Id)
	if want := (entryLine{account: pe.payable.Id, debit: 10068, vendor: v}); ap != want {
		t.Errorf("Accounts payable line = %+v, want %+v", ap, want)
	}
	want := []entryLine{
		{account: pe.software.Id, credit: 4650, vendor: v},
		{account: pe.designTools.Id, credit: 5418, vendor: v},
	}
	if fmt.Sprint(credits) != fmt.Sprint(want) {
		t.Errorf("credit lines =\n%v\nwant (chart order)\n%v", credits, want)
	}
	requireBalancedEntry(t, got)
	if entry.GetInt("total") != 10068 {
		t.Errorf("entry total %d, want 10068", entry.GetInt("total"))
	}
	requireNoDrift(t, pe.app)
	requireNoDocumentDrift(t, pe.app)
}

// An account whose lines sum below zero takes a debit line; Accounts payable
// is debited for the total.
func TestVendorCreditPost_DebitsAnAccountThatNetsBelowZero(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.mkVendorCredit(t, pe.summit, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, accountLine(pe.software, 50000))
	mkVendorCreditLine(t, pe.app, vc, 1, accountLine(pe.designTools, -10000))
	posted := mustPostVendorCredit(t, pe.app, vc.Id, pe.users.bookkeeper.Id)

	v := pe.summit.Id
	lines := entryLinesOf(t, pe.app, posted.GetString("entry"))
	ap, rest := splitPayable(t, lines, pe.payable.Id)
	if want := (entryLine{account: pe.payable.Id, debit: 40000, vendor: v}); ap != want {
		t.Errorf("Accounts payable line = %+v, want %+v", ap, want)
	}
	want := []entryLine{
		{account: pe.software.Id, credit: 50000, vendor: v},
		{account: pe.designTools.Id, debit: 10000, vendor: v},
	}
	if fmt.Sprint(rest) != fmt.Sprint(want) {
		t.Errorf("account lines =\n%v\nwant\n%v", rest, want)
	}
	requireBalancedEntry(t, lines)
}

func TestVendorCreditPost_CreatesPayablesWhenMissing(t *testing.T) {
	ve := newBillAndVendorCreditEnv(t)
	if n, _ := ve.app.CountRecords("books_accounts", dbx.HashExp{"type": "accounts_payable"}); n != 0 {
		t.Fatalf("the chart already has %d A/P accounts", n)
	}
	vc := ve.mkVendorCredit(t, ve.pacificPower, nil)
	mkVendorCreditLine(t, ve.app, vc, 0, accountLine(ve.rent, 5000))
	posted := mustPostVendorCredit(t, ve.app, vc.Id, ve.users.bookkeeper.Id)

	ap, err := ve.app.FindRecordsByFilter("books_accounts", "type = 'accounts_payable'", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ap) != 1 || ap[0].GetString("name") != "Accounts payable" || ap[0].GetString("number") != "2000" {
		t.Fatalf("A/P accounts after the post = %v, want one 2000 Accounts payable", ap)
	}
	line, _ := splitPayable(t, entryLinesOf(t, ve.app, posted.GetString("entry")), ap[0].Id)
	if line.debit != 5000 || line.credit != 0 {
		t.Errorf("Accounts payable line %+v, want a 5000 debit", line)
	}
}

func TestVendorCreditPost_TheNextPostTakesTheNextNumber(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	first := pe.mkVendorCredit(t, pe.pacificPower, nil)
	mkVendorCreditLine(t, pe.app, first, 0, accountLine(pe.rent, 5000))
	second := pe.mkVendorCredit(t, pe.pacificPower, nil)
	mkVendorCreditLine(t, pe.app, second, 0, accountLine(pe.rent, 2500))

	if got := mustPostVendorCredit(t, pe.app, first.Id, actor).GetString("number"); got != "1001" {
		t.Errorf("first vendor credit number %q, want 1001", got)
	}
	if got := mustPostVendorCredit(t, pe.app, second.Id, actor).GetString("number"); got != "1002" {
		t.Errorf("second vendor credit number %q, want 1002", got)
	}
}

func TestVendorCreditPost_RefusesZeroTotal(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.mkVendorCredit(t, pe.summit, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, accountLine(pe.software, 10000))
	mkVendorCreditLine(t, pe.app, vc, 1, accountLine(pe.designTools, -10000))
	requireVendorCreditTotal(t, pe.app, vc.Id, 0)

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantVendorCreditZeroTotal)
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

func TestVendorCreditPost_RefusesAnInactiveVendor(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.officeSupplyCredit(t)
	makeVendorInactive(t, pe.app, pe.officeSupply)

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Office Supply World"))
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

func TestVendorCreditPost_RefusesAnInactiveAccount(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.mkVendorCredit(t, pe.summit, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, accountLine(pe.pettyCash, 41286))

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantAccountInactive(1, "Old Petty Cash"))
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

func TestVendorCreditPost_RefusesAnInactiveProduct(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.mkVendorCredit(t, pe.officeSupply, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, accountLine(pe.designTools, 6418))
	mkVendorCreditLine(t, pe.app, vc, 1, productLine(pe.accessPoint, 3, 12140))
	makeProductInactive(t, pe.app, pe.accessPoint)

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Wireless access point"))
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

func TestVendorCreditPost_RefusesAProductThatIsNotPurchased(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	paper, err := newProduct(pe.app, map[string]any{
		"type": "non_inventory", "name": "Printer paper, case", "income_account": pe.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save Printer paper, case: %v", err)
	}
	vc := pe.mkVendorCredit(t, pe.officeSupply, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, productLine(paper, 2, 4250))

	err = postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, wantProductNotPurchased(1, "Printer paper, case"))
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

// A product keeps an expense account that became inactive after it was saved;
// the post refuses it by the credit's product line.
func TestVendorCreditPost_RefusesAProductsInactiveExpenseAccount(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.mkVendorCredit(t, pe.officeSupply, nil)
	mkVendorCreditLine(t, pe.app, vc, 0, accountLine(pe.software, 12500))
	mkVendorCreditLine(t, pe.app, vc, 1, productLine(pe.patchCable, 2, 310))
	makeAccountInactive(t, pe.app, pe.designTools)

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, fmt.Sprintf(msgLineExpenseAccountInactive, "Product line 1", "Cat6 patch cable, 10 ft"))
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

func TestVendorCreditPost_HonorsCloseDate(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.officeSupplyCredit(t)
	setCloseDate(t, pe.app, vendorCreditDay)

	err := postVendorCreditAs(pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-12. Ask a Books admin for a close-date override to post on 2026-11-12.")
	requireVendorCreditNotPosted(t, pe.app, vc.Id, 1001)
}

// The server never reads the Purchase lines setting: a credit with lines of
// both kinds posts while the setting says Accounts only.
func TestVendorCreditPost_IgnoresThePurchaseLinesSetting(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	if err := setFields(t, pe.app, "books_settings", settingsID, map[string]any{"purchase_lines": "accounts"}); err != nil {
		t.Fatalf("set purchase_lines to accounts: %v", err)
	}
	vc := pe.officeSupplyCredit(t)
	posted := mustPostVendorCredit(t, pe.app, vc.Id, pe.users.bookkeeper.Id)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" {
		t.Errorf("vendor credit status %q number %q, want posted 1001", posted.GetString("status"), posted.GetString("number"))
	}
}

// A void writes the void reversal of the same doc type, keeps the number and
// sets the balance to 0; the General Ledger reads Type "Vendor credit" on the
// credit's entry and "Void reversal of 1001" on its reversal, each naming the
// vendor.
func TestVendorCreditVoid_ReversesAndZeroesTheBalance(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	registerBooksSources(t)
	vc := pe.officeSupplyCredit(t)
	entryID := mustPostVendorCredit(t, pe.app, vc.Id, pe.users.bookkeeper.Id).GetString("entry")
	requireNoDocumentDrift(t, pe.app)

	if err := voidVendorCreditAs(pe.app, vc.Id, pe.users.admin.Id); err != nil {
		t.Fatalf("void the vendor credit: %v", err)
	}
	voided := reload(t, pe.app, "books_vendor_credits", vc.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != pe.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("vendor credit status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	requireVendorCreditBalance(t, pe.app, vc.Id, 0)
	if s := reload(t, pe.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the vendor credit's entry status %q, want void", s)
	}
	rev := findReversal(t, pe.app, entryID)
	if got, want := [3]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number")},
		[3]string{originVoidReversal, "vendor_credit", "1001"}; got != want {
		t.Errorf("reversal origin/doc_type/number = %v, want %v", got, want)
	}
	revAP, _ := splitPayable(t, entryLinesOf(t, pe.app, rev.Id), pe.payable.Id)
	if revAP.credit != 10068 || revAP.vendor != pe.officeSupply.Id {
		t.Errorf("reversal Accounts payable line %+v, want a 10068 credit naming the vendor", revAP)
	}
	requireNoDrift(t, pe.app)
	requireNoDocumentDrift(t, pe.app)

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
		{"the vendor credit's Accounts payable line", entryID, cols{"Vendor credit", "1001", "Office Supply World"}},
		{"the void reversal's Accounts payable line", rev.Id, cols{"Void reversal of 1001", "1001", "Office Supply World"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, pe.app, w.entry, pe.payable))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A correction posts under its original's number, voids the original with
// replaced_by, keeps the original's vendor after it became inactive, and holds
// its own total as its balance.
func TestVendorCreditCorrection_TakesTheNumberAndKeepsAnInactiveVendor(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	original := mustPostVendorCredit(t, pe.app, pe.officeSupplyCredit(t).Id, actor)
	originalEntry := original.GetString("entry")
	requireNoDocumentDrift(t, pe.app)
	makeVendorInactive(t, pe.app, pe.officeSupply)

	draft, err := pe.newVendorCredit(pe.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	if err != nil {
		t.Fatalf("save the correction draft for the original's inactive vendor: %v", err)
	}
	mkVendorCreditLine(t, pe.app, draft, 0, accountLine(pe.designTools, 20000))
	if err := postVendorCreditAs(pe.app, draft.Id, actor); err != nil {
		t.Fatalf("post the correction of an inactive vendor's credit: %v", err)
	}
	corrected := reload(t, pe.app, "books_vendor_credits", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != "1001" ||
		corrected.GetInt("sequence") != 1001 || corrected.GetInt("balance") != 20000 {
		t.Errorf("correction status %q number %q sequence %d balance %d, want posted, 1001, 1001, 20000",
			corrected.GetString("status"), corrected.GetString("number"), corrected.GetInt("sequence"), corrected.GetInt("balance"))
	}
	if got := nextVendorCreditNumber(t, pe.app); got != 1002 {
		t.Errorf("vendor credit sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, pe.app, "books_vendor_credits", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetInt("balance") != 0 {
		t.Errorf("original status %q replaced_by %q balance %d, want void, the correction, 0",
			after.GetString("status"), after.GetString("replaced_by"), after.GetInt("balance"))
	}
	newEntry := reload(t, pe.app, "books_journal_entries", corrected.GetString("entry"))
	if newEntry.GetString("replaces") != originalEntry || newEntry.GetString("number") != "1001" || newEntry.GetString("doc_type") != "vendor_credit" {
		t.Errorf("correction entry replaces %q number %q doc_type %q, want the original's entry, 1001, vendor_credit",
			newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("doc_type"))
	}
	for i, l := range entryLinesOf(t, pe.app, newEntry.Id) {
		if l.vendor != pe.officeSupply.Id || l.customer != "" {
			t.Errorf("correction entry line %d vendor %q customer %q, want the original's vendor and no customer", i+1, l.vendor, l.customer)
		}
	}
	requireNoDrift(t, pe.app)
	requireNoDocumentDrift(t, pe.app)
}

func TestVerifyDocumentBalances_FindsAndRebuildFixesAVendorCreditDrift(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	draft := pe.mkVendorCredit(t, pe.pacificPower, nil)
	mkVendorCreditLine(t, pe.app, draft, 0, accountLine(pe.rent, 5000))
	vc := pe.officeSupplyCredit(t)
	mustPostVendorCredit(t, pe.app, vc.Id, pe.users.bookkeeper.Id)
	requireNoDocumentDrift(t, pe.app)

	for _, tc := range []struct {
		what string
		id   string
		want int
	}{
		{"a posted vendor credit", vc.Id, 10068},
		{"a draft vendor credit", draft.Id, 0},
	} {
		t.Run(tc.what, func(t *testing.T) {
			setDocumentBalanceRaw(t, pe.app, "books_vendor_credits", tc.id, 1)
			drifts, err := verifyDocumentBalances(pe.app)
			if err != nil {
				t.Fatalf("verifyDocumentBalances: %v", err)
			}
			if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), tc.id) {
				t.Fatalf("drifts = %+v, want one that names vendor credit %s", drifts, tc.id)
			}
			fixed, err := rebuildDocumentBalances(pe.app)
			if err != nil || fixed != 1 {
				t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
			}
			requireVendorCreditBalance(t, pe.app, tc.id, tc.want)
			requireNoDocumentDrift(t, pe.app)
		})
	}
}

// On the cash basis a vendor credit is a deferred kind: each posted line of
// its entry is taken out of the cash layer on the credit's date, with its
// sides turned, and nothing brings it back in this checkpoint (nothing applies
// a credit yet). verifyCashBasis finds a missing row and rebuildCashBasis puts
// it back.
func TestVendorCreditCashBasis_PostTakesEachEntryLineOut(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	vc := pe.officeSupplyCredit(t)
	entry := mustPostVendorCredit(t, pe.app, vc.Id, pe.users.bookkeeper.Id).GetString("entry")

	takenOut := func(account *core.Record, debit, credit int) cashRow {
		return cashRow{
			kind: "vendor_credit", account: account.Id, debit: debit, credit: credit,
			date: vendorCreditDay, memo: unappliedVendorCreditMemo, entry: entry,
		}
	}
	rows := cashRowsOf(t, pe.app, dbx.HashExp{"vendor_credit": vc.Id})
	requireCashRows(t, "the vendor credit's taken-out rows", rows, []cashRow{
		takenOut(pe.payable, 0, 10068),
		takenOut(pe.software, 4650, 0),
		takenOut(pe.designTools, 5418, 0),
	})
	if got := cashNet(t, pe.app); len(got) != 0 {
		t.Errorf("an unapplied vendor credit counts on the cash basis: %v, want nothing", got)
	}
	requireCashRowsBalancePerDate(t, pe.app)
	requireNoCashDrift(t, pe.app)
	if n, err := rebuildCashBasis(pe.app); err != nil || n != 0 {
		t.Errorf("rebuildCashBasis on a book with a posted vendor credit = %d changes (err %v), want 0", n, err)
	}

	recs, err := pe.app.FindAllRecords(cashLinesCol, dbx.HashExp{"vendor_credit": vc.Id})
	if err != nil || len(recs) == 0 {
		t.Fatalf("read the vendor credit's cash rows: %d rows, err %v", len(recs), err)
	}
	if _, err := pe.app.DB().NewQuery("DELETE FROM books_cash_basis_lines WHERE id = {:id}").
		Bind(dbx.Params{"id": recs[0].Id}).Execute(); err != nil {
		t.Fatalf("delete a cash row: %v", err)
	}
	drifts, err := verifyCashBasis(pe.app)
	if err != nil {
		t.Fatalf("verifyCashBasis: %v", err)
	}
	if len(drifts) != 1 || !strings.Contains(fmt.Sprintf("%+v", drifts[0]), "vendor_credit") ||
		!strings.Contains(fmt.Sprintf("%+v", drifts[0]), vc.Id) {
		t.Errorf("verifyCashBasis after a vendor credit row was deleted = %+v, want one drift of kind vendor_credit naming %s", drifts, vc.Id)
	}
	if n, err := rebuildCashBasis(pe.app); err != nil || n != 1 {
		t.Errorf("rebuildCashBasis after one vendor credit row was deleted = %d changes (err %v), want 1", n, err)
	}
	requireNoCashDrift(t, pe.app)
}

// A person's REST create of a vendor credit entry is refused with the vendor
// credit's text, and nothing is stored.
func TestCreate_VendorCreditEntryOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"date":"2026-11-12","doc_type":"vendor_credit","status":"draft","origin":"manual"}`,
		want:    http.StatusBadRequest,
		content: []string{"A vendor credit entry comes only from posting its vendor credit."},
		after: func(t testing.TB, app *tests.TestApp) {
			if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "vendor_credit"}); n != 0 {
				t.Errorf("%d vendor credit entries stored, want 0", n)
			}
		},
	}.run(t, env.app)
}

// The Credit flag changes only the vendor credit: a bill of the same lines
// posts its old sides, Accounts payable credited and the lines debited.
func TestVendorCreditPost_ABillOfTheSameLinesKeepsItsSides(t *testing.T) {
	pe := newVendorCreditPostingEnv(t)
	bill := mkBill(t, pe.app, pe.officeSupply, nil)
	for i, line := range pe.officeSupplyLines(t) {
		mkBillLine(t, pe.app, bill, i, line)
	}
	posted := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id)

	v := pe.officeSupply.Id
	ap, debits := splitPayable(t, entryLinesOf(t, pe.app, posted.GetString("entry")), pe.payable.Id)
	if want := (entryLine{account: pe.payable.Id, credit: 10068, vendor: v}); ap != want {
		t.Errorf("bill Accounts payable line = %+v, want %+v", ap, want)
	}
	want := []entryLine{
		{account: pe.software.Id, debit: 4650, vendor: v},
		{account: pe.designTools.Id, debit: 5418, vendor: v},
	}
	if fmt.Sprint(debits) != fmt.Sprint(want) {
		t.Errorf("bill debit lines =\n%v\nwant\n%v", debits, want)
	}
	if got := posted.GetString("number"); got != "1001" {
		t.Errorf("bill number %q, want 1001 from the bill sequence", got)
	}
}
