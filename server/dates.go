package books

import (
	"fmt"
	"time"
)

const dayLayout = "2006-01-02"

// parseDay validates an accounting date. Books stores dates as YYYY-MM-DD
// text, not PocketBase datetimes: an accounting date is a calendar day with no
// time zone. The schema pattern checks the shape; this checks the day exists.
func parseDay(s string) (time.Time, error) {
	d, err := time.Parse(dayLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("%q is not a date in YYYY-MM-DD form", s)
	}
	return d, nil
}

// periodOf returns the YYYY-MM balance period of a validated day.
func periodOf(day string) string { return day[:7] }

func todayUTC(now time.Time) string { return now.UTC().Format(dayLayout) }
