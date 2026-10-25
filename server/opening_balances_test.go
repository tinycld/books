package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	openingAlready = "Opening balances are already entered ("
	openingEdit    = "). Edit that entry."
	openingScreen  = "An opening balance entry can be edited only on the Opening balances screen."
	sameOrigin     = "A correction must have the same origin as the entry it replaces."
)

// mkOpening saves an opening-balance draft and its lines directly. replaces
// is the posted opening entry it corrects, or "".
func mkOpening(t testing.TB, app core.App, date, replaces string, lines ...ln) *core.Record {
	t.Helper()
	fields := map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "opening_balance", "currency": "USD",
	}
	if replaces != "" {
		fields["replaces"] = replaces
	}
	entry := saveRecord(t, app, "books_journal_entries", fields)
	for i, l := range lines {
		saveRecord(t, app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"position": i, "currency": "USD",
		})
	}
	return entry
}

func (env *ledgerEnv) opening(t testing.TB, date, replaces string, amount int) *core.Record {
	t.Helper()
	return mkOpening(t, env.app, date, replaces, ln{env.checking, amount, 0}, ln{env.revenue, 0, amount})
}

func countOpening(t testing.TB, app core.App, filter string) int {
	t.Helper()
	rows, err := app.FindAllRecords("books_journal_entries",
		dbx.NewExp("origin = 'opening_balance' AND "+filter))
	if err != nil {
		t.Fatalf("count opening entries: %v", err)
	}
	return len(rows)
}

// (1)
func TestOpening_ADraftPostsThroughTheRealPath(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, env.users.bookkeeper.Id)
	if posted.GetString("origin") != "opening_balance" {
		t.Errorf("origin = %q, want %q", posted.GetString("origin"), "opening_balance")
	}
	if posted.GetString("number") != "1" || posted.GetInt("total") != 5000 || posted.GetString("status") != statusPosted {
		t.Fatalf("posted = %v", posted.PublicExport())
	}
	if d, c := balanceOf(t, env.app, env.checking, "2025-12"); d != 5000 || c != 0 {
		t.Errorf("checking %d/%d, want 5000/0", d, c)
	}
	if d, c := balanceOf(t, env.app, env.revenue, "2025-12"); d != 0 || c != 5000 {
		t.Errorf("revenue %d/%d, want 0/5000", d, c)
	}
	requireNoDrift(t, env.app)
}

// (2)
func TestOpening_ASecondDraftIsRefusedAtCreate(t *testing.T) {
	env := newLedgerEnv(t)
	existing := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, "")
	col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	second := core.NewRecord(col)
	second.Set("date", "2025-12-31")
	second.Set("status", "draft")
	second.Set("doc_type", "journal")
	second.Set("origin", "opening_balance")
	err = env.app.Save(second)
	requireRefused(t, err, openingAlready+entryName(existing)+openingEdit)
	if n := countOpening(t, env.app, "1=1"); n != 1 {
		t.Errorf("opening entries = %d, want 1", n)
	}
}

// (3)
func TestOpening_ASecondLiveEntryIsRefusedAtPost(t *testing.T) {
	env := newLedgerEnv(t)
	a := env.opening(t, "2025-12-31", "", 5000)
	mustPost(t, env.app, a.Id, "")
	if err := setStatus(env.app, a.Id, statusVoid, ""); err != nil {
		t.Fatalf("void A: %v", err)
	}
	b := env.opening(t, "2025-12-31", "", 7000)
	// Raw SQL on purpose: no Go path makes a void entry live again.
	if _, err := env.app.DB().NewQuery("UPDATE books_journal_entries SET status = 'posted' WHERE id = {:id}").
		Bind(dbx.Params{"id": a.Id}).Execute(); err != nil {
		t.Fatalf("set A back to posted: %v", err)
	}
	err := setStatus(env.app, b.Id, statusPosted, "")
	requireRefused(t, err, openingAlready+entryName(reload(t, env.app, "books_journal_entries", a.Id))+openingEdit)
	after := reload(t, env.app, "books_journal_entries", b.Id)
	if after.GetString("status") != statusDraft || after.GetString("number") != "" {
		t.Errorf("B after the refused post: %v", after.PublicExport())
	}
}

// (4)
func TestOpening_AReplacementTakesTheNumberAndVoidsTheOriginal(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, "")
	replacement := env.opening(t, "2025-12-31", original.Id, 6000)
	posted := mustPost(t, env.app, replacement.Id, env.users.bookkeeper.Id)
	if posted.GetString("number") != original.GetString("number") || posted.GetInt("sequence") != original.GetInt("sequence") {
		t.Errorf("replacement number %q seq %d, want the original's %q seq %d",
			posted.GetString("number"), posted.GetInt("sequence"), original.GetString("number"), original.GetInt("sequence"))
	}
	if s := reload(t, env.app, "books_journal_entries", original.Id).GetString("status"); s != statusVoid {
		t.Errorf("original status %q, want void", s)
	}
	if n := countOpening(t, env.app, "status = 'posted'"); n != 1 {
		t.Errorf("posted opening entries = %d, want 1", n)
	}
	if d, c := balanceOf(t, env.app, env.checking, "2025-12"); d-c != 6000 {
		t.Errorf("checking net %d, want 6000", d-c)
	}
	requireNoDrift(t, env.app)
}

// (5)
func TestOpening_ACorrectionMustKeepTheOrigin(t *testing.T) {
	t.Run("a manual draft replacing an opening entry", func(t *testing.T) {
		env := newLedgerEnv(t)
		opening := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, "")
		draft := correctionDraft(t, env, opening, "2025-12-31", 5500)
		requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), openingScreen)
		requireStillPosted(t, env.app, opening.Id)
	})
	t.Run("an opening draft replacing a manual entry", func(t *testing.T) {
		env := newLedgerEnv(t)
		manual := mustPost(t, env.app, env.sale(t, "2025-12-31", 5000).Id, "")
		draft := env.opening(t, "2025-12-31", manual.Id, 5500)
		requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), openingScreen)
		requireStillPosted(t, env.app, manual.Id)
	})
	t.Run("a reversal draft replacing a manual entry", func(t *testing.T) {
		env := newLedgerEnv(t)
		manual := mustPost(t, env.app, env.sale(t, "2025-12-31", 5000).Id, "")
		draft := correctionDraft(t, env, manual, "2025-12-31", 5500)
		// Raw SQL on purpose: the create hook refuses a reversal that names
		// nothing to reverse, so the origin is changed under it.
		if _, err := env.app.DB().NewQuery("UPDATE books_journal_entries SET origin = 'reversal' WHERE id = {:id}").
			Bind(dbx.Params{"id": draft.Id}).Execute(); err != nil {
			t.Fatalf("set the origin: %v", err)
		}
		requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), sameOrigin)
		requireStillPosted(t, env.app, manual.Id)
	})
}

// (6)
func TestOpening_AClosedPeriodRefusesTheDate(t *testing.T) {
	env := newLedgerEnv(t)
	setCloseDate(t, env.app, "2025-12-31")
	entry := env.opening(t, "2025-12-31", "", 5000)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id), "closed through 2025-12-31")
	requireNothingPosted(t, env.app, entry.Id)
}

// (7)
func TestOpening_ALineAboveMaxAmountIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.opening(t, "2025-12-31", "", 5000)
	col, err := env.app.FindCollectionByNameOrId("books_journal_lines")
	if err != nil {
		t.Fatal(err)
	}
	over := core.NewRecord(col)
	over.Set("entry", entry.Id)
	over.Set("account", env.checking.Id)
	over.Set("debit", maxAmount+1)
	over.Set("credit", 0)
	over.Set("position", 2)
	over.Set("currency", "USD")
	// The wording belongs to PocketBase; only the refusal and its effects matter.
	if err := env.app.Save(over); err == nil {
		t.Fatal("expected the over-limit line to be refused")
	}
	lines, err := entryLines(env.app, entry.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 {
		t.Errorf("lines for the entry = %d, want the original 2", len(lines))
	}
	requireNothingPosted(t, env.app, entry.Id)
}

// (8)
func TestOpening_AVoidEntryDoesNotBlockANewOne(t *testing.T) {
	env := newLedgerEnv(t)
	a := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, "")
	if err := setStatus(env.app, a.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	b := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 7000).Id, "")
	if b.GetString("status") != statusPosted {
		t.Fatalf("B = %v", b.PublicExport())
	}
	if n := countOpening(t, env.app, "status = 'posted'"); n != 1 {
		t.Errorf("live opening entries = %d, want 1", n)
	}
}

// (9) Fails if the create hook is not wrapped in serialized: the racing create
// then passes its guard while the first create sits before its write.
func TestOpening_TwoCreatesRaceAndOneWins(t *testing.T) {
	env := newLedgerEnv(t)
	col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	newDraft := func() *core.Record {
		r := core.NewRecord(col)
		r.Set("date", "2025-12-31")
		r.Set("status", "draft")
		r.Set("doc_type", "journal")
		r.Set("origin", "opening_balance")
		return r
	}
	racing := bindRace(t, env.app.OnRecordCreate("books_journal_entries"), func() error {
		return env.app.Save(newDraft())
	})
	if err := env.app.Save(newDraft()); err != nil {
		t.Fatalf("first create: %v", err)
	}
	err = racing()
	requireRefused(t, err, openingAlready+"a saved draft"+openingEdit)
	if n := countOpening(t, env.app, "status != 'void'"); n != 1 {
		t.Errorf("live opening entries = %d, want 1", n)
	}
}

// (10)
func TestOpening_ADraftCannotReverseAnEntry(t *testing.T) {
	env := newLedgerEnv(t)
	target := mustPost(t, env.app, env.sale(t, "2025-12-31", 5000).Id, "")
	col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	draft := core.NewRecord(col)
	draft.Set("date", "2025-12-31")
	draft.Set("status", "draft")
	draft.Set("doc_type", "journal")
	draft.Set("origin", "opening_balance")
	draft.Set("reverses", target.Id)
	err = checkNewEntry(draft)
	if err == nil || err.Error() != "An opening balance entry cannot reverse another entry." {
		t.Fatalf("checkNewEntry = %v, want exactly the opening-balance refusal", err)
	}
	requireRefused(t, env.app.Save(draft), "An opening balance entry cannot reverse another entry.")
}

// (11a)
func TestOpening_TotalOverTheStoredLimitIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	var lines []ln
	for range 10 {
		lines = append(lines, ln{env.checking, maxAmount, 0}, ln{env.revenue, 0, maxAmount})
	}
	entry := mkOpening(t, env.app, "2025-12-31", "", lines...)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""),
		"largest amount Books can store (90071992547409.91)")
	requireNothingPosted(t, env.app, entry.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2025-12"); d != 0 || c != 0 {
		t.Errorf("a refused post moved a balance: %d/%d", d, c)
	}
}

// (11b)
func TestOpening_BalanceRowOverTheStoredLimitIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	saveRecord(t, env.app, "books_account_balances", map[string]any{
		"account": env.checking.Id, "period": "2025-12", "debit_total": maxStoredAmount - 50, "currency": "USD",
	})
	entry := env.opening(t, "2025-12-31", "", 100)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""),
		"Checking for 2025-12 past the largest amount Books can store (90071992547409.91)")
	requireNothingPosted(t, env.app, entry.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2025-12"); d != maxStoredAmount-50 || c != 0 {
		t.Errorf("checking = %d/%d, want the seeded row unchanged", d, c)
	}
	if d, c := balanceOf(t, env.app, env.revenue, "2025-12"); d != 0 || c != 0 {
		t.Errorf("revenue = %d/%d, want no row", d, c)
	}
}
