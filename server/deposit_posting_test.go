package books

import (
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Posting a deposit (bank deposit spec §3.7): draft → posted writes a numbered
// journal entry through postDocument with doc type deposit: one debit to
// Deposit to for the total, one line per Undeposited funds account for the net
// of its items, one line per other funds line; the items are marked posted and
// carry their amount. A correction takes its original's number; a void reverses
// the entry in its own period and releases the items.

// depositLine is one journal line of a deposit's entry as these tests compare
// it, memo included.
func depositLines(t testing.TB, app core.App, entryID string) []string {
	t.Helper()
	var out []string
	for _, l := range linesOf(t, app, entryID) {
		out = append(out, fmt.Sprintf("%s dr %d cr %d memo %q customer %q vendor %q",
			l.GetString("account"), l.GetInt("debit"), l.GetInt("credit"), l.GetString("memo"), l.GetString("customer"), l.GetString("vendor")))
	}
	sort.Strings(out)
	return out
}

func wantLine(account *core.Record, debit, credit int, memo, customer, vendor string) string {
	return fmt.Sprintf("%s dr %d cr %d memo %q customer %q vendor %q", account.Id, debit, credit, memo, customer, vendor)
}

func requireDepositLines(t testing.TB, app core.App, deposit *core.Record, want ...string) {
	t.Helper()
	sort.Strings(want)
	if got := depositLines(t, app, deposit.GetString("entry")); strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("deposit entry lines =\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func requireItemsPosted(t testing.TB, app core.App, deposit *core.Record, want bool) {
	t.Helper()
	items, err := app.FindAllRecords(depositItemsCol, dbx.HashExp{"deposit": deposit.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("the deposit has no items")
	}
	for _, it := range items {
		if it.GetBool("posted") != want {
			t.Errorf("item at position %d posted = %v, want %v", it.GetInt("position"), it.GetBool("posted"), want)
		}
	}
}

// requireDepositNotPosted checks that a refused post wrote nothing: the deposit
// is a draft with no number or entry, its items are not posted and the deposit
// sequence still offers next.
func requireDepositNotPosted(t testing.TB, app core.App, id string, next int) {
	t.Helper()
	d := reload(t, app, depositsCol, id)
	if d.GetString("status") != statusDraft || d.GetString("number") != "" || d.GetString("entry") != "" {
		t.Errorf("deposit status %q number %q entry %q after the refusal, want a draft with none",
			d.GetString("status"), d.GetString("number"), d.GetString("entry"))
	}
	if n, _ := app.CountRecords(depositItemsCol, dbx.HashExp{"deposit": id, "posted": true}); n != 0 {
		t.Errorf("%d items posted after the refusal, want 0", n)
	}
	if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "deposit", "document": id}); n != 0 {
		t.Errorf("%d deposit entries stored after the refusal, want 0", n)
	}
	requireSequenceNext(t, app, depositSequenceID, next)
}

// isListed is whether the undeposited view lists line.
func isListed(t testing.TB, app core.App, line *core.Record) bool {
	t.Helper()
	n, err := app.CountRecords(undepositedView, dbx.HashExp{"id": line.Id})
	if err != nil {
		t.Fatalf("read %s: %v", undepositedView, err)
	}
	return n == 1
}

func TestDepositPost_NumbersFromTheDepositSequence(t *testing.T) {
	de := newDepositEnv(t)
	requireSequenceNext(t, de.app, depositSequenceID, 1001)
	first := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")})
	second := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two")})
	if first.GetString("number") != "1001" || second.GetString("number") != "1002" {
		t.Errorf("numbers %q and %q, want 1001 and 1002", first.GetString("number"), second.GetString("number"))
	}
	requireSequenceNext(t, de.app, depositSequenceID, 1003)
	entry := reload(t, de.app, "books_journal_entries", first.GetString("entry"))
	if got, want := [4]string{entry.GetString("doc_type"), entry.GetString("origin"), entry.GetString("document"), entry.GetString("number")},
		[4]string{docTypeDeposit, originDocument, first.Id, "1001"}; got != want {
		t.Errorf("entry doc_type/origin/document/number = %v, want %v", got, want)
	}
	if docTypeDeposit != "deposit" {
		t.Errorf("docTypeDeposit = %q, want deposit", docTypeDeposit)
	}
}

func TestDepositPost_OneUndepositedFundsAccount(t *testing.T) {
	de := newDepositEnv(t)
	a := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	b := de.undepositedItem(t, de.undeposited, "2026-11-12", 3000, "Check two")
	d := de.mkDeposit(t, map[string]any{"memo": "Friday bank run"})
	mkDepositItem(t, de.app, d, a, 0)
	mkDepositItem(t, de.app, d, b, 1)
	d = mustPostDeposit(t, de.app, d.Id, de.users.bookkeeper.Id)

	requireDepositLines(t, de.app, d,
		wantLine(de.checking, 8000, 0, "", "", ""),
		wantLine(de.undeposited, 0, 8000, "", "", ""))
	entry := reload(t, de.app, "books_journal_entries", d.GetString("entry"))
	if entry.GetString("status") != statusPosted || entry.GetString("date") != depositDay || entry.GetString("memo") != "Friday bank run" {
		t.Errorf("entry status %q date %q memo %q, want posted, %s, Friday bank run",
			entry.GetString("status"), entry.GetString("date"), entry.GetString("memo"), depositDay)
	}
	if got, want := [3]int{d.GetInt("total"), d.GetInt("items_total"), d.GetInt("lines_total")}, [3]int{8000, 8000, 0}; got != want {
		t.Errorf("total/items_total/lines_total = %v, want %v", got, want)
	}
	if d.GetString("posted_by") != de.users.bookkeeper.Id || d.GetDateTime("posted_at").IsZero() {
		t.Errorf("posted_by %q posted_at %v, want the bookkeeper and a time", d.GetString("posted_by"), d.GetDateTime("posted_at"))
	}
	requireItemsPosted(t, de.app, d, true)
	for _, line := range []*core.Record{a, b} {
		it, err := de.app.FindFirstRecordByFilter(depositItemsCol, "deposit = {:d} && line = {:l}", dbx.Params{"d": d.Id, "l": line.Id})
		if err != nil {
			t.Fatal(err)
		}
		if it.GetString("entry") != line.GetString("entry") || it.GetInt("amount") != line.GetInt("debit")-line.GetInt("credit") {
			t.Errorf("item entry %q amount %d, want the line's entry and %d", it.GetString("entry"), it.GetInt("amount"), line.GetInt("debit")-line.GetInt("credit"))
		}
	}
	requireNoDrift(t, de.app)
}

// Each Undeposited funds account gets one line for the net of its items.
func TestDepositPost_TwoUndepositedFundsAccounts(t *testing.T) {
	de := newDepositEnv(t)
	d := de.postedDeposit(t, []*core.Record{
		de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one"),
		de.undepositedItem(t, de.undeposited2, depositItemDay, 2500, "Cash box"),
		de.undepositedItem(t, de.undeposited, depositItemDay, 1000, "Check two"),
	})
	requireDepositLines(t, de.app, d,
		wantLine(de.checking, 8500, 0, "", "", ""),
		wantLine(de.undeposited, 0, 6000, "", "", ""),
		wantLine(de.undeposited2, 0, 2500, "", "", ""))
	requireNoDrift(t, de.app)
}

// A money-out item is a negative item: a net below zero debits the account,
// a net of zero writes no line.
func TestDepositPost_NegativeItemsAndNets(t *testing.T) {
	t.Run("a net below zero is a debit", func(t *testing.T) {
		de := newDepositEnv(t)
		in := de.undepositedItem(t, de.undeposited, depositItemDay, 2000, "Check one")
		out := de.undepositedItem(t, de.undeposited, depositItemDay, -5000, "Refund paid in cash")
		d := de.postedDeposit(t, []*core.Record{in, out}, map[string]any{"account": de.interest.Id, "amount": 10000})
		requireDepositLines(t, de.app, d,
			wantLine(de.checking, 7000, 0, "", "", ""),
			wantLine(de.undeposited, 3000, 0, "", "", ""),
			wantLine(de.interest, 0, 10000, "", "", ""))
		if got, want := [3]int{d.GetInt("total"), d.GetInt("items_total"), d.GetInt("lines_total")}, [3]int{7000, -3000, 10000}; got != want {
			t.Errorf("total/items_total/lines_total = %v, want %v", got, want)
		}
		it, err := de.app.FindFirstRecordByFilter(depositItemsCol, "line = {:l}", dbx.Params{"l": out.Id})
		if err != nil {
			t.Fatal(err)
		}
		if it.GetInt("amount") != -5000 {
			t.Errorf("the money-out item's amount = %d, want -5000", it.GetInt("amount"))
		}
		requireNoDrift(t, de.app)
	})
	t.Run("a net of zero writes no line", func(t *testing.T) {
		de := newDepositEnv(t)
		d := de.postedDeposit(t, []*core.Record{
			de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check one"),
			de.undepositedItem(t, de.undeposited, depositItemDay, -3000, "Refund paid in cash"),
		}, map[string]any{"account": de.interest.Id, "amount": 5000})
		requireDepositLines(t, de.app, d,
			wantLine(de.checking, 5000, 0, "", "", ""),
			wantLine(de.interest, 0, 5000, "", "", ""))
		requireNoDrift(t, de.app)
	})
}

// An other funds line posts on its account: a credit when above zero, a debit
// when below, with its description as the line memo and its party.
func TestDepositPost_OtherFundsLines(t *testing.T) {
	de := newDepositEnv(t)
	d := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")},
		map[string]any{"account": de.interest.Id, "amount": 1240, "description": "October interest", "customer": de.customer.Id},
		map[string]any{"account": de.fees.Id, "amount": -500, "description": "Monthly fee", "vendor": de.vendor.Id})
	requireDepositLines(t, de.app, d,
		wantLine(de.checking, 5740, 0, "", "", ""),
		wantLine(de.undeposited, 0, 5000, "", "", ""),
		wantLine(de.interest, 0, 1240, "October interest", de.customer.Id, ""),
		wantLine(de.fees, 500, 0, "Monthly fee", "", de.vendor.Id))
	if got, want := [3]int{d.GetInt("total"), d.GetInt("items_total"), d.GetInt("lines_total")}, [3]int{5740, 5000, 740}; got != want {
		t.Errorf("total/items_total/lines_total = %v, want %v", got, want)
	}
	requireNoDrift(t, de.app)
}

// A deposit of other funds alone posts, with no Undeposited funds line.
func TestDepositPost_LinesOnly(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240, "description": "October interest"})
	d = mustPostDeposit(t, de.app, d.Id, de.users.bookkeeper.Id)
	requireDepositLines(t, de.app, d,
		wantLine(de.checking, 1240, 0, "", "", ""),
		wantLine(de.interest, 0, 1240, "October interest", "", ""))
	for _, l := range linesOf(t, de.app, d.GetString("entry")) {
		if l.GetString("account") == de.undeposited.Id || l.GetString("account") == de.undeposited2.Id {
			t.Errorf("the entry has a line on an Undeposited funds account: %v", l.PublicExport())
		}
	}
}

// Each posting refusal of an item is keyed items.<n> with its text, and leaves
// the draft.
func TestDepositPost_RefusesAnItemThatCannotBeDeposited(t *testing.T) {
	t.Run("its entry is void", func(t *testing.T) {
		de := newDepositEnv(t)
		line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
		d := de.mkDeposit(t, nil)
		mkDepositItem(t, de.app, d, line, 0)
		voidEntryAs(t, de.app, line.GetString("entry"), de.users.bookkeeper.Id)
		err := postDepositAs(de.app, d.Id, de.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "items.0", wantItemVoid(journalName(t, de.app, line)))
		requireDepositNotPosted(t, de.app, d.Id, 1001)
	})
	t.Run("it is a void reversal", func(t *testing.T) {
		de := newDepositEnv(t)
		voided := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
		voidEntryAs(t, de.app, voided.GetString("entry"), de.users.bookkeeper.Id)
		reversal := findReversal(t, de.app, voided.GetString("entry"))
		reversalLine := lineOn(t, de.app, reversal.Id, de.undeposited)
		d := de.mkDeposit(t, nil)
		mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 10000})
		// Written past the item guard, which refuses a void reversal's line, so
		// the post's own re-read is what refuses it.
		saveRecord(t, de.app.UnsafeWithoutHooks(), depositItemsCol, map[string]any{"id": newRecordID(), "deposit": d.Id, "line": reversalLine.Id, "position": 0})
		err := postDepositAs(de.app, d.Id, de.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "items.0", wantItemVoid("Journal entry "+reversal.GetString("number")))
		requireDepositNotPosted(t, de.app, d.Id, 1001)
	})
	t.Run("a posted deposit holds it", func(t *testing.T) {
		de := newDepositEnv(t)
		line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
		other := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two")
		late := de.mkDeposit(t, nil)
		mkDepositItem(t, de.app, late, other, 0)
		mkDepositItem(t, de.app, late, line, 1)
		first := de.postedDeposit(t, []*core.Record{line})
		err := postDepositAs(de.app, late.Id, de.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "items.1", wantItemInDeposit(journalName(t, de.app, line), first.GetString("number")))
		requireDepositNotPosted(t, de.app, late.Id, 1002)
	})
	t.Run("it is dated after the deposit date", func(t *testing.T) {
		de := newDepositEnv(t)
		line := de.undepositedItem(t, de.undeposited, "2026-11-18", 5000, "Check one")
		d := de.mkDeposit(t, nil)
		mkDepositItem(t, de.app, d, line, 0)
		err := postDepositAs(de.app, d.Id, de.users.bookkeeper.Id)
		requireFieldRefusal(t, err, "items.0", wantItemAfterDepositDate(journalName(t, de.app, line)))
		requireDepositNotPosted(t, de.app, d.Id, 1001)
	})
}

// The key is the item's rank in position order, not its stored position: a
// draft whose first item was deleted keys its new first item items.0.
func TestDepositPost_RefusalKeyIsTheRank(t *testing.T) {
	de := newDepositEnv(t)
	gone := de.undepositedItem(t, de.undeposited, depositItemDay, 1000, "Removed")
	voided := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	kept := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two")
	d := de.mkDeposit(t, nil)
	first := mkDepositItem(t, de.app, d, gone, 0)
	mkDepositItem(t, de.app, d, voided, 1)
	mkDepositItem(t, de.app, d, kept, 2)
	if err := de.app.Delete(reload(t, de.app, depositItemsCol, first.Id)); err != nil {
		t.Fatalf("delete the first item of a draft: %v", err)
	}
	voidEntryAs(t, de.app, voided.GetString("entry"), de.users.bookkeeper.Id)
	err := postDepositAs(de.app, d.Id, de.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "items.0", wantItemVoid(journalName(t, de.app, voided)))
	requireDepositNotPosted(t, de.app, d.Id, 1001)
}

func TestDepositPost_RefusesATotalThatIsNotAboveZero(t *testing.T) {
	for name, fee := range map[string]int{"zero": -5000, "below zero": -8000} {
		t.Run(name, func(t *testing.T) {
			de := newDepositEnv(t)
			d := de.mkDeposit(t, nil)
			mkDepositItem(t, de.app, d, de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one"), 0)
			mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.fees.Id, "amount": fee})
			requireRefusalText(t, postDepositAs(de.app, d.Id, de.users.bookkeeper.Id), wantDepositTotalAboveZero)
			requireDepositNotPosted(t, de.app, d.Id, 1001)
		})
	}
}

func TestDepositPost_RefusedOnOrBeforeTheCloseDate(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	mkDepositItem(t, de.app, d, de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one"), 0)
	setCloseDate(t, de.app, depositDay)
	requireRefused(t, postDepositAs(de.app, d.Id, de.users.bookkeeper.Id), wantClosedThrough(depositDay))
	requireDepositNotPosted(t, de.app, d.Id, 1001)
}

// Two deposits that hold the same line: the first post wins, the second is
// refused by the re-read.
func TestDepositPost_TwoDepositsOfOneItem(t *testing.T) {
	de := newDepositEnv(t)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	a := de.mkDeposit(t, nil)
	b := de.mkDeposit(t, nil)
	mkDepositItem(t, de.app, a, line, 0)
	mkDepositItem(t, de.app, b, line, 0)
	a = mustPostDeposit(t, de.app, a.Id, de.users.bookkeeper.Id)
	err := postDepositAs(de.app, b.Id, de.users.bookkeeper.Id)
	requireFieldRefusal(t, err, "items.0", wantItemInDeposit(journalName(t, de.app, line), a.GetString("number")))
	requireDepositNotPosted(t, de.app, b.Id, 1002)
	if isListed(t, de.app, line) {
		t.Error("the deposited line is still listed as undeposited")
	}
}

// The partial unique index alone, without the post's re-read: a second posted
// item row for a line a posted item holds does not save.
func TestDepositItems_UniquePostedLine(t *testing.T) {
	de := newDepositEnv(t)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	de.postedDeposit(t, []*core.Record{line})
	other := de.mkDeposit(t, nil)
	bare := de.app.UnsafeWithoutHooks()
	err := rawSave(t, bare, depositItemsCol, map[string]any{
		"id": newRecordID(), "deposit": other.Id, "line": line.Id, "position": 0, "posted": true,
	})
	if err == nil {
		t.Fatal("a second posted item of one line was saved; want the unique index to refuse it")
	}
	if msg := err.Error(); !strings.Contains(msg, "UNIQUE constraint failed") || !strings.Contains(msg, "books_deposit_items.line") {
		t.Fatalf("a second posted item of one line was refused by %q; want the unique index idx_books_deposit_items_posted_line (UNIQUE constraint failed: books_deposit_items.line)", msg)
	}
	// The same row unposted saves: the index covers posted rows only.
	if err := rawSave(t, bare, depositItemsCol, map[string]any{
		"id": newRecordID(), "deposit": other.Id, "line": line.Id, "position": 0, "posted": false,
	}); err != nil {
		t.Fatalf("an unposted item of a held line was refused: %v", err)
	}
}

// A deposit writes no document balance and no party balance.
func TestDepositPost_WritesNoDocumentOrPartyBalance(t *testing.T) {
	src := depositSourcePosters["payment"](t)
	snapshot := func() string {
		var rows []string
		for _, col := range []string{"books_party_balances", "books_invoices"} {
			recs, err := src.app.FindAllRecords(col)
			if err != nil {
				t.Fatal(err)
			}
			for _, r := range recs {
				fields := r.PublicExport()
				delete(fields, "updated")
				rows = append(rows, fmt.Sprintf("%s %v", col, fields))
			}
		}
		sort.Strings(rows)
		return strings.Join(rows, "\n")
	}
	before := snapshot()
	if before == "" {
		t.Fatal("the payment book has no party balance or invoice row to compare")
	}
	d := src.depositOf(t)
	if after := snapshot(); after != before {
		t.Errorf("the deposit changed balance rows:\nbefore\n%s\nafter\n%s", before, after)
	}
	if err := voidDepositAs(src.app, d.Id, src.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the deposit: %v", err)
	}
	if after := snapshot(); after != before {
		t.Errorf("the deposit's void changed balance rows:\nbefore\n%s\nafter\n%s", before, after)
	}
}

// A deposit's bank line is a Books transaction that a bank line matches; its
// name is "Deposit <n>" with the deposit's date, and a void of the deposit
// removes the match.
func TestDeposit_BankLineIsMatchedAndItsVoidUnmatches(t *testing.T) {
	m := newBankMatchEnv(t)
	registerDepositGuards(m.app)
	funds := mkNumberedAccount(t, m.app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")
	item := lineOn(t, m.app, m.postedEntry(t, "2026-09-03", funds, 5000, 0).Id, funds)
	d := postedDepositOf(t, m.app, m.users.bookkeeper.Id, m.checking, matchBankDay, []*core.Record{item})
	bankLine := lineOn(t, m.app, d.GetString("entry"), m.checking)
	if got := nameOf(t, m.app, d.GetString("entry")); got != "Deposit "+d.GetString("number") || got != "Deposit 1001" {
		t.Errorf("the deposit entry's name = %q, want Deposit 1001", got)
	}
	if bankLine.GetString("date") != matchBankDay {
		t.Errorf("the bank line's date = %q, want %s", bankLine.GetString("date"), matchBankDay)
	}
	txn := m.bankTxn(t, matchBankDay, 5000, "for_review")
	if !suggests(t, m.app, txn, bankLine) {
		t.Error("the deposit's bank line is not suggested for the bank transaction of its amount")
	}
	m.mustMatch(t, txn, bankLine)
	requireStatusOf(t, m.app, txn, "reviewed")

	if err := voidDepositAs(m.app, d.Id, m.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the deposit: %v", err)
	}
	requireNoMatchOf(t, m.app, txn)
	requireStatusOf(t, m.app, txn, "for_review")
}

// --- Correction ---

func TestDepositCorrection_VoidsTheOriginalAndKeepsItsNumber(t *testing.T) {
	de := newDepositEnv(t)
	actor := de.users.bookkeeper.Id
	a := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	b := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two")
	c := de.undepositedItem(t, de.undeposited, depositItemDay, 1500, "Check three")
	de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 100, "First deposit")})
	original := de.postedDeposit(t, []*core.Record{a, b})

	correction := de.mkDeposit(t, map[string]any{"replaces": original.Id})
	// The correction may hold the items its original holds.
	mkDepositItem(t, de.app, correction, a, 0)
	mkDepositItem(t, de.app, correction, c, 1)
	correction = mustPostDeposit(t, de.app, correction.Id, actor)

	orig := reload(t, de.app, depositsCol, original.Id)
	if orig.GetString("status") != statusVoid || orig.GetString("replaced_by") != correction.Id {
		t.Errorf("original status %q replaced_by %q, want void and the correction", orig.GetString("status"), orig.GetString("replaced_by"))
	}
	if correction.GetString("number") != original.GetString("number") || correction.GetString("number") != "1002" {
		t.Errorf("correction number %q, want the original's 1002", correction.GetString("number"))
	}
	if s := reload(t, de.app, "books_journal_entries", original.GetString("entry")).GetString("status"); s != statusVoid {
		t.Errorf("the original's entry status %q, want void", s)
	}
	requireItemsPosted(t, de.app, orig, false)
	requireItemsPosted(t, de.app, correction, true)
	requireDepositLines(t, de.app, correction,
		wantLine(de.checking, 6500, 0, "", "", ""),
		wantLine(de.undeposited, 0, 6500, "", "", ""))
	if !isListed(t, de.app, b) {
		t.Error("the item the correction dropped is not listed as undeposited again")
	}
	for _, line := range []*core.Record{a, c} {
		if isListed(t, de.app, line) {
			t.Errorf("an item the correction holds (%s) is listed as undeposited", line.GetString("memo"))
		}
	}
	requireSequenceNext(t, de.app, depositSequenceID, 1003)
	requireNoDrift(t, de.app)
}

func TestDepositCorrection_OriginalMustBePosted(t *testing.T) {
	for _, status := range []string{statusDraft, statusVoid} {
		t.Run(status, func(t *testing.T) {
			de := newDepositEnv(t)
			original := de.mkDeposit(t, nil)
			mkDepositItem(t, de.app, original, de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one"), 0)
			if status == statusVoid {
				original = mustPostDeposit(t, de.app, original.Id, de.users.bookkeeper.Id)
				if err := voidDepositAs(de.app, original.Id, de.users.bookkeeper.Id); err != nil {
					t.Fatalf("void the original: %v", err)
				}
			}
			correction, err := de.newDeposit(map[string]any{"replaces": original.Id})
			if err == nil {
				mkDepositItem(t, de.app, correction, de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two"), 0)
				err = postDepositAs(de.app, correction.Id, de.users.bookkeeper.Id)
				if s := reload(t, de.app, depositsCol, correction.Id).GetString("status"); s != statusDraft {
					t.Errorf("the refused correction's status %q, want draft", s)
				}
			}
			if err == nil {
				t.Fatalf("a correction of a %s deposit was saved and posted", status)
			}
			if got := reload(t, de.app, depositsCol, original.Id); got.GetString("status") != status || got.GetString("replaced_by") != "" {
				t.Errorf("the original's status %q replaced_by %q, want %s and none", got.GetString("status"), got.GetString("replaced_by"), status)
			}
		})
	}
}

// --- Void ---

func TestDepositVoid_ReversesAndReleasesTheItems(t *testing.T) {
	de := newDepositEnv(t)
	a := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	b := de.undepositedItem(t, de.undeposited2, depositItemDay, 2500, "Cash box")
	d := de.postedDeposit(t, []*core.Record{a, b}, map[string]any{"account": de.interest.Id, "amount": 1240})
	if isListed(t, de.app, a) || isListed(t, de.app, b) {
		t.Fatal("a deposited line is listed as undeposited")
	}
	if err := voidDepositAs(de.app, d.Id, de.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the deposit: %v", err)
	}
	voided := reload(t, de.app, depositsCol, d.Id)
	if voided.GetString("status") != statusVoid || voided.GetString("number") != "1001" || voided.GetString("voided_by") != de.users.bookkeeper.Id {
		t.Errorf("status %q number %q voided_by %q, want void, 1001, the bookkeeper",
			voided.GetString("status"), voided.GetString("number"), voided.GetString("voided_by"))
	}
	reversal := findReversal(t, de.app, d.GetString("entry"))
	if reversal.GetString("date") != depositDay || reversal.GetString("origin") != originVoidReversal {
		t.Errorf("reversal date %q origin %q, want %s and void_reversal", reversal.GetString("date"), reversal.GetString("origin"), depositDay)
	}
	requireItemsPosted(t, de.app, voided, false)
	if !isListed(t, de.app, a) || !isListed(t, de.app, b) {
		t.Error("the void deposit's items are not listed as undeposited again")
	}
	// The reversal's line on Undeposited funds is not an undeposited item.
	if isListed(t, de.app, lineOn(t, de.app, reversal.Id, de.undeposited)) {
		t.Error("the void reversal's line is listed as undeposited")
	}
	requireNoDrift(t, de.app)
}

func TestDepositVoid_RefusedOnOrBeforeTheCloseDate(t *testing.T) {
	de := newDepositEnv(t)
	d := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")})
	setCloseDate(t, de.app, "2026-11-30")
	requireRefused(t, voidDepositAs(de.app, d.Id, de.users.bookkeeper.Id), "closed through 2026-11-30")
	if s := reload(t, de.app, depositsCol, d.Id).GetString("status"); s != statusPosted {
		t.Errorf("a refused void left status %q, want posted", s)
	}
	requireItemsPosted(t, de.app, d, true)
	if s := reload(t, de.app, "books_journal_entries", d.GetString("entry")).GetString("status"); s != statusPosted {
		t.Errorf("a refused void left the entry %q, want posted", s)
	}
}
