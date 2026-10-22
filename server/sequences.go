package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// registerSequenceGuard lets an admin move a document type's next number
// forward but never back over numbers already issued: that would hand a
// second document a number the books already used.
func registerSequenceGuard(app core.App) {
	// Serialized with posting: a post that takes a number after the check
	// would otherwise be overwritten by this save's older next number.
	app.OnRecordUpdate("books_doc_sequences").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
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

func highestSequence(app core.App, docType string) (int, error) {
	var highest int
	err := app.DB().
		NewQuery("SELECT CAST(COALESCE(MAX(sequence), 0) AS INTEGER) FROM books_journal_entries WHERE doc_type = {:type}").
		Bind(dbx.Params{"type": docType}).
		Row(&highest)
	if err != nil {
		return 0, fmt.Errorf("books: read highest %s number: %w", docType, err)
	}
	return highest, nil
}
