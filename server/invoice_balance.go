package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// An invoice's balance is its open amount (receive payment spec §4.1, §4.3):
// a posted invoice's total less the applications of posted payments, 0 on a
// draft or a void invoice. Every write of books_invoices.balance goes through
// this file, so later units that lower a balance (a credit memo, an applied
// credit, a write-off) reuse it: invoice posting writes total less what is
// already applied (setPostedInvoiceBalance, from postSalesDoc), a payment's
// post subtracts its applications (applyToInvoices), its void and its
// correction add them back (releaseApplications), an invoice's void and its
// replacement write 0 (clearInvoiceBalance, from voidSalesDoc and
// voidReplacedSalesDoc), and the ledger rebuild recomputes every invoice from
// its applications (rebuildInvoiceBalances).

// markBalancing marks the invoice whose balance Books is writing, so the
// invoice guard lets a balance-only change of a posted (or void) invoice
// through; the returned func clears the mark, which belongs to the
// transaction (txmarks.go).
func markBalancing(tx core.App, invoiceID string) func() {
	return setTxMark(tx, "invoice.balancing", invoiceID)
}

func isBalancing(tx core.App, invoiceID string) bool {
	return hasTxMark(tx, "invoice.balancing", invoiceID)
}

// markMovingApplications marks the payment whose applications an invoice
// correction moves to itself (moveApplications), so the application guard lets
// their invoice change while the payment is posted.
func markMovingApplications(tx core.App, paymentID string) func() {
	return setTxMark(tx, "payment.moving", paymentID)
}

func isMovingApplications(tx core.App, paymentID string) bool {
	return hasTxMark(tx, "payment.moving", paymentID)
}

// postedAppliedTo is the sum of the applications of posted payments that name
// invoiceID. A draft payment's applications do not count, and a void payment's
// were released.
func postedAppliedTo(tx core.App, invoiceID string) (int64, error) {
	var row struct {
		Applied int64 `db:"applied"`
	}
	err := tx.DB().NewQuery(`
		SELECT CAST(COALESCE(SUM(a.amount), 0) AS INTEGER) AS applied
		FROM books_payment_applications a
		JOIN books_payments p ON p.id = a.payment
		WHERE a.invoice = {:invoice} AND p.status = 'posted'`).
		Bind(dbx.Params{"invoice": invoiceID}).One(&row)
	if err != nil {
		return 0, fmt.Errorf("books: sum the payments applied to invoice %s: %w", invoiceID, err)
	}
	return row.Applied, nil
}

// invoiceBalance recomputes an invoice's open amount from the source: a posted
// invoice's total less the applications of posted payments, 0 for a draft or
// a void invoice.
func invoiceBalance(tx core.App, invoiceID string) (int64, error) {
	inv, err := tx.FindRecordById("books_invoices", invoiceID)
	if err != nil {
		return 0, fmt.Errorf("books: read invoice %s: %w", invoiceID, err)
	}
	if inv.GetString("status") != statusPosted {
		return 0, nil
	}
	applied, err := postedAppliedTo(tx, invoiceID)
	if err != nil {
		return 0, err
	}
	return int64(inv.GetInt("total")) - applied, nil
}

// saveInvoiceBalance writes balance to the invoice under the balancing mark.
// A balance below 0 or above the total is a drift Books never writes: it is
// refused as an error, and the ledger rebuild repairs the stored balances.
func saveInvoiceBalance(tx core.App, invoice *core.Record, balance int64) error {
	if balance < 0 || balance > int64(invoice.GetInt("total")) {
		return fmt.Errorf("books: invoice %s balance %d is outside 0..%d; rebuild the balances",
			invoice.Id, balance, invoice.GetInt("total"))
	}
	if int64(invoice.GetInt("balance")) == balance {
		return nil
	}
	defer markBalancing(tx, invoice.Id)()
	invoice.Set("balance", balance)
	if err := tx.Save(invoice); err != nil {
		return fmt.Errorf("books: save the balance of invoice %s: %w", invoice.Id, err)
	}
	return nil
}

// setPostedInvoiceBalance sets the balance of an invoice that moves to posted
// on the record its caller saves (postSalesDoc, inside the update's
// transaction): its total less the posted payments that already apply to it,
// which for a correction are the ones it took over from its original.
func setPostedInvoiceBalance(tx core.App, invoice *core.Record, total int64) error {
	applied, err := postedAppliedTo(tx, invoice.Id)
	if err != nil {
		return err
	}
	invoice.Set("balance", total-applied)
	return nil
}

// clearInvoiceBalance sets the balance of an invoice that becomes void (its
// own void, or its replacement by a correction) to 0 on the record its caller
// saves. No posted payment applies to it then: a void is refused while one
// does, and a correction has moved them to itself.
func clearInvoiceBalance(invoice *core.Record) {
	invoice.Set("balance", 0)
}

// paymentApplications reads a payment's applications in their order.
func paymentApplications(tx core.App, paymentID string) ([]*core.Record, error) {
	apps, err := tx.FindRecordsByFilter("books_payment_applications", "payment = {:payment}", "position,id", 0, 0,
		dbx.Params{"payment": paymentID})
	if err != nil {
		return nil, fmt.Errorf("books: read the payment's applications: %w", err)
	}
	return apps, nil
}

// applyToInvoices subtracts each application of the payment from its
// invoice's stored balance. It runs while the payment moves from draft to
// posted, before the payment row is written, so the stored balances do not
// hold it yet.
func applyToInvoices(tx core.App, paymentID string) error {
	return shiftInvoiceBalances(tx, paymentID, -1)
}

// releaseApplications adds each application of the payment back to its
// invoice's stored balance. It runs while a posted payment is voided or
// replaced by its correction, before the payment leaves posted.
func releaseApplications(tx core.App, paymentID string) error {
	return shiftInvoiceBalances(tx, paymentID, 1)
}

func shiftInvoiceBalances(tx core.App, paymentID string, sign int64) error {
	apps, err := paymentApplications(tx, paymentID)
	if err != nil {
		return err
	}
	for _, a := range apps {
		inv, err := tx.FindRecordById("books_invoices", a.GetString("invoice"))
		if err != nil {
			return fmt.Errorf("books: read the invoice of a payment application: %w", err)
		}
		balance := int64(inv.GetInt("balance")) + sign*int64(a.GetInt("amount"))
		if err := saveInvoiceBalance(tx, inv, balance); err != nil {
			return err
		}
	}
	return nil
}

// moveApplications hands every application that names the original invoice to
// its correction, inside the correction's posting transaction: the payments
// keep paying the same sale under its new record. The application guard lets
// the invoice change through while the payment is marked moving.
func moveApplications(tx core.App, original, correction *core.Record) error {
	apps, err := tx.FindRecordsByFilter("books_payment_applications", "invoice = {:invoice}", "id", 0, 0,
		dbx.Params{"invoice": original.Id})
	if err != nil {
		return fmt.Errorf("books: read the applications of invoice %s: %w", original.Id, err)
	}
	for _, a := range apps {
		done := markMovingApplications(tx, a.GetString("payment"))
		a.Set("invoice", correction.Id)
		err := tx.Save(a)
		done()
		if err != nil {
			return fmt.Errorf("books: move a payment application to the correction: %w", err)
		}
	}
	return nil
}

// InvoiceBalanceDrift is one invoice whose stored balance disagrees with its
// total and the applications of posted payments.
type InvoiceBalanceDrift struct {
	Invoice string `db:"invoice" json:"invoice"`
	Number  string `db:"number" json:"number"`
	Stored  int64  `db:"stored" json:"stored"`
	Want    int64  `db:"want" json:"want"`
}

// verifyInvoiceBalances is the verify part of the invoice balances: it
// recomputes every invoice's balance as invoiceBalance does and reports each
// stored one that differs.
func verifyInvoiceBalances(app core.App) ([]InvoiceBalanceDrift, error) {
	drifts := []InvoiceBalanceDrift{}
	err := app.DB().NewQuery(`
		SELECT invoice, number, stored, want FROM (
			SELECT i.id AS invoice, i.number AS number,
			       CAST(COALESCE(i.balance, 0) AS INTEGER) AS stored,
			       CASE WHEN i.status = 'posted' THEN CAST(i.total AS INTEGER) - CAST(COALESCE((
			           SELECT SUM(a.amount) FROM books_payment_applications a
			           JOIN books_payments p ON p.id = a.payment
			           WHERE a.invoice = i.id AND p.status = 'posted'), 0) AS INTEGER)
			       ELSE 0 END AS want
			FROM books_invoices i)
		WHERE stored != want
		ORDER BY invoice`).All(&drifts)
	if err != nil {
		return nil, fmt.Errorf("books: compare the invoice balances with their payments: %w", err)
	}
	return drifts, nil
}

// rebuildInvoiceBalances writes the recomputed balance of every invoice that
// drifted, in one transaction, and returns how many it fixed.
func rebuildInvoiceBalances(app core.App) (int, error) {
	fixed := 0
	err := app.RunInTransaction(func(tx core.App) error {
		drifts, err := verifyInvoiceBalances(tx)
		if err != nil {
			return err
		}
		for _, d := range drifts {
			inv, err := tx.FindRecordById("books_invoices", d.Invoice)
			if err != nil {
				return fmt.Errorf("books: read invoice %s to rebuild its balance: %w", d.Invoice, err)
			}
			if err := saveInvoiceBalance(tx, inv, d.Want); err != nil {
				return err
			}
		}
		fixed = len(drifts)
		return nil
	})
	return fixed, err
}
