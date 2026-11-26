package books

import "testing"

// The same vectors as tinycld/core/lib/__tests__/short-code.test.ts;
// TestRecordCodes_BackfillMatchesTheGoRule (record_codes_migration_test.go) checks
// the migration against them too. Change all three together.
var deriveVectors = []struct{ name, code string }{
	{"Aspen Ridge Dental", "ARD"},
	{"Acme Rental Depot", "ARD"},
	{"Acme", "ACME"},
	{"  Acme  ", "ACME"},
	{"Café Noir", "CN"},
	{"O'Brien & Sons", "OBS"},
	{"Smith-Jones Ltd", "SJL"},
	{"3M", "3M"},
	{"Verylongsinglewordname", "VERYLONGSINGLEW"},
	{"A B C D E F G H I J K L M N O P Q", "ABCDEFGHIJKLMNO"},
	{"X", ""},
	{"李明", ""},
	{"Ærø", ""},
	{"", ""},
}

func TestDeriveCode_Vectors(t *testing.T) {
	for _, v := range deriveVectors {
		if got := deriveCode(v.name, recordCodeMax); got != v.code {
			t.Errorf("deriveCode(%q) = %q, want %q", v.name, got, v.code)
		}
	}
}

func TestNextFreeCode(t *testing.T) {
	cases := []struct {
		base  string
		taken []string
		want  string
	}{
		{"ARD", nil, "ARD"},
		{"ARD", []string{"ARD"}, "ARD-2"},
		{"ARD", []string{"ARD", "ARD-2"}, "ARD-3"},
		{"VERYLONGSINGLEW", []string{"VERYLONGSINGLEW"}, "VERYLONGSINGL-2"},
	}
	for _, c := range cases {
		taken := map[string]bool{}
		for _, code := range c.taken {
			taken[code] = true
		}
		if got := nextFreeCode(c.base, taken, recordCodeMax); got != c.want {
			t.Errorf("nextFreeCode(%q, %v) = %q, want %q", c.base, c.taken, got, c.want)
		}
	}
}

func TestRecordCodePattern(t *testing.T) {
	for _, ok := range []string{"AR", "ARD", "ARD-2", "3M", "A-", "VERYLONGSINGLEW"} {
		if !recordCodePattern.MatchString(ok) {
			t.Errorf("%q must match", ok)
		}
	}
	for _, bad := range []string{"", "A", "-AR", "ard", "A B", "VERYLONGSINGLEWX", "AR_D"} {
		if recordCodePattern.MatchString(bad) {
			t.Errorf("%q must not match", bad)
		}
	}
}
