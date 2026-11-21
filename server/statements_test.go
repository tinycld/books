package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Statements (spec §3.1, §4.2, §4.8): the create guard of books_statements,
// its number from the statement sequence and the collection's rules.

const (
	statementSequenceID = "booksseqstatemt"
	statementTestDay    = "2026-10-20"
	statementsURL       = "/api/collections/books_statements/records"
)

// statementDateCase is one row of server/testdata/statement_date_cases.json,
// the date rule both the Go create guard and the client schema run. Field is
// empty when the case is taken. Message has no final period: PocketBase adds
// one to a server message.
type statementDateCase struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	StatementDate string `json:"statementDate"`
	StartDate     string `json:"startDate"`
	EndDate       string `json:"endDate"`
	Field         string `json:"field"`
	Message       string `json:"message"`
	Go            bool   `json:"go"`
}

func statementDateCases(t testing.TB) []statementDateCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/statement_date_cases.json")
	if err != nil {
		t.Fatalf("read the statement date cases: %v", err)
	}
	var cases []statementDateCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse the statement date cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the statement date case table is empty")
	}
	return cases
}

// statementEnv is the payment book (paymentEnv: the e2e chart, the invoice and
// payment guards, Harborview Dental) with the statement guards bound. ar posts
// dated invoices and payments through the receivable helpers.
type statementEnv struct {
	*paymentEnv
	ar arBook
}

func newStatementEnv(t *testing.T) *statementEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, invoiceKind)
	registerPaymentGuards(app)
	bindInvoiceHost(t, app)
	registerStatementGuards(app)
	pe := paymentEnvOn(t, app)
	return &statementEnv{
		paymentEnv: pe,
		ar: arBook{
			app: app, reader: pe.users.readOnly, none: pe.users.none,
			receivable: pe.receivable, income: pe.revenue, docs: pe,
		},
	}
}

// newStatement saves a statement through the app, so the create guard runs,
// with the fields given over a valid Open items statement of Harborview Dental
// on statementTestDay.
func (se *statementEnv) newStatement(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"customer": se.customer.Id, "type": statementTypeOpenItems, "statement_date": statementTestDay,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(se.app, statementsCollection, all)
}

func (se *statementEnv) mkStatement(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := se.newStatement(fields)
	if err != nil {
		t.Fatalf("save a statement: %v", err)
	}
	return reload(t, se.app, statementsCollection, r.Id)
}

func statementNextNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", statementSequenceID).GetInt("next_number")
}

func requireStatementCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_statements")
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d statements stored, want %d", n, want)
	}
}

func requireStatementNumber(t testing.TB, app core.App, id, number string, sequence int) {
	t.Helper()
	r := reload(t, app, "books_statements", id)
	if r.GetString("number") != number || r.GetInt("sequence") != sequence {
		t.Errorf("statement number %q sequence %d, want %q and %d", r.GetString("number"), r.GetInt("sequence"), number, sequence)
	}
}

// statementBody is a REST create body for customer; extra is appended inside
// the object (",\"key\":value").
func statementBody(customer, statementType, statementDate, startDate, endDate, extra string) string {
	return fmt.Sprintf(`{"customer":%q,"type":%q,"statement_date":%q,"start_date":%q,"end_date":%q%s}`,
		customer, statementType, statementDate, startDate, endDate, extra)
}

// badRequestOf is the body of a 400 (refusalOf, estimate_responses_test.go).
func badRequestOf(t testing.TB, res callResult) refusalBody {
	t.Helper()
	if res.status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", res.status, res.body)
	}
	return refusalOf(t, res)
}

// requireRESTFieldRefusal asserts a 400 whose message is want and whose data
// names field with the same message, as the client's form maps it.
func requireRESTFieldRefusal(t testing.TB, res callResult, field, want string) {
	t.Helper()
	r := badRequestOf(t, res)
	if r.Message != want {
		t.Errorf("message = %q, want %q", r.Message, want)
	}
	item, ok := r.Data[field]
	if !ok {
		t.Fatalf("refusal data %v names no field %q; body: %s", r.Data, field, res.body)
	}
	if msg, _ := item["message"].(string); msg != want {
		t.Errorf("field %q message = %q, want %q", field, msg, want)
	}
}

// Plan note 9: every case of the shared date table against a writer's create.
func TestStatement_DateCases(t *testing.T) {
	cases := statementDateCases(t)
	se := newStatementEnv(t)
	writer := tokenFor(t, se.users.bookkeeper)
	serveCalls(t, se.app, func(do func(apiReq) callResult) {
		for _, tc := range cases {
			t.Run(tc.Name, func(t *testing.T) {
				before, err := se.app.CountRecords("books_statements")
				if err != nil {
					t.Fatal(err)
				}
				next := statementNextNumber(t, se.app)
				res := do(apiReq{
					method: http.MethodPost, url: statementsURL, token: writer,
					body: statementBody(se.customer.Id, tc.Type, tc.StatementDate, tc.StartDate, tc.EndDate, ""),
				})
				after, err := se.app.CountRecords("books_statements")
				if err != nil {
					t.Fatal(err)
				}
				if tc.Field == "" {
					if res.status != http.StatusOK {
						t.Fatalf("status = %d, want 200 (the case is taken); body: %s", res.status, res.body)
					}
					if after != before+1 {
						t.Errorf("%d statements after a taken create, want %d", after, before+1)
					}
					var stored struct {
						ID string `json:"id"`
					}
					if err := json.Unmarshal([]byte(res.body), &stored); err != nil {
						t.Fatalf("create body is not JSON: %v (%s)", err, res.body)
					}
					r := reload(t, se.app, "books_statements", stored.ID)
					got := [4]string{r.GetString("type"), r.GetString("statement_date"), r.GetString("start_date"), r.GetString("end_date")}
					want := [4]string{tc.Type, tc.StatementDate, tc.StartDate, tc.EndDate}
					if got != want {
						t.Errorf("stored type/statement_date/start_date/end_date = %v, want %v", got, want)
					}
					return
				}
				requireRESTFieldRefusal(t, res, tc.Field, tc.Message+".")
				if after != before {
					t.Errorf("%d statements after a refused create, want %d", after, before)
				}
				if got := statementNextNumber(t, se.app); got != next {
					t.Errorf("statement next_number = %d after a refused create, want %d", got, next)
				}
			})
		}
	})
}

// Spec §4.2: balance is the sum of debit − credit of the customer's
// receivable items on or before the end day (Balance forward) or the
// statement date (Open items).
func TestStatement_StoredBalance(t *testing.T) {
	se := newStatementEnv(t)
	c := mkCustomer(t, se.app, "Statement Co", "")
	first := arInvoice(t, se.ar, c, "2026-09-01", "2026-10-01", 40000)
	arPayment(t, se.ar, c, "2026-09-10", 10000, map[string]int{first.Id: 10000})
	// A payment between Start (2026-10-01) and End (statementTestDay), so the
	// start day (30000), the end day (28000) and the Statement date
	// 2026-10-31 (33000) each have their own balance.
	arPayment(t, se.ar, c, "2026-10-10", 2000, map[string]int{first.Id: 2000})
	arInvoice(t, se.ar, c, "2026-10-25", "2026-11-24", 5000)

	parent := mkCustomer(t, se.app, "Parent Co", "")
	sub := mkCustomer(t, se.app, "Sub Co", parent.Id)
	arInvoice(t, se.ar, sub, "2026-09-05", "2026-10-05", 7000)

	forward := se.mkStatement(t, map[string]any{
		"customer": c.Id, "type": statementTypeBalanceForward,
		"statement_date": "2026-10-31", "start_date": "2026-10-01", "end_date": statementTestDay,
	})
	if got := forward.GetInt("balance"); got != 28000 {
		t.Errorf("Balance forward balance = %d, want 28000 (the end day's, not the start day's 30000 or the Statement date's 33000)", got)
	}
	open := se.mkStatement(t, map[string]any{"customer": c.Id, "type": statementTypeOpenItems, "statement_date": statementTestDay})
	if got := open.GetInt("balance"); got != 28000 {
		t.Errorf("Open items balance on the statement date = %d, want 28000", got)
	}

	quiet := mkCustomer(t, se.app, "Quiet Co", "")
	for _, kind := range []string{statementTypeBalanceForward, statementTypeOpenItems} {
		fields := map[string]any{"customer": quiet.Id, "type": kind, "statement_date": statementTestDay}
		if kind == statementTypeBalanceForward {
			fields["start_date"] = "2026-10-01"
			fields["end_date"] = statementTestDay
		}
		if got := se.mkStatement(t, fields).GetInt("balance"); got != 0 {
			t.Errorf("%s balance of a customer with no line = %d, want 0", kind, got)
		}
	}

	parentStatement := se.mkStatement(t, map[string]any{"customer": parent.Id, "type": statementTypeOpenItems, "statement_date": statementTestDay})
	if got := parentStatement.GetInt("balance"); got != 0 {
		t.Errorf("parent balance = %d, want 0: a sub-customer's lines are not the parent's", got)
	}
	subStatement := se.mkStatement(t, map[string]any{"customer": sub.Id, "type": statementTypeOpenItems, "statement_date": statementTestDay})
	if got := subStatement.GetInt("balance"); got != 7000 {
		t.Errorf("sub-customer balance = %d, want 7000", got)
	}
}

// Spec §4.2: currency is set from books_settings. The settings guard pins the
// currency, so the test changes it with SQL to tell it from a fixed USD.
func TestStatement_CurrencyIsTheSettingsCurrency(t *testing.T) {
	se := newStatementEnv(t)
	if _, err := se.app.DB().NewQuery("UPDATE books_settings SET currency = 'EUR' WHERE id = {:id}").
		Bind(dbx.Params{"id": settingsID}).Execute(); err != nil {
		t.Fatalf("set the settings currency: %v", err)
	}
	r := se.mkStatement(t, nil)
	if got := r.GetString("currency"); got != "EUR" {
		t.Errorf("currency = %q, want EUR (the settings' currency)", got)
	}
}

// Plan note 5: a client never sends a server-set field.
func TestStatement_ServerFieldsRefused(t *testing.T) {
	extras := map[string]string{
		"number":   `,"number":"ST-9"`,
		"sequence": `,"sequence":9`,
		"balance":  `,"balance":100`,
		"currency": `,"currency":"USD"`,
		"sent_at":  `,"sent_at":"2026-11-01 10:00:00.000Z"`,
		"sent_to":  `,"sent_to":"billing@harborview.example"`,
	}
	for _, field := range []string{"number", "sequence", "balance", "currency", "sent_at", "sent_to"} {
		t.Run(field, func(t *testing.T) {
			se := newStatementEnv(t)
			next := statementNextNumber(t, se.app)
			serveCalls(t, se.app, func(do func(apiReq) callResult) {
				res := do(apiReq{
					method: http.MethodPost, url: statementsURL, token: tokenFor(t, se.users.bookkeeper),
					body: statementBody(se.customer.Id, statementTypeOpenItems, statementTestDay, "", "", extras[field]),
				})
				want := "Books sets these fields itself: " + field + "."
				if got := badRequestOf(t, res).Message; got != want {
					t.Errorf("message = %q, want %q", got, want)
				}
			})
			requireStatementCount(t, se.app, 0)
			if got := statementNextNumber(t, se.app); got != next {
				t.Errorf("statement next_number = %d after a refused create, want %d", got, next)
			}
		})
	}
}

// Spec §3.1, §4.8: the statement sequence is ST- from 1001; an admin's change
// of prefix and next number applies to the next statement.
func TestStatement_NumberFromTheStatementSequence(t *testing.T) {
	se := newStatementEnv(t)
	row := reload(t, se.app, "books_doc_sequences", statementSequenceID)
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{docTypeStatement, "ST-", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [statement ST- 1001]", got)
	}
	first := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, first.Id, "ST-1001", 1001)
	second := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, second.Id, "ST-1002", 1002)
	if next := reload(t, se.app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); next != 1001 {
		t.Errorf("invoice next_number = %d, want 1001 (a statement takes no invoice number)", next)
	}

	if err := setFields(t, se.app, "books_doc_sequences", statementSequenceID, map[string]any{"prefix": "S", "next_number": 2000}); err != nil {
		t.Fatalf("set the statement prefix S and next number 2000: %v", err)
	}
	third := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, third.Id, "S2000", 2000)
}

// Spec §3.1: a refused store takes no number.
func TestStatement_RefusedCreateTakesNoNumber(t *testing.T) {
	se := newStatementEnv(t)
	_, err := se.newStatement(map[string]any{
		"type": statementTypeBalanceForward, "statement_date": "2026-10-31",
		"start_date": "2026-10-20", "end_date": "2026-10-10",
	})
	requireFieldRefusal(t, err, "start_date", "Start date can't be after End date.")
	requireStatementCount(t, se.app, 0)
	if next := statementNextNumber(t, se.app); next != 1001 {
		t.Errorf("statement next_number = %d after a refused create, want 1001", next)
	}
	r := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, r.Id, "ST-1001", 1001)
}

// Spec §4.2: list and view for Books readers; create and delete for writers;
// no update rule.
func TestStatement_Rules(t *testing.T) {
	se := newStatementEnv(t)
	stored := se.mkStatement(t, nil)
	one := statementsURL + "/" + stored.Id
	create := statementBody(se.customer.Id, statementTypeOpenItems, statementTestDay, "", "", "")
	reader := tokenFor(t, se.users.readOnly)
	none := tokenFor(t, se.users.none)
	writer := tokenFor(t, se.users.bookkeeper)
	next := statementNextNumber(t, se.app)

	serveCalls(t, se.app, func(do func(apiReq) callResult) {
		for _, c := range []struct {
			name string
			call apiReq
			want int
		}{
			{"a reader cannot create", apiReq{method: http.MethodPost, url: statementsURL, token: reader, body: create}, http.StatusBadRequest},
			{"a user with no Books access cannot create", apiReq{method: http.MethodPost, url: statementsURL, token: none, body: create}, http.StatusBadRequest},
			{"a reader cannot delete", apiReq{method: http.MethodDelete, url: one, token: reader}, http.StatusNotFound},
			{"a user with no Books access cannot delete", apiReq{method: http.MethodDelete, url: one, token: none}, http.StatusNotFound},
			{"a writer cannot update", apiReq{method: http.MethodPatch, url: one, token: writer, body: `{"email":"other@harborview.example"}`}, http.StatusForbidden},
		} {
			if res := do(c.call); res.status != c.want {
				t.Errorf("%s: status = %d, want %d; body: %s", c.name, res.status, c.want, res.body)
			}
		}

		if got := do(apiReq{method: http.MethodGet, url: statementsURL, token: reader}).list(t); got.TotalItems != 1 {
			t.Errorf("a reader lists %d statements, want 1", got.TotalItems)
		}
		if res := do(apiReq{method: http.MethodGet, url: one, token: reader}); res.status != http.StatusOK || !strings.Contains(res.body, `"number":"ST-1001"`) {
			t.Errorf("a reader views the statement: status %d, body %s; want 200 with number ST-1001", res.status, res.body)
		}
		if got := do(apiReq{method: http.MethodGet, url: statementsURL, token: none}).list(t); got.TotalItems != 0 {
			t.Errorf("a user with no Books access lists %d statements, want 0", got.TotalItems)
		}
	})

	requireStatementCount(t, se.app, 1)
	if got := reload(t, se.app, "books_statements", stored.Id).GetString("email"); got != "" {
		t.Errorf("email = %q after a refused update, want it unchanged (empty)", got)
	}
	if got := statementNextNumber(t, se.app); got != next {
		t.Errorf("statement next_number = %d after refused creates, want %d", got, next)
	}
}

// Spec §4.2: a writer deletes a statement; the customer's delete cascades.
func TestStatement_DeleteAndCascade(t *testing.T) {
	se := newStatementEnv(t)
	gone := se.mkStatement(t, nil)
	serveCalls(t, se.app, func(do func(apiReq) callResult) {
		res := do(apiReq{method: http.MethodDelete, url: statementsURL + "/" + gone.Id, token: tokenFor(t, se.users.bookkeeper)})
		if res.status != http.StatusNoContent {
			t.Errorf("a writer's delete: status = %d, want 204; body: %s", res.status, res.body)
		}
	})
	if _, err := se.app.FindRecordById("books_statements", gone.Id); err == nil {
		t.Error("the deleted statement is still there")
	}

	quiet := mkCustomer(t, se.app, "Quiet Co", "")
	se.mkStatement(t, map[string]any{"customer": quiet.Id})
	se.mkStatement(t, map[string]any{"customer": quiet.Id})
	if err := se.app.Delete(reload(t, se.app, "books_customers", quiet.Id)); err != nil {
		t.Fatalf("delete the customer: %v", err)
	}
	n, err := se.app.CountRecords("books_statements", dbx.HashExp{"customer": quiet.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("%d statements of the deleted customer, want 0 (cascade)", n)
	}
}

// Spec §4.8: the next statement number cannot move back over a stored
// statement's number; each document type reads its own highest number.
func TestStatement_SequenceGuard(t *testing.T) {
	se := newStatementEnv(t)
	// A journal entry numbered 1, then statements 1001 and 1002: the journal
	// result ignores the statements.
	mustPost(t, se.app, se.sale(t, "2026-09-01", 100).Id, se.users.bookkeeper.Id)
	se.mkStatement(t, nil)
	se.mkStatement(t, nil)
	if err := setFields(t, se.app, "books_doc_sequences", "booksseqjournal", map[string]any{"next_number": 2}); err != nil {
		t.Errorf("journal next_number 2 over a journal entry numbered 1 and statements up to 1002: %v", err)
	}

	// A journal entry numbered 5000: the statement result ignores it.
	if err := setFields(t, se.app, "books_doc_sequences", "booksseqjournal", map[string]any{"next_number": 5000}); err != nil {
		t.Fatalf("set the journal next number 5000: %v", err)
	}
	entry := mustPost(t, se.app, se.sale(t, "2026-09-02", 100).Id, se.users.bookkeeper.Id)
	if got := entry.GetInt("sequence"); got != 5000 {
		t.Fatalf("journal entry sequence = %d, want 5000", got)
	}

	err := setFields(t, se.app, "books_doc_sequences", statementSequenceID, map[string]any{"next_number": 1002})
	requireRefused(t, err, "Numbers up to 1002 are already used. The next number must be 1003 or higher.")
	if got := statementNextNumber(t, se.app); got != 1003 {
		t.Errorf("statement next_number = %d after a refused change, want 1003", got)
	}
	if err := setFields(t, se.app, "books_doc_sequences", statementSequenceID, map[string]any{"next_number": 1003}); err != nil {
		t.Errorf("statement next_number 1003 over statements up to 1002: %v", err)
	}
}

// Spec §3.1: Books never moves the next number back, so a delete frees none.
func TestStatement_DeleteFreesNoNumber(t *testing.T) {
	se := newStatementEnv(t)
	first := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, first.Id, "ST-1001", 1001)
	if err := se.app.Delete(first); err != nil {
		t.Fatalf("delete the statement: %v", err)
	}
	again := se.mkStatement(t, nil)
	requireStatementNumber(t, se.app, again.Id, "ST-1002", 1002)
}

// Spec §4.2: the migration's unique index on sequence. The second row is
// written with SQL, so the create hook gives it no new sequence.
func TestStatement_SequenceIsUnique(t *testing.T) {
	se := newStatementEnv(t)
	stored := se.mkStatement(t, nil)
	_, err := se.app.DB().NewQuery(
		"INSERT INTO books_statements (id, customer, type, statement_date, number, sequence) " +
			"VALUES ({:id}, {:customer}, {:type}, {:day}, {:number}, {:sequence})",
	).Bind(dbx.Params{
		"id": "stmtdupsequence", "customer": se.customer.Id, "type": statementTypeOpenItems,
		"day": statementTestDay, "number": "ST-1001", "sequence": stored.GetInt("sequence"),
	}).Execute()
	if err == nil {
		t.Fatal("a second statement with a stored sequence was written, want the unique index to refuse it")
	}
	if !strings.Contains(err.Error(), "UNIQUE constraint failed: books_statements.sequence") {
		t.Errorf("err = %v, want the unique constraint on books_statements.sequence", err)
	}
}
