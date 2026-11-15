package books

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"sort"
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
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
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
	if spec.Source != "books.journal_lines" {
		t.Errorf("source = %q, want books.journal_lines", spec.Source)
	}
	if err := reports.Validate(app, spec); err != nil {
		t.Errorf("Validate: %v", err)
	}

	ids := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		ids[i] = p.ID
	}
	if !reflect.DeepEqual(ids, []string{"period", "accounts"}) {
		t.Errorf("params = %v, want period, accounts (the chips' order)", ids)
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
	if row.GetString("title") != "Transaction Detail by Account" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
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
