package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// The bank categorization (bank-categorize spec §4 Schema, §4 Server): a
// writer creates a books_bank_categorizations row that names one For review
// bank transaction, a kind (categorize or transfer), an optional payee, a memo
// and the lines; the Go hook posts a journal entry or a transfer for it,
// matches the bank transaction to the entry's line on the connection's account
// and stamps the entry. A delete is the undo: it voids the entry and the bank
// transaction returns to For review.

const (
	catCollection   = "books_bank_categorizations"
	catDay          = "2026-09-10"
	msgCatBoth      = "Choose a customer or a vendor, not both."
	msgCatMaxLines  = "A split holds at most 50 lines."
	msgCatOwnLine1  = "Line 1: choose an account other than 1000 Business Checking."
	msgCatPayments  = "Line 1: record a customer payment with Receive payment, or a bill payment with Pay bills, then match it."
	msgCatMatchUndo = "This transaction was added to Books. Use Undo to void its entry."
	journalSeqID    = "booksseqjournal"
)

func wantCatClosed(closeDate, day string) string {
	return fmt.Sprintf("The books are closed through %s. Ask a Books admin for a close-date override to post on %s.", closeDate, day)
}

func wantCatNotTransfer(line int, name string) string {
	return fmt.Sprintf("Line %d: %s cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account.", line, name)
}

// catEnv is the bank match env (1000 Business Checking connected, 1010
// Business Savings, 2100 Company Card, Consulting Income, Rent) with the
// accounts and the payees a categorization names.
type catEnv struct {
	*bankMatchEnv
	receivable, payable, pettyCash *core.Record
	customer, vendor               *core.Record
}

func newCatEnv(t *testing.T) *catEnv {
	t.Helper()
	return catEnvOn(t, newBankMatchEnv(t))
}

func catEnvOn(t *testing.T, m *bankMatchEnv) *catEnv {
	t.Helper()
	pettyCash := mkAccount(t, m.app, "Old Petty Cash", "bank", "cash_on_hand")
	if err := setFields(t, m.app, "books_accounts", pettyCash.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Old Petty Cash inactive: %v", err)
	}
	return &catEnv{
		bankMatchEnv: m,
		receivable:   mkNumberedAccount(t, m.app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		payable:      mkNumberedAccount(t, m.app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
		pettyCash:    pettyCash,
		customer:     mkCustomer(t, m.app, "Harbor Cafe", ""),
		vendor:       mkVendor(t, m.app, "Summit Supply"),
	}
}

// catLine is one line of the lines json: an account id, an amount in minor
// units (signed for the bank transaction's own direction) and a memo.
type catLine struct {
	Account string `json:"account"`
	Amount  int    `json:"amount"`
	Memo    string `json:"memo"`
}

func catBody(t testing.TB, txn *core.Record, kind string, lines any, extra map[string]any) string {
	t.Helper()
	body := map[string]any{"bank_transaction": txn.Id, "kind": kind, "memo": "", "lines": lines}
	for k, v := range extra {
		body[k] = v
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// categorize creates a categorization as user through the REST API, as the
// client's insert does.
func (c *catEnv) categorize(t testing.TB, user, txn *core.Record, kind string, lines any, extra map[string]any) apiAnswer {
	t.Helper()
	return c.send(t, user, http.MethodPost, collectionURL(catCollection), catBody(t, txn, kind, lines, extra))
}

func (c *catEnv) mustCategorize(t testing.TB, txn *core.Record, kind string, lines []catLine, extra map[string]any) *core.Record {
	t.Helper()
	answer := c.categorize(t, c.users.bookkeeper, txn, kind, lines, extra)
	answer.requireStatus(t, http.StatusOK)
	return reload(t, c.app, catCollection, answer.id(t))
}

// entryOf is the entry the categorization's hook posted and stamped.
func (c *catEnv) entryOf(t testing.TB, cat *core.Record) *core.Record {
	t.Helper()
	id := reload(t, c.app, catCollection, cat.Id).GetString("entry")
	if id == "" {
		t.Fatalf("categorization %s has no entry", cat.Id)
	}
	return reload(t, c.app, "books_journal_entries", id)
}

// requireNotAdded checks that a refused create wrote nothing: no
// categorization, no entry, no match, and the bank transaction's status as
// before.
func (c *catEnv) requireNotAdded(t testing.TB, txn *core.Record, status string, entriesBefore int64) {
	t.Helper()
	if n := countOf(t, c.app, catCollection, dbx.HashExp{"bank_transaction": txn.Id}); n != 0 {
		t.Errorf("%d categorizations of %s after a refusal, want none", n, txn.GetString("description"))
	}
	if n := countOf(t, c.app, "books_journal_entries", nil); n != entriesBefore {
		t.Errorf("%d journal entries after a refusal, want the %d before it", n, entriesBefore)
	}
	requireNoMatchOf(t, c.app, txn)
	requireStatusOf(t, c.app, txn, status)
}

// entryLineMemo is one line of an entry, in order, with its memo.
type entryLineMemo struct {
	account       string
	debit, credit int
	memo          string
}

func linesWithMemo(t testing.TB, app core.App, entryID string) []entryLineMemo {
	t.Helper()
	lines, err := entryLines(app, entryID)
	if err != nil {
		t.Fatalf("read the lines of %s: %v", entryID, err)
	}
	out := make([]entryLineMemo, len(lines))
	for i, l := range lines {
		out[i] = entryLineMemo{account: l.GetString("account"), debit: l.GetInt("debit"), credit: l.GetInt("credit"), memo: l.GetString("memo")}
	}
	return out
}

func requireLines(t testing.TB, got []entryLine, want []entryLine) {
	t.Helper()
	if fmt.Sprintf("%+v", got) != fmt.Sprintf("%+v", want) {
		t.Errorf("entry lines =\n%+v\nwant\n%+v", got, want)
	}
}

func TestBankCategorize_Refusals(t *testing.T) {
	type built struct {
		txn    *core.Record
		kind   string
		lines  any
		extra  map[string]any
		want   string
		status string
	}
	one := func(account *core.Record, amount int) []catLine {
		return []catLine{{Account: account.Id, Amount: amount}}
	}
	cases := []struct {
		name  string
		build func(t *testing.T, c *catEnv) built
	}{
		{"a reviewed transaction", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "reviewed"), "categorize", one(c.rent, 8647), nil, msgBankMatchReviewed, "reviewed"}
		}},
		{"an excluded transaction", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "excluded"), "categorize", one(c.rent, 8647), nil, msgBankMatchExcluded, "excluded"}
		}},
		{"a customer and a vendor", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize", one(c.rent, 8647),
				map[string]any{"customer": c.customer.Id, "vendor": c.vendor.Id}, msgCatBoth, "for_review"}
		}},
		{"a line with no account", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
				[]catLine{{Account: c.rent.Id, Amount: 8000}, {Account: "", Amount: 647}}, nil,
				"Line 2: choose an account.", "for_review"}
		}},
		{"an amount of 0", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
				[]catLine{{Account: c.rent.Id, Amount: 8647}, {Account: c.revenue.Id, Amount: 0}}, nil,
				"Line 2: enter an amount other than 0.", "for_review"}
		}},
		{"51 lines", func(t *testing.T, c *catEnv) built {
			lines := make([]catLine, 51)
			for i := range lines {
				lines[i] = catLine{Account: c.rent.Id, Amount: 100}
			}
			return built{c.bankTxn(t, catDay, -5100, "for_review"), "categorize", lines, nil, msgCatMaxLines, "for_review"}
		}},
		{"the connection's own account", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize", one(c.checking, 8647), nil, msgCatOwnLine1, "for_review"}
		}},
		{"an Accounts receivable account", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, 8647, "for_review"), "categorize", one(c.receivable, 8647), nil, msgCatPayments, "for_review"}
		}},
		{"an Accounts payable account", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize", one(c.payable, 8647), nil, msgCatPayments, "for_review"}
		}},
		{"a sum that is not the bank amount", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, 97000, "for_review"), "categorize",
				[]catLine{{Account: c.revenue.Id, Amount: 60000}, {Account: c.revenue.Id, Amount: 25000}}, nil,
				"The lines total $850.00. The bank transaction is $970.00.", "for_review"}
		}},
		{"a transfer to an expense account", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -50000, "for_review"), "transfer", one(c.rent, 50000), nil,
				wantCatNotTransfer(1, "Rent"), "for_review"}
		}},
		{"an inactive account", func(t *testing.T, c *catEnv) built {
			// Line 2 of the form; the journal line would be line 3.
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
				[]catLine{{Account: c.rent.Id, Amount: 8000}, {Account: c.pettyCash.Id, Amount: 647}}, nil,
				"Line 2: account Old Petty Cash is inactive.", "for_review"}
		}},
		{"an account that does not exist", func(t *testing.T, c *catEnv) built {
			return built{c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
				[]catLine{{Account: "nosuchaccount01", Amount: 8647}}, nil,
				"Line 1: the account does not exist.", "for_review"}
		}},
		{"a bank date on or before the close date", func(t *testing.T, c *catEnv) built {
			txn := c.bankTxn(t, catDay, -8647, "for_review")
			setCloseDate(t, c.app, "2026-09-30")
			return built{txn, "categorize", one(c.rent, 8647), nil, wantCatClosed("2026-09-30", catDay), "for_review"}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := newCatEnv(t)
			b := tc.build(t, c)
			before := countOf(t, c.app, "books_journal_entries", nil)
			c.categorize(t, c.users.bookkeeper, b.txn, b.kind, b.lines, b.extra).requireRefusal(t, b.want)
			c.requireNotAdded(t, b.txn, b.status, before)
		})
	}

	// The spec names no text for these shapes; each is refused and writes
	// nothing.
	shapes := []struct {
		name  string
		build func(t *testing.T, c *catEnv) built
	}{
		{"no line", func(t *testing.T, c *catEnv) built {
			return built{txn: c.bankTxn(t, catDay, -8647, "for_review"), kind: "categorize", lines: []catLine{}}
		}},
		{"lines that is not a list", func(t *testing.T, c *catEnv) built {
			return built{txn: c.bankTxn(t, catDay, -8647, "for_review"), kind: "categorize",
				lines: map[string]any{"account": c.rent.Id, "amount": 8647}}
		}},
		{"a transfer with two lines", func(t *testing.T, c *catEnv) built {
			return built{txn: c.bankTxn(t, catDay, -50000, "for_review"), kind: "transfer",
				lines: []catLine{{Account: c.savings.Id, Amount: 25000}, {Account: c.card.Id, Amount: 25000}}}
		}},
		{"a transfer whose amount is not the bank amount", func(t *testing.T, c *catEnv) built {
			return built{txn: c.bankTxn(t, catDay, -50000, "for_review"), kind: "transfer",
				lines: []catLine{{Account: c.savings.Id, Amount: 40000}}}
		}},
	}
	for _, tc := range shapes {
		t.Run(tc.name, func(t *testing.T) {
			c := newCatEnv(t)
			b := tc.build(t, c)
			before := countOf(t, c.app, "books_journal_entries", nil)
			answer := c.categorize(t, c.users.bookkeeper, b.txn, b.kind, b.lines, nil)
			answer.requireStatus(t, http.StatusBadRequest)
			if msg, _ := answer.json(t)["message"].(string); msg == "" {
				t.Errorf("the refusal has no message: %s", answer.body)
			}
			c.requireNotAdded(t, b.txn, "for_review", before)
		})
	}
}

func TestBankCategorize_PostsSpentOneLine(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, -8647, "for_review")
	next := reload(t, c.app, "books_doc_sequences", journalSeqID).GetInt("next_number")

	cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}},
		map[string]any{"vendor": c.vendor.Id, "memo": "September rent"})

	entry := c.entryOf(t, cat)
	got := map[string]string{
		"doc_type": entry.GetString("doc_type"), "origin": entry.GetString("origin"),
		"status": entry.GetString("status"), "date": entry.GetString("date"),
		"memo": entry.GetString("memo"), "number": entry.GetString("number"),
		"posted_by": entry.GetString("posted_by"),
	}
	want := map[string]string{
		"doc_type": "journal", "origin": "manual", "status": "posted", "date": catDay,
		"memo": "September rent", "number": fmt.Sprint(next), "posted_by": c.users.bookkeeper.Id,
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry = %v, want %v", got, want)
	}
	requireSequenceNext(t, c.app, journalSeqID, next+1)
	requireLines(t, entryLinesOf(t, c.app, entry.Id), []entryLine{
		{account: c.checking.Id, credit: 8647, vendor: c.vendor.Id},
		{account: c.rent.Id, debit: 8647, vendor: c.vendor.Id},
	})
}

func TestBankCategorize_PostsReceivedOneLine(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, 120000, "for_review")

	cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.revenue.Id, Amount: 120000}},
		map[string]any{"customer": c.customer.Id})

	requireLines(t, entryLinesOf(t, c.app, c.entryOf(t, cat).Id), []entryLine{
		{account: c.checking.Id, debit: 120000, customer: c.customer.Id},
		{account: c.revenue.Id, credit: 120000, customer: c.customer.Id},
	})
}

func TestBankCategorize_SplitWithANegativeLine(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, 97000, "for_review")

	cat := c.mustCategorize(t, txn, "categorize", []catLine{
		{Account: c.revenue.Id, Amount: 100000, Memo: "Consulting, September"},
		{Account: c.rent.Id, Amount: -3000, Memo: "Bank fee"},
	}, nil)

	got := linesWithMemo(t, c.app, c.entryOf(t, cat).Id)
	if len(got) != 3 {
		t.Fatalf("%d entry lines, want 3: %+v", len(got), got)
	}
	want := []entryLineMemo{
		{account: c.checking.Id, debit: 97000},
		{account: c.revenue.Id, credit: 100000, memo: "Consulting, September"},
		{account: c.rent.Id, debit: 3000, memo: "Bank fee"},
	}
	for i := range want {
		g := got[i]
		w := want[i]
		if g.account != w.account || g.debit != w.debit || g.credit != w.credit {
			t.Errorf("line %d = %+v, want %+v", i+1, g, w)
		}
		if i > 0 && g.memo != w.memo {
			t.Errorf("line %d memo = %q, want the split line's %q", i+1, g.memo, w.memo)
		}
	}
}

func TestBankCategorize_SplitOfThreeLines(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, 97000, "for_review")

	cat := c.mustCategorize(t, txn, "categorize", []catLine{
		{Account: c.revenue.Id, Amount: 70000},
		{Account: c.savings.Id, Amount: 30000},
		{Account: c.rent.Id, Amount: -3000},
	}, nil)

	entry := c.entryOf(t, cat)
	got := entryLinesOf(t, c.app, entry.Id)
	requireLines(t, got, []entryLine{
		{account: c.checking.Id, debit: 97000},
		{account: c.revenue.Id, credit: 70000},
		{account: c.savings.Id, credit: 30000},
		{account: c.rent.Id, debit: 3000},
	})
	debits, credits := 0, 0
	for _, l := range got {
		debits += l.debit
		credits += l.credit
	}
	if debits != credits {
		t.Errorf("the entry does not balance: debits %d, credits %d", debits, credits)
	}
	if entry.GetString("status") != statusPosted {
		t.Errorf("entry status = %q, want posted", entry.GetString("status"))
	}
}

func TestBankCategorize_Transfer(t *testing.T) {
	t.Run("spent", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -50000, "for_review")
		cat := c.mustCategorize(t, txn, "transfer", []catLine{{Account: c.savings.Id, Amount: 50000}}, nil)
		entry := c.entryOf(t, cat)
		if got := entry.GetString("doc_type"); got != docTypeTransfer {
			t.Errorf("doc_type = %q, want transfer", got)
		}
		if got := entry.GetString("status"); got != statusPosted {
			t.Errorf("status = %q, want posted", got)
		}
		requireLines(t, entryLinesOf(t, c.app, entry.Id), []entryLine{
			{account: c.checking.Id, credit: 50000},
			{account: c.savings.Id, debit: 50000},
		})
	})

	t.Run("received", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, 50000, "for_review")
		cat := c.mustCategorize(t, txn, "transfer", []catLine{{Account: c.card.Id, Amount: 50000}}, nil)
		entry := c.entryOf(t, cat)
		if got := entry.GetString("doc_type"); got != docTypeTransfer {
			t.Errorf("doc_type = %q, want transfer", got)
		}
		requireLines(t, entryLinesOf(t, c.app, entry.Id), []entryLine{
			{account: c.card.Id, credit: 50000},
			{account: c.checking.Id, debit: 50000},
		})
	})
}

func TestBankCategorize_MatchesAndStamps(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, -8647, "for_review")

	cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)

	entry := c.entryOf(t, cat)
	bankLine := lineOn(t, c.app, entry.Id, c.checking)
	requireStatusOf(t, c.app, txn, "reviewed")
	matches, err := c.app.FindAllRecords(matchesCollection, dbx.HashExp{"bank_transaction": txn.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 1 {
		t.Fatalf("%d matches of the bank transaction, want 1", len(matches))
	}
	if got := matches[0].GetStringSlice("lines"); len(got) != 1 || got[0] != bankLine.Id {
		t.Errorf("match lines = %v, want the entry's line on 1000 [%s]", got, bankLine.Id)
	}
	if n := countOf(t, c.app, matchLinesCollectn, dbx.HashExp{"bank_transaction": txn.Id, "line": bankLine.Id, "entry": entry.Id}); n != 1 {
		t.Errorf("%d match lines for the entry's line on 1000, want 1", n)
	}
	if n := countOf(t, c.app, matchLinesCollectn, dbx.HashExp{"bank_transaction": txn.Id}); n != 1 {
		t.Errorf("%d match lines of the bank transaction, want 1", n)
	}
	stored := reload(t, c.app, catCollection, cat.Id)
	stamps := map[string]string{
		"connection": stored.GetString("connection"), "entry": stored.GetString("entry"),
		"created_by": stored.GetString("created_by"),
	}
	wantStamps := map[string]string{"connection": c.connection.Id, "entry": entry.Id, "created_by": c.users.bookkeeper.Id}
	if fmt.Sprint(stamps) != fmt.Sprint(wantStamps) {
		t.Errorf("stamped fields = %v, want %v", stamps, wantStamps)
	}

	for _, field := range []string{"connection", "entry", "created_by"} {
		t.Run("a writer cannot send "+field, func(t *testing.T) {
			other := c.bankTxn(t, catDay, -8647, "for_review")
			value := map[string]string{"connection": c.connection.Id, "entry": entry.Id, "created_by": c.users.bookkeeper.Id}[field]
			before := countOf(t, c.app, "books_journal_entries", nil)
			c.categorize(t, c.users.bookkeeper, other, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}},
				map[string]any{field: value}).requireStatus(t, http.StatusBadRequest)
			c.requireNotAdded(t, other, "for_review", before)
		})
	}
}

func TestBankCategorize_Reader(t *testing.T) {
	c := newCatEnv(t)

	t.Run("a reader cannot create", func(t *testing.T) {
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		before := countOf(t, c.app, "books_journal_entries", nil)
		c.categorize(t, c.users.readOnly, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil).
			requireStatus(t, http.StatusBadRequest)
		c.requireNotAdded(t, txn, "for_review", before)
	})

	t.Run("a reader cannot delete", func(t *testing.T) {
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)
		c.send(t, c.users.readOnly, http.MethodDelete, collectionURL(catCollection)+"/"+cat.Id, "").
			requireStatus(t, http.StatusNotFound)
		reload(t, c.app, catCollection, cat.Id)
		if got := c.entryOf(t, cat).GetString("status"); got != statusPosted {
			t.Errorf("entry status = %q after a reader's delete, want posted", got)
		}
		requireStatusOf(t, c.app, txn, "reviewed")
	})
}

// Two creates for one bank transaction, sent together: the serialized check
// lets one through, and the unique index on bank_transaction is the last guard.
func TestBankCategorize_Concurrent(t *testing.T) {
	c := newCatEnv(t)
	txn := c.bankTxn(t, catDay, -8647, "for_review")
	entriesBefore := countOf(t, c.app, "books_journal_entries", nil)
	mux := c.rest(t).mux
	token := tokenFor(t, c.users.bookkeeper)
	body := catBody(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)
	answers := make([]apiAnswer, 2)
	var start, done sync.WaitGroup
	start.Add(1)
	for i := range answers {
		done.Add(1)
		go func() {
			defer done.Done()
			req := httptest.NewRequest(http.MethodPost, collectionURL(catCollection), strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", token)
			rec := httptest.NewRecorder()
			start.Wait()
			mux.ServeHTTP(rec, req)
			answers[i] = apiAnswer{status: rec.Code, body: rec.Body.String()}
		}()
	}
	start.Done()
	done.Wait()

	won, lost := 0, 0
	for _, a := range answers {
		switch a.status {
		case http.StatusOK:
			won++
		case http.StatusBadRequest:
			lost++
		}
	}
	if won != 1 || lost != 1 {
		t.Fatalf("answers %+v, want one 200 and one 400", answers)
	}
	if n := countOf(t, c.app, catCollection, nil); n != 1 {
		t.Errorf("%d categorizations, want 1", n)
	}
	if n := countOf(t, c.app, "books_journal_entries", nil); n != entriesBefore+1 {
		t.Errorf("%d journal entries, want the %d before and the one posted", n, entriesBefore)
	}
	requireStatusOf(t, c.app, txn, "reviewed")
}

func TestBankCategorize_Undo(t *testing.T) {
	t.Run("a writer undoes a categorization", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)
		entry := c.entryOf(t, cat)

		// Another writer undoes it, so voided_by is the actor of the delete,
		// not the one who posted.
		c.send(t, c.users.admin, http.MethodDelete, collectionURL(catCollection)+"/"+cat.Id, "").
			requireStatus(t, http.StatusNoContent)

		voided := reload(t, c.app, "books_journal_entries", entry.Id)
		if voided.GetString("status") != statusVoid || voided.GetString("voided_by") != c.users.admin.Id {
			t.Errorf("entry status %q voided_by %q, want void by %q", voided.GetString("status"), voided.GetString("voided_by"), c.users.admin.Id)
		}
		if voided.GetString("number") != entry.GetString("number") {
			t.Errorf("entry number = %q after the void, want %q kept", voided.GetString("number"), entry.GetString("number"))
		}
		rev := findReversal(t, c.app, entry.Id)
		if rev.GetString("status") != statusPosted || rev.GetString("origin") != originVoidReversal {
			t.Errorf("reversal status %q origin %q, want a posted void reversal", rev.GetString("status"), rev.GetString("origin"))
		}
		requireNoMatchOf(t, c.app, txn)
		requireStatusOf(t, c.app, txn, "for_review")
		if n := countOf(t, c.app, catCollection, dbx.HashExp{"bank_transaction": txn.Id}); n != 0 {
			t.Errorf("%d categorizations after the undo, want none", n)
		}
	})

	t.Run("the close date refuses the undo", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)
		entry := c.entryOf(t, cat)
		setCloseDate(t, c.app, "2026-09-30")

		c.send(t, c.users.bookkeeper, http.MethodDelete, collectionURL(catCollection)+"/"+cat.Id, "").
			requireRefusal(t, wantCatClosed("2026-09-30", catDay))

		reload(t, c.app, catCollection, cat.Id)
		if got := reload(t, c.app, "books_journal_entries", entry.Id).GetString("status"); got != statusPosted {
			t.Errorf("entry status = %q after a refused undo, want posted", got)
		}
		if n := countOf(t, c.app, "books_journal_entries", dbx.HashExp{"reverses": entry.Id}); n != 0 {
			t.Errorf("%d reversals after a refused undo, want none", n)
		}
		if n := countOf(t, c.app, matchesCollection, dbx.HashExp{"bank_transaction": txn.Id}); n != 1 {
			t.Errorf("%d matches after a refused undo, want 1", n)
		}
		requireStatusOf(t, c.app, txn, "reviewed")
	})
}

// requireBackInReview checks what a void of an added entry leaves: the entry
// void with one posted reversal, no categorization, no match, the bank
// transaction For review.
func (c *catEnv) requireBackInReview(t testing.TB, txn, entry *core.Record) {
	t.Helper()
	if got := reload(t, c.app, "books_journal_entries", entry.Id).GetString("status"); got != statusVoid {
		t.Errorf("entry status = %q, want void", got)
	}
	if n := countOf(t, c.app, "books_journal_entries", dbx.HashExp{"reverses": entry.Id, "status": statusPosted}); n != 1 {
		t.Errorf("%d posted reversals of the entry, want exactly 1", n)
	}
	if n := countOf(t, c.app, catCollection, nil); n != 0 {
		t.Errorf("%d categorizations, want none", n)
	}
	requireNoMatchOf(t, c.app, txn)
	requireStatusOf(t, c.app, txn, "for_review")
}

func TestBankCategorize_VoidAndEditElsewhere(t *testing.T) {
	t.Run("a void from the entry screen", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		entry := c.entryOf(t, c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil))

		c.send(t, c.users.bookkeeper, http.MethodPatch, collectionURL("books_journal_entries")+"/"+entry.Id, `{"status":"void"}`).
			requireStatus(t, http.StatusOK)

		c.requireBackInReview(t, txn, entry)
	})

	t.Run("an edit from the entry screen", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		entry := c.entryOf(t, c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil))

		draft := saveRecord(t, c.app, "books_journal_entries", map[string]any{
			"date": catDay, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD",
			"replaces": entry.Id, "memo": "Corrected",
		})
		saveRecord(t, c.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": c.checking.Id, "credit": 8647, "position": 0, "currency": "USD"})
		saveRecord(t, c.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": c.revenue.Id, "debit": 8647, "position": 1, "currency": "USD"})
		corrected := mustPost(t, c.app, draft.Id, c.users.bookkeeper.Id)

		if corrected.GetString("status") != statusPosted {
			t.Errorf("correction status = %q, want posted", corrected.GetString("status"))
		}
		c.requireBackInReview(t, txn, entry)
	})
}

func TestBankCategorize_MatchDeleteRefused(t *testing.T) {
	t.Run("the match of an added transaction", func(t *testing.T) {
		c := newCatEnv(t)
		txn := c.bankTxn(t, catDay, -8647, "for_review")
		cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)
		match, err := c.app.FindFirstRecordByFilter(matchesCollection, "bank_transaction = {:t}", dbx.Params{"t": txn.Id})
		if err != nil {
			t.Fatalf("the match of the added transaction: %v", err)
		}

		c.send(t, c.users.bookkeeper, http.MethodDelete, collectionURL(matchesCollection)+"/"+match.Id, "").
			requireRefusal(t, msgCatMatchUndo)

		reload(t, c.app, matchesCollection, match.Id)
		reload(t, c.app, catCollection, cat.Id)
		requireStatusOf(t, c.app, txn, "reviewed")
		if got := c.entryOf(t, cat).GetString("status"); got != statusPosted {
			t.Errorf("entry status = %q after a refused match delete, want posted", got)
		}
	})

	t.Run("the match of a matched transaction", func(t *testing.T) {
		c := newCatEnv(t)
		tr := c.postedTransfer(t, catDay, c.checking, c.savings, 86815)
		txn := c.bankTxn(t, catDay, -86815, "for_review")
		id := c.mustMatch(t, txn, lineOn(t, c.app, tr.Id, c.checking))
		// A categorized row of another transaction is beside it.
		c.mustCategorize(t, c.bankTxn(t, catDay, -8647, "for_review"), "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)

		c.send(t, c.users.bookkeeper, http.MethodDelete, collectionURL(matchesCollection)+"/"+id, "").
			requireStatus(t, http.StatusNoContent)
		requireNoMatchOf(t, c.app, txn)
		requireStatusOf(t, c.app, txn, "for_review")
	})
}

func TestBankCategorize_Disconnect(t *testing.T) {
	c := newCatEnv(t)
	spent := c.entryOf(t, c.mustCategorize(t, c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
		[]catLine{{Account: c.rent.Id, Amount: 8647}}, nil))
	moved := c.entryOf(t, c.mustCategorize(t, c.bankTxn(t, catDay, -50000, "for_review"), "transfer",
		[]catLine{{Account: c.savings.Id, Amount: 50000}}, nil))

	// A disconnect removes the connection's bank transactions (the cascade of
	// TestBankMatch_Disconnect).
	rows, err := c.app.FindAllRecords("books_bank_transactions", dbx.HashExp{"connection": c.connection.Id})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if err := c.app.Delete(r); err != nil {
			t.Fatalf("delete bank transaction %s: %v", r.Id, err)
		}
	}

	if n := countOf(t, c.app, "books_bank_transactions", dbx.HashExp{"connection": c.connection.Id}); n != 0 {
		t.Errorf("%d bank transactions after the disconnect, want 0", n)
	}
	if n := countOf(t, c.app, catCollection, nil); n != 0 {
		t.Errorf("%d categorizations after the disconnect, want 0", n)
	}
	if n := countOf(t, c.app, matchesCollection, nil); n != 0 {
		t.Errorf("%d matches after the disconnect, want 0", n)
	}
	if n := countOf(t, c.app, matchLinesCollectn, nil); n != 0 {
		t.Errorf("%d match lines after the disconnect, want 0", n)
	}
	for _, e := range []*core.Record{spent, moved} {
		if got := reload(t, c.app, "books_journal_entries", e.Id).GetString("status"); got != statusPosted {
			t.Errorf("%s status = %q after the disconnect, want posted", entryName(e), got)
		}
		if n := countOf(t, c.app, "books_journal_entries", dbx.HashExp{"reverses": e.Id}); n != 0 {
			t.Errorf("%d reversals of %s after the disconnect, want none", n, entryName(e))
		}
	}
}

func TestBankCategorize_Audit(t *testing.T) {
	c := newCatEnv(t)
	registerAudit(&pocketbase.PocketBase{App: c.app})
	config, ok := auditedCollections(c.app)[catCollection]
	if !ok {
		t.Fatal("books_bank_categorizations is not audited")
	}
	typeLabel := ""
	for _, o := range auditRecordTypeOptions() {
		if o.Value == catCollection {
			typeLabel = o.Label
		}
	}
	if typeLabel != "Bank categorization" {
		t.Errorf("record type label = %q, want %q", typeLabel, "Bank categorization")
	}

	txn := c.bankTxn(t, catDay, -8647, "for_review")
	rowsBefore := countOf(t, c.app, "audit_logs", nil)
	cat := c.mustCategorize(t, txn, "categorize", []catLine{{Account: c.rent.Id, Amount: 8647}}, nil)

	want := catDay + " " + txn.GetString("description")
	if got := config.ExtractLabel(reload(t, c.app, catCollection, cat.Id)); got != want {
		t.Errorf("categorization label = %q, want %q", got, want)
	}
	created := awaitAuditRow(t, c.app, catCollection, "created", cat.Id)
	if got := created.GetString("resource_label"); got != want {
		t.Errorf("created audit row label = %q, want %q", got, want)
	}

	// A later create writes its own row after the first; once it is in, any
	// second row of the first create has had its turn too.
	later := c.mustCategorize(t, c.bankTxn(t, catDay, -1200, "for_review"), "categorize",
		[]catLine{{Account: c.rent.Id, Amount: 1200}}, nil)
	awaitAuditRow(t, c.app, catCollection, "created", later.Id)

	// One create is one person's write: one "created" row of the
	// categorization. The entry, its lines, the match and the bank
	// transaction's move are Books' own writes inside it, and the save that
	// stamps entry is not an edit, so none of them writes a row.
	rows, err := c.app.FindAllRecords("audit_logs", dbx.HashExp{"resource_id": cat.Id})
	if err != nil {
		t.Fatal(err)
	}
	var actions []string
	for _, r := range rows {
		actions = append(actions, r.GetString("resource_type")+" "+r.GetString("action"))
	}
	if fmt.Sprint(actions) != fmt.Sprint([]string{catCollection + " created"}) {
		t.Errorf("audit rows of the categorization = %v, want only %q", actions, catCollection+" created")
	}
	if n := countOf(t, c.app, "audit_logs", nil); n != rowsBefore+2 {
		t.Errorf("%d audit rows after two creates, want %d: one for each", n, rowsBefore+2)
	}
}

// bankCategorizeCase is one row of testdata/bank_categorize_cases.json, the
// table tests/bank-categorize.test.ts runs too. accountKinds names the account
// of each line: "connection" (the connected 1000 Business Checking),
// "expense" (Rent), "income" (Consulting Income), "bank" (1010 Business
// Savings), "credit_card" (2100 Company Card), "accounts_receivable" and
// "accounts_payable".
type bankCategorizeCase struct {
	Name       string `json:"name"`
	BankAmount int    `json:"bankAmount"`
	Kind       string `json:"kind"`
	Lines      []struct {
		Amount int    `json:"amount"`
		Memo   string `json:"memo"`
	} `json:"lines"`
	AccountKinds []string `json:"accountKinds"`
	Valid        bool     `json:"valid"`
	Message      string   `json:"message"`
}

func loadBankCategorizeCases(t testing.TB) []bankCategorizeCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/bank_categorize_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []bankCategorizeCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("testdata/bank_categorize_cases.json holds no case")
	}
	return cases
}

func (c *catEnv) accountOfKind(t testing.TB, kind string) *core.Record {
	t.Helper()
	switch kind {
	case "connection":
		return c.checking
	case "expense":
		return c.rent
	case "income":
		return c.revenue
	case "bank":
		return c.savings
	case "credit_card":
		return c.card
	case "accounts_receivable":
		return c.receivable
	case "accounts_payable":
		return c.payable
	}
	t.Fatalf("unknown account kind %q", kind)
	return nil
}

func TestBankCategorize_SharedCases(t *testing.T) {
	for _, tc := range loadBankCategorizeCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			if len(tc.AccountKinds) != len(tc.Lines) {
				t.Fatalf("case has %d lines and %d account kinds", len(tc.Lines), len(tc.AccountKinds))
			}
			if tc.Valid != (tc.Message == "") {
				t.Fatalf("case valid %v with message %q: a refused case names its message, a valid one none", tc.Valid, tc.Message)
			}
			c := newCatEnv(t)
			lines := make([]catLine, len(tc.Lines))
			for i, l := range tc.Lines {
				lines[i] = catLine{Account: c.accountOfKind(t, tc.AccountKinds[i]).Id, Amount: l.Amount, Memo: l.Memo}
			}
			txn := c.bankTxn(t, catDay, tc.BankAmount, "for_review")
			before := countOf(t, c.app, "books_journal_entries", nil)
			answer := c.categorize(t, c.users.bookkeeper, txn, tc.Kind, lines, nil)
			if tc.Valid {
				answer.requireStatus(t, http.StatusOK)
				requireStatusOf(t, c.app, txn, "reviewed")
				return
			}
			answer.requireRefusal(t, tc.Message)
			c.requireNotAdded(t, txn, "for_review", before)
		})
	}
}
