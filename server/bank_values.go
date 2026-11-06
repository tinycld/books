// The values of a bank file's row: its date and its amount. The import
// preview (tinycld/books/lib/bank-import.ts) reads them the same way, and
// testdata/bank_import_vectors.json is run by both sides so they cannot drift.

package books

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// bankDateFormats are the date layouts an import can name. Each accepts "/",
// "-" and "." between its parts and one-digit months and days; a two-digit
// year is 20YY. The books_bank_imports date_format select lists the same
// values (TestBankDateFormats_MatchTheSchema).
var bankDateFormats = []string{"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YY"}

const (
	msgBankNoDate         = "There is no date."
	msgBankNotDate        = "%s is not a date in the %s format."
	msgBankNoAmount       = "There is no amount."
	msgBankNotAmount      = "%s is not an amount."
	msgBankAmountDecimals = "%s has more than 2 decimals."
	msgBankAmountTooLarge = "%s is too large for Books."

	// quotedBankRunes is how much of a cell a message repeats.
	quotedBankRunes = 40
	// bankAmountSpaces are the spaces banks put inside an amount: the space,
	// the tab, and the no-break spaces of French and German formatting.
	bankAmountSpaces = " \t  "
	// bankCurrencySigns are dropped from an amount; Books keeps one currency.
	bankCurrencySigns = "$€£¥"
)

// quoteBankText repeats a cell in a message, cut to quotedBankRunes runes.
func quoteBankText(s string) string {
	r := []rune(s)
	if len(r) > quotedBankRunes {
		s = string(r[:quotedBankRunes]) + "…"
	}
	return `"` + s + `"`
}

// parseBankDate reads text as a day in format and returns it as YYYY-MM-DD.
// Only the first word counts, so a time after the date is ignored; for
// YYYY-MM-DD an ISO time after a "T" is too.
func parseBankDate(text, format string) (string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", errors.New(msgBankNoDate)
	}
	bad := fmt.Errorf(msgBankNotDate, quoteBankText(text), format)
	token := strings.Fields(text)[0]
	if format == "YYYY-MM-DD" {
		token, _, _ = strings.Cut(token, "T")
	}
	parts := splitBankDate(token)
	if len(parts) != 3 {
		return "", bad
	}
	var ys, ms, ds string
	switch format {
	case "MM/DD/YYYY", "MM/DD/YY":
		ms, ds, ys = parts[0], parts[1], parts[2]
	case "DD/MM/YYYY", "DD/MM/YY":
		ds, ms, ys = parts[0], parts[1], parts[2]
	case "YYYY-MM-DD":
		ys, ms, ds = parts[0], parts[1], parts[2]
	default:
		return "", bad
	}
	yearDigits := 4
	if strings.HasSuffix(format, "/YY") {
		yearDigits = 2
	}
	if len(ys) != yearDigits || !isASCIIDigits(ys) || !isDayPart(ms) || !isDayPart(ds) {
		return "", bad
	}
	year, _ := strconv.Atoi(ys)
	month, _ := strconv.Atoi(ms)
	day, _ := strconv.Atoi(ds)
	if yearDigits == 2 {
		year += 2000
	}
	if year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) {
		return "", bad
	}
	return fmt.Sprintf("%04d-%02d-%02d", year, month, day), nil
}

// splitBankDate cuts a date at every "/", "-" or ".", keeping empty parts, so
// "09//02/2026" has four parts and is refused.
func splitBankDate(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '/' || s[i] == '-' || s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	return append(parts, s[start:])
}

func isASCIIDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func isDayPart(s string) bool { return len(s) >= 1 && len(s) <= 2 && isASCIIDigits(s) }

func daysInMonth(year, month int) int {
	return time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// parseBankAmount reads an amount as banks write it and returns signed minor
// units. A leading or trailing minus, or parentheses, make it negative; spaces
// and currency signs are dropped. When both "." and "," appear, the later one
// is the decimal mark; a lone "," is the decimal mark only when one or two
// digits follow it; a lone "." always is. Grouped digits must come in threes.
func parseBankAmount(text string) (int64, error) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return 0, errors.New(msgBankNoAmount)
	}
	bad := fmt.Errorf(msgBankNotAmount, quoteBankText(trimmed))
	s := trimmed
	negative := false
	if len(s) >= 2 && s[0] == '(' && s[len(s)-1] == ')' {
		negative = true
		s = s[1 : len(s)-1]
	}
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(bankAmountSpaces, r) || strings.ContainsRune(bankCurrencySigns, r) {
			return -1
		}
		return r
	}, s)
	switch {
	case strings.HasPrefix(s, "-"):
		negative = true
		s = s[1:]
	case strings.HasPrefix(s, "+"):
		s = s[1:]
	case strings.HasSuffix(s, "-"):
		negative = true
		s = s[:len(s)-1]
	}
	if s == "" || strings.Trim(s, "0123456789.,") != "" {
		return 0, bad
	}
	whole, frac, ok := splitBankNumber(s)
	if !ok {
		return 0, bad
	}
	if len(frac) > 2 {
		return 0, fmt.Errorf(msgBankAmountDecimals, quoteBankText(trimmed))
	}
	digits := strings.TrimLeft(whole+(frac + "00")[:2], "0")
	if digits == "" {
		return 0, nil
	}
	tooLarge := fmt.Errorf(msgBankAmountTooLarge, quoteBankText(trimmed))
	if len(digits) > 16 {
		return 0, tooLarge
	}
	cents, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || cents > maxAmount {
		return 0, tooLarge
	}
	if negative {
		cents = -cents
	}
	return cents, nil
}

// splitBankNumber splits digits with "." and "," into the whole part (group
// marks removed) and the fraction, or reports that the marks do not form a
// number.
func splitBankNumber(s string) (whole, frac string, ok bool) {
	dot, comma := strings.LastIndexByte(s, '.'), strings.LastIndexByte(s, ',')
	var decimal, group byte
	switch {
	case dot >= 0 && comma >= 0:
		if dot > comma {
			decimal, group = '.', ','
		} else {
			decimal, group = ',', '.'
		}
	case comma >= 0:
		after := len(s) - comma - 1
		if strings.Count(s, ",") == 1 && after >= 1 && after <= 2 {
			decimal = ','
		} else {
			group = ','
		}
	case dot >= 0:
		if strings.Count(s, ".") == 1 {
			decimal = '.'
		} else {
			group = '.'
		}
	}
	whole = s
	if decimal != 0 {
		i := strings.LastIndexByte(s, decimal)
		whole, frac = s[:i], s[i+1:]
	}
	if strings.ContainsAny(frac, ".,") {
		return "", "", false
	}
	if group != 0 {
		groups := strings.Split(whole, string(group))
		if len(groups[0]) < 1 || len(groups[0]) > 3 {
			return "", "", false
		}
		for _, g := range groups[1:] {
			if len(g) != 3 {
				return "", "", false
			}
		}
		whole = strings.Join(groups, "")
	}
	if strings.ContainsAny(whole, ".,") || (whole == "" && frac == "") {
		return "", "", false
	}
	if whole == "" {
		whole = "0"
	}
	return whole, frac, true
}
