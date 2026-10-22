package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// maxLinesPerEntry keeps an entry's lines inside one back-relation expand,
// which PocketBase caps at 1000 rows. It also keeps the sum of an entry's
// lines (at most 1000 x 10^15) inside Go's int while it is checked against
// maxStoredAmount.
const maxLinesPerEntry = 1000

// maxAmount is the largest line amount in minor units, ten trillion dollars.
// It is below maxStoredAmount, so one line alone always fits; the entry total
// and the balance rows are checked against maxStoredAmount separately.
const maxAmount = 1_000_000_000_000_000

// maxStoredAmount is the largest total Books stores: 2^53-1 minor units.
// PocketBase number fields are float64 in Go and JavaScript, and above 2^53-1
// a float64 drops integers, so a larger total would be saved wrong and drift
// from the ledger with no way for a rebuild to repair it.
const maxStoredAmount = 1<<53 - 1

// postEntry is the point of enforcement (spec, Ledger rules). It runs inside
// the entry update's transaction, before PocketBase writes the entry. Lines
// are validated before an edit voids its original, so a bad correction leaves
// the original untouched. Every error is returned, never handled here: a
// reversal or an edit posts inside the caller's transaction, which has no
// savepoint, so only a rollback of the whole transaction undoes its writes.
func postEntry(tx core.App, entry *core.Record, now time.Time) error {
	day := entry.GetString("date")
	if _, err := parseDay(day); err != nil {
		return refuse("Date: %v.", err)
	}
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	if err := checkClosePeriod(tx, entry, s, day, now); err != nil {
		return err
	}
	if err := checkAutoReverseDate(entry, s); err != nil {
		return err
	}

	var reversed *core.Record
	if entry.GetString("reverses") != "" {
		target, err := reversalTarget(tx, entry)
		if err != nil {
			return err
		}
		if err := writeReversalLines(tx, entry, target); err != nil {
			return err
		}
		reversed = target
	}

	lines, err := entryLines(tx, entry.Id)
	if err != nil {
		return err
	}
	total, err := validateLines(tx, entry, lines, reversed != nil)
	if err != nil {
		return err
	}
	seq, number, err := numberFor(tx, entry, reversed, now)
	if err != nil {
		return err
	}
	return stampPosted(tx, entry, lines, day, seq, number, total, now)
}

// stampPosted freezes a validated entry: its lines carry the posting date,
// each line reaches its account's month row, and the entry takes its number.
func stampPosted(tx core.App, entry *core.Record, lines []*core.Record, day string, seq int, number string, total int, now time.Time) error {
	currency := entry.GetString("currency")
	for _, line := range lines {
		line.Set("posted", true)
		line.Set("date", day)
		if err := tx.Save(line); err != nil {
			return fmt.Errorf("books: stamp line %s: %w", line.Id, err)
		}
		if err := applyToBalances(tx, line.GetString("account"), day, line.GetInt("debit"), line.GetInt("credit"), currency); err != nil {
			return err
		}
	}
	entry.Set("sequence", seq)
	entry.Set("number", number)
	entry.Set("total", total)
	entry.Set("posted_at", now)
	return nil
}

func entryLines(app core.App, entryID string) ([]*core.Record, error) {
	lines, err := app.FindRecordsByFilter("books_journal_lines", "entry = {:entry}", "position,id", 0, 0,
		dbx.Params{"entry": entryID})
	if err != nil {
		return nil, fmt.Errorf("books: read lines of %s: %w", entryID, err)
	}
	return lines, nil
}

// validateLines checks every line and returns the entry total. allowInactive
// is for reversals: a void must stay possible after an account is retired.
func validateLines(tx core.App, entry *core.Record, lines []*core.Record, allowInactive bool) (int, error) {
	if len(lines) < 2 {
		return 0, refuse("A journal entry needs at least two lines.")
	}
	if len(lines) > maxLinesPerEntry {
		return 0, refuse("A journal entry can have at most %d lines.", maxLinesPerEntry)
	}
	currency := entry.GetString("currency")
	debits, credits := 0, 0
	for i, line := range lines {
		n := i + 1
		d, c := line.GetInt("debit"), line.GetInt("credit")
		switch {
		case d < 0 || c < 0:
			return 0, refuse("Line %d: amounts cannot be negative.", n)
		case d > 0 && c > 0:
			return 0, refuse("Line %d has both a debit and a credit. Use one per line.", n)
		case d == 0 && c == 0:
			return 0, refuse("Line %d has no amount. Enter an amount or remove the line.", n)
		case d > maxAmount || c > maxAmount:
			return 0, refuse("Line %d: the amount is too large.", n)
		}
		account, err := tx.FindRecordById("books_accounts", line.GetString("account"))
		if errors.Is(err, sql.ErrNoRows) {
			return 0, refuse("Line %d: the account does not exist.", n)
		}
		if err != nil {
			return 0, fmt.Errorf("books: read the account of line %d: %w", n, err)
		}
		if account.GetBool("inactive") && !allowInactive {
			return 0, refuse("Line %d: account %s is inactive.", n, account.GetString("name"))
		}
		if account.GetString("currency") != currency || line.GetString("currency") != currency {
			return 0, refuse("Line %d: its currency does not match the entry (%s).", n, currency)
		}
		debits += d
		credits += c
	}
	if debits != credits {
		gap := debits - credits
		if gap < 0 {
			gap = -gap
		}
		return 0, refuse("Debits (%s) do not equal credits (%s). The entry is out of balance by %s.",
			formatMinor(debits), formatMinor(credits), formatMinor(gap))
	}
	if debits > maxStoredAmount {
		return 0, refuse("The entry total (%s) is more than the largest amount Books can store (%s).",
			formatMinor(debits), formatMinor(maxStoredAmount))
	}
	return debits, nil
}

// checkClosePeriod refuses a post on or before the close date unless the
// poster holds an unexpired override, which the entry then records.
func checkClosePeriod(tx core.App, entry *core.Record, s settings, day string, now time.Time) error {
	if s.CloseDate == "" || day > s.CloseDate {
		return nil
	}
	override, err := activeOverride(tx, entry.GetString("posted_by"), now)
	if err != nil {
		return err
	}
	if override == nil {
		return refuse("The books are closed through %s. Ask a Books admin for a close-date override to post on %s.", s.CloseDate, day)
	}
	entry.Set("close_override", override.Id)
	return nil
}

// checkAutoReverseDate also keeps the date after the close date. The
// automatic reversal posts with no override, so one dated in the closed
// period could never post, and the close date could never move past it.
func checkAutoReverseDate(entry *core.Record, s settings) error {
	on := entry.GetString("auto_reverse_on")
	if on == "" {
		return nil
	}
	if entry.GetString("reverses") != "" {
		return refuse("A reversal cannot itself reverse automatically.")
	}
	if _, err := parseDay(on); err != nil {
		return refuse("Auto-reverse date: %v.", err)
	}
	if on <= entry.GetString("date") {
		return refuse("The auto-reverse date must be after the entry date.")
	}
	if s.CloseDate != "" && on <= s.CloseDate {
		return refuse("The books are closed through %s, so the auto-reverse date must be after it.", s.CloseDate)
	}
	return nil
}

// formatMinor renders minor units for a message: 123456 -> 1234.56.
func formatMinor(n int) string {
	sign := ""
	if n < 0 {
		sign, n = "-", -n
	}
	return fmt.Sprintf("%s%d.%02d", sign, n/100, n%100)
}
