package books

import (
	"io"
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

// The invoice kind prints a books_invoices record under its view rule: a
// reader with Books read access downloads it, named by its number; a user with
// no Books access is refused as for every kind.
func TestPDFRoute_InvoiceFollowsTheInvoiceViewRule(t *testing.T) {
	postedInvoice := func(t *testing.T) (*postingEnv, string) {
		t.Helper()
		pe := newPostingEnv(t)
		inv := pe.everyKindInvoice(t, map[string]any{"tax_rate": pe.denver.Id})
		mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
		return pe, inv.Id
	}
	t.Run("a reader downloads invoice-1001.pdf", func(t *testing.T) {
		pe, id := postedInvoice(t)
		apiReq{
			method:  http.MethodGet,
			url:     "/api/books/pdf/invoice/" + id,
			token:   tokenFor(t, pe.users.readOnly),
			want:    http.StatusOK,
			content: []string{"%PDF-"},
			before:  bindPDFRoutes,
			response: func(t testing.TB, res *http.Response) {
				want := `attachment; filename="invoice-1001.pdf"`
				if got := res.Header.Get("Content-Disposition"); got != want {
					t.Errorf("Content-Disposition = %q, want %q", got, want)
				}
			},
		}.run(t, pe.app)
	})
	t.Run("no Books access is refused", func(t *testing.T) {
		pe, id := postedInvoice(t)
		pdfReq(t, pe.app, "/api/books/pdf/invoice/"+id, tokenFor(t, pe.users.none), http.StatusForbidden)
	})
	t.Run("an invoice the view rule hides is not found", func(t *testing.T) {
		pe, id := postedInvoice(t)
		col, err := pe.app.FindCollectionByNameOrId("books_invoices")
		if err != nil {
			t.Fatalf("find: %v", err)
		}
		rule := `id = "never"`
		col.ViewRule = &rule
		if err := pe.app.Save(col); err != nil {
			t.Fatalf("save rule: %v", err)
		}
		pdfReq(t, pe.app, "/api/books/pdf/invoice/"+id, tokenFor(t, pe.users.readOnly), http.StatusNotFound)
	})
}

// Spec §4.3: the customer's link downloads the estimate's PDF with no sign-in;
// the token in the path is the credential.
func TestPublicEstimatePDF_ServesTheTokensEstimate(t *testing.T) {
	pe := newPublicEnv(t)
	number := pe.a.GetString("number")
	apiReq{
		method:  http.MethodGet,
		url:     "/api/books/public/estimates/" + tokenOf(t, pe.app, pe.a.Id) + "/pdf",
		want:    http.StatusOK,
		content: []string{"%PDF-"},
		before:  bindPDFRoutes,
		response: func(t testing.TB, res *http.Response) {
			for header, want := range map[string]string{
				"Content-Type":        "application/pdf",
				"Content-Disposition": `attachment; filename="estimate-` + number + `.pdf"`,
				"Cache-Control":       "no-store",
			} {
				if got := res.Header.Get(header); got != want {
					t.Errorf("%s = %q, want %q", header, got, want)
				}
			}
			pdf, err := io.ReadAll(res.Body)
			if err != nil {
				t.Fatalf("read the PDF: %v", err)
			}
			_, text := extractPDFText(t, pdf)
			for _, want := range []string{"Estimate", "No. " + number} {
				if !strings.Contains(text, want) {
					t.Errorf("the PDF text has no %q:\n%s", want, text)
				}
			}
		},
	}.run(t, pe.app)
}

// A token that opens no estimate answers 404, whatever its shape; the session
// route still wants a sign-in.
func TestPublicEstimatePDF_NoEstimateIsNotFound(t *testing.T) {
	pe := newPublicEnv(t)
	deleted := pe.mkEstimate(t, nil)
	deletedToken := tokenOf(t, pe.app, deleted.Id)
	if err := pe.app.Delete(reload(t, pe.app, "books_estimates", deleted.Id)); err != nil {
		t.Fatalf("delete the estimate: %v", err)
	}
	pe.app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindPDFRoutes(e)
		return e.Next()
	})
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		// The control: the route exists and serves a live token, so each 404
		// below is the token check, not a missing route.
		if res := do(get("/api/books/public/estimates/"+tokenOf(t, pe.app, pe.a.Id)+"/pdf", "", "")); res.status != http.StatusOK {
			t.Fatalf("A's token: status %d, want 200; body: %.200s", res.status, res.body)
		}
		for name, token := range map[string]string{
			"a well-formed unknown token": publicUnknownToken,
			"abc":                         "abc",
			"44 characters":               tokenOf(t, pe.app, pe.a.Id) + "x",
			"../x":                        "..%2Fx",
			"a deleted estimate's token":  deletedToken,
		} {
			res := do(get("/api/books/public/estimates/"+token+"/pdf", "", ""))
			if res.status != http.StatusNotFound {
				t.Errorf("%s: status %d, want 404; body: %.200s", name, res.status, res.body)
			}
			if !strings.Contains(res.body, "Document not found.") {
				t.Errorf("%s: body %.200s, want the route's Document not found.", name, res.body)
			}
		}
		if res := do(get("/api/books/pdf/estimate/"+pe.a.Id, "", "")); res.status != http.StatusUnauthorized {
			t.Errorf("the session route with no auth: status %d, want 401", res.status)
		}
	})
}

// Email-share spec §4.3: the invoice's customer link downloads its PDF with no
// sign-in; the token in the path is the credential.
func TestPublicInvoicePDF_ServesThePostedInvoice(t *testing.T) {
	ip := newInvoicePublicEnv(t)
	posted := ip.postedInvoice(t)
	number := posted.GetString("number")
	apiReq{
		method:  http.MethodGet,
		url:     "/api/books/public/invoices/" + invoiceTokenOf(t, ip.app, posted.Id) + "/pdf",
		want:    http.StatusOK,
		content: []string{"%PDF-"},
		before:  bindPDFRoutes,
		response: func(t testing.TB, res *http.Response) {
			for header, want := range map[string]string{
				"Content-Type":        "application/pdf",
				"Content-Disposition": `attachment; filename="invoice-` + number + `.pdf"`,
				"Cache-Control":       "no-store",
			} {
				if got := res.Header.Get(header); got != want {
					t.Errorf("%s = %q, want %q", header, got, want)
				}
			}
			pdf, err := io.ReadAll(res.Body)
			if err != nil {
				t.Fatalf("read the PDF: %v", err)
			}
			_, text := extractPDFText(t, pdf)
			for _, want := range []string{"Invoice", number} {
				if !strings.Contains(text, want) {
					t.Errorf("the PDF text has no %q:\n%s", want, text)
				}
			}
		},
	}.run(t, ip.app)
}

// A token of a wrong shape, a token no invoice has, a draft's and a void
// invoice's token each answer 404 Document not found.
func TestPublicInvoicePDF_NoPostedInvoiceIsNotFound(t *testing.T) {
	ip := newInvoicePublicEnv(t)
	posted := ip.postedInvoice(t)
	draft := ip.mkInvoice(t, nil)
	voided := ip.postedInvoice(t)
	if err := voidInvoiceAs(ip.app, voided.Id, ip.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	ip.app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindPDFRoutes(e)
		return e.Next()
	})
	serveCalls(t, ip.app, func(do func(apiReq) callResult) {
		// The control: the route serves a posted invoice's token, so each 404
		// below is the token check, not a missing route.
		if res := do(get("/api/books/public/invoices/"+invoiceTokenOf(t, ip.app, posted.Id)+"/pdf", "", "")); res.status != http.StatusOK {
			t.Fatalf("the posted invoice's token: status %d, want 200; body: %.200s", res.status, res.body)
		}
		for name, token := range map[string]string{
			"a token of a wrong shape": "abc",
			"a token no invoice has":   invoicePublicUnknownToken,
			"a draft's token":          invoiceTokenOf(t, ip.app, draft.Id),
			"a void invoice's token":   invoiceTokenOf(t, ip.app, voided.Id),
			"44 characters":            invoiceTokenOf(t, ip.app, posted.Id) + "x",
		} {
			res := do(get("/api/books/public/invoices/"+token+"/pdf", "", ""))
			if res.status != http.StatusNotFound {
				t.Errorf("%s: status %d, want 404; body: %.200s", name, res.status, res.body)
			}
			if !strings.Contains(res.body, "Document not found.") {
				t.Errorf("%s: body %.200s, want the route's Document not found.", name, res.body)
			}
		}
	})
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

// The route names the file through core's header: a document number with a
// non-ASCII character keeps an ASCII fallback and carries its real spelling in
// filename*. Core's pdfrender tests hold the full table of names.
func TestPDFRoute_NonASCIINumberGivesAFilenameStarHeader(t *testing.T) {
	withDocumentKind(t, "test-number", documentKind{
		Build: func(core.App, *core.Record) (pdfDocument, error) {
			return testDocument("x", 1), nil
		},
		FileName: func(pdfDocument) string { return "invoice-№1001" },
	})
	app := newBooksApp(t)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/books/pdf/test-number",
		token:   tokenFor(t, newLevelUsers(t, app).admin),
		want:    http.StatusOK,
		content: []string{"%PDF-"},
		before:  bindPDFRoutes,
		response: func(t testing.TB, res *http.Response) {
			want := `attachment; filename="invoice--1001.pdf"; ` +
				`filename*=UTF-8''invoice-%E2%84%961001.pdf`
			if got := res.Header.Get("Content-Disposition"); got != want {
				t.Errorf("Content-Disposition = %q, want %q", got, want)
			}
		},
	}.run(t, app)
}
