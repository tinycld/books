package books

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
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

const (
	msgCodeShape    = "A code is 2 to 15 capital letters, digits or dashes, and starts with a letter or digit."
	msgCodeReserved = "NEW cannot be a code."
	// The label, then the code.
	msgCodeTaken = "Another %s has the code %s."
)

// reservedCode is the create route's segment (books/<type>/new).
const reservedCode = "NEW"

type codeSpec struct {
	collection string
	nameField  string
	// The code a name with no usable letters takes.
	base string
	// The record's kind in the taken message.
	label string
}

var (
	customerCode = codeSpec{collection: "books_customers", nameField: "display_name", base: "CUST", label: "customer"}
	vendorCode   = codeSpec{collection: "books_vendors", nameField: "display_name", base: "VEND", label: "vendor"}
	productCode  = codeSpec{collection: "books_products", nameField: "name", base: "ITEM", label: "product or service"}
)

// validateRecordCode owns the code column. A sent code is trimmed and uppercased, then
// checked: its shape, NEW, and no other row of the collection holding it. An empty code
// (a create from the CLI, a seed, a form saved before its suggestion arrived, or an
// update that cleared it) is derived from the name and given the first free variant.
// It runs inside the collection's serialized guard, so no other write takes a code
// between the lookup and this write; the unique index is the backstop. stored is nil on
// a create.
func validateRecordCode(app core.App, spec codeSpec, stored, r *core.Record) error {
	code := strings.ToUpper(strings.TrimSpace(r.GetString("code")))
	if code == "" {
		generated, err := generateRecordCode(app, spec, r)
		if err != nil {
			return err
		}
		r.Set("code", generated)
		return nil
	}
	r.Set("code", code)
	if stored != nil && stored.GetString("code") == code {
		return nil
	}
	if !recordCodePattern.MatchString(code) {
		return refuseField("code", msgCodeShape)
	}
	if code == reservedCode {
		return refuseField("code", msgCodeReserved)
	}
	n, err := app.CountRecords(spec.collection, dbx.HashExp{"code": code}, dbx.Not(dbx.HashExp{"id": r.Id}))
	if err != nil {
		return fmt.Errorf("books: look up %s codes: %w", spec.label, err)
	}
	if n > 0 {
		return refuseField("code", msgCodeTaken, spec.label, code)
	}
	return nil
}

func generateRecordCode(app core.App, spec codeSpec, r *core.Record) (string, error) {
	base := deriveCode(r.GetString(spec.nameField), recordCodeMax)
	if base == "" || base == reservedCode {
		base = spec.base
	}
	var codes []string
	err := app.RecordQuery(spec.collection).
		Select("code").
		AndWhere(dbx.Like("code", codeStem(base)).Match(false, true)).
		AndWhere(dbx.Not(dbx.HashExp{"id": r.Id})).
		Column(&codes)
	if err != nil {
		return "", fmt.Errorf("books: look up %s codes: %w", spec.label, err)
	}
	taken := make(map[string]bool, len(codes))
	for _, c := range codes {
		taken[c] = true
	}
	return nextFreeCode(base, taken, recordCodeMax), nil
}

// codeStem is the start every variant of base keeps: nextFreeCode cuts a long base to
// make room for a suffix up to "-NNN" (VERYLONGSINGLEW, VERYLONGSINGL-2, …), so the
// lookup reads every code that starts with the first 11 characters.
func codeStem(base string) string {
	if len(base) > recordCodeMax-4 {
		return base[:recordCodeMax-4]
	}
	return base
}
