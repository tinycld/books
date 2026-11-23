package books

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"reflect"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// registerBooksSources empties core's report registry and registers Books'
// sources as Register does, so each test sees only Books' sources. It also
// registers the shipped Transaction Detail by Account, the target of the
// statements' drills: core binds a drill only to a registered shipped key, so
// a statement spec loads, validates and runs as it does in production.
func registerBooksSources(t *testing.T) {
	t.Helper()
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	for _, s := range reportSources() {
		reports.RegisterSource(s)
	}
	reports.RegisterShipped(transactionDetailShipped())
}

// readerInfo is the reader core gives a source's Heading and FiscalStartMonth:
// the signed-in user on a GET with no query or body, as core's run builds it
// (listRequestInfo in core/server/reports/rules.go).
func readerInfo(user *core.Record) *core.RequestInfo {
	return &core.RequestInfo{
		Auth:    user,
		Headers: map[string]string{},
		Query:   map[string]string{},
		Body:    map[string]any{},
		Method:  http.MethodGet,
		Context: core.RequestInfoContextDefault,
	}
}

// booksSourceKeys is sorted, as reports.Sources returns its sources.
var booksSourceKeys = []string{
	"books.account_balances",
	"books.accounts",
	"books.audit_log",
	"books.basis_lines",
	"books.cash_basis_balances",
	"books.customers",
	"books.journal_entries",
	"books.journal_lines",
	"books.payable_items",
	"books.products",
	"books.receivable_items",
	"books.sales_documents",
	"books.sales_lines",
	"books.sales_tax_lines",
	"books.settings",
	"books.tax_agencies",
	"books.tax_rates",
	"books.vendors",
}

func TestReportSourcesPass(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	refused := reports.Refused(app)
	for _, key := range booksSourceKeys {
		if reason, bad := refused[key]; bad {
			t.Errorf("source %s refused: %s", key, reason)
		}
	}
	// A check over no sources passes trivially: each Books source must be one
	// the check accepted.
	accepted := map[string]bool{}
	for _, s := range reports.Sources(app) {
		accepted[s.Key] = true
	}
	for _, key := range booksSourceKeys {
		if !accepted[key] {
			t.Errorf("source %s is not registered and accepted", key)
		}
	}
}

type wantField struct {
	key      string
	typ      reports.FieldType
	aggs     []reports.Aggregate // nil: the field offers count only
	currency string
	textDay  bool
	label    string // "" leaves the label unpinned
	options  []reports.Option
	// anyAggs leaves the aggregates unpinned (the plan names none).
	anyAggs bool
	// optionValues, when set, pins only the option values, in order.
	optionValues []string
}

// wantPart is one collection of a union source (core SourcePart).
type wantPart struct {
	collection string
	columns    map[string]string
	values     map[string]any
}

type wantLink struct {
	key, target string
	card        reports.Cardinality
	field, back string
}

type wantSource struct {
	key, collection, label string
	fields                 []wantField
	links                  []wantLink
	// parts makes the source a union: it names no collection, each part
	// maps its own columns, and core sets each field's Column to its Key.
	parts []wantPart
}

// identity maps each key to the column of the same name.
func identity(keys ...string) map[string]string {
	out := map[string]string{}
	for _, k := range keys {
		out[k] = k
	}
	return out
}

func text(key string) wantField { return wantField{key: key, typ: reports.Text} }

func textMinMax(key string) wantField {
	return wantField{key: key, typ: reports.Text, aggs: reports.MinMax}
}

func money(key string) wantField {
	return wantField{key: key, typ: reports.Money, aggs: reports.SumAll, currency: "currency"}
}

func boolField(key string) wantField { return wantField{key: key, typ: reports.Bool} }

func toOne(key, target, field string) wantLink {
	return wantLink{key: key, target: target, card: reports.ToOne, field: field}
}

func toMany(key, target, back string) wantLink {
	return wantLink{key: key, target: target, card: reports.ToMany, back: back}
}

// accountTypeOptions reads account_types.json itself, in file order.
func accountTypeOptions(t *testing.T) []reports.Option {
	t.Helper()
	raw, err := os.ReadFile("account_types.json")
	if err != nil {
		t.Fatalf("read account_types.json: %v", err)
	}
	var types []struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	}
	if err := json.Unmarshal(raw, &types); err != nil {
		t.Fatalf("parse account_types.json: %v", err)
	}
	out := make([]reports.Option, len(types))
	for i, ty := range types {
		out[i] = reports.Option{Value: ty.Key, Label: ty.Label}
	}
	return out
}

// expectedCatalog is the spec §5 table, in the detail of checkpoint 2 step 1.
func expectedCatalog(t *testing.T) []wantSource {
	return []wantSource{
		{
			key: "books.accounts", collection: "books_accounts", label: "Accounts",
			fields: []wantField{
				textMinMax("name"), textMinMax("full_name"), textMinMax("number"),
				{key: "type", typ: reports.Select, options: accountTypeOptions(t)},
				text("detail_type"), text("description"), text("currency"),
				boolField("inactive"),
				// The account's 1099 box (1099 report spec §4).
				{key: "form_1099_box", typ: reports.Select, label: "1099 box", options: box1099Options()},
			},
			links: []wantLink{
				toOne("parent", "books.accounts", "parent"),
				toMany("sub_accounts", "books.accounts", "parent"),
				toMany("lines", "books.journal_lines", "account"),
				toMany("balances", "books.account_balances", "account"),
			},
		},
		{
			// Over the books_audit_log view (spec §5 "Source"): its computed
			// columns are text, so the Selects read text (core T3); the JSON
			// columns are left out, and it has no money, so no currency.
			key: "books.audit_log", collection: "books_audit_log", label: "Audit log",
			fields: []wantField{
				{key: "created", typ: reports.DateTime, aggs: reports.MinMax, label: "Date changed"},
				{key: "actor", typ: reports.Text, label: "User ID"},
				{key: "actor_name", typ: reports.Text, aggs: reports.MinMax, label: "User"},
				{key: "event", typ: reports.Select, label: "Event", options: auditEventOptions(t)},
				// The Event column's value (apply credit spec §3.8): the
				// events, plus the words a credit memo application reads.
				{key: "event_shown", typ: reports.Select, options: auditShownEventOptions(t)},
				{key: "record_type", typ: reports.Select, label: "Record type", options: auditRecordTypeOptions()},
				text("record_id"),
				{key: "record_label", typ: reports.Text, label: "Record"},
				{key: "parent_type", typ: reports.Select, options: auditRecordTypeOptions()},
				text("parent_id"), text("history_type"), text("history_id"),
			},
		},
		{
			key: "books.journal_entries", collection: "books_journal_entries", label: "Journal entries",
			fields: []wantField{
				{key: "date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				{key: "status", typ: reports.Select, options: []reports.Option{
					{Value: "draft", Label: "Draft"}, {Value: "posted", Label: "Posted"}, {Value: "void", Label: "Void"},
				}},
				{key: "origin", typ: reports.Select, options: []reports.Option{
					{Value: "manual", Label: "Manual"},
					{Value: "reversal", Label: "Reversal"},
					{Value: "auto_reversal", Label: "Auto-reversal"},
					{Value: "void_reversal", Label: "Void reversal"},
					{Value: "opening_balance", Label: "Opening balance"},
				}},
				{key: "doc_type", typ: reports.Select, options: []reports.Option{
					{Value: "journal", Label: "Journal entry"}, {Value: "transfer", Label: "Transfer"},
					{Value: "invoice", Label: "Invoice"}, {Value: "sales_receipt", Label: "Sales receipt"},
					{Value: "bill", Label: "Bill"}, {Value: "expense", Label: "Expense"},
					{Value: "payment", Label: "Payment"}, {Value: "bill_payment", Label: "Bill payment"},
					{Value: "credit_memo", Label: "Credit memo"}, {Value: "vendor_credit", Label: "Vendor credit"},
					{Value: "vendor_refund", Label: "Vendor refund"}, {Value: "refund_receipt", Label: "Refund receipt"},
					{Value: "write_off", Label: "Write-off"}, {Value: "deposit", Label: "Deposit"},
				}},
				textMinMax("number"),
				// The posting order behind number, so opened lines sort 9 before 10.
				{key: "sequence", typ: reports.Number, label: "Sequence"},
				text("memo"), money("total"), text("currency"),
				{key: "auto_reverse_on", typ: reports.Date, textDay: true},
				{key: "posted_at", typ: reports.DateTime, aggs: reports.MinMax},
				// The document an entry posted, so a line opens its screen.
				text("document"),
				// The server's card mark of a payment's entry (1099 report spec §4).
				{key: "card_payment", typ: reports.Bool, label: "Card payment"},
			},
			links: []wantLink{
				toMany("lines", "books.journal_lines", "entry"),
				toOne("reverses", "books.journal_entries", "reverses"),
				toOne("replaces", "books.journal_entries", "replaces"),
			},
		},
		{
			key: "books.journal_lines", collection: "books_journal_lines", label: "Journal lines",
			fields: []wantField{
				money("debit"), money("credit"), text("memo"),
				{key: "date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				boolField("posted"), text("currency"),
				// The line's order in its entry: the General Ledger's last sort key.
				{key: "position", typ: reports.Number},
			},
			links: []wantLink{
				toOne("entry", "books.journal_entries", "entry"),
				toOne("account", "books.accounts", "account"),
				toOne("customer", "books.customers", "customer"),
				toOne("vendor", "books.vendors", "vendor"),
			},
		},
		{
			// A union (core SourcePart) of the posted ledger lines and the
			// cash-basis rows (pay-bills spec §3.10 "Source"): the fields and
			// links of books.journal_lines, and layer, each part's constant.
			key: "books.basis_lines", label: "Journal lines by basis",
			fields: []wantField{
				money("debit"), money("credit"), text("memo"),
				{key: "date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				boolField("posted"), text("currency"),
				{key: "position", typ: reports.Number},
				{key: "layer", typ: reports.Select, optionValues: []string{"ledger", "cash"}},
				// Each row's copies of its entry's card mark and doc type (1099
				// report spec §11 Q21), with the entry field's values.
				{key: "card_payment", typ: reports.Bool, label: "Card payment"},
				{key: "doc_type", typ: reports.Select, label: "Document type", optionValues: []string{
					"journal", "transfer", "invoice", "sales_receipt", "bill", "expense", "payment", "bill_payment",
					"credit_memo", "vendor_credit", "vendor_refund", "refund_receipt", "write_off", "deposit",
				}},
			},
			links: []wantLink{
				toOne("entry", "books.journal_entries", "entry"),
				toOne("account", "books.accounts", "account"),
				toOne("customer", "books.customers", "customer"),
				toOne("vendor", "books.vendors", "vendor"),
				// Only the cash part maps it (1099 report spec §4): it reads
				// blank on a ledger row and on a cash row that takes a document out.
				{key: "payment_entry", target: "books.journal_entries", card: reports.ToOne, field: "payment_entry"},
			},
			parts: []wantPart{
				{
					collection: "books_journal_lines",
					columns:    identity("debit", "credit", "memo", "date", "posted", "currency", "position", "entry", "account", "customer", "vendor", "card_payment", "doc_type"),
					values:     map[string]any{"layer": "ledger"},
				},
				{
					collection: "books_cash_basis_lines",
					columns:    identity("debit", "credit", "memo", "date", "posted", "currency", "position", "entry", "account", "customer", "vendor", "card_payment", "doc_type", "payment_entry"),
					values:     map[string]any{"layer": "cash"},
				},
			},
		},
		{
			key: "books.account_balances", collection: "books_account_balances", label: "Monthly account balances",
			fields: []wantField{
				{key: "period", typ: reports.Text, aggs: reports.MinMax, label: "Month"},
				{key: "month_start", typ: reports.Date, textDay: true, aggs: reports.MinMax, label: "Month start"},
				money("debit_total"), money("credit_total"), text("currency"),
			},
			links: []wantLink{toOne("account", "books.accounts", "account")},
		},
		{
			key: "books.cash_basis_balances", collection: "books_cash_basis_balances", label: "Monthly cash-basis balances",
			fields: []wantField{
				{key: "period", typ: reports.Text, aggs: reports.MinMax, label: "Month"},
				{key: "month_start", typ: reports.Date, textDay: true, aggs: reports.MinMax, label: "Month start"},
				money("debit_total"), money("credit_total"), text("currency"),
			},
			links: []wantLink{toOne("account", "books.accounts", "account")},
		},
		{
			key: "books.customers", collection: "books_customers", label: "Customers",
			fields: []wantField{
				textMinMax("display_name"),
				text("company"), text("first_name"), text("last_name"), text("email"),
				text("phone"), text("mobile"), text("website"), text("notes"),
				boolField("inactive"),
			},
			links: []wantLink{
				toOne("parent", "books.customers", "parent"),
				toMany("sub_customers", "books.customers", "parent"),
				toMany("receivable_items", "books.receivable_items", "customer"),
			},
		},
		{
			// The customers source's shape and the 1099 fields the 1099 report
			// reads (1099 report spec §4); the tax id and json columns left out.
			key: "books.vendors", collection: "books_vendors", label: "Vendors",
			fields: []wantField{
				textMinMax("display_name"),
				text("company"), text("first_name"), text("last_name"), text("email"),
				text("phone"), text("mobile"), text("website"), text("notes"),
				boolField("inactive"),
				{key: "track_1099", typ: reports.Bool, label: "Track payments for 1099"},
				text("legal_name"),
				{key: "tax_id_type", typ: reports.Select, optionValues: []string{"ein", "ssn"}},
			},
		},
		{
			// The Books settings row the 1099 report reads its threshold from
			// (1099 report spec §4); no other settings column is a field.
			key: "books.settings", collection: "books_settings", label: "Books settings",
			fields: []wantField{
				{key: "threshold_1099", typ: reports.Money, currency: "currency", label: "1099 threshold", anyAggs: true},
				text("currency"),
			},
		},
		{
			key: "books.tax_agencies", collection: "books_tax_agencies", label: "Tax agencies",
			fields: []wantField{textMinMax("name"), boolField("inactive")},
		},
		{
			key: "books.tax_rates", collection: "books_tax_rates", label: "Tax rates",
			fields: []wantField{
				{key: "type", typ: reports.Select, options: []reports.Option{
					{Value: "rate", Label: "Rate"}, {Value: "group", Label: "Group"},
				}},
				textMinMax("name"),
				{key: "rate_ppm", typ: reports.Number, anyAggs: true},
				boolField("inactive"),
			},
			links: []wantLink{toOne("agency", "books.tax_agencies", "agency")},
		},
		{
			// A union (core SourcePart) of the three sales document kinds; kind
			// is each part's constant.
			key: "books.sales_documents", label: "Sales documents",
			fields: []wantField{
				{key: "kind", typ: reports.Select, options: []reports.Option{
					{Value: "invoice", Label: "Invoice"}, {Value: "sales_receipt", Label: "Sales receipt"},
					{Value: "credit_memo", Label: "Credit memo"}, {Value: "refund_receipt", Label: "Refund receipt"},
				}},
				{key: "date", typ: reports.Date, textDay: true, anyAggs: true},
				{key: "status", typ: reports.Select, optionValues: []string{"draft", "posted", "void"}},
				{key: "number", typ: reports.Text, anyAggs: true},
				{key: "sequence", typ: reports.Number, anyAggs: true},
				money("subtotal"), money("tax_total"), money("total"),
				text("currency"),
			},
			links: []wantLink{
				toOne("customer", "books.customers", "customer"),
				toOne("entry", "books.journal_entries", "entry"),
				// The back link of books.sales_lines' document, for the builder.
				toMany("lines", "books.sales_lines", "document"),
			},
			parts: []wantPart{
				{
					collection: "books_invoices",
					columns:    identity("date", "status", "number", "sequence", "subtotal", "tax_total", "total", "currency", "customer", "entry"),
					values:     map[string]any{"kind": "invoice"},
				},
				{
					collection: "books_sales_receipts",
					columns:    identity("date", "status", "number", "sequence", "subtotal", "tax_total", "total", "currency", "customer", "entry"),
					values:     map[string]any{"kind": "sales_receipt"},
				},
				{
					collection: "books_credit_memos",
					columns:    identity("date", "status", "number", "sequence", "subtotal", "tax_total", "total", "currency", "customer", "entry"),
					values:     map[string]any{"kind": "credit_memo"},
				},
				{
					// refund_from is no shared column of the sales documents.
					collection: "books_refund_receipts",
					columns:    identity("date", "status", "number", "sequence", "subtotal", "tax_total", "total", "currency", "customer", "entry"),
					values:     map[string]any{"kind": "refund_receipt"},
				},
			},
		},
		{
			// A union of the three ledger tax line collections and the cash-basis
			// tax rows (pay-bills spec §3.10, Q3); the document link reads each
			// part's own parent column, date is each row's own stored day, and
			// layer is each part's constant.
			key: "books.sales_tax_lines", label: "Sales tax lines",
			fields: []wantField{
				money("gross_amount"), money("taxable_amount"), money("amount"),
				{key: "rate_ppm", typ: reports.Number, anyAggs: true},
				text("currency"),
				{key: "date", typ: reports.Date, textDay: true, anyAggs: true},
				{key: "layer", typ: reports.Select, optionValues: []string{"ledger", "cash"}},
			},
			links: []wantLink{
				toOne("document", "books.sales_documents", "document"),
				toOne("rate", "books.tax_rates", "rate"),
				toOne("component", "books.tax_rates", "component"),
				toOne("agency", "books.tax_agencies", "agency"),
				// Only the cash part maps it, so it reads empty on a ledger
				// row and on a cash row that takes a document out.
				toOne("payment_entry", "books.journal_entries", "payment_entry"),
			},
			parts: []wantPart{
				{
					collection: "books_invoice_tax_lines",
					columns: mergeColumns(
						identity("gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date"),
						map[string]string{"document": "invoice"},
					),
					values: map[string]any{"layer": "ledger"},
				},
				{
					collection: "books_sales_receipt_tax_lines",
					columns: mergeColumns(
						identity("gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date"),
						map[string]string{"document": "sales_receipt"},
					),
					values: map[string]any{"layer": "ledger"},
				},
				{
					collection: "books_credit_memo_tax_lines",
					columns: mergeColumns(
						identity("gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date"),
						map[string]string{"document": "credit_memo"},
					),
					values: map[string]any{"layer": "ledger"},
				},
				{
					// A plain refund's negated snapshot; a payout writes none.
					collection: "books_refund_receipt_tax_lines",
					columns: mergeColumns(
						identity("gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date"),
						map[string]string{"document": "refund_receipt"},
					),
					values: map[string]any{"layer": "ledger"},
				},
				{
					// The cash rows of an invoice and of a credit memo both name
					// their document in document; payment_entry is empty on a
					// row that takes a document out.
					collection: "books_cash_basis_tax_lines",
					columns:    identity("gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date", "document", "payment_entry"),
					values:     map[string]any{"layer": "cash"},
				},
			},
		},
		{
			// A union of the three sales line collections (sales-reports spec
			// §5): the document link reads each part's own parent column, and
			// sign is each part's constant. The lines have no currency column, so
			// the Money fields name none and read the source's Currency.
			key: "books.sales_lines", label: "Sales lines",
			fields: []wantField{
				{key: "kind", typ: reports.Select, options: []reports.Option{
					{Value: "item", Label: "Item"}, {Value: "description", Label: "Description"},
					{Value: "subtotal", Label: "Subtotal"}, {Value: "percent", Label: "Percent"},
				}},
				{key: "description", typ: reports.Text, anyAggs: true},
				{key: "quantity", typ: reports.Number, anyAggs: true},
				{key: "rate", typ: reports.Money, anyAggs: true},
				{key: "amount", typ: reports.Money, aggs: reports.SumAll},
				boolField("taxable"),
				{key: "position", typ: reports.Number, anyAggs: true},
				{key: "sign", typ: reports.Number, anyAggs: true},
			},
			links: []wantLink{
				toOne("document", "books.sales_documents", "document"),
				toOne("product", "books.products", "product"),
			},
			parts: []wantPart{
				{
					collection: "books_invoice_lines",
					columns: mergeColumns(
						identity("kind", "description", "quantity", "rate", "amount", "taxable", "position", "product"),
						map[string]string{"document": "invoice"},
					),
					values: map[string]any{"sign": 1},
				},
				{
					collection: "books_sales_receipt_lines",
					columns: mergeColumns(
						identity("kind", "description", "quantity", "rate", "amount", "taxable", "position", "product"),
						map[string]string{"document": "sales_receipt"},
					),
					values: map[string]any{"sign": 1},
				},
				{
					collection: "books_credit_memo_lines",
					columns: mergeColumns(
						identity("kind", "description", "quantity", "rate", "amount", "taxable", "position", "product"),
						map[string]string{"document": "credit_memo"},
					),
					values: map[string]any{"sign": -1},
				},
				{
					// The view of a plain refund's lines: a payout's lines are no
					// sale lines (refund-receipt spec Q10).
					collection: "books_refund_receipt_sale_lines",
					columns: mergeColumns(
						identity("kind", "description", "quantity", "rate", "amount", "taxable", "position", "product"),
						map[string]string{"document": "refund_receipt"},
					),
					values: map[string]any{"sign": -1},
				},
			},
		},
		{
			// The stored receivable items (A/R Aging spec §4).
			key: "books.receivable_items", collection: "books_receivable_items", label: "Receivable items",
			fields: []wantField{
				{key: "date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				{key: "due_date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				money("debit"), money("credit"), text("currency"), text("item"),
				{key: "item_kind", typ: reports.Select, options: []reports.Option{
					{Value: "invoice", Label: "Invoice"}, {Value: "payment", Label: "Payment"},
					{Value: "credit_memo", Label: "Credit memo"}, {Value: "entry", Label: "Journal entry"},
				}},
				textMinMax("item_number"),
				// The integer the item's number formats (server/numbering.go):
				// items sort by it, since "JE-10" sorts before "JE-9" as text.
				{key: "item_seq", typ: reports.Number, aggs: reports.MinMax},
				{key: "settled", typ: reports.Text},
			},
			links: []wantLink{
				toOne("customer", "books.customers", "customer"),
				toOne("entry", "books.journal_entries", "entry"),
			},
		},
		{
			// The stored payable items (A/P Aging spec §4.3).
			key: "books.payable_items", collection: "books_payable_items", label: "Payable items",
			fields: []wantField{
				{key: "date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				{key: "due_date", typ: reports.Date, textDay: true, aggs: reports.MinMax},
				money("debit"), money("credit"), text("currency"), text("item"),
				{key: "item_kind", typ: reports.Select, options: []reports.Option{
					{Value: "bill", Label: "Bill"}, {Value: "vendor_credit", Label: "Vendor credit"},
					{Value: "entry", Label: "Journal entry"},
				}},
				textMinMax("item_number"),
				{key: "item_seq", typ: reports.Number, aggs: reports.MinMax},
				{key: "settled", typ: reports.Text},
			},
			links: []wantLink{
				toOne("vendor", "books.vendors", "vendor"),
				toOne("entry", "books.journal_entries", "entry"),
			},
		},
		{
			// Purchase fields, form columns and the name and sort keys are left
			// out (sales-reports spec §5).
			key: "books.products", collection: "books_products", label: "Products and services",
			fields: []wantField{
				{key: "name", typ: reports.Text, anyAggs: true},
				{key: "sku", typ: reports.Text, anyAggs: true},
				{key: "type", typ: reports.Select, options: []reports.Option{
					{Value: "service", Label: "Service"}, {Value: "non_inventory", Label: "Non-inventory"},
					{Value: "bundle", Label: "Bundle"},
				}},
				{key: "sales_description", typ: reports.Text, anyAggs: true},
				{key: "price", typ: reports.Money, currency: "currency", anyAggs: true},
				text("currency"),
				boolField("inactive"),
			},
			links: []wantLink{
				toOne("income_account", "books.accounts", "income_account"),
				toMany("sales_lines", "books.sales_lines", "product"),
			},
		},
	}
}

// auditEventOptions are the Event options of the golden file, the fixture's
// AUDIT_EVENT_OPTIONS: added, changed, posted, voided, deleted.
func auditEventOptions(t *testing.T) []reports.Option {
	t.Helper()
	options := readAuditGolden(t).EventOptions
	if len(options) != 5 {
		t.Fatalf("the golden file holds %d event options, want 5", len(options))
	}
	return options
}

// auditShownEventOptions are the options of the Event column's value: the
// golden events, then a credit memo application's create and delete (apply
// credit spec §3.8).
func auditShownEventOptions(t *testing.T) []reports.Option {
	t.Helper()
	return append(slices.Clone(auditEventOptions(t)),
		reports.Option{Value: "credit_applied", Label: "Credit applied"},
		reports.Option{Value: "credit_removed", Label: "Credit removed"},
	)
}

func mergeColumns(maps ...map[string]string) map[string]string {
	out := map[string]string{}
	for _, m := range maps {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

// aggsOf reads nil as count only, as the registry does.
func aggsOf(a []reports.Aggregate) []reports.Aggregate {
	if a == nil {
		return reports.CountOnly
	}
	return a
}

// leftOut are the columns spec §5 keeps out of every Books source.
var leftOut = []string{
	"sort_key", "name_key", "form", "close_override",
	"billing_address", "shipping_address", "fields",
	"address", "tax_id",
}

// box1099Options are the 1099 box options: boxes1099 in order, each with its
// label of box1099Label (lib/form-1099.ts; 1099 report spec §4).
func box1099Options() []reports.Option {
	return []reports.Option{
		{Value: "nec_1", Label: "NEC 1 · Nonemployee compensation"},
		{Value: "misc_1", Label: "MISC 1 · Rents"},
		{Value: "misc_2", Label: "MISC 2 · Royalties"},
		{Value: "misc_3", Label: "MISC 3 · Other income"},
		{Value: "misc_5", Label: "MISC 5 · Fishing boat proceeds"},
		{Value: "misc_6", Label: "MISC 6 · Medical and health care payments"},
		{Value: "misc_8", Label: "MISC 8 · Substitute payments in lieu of dividends or interest"},
		{Value: "misc_9", Label: "MISC 9 · Crop insurance proceeds"},
		{Value: "misc_10", Label: "MISC 10 · Gross proceeds paid to an attorney"},
		{Value: "misc_11", Label: "MISC 11 · Fish purchased for resale"},
	}
}

func TestReportSourcesCatalog(t *testing.T) {
	app := newBooksApp(t)
	if err := setFields(t, app, "books_settings", settingsID, map[string]any{
		"business_name": "Harbor Lane Design LLC", "fiscal_year_start_month": 7,
	}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	info := readerInfo(reader)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	got := map[string]reports.Source{}
	keys := []string{}
	for _, s := range reports.Sources(app) {
		got[s.Key] = s
		keys = append(keys, s.Key)
	}
	if !reflect.DeepEqual(keys, booksSourceKeys) {
		t.Fatalf("source keys = %v, want %v", keys, booksSourceKeys)
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range expectedCatalog(t) {
		t.Run(want.key, func(t *testing.T) {
			src := got[want.key]
			if src.Collection != want.collection || src.Label != want.label {
				t.Errorf("collection, label = %q, %q; want %q, %q", src.Collection, src.Label, want.collection, want.label)
			}
			wantCurrency := ""
			if slices.Contains([]string{
				"books.journal_entries", "books.journal_lines", "books.basis_lines", "books.account_balances",
				"books.cash_basis_balances",
				"books.sales_documents", "books.sales_tax_lines", "books.sales_lines", "books.products",
				"books.receivable_items", "books.payable_items", "books.settings",
			}, want.key) {
				wantCurrency = "USD"
			}
			gotCurrency := ""
			if src.Currency != nil {
				gotCurrency = src.Currency(app, info)
			}
			if gotCurrency != wantCurrency {
				t.Errorf("Currency = %q, want %q (the Books currency on a source with money fields, none otherwise)", gotCurrency, wantCurrency)
			}
			if !reflect.DeepEqual(src.Watch, []string{"books_settings"}) {
				t.Errorf("Watch = %v, want [books_settings]", src.Watch)
			}
			if src.Heading == nil || src.Heading(app, info) != "Harbor Lane Design LLC" {
				t.Errorf("Heading does not read books_settings.business_name")
			}
			if src.FiscalStartMonth == nil || src.FiscalStartMonth(app, info) != 7 {
				t.Errorf("FiscalStartMonth does not read books_settings.fiscal_year_start_month")
			}
			checkFields(t, src, want.fields)
			checkLinks(t, src, want.links)
			if len(want.parts) == 0 {
				if len(src.Parts) != 0 {
					t.Errorf("source %s has %d parts, want a one-collection source", want.key, len(src.Parts))
				}
				checkLeftOut(t, app, src, users.Id)
				return
			}
			checkParts(t, src, want.parts)
			checkPartsLeftOut(t, app, src, users.Id)
		})
	}
}

// The doc_type options come from one Go list that matches the migration's
// select values, in order, so a report can filter on every document type.
func TestReportSourcesDocTypesMatchTheMigration(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	col, err := app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("doc_type").(*core.SelectField)
	if !ok {
		t.Fatal("books_journal_entries.doc_type is not a select field")
	}
	var options []reports.Option
	for _, s := range reportSources() {
		if s.Key != "books.journal_entries" {
			continue
		}
		for _, f := range s.Fields {
			if f.Key == "doc_type" {
				options = f.Options
			}
		}
	}
	values := make([]string, len(options))
	for i, o := range options {
		values[i] = o.Value
	}
	if len(field.Values) == 0 || !slices.Equal(values, field.Values) {
		t.Errorf("doc_type options %v, want the migration's values %v", values, field.Values)
	}
}

// checkParts compares a union source's parts with want, in order.
func checkParts(t *testing.T, src reports.Source, want []wantPart) {
	t.Helper()
	if len(src.Parts) != len(want) {
		t.Fatalf("parts = %d, want %d (%v)", len(src.Parts), len(want), want)
	}
	for i, w := range want {
		p := src.Parts[i]
		if p.Collection != w.collection {
			t.Errorf("part %d collection = %q, want %q", i, p.Collection, w.collection)
		}
		if !reflect.DeepEqual(p.Columns, w.columns) {
			t.Errorf("part %s columns = %v\nwant %v", w.collection, p.Columns, w.columns)
		}
		// Compared as JSON, so a number constant matches whatever Go number
		// type the source writes it with (1, int64(1), 1.0).
		if (len(p.Values) != 0 || len(w.values) != 0) && string(mustJSON(p.Values)) != string(mustJSON(w.values)) {
			t.Errorf("part %s values = %v, want %v", w.collection, p.Values, w.values)
		}
	}
}

// checkPartsLeftOut is checkLeftOut over each part's collection and the
// columns it maps.
func checkPartsLeftOut(t *testing.T, app core.App, src reports.Source, usersID string) {
	t.Helper()
	for _, p := range src.Parts {
		col, err := app.FindCollectionByNameOrId(p.Collection)
		if err != nil {
			t.Fatalf("find %s: %v", p.Collection, err)
		}
		for key, column := range p.Columns {
			if slices.Contains(leftOut, key) || slices.Contains(leftOut, column) {
				t.Errorf("part %s maps %s (column %s), which the spec leaves out", p.Collection, key, column)
			}
			if col.Fields.GetByName(column) == nil {
				t.Errorf("part %s maps %s to %q, which is not a column of the collection", p.Collection, key, column)
			}
			if rel, ok := col.Fields.GetByName(column).(*core.RelationField); ok && rel.CollectionId == usersID {
				t.Errorf("part %s maps %s to a user relation", p.Collection, key)
			}
		}
	}
}

func checkFields(t *testing.T, src reports.Source, want []wantField) {
	t.Helper()
	fields := map[string]reports.Field{}
	var keys []string
	for _, f := range src.Fields {
		// Core adds the id field to every source.
		if f.Key == "id" {
			continue
		}
		fields[f.Key] = f
		keys = append(keys, f.Key)
	}
	var wantKeys []string
	for _, w := range want {
		wantKeys = append(wantKeys, w.key)
	}
	sort.Strings(keys)
	sort.Strings(wantKeys)
	if !reflect.DeepEqual(keys, wantKeys) {
		t.Errorf("field keys = %v, want %v", keys, wantKeys)
	}
	for _, w := range want {
		f, ok := fields[w.key]
		if !ok {
			continue
		}
		// Core sets a union field's Column to its Key, so both kinds read the key.
		if f.Column != w.key {
			t.Errorf("field %s reads column %q, want %q", w.key, f.Column, w.key)
		}
		if f.Type != w.typ {
			t.Errorf("field %s type = %s, want %s", w.key, f.Type, w.typ)
		}
		if !w.anyAggs && !reflect.DeepEqual(aggsOf(f.Aggregates), aggsOf(w.aggs)) {
			t.Errorf("field %s aggregates = %v, want %v", w.key, aggsOf(f.Aggregates), aggsOf(w.aggs))
		}
		if f.Currency != w.currency {
			t.Errorf("field %s currency field = %q, want %q", w.key, f.Currency, w.currency)
		}
		if f.TextDay != w.textDay {
			t.Errorf("field %s TextDay = %v, want %v", w.key, f.TextDay, w.textDay)
		}
		if w.label != "" && f.Label != w.label {
			t.Errorf("field %s label = %q, want %q", w.key, f.Label, w.label)
		}
		if w.optionValues != nil {
			values := make([]string, len(f.Options))
			for i, o := range f.Options {
				values[i] = o.Value
			}
			if !slices.Equal(values, w.optionValues) {
				t.Errorf("field %s option values = %v, want %v", w.key, values, w.optionValues)
			}
		} else if !reflect.DeepEqual(f.Options, w.options) {
			t.Errorf("field %s options = %v, want %v", w.key, f.Options, w.options)
		}
	}
}

func checkLinks(t *testing.T, src reports.Source, want []wantLink) {
	t.Helper()
	got := map[string]reports.Link{}
	var keys []string
	for _, l := range src.Links {
		got[l.Key] = l
		keys = append(keys, l.Key)
	}
	var wantKeys []string
	for _, w := range want {
		wantKeys = append(wantKeys, w.key)
	}
	sort.Strings(keys)
	sort.Strings(wantKeys)
	if !reflect.DeepEqual(keys, wantKeys) {
		t.Errorf("link keys = %v, want %v", keys, wantKeys)
	}
	for _, w := range want {
		l, ok := got[w.key]
		if !ok {
			continue
		}
		if l.Target != w.target || l.Cardinality != w.card || l.Field != w.field || l.BackField != w.back {
			t.Errorf("link %s = {target %s, %s, field %q, back %q}; want {target %s, %s, field %q, back %q}",
				w.key, l.Target, l.Cardinality, l.Field, l.BackField, w.target, w.card, w.field, w.back)
		}
	}
}

// checkLeftOut finds no left-out column and no relation to users, by the
// collection's own schema.
func checkLeftOut(t *testing.T, app core.App, src reports.Source, usersID string) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(src.Collection)
	if err != nil {
		t.Fatalf("find %s: %v", src.Collection, err)
	}
	pointsAtUsers := func(column string) bool {
		rel, ok := col.Fields.GetByName(column).(*core.RelationField)
		return ok && rel.CollectionId == usersID
	}
	for _, f := range src.Fields {
		if slices.Contains(leftOut, f.Key) || slices.Contains(leftOut, f.Column) {
			t.Errorf("field %s (column %s) is left out by the spec", f.Key, f.Column)
		}
		if pointsAtUsers(f.Column) {
			t.Errorf("field %s reads a user relation", f.Key)
		}
	}
	for _, l := range src.Links {
		if slices.Contains(leftOut, l.Key) || slices.Contains(leftOut, l.Field) {
			t.Errorf("link %s (field %s) is left out by the spec", l.Key, l.Field)
		}
		if l.Cardinality == reports.ToOne && pointsAtUsers(l.Field) {
			t.Errorf("link %s follows a user relation", l.Key)
		}
	}
}

func TestReportSourcesHeadingAndFiscalStart(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	// Books read-only access may view books_settings (its view rule is the
	// Books can_read rule); Books access none may not.
	reader := readerInfo(users.readOnly)
	outsider := readerInfo(users.none)
	if err := setFields(t, app, "books_settings", settingsID, map[string]any{
		"business_name": "Harbor Lane Design LLC", "fiscal_year_start_month": 7,
	}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	if got := booksHeading(app, reader); got != "Harbor Lane Design LLC" {
		t.Errorf("heading = %q, want the business name", got)
	}
	if got := booksFiscalStart(app, reader); got != 7 {
		t.Errorf("fiscal start = %d, want 7", got)
	}
	if got := booksHeading(app, outsider); got != "" {
		t.Errorf("heading for a user with Books access none = %q, want \"\" (they may not view books_settings)", got)
	}
	if got := booksFiscalStart(app, outsider); got != 1 {
		t.Errorf("fiscal start for a user with Books access none = %d, want 1 (they may not view books_settings)", got)
	}
	if got := booksCurrency(app, reader); got != "USD" {
		t.Errorf("currency = %q, want the Books currency USD", got)
	}
	if got := booksCurrency(app, outsider); got != "" {
		t.Errorf("currency for a user with Books access none = %q, want \"\" (they may not view books_settings)", got)
	}

	if err := setFields(t, app, "books_settings", settingsID, map[string]any{"business_name": ""}); err != nil {
		t.Fatalf("clear business name: %v", err)
	}
	if got := booksHeading(app, reader); got != "" {
		t.Errorf("heading with no business name = %q, want \"\" (core prints the organization's name)", got)
	}

	if err := app.Delete(reload(t, app, "books_settings", settingsID)); err != nil {
		t.Fatalf("delete settings: %v", err)
	}
	if got := booksFiscalStart(app, reader); got != 1 {
		t.Errorf("fiscal start with no settings row = %d, want 1", got)
	}
	if got := booksHeading(app, reader); got != "" {
		t.Errorf("heading with no settings row = %q, want \"\"", got)
	}
	if got := booksCurrency(app, reader); got != "" {
		t.Errorf("currency with no settings row = %q, want \"\"", got)
	}
}

// debitToDay sums the debit of every journal line dated on or before the day.
const debitToDay = `{"version":4,"source":"books.journal_lines",
	"columns":[{"id":"debit","path":[{"field":"debit"}],"aggregate":"sum"}],
	"filter":{"op":"lte","args":[{"path":[{"field":"date"}]},{"value":"2026-03-31"}]}}`

func runAs(t *testing.T, app core.App, reader *core.Record, raw string) *reports.Result {
	t.Helper()
	spec, info, err := reports.Load([]byte(raw))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	res, err := reports.Run(context.Background(), app, reports.Request{Spec: spec, Loaded: info, Auth: reader})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// splitRows returns a result's detail rows and its total row.
func splitRows(t *testing.T, res *reports.Result) ([]reports.Row, *reports.Row) {
	t.Helper()
	var details []reports.Row
	var total *reports.Row
	for i, r := range res.Rows {
		switch r.Kind {
		case reports.KindDetail:
			details = append(details, r)
		case reports.KindTotal:
			total = &res.Rows[i]
		}
	}
	return details, total
}

func TestReportSourcesRun(t *testing.T) {
	env := newLedgerEnv(t)
	app := env.app
	if err := setFields(t, app, "books_settings", settingsID, map[string]any{"business_name": "Harbor Lane Design LLC"}); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	mustPost(t, app, env.sale(t, "2026-03-10", 12345).Id, env.users.admin.Id)
	// The day itself counts.
	mustPost(t, app, env.sale(t, "2026-03-31", 500).Id, env.users.admin.Id)
	// After the day: left out by the filter.
	mustPost(t, app, env.sale(t, "2026-04-01", 7000).Id, env.users.admin.Id)
	// A draft's lines carry no day until it posts, so it never counts.
	env.sale(t, "2026-03-15", 999)

	res := runAs(t, app, env.users.readOnly, debitToDay)
	details, total := splitRows(t, res)
	if len(details) != 4 {
		t.Errorf("detail rows = %d, want the 4 lines of the two entries posted by 2026-03-31", len(details))
	}
	if total == nil || total.Cells["debit"] != int64(12845) {
		t.Fatalf("total row = %+v, want debit 12845 (12345 + 500)", total)
	}
	if res.Heading != "Harbor Lane Design LLC" {
		t.Errorf("heading = %q, want the Books business name", res.Heading)
	}
	// A report a user builds over journal lines is not live.
	requireManual(t, res)

	outsider := runAs(t, app, env.users.none, debitToDay)
	hidden, hiddenTotal := splitRows(t, outsider)
	if len(hidden) != 0 {
		t.Errorf("a user with Books level none sees %d lines, want none", len(hidden))
	}
	if hiddenTotal != nil && hiddenTotal.Cells["debit"] != nil && hiddenTotal.Cells["debit"] != int64(0) {
		t.Errorf("a user with Books level none totals %v, want nothing", hiddenTotal.Cells["debit"])
	}
	if outsider.Heading != "" {
		t.Errorf("heading for a user with Books level none = %q, want \"\" (they may not view books_settings)", outsider.Heading)
	}
}

// salesDocumentsRows reads every sales document row: its kind, id, status and
// stored figures.
const salesDocumentsRows = `{"version":4,"source":"books.sales_documents","columns":[
	{"id":"kind","path":[{"field":"kind"}]},
	{"id":"doc","path":[{"field":"id"}]},
	{"id":"status","path":[{"field":"status"}]},
	{"id":"subtotal","path":[{"field":"subtotal"}]},
	{"id":"tax","path":[{"field":"tax_total"}]},
	{"id":"total","path":[{"field":"total"}]}]}`

// Credit memo spec §3.10 (Q19): the source "Sales documents" holds a credit
// memo with kind credit_memo (option label "Credit memo") and its stored,
// positive Subtotal, Tax and Total.
func TestReportSources_SalesDocumentsHoldACreditMemo(t *testing.T) {
	ce := newCreditMemoEnv(t)
	registerBooksSources(t)
	if err := reports.CheckSources(ce.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	inv := ce.postedInvoiceFor(t, ce.customer, 50000)

	var kindOptions []reports.Option
	for _, s := range reportSources() {
		if s.Key != "books.sales_documents" {
			continue
		}
		for _, f := range s.Fields {
			if f.Key == "kind" {
				kindOptions = f.Options
			}
		}
	}
	if !slices.Contains(kindOptions, reports.Option{Value: "credit_memo", Label: "Credit memo"}) {
		t.Errorf("the kind options %v have no {credit_memo, Credit memo}", kindOptions)
	}

	details, _ := splitRows(t, runAs(t, ce.app, ce.users.readOnly, salesDocumentsRows))
	byDoc := map[string]reports.Row{}
	for _, r := range details {
		if id, ok := r.Cells["doc"].(string); ok {
			byDoc[id] = r
		}
	}
	type docCells struct {
		kind, status         any
		subtotal, tax, total any
	}
	read := func(r reports.Row) docCells {
		return docCells{r.Cells["kind"], r.Cells["status"], r.Cells["subtotal"], r.Cells["tax"], r.Cells["total"]}
	}
	got, ok := byDoc[memo.Id]
	if !ok {
		t.Fatalf("books.sales_documents has no row for the credit memo %s; rows %v", memo.Id, details)
	}
	if want := (docCells{"credit_memo", "posted", int64(100000), int64(8710), int64(108710)}); read(got) != want {
		t.Errorf("the credit memo's row (kind, status, subtotal, tax, total) = %+v, want %+v", read(got), want)
	}
	if r, ok := byDoc[inv.Id]; !ok || r.Cells["kind"] != "invoice" {
		t.Errorf("the invoice's row = %+v (found %v), want kind invoice beside the memo", r.Cells, ok)
	}
}

// salesTaxLineRows reads every sales tax line: its layer, its document's id
// and kind, and its three figures.
const salesTaxLineRows = `{"version":4,"source":"books.sales_tax_lines","columns":[
	{"id":"layer","path":[{"field":"layer"}]},
	{"id":"doc","path":[{"link":"document"},{"field":"id"}]},
	{"id":"kind","path":[{"link":"document"},{"field":"kind"}]},
	{"id":"component","path":[{"link":"component"},{"field":"id"}]},
	{"id":"gross","path":[{"field":"gross_amount"}]},
	{"id":"taxable","path":[{"field":"taxable_amount"}]},
	{"id":"amount","path":[{"field":"amount"}]}]}`

// taxLineCells is one books.sales_tax_lines row as the run returns it.
type taxLineCells struct {
	layer, doc, kind, component any
	gross, taxable, amount      any
}

// Credit memo spec §4.3 (Q5, Q17): the source "Sales tax lines" holds a credit
// memo's tax lines on layer ledger with negative figures and document the
// memo; the cash layer's rows name their document, an invoice or a memo.
func TestReportSources_SalesTaxLinesHoldACreditMemo(t *testing.T) {
	ce := newCreditMemoEnv(t)
	registerBooksSources(t)
	if err := reports.CheckSources(ce.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	memo := ce.denverMemo(t, nil)
	mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id)
	inv, err := newInvoice(ce.app, ce.customer, map[string]any{"tax_rate": ce.denver.Id})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, ce.app, inv, 0, item(ce.service, 1, 100000, true))
	mustPostInvoice(t, ce.app, inv.Id, ce.users.bookkeeper.Id)

	details, _ := splitRows(t, runAs(t, ce.app, ce.users.readOnly, salesTaxLineRows))
	var got []taxLineCells
	for _, r := range details {
		got = append(got, taxLineCells{
			r.Cells["layer"], r.Cells["doc"], r.Cells["kind"], r.Cells["component"],
			r.Cells["gross"], r.Cells["taxable"], r.Cells["amount"],
		})
	}
	sort.Slice(got, func(i, j int) bool { return fmt.Sprint(got[i]) < fmt.Sprint(got[j]) })

	components := []struct {
		rate *core.Record
		tax  int64
	}{{ce.state, 2900}, {ce.rtd, 1000}, {ce.city, 4810}}
	var want []taxLineCells
	for _, c := range components {
		// The ledger snapshot: the memo's negated, the invoice's positive.
		want = append(want,
			taxLineCells{"ledger", memo.Id, "credit_memo", c.rate.Id, int64(-100000), int64(-100000), -c.tax},
			taxLineCells{"ledger", inv.Id, "invoice", c.rate.Id, int64(100000), int64(100000), c.tax},
			// The cash rows take each out: the memo's turned back to positive,
			// the invoice's negated.
			taxLineCells{"cash", memo.Id, "credit_memo", c.rate.Id, int64(100000), int64(100000), c.tax},
			taxLineCells{"cash", inv.Id, "invoice", c.rate.Id, int64(-100000), int64(-100000), -c.tax},
		)
	}
	sort.Slice(want, func(i, j int) bool { return fmt.Sprint(want[i]) < fmt.Sprint(want[j]) })
	if !reflect.DeepEqual(got, want) {
		t.Errorf("books.sales_tax_lines rows =\n%v\nwant\n%v", got, want)
	}
}

// refundSourcesEnv posts a plain Denver refund (refund receipt 1001: 100000
// taxable, tax 8710, total 108710) and a payout of 50.00 of the payout memo,
// with the Books sources registered and checked.
func refundSourcesEnv(t *testing.T) (rr *refundReceiptEnv, plain, payout *core.Record) {
	t.Helper()
	rr = newRefundReceiptEnv(t)
	registerBooksSources(t)
	if err := reports.CheckSources(rr.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	plain = mustPostRefundReceipt(t, rr.app, rr.denverRefund(t, nil).Id, rr.users.bookkeeper.Id)
	payout = rr.postedPayout(t, rr.payoutMemo(t), 5000)
	return rr, plain, payout
}

// salesLineRows reads every sales line: its document's id and kind, its
// amount and its sign.
const salesLineRows = `{"version":4,"source":"books.sales_lines","columns":[
	{"id":"doc","path":[{"link":"document"},{"field":"id"}]},
	{"id":"kind","path":[{"link":"document"},{"field":"kind"}]},
	{"id":"amount","path":[{"field":"amount"}]},
	{"id":"sign","path":[{"field":"sign"}]}]}`

// wholeCell reads a numeric run cell, whatever Go number type the run gives a
// part's constant.
func wholeCell(v any) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case float64:
		return int64(n), float64(int64(n)) == n
	}
	return 0, false
}

// Refund receipt spec Q10: books.sales_lines holds a plain refund's lines with
// sign −1, so the sales reports count them negated, and no line of a payout.
func TestReportSources_SalesLinesHoldAPlainRefundNegated(t *testing.T) {
	rr, plain, payout := refundSourcesEnv(t)

	details, _ := splitRows(t, runAs(t, rr.app, rr.users.readOnly, salesLineRows))
	var signed []int64
	for _, r := range details {
		switch r.Cells["doc"] {
		case payout.Id:
			t.Errorf("books.sales_lines holds a line of the payout: %v", r.Cells)
		case plain.Id:
			if r.Cells["kind"] != "refund_receipt" {
				t.Errorf("a plain refund line's document kind = %v, want refund_receipt", r.Cells["kind"])
			}
			amount, okAmount := wholeCell(r.Cells["amount"])
			sign, okSign := wholeCell(r.Cells["sign"])
			if !okAmount || !okSign {
				t.Fatalf("a plain refund line's amount %#v sign %#v, want two whole numbers", r.Cells["amount"], r.Cells["sign"])
			}
			signed = append(signed, amount*sign)
		}
	}
	slices.Sort(signed)
	if want := []int64{-60000, -40000}; !slices.Equal(signed, want) {
		t.Errorf("the plain refund's lines amount × sign = %v, want %v", signed, want)
	}
}

// Refund receipt spec Q10: books.sales_tax_lines holds a plain refund's
// negated snapshot on layer ledger with document kind refund_receipt, and no
// row of a payout.
func TestReportSources_SalesTaxLinesHoldAPlainRefund(t *testing.T) {
	rr, plain, payout := refundSourcesEnv(t)

	details, _ := splitRows(t, runAs(t, rr.app, rr.users.readOnly, salesTaxLineRows))
	var got []taxLineCells
	for _, r := range details {
		switch r.Cells["doc"] {
		case payout.Id:
			t.Errorf("books.sales_tax_lines holds a row of the payout: %v", r.Cells)
		case plain.Id:
			got = append(got, taxLineCells{
				r.Cells["layer"], r.Cells["doc"], r.Cells["kind"], r.Cells["component"],
				r.Cells["gross"], r.Cells["taxable"], r.Cells["amount"],
			})
		}
	}
	sort.Slice(got, func(i, j int) bool { return fmt.Sprint(got[i]) < fmt.Sprint(got[j]) })
	var want []taxLineCells
	for _, c := range []struct {
		rate *core.Record
		tax  int64
	}{{rr.state, 2900}, {rr.rtd, 1000}, {rr.city, 4810}} {
		want = append(want, taxLineCells{"ledger", plain.Id, "refund_receipt", c.rate.Id, int64(-100000), int64(-100000), -c.tax})
	}
	sort.Slice(want, func(i, j int) bool { return fmt.Sprint(want[i]) < fmt.Sprint(want[j]) })
	if !reflect.DeepEqual(got, want) {
		t.Errorf("books.sales_tax_lines rows of the plain refund =\n%v\nwant\n%v", got, want)
	}
}

// Refund receipt spec §3.13 "Report builder": books.sales_documents holds a
// refund with kind refund_receipt (option label "Refund receipt") and its
// stored, positive Subtotal, Tax and Total.
func TestReportSources_SalesDocumentsHoldARefundReceipt(t *testing.T) {
	rr, plain, payout := refundSourcesEnv(t)

	var kindOptions []reports.Option
	for _, s := range reportSources() {
		if s.Key != "books.sales_documents" {
			continue
		}
		for _, f := range s.Fields {
			if f.Key == "kind" {
				kindOptions = f.Options
			}
		}
	}
	if !slices.Contains(kindOptions, reports.Option{Value: "refund_receipt", Label: "Refund receipt"}) {
		t.Errorf("the kind options %v have no {refund_receipt, Refund receipt}", kindOptions)
	}

	details, _ := splitRows(t, runAs(t, rr.app, rr.users.readOnly, salesDocumentsRows))
	byDoc := map[string]reports.Row{}
	for _, r := range details {
		if id, ok := r.Cells["doc"].(string); ok {
			byDoc[id] = r
		}
	}
	type docCells struct {
		kind, status         any
		subtotal, tax, total any
	}
	read := func(r reports.Row) docCells {
		return docCells{r.Cells["kind"], r.Cells["status"], r.Cells["subtotal"], r.Cells["tax"], r.Cells["total"]}
	}
	for _, w := range []struct {
		what string
		id   string
		want docCells
	}{
		{"the plain refund", plain.Id, docCells{"refund_receipt", "posted", int64(100000), int64(8710), int64(108710)}},
		{"the payout", payout.Id, docCells{"refund_receipt", "posted", int64(5000), int64(0), int64(5000)}},
	} {
		got, ok := byDoc[w.id]
		if !ok {
			t.Errorf("books.sales_documents has no row for %s %s", w.what, w.id)
			continue
		}
		if read(got) != w.want {
			t.Errorf("%s's row (kind, status, subtotal, tax, total) = %+v, want %+v", w.what, read(got), w.want)
		}
	}
}

// sourceOf is the registered source key, or a failure.
func sourceOf(t *testing.T, app core.App, key string) reports.Source {
	t.Helper()
	for _, s := range reports.Sources(app) {
		if s.Key == key {
			return s
		}
	}
	t.Fatalf("no registered source %s", key)
	return reports.Source{}
}

func fieldOf(src reports.Source, key string) (reports.Field, bool) {
	for _, f := range src.Fields {
		if f.Key == key {
			return f, true
		}
	}
	return reports.Field{}, false
}

func linkOf(src reports.Source, key string) (reports.Link, bool) {
	for _, l := range src.Links {
		if l.Key == key {
			return l, true
		}
	}
	return reports.Link{}, false
}

// The fields and the link the 1099 report reads (1099 report spec §4): the
// card mark, the payment entry of a cash row, the account's box and the
// vendor's 1099 fields. The tax id is in no source.
func TestForm1099SourceFields(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}

	t.Run("books.journal_entries has the card mark", func(t *testing.T) {
		f, ok := fieldOf(sourceOf(t, app, "books.journal_entries"), "card_payment")
		if !ok {
			t.Fatal("books.journal_entries has no field card_payment")
		}
		if f.Type != reports.Bool || f.Label != "Card payment" {
			t.Errorf("card_payment = %s %q, want a yes/no field labelled \"Card payment\"", f.Type, f.Label)
		}
	})

	t.Run("books.basis_lines links a cash row to its payment entry", func(t *testing.T) {
		src := sourceOf(t, app, "books.basis_lines")
		l, ok := linkOf(src, "payment_entry")
		if !ok {
			t.Fatal("books.basis_lines has no link payment_entry")
		}
		if l.Label != "Payment entry" || l.Target != "books.journal_entries" || l.Cardinality != reports.ToOne || l.Field != "payment_entry" {
			t.Errorf("payment_entry = {%q, target %s, %s, field %q}, want {\"Payment entry\", target books.journal_entries, to-one, field \"payment_entry\"}",
				l.Label, l.Target, l.Cardinality, l.Field)
		}
		parts := map[string]reports.SourcePart{}
		for _, p := range src.Parts {
			parts[p.Collection] = p
		}
		if got := parts["books_cash_basis_lines"].Columns["payment_entry"]; got != "payment_entry" {
			t.Errorf("the cash part maps payment_entry to %q, want its payment_entry column", got)
		}
		if got, ok := parts["books_journal_lines"].Columns["payment_entry"]; ok {
			t.Errorf("the ledger part maps payment_entry to %q, want it unmapped (it reads blank)", got)
		}
		if _, ok := parts["books_journal_lines"].Values["payment_entry"]; ok {
			t.Error("the ledger part gives payment_entry a constant, want it unmapped (core refuses a part value for a link key)")
		}
	})

	t.Run("books.accounts has the 1099 box", func(t *testing.T) {
		f, ok := fieldOf(sourceOf(t, app, "books.accounts"), "form_1099_box")
		if !ok {
			t.Fatal("books.accounts has no field form_1099_box")
		}
		if f.Type != reports.Select || f.Label != "1099 box" {
			t.Errorf("form_1099_box = %s %q, want a select labelled \"1099 box\"", f.Type, f.Label)
		}
		want := box1099Options()
		if !reflect.DeepEqual(f.Options, want) {
			t.Errorf("form_1099_box options =\n%v\nwant\n%v", f.Options, want)
		}
		values := make([]string, len(want))
		for i, o := range want {
			values[i] = o.Value
		}
		if !slices.Equal(values, boxes1099) {
			t.Errorf("the option values %v are not boxes1099 %v in order", values, boxes1099)
		}
	})

	t.Run("books.vendors has the 1099 fields and no tax id", func(t *testing.T) {
		src := sourceOf(t, app, "books.vendors")
		for _, w := range []struct {
			key   string
			typ   reports.FieldType
			label string
		}{
			{"track_1099", reports.Bool, "Track payments for 1099"},
			{"legal_name", reports.Text, "Legal name"},
			{"tax_id_type", reports.Select, "Tax ID type"},
		} {
			f, ok := fieldOf(src, w.key)
			if !ok {
				t.Errorf("books.vendors has no field %s", w.key)
				continue
			}
			if f.Type != w.typ || f.Label != w.label {
				t.Errorf("%s = %s %q, want %s %q", w.key, f.Type, f.Label, w.typ, w.label)
			}
		}
		if f, ok := fieldOf(src, "tax_id_type"); ok {
			values := make([]string, len(f.Options))
			for i, o := range f.Options {
				values[i] = o.Value
			}
			if !slices.Equal(values, taxIDTypes) {
				t.Errorf("tax_id_type options %v, want %v (EIN, SSN)", values, taxIDTypes)
			}
		}
		if _, ok := fieldOf(src, "tax_id"); ok {
			t.Error("books.vendors has a field tax_id, want it left out")
		}
	})

	t.Run("no Books source reads tax_id", func(t *testing.T) {
		for _, src := range reports.Sources(app) {
			for _, f := range src.Fields {
				if f.Key == "tax_id" || f.Column == "tax_id" {
					t.Errorf("source %s field %s reads tax_id", src.Key, f.Key)
				}
			}
			for _, p := range src.Parts {
				for key, column := range p.Columns {
					if key == "tax_id" || column == "tax_id" {
						t.Errorf("source %s part %s maps %s to tax_id", src.Key, p.Collection, key)
					}
				}
			}
		}
	})
}

// thresholdByLookup reads the 1099 threshold through a lookup on
// books.settings, one row per account.
const thresholdByLookup = `{"version":4,"source":"books.accounts",
	"columns":[{"id":"name","path":[{"field":"name"}]},
		{"id":"threshold","formula":{"op":"lookup","source":"books.settings",
			"value":{"path":[{"field":"threshold_1099"}]},"pick":"min"}}]}`

// settingsRows lists the settings rows a reader sees.
const settingsRows = `{"version":4,"source":"books.settings",
	"columns":[{"id":"threshold","path":[{"field":"threshold_1099"}]},{"id":"currency","path":[{"field":"currency"}]}]}`

// books.settings is the one Books settings row, under the Books readers' rule:
// the 1099 threshold (an amount in the settings currency) and the currency.
func TestSettingsSource(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	src := sourceOf(t, app, "books.settings")
	if src.Collection != "books_settings" || src.Label != "Books settings" {
		t.Errorf("books.settings collection, label = %q, %q; want books_settings, \"Books settings\"", src.Collection, src.Label)
	}
	var keys []string
	for _, f := range src.Fields {
		if f.Key != "id" {
			keys = append(keys, f.Key)
		}
	}
	sort.Strings(keys)
	if !slices.Equal(keys, []string{"currency", "threshold_1099"}) {
		t.Errorf("books.settings fields = %v, want exactly currency and threshold_1099", keys)
	}
	if f, _ := fieldOf(src, "threshold_1099"); f.Type != reports.Money || f.Currency != "currency" || f.Label != "1099 threshold" {
		t.Errorf("threshold_1099 = %s %q, currency field %q; want an amount labelled \"1099 threshold\" in currency", f.Type, f.Label, f.Currency)
	}
	if f, _ := fieldOf(src, "currency"); f.Type != reports.Text || f.SameCurrencyAs != "books.journal_lines.currency" {
		t.Errorf("currency = %s, SameCurrencyAs %q; want text, the same currency as books.journal_lines.currency", f.Type, f.SameCurrencyAs)
	}

	if err := setFields(t, app, "books_settings", settingsID, map[string]any{"threshold_1099": 250000}); err != nil {
		t.Fatalf("save the threshold: %v", err)
	}
	mkNumberedAccount(t, app, "Design Tools", "6210", "expense", "dues_subscriptions")

	t.Run("a Books reader reads the threshold through a lookup", func(t *testing.T) {
		details, _ := splitRows(t, runAs(t, app, users.readOnly, thresholdByLookup))
		if len(details) != 1 {
			t.Fatalf("%d account rows, want 1", len(details))
		}
		if got, ok := wholeCell(details[0].Cells["threshold"]); !ok || got != 250000 {
			t.Errorf("the lookup's threshold = %v, want 250000 (the settings row)", details[0].Cells["threshold"])
		}
	})

	t.Run("a Books reader reads the one settings row", func(t *testing.T) {
		details, _ := splitRows(t, runAs(t, app, users.readOnly, settingsRows))
		if len(details) != 1 {
			t.Fatalf("%d settings rows for a Books reader, want 1", len(details))
		}
		if got, ok := wholeCell(details[0].Cells["threshold"]); !ok || got != 250000 {
			t.Errorf("threshold = %v, want 250000", details[0].Cells["threshold"])
		}
		if got := details[0].Cells["currency"]; got != "USD" {
			t.Errorf("currency = %v, want USD", got)
		}
	})

	t.Run("a user without Books access reads none", func(t *testing.T) {
		details, _ := splitRows(t, runAs(t, app, users.none, settingsRows))
		if len(details) != 0 {
			t.Errorf("%d settings rows for a user with Books access none, want 0", len(details))
		}
	})
}

// shippedSpecSHA256 is the sha256 of each shipped report's spec JSON before
// the 1099 report's source additions (recorded 2026-11-22 on
// books/p5-1099-report@d5355c4c). Adding a field or a link changes none.
var shippedSpecSHA256 = map[string]string{
	"books.trial_balance":             "19e7ecb3e997db35fa0b40b37aa92a43d5b1113e3dc08096c9b2de1219781be4",
	"books.general_ledger":            "67039989cb7520f2dfd073de18c6f7e9b08fe33cdc2bfd2cade21e9f8e8a784c",
	"books.balance_sheet":             "e0313a980a11913fc30b8ae9ac1f20ebbd953f22d5e0758870ba3c923c4e91a6",
	"books.journal":                   "0c22704590476e368aacf6125216b88aafae8ebca940dae85558feca5972371c",
	"books.profit_and_loss":           "0d0ee1515937f48cd603de7da76769184b921558e4e48759e2d59ed18f36b8d3",
	"books.profit_and_loss_by_month":  "89a1cca7d61b825eef13dcb9a3ae6b1821a727fad0442cdc8a0064e0f45e5983",
	"books.transaction_detail":        "2e4c365f17549ba7b0594e2e6f542bbabd23a49b78f90ec14349720db499a712",
	"books.sales_tax_liability":       "e82a3c515c70380eddbd5c7eb9dbe896cc8e478ed055463d026025aa0e36d3dc",
	"books.customer_balance":          "aff7bd3202130360e0df714fb5bc64af36a70b2bb983124e73d985f80a3c1787",
	"books.ar_aging":                  "4fdcc6fd7ef745a7f1ec641d300e2532cb9a990917915d07c4d3c8b8546cd280",
	"books.ap_aging":                  "fcca5fb271b63c61b211e4f7bb1eeb7e062d66b83adf9aca1af85a4f1898e0e1",
	"books.vendor_balance":            "0a251c1297a0a1f49b499af783060587f7ca34be2b55f04d422a51dace28b332",
	"books.expenses_by_vendor":        "bab952a0eddc89363fbde7ef8fce48c5f2496c56b4b815672d2cd66094a4629d",
	"books.sales_by_customer":         "f4cddc28675db506d709a0ad07f936d599dd91e849d14b5546d0b8b042bc7ebc",
	"books.sales_by_product":          "ac3251b812b61071e29689a41c25a6fb471998def42e1cb4bfc3abf074cfc3e0",
	"books.audit_log":                 "34ad17fa387887d353cb91dd1e37bb3bdc682ccaceb86644bb0df6d8d99548f7",
	"books.statement_balance_forward": "f58b854ec692b8498c49c1fb487eb3192bebf6b774233b1d9fd765d4df2ccdeb",
	"books.statement_open_items":      "eee17337b00fc4b9b9fc010fdeaaa64127fffaabf9a67976331bf579040300e7",
}

func TestSourceAdditionsKeepShippedSpecs(t *testing.T) {
	shipped := []reports.Shipped{
		trialBalanceShipped(), generalLedgerShipped(), balanceSheetShipped(), journalShipped(),
		profitAndLossShipped(), profitAndLossByMonthShipped(), transactionDetailShipped(),
		salesTaxLiabilityShipped(), customerBalanceShipped(), arAgingShipped(), apAgingShipped(),
		vendorBalanceShipped(), expensesByVendorShipped(), salesByCustomerShipped(), salesByProductShipped(),
		auditLogShipped(), statementBalanceForwardShipped(), statementOpenItemsShipped(),
	}
	if len(shipped) != len(shippedSpecSHA256) {
		t.Errorf("%d shipped reports, %d recorded sums", len(shipped), len(shippedSpecSHA256))
	}
	for _, s := range shipped {
		sum := sha256.Sum256(s.Spec)
		got := hex.EncodeToString(sum[:])
		if want, ok := shippedSpecSHA256[s.Key]; !ok || got != want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s", s.Key, got, want)
		}
	}
}

// basisPaymentEntries is the Expenses by Vendor's spec (its account-type and
// period filter on books.basis_lines, the 1099 report's model) that also reads
// each line's payment entry id.
func basisPaymentEntries() *reports.Spec {
	s := expensesByVendorSpec()
	s.Columns = append(s.Columns, reports.Column{
		ID: "pay", Label: "Payment entry", Path: reports.Path{{Link: "payment_entry"}, {Field: "id"}},
	})
	return s
}

// recordRun runs spec as the reader and gives the SELECT statements it ran,
// each once, in their order.
func recordRun(t *testing.T, b apBook, spec *reports.Spec, params map[string]any, opts reports.Options) (*reports.Result, []string) {
	t.Helper()
	loaded, info, err := reports.Load(mustJSON(spec))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	var mu sync.Mutex
	seen := map[string]bool{}
	var statements []string
	var res *reports.Result
	var runErr error
	recordStatements(t, b.app, func(statement string) {
		s := strings.TrimSpace(statement)
		upper := strings.ToUpper(s)
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if !seen[s] {
			seen[s] = true
			statements = append(statements, s)
		}
	}, func() {
		res, runErr = reports.Run(context.Background(), b.app, reports.Request{
			Spec: loaded, Loaded: info, Auth: b.reader, Headers: readerInfo(b.reader).Headers,
			Params: given, Options: opts,
		})
	})
	if runErr != nil {
		t.Fatalf("Run: %v", runErr)
	}
	return res, statements
}

// A filter on the account and the day reaches both parts of books.basis_lines
// though only the cash part maps payment_entry (core E3, the typed blank): each
// part is read by its index, and no statement scans a large table or builds an
// automatic index on one. The runs are the Expenses by Vendor's run 3 (Cash,
// the whole book) and that run with the busiest vendor opened.
func TestBasisLinesPartsKeepTheirIndexes(t *testing.T) {
	b := newAPBook(t)
	data := writeEBVDataset(t, b, apSmall)
	vendorKey := ebvVendorKeyOf(t, b, data, ebvBusiestVendor(t, b))
	params := ebvWith(data, map[string]any{"method": "cash"})

	for _, run := range []arRun{
		{name: "cash, whole book", opts: reports.Options{Today: data.lastDay}, wholeBook: true, reading: "no statistics"},
		{name: "cash, busiest vendor opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{vendorKey}, Collapse: [][]any{}},
			wholeBook: true, adds: true, reading: "no statistics"},
	} {
		t.Run(run.name, func(t *testing.T) {
			res, statements := recordRun(t, b, basisPaymentEntries(), params, run.opts)
			if run.adds {
				paid := 0
				for _, r := range res.Rows {
					if v, ok := r.Cells["pay"].(string); r.Kind == reports.KindDetail && ok && v != "" {
						paid++
					}
				}
				if paid == 0 {
					t.Error("no opened line reads a payment entry, want the cash rows' payment entries")
				}
			}
			steps := explainStatements(t, b.app, statements)
			var plans strings.Builder
			for i, s := range statements {
				own := arStepsOf(steps, i)
				checkPlanBars(t, run, s, own, ebvLargeTables)
				plans.WriteString(arPlanText(own))
			}
			for _, want := range []string{"SEARCH books_journal_lines", "SEARCH " + cashLinesCollection} {
				if !strings.Contains(plans.String(), want) {
					t.Errorf("no statement of the run has %q:\n%s", want, plans.String())
				}
			}
		})
	}
}
