package books

import "tinycld.org/core/oauth"

const (
	scopeRead  = "books:read"
	scopeWrite = "books:write"
)

// oauthPackage declares what an OAuth token may reach in Books. A token acts
// as its user, so the access-level rules apply to it as to a session; the
// scope only decides whether a token may use a collection at all.
//
// The ledger and the customers are read-write. Everything that decides who
// may do what (the settings with the close date, numbering, overrides, admin
// grants) is read-only for tokens: "record transactions" on a consent screen
// does not read as "reopen a closed year". The balance rebuild route is left
// out, so core's grant middleware default-denies it to every token: it is
// session-only.
func oauthPackage() oauth.Package {
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	ro := oauth.Access{Read: []string{scopeRead}}
	return oauth.Package{
		Slug: "books",
		Scopes: []oauth.Scope{
			{ID: scopeRead, Label: "Read your company's accounts and transactions"},
			{ID: scopeWrite, Label: "Record and change transactions in your company's books"},
		},
		Collections: map[string]oauth.Access{
			"books_accounts":         rw,
			"books_journal_entries":  rw,
			"books_journal_lines":    rw,
			"books_customers":        rw,
			"books_account_balances": ro,
			"books_settings":         ro,
			"books_doc_sequences":    ro,
			"books_close_overrides":  ro,
			"books_admins":           ro,
			"books_access":           ro,
		},
	}
}
