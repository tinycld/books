package books

import (
	"fmt"
	"net/http"
	"sort"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The card mark of a payment's entry (1099 report spec §3 "Card payments",
// §4 "New field"): posting an expense, a bill payment or a vendor refund marks
// its journal entry card_payment when the document's payment method is Credit
// card or Debit card, or its payment account (Paid from; a refund's Refunded
// to) is a credit card account. A reversal carries its target's mark. Every
// other entry is false, and no client sets the field.

// entryCardPayment reads an entry's card mark. It fails when the schema has no
// card_payment field, so a missing field is not read as false.
func entryCardPayment(t testing.TB, app core.App, entryID string) bool {
	t.Helper()
	if entryID == "" {
		t.Fatal("the document names no entry")
	}
	entry := reload(t, app, "books_journal_entries", entryID)
	if entry.Collection().Fields.GetByName("card_payment") == nil {
		t.Fatal("books_journal_entries has no field card_payment")
	}
	return entry.GetBool("card_payment")
}

// cardCase is one row of the method and account table: the payment method, the
// payment account, and the mark its entry must carry.
type cardCase struct {
	name    string
	method  string
	card    bool // the payment account is the credit card account
	want    bool
	account func() *core.Record
}

// cardTable is the table of spec §3 "Card payments" over a bank account and a
// credit card account.
func cardTable(bank, card *core.Record) []cardCase {
	onBank := func() *core.Record { return bank }
	onCard := func() *core.Record { return card }
	return []cardCase{
		{name: "check from a bank account", method: "check", want: false, account: onBank},
		{name: "cash from a bank account", method: "cash", want: false, account: onBank},
		{name: "bank transfer from a bank account", method: "bank_transfer", want: false, account: onBank},
		{name: "other from a bank account", method: "other", want: false, account: onBank},
		{name: "credit card from a bank account", method: "credit_card", want: true, account: onBank},
		{name: "debit card from a bank account", method: "debit_card", want: true, account: onBank},
		{name: "check from a credit card account", method: "check", card: true, want: true, account: onCard},
	}
}

// The expense and the bill payment require a payment method (their schema
// refuses none), so "no method" is held on isCardPayment itself; the vendor
// refund, whose method is optional, posts with none.
func requireNoMethodIsNotCard(t *testing.T, app core.App, bank *core.Record) {
	t.Helper()
	got, err := isCardPayment(app, "", bank.Id)
	if err != nil {
		t.Fatalf("isCardPayment with no method from a bank account: %v", err)
	}
	if got {
		t.Error("isCardPayment with no method from a bank account = true, want false")
	}
}

func TestCardPaymentOnExpense(t *testing.T) {
	ee := newExpenseEnv(t)
	for _, c := range cardTable(ee.checking1000, ee.card2100) {
		t.Run(c.name, func(t *testing.T) {
			exp := ee.mkExpense(t, map[string]any{
				"vendor": ee.summit.Id, "payment_method": c.method, "paid_from": c.account().Id,
			})
			mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
			posted := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)
			if got := entryCardPayment(t, ee.app, posted.GetString("entry")); got != c.want {
				t.Errorf("expense by %s: entry card_payment = %v, want %v", c.name, got, c.want)
			}
		})
	}
	t.Run("no method from a bank account", func(t *testing.T) {
		requireNoMethodIsNotCard(t, ee.app, ee.checking1000)
	})
}

func TestCardPaymentOnBillPayment(t *testing.T) {
	bp := newBillPayEnv(t)
	for _, c := range cardTable(bp.checking1000, bp.card2100) {
		t.Run(c.name, func(t *testing.T) {
			bill := bp.postedBill(t, bp.summit, 10000)
			p := bp.pay(t, bp.summit, map[string]any{"payment_method": c.method, "paid_from": c.account().Id},
				payLine{bill, 10000})
			if got := entryCardPayment(t, bp.app, p.GetString("entry")); got != c.want {
				t.Errorf("bill payment by %s: entry card_payment = %v, want %v", c.name, got, c.want)
			}
		})
	}
	t.Run("no method from a bank account", func(t *testing.T) {
		requireNoMethodIsNotCard(t, bp.app, bp.checking1000)
	})
}

func TestCardPaymentOnVendorRefund(t *testing.T) {
	re := newRefundEnv(t)
	table := append(cardTable(re.checking1000, re.card2100),
		cardCase{name: "no method to a bank account", method: "", want: false, account: func() *core.Record { return re.checking1000 }})
	for _, c := range table {
		t.Run(c.name, func(t *testing.T) {
			credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 10000})
			refund := re.refund(t, map[string]any{"payment_method": c.method, "refunded_to": c.account().Id},
				refundLine{credit, 10000})
			if got := entryCardPayment(t, re.app, refund.GetString("entry")); got != c.want {
				t.Errorf("vendor refund by %s: entry card_payment = %v, want %v", c.name, got, c.want)
			}
		})
	}
}

// Only the three payment documents carry the mark: a bill, a vendor credit, a
// vendor credit application, a manual journal entry, an invoice and a customer
// payment by credit card all post entries with card_payment false.
func TestCardPaymentOnOtherEntries(t *testing.T) {
	t.Run("purchases and journal entries", func(t *testing.T) {
		b := newEBVBook(t)
		bill := apBill(t, b.apBook, b.summit, "2026-11-01", "2026-11-30", 30000)
		credit := apVendorCredit(t, b.apBook, b.summit, "2026-11-02", 5000)
		before := allEntryIDs(t, b.app)
		apApply(t, b.apBook, credit, bill, "2026-11-03", 5000)
		applied := newEntryIDs(t, b.app, before)
		journal := b.postEntry(t, "2026-11-04", b.summit, b.software, 2500)

		named := map[string]string{
			"the bill's entry":          reload(t, b.app, "books_bills", bill.Id).GetString("entry"),
			"the vendor credit's entry": reload(t, b.app, "books_vendor_credits", credit.Id).GetString("entry"),
			"the manual journal entry":  journal.Id,
		}
		// An application writes no entry of its own: its cash rows point at the
		// vendor credit's entry, which is checked below. A later change that
		// gives applications an entry fails here, so its mark gets checked.
		if len(applied) != 0 {
			t.Errorf("the vendor credit application wrote entries %v, want none (its cash rows name the vendor credit's entry)", applied)
		}
		for what, id := range named {
			if entryCardPayment(t, b.app, id) {
				t.Errorf("%s: card_payment = true, want false", what)
			}
		}
	})

	t.Run("an invoice and a customer payment by credit card", func(t *testing.T) {
		pe := newPaymentEnv(t)
		inv := pe.postedInvoice(t, pe.customer, 30000)
		p := pe.mkPayment(t, map[string]any{
			"amount": 30000, "deposit_to": pe.checking.Id, "payment_method": "credit_card",
		})
		mkApplication(t, pe.app, p, inv, 0, 30000)
		posted := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id)
		for what, id := range map[string]string{
			"the invoice's entry":                        reload(t, pe.app, "books_invoices", inv.Id).GetString("entry"),
			"the customer payment's entry (credit card)": posted.GetString("entry"),
		} {
			if entryCardPayment(t, pe.app, id) {
				t.Errorf("%s: card_payment = true, want false", what)
			}
		}
	})
}

func allEntryIDs(t testing.TB, app core.App) map[string]bool {
	t.Helper()
	recs, err := app.FindAllRecords("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]bool{}
	for _, r := range recs {
		out[r.Id] = true
	}
	return out
}

func newEntryIDs(t testing.TB, app core.App, before map[string]bool) []string {
	t.Helper()
	var out []string
	for id := range allEntryIDs(t, app) {
		if !before[id] {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// A void's reversal and a correction's reversal of the original carry the
// original entry's mark; the correction's own entry has its own.
func TestCardPaymentOnVoidAndCorrection(t *testing.T) {
	type expenseOf func(t *testing.T, ee *expenseEnv) *core.Record
	posted := func(method string) expenseOf {
		return func(t *testing.T, ee *expenseEnv) *core.Record {
			t.Helper()
			exp := ee.mkExpense(t, map[string]any{"vendor": ee.summit.Id, "payment_method": method})
			mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
			return mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id)
		}
	}

	for _, c := range []struct {
		name   string
		method string
		want   bool
	}{
		{"a voided card expense", "credit_card", true},
		{"a voided check expense", "check", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			ee := newExpenseEnv(t)
			exp := posted(c.method)(t, ee)
			entryID := exp.GetString("entry")
			if err := voidExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id); err != nil {
				t.Fatalf("void the expense: %v", err)
			}
			rev := findReversal(t, ee.app, entryID)
			if got := entryCardPayment(t, ee.app, rev.Id); got != c.want {
				t.Errorf("%s: the reversal's card_payment = %v, want %v", c.name, got, c.want)
			}
			if got := entryCardPayment(t, ee.app, entryID); got != c.want {
				t.Errorf("%s: the voided entry's card_payment = %v, want %v", c.name, got, c.want)
			}
		})
	}

	for _, c := range []struct {
		name                  string
		from, to              string
		wantReversal, wantNew bool
	}{
		{"a card expense corrected to a check", "credit_card", "check", true, false},
		{"a check expense corrected to a card", "check", "credit_card", false, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			ee := newExpenseEnv(t)
			original := posted(c.from)(t, ee)
			originalEntry := original.GetString("entry")
			draft := ee.mkExpense(t, map[string]any{
				"vendor": ee.summit.Id, "payment_method": c.to, "replaces": original.Id,
			})
			mkExpenseLine(t, ee.app, draft, 0, accountLine(ee.software, 15000))
			corrected := mustPostExpense(t, ee.app, draft.Id, ee.users.bookkeeper.Id)

			rev := findReversal(t, ee.app, originalEntry)
			if got := entryCardPayment(t, ee.app, rev.Id); got != c.wantReversal {
				t.Errorf("%s: the reversal of the original's entry has card_payment = %v, want %v", c.name, got, c.wantReversal)
			}
			if got := entryCardPayment(t, ee.app, corrected.GetString("entry")); got != c.wantNew {
				t.Errorf("%s: the correction's entry has card_payment = %v, want %v", c.name, got, c.wantNew)
			}
		})
	}
}

// card_payment is the server's: a client create or update that names it is
// refused, also as a Books admin; a create without it passes as before.
func TestCardPaymentIsServerOwned(t *testing.T) {
	const draft = `"date":"2026-05-01","doc_type":"journal","status":"draft","origin":"manual"`
	t.Run("a create without card_payment", func(t *testing.T) {
		app := newBooksApp(t)
		users := newLevelUsers(t, app)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_journal_entries/records",
			token: tokenFor(t, users.admin), body: `{` + draft + `}`, want: http.StatusOK,
		}.run(t, app)
	})
	for _, value := range []string{"true", "false"} {
		t.Run("a create with card_payment "+value, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_journal_entries/records",
				token: tokenFor(t, users.admin), body: `{` + draft + `,"card_payment":` + value + `}`,
				want: http.StatusBadRequest,
				after: func(t testing.TB, app *tests.TestApp) {
					if n, err := app.CountRecords("books_journal_entries"); err != nil || n != 0 {
						t.Errorf("%d entries stored after the refused create (err %v), want 0", n, err)
					}
				},
			}.run(t, app)
		})
	}
	for _, c := range []struct {
		name string
		pick func(r ledgerRows) string
		body string
	}{
		{"an update of a draft that sets card_payment", func(r ledgerRows) string { return r.draft.Id }, `{"card_payment":true}`},
		{"a void that sets card_payment", func(r ledgerRows) string { return r.posted.Id }, `{"status":"void","card_payment":true}`},
	} {
		t.Run(c.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			rows := seedLedgerRows(t, app)
			id := c.pick(rows)
			apiReq{
				method: http.MethodPatch, url: "/api/collections/books_journal_entries/records/" + id,
				token: tokenFor(t, users.admin), body: c.body, want: http.StatusNotFound,
				after: func(t testing.TB, app *tests.TestApp) {
					if entryCardPayment(t, app, id) {
						t.Error("card_payment = true after the refused update, want false")
					}
				},
			}.run(t, app)
		})
	}
}

// An account id that names no account is an error, not "not a card". Only the
// direct call reaches that path: every poster reads its account before it asks
// isCardPayment (the expense's Paid from in expensePaidFrom, the bill payment's
// in checkExpensePaidFrom, the refund's in checkRefundAccount), so no post can
// meet isCardPayment's not-found error. The post half pins that the post of an
// expense whose Paid from account is gone is refused at that earlier Paid from
// check and writes no entry.
func TestCardPaymentAccountNotFound(t *testing.T) {
	ee := newExpenseEnv(t)
	if _, err := isCardPayment(ee.app, "check", "zzzzzzzzzzzzzzz"); err == nil {
		t.Error("isCardPayment with an account id that does not exist returned no error, want one")
	}

	exp := ee.mkExpense(t, map[string]any{"vendor": ee.summit.Id, "payment_method": "check", "paid_from": ee.savings1010.Id})
	mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.software, 12500))
	// The Paid from account goes away past every hook, as a row another write
	// removed between the draft and its post.
	if _, err := ee.app.DB().NewQuery("DELETE FROM books_accounts WHERE id = {:id}").
		Bind(dbx.Params{"id": ee.savings1010.Id}).Execute(); err != nil {
		t.Fatalf("remove the Paid from account: %v", err)
	}
	next := nextExpenseNumber(t, ee.app)
	requireFieldRefusal(t, postExpenseAs(ee.app, exp.Id, ee.users.bookkeeper.Id), "paid_from", msgExpensePaidFromType)
	requireExpenseNotPosted(t, ee.app, exp.Id, next)
}

// pinnedPosting is what one document posts, in words: its entry's lines and
// the cash-basis rows that name the entry as their payment entry.
func pinnedPosting(t *testing.T, app core.App, entryID string) []string {
	t.Helper()
	account := func(id string) string {
		a := reload(t, app, "books_accounts", id)
		return a.GetString("number") + " " + a.GetString("name")
	}
	vendor := func(id string) string {
		if id == "" {
			return "no vendor"
		}
		return reload(t, app, "books_vendors", id).GetString("display_name")
	}
	entryName := func(id string) string {
		if id == "" {
			return "no entry"
		}
		e := reload(t, app, "books_journal_entries", id)
		return e.GetString("doc_type") + " " + e.GetString("number")
	}
	var out []string
	for _, l := range entryLinesOf(t, app, entryID) {
		out = append(out, fmt.Sprintf("line %s D%d C%d %s", account(l.account), l.debit, l.credit, vendor(l.vendor)))
	}
	// The cash rows have no order of their own; they are compared sorted.
	var cash []string
	for _, r := range shareRows(t, app, entryID) {
		cash = append(cash, fmt.Sprintf("cash %s %s D%d C%d %s %q of %s", r.kind, account(r.account), r.debit, r.credit,
			r.date, r.memo, entryName(r.entry)))
	}
	sort.Strings(cash)
	out = append(out, cash...)
	return out
}

func requirePinned(t *testing.T, what string, got, want []string) {
	t.Helper()
	if fmt.Sprintf("%q", got) != fmt.Sprintf("%q", want) {
		t.Errorf("%s posts\n%q\nwant (the rows of the tree before the card mark)\n%q", what, got, want)
	}
}

// Pin: the card mark changes no line and no cash-basis row. The rows below were
// recorded on the tree before the change, from these same documents.
func TestCardPaymentChangesNoPosting(t *testing.T) {
	b := newEBVBook(t)

	exp := b.mkExpense(t, map[string]any{
		"vendor": b.officeSupply.Id, "paid_from": b.card2100.Id, "payment_method": "credit_card",
	})
	mkExpenseLine(t, b.app, exp, 0, accountLine(b.designTools, 6418))
	mkExpenseLine(t, b.app, exp, 1, accountLine(b.software, 2500))
	expense := mustPostExpense(t, b.app, exp.Id, b.users.bookkeeper.Id)

	bill := b.postedBillOn(t, b.summit, "2026-11-01", billAmount{b.software, 30000}, billAmount{b.designTools, 12000})
	payment := b.pay(t, b.summit, map[string]any{"payment_method": "credit_card"}, payLine{bill, 21000})

	credit := b.postedCredit(t, b.pacificPower, vendorCreditDay, billAmount{b.rent, 30000})
	refund := b.refund(t, map[string]any{"payment_method": "debit_card"}, refundLine{credit, 10000})

	requirePinned(t, "the card expense", pinnedPosting(t, b.app, expense.GetString("entry")), pinnedExpense)
	requirePinned(t, "the bill payment by credit card", pinnedPosting(t, b.app, payment.GetString("entry")), pinnedBillPayment)
	requirePinned(t, "the vendor refund by debit card", pinnedPosting(t, b.app, refund.GetString("entry")), pinnedVendorRefund)
}

// Recorded 2026-11-22 on books/p5-1099-report@d5355c4c (no card mark).
var (
	pinnedExpense = []string{
		"line 2100 Company Card D0 C8918 Office Supply World",
		"line 6200 Software Subscriptions D2500 C0 Office Supply World",
		"line 6210 Design Tools D6418 C0 Office Supply World",
	}
	pinnedBillPayment = []string{
		"line 2000 Accounts Payable D21000 C0 Summit IT Services",
		"line 1000 Business Checking D0 C21000 Summit IT Services",
		`cash bill 2000 Accounts Payable D0 C21000 2026-11-10 "Bill 1001 paid (cash basis)" of bill_payment 1001`,
		`cash bill 6200 Software Subscriptions D15000 C0 2026-11-10 "Bill 1001 paid (cash basis)" of bill_payment 1001`,
		`cash bill 6210 Design Tools D6000 C0 2026-11-10 "Bill 1001 paid (cash basis)" of bill_payment 1001`,
	}
	pinnedVendorRefund = []string{
		"line 1000 Business Checking D10000 C0 Pacific Power",
		"line 2000 Accounts Payable D0 C10000 Pacific Power",
		`cash vendor_credit 2000 Accounts Payable D10000 C0 2026-11-14 "Vendor credit 1001 refunded (cash basis)" of vendor_refund 1001`,
		`cash vendor_credit 6100 Rent D0 C10000 2026-11-14 "Vendor credit 1001 refunded (cash basis)" of vendor_refund 1001`,
	}
)
