package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const bankTestCSV = "Date,Description,Amount\n2026-09-02,Deposit,4250.00\n2026-09-05,Office Depot,-86.47\n"

// bankFilePath writes a bank file to a temporary directory.
func bankFilePath(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// uploadedFake is bankingFake with one more file that is uploaded and not
// imported, and its parsed rows: a header and two transactions. Line 3 of the
// file is empty, so the lines are 1, 2 and 4.
func uploadedFake(t *testing.T, id, format string) *fakeBooks {
	f := bankingFake(t)
	f.add(bankFilesCollection, id, map[string]any{
		"connection": bankConnChecking, "file": "oct_x2." + format, "name": "oct-2026." + format, "format": format,
		"size": json.Number("90"), "content_hash": "beef", "status": "uploaded", "uploaded_by": "userada00000001",
		"statement_balance": json.Number("0"), "statement_date": "",
	})
	f.add(bankFileContentsCollection, "bankrows0000001", map[string]any{
		"file": id, "columns": json.Number("3"),
		"rows": []any{
			map[string]any{"line": json.Number("1"), "cells": []any{"Date", "Description", "Amount"}},
			map[string]any{"line": json.Number("2"), "cells": []any{"2026-10-02", "Deposit", "4250.00"}},
			map[string]any{"line": json.Number("4"), "cells": []any{"2026-10-05", "Office Depot", "-86.47"}},
		},
	})
	return f
}

const bankFileOct = "bankfile0000002"

// `banking upload` is one multipart create that names its id: the connection
// and the file. It prints the file as Books stored it.
func TestBankingUploadSendsTheFile(t *testing.T) {
	f := bankingFake(t)
	f.stamps = map[string]map[string]any{bankFilesCollection: {
		"name": "oct-2026.csv", "format": "csv", "size": json.Number("90"), "status": "uploaded",
	}}
	path := bankFilePath(t, "oct-2026.csv", bankTestCSV)
	out, stderr, err := runCmd(t, f.serve(), "", "books", "banking", "upload", path, "--connection", bankConnChecking, "--id", bankFileOct, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(f.lastCreate); got != `{"connection":"`+bankConnChecking+`","file":"oct-2026.csv","id":"`+bankFileOct+`"}` {
		t.Errorf("sent %s", got)
	}
	if got := f.uploads[bankFilesCollection]; got.field != "file" || got.name != "oct-2026.csv" || got.content != bankTestCSV {
		t.Errorf("uploaded %+v", got)
	}
	var file map[string]any
	if err := json.Unmarshal([]byte(out), &file); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if file["id"] != bankFileOct || file["status"] != "uploaded" || file["format"] != "csv" || file["connection"] != bankConnChecking {
		t.Errorf("printed %v", file)
	}
	if !strings.Contains(stderr, "banking rows "+bankFileOct) {
		t.Errorf("stderr does not name the next step: %s", stderr)
	}
}

func TestBankingUploadRefusesBeforeItSends(t *testing.T) {
	path := bankFilePath(t, "oct-2026.csv", bankTestCSV)
	for _, tc := range []struct {
		name string
		args []string
		want string
	}{
		{"no connection", []string{path}, "--connection is required"},
		{"no such file", []string{filepath.Join(t.TempDir(), "none.csv"), "--connection", bankConnChecking}, "none.csv"},
		{"a directory", []string{t.TempDir(), "--connection", bankConnChecking}, "is a directory"},
		{"a short id", []string{path, "--connection", bankConnChecking, "--id", "short"}, "--id must be exactly 15"},
	} {
		f := bankingFake(t)
		_, _, err := runCmd(t, f.serve(), "", append([]string{"books", "banking", "upload"}, tc.args...)...)
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want 2 and %q", tc.name, got, err, tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: requests = %v, want none", tc.name, f.requests)
		}
	}
}

// A file over the limit of Books is refused before one byte is sent.
func TestBankingUploadRefusesAFileOverTheLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "big.csv")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxBankFileBytes + 1); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	f := bankingFake(t)
	_, _, err = runCmd(t, f.serve(), "", "books", "banking", "upload", path, "--connection", bankConnChecking)
	if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), "5 MB") {
		t.Errorf("exit = %d, err = %v; want 2 and a message with 5 MB", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("requests = %v, want none", f.requests)
	}
}

// Books refuses a file it holds already; the command passes the message on.
func TestBankingUploadShowsTheRefusalOfBooks(t *testing.T) {
	f := bankingFake(t)
	f.refuse("POST", 400, `{"data":{"file":{"code":"validation_books","message":"sept-2026.csv was already uploaded to First Harbor Bank on 2026-11-01."}},"message":"Failed to create record.","status":400}`)
	path := bankFilePath(t, "sept-2026.csv", bankTestCSV)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "upload", path, "--connection", bankConnChecking)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "was already uploaded to First Harbor Bank") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// A second run with the id of a stored file writes nothing.
func TestBankingUploadWithAStoredID(t *testing.T) {
	f := bankingFake(t)
	path := bankFilePath(t, "sept-2026.csv", bankTestCSV)
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "upload", path, "--connection", bankConnChecking, "--id", bankFileSept)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankFilesCollection+"/records"); n != 0 {
		t.Errorf("the command sent %d creates, want none", n)
	}
}

// The first send was stored and its answer was lost: the resend is refused,
// the command reads the file and prints it, and one file is stored.
func TestBankingUploadResendsAfterALostAnswer(t *testing.T) {
	quickResends(t)
	f := bankingFake(t)
	f.loseAnswers(fakeSilence{stored: true, status: 502})
	path := bankFilePath(t, "oct-2026.csv", bankTestCSV)
	out, _, err := runCmd(t, f.serve(), "", "books", "banking", "upload", path, "--connection", bankConnChecking, "--id", bankFileOct, "--json")
	if err != nil {
		t.Fatal(err)
	}
	if n := sends(f, "POST /api/collections/"+bankFilesCollection+"/records"); n != 2 {
		t.Errorf("the command sent %d creates, want 2", n)
	}
	if n := rowsOf(f, bankFilesCollection, "id", bankFileOct); n != 1 {
		t.Errorf("%d files are stored, want 1", n)
	}
	if !strings.Contains(out, `"id": "`+bankFileOct+`"`) {
		t.Errorf("printed %s", out)
	}
}

func TestBankingRows(t *testing.T) {
	f := uploadedFake(t, bankFileOct, "csv")
	out, stderr, err := runCmd(t, f.serve(), "", "books", "banking", "rows", bankFileOct, "--limit", "2", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got bankRowsResult
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if got.File != bankFileOct || got.Columns != 3 || got.Total != 3 || len(got.Rows) != 2 {
		t.Fatalf("rows = %+v", got)
	}
	if row := got.Rows[1]; row.Line != "2" || strings.Join(row.Cells, "|") != "2026-10-02|Deposit|4250.00" {
		t.Errorf("row = %+v", row)
	}
	if !strings.Contains(stderr, "2 of 3 rows shown") {
		t.Errorf("stderr = %s", stderr)
	}
	if filter := f.lastQuery.Get("filter"); filter != `file = "`+bankFileOct+`"` {
		t.Errorf("filter = %q", filter)
	}
	table, _, err := runCmd(t, f.serve(), "", "books", "banking", "rows", bankFileOct, "--limit", "0")
	if err != nil || !strings.Contains(table, "LINE") || !strings.Contains(table, "Office Depot") {
		t.Errorf("table (err %v):\n%s", err, table)
	}
}

func TestBankingRowsOfAMissingFile(t *testing.T) {
	_, _, err := runCmd(t, bankingFake(t).serve(), "", "books", "banking", "rows", "nosuchfile00001")
	if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "bank file nosuchfile00001") {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// A file Books could not read has no rows; a --limit below 0 is a mistake.
func TestBankingRowsRefusals(t *testing.T) {
	f := bankingFake(t)
	f.add(bankFilesCollection, bankFileOct, map[string]any{
		"connection": bankConnChecking, "name": "broken.csv", "format": "csv", "status": "failed",
	})
	_, _, err := runCmd(t, f.serve(), "", "books", "banking", "rows", bankFileOct)
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "Books could not read it") {
		t.Errorf("a file with no rows: exit = %d, err = %v", got, err)
	}
	f = uploadedFake(t, bankFileOct, "csv")
	_, _, err = runCmd(t, f.serve(), "", "books", "banking", "rows", bankFileOct, "--limit", "-1")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--limit must be 0 or more") {
		t.Errorf("--limit -1: exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("--limit -1: requests = %v, want none", f.requests)
	}
}
