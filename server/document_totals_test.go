package books

import (
	"encoding/json"
	"os"
	"testing"
)

// documentTotalsVectors is the shape of testdata/document_totals.json, which
// tests/document-lines.test.ts reads too, so the Go and TS math cannot drift.
type documentTotalsVectors struct {
	Cases []struct {
		Name  string `json:"name"`
		Lines []struct {
			Kind       string  `json:"kind"`
			Quantity   float64 `json:"quantity"`
			Rate       int64   `json:"rate"`
			PercentPpm int64   `json:"percent_ppm"`
			Taxable    bool    `json:"taxable"`
			Amount     int64   `json:"amount"`
		} `json:"lines"`
		Components          []int64  `json:"components"`
		Amounts             []*int64 `json:"amounts"`
		PercentTargetErrors []int    `json:"percentTargetErrors"`
		Subtotal            int64    `json:"subtotal"`
		TaxableTotal        int64    `json:"taxable_total"`
		Tax                 []int64  `json:"tax"`
		Total               int64    `json:"total"`
		TooLarge            bool     `json:"too_large"`
	} `json:"cases"`
}

func loadDocumentTotalsVectors(t *testing.T) documentTotalsVectors {
	t.Helper()
	src, err := os.ReadFile("testdata/document_totals.json")
	if err != nil {
		t.Fatalf("read the vectors: %v", err)
	}
	var v documentTotalsVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatalf("parse the vectors: %v", err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("the vector file has no cases")
	}
	return v
}

func TestDocumentTotals_Vectors(t *testing.T) {
	for _, tc := range loadDocumentTotalsVectors(t).Cases {
		t.Run(tc.Name, func(t *testing.T) {
			lines := make([]documentLine, len(tc.Lines))
			for i, l := range tc.Lines {
				lines[i] = documentLine{Kind: l.Kind, Quantity: l.Quantity, Rate: l.Rate, PercentPpm: l.PercentPpm, Taxable: l.Taxable, Amount: l.Amount}
			}
			ids := make([]string, len(tc.Components))
			for i := range tc.Components {
				ids[i] = "component" + string(rune('a'+i))
			}
			got := documentTotals(lines, tc.Components, ids)

			if len(got.Amounts) != len(tc.Amounts) || len(got.HasAmount) != len(tc.Amounts) {
				t.Fatalf("%d amounts / %d has-amount flags, want %d", len(got.Amounts), len(got.HasAmount), len(tc.Amounts))
			}
			for i, want := range tc.Amounts {
				if want == nil {
					if got.HasAmount[i] {
						t.Errorf("line %d has amount %d, want none", i, got.Amounts[i])
					}
					continue
				}
				if !got.HasAmount[i] || got.Amounts[i] != *want {
					t.Errorf("line %d amount = %d (has %v), want %d", i, got.Amounts[i], got.HasAmount[i], *want)
				}
			}
			if len(got.PercentTargetErrors) != len(tc.PercentTargetErrors) {
				t.Errorf("percent target errors = %v, want %v", got.PercentTargetErrors, tc.PercentTargetErrors)
			} else {
				for i := range tc.PercentTargetErrors {
					if got.PercentTargetErrors[i] != tc.PercentTargetErrors[i] {
						t.Errorf("percent target errors = %v, want %v", got.PercentTargetErrors, tc.PercentTargetErrors)
						break
					}
				}
			}
			if got.Subtotal != tc.Subtotal {
				t.Errorf("subtotal = %d, want %d", got.Subtotal, tc.Subtotal)
			}
			if got.TaxableTotal != tc.TaxableTotal {
				t.Errorf("taxable total = %d, want %d", got.TaxableTotal, tc.TaxableTotal)
			}
			if len(got.TaxLines) != len(tc.Tax) {
				t.Fatalf("%d tax lines, want %d", len(got.TaxLines), len(tc.Tax))
			}
			var taxTotal int64
			for i, want := range tc.Tax {
				line := got.TaxLines[i]
				if line.Amount != want || line.ComponentID != ids[i] || line.Ppm != tc.Components[i] {
					t.Errorf("tax line %d = %+v, want {ComponentID %s, Ppm %d, Amount %d}", i, line, ids[i], tc.Components[i], want)
				}
				taxTotal += want
			}
			if got.TaxTotal != taxTotal {
				t.Errorf("tax total = %d, want %d", got.TaxTotal, taxTotal)
			}
			if got.Total != tc.Total {
				t.Errorf("total = %d, want %d", got.Total, tc.Total)
			}
			if got.TooLarge != tc.TooLarge {
				t.Errorf("too large = %v, want %v", got.TooLarge, tc.TooLarge)
			}
		})
	}
}

// A bill's account line carries its typed amount, which may be negative, and
// adds it to the subtotal as an item adds Qty x Rate; with no tax the total is
// the subtotal.
func TestDocumentTotals_AccountLinesAddTheirTypedAmount(t *testing.T) {
	got := documentTotals([]documentLine{
		{Kind: "account", Amount: 18745},
		{Kind: "account", Amount: -3890},
		{Kind: lineKindItem, Quantity: 3, Rate: 12140},
		{Kind: lineKindItem, Quantity: 12, Rate: 310},
	}, nil, nil)

	wantAmounts := []int64{18745, -3890, 36420, 3720}
	for i, want := range wantAmounts {
		if !got.HasAmount[i] || got.Amounts[i] != want {
			t.Errorf("line %d amount = %d (has %v), want %d", i+1, got.Amounts[i], got.HasAmount[i], want)
		}
	}
	if got.Subtotal != 54995 || got.TaxTotal != 0 || got.Total != 54995 || len(got.TaxLines) != 0 {
		t.Errorf("subtotal %d tax %d total %d tax lines %v, want 54995, 0, 54995 and none",
			got.Subtotal, got.TaxTotal, got.Total, got.TaxLines)
	}
	if got.TooLarge || len(got.PercentTargetErrors) != 0 {
		t.Errorf("too large %v, percent target errors %v, want neither", got.TooLarge, got.PercentTargetErrors)
	}

	negative := documentTotals([]documentLine{
		{Kind: "account", Amount: 1000},
		{Kind: "account", Amount: -1001},
	}, nil, nil)
	if negative.Subtotal != -1 || negative.Total != -1 {
		t.Errorf("subtotal %d total %d, want -1 each: a negative account line counts in full", negative.Subtotal, negative.Total)
	}
}

// The two products round half away from zero and stay exact past int64.
func TestDocumentTotals_LineAndPercentAmounts(t *testing.T) {
	for _, tc := range []struct {
		qty  float64
		rate int64
		want int64
	}{
		{0.5, 1, 1},
		{0.5, -1, -1},
		{0.07, 875, 61},
		{1.5, 28000, 42000},
		{1000000, 1000000000, 1000000000000000},
	} {
		if got, _ := lineAmount(tc.qty, tc.rate); got != tc.want {
			t.Errorf("lineAmount(%v, %d) = %d, want %d", tc.qty, tc.rate, got, tc.want)
		}
	}
	for _, tc := range []struct {
		ppm, base, want int64
	}{
		{-500000, 1, -1},
		{500000, 1, 1},
		{-100000, 183300, -18330},
		{10000000, 1000000000000000, 10000000000000000},
	} {
		if got, _ := percentAmount(tc.ppm, tc.base); got != tc.want {
			t.Errorf("percentAmount(%d, %d) = %d, want %d", tc.ppm, tc.base, got, tc.want)
		}
	}
}
