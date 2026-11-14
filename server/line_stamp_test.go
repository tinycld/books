package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// A line's posted flag and date are the posting stamp: every report selects
// lines by them. Only stampPosted writes them.

func requireUnstamped(t *testing.T, app core.App, entryID string) {
	t.Helper()
	for _, line := range mustLines(t, app, entryID) {
		if line.GetBool("posted") || line.GetString("date") != "" {
			t.Fatalf("line %s is stamped: posted %v, date %q", line.Id, line.GetBool("posted"), line.GetString("date"))
		}
	}
}

// The review's reproduction: posted and a date on a line of a draft.
func TestLineStamp_AGoWriteCannotStampADraftLine(t *testing.T) {
	for name, fields := range map[string]map[string]any{
		"posted": {"posted": true},
		"date":   {"date": "2026-05-10"},
		"both":   {"posted": true, "date": "2026-05-10"},
	} {
		t.Run(name, func(t *testing.T) {
			env := newLedgerEnv(t)
			entry := env.sale(t, "2026-05-10", 100)
			line := mustLines(t, env.app, entry.Id)[0]
			requireRefused(t, setFields(t, env.app, "books_journal_lines", line.Id, fields), msgLineStampByBooks)
			requireUnstamped(t, env.app, entry.Id)
		})
	}
}

func TestLineStamp_ANewLineCannotStartStamped(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	col, err := env.app.FindCollectionByNameOrId("books_journal_lines")
	if err != nil {
		t.Fatal(err)
	}
	for _, fields := range []map[string]any{{"posted": true}, {"date": "2026-05-10"}} {
		line := core.NewRecord(col)
		line.Load(map[string]any{"entry": entry.Id, "account": env.rent.Id, "debit": 5, "position": 9})
		line.Load(fields)
		requireRefused(t, env.app.Save(line), msgLineStampByBooks)
	}
	if n := len(mustLines(t, env.app, entry.Id)); n != 2 {
		t.Fatalf("lines = %d, want 2", n)
	}
}

func TestLineStamp_ALinesCurrencyCannotChange(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	line := mustLines(t, env.app, entry.Id)[0]
	requireRefused(t, setFields(t, env.app, "books_journal_lines", line.Id, map[string]any{"currency": "EUR"}), msgLineCurrencyFixed)
	if got := reload(t, env.app, "books_journal_lines", line.Id).GetString("currency"); got != "USD" {
		t.Fatalf("currency = %q, want USD", got)
	}
}

// A superuser's request skips the rules that pin the fields.
func TestLineStamp_ASuperuserRequestIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-10", 100)
	line := mustLines(t, env.app, entry.Id)[0]
	apiReq{
		method: http.MethodPatch, url: "/api/collections/books_journal_lines/records/" + line.Id,
		token: tokenFor(t, mkSuperuser(t, env.app)), body: `{"posted":true,"date":"2026-05-10"}`,
		want: http.StatusBadRequest, content: []string{msgLineStampByBooks},
	}.run(t, env.app)
}

// One batch: an amount change that the stamp follows. Both roll back.
func TestLineStamp_ABatchIsRefusedAndChangesNothing(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entry := env.sale(t, "2026-05-10", 100)
	debit := lineWith(t, mustLines(t, env.app, entry.Id), true)
	ops := []string{
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"debit":900}}`, debit.Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"posted":true}}`, debit.Id),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, mkSuperuser(t, env.app)),
		body: batchBody(ops...), want: http.StatusBadRequest, content: []string{msgLineStampByBooks},
	}.run(t, env.app)
	if got := reload(t, env.app, "books_journal_lines", debit.Id).GetInt("debit"); got != 100 {
		t.Fatalf("debit = %d, want 100", got)
	}
	requireUnstamped(t, env.app, entry.Id)
}

// Posting still stamps every line, through the same hooks.
func TestLineStamp_APostStampsItsLines(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	for _, line := range mustLines(t, env.app, entry.Id) {
		if !line.GetBool("posted") || line.GetString("date") != "2026-05-10" {
			t.Fatalf("line %s: posted %v, date %q", line.Id, line.GetBool("posted"), line.GetString("date"))
		}
	}
	requireNoDrift(t, env.app)
}

// The mark is gone when the post's stamp ends: a write later in the same
// transaction cannot use it, for the posted entry or for another draft.
func TestLineStamp_TheMarkDoesNotOutliveThePost(t *testing.T) {
	env := newLedgerEnv(t)
	posting := env.sale(t, "2026-05-10", 100)
	other := env.sale(t, "2026-05-11", 200)
	err := env.app.RunInTransaction(func(tx core.App) error {
		if err := setStatus(tx, posting.Id, statusPosted, ""); err != nil {
			return err
		}
		if isPosting(tx, posting.Id) {
			t.Error("the posting mark is still set after the post")
		}
		line := mustLines(t, tx, other.Id)[0]
		line.Set("posted", true)
		line.Set("date", "2026-05-11")
		return tx.Save(line)
	})
	requireRefused(t, err, msgLineStampByBooks)
	// The whole transaction rolled back.
	requireUnstamped(t, env.app, posting.Id)
	requireUnstamped(t, env.app, other.Id)
}

// A reversal's lines and a document's lines are written by Books and stamped
// by the same post.
func TestLineStamp_AVoidAndAReversalStillPost(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	if err := setStatus(env.app, entry.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	for _, line := range mustLines(t, env.app, findReversal(t, env.app, entry.Id).Id) {
		if !line.GetBool("posted") {
			t.Fatalf("a line of the void's reversal is not stamped")
		}
	}
	requireNoDrift(t, env.app)
}
