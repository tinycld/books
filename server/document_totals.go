package books

import (
	"math"
	"math/big"
)

// Line amounts and totals of a sales document (an invoice), the server mirror
// of tinycld/books/lib/document-lines.ts. testdata/document_totals.json is run
// by both sides so the two stay equal.
//
// Money is integer cents. A quantity has at most 2 decimals and is held as
// hundredths; a percent is parts per million of the line above (-10% =
// -100 000). Qty x Rate and Percent x the amount above are computed with
// math/big and rounded half away from zero: 10^8 hundredths x 10^15 cents
// passes int64 before the division.

// documentLine is one line as the math reads it.
type documentLine struct {
	Kind       string
	Quantity   float64
	Rate       int64
	PercentPpm int64
	Taxable    bool
}

// documentTaxLine is the tax of one component of the header rate.
type documentTaxLine struct {
	ComponentID string
	Ppm         int64
	Amount      int64
}

// documentTotalsResult is what documentTotals finds. HasAmount is false for a
// description line and for a percent line with no item or subtotal right above
// it (its index is in PercentTargetErrors). TooLarge is a line amount past
// maxAmount, or a header tax that cannot be computed (a taxable total past
// maxStoredAmount, or a rate outside 0..100%); the total's own limit is the
// caller's check. The sums saturate at the int64 bounds, which are past
// maxStoredAmount, so a caller's check still refuses them.
type documentTotalsResult struct {
	Amounts             []int64
	HasAmount           []bool
	PercentTargetErrors []int
	TaxableTotal        int64
	Subtotal            int64
	TaxTotal            int64
	Total               int64
	TaxLines            []documentTaxLine
	TooLarge            bool
}

const (
	lineKindItem        = "item"
	lineKindDescription = "description"
	lineKindSubtotal    = "subtotal"
	lineKindPercent     = "percent"
)

var (
	bigHundred    = big.NewInt(100)
	bigPpmPerUnit = big.NewInt(ppmPerUnit)
	bigMaxInt64   = big.NewInt(math.MaxInt64)
	bigMinInt64   = big.NewInt(math.MinInt64)
)

// divideHalfAwayFromZero is n / d rounded half away from zero, for d > 0.
func divideHalfAwayFromZero(n, d *big.Int) *big.Int {
	magnitude := new(big.Int).Abs(n)
	q, r := new(big.Int).QuoRem(magnitude, d, new(big.Int))
	if new(big.Int).Lsh(r, 1).Cmp(d) >= 0 {
		q.Add(q, big.NewInt(1))
	}
	if n.Sign() < 0 {
		q.Neg(q)
	}
	return q
}

// quantityHundredths rounds half away from zero, as the client's Math.round
// of the magnitude, so a quantity rounds the same on both sides.
func quantityHundredths(qty float64) *big.Int {
	return big.NewInt(int64(math.Round(qty * 100)))
}

func lineAmountBig(qty float64, rate int64) *big.Int {
	product := new(big.Int).Mul(quantityHundredths(qty), big.NewInt(rate))
	return divideHalfAwayFromZero(product, bigHundred)
}

func percentAmountBig(ppm int64, base *big.Int) *big.Int {
	return divideHalfAwayFromZero(new(big.Int).Mul(base, big.NewInt(ppm)), bigPpmPerUnit)
}

// toInt64 is v saturated to the int64 bounds; ok is false when it did not fit.
func toInt64(v *big.Int) (int64, bool) {
	if v.Cmp(bigMaxInt64) > 0 {
		return math.MaxInt64, false
	}
	if v.Cmp(bigMinInt64) < 0 {
		return math.MinInt64, false
	}
	return v.Int64(), true
}

// lineAmount is Qty x Rate in cents, rounded half away from zero; ok is false
// when it does not fit an int64.
func lineAmount(qty float64, rate int64) (int64, bool) {
	return toInt64(lineAmountBig(qty, rate))
}

// percentAmount is ppm parts per million of base cents, rounded half away
// from zero; ok is false when it does not fit an int64.
func percentAmount(ppm, base int64) (int64, bool) {
	return toInt64(percentAmountBig(ppm, big.NewInt(base)))
}

// lineAmounts gives each line's amount: an item is Qty x Rate; a subtotal
// sums the item and percent amounts since the previous subtotal; a percent
// line takes its percent of the item or subtotal right above it.
func lineAmounts(lines []documentLine) ([]*big.Int, []int) {
	amounts := make([]*big.Int, len(lines))
	targetErrors := []int{}
	sinceSubtotal := new(big.Int)
	for i, line := range lines {
		switch line.Kind {
		case lineKindItem:
			amounts[i] = lineAmountBig(line.Quantity, line.Rate)
			sinceSubtotal.Add(sinceSubtotal, amounts[i])
		case lineKindSubtotal:
			amounts[i] = new(big.Int).Set(sinceSubtotal)
			sinceSubtotal.SetInt64(0)
		case lineKindPercent:
			if i == 0 || amounts[i-1] == nil ||
				(lines[i-1].Kind != lineKindItem && lines[i-1].Kind != lineKindSubtotal) {
				targetErrors = append(targetErrors, i)
				continue
			}
			amounts[i] = percentAmountBig(line.PercentPpm, amounts[i-1])
			sinceSubtotal.Add(sinceSubtotal, amounts[i])
		}
	}
	return amounts, targetErrors
}

// documentTotals computes the lines and the totals of a document whose header
// tax has the components componentIDs at componentPpms (none for no tax). The
// tax is taxOn of the taxable total per component, only after the bounds
// checks taxOn panics on.
func documentTotals(lines []documentLine, componentPpms []int64, componentIDs []string) documentTotalsResult {
	amounts, targetErrors := lineAmounts(lines)
	result := documentTotalsResult{
		Amounts:             make([]int64, len(lines)),
		HasAmount:           make([]bool, len(lines)),
		PercentTargetErrors: targetErrors,
		TaxLines:            []documentTaxLine{},
	}
	maxLine := big.NewInt(maxAmount)
	subtotal := new(big.Int)
	taxable := new(big.Int)
	for i, amount := range amounts {
		if amount == nil {
			continue
		}
		result.Amounts[i], _ = toInt64(amount)
		result.HasAmount[i] = true
		if new(big.Int).Abs(amount).Cmp(maxLine) > 0 {
			result.TooLarge = true
		}
		if lines[i].Kind != lineKindItem && lines[i].Kind != lineKindPercent {
			continue
		}
		subtotal.Add(subtotal, amount)
		if lines[i].Taxable {
			taxable.Add(taxable, amount)
		}
	}

	canTax := len(componentPpms) == 0 ||
		new(big.Int).Abs(taxable).Cmp(big.NewInt(maxStoredAmount)) <= 0
	for _, ppm := range componentPpms {
		if ppm < 0 || ppm > maxRatePpm {
			canTax = false
		}
	}
	taxTotal := new(big.Int)
	if canTax {
		for i, amount := range groupTax(taxable.Int64(), componentPpms) {
			result.TaxLines = append(result.TaxLines, documentTaxLine{ComponentID: componentIDs[i], Ppm: componentPpms[i], Amount: amount})
			taxTotal.Add(taxTotal, big.NewInt(amount))
		}
	} else {
		result.TooLarge = true
	}

	result.Subtotal, _ = toInt64(subtotal)
	result.TaxableTotal, _ = toInt64(taxable)
	result.TaxTotal, _ = toInt64(taxTotal)
	result.Total, _ = toInt64(new(big.Int).Add(subtotal, taxTotal))
	return result
}
