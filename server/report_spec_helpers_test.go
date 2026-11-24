package books

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"tinycld.org/core/reports"
)

// TestSharedReportHelpersKeepOtherSpecs pins the spec JSON of the four reports
// whose builders the expenses-by-vendor unit extracts helpers from
// (vendorSortBy out of vendorSort, rowsParam out of balanceParams,
// entryTypeNumber out of balanceDetailLabel; plan decision D2). The values are
// the sha256 of mustJSON of each spec as the tree gave them before the
// extraction: an extraction that keeps every caller's JSON keeps every sha, so
// no Revision moves. The Customer Balance's value is customerBalanceSpecSHA256.
// The bank-deposit unit then added "Deposit" to the entry type labels and the
// deposit route row the detail label and open path read, which moves the three
// shas below (same Revision, as for the Customer Balance pin); with the deposit
// rows taken out of entryRoutes and entryTypeLabels the specs hash to the
// values pinned before. The inventory-adjustment unit then added "Inventory
// adjustment" to the entry type labels, which moves them again (same Revision).
func TestSharedReportHelpersKeepOtherSpecs(t *testing.T) {
	for _, c := range []struct {
		name string
		spec *reports.Spec
		want string
	}{
		{"Customer Balance", customerBalanceSpec(), customerBalanceSpecSHA256},
		{"Vendor Balance", vendorBalanceSpec(), "de56492cd35b60d2bf91f4346109d48caecf43668ec9ce42a0ff7256b4649f99"},
		{"A/R Aging", arAgingSpec(), "5b825bb19944de1b20c75264dbfadee500ea5ef022c79fdfe4fa477ebe6942ac"},
		{"A/P Aging", apAgingSpec(), "2fd411d2c13f2b2662a7bce233d384cfd074d330e7d03be23bde213e391b998c"},
	} {
		sum := sha256.Sum256(mustJSON(c.spec))
		if got := hex.EncodeToString(sum[:]); got != c.want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s: a shared helper's extraction moved the shipped JSON", c.name, got, c.want)
		}
	}
}
