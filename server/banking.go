// Banking connects a Books bank or credit card account and stores the
// statement files the bank's website exports, one file per upload. Books has
// no live bank feed: the import units parse a stored file into transactions
// later, reading its format and content_hash and the protected file itself
// from the app's filesystem.

package books

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// bankFileExtensions are the statement exports Books takes: CSV, and OFX with
// its Quicken (QFX) and QuickBooks (QBO) names. Compared lower-cased.
var bankFileExtensions = []string{".csv", ".ofx", ".qfx", ".qbo"}

const (
	// maxBankFileBytes is the file field's maxSize in 2100000008, checked here
	// first so the refusal is a message the client keeps.
	maxBankFileBytes = 5242880
	// bankFileSniffBytes is how much of a file the content sniff reads: an OFX
	// header or a CSV header line is near the start.
	bankFileSniffBytes     = 4096
	bankFileStatusUploaded = "uploaded"
)

const (
	msgBankFileEmpty   = "This file is empty."
	msgBankFileType    = "Choose a CSV, OFX, QFX or QBO file."
	msgBankFileTooBig  = "Choose a file of 5 MB or less."
	msgBankFileNotBank = "This does not look like a CSV or OFX bank file."
)

// utf8BOM starts some bank CSV exports; it is not part of the header line.
const utf8BOM = "\xEF\xBB\xBF"

// registerBanking binds the request hooks that stamp who connected and that
// check and stamp an uploaded file. They are request hooks because what they
// read (the request's user, the uploaded bytes) exists only on a request; a Go
// caller (the import units) sets these fields itself.
func registerBanking(app core.App) {
	app.OnRecordCreateRequest("books_bank_connections").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreateRequest("books_bank_files").BindFunc(stampBankUpload)
}

// stampBankUpload checks an uploaded statement file and stamps what the row
// says about it. It runs before PocketBase's own field validation, because
// core's uploadRecordWithFile keeps only a response's top-level message: a
// field error from the schema (the file's maxSize, a required file) would
// reach the person as "Failed to create record." with nothing they can act on.
// The create rule has already refused a client that sent a stamped field.
func stampBankUpload(e *core.RecordRequestEvent) error {
	files := e.Record.GetUnsavedFiles("file")
	if len(files) == 0 {
		return refuse(msgBankFileEmpty)
	}
	f := files[0]
	format, hash, err := readBankUpload(f)
	if err != nil {
		return err
	}
	e.Record.Set("name", truncateRunes(f.OriginalName, 255))
	e.Record.Set("format", format)
	e.Record.Set("size", f.Size)
	e.Record.Set("content_hash", hash)
	e.Record.Set("status", bankFileStatusUploaded)
	// A superuser keeps the uploader it sent, which the seed uses.
	stampActor(e.Record, "uploaded_by", e.Auth)
	return e.Next()
}

// readBankUpload refuses a file that is empty, has another extension, is over
// the limit or does not look like a bank file, and otherwise returns its
// sniffed format and the hex sha256 of its bytes. The cheap checks on the
// name and the declared size run before the file is read.
func readBankUpload(f *filesystem.File) (format string, hash string, err error) {
	if f.Size == 0 {
		return "", "", refuse(msgBankFileEmpty)
	}
	if !slices.Contains(bankFileExtensions, strings.ToLower(filepath.Ext(f.OriginalName))) {
		return "", "", refuse(msgBankFileType)
	}
	if f.Size > maxBankFileBytes {
		return "", "", refuse(msgBankFileTooBig)
	}
	r, err := f.Reader.Open()
	if err != nil {
		return "", "", fmt.Errorf("books: read the uploaded file: %w", err)
	}
	defer r.Close()
	// One byte past the limit, so a reader that holds more than the declared
	// size is refused rather than cut silently.
	data, err := io.ReadAll(io.LimitReader(r, maxBankFileBytes+1))
	if err != nil {
		return "", "", fmt.Errorf("books: read the uploaded file: %w", err)
	}
	if len(data) == 0 {
		return "", "", refuse(msgBankFileEmpty)
	}
	if len(data) > maxBankFileBytes {
		return "", "", refuse(msgBankFileTooBig)
	}
	sum := sha256.Sum256(data)
	format, ok := sniffBankFile(data)
	if !ok {
		return "", "", refuse(msgBankFileNotBank)
	}
	return format, hex.EncodeToString(sum[:]), nil
}

// sniffBankFile tells an OFX file from a CSV file by the first
// bankFileSniffBytes of its content, and refuses anything else (a PDF or a
// spreadsheet renamed .csv, plain text). OFX (and QFX, QBO) has an OFXHEADER
// line or an <OFX> tag; a CSV has no NUL byte and its first non-blank line
// holds a comma, a semicolon or a tab.
func sniffBankFile(data []byte) (string, bool) {
	head := string(data[:min(len(data), bankFileSniffBytes)])
	upper := strings.ToUpper(head)
	if strings.Contains(upper, "OFXHEADER") || strings.Contains(upper, "<OFX>") {
		return "ofx", true
	}
	if strings.ContainsRune(head, 0) {
		return "", false
	}
	for line := range strings.SplitSeq(strings.TrimPrefix(head, utf8BOM), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if strings.ContainsAny(line, ",;\t") {
			return "csv", true
		}
		return "", false
	}
	return "", false
}

// truncateRunes cuts s to at most max runes, never inside a rune. PocketBase
// counts a text field's max in runes, and a longer original file name would
// otherwise fail the save with a field error the client never shows.
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// accountDisplayName names an account as people read it in a message:
// "1000 Business Checking", or the name alone when it has no number.
func accountDisplayName(r *core.Record) string {
	return strings.TrimSpace(r.GetString("number") + " " + r.GetString("name"))
}

// bankConnectionLabel names a connection by its account, since the row holds
// only the account's id. An account that cannot be read gives "", so the
// audit row is still written.
func bankConnectionLabel(app core.App, r *core.Record) string {
	account, err := app.FindRecordById("books_accounts", r.GetString("account"))
	if err != nil {
		return ""
	}
	return accountDisplayName(account)
}
