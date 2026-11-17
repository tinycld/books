package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The invoice link on an invoice edit and void (spec §3.10, §4.3, Q18): a
// correction of the invoice moves the link of every credit memo that names the
// original to the correction, and is refused when it changes the customer
// while a draft or posted credit memo names the invoice. A void keeps the
// links.

const wantInvoiceCorrectionCreditMemos = "Credit memos are made from this invoice, so its customer cannot change."

// linkedMemos holds three credit memos that name one posted invoice: a draft,
// a posted and a void one.
type linkedMemos struct {
	invoice               *core.Record
	draft, posted, voided *core.Record
}

// memoNaming saves a draft credit memo of the invoice's customer that names
// the invoice, with one line of amount.
func (ce *creditMemoEnv) memoNaming(t testing.TB, invoice *core.Record, amount int64) *core.Record {
	t.Helper()
	memo := ce.mkCreditMemo(t, map[string]any{"customer": invoice.GetString("customer"), "invoice": invoice.Id})
	mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, amount, false))
	return reload(t, ce.app, "books_credit_memos", memo.Id)
}

// postedMemoNaming posts a credit memo that names the invoice.
func (ce *creditMemoEnv) postedMemoNaming(t testing.TB, invoice *core.Record, amount int64) *core.Record {
	t.Helper()
	memo := ce.memoNaming(t, invoice, amount)
	return mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
}

// voidMemoNaming posts, then voids, a credit memo that names the invoice.
func (ce *creditMemoEnv) voidMemoNaming(t testing.TB, invoice *core.Record, amount int64) *core.Record {
	t.Helper()
	memo := ce.postedMemoNaming(t, invoice, amount)
	if err := voidCreditMemoAs(ce.app, memo.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	return reload(t, ce.app, "books_credit_memos", memo.Id)
}

// invoiceCorrection saves a draft correction of original for customer with one
// line of total.
func (ce *creditMemoEnv) invoiceCorrection(t testing.TB, original, customer *core.Record, total int64) *core.Record {
	t.Helper()
	draft, err := newInvoice(ce.app, customer, map[string]any{"replaces": original.Id})
	if err != nil {
		t.Fatalf("save the invoice correction draft: %v", err)
	}
	mkInvoiceLine(t, ce.app, draft, 0, item(ce.service, 1, total, false))
	return draft
}

func requireMemoInvoice(t testing.TB, app core.App, memo *core.Record, want string) {
	t.Helper()
	if got := reload(t, app, "books_credit_memos", memo.Id).GetString("invoice"); got != want {
		t.Errorf("credit memo %s (%s) names invoice %q, want %q", memo.Id, memo.GetString("status"), got, want)
	}
}

// requireOnlyInvoiceChanged checks that the stored memo differs from before
// only in invoice (and the updated stamp and revision counter a save keeps):
// its status, balance, entry and every other column are as they were.
func requireOnlyInvoiceChanged(t testing.TB, app core.App, before *core.Record, wantInvoice string) {
	t.Helper()
	after := reload(t, app, "books_credit_memos", before.Id)
	if got := after.GetString("invoice"); got != wantInvoice {
		t.Errorf("credit memo %s (%s) names invoice %q, want %q", before.Id, before.GetString("status"), got, wantInvoice)
	}
	for _, field := range []string{"status", "balance", "entry"} {
		if got, want := fmt.Sprint(after.Get(field)), fmt.Sprint(before.Get(field)); got != want {
			t.Errorf("credit memo %s %s = %s after the link moved, want %s", before.Id, field, got, want)
		}
	}
	skip := map[string]bool{"invoice": true, "updated": true, "revision": true}
	for field, was := range before.FieldsData() {
		if skip[field] {
			continue
		}
		if got, want := fmt.Sprint(after.Get(field)), fmt.Sprint(was); got != want {
			t.Errorf("credit memo %s column %s = %s after the link moved, want %s", before.Id, field, got, want)
		}
	}
}

// threeLinkedMemos posts an invoice of Harborview Dental and a draft, a posted
// and a void credit memo that name it.
func (ce *creditMemoEnv) threeLinkedMemos(t testing.TB) linkedMemos {
	t.Helper()
	inv := ce.postedInvoiceFor(t, ce.customer, 45000)
	return linkedMemos{
		invoice: inv,
		draft:   ce.memoNaming(t, inv, 10000),
		posted:  ce.postedMemoNaming(t, inv, 12000),
		voided:  ce.voidMemoNaming(t, inv, 8000),
	}
}

func TestInvoiceCorrection_MovesEveryCreditMemoLink(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	m := ce.threeLinkedMemos(t)
	if m.posted.GetString("entry") == "" || m.posted.GetInt("balance") != 12000 {
		t.Fatalf("posted memo entry %q balance %d, want an entry and balance 12000",
			m.posted.GetString("entry"), m.posted.GetInt("balance"))
	}
	draft := ce.invoiceCorrection(t, m.invoice, ce.customer, 50000)

	corrected := mustPostInvoice(t, ce.app, draft.Id, actor)
	if corrected.GetString("status") != statusPosted || corrected.GetString("number") != m.invoice.GetString("number") {
		t.Fatalf("correction status %q number %q, want posted with the original's number %q",
			corrected.GetString("status"), corrected.GetString("number"), m.invoice.GetString("number"))
	}
	if s := reload(t, ce.app, "books_invoices", m.invoice.Id).GetString("status"); s != statusVoid {
		t.Errorf("original status %q, want void", s)
	}
	for _, memo := range []*core.Record{m.draft, m.posted, m.voided} {
		requireOnlyInvoiceChanged(t, ce.app, memo, corrected.Id)
	}
	requireNoDocumentDrift(t, ce.app)

	// The mark that let the move through is gone: a person's invoice-only
	// change of the posted memo is refused as before.
	err := setFields(t, ce.app, "books_credit_memos", m.posted.Id, map[string]any{"invoice": m.invoice.Id})
	requireRefusalText(t, err, wantCreditMemoNotDraft)
	requireMemoInvoice(t, ce.app, m.posted, corrected.Id)
}

func TestInvoiceCorrection_RefusesAnotherCustomerWhileACreditMemoNamesIt(t *testing.T) {
	cases := map[string]func(ce *creditMemoEnv, t *testing.T, inv *core.Record) []*core.Record{
		"a draft credit memo": func(ce *creditMemoEnv, t *testing.T, inv *core.Record) []*core.Record {
			return []*core.Record{ce.memoNaming(t, inv, 10000)}
		},
		"only a posted credit memo": func(ce *creditMemoEnv, t *testing.T, inv *core.Record) []*core.Record {
			return []*core.Record{ce.postedMemoNaming(t, inv, 12000)}
		},
		"a posted and a void credit memo": func(ce *creditMemoEnv, t *testing.T, inv *core.Record) []*core.Record {
			return []*core.Record{ce.postedMemoNaming(t, inv, 12000), ce.voidMemoNaming(t, inv, 8000)}
		},
	}
	for name, memosOf := range cases {
		t.Run(name, func(t *testing.T) {
			ce := newCreditMemoEnv(t)
			inv := ce.postedInvoiceFor(t, ce.customer, 45000)
			memos := memosOf(ce, t, inv)
			northwind := mkCustomer(t, ce.app, "Northwind Traders", "")
			draft := ce.invoiceCorrection(t, inv, northwind, 45000)
			next := nextInvoiceNumber(t, ce.app)

			err := postInvoiceAs(ce.app, draft.Id, ce.users.bookkeeper.Id)
			requireFieldRefusal(t, err, "customer", wantInvoiceCorrectionCreditMemos)
			requireInvoiceNotPosted(t, ce.app, draft.Id, next)
			if s := reload(t, ce.app, "books_invoices", inv.Id).GetString("status"); s != statusPosted {
				t.Errorf("original status %q after the refusal, want posted", s)
			}
			for _, memo := range memos {
				requireMemoInvoice(t, ce.app, memo, inv.Id)
			}
		})
	}
}

// Void memos do not block a customer change: the correction posts and the
// void memo's link moves to it.
func TestInvoiceCorrection_AnotherCustomerPostsWithOnlyAVoidCreditMemo(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv := ce.postedInvoiceFor(t, ce.customer, 45000)
	voided := ce.voidMemoNaming(t, inv, 8000)
	northwind := mkCustomer(t, ce.app, "Northwind Traders", "")
	draft := ce.invoiceCorrection(t, inv, northwind, 45000)

	if err := postInvoiceAs(ce.app, draft.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("a correction of another customer with only a void credit memo was refused: %v", err)
	}
	corrected := reload(t, ce.app, "books_invoices", draft.Id)
	if corrected.GetString("status") != statusPosted || corrected.GetString("customer") != northwind.Id {
		t.Errorf("correction status %q customer %q, want posted for Northwind Traders",
			corrected.GetString("status"), corrected.GetString("customer"))
	}
	requireOnlyInvoiceChanged(t, ce.app, voided, corrected.Id)
}

func TestInvoiceVoid_KeepsEveryCreditMemoLink(t *testing.T) {
	ce := newCreditMemoEnv(t)
	m := ce.threeLinkedMemos(t)

	if err := voidInvoiceAs(ce.app, m.invoice.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	if s := reload(t, ce.app, "books_invoices", m.invoice.Id).GetString("status"); s != statusVoid {
		t.Fatalf("invoice status %q, want void", s)
	}
	for _, memo := range []*core.Record{m.draft, m.posted, m.voided} {
		requireOnlyInvoiceChanged(t, ce.app, memo, m.invoice.Id)
	}
}
