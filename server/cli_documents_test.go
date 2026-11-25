package books

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The transaction commands of the Books CLI are built from cli/documents.json.
// Their tests in cli/ run against a fake that has no schema, no rule and no
// posting code. These tests are the other half: they hold documents.json to
// the migrated collections and the OAuth registration, and they send the
// batches the commands send to the real PocketBase API. The server test cannot
// import the CLI module, so each batch here is a copy of what the command
// sends (the `want` text of the test in cli/ that the comment names): when a
// command changes a body, change the copy with it.

type cliLineTable struct {
	Key        string     `json:"key"`
	Collection string     `json:"collection"`
	Parent     string     `json:"parent"`
	Sort       string     `json:"sort"`
	ReadOnly   bool       `json:"readOnly"`
	Max        int        `json:"max"`
	Apply      bool       `json:"apply"` // `apply` and `unapply` write its rows
	NoUpdate   bool       `json:"noUpdate"`
	Omit       []string   `json:"omit"`
	Timestamps []string   `json:"timestamps"`
	Fields     []cliField `json:"fields"`
}

type cliDocument struct {
	cliResource
	Lifecycle string            `json:"lifecycle"`
	Fixed     map[string]string `json:"fixed"`
	Entry     string            `json:"entry"`
	Lines     []cliLineTable    `json:"lines"`
	Views     []cliResource     `json:"views"`
}

func loadCLIDocuments(t testing.TB) []cliDocument {
	t.Helper()
	data, err := os.ReadFile("../cli/documents.json")
	if err != nil {
		t.Fatalf("read the CLI's document definitions: %v", err)
	}
	var file struct {
		Documents []cliDocument `json:"documents"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("cli/documents.json: %v", err)
	}
	if len(file.Documents) == 0 {
		t.Fatal("cli/documents.json has no documents")
	}
	return file.Documents
}

// cliCollections maps each name a `ref` may hold (a list resource, a document,
// or a line table as `<document>.<key>`) to its collection.
func cliCollections(t testing.TB) map[string]string {
	t.Helper()
	collectionOf := map[string]string{}
	for _, res := range loadCLIResources(t) {
		collectionOf[res.Name] = res.Collection
	}
	for _, doc := range loadCLIDocuments(t) {
		collectionOf[doc.Name] = doc.Collection
		for _, table := range doc.Lines {
			collectionOf[doc.Name+"."+table.Key] = table.Collection
		}
	}
	return collectionOf
}

// requireCLIFields holds the declared fields of one collection to the migrated
// collection: type, required flag, select values, relation target, and that
// every column a caller can see is declared or left out on purpose. timestamps
// is the definition's `timestamps` key: nil means created and updated.
func requireCLIFields(t *testing.T, app core.App, label, collection string, fields []cliField, omit, timestamps []string, collectionOf map[string]string) *core.Collection {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Errorf("%s: collection %s: %v", label, collection, err)
		return nil
	}
	said := timestamps
	if said == nil {
		said = []string{"created", "updated"}
	}
	for _, stamp := range []string{"created", "updated"} {
		if has := col.Fields.GetByName(stamp) != nil; has != slices.Contains(said, stamp) {
			have := []string{}
			for _, name := range []string{"created", "updated"} {
				if col.Fields.GetByName(name) != nil {
					have = append(have, name)
				}
			}
			t.Errorf("%s: the CLI's timestamps say %v, and %s has %v", label, said, collection, have)
			break
		}
	}
	declaredNames := map[string]bool{}
	for _, declared := range fields {
		declaredNames[declared.Name] = true
		f := col.Fields.GetByName(declared.Name)
		if f == nil {
			t.Errorf("%s: the CLI declares %q, and %s has no such field", label, declared.Name, collection)
			continue
		}
		if f.GetHidden() {
			t.Errorf("%s.%s is hidden: the API never sends it, so the CLI must not declare it", label, declared.Name)
		}
		wantType, required, values := cliTypeOf(collection, f)
		if declared.Type != wantType {
			t.Errorf("%s.%s: the CLI says %q, the collection field is %q (%s)", label, declared.Name, declared.Type, wantType, f.Type())
		}
		if !declared.ReadOnly && declared.Required != required {
			t.Errorf("%s.%s: the CLI says required = %v, the collection says %v", label, declared.Name, declared.Required, required)
		}
		if !slices.Equal(declared.Enum, values) {
			t.Errorf("%s.%s: the CLI's values %v are not the select's %v", label, declared.Name, declared.Enum, values)
		}
		if rel, ok := f.(*core.RelationField); ok {
			target, err := app.FindCollectionByNameOrId(rel.CollectionId)
			if err != nil {
				t.Fatalf("%s.%s: %v", label, declared.Name, err)
			}
			if collectionOf[declared.Ref] != target.Name {
				t.Errorf("%s.%s: ref %q is %q, the relation points to %s", label, declared.Name, declared.Ref, collectionOf[declared.Ref], target.Name)
			}
		}
	}
	for _, f := range col.Fields {
		name := f.GetName()
		if f.GetHidden() || name == "id" || name == "created" || name == "updated" {
			continue
		}
		if !declaredNames[name] && !slices.Contains(omit, name) {
			t.Errorf("%s has the field %q, which cli/documents.json neither declares for %s nor lists in its omit", collection, name, label)
		}
	}
	for _, name := range omit {
		if col.Fields.GetByName(name) == nil {
			t.Errorf("%s: omit names %q, and %s has no such field", label, name, collection)
		}
	}
	return col
}

func TestCLIDocuments_MatchTheCollections(t *testing.T) {
	app := newBooksApp(t)
	collectionOf := cliCollections(t)
	for _, doc := range loadCLIDocuments(t) {
		if requireCLIFields(t, app, doc.Name, doc.Collection, doc.Fields, doc.Omit, doc.Timestamps, collectionOf) == nil {
			continue
		}
		for _, view := range doc.Views {
			requireCLIFields(t, app, doc.Name+" "+view.Name, view.Collection, view.Fields, view.Omit, view.Timestamps, collectionOf)
		}
		for _, table := range doc.Lines {
			label := doc.Name + "." + table.Key
			col := requireCLIFields(t, app, label, table.Collection, table.Fields, table.Omit, table.Timestamps, collectionOf)
			if col == nil {
				continue
			}
			// The CLI sets the parent and the position of every row.
			parent, ok := col.Fields.GetByName(table.Parent).(*core.RelationField)
			if !ok {
				t.Errorf("%s: parent %q is not a relation of %s", label, table.Parent, table.Collection)
				continue
			}
			target, err := app.FindCollectionByNameOrId(parent.CollectionId)
			if err != nil {
				t.Fatal(err)
			}
			if target.Name != doc.Collection {
				t.Errorf("%s: parent %q points to %s, not to %s", label, table.Parent, target.Name, doc.Collection)
			}
			// A row that `apply` adds has no place among the others.
			if table.Apply {
				if col.Fields.GetByName("position") != nil {
					t.Errorf("%s: %s has a position, and `apply` sets none", label, table.Collection)
				}
				continue
			}
			if position, ok := col.Fields.GetByName("position").(*core.NumberField); !ok || !position.OnlyInt {
				t.Errorf("%s: %s has no whole-number position", label, table.Collection)
			}
			// An edit of a draft updates a stored row in place, unless the
			// collection refuses every update of a row: then it removes the row
			// and creates it again (draftEditOps of cli/document_edit.go).
			if !table.ReadOnly && (col.UpdateRule == nil) != table.NoUpdate {
				t.Errorf("%s: noUpdate is %v, and the update rule of %s is %v", label, table.NoUpdate, table.Collection, col.UpdateRule)
			}
		}
	}
}

// A token reaches a collection only when the OAuth registration names it. A
// command writes the document, every table it sends and the table of `apply`,
// and only reads a table Books writes.
func TestCLIDocuments_OAuthAllowsEveryCollection(t *testing.T) {
	collections := oauthPackage().Collections
	check := func(label, collection string, write bool) {
		access, ok := collections[collection]
		if !ok {
			t.Errorf("%s: %s has no OAuth entry, so every CLI call on it would be refused", label, collection)
			return
		}
		if !slices.Equal(access.Read, []string{scopeRead}) {
			t.Errorf("%s: OAuth read access of %s = %v, want %s", label, collection, access.Read, scopeRead)
		}
		if write && !slices.Equal(access.Write, []string{scopeWrite}) {
			t.Errorf("%s: OAuth write access of %s = %v, want %s", label, collection, access.Write, scopeWrite)
		}
	}
	for _, doc := range loadCLIDocuments(t) {
		check(doc.Name, doc.Collection, true)
		for _, view := range doc.Views {
			check(doc.Name+" "+view.Name, view.Collection, false)
		}
		for _, table := range doc.Lines {
			check(doc.Name+"."+table.Key, table.Collection, !table.ReadOnly || table.Apply)
		}
	}
}

// cliOp is one write of a batch, as cli/batch.go sends it. An empty body is a
// DELETE.
func cliOp(method, collection, id, body string) string {
	path := "/api/collections/" + collection + "/records"
	if id != "" {
		path += "/" + id
	}
	if body == "" {
		return fmt.Sprintf(`{"method":%q,"url":%q}`, method, path)
	}
	return fmt.Sprintf(`{"method":%q,"url":%q,"body":%s}`, method, path, body)
}

// docBatch is the POST /api/batch of one document write, which the server
// accepts.
func docBatch(token string, ops ...string) apiReq {
	return apiReq{method: "POST", url: "/api/batch", token: token, body: batchBody(ops...), want: 200}
}

// refusedBatch is a batch the server refuses: PocketBase answers 400 whatever
// the status of the write that failed, and the content names that write.
func refusedBatch(token string, content []string, ops ...string) apiReq {
	return apiReq{method: "POST", url: "/api/batch", token: token, body: batchBody(ops...), want: 400, content: content}
}

func recordURL(collection, id string) string {
	return "/api/collections/" + collection + "/records/" + id
}

// rowsURL is the read of the rows of one line table, as withLines of
// cli/document_read.go asks for them.
func rowsURL(collection, parent, id string) string {
	return sortedRowsURL(collection, parent, id, "position,id")
}

// sortedRowsURL is rowsURL for a table that is sorted by its own sort (the
// applications of a credit, by date).
func sortedRowsURL(collection, parent, id, sort string) string {
	q := url.Values{}
	q.Set("filter", parent+` = "`+id+`"`)
	q.Set("sort", sort)
	return "/api/collections/" + collection + "/records?" + q.Encode()
}

// showDoc is the two reads of `show` for a document with one line table.
func showDoc(token, collection, id string, header []string, lines, parent string, rows []string) []apiReq {
	return []apiReq{
		{method: "GET", url: recordURL(collection, id), token: token, want: 200, content: header},
		{method: "GET", url: rowsURL(lines, parent, id), token: token, want: 200, content: rows},
	}
}

func apiCalls(groups ...[]apiReq) []apiReq {
	return slices.Concat(groups...)
}

// rowOp is the create of one row of a line table, as lineOps of
// cli/document_add.go sends it: the caller's fields, then the document's id
// and the row's place. fields is the inside of a JSON object.
func rowOp(collection, parent, docID string, position int, fields string) string {
	return cliOp("POST", collection, "", fmt.Sprintf(`{%s,%q:%q,"position":%d}`, fields, parent, docID, position))
}

// editRowOp is the create of one row by an edit of a draft, as editRowCreateOp
// of cli/document_edit.go sends it: rowOp with an id the CLI chose.
func editRowOp(collection, parent, docID, id string, position int, fields string) string {
	return cliOp("POST", collection, "", fmt.Sprintf(`{%s,"id":%q,%q:%q,"position":%d}`, fields, id, parent, docID, position))
}

func journalLine(entry string, account *core.Record, side string, cents, position int) string {
	return journalLineMemo(entry, account, side, cents, position, "")
}

// journalLineMemo sends a line, with its memo when memo is not empty, with the
// same fields and values as the CLI test's line.
func journalLineMemo(entry string, account *core.Record, side string, cents, position int, memo string) string {
	if memo == "" {
		return rowOp("books_journal_lines", "entry", entry, position, fmt.Sprintf(`"account":%q,%q:%d`, account.Id, side, cents))
	}
	return rowOp("books_journal_lines", "entry", entry, position, fmt.Sprintf(`"account":%q,%q:%d,"memo":%q`, account.Id, side, cents, memo))
}

// rowUpdateOp is the in-place change of one stored row, as rowUpdate of
// cli/document_edit.go sends it: every writable field (null for one the new
// row does not name) and the row's place, never the parent. fields is the
// inside of a JSON object, its keys in order.
func rowUpdateOp(collection, id, fields string) string {
	return cliOp("PATCH", collection, id, "{"+fields+"}")
}

// journalLineUpdate is the update of a stored journal line to a line with
// only an account and one side, as the CLI test's batch sends it.
func journalLineUpdate(id string, account *core.Record, side string, cents, position int) string {
	other := "credit"
	if side == "credit" {
		other = "debit"
	}
	values := map[string]string{side: fmt.Sprint(cents), other: "null"}
	return rowUpdateOp("books_journal_lines", id, fmt.Sprintf(`"account":%q,"credit":%s,"customer":null,"debit":%s,"memo":null,"position":%d,"vendor":null`,
		account.Id, values["credit"], values["debit"], position))
}

// An edit of a draft of 1000 lines (a journal entry's most) is 1000 line
// updates and the header in one batch: under the server's limit of 1100. The
// body is the one of TestDocumentEditOfA1000LineDraftChangesTheRowsInPlace in
// cli/document_edit_test.go.
func TestCLIDocuments_JournalEntryEditOf1000LinesInPlace(t *testing.T) {
	env, token := cliLedgerEnv(t)
	entry := bigDraft(t, env, 1000)
	saw := revisionOf(t, env.app, entry.Id)
	var ops []string
	for i, line := range mustLines(t, env.app, entry.Id) {
		if i%2 == 0 {
			ops = append(ops, journalLineUpdate(line.Id, env.checking, "debit", 3, i))
		} else {
			ops = append(ops, journalLineUpdate(line.Id, env.revenue, "credit", 3, i))
		}
	}
	if len(ops) != 1000 {
		t.Fatalf("the draft has %d lines, want 1000", len(ops))
	}
	ops = append(ops, cliOp("PATCH", "books_journal_entries", entry.Id, fmt.Sprintf(`{"revision":%d}`, saw+1)))
	apiSeq(t, env.app, docBatch(token, ops...))
	saved := reload(t, env.app, "books_journal_entries", entry.Id)
	if saved.GetInt("total") != 1500 || saved.GetInt("revision") != saw+1 {
		t.Fatalf("total/revision = %d/%d, want 1500/%d", saved.GetInt("total"), saved.GetInt("revision"), saw+1)
	}
	if got := len(mustLines(t, env.app, entry.Id)); got != 1000 {
		t.Fatalf("the draft has %d lines after the edit, want 1000", got)
	}
	requireNoDrift(t, env.app)
}

func cliLedgerEnv(t *testing.T) (*ledgerEnv, string) {
	t.Helper()
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	return env, tokenFor(t, env.users.bookkeeper)
}

// Every write of the journal-entries commands, in the order a caller would run
// them. The bodies are those of cli/document_add_test.go,
// cli/document_edit_test.go and cli/document_status_test.go.
func TestCLIDocuments_JournalEntryRoundTrip(t *testing.T) {
	env, token := cliLedgerEnv(t)
	const entries, lines = "books_journal_entries", "books_journal_lines"
	header := func(id, extra string) string {
		return cliOp("POST", entries, "", fmt.Sprintf(`{"date":"2026-07-15","doc_type":"journal","id":%q,"memo":"Owner investment","origin":"manual","status":"draft"%s}`, id, extra))
	}
	var draftLines []string
	apiSeq(t, env.app, apiCalls(
		// add
		[]apiReq{docBatch(token, header("clientry0000001", ""),
			journalLine("clientry0000001", env.checking, "debit", 50000, 0),
			journalLineMemo("clientry0000001", env.revenue, "credit", 50000, 1, "Paid in"))},
		showDoc(token, entries, "clientry0000001", []string{`"status":"draft"`, `"revision":1`, `"total":50000`, `"number":""`},
			lines, "entry", []string{`"totalItems":2`, `"debit":50000`, `"memo":"Paid in"`}),
		// add --post: the post is the last write and states revision 1.
		[]apiReq{docBatch(token, header("clientry0000002", ""),
			journalLine("clientry0000002", env.checking, "debit", 50000, 0),
			journalLineMemo("clientry0000002", env.revenue, "credit", 50000, 1, "Paid in"),
			cliOp("PATCH", entries, "clientry0000002", `{"revision":1,"status":"posted"}`))},
		showDoc(token, entries, "clientry0000002", []string{`"status":"posted"`, `"revision":1`, `"number":"1"`},
			lines, "entry", []string{`"totalItems":2`, `"memo":"Paid in"`}),
	)...)
	// The edit changes the lines by id in place, as draftEditOps does from what
	// it read.
	for _, line := range mustLines(t, env.app, "clientry0000001") {
		draftLines = append(draftLines, line.Id)
	}
	if len(draftLines) != 2 {
		t.Fatalf("the draft has %d lines, want 2", len(draftLines))
	}
	apiSeq(t, env.app, apiCalls(
		// edit of a draft: each stored line takes the new line of its place,
		// null for a field the new line does not name (the second line's memo);
		// the header is last and states the next revision.
		[]apiReq{docBatch(token,
			journalLineUpdate(draftLines[0], env.checking, "debit", 70000, 0),
			journalLineUpdate(draftLines[1], env.revenue, "credit", 70000, 1),
			cliOp("PATCH", entries, "clientry0000001", `{"memo":"More","revision":2}`))},
		showDoc(token, entries, "clientry0000001", []string{`"revision":2`, `"total":70000`, `"memo":"More"`},
			lines, "entry", []string{`"totalItems":2`, `"debit":70000`, `"memo":""`}),
		// Another caller saved first: the same revision again is refused, and
		// nothing of the batch is stored.
		[]apiReq{refusedBatch(token, []string{`"requests":{"0":`, `"status":409`, `changed after you opened it`},
			cliOp("PATCH", entries, "clientry0000001", `{"memo":"Late","revision":2}`))},
		// edit that clears a field: memo null, in a batch with the next revision.
		[]apiReq{docBatch(token, cliOp("PATCH", entries, "clientry0000001", `{"memo":null,"revision":3}`))},
		showDoc(token, entries, "clientry0000001", []string{`"revision":3`, `"memo":""`, `"total":70000`},
			lines, "entry", []string{`"totalItems":2`}),
		// post
		[]apiReq{{method: "PATCH", url: recordURL(entries, "clientry0000001"), token: token, want: 200,
			body: `{"revision":4,"status":"posted"}`, content: []string{`"status":"posted"`, `"number":"2"`}}},
		// edit of a posted entry: a new draft that names it, posted in the same
		// batch. Books voids the original. Like the correction of
		// cli/document_edit_test.go, it sends every writable field, also an empty
		// one.
		[]apiReq{docBatch(token,
			cliOp("POST", entries, "", `{"auto_reverse_on":"","date":"2026-07-10","doc_type":"journal","id":"clientry0000003","memo":"Corrected","origin":"manual","replaces":"clientry0000001","status":"draft"}`),
			rowOp("books_journal_lines", "entry", "clientry0000003", 0, fmt.Sprintf(`"account":%q,"credit":0,"customer":"","debit":80000,"memo":"","vendor":""`, env.checking.Id)),
			rowOp("books_journal_lines", "entry", "clientry0000003", 1, fmt.Sprintf(`"account":%q,"credit":80000,"customer":"","debit":0,"memo":"","vendor":""`, env.revenue.Id)),
			cliOp("PATCH", entries, "clientry0000003", `{"revision":1,"status":"posted"}`))},
		showDoc(token, entries, "clientry0000003", []string{`"status":"posted"`, `"replaces":"clientry0000001"`, `"total":80000`},
			lines, "entry", []string{`"totalItems":2`}),
		[]apiReq{
			{method: "GET", url: recordURL(entries, "clientry0000001"), token: token, want: 200, content: []string{`"status":"void"`}},
			// void
			{method: "PATCH", url: recordURL(entries, "clientry0000003"), token: token, want: 200,
				body: `{"status":"void"}`, content: []string{`"status":"void"`}},
			// delete: a posted or void entry answers 404, which is why the command
			// reads the status first.
			{method: "DELETE", url: recordURL(entries, "clientry0000002"), token: token, want: 404},
			docBatch(token, header("clientry0000004", ""),
				journalLine("clientry0000004", env.checking, "debit", 100, 0),
				journalLine("clientry0000004", env.revenue, "credit", 100, 1)),
			{method: "DELETE", url: recordURL(entries, "clientry0000004"), token: token, want: 204},
			{method: "GET", url: rowsURL(lines, "entry", "clientry0000004"), token: token, want: 200, content: []string{`"totalItems":0`}},
		},
	)...)
	requireNoDrift(t, env.app)
}

// The shapes batchFailure of cli/batch.go reads: the refusal of one write is
// under data.requests.<index>.response, with the status and the fields of
// that write. cli/batch_test.go uses these bodies.
func TestCLIDocuments_BatchRefusalShapes(t *testing.T) {
	env, token := cliLedgerEnv(t)
	reader := tokenFor(t, env.users.readOnly)
	const entries, lines = "books_journal_entries", "books_journal_lines"
	header := cliOp("POST", entries, "", `{"date":"2026-07-15","doc_type":"journal","id":"clientry0000009","origin":"manual","status":"draft"}`)
	apiSeq(t, env.app,
		// A guard refuses the post: a sentence, no field, and the index of the write.
		refusedBatch(token, []string{`"message":"Batch transaction failed."`, `"requests":{"3":{"code":"batch_request_failed"`, `"response":{"data":{},"message":"`, `"status":400}`},
			header,
			journalLine("clientry0000009", env.checking, "debit", 500, 0),
			journalLine("clientry0000009", env.revenue, "credit", 400, 1),
			cliOp("PATCH", entries, "clientry0000009", `{"revision":1,"status":"posted"}`)),
		// The schema refuses a line: the field is named under the write's data.
		refusedBatch(token, []string{`"requests":{"1":`, `"account":{"code":"validation_required","message":"Cannot be blank."}`},
			header,
			cliOp("POST", lines, "", `{"debit":500,"entry":"clientry0000009","position":0}`)),
		// Nothing of a refused batch is stored.
		apiReq{method: "GET", url: recordURL(entries, "clientry0000009"), token: token, want: 404},
		// A caller with read access only: the create rule refuses the first write.
		refusedBatch(reader, []string{`"requests":{"0":`, `"message":"Failed to create record."`}, header),
	)
}

// A resend of a batch the server stored, with the same ids: the create of the
// header is refused, and nothing of the resend is stored. cli/retry.go reads
// this answer as "the first send was stored"; cli/retry_test.go uses its body.
func TestCLIDocuments_ResendOfAStoredBatch(t *testing.T) {
	env, token := cliLedgerEnv(t)
	const entries, lines = "books_journal_entries", "books_journal_lines"
	ops := []string{
		cliOp("POST", entries, "", `{"date":"2026-07-15","doc_type":"journal","id":"clientry0000010","origin":"manual","status":"draft"}`),
		journalLine("clientry0000010", env.checking, "debit", 500, 0),
		journalLine("clientry0000010", env.revenue, "credit", 500, 1),
		cliOp("PATCH", entries, "clientry0000010", `{"revision":1,"status":"posted"}`),
	}
	draft := cliOp("POST", entries, "", `{"date":"2026-07-15","doc_type":"journal","id":"clientry0000011","origin":"manual","status":"draft"}`)
	edit := []string{
		editRowOp(lines, "entry", "clientry0000011", "cliline00000011", 2, fmt.Sprintf(`"account":%q,"debit":100`, env.checking.Id)),
		editRowOp(lines, "entry", "clientry0000011", "cliline00000012", 3, fmt.Sprintf(`"account":%q,"credit":100`, env.revenue.Id)),
		cliOp("PATCH", entries, "clientry0000011", `{"revision":2}`),
	}
	apiSeq(t, env.app,
		docBatch(token, ops...),
		refusedBatch(token, []string{`"requests":{"0":`, `"id":{"code":"validation_not_unique"`, `"status":400`}, ops...),
		// A create of its own (`apply`) with a stored id: the same refusal.
		apiReq{method: "POST", url: "/api/collections/" + entries + "/records", token: token, want: 400,
			body:    `{"date":"2026-07-15","doc_type":"journal","id":"clientry0000010","origin":"manual","status":"draft"}`,
			content: []string{`"id":{"code":"validation_not_unique"`}},
		// A draft edit that creates rows with the CLI's ids, sent twice: the
		// resend is refused, and the rows are stored once.
		docBatch(token, draft,
			journalLine("clientry0000011", env.checking, "debit", 500, 0),
			journalLine("clientry0000011", env.revenue, "credit", 500, 1)),
		docBatch(token, edit...),
		refusedBatch(token, []string{`"requests":{"0":`, `"id":{"code":"validation_not_unique"`}, edit...),
		apiReq{method: "GET", url: rowsURL(lines, "entry", "clientry0000011"), token: token, want: 200, content: []string{`"totalItems":4`}},
		apiReq{method: "GET", url: rowsURL(lines, "entry", "clientry0000010"), token: token, want: 200, content: []string{`"totalItems":2`}},
	)
	if got := revisionOf(t, env.app, "clientry0000011"); got != 2 {
		t.Errorf("the draft's revision = %d, want 2", got)
	}
}
