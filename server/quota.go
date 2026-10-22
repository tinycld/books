package books

import "tinycld.org/core/quota"

// quotaSources lists the Books collections whose rows hold stored bytes.
// None do yet: the ledger keeps no files. Bill and expense attachments
// (phase 3) add their collection here; registrations_test.go fails until
// they do.
func quotaSources() []quota.Source {
	return nil
}
