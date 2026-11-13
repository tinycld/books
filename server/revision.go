package books

import (
	"net/http"
	"sync"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// A revision counts the transactions that changed a record a person edits (a
// draft journal entry, an editable sales document) or one of its lines. A
// person who saves or posts it states the revision they saw; Books refuses the
// write when the record changed after that, so nobody posts amounts they did
// not review.
//
// The count is per transaction, not per write: a save of fifty lines is one
// change by one editor. The first write of a transaction records the revision
// then (the base); the transaction leaves the record at base + 1.

const msgRevisionConflict = "This entry changed after you opened it. Load it again, then review it before you save or post."

// errRevisionConflict is the refusal of a stale write. msg names the kind of
// record ("This invoice changed …").
func errRevisionConflict(msg string) error {
	return router.NewApiError(http.StatusConflict, msg, nil)
}

// touchKey names one record in one transaction. A nested RunInTransaction
// joins its outer transaction and has the same TxAppInfo, so a whole batch
// request shares one key for each record. An id is unique only in its
// collection.
type touchKey struct {
	tx         *core.TxAppInfo
	collection string
	id         string
}

var (
	draftTouches sync.Map // touchKey → base revision (int)
	ownWrites    sync.Map // touchKey → true while Books itself saves the record
)

// draftBase returns the revision the record had when tx first touched it, and
// whether this call is that first touch. The base is forgotten when the
// transaction ends, committed or not.
func draftBase(tx core.App, collection, id string, stored int) (int, bool) {
	info := tx.TxInfo()
	if info == nil {
		// Every Books hook runs in a transaction; a caller outside one gets a
		// base that lasts for its one write.
		return stored, true
	}
	key := touchKey{info, collection, id}
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

// markCreated records that tx created the record at revision 1, so its first
// lines, written in the same transaction, are part of the create.
func markCreated(tx core.App, collection, id string) {
	draftBase(tx, collection, id, 0)
}

// ownWrite marks a save of the record that Books makes itself (its totals and
// revision after a line write), so the record's update hook lets it through.
func ownWrite(tx core.App, collection, id string) (done func()) {
	key := touchKey{tx.TxInfo(), collection, id}
	ownWrites.Store(key, true)
	return func() { ownWrites.Delete(key) }
}

func isOwnWrite(tx core.App, collection, id string) bool {
	_, ok := ownWrites.Load(touchKey{tx.TxInfo(), collection, id})
	return ok
}

// requestRevisions holds the revision a request stated, for the model hook
// that runs inside the write's transaction. Keyed by the record pointer, which
// the request handler and the model hooks share; never by id, so two requests
// for one record cannot read each other's value.
var requestRevisions sync.Map // *core.Record → int

// checkRequestRevision records the revision a request states for a record a
// person edits. editable says whether the stored record is one (a draft, an
// estimate that is not closed); a request that updates such a record must
// state a revision. The comparison is in settleRevision, inside the
// transaction, where no other write can come between the read and the save.
func checkRequestRevision(e *core.RecordRequestEvent, editable bool, msg string) (done func(), err error) {
	noop := func() {}
	if !editable {
		return noop, nil
	}
	info, err := e.RequestInfo()
	if err != nil {
		return noop, err
	}
	if _, stated := info.Body["revision"]; !stated {
		return noop, errRevisionConflict(msg)
	}
	// PocketBase resolves "revision+": 1 to the stored value plus one before
	// this hook reads the body. That is always the right number and states
	// nothing about what the caller saw, so the body as sent must name the
	// value itself.
	sent := map[string]any{}
	if err := e.BindBody(&sent); err != nil {
		return noop, err
	}
	if _, plain := sent["revision"]; !plain {
		return noop, errRevisionConflict(msg)
	}
	rec := e.Record
	requestRevisions.Store(rec, rec.GetInt("revision"))
	return func() { requestRevisions.Delete(rec) }, nil
}

// settleRevision is the revision rule for an update of a record a person
// edits, a save or the write that ends its editing (a post, a close): the
// transaction leaves the record at base + 1.
//
// A request states the revision a person saw, as base + 1. Any other value
// means the record changed after that person read it, and the write is
// refused with msg.
//
// Books' own Go callers (a reversal, the auto-reverse sweep, a document's
// post, a restatement, a conversion) state none. The value their record
// carries says nothing about what a person saw: a record kept from before a
// line write carries an old one. So it is replaced, as a stale total is, and
// never refused.
func settleRevision(tx core.App, stored, next *core.Record, msg string) error {
	base, _ := draftBase(tx, stored.Collection().Name, stored.Id, stored.GetInt("revision"))
	want := base + 1
	if stated, isRequest := requestRevisions.Load(next); isRequest && stated.(int) != want {
		return errRevisionConflict(msg)
	}
	next.Set("revision", want)
	return nil
}
