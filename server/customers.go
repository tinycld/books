package books

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// Refusal texts. tinycld/books/lib/customer-messages.ts copies the ones the
// client shows before it asks; tests/customer-messages.test.ts fails when
// this wording drifts.
const (
	msgDuplicateName     = "A customer named “%s” already exists here."
	msgParentMissing     = "The parent customer does not exist."
	msgParentNotTopLevel = "A sub-customer cannot have sub-customers of its own."
	msgParentSelf        = "A customer cannot be its own parent."
	msgParentLocked      = "A customer with sub-customers cannot be a sub-customer."
	msgParentInactive    = "The parent customer is inactive."
	msgParentActiveFirst = "Make the parent customer active first."
	msgAddressShape      = "An address has only street, street line 2, city, state or region, postal code and country, each at most 200 characters."
	msgDeleteHasSubs     = "This customer has sub-customers, so it cannot be deleted."
)

// addressParts are the keys of a stored address, the same list as
// ADDRESS_PARTS in tinycld/books/lib/address.ts.
var addressParts = []string{"line1", "line2", "city", "region", "postal_code", "country"}

const maxAddressPart = 200

// activeSubCustomersMessage names how many active sub-customers keep a
// customer from being made inactive.
func activeSubCustomersMessage(n int) string {
	if n == 1 {
		return "This customer has 1 active sub-customer."
	}
	return fmt.Sprintf("This customer has %d active sub-customers.", n)
}

// Every customer guard reads other customers (the parent, sub-customers,
// siblings) inside serialized, so no other customer write can commit between
// the check and the write it allows.
func registerCustomerGuard(app core.App) {
	app.OnRecordCreate("books_customers").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return validateCustomer(tx, nil, e.Record)
		})
	})
	app.OnRecordUpdate("books_customers").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById("books_customers", e.Record.Id)
			if err != nil {
				return err
			}
			if err := validateCustomer(tx, stored, e.Record); err != nil {
				return err
			}
			return checkCustomerInactive(tx, stored, e.Record)
		})
	})
	app.OnRecordDelete("books_customers").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			subs, err := tx.CountRecords("books_customers", dbx.HashExp{"parent": e.Record.Id})
			if err != nil {
				return err
			}
			if subs > 0 {
				return refuse(msgDeleteHasSubs)
			}
			return nil
		})
	})
}

// validateCustomer stores the display name trimmed, then checks the parent,
// both addresses and the name among the customer's siblings. stored is the
// record before an update, nil on a create.
func validateCustomer(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("display_name"))
	r.Set("display_name", name)
	if err := validateCustomerParent(app, stored, r); err != nil {
		return err
	}
	for _, field := range []string{"billing_address", "shipping_address"} {
		if !isAddress(r.Get(field)) {
			return refuseField(field, msgAddressShape)
		}
	}
	return validateSiblingName(app, stored, r, name)
}

// customerNameKey is the form of a display name that two siblings may not
// share, its canonical caseless form (Unicode D145): NFD-normalized first, so
// a composed and a decomposed letter are one letter and a combining mark sits
// where the fold expects it, then case-folded for every letter, not only
// ASCII ones, with Cherokee folded to uppercase as CaseFolding.txt does, and
// NFC-normalized last, so the stored key is short.
func customerNameKey(trimmed string) string {
	return norm.NFC.String(cherokeeUpper(cases.Fold().String(norm.NFD.String(trimmed))))
}

// cherokeeUpper maps Cherokee lowercase letters to their uppercase letters.
// CaseFolding.txt folds Cherokee to uppercase, but x/text's cases.Fold swaps
// Cherokee case instead, so after that fold both cases must end here.
func cherokeeUpper(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 0xAB70 && r <= 0xABBF:
			return r - 0xAB70 + 0x13A0
		case r >= 0x13F8 && r <= 0x13FD:
			return r - 0x13F8 + 0x13F0
		}
		return r
	}, s)
}

// validateSiblingName sets name_key, overwriting whatever the request sent,
// and refuses a name whose key a sibling (a customer with the same parent;
// top-level customers share the empty parent) already has. The lookup runs
// on the unique (parent, name_key) index, which is the backstop for it.
// stored is the record before an update, nil on a create.
func validateSiblingName(app core.App, stored, r *core.Record, name string) error {
	key := customerNameKey(name)
	r.Set("name_key", key)
	parentID := r.GetString("parent")
	if stored != nil && stored.GetString("name_key") == key && stored.GetString("parent") == parentID {
		return nil
	}
	var siblings int
	err := app.DB().NewQuery(
		"SELECT COUNT(*) FROM books_customers WHERE parent = {:parent} AND name_key = {:key} AND id != {:id}",
	).Bind(dbx.Params{"parent": parentID, "key": key, "id": r.Id}).Row(&siblings)
	if err != nil {
		return fmt.Errorf("books: look up sibling customer names: %w", err)
	}
	if siblings > 0 {
		return refuseField("display_name", msgDuplicateName, name)
	}
	return nil
}

// validateCustomerParent keeps sub-customers one level deep and keeps every
// active sub-customer under an active parent: the parent is an existing
// top-level customer other than r, a customer with sub-customers stays
// top-level, and an active customer gets no inactive parent. stored is the
// record before an update, nil on a create.
func validateCustomerParent(app core.App, stored, r *core.Record) error {
	parentID := r.GetString("parent")
	if parentID == "" {
		return nil
	}
	if parentID == r.Id {
		return refuseField("parent", msgParentSelf)
	}
	parent, err := app.FindRecordById("books_customers", parentID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("parent", msgParentMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the parent customer: %w", err)
	}
	if parent.GetString("parent") != "" {
		return refuseField("parent", msgParentNotTopLevel)
	}
	if r.Id != "" {
		subs, err := app.CountRecords("books_customers", dbx.HashExp{"parent": r.Id})
		if err != nil {
			return err
		}
		if subs > 0 {
			return refuseField("parent", msgParentLocked)
		}
	}
	if r.GetBool("inactive") || !parent.GetBool("inactive") {
		return nil
	}
	// Only Make active keeps the parent it had: the parent is not what the
	// person picked, so the refusal names no field. A write that also moves
	// the customer is refused on the parent picked.
	if stored != nil && stored.GetBool("inactive") && stored.GetString("parent") == parentID {
		return refuse(msgParentActiveFirst)
	}
	return refuseField("parent", msgParentInactive)
}

// checkCustomerInactive refuses to make a customer inactive while any of its
// sub-customers is active. validateCustomerParent refuses the other way in:
// an active customer created, moved or made active under an inactive parent.
func checkCustomerInactive(app core.App, stored, next *core.Record) error {
	if stored.GetBool("inactive") || !next.GetBool("inactive") {
		return nil
	}
	active, err := app.CountRecords("books_customers", dbx.HashExp{"parent": next.Id, "inactive": false})
	if err != nil {
		return err
	}
	if active > 0 {
		return refuse("%s", activeSubCustomersMessage(int(active)))
	}
	return nil
}

// isAddress reports whether a stored JSON value is null or an address: an
// object whose keys are exactly addressParts, each a string of at most
// maxAddressPart characters.
func isAddress(value any) bool {
	raw, err := json.Marshal(value)
	if err != nil {
		return false
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return true
	}
	var parts map[string]any
	if err := json.Unmarshal(raw, &parts); err != nil || parts == nil {
		return false
	}
	if len(parts) != len(addressParts) {
		return false
	}
	for _, key := range addressParts {
		text, ok := parts[key].(string)
		if !ok || utf8.RuneCountInString(text) > maxAddressPart {
			return false
		}
	}
	return true
}
