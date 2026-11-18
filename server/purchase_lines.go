package books

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The line checks the purchase documents share (a bill, an expense, a vendor
// credit): two line
// tables, account lines (row kind account, a typed amount) and product lines
// (row kind item, Qty x Rate), named "Account line n" and "Product line n".

// The keys of the two purchase line tables on each purchase host
// (tinycld/books/forms/hosts.ts).
const (
	purchaseAccountLinesKey = "account_lines"
	purchaseItemLinesKey    = "item_lines"
)

// Refusal texts of the purchase lines. The kinds' clients show them too, with
// the same words (BILL_MESSAGES, EXPENSE_MESSAGES, lib/document-texts.ts).
// msgPurchaseProductInactive repeats the words of the shared
// msgLineProductInactive, which the line guard refuses with.
const (
	msgPurchaseAccountInactive     = "Account line %d: %s is inactive. Choose an active account."
	msgPurchaseAccountNotExpense   = "Account line %d: %s is not an expense account. Choose an expense or cost of goods account."
	msgPurchaseProductInactive     = "Product line %d: %s is inactive. Choose an active product or service."
	msgPurchaseProductNotPurchased = "Product line %d: %s is not purchased. Turn on “I purchase this” for it first."
	msgPurchaseAccountAmountZero   = "Account line %d: Enter an amount other than 0."
)

// Go-only refusal texts of the purchase lines.
const (
	msgPurchaseAccountLineCells   = "%s: An account line has no product, quantity or rate."
	msgPurchaseProductLineAccount = "%s: A product line has no account."
)

// purchaseAccountTypes are the account types an account line may charge: the
// expense types. The client's Account picker lists the same types
// (PURCHASE_ACCOUNT_TYPES).
var purchaseAccountTypes = map[string]bool{"expense": true, "other_expense": true, "cost_of_goods_sold": true}

// purchaseLineRowLabels names a purchase document's line by its kind, numbered
// among the lines of that kind (salesDocKind.LineRowLabels).
var purchaseLineRowLabels = map[string]string{lineKindAccount: "Account line", lineKindItem: "Product line"}

// checkPurchaseAccountLine holds an account line, the nth of its document's
// account lines, to the rules of every save: an amount other than 0 (it may
// be negative), and an account of an expense type. An inactive account passes
// here and is refused at posting (checkPurchaseLinesToPost); an account that
// does not exist is the schema's refusal.
func checkPurchaseAccountLine(tx core.App, r *core.Record, n int) error {
	if r.GetInt("amount") == 0 {
		return refuse(msgPurchaseAccountAmountZero, n)
	}
	account, err := tx.FindRecordById("books_accounts", r.GetString("account"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the account of account line %d: %w", n, err)
	}
	if !purchaseAccountTypes[account.GetString("type")] {
		return refuseNamed(msgPurchaseAccountNotExpense, n, account.GetString("name"))
	}
	return nil
}

// checkVendorRef stores a purchase document's vendor's number (ref_no) trimmed
// and refuses one that another document of collection of the same vendor
// already has, unless that document is void or is the posted document this one
// corrects (the correction takes its place). An empty number never clashes.
// The refusal, under ref_no, is message with the vendor's name, the number and
// the other document: its noun and number (entryNouns of docType), or
// draftName while it has no number. It runs inside the header guard's
// transaction, so no other write commits between the check and the write.
func checkVendorRef(tx core.App, r *core.Record, collection, docType, draftName, message string) error {
	ref := strings.TrimSpace(r.GetString("ref_no"))
	r.Set("ref_no", ref)
	vendorID := r.GetString("vendor")
	if ref == "" || vendorID == "" {
		return nil
	}
	others, err := tx.FindRecordsByFilter(collection,
		"vendor = {:vendor} && ref_no = {:ref} && status != {:void} && id != {:id} && id != {:replaces}",
		"-sequence,id", 1, 0, dbx.Params{
			"vendor": vendorID, "ref": ref, "void": statusVoid, "id": r.Id, "replaces": r.GetString("replaces"),
		})
	if err != nil {
		return fmt.Errorf("books: read the vendor's %s: %w", collection, err)
	}
	if len(others) == 0 {
		return nil
	}
	vendor, err := tx.FindRecordById("books_vendors", vendorID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a vendor that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the vendor of a %s row: %w", collection, err)
	}
	other := draftName
	if n := others[0].GetString("number"); n != "" {
		noun, _, _ := entryNouns(docType)
		other = noun + " " + n
	}
	return refuseNamedField("ref_no", message, vendor.GetString("display_name"), ref, other)
}

// checkPurchaseLinesToPost refuses to post a purchase document of kind whose
// account line names an inactive account, or whose product line names an
// inactive product or one that is not purchased. It reads the lines of the
// kind's lines collection by its parent field. A line is numbered among the
// document's lines of its kind, in their order. The server accepts lines of
// both kinds on every purchase document: it does not read the Purchase lines
// setting.
func checkPurchaseLinesToPost(tx core.App, kind salesDocKind, doc *core.Record) error {
	lines, err := docLineRecords(tx, kind.LinesCollection, kind.ParentField, doc.Id)
	if err != nil {
		return err
	}
	counts := map[string]int{}
	for _, line := range lines {
		lineKind := line.GetString("kind")
		counts[lineKind]++
		n := counts[lineKind]
		switch lineKind {
		case lineKindAccount:
			account, err := tx.FindRecordById("books_accounts", line.GetString("account"))
			if err != nil {
				return fmt.Errorf("books: read the account of account line %d: %w", n, err)
			}
			if account.GetBool("inactive") {
				return refuseNamed(msgPurchaseAccountInactive, n, account.GetString("name"))
			}
		case lineKindItem:
			product, err := tx.FindRecordById("books_products", line.GetString("product"))
			if err != nil {
				return fmt.Errorf("books: read the product of product line %d: %w", n, err)
			}
			if product.GetBool("inactive") {
				return refuseNamed(msgPurchaseProductInactive, n, product.GetString("name"))
			}
			if !product.GetBool("purchases") {
				return refuseNamed(msgPurchaseProductNotPurchased, n, product.GetString("name"))
			}
		}
	}
	return nil
}

// expenseByAccount is a purchase kind's LineAccounts: each account debited
// with the sum of the amounts charged to it (an account line's account; a
// product line's product's expense account, read now, so a change after the
// line was saved is the one posted), a sum below zero a credit and a zero sum
// no line, in chart order.
//
// A product line's expense account that is inactive is refused by the first
// product line that charges it, as incomeByAccount does for a sales kind; an
// account line's inactive account is refused before
// (checkPurchaseLinesToPost).
func expenseByAccount(tx core.App, lines []*core.Record, totals documentTotalsResult) ([]postingLine, error) {
	sums := map[string]int64{}
	firstLine := map[string]documentLineRef{}
	for i, line := range lines {
		if !totals.HasAmount[i] {
			continue
		}
		var account string
		switch line.GetString("kind") {
		case lineKindAccount:
			account = line.GetString("account")
		case lineKindItem:
			product, err := tx.FindRecordById("books_products", line.GetString("product"))
			if err != nil {
				return nil, fmt.Errorf("books: read the product of purchase line %d: %w", i+1, err)
			}
			// A purchased product requires an expense account (products.go), and
			// checkPurchaseLinesToPost refuses one that is not purchased.
			account = product.GetString("expense_account")
			if account == "" {
				return nil, fmt.Errorf("books: %s on purchase line %d has no expense account", product.GetString("name"), i+1)
			}
			if _, seen := firstLine[account]; !seen {
				firstLine[account] = documentLineRef{
					n:       i + 1,
					label:   lineRowLabel(salesDocKind{LineRowLabels: purchaseLineRowLabels}, lines, line),
					product: product.GetString("name"),
					msg:     msgLineExpenseAccountInactive,
				}
			}
		default:
			continue
		}
		sums[account] += totals.Amounts[i]
	}
	return accountSums(tx, sums, firstLine, func(id string, amount int64) postingLine {
		return signedLine(id, -amount)
	})
}
