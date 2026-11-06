package books

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"slices"
	"sort"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// registerBooksSources empties core's report registry and registers Books'
// sources as Register does, so each test sees only Books' sources.
func registerBooksSources(t *testing.T) {
	t.Helper()
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	for _, s := range reportSources() {
		reports.RegisterSource(s)
	}
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
	"books.customers",
	"books.journal_entries",
	"books.journal_lines",
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
			},
			links: []wantLink{
				toOne("parent", "books.accounts", "parent"),
				toMany("sub_accounts", "books.accounts", "parent"),
				toMany("lines", "books.journal_lines", "account"),
				toMany("balances", "books.account_balances", "account"),
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
				{key: "doc_type", typ: reports.Select, options: []reports.Option{{Value: "journal", Label: "Journal entry"}}},
				textMinMax("number"),
				// The posting order behind number, so opened lines sort 9 before 10.
				{key: "sequence", typ: reports.Number, label: "Sequence"},
				text("memo"), money("total"), text("currency"),
				{key: "auto_reverse_on", typ: reports.Date, textDay: true},
				{key: "posted_at", typ: reports.DateTime, aggs: reports.MinMax},
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
			},
			links: []wantLink{
				toOne("entry", "books.journal_entries", "entry"),
				toOne("account", "books.accounts", "account"),
			},
		},
		{
			key: "books.account_balances", collection: "books_account_balances", label: "Monthly account balances",
			fields: []wantField{
				{key: "period", typ: reports.Text, aggs: reports.MinMax, label: "Month"},
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
			},
		},
	}
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
	"sort_key", "name_key", "form", "form_1099_box", "position", "close_override",
	"billing_address", "shipping_address", "fields",
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
			if src.Currency != nil {
				t.Errorf("Source.Currency is set; each money field names its row's currency column")
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
			checkLeftOut(t, app, src, users.Id)
		})
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
		if f.Column != w.key {
			t.Errorf("field %s reads column %q, want %q", w.key, f.Column, w.key)
		}
		if f.Type != w.typ {
			t.Errorf("field %s type = %s, want %s", w.key, f.Type, w.typ)
		}
		if !reflect.DeepEqual(aggsOf(f.Aggregates), aggsOf(w.aggs)) {
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
		if !reflect.DeepEqual(f.Options, w.options) {
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
}

// debitToDay sums the debit of every journal line dated on or before the day.
const debitToDay = `{"version":2,"source":"books.journal_lines",
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
	for _, topic := range []string{"collection/books_journal_lines", "collection/books_settings"} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}

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
