package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// maxAccountDepth bounds sub-account nesting, counting the top account.
const maxAccountDepth = 5

// Account delete refusals while products name the account.
// tinycld/books/lib/product-messages.ts copies them;
// tests/product-messages.test.ts fails when this wording drifts.
const (
	msgAccountUsedByOneProduct = "This account is used by 1 product or service and cannot be deleted. Make it inactive instead."
	msgAccountUsedByProducts   = "This account is used by %d products and services and cannot be deleted. Make it inactive instead."
)

// tinycld/books/lib/account-messages.ts copies this refusal;
// tests/account-messages.test.ts fails when this wording drifts.
const msgBoxNeedsExpenseType = "Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first."

// The Trial Balance folds earlier fiscal years' income and expense onto the
// one retained-earnings account, so every chart keeps exactly one.
const (
	msgNeedsRetainedEarnings  = "Books needs one Retained earnings account. Rename it instead."
	msgSecondRetainedEarnings = "This chart already has a Retained earnings account."
)

const detailRetainedEarnings = "retained_earnings"

// Account refusals while sales are deposited to the account: the account
// "Sales deposited to" names (Settings → Sales), and the deposit_to of sales
// receipts, draft or posted.
const (
	msgAccountIsSalesDeposit      = "This account is where sales are deposited (Settings → Sales). Choose another account or Ask there first."
	msgAccountDepositOfOneReceipt = "This account is the deposit account of 1 sales receipt and cannot be deleted. Make it inactive instead."
	msgAccountDepositOfReceipts   = "This account is the deposit account of %d sales receipts and cannot be deleted. Make it inactive instead."
)

// Account refusals while tax agencies name the account.
// tinycld/books/lib/tax-messages.ts copies them;
// tests/tax-messages.test.ts fails when this wording drifts.
const (
	msgAccountUsedByOneAgency = "This account is the liability account of 1 tax agency and cannot be deleted. Choose another account for the agency first."
	msgAccountUsedByAgencies  = "This account is the liability account of %d tax agencies and cannot be deleted. Choose another account for them first."
	msgAccountActiveAgency    = "This account is the liability account of an active tax agency. Choose another account for the agency or make the agency inactive first."
	msgAccountAgencyType      = "This account is the liability account of a tax agency, so it stays an Other current liability account."
)

// Every account guard reads other rows (the parent chain, sub-accounts, line
// counts) inside serialized, so no post, line or other account write can
// commit between the check and the write it allows.
func registerAccountGuard(app core.App) {
	app.OnRecordCreate("books_accounts").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			if err := stampCurrency(tx, e.Record); err != nil {
				return err
			}
			if err := validateAccount(tx, e.Record); err != nil {
				return err
			}
			return stampFullName(tx, e.Record)
		})
	})
	app.OnRecordUpdate("books_accounts").BindFunc(func(e *core.RecordEvent) error {
		var stored *core.Record
		return serializedThen(e, func(tx core.App) error {
			var err error
			stored, err = tx.FindRecordById("books_accounts", e.Record.Id)
			if err != nil {
				return err
			}
			if err := validateAccount(tx, e.Record); err != nil {
				return err
			}
			if err := checkAccountChange(tx, stored, e.Record); err != nil {
				return err
			}
			return stampFullName(tx, e.Record)
		}, func(tx core.App) error {
			if e.Record.GetString("full_name") == stored.GetString("full_name") {
				return nil
			}
			return restampChildren(tx, e.Record.Id)
		})
	})
	app.OnRecordDelete("books_accounts").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return checkAccountDelete(tx, e.Record)
		})
	})
}

func validateAccount(app core.App, r *core.Record) error {
	t, ok := accountType(r.GetString("type"))
	if !ok {
		return refuse("%s is not an account type.", r.GetString("type"))
	}
	if !t.hasDetail(r.GetString("detail_type")) {
		return refuse("%s is not a detail type of %s accounts.", r.GetString("detail_type"), t.Label)
	}
	// The 1099 report sums a box from expense postings only. This runs on a
	// create and on an update with the new type, so it covers both a box set
	// on another type and a type change of a mapped account.
	if r.GetString("form_1099_box") != "" && !isExpenseGroupType(r.GetString("type")) {
		return refuse(msgBoxNeedsExpenseType)
	}
	if r.GetString("detail_type") == detailRetainedEarnings {
		// A new account created inactive would be an inactive only one. An
		// update is checked in checkAccountChange, where only the change to
		// inactive is refused.
		if r.IsNew() && r.GetBool("inactive") {
			return refuse(msgNeedsRetainedEarnings)
		}
		others, err := app.CountRecords("books_accounts", dbx.And(
			dbx.HashExp{"detail_type": detailRetainedEarnings},
			dbx.Not(dbx.HashExp{"id": r.Id}),
		))
		if err != nil {
			return fmt.Errorf("books: count retained-earnings accounts: %w", err)
		}
		if others > 0 {
			return refuse(msgSecondRetainedEarnings)
		}
	}
	return validateParent(app, r)
}

// fullNameOf is the account's parent path, "Parent:Child". It reads the
// parent's stored full_name, so a parent saved earlier in the same
// transaction gives its new path.
func fullNameOf(tx core.App, r *core.Record) (string, error) {
	name := r.GetString("name")
	parentID := r.GetString("parent")
	if parentID == "" {
		return name, nil
	}
	parent, err := tx.FindRecordById("books_accounts", parentID)
	if err != nil {
		return "", fmt.Errorf("books: read the parent account: %w", err)
	}
	return parent.GetString("full_name") + ":" + name, nil
}

func stampFullName(tx core.App, r *core.Record) error {
	fullName, err := fullNameOf(tx, r)
	if err != nil {
		return err
	}
	r.Set("full_name", fullName)
	return nil
}

// restampChildren saves each direct sub-account of id again; its own update
// hook takes the new path from the parent saved in this transaction and
// passes it on to its sub-accounts.
func restampChildren(tx core.App, id string) error {
	children, err := tx.FindAllRecords("books_accounts", dbx.HashExp{"parent": id})
	if err != nil {
		return fmt.Errorf("books: read sub-accounts: %w", err)
	}
	for _, child := range children {
		if err := tx.Save(child); err != nil {
			return fmt.Errorf("books: update the path of %s: %w", child.GetString("name"), err)
		}
	}
	return nil
}

// ensureRetainedEarnings gives a chart with no retained-earnings account one:
// a skipped starter chart, a hand-made or imported chart, or a post before
// setup would otherwise leave earlier years' income and expense with no
// account to fold onto. Its number follows the starter chart of the book's
// ownership, and is left empty when another account holds it; its name
// steps past a top-level account that already holds it. It reads the stored
// settings row, so the settings guard runs it after that row is written.
func ensureRetainedEarnings(tx core.App) error {
	existing, err := tx.CountRecords("books_accounts", dbx.HashExp{"detail_type": detailRetainedEarnings})
	if err != nil {
		return fmt.Errorf("books: count retained-earnings accounts: %w", err)
	}
	if existing > 0 {
		return nil
	}
	s, err := tx.FindRecordById("books_settings", settingsID)
	if err != nil {
		return fmt.Errorf("books: read settings: %w", err)
	}
	number := "3900"
	if s.GetString("ownership") == "corporation" {
		number = "3500"
	}
	taken, err := tx.CountRecords("books_accounts", dbx.HashExp{"number": number})
	if err != nil {
		return fmt.Errorf("books: read account numbers: %w", err)
	}
	if taken > 0 {
		number = ""
	}
	name, err := freeRetainedEarningsName(tx)
	if err != nil {
		return err
	}
	col, err := tx.FindCollectionByNameOrId("books_accounts")
	if err != nil {
		return fmt.Errorf("books: find accounts: %w", err)
	}
	r := core.NewRecord(col)
	r.Set("name", name)
	r.Set("type", "equity")
	r.Set("detail_type", detailRetainedEarnings)
	r.Set("number", number)
	if err := tx.Save(r); err != nil {
		return fmt.Errorf("books: create the retained-earnings account: %w", err)
	}
	return nil
}

// freeRetainedEarningsName is "Retained earnings", or the first of
// "Retained earnings 2", "Retained earnings 3", … that no top-level account
// holds.
func freeRetainedEarningsName(tx core.App) (string, error) {
	return freeTopLevelName(tx, "Retained earnings")
}

// freeTopLevelName is base, or the first of "<base> 2", "<base> 3", … that no
// top-level account holds, for an account Books creates itself. The name index
// (parent, name COLLATE NOCASE) ignores case, so the lookup does too.
func freeTopLevelName(tx core.App, base string) (string, error) {
	for i := 1; ; i++ {
		name := base
		if i > 1 {
			name = fmt.Sprintf("%s %d", base, i)
		}
		taken, err := tx.CountRecords("books_accounts", dbx.NewExp(
			"parent = '' AND name = {:name} COLLATE NOCASE", dbx.Params{"name": name},
		))
		if err != nil {
			return "", fmt.Errorf("books: read account names: %w", err)
		}
		if taken == 0 {
			return name, nil
		}
	}
}

// validateParent keeps the hierarchy a tree of one type, at most
// maxAccountDepth levels deep, counting the subtree that moves with r.
func validateParent(app core.App, r *core.Record) error {
	parentID := r.GetString("parent")
	if parentID == "" {
		return nil
	}
	if parentID == r.Id {
		return refuse("An account cannot be placed inside its own sub-account.")
	}
	parent, err := app.FindRecordById("books_accounts", parentID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuse("The parent account does not exist.")
	}
	if err != nil {
		return fmt.Errorf("read the parent account: %w", err)
	}
	if parent.GetString("type") != r.GetString("type") {
		return refuse("A sub-account must have the same type as its parent (%s).", typeLabel(parent.GetString("type")))
	}

	all, err := app.FindAllRecords("books_accounts")
	if err != nil {
		return fmt.Errorf("books: read accounts: %w", err)
	}
	parentOf := make(map[string]string, len(all))
	childrenOf := map[string][]string{}
	for _, a := range all {
		if a.Id == r.Id {
			continue
		}
		p := a.GetString("parent")
		parentOf[a.Id] = p
		if p != "" {
			childrenOf[p] = append(childrenOf[p], a.Id)
		}
	}

	depth := 1
	for id := parentID; id != ""; id = parentOf[id] {
		if r.Id != "" && id == r.Id {
			return refuse("An account cannot be placed inside its own sub-account.")
		}
		depth++
		if depth > maxAccountDepth+1 {
			break
		}
	}
	if r.Id != "" {
		depth += subtreeHeight(r.Id, childrenOf, 0)
	}
	if depth > maxAccountDepth {
		return refuse("Accounts can be nested at most %d levels deep.", maxAccountDepth)
	}
	return nil
}

// subtreeHeight is how many levels of sub-accounts sit below id.
func subtreeHeight(id string, childrenOf map[string][]string, seen int) int {
	if seen > maxAccountDepth {
		return seen
	}
	best := 0
	for _, child := range childrenOf[id] {
		if h := 1 + subtreeHeight(child, childrenOf, seen+1); h > best {
			best = h
		}
	}
	return best
}

func checkAccountChange(app core.App, stored, next *core.Record) error {
	if stored.GetString("currency") != next.GetString("currency") {
		return refuse("An account's currency cannot change.")
	}
	// Retained Earnings is an equity account, which Banking cannot connect,
	// so this check never hides a Banking refusal.
	if stored.GetString("detail_type") == detailRetainedEarnings &&
		(next.GetString("type") != stored.GetString("type") ||
			next.GetString("detail_type") != detailRetainedEarnings ||
			(!stored.GetBool("inactive") && next.GetBool("inactive"))) {
		return refuse(msgNeedsRetainedEarnings)
	}
	// Banking checks the account's type and active state only when it
	// connects, so a connected account keeps both: any type change is refused,
	// bank to credit card included, and so is making it inactive. Its first
	// fix is Disconnect, whatever else blocks the change, so in both branches
	// below the Banking refusal comes before the other checks.
	if stored.GetString("type") != next.GetString("type") {
		connected, err := connectionOf(app, next.Id)
		if err != nil {
			return err
		}
		if connected != nil {
			return refuseNamed(msgConnectedTypeChange, accountDisplayName(next))
		}
		lines, err := app.CountRecords("books_journal_lines", dbx.HashExp{"account": next.Id})
		if err != nil {
			return err
		}
		if lines > 0 {
			return refuse("This account is used on %d journal lines, so its type cannot change. Create a new account and move the activity with a journal entry.", lines)
		}
		children, err := app.CountRecords("books_accounts", dbx.HashExp{"parent": next.Id})
		if err != nil {
			return err
		}
		if children > 0 {
			return refuse("Sub-accounts share their parent's type. Change or move the %d sub-accounts first.", children)
		}
		// An agency's tax posts to its account, so the account stays a liability
		// while any agency, active or not, names it.
		if stored.GetString("type") == "other_current_liability" {
			agencies, err := app.CountRecords("books_tax_agencies", dbx.HashExp{"account": next.Id})
			if err != nil {
				return err
			}
			if agencies > 0 {
				return refuse(msgAccountAgencyType)
			}
		}
	}
	if !stored.GetBool("inactive") && next.GetBool("inactive") {
		connected, err := connectionOf(app, next.Id)
		if err != nil {
			return err
		}
		if connected != nil {
			return refuseNamed(msgConnectedInactive, accountDisplayName(next))
		}
		active, err := app.CountRecords("books_accounts", dbx.HashExp{"parent": next.Id, "inactive": false})
		if err != nil {
			return err
		}
		if active > 0 {
			return refuse("Make the %d active sub-accounts inactive first.", active)
		}
		// An active agency's tax posts to its account, so the account cannot be
		// made inactive while an active agency names it.
		agencies, err := app.CountRecords("books_tax_agencies", dbx.HashExp{"account": next.Id, "inactive": false})
		if err != nil {
			return err
		}
		if agencies > 0 {
			return refuse(msgAccountActiveAgency)
		}
	}
	return checkSetDepositAccountChange(app, stored, next)
}

// checkSetDepositAccountChange keeps the account "Sales deposited to" names a
// usable deposit account: it cannot be made inactive or moved off bank /
// Undeposited funds. A rename or any other change saves. Making an account
// inactive that only receipts name is allowed: Post refuses it then.
func checkSetDepositAccountChange(app core.App, stored, next *core.Record) error {
	deactivated := !stored.GetBool("inactive") && next.GetBool("inactive")
	retyped := stored.GetString("type") != next.GetString("type") ||
		stored.GetString("detail_type") != next.GetString("detail_type")
	if !deactivated && !retyped {
		return nil
	}
	set, err := salesDepositAccount(app)
	if err != nil {
		return err
	}
	if set != next.Id {
		return nil
	}
	if deactivated || !isDepositAccount(next) {
		return refuse(msgAccountIsSalesDeposit)
	}
	return nil
}

func checkAccountDelete(app core.App, r *core.Record) error {
	// The rule in validateAccount keeps this the only one.
	if r.GetString("detail_type") == detailRetainedEarnings {
		return refuse(msgNeedsRetainedEarnings)
	}
	// The connection's account relation does not cascade, so PocketBase would
	// refuse this delete with a reference error that does not say Banking is
	// why or that Disconnect is the fix.
	connected, err := connectionOf(app, r.Id)
	if err != nil {
		return err
	}
	if connected != nil {
		return refuseNamed(msgConnectedDelete, accountDisplayName(r))
	}
	// Before the journal lines check: the set account usually has postings,
	// and that text says to make it inactive, which is also refused while set.
	set, err := salesDepositAccount(app)
	if err != nil {
		return err
	}
	if set == r.Id {
		return refuse(msgAccountIsSalesDeposit)
	}
	lines, err := app.CountRecords("books_journal_lines", dbx.HashExp{"account": r.Id})
	if err != nil {
		return err
	}
	if lines > 0 {
		return refuse("This account is used on %d journal lines and cannot be deleted. Make it inactive instead.", lines)
	}
	// PocketBase would clear a non-required relation when its account is
	// deleted, so the account would silently drop off the product.
	products, err := app.CountRecords("books_products",
		dbx.Or(dbx.HashExp{"income_account": r.Id}, dbx.HashExp{"expense_account": r.Id}))
	if err != nil {
		return err
	}
	if products == 1 {
		return refuse(msgAccountUsedByOneProduct)
	}
	if products > 1 {
		return refuse(msgAccountUsedByProducts, products)
	}
	// An agency's account is a required relation, so PocketBase refuses the
	// delete with a generic message; this one says what to do instead. An
	// inactive agency still names its account.
	agencies, err := app.CountRecords("books_tax_agencies", dbx.HashExp{"account": r.Id})
	if err != nil {
		return err
	}
	if agencies == 1 {
		return refuse(msgAccountUsedByOneAgency)
	}
	if agencies > 1 {
		return refuse(msgAccountUsedByAgencies, agencies)
	}
	// A receipt's deposit_to is a required relation, so PocketBase refuses the
	// delete with a generic message; this one says what to do instead. Drafts
	// count too.
	receipts, err := app.CountRecords(salesReceiptKind.Collection, dbx.HashExp{"deposit_to": r.Id})
	if err != nil {
		return err
	}
	if receipts == 1 {
		return refuse(msgAccountDepositOfOneReceipt)
	}
	if receipts > 1 {
		return refuse(msgAccountDepositOfReceipts, receipts)
	}
	children, err := app.CountRecords("books_accounts", dbx.HashExp{"parent": r.Id})
	if err != nil {
		return err
	}
	if children > 0 {
		return refuse("This account has %d sub-accounts. Move or delete them first.", children)
	}
	return nil
}
