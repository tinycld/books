package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

const shortcutsURL = "/api/collections/books_sidebar_shortcuts/records"

func mkShortcuts(t testing.TB, app *tests.TestApp, userID string) string {
	t.Helper()
	row := saveRecord(t, app, "books_sidebar_shortcuts", map[string]any{
		"user":  userID,
		"items": []map[string]string{{"kind": "screen", "ref": "customers"}},
	})
	return row.Id
}

// A user with Books access reads only the row that names them; a user with no
// Books access reads none, their own included.
func TestSidebarShortcutRules_ReadOnlyYourOwn(t *testing.T) {
	want := map[Level]string{
		LevelNone: `"totalItems":0`, LevelReadOnly: `"totalItems":1`,
		LevelBookkeeper: `"totalItems":1`, LevelAdmin: `"totalItems":1`,
	}
	for _, level := range allLevels {
		t.Run(string(level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			for _, l := range allLevels {
				mkShortcuts(t, app, users.byLevel(l).Id)
			}
			apiReq{
				method:  http.MethodGet,
				url:     shortcutsURL,
				token:   tokenFor(t, users.byLevel(level)),
				want:    http.StatusOK,
				content: []string{want[level]},
			}.run(t, app)
		})
	}
}

func TestSidebarShortcutRules_Create(t *testing.T) {
	items := `[{"kind":"screen","ref":"customers"}]`
	cases := []struct {
		name  string
		level Level
		body  func(u levelUsers) string
		want  int
	}{
		{"a reader saves their own list", LevelReadOnly,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.readOnly.Id, items) }, http.StatusOK},
		{"an empty list is a value", LevelBookkeeper,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":[]}`, u.bookkeeper.Id) }, http.StatusOK},
		{"nobody saves a list for another user", LevelAdmin,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.readOnly.Id, items) }, http.StatusBadRequest},
		{"a user with no Books access saves none", LevelNone,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q,"items":%s}`, u.none.Id, items) }, http.StatusBadRequest},
		{"a list over the size limit is refused", LevelBookkeeper,
			func(u levelUsers) string {
				return fmt.Sprintf(`{"user":%q,"items":[{"kind":"screen","ref":%q}]}`, u.bookkeeper.Id, strings.Repeat("x", 20001))
			}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPost,
				url:    shortcutsURL,
				token:  tokenFor(t, users.byLevel(tc.level)),
				body:   tc.body(users),
				want:   tc.want,
			}.run(t, app)
		})
	}
}

// One row for each user: the client updates it, so a second create is a bug.
func TestSidebarShortcutRules_OneRowForEachUser(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	mkShortcuts(t, app, users.bookkeeper.Id)
	apiReq{
		method: http.MethodPost,
		url:    shortcutsURL,
		token:  tokenFor(t, users.bookkeeper),
		body:   fmt.Sprintf(`{"user":%q,"items":[]}`, users.bookkeeper.Id),
		want:   http.StatusBadRequest,
	}.run(t, app)
}

func TestSidebarShortcutRules_ChangeOnlyYourOwn(t *testing.T) {
	cases := []struct {
		name   string
		actor  Level
		method string
		body   func(u levelUsers) string
		want   int
	}{
		{"the owner reorders", LevelBookkeeper, http.MethodPatch,
			func(levelUsers) string { return `{"items":[{"kind":"new","ref":"invoice"}]}` }, http.StatusOK},
		{"the owner cannot hand the row to another user", LevelBookkeeper, http.MethodPatch,
			func(u levelUsers) string { return fmt.Sprintf(`{"user":%q}`, u.admin.Id) }, http.StatusNotFound},
		{"an admin cannot change another user's list", LevelAdmin, http.MethodPatch,
			func(levelUsers) string { return `{"items":[]}` }, http.StatusNotFound},
		{"an admin cannot delete another user's list", LevelAdmin, http.MethodDelete,
			func(levelUsers) string { return "" }, http.StatusNotFound},
		{"the owner deletes the row to get the defaults back", LevelBookkeeper, http.MethodDelete,
			func(levelUsers) string { return "" }, http.StatusNoContent},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			id := mkShortcuts(t, app, users.bookkeeper.Id)
			apiReq{
				method: tc.method,
				url:    shortcutsURL + "/" + id,
				token:  tokenFor(t, users.byLevel(tc.actor)),
				body:   tc.body(users),
				want:   tc.want,
			}.run(t, app)
		})
	}
}
