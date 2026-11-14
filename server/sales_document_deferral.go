package books

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// A batch that writes many lines of one document restates the document one
// time, not after each line. In a batch, operation N+1 runs inside operation
// N's request hook e.Next(), in one transaction. So the request hook of the
// first line write of a document runs its code after e.Next() when every later
// operation is done and nothing is committed. That hook owns the document's
// restatement: it marks the document deferring, each line guard then checks
// its own line only and marks the document dirty, and the owner settles the
// document after e.Next(). A header write in the transaction settles first
// (validateSalesDoc), because a post reads the line amounts.
//
// A request that is not in a transaction (one REST write) and a write with no
// request (Go) set no mark: the line guard reads the lines and the document is
// restated with the write, as before.

func markDeferring(tx core.App, kind salesDocKind, docID string) (func(), bool) {
	if tx.TxInfo() == nil || docID == "" || isDeferring(tx, kind, docID) {
		return func() {}, false
	}
	return setTxMark(tx, docMark(kind, "deferring"), docID), true
}

func isDeferring(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "deferring"), docID)
}

// The dirty mark has no clearing func to keep: settleSalesDoc clears it, and
// the owner's defer clears it on every path.
func markDirty(tx core.App, kind salesDocKind, docID string) {
	setTxMark(tx, docMark(kind, "dirty"), docID)
}

func isDirty(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "dirty"), docID)
}

func clearDirty(tx core.App, kind salesDocKind, docID string) {
	clearTxMark(tx, docMark(kind, "dirty"), docID)
}

// settleSalesDoc restates a document that a deferred line write left dirty. A
// document that is gone (the batch deleted it after its lines) or no longer
// editable (the batch posted it; the post settled it first) needs nothing.
func settleSalesDoc(tx core.App, kind salesDocKind, docID string) error {
	if !isDirty(tx, kind, docID) {
		return nil
	}
	clearDirty(tx, kind, docID)
	doc, err := tx.FindRecordById(kind.Collection, docID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !kind.isEditableStatus(doc.GetString("status")) {
		return nil
	}
	_, err = restateSalesDoc(tx, kind, docID)
	return err
}

// bindSalesDocDeferral binds the request hooks that own a document's
// restatement. The document id of a create and an update is on the record; a
// delete's record is the stored line.
func bindSalesDocDeferral(app core.App, kind salesDocKind) {
	own := func(e *core.RecordRequestEvent) error {
		docID := e.Record.GetString(kind.ParentField)
		clear, ok := markDeferring(e.App, kind, docID)
		if !ok {
			return e.Next()
		}
		defer clearDirty(e.App, kind, docID)
		defer clear()
		if err := e.Next(); err != nil {
			return err
		}
		return settleSalesDoc(e.App, kind, docID)
	}
	app.OnRecordCreateRequest(kind.LinesCollection).BindFunc(own)
	app.OnRecordUpdateRequest(kind.LinesCollection).BindFunc(own)
	app.OnRecordDeleteRequest(kind.LinesCollection).BindFunc(own)
}
