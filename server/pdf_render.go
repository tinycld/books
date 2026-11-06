package books

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"html/template"
	"strings"
	"time"

	"github.com/nathanstitt/omnidoc/pkg/omnidoc"

	"tinycld.org/core/branding"
)

// pdfTemplate is the one page every printed Books document uses. html/template
// escapes every value; the brand color and the logo arrive as template.CSS and
// template.URL only after pdfViewOf validated them.
//
//go:embed pdf_template.html
var pdfTemplateSource string

var pdfTemplate = template.Must(template.New("pdf").Parse(pdfTemplateSource))

// pdfRenderTimeout bounds one render; omnidoc stops at the context.
const pdfRenderTimeout = 30 * time.Second

// pdfFonts chooses the fonts a render may use beyond the bundled ones.
type pdfFonts struct {
	// Dir is a directory of extra font files for characters the bundled fonts
	// lack (docfonts.Dir(), from TINYCLD_FONTS_DIR); "" for none.
	Dir string
	// Hermetic ignores the fonts installed on the machine, so a test proves
	// what the bundled fonts and Dir cover on every host. Production leaves it
	// false.
	Hermetic bool
}

// renderPDFDocument validates, formats and renders a document to PDF bytes.
func renderPDFDocument(ctx context.Context, doc pdfDocument, org branding.Org, fonts pdfFonts, logf func(string, ...any)) ([]byte, error) {
	if err := doc.validate(); err != nil {
		return nil, err
	}
	page, err := renderPDFHTML(pdfViewOf(doc, org))
	if err != nil {
		return nil, err
	}
	return htmlToPDF(ctx, page, fonts, logf)
}

func renderPDFHTML(v pdfView) ([]byte, error) {
	var b bytes.Buffer
	if err := pdfTemplate.Execute(&b, v); err != nil {
		return nil, fmt.Errorf("books: pdf template: %w", err)
	}
	return b.Bytes(), nil
}

// htmlToPDF lays the page out on Letter pages (the @page rule) and writes the
// PDF. No resource loader is set, so the page can load nothing from the network
// or disk; the logo is an inline data: URI. A character the bundled fonts lack
// comes from fonts.Dir, then (system-font mode) from the machine's fonts.
func htmlToPDF(ctx context.Context, page []byte, fonts pdfFonts, logf func(string, ...any)) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, pdfRenderTimeout)
	defer cancel()
	opts := []omnidoc.HTMLOption{omnidoc.WithDefaultPaged(), omnidoc.WithPrintMedia(), omnidoc.WithContext(ctx)}
	if fonts.Dir != "" {
		opts = append(opts, omnidoc.WithFallbackFontDir(fonts.Dir))
	}
	if fonts.Hermetic {
		opts = append(opts, omnidoc.WithBundledFonts())
	}
	if logf != nil {
		opts = append(opts, omnidoc.WithLogf(logf))
	}
	doc, err := omnidoc.OpenHTMLBytes(page, opts...)
	if err != nil {
		return nil, fmt.Errorf("books: lay out pdf: %w", err)
	}
	var out bytes.Buffer
	if err := doc.WritePDF(ctx, &out, omnidoc.PDFOptions{}); err != nil {
		return nil, fmt.Errorf("books: write pdf: %w", err)
	}
	return out.Bytes(), nil
}

// pdfDiagnostics logs the layout messages that mean the printed page is wrong
// (a character drawn as a box, an image that did not load). omnidoc's other
// messages are routine notes about CSS it degrades.
func pdfDiagnostics(ctx context.Context) func(string, ...any) {
	return func(format string, args ...any) {
		msg := fmt.Sprintf(format, args...)
		if !strings.Contains(msg, "no glyph for") && !(strings.Contains(msg, "image") && strings.Contains(msg, "failed")) {
			return
		}
		// An image message quotes its data: URI; keep the log line short.
		if len(msg) > 300 {
			msg = msg[:300] + "…"
		}
		log.WarnContext(ctx, "pdf layout problem", "detail", msg)
	}
}
