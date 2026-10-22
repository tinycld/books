package books

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/pkgaccess"
)

// coreLevelOf maps a Books level to the core package-access level it must
// agree with: bookkeeper and admin are both core "full".
func coreLevelOf(l Level) string {
	switch l {
	case LevelNone:
		return pkgaccess.LevelNone
	case LevelReadOnly:
		return pkgaccess.LevelReadonly
	default:
		return pkgaccess.LevelFull
	}
}

// The view must resolve every role and override exactly as core's
// pkgaccess.LevelFor does, plus the books_admins elevation. If core changes
// its resolution, this test is what notices.
func TestBooksAccess_MatchesCorePackageAccess(t *testing.T) {
	app := newBooksApp(t)
	cases := []struct {
		name       string
		role       string
		override   string
		booksAdmin bool
		want       Level
	}{
		{"owner", "owner", "", false, LevelAdmin},
		{"org admin", "admin", "", false, LevelAdmin},
		{"org admin with a none row", "admin", "none", false, LevelAdmin},
		{"member", "member", "", false, LevelBookkeeper},
		{"member granted full", "member", "full", false, LevelBookkeeper},
		{"member restricted to readonly", "member", "readonly", false, LevelReadOnly},
		{"member restricted to none", "member", "none", false, LevelNone},
		{"guest", "guest", "", false, LevelNone},
		{"guest granted full", "guest", "full", false, LevelBookkeeper},
		{"guest granted readonly", "guest", "readonly", false, LevelReadOnly},
		{"member Books admin", "member", "", true, LevelAdmin},
		{"guest with full and Books admin", "guest", "full", true, LevelAdmin},
		{"readonly member with a Books admin row stays read-only", "member", "readonly", true, LevelReadOnly},
		{"guest Books admin without core access stays none", "guest", "", true, LevelNone},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			user := mkUser(t, app, tc.role)
			if tc.override != "" {
				setPkgAccess(t, app, user, tc.override)
			}
			if tc.booksAdmin {
				makeBooksAdmin(t, app, user)
			}
			got, err := levelForUser(app, user.Id)
			if err != nil {
				t.Fatalf("levelForUser: %v", err)
			}
			if got != tc.want {
				t.Fatalf("level = %q, want %q", got, tc.want)
			}
			core, err := pkgaccess.LevelFor(app, user, "books")
			if err != nil {
				t.Fatalf("pkgaccess.LevelFor: %v", err)
			}
			if coreLevelOf(got) != core {
				t.Fatalf("Books level %q disagrees with core level %q", got, core)
			}
		})
	}
}

func TestBooksAccess_ViewFieldTypes(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_access")
	if err != nil {
		t.Fatalf("find books_access: %v", err)
	}
	want := map[string]string{
		"level":     core.FieldTypeText,
		"can_read":  core.FieldTypeBool,
		"can_write": core.FieldTypeBool,
		"is_admin":  core.FieldTypeBool,
	}
	for name, typ := range want {
		f := col.Fields.GetByName(name)
		if f == nil {
			t.Fatalf("books_access has no %s field", name)
		}
		if f.Type() != typ {
			t.Errorf("%s is %s, want %s", name, f.Type(), typ)
		}
	}
}

func TestLevelFor_SuperuserAndAnonymous(t *testing.T) {
	app := newBooksApp(t)
	got, err := levelFor(app, nil)
	if err != nil || got != LevelNone {
		t.Fatalf("anonymous: level %q, err %v; want none", got, err)
	}
	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatalf("find superusers: %v", err)
	}
	got, err = levelFor(app, core.NewRecord(superusers))
	if err != nil || got != LevelAdmin {
		t.Fatalf("superuser: level %q, err %v; want admin", got, err)
	}
}

func TestLevel_Capabilities(t *testing.T) {
	cases := []struct {
		level                   Level
		read, write, adminRight bool
	}{
		{LevelNone, false, false, false},
		{LevelReadOnly, true, false, false},
		{LevelBookkeeper, true, true, false},
		{LevelAdmin, true, true, true},
	}
	for _, tc := range cases {
		if tc.level.CanRead() != tc.read || tc.level.CanWrite() != tc.write || tc.level.IsAdmin() != tc.adminRight {
			t.Errorf("%s: read %v write %v admin %v", tc.level, tc.level.CanRead(), tc.level.CanWrite(), tc.level.IsAdmin())
		}
	}
}

// A member reads only their own level row, even with no Books access, so the
// client can tell "no access" from "still loading". An admin reads every row,
// for the Settings screen that manages access.
func TestBooksAccessRules_MemberSeesOwnRowOnly(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_access/records",
		token:   tokenFor(t, users.none),
		want:    http.StatusOK,
		content: []string{`"totalItems":1`, users.none.Id},
	}.run(t, app)
}

func TestBooksAccessRules_AdminSeesEveryRow(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_access/records?perPage=200",
		token:   tokenFor(t, users.admin),
		want:    http.StatusOK,
		content: []string{users.none.Id, users.readOnly.Id, users.bookkeeper.Id, users.admin.Id},
	}.run(t, app)
}

func TestBooksAdmins_OneRowPerUser(t *testing.T) {
	app := newBooksApp(t)
	user := mkUser(t, app, "member")
	makeBooksAdmin(t, app, user)
	col, _ := app.FindCollectionByNameOrId("books_admins")
	dup := core.NewRecord(col)
	dup.Set("user", user.Id)
	if err := app.Save(dup); err == nil {
		t.Fatal("a second books_admins row for the same user was accepted")
	}
}
