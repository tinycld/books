package books

import (
	"strconv"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// urlKey is the key a report's link holds for rec (lib/record-key.ts): the
// number without its prefix when rec is posted, numbered and not a void
// reversal, else its id. rec is read again, so a record held from before its
// post gives its posted number.
func urlKey(t testing.TB, app core.App, rec *core.Record) string {
	t.Helper()
	fresh, err := app.FindRecordById(rec.Collection().Name, rec.Id)
	if err != nil {
		t.Fatalf("read %s %s: %v", rec.Collection().Name, rec.Id, err)
	}
	seq := fresh.GetInt("sequence")
	if fresh.GetString("status") != statusPosted || seq <= 0 || fresh.GetString("origin") == originVoidReversal {
		return fresh.Id
	}
	return strconv.Itoa(seq)
}
