package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Applying a vendor credit to bills (vendor credit spec §3.9, §3.10): a
// books_vendor_credit_applications row applies part of a posted credit to a
// posted bill of the same vendor on an apply date. It posts no journal entry:
// the credit already debited Accounts payable and the bill credited it, for
// the same vendor. Its create lowers the credit's and the bill's balance and
// its delete raises both again, each through document_balance.go and in the
// write's own transaction, with both documents' cash-basis rows rebuilt. A row
// never changes, except that a correction of its credit or its bill moves it
// to the correction (moveLinesWhere, under markMovingApplications).

// Refusal texts of the application guards. The client shows the bill's under
// that bill's row and the rest in its summary (APPLY_CREDIT_MESSAGES). These
// have their final period.
const (
	msgApplyCreditNotPosted  = "Only a posted vendor credit is applied to bills."
	msgApplyBillNotOpen      = "Bill %s is not open. Clear it to continue."
	msgApplyDraftBillNotOpen = "This bill is not open. Clear it to continue."
	msgApplyAboveBillBalance = "Bill %s: the credit is more than its open balance of %s."
	msgApplyAboveUnapplied   = "More than the unapplied credit of %s."
	msgApplyBeforeCreditDate = "The apply date can't be before the credit date."
	msgApplicationNotChanged = "A credit application is not changed. Remove it and apply the credit again."
)

// applicationUnlinks are the fields PocketBase clears on an application when
// the record they name is deleted: the only change, besides a correction's
// move, that an application takes.
var applicationUnlinks = map[string]string{"applied_by": "users"}

// registerVendorCreditApplications binds the application guards, each inside
// serialized, so no other write can commit between a check and the write it
// allows: a person's create is stamped with who applied it; a create is
// checked (checkApplicationCreate) and, in the same transaction after the row
// is saved, lowers both balances (applyVendorCredit); an update is refused
// unless a correction moves the row; a delete is refused on or before the
// close date unless the person removing it holds an unexpired close-date
// override, and otherwise raises both balances again
// (releaseVendorCreditApplication).
//
// The model delete hook has no user, so a person's delete is checked by the
// request hook (checkApplicationDelete with the request's user), which runs
// the delete inside its transaction and marks the row checked; the model
// hook, which joins that transaction, then skips the close check and releases
// both balances. A delete with no request (Go) has no user and no override, so
// it is refused in the closed period.
func registerVendorCreditApplications(app core.App) {
	app.OnRecordCreateRequest(vendorCreditApplicationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "applied_by", e.Auth)
		return e.Next()
	})
	bindSerializedGuardThen(app, vendorCreditApplicationsCollection, func(tx core.App, stored, r *core.Record) error {
		if stored == nil {
			return checkApplicationCreate(tx, r)
		}
		return checkApplicationUpdate(tx, stored, r)
	}, applyVendorCredit)
	app.OnRecordDeleteRequest(vendorCreditApplicationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		unmark := func() {}
		err := serializedRequest(e, func(tx core.App) error {
			if err := checkApplicationDelete(tx, e.Record, authID(e.Auth)); err != nil {
				return err
			}
			unmark = setTxMark(tx, applicationDeleteCheckedMark, e.Record.Id)
			return nil
		})
		unmark()
		return err
	})
	app.OnRecordDelete(vendorCreditApplicationsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e, func(tx core.App) error {
			if hasTxMark(tx, applicationDeleteCheckedMark, e.Record.Id) {
				return nil
			}
			return checkApplicationDelete(tx, e.Record, "")
		}, func(tx core.App) error {
			return releaseVendorCreditApplication(tx, e.Record)
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

// checkApplicationCreate re-reads the credit and the bill in tx and refuses,
// in this order: a credit that is not posted (under vendor_credit); a bill
// that is not posted, has no balance or is another vendor's (under bill); an
// amount above the bill's balance (under bill) or above the credit's (under
// amount); a date that is not a real day, before the credit date, or on or
// before the close date when the applier holds no unexpired override (under
// date). It writes close_override: the override that admits a closed day, or
// none. The schema holds the amount above 0 and the relations. An inactive
// vendor does not block an application: the inactive rule is for posting.
func checkApplicationCreate(tx core.App, r *core.Record) error {
	credit, err := tx.FindRecordById(vendorCreditsCollection, r.GetString("vendor_credit"))
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses an application whose credit does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's vendor credit: %w", err)
	}
	if credit.GetString("status") != statusPosted {
		return refuseField("vendor_credit", msgApplyCreditNotPosted)
	}
	bill, err := tx.FindRecordById("books_bills", r.GetString("bill"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the application's bill: %w", err)
	}
	if err := checkBillOpenFor(credit, bill); err != nil {
		return err
	}
	amount := int64(r.GetInt("amount"))
	currency := credit.GetString("currency")
	if open := int64(bill.GetInt("balance")); amount > open {
		return refuseField("bill", msgApplyAboveBillBalance, bill.GetString("number"), formatMoney(open, currency))
	}
	if left := int64(credit.GetInt("balance")); amount > left {
		return refuseField("amount", msgApplyAboveUnapplied, formatMoney(left, currency))
	}
	return checkApplicationDate(tx, credit, r)
}

// checkBillOpenFor refuses a bill the credit cannot apply to: one that is not
// posted, has no balance, or is another vendor's. A draft bill has no number
// to name.
func checkBillOpenFor(credit, bill *core.Record) error {
	if bill.GetString("status") == statusPosted && bill.GetInt("balance") > 0 &&
		bill.GetString("vendor") == credit.GetString("vendor") {
		return nil
	}
	if n := bill.GetString("number"); n != "" {
		return refuseField("bill", msgApplyBillNotOpen, n)
	}
	return refuseField("bill", msgApplyDraftBillNotOpen)
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
// corrected credit or bill (markMovingApplications on the original): while
// the bill moves only bill may change, while the credit moves only
// vendor_credit. It also admits PocketBase clearing applied_by when that user
// is deleted.
func checkApplicationUpdate(tx core.App, stored, r *core.Record) error {
	for _, field := range []string{"bill", "vendor_credit"} {
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
func checkApplicationDelete(tx core.App, r *core.Record, userID string) error {
	stored, err := tx.FindRecordById(vendorCreditApplicationsCollection, r.Id)
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

// applyVendorCredit lowers the credit's and the bill's stored balance by the
// saved application's amount, then rebuilds both documents' cash-basis rows:
// the application brings back its share of each at the apply date.
func applyVendorCredit(tx core.App, r *core.Record) error {
	return shiftApplicationBalances(tx, r, -1)
}

// releaseVendorCreditApplication raises the credit's and the bill's stored
// balance by the removed application's amount, then rebuilds both documents'
// cash-basis rows without its share.
func releaseVendorCreditApplication(tx core.App, r *core.Record) error {
	return shiftApplicationBalances(tx, r, 1)
}

func shiftApplicationBalances(tx core.App, r *core.Record, sign int64) error {
	amount := sign * int64(r.GetInt("amount"))
	for _, side := range []struct {
		kind  balanceKind
		docID string
	}{
		{vendorCreditBalanceKind, r.GetString("vendor_credit")},
		{billBalanceKind, r.GetString("bill")},
	} {
		doc, err := tx.FindRecordById(side.kind.Collection, side.docID)
		if err != nil {
			return fmt.Errorf("books: read the %s of a credit application: %w", side.kind.Noun, err)
		}
		if err := saveDocumentBalance(tx, side.kind, doc, int64(doc.GetInt("balance"))+amount); err != nil {
			return err
		}
		if err := rebuildCashBasisOf(tx, side.kind.Collection, side.docID); err != nil {
			return err
		}
	}
	return nil
}
