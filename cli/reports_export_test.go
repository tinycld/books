package cli

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestReportsExportWritesTheServersFile(t *testing.T) {
	for _, format := range []string{"csv", "xlsx", "pdf"} {
		f := reportsFake(t)
		f.reports.file, f.reports.fileName = []byte("Account,Debit\n1000 Checking,1500.00\n"), "Trial Balance."+format
		file := filepath.Join(t.TempDir(), "out."+format)
		input := `{"params": {"asOf": "2026-07-15"}, "options": {"today": "2026-07-20"}}`
		out, _, err := runCmd(t, f.serve(), input, "books", "reports", "export", "books.trial_balance", "--format", format, "--file", file, "--input", "-", "--json")
		if err != nil {
			t.Fatalf("%s: %v\n%s", format, err, out)
		}
		want := `{"format":"` + format + `","options":{"today":"2026-07-20"},"params":{"asOf":"2026-07-15"},"reportId":"rep000000000001"}`
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

func exportTo(t *testing.T, f *fakeBooks, file string) error {
	t.Helper()
	_, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--file", file)
	return err
}

// An export written over a file keeps the mode of that file.
func TestReportsExportKeepsTheModeOfTheFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no file modes on Windows")
	}
	for _, mode := range []os.FileMode{0o640, 0o664} {
		f := reportsFake(t)
		f.reports.file, f.reports.fileName = []byte("new"), "out.csv"
		file := filepath.Join(t.TempDir(), "out.csv")
		if err := os.WriteFile(file, []byte("old"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(file, mode); err != nil {
			t.Fatal(err)
		}
		if err := exportTo(t, f, file); err != nil {
			t.Fatal(err)
		}
		info, err := os.Stat(file)
		if err != nil || info.Mode().Perm() != mode {
			t.Errorf("mode %v, want %v, err %v", info.Mode().Perm(), mode, err)
		}
	}
}

// A new file gets the mode an ordinary write gives: 0666 less the umask, as
// the downloads of the CLI do. os.CreateTemp alone makes it 0600.
func TestReportsExportNewFileGetsTheDefaultMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no file modes on Windows")
	}
	f := reportsFake(t)
	f.reports.file, f.reports.fileName = []byte("new"), "out.csv"
	dir := t.TempDir()
	probe, err := os.OpenFile(filepath.Join(dir, "probe"), os.O_CREATE|os.O_WRONLY, 0o666)
	if err != nil {
		t.Fatal(err)
	}
	probe.Close()
	info, err := os.Stat(probe.Name())
	if err != nil {
		t.Fatal(err)
	}
	want := info.Mode().Perm()
	if want == 0o600 {
		t.Skip("the umask makes the default mode the same as 0600")
	}
	file := filepath.Join(dir, "out.csv")
	if err := exportTo(t, f, file); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(file); err != nil || info.Mode().Perm() != want {
		t.Errorf("mode %v, want %v, err %v", info.Mode().Perm(), want, err)
	}
}

// A file that is a link is written through: the link stays and its target
// holds the export.
func TestReportsExportWritesThroughALink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("links need a privilege on Windows")
	}
	f := reportsFake(t)
	f.reports.file, f.reports.fileName = []byte("new"), "out.csv"
	dir := t.TempDir()
	target := filepath.Join(dir, "target.csv")
	if err := os.WriteFile(target, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "link.csv")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if err := exportTo(t, f, link); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Lstat(link); err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Errorf("the link was replaced: %v, err %v", info, err)
	}
	if data, _ := os.ReadFile(target); string(data) != "new" {
		t.Errorf("target holds %q", data)
	}
}

// A download that ends before its declared length is a lost connection: exit
// 7, as the client gives a network failure, and the old file stays.
func TestReportsExportCutDownloadIsUnavailable(t *testing.T) {
	f := reportsFake(t)
	f.reports.file, f.reports.fileName = []byte("0123456789"), "out.csv"
	f.reports.cutAfter = 4
	dir := t.TempDir()
	file := filepath.Join(dir, "out.csv")
	if err := os.WriteFile(file, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	err := exportTo(t, f, file)
	if got := exitcode.Of(err); got != exitcode.Unavailable || err == nil || !strings.Contains(err.Error(), "the download of the report stopped") {
		t.Errorf("exit %d, err %v", got, err)
	}
	if data, _ := os.ReadFile(file); string(data) != "old" {
		t.Errorf("the file was changed: %q", data)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Errorf("a temporary file was left: %v", entries)
	}
}

// A new file does not exist while the server is asked, so a watcher reads no
// empty file and a kill leaves none.
func TestReportsExportNewFileAppearsOnlyWhole(t *testing.T) {
	f := reportsFake(t)
	f.reports.file, f.reports.fileName = []byte("0123456789"), "out.csv"
	file := filepath.Join(t.TempDir(), "out.csv")
	existed := false
	f.reports.onExport = func() {
		_, err := os.Stat(file)
		existed = err == nil
	}
	if err := exportTo(t, f, file); err != nil {
		t.Fatal(err)
	}
	if existed {
		t.Errorf("the file existed while the export was asked for")
	}
	if data, _ := os.ReadFile(file); string(data) != "0123456789" {
		t.Errorf("file %q", data)
	}
}

// A refused export or a cut download makes no new file.
func TestReportsExportFailureMakesNoNewFile(t *testing.T) {
	cases := []struct {
		name  string
		setup func(f *fakeBooks)
	}{
		{"refused", func(f *fakeBooks) {
			f.refuse(http.MethodPost, http.StatusBadRequest, `{"data":{},"message":"No.","status":400}`)
		}},
		{"cut", func(f *fakeBooks) { f.reports.cutAfter = 4 }},
	}
	for _, c := range cases {
		f := reportsFake(t)
		f.reports.file, f.reports.fileName = []byte("0123456789"), "out.csv"
		c.setup(f)
		dir := t.TempDir()
		if err := exportTo(t, f, filepath.Join(dir, "out.csv")); err == nil {
			t.Errorf("%s: no error", c.name)
		}
		if entries, _ := os.ReadDir(dir); len(entries) != 0 {
			t.Errorf("%s: files left: %v", c.name, entries)
		}
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("disk full") }

type brokenReader struct{ err error }

func (r brokenReader) Read([]byte) (int, error) { return 0, r.err }

// A cancel (Ctrl-C) is not "try again": it keeps the exit code of a failure.
func TestCopyDownloadCancelIsNotUnavailable(t *testing.T) {
	err := copyDownload(io.Discard, brokenReader{context.Canceled})
	if got := exitcode.Of(err); got == exitcode.Unavailable || err == nil {
		t.Errorf("exit %d, err %v", got, err)
	}
	if err = copyDownload(io.Discard, brokenReader{io.ErrUnexpectedEOF}); exitcode.Of(err) != exitcode.Unavailable {
		t.Errorf("a cut read: exit %d, err %v", exitcode.Of(err), err)
	}
}

// A write error is the file's, not the download's.
func TestCopyDownloadWriteErrorNamesTheFile(t *testing.T) {
	err := copyDownload(failingWriter{}, strings.NewReader("data"))
	if err == nil || !strings.Contains(err.Error(), "--file: disk full") || strings.Contains(err.Error(), "stopped") {
		t.Errorf("err %v", err)
	}
	if got := exitcode.Of(err); got == exitcode.Unavailable {
		t.Errorf("exit %d", got)
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
	// A directory is no file to write, and the export is not asked for.
	f := reportsFake(t)
	f.reports.file = []byte("x")
	_, _, err := runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--file", t.TempDir())
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--file") {
		t.Errorf("directory: exit %d, err %v", got, err)
	}
	if len(f.reports.exports) != 0 {
		t.Errorf("directory: the export was sent")
	}
	// A file that cannot be written is a usage error before the export is
	// asked for: the server records every export it makes.
	f = reportsFake(t)
	f.reports.file = []byte("x")
	_, _, err = runCmd(t, f.serve(), "", "books", "reports", "export", "books.trial_balance", "--file", missing)
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--file") {
		t.Errorf("unwritable file: exit %d, err %v", got, err)
	}
	if len(f.reports.exports) != 0 {
		t.Errorf("unwritable file: the export was sent")
	}
}
