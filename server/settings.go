package books

import (
	"database/sql"
	"errors"
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
		completing := false
		return serializedThen(e, func(tx core.App) error {
			// The stored row, not Original(): a caller that saved and changed
			// the record again without reloading carries a stale Original().
			stored, err := tx.FindRecordById("books_settings", e.Record.Id)
			if err != nil {
				return fmt.Errorf("read settings: %w", err)
			}
			closeDate := e.Record.GetString("close_date")
			if closeDate != stored.GetString("close_date") {
				if err := checkCloseDate(tx, closeDate); err != nil {
					return err
				}
			}
			// Checked only when it changes, as the close date: an account set
			// earlier that a direct write made inactive does not block an edit
			// of another setting.
			depositAccount := e.Record.GetString("sales_deposit_account")
			if depositAccount != stored.GetString("sales_deposit_account") {
				if err := checkSalesDepositSetting(tx, depositAccount); err != nil {
					return err
				}
			}
			completing = !stored.GetBool("setup_completed") && e.Record.GetBool("setup_completed")
			return nil
		}, func(tx core.App) error {
			// A skipped starter chart, or one made by hand or imported, may
			// hold no retained-earnings account when setup completes. This
			// runs after the write, so the number follows the ownership that
			// the same write saves.
			if !completing {
				return nil
			}
			return ensureRetainedEarnings(tx)
		})
	})
	app.OnRecordDelete("books_settings").BindFunc(func(e *core.RecordEvent) error {
		return refuse("Books settings cannot be deleted.")
	})
}

// msgSalesDepositSetting refuses a "Sales deposited to" account that a sale
// cannot be deposited to, keyed to sales_deposit_account.
const msgSalesDepositSetting = "Choose Ask or an active bank or Undeposited funds account"

// checkSalesDepositSetting validates a new "Sales deposited to": empty (Ask),
// or an account that exists and passes isDepositAccount. It runs before
// PocketBase's own relation check, so a missing account gets this text too.
func checkSalesDepositSetting(tx core.App, id string) error {
	if id == "" {
		return nil
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("sales_deposit_account", msgSalesDepositSetting)
	}
	if err != nil {
		return fmt.Errorf("books: read the sales deposit account: %w", err)
	}
	if !isDepositAccount(account) {
		return refuseField("sales_deposit_account", msgSalesDepositSetting)
	}
	return nil
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
