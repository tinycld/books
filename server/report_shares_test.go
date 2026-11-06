package books

import (
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/groups"
	"tinycld.org/core/offboard"
	"tinycld.org/core/reports"
)

// newSharesApp is a migrated app with Books' report sources, the shipped
// Trial Balance and the share sync bound, but no report created yet: a test
// makes its users first, then calls shipReports, as core does at serve start.
func newSharesApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app := newBooksApp(t)
	registerBooksSources(t)
	reports.RegisterShipped(trialBalanceShipped())
	registerReportShares(app)
	return app
}

// shipReports runs core's ReconcileShipped, which creates the Trial Balance
// owned by the first admin, and returns the stored report.
func shipReports(t *testing.T, app core.App) *core.Record {
	t.Helper()
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	return trialBalanceRow(t, app)
}

func trialBalanceRow(t *testing.T, app core.App) *core.Record {
	t.Helper()
	row, err := app.FindFirstRecordByFilter("reports", "shipped_key = {:k}", dbx.Params{"k": trialBalanceKey})
	if err != nil {
		t.Fatalf("no reports row with shipped_key %s: %v", trialBalanceKey, err)
	}
	return row
}

// sharesOf are every report_shares row that names user on report, direct or
// not, so a test sees a duplicate or a stray row as well as the one it wants.
func sharesOf(t *testing.T, app core.App, report, user *core.Record) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("report_shares", "report = {:r} && user = {:u}", "", 0, 0,
		dbx.Params{"r": report.Id, "u": user.Id})
	if err != nil {
		t.Fatalf("read report_shares: %v", err)
	}
	return rows
}

// requireViewer fails unless user has exactly one direct viewer share on
// report.
func requireViewer(t *testing.T, app core.App, report, user *core.Record, who string) {
	t.Helper()
	rows := sharesOf(t, app, report, user)
	if len(rows) != 1 {
		t.Fatalf("%s has %d report_shares rows on %s, want exactly one viewer row", who, len(rows), report.GetString("shipped_key"))
	}
	r := rows[0]
	if r.GetString("role") != "viewer" || r.GetString("group") != "" || r.GetString("user") != user.Id {
		t.Fatalf("%s share = role %q group %q user %q, want role viewer, no group, user %s",
			who, r.GetString("role"), r.GetString("group"), r.GetString("user"), user.Id)
	}
}

func requireNoShare(t *testing.T, app core.App, report, user *core.Record, who string) {
	t.Helper()
	if rows := sharesOf(t, app, report, user); len(rows) != 0 {
		t.Fatalf("%s has %d report_shares rows on %s (first role %q), want none",
			who, len(rows), report.GetString("shipped_key"), rows[0].GetString("role"))
	}
}

func pkgAccessRow(t *testing.T, app core.App, user *core.Record) *core.Record {
	t.Helper()
	row, err := app.FindFirstRecordByFilter("org_pkg_access", "user = {:u} && pkg = 'books'", dbx.Params{"u": user.Id})
	if err != nil {
		t.Fatalf("no books org_pkg_access row for %s: %v", user.Id, err)
	}
	return row
}

func saveOrFail(t *testing.T, app core.App, r *core.Record) {
	t.Helper()
	if err := app.Save(r); err != nil {
		t.Fatalf("save %s/%s: %v", r.Collection().Name, r.Id, err)
	}
}

// deleteViewerRows deletes, by hand, every viewer row on a Books report.
func deleteViewerRows(t *testing.T, app core.App) {
	t.Helper()
	rows, err := app.FindRecordsByFilter("report_shares", "role = 'viewer'", "", 0, 0)
	if err != nil {
		t.Fatalf("read report_shares: %v", err)
	}
	for _, r := range rows {
		if err := app.Delete(r); err != nil {
			t.Fatalf("delete share %s: %v", r.Id, err)
		}
	}
}

// When core creates the shipped Trial Balance, every user who can read Books
// already has a viewer share on it; the owner and the users who cannot read
// Books have none.
func TestReportSharesOnCreate(t *testing.T) {
	app := newSharesApp(t)
	defaultMember := mkUser(t, app, "member")
	readonlyMember := mkUser(t, app, "member")
	setPkgAccess(t, app, readonlyMember, "readonly")
	fullGuest := mkUser(t, app, "guest")
	setPkgAccess(t, app, fullGuest, "full")
	plainGuest := mkUser(t, app, "guest")
	noneMember := mkUser(t, app, "member")
	setPkgAccess(t, app, noneMember, "none")
	owner := mkUser(t, app, "owner")

	report := shipReports(t, app)
	if report.GetString("owner") != owner.Id {
		t.Fatalf("the Trial Balance is owned by %q, want the first admin %q", report.GetString("owner"), owner.Id)
	}

	requireViewer(t, app, report, defaultMember, "a member with default Books access")
	requireViewer(t, app, report, readonlyMember, "a readonly member")
	requireViewer(t, app, report, fullGuest, "a guest granted full Books access")
	requireNoShare(t, app, report, owner, "the owner (first admin)")
	requireNoShare(t, app, report, plainGuest, "a guest without a Books grant")
	requireNoShare(t, app, report, noneMember, "a member with Books access none")

	// Sharing the same report again adds nothing.
	if err := shareBooksReport(app, report); err != nil {
		t.Fatalf("shareBooksReport on a shared report: %v", err)
	}
	requireViewer(t, app, report, defaultMember, "a member with default Books access, after a second share")
}

// A guest granted Books afterwards, and a member created afterwards, get the
// viewer share at once.
func TestReportSharesGrant(t *testing.T) {
	app := newSharesApp(t)
	mkUser(t, app, "owner")
	guest := mkUser(t, app, "guest")
	report := shipReports(t, app)
	requireNoShare(t, app, report, guest, "a guest before the grant")

	saveRecord(t, app, "org_pkg_access", map[string]any{"user": guest.Id, "pkg": "books", "access": "readonly"})
	requireViewer(t, app, report, guest, "a guest granted readonly Books access")

	member := mkUser(t, app, "member")
	requireViewer(t, app, report, member, "a member created after the report")
}

// Revoking Books access removes the viewer share; an editor share the owner
// gave the same user is theirs to keep, and no viewer row joins it.
func TestReportSharesRevoke(t *testing.T) {
	app := newSharesApp(t)
	mkUser(t, app, "owner")
	readonlyMember := mkUser(t, app, "member")
	setPkgAccess(t, app, readonlyMember, "readonly")
	defaultMember := mkUser(t, app, "member")
	guest := mkUser(t, app, "guest")
	setPkgAccess(t, app, guest, "full")
	editor := mkUser(t, app, "member")
	setPkgAccess(t, app, editor, "readonly")
	report := shipReports(t, app)
	for who, u := range map[string]*core.Record{"readonly member": readonlyMember, "default member": defaultMember, "guest": guest, "editor": editor} {
		requireViewer(t, app, report, u, who+" before the revoke")
	}

	access := pkgAccessRow(t, app, readonlyMember)
	access.Set("access", "none")
	saveOrFail(t, app, access)
	requireNoShare(t, app, report, readonlyMember, "a member whose Books access was set to none")

	setPkgAccess(t, app, defaultMember, "none")
	requireNoShare(t, app, report, defaultMember, "a member given a Books access row of none")

	if err := app.Delete(pkgAccessRow(t, app, guest)); err != nil {
		t.Fatalf("delete the guest's org_pkg_access row: %v", err)
	}
	requireNoShare(t, app, report, guest, "a guest whose Books grant was deleted")

	// The owner makes the editor's share an editor share.
	share := sharesOf(t, app, report, editor)[0]
	share.Set("role", "editor")
	saveOrFail(t, app, share)
	editorAccess := pkgAccessRow(t, app, editor)
	editorAccess.Set("access", "none")
	saveOrFail(t, app, editorAccess)
	requireEditorOnly(t, app, report, editor, "after the editor's Books access was revoked")

	editorAccess.Set("access", "full")
	saveOrFail(t, app, editorAccess)
	requireEditorOnly(t, app, report, editor, "after the editor's Books access came back")
	if err := syncUserReportShares(app, editor.Id); err != nil {
		t.Fatalf("syncUserReportShares for an editor who can read Books: %v", err)
	}
	requireEditorOnly(t, app, report, editor, "after a sync of the editor")
}

func requireEditorOnly(t *testing.T, app core.App, report, user *core.Record, when string) {
	t.Helper()
	rows := sharesOf(t, app, report, user)
	if len(rows) != 1 || rows[0].GetString("role") != "editor" {
		roles := make([]string, len(rows))
		for i, r := range rows {
			roles[i] = r.GetString("role")
		}
		t.Fatalf("%s: shares %v, want only the editor share", when, roles)
	}
}

// A member who becomes a guest with no Books grant loses the share; becoming
// a member again brings it back.
func TestReportSharesRoleChange(t *testing.T) {
	app := newSharesApp(t)
	mkUser(t, app, "owner")
	member := mkUser(t, app, "member")
	report := shipReports(t, app)
	requireViewer(t, app, report, member, "a member before the role change")

	member.Set("role", "guest")
	saveOrFail(t, app, member)
	requireNoShare(t, app, report, member, "a member made a guest with no Books grant")

	member.Set("role", "member")
	saveOrFail(t, app, member)
	requireViewer(t, app, report, member, "a guest made a member again")
}

// The reconcile puts back exactly one viewer share per reader on every Books
// report, adds nothing when run again, and leaves other packages' reports
// alone.
func TestReportSharesReconcile(t *testing.T) {
	app := newSharesApp(t)
	owner := mkUser(t, app, "owner")
	member := mkUser(t, app, "member")
	guest := mkUser(t, app, "guest")
	setPkgAccess(t, app, guest, "readonly")
	plainGuest := mkUser(t, app, "guest")
	trialBalance := shipReports(t, app)
	other := saveRecord(t, app, "reports", map[string]any{
		"owner": owner.Id, "title": "Another Books report", "spec": trialBalance.Get("spec"),
		"source": trialBalance.GetString("source"), "shipped_key": "books.another_report", "shipped_revision": 1,
	})
	foreign := saveRecord(t, app, "reports", map[string]any{
		"owner": owner.Id, "title": "Zoo report", "spec": trialBalance.Get("spec"),
		"source": trialBalance.GetString("source"), "shipped_key": "zoo.trial_balance", "shipped_revision": 1,
	})

	deleteViewerRows(t, app)
	requireNoShare(t, app, trialBalance, member, "a member after the hand delete")

	for run := 1; run <= 2; run++ {
		if err := reconcileBooksReportShares(app); err != nil {
			t.Fatalf("reconcile run %d: %v", run, err)
		}
		for _, report := range []*core.Record{trialBalance, other} {
			requireViewer(t, app, report, member, "a member after reconcile")
			requireViewer(t, app, report, guest, "a readonly guest after reconcile")
			requireNoShare(t, app, report, owner, "the owner after reconcile")
			requireNoShare(t, app, report, plainGuest, "a guest without Books after reconcile")
		}
		for who, u := range map[string]*core.Record{"member": member, "guest": guest} {
			requireNoShare(t, app, foreign, u, "the "+who+" on a report another package ships")
		}
	}
}

// Core's serve start creates shipped reports, then Books' serve-start
// reconcile puts back a reader's missing share. Books binds its serve handler
// before core's, so it runs last only when it reconciles after e.Next(): a
// probe bound after core's reports.Register deletes the reader's share during
// serve start, and only a reconcile that comes after the probe puts it back.
func TestReportSharesAtServeStart(t *testing.T) {
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, _ := newRegisteredApp(t)
	reports.Register(app)
	owner := mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	report := shipReports(t, app)
	requireViewer(t, app, report, reader, "the reader before the server starts")

	probeDeleted := 0
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		for _, r := range sharesOf(t, e.App, report, reader) {
			if err := e.App.Delete(r); err != nil {
				t.Fatalf("the probe could not delete the reader's share: %v", err)
			}
			probeDeleted++
		}
		return e.Next()
	})

	apiReq{method: http.MethodGet, url: "/api/health", want: http.StatusOK}.run(t, app)

	if probeDeleted != 1 {
		t.Fatalf("the serve probe deleted %d shares, want the reader's one", probeDeleted)
	}
	requireViewer(t, app, report, reader, "the reader after the server started (Books must reconcile after core and the probe, after e.Next())")
	requireNoShare(t, app, report, owner, "the owner after the server started")
}

// newOffboardApp is newSharesApp with the offboard handlers production
// registers: core's reports handler (it removes the leaver's direct shares and
// moves the reports they own) and Books' own.
func newOffboardApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app := newSharesApp(t)
	offboard.ResetHandlersForTesting()
	groups.ResetForTesting()
	t.Cleanup(offboard.ResetHandlersForTesting)
	t.Cleanup(groups.ResetForTesting)
	reports.RegisterSharing(app)
	registerOffboard()
	return app
}

// An offboarded user counts as unable to read Books: core's offboard removes
// their shares, and neither the users update at the offboard's commit nor a
// later reconcile gives them one again.
func TestReportSharesOffboard(t *testing.T) {
	modes := []struct {
		name string
		mode offboard.Mode
	}{
		{"keep", offboard.ModeKeep},
		{"delete_my_data", offboard.ModeDeleteMyData},
		{"reassign to another reader", offboard.ModeReassign},
	}
	for _, m := range modes {
		t.Run(m.name, func(t *testing.T) {
			app := newOffboardApp(t)
			owner := mkUser(t, app, "owner")
			leaver := mkUser(t, app, "member")
			setPkgAccess(t, app, leaver, "readonly")
			successor := mkUser(t, app, "member")
			report := shipReports(t, app)
			requireViewer(t, app, report, leaver, "the reader before the offboard")

			plan := offboard.Plan{Mode: m.mode}
			if m.mode == offboard.ModeReassign {
				plan.SuccessorUserID = successor.Id
			}
			if _, err := offboard.OffboardUser(app, leaver.Id, plan, owner.Id); err != nil {
				t.Fatalf("OffboardUser(%s): %v", m.mode, err)
			}
			requireNoShare(t, app, report, leaver, "the offboarded reader after the offboard's commit")

			if err := reconcileBooksReportShares(app); err != nil {
				t.Fatalf("reconcile: %v", err)
			}
			requireNoShare(t, app, report, leaver, "the offboarded reader after a reconcile")
			requireViewer(t, app, report, successor, "another reader after the reconcile")
		})
	}

	// The first admin owns the report; offboarded with an heir, the report
	// moves to the heir and the leaver, no longer its owner, gets no share.
	t.Run("the report owner, reassigned to an heir", func(t *testing.T) {
		app := newOffboardApp(t)
		owner := mkUser(t, app, "owner")
		heir := mkUser(t, app, "admin")
		report := shipReports(t, app)
		if report.GetString("owner") != owner.Id {
			t.Fatalf("the Trial Balance is owned by %q, want the first admin %q", report.GetString("owner"), owner.Id)
		}

		if _, err := offboard.OffboardUser(app, owner.Id, offboard.Plan{Mode: offboard.ModeReassign, SuccessorUserID: heir.Id}, owner.Id); err != nil {
			t.Fatalf("OffboardUser(reassign): %v", err)
		}
		if got := trialBalanceRow(t, app).GetString("owner"); got != heir.Id {
			t.Fatalf("after the offboard the Trial Balance is owned by %q, want the heir %q", got, heir.Id)
		}
		requireNoShare(t, app, report, owner, "the offboarded first admin after the offboard's commit")

		if err := reconcileBooksReportShares(app); err != nil {
			t.Fatalf("reconcile: %v", err)
		}
		requireNoShare(t, app, report, owner, "the offboarded first admin after a reconcile")
	})
}

// A Books grant moved to another user (an update of its user) takes the first
// user's share away and gives the second user theirs.
func TestReportSharesAccessMovedToAnotherUser(t *testing.T) {
	app := newSharesApp(t)
	mkUser(t, app, "owner")
	first := mkUser(t, app, "guest")
	setPkgAccess(t, app, first, "readonly")
	second := mkUser(t, app, "guest")
	report := shipReports(t, app)
	requireViewer(t, app, report, first, "the first guest before the move")
	requireNoShare(t, app, report, second, "the second guest before the move")

	access := pkgAccessRow(t, app, first)
	access.Set("user", second.Id)
	saveOrFail(t, app, access)

	requireNoShare(t, app, report, first, "the first guest after their Books grant moved to another user")
	requireViewer(t, app, report, second, "the second guest after the Books grant moved to them")
}

// Two syncs can both find no share and both insert one; core's unique index
// on (report, user, group) refuses the second insert. The loser finds the
// share it wanted already there: no error, and exactly one row.
func TestReportSharesLostInsertRace(t *testing.T) {
	app := newSharesApp(t)
	mkUser(t, app, "owner")
	guest := mkUser(t, app, "guest")
	report := shipReports(t, app)
	requireNoShare(t, app, report, guest, "a guest without Books before the race")

	raced := false
	// Bound on the insert step, after addViewerShare's lookup found no share:
	// the other sync's identical row lands first.
	app.OnRecordCreateExecute("report_shares").BindFunc(func(e *core.RecordEvent) error {
		if raced {
			return e.Next()
		}
		raced = true
		winner := core.NewRecord(e.Record.Collection())
		winner.Set("report", report.Id)
		winner.Set("user", guest.Id)
		winner.Set("role", "viewer")
		if err := e.App.Save(winner); err != nil {
			t.Fatalf("the racing insert: %v", err)
		}
		return e.Next()
	})

	err := addViewerShare(app, report, guest.Id)
	if !raced {
		t.Fatal("addViewerShare inserted no share, so it never met the race")
	}
	if err != nil {
		t.Fatalf("addViewerShare after losing the race to an identical share: %v, want no error", err)
	}
	requireViewer(t, app, report, guest, "the guest after the lost race")
}
