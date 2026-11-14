package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Go-only refusal texts of posting, voiding and correcting a sales document.
// %s is the document's name (salesDocName).
const (
	msgSalesDocCannotGo      = "%s cannot go from %s to %s."
	msgSalesDocEditNotPosted = "%s is %s and cannot be edited."
	msgSalesDocNoEntry       = "%s has no journal entry."
	msgLineNoIncomeAccount   = "%s: %s has no income account. Choose one on the product or service."
	// The first %s is the document's line (lineRowLabel) and the second its
	// product: the journal line guard would number the entry's own line, which
	// the person never sees.
	msgLineIncomeAccountInactive  = "%s: the income account of %s is inactive. Choose an active one on the product or service."
	msgLineExpenseAccountInactive = "%s: the expense account of %s is inactive. Choose an active one on the product or service."
	msgTaxAgencyNoAccount         = "%s has no liability account. Choose one on the tax agency."
	msgTaxComponentNoAgency       = "%s has no tax agency. Choose one on the tax rate."
)

// markReplacing marks the posted document a correction is replacing, so its
// own update hook lets Books set it void with replaced_by while its entry is
// already voided by the correction's post (voidReplaced). The returned func
// clears the mark, which belongs to the posting transaction (txmarks.go).
func markReplacing(tx core.App, kind salesDocKind, docID string) func() {
	return setTxMark(tx, docMark(kind, "replacing"), docID)
}

func isReplacing(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "replacing"), docID)
}

// salesDocName is how a refusal names a document: "Invoice 1001", "Sales
// receipt 1001", or "This invoice" while it has no number.
func salesDocName(kind salesDocKind, r *core.Record) string {
	noun, this, _ := entryNouns(kind.DocType)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return this
}

// postSalesDoc posts a draft document while its update moves it from draft to
// posted, inside the update's transaction: any refusal rolls back every row
// it wrote (an account the kind's debit or credit creates, the tax lines, the
// entry, the number). The header guards have already run on doc. It refuses
// an inactive party (a correction keeps its original's), runs the kind's
// BeforePost, a stored line its kind does not allow and a zero total, writes
// the tax snapshot of a kind with tax, posts the journal entry through
// postDocument (the kind's debit or credit account for the total, its line
// accounts on the other side, every line naming the party), and copies the
// entry's number. A correction voids its original.
func postSalesDoc(tx core.App, kind salesDocKind, doc *core.Record, now time.Time) error {
	original, err := correctedSalesDoc(tx, kind, doc)
	if err != nil {
		return err
	}
	if err := checkPostParty(tx, kind, doc); err != nil {
		return err
	}
	if kind.BeforePost != nil {
		if err := kind.BeforePost(tx, doc); err != nil {
			return err
		}
	}
	lines, err := salesDocLines(tx, kind, doc.Id)
	if err != nil {
		return err
	}
	if err := checkStoredLines(tx, kind, lines); err != nil {
		return err
	}
	totals, err := salesDocTotals(tx, kind, doc, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkSalesDocTotals(kind, lines, totals); err != nil {
		return err
	}
	if totals.Total == 0 {
		return refuse("%s", kind.Msgs.ZeroTotal)
	}
	if err := restateLineAmounts(tx, kind, doc.Id, lines, totals); err != nil {
		return err
	}
	setSalesDocTotals(kind, doc, totals)

	var taxes []componentTax
	if kind.HasTax {
		taxes, err = componentTaxes(tx, totals)
		if err != nil {
			return err
		}
	}
	postingLines, err := salesDocPostingLines(tx, kind, doc, lines, totals, taxes)
	if err != nil {
		return err
	}
	if kind.HasTax {
		if err := writeTaxSnapshot(tx, kind, doc, totals, taxes); err != nil {
			return err
		}
	}
	actor := doc.GetString("posted_by")
	post := documentPost{
		DocType:    kind.DocType,
		DocumentID: doc.Id,
		Date:       doc.GetString("date"),
		Memo:       doc.GetString("memo"),
		Actor:      actor,
		Lines:      postingLines,
	}
	switch kind.Party {
	case partyCustomer:
		post.Customer = doc.GetString(kind.Party)
	case partyVendor:
		post.Vendor = doc.GetString(kind.Party)
	}
	if original != nil {
		post.Replaces = original.GetString("entry")
	}
	entry, err := postDocument(tx, post)
	if err != nil {
		return err
	}
	doc.Set("number", entry.GetString("number"))
	doc.Set("sequence", entry.GetInt("sequence"))
	doc.Set("entry", entry.Id)
	doc.Set("posted_at", now)
	doc.Set("sort_key", salesDocSortKey(doc))
	if original == nil {
		return nil
	}
	return voidReplacedSalesDoc(tx, kind, original, doc, actor, now)
}

// correctedSalesDoc is the posted document a correction replaces, nil for a
// document that replaces none. Only a posted document with its entry can be
// corrected: a void one is already replaced or voided.
func correctedSalesDoc(tx core.App, kind salesDocKind, doc *core.Record) (*core.Record, error) {
	id := doc.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(kind.Collection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse("%s", kind.Msgs.EditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the document being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgSalesDocEditNotPosted, salesDocName(kind, original), original.GetString("status"))
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgSalesDocNoEntry, salesDocName(kind, original))
	}
	return original, nil
}

// checkPostParty refuses to post for an inactive party (customer or vendor),
// under its field, before the journal line guard would refuse the entry's
// lines with no field (Q23); an invoice made from an estimate with the
// estimate's text. A correction keeps its original's party. A document with no
// party (a sales receipt may have no customer) has nothing to check.
func checkPostParty(tx core.App, kind salesDocKind, doc *core.Record) error {
	id := doc.GetString(kind.Party)
	if id == "" {
		return nil
	}
	party, err := tx.FindRecordById(kind.PartyCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a party that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the document's %s: %w", kind.Party, err)
	}
	if !party.GetBool("inactive") {
		return nil
	}
	keeps, err := keepsCorrectedParty(tx, kind, doc, id)
	if err != nil || keeps {
		return err
	}
	// An invoice made from an estimate cannot change its customer, so "Choose an
	// active customer" would be a dead end there (plan decision E1). Only an
	// invoice has an estimate.
	if doc.GetString("estimate") != "" {
		return refuseNamedField(kind.Party, msgEstimateCustomerInactive, party.GetString("display_name"))
	}
	return refuseNamedField(kind.Party, kind.Msgs.PartyInactive, party.GetString("display_name"))
}

// keepsCorrectedParty reports whether doc corrects a document of the party id:
// the user did not choose that party again, so it may be inactive.
func keepsCorrectedParty(tx core.App, kind salesDocKind, doc *core.Record, id string) (bool, error) {
	replaces := doc.GetString("replaces")
	if replaces == "" {
		return false, nil
	}
	original, err := tx.FindRecordById(kind.Collection, replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("books: read the document being edited: %w", err)
	}
	return original.GetString(kind.Party) == id, nil
}

// checkStoredLines holds every stored line to its kind with the line guard's
// rules (a kind no line table holds is refused), so the entry is never built
// from a line the guard would refuse (one written past it). A bundle on a
// line is refused when the line accounts read its product.
func checkStoredLines(tx core.App, kind salesDocKind, lines []*core.Record) error {
	for _, line := range lines {
		if err := checkLineCells(tx, kind, line, lineRowPlace(kind, lines, line)); err != nil {
			return err
		}
	}
	return nil
}

// restateLineAmounts writes each line's computed amount where the stored one
// differs, so the stored lines match the entry they post. The line guard lets
// an amount through while the document is marked restating.
func restateLineAmounts(tx core.App, kind salesDocKind, docID string, lines []*core.Record, totals documentTotalsResult) error {
	done := markRestating(tx, kind, docID)
	defer done()
	for i, line := range lines {
		if int64(line.GetInt("amount")) == totals.Amounts[i] {
			continue
		}
		line.Set("amount", totals.Amounts[i])
		if err := tx.Save(line); err != nil {
			return err
		}
	}
	return nil
}

// componentTax is one tax component of the header rate with the agency it is
// owed to and that agency's liability account.
type componentTax struct {
	documentTaxLine
	agency, account string
}

func componentTaxes(tx core.App, totals documentTotalsResult) ([]componentTax, error) {
	out := make([]componentTax, len(totals.TaxLines))
	for i, tl := range totals.TaxLines {
		rate, err := tx.FindRecordById("books_tax_rates", tl.ComponentID)
		if err != nil {
			return nil, fmt.Errorf("books: read the tax rate of the document: %w", err)
		}
		if rate.GetString("agency") == "" {
			return nil, refuseNamed(msgTaxComponentNoAgency, rate.GetString("name"))
		}
		agency, err := tx.FindRecordById("books_tax_agencies", rate.GetString("agency"))
		if err != nil {
			return nil, fmt.Errorf("books: read the tax agency of %s: %w", rate.GetString("name"), err)
		}
		if agency.GetString("account") == "" {
			return nil, refuseNamed(msgTaxAgencyNoAccount, agency.GetString("name"))
		}
		out[i] = componentTax{documentTaxLine: tl, agency: agency.Id, account: agency.GetString("account")}
	}
	return out, nil
}

// salesDocPostingLines are the entry's lines: first the total, on the kind's
// debit account (an invoice's Accounts receivable, a sales receipt's Deposit
// to) or its credit account (a bill's Accounts payable); then the kind's line
// accounts on the other side (incomeByAccount: each income account credited
// with the sum of the item and percent amounts of the products that name it;
// a bill's expenseByAccount), in chart order; then each tax component
// credited to its agency's liability account, in the rate's order (a zero tax
// no line).
func salesDocPostingLines(tx core.App, kind salesDocKind, doc *core.Record, lines []*core.Record, totals documentTotalsResult, taxes []componentTax) ([]postingLine, error) {
	var out []postingLine
	if kind.CreditAccount != nil {
		credit, err := kind.CreditAccount(tx, doc)
		if err != nil {
			return nil, err
		}
		out = append(out, postingLine{Account: credit, Credit: totals.Total})
	} else {
		debit, err := kind.DebitAccount(tx, doc)
		if err != nil {
			return nil, err
		}
		out = append(out, postingLine{Account: debit, Debit: totals.Total})
	}

	lineAccounts := kind.LineAccounts
	if lineAccounts == nil {
		lineAccounts = incomeByAccount
	}
	accounts, err := lineAccounts(tx, lines, totals)
	if err != nil {
		return nil, err
	}
	out = append(out, accounts...)
	for _, t := range taxes {
		if t.Amount != 0 {
			out = append(out, signedLine(t.account, t.Amount))
		}
	}
	return out, nil
}

// signedLine credits a positive amount and debits a negative one.
func signedLine(account string, amount int64) postingLine {
	if amount < 0 {
		return postingLine{Account: account, Debit: -amount}
	}
	return postingLine{Account: account, Credit: amount}
}

// documentLineRef is the first document line that charges an account, as a
// refusal of that account names it: its place among the document's lines (for
// order), its label, its product's name and the refusal's text.
type documentLineRef struct {
	n              int
	label, product string
	msg            string
}

// incomeByAccount is a sales kind's LineAccounts: each income account
// credited with the sum of the item and percent amounts of the products that
// name it (a sum below zero is a debit, a zero sum no line), in chart order.
// Its lines are numbered across the document ("Line 3"). It refuses a line
// whose product has no income account, and the first line of an income
// account that is inactive and takes an amount (a product keeps an account
// that became inactive after it was saved, so the post is where it stops).
func incomeByAccount(tx core.App, lines []*core.Record, totals documentTotalsResult) ([]postingLine, error) {
	sums := map[string]int64{}
	firstLine := map[string]documentLineRef{}
	for i, line := range lines {
		if !totals.HasAmount[i] {
			continue
		}
		kind := line.GetString("kind")
		if kind != lineKindItem && kind != lineKindPercent {
			continue
		}
		label := fmt.Sprintf("Line %d", i+1)
		product, err := tx.FindRecordById("books_products", line.GetString("product"))
		if err != nil {
			return nil, fmt.Errorf("books: read the product of line %d: %w", i+1, err)
		}
		if product.GetString("type") == "bundle" {
			return nil, refuse(msgLineBundle, label)
		}
		account := product.GetString("income_account")
		if account == "" {
			return nil, refuseNamed(msgLineNoIncomeAccount, label, product.GetString("name"))
		}
		sums[account] += totals.Amounts[i]
		if _, seen := firstLine[account]; !seen {
			firstLine[account] = documentLineRef{
				n: i + 1, label: label, product: product.GetString("name"), msg: msgLineIncomeAccountInactive,
			}
		}
	}
	return accountSums(tx, sums, firstLine, signedLine)
}

// accountSums turns the sums per account into one line per account whose sum
// is not zero, in chart order; line puts each sum on its side. An inactive
// account with a sum is refused by the lowest line firstLine names for it; an
// account firstLine does not name is left to the journal line guard.
func accountSums(tx core.App, sums map[string]int64, firstLine map[string]documentLineRef, line func(id string, amount int64) postingLine) ([]postingLine, error) {
	type summed struct {
		id, number string
		amount     int64
	}
	accounts := make([]summed, 0, len(sums))
	// The lowest line of an inactive account: the map's order is not the lines'.
	var inactive *documentLineRef
	for id, amount := range sums {
		if amount == 0 {
			continue
		}
		account, err := tx.FindRecordById("books_accounts", id)
		if err != nil {
			return nil, fmt.Errorf("books: read an account of the document's lines: %w", err)
		}
		if ref, named := firstLine[id]; named && account.GetBool("inactive") {
			if inactive == nil || ref.n < inactive.n {
				inactive = &ref
			}
			continue
		}
		accounts = append(accounts, summed{id: id, number: account.GetString("number"), amount: amount})
	}
	if inactive != nil {
		return nil, refuseNamed(inactive.msg, inactive.label, inactive.product)
	}
	slices.SortFunc(accounts, func(a, b summed) int {
		return compareChartOrder(a.number, a.id, b.number, b.id)
	})
	out := make([]postingLine, len(accounts))
	for i, a := range accounts {
		out[i] = line(a.id, a.amount)
	}
	return out, nil
}

// writeTaxSnapshot stores the posted tax of each component of the header rate
// (the tax-rates contract): a later change to a rate never changes what a
// posted document charged.
func writeTaxSnapshot(tx core.App, kind salesDocKind, doc *core.Record, totals documentTotalsResult, taxes []componentTax) error {
	defer markSnapshotting(tx, kind, doc.Id)()
	col, err := tx.FindCachedCollectionByNameOrId(kind.TaxLinesCollection)
	if err != nil {
		return err
	}
	for i, t := range taxes {
		r := core.NewRecord(col)
		r.Set(kind.ParentField, doc.Id)
		r.Set("rate", doc.GetString("tax_rate"))
		r.Set("component", t.ComponentID)
		r.Set("agency", t.agency)
		r.Set("rate_ppm", t.Ppm)
		r.Set("taxable_amount", totals.TaxableTotal)
		r.Set("amount", t.Amount)
		r.Set("position", i)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write the document's tax line: %w", err)
		}
	}
	return nil
}

// voidReplacedSalesDoc sets the original of a posted correction void with
// replaced_by. Its entry is already void: the correction's entry replaced it.
// The kind's Replace then hands on what the original held (an invoice's
// estimate).
func voidReplacedSalesDoc(tx core.App, kind salesDocKind, original, correction *core.Record, actor string, now time.Time) error {
	done := markReplacing(tx, kind, original.Id)
	defer done()
	fresh, err := tx.FindRecordById(kind.Collection, original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correction.Id)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	if err := tx.Save(fresh); err != nil {
		return err
	}
	if kind.Replace == nil {
		return nil
	}
	return kind.Replace(tx, fresh, correction)
}

// voidSalesDoc voids a posted document's entry while the document moves from
// posted to void, inside the update's transaction: the entry's own hook posts
// the void reversal in the original period under the same number (voidEntry),
// and the close date applies to it as to any post. The kind's Withdraw then
// undoes what the document held (an invoice reopens its estimate).
func voidSalesDoc(tx core.App, kind salesDocKind, doc *core.Record, now time.Time) error {
	entryID := doc.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, salesDocName(kind, doc))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the document's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", doc.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	doc.Set("voided_at", now)
	if kind.Withdraw == nil {
		return nil
	}
	return kind.Withdraw(tx, doc)
}
