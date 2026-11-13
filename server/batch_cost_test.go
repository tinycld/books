package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/security"
)

// The batch limits core sets (coreserver/batch_settings.go). A test app does
// not run core's OnServe hook, so the test applies them itself.
func enableBatch(t testing.TB, app core.App) {
	t.Helper()
	settings := app.Settings()
	settings.Batch = core.BatchConfig{Enabled: true, MaxRequests: 1100, Timeout: 3, MaxBodySize: 8 << 20}
	if err := app.Save(settings); err != nil {
		t.Fatalf("enable batch: %v", err)
	}
}

func batchBody(ops ...string) string {
	return `{"requests":[` + strings.Join(ops, ",") + `]}`
}

func lineCreateOp(entryID string, account *core.Record, debit, credit, position int) string {
	return fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"entry":%q,"account":%q,"debit":%d,"credit":%d,"position":%d}}`,
		entryID, account.Id, debit, credit, position)
}

// bigDraft saves a balanced draft of `lines` lines through the hooks: half
// debit the bank account, half credit income, one cent each.
func bigDraft(t testing.TB, env *ledgerEnv, lines int) *core.Record {
	t.Helper()
	rows := make([]ln, lines)
	for i := range rows {
		if i%2 == 0 {
			rows[i] = ln{env.checking, 1, 0}
		} else {
			rows[i] = ln{env.revenue, 0, 1}
		}
	}
	return mkDraft(t, env.app, "2026-05-10", rows...)
}

// timedRun is apiReq.run with the wall time of the call. It includes the
// router setup of ApiScenario, which is a few milliseconds.
func timedRun(t *testing.T, app *tests.TestApp, r apiReq) time.Duration {
	t.Helper()
	started := time.Now()
	r.run(t, app)
	return time.Since(started)
}

// costBound is half the batch timeout: room for a slower machine.
const costBound = 1500 * time.Millisecond

func TestBatchCost_Create1000LineDraft(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entryID := security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")

	ops := []string{fmt.Sprintf(`{"method":"POST","url":"/api/collections/books_journal_entries/records","body":{"id":%q,"date":"2026-05-10","status":"draft","doc_type":"journal","origin":"manual"}}`, entryID)}
	for i := 0; i < 1000; i++ {
		if i%2 == 0 {
			ops = append(ops, lineCreateOp(entryID, env.checking, 1, 0, i))
		} else {
			ops = append(ops, lineCreateOp(entryID, env.revenue, 0, 1, i))
		}
	}

	took := timedRun(t, env.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{entryID},
	})
	t.Logf("create of a 1,000-line draft in one batch: %s", took)
	if took > costBound {
		t.Fatalf("took %s, want under %s (the batch timeout is 3s)", took, costBound)
	}
	if got := reload(t, env.app, "books_journal_entries", entryID).GetInt("total"); got != 500 {
		t.Fatalf("draft total = %d, want 500", got)
	}
}

func TestBatchCost_Post1000LineDraft(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	built := time.Now()
	entry := bigDraft(t, env, 1000)
	t.Logf("build of a 1,000-line draft, one transaction for each line: %s", time.Since(built))

	took := timedRun(t, env.app, apiReq{
		method: http.MethodPatch, url: "/api/collections/books_journal_entries/records/" + entry.Id,
		token: tokenFor(t, env.users.bookkeeper),
		body:  postBody(t, env.app, entry.Id), want: http.StatusOK, content: []string{`"status":"posted"`},
	})
	t.Logf("post of a 1,000-line draft: %s", took)
	if took > costBound {
		t.Fatalf("took %s, want under %s (the batch timeout is 3s)", took, costBound)
	}
	requireNoDrift(t, env.app)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != 500 || c != 0 {
		t.Fatalf("bank month row = %d/%d, want 500/0", d, c)
	}
}
