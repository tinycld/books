package books

import (
	"regexp"
	"strings"
	"testing"
)

// writtenValue matches a value written into a statement's text: a number a
// column is compared with, or a quoted word.
var writtenValue = regexp.MustCompile(`(=|<|>)\s*\d|'[^']+'`)

// The ledger statements bind every value they compare a column with: the
// posted flag, an entry's status and its origin. The empty text (the blank of
// COALESCE and of a blank-text test) is SQL's own idiom, not a value, so the
// test takes it out first.
func TestLedgerStatementsBindTheirValues(t *testing.T) {
	for name, c := range map[string]struct {
		sql   string
		binds []string
	}{
		"cashMonthTotals":    {cashMonthTotalsSQL, []string{"posted = {:posted}"}},
		"cashMonthSum":       {cashMonthSumSQL, []string{"posted = {:posted}"}},
		"verifyLines":        {verifyLinesSQL, []string{"e.status IN ({:posted}, {:void})", "l.posted = {:unstamped}", "e.status = {:draft}", "l.posted = {:stamped}"}},
		"documentEntryLines": {documentEntryLinesSQL, []string{"l.posted = {:posted}", "e.origin = {:document}", "e.origin = {:reversal}", " origin = {:document}"}},
	} {
		text := strings.ReplaceAll(c.sql, "''", "")
		if m := writtenValue.FindString(text); m != "" {
			t.Errorf("%s writes a value into its text: %q", name, m)
		}
		for _, b := range c.binds {
			if !strings.Contains(c.sql, b) {
				t.Errorf("%s does not hold %q:\n%s", name, b, c.sql)
			}
		}
	}
}
