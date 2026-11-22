package books

import (
	"maps"
	"reflect"
	"regexp"
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// The books_reconcile_lines view (reconcile spec §4 Schema, settled
// differences 1 and 2): one row for each posted journal line on a bank or
// credit card account whose entry is posted and is not a void reversal, with
// the line's memo (else the entry's), its payee, its cleared row and whether a
// bank match holds it.

// rvLine is one line of an entry the view tests post, with its memo and party.
type rvLine struct {
	account          *core.Record
	debit, credit    int
	memo             string
	customer, vendor *core.Record
}

// rvPosted saves a manual entry with its memo and lines and posts it.
func rvPosted(t testing.TB, m *bankMatchEnv, date, memo string, lines ...rvLine) *core.Record {
	t.Helper()
	entry := saveRecord(t, m.app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD", "memo": memo,
	})
	for i, l := range lines {
		fields := map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"position": i, "currency": "USD", "memo": l.memo,
		}
		if l.customer != nil {
			fields["customer"] = l.customer.Id
		}
		if l.vendor != nil {
			fields["vendor"] = l.vendor.Id
		}
		saveRecord(t, m.app, "books_journal_lines", fields)
	}
	return mustPost(t, m.app, entry.Id, m.users.bookkeeper.Id)
}

// rvRow is the view row of line, or nil when the view has none.
func rvRow(t testing.TB, app core.App, line *core.Record) *core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(rtView, "id = {:id}", "", 0, 0, dbx.Params{"id": line.Id})
	if err != nil {
		t.Fatalf("read %s: %v", rtView, err)
	}
	if len(rows) == 0 {
		return nil
	}
	return rows[0]
}

func mustViewRow(t testing.TB, app core.App, line *core.Record) *core.Record {
	t.Helper()
	row := rvRow(t, app, line)
	if row == nil {
		t.Fatalf("line %s (entry %s) is not a row of %s", line.Id, line.GetString("entry"), rtView)
	}
	return row
}

func TestReconcileView_Rows(t *testing.T) {
	t.Run("a posted line on a bank account is a row; its expense line is not", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		row := mustViewRow(t, r.app, line)
		got := map[string]any{
			"line": row.GetString("line"), "account": row.GetString("account"), "entry": row.GetString("entry"),
			"date": row.GetString("date"), "debit": row.GetInt("debit"), "credit": row.GetInt("credit"),
			"number": row.GetString("number"), "doc_type": row.GetString("doc_type"),
		}
		want := map[string]any{
			"line": line.Id, "account": r.savings.Id, "entry": entry.Id, "date": "2026-09-05",
			"debit": 1000, "credit": 0, "number": entry.GetString("number"), "doc_type": "journal",
		}
		for k, v := range want {
			if got[k] != v {
				t.Errorf("%s = %v, want %v", k, got[k], v)
			}
		}
		if rvRow(t, r.app, lineOn(t, r.app, entry.Id, r.rent)) != nil {
			t.Error("the line on the expense account is a row of the view")
		}
	})

	t.Run("a credit card line is a row", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.payment(t, "2026-09-05", r.card, 4000)
		if row := mustViewRow(t, r.app, line); row.GetInt("credit") != 4000 {
			t.Errorf("credit = %d, want 4000", row.GetInt("credit"))
		}
	})

	t.Run("a line of a void entry and of its void reversal is not a row", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		voidEntryAs(t, r.app, entry.Id, r.users.bookkeeper.Id)
		rev := findReversal(t, r.app, entry.Id)
		if rvRow(t, r.app, line) != nil {
			t.Error("the void entry's line is a row of the view")
		}
		if rvRow(t, r.app, lineOn(t, r.app, rev.Id, r.savings)) != nil {
			t.Error("the void reversal's line is a row of the view")
		}
	})

	t.Run("a draft line is not a row", func(t *testing.T) {
		r := newRtEnv(t)
		draft := mkDraft(t, r.app, "2026-09-05", ln{r.savings, 1000, 0}, ln{r.rent, 0, 1000})
		if rvRow(t, r.app, lineOn(t, r.app, draft.Id, r.savings)) != nil {
			t.Error("a draft line is a row of the view")
		}
	})

	t.Run("memo is the line's, else the entry's", func(t *testing.T) {
		r := newRtEnv(t)
		withMemo := rvPosted(t, r.bankMatchEnv, "2026-09-05", "Entry memo",
			rvLine{account: r.savings, debit: 1000, memo: "Line memo"}, rvLine{account: r.rent, credit: 1000})
		noMemo := rvPosted(t, r.bankMatchEnv, "2026-09-06", "Entry memo only",
			rvLine{account: r.savings, debit: 2000}, rvLine{account: r.rent, credit: 2000})
		if got := mustViewRow(t, r.app, lineOn(t, r.app, withMemo.Id, r.savings)).GetString("memo"); got != "Line memo" {
			t.Errorf("memo = %q, want the line's %q", got, "Line memo")
		}
		if got := mustViewRow(t, r.app, lineOn(t, r.app, noMemo.Id, r.savings)).GetString("memo"); got != "Entry memo only" {
			t.Errorf("memo = %q, want the entry's %q", got, "Entry memo only")
		}
	})

	t.Run("payee is the customer's or the vendor's display name", func(t *testing.T) {
		r := newRtEnv(t)
		customer := mkCustomer(t, r.app, "Harbor Cafe", "")
		vendor := mkVendor(t, r.app, "Summit Supply")
		fromCustomer := rvPosted(t, r.bankMatchEnv, "2026-09-05", "",
			rvLine{account: r.savings, debit: 1000, customer: customer}, rvLine{account: r.revenue, credit: 1000})
		toVendor := rvPosted(t, r.bankMatchEnv, "2026-09-06", "",
			rvLine{account: r.savings, credit: 500, vendor: vendor}, rvLine{account: r.rent, debit: 500})
		nobody := rvPosted(t, r.bankMatchEnv, "2026-09-07", "",
			rvLine{account: r.savings, debit: 300}, rvLine{account: r.rent, credit: 300})
		for _, c := range []struct {
			entry *core.Record
			want  string
		}{{fromCustomer, "Harbor Cafe"}, {toVendor, "Summit Supply"}, {nobody, ""}} {
			if got := mustViewRow(t, r.app, lineOn(t, r.app, c.entry.Id, r.savings)).GetString("payee"); got != c.want {
				t.Errorf("payee = %q, want %q", got, c.want)
			}
		}
	})

	t.Run("reconciliation and finished follow a cleared row and a finish", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		_, open := r.deposit(t, "2026-09-06", r.savings, 2000)
		row := mustViewRow(t, r.app, line)
		if row.GetString("reconciliation") != "" || row.GetBool("finished") {
			t.Errorf("before a clear: reconciliation %q, finished %v; want '' and false",
				row.GetString("reconciliation"), row.GetBool("finished"))
		}
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.mustClear(t, id, line)
		row = mustViewRow(t, r.app, line)
		if row.GetString("reconciliation") != id || row.GetBool("finished") {
			t.Errorf("cleared: reconciliation %q, finished %v; want %q and false",
				row.GetString("reconciliation"), row.GetBool("finished"), id)
		}
		r.mustFinish(t, id)
		row = mustViewRow(t, r.app, line)
		if row.GetString("reconciliation") != id || !row.GetBool("finished") {
			t.Errorf("finished: reconciliation %q, finished %v; want %q and true",
				row.GetString("reconciliation"), row.GetBool("finished"), id)
		}
		if got := mustViewRow(t, r.app, open).GetString("reconciliation"); got != "" {
			t.Errorf("the line not cleared has reconciliation %q, want ''", got)
		}
	})

	t.Run("bank_matched is true through a bank match and a categorization, false otherwise", func(t *testing.T) {
		c := catEnvOn(t, newBankMatchEnv(t))
		registerReconcile(c.app)
		tr := c.postedTransfer(t, matchBankDay, c.checking, c.savings, 86815)
		matched := lineOn(t, c.app, tr.Id, c.checking)
		c.mustMatch(t, c.bankTxn(t, matchBankDay, -86815, "for_review"), matched)
		cat := c.mustCategorize(t, c.bankTxn(t, catDay, -8647, "for_review"), "categorize",
			[]catLine{{Account: c.rent.Id, Amount: 8647}}, map[string]any{"vendor": c.vendor.Id})
		categorized := lineOn(t, c.app, c.entryOf(t, cat).Id, c.checking)
		loose := c.postedTransfer(t, matchBankDay, c.checking, c.savings, 1200)
		looseLine := lineOn(t, c.app, loose.Id, c.checking)

		if !mustViewRow(t, c.app, matched).GetBool("bank_matched") {
			t.Error("a line matched through books_bank_matches is not bank_matched")
		}
		if !mustViewRow(t, c.app, categorized).GetBool("bank_matched") {
			t.Error("the bank line of a categorization's entry is not bank_matched")
		}
		if mustViewRow(t, c.app, looseLine).GetBool("bank_matched") {
			t.Error("a line with no match is bank_matched")
		}
		if mustViewRow(t, c.app, lineOn(t, c.app, tr.Id, c.savings)).GetBool("bank_matched") {
			t.Error("the other side of a matched transfer is bank_matched")
		}
	})

	t.Run("origin and document are the entry's", func(t *testing.T) {
		m, bp := newBankMatchDocsEnv(t)
		registerReconcile(m.app)
		exp := bp.mkExpense(t, map[string]any{"vendor": bp.summit.Id})
		mkExpenseLine(t, m.app, exp, 0, accountLine(bp.software, 13837))
		posted := mustPostExpense(t, m.app, exp.Id, m.users.bookkeeper.Id)
		entry := reload(t, m.app, "books_journal_entries", posted.GetString("entry"))
		row := mustViewRow(t, m.app, lineOn(t, m.app, entry.Id, m.checking))
		if row.GetString("document") != exp.Id || entry.GetString("document") != exp.Id {
			t.Errorf("document = %q (entry %q), want the expense %q", row.GetString("document"), entry.GetString("document"), exp.Id)
		}
		if row.GetString("origin") != entry.GetString("origin") || row.GetString("origin") == "" {
			t.Errorf("origin = %q, want the entry's %q", row.GetString("origin"), entry.GetString("origin"))
		}
		if row.GetString("doc_type") != "expense" {
			t.Errorf("doc_type = %q, want expense", row.GetString("doc_type"))
		}
		if row.GetString("payee") != "Summit Supply" && row.GetString("payee") != bp.summit.GetString("display_name") {
			t.Errorf("payee = %q, want the vendor's display name %q", row.GetString("payee"), bp.summit.GetString("display_name"))
		}
	})
}

// Each computed column has the type the client reads: PocketBase types an
// uncast expression as json.
func TestReconcileView_ColumnTypes(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(rtView)
	if err != nil {
		t.Fatalf("the %s view does not exist: %v", rtView, err)
	}
	if col.Type != core.CollectionTypeView {
		t.Fatalf("%s is a %s collection, want a view", rtView, col.Type)
	}
	types := map[string]string{}
	for _, f := range col.Fields {
		types[f.GetName()] = f.Type()
	}
	want := map[string][]string{
		"memo":           {core.FieldTypeText},
		"payee":          {core.FieldTypeText},
		"reconciliation": {core.FieldTypeText, core.FieldTypeRelation},
		"finished":       {core.FieldTypeBool},
		"bank_matched":   {core.FieldTypeBool},
		"debit":          {core.FieldTypeNumber},
		"credit":         {core.FieldTypeNumber},
		"date":           {core.FieldTypeText},
		"number":         {core.FieldTypeText},
		"doc_type":       {core.FieldTypeSelect, core.FieldTypeText},
		"origin":         {core.FieldTypeSelect, core.FieldTypeText},
		"document":       {core.FieldTypeText},
		"line":           {core.FieldTypeRelation, core.FieldTypeText},
		"account":        {core.FieldTypeRelation, core.FieldTypeText},
		"entry":          {core.FieldTypeRelation, core.FieldTypeText},
	}
	for name, allowed := range want {
		got, ok := types[name]
		if !ok {
			t.Errorf("%s has no %s column", rtView, name)
			continue
		}
		if !slices.Contains(allowed, got) {
			t.Errorf("%s.%s is a %q field, want one of %v", rtView, name, got, allowed)
		}
	}
	for rule, got := range map[string]*string{"create": col.CreateRule, "update": col.UpdateRule, "delete": col.DeleteRule} {
		if got != nil {
			t.Errorf("%s %s rule = %q, want nil (nobody writes the view)", rtView, rule, *got)
		}
	}
}

// planOf is the EXPLAIN QUERY PLAN of sql, one detail line for each step.
func planOf(t testing.TB, app core.App, sql string, params dbx.Params) []string {
	t.Helper()
	var plan []struct {
		ID      int    `db:"id"`
		Parent  int    `db:"parent"`
		NotUsed int    `db:"notused"`
		Detail  string `db:"detail"`
	}
	if err := app.DB().NewQuery("EXPLAIN QUERY PLAN " + sql).Bind(params).All(&plan); err != nil {
		t.Fatal(err)
	}
	details := make([]string, 0, len(plan))
	for _, step := range plan {
		details = append(details, step.Detail)
	}
	return details
}

// The screen's lines query filters the view by account and statement date. It
// must seek books_journal_lines by account (the view's alias l) and never scan
// it; no index name is pinned, because several indexes start with account.
const rvScreenQuery = "SELECT * FROM books_reconcile_lines WHERE account = {:a} AND date <= {:d}"

var (
	rvSearchLinesByAccount = regexp.MustCompile(`^SEARCH (l|books_journal_lines) USING .*\(account=\?`)
	rvScanLines            = regexp.MustCompile(`^SCAN (l|books_journal_lines)\b`)
)

func requireLinesSeekByAccount(t testing.TB, details []string) {
	t.Helper()
	seek := false
	for _, d := range details {
		if rvScanLines.MatchString(d) {
			t.Fatalf("the lines query scans books_journal_lines: %q", details)
		}
		seek = seek || rvSearchLinesByAccount.MatchString(d)
	}
	if !seek {
		t.Fatalf("no plan step seeks books_journal_lines by account=?: %q", details)
	}
}

func TestReconcileView_ScreenQuerySeeksTheLinesByAccount(t *testing.T) {
	r := newRtEnv(t)
	r.deposit(t, "2026-09-05", r.savings, 1000)
	params := dbx.Params{"a": r.savings.Id, "d": "2026-09-30"}
	requirePlanStep(t, r.app, "SELECT * FROM books_reconcile_lines WHERE account = {:a} AND date <= {:d}", params,
		"SCAN l", "SEARCH l USING")
	requireLinesSeekByAccount(t, planOf(t, r.app, rvScreenQuery, params))
}

// The view is live through core's change signal over every collection its
// SQL reads, and CheckViews accepts it on an app wired as production is.
func TestReconcileView_IsLive(t *testing.T) {
	changesignal.ResetForTesting()
	app, _ := newRegisteredApp(t)
	want := []string{
		"books_accounts", "books_bank_match_lines", "books_customers", "books_journal_entries",
		"books_journal_lines", "books_reconciliation_lines", "books_reconciliations", "books_vendors",
	}
	got, ok := changesignal.RegisteredViews()[rtView]
	if !ok {
		t.Fatalf("Register did not register the %s view; registered views: %v",
			rtView, slices.Sorted(maps.Keys(changesignal.RegisteredViews())))
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("registered sources of %s = %v, want %v", rtView, got, want)
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}
}
