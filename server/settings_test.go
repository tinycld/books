package books

import (
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func newGuardedApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	return app
}

func TestParseDay(t *testing.T) {
	for _, ok := range []string{"2024-02-29", "2026-12-31"} {
		if _, err := parseDay(ok); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	for _, bad := range []string{"2026-02-30", "2025-02-29", "2026-13-01", "26-01-01", ""} {
		if _, err := parseDay(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
	if periodOf("2026-05-31") != "2026-05" {
		t.Error("periodOf")
	}
}

func TestSettings_CloseDateMustBeARealDay(t *testing.T) {
	app := newGuardedApp(t)
	s := reload(t, app, "books_settings", settingsID)
	s.Set("close_date", "2026-02-30")
	requireRefused(t, app.Save(s), "is not a date")
	s.Set("close_date", "2026-02-28")
	if err := app.Save(s); err != nil {
		t.Fatalf("valid close date: %v", err)
	}
	got, err := loadSettings(app)
	if err != nil || got.CloseDate != "2026-02-28" || got.Currency != "USD" || got.FiscalYearStartMonth != 1 {
		t.Fatalf("loadSettings = %+v, %v", got, err)
	}
}

func TestSettings_CannotBeDeleted(t *testing.T) {
	app := newGuardedApp(t)
	requireRefused(t, app.Delete(reload(t, app, "books_settings", settingsID)), "cannot be deleted")
}

func TestStampCurrency(t *testing.T) {
	app := newGuardedApp(t)
	col, _ := app.FindCollectionByNameOrId("books_accounts")
	r := core.NewRecord(col)
	if err := stampCurrency(app, r); err != nil || r.GetString("currency") != "USD" {
		t.Fatalf("empty currency: %q, %v", r.GetString("currency"), err)
	}
	r.Set("currency", "EUR")
	requireRefused(t, stampCurrency(app, r), "one currency (USD)")
}

func TestOverride_MustExpireInTheFuture(t *testing.T) {
	app := newGuardedApp(t)
	user := mkUser(t, app, "member")
	col, _ := app.FindCollectionByNameOrId("books_close_overrides")
	past := core.NewRecord(col)
	past.Load(map[string]any{"user": user.Id, "reason": "Late fix", "expires_at": types.NowDateTime().Add(-time.Hour)})
	requireRefused(t, app.Save(past), "expire in the future")
}

func TestOverride_ShortenedNotExtended(t *testing.T) {
	app := newGuardedApp(t)
	user := mkUser(t, app, "member")
	ov := saveRecord(t, app, "books_close_overrides", map[string]any{
		"user": user.Id, "reason": "Late fix", "expires_at": types.NowDateTime().Add(24 * time.Hour),
	})
	ov.Set("expires_at", types.NowDateTime().Add(48*time.Hour))
	requireRefused(t, app.Save(ov), "not extended")
	ov = reload(t, app, "books_close_overrides", ov.Id)
	ov.Set("reason", "Something else")
	requireRefused(t, app.Save(ov), "Only an override's expiry")
	ov = reload(t, app, "books_close_overrides", ov.Id)
	ov.Set("expires_at", types.NowDateTime())
	if err := app.Save(ov); err != nil {
		t.Fatalf("revoke: %v", err)
	}
}

func TestOverride_ActiveOverrideIsTheNewestUnexpired(t *testing.T) {
	app := newGuardedApp(t)
	user := mkUser(t, app, "member")
	now := time.Now()
	if got, err := activeOverride(app, user.Id, now); err != nil || got != nil {
		t.Fatalf("no override: %v, %v", got, err)
	}
	saveRecord(t, app, "books_close_overrides", map[string]any{"user": user.Id, "reason": "First", "expires_at": now.Add(time.Hour)})
	later := saveRecord(t, app, "books_close_overrides", map[string]any{"user": user.Id, "reason": "Second", "expires_at": now.Add(2 * time.Hour)})
	got, err := activeOverride(app, user.Id, now)
	if err != nil || got == nil || got.Id != later.Id {
		t.Fatalf("activeOverride = %v, %v; want %s", got, err, later.Id)
	}
	if got, _ := activeOverride(app, user.Id, now.Add(3*time.Hour)); got != nil {
		t.Fatal("an expired override was active")
	}
	if got, _ := activeOverride(app, "", now); got != nil {
		t.Fatal("an empty user had an override")
	}
}

func TestOverride_GrantedByIsTheRequestingAdmin(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_close_overrides/records",
		token:   tokenFor(t, users.admin),
		body:    `{"user":"` + users.bookkeeper.Id + `","reason":"Audit fix","expires_at":"` + types.NowDateTime().Add(time.Hour).String() + `"}`,
		want:    http.StatusOK,
		content: []string{`"granted_by":"` + users.admin.Id + `"`},
	}.run(t, app)
}

func TestSequence_CannotMoveBackOverIssuedNumbers(t *testing.T) {
	// Seed an entry numbered 41 before binding the hooks: the raw save stands
	// in for a past post, which the posting hook would otherwise number itself.
	app := newBooksApp(t)
	issued := mkDraft(t, app, "2026-05-01")
	issued.Set("status", "posted")
	issued.Set("sequence", 41)
	issued.Set("number", "41")
	if err := app.Save(issued); err != nil {
		t.Fatalf("issue 41: %v", err)
	}
	registerLedger(app)
	seq := reload(t, app, "books_doc_sequences", "booksseqjournal")
	seq.Set("next_number", 41)
	requireRefused(t, app.Save(seq), "must be 42 or higher")
	seq.Set("next_number", 100)
	seq.Set("prefix", "JE-")
	if err := app.Save(seq); err != nil {
		t.Fatalf("move forward: %v", err)
	}
}
