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
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The bank match (bank-match spec §3 "What can be matched", §4 Server): a
// writer creates a books_bank_matches row that names one For review bank
// transaction and the journal lines it is; the Go hook checks every line,
// writes one books_bank_match_lines row for each and moves the bank
// transaction to Reviewed. Nothing posts.

const (
	matchBankDay       = "2026-09-10"
	msgMatchReviewed   = "This transaction is already reviewed."
	msgMatchExcluded   = "This transaction is excluded. Move it to For review first."
	msgFailedToCreate  = "Failed to create record."
	matchSuggestions   = "books_bank_match_suggestions"
	matchesCollection  = "books_bank_matches"
	matchLinesCollectn = "books_bank_match_lines"
)

func wantMatchVoid(name string) string      { return name + " is void." }
func wantMatchNotPosted(name string) string { return name + " is not posted." }
func wantMatchTaken(name string) string {
	return name + " is already matched to another bank transaction."
}
func wantMatchNotOn(name, account string) string { return name + " is not on " + account + "." }
func wantMatchMoneyInForOut(name string) string {
	return name + " is money in; this bank transaction is money out."
}
func wantMatchMoneyOutForIn(name string) string {
	return name + " is money out; this bank transaction is money in."
}

// bankMatchEnv is a book with every ledger hook bound (registerLedger binds
// banking, and banking binds the match) and the e2e chart's 1000 Business
// Checking, 1010 Business Savings and 2100 Company Card, each but savings
// connected to Banking with one stored statement file.
type bankMatchEnv struct {
	app                                *tests.TestApp
	users                              levelUsers
	checking, savings, card            *core.Record
	revenue, rent                      *core.Record
	connection, file, cardConn, cardFl *core.Record
	bankImport, cardImport             *core.Record
	client                             *restClient
	seq                                int
}

func newBankMatchEnv(t *testing.T) *bankMatchEnv {
	t.Helper()
	env := newLedgerEnv(t)
	return bankMatchEnvOn(t, env.app, env.users,
		mkNumberedAccount(t, env.app, "Business Checking", "1000", "bank", "checking"),
		mkNumberedAccount(t, env.app, "Business Savings", "1010", "bank", "savings"),
		mkNumberedAccount(t, env.app, "Company Card", "2100", "credit_card", "credit_card"),
		env.revenue, env.rent)
}

func bankMatchEnvOn(t *testing.T, app *tests.TestApp, users levelUsers, checking, savings, card, revenue, rent *core.Record) *bankMatchEnv {
	t.Helper()
	connection := saveRecord(t, app, "books_bank_connections", map[string]any{"account": checking.Id})
	cardConn := saveRecord(t, app, "books_bank_connections", map[string]any{"account": card.Id})
	file := mustSaveBankFile(t, app, connection.Id, "checking-2026-09.csv", sha256Hex([]byte("checking "+bankCSV)), bankFileStatusUploaded)
	cardFl := mustSaveBankFile(t, app, cardConn.Id, "card-2026-09.csv", sha256Hex([]byte("card "+bankCSV)), bankFileStatusUploaded)
	// The import rows are saved past the hooks: the import hook would import
	// the file's own rows, and each test writes the bank transactions it needs.
	bare := app.UnsafeWithoutHooks()
	return &bankMatchEnv{
		app: app, users: users, checking: checking, savings: savings, card: card, revenue: revenue, rent: rent,
		connection: connection, file: file, cardConn: cardConn, cardFl: cardFl,
		bankImport: saveRecord(t, bare, "books_bank_imports", map[string]any{"id": newRecordID(), "file": file.Id, "lines": []int{2}}),
		cardImport: saveRecord(t, bare, "books_bank_imports", map[string]any{"id": newRecordID(), "file": cardFl.Id, "lines": []int{2}}),
	}
}

// rest serves every REST call of the env through one router: the router is
// built once per app.
func (m *bankMatchEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if m.client == nil {
		m.client = newRestClient(t, m.app)
	}
	return m.client
}

// bankTxn stores one bank transaction of the checking connection, as an import
// writes it.
func (m *bankMatchEnv) bankTxn(t testing.TB, date string, amount int, status string) *core.Record {
	t.Helper()
	return m.bankTxnOf(t, m.connection, m.file, m.bankImport, date, amount, status)
}

func (m *bankMatchEnv) bankTxnOf(t testing.TB, connection, file, bankImport *core.Record, date string, amount int, status string) *core.Record {
	t.Helper()
	m.seq++
	return saveRecord(t, m.app, "books_bank_transactions", map[string]any{
		"connection": connection.Id, "file": file.Id, "bank_import": bankImport.Id, "line": m.seq + 1,
		"date": date, "description": fmt.Sprintf("BANK ROW %d", m.seq), "amount": amount,
		"dedupe_hash": fmt.Sprintf("%064d", m.seq), "status": status,
	})
}

// postedTransfer posts a transfer of amount from one account to another and
// returns the stored entry.
func (m *bankMatchEnv) postedTransfer(t testing.TB, date string, from, to *core.Record, amount int) *core.Record {
	t.Helper()
	draft := transferDraft(t, m.app, date, from, to, amount)
	return mustPost(t, m.app, draft.Id, m.users.bookkeeper.Id)
}

// postedEntry posts a journal entry with the given side of amount on account
// and the other side on rent, and returns the stored entry.
func (m *bankMatchEnv) postedEntry(t testing.TB, date string, account *core.Record, debit, credit int) *core.Record {
	t.Helper()
	draft := mkDraft(t, m.app, date, ln{account, debit, credit}, ln{m.rent, credit, debit})
	return mustPost(t, m.app, draft.Id, m.users.bookkeeper.Id)
}

func voidEntryAs(t testing.TB, app core.App, entryID, actor string) {
	t.Helper()
	if err := setStatus(app, entryID, statusVoid, actor); err != nil {
		t.Fatalf("void %s: %v", entryID, err)
	}
}

// lineOn is the entry's journal line on account.
func lineOn(t testing.TB, app core.App, entryID string, account *core.Record) *core.Record {
	t.Helper()
	r, err := app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e} && account = {:a}",
		dbx.Params{"e": entryID, "a": account.Id})
	if err != nil {
		t.Fatalf("the line of entry %s on %s: %v", entryID, account.GetString("name"), err)
	}
	return r
}

func nameOf(t testing.TB, app core.App, entryID string) string {
	t.Helper()
	return entryName(reload(t, app, "books_journal_entries", entryID))
}

// apiAnswer is one REST answer: its status and its JSON body.
type apiAnswer struct {
	status int
	body   string
}

func (a apiAnswer) json(t testing.TB) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal([]byte(a.body), &out); err != nil {
		t.Fatalf("answer %d is not JSON: %v; body: %s", a.status, err, a.body)
	}
	return out
}

func (a apiAnswer) requireStatus(t testing.TB, want int) {
	t.Helper()
	if a.status != want {
		t.Fatalf("status = %d, want %d; body: %s", a.status, want, a.body)
	}
}

// requireRefusal checks a 400 whose message is want, exactly.
func (a apiAnswer) requireRefusal(t testing.TB, want string) {
	t.Helper()
	a.requireStatus(t, http.StatusBadRequest)
	if got, _ := a.json(t)["message"].(string); got != want {
		t.Errorf("refusal message = %q, want %q", got, want)
	}
}

// requireFieldRefusal checks a 400 of PocketBase's own field validation, keyed
// by field.
func (a apiAnswer) requireFieldRefusal(t testing.TB, field string) {
	t.Helper()
	a.requireRefusal(t, msgFailedToCreate)
	data, _ := a.json(t)["data"].(map[string]any)
	if _, ok := data[field]; !ok {
		t.Errorf("refusal names fields %v, want %q", data, field)
	}
}

func (a apiAnswer) id(t testing.TB) string {
	t.Helper()
	id, _ := a.json(t)["id"].(string)
	if id == "" {
		t.Fatalf("the answer has no id: %s", a.body)
	}
	return id
}

func (m *bankMatchEnv) send(t testing.TB, user *core.Record, method, url, body string) apiAnswer {
	t.Helper()
	status, out := m.rest(t).send(t, user, method, url, body)
	return apiAnswer{status: status, body: out}
}

func matchBody(t testing.TB, txn *core.Record, lines []*core.Record, extra map[string]any) string {
	t.Helper()
	ids := make([]string, 0, len(lines))
	for _, l := range lines {
		ids = append(ids, l.Id)
	}
	body := map[string]any{"bank_transaction": txn.Id, "lines": ids}
	for k, v := range extra {
		body[k] = v
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// match creates a match as user through the REST API, as the client does.
func (m *bankMatchEnv) match(t testing.TB, user *core.Record, txn *core.Record, lines ...*core.Record) apiAnswer {
	t.Helper()
	return m.send(t, user, http.MethodPost, collectionURL(matchesCollection), matchBody(t, txn, lines, nil))
}

func (m *bankMatchEnv) mustMatch(t testing.TB, txn *core.Record, lines ...*core.Record) string {
	t.Helper()
	answer := m.match(t, m.users.bookkeeper, txn, lines...)
	answer.requireStatus(t, http.StatusOK)
	return answer.id(t)
}

func requireStatusOf(t testing.TB, app core.App, txn *core.Record, want string) {
	t.Helper()
	if got := reload(t, app, "books_bank_transactions", txn.Id).GetString("status"); got != want {
		t.Errorf("bank transaction %s status = %q, want %q", txn.GetString("description"), got, want)
	}
}

func countOf(t testing.TB, app core.App, collection string, where dbx.Expression) int64 {
	t.Helper()
	var n int64
	var err error
	if where == nil {
		n, err = app.CountRecords(collection)
	} else {
		n, err = app.CountRecords(collection, where)
	}
	if err != nil {
		t.Fatalf("count %s: %v", collection, err)
	}
	return n
}

func requireNoMatchOf(t testing.TB, app core.App, txn *core.Record) {
	t.Helper()
	if n := countOf(t, app, matchesCollection, dbx.HashExp{"bank_transaction": txn.Id}); n != 0 {
		t.Errorf("%d matches of %s, want none", n, txn.GetString("description"))
	}
	if n := countOf(t, app, matchLinesCollectn, dbx.HashExp{"bank_transaction": txn.Id}); n != 0 {
		t.Errorf("%d match lines of %s, want none", n, txn.GetString("description"))
	}
}

// suggestionsOf are the view rows of one bank transaction, nearest first.
func suggestionsOf(t testing.TB, app core.App, txn *core.Record) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(matchSuggestions, "bank_transaction = {:t}", "days_apart", 0, 0,
		dbx.Params{"t": txn.Id})
	if err != nil {
		t.Fatalf("read the suggestions of %s: %v", txn.GetString("description"), err)
	}
	return rows
}

func suggests(t testing.TB, app core.App, txn, line *core.Record) bool {
	t.Helper()
	for _, r := range suggestionsOf(t, app, txn) {
		if r.GetString("line") == line.Id {
			return true
		}
	}
	return false
}

func TestBankMatch_Create(t *testing.T) {
	t.Run("one transfer line", func(t *testing.T) {
		m := newBankMatchEnv(t)
		transfer := m.postedTransfer(t, "2026-09-03", m.checking, m.savings, 86815)
		line := lineOn(t, m.app, transfer.Id, m.checking)
		txn := m.bankTxn(t, "2026-09-03", -86815, "for_review")
		entriesBefore := countOf(t, m.app, "books_journal_entries", nil)
		linesBefore := countOf(t, m.app, "books_journal_lines", nil)

		id := m.mustMatch(t, txn, line)

		requireStatusOf(t, m.app, txn, "reviewed")
		stored := reload(t, m.app, matchesCollection, id)
		if got := stored.GetString("connection"); got != m.connection.Id {
			t.Errorf("match connection = %q, want the bank transaction's %q", got, m.connection.Id)
		}
		if got := stored.GetString("created_by"); got != m.users.bookkeeper.Id {
			t.Errorf("match created_by = %q, want the writer %q", got, m.users.bookkeeper.Id)
		}
		rows, err := m.app.FindAllRecords(matchLinesCollectn, dbx.HashExp{"match": id})
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != 1 {
			t.Fatalf("%d match lines, want 1", len(rows))
		}
		got := map[string]any{
			"line": rows[0].GetString("line"), "entry": rows[0].GetString("entry"),
			"bank_transaction": rows[0].GetString("bank_transaction"), "amount": rows[0].GetInt("amount"),
		}
		want := map[string]any{"line": line.Id, "entry": transfer.Id, "bank_transaction": txn.Id, "amount": 86815}
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("match line = %v, want %v", got, want)
		}
		if n := countOf(t, m.app, "books_journal_entries", nil); n != entriesBefore {
			t.Errorf("%d journal entries after the match, want the %d before it", n, entriesBefore)
		}
		if n := countOf(t, m.app, "books_journal_lines", nil); n != linesBefore {
			t.Errorf("%d journal lines after the match, want the %d before it", n, linesBefore)
		}
	})

	t.Run("three lines that add up to the bank amount", func(t *testing.T) {
		m := newBankMatchEnv(t)
		var lines []*core.Record
		for _, amount := range []int{50000, 30000, 6815} {
			tr := m.postedTransfer(t, "2026-09-02", m.savings, m.checking, amount)
			lines = append(lines, lineOn(t, m.app, tr.Id, m.checking))
		}
		txn := m.bankTxn(t, "2026-09-03", 86815, "for_review")
		entriesBefore := countOf(t, m.app, "books_journal_entries", nil)
		linesBefore := countOf(t, m.app, "books_journal_lines", nil)

		id := m.mustMatch(t, txn, lines...)

		requireStatusOf(t, m.app, txn, "reviewed")
		if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"match": id}); n != 3 {
			t.Errorf("%d match lines, want 3", n)
		}
		for _, l := range lines {
			if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"match": id, "line": l.Id}); n != 1 {
				t.Errorf("line %s has %d match-line rows, want 1", l.Id, n)
			}
		}
		if n := countOf(t, m.app, "books_journal_entries", nil); n != entriesBefore {
			t.Errorf("%d journal entries after the match, want the %d before it", n, entriesBefore)
		}
		if n := countOf(t, m.app, "books_journal_lines", nil); n != linesBefore {
			t.Errorf("%d journal lines after the match, want the %d before it", n, linesBefore)
		}
	})
}

func TestBankMatch_Refusals(t *testing.T) {
	type built struct {
		txn   *core.Record
		lines []*core.Record
		want  string
	}
	cases := []struct {
		name  string
		build func(t *testing.T, m *bankMatchEnv) built
	}{
		{"a reviewed transaction", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			return built{m.bankTxn(t, matchBankDay, -86815, "reviewed"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)}, msgMatchReviewed}
		}},
		{"an excluded transaction", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			return built{m.bankTxn(t, matchBankDay, -86815, "excluded"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)}, msgMatchExcluded}
		}},
		{"a void entry", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			voidEntryAs(t, m.app, tr.Id, m.users.bookkeeper.Id)
			return built{m.bankTxn(t, matchBankDay, -86815, "for_review"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)},
				wantMatchVoid(nameOf(t, m.app, tr.Id))}
		}},
		{"the reversal of a void", func(t *testing.T, m *bankMatchEnv) built {
			// The transfer credits checking; its reversal debits it, money in.
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			voidEntryAs(t, m.app, tr.Id, m.users.bookkeeper.Id)
			rev := findReversal(t, m.app, tr.Id)
			return built{m.bankTxn(t, matchBankDay, 86815, "for_review"), []*core.Record{lineOn(t, m.app, rev.Id, m.checking)},
				wantMatchVoid(entryName(rev))}
		}},
		{"a line matched to another bank transaction", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			line := lineOn(t, m.app, tr.Id, m.checking)
			m.mustMatch(t, m.bankTxn(t, matchBankDay, -86815, "for_review"), line)
			return built{m.bankTxn(t, matchBankDay, -86815, "for_review"), []*core.Record{line},
				wantMatchTaken(nameOf(t, m.app, tr.Id))}
		}},
		{"a line on another account", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			return built{m.bankTxn(t, matchBankDay, 86815, "for_review"), []*core.Record{lineOn(t, m.app, tr.Id, m.savings)},
				wantMatchNotOn(nameOf(t, m.app, tr.Id), "1000 Business Checking")}
		}},
		{"a debit line for money out", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.savings, m.checking, 86815)
			return built{m.bankTxn(t, matchBankDay, -86815, "for_review"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)},
				wantMatchMoneyInForOut(nameOf(t, m.app, tr.Id))}
		}},
		{"a credit line for money in", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
			return built{m.bankTxn(t, matchBankDay, 86815, "for_review"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)},
				wantMatchMoneyOutForIn(nameOf(t, m.app, tr.Id))}
		}},
		{"a sum that differs", func(t *testing.T, m *bankMatchEnv) built {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 74815)
			return built{m.bankTxn(t, matchBankDay, -86815, "for_review"), []*core.Record{lineOn(t, m.app, tr.Id, m.checking)},
				"The chosen Books transactions total $748.15. The bank transaction is $868.15."}
		}},
		{"a draft entry's line", func(t *testing.T, m *bankMatchEnv) built {
			draft := transferDraft(t, m.app, matchBankDay, m.checking, m.savings, 86815)
			return built{m.bankTxn(t, matchBankDay, -86815, "for_review"), []*core.Record{lineOn(t, m.app, draft.Id, m.checking)},
				wantMatchNotPosted(nameOf(t, m.app, draft.Id))}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m := newBankMatchEnv(t)
			b := c.build(t, m)
			before := reload(t, m.app, "books_bank_transactions", b.txn.Id).GetString("status")
			m.match(t, m.users.bookkeeper, b.txn, b.lines...).requireRefusal(t, b.want)
			requireStatusOf(t, m.app, b.txn, before)
			requireNoMatchOf(t, m.app, b.txn)
		})
	}

	// 51 lines that add up to the bank amount pass every check of the hook, so
	// only the field's maxSelect of 50 can refuse them.
	t.Run("51 lines", func(t *testing.T) {
		m := newBankMatchEnv(t)
		var lines []*core.Record
		for range 51 {
			tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 100)
			lines = append(lines, lineOn(t, m.app, tr.Id, m.checking))
		}
		txn := m.bankTxn(t, matchBankDay, -5100, "for_review")
		m.match(t, m.users.bookkeeper, txn, lines...).requireFieldRefusal(t, "lines")
		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
	})

	t.Run("no line", func(t *testing.T) {
		m := newBankMatchEnv(t)
		txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
		m.match(t, m.users.bookkeeper, txn).requireFieldRefusal(t, "lines")
		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
	})

	// A line id that does not exist is refused by PocketBase's validation of
	// lines, not by a total that leaves the unknown line out: the existing
	// line alone is less than the bank amount, so a sum check over the lines
	// that exist would refuse with a wrong total.
	t.Run("a line that does not exist", func(t *testing.T) {
		m := newBankMatchEnv(t)
		tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 50000)
		line := lineOn(t, m.app, tr.Id, m.checking)
		txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
		raw, err := json.Marshal(map[string]any{
			"bank_transaction": txn.Id, "lines": []string{line.Id, "nosuchline00001"},
		})
		if err != nil {
			t.Fatal(err)
		}
		m.send(t, m.users.bookkeeper, http.MethodPost, collectionURL(matchesCollection), string(raw)).
			requireFieldRefusal(t, "lines")
		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
	})
}

// A match posts nothing, so the close date does not hold it back.
func TestBankMatch_ClosedPeriod(t *testing.T) {
	m := newBankMatchEnv(t)
	tr := m.postedTransfer(t, "2026-09-03", m.checking, m.savings, 86815)
	txn := m.bankTxn(t, "2026-09-04", -86815, "for_review")
	setCloseDate(t, m.app, "2026-10-31")
	m.mustMatch(t, txn, lineOn(t, m.app, tr.Id, m.checking))
	requireStatusOf(t, m.app, txn, "reviewed")
}

func TestBankMatch_Rules(t *testing.T) {
	// fitting is a For review bank transaction and the line that fits it.
	fitting := func(t *testing.T, m *bankMatchEnv) (*core.Record, *core.Record) {
		t.Helper()
		tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
		return m.bankTxn(t, matchBankDay, -86815, "for_review"), lineOn(t, m.app, tr.Id, m.checking)
	}

	t.Run("a reader cannot create", func(t *testing.T) {
		m := newBankMatchEnv(t)
		txn, line := fitting(t, m)
		m.match(t, m.users.readOnly, txn, line).requireStatus(t, http.StatusBadRequest)
		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
	})

	for _, field := range []string{"connection", "created_by"} {
		t.Run("a writer cannot send "+field, func(t *testing.T) {
			m := newBankMatchEnv(t)
			txn, line := fitting(t, m)
			value := m.connection.Id
			if field == "created_by" {
				value = m.users.bookkeeper.Id
			}
			body := matchBody(t, txn, []*core.Record{line}, map[string]any{field: value})
			m.send(t, m.users.bookkeeper, http.MethodPost, collectionURL(matchesCollection), body).
				requireStatus(t, http.StatusBadRequest)
			requireStatusOf(t, m.app, txn, "for_review")
			requireNoMatchOf(t, m.app, txn)
		})
	}

	t.Run("no one updates a match", func(t *testing.T) {
		m := newBankMatchEnv(t)
		txn, line := fitting(t, m)
		id := m.mustMatch(t, txn, line)
		other, otherLine := fitting(t, m)
		for _, user := range []*core.Record{m.users.bookkeeper, m.users.admin} {
			m.send(t, user, http.MethodPatch, collectionURL(matchesCollection)+"/"+id,
				fmt.Sprintf(`{"bank_transaction":%q,"lines":[%q]}`, other.Id, otherLine.Id)).
				requireStatus(t, http.StatusForbidden)
		}
		stored := reload(t, m.app, matchesCollection, id)
		if stored.GetString("bank_transaction") != txn.Id {
			t.Errorf("match bank_transaction = %q after a refused update, want %q", stored.GetString("bank_transaction"), txn.Id)
		}
	})

	t.Run("a reader reads the matches, their lines and the suggestions", func(t *testing.T) {
		m := newBankMatchEnv(t)
		txn, line := fitting(t, m)
		id := m.mustMatch(t, txn, line)
		m.bankTxn(t, matchBankDay, -1200, "for_review")
		m.postedTransfer(t, matchBankDay, m.checking, m.savings, 1200)
		matchLine, err := m.app.FindFirstRecordByFilter(matchLinesCollectn, "match = {:m}", dbx.Params{"m": id})
		if err != nil {
			t.Fatal(err)
		}
		reads := []struct{ url, want string }{
			{collectionURL(matchesCollection), `"totalItems":1`},
			{collectionURL(matchesCollection) + "/" + id, `"id":"` + id + `"`},
			{collectionURL(matchLinesCollectn), `"totalItems":1`},
			{collectionURL(matchLinesCollectn) + "/" + matchLine.Id, `"id":"` + matchLine.Id + `"`},
			{collectionURL(matchSuggestions), `"totalItems":1`},
		}
		for _, r := range reads {
			answer := m.send(t, m.users.readOnly, http.MethodGet, r.url, "")
			answer.requireStatus(t, http.StatusOK)
			if !strings.Contains(answer.body, r.want) {
				t.Errorf("GET %s as a reader has no %s: %s", r.url, r.want, answer.body)
			}
		}
	})

	t.Run("a writer cannot write a match line", func(t *testing.T) {
		m := newBankMatchEnv(t)
		txn, line := fitting(t, m)
		id := m.mustMatch(t, txn, line)
		matchLine, err := m.app.FindFirstRecordByFilter(matchLinesCollectn, "match = {:m}", dbx.Params{"m": id})
		if err != nil {
			t.Fatal(err)
		}
		other, otherLine := fitting(t, m)
		url := collectionURL(matchLinesCollectn)
		m.send(t, m.users.bookkeeper, http.MethodPost, url, fmt.Sprintf(
			`{"match":%q,"bank_transaction":%q,"line":%q,"entry":%q,"amount":86815}`,
			id, other.Id, otherLine.Id, otherLine.GetString("entry"))).requireStatus(t, http.StatusForbidden)
		m.send(t, m.users.bookkeeper, http.MethodPatch, url+"/"+matchLine.Id, `{"amount":1}`).
			requireStatus(t, http.StatusForbidden)
		m.send(t, m.users.bookkeeper, http.MethodDelete, url+"/"+matchLine.Id, "").
			requireStatus(t, http.StatusForbidden)
		if n := countOf(t, m.app, matchLinesCollectn, nil); n != 1 {
			t.Errorf("%d match lines, want the 1 the match wrote", n)
		}
		if got := reload(t, m.app, matchLinesCollectn, matchLine.Id).GetInt("amount"); got != 86815 {
			t.Errorf("match line amount = %d, want 86815", got)
		}
	})
}

// Two matches of one line for two bank transactions of the same amount, sent
// together: the serialized check lets one through, and the unique index on
// line is the last guard.
func TestBankMatch_Concurrent(t *testing.T) {
	m := newBankMatchEnv(t)
	tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
	line := lineOn(t, m.app, tr.Id, m.checking)
	first := m.bankTxn(t, matchBankDay, -86815, "for_review")
	second := m.bankTxn(t, "2026-09-11", -86815, "for_review")
	mux := m.rest(t).mux
	token := tokenFor(t, m.users.bookkeeper)
	bodies := []string{
		matchBody(t, first, []*core.Record{line}, nil),
		matchBody(t, second, []*core.Record{line}, nil),
	}
	answers := make([]apiAnswer, len(bodies))
	var start, done sync.WaitGroup
	start.Add(1)
	for i, body := range bodies {
		done.Add(1)
		go func() {
			defer done.Done()
			req := httptest.NewRequest(http.MethodPost, collectionURL(matchesCollection), strings.NewReader(body))
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

	var won, lost []apiAnswer
	for _, a := range answers {
		switch a.status {
		case http.StatusOK:
			won = append(won, a)
		default:
			lost = append(lost, a)
		}
	}
	if len(won) != 1 || len(lost) != 1 {
		t.Fatalf("answers %+v, want one 200 and one 400", answers)
	}
	lost[0].requireRefusal(t, wantMatchTaken(nameOf(t, m.app, tr.Id)))
	if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"line": line.Id}); n != 1 {
		t.Errorf("%d match-line rows for the line, want 1", n)
	}
	if n := countOf(t, m.app, matchesCollection, nil); n != 1 {
		t.Errorf("%d matches, want 1", n)
	}
}

func TestBankMatch_Delete(t *testing.T) {
	matched := func(t *testing.T) (*bankMatchEnv, *core.Record, *core.Record, string) {
		t.Helper()
		m := newBankMatchEnv(t)
		tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
		line := lineOn(t, m.app, tr.Id, m.checking)
		txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
		return m, txn, line, m.mustMatch(t, txn, line)
	}

	t.Run("a writer undoes a match", func(t *testing.T) {
		m, txn, line, id := matched(t)
		if suggests(t, m.app, txn, line) {
			t.Fatal("a matched line is a suggestion before the undo")
		}
		m.send(t, m.users.bookkeeper, http.MethodDelete, collectionURL(matchesCollection)+"/"+id, "").
			requireStatus(t, http.StatusNoContent)
		requireNoMatchOf(t, m.app, txn)
		requireStatusOf(t, m.app, txn, "for_review")
		if !suggests(t, m.app, txn, line) {
			t.Error("the line is not a suggestion of the bank transaction after the undo")
		}
	})

	t.Run("a reader cannot undo a match", func(t *testing.T) {
		m, txn, _, id := matched(t)
		m.send(t, m.users.readOnly, http.MethodDelete, collectionURL(matchesCollection)+"/"+id, "").
			requireStatus(t, http.StatusNotFound)
		reload(t, m.app, matchesCollection, id)
		if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"match": id}); n != 1 {
			t.Errorf("%d match lines after a reader's delete, want 1", n)
		}
		requireStatusOf(t, m.app, txn, "reviewed")
	})
}

// newBankMatchDocsEnv is the bank match env on a book with the bill, expense
// and bill payment guards bound, so a test can void and edit documents.
func newBankMatchDocsEnv(t *testing.T) (*bankMatchEnv, *billPayEnv) {
	t.Helper()
	bp := newBillPayEnv(t)
	m := bankMatchEnvOn(t, bp.app, bp.users, bp.checking1000, bp.savings1010, bp.card2100, bp.revenue, bp.rent)
	m.client = bp.rest(t)
	return m, bp
}

func TestBankMatch_VoidAndEdit(t *testing.T) {
	t.Run("voiding a matched transfer", func(t *testing.T) {
		m, _ := newBankMatchDocsEnv(t)
		tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
		txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
		m.mustMatch(t, txn, lineOn(t, m.app, tr.Id, m.checking))
		// The reversal debits checking on the transfer's day, money in, so its
		// side, amount and date fit this row: only its origin keeps it out.
		moneyIn := m.bankTxn(t, matchBankDay, 86815, "for_review")

		voidEntryAs(t, m.app, tr.Id, m.users.bookkeeper.Id)

		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
		rev := findReversal(t, m.app, tr.Id)
		for _, bank := range []*core.Record{txn, moneyIn} {
			for _, row := range suggestionsOf(t, m.app, bank) {
				if e := row.GetString("entry"); e == tr.Id || e == rev.Id {
					t.Errorf("the view suggests a line of entry %s (the void entry or its reversal) for %s",
						e, bank.GetString("description"))
				}
			}
		}
		if suggests(t, m.app, moneyIn, lineOn(t, m.app, rev.Id, m.checking)) {
			t.Error("the view suggests the void reversal's line for the money-in bank row")
		}
	})

	// mkMatchedExpense posts an expense of total paid from 1000 Business
	// Checking and matches it to a bank transaction of that amount. The bank
	// row is dated on the expense's day (expenseDay), so the original and the
	// correction are inside the suggestion window and only the amount decides
	// whether the correction is a suggestion.
	mkMatchedExpense := func(t *testing.T, m *bankMatchEnv, bp *billPayEnv, total int64) (*core.Record, *core.Record) {
		t.Helper()
		exp := bp.mkExpense(t, map[string]any{"vendor": bp.summit.Id})
		mkExpenseLine(t, m.app, exp, 0, accountLine(bp.software, total))
		posted := mustPostExpense(t, m.app, exp.Id, m.users.bookkeeper.Id)
		txn := m.bankTxn(t, expenseDay, -int(total), "for_review")
		m.mustMatch(t, txn, lineOn(t, m.app, posted.GetString("entry"), m.checking))
		return posted, txn
	}
	correct := func(t *testing.T, m *bankMatchEnv, bp *billPayEnv, original *core.Record, total int64) *core.Record {
		t.Helper()
		draft := bp.mkExpense(t, map[string]any{"vendor": bp.summit.Id, "replaces": original.Id, "memo": "Corrected"})
		mkExpenseLine(t, m.app, draft, 0, accountLine(bp.software, total))
		return mustPostExpense(t, m.app, draft.Id, m.users.bookkeeper.Id)
	}

	t.Run("editing a matched expense, the amount unchanged", func(t *testing.T) {
		m, bp := newBankMatchDocsEnv(t)
		original, txn := mkMatchedExpense(t, m, bp, 13837)
		corrected := correct(t, m, bp, original, 13837)

		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
		if !suggests(t, m.app, txn, lineOn(t, m.app, corrected.GetString("entry"), m.checking)) {
			t.Error("the correction's line is not a suggestion although its amount is unchanged")
		}
	})

	t.Run("editing a matched expense, the amount changed", func(t *testing.T) {
		m, bp := newBankMatchDocsEnv(t)
		original, txn := mkMatchedExpense(t, m, bp, 13837)
		corrected := correct(t, m, bp, original, 13900)

		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
		if suggests(t, m.app, txn, lineOn(t, m.app, corrected.GetString("entry"), m.checking)) {
			t.Error("the correction's line is a suggestion although its amount changed")
		}
	})

	t.Run("voiding a matched bill payment from its document", func(t *testing.T) {
		m, bp := newBankMatchDocsEnv(t)
		bill := bp.postedBill(t, bp.summit, 40000)
		payment := bp.pay(t, bp.summit, nil, payLine{bill, 40000})
		txn := m.bankTxn(t, matchBankDay, -40000, "for_review")
		m.mustMatch(t, txn, lineOn(t, m.app, payment.GetString("entry"), m.checking))

		if err := voidBillPaymentAs(m.app, payment.Id, m.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the bill payment: %v", err)
		}

		requireStatusOf(t, m.app, txn, "for_review")
		requireNoMatchOf(t, m.app, txn)
	})

	t.Run("voiding an entry with no match changes no bank transaction", func(t *testing.T) {
		m, _ := newBankMatchDocsEnv(t)
		matchedTr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
		reviewed := m.bankTxn(t, matchBankDay, -86815, "for_review")
		id := m.mustMatch(t, reviewed, lineOn(t, m.app, matchedTr.Id, m.checking))
		loose := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
		waiting := m.bankTxn(t, matchBankDay, -86815, "for_review")

		voidEntryAs(t, m.app, loose.Id, m.users.bookkeeper.Id)

		requireStatusOf(t, m.app, reviewed, "reviewed")
		requireStatusOf(t, m.app, waiting, "for_review")
		reload(t, m.app, matchesCollection, id)
		if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"match": id}); n != 1 {
			t.Errorf("%d match lines of the untouched match, want 1", n)
		}
	})
}

func TestBankMatch_Disconnect(t *testing.T) {
	m := newBankMatchEnv(t)
	tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
	txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
	id := m.mustMatch(t, txn, lineOn(t, m.app, tr.Id, m.checking))
	linesBefore := countOf(t, m.app, "books_journal_lines", nil)

	// A connection whose file never left uploaded has no import row (the app
	// writes one only when the file is imported), so it may be disconnected; it
	// has no match, and the checking account's match stays.
	savingsConn := saveRecord(t, m.app, "books_bank_connections", map[string]any{"account": m.savings.Id})
	mustSaveBankFile(t, m.app, savingsConn.Id, "savings-2026-09.csv", sha256Hex([]byte("savings "+bankCSV)), bankFileStatusUploaded)
	if err := checkDisconnect(m.app, reload(t, m.app, "books_bank_connections", savingsConn.Id)); err != nil {
		t.Fatalf("an uploaded-only connection is refused a disconnect: %v", err)
	}
	if err := m.app.Delete(reload(t, m.app, "books_bank_connections", savingsConn.Id)); err != nil {
		t.Fatalf("disconnect the savings account: %v", err)
	}
	reload(t, m.app, matchesCollection, id)
	if n := countOf(t, m.app, matchLinesCollectn, dbx.HashExp{"match": id}); n != 1 {
		t.Errorf("%d match lines after another account's disconnect, want 1", n)
	}

	// A connection with an imported file is still refused, so the cascade
	// below is how a disconnect removes bank transactions.
	if _, err := m.app.DB().NewQuery("UPDATE books_bank_files SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": bankFileStatusImported, "id": m.file.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	requireRefused(t, checkDisconnect(m.app, reload(t, m.app, "books_bank_connections", m.connection.Id)),
		"1000 Business Checking has imported transactions, so it cannot be disconnected.")

	rows, err := m.app.FindAllRecords("books_bank_transactions", dbx.HashExp{"connection": m.connection.Id})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if err := m.app.Delete(r); err != nil {
			t.Fatalf("delete bank transaction %s: %v", r.Id, err)
		}
	}
	if n := countOf(t, m.app, matchesCollection, nil); n != 0 {
		t.Errorf("%d matches after their bank transactions were deleted, want 0", n)
	}
	if n := countOf(t, m.app, matchLinesCollectn, nil); n != 0 {
		t.Errorf("%d match lines after their bank transactions were deleted, want 0", n)
	}
	if n := countOf(t, m.app, "books_journal_lines", nil); n != linesBefore {
		t.Errorf("%d journal lines after the delete, want the %d before it", n, linesBefore)
	}
}

func TestBankMatch_Audit(t *testing.T) {
	m := newBankMatchEnv(t)
	registerAudit(&pocketbase.PocketBase{App: m.app})
	config, ok := auditedCollections(m.app)[matchesCollection]
	if !ok {
		t.Fatal("books_bank_matches is not audited")
	}
	tr := m.postedTransfer(t, matchBankDay, m.checking, m.savings, 86815)
	txn := m.bankTxn(t, matchBankDay, -86815, "for_review")
	id := m.mustMatch(t, txn, lineOn(t, m.app, tr.Id, m.checking))

	want := bankTransactionLabel(reload(t, m.app, "books_bank_transactions", txn.Id))
	if got := config.ExtractLabel(reload(t, m.app, matchesCollection, id)); got != want {
		t.Errorf("match label = %q, want %q", got, want)
	}
	created := awaitAuditRow(t, m.app, matchesCollection, "created", id)
	if got := created.GetString("resource_label"); got != want {
		t.Errorf("created audit row label = %q, want %q", got, want)
	}

	m.send(t, m.users.bookkeeper, http.MethodDelete, collectionURL(matchesCollection)+"/"+id, "").
		requireStatus(t, http.StatusNoContent)
	awaitAuditRow(t, m.app, matchesCollection, "deleted", id)
	// A later match of the freed line writes its own created row after the
	// delete's request; once that row is in, a second row of the first match's
	// create or delete has had its turn too.
	later := m.mustMatch(t, m.bankTxn(t, matchBankDay, -86815, "for_review"), lineOn(t, m.app, tr.Id, m.checking))
	awaitAuditRow(t, m.app, matchesCollection, "created", later)
	for _, action := range []string{"created", "deleted"} {
		n := countOf(t, m.app, "audit_logs", dbx.HashExp{"resource_type": matchesCollection, "action": action, "resource_id": id})
		if n != 1 {
			t.Errorf("%d %s audit rows for the match, want 1", n, action)
		}
	}
}

// bankMatchCase is one row of testdata/bank_match_cases.json, the table the
// client's lib/bank-match.ts test runs too.
type bankMatchCase struct {
	Name       string `json:"name"`
	BankAmount int    `json:"bankAmount"`
	Line       struct {
		Debit        int    `json:"debit"`
		Credit       int    `json:"credit"`
		SameAccount  bool   `json:"sameAccount"`
		EntryStatus  string `json:"entryStatus"`
		Origin       string `json:"origin"`
		Matched      bool   `json:"matched"`
		DaysFromBank int    `json:"daysFromBank"`
	} `json:"line"`
	Side      string `json:"side"`
	CanMatch  bool   `json:"canMatch"`
	Suggested bool   `json:"suggested"`
}

func loadBankMatchCases(t testing.TB) []bankMatchCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/bank_match_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []bankMatchCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("testdata/bank_match_cases.json holds no case")
	}
	return cases
}

func shiftDay(t testing.TB, day string, days int) string {
	t.Helper()
	d, err := time.Parse(time.DateOnly, day)
	if err != nil {
		t.Fatal(err)
	}
	return d.AddDate(0, 0, days).Format(time.DateOnly)
}

// caseLine builds the journal line a case describes.
func (m *bankMatchEnv) caseLine(t *testing.T, c bankMatchCase) *core.Record {
	t.Helper()
	account := m.checking
	if !c.Line.SameAccount {
		account = m.savings
	}
	date := shiftDay(t, matchBankDay, c.Line.DaysFromBank)
	switch {
	case c.Line.Origin == originVoidReversal:
		// The reversal has the sides the case names, so the original has the
		// other ones.
		original := m.postedEntry(t, date, account, c.Line.Credit, c.Line.Debit)
		voidEntryAs(t, m.app, original.Id, m.users.bookkeeper.Id)
		return lineOn(t, m.app, findReversal(t, m.app, original.Id).Id, account)
	case c.Line.EntryStatus == statusDraft:
		draft := mkDraft(t, m.app, date, ln{account, c.Line.Debit, c.Line.Credit}, ln{m.rent, c.Line.Credit, c.Line.Debit})
		return lineOn(t, m.app, draft.Id, account)
	}
	entry := m.postedEntry(t, date, account, c.Line.Debit, c.Line.Credit)
	if c.Line.EntryStatus == statusVoid {
		voidEntryAs(t, m.app, entry.Id, m.users.bookkeeper.Id)
	}
	line := lineOn(t, m.app, entry.Id, account)
	if c.Line.Matched {
		other := m.bankTxn(t, date, c.Line.Debit-c.Line.Credit, "for_review")
		m.mustMatch(t, other, line)
	}
	return line
}

func TestBankMatch_SharedCases(t *testing.T) {
	for _, c := range loadBankMatchCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			wantSide := "debit"
			if c.BankAmount < 0 {
				wantSide = "credit"
			}
			if c.Side != wantSide {
				t.Fatalf("case side = %q, but a bank amount of %d matches a %s", c.Side, c.BankAmount, wantSide)
			}
			m := newBankMatchEnv(t)
			line := m.caseLine(t, c)
			lines := []*core.Record{line}
			// A line of another amount can be one of several: a second line
			// that fits makes up the difference, so the sum is not the refusal.
			bankAbs := c.BankAmount
			if bankAbs < 0 {
				bankAbs = -bankAbs
			}
			if rest := bankAbs - c.Line.Debit - c.Line.Credit; rest > 0 {
				debit, credit := rest, 0
				if c.BankAmount < 0 {
					debit, credit = 0, rest
				}
				filler := m.postedEntry(t, matchBankDay, m.checking, debit, credit)
				lines = append(lines, lineOn(t, m.app, filler.Id, m.checking))
			}
			txn := m.bankTxn(t, matchBankDay, c.BankAmount, "for_review")

			if got := suggests(t, m.app, txn, line); got != c.Suggested {
				t.Errorf("the view suggests the line: %v, want %v", got, c.Suggested)
			}
			answer := m.match(t, m.users.bookkeeper, txn, lines...)
			if c.CanMatch {
				answer.requireStatus(t, http.StatusOK)
				requireStatusOf(t, m.app, txn, "reviewed")
			} else {
				answer.requireStatus(t, http.StatusBadRequest)
				requireStatusOf(t, m.app, txn, "for_review")
				requireNoMatchOf(t, m.app, txn)
			}
		})
	}
}
