package books

import "github.com/pocketbase/pocketbase/core"

// bindSerializedGuard binds check on every create and update of collection,
// inside serialized, so no other write can commit between the check and the
// write it allows. stored is the record before an update, nil on a create.
func bindSerializedGuard(app core.App, collection string, check func(tx core.App, stored, r *core.Record) error) {
	app.OnRecordCreate(collection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return check(tx, nil, e.Record)
		})
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
