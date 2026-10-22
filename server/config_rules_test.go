package books

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/tools/types"
)

const settingsURL = "/api/collections/books_settings/records/bookssettings01"
const journalSequenceURL = "/api/collections/books_doc_sequences/records/booksseqjournal"

func TestConfigRows_MigrationCreatesThem(t *testing.T) {
	app := newBooksApp(t)
	s, err := app.FindRecordById("books_settings", "bookssettings01")
	if err != nil {
		t.Fatalf("settings row: %v", err)
	}
	if s.GetString("currency") != "USD" || s.GetInt("fiscal_year_start_month") != 1 || s.GetString("close_date") != "" {
		t.Fatalf("settings row = %v", s.PublicExport())
	}
	seq, err := app.FindRecordById("books_doc_sequences", "booksseqjournal")
	if err != nil {
		t.Fatalf("journal sequence: %v", err)
	}
	if seq.GetString("doc_type") != "journal" || seq.GetInt("next_number") != 1 {
		t.Fatalf("journal sequence = %v", seq.PublicExport())
	}
}

func TestConfigRules_ReadSettingsByLevel(t *testing.T) {
	want := map[Level]string{
		LevelNone: `"totalItems":0`, LevelReadOnly: `"totalItems":1`,
		LevelBookkeeper: `"totalItems":1`, LevelAdmin: `"totalItems":1`,
	}
	for _, level := range allLevels {
		t.Run(string(level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method:  http.MethodGet,
				url:     "/api/collections/books_settings/records",
				token:   tokenFor(t, users.byLevel(level)),
				want:    http.StatusOK,
				content: []string{want[level]},
			}.run(t, app)
		})
	}
}

func TestConfigRules_Writes(t *testing.T) {
	future := types.NowDateTime().Add(24 * time.Hour).String()
	cases := []struct {
		name   string
		level  Level
		method string
		url    string
		body   func(users levelUsers) string
		want   int
	}{
		{"bookkeeper cannot set the close date", LevelBookkeeper, http.MethodPatch, settingsURL,
			func(levelUsers) string { return `{"close_date":"2026-03-31"}` }, http.StatusNotFound},
		{"admin sets the close date", LevelAdmin, http.MethodPatch, settingsURL,
			func(levelUsers) string { return `{"close_date":"2026-03-31"}` }, http.StatusOK},
		{"admin cannot change the currency", LevelAdmin, http.MethodPatch, settingsURL,
			func(levelUsers) string { return `{"currency":"EUR"}` }, http.StatusNotFound},
		{"nobody creates settings", LevelAdmin, http.MethodPost, "/api/collections/books_settings/records",
			func(levelUsers) string { return `{"fiscal_year_start_month":1,"currency":"USD"}` }, http.StatusForbidden},
		{"nobody deletes settings", LevelAdmin, http.MethodDelete, settingsURL,
			func(levelUsers) string { return "" }, http.StatusForbidden},
		{"bookkeeper cannot change numbering", LevelBookkeeper, http.MethodPatch, journalSequenceURL,
			func(levelUsers) string { return `{"prefix":"JE-"}` }, http.StatusNotFound},
		{"admin changes the prefix", LevelAdmin, http.MethodPatch, journalSequenceURL,
			func(levelUsers) string { return `{"prefix":"JE-"}` }, http.StatusOK},
		{"admin cannot retype a sequence", LevelAdmin, http.MethodPatch, journalSequenceURL,
			func(levelUsers) string { return `{"doc_type":"journal"}` }, http.StatusNotFound},
		{"bookkeeper cannot grant an override", LevelBookkeeper, http.MethodPost, "/api/collections/books_close_overrides/records",
			func(u levelUsers) string {
				return fmt.Sprintf(`{"user":%q,"reason":"Audit fix","expires_at":%q}`, u.bookkeeper.Id, future)
			}, http.StatusBadRequest},
		{"admin grants an override", LevelAdmin, http.MethodPost, "/api/collections/books_close_overrides/records",
			func(u levelUsers) string {
				return fmt.Sprintf(`{"user":%q,"reason":"Audit fix","expires_at":%q}`, u.bookkeeper.Id, future)
			}, http.StatusOK},
		{"admin cannot forge granted_by", LevelAdmin, http.MethodPost, "/api/collections/books_close_overrides/records",
			func(u levelUsers) string {
				return fmt.Sprintf(`{"user":%q,"reason":"Audit fix","expires_at":%q,"granted_by":%q}`, u.bookkeeper.Id, future, u.bookkeeper.Id)
			}, http.StatusBadRequest},
		{"bookkeeper cannot make a Books admin", LevelBookkeeper, http.MethodPost, "/api/collections/books_admins/records",
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q}`, u.readOnly.Id) }, http.StatusBadRequest},
		{"admin makes a Books admin", LevelAdmin, http.MethodPost, "/api/collections/books_admins/records",
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q}`, u.bookkeeper.Id) }, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: tc.method,
				url:    tc.url,
				token:  tokenFor(t, users.byLevel(tc.level)),
				body:   tc.body(users),
				want:   tc.want,
			}.run(t, app)
		})
	}
}

// An override is the log of why someone posted into a closed period, so it is
// never deleted. Revoking one means moving its expiry to now.
func TestConfigRules_OverridesAreRevokedNotDeleted(t *testing.T) {
	cases := []struct {
		name   string
		method string
		body   string
		want   int
	}{
		{"admin shortens the expiry", http.MethodPatch, `{"expires_at":"2026-01-01 00:00:00.000Z"}`, http.StatusOK},
		{"admin cannot rewrite the reason", http.MethodPatch, `{"reason":"Something else"}`, http.StatusNotFound},
		{"admin cannot delete", http.MethodDelete, "", http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			ov := saveRecord(t, app, "books_close_overrides", map[string]any{
				"user": users.bookkeeper.Id, "reason": "Year-end adjustment",
				"expires_at": types.NowDateTime().Add(24 * time.Hour),
			})
			apiReq{
				method: tc.method,
				url:    "/api/collections/books_close_overrides/records/" + ov.Id,
				token:  tokenFor(t, users.admin),
				body:   tc.body,
				want:   tc.want,
			}.run(t, app)
		})
	}
}
