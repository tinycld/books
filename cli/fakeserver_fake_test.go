package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// These tests are of the fake itself: a fake that answers unlike PocketBase
// lets a command pass here and fail on the server.

// ask sends one request to the fake's handler.
func ask(t *testing.T, f *fakeBooks, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	f.handler().ServeHTTP(rec, req)
	return rec
}

type listBody struct {
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
	Items      []map[string]any
}

func decodeList(t *testing.T, rec *httptest.ResponseRecorder) listBody {
	t.Helper()
	var out listBody
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("not a list: %v\n%s", err, rec.Body.String())
	}
	return out
}

func itemNames(l listBody) []string {
	names := []string{}
	for _, item := range l.Items {
		names = append(names, item["name"].(string))
	}
	return names
}

func TestFakeSkipTotalGivesMinusOne(t *testing.T) {
	f := chart(t)
	got := decodeList(t, ask(t, f, "GET", "/api/collections/books_accounts/records?page=1&perPage=2&skipTotal=1", ""))
	if got.TotalItems != -1 || got.TotalPages != -1 || len(got.Items) != 2 {
		t.Errorf("skipTotal = %+v, want totals -1 and 2 items", got)
	}
	got = decodeList(t, ask(t, f, "GET", "/api/collections/books_accounts/records?page=1&perPage=2", ""))
	if got.TotalItems != 4 || got.TotalPages != 2 {
		t.Errorf("without skipTotal = %+v, want 4 items on 2 pages", got)
	}
}

func TestFakeAppliesTheSort(t *testing.T) {
	f := newFakeBooks(t)
	for _, row := range []struct {
		id, name string
		qty      json.Number
		on       bool
	}{
		{"r1", "b", "10", true}, {"r2", "a", "9", false}, {"r3", "c", "10", false}, {"r4", "a", "100", true},
	} {
		f.add("things", row.id, map[string]any{"name": row.name, "qty": row.qty, "on": row.on})
	}
	order := func(sort string) string {
		got := decodeList(t, ask(t, f, "GET", "/api/collections/things/records?page=1&perPage=50&sort="+sort, ""))
		ids := []string{}
		for _, item := range got.Items {
			ids = append(ids, item["id"].(string))
		}
		return strings.Join(ids, " ")
	}
	for _, tc := range []struct{ sort, want string }{
		{"name,id", "r2 r4 r1 r3"},
		{"-name,id", "r3 r1 r2 r4"},
		{"name,-id", "r4 r2 r1 r3"},
		// Numbers compare as numbers: 9 < 10 < 100.
		{"qty,id", "r2 r1 r3 r4"},
		{"-qty,id", "r4 r1 r3 r2"},
		// false sorts before true; a tie keeps the order the rows were added.
		{"on", "r2 r3 r1 r4"},
		{"-on", "r1 r4 r2 r3"},
		{"", "r1 r2 r3 r4"},
	} {
		if got := order(tc.sort); got != tc.want {
			t.Errorf("sort %q = %s, want %s", tc.sort, got, tc.want)
		}
	}
}

// failures makes the fake collect what it would fail the test with.
func failures(f *fakeBooks) *[]string {
	var got []string
	f.fail = func(format string, args ...any) { got = append(got, fmt.Sprintf(format, args...)) }
	return &got
}

func TestFakeRefusesASortOfAColumnNoRowHas(t *testing.T) {
	f := chart(t)
	got := failures(f)
	ask(t, f, "GET", "/api/collections/books_accounts/records?page=1&perPage=5&sort=nme", "")
	if len(*got) != 1 || !strings.Contains((*got)[0], `"nme"`) {
		t.Errorf("a sort of a column no row has must fail the test: %v", *got)
	}
	ask(t, f, "GET", "/api/collections/books_accounts/records?page=1&perPage=5&sort=-created,full_name,id", "")
	if len(*got) != 1 {
		t.Errorf("a sort of real columns failed the test: %v", *got)
	}
}

func TestFakeFillsEveryColumnOnCreate(t *testing.T) {
	f := newFakeBooks(t)
	rec := ask(t, f, "POST", "/api/collections/books_accounts/records", `{"name":"Petty Cash","type":"bank"}`)
	var row map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]any{
		"name": "Petty Cash", "type": "bank", "number": "", "detail_type": "", "description": "",
		"parent": "", "inactive": false, "full_name": "", "currency": "",
	} {
		if row[key] != want {
			t.Errorf("%s = %#v, want %#v", key, row[key], want)
		}
	}
	for _, key := range []string{"id", "created", "updated"} {
		if s, _ := row[key].(string); s == "" {
			t.Errorf("%s is not set: %v", key, row[key])
		}
	}
	// The body the command sent is kept as it was sent.
	if sent, _ := json.Marshal(f.lastCreate); string(sent) != `{"name":"Petty Cash","type":"bank"}` {
		t.Errorf("lastCreate = %s", sent)
	}
}

func TestFakeFillsEachFieldTypeOnCreate(t *testing.T) {
	// The accounts resource has no ids, integer, number or address field yet,
	// so the value of each type is checked on its own.
	for _, tc := range []struct{ fieldType, want string }{
		{typeString, `""`}, {typeID, `""`}, {typeBool, `false`}, {typeInteger, `0`},
		{typeNumber, `0`}, {typeIDs, `[]`}, {typeAddress, `null`},
	} {
		sent, err := json.Marshal(emptyValue(&field{Name: "x", Type: tc.fieldType}))
		if err != nil || string(sent) != tc.want {
			t.Errorf("%s: empty value = %s (%v), want %s", tc.fieldType, sent, err, tc.want)
		}
	}
}

func TestFakeKnowsEveryCollectionOfTheResources(t *testing.T) {
	f := newFakeBooks(t)
	got := failures(f)
	list := decodeList(t, ask(t, f, "GET", "/api/collections/books_accounts/records?page=1&perPage=5", ""))
	if len(*got) != 0 || list.Items == nil || len(list.Items) != 0 {
		t.Errorf("an empty collection of a resource: failures %v, list %+v", *got, list)
	}
	rec := ask(t, f, "GET", "/api/collections/books_nonsense/records?page=1&perPage=5", "")
	if len(*got) != 1 || rec.Code != http.StatusNotFound {
		t.Errorf("an unknown collection must fail the test: failures %v, status %d", *got, rec.Code)
	}
}

func TestFakeAnswersInJSON(t *testing.T) {
	f := chart(t)
	f.refuse("DELETE", 400, `{"data":{},"message":"no","status":400}`)
	for _, tc := range []struct{ method, target, body string }{
		{"GET", "/api/collections/books_accounts/records?page=1&perPage=5", ""},
		{"GET", "/api/collections/books_accounts/records/acctchecking001", ""},
		{"GET", "/api/collections/books_accounts/records/nope", ""},
		{"POST", "/api/collections/books_accounts/records", `{"name":"A"}`},
		{"PATCH", "/api/collections/books_accounts/records/acctchecking001", `{"name":"B"}`},
		{"PATCH", "/api/collections/books_accounts/records/nope", `{"name":"B"}`},
		{"DELETE", "/api/collections/books_accounts/records/acctchecking001", ""},
	} {
		rec := ask(t, f, tc.method, tc.target, tc.body)
		if got := rec.Header().Get("Content-Type"); got != "application/json" {
			t.Errorf("%s %s (%d): Content-Type = %q", tc.method, tc.target, rec.Code, got)
		}
	}
}
