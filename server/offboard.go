package books

import (
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"tinycld.org/core/offboard"
)

// registerOffboard keeps a departing user's ledger history and ends their
// Books grants. Ledger rows are the company's records, not the person's: they
// are never reassigned or deleted (offboard.RegisterReassignable would delete
// them in delete_my_data mode, which immutability forbids), and they stay
// attributed to the anonymized account. What is the person's is access: their
// Books admin row is removed and their close-date overrides expire now. An
// override is the log of why someone posted into a closed period, so it stays.
//
// A purchase order's created_by and closed_by name who keeps the order going,
// not who wrote a ledger row: with a successor (reassign mode) they move to
// the successor, as RegisterReassignable would move them; in the other modes
// they stay, since delete_my_data must not delete the company's orders.
//
// Core names the handler in any error it returns, so the messages here carry
// no package prefix.
func registerOffboard() {
	offboard.RegisterHandler("books", func(tx core.App, leaver *core.Record, plan offboard.Plan, _ string) error {
		if plan.Mode == offboard.ModeReassign {
			if err := reassignPurchaseOrderStamps(tx, leaver.Id, plan.SuccessorUserID); err != nil {
				return err
			}
		}
		grants, err := tx.FindAllRecords("books_admins", dbx.HashExp{"user": leaver.Id})
		if err != nil {
			return fmt.Errorf("find the leaver's admin grant: %w", err)
		}
		for _, g := range grants {
			if err := tx.Delete(g); err != nil {
				return fmt.Errorf("remove the leaver's admin grant: %w", err)
			}
		}
		now := time.Now()
		overrides, err := tx.FindRecordsByFilter("books_close_overrides",
			"user = {:user} && expires_at > {:now}", "", 0, 0,
			dbx.Params{"user": leaver.Id, "now": now.UTC().Format(types.DefaultDateLayout)})
		if err != nil {
			return fmt.Errorf("find the leaver's close-date overrides: %w", err)
		}
		for _, ov := range overrides {
			ov.Set("expires_at", now)
			if err := tx.Save(ov); err != nil {
				return fmt.Errorf("expire close-date override %s: %w", ov.Id, err)
			}
		}
		return nil
	})
}

// The offboard's reassignment of an order's created_by and closed_by.
const (
	sqlReassignPOCreatedBy = "UPDATE books_purchase_orders SET created_by = {:to} WHERE created_by = {:from}"
	sqlReassignPOClosedBy  = "UPDATE books_purchase_orders SET closed_by = {:to} WHERE closed_by = {:from}"
)

// reassignPurchaseOrderStamps moves the orders' stamps from the leaver to the
// successor by bound SQL, past the order guards: they refuse a change of
// these server fields, and a closed order changes no field at all.
func reassignPurchaseOrderStamps(tx core.App, leaverID, successorID string) error {
	params := dbx.Params{"to": successorID, "from": leaverID}
	if _, err := tx.DB().NewQuery(sqlReassignPOCreatedBy).Bind(params).Execute(); err != nil {
		return fmt.Errorf("reassign the purchase orders' created_by: %w", err)
	}
	if _, err := tx.DB().NewQuery(sqlReassignPOClosedBy).Bind(params).Execute(); err != nil {
		return fmt.Errorf("reassign the purchase orders' closed_by: %w", err)
	}
	return nil
}
