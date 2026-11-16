package books

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"os"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"

	"tinycld.org/core/offboard"
	"tinycld.org/core/reports"
)

// auditToday is the reader's day in every run: the default Date changed, This
// month, is then November 2026.
const auditToday = "2026-11-14"

// auditAllDates is the Date changed param that keeps every row, for a test
// whose rows are not all dated in November.
var auditAllDates = map[string]any{"preset": "allDates"}

// auditRowInput is one audit_logs row as core's audit hooks write it
// (core/server/audit/audit.go newAuditRecord, ComputeDiff, BuildSnapshot):
// action is created, updated or deleted; actor is a user id, or "" for the
// system; changes is ComputeDiff's {field: {before, after}}; snapshot is a
// deleted record's last values.
type auditRowInput struct {
	action       string
	resourceType string
	resourceID   string
	label        string
	actor        string
	changes      map[string]any
	snapshot     map[string]any
	created      time.Time
}

// mkAuditRow saves an audit_logs row the way core's hooks write it (P1). A
// row with no actor is a system row, which core marks in its metadata. A
// non-zero created is set as the row's instant.
func mkAuditRow(t testing.TB, app core.App, in auditRowInput) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("audit_logs")
	if err != nil {
		t.Fatalf("find audit_logs: %v", err)
	}
	r := core.NewRecord(col)
	r.Set("action", in.action)
	r.Set("resource_type", in.resourceType)
	r.Set("resource_id", in.resourceID)
	r.Set("resource_label", in.label)
	if in.actor != "" {
		r.Set("actor", in.actor)
	} else {
		r.Set("metadata", map[string]any{"source": "system"})
	}
	if in.changes != nil {
		r.Set("changes", in.changes)
	}
	if in.snapshot != nil {
		r.Set("snapshot", in.snapshot)
	}
	if !in.created.IsZero() {
		dt, err := types.ParseDateTime(in.created)
		if err != nil {
			t.Fatalf("created %v: %v", in.created, err)
		}
		r.SetRaw("created", dt)
	}
	if err := app.Save(r); err != nil {
		t.Fatalf("save an audit row of %s %s: %v", in.resourceType, in.resourceID, err)
	}
	return r
}

// runAuditErr loads the shipped Audit Log and runs it as reader, as core's
// run endpoint does: Load, then Run with the posted params.
func runAuditErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(auditLogShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("param %s: %v", id, err)
		}
		given[id] = raw
	}
	return reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
	})
}

func runAudit(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runAuditErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// auditBook is a ledger app with Books' report sources, one user per Books
// level and a named person who makes the changes.
type auditBook struct {
	*ledgerEnv
	actor *core.Record
}

func newAuditBook(t *testing.T) auditBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	return auditBook{ledgerEnv: env, actor: namedUser(t, env.app, "member", "Avery Lin")}
}

// run is the Audit Log as the Books admin on auditToday.
func (b auditBook) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runAudit(t, b.app, b.users.admin, params, reports.Options{Today: auditToday})
}

func namedUser(t testing.TB, app core.App, role, name string) *core.Record {
	t.Helper()
	u := mkUser(t, app, role)
	u.Set("name", name)
	if err := app.Save(u); err != nil {
		t.Fatalf("name user %s: %v", name, err)
	}
	return u
}

// auditAt is a November 2026 instant (UTC), minute m after noon.
func auditAt(m int) time.Time {
	return time.Date(2026, time.November, 10, 12, m, 0, 0, time.UTC)
}

func auditDetails(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			out = append(out, r)
		}
	}
	return out
}

func cellText(r reports.Row, key string) string {
	v := r.Cells[key]
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

// auditRecords are the detail rows' Record cells, in result order.
func auditRecords(res *reports.Result) []string {
	var out []string
	for _, r := range auditDetails(res) {
		out = append(out, cellText(r, "record"))
	}
	return out
}

// auditLines are the detail rows as "record | event | user | type".
func auditLines(res *reports.Result) []string {
	var out []string
	for _, r := range auditDetails(res) {
		out = append(out, fmt.Sprintf("%s | %s | %s | %s",
			cellText(r, "record"), cellText(r, "event"), cellText(r, "user"), cellText(r, "type")))
	}
	return out
}

func auditSource(t *testing.T, app core.App) reports.Source {
	t.Helper()
	for _, s := range reports.Sources(app) {
		if s.Key == auditLogKey {
			return s
		}
	}
	t.Fatalf("source %s is not registered and accepted", auditLogKey)
	return reports.Source{}
}

func requireSameJSON(t *testing.T, what string, got, want any) {
	t.Helper()
	g, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	w, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, g, string(w)) {
		t.Errorf("%s =\n%s\nwant\n%s", what, g, w)
	}
}

func TestAuditLogSpecLoads(t *testing.T) {
	b := newAuditBook(t)
	if err := setFields(t, b.app, "books_settings", settingsID, map[string]any{"business_name": "Harbor Lane Design LLC"}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	if err := reports.CheckSources(b.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	if reason, bad := reports.Refused(b.app)[auditLogKey]; bad {
		t.Fatalf("source %s refused: %s", auditLogKey, reason)
	}
	src := auditSource(t, b.app)
	info := readerInfo(b.users.readOnly)
	if src.Heading == nil || src.Heading(b.app, info) != "Harbor Lane Design LLC" || src.Heading(b.app, info) != booksHeading(b.app, info) {
		t.Errorf("the source's Heading is not booksHeading (the header's business name)")
	}

	shipped := auditLogShipped()
	if auditLogKey != "books.audit_log" || shipped.Key != auditLogKey {
		t.Errorf("key = %q (const %q), want books.audit_log", shipped.Key, auditLogKey)
	}
	if shipped.Title != "Audit Log" {
		t.Errorf("title = %q, want Audit Log", shipped.Title)
	}
	if shipped.Description != "Every change people made to Books records: when, who and what." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(auditLogSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not auditLogSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != auditLogKey {
		t.Errorf("source = %q, want books.audit_log", spec.Source)
	}
	if err := reports.Validate(b.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	paramIDs := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		paramIDs[i] = p.ID
	}
	if !reflect.DeepEqual(paramIDs, []string{"period", "users", "events", "types"}) {
		t.Fatalf("params = %v, want period, users, events, types (the chips' order)", paramIDs)
	}
	period := paramOf(t, spec, "period")
	if period.Type != reports.ParamDateRange || period.Label != "Date changed" || !jsonEqual(t, period.Default, `{"preset":"thisMonth"}`) {
		t.Errorf("period = %+v (default %s), want a date range labelled Date changed, default This month", period, period.Default)
	}
	users := paramOf(t, spec, "users")
	if users.Type != reports.ParamChoice || users.Label != "User" || !users.Multiple {
		t.Errorf("users = %+v, want a multiple choice labelled User", users)
	}
	of := users.OptionsFrom
	if of == nil || of.Source != auditLogKey ||
		!reflect.DeepEqual(of.Value, reports.Path{{Field: "actor"}}) || !reflect.DeepEqual(of.Label, reports.Path{{Field: "actor_name"}}) {
		t.Errorf("users optionsFrom = %+v, want source books.audit_log, value [actor], label [actor_name]", of)
	}
	golden := readAuditGolden(t)
	events := paramOf(t, spec, "events")
	if events.Type != reports.ParamChoice || events.Label != "Event" || !events.Multiple ||
		!reflect.DeepEqual(events.Options, golden.EventOptions) {
		t.Errorf("events = %+v, want a multiple choice labelled Event with options %v", events, golden.EventOptions)
	}
	recordTypes := paramOf(t, spec, "types")
	if recordTypes.Type != reports.ParamChoice || recordTypes.Label != "Record type" || !recordTypes.Multiple ||
		len(recordTypes.Options) == 0 || !reflect.DeepEqual(recordTypes.Options, auditRecordTypeOptions()) {
		t.Errorf("types = %+v, want a multiple choice labelled Record type with options auditRecordTypeOptions()", recordTypes)
	}
	requireSameJSON(t, "the spec's params", spec.Params, auditLogParams())

	type colShape struct{ ID, Label, Field string }
	gotCols := make([]colShape, len(spec.Columns))
	for i, c := range spec.Columns {
		field := ""
		if c.Formula != nil && len(c.Formula.Path) == 1 && c.Formula.Op == "" {
			field = c.Formula.Path[0].Field
		}
		gotCols[i] = colShape{c.ID, c.Label, field}
	}
	wantCols := []colShape{
		{"created", "Date changed", "created"},
		{"user", "User", "actor_name"},
		{"event", "Event", "event"},
		{"type", "Record type", "record_type"},
		{"record", "Record", "record_label"},
	}
	if !reflect.DeepEqual(gotCols, wantCols) {
		t.Errorf("columns (id, label, field) =\n%+v\nwant\n%+v", gotCols, wantCols)
	}
	requireSameJSON(t, "the spec's columns", spec.Columns, auditLogColumns())

	requireSameJSON(t, "sort", spec.Sort, []reports.SortKey{
		{Formula: fld("created"), Dir: "desc"},
		{Formula: fld("id"), Dir: "desc"},
	})
	if spec.Detail == nil {
		t.Fatal("the spec has no detail: a row is labelled by its Date changed")
	}
	requireSameJSON(t, "detail.label", spec.Detail.Label, fld("created"))
	requireSameJSON(t, "the spec's display", spec.Display, auditLogDisplay())

	// P12, P4: the Go copy and the fixture's copy (tests/audit-log-fixture.test.ts)
	// meet in one golden file.
	whole, err := os.ReadFile("testdata/audit_log_spec.json")
	if err != nil {
		t.Fatal(err)
	}
	gotGolden, err := json.Marshal(map[string]any{
		"title":             shipped.Title,
		"description":       shipped.Description,
		"eventOptions":      events.Options,
		"recordTypeOptions": auditRecordTypeOptions(),
		"display":           auditLogDisplay(),
		"spec":              json.RawMessage(shipped.Spec),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, gotGolden, string(whole)) {
		t.Errorf("the shipped spec, event options, record type options and display =\n%s\nwant testdata/audit_log_spec.json", gotGolden)
	}
}

// The phone row's line 2 holds User, Record type and Record. Core holds a wrapping
// column at least its longest word unless it may break one (core
// display.columns.<col>.overflowWrap), so a Record with one long name in any row
// would move every row to core's three-line layout. Record breaks such a word.
func TestAuditLogRecordBreaksLongWords(t *testing.T) {
	record, ok := auditLogDisplay().Columns["record"]
	if !ok {
		t.Fatal("the display has no fit for the record column")
	}
	if record.WhiteSpace != "normal" || record.OverflowWrap != "anywhere" {
		t.Errorf("record fit whiteSpace, overflowWrap = %q, %q; want \"normal\", \"anywhere\"",
			record.WhiteSpace, record.OverflowWrap)
	}
}

func TestAuditLogEvents(t *testing.T) {
	b := newAuditBook(t)
	app := b.app
	actor := b.actor.Id

	// A product added, renamed and deleted.
	lamp := mkService(t, app, "Desk lamp", b.revenue)
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_products", resourceID: lamp.Id, label: "Desk lamp", actor: actor, created: auditAt(1)})
	if err := setFields(t, app, "books_products", lamp.Id, map[string]any{"name": "Reading lamp"}); err != nil {
		t.Fatalf("rename the product: %v", err)
	}
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_products", resourceID: lamp.Id, label: "Reading lamp", actor: actor, created: auditAt(2),
		changes: map[string]any{"name": map[string]any{"before": "Desk lamp", "after": "Reading lamp"}}})
	snapshot := map[string]any{"name": "Reading lamp", "type": "service", "income_account": b.revenue.Id}
	if err := app.Delete(reload(t, app, "books_products", lamp.Id)); err != nil {
		t.Fatalf("delete the product: %v", err)
	}
	mkAuditRow(t, app, auditRowInput{action: "deleted", resourceType: "books_products", resourceID: lamp.Id, label: "Reading lamp", actor: actor, created: auditAt(3), snapshot: snapshot})

	// A draft's own fields changed, then the entry posted and voided.
	entry := b.sale(t, "2026-11-10", 5000)
	if err := setFields(t, app, "books_journal_entries", entry.Id, map[string]any{"memo": "Desk lamps"}); err != nil {
		t.Fatalf("change the draft's memo: %v", err)
	}
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_journal_entries", resourceID: entry.Id, label: "Draft memo change", actor: actor, created: auditAt(4),
		changes: map[string]any{"memo": map[string]any{"before": "", "after": "Desk lamps"}}})
	posted := mustPost(t, app, entry.Id, actor)
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_journal_entries", resourceID: entry.Id, label: "Entry posted", actor: actor, created: auditAt(5),
		changes: map[string]any{
			"status": map[string]any{"before": "draft", "after": "posted"},
			"number": map[string]any{"before": "", "after": posted.GetString("number")},
		}})
	if err := setStatus(app, entry.Id, statusVoid, actor); err != nil {
		t.Fatalf("void the entry: %v", err)
	}
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_journal_entries", resourceID: entry.Id, label: "Entry voided", actor: actor, created: auditAt(6),
		changes: map[string]any{"status": map[string]any{"before": "posted", "after": "void"}}})

	// The auto-reversal sweep's own row: no actor.
	original := mustPost(t, app, b.sale(t, "2026-11-11", 700).Id, actor)
	reversal := mustPost(t, app, b.sale(t, "2026-11-12", 700).Id, actor)
	if err := logAutoReversal(app, original, reversal.Id); err != nil {
		t.Fatalf("logAutoReversal: %v", err)
	}
	reversalLabel := entryLabel(reload(t, app, "books_journal_entries", reversal.Id))

	// An offboarded person, and a person whose user row is gone.
	gone := namedUser(t, app, "member", "Jordan Leaver")
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_products", resourceID: lamp.Id, label: "Change by a leaver", actor: gone.Id, created: auditAt(7),
		changes: map[string]any{"name": map[string]any{"before": "a", "after": "b"}}})
	offboard.ResetHandlersForTesting()
	t.Cleanup(offboard.ResetHandlersForTesting)
	owner := mkUser(t, app, "owner")
	if _, err := offboard.OffboardUser(app, gone.Id, offboard.Plan{Mode: offboard.ModeKeep}, owner.Id); err != nil {
		t.Fatalf("offboard %s: %v", gone.GetString("name"), err)
	}
	ghost := namedUser(t, app, "member", "Casey Ghost")
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_products", resourceID: lamp.Id, label: "Change by a removed user", actor: ghost.Id, created: auditAt(8),
		changes: map[string]any{"name": map[string]any{"before": "b", "after": "c"}}})
	// The users row goes while its audit row keeps the id, as a row written
	// before the user was removed does.
	if _, err := app.DB().NewQuery("DELETE FROM users WHERE id = {:id}").Bind(dbx.Params{"id": ghost.Id}).Execute(); err != nil {
		t.Fatalf("remove the user row: %v", err)
	}

	// A core event on a record that is not Books'.
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "users", resourceID: actor, label: "Avery Lin signed in", actor: actor, created: auditAt(9),
		changes: map[string]any{"lastLogin": map[string]any{"before": "", "after": "2026-11-10"}}})

	res := runAudit(t, app, b.users.admin, map[string]any{"period": auditAllDates}, reports.Options{Today: auditToday})
	got := auditLines(res)
	for _, want := range []string{
		"Desk lamp | added | Avery Lin | books_products",
		"Reading lamp | changed | Avery Lin | books_products",
		"Reading lamp | deleted | Avery Lin | books_products",
		"Draft memo change | changed | Avery Lin | books_journal_entries",
		"Entry posted | posted | Avery Lin | books_journal_entries",
		"Entry voided | voided | Avery Lin | books_journal_entries",
		reversalLabel + " | added | System | books_journal_entries",
		"Change by a leaver | changed | Deleted user | books_products",
		"Change by a removed user | changed | Unknown user | books_products",
	} {
		if !slices.Contains(got, want) {
			t.Errorf("no row %q (record | event | user | type); rows:\n%q", want, got)
		}
	}
	if slices.Contains(auditRecords(res), "Avery Lin signed in") {
		t.Errorf("a users row (a core event, not a Books record) is listed; rows:\n%q", got)
	}
	if len(got) != 9 {
		t.Errorf("%d rows, want the 9 Books rows; rows:\n%q", len(got), got)
	}
}

// auditParentOf is the collection that holds each line collection's document.
var auditParentOf = map[string]string{
	"books_journal_lines":       "books_journal_entries",
	"books_invoice_lines":       "books_invoices",
	"books_sales_receipt_lines": "books_sales_receipts",
	"books_estimate_lines":      "books_estimates",
	"books_bill_lines":          "books_bills",
	"books_expense_lines":       "books_expenses",
	"books_bundle_items":        "books_products",
	"books_estimate_responses":  "books_estimates",
}

// lineFixture makes a new document of a line collection and one row under it,
// on an app with no hooks bound.
func lineFixture(t *testing.T, app core.App, lines string) (parent, line *core.Record) {
	t.Helper()
	n := userSeq.Add(1)
	// No guard is bound to set the name key, which is unique.
	customer := saveRecord(t, app, "books_customers", map[string]any{
		"display_name": fmt.Sprintf("Harborview Dental %d", n), "name_key": fmt.Sprintf("harborview dental %d", n),
	})
	account := mkAccount(t, app, fmt.Sprintf("Checking %d", n), "bank", "checking")
	switch lines {
	case "books_journal_lines":
		parent = mkDraft(t, app, "2026-11-10")
		line = saveRecord(t, app, lines, map[string]any{"entry": parent.Id, "account": account.Id, "debit": 100, "position": 0, "currency": "USD"})
	case "books_invoice_lines":
		parent = saveRecord(t, app, "books_invoices", map[string]any{"customer": customer.Id, "status": "draft", "date": "2026-11-10", "due_date": "2026-12-10"})
		line = saveRecord(t, app, lines, map[string]any{"invoice": parent.Id, "kind": "description", "position": 0})
	case "books_sales_receipt_lines":
		parent = mkReceiptRow(t, app, account, nil)
		line = saveRecord(t, app, lines, map[string]any{"sales_receipt": parent.Id, "kind": "description", "position": 0})
	case "books_estimate_lines":
		parent = mkEstimateRow(t, app, customer, nil)
		line = saveRecord(t, app, lines, map[string]any{"estimate": parent.Id, "kind": "description", "position": 0})
	case "books_bill_lines":
		vendor := saveRecord(t, app, "books_vendors", map[string]any{
			"display_name": fmt.Sprintf("Summit Supply %d", n), "name_key": fmt.Sprintf("summit supply %d", n),
		})
		parent = saveRecord(t, app, "books_bills", map[string]any{"vendor": vendor.Id, "status": "draft", "date": "2026-11-10", "due_date": "2026-12-10"})
		line = saveRecord(t, app, lines, map[string]any{"bill": parent.Id, "kind": "account", "account": account.Id, "position": 0})
	case "books_expense_lines":
		parent = saveRecord(t, app, "books_expenses", map[string]any{"paid_from": account.Id, "payment_method": "cash", "status": "draft", "date": "2026-11-10"})
		line = saveRecord(t, app, lines, map[string]any{"expense": parent.Id, "kind": "account", "account": account.Id, "position": 0})
	case "books_bundle_items":
		parent = saveRecord(t, app, "books_products", map[string]any{
			"type": "bundle", "name": fmt.Sprintf("Starter kit %d", n), "name_key": fmt.Sprintf("starter kit %d", n), "currency": "USD",
		})
		product := saveRecord(t, app, "books_products", map[string]any{
			"type": "service", "name": fmt.Sprintf("Cable %d", n), "name_key": fmt.Sprintf("cable %d", n), "currency": "USD",
		})
		line = saveRecord(t, app, lines, map[string]any{"bundle": parent.Id, "product": product.Id, "quantity": 1, "position": 0})
	case "books_estimate_responses":
		parent = mkEstimateRow(t, app, customer, nil)
		line = saveRecord(t, app, lines, map[string]any{"estimate": parent.Id, "decision": "accepted"})
	default:
		t.Fatalf("no fixture for %s", lines)
	}
	return parent, line
}

// viewRow reads an audit row through the books_audit_log view.
func viewRow(t *testing.T, app core.App, id string) *core.Record {
	t.Helper()
	r, err := app.FindRecordById(auditLogView, id)
	if err != nil {
		t.Fatalf("read audit row %s through %s: %v", id, auditLogView, err)
	}
	return r
}

func requireParents(t *testing.T, row *core.Record, parentType, parentID, historyType, historyID string) {
	t.Helper()
	got := [4]string{row.GetString("parent_type"), row.GetString("parent_id"), row.GetString("history_type"), row.GetString("history_id")}
	want := [4]string{parentType, parentID, historyType, historyID}
	if got != want {
		t.Errorf("%s %s: parent_type, parent_id, history_type, history_id = %q, want %q",
			row.GetString("record_type"), row.GetString("record_id"), got, want)
	}
}

// A line's row names its document, from the live line or, once the line is
// deleted, from its delete snapshot; the row opens the document's history.
func TestAuditLogParents(t *testing.T) {
	app := newBooksApp(t)
	for _, lines := range slices.Sorted(maps.Keys(auditParentOf)) {
		t.Run(lines, func(t *testing.T) {
			field := wantAuditParentFields[lines]
			parentType := auditParentOf[lines]

			parent, line := lineFixture(t, app, lines)
			live := mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: lines, resourceID: line.Id, label: "a live line", created: auditAt(1),
				changes: map[string]any{"position": map[string]any{"before": 1, "after": 0}}})
			requireParents(t, viewRow(t, app, live.Id), parentType, parent.Id, parentType, parent.Id)

			goneParent, goneLine := lineFixture(t, app, lines)
			snapshot := map[string]any{field: goneParent.Id}
			if err := app.Delete(goneLine); err != nil {
				t.Fatalf("delete the line: %v", err)
			}
			deleted := mkAuditRow(t, app, auditRowInput{action: "deleted", resourceType: lines, resourceID: goneLine.Id, label: "a deleted line", created: auditAt(2), snapshot: snapshot})
			requireParents(t, viewRow(t, app, deleted.Id), parentType, goneParent.Id, parentType, goneParent.Id)
		})
	}

	product := saveRecord(t, app, "books_products", map[string]any{"type": "service", "name": "Desk lamp", "name_key": "desk lamp", "currency": "USD"})
	own := mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_products", resourceID: product.Id, label: "Desk lamp", created: auditAt(3)})
	requireParents(t, viewRow(t, app, own.Id), "", "", "books_products", product.Id)
}

func TestAuditLogOrderAndParams(t *testing.T) {
	b := newAuditBook(t)
	app := b.app
	actor := b.actor.Id
	other := namedUser(t, app, "member", "Blake Other")
	lamp := mkService(t, app, "Desk lamp", b.revenue)
	entry := b.sale(t, "2026-11-10", 5000)
	customer := saveRecord(t, app, "books_customers", map[string]any{"display_name": "Harborview Dental"})
	invoice := saveRecord(t, app, "books_invoices", map[string]any{"customer": customer.Id, "status": "draft", "date": "2026-11-10", "due_date": "2026-12-10"})
	line := saveRecord(t, app, "books_invoice_lines", map[string]any{"invoice": invoice.Id, "kind": "description", "position": 0})

	row := func(m int, action, collection, id, label, by string, changes map[string]any) *core.Record {
		t.Helper()
		return mkAuditRow(t, app, auditRowInput{action: action, resourceType: collection, resourceID: id, label: label, actor: by, created: auditAt(m), changes: changes})
	}
	row(1, "created", "books_products", lamp.Id, "Lamp added", actor, nil)
	row(2, "updated", "books_products", lamp.Id, "Lamp renamed", actor, map[string]any{"name": map[string]any{"before": "a", "after": "b"}})
	row(3, "updated", "books_journal_entries", entry.Id, "Entry posted", other.Id, map[string]any{"status": map[string]any{"before": "draft", "after": "posted"}})
	row(4, "updated", "books_journal_entries", entry.Id, "Entry voided", other.Id, map[string]any{"status": map[string]any{"before": "posted", "after": "void"}})
	row(5, "created", "books_journal_entries", entry.Id, "System entry", "", nil)
	row(6, "created", "books_invoice_lines", line.Id, "Draft invoice: line 1", actor, nil)
	tieA := row(7, "updated", "books_products", lamp.Id, "Tie one", actor, map[string]any{"name": map[string]any{"before": "b", "after": "c"}})
	tieB := row(7, "updated", "books_products", lamp.Id, "Tie two", actor, map[string]any{"name": map[string]any{"before": "c", "after": "d"}})
	ties := []string{"Tie one", "Tie two"}
	if tieB.Id > tieA.Id {
		ties = []string{"Tie two", "Tie one"}
	}

	// Newest first; a tie by id, descending. Unset params keep every row.
	want := append(ties, "Draft invoice: line 1", "System entry", "Entry voided", "Entry posted", "Lamp renamed", "Lamp added")
	if got := auditRecords(b.run(t, nil)); !reflect.DeepEqual(got, want) {
		t.Errorf("rows = %q, want newest first, ties by id desc: %q", got, want)
	}

	mine := b.run(t, map[string]any{"users": []string{actor}})
	if got, want := auditRecords(mine), append(ties, "Draft invoice: line 1", "Lamp renamed", "Lamp added"); !reflect.DeepEqual(got, want) {
		t.Errorf("User = Avery Lin: rows %q, want %q", got, want)
	}
	for _, r := range auditDetails(mine) {
		if cellText(r, "user") != "Avery Lin" {
			t.Errorf("User = Avery Lin keeps a row by %q", cellText(r, "user"))
		}
	}
	if got := auditLines(b.run(t, map[string]any{"users": []string{"system"}})); !reflect.DeepEqual(got, []string{"System entry | added | System | books_journal_entries"}) {
		t.Errorf("User = System: rows %q, want the system row only", got)
	}
	if got := auditRecords(b.run(t, map[string]any{"events": []string{"posted", "voided"}})); !reflect.DeepEqual(got, []string{"Entry voided", "Entry posted"}) {
		t.Errorf("Event = Posted, Voided: rows %q, want Entry voided, Entry posted", got)
	}
	if got := auditLines(b.run(t, map[string]any{"types": []string{"books_invoice_lines"}})); !reflect.DeepEqual(got, []string{"Draft invoice: line 1 | added | Avery Lin | books_invoice_lines"}) {
		t.Errorf("Record type = Invoice line: rows %q, want the line row only", got)
	}

	spec, _, err := reports.Load(auditLogShipped().Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	options, err := reports.ReadParamOptions(context.Background(), app, reports.OptionsRequest{
		Spec: spec, Param: "users", Auth: b.users.admin, Today: auditToday,
	})
	if err != nil {
		t.Fatalf("the users param's options: %v", err)
	}
	type opt struct{ Value, Label string }
	var gotOptions []opt
	for _, o := range options.Options {
		gotOptions = append(gotOptions, opt{o.Value, o.Label})
	}
	wantOptions := []opt{{actor, "Avery Lin"}, {other.Id, "Blake Other"}, {"system", "System"}}
	if !reflect.DeepEqual(gotOptions, wantOptions) {
		t.Errorf("User picker options = %+v, want each actor once, System included, by name A–Z: %+v", gotOptions, wantOptions)
	}
}

// Core T2 through the Books source: Today holds the changes made since the
// reader's local midnight; with no zone the UTC day applies.
func TestAuditLogPeriodInReaderZone(t *testing.T) {
	b := newAuditBook(t)
	app := b.app
	lamp := mkService(t, app, "Desk lamp", b.revenue)
	add := func(when time.Time, label string) {
		t.Helper()
		mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_products", resourceID: lamp.Id, label: label, actor: b.actor.Id, created: when,
			changes: map[string]any{"name": map[string]any{"before": "a", "after": label}}})
	}
	// Chicago is UTC-6 on 2026-11-14: its day runs 06:00Z to 06:00Z the next day.
	add(time.Date(2026, time.November, 14, 5, 59, 0, 0, time.UTC), "Before local midnight")
	add(time.Date(2026, time.November, 14, 6, 0, 0, 0, time.UTC), "At local midnight")
	add(time.Date(2026, time.November, 15, 5, 0, 0, 0, time.UTC), "Late local evening")

	today := map[string]any{"period": map[string]any{"preset": "today"}}
	local := runAudit(t, app, b.users.admin, today, reports.Options{Today: auditToday, TimeZone: "America/Chicago"})
	if got, want := auditRecords(local), []string{"Late local evening", "At local midnight"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Today in America/Chicago: rows %q, want %q", got, want)
	}
	utc := runAudit(t, app, b.users.admin, today, reports.Options{Today: auditToday})
	if got, want := auditRecords(utc), []string{"At local midnight", "Before local midnight"}; !reflect.DeepEqual(got, want) {
		t.Errorf("Today with no zone (UTC): rows %q, want %q", got, want)
	}
}

// Every Books reader reads the same rows (Q2); a user with Books level none
// runs the report and reads none.
func TestAuditLogReaders(t *testing.T) {
	b := newAuditBook(t)
	app := b.app
	lamp := mkService(t, app, "Desk lamp", b.revenue)
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_products", resourceID: lamp.Id, label: "Desk lamp", actor: b.actor.Id, created: auditAt(1)})
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_journal_entries", resourceID: b.sale(t, "2026-11-10", 100).Id, label: "Draft entry", created: auditAt(2)})

	opts := reports.Options{Today: auditToday}
	admin := auditLines(runAudit(t, app, b.users.admin, nil, opts))
	if len(admin) != 2 {
		t.Fatalf("the Books admin reads %q, want the 2 rows", admin)
	}
	for who, reader := range map[string]*core.Record{"a bookkeeper": b.users.bookkeeper, "a read-only user": b.users.readOnly} {
		if got := auditLines(runAudit(t, app, reader, nil, opts)); !reflect.DeepEqual(got, admin) {
			t.Errorf("%s reads %q, want the Books admin's rows %q", who, got, admin)
		}
	}
	res, err := runAuditErr(t, app, b.users.none, nil, opts)
	if err != nil {
		t.Fatalf("the run of a user with Books level none was refused (%v); core runs it with the rule's rows", err)
	}
	if got := auditLines(res); len(got) != 0 {
		t.Errorf("a user with Books level none reads %q, want no row", got)
	}
}

// The report pages by core's limit, so a long history never loads whole.
func TestAuditLogPaging(t *testing.T) {
	b := newAuditBook(t)
	app := b.app
	lamp := mkService(t, app, "Desk lamp", b.revenue)
	base := time.Date(2026, time.November, 10, 0, 0, 0, 0, time.UTC)
	for i := range 201 {
		mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_products", resourceID: lamp.Id,
			label: fmt.Sprintf("Change %03d", i), actor: b.actor.Id, created: base.Add(time.Duration(i) * time.Second),
			changes: map[string]any{"name": map[string]any{"before": "a", "after": "b"}}})
	}
	first := runAudit(t, app, b.users.admin, nil, reports.Options{Today: auditToday, Limit: 200})
	got := auditRecords(first)
	if len(got) != 200 || got[0] != "Change 200" || got[199] != "Change 001" {
		t.Fatalf("first page: %d rows from %q to %q, want 200 rows from Change 200 to Change 001", len(got), firstOf(got), lastOf(got))
	}
	if first.Page == nil || first.Page.Next == "" {
		t.Fatalf("first page = %+v, want a page.next", first.Page)
	}
	second := runAudit(t, app, b.users.admin, nil, reports.Options{Today: auditToday, Limit: 200, Cursor: first.Page.Next})
	if got := auditRecords(second); !reflect.DeepEqual(got, []string{"Change 000"}) {
		t.Errorf("second page = %q, want the last row, Change 000", got)
	}
}

func firstOf(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}

func lastOf(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[len(s)-1]
}

// A run subscribes to the topics of the view's base tables (core lists no
// view topic, since SQLite reads the base tables): audit_logs carries every
// new audit row, so a new change re-runs the open report.
func TestAuditLogTopics(t *testing.T) {
	b := newAuditBook(t)
	lamp := mkService(t, b.app, "Desk lamp", b.revenue)
	mkAuditRow(t, b.app, auditRowInput{action: "created", resourceType: "books_products", resourceID: lamp.Id, label: "Desk lamp", actor: b.actor.Id, created: auditAt(1)})
	res := b.run(t, nil)
	if !slices.Contains(res.Topics, "collection/audit_logs") {
		t.Errorf("topics = %v, want collection/audit_logs (a new change re-runs the open report)", res.Topics)
	}
}

// Each row opens its record's history (spec §5 detail.open): a record's own row
// opens its own, a line's row (live or deleted) its document's, a bundle item's
// row its bundle's and an estimate response's row its estimate's.
func TestAuditLogOpenPaths(t *testing.T) {
	// No hooks bound: lineFixture saves its rows bare, as TestAuditLogParents does.
	app := newBooksApp(t)
	registerBooksSources(t)
	users := newLevelUsers(t, app)
	actor := namedUser(t, app, "member", "Avery Lin").Id

	lamp := saveRecord(t, app, "books_products", map[string]any{"type": "service", "name": "Desk lamp", "name_key": "desk lamp", "currency": "USD"})
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_products", resourceID: lamp.Id, label: "Own product row", actor: actor, created: auditAt(1)})

	invoice, invoiceLine := lineFixture(t, app, "books_invoice_lines")
	mkAuditRow(t, app, auditRowInput{action: "updated", resourceType: "books_invoice_lines", resourceID: invoiceLine.Id, label: "Invoice line row", actor: actor, created: auditAt(2),
		changes: map[string]any{"position": map[string]any{"before": 1, "after": 0}}})

	bundle, item := lineFixture(t, app, "books_bundle_items")
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_bundle_items", resourceID: item.Id, label: "Bundle item row", actor: actor, created: auditAt(3)})

	estimate, response := lineFixture(t, app, "books_estimate_responses")
	mkAuditRow(t, app, auditRowInput{action: "created", resourceType: "books_estimate_responses", resourceID: response.Id, label: "Estimate response row", created: auditAt(4)})

	entry, entryLine := lineFixture(t, app, "books_journal_lines")
	if err := app.Delete(entryLine); err != nil {
		t.Fatalf("delete the journal line: %v", err)
	}
	mkAuditRow(t, app, auditRowInput{action: "deleted", resourceType: "books_journal_lines", resourceID: entryLine.Id, label: "Deleted journal line row", actor: actor, created: auditAt(5),
		snapshot: map[string]any{"entry": entry.Id, "account": "", "debit": 100, "position": 0}})

	want := map[string]string{
		"Own product row":          "books/history/books_products/" + lamp.Id,
		"Invoice line row":         "books/history/books_invoices/" + invoice.Id,
		"Bundle item row":          "books/history/books_products/" + bundle.Id,
		"Estimate response row":    "books/history/books_estimates/" + estimate.Id,
		"Deleted journal line row": "books/history/books_journal_entries/" + entry.Id,
	}
	got := map[string]string{}
	res := runAudit(t, app, users.admin, map[string]any{"period": auditAllDates}, reports.Options{Today: auditToday})
	for _, r := range auditDetails(res) {
		label := cellText(r, "record")
		if _, ok := want[label]; ok {
			got[label] = r.Open
		}
	}
	for label, path := range want {
		if _, ok := got[label]; !ok {
			t.Errorf("no row %q in the run", label)
			continue
		}
		if got[label] != path {
			t.Errorf("row %q opens %q, want %q", label, got[label], path)
		}
	}
}

// P1: core's audit hook, bound by Register, writes the row of a real request
// write, and the view lists it as the person's change.
func TestAuditLogHookWritesRow(t *testing.T) {
	app, _ := newRegisteredApp(t)
	bookkeeper := namedUser(t, app, "guest", "Robin Keeper")
	setPkgAccess(t, app, bookkeeper, "full")
	lamp := mkService(t, app, "Desk lamp", mkIncomeAccount(t, app))

	apiReq{
		method: http.MethodPatch,
		url:    "/api/collections/books_products/records/" + lamp.Id,
		token:  tokenFor(t, bookkeeper),
		body:   `{"name":"Reading lamp"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			// Core writes the audit row off the request goroutine.
			var rows []*core.Record
			waitFor(t, func() bool {
				found, err := app.FindRecordsByFilter(auditLogView, "record_id = {:id} && event = 'changed'", "", 0, 0, dbx.Params{"id": lamp.Id})
				rows = found
				return err == nil && len(rows) > 0
			})
			if len(rows) != 1 {
				t.Fatalf("%d changed rows for the product, want 1", len(rows))
			}
			r := rows[0]
			if r.GetString("actor_name") != "Robin Keeper" || r.GetString("actor") != bookkeeper.Id || r.GetString("record_type") != "books_products" {
				t.Errorf("row actor %q (%q), type %q; want Robin Keeper (%s), books_products",
					r.GetString("actor_name"), r.GetString("actor"), r.GetString("record_type"), bookkeeper.Id)
			}
		},
	}.run(t, app)
}
