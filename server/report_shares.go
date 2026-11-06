package books

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/offboard"
)

// Books' shipped reports are not published (published reports are hidden
// from guests, and Books bookkeepers are often guests), so a reader reaches
// them through a viewer share. Books keeps one direct viewer share on every
// `books.*` shipped report for each user whose books_access grants read, and
// removes it when that access goes or the user is offboarded. The report's
// owner (the first admin) needs none. An editor share someone gave by hand is
// never touched, and no viewer share is added beside it.
//
// These rows are written with app.Save, which skips core's share request
// guards (core/server/reports/shares.go): Books owns them.

const booksReportFilter = "shipped_key ~ 'books.%'"

func isBooksReport(r *core.Record) bool {
	return strings.HasPrefix(r.GetString("shipped_key"), "books.")
}

// booksReports lists every report a Books package ships. With a `%` in the
// value PocketBase's `~` is a plain LIKE, so the filter is a prefix match;
// LIKE ignores case, so isBooksReport checks the exact prefix.
func booksReports(app core.App) ([]*core.Record, error) {
	rows, err := app.FindRecordsByFilter("reports", booksReportFilter, "", 0, 0)
	if err != nil {
		return nil, fmt.Errorf("list Books reports: %w", err)
	}
	out := rows[:0]
	for _, r := range rows {
		if isBooksReport(r) {
			out = append(out, r)
		}
	}
	return out, nil
}

// canReadBooks reports whether userID may read the Books reports. An
// offboarded user keeps their role and Books grant (core anonymizes the
// record, it does not delete it), so books_access alone still says they can
// read; core's offboard contract removes their shares, so they count as
// unable to read. A user record that is gone can read nothing.
func canReadBooks(app core.App, userID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	user, err := app.FindRecordById("users", userID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read user %s: %w", userID, err)
	}
	if offboard.IsOffboarded(user) {
		return false, nil
	}
	level, err := levelForUser(app, userID)
	if err != nil {
		return false, err
	}
	return level.CanRead(), nil
}

// syncUserReportShares makes the user's direct viewer shares on the Books
// reports match their Books read access.
func syncUserReportShares(app core.App, userID string) error {
	canRead, err := canReadBooks(app, userID)
	if err != nil {
		return err
	}
	reports, err := booksReports(app)
	if err != nil {
		return err
	}
	for _, report := range reports {
		if canRead {
			err = addViewerShare(app, report, userID)
		} else {
			err = removeViewerShares(app, report, userID)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// shareBooksReport gives every user who can read Books a viewer share on
// report.
func shareBooksReport(app core.App, report *core.Record) error {
	readers, err := app.FindRecordsByFilter("books_access", "can_read = true", "", 0, 0)
	if err != nil {
		return fmt.Errorf("list Books readers: %w", err)
	}
	for _, r := range readers {
		userID := r.GetString("user")
		canRead, err := canReadBooks(app, userID)
		if err != nil {
			return err
		}
		if !canRead {
			continue
		}
		if err := addViewerShare(app, report, userID); err != nil {
			return err
		}
	}
	return nil
}

// reconcileBooksReportShares syncs every user, so a share a failed hook
// missed (or one removed by hand) comes back.
func reconcileBooksReportShares(app core.App) error {
	users, err := app.FindAllRecords("users")
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}
	var errs []error
	for _, u := range users {
		if err := syncUserReportShares(app, u.Id); err != nil {
			errs = append(errs, fmt.Errorf("user %s: %w", u.Id, err))
		}
	}
	return errors.Join(errs...)
}

// addViewerShare saves a viewer share of report for userID unless the user
// owns it or already has a direct share of any role.
func addViewerShare(app core.App, report *core.Record, userID string) error {
	if userID == "" || report.GetString("owner") == userID {
		return nil
	}
	_, err := app.FindFirstRecordByFilter("report_shares", "report = {:r} && user = {:u} && group = ''",
		dbx.Params{"r": report.Id, "u": userID})
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read the share of report %s for %s: %w", report.Id, userID, err)
	}
	col, err := app.FindCachedCollectionByNameOrId("report_shares")
	if err != nil {
		return fmt.Errorf("find report_shares: %w", err)
	}
	share := core.NewRecord(col)
	share.Set("report", report.Id)
	share.Set("user", userID)
	share.Set("role", "viewer")
	if err := app.Save(share); err != nil {
		// Two syncs can both find no share and both insert; core's unique
		// index refuses the second, and the share it wanted is there.
		if isNotUnique(err) {
			return nil
		}
		return fmt.Errorf("share report %s with %s: %w", report.Id, userID, err)
	}
	return nil
}

// isNotUnique reports whether err is only a unique index refusal, which
// PocketBase returns as validation errors coded validation_not_unique.
func isNotUnique(err error) bool {
	var errs validation.Errors
	if !errors.As(err, &errs) || len(errs) == 0 {
		return false
	}
	for _, fieldErr := range errs {
		var vErr validation.Error
		if !errors.As(fieldErr, &vErr) || vErr.Code() != "validation_not_unique" {
			return false
		}
	}
	return true
}

// removeViewerShares deletes the user's direct viewer shares on report;
// editor shares stay.
func removeViewerShares(app core.App, report *core.Record, userID string) error {
	if userID == "" || report.GetString("owner") == userID {
		return nil
	}
	rows, err := app.FindRecordsByFilter("report_shares",
		"report = {:r} && user = {:u} && group = '' && role = 'viewer'", "", 0, 0,
		dbx.Params{"r": report.Id, "u": userID})
	if err != nil {
		return fmt.Errorf("read the shares of report %s for %s: %w", report.Id, userID, err)
	}
	for _, row := range rows {
		if err := app.Delete(row); err != nil {
			return fmt.Errorf("remove the share of report %s for %s: %w", report.Id, userID, err)
		}
	}
	return nil
}

// registerReportShares keeps the shares in step. Books binds before core's
// reports.Register, so the serve handler calls e.Next() first: core's
// ReconcileShipped creates the shipped reports, then the reconcile runs. A
// failed sync is logged and never fails the write that caused it; the next
// serve start repairs it.
func registerReportShares(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if err := reconcileBooksReportShares(e.App); err != nil {
			log.Error("report shares not reconciled", "error", err)
		}
		return nil
	})
	app.OnRecordAfterCreateSuccess("reports").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if !isBooksReport(e.Record) {
			return nil
		}
		if err := shareBooksReport(e.App, e.Record); err != nil {
			log.ErrorContext(e.Context, "report share sync failed", "report", e.Record.Id, "error", err)
		}
		return nil
	})
	syncUser := func(e *core.RecordEvent, userID string) {
		if err := syncUserReportShares(e.App, userID); err != nil {
			log.ErrorContext(e.Context, "report share sync failed", "user", userID, "error", err)
		}
	}
	onUser := func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		syncUser(e, e.Record.Id)
		return nil
	}
	app.OnRecordAfterCreateSuccess("users").BindFunc(onUser)
	app.OnRecordAfterUpdateSuccess("users").BindFunc(onUser)
	// An update can move a row off Books or to another user, so the row as it
	// was is synced as well as the row as it is.
	onAccess := func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		synced := map[string]bool{}
		for _, row := range []*core.Record{e.Record, e.Record.Original()} {
			user := row.GetString("user")
			if row.GetString("pkg") == "books" && !synced[user] {
				synced[user] = true
				syncUser(e, user)
			}
		}
		return nil
	}
	app.OnRecordAfterCreateSuccess("org_pkg_access").BindFunc(onAccess)
	app.OnRecordAfterUpdateSuccess("org_pkg_access").BindFunc(onAccess)
	app.OnRecordAfterDeleteSuccess("org_pkg_access").BindFunc(onAccess)
}
