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
func TestSharedReportHelpersKeepOtherSpecs(t *testing.T) {
	for _, c := range []struct {
		name string
		spec *reports.Spec
		want string
	}{
		{"Customer Balance", customerBalanceSpec(), customerBalanceSpecSHA256},
		{"Vendor Balance", vendorBalanceSpec(), "999af51a0ef880dfa99e6b29808e965b641e824ee823d9287fb01785a7b2d1ed"},
		{"A/R Aging", arAgingSpec(), "f14d503a556aa200fee78466e3911dd9ad51fe855dafec8a7f7dba909a37f7c0"},
		{"A/P Aging", apAgingSpec(), "57bd7472ad5279b2bb3fc1db2bc90cf1e69fd74d02dfccc0088733404ee5a952"},
	} {
		sum := sha256.Sum256(mustJSON(c.spec))
		if got := hex.EncodeToString(sum[:]); got != c.want {
			t.Errorf("sha256 of the %s spec JSON = %s, want %s: a shared helper's extraction moved the shipped JSON", c.name, got, c.want)
		}
	}
}
