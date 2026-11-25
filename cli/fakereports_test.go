package cli

import (
	"encoding/json"
	"net/http"
)

// fakeReports is the fake's stand-in for core's report routes. It runs no
// report: a test gives the pages a run answers, in order, and the file an
// export answers, and reads back what the commands sent.
//
// WHAT IT CANNOT SEE: it checks no param, no option and no scope. That the
// real server takes these bodies from an access token is proven in
// server/cli_reports_test.go.
type fakeReports struct {
	// pages are the answers of POST /api/reports/run, one for each run in
	// order. A run past the last page fails the test.
	pages []string
	// runs holds the body of each run, in the order sent.
	runs []map[string]any
	// file and fileName are the answer of POST /api/reports/export.
	file     []byte
	fileName string
	// exports holds the body of each export, in the order sent.
	exports []map[string]any
}

func (f *fakeBooks) reportRun(w http.ResponseWriter, r *http.Request) {
	body := decodeBody(r)
	f.reports.runs = append(f.reports.runs, body)
	if len(f.reports.runs) > len(f.reports.pages) {
		f.fail("POST %s: run %d, and the test gave %d pages", r.URL.Path, len(f.reports.runs), len(f.reports.pages))
		notFound(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(f.reports.pages[len(f.reports.runs)-1]))
}

func (f *fakeBooks) reportExport(w http.ResponseWriter, r *http.Request) {
	body := decodeBody(r)
	f.reports.exports = append(f.reports.exports, body)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+f.reports.fileName+`"`)
	w.Write(f.reports.file)
}

// sentJSON is a sent body as JSON text, with its keys sorted, to compare.
func sentJSON(body map[string]any) string {
	out, _ := json.Marshal(body)
	return string(out)
}
