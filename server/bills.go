package books

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The bill's forms host (tinycld/books/forms/hosts.ts) and its two line
// tables: account lines (row kind account, a typed amount) and product lines
// (row kind item, Qty x Rate).
const (
	billHostKey         = "books:bill"
	billAccountLinesKey = "account_lines"
	billItemLinesKey    = "item_lines"
	billLinesCollection = "books_bill_lines"
)

// docTypeBill is the doc type of a bill's sequence and of the entry it posts;
// entry_type_labels.json holds how a reader sees it.
const docTypeBill = "bill"

// Refusal texts of the bill guards. This group is shown by the client too,
// with the same words (BILL_MESSAGES, lib/document-texts.ts). PocketBase adds
// a final period to a text without one; these have theirs. The first %s of a
// party or line text is a name people typed, which refuseNamed and
// refuseNamedField keep as written. msgBillProductInactive repeats the words
// of the shared msgLineProductInactive, which the line guard refuses with, so
// this list holds every text the bill's client shows.
const (
	msgBillTotalNegative       = "A bill total cannot be below zero. Use a vendor credit."
	msgBillZeroTotal           = "A bill total must be more than zero to post."
	msgBillTotalTooLarge       = "The bill total is more than Books can store."
	msgBillTooManyLines        = "A bill holds at most 250 lines."
	msgVendorInactive          = "%s is inactive. Choose an active vendor."
	msgBillDueBeforeDate       = "Due date can't be before the bill date."
	msgBillDuplicateRef        = "%s already has bill no. %s (%s)."
	msgBillAccountInactive     = "Account line %d: %s is inactive. Choose an active account."
	msgBillAccountNotExpense   = "Account line %d: %s is not an expense account. Choose an expense or cost of goods account."
	msgBillProductInactive     = "Product line %d: %s is inactive. Choose an active product or service."
	msgBillProductNotPurchased = "Product line %d: %s is not purchased. Turn on “I purchase this” for it first."
	msgBillAccountAmountZero   = "Account line %d: Enter an amount other than 0."
	msgBillRevisionConflict    = "This bill changed after you opened it. Load it again, then review it before you save or post."
)

// Go-only refusal texts of the bill.
const (
	msgBillPostedFromForm     = "A draft bill is posted from the bill form."
	msgBillNotDraft           = "A posted or void bill cannot be changed."
	msgBillDeleteNotDraft     = "Only a draft bill can be deleted."
	msgBillLineStays          = "A line stays on its bill."
	msgBillLineNotDraft       = "Only the lines of a draft bill can change."
	msgBillLineRestating      = "Only a line's amount changes while Books restates its bill."
	msgBillLineUnknownKind    = "Line %d: a bill line is an account line or a product line."
	msgBillEditMissing        = "The bill being edited does not exist."
	msgBillAccountLineCells   = "%s: An account line has no product, quantity or rate."
	msgBillProductLineAccount = "%s: A product line has no account."
)

// billDraftName names, in a duplicate bill no. refusal, a bill that has no
// number yet.
const billDraftName = "a draft bill"

// billAccountTypes are the account types an account line may charge: the
// expense types. The client's Account picker lists the same types
// (BILL_ACCOUNT_TYPES).
var billAccountTypes = map[string]bool{"expense": true, "other_expense": true, "cost_of_goods_sold": true}

// billLineRowLabels names a bill's line by its kind, numbered among the lines
// of that kind (salesDocKind.LineRowLabels).
var billLineRowLabels = map[string]string{lineKindAccount: "Account line", lineKindItem: "Product line"}

// billKind is the bill as a purchase document of the shared layer: its party
// is the vendor, its lines are account lines and product lines, it has no
// sales tax, and posting credits Accounts payable (which posting creates when
// the chart has none, ensurePayables) for the total and debits each line's
// expense account (expenseByAccount).
var billKind = salesDocKind{
	DocType:            docTypeBill,
	Lifecycle:          lifecyclePosting,
	Collection:         "books_bills",
	LinesCollection:    billLinesCollection,
	TaxLinesCollection: "",
	ParentField:        "bill",
	HostKey:            billHostKey,
	LineTables:         []string{billAccountLinesKey, billItemLinesKey},
	LineRowLabels:      billLineRowLabels,
	Party:              partyVendor,
	PartyCollection:    "books_vendors",
	AddressField:       "mailing_address",
	CustomerRequired:   true,
	HasTax:             false,
	Msgs: salesDocMessages{
		TotalNegative:    msgBillTotalNegative,
		TotalTooLarge:    msgBillTotalTooLarge,
		TooManyLines:     msgBillTooManyLines,
		ZeroTotal:        msgBillZeroTotal,
		PostedFromForm:   msgBillPostedFromForm,
		NotDraft:         msgBillNotDraft,
		DeleteNotDraft:   msgBillDeleteNotDraft,
		LineStays:        msgBillLineStays,
		LineNotDraft:     msgBillLineNotDraft,
		LineRestating:    msgBillLineRestating,
		LineUnknownKind:  msgBillLineUnknownKind,
		EditMissing:      msgBillEditMissing,
		PartyInactive:    msgVendorInactive,
		RevisionConflict: msgBillRevisionConflict,
	},
	CheckHeader: checkBillHeader,
	BeforePost:  checkBillLinesToPost,
	CreditAccount: func(tx core.App, _ *core.Record) (string, error) {
		payable, err := ensurePayables(tx)
		if err != nil {
			return "", err
		}
		return payable.Id, nil
	},
	LineAccounts: expenseByAccount,
}

// checkBillHeader is the bill's own header guard on a draft write: the bill
// date and the due date are real days, the due date is not before the bill
// date, and no other bill of the vendor has its vendor's bill no.
func checkBillHeader(tx core.App, _, r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseField("date", msgDocumentDay)
	}
	due, err := parseDay(r.GetString("due_date"))
	if err != nil {
		return refuseField("due_date", msgDocumentDay)
	}
	if due.Before(date) {
		return refuseField("due_date", msgBillDueBeforeDate)
	}
	return checkBillRef(tx, r)
}

// checkBillRef stores the vendor's bill no. trimmed and refuses one that
// another bill of the same vendor already has, unless that bill is void or is
// the posted bill this one corrects (the correction takes its place). An empty
// number never clashes. It runs inside the header guard's transaction, so no
// other write commits between the check and the write.
func checkBillRef(tx core.App, r *core.Record) error {
	ref := strings.TrimSpace(r.GetString("ref_no"))
	r.Set("ref_no", ref)
	vendorID := r.GetString("vendor")
	if ref == "" || vendorID == "" {
		return nil
	}
	others, err := tx.FindRecordsByFilter("books_bills",
		"vendor = {:vendor} && ref_no = {:ref} && status != {:void} && id != {:id} && id != {:replaces}",
		"-sequence,id", 1, 0, dbx.Params{
			"vendor": vendorID, "ref": ref, "void": statusVoid, "id": r.Id, "replaces": r.GetString("replaces"),
		})
	if err != nil {
		return fmt.Errorf("books: read the vendor's bills: %w", err)
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
		return fmt.Errorf("books: read the bill's vendor: %w", err)
	}
	other := billDraftName
	if n := others[0].GetString("number"); n != "" {
		noun, _, _ := entryNouns(docTypeBill)
		other = noun + " " + n
	}
	return refuseNamedField("ref_no", msgBillDuplicateRef, vendor.GetString("display_name"), ref, other)
}

// checkBillAccountLine holds an account line, the nth of its bill's account
// lines, to the rules of every save: an amount other than 0 (it may be
// negative), and an account of an expense type. An inactive account passes
// here and is refused at posting (checkBillLinesToPost); an account that does
// not exist is the schema's refusal.
func checkBillAccountLine(tx core.App, r *core.Record, n int) error {
	if r.GetInt("amount") == 0 {
		return refuse(msgBillAccountAmountZero, n)
	}
	account, err := tx.FindRecordById("books_accounts", r.GetString("account"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the account of account line %d: %w", n, err)
	}
	if !billAccountTypes[account.GetString("type")] {
		return refuseNamed(msgBillAccountNotExpense, n, account.GetString("name"))
	}
	return nil
}

// checkBillLinesToPost refuses to post a bill whose account line names an
// inactive account, or whose product line names an inactive product or one
// that is not purchased. A line is numbered among the bill's lines of its
// kind, in their order. The server accepts lines of both kinds on every bill:
// it does not read the Bill lines setting.
func checkBillLinesToPost(tx core.App, doc *core.Record) error {
	lines, err := docLineRecords(tx, billLinesCollection, "bill", doc.Id)
	if err != nil {
		return err
	}
	counts := map[string]int{}
	for _, line := range lines {
		kind := line.GetString("kind")
		counts[kind]++
		n := counts[kind]
		switch kind {
		case lineKindAccount:
			account, err := tx.FindRecordById("books_accounts", line.GetString("account"))
			if err != nil {
				return fmt.Errorf("books: read the account of account line %d: %w", n, err)
			}
			if account.GetBool("inactive") {
				return refuseNamed(msgBillAccountInactive, n, account.GetString("name"))
			}
		case lineKindItem:
			product, err := tx.FindRecordById("books_products", line.GetString("product"))
			if err != nil {
				return fmt.Errorf("books: read the product of product line %d: %w", n, err)
			}
			if product.GetBool("inactive") {
				return refuseNamed(msgBillProductInactive, n, product.GetString("name"))
			}
			if !product.GetBool("purchases") {
				return refuseNamed(msgBillProductNotPurchased, n, product.GetString("name"))
			}
		}
	}
	return nil
}

// expenseByAccount is the bill's LineAccounts: each account debited with the
// sum of the amounts charged to it (an account line's account; a product
// line's product's expense account, read now, so a change after the line was
// saved is the one posted), a sum below zero a credit and a zero sum no line,
// in chart order.
//
// A product line's expense account that is inactive is refused by the first
// product line that charges it, as incomeByAccount does for a sales kind; an
// account line's inactive account is refused before (checkBillLinesToPost).
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
				return nil, fmt.Errorf("books: read the product of bill line %d: %w", i+1, err)
			}
			// A purchased product requires an expense account (products.go), and
			// checkBillLinesToPost refuses one that is not purchased.
			account = product.GetString("expense_account")
			if account == "" {
				return nil, fmt.Errorf("books: %s on bill line %d has no expense account", product.GetString("name"), i+1)
			}
			if _, seen := firstLine[account]; !seen {
				firstLine[account] = documentLineRef{
					n:       i + 1,
					label:   lineRowLabel(salesDocKind{LineRowLabels: billLineRowLabels}, lines, line),
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
