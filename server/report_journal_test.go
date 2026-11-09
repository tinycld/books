package books

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// jnAugust is the period most Journal tests run over; every entry they post
// is dated in it unless the test says otherwise.
var jnAugust = glPeriod("2026-08-01", "2026-08-31")

// runJournalErr loads the shipped Journal and runs it as reader, as core's run
// endpoint does: Load, then Run with the posted params.
func runJournalErr(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(journalShipped().Spec)
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

func runJournal(t *testing.T, app core.App, reader *core.Record, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := runJournalErr(t, app, reader, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// jnLine is one line of an entry the test saves itself: its id (optional,
// 15 characters), its position in the entry form and its party, in minor
// units.
type jnLine struct {
	id                     string
	account                *core.Record
	debit, credit          int
	position               int
	memo, customer, vendor string
}

// saveJournalDraft saves a manual draft entry with the id given (blank: a new
// id) and its lines in the order given, which need not be their positions.
func saveJournalDraft(t *testing.T, app core.App, id, date, memo string, lines ...jnLine) *core.Record {
	t.Helper()
	fields := map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD", "memo": memo,
	}
	if id != "" {
		fields["id"] = id
	}
	entry := saveRecord(t, app, "books_journal_entries", fields)
	for _, l := range lines {
		line := map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"memo": l.memo, "position": l.position, "currency": "USD",
		}
		if l.id != "" {
			line["id"] = l.id
		}
		if l.customer != "" {
			line["customer"] = l.customer
		}
		if l.vendor != "" {
			line["vendor"] = l.vendor
		}
		saveRecord(t, app, "books_journal_lines", line)
	}
	return entry
}

func postJournal(t *testing.T, app core.App, id, date, memo string, lines ...jnLine) *core.Record {
	t.Helper()
	return mustPost(t, app, saveJournalDraft(t, app, id, date, memo, lines...).Id, "")
}

// setPostedAt rewrites an entry's posting time in SQL, so a test can give two
// entries the same posting time or an order the clock cannot promise.
func setPostedAt(t *testing.T, app core.App, entryID, at string) {
	t.Helper()
	if _, err := app.DB().Update("books_journal_entries", dbx.Params{"posted_at": at}, dbx.HashExp{"id": entryID}).Execute(); err != nil {
		t.Fatalf("set posted_at of %s: %v", entryID, err)
	}
}

// entryOfRow is the entry a block row stands for: the first value of its group
// key, the entry id.
func entryOfRow(t *testing.T, r reports.Row) string {
	t.Helper()
	if len(r.GroupKey) == 0 {
		t.Fatalf("%s (%s) has no group key", r.Label, r.Kind)
	}
	id, ok := r.GroupKey[0].(string)
	if !ok || id == "" {
		t.Fatalf("%s (%s) group key %#v: the first value is a %T, want an entry id string", r.Label, r.Kind, r.GroupKey, r.GroupKey[0])
	}
	return id
}

// blockEntries are the entries of the result's blocks, in the order the
// report shows them.
func blockEntries(t *testing.T, res *reports.Result) []string {
	t.Helper()
	secs := glSections(t, res)
	out := make([]string, len(secs))
	for i, s := range secs {
		out[i] = entryOfRow(t, s.head)
	}
	return out
}

// entriesIn keeps the ids of entries, in the order given.
func entriesIn(order []string, entries ...*core.Record) []string {
	want := map[string]bool{}
	for _, e := range entries {
		want[e.Id] = true
	}
	var out []string
	for _, id := range order {
		if want[id] {
			out = append(out, id)
		}
	}
	return out
}

func findBlock(t *testing.T, res *reports.Result, entry *core.Record) (glSection, bool) {
	t.Helper()
	for _, s := range glSections(t, res) {
		if entryOfRow(t, s.head) == entry.Id {
			return s, true
		}
	}
	return glSection{}, false
}

func blockFor(t *testing.T, res *reports.Result, entry *core.Record) glSection {
	t.Helper()
	s, ok := findBlock(t, res, entry)
	if !ok {
		t.Fatalf("no block for entry %s (%s); blocks %v", entry.Id, entry.GetString("number"), sectionLabels(glSections(t, res)))
	}
	return s
}

func lineIDs(rows []reports.Row) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = strings.TrimPrefix(r.ID, "d:")
	}
	return out
}

func TestJournalSpecLoads(t *testing.T) {
	app := newBooksApp(t)
	registerBooksSources(t)
	if err := reports.CheckSources(app); err != nil {
		t.Fatalf("CheckSources: %v", err)
	}
	shipped := journalShipped()
	if journalKey != "books.journal" || shipped.Key != journalKey {
		t.Errorf("key = %q (const %q), want books.journal", shipped.Key, journalKey)
	}
	if shipped.Title != "Journal" {
		t.Errorf("title = %q, want Journal", shipped.Title)
	}
	if shipped.Description != "Every posted entry with its debit and credit lines, for a period." {
		t.Errorf("description = %q", shipped.Description)
	}
	if shipped.Revision != 1 || !shipped.Unpublished {
		t.Errorf("revision %d, unpublished %v; want revision 1, shipped unpublished", shipped.Revision, shipped.Unpublished)
	}
	built, err := json.Marshal(journalSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(t, shipped.Spec, string(built)) {
		t.Errorf("the shipped spec is not journalSpec()")
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

	if len(spec.Params) != 1 {
		t.Errorf("params = %+v, want exactly one, period", spec.Params)
	}
	if period, ok := findParam(spec, "period"); !ok || period.Type != reports.ParamDateRange ||
		!jsonEqual(t, period.Default, `{"preset":"thisMonthToDate"}`) {
		t.Errorf("period = %+v (default %s), want a date range defaulting to This month to date", period, period.Default)
	}

	type head struct{ id, label string }
	var cols []head
	for _, c := range spec.Columns {
		cols = append(cols, head{c.ID, c.Label})
	}
	wantCols := []head{
		{"entry", "Entry / Date"}, {"account", "Account"}, {"name", "Name"},
		{"description", "Description"}, {"debit", "Debit"}, {"credit", "Credit"},
	}
	if !reflect.DeepEqual(cols, wantCols) {
		t.Errorf("columns = %v, want %v", cols, wantCols)
	}

	if len(spec.Groups) != 1 {
		t.Fatalf("groups = %+v, want one block per entry", spec.Groups)
	}
	g := spec.Groups[0]
	if g.ID != "byEntry" || g.Col != "entry" || !g.Open || !g.Subtotals {
		t.Errorf("group = id %q col %q open %v subtotals %v; want byEntry on entry, open, with subtotals", g.ID, g.Col, g.Open, g.Subtotals)
	}
}

// Blocks come by entry date, then posting order, then entry number sequence;
// lines come by their position in the entry form. Ids are chosen so that the
// record-id order, the insertion order and the order wanted all differ.
func TestJournalBlockOrder(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	reserve := b.account(t, "Reserve", "1010", "bank", "savings")
	supplies := b.account(t, "Supplies", "6100", "expense", "office_general")
	postage := b.account(t, "Postage", "6200", "expense", "office_general")

	// Posted out of date order: the second day's entry first.
	second := postJournal(t, b.app, "", "2026-08-06", "Second day",
		jnLine{account: supplies, debit: 100, position: 0}, jnLine{account: operating, credit: 100, position: 1})
	first := postJournal(t, b.app, "", "2026-08-05", "First day",
		jnLine{account: supplies, debit: 200, position: 0}, jnLine{account: operating, credit: 200, position: 1})

	// One day: a journal entry posted before a transfer whose sequence is lower
	// (sequences are per doc type).
	je := postJournal(t, b.app, "", "2026-08-07", "Posted before the transfer",
		jnLine{account: supplies, debit: 300, position: 0}, jnLine{account: operating, credit: 300, position: 1})
	transfer := mustPost(t, b.app, transferDraft(t, b.app, "2026-08-07", operating, reserve, 400).Id, "")
	if je.GetInt("sequence") <= transfer.GetInt("sequence") {
		t.Fatalf("journal entry sequence %d, transfer sequence %d; the test needs the transfer's lower",
			je.GetInt("sequence"), transfer.GetInt("sequence"))
	}
	setPostedAt(t, b.app, je.Id, "2026-08-07 10:00:00.000Z")
	setPostedAt(t, b.app, transfer.Id, "2026-08-07 11:00:00.000Z")

	// One day, one posting time: the lower sequence first. Every other order
	// puts the higher-sequence entry first: it is saved first, has the lower
	// id, and its number sorts first as text (JE-10 before JE-9), so the
	// fillers bring the pair to sequences 9 and 10.
	for range 5 {
		b.post(t, "2026-08-20", ln{supplies, 10, 0}, ln{operating, 0, 10})
	}
	higherDraft := saveJournalDraft(t, b.app, "aaaaaaaaaaaaaa1", "2026-08-08", "Higher sequence",
		jnLine{account: postage, debit: 600, position: 0}, jnLine{account: operating, credit: 600, position: 1})
	lowerDraft := saveJournalDraft(t, b.app, "zzzzzzzzzzzzzz1", "2026-08-08", "Lower sequence",
		jnLine{account: postage, debit: 500, position: 0}, jnLine{account: operating, credit: 500, position: 1})
	lower := mustPost(t, b.app, lowerDraft.Id, "")
	higher := mustPost(t, b.app, higherDraft.Id, "")
	if lower.GetInt("sequence") >= higher.GetInt("sequence") || lower.GetString("number") <= higher.GetString("number") {
		t.Fatalf("lower %s (sequence %d), higher %s (sequence %d): the test needs the lower sequence with the number that sorts last as text",
			lower.GetString("number"), lower.GetInt("sequence"), higher.GetString("number"), higher.GetInt("sequence"))
	}
	setPostedAt(t, b.app, lower.Id, "2026-08-08 09:00:00.000Z")
	setPostedAt(t, b.app, higher.Id, "2026-08-08 09:00:00.000Z")

	// Lines saved position 2, then 1, then 0, with ids in the same order.
	positioned := postJournal(t, b.app, "", "2026-08-09", "Three lines",
		jnLine{id: "aaaaaaaaaaapos2", account: operating, credit: 900, position: 2},
		jnLine{id: "mmmmmmmmmmmpos1", account: postage, debit: 400, position: 1},
		jnLine{id: "zzzzzzzzzzzpos0", account: supplies, debit: 500, position: 0})

	res := runJournal(t, b.app, b.reader, map[string]any{"period": jnAugust}, reports.Options{Today: glToday})
	got := entriesIn(blockEntries(t, res), first, second, je, transfer, lower, higher, positioned)
	want := idsOf(first, second, je, transfer, lower, higher, positioned)
	if !slices.Equal(got, want) {
		t.Errorf("block order = %v\nwant %v (date, then posting order, then sequence)",
			sectionLabels(glSections(t, res)), want)
	}
	lines := blockFor(t, res, positioned).lines
	if ids := lineIDs(lines); !slices.Equal(ids, []string{"zzzzzzzzzzzpos0", "mmmmmmmmmmmpos1", "aaaaaaaaaaapos2"}) {
		t.Errorf("lines of the three-line entry = %v, want positions 0, 1, 2", ids)
	}
}

// The block heading reads "<number> · <type>" with the Books register's type
// label, "<type>" alone with no number; its total row reads "Total " + heading.
func TestJournalHeadings(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	reserve := b.account(t, "Reserve", "1010", "bank", "savings")
	equity := b.account(t, "Owner's equity", "3000", "equity", "owners_equity")
	postage := b.account(t, "Postage", "6200", "expense", "office_general")
	day := "2026-08-04"

	manual := b.post(t, day, ln{postage, 1200, 0}, ln{operating, 0, 1200})
	transfer := mustPost(t, b.app, transferDraft(t, b.app, day, operating, reserve, 2500).Id, "")
	opening := mustPost(t, b.app, mkOpening(t, b.app, "2026-08-01", "", ln{reserve, 7000, 0}, ln{equity, 0, 7000}).Id, "")
	reversed := b.post(t, day, ln{postage, 800, 0}, ln{operating, 0, 800})
	reversal := mustPost(t, b.app, reversalDraft(t, b.app, reversed, "2026-08-10").Id, "")
	voided := b.post(t, day, ln{postage, 600, 0}, ln{operating, 0, 600})
	if err := setStatus(b.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	voidReversal := findReversal(t, b.app, voided.Id)
	// Posting always numbers an entry; an entry with no number (an imported
	// one) cannot be made through the hooks, so the test blanks it in SQL.
	unnumbered := b.post(t, day, ln{postage, 50, 0}, ln{operating, 0, 50})
	if _, err := b.app.DB().Update("books_journal_entries", dbx.Params{"number": ""}, dbx.HashExp{"id": unnumbered.Id}).Execute(); err != nil {
		t.Fatalf("blank the number: %v", err)
	}

	transferNumber := reload(t, b.app, "books_journal_entries", transfer.Id).GetString("number")
	if !strings.HasPrefix(transferNumber, "TR-") {
		t.Fatalf("transfer number %q, want TR-<n>", transferNumber)
	}
	voidNumber := voided.GetString("number")
	if voidReversal.GetString("number") != voidNumber {
		t.Fatalf("void reversal number %q, want the voided entry's %q", voidReversal.GetString("number"), voidNumber)
	}

	res := runJournal(t, b.app, b.reader, map[string]any{"period": jnAugust}, reports.Options{Today: glToday})
	for _, w := range []struct {
		what  string
		entry *core.Record
		want  string
	}{
		{"a manual entry", manual, manual.GetString("number") + " · Journal entry"},
		{"a transfer", transfer, transferNumber + " · Transfer"},
		{"a reversal", reversal, reversal.GetString("number") + " · Reversal of " + reversed.GetString("number")},
		{"a voided entry", voided, voidNumber + " · Journal entry"},
		{"its void reversal", voidReversal, voidNumber + " · Void reversal of " + voidNumber},
		{"an opening-balance entry", opening, opening.GetString("number") + " · Opening balances"},
		{"an entry with no number", unnumbered, "Journal entry"},
	} {
		block := blockFor(t, res, w.entry)
		if block.head.Label != w.want {
			t.Errorf("heading of %s = %q, want %q", w.what, block.head.Label, w.want)
		}
		if block.total == nil {
			t.Errorf("%s has no block total row", w.what)
			continue
		}
		if block.total.Label != "Total "+w.want {
			t.Errorf("block total of %s = %q, want %q", w.what, block.total.Label, "Total "+w.want)
		}
	}
}

// A line row: its date as the label, Account "<number> <full name>" (the full
// name alone with no number), Name from its customer or vendor, Description
// the line memo else the entry memo, and a blank zero side.
func TestJournalLineColumns(t *testing.T) {
	b := newGLBook(t)
	office := b.account(t, "Office supplies", "6100", "expense", "office_general")
	petty := b.account(t, "Petty cash", "", "bank", "cash_on_hand")
	postage := b.account(t, "Postage", "6200", "expense", "office_general")
	customer := mkCustomer(t, b.app, "Northwind Traders", "")
	vendor := mkVendor(t, b.app, "Paper Supply Co")
	day := "2026-08-04"

	entry := postJournal(t, b.app, "", day, "Entry memo",
		jnLine{account: office, debit: 1200, position: 0, memo: "Toner", customer: customer.Id},
		jnLine{account: postage, debit: 300, position: 1, vendor: vendor.Id},
		jnLine{account: petty, credit: 1500, position: 2})

	res := runJournal(t, b.app, b.reader, map[string]any{"period": jnAugust}, reports.Options{Today: glToday})
	type cols struct{ label, account, name, description string }
	read := func(r reports.Row) cols {
		return cols{
			label: r.Label, account: textCell(t, r, "account"), name: textCell(t, r, "name"),
			description: textCell(t, r, "description"),
		}
	}
	check := func(what string, r reports.Row, want cols) {
		t.Helper()
		if got := read(r); got != want {
			t.Errorf("%s = %+v\nwant %+v", what, got, want)
		}
	}

	officeLine := lineRow(t, res, entryLineOn(t, b.app, entry.Id, office))
	check("the Office supplies line", officeLine, cols{
		label: day, account: "6100 Office supplies", name: "Northwind Traders", description: "Toner",
	})
	requireSplit(t, officeLine, int64(1200), nil)
	postageLine := lineRow(t, res, entryLineOn(t, b.app, entry.Id, postage))
	check("the Postage line", postageLine, cols{
		label: day, account: "6200 Postage", name: "Paper Supply Co", description: "Entry memo",
	})
	requireSplit(t, postageLine, int64(300), nil)
	pettyLine := lineRow(t, res, entryLineOn(t, b.app, entry.Id, petty))
	check("the Petty cash line", pettyLine, cols{
		label: day, account: "Petty cash", name: "", description: "Entry memo",
	})
	requireSplit(t, pettyLine, nil, int64(1500))
}

// Each block total row adds its entry's lines, Debit equal to Credit; the
// report Total adds every line shown.
func TestJournalTotals(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	card := b.account(t, "Visa", "2100", "credit_card", "credit_card")
	software := b.account(t, "Software", "6100", "expense", "dues_subscriptions")
	rent := b.account(t, "Office rent", "6200", "expense", "rent_lease")
	b.post(t, "2026-08-04", ln{software, 12345, 0}, ln{rent, 655, 0}, ln{card, 0, 13000})
	b.post(t, "2026-08-05", ln{rent, 50000, 0}, ln{operating, 0, 20000}, ln{card, 0, 30000})

	res := runJournal(t, b.app, b.reader, map[string]any{"period": jnAugust}, reports.Options{Today: glToday})
	blocks := glSections(t, res)
	if len(blocks) != 2 {
		t.Fatalf("blocks = %v, want the two entries", sectionLabels(blocks))
	}
	for _, s := range blocks {
		if s.total == nil {
			t.Fatalf("%s has no block total row", s.head.Label)
		}
		var lineDebits, lineCredits int64
		for _, r := range s.lines {
			d, _ := moneyCell(t, r, "debit")
			c, _ := moneyCell(t, r, "credit")
			lineDebits += d
			lineCredits += c
		}
		d, _ := moneyCell(t, *s.total, "debit")
		c, _ := moneyCell(t, *s.total, "credit")
		if d != c || d != lineDebits || c != lineCredits || d == 0 {
			t.Errorf("%s total: debit %d, credit %d; its lines add to debit %d, credit %d; want all four equal",
				s.head.Label, d, c, lineDebits, lineCredits)
		}
	}

	total := totalOf(t, res)
	if total.Label != "Total" {
		t.Errorf("total label = %q, want Total", total.Label)
	}
	var lineDebits int64
	for _, r := range res.Rows {
		if r.Kind == reports.KindDetail {
			d, _ := moneyCell(t, r, "debit")
			lineDebits += d
		}
	}
	d, _ := moneyCell(t, total, "debit")
	c, _ := moneyCell(t, total, "credit")
	if d != 63000 || d != c || d != lineDebits {
		t.Errorf("Total debit %d, credit %d; the lines' debits add to %d; want 63000 each", d, c, lineDebits)
	}
}

// Only posted lines dated in the period show; All dates shows every posted
// entry.
func TestJournalPostedOnly(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	kept := b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	draft := mkDraft(t, b.app, "2026-08-05", ln{rent, 999, 0}, ln{operating, 0, 999})
	later := b.post(t, "2026-09-02", ln{rent, 700, 0}, ln{operating, 0, 700})
	earlier := b.post(t, "2026-07-02", ln{rent, 300, 0}, ln{operating, 0, 300})

	res := runJournal(t, b.app, b.reader, map[string]any{"period": jnAugust}, reports.Options{Today: glToday})
	if !hasLineRow(res, entryLineOn(t, b.app, kept.Id, rent)) {
		t.Errorf("the posted entry in the period does not show; blocks %v", sectionLabels(glSections(t, res)))
	}
	if hasLineRow(res, entryLineOn(t, b.app, draft.Id, rent)) {
		t.Errorf("the draft's line shows")
	}
	for name, e := range map[string]*core.Record{"after": later, "before": earlier} {
		if hasLineRow(res, entryLineOn(t, b.app, e.Id, rent)) {
			t.Errorf("a posted line dated %s the period shows", name)
		}
	}

	// The All dates run is the one that pins the posted filter: a draft line's blank day
	// reads as NULL, so the August `between` drops it with or without `posted = true`.
	all := runJournal(t, b.app, b.reader, map[string]any{"period": glAllDates}, reports.Options{Today: glToday})
	if got := entriesIn(blockEntries(t, all), earlier, kept, later, draft); !slices.Equal(got, idsOf(earlier, kept, later)) {
		t.Errorf("All dates blocks = %v, want every posted entry in date order and no draft", sectionLabels(glSections(t, all)))
	}
}

// A viewer sort orders the lines inside each block and leaves the blocks in
// the report's order.
func TestJournalViewSort(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	supplies := b.account(t, "Supplies", "6100", "expense", "office_general")
	postage := b.account(t, "Postage", "6200", "expense", "office_general")
	travel := b.account(t, "Travel", "6300", "expense", "travel")
	firstEntry := b.post(t, "2026-08-03", ln{supplies, 2000, 0}, ln{postage, 5000, 0}, ln{travel, 1000, 0}, ln{operating, 0, 8000})
	secondEntry := b.post(t, "2026-08-04", ln{supplies, 300, 0}, ln{postage, 700, 0}, ln{operating, 0, 1000})
	params := map[string]any{"period": jnAugust}

	debitsOf := func(rows []reports.Row) []int64 {
		var out []int64
		for _, r := range rows {
			if d, ok := moneyCell(t, r, "debit"); ok {
				out = append(out, d)
			}
		}
		return out
	}

	plain := runJournal(t, b.app, b.reader, params, reports.Options{Today: glToday})
	if got := debitsOf(blockFor(t, plain, firstEntry).lines); !slices.Equal(got, []int64{2000, 5000, 1000}) {
		t.Fatalf("unsorted debits = %v, want [2000 5000 1000] (form order)", got)
	}

	sorted := runJournal(t, b.app, b.reader, params, reports.Options{Today: glToday, Sort: []reports.ViewSort{{Col: "debit", Dir: "desc"}}})
	if got := entriesIn(blockEntries(t, sorted), firstEntry, secondEntry); !slices.Equal(got, idsOf(firstEntry, secondEntry)) {
		t.Errorf("sorted blocks = %v, want the report's block order", sectionLabels(glSections(t, sorted)))
	}
	first := blockFor(t, sorted, firstEntry)
	if got := debitsOf(first.lines); !slices.Equal(got, []int64{5000, 2000, 1000}) {
		t.Errorf("first block debits sorted descending = %v, want [5000 2000 1000]", got)
	}
	if len(first.lines) != 4 {
		t.Errorf("first block holds %d lines after the sort, want its 4", len(first.lines))
	}
	if got := debitsOf(blockFor(t, sorted, secondEntry).lines); !slices.Equal(got, []int64{700, 300}) {
		t.Errorf("second block debits sorted descending = %v, want [700 300]", got)
	}
}

func TestJournalNoAccess(t *testing.T) {
	b := newGLBook(t)
	operating := b.account(t, "Operating", "1000", "bank", "checking")
	rent := b.account(t, "Office rent", "6000", "expense", "rent_lease")
	entry := b.post(t, "2026-08-04", ln{rent, 4000, 0}, ln{operating, 0, 4000})
	params := map[string]any{"period": jnAugust}
	opts := reports.Options{Today: glToday}

	if _, ok := findBlock(t, runJournal(t, b.app, b.reader, params, opts), entry); !ok {
		t.Fatal("a Books reader does not see the entry's block")
	}
	res := runJournal(t, b.app, b.env.users.none, params, opts)
	for _, r := range res.Rows {
		if r.Kind != reports.KindTotal {
			t.Errorf("a user with Books level none sees %s row %q", r.Kind, r.Label)
		}
	}
}

// Register ships the Journal; core creates it unpublished, and Books shares it
// with every Books reader.
func TestJournalShippedShared(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": "books.journal"})
	if err != nil {
		t.Fatalf("no reports row with shipped_key books.journal: %v", err)
	}
	if row.GetBool("published") || row.GetString("published_by") != "" {
		t.Errorf("published = %v (by %q), want unpublished", row.GetBool("published"), row.GetString("published_by"))
	}
	if row.GetString("title") != "Journal" || row.GetInt("shipped_revision") != 1 || row.GetString("source") != "books.journal_lines" {
		t.Errorf("row = %v", row.PublicExport())
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	requireViewer(t, app, row, reader, "a Books reader")
}
