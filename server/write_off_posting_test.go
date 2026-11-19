package books

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// Posting a write-off (write-off spec §4.3): the create posts one numbered
// entry of doc type write_off through postDocument, a debit of the amount to
// the chosen account and a credit to the Accounts receivable account the
// invoice's entry debited, both naming the customer, and lowers the invoice's
// balance and raises its written_off by the amount in one save. The void posts
// the reversal in the original period and puts both back.

func requireWriteOffEntry(t testing.TB, we *writeOffEnv, wo *core.Record, account, receivable *core.Record, amount int) {
	t.Helper()
	entryID := wo.GetString("entry")
	if entryID == "" {
		t.Fatal("the posted write-off names no entry")
	}
	entry := reload(t, we.app, "books_journal_entries", entryID)
	if got, want := [7]string{
		entry.GetString("status"), entry.GetString("doc_type"), entry.GetString("origin"),
		entry.GetString("document"), entry.GetString("number"), entry.GetString("date"), entry.GetString("memo"),
	}, [7]string{statusPosted, "write_off", "document", wo.Id, "1001", wo.GetString("date"), wo.GetString("memo")}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number/date/memo = %v, want %v", got, want)
	}
	c := wo.GetString("customer")
	want := []entryLine{
		{account: account.Id, debit: amount, customer: c},
		{account: receivable.Id, credit: amount, customer: c},
	}
	if got := entryLinesOf(t, we.app, entryID); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines =\n%v\nwant\n%v", got, want)
	}
}

// customerOpen is the customer's open figure: the posted Accounts receivable
// lines that name the customer, debit − credit.
func customerOpen(t testing.TB, app core.App, customer *core.Record) int {
	t.Helper()
	var row struct {
		Net int `db:"net"`
	}
	err := app.DB().NewQuery(`
		SELECT CAST(COALESCE(SUM(l.debit - l.credit), 0) AS INTEGER) AS net
		FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account
		WHERE l.posted = 1 AND a.type = 'accounts_receivable' AND l.customer = {:c}`).
		Bind(dbx.Params{"c": customer.Id}).One(&row)
	if err != nil {
		t.Fatalf("add the customer's receivable lines: %v", err)
	}
	return row.Net
}

func setWrittenOffRaw(t testing.TB, app core.App, id string, writtenOff int) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_invoices SET written_off = {:w} WHERE id = {:id}").
		Bind(dbx.Params{"w": writtenOff, "id": id}).Execute(); err != nil {
		t.Fatalf("set invoice %s written_off %d: %v", id, writtenOff, err)
	}
}

func TestWriteOffPost_WritesTheEntryTheStampsAndTheBalance(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	invoiceNext := nextInvoiceNumber(t, we.app)

	wo := we.mkWriteOff(t, inv, nil)
	if got, want := [3]any{wo.GetString("status"), wo.GetString("number"), wo.GetInt("sequence")},
		[3]any{statusPosted, "1001", 1001}; got != want {
		t.Errorf("write-off status/number/sequence = %v, want %v", got, want)
	}
	if got, want := [3]string{wo.GetString("customer"), wo.GetString("currency"), wo.GetString("posted_by")},
		[3]string{we.customer.Id, "USD", we.actor}; got != want {
		t.Errorf("write-off customer/currency/posted_by = %v, want %v", got, want)
	}
	if wo.GetString("posted_at") == "" || wo.GetString("sort_key") == "" {
		t.Errorf("write-off posted_at %q sort_key %q, want both set", wo.GetString("posted_at"), wo.GetString("sort_key"))
	}
	if got := reload(t, we.app, "books_doc_sequences", writeOffSequence).GetInt("next_number"); got != 1002 {
		t.Errorf("write-off sequence next_number = %d after the post, want 1002", got)
	}
	if got := nextInvoiceNumber(t, we.app); got != invoiceNext {
		t.Errorf("invoice sequence next_number = %d after a write-off, want %d (untouched)", got, invoiceNext)
	}
	if n, err := we.app.CountRecords("books_journal_entries", dbx.HashExp{"document": wo.Id}); err != nil || n != 1 {
		t.Errorf("%d entries name the write-off (err %v), want 1", n, err)
	}
	requireWriteOffEntry(t, we, wo, we.badDebts, we.receivable, 50000)
	requireWrittenOff(t, we.app, inv, 0, 50000)
	requireInvoiceStatus(t, we.app, inv, statusPosted)
	requireNoDrift(t, we.app)
	requireNoDocumentDrift(t, we.app)
}

// The credit goes to the receivable the invoice's entry debited, not to the
// first Accounts receivable account of the chart.
func TestWriteOffPost_CreditsTheInvoicesReceivable(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	// 1050 sorts before 1100, so the first receivable of the chart is now 1050.
	first := mkNumberedAccount(t, we.app, "Other receivables", "1050", "accounts_receivable", "accounts_receivable")

	wo := we.mkWriteOff(t, inv, map[string]any{"account": we.otherExpense.Id})
	requireWriteOffEntry(t, we, wo, we.otherExpense, we.receivable, 50000)
	if n, err := we.app.CountRecords("books_journal_lines", dbx.HashExp{"account": first.Id}); err != nil || n != 0 {
		t.Errorf("%d journal lines on 1050 Other receivables (err %v), want 0", n, err)
	}
}

// A void writes the void reversal in the original period, keeps the number and
// opens the invoice again; the General Ledger reads Type "Write-off" on the
// write-off's entry and "Void reversal of 1001" on its reversal.
func TestWriteOffVoid_ReversesKeepsTheNumberAndRestoresTheBalance(t *testing.T) {
	we := newWriteOffEnv(t)
	registerBooksSources(t)
	inv := we.postedInvoice(t, 50000)
	wo := we.mkWriteOff(t, inv, nil)
	entryID := wo.GetString("entry")
	before := customerOpen(t, we.app, we.customer)

	if err := voidWriteOffAs(we.app, wo.Id, we.users.admin.Id); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	voided := reload(t, we.app, writeOffsTable, wo.Id)
	if got, want := [3]string{voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by")},
		[3]string{statusVoid, "1001", we.users.admin.Id}; got != want {
		t.Errorf("write-off status/number/voided_by = %v, want %v", got, want)
	}
	if voided.GetString("voided_at") == "" {
		t.Error("the void write-off has no voided_at")
	}
	if s := reload(t, we.app, "books_journal_entries", entryID).GetString("status"); s != statusVoid {
		t.Errorf("the write-off's entry status %q, want void", s)
	}
	rev := findReversal(t, we.app, entryID)
	if got, want := [4]string{rev.GetString("origin"), rev.GetString("doc_type"), rev.GetString("number"), rev.GetString("date")},
		[4]string{originVoidReversal, "write_off", "1001", writeOffDay}; got != want {
		t.Errorf("reversal origin/doc_type/number/date = %v, want %v", got, want)
	}
	c := we.customer.Id
	wantRev := []entryLine{
		{account: we.badDebts.Id, credit: 50000, customer: c},
		{account: we.receivable.Id, debit: 50000, customer: c},
	}
	if got := entryLinesOf(t, we.app, rev.Id); fmt.Sprint(got) != fmt.Sprint(wantRev) {
		t.Errorf("reversal lines =\n%v\nwant\n%v", got, wantRev)
	}
	requireWrittenOff(t, we.app, inv, 50000, 0)
	if got := customerOpen(t, we.app, we.customer); got != before+50000 {
		t.Errorf("customer open figure after the void = %d, want %d (back up by 50000)", got, before+50000)
	}
	requireNoDrift(t, we.app)
	requireNoDocumentDrift(t, we.app)

	res := runGL(t, we.app, we.users.readOnly, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}, reports.Options{Today: glToday})
	type cols struct{ typ, number, name string }
	read := func(row reports.Row) cols {
		return cols{typ: textCell(t, row, "type"), number: textCell(t, row, "number"), name: textCell(t, row, "name")}
	}
	for _, w := range []struct {
		what  string
		entry string
		want  cols
	}{
		{"the write-off's bad debts line", entryID, cols{"Write-off", "1001", "Harborview Dental"}},
		{"the void reversal's bad debts line", rev.Id, cols{"Void reversal of 1001", "1001", "Harborview Dental"}},
	} {
		if got := read(lineRow(t, res, entryLineOn(t, we.app, w.entry, we.badDebts))); got != w.want {
			t.Errorf("%s = %+v, want %+v", w.what, got, w.want)
		}
	}
}

// A payment's void leaves the write-off posted and opens the invoice for the
// payment's amount, which a second write-off takes; written_off is the sum.
func TestWriteOff_APaymentVoidOpensTheInvoiceForASecondWriteOff(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	payment := we.pay(t, inv, writeOffDay, 10000)
	first := we.mkWriteOff(t, inv, nil)
	if got := first.GetInt("amount"); got != 40000 {
		t.Fatalf("the first write-off took %d, want 40000 (the balance after the payment)", got)
	}
	requireWrittenOff(t, we.app, inv, 0, 40000)

	if err := voidPaymentAs(we.app, payment.Id, we.actor); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	requireWrittenOff(t, we.app, inv, 10000, 40000)
	if s := reload(t, we.app, writeOffsTable, first.Id).GetString("status"); s != statusPosted {
		t.Errorf("the first write-off status %q after the payment's void, want posted", s)
	}

	second := we.mkWriteOff(t, inv, map[string]any{"amount": 10000})
	if second.GetString("number") != "1002" {
		t.Errorf("the second write-off number %q, want 1002", second.GetString("number"))
	}
	requireWrittenOff(t, we.app, inv, 0, 50000)
	requireNoDrift(t, we.app)
	requireNoDocumentDrift(t, we.app)
}

func TestWriteOffPost_HonorsTheCloseDate(t *testing.T) {
	t.Run("refused without an override", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		setCloseDate(t, we.app, writeOffDay)
		_, err := we.newWriteOff(inv, nil)
		if err == nil {
			t.Fatal("a write-off dated on the close date was posted with no override")
		}
		requireWriteOffCount(t, we.app, 0)
		requireWrittenOff(t, we.app, inv, 50000, 0)
		if got := reload(t, we.app, "books_doc_sequences", writeOffSequence).GetInt("next_number"); got != 1001 {
			t.Errorf("write-off sequence next_number = %d after a refused post, want 1001", got)
		}
	})

	t.Run("taken with an override", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		setCloseDate(t, we.app, writeOffDay)
		ov := grantOverride(t, we.app, we.users.bookkeeper, time.Now().Add(time.Hour))
		wo := we.mkWriteOff(t, inv, nil)
		if got := wo.GetString("close_override"); got != ov.Id {
			t.Errorf("write-off close_override = %q, want the override %s", got, ov.Id)
		}
		if got := reload(t, we.app, "books_journal_entries", wo.GetString("entry")).GetString("close_override"); got != ov.Id {
			t.Errorf("entry close_override = %q, want the override %s", got, ov.Id)
		}
		requireWrittenOff(t, we.app, inv, 0, 50000)
	})

	t.Run("its void in a closed period is refused", func(t *testing.T) {
		we := newWriteOffEnv(t)
		inv := we.postedInvoice(t, 50000)
		wo := we.mkWriteOff(t, inv, nil)
		setCloseDate(t, we.app, "2026-11-30")
		requireRefused(t, voidWriteOffAs(we.app, wo.Id, we.actor), "closed through")
		if s := reload(t, we.app, writeOffsTable, wo.Id).GetString("status"); s != statusPosted {
			t.Errorf("write-off status %q after the refused void, want posted", s)
		}
		requireWrittenOff(t, we.app, inv, 0, 50000)
	})
}

// The balance verify reads the write-off payer and compares written_off with
// the posted write-offs; each drift names the field it found wrong, and the
// rebuild repairs written_off as it repairs balance.
func TestVerifyDocumentBalances_ReadsTheWriteOffs(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	voidedInv := we.postedInvoice(t, 20000)
	we.mkWriteOff(t, inv, nil)
	voided := we.mkWriteOff(t, voidedInv, nil)
	if err := voidWriteOffAs(we.app, voided.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	if drifts, err := verifyDocumentBalances(we.app); err != nil || len(drifts) != 0 {
		t.Fatalf("verifyDocumentBalances with a posted and a void write-off = %+v, err %v; want none", drifts, err)
	}

	setWrittenOffRaw(t, we.app, inv.Id, 1234)
	drifts, err := verifyDocumentBalances(we.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || drifts[0].Document != inv.Id || drifts[0].Field != "written_off" || drifts[0].Kind != "invoice" ||
		drifts[0].Stored != 1234 || drifts[0].Want != 50000 {
		t.Fatalf("drifts = %+v, want one invoice drift of written_off on %s, stored 1234, want 50000", drifts, inv.Id)
	}
	if fixed, err := rebuildDocumentBalances(we.app); err != nil || fixed != 1 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
	}
	requireWrittenOff(t, we.app, inv, 0, 50000)
	requireWrittenOff(t, we.app, voidedInv, 20000, 0)
	if drifts, err := verifyDocumentBalances(we.app); err != nil || len(drifts) != 0 {
		t.Fatalf("after the rebuild: %+v, err %v; want none", drifts, err)
	}

	setInvoiceBalanceRaw(t, we.app, inv.Id, 50000)
	drifts, err = verifyDocumentBalances(we.app)
	if err != nil {
		t.Fatalf("verifyDocumentBalances: %v", err)
	}
	if len(drifts) != 1 || drifts[0].Document != inv.Id || drifts[0].Field != "balance" || drifts[0].Want != 0 {
		t.Fatalf("drifts = %+v, want one drift of balance on %s that wants 0", drifts, inv.Id)
	}
	if fixed, err := rebuildDocumentBalances(we.app); err != nil || fixed != 1 {
		t.Fatalf("rebuildDocumentBalances fixed %d, err %v; want 1", fixed, err)
	}
	requireWrittenOff(t, we.app, inv, 0, 50000)
}

// A void write-off stays on the original invoice when it is corrected, as a
// void payment's application does: moveLinesWhere moves no write-off.
func TestInvoiceCorrection_LeavesAVoidWriteOffOnTheOriginal(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	wo := we.mkWriteOff(t, inv, nil)
	if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	draft := we.correctionDraft(t, inv, 45000)

	corrected := mustPostInvoice(t, we.app, draft.Id, we.actor)
	if got := reload(t, we.app, writeOffsTable, wo.Id).GetString("invoice"); got != inv.Id {
		t.Errorf("the void write-off names invoice %q after the correction, want the original %q", got, inv.Id)
	}
	requireWrittenOff(t, we.app, corrected, 45000, 0)
	// The corrected original is void: Books clears a void document's balance,
	// and its written_off counts only posted write-offs.
	requireWrittenOff(t, we.app, inv, 0, 0)
	requireNoDocumentDrift(t, we.app)
}

// The customer's open figure is the posted receivable lines that name the
// customer: it falls by the write-off with no change to the party balances.
func TestWriteOff_TheCustomersOpenFigureFollows(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := we.postedInvoice(t, 50000)
	we.pay(t, inv, writeOffDay, 10000)
	if got := customerOpen(t, we.app, we.customer); got != 40000 {
		t.Fatalf("customer open figure before the write-off = %d, want 40000", got)
	}
	wo := we.mkWriteOff(t, inv, nil)
	if got := customerOpen(t, we.app, we.customer); got != 0 {
		t.Errorf("customer open figure after the write-off = %d, want 0", got)
	}
	if err := voidWriteOffAs(we.app, wo.Id, we.actor); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	if got := customerOpen(t, we.app, we.customer); got != 40000 {
		t.Errorf("customer open figure after the void = %d, want 40000", got)
	}
}

// salesReportRows runs Sales by Customer, Sales by Product and Sales Tax
// Liability (Accrual) over November and gives their rows as JSON.
func salesReportRows(t *testing.T, we *writeOffEnv) map[string]string {
	t.Helper()
	november := map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}
	opts := reports.Options{Today: stlToday}
	reader := we.users.readOnly
	out := map[string]string{}
	for name, res := range map[string]*reports.Result{
		"Sales by Customer":   runSales(t, we.app, reader, salesByCustomerKey, november, opts),
		"Sales by Product":    runSales(t, we.app, reader, salesByProductKey, november, opts),
		"Sales Tax Liability": runSTL(t, we.app, reader, november, opts),
	} {
		raw, err := json.Marshal(res.Rows)
		if err != nil {
			t.Fatalf("encode the rows of %s: %v", name, err)
		}
		if len(res.Rows) == 0 {
			t.Fatalf("%s has no rows for the invoice", name)
		}
		out[name] = string(raw)
	}
	return out
}

// A write-off is no sale line and writes no tax line (Q2): the sales reports
// read the same rows before and after it.
func TestWriteOff_SalesReportsAreUnchanged(t *testing.T) {
	we := newWriteOffEnv(t)
	registerBooksSources(t)
	draft, err := newInvoice(we.app, we.customer, map[string]any{"date": "2026-11-04", "due_date": "2026-11-04", "tax_rate": we.denver.Id})
	if err != nil {
		t.Fatalf("save a taxed draft invoice: %v", err)
	}
	mkInvoiceLine(t, we.app, draft, 0, item(we.service, 1, 50000, true))
	inv := mustPostInvoice(t, we.app, draft.Id, we.actor)
	we.pay(t, inv, writeOffDay, 10000)

	before := salesReportRows(t, we)
	we.mkWriteOff(t, inv, nil)
	after := salesReportRows(t, we)
	for name, rows := range before {
		if after[name] != rows {
			t.Errorf("%s rows changed by the write-off:\nbefore %s\nafter  %s", name, rows, after[name])
		}
	}
}
