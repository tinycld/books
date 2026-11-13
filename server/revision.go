package books

import (
	"net/http"
	"sync"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// A draft's revision counts the transactions that changed it or its lines.
// A person who saves or posts a draft states the revision they saw; Books
// refuses the write when the draft changed after that, so nobody posts
// amounts they did not review.
//
// The count is per transaction, not per write: a save of fifty lines is one
// change by one editor. The first write of a transaction records the draft's
// revision then (the base); the transaction leaves the draft at base + 1.

const msgRevisionConflict = "This entry changed after you opened it. Load it again, then review it before you save or post."

func errRevisionConflict() error {
	return router.NewApiError(http.StatusConflict, msgRevisionConflict, nil)
}

// touchKey names one draft in one transaction. A nested RunInTransaction
// joins its outer transaction and has the same TxAppInfo, so a whole batch
// request shares one key for each entry.
type touchKey struct {
	tx    *core.TxAppInfo
	entry string
}

var (
	draftTouches sync.Map // touchKey → base revision (int)
	ownWrites    sync.Map // touchKey → true while Books itself saves the draft
)

// draftBase returns the revision the draft had when tx first touched it, and
// whether this call is that first touch. The entry is forgotten when the
// transaction ends, committed or not.
func draftBase(tx core.App, entryID string, stored int) (int, bool) {
	info := tx.TxInfo()
	if info == nil {
		// Every Books hook runs in a transaction; a caller outside one gets a
		// base that lasts for its one write.
		return stored, true
	}
	key := touchKey{info, entryID}
	if base, ok := draftTouches.Load(key); ok {
		return base.(int), false
	}
	draftTouches.Store(key, stored)
	info.OnComplete(func(error) error {
		draftTouches.Delete(key)
		return nil
	})
	return stored, true
}

// markCreated records that tx created the entry at revision 1, so its first
// lines, written in the same transaction, are part of the create.
func markCreated(tx core.App, entryID string) {
	draftBase(tx, entryID, 0)
}

// ownWrite marks a save of the draft that Books makes itself (its total and
// revision after a line write), so the entry's update hook lets it through.
func ownWrite(tx core.App, entryID string) (done func()) {
	key := touchKey{tx.TxInfo(), entryID}
	ownWrites.Store(key, true)
	return func() { ownWrites.Delete(key) }
}

func isOwnWrite(tx core.App, entryID string) bool {
	_, ok := ownWrites.Load(touchKey{tx.TxInfo(), entryID})
	return ok
}

// requestRevisions holds the revision a request stated, for the model hook
// that runs inside the write's transaction. Keyed by the record pointer, which
// the request handler and the model hooks share; never by id, so two requests
// for one entry cannot read each other's value.
var requestRevisions sync.Map // *core.Record → int

// checkRequestRevision records the revision a request states for a draft
// entry. A request that updates a draft must state one. The comparison is in
// settleRevision, inside the transaction, where no other write can come
// between the read and the save.
func checkRequestRevision(e *core.RecordRequestEvent) (done func(), err error) {
	noop := func() {}
	if e.Record.Original().GetString("status") != statusDraft {
		return noop, nil
	}
	info, err := e.RequestInfo()
	if err != nil {
		return noop, err
	}
	if _, stated := info.Body["revision"]; !stated {
		return noop, errRevisionConflict()
	}
	rec := e.Record
	requestRevisions.Store(rec, rec.GetInt("revision"))
	return func() { requestRevisions.Delete(rec) }, nil
}

// settleRevision is the revision rule for an update of a draft entry, a save
// or a post: the transaction leaves the draft at base + 1.
//
// A request states the revision a person saw, as base + 1. Any other value
// means the draft changed after that person read it, and the write is refused.
//
// Books' own Go callers (a reversal, the auto-reverse sweep, a document's
// post) state none. The value their record carries says nothing about what a
// person saw: a record kept from before a line write carries an old one. So
// it is replaced, as a stale total is, and never refused.
func settleRevision(tx core.App, stored, next *core.Record) error {
	base, _ := draftBase(tx, stored.Id, stored.GetInt("revision"))
	want := base + 1
	if stated, isRequest := requestRevisions.Load(next); isRequest && stated.(int) != want {
		return errRevisionConflict()
	}
	next.Set("revision", want)
	return nil
}
