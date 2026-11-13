package books

import (
	"sync"

	"github.com/pocketbase/pocketbase/core"
)

// A mark says that Books itself is writing a record's rows inside one
// transaction (a restatement, a cascade, a conversion), so the guards of those
// rows let the write through. It belongs to that transaction: the app store is
// one object for an app and all its transactions, so a mark kept there is read
// by a write of another request, which then skips its guard.
type txMarkKey struct {
	tx       *core.TxAppInfo
	name, id string
}

var txMarks sync.Map // txMarkKey → true

// setTxMark marks id under name for tx's transaction and returns the func
// that clears the mark. A nested RunInTransaction joins its outer transaction
// and has the same TxAppInfo, so a whole batch request reads one mark. Outside
// a transaction it marks nothing: every Books guard runs in one (serialized).
func setTxMark(tx core.App, name, id string) func() {
	info := tx.TxInfo()
	if info == nil {
		return func() {}
	}
	key := txMarkKey{info, name, id}
	txMarks.Store(key, true)
	return func() { txMarks.Delete(key) }
}

func hasTxMark(tx core.App, name, id string) bool {
	info := tx.TxInfo()
	if info == nil {
		return false
	}
	_, ok := txMarks.Load(txMarkKey{info, name, id})
	return ok
}
