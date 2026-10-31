package books

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/unicode/norm"
)

// A sort key orders a Books list on the server and in the client's store
// alike: PocketBase sorts and pages on it in SQLite's byte order, and the list
// query sorts the store's rows on it lexically, so both see one plain string.
const (
	// sortIDSep ends a name's sort form, before the id that breaks ties. It
	// sorts below every character sortName keeps, so "acme" and its
	// sub-customers sort before "acme co".
	sortIDSep = "\x1f"
	// sortChildSep joins a parent's key and a sub-customer's own part. The
	// parent's whole key is the sub-customer's prefix, so a sub-customer sorts
	// right after its parent and before the next top-level customer.
	sortChildSep = "\x1e"
)

// sortName is a name's sort form: nameKey's fold with the accents dropped, so
// "Émile" sorts among the e's. It drops control characters (the separators
// above are control characters) and turns a backslash into a slash: a list's
// next-page cursor carries the key inside a PocketBase filter string, which
// has no escape for a backslash before its closing quote.
func sortName(trimmed string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(nameKey(trimmed)) {
		switch {
		case unicode.Is(unicode.Mn, r), unicode.IsControl(r):
		case r == '\\':
			b.WriteRune('/')
		default:
			b.WriteRune(r)
		}
	}
	return norm.NFC.String(b.String())
}

// ensureRecordID gives a new record its id before the write, as PocketBase
// would during it, so a key that names the id can be built in the guard.
func ensureRecordID(r *core.Record) {
	if r.Id == "" {
		r.Set("id", core.GenerateDefaultRandomId())
	}
}

// customerSortKey puts every sub-customer right after its parent: a top-level
// customer's key is its sort name and id, a sub-customer's is its parent's key,
// sortChildSep, then its own sort name and id.
func customerSortKey(app core.App, r *core.Record) (string, error) {
	own := sortName(r.GetString("display_name")) + sortIDSep + r.Id
	parentID := r.GetString("parent")
	if parentID == "" {
		return own, nil
	}
	parent, err := app.FindRecordById("books_customers", parentID)
	if err != nil {
		return "", fmt.Errorf("books: read the parent customer's sort key: %w", err)
	}
	return parent.GetString("sort_key") + sortChildSep + own, nil
}

// rekeySubCustomers saves each sub-customer of a top-level customer whose key
// no longer starts with the parent's, so its guard builds it again from the
// parent's new key. It runs after the parent's write, inside the same
// transaction, so the list never shows a sub-customer under its old name.
func rekeySubCustomers(tx core.App, parent *core.Record) error {
	if parent.GetString("parent") != "" {
		return nil
	}
	subs, err := tx.FindRecordsByFilter("books_customers", "parent = {:parent}", "", 0, 0, dbx.Params{"parent": parent.Id})
	if err != nil {
		return fmt.Errorf("books: read the sub-customers to re-key: %w", err)
	}
	prefix := parent.GetString("sort_key") + sortChildSep
	for _, sub := range subs {
		if strings.HasPrefix(sub.GetString("sort_key"), prefix) {
			continue
		}
		if err := tx.Save(sub); err != nil {
			return fmt.Errorf("books: re-key sub-customer %s: %w", sub.Id, err)
		}
	}
	return nil
}
