package books

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// documentSendsCollection holds one row for each email Books sends of a sales
// document (email-share spec §4.2, pb-migrations/2100000034). Only the send
// route writes a row, as the app; the collection has no write rule.
const documentSendsCollection = "books_document_sends"

// invoicePublicCollection is the view of a posted or void invoice for the
// holder of its customer link (spec §4.3, pb-migrations/2100000034).
const invoicePublicCollection = "books_invoice_public"

// sendDocTypes are the doc types a send names, the five sales document kinds
// that have a PDF and an email: the values of the collection's doc_type.
var sendDocTypes = map[string]bool{
	docTypeInvoice: true, docTypeEstimate: true, docTypeSalesReceipt: true,
	docTypeCreditMemo: true, docTypeRefundReceipt: true,
}

// documentSendLabel names a send by the document it sent: "Invoice 1004".
func documentSendLabel(r *core.Record) string {
	noun, _, _ := entryNouns(r.GetString("doc_type"))
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return noun
}

// deleteDocumentSends deletes the sends of one document, inside the
// document's delete transaction: a send names its document by id only, so no
// relation cascade takes it. A kind that is not sent has none.
func deleteDocumentSends(tx core.App, docType, documentID string) error {
	if !sendDocTypes[docType] {
		return nil
	}
	sends, err := tx.FindRecordsByFilter(documentSendsCollection, "doc_type = {:t} && document = {:d}", "", 0, 0,
		dbx.Params{"t": docType, "d": documentID})
	if err != nil {
		return err
	}
	for _, send := range sends {
		if err := tx.Delete(send); err != nil {
			return err
		}
	}
	return nil
}
