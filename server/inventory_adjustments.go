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

// markAdjustmentPostedValues marks an adjustment while its post writes the
// posted_value of its lines (writeLinePostedValues): the line guard lets those
// writes through. It is not markSystemAdjustment, whose clear would end the
// mark of newSystemAdjustment before it saves the adjustment.
const markAdjustmentPostedValues = "books.adjustment.posted_values"

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

	// A line's bin location (inventory-adjust spec §4): a line that changes no
	// quantity moves no stock, so it names no bin.
	msgAdjustmentValueHasNoBin = "A value change has no bin."

	// A correction's replaces (inventory-adjust spec §3.4). %s is the replaced
	// adjustment's name (inventoryAdjustmentName): "Inventory adjustment IA-3".
	msgAdjustmentNotReplaceable  = "%s is not a posted adjustment you made."
	msgAdjustmentCorrectedBefore = "%s was corrected before."
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

// adjustmentBinFault is why a line with the quantity change qty (hundredths)
// cannot move stock in the bin location bin ("" is No bin), or "" when it
// can: a line that changes no quantity names no bin, and a bin is active.
// bins holds the rows of the bins the lines name (recordsByID).
func adjustmentBinFault(bins map[string]*core.Record, bin string, qty int64) string {
	if bin == "" {
		return ""
	}
	if qty == 0 {
		return msgAdjustmentValueHasNoBin
	}
	row, err := recordOf(bins, bin)
	if err != nil {
		return msgBinMissing
	}
	if row.GetBool("inactive") {
		return fmt.Sprintf(msgBinInactive, row.GetString("name"))
	}
	return ""
}

// adjustmentLineInput is one line of an adjustment Books makes: a signed
// quantity change and a signed value change in cents, either of which may be 0.
// Bin is the line's bin location ("" is No bin); only an opening line names
// one (syncOpeningStock: the item's default bin of the save that posts it).
type adjustmentLineInput struct {
	Product  string
	Quantity float64
	Value    int64
	Bin      string
}

// systemAdjustment is an adjustment Books makes itself. Source and Document
// name what it is for: the product of an opening adjustment, the posted
// document of a re-cost. Account is the adjustment account; "" takes the
// kind's own (adjustmentAccount). A re-cost has none: its lines post to the
// accounts of the stock moves it re-costs.
type systemAdjustment struct {
	Kind, Date, Actor, Source, Document, Account, Memo string
	// Replaces is the id of the posted adjustment this one takes the place
	// of ("" for none). That one is voided, and its stock moves leave in the
	// replay that brings this one's in, so a document after them is re-costed
	// once, for the net change. Books made the re-post, so neither row names
	// the other: replaces and replaced_by link only a person's correction
	// (inventory-adjust spec §4).
	Replaces string
	Lines    []adjustmentLineInput
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
		line.Set("bin", l.Bin)
		line.Set("position", i)
		if err := tx.Save(line); err != nil {
			return nil, fmt.Errorf("books: write an inventory adjustment line: %w", err)
		}
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", a.Actor)
	if err := postAdjustmentReplacing(tx, r, a.Replaces, time.Now()); err != nil {
		return nil, err
	}
	if err := tx.Save(r); err != nil {
		return nil, fmt.Errorf("books: post an inventory adjustment: %w", err)
	}
	return r, nil
}

// postInventoryAdjustment posts adjustment r, whose lines are stored, while it
// moves from draft to posted, inside the caller's transaction. A manual or an
// opening adjustment turns its lines into stock moves (adjustmentStockInputs)
// against its adjustment account and posts their value; a re-cost posts what
// the ledger does not hold yet of its document's moves and writes no move.
// The entry posts through postDocument, so postEntry runs every ledger rule
// (the close date among them) and numbers it from the inventory adjustment
// sequence. An adjustment whose value is 0 (a quantity at no cost) posts no
// entry and takes its number from the sequence itself.
func postInventoryAdjustment(tx core.App, r *core.Record, now time.Time) error {
	return postAdjustmentReplacing(tx, r, "", now)
}

// postAdjustmentReplacing is postInventoryAdjustment for an adjustment that
// takes the place of the posted adjustment replaces ("" for none): that one
// is voided by r's poster (retireAdjustment), and its stock moves and re-costs
// go in the same replay (postDocumentStock). It names r in replaced_by only
// when r names it in replaces, a person's correction; a re-post Books makes
// (newSystemAdjustment) links neither. The post writes value_change, the sum
// of the values of r's own stock moves (of a re-cost: the drift it posts), and
// stamps r's number on them.
func postAdjustmentReplacing(tx core.App, r *core.Record, replaces string, now time.Time) error {
	lines, err := docLineRecords(tx, inventoryAdjustmentLinesCollection, "adjustment", r.Id)
	if err != nil {
		return err
	}
	if len(lines) == 0 {
		return refuse(msgAdjustmentNoLines)
	}
	// posted_by is the request's user (stampActor), or the poster a Go caller
	// or a superuser's request names: stampActor writes nothing for a
	// superuser, so the replaced adjustment is voided as the poster.
	actor := r.GetString("posted_by")
	if replaces != "" {
		by := ""
		if r.GetString("replaces") == replaces {
			by = r.Id
		}
		if err := retireAdjustment(tx, replaces, by, actor, now); err != nil {
			return err
		}
	}
	var posting []postingLine
	// The adjustment's own stock moves; a re-cost has none.
	var own []*core.Record
	// The value the post changes (value_change): the sum of own's values, or
	// for a re-cost the drift of the moves it re-costs, the amount its entry
	// posts on their asset accounts.
	var value int64
	if r.GetString("kind") == adjustmentKindRecost {
		moves, err := documentStockMoves(tx, r.GetString("source"), r.GetString("document"))
		if err != nil {
			return err
		}
		posting = stockDriftLines(moves)
		value = stockDrift(moves)
		if err := markStockPosted(tx, moves); err != nil {
			return err
		}
	} else {
		account, err := adjustmentAccount(tx, r)
		if err != nil {
			return err
		}
		inputs, err := adjustmentStockInputs(tx, r, lines, account)
		if err != nil {
			return err
		}
		own, err = postDocumentStock(tx, actor, inventoryAdjustmentsCollection, r.Id, replaces, r.GetString("date"), inputs)
		if err != nil {
			return err
		}
		posting = stockCostLines(own)
		for _, m := range own {
			value += int64(m.GetInt("value"))
		}
	}
	if len(posting) == 0 {
		if err := checkStockDay(tx, actor, r.GetString("date"), now); err != nil {
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
	if err := numberPostedMoves(tx, own, inventoryAdjustmentsCollection, r.Id, r.GetString("number")); err != nil {
		return err
	}
	if err := writeLinePostedValues(tx, r, lines, own); err != nil {
		return err
	}
	r.Set("value_change", value)
	r.Set("posted_at", now)
	r.Set("sort_key", salesDocSortKey(r))
	return nil
}

// writeLinePostedValues writes each line's posted_value at the post of r: the
// sum of the values of the line's own stock moves (own), or for a re-cost,
// whose lines have no move, the line's value, the drift Books posts for it.
// The read view shows it for a posted and a void line, so it stays when a void
// deletes the moves and when a later re-cost changes their values. Each line
// whose value changes is saved as a record, so the client gets it by
// realtime; a line that stays 0 is not written. The line guard lets the write
// through under markAdjustmentPostedValues and refuses posted_value from
// anyone else.
func writeLinePostedValues(tx core.App, r *core.Record, lines, own []*core.Record) error {
	posted := map[string]int{}
	if r.GetString("kind") == adjustmentKindRecost {
		for _, l := range lines {
			posted[l.Id] = l.GetInt("value")
		}
	} else {
		for _, m := range own {
			posted[m.GetString("line")] += m.GetInt("value")
		}
	}
	defer setTxMark(tx, markAdjustmentPostedValues, r.Id)()
	for _, l := range lines {
		if l.GetInt("posted_value") == posted[l.Id] {
			continue
		}
		l.Set("posted_value", posted[l.Id])
		if err := tx.SaveNoValidate(l); err != nil {
			return fmt.Errorf("books: write the posted value of an adjustment line: %w", err)
		}
	}
	return nil
}

// checkStockDay refuses a change of stock dated day, on the date field, when
// the day is closed to actor. It holds an adjustment that has no journal entry
// to the close date, which postEntry checks for one that has: a quantity at no
// cost still changes the stock of its day. postDocumentStock runs it before a
// replay, so a document in the closed period is refused for its own day, not
// for a re-cost it would cause.
func checkStockDay(tx core.App, actor, day string, now time.Time) error {
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
// Opening Balance Equity for an opening adjustment, Inventory shrinkage for
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
	ids := make([]string, 0, len(lines))
	var binIDs []string
	for _, l := range lines {
		ids = append(ids, l.GetString("product"))
		if bin := l.GetString("bin"); bin != "" {
			binIDs = append(binIDs, bin)
		}
	}
	products, err := recordsByID(tx, "books_products", ids)
	if err != nil {
		return nil, err
	}
	bins, err := recordsByID(tx, binsCollection, binIDs)
	if err != nil {
		return nil, err
	}
	accounts := inventoryAccountCache{}
	inputs := make([]stockMoveInput, 0, len(lines))
	for i, l := range lines {
		product, err := recordOf(products, l.GetString("product"))
		if err != nil {
			return nil, fmt.Errorf("books: read the product of adjustment line %d: %w", i+1, err)
		}
		if product.GetString("type") != "inventory" {
			return nil, refuse(msgAdjustmentLineFault, i+1, fmt.Sprintf(msgStockNotInventory, product.GetString("name")))
		}
		asset, _, err := accounts.of(tx, product)
		if err != nil {
			return nil, err
		}
		// A move whose two accounts are one posts no journal line: the stock
		// value would change and the ledger would not.
		if asset == account {
			return nil, refuseNamedField("account", msgAdjustmentAccountAsset, product.GetString("name"))
		}
		qty, value := qtyHundredths(l.GetFloat("quantity")), int64(l.GetInt("value"))
		// The line names its bin ("" is No bin): an adjustment line never takes
		// the item's default bin. The opening line Books writes holds the
		// default bin of the item's own save, which the stored product row does
		// not hold yet (syncOpeningStock).
		in := stockMoveInput{
			Product: product.Id, Kind: kind, Source: inventoryAdjustmentsCollection, Document: r.Id, Line: l.Id,
			Date: r.GetString("date"), Qty: qty, AssetAccount: asset, OffsetAccount: account,
			Bin: l.GetString("bin"), BinNamed: true,
		}
		if fault := adjustmentLineFault(qty, value); fault != "" {
			return nil, refuse(msgAdjustmentLineFault, i+1, fault)
		}
		// Books chose the opening line's bin when the item named it its default
		// bin; a bin that became inactive since keeps the item's opening stock.
		if kind != stockKindOpening {
			if fault := adjustmentBinFault(bins, in.Bin, qty); fault != "" {
				return nil, refuse(msgAdjustmentLineFault, i+1, fault)
			}
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
// posts in the original period, so the close date applies), and the stock
// moves of a manual or an opening adjustment are withdrawn, which replays
// their products and re-costs the documents whose cost changes. A re-cost has
// no move of its own.
func voidInventoryAdjustment(tx core.App, r *core.Record, now time.Time) error {
	actor := r.GetString("voided_by")
	if err := voidAdjustmentEntry(tx, r, actor, now); err != nil {
		return err
	}
	r.Set("voided_at", now)
	if r.GetString("kind") == adjustmentKindRecost {
		return nil
	}
	return withdrawDocumentStock(tx, actor, inventoryAdjustmentsCollection, r.Id)
}

// voidAdjustmentEntry voids the journal entry of adjustment r as actor. One
// with no entry is held to the close date here.
func voidAdjustmentEntry(tx core.App, r *core.Record, actor string, now time.Time) error {
	id := r.GetString("entry")
	if id == "" {
		return checkStockDay(tx, actor, r.GetString("date"), now)
	}
	entry, err := tx.FindRecordById("books_journal_entries", id)
	if err != nil {
		return fmt.Errorf("books: read the adjustment's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", actor)
	return tx.Save(entry)
}

// retireAdjustment voids the posted adjustment id that another adjustment
// takes the place of: its entry is voided, it becomes void and names by in
// replaced_by ("" for a re-post Books makes), but its stock moves stay for the
// replacing adjustment's post to take away (postDocumentStock).
func retireAdjustment(tx core.App, id, by, actor string, now time.Time) error {
	old, err := tx.FindRecordById(inventoryAdjustmentsCollection, id)
	if err != nil {
		return fmt.Errorf("books: read the adjustment to replace: %w", err)
	}
	defer setTxMark(tx, markSystemAdjustment, old.Id)()
	if err := voidAdjustmentEntry(tx, old, actor, now); err != nil {
		return err
	}
	old.Set("status", statusVoid)
	old.Set("voided_by", actor)
	old.Set("voided_at", now)
	old.Set("replaced_by", by)
	if err := tx.Save(old); err != nil {
		return fmt.Errorf("books: void the replaced inventory adjustment: %w", err)
	}
	return nil
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
