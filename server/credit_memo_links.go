package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// invoiceOnly is the one field the link move changes on a credit memo.
var invoiceOnly = map[string]bool{"invoice": true}

// moveCreditMemoLinks is the credit memo part of an invoice correction's
// Replace step (spec §4.3, Q18): every credit memo that names the original,
// draft, posted and void alike, names the correction after it. A correction
// that changes the customer is refused while a draft or posted memo names the
// original; a void memo does not hold the customer, and its link moves too.
func moveCreditMemoLinks(tx core.App, original, correction *core.Record) error {
	memos, err := tx.FindRecordsByFilter("books_credit_memos", "invoice = {:invoice}", "", 0, 0,
		dbx.Params{"invoice": original.Id})
	if err != nil {
		return fmt.Errorf("books: read the credit memos of the invoice: %w", err)
	}
	if correction.GetString("customer") != original.GetString("customer") {
		for _, memo := range memos {
			if memo.GetString("status") != statusVoid {
				return refuseField("customer", msgInvoiceCorrectionCreditMemos)
			}
		}
	}
	for _, memo := range memos {
		if err := saveMovingCreditMemoLink(tx, memo, correction.Id); err != nil {
			return err
		}
	}
	return nil
}

// saveMovingCreditMemoLink saves the memo's new invoice under the moving mark,
// so the memo's guard lets an invoice-only change of a posted or void memo
// through and skips the link check: the correction is not posted yet while
// its Replace step runs.
func saveMovingCreditMemoLink(tx core.App, memo *core.Record, invoiceID string) error {
	done := markMovingCreditMemoLink(tx, memo.Id)
	defer done()
	memo.Set("invoice", invoiceID)
	if err := tx.Save(memo); err != nil {
		return fmt.Errorf("books: move the credit memo's invoice link: %w", err)
	}
	return nil
}

// movingCreditMemoLink is the mark's name. It is built from the doc type, not
// docMark(creditMemoKind, …): creditMemoKind's header guard reads the mark, so
// naming the kind here would be an initialization cycle.
const movingCreditMemoLink = docTypeCreditMemo + ".moving-link"

// markMovingCreditMemoLink marks the credit memo whose invoice link an invoice
// correction moves; the returned func clears the mark, which belongs to the
// posting transaction (txmarks.go).
func markMovingCreditMemoLink(tx core.App, memoID string) func() {
	return setTxMark(tx, movingCreditMemoLink, memoID)
}

func isMovingCreditMemoLink(tx core.App, memoID string) bool {
	return hasTxMark(tx, movingCreditMemoLink, memoID)
}
