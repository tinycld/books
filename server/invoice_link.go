package books

import "github.com/pocketbase/pocketbase/core"

// The invoice's customer link (email-share spec §3.5): every invoice has a
// public_token from its create, as an estimate has (estimate_link.go), and no
// write changes it afterwards. The create rule and the update rule pin the
// field for a person (pb-migrations/2100000010); these hold for Go and a
// superuser too.

// stampInvoiceToken gives a new invoice its token. A value the record already
// carries is refused, as the other fields only Books writes are
// (checkNewSalesDoc): a correction, which a person creates, gets a token of its
// own. It runs inside serialized, in the create's guard.
func stampInvoiceToken(r *core.Record) error {
	if r.GetString("public_token") != "" {
		return refuseServerFields([]string{"public_token"})
	}
	token, err := newPublicToken()
	if err != nil {
		return err
	}
	r.Set("public_token", token)
	return nil
}

// keepInvoiceToken puts the stored token back on an update, before any check
// can return, as transitionQuote does for an estimate: a post, a void and a
// correction's void keep the token, and a value a write sends is dropped.
func keepInvoiceToken(stored, r *core.Record) {
	r.Set("public_token", stored.GetString("public_token"))
}
