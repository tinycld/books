package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// importFake is uploadedFake with what Books sets on an import it makes.
func importFake(t *testing.T, format string) *fakeBooks {
	f := uploadedFake(t, bankFileOct, format)
	f.stamps = map[string]map[string]any{
		bankImportsCollection: {"imported": json.Number("2"), "duplicates": json.Number("0"), "created_by": "userada00000001"},
	}
	return f
}

const bankCSVMapping = `{"header_row": true, "date_column": 1, "date_format": "YYYY-MM-DD", "description_column": 2, "amount_columns": "one", "amount_column": 3}`

// Without `lines`, the import names every row of the file but the header row.
func TestBankingImportOfACSVFile(t *testing.T) {
	f := importFake(t, "csv")
	out, stderr, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-", "--id", "bankimport00002", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `{"amount_column":3,"amount_columns":"one","date_column":1,"date_format":"YYYY-MM-DD","description_column":2,"file":"` + bankFileOct + `","header_row":true,"id":"bankimport00002","lines":[2,4]}`
	if got := sentJSON(f.lastCreate); got != want {
		t.Errorf("sent\n  %s\nwant\n  %s", got, want)
	}
	var printed map[string]any
	if err := json.Unmarshal([]byte(out), &printed); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if printed["id"] != "bankimport00002" || printed["file"] != bankFileOct || printed["imported"] != float64(2) || printed["duplicates"] != float64(0) {
		t.Errorf("printed %v", printed)
	}
	if !strings.Contains(stderr, "2 new, 0 already in Books") {
		t.Errorf("stderr = %s", stderr)
	}
}

// With `lines`, the import sends them as they are and does not read the rows.
func TestBankingImportOfChosenLines(t *testing.T) {
	f := importFake(t, "csv")
	input := strings.Replace(bankCSVMapping, "}", `, "lines": [4]}`, 1)
	if _, _, err := runCmd(t, f.serve(), input, "books", "banking", "import", bankFileOct, "--input", "-"); err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(map[string]any{"lines": f.lastCreate["lines"]}); got != `{"lines":[4]}` {
		t.Errorf("sent %s", got)
	}
	if len(f.listed[bankFileContentsCollection]) != 0 {
		t.Errorf("the command read the rows of the file: %v", f.listed[bankFileContentsCollection])
	}
}

// An OFX file has fixed columns and no header row: no --input, every row.
func TestBankingImportOfAnOFXFile(t *testing.T) {
	f := importFake(t, "ofx")
	if _, _, err := runCmd(t, f.serve(), "", "books", "banking", "import", bankFileOct, "--id", "bankimport00002"); err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(f.lastCreate); got != `{"file":"`+bankFileOct+`","id":"bankimport00002","lines":[1,2,4]}` {
		t.Errorf("sent %s", got)
	}
}

func TestBankingImportRefusesBeforeItSends(t *testing.T) {
	for _, tc := range []struct {
		name, input, want string
	}{
		{"a CSV file with no --input", "", "a CSV file needs --input"},
		{"an unknown field", `{"date_col": 1}`, `no field "date_col"`},
		{"a field Books sets", `{"imported": 3}`, `"imported" is set by the server`},
		{"a format outside the select", `{"date_format": "YYYY/MM/DD"}`, `"date_format" must be one of`},
		{"lines that are no list", `{"lines": 4}`, `"lines" must be an array of line numbers`},
		{"an empty lines", `{"lines": []}`, `"lines" must be an array of line numbers`},
		{"a line 0", `{"lines": [0]}`, "0 is not a whole number from 1"},
		{"a line with a fraction", `{"lines": [2.5]}`, "2.5 is not a whole number from 1"},
	} {
		f := importFake(t, "csv")
		args := []string{"books", "banking", "import", bankFileOct}
		if tc.input != "" {
			args = append(args, "--input", "-")
		}
		_, _, err := runCmd(t, f.serve(), tc.input, args...)
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: exit = %d, err = %v; want 2 and %q", tc.name, got, err, tc.want)
		}
		if n := sends(f, "POST /api/collections/"+bankImportsCollection+"/records"); n != 0 {
			t.Errorf("%s: the command sent %d creates, want none", tc.name, n)
		}
	}
}

// Books refuses the whole import for one line it cannot read, and names it.
func TestBankingImportShowsTheRefusalOfBooks(t *testing.T) {
	f := importFake(t, "csv")
	f.refuse("POST", 400, `{"data":{"lines":{"code":"validation_books","message":"Line 4: Enter a date like 2026-09-30."}},"message":"Failed to create record.","status":400}`)
	_, _, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "Line 4: Enter a date like 2026-09-30.") || !strings.Contains(err.Error(), "bank file "+bankFileOct) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
}

// A file with a header row only, or with no parsed rows, has nothing to import.
func TestBankingImportOfAFileWithNoRows(t *testing.T) {
	f := importFake(t, "csv")
	f.rows[bankFileContentsCollection][0]["rows"] = []any{
		map[string]any{"line": json.Number("1"), "cells": []any{"Date", "Description", "Amount"}},
	}
	_, _, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "has no row to import") {
		t.Errorf("a header row only: exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankImportsCollection+"/records"); n != 0 {
		t.Errorf("a header row only: the command sent %d creates, want none", n)
	}
	f = importFake(t, "csv")
	f.rows[bankFileContentsCollection] = nil
	_, _, err = runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "Books could not read it") {
		t.Errorf("no parsed rows: exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankImportsCollection+"/records"); n != 0 {
		t.Errorf("the command sent %d creates, want none", n)
	}
}

// A stored import with no file names no owner: the message has no empty name.
func TestBankingImportWithAStoredIDOfNoFile(t *testing.T) {
	f := importFake(t, "csv")
	f.add(bankImportsCollection, "bankimport00001", map[string]any{})
	_, _, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-", "--id", "bankimport00001")
	want := "bank import bankimport00001 already exists; nothing was written"
	if got := exitcode.Of(err); got != exitcode.Refused || err.Error() != want {
		t.Fatalf("exit = %d, err = %v; want %q", got, err, want)
	}
}

// No send is answered: the message gives only the resend with the same --id,
// because the status of the file does not show which of its imports was stored.
func TestBankingImportWhenNoSendIsAnswered(t *testing.T) {
	quickResends(t)
	f := importFake(t, "csv")
	for range len(resendWaits) + 1 {
		f.loseAnswers(fakeSilence{stored: false, status: 504})
	}
	_, _, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-", "--id", "bankimport00002")
	if got := exitcode.Of(err); got != exitcode.Unavailable {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	for _, want := range []string{
		"the import bankimport00002 of bank file " + bankFileOct,
		"To send it again, run the same command with --id bankimport00002: when the first one was stored, Books refuses the second and nothing is written twice.",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("message lacks %q:\n%v", want, err)
		}
	}
	// A file can have several imports, so its status does not show this one.
	if strings.Contains(err.Error(), "Check with") {
		t.Errorf("message has a check step that cannot be conclusive:\n%v", err)
	}
}

// A second run with the id of a stored import writes nothing, and the message
// names the file of that import.
func TestBankingImportWithAStoredID(t *testing.T) {
	f := importFake(t, "csv")
	f.add(bankImportsCollection, "bankimport00001", map[string]any{"file": bankFileSept})
	_, _, err := runCmd(t, f.serve(), bankCSVMapping, "books", "banking", "import", bankFileOct, "--input", "-", "--id", "bankimport00001")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "bank import bankimport00001 already exists, for bank file "+bankFileSept) {
		t.Fatalf("exit = %d, err = %v", got, err)
	}
	if n := sends(f, "POST /api/collections/"+bankImportsCollection+"/records"); n != 0 {
		t.Errorf("the command sent %d creates, want none", n)
	}
}
