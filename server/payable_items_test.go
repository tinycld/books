package books

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The stored payable items (A/P Aging spec §4.1): one row per posted Accounts
// payable line that is not a bill payment's or a vendor refund's own (source
// line), one per line of a posted bill payment (payment_line), one per line of
// a posted vendor refund (refund_line) and two per vendor credit application
// (application_bill and application_credit), each given to its item. Rows are
// read as a superuser by their source, unless a test says it reads them as a
// reader.

// apBook is a migrated app with the ledger hooks, the bill and vendor credit
// guards, the bill payment, vendor credit application and vendor refund guards
// and both forms hosts bound (the vendor refund env), Books' report sources
// registered, a Books read-only reader and a user with Books level none, 2000
// Accounts Payable, an expense account (6200 Software Subscriptions) and the
// bank account 1000 Business Checking. Bills, bill payments, vendor credits,
// applications and refunds post through the code their REST routes run.
type apBook struct {
	*refundEnv
	reader, none *core.Record
	payable      *core.Record
	expense      *core.Record
	bank         *core.Record
}

func newAPBook(t *testing.T) apBook {
	t.Helper()
	re := newRefundEnv(t)
	registerBooksSources(t)
	return apBook{
		refundEnv: re,
		reader:    re.users.readOnly, none: re.users.none,
		payable: re.billPayEnv.payable, expense: re.software, bank: re.checking1000,
	}
}

// apVendor saves an active vendor named name.
func apVendor(t *testing.T, b apBook, name string) *core.Record {
	t.Helper()
	return mkVendor(t, b.app, name)
}

// apBill posts a bill of vendor dated date, due dueDate, with one account line
// of cents on the expense account.
func apBill(t *testing.T, b apBook, vendor *core.Record, date, dueDate string, cents int) *core.Record {
	t.Helper()
	bill := mkBill(t, b.app, vendor, map[string]any{"date": date, "due_date": dueDate})
	mkBillLine(t, b.app, bill, 0, accountLine(b.expense, int64(cents)))
	return mustPostBill(t, b.app, bill.Id, b.users.bookkeeper.Id)
}

// apPayBills posts one bill payment of vendor dated date, by check from the
// bank account, with one line per bill of bills (bill id -> cents), in bill id
// order, through the batch the Pay bills screen sends.
func apPayBills(t *testing.T, b apBook, vendor *core.Record, date string, bills map[string]int) *core.Record {
	t.Helper()
	ids := make([]string, 0, len(bills))
	for id := range bills {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	lines := make([]payLine, len(ids))
	for i, id := range ids {
		lines[i] = payLine{bill: reload(t, b.app, "books_bills", id), amount: int64(bills[id])}
	}
	return b.pay(t, vendor, map[string]any{"date": date, "paid_from": b.bank.Id}, lines...)
}

// apVendorCredit posts a vendor credit of vendor dated date with one account
// line of cents on the expense account.
func apVendorCredit(t *testing.T, b apBook, vendor *core.Record, date string, cents int) *core.Record {
	t.Helper()
	return b.postedCredit(t, vendor, date, billAmount{b.expense, int64(cents)})
}

// apApply applies cents of credit to bill on date through the REST create the
// apply dialog sends, and returns the application as stored.
func apApply(t *testing.T, b apBook, credit, bill *core.Record, date string, cents int) *core.Record {
	t.Helper()
	return b.apply(t, credit, bill, int64(cents), date)
}

// apRefund posts a vendor refund of vendor dated date to the bank account with
// one line per credit of credits (vendor credit id -> cents), in credit id
// order.
func apRefund(t *testing.T, b apBook, vendor *core.Record, date string, credits map[string]int) *core.Record {
	t.Helper()
	ids := make([]string, 0, len(credits))
	for id := range credits {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	lines := make([]refundLine, len(ids))
	for i, id := range ids {
		lines[i] = refundLine{credit: reload(t, b.app, "books_vendor_credits", id), amount: int64(credits[id])}
	}
	return b.refund(t, map[string]any{"vendor": vendor.Id, "date": date, "refunded_to": b.bank.Id}, lines...)
}

// apJournal posts a manual entry dated date: one Accounts payable line of
// debitCents and creditCents at position 0, naming vendor (none when vendor is
// nil), and one expense line that balances it at position 1.
func apJournal(t *testing.T, b apBook, date string, vendor *core.Record, debitCents, creditCents int) *core.Record {
	t.Helper()
	party := ""
	if vendor != nil {
		party = vendor.Id
	}
	return postJournal(t, b.app, "", date, "A/P adjustment",
		jnLine{account: b.payable, debit: debitCents, credit: creditCents, position: 0, vendor: party},
		jnLine{account: b.expense, debit: creditCents, credit: debitCents, position: 1})
}

// apRow is one stored payable row.
type apRow struct {
	id, source, vendor, entry, date, currency string
	debit, credit                             int
	item, kind, number, due, settled          string
	// seq is the integer the item's number formats (server/numbering.go).
	seq int
}

// owed is what the row adds to what the business owes its vendor.
func (r apRow) owed() int { return r.credit - r.debit }

// apRows are the stored rows of one source, or of every source when source is
// "", in id order.
func apRows(t testing.TB, app core.App, source string) []apRow {
	t.Helper()
	var rows []struct {
		ID       string `db:"id"`
		Source   string `db:"source"`
		Vendor   string `db:"vendor"`
		Entry    string `db:"entry"`
		Date     string `db:"date"`
		Currency string `db:"currency"`
		Debit    int    `db:"debit"`
		Credit   int    `db:"credit"`
		Item     string `db:"item"`
		Kind     string `db:"item_kind"`
		Number   string `db:"item_number"`
		Seq      int    `db:"item_seq"`
		Due      string `db:"due_date"`
		Settled  string `db:"settled"`
	}
	err := app.DB().NewQuery("SELECT id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date, settled " +
		"FROM books_payable_items WHERE {:source} = '' OR source = {:source} ORDER BY id").
		Bind(dbx.Params{"source": source}).All(&rows)
	if err != nil {
		t.Fatalf("read the stored payable rows of %q: %v", source, err)
	}
	out := make([]apRow, len(rows))
	for i, r := range rows {
		out[i] = apRow{
			id: r.ID, source: r.Source, vendor: r.Vendor, entry: r.Entry, date: r.Date, currency: r.Currency,
			debit: r.Debit, credit: r.Credit, item: r.Item, kind: r.Kind, number: r.Number, due: r.Due,
			settled: r.Settled, seq: r.Seq,
		}
	}
	return out
}

// requireNoPayableDrift fails when the stored payable rows disagree with what
// payableItems.Queries give, or a row's settled with its item's day.
func requireNoPayableDrift(t testing.TB, app core.App) {
	t.Helper()
	drifts, err := payableItems.verify(app)
	if err != nil {
		t.Fatalf("verify payables: %v", err)
	}
	if len(drifts) > 0 {
		t.Fatalf("payable rows drifted from the book: %+v", drifts)
	}
}

func apWhere(rows []apRow, keep func(apRow) bool) []apRow {
	var out []apRow
	for _, r := range rows {
		if keep(r) {
			out = append(out, r)
		}
	}
	return out
}

func apOfItem(rows []apRow, item string) []apRow {
	return apWhere(rows, func(r apRow) bool { return r.item == item })
}

func apOfEntry(rows []apRow, entry string) []apRow {
	return apWhere(rows, func(r apRow) bool { return r.entry == entry })
}

func apOwed(rows []apRow) int {
	sum := 0
	for _, r := range rows {
		sum += r.owed()
	}
	return sum
}

func apOne(t *testing.T, what string, rows []apRow) apRow {
	t.Helper()
	if len(rows) != 1 {
		t.Fatalf("%s: %d rows, want 1: %+v", what, len(rows), rows)
	}
	return rows[0]
}

// apEntry is the number and the sequence of a journal entry.
func apEntry(t testing.TB, b apBook, entryID string) (string, int) {
	t.Helper()
	e := reload(t, b.app, "books_journal_entries", entryID)
	if e.GetString("number") == "" || e.GetInt("sequence") == 0 {
		t.Fatalf("entry %s has no number or sequence", entryID)
	}
	return e.GetString("number"), e.GetInt("sequence")
}

// apLineOf is the one Accounts payable line of an entry.
func apLineOf(t testing.TB, b apBook, entryID string) *core.Record {
	t.Helper()
	line, err := b.app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e} && account = {:a}",
		dbx.Params{"e": entryID, "a": b.payable.Id})
	if err != nil {
		t.Fatalf("no Accounts payable line of entry %s: %v", entryID, err)
	}
	return line
}

// apSettledOf is the one settled day of the stored rows of item.
func apSettledOf(t testing.TB, app core.App, item string) string {
	t.Helper()
	days := map[string]bool{}
	for _, r := range apRows(t, app, "") {
		if r.item == item {
			days[r.settled] = true
		}
	}
	if len(days) != 1 {
		t.Fatalf("item %s has settled days %v, want exactly one", item, days)
	}
	for day := range days {
		return day
	}
	return ""
}

// apRequireItem fails unless rows share item, its kind, number, sequence and
// due day, and add up to owed (credit - debit).
func apRequireItem(t *testing.T, what string, rows []apRow, item string, owed int) {
	t.Helper()
	if len(rows) == 0 {
		t.Fatalf("%s: no rows", what)
	}
	for _, r := range rows {
		if r.item != item || r.kind != rows[0].kind || r.number != rows[0].number || r.seq != rows[0].seq || r.due != rows[0].due {
			t.Errorf("%s: row %+v, want item %s with the kind, number, sequence and due day of %+v", what, r, item, rows[0])
		}
	}
	if got := apOwed(rows); got != owed {
		t.Errorf("%s: rows add up to %d owed, want %d: %+v", what, got, owed, rows)
	}
}

// apDay is the ISO day of a stored day or date-time.
func apDay(s string) string {
	if len(s) > 10 {
		return s[:10]
	}
	return s
}

func TestPayableItemsShape(t *testing.T) {
	b := newAPBook(t)
	col, err := b.app.FindCollectionByNameOrId(payableItemsCollection)
	if err != nil {
		t.Fatalf("find %s: %v", payableItemsCollection, err)
	}
	if col.Type != core.CollectionTypeBase {
		t.Errorf("type = %q, want base", col.Type)
	}
	for rule, got := range map[string]*string{"list": col.ListRule, "view": col.ViewRule} {
		if got == nil || *got != booksReadRule {
			t.Errorf("%s rule = %v, want the Books READ rule", rule, got)
		}
	}
	for rule, got := range map[string]*string{"create": col.CreateRule, "update": col.UpdateRule, "delete": col.DeleteRule} {
		if got != nil {
			t.Errorf("%s rule = %q, want nil (only Books writes the rows)", rule, *got)
		}
	}
	want := map[string]string{
		"source": core.FieldTypeSelect,
		"vendor": core.FieldTypeRelation, "entry": core.FieldTypeRelation,
		"debit": core.FieldTypeNumber, "credit": core.FieldTypeNumber,
		"date": core.FieldTypeText, "currency": core.FieldTypeText, "item": core.FieldTypeText,
		"item_kind": core.FieldTypeText, "item_number": core.FieldTypeText, "due_date": core.FieldTypeText,
		"item_seq": core.FieldTypeNumber, "settled": core.FieldTypeText,
	}
	for field, typ := range want {
		f := col.Fields.GetByName(field)
		if f == nil {
			t.Errorf("no %s field", field)
			continue
		}
		if f.Type() != typ {
			t.Errorf("%s type = %q, want %q", field, f.Type(), typ)
		}
	}
	if source, ok := col.Fields.GetByName("source").(*core.SelectField); ok {
		got := slices.Clone(source.Values)
		slices.Sort(got)
		wantValues := []string{"application_bill", "application_credit", "line", "payment_line", "refund_line"}
		if !slices.Equal(got, wantValues) {
			t.Errorf("source values = %v, want exactly %v", source.Values, wantValues)
		}
		if !source.Required {
			t.Error("source is not required")
		}
	}
	for field, target := range map[string]string{"vendor": "books_vendors", "entry": "books_journal_entries"} {
		rel, ok := col.Fields.GetByName(field).(*core.RelationField)
		if !ok {
			continue
		}
		targetCol, err := b.app.FindCollectionByNameOrId(target)
		if err != nil {
			t.Fatal(err)
		}
		if rel.CollectionId != targetCol.Id || rel.MaxSelect > 1 {
			t.Errorf("%s relates to %q (max %d), want one %s", field, rel.CollectionId, rel.MaxSelect, target)
		}
	}

	// An index is found by its columns: PocketBase may quote them.
	normalized := make([]string, len(col.Indexes))
	for i, index := range col.Indexes {
		normalized[i] = strings.NewReplacer("`", "", `"`, "", " ", "").Replace(strings.ToLower(index))
	}
	for _, columns := range []string{"(entry)", "(item)", "(vendor,item,date)", "(settled,date)"} {
		found := slices.ContainsFunc(normalized, func(index string) bool {
			return strings.HasSuffix(index, "onbooks_payable_items"+columns)
		})
		if !found {
			t.Errorf("no index on %s; indexes:\n%s", columns, strings.Join(col.Indexes, "\n"))
		}
	}
}

func TestPayableLinesBill(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	draft := mkBill(t, b.app, v, map[string]any{"date": "2026-08-21", "due_date": "2026-09-20"})
	mkBillLine(t, b.app, draft, 0, accountLine(b.expense, 20000))

	entryID := bill.GetString("entry")
	number, seq := apEntry(t, b, entryID)
	got := apOne(t, "the bill's rows", apRows(t, b.app, ""))
	want := apRow{
		id: apLineOf(t, b, entryID).Id, source: payableSourceLine, vendor: v.Id, entry: entryID,
		date: "2026-08-20", currency: "USD", debit: 0, credit: 86000,
		item: bill.Id, kind: "bill", number: number, due: "2026-09-19", settled: openItemDay, seq: seq,
	}
	if got != want {
		t.Errorf("the bill's row =\n%+v\nwant\n%+v", got, want)
	}
	if n := len(apOfItem(apRows(t, b.app, ""), draft.Id)); n != 0 {
		t.Errorf("a draft bill gives %d rows, want 0", n)
	}
}

func TestPayableLinesPayment(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	full := apBill(t, b, v, "2026-08-04", "2026-09-03", 30000)
	part := apBill(t, b, v, "2026-08-05", "2026-09-04", 40000)
	pay := apPayBills(t, b, v, "2026-09-10", map[string]int{full.Id: 30000, part.Id: 25000})
	payEntry := pay.GetString("entry")
	if payEntry == "" {
		t.Fatal("the bill payment has no entry")
	}

	if n := len(apOfEntry(apRows(t, b.app, payableSourceLine), payEntry)); n != 0 {
		t.Errorf("the payment's own entry gives %d line rows, want 0 (its parts are the payment lines)", n)
	}
	rows := apRows(t, b.app, payableSourcePaymentLine)
	if len(rows) != 2 {
		t.Fatalf("payment_line rows = %+v, want 2", rows)
	}
	for _, bill := range []struct {
		bill   *core.Record
		amount int
		due    string
	}{{full, 30000, "2026-09-03"}, {part, 25000, "2026-09-04"}} {
		line, err := b.app.FindFirstRecordByFilter(billPayLinesCol, "payment = {:p} && bill = {:b}",
			dbx.Params{"p": pay.Id, "b": bill.bill.Id})
		if err != nil {
			t.Fatalf("find the payment line of bill %s: %v", bill.bill.GetString("number"), err)
		}
		number, seq := apEntry(t, b, bill.bill.GetString("entry"))
		got := apOne(t, "the payment line of bill "+number, apOfItem(rows, bill.bill.Id))
		got.settled = ""
		want := apRow{
			id: line.Id, source: payableSourcePaymentLine, vendor: v.Id, entry: payEntry,
			date: "2026-09-10", currency: "USD", debit: bill.amount, credit: 0,
			item: bill.bill.Id, kind: "bill", number: number, due: bill.due, seq: seq,
		}
		if got != want {
			t.Errorf("the payment line row of bill %s =\n%+v\nwant\n%+v", number, got, want)
		}
	}

	lines, err := b.app.FindAllRecords("books_journal_lines", dbx.HashExp{"entry": payEntry, "account": b.payable.Id})
	if err != nil {
		t.Fatalf("read the payment's Accounts payable lines: %v", err)
	}
	debits := 0
	for _, l := range lines {
		debits += l.GetInt("debit")
	}
	if sum := rows[0].debit + rows[1].debit; sum != debits || debits != 55000 {
		t.Errorf("the payment lines add up to %d, the entry's Accounts payable debits to %d; want both 55000", sum, debits)
	}

	all := apRows(t, b.app, "")
	for _, r := range apOfItem(all, full.Id) {
		if r.settled != "2026-09-10" {
			t.Errorf("a row of the bill paid in full has settled %q, want the payment's day 2026-09-10: %+v", r.settled, r)
		}
	}
	for _, r := range apOfItem(all, part.Id) {
		if r.settled != openItemDay {
			t.Errorf("a row of the part-paid bill has settled %q, want %s: %+v", r.settled, openItemDay, r)
		}
	}
	apRequireItem(t, "the part-paid bill", apOfItem(all, part.Id), part.Id, 15000)
}

func TestPayableLinesVendorCredit(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
	creditEntry := credit.GetString("entry")
	creditNumber, creditSeq := apEntry(t, b, creditEntry)

	own := apOne(t, "the credit's rows", apRows(t, b.app, ""))
	if want := (apRow{
		id: apLineOf(t, b, creditEntry).Id, source: payableSourceLine, vendor: v.Id, entry: creditEntry,
		date: "2026-10-06", currency: "USD", debit: 20000, credit: 0,
		item: credit.Id, kind: "vendor_credit", number: creditNumber, due: "2026-10-06", settled: openItemDay, seq: creditSeq,
	}); own != want {
		t.Errorf("the credit's row =\n%+v\nwant\n%+v", own, want)
	}

	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	billEntry := bill.GetString("entry")
	billNumber, billSeq := apEntry(t, b, billEntry)
	application := apApply(t, b, credit, bill, "2026-10-20", 20000)

	billSide := apOne(t, "the application_bill rows", apRows(t, b.app, payableSourceApplicationBill))
	billSide.settled = ""
	if want := (apRow{
		id: application.Id, source: payableSourceApplicationBill, vendor: v.Id, entry: creditEntry,
		date: "2026-10-20", currency: "USD", debit: 20000, credit: 0,
		item: bill.Id, kind: "bill", number: billNumber, due: "2026-09-19", seq: billSeq,
	}); billSide != want {
		t.Errorf("the application's bill row =\n%+v\nwant\n%+v", billSide, want)
	}
	creditSide := apOne(t, "the application_credit rows", apRows(t, b.app, payableSourceApplicationCredit))
	creditSide.settled = ""
	if want := (apRow{
		id: application.Id + "c", source: payableSourceApplicationCredit, vendor: v.Id, entry: billEntry,
		date: "2026-10-20", currency: "USD", debit: 0, credit: 20000,
		item: credit.Id, kind: "vendor_credit", number: creditNumber, due: "2026-10-06", seq: creditSeq,
	}); creditSide != want {
		t.Errorf("the application's credit row =\n%+v\nwant\n%+v", creditSide, want)
	}
	if len(creditSide.id) != 16 {
		t.Errorf("the credit row's id %q has %d characters, want 16", creditSide.id, len(creditSide.id))
	}
	if sum := billSide.owed() + creditSide.owed(); sum != 0 {
		t.Errorf("the two rows of the application add up to %d, want 0", sum)
	}
	if got := apSettledOf(t, b.app, credit.Id); got != "2026-10-20" {
		t.Errorf("the credit used up by the application has settled %q, want 2026-10-20", got)
	}
	requireNoPayableDrift(t, b.app)

	if a := b.removeAs(t, b.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("remove the application answered %d; body: %s", a.status, a.body)
	}
	for _, source := range []string{payableSourceApplicationBill, payableSourceApplicationCredit} {
		if rows := apRows(t, b.app, source); len(rows) != 0 {
			t.Errorf("after the application's delete: %s rows %+v, want none", source, rows)
		}
	}
	if got := apSettledOf(t, b.app, credit.Id); got != openItemDay {
		t.Errorf("after the application's delete the credit has settled %q, want %s", got, openItemDay)
	}
	if got := apSettledOf(t, b.app, bill.Id); got != openItemDay {
		t.Errorf("after the application's delete the bill has settled %q, want %s", got, openItemDay)
	}
	requireNoPayableDrift(t, b.app)

	// The bill above stays open through the application, so its settled day
	// cannot show whether the delete settles the bill again. This bill is
	// settled in full by the application, so the delete must open it again.
	paidBill := apBill(t, b, v, "2026-09-01", "2026-10-01", 20000)
	full := apApply(t, b, credit, paidBill, "2026-10-21", 20000)
	if got := apSettledOf(t, b.app, paidBill.Id); got != "2026-10-21" {
		t.Errorf("the bill settled in full by the application has settled %q, want 2026-10-21", got)
	}
	if got := apSettledOf(t, b.app, credit.Id); got != "2026-10-21" {
		t.Errorf("the credit used up by the second application has settled %q, want 2026-10-21", got)
	}
	if a := b.removeAs(t, b.users.bookkeeper, full); a.status != http.StatusNoContent {
		t.Fatalf("remove the second application answered %d; body: %s", a.status, a.body)
	}
	if got := apSettledOf(t, b.app, paidBill.Id); got != openItemDay {
		t.Errorf("after the second application's delete the bill it settled has settled %q, want %s", got, openItemDay)
	}
	if got := apSettledOf(t, b.app, credit.Id); got != openItemDay {
		t.Errorf("after the second application's delete the credit has settled %q, want %s", got, openItemDay)
	}
	requireNoPayableDrift(t, b.app)
}

func TestPayableLinesRefund(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
	creditNumber, creditSeq := apEntry(t, b, credit.GetString("entry"))
	refund := apRefund(t, b, v, "2026-10-25", map[string]int{credit.Id: 5000})
	refundEntry := refund.GetString("entry")
	if refundEntry == "" {
		t.Fatal("the vendor refund has no entry")
	}

	if n := len(apOfEntry(apRows(t, b.app, payableSourceLine), refundEntry)); n != 0 {
		t.Errorf("the refund's own entry gives %d line rows, want 0 (its parts are the refund lines)", n)
	}
	line, err := b.app.FindFirstRecordByFilter(refundLinesCol, "refund = {:r}", dbx.Params{"r": refund.Id})
	if err != nil {
		t.Fatalf("find the refund line: %v", err)
	}
	got := apOne(t, "the refund_line rows", apRows(t, b.app, payableSourceRefundLine))
	if want := (apRow{
		id: line.Id, source: payableSourceRefundLine, vendor: v.Id, entry: refundEntry,
		date: "2026-10-25", currency: "USD", debit: 0, credit: 5000,
		item: credit.Id, kind: "vendor_credit", number: creditNumber, due: "2026-10-06", settled: openItemDay, seq: creditSeq,
	}); got != want {
		t.Errorf("the refund line row =\n%+v\nwant\n%+v", got, want)
	}
	apRequireItem(t, "the part-refunded credit", apOfItem(apRows(t, b.app, ""), credit.Id), credit.Id, -15000)

	for _, c := range []struct {
		name, applyDay, refundDay string
	}{
		{"the refund is the later day", "2026-10-20", "2026-10-25"},
		{"the application is the later day", "2026-10-28", "2026-10-15"},
	} {
		t.Run(c.name, func(t *testing.T) {
			b := newAPBook(t)
			v := apVendor(t, b, "Harbor Freight Logistics")
			credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
			bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
			apApply(t, b, credit, bill, c.applyDay, 12000)
			apRefund(t, b, v, c.refundDay, map[string]int{credit.Id: 8000})
			want := max(c.applyDay, c.refundDay)
			if got := apSettledOf(t, b.app, credit.Id); got != want {
				t.Errorf("a credit used up by an application on %s and a refund on %s has settled %q, want %s",
					c.applyDay, c.refundDay, got, want)
			}
			requireNoPayableDrift(t, b.app)
		})
	}
}

func TestPayableLinesJournal(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	withVendor := apJournal(t, b, "2026-09-01", v, 0, 31000)
	noVendor := apJournal(t, b, "2026-09-02", nil, 0, 12000)

	rows := apRows(t, b.app, payableSourceLine)
	for _, c := range []struct {
		name   string
		entry  *core.Record
		vendor string
		credit int
		due    string
	}{
		{"the line with a vendor", withVendor, v.Id, 31000, "2026-09-01"},
		{"the line with no vendor", noVendor, "", 12000, "2026-09-02"},
	} {
		line := apLineOf(t, b, c.entry.Id)
		number, seq := apEntry(t, b, c.entry.Id)
		got := apOne(t, c.name, apOfEntry(rows, c.entry.Id))
		want := apRow{
			id: line.Id, source: payableSourceLine, vendor: c.vendor, entry: c.entry.Id,
			date: c.due, currency: "USD", debit: 0, credit: c.credit,
			item: line.Id, kind: "entry", number: number, due: c.due, settled: openItemDay, seq: seq,
		}
		if got != want {
			t.Errorf("%s: row =\n%+v\nwant\n%+v", c.name, got, want)
		}
	}

	for _, e := range []*core.Record{withVendor, noVendor} {
		if err := setStatus(b.app, e.Id, statusVoid, b.users.admin.Id); err != nil {
			t.Fatalf("void entry %s: %v", e.GetString("number"), err)
		}
	}
	all := apRows(t, b.app, "")
	for _, e := range []*core.Record{withVendor, noVendor} {
		line := apLineOf(t, b, e.Id)
		rev := findReversal(t, b.app, e.Id)
		item := apOfItem(all, line.Id)
		if len(item) != 2 || len(apOfEntry(item, rev.Id)) != 1 {
			t.Fatalf("entry %s after its void: item rows %+v, want its line and the reversal's line", e.Id, item)
		}
		apRequireItem(t, "line "+line.Id+" and its reversal line", item, line.Id, 0)
		if item[0].due != apDay(e.GetString("date")) {
			t.Errorf("the reversed item's due day = %q, want the entry's %q (a reversal ages with what it reverses)", item[0].due, apDay(e.GetString("date")))
		}
		if got, want := apSettledOf(t, b.app, line.Id), apDay(rev.GetString("date")); got != want {
			t.Errorf("entry %s's item has settled %q after its void, want the reversal's day %q", e.Id, got, want)
		}
	}
}

func TestPayableLinesVoids(t *testing.T) {
	t.Run("a void bill", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 40000)
		if err := voidBillAs(b.app, bill.Id, b.users.admin.Id); err != nil {
			t.Fatalf("void the bill: %v", err)
		}
		rev := findReversal(t, b.app, bill.GetString("entry"))
		rows := apRows(t, b.app, "")
		both := append(apOfEntry(rows, bill.GetString("entry")), apOfEntry(rows, rev.Id)...)
		if len(both) != 2 {
			t.Fatalf("the bill and its reversal give %d rows, want 2: %+v", len(both), both)
		}
		apRequireItem(t, "the bill and its reversal", both, bill.Id, 0)
		if both[0].due != "2026-09-19" {
			t.Errorf("due day = %q, want the bill's 2026-09-19", both[0].due)
		}
		if got := apSettledOf(t, b.app, bill.Id); got != apDay(rev.GetString("date")) {
			t.Errorf("the void bill has settled %q, want the reversal's day %q", got, apDay(rev.GetString("date")))
		}
		requireNoPayableDrift(t, b.app)
	})

	t.Run("a void bill payment", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 40000)
		pay := apPayBills(t, b, v, "2026-09-25", map[string]int{bill.Id: 40000})
		if got := apSettledOf(t, b.app, bill.Id); got != "2026-09-25" {
			t.Fatalf("the paid bill has settled %q, want 2026-09-25", got)
		}
		if err := voidBillPaymentAs(b.app, pay.Id, b.users.admin.Id); err != nil {
			t.Fatalf("void the bill payment: %v", err)
		}
		if rows := apRows(t, b.app, payableSourcePaymentLine); len(rows) != 0 {
			t.Errorf("a void bill payment keeps payment_line rows %+v, want none", rows)
		}
		rev := findReversal(t, b.app, pay.GetString("entry"))
		rows := apRows(t, b.app, "")
		if n := len(apOfEntry(rows, pay.GetString("entry"))) + len(apOfEntry(rows, rev.Id)); n != 0 {
			t.Errorf("the void payment's entry and its reversal give %d rows, want 0", n)
		}
		apRequireItem(t, "the bill after the payment's void", apOfItem(rows, bill.Id), bill.Id, 40000)
		if got := apSettledOf(t, b.app, bill.Id); got != openItemDay {
			t.Errorf("the bill open again has settled %q, want %s", got, openItemDay)
		}
		requireNoPayableDrift(t, b.app)
	})

	t.Run("a void vendor credit", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
		if err := voidVendorCreditAs(b.app, credit.Id, b.users.admin.Id); err != nil {
			t.Fatalf("void the credit: %v", err)
		}
		rev := findReversal(t, b.app, credit.GetString("entry"))
		rows := apRows(t, b.app, "")
		both := append(apOfEntry(rows, credit.GetString("entry")), apOfEntry(rows, rev.Id)...)
		if len(both) != 2 {
			t.Fatalf("the credit and its reversal give %d rows, want 2: %+v", len(both), both)
		}
		apRequireItem(t, "the credit and its reversal", both, credit.Id, 0)
		if got := apSettledOf(t, b.app, credit.Id); got != apDay(rev.GetString("date")) {
			t.Errorf("the void credit has settled %q, want the reversal's day %q", got, apDay(rev.GetString("date")))
		}
		requireNoPayableDrift(t, b.app)
	})

	t.Run("a void vendor refund", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
		refund := apRefund(t, b, v, "2026-10-25", map[string]int{credit.Id: 20000})
		if got := apSettledOf(t, b.app, credit.Id); got != "2026-10-25" {
			t.Fatalf("the refunded credit has settled %q, want 2026-10-25", got)
		}
		if err := voidRefundAs(b.app, refund.Id, b.users.admin.Id); err != nil {
			t.Fatalf("void the refund: %v", err)
		}
		if rows := apRows(t, b.app, payableSourceRefundLine); len(rows) != 0 {
			t.Errorf("a void refund keeps refund_line rows %+v, want none", rows)
		}
		rev := findReversal(t, b.app, refund.GetString("entry"))
		rows := apRows(t, b.app, "")
		if n := len(apOfEntry(rows, refund.GetString("entry"))) + len(apOfEntry(rows, rev.Id)); n != 0 {
			t.Errorf("the void refund's entry and its reversal give %d rows, want 0", n)
		}
		apRequireItem(t, "the credit after the refund's void", apOfItem(rows, credit.Id), credit.Id, -20000)
		if got := apSettledOf(t, b.app, credit.Id); got != openItemDay {
			t.Errorf("the credit open again has settled %q, want %s", got, openItemDay)
		}
		requireNoPayableDrift(t, b.app)
	})
}

func TestPayableCorrections(t *testing.T) {
	t.Run("a corrected bill with a payment line and an application", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		original := apBill(t, b, v, billDay, billDueDay, 50000)
		apPayBills(t, b, v, "2026-11-10", map[string]int{original.Id: 20000})
		credit := apVendorCredit(t, b, v, "2026-11-05", 10000)
		apApply(t, b, credit, original, "2026-11-12", 10000)

		draft := b.billCorrectionOf(t, original, v, 45000)
		mustPostBill(t, b.app, draft.Id, b.users.bookkeeper.Id)
		corrected := reload(t, b.app, "books_bills", draft.Id)
		number, seq := apEntry(t, b, corrected.GetString("entry"))

		rows := apRows(t, b.app, "")
		old := apOfItem(rows, original.Id)
		rev := findReversal(t, b.app, original.GetString("entry"))
		for _, r := range old {
			if r.source != payableSourceLine || (r.entry != original.GetString("entry") && r.entry != rev.Id) {
				t.Errorf("a row of the replaced bill that is not its own line or its reversal's: %+v", r)
			}
		}
		apRequireItem(t, "the replaced bill", old, original.Id, 0)
		moved := apOfItem(rows, draft.Id)
		sources := map[string]int{}
		for _, r := range moved {
			sources[r.source]++
			if r.number != number || r.seq != seq || r.due != apDay(corrected.GetString("due_date")) || r.kind != "bill" {
				t.Errorf("a row of the correction has number %q, sequence %d, due %q, kind %q; want %q, %d, %q, bill: %+v",
					r.number, r.seq, r.due, r.kind, number, seq, apDay(corrected.GetString("due_date")), r)
			}
		}
		if sources[payableSourceLine] != 1 || sources[payableSourcePaymentLine] != 1 || sources[payableSourceApplicationBill] != 1 {
			t.Errorf("the correction's rows by source = %v, want its line, the moved payment line and the moved application", sources)
		}
		apRequireItem(t, "the correction", moved, draft.Id, 15000)
		creditSide := apOne(t, "the application's credit row", apRows(t, b.app, payableSourceApplicationCredit))
		if creditSide.entry != corrected.GetString("entry") {
			t.Errorf("the application's credit row names entry %q, want the correction's %q", creditSide.entry, corrected.GetString("entry"))
		}
		requireNoPayableDrift(t, b.app)
	})

	t.Run("a corrected bill payment", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		first := apBill(t, b, v, "2026-08-04", "2026-09-03", 30000)
		second := apBill(t, b, v, "2026-08-05", "2026-09-04", 40000)
		original := apPayBills(t, b, v, "2026-09-10", map[string]int{first.Id: 30000})
		correction := b.pay(t, v, map[string]any{"replaces": original.Id, "date": "2026-09-10", "paid_from": b.bank.Id},
			payLine{first, 30000}, payLine{second, 10000})

		rows := apRows(t, b.app, payableSourcePaymentLine)
		if n := len(apOfEntry(rows, original.GetString("entry"))); n != 0 {
			t.Errorf("the replaced payment keeps %d payment_line rows, want 0", n)
		}
		stored := apOfEntry(rows, correction.GetString("entry"))
		lines := linesOfBillPayment(t, b.app, correction.Id)
		ids := make([]string, len(stored))
		for i, r := range stored {
			ids[i] = r.id
		}
		wantIDs := make([]string, len(lines))
		for i, l := range lines {
			wantIDs[i] = l.Id
		}
		slices.Sort(ids)
		slices.Sort(wantIDs)
		if !slices.Equal(ids, wantIDs) || len(ids) != 2 {
			t.Errorf("the correction's payment_line rows are %v, want its two lines %v", ids, wantIDs)
		}
		all := apRows(t, b.app, "")
		apRequireItem(t, "bill 1", apOfItem(all, first.Id), first.Id, 0)
		apRequireItem(t, "bill 2", apOfItem(all, second.Id), second.Id, 30000)
		requireNoPayableDrift(t, b.app)
	})

	t.Run("a corrected vendor credit with an application and a refund line", func(t *testing.T) {
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		credit := apVendorCredit(t, b, v, vendorCreditDay, 42500)
		bill := apBill(t, b, v, billDay, billDueDay, 50000)
		apApply(t, b, credit, bill, applyDay, 10000)
		apRefund(t, b, v, refundDay, map[string]int{credit.Id: 15000})

		draft := b.creditCorrectionOf(t, credit, v, billAmount{b.expense, 40000})
		mustPostVendorCredit(t, b.app, draft.Id, b.users.bookkeeper.Id)
		corrected := reload(t, b.app, "books_vendor_credits", draft.Id)
		number, seq := apEntry(t, b, corrected.GetString("entry"))

		rows := apRows(t, b.app, "")
		rev := findReversal(t, b.app, credit.GetString("entry"))
		old := apOfItem(rows, credit.Id)
		for _, r := range old {
			if r.source != payableSourceLine || (r.entry != credit.GetString("entry") && r.entry != rev.Id) {
				t.Errorf("a row of the replaced credit that is not its own line or its reversal's: %+v", r)
			}
		}
		apRequireItem(t, "the replaced credit", old, credit.Id, 0)
		moved := apOfItem(rows, draft.Id)
		sources := map[string]int{}
		for _, r := range moved {
			sources[r.source]++
			if r.number != number || r.seq != seq || r.kind != "vendor_credit" {
				t.Errorf("a row of the correction has number %q, sequence %d, kind %q; want %q, %d, vendor_credit: %+v",
					r.number, r.seq, r.kind, number, seq, r)
			}
		}
		if sources[payableSourceLine] != 1 || sources[payableSourceApplicationCredit] != 1 || sources[payableSourceRefundLine] != 1 {
			t.Errorf("the correction's rows by source = %v, want its line, the moved application and the moved refund line", sources)
		}
		apRequireItem(t, "the correction", moved, draft.Id, -15000)
		billSide := apOne(t, "the application's bill row", apRows(t, b.app, payableSourceApplicationBill))
		if billSide.entry != corrected.GetString("entry") {
			t.Errorf("the application's bill row names entry %q, want the correction's %q", billSide.entry, corrected.GetString("entry"))
		}
		requireNoPayableDrift(t, b.app)
	})
}

// apTieBook posts every kind of payable document, void and correction over
// two vendors and a line with no vendor. It returns the two vendors.
func apTieBook(t *testing.T, b apBook) []*core.Record {
	t.Helper()
	admin := b.users.admin.Id
	harbor := apVendor(t, b, "Harbor Freight Logistics")
	cascade := apVendor(t, b, "Cascade Fuel & Fleet")

	// Harbor: a part-paid bill with an applied credit, a paid bill, a void bill,
	// a refund of a credit and a void two-line manual entry.
	partPaid := apBill(t, b, harbor, "2026-08-20", "2026-09-19", 86000)
	apPayBills(t, b, harbor, "2026-09-25", map[string]int{partPaid.Id: 13725})
	credit := apVendorCredit(t, b, harbor, "2026-10-06", 20000)
	apApply(t, b, credit, partPaid, "2026-10-20", 12000)
	apRefund(t, b, harbor, "2026-10-25", map[string]int{credit.Id: 3000})
	paid := apBill(t, b, harbor, "2026-08-10", "2026-09-09", 20000)
	apPayBills(t, b, harbor, "2026-09-12", map[string]int{paid.Id: 20000})
	voided := apBill(t, b, harbor, "2026-08-12", "2026-09-11", 30000)
	if err := voidBillAs(b.app, voided.Id, admin); err != nil {
		t.Fatalf("void the bill: %v", err)
	}
	twoLines := postJournal(t, b.app, "", "2026-09-03", "Two A/P lines",
		jnLine{account: b.payable, credit: 5000, position: 0, vendor: harbor.Id},
		jnLine{account: b.payable, credit: 7000, position: 1, vendor: harbor.Id},
		jnLine{account: b.expense, debit: 12000, position: 2})
	if err := setStatus(b.app, twoLines.Id, statusVoid, admin); err != nil {
		t.Fatalf("void the entry: %v", err)
	}

	// Cascade: a void bill payment, a void refund, a manual entry and the
	// corrections of a bill, a bill payment and a vendor credit.
	open := apBill(t, b, cascade, "2026-08-04", "2026-09-03", 40000)
	voidedPay := apPayBills(t, b, cascade, "2026-09-10", map[string]int{open.Id: 25000})
	if err := voidBillPaymentAs(b.app, voidedPay.Id, admin); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	apJournal(t, b, "2026-09-01", cascade, 0, 31000)
	corrected := apBill(t, b, cascade, billDay, billDueDay, 50000)
	original := apPayBills(t, b, cascade, "2026-11-10", map[string]int{corrected.Id: 20000})
	b.pay(t, cascade, map[string]any{"replaces": original.Id, "date": "2026-11-10", "paid_from": b.bank.Id},
		payLine{corrected, 25000}, payLine{open, 5000})
	cascadeCredit := apVendorCredit(t, b, cascade, vendorCreditDay, 42500)
	apApply(t, b, cascadeCredit, corrected, applyDay, 10000)
	apRefund(t, b, cascade, refundDay, map[string]int{cascadeCredit.Id: 15000})
	voidedRefund := apRefund(t, b, cascade, refundDay, map[string]int{cascadeCredit.Id: 1000})
	if err := voidRefundAs(b.app, voidedRefund.Id, admin); err != nil {
		t.Fatalf("void the refund: %v", err)
	}
	mustPostBill(t, b.app, b.billCorrectionOf(t, corrected, cascade, 45000).Id, b.users.bookkeeper.Id)
	mustPostVendorCredit(t, b.app, b.creditCorrectionOf(t, cascadeCredit, cascade, billAmount{b.expense, 40000}).Id, b.users.bookkeeper.Id)

	// A line with no vendor.
	apJournal(t, b, "2026-09-02", nil, 0, 12000)
	return []*core.Record{harbor, cascade}
}

func TestPayableItemsTieToPartyBalances(t *testing.T) {
	b := newAPBook(t)
	vendors := apTieBook(t, b)
	requireNoPayableDrift(t, b.app)

	rows := apRows(t, b.app, "")
	balances := partyBalances(t, b.app)
	for _, v := range vendors {
		got := apOwed(apWhere(rows, func(r apRow) bool { return r.vendor == v.Id }))
		if want, ok := balances[v.Id]; !ok || got != want {
			t.Errorf("%s: the stored rows add up to %d owed, want its books_party_balances balance %d (found %v)",
				v.GetString("display_name"), got, want, ok)
		}
	}

	months, err := b.app.FindAllRecords("books_account_balances", dbx.HashExp{"account": b.payable.Id})
	if err != nil {
		t.Fatalf("read the Accounts payable balances: %v", err)
	}
	ledger := 0
	for _, m := range months {
		ledger += m.GetInt("credit_total") - m.GetInt("debit_total")
	}
	if got := apOwed(rows); got != ledger || ledger == 0 {
		t.Errorf("every stored row adds up to %d owed, want the credit balance of Accounts payable %d", got, ledger)
	}
}

func TestPayableItemsAccess(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
	application := apApply(t, b, credit, bill, "2026-10-20", 12000)

	rows := "/api/collections/" + payableItemsCollection + "/records"
	creditRow := rows + "/" + application.Id + "c"
	for _, c := range []struct {
		name    string
		user    *core.Record
		url     string
		want    int
		content []string
	}{
		{"a reader lists the rows", b.reader, rows, http.StatusOK, []string{`"totalItems":4`}},
		{"a user without Books access lists none", b.none, rows, http.StatusOK, []string{`"totalItems":0`}},
		{"a reader reads the 16-character application_credit row", b.reader, creditRow, http.StatusOK,
			[]string{`"id":"` + application.Id + `c"`, `"source":"application_credit"`, `"credit":12000`}},
		{"a user without Books access reads no row", b.none, creditRow, http.StatusNotFound, nil},
	} {
		status, body := b.rest(t).send(t, c.user, http.MethodGet, c.url, "")
		if status != c.want {
			t.Errorf("%s: status = %d, want %d; body: %s", c.name, status, c.want, body)
			continue
		}
		for _, want := range c.content {
			if !strings.Contains(body, want) {
				t.Errorf("%s: body has no %q: %s", c.name, want, body)
			}
		}
	}
}

// apEngineSpec is the engine pin of spec §4.3: the stored rows grouped by the
// vendor link, what is owed summed, and a group label read through the link.
func apEngineSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.payable_items",
		Columns: []reports.Column{
			{ID: "owed", Label: "Owed", Formula: op("sum", op("sub", fld("credit"), fld("debit")))},
			{ID: "vendorKey", Label: "Vendor", Hidden: true, Path: reports.Path{{Link: "vendor"}}},
		},
		Groups: []reports.Group{
			{ID: "byVendor", Col: "vendorKey", Label: op("coalesce", rec("byVendor", "display_name"), lit("No vendor"))},
		},
	}
}

// apEntrySpec lists the stored rows with the number of each row's entry, read
// through the entry link.
func apEntrySpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.payable_items",
		Columns: []reports.Column{
			{ID: "entryNo", Label: "Entry", Formula: fld("entry", "number")},
		},
	}
}

func TestPayableItemsEngine(t *testing.T) {
	b := newAPBook(t)
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	if reason, refused := reports.Refused(b.app)["books.payable_items"]; refused {
		t.Fatalf("books.payable_items refused: %s", reason)
	}
	accepted := slices.ContainsFunc(reports.Sources(b.app), func(s reports.Source) bool { return s.Key == "books.payable_items" })
	if !accepted {
		t.Fatal("source books.payable_items is not registered and accepted")
	}

	v := apVendor(t, b, "Harbor Freight Logistics")
	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	billNumber, _ := apEntry(t, b, bill.GetString("entry"))

	run := func(spec *reports.Spec, user *core.Record) *reports.Result {
		t.Helper()
		loaded, info, err := reports.Load(mustJSON(spec))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if err := reports.Validate(b.app, loaded); err != nil {
			t.Fatalf("Validate: %v", err)
		}
		res, err := reports.Run(context.Background(), b.app, reports.Request{Spec: loaded, Loaded: info, Auth: user})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		return res
	}

	res := run(apEngineSpec(), b.reader)
	groups := map[string]int64{}
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup {
			continue
		}
		owed, _ := moneyCell(t, r, "owed")
		groups[r.Label] = owed
	}
	if want := map[string]int64{"Harbor Freight Logistics": 86000}; fmt.Sprint(groups) != fmt.Sprint(want) {
		t.Errorf("group rows = %v, want %v (the bill's figure on its vendor)", groups, want)
	}
	if !slices.Contains(res.Topics, "collection/"+payableItemsCollection) {
		t.Errorf("topics = %v, want collection/%s", res.Topics, payableItemsCollection)
	}

	numbers := []string{}
	for _, r := range run(apEntrySpec(), b.reader).Rows {
		if r.Kind == reports.KindDetail {
			numbers = append(numbers, fmt.Sprint(r.Cells["entryNo"]))
		}
	}
	if !slices.Equal(numbers, []string{billNumber}) {
		t.Errorf("the rows' entry numbers = %v, want [%s] (the bill's entry, read through the entry link)", numbers, billNumber)
	}

	for _, r := range run(apEngineSpec(), b.none).Rows {
		if r.Kind == reports.KindGroup {
			t.Errorf("a user with Books level none sees group row %q", r.Label)
		}
	}
}
