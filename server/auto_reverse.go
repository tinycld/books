package books

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"tinycld.org/core/background"
	"tinycld.org/core/logging"
	"tinycld.org/core/readonly"
)

var log = logging.ForPackage("books")

// The sweep runs on PocketBase's cron, at the top of every hour. The reversal
// is dated auto_reverse_on, not the sweep time, so an hour's delay changes no
// balance. Core's read-only guard skips a cron tick during a pause.
const (
	autoReverseJobID    = "books_auto_reverse"
	autoReverseSchedule = "0 * * * *"
)

// pendingAutoReversals selects the posted entries whose auto-reverse date is
// on or before through and that no reversal has settled. A reversal that was
// posted settles the entry even after it is voided: re-reversing would undo
// the person's void. A draft reversal settles nothing. A voided or edited
// original is void, not posted, so it never matches. The subquery repeats
// the partial index's own condition (reverses is not empty), so SQLite uses
// idx_books_je_reverses for the lookup instead of scanning the table.
func pendingAutoReversals(app core.App, through string) *dbx.SelectQuery {
	return app.RecordQuery("books_journal_entries").
		AndWhere(dbx.NewExp(`[[books_journal_entries.status]] = 'posted'
			AND [[books_journal_entries.auto_reverse_on]] != ''
			AND [[books_journal_entries.auto_reverse_on]] <= {:through}
			AND NOT EXISTS (
				SELECT 1 FROM {{books_journal_entries}} [[r]]
				WHERE [[r.reverses]] != '' AND [[r.reverses]] = [[books_journal_entries.id]]
					AND [[r.status]] != 'draft'
			)`, dbx.Params{"through": through})).
		OrderBy("books_journal_entries.auto_reverse_on", "books_journal_entries.id")
}

// runAutoReversals posts the reversal of every entry whose auto-reverse date
// has come, each in its own transaction, and returns how many it posted. A
// refused one (a closed period, a balance at the stored limit) is logged and
// left for a person; the sweep never forces it and goes on to the next.
//
// It must not run inside a transaction. PocketBase nests a transaction with
// no savepoint, so a refused reversal could not be undone on its own there,
// and logging it and going on would commit its partial writes.
//
// It stops between entries when ctx ends (the app's terminate) or read-only
// mode starts; the next sweep finds what is left.
func runAutoReversals(ctx context.Context, app core.App, now time.Time) (int, error) {
	if app.IsTransactional() {
		return 0, errors.New("the auto-reverse sweep must not run inside a transaction: each reversal commits on its own")
	}
	today := todayUTC(now)
	var due []*core.Record
	if err := pendingAutoReversals(app, today).All(&due); err != nil {
		return 0, fmt.Errorf("find due auto-reversals: %w", err)
	}
	posted := 0
	for _, entry := range due {
		// A sweep writes without a request, so read-only mode cannot refuse
		// it; it stops instead.
		if ctx.Err() != nil || readonly.Active() {
			break
		}
		done, err := reverseIfPending(app, entry.Id, today)
		if err != nil {
			logAutoReverseFailure(entry, err)
			continue
		}
		if done {
			posted++
		}
	}
	return posted, nil
}

// reverseIfPending posts one auto-reversal in its own transaction. It reads
// the entry again inside the transaction, so an entry voided or reversed
// since the sweep's query is left alone.
func reverseIfPending(app core.App, entryID, today string) (bool, error) {
	posted := false
	err := app.RunInTransaction(func(tx core.App) error {
		entry := &core.Record{}
		err := pendingAutoReversals(tx, today).
			AndWhere(dbx.HashExp{"books_journal_entries.id": entryID}).
			Limit(1).One(entry)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := autoReverse(tx, entry); err != nil {
			return err
		}
		posted = true
		return nil
	})
	return posted && err == nil, err
}

func logAutoReverseFailure(entry *core.Record, err error) {
	args := []any{"entry", entry.Id, "number", entry.GetString("number"), "err", err}
	var refusal *router.ApiError
	if errors.As(err, &refusal) && refusal.Status == http.StatusBadRequest {
		log.Warn("auto-reversal refused", args...)
		return
	}
	log.Error("auto-reversal failed", args...)
}

// autoReverse posts the reversal of entry dated its auto-reverse date. It
// goes through the same posting hook as a person's reversal: close date,
// stored limit, a new number, and inactive accounts allowed.
func autoReverse(tx core.App, entry *core.Record) error {
	rev, err := newReversalDraft(tx, entry, originAutoReversal, entry.GetString("auto_reverse_on"),
		"Automatic reversal of "+entry.GetString("number"), "")
	if err != nil {
		return err
	}
	return postDraft(tx, rev.Id, "")
}

// checkPendingAutoReversals refuses a close date on or after an auto-reverse
// date that has not been reversed yet: the sweep could then never post it.
func checkPendingAutoReversals(app core.App, closeDate string) error {
	entry := &core.Record{}
	err := pendingAutoReversals(app, closeDate).Limit(1).One(entry)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find pending auto-reversals: %w", err)
	}
	return refuse("%s reverses automatically on %s and has not been reversed yet. Reverse or void it before closing through %s.",
		entryName(entry), entry.GetString("auto_reverse_on"), closeDate)
}

// registerAutoReverseSweep puts the sweep on PocketBase's cron and also runs
// it when the server starts, so a reversal that fell due while the server was
// down does not wait for the next hour. Each run is a background job, so the
// app's terminate waits for it before the database closes.
func registerAutoReverseSweep(app core.App) {
	app.Cron().MustAdd(autoReverseJobID, autoReverseSchedule, func() { startAutoReverseSweep(app) })
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		startAutoReverseSweep(app)
		return e.Next()
	})
}

func startAutoReverseSweep(app core.App) {
	background.For(app, "books").Run("books auto-reverse sweep", func(ctx context.Context) {
		n, err := runAutoReversals(ctx, app, time.Now())
		if err != nil {
			log.ErrorContext(ctx, "auto-reverse sweep failed", "err", err)
			return
		}
		if n > 0 {
			log.InfoContext(ctx, "auto-reversals posted", "count", n)
		}
	})
}
