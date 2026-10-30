package books

import (
	"bytes"
	"encoding/json"
	"unicode/utf8"
)

// addressParts are the keys of a stored address, the same list as
// ADDRESS_PARTS in tinycld/books/lib/address.ts.
var addressParts = []string{"line1", "line2", "city", "region", "postal_code", "country"}

const maxAddressPart = 200

// isAddress reports whether a stored JSON value is null or an address: an
// object whose keys are exactly addressParts, each a string of at most
// maxAddressPart characters.
func isAddress(value any) bool {
	raw, err := json.Marshal(value)
	if err != nil {
		return false
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return true
	}
	var parts map[string]any
	if err := json.Unmarshal(raw, &parts); err != nil || parts == nil {
		return false
	}
	if len(parts) != len(addressParts) {
		return false
	}
	for _, key := range addressParts {
		text, ok := parts[key].(string)
		if !ok || utf8.RuneCountInString(text) > maxAddressPart {
			return false
		}
	}
	return true
}
