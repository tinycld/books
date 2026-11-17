package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The cash-basis tax rows (pay-bills spec §3.10, Q3). On the cash basis an
// invoice's sales tax counts when and as far as the invoice is paid, as its
// journal lines do (cash_basis.go); a credit memo's when it is applied or
// refunded (no write does that yet, so only its taken-out rows exist). Each
// row names its document in the kind's own relation (invoice, credit_memo)
// and in document, the one field the report source reads for both kinds.
// Its rows in books_cash_basis_tax_lines:
//
//   - taken out: each tax line posting wrote (writeTaxSnapshot) with its gross,
//     taxable and tax amounts negated, at the tax line's date;
//   - brought back: for each posted payment, in payment order (date, then
//     number), that payment's share of each tax line's three figures, figure ×
//     paid ÷ total, cumulative over the payments, by largest remainder over the
//     tax lines of each figure, at the payment's date. An invoice paid in full
//     brings back exactly its tax lines.
//
// Only a document whose own entry is posted has tax rows: a void or replaced
// invoice or credit memo has none, as the Sales Tax Liability leaves out its ledger tax
// lines. A sales receipt has no cash tax rows: it counts on its own date.
// The rows are rebuilt with the document's other cash-basis rows
// (syncCashRows); nothing else writes them.

const cashTaxLinesCollection = "books_cash_basis_tax_lines"

// cashTaxLine is one cash-basis tax row as Books derives it, and the key a
// stored row is matched by.
type cashTaxLine struct {
	Document, Rate, Component, Agency, Currency, Date, PaymentEntry string
	RatePpm, Gross, Taxable, Amount                                 int64
	Position                                                        int
}

// cashTaxSource is one tax line of a posted document.
type cashTaxSource struct {
	Rate     string `db:"rate"`
	Comp     string `db:"component"`
	Agency   string `db:"agency"`
	Currency string `db:"currency"`
	Date     string `db:"date"`
	RatePpm  int64  `db:"rate_ppm"`
	Gross    int64  `db:"gross_amount"`
	Taxable  int64  `db:"taxable_amount"`
	Amount   int64  `db:"amount"`
}

// figures are a tax line's gross, taxable and tax amounts.
func (s cashTaxSource) figures() [3]int64 { return [3]int64{s.Gross, s.Taxable, s.Amount} }

// documentTaxLines reads the document's tax lines in position order while
// its own entry is posted; a void or replaced document has none here. The
// entry is read rather than the document row: a void changes the entry
// before the document row is saved.
func documentTaxLines(tx core.App, d cashDeferral, docID string) ([]cashTaxSource, error) {
	var lines []cashTaxSource
	err := tx.DB().NewQuery(`
		SELECT t.rate AS rate, t.component AS component, t.agency AS agency, t.currency AS currency,
		       t.date AS date, CAST(t.rate_ppm AS INTEGER) AS rate_ppm,
		       CAST(t.gross_amount AS INTEGER) AS gross_amount,
		       CAST(t.taxable_amount AS INTEGER) AS taxable_amount,
		       CAST(t.amount AS INTEGER) AS amount
		FROM ` + d.TaxLines + ` t
		WHERE t.` + d.Kind + ` = {:doc} AND EXISTS (
			SELECT 1 FROM books_journal_entries e
			WHERE e.document = {:doc} AND e.doc_type = {:type}
			  AND e.origin = 'document' AND e.status = 'posted')
		ORDER BY t.position, t.id`).
		Bind(dbx.Params{"doc": docID, "type": d.DocType}).All(&lines)
	if err != nil {
		return nil, fmt.Errorf("books: read the tax lines of %s %s: %w", d.Kind, docID, err)
	}
	return lines, nil
}

// wantCashTaxRows derives the document's cash-basis tax rows from its tax
// lines and its posted payments.
func wantCashTaxRows(tx core.App, d cashDeferral, docID string) ([]cashTaxLine, error) {
	if d.TaxLines == "" {
		return nil, nil
	}
	lines, err := documentTaxLines(tx, d, docID)
	if err != nil || len(lines) == 0 {
		return nil, err
	}
	doc, err := tx.FindRecordById(d.Balance.Collection, docID)
	if err != nil {
		return nil, fmt.Errorf("books: read %s %s: %w", d.Kind, docID, err)
	}
	total := int64(doc.GetInt("total"))
	row := func(l cashTaxSource, date, paymentEntry string, figures [3]int64) cashTaxLine {
		return cashTaxLine{
			Document: docID, Rate: l.Rate, Component: l.Comp, Agency: l.Agency, Currency: l.Currency,
			Date: date, PaymentEntry: paymentEntry, RatePpm: l.RatePpm,
			Gross: figures[0], Taxable: figures[1], Amount: figures[2],
		}
	}
	rows := make([]cashTaxLine, 0, len(lines))
	for _, l := range lines {
		f := l.figures()
		rows = append(rows, row(l, l.Date, "", [3]int64{-f[0], -f[1], -f[2]}))
	}
	if total > 0 {
		shares, err := paymentTaxShares(tx, d, docID, lines, total, row)
		if err != nil {
			return nil, err
		}
		rows = append(rows, shares...)
	}
	for i := range rows {
		rows[i].Position = i
	}
	return rows, nil
}

// paymentTaxShares are the rows the document's posted payments bring back:
// for each figure, the tax lines' cumulative share of the amount paid so far,
// by largest remainder, less what the earlier payments brought back. A
// payment whose share of a tax line is zero in all three figures adds no row
// for it.
func paymentTaxShares(
	tx core.App, d cashDeferral, docID string, lines []cashTaxSource, total int64,
	row func(cashTaxSource, string, string, [3]int64) cashTaxLine,
) ([]cashTaxLine, error) {
	payments, err := documentPayments(tx, d, docID)
	if err != nil {
		return nil, err
	}
	var columns [3][]int64
	for m := range columns {
		columns[m] = make([]int64, len(lines))
		for i, l := range lines {
			columns[m][i] = l.figures()[m]
		}
	}
	var before [3][]int64
	for m := range before {
		before[m] = make([]int64, len(lines))
	}
	var rows []cashTaxLine
	var paid int64
	for _, p := range payments {
		paid += p.Amount
		var after [3][]int64
		for m := range after {
			after[m] = largestRemainder(columns[m], paid, total)
		}
		for i, l := range lines {
			var share [3]int64
			for m := range share {
				share[m] = after[m][i] - before[m][i]
			}
			if share != [3]int64{} {
				rows = append(rows, row(l, p.Date, p.Entry, share))
			}
		}
		before = after
	}
	return rows, nil
}

// cashTaxRowDiff compares the document's stored tax rows with the derived
// ones: the stored rows no derived row matches, and the derived rows no
// stored row matches. A kind with no tax lines has neither.
func cashTaxRowDiff(tx core.App, d cashDeferral, docID string) (stray []*core.Record, missing []cashTaxLine, err error) {
	if d.TaxLines == "" {
		return nil, nil, nil
	}
	want, err := wantCashTaxRows(tx, d, docID)
	if err != nil {
		return nil, nil, err
	}
	stored, err := tx.FindAllRecords(cashTaxLinesCollection, dbx.HashExp{d.Kind: docID})
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the cash-basis tax rows of %s %s: %w", d.Kind, docID, err)
	}
	unmatched := map[cashTaxLine]int{}
	for _, w := range want {
		unmatched[w]++
	}
	for _, r := range stored {
		k := storedCashTaxLine(r)
		if unmatched[k] > 0 {
			unmatched[k]--
			continue
		}
		stray = append(stray, r)
	}
	for _, w := range want {
		if unmatched[w] > 0 {
			unmatched[w]--
			missing = append(missing, w)
		}
	}
	return stray, missing, nil
}

// storedCashTaxLine is a stored tax row as a cashTaxLine.
func storedCashTaxLine(r *core.Record) cashTaxLine {
	return cashTaxLine{
		Document: r.GetString("document"), Rate: r.GetString("rate"), Component: r.GetString("component"), Agency: r.GetString("agency"),
		Currency: r.GetString("currency"), Date: r.GetString("date"), PaymentEntry: r.GetString("payment_entry"),
		RatePpm: int64(r.GetInt("rate_ppm")), Gross: int64(r.GetInt("gross_amount")),
		Taxable: int64(r.GetInt("taxable_amount")), Amount: int64(r.GetInt("amount")),
		Position: r.GetInt("position"),
	}
}

// syncCashTaxRows makes the document's stored tax rows equal the derived
// ones, touching only the rows that differ, and returns how many rows it
// deleted and wrote.
func syncCashTaxRows(tx core.App, d cashDeferral, docID string) (int, error) {
	stray, missing, err := cashTaxRowDiff(tx, d, docID)
	if err != nil {
		return 0, err
	}
	for _, r := range stray {
		if err := tx.Delete(r); err != nil {
			return 0, fmt.Errorf("books: delete a cash-basis tax row of %s %s: %w", d.Kind, docID, err)
		}
	}
	if len(missing) == 0 {
		return len(stray), nil
	}
	col, err := tx.FindCachedCollectionByNameOrId(cashTaxLinesCollection)
	if err != nil {
		return 0, err
	}
	for _, w := range missing {
		r := core.NewRecord(col)
		r.Set(d.Kind, docID)
		r.Set("document", w.Document)
		r.Set("rate", w.Rate)
		r.Set("component", w.Component)
		r.Set("agency", w.Agency)
		r.Set("rate_ppm", w.RatePpm)
		r.Set("gross_amount", w.Gross)
		r.Set("taxable_amount", w.Taxable)
		r.Set("amount", w.Amount)
		r.Set("currency", w.Currency)
		r.Set("date", w.Date)
		r.Set("payment_entry", w.PaymentEntry)
		r.Set("position", w.Position)
		if err := tx.Save(r); err != nil {
			return 0, fmt.Errorf("books: write a cash-basis tax row of %s %s: %w", d.Kind, docID, err)
		}
	}
	return len(stray) + len(missing), nil
}
