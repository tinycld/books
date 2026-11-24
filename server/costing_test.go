package books

import (
	"errors"
	"reflect"
	"testing"
)

// Quantities are hundredths of a unit and values are cents: in("r1", 10, 1000)
// is 10 units received for 10.00.
func in(id string, units, value int64) costMove {
	return costMove{ID: id, Qty: units * 100, Given: true, Value: value}
}

func out(id string, units int64) costMove {
	return costMove{ID: id, Qty: -units * 100}
}

func back(id string, units int64, of string) costMove {
	return costMove{ID: id, Qty: units * 100, ReturnOf: of}
}

func revalue(id string, value int64) costMove {
	return costMove{ID: id, Given: true, Value: value}
}

// wantCost is what one method answers for a case.
type wantCost struct {
	values     map[string]int64
	layers     []costLayer
	qty, value int64
}

func TestRunCosting(t *testing.T) {
	cases := []struct {
		name     string
		fallback int64
		moves    []costMove
		fifo     wantCost
		average  wantCost
	}{
		{
			name:  "a sale takes the oldest stock under FIFO and the running average under average cost",
			moves: []costMove{in("r1", 10, 1000), in("r2", 10, 2000), out("s1", 15)},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "s1": -2000},
				layers: []costLayer{{MoveID: "r2", Qty: 500, Value: 1000}},
				qty:    500, value: 1000,
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "s1": -2250},
				layers: []costLayer{{Qty: 500, Value: 750}},
				qty:    500, value: 750,
			},
		},
		{
			name:  "the cents of a layer that does not divide leave with its last unit",
			moves: []costMove{in("r1", 3, 1000), out("s1", 1), out("s2", 1), out("s3", 1)},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -333, "s2": -334, "s3": -333},
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -333, "s2": -334, "s3": -333},
			},
		},
		{
			name:     "a sale with no stock posts at the fallback cost and the next receipt prices it again",
			fallback: 500,
			moves:    []costMove{out("s1", 4), in("r1", 10, 7000)},
			fifo: wantCost{
				values: map[string]int64{"s1": -2800, "r1": 7000},
				layers: []costLayer{{MoveID: "r1", Qty: 600, Value: 4200}},
				qty:    600, value: 4200,
			},
			average: wantCost{
				values: map[string]int64{"s1": -2800, "r1": 7000},
				layers: []costLayer{{Qty: 600, Value: 4200}},
				qty:    600, value: 4200,
			},
		},
		{
			name:     "a sale with no stock and no later receipt keeps the fallback cost",
			fallback: 500,
			moves:    []costMove{out("s1", 4)},
			fifo:     wantCost{values: map[string]int64{"s1": -2000}, qty: -400, value: -2000},
			average:  wantCost{values: map[string]int64{"s1": -2000}, qty: -400, value: -2000},
		},
		{
			name:  "an oversold part takes the last known cost; a receipt smaller than it prices only what it fills",
			moves: []costMove{in("r1", 2, 600), out("s1", 5), in("r2", 2, 800)},
			fifo:  wantCost{values: map[string]int64{"r1": 600, "s1": -1700, "r2": 800}, qty: -100, value: -300},
			average: wantCost{
				values: map[string]int64{"r1": 600, "s1": -1700, "r2": 800}, qty: -100, value: -300,
			},
		},
		{
			name:  "a return comes back at the unit cost of the sale it names",
			moves: []costMove{in("r1", 10, 1000), in("r2", 10, 2000), out("s1", 15), back("c1", 3, "s1")},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "s1": -2000, "c1": 400},
				layers: []costLayer{{MoveID: "r2", Qty: 500, Value: 1000}, {MoveID: "c1", Qty: 300, Value: 400}},
				qty:    800, value: 1400,
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "s1": -2250, "c1": 450},
				layers: []costLayer{{Qty: 800, Value: 1200}},
				qty:    800, value: 1200,
			},
		},
		{
			name:  "a return that names no sale comes back at the last known cost",
			moves: []costMove{in("r1", 10, 1000), out("s1", 4), back("c1", 2, "")},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -400, "c1": 200},
				layers: []costLayer{{MoveID: "r1", Qty: 600, Value: 600}, {MoveID: "c1", Qty: 200, Value: 200}},
				qty:    800, value: 800,
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -400, "c1": 200},
				layers: []costLayer{{Qty: 800, Value: 800}},
				qty:    800, value: 800,
			},
		},
		{
			name:  "a revaluation spreads over the open layers by quantity",
			moves: []costMove{in("r1", 10, 1000), in("r2", 10, 2000), revalue("v1", 301)},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "v1": 301},
				layers: []costLayer{{MoveID: "r1", Qty: 1000, Value: 1151}, {MoveID: "r2", Qty: 1000, Value: 2150}},
				qty:    2000, value: 3301,
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "r2": 2000, "v1": 301},
				layers: []costLayer{{Qty: 2000, Value: 3301}},
				qty:    2000, value: 3301,
			},
		},
		{
			name:  "a receipt dated before a sale changes the cost of that sale",
			moves: []costMove{in("r0", 10, 500), in("r1", 10, 1000), out("s1", 5)},
			fifo: wantCost{
				values: map[string]int64{"r0": 500, "r1": 1000, "s1": -250},
				layers: []costLayer{{MoveID: "r0", Qty: 500, Value: 250}, {MoveID: "r1", Qty: 1000, Value: 1000}},
				qty:    1500, value: 1250,
			},
			average: wantCost{
				values: map[string]int64{"r0": 500, "r1": 1000, "s1": -375},
				layers: []costLayer{{Qty: 1500, Value: 1125}},
				qty:    1500, value: 1125,
			},
		},
		{
			name:  "a quantity adjustment up with no value comes in at the last known cost",
			moves: []costMove{in("r1", 4, 1000), out("s1", 4), back("a1", 2, "")},
			fifo: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -1000, "a1": 500},
				layers: []costLayer{{MoveID: "a1", Qty: 200, Value: 500}},
				qty:    200, value: 500,
			},
			average: wantCost{
				values: map[string]int64{"r1": 1000, "s1": -1000, "a1": 500},
				layers: []costLayer{{Qty: 200, Value: 500}},
				qty:    200, value: 500,
			},
		},
	}
	for _, tc := range cases {
		for method, want := range map[string]wantCost{costingFIFO: tc.fifo, costingAverage: tc.average} {
			t.Run(tc.name+"/"+method, func(t *testing.T) {
				got, err := runCosting(method, tc.fallback, tc.moves)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got.Values, want.values) {
					t.Errorf("values = %v, want %v", got.Values, want.values)
				}
				if want.layers != nil && !reflect.DeepEqual(got.Layers, want.layers) {
					t.Errorf("layers = %v, want %v", got.Layers, want.layers)
				}
				if got.Qty != want.qty || got.Value != want.value {
					t.Errorf("on hand = %d for %d, want %d for %d", got.Qty, got.Value, want.qty, want.value)
				}
				// The stock value is the sum of what every move did to it.
				var sum int64
				for _, v := range got.Values {
					sum += v
				}
				if sum != got.Value {
					t.Errorf("the move values sum to %d, the stock value is %d", sum, got.Value)
				}
			})
		}
	}
}

func TestRunCosting_StockAfterEachMove(t *testing.T) {
	got, err := runCosting(costingFIFO, 0, []costMove{in("r1", 10, 1000), out("s1", 4), out("s2", 8)})
	if err != nil {
		t.Fatal(err)
	}
	wantQty := map[string]int64{"r1": 1000, "s1": 600, "s2": -200}
	wantValue := map[string]int64{"r1": 1000, "s1": 600, "s2": -200}
	if !reflect.DeepEqual(got.QtyAfter, wantQty) || !reflect.DeepEqual(got.ValueAfter, wantValue) {
		t.Errorf("after = %v / %v, want %v / %v", got.QtyAfter, got.ValueAfter, wantQty, wantValue)
	}
}

func TestRunCosting_Refusals(t *testing.T) {
	cases := []struct {
		name   string
		moves  []costMove
		move   string
		reason string
	}{
		{"a revaluation with no stock", []costMove{revalue("v1", 100)}, "v1", costReasonNoStockToRevalue},
		{"a revaluation while oversold", []costMove{out("s1", 1), revalue("v1", 100)}, "v1", costReasonNoStockToRevalue},
		{
			"a revaluation below zero",
			[]costMove{in("r1", 10, 1000), in("r2", 10, 2000), revalue("v1", -5000)},
			"v1", costReasonValueBelowZero,
		},
		{"a removal with a given value", []costMove{{ID: "x1", Qty: -100, Given: true, Value: -5}}, "x1", costReasonGivenRemoval},
		{"a stock-in with a value below zero", []costMove{{ID: "x1", Qty: 100, Given: true, Value: -5}}, "x1", costReasonGivenStockIn},
	}
	for _, tc := range cases {
		for _, method := range []string{costingFIFO, costingAverage} {
			t.Run(tc.name+"/"+method, func(t *testing.T) {
				_, err := runCosting(method, 0, tc.moves)
				var refused *costingError
				if !errors.As(err, &refused) {
					t.Fatalf("err = %v, want a costingError", err)
				}
				if refused.MoveID != tc.move || refused.Reason != tc.reason {
					t.Errorf("refused %s for %s, want %s for %s", refused.MoveID, refused.Reason, tc.move, tc.reason)
				}
			})
		}
	}
	if _, err := runCosting("lifo", 0, nil); err == nil {
		t.Error("an unknown method was accepted")
	}
}

func TestMulDivRound(t *testing.T) {
	cases := []struct{ a, b, c, want int64 }{
		{1000, 100, 300, 333},
		{667, 100, 200, 334},
		{-667, 100, 200, -334},
		{1, 1, 2, 1},
		{-1, 1, 2, -1},
		{0, 5, 7, 0},
		// 2^53-1 cents times 10^8 hundredths overflows an int64 product.
		{9007199254740991, 100_000_000, 100_000_000, 9007199254740991},
	}
	for _, tc := range cases {
		if got := mulDivRound(tc.a, tc.b, tc.c); got != tc.want {
			t.Errorf("mulDivRound(%d, %d, %d) = %d, want %d", tc.a, tc.b, tc.c, got, tc.want)
		}
	}
}
