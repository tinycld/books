package books

import (
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// A record code is the short name a person types to find a customer, vendor or product
// (ARD for Aspen Ridge Dental). The rule is core's short code (deriveCode and uniqueKey
// in tinycld/core/lib/short-code.ts) and the backfill migration's copy; the vectors in
// record_codes_test.go keep the three alike.
const (
	recordCodeMax = 15
	recordCodeMin = 2
)

var recordCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{1,14}$`)

// deriveCode is the code a name suggests: the initials of several words, the word itself
// when one, uppercased and cut to max; "" when that is shorter than recordCodeMin.
// Only U+0300–U+036F are stripped after NFD, as the JS rule strips them.
func deriveCode(name string, max int) string {
	folded := strings.Map(func(r rune) rune {
		if r >= 0x300 && r <= 0x36F {
			return -1
		}
		return r
	}, norm.NFD.String(name))
	words := strings.FieldsFunc(folded, func(r rune) bool { return !isASCIIAlnum(r) })
	if len(words) == 0 {
		return ""
	}
	raw := words[0]
	if len(words) > 1 {
		var b strings.Builder
		for _, w := range words {
			b.WriteByte(w[0])
		}
		raw = b.String()
	}
	code := strings.ToUpper(raw)
	if len(code) > max {
		code = code[:max]
	}
	if len(code) < recordCodeMin {
		return ""
	}
	return code
}

func isASCIIAlnum(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

// nextFreeCode is base when taken does not hold it, else the first free base-2, base-3,
// …, with base cut so the code fits in max.
func nextFreeCode(base string, taken map[string]bool, max int) string {
	if !taken[base] {
		return base
	}
	for n := 2; ; n++ {
		suffix := "-" + strconv.Itoa(n)
		stem := base
		if len(stem) > max-len(suffix) {
			stem = stem[:max-len(suffix)]
		}
		if candidate := stem + suffix; !taken[candidate] {
			return candidate
		}
	}
}
