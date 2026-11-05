package books

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts. tinycld/books/lib/tax-messages.ts copies them;
// tests/tax-messages.test.ts fails when this wording drifts.
const (
	msgAgencyDuplicateName    = "An agency named “%s” already exists."
	msgAgencyAccountRequired  = "Choose a liability account."
	msgAgencyAccountMissing   = "The liability account does not exist."
	msgAgencyAccountInactive  = "The liability account is inactive."
	msgAgencyAccountType      = "The liability account must be an Other current liability account."
	msgTaxDuplicateName       = "A tax rate or group named “%s” already exists."
	msgTaxTypeFixed           = "A tax rate stays a rate and a group stays a group."
	msgRateAgencyRequired     = "Choose an agency."
	msgRateAgencyMissing      = "The agency does not exist."
	msgRateAgencyInactive     = "The agency is inactive."
	msgRateHasComponents      = "A tax rate holds no other rates."
	msgGroupHasOwn            = "A group has no rate or agency of its own."
	msgGroupTooFew            = "Choose at least two rates."
	msgGroupTooMany           = "A group holds at most ten rates."
	msgGroupRepeated          = "Each rate can be in a group once."
	msgGroupComponentMissing  = "A rate in this group does not exist."
	msgGroupComponentIsGroup  = "A group cannot contain another group."
	msgGroupComponentInactive = "“%s” is inactive."
	msgDefaultInactive        = "Only an active rate or group can be the default."
)

// A group holds at least minGroupRates and at most maxGroupRates rates.
const (
	minGroupRates = 2
	maxGroupRates = 10
)

// The agency and rate guards read accounts, agencies and other rates inside
// serialized, so no other write can commit between the check and the write it
// allows; the default swap writes the previous default in the same
// transaction.
func registerSalesTaxGuards(app core.App) {
	bindSerializedGuard(app, "books_tax_agencies", validateTaxAgency)
	bindSerializedGuard(app, "books_tax_rates", validateTaxRate)
}

// validateTaxAgency stores the name trimmed, checks the liability account when
// it changes (an agency keeps an account that became inactive after it was
// saved), and the name among all agencies. stored is the record before an
// update, nil on a create.
func validateTaxAgency(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
	// sort_key belongs to the guard too, set before any early return.
	r.Set("sort_key", sortName(name))
	accountID := r.GetString("account")
	if accountID == "" {
		return refuseField("account", msgAgencyAccountRequired)
	}
	if stored == nil || stored.GetString("account") != accountID {
		account, err := app.FindRecordById("books_accounts", accountID)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField("account", msgAgencyAccountMissing)
		}
		if err != nil {
			return fmt.Errorf("books: read the liability account: %w", err)
		}
		if account.GetBool("inactive") {
			return refuseField("account", msgAgencyAccountInactive)
		}
		if account.GetString("type") != "other_current_liability" {
			return refuseField("account", msgAgencyAccountType)
		}
	}
	// name_key belongs to the guard: it overwrites whatever the request sent.
	key := nameKey(name)
	r.Set("name_key", key)
	if stored != nil && stored.GetString("name_key") == key {
		return nil
	}
	taken, err := nameKeyTaken(app, "books_tax_agencies", key, r.Id, nil)
	if err != nil {
		return fmt.Errorf("books: look up agency names: %w", err)
	}
	if taken {
		return refuseField("name", msgAgencyDuplicateName, name)
	}
	return nil
}

// validateTaxRate stores the name trimmed, keeps the type, checks a rate's
// agency or a group's rates, the name among all rates and groups, and last
// the default, whose swap writes another row. stored is the record before an
// update, nil on a create.
func validateTaxRate(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
	// sort_key belongs to the guard too, set before any early return.
	r.Set("sort_key", sortName(name))
	kind := r.GetString("type")
	if stored != nil && stored.GetString("type") != kind {
		return refuseField("type", msgTaxTypeFixed)
	}
	if kind == "group" {
		if r.GetInt("rate_ppm") != 0 || r.GetString("agency") != "" {
			return refuse(msgGroupHasOwn)
		}
		if err := validateTaxRateComponents(app, stored, r); err != nil {
			return err
		}
	} else if err := validateRateAgency(app, stored, r); err != nil {
		return err
	}
	if err := checkTaxRateName(app, stored, r, name); err != nil {
		return err
	}
	if !r.GetBool("is_default") || (stored != nil && stored.GetBool("is_default")) {
		return nil
	}
	if r.GetBool("inactive") {
		return refuse(msgDefaultInactive)
	}
	return clearOtherDefault(app, r)
}

// validateRateAgency checks a rate's agency when it changes (a rate keeps an
// agency that became inactive after it was saved) and that the rate holds no
// other rates.
func validateRateAgency(app core.App, stored, r *core.Record) error {
	agencyID := r.GetString("agency")
	if agencyID == "" {
		return refuseField("agency", msgRateAgencyRequired)
	}
	if stored == nil || stored.GetString("agency") != agencyID {
		agency, err := app.FindRecordById("books_tax_agencies", agencyID)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField("agency", msgRateAgencyMissing)
		}
		if err != nil {
			return fmt.Errorf("books: read the rate's agency: %w", err)
		}
		if agency.GetBool("inactive") {
			return refuseField("agency", msgRateAgencyInactive)
		}
	}
	if len(componentIDs(r)) > 0 {
		return refuseField("components", msgRateHasComponents)
	}
	return nil
}

// validateTaxRateComponents checks a group's rates: two to ten, each once,
// each an existing rate (never a group), and each the change adds active (a
// group keeps a rate that became inactive after it was saved). stored is the
// record before an update, nil on a create.
func validateTaxRateComponents(app core.App, stored, r *core.Record) error {
	ids := componentIDs(r)
	if len(ids) < minGroupRates {
		return refuseField("components", msgGroupTooFew)
	}
	if len(ids) > maxGroupRates {
		return refuseField("components", msgGroupTooMany)
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return refuseField("components", msgGroupRepeated)
		}
		seen[id] = true
	}
	kept := map[string]bool{}
	if stored != nil {
		for _, id := range stored.GetStringSlice("components") {
			kept[id] = true
		}
	}
	for _, id := range ids {
		rate, err := app.FindRecordById("books_tax_rates", id)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField("components", msgGroupComponentMissing)
		}
		if err != nil {
			return fmt.Errorf("books: read a rate of the group: %w", err)
		}
		if rate.GetString("type") != "rate" {
			return refuseField("components", msgGroupComponentIsGroup)
		}
		if rate.GetBool("inactive") && !kept[id] {
			return refuseField("components", msgGroupComponentInactive, rate.GetString("name"))
		}
	}
	return nil
}

// componentIDs reads the components value as it was given. PocketBase drops a
// repeated id when a relation value is set through Set or loaded, and so does
// GetStringSlice, so reading it that way would hide a repeat a raw value
// carries; the guard checks what is about to be written.
func componentIDs(r *core.Record) []string {
	switch v := r.GetRaw("components").(type) {
	case []string:
		return v
	case []any:
		ids := make([]string, len(v))
		for i, id := range v {
			ids[i] = fmt.Sprint(id)
		}
		return ids
	case string:
		if v == "" {
			return nil
		}
		return []string{v}
	default:
		// Any other shape is PocketBase's own reading of the value.
		return r.GetStringSlice("components")
	}
}

// checkTaxRateName refuses a name another rate or group already holds,
// ignoring case: rates and groups are one choice on a customer or a sale, so
// they share one name space.
func checkTaxRateName(app core.App, stored, r *core.Record, name string) error {
	// name_key belongs to the guard: it overwrites whatever the request sent.
	key := nameKey(name)
	r.Set("name_key", key)
	if stored != nil && stored.GetString("name_key") == key {
		return nil
	}
	taken, err := nameKeyTaken(app, "books_tax_rates", key, r.Id, nil)
	if err != nil {
		return fmt.Errorf("books: look up tax rate names: %w", err)
	}
	if taken {
		return refuseField("name", msgTaxDuplicateName, name)
	}
	return nil
}

// clearOtherDefault takes is_default off the row that holds it, other than r.
// It runs inside r's serialized write and before r is written, so the swap is
// one write: no reader ever sees two defaults or none in between, and the
// partial unique index never sees two. The nested save runs this guard for
// the previous default, which does nothing (rekeySubCustomers is the precedent
// for a save inside a guard).
func clearOtherDefault(tx core.App, r *core.Record) error {
	prev, err := tx.FindFirstRecordByFilter("books_tax_rates", "is_default = true && id != {:id}", dbx.Params{"id": r.Id})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the previous default: %w", err)
	}
	prev.Set("is_default", false)
	if err := tx.Save(prev); err != nil {
		return fmt.Errorf("books: clear the previous default %s: %w", prev.Id, err)
	}
	return nil
}
