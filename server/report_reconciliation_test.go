package books

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The shipped Reconciliation Report (reconciliation report spec §3 "The
// Reconciliation Report", §4 "Server", settled differences 1, 4 and 5 of the
// plan): one open section for each finished reconciliation over the
// books.reconciled_lines source, with the opening row "Beginning balance", one
// row for each cleared line with a running balance in the account's own sense,
// and a section total whose Balance is the statement ending balance. Every run
// is a Books reader's, through runStatementSpec, which logs every row.

// rrEnv is the reconcile env (1000 Business Checking, 1010 Business Savings,
// 2100 Company Card) with Books' report sources registered.
type rrEnv struct {
	*rtEnv
}

func newRrEnv(t *testing.T) *rrEnv {
	t.Helper()
	r := newRtEnv(t)
	registerBooksSources(t)
	return &rrEnv{rtEnv: r}
}

func (r *rrEnv) run(t *testing.T, params map[string]any) *reports.Result {
	t.Helper()
	return runStatementSpec(t, r.app, r.users.readOnly, reconciliationReportSpec(), params)
}

// rrStatement finishes a statement of account at date that clears lines, as
// the bookkeeper. It returns the reconciliation's id.
func (r *rrEnv) rrStatement(t *testing.T, account *core.Record, date string, balance int64, lines ...*core.Record) string {
	t.Helper()
	id := r.mustStart(t, account, date, balance)
	for _, l := range lines {
		r.mustClear(t, id, l)
	}
	r.mustFinish(t, id)
	requireReconStatus(t, r.app, id, "finished")
	return id
}

// rrSectionIDs are the reconciliation ids of the run's group rows, in row order.
func rrSectionIDs(t *testing.T, res *reports.Result) []string {
	t.Helper()
	var ids []string
	for _, row := range res.Rows {
		if row.Kind != reports.KindGroup {
			continue
		}
		if len(row.GroupKey) == 0 {
			t.Fatalf("group row %s (%q) has no key", row.ID, row.Label)
		}
		id, _ := row.GroupKey[0].(string)
		ids = append(ids, id)
	}
	return ids
}

// rrFigure reads an amount cell; a blank cell reads 0 (a detail row's zero
// side may be blank).
func rrFigure(t *testing.T, row reports.Row, col string) int64 {
	t.Helper()
	v, _ := moneyCell(t, row, col)
	return v
}

// rrNoCell fails when row carries a value in col.
func rrNoCell(t *testing.T, row reports.Row, col string) {
	t.Helper()
	if v, ok := row.Cells[col]; ok && v != nil {
		t.Errorf("%s row %q carries %s = %#v, want no cell", row.Kind, row.Label, col, v)
	}
}

// rrInstant is a date-time as "YYYY-MM-DD HH:MM:SS", from a run cell or a
// stored value, so the two compare whatever separator each writes.
func rrInstant(v any) string {
	s := strings.Replace(fmt.Sprint(v), "T", " ", 1)
	if len(s) > 19 {
		return s[:19]
	}
	return s
}

type rrLine struct {
	entry         *core.Record
	debit, credit int64
}

// requireSection checks the section of reconciliation id: its group row with
// label, the statement date and the finish time; the opening row with
// beginning; one detail row for each of lines, in order, with its figures, a
// running balance that adds sign × (debit − credit), and the entry's path; the
// subtotal with the sums, the statement balance and no section cells.
func (r *rrEnv) requireSection(t *testing.T, res *reports.Result, id, label string, sign int64, lines []rrLine) *stGroup {
	t.Helper()
	g, ok := stGroups(t, res)[id]
	if !ok {
		t.Fatalf("no section for reconciliation %s; rows %q", id, bsLabels(res))
	}
	stored := reload(t, r.app, rtRecons, id)

	if g.head.Label != label {
		t.Errorf("section label = %q, want %q", g.head.Label, label)
	}
	if got := fmt.Sprint(g.head.Cells["statement"]); !strings.HasPrefix(got, stored.GetString("statement_date")[:10]) {
		t.Errorf("section statement = %q, want the statement date %s", got, stored.GetString("statement_date"))
	}
	finishedAt := stored.GetDateTime("finished_at")
	if finishedAt.IsZero() {
		t.Fatalf("reconciliation %s has no finished_at", id)
	}
	if got, want := rrInstant(g.head.Cells["reconciled"]), rrInstant(finishedAt.String()); got != want {
		t.Errorf("section reconciled = %q (cell %#v), want finished_at %q", got, g.head.Cells["reconciled"], want)
	}

	wantKinds := []string{reports.KindOpening}
	for range lines {
		wantKinds = append(wantKinds, reports.KindDetail)
	}
	wantKinds = append(wantKinds, reports.KindSubtotal)
	if !slices.Equal(g.kinds, wantKinds) {
		t.Fatalf("section rows = %v, want %v", g.kinds, wantKinds)
	}

	if g.opening.Label != "Beginning balance" {
		t.Errorf("opening label = %q, want \"Beginning balance\"", g.opening.Label)
	}
	beginning := int64(stored.GetInt("beginning_balance"))
	if got := stMoney(t, *g.opening, "balance"); got != beginning {
		t.Errorf("Beginning balance = %d, want the stored beginning balance %d", got, beginning)
	}

	running := beginning
	var debits, credits int64
	for i, want := range lines {
		row := g.lines[i]
		if wantOpen := "books/entries/" + urlKey(t, r.app, want.entry); row.Open != wantOpen {
			t.Errorf("line %d opens %q, want the entry's path %q", i, row.Open, wantOpen)
		}
		if got := rrFigure(t, row, "debit"); got != want.debit {
			t.Errorf("line %d debit = %d, want %d", i, got, want.debit)
		}
		if got := rrFigure(t, row, "credit"); got != want.credit {
			t.Errorf("line %d credit = %d, want %d", i, got, want.credit)
		}
		running += sign * (want.debit - want.credit)
		if got := stMoney(t, row, "balance"); got != running {
			t.Errorf("line %d balance = %d, want the running balance %d", i, got, running)
		}
		rrNoCell(t, row, "statement")
		rrNoCell(t, row, "reconciled")
		debits += want.debit
		credits += want.credit
	}

	total := *g.total
	if got := rrFigure(t, total, "debit"); got != debits {
		t.Errorf("section debit = %d, want the sum %d", got, debits)
	}
	if got := rrFigure(t, total, "credit"); got != credits {
		t.Errorf("section credit = %d, want the sum %d", got, credits)
	}
	if got, want := stMoney(t, total, "balance"), int64(stored.GetInt("statement_balance")); got != want {
		t.Errorf("section balance = %d, want the statement balance %d", got, want)
	}
	rrNoCell(t, total, "statement")
	rrNoCell(t, total, "reconciled")
	return g
}

func TestReconciliationReport_SpecLoads(t *testing.T) {
	r := newRrEnv(t)
	if err := reports.CheckSources(r.app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := reconciliationReportShipped()
	if !jsonEqual(t, shipped.Spec, string(mustJSON(reconciliationReportSpec()))) {
		t.Error("the shipped spec is not reconciliationReportSpec()'s")
	}
	spec, _, err := reports.Load(mustJSON(reconciliationReportSpec()))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := reports.Validate(r.app, spec); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if spec.Source != "books.reconciled_lines" {
		t.Errorf("source = %q, want books.reconciled_lines", spec.Source)
	}
	ids := make([]string, len(spec.Params))
	for i, p := range spec.Params {
		ids[i] = p.ID
	}
	if !reflect.DeepEqual(ids, []string{"accounts", "statement"}) {
		t.Errorf("params = %v, want accounts, statement", ids)
	}

	_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
	r.rrStatement(t, r.savings, "2026-09-30", 1000, line)
	res := r.run(t, nil)
	var visible []string
	groupOnly := map[string]bool{}
	for _, c := range res.Columns {
		visible = append(visible, c.ID)
		groupOnly[c.ID] = c.GroupOnly
	}
	want := []string{"date", "transaction", "payee", "memo", "statement", "reconciled", "debit", "credit", "balance"}
	if !slices.Equal(visible, want) {
		t.Errorf("visible columns = %v, want %v", visible, want)
	}
	for _, id := range want {
		wantOnly := id == "statement" || id == "reconciled"
		if groupOnly[id] != wantOnly {
			t.Errorf("column %s GroupOnly = %v, want %v", id, groupOnly[id], wantOnly)
		}
	}
}

// A bank account: a debit raises the balance, a credit lowers it.
func TestReconciliationReport_Bank(t *testing.T) {
	r := newRrEnv(t)
	_, in1 := r.deposit(t, "2026-08-05", r.savings, 1000)
	_, in2 := r.deposit(t, "2026-08-10", r.savings, 400)
	_, out1 := r.payment(t, "2026-08-12", r.savings, 300)
	first := r.rrStatement(t, r.savings, "2026-08-31", 1100, in1, in2, out1)

	// Two lines on one day: the payment posts first, so posting order puts it
	// before the later deposit.
	inEntry, in3 := r.deposit(t, "2026-09-10", r.savings, 500)
	outEntry, out2 := r.payment(t, "2026-09-12", r.savings, 200)
	lateEntry, in4 := r.deposit(t, "2026-09-12", r.savings, 250)
	second := r.rrStatement(t, r.savings, "2026-09-30", 1650, in3, out2, in4)

	res := r.run(t, map[string]any{"statement": second})
	if got := rrSectionIDs(t, res); !slices.Equal(got, []string{second}) {
		t.Fatalf("sections = %v, want only the second statement %s (the first is %s)", got, second, first)
	}
	label := "1010 Business Savings · reconciled by " + r.users.bookkeeper.GetString("name")
	g := r.requireSection(t, res, second, label, 1, []rrLine{
		{entry: inEntry, debit: 500},
		{entry: outEntry, credit: 200},
		{entry: lateEntry, debit: 250},
	})
	if got := stMoney(t, *g.opening, "balance"); got != 1100 {
		t.Errorf("Beginning balance = %d, want the first statement's balance 1100", got)
	}

	total := totalOf(t, res)
	if got := rrFigure(t, total, "debit"); got != 750 {
		t.Errorf("Total debit = %d, want 750", got)
	}
	if got := rrFigure(t, total, "credit"); got != 200 {
		t.Errorf("Total credit = %d, want 200", got)
	}
	rrNoCell(t, total, "balance")
}

// A credit card: a credit (a charge) raises the amount owed, a debit (a
// payment) lowers it.
func TestReconciliationReport_CreditCard(t *testing.T) {
	r := newRrEnv(t)
	_, charge1 := r.payment(t, "2026-08-06", r.card, 3000)
	r.rrStatement(t, r.card, "2026-08-31", 3000, charge1)

	chargeEntry, charge2 := r.payment(t, "2026-09-04", r.card, 4000)
	paidEntry, paid := r.deposit(t, "2026-09-12", r.card, 1500)
	second := r.rrStatement(t, r.card, "2026-09-30", 5500, charge2, paid)

	res := r.run(t, map[string]any{"statement": second})
	label := "2100 Company Card · reconciled by " + r.users.bookkeeper.GetString("name")
	g := r.requireSection(t, res, second, label, -1, []rrLine{
		{entry: chargeEntry, credit: 4000},
		{entry: paidEntry, debit: 1500},
	})
	if got := stMoney(t, *g.opening, "balance"); got != 3000 {
		t.Errorf("Beginning balance = %d, want the first statement's balance 3000", got)
	}
	if got := stMoney(t, *g.total, "balance"); got != 5500 {
		t.Errorf("section balance = %d, want the statement balance 5500", got)
	}
}

// A finished reconciliation that cleared no line keeps its section.
func TestReconciliationReport_Fill(t *testing.T) {
	r := newRrEnv(t)
	_, line := r.deposit(t, "2026-08-05", r.checking, 800)
	r.rrStatement(t, r.checking, "2026-08-31", 800, line)
	empty := r.rrStatement(t, r.checking, "2026-09-30", 800)

	res := r.run(t, map[string]any{"statement": empty})
	label := "1000 Business Checking · reconciled by " + r.users.bookkeeper.GetString("name")
	g := r.requireSection(t, res, empty, label, 1, nil)
	if got := stMoney(t, *g.opening, "balance"); got != 800 {
		t.Errorf("Beginning balance = %d, want 800", got)
	}
	if got := stMoney(t, *g.total, "balance"); got != 800 {
		t.Errorf("section balance = %d, want its beginning balance 800", got)
	}
}

func TestReconciliationReport_Filters(t *testing.T) {
	r := newRrEnv(t)
	_, c1 := r.deposit(t, "2026-08-05", r.checking, 700)
	checkAug := r.rrStatement(t, r.checking, "2026-08-31", 700, c1)
	open := r.mustStart(t, r.checking, "2026-09-30", 700)

	s1Entry, s1 := r.deposit(t, "2026-08-06", r.savings, 1000)
	savAug := r.rrStatement(t, r.savings, "2026-08-31", 1000, s1)
	s2Entry, s2 := r.deposit(t, "2026-09-06", r.savings, 300)
	savSep := r.rrStatement(t, r.savings, "2026-09-30", 1300, s2)

	_, k1 := r.payment(t, "2026-09-08", r.card, 900)
	cardSep := r.rrStatement(t, r.card, "2026-09-30", 900, k1)

	t.Run("no param: every finished reconciliation, by account number then statement date descending", func(t *testing.T) {
		got := rrSectionIDs(t, r.run(t, nil))
		if want := []string{checkAug, savSep, savAug, cardSep}; !slices.Equal(got, want) {
			t.Errorf("sections = %v, want %v", got, want)
		}
	})

	// With no param the run holds several sections, and the running balance
	// and the opening of each must start again from its own beginning balance:
	// no net of the checking section above or of the other savings section
	// carries into it.
	t.Run("no param: each section of one account opens and runs from its own beginning balance", func(t *testing.T) {
		res := r.run(t, nil)
		label := "1010 Business Savings · reconciled by " + r.users.bookkeeper.GetString("name")
		sep := r.requireSection(t, res, savSep, label, 1, []rrLine{{entry: s2Entry, debit: 300}})
		if got := stMoney(t, *sep.opening, "balance"); got != 1000 {
			t.Errorf("Sep Beginning balance = %d, want the Aug statement's balance 1000", got)
		}
		aug := r.requireSection(t, res, savAug, label, 1, []rrLine{{entry: s1Entry, debit: 1000}})
		if got := stMoney(t, *aug.opening, "balance"); got != 0 {
			t.Errorf("Aug Beginning balance = %d, want 0", got)
		}
	})

	t.Run("one account keeps only its sections", func(t *testing.T) {
		got := rrSectionIDs(t, r.run(t, map[string]any{"accounts": []string{r.savings.Id}}))
		if want := []string{savSep, savAug}; !slices.Equal(got, want) {
			t.Errorf("sections = %v, want %v", got, want)
		}
	})

	t.Run("a statement in progress matches no row", func(t *testing.T) {
		if got := rrSectionIDs(t, r.run(t, map[string]any{"statement": open})); len(got) != 0 {
			t.Errorf("sections = %v, want none for the reconciliation in progress %s", got, open)
		}
	})

	spec, _, err := reports.Load(mustJSON(reconciliationReportSpec()))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	read := func(t *testing.T, param string) *reports.ParamOptions {
		t.Helper()
		options, err := reports.ReadParamOptions(context.Background(), r.app, reports.OptionsRequest{
			Spec: spec, Param: param, Auth: r.users.readOnly, Today: stToday,
		})
		if err != nil {
			t.Fatalf("the %s param's options: %v", param, err)
		}
		return options
	}

	t.Run("the Statement options are the finished reconciliations, by statement day, grouped by account", func(t *testing.T) {
		options := read(t, "statement")
		groups := map[string]string{}
		for _, g := range options.Groups {
			groups[g.Value] = g.Label
		}
		var values []string
		for _, o := range options.Options {
			values = append(values, o.Value)
			stored := reload(t, r.app, rtRecons, o.Value)
			if day := stored.GetString("statement_date")[:10]; !strings.HasPrefix(o.Label, day) {
				t.Errorf("option %s label = %q, want its statement day %s", o.Value, o.Label, day)
			}
			if o.Type != reports.Date {
				t.Errorf("option %s label type = %q, want a date", o.Value, o.Type)
			}
			account := reload(t, r.app, "books_accounts", stored.GetString("account"))
			if got, want := groups[o.Group], account.GetString("full_name"); got != want {
				t.Errorf("option %s group = %q (value %q), want the account's full name %q", o.Value, got, o.Group, want)
			}
		}
		slices.Sort(values)
		want := []string{checkAug, savAug, savSep, cardSep}
		slices.Sort(want)
		if !slices.Equal(values, want) {
			t.Errorf("statement options = %v, want the finished reconciliations %v (not %s, in progress)", values, want, open)
		}
	})

	// Spec §3: the Account filter lists the accounts "by account number", and
	// the reference chip reads "Account: 1000 Business Checking". 1001 Payroll
	// Checking sorts after Company Card by name and second by number; Aardvark
	// Cash has no number, sorts first by name and comes after the numbered ones.
	t.Run("the Account options are the bank and credit card accounts", func(t *testing.T) {
		payroll := mkNumberedAccount(t, r.app, "Payroll Checking", "1001", "bank", "checking")
		cash := mkAccount(t, r.app, "Aardvark Cash", "bank", "checking")
		options := read(t, "accounts")
		var values []string
		seenBlank := false
		lastNumber := ""
		for _, o := range options.Options {
			values = append(values, o.Value)
			account := reload(t, r.app, "books_accounts", o.Value)
			if ty := account.GetString("type"); ty != "bank" && ty != "credit_card" {
				t.Errorf("account option %q is of type %s, want bank or credit_card", o.Label, ty)
			}
			number, fullName := account.GetString("number"), account.GetString("full_name")
			want := fullName
			if number != "" {
				want = number + " " + fullName
			}
			if o.Label != want {
				t.Errorf("account option %s label = %q, want %q", o.Value, o.Label, want)
			}
			switch {
			case number == "":
				seenBlank = true
			case seenBlank:
				t.Errorf("account option %q comes after an account with no number, want the numbered accounts first", o.Label)
			case number < lastNumber:
				t.Errorf("account option %q comes after number %s, want account-number order", o.Label, lastNumber)
			default:
				lastNumber = number
			}
		}
		for _, a := range []*core.Record{r.checking, r.savings, r.card, payroll, cash} {
			if !slices.Contains(values, a.Id) {
				t.Errorf("account options %v have no %s", values, a.GetString("name"))
			}
		}
		var labels []string
		for _, o := range options.Options {
			if slices.Contains([]string{r.checking.Id, payroll.Id, r.savings.Id, r.card.Id, cash.Id}, o.Value) {
				labels = append(labels, o.Label)
			}
		}
		wantLabels := []string{"1000 Business Checking", "1001 Payroll Checking", "1010 Business Savings", "2100 Company Card", "Aardvark Cash"}
		if !slices.Equal(labels, wantLabels) {
			t.Errorf("account option labels = %q, want by account number, the account with no number last, %q", labels, wantLabels)
		}
	})

	// The report and the history order accounts by number (spec §3), so the
	// Statement options' account groups do too, not by the account's name.
	// 1000 is renamed so that its name sorts after those of 1010 and 2100.
	t.Run("the Statement options' account groups come in account-number order", func(t *testing.T) {
		if err := setFields(t, r.app, "books_accounts", r.checking.Id, map[string]any{"name": "Zeta Checking"}); err != nil {
			t.Fatalf("rename 1000: %v", err)
		}
		if got := reload(t, r.app, "books_accounts", r.checking.Id).GetString("full_name"); got != "Zeta Checking" {
			t.Fatalf("1000's full name = %q after the rename, want \"Zeta Checking\"", got)
		}
		var labels []string
		for _, g := range read(t, "statement").Groups {
			labels = append(labels, g.Label)
		}
		if want := []string{"Zeta Checking", "Business Savings", "Company Card"}; !slices.Equal(labels, want) {
			t.Errorf("statement option groups = %q, want by account number (1000, 1010, 2100) %q", labels, want)
		}
	})
}

// An undone reconciliation leaves the report; its second finish brings it
// back with the rows cleared then.
func TestReconciliationReport_UndoLeaves(t *testing.T) {
	r := newRrEnv(t)
	_, first := r.deposit(t, "2026-08-10", r.savings, 1000)
	earlier := r.rrStatement(t, r.savings, "2026-08-31", 1000, first)
	inEntry, in := r.deposit(t, "2026-09-10", r.savings, 500)
	_, out := r.payment(t, "2026-09-12", r.savings, 200)
	id := r.mustStart(t, r.savings, "2026-09-30", 1300)
	r.mustClear(t, id, in)
	outCleared := r.mustClear(t, id, out)
	r.mustFinish(t, id)

	if got := rrSectionIDs(t, r.run(t, nil)); !slices.Equal(got, []string{id, earlier}) {
		t.Fatalf("sections before the undo = %v, want %v", got, []string{id, earlier})
	}

	r.undo(t, r.users.admin, id).requireStatus(t, http.StatusOK)
	requireReconStatus(t, r.app, id, "in_progress")
	if got := rrSectionIDs(t, r.run(t, nil)); !slices.Equal(got, []string{earlier}) {
		t.Errorf("sections after the undo = %v, want only the earlier %s", got, earlier)
	}

	// One line less: the payment is uncleared, and the statement balance follows.
	r.unclear(t, r.users.bookkeeper, outCleared).requireStatus(t, http.StatusNoContent)
	r.update(t, r.users.bookkeeper, id, map[string]any{"statement_balance": 1500}).requireStatus(t, http.StatusOK)
	r.mustFinish(t, id)

	res := r.run(t, map[string]any{"statement": id})
	label := "1010 Business Savings · reconciled by " + r.users.bookkeeper.GetString("name")
	r.requireSection(t, res, id, label, 1, []rrLine{{entry: inEntry, debit: 500}})
	if got := rrSectionIDs(t, r.run(t, nil)); !slices.Equal(got, []string{id, earlier}) {
		t.Errorf("sections after the second finish = %v, want %v", got, []string{id, earlier})
	}
}

// A payee's later rename shows the new name on a reconciled row.
func TestReconciliationReport_PayeeRename(t *testing.T) {
	r := newRrEnv(t)
	vendor := mkVendor(t, r.app, "Summit Supply")
	_, in := r.deposit(t, "2026-09-05", r.savings, 1000)
	paid := rvPosted(t, r.bankMatchEnv, "2026-09-06", "Supplies",
		rvLine{account: r.rent, debit: 500}, rvLine{account: r.savings, credit: 500, vendor: vendor})
	id := r.rrStatement(t, r.savings, "2026-09-30", 500, in, lineOn(t, r.app, paid.Id, r.savings))

	if err := setFields(t, r.app, "books_vendors", vendor.Id, map[string]any{"display_name": "Summit Supply Co"}); err != nil {
		t.Fatalf("rename the vendor: %v", err)
	}
	if got := reload(t, r.app, "books_vendors", vendor.Id).GetString("display_name"); got != "Summit Supply Co" {
		t.Fatalf("the vendor's display name = %q after the rename, want \"Summit Supply Co\"", got)
	}

	g, ok := stGroups(t, r.run(t, map[string]any{"statement": id}))[id]
	if !ok {
		t.Fatalf("no section for reconciliation %s", id)
	}
	var payees []string
	for _, row := range g.lines {
		if row.Open == "books/entries/"+urlKey(t, r.app, paid) {
			payees = append(payees, textCell(t, row, "payee"))
		}
	}
	if !slices.Equal(payees, []string{"Summit Supply Co"}) {
		t.Errorf("the vendor line's payee = %q, want the new name [\"Summit Supply Co\"]", payees)
	}
}

// Register ships the report; core stores it and Books shares it with every
// Books reader.
func TestReconciliationReport_ShippedAndShared(t *testing.T) {
	shipped := reconciliationReportShipped()
	if shipped.Key != "books.reconciliation_report" || shipped.Title != "Reconciliation Report" {
		t.Errorf("key, title = %q, %q; want books.reconciliation_report, Reconciliation Report", shipped.Key, shipped.Title)
	}
	if shipped.Revision != 2 || !shipped.Unpublished || !shipped.Live {
		t.Errorf("revision %d, unpublished %v, live %v; want revision 1, unpublished, live",
			shipped.Revision, shipped.Unpublished, shipped.Live)
	}

	app, _ := newRegisteredApp(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources on a registered app: %v", err)
	}
	mkUser(t, app, "owner")
	bookkeeper := mkUser(t, app, "guest")
	setPkgAccess(t, app, bookkeeper, "full")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.reconciliation_report"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.reconciliation_report: %v", err)
	}
	if got := row.GetString("title"); got != "Reconciliation Report" {
		t.Errorf("stored title = %q, want Reconciliation Report", got)
	}
	if row.GetBool("published") {
		t.Error("the Reconciliation Report is published, want unpublished")
	}
	stored, err := booksReports(app)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(stored, func(rec *core.Record) bool { return rec.Id == row.Id }) {
		t.Error("booksReports does not hold the Reconciliation Report")
	}
	requireViewer(t, app, row, bookkeeper, "a guest with Books full access")
	requireViewer(t, app, row, reader, "a member with Books readonly access")
}
