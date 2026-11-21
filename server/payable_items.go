package books

// payableItemsCollection stores the rows of every payable item (A/P Aging spec
// §4.1): one row per posted Accounts payable journal line that is not a bill
// payment's or a vendor refund's own (source line), one per line of a posted
// bill payment (payment_line), one per line of a posted vendor refund
// (refund_line) and two per application of a posted vendor credit
// (application_bill and application_credit). Only Books writes it, with raw
// SQL from the four queries below (payableQueries), inside the transaction of
// the write that changes a row. settled is the day the balance of the row's
// vendor and item becomes zero and stays zero, or openItemDay while the item
// is open: the A/P Aging reads only the rows with settled after its As of day.
const (
	payableItemsCollection         = "books_payable_items"
	payableSourceLine              = "line"
	payableSourcePaymentLine       = "payment_line"
	payableSourceRefundLine        = "refund_line"
	payableSourceApplicationBill   = "application_bill"
	payableSourceApplicationCredit = "application_credit"
)

// payableColumns are the columns the four queries give, in their order.
const payableColumns = "id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date"

// A line's entry names its document (e), or the entry it reverses names it
// (r); a reversal carries the doc_type of what it reverses. A manual line's
// item is the line itself; a reversal's line is the item of the reversed line
// at the same position.
const (
	payableIsDoc    = "COALESCE(e.doc_type, '') IN ('bill', 'vendor_credit') AND COALESCE(NULLIF(e.document, ''), NULLIF(r.document, '')) IS NOT NULL"
	payableDocID    = "COALESCE(NULLIF(e.document, ''), r.document)"
	payableLineItem = "CASE WHEN " + payableIsDoc + " THEN " + payableDocID +
		" WHEN e.reverses != '' THEN COALESCE((SELECT rl.id FROM books_journal_lines rl WHERE rl.entry = e.reverses AND rl.position = l.position), l.id) ELSE l.id END"
)

// payableLinesSQL is one row per posted journal line on an accounts-payable
// account, except the lines of a bill payment's or a vendor refund's own entry
// and of their reversals (their parts are the payment and refund lines). A
// bill's or a vendor credit's line, and its reversal's, belong to that
// document's item; a bill's ages from its due day, every other item from the
// date of its first entry, so a reversal ages with what it reverses. It ends
// in its WHERE, so a refresh adds " AND l.entry = {:entry}".
const payableLinesSQL = "SELECT l.id AS id, '" + payableSourceLine + "' AS source, l.vendor AS vendor, l.entry AS entry, l.date AS date, l.currency AS currency, l.debit AS debit, l.credit AS credit, " +
	"CAST(" + payableLineItem + " AS TEXT) AS item, " +
	"CAST(CASE WHEN " + payableIsDoc + " THEN e.doc_type ELSE 'entry' END AS TEXT) AS item_kind, " +
	"CAST(COALESCE(r.number, e.number) AS TEXT) AS item_number, " +
	"CAST(COALESCE(r.sequence, e.sequence) AS INTEGER) AS item_seq, " +
	"CAST(CASE WHEN " + payableIsDoc + " AND e.doc_type = 'bill' THEN b.due_date ELSE COALESCE(r.date, e.date) END AS TEXT) AS due_date " +
	"FROM books_journal_lines l " +
	"JOIN books_accounts a ON a.id = l.account " +
	"JOIN books_journal_entries e ON e.id = l.entry " +
	"LEFT JOIN books_journal_entries r ON r.id = e.reverses " +
	"LEFT JOIN books_bills b ON e.doc_type = 'bill' AND b.id = " + payableDocID + " " +
	"WHERE l.posted = TRUE AND a.type = 'accounts_payable' AND COALESCE(e.doc_type, '') NOT IN ('bill_payment', 'vendor_refund')"

// payablePaymentLinesSQL is one row per line of a posted bill payment, at the
// payment's date with its vendor, currency and entry: a debit of the line's
// amount on the bill it pays, with the bill's number and due day. The lines of
// a payment add up to the Accounts payable debits of its entry. It ends in its
// WHERE, so a refresh adds " AND bpl.payment = {:payment}",
// " AND bpl.bill = {:bill}" or " AND bpl.id = {:line}".
const payablePaymentLinesSQL = "SELECT bpl.id AS id, '" + payableSourcePaymentLine + "' AS source, bp.vendor AS vendor, bp.entry AS entry, bp.date AS date, bp.currency AS currency, " +
	"bpl.amount AS debit, CAST(0 AS INTEGER) AS credit, CAST(bpl.bill AS TEXT) AS item, CAST('bill' AS TEXT) AS item_kind, " +
	"CAST(be.number AS TEXT) AS item_number, CAST(be.sequence AS INTEGER) AS item_seq, b.due_date AS due_date " +
	"FROM books_bill_payment_lines bpl JOIN books_bill_payments bp ON bp.id = bpl.payment " +
	"JOIN books_bills b ON b.id = bpl.bill JOIN books_journal_entries be ON be.id = b.entry " +
	"WHERE bp.status = 'posted' AND bp.entry != ''"

// payableRefundLinesSQL is one row per line of a posted vendor refund, at the
// refund's date with its vendor, currency and entry: a credit of the line's
// amount on the vendor credit it refunds, with the credit's number, aging from
// the credit's date. The lines of a refund add up to the Accounts payable
// credits of its entry. It ends in its WHERE, so a refresh adds
// " AND rl.refund = {:refund}", " AND rl.vendor_credit = {:credit}" or
// " AND rl.id = {:line}".
const payableRefundLinesSQL = "SELECT rl.id AS id, '" + payableSourceRefundLine + "' AS source, vr.vendor AS vendor, vr.entry AS entry, vr.date AS date, vr.currency AS currency, " +
	"CAST(0 AS INTEGER) AS debit, rl.amount AS credit, CAST(rl.vendor_credit AS TEXT) AS item, CAST('vendor_credit' AS TEXT) AS item_kind, " +
	"CAST(ce.number AS TEXT) AS item_number, CAST(ce.sequence AS INTEGER) AS item_seq, CAST(vc.date AS TEXT) AS due_date " +
	"FROM books_vendor_refund_lines rl JOIN books_vendor_refunds vr ON vr.id = rl.refund " +
	"JOIN books_vendor_credits vc ON vc.id = rl.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
	"WHERE vr.status = 'posted' AND vr.entry != ''"

// payableApplicationsSQL is two rows per application of a posted vendor
// credit, both at the apply date with the credit's vendor and currency: a
// debit of the amount on the bill's item (id the application's; entry the
// credit's, so its line opens the credit) and a credit of the amount on the
// credit's item (id the application's followed by "c", 16 characters, never a
// PocketBase id; entry the bill's, so its line opens the bill). The two rows
// add to zero. Both halves join both entries, so an application has its two
// rows or none. It is wrapped, so a refresh adds a condition on its own
// columns: " AND pa.vendor_credit = {:credit}", " AND pa.bill = {:bill}" or
// " AND pa.application = {:application}". The three extra columns are not
// stored (payableItems.insert selects payableColumns).
const payableApplicationsSQL = "SELECT * FROM (" +
	"SELECT ca.id AS id, '" + payableSourceApplicationBill + "' AS source, vc.vendor AS vendor, vc.entry AS entry, ca.date AS date, vc.currency AS currency, " +
	"ca.amount AS debit, CAST(0 AS INTEGER) AS credit, CAST(ca.bill AS TEXT) AS item, CAST('bill' AS TEXT) AS item_kind, " +
	"CAST(be.number AS TEXT) AS item_number, CAST(be.sequence AS INTEGER) AS item_seq, CAST(b.due_date AS TEXT) AS due_date, " +
	"ca.id AS application, ca.bill AS bill, ca.vendor_credit AS vendor_credit " +
	"FROM " + vendorCreditApplicationsCollection + " ca JOIN books_vendor_credits vc ON vc.id = ca.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
	"JOIN books_bills b ON b.id = ca.bill JOIN books_journal_entries be ON be.id = b.entry WHERE vc.status = 'posted' " +
	"UNION ALL " +
	"SELECT ca.id || 'c' AS id, '" + payableSourceApplicationCredit + "' AS source, vc.vendor, b.entry, ca.date, vc.currency, " +
	"CAST(0 AS INTEGER) AS debit, ca.amount AS credit, CAST(ca.vendor_credit AS TEXT), CAST('vendor_credit' AS TEXT), " +
	"CAST(ce.number AS TEXT), CAST(ce.sequence AS INTEGER), CAST(vc.date AS TEXT), " +
	"ca.id, ca.bill, ca.vendor_credit " +
	"FROM " + vendorCreditApplicationsCollection + " ca JOIN books_vendor_credits vc ON vc.id = ca.vendor_credit JOIN books_journal_entries ce ON ce.id = vc.entry " +
	"JOIN books_bills b ON b.id = ca.bill JOIN books_journal_entries be ON be.id = b.entry WHERE vc.status = 'posted'" +
	") pa WHERE TRUE"

// payableQueries are the four queries of the stored rows.
var payableQueries = []string{payableLinesSQL, payablePaymentLinesSQL, payableRefundLinesSQL, payableApplicationsSQL}

// msgPayableItemsReadOnly refuses a REST write of a stored payable row.
const msgPayableItemsReadOnly = "Books writes the payable items itself. They cannot be changed."

// payableItems is the stored payable table: its rows, settled days, refresh,
// verify and rebuild are the open-items engine's (open_items.go).
var payableItems = openItemsTable{
	Collection: payableItemsCollection, Party: "vendor", Columns: payableColumns,
	Queries: payableQueries, Open: openItemDay, Noun: "payable", ReadOnly: msgPayableItemsReadOnly,
}
