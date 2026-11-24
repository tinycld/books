package books

import (
	"fmt"
	"math/big"
)

// The costing engine (docs/adr/0003-inventory-costing.md). It is pure: it
// reads no row and writes none. runCosting replays the moves of ONE product,
// in order, and answers the value of each move and the stock that is left.
//
// The state is a list of open layers, each a quantity still on hand and what
// it cost. The two methods differ only in how stock that comes in joins the
// list: FIFO appends a layer, average cost merges it into the one layer. A
// removal always takes from the front of the list, a part of a layer at that
// layer's unit cost, so FIFO takes the oldest stock and average cost takes the
// running average.

const (
	costingFIFO    = "fifo"
	costingAverage = "average"
)

// costMove is one stock move of a product. Qty is in hundredths of a unit:
// above zero comes in, below zero goes out, zero is a revaluation. A Given
// move carries its Value, the signed change of the stock value in cents (a
// receipt's amount, a revaluation's change). The engine prices every other
// move: a removal at the method's cost, a stock-in at the unit cost of the
// removal ReturnOf names (a return at original cost), or at the last known
// unit cost when ReturnOf is empty or names no earlier removal. The last known
// unit cost is that of the last move the engine priced before it: a stock-in,
// the part of a removal the layers held, or after a revaluation the average of
// the stock on hand; before any, the product's purchase cost.
type costMove struct {
	ID       string
	Qty      int64
	Given    bool
	Value    int64
	ReturnOf string
}

// costLayer is stock still on hand: Qty hundredths that cost Value cents.
// MoveID is the stock-in it came from; the one layer of the average method
// names none.
type costLayer struct {
	MoveID     string
	Qty, Value int64
}

// costResult is what a replay answers. Values holds the signed change of the
// stock value of every move (a removal's is below zero: minus its cost).
// QtyAfter and ValueAfter hold the stock after each move; ValueAfter adds the
// final values, so a removal a later receipt prices again carries its new
// value there too. Layers is the open
// stock, oldest first; Qty and Value are the stock on hand, both below zero
// while the product is oversold.
type costResult struct {
	Values     map[string]int64
	QtyAfter   map[string]int64
	ValueAfter map[string]int64
	Layers     []costLayer
	Qty, Value int64
}

// The reasons a replay refuses a move.
const (
	costReasonNoStockToRevalue = "no_stock_to_revalue"
	costReasonValueBelowZero   = "value_below_zero"
	costReasonGivenRemoval     = "given_removal"
	costReasonGivenStockIn     = "given_stock_in_below_zero"
	costReasonValueTooLarge    = "value_too_large"
)

// maxCostValue is the largest value in cents a move or the stock may hold:
// 2^53-1, the largest whole number the schema's number fields store exactly.
const maxCostValue = 9007199254740991

// costingError is a move the replay cannot price.
type costingError struct {
	MoveID, Reason string
}

func (e *costingError) Error() string {
	return fmt.Sprintf("books: stock move %s cannot be costed: %s", e.MoveID, e.Reason)
}

// costingMethod is the strategy: how stock that comes in joins the layers.
type costingMethod interface {
	receive(layers []costLayer, in costLayer) []costLayer
}

type fifoMethod struct{}

func (fifoMethod) receive(layers []costLayer, in costLayer) []costLayer {
	return append(layers, in)
}

type averageMethod struct{}

func (averageMethod) receive(layers []costLayer, in costLayer) []costLayer {
	if len(layers) == 0 {
		return []costLayer{{Qty: in.Qty, Value: in.Value}}
	}
	layers[0].Qty += in.Qty
	layers[0].Value += in.Value
	return layers
}

func costingMethodFor(name string) (costingMethod, error) {
	switch name {
	case costingFIFO:
		return fifoMethod{}, nil
	case costingAverage:
		return averageMethod{}, nil
	}
	return nil, fmt.Errorf("books: unknown costing method %q", name)
}

// mulDivRound is a × b ÷ c rounded half away from zero, with no overflow in
// the product: a value of 2^53 cents times a quantity of 10^8 hundredths does
// not fit an int64. ok is false when the result does not fit an int64. c must
// not be 0.
func mulDivRound(a, b, c int64) (q int64, ok bool) {
	num := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
	den := big.NewInt(c)
	if den.Sign() < 0 {
		num.Neg(num)
		den.Neg(den)
	}
	// Round half away from zero: add half of the divisor toward the sign.
	twice := new(big.Int).Lsh(num, 1)
	if num.Sign() < 0 {
		twice.Sub(twice, den)
	} else {
		twice.Add(twice, den)
	}
	r := new(big.Int).Quo(twice, new(big.Int).Lsh(den, 1))
	if !r.IsInt64() {
		return 0, false
	}
	return r.Int64(), true
}

// tooLarge reports a value in cents the schema cannot store.
func tooLarge(v int64) bool {
	return v > maxCostValue || v < -maxCostValue
}

// mulDiv is mulDivRound for a step of move id: a result that does not fit
// the schema refuses the move, so no later sum can wrap.
func mulDiv(id string, a, b, c int64) (int64, error) {
	q, ok := mulDivRound(a, b, c)
	if !ok || tooLarge(q) {
		return 0, &costingError{MoveID: id, Reason: costReasonValueTooLarge}
	}
	return q, nil
}

// oversold is the part of a removal that left with no stock to take: qty
// hundredths priced for now at value cents (the last known cost). The next
// stock-in fills it first and prices it again at its own unit cost.
type oversold struct {
	moveID     string
	qty, value int64
}

// costRun is the state of one replay.
type costRun struct {
	method   costingMethod
	layers   []costLayer
	deficits []oversold
	// The last known unit cost, as lastValue cents for lastQty hundredths: that
	// of the last priced move (a stock-in, the part of a removal the layers
	// held, or the stock on hand after a revaluation), else the purchase cost.
	lastValue, lastQty int64
	// The quantity each removal took, for the returns that name it.
	removed map[string]int64
	out     costResult
}

// runCosting replays moves, which must be in their order (date, then seq),
// under method. fallbackUnitCost is the cost in cents of one unit to use
// before the product has any cost of its own (its purchase cost; 0 for none).
// It refuses, with a *costingError, a revaluation with no stock on hand or one
// that takes the stock value below zero, a Given removal, a Given stock-in with
// a value below zero, and a move whose value or stock value is beyond what the
// schema stores (maxCostValue).
func runCosting(method string, fallbackUnitCost int64, moves []costMove) (costResult, error) {
	m, err := costingMethodFor(method)
	if err != nil {
		return costResult{}, err
	}
	// A product's purchase cost is never below zero, and a removal priced at
	// one would add value to the stock it takes from.
	if fallbackUnitCost < 0 {
		return costResult{}, fmt.Errorf("books: fallback unit cost %d is below zero", fallbackUnitCost)
	}
	run := &costRun{
		method:    m,
		lastValue: fallbackUnitCost,
		lastQty:   100,
		removed:   map[string]int64{},
		out: costResult{
			Values:     map[string]int64{},
			QtyAfter:   map[string]int64{},
			ValueAfter: map[string]int64{},
		},
	}
	for _, move := range moves {
		// Bounded before it is added anywhere, so no sum below can wrap.
		if move.Given && tooLarge(move.Value) {
			return costResult{}, &costingError{MoveID: move.ID, Reason: costReasonValueTooLarge}
		}
		var err error
		switch {
		case move.Qty > 0:
			err = run.stockIn(move)
		case move.Qty < 0:
			err = run.remove(move)
		default:
			err = run.revalue(move)
		}
		if err != nil {
			return costResult{}, err
		}
		qty, value := run.onHand()
		if tooLarge(run.out.Values[move.ID]) || tooLarge(value) {
			return costResult{}, &costingError{MoveID: move.ID, Reason: costReasonValueTooLarge}
		}
		run.out.QtyAfter[move.ID] = qty
	}
	// After the replay, from the final values: a removal that a later stock-in
	// priced again holds its new value only now.
	var valueAfter int64
	for _, move := range moves {
		valueAfter += run.out.Values[move.ID]
		if tooLarge(valueAfter) {
			return costResult{}, &costingError{MoveID: move.ID, Reason: costReasonValueTooLarge}
		}
		run.out.ValueAfter[move.ID] = valueAfter
	}
	run.out.Layers = run.layers
	run.out.Qty, run.out.Value = run.onHand()
	return run.out, nil
}

// onHand is the stock: the open layers less the oversold parts.
func (run *costRun) onHand() (qty, value int64) {
	for _, l := range run.layers {
		qty += l.Qty
		value += l.Value
	}
	for _, d := range run.deficits {
		qty -= d.qty
		value -= d.value
	}
	return qty, value
}

// stockIn prices the move, fills the oversold parts with it, oldest first,
// and adds what is left as stock.
func (run *costRun) stockIn(move costMove) error {
	value := move.Value
	var err error
	switch {
	case move.Given && value < 0:
		return &costingError{MoveID: move.ID, Reason: costReasonGivenStockIn}
	case move.Given:
	case run.removed[move.ReturnOf] > 0:
		// A return at original cost: the unit cost of the removal as it stands.
		value, err = mulDiv(move.ID, -run.out.Values[move.ReturnOf], move.Qty, run.removed[move.ReturnOf])
	default:
		value, err = mulDiv(move.ID, run.lastValue, move.Qty, run.lastQty)
	}
	if err != nil {
		return err
	}
	run.out.Values[move.ID] = value
	run.lastValue, run.lastQty = value, move.Qty

	qty := move.Qty
	for len(run.deficits) > 0 && qty > 0 {
		d := &run.deficits[0]
		take := min(qty, d.qty)
		// The proportional parts of what is left, so a whole fill is exact.
		cost, err := mulDiv(move.ID, value, take, qty)
		if err != nil {
			return err
		}
		was, err := mulDiv(move.ID, d.value, take, d.qty)
		if err != nil {
			return err
		}
		// The removal's value is minus its cost: it gives back the cost it took
		// for now and takes this stock's.
		run.out.Values[d.moveID] += was - cost
		if tooLarge(run.out.Values[d.moveID]) {
			return &costingError{MoveID: move.ID, Reason: costReasonValueTooLarge}
		}
		qty -= take
		value -= cost
		d.qty -= take
		d.value -= was
		if d.qty == 0 {
			run.deficits = run.deficits[1:]
		}
	}
	if qty > 0 {
		run.layers = run.method.receive(run.layers, costLayer{MoveID: move.ID, Qty: qty, Value: value})
	}
	return nil
}

// remove takes the quantity from the front of the layers. What the layers do
// not hold leaves at the last known cost and stays oversold.
func (run *costRun) remove(move costMove) error {
	if move.Given {
		return &costingError{MoveID: move.ID, Reason: costReasonGivenRemoval}
	}
	need := -move.Qty
	run.removed[move.ID] = need
	var cost, taken int64
	for need > 0 && len(run.layers) > 0 {
		l := &run.layers[0]
		take := min(need, l.Qty)
		part, err := mulDiv(move.ID, l.Value, take, l.Qty)
		if err != nil {
			return err
		}
		l.Qty -= take
		l.Value -= part
		cost += part
		taken += take
		need -= take
		if l.Qty == 0 {
			run.layers = run.layers[1:]
		}
	}
	if taken > 0 {
		run.lastValue, run.lastQty = cost, taken
	}
	if need > 0 {
		part, err := mulDiv(move.ID, run.lastValue, need, run.lastQty)
		if err != nil {
			return err
		}
		run.deficits = append(run.deficits, oversold{moveID: move.ID, qty: need, value: part})
		cost += part
	}
	run.out.Values[move.ID] = -cost
	return nil
}

// revalue spreads the change over the open layers: an increase by their
// quantity, a decrease by their value. The last layer takes the rest, so the
// layers change by exactly the move's value. By value, a layer gives at most
// what it holds, so no layer goes below zero unless the stock does, and the
// outcome is the same under both methods.
func (run *costRun) revalue(move costMove) error {
	var qty, total int64
	for _, l := range run.layers {
		qty += l.Qty
		total += l.Value
	}
	if qty == 0 || len(run.deficits) > 0 {
		return &costingError{MoveID: move.ID, Reason: costReasonNoStockToRevalue}
	}
	if total+move.Value < 0 {
		return &costingError{MoveID: move.ID, Reason: costReasonValueBelowZero}
	}
	weightOf := func(l costLayer) int64 { return l.Qty }
	weightLeft := qty
	if move.Value < 0 {
		weightOf = func(l costLayer) int64 { return l.Value }
		weightLeft = total
	}
	left := move.Value
	for i := range run.layers {
		l := &run.layers[i]
		weight := weightOf(*l)
		// A layer that holds no value takes no part of a decrease; after the
		// last one that does, nothing is left to spread and no weight is left.
		if weight == 0 {
			continue
		}
		part, err := mulDiv(move.ID, left, weight, weightLeft)
		if err != nil {
			return err
		}
		l.Value += part
		left -= part
		weightLeft -= weight
	}
	run.out.Values[move.ID] = move.Value
	_, value := run.onHand()
	run.lastValue, run.lastQty = value, qty
	return nil
}
