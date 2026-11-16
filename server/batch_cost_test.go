package books

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/security"
)

// The batch limits core sets (coreserver/batch_settings.go). A test app does
// not run core's OnServe hook, so the test applies them itself. The race
// detector makes the code run 2 to 20 times slower (the Go race detector
// documentation), so under -race the timeout is 15s, the most the human allows
// for a test (2026-11-16): the timeout models production speed, and the
// statement bounds of the cost tests do not change.
func enableBatch(t testing.TB, app core.App) {
	t.Helper()
	timeout := int64(3)
	if raceDetector {
		timeout = 15
	}
	settings := app.Settings()
	settings.Batch = core.BatchConfig{Enabled: true, MaxRequests: 1100, Timeout: timeout, MaxBodySize: 8 << 20}
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

// statementsOf is timedRun with the text of every SQL statement the call ran.
func statementsOf(t *testing.T, app *tests.TestApp, r apiReq) (time.Duration, []string) {
	t.Helper()
	var mu sync.Mutex
	var statements []string
	var took time.Duration
	recordStatements(t, app, func(statement string) {
		mu.Lock()
		defer mu.Unlock()
		statements = append(statements, statement)
	}, func() {
		took = timedRun(t, app, r)
	})
	return took, statements
}

var sqlLiteral = regexp.MustCompile(`'(?:[^']|'')*'|\b\d+\b`)

// A statement that addresses one row: an insert, or a statement that finds its
// row by its id or by a key with LIMIT 1.
var oneRowStatement = regexp.MustCompile("^INSERT INTO |(WHERE (`\\w+`\\.)?`id`=\\?|LIMIT \\?)$")

// statementShapes counts the statements by their text without the values.
func statementShapes(statements []string) map[string]int {
	shapes := map[string]int{}
	for _, s := range statements {
		shapes[sqlLiteral.ReplaceAllString(s, "?")]++
	}
	return shapes
}

// requireLinearCost compares the statements of the same write on a small and a
// large entry, addedLines apart. Each added line may cost at most perLine
// statements, and each statement that runs more times on the large entry (one
// for each line) must address one row. Otherwise a write of N lines reads N*N
// rows, even when the statement count stays the same: a per-line statement
// that now reads every line of the entry.
func requireLinearCost(t *testing.T, small, large []string, addedLines, perLine int) {
	t.Helper()
	if grew := len(large) - len(small); grew > perLine*addedLines {
		t.Errorf("%d more statements for %d more lines, want at most %d for each line. A line write makes more statements than it did; if the new statements are needed, measure again and set the bound",
			grew, addedLines, perLine)
	}
	smallShapes := statementShapes(small)
	var wide []string
	for shape, n := range statementShapes(large) {
		if n > smallShapes[shape] && !oneRowStatement.MatchString(shape) {
			wide = append(wide, fmt.Sprintf("%d -> %d: %s", smallShapes[shape], n, shape))
		}
	}
	sort.Strings(wide)
	if len(wide) > 0 {
		t.Errorf("a statement that runs for each line reads more than one row, so the write reads N*N rows:\n%s", strings.Join(wide, "\n"))
	}
}

// The wall time of a batch changes with the machine (the 1,000-line create
// took 0.45s on a laptop and 1.5s on a CI runner), so the cost tests log it and
// bound the SQL statements instead: the count is the same on every machine.
// The create bound is the measured value (2026-11-15) plus 10 percent; one more
// statement for each line write passes it by 1,000. The post and the replace
// bound the statements of each line exactly (requireLinearCost).
const (
	draftCreateStatementBound = 10455
	// The post of each line: its account read, its stamp (the line and entry
	// reads, the relation checks, the update) and its month row (the read and
	// the update). Measured 2026-11-15.
	draftPostStatementsPerLine = 9
	// Each line of a replace and post: its delete, its create, and its post.
	// Measured 2026-11-15.
	draftReplaceStatementsPerLine = 24
)

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

	took, statements := costedRun(t, env.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{entryID},
	})
	t.Logf("create of a 1,000-line draft in one batch: %s, %d statements", took, statements)
	if statements > draftCreateStatementBound {
		t.Fatalf(msgStatementBound, statements, draftCreateStatementBound)
	}
	if got := reload(t, env.app, "books_journal_entries", entryID).GetInt("total"); got != 500 {
		t.Fatalf("draft total = %d, want 500", got)
	}
}

// postBigDraft posts a draft of `lines` lines (built one transaction for each
// line) in one PATCH and returns the statements of the post.
func postBigDraft(t *testing.T, lines int) []string {
	t.Helper()
	env := newLedgerEnv(t)
	built := time.Now()
	entry := bigDraft(t, env, lines)
	t.Logf("build of a %d-line draft, one transaction for each line: %s", lines, time.Since(built))

	took, statements := statementsOf(t, env.app, apiReq{
		method: http.MethodPatch, url: "/api/collections/books_journal_entries/records/" + entry.Id,
		token: tokenFor(t, env.users.bookkeeper),
		body:  postBody(t, env.app, entry.Id), want: http.StatusOK, content: []string{`"status":"posted"`},
	})
	t.Logf("post of a %d-line draft: %s, %d statements", lines, took, len(statements))
	requireNoDrift(t, env.app)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != lines/2 || c != 0 {
		t.Fatalf("bank month row = %d/%d, want %d/0", d, c, lines/2)
	}
	return statements
}

// The post is one PATCH, not a batch, so no batch timeout limits it: the
// statements of each line are its only bound.
func TestBatchCost_Post1000LineDraft(t *testing.T) {
	small := postBigDraft(t, 500)
	large := postBigDraft(t, 1000)
	requireLinearCost(t, small, large, 500, draftPostStatementsPerLine)
}

// replaceAndPost replaces every line of a draft of `lines` lines, then posts
// it, in one batch (the deletes, the creates, one entry update), and returns
// the statements of the batch.
func replaceAndPost(t *testing.T, lines int) []string {
	t.Helper()
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entry := bigDraft(t, env, lines)
	saw := revisionOf(t, env.app, entry.Id)

	var ops []string
	for _, line := range mustLines(t, env.app, entry.Id) {
		ops = append(ops, fmt.Sprintf(`{"method":"DELETE","url":"/api/collections/books_journal_lines/records/%s"}`, line.Id))
	}
	for i := 0; i < lines; i++ {
		if i%2 == 0 {
			ops = append(ops, lineCreateOp(entry.Id, env.checking, 2, 0, i))
		} else {
			ops = append(ops, lineCreateOp(entry.Id, env.revenue, 0, 2, i))
		}
	}
	ops = append(ops, fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/%s","body":{"status":"posted","revision":%d}}`, entry.Id, saw+1))

	took, statements := statementsOf(t, env.app, apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusOK, content: []string{`"status":"posted"`},
	})
	t.Logf("replace of %d lines and the post in one batch: %s, %d statements", lines, took, len(statements))
	posted := reload(t, env.app, "books_journal_entries", entry.Id)
	if posted.GetInt("total") != lines || posted.GetInt("revision") != saw+1 {
		t.Fatalf("total/revision = %d/%d, want %d/%d", posted.GetInt("total"), posted.GetInt("revision"), lines, saw+1)
	}
	requireNoDrift(t, env.app)
	return statements
}

// The editor's largest save: every one of 200 lines replaced, then the post,
// in one batch. Line deletes run only here, so this test alone bounds them.
func TestBatchCost_ReplaceAndPost200Lines(t *testing.T) {
	small := replaceAndPost(t, 100)
	large := replaceAndPost(t, 200)
	requireLinearCost(t, small, large, 100, draftReplaceStatementsPerLine)
}
