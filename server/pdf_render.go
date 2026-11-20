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
	return renderPDFDocuments(ctx, []pdfDocument{doc}, org, fonts, logf)
}

// renderPDFDocuments validates, formats and renders documents to one PDF, each
// after the first starting on a new page (a statements preview).
func renderPDFDocuments(
	ctx context.Context, docs []pdfDocument, org branding.Org,
	fonts pdfrender.Fonts, logf func(string, ...any),
) ([]byte, error) {
	if len(docs) == 0 {
		return nil, fmt.Errorf("books: pdf: no document to render")
	}
	views := make([]pdfView, len(docs))
	for i, doc := range docs {
		if err := doc.validate(); err != nil {
			return nil, err
		}
		views[i] = pdfViewOf(doc, org)
	}
	page, err := renderPDFViewsHTML(views)
	if err != nil {
		return nil, err
	}
	return pdfrender.HTMLToPDF(ctx, page, fonts, logf)
}

// pdfPage is one HTML file of documents: the head reads the first document's
// title and the brand, which every document of one organization shares.
type pdfPage struct {
	Title, Number string
	Brand         pdfBrand
	Documents     []pdfView
}

func renderPDFHTML(v pdfView) ([]byte, error) {
	return renderPDFViewsHTML([]pdfView{v})
}

func renderPDFViewsHTML(views []pdfView) ([]byte, error) {
	first := views[0]
	page := pdfPage{Title: first.Title, Number: first.Number, Brand: first.Brand, Documents: views}
	var b bytes.Buffer
	if err := pdfTemplate.Execute(&b, page); err != nil {
		return nil, fmt.Errorf("books: pdf template: %w", err)
	}
	return b.Bytes(), nil
}
