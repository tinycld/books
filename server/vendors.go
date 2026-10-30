package books

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts. tinycld/books/lib/vendor-messages.ts copies them;
// tests/vendor-messages.test.ts fails when this wording drifts. The address
// refusal is the shared msgAddressShape of customers.go.
const (
	msgVendorDuplicateName    = "A vendor named “%s” already exists."
	msgExpenseAccountMissing  = "The expense account does not exist."
	msgExpenseAccountInactive = "The expense account is inactive."
	msgExpenseAccountLedger   = "A vendor's default expense account cannot be Accounts receivable or Accounts payable."
)

// The vendor guard reads other vendors and the expense account inside
// serialized, so no other write can commit between the check and the write
// it allows. Nothing references a vendor yet, so there is no delete hook.
func registerVendorGuard(app core.App) {
	bindSerializedGuard(app, "books_vendors", validateVendor)
}

// validateVendor stores the display name trimmed, then checks the address,
// the default expense account and the name among all vendors. stored is the
// record before an update, nil on a create.
func validateVendor(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("display_name"))
	r.Set("display_name", name)
	if !isAddress(r.Get("address")) {
		return refuseField("address", msgAddressShape)
	}
	if err := validateExpenseAccount(app, stored, r); err != nil {
		return err
	}
	// name_key belongs to the guard: it overwrites whatever the request sent.
	key := nameKey(name)
	r.Set("name_key", key)
	if stored != nil && stored.GetString("name_key") == key {
		return nil
	}
	taken, err := nameKeyTaken(app, "books_vendors", key, r.Id, nil)
	if err != nil {
		return fmt.Errorf("books: look up vendor names: %w", err)
	}
	if taken {
		return refuseField("display_name", msgVendorDuplicateName, name)
	}
	return nil
}

// validateExpenseAccount checks the default expense account only when the
// write changes it: a vendor keeps an account that became inactive after it
// was saved. stored is the record before an update, nil on a create.
func validateExpenseAccount(app core.App, stored, r *core.Record) error {
	id := r.GetString("expense_account")
	if id == "" || (stored != nil && stored.GetString("expense_account") == id) {
		return nil
	}
	account, err := app.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("expense_account", msgExpenseAccountMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the expense account: %w", err)
	}
	if account.GetBool("inactive") {
		return refuseField("expense_account", msgExpenseAccountInactive)
	}
	switch account.GetString("type") {
	case "accounts_receivable", "accounts_payable":
		return refuseField("expense_account", msgExpenseAccountLedger)
	}
	return nil
}
