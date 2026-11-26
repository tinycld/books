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
		{"Vendor Balance", vendorBalanceSpec(), "f52f95804fe43978b579e697e39d79cd31a5d5188e1ee86812bdee46933e27b1"},
		{"A/R Aging", arAgingSpec(), "28bc06fd8038e41835954f583a4b2f26c3973e5a144bf3f92163728d2fee20bd"},
		{"A/P Aging", apAgingSpec(), "fb9cd1d0d49bf336a36d40140462941e54d0d173f59fccc79d5cba9e738aa5a0"},
	} {
		sum := sha256.Sum256(mustJSON(c.spec))
		if got := hex.EncodeToString(sum[:]); got != c.want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s: a shared helper's extraction moved the shipped JSON", c.name, got, c.want)
		}
	}
}
