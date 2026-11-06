package books

import (
	"net/http"
	"strings"
	"testing"
	"time"

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
			got := res.Header.Get("Content-Disposition")
			isPDF := strings.HasSuffix(got, `.pdf"`)
			if !strings.HasPrefix(got, `attachment; filename="`) || !isPDF {
				t.Errorf("Content-Disposition = %q", got)
			}
			// The client names the file from Content-Disposition, also across origins.
			exposed := res.Header.Get("Access-Control-Expose-Headers")
			if exposed != "Content-Disposition" {
				t.Errorf("Access-Control-Expose-Headers = %q", exposed)
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
	levels := map[string]Level{
		"read only": LevelReadOnly, "bookkeeper": LevelBookkeeper, "admin": LevelAdmin,
	}
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
		Build: func(core.App, *core.Record) (pdfDocument, error) {
			return testDocument("x", 1), nil
		},
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
		{"missing record", "", func(*core.Record) string { return "doesnotexist123" },
			http.StatusNotFound},
		{"rule refuses", `id = "never"`, func(c *core.Record) string { return c.Id },
			http.StatusNotFound},
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
			url := "/api/books/pdf/test-customer/" + tc.id(customer)
			pdfReq(t, app, url, tokenFor(t, users.readOnly), tc.want)
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
	doc, err := sampleDocument(app, time.Date(2026, 3, 9, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if got := doc.Dates; len(got) != 2 || got[0].Day != "2026-03-09" || got[1].Day != "2026-04-08" {
		t.Errorf("dates = %+v, want issued 2026-03-09, due 2026-04-08", got)
	}
	if doc.Company.Name != "Acme Books LLC" || doc.Company.Email != "billing@acme.test" ||
		doc.Currency != settings.GetString("currency") {
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
		t.Errorf("sample does not add up: items %d, subtotal %d, tax %d, total %d",
			items, doc.SubtotalCents, tax, doc.Totals[0].Cents)
	}
	if err := doc.validate(); err != nil {
		t.Errorf("sample is invalid: %v", err)
	}
}

// The sample is dated on the local calendar day and due 30 days later, across
// a month and a year end.
func TestSampleDocument_IsDatedTodayInTheServerZone(t *testing.T) {
	app := newBooksApp(t)
	local := time.FixedZone("UTC-6", -6*60*60)
	for _, tc := range []struct {
		now         time.Time
		issued, due string
	}{
		// 23:30 local is already the next day in UTC.
		{time.Date(2026, 3, 1, 23, 30, 0, 0, local), "2026-03-01", "2026-03-31"},
		{time.Date(2026, 12, 20, 9, 0, 0, 0, local), "2026-12-20", "2027-01-19"},
		{time.Date(2028, 1, 30, 9, 0, 0, 0, time.UTC), "2028-01-30", "2028-02-29"},
	} {
		doc, err := sampleDocument(app, tc.now)
		if err != nil {
			t.Fatalf("build: %v", err)
		}
		if doc.Dates[0].Day != tc.issued || doc.Dates[1].Day != tc.due {
			t.Errorf("at %v: dates = %+v, want %s / %s", tc.now, doc.Dates, tc.issued, tc.due)
		}
	}
}

func TestPDFContentDisposition_SanitizesTheName(t *testing.T) {
	const attach = `attachment; filename=`
	for stem, want := range map[string]string{
		"sample-invoice":   attach + `"sample-invoice.pdf"`,
		`Invoice 1042/"x"`: attach + `"invoice-1042-x.pdf"`,
		"../..":            attach + `"document.pdf"`,
		"Café Ltd":         attach + `"caf-ltd.pdf"; filename*=UTF-8''Caf%C3%A9%20Ltd.pdf`,
		"日本":               attach + `"document.pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.pdf`,
		"é/\"..\\x\n":      attach + `"x.pdf"; filename*=UTF-8''%C3%A9..x.pdf`,
		"Café\u202etxt.\ufeffexe": attach +
			`"caf-txt.-exe.pdf"; filename*=UTF-8''Caf%C3%A9txt.exe.pdf`,
		"Caf\u00e9\u061ctxt": attach + `"caf-txt.pdf"; filename*=UTF-8''Caf%C3%A9txt.pdf`,
		"\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645": attach +
			`"document.pdf"; filename*=UTF-8''%D9%85%DB%8C%E2%80%8C` +
			`%D8%AE%D9%88%D8%A7%D9%87%D9%85.pdf`,
	} {
		if got := pdfContentDisposition(stem); got != want {
			t.Errorf("pdfContentDisposition(%q) = %q, want %q", stem, got, want)
		}
	}
}
