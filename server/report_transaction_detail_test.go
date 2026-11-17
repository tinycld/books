package books

import (
	"context"
	"encoding/json"
	"maps"
	"os"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// tdToday is the reader's day in every run, so presets never move with the
// clock.
const tdToday = "2026-11-04"

// runTD loads the shipped Transaction Detail by Account and runs it as reader,
// as core's run endpoint does: Load, then Run with the posted params.
func runTD(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	spec, info, err := reports.Load(transactionDetailShipped().Spec)
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
	res, err := reports.Run(context.Background(), app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: reader,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

func tdRun(t *testing.T, app core.App, reader *core.Record, params map[string]any) *reports.Result {
	t.Helper()
	return runTD(t, app, reader, params, reports.Options{Today: tdToday})
}

// tdAmountOf is a row's Amount: it must hold an amount.
func tdAmountOf(t *testing.T, r reports.Row) int64 {
	t.Helper()
	v, ok := moneyCell(t, r, "amount")
	if !ok {
		t.Fatalf("%s (%s) has a blank Amount, want an amount", r.Label, r.Kind)
	}
	return v
}

func tdAmounts(t *testing.T, rows []reports.Row) []int64 {
	t.Helper()
	out := make([]int64, len(rows))
	for i, r := range rows {
		out[i] = tdAmountOf(t, r)
	}
	return out
}

func tdSum(t *testing.T, rows []reports.Row) int64 {
	t.Helper()
	var sum int64
	for _, v := range tdAmounts(t, rows) {
		sum += v
	}
	return sum
}

func tdDetailRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			out = append(out, r)
		}
	}
	return out
}

func tdGroupRows(res *reports.Result) []reports.Row {
	var out []reports.Row
	for _, r := range res.Rows {
		if r.Kind == reports.KindGroup {
			out = append(out, r)
		}
	}
	return out
}

func TestTransactionDetailSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := transactionDetailShipped()
	if transactionDetailKey != "books.transaction_detail" || shipped.Key != transactionDetailKey {
		t.Errorf("key = %q (const %q), want books.transaction_detail", shipped.Key, transactionDetailKey)
	}
	if shipped.Title != "Transaction Detail by Account" {
		t.Errorf("title = %q, want Transaction Detail by Account", shipped.Title)
	}
	if shipped.Description != "Posted lines of chosen accounts for a period, grouped by account." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 2 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 2 (the Method param), shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	if !jsonEqual(t, shipped.Spec, string(mustJSON(transactionDetailSpec()))) {
		t.Errorf("the shipped spec is not transactionDetailSpec()")
	}

	spec, _, err := reports.Load(shipped.Spec)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if spec.Version != reports.CurrentVersion {
		t.Errorf("version %d, want %d", spec.Version, reports.CurrentVersion)
	}
	if spec.Source != "books.basis_lines" {
		t.Errorf("source = %q, want books.basis_lines", spec.Source)
	}
	if err := reports.Validate(app, spec); err != nil {
		t.Errorf("Validate: %v", err)
	}

	ids := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		ids[i] = p.ID
	}
	if !reflect.DeepEqual(ids, []string{"period", "method", "accounts"}) {
		t.Errorf("params = %v, want period, method, accounts (the chips' order)", ids)
	}
	if method, ok := findParam(spec, "method"); !ok || !reflect.DeepEqual(method, methodParam()) {
		t.Errorf("method = %+v, want methodParam() %+v", method, methodParam())
	}
	if period, ok := findParam(spec, "period"); !ok || period.Type != reports.ParamDateRange || period.Label != "Period" ||
		!jsonEqual(t, period.Default, `{"preset":"thisMonthToDate"}`) {
		t.Errorf("period = %+v (default %s), want a date range \"Period\" defaulting to This month to date", period, period.Default)
	}

	shared := accountsParam()
	wantFrom := &reports.OptionsFrom{
		Source:     "books.accounts",
		Value:      reports.Path{{Field: "id"}},
		Label:      reports.Path{{Field: "full_name"}},
		Group:      reports.Path{{Field: "type"}},
		GroupOrder: &reports.GroupOrder{By: reports.GroupOrderDeclared},
		GroupLabel: "All {group} accounts",
	}
	if shared.ID != "accounts" || shared.Type != reports.ParamChoice || shared.Label != "Accounts" || !shared.Multiple ||
		shared.Default != nil || !reflect.DeepEqual(shared.OptionsFrom, wantFrom) {
		t.Errorf("accountsParam() = %+v (optionsFrom %+v), want the multiple choice \"Accounts\" with no default, from %+v", shared, shared.OptionsFrom, wantFrom)
	}
	if got, ok := findParam(transactionDetailSpec(), "accounts"); !ok || !reflect.DeepEqual(got, shared) {
		t.Errorf("Transaction Detail's accounts = %+v, want accountsParam() %+v", got, shared)
	}
	if got, ok := findParam(trialBalanceSpec(), "accounts"); !ok || !reflect.DeepEqual(got, shared) {
		t.Errorf("the Trial Balance's accounts = %+v, want accountsParam() %+v", got, shared)
	}

	type head struct{ id, label string }
	var cols []head
	for _, c := range spec.Columns {
		cols = append(cols, head{c.ID, c.Label})
	}
	wantCols := []head{
		{"account", "Account / Date"}, {"type", "Type"}, {"number", "No."}, {"name", "Name"},
		{"description", "Description"}, {"split", "Split"}, {"amount", "Amount"},
	}
	if !reflect.DeepEqual(cols, wantCols) {
		t.Errorf("columns = %v, want %v", cols, wantCols)
	}
	for _, c := range spec.Columns {
		if c.ID == "amount" && c.Aggregate != reports.Sum {
			t.Errorf("amount aggregate = %q, want %q", c.Aggregate, reports.Sum)
		}
	}

	if len(spec.Groups) != 1 {
		t.Fatalf("groups = %+v, want one section per account", spec.Groups)
	}
	g := spec.Groups[0]
	if g.ID != "byAccount" || g.Col != "account" || !g.Open || !g.Subtotals {
		t.Errorf("group = id %q col %q open %v subtotals %v; want byAccount on account, open, with subtotals", g.ID, g.Col, g.Open, g.Subtotals)
	}

	if spec.Detail == nil {
		t.Fatalf("detail = nil, want label [date] and open entryOpenPath()")
	}
	if got := string(mustJSON(spec.Detail.Label)); got != `{"path":[{"field":"date"}]}` {
		t.Errorf("detail.label = %s, want the date", got)
	}
	if entryOpenPath() == nil {
		t.Errorf("entryOpenPath() = nil, want the entry route formula")
	}
	if got, want := string(mustJSON(spec.Detail.Open)), string(mustJSON(entryOpenPath())); spec.Detail.Open == nil || got != want {
		t.Errorf("detail.open = %s, want entryOpenPath() %s", got, want)
	}

	// Copied from the fixture's TRANSACTION_DETAIL_DISPLAY (Go cannot read the
	// TS fixture): a change to either side updates both in one commit.
	if spec.Display == nil {
		t.Fatalf("display = nil, want the one-line gate, the column fit and the mobile and tablet layouts")
	}
	if spec.Display.OneLine == nil || spec.Display.OneLine.MinWidth != "960px" {
		t.Errorf("display.oneLine = %+v, want minWidth \"960px\"", spec.Display.OneLine)
	}
	grow := 2
	wantFit := map[string]reports.ColumnFit{
		"type":        {MinWidth: "12ch"},
		"number":      {MinWidth: "max-content"},
		"name":        {MinWidth: "16ch"},
		"split":       {MinWidth: "20ch"},
		"description": {FlexGrow: &grow},
		"amount":      {MinWidth: "max-content"},
	}
	if !reflect.DeepEqual(spec.Display.Columns, wantFit) {
		t.Errorf("display.columns = %s, want type 12ch, number and amount max-content, name 16ch, split 20ch, description flexGrow 2", mustJSON(spec.Display.Columns))
	}
	type layout struct {
		width, minWidth string
		tracks          int
		cells           []glCell
	}
	want := []layout{
		{"mobile", "", 3, []glCell{
			{"account", 1, 0, 1, 1}, {"type", 1, 0, 1, 1}, {"number", 1, 0, 1, 1},
			{"name", 2, 0, 1, 1}, {"description", 2, 0, 2, 1},
			{"split", 3, 0, 2, 1}, {"amount", 3, 0, 1, 1},
		}},
		{"tablet", "600px", 12, []glCell{
			{"account", 1, 0, 3, 1}, {"type", 1, 0, 3, 1}, {"number", 1, 0, 2, 1}, {"amount", 1, 0, 4, 1},
			{"name", 2, 0, 3, 1}, {"description", 2, 0, 5, 1}, {"split", 2, 0, 4, 1},
		}},
	}
	var got []layout
	for _, l := range spec.Display.Layouts {
		cells := make([]glCell, len(l.Cells))
		for i, c := range l.Cells {
			cells[i] = glCellOf(c)
		}
		got = append(got, layout{l.Width, l.MinWidth, l.Tracks, cells})
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("display.layouts = %+v\nwant %+v", got, want)
	}
}

// Sections come by type rank, then number, then full name (the Trial
// Balance's keys). The numbers and names are chosen so that each key alone
// gives a different order: the asset's number sorts last, and the expense
// with no number sorts last by name.
func TestTransactionDetailChartOrder(t *testing.T) {
	b := newGLBook(t)
	operating := plAccount(t, b.app, "Operating", "9000", "bank", "checking", "")
	design := plAccount(t, b.app, "Design income", "4000", "income", "service_income", "")
	supplies := plAccount(t, b.app, "Supplies", "6100", "expense", "office_general", "")
	zoo := plAccount(t, b.app, "Zoo fees", "", "expense", "bank_charges", "")
	b.post(t, "2026-11-02", ln{supplies, 1000, 0}, ln{zoo, 500, 0}, ln{design, 0, 1500})
	b.post(t, "2026-11-03", ln{operating, 2000, 0}, ln{design, 0, 2000})

	res := tdRun(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")})
	secs := glSections(t, res)
	if got, want := sectionIDs(t, secs), idsOf(operating, design, zoo, supplies); !reflect.DeepEqual(got, want) {
		t.Fatalf("sections = %v, want [9000 Operating, 4000 Design income, Zoo fees, 6100 Supplies]", sectionLabels(secs))
	}
	wantLabels := []string{"9000 Operating", "4000 Design income", "Zoo fees", "6100 Supplies"}
	if got := sectionLabels(secs); !reflect.DeepEqual(got, wantLabels) {
		t.Errorf("section labels = %q, want %q (\"<number> <full name>\", the full name alone with no number, no count)", got, wantLabels)
	}
	for _, s := range secs {
		if s.total == nil || s.total.Label != "Total "+s.head.Label {
			t.Errorf("%s's subtotal = %+v, want \"Total %s\"", s.head.Label, s.total, s.head.Label)
		}
		if len(s.lines) == 0 {
			t.Errorf("%s shows no line with no Expand; want every section open", s.head.Label)
		}
	}
}

// Inside a section, lines come by date, then the entry's posting time, then
// the line's position. Each tie is set so that the next key (or the record id)
// gives the other order.
func TestTransactionDetailLines(t *testing.T) {
	pe := newBillPostingEnv(t)
	registerBooksSources(t)
	app, reader := pe.app, pe.users.readOnly
	operating := plAccount(t, app, "Operating", "1000", "bank", "checking", "")
	office := plAccount(t, app, "Office supplies", "6100", "expense", "office_general", "")
	postage := plAccount(t, app, "Postage", "6150", "expense", "office_general", "")
	customer := mkCustomer(t, app, "Northwind Traders", "")
	vendor := mkVendor(t, app, "Paper Supply Co")

	// Created first, posted second: posting order is the reverse of creation.
	createdFirst := saveJournalDraft(t, app, "tdlinesentrya01", "2026-11-05", "Created first",
		jnLine{id: "tdlinesline0001", account: office, debit: 100},
		jnLine{account: operating, credit: 100, position: 1})
	createdSecond := saveJournalDraft(t, app, "tdlinesentryb02", "2026-11-05", "Created second",
		jnLine{id: "tdlinesline0002", account: office, debit: 200},
		jnLine{account: operating, credit: 200, position: 1})
	mustPost(t, app, createdSecond.Id, "")
	mustPost(t, app, createdFirst.Id, "")
	setPostedAt(t, app, createdSecond.Id, "2026-11-05 09:00:00.000Z")
	setPostedAt(t, app, createdFirst.Id, "2026-11-05 10:00:00.000Z")
	// Two lines of one entry on one account: position 0's id sorts after
	// position 1's.
	postJournal(t, app, "tdlinesentryc03", "2026-11-06", "Two on one",
		jnLine{id: "tdlinesline0009", account: office, debit: 300, position: 0},
		jnLine{id: "tdlinesline0008", account: office, debit: 400, position: 1},
		jnLine{account: operating, credit: 700, position: 2})
	// The earliest day, posted last.
	early := postJournal(t, app, "tdlinesentryd04", "2026-11-02", "Entry memo",
		jnLine{id: "tdlinesline0010", account: office, debit: 1200, memo: "Toner", customer: customer.Id},
		jnLine{account: operating, credit: 1200, position: 1, vendor: vendor.Id})
	threeWays := postJournal(t, app, "", "2026-11-07", "Three ways",
		jnLine{account: office, debit: 300}, jnLine{account: postage, debit: 200, position: 1},
		jnLine{account: operating, credit: 500, position: 2})
	transfer := mustPost(t, app, transferDraft(t, app, "2026-11-08", operating, pe.checking, 2500).Id, "")
	bill := mkBill(t, app, pe.summit, nil)
	mkBillLine(t, app, bill, 0, accountLine(pe.software, 12000))
	billEntry := reload(t, app, "books_journal_entries", mustPostBill(t, app, bill.Id, pe.users.bookkeeper.Id).GetString("entry"))

	res := tdRun(t, app, reader, map[string]any{"period": glAllDates})
	officeLines := lineIDs(sectionFor(t, res, office).lines)
	wantOrder := []string{
		"tdlinesline0010", // 11-02
		"tdlinesline0002", // 11-05, posted first
		"tdlinesline0001", // 11-05, posted second
		"tdlinesline0009", // 11-06, position 0
		"tdlinesline0008", // 11-06, position 1
		entryLineOn(t, app, threeWays.Id, office).Id,
	}
	if !slices.Equal(officeLines, wantOrder) {
		t.Errorf("Office supplies lines = %v, want %v (date, then posting time, then position)", officeLines, wantOrder)
	}

	type cols struct{ typ, number, name, description, split string }
	read := func(r reports.Row) cols {
		return cols{
			typ: textCell(t, r, "type"), number: textCell(t, r, "number"), name: textCell(t, r, "name"),
			description: textCell(t, r, "description"), split: textCell(t, r, "split"),
		}
	}
	early = reload(t, app, "books_journal_entries", early.Id)
	threeWays = reload(t, app, "books_journal_entries", threeWays.Id)
	transfer = reload(t, app, "books_journal_entries", transfer.Id)
	for _, w := range []struct {
		what string
		row  reports.Row
		want cols
	}{
		{"the entry's Office supplies line (line memo, customer)", lineRow(t, res, entryLineOn(t, app, early.Id, office)),
			cols{"Journal entry", early.GetString("number"), "Northwind Traders", "Toner", "Operating"}},
		{"the entry's Operating line (entry memo, vendor)", lineRow(t, res, entryLineOn(t, app, early.Id, operating)),
			cols{"Journal entry", early.GetString("number"), "Paper Supply Co", "Entry memo", "Office supplies"}},
		{"the 3-line entry's Postage line", lineRow(t, res, entryLineOn(t, app, threeWays.Id, postage)),
			cols{"Journal entry", threeWays.GetString("number"), "", "Three ways", "-Split-"}},
		{"the transfer's Checking line", lineRow(t, res, entryLineOn(t, app, transfer.Id, pe.checking)),
			cols{"Transfer", transfer.GetString("number"), "", "", "Operating"}},
	} {
		if got := read(w.row); got != w.want {
			t.Errorf("%s = %+v\nwant %+v", w.what, got, w.want)
		}
	}
	billLine := lineRow(t, res, entryLineOn(t, app, billEntry.Id, pe.software))
	if got := textCell(t, billLine, "type"); got != "Bill" {
		t.Errorf("the bill's Software line Type = %q, want Bill", got)
	}
	if got := textCell(t, billLine, "number"); got == "" || got != billEntry.GetString("number") {
		t.Errorf("the bill's Software line No. = %q, want the entry's number %q", got, billEntry.GetString("number"))
	}
}

// Amount is the line by its account's normal side; a section total adds its
// lines, and the report Total adds every shown amount.
func TestTransactionDetailNormalSide(t *testing.T) {
	b := newGLBook(t)
	bank := plAccount(t, b.app, "Operating", "1000", "bank", "checking", "")
	income := plAccount(t, b.app, "Design income", "4000", "income", "service_income", "")
	expense := plAccount(t, b.app, "Software", "6100", "expense", "dues_subscriptions", "")
	b.post(t, "2026-11-02", ln{expense, 12000, 0}, ln{bank, 0, 12000})
	b.post(t, "2026-11-03", ln{bank, 3000, 0}, ln{expense, 0, 3000})
	b.post(t, "2026-11-04", ln{bank, 50000, 0}, ln{income, 0, 50000})
	period := glPeriod("2026-11-01", "2026-11-30")

	all := tdRun(t, b.app, b.reader, map[string]any{"period": period})
	for _, w := range []struct {
		account *core.Record
		lines   []int64
	}{
		{expense, []int64{12000, -3000}},
		{income, []int64{50000}},
		{bank, []int64{-12000, 3000, 50000}},
	} {
		s := sectionFor(t, all, w.account)
		if got := tdAmounts(t, s.lines); !slices.Equal(got, w.lines) {
			t.Errorf("%s amounts = %v, want %v (by the account's normal side)", s.head.Label, got, w.lines)
		}
		if s.total == nil {
			t.Fatalf("%s has no total row", s.head.Label)
		}
		if got, want := tdAmountOf(t, *s.total), tdSum(t, s.lines); got != want {
			t.Errorf("%s total = %d, want the sum of its lines %d", s.head.Label, got, want)
		}
	}

	chosen := tdRun(t, b.app, b.reader, map[string]any{"period": period, "accounts": idsOf(expense, income)})
	if got := sectionIDs(t, glSections(t, chosen)); !sameAccounts(got, idsOf(expense, income)) {
		t.Fatalf("sections = %v, want Software and Design income", sectionLabels(glSections(t, chosen)))
	}
	total := totalOf(t, chosen)
	if total.Label != "Total" {
		t.Errorf("total label = %q, want Total", total.Label)
	}
	if got, want := tdAmountOf(t, total), tdSum(t, tdDetailRows(chosen)); got != want || got != 9000+50000 {
		t.Errorf("Total = %d, want every shown amount added: %d (9000 + 50000)", got, want)
	}
}

// Only posted lines dated in the period show; a void and its void reversal
// both show and cancel.
func TestTransactionDetailPostedOnly(t *testing.T) {
	b := newGLBook(t)
	operating := plAccount(t, b.app, "Operating", "1000", "bank", "checking", "")
	rent := plAccount(t, b.app, "Office rent", "6000", "expense", "rent_lease", "")
	kept := b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	draft := mkDraft(t, b.app, "2026-08-05", ln{rent, 999, 0}, ln{operating, 0, 999})
	outside := b.post(t, "2026-09-02", ln{rent, 555, 0}, ln{operating, 0, 555})
	voided := b.post(t, "2026-08-06", ln{rent, 7000, 0}, ln{operating, 0, 7000})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	voidReversal := findReversal(t, b.app, voided.Id)

	res := tdRun(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-08-01", "2026-08-31")})
	if hasLineRow(res, entryLineOn(t, b.app, draft.Id, rent)) {
		t.Errorf("the draft's line shows")
	}
	if hasLineRow(res, entryLineOn(t, b.app, outside.Id, rent)) {
		t.Errorf("the line dated after the period shows")
	}
	for name, entry := range map[string]*core.Record{"posted": kept, "voided": voided, "void reversal": voidReversal} {
		if !hasLineRow(res, entryLineOn(t, b.app, entry.Id, rent)) {
			t.Errorf("the %s entry's Office rent line does not show", name)
		}
	}
	s := sectionFor(t, res, rent)
	if s.total == nil {
		t.Fatalf("%s has no total row", s.head.Label)
	}
	if got := tdAmountOf(t, *s.total); got != 4000 {
		t.Errorf("%s total = %d, want 4000 (the void pair cancels)", s.head.Label, got)
	}
}

func TestTransactionDetailAccounts(t *testing.T) {
	b := newGLBook(t)
	operating := plAccount(t, b.app, "Operating", "1000", "bank", "checking", "")
	sales := plAccount(t, b.app, "Sales", "4000", "income", "service_income", "")
	software := plAccount(t, b.app, "Software", "6100", "expense", "dues_subscriptions", "")
	travel := plAccount(t, b.app, "Travel", "6200", "expense", "travel", "")
	plAccount(t, b.app, "Meals", "6300", "expense", "meals", "") // no line
	b.post(t, "2026-10-05", ln{software, 1500, 0}, ln{operating, 0, 1500})
	b.post(t, "2026-10-06", ln{travel, 4000, 0}, ln{operating, 0, 4000})
	b.post(t, "2026-10-07", ln{operating, 9000, 0}, ln{sales, 0, 9000})
	period := glPeriod("2026-10-01", "2026-10-31")

	one := tdRun(t, b.app, b.reader, map[string]any{"period": period, "accounts": []string{software.Id}})
	if got := sectionIDs(t, glSections(t, one)); !reflect.DeepEqual(got, idsOf(software)) {
		t.Errorf("one account's sections = %v, want only Software", sectionLabels(glSections(t, one)))
	}
	group := tdRun(t, b.app, b.reader, map[string]any{"period": period, "accounts": []any{map[string]any{"group": "expense"}}})
	if got := sectionIDs(t, glSections(t, group)); !sameAccounts(got, idsOf(software, travel)) {
		t.Errorf("All expense accounts' sections = %v, want Software and Travel (Meals has no line)", sectionLabels(glSections(t, group)))
	}
	every := tdRun(t, b.app, b.reader, map[string]any{"period": period})
	if got := sectionIDs(t, glSections(t, every)); !sameAccounts(got, idsOf(operating, sales, software, travel)) {
		t.Errorf("no-accounts sections = %v, want every account with a line in the period", sectionLabels(glSections(t, every)))
	}

	empty := tdRun(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-09-01", "2026-09-30")})
	if secs := glSections(t, empty); len(secs) != 0 {
		t.Errorf("a period with no line has sections %v, want none", sectionLabels(secs))
	}
	if v, has := totalOf(t, empty).Cells["amount"]; has && v != nil {
		t.Errorf("the empty run's Total amount = %#v, want blank", v)
	}
}

// entryRoutesFile reads server/entry_routes.json itself, so a new row is
// covered by the test with no change to it.
func entryRoutesFile(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile("entry_routes.json")
	if err != nil {
		t.Fatalf("read entry_routes.json: %v", err)
	}
	var routes map[string]string
	if err := json.Unmarshal(raw, &routes); err != nil {
		t.Fatalf("parse entry_routes.json: %v", err)
	}
	if len(routes) == 0 {
		t.Fatalf("entry_routes.json holds no route")
	}
	return routes
}

// tdPosted is one posted entry built for an open-path check: the app it lives
// in, the reader who runs the report, the entry, the account of the line read,
// and the document the entry posted ("" for none).
type tdPosted struct {
	app      core.App
	reader   *core.Record
	entry    string
	account  *core.Record
	document string
}

// tdDocumentPosters build a posted document of each doc_type in
// entry_routes.json, each in its own app.
var tdDocumentPosters = map[string]func(t *testing.T) tdPosted{
	"invoice": func(t *testing.T) tdPosted {
		b := newGLBook(t)
		registerSalesDocGuards(b.app, invoiceKind)
		ie := invoiceEnvOn(t, b.env)
		plAccount(t, b.app, "Receivables", "1200", "accounts_receivable", "accounts_receivable", "")
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, b.app, inv, 0, item(ie.service, 1, 45000, false))
		entry := mustPostInvoice(t, b.app, inv.Id, b.env.users.bookkeeper.Id).GetString("entry")
		return tdPosted{b.app, b.reader, entry, b.env.revenue, inv.Id}
	},
	"sales_receipt": func(t *testing.T) tdPosted {
		re := newReceiptEnv(t)
		registerBooksSources(t)
		r := re.mkReceipt(t, map[string]any{"deposit_to": re.checking.Id})
		mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
		entry := mustPostReceipt(t, re.app, r.Id, re.users.bookkeeper.Id).GetString("entry")
		return tdPosted{re.app, re.users.readOnly, entry, re.checking, r.Id}
	},
	"bill": func(t *testing.T) tdPosted {
		pe := newBillPostingEnv(t)
		registerBooksSources(t)
		bill := mkBill(t, pe.app, pe.summit, nil)
		mkBillLine(t, pe.app, bill, 0, accountLine(pe.software, 12000))
		entry := mustPostBill(t, pe.app, bill.Id, pe.users.bookkeeper.Id).GetString("entry")
		return tdPosted{pe.app, pe.users.readOnly, entry, pe.software, bill.Id}
	},
	"expense": func(t *testing.T) tdPosted {
		ee := newExpenseEnv(t)
		registerBooksSources(t)
		exp := ee.mkExpense(t, map[string]any{"vendor": ee.officeSupply.Id, "paid_from": ee.card2100.Id, "payment_method": "credit_card"})
		mkExpenseLine(t, ee.app, exp, 0, accountLine(ee.designTools, 6418))
		entry := mustPostExpense(t, ee.app, exp.Id, ee.users.bookkeeper.Id).GetString("entry")
		return tdPosted{ee.app, ee.users.readOnly, entry, ee.designTools, exp.Id}
	},
	"payment": func(t *testing.T) tdPosted {
		pe := newPaymentEnv(t)
		registerBooksSources(t)
		inv := pe.postedInvoice(t, pe.customer, 45000)
		p := pe.mkPayment(t, map[string]any{"amount": 45000, "deposit_to": pe.checking.Id})
		mkApplication(t, pe.app, p, inv, 0, 45000)
		entry := mustPostPayment(t, pe.app, p.Id, pe.users.bookkeeper.Id).GetString("entry")
		return tdPosted{pe.app, pe.users.readOnly, entry, pe.checking, p.Id}
	},
	"credit_memo": func(t *testing.T) tdPosted {
		ce := newCreditMemoEnv(t)
		registerBooksSources(t)
		memo := ce.mkCreditMemo(t, nil)
		mkCreditMemoLine(t, ce.app, memo, 0, item(ce.service, 1, 45000, false))
		entry := mustPostCreditMemo(t, ce.app, memo.Id, ce.users.bookkeeper.Id).GetString("entry")
		return tdPosted{ce.app, ce.users.readOnly, entry, ce.revenue, memo.Id}
	},
	// A bill payment posts only from its batch (bill_payments_test.go).
	"bill_payment": func(t *testing.T) tdPosted {
		bp := newBillPayEnv(t)
		registerBooksSources(t)
		bill := bp.postedBill(t, bp.summit, 45000)
		p := bp.pay(t, bp.summit, nil, payLine{bill, 45000})
		return tdPosted{bp.app, bp.users.readOnly, p.GetString("entry"), bp.checking1000, p.Id}
	},
}

// Every document kind with a poster opens a screen of its own: a poster with no
// row in entry_routes.json is a doc type whose route was left out.
func TestTransactionDetailPostersHaveRoutes(t *testing.T) {
	routes := entryRoutesFile(t)
	for docType := range tdDocumentPosters {
		if routes[docType] == "" {
			t.Errorf("entry_routes.json has no route for %q", docType)
		}
	}
	if got := routes["payment"]; got != "payments" {
		t.Errorf("entry_routes.json payment = %q, want payments", got)
	}
	if got := routes["bill_payment"]; got != "bill-payments" {
		t.Errorf("entry_routes.json bill_payment = %q, want bill-payments", got)
	}
	if got := routes["credit_memo"]; got != "credit-memos" {
		t.Errorf("entry_routes.json credit_memo = %q, want credit-memos", got)
	}
}

// requireOnlyDetailsOpen fails on a row other than a detail row that has an
// open path.
func requireOnlyDetailsOpen(t *testing.T, res *reports.Result) {
	t.Helper()
	for _, r := range res.Rows {
		if r.Kind != reports.KindDetail && r.Open != "" {
			t.Errorf("%s row %q opens %q, want no open", r.Kind, r.Label, r.Open)
		}
	}
}

// A line opens the screen of the transaction that posted it: a document's
// route from entry_routes.json, a manual transfer's screen, else the entry's
// read view (lib/entry-route.ts's rule).
func TestTransactionDetailOpenPaths(t *testing.T) {
	routes := entryRoutesFile(t)
	keys := make([]string, 0, len(routes))
	for k := range routes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, docType := range keys {
		t.Run(docType, func(t *testing.T) {
			post, ok := tdDocumentPosters[docType]
			if !ok {
				t.Fatalf("entry_routes.json names %q, which this test cannot post; add a poster for it", docType)
			}
			p := post(t)
			entry := reload(t, p.app, "books_journal_entries", p.entry)
			if entry.GetString("origin") != "document" || entry.GetString("doc_type") != docType || entry.GetString("document") != p.document {
				t.Fatalf("the posted entry is origin %q, doc_type %q, document %q; want document, %s, %s",
					entry.GetString("origin"), entry.GetString("doc_type"), entry.GetString("document"), docType, p.document)
			}
			res := tdRun(t, p.app, p.reader, map[string]any{"period": glAllDates})
			row := lineRow(t, res, entryLineOn(t, p.app, p.entry, p.account))
			if want := "books/" + routes[docType] + "/" + p.document; row.Open != want {
				t.Errorf("the %s line opens %q, want %q", docType, row.Open, want)
			}
			requireOnlyDetailsOpen(t, res)
		})
	}

	t.Run("transfer, journal entry and a bill's void reversal", func(t *testing.T) {
		pe := newBillPostingEnv(t)
		registerBooksSources(t)
		app := pe.app
		operating := plAccount(t, app, "Operating", "1000", "bank", "checking", "")
		journal := postJournal(t, app, "", "2026-11-03", "Office chairs",
			jnLine{account: pe.equipment, debit: 9000}, jnLine{account: operating, credit: 9000, position: 1})
		transfer := mustPost(t, app, transferDraft(t, app, "2026-11-03", operating, pe.checking, 2500).Id, "")
		bill := mkBill(t, app, pe.summit, nil)
		mkBillLine(t, app, bill, 0, accountLine(pe.software, 12000))
		billEntry := mustPostBill(t, app, bill.Id, pe.users.bookkeeper.Id).GetString("entry")
		if err := voidBillAs(app, bill.Id, pe.users.bookkeeper.Id); err != nil {
			t.Fatalf("void the bill: %v", err)
		}
		voidReversal := findReversal(t, app, billEntry)

		res := tdRun(t, app, pe.users.readOnly, map[string]any{"period": glAllDates})
		for _, w := range []struct {
			what    string
			entry   string
			account *core.Record
			want    string
		}{
			{"the journal entry's line", journal.Id, pe.equipment, "books/entries/" + journal.Id},
			{"the transfer's line", transfer.Id, pe.checking, "books/transfers/" + transfer.Id},
			{"the bill's void reversal line", voidReversal.Id, pe.software, "books/entries/" + voidReversal.Id},
		} {
			if got := lineRow(t, res, entryLineOn(t, app, w.entry, w.account)).Open; got != w.want {
				t.Errorf("%s opens %q, want %q", w.what, got, w.want)
			}
		}
		requireOnlyDetailsOpen(t, res)
	})
}

// Every collection the run reads is a topic, so a post, a void, an account
// edit, a customer or vendor rename or a settings change re-runs the report.
func TestTransactionDetailTopics(t *testing.T) {
	b := newGLBook(t)
	operating := plAccount(t, b.app, "Operating", "1000", "bank", "checking", "")
	rent := plAccount(t, b.app, "Office rent", "6000", "expense", "rent_lease", "")
	b.post(t, "2026-11-02", ln{rent, 4000, 0}, ln{operating, 0, 4000})

	res := tdRun(t, b.app, b.reader, map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")})
	for _, topic := range []string{
		"collection/books_journal_lines", "collection/books_journal_entries", "collection/books_accounts",
		"collection/books_customers", "collection/books_vendors", "collection/books_settings",
	} {
		if !slices.Contains(res.Topics, topic) {
			t.Errorf("topics = %v, want %s", res.Topics, topic)
		}
	}
}

// Register ships Transaction Detail by Account; core creates it unpublished,
// and Books shares it with every Books reader.
func TestTransactionDetailShippedShared(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.transaction_detail"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.transaction_detail: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Transaction Detail by Account" || row.GetInt("shipped_revision") != 2 || row.GetString("source") != "books.basis_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}

func TestTransactionDetailNoAccess(t *testing.T) {
	b := newGLBook(t)
	operating := plAccount(t, b.app, "Operating", "1000", "bank", "checking", "")
	rent := plAccount(t, b.app, "Office rent", "6000", "expense", "rent_lease", "")
	b.post(t, "2026-11-02", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	params := map[string]any{"period": glPeriod("2026-11-01", "2026-11-30")}

	if !hasSection(t, tdRun(t, b.app, b.reader, params), rent) {
		t.Fatal("a Books reader does not see Office rent")
	}
	res := tdRun(t, b.app, b.env.users.none, params)
	if rows := tdGroupRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees sections %v", labelsOf(rows))
	}
	if rows := tdDetailRows(res); len(rows) != 0 {
		t.Errorf("a user with Books level none sees lines %v", labelsOf(rows))
	}
}

// --- Drills: statement figures open Transaction Detail (spec §5 "Drills
// added to the existing specs", "Why it holds"). ---

// drillToday is the reader's day of every drilled run and of the Transaction
// Detail run its drill opens, so a preset resolves to the same days in both.
const drillToday = plToday

// tdTitle is the drill target's title as the reader sees it.
const tdTitle = "Transaction Detail by Account"

// drillBook is a ledger with every hook bound (newLedgerEnv), Books' sources,
// the shipped Transaction Detail stored as core's reconcile stores it, and the
// Books read-only reader holding the viewer share reconcileBooksReportShares
// gives, so the reader may open the drill target.
type drillBook struct {
	app      core.App
	env      *ledgerEnv
	reader   *core.Record
	checking *core.Record
	td       *core.Record
}

func newDrillBook(t *testing.T) drillBook {
	t.Helper()
	env := newLedgerEnv(t)
	registerBooksSources(t)
	mkUser(t, env.app, "owner")
	if err := reports.ReconcileShipped(env.app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	if err := reconcileBooksReportShares(env.app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	td, err := env.app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": transactionDetailKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", transactionDetailKey, err)
	}
	requireViewer(t, env.app, td, env.users.readOnly, "the Books reader")
	return drillBook{app: env.app, env: env, reader: env.users.readOnly, checking: env.checking, td: td}
}

func (b drillBook) post(t *testing.T, date string, lines ...ln) *core.Record {
	t.Helper()
	return mustPost(t, b.app, mkDraft(t, b.app, date, lines...).Id, "")
}

func (b drillBook) fiscalStart(t *testing.T, month int) {
	t.Helper()
	saveSettings(t, b.app, map[string]any{"fiscal_year_start_month": month})
}

// retainedEarnings is the book's one retained-earnings account, made when the
// book has none.
func (b drillBook) retainedEarnings(t *testing.T) *core.Record {
	t.Helper()
	r, err := b.app.FindFirstRecordByFilter("books_accounts", "detail_type = 'retained_earnings'")
	if err == nil {
		return r
	}
	return mkRetainedEarnings(t, b.app, "3900")
}

func (b drillBook) pl(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossShipped(), b.reader, params, reports.Options{Today: drillToday})
}

func (b drillBook) plByMonth(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runPL(t, b.app, profitAndLossByMonthShipped(), b.reader, params, reports.Options{Today: drillToday})
}

func (b drillBook) bs(t *testing.T, asOf string) *reports.Result {
	t.Helper()
	return runBS(t, b.app, b.reader, map[string]any{"asOf": asOf}, reports.Options{Today: drillToday})
}

func (b drillBook) tb(t *testing.T, asOf string) *reports.Result {
	t.Helper()
	return runTB(t, b.app, b.reader, map[string]any{"asOf": asOf}, reports.Options{Today: drillToday})
}

// drillOf is a row's <col>@drill cell: the target's params by id, each in the
// run request's JSON form; ok false when the row has none.
func drillOf(t *testing.T, r reports.Row, colID string) (map[string]json.RawMessage, bool) {
	t.Helper()
	cell, has := r.Cells[colID+"@drill"]
	if !has || cell == nil {
		return nil, false
	}
	raw, err := json.Marshal(cell)
	if err != nil {
		t.Fatalf("%s (%s) %s@drill = %#v: %v", r.Label, r.Kind, colID, cell, err)
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("%s (%s) %s@drill = %s, want an object of target params: %v", r.Label, r.Kind, colID, raw, err)
	}
	return out, true
}

// drillKeys are a row's cell names that end in "@drill".
func drillKeys(r reports.Row) []string {
	var out []string
	for k := range r.Cells {
		if strings.HasSuffix(k, "@drill") {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// requireDrill fails unless the row's <col>@drill cell holds exactly the
// target params of want (each a JSON value): every other option of the target
// stays at its default.
func requireDrill(t *testing.T, r reports.Row, colID string, want map[string]string) {
	t.Helper()
	got, ok := drillOf(t, r, colID)
	if !ok {
		t.Fatalf("%s (%s) has no %s@drill cell (drill cells %v), want %v", r.Label, r.Kind, colID, drillKeys(r), want)
	}
	gotIDs := slices.Sorted(maps.Keys(got))
	wantIDs := slices.Sorted(maps.Keys(want))
	if !slices.Equal(gotIDs, wantIDs) {
		t.Errorf("%s (%s) %s@drill params = %v, want only %v", r.Label, r.Kind, colID, gotIDs, wantIDs)
	}
	for id, w := range want {
		if !jsonEqual(t, got[id], w) {
			t.Errorf("%s (%s) %s@drill %s = %s, want %s", r.Label, r.Kind, colID, id, got[id], w)
		}
	}
}

func requireNoDrill(t *testing.T, r reports.Row, colID string) {
	t.Helper()
	if got, ok := drillOf(t, r, colID); ok {
		t.Errorf("%s (%s) has a %s@drill cell %v, want none", r.Label, r.Kind, colID, got)
	}
}

func requireNoDrillCells(t *testing.T, r reports.Row) {
	t.Helper()
	if keys := drillKeys(r); len(keys) != 0 {
		t.Errorf("%s (%s) has drill cells %v, want none", r.Label, r.Kind, keys)
	}
}

func resultColumn(t *testing.T, res *reports.Result, colID string) reports.ResultColumn {
	t.Helper()
	for _, c := range res.Columns {
		if c.ID == colID {
			return c
		}
	}
	t.Fatalf("the result has no column %q", colID)
	return reports.ResultColumn{}
}

// requireColumnDrill fails unless the result column opens the stored
// Transaction Detail by Account.
func requireColumnDrill(t *testing.T, res *reports.Result, colID string, td *core.Record) {
	t.Helper()
	got := resultColumn(t, res, colID).Drill
	want := reports.DrillTarget{ReportID: td.Id, Title: tdTitle}
	if got == nil || *got != want {
		t.Errorf("column %s drill = %+v, want %+v", colID, got, want)
	}
}

func requireNoColumnDrill(t *testing.T, res *reports.Result, colID string) {
	t.Helper()
	if got := resultColumn(t, res, colID).Drill; got != nil {
		t.Errorf("column %s drill = %+v, want none", colID, got)
	}
}

func rowByID(t *testing.T, res *reports.Result, id string) reports.Row {
	t.Helper()
	for _, r := range res.Rows {
		if r.ID == id {
			return r
		}
	}
	t.Fatalf("no row %s; rows %v", id, plRowTexts(res.Rows))
	return reports.Row{}
}

// drillTD reads the <colID>@drill params of the row rowID of res and runs
// Transaction Detail by Account with them as reader, on the drilled run's day.
func drillTD(t *testing.T, app core.App, reader *core.Record, res *reports.Result, rowID, colID string) *reports.Result {
	t.Helper()
	r := rowByID(t, res, rowID)
	cell, ok := drillOf(t, r, colID)
	if !ok {
		t.Fatalf("%s (%s) has no %s@drill cell (drill cells %v)", r.Label, r.Kind, colID, drillKeys(r))
	}
	params := map[string]any{}
	for id, raw := range cell {
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			t.Fatalf("%s@drill %s = %s: %v", colID, id, raw, err)
		}
		params[id] = v
	}
	return runTD(t, app, reader, params, reports.Options{Today: drillToday})
}

// tdSectionTotal is the "Total <account>" amount of the account's section.
func tdSectionTotal(t *testing.T, res *reports.Result, account *core.Record) int64 {
	t.Helper()
	s := sectionFor(t, res, account)
	if s.total == nil {
		t.Fatalf("%s has no total row", s.head.Label)
	}
	return tdAmountOf(t, *s.total)
}

func idList(ids ...string) string { return string(mustJSON(ids)) }

func rangeJSON(from, to string) string { return string(mustJSON(glPeriod(from, to))) }

const expenseGroupPick = `[{"group":"expense"}]`

// accrualMethod is the Method a statement run with no method resolves to; its
// drills copy it to Transaction Detail (`{ "param": "method" }`).
const accrualMethod = `"accrual"`

// An account row's Total drills to that account for the period as the run was
// given it; the drilled section total equals the figure, also for an account
// whose lines net to zero.
func TestDrillProfitAndLossAccount(t *testing.T) {
	b := newDrillBook(t)
	b.fiscalStart(t, 1)
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	meals := plAccount(t, b.app, "Meals", "6300", "expense", "meals", "")
	// The prior fiscal year's line is outside This fiscal year to date.
	b.post(t, "2025-12-15", ln{rent, 90000, 0}, ln{b.checking, 0, 90000})
	b.post(t, "2026-03-05", ln{rent, 120000, 0}, ln{b.checking, 0, 120000})
	b.post(t, "2026-10-02", ln{rent, 24000, 0}, ln{b.checking, 0, 24000})
	b.post(t, "2026-04-01", ln{meals, 5000, 0}, ln{b.checking, 0, 5000})
	b.post(t, "2026-04-02", ln{b.checking, 5000, 0}, ln{meals, 0, 5000})
	fytd := `{"preset":"thisFiscalYearToDate"}`

	res := b.pl(t, map[string]any{"period": map[string]any{"preset": "thisFiscalYearToDate"}, "rows": "active"})
	requireColumnDrill(t, res, "amount", b.td)
	row := plRowFor(t, res, rent)
	if got := plAmount(t, row); got != 144000 {
		t.Fatalf("Rent or lease's Total = %d, want 144000 (this fiscal year's two lines)", got)
	}
	requireDrill(t, row, "amount", map[string]string{"period": fytd, "method": accrualMethod, "accounts": idList(rent.Id)})
	td := drillTD(t, b.app, b.reader, res, row.ID, "amount")
	if got := sectionIDs(t, glSections(t, td)); !reflect.DeepEqual(got, idsOf(rent)) {
		t.Errorf("the drilled sections = %v, want only Rent or lease", sectionLabels(glSections(t, td)))
	}
	if got, want := tdSectionTotal(t, td, rent), plAmount(t, row); got != want {
		t.Errorf("Total 6600 Rent or lease = %d, want the pressed figure %d", got, want)
	}

	zero := plRowFor(t, res, meals)
	if got := plAmount(t, zero); got != 0 {
		t.Fatalf("Meals' Total = %d, want 0 (its lines cancel)", got)
	}
	requireDrill(t, zero, "amount", map[string]string{"period": fytd, "method": accrualMethod, "accounts": idList(meals.Id)})
	ztd := drillTD(t, b.app, b.reader, res, zero.ID, "amount")
	s := sectionFor(t, ztd, meals)
	if got := tdAmounts(t, s.lines); !slices.Equal(got, []int64{5000, -5000}) {
		t.Errorf("Meals' drilled lines = %v, want the two lines that cancel [5000 -5000]", got)
	}
	if got := tdSectionTotal(t, ztd, meals); got != 0 {
		t.Errorf("Total 6300 Meals = %d, want 0", got)
	}
}

// A section's heading row and its "Total <section>" row drill to the
// section's whole account type; the drilled report Total equals the figure.
func TestDrillProfitAndLossSection(t *testing.T) {
	b := newDrillBook(t)
	b.fiscalStart(t, 1)
	service := plAccount(t, b.app, "Service", "4000", "income", "service_income", "")
	refunds := plAccount(t, b.app, "Refunds", "4900", "income", "discounts_refunds", "")
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	supplies := plAccount(t, b.app, "Supplies", "6100", "expense", "office_general", "")
	materials := plAccount(t, b.app, "Materials", "5000", "cost_of_goods_sold", "supplies_materials", "")
	b.post(t, "2026-03-02", ln{b.checking, 40000, 0}, ln{service, 0, 40000})
	// A refund: a debit to an income account, so its section total is net.
	b.post(t, "2026-03-04", ln{refunds, 5000, 0}, ln{b.checking, 0, 5000})
	b.post(t, "2026-03-05", ln{rent, 12000, 0}, ln{b.checking, 0, 12000})
	b.post(t, "2026-03-06", ln{supplies, 3000, 0}, ln{b.checking, 0, 3000})
	// Cost of goods sold is its own section: no Expenses drill reaches it.
	b.post(t, "2026-03-07", ln{materials, 7000, 0}, ln{b.checking, 0, 7000})
	b.post(t, "2025-12-20", ln{rent, 1111, 0}, ln{b.checking, 0, 1111})
	march := rangeJSON("2026-03-01", "2026-03-31")

	res := b.pl(t, map[string]any{"period": plMarch})
	requireColumnDrill(t, res, "amount", b.td)
	requireNoColumnDrill(t, res, "pct")
	for _, sec := range []struct {
		title, group string
		accounts     []*core.Record
		want         int64
	}{
		{"Expenses", "expense", []*core.Record{rent, supplies}, 15000},
		{"Income", "income", []*core.Record{service, refunds}, 35000},
	} {
		for _, r := range []reports.Row{plOne(t, res, reports.KindGroup, sec.title), plTotal(t, res, sec.title)} {
			if got := plAmount(t, r); got != sec.want {
				t.Fatalf("%s (%s) = %d, want %d", r.Label, r.Kind, got, sec.want)
			}
			requireDrill(t, r, "amount", map[string]string{"period": march, "method": accrualMethod, "accounts": `[{"group":"` + sec.group + `"}]`})
			td := drillTD(t, b.app, b.reader, res, r.ID, "amount")
			if got := sectionIDs(t, glSections(t, td)); !sameAccounts(got, idsOf(sec.accounts...)) {
				t.Errorf("%s (%s) drills to sections %v, want every %s account with a line", r.Label, r.Kind, sectionLabels(glSections(t, td)), sec.group)
			}
			if got := tdAmountOf(t, totalOf(t, td)); got != sec.want {
				t.Errorf("the drilled Total from %s (%s) = %d, want the pressed figure %d", r.Label, r.Kind, got, sec.want)
			}
		}
	}
	for _, label := range plComputed {
		requireNoDrillCells(t, plComputedRow(t, res, label))
	}
	for _, r := range res.Rows {
		requireNoDrill(t, r, "pct")
	}

	all := b.pl(t, map[string]any{"period": glAllDates})
	total := plTotal(t, all, "Expenses")
	requireDrill(t, total, "amount", map[string]string{"period": `{"preset":"allDates"}`, "method": accrualMethod, "accounts": expenseGroupPick})
	if got, want := tdAmountOf(t, totalOf(t, drillTD(t, b.app, b.reader, all, total.ID, "amount"))), plAmount(t, total); got != want || got != 16111 {
		t.Errorf("All dates: the drilled Total = %d, want Total Expenses %d (16111)", got, want)
	}
}

// A month cell drills to that month cut to the period; the row's Total cell
// to the period as given; each drilled total equals its cell.
func TestDrillProfitAndLossByMonth(t *testing.T) {
	b := newDrillBook(t)
	supplies := plAccount(t, b.app, "Supplies", "6100", "expense", "office_general", "")
	postage := plAccount(t, b.app, "Postage", "6150", "expense", "office_general", "")
	b.post(t, "2026-03-05", ln{supplies, 100, 0}, ln{b.checking, 0, 100}) // before the period
	b.post(t, "2026-03-12", ln{supplies, 1000, 0}, ln{b.checking, 0, 1000})
	b.post(t, "2026-03-31", ln{supplies, 2000, 0}, ln{b.checking, 0, 2000})
	b.post(t, "2026-04-15", ln{supplies, 4000, 0}, ln{b.checking, 0, 4000})
	b.post(t, "2026-04-02", ln{postage, 700, 0}, ln{b.checking, 0, 700})
	b.post(t, "2026-05-20", ln{supplies, 8000, 0}, ln{b.checking, 0, 8000})
	b.post(t, "2026-05-21", ln{supplies, 16000, 0}, ln{b.checking, 0, 16000}) // after the period
	period := glPeriod("2026-03-10", "2026-05-20")

	res := b.plByMonth(t, map[string]any{"period": period})
	if got := plMonthKeys(t, res); !slices.Equal(got, []string{"2026-03", "2026-04", "2026-05"}) {
		t.Fatalf("months = %v, want March, April, May 2026", got)
	}
	monthCol := map[string]string{}
	for _, c := range plMonths(res) {
		monthCol[c.Pivot.Key.(string)] = c.ID
		requireColumnDrill(t, res, c.ID, b.td)
	}
	requireColumnDrill(t, res, "amount", b.td)
	requireNoColumnDrill(t, res, "pct")

	row := plRowFor(t, res, supplies)
	for _, m := range []struct {
		key, from, to string
		want          int64
	}{
		{"2026-03", "2026-03-10", "2026-03-31", 3000},
		{"2026-04", "2026-04-01", "2026-04-30", 4000},
		{"2026-05", "2026-05-01", "2026-05-20", 8000},
	} {
		cell := plMonthCell(t, res, row, m.key)
		if cell != m.want {
			t.Fatalf("Supplies in %s = %d, want %d", m.key, cell, m.want)
		}
		requireDrill(t, row, monthCol[m.key], map[string]string{"period": rangeJSON(m.from, m.to), "method": accrualMethod, "accounts": idList(supplies.Id)})
		td := drillTD(t, b.app, b.reader, res, row.ID, monthCol[m.key])
		if got := tdSectionTotal(t, td, supplies); got != cell {
			t.Errorf("Supplies' %s cell drills to a total of %d, want the cell %d", m.key, got, cell)
		}
	}
	requireDrill(t, row, "amount", map[string]string{"period": rangeJSON("2026-03-10", "2026-05-20"), "method": accrualMethod, "accounts": idList(supplies.Id)})
	if got, want := tdSectionTotal(t, drillTD(t, b.app, b.reader, res, row.ID, "amount"), supplies), plAmount(t, row); got != want || got != 15000 {
		t.Errorf("Supplies' Total cell drills to a total of %d, want the Total %d (15000)", got, want)
	}

	sec := plOne(t, res, reports.KindGroup, "Expenses")
	april := plMonthCell(t, res, sec, "2026-04")
	if april != 4700 {
		t.Fatalf("Expenses in April = %d, want 4700", april)
	}
	requireDrill(t, sec, monthCol["2026-04"], map[string]string{"period": rangeJSON("2026-04-01", "2026-04-30"), "method": accrualMethod, "accounts": expenseGroupPick})
	if got := tdAmountOf(t, totalOf(t, drillTD(t, b.app, b.reader, res, sec.ID, monthCol["2026-04"]))); got != april {
		t.Errorf("Expenses' April cell drills to a Total of %d, want the cell %d", got, april)
	}

	for _, label := range plComputed {
		requireNoDrillCells(t, plComputedRow(t, res, label))
	}
	for _, r := range res.Rows {
		requireNoDrill(t, r, "pct")
	}
}

// Current and Prior year of an account row drill to the account's lines from
// its first posted line up to the column's day; the drilled total equals the
// figure. Nothing else on the Balance Sheet drills.
func TestDrillBalanceSheet(t *testing.T) {
	b := newDrillBook(t)
	b.fiscalStart(t, 1)
	const asOf, priorDay = "2026-10-31", "2025-10-31"
	bank := plAccount(t, b.app, "Operating", "1010", "bank", "checking", "")
	owner := plAccount(t, b.app, "Owner investment", "3000", "equity", "owners_equity", "")
	b.post(t, "2025-06-10", ln{bank, 10000, 0}, ln{owner, 0, 10000})
	b.post(t, "2025-09-01", ln{bank, 2500, 0}, ln{owner, 0, 2500})
	b.post(t, "2026-10-05", ln{owner, 4000, 0}, ln{bank, 0, 4000})
	after := b.post(t, "2026-11-03", ln{bank, 99900, 0}, ln{owner, 0, 99900})
	// Savings has lines only after the prior-year day: Prior year 0.00.
	savings := plAccount(t, b.app, "Savings", "1030", "bank", "savings", "")
	b.post(t, "2026-02-01", ln{savings, 7000, 0}, ln{owner, 0, 7000})

	res := b.bs(t, asOf)
	if h := headingOf(t, res, "prior"); h == nil || h.Value != priorDay {
		t.Fatalf("prior heading = %+v, want %s", h, priorDay)
	}
	requireColumnDrill(t, res, "current", b.td)
	requireColumnDrill(t, res, "prior", b.td)
	requireNoColumnDrill(t, res, "change")
	requireNoColumnDrill(t, res, "pct")
	row := bsAccount(t, res, bank)
	requireFigures(t, row, 8500, 12500)

	requireDrill(t, row, "current", map[string]string{"period": rangeJSON("2025-06-10", asOf), "method": accrualMethod, "accounts": idList(bank.Id)})
	current := drillTD(t, b.app, b.reader, res, row.ID, "current")
	if got := tdSectionTotal(t, current, bank); got != amt(t, row, "current") {
		t.Errorf("Current drills to a total of %d, want the figure %d", got, amt(t, row, "current"))
	}
	if n := len(sectionFor(t, current, bank).lines); n != 3 {
		t.Errorf("Current drills to %d lines, want the 3 on or before %s", n, asOf)
	}
	if hasLineRow(current, entryLineOn(t, b.app, after.Id, bank)) {
		t.Errorf("the line dated after the as-of day shows in the drilled report")
	}

	requireDrill(t, row, "prior", map[string]string{"period": rangeJSON("2025-06-10", priorDay), "method": accrualMethod, "accounts": idList(bank.Id)})
	prior := drillTD(t, b.app, b.reader, res, row.ID, "prior")
	if got := tdSectionTotal(t, prior, bank); got != amt(t, row, "prior") {
		t.Errorf("Prior year drills to a total of %d, want the figure %d", got, amt(t, row, "prior"))
	}
	if n := len(sectionFor(t, prior, bank).lines); n != 2 {
		t.Errorf("Prior year drills to %d lines, want the 2 on or before %s", n, priorDay)
	}

	// A figure of 0.00 still opens (spec §3): with no line on or before the
	// prior-year day, the range falls back to that day, and the transaction
	// report is empty.
	sv := bsAccount(t, res, savings)
	if got := amt(t, sv, "prior"); got != 0 {
		t.Fatalf("Savings' Prior year = %d, want 0 (its only line is after %s)", got, priorDay)
	}
	requireDrill(t, sv, "prior", map[string]string{"period": rangeJSON(priorDay, priorDay), "method": accrualMethod, "accounts": idList(savings.Id)})
	none := drillTD(t, b.app, b.reader, res, sv.ID, "prior")
	if secs := glSections(t, none); len(secs) != 0 {
		t.Errorf("Savings' Prior year 0.00 drills to sections %v, want none", sectionLabels(secs))
	}
	if v, has := totalOf(t, none).Cells["amount"]; has && v != nil {
		t.Errorf("Savings' Prior year 0.00 drills to a Total amount %#v, want blank", v)
	}

	requireNoDrill(t, row, "change")
	requireNoDrill(t, row, "pct")
	accountRowIDs := map[string]bool{}
	for _, r := range bsAccountRows(res) {
		accountRowIDs[r.ID] = true
	}
	for _, r := range res.Rows {
		if !accountRowIDs[r.ID] {
			requireNoDrillCells(t, r)
		}
	}
}

// Debit and Credit of an account row drill to the account's lines from its
// first posted line (an income or expense account's first in the as-of day's
// fiscal year) up to the as-of day; the drilled section total is the figure
// by the account's normal side. The retained-earnings row and the Total do not
// drill.
func TestDrillTrialBalance(t *testing.T) {
	const asOf = "2026-10-31"
	for _, c := range []struct {
		name          string
		startMonth    int
		softwareFrom  string
		softwareDebit int64
	}{
		{"fiscal year from January", 1, "2026-03-15", 5000},
		{"fiscal year from July", 7, "2026-08-10", 3000},
	} {
		t.Run(c.name, func(t *testing.T) {
			b := newDrillBook(t)
			b.fiscalStart(t, c.startMonth)
			operating := plAccount(t, b.app, "Operating", "1010", "bank", "checking", "")
			petty := plAccount(t, b.app, "Petty cash", "1020", "bank", "checking", "")
			owner := plAccount(t, b.app, "Owner investment", "3000", "equity", "owners_equity", "")
			retained := b.retainedEarnings(t)
			software := plAccount(t, b.app, "Software", "6100", "expense", "dues_subscriptions", "")
			b.post(t, "2025-08-01", ln{operating, 50000, 0}, ln{owner, 0, 50000})
			b.post(t, "2025-12-20", ln{software, 1000, 0}, ln{operating, 0, 1000})
			b.post(t, "2026-03-15", ln{software, 2000, 0}, ln{operating, 0, 2000})
			b.post(t, "2026-08-10", ln{software, 3000, 0}, ln{operating, 0, 3000})
			// Petty cash is debit-normal and ends with a net credit of 50.00.
			b.post(t, "2026-09-01", ln{petty, 1000, 0}, ln{owner, 0, 1000})
			b.post(t, "2026-09-02", ln{owner, 6000, 0}, ln{petty, 0, 6000})
			clearing := plAccount(t, b.app, "Clearing", "1030", "bank", "checking", "")
			unused := plAccount(t, b.app, "Unused", "1040", "bank", "checking", "")
			b.post(t, "2026-09-05", ln{clearing, 7000, 0}, ln{owner, 0, 7000})
			b.post(t, "2026-09-06", ln{owner, 7000, 0}, ln{clearing, 0, 7000})

			res := b.tb(t, asOf)
			requireColumnDrill(t, res, "debit", b.td)
			requireColumnDrill(t, res, "credit", b.td)

			op := rowFor(t, res, operating)
			requireSplit(t, op, int64(44000), nil)
			requireDrill(t, op, "debit", map[string]string{"period": rangeJSON("2025-08-01", asOf), "accounts": idList(operating.Id)})
			if got := tdSectionTotal(t, drillTD(t, b.app, b.reader, res, op.ID, "debit"), operating); got != 44000 {
				t.Errorf("Operating's Debit drills to a total of %d, want the Debit 44000", got)
			}
			// The blank side of a row draws no figure, so it is no link.
			requireNoDrill(t, op, "credit")

			sw := rowFor(t, res, software)
			requireSplit(t, sw, c.softwareDebit, nil)
			requireDrill(t, sw, "debit", map[string]string{"period": rangeJSON(c.softwareFrom, asOf), "accounts": idList(software.Id)})
			if got := tdSectionTotal(t, drillTD(t, b.app, b.reader, res, sw.ID, "debit"), software); got != c.softwareDebit {
				t.Errorf("Software's Debit drills to a total of %d, want the Debit %d", got, c.softwareDebit)
			}
			requireNoDrill(t, sw, "credit")

			pc := rowFor(t, res, petty)
			requireSplit(t, pc, nil, int64(5000))
			requireDrill(t, pc, "credit", map[string]string{"period": rangeJSON("2026-09-01", asOf), "accounts": idList(petty.Id)})
			if got := tdSectionTotal(t, drillTD(t, b.app, b.reader, res, pc.ID, "credit"), petty); got != -5000 {
				t.Errorf("Petty cash's Credit 50.00 drills to a total of %d, want -5000 (signed by its debit normal side)", got)
			}
			requireNoDrill(t, pc, "debit")

			// Clearing's lines cancel: under Rows Active its Debit draws 0.00 and
			// opens the cancelling lines; its Credit draws nothing and opens nothing.
			active := runTB(t, b.app, b.reader, map[string]any{"asOf": asOf, "rows": "active"}, reports.Options{Today: drillToday})
			cl := rowFor(t, active, clearing)
			requireSplit(t, cl, int64(0), nil)
			requireDrill(t, cl, "debit", map[string]string{"period": rangeJSON("2026-09-05", asOf), "accounts": idList(clearing.Id)})
			if got := tdSectionTotal(t, drillTD(t, b.app, b.reader, active, cl.ID, "debit"), clearing); got != 0 {
				t.Errorf("Clearing's Debit 0.00 drills to a total of %d, want 0", got)
			}
			requireNoDrill(t, cl, "credit")

			// Unused has no line: under Rows All both its cells are blank, and
			// neither opens.
			all := runTB(t, b.app, b.reader, map[string]any{"asOf": asOf, "rows": "all"}, reports.Options{Today: drillToday})
			un := rowFor(t, all, unused)
			requireSplit(t, un, nil, nil)
			requireNoDrillCells(t, un)

			re := rowFor(t, res, retained)
			if _, ok := moneyCell(t, re, "debit"); !ok {
				t.Fatalf("the retained-earnings row has no Debit (cells %v), want the prior years' expense", re.Cells)
			}
			requireNoDrill(t, re, "debit")
			requireNoDrill(t, re, "credit")
			requireNoDrillCells(t, totalOf(t, res))
		})
	}
}

// A reader who cannot view Transaction Detail by Account gets the Profit and
// Loss with no drill on any column and no @drill cell.
func TestDrillNoTargetForNonReader(t *testing.T) {
	b := newDrillBook(t)
	rent := plAccount(t, b.app, "Rent or lease", "6600", "expense", "rent_lease", "")
	b.post(t, "2026-03-05", ln{rent, 12000, 0}, ln{b.checking, 0, 12000})
	params := map[string]any{"period": plMarch}

	// With the share the figure drills, so the run below tells a lost target
	// from a report that never drilled.
	requireColumnDrill(t, b.pl(t, params), "amount", b.td)

	// The test app binds no share hook (registerReportShares), and nothing
	// below reconciles, so the share stays deleted.
	shares, err := b.app.FindRecordsByFilter("report_shares", "report = {:r} && user = {:u}", "", 0, 0,
		dbx.Params{"r": b.td.Id, "u": b.reader.Id})
	if err != nil || len(shares) != 1 {
		t.Fatalf("the reader's shares of Transaction Detail = %d (%v), want 1", len(shares), err)
	}
	if err := b.app.Delete(shares[0]); err != nil {
		t.Fatalf("delete the share: %v", err)
	}

	res := b.pl(t, params)
	for _, c := range res.Columns {
		if c.Drill != nil {
			t.Errorf("column %s drill = %+v, want none for a reader who cannot view the target", c.ID, c.Drill)
		}
	}
	for _, r := range res.Rows {
		requireNoDrillCells(t, r)
	}
	if !plHasRow(t, res, rent) {
		t.Errorf("the report lost Rent or lease's row; want it as it is today")
	}
}
