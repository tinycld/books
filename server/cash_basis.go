package books

import (
	"fmt"
	"math/big"
	"sort"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The cash basis (pay-bills spec §3.10). A document of a deferred kind (a bill,
// an invoice, a credit memo, a vendor credit) counts on the cash basis when and
// as far as it is paid (a vendor credit: applied to bills or refunded; a credit
// memo: paid out by a refund receipt; a write-off never, nor the part of an
// invoice it writes off). Its rows
// in books_cash_basis_lines are derived from the ledger and the payments:
//
//   - taken out: each posted line of the document's entries (its entry and the
//     void reversal of it) negated, at the line's own date;
//   - brought back: for each posted payment and each credit application, in
//     order (date, then entry sequence, then id), its share of every line of
//     the document's current entry at its date. The lines other than the
//     control line (A/P, A/R) take amount × paid ÷ total, cumulative over the
//     payments, by largest remainder; the control line takes the payment's
//     amount, so a share balances and a document paid in full brings back
//     exactly its lines. An application's rows name the vendor credit's
//     posted entry, on the credit and on the bill.
//
// Every write that changes a document's entries or payments rebuilds that
// document's rows in its own transaction (rebuildCashBasisFor); the ledger
// rebuild recomputes every document (rebuildCashBasis). Nothing else writes the
// rows. Each write of a row refreshes the stored cash month of its account
// (cash_balances.go). An invoice's and a credit memo's sales tax has its own rows, rebuilt with these
// (cash_basis_tax.go). Whether a payment counts is read from its entry (posted, origin
// document, naming the payment), not from the payment row: a payment's post
// and void change its entry before its own row is saved.

const cashLinesCollection = "books_cash_basis_lines"

// cashDeferral is one deferred kind: Kind is the document_kind value and the
// cash row's field that names the document; Balance holds the document and
// its payers (document_balance.go); DocType and
// PaymentDocType are the doc types of the document's and the payment's
// entries; UnpaidMemo is a taken-out row's memo, PaidMemo a share row's, with
// the document's number. TaxLines is the collection of the document's posted
// tax lines, whose cash-basis rows live in books_cash_basis_tax_lines
// (cash_basis_tax.go); "" for a kind with no sales tax.
type cashDeferral struct {
	Kind           string
	DocType        string
	PaymentDocType string
	Balance        balanceKind
	UnpaidMemo     string
	PaidMemo       string
	TaxLines       string
}

var (
	billCashDeferral = cashDeferral{
		Kind:           "bill",
		DocType:        docTypeBill,
		PaymentDocType: docTypeBillPayment,
		Balance:        billBalanceKind,
		UnpaidMemo:     "Unpaid bill (cash basis)",
		PaidMemo:       "Bill %s paid (cash basis)",
	}
	invoiceCashDeferral = cashDeferral{
		Kind:           "invoice",
		DocType:        docTypeInvoice,
		PaymentDocType: docTypePayment,
		Balance:        invoiceBalanceKind,
		UnpaidMemo:     "Unpaid invoice (cash basis)",
		PaidMemo:       "Invoice %s paid (cash basis)",
		TaxLines:       "books_invoice_tax_lines",
	}
	// creditMemoCashDeferral takes a credit memo's lines out of the cash layer
	// on its date; each posted refund receipt that pays it out brings back its
	// share at the refund date, naming the refund's entry
	// (creditMemoBalanceKind's payer, whose CashMemo is its rows' memo).
	// PaidMemo is the text the rows of a payer with no CashMemo carry.
	creditMemoCashDeferral = cashDeferral{
		Kind:           "credit_memo",
		DocType:        docTypeCreditMemo,
		PaymentDocType: docTypeRefundReceipt,
		Balance:        creditMemoBalanceKind,
		UnpaidMemo:     "Unapplied credit memo (cash basis)",
		PaidMemo:       "Credit memo %s applied (cash basis)",
		TaxLines:       "books_credit_memo_tax_lines",
	}
	// vendorCreditCashDeferral takes a vendor credit's lines out of the cash
	// layer on its date; each application to a bill brings back its share at
	// the apply date, and each line of a posted vendor refund its share at the
	// refund date, naming the refund's entry (vendorCreditBalanceKind's two
	// payers; the refund payer's CashMemo is its rows' memo).
	vendorCreditCashDeferral = cashDeferral{
		Kind:           "vendor_credit",
		DocType:        docTypeVendorCredit,
		PaymentDocType: docTypeVendorRefund,
		Balance:        vendorCreditBalanceKind,
		UnpaidMemo:     "Unapplied vendor credit (cash basis)",
		PaidMemo:       "Vendor credit %s applied (cash basis)",
	}
	// writeOffCashDeferral takes a write-off's entry (and its void reversal)
	// out of the cash layer at its dates, and nothing brings it back: its
	// balance kind has no payer, because a write-off is no payment (write-off
	// spec Q5). The invoice's write-off payer is NoCash, so the written-off
	// part of the invoice never comes back either. The kind is not in
	// balanceKinds: a write-off has no balance.
	writeOffCashDeferral = cashDeferral{
		Kind:       "write_off",
		DocType:    docTypeWriteOff,
		Balance:    balanceKind{Collection: writeOffsCollection, Noun: "write-off"},
		UnpaidMemo: "Write-off (cash basis)",
	}
	// cashDeferrals are the deferred kinds. A customer payment's unapplied
	// credit is not deferred: it is cash received on its own date.
	cashDeferrals = []cashDeferral{
		billCashDeferral, invoiceCashDeferral, creditMemoCashDeferral, vendorCreditCashDeferral, writeOffCashDeferral,
	}
)

// cashDeferralOf is the deferred kind of a document collection, and false for
// a collection whose documents count as posted.
func cashDeferralOf(collection string) (cashDeferral, bool) {
	for _, d := range cashDeferrals {
		if d.Balance.Collection == collection {
			return d, true
		}
	}
	return cashDeferral{}, false
}

// cashLine is one cash-basis row as Books derives it, and the key a stored row
// is matched by.
type cashLine struct {
	Entry, PaymentEntry, Account, Vendor, Customer, Date, Memo, Currency string
	Debit, Credit                                                        int64
	Position                                                             int
}

// cashSourceLine is one posted journal line of a document's entries.
type cashSourceLine struct {
	Entry    string `db:"entry"`
	Status   string `db:"status"`
	Origin   string `db:"origin"`
	Number   string `db:"number"`
	Account  string `db:"account"`
	Debit    int64  `db:"debit"`
	Credit   int64  `db:"credit"`
	Date     string `db:"date"`
	Position int    `db:"position"`
	Vendor   string `db:"vendor"`
	Customer string `db:"customer"`
	Currency string `db:"currency"`
}

// cashPayment is one posted payment or one application of a document: the
// entry its brought-back rows name (the payment's, or the posted entry of the
// document an application applies), its date (the payment entry's, or the
// apply date) and that entry's sequence, what it pays on the document, the id
// it sorts by last (the entry's, or the application's), and the memo of its
// rows ("" = the deferral's PaidMemo).
type cashPayment struct {
	ID       string `db:"id"`
	Entry    string `db:"entry"`
	Date     string `db:"date"`
	Sequence int    `db:"sequence"`
	Amount   int64  `db:"amount"`
	Memo     string `db:"-"`
}

// documentEntryLinesSQL selects the posted lines of one document's entries
// and of their void reversals, in date order.
const documentEntryLinesSQL = `
	SELECT l.entry AS entry, e.status AS status, e.origin AS origin, e.number AS number,
	       l.account AS account, CAST(l.debit AS INTEGER) AS debit, CAST(l.credit AS INTEGER) AS credit,
	       l.date AS date, CAST(l.position AS INTEGER) AS position,
	       l.vendor AS vendor, l.customer AS customer, l.currency AS currency
	FROM books_journal_lines l
	JOIN books_journal_entries e ON e.id = l.entry
	WHERE l.posted = {:posted} AND e.doc_type = {:type} AND (
		(e.origin = {:document} AND e.document = {:doc})
		OR (e.origin = {:reversal} AND e.reverses != '' AND e.reverses IN (
			SELECT id FROM books_journal_entries
			WHERE document = {:doc} AND doc_type = {:type} AND origin = {:document})))
	ORDER BY l.date, e.sequence, e.origin, l.entry, l.position, l.id`

// documentEntryLines reads the posted lines of the document's entries (origin
// document, naming it) and of their void reversals, in date order.
func documentEntryLines(tx core.App, d cashDeferral, docID string) ([]cashSourceLine, error) {
	var lines []cashSourceLine
	err := tx.DB().NewQuery(documentEntryLinesSQL).Bind(dbx.Params{
		"type": d.DocType, "doc": docID, "posted": true,
		"document": originDocument, "reversal": originVoidReversal,
	}).All(&lines)
	if err != nil {
		return nil, fmt.Errorf("books: read the entries of %s %s: %w", d.Kind, docID, err)
	}
	return lines, nil
}

// documentPayments reads what pays the document, from every payer of its
// balance kind, in one order: date, then entry sequence, then id. A payment
// payer gives one cashPayment per posted payment (its entry, the sum of its
// lines on the document); an application payer gives one per application, at
// the apply date, naming the posted entry of the document the application's
// EntryField names, with the payer's memo. A credit memo's one payer is a
// payment payer: the refund receipts that pay it out. A NoCash payer (an
// invoice's write-offs) lowers the balance but pays nothing: it is left out.
func documentPayments(tx core.App, d cashDeferral, docID string) ([]cashPayment, error) {
	var payments []cashPayment
	for _, p := range d.Balance.Payers {
		if p.NoCash {
			continue
		}
		var found []cashPayment
		var err error
		if p.PaymentCollection != "" {
			found, err = postedPaymentsOf(tx, d, p, docID)
		} else {
			found, err = applicationsOf(tx, d, p, docID)
		}
		if err != nil {
			return nil, err
		}
		payments = append(payments, found...)
	}
	sort.SliceStable(payments, func(i, j int) bool {
		a, b := payments[i], payments[j]
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.Sequence != b.Sequence {
			return a.Sequence < b.Sequence
		}
		return a.ID < b.ID
	})
	return payments, nil
}

// postedPaymentsOf reads the posted payments whose lines (of payer p) pay the
// document: whether a payment counts is read from its entry, of the deferral's
// PaymentDocType. Each takes the payer's CashMemo; a payer with none (a bill
// payment, a received payment) leaves its rows the deferral's PaidMemo.
//
// The unary + on pe.status (also in applicationsOf) keeps the planner from
// starting at idx_books_je_status_date: from there each document reads every
// posted entry of the book. The read starts at the payer lines of docID.
func postedPaymentsOf(tx core.App, d cashDeferral, p balancePayer, docID string) ([]cashPayment, error) {
	var payments []cashPayment
	err := tx.DB().NewQuery(`
		SELECT pe.id AS id, pe.id AS entry, pe.date AS date, CAST(pe.sequence AS INTEGER) AS sequence,
		       CAST(SUM(pl.amount) AS INTEGER) AS amount
		FROM ` + p.LinesCollection + ` pl
		JOIN books_journal_entries pe ON pe.document = pl.` + p.PaymentField + `
		WHERE pl.` + p.LineField + ` = {:doc} AND pe.doc_type = {:type}
		  AND pe.origin = 'document' AND +pe.status = {:posted}
		GROUP BY pe.id`).
		Bind(dbx.Params{"doc": docID, "type": d.PaymentDocType, "posted": statusPosted}).All(&payments)
	if err != nil {
		return nil, fmt.Errorf("books: read the payments of %s %s: %w", d.Kind, docID, err)
	}
	for i := range payments {
		payments[i].Memo = p.CashMemo
	}
	return payments, nil
}

// applicationsOf reads the applications (rows of payer p) that name the
// document, each with the posted origin-document entry of the document its
// EntryField names: a vendor credit's entry, for the credit's own rows and for
// the bill's. The doc type of that entry is the one of the deferral whose
// documents live in EntryCollection.
func applicationsOf(tx core.App, d cashDeferral, p balancePayer, docID string) ([]cashPayment, error) {
	source, ok := cashDeferralOf(p.EntryCollection)
	if !ok {
		return nil, fmt.Errorf("books: %s is not a deferred collection", p.EntryCollection)
	}
	var payments []cashPayment
	err := tx.DB().NewQuery(`
		SELECT a.id AS id, pe.id AS entry, a.date AS date, CAST(pe.sequence AS INTEGER) AS sequence,
		       CAST(a.amount AS INTEGER) AS amount
		FROM ` + p.LinesCollection + ` a
		JOIN books_journal_entries pe ON pe.document = a.` + p.EntryField + `
		WHERE a.` + p.LineField + ` = {:doc} AND pe.doc_type = {:type}
		  AND pe.origin = 'document' AND +pe.status = {:posted}`).
		Bind(dbx.Params{"doc": docID, "type": source.DocType, "posted": statusPosted}).All(&payments)
	if err != nil {
		return nil, fmt.Errorf("books: read the applications of %s %s: %w", d.Kind, docID, err)
	}
	for i := range payments {
		payments[i].Memo = p.CashMemo
	}
	return payments, nil
}

// wantCashRows derives the document's cash-basis rows from its entries and its
// posted payments.
func wantCashRows(tx core.App, d cashDeferral, docID string) ([]cashLine, error) {
	lines, err := documentEntryLines(tx, d, docID)
	if err != nil {
		return nil, err
	}
	var rows []cashLine
	var current []cashSourceLine
	for _, l := range lines {
		rows = append(rows, cashLine{
			Entry: l.Entry, Account: l.Account, Vendor: l.Vendor, Customer: l.Customer,
			Date: l.Date, Memo: d.UnpaidMemo, Currency: l.Currency,
			Debit: l.Credit, Credit: l.Debit,
		})
		if l.Status == statusPosted && l.Origin == originDocument {
			current = append(current, l)
		}
	}
	shares, err := paymentShareRows(tx, d, docID, current)
	if err != nil {
		return nil, err
	}
	rows = append(rows, shares...)
	for i := range rows {
		rows[i].Position = i
	}
	return rows, nil
}

// paymentShareRows are the rows the document's posted payments bring back over
// its current entry's lines: the control line (the first by position, the A/P
// or A/R line) takes each payment's amount; every other line its share, by
// largest remainder over the cumulative amount paid.
func paymentShareRows(tx core.App, d cashDeferral, docID string, current []cashSourceLine) ([]cashLine, error) {
	if len(current) == 0 {
		return nil, nil
	}
	sort.SliceStable(current, func(i, j int) bool { return current[i].Position < current[j].Position })
	control, others := current[0], current[1:]
	// sign turns the lines' debit − credit into amounts that add up to the
	// total: a bill credits its control line, an invoice debits it.
	sign, total := int64(1), control.Credit
	if control.Debit > 0 {
		sign, total = -1, control.Debit
	}
	if total == 0 {
		return nil, nil
	}
	payments, err := documentPayments(tx, d, docID)
	if err != nil {
		return nil, err
	}
	amounts := make([]int64, len(others))
	for i, l := range others {
		amounts[i] = sign * (l.Debit - l.Credit)
	}
	memoOf := func(p cashPayment) string {
		if p.Memo != "" {
			return fmt.Sprintf(p.Memo, control.Number)
		}
		return fmt.Sprintf(d.PaidMemo, control.Number)
	}
	row := func(l cashSourceLine, p cashPayment, signed int64) cashLine {
		r := cashLine{
			Entry: p.Entry, PaymentEntry: p.Entry, Account: l.Account, Vendor: l.Vendor, Customer: l.Customer,
			Date: p.Date, Memo: memoOf(p), Currency: l.Currency,
		}
		if signed > 0 {
			r.Debit = signed
		} else {
			r.Credit = -signed
		}
		return r
	}
	var rows []cashLine
	var paid int64
	before := make([]int64, len(others))
	for _, p := range payments {
		paid += p.Amount
		after := largestRemainder(amounts, paid, total)
		for i, l := range others {
			if share := after[i] - before[i]; share != 0 {
				rows = append(rows, row(l, p, sign*share))
			}
		}
		rows = append(rows, row(control, p, -sign*p.Amount))
		before = after
	}
	return rows, nil
}

// largestRemainder splits amounts in proportion to paid ÷ total: each takes
// the floor of amount × paid ÷ total, and the floor of (the amounts' sum) ×
// paid ÷ total less those floors is handed out one cent each to the largest
// remainders (the earlier amount on a tie). So the parts add up to the floor
// of their exact sum, each part is within a cent of its exact share, and when
// the amounts add up to total, the parts add up to paid. The amounts need not
// add up to total: a tax line's figures do not (cash_basis_tax.go).
func largestRemainder(amounts []int64, paid, total int64) []int64 {
	out := make([]int64, len(amounts))
	if total == 0 {
		return out
	}
	if total < 0 {
		paid, total = -paid, -total
	}
	divisor := big.NewInt(total)
	bigPaid := big.NewInt(paid)
	remainders := make([]*big.Int, len(amounts))
	sum := new(big.Int)
	floors := new(big.Int)
	for i, a := range amounts {
		q, r := new(big.Int), new(big.Int)
		// Euclidean division: with a positive divisor q is the floor and r is
		// in [0, total).
		q.DivMod(new(big.Int).Mul(big.NewInt(a), bigPaid), divisor, r)
		out[i] = q.Int64()
		remainders[i] = r
		sum.Add(sum, big.NewInt(a))
		floors.Add(floors, q)
	}
	target, unused := new(big.Int), new(big.Int)
	target.DivMod(sum.Mul(sum, bigPaid), divisor, unused)
	left := target.Sub(target, floors).Int64()
	order := make([]int, len(amounts))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(x, y int) bool {
		return remainders[order[x]].Cmp(remainders[order[y]]) > 0
	})
	for i := 0; int64(i) < left && i < len(order); i++ {
		out[order[i]]++
	}
	return out
}

// cashRowDiff compares the document's stored rows with the derived ones: the
// stored rows no derived row matches, and the derived rows no stored row
// matches.
func cashRowDiff(tx core.App, d cashDeferral, docID string) (stray []*core.Record, missing []cashLine, err error) {
	want, err := wantCashRows(tx, d, docID)
	if err != nil {
		return nil, nil, err
	}
	stored, err := tx.FindAllRecords(cashLinesCollection, dbx.HashExp{d.Kind: docID})
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the cash-basis rows of %s %s: %w", d.Kind, docID, err)
	}
	unmatched := map[cashLine]int{}
	for _, w := range want {
		unmatched[w]++
	}
	for _, r := range stored {
		k := storedCashLine(d, r)
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

// storedCashLine is a stored row as a cashLine. A row of another kind than
// d never matches.
func storedCashLine(d cashDeferral, r *core.Record) cashLine {
	if r.GetString("document_kind") != d.Kind || !r.GetBool("posted") {
		return cashLine{Entry: "\x00"}
	}
	return cashLine{
		Entry: r.GetString("entry"), PaymentEntry: r.GetString("payment_entry"), Account: r.GetString("account"),
		Vendor: r.GetString("vendor"), Customer: r.GetString("customer"), Date: r.GetString("date"),
		Memo: r.GetString("memo"), Currency: r.GetString("currency"),
		Debit: int64(r.GetInt("debit")), Credit: int64(r.GetInt("credit")), Position: r.GetInt("position"),
	}
}

// syncCashRows makes the document's stored rows, its tax rows included,
// equal the derived ones, touching only the rows that differ, and returns how
// many rows it deleted and wrote.
func syncCashRows(tx core.App, d cashDeferral, docID string) (int, error) {
	taxChanged, err := syncCashTaxRows(tx, d, docID)
	if err != nil {
		return 0, err
	}
	lineChanged, err := syncCashLineRows(tx, d, docID)
	return taxChanged + lineChanged, err
}

// syncCashLineRows makes the document's stored books_cash_basis_lines rows
// equal the derived ones, and refreshes the stored cash month
// (cash_balances.go) of every row it deletes or writes.
func syncCashLineRows(tx core.App, d cashDeferral, docID string) (int, error) {
	stray, missing, err := cashRowDiff(tx, d, docID)
	if err != nil {
		return 0, err
	}
	months := map[balanceKey]bool{}
	for _, r := range stray {
		months[balanceKey{r.GetString("account"), periodOf(r.GetString("date"))}] = true
		if err := tx.Delete(r); err != nil {
			return 0, fmt.Errorf("books: delete a cash-basis row of %s %s: %w", d.Kind, docID, err)
		}
	}
	if len(missing) == 0 {
		return len(stray), refreshCashBalances(tx, months)
	}
	col, err := tx.FindCachedCollectionByNameOrId(cashLinesCollection)
	if err != nil {
		return 0, err
	}
	for _, w := range missing {
		months[balanceKey{w.Account, periodOf(w.Date)}] = true
		r := core.NewRecord(col)
		r.Set("document_kind", d.Kind)
		r.Set(d.Kind, docID)
		r.Set("entry", w.Entry)
		r.Set("payment_entry", w.PaymentEntry)
		r.Set("account", w.Account)
		r.Set("vendor", w.Vendor)
		r.Set("customer", w.Customer)
		r.Set("debit", w.Debit)
		r.Set("credit", w.Credit)
		r.Set("date", w.Date)
		r.Set("posted", true)
		r.Set("memo", w.Memo)
		r.Set("currency", w.Currency)
		r.Set("position", w.Position)
		if err := tx.Save(r); err != nil {
			return 0, fmt.Errorf("books: write a cash-basis row of %s %s: %w", d.Kind, docID, err)
		}
	}
	if err := refreshCashBalances(tx, months); err != nil {
		return 0, err
	}
	return len(stray) + len(missing), nil
}

// rebuildCashBasisFor rebuilds one document's cash-basis rows inside the
// transaction of the write that changed its entries or its payments.
func rebuildCashBasisFor(tx core.App, kind cashDeferral, docID string) error {
	_, err := syncCashRows(tx, kind, docID)
	return err
}

// rebuildCashBasisOf rebuilds the rows of each document of collection; a
// collection that is not deferred has none.
func rebuildCashBasisOf(tx core.App, collection string, docIDs ...string) error {
	d, ok := cashDeferralOf(collection)
	if !ok {
		return nil
	}
	for _, id := range docIDs {
		if id == "" {
			continue
		}
		if err := rebuildCashBasisFor(tx, d, id); err != nil {
			return err
		}
	}
	return nil
}

// rebuildPaidCashBasis rebuilds the rows of every document the payments'
// lines pay: a payment's post, correction or void changes their shares.
func rebuildPaidCashBasis(tx core.App, kind balanceKind, paymentIDs ...string) error {
	var docs []string
	seen := map[string]bool{}
	p, _ := kind.paymentPayer()
	for _, id := range paymentIDs {
		if id == "" {
			continue
		}
		lines, err := paymentLines(tx, kind, id)
		if err != nil {
			return err
		}
		for _, l := range lines {
			doc := l.GetString(p.LineField)
			if !seen[doc] {
				seen[doc] = true
				docs = append(docs, doc)
			}
		}
	}
	return rebuildCashBasisOf(tx, kind.Collection, docs...)
}

// cashDocuments are the documents of kind d that have a posted entry or
// stored cash-basis rows (tax rows included).
func cashDocuments(app core.App, d cashDeferral) ([]string, error) {
	var rows []struct {
		ID string `db:"id"`
	}
	taxRows := ""
	if d.TaxLines != "" {
		taxRows = `
		UNION
		SELECT ` + d.Kind + ` AS id FROM ` + cashTaxLinesCollection + `
		WHERE ` + d.Kind + ` != ''`
	}
	err := app.DB().NewQuery(`
		SELECT document AS id FROM books_journal_entries
		WHERE doc_type = {:type} AND origin = 'document' AND document != ''
		UNION
		SELECT ` + d.Kind + ` AS id FROM ` + cashLinesCollection + `
		WHERE document_kind = {:kind} AND ` + d.Kind + ` != ''` + taxRows + `
		ORDER BY id`).Bind(dbx.Params{"type": d.DocType, "kind": d.Kind}).All(&rows)
	if err != nil {
		return nil, fmt.Errorf("books: list the %s documents of the cash basis: %w", d.Kind, err)
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return ids, nil
}

// CashBasisDrift is one document whose stored cash-basis rows (lines and tax
// rows) differ from the rows its entries, tax lines and payments give: Stray
// stored rows no derived row matches, Missing derived rows with no stored row.
type CashBasisDrift struct {
	Kind     string `json:"kind"`
	Document string `json:"document"`
	Stray    int    `json:"stray"`
	Missing  int    `json:"missing"`
}

// verifyCashBasis compares every document's stored cash-basis rows with a
// full rebuild and reports each document that differs.
func verifyCashBasis(app core.App) ([]CashBasisDrift, error) {
	drifts := []CashBasisDrift{}
	for _, d := range cashDeferrals {
		ids, err := cashDocuments(app, d)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			stray, missing, err := cashRowDiff(app, d, id)
			if err != nil {
				return nil, err
			}
			strayTax, missingTax, err := cashTaxRowDiff(app, d, id)
			if err != nil {
				return nil, err
			}
			strays, missings := len(stray)+len(strayTax), len(missing)+len(missingTax)
			if strays > 0 || missings > 0 {
				drifts = append(drifts, CashBasisDrift{Kind: d.Kind, Document: id, Stray: strays, Missing: missings})
			}
		}
	}
	return drifts, nil
}

// rebuildCashBasis rebuilds every document's cash-basis rows in one
// transaction, touching only the rows that differ, and returns how many rows
// it deleted and wrote.
func rebuildCashBasis(app core.App) (int, error) {
	changed := 0
	err := app.RunInTransaction(func(tx core.App) error {
		for _, d := range cashDeferrals {
			ids, err := cashDocuments(tx, d)
			if err != nil {
				return err
			}
			for _, id := range ids {
				n, err := syncCashRows(tx, d, id)
				if err != nil {
					return err
				}
				changed += n
			}
		}
		return nil
	})
	return changed, err
}
