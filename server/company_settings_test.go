package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

var companyFields = []string{"tax_id", "address", "phone", "email", "website"}

func requireCompanyFields(t testing.TB, app *tests.TestApp) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("books_settings")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range companyFields {
		if col.Fields.GetByName(f) == nil {
			t.Fatalf("books_settings has no %q field", f)
		}
	}
}

func TestCompanySettings_SeededRowHasEveryFieldEmpty(t *testing.T) {
	app := newBooksApp(t)
	s := reload(t, app, "books_settings", settingsID)
	for _, f := range companyFields {
		if s.Collection().Fields.GetByName(f) == nil {
			t.Fatalf("books_settings has no %q field", f)
		}
		if got := s.GetString(f); got != "" {
			t.Errorf("seeded %s = %q, want empty", f, got)
		}
	}
}

func TestCompanySettings_AdminSetsEachField(t *testing.T) {
	values := map[string]string{
		"tax_id":  "12-3456789",
		"address": "3540 E Broad St\nMansfield, TX 76063",
		"phone":   "+1 214 555 1234",
		"email":   "books@hartwell.example",
		"website": "https://www.hartwell.example",
	}
	for _, f := range companyFields {
		t.Run(f, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPatch,
				url:    settingsURL,
				token:  tokenFor(t, users.admin),
				body:   fmt.Sprintf(`{%q:%q}`, f, values[f]),
				want:   http.StatusOK,
				after: func(t testing.TB, app *tests.TestApp) {
					if got := reload(t, app, "books_settings", settingsID).GetString(f); got != values[f] {
						t.Fatalf("%s = %q, want %q", f, got, values[f])
					}
				},
			}.run(t, app)
		})
	}
}

func TestCompanySettings_OnlyAdminsWrite(t *testing.T) {
	for _, level := range []Level{LevelBookkeeper, LevelReadOnly} {
		for _, f := range companyFields {
			t.Run(string(level)+"/"+f, func(t *testing.T) {
				app := newBooksApp(t)
				users := newLevelUsers(t, app)
				requireCompanyFields(t, app)
				apiReq{
					method: http.MethodPatch,
					url:    settingsURL,
					token:  tokenFor(t, users.byLevel(level)),
					body:   fmt.Sprintf(`{%q:"x"}`, f),
					want:   http.StatusNotFound,
					after: func(t testing.TB, app *tests.TestApp) {
						if got := reload(t, app, "books_settings", settingsID).GetString(f); got != "" {
							t.Fatalf("%s changed to %q", f, got)
						}
					},
				}.run(t, app)
			})
		}
	}
}

func TestCompanySettings_LengthLimits(t *testing.T) {
	cases := []struct {
		field string
		size  int
	}{{"tax_id", 21}, {"website", 201}}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPatch,
				url:    settingsURL,
				token:  tokenFor(t, users.admin),
				body:   fmt.Sprintf(`{%q:%q}`, tc.field, strings.Repeat("a", tc.size)),
				want:   http.StatusBadRequest,
			}.run(t, app)
		})
	}
}

func TestCompanySettings_CurrencyStaysPinned(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	requireCompanyFields(t, app)
	apiReq{
		method: http.MethodPatch,
		url:    settingsURL,
		token:  tokenFor(t, users.admin),
		body:   `{"currency":"EUR","tax_id":"12-3456789"}`,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			s := reload(t, app, "books_settings", settingsID)
			if s.GetString("currency") != "USD" || s.GetString("tax_id") != "" {
				t.Fatalf("settings = %v", s.PublicExport())
			}
		},
	}.run(t, app)
}

// The 1099 reporting threshold is integer cents: the migration's row starts it
// at $2,000.00, and the schema refuses a negative, a fraction of a cent and an
// amount above the largest exact float64 integer.
func TestCompanySettings_ThresholdIsWholeCentsInRange(t *testing.T) {
	app := newBooksApp(t)
	if got := reload(t, app, "books_settings", "bookssettings01").GetFloat("threshold_1099"); got != 200000 {
		t.Fatalf("seeded threshold_1099 = %v, want 200000", got)
	}
	if err := setFields(t, app, "books_settings", settingsID, map[string]any{"threshold_1099": float64(150000)}); err != nil {
		t.Fatalf("save threshold_1099 150000: %v", err)
	}
	if got := reload(t, app, "books_settings", settingsID).GetFloat("threshold_1099"); got != 150000 {
		t.Fatalf("threshold_1099 = %v, want 150000", got)
	}
	for _, refused := range []float64{-1, 1.5, 9007199254740992} {
		t.Run(fmt.Sprint(refused), func(t *testing.T) {
			err := setFields(t, app, "books_settings", settingsID, map[string]any{"threshold_1099": refused})
			requireSchemaRefusal(t, err, "threshold_1099")
			if got := reload(t, app, "books_settings", settingsID).GetFloat("threshold_1099"); got != 150000 {
				t.Fatalf("threshold_1099 = %v after a refused %v, want 150000", got, refused)
			}
		})
	}
}
