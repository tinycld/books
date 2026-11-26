package cli

import (
	"context"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
)

// The bodies of a failed batch, from the real server (the run of
// probe-journal-batch in the plan): a guard refusal of the fourth write, and a
// schema refusal of the second.
const (
	batchGuardRefusal  = `{"data":{"requests":{"3":{"code":"batch_request_failed","message":"Batch request failed.","response":{"data":{},"message":"Debits (5.00) do not equal credits (4.00). The entry is out of balance by 1.00.","status":400}}}},"message":"Batch transaction failed.","status":400}`
	batchSchemaRefusal = `{"data":{"requests":{"1":{"code":"batch_request_failed","message":"Batch request failed.","response":{"data":{"account":{"code":"validation_missing_rel_records","message":"Failed to find all relation records with the provided ids."}},"message":"Failed to create record.","status":400}}}},"message":"Batch transaction failed.","status":400}`
	batchStaleRefusal  = `{"data":{"requests":{"0":{"code":"batch_request_failed","message":"Batch request failed.","response":{"data":{},"message":"This entry changed after you opened it. Load it again, then review it before you save or post.","status":409}}}},"message":"Batch transaction failed.","status":400}`
)

func fourOps() []batchOp {
	return []batchOp{
		createOp("books_journal_entries", "journal entry", map[string]any{"id": "entry0000000001"}),
		createOp("books_journal_lines", "lines[0]", map[string]any{"entry": "entry0000000001"}),
		createOp("books_journal_lines", "lines[1]", map[string]any{"entry": "entry0000000001"}),
		updateOp("books_journal_entries", "entry0000000001", "post", map[string]any{"status": "posted", "revision": 1}),
	}
}

func TestBatchFailureIsTheRefusalOfTheWrite(t *testing.T) {
	cases := []struct {
		name, body, message string
		status              int
		field               string
	}{
		{"a guard refusal", batchGuardRefusal, "post: Debits (5.00) do not equal credits (4.00). The entry is out of balance by 1.00.", 400, ""},
		{"a schema refusal", batchSchemaRefusal, "lines[0]: Failed to create record.", 400, "account"},
		{"a stale revision", batchStaleRefusal, "journal entry: This entry changed after you opened it. Load it again, then review it before you save or post.", 409, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := batchFailure(fourOps(), &client.APIError{Status: 400, Message: "Batch transaction failed.", Body: []byte(tc.body)})
			var api *client.APIError
			if !errors.As(err, &api) {
				t.Fatalf("err = %v, want an APIError", err)
			}
			if api.Status != tc.status || api.Message != tc.message {
				t.Errorf("status %d, message %q; want %d, %q", api.Status, api.Message, tc.status, tc.message)
			}
			if got := exitcode.Of(exitcode.Classify(err)); got != exitcode.Refused {
				t.Errorf("exit = %d, want %d", got, exitcode.Refused)
			}
			fields := refusedFields(api.Body)
			if (tc.field == "") != (len(fields) == 0) || (tc.field != "" && fields[tc.field].Code == "") {
				t.Errorf("fields = %v, want the field %q", fields, tc.field)
			}
		})
	}
}

func TestBatchFailureKeepsAnErrorOfAnotherShape(t *testing.T) {
	scope := &client.APIError{Status: 403, Message: "Operation 1 of the batch requires the books:write scope",
		Body: []byte(`{"data":{},"message":"Operation 1 of the batch requires the books:write scope","status":403}`)}
	page := &client.APIError{Status: 502, Body: []byte("<html>Bad Gateway</html>")}
	odd := &client.APIError{Status: 400, Message: "Batch transaction failed.",
		Body: []byte(`{"data":{"requests":{"x":{"response":{"status":400}}}},"message":"Batch transaction failed.","status":400}`)}
	plain := errors.New("dial tcp: connection refused")
	for _, err := range []error{scope, page, odd, plain} {
		if got := batchFailure(fourOps(), err); got != err {
			t.Errorf("batchFailure(%v) = %v, want the same error", err, got)
		}
	}
	if got := batchFailure(fourOps(), nil); got != nil {
		t.Errorf("batchFailure(nil) = %v", got)
	}
}

// The label names a write for a person. It is not part of the request.
func TestSendBatchSendsTheWritesAndNotTheLabels(t *testing.T) {
	var sent string
	c := clientFor(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		sent = r.Method + " " + r.URL.Path + " " + string(data)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[]`))
	}))
	ops := []batchOp{
		createOp("books_journal_lines", "lines[0]", map[string]any{"entry": "entry0000000001", "position": 0}),
		updateOp("books_journal_entries", "entry0000000001", "post", map[string]any{"revision": 2}),
		deleteOp("books_journal_lines", "line00000000001", "remove lines[0]"),
	}
	if err := sendBatch(context.Background(), c, ops); err != nil {
		t.Fatal(err)
	}
	want := `POST /api/batch {"requests":[` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"entry":"entry0000000001","position":0}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/entry0000000001","body":{"revision":2}},` +
		`{"method":"DELETE","url":"/api/collections/books_journal_lines/records/line00000000001"}]}`
	if sent != want {
		t.Errorf("sent:\n%s\nwant:\n%s", sent, want)
	}
}

func TestSendBatchUnwrapsARefusal(t *testing.T) {
	c := clientFor(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(batchSchemaRefusal))
	}))
	err := sendBatch(context.Background(), c, fourOps())
	if err == nil || !strings.Contains(err.Error(), "lines[0]: Failed to create record.") {
		t.Errorf("err = %v", err)
	}
}

func TestNewRecordIDHasTheShapeOfAServerID(t *testing.T) {
	shape := regexp.MustCompile(`^[a-z0-9]{15}$`)
	seen := map[string]bool{}
	for range 200 {
		id := newRecordID()
		if !shape.MatchString(id) {
			t.Fatalf("id %q is not 15 lower-case letters and digits", id)
		}
		if seen[id] {
			t.Fatalf("id %q was made twice", id)
		}
		seen[id] = true
	}
}

// fixedIDs makes newRecordID give these ids, in order.
func fixedIDs(t *testing.T, ids ...string) {
	t.Helper()
	orig := newRecordID
	next := 0
	newRecordID = func() string {
		if next >= len(ids) {
			t.Fatalf("the command made more than %d ids", len(ids))
		}
		id := ids[next]
		next++
		return id
	}
	t.Cleanup(func() { newRecordID = orig })
}

func TestFakeBatchStoresAllOrNothing(t *testing.T) {
	f := chart(t)
	c := f.serve()
	good := []batchOp{
		createOp("books_accounts", "", map[string]any{"id": "acctnew00000001", "name": "Petty Cash"}),
		updateOp("books_accounts", "acctnew00000001", "", map[string]any{"number": "1020"}),
		deleteOp("books_accounts", "acctoldcard0001", ""),
	}
	if err := sendBatch(context.Background(), c, good); err != nil {
		t.Fatal(err)
	}
	if row := f.find("books_accounts", "acctnew00000001"); row == nil || row["number"] != "1020" {
		t.Fatalf("the account after the batch = %v", row)
	}
	if f.find("books_accounts", "acctoldcard0001") != nil || len(f.batches) != 1 || len(f.batches[0]) != 3 {
		t.Fatalf("batches = %v", f.batches)
	}
	bad := []batchOp{
		createOp("books_accounts", "", map[string]any{"id": "acctnew00000002", "name": "Till"}),
		deleteOp("books_accounts", "acctsavings0001", ""),
		deleteOp("books_customers", "nosuchcustomer1", "remove lines[0]"),
	}
	err := sendBatch(context.Background(), c, bad)
	var api *client.APIError
	if !errors.As(err, &api) || api.Status != 404 || !strings.HasPrefix(api.Message, "remove lines[0]: ") {
		t.Fatalf("err = %v, want the 404 of the third write", err)
	}
	if f.find("books_accounts", "acctnew00000002") != nil || f.find("books_accounts", "acctsavings0001") == nil {
		t.Error("a write of a failed batch was kept")
	}
	if strings.Join(f.deleted, ",") != "acctoldcard0001" {
		t.Errorf("deleted = %v, want the delete of the first batch alone", f.deleted)
	}
}

func TestFakeKeepsTheRevisionRule(t *testing.T) {
	f := chart(t)
	c := f.serve()
	f.add("books_journal_entries", "entry0000000001", map[string]any{"status": "draft", "revision": 3})
	patch := func(body map[string]any) error {
		_, err := client.UpdateRecord[rawRecord](context.Background(), c, "books_journal_entries", "entry0000000001", body)
		return err
	}
	for _, stale := range []map[string]any{{"memo": "x"}, {"memo": "x", "revision": 3}, {"memo": "x", "revision": 5}} {
		var api *client.APIError
		if err := patch(stale); !errors.As(err, &api) || api.Status != 409 || api.Message != msgStaleRevision {
			t.Errorf("patch %v: err = %v, want 409", stale, err)
		}
	}
	if err := patch(map[string]any{"memo": "x", "revision": 4}); err != nil {
		t.Errorf("the next revision was refused: %v", err)
	}
}
