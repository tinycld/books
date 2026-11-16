package books

import (
	"cmp"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// checkNoSource is a collection whose rows pay from a Paid from account by
// check: its doc type (for its noun) and how a row with no number is named.
type checkNoSource struct {
	collection, docType, unnumbered string
}

// billPaymentDraftName names, in a duplicate check number refusal, a bill
// payment that has no number yet: one created earlier in the same batch,
// which posts after the payment being checked.
const billPaymentDraftName = "a new bill payment"

// checkNoSources are the rows one check number may be on once per Paid from
// account (pay-bills spec §4.2): an expense and a bill payment.
var checkNoSources = []checkNoSource{
	{collection: expensesCollection, docType: docTypeExpense, unnumbered: expenseDraftName},
	{collection: billPaymentsCollection, docType: docTypeBillPayment, unnumbered: billPaymentDraftName},
}

// checkCheckNo stores r's Ref no. trimmed and, when r pays by Check, refuses
// a number that another expense or bill payment from the same Paid from
// account, method Check, already has, unless that row is void, or is r
// itself or the posted row r corrects (the correction takes its place); those
// two are rows of collection, r's own. An empty Ref no. never clashes. The
// clash named is the latest by sequence, then id. It runs inside the caller's
// transaction (a header guard, a bill payment's post), so no other write
// commits between the check and the write.
func checkCheckNo(tx core.App, collection string, r *core.Record) error {
	ref := strings.TrimSpace(r.GetString("reference_no"))
	r.Set("reference_no", ref)
	paidFrom := r.GetString("paid_from")
	if ref == "" || paidFrom == "" || r.GetString("payment_method") != "check" {
		return nil
	}
	var clash *core.Record
	var clashSource checkNoSource
	for _, source := range checkNoSources {
		filter := "paid_from = {:paidFrom} && payment_method = {:check} && reference_no = {:ref} && status != {:void}"
		params := dbx.Params{"paidFrom": paidFrom, "check": "check", "ref": ref, "void": statusVoid}
		if source.collection == collection {
			filter += " && id != {:id} && id != {:replaces}"
			params["id"] = r.Id
			params["replaces"] = r.GetString("replaces")
		}
		others, err := tx.FindRecordsByFilter(source.collection, filter, "-sequence,id", 1, 0, params)
		if err != nil {
			return fmt.Errorf("books: read the %s of the Paid from account: %w", source.collection, err)
		}
		if len(others) > 0 && (clash == nil || isLaterCheck(others[0], clash)) {
			clash, clashSource = others[0], source
		}
	}
	if clash == nil {
		return nil
	}
	account, err := tx.FindRecordById("books_accounts", paidFrom)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses an account that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the Paid from account: %w", err)
	}
	other := clashSource.unnumbered
	if n := clash.GetString("number"); n != "" {
		noun, _, _ := entryNouns(clashSource.docType)
		other = noun + " " + n
	}
	return refuseNamedField("reference_no", msgExpenseDuplicateCheckNo, ref, accountDisplayName(account), other)
}

// isLaterCheck orders two clashing rows by sequence, highest first, then id.
func isLaterCheck(a, b *core.Record) bool {
	return cmp.Or(cmp.Compare(b.GetInt("sequence"), a.GetInt("sequence")), cmp.Compare(a.Id, b.Id)) < 0
}
