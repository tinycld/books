package books

import (
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// docTypeInventoryAdjustment is the doc type of an inventory adjustment's
// sequence and of the entry it posts; entry_type_labels.json holds how a
// reader sees it.
const docTypeInventoryAdjustment = "inventory_adjustment"

const (
	inventoryAdjustmentsCollection     = "books_inventory_adjustments"
	inventoryAdjustmentLinesCollection = "books_inventory_adjustment_lines"
)

// inventoryAdjustmentName names an adjustment by its number: "Inventory
// adjustment IA-3". A draft has no number: "Draft inventory adjustment".
func inventoryAdjustmentName(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeInventoryAdjustment)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// The kinds of an inventory adjustment. A person makes a manual one; Books
// makes the other two itself: an item's opening stock, and the change of what
// a posted document's stock cost after a replay (ADR 3).
const (
	adjustmentKindManual  = "manual"
	adjustmentKindOpening = "opening"
	adjustmentKindRecost  = "recost"
)

// markSystemAdjustment marks an adjustment while Books writes it and its lines
// itself (txmarks.go): the guards let those writes through.
const markSystemAdjustment = "books.adjustment.system"

// Refusal texts of an adjustment's post. The post names a line's fault by the
// line's place, from 1 ("Line 2: Enter a quantity change, ...").
const (
	msgAdjustmentNoLines       = "Add a line to the inventory adjustment."
	msgAdjustmentLineFault     = "Line %d: %s"
	msgAdjustmentLineEmpty     = "Enter a quantity change, a value change, or both."
	msgAdjustmentDecreaseValue = "A quantity decrease takes its cost from the costing method. Enter the value change on a line of its own."
	msgAdjustmentIncreaseValue = "A quantity increase cannot have a value below 0."
	msgAdjustmentAccountLedger = "Choose an adjustment account other than Accounts receivable or Accounts payable."
	msgAdjustmentAccountOff    = "%s is inactive. Choose an active adjustment account."
	msgAdjustmentAccountAsset  = "Choose an adjustment account other than the inventory asset account of %s."

	msgAdjustmentOpeningNegative = "An opening quantity cannot be below 0."
)

// adjustmentLineFault is why Books cannot cost a line with the quantity change
// qty (hundredths) and the value change value (cents), or "" when it can: a
// line with neither, a decrease with a value, an increase with a value below 0.
func adjustmentLineFault(qty, value int64) string {
	switch {
	case qty == 0 && value == 0:
		return msgAdjustmentLineEmpty
	case qty < 0 && value != 0:
		return msgAdjustmentDecreaseValue
	case qty > 0 && value < 0:
		return msgAdjustmentIncreaseValue
	}
	return ""
}

// adjustmentLineInput is one line of an adjustment Books makes: a signed
// quantity change and a signed value change in cents, either of which may be 0.
type adjustmentLineInput struct {
	Product  string
	Quantity float64
	Value    int64
}

// systemAdjustment is an adjustment Books makes itself. Source and Document
// name what it is for: the product of an opening adjustment, the posted
// document of a re-cost. Account is the adjustment account; "" takes the
// kind's own (adjustmentAccount). A re-cost has none: its lines post to the
// accounts of the stock moves it re-costs.
type systemAdjustment struct {
	Kind, Date, Actor, Source, Document, Account, Memo string
	Lines                                              []adjustmentLineInput
}

// newSystemAdjustment writes an adjustment with its lines and posts it as
// a.Actor, in the caller's transaction. The guards let the rows through under
// markSystemAdjustment; the posting is the one a person's post takes.
func newSystemAdjustment(tx core.App, a systemAdjustment) (*core.Record, error) {
	col, err := tx.FindCachedCollectionByNameOrId(inventoryAdjustmentsCollection)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	ensureRecordID(r)
	defer setTxMark(tx, markSystemAdjustment, r.Id)()
	r.Set("status", statusDraft)
	r.Set("kind", a.Kind)
	r.Set("date", a.Date)
	r.Set("account", a.Account)
	r.Set("memo", a.Memo)
	r.Set("source", a.Source)
	r.Set("document", a.Document)
	if err := stampCurrency(tx, r); err != nil {
		return nil, err
	}
	if err := tx.Save(r); err != nil {
		return nil, fmt.Errorf("books: write an inventory adjustment: %w", err)
	}
	lines, err := tx.FindCachedCollectionByNameOrId(inventoryAdjustmentLinesCollection)
	if err != nil {
		return nil, err
	}
	for i, l := range a.Lines {
		line := core.NewRecord(lines)
		line.Set("adjustment", r.Id)
		line.Set("product", l.Product)
		line.Set("quantity", l.Quantity)
		line.Set("value", l.Value)
		line.Set("position", i)
		if err := tx.Save(line); err != nil {
			return nil, fmt.Errorf("books: write an inventory adjustment line: %w", err)
		}
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", a.Actor)
	if err := postInventoryAdjustment(tx, r, time.Now()); err != nil {
		return nil, err
	}
	if err := tx.Save(r); err != nil {
		return nil, fmt.Errorf("books: post an inventory adjustment: %w", err)
	}
	return r, nil
}

// postInventoryAdjustment posts adjustment r, whose lines are stored, while it
// moves from draft to posted, inside the caller's transaction. It turns the
// lines into stock moves (adjustmentStockInputs) against the adjustment
// account and posts their value.
// The entry posts through postDocument, so postEntry runs every ledger rule
// (the close date among them) and numbers it from the inventory adjustment
// sequence. An adjustment whose value is 0 (a quantity at no cost) posts no
// entry and takes its number from the sequence itself.
func postInventoryAdjustment(tx core.App, r *core.Record, now time.Time) error {
	lines, err := docLineRecords(tx, inventoryAdjustmentLinesCollection, "adjustment", r.Id)
	if err != nil {
		return err
	}
	if len(lines) == 0 {
		return refuse(msgAdjustmentNoLines)
	}
	actor := r.GetString("posted_by")
	account, err := adjustmentAccount(tx, r)
	if err != nil {
		return err
	}
	inputs, err := adjustmentStockInputs(tx, r, lines, account)
	if err != nil {
		return err
	}
	moves, err := postDocumentStock(tx, actor, inventoryAdjustmentsCollection, r.Id, "", inputs)
	if err != nil {
		return err
	}
	posting := stockCostLines(moves)
	if len(posting) == 0 {
		if err := checkAdjustmentDay(tx, actor, r.GetString("date"), now); err != nil {
			return err
		}
		seq, number, err := allocateNumber(tx, docTypeInventoryAdjustment)
		if err != nil {
			return err
		}
		r.Set("number", number)
		r.Set("sequence", seq)
	} else {
		entry, err := postDocument(tx, documentPost{
			DocType: docTypeInventoryAdjustment, DocumentID: r.Id, Date: r.GetString("date"),
			Memo: r.GetString("memo"), Actor: actor, Lines: posting,
		})
		if err != nil {
			return err
		}
		r.Set("number", entry.GetString("number"))
		r.Set("sequence", entry.GetInt("sequence"))
		r.Set("entry", entry.Id)
	}
	r.Set("posted_at", now)
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// checkAdjustmentDay holds an adjustment that has no journal entry to the
// close date, which postEntry checks for one that has: a quantity at no cost
// still changes the stock of its day.
func checkAdjustmentDay(tx core.App, actor, day string, now time.Time) error {
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	_, closed, err := closeOverrideFor(tx, s, actor, day, now)
	if err != nil {
		return err
	}
	if closed {
		return refuseField("date", msgClosedThrough, s.CloseDate, day)
	}
	return nil
}

// adjustmentAccount is the id of the account r posts against, checked: its
// own when it names one (active, and not Accounts receivable or Accounts
// payable, whose lines need a party), else the kind's, which r then names:
// Opening balance equity for an opening adjustment, Inventory shrinkage for
// any other.
func adjustmentAccount(tx core.App, r *core.Record) (string, error) {
	if id := r.GetString("account"); id != "" {
		account, err := tx.FindRecordById("books_accounts", id)
		if err != nil {
			return "", fmt.Errorf("books: read the adjustment account: %w", err)
		}
		switch account.GetString("type") {
		case "accounts_receivable", "accounts_payable":
			return "", refuseField("account", msgAdjustmentAccountLedger)
		}
		if account.GetBool("inactive") {
			return "", refuseNamedField("account", msgAdjustmentAccountOff, accountDisplayName(account))
		}
		return id, nil
	}
	ensure := ensureInventoryShrinkage
	if r.GetString("kind") == adjustmentKindOpening {
		ensure = ensureOpeningBalanceEquity
	}
	account, err := ensure(tx)
	if err != nil {
		return "", err
	}
	r.Set("account", account.Id)
	return account.Id, nil
}

// adjustmentStockInputs turns the lines of r into stock moves against account.
// A quantity above 0 with a value above 0 comes in at that value, and with no
// value at the last known cost. A quantity below 0 goes out at the costing
// method's cost. A value with no quantity revalues the stock on hand. A line
// with neither, a decrease with a value and an increase with a value below 0
// are refused.
func adjustmentStockInputs(tx core.App, r *core.Record, lines []*core.Record, account string) ([]stockMoveInput, error) {
	kind := stockKindAdjustment
	if r.GetString("kind") == adjustmentKindOpening {
		kind = stockKindOpening
	}
	inputs := make([]stockMoveInput, 0, len(lines))
	for i, l := range lines {
		product, err := tx.FindRecordById("books_products", l.GetString("product"))
		if err != nil {
			return nil, fmt.Errorf("books: read the product of adjustment line %d: %w", i+1, err)
		}
		if product.GetString("type") != "inventory" {
			return nil, refuse(msgAdjustmentLineFault, i+1, fmt.Sprintf(msgStockNotInventory, product.GetString("name")))
		}
		asset, _, err := inventoryAccounts(tx, product)
		if err != nil {
			return nil, err
		}
		// A move whose two accounts are one posts no journal line: the stock
		// value would change and the ledger would not.
		if asset == account {
			return nil, refuseNamedField("account", msgAdjustmentAccountAsset, product.GetString("name"))
		}
		qty, value := qtyHundredths(l.GetFloat("quantity")), int64(l.GetInt("value"))
		in := stockMoveInput{
			Product: product.Id, Kind: kind, Source: inventoryAdjustmentsCollection, Document: r.Id, Line: l.Id,
			Date: r.GetString("date"), Qty: qty, AssetAccount: asset, OffsetAccount: account,
		}
		if fault := adjustmentLineFault(qty, value); fault != "" {
			return nil, refuse(msgAdjustmentLineFault, i+1, fault)
		}
		// A negative opening quantity would be Given at 0 as a removal, which
		// the costing cannot price.
		if kind == stockKindOpening && qty < 0 {
			return nil, refuse(msgAdjustmentLineFault, i+1, msgAdjustmentOpeningNegative)
		}
		// An opening quantity comes in at the value the item gives, 0 too.
		if qty == 0 || value > 0 || kind == stockKindOpening {
			in.Given, in.Value = true, value
		}
		inputs = append(inputs, in)
	}
	return inputs, nil
}

// voidInventoryAdjustment voids posted adjustment r while it moves to void,
// inside the caller's transaction: its entry is voided (the void reversal
// posts in the original period, so the close date applies), and its stock
// moves are withdrawn, which replays their products.
func voidInventoryAdjustment(tx core.App, r *core.Record, now time.Time) error {
	actor := r.GetString("voided_by")
	if id := r.GetString("entry"); id != "" {
		entry, err := tx.FindRecordById("books_journal_entries", id)
		if err != nil {
			return fmt.Errorf("books: read the adjustment's journal entry: %w", err)
		}
		entry.Set("status", statusVoid)
		entry.Set("voided_by", actor)
		if err := tx.Save(entry); err != nil {
			return err
		}
	} else if err := checkAdjustmentDay(tx, actor, r.GetString("date"), now); err != nil {
		return err
	}
	r.Set("voided_at", now)
	return withdrawDocumentStock(tx, actor, inventoryAdjustmentsCollection, r.Id)
}

// voidSystemAdjustment voids a posted adjustment Books made, as actor.
func voidSystemAdjustment(tx core.App, r *core.Record, actor string, now time.Time) error {
	defer setTxMark(tx, markSystemAdjustment, r.Id)()
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	if err := voidInventoryAdjustment(tx, r, now); err != nil {
		return err
	}
	if err := tx.Save(r); err != nil {
		return fmt.Errorf("books: void an inventory adjustment: %w", err)
	}
	return nil
}
