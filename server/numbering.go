package books

import (
	"fmt"
	"strconv"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// allocateNumber reserves the next number of a document type and returns it
// with its display form. It must run inside the posting transaction.
//
// No compare-and-swap is needed (contrast boards/server/card_number.go, whose
// create path has no transaction). The caller is inside RunInTransaction on
// PocketBase's single-connection write pool, so two posts are serialized and
// the second reads the counter the first committed. A post that fails rolls
// the counter back with everything else, so a refused post consumes no number
// and numbers never skip.
//
// The row is saved through tx.Save, not raw SQL, so the sequence guard runs
// and a client showing "next number" gets the realtime update.
func allocateNumber(tx core.App, docType string) (int, string, error) {
	row, err := tx.FindFirstRecordByFilter("books_doc_sequences", "doc_type = {:type}", dbx.Params{"type": docType})
	if err != nil {
		return 0, "", fmt.Errorf("books: no number sequence for %s: %w", docType, err)
	}
	n := row.GetInt("next_number")
	row.Set("next_number", n+1)
	if err := tx.Save(row); err != nil {
		return 0, "", fmt.Errorf("books: advance the %s sequence: %w", docType, err)
	}
	return n, formatNumber(row.GetString("prefix"), n), nil
}

func formatNumber(prefix string, n int) string {
	return prefix + strconv.Itoa(n)
}
