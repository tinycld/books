package books

import "github.com/pocketbase/pocketbase/core"

// registerLedger binds every ledger rule the server enforces. Model hooks
// (OnRecordCreate/Update/Delete), not request hooks, wherever the rule
// protects the books: they run for every write (REST, a batch, another
// package's Go), so nothing can post, or change a posted entry, around them.
// Request hooks only stamp who acted, and refuse the one write that Books
// itself makes through the model path: the lines of a reversal.
func registerLedger(app core.App) {
	registerSettingsGuard(app)
	registerSequenceGuard(app)
	registerCloseOverrideHooks(app)
	registerAccountGuard(app)
	registerEntryHooks(app)
	registerLineHooks(app)
	registerImmutabilityGuards(app)
}

// serialized runs check and the write it guards in one transaction. A
// PocketBase create or update has no transaction of its own, and a delete
// opens one only after the delete hooks run, so a check made outside one can
// pass, a post can commit, and the write then lands on what the check no
// longer saw. The write pool has one connection, so inside the transaction
// no post can commit between the check and the write. e.App is the
// transaction while the write runs, so PocketBase's own write joins it, and
// is restored after.
func serialized(e *core.RecordEvent, check func(tx core.App) error) error {
	original := e.App
	defer func() { e.App = original }()
	return original.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := check(tx); err != nil {
			return err
		}
		return e.Next()
	})
}
