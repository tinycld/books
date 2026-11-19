package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// refundLinkFields are the fields a source correction's link move changes on a
// refund receipt: one of them, the source the correction replaces.
var refundLinkFields = map[string]bool{"sales_receipt": true, "credit_memo": true}

// moveRefundSalesReceiptLinks is the sales receipt's Replace step (refund
// receipt spec Q13): every refund receipt that names the original, draft,
// posted and void alike, names the correction after it. A correction that
// changes the customer is refused while a draft or posted refund names the
// original; a void refund does not hold the customer, and its link moves too.
func moveRefundSalesReceiptLinks(tx core.App, original, correction *core.Record) error {
	refunds, err := refundsNaming(tx, "sales_receipt", original.Id)
	if err != nil {
		return err
	}
	if correction.GetString("customer") != original.GetString("customer") {
		for _, refund := range refunds {
			if refund.GetString("status") != statusVoid {
				return refuseField("customer", msgSalesReceiptCorrectionRefunds)
			}
		}
	}
	return saveMovingRefundLinks(tx, refunds, "sales_receipt", correction.Id)
}

// moveRefundCreditMemoLinks is the link part of the credit memo's Replace
// step: every refund receipt that names the original, draft, posted and void
// alike, names the correction after it. It refuses nothing: replaceCreditMemo
// checks the customer, the total and the date before it runs.
func moveRefundCreditMemoLinks(tx core.App, original, correction *core.Record) error {
	refunds, err := refundsNaming(tx, "credit_memo", original.Id)
	if err != nil {
		return err
	}
	return saveMovingRefundLinks(tx, refunds, "credit_memo", correction.Id)
}

// refundsNaming reads the refund receipts whose field names the source id.
func refundsNaming(tx core.App, field, sourceID string) ([]*core.Record, error) {
	refunds, err := tx.FindRecordsByFilter("books_refund_receipts", field+" = {:source}", "id", 0, 0,
		dbx.Params{"source": sourceID})
	if err != nil {
		return nil, fmt.Errorf("books: read the refund receipts of %s %s: %w", field, sourceID, err)
	}
	return refunds, nil
}

// saveMovingRefundLinks saves each refund's new source under the moving mark,
// so the refund's guard lets a link-only change of a posted or void refund
// through and skips the link check (checkRefundReceiptLinks): the correction
// is not posted yet while its Replace step runs.
func saveMovingRefundLinks(tx core.App, refunds []*core.Record, field, sourceID string) error {
	for _, refund := range refunds {
		done := markMovingRefundLink(tx, refund.Id)
		refund.Set(field, sourceID)
		err := tx.Save(refund)
		done()
		if err != nil {
			return fmt.Errorf("books: move the refund receipt's %s link: %w", field, err)
		}
	}
	return nil
}

// movingRefundLink is the mark's name. It is built from the doc type, not
// docMark(refundReceiptKind, …): refundReceiptKind's header guard reads the
// mark, so naming the kind here would be an initialization cycle.
const movingRefundLink = docTypeRefundReceipt + ".moving-link"

// markMovingRefundLink marks the refund receipt whose source link a source
// correction moves; the returned func clears the mark, which belongs to the
// posting transaction (txmarks.go).
func markMovingRefundLink(tx core.App, refundID string) func() {
	return setTxMark(tx, movingRefundLink, refundID)
}

func isMovingRefundLink(tx core.App, refundID string) bool {
	return hasTxMark(tx, movingRefundLink, refundID)
}
