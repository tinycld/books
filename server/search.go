package books

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/fts"
	"tinycld.org/core/search"
)

// searchSource contributes accounts, journal entries, customers, vendors,
// products, invoices, sales receipts, estimates, bills, expenses, payments and
// bill payments to core's
// federated /api/search. Each kind is read from its FTS5 index
// (server/search_index.go). Rows are shaped here so the palette and the
// CLI show the same thing; the client adapter
// (tinycld/books/search-adapter.ts) only navigates.
func searchSource() search.Source {
	return search.Source{
		Slug:  "books",
		Label: "Books",
		// Mirrors manifest.ts nav.order, the cross-package ranking tie-break.
		Order:  30,
		Scopes: []string{scopeRead},
		Search: searchBooks,
	}
}

const defaultSearchLimit = 20

func searchBooks(app core.App, userID string, q search.Query) (search.Result, error) {
	// A direct query: the collection rules do not run here, so the level
	// they read is checked first.
	level, err := levelForUser(app, userID)
	if err != nil {
		return search.Result{}, err
	}
	// fts owns the FTS5 quoting. It returns "" when the include text leaves
	// FTS5 nothing to quote (only operator characters such as " * - ( ^), and
	// FTS5 refuses an empty MATCH, so that finds nothing. A term of other
	// symbols (such as %) is quoted as a prefix term that matches no indexed
	// word: it also finds nothing and raises no error.
	match := fts.SanitizeQueryWithExclusions(strings.Join(q.Include, " "), strings.Join(q.Exclude, " "))
	if !level.CanRead() || match == "" {
		return search.Result{}, nil
	}
	limit := q.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	offset := max(q.Offset, 0)
	window := offset + limit
	ctx := q.Context()

	accounts, accountTotal, err := searchAccounts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	entries, entryTotal, err := searchEntries(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	customers, customerTotal, err := searchParties(ctx, app, match, window, customerSource)
	if err != nil {
		return search.Result{}, err
	}
	vendors, vendorTotal, err := searchParties(ctx, app, match, window, vendorSource)
	if err != nil {
		return search.Result{}, err
	}
	products, productTotal, err := searchProducts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	invoices, invoiceTotal, err := searchSalesDocs(ctx, app, invoiceSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	receipts, receiptTotal, err := searchSalesDocs(ctx, app, salesReceiptSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	creditMemos, creditMemoTotal, err := searchSalesDocs(ctx, app, creditMemoSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	refundReceipts, refundReceiptTotal, err := searchSalesDocs(ctx, app, refundReceiptSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	estimates, estimateTotal, err := searchSalesDocs(ctx, app, estimateSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	bills, billTotal, err := searchSalesDocs(ctx, app, billSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	expenses, expenseTotal, err := searchSalesDocs(ctx, app, expenseSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	vendorCredits, vendorCreditTotal, err := searchSalesDocs(ctx, app, vendorCreditSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	payments, paymentTotal, err := searchSalesDocs(ctx, app, paymentSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	billPayments, billPaymentTotal, err := searchSalesDocs(ctx, app, billPaymentSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	vendorRefunds, vendorRefundTotal, err := searchSalesDocs(ctx, app, vendorRefundSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	writeOffs, writeOffTotal, err := searchSalesDocs(ctx, app, writeOffSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	deposits, depositTotal, err := searchSalesDocs(ctx, app, depositSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	rows := interleave(accounts, entries, customers, vendors, products, invoices, receipts, creditMemos, refundReceipts,
		estimates, bills, expenses, vendorCredits, payments, billPayments, vendorRefunds, writeOffs, deposits)
	total := accountTotal + entryTotal + customerTotal + vendorTotal + productTotal + invoiceTotal + receiptTotal +
		creditMemoTotal + refundReceiptTotal + estimateTotal + billTotal + expenseTotal + vendorCreditTotal + paymentTotal +
		billPaymentTotal + vendorRefundTotal + writeOffTotal + depositTotal
	return search.Result{Rows: page(rows, offset, limit), Total: total}, nil
}

// interleave takes one row from each list in turn, then what is left of the
// longer lists, so a query that matches many of one kind (a number matches
// account numbers and entry numbers) still shows the others on its first
// page. Each list holds its first window hits in order, so the first window
// rows here are the same whichever page asks.
func interleave(lists ...[]search.Row) []search.Row {
	size, longest := 0, 0
	for _, l := range lists {
		size += len(l)
		longest = max(longest, len(l))
	}
	rows := make([]search.Row, 0, size)
	for i := range longest {
		for _, l := range lists {
			if i < len(l) {
				rows = append(rows, l[i])
			}
		}
	}
	return rows
}

// indexQuery reads one search source from its FTS5 index: the index rows that
// match, joined to their records (aliased c), narrowed by where, in order.
// Every identifier is a constant of this file; only the match and the window
// are bound. A record deleted behind a stale index row drops out at the join.
type indexQuery struct {
	index, table, joins, where, columns, order string
}

// run counts every hit and loads the first window of them into hits. Each
// kind keeps a fixed order rather than FTS rank: core ranks the merged rows by
// how well their visible text matches, and a fixed order keeps the pages of
// one query stable. Customers, vendors and products order by sort_key, as
// their lists do (case and accents folded, each sub-customer under its
// parent); accounts by name, entries by date.
func (iq indexQuery) run(ctx context.Context, app core.App, match string, window int, hits any) (int, error) {
	from := " FROM " + iq.index + " JOIN " + iq.table + " c ON c.id = " + iq.index + ".record_id" + iq.joins +
		" WHERE " + iq.index + " MATCH {:match}"
	if iq.where != "" {
		from += " AND " + iq.where
	}
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*)" + from).WithContext(ctx).
		Bind(dbx.Params{"match": match}).Row(&total); err != nil {
		return 0, fmt.Errorf("books: count %s hits: %w", iq.table, err)
	}
	if err := app.DB().NewQuery("SELECT " + iq.columns + from + " ORDER BY " + iq.order + " LIMIT {:window}").
		WithContext(ctx).Bind(dbx.Params{"match": match, "window": window}).All(hits); err != nil {
		return 0, fmt.Errorf("books: search %s: %w", iq.table, err)
	}
	return total, nil
}

type accountHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Number   string `db:"number"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

var accountsQuery = indexQuery{
	index: accountsIndex, table: "books_accounts",
	columns: "c.id, c.name, c.number, c.type, c.inactive", order: "c.name, c.id",
}

func searchAccounts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []accountHit
	total, err := accountsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := typeLabel(h.Type)
		if h.Number != "" {
			subtitle = h.Number + " · " + subtitle
		}
		rows = append(rows, search.Row{
			ID:       "account:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Account",
			Fields:   map[string]any{"kind": "account", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type entryHit struct {
	ID      string `db:"id"`
	Number  string `db:"number"`
	Memo    string `db:"memo"`
	Date    string `db:"date"`
	Status  string `db:"status"`
	DocType string `db:"doc_type"`
}

// A void's reversal repeats the voided entry's number, and the voided entry
// is the one a person looks for, so reversals are left out. A document's entry
// is left out too: its document's own row (an invoice hit) stands for it.
var entriesQuery = indexQuery{
	index: entriesIndex, table: "books_journal_entries", where: "c.origin NOT IN ('void_reversal', 'document')",
	columns: "c.id, c.number, c.memo, c.date, c.status, c.doc_type", order: "c.date DESC, c.id",
}

func searchEntries(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []entryHit
	total, err := entriesQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		// A transfer hit opens the transfer screen, so the client adapter needs
		// its own id prefix and kind.
		prefix, kind := "entry:", "journal_entry"
		if h.DocType == docTypeTransfer {
			prefix, kind = "transfer:", "transfer"
		}
		rows = append(rows, search.Row{
			ID:       prefix + h.ID,
			Title:    entryHitTitle(h),
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": kind, "status": h.Status},
		})
	}
	return rows, total, nil
}

type partyHit struct {
	ID          string `db:"id"`
	DisplayName string `db:"display_name"`
	Company     string `db:"company"`
	Email       string `db:"email"`
	Inactive    bool   `db:"inactive"`
	ParentName  string `db:"parent_name"`
}

// partySource names a kind of party (a person or company the books deal
// with): the row id prefix and kind, the Meta label, and its index query.
type partySource struct {
	kind, meta string
	query      indexQuery
}

// The parent join only labels a customer hit ("Parent : Child"): the match
// stays on the child's own index row, and the LEFT JOIN on the unique parent
// id adds or drops no rows, so the count and the rows agree.
var customerSource = partySource{
	kind: "customer", meta: "Customer",
	query: indexQuery{
		index: customersIndex, table: "books_customers",
		joins:   " LEFT JOIN books_customers p ON p.id = c.parent",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, COALESCE(p.display_name, '') AS parent_name",
		order:   "c.sort_key, c.id",
	},
}

// A vendor's index also holds its legal name, never its tax ID; the hit shows
// neither.
var vendorSource = partySource{
	kind: "vendor", meta: "Vendor",
	query: indexQuery{
		index: vendorsIndex, table: "books_vendors",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, '' AS parent_name",
		order:   "c.sort_key, c.id",
	},
}

// partyHitTitle uses the client's "Parent : Child" label form, so two rows of
// the same name under different parents are told apart.
func partyHitTitle(h partyHit) string {
	if h.ParentName == "" {
		return h.DisplayName
	}
	return h.ParentName + " : " + h.DisplayName
}

func searchParties(ctx context.Context, app core.App, match string, window int, src partySource) ([]search.Row, int, error) {
	var hits []partyHit
	total, err := src.query.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Company
		if subtitle == "" {
			subtitle = h.Email
		}
		rows = append(rows, search.Row{
			ID:       src.kind + ":" + h.ID,
			Title:    partyHitTitle(h),
			Subtitle: subtitle,
			Meta:     src.meta,
			Fields:   map[string]any{"kind": src.kind, "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type productHit struct {
	ID           string `db:"id"`
	Name         string `db:"name"`
	VendorPartNo string `db:"vendor_part_no"`
	Type         string `db:"type"`
	Inactive     bool   `db:"inactive"`
}

// The index holds the sales description but not the purchase one: the sales
// text is what a customer reads and what a person recalls an item by.
var productsQuery = indexQuery{
	index: productsIndex, table: "books_products",
	columns: "c.id, c.name, c.vendor_part_no, c.type, c.inactive", order: "c.sort_key, c.id",
}

func searchProducts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []productHit
	total, err := productsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.VendorPartNo
		if subtitle == "" {
			subtitle = productTypeLabel(h.Type)
		}
		rows = append(rows, search.Row{
			ID:       "product:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Product or service",
			Fields:   map[string]any{"kind": "product", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type salesDocHit struct {
	ID        string `db:"id"`
	Number    string `db:"number"`
	Memo      string `db:"memo"`
	Date      string `db:"date"`
	Status    string `db:"status"`
	PartyName string `db:"party_name"`
	// The number and name of an account party (partyIsAccount); NULL when the
	// document names no account.
	PartyNumber      sql.NullString `db:"party_number"`
	PartyAccountName sql.NullString `db:"party_account_name"`
}

// salesDocSearch is one kind of document of the sales document layer (the
// purchase documents use it too) as a search source: its table, its FTS5
// index, its doc type (for the title's nouns), its row id prefix and kind
// (what the client adapter opens), its party: the header column that names
// it, the party's table and the party's FTS5 index, and the column shown as
// the row's subtitle (memo when unset). The party's display_name is its name
// in the title; a kind with partyIsAccount names an account instead, built in
// Go by accountNumberName from the account's number and name. A kind with no
// partyIdx matches its own index alone: its party names it in the title only.
// A kind with draftNamesNoParty titles a draft with its noun alone.
type salesDocSearch struct {
	table, index, docType, kind      string
	partyField, partyTable, partyIdx string
	partyIsAccount                   bool
	subtitle                         string
	draftNamesNoParty                bool
}

// subtitleColumn is the document column under the title: the memo, or the
// kind's own column for a kind with no memo.
func (s salesDocSearch) subtitleColumn() string {
	if s.subtitle == "" {
		return "memo"
	}
	return s.subtitle
}

// partyColumns is the SELECT of the party's name parts: an account's number
// and name, or a customer's or vendor's display name.
func (s salesDocSearch) partyColumns() string {
	if s.partyIsAccount {
		return "pa.number AS party_number, pa.name AS party_account_name"
	}
	return "COALESCE(pa.display_name, '') AS party_name"
}

// partyTitle is the party's name in the title; "" when the hit has none.
func (s salesDocSearch) partyTitle(h salesDocHit) string {
	if s.partyIsAccount {
		return accountNumberName(h.PartyNumber.String, h.PartyAccountName.String)
	}
	return h.PartyName
}

// termMatch is the match of one bound word (%[1]s of salesDocTermMatch).
func (s salesDocSearch) termMatch(param string) string {
	if s.partyIdx == "" {
		return fmt.Sprintf(salesDocOwnTermMatch, param, s.index)
	}
	return fmt.Sprintf(salesDocTermMatch, param, s.index, s.partyField, s.partyIdx)
}

var invoiceSearch = salesDocSearch{
	table: "books_invoices", index: invoicesIndex, docType: docTypeInvoice, kind: "invoice",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

var salesReceiptSearch = salesDocSearch{
	table: "books_sales_receipts", index: salesReceiptsIndex, docType: docTypeSalesReceipt, kind: "sales_receipt",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// creditMemoSearch names its customer: "Credit memo 1001 · Harborview Dental"
// / "Draft credit memo · Harborview Dental", drafts included. A word matches
// the memo's number, memo and message, or the customer's display name,
// company and email.
var creditMemoSearch = salesDocSearch{
	table: creditMemoKind.Collection, index: creditMemosIndex, docType: docTypeCreditMemo, kind: "credit_memo",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// refundReceiptSearch names its customer when it has one: "Refund receipt
// 1001 · Harborview Dental" / "Draft refund receipt · Harborview Dental", or
// "Refund receipt 1001" with no customer (a LEFT JOIN, so a walk-in refund is
// found), drafts included. A word matches the refund's number, reference no.,
// memo and message, or the customer's display name, company and email.
var refundReceiptSearch = salesDocSearch{
	table: refundReceiptKind.Collection, index: refundReceiptsIndex, docType: docTypeRefundReceipt, kind: "refund_receipt",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// estimateSearch lists every estimate: an estimate has its number from its
// first save, so its title is always "Estimate 1001 · Customer".
var estimateSearch = salesDocSearch{
	table: "books_estimates", index: estimatesIndex, docType: docTypeEstimate, kind: "estimate",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// billSearch names its vendor: "Bill 1003 · Pacific Power" / "Draft bill ·
// Pacific Power". A word matches the bill's number, vendor's bill no. and
// memo, or the vendor's display name, company, email and legal name.
var billSearch = salesDocSearch{
	table: billKind.Collection, index: billsIndex, docType: docTypeBill, kind: "bill",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
}

// expenseSearch names its vendor when it has one: "Expense 1004 · Pacific
// Power" / "Draft expense · Pacific Power", or "Expense 1004" / "Draft
// expense" with no vendor. A word matches the expense's number, Ref no. and
// memo, or the vendor's display name, company, email and legal name.
var expenseSearch = salesDocSearch{
	table: expensesCollection, index: expensesIndex, docType: docTypeExpense, kind: "expense",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
}

// vendorCreditSearch names its vendor: "Vendor credit 1002 · Pacific Power" /
// "Draft vendor credit · Pacific Power". A word matches the credit's number,
// vendor's credit no. and memo, or the vendor's display name, company, email
// and legal name.
var vendorCreditSearch = salesDocSearch{
	table: vendorCreditsCollection, index: vendorCreditsIndex, docType: docTypeVendorCredit, kind: "vendor_credit",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
}

// paymentSearch names its customer: "Payment 1004 · Harborview Dental" /
// "Draft payment · Harborview Dental". A word matches the payment's number,
// reference no. and memo, or the customer's display name, company and email.
var paymentSearch = salesDocSearch{
	table: paymentsCollection, index: paymentsIndex, docType: docTypePayment, kind: "payment",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// billPaymentSearch names its vendor: "Bill payment 1004 · Pacific Power" /
// "Bill payment 1004 (void) · Pacific Power" (pay-bills spec §3.11). A word
// matches the payment's number and Ref no., or the vendor's display name,
// company, email and legal name. A bill payment has no memo, so its Ref no.
// is the subtitle. Every stored bill payment is posted or void: there is no
// draft one.
var billPaymentSearch = salesDocSearch{
	table: billPaymentsCollection, index: billPaymentsIndex, docType: docTypeBillPayment, kind: "bill_payment",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
	subtitle: "reference_no",
}

// vendorRefundSearch names its vendor: "Vendor refund 1001 · Pacific Power" /
// "Draft vendor refund · Pacific Power" (vendor refund spec §3.11), drafts
// included. A word matches the refund's number, reference no. and memo, or the
// vendor's display name, company, email and legal name.
var vendorRefundSearch = salesDocSearch{
	table: vendorRefundsCollection, index: vendorRefundsIndex, docType: docTypeVendorRefund, kind: "vendor_refund",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
}

// writeOffSearch names its customer: "Write-off 1001 · Harborview Dental" /
// "Write-off 1001 (void) · Harborview Dental" (write-off spec §3.6). A word
// matches the write-off's number and reason (memo), or the customer's display
// name, company and email. Every stored write-off is posted or void: there is
// no draft one.
var writeOffSearch = salesDocSearch{
	table: writeOffsCollection, index: writeOffsIndex, docType: docTypeWriteOff, kind: "write_off",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// depositSearch names a posted or void deposit's Deposit to account: "Deposit
// 1004 · 1010 Business Savings", and a draft "Draft deposit" (bank deposit
// spec §3.10), drafts included; the title's account name is
// accountNumberName's, as accountDisplayName names an account. A word matches
// the deposit's number and memo only.
var depositSearch = salesDocSearch{
	table: depositsCollection, index: depositsIndex, docType: docTypeDeposit, kind: "deposit",
	partyField: "deposit_to", partyTable: "books_accounts",
	partyIsAccount: true, draftNamesNoParty: true,
}

// salesDocTermMatch is true when one query word matches a document's own
// index row (number, memo, message; a sales receipt's, a refund receipt's, an
// expense's, a payment's, a bill payment's and a vendor refund's reference
// no., a bill's
// vendor's bill no. and
// a vendor credit's vendor's credit no. too) or its party's (a
// customer's display name, company, email; a vendor's legal name too).
// Reading the party's row at query time lets a renamed party find its
// documents with no reindex. %[1]s is the bound word, %[2]s the document's
// index, %[3]s the party column and %[4]s the party's index.
const salesDocTermMatch = `(c.id IN (SELECT record_id FROM %[2]s WHERE %[2]s MATCH {:%[1]s})
	OR c.%[3]s IN (SELECT record_id FROM %[4]s WHERE %[4]s MATCH {:%[1]s}))`

// salesDocOwnTermMatch is salesDocTermMatch for a kind whose party has no
// index of its own to match.
const salesDocOwnTermMatch = `c.id IN (SELECT record_id FROM %[2]s WHERE %[2]s MATCH {:%[1]s})`

// from builds the FROM and WHERE of a sales document search. The words are
// matched one by one and ANDed, so "Harborview 1003" finds invoice 1003 of
// Harborview although its number and the customer's name are in two index
// rows; each word is a prefix term, as in every other source. An excluded
// word drops a document when it matches either row. Drafts are included:
// search is how a person reopens a draft (spec Q13). A void document stays
// findable, as a void entry does. The party is a LEFT JOIN: a sales receipt
// may have no customer and an expense no vendor (an invoice always has one
// and a bill a vendor, so their rows are the same as an inner join's). Only
// the bound words vary; every identifier is a constant of this file.
func (s salesDocSearch) from(include, exclude []string) (string, dbx.Params) {
	params := dbx.Params{}
	var conds []string
	add := func(prefix string, words []string, negate bool) {
		for _, word := range words {
			term := fts.SanitizeQuery(word)
			if term == "" {
				continue
			}
			name := fmt.Sprintf("%s%d", prefix, len(params))
			params[name] = term
			cond := s.termMatch(name)
			if negate {
				cond = "NOT " + cond
			}
			conds = append(conds, cond)
		}
	}
	add("t", queryWords(include), false)
	add("x", queryWords(exclude), true)
	from := ` FROM ` + s.table + ` c LEFT JOIN ` + s.partyTable + ` pa ON pa.id = c.` + s.partyField +
		` WHERE ` + strings.Join(conds, " AND ")
	return from, params
}

// queryWords splits the query's parts into words, as the FTS match of the
// other sources does.
func queryWords(parts []string) []string {
	return strings.Fields(strings.Join(parts, " "))
}

// searchSalesDocs counts every hit of one sales document kind and returns the
// first window of them, newest first, as entries are ordered. The title is
// "Invoice 1003 · Customer" / "Draft sales receipt · Customer" / "Bill 1003 ·
// Vendor" / "Expense 1004 · Vendor", with no "· <party>" when the document has
// none. The caller has checked that the include words leave FTS5 a term, so
// the WHERE is never empty.
func searchSalesDocs(ctx context.Context, app core.App, s salesDocSearch, include, exclude []string, window int) ([]search.Row, int, error) {
	from, params := s.from(include, exclude)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*)" + from).WithContext(ctx).
		Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count %s hits: %w", s.table, err)
	}
	params["window"] = window
	var hits []salesDocHit
	if err := app.DB().NewQuery("SELECT c.id, c.number, c." + s.subtitleColumn() + " AS memo, c.date, c.status, " +
		s.partyColumns() + from + " ORDER BY c.date DESC, c.id LIMIT {:window}").
		WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search %s: %w", s.table, err)
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		title := entryHitTitle(entryHit{Number: h.Number, Status: h.Status, DocType: s.docType})
		party := s.partyTitle(h)
		if party != "" && (h.Number != "" || !s.draftNamesNoParty) {
			title += " · " + party
		}
		rows = append(rows, search.Row{
			ID:       s.kind + ":" + h.ID,
			Title:    title,
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": s.kind, "status": h.Status},
		})
	}
	return rows, total, nil
}

func entryHitTitle(h entryHit) string {
	noun, _, draft := entryNouns(h.DocType)
	switch {
	case h.Number == "":
		return draft
	case h.Status == statusVoid:
		return noun + " " + h.Number + " (void)"
	}
	return noun + " " + h.Number
}

func page(rows []search.Row, offset, limit int) []search.Row {
	if offset >= len(rows) {
		return nil
	}
	end := min(offset+limit, len(rows))
	return rows[offset:end]
}
