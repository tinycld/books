package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestImmutable_PostedEntryRefusesChanges(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	posted.Set("memo", "rewritten")
	requireRefused(t, env.app.Save(posted), "Journal entry 1 is posted and cannot change (memo)")
	requireRefused(t, setStatus(env.app, posted.Id, statusDraft, ""), "cannot go from posted to draft")
	requireRefused(t, env.app.Delete(reload(t, env.app, "books_journal_entries", posted.Id)), "cannot be deleted. Void it instead")
}

func TestImmutable_PostedLinesRefuseChanges(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	lines, _ := entryLines(env.app, posted.Id)
	lines[0].Set("debit", 1)
	requireRefused(t, env.app.Save(lines[0]), "its lines cannot change")
	requireRefused(t, env.app.Delete(reload(t, env.app, "books_journal_lines", lines[1].Id)), "its lines cannot change")
	col, _ := env.app.FindCollectionByNameOrId("books_journal_lines")
	extra := core.NewRecord(col)
	extra.Load(map[string]any{"entry": posted.Id, "account": env.rent.Id, "debit": 5})
	requireRefused(t, env.app.Save(extra), "its lines cannot change")
}

func TestImmutable_PostedLineOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	lines, _ := entryLines(env.app, posted.Id)
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_journal_lines/records/" + lines[0].Id,
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"debit":1}`,
		want:    http.StatusBadRequest,
		content: []string{"its lines cannot change"},
	}.run(t, env.app)
}

func TestImmutable_ANoOpSaveIsAllowed(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	if err := env.app.Save(posted); err != nil {
		t.Fatalf("saving an unchanged posted entry: %v", err)
	}
}

// PocketBase clears an optional user relation when that user is hard-deleted.
// That one change to a posted entry is allowed, so Books never blocks a user
// delete over attribution.
func TestImmutable_DeletingThePosterClearsTheLinkOnly(t *testing.T) {
	env := newLedgerEnv(t)
	poster := mkUser(t, env.app, "member")
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, poster.Id)
	if err := env.app.Delete(poster); err != nil {
		t.Fatalf("delete the poster: %v", err)
	}
	after := reload(t, env.app, "books_journal_entries", posted.Id)
	if after.GetString("posted_by") != "" || after.GetString("number") != "1" || after.GetString("status") != statusPosted {
		t.Fatalf("after = %v", after.PublicExport())
	}
}

func TestImmutable_DraftsDeleteWithTheirLines(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-10", 100)
	if err := env.app.Delete(draft); err != nil {
		t.Fatalf("delete draft: %v", err)
	}
	if n, _ := env.app.CountRecords("books_journal_lines"); n != 0 {
		t.Fatalf("%d lines survived their draft", n)
	}
}

func TestImmutable_ALineCannotMoveEntries(t *testing.T) {
	env := newLedgerEnv(t)
	a := env.sale(t, "2026-05-10", 100)
	b := env.sale(t, "2026-05-11", 100)
	lines, _ := entryLines(env.app, a.Id)
	lines[0].Set("entry", b.Id)
	requireRefused(t, env.app.Save(lines[0]), "cannot move to another journal entry")
}

func TestImmutable_ClientCannotAddLinesToAReversal(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	rev := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-06-01", "status": "draft", "doc_type": "journal", "origin": "reversal", "reverses": posted.Id,
	})
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_lines/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5}`, rev.Id, env.rent.Id),
		want:    http.StatusBadRequest,
		content: []string{"Books writes the lines of a reversal"},
	}.run(t, env.app)
}

// A line moves neither onto nor off a posted entry, whichever side is posted.
func TestImmutable_ALineCannotMoveOntoOrOffAPostedEntry(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	draft := env.sale(t, "2026-05-11", 100)
	draftLines, _ := entryLines(env.app, draft.Id)
	draftLines[0].Set("entry", posted.Id)
	requireRefused(t, env.app.Save(draftLines[0]), "cannot move to another journal entry")
	postedLines, _ := entryLines(env.app, posted.Id)
	postedLines[0].Set("entry", draft.Id)
	requireRefused(t, env.app.Save(postedLines[0]), "cannot move to another journal entry")
}

// voidLedger is the Task 3 seed plus a void entry with one line, saved with
// no hooks bound (Books cannot void until the void transition exists), and
// then the ledger hooks bound on top.
type voidLedger struct {
	ledgerRows
	void, voidLine *core.Record
}

func newVoidLedger(t *testing.T) (*tests.TestApp, levelUsers, *voidLedger) {
	t.Helper()
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	rows := seedLedgerRows(t, app)
	void := mkDraft(t, app, "2026-05-03", ln{rows.account, 100, 0})
	void.Set("status", statusVoid)
	void.Set("number", "2")
	void.Set("sequence", 2)
	if err := app.Save(void); err != nil {
		t.Fatalf("void fixture: %v", err)
	}
	voidLines, _ := entryLines(app, void.Id)
	registerLedger(app)
	return app, users, &voidLedger{ledgerRows: rows, void: void, voidLine: voidLines[0]}
}

// The line rules (Task 3) check the caller's level, not the entry's status, so
// these REST writes pass the rules and the guard alone refuses them.
func TestImmutable_LineWritesOverRESTOnPostedAndVoidEntries(t *testing.T) {
	const lines = "/api/collections/books_journal_lines/records"
	cases := []struct {
		name    string
		method  string
		url     func(r *voidLedger) string
		body    func(r *voidLedger) string
		want    int
		content []string
	}{
		{"add a line to a posted entry", http.MethodPost,
			func(*voidLedger) string { return lines },
			func(r *voidLedger) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5}`, r.posted.Id, r.account.Id)
			}, http.StatusBadRequest, []string{"Journal entry 1 is posted, so its lines cannot change"}},
		{"edit a line of a posted entry", http.MethodPatch,
			func(r *voidLedger) string { return lines + "/" + r.postedLine.Id },
			func(*voidLedger) string { return `{"memo":"x"}` },
			http.StatusBadRequest, []string{"Journal entry 1 is posted, so its lines cannot change"}},
		{"delete a line of a posted entry", http.MethodDelete,
			func(r *voidLedger) string { return lines + "/" + r.postedLine.Id },
			func(*voidLedger) string { return "" },
			http.StatusBadRequest, []string{"Journal entry 1 is posted, so its lines cannot change"}},
		{"add a line to a void entry", http.MethodPost,
			func(*voidLedger) string { return lines },
			func(r *voidLedger) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5}`, r.void.Id, r.account.Id)
			}, http.StatusBadRequest, []string{"Journal entry 2 is void, so its lines cannot change"}},
		{"edit a line of a void entry", http.MethodPatch,
			func(r *voidLedger) string { return lines + "/" + r.voidLine.Id },
			func(*voidLedger) string { return `{"debit":1}` },
			http.StatusBadRequest, []string{"Journal entry 2 is void, so its lines cannot change"}},
		{"delete a line of a void entry", http.MethodDelete,
			func(r *voidLedger) string { return lines + "/" + r.voidLine.Id },
			func(*voidLedger) string { return "" },
			http.StatusBadRequest, []string{"Journal entry 2 is void, so its lines cannot change"}},
		// The rule pins `entry` on update, so a move is refused before the guard.
		{"move a draft line onto a posted entry", http.MethodPatch,
			func(r *voidLedger) string { return lines + "/" + r.draftLine.Id },
			func(r *voidLedger) string { return fmt.Sprintf(`{"entry":%q}`, r.posted.Id) },
			http.StatusNotFound, nil},
		{"move a posted line onto a draft", http.MethodPatch,
			func(r *voidLedger) string { return lines + "/" + r.postedLine.Id },
			func(r *voidLedger) string { return fmt.Sprintf(`{"entry":%q}`, r.draft.Id) },
			http.StatusNotFound, nil},
		{"edit a line of a draft", http.MethodPatch,
			func(r *voidLedger) string { return lines + "/" + r.draftLine.Id },
			func(*voidLedger) string { return `{"memo":"still a draft"}` },
			http.StatusOK, []string{"still a draft"}},
		{"add a line to a draft", http.MethodPost,
			func(*voidLedger) string { return lines },
			func(r *voidLedger) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5}`, r.draft.Id, r.account.Id)
			}, http.StatusOK, []string{`"debit":5`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app, users, rows := newVoidLedger(t)
			apiReq{
				method: tc.method, url: tc.url(rows), token: tokenFor(t, users.bookkeeper),
				body: tc.body(rows), want: tc.want, content: tc.content,
			}.run(t, app)
		})
	}
}

func TestImmutable_VoidEntryRefusesChanges(t *testing.T) {
	app, _, rows := newVoidLedger(t)
	void := reload(t, app, "books_journal_entries", rows.void.Id)
	void.Set("memo", "rewritten")
	requireRefused(t, app.Save(void), "Journal entry 2 is void and cannot change.")
	requireRefused(t, setStatus(app, rows.void.Id, statusPosted, ""), "cannot go from void to posted")
	requireMessage(t, app.Delete(reload(t, app, "books_journal_entries", rows.void.Id)), "Journal entry 2 is void and cannot be deleted.")
	if n, _ := app.CountRecords("books_journal_lines"); n != 3 {
		t.Fatalf("lines = %d, want 3 (a refused delete keeps every line)", n)
	}
	line := reload(t, app, "books_journal_lines", rows.voidLine.Id)
	line.Set("memo", "x")
	requireMessage(t, app.Save(line), "Journal entry 2 is void, so its lines cannot change.")
}

// A void entry is already voided, so its refusals must not tell the caller to
// void it. A posted entry's refusals do.
func TestImmutable_PostedRefusalsPointAtVoid(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	requireMessage(t, env.app.Delete(posted), "Journal entry 1 is posted and cannot be deleted. Void it instead.")
	lines, _ := entryLines(env.app, posted.Id)
	lines[0].Set("memo", "x")
	requireMessage(t, env.app.Save(lines[0]),
		"Journal entry 1 is posted, so its lines cannot change. Void the entry or edit it instead.")
}

// requireMessage asserts the whole refusal, for messages whose wording matters.
func requireMessage(t testing.TB, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected the refusal %q, got none", want)
	}
	if err.Error() != want {
		t.Fatalf("refusal = %q, want %q", err.Error(), want)
	}
}

// Only PocketBase's unlink of a deleted user may clear a user link. While the
// user exists, clearing the link is a change like any other.
func TestImmutable_ClearingALinkToALiveUserIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	creator := mkUser(t, env.app, "member")
	entry := draftCreatedBy(t, env, creator)
	posted := mustPost(t, env.app, entry.Id, env.users.admin.Id)

	posted.Set("posted_by", "")
	requireRefused(t, env.app.Save(posted), "is posted and cannot change (posted_by)")

	posted = reload(t, env.app, "books_journal_entries", posted.Id)
	posted.Set("created_by", "")
	requireRefused(t, env.app.Save(posted), "is posted and cannot change (created_by)")

	draft := draftCreatedBy(t, env, creator)
	draft.Set("created_by", "")
	requireRefused(t, env.app.Save(draft), "Books sets these fields itself: created_by.")
}

// PocketBase unlinks a deleted user from a draft too; that save is a draft
// edit and must not be refused as a change to a server field.
func TestImmutable_DeletingTheCreatorOfADraftClearsTheLinkOnly(t *testing.T) {
	env := newLedgerEnv(t)
	creator := mkUser(t, env.app, "member")
	draft := draftCreatedBy(t, env, creator)
	if err := env.app.Delete(creator); err != nil {
		t.Fatalf("delete the creator of a draft: %v", err)
	}
	after := reload(t, env.app, "books_journal_entries", draft.Id)
	if after.GetString("created_by") != "" || after.GetString("status") != statusDraft || after.GetString("date") != "2026-05-10" {
		t.Fatalf("after = %v", after.PublicExport())
	}
	lines, err := entryLines(env.app, draft.Id)
	if err != nil || len(lines) != 2 {
		t.Fatalf("lines = %d (%v), want the draft's 2", len(lines), err)
	}
}

// draftCreatedBy is a balanced sale draft attributed to a creator.
func draftCreatedBy(t testing.TB, env *ledgerEnv, creator *core.Record) *core.Record {
	t.Helper()
	entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": "manual", "created_by": creator.Id,
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{"entry": entry.Id, "account": env.checking.Id, "debit": 100})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{"entry": entry.Id, "account": env.revenue.Id, "credit": 100})
	return entry
}

// Clearing a user link is the only change a posted entry accepts: pointing it
// at another user, or clearing it together with another change, is refused.
func TestImmutable_OnlyClearingAUserLinkIsAllowed(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, env.users.admin.Id)

	posted.Set("posted_by", env.users.bookkeeper.Id)
	requireRefused(t, env.app.Save(posted), "is posted and cannot change (posted_by)")

	posted = reload(t, env.app, "books_journal_entries", posted.Id)
	posted.Set("posted_by", "")
	posted.Set("memo", "rewritten")
	requireRefused(t, env.app.Save(posted), "is posted and cannot change (memo, posted_by)")
}

// One user who created and posted an entry: deleting them clears both links.
func TestImmutable_DeletingTheCreatorAndPosterClearsBothLinks(t *testing.T) {
	env := newLedgerEnv(t)
	person := mkUser(t, env.app, "member")
	entry := draftCreatedBy(t, env, person)
	mustPost(t, env.app, entry.Id, person.Id)
	if err := env.app.Delete(person); err != nil {
		t.Fatalf("delete the person: %v", err)
	}
	after := reload(t, env.app, "books_journal_entries", entry.Id)
	if after.GetString("created_by") != "" || after.GetString("posted_by") != "" || after.GetInt("total") != 100 {
		t.Fatalf("after = %v", after.PublicExport())
	}
}

// The update request hook stamps who posted or voided. A save that keeps a
// posted entry posted is not a post, so it must not rewrite the poster: that
// stamp would be a change to a posted entry, and the guard would refuse it.
func TestImmutable_ResavingAPostedEntryKeepsItsPoster(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, env.users.admin.Id)
	event := &core.RecordRequestEvent{
		RequestEvent: &core.RequestEvent{App: env.app, Auth: env.users.bookkeeper},
		Record:       posted,
	}
	event.Collection = posted.Collection()
	err := env.app.OnRecordUpdateRequest().Trigger(event, func(e *core.RecordRequestEvent) error {
		return e.App.Save(e.Record)
	})
	if err != nil {
		t.Fatalf("resave a posted entry through the request hooks: %v", err)
	}
	if got := reload(t, env.app, "books_journal_entries", posted.Id).GetString("posted_by"); got != env.users.admin.Id {
		t.Fatalf("posted_by = %q, want the original poster %q", got, env.users.admin.Id)
	}
}
