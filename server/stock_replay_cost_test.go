package books

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The statement bounds of a replay over a long history (ADR 3 assumes an item
// has few moves). One item has 300 moves: 200 receipts of one unit and 100
// removals of one unit, so under FIFO 100 layers stay open. Each bound is the
// measured value plus 10 percent. Measured 2026-11-24: a removal after every
// move is 107 statements under FIFO and 108 under average cost; one read
// gives the replay every move, so the count does not grow with the history
// (502 under FIFO while a removal deleted and wrote again every open layer).
// A back-dated receipt is 8,110 under FIFO and 5,593 under average cost: it
// writes the stock after every later move and a re-cost of each of the 100
// removals, but only the layers whose data changed (8,410 under FIFO while a
// layer's position was its replay index, so every open layer was written).
const (
	saleAtTheEndFIFOStatementBound     = 118
	saleAtTheEndAverageStatementBound  = 119
	backDatedReceiptFIFOStatementBound = 8921
	backDatedReceiptAvgStatementBound  = 6152
	longHistoryMoves                   = 300
	longHistoryFirstDay                = "2026-01-01"
	longHistoryAfterTheEnd             = "2026-12-01"
	longHistoryBeforeTheStart          = "2025-12-31"
)

// longStockHistory gives the widget its 300 moves in one transaction, as the
// ledger holds them: every move's value is posted. Each removal is a move of a
// draft adjustment of its own, so a re-cost has a document to name; the
// receipts never drift (their value is given) and name a bill no row holds.
func longStockHistory(t *testing.T, se *stockEnv) {
	t.Helper()
	start, err := time.Parse(dayLayout, longHistoryFirstDay)
	if err != nil {
		t.Fatal(err)
	}
	moves := make([]stockMoveInput, 0, longHistoryMoves)
	for i := 0; i < longHistoryMoves; i++ {
		day := start.AddDate(0, 0, i).Format(dayLayout)
		if i%3 != 2 {
			moves = append(moves, se.receipt(fmt.Sprintf("billhistory%04d", i), day, 1, int64(100+i)))
			continue
		}
		removal := se.draftAdjustment(t, day)
		moves = append(moves, stockMoveInput{
			Product: se.widget.Id, Kind: stockKindAdjustment, Source: inventoryAdjustmentsCollection,
			Document: removal.Id, Date: day, Qty: -100, AssetAccount: se.asset.Id, OffsetAccount: se.cogs.Id,
		})
	}
	err = se.app.RunInTransaction(func(tx core.App) error {
		if err := addStockMoves(tx, moves); err != nil {
			return err
		}
		if err := recomputeStock(tx, []string{se.widget.Id}); err != nil {
			return err
		}
		stored, err := tx.FindRecordsByFilter(stockMovesCollection, "product = {:p}", "", 0, 0, dbx.Params{"p": se.widget.Id})
		if err != nil {
			return err
		}
		return markStockPosted(tx, stored)
	})
	if err != nil {
		t.Fatalf("write the long history: %v", err)
	}
	if se.method() == costingFIFO {
		if n, _ := se.app.CountRecords(stockLayersCollection); n != 100 {
			t.Fatalf("%d open layers after the history, want 100", n)
		}
	}
}

func (se *stockEnv) method() string {
	s, err := se.app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return ""
	}
	return s.GetString("costing_method")
}

// replayStatements counts the statements of one adjustment's post on day after
// the long history.
func replayStatements(t *testing.T, se *stockEnv, day string, line adjustmentLineInput) int {
	t.Helper()
	longStockHistory(t, se)
	return countStatements(t, se.app, func(string) bool { return true }, func() {
		se.mustAdjust(t, day, line)
	})
}

// A post after every move (the common case) writes the new move, the product
// and what the open stock changed: it rewrites no earlier move and no layer
// its removal leaves alone.
func TestPostCost_SaleAtTheEndOfALongHistory(t *testing.T) {
	bounds := map[string]int{costingFIFO: saleAtTheEndFIFOStatementBound, costingAverage: saleAtTheEndAverageStatementBound}
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		statements := replayStatements(t, se, longHistoryAfterTheEnd, se.stockOut(1))
		t.Logf("%s: post of a removal after %d moves: %d statements", method, longHistoryMoves, statements)
		if statements > bounds[method] {
			t.Fatalf(msgStatementBound, statements, bounds[method])
		}
	})
}

// A back-dated receipt changes the stock after every later move and the cost
// of every later removal: by design it rewrites them and re-costs each
// removal's document (ADR 3). The bound pins that cost.
func TestPostCost_BackDatedReceiptInALongHistory(t *testing.T) {
	bounds := map[string]int{costingFIFO: backDatedReceiptFIFOStatementBound, costingAverage: backDatedReceiptAvgStatementBound}
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		statements := replayStatements(t, se, longHistoryBeforeTheStart, se.stockIn(1, 50))
		t.Logf("%s: post of a back-dated receipt before %d moves: %d statements", method, longHistoryMoves, statements)
		if statements > bounds[method] {
			t.Fatalf(msgStatementBound, statements, bounds[method])
		}
	})
}

// A back-dated receipt of one unit under FIFO moves the front of the open
// stock by one receipt: one layer opens and every other open layer keeps its
// data, so the post writes that one layer row (under average cost, the one
// layer). A layer's position must not follow the replay index, or every
// later layer is written again.
func TestPostCost_BackDatedReceiptWritesOnlyTheLayersItChanges(t *testing.T) {
	isLayerWrite := func(statement string) bool {
		return strings.HasPrefix(statement, "INSERT INTO `books_stock_layers`") ||
			strings.HasPrefix(statement, "UPDATE `books_stock_layers`") ||
			strings.HasPrefix(statement, "DELETE FROM `books_stock_layers`")
	}
	eachCostingMethod(t, func(t *testing.T, se *stockEnv, method string) {
		longStockHistory(t, se)
		writes := countStatements(t, se.app, isLayerWrite, func() {
			se.mustAdjust(t, longHistoryBeforeTheStart, se.stockIn(1, 50))
		})
		if writes != 1 {
			t.Errorf("%s: %d layer writes, want 1", method, writes)
		}
		if method != costingFIFO {
			return
		}
		layers := layersOf(t, se.app, se.widget)
		if len(layers) != 101 {
			t.Fatalf("%d open layers, want 101", len(layers))
		}
		// The open layers are the receipts from the 100th on, oldest first.
		// Receipt k (from 0) is history move k + k/2, valued 100 + that index.
		for i, l := range layers {
			receipt := 99 + i
			want := 100 + receipt + receipt/2
			if l.value != want || l.qty != 1 {
				t.Fatalf("layer %d = %+v, want 1 unit of %d", i, l, want)
			}
		}
	})
}
