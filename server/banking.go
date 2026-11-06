// Banking connects a Books bank or credit card account and stores the
// statement files the bank's website exports, one file per upload. Books has
// no live bank feed: the import units parse a stored file into transactions
// later, reading its format and content_hash and the protected file itself
// from the app's filesystem.

package books

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
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

// bankAccountTypes are the account types that can be connected to Banking.
// tinycld/books/lib/bank-connections.ts mirrors them as BANK_ACCOUNT_TYPES so
// the Connect dialog offers only these; tests/bank-connections.test.ts fails
// when the two lists drift.
var bankAccountTypes = []string{"bank", "credit_card"}

func isBankAccountType(key string) bool {
	return slices.Contains(bankAccountTypes, key)
}

const (
	msgBankFileEmpty             = "This file is empty."
	msgBankFileType              = "Choose a CSV, OFX, QFX or QBO file."
	msgBankFileTooBig            = "Choose a file of 5 MB or less."
	msgBankFileNotBank           = "This does not look like a CSV or OFX bank file."
	msgBankConnectionMissing     = "The bank account connection does not exist."
	msgBankAccountNotConnectable = "Only an active bank or credit card account can be connected."
	msgBankFileDuplicate         = "%s was already uploaded to %s on %s."
	msgBankAccountConnected      = "%s is already connected."
	msgBankDisconnectRefused     = "%s has imported transactions, so it cannot be disconnected."
	msgConnectedTypeChange       = "%s is connected to Banking, so its type cannot change. Disconnect it first."
	msgConnectedInactive         = "%s is connected to Banking. Disconnect it before making it inactive."
	msgConnectedDelete           = "%s is connected to Banking. Disconnect it before deleting it."
)

// utf8BOM starts some bank CSV exports; it is not part of the header line.
const utf8BOM = "\xEF\xBB\xBF"

// registerBanking binds the request hooks that stamp who connected and that
// check and stamp an uploaded file. They are request hooks because what they
// read (the request's user, the uploaded bytes) exists only on a request; a Go
// caller (the import units) sets these fields itself.
//
// The model hooks read other rows, so they run on every save, a Go caller's
// too, and inside serialized: PocketBase runs a create or delete and its hooks
// without a transaction, so two connects of one account, two uploads of the
// same bytes, or an import beside a disconnect would each pass a check made
// outside one. Each check returns a top-level refusal before the unique
// indexes on account and content_hash answer with a field error the client
// does not show.
func registerBanking(app core.App) {
	app.OnRecordCreateRequest("books_bank_connections").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreateRequest("books_bank_files").BindFunc(stampBankUpload)
	app.OnRecordCreate("books_bank_connections").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkBankConnection(tx, e.Record) })
	})
	app.OnRecordDelete("books_bank_connections").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkDisconnect(tx, e.Record) })
	})
	app.OnRecordCreate("books_bank_files").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkBankFileCreate(tx, e.Record) })
	})
}

// checkBankConnection refuses a connection to an account that is missing,
// inactive or not a bank or credit card account, and a second connection to
// one account.
func checkBankConnection(tx core.App, r *core.Record) error {
	accountID := r.GetString("account")
	account, err := tx.FindRecordById("books_accounts", accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuse(msgBankAccountNotConnectable)
	}
	if err != nil {
		return fmt.Errorf("books: read the account to connect: %w", err)
	}
	if account.GetBool("inactive") || !isBankAccountType(account.GetString("type")) {
		return refuse(msgBankAccountNotConnectable)
	}
	existing, err := connectionOf(tx, account.Id)
	if err != nil {
		return err
	}
	if existing != nil {
		return refuseNamed(msgBankAccountConnected, accountDisplayName(account))
	}
	return nil
}

// checkDisconnect refuses to delete a connection once any of its files has
// left uploaded: the cascade would delete the file an import came from.
func checkDisconnect(tx core.App, r *core.Record) error {
	moved, err := tx.CountRecords("books_bank_files", dbx.And(
		dbx.HashExp{"connection": r.Id},
		dbx.Not(dbx.HashExp{"status": bankFileStatusUploaded}),
	))
	if err != nil {
		return fmt.Errorf("books: count the connection's imported files: %w", err)
	}
	if moved == 0 {
		return nil
	}
	account, err := tx.FindRecordById("books_accounts", r.GetString("account"))
	if err != nil {
		return fmt.Errorf("books: read the connected account: %w", err)
	}
	return refuseNamed(msgBankDisconnectRefused, accountDisplayName(account))
}

// checkBankFileCreate refuses a file whose connection does not exist, and a
// file whose bytes are already stored anywhere in Books, since importing the
// same statement twice would post its transactions twice.
func checkBankFileCreate(tx core.App, r *core.Record) error {
	_, err := tx.FindRecordById("books_bank_connections", r.GetString("connection"))
	if errors.Is(err, sql.ErrNoRows) {
		return refuse(msgBankConnectionMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the file's connection: %w", err)
	}
	hash := r.GetString("content_hash")
	if hash == "" {
		return nil
	}
	stored, err := tx.FindFirstRecordByData("books_bank_files", "content_hash", hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: look for a file with the same bytes: %w", err)
	}
	storedConnection, err := tx.FindRecordById("books_bank_connections", stored.GetString("connection"))
	if err != nil {
		return fmt.Errorf("books: read the stored file's connection: %w", err)
	}
	account, err := tx.FindRecordById("books_accounts", storedConnection.GetString("account"))
	if err != nil {
		return fmt.Errorf("books: read the stored file's account: %w", err)
	}
	day := stored.GetDateTime("created").Time().UTC().Format("Jan 2, 2006")
	return refuseNamed(msgBankFileDuplicate, stored.GetString("name"), accountDisplayName(account), day)
}

// connectionOf is the account's connection, or nil when it has none.
func connectionOf(tx core.App, accountID string) (*core.Record, error) {
	r, err := tx.FindFirstRecordByData("books_bank_connections", "account", accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the account's bank connection: %w", err)
	}
	return r, nil
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
