package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// msgSequenceDocTypeFixed refuses a change of a sequence's document type: the
// highest issued number is read by type, so the guard below would then
// compare with another type's numbers.
const msgSequenceDocTypeFixed = "A number sequence keeps its document type."

// registerSequenceGuard lets an admin move a document type's next number
// forward but never back over numbers already issued: that would hand a
// second document a number the books already used.
func registerSequenceGuard(app core.App) {
	// Serialized with posting: a post that takes a number after the check
	// would otherwise be overwritten by this save's older next number.
	app.OnRecordUpdate("books_doc_sequences").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById("books_doc_sequences", e.Record.Id)
			if err != nil {
				return fmt.Errorf("books: read the number sequence: %w", err)
			}
			if stored.GetString("doc_type") != e.Record.GetString("doc_type") {
				return refuse(msgSequenceDocTypeFixed)
			}
			highest, err := highestSequence(tx, e.Record.GetString("doc_type"))
			if err != nil {
				return err
			}
			if e.Record.GetInt("next_number") <= highest {
				return refuse("Numbers up to %d are already used. The next number must be %d or higher.", highest, highest+1)
			}
			return nil
		})
	})
	app.OnRecordDelete("books_doc_sequences").BindFunc(func(e *core.RecordEvent) error {
		return refuse("A number sequence cannot be deleted.")
	})
}

// highestSequenceSQL reads the highest number issued, by any entry that
// holds one: posted, void, or a void's reversal. It repeats the partial
// index's condition (sequence > 0), so SQLite seeks the last row of
// idx_books_je_doc_sequence instead of reading every entry.
const highestSequenceSQL = "SELECT CAST(COALESCE(MAX(sequence), 0) AS INTEGER) FROM books_journal_entries WHERE doc_type = {:type} AND sequence > 0"

func highestSequence(app core.App, docType string) (int, error) {
	var highest int
	err := app.DB().
		NewQuery(highestSequenceSQL).
		Bind(dbx.Params{"type": docType}).
		Row(&highest)
	if err != nil {
		return 0, fmt.Errorf("books: read highest %s number: %w", docType, err)
	}
	return highest, nil
}
