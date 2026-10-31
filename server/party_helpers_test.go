package books

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// saveNew saves a record of collection through the app, so the guards bound
// on it run, and returns what they said.
func saveNew(app core.App, collection string, fields map[string]any) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Load(fields)
	return r, app.Save(r)
}

func setFields(t testing.TB, app core.App, collection, id string, fields map[string]any) error {
	t.Helper()
	r := reload(t, app, collection, id)
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.Save(r)
}

// rawSave saves a record of collection with no hook and no validation, so
// only the schema (the unique index) can refuse it.
func rawSave(t testing.TB, app core.App, collection string, fields map[string]any) error {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.SaveNoValidate(r)
}

// runRulesByLevel checks a collection's API rules by Books level: a
// read-only Books member reads its rows and writes none; a user with no
// Books level does not see them. The bookkeeper's create is the positive
// control: the refusals are the rules, not a broken request.
func runRulesByLevel(t *testing.T, collection, noun string) {
	list := "/api/collections/" + collection + "/records"
	cases := []struct {
		name    string
		level   Level
		method  string
		url     func(id string) string
		body    string
		want    int
		content []string
	}{
		{"read lists", LevelReadOnly, http.MethodGet, func(string) string { return list }, "", http.StatusOK, []string{`"totalItems":1`}},
		{"read views", LevelReadOnly, http.MethodGet, func(id string) string { return list + "/" + id }, "", http.StatusOK, []string{`"display_name":"Harborview"`}},
		{"read cannot create", LevelReadOnly, http.MethodPost, func(string) string { return list }, `{"display_name":"Acme"}`, http.StatusBadRequest, nil},
		{"read cannot update", LevelReadOnly, http.MethodPatch, func(id string) string { return list + "/" + id }, `{"notes":"x"}`, http.StatusNotFound, nil},
		{"read cannot delete", LevelReadOnly, http.MethodDelete, func(id string) string { return list + "/" + id }, "", http.StatusNotFound, nil},
		{"none cannot list", LevelNone, http.MethodGet, func(string) string { return list }, "", http.StatusOK, []string{`"totalItems":0`}},
		{"bookkeeper creates", LevelBookkeeper, http.MethodPost, func(string) string { return list }, `{"display_name":"Acme"}`, http.StatusOK, []string{`"display_name":"Acme"`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The guard bound, as in production: it gives every saved row its
			// name_key, so rows do not collide on the collection's name_key index.
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			harbor := saveRecord(t, app, collection, map[string]any{"display_name": "Harborview"})
			apiReq{
				method:  tc.method,
				url:     tc.url(harbor.Id),
				token:   tokenFor(t, users.byLevel(tc.level)),
				body:    tc.body,
				want:    tc.want,
				content: tc.content,
				after: func(t testing.TB, app *tests.TestApp) {
					if tc.level != LevelReadOnly {
						return
					}
					after := reload(t, app, collection, harbor.Id)
					if after.GetString("notes") != "" {
						t.Errorf("a read-only user changed the %s: %v", noun, after.PublicExport())
					}
					if n, _ := app.CountRecords(collection); n != 1 {
						t.Errorf("%d %ss after a read-only request, want 1", n, noun)
					}
				},
			}.run(t, app)
		})
	}
}

// requireNameKeyHidden checks that name_key is the guard's own column: a
// reader sees the display name, never the key, in a view or a list response.
// The folded text is not checked for: sort_key is not hidden and holds it too.
// mk saves the row the reads look at, named Harborview.
func requireNameKeyHidden(t *testing.T, collection string, mk func(t testing.TB, app core.App) *core.Record) {
	list := "/api/collections/" + collection + "/records"
	for _, path := range []string{"", "/view"} {
		t.Run("read"+path, func(t *testing.T) {
			app := newGuardedApp(t)
			users := newLevelUsers(t, app)
			harbor := mk(t, app)
			if got := reload(t, app, collection, harbor.Id).GetString("name_key"); got != "harborview" {
				t.Fatalf("stored name_key = %q, want %q", got, "harborview")
			}
			url := list
			if path == "/view" {
				url = list + "/" + harbor.Id
			}
			scenario := &tests.ApiScenario{
				Name:                  "GET " + url,
				Method:                http.MethodGet,
				URL:                   url,
				Headers:               map[string]string{"Authorization": tokenFor(t, users.readOnly)},
				ExpectedStatus:        http.StatusOK,
				ExpectedContent:       []string{`"display_name":"Harborview"`},
				NotExpectedContent:    []string{`"name_key"`},
				TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
				DisableTestAppCleanup: true,
			}
			scenario.Test(t)
		})
	}
}
