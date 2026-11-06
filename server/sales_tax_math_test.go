package books

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// salesTaxVectors is the shape of testdata/sales_tax_vectors.json, which
// tests/sales-tax.test.ts also runs, so the client and the server compute the
// same tax.
type salesTaxVectors struct {
	TaxOn []struct {
		Cents int64 `json:"cents"`
		Ppm   int64 `json:"ppm"`
		Tax   int64 `json:"tax"`
	} `json:"taxOn"`
	GroupTax []struct {
		Cents int64   `json:"cents"`
		Ppms  []int64 `json:"ppms"`
		Taxes []int64 `json:"taxes"`
	} `json:"groupTax"`
}

func TestSalesTaxMath_Vectors(t *testing.T) {
	src, err := os.ReadFile("testdata/sales_tax_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v salesTaxVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.TaxOn) == 0 || len(v.GroupTax) == 0 {
		t.Fatalf("vectors file has no taxOn or groupTax rows")
	}
	for _, row := range v.TaxOn {
		if got := taxOn(row.Cents, row.Ppm); got != row.Tax {
			t.Errorf("taxOn(%d, %d) = %d, want %d", row.Cents, row.Ppm, got, row.Tax)
		}
	}
	for _, row := range v.GroupTax {
		if got := groupTax(row.Cents, row.Ppms); !slices.Equal(got, row.Taxes) {
			t.Errorf("groupTax(%d, %v) = %v, want %v", row.Cents, row.Ppms, got, row.Taxes)
		}
	}
}
