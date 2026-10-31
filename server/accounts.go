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

// tinycld/books/lib/account-messages.ts copies this refusal;
// tests/account-messages.test.ts fails when this wording drifts.
const msgBoxNeedsExpenseType = "Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first."

// Every account guard reads other rows (the parent chain, sub-accounts, line
// counts) inside serialized, so no post, line or other account write can
// commit between the check and the write it allows.
func registerAccountGuard(app core.App) {
	app.OnRecordCreate("books_accounts").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			if err := stampCurrency(tx, e.Record); err != nil {
				return err
			}
			return validateAccount(tx, e.Record)
		})
	})
	app.OnRecordUpdate("books_accounts").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById("books_accounts", e.Record.Id)
			if err != nil {
				return err
			}
			if err := validateAccount(tx, e.Record); err != nil {
				return err
			}
			return checkAccountChange(tx, stored, e.Record)
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
	return validateParent(app, r)
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
	if stored.GetString("type") != next.GetString("type") {
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
	}
	if !stored.GetBool("inactive") && next.GetBool("inactive") {
		active, err := app.CountRecords("books_accounts", dbx.HashExp{"parent": next.Id, "inactive": false})
		if err != nil {
			return err
		}
		if active > 0 {
			return refuse("Make the %d active sub-accounts inactive first.", active)
		}
	}
	return nil
}

func checkAccountDelete(app core.App, r *core.Record) error {
	lines, err := app.CountRecords("books_journal_lines", dbx.HashExp{"account": r.Id})
	if err != nil {
		return err
	}
	if lines > 0 {
		return refuse("This account is used on %d journal lines and cannot be deleted. Make it inactive instead.", lines)
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
