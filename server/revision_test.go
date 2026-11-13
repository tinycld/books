package books

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func revisionOf(t testing.TB, app core.App, entryID string) int {
	t.Helper()
	return reload(t, app, "books_journal_entries", entryID).GetInt("revision")
}

func TestRevision_ANewEntryStartsAtOne(t *testing.T) {
	env := newLedgerEnv(t)
	entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": "manual",
	})
	if got := revisionOf(t, env.app, entry.Id); got != 1 {
		t.Fatalf("revision = %d, want 1", got)
	}
}

func TestRevision_ACallerCannotChooseItOnCreate(t *testing.T) {
	env := newLedgerEnv(t)
	col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	entry := core.NewRecord(col)
	entry.Load(map[string]any{"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": "manual", "revision": 7})
	requireRefused(t, env.app.Save(entry), "Books sets these fields itself: revision.")
}

func TestDraftBase_OneBaseForATransactionAndNoneAfterIt(t *testing.T) {
	env := newLedgerEnv(t)
	rollback := errors.New("rolled back by the test")
	var info *core.TxAppInfo
	err := env.app.RunInTransaction(func(tx core.App) error {
		info = tx.TxInfo()
		if base, first := draftBase(tx, "entry1", 4); base != 4 || !first {
			t.Fatalf("first touch = %d/%v, want 4/true", base, first)
		}
		// The stored value moved inside the transaction; the base does not.
		if base, first := draftBase(tx, "entry1", 5); base != 4 || first {
			t.Fatalf("second touch = %d/%v, want 4/false", base, first)
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	if _, kept := draftTouches.Load(touchKey{info, "entry1"}); kept {
		t.Fatal("the base outlived its transaction")
	}
}

func addLine(t testing.TB, app core.App, entryID string, account *core.Record, debit, credit int) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_journal_lines", map[string]any{
		"entry": entryID, "account": account.Id, "debit": debit, "credit": credit, "position": 9,
	})
}

func TestRevision_EachLineWriteInItsOwnTransactionAddsOne(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100) // create + two line creates, three transactions
	if got := revisionOf(t, env.app, entry.Id); got != 3 {
		t.Fatalf("revision after the create and two lines = %d, want 3", got)
	}
	line := addLine(t, env.app, entry.Id, env.rent, 5, 0)
	if got := revisionOf(t, env.app, entry.Id); got != 4 {
		t.Fatalf("revision after a line create = %d, want 4", got)
	}
	// A change that leaves the debit total as it is still counts.
	line.Set("account", env.checking.Id)
	if err := env.app.Save(line); err != nil {
		t.Fatal(err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != 5 {
		t.Fatalf("revision after an account change = %d, want 5", got)
	}
	if err := env.app.Delete(line); err != nil {
		t.Fatal(err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != 6 {
		t.Fatalf("revision after a line delete = %d, want 6", got)
	}
}

func TestRevision_ManyWritesInOneTransactionAddOne(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	before := revisionOf(t, env.app, entry.Id)

	err := env.app.RunInTransaction(func(tx core.App) error {
		for i := 0; i < 5; i++ {
			addLine(t, tx, entry.Id, env.rent, 1, 0)
		}
		fresh, err := tx.FindRecordById("books_journal_entries", entry.Id)
		if err != nil {
			return err
		}
		fresh.Set("memo", "changed in the same transaction")
		return tx.Save(fresh)
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d: one transaction is one change", got, before+1)
	}
}

func TestRevision_AHeaderEditAddsOne(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	before := revisionOf(t, env.app, entry.Id)
	fresh := reload(t, env.app, "books_journal_entries", entry.Id)
	fresh.Set("memo", "new memo")
	if err := env.app.Save(fresh); err != nil {
		t.Fatal(err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d", got, before+1)
	}
}

// Books' own callers (a reversal, the auto-reverse sweep, a document's post)
// save through the model path and state no revision.
func TestRevision_AGoCallerPostsWithNoRevision(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	before := revisionOf(t, env.app, entry.Id)
	posted := mustPost(t, env.app, entry.Id, env.users.bookkeeper.Id)
	if got := posted.GetInt("revision"); got != before+1 {
		t.Fatalf("revision after the post = %d, want %d", got, before+1)
	}
	requireNoDrift(t, env.app)
}

// A Go caller states no revision. Whatever its record carries is replaced:
// the count cannot jump, and a record kept from before a line write is not
// refused for the old value it holds.
func TestRevision_AGoCallersValueIsReplaced(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100) // held from the create: carries revision 1, stored is 3
	before := revisionOf(t, env.app, entry.Id)

	entry.Set("memo", "saved from a record held since the create")
	if err := env.app.Save(entry); err != nil {
		t.Fatalf("save a held record: %v", err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != before+1 {
		t.Fatalf("revision = %d, want %d", got, before+1)
	}

	fresh := reload(t, env.app, "books_journal_entries", entry.Id)
	fresh.Set("revision", fresh.GetInt("revision")+5)
	if err := env.app.Save(fresh); err != nil {
		t.Fatalf("save with a jumped revision: %v", err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != before+2 {
		t.Fatalf("revision = %d, want %d: the count cannot jump", got, before+2)
	}
}

func TestRevision_APostedEntryKeepsItsRevisionWhenVoided(t *testing.T) {
	env := newLedgerEnv(t)
	actor := env.users.bookkeeper.Id
	entry := env.sale(t, "2026-05-10", 100)
	posted := mustPost(t, env.app, entry.Id, actor)
	if err := setStatus(env.app, entry.Id, statusVoid, actor); err != nil {
		t.Fatal(err)
	}
	if got := revisionOf(t, env.app, entry.Id); got != posted.GetInt("revision") {
		t.Fatalf("revision after the void = %d, want %d", got, posted.GetInt("revision"))
	}
}

// postBody is the body of a request that posts a draft as its current reader:
// it states the revision the draft has now.
func postBody(t testing.TB, app core.App, entryID string) string {
	t.Helper()
	return fmt.Sprintf(`{"status":"posted","revision":%d}`, revisionOf(t, app, entryID)+1)
}

func patchEntry(env *ledgerEnv, t *testing.T, entryID, body string, want int, content ...string) {
	t.Helper()
	apiReq{
		method: http.MethodPatch, url: "/api/collections/books_journal_entries/records/" + entryID,
		token: tokenFor(t, env.users.bookkeeper), body: body, want: want, content: content,
	}.run(t, env.app)
}

func mustLines(t testing.TB, app core.App, entryID string) []*core.Record {
	t.Helper()
	lines, err := entryLines(app, entryID)
	if err != nil {
		t.Fatal(err)
	}
	return lines
}

// lineWith returns the first line on the debit side (or the credit side).
func lineWith(t testing.TB, lines []*core.Record, debit bool) *core.Record {
	t.Helper()
	for _, l := range lines {
		if (l.GetInt("debit") > 0) == debit {
			return l
		}
	}
	t.Fatal("no such line")
	return nil
}

func TestRequestRevision_ACurrentPostPasses(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	saw := revisionOf(t, env.app, entry.Id)
	patchEntry(env, t, entry.Id, postBody(t, env.app, entry.Id), http.StatusOK, `"status":"posted"`)
	if got := revisionOf(t, env.app, entry.Id); got != saw+1 {
		t.Fatalf("revision = %d, want %d", got, saw+1)
	}
}

func TestRequestRevision_AStalePostIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	staleBody := postBody(t, env.app, entry.Id)
	// Another editor changes both sides to 200.
	for _, line := range mustLines(t, env.app, entry.Id) {
		if line.GetInt("debit") > 0 {
			line.Set("debit", 200)
		} else {
			line.Set("credit", 200)
		}
		if err := env.app.Save(line); err != nil {
			t.Fatal(err)
		}
	}
	patchEntry(env, t, entry.Id, staleBody, http.StatusConflict, msgRevisionConflict)
	if got := reload(t, env.app, "books_journal_entries", entry.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q: a stale post must not post", got)
	}
}

// One revision behind, and only the entry is sent: the stated value equals
// the stored one. It is still stale.
func TestRequestRevision_OneBehindIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	staleBody := postBody(t, env.app, entry.Id)
	fresh := reload(t, env.app, "books_journal_entries", entry.Id)
	fresh.Set("memo", "another editor's memo")
	if err := env.app.Save(fresh); err != nil {
		t.Fatal(err)
	}
	patchEntry(env, t, entry.Id, staleBody, http.StatusConflict, msgRevisionConflict)
}

func TestRequestRevision_ADraftUpdateWithNoRevisionIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	patchEntry(env, t, entry.Id, `{"memo":"no revision stated"}`, http.StatusConflict, msgRevisionConflict)
}

func TestRequestRevision_AVoidNeedsNone(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	mustPost(t, env.app, entry.Id, env.users.bookkeeper.Id)
	patchEntry(env, t, entry.Id, `{"status":"void"}`, http.StatusOK, `"status":"void"`)
}

// The shape the client sends: line operations first, then one entry update
// that states the revision and posts.
func TestRequestRevision_ABatchOfLinesThenThePost(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entry := env.sale(t, "2026-05-10", 100)
	saw := revisionOf(t, env.app, entry.Id)
	lines := mustLines(t, env.app, entry.Id)

	ops := []string{
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"debit":150}}`, lineWith(t, lines, true).Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"credit":150}}`, lineWith(t, lines, false).Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/%s","body":{"memo":"reviewed","status":"posted","revision":%d}}`, entry.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{`"status":"posted"`},
	}.run(t, env.app)

	posted := reload(t, env.app, "books_journal_entries", entry.Id)
	if posted.GetInt("total") != 150 || posted.GetInt("revision") != saw+1 {
		t.Fatalf("total/revision = %d/%d, want 150/%d", posted.GetInt("total"), posted.GetInt("revision"), saw+1)
	}
	requireNoDrift(t, env.app)
}

// A stale batch changes nothing: the line writes roll back with the refusal.
func TestRequestRevision_AStaleBatchChangesNothing(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entry := env.sale(t, "2026-05-10", 100)
	saw := revisionOf(t, env.app, entry.Id)
	addLine(t, env.app, entry.Id, env.rent, 5, 0) // another editor
	lines := mustLines(t, env.app, entry.Id)

	ops := []string{
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"debit":999}}`, lineWith(t, lines, true).Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/%s","body":{"memo":"stale","revision":%d}}`, entry.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusBadRequest, content: []string{msgRevisionConflict},
	}.run(t, env.app)

	if got := lineWith(t, mustLines(t, env.app, entry.Id), true).GetInt("debit"); got == 999 {
		t.Fatal("the stale batch's line write was kept")
	}
	if got := revisionOf(t, env.app, entry.Id); got != saw+1 {
		t.Fatalf("revision = %d, want %d (the other editor's one change)", got, saw+1)
	}
}

// A number field accepts "revision+": 1, which always resolves to the stored
// value plus one. That states nothing about what the caller saw.
func TestRequestRevision_AModifierIsNotAStatement(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	patchEntry(env, t, entry.Id, `{"status":"posted","revision+":1}`, http.StatusConflict, msgRevisionConflict)
	if got := reload(t, env.app, "books_journal_entries", entry.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q: the entry must not post", got)
	}
}

func TestRequestRevision_AStaleDraftSaveIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	saw := revisionOf(t, env.app, entry.Id)
	addLine(t, env.app, entry.Id, env.rent, 5, 0) // another editor
	patchEntry(env, t, entry.Id, fmt.Sprintf(`{"memo":"stale","revision":%d}`, saw+1), http.StatusConflict, msgRevisionConflict)
}
