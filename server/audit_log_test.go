package books

import (
	"encoding/json"
	"maps"
	"os"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
	"tinycld.org/core/reports"
)

// auditLogView is the view of core's audit_logs that Books reads (spec §5).
const auditLogView = "books_audit_log"

// booksReadRule is the READ constant every Books migration declares: a
// signed-in, enabled user whose Books access row grants read.
const booksReadRule = `@request.auth.id != "" && @request.auth.disabled != true && @collection.books_access:me.user ?= @request.auth.id && @collection.books_access:me.can_read ?= true`

// wantAuditParentFields are the twenty-one line collections and the field that
// names each one's document (spec §5: the view reads a live line's parent
// from it). A bill payment line names its bill payment (pay-bills cp 4 D2).
var wantAuditParentFields = map[string]string{
	"books_journal_lines":        "entry",
	"books_invoice_lines":        "invoice",
	"books_sales_receipt_lines":  "sales_receipt",
	"books_estimate_lines":       "estimate",
	"books_bill_lines":           "bill",
	"books_expense_lines":        "expense",
	"books_bundle_items":         "bundle",
	"books_estimate_responses":   "estimate",
	"books_payment_applications": "payment",
	"books_bill_payment_lines":   "payment",
	"books_credit_memo_lines":    "credit_memo",
	// A vendor credit's line and its application each name the credit
	// (vendor credit spec §4).
	"books_vendor_credit_lines":        "vendor_credit",
	"books_vendor_credit_applications": "vendor_credit",
	// A vendor refund's line names its refund (vendor refund spec §3.11).
	"books_vendor_refund_lines": "refund",
	// A refund receipt's line names its refund receipt (refund receipt spec §4.1).
	"books_refund_receipt_lines": "refund_receipt",
	// A credit memo's application names the credit memo (apply credit spec §4.1).
	"books_credit_memo_applications": "credit_memo",
	// A deposit's item and its other funds line each name the deposit (bank
	// deposit spec §4.1).
	"books_deposit_items": "deposit",
	"books_deposit_lines": "deposit",
	// An inventory adjustment's line names its adjustment (ADR 3).
	"books_inventory_adjustment_lines": "adjustment",
	// A document send names the document it sent; its doc_type gives the
	// document's collection (email-share plan decision 2).
	"books_document_sends": "document",
	// A purchase order's line names its order (purchase order spec §3.14: every
	// registry the estimate joined).
	"books_purchase_order_lines": "purchase_order",
}

// auditGolden is server/testdata/audit_log_spec.json, which the vitest
// tests/audit-log-fixture.test.ts compares with the fixture (P12).
type auditGolden struct {
	Title             string           `json:"title"`
	Description       string           `json:"description"`
	EventOptions      []reports.Option `json:"eventOptions"`
	RecordTypeOptions []reports.Option `json:"recordTypeOptions"`
	Display           json.RawMessage  `json:"display"`
	Spec              json.RawMessage  `json:"spec"`
}

func readAuditGolden(t *testing.T) auditGolden {
	t.Helper()
	raw, err := os.ReadFile("testdata/audit_log_spec.json")
	if err != nil {
		t.Fatalf("read testdata/audit_log_spec.json: %v", err)
	}
	var g auditGolden
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatalf("parse testdata/audit_log_spec.json: %v", err)
	}
	return g
}

// Spec §5 "Visibility rule": a reader who can see a record can see its audit
// rows. Every audited collection is readable by every Books reader, so the
// view's rule is Books READ; this fails when either side narrows alone.
func TestAuditLogRuleFollowsAudited(t *testing.T) {
	app := newBooksApp(t)
	names := append(slices.Sorted(maps.Keys(auditedCollections(app))), auditLogView)
	for _, name := range names {
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Errorf("collection %s: %v", name, err)
			continue
		}
		for rule, got := range map[string]*string{"list": col.ListRule, "view": col.ViewRule} {
			if got == nil {
				t.Errorf("%s %s rule = nil (superusers only), want Books READ", name, rule)
				continue
			}
			if *got != booksReadRule {
				t.Errorf("%s %s rule =\n%s\nwant Books READ\n%s", name, rule, *got, booksReadRule)
			}
		}
	}

	view, err := app.FindCollectionByNameOrId(auditLogView)
	if err != nil {
		t.Fatalf("the %s view does not exist: %v", auditLogView, err)
	}
	if view.Type != core.CollectionTypeView {
		t.Errorf("%s is a %s collection, want a view", auditLogView, view.Type)
	}
	for rule, got := range map[string]*string{"create": view.CreateRule, "update": view.UpdateRule, "delete": view.DeleteRule} {
		if got != nil {
			t.Errorf("%s %s rule = %q, want nil (nobody writes the view)", auditLogView, rule, *got)
		}
	}
}

// Each audited collection has one Record type option, and the options are the
// fixture's, in its order (Documents, Lines, Lists, Banking, Settings and
// access), so the next unit that audits a collection labels it.
func TestAuditRecordTypesCoverAudited(t *testing.T) {
	app := newBooksApp(t)
	audited := auditedCollections(app)
	options := auditRecordTypeOptions()
	count := map[string]int{}
	for _, o := range options {
		count[o.Value]++
		if _, ok := audited[o.Value]; !ok {
			t.Errorf("option %q (%s) names a collection that is not audited", o.Value, o.Label)
		}
	}
	for name := range audited {
		if count[name] != 1 {
			t.Errorf("audited collection %s has %d Record type options, want exactly 1", name, count[name])
		}
	}
	if want := readAuditGolden(t).RecordTypeOptions; !reflect.DeepEqual(options, want) {
		t.Errorf("auditRecordTypeOptions() =\n%v\nwant the fixture's AUDIT_RECORD_TYPE_OPTIONS, in order\n%v", options, want)
	}
}

// The view is live through core's change signal: its sources are audit_logs,
// users (the actor's name) and the ten line collections it reads a parent
// from (P10), and CheckViews accepts them on an app wired as production is.
func TestAuditLogViewIsLive(t *testing.T) {
	changesignal.ResetForTesting()
	app, _ := newRegisteredApp(t)

	if !reflect.DeepEqual(auditParentFields, wantAuditParentFields) {
		t.Errorf("auditParentFields = %v, want %v", auditParentFields, wantAuditParentFields)
	}
	// Core stores each view's sources sorted (changesignal.RegisterView).
	want := append([]string{"audit_logs", "users"}, slices.Collect(maps.Keys(wantAuditParentFields))...)
	slices.Sort(want)
	got, ok := changesignal.RegisteredViews()[auditLogView]
	if !ok {
		t.Fatalf("Register did not register the %s view; registered views: %v", auditLogView, changesignal.RegisteredViews())
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("registered sources of %s = %v, want %v", auditLogView, got, want)
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}
}

// The view lists exactly its 14 columns: no IP address, user agent or
// metadata (spec §5). Each computed column is cast to text (B1), because
// PocketBase types an uncast expression as json and core's Select and Text
// refuse a json column; created keeps audit_logs' date-time type.
func TestAuditLogViewColumns(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(auditLogView)
	if err != nil {
		t.Fatalf("the %s view does not exist: %v", auditLogView, err)
	}
	var names []string
	types := map[string]string{}
	for _, f := range col.Fields {
		names = append(names, f.GetName())
		types[f.GetName()] = f.Type()
	}
	want := []string{
		"id", "created", "actor", "actor_name", "event", "event_shown", "record_type", "record_id", "record_label",
		"changes", "snapshot", "parent_type", "parent_id", "history_type", "history_id",
	}
	if !reflect.DeepEqual(slices.Sorted(slices.Values(names)), slices.Sorted(slices.Values(want))) {
		t.Errorf("%s columns = %v, want exactly %v", auditLogView, names, want)
	}
	for _, hidden := range []string{"ip_address", "user_agent", "metadata"} {
		if slices.Contains(names, hidden) {
			t.Errorf("%s lists %s, which the view must leave out", auditLogView, hidden)
		}
	}
	for _, name := range []string{"actor", "actor_name", "event", "event_shown", "parent_type", "parent_id", "history_type", "history_id"} {
		if types[name] != core.FieldTypeText {
			t.Errorf("%s.%s is a %q field, want text (a CAST(… AS TEXT) column, B1)", auditLogView, name, types[name])
		}
	}
	if types["created"] != core.FieldTypeAutodate {
		t.Errorf("%s.created is a %q field, want autodate (audit_logs.created, bare)", auditLogView, types["created"])
	}
}
