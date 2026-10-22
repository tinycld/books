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
