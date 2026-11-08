// The import of chosen lines of a stored bank file. A person creates a
// books_bank_imports row with the column mapping and the line numbers; the
// create hook below turns those lines into bank transactions waiting for
// review, skipping every line that is already in Books.

package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	bankFileStatusImported = "imported"
	bankTxnStatusForReview = "for_review"
	// bankHashLookupChunk bounds one IN (...) of the dedupe lookup.
	bankHashLookupChunk = 500

	msgImportFileMissing  = "The bank file does not exist."
	msgImportNoLines      = "Choose at least one transaction to import."
	msgImportLinesFormat  = "Send the lines to import as a list of line numbers."
	msgImportHeaderLine   = "Line %d is the header row."
	msgImportUnknownLine  = "Line %d is not a transaction in this file."
	msgImportRowError     = "Line %d: %s"
	msgImportOneMoreError = " 1 more chosen line has an error."
	msgImportMoreErrors   = " %d more chosen lines have errors."
)

// bankNewTxn is a chosen line that is not in Books yet.
type bankNewTxn struct {
	line int
	txn  bankTxn
	hash string
}

// bankImportPlan is what an import writes once its row is saved.
type bankImportPlan struct {
	file       *core.Record
	connection string
	rows       []bankNewTxn
}

// registerBankImport stamps the importer on a request, and runs the import
// on every create (a Go caller's too) inside serializedThen: the dedupe check
// reads the transactions already stored, so two imports of the same lines
// must not both pass it, and the transactions must exist with the import row
// or not at all.
func registerBankImport(app core.App) {
	app.OnRecordCreateRequest("books_bank_imports").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate("books_bank_imports").BindFunc(func(e *core.RecordEvent) error {
		var plan bankImportPlan
		return serializedThen(e,
			func(tx core.App) error {
				p, err := planBankImport(tx, e.Record)
				plan = p
				return err
			},
			func(tx core.App) error { return applyBankImport(tx, e.Record, plan) })
	})
}

// planBankImport checks the import and works out which chosen lines are new.
// It refuses the whole import when a chosen line has an error, and stamps the
// counts and the mapping it used on the import row.
func planBankImport(tx core.App, r *core.Record) (bankImportPlan, error) {
	file, err := tx.FindRecordById("books_bank_files", r.GetString("file"))
	if errors.Is(err, sql.ErrNoRows) {
		return bankImportPlan{}, refuseField("file", msgImportFileMissing)
	}
	if err != nil {
		return bankImportPlan{}, fmt.Errorf("books: read the file to import: %w", err)
	}
	contents, err := tx.FindFirstRecordByData("books_bank_file_contents", "file", file.Id)
	if err != nil {
		return bankImportPlan{}, fmt.Errorf("books: read the rows of bank file %s: %w", file.Id, err)
	}
	var rows []bankRow
	if err := contents.UnmarshalJSONField("rows", &rows); err != nil {
		return bankImportPlan{}, fmt.Errorf("books: decode the rows of bank file %s: %w", file.Id, err)
	}
	m := mappingFromRecord(r, file.GetString("format"))
	if err := checkMapping(m, contents.GetInt("columns")); err != nil {
		return bankImportPlan{}, err
	}
	m.writeTo(r)
	header, results := mapBankRows(rows, m)
	chosen, err := chosenBankLines(r, header, results)
	if err != nil {
		return bankImportPlan{}, err
	}
	if err := refuseBankRowErrors(chosen); err != nil {
		return bankImportPlan{}, err
	}
	connection := file.GetString("connection")
	hashes := bankRowHashes(connection, results)
	taken, err := importedBankLines(tx, file.Id)
	if err != nil {
		return bankImportPlan{}, err
	}
	known, err := knownBankHashes(tx, chosen, hashes)
	if err != nil {
		return bankImportPlan{}, err
	}
	plan := bankImportPlan{file: file, connection: connection}
	duplicates := 0
	for _, res := range chosen {
		hash := hashes[res.Line]
		if taken[res.Line] || known[hash] {
			duplicates++
			continue
		}
		// A FITID repeated inside one file counts once.
		known[hash] = true
		plan.rows = append(plan.rows, bankNewTxn{line: res.Line, txn: res.Txn, hash: hash})
	}
	r.Set("imported", len(plan.rows))
	r.Set("duplicates", duplicates)
	return plan, nil
}

// chosenBankLines is the mapped row of every chosen line, in line order, each
// once. The header line and a line that is not a row of the file are refused.
func chosenBankLines(r *core.Record, header int, results []bankRowResult) ([]bankRowResult, error) {
	var lines []int
	if err := r.UnmarshalJSONField("lines", &lines); err != nil {
		return nil, refuseField("lines", msgImportLinesFormat)
	}
	if len(lines) == 0 {
		return nil, refuseField("lines", msgImportNoLines)
	}
	byLine := make(map[int]bankRowResult, len(results))
	for _, res := range results {
		byLine[res.Line] = res
	}
	slices.Sort(lines)
	lines = slices.Compact(lines)
	chosen := make([]bankRowResult, 0, len(lines))
	for _, line := range lines {
		if header != 0 && line == header {
			return nil, refuseField("lines", msgImportHeaderLine, line)
		}
		res, ok := byLine[line]
		if !ok {
			return nil, refuseField("lines", msgImportUnknownLine, line)
		}
		chosen = append(chosen, res)
	}
	return chosen, nil
}

// refuseBankRowErrors refuses an import with a chosen row that has an error:
// the first one's line and message, and how many more there are.
func refuseBankRowErrors(chosen []bankRowResult) error {
	var bad []bankRowResult
	for _, res := range chosen {
		if res.Err != "" {
			bad = append(bad, res)
		}
	}
	if len(bad) == 0 {
		return nil
	}
	msg := fmt.Sprintf(msgImportRowError, bad[0].Line, bad[0].Err)
	switch more := len(bad) - 1; {
	case more == 1:
		msg += msgImportOneMoreError
	case more > 1:
		msg += fmt.Sprintf(msgImportMoreErrors, more)
	}
	// The row message repeats text from the file; keep it as written.
	return refuseNamed("%s", msg)
}

// importedBankLines are the lines of the file already imported.
func importedBankLines(tx core.App, fileID string) (map[int]bool, error) {
	rows, err := tx.FindAllRecords("books_bank_transactions", dbx.HashExp{"file": fileID})
	if err != nil {
		return nil, fmt.Errorf("books: read the file's imported lines: %w", err)
	}
	taken := make(map[int]bool, len(rows))
	for _, row := range rows {
		taken[row.GetInt("line")] = true
	}
	return taken, nil
}

// knownBankHashes are the chosen rows' hashes already stored on any file.
func knownBankHashes(tx core.App, chosen []bankRowResult, hashes map[int]string) (map[string]bool, error) {
	wanted := make([]any, 0, len(chosen))
	for _, res := range chosen {
		wanted = append(wanted, hashes[res.Line])
	}
	known := map[string]bool{}
	for chunk := range slices.Chunk(wanted, bankHashLookupChunk) {
		rows, err := tx.FindAllRecords("books_bank_transactions", dbx.In("dedupe_hash", chunk...))
		if err != nil {
			return nil, fmt.Errorf("books: look for transactions already imported: %w", err)
		}
		for _, row := range rows {
			known[row.GetString("dedupe_hash")] = true
		}
	}
	return known, nil
}

// applyBankImport writes the new transactions and marks the file imported,
// after the import row is saved (its id is the transactions' bank_import).
func applyBankImport(tx core.App, r *core.Record, plan bankImportPlan) error {
	col, err := tx.FindCollectionByNameOrId("books_bank_transactions")
	if err != nil {
		return fmt.Errorf("books: find books_bank_transactions: %w", err)
	}
	for _, n := range plan.rows {
		t := core.NewRecord(col)
		t.Set("connection", plan.connection)
		t.Set("file", plan.file.Id)
		t.Set("bank_import", r.Id)
		t.Set("line", n.line)
		t.Set("date", n.txn.Date)
		t.Set("description", n.txn.Description)
		t.Set("memo", n.txn.Memo)
		t.Set("amount", n.txn.Amount)
		t.Set("fitid", n.txn.FitID)
		t.Set("check_number", n.txn.CheckNumber)
		t.Set("dedupe_hash", n.hash)
		t.Set("status", bankTxnStatusForReview)
		if err := tx.Save(t); err != nil {
			return fmt.Errorf("books: save line %d of %s: %w", n.line, plan.file.GetString("name"), err)
		}
	}
	if plan.file.GetString("status") == bankFileStatusImported {
		return nil
	}
	plan.file.Set("status", bankFileStatusImported)
	if err := tx.Save(plan.file); err != nil {
		return fmt.Errorf("books: mark %s imported: %w", plan.file.GetString("name"), err)
	}
	return nil
}
