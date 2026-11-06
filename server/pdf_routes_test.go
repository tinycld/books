package books

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// pdfReq requests a PDF route with the PDF routes bound and checks the status,
// the body prefix and (for a 200) the download headers. One call per app.
func pdfReq(t *testing.T, app *tests.TestApp, url, token string, want int) {
	t.Helper()
	req := apiReq{
		method:  http.MethodGet,
		url:     url,
		token:   token,
		want:    want,
		content: []string{`"status":`},
		before:  bindPDFRoutes,
	}
	if want == http.StatusOK {
		req.content = []string{"%PDF-"}
		req.response = func(t testing.TB, res *http.Response) {
			if got := res.Header.Get("Content-Type"); got != "application/pdf" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := res.Header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q", got)
			}
			if got := res.Header.Get("Content-Disposition"); !strings.HasPrefix(got, `attachment; filename="`) || !strings.HasSuffix(got, `.pdf"`) {
				t.Errorf("Content-Disposition = %q", got)
			}
		}
	}
	req.run(t, app)
}

// withDocumentKind registers a kind for one test.
func withDocumentKind(t *testing.T, slug string, kind documentKind) {
	t.Helper()
	documentKinds[slug] = kind
	t.Cleanup(func() { delete(documentKinds, slug) })
}

func TestPDFRoute_SampleIsAPDFForEveryBooksReader(t *testing.T) {
	levels := map[string]Level{"read only": LevelReadOnly, "bookkeeper": LevelBookkeeper, "admin": LevelAdmin}
	for name, level := range levels {
		t.Run(name, func(t *testing.T) {
			app := newBooksApp(t)
			user := newLevelUsers(t, app).byLevel(level)
			pdfReq(t, app, "/api/books/pdf/sample", tokenFor(t, user), http.StatusOK)
		})
	}
}

func TestPDFRoute_RefusesAnonymousNoAccessAndDisabled(t *testing.T) {
	t.Run("anonymous", func(t *testing.T) {
		app := newBooksApp(t)
		pdfReq(t, app, "/api/books/pdf/sample", "", http.StatusUnauthorized)
	})
	t.Run("no access", func(t *testing.T) {
		app := newBooksApp(t)
		users := newLevelUsers(t, app)
		pdfReq(t, app, "/api/books/pdf/sample", tokenFor(t, users.none), http.StatusForbidden)
	})
	t.Run("disabled", func(t *testing.T) {
		app := newBooksApp(t)
		users := newLevelUsers(t, app)
		// The token is minted before the account is disabled, as in production.
		token := tokenFor(t, users.admin)
		users.admin.Set("disabled", true)
		if err := app.Save(users.admin); err != nil {
			t.Fatalf("disable: %v", err)
		}
		pdfReq(t, app, "/api/books/pdf/sample", token, http.StatusForbidden)
	})
}

func TestPDFRoute_UnknownKindsAndWrongShapesAreNotFound(t *testing.T) {
	withDocumentKind(t, "test-customer", documentKind{Collection: "books_customers",
		Build:    func(core.App, *core.Record) (pdfDocument, error) { return testDocument("x", 1), nil },
		FileName: func(pdfDocument) string { return "x" }})
	for _, url := range []string{
		"/api/books/pdf/nope",
		"/api/books/pdf/sample/abc123",
		"/api/books/pdf/test-customer",
	} {
		t.Run(url, func(t *testing.T) {
			app := newBooksApp(t)
			token := tokenFor(t, newLevelUsers(t, app).admin)
			pdfReq(t, app, url, token, http.StatusNotFound)
		})
	}
}

// A kind printed from a record answers 404 for a record the reader may not
// view, exactly as PocketBase's view API does, so the route is no oracle.
func TestPDFRoute_RecordKindsFollowTheViewRule(t *testing.T) {
	withDocumentKind(t, "test-customer", documentKind{
		Collection: "books_customers",
		Build: func(_ core.App, r *core.Record) (pdfDocument, error) {
			return testDocument(r.GetString("display_name"), 1), nil
		},
		FileName: func(pdfDocument) string { return "customer" },
	})
	cases := []struct {
		name     string
		viewRule string
		id       func(*core.Record) string
		want     int
	}{
		{"viewable", "", func(c *core.Record) string { return c.Id }, http.StatusOK},
		{"missing record", "", func(*core.Record) string { return "doesnotexist123" }, http.StatusNotFound},
		{"rule refuses", `id = "never"`, func(c *core.Record) string { return c.Id }, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			customer := mkCustomer(t, app, "Acme Co", "")
			if tc.viewRule != "" {
				col, err := app.FindCollectionByNameOrId("books_customers")
				if err != nil {
					t.Fatalf("find: %v", err)
				}
				col.ViewRule = &tc.viewRule
				if err := app.Save(col); err != nil {
					t.Fatalf("save rule: %v", err)
				}
			}
			pdfReq(t, app, "/api/books/pdf/test-customer/"+tc.id(customer), tokenFor(t, users.readOnly), tc.want)
		})
	}
}

func TestSampleDocument_UsesTheCompanySettingsAndAddsUp(t *testing.T) {
	app := newBooksApp(t)
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		t.Fatalf("settings: %v", err)
	}
	settings.Set("business_name", "Acme Books LLC")
	settings.Set("address", "123 Main St\nSpringfield, IL 62701")
	settings.Set("email", "billing@acme.test")
	if err := app.Save(settings); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	doc, err := buildSampleDocument(app, nil)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if doc.Company.Name != "Acme Books LLC" || doc.Company.Email != "billing@acme.test" || doc.Currency != settings.GetString("currency") {
		t.Errorf("company = %+v, currency = %s", doc.Company, doc.Currency)
	}
	var items int64
	for _, l := range doc.Lines {
		if l.Kind == lineItem {
			items += l.AmountCents
		}
	}
	tax := doc.TaxLines[0].AmountCents
	if items != doc.SubtotalCents || tax != taxOn(doc.SubtotalCents, doc.TaxLines[0].RatePpm) ||
		doc.Totals[0].Cents != doc.SubtotalCents+tax || doc.BigAmount.Cents != doc.Totals[0].Cents {
		t.Errorf("sample does not add up: items %d, subtotal %d, tax %d, total %d", items, doc.SubtotalCents, tax, doc.Totals[0].Cents)
	}
	if err := doc.validate(); err != nil {
		t.Errorf("sample is invalid: %v", err)
	}
}

func TestPDFContentDisposition_SanitizesTheName(t *testing.T) {
	for stem, want := range map[string]string{
		"sample-invoice":   `attachment; filename="sample-invoice.pdf"`,
		`Invoice 1042/"x"`: `attachment; filename="invoice-1042-x.pdf"`,
		"../..":            `attachment; filename="document.pdf"`,
		"Café Ltd":         `attachment; filename="caf-ltd.pdf"; filename*=UTF-8''Caf%C3%A9%20Ltd.pdf`,
		"日本":               `attachment; filename="document.pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.pdf`,
		"é/\"..\\x\n":      `attachment; filename="x.pdf"; filename*=UTF-8''%C3%A9..x.pdf`,
	} {
		if got := pdfContentDisposition(stem); got != want {
			t.Errorf("pdfContentDisposition(%q) = %q, want %q", stem, got, want)
		}
	}
}
