package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Decision cp3 (fix r1): each adjustment line keeps posted_value, the value
// Books posted for it: the sum of the values of the line's stock moves at the
// post, written in the post's transaction on every post path. A void keeps it,
// a later re-cost does not move it, and a client never writes it.

const adjustmentLinesURL = "/api/collections/" + inventoryAdjustmentLinesCollection + "/records"

// postedValuesOf answers each line's posted_value of adjustment id, by line id.
func postedValuesOf(t testing.TB, app core.App, id string) map[string]int {
	t.Helper()
	lines, err := app.FindRecordsByFilter(inventoryAdjustmentLinesCollection, "adjustment = {:id}", "position", 0, 0, dbx.Params{"id": id})
	if err != nil {
		t.Fatalf("read the lines of %s: %v", id, err)
	}
	got := map[string]int{}
	for _, l := range lines {
		got[l.Id] = l.GetInt("posted_value")
	}
	return got
}

// moveValuesByLine answers the sum of the values of adjustment id's stock
// moves, by the line each move names. Every line of id is a key, 0 when the
// line has no move.
func moveValuesByLine(t testing.TB, app core.App, id string) map[string]int {
	t.Helper()
	got := map[string]int{}
	for line := range postedValuesOf(t, app, id) {
		got[line] = 0
	}
	moves, err := documentStockMoves(app, inventoryAdjustmentsCollection, id)
	if err != nil {
		t.Fatalf("read the stock moves of %s: %v", id, err)
	}
	for _, m := range moves {
		got[m.GetString("line")] += m.GetInt("value")
	}
	return got
}

func requireSameValues(t testing.TB, got, want map[string]int, when string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("%s: posted values %v, want %v", when, got, want)
		return
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s: posted values %v, want %v", when, got, want)
			return
		}
	}
}

func onlyLineOf(t testing.TB, app core.App, id string) *core.Record {
	t.Helper()
	lines, err := app.FindRecordsByFilter(inventoryAdjustmentLinesCollection, "adjustment = {:id}", "position", 0, 0, dbx.Params{"id": id})
	if err != nil || len(lines) != 1 {
		t.Fatalf("the lines of %s = %v (err %v), want one", id, lines, err)
	}
	return lines[0]
}

// A person's post: a decrease at its FIFO cost over two layers and an increase
// at a given value. A draft's lines hold 0; the post writes each line the sum
// of its own moves; the void keeps them.
func TestAdjustmentLine_APostWritesEachLinesPostedValueAndAVoidKeepsIt(t *testing.T) {
	e := newBinAdjustEnv(t)
	setCostingMethod(t, e.app, costingFIFO)
	e.mustAdjust(t, "2026-07-01", e.stockIn(10, 1000))
	e.mustAdjust(t, "2026-07-02", e.stockIn(10, 2000))
	draft := e.draftAdjustment(t, "2026-07-03",
		adjustmentLineInput{Product: e.widget.Id, Quantity: -15, Bin: e.aisle.Id},
		adjustmentLineInput{Product: e.widget.Id, Quantity: 5, Value: 700, Bin: e.counter.Id},
	)
	for line, v := range postedValuesOf(t, e.app, draft.Id) {
		if v != 0 {
			t.Errorf("the draft's line %s holds posted_value %d, want 0", line, v)
		}
	}
	if err := e.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	posted := postedValuesOf(t, e.app, draft.Id)
	want := moveValuesByLine(t, e.app, draft.Id)
	requireSameValues(t, posted, want, "after the post")
	sum := 0
	for _, v := range posted {
		sum += v
	}
	// 15 out at FIFO: 10 at 1.00 and 5 at 2.00; 5 in at 7.00.
	if sum != -2000+700 {
		t.Errorf("the lines' posted values add up to %d, want -1300", sum)
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id).GetInt("value_change"); got != sum {
		t.Errorf("value_change = %d, want the lines' sum %d", got, sum)
	}

	if err := e.voidAdjustment(draft.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	if n, _ := e.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": draft.Id}); n != 0 {
		t.Fatalf("%d stock moves after the void, want none", n)
	}
	requireSameValues(t, postedValuesOf(t, e.app, draft.Id), want, "after the void")
}

// A person's correction (postAdjustmentReplacing): the correction's line gets
// the value of its own move, and the replaced adjustment's line keeps the
// value of its post after the correction's post voided it.
func TestAdjustmentLine_ACorrectionPostWritesItsLinesAndTheReplacedKeepsTheirs(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 10, Value: 1000, Bin: e.aisle.Id})
	requireSameValues(t, postedValuesOf(t, e.app, original.Id), map[string]int{onlyLineOf(t, e.app, original.Id).Id: 1000}, "the original after its post")
	rest := newRestClient(t, e.app)

	code, body := rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentsURL, draftBody(fmt.Sprintf(`"replaces":%q`, original.Id)))
	if code != http.StatusOK {
		t.Fatalf("create the correction: %d %s", code, body)
	}
	id := recordIDOf(t, body)
	correction := reload(t, e.app, inventoryAdjustmentsCollection, id)
	line, err := e.adjustmentLine(correction, 0, adjustmentLineInput{Product: e.widget.Id, Quantity: 4, Value: 600, Bin: e.counter.Id})
	if err != nil {
		t.Fatalf("save the correction's line: %v", err)
	}
	if code, body := rest.send(t, e.users.bookkeeper, http.MethodPatch, adjustmentsURL+"/"+id, `{"status":"posted"}`); code != http.StatusOK {
		t.Fatalf("post the correction: %d %s", code, body)
	}
	requireSameValues(t, postedValuesOf(t, e.app, id), map[string]int{line.Id: 600}, "the correction after its post")
	requireSameValues(t, postedValuesOf(t, e.app, original.Id), map[string]int{onlyLineOf(t, e.app, original.Id).Id: 1000}, "the replaced adjustment after the correction")
}

// The opening adjustment Books makes for an item's opening stock: its line
// holds the opening value.
func TestAdjustmentLine_TheOpeningAdjustmentsLineHoldsTheOpeningValue(t *testing.T) {
	e := newBinAdjustEnv(t)
	gadget, err := newProduct(e.app, inventoryItem(e.ledgerEnv, map[string]any{
		"name": "Gadget", "opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-07-01",
	}))
	if err != nil {
		t.Fatalf("save an item with opening stock: %v", err)
	}
	opening := openingOf(t, e.app, gadget)
	if opening == nil {
		t.Fatal("no opening adjustment")
	}
	line := onlyLineOf(t, e.app, opening.Id)
	requireSameValues(t, postedValuesOf(t, e.app, opening.Id), map[string]int{line.Id: 4000}, "the opening adjustment")
	requireSameValues(t, moveValuesByLine(t, e.app, opening.Id), map[string]int{line.Id: 4000}, "the opening adjustment's moves")
}

// A Books re-cost adjustment (newSystemAdjustment) has no move of its own: its
// lines hold the drift it posts, so they add up to its value_change. The
// removal it re-costs keeps the value of its own post on its line, while the
// removal's move now holds the new cost.
func TestAdjustmentLine_AReCostsLinesHoldItsDriftAndTheRecostedLineKeepsItsPost(t *testing.T) {
	e := newBuyStockEnv(t, costingFIFO)
	original := e.billOf(t, "2026-07-01", 10, 100, nil)
	out := e.stock.mustAdjust(t, "2026-07-02", e.stock.stockOut(5))
	outLine := onlyLineOf(t, e.app, out.Id)
	requireSameValues(t, postedValuesOf(t, e.app, out.Id), map[string]int{outLine.Id: -500}, "the removal after its post")
	draft := mkBill(t, e.app, e.summit, map[string]any{"date": "2026-07-01", "due_date": "2026-07-01", "replaces": original.Id})
	mkBillLine(t, e.app, draft, 0, productLine(e.stock.widget, 10, 120))
	mustPostBill(t, e.app, draft.Id, e.users.bookkeeper.Id)

	recosts := recostsOf(t, e.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	recost := recosts[0]
	sum := 0
	for _, v := range postedValuesOf(t, e.app, recost.Id) {
		sum += v
	}
	if sum != -100 || sum != recost.GetInt("value_change") {
		t.Errorf("the re-cost's lines add up to %d, want -100, its value_change %d", sum, recost.GetInt("value_change"))
	}
	if got := moveValuesByLine(t, e.app, out.Id)[outLine.Id]; got != -600 {
		t.Fatalf("the removal's move is worth %d after the re-cost, want -600", got)
	}
	requireSameValues(t, postedValuesOf(t, e.app, out.Id), map[string]int{outLine.Id: -500}, "the removal after the re-cost")
}

// The post saves each line's posted_value as a record (not a bound UPDATE), so
// the last realtime event of each line carries it and the read view shows it
// with no reload.
func TestAdjustmentLine_ThePostedValueReachesTheClientLive(t *testing.T) {
	e := newBinAdjustEnv(t)
	if _, err := apis.NewRouter(e.app); err != nil {
		t.Fatalf("bind realtime: %v", err)
	}
	draft := e.draftAdjustment(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 6, Value: 900, Bin: e.aisle.Id})
	line := onlyLineOf(t, e.app, draft.Id)
	l := rlListen(t, e.app, inventoryAdjustmentLinesCollection, e.users.bookkeeper)
	l.drain(200 * time.Millisecond)
	if err := e.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	last := map[string]int{}
	seen := map[string]bool{}
	deadline := time.After(5 * time.Second)
collect:
	for {
		select {
		case msg := <-l.conn.Channel():
			var body struct {
				Record struct {
					ID          string `json:"id"`
					PostedValue int    `json:"posted_value"`
				} `json:"record"`
			}
			if err := json.Unmarshal(msg.Data, &body); err != nil {
				t.Fatalf("decode the realtime message %s: %v", msg.Data, err)
			}
			last[body.Record.ID] = body.Record.PostedValue
			seen[body.Record.ID] = true
		case <-time.After(500 * time.Millisecond):
			break collect
		case <-deadline:
			break collect
		}
	}
	if !seen[line.Id] {
		t.Fatalf("no realtime event for the line %s after the post", line.Id)
	}
	if last[line.Id] != 900 {
		t.Errorf("the line's last realtime event carries posted_value %d, want 900", last[line.Id])
	}
}

// A client never writes posted_value: a person's create is refused by the
// collection rule; a superuser's create and update, which the rule does not
// stop, by the guard with "Books keeps this value.".
func TestAdjustmentLine_BooksKeepsThePostedValue(t *testing.T) {
	e := newBinAdjustEnv(t)
	draft := e.draftAdjustment(t, "2026-07-02")
	line, err := e.adjustmentLine(draft, 0, e.stockIn(1, 100))
	if err != nil {
		t.Fatalf("save a draft line: %v", err)
	}
	rest := newRestClient(t, e.app)
	su := mkSuperuser(t, e.app)
	body := fmt.Sprintf(`{"adjustment":%q,"product":%q,"quantity":2,"value":200,"position":1,"posted_value":500}`, draft.Id, e.widget.Id)
	before, _ := e.app.CountRecords(inventoryAdjustmentLinesCollection)

	if code, answer := rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentLinesURL, body); code < 400 || code >= 500 {
		t.Errorf("a person's line create with posted_value answered %d %s, want a refusal", code, answer)
	}
	if code, answer := rest.send(t, e.users.bookkeeper, http.MethodPatch, adjustmentLinesURL+"/"+line.Id, `{"posted_value":500}`); code < 400 || code >= 500 {
		t.Errorf("a person's line update of posted_value answered %d %s, want a refusal", code, answer)
	}
	code, answer := rest.send(t, su, http.MethodPost, adjustmentLinesURL, body)
	if code != http.StatusBadRequest || !strings.Contains(answer, "Books keeps this value.") {
		t.Errorf("a superuser's line create with posted_value answered %d %s, want 400 with \"Books keeps this value.\"", code, answer)
	}
	code, answer = rest.send(t, su, http.MethodPatch, adjustmentLinesURL+"/"+line.Id, `{"posted_value":500}`)
	if code != http.StatusBadRequest || !strings.Contains(answer, "Books keeps this value.") {
		t.Errorf("a superuser's line update of posted_value answered %d %s, want 400 with \"Books keeps this value.\"", code, answer)
	}
	if after, _ := e.app.CountRecords(inventoryAdjustmentLinesCollection); after != before {
		t.Errorf("%d lines after the refused creates, want %d", after, before)
	}
	if got := reload(t, e.app, inventoryAdjustmentLinesCollection, line.Id).GetInt("posted_value"); got != 0 {
		t.Errorf("the draft line holds posted_value %d after the refused updates, want 0", got)
	}
}

// The schema: the line has posted_value, and its create and update rules keep
// it unset, as the adjustment's rules keep value_change.
func TestInventorySchema_TheLinesPostedValueIsBooksOwn(t *testing.T) {
	app := newBooksApp(t)
	lines, err := app.FindCollectionByNameOrId(inventoryAdjustmentLinesCollection)
	if err != nil {
		t.Fatalf("collection %s: %v", inventoryAdjustmentLinesCollection, err)
	}
	field := lines.Fields.GetByName("posted_value")
	if field == nil {
		t.Fatalf("%s has no posted_value field", lines.Name)
	}
	if field.Type() != core.FieldTypeNumber {
		t.Errorf("posted_value is a %s field, want number", field.Type())
	}
	const unset = "@request.body.posted_value:isset = false"
	if lines.CreateRule == nil || !strings.Contains(*lines.CreateRule, unset) {
		t.Errorf("the line create rule does not keep posted_value unset")
	}
	if lines.UpdateRule == nil || !strings.Contains(*lines.UpdateRule, unset) {
		t.Errorf("the line update rule does not keep posted_value unchanged")
	}
}
