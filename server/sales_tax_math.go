package books

import "fmt"

// Sales tax math, the server mirror of tinycld/books/lib/sales-tax.ts. Every
// document with tax computes it per rate on its total taxable amount for that
// rate (not per line); each component of a group is rounded separately, half
// away from zero, and the group's tax is their sum. The invoice unit
// recomputes tax here; testdata/sales_tax_vectors.json is run by both sides so
// the two stay equal.

const (
	ppmPerUnit = 1_000_000
	maxRatePpm = 1_000_000
)

// taxOn returns the tax in integer cents on taxableCents at ppm parts per
// million. It panics on an amount past maxStoredAmount or a rate outside
// 0..maxRatePpm: callers check both before a write, as the client helper
// throws on them.
func taxOn(taxableCents, ppm int64) int64 {
	if taxableCents > maxStoredAmount || taxableCents < -maxStoredAmount {
		panic(fmt.Sprintf("books: taxable amount %d is past 2^53-1 cents", taxableCents))
	}
	if ppm < 0 || ppm > maxRatePpm {
		panic(fmt.Sprintf("books: rate %d is not a ppm from 0 to %d", ppm, maxRatePpm))
	}
	amount := taxableCents
	if amount < 0 {
		amount = -amount
	}
	q := amount / ppmPerUnit
	r := amount - q*ppmPerUnit
	n := r * ppm
	tax := q*ppm + n/ppmPerUnit
	if 2*(n%ppmPerUnit) >= ppmPerUnit {
		tax++
	}
	if taxableCents < 0 {
		return -tax
	}
	return tax
}

// groupTax returns each component's tax, rounded separately.
func groupTax(taxableCents int64, componentPpms []int64) []int64 {
	taxes := make([]int64, len(componentPpms))
	for i, ppm := range componentPpms {
		taxes[i] = taxOn(taxableCents, ppm)
	}
	return taxes
}
