package cli

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"

	"tinycld.org/cli/client"
)

// fakeBooks is an in-memory stand-in for the PocketBase record API of the
// Books collections. It keeps rows in the order they were added, pages them,
// and evaluates the filter shapes listFilter builds. A filter of any other
// shape fails the test: a filter the fake ignored is how `list` would seem to
// work while it shows inactive rows.
//
// It answers POST /api/batch as PocketBase does: the writes in order, all of
// them or none, and a refusal under data.requests.<index>.response. It keeps
// the revision rule of server/revision.go, because a command that states the
// wrong revision works against a fake that ignores it.
//
// WHAT IT CANNOT SEE: it runs no collection rule, no other Go guard and no
// OAuth scope check, and it computes no total and no number. It proves what the
// commands send and how they read an answer. That the real server accepts those
// requests is proven in server/cli_resources_test.go and
// server/cli_documents_test.go, against the migrated collections.
type fakeBooks struct {
	t    *testing.T
	rows map[string][]rawRecord
	seq  int

	// What the commands sent, so a test asserts the request and not only the
	// echo of it.
	requests  []string
	lastQuery url.Values
	// listed holds the query of every list request, in the order sent, by collection.
	listed     map[string][]url.Values
	lastCreate map[string]any
	lastPatch  map[string]any
	deleted    []string
	// batches holds the writes of each POST /api/batch, in the order sent.
	batches [][]batchOp
	// createdInBatch holds the ids the batch in progress created; nil outside
	// a batch.
	createdInBatch map[string]bool

	// refusal answers the next request of its method, once.
	refusal *fakeRefusal
	// silences lose the answers of the next writes (a batch, or a write of
	// its own), one for each write, in order.
	silences []fakeSilence
	// rawFilter turns the filter evaluation off, for a test that asserts the
	// filter text of a value the small evaluator cannot split.
	rawFilter bool

	// reports is the stand-in for core's report routes (fakereports_test.go).
	reports fakeReports

	// fail reports a request the fake cannot answer like the real server. It
	// is t.Errorf; a test of the fake itself swaps it to see what was reported.
	fail func(format string, args ...any)
}

type fakeRefusal struct {
	method string
	status int
	body   string
}

// fakeSilence is a write whose answer does not come back, as when a proxy or
// the network fails: the fake stores the write or not, then answers status
// with a proxy's page, or closes the connection with no answer for status 0.
type fakeSilence struct {
	stored bool
	status int
}

// loseAnswers loses the answers of the next writes, one silence for each.
func (f *fakeBooks) loseAnswers(silences ...fakeSilence) {
	f.silences = append(f.silences, silences...)
}

// silent answers a write whose answer is lost.
func (f *fakeBooks) silent(w http.ResponseWriter, status int) {
	if status != 0 {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(status)
		fmt.Fprintf(w, "<html>%d %s</html>", status, http.StatusText(status))
		return
	}
	conn, _, err := w.(http.Hijacker).Hijack()
	if err != nil {
		f.t.Fatalf("the fake cannot close the connection: %v", err)
	}
	conn.Close()
}

func newFakeBooks(t *testing.T) *fakeBooks {
	return &fakeBooks{t: t, rows: map[string][]rawRecord{}, fail: t.Errorf}
}

// add stores a row. created and updated are set as the server would.
func (f *fakeBooks) add(collection, id string, fields map[string]any) {
	row := rawRecord{"id": id, "created": "2026-11-01 10:00:00.000Z", "updated": "2026-11-02 10:00:00.000Z"}
	for key, value := range fields {
		row[key] = value
	}
	f.rows[collection] = append(f.rows[collection], row)
}

// refuse makes the next request of the method fail with status and body. A
// write inside a batch counts as a request of its own method; the method BATCH
// refuses the batch request itself, as the scope check of the server does.
func (f *fakeBooks) refuse(method string, status int, body string) {
	f.refusal = &fakeRefusal{method: method, status: status, body: body}
}

func (f *fakeBooks) find(collection, id string) rawRecord {
	for _, row := range f.rows[collection] {
		if row["id"] == id {
			return row
		}
	}
	return nil
}

func (f *fakeBooks) serve() *client.Client {
	return clientFor(f.t, f.handler())
}

// handler is the fake as an http.Handler, for a test of the fake itself.
func (f *fakeBooks) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/collections/{collection}/records", f.list)
	mux.HandleFunc("GET /api/collections/{collection}/records/{id}", f.view)
	mux.HandleFunc("POST /api/collections/{collection}/records", f.create)
	mux.HandleFunc("PATCH /api/collections/{collection}/records/{id}", f.update)
	mux.HandleFunc("DELETE /api/collections/{collection}/records/{id}", f.remove)
	mux.HandleFunc("POST "+reportRunPath, f.reportRun)
	mux.HandleFunc("POST "+reportExportPath, f.reportExport)
	// one answers one record request: a request of its own, or a write of a batch.
	one := func(w http.ResponseWriter, r *http.Request) {
		if f.refused(w, r.Method) {
			return
		}
		mux.ServeHTTP(w, r)
	}
	serve := func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == batchPath {
			f.batch(w, r, one)
			return
		}
		one(w, r)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requests = append(f.requests, r.Method+" "+r.URL.Path)
		if r.Header.Get("Authorization") != "Bearer test-token" {
			f.t.Errorf("%s %s: no bearer token", r.Method, r.URL.Path)
		}
		if r.Method != http.MethodGet && len(f.silences) > 0 {
			silence := f.silences[0]
			f.silences = f.silences[1:]
			if silence.stored {
				serve(httptest.NewRecorder(), r)
			}
			f.silent(w, silence.status)
			return
		}
		serve(w, r)
	})
}

// refused answers with the refusal a test set for the method, one time.
func (f *fakeBooks) refused(w http.ResponseWriter, method string) bool {
	if f.refusal == nil || f.refusal.method != method {
		return false
	}
	refusal := f.refusal
	f.refusal = nil
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(refusal.status)
	w.Write([]byte(refusal.body))
	return true
}

// batch runs the writes of a POST /api/batch in order. When one fails, the
// rows go back to what they were and the answer names the write, as
// PocketBase's does.
func (f *fakeBooks) batch(w http.ResponseWriter, r *http.Request, one http.HandlerFunc) {
	if f.refused(w, "BATCH") {
		return
	}
	var body struct {
		Requests []batchOp `json:"requests"`
	}
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(&body); err != nil {
		f.fail("POST %s: the body is not a batch: %v", batchPath, err)
	}
	f.batches = append(f.batches, body.Requests)
	// The server refuses the whole batch over its limit; no command may send one.
	if len(body.Requests) > maxBatchWrites {
		f.fail("POST %s: %d writes, and the server takes %d in one batch", batchPath, len(body.Requests), maxBatchWrites)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"data":{},"message":"The allowed max number of batch requests is %d.","status":400}`, maxBatchWrites)
		return
	}
	// The rollback is correct because the fake replaces a row's keys and never
	// changes a nested value in place. A change that does must deep-copy here.
	before := map[string][]rawRecord{}
	for collection, rows := range f.rows {
		for _, row := range rows {
			before[collection] = append(before[collection], maps.Clone(row))
		}
	}
	deletedBefore := len(f.deleted)
	f.createdInBatch = map[string]bool{}
	defer func() { f.createdInBatch = nil }()
	answers := []map[string]any{}
	for i, op := range body.Requests {
		sent, _ := json.Marshal(op.Body)
		rec := httptest.NewRecorder()
		one(rec, httptest.NewRequest(op.Method, op.URL, bytes.NewReader(sent)))
		if rec.Code >= 400 {
			// The rollback restores only the stored state: f.rows and f.deleted.
			// f.batches keeps the sent batch, so a test can read what was sent.
			// f.lastCreate, f.lastPatch and f.seq keep the values of the rolled-back
			// writes: they show what the fake saw, they are not stored state.
			f.rows = before
			f.deleted = f.deleted[:deletedBefore]
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"data":{"requests":{"%d":{"code":"batch_request_failed","message":"Batch request failed.","response":%s}}},"message":"Batch transaction failed.","status":400}`,
				i, strings.TrimSpace(rec.Body.String()))
			return
		}
		answer := map[string]any{"status": rec.Code, "body": nil}
		if rec.Body.Len() > 0 {
			answer["body"] = json.RawMessage(rec.Body.Bytes())
		}
		answers = append(answers, answer)
	}
	writeJSON(w, answers)
}

// writeJSON answers as PocketBase does: a JSON body with its content type.
func writeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(body)
}

// known accepts a collection a resource names, as the real server has it
// whether or not it holds a row, and one the test added by hand.
func (f *fakeBooks) known(w http.ResponseWriter, r *http.Request) (string, bool) {
	collection := r.PathValue("collection")
	if _, ok := f.rows[collection]; !ok && fieldsOf(collection) == nil {
		f.fail("%s %s: the test did not set up collection %q", r.Method, r.URL.Path, collection)
		notFound(w)
		return "", false
	}
	return collection, true
}

func resourceOf(collection string) *resource {
	for i := range resources {
		if resources[i].Collection == collection {
			return &resources[i]
		}
	}
	return nil
}

// fieldsOf is the fields the CLI declares for a collection: of a list
// resource, of a document, or of a line table. nil: the CLI names no such
// collection.
func fieldsOf(collection string) []field {
	if res := resourceOf(collection); res != nil {
		return res.Fields
	}
	for i := range documents {
		if documents[i].Collection == collection {
			return documents[i].Fields
		}
		for j := range documents[i].Views {
			if documents[i].Views[j].Collection == collection {
				return documents[i].Views[j].Fields
			}
		}
		for j := range documents[i].Lines {
			if documents[i].Lines[j].Collection == collection {
				return documents[i].Lines[j].Fields
			}
		}
	}
	return nil
}

// msgStaleRevision is the server's refusal of a change that states another
// revision than the next one (server/revision.go).
const msgStaleRevision = "This entry changed after you opened it. Load it again, then review it before you save or post."

// msgIDNotUnique is the server's answer to a create whose id is stored, as the
// write of a batch answers it (TestCLIDocuments_ResendOfAStoredBatch).
const msgIDNotUnique = `{"data":{"id":{"code":"validation_not_unique","message":"Value must be unique."}},"message":"Failed to create record.","status":400}`

// revisionRefused keeps the rule of server/revision.go for a row that has a
// revision: a change of a draft states the stored revision plus one. In the
// batch that created the row it may state the stored one, because the server
// counts one time for each transaction. The rule holds for a stored draft only,
// so a test that creates a draft must send status "draft" for the fake to check
// its revision. The rule also needs a revision field declared for the collection
// in fieldsOf: a create sets revision 1 only for a declared field.
func (f *fakeBooks) revisionRefused(w http.ResponseWriter, row rawRecord, body map[string]any) bool {
	stored, has := numberOf(row["revision"])
	if !has || row["status"] != "draft" {
		return false
	}
	stated, _ := numberOf(body["revision"])
	id, _ := row["id"].(string)
	if stated == stored+1 || (f.createdInBatch[id] && stated == stored) {
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	fmt.Fprintf(w, `{"data":{},"message":%q,"status":409}`, msgStaleRevision)
	return true
}

// emptyValue is what the server stores and returns for a field a create did
// not send.
func emptyValue(fld *field) any {
	switch fld.Type {
	case typeBool:
		return false
	case typeInteger, typeNumber:
		return json.Number("0")
	case typeIDs:
		return []any{}
	case typeAddress:
		return nil
	default:
		return ""
	}
}

// numberOf reads a value a test or a request body holds as a number.
func numberOf(v any) (float64, bool) {
	switch n := v.(type) {
	case json.Number:
		x, err := n.Float64()
		return x, err == nil
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

// compareValues orders two column values: numbers by value, bools false before
// true, anything else as text.
func compareValues(a, b any) int {
	if x, ok := numberOf(a); ok {
		if y, ok := numberOf(b); ok {
			return cmp.Compare(x, y)
		}
	}
	if x, ok := a.(bool); ok {
		if y, ok := b.(bool); ok {
			switch {
			case x == y:
				return 0
			case !x:
				return -1
			}
			return 1
		}
	}
	return strings.Compare(cellText(a), cellText(b))
}

// sortRows applies the sort the command sent: comma-separated columns, a
// leading "-" for descending, ties kept in the order the rows were added. A
// column that no row of the collection has fails the test, as it is a refusal
// from the real server.
func (f *fakeBooks) sortRows(collection string, rows []rawRecord, sortText string) {
	if sortText == "" {
		return
	}
	type term struct {
		column string
		desc   bool
	}
	terms := []term{}
	for _, text := range strings.Split(sortText, ",") {
		t := term{column: strings.TrimLeft(text, "-+"), desc: strings.HasPrefix(text, "-")}
		known := len(f.rows[collection]) == 0
		for _, row := range f.rows[collection] {
			if _, ok := row[t.column]; ok {
				known = true
			}
		}
		if !known {
			f.fail("sort %q of %s names the column %q, which no row has", sortText, collection, t.column)
			return
		}
		terms = append(terms, t)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		for _, t := range terms {
			c := compareValues(rows[i][t.column], rows[j][t.column])
			if t.desc {
				c = -c
			}
			if c != 0 {
				return c < 0
			}
		}
		return false
	})
}

func (f *fakeBooks) list(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	f.lastQuery = r.URL.Query()
	if f.listed == nil {
		f.listed = map[string][]url.Values{}
	}
	f.listed[collection] = append(f.listed[collection], f.lastQuery)
	matched := []rawRecord{}
	for _, row := range f.rows[collection] {
		if f.rawFilter || f.matches(row, f.lastQuery.Get("filter")) {
			matched = append(matched, row)
		}
	}
	// `fields` is not applied: the commands read whole records.
	f.sortRows(collection, matched, f.lastQuery.Get("sort"))
	page, _ := strconv.Atoi(f.lastQuery.Get("page"))
	perPage, _ := strconv.Atoi(f.lastQuery.Get("perPage"))
	if page < 1 || perPage < 1 {
		f.fail("list of %s without page and perPage: %v", collection, f.lastQuery)
		page, perPage = 1, 30
	}
	start := min((page-1)*perPage, len(matched))
	end := min(start+perPage, len(matched))
	totalItems, totalPages := len(matched), (len(matched)+perPage-1)/perPage
	if skip := f.lastQuery.Get("skipTotal"); skip == "1" || skip == "true" {
		totalItems, totalPages = -1, -1
	}
	writeJSON(w, map[string]any{
		"page": page, "perPage": perPage, "totalItems": totalItems,
		"totalPages": totalPages, "items": matched[start:end],
	})
}

var (
	reBoolClause   = regexp.MustCompile(`^(\w+) = (true|false)$`)
	reEqualClause  = regexp.MustCompile(`^(\w+) = "((?:[^"\\]|\\.)*)"$`)
	reSearchClause = regexp.MustCompile(`^(\w+) ~ "((?:[^"\\]|\\.)*)"$`)
)

func unquote(s string) string {
	return strings.NewReplacer(`\"`, `"`, `\\`, `\`).Replace(s)
}

// matches evaluates the filters listFilter builds: clauses joined by " && ",
// each `field = true|false`, `field = "text"`, or a group
// `(a ~ "text" || b ~ "text")`.
func (f *fakeBooks) matches(row rawRecord, filter string) bool {
	if filter == "" {
		return true
	}
	for _, clause := range strings.Split(filter, " && ") {
		switch {
		case reBoolClause.MatchString(clause):
			m := reBoolClause.FindStringSubmatch(clause)
			have, _ := row[m[1]].(bool)
			if have != (m[2] == "true") {
				return false
			}
		case reEqualClause.MatchString(clause):
			m := reEqualClause.FindStringSubmatch(clause)
			if have, _ := row[m[1]].(string); have != unquote(m[2]) {
				return false
			}
		case strings.HasPrefix(clause, "(") && strings.HasSuffix(clause, ")"):
			found := false
			for _, alternative := range strings.Split(clause[1:len(clause)-1], " || ") {
				m := reSearchClause.FindStringSubmatch(alternative)
				if m == nil {
					f.fail("unsupported filter clause %q in %q", alternative, filter)
					return false
				}
				have, _ := row[m[1]].(string)
				if strings.Contains(strings.ToLower(have), strings.ToLower(unquote(m[2]))) {
					found = true
				}
			}
			if !found {
				return false
			}
		default:
			f.fail("unsupported filter clause %q in %q", clause, filter)
			return false
		}
	}
	return true
}

func (f *fakeBooks) view(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	row := f.find(collection, r.PathValue("id"))
	if row == nil {
		notFound(w)
		return
	}
	writeJSON(w, row)
}

func decodeBody(r *http.Request) map[string]any {
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	var body map[string]any
	dec.Decode(&body)
	return body
}

func (f *fakeBooks) create(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	f.lastCreate = decodeBody(r)
	f.seq++
	id := fmt.Sprintf("rec%012d", f.seq)
	// A caller may name the id, as a document's batch does for its lines.
	if given, ok := f.lastCreate["id"].(string); ok && given != "" {
		id = given
	}
	// The real answer to a create with a stored id
	// (TestCLIDocuments_ResendOfAStoredBatch).
	if f.find(collection, id) != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(msgIDNotUnique))
		return
	}
	// The server answers with every column: one the body did not send is empty.
	stored := map[string]any{}
	fields := fieldsOf(collection)
	for i := range fields {
		stored[fields[i].Name] = emptyValue(&fields[i])
		// The server starts a document at revision 1.
		if fields[i].Name == "revision" {
			stored["revision"] = json.Number("1")
		}
	}
	for key, value := range f.lastCreate {
		stored[key] = value
	}
	if f.createdInBatch != nil {
		f.createdInBatch[id] = true
	}
	f.add(collection, id, stored)
	writeJSON(w, f.find(collection, id))
}

func (f *fakeBooks) update(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	row := f.find(collection, r.PathValue("id"))
	if row == nil {
		notFound(w)
		return
	}
	f.lastPatch = decodeBody(r)
	if f.revisionRefused(w, row, f.lastPatch) {
		return
	}
	fields := fieldsOf(collection)
	for key, value := range f.lastPatch {
		// The server stores a null as the field's empty value.
		if value == nil {
			if i := slices.IndexFunc(fields, func(fld field) bool { return fld.Name == key }); i >= 0 {
				value = emptyValue(&fields[i])
			}
		}
		row[key] = value
	}
	writeJSON(w, row)
}

func (f *fakeBooks) remove(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if f.find(collection, id) == nil {
		notFound(w)
		return
	}
	kept := f.rows[collection][:0]
	for _, row := range f.rows[collection] {
		if row["id"] != id {
			kept = append(kept, row)
		}
	}
	f.rows[collection] = kept
	f.deleted = append(f.deleted, id)
	w.WriteHeader(http.StatusNoContent)
}

// notFound answers as PocketBase does for a missing record, and for a record
// the caller's rule hides.
func notFound(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	w.Write([]byte(`{"data":{},"message":"The requested resource wasn't found.","status":404}`))
}

// chart is the standard accounts fixture:
//
//	acctchecking001  1000  Checking           bank     checking
//	acctsavings0001  1010  Savings            bank     savings
//	acctincome00001  4000  Consulting Income  income   service_income
//	acctoldcard0001        Old Card           credit_card  (inactive)
func chart(t *testing.T) *fakeBooks {
	f := newFakeBooks(t)
	account := func(id, number, name, accountType, detail string, inactive bool) {
		f.add("books_accounts", id, map[string]any{
			"name": name, "number": number, "type": accountType, "detail_type": detail,
			"description": "", "parent": "", "inactive": inactive, "form_1099_box": "",
			"full_name": name, "currency": "USD",
			// A column the CLI does not know: a server newer than this CLI.
			"future_column": "x",
		})
	}
	account("acctchecking001", "1000", "Checking", "bank", "checking", false)
	account("acctsavings0001", "1010", "Savings", "bank", "savings", false)
	account("acctincome00001", "4000", "Consulting Income", "income", "service_income", false)
	account("acctoldcard0001", "", "Old Card", "credit_card", "credit_card", true)
	return f
}
