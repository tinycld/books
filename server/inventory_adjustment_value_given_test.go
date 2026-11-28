package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Decision cp4 (fix r1, item 2): an increase line tells a typed Value change
// from an empty one (inventory-adjust spec §3.3: "Change above 0: the cost of
// the added quantity, 0 or more. Empty takes the last known cost"). The form
// sends value_given true when the Value change text is not empty; the server
// takes the line's value, 0 too, when value_given is true, and the last cost
// when it is false.

// postIncreaseLine makes a person's draft over REST with one increase line of
// 5 widgets in Aisle 3 at value cents and the line members extra, posts it,
// and answers the adjustment id and the line id.
func (e *binAdjustEnv) postIncreaseLine(t *testing.T, value int, extra string) (string, string) {
	t.Helper()
	rest := newRestClient(t, e.app)
	code, body := rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentsURL, draftBody(""))
	if code != http.StatusOK {
		t.Fatalf("create the draft: %d %s", code, body)
	}
	id := recordIDOf(t, body)
	line := fmt.Sprintf(`{"adjustment":%q,"product":%q,"bin":%q,"quantity":5,"value":%d,"position":0%s}`,
		id, e.widget.Id, e.aisle.Id, value, extra)
	code, body = rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentLinesURL, line)
	if code != http.StatusOK {
		t.Fatalf("create the line: %d %s", code, body)
	}
	lineID := recordIDOf(t, body)
	if code, body := rest.send(t, e.users.bookkeeper, http.MethodPatch, adjustmentsURL+"/"+id, `{"status":"posted"}`); code != http.StatusOK {
		t.Fatalf("post the adjustment: %d %s", code, body)
	}
	return id, lineID
}

// A book whose widget's last cost is $1.00 a unit (10 in at $10.00).
func newValueGivenEnv(t *testing.T) *binAdjustEnv {
	t.Helper()
	e := newBinAdjustEnv(t)
	setCostingMethod(t, e.app, costingFIFO)
	e.mustAdjust(t, "2026-07-01", e.stockIn(10, 1000))
	return e
}

func requireLineMoveValue(t *testing.T, e *binAdjustEnv, id, lineID string, want int, when string) {
	t.Helper()
	if got := moveValuesByLine(t, e.app, id)[lineID]; got != want {
		t.Errorf("%s: the line's stock move is worth %d, want %d", when, got, want)
	}
	if got := postedValuesOf(t, e.app, id)[lineID]; got != want {
		t.Errorf("%s: the line's posted_value is %d, want %d", when, got, want)
	}
}

// Free stock (a vendor's samples): Change 5 at a typed Value change of 0.00
// comes in at $0.00, not at the last cost.
func TestAdjustmentValueGiven_AnIncreaseAtATypedZeroComesInAtZero(t *testing.T) {
	e := newValueGivenEnv(t)
	id, lineID := e.postIncreaseLine(t, 0, `,"value_given":true`)
	requireLineMoveValue(t, e, id, lineID, 0, "5 in at a typed 0.00")
	requireOnHand(t, e.app, e.widget, 15, 1000)
}

// An empty Value change (value_given false) takes the last cost: 5 at $1.00.
func TestAdjustmentValueGiven_AnIncreaseWithAnEmptyValueTakesTheLastCost(t *testing.T) {
	e := newValueGivenEnv(t)
	id, lineID := e.postIncreaseLine(t, 0, `,"value_given":false`)
	requireLineMoveValue(t, e, id, lineID, 500, "5 in with an empty Value change")
	requireOnHand(t, e.app, e.widget, 15, 1500)
}

// A typed value above 0 is the cost of the added quantity.
func TestAdjustmentValueGiven_AnIncreaseAtATypedValueComesInAtIt(t *testing.T) {
	e := newValueGivenEnv(t)
	id, lineID := e.postIncreaseLine(t, 300, `,"value_given":true`)
	requireLineMoveValue(t, e, id, lineID, 300, "5 in at a typed 3.00")
	requireOnHand(t, e.app, e.widget, 15, 1300)
}

// The schema: the line has the bool value_given, and a person's create and
// update may set it (it is the client's, unlike posted_value).
func TestInventorySchema_TheLineHasValueGiven(t *testing.T) {
	app := newBooksApp(t)
	lines, err := app.FindCollectionByNameOrId(inventoryAdjustmentLinesCollection)
	if err != nil {
		t.Fatalf("collection %s: %v", inventoryAdjustmentLinesCollection, err)
	}
	field := lines.Fields.GetByName("value_given")
	if field == nil {
		t.Fatalf("%s has no value_given field", lines.Name)
	}
	if field.Type() != core.FieldTypeBool {
		t.Errorf("value_given is a %s field, want bool", field.Type())
	}
}
