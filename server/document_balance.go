package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A document's balance is its open amount (receive payment spec §4.1, §4.3;
// pay-bills spec §4.3; vendor credit spec §4, Q20): a posted document's total
// less what its payers apply to it, 0 on a draft or a void document. Every
// write of a document's balance goes through this file, for each kind in
// balanceKinds, so later units that lower a balance (an applied credit, a
// refund, a write-off) add a payer and reuse it: posting writes total less
// what is already applied (setPostedDocumentBalance, from postSalesDoc), a
// payment's post subtracts its lines (applyToDocuments), its void and its
// correction add them back (releaseLines), a credit application's create and
// delete move both documents' balances (vendor_credit_applications.go), a
// document's void and its replacement write 0 (clearDocumentBalance, from
// voidSalesDoc and voidReplacedSalesDoc), and the ledger rebuild recomputes
// every document from its payers' rows (rebuildDocumentBalances).

// balancePayer is one thing that lowers a document's balance. A payer with a
// PaymentCollection is a payment's lines: only a posted payment's lines count.
// A payer without one is an application: every row counts, and its cash-basis
// payment reads the entry of the document EntryField names (in EntryCollection).
type balancePayer struct {
	LinesCollection, LineField      string
	PaymentCollection, PaymentField string
	EntryField, EntryCollection     string
	CashMemo                        string // "" = the deferral's PaidMemo
}

// balanceKind is one kind of document with an open balance: its collection,
// the payers that lower it, and its lowercase noun.
type balanceKind struct {
	Collection string
	Payers     []balancePayer
	Noun       string
}

var (
	// invoiceBalanceKind: a received payment's applications pay invoices.
	invoiceBalanceKind = balanceKind{
		Collection: "books_invoices",
		Payers: []balancePayer{{
			LinesCollection:   applicationsCollection,
			LineField:         "invoice",
			PaymentCollection: paymentsCollection,
			PaymentField:      "payment",
		}},
		Noun: "invoice",
	}
	// billBalanceKind: a bill payment's lines pay bills, and a vendor credit
	// applied to a bill lowers it as a payment does, at the apply date.
	billBalanceKind = balanceKind{
		Collection: "books_bills",
		Payers: []balancePayer{
			{
				LinesCollection:   billPaymentLinesCollection,
				LineField:         "bill",
				PaymentCollection: billPaymentsCollection,
				PaymentField:      "payment",
			},
			{
				LinesCollection: vendorCreditApplicationsCollection,
				LineField:       "bill",
				EntryField:      "vendor_credit",
				EntryCollection: vendorCreditsCollection,
				CashMemo:        "Bill %s paid by vendor credit (cash basis)",
			},
		},
		Noun: "bill",
	}
	// creditMemoBalanceKind: the credit not yet applied. Nothing applies a
	// credit memo yet, so it has no payer, and its balance is its total while
	// it is posted.
	creditMemoBalanceKind = balanceKind{
		Collection: "books_credit_memos",
		Noun:       "credit memo",
	}
	// vendorCreditBalanceKind: the vendor credit not yet applied to bills.
	// Each application lowers it.
	vendorCreditBalanceKind = balanceKind{
		Collection: vendorCreditsCollection,
		Payers: []balancePayer{{
			LinesCollection: vendorCreditApplicationsCollection,
			LineField:       "vendor_credit",
			EntryField:      "vendor_credit",
			EntryCollection: vendorCreditsCollection,
		}},
		Noun: "vendor credit",
	}
	// balanceKinds are verified and rebuilt by the ledger rebuild.
	balanceKinds = []balanceKind{invoiceBalanceKind, billBalanceKind, creditMemoBalanceKind, vendorCreditBalanceKind}
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

// paymentPayer is the kind's payer whose rows are a payment's lines, and false
// for a kind that no payment pays (a credit memo, a vendor credit). The
// per-payment functions (paymentLines, applyToDocuments, releaseLines,
// markMovingLines, rebuildPaidCashBasis) read it.
func (k balanceKind) paymentPayer() (balancePayer, bool) {
	for _, p := range k.Payers {
		if p.PaymentCollection != "" {
			return p, true
		}
	}
	return balancePayer{}, false
}

// markMovingLines marks the payment whose lines a document correction moves
// to itself (moveLinesWhere), so the payment line guard lets their document change
// while the payment is posted.
func markMovingLines(tx core.App, kind balanceKind, paymentID string) func() {
	p, _ := kind.paymentPayer()
	return setTxMark(tx, p.PaymentCollection+".moving", paymentID)
}

func isMovingLines(tx core.App, kind balanceKind, paymentID string) bool {
	p, _ := kind.paymentPayer()
	return hasTxMark(tx, p.PaymentCollection+".moving", paymentID)
}

// markMovingApplications marks the document whose applications a correction
// moves to itself (moveLinesWhere), so the application guard lets their bill or
// vendor credit change, which it refuses otherwise.
func markMovingApplications(tx core.App, docID string) func() {
	return setTxMark(tx, "applications.moving", docID)
}

func isMovingApplications(tx core.App, docID string) bool {
	return hasTxMark(tx, "applications.moving", docID)
}

// appliedSQL is the SQL sum of the payer's rows that name the document docExpr
// (a bound parameter or a column): every row of an application, only the lines
// of posted payments for a payment, whose draft lines do not count and whose
// void lines were released. The table and column names are the constants of
// balanceKinds.
func (p balancePayer) appliedSQL(docExpr string) string {
	if p.PaymentCollection == "" {
		return `(SELECT COALESCE(SUM(a.amount), 0) FROM ` + p.LinesCollection + ` a
			WHERE a.` + p.LineField + ` = ` + docExpr + `)`
	}
	return `(SELECT COALESCE(SUM(a.amount), 0) FROM ` + p.LinesCollection + ` a
		JOIN ` + p.PaymentCollection + ` p ON p.id = a.` + p.PaymentField + `
		WHERE a.` + p.LineField + ` = ` + docExpr + ` AND p.status = 'posted')`
}

// appliedByPayer is the sum of the payer's rows that count for the document.
func appliedByPayer(tx core.App, kind balanceKind, payer balancePayer, docID string) (int64, error) {
	var row struct {
		Applied int64 `db:"applied"`
	}
	err := tx.DB().NewQuery(`SELECT CAST(` + payer.appliedSQL("{:doc}") + ` AS INTEGER) AS applied`).
		Bind(dbx.Params{"doc": docID}).One(&row)
	if err != nil {
		return 0, fmt.Errorf("books: sum the %s rows applied to %s %s: %w", payer.LinesCollection, kind.Noun, docID, err)
	}
	return row.Applied, nil
}

// postedAppliedTo is the sum, over every payer of the kind, of the rows that
// count for the document (appliedSQL). A kind with no payer has nothing
// applied: 0.
func postedAppliedTo(tx core.App, kind balanceKind, docID string) (int64, error) {
	var applied int64
	for _, p := range kind.Payers {
		n, err := appliedByPayer(tx, kind, p, docID)
		if err != nil {
			return 0, err
		}
		applied += n
	}
	return applied, nil
}

// documentBalance recomputes a document's open amount from the source: a
// posted document's total less what its payers apply, 0 for a draft or a
// void document.
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
// transaction): its total less what its payers already apply, which for a
// correction is what it took over from its original.
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
// saves. No payer applies to it then: a void is refused while one does, and a
// correction has moved the rows to itself.
func clearDocumentBalance(doc *core.Record) {
	doc.Set("balance", 0)
}

// paymentLines reads a payment's lines in their order.
func paymentLines(tx core.App, kind balanceKind, paymentID string) ([]*core.Record, error) {
	p, ok := kind.paymentPayer()
	if !ok {
		return nil, fmt.Errorf("books: no payment pays a %s", kind.Noun)
	}
	lines, err := tx.FindRecordsByFilter(p.LinesCollection, p.PaymentField+" = {:payment}", "position,id", 0, 0,
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
	p, _ := kind.paymentPayer()
	for _, l := range lines {
		doc, err := tx.FindRecordById(kind.Collection, l.GetString(p.LineField))
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

// moveUnvoidedLines hands every payer row that names the original document to
// its correction, inside the correction's posting transaction, except the
// lines of a void payment: those stay on the original, so a void payment never
// names a document it did not pay (another party's, after a correction that
// changes the party). The live payments keep paying the same sale or purchase
// under its new record. The payment line guard lets the document change
// through while the payment is marked moving.
func moveUnvoidedLines(tx core.App, kind balanceKind, original, correction *core.Record) error {
	return moveLinesWhere(tx, kind, original, correction, ".status != 'void'")
}

// movePostedLines moves the lines of posted payments and every application:
// the lines of a void payment stay on the original document.
func movePostedLines(tx core.App, kind balanceKind, original, correction *core.Record) error {
	return moveLinesWhere(tx, kind, original, correction, ".status = 'posted'")
}

// moveLinesWhere moves, for each payer, the rows that name the original: of a
// payment payer the lines whose payment matches paymentStatus (a filter on
// the payment's status, such as ".status = 'posted'"), each under its
// payment's moving mark; of an application payer every row, under the
// original's moving mark. Then it rebuilds the cash-basis rows of both
// documents: the moved rows' shares now come from the correction's lines.
func moveLinesWhere(tx core.App, kind balanceKind, original, correction *core.Record, paymentStatus string) error {
	for _, p := range kind.Payers {
		filter := p.LineField + " = {:doc}"
		if p.PaymentCollection != "" {
			filter += " && " + p.PaymentField + paymentStatus
		}
		rows, err := tx.FindRecordsByFilter(p.LinesCollection, filter, "id", 0, 0, dbx.Params{"doc": original.Id})
		if err != nil {
			return fmt.Errorf("books: read the %s rows of %s %s: %w", p.LinesCollection, kind.Noun, original.Id, err)
		}
		for _, r := range rows {
			var done func()
			if p.PaymentCollection != "" {
				done = markMovingLines(tx, kind, r.GetString(p.PaymentField))
			} else {
				done = markMovingApplications(tx, original.Id)
			}
			r.Set(p.LineField, correction.Id)
			err := tx.Save(r)
			done()
			if err != nil {
				return fmt.Errorf("books: move a %s row to the correction: %w", p.LinesCollection, err)
			}
		}
	}
	return rebuildCashBasisOf(tx, kind.Collection, original.Id, correction.Id)
}

// DocumentBalanceDrift is one document whose stored balance disagrees with its
// total and what its payers apply.
type DocumentBalanceDrift struct {
	Kind     string `db:"kind" json:"kind"`
	Document string `db:"document" json:"document"`
	Number   string `db:"number" json:"number"`
	Stored   int64  `db:"stored" json:"stored"`
	Want     int64  `db:"want" json:"want"`
}

// verifyDocumentBalances is the verify part of the document balances: it
// recomputes every document's balance as documentBalance does, for each kind,
// from the same per-payer sums (appliedSQL), and reports each stored one that
// differs. A kind with no payer has 0 applied.
func verifyDocumentBalances(app core.App) ([]DocumentBalanceDrift, error) {
	drifts := []DocumentBalanceDrift{}
	for _, kind := range balanceKinds {
		applied := "0"
		for _, p := range kind.Payers {
			applied += " + " + p.appliedSQL("d.id")
		}
		found := []DocumentBalanceDrift{}
		err := app.DB().NewQuery(`
			SELECT {:kind} AS kind, document, number, stored, want FROM (
				SELECT d.id AS document, d.number AS number,
				       CAST(COALESCE(d.balance, 0) AS INTEGER) AS stored,
				       CASE WHEN d.status = 'posted' THEN CAST(d.total AS INTEGER) - CAST(COALESCE(` + applied + `, 0) AS INTEGER)
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
