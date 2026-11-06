package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// bankContentOf is the stored file's parsed rows.
func bankContentOf(t testing.TB, app core.App, fileID string) (int, []bankRow) {
	t.Helper()
	r, err := app.FindFirstRecordByData("books_bank_file_contents", "file", fileID)
	if err != nil {
		t.Fatalf("find the rows of %s: %v", fileID, err)
	}
	var rows []bankRow
	if err := r.UnmarshalJSONField("rows", &rows); err != nil {
		t.Fatalf("decode rows: %v", err)
	}
	return r.GetInt("columns"), rows
}

func requireNoContents(t testing.TB, app core.App) {
	t.Helper()
	if n, err := app.CountRecords("books_bank_file_contents"); err != nil || n != 0 {
		t.Errorf("%d parsed-row records (err %v), want 0", n, err)
	}
}

func TestBankUpload_StoresTheRows(t *testing.T) {
	env := newBankEnv(t)
	req := env.upload(t, "sep-2026.csv", []byte(bankCSV))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		file := onlyBankFile(t, app, env.connection.Id)
		columns, rows := bankContentOf(t, app, file.Id)
		if columns != 3 || len(rows) != 7 {
			t.Fatalf("%d columns, %d rows; want 3 and 7", columns, len(rows))
		}
		if rows[1].Line != 2 || rows[1].Cells[1] != "Deposit - Harbor Design client payment" {
			t.Errorf("row 1 = %#v", rows[1])
		}
		if file.GetInt("statement_balance") != 0 || file.GetString("statement_date") != "" {
			t.Errorf("a CSV file stamped a statement: %d %q", file.GetInt("statement_balance"), file.GetString("statement_date"))
		}
	}
	req.run(t, env.app)
}

func TestBankUpload_StoresOFXRowsAndStatement(t *testing.T) {
	env := newBankEnv(t)
	data := ofxStatement("<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261003\n<TRNAMT>-12.00\n<FITID>A1\n<NAME>Fee\n</STMTTRN>\n")
	req := env.upload(t, "oct-2026.qfx", []byte(data))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		file := onlyBankFile(t, app, env.connection.Id)
		columns, rows := bankContentOf(t, app, file.Id)
		if columns != 7 || len(rows) != 1 || rows[0].Cells[4] != "A1" {
			t.Errorf("%d columns, rows %#v", columns, rows)
		}
		if file.GetInt("statement_balance") != -123456 || file.GetString("statement_date") != "2026-10-31" {
			t.Errorf("statement = %d %q, want -123456 2026-10-31", file.GetInt("statement_balance"), file.GetString("statement_date"))
		}
	}
	req.run(t, env.app)
}

func TestBankUpload_RefusesAFileItCannotParse(t *testing.T) {
	var many strings.Builder
	many.WriteString("Date,Description,Amount\n")
	for i := range maxBankRows {
		fmt.Fprintf(&many, "2026-09-02,Row %d,1.00\n", i)
	}
	two := "<OFX><STMTRS></STMTRS><CCSTMTRS></CCSTMTRS></OFX>"
	for _, c := range []struct{ name, data, message string }{
		{"rows.csv", many.String(), "This file has more than 10,000 rows. Export a shorter date range from your bank."},
		{"two.ofx", two, "This file holds statements for 2 accounts. Export one account at a time."},
	} {
		t.Run(c.name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, []byte(c.data))
			req.want = http.StatusBadRequest
			req.content = refusedWith(c.message)
			req.after = func(t testing.TB, app *tests.TestApp) {
				requireNoBankFile(t, app)
				requireNoContents(t, app)
			}
			req.run(t, env.app)
		})
	}
}

// A Go caller's file (the model path) gets its rows too.
func TestBankFile_GoCallerGetsRows(t *testing.T) {
	env := newBankEnv(t)
	file := mustSaveBankFile(t, env.app, env.connection.Id, "sep.csv", "h-sep", bankFileStatusUploaded)
	if columns, rows := bankContentOf(t, env.app, file.Id); columns != 3 || len(rows) != 7 {
		t.Errorf("%d columns, %d rows; want 3 and 7", columns, len(rows))
	}
}

// A refused file leaves no rows: they are written in the file's transaction.
func TestBankFile_RefusedFileLeavesNoRows(t *testing.T) {
	env := newBankEnv(t)
	mustSaveBankFile(t, env.app, env.connection.Id, "a.csv", "h1", bankFileStatusUploaded)
	_, err := saveBankFile(env.app, env.connection.Id, "b.csv", "h1", bankFileStatusUploaded)
	requireRefused(t, err, "a.csv was already uploaded to")
	if n, err := env.app.CountRecords("books_bank_file_contents"); err != nil || n != 1 {
		t.Errorf("%d parsed-row records (err %v), want only the stored file's", n, err)
	}
}

// Removing a file, or disconnecting, removes its rows.
func TestBankFile_RemoveDeletesItsRows(t *testing.T) {
	env := newBankEnv(t)
	file := mustSaveBankFile(t, env.app, env.connection.Id, "a.csv", "h1", bankFileStatusUploaded)
	if err := env.app.Delete(file); err != nil {
		t.Fatal(err)
	}
	if n, _ := env.app.CountRecords("books_bank_file_contents", dbx.HashExp{"file": file.Id}); n != 0 {
		t.Errorf("%d parsed-row records left after the file was removed", n)
	}
}

// Rows whose JSON passes the field's maxSize are refused with a message
// before the transaction, not by the schema.
func TestEncodeBankRows_RefusesTooLarge(t *testing.T) {
	rows := []bankRow{{Line: 1, Cells: []string{strings.Repeat("<", 4<<20)}}}
	_, err := encodeBankRows(rows)
	requireRefused(t, err, "This file is too large to read. Export a shorter date range from your bank.")
	raw, err := encodeBankRows(nil)
	if err != nil || string(raw) != "[]" {
		t.Errorf("no rows encode as %q, %v; want []", raw, err)
	}
}
