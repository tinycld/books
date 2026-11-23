package books

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// f1099PassAccount is one expense account the 1099 pass adds, with its box.
type f1099PassAccount struct{ name, number, detail, box string }

// f1099PassAccounts are the four boxed expense accounts of the pass (plan
// D11): NEC 1 and three MISC boxes. The A/P book's own expense accounts have
// no box, so with these half of the expense accounts have one.
var f1099PassAccounts = []f1099PassAccount{
	{"Contract Labor", "6460", "contractors", necBox1099},
	{"Equipment Rent", "6461", "rent_lease", "misc_1"},
	{"Prize Payments", "6462", "other_business_expenses", "misc_3"},
	{"Settlements Through Counsel", "6463", "legal_professional", "misc_10"},
}

// writeForm1099Dataset is the 1099 report's scale book (plan D11): the
// Expenses by Vendor's book as writeEBVDataset writes it, then the 1099 pass.
func writeForm1099Dataset(t *testing.T, b apBook, size apSize) apDataset {
	t.Helper()
	data := writeEBVDataset(t, b, size)
	writeForm1099Pass(t, b, data)
	return data
}

// f1099VendorPlan is, for each vendor of data, its place d in the pass:
// d = (vendor index − the index of f1099PaidPick) mod the vendor count, so
// that the first picked vendor with a payment is d 0. A vendor with
// d mod 10 = 0 is tracked (every tenth vendor, and run 6 picks a tracked
// vendor with payment rows); a vendor
// with d mod 4 in {0, 1} has its expense lines moved to the boxed account
// (d / 4) mod 4 (half of the vendors). So the tracked vendors alternate
// between moved (boxed rows) and not moved (Not reported rows), and the first
// of them is on NEC 1.
func f1099VendorPlan(t *testing.T, data apDataset) (tracked []string, moveTo map[string]int) {
	t.Helper()
	n := len(data.vendors)
	if n == 0 || len(data.picked) == 0 {
		t.Fatalf("%s: the dataset has %d vendors and %d picked, want both above 0", data.size.name, n, len(data.picked))
	}
	anchor := f1099PaidPick(data)
	first := slices.Index(data.vendors, anchor)
	if first < 0 {
		t.Fatalf("%s: no picked vendor %v has a bill payment that is not void, want one for run 6", data.size.name, data.picked)
	}
	moveTo = map[string]int{}
	for i, v := range data.vendors {
		d := (i - first + n) % n
		if d%10 == 0 {
			tracked = append(tracked, v)
		}
		if d%4 <= 1 {
			moveTo[v] = (d / 4) % len(f1099PassAccounts)
		}
	}
	return tracked, moveTo
}

// f1099PaidPick is the vendor of data.picked with the most bill payments that
// are not void, the first of them on a tie ("" when none has one): a picked
// vendor can have open bills only, and such a vendor has no payment row, so
// it shows in no run. With the most payments, its NEC 1 box row (run 7's box
// row when it is the busiest) opens into more than one payment.
func f1099PaidPick(data apDataset) string {
	counts := map[string]int{}
	for _, d := range data.plan {
		if d.kind == apKindPayment && !d.void {
			counts[d.vendor]++
		}
	}
	best := ""
	for _, v := range data.picked {
		if counts[v] > counts[best] {
			best = v
		}
	}
	return best
}

// writeForm1099Pass is the 1099 pass alone (plan D11), in one transaction,
// set-based, with every value bound: it adds the four boxed expense accounts,
// tracks every tenth vendor, moves half of the vendors' expense lines (in
// books_journal_lines and books_cash_basis_lines) from the book's expense
// account to the boxed accounts, marks every fifth bill payment entry
// (by id) as a card payment, and copies each entry's card mark and doc type to
// its lines and cash rows. It adds and deletes no row of the large tables
// and leaves the stored month totals as they were: the moved lines keep
// their amounts, so the sum over the expense accounts does not change.
func writeForm1099Pass(t *testing.T, b apBook, data apDataset) {
	t.Helper()
	tracked, moveTo := f1099VendorPlan(t, data)
	err := b.app.RunInTransaction(func(tx core.App) error {
		accounts := make([]string, len(f1099PassAccounts))
		for i, a := range f1099PassAccounts {
			rec, err := f1099SaveAccount(tx, a)
			if err != nil {
				return err
			}
			accounts[i] = rec.Id
		}

		params := dbx.Params{"on": true}
		names := make([]string, len(tracked))
		for i, v := range tracked {
			name := fmt.Sprintf("v%d", i)
			params[name] = v
			names[i] = "{:" + name + "}"
		}
		if _, err := tx.DB().NewQuery("UPDATE books_vendors SET track_1099 = {:on} WHERE id IN (" +
			strings.Join(names, ", ") + ")").Bind(params).Execute(); err != nil {
			return fmt.Errorf("track the 1099 vendors: %w", err)
		}

		moves := dbx.Params{"from": b.expense.Id}
		pairs := make([]string, 0, len(moveTo))
		for i, v := range slices.Sorted(maps.Keys(moveTo)) {
			vendor, account := fmt.Sprintf("mv%d", i), fmt.Sprintf("ma%d", i)
			moves[vendor], moves[account] = v, accounts[moveTo[v]]
			pairs = append(pairs, "({:"+vendor+"}, {:"+account+"})")
		}
		for _, table := range []string{arLines, cashLinesCollection} {
			if _, err := tx.DB().NewQuery("UPDATE " + table + " SET account = m.column2 FROM (VALUES " +
				strings.Join(pairs, ", ") + ") AS m WHERE " + table + ".vendor = m.column1 AND " + table +
				".account = {:from}").Bind(moves).Execute(); err != nil {
				return fmt.Errorf("move the vendors' expense lines in %s: %w", table, err)
			}
		}

		if _, err := tx.DB().NewQuery("UPDATE books_journal_entries SET card_payment = {:card} WHERE id IN (" +
			"SELECT id FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n FROM books_journal_entries " +
			"WHERE doc_type = {:kind}) WHERE n % {:every} = 0)").
			Bind(dbx.Params{"card": true, "kind": apKindPayment, "every": 5}).Execute(); err != nil {
			return fmt.Errorf("mark the card payments: %w", err)
		}

		// The lines and the cash rows hold their entry's card mark and doc type,
		// as posting and the cash-basis rebuild write them (lines.go
		// stampEntryCopies, cash_basis.go): one set-based UPDATE per table, from
		// each row's own entry (a cash row's entry, not its payment_entry).
		for _, table := range []string{arLines, cashLinesCollection} {
			if _, err := tx.DB().NewQuery("UPDATE " + table + " SET card_payment = e.card_payment, doc_type = e.doc_type " +
				"FROM books_journal_entries AS e WHERE e.id = " + table + ".entry").Execute(); err != nil {
				return fmt.Errorf("copy the entries' card mark and doc type to %s: %w", table, err)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("%s: the 1099 pass: %v", data.size.name, err)
	}
}

// f1099SaveAccount saves one boxed expense account of the pass through the
// app, so the account guards run.
func f1099SaveAccount(tx core.App, a f1099PassAccount) (*core.Record, error) {
	collection, err := tx.FindCollectionByNameOrId("books_accounts")
	if err != nil {
		return nil, fmt.Errorf("find books_accounts: %w", err)
	}
	rec := core.NewRecord(collection)
	rec.Load(map[string]any{
		"name": a.name, "number": a.number, "type": "expense", "detail_type": a.detail, "currency": "USD",
		"form_1099_box": a.box,
	})
	if err := tx.Save(rec); err != nil {
		return nil, fmt.Errorf("save the account %s %s: %w", a.number, a.name, err)
	}
	return rec, nil
}
