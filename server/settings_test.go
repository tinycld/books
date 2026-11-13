package books

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
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

// Deleting the admin who granted an override clears granted_by and nothing
// else: the override stays as the log and keeps working for its holder.
func TestOverride_DeletingTheGranterClearsGrantedByOnly(t *testing.T) {
	app := newGuardedApp(t)
	holder := mkUser(t, app, "member")
	granter := mkUser(t, app, "admin")
	ov := saveRecord(t, app, "books_close_overrides", map[string]any{
		"user": holder.Id, "reason": "Late fix", "expires_at": types.NowDateTime().Add(24 * time.Hour), "granted_by": granter.Id,
	})
	expires := reload(t, app, "books_close_overrides", ov.Id).GetString("expires_at")
	if err := app.Delete(granter); err != nil {
		t.Fatalf("delete the granting admin: %v", err)
	}
	after := reload(t, app, "books_close_overrides", ov.Id)
	if after.GetString("granted_by") != "" || after.GetString("user") != holder.Id ||
		after.GetString("reason") != "Late fix" || after.GetString("expires_at") != expires {
		t.Fatalf("after = %v", after.PublicExport())
	}
}

// Only PocketBase's unlink of a deleted user may clear granted_by.
func TestOverride_ClearingALiveGranterIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	granter := mkUser(t, app, "admin")
	ov := saveRecord(t, app, "books_close_overrides", map[string]any{
		"user": mkUser(t, app, "member").Id, "reason": "Late fix",
		"expires_at": types.NowDateTime().Add(time.Hour), "granted_by": granter.Id,
	})
	ov.Set("granted_by", "")
	requireRefused(t, app.Save(ov), "Only an override's expiry can change.")
}

// The holder is a required link, so PocketBase refuses to delete a user who
// holds an override: the override is the log of why they could post into a
// closed period. Offboarding expires it instead.
func TestOverride_TheHolderCannotBeDeleted(t *testing.T) {
	app := newGuardedApp(t)
	holder := mkUser(t, app, "member")
	ov := saveRecord(t, app, "books_close_overrides", map[string]any{
		"user": holder.Id, "reason": "Late fix", "expires_at": types.NowDateTime().Add(time.Hour),
	})
	requireRefused(t, app.Delete(holder), "part of a required reference")
	if got := reload(t, app, "books_close_overrides", ov.Id).GetString("user"); got != holder.Id {
		t.Fatalf("user = %q, want %q", got, holder.Id)
	}
	reload(t, app, "users", holder.Id)
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

func saveSettings(t testing.TB, app core.App, fields map[string]any) {
	t.Helper()
	if err := setFields(t, app, "books_settings", settingsID, fields); err != nil {
		t.Fatalf("save settings %v: %v", fields, err)
	}
}

// The refusal of the "Sales deposited to" guard, as the client gets it
// (PocketBase adds the final period).
const wantSalesDepositSetting = "Choose Ask or an active bank or Undeposited funds account."

// salesDepositSettingEnv is a guarded app with the e2e book's deposit
// candidates: 1000 Business Checking, 1010 Business Savings (made inactive),
// 1200 Undeposited funds, and 4000 Consulting Income.
type salesDepositSettingEnv struct {
	app                                     *tests.TestApp
	checking, savings, undeposited, revenue *core.Record
}

func newSalesDepositSettingEnv(t *testing.T) *salesDepositSettingEnv {
	t.Helper()
	app := newGuardedApp(t)
	env := &salesDepositSettingEnv{
		app:         app,
		checking:    mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		savings:     mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		undeposited: mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
		revenue:     mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income"),
	}
	makeAccountInactive(t, app, env.savings)
	return env
}

func requireSalesDepositSetting(t testing.TB, app core.App, want string) {
	t.Helper()
	if got := reload(t, app, "books_settings", settingsID).GetString("sales_deposit_account"); got != want {
		t.Errorf("sales_deposit_account = %q, want %q", got, want)
	}
}

// Spec §4.3: "Sales deposited to" is empty (Ask) or an account that passes
// isDepositAccount: an active bank account or an active Undeposited funds one.
func TestSettings_SalesDepositAccountMustBeADepositAccount(t *testing.T) {
	env := newSalesDepositSettingEnv(t)

	for _, ok := range []*core.Record{env.undeposited, env.checking} {
		if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"sales_deposit_account": ok.Id}); err != nil {
			t.Fatalf("setting Sales deposited to %s was refused: %v", ok.GetString("name"), err)
		}
		requireSalesDepositSetting(t, env.app, ok.Id)
	}

	refused := []struct{ name, id string }{
		{"4000 Consulting Income", env.revenue.Id},
		{"an inactive bank account", env.savings.Id},
		{"an id that does not exist", "doesnotexist123"},
	}
	for _, tc := range refused {
		t.Run(tc.name, func(t *testing.T) {
			err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"sales_deposit_account": tc.id})
			requireFieldRefusal(t, err, "sales_deposit_account", wantSalesDepositSetting)
			requireSalesDepositSetting(t, env.app, env.checking.Id)
		})
	}

	if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"sales_deposit_account": ""}); err != nil {
		t.Fatalf("setting Sales deposited to back to Ask was refused: %v", err)
	}
	requireSalesDepositSetting(t, env.app, "")
}

// The setting is checked only when it changes: an edit of another setting
// saves while the stored account has become inactive.
func TestSettings_SalesDepositAccountCheckedOnlyWhenItChanges(t *testing.T) {
	env := newSalesDepositSettingEnv(t)
	saveSettings(t, env.app, map[string]any{"sales_deposit_account": env.checking.Id})
	// A direct write past the account guards, which refuse to make the set
	// account inactive.
	if _, err := env.app.DB().NewQuery("UPDATE books_accounts SET inactive = TRUE WHERE id = {:id}").
		Bind(dbx.Params{"id": env.checking.Id}).Execute(); err != nil {
		t.Fatalf("make 1000 Business Checking inactive: %v", err)
	}
	if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"business_name": "Harbor Lane Design LLC"}); err != nil {
		t.Fatalf("a business name edit was refused over the stored inactive deposit account: %v", err)
	}
	stored := reload(t, env.app, "books_settings", settingsID)
	if stored.GetString("business_name") != "Harbor Lane Design LLC" || stored.GetString("sales_deposit_account") != env.checking.Id {
		t.Errorf("business_name %q sales_deposit_account %q, want the edit saved and the account kept",
			stored.GetString("business_name"), stored.GetString("sales_deposit_account"))
	}
}

// Spec §3.11: the default message is at most 4000 characters (the schema).
func TestSettings_DefaultCustomerMessageIsAtMost4000(t *testing.T) {
	app := newGuardedApp(t)
	err := setFields(t, app, "books_settings", settingsID, map[string]any{"default_customer_message": strings.Repeat("x", 4001)})
	requireSchemaRefusal(t, err, "default_customer_message")
	if got := reload(t, app, "books_settings", settingsID).GetString("default_customer_message"); got != "" {
		t.Errorf("default_customer_message has %d characters after the refusal, want none", len(got))
	}
	saveSettings(t, app, map[string]any{"default_customer_message": strings.Repeat("x", 4000)})
}

func TestSetupCompletionEnsuresRetainedEarnings(t *testing.T) {
	cases := []struct {
		name, ownership, taken, want string
	}{
		{"owners get 3900", "owners", "", "3900"},
		{"a corporation gets 3500", "corporation", "", "3500"},
		{"owners whose 3900 is taken get no number", "owners", "3900", ""},
		{"a corporation whose 3500 is taken gets no number", "corporation", "3500", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newGuardedApp(t)
			if tc.taken != "" {
				saveRecord(t, app, "books_accounts", map[string]any{
					"name": "Owner's draws", "number": tc.taken, "type": "equity", "detail_type": "owner_draws", "currency": "USD",
				})
			}
			saveSettings(t, app, map[string]any{"business_name": "Harbor Lane Design LLC", "ownership": tc.ownership})
			saveSettings(t, app, map[string]any{"setup_completed": true})
			requireCreatedRetainedEarnings(t, app, tc.want)
		})
	}

	// The wizard's "Start with an empty chart" and populated-book paths send
	// the ownership and the completion in one write
	// (useBooksSetup.ts updateSettings({ ...values, done: true })).
	oneWrite := []struct{ ownership, want string }{
		{"corporation", "3500"},
		{"owners", "3900"},
	}
	for _, tc := range oneWrite {
		t.Run("ownership "+tc.ownership+" sent with the completion gets "+tc.want, func(t *testing.T) {
			app := newGuardedApp(t)
			saveSettings(t, app, map[string]any{"ownership": tc.ownership, "setup_completed": true})
			requireCreatedRetainedEarnings(t, app, tc.want)
		})
	}

	t.Run("a top-level account that holds the name does not stop setup", func(t *testing.T) {
		app := newGuardedApp(t)
		mkAccount(t, app, "Retained Earnings", "equity", "owners_equity")
		saveSettings(t, app, map[string]any{"ownership": "owners"})
		saveSettings(t, app, map[string]any{"setup_completed": true})
		requireRetainedEarningsNamed(t, app, "Retained earnings 2")
	})

	t.Run("a chart that already has one gets no second", func(t *testing.T) {
		app := newGuardedApp(t)
		existing := mkRetainedEarnings(t, app, "3950")
		saveSettings(t, app, map[string]any{"ownership": "owners"})
		saveSettings(t, app, map[string]any{"setup_completed": true})
		rows := retainedAccounts(t, app)
		if len(rows) != 1 || rows[0].Id != existing.Id {
			t.Fatalf("%d retained-earnings accounts, want only the existing %s", len(rows), existing.Id)
		}
	})

	t.Run("an update of another setting before setup completes creates nothing", func(t *testing.T) {
		app := newGuardedApp(t)
		saveSettings(t, app, map[string]any{"business_name": "Harbor Lane Design LLC", "ownership": "owners"})
		saveSettings(t, app, map[string]any{"fiscal_year_start_month": 7})
		if n := len(retainedAccounts(t, app)); n != 0 {
			t.Errorf("%d retained-earnings accounts before setup completed, want 0", n)
		}
	})

	t.Run("an update of another setting after setup completed creates nothing", func(t *testing.T) {
		app := newBooksApp(t)
		// Completed before the hooks are bound: a book that finished setup
		// with no retained-earnings account.
		saveSettings(t, app, map[string]any{"ownership": "owners", "setup_completed": true})
		registerLedger(app)
		saveSettings(t, app, map[string]any{"business_name": "Harbor Lane Design LLC"})
		if n := len(retainedAccounts(t, app)); n != 0 {
			t.Errorf("%d retained-earnings accounts after a business name edit, want 0", n)
		}
	})
}
