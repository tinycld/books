package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Posting an invoice (spec §4.3): draft → posted writes a numbered journal
// entry (A/R debit, income credits by account, one tax credit per component),
// the tax-line snapshot, and every line names the customer. These tests post
// and void through a Go save of the invoice's status, the path the client's
// PATCH reaches after the request hook stamps the actor.

// postingEnv is an invoice env whose products credit two numbered income
// accounts, with an A/R account and a Denver combined group whose three
// components belong to three agencies, each with its own liability account,
// so every journal line of the entry has an account of its own.
type postingEnv struct {
	*invoiceEnv
	receivable, services, hardware *core.Record
	stateTax, rtdTax, cityTax      *core.Record
	state, rtd, city               *core.Record
	stateDOR, rtdAgency, cityDept  *core.Record
	denverByAgency                 *core.Record
}

func mkNumberedAccount(t testing.TB, app core.App, name, number, accountType, detailType string) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_accounts", map[string]any{
		"name": name, "number": number, "type": accountType, "detail_type": detailType, "currency": "USD",
	})
}

func setIncomeAccount(t testing.TB, app core.App, product, account *core.Record) {
	t.Helper()
	if err := setFields(t, app, "books_products", product.Id, map[string]any{"income_account": account.Id}); err != nil {
		t.Fatalf("move %s to %s: %v", product.GetString("name"), account.GetString("name"), err)
	}
}

func newPostingEnv(t *testing.T) *postingEnv {
	t.Helper()
	ie := newInvoiceEnv(t)
	app := ie.app
	pe := &postingEnv{invoiceEnv: ie}
	pe.receivable = mkNumberedAccount(t, app, "Receivables", "1200", "accounts_receivable", "accounts_receivable")
	pe.services = mkNumberedAccount(t, app, "Services", "4000", "income", "service_income")
	pe.hardware = mkNumberedAccount(t, app, "Hardware sales", "4100", "income", "product_sales")
	setIncomeAccount(t, app, ie.service, pe.services)
	setIncomeAccount(t, app, ie.discount, pe.services)
	setIncomeAccount(t, app, ie.accessPoint, pe.hardware)
	setIncomeAccount(t, app, ie.patchCable, pe.hardware)

	pe.stateTax = mkLiabilityAccount(t, app, "State sales tax payable")
	pe.rtdTax = mkLiabilityAccount(t, app, "RTD tax payable")
	pe.cityTax = mkLiabilityAccount(t, app, "Denver tax payable")
	pe.stateDOR = mkTaxAgency(t, app, "State DOR", pe.stateTax)
	pe.rtdAgency = mkTaxAgency(t, app, "RTD district", pe.rtdTax)
	pe.cityDept = mkTaxAgency(t, app, "Denver treasury", pe.cityTax)
	pe.state = mkTaxRate(t, app, "State 2.9%", 29000, pe.stateDOR)
	pe.rtd = mkTaxRate(t, app, "RTD 1%", 10000, pe.rtdAgency)
	pe.city = mkTaxRate(t, app, "City 4.81%", 48100, pe.cityDept)
	pe.denverByAgency = mkTaxGroup(t, app, "Denver by agency", pe.state, pe.rtd, pe.city)
	return pe
}

// everyKindInvoice saves the fixture's every-kind invoice (total 211177) with
// the three-agency group.
func (pe *postingEnv) everyKindInvoice(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{"tax_rate": pe.denverByAgency.Id, "memo": "October network work"}
	for k, v := range fields {
		all[k] = v
	}
	inv := pe.mkInvoice(t, all)
	for i, line := range pe.everyKind() {
		mkInvoiceLine(t, pe.app, inv, i, line)
	}
	requireInvoiceTotals(t, pe.app, inv.Id, 206970, 4207, 211177)
	return inv
}

// postInvoiceAs posts a draft invoice as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postInvoiceAs(app core.App, invoiceID, actor string) error {
	r, err := app.FindRecordById("books_invoices", invoiceID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostInvoice(t testing.TB, app core.App, invoiceID, actor string) *core.Record {
	t.Helper()
	if err := postInvoiceAs(app, invoiceID, actor); err != nil {
		t.Fatalf("post invoice %s: %v", invoiceID, err)
	}
	return reload(t, app, "books_invoices", invoiceID)
}

// voidInvoiceAs voids a posted invoice as actor.
func voidInvoiceAs(app core.App, invoiceID, actor string) error {
	r, err := app.FindRecordById("books_invoices", invoiceID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func setInvoiceStatusAs(app core.App, invoiceID, status string) error {
	r, err := app.FindRecordById("books_invoices", invoiceID)
	if err != nil {
		return err
	}
	r.Set("status", status)
	return app.Save(r)
}

// entryLine is one journal line as these tests compare it.
type entryLine struct {
	account          string
	debit, credit    int
	customer, vendor string
}

func entryLinesOf(t testing.TB, app core.App, entryID string) []entryLine {
	t.Helper()
	lines, err := entryLines(app, entryID)
	if err != nil {
		t.Fatalf("read the lines of %s: %v", entryID, err)
	}
	out := make([]entryLine, len(lines))
	for i, l := range lines {
		out[i] = entryLine{
			account: l.GetString("account"), debit: l.GetInt("debit"), credit: l.GetInt("credit"),
			customer: l.GetString("customer"), vendor: l.GetString("vendor"),
		}
	}
	return out
}

func nextInvoiceNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number")
}

// requireInvoiceNotPosted checks that a refused post wrote nothing: the invoice
// is a draft with no number, entry or stamp, no entry names it, it has no tax
// lines, and the invoice sequence did not move.
func requireInvoiceNotPosted(t testing.TB, app core.App, invoiceID string, nextNumber int) {
	t.Helper()
	inv := reload(t, app, "books_invoices", invoiceID)
	if inv.GetString("status") != statusDraft || inv.GetString("number") != "" || inv.GetString("entry") != "" ||
		inv.GetString("posted_at") != "" {
		t.Errorf("invoice after a refused post: status %q number %q entry %q posted_at %q, want a draft with none",
			inv.GetString("status"), inv.GetString("number"), inv.GetString("entry"), inv.GetString("posted_at"))
	}
	if n, err := app.CountRecords("books_journal_entries", dbx.HashExp{"document": invoiceID}); err != nil || n != 0 {
		t.Errorf("%d journal entries name the invoice (err %v), want 0", n, err)
	}
	if n, err := app.CountRecords("books_invoice_tax_lines", dbx.HashExp{"invoice": invoiceID}); err != nil || n != 0 {
		t.Errorf("%d tax lines on the invoice (err %v), want 0", n, err)
	}
	if got := nextInvoiceNumber(t, app); got != nextNumber {
		t.Errorf("invoice sequence next_number = %d after a refused post, want %d", got, nextNumber)
	}
}

func TestInvoicePost_WritesTheEntry(t *testing.T) {
	pe := newPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	inv := pe.everyKindInvoice(t, nil)

	posted := mustPostInvoice(t, pe.app, inv.Id, actor)
	if posted.GetString("status") != statusPosted || posted.GetString("number") != "1001" || posted.GetInt("sequence") != 1001 {
		t.Errorf("invoice status %q number %q sequence %d, want posted, 1001, 1001",
			posted.GetString("status"), posted.GetString("number"), posted.GetInt("sequence"))
	}
	if posted.GetString("posted_by") != actor || posted.GetString("posted_at") == "" {
		t.Errorf("invoice posted_by %q posted_at %q, want the poster and a time", posted.GetString("posted_by"), posted.GetString("posted_at"))
	}
	entryID := posted.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted invoice names no entry")
	}
	entry := reload(t, pe.app, "books_journal_entries", entryID)
	if got, want := [6]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"),
	}, [6]string{statusPosted, "invoice", "document", inv.Id, "1001", "2026-11-04"}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date = %v, want %v", got, want)
	}
	if entry.GetString("memo") != "October network work" || entry.GetString("posted_by") != actor {
		t.Errorf("entry memo %q posted_by %q, want the invoice memo and the poster", entry.GetString("memo"), entry.GetString("posted_by"))
	}

	// A/R first; income by account number (the discount's -18330 nets into
	// Services: 135000 + 42000 - 18330); the tax components in the group's
	// order, each to its agency's liability account.
	c := pe.customer.Id
	want := []entryLine{
		{account: pe.receivable.Id, debit: 211177, customer: c},
		{account: pe.services.Id, credit: 158670, customer: c},
		{account: pe.hardware.Id, credit: 48300, customer: c},
		{account: pe.stateTax.Id, credit: 1401, customer: c},
		{account: pe.rtdTax.Id, credit: 483, customer: c},
		{account: pe.cityTax.Id, credit: 2323, customer: c},
	}
	got := entryLinesOf(t, pe.app, entryID)
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
	debits, credits := 0, 0
	for _, l := range got {
		debits += l.debit
		credits += l.credit
	}
	if debits != credits || debits != 211177 || entry.GetInt("total") != 211177 {
		t.Errorf("debits %d credits %d entry total %d, want 211177 each", debits, credits, entry.GetInt("total"))
	}
	requireNoDrift(t, pe.app)

	t.Run("an income account whose amounts net below zero takes a debit", func(t *testing.T) {
		discounts := mkNumberedAccount(t, pe.app, "Sales discounts", "4900", "income", "discounts_refunds")
		promo, err := newProduct(pe.app, map[string]any{"type": "service", "name": "Promo discount", "income_account": discounts.Id})
		if err != nil {
			t.Fatalf("save the promo product: %v", err)
		}
		second := pe.mkInvoice(t, nil)
		mkInvoiceLine(t, pe.app, second, 0, item(pe.service, 1, 45000, false))
		mkInvoiceLine(t, pe.app, second, 1, percentLine(promo, -100000))
		posted := mustPostInvoice(t, pe.app, second.Id, actor)
		if posted.GetString("number") != "1002" {
			t.Errorf("second invoice number %q, want 1002", posted.GetString("number"))
		}
		want := []entryLine{
			{account: pe.receivable.Id, debit: 40500, customer: c},
			{account: pe.services.Id, credit: 45000, customer: c},
			{account: discounts.Id, debit: 4500, customer: c},
		}
		if got := entryLinesOf(t, pe.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
		}
	})
}

func TestInvoicePost_WritesTheTaxSnapshot(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	rows, err := pe.app.FindRecordsByFilter("books_invoice_tax_lines", "invoice = {:id}", "position", 0, 0, dbx.Params{"id": inv.Id})
	if err != nil {
		t.Fatalf("read the tax lines: %v", err)
	}
	type snap struct {
		rate, component, agency string
		ppm, taxable, amount    int
		position                int
	}
	want := []snap{
		{pe.denverByAgency.Id, pe.state.Id, pe.stateDOR.Id, 29000, 48300, 1401, 0},
		{pe.denverByAgency.Id, pe.rtd.Id, pe.rtdAgency.Id, 10000, 48300, 483, 1},
		{pe.denverByAgency.Id, pe.city.Id, pe.cityDept.Id, 48100, 48300, 2323, 2},
	}
	got := make([]snap, len(rows))
	for i, r := range rows {
		got[i] = snap{
			r.GetString("rate"), r.GetString("component"), r.GetString("agency"),
			r.GetInt("rate_ppm"), r.GetInt("taxable_amount"), r.GetInt("amount"), r.GetInt("position"),
		}
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("tax lines =\n%v\nwant\n%v", got, want)
	}
}

func TestInvoicePost_CreatesReceivablesWhenMissing(t *testing.T) {
	ie := newInvoiceEnv(t)
	if n, _ := ie.app.CountRecords("books_accounts", dbx.HashExp{"type": "accounts_receivable"}); n != 0 {
		t.Fatalf("the chart already has %d A/R accounts", n)
	}
	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	posted := mustPostInvoice(t, ie.app, inv.Id, ie.users.bookkeeper.Id)

	ar, err := ie.app.FindRecordsByFilter("books_accounts", "type = 'accounts_receivable'", "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ar) != 1 {
		t.Fatalf("%d A/R accounts after the post, want 1", len(ar))
	}
	got := [3]string{ar[0].GetString("name"), ar[0].GetString("number"), ar[0].GetString("detail_type")}
	if want := [3]string{"Accounts receivable", "1100", "accounts_receivable"}; got != want {
		t.Errorf("created A/R name/number/detail_type = %v, want %v", got, want)
	}
	lines := entryLinesOf(t, ie.app, posted.GetString("entry"))
	if len(lines) == 0 || lines[0].account != ar[0].Id || lines[0].debit != 45000 {
		t.Errorf("entry lines %v, want line 1 a 45000 debit to the created A/R account", lines)
	}
}

// Income lines follow the chart's order, as ensureReceivables reads it:
// numbered accounts by number first, an unnumbered account after them.
func TestInvoicePost_PutsUnnumberedIncomeLast(t *testing.T) {
	pe := newPostingEnv(t)
	consulting := mkNumberedAccount(t, pe.app, "Consulting", "", "income", "service_income")
	advice, err := newProduct(pe.app, map[string]any{"type": "service", "name": "Advice", "income_account": consulting.Id})
	if err != nil {
		t.Fatalf("save the advice product: %v", err)
	}
	inv := pe.mkInvoice(t, nil)
	mkInvoiceLine(t, pe.app, inv, 0, item(advice, 1, 30000, false))
	mkInvoiceLine(t, pe.app, inv, 1, item(pe.service, 1, 45000, false))
	posted := mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	c := pe.customer.Id
	want := []entryLine{
		{account: pe.receivable.Id, debit: 75000, customer: c},
		{account: pe.services.Id, credit: 45000, customer: c},
		{account: consulting.Id, credit: 30000, customer: c},
	}
	if got := entryLinesOf(t, pe.app, posted.GetString("entry")); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant (A/R, Services 4000, then unnumbered Consulting)\n%v", got, want)
	}
}

func TestInvoicePost_RefusesInactiveCustomer(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	if err := setCustomer(t, pe.app, pe.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the customer inactive: %v", err)
	}
	err := postInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "customer", "Harborview Dental is inactive. Choose an active customer.")
	requireInvoiceNotPosted(t, pe.app, inv.Id, 1001)
}

func TestInvoicePost_RefusesZeroTotal(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.mkInvoice(t, nil)
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 0, false))
	requireInvoiceTotals(t, pe.app, inv.Id, 0, 0, 0)

	err := postInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err, "An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft.")
	requireInvoiceNotPosted(t, pe.app, inv.Id, 1001)
}

func TestInvoicePost_HonorsCloseDate(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	setCloseDate(t, pe.app, "2026-11-04")

	err := postInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id)
	requireRefusalText(t, err,
		"The books are closed through 2026-11-04. Ask a Books admin for a close-date override to post on 2026-11-04.")
	requireInvoiceNotPosted(t, pe.app, inv.Id, 1001)
}

func TestInvoiceVoid_ReversesAndKeepsNumber(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	posted := mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
	entryID := posted.GetString("entry")

	if err := voidInvoiceAs(pe.app, inv.Id, pe.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	voided := reload(t, pe.app, "books_invoices", inv.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" ||
		voided.GetString("voided_by") != pe.users.admin.Id || voided.GetString("voided_at") == "" {
		t.Errorf("invoice status %q number %q voided_by %q voided_at %q, want void, 1001, the voider and a time",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"), voided.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the invoice's entry status %q, want void", s)
	}
	rev, err := postedReversalOf(pe.app, entryID)
	if err != nil || rev == nil {
		t.Fatalf("posted reversal of the entry: %v (err %v), want one", rev, err)
	}
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "invoice", "1001", "2026-11-04"}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	revLines := entryLinesOf(t, pe.app, rev.Id)
	if len(revLines) != 6 {
		t.Fatalf("the reversal has %d lines, want 6", len(revLines))
	}
	for i, l := range revLines {
		if l.customer != pe.customer.Id || l.vendor != "" {
			t.Errorf("reversal line %d customer %q vendor %q, want the invoice customer and no vendor", i+1, l.customer, l.vendor)
		}
	}
	if revLines[0].account != pe.receivable.Id || revLines[0].credit != 211177 {
		t.Errorf("reversal line 1 = %+v, want a 211177 credit to A/R", revLines[0])
	}
	requireNoDrift(t, pe.app)
}

func TestInvoiceCorrection_TakesTheNumber(t *testing.T) {
	pe := newPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	original := mustPostInvoice(t, pe.app, pe.everyKindInvoice(t, nil).Id, actor)
	originalEntry := original.GetString("entry")

	draft := pe.mkInvoice(t, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	mkInvoiceLine(t, pe.app, draft, 0, item(pe.service, 2, 45000, false))
	corrected := mustPostInvoice(t, pe.app, draft.Id, actor)

	if corrected.GetString("number") != "1001" || corrected.GetInt("sequence") != 1001 || corrected.GetString("status") != statusPosted {
		t.Errorf("correction number %q sequence %d status %q, want 1001, 1001, posted",
			corrected.GetString("number"), corrected.GetInt("sequence"), corrected.GetString("status"))
	}
	if got := nextInvoiceNumber(t, pe.app); got != 1002 {
		t.Errorf("invoice sequence next_number = %d after a correction, want 1002 (no new number)", got)
	}
	after := reload(t, pe.app, "books_invoices", original.Id)
	if after.GetString("status") != statusVoid || after.GetString("replaced_by") != draft.Id || after.GetString("voided_at") == "" {
		t.Errorf("original status %q replaced_by %q voided_at %q, want void, the correction, a time",
			after.GetString("status"), after.GetString("replaced_by"), after.GetString("voided_at"))
	}
	if s := reload(t, pe.app, "books_journal_entries", originalEntry).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	newEntry := reload(t, pe.app, "books_journal_entries", corrected.GetString("entry"))
	if newEntry.GetString("replaces") != originalEntry || newEntry.GetString("number") != "1001" || newEntry.GetString("document") != draft.Id {
		t.Errorf("correction entry replaces %q number %q document %q, want the original's entry, 1001, the correction",
			newEntry.GetString("replaces"), newEntry.GetString("number"), newEntry.GetString("document"))
	}
	requireNoDrift(t, pe.app)
}

// The user did not choose the customer again, so a correction keeps the
// original's customer after it became inactive: its draft saves and posts.
func TestInvoiceCorrection_KeepsAnInactiveCustomer(t *testing.T) {
	pe := newPostingEnv(t)
	actor := pe.users.bookkeeper.Id
	original := mustPostInvoice(t, pe.app, pe.everyKindInvoice(t, nil).Id, actor)
	if err := setCustomer(t, pe.app, pe.customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make the customer inactive: %v", err)
	}

	draft, err := newInvoice(pe.app, pe.customer, map[string]any{"replaces": original.Id})
	if err != nil {
		t.Fatalf("save the correction draft for the original's inactive customer: %v", err)
	}
	mkInvoiceLine(t, pe.app, draft, 0, item(pe.service, 2, 45000, false))
	if err := postInvoiceAs(pe.app, draft.Id, actor); err != nil {
		t.Fatalf("post the correction of an inactive customer's invoice: %v", err)
	}
	corrected := reload(t, pe.app, "books_invoices", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != "1001" {
		t.Errorf("correction status %q number %q, want posted, 1001", corrected.GetString("status"), corrected.GetString("number"))
	}
	for i, l := range entryLinesOf(t, pe.app, corrected.GetString("entry")) {
		if l.customer != pe.customer.Id {
			t.Errorf("correction entry line %d customer %q, want the original's customer", i+1, l.customer)
		}
	}

	// A new invoice for the inactive customer is still refused at Post.
	other := mkCustomer(t, pe.app, "Second Clinic", "")
	fresh := pe.mkInvoice(t, map[string]any{"customer": other.Id})
	mkInvoiceLine(t, pe.app, fresh, 0, item(pe.service, 1, 45000, false))
	if err := setCustomer(t, pe.app, other.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Second Clinic inactive: %v", err)
	}
	requireFieldRefusal(t, postInvoiceAs(pe.app, fresh.Id, actor), "customer",
		"Second Clinic is inactive. Choose an active customer.")
}

func TestInvoicePost_LinesRefusedAfterPost(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.mkInvoice(t, nil)
	line := mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	if err := setFields(t, pe.app, "books_invoice_lines", line.Id, map[string]any{"quantity": 2}); err == nil {
		t.Error("a line of a posted invoice was changed")
	}
	if _, err := newInvoiceLine(pe.app, inv, 1, item(pe.service, 1, 100, false)); err == nil {
		t.Error("a line was added to a posted invoice")
	}
	if err := pe.app.Delete(reload(t, pe.app, "books_invoice_lines", line.Id)); err == nil {
		t.Error("a line of a posted invoice was deleted")
	}
	requireLineCount(t, pe.app, inv, 1)
	if got := reload(t, pe.app, "books_invoice_lines", line.Id).GetFloat("quantity"); got != 1 {
		t.Errorf("quantity = %v after the refusal, want 1", got)
	}
	requireInvoiceTotals(t, pe.app, inv.Id, 45000, 0, 45000)
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
		t.Errorf("invoice status %q, want posted", s)
	}
}

func TestInvoicePost_PostedOnlyVoids(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.mkInvoice(t, nil)
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	requireRefusalText(t, setInvoiceStatusAs(pe.app, inv.Id, statusDraft), "Invoice 1001 cannot go from posted to draft.")
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
		t.Errorf("status %q after the refusal, want posted", s)
	}

	if err := voidInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	requireRefusalText(t, setInvoiceStatusAs(pe.app, inv.Id, statusPosted), "Invoice 1001 cannot go from void to posted.")
	if s := reload(t, pe.app, "books_invoices", inv.Id).GetString("status"); s != statusVoid {
		t.Errorf("status %q after the refusal, want void", s)
	}
}

// Post re-checks every stored line with the line guard's rules before it
// builds the entry, so a line that reached the table past the guard (here a
// raw write) cannot post.
func TestInvoicePost_RechecksStoredLines(t *testing.T) {
	cases := []struct {
		name  string
		set   dbx.Params
		check func(t testing.TB, err error)
	}{
		{"a description line with no description", dbx.Params{"description": ""},
			func(t testing.TB, err error) { requireRefusalText(t, err, "Line 2: Description is required.") }},
		{"a description line that names a product", dbx.Params{"product": "PRODUCT"},
			func(t testing.TB, err error) {
				requireRefusalText(t, err, "Line 2: A description line has no product or amount.")
			}},
		{"a line whose kind is not one of the four", dbx.Params{"kind": "discount"},
			func(t testing.TB, err error) { requireLineRefusal(t, err, 2) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pe := newPostingEnv(t)
			inv := pe.mkInvoice(t, nil)
			mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
			bad := mkInvoiceLine(t, pe.app, inv, 1, descriptionLine("Annex"))
			set := dbx.Params{}
			for k, v := range tc.set {
				if v == "PRODUCT" {
					v = pe.service.Id
				}
				set[k] = v
			}
			if _, err := pe.app.DB().Update("books_invoice_lines", set, dbx.HashExp{"id": bad.Id}).Execute(); err != nil {
				t.Fatalf("write the bad line past the guard: %v", err)
			}
			tc.check(t, postInvoiceAs(pe.app, inv.Id, pe.users.bookkeeper.Id))
			requireInvoiceNotPosted(t, pe.app, inv.Id, 1001)
		})
	}
}

// Spec §4.3: a posted invoice's audit row reads "Invoice 1001", and a line's
// row follows its invoice ("Invoice 1001: line 2").
func TestAudit_LabelsAPostedInvoiceAndItsLines(t *testing.T) {
	pe := newPostingEnv(t)
	audited := auditedCollections(pe.app)
	inv := pe.mkInvoice(t, nil)
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, 45000, false))
	line := mkInvoiceLine(t, pe.app, inv, 1, item(pe.accessPoint, 1, 18900, false))
	if got, want := audited["books_invoices"].ExtractLabel(reload(t, pe.app, "books_invoices", inv.Id)), "Draft invoice"; got != want {
		t.Errorf("draft invoice label = %q, want %q", got, want)
	}
	posted := mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)

	if got, want := audited["books_invoices"].ExtractLabel(posted), "Invoice 1001"; got != want {
		t.Errorf("posted invoice label = %q, want %q", got, want)
	}
	if got, want := audited["books_invoice_lines"].ExtractLabel(reload(t, pe.app, "books_invoice_lines", line.Id)), "Invoice 1001: line 2"; got != want {
		t.Errorf("posted invoice line label = %q, want %q", got, want)
	}
}
