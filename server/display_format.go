package books

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Display formatters for printed documents: the server mirrors of the client's
// formatMoney (lib/money.ts), formatDay (lib/register-range.ts), ratePercentText
// (lib/sales-tax.ts) and formatAddressLines (lib/address.ts), locale en-US.
// testdata/display_format_vectors.json is run by both sides, so a PDF prints
// what the screens show.

//go:embed currency_symbols.json
var currencySymbolsJSON []byte

// currencySymbols holds the en-US currency prefixes that are not the code plus
// a no-break space; tests/display-format.test.ts checks it against Intl.
var currencySymbols = func() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(currencySymbolsJSON, &m); err != nil {
		panic("books: currency_symbols.json: " + err.Error())
	}
	return m
}()

// formatMoney prints integer cents with the currency's en-US prefix, thousands
// groups and two decimals: "-$1,234.56", "CHF 2.50". Books amounts are whole
// cents, so there is no "-$0.00" case to avoid.
func formatMoney(cents int64, currency string) string {
	prefix := currency + "\u00a0"
	if symbol, ok := currencySymbols[currency]; ok {
		prefix = symbol
	}
	if currency == "" {
		prefix = ""
	}
	sign := ""
	magnitude := uint64(cents)
	if cents < 0 {
		sign = "-"
		magnitude = uint64(^cents) + 1
	}
	return fmt.Sprintf("%s%s%s.%02d", sign, prefix, groupThousands(magnitude/100), magnitude%100)
}

func groupThousands(n uint64) string {
	digits := strconv.FormatUint(n, 10)
	var b strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(d)
	}
	return b.String()
}

// formatDay prints a YYYY-MM-DD day as "Nov 5, 2026". It returns an unparsable
// day unchanged, unlike TS, which rolls it over; validate() refuses such days
// (ruling P16). The year prints as stored and unpadded ("Jan 5, 50").
func formatDay(day string) string {
	d, err := parseCalendarDay(day)
	if err != nil {
		return day
	}
	return fmt.Sprintf("%s %d, %d", d.Format("Jan"), d.Day(), d.Year())
}

// ratePercentText prints a rate in ppm as a percent with up to four decimals,
// trailing zeros trimmed: 88750 → "8.875%". A negative rate prints as the
// positive one with a leading "-".
func ratePercentText(ppm int64) string {
	sign := ""
	magnitude := uint64(ppm)
	if ppm < 0 {
		sign = "-"
		magnitude = uint64(^ppm) + 1
	}
	whole := magnitude / 10_000
	fraction := strings.TrimRight(fmt.Sprintf("%04d", magnitude%10_000), "0")
	if fraction == "" {
		return fmt.Sprintf("%s%d%%", sign, whole)
	}
	return fmt.Sprintf("%s%d.%s%%", sign, whole, fraction)
}

// postalAddress is a stored address (the six addressParts).
type postalAddress struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	City       string `json:"city"`
	Region     string `json:"region"`
	PostalCode string `json:"postal_code"`
	Country    string `json:"country"`
}

// formatAddressLines returns the lines an address prints as: street, street
// line 2, "City, Region Postal", country, dropping empty lines.
func formatAddressLines(a *postalAddress) []string {
	if a == nil {
		return nil
	}
	cityRegion := joinNonEmpty(", ", a.City, a.Region)
	cityLine := joinNonEmpty(" ", cityRegion, a.PostalCode)
	return nonEmpty(a.Line1, a.Line2, cityLine, a.Country)
}

func joinNonEmpty(sep string, parts ...string) string {
	return strings.Join(nonEmpty(parts...), sep)
}

func nonEmpty(parts ...string) []string {
	out := []string{}
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
