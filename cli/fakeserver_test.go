package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
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
// WHAT IT CANNOT SEE: it runs no collection rule, no Go guard and no OAuth
// scope check. It proves what the commands send and how they read an answer.
// That the real server accepts those requests is proven in
// server/cli_resources_test.go, against the migrated collections.
type fakeBooks struct {
	t    *testing.T
	rows map[string][]rawRecord
	seq  int

	// What the commands sent, so a test asserts the request and not only the
	// echo of it.
	requests   []string
	lastQuery  url.Values
	lastCreate map[string]any
	lastPatch  map[string]any
	deleted    []string

	// refusal answers the next request of its method, once.
	refusal *fakeRefusal
	// rawFilter turns the filter evaluation off, for a test that asserts the
	// filter text of a value the small evaluator cannot split.
	rawFilter bool
}

type fakeRefusal struct {
	method string
	status int
	body   string
}

func newFakeBooks(t *testing.T) *fakeBooks {
	return &fakeBooks{t: t, rows: map[string][]rawRecord{}}
}

// add stores a row. created and updated are set as the server would.
func (f *fakeBooks) add(collection, id string, fields map[string]any) {
	row := rawRecord{"id": id, "created": "2026-11-01 10:00:00.000Z", "updated": "2026-11-02 10:00:00.000Z"}
	for key, value := range fields {
		row[key] = value
	}
	f.rows[collection] = append(f.rows[collection], row)
}

// refuse makes the next request of the method fail with status and body.
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
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/collections/{collection}/records", f.list)
	mux.HandleFunc("GET /api/collections/{collection}/records/{id}", f.view)
	mux.HandleFunc("POST /api/collections/{collection}/records", f.create)
	mux.HandleFunc("PATCH /api/collections/{collection}/records/{id}", f.update)
	mux.HandleFunc("DELETE /api/collections/{collection}/records/{id}", f.remove)
	return clientFor(f.t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requests = append(f.requests, r.Method+" "+r.URL.Path)
		if r.Header.Get("Authorization") != "Bearer test-token" {
			f.t.Errorf("%s %s: no bearer token", r.Method, r.URL.Path)
		}
		if f.refusal != nil && f.refusal.method == r.Method {
			refusal := f.refusal
			f.refusal = nil
			w.WriteHeader(refusal.status)
			w.Write([]byte(refusal.body))
			return
		}
		mux.ServeHTTP(w, r)
	}))
}

func (f *fakeBooks) known(w http.ResponseWriter, r *http.Request) (string, bool) {
	collection := r.PathValue("collection")
	if _, ok := f.rows[collection]; !ok {
		f.t.Errorf("%s %s: the test did not set up collection %q", r.Method, r.URL.Path, collection)
		notFound(w)
		return "", false
	}
	return collection, true
}

func (f *fakeBooks) list(w http.ResponseWriter, r *http.Request) {
	collection, ok := f.known(w, r)
	if !ok {
		return
	}
	f.lastQuery = r.URL.Query()
	matched := []rawRecord{}
	for _, row := range f.rows[collection] {
		if f.rawFilter || f.matches(row, f.lastQuery.Get("filter")) {
			matched = append(matched, row)
		}
	}
	page, _ := strconv.Atoi(f.lastQuery.Get("page"))
	perPage, _ := strconv.Atoi(f.lastQuery.Get("perPage"))
	if page < 1 || perPage < 1 {
		f.t.Errorf("list of %s without page and perPage: %v", collection, f.lastQuery)
		page, perPage = 1, 30
	}
	start := min((page-1)*perPage, len(matched))
	end := min(start+perPage, len(matched))
	json.NewEncoder(w).Encode(map[string]any{
		"page": page, "perPage": perPage, "totalItems": len(matched),
		"totalPages": (len(matched) + perPage - 1) / perPage, "items": matched[start:end],
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
					f.t.Errorf("unsupported filter clause %q in %q", alternative, filter)
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
			f.t.Errorf("unsupported filter clause %q in %q", clause, filter)
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
	json.NewEncoder(w).Encode(row)
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
	f.add(collection, id, f.lastCreate)
	json.NewEncoder(w).Encode(f.find(collection, id))
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
	for key, value := range f.lastPatch {
		row[key] = value
	}
	json.NewEncoder(w).Encode(row)
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
