package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A document's balance is its open amount (receive payment spec §4.1, §4.3;
// pay-bills spec §4.3): a posted document's total less the lines of posted
// payments that pay it, 0 on a draft or a void document. Every write of a
// document's balance goes through this file, for each kind in balanceKinds,
// so later units that lower a balance (a credit memo, an applied credit, a
// write-off) reuse it: posting writes total less what is already paid
// (setPostedDocumentBalance, from postSalesDoc), a payment's post subtracts its
// lines (applyToDocuments), its void and its correction add them back
// (releaseLines), a document's void and its replacement write 0
// (clearDocumentBalance, from voidSalesDoc and voidReplacedSalesDoc), and the
// ledger rebuild recomputes every document from its payments' lines
// (rebuildDocumentBalances).

// balanceKind is one kind of document with an open balance: its collection,
// the payment lines that pay it (LinesCollection, whose LineField names the
// document and whose PaymentField names the payment), the payments
// (PaymentCollection, status posted or void or draft), and its lowercase noun.
type balanceKind struct {
	Collection        string
	LinesCollection   string
	LineField         string
	PaymentCollection string
	PaymentField      string
	Noun              string
}

var (
	// invoiceBalanceKind: a received payment's applications pay invoices.
	invoiceBalanceKind = balanceKind{
		Collection:        "books_invoices",
		LinesCollection:   applicationsCollection,
		LineField:         "invoice",
		PaymentCollection: paymentsCollection,
		PaymentField:      "payment",
		Noun:              "invoice",
	}
	// billBalanceKind: a bill payment's lines pay bills.
	billBalanceKind = balanceKind{
		Collection:        "books_bills",
		LinesCollection:   billPaymentLinesCollection,
		LineField:         "bill",
		PaymentCollection: billPaymentsCollection,
		PaymentField:      "payment",
		Noun:              "bill",
	}
	// balanceKinds are verified and rebuilt by the ledger rebuild.
	balanceKinds = []balanceKind{invoiceBalanceKind, billBalanceKind}
)

// balanceKindOf is the balance kind of a document collection, and false for a
// collection that has no balance.
func balanceKindOf(collection string) (balanceKind, bool) {
	for _, k := range balanceKinds {
		if k.Collection == collection {
			return k, true
		}
	}
	return balanceKind{}, false
}

// markBalancing marks the document whose balance Books is writing, so the
// document guard lets a balance-only change of a posted (or void) document
// through; the returned func clears the mark, which belongs to the
// transaction (txmarks.go).
func markBalancing(tx core.App, kind balanceKind, docID string) func() {
	return setTxMark(tx, kind.Noun+".balancing", docID)
}

func isBalancing(tx core.App, kind balanceKind, docID string) bool {
	return hasTxMark(tx, kind.Noun+".balancing", docID)
}

// markMovingLines marks the payment whose lines a document correction moves
// to itself (moveLines), so the payment line guard lets their document change
// while the payment is posted.
func markMovingLines(tx core.App, kind balanceKind, paymentID string) func() {
	return setTxMark(tx, kind.PaymentCollection+".moving", paymentID)
}

func isMovingLines(tx core.App, kind balanceKind, paymentID string) bool {
	return hasTxMark(tx, kind.PaymentCollection+".moving", paymentID)
}

// postedAppliedTo is the sum of the lines of posted payments that name the
// document. A draft payment's lines do not count, and a void payment's were
// released. The table and column names are the constants of balanceKinds.
func postedAppliedTo(tx core.App, kind balanceKind, docID string) (int64, error) {
	var row struct {
		Applied int64 `db:"applied"`
	}
	err := tx.DB().NewQuery(`
		SELECT CAST(COALESCE(SUM(a.amount), 0) AS INTEGER) AS applied
		FROM ` + kind.LinesCollection + ` a
		JOIN ` + kind.PaymentCollection + ` p ON p.id = a.` + kind.PaymentField + `
		WHERE a.` + kind.LineField + ` = {:doc} AND p.status = 'posted'`).
		Bind(dbx.Params{"doc": docID}).One(&row)
	if err != nil {
		return 0, fmt.Errorf("books: sum the payments applied to %s %s: %w", kind.Noun, docID, err)
	}
	return row.Applied, nil
}

// documentBalance recomputes a document's open amount from the source: a
// posted document's total less the lines of posted payments, 0 for a draft or
// a void document.
func documentBalance(tx core.App, kind balanceKind, docID string) (int64, error) {
	doc, err := tx.FindRecordById(kind.Collection, docID)
	if err != nil {
		return 0, fmt.Errorf("books: read %s %s: %w", kind.Noun, docID, err)
	}
	if doc.GetString("status") != statusPosted {
		return 0, nil
	}
	applied, err := postedAppliedTo(tx, kind, docID)
	if err != nil {
		return 0, err
	}
	return int64(doc.GetInt("total")) - applied, nil
}

// saveDocumentBalance writes balance to the document under the balancing
// mark. A balance below 0 or above the total is a drift Books never writes:
// it is refused as an error, and the ledger rebuild repairs the stored
// balances.
func saveDocumentBalance(tx core.App, kind balanceKind, doc *core.Record, balance int64) error {
	if balance < 0 || balance > int64(doc.GetInt("total")) {
		return fmt.Errorf("books: %s %s balance %d is outside 0..%d; rebuild the balances",
			kind.Noun, doc.Id, balance, doc.GetInt("total"))
	}
	if int64(doc.GetInt("balance")) == balance {
		return nil
	}
	defer markBalancing(tx, kind, doc.Id)()
	doc.Set("balance", balance)
	if err := tx.Save(doc); err != nil {
		return fmt.Errorf("books: save the balance of %s %s: %w", kind.Noun, doc.Id, err)
	}
	return nil
}

// setPostedDocumentBalance sets the balance of a document that moves to
// posted on the record its caller saves (postSalesDoc, inside the update's
// transaction): its total less the posted payments that already pay it, which
// for a correction are the ones it took over from its original.
func setPostedDocumentBalance(tx core.App, kind balanceKind, doc *core.Record, total int64) error {
	applied, err := postedAppliedTo(tx, kind, doc.Id)
	if err != nil {
		return err
	}
	doc.Set("balance", total-applied)
	return nil
}

// clearDocumentBalance sets the balance of a document that becomes void (its
// own void, or its replacement by a correction) to 0 on the record its caller
// saves. No posted payment pays it then: a void is refused while one does,
// and a correction has moved the lines to itself.
func clearDocumentBalance(doc *core.Record) {
	doc.Set("balance", 0)
}

// paymentLines reads a payment's lines in their order.
func paymentLines(tx core.App, kind balanceKind, paymentID string) ([]*core.Record, error) {
	lines, err := tx.FindRecordsByFilter(kind.LinesCollection, kind.PaymentField+" = {:payment}", "position,id", 0, 0,
		dbx.Params{"payment": paymentID})
	if err != nil {
		return nil, fmt.Errorf("books: read the payment's lines: %w", err)
	}
	return lines, nil
}

// applyToDocuments subtracts each line of the payment from its document's
// stored balance. It runs while the payment posts, so the stored balances do
// not hold it yet.
func applyToDocuments(tx core.App, kind balanceKind, paymentID string) error {
	return shiftDocumentBalances(tx, kind, paymentID, -1)
}

// releaseLines adds each line of the payment back to its document's stored
// balance. It runs while a posted payment is voided or replaced by its
// correction, before the payment leaves posted.
func releaseLines(tx core.App, kind balanceKind, paymentID string) error {
	return shiftDocumentBalances(tx, kind, paymentID, 1)
}

func shiftDocumentBalances(tx core.App, kind balanceKind, paymentID string, sign int64) error {
	lines, err := paymentLines(tx, kind, paymentID)
	if err != nil {
		return err
	}
	for _, l := range lines {
		doc, err := tx.FindRecordById(kind.Collection, l.GetString(kind.LineField))
		if err != nil {
			return fmt.Errorf("books: read the %s of a payment line: %w", kind.Noun, err)
		}
		balance := int64(doc.GetInt("balance")) + sign*int64(l.GetInt("amount"))
		if err := saveDocumentBalance(tx, kind, doc, balance); err != nil {
			return err
		}
	}
	return nil
}

// moveLines hands every payment line that names the original document to its
// correction, inside the correction's posting transaction: the payments keep
// paying the same sale or purchase under its new record. The payment line
// guard lets the document change through while the payment is marked moving.
func moveLines(tx core.App, kind balanceKind, original, correction *core.Record) error {
	return moveLinesWhere(tx, kind, original, correction, "")
}

// movePostedLines is moveLines for the lines of posted payments only: the
// lines of a void payment stay on the original document.
func movePostedLines(tx core.App, kind balanceKind, original, correction *core.Record) error {
	return moveLinesWhere(tx, kind, original, correction, " && "+kind.PaymentField+".status = 'posted'")
}

// moveLinesWhere moves the payment lines that name the original and match the
// extra filter, which is empty or starts with " && ".
func moveLinesWhere(tx core.App, kind balanceKind, original, correction *core.Record, extra string) error {
	lines, err := tx.FindRecordsByFilter(kind.LinesCollection, kind.LineField+" = {:doc}"+extra, "id", 0, 0,
		dbx.Params{"doc": original.Id})
	if err != nil {
		return fmt.Errorf("books: read the payment lines of %s %s: %w", kind.Noun, original.Id, err)
	}
	for _, l := range lines {
		done := markMovingLines(tx, kind, l.GetString(kind.PaymentField))
		l.Set(kind.LineField, correction.Id)
		err := tx.Save(l)
		done()
		if err != nil {
			return fmt.Errorf("books: move a payment line to the correction: %w", err)
		}
	}
	return nil
}

// DocumentBalanceDrift is one document whose stored balance disagrees with its
// total and the lines of posted payments.
type DocumentBalanceDrift struct {
	Kind     string `db:"kind" json:"kind"`
	Document string `db:"document" json:"document"`
	Number   string `db:"number" json:"number"`
	Stored   int64  `db:"stored" json:"stored"`
	Want     int64  `db:"want" json:"want"`
}

// verifyDocumentBalances is the verify part of the document balances: it
// recomputes every document's balance as documentBalance does, for each kind,
// and reports each stored one that differs.
func verifyDocumentBalances(app core.App) ([]DocumentBalanceDrift, error) {
	drifts := []DocumentBalanceDrift{}
	for _, kind := range balanceKinds {
		found := []DocumentBalanceDrift{}
		err := app.DB().NewQuery(`
			SELECT {:kind} AS kind, document, number, stored, want FROM (
				SELECT d.id AS document, d.number AS number,
				       CAST(COALESCE(d.balance, 0) AS INTEGER) AS stored,
				       CASE WHEN d.status = 'posted' THEN CAST(d.total AS INTEGER) - CAST(COALESCE((
				           SELECT SUM(a.amount) FROM ` + kind.LinesCollection + ` a
				           JOIN ` + kind.PaymentCollection + ` p ON p.id = a.` + kind.PaymentField + `
				           WHERE a.` + kind.LineField + ` = d.id AND p.status = 'posted'), 0) AS INTEGER)
				       ELSE 0 END AS want
				FROM ` + kind.Collection + ` d)
			WHERE stored != want
			ORDER BY document`).Bind(dbx.Params{"kind": kind.Noun}).All(&found)
		if err != nil {
			return nil, fmt.Errorf("books: compare the %s balances with their payments: %w", kind.Noun, err)
		}
		drifts = append(drifts, found...)
	}
	return drifts, nil
}

// rebuildDocumentBalances writes the recomputed balance of every document that
// drifted, in one transaction, and returns how many it fixed.
func rebuildDocumentBalances(app core.App) (int, error) {
	fixed := 0
	err := app.RunInTransaction(func(tx core.App) error {
		drifts, err := verifyDocumentBalances(tx)
		if err != nil {
			return err
		}
		for _, d := range drifts {
			kind, ok := balanceKindNamed(d.Kind)
			if !ok {
				return fmt.Errorf("books: no balance kind %q", d.Kind)
			}
			doc, err := tx.FindRecordById(kind.Collection, d.Document)
			if err != nil {
				return fmt.Errorf("books: read %s %s to rebuild its balance: %w", kind.Noun, d.Document, err)
			}
			if err := saveDocumentBalance(tx, kind, doc, d.Want); err != nil {
				return err
			}
		}
		fixed = len(drifts)
		return nil
	})
	return fixed, err
}

// balanceKindNamed is the balance kind of a noun, as a drift names it.
func balanceKindNamed(noun string) (balanceKind, bool) {
	for _, k := range balanceKinds {
		if k.Noun == noun {
			return k, true
		}
	}
	return balanceKind{}, false
}
