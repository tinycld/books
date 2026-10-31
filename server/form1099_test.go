package books

import (
	"os"
	"regexp"
	"slices"
	"testing"
)

var quotedValue = regexp.MustCompile(`'([^']*)'`)

// listIn reads the quoted strings of the first bracketed list that pattern's
// one group captures in file.
func listIn(t *testing.T, file string, pattern *regexp.Regexp) []string {
	t.Helper()
	src, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("read %s: %v", file, err)
	}
	m := pattern.FindSubmatch(src)
	if m == nil {
		t.Fatalf("%s has no match for %s", file, pattern)
	}
	var values []string
	for _, v := range quotedValue.FindAllSubmatch(m[1], -1) {
		values = append(values, string(v[1]))
	}
	return values
}

func TestForm1099_KeysMatchTheMigrationAndTheClient(t *testing.T) {
	migration := listIn(t, "../pb-migrations/2100000002_create_books_ledger.js",
		regexp.MustCompile(`(?s)name: 'form_1099_box'[^}]*values: \[([^\]]*)\]`))
	client := listIn(t, "../tinycld/books/lib/form-1099.ts",
		regexp.MustCompile(`(?s)BOX_1099_KEYS = \[([^\]]*)\]`))
	clientTypes := listIn(t, "../tinycld/books/lib/form-1099.ts",
		regexp.MustCompile(`(?s)EXPENSE_GROUP_TYPES = \[([^\]]*)\]`))

	if !slices.Equal(migration, boxes1099) {
		t.Errorf("migration form_1099_box values = %v, want boxes1099 %v", migration, boxes1099)
	}
	if !slices.Equal(client, boxes1099) {
		t.Errorf("lib/form-1099.ts BOX_1099_KEYS = %v, want boxes1099 %v", client, boxes1099)
	}
	if !slices.Equal(clientTypes, expenseGroupTypes) {
		t.Errorf("lib/form-1099.ts EXPENSE_GROUP_TYPES = %v, want expenseGroupTypes %v", clientTypes, expenseGroupTypes)
	}
	for _, key := range expenseGroupTypes {
		if _, ok := accountType(key); !ok {
			t.Errorf("expense-group type %q is not a known account type", key)
		}
		if !isExpenseGroupType(key) {
			t.Errorf("isExpenseGroupType(%q) = false", key)
		}
	}
	for _, key := range []string{"bank", "income", "other_income", ""} {
		if isExpenseGroupType(key) {
			t.Errorf("isExpenseGroupType(%q) = true", key)
		}
	}
}

func TestForm1099_TaxIDTypesMatchTheMigrationAndTheClient(t *testing.T) {
	migration := listIn(t, "../pb-migrations/2100000004_create_books_vendors.js",
		regexp.MustCompile(`(?s)name: 'tax_id_type'[^}]*values: \[([^\]]*)\]`))
	client := listIn(t, "../tinycld/books/lib/tax-id.ts",
		regexp.MustCompile(`(?s)TAX_ID_TYPE_KEYS = \[([^\]]*)\]`))
	if !slices.Equal(migration, taxIDTypes) {
		t.Errorf("migration tax_id_type values = %v, want taxIDTypes %v", migration, taxIDTypes)
	}
	if !slices.Equal(client, taxIDTypes) {
		t.Errorf("lib/tax-id.ts TAX_ID_TYPE_KEYS = %v, want taxIDTypes %v", client, taxIDTypes)
	}
}

func TestDashTaxID(t *testing.T) {
	dashed := map[string]string{"ein": "12-3456789", "ssn": "123-45-6789", "": "123456789"}
	for taxType, want := range dashed {
		if got := dashTaxID("123456789", taxType); got != want {
			t.Errorf("dashTaxID(%q, %q) = %q, want %q", "123456789", taxType, got, want)
		}
	}
	if digits, ok := normalizeTaxID("12 345-6789"); digits != "123456789" || !ok {
		t.Errorf("normalizeTaxID(%q) = (%q, %v), want (%q, true)", "12 345-6789", digits, ok, "123456789")
	}
	for _, bad := range []string{"12345678", "１２３４５６７８９"} {
		if digits, ok := normalizeTaxID(bad); ok {
			t.Errorf("normalizeTaxID(%q) = (%q, true), want not ok", bad, digits)
		}
	}
}
