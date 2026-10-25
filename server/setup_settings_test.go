package books

import (
	"net/http"
	"testing"
)

// The wizard saves the business name and marks setup done in one settings
// update. Only a Books admin may do that.
func TestSetupSettings_UpdateByLevel(t *testing.T) {
	body := `{"business_name":"Acme Supply, LLC","ownership":"corporation","setup_completed":true}`
	cases := []struct {
		level   Level
		want    int
		content []string
	}{
		{LevelAdmin, http.StatusOK, []string{`"business_name":"Acme Supply, LLC"`, `"ownership":"corporation"`, `"setup_completed":true`}},
		{LevelBookkeeper, http.StatusNotFound, nil},
		{LevelReadOnly, http.StatusNotFound, nil},
	}
	for _, tc := range cases {
		t.Run(string(tc.level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method:  http.MethodPatch,
				url:     settingsURL,
				token:   tokenFor(t, users.byLevel(tc.level)),
				body:    body,
				want:    tc.want,
				content: tc.content,
			}.run(t, app)
		})
	}
}

func TestSetupSettings_SeededRowIsNotSetUp(t *testing.T) {
	app := newBooksApp(t)
	s := reload(t, app, "books_settings", "bookssettings01")
	if s.Collection().Fields.GetByName("business_name") == nil || s.Collection().Fields.GetByName("setup_completed") == nil {
		t.Fatalf("books_settings lacks business_name or setup_completed")
	}
	if s.Collection().Fields.GetByName("ownership") == nil {
		t.Fatalf("books_settings lacks ownership")
	}
	if s.GetString("ownership") != "" {
		t.Fatalf("seeded ownership = %q, want empty", s.GetString("ownership"))
	}
	if s.GetString("business_name") != "" || s.GetBool("setup_completed") {
		t.Fatalf("seeded settings = %v", s.PublicExport())
	}
}

func TestSetupSettings_RefusesUnknownOwnership(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method: http.MethodPatch,
		url:    settingsURL,
		token:  tokenFor(t, users.byLevel(LevelAdmin)),
		body:   `{"ownership":"trust"}`,
		want:   http.StatusBadRequest,
	}.run(t, app)
}

func TestSetupSettings_StartedFlag(t *testing.T) {
	app := newBooksApp(t)
	s := reload(t, app, "books_settings", "bookssettings01")
	field := s.Collection().Fields.GetByName("setup_started")
	if field == nil {
		t.Fatalf("books_settings lacks setup_started")
	}
	if field.Type() != "bool" {
		t.Fatalf("setup_started type = %q, want bool", field.Type())
	}
	if s.GetBool("setup_started") {
		t.Fatalf("seeded setup_started = true, want false")
	}
}

func TestSetupSettings_StartedByLevel(t *testing.T) {
	cases := []struct {
		level   Level
		want    int
		content []string
	}{
		{LevelAdmin, http.StatusOK, []string{`"setup_started":true`}},
		{LevelBookkeeper, http.StatusNotFound, nil},
		{LevelReadOnly, http.StatusNotFound, nil},
	}
	for _, tc := range cases {
		t.Run(string(tc.level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method:  http.MethodPatch,
				url:     settingsURL,
				token:   tokenFor(t, users.byLevel(tc.level)),
				body:    `{"setup_started":true}`,
				want:    tc.want,
				content: tc.content,
			}.run(t, app)
		})
	}
}
