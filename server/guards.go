package books

import "github.com/pocketbase/pocketbase/core"

// bindSerializedGuard binds check on every create and update of collection,
// inside serialized, so no other write can commit between the check and the
// write it allows. stored is the record before an update, nil on a create.
func bindSerializedGuard(app core.App, collection string, check func(tx core.App, stored, r *core.Record) error) {
	bindSerializedGuardThen(app, collection, check, nil)
}

// bindSerializedGuardThen is bindSerializedGuard with a step after a create's
// write, in the same transaction (serializedThen), for rows that must commit
// with the created record or not at all. A nil afterCreate is no step.
func bindSerializedGuardThen(app core.App, collection string, check func(tx core.App, stored, r *core.Record) error, afterCreate func(tx core.App, r *core.Record) error) {
	app.OnRecordCreate(collection).BindFunc(func(e *core.RecordEvent) error {
		var after func(tx core.App) error
		if afterCreate != nil {
			after = func(tx core.App) error { return afterCreate(tx, e.Record) }
		}
		return serializedThen(e, func(tx core.App) error {
			return check(tx, nil, e.Record)
		}, after)
	})
	app.OnRecordUpdate(collection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(collection, e.Record.Id)
			if err != nil {
				return err
			}
			return check(tx, stored, e.Record)
		})
	})
}
