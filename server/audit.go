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
//
// It takes the app because two labels read another row: an admin grant is
// labeled by the user it grants, and a line by its account.
func auditedCollections(app core.App) map[string]*audit.CollectionConfig {
	return map[string]*audit.CollectionConfig{
		"books_accounts":        {ExtractLabel: accountLabel},
		"books_customers":       {ExtractLabel: audit.LabelFromField("display_name")},
		"books_vendors":         {ExtractLabel: audit.LabelFromField("display_name")},
		"books_journal_entries": {ExtractLabel: entryLabel},
		"books_journal_lines":   {ExtractLabel: func(r *core.Record) string { return lineLabel(app, r) }},
		"books_settings":        {ExtractLabel: func(*core.Record) string { return "Books settings" }},
		"books_doc_sequences":   {ExtractLabel: audit.LabelFromField("doc_type")},
		"books_close_overrides": {ExtractLabel: audit.LabelFromField("reason")},
		"books_admins":          {ExtractLabel: func(r *core.Record) string { return userLabel(app, r.GetString("user")) }},
	}
}

func registerAudit(app *pocketbase.PocketBase) {
	audited := auditedCollections(app)
	for _, name := range slices.Sorted(maps.Keys(audited)) {
		audit.RegisterCollection(app, name, audited[name])
	}
}

var accountLabel = audit.LabelFromFields("number", "name")

func entryLabel(r *core.Record) string {
	if n := r.GetString("number"); n != "" {
		return "Journal entry " + n
	}
	return "Draft journal entry " + r.GetString("date")
}

// lineLabel names a line by its account and side: "1010:Petty Cash debit
// 25.50". A missing account (a lookup error) falls back to its id, so the
// audit row is still written.
func lineLabel(app core.App, r *core.Record) string {
	account := r.GetString("account")
	if acc, err := app.FindRecordById("books_accounts", account); err == nil {
		account = accountLabel(acc)
	}
	if debit := r.GetInt("debit"); debit > 0 {
		return account + " debit " + formatMinor(debit)
	}
	return account + " credit " + formatMinor(r.GetInt("credit"))
}

// userLabel names a user as "Name <email>" (users require both). A user that
// cannot be read falls back to the id, so the audit row is still written.
func userLabel(app core.App, userID string) string {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return userID
	}
	return u.GetString("name") + " <" + u.Email() + ">"
}
