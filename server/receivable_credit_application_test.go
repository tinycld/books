package books

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The stored receivable rows of a credit memo application (apply credit spec
// §3.8, §4.3): two rows at the apply date, a credit on the invoice's item and
// a debit on the credit memo's item, both with the credit memo's customer,
// currency and entry. They are stored in the transaction of each write that
// changes them, so every test reads them with no rebuild and ends with
// requireNoDrift, which compares them with the book.

// storedRowByID is the stored receivable row id; ok false when none is stored.
func storedRowByID(t testing.TB, app core.App, id string) (storedRow, bool) {
	t.Helper()
	for _, r := range storedRows(t, app) {
		if r.ID == id {
			return r, true
		}
	}
	return storedRow{}, false
}

// memoSideID is the id of the credit memo side's row of an application.
func memoSideID(application *core.Record) string {
	return strings.ToUpper(application.Id)
}

// requireBothSides fails unless both rows of application are stored.
func requireBothSides(t testing.TB, app core.App, what string, application *core.Record) {
	t.Helper()
	for _, id := range []string{application.Id, memoSideID(application)} {
		if _, ok := storedRowByID(t, app, id); !ok {
			t.Fatalf("%s: no stored receivable row %s of the application; rows %+v", what, id, storedRows(t, app))
		}
	}
}

// requireNoApplicationRowOn fails when an application row is stored on item.
func requireNoApplicationRowOn(t *testing.T, app core.App, what, item string) {
	t.Helper()
	if rows := ofItem(arRows(t, app, receivableSourceApplication), item); len(rows) > 0 {
		t.Errorf("%s: item %s has application rows %+v, want none", what, item, rows)
	}
}

func TestReceivableCreditApplication_CreateStoresTwoRows(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)

	inv = reload(t, me.app, "books_invoices", inv.Id)
	memo = reload(t, me.app, "books_credit_memos", memo.Id)
	invEntry := reload(t, me.app, "books_journal_entries", inv.GetString("entry"))
	memoEntry := reload(t, me.app, "books_journal_entries", memo.GetString("entry"))
	customer, currency := memo.GetString("customer"), memo.GetString("currency")

	want := map[string]storedRow{
		application.Id: {
			ID: application.Id, Source: receivableSourceApplication, Customer: customer, Entry: memoEntry.Id,
			Date: memoApplyDay, Debit: 0, Credit: 15000, Item: inv.Id, Kind: "invoice",
			Number: invEntry.GetString("number"), Seq: invEntry.GetInt("sequence"), Due: memoApplyInvoiceDay, Currency: currency,
		},
		memoSideID(application): {
			ID: memoSideID(application), Source: receivableSourceApplication, Customer: customer, Entry: memoEntry.Id,
			Date: memoApplyDay, Debit: 15000, Credit: 0, Item: memo.Id, Kind: "credit_memo",
			Number: memoEntry.GetString("number"), Seq: memoEntry.GetInt("sequence"), Due: memoApplyCreditDay, Currency: currency,
		},
	}
	for id, w := range want {
		got, ok := storedRowByID(t, me.app, id)
		if !ok {
			t.Errorf("after the create, with no rebuild, no stored row %s; want %+v", id, w)
			continue
		}
		got.Settled = ""
		if got != w {
			t.Errorf("the stored row %s =\n%+v\nwant\n%+v", id, got, w)
		}
	}

	lines := ofEntry(arRows(t, me.app, receivableSourceLine), memoEntry.Id)
	if len(lines) != 1 {
		t.Fatalf("the memo's entry has %d line rows, want 1: %+v", len(lines), lines)
	}
	if got, want := [4]any{lines[0].item, lines[0].date, lines[0].credit, lines[0].debit}, [4]any{memo.Id, memoApplyCreditDay, 25000, 0}; got != want {
		t.Errorf("the memo's own line row item/date/credit/debit = %v, want %v (its full credit at its date)", got, want)
	}
	requireNoDrift(t, me.app)
}

func TestReceivableCreditApplication_DeleteTakesBothRows(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	requireBothSides(t, me.app, "after the create", application)

	me.remove(t, application)
	for _, id := range []string{application.Id, memoSideID(application)} {
		if r, ok := storedRowByID(t, me.app, id); ok {
			t.Errorf("after the delete, with no rebuild, the row %s is still stored: %+v", id, r)
		}
	}
	requireNoApplicationRowOn(t, me.app, "after the delete", inv.Id)
	requireNoApplicationRowOn(t, me.app, "after the delete", memo.Id)
	requireNoDrift(t, me.app)
}

func TestReceivableCreditApplication_Settled(t *testing.T) {
	t.Run("an invoice paid in full by credit settles on the apply date", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 10000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 10000, memoApplyDay)

		if got := settledOf(t, me.app, inv.Id); got != memoApplyDay {
			t.Errorf("settled = %q, want the apply date %s on every row of the invoice's item", got, memoApplyDay)
		}
		requireNoDrift(t, me.app)
	})
	t.Run("a payment, then a credit: the credit's day", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.wo.pay(t, inv, "2026-11-13", 30000)
		me.apply(t, memo, inv, 10000, memoApplyDay)

		if got := settledOf(t, me.app, inv.Id); got != memoApplyDay {
			t.Errorf("settled = %q, want the later day %s (the credit's)", got, memoApplyDay)
		}
		requireNoDrift(t, me.app)
	})
	t.Run("a credit, then a payment: the payment's day", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, inv, 10000, memoApplyDay)
		me.wo.pay(t, inv, "2026-11-17", 30000)

		if got := settledOf(t, me.app, inv.Id); got != "2026-11-17" {
			t.Errorf("settled = %q, want the later day 2026-11-17 (the payment's)", got)
		}
		requireNoDrift(t, me.app)
	})
	t.Run("a credit memo applied in full settles on its last application's day", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		first := me.invoice(t, me.customer, 40000)
		second := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		me.apply(t, memo, first, 10000, "2026-11-13")
		me.apply(t, memo, second, 15000, memoApplyDay)

		if got := settledOf(t, me.app, memo.Id); got != memoApplyDay {
			t.Errorf("settled = %q, want the last application's day %s", got, memoApplyDay)
		}
		requireNoDrift(t, me.app)
	})
	t.Run("a credit memo applied in part is open", func(t *testing.T) {
		me := newMemoApplyEnv(t)
		inv := me.invoice(t, me.customer, 40000)
		memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
		application := me.apply(t, memo, inv, 15000, memoApplyDay)
		requireBothSides(t, me.app, "after the create", application)

		if got := settledOf(t, me.app, memo.Id); got != receivableOpen {
			t.Errorf("settled = %q, want open (%s)", got, receivableOpen)
		}
		requireNoDrift(t, me.app)
	})
}

func TestReceivableCreditApplication_InvoiceCorrectionTakesTheRow(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	me.wo.pay(t, inv, memoApplyDay, 5000)

	draft := me.invoiceCorrection(t, inv, me.customer, 40000)
	if err := postInvoiceAs(me.app, draft.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the invoice correction: %v", err)
	}
	draft = reload(t, me.app, "books_invoices", draft.Id)
	draftEntry := reload(t, me.app, "books_journal_entries", draft.GetString("entry"))

	row, ok := storedRowByID(t, me.app, application.Id)
	if !ok {
		t.Fatalf("after the correction no invoice-side row %s is stored; rows %+v", application.Id, storedRows(t, me.app))
	}
	if got, want := [4]any{row.Item, row.Number, row.Seq, row.Due},
		[4]any{draft.Id, draftEntry.GetString("number"), draftEntry.GetInt("sequence"), draft.GetString("due_date")}; got != want {
		t.Errorf("the invoice-side row item/number/seq/due = %v, want the correction's %v", got, want)
	}
	requireNoApplicationRowOn(t, me.app, "after the correction, the original", inv.Id)
	requireNoDrift(t, me.app)
}

func TestReceivableCreditApplication_CreditMemoCorrectionTakesBothRows(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)

	draft := me.memoCorrection(t, memo, 25000, nil)
	if err := postCreditMemoAs(me.app, draft.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the credit memo correction: %v", err)
	}
	draft = reload(t, me.app, "books_credit_memos", draft.Id)
	entry := draft.GetString("entry")

	invoiceSide, ok := storedRowByID(t, me.app, application.Id)
	if !ok {
		t.Fatalf("after the correction no invoice-side row %s is stored; rows %+v", application.Id, storedRows(t, me.app))
	}
	if invoiceSide.Entry != entry || invoiceSide.Item != inv.Id {
		t.Errorf("the invoice-side row entry/item = %s/%s, want the correction's entry %s on the invoice %s",
			invoiceSide.Entry, invoiceSide.Item, entry, inv.Id)
	}
	memoSide, ok := storedRowByID(t, me.app, memoSideID(application))
	if !ok {
		t.Fatalf("after the correction no memo-side row %s is stored; rows %+v", memoSideID(application), storedRows(t, me.app))
	}
	if memoSide.Entry != entry || memoSide.Item != draft.Id {
		t.Errorf("the memo-side row entry/item = %s/%s, want the correction's entry %s and item %s",
			memoSide.Entry, memoSide.Item, entry, draft.Id)
	}
	requireNoApplicationRowOn(t, me.app, "after the correction, the replaced memo", memo.Id)
	requireNoDrift(t, me.app)
}

// An application row of a draft or a void credit memo can only be written past
// the guards; the query gives no row for it, so verify and rebuild agree.
func TestReceivableCreditApplication_OnlyAPostedMemo(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	posted := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, posted, inv, 15000, memoApplyDay)

	draftMemo := me.mkCreditMemo(t, map[string]any{"customer": me.customer.Id, "date": memoApplyCreditDay})
	mkCreditMemoLine(t, me.app, draftMemo, 0, item(me.service, 1, 10000, false))
	voided := me.postedMemo(t, me.customer, memoApplyCreditDay, 10000)
	if err := voidCreditMemoAs(me.app, voided.Id, me.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	raw := map[string]*core.Record{"rawapplydraft01": draftMemo, "rawapplyvoid001": voided}
	for id, memo := range raw {
		if _, err := me.app.DB().Insert(memoApplicationsCol, dbx.Params{
			"id": id, "credit_memo": memo.Id, "invoice": inv.Id, "amount": 5000, "date": memoApplyDay,
		}).Execute(); err != nil {
			t.Fatalf("insert the raw application %s: %v", id, err)
		}
	}
	requireNoDrift(t, me.app)
	requireRebuilt(t, me.app)

	requireBothSides(t, me.app, "the posted memo's application after a rebuild", application)
	for id, memo := range raw {
		for _, rowID := range []string{id, strings.ToUpper(id)} {
			if r, ok := storedRowByID(t, me.app, rowID); ok {
				t.Errorf("the application of a %s memo has the stored row %+v, want none", memo.GetString("status"), r)
			}
		}
		requireNoApplicationRowOn(t, me.app, "a "+memo.GetString("status")+" memo", memo.Id)
	}
	requireNoDrift(t, me.app)
}

func TestReceivableCreditApplication_VerifyFindsAMissingRow(t *testing.T) {
	me := newMemoApplyEnv(t)
	inv := me.invoice(t, me.customer, 40000)
	memo := me.postedMemo(t, me.customer, memoApplyCreditDay, 25000)
	application := me.apply(t, memo, inv, 15000, memoApplyDay)
	ids := []string{application.Id, memoSideID(application)}

	for _, id := range ids {
		if _, err := me.app.DB().NewQuery("DELETE FROM books_receivable_items WHERE id = {:id}").
			Bind(dbx.Params{"id": id}).Execute(); err != nil {
			t.Fatalf("delete the row %s: %v", id, err)
		}
	}
	drifts, err := verifyReceivables(me.app)
	if err != nil {
		t.Fatalf("verify receivables: %v", err)
	}
	missing := map[string]bool{}
	for _, d := range drifts {
		if d.Problem == "missing" {
			missing[d.ID] = true
		}
	}
	for _, id := range ids {
		if !missing[id] {
			t.Errorf("verify names no missing row %s; drifts %+v", id, drifts)
		}
	}

	requireRebuilt(t, me.app)
	for _, id := range ids {
		if _, ok := storedRowByID(t, me.app, id); !ok {
			t.Errorf("after the rebuild the row %s is not stored again", id)
		}
	}
	requireNoDrift(t, me.app)
}

// A refresh outside a transaction could commit without the write it follows.
func TestReceivableCreditApplication_RefreshNeedsTransaction(t *testing.T) {
	me := newMemoApplyEnv(t)
	memo := reload(t, me.app, "books_credit_memos", me.postedMemo(t, me.customer, memoApplyCreditDay, 25000).Id)
	want := refreshReceivables(me.app, "FALSE", nil)
	if want == nil {
		t.Fatal("refreshReceivables outside a transaction passed, want its refusal")
	}
	err := refreshReceivableCreditMemo(me.app, memo)
	if err == nil || err.Error() != want.Error() {
		t.Fatalf("refreshReceivableCreditMemo outside a transaction = %v, want the refusal of refreshReceivables %q", err, want)
	}
	requireNoDrift(t, me.app)
}
