package books

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// nameKey is the key two records may not share: a display name's canonical
// caseless form (Unicode D145): NFD-normalized first, so
// a composed and a decomposed letter are one letter and a combining mark sits
// where the fold expects it, then case-folded for every letter, not only
// ASCII ones, with Cherokee folded to uppercase as CaseFolding.txt does, and
// NFC-normalized last, so the stored key is short.
func nameKey(trimmed string) string {
	return norm.NFC.String(cherokeeUpper(cases.Fold().String(norm.NFD.String(trimmed))))
}

// cherokeeUpper maps Cherokee lowercase letters to their uppercase letters.
// CaseFolding.txt folds Cherokee to uppercase, but x/text's cases.Fold swaps
// Cherokee case instead, so after that fold both cases must end here.
func cherokeeUpper(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 0xAB70 && r <= 0xABBF:
			return r - 0xAB70 + 0x13A0
		case r >= 0x13F8 && r <= 0x13FD:
			return r - 0x13F8 + 0x13F0
		}
		return r
	}, s)
}

// nameKeyTaken reports whether a row of collection other than id already
// holds key as its name_key, inside scope when scope is not empty.
func nameKeyTaken(app core.App, collection, key, id string, scope dbx.HashExp) (bool, error) {
	exprs := []dbx.Expression{dbx.HashExp{"name_key": key}, dbx.Not(dbx.HashExp{"id": id})}
	if len(scope) > 0 {
		exprs = append(exprs, scope)
	}
	n, err := app.CountRecords(collection, exprs...)
	return n > 0, err
}
