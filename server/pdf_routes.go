package books

import (
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/branding"
	"tinycld.org/core/docfonts"
	"tinycld.org/core/pdfrender"
	"tinycld.org/core/reports"
)

// bindPDFRoutes serves printed documents. A PDF is a file, not a data
// endpoint: the records it prints reach clients only through their live
// queries. The /api/books/pdf routes are session only: they are not in the
// OAuth registration, so core's grant middleware default-denies them to every
// token. The public estimate route takes no session: the estimate's link
// token in its path is the credential (servePublicEstimatePDF).
func bindPDFRoutes(e *core.ServeEvent) {
	e.Router.GET("/api/books/public/estimates/{token}/pdf", servePublicEstimatePDF)
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
	return writePDF(re, kind, record)
}

// servePublicEstimatePDF serves an estimate's PDF to the holder of its
// customer link, with no sign-in: the token in the path is the credential. A
// token of the wrong shape, or one no estimate has, answers 404, as the
// session route does for a record it cannot show. The indexed lookup finds the
// row; the constant-time compare then decides.
func servePublicEstimatePDF(re *core.RequestEvent) error {
	token := re.Request.PathValue("token")
	if !publicTokenPattern.MatchString(token) {
		return re.NotFoundError("Document not found.", nil)
	}
	record, err := re.App.FindFirstRecordByFilter("books_estimates", "public_token = {:token}",
		dbx.Params{"token": token})
	if errors.Is(err, sql.ErrNoRows) {
		return re.NotFoundError("Document not found.", nil)
	}
	if err != nil {
		return err
	}
	if subtle.ConstantTimeCompare([]byte(record.GetString("public_token")), []byte(token)) != 1 {
		return re.NotFoundError("Document not found.", nil)
	}
	return writePDF(re, documentKinds["estimate"], record)
}

// writePDF renders kind's document of record (nil for a kind printed from no
// record) and sends it as a download.
func writePDF(re *core.RequestEvent, kind documentKind, record *core.Record) error {
	doc, err := kind.Build(re.App, record)
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	ctx := re.Request.Context()
	fonts := pdfrender.Fonts{Dir: docfonts.Dir()}
	pdf, err := renderPDFDocument(ctx, doc, branding.Load(re.App), fonts, pdfrender.Diagnostics(ctx, log))
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	re.Response.Header().Set("Content-Disposition", pdfrender.ContentDisposition(kind.FileName(doc), "pdf"))
	// The client names the saved file from this header; a web app on another
	// origin may read it only when CORS exposes it.
	re.Response.Header().Add("Access-Control-Expose-Headers", "Content-Disposition")
	re.Response.Header().Set("Cache-Control", "no-store")
	return re.Blob(http.StatusOK, "application/pdf", pdf)
}
