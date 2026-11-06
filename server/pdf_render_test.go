package books

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/nathanstitt/omnidoc/pkg/omnidoc"
	"golang.org/x/image/font/gofont/gobold"

	"tinycld.org/core/branding"
	"tinycld.org/core/readonly/readonlytest"
)

// A 1x1 lossless WebP.
const webpLogoBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="

// extractPDFText reads a rendered PDF back: its page count and its text (each
// page's text, footers included, in order).
func extractPDFText(t testing.TB, pdf []byte) (int, string) {
	t.Helper()
	doc, err := omnidoc.OpenBytes(pdf)
	if err != nil {
		t.Fatalf("reopen pdf: %v", err)
	}
	var b bytes.Buffer
	if err := doc.WriteText(context.Background(), &b, omnidoc.MarkdownOptions{}); err != nil {
		t.Fatalf("pdf text: %v", err)
	}
	return doc.PageCount(), b.String()
}

var pageFooter = regexp.MustCompile(`Page \d+ of \d+`)

// collectLogs gathers omnidoc's diagnostics for a test to inspect.
func collectLogs(logs *[]string) func(string, ...any) {
	return func(format string, args ...any) { *logs = append(*logs, fmt.Sprintf(format, args...)) }
}

func render(t *testing.T, doc pdfDocument, org branding.Org) ([]byte, []string) {
	t.Helper()
	var logs []string
	// Hermetic: the machine's fonts must not hide a glyph the bundle lacks.
	pdf, err := renderPDFDocument(context.Background(), doc, org, pdfFonts{Hermetic: true}, collectLogs(&logs))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	return pdf, logs
}

func TestRenderPDF_ShortDocumentIsOneLetterPageWithItsPageNumber(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 3), testOrg())
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatalf("not a PDF: %q", pdf[:8])
	}
	doc, err := omnidoc.OpenBytes(pdf)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	w, h, err := doc.PageSize(0)
	if err != nil || h == 0 || w/h < 8.5/11-0.01 || w/h > 8.5/11+0.01 {
		t.Errorf("page is %.0fx%.0f, not Letter proportions", w, h)
	}
	pages, text := extractPDFText(t, pdf)
	if pages != 1 || !strings.Contains(text, "Page 1 of 1") {
		t.Errorf("pages = %d, text has no footer: %q", pages, text)
	}
	// Raw text, not whitespace-flattened: a party line that wraps fails here.
	for _, want := range []string{"Acme Books LLC", "Jordan Lee", "Northwind Traders", "San Francisco, CA 94105", "$250.00", "State sales tax (6.25%)", "Nov 5, 2026"} {
		if !strings.Contains(text, want) {
			t.Errorf("text has no %q", want)
		}
	}
}

func TestRenderPDF_LongDocumentRepeatsTheHeaderOnEveryPage(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 300), testOrg())
	pages, text := extractPDFText(t, pdf)
	if pages < 5 {
		t.Fatalf("300 lines made %d pages", pages)
	}
	// Each page's text ends with its footer. "Description" is the column header
	// only: the rows say "Consulting hours". The summary may close on a page of
	// its own, which has no rows and so no header.
	if got := len(pageFooter.FindAllString(text, -1)); got != pages {
		t.Errorf("page footer printed %d times over %d pages", got, pages)
	}
	withRows := 0
	for _, page := range pageFooter.Split(text, -1) {
		hasRows, hasHeader := strings.Contains(page, "Consulting hours"), strings.Contains(page, "Description")
		if hasRows {
			withRows++
		}
		if hasRows != hasHeader {
			t.Errorf("a page has rows=%v but column header=%v", hasRows, hasHeader)
		}
	}
	if withRows < pages-1 {
		t.Errorf("only %d of %d pages have rows", withRows, pages)
	}
	if last := fmt.Sprintf("Page %d of %d", pages, pages); !strings.Contains(text, last) {
		t.Errorf("text has no %q", last)
	}
}

func TestRenderPDF_EscapesHTMLInNames(t *testing.T) {
	name := `<script>alert(1)</script> & "Co"`
	doc := testDocument(name, 1)
	doc.Company.Name = `<b>Acme</b>`
	page, err := renderPDFHTML(pdfViewOf(doc, testOrg()))
	if err != nil {
		t.Fatalf("html: %v", err)
	}
	if bytes.Contains(page, []byte("<script>alert")) || bytes.Contains(page, []byte("<b>Acme")) {
		t.Fatal("a name reached the page as markup")
	}
	if !bytes.Contains(page, []byte("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#34;Co&#34;")) {
		t.Errorf("the name was not escaped as text")
	}
	pdf, _ := render(t, doc, testOrg())
	if _, text := extractPDFText(t, pdf); !strings.Contains(text, `<script>alert(1)</script> & "Co"`) {
		t.Errorf("the name does not print literally")
	}
}

// Small caps are pinned in omnidoc; this test pins only that the bundled fonts
// cover these names (no glyph is drawn as a box).
func TestRenderPDF_PrintsNonLatinNamesWithoutMissingGlyphs(t *testing.T) {
	doc := testDocument("Zoë Ñandú Łódź", 1)
	doc.Parties = append(doc.Parties,
		pdfParty{Label: "Ship to", Name: "Ελληνικά ά", Company: "Москва Київ"},
		pdfParty{Label: "Contact", Name: "שלום"})
	pdf, logs := render(t, doc, testOrg())
	for _, l := range logs {
		if strings.Contains(l, "no glyph for") {
			t.Errorf("missing glyph: %s", l)
		}
	}
	_, text := extractPDFText(t, pdf)
	for _, want := range []string{"Zoë Ñandú Łódź", "Ελληνικά ά", "Москва Київ"} {
		if !strings.Contains(text, want) {
			t.Errorf("text has no %q", want)
		}
	}
}

func pngLogo(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	img.Set(2, 2, color.RGBA{30, 64, 175, 255})
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return b.Bytes()
}

func TestRenderPDF_EmbedsPngAndWebpLogos(t *testing.T) {
	webp, _ := base64.StdEncoding.DecodeString(webpLogoBase64)
	for logoType, logo := range map[string][]byte{"image/png": pngLogo(t), "image/webp": webp} {
		org := testOrg()
		org.Logo, org.LogoType = logo, logoType
		pdf, logs := render(t, testDocument("Jordan Lee", 1), org)
		if !bytes.Contains(pdf, []byte("/Subtype /Image")) {
			t.Errorf("%s: no image in the PDF", logoType)
		}
		for _, l := range logs {
			if strings.Contains(l, "image") && strings.Contains(l, "failed") {
				t.Errorf("%s: %s", logoType, l)
			}
		}
	}
}

func TestRenderPDF_NoLogoPrintsTheNameOnly(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 1), testOrg())
	if bytes.Contains(pdf, []byte("/Subtype /Image")) {
		t.Error("an image was embedded with no logo")
	}
}

func TestRenderPDF_UsesTheBrandColor(t *testing.T) {
	org := testOrg()
	org.Color = "#1e40af"
	page, err := renderPDFHTML(pdfViewOf(testDocument("Jordan Lee", 1), org))
	if err != nil {
		t.Fatalf("html: %v", err)
	}
	if !bytes.Contains(page, []byte("background: #1e40af")) || !bytes.Contains(page, []byte("color: #ffffff")) {
		t.Error("the header does not use the brand color with readable text")
	}
}

// renderPDFDocument validates first: a document the formatters cannot print
// truthfully is refused before any layout.
func TestRenderPDF_RefusesAnInvalidDocument(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Currency = "dollars"
	if _, err := renderPDFDocument(context.Background(), doc, testOrg(), pdfFonts{}, nil); err == nil {
		t.Error("an invalid document rendered")
	}
}

// A name with characters the bundled fonts lack prints from the configured
// fonts directory (TINYCLD_FONTS_DIR in production). Go Bold stands in for a
// CJK font: it has box-drawing characters the bundle does not.
func TestRenderPDF_UsesTheFontsDirectoryForMissingCharacters(t *testing.T) {
	doc := testDocument("Box ─░▲ Co", 1)
	missing := func(fonts pdfFonts) int {
		var logs []string
		if _, err := renderPDFDocument(context.Background(), doc, testOrg(), fonts, collectLogs(&logs)); err != nil {
			t.Fatalf("render: %v", err)
		}
		n := 0
		for _, l := range logs {
			if strings.Contains(l, "no glyph for") {
				n++
			}
		}
		return n
	}
	if missing(pdfFonts{Hermetic: true}) == 0 {
		t.Fatal("precondition: the bundled fonts already cover ─░▲")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Extra.ttf"), gobold.TTF, 0o644); err != nil {
		t.Fatalf("write font: %v", err)
	}
	if n := missing(pdfFonts{Dir: dir, Hermetic: true}); n != 0 {
		t.Errorf("%d characters still missing with the fonts directory", n)
	}
}

func TestPDFDiagnostics_LogsOnlyGlyphAndImageProblemsAndCutsLongOnes(t *testing.T) {
	logs := readonlytest.CaptureLogs(t)
	logf := pdfDiagnostics(context.Background())
	logf("no glyph for %q in font %s", 'Z', "Sans")
	logf("image %s failed: %s", "data:image/png;base64,"+strings.Repeat("A", 400), "bad")
	logf("unsupported CSS property %s", "float")
	logf("image %s loaded", "logo")
	// "é" is two bytes; the first one straddles the 300-byte cut.
	logf("image %s failed: %s", strings.Repeat("A", 293)+strings.Repeat("é", 10), "bad")

	var got []readonlytest.Record
	for _, r := range logs() {
		if r.Msg == "pdf layout problem" {
			got = append(got, r)
		}
	}
	if len(got) != 3 {
		t.Fatalf("logged %d layout problems, want 3: %+v", len(got), got)
	}
	glyph, image, accented := got[0], got[1], got[2]
	if glyph.Level != slog.LevelWarn || glyph.Attrs["pkg"] != "books" || !strings.HasPrefix(glyph.Attrs["detail"], "no glyph for") {
		t.Errorf("glyph record = %+v", glyph)
	}
	if want := 300 + len("…"); len(image.Attrs["detail"]) != want || !strings.HasSuffix(image.Attrs["detail"], "…") {
		t.Errorf("image detail is %d bytes, want %d ending in an ellipsis", len(image.Attrs["detail"]), want)
	}
	// Bytes 299-300 hold the first "é": the cut drops it whole.
	if d := accented.Attrs["detail"]; !utf8.ValidString(d) || d != "image "+strings.Repeat("A", 293)+"…" {
		t.Errorf("accented detail was cut inside a character or is too long: %q (%d bytes)", d, len(d))
	}
}
