package books

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const partyContactsCollection = "books_party_contacts"

const (
	msgContactOneParty     = "A contact belongs to exactly one customer or vendor."
	msgContactPartyMissing = "That customer or vendor no longer exists."
)

// partyFields are the contact's party columns and the collection each names.
var partyFields = []struct{ field, collection string }{
	{"customer", "books_customers"},
	{"vendor", "books_vendors"},
}

// registerPartyContactGuards binds the contact rules on every create and
// update, inside serializedThen: the check sees the party the write names, and
// a primary contact clears the flag on its party's other contacts in the same
// transaction as its own save, so two contacts of one party are never both
// primary after a commit.
func registerPartyContactGuards(app core.App) {
	app.OnRecordCreate(partyContactsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e,
			func(tx core.App) error { return checkPartyContact(tx, e.Record) },
			func(tx core.App) error { return clearOtherPrimaries(tx, e.Record) })
	})
	app.OnRecordUpdate(partyContactsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e,
			func(tx core.App) error { return checkPartyContact(tx, e.Record) },
			func(tx core.App) error { return clearOtherPrimaries(tx, e.Record) })
	})
}

// contactParty is the one party column the contact sets and its value; ok is
// false when it sets none or both.
func contactParty(r *core.Record) (field, collection, id string, ok bool) {
	set := 0
	for _, p := range partyFields {
		if v := r.GetString(p.field); v != "" {
			set++
			field, collection, id = p.field, p.collection, v
		}
	}
	return field, collection, id, set == 1
}

func checkPartyContact(tx core.App, r *core.Record) error {
	_, collection, id, ok := contactParty(r)
	if !ok {
		return refuse(msgContactOneParty)
	}
	if _, err := tx.FindRecordById(collection, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return refuse(msgContactPartyMissing)
		}
		return err
	}
	return nil
}

// clearOtherPrimaries unsets is_primary on every other contact of the saved
// contact's party, when the saved contact is primary. Each is saved through
// the app, so its own guard and realtime run.
func clearOtherPrimaries(tx core.App, r *core.Record) error {
	if !r.GetBool("is_primary") {
		return nil
	}
	field, _, id, ok := contactParty(r)
	if !ok {
		return nil
	}
	others, err := tx.FindAllRecords(partyContactsCollection,
		dbx.HashExp{field: id, "is_primary": true},
		dbx.Not(dbx.HashExp{"id": r.Id}),
	)
	if err != nil {
		return err
	}
	for _, other := range others {
		other.Set("is_primary", false)
		if err := tx.Save(other); err != nil {
			return err
		}
	}
	return nil
}
