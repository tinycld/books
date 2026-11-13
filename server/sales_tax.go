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
	msgAgencyHasOneRate       = "This agency has 1 tax rate. Delete it or move it to another agency first."
	msgAgencyHasRates         = "This agency has %d tax rates. Delete them or move them to another agency first."
	msgAgencyOneActiveRate    = "Make its 1 active rate inactive first."
	msgAgencyActiveRates      = "Make its %d active rates inactive first."
	msgTaxIsDefault           = "This is the default for new sales. Choose another default first."
	msgRateInGroup            = "This rate is in the group “%s”. Remove it from the group first."
	msgRateInGroups           = "This rate is in %d groups. Remove it from them first."
	msgRateInActiveGroup      = "Remove it from the group “%s” or make the group inactive first."
	msgRateInActiveGroups     = "Remove it from its %d active groups or make them inactive first."
)

// taxRateReference is a table whose rows name a tax rate or group. A rate that
// any row names cannot be deleted: message says why, given the ids of the
// distinct referencing rows, so it can name one, and returns an error when it
// cannot read what it names. A multiple field holds a JSON array of ids; a
// single one holds one id.
type taxRateReference struct {
	collection, field string
	multiple          bool
	message           func(app core.App, ids []string) (string, error)
}

// taxRateReferences are the tables that hold a tax rate. Later units (invoice,
// sales receipt and their lines) append their tax columns here, so a rate on a
// document cannot be deleted either. Without a refusal PocketBase's own delete
// cleanup would drop the rate from each row, and for a group that either
// shrinks it silently or fails its two-rate minimum with an unrelated message.
var taxRateReferences = []taxRateReference{
	groupComponents,
	{collection: "books_invoices", field: "tax_rate", message: rateOnInvoicesMessage},
	// A posted invoice's tax lines name each component of its group, so a
	// component cannot go while the snapshot names it.
	{collection: "books_invoice_tax_lines", field: "component", message: rateOnInvoicesMessage},
	{collection: "books_sales_receipts", field: "tax_rate", message: rateOnSalesReceiptsMessage},
	{collection: "books_sales_receipt_tax_lines", field: "component", message: rateOnSalesReceiptsMessage},
	// An estimate never posts, so it has no tax lines: only its header rate.
	{collection: "books_estimates", field: "tax_rate", message: rateOnEstimatesMessage},
}

const (
	msgRateOnInvoices      = "This tax rate is on invoices. Make it inactive instead."
	msgRateOnSalesReceipts = "This tax rate is on sales receipts. Make it inactive instead."
	msgRateOnEstimates     = "This tax rate is on estimates. Make it inactive instead."
)

// rateOnInvoicesMessage is the delete refusal of a rate on any invoice, draft or
// posted, as its header rate or one of its tax lines' components.
func rateOnInvoicesMessage(core.App, []string) (string, error) {
	return msgRateOnInvoices, nil
}

// rateOnSalesReceiptsMessage is rateOnInvoicesMessage for sales receipts.
func rateOnSalesReceiptsMessage(core.App, []string) (string, error) {
	return msgRateOnSalesReceipts, nil
}

// rateOnEstimatesMessage is rateOnInvoicesMessage for estimates.
func rateOnEstimatesMessage(core.App, []string) (string, error) {
	return msgRateOnEstimates, nil
}

// groupComponents is the groups' rates. checkTaxRateInactive reads it too, so
// it does not depend on where it sits in taxRateReferences.
var groupComponents = taxRateReference{
	collection: "books_tax_rates", field: "components", multiple: true, message: rateInGroupsMessage,
}

// A group holds at least minGroupRates and at most maxGroupRates rates.
const (
	minGroupRates = 2
	maxGroupRates = 10
)

// The agency and rate guards read accounts, agencies and other rates inside
// serialized, so no other write can commit between the check and the write it
// allows; the default swap writes the previous default in the same
// transaction. The delete refusals run before e.Next(), which is where
// PocketBase clears a deleted row off the rows that name it: the person gets
// the refusal, not the side effect of that cleanup.
func registerSalesTaxGuards(app core.App) {
	bindSerializedGuard(app, "books_tax_agencies", validateTaxAgency)
	bindSerializedGuard(app, "books_tax_rates", validateTaxRate)
	app.OnRecordDelete("books_tax_agencies").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return checkTaxAgencyDelete(tx, e.Record)
		})
	})
	app.OnRecordDelete("books_tax_rates").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return checkTaxRateDelete(tx, e.Record)
		})
	})
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
	if stored != nil && !stored.GetBool("inactive") && r.GetBool("inactive") {
		if err := checkTaxAgencyInactive(app, stored, r); err != nil {
			return err
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
	if stored != nil && !stored.GetBool("inactive") && r.GetBool("inactive") {
		if err := checkTaxRateInactive(app, stored, r); err != nil {
			return err
		}
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

// checkTaxAgencyDelete refuses deleting an agency any rate names, active or
// not. PocketBase would otherwise clear the agency off each rate, which the
// rate guard refuses with "Choose an agency.": the refusal here says what to
// do instead.
func checkTaxAgencyDelete(app core.App, r *core.Record) error {
	n, err := app.CountRecords("books_tax_rates", dbx.HashExp{"agency": r.Id})
	if err != nil {
		return fmt.Errorf("books: count the agency's rates: %w", err)
	}
	if n == 1 {
		return refuse(msgAgencyHasOneRate)
	}
	if n > 1 {
		return refuse(msgAgencyHasRates, n)
	}
	return nil
}

// checkTaxAgencyInactive refuses making an agency inactive while an active
// rate names it; inactive rates may stay with an inactive agency. It runs
// only when the write turns inactive on.
func checkTaxAgencyInactive(app core.App, stored, r *core.Record) error {
	n, err := app.CountRecords("books_tax_rates", dbx.HashExp{"agency": r.Id, "inactive": false})
	if err != nil {
		return fmt.Errorf("books: count the agency's active rates: %w", err)
	}
	if n == 1 {
		return refuse(msgAgencyOneActiveRate)
	}
	if n > 1 {
		return refuse(msgAgencyActiveRates, n)
	}
	return nil
}

// checkTaxRateDelete refuses deleting the default, then a rate any row of a
// taxRateReferences table names. A customer's default_tax_rate is not a
// reference: PocketBase clears it, and the customer has no default.
func checkTaxRateDelete(app core.App, r *core.Record) error {
	if r.GetBool("is_default") {
		return refuse(msgTaxIsDefault)
	}
	for _, ref := range taxRateReferences {
		ids, err := referencingIDs(app, ref, r.Id, nil)
		if err != nil {
			return fmt.Errorf("books: read the %s that hold the rate: %w", ref.collection, err)
		}
		if len(ids) > 0 {
			msg, err := ref.message(app, ids)
			if err != nil {
				return err
			}
			return refuse("%s", msg)
		}
	}
	return nil
}

// checkTaxRateInactive refuses making the default inactive (a write that also
// removes the default is allowed) and making a rate inactive while an active
// group holds it; an inactive group may keep inactive rates. It runs only when
// the write turns inactive on.
func checkTaxRateInactive(app core.App, stored, r *core.Record) error {
	if stored.GetBool("is_default") && r.GetBool("is_default") {
		return refuse(msgTaxIsDefault)
	}
	ids, err := referencingIDs(app, groupComponents, r.Id, dbx.HashExp{"inactive": false})
	if err != nil {
		return fmt.Errorf("books: read the active groups that hold the rate: %w", err)
	}
	if len(ids) > 1 {
		return refuse(msgRateInActiveGroups, len(ids))
	}
	if len(ids) == 1 {
		group, err := app.FindRecordById("books_tax_rates", ids[0])
		if err != nil {
			return fmt.Errorf("books: read the group that holds the rate: %w", err)
		}
		return refuse(msgRateInActiveGroup, group.GetString("name"))
	}
	return nil
}

// referencingIDs lists, in id order, the ids of ref's rows that name the rate
// id, narrowed by where when it is not nil.
func referencingIDs(app core.App, ref taxRateReference, id string, where dbx.Expression) ([]string, error) {
	var match dbx.Expression = dbx.HashExp{ref.field: id}
	if ref.multiple {
		// A multiple relation column holds a JSON array of ids. The alias keeps
		// json_each's own columns apart from the table's.
		match = dbx.NewExp(
			"EXISTS (SELECT 1 FROM json_each([["+ref.field+"]]) AS j WHERE j.value = {:id})",
			dbx.Params{"id": id},
		)
	}
	q := app.DB().Select("id").From(ref.collection).Where(match)
	if where != nil {
		q = q.AndWhere(where)
	}
	var ids []string
	if err := q.OrderBy("id").Column(&ids); err != nil {
		return nil, err
	}
	return ids, nil
}

// rateInGroupsMessage is the delete refusal for a rate the groups ids hold:
// one group by name, several by count.
func rateInGroupsMessage(app core.App, ids []string) (string, error) {
	if len(ids) != 1 {
		return fmt.Sprintf(msgRateInGroups, len(ids)), nil
	}
	group, err := app.FindRecordById("books_tax_rates", ids[0])
	if err != nil {
		return "", fmt.Errorf("books: read the group that holds the rate: %w", err)
	}
	return fmt.Sprintf(msgRateInGroup, group.GetString("name")), nil
}
