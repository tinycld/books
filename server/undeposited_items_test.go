package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The undeposited items view (bank deposit spec §3.7, Q2): one row per posted
// journal line on an Undeposited funds account whose entry is posted, is not a
// void reversal and is not a deposit's own entry, and that no posted deposit
// holds. A debit is a positive amount, a credit a negative one. The row's id is
// the line's id.

func undepositedRow(t testing.TB, app core.App, line *core.Record) *core.Record {
	t.Helper()
	row, err := app.FindRecordById(undepositedView, line.Id)
	if err != nil {
		t.Fatalf("%s does not list line %s: %v", undepositedView, line.Id, err)
	}
	return row
}

func requireNotListed(t testing.TB, app core.App, line *core.Record, why string) {
	t.Helper()
	if isListed(t, app, line) {
		t.Errorf("%s lists %s", undepositedView, why)
	}
}

func TestUndepositedItems_ListsDebitsAndCreditsSigned(t *testing.T) {
	de := newDepositEnv(t)
	in := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check from Harborview")
	out := de.undepositedItem(t, de.undeposited, "2026-11-11", -2000, "Cash paid out")
	second := de.undepositedItem(t, de.undeposited2, "2026-11-12", 2500, "Cash box")

	for _, c := range []struct {
		line    *core.Record
		account *core.Record
		amount  int
		date    string
		memo    string
	}{
		{in, de.undeposited, 5000, depositItemDay, "Check from Harborview"},
		{out, de.undeposited, -2000, "2026-11-11", "Cash paid out"},
		{second, de.undeposited2, 2500, "2026-11-12", "Cash box"},
	} {
		row := undepositedRow(t, de.app, c.line)
		entry := reload(t, de.app, "books_journal_entries", c.line.GetString("entry"))
		got := [10]any{row.GetString("line"), row.GetString("entry"), row.GetString("account"), row.GetInt("amount"),
			row.GetString("date"), row.GetString("doc_type"), row.GetString("origin"), row.GetString("number"),
			row.GetString("customer"), row.GetString("memo")}
		want := [10]any{c.line.Id, entry.Id, c.account.Id, c.amount, c.date, "journal", originManual, entry.GetString("number"),
			de.customer.Id, c.memo}
		if got != want {
			t.Errorf("row of %q =\n%v\nwant\n%v", c.memo, got, want)
		}
		if row.GetString("payment_method") != "" || row.GetString("reference_no") != "" || row.GetString("document") != "" {
			t.Errorf("a journal entry's row has payment_method %q reference_no %q document %q, want all empty",
				row.GetString("payment_method"), row.GetString("reference_no"), row.GetString("document"))
		}
	}
	// The other side of each entry is not on an Undeposited funds account.
	requireNotListed(t, de.app, lineOn(t, de.app, in.GetString("entry"), de.revenue), "a line on Consulting Income")
}

func TestUndepositedItems_LeavesOutWhatIsNotUndeposited(t *testing.T) {
	de := newDepositEnv(t)
	actor := de.users.bookkeeper.Id

	draft := mkDraft(t, de.app, depositItemDay, ln{account: de.undeposited, debit: 700}, ln{account: de.revenue, credit: 700})
	requireNotListed(t, de.app, lineOn(t, de.app, draft.Id, de.undeposited), "a draft entry's line")

	voided := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Bounced check")
	voidEntryAs(t, de.app, voided.GetString("entry"), actor)
	requireNotListed(t, de.app, voided, "a void entry's line")
	requireNotListed(t, de.app, lineOn(t, de.app, findReversal(t, de.app, voided.GetString("entry")).Id, de.undeposited), "a void reversal's line")

	held := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	d := de.postedDeposit(t, []*core.Record{held})
	requireNotListed(t, de.app, held, "a line a posted deposit holds")
	requireNotListed(t, de.app, lineOn(t, de.app, d.GetString("entry"), de.undeposited), "a deposit entry's own line")

	named := de.undepositedItem(t, de.undeposited, depositItemDay, 4000, "Check two")
	mkDepositItem(t, de.app, de.mkDeposit(t, nil), named, 0)
	if !isListed(t, de.app, named) {
		t.Error("a line that only a draft deposit names is not listed")
	}
}

// Each source document gives its payment method and reference number; the
// party comes from the line.
func TestUndepositedItems_SourceFields(t *testing.T) {
	for _, kind := range depositSourceKinds {
		t.Run(kind, func(t *testing.T) {
			src := depositSourcePosters[kind](t)
			row := undepositedRow(t, src.app, src.line)
			got := [8]any{row.GetString("doc_type"), row.GetString("document"), row.GetInt("amount"),
				row.GetString("payment_method"), row.GetString("reference_no"),
				row.GetString("customer"), row.GetString("vendor"), row.GetString("number")}
			want := [8]any{kind, src.entry.GetString("document"), src.amount, src.method, src.reference,
				src.line.GetString("customer"), src.line.GetString("vendor"), src.entry.GetString("number")}
			if got != want {
				t.Errorf("row =\n%v\nwant\n%v", got, want)
			}
			if row.GetString("customer") != src.customer || row.GetString("vendor") != src.vendor {
				t.Errorf("row customer %q vendor %q, want %q and %q", row.GetString("customer"), row.GetString("vendor"), src.customer, src.vendor)
			}
		})
	}
}
