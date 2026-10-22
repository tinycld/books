package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// settingsID is the one books_settings row (pb-migrations/2100000001).
const settingsID = "bookssettings01"

type settings struct {
	CloseDate            string
	FiscalYearStartMonth int
	Currency             string
}

func loadSettings(app core.App) (settings, error) {
	r, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return settings{}, fmt.Errorf("books: read settings: %w", err)
	}
	return settings{
		CloseDate:            r.GetString("close_date"),
		FiscalYearStartMonth: r.GetInt("fiscal_year_start_month"),
		Currency:             r.GetString("currency"),
	}, nil
}

// stampCurrency gives a new money-bearing row the books currency and refuses
// any other. v0 keeps one currency; every row carries the column so
// multi-currency needs no migration.
func stampCurrency(app core.App, r *core.Record) error {
	s, err := loadSettings(app)
	if err != nil {
		return err
	}
	switch r.GetString("currency") {
	case "":
		r.Set("currency", s.Currency)
	case s.Currency:
	default:
		return refuse("Books uses one currency (%s). %s is not supported yet.", s.Currency, r.GetString("currency"))
	}
	return nil
}

func registerSettingsGuard(app core.App) {
	// The close date is checked only when it changes, so an edit of another
	// setting is never refused over the close date.
	// Serialized with posting: an entry that posts after the pending
	// auto-reversal check would otherwise slip under the new close date.
	app.OnRecordUpdate("books_settings").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			// The stored row, not Original(): a caller that saved and changed
			// the record again without reloading carries a stale Original().
			stored, err := tx.FindRecordById("books_settings", e.Record.Id)
			if err != nil {
				return fmt.Errorf("read settings: %w", err)
			}
			closeDate := e.Record.GetString("close_date")
			if closeDate == stored.GetString("close_date") {
				return nil
			}
			return checkCloseDate(tx, closeDate)
		})
	})
	app.OnRecordDelete("books_settings").BindFunc(func(e *core.RecordEvent) error {
		return refuse("Books settings cannot be deleted.")
	})
}

// checkCloseDate validates a new close date. Empty means no period is closed.
func checkCloseDate(app core.App, closeDate string) error {
	if closeDate == "" {
		return nil
	}
	if _, err := parseDay(closeDate); err != nil {
		return refuse("Close date: %v.", err)
	}
	return checkPendingAutoReversals(app, closeDate)
}
