package books

import (
	"maps"
	"slices"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/audit"
)

// auditedCollections are the Books collections a person writes. Left out:
// books_account_balances, which only Books writes, and the books_access view,
// which nobody writes. Core's audit hooks are request hooks, so they log what
// a person asked for (a post, a void); the reversal Books writes inside it is
// part of that same logged update. registrations_test.go fails when a new
// collection is neither here nor declared server-only.
var auditedCollections = map[string]*audit.CollectionConfig{
	"books_accounts":        {ExtractLabel: audit.LabelFromFields("number", "name")},
	"books_journal_entries": {ExtractLabel: entryLabel},
	"books_journal_lines":   {ExtractLabel: audit.LabelFromField("memo")},
	"books_settings":        {ExtractLabel: func(*core.Record) string { return "Books settings" }},
	"books_doc_sequences":   {ExtractLabel: audit.LabelFromField("doc_type")},
	"books_close_overrides": {ExtractLabel: audit.LabelFromField("reason")},
	"books_admins":          {ExtractLabel: audit.LabelFromField("user")},
}

func registerAudit(app *pocketbase.PocketBase) {
	for _, name := range slices.Sorted(maps.Keys(auditedCollections)) {
		audit.RegisterCollection(app, name, auditedCollections[name])
	}
}

func entryLabel(r *core.Record) string {
	if n := r.GetString("number"); n != "" {
		return "Journal entry " + n
	}
	return "Draft journal entry " + r.GetString("date")
}
