package books

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"html/template"

	"tinycld.org/core/branding"
	"tinycld.org/core/pdfrender"
)

// pdfTemplate is the one page every printed Books document uses. html/template
// escapes every value; the brand color and the logo arrive as template.CSS and
// template.URL only after pdfViewOf validated them.
//
//go:embed pdf_template.html
var pdfTemplateSource string

var pdfTemplate = template.Must(template.New("pdf").Parse(pdfTemplateSource))

// renderPDFDocument validates, formats and renders a document to PDF bytes.
func renderPDFDocument(
	ctx context.Context, doc pdfDocument, org branding.Org,
	fonts pdfrender.Fonts, logf func(string, ...any),
) ([]byte, error) {
	if err := doc.validate(); err != nil {
		return nil, err
	}
	page, err := renderPDFHTML(pdfViewOf(doc, org))
	if err != nil {
		return nil, err
	}
	return pdfrender.HTMLToPDF(ctx, page, fonts, logf)
}

func renderPDFHTML(v pdfView) ([]byte, error) {
	var b bytes.Buffer
	if err := pdfTemplate.Execute(&b, v); err != nil {
		return nil, fmt.Errorf("books: pdf template: %w", err)
	}
	return b.Bytes(), nil
}
