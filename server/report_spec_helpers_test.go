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
// values pinned before.
func TestSharedReportHelpersKeepOtherSpecs(t *testing.T) {
	for _, c := range []struct {
		name string
		spec *reports.Spec
		want string
	}{
		{"Customer Balance", customerBalanceSpec(), customerBalanceSpecSHA256},
		{"Vendor Balance", vendorBalanceSpec(), "0a251c1297a0a1f49b499af783060587f7ca34be2b55f04d422a51dace28b332"},
		{"A/R Aging", arAgingSpec(), "4fdcc6fd7ef745a7f1ec641d300e2532cb9a990917915d07c4d3c8b8546cd280"},
		{"A/P Aging", apAgingSpec(), "fcca5fb271b63c61b211e4f7bb1eeb7e062d66b83adf9aca1af85a4f1898e0e1"},
	} {
		sum := sha256.Sum256(mustJSON(c.spec))
		if got := hex.EncodeToString(sum[:]); got != c.want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s: a shared helper's extraction moved the shipped JSON", c.name, got, c.want)
		}
	}
}
