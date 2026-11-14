package books

import (
	"errors"
	"fmt"
	"time"
)

const dayLayout = "2006-01-02"

// firstYear is the first year of an accounting date. The client refuses an
// earlier year too (FIRST_YEAR, tinycld/books/lib/register-range.ts): it is
// almost always a mistyped year, and JavaScript's Date.UTC shows years 0 to 99
// as 1900 to 1999.
const firstYear = 1900

// dayTooEarlyError is the refusal of a real day before firstYear. It is a type
// so a caller with its own wording (a sales document) can tell it from a day
// that does not exist.
type dayTooEarlyError struct{ day string }

func (e dayTooEarlyError) Error() string {
	return fmt.Sprintf("%q is before %d, the first year Books accepts", e.day, firstYear)
}

func isDayTooEarly(err error) bool {
	var early dayTooEarlyError
	return errors.As(err, &early)
}

// parseDay validates an accounting date that a write stores. Books stores
// dates as YYYY-MM-DD text, not PocketBase datetimes: an accounting date is a
// calendar day with no time zone. The schema pattern checks the shape; this
// checks that the day exists and is not before firstYear.
func parseDay(s string) (time.Time, error) {
	d, err := parseCalendarDay(s)
	if err != nil {
		return time.Time{}, err
	}
	if d.Year() < firstYear {
		return time.Time{}, dayTooEarlyError{s}
	}
	return d, nil
}

// parseCalendarDay checks only that the day exists. Printing uses it: a day
// that is already stored prints as stored, whatever its year.
func parseCalendarDay(s string) (time.Time, error) {
	d, err := time.Parse(dayLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("%q is not a date in YYYY-MM-DD form", s)
	}
	return d, nil
}

// periodOf returns the YYYY-MM balance period of a validated day.
func periodOf(day string) string { return day[:7] }

func todayUTC(now time.Time) string { return now.UTC().Format(dayLayout) }
