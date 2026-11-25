package books

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/oauth"
)

// The requests of the `tinycld books banking` commands (cli/banking*.go), sent
// to the real PocketBase API with an access token, as the CLI sends them. The
// CLI's own tests run against a fake that checks no rule, no Go guard and no
// scope; these prove that the server takes each request from a token. This
// module cannot import the CLI, so each body here is a copy of what the CLI test
// of the command asserts: when one changes, change the other.

// cliBankScopes are the scopes the banking commands need.
var cliBankScopes = []string{scopeRead, scopeWrite}

// cliBankEnv is a server wired as production wires it, with the accounts, the
// connections and the payees of catEnv, and two access tokens of the
// bookkeeper: writer holds cliBankScopes, reader holds books:read only.
type cliBankEnv struct {
	*catEnv
	mux            http.Handler
	writer, reader string
}

func newCLIBankEnv(t *testing.T) *cliBankEnv {
	t.Helper()
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	ledger := ledgerEnvOn(t, app)
	match := bankMatchEnvOn(t, app, ledger.users,
		mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		mkNumberedAccount(t, app, "Company Card", "2100", "credit_card", "credit_card"),
		ledger.revenue, ledger.rent)
	return &cliBankEnv{
		catEnv: catEnvOn(t, match),
		mux:    newRestClient(t, app).mux,
		writer: "Bearer " + oauthToken(t, app, ledger.users.bookkeeper, cliBankScopes...),
		reader: "Bearer " + oauthToken(t, app, ledger.users.bookkeeper, scopeRead),
	}
}

// call sends one JSON request with an access token.
func (env *cliBankEnv) call(t testing.TB, auth, method, target, body string) apiAnswer {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", auth)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	return apiAnswer{status: rec.Code, body: rec.Body.String()}
}

// `banking exclude <id>` and `banking restore <id>` each send one PATCH of
// status. A token needs books:write for it, and the update rule holds a token
// as it holds a session: only status, only between For review and Excluded.
// PocketBase answers a request its update rule refuses with 404.
func TestCLIBanking_ATokenExcludesAndRestores(t *testing.T) {
	env := newCLIBankEnv(t)
	txn := env.bankTxn(t, "2026-09-05", -8647, bankTxnStatusForReview)
	target := collectionURL("books_bank_transactions") + "/" + txn.Id
	patch := func(auth, body string) apiAnswer {
		return env.call(t, auth, http.MethodPatch, target, body)
	}

	patch(env.reader, `{"status":"excluded"}`).requireStatus(t, http.StatusForbidden)
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)

	patch(env.writer, `{"status":"excluded"}`).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, txn, bankTxnStatusExcluded)
	// An excluded row goes nowhere but back to For review.
	patch(env.writer, `{"status":"reviewed"}`).requireStatus(t, http.StatusNotFound)
	patch(env.writer, `{"status":"excluded"}`).requireStatus(t, http.StatusNotFound)
	requireStatusOf(t, env.app, txn, bankTxnStatusExcluded)
	patch(env.writer, `{"status":"for_review"}`).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)

	patch(env.writer, `{"status":"reviewed"}`).requireStatus(t, http.StatusNotFound)
	// The status it has already is no change the rule allows.
	patch(env.writer, `{"status":"for_review"}`).requireStatus(t, http.StatusNotFound)
	// A PATCH with no status changes nothing the rule allows.
	patch(env.writer, `{"memo":"x"}`).requireStatus(t, http.StatusNotFound)
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)

	// Each pinned field is refused beside a valid status change, whatever its
	// value; the values are of the type of the field.
	pinned := map[string]string{
		"connection":   `"` + env.cardConn.Id + `"`,
		"file":         `"` + env.cardFl.Id + `"`,
		"bank_import":  `"` + env.cardImport.Id + `"`,
		"line":         `99`,
		"date":         `"2026-09-07"`,
		"description":  `"x"`,
		"memo":         `"x"`,
		"amount":       `1`,
		"fitid":        `"x"`,
		"check_number": `"7"`,
		"dedupe_hash":  `"` + fmt.Sprintf("%064d", 999) + `"`,
	}
	if len(pinned) != 11 {
		t.Fatalf("%d pinned fields, want 11", len(pinned))
	}
	for field, value := range pinned {
		body := `{"status":"excluded","` + field + `":` + value + `}`
		patch(env.writer, body).requireStatus(t, http.StatusNotFound)
		requireStatusOf(t, env.app, txn, bankTxnStatusForReview)
	}

	// Write access for a token opens no create and no delete: the collection
	// has no rule for either, so only an import makes a bank transaction. The
	// refusal is the rule's, not the scope check's.
	const superusersOnly = "Only superusers can perform this action"
	before := countOf(t, env.app, "books_bank_transactions", nil)
	create := `{"connection":"` + txn.GetString("connection") + `","date":"2026-09-06","description":"x","amount":100,"dedupe_hash":"` + fmt.Sprintf("%064d", 998) + `","status":"for_review"}`
	answer := env.call(t, env.writer, http.MethodPost, collectionURL("books_bank_transactions"), create)
	answer.requireStatus(t, http.StatusForbidden)
	if !strings.Contains(answer.body, superusersOnly) {
		t.Errorf("create answer = %s, want it to hold %q", answer.body, superusersOnly)
	}
	if after := countOf(t, env.app, "books_bank_transactions", nil); after != before {
		t.Errorf("%d bank transactions after the create, want %d", after, before)
	}
	answer = env.call(t, env.writer, http.MethodDelete, target, "")
	answer.requireStatus(t, http.StatusForbidden)
	if !strings.Contains(answer.body, superusersOnly) {
		t.Errorf("delete answer = %s, want it to hold %q", answer.body, superusersOnly)
	}
	if after := countOf(t, env.app, "books_bank_transactions", nil); after != before {
		t.Errorf("%d bank transactions after the delete, want %d", after, before)
	}
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)
}

// upload sends the multipart create of `banking upload`: the id and the
// connection as form fields, and the file part named "file".
func (env *cliBankEnv) upload(t testing.TB, auth, id, connection, name, content string) apiAnswer {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for _, field := range [][2]string{{"connection", connection}, {"id", id}} {
		if err := form.WriteField(field[0], field[1]); err != nil {
			t.Fatal(err)
		}
	}
	part, err := form.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, collectionURL("books_bank_files"), &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", auth)
	rec := httptest.NewRecorder()
	env.mux.ServeHTTP(rec, req)
	return apiAnswer{status: rec.Code, body: rec.Body.String()}
}

// list sends a list request with the filter and sort texts of a command.
func (env *cliBankEnv) list(t testing.TB, collection, filter, sort string) apiAnswer {
	t.Helper()
	query := url.Values{"filter": {filter}, "page": {"1"}, "perPage": {"200"}}
	if sort != "" {
		query.Set("sort", sort)
	}
	answer := env.call(t, env.writer, http.MethodGet, collectionURL(collection)+"?"+query.Encode(), "")
	answer.requireStatus(t, http.StatusOK)
	return answer
}

// items are the records of a list answer.
func (a apiAnswer) items(t testing.TB) []map[string]any {
	t.Helper()
	raw, _ := a.json(t)["items"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		row, _ := item.(map[string]any)
		out = append(out, row)
	}
	return out
}

// `banking upload`, `banking rows` and `banking import` of a CSV file, then
// `banking list`: the upload names its id, the rows are read by the file, the
// import names its id and the lines, and the new transactions are For review.
func TestCLIBanking_ATokenUploadsAndImportsACSVFile(t *testing.T) {
	env := newCLIBankEnv(t)
	const fileID, importID = "clibankfile0001", "clibankimport01"

	uploaded := env.upload(t, env.writer, fileID, env.connection.Id, "sept-2026.csv", bankCSV)
	uploaded.requireStatus(t, http.StatusOK)
	if got := uploaded.json(t); got["id"] != fileID || got["status"] != "uploaded" || got["format"] != "csv" || got["name"] != "sept-2026.csv" || got["connection"] != env.connection.Id {
		t.Fatalf("uploaded file = %s", uploaded.body)
	}
	// A second run with the same id: PocketBase refuses the id, which is how a
	// resend after a lost answer is answered.
	env.upload(t, env.writer, fileID, env.connection.Id, "sept-2026.csv", bankCSV).requireStatus(t, http.StatusBadRequest)
	// The same content under a new id: Books names the stored file.
	again := env.upload(t, env.writer, "clibankfile0002", env.connection.Id, "copy.csv", bankCSV)
	again.requireStatus(t, http.StatusBadRequest)
	if !strings.Contains(again.body, "was already uploaded to") {
		t.Errorf("the refusal of a duplicate file = %s", again.body)
	}

	rows := env.list(t, "books_bank_file_contents", fmt.Sprintf(`file = %q`, fileID), "").items(t)
	if len(rows) != 1 || rows[0]["columns"] != float64(3) {
		t.Fatalf("file contents = %v", rows)
	}
	parsed, _ := rows[0]["rows"].([]any)
	first, _ := parsed[0].(map[string]any)
	if len(parsed) != 7 || first["line"] != float64(1) || fmt.Sprint(first["cells"]) != "[Date Description Amount]" {
		t.Fatalf("parsed rows = %v", rows[0]["rows"])
	}

	// The body of TestBankingImportOfACSVFile (cli/banking_import_test.go),
	// with this file's lines: every row but the header row.
	body := fmt.Sprintf(`{"amount_column":3,"amount_columns":"one","date_column":1,"date_format":"YYYY-MM-DD","description_column":2,"file":%q,"header_row":true,"id":%q,"lines":[2,3,4,5,6,7]}`, fileID, importID)
	env.call(t, env.reader, http.MethodPost, collectionURL("books_bank_imports"), body).requireStatus(t, http.StatusForbidden)
	imported := env.call(t, env.writer, http.MethodPost, collectionURL("books_bank_imports"), body)
	imported.requireStatus(t, http.StatusOK)
	// The command reads the import back by its id.
	stored := env.call(t, env.writer, http.MethodGet, collectionURL("books_bank_imports")+"/"+importID, "")
	stored.requireStatus(t, http.StatusOK)
	if got := stored.json(t); got["imported"] != float64(6) || got["duplicates"] != float64(0) || got["file"] != fileID {
		t.Fatalf("import = %s", stored.body)
	}

	// `banking list`, as cli/testdata/list-filters.json states it.
	listed := env.list(t, "books_bank_transactions", `status = "for_review"`, "-date,id").items(t)
	if len(listed) != 6 || listed[0]["date"] != "2026-09-30" || listed[0]["amount"] != float64(-1200) || listed[5]["amount"] != float64(425000) {
		t.Fatalf("for review = %v", listed)
	}
	// `banking files --connection … --status imported`.
	files := env.list(t, "books_bank_files", fmt.Sprintf(`connection = %q && status = "imported"`, env.connection.Id), "-created,id").items(t)
	if len(files) != 1 || files[0]["id"] != fileID {
		t.Errorf("imported files = %v", files)
	}
}

// An OFX file has fixed columns: `banking import` sends the file, the id and
// every line, and no column.
func TestCLIBanking_ATokenImportsAnOFXFile(t *testing.T) {
	env := newCLIBankEnv(t)
	const fileID = "clibankfile0003"
	env.upload(t, env.writer, fileID, env.connection.Id, "oct-2026.ofx", bankOFX).requireStatus(t, http.StatusOK)
	rows := env.list(t, "books_bank_file_contents", fmt.Sprintf(`file = %q`, fileID), "").items(t)
	parsed, _ := rows[0]["rows"].([]any)
	first, _ := parsed[0].(map[string]any)
	// A row's line is its line in the file, so the command reads the lines
	// from the rows: it cannot count them from 1.
	if len(parsed) != 1 || first["line"] != float64(9) {
		t.Fatalf("parsed rows = %v", rows[0]["rows"])
	}
	body := fmt.Sprintf(`{"file":%q,"id":"clibankimport02","lines":[9]}`, fileID)
	imported := env.call(t, env.writer, http.MethodPost, collectionURL("books_bank_imports"), body)
	imported.requireStatus(t, http.StatusOK)
	if got := imported.json(t); got["imported"] != float64(1) {
		t.Fatalf("import = %s", imported.body)
	}
	listed := env.list(t, "books_bank_transactions", fmt.Sprintf(`status = "for_review" && connection = %q`, env.connection.Id), "-date,id").items(t)
	if len(listed) != 1 || listed[0]["amount"] != float64(310000) || listed[0]["fitid"] != "2026000001" {
		t.Fatalf("for review = %v", listed)
	}
}

// `banking categorize`, `banking split` and `banking undo`: the create names
// its id and the bank transaction, a line holds the bank amount without its
// sign, and `undo` deletes the categorization the command found by the
// transaction.
func TestCLIBanking_ATokenCategorizesSplitsAndUndoes(t *testing.T) {
	env := newCLIBankEnv(t)
	txn := env.bankTxn(t, "2026-09-05", -8647, bankTxnStatusForReview)
	const catID = "clibankcat00001"

	// The body of TestBankingCategorize (cli/banking_review_test.go).
	body := fmt.Sprintf(`{"bank_transaction":%q,"id":%q,"kind":"categorize","lines":[{"account":%q,"amount":8647}],"memo":"Paper","vendor":%q}`,
		txn.Id, catID, env.rent.Id, env.vendor.Id)
	env.call(t, env.reader, http.MethodPost, collectionURL(catCollection), body).requireStatus(t, http.StatusForbidden)
	env.call(t, env.writer, http.MethodPost, collectionURL(catCollection), body).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, txn, bankTxnStatusReviewed)

	// `banking show` reads the categorization by the transaction.
	found := env.list(t, catCollection, fmt.Sprintf(`bank_transaction = %q`, txn.Id), "").items(t)
	if len(found) != 1 || found[0]["id"] != catID || found[0]["entry"] == "" || found[0]["kind"] != "categorize" || found[0]["vendor"] != env.vendor.Id {
		t.Fatalf("categorization = %v", found)
	}
	lines, _ := found[0]["lines"].([]any)
	if line, _ := lines[0].(map[string]any); len(lines) != 1 || line["account"] != env.rent.Id || line["amount"] != float64(8647) {
		t.Errorf("stored lines = %v", found[0]["lines"])
	}

	// `banking exclude` of a Reviewed transaction: Books answers 404, which is
	// why the command refuses from the status it read.
	env.call(t, env.writer, http.MethodPatch, collectionURL("books_bank_transactions")+"/"+txn.Id, `{"status":"excluded"}`).requireStatus(t, http.StatusNotFound)

	// `banking undo`.
	env.call(t, env.writer, http.MethodDelete, collectionURL(catCollection)+"/"+catID, "").requireStatus(t, http.StatusNoContent)
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)

	// The body of TestBankingSplit, with lines that add up to this amount.
	split := fmt.Sprintf(`{"bank_transaction":%q,"id":"clibankcat00002","kind":"categorize","lines":[{"account":%q,"amount":6000,"memo":"Paper"},{"account":%q,"amount":2647}],"memo":"Supplies and a fee"}`,
		txn.Id, env.rent.Id, env.revenue.Id)
	env.call(t, env.writer, http.MethodPost, collectionURL(catCollection), split).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, txn, bankTxnStatusReviewed)

	// Lines that do not add up: the message `banking split` passes on.
	other := env.bankTxn(t, "2026-09-06", -8647, bankTxnStatusForReview)
	short := fmt.Sprintf(`{"bank_transaction":%q,"id":"clibankcat00003","kind":"categorize","lines":[{"account":%q,"amount":8000}]}`, other.Id, env.rent.Id)
	refused := env.call(t, env.writer, http.MethodPost, collectionURL(catCollection), short)
	refused.requireStatus(t, http.StatusBadRequest)
	if !strings.Contains(refused.body, "The lines total") {
		t.Errorf("refusal of a short split = %s", refused.body)
	}

	// A transfer: money in of 5,000.00 from savings, one line, the amount
	// above 0 (TestBankingCategorizeATransferOfMoneyIn).
	in := env.bankTxn(t, "2026-09-07", 500000, bankTxnStatusForReview)
	transfer := fmt.Sprintf(`{"bank_transaction":%q,"id":"clibankcat00004","kind":"transfer","lines":[{"account":%q,"amount":500000}]}`, in.Id, env.savings.Id)
	env.call(t, env.writer, http.MethodPost, collectionURL(catCollection), transfer).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, in, bankTxnStatusReviewed)
}

// `banking show` reads the suggestions by the transaction and sorts them;
// `banking match` names its id, the transaction and the journal lines;
// `banking unmatch` deletes the match the command found by the transaction.
func TestCLIBanking_ATokenMatchesAndUnmatches(t *testing.T) {
	env := newCLIBankEnv(t)
	txn := env.bankTxn(t, "2026-09-05", -8647, bankTxnStatusForReview)
	near := lineOn(t, env.app, env.postedEntry(t, "2026-09-05", env.checking, 0, 8647).Id, env.checking)
	far := lineOn(t, env.app, env.postedEntry(t, "2026-09-09", env.checking, 0, 8647).Id, env.checking)
	const matchID = "clibankmatch001"

	suggested := env.list(t, "books_bank_match_suggestions", fmt.Sprintf(`bank_transaction = %q`, txn.Id), "days_apart,date,line").items(t)
	if len(suggested) != 2 || suggested[0]["line"] != near.Id || suggested[0]["days_apart"] != float64(0) || suggested[1]["line"] != far.Id || suggested[1]["days_apart"] != float64(4) {
		t.Fatalf("suggestions = %v", suggested)
	}
	for _, key := range []string{"line", "entry", "date", "days_apart"} {
		if _, ok := suggested[0][key]; !ok {
			t.Errorf("a suggestion has no %q: %v", key, suggested[0])
		}
	}

	// The body of TestBankingMatch (cli/banking_match_test.go).
	body := fmt.Sprintf(`{"bank_transaction":%q,"id":%q,"lines":[%q]}`, txn.Id, matchID, near.Id)
	env.call(t, env.reader, http.MethodPost, collectionURL(matchesCollection), body).requireStatus(t, http.StatusForbidden)
	env.call(t, env.writer, http.MethodPost, collectionURL(matchesCollection), body).requireStatus(t, http.StatusOK)
	requireStatusOf(t, env.app, txn, bankTxnStatusReviewed)

	found := env.list(t, matchesCollection, fmt.Sprintf(`bank_transaction = %q`, txn.Id), "").items(t)
	if len(found) != 1 || found[0]["id"] != matchID || fmt.Sprint(found[0]["lines"]) != "["+near.Id+"]" {
		t.Fatalf("match = %v", found)
	}
	// A matched transaction has no categorization: `undo` finds none.
	if none := env.list(t, catCollection, fmt.Sprintf(`bank_transaction = %q`, txn.Id), "").items(t); len(none) != 0 {
		t.Errorf("categorizations of a matched transaction = %v", none)
	}

	env.call(t, env.writer, http.MethodDelete, collectionURL(matchesCollection)+"/"+matchID, "").requireStatus(t, http.StatusNoContent)
	requireStatusOf(t, env.app, txn, bankTxnStatusForReview)
}

// cli/banking.go and cli/banking_import.go declare these fields in Go, so
// TestCLIResources_MatchTheCollections does not see them. Each one must be a
// field of its collection that the API sends. When a command gains a field,
// add it here.
func TestCLIBanking_DeclaredFieldsAreOnTheCollections(t *testing.T) {
	app := newBooksApp(t)
	for collection, fields := range map[string][]string{
		"books_bank_connections":       {"account", "institution", "account_mask"},
		"books_bank_files":             {"connection", "name", "format", "size", "status", "statement_balance", "statement_date"},
		"books_bank_transactions":      {"connection", "file", "line", "date", "description", "memo", "amount", "fitid", "check_number", "status"},
		"books_bank_file_contents":     {"file", "columns", "rows"},
		"books_bank_imports":           {"file", "header_row", "date_column", "date_format", "description_column", "amount_columns", "amount_column", "money_in_column", "money_out_column", "amount_sign", "lines", "imported", "duplicates"},
		"books_bank_match_suggestions": {"bank_transaction", "line", "entry", "date", "days_apart"},
		matchesCollection:              {"bank_transaction", "lines"},
		catCollection:                  {"bank_transaction", "kind", "entry", "customer", "vendor", "memo", "lines"},
	} {
		col, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Errorf("%s: %v", collection, err)
			continue
		}
		for _, name := range fields {
			if f := col.Fields.GetByName(name); f == nil || f.GetHidden() {
				t.Errorf("%s has no field %q that the API sends, and the CLI reads or writes it", collection, name)
			}
		}
	}
}

// The selects the CLI states in Go are the selects of the collections.
func TestCLIBanking_DeclaredSelectsAreTheCollections(t *testing.T) {
	app := newBooksApp(t)
	for _, tc := range []struct {
		collection, field string
		values            []string
	}{
		{"books_bank_files", "format", []string{"csv", "ofx"}},
		{"books_bank_files", "status", []string{"uploaded", "imported", "failed"}},
		{"books_bank_transactions", "status", []string{"for_review", "reviewed", "excluded"}},
		{"books_bank_imports", "date_format", []string{"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YY"}},
		{"books_bank_imports", "amount_columns", []string{"one", "two"}},
		{"books_bank_imports", "amount_sign", []string{"in_positive", "out_positive"}},
		{catCollection, "kind", []string{"categorize", "transfer"}},
	} {
		col, err := app.FindCollectionByNameOrId(tc.collection)
		if err != nil {
			t.Fatal(err)
		}
		sel, ok := col.Fields.GetByName(tc.field).(*core.SelectField)
		if !ok || !slices.Equal(sel.Values, tc.values) {
			t.Errorf("%s.%s: the CLI states %v, the collection has %v", tc.collection, tc.field, tc.values, sel)
		}
	}
}
