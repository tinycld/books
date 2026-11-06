package books

import "tinycld.org/core/quota"

// quotaSources lists the Books collections whose rows hold stored bytes:
// the bank statement files. They have no OwnerField, because they are the
// company's records, not a person's: they count toward the organization
// total only, and a person who uploaded one does not carry it. A later
// collection that stores files (bill and expense attachments) adds its
// source here; registrations_test.go fails until it does.
func quotaSources() []quota.Source {
	return []quota.Source{{Slug: "books", Collection: "books_bank_files", SizeField: "size"}}
}
