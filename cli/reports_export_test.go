package cli

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestReportsExportWritesTheServersFile(t *testing.T) {
	for _, format := range []string{"csv", "xlsx", "pdf"} {
		f := reportsFake(t)
		f.reports.file, f.reports.fileName = []byte("Account,Debit\n1000 Checking,1500.00\n"), "Trial Balance."+format
		file := filepath.Join(t.TempDir(), "out."+format)
		input := `{"params": {"as_of": "2026-07-15"}, "options": {"today": "2026-07-20"}}`
		out, _, err := runCmd(t, f.serve(), input, "books", "reports", "export", "books.trial_balance", "--format", format, "--file", file, "--input", "-", "--json")
		if err != nil {
			t.Fatalf("%s: %v\n%s", format, err, out)
		}
		want := `{"format":"` + format + `","options":{"today":"2026-07-20"},"params":{"as_of":"2026-07-15"},"reportId":"rep000000000001"}`
		if sent := sentJSON(f.reports.exports[0]); sent != want {
			t.Errorf("%s: sent %s\nwant %s", format, sent, want)
		}
		data, err := os.ReadFile(file)
		if err != nil || string(data) != string(f.reports.file) {
			t.Errorf("%s: file %q, err %v", format, data, err)
		}
		var got exportResult
		if json.Unmarshal([]byte(out), &got) != nil || got.File != file || got.Format != format || got.Bytes != int64(len(f.reports.file)) || got.ID != "rep000000000001" {
			t.Errorf("%s: result:\n%s", format, out)
		}
	}
}

func TestReportsExportDefaultsToCSVAndSendsHour12(t *testing.T) {
	f := reportsFake(t)
	f.reports.file, f.reports.fileName = []byte("x"), "Trial Balance.csv"
	file := filepath.Join(t.TempDir(), "out.csv")
	if _, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "rep000000000001", "--file", file, "--hour12"); err != nil {
		t.Fatal(err)
	}
	if sent := sentJSON(f.reports.exports[0]); sent != `{"format":"csv","hour12":true,"reportId":"rep000000000001"}` {
		t.Errorf("sent %s", sent)
	}
}

func TestReportsExportJSONIsEveryPageOfTheRun(t *testing.T) {
	f := reportsFake(t)
	f.reports.pages = []string{reportPageOne, reportPageTwo}
	file := filepath.Join(t.TempDir(), "out.json")
	if _, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--format", "json", "--file", file); err != nil {
		t.Fatal(err)
	}
	if len(f.reports.exports) != 0 || len(f.reports.runs) != 2 {
		t.Errorf("exports %d, runs %d", len(f.reports.exports), len(f.reports.runs))
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var got runOut
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("%v\n%s", err, data)
	}
	if len(got.Rows) != 4 || got.Title != "Trial Balance" || got.Next == nil || *got.Next != "" {
		t.Errorf("file:\n%s", data)
	}
}

// A refused export writes no file and keeps the file that was there.
func TestReportsExportRefusedKeepsTheOldFile(t *testing.T) {
	f := reportsFake(t)
	dir := t.TempDir()
	file := filepath.Join(dir, "out.pdf")
	if err := os.WriteFile(file, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	f.refuse(http.MethodPost, http.StatusBadRequest, `{"data":{},"message":"This report has more than 5,000 rows. A PDF holds at most 5,000.","status":400}`)
	out, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--format", "pdf", "--file", file, "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(out, "more than 5,000 rows") {
		t.Errorf("exit %d\n%s", got, out)
	}
	if data, _ := os.ReadFile(file); string(data) != "old" {
		t.Errorf("the file was changed: %q", data)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Errorf("a temporary file was left: %v", entries)
	}
}

func TestReportsExportUsageErrorsSendNothing(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "no-such-dir", "out.csv")
	cases := []struct {
		name, want string
		args       []string
	}{
		{"bad format", "--format", []string{"--format", "html", "--file", "x"}},
		{"no file", "--file is required", []string{"--format", "csv"}},
		{"hour12 with json", "--hour12", []string{"--format", "json", "--file", "x", "--hour12"}},
	}
	for _, c := range cases {
		f := reportsFake(t)
		_, _, err := runCmd(t, f.serve(), "", append([]string{"books", "reports", "export", "books.trial_balance"}, c.args...)...)
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: exit %d, err %v", c.name, got, err)
		}
		if len(f.reports.exports)+len(f.reports.runs) != 0 {
			t.Errorf("%s: a request was sent", c.name)
		}
	}
	// A file that cannot be written is a usage error before the export is
	// asked for: the server records every export it makes.
	f := reportsFake(t)
	f.reports.file = []byte("x")
	_, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--file", missing)
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--file") {
		t.Errorf("unwritable file: exit %d, err %v", got, err)
	}
	if len(f.reports.exports) != 0 {
		t.Errorf("unwritable file: the export was sent")
	}
}
