package books

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

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
// climb a directory is replaced, as boards' export does. A name with non-ASCII
// letters also carries its real spelling in an RFC 6266 filename* parameter;
// the quoted filename stays as the ASCII fallback for old clients.
func pdfContentDisposition(stem string) string {
	fallback := strings.Trim(unsafeFileChars.ReplaceAllString(stem, "-"), "-.")
	fallback = strings.ToLower(fallback)
	if fallback == "" {
		fallback = "document"
	}
	header := `attachment; filename="` + fallback + `.pdf"`
	if isASCII(stem) {
		return header
	}
	return header + `; filename*=UTF-8''` + percentEncodeFileName(realFileName(stem)+".pdf")
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

// realFileName keeps the person's spelling but drops what could climb a
// directory or break a header: path separators, quotes, control characters and
// the bidi controls (including the Arabic letter mark) and byte-order mark that could spoof the displayed name.
// Zero-width joiners stay: Persian, Indic names and emoji need them.
func realFileName(stem string) string {
	clean := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == '"' || r == utf8.RuneError || unicode.IsControl(r) || isSpoofingFormat(r) {
			return -1
		}
		return r
	}, stem)
	clean = strings.Trim(clean, " .")
	if clean == "" {
		return "document"
	}
	return clean
}

func isSpoofingFormat(r rune) bool {
	return r == 0x061C || r == 0x200E || r == 0x200F || (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069) || r == 0xFEFF
}

// percentEncodeFileName encodes every byte outside RFC 5987's attr-char set.
func percentEncodeFileName(name string) string {
	const attrPunct = "!#$&+-.^_`|~"
	var b strings.Builder
	for i := 0; i < len(name); i++ {
		c := name[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.IndexByte(attrPunct, c) >= 0 {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}
