package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// csvImport is an import of a YYYY-MM-DD, description, amount CSV with a
// header row.
func csvImport(fileID string, lines ...int) map[string]any {
	return map[string]any{
		"file": fileID, "header_row": true, "date_column": 1, "date_format": "YYYY-MM-DD",
		"description_column": 2, "amount_columns": "one", "amount_column": 3, "amount_sign": "in_positive",
		"lines": lines,
	}
}

// saveImport creates an import on the model path and returns its error, so a
// refusal or a racing goroutine can read it.
func saveImport(app core.App, fields map[string]any) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_bank_imports")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	if err := app.Save(r); err != nil {
		return nil, err
	}
	return r, nil
}

func mustImport(t testing.TB, app core.App, fields map[string]any) *core.Record {
	t.Helper()
	r, err := saveImport(app, fields)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	return r
}

func requireCounts(t testing.TB, r *core.Record, imported, duplicates int) {
	t.Helper()
	if r.GetInt("imported") != imported || r.GetInt("duplicates") != duplicates {
		t.Errorf("imported %d, duplicates %d; want %d and %d", r.GetInt("imported"), r.GetInt("duplicates"), imported, duplicates)
	}
}

func bankTxns(t testing.TB, app core.App, connectionID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("books_bank_transactions", "connection = {:c}", "date,line", 0, 0, dbx.Params{"c": connectionID})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestBankImport_ImportsTheChosenLines(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	body := fmt.Sprintf(`{"id":"bankimport00001","file":%q,"header_row":true,"date_column":1,"date_format":"YYYY-MM-DD","description_column":2,"amount_columns":"one","amount_column":3,"amount_sign":"in_positive","lines":[2,3,4]}`, file.Id)
	apiReq{
		method:  http.MethodPost,
		url:     collectionURL("books_bank_imports"),
		token:   tokenFor(t, env.users.bookkeeper),
		body:    body,
		want:    http.StatusOK,
		content: []string{`"imported":3`, `"duplicates":0`},
		after: func(t testing.TB, app *tests.TestApp) {
			imp := reload(t, app, "books_bank_imports", "bankimport00001")
			requireCounts(t, imp, 3, 0)
			if got := imp.GetString("created_by"); got != env.users.bookkeeper.Id {
				t.Errorf("created_by = %q, want the bookkeeper", got)
			}
			if got := reload(t, app, "books_bank_files", file.Id).GetString("status"); got != "imported" {
				t.Errorf("file status = %q, want imported", got)
			}
			txns := bankTxns(t, app, env.connection.Id)
			if len(txns) != 3 {
				t.Fatalf("%d transactions, want 3", len(txns))
			}
			first := txns[0]
			want := map[string]any{
				"line": 2, "date": "2026-09-02", "description": "Deposit - Harbor Design client payment",
				"amount": 425000, "status": "for_review", "file": file.Id, "bank_import": "bankimport00001",
			}
			got := map[string]any{
				"line": first.GetInt("line"), "date": first.GetString("date"), "description": first.GetString("description"),
				"amount": first.GetInt("amount"), "status": first.GetString("status"), "file": first.GetString("file"),
				"bank_import": first.GetString("bank_import"),
			}
			for k, v := range want {
				if got[k] != v {
					t.Errorf("%s = %#v, want %#v", k, got[k], v)
				}
			}
			if len(first.GetString("dedupe_hash")) != 64 {
				t.Errorf("dedupe_hash = %q", first.GetString("dedupe_hash"))
			}
			if txns[1].GetInt("amount") != -8647 {
				t.Errorf("line 3 amount = %d, want -8647", txns[1].GetInt("amount"))
			}
		},
	}.run(t, env.app)
}

func TestBankImport_SameLinesTwiceAddNothing(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3, 4)), 3, 0)
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3, 4, 5)), 1, 3)
	// Another mapping of the same lines still adds nothing: a line is imported once.
	other := csvImport(file.Id, 2, 3)
	other["amount_sign"] = "out_positive"
	requireCounts(t, mustImport(t, env.app, other), 0, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 4 {
		t.Errorf("%d transactions, want 4", n)
	}
}

func TestBankImport_OverlappingStatementAddsOnlyNewRows(t *testing.T) {
	env := newBankEnv(t)
	first := saveBankFileBytes(t, env.app, env.connection.Id, "sep-1.csv", "csv",
		"Date,Description,Amount\n2026-09-02,Deposit,4250.00\n2026-09-05,Office Depot,-86.47\n")
	requireCounts(t, mustImport(t, env.app, csvImport(first.Id, 2, 3)), 2, 0)
	// The next export repeats 09-05 with other spacing and case, and adds 09-09.
	second := saveBankFileBytes(t, env.app, env.connection.Id, "sep-2.csv", "csv",
		"Date,Description,Amount\n2026-09-05,OFFICE  DEPOT,-86.47\n2026-09-09,Card payment,-1200.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(second.Id, 2, 3)), 1, 1)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 3 {
		t.Errorf("%d transactions, want 3", n)
	}
}

func TestBankImport_KeepsIdenticalRowsOfOneFile(t *testing.T) {
	env := newBankEnv(t)
	first := saveBankFileBytes(t, env.app, env.connection.Id, "a.csv", "csv",
		"Date,Description,Amount\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(first.Id, 2, 3)), 2, 0)
	second := saveBankFileBytes(t, env.app, env.connection.Id, "b.csv", "csv",
		"Date,Description,Amount\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n2026-09-06,Starbucks,-20.00\n")
	requireCounts(t, mustImport(t, env.app, csvImport(second.Id, 2, 3, 4)), 1, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 3 {
		t.Errorf("%d transactions, want 3", n)
	}
}

func TestBankImport_RefusesABadDateAndImportsNothing(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "bad.csv", "csv",
		"Date,Description,Amount\n09/02/2026,Deposit,4250.00\n13/45/2026,Bad,-1.00\n09/05/2026,Office Depot,-86.47\n02/30/2026,Also bad,-2.00\n")
	fields := csvImport(file.Id, 2, 3, 4, 5)
	fields["date_format"] = "MM/DD/YYYY"
	_, err := saveImport(env.app, fields)
	requireRefused(t, err, `Line 3: "13/45/2026" is not a date in the MM/DD/YYYY format. 1 more chosen line has an error.`)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 0 {
		t.Errorf("%d transactions after a refused import, want 0", n)
	}
	if n, _ := env.app.CountRecords("books_bank_imports"); n != 0 {
		t.Errorf("%d import rows after a refused import, want 0", n)
	}
	if got := reload(t, env.app, "books_bank_files", file.Id).GetString("status"); got != "uploaded" {
		t.Errorf("file status = %q after a refused import, want uploaded", got)
	}
	fields["lines"] = []int{2, 4}
	requireCounts(t, mustImport(t, env.app, fields), 2, 0)
}

func TestBankImport_TwoMoreErrors(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "bad.csv", "csv",
		"Date,Description,Amount\n2026-09-02,a,\n2026-09-03,b,\n2026-09-04,c,\n")
	_, err := saveImport(env.app, csvImport(file.Id, 2, 3, 4))
	requireRefused(t, err, "Line 2: There is no amount. 2 more chosen lines have errors.")
}

func TestBankImport_LineAndMappingRefusals(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	cases := []struct {
		name  string
		edit  func(f map[string]any)
		field string
		want  string
	}{
		{"no lines", func(f map[string]any) { f["lines"] = []int{} }, "lines", "Choose at least one transaction to import."},
		{"lines not numbers", func(f map[string]any) { f["lines"] = []string{"a"} }, "lines", "Send the lines to import as a list of line numbers."},
		{"the header line", func(f map[string]any) { f["lines"] = []int{1, 2} }, "lines", "Line 1 is the header row."},
		{"a line not in the file", func(f map[string]any) { f["lines"] = []int{2, 99} }, "lines", "Line 99 is not a transaction in this file."},
		{"no date column", func(f map[string]any) { f["date_column"] = 0 }, "date_column", "Choose the column that holds the date."},
		{"a missing file", func(f map[string]any) { f["file"] = "nosuchfile00001" }, "file", "The bank file does not exist."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fields := csvImport(file.Id, 2)
			c.edit(fields)
			_, err := saveImport(env.app, fields)
			requireFieldRefusal(t, err, c.field, c.want)
		})
	}
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 0 {
		t.Errorf("%d transactions after refused imports, want 0", n)
	}
}

func TestBankImport_OFXUsesItsOwnColumns(t *testing.T) {
	env := newBankEnv(t)
	data := ofxStatement(
		"<STMTTRN>\n<TRNTYPE>CHECK\n<DTPOSTED>20261003\n<TRNAMT>-250.00\n<FITID>A1\n<CHECKNUM>1001\n<NAME>Smith &amp; Sons\n<MEMO>Invoice 1042\n</STMTTRN>\n" +
			"<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261004\n<TRNAMT>3100.00\n<FITID>A2\n<NAME>Harbor Design\n</STMTTRN>\n")
	file := saveBankFileBytes(t, env.app, env.connection.Id, "oct.qfx", "ofx", data)
	// The client's mapping is ignored for an OFX file.
	imp := mustImport(t, env.app, map[string]any{
		"file": file.Id, "date_column": 0, "lines": []int{lineOf(data, "<STMTTRN>", 0), lineOf(data, "<STMTTRN>", 1)},
	})
	requireCounts(t, imp, 2, 0)
	if imp.GetString("date_format") != "YYYY-MM-DD" || imp.GetInt("amount_column") != 4 {
		t.Errorf("the import row does not record the OFX mapping: %s %d", imp.GetString("date_format"), imp.GetInt("amount_column"))
	}
	txns := bankTxns(t, env.app, env.connection.Id)
	if len(txns) != 2 {
		t.Fatalf("%d transactions, want 2", len(txns))
	}
	got := []string{txns[0].GetString("description"), txns[0].GetString("memo"), txns[0].GetString("fitid"), txns[0].GetString("check_number")}
	if want := []string{"Smith & Sons", "Invoice 1042", "A1", "1001"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("OFX fields = %v, want %v", got, want)
	}
	// A later statement repeats FITID A2 with a corrected name: still a duplicate.
	later := ofxStatement("<STMTTRN>\n<DTPOSTED>20261004\n<TRNAMT>3100.00\n<FITID>A2\n<NAME>HARBOR DESIGN LLC\n</STMTTRN>\n" +
		"<STMTTRN>\n<DTPOSTED>20261006\n<TRNAMT>-9.99\n<FITID>A3\n<NAME>Fee\n</STMTTRN>\n")
	next := saveBankFileBytes(t, env.app, env.connection.Id, "nov.qfx", "ofx", later)
	requireCounts(t, mustImport(t, env.app, map[string]any{
		"file": next.Id, "lines": []int{lineOf(later, "<STMTTRN>", 0), lineOf(later, "<STMTTRN>", 1)},
	}), 1, 1)
}

// Two imports of the same lines at once: the second must see the first's
// transactions and count them as duplicates, not reach the unique indexes.
func TestRace_TheSameLinesImportedTwice(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	var racedImport *core.Record
	raced := bindRace(t, env.app.OnRecordCreate("books_bank_imports"), func() error {
		r, err := saveImport(env.app, csvImport(file.Id, 2, 3))
		racedImport = r
		return err
	})
	requireCounts(t, mustImport(t, env.app, csvImport(file.Id, 2, 3)), 2, 0)
	if err := raced(); err != nil {
		t.Fatalf("the raced import: %v", err)
	}
	requireCounts(t, racedImport, 0, 2)
	if n := len(bankTxns(t, env.app, env.connection.Id)); n != 2 {
		t.Errorf("%d transactions, want 2", n)
	}
}

// An imported file makes its connection permanent (p4-bank-connection's
// contract), and a reader cannot import.
func TestBankImport_AfterImport(t *testing.T) {
	env := newBankEnv(t)
	file := saveBankFileBytes(t, env.app, env.connection.Id, "sep.csv", "csv", bankCSV)
	mustImport(t, env.app, csvImport(file.Id, 2))
	requireRefused(t, env.app.Delete(env.connection), "1000 Business Checking has imported transactions, so it cannot be disconnected.")
	raw, err := json.Marshal(csvImport(file.Id, 3))
	if err != nil {
		t.Fatal(err)
	}
	importsBefore := countRows(t, env.app, "books_bank_imports")
	apiReq{
		method: http.MethodPost,
		url:    collectionURL("books_bank_imports"),
		token:  tokenFor(t, env.users.readOnly),
		body:   string(raw),
		want:   http.StatusBadRequest,
	}.run(t, env.app)
	if n := countRows(t, env.app, "books_bank_imports"); n != importsBefore {
		t.Errorf("%d imports after the reader's attempt, want %d", n, importsBefore)
	}
	for _, txn := range bankTxns(t, env.app, env.connection.Id) {
		if txn.GetInt("line") == 3 {
			t.Error("the reader's refused import created a transaction for line 3")
		}
	}
	// The same body succeeds for a bookkeeper, so the refusal above is the role.
	apiReq{
		method: http.MethodPost,
		url:    collectionURL("books_bank_imports"),
		token:  tokenFor(t, env.users.bookkeeper),
		body:   string(raw),
		want:   http.StatusOK,
	}.run(t, env.app)
}

func countRows(t testing.TB, app core.App, collection string) int {
	t.Helper()
	var n int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + collection).Row(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
