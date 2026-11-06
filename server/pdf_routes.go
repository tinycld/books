package books

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/branding"
	"tinycld.org/core/docfonts"
	"tinycld.org/core/reports"
)

// bindPDFRoutes serves printed documents. A PDF is a file, not a data
// endpoint: the records it prints reach clients only through their live
// queries. Session only: the routes are not in the OAuth registration, so
// core's grant middleware default-denies them to every token.
func bindPDFRoutes(e *core.ServeEvent) {
	e.Router.GET("/api/books/pdf/{kind}", func(re *core.RequestEvent) error {
		return servePDF(re, re.Request.PathValue("kind"), "")
	})
	e.Router.GET("/api/books/pdf/{kind}/{id}", func(re *core.RequestEvent) error {
		return servePDF(re, re.Request.PathValue("kind"), re.Request.PathValue("id"))
	})
}

func servePDF(re *core.RequestEvent, slug, id string) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Sign in to download this document.", nil)
	}
	// A token minted before the account was disabled still authenticates, and a
	// raw route has no collection rule to refuse it (boards requireEnabledAuth).
	if re.Auth.GetBool("disabled") {
		return re.ForbiddenError("Your account is disabled.", nil)
	}
	level, err := levelFor(re.App, re.Auth)
	if err != nil {
		return err
	}
	if !level.CanRead() {
		return re.ForbiddenError("You do not have access to Books.", nil)
	}
	kind, ok := documentKinds[slug]
	if !ok || (kind.Collection == "") != (id == "") {
		return re.NotFoundError("Document not found.", nil)
	}
	var record *core.Record
	if kind.Collection != "" {
		info, err := re.RequestInfo()
		if err != nil {
			return err
		}
		record, err = reports.FindViewableRecord(re.App, info, kind.Collection, id)
		if errors.Is(err, sql.ErrNoRows) {
			return re.NotFoundError("Document not found.", nil)
		}
		if err != nil {
			return err
		}
	}
	doc, err := kind.Build(re.App, record)
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	ctx := re.Request.Context()
	pdf, err := renderPDFDocument(ctx, doc, branding.Load(re.App), pdfFonts{Dir: docfonts.Dir()}, pdfDiagnostics(ctx))
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	re.Response.Header().Set("Content-Disposition", pdfContentDisposition(kind.FileName(doc)))
	re.Response.Header().Set("Cache-Control", "no-store")
	return re.Blob(http.StatusOK, "application/pdf", pdf)
}

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// pdfContentDisposition names the download. A name can come from a person (a
// customer, a document number), so anything that could break the header or
// climb a directory is replaced, as boards' export does.
func pdfContentDisposition(stem string) string {
	stem = strings.Trim(unsafeFileChars.ReplaceAllString(stem, "-"), "-.")
	stem = strings.ToLower(stem)
	if stem == "" {
		stem = "document"
	}
	return `attachment; filename="` + stem + `.pdf"`
}
