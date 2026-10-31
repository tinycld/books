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
	msgTaxIDDigits            = "A tax ID has 9 digits."
	msgTaxIDType              = "Choose whether the tax ID is an EIN or an SSN."
)

// The vendor guard reads other vendors and the expense account inside
// serialized, so no other write can commit between the check and the write
// it allows. Nothing references a vendor yet, so there is no delete hook.
func registerVendorGuard(app core.App) {
	bindSerializedGuard(app, "books_vendors", validateVendor)
}

// validateVendor stores the display name trimmed, then checks the address,
// the 1099 fields, the default expense account and the name among all
// vendors. stored is the record before an update, nil on a create.
func validateVendor(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("display_name"))
	r.Set("display_name", name)
	// sort_key belongs to the guard too, set before any early return.
	r.Set("sort_key", sortName(name))
	if !isAddress(r.Get("address")) {
		return refuseField("address", msgAddressShape)
	}
	if err := validate1099Fields(r); err != nil {
		return err
	}
	if err := validateExpenseAccount(app, stored, r, msgExpenseAccountLedger); err != nil {
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

// validate1099Fields stores the legal name trimmed and the tax ID dashed by
// its type. It runs on every create and update, not only when the tax ID
// changes, so a type change re-dashes the stored value and the stored form
// always matches the column's pattern. A tax ID is not required; an unknown
// type is left for the schema's select check.
func validate1099Fields(r *core.Record) error {
	r.Set("legal_name", strings.TrimSpace(r.GetString("legal_name")))
	raw := strings.TrimSpace(r.GetString("tax_id"))
	if raw == "" {
		r.Set("tax_id", "")
		return nil
	}
	digits, ok := normalizeTaxID(raw)
	if !ok {
		return refuseField("tax_id", msgTaxIDDigits)
	}
	taxType := r.GetString("tax_id_type")
	if taxType == "" {
		return refuseField("tax_id_type", msgTaxIDType)
	}
	r.Set("tax_id", dashTaxID(digits, taxType))
	return nil
}

// normalizeTaxID removes spaces and dashes; ok when exactly 9 ASCII digits
// are left.
func normalizeTaxID(raw string) (digits string, ok bool) {
	digits = strings.NewReplacer(" ", "", "-", "").Replace(raw)
	if len(digits) != 9 {
		return digits, false
	}
	for i := 0; i < len(digits); i++ {
		if digits[i] < '0' || digits[i] > '9' {
			return digits, false
		}
	}
	return digits, true
}

// dashTaxID writes 9 digits in the form of their type: EIN 12-3456789, SSN
// 123-45-6789. Any other type gets the digits as they are.
func dashTaxID(digits, taxType string) string {
	switch taxType {
	case "ein":
		return digits[:2] + "-" + digits[2:]
	case "ssn":
		return digits[:3] + "-" + digits[3:5] + "-" + digits[5:]
	}
	return digits
}

// validateExpenseAccount checks an expense account only when the write
// changes it: a vendor or a product keeps an account that became inactive
// after it was saved. Its callers are validateVendor (the default expense
// account, msgExpenseAccountLedger) and validateProduct (the purchase expense
// account, msgProductExpenseAccountLedger); ledgerMessage is the caller's
// refusal of Accounts receivable and Accounts payable. stored is the record
// before an update, nil on a create.
func validateExpenseAccount(app core.App, stored, r *core.Record, ledgerMessage string) error {
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
		// "%s": the message is data, and a refusal never formats it.
		return refuseField("expense_account", "%s", ledgerMessage)
	}
	return nil
}
