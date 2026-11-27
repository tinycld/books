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
// adjustment" to the entry type labels and its route row, which moves them
// again (same Revision).
func TestSharedReportHelpersKeepOtherSpecs(t *testing.T) {
	for _, c := range []struct {
		name string
		spec *reports.Spec
		want string
	}{
		{"Customer Balance", customerBalanceSpec(), customerBalanceSpecSHA256},
		{"Vendor Balance", vendorBalanceSpec(), "6f1efad0991e511d8da97bd650d7f7998fcaebba484ee9e998cd22034ea8a85f"},
		{"A/R Aging", arAgingSpec(), "cca69d832778b6c1f8412d561be803e025716e35f76bde90f0935533738db00c"},
		{"A/P Aging", apAgingSpec(), "d239ea47f81c659b11835d1db013b0a2a77e313aad98fe921c8990d0ce3fe2fb"},
	} {
		sum := sha256.Sum256(mustJSON(c.spec))
		if got := hex.EncodeToString(sum[:]); got != c.want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s: a shared helper's extraction moved the shipped JSON", c.name, got, c.want)
		}
	}
}
