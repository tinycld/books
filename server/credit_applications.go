package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Applying a credit to documents of the same party (vendor credit spec §3.9,
// §3.10; apply credit spec §4.3): an application row applies part of a posted
// credit to a posted document on an apply date. It posts no journal entry: the
// credit and the document already moved the party's account. Its create lowers
// the credit's and the document's balance and its delete raises both again,
// each through document_balance.go and in the write's own transaction, with
// both documents' cash-basis rows rebuilt. A row never changes, except that a
// correction of its credit or its document moves it to the correction
// (moveLinesWhere, under markMovingApplications). Two kinds share these guards:
// a vendor credit applied to bills (vendor_credit_applications.go) and a
// credit memo applied to invoices (credit_memo_applications.go).

// The refusal of a changed application, which every kind shares. It has its
// final period. The apply date's text, which every kind shares too, is
// msgApplyBeforeCreditDate in vendor_credit_applications.go, among the texts
// the vendor credit's apply dialog quotes.
const msgApplicationNotChanged = "A credit application is not changed. Remove it and apply the credit again."

// applicationKind is one kind of credit application: its collection, the
// credit and the document it names (each with its balance kind), the field of
// their party, the credit's stored sum of its applications ("" for none), the
// key of the refusal of an amount above the credit's balance, and the texts.
// AfterChange, when set, runs after both balances moved, in the write's
// transaction, with the credit.
type applicationKind struct {
	Collection                 string
	CreditField, DocumentField string
	Credit, Document           balanceKind
	PartyField                 string
	AppliedField               string
	AboveUnappliedKey          string
	Msgs                       applicationMessages
	AfterChange                func(tx core.App, credit *core.Record) error
}

// applicationMessages are a kind's own refusal texts. DocumentNotOpen takes the
// document's number; AboveDocumentBalance its number and open balance as
// money; AboveUnapplied gets the credit and its balance as money.
type applicationMessages struct {
	CreditNotPosted, DocumentNotOpen, DraftDocumentNotOpen string
	AboveDocumentBalance                                   string
	AboveUnapplied                                         func(credit *core.Record, left string) string
}

// applicationUnlinks are the fields PocketBase clears on an application when
// the record they name is deleted: the only change, besides a correction's
// move, that an application takes.
var applicationUnlinks = map[string]string{"applied_by": "users"}

// registerCreditApplications binds the application guards of kind, each
// inside serialized, so no other write can commit between a check and the
// write it allows: a person's create is stamped with who applied it; a create
// is checked (checkApplicationCreate) and, in the same transaction after the
// row is saved, lowers both balances; an update is refused unless a
// correction moves the row; a delete is refused on or before the close date
// unless the person removing it holds an unexpired close-date override, and
// otherwise raises both balances again.
//
// The model delete hook has no user, so a person's delete is checked by the
// request hook (checkApplicationDelete with the request's user), which runs
// the delete inside its transaction and marks the row checked; the model
// hook, which joins that transaction, then skips the close check and releases
// both balances. A delete with no request (Go) has no user and no override, so
// it is refused in the closed period.
func registerCreditApplications(app core.App, kind applicationKind) {
	app.OnRecordCreateRequest(kind.Collection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "applied_by", e.Auth)
		return e.Next()
	})
	bindSerializedGuardThen(app, kind.Collection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return checkApplicationCreate(tx, kind, r)
		}
		return checkApplicationUpdate(tx, kind, stored, r)
	}, func(tx core.App, r *core.Record) error {
		return shiftApplicationBalances(tx, kind, r, -1)
	})
	app.OnRecordDeleteRequest(kind.Collection).BindFunc(func(e *core.RecordRequestEvent) error {
		unmark := func() {}
		err := serializedRequest(e, func(tx core.App) error {
			if err := checkApplicationDelete(tx, kind, e.Record, authID(e.Auth)); err != nil {
				return err
			}
			unmark = setTxMark(tx, applicationDeleteCheckedMark, e.Record.Id)
			return nil
		})
		unmark()
		return err
	})
	app.OnRecordDelete(kind.Collection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e, func(tx core.App) error {
			if hasTxMark(tx, applicationDeleteCheckedMark, e.Record.Id) {
				return nil
			}
			return checkApplicationDelete(tx, kind, e.Record, "")
		}, func(tx core.App) error {
			return shiftApplicationBalances(tx, kind, e.Record, 1)
		})
	})
}

// applicationDeleteCheckedMark marks an application whose delete the request
// hook has checked with the request's user, in the delete's transaction.
const applicationDeleteCheckedMark = "applications.deleteChecked"

func authID(auth *core.Record) string {
	if auth == nil {
		return ""
	}
	return auth.Id
}

// checkApplicationCreate re-reads the credit and the document in tx and
// refuses, in this order: a credit that is not posted (under the credit
// field); a document that is not posted, has no balance or is another party's
// (under the document field); an amount above the document's balance (under
// the document field) or above the credit's (under AboveUnappliedKey); a date
// that is not a real day, before the credit date, or on or before the close
// date when the applier holds no unexpired override (under date). It writes
// close_override: the override that admits a closed day, or none. The schema
// holds the amount above 0 and the relations. An inactive party does not
// block an application: the inactive rule is for posting.
func checkApplicationCreate(tx core.App, kind applicationKind, r *core.Record) error {
	credit, err := tx.FindRecordById(kind.Credit.Collection, r.GetString(kind.CreditField))
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses an application whose credit does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's %s: %w", kind.Credit.Noun, err)
	}
	if credit.GetString("status") != statusPosted {
		return refuseField(kind.CreditField, "%s", kind.Msgs.CreditNotPosted)
	}
	doc, err := tx.FindRecordById(kind.Document.Collection, r.GetString(kind.DocumentField))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's %s: %w", kind.Document.Noun, err)
	}
	if err := checkDocumentOpenFor(kind, credit, doc); err != nil {
		return err
	}
	amount := int64(r.GetInt("amount"))
	currency := credit.GetString("currency")
	if open := int64(doc.GetInt("balance")); amount > open {
		return refuseField(kind.DocumentField, kind.Msgs.AboveDocumentBalance, doc.GetString("number"), formatMoney(open, currency))
	}
	if left := int64(credit.GetInt("balance")); amount > left {
		return refuseField(kind.AboveUnappliedKey, "%s", kind.Msgs.AboveUnapplied(credit, formatMoney(left, currency)))
	}
	return checkApplicationDate(tx, credit, r)
}

// checkDocumentOpenFor refuses a document the credit cannot apply to: one that
// is not posted, has no balance, or is another party's (a sub-customer's
// included). A draft document has no number to name.
func checkDocumentOpenFor(kind applicationKind, credit, doc *core.Record) error {
	if doc.GetString("status") == statusPosted && doc.GetInt("balance") > 0 &&
		doc.GetString(kind.PartyField) == credit.GetString(kind.PartyField) {
		return nil
	}
	if n := doc.GetString("number"); n != "" {
		return refuseField(kind.DocumentField, kind.Msgs.DocumentNotOpen, n)
	}
	return refuseField(kind.DocumentField, "%s", kind.Msgs.DraftDocumentNotOpen)
}

// checkApplicationDate refuses an apply date that is not a real day, is
// before the credit date, or is on or before the close date when the applier
// (applied_by) holds no unexpired override. As the ledger's checkClosePeriod
// does for an entry, it records the admitting override in close_override,
// and none on an open day, whatever the write carried.
func checkApplicationDate(tx core.App, credit, r *core.Record) error {
	day := r.GetString("date")
	if _, err := parseDay(day); err != nil {
		return refuseDocumentDay("date", err)
	}
	if day < credit.GetString("date") {
		return refuseField("date", msgApplyBeforeCreditDate)
	}
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	overrideID, closed, err := closeOverrideFor(tx, s, r.GetString("applied_by"), day, time.Now())
	if err != nil {
		return err
	}
	if closed {
		return refuseField("date", msgClosedThrough, s.CloseDate, day)
	}
	r.Set("close_override", overrideID)
	return nil
}

// checkApplicationUpdate admits only a correction's move of the row to the
// corrected credit or document (markMovingApplications on the original):
// while the document moves only the document field may change, while the
// credit moves only the credit field. It also admits PocketBase clearing
// applied_by when that user is deleted.
func checkApplicationUpdate(tx core.App, kind applicationKind, stored, r *core.Record) error {
	for _, field := range []string{kind.DocumentField, kind.CreditField} {
		if isMovingApplications(tx, stored.GetString(field)) &&
			len(changedFields(stored, r, map[string]bool{field: true})) == 0 {
			return nil
		}
	}
	unlinks, err := onlyApplicationUnlinks(tx, stored, r)
	if err != nil {
		return err
	}
	if unlinks {
		return nil
	}
	return refuse(msgApplicationNotChanged)
}

// onlyApplicationUnlinks is true when every changed field is one PocketBase
// clears because the record it named is gone.
func onlyApplicationUnlinks(tx core.App, stored, r *core.Record) (bool, error) {
	changed := changedFields(stored, r, nil)
	if len(changed) == 0 {
		return false, nil
	}
	for _, name := range changed {
		collection, ok := applicationUnlinks[name]
		if !ok || r.GetString(name) != "" {
			return false, nil
		}
		_, err := tx.FindRecordById(collection, stored.GetString(name))
		if err == nil {
			return false, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return false, err
		}
	}
	return true, nil
}

// checkApplicationDelete refuses the delete of an application dated on or
// before the close date, whose balances and cash-basis rows belong to the
// closed period, unless userID ("" for a write with no user) holds an
// unexpired close-date override.
func checkApplicationDelete(tx core.App, kind applicationKind, r *core.Record, userID string) error {
	stored, err := tx.FindRecordById(kind.Collection, r.Id)
	if err != nil {
		return fmt.Errorf("books: read the application to remove: %w", err)
	}
	day := stored.GetString("date")
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	_, closed, err := closeOverrideFor(tx, s, userID, day, time.Now())
	if err != nil {
		return err
	}
	if closed {
		return refuse(msgClosedThrough, s.CloseDate, day)
	}
	return nil
}

// shiftApplicationBalances moves the credit's and the document's stored
// balance by sign times the application's amount (sign -1 on a create, 1 on a
// delete), then rebuilds both documents' cash-basis rows: the application
// brings back its share of each at the apply date, or no longer does. A kind
// whose credit stores the sum of its applications (AppliedField) moves it the
// other way, in the same save as the balance, which always changes. Then the
// kind's AfterChange runs with the credit.
func shiftApplicationBalances(tx core.App, kind applicationKind, r *core.Record, sign int64) error {
	amount := sign * int64(r.GetInt("amount"))
	credit, err := tx.FindRecordById(kind.Credit.Collection, r.GetString(kind.CreditField))
	if err != nil {
		return fmt.Errorf("books: read the %s of a credit application: %w", kind.Credit.Noun, err)
	}
	doc, err := tx.FindRecordById(kind.Document.Collection, r.GetString(kind.DocumentField))
	if err != nil {
		return fmt.Errorf("books: read the %s of a credit application: %w", kind.Document.Noun, err)
	}
	if kind.AppliedField != "" {
		credit.Set(kind.AppliedField, int64(credit.GetInt(kind.AppliedField))-amount)
	}
	for _, side := range []struct {
		kind balanceKind
		doc  *core.Record
	}{
		{kind.Credit, credit},
		{kind.Document, doc},
	} {
		if err := saveDocumentBalance(tx, side.kind, side.doc, int64(side.doc.GetInt("balance"))+amount); err != nil {
			return err
		}
		if err := rebuildCashBasisOf(tx, side.kind.Collection, side.doc.Id); err != nil {
			return err
		}
	}
	if kind.AfterChange == nil {
		return nil
	}
	return kind.AfterChange(tx, credit)
}
