package books

import (
	"slices"
	"strconv"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The suggestion view (bank-match spec §3 Suggestions, §4 Schema): one row for
// each For review bank transaction and each posted journal line on its
// connection's account that fits its side, has exactly its amount, is dated
// from 90 days before to 7 days after it, is of a posted entry that is not a
// void reversal, and is not matched.
func TestBankMatchSuggestions(t *testing.T) {
	m := newBankMatchEnv(t)
	const amount = 86815
	day := func(days int) string { return shiftDay(t, matchBankDay, days) }
	// debitLine posts an entry that debits account amount on date: money in.
	debitLine := func(date string, account *core.Record, value int) *core.Record {
		e := m.postedEntry(t, date, account, value, 0)
		return lineOn(t, m.app, e.Id, account)
	}
	creditLine := func(date string, account *core.Record, value int) *core.Record {
		e := m.postedEntry(t, date, account, 0, value)
		return lineOn(t, m.app, e.Id, account)
	}

	moneyIn := m.bankTxn(t, matchBankDay, amount, "for_review")
	moneyOut := m.bankTxn(t, matchBankDay, -amount, "for_review")

	sameDay := debitLine(matchBankDay, m.checking, amount)
	before90 := debitLine(day(-90), m.checking, amount)
	before91 := debitLine(day(-91), m.checking, amount)
	after7 := debitLine(day(7), m.checking, amount)
	after8 := debitLine(day(8), m.checking, amount)
	credit := creditLine(matchBankDay, m.checking, amount)
	offByOne := debitLine(matchBankDay, m.checking, amount+1)
	otherAccount := debitLine(matchBankDay, m.savings, amount)

	voided := m.postedEntry(t, matchBankDay, m.checking, amount, 0)
	voidEntryAs(t, m.app, voided.Id, m.users.bookkeeper.Id)
	voidedLine := lineOn(t, m.app, voided.Id, m.checking)
	// The reversal credits checking: it would fit the money out row.
	reversalLine := lineOn(t, m.app, findReversal(t, m.app, voided.Id).Id, m.checking)

	draft := mkDraft(t, m.app, matchBankDay, ln{m.checking, amount, 0}, ln{m.rent, 0, amount})
	draftLine := lineOn(t, m.app, draft.Id, m.checking)

	matchedLine := debitLine(day(-1), m.checking, amount)
	takenBy := m.bankTxn(t, day(-1), amount, "for_review")
	saveRecord(t, m.app, matchesCollection, map[string]any{
		"bank_transaction": takenBy.Id, "lines": []string{matchedLine.Id},
	})

	excluded := m.bankTxn(t, matchBankDay, amount, "excluded")
	reviewed := m.bankTxn(t, matchBankDay, amount, "reviewed")

	t.Run("the window runs from 90 days before to 7 days after", func(t *testing.T) {
		days := map[string]int{}
		for _, r := range suggestionsOf(t, m.app, moneyIn) {
			days[r.GetString("line")] = r.GetInt("days_apart")
		}
		for name, c := range map[string]struct {
			line   *core.Record
			listed bool
			days   int
		}{
			"same day": {sameDay, true, 0}, "90 days before": {before90, true, 90},
			"91 days before": {before91, false, 0}, "7 days after": {after7, true, 7},
			"8 days after": {after8, false, 0},
		} {
			got, listed := days[c.line.Id]
			if listed != c.listed {
				t.Errorf("%s: listed %v, want %v", name, listed, c.listed)
				continue
			}
			if listed && got != c.days {
				t.Errorf("%s: days_apart = %d, want %d", name, got, c.days)
			}
		}
	})

	t.Run("a debit fits money in and a credit fits money out", func(t *testing.T) {
		if !suggests(t, m.app, moneyIn, sameDay) || suggests(t, m.app, moneyOut, sameDay) {
			t.Error("a debit of the amount must be listed for money in and not for money out")
		}
		if !suggests(t, m.app, moneyOut, credit) || suggests(t, m.app, moneyIn, credit) {
			t.Error("a credit of the amount must be listed for money out and not for money in")
		}
	})

	t.Run("lines that cannot be matched are not listed", func(t *testing.T) {
		for name, c := range map[string]struct{ txn, line *core.Record }{
			"an amount 1 more":          {moneyIn, offByOne},
			"a line of another account": {moneyIn, otherAccount},
			"a void entry's line":       {moneyIn, voidedLine},
			"a void reversal's line":    {moneyOut, reversalLine},
			"a draft entry's line":      {moneyIn, draftLine},
			"a line matched to another": {moneyIn, matchedLine},
		} {
			if suggests(t, m.app, c.txn, c.line) {
				t.Errorf("%s is listed", name)
			}
		}
		rows, err := m.app.FindAllRecords(matchSuggestions, dbx.HashExp{"line": matchedLine.Id})
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != 0 {
			t.Errorf("the matched line has %d rows, want none for any bank transaction", len(rows))
		}
	})

	t.Run("an excluded or reviewed bank transaction has no row", func(t *testing.T) {
		for _, txn := range []*core.Record{excluded, reviewed} {
			if rows := suggestionsOf(t, m.app, txn); len(rows) != 0 {
				t.Errorf("%s bank transaction has %d rows, want none", txn.GetString("status"), len(rows))
			}
		}
	})

	t.Run("a credit card charge lists a credit on the card", func(t *testing.T) {
		charge := m.bankTxnOf(t, m.cardConn, m.cardFl, m.cardImport, matchBankDay, -5000, "for_review")
		onCard := creditLine(matchBankDay, m.card, 5000)
		paidBack := debitLine(matchBankDay, m.card, 5000)
		if !suggests(t, m.app, charge, onCard) {
			t.Error("the card's credit is not listed for the charge")
		}
		if suggests(t, m.app, charge, paidBack) {
			t.Error("a debit on the card is listed for a charge")
		}
	})

	t.Run("the rows of one bank transaction are nearest first, then by entry number", func(t *testing.T) {
		near := debitLine(day(-7), m.checking, amount)
		rows := suggestionsOf(t, m.app, moneyIn)
		number := func(r *core.Record) int {
			n, _ := strconv.Atoi(reload(t, m.app, "books_journal_entries", r.GetString("entry")).GetString("number"))
			return n
		}
		slices.SortStableFunc(rows, func(a, b *core.Record) int {
			if d := a.GetInt("days_apart") - b.GetInt("days_apart"); d != 0 {
				return d
			}
			return number(a) - number(b)
		})
		var got []string
		for _, r := range rows {
			got = append(got, r.GetString("line"))
		}
		// after7 and near are both 7 days apart; after7's entry posted first.
		want := []string{sameDay.Id, after7.Id, near.Id, before90.Id}
		if !slices.Equal(got, want) {
			t.Errorf("lines in order %v, want %v", got, want)
		}
	})

	t.Run("each row has its own id", func(t *testing.T) {
		rows, err := m.app.FindAllRecords(matchSuggestions)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) < 2 {
			t.Fatalf("%d view rows, want several", len(rows))
		}
		seen := map[string]bool{}
		for _, r := range rows {
			if seen[r.Id] {
				t.Errorf("view id %q is on two rows", r.Id)
			}
			seen[r.Id] = true
		}
	})

	// Last: it takes sameDay from moneyIn.
	t.Run("one line is listed for two bank transactions until one takes it", func(t *testing.T) {
		twin := m.bankTxn(t, matchBankDay, amount, "for_review")
		if !suggests(t, m.app, moneyIn, sameDay) || !suggests(t, m.app, twin, sameDay) {
			t.Fatal("the line is not listed for both bank transactions of its amount")
		}
		saveRecord(t, m.app, matchesCollection, map[string]any{
			"bank_transaction": twin.Id, "lines": []string{sameDay.Id},
		})
		if suggests(t, m.app, moneyIn, sameDay) {
			t.Error("the line is still listed for the other bank transaction after the match")
		}
	})
}
