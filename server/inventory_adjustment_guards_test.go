package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// These tests write adjustments the way a person's request does once the rules
// passed and the request hook stamped who posts or voids.

func newAdjustmentEnv(t *testing.T) *stockEnv {
	t.Helper()
	se := newStockEnv(t)
	registerInventoryAdjustmentGuards(se.app)
	return se
}

func (se *stockEnv) draftAdjustment(t testing.TB, date string, lines ...adjustmentLineInput) *core.Record {
	t.Helper()
	r, err := saveNew(se.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": date,
	})
	if err != nil {
		t.Fatalf("save a draft adjustment: %v", err)
	}
	for i, l := range lines {
		if _, err := se.adjustmentLine(r, i, l); err != nil {
			t.Fatalf("save adjustment line %d: %v", i+1, err)
		}
	}
	return r
}

func (se *stockEnv) adjustmentLine(adjustment *core.Record, position int, l adjustmentLineInput) (*core.Record, error) {
	return saveNew(se.app, inventoryAdjustmentLinesCollection, map[string]any{
		"adjustment": adjustment.Id, "product": l.Product, "quantity": l.Quantity, "value": l.Value, "position": position,
		"bin": l.Bin,
	})
}

func (se *stockEnv) postAdjustment(id string) error {
	return setFieldsOf(se.app, inventoryAdjustmentsCollection, id, map[string]any{
		"status": statusPosted, "posted_by": se.users.bookkeeper.Id,
	})
}

func (se *stockEnv) voidAdjustment(id string) error {
	return setFieldsOf(se.app, inventoryAdjustmentsCollection, id, map[string]any{
		"status": statusVoid, "voided_by": se.users.bookkeeper.Id,
	})
}

func setFieldsOf(app core.App, collection, id string, fields map[string]any) error {
	r, err := app.FindRecordById(collection, id)
	if err != nil {
		return err
	}
	for k, v := range fields {
		r.Set(k, v)
	}
	return app.Save(r)
}

func TestInventoryAdjustment_APersonPostsAndVoids(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if draft.GetString("number") != "" || draft.GetString("currency") != "USD" {
		t.Errorf("draft number %q currency %q, want no number and USD", draft.GetString("number"), draft.GetString("currency"))
	}
	requireOnHand(t, se.app, se.widget, 0, 0)

	if err := se.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	posted := reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)
	if posted.GetString("number") != "IA-1" || posted.GetString("entry") == "" || posted.GetString("account") != se.shrinkage(t).Id {
		t.Errorf("posted number %q entry %q account %q, want IA-1, an entry and Inventory shrinkage",
			posted.GetString("number"), posted.GetString("entry"), posted.GetString("account"))
	}
	requireOnHand(t, se.app, se.widget, 10, 1000)

	requireRefused(t, setFieldsOf(se.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{"memo": "Later"}),
		"A posted or void inventory adjustment cannot be changed.")
	_, err := se.adjustmentLine(posted, 1, se.stockIn(1, 100))
	requireRefused(t, err, "The lines of a posted or void inventory adjustment cannot change.")
	requireRefused(t, se.app.Delete(posted), "Only a draft inventory adjustment can be deleted.")

	if err := se.voidAdjustment(draft.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	if got := reload(t, se.app, "books_journal_entries", posted.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("the entry is %s after the void, want void", got)
	}
	requireOnHand(t, se.app, se.widget, 0, 0)
	requireRefused(t, se.postAdjustment(draft.Id), "A posted or void inventory adjustment cannot be changed.")
}

func TestInventoryAdjustment_ADraftIsEditedAndDeleted(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if err := setFieldsOf(se.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{"date": "2026-07-02", "account": se.rent.Id}); err != nil {
		t.Fatalf("edit the draft: %v", err)
	}
	if err := se.app.Delete(reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)); err != nil {
		t.Fatalf("delete the draft: %v", err)
	}
	if n, _ := se.app.CountRecords(inventoryAdjustmentLinesCollection); n != 0 {
		t.Errorf("%d lines after the draft's delete, want none", n)
	}
}

func TestInventoryAdjustment_CreateGuards(t *testing.T) {
	se := newAdjustmentEnv(t)
	receivables, err := ensureReceivables(se.app)
	if err != nil {
		t.Fatal(err)
	}
	inactive := mkAccount(t, se.app, "Old losses", "expense", "bad_debts")
	if err := setFields(t, se.app, "books_accounts", inactive.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatal(err)
	}
	base := func(over map[string]any) map[string]any {
		fields := map[string]any{"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-01"}
		for k, v := range over {
			fields[k] = v
		}
		return fields
	}
	cases := []struct {
		name string
		over map[string]any
		want string
	}{
		{"posted at once", map[string]any{"status": statusPosted}, "A draft inventory adjustment is posted from the adjustment form."},
		{"an opening adjustment", map[string]any{"kind": adjustmentKindOpening}, "A person makes a manual inventory adjustment only."},
		{"a re-cost", map[string]any{"kind": adjustmentKindRecost}, "A person makes a manual inventory adjustment only."},
		{"a number", map[string]any{"number": "IA-9"}, "Books sets these fields itself: number."},
		{"a source", map[string]any{"source": "books_invoices", "document": "inv000000000001"}, "Books sets these fields itself: source, document."},
		{"a day that does not exist", map[string]any{"date": "2026-02-30"}, "Enter a date"},
		{"Accounts receivable", map[string]any{"account": receivables.Id}, "Choose an adjustment account other than Accounts receivable or Accounts payable."},
		{"an inactive account", map[string]any{"account": inactive.Id}, "Old losses is inactive. Choose an active adjustment account."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := saveNew(se.app, inventoryAdjustmentsCollection, base(tc.over))
			requireRefused(t, err, tc.want)
		})
	}
}

func TestInventoryAdjustment_LineGuards(t *testing.T) {
	se := newAdjustmentEnv(t)
	service := mkService(t, se.app, "Setup", se.revenue)
	draft := se.draftAdjustment(t, "2026-07-01")
	other := se.draftAdjustment(t, "2026-07-01")

	_, err := se.adjustmentLine(draft, 0, adjustmentLineInput{Product: service.Id, Quantity: 1, Value: 100})
	requireFieldRefusal(t, err, "product", "Setup is not an Inventory item.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id})
	requireFieldRefusal(t, err, "value", "Enter a quantity change, a value change, or both.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: -2, Value: -100})
	requireFieldRefusal(t, err, "value", "A quantity decrease takes its cost from the costing method. Enter the value change on a line of its own.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: 2, Value: -100})
	requireFieldRefusal(t, err, "value", "A quantity increase cannot have a value below 0.")
	_, err = se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: 1.005, Value: 100})
	requireFieldRefusal(t, err, "quantity", "Enter a quantity with at most 2 decimals.")

	line, err := se.adjustmentLine(draft, 0, se.stockOut(2))
	if err != nil {
		t.Fatalf("save a removal line: %v", err)
	}
	requireFieldRefusal(t, setFieldsOf(se.app, inventoryAdjustmentLinesCollection, line.Id, map[string]any{"adjustment": other.Id}),
		"adjustment", "An adjustment line stays on its adjustment.")
	if err := se.app.Delete(line); err != nil {
		t.Fatalf("delete a draft's line: %v", err)
	}
	requireRefused(t, se.postAdjustment(draft.Id), "Add a line to the inventory adjustment.")
}

// A person cannot void or change what Books made: an opening adjustment
// changes with its item, a re-cost with its transaction.
func TestInventoryAdjustment_APersonCannotVoidWhatBooksMade(t *testing.T) {
	se := newAdjustmentEnv(t)
	out := se.mustAdjust(t, "2026-07-01", se.stockOut(4))
	se.mustAdjust(t, "2026-07-02", se.stockIn(10, 7000))
	recosts := recostsOf(t, se.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	recost := recosts[0]

	requireMessageOnlyRefusal(t, se.voidAdjustment(recost.Id),
		"Books made Inventory adjustment IA-2. It changes with the item or the transaction it belongs to.")
	requireRefused(t, setFieldsOf(se.app, inventoryAdjustmentsCollection, recost.Id, map[string]any{"kind": adjustmentKindManual}),
		"The kind of an inventory adjustment cannot change.")
	// A manual adjustment's void still voids its re-cost.
	if err := se.voidAdjustment(out.Id); err != nil {
		t.Fatalf("void the removal: %v", err)
	}
	if got := reload(t, se.app, inventoryAdjustmentsCollection, recost.Id).GetString("status"); got != statusVoid {
		t.Errorf("the re-cost is %s after its document's void, want void", got)
	}
	requireOnHand(t, se.app, se.widget, 10, 7000)
}

// A person's post and void go through the request hook, which stamps who did
// it; every other test here saves through app.Save and names the actor itself.
func TestInventoryAdjustment_ARequestIsStampedWithItsActor(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	url := "/api/collections/" + inventoryAdjustmentsCollection + "/records/" + draft.Id
	token := tokenFor(t, se.users.bookkeeper)
	apiSeq(t, se.app,
		apiReq{method: http.MethodPatch, url: url, token: token, body: `{"status":"posted"}`, want: http.StatusOK},
		apiReq{method: http.MethodPatch, url: url, token: token, body: `{"status":"void"}`, want: http.StatusOK},
	)
	got := reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)
	if got.GetString("status") != statusVoid ||
		got.GetString("posted_by") != se.users.bookkeeper.Id || got.GetString("voided_by") != se.users.bookkeeper.Id {
		t.Errorf("status %q posted_by %q voided_by %q, want void and the bookkeeper on both",
			got.GetString("status"), got.GetString("posted_by"), got.GetString("voided_by"))
	}
}

func TestInventoryAdjustment_AnAdjustmentHoldsAtMost500Lines(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01")
	for i := 0; i < maxAdjustmentLines; i++ {
		if _, err := se.adjustmentLine(draft, i, se.stockOut(1)); err != nil {
			t.Fatalf("save line %d: %v", i+1, err)
		}
	}
	_, err := se.adjustmentLine(draft, maxAdjustmentLines, se.stockOut(1))
	requireRefused(t, err, "An inventory adjustment holds at most 500 lines.")
}

func TestInventoryAdjustment_ALineOfAPostedAdjustmentIsFixed(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01", se.stockIn(10, 1000))
	if err := se.postAdjustment(draft.Id); err != nil {
		t.Fatalf("post: %v", err)
	}
	line, err := se.app.FindFirstRecordByData(inventoryAdjustmentLinesCollection, "adjustment", draft.Id)
	if err != nil {
		t.Fatalf("find the line: %v", err)
	}
	const fixed = "The lines of a posted or void inventory adjustment cannot change."
	requireRefused(t, setFieldsOf(se.app, inventoryAdjustmentLinesCollection, line.Id, map[string]any{"value": 2000}), fixed)
	requireRefused(t, se.app.Delete(line), fixed)
}

func TestInventoryAdjustment_ALineNamesAnInventoryItem(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01")
	_, err := se.adjustmentLine(draft, 0, adjustmentLineInput{Product: "nosuchproduct1", Quantity: 1, Value: 100})
	requireFieldRefusal(t, err, "product", "Choose an Inventory item.")
}

// The guard runs before the schema's check, and quantity*100 of a huge
// quantity overflows int64 in qtyHundredths: the guard names the limit itself.
func TestInventoryAdjustment_AHugeQuantityNamesTheLimit(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01")
	for _, qty := range []float64{1e17, -1e17, 1000001} {
		_, err := se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: qty, Value: 100})
		requireFieldRefusal(t, err, "quantity", "Enter a quantity between -1,000,000 and 1,000,000.")
	}
	if _, err := se.adjustmentLine(draft, 0, adjustmentLineInput{Product: se.widget.Id, Quantity: 1000000, Value: 100}); err != nil {
		t.Errorf("a quantity of 1,000,000: %v, want it kept", err)
	}
}

const adjustmentsURL = "/api/collections/" + inventoryAdjustmentsCollection + "/records"

// recordIDOf reads the id of the record a create answered.
func recordIDOf(t testing.TB, body string) string {
	t.Helper()
	var answer struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(body), &answer); err != nil || answer.ID == "" {
		t.Fatalf("no record id in %s (err %v)", body, err)
	}
	return answer.ID
}

// draftBody is the body of a person's new manual draft dated 2026-07-02, with
// the extra JSON members extra.
func draftBody(extra string) string {
	body := `{"status":"draft","kind":"manual","date":"2026-07-02"`
	if extra != "" {
		body += "," + extra
	}
	return body + "}"
}

// Spec §3.4 (Q3): Post of a correction voids the replaced adjustment and posts
// the new one in one transaction. The replaced one is void, names the new one in
// replaced_by and was voided by the poster; the new one names it in replaces;
// the item's quantity, value and bins are as if only the new one existed.
func TestInventoryAdjustment_ACorrectionReplacesItsOriginalInOnePost(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 10, Value: 1000, Bin: e.aisle.Id})
	rest := newRestClient(t, e.app)

	code, body := rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentsURL, draftBody(fmt.Sprintf(`"replaces":%q`, original.Id)))
	if code != http.StatusOK {
		t.Fatalf("create the correction: %d %s", code, body)
	}
	id := recordIDOf(t, body)
	correction := reload(t, e.app, inventoryAdjustmentsCollection, id)
	if _, err := e.adjustmentLine(correction, 0, adjustmentLineInput{Product: e.widget.Id, Quantity: 4, Value: 600, Bin: e.counter.Id}); err != nil {
		t.Fatalf("save the correction's line: %v", err)
	}
	if code, body := rest.send(t, e.users.bookkeeper, http.MethodPatch, adjustmentsURL+"/"+id, `{"status":"posted"}`); code != http.StatusOK {
		t.Fatalf("post the correction: %d %s", code, body)
	}

	old := reload(t, e.app, inventoryAdjustmentsCollection, original.Id)
	if old.GetString("status") != statusVoid || old.GetString("replaced_by") != id || old.GetString("voided_by") != e.users.bookkeeper.Id {
		t.Errorf("the replaced adjustment is %q, replaced_by %q, voided_by %q; want void, %q and the bookkeeper",
			old.GetString("status"), old.GetString("replaced_by"), old.GetString("voided_by"), id)
	}
	if old.GetDateTime("voided_at").IsZero() {
		t.Error("the replaced adjustment has no voided_at")
	}
	if got := reload(t, e.app, "books_journal_entries", original.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("the replaced adjustment's entry is %q, want void", got)
	}
	posted := reload(t, e.app, inventoryAdjustmentsCollection, id)
	if posted.GetString("status") != statusPosted || posted.GetString("replaces") != original.Id || posted.GetString("number") == "" {
		t.Errorf("the correction is %q, replaces %q, number %q; want posted, %q and a number",
			posted.GetString("status"), posted.GetString("replaces"), posted.GetString("number"), original.Id)
	}
	if n, _ := e.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": original.Id}); n != 0 {
		t.Errorf("%d stock moves of the replaced adjustment, want none", n)
	}
	requireOnHand(t, e.app, e.widget, 4, 600)
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{e.aisle.Id: 0, e.counter.Id: 4}, "after the correction")
}

// Spec §4: replaces names a posted manual adjustment that was not replaced
// before. A draft, a void one, one Books made (opening, re-cost) and one
// corrected before are each refused, and no adjustment is written.
func TestInventoryAdjustment_ReplacesNamesAPostedManualAdjustment(t *testing.T) {
	e := newBinAdjustEnv(t)
	// The re-cost first, on the widget alone, as TestInventoryAdjustment_APersonCannotVoidWhatBooksMade makes it.
	out := e.mustAdjust(t, "2026-07-01", e.stockOut(4))
	e.mustAdjust(t, "2026-07-02", e.stockIn(10, 7000))
	recosts := recostsOf(t, e.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	sprocket := e.mkInventoryItem(t, "Sprocket", 100)
	in := adjustmentLineInput{Product: sprocket.Id, Quantity: 5, Value: 500}

	draft := e.draftAdjustment(t, "2026-07-01", in)
	voided := e.postLines(t, "2026-07-01", in)
	if err := e.voidAdjustment(voided.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
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
	corrected := e.postLines(t, "2026-07-01", in)
	correction, err := saveNew(e.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-02", "replaces": corrected.Id,
	})
	if err != nil {
		t.Fatalf("create the first correction: %v", err)
	}
	if _, err := e.adjustmentLine(correction, 0, in); err != nil {
		t.Fatalf("save the first correction's line: %v", err)
	}
	if err := e.postAdjustment(correction.Id); err != nil {
		t.Fatalf("post the first correction: %v", err)
	}

	numberOf := func(r *core.Record) string {
		return reload(t, e.app, inventoryAdjustmentsCollection, r.Id).GetString("number")
	}
	notPosted := func(r *core.Record) string {
		return "Inventory adjustment " + numberOf(r) + " is not a posted adjustment you made."
	}
	cases := []struct {
		name   string
		target *core.Record
		want   string
	}{
		// A draft has no number to name (decision cp2 gate 3).
		{"a draft", draft, "Draft inventory adjustment is not a posted adjustment you made."},
		{"a void adjustment", voided, notPosted(voided)},
		{"an opening adjustment", opening, notPosted(opening)},
		{"a re-cost", recosts[0], notPosted(recosts[0])},
		{"one corrected before", corrected, "Inventory adjustment " + numberOf(corrected) + " was corrected before."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			before, _ := e.app.CountRecords(inventoryAdjustmentsCollection)
			_, err := saveNew(e.app, inventoryAdjustmentsCollection, map[string]any{
				"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-03", "replaces": tc.target.Id,
			})
			requireFieldRefusal(t, err, "replaces", tc.want)
			if after, _ := e.app.CountRecords(inventoryAdjustmentsCollection); after != before {
				t.Errorf("%d adjustments after the refusal, want %d", after, before)
			}
		})
	}
}

// Spec §4: replaces is set at create only. An update of a draft cannot set it,
// and a correction cannot drop it; a person's request is refused by the rule.
func TestInventoryAdjustment_ReplacesIsSetAtCreateOnly(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", e.stockIn(10, 1000))
	draft := e.draftAdjustment(t, "2026-07-02")
	if err := setFieldsOf(e.app, inventoryAdjustmentsCollection, draft.Id, map[string]any{"replaces": original.Id}); err == nil {
		t.Error("an update set replaces on a draft, want a refusal")
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id).GetString("replaces"); got != "" {
		t.Errorf("the draft replaces %q after the refused update, want none", got)
	}

	correction, err := saveNew(e.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-02", "replaces": original.Id,
	})
	if err != nil {
		t.Fatalf("create the correction: %v", err)
	}
	if err := setFieldsOf(e.app, inventoryAdjustmentsCollection, correction.Id, map[string]any{"replaces": ""}); err == nil {
		t.Error("an update dropped the correction's replaces, want a refusal")
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, correction.Id).GetString("replaces"); got != original.Id {
		t.Errorf("the correction replaces %q after the refused update, want %q", got, original.Id)
	}

	code, body := newRestClient(t, e.app).send(t, e.users.bookkeeper, http.MethodPatch, adjustmentsURL+"/"+draft.Id,
		fmt.Sprintf(`{"replaces":%q}`, original.Id))
	if code < 400 || code >= 500 {
		t.Errorf("a person's update of replaces answered %d %s, want a refusal", code, body)
	}
}

// Spec §4 and decisions.md cp2: value_change and replaced_by are Books' own. A
// person's write is refused by the collection rule; a superuser's, which the
// rule does not stop, by the guard with "Books keeps this value.".
func TestInventoryAdjustment_BooksKeepsTheValueChangeAndTheReplacedBy(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", e.stockIn(10, 1000))
	draft := e.draftAdjustment(t, "2026-07-02")
	rest := newRestClient(t, e.app)
	su := mkSuperuser(t, e.app)
	members := map[string]string{
		"value_change": `"value_change":500`,
		"replaced_by":  fmt.Sprintf(`"replaced_by":%q`, original.Id),
	}
	before, _ := e.app.CountRecords(inventoryAdjustmentsCollection)
	for field, member := range members {
		t.Run(field, func(t *testing.T) {
			if code, body := rest.send(t, e.users.bookkeeper, http.MethodPost, adjustmentsURL, draftBody(member)); code < 400 || code >= 500 {
				t.Errorf("a person's create with %s answered %d %s, want a refusal", field, code, body)
			}
			code, body := rest.send(t, su, http.MethodPost, adjustmentsURL, draftBody(member))
			if code != http.StatusBadRequest || !strings.Contains(body, "Books keeps this value.") {
				t.Errorf("a superuser's create with %s answered %d %s, want 400 with \"Books keeps this value.\"", field, code, body)
			}
			code, body = rest.send(t, su, http.MethodPatch, adjustmentsURL+"/"+draft.Id, "{"+member+"}")
			if code != http.StatusBadRequest || !strings.Contains(body, "Books keeps this value.") {
				t.Errorf("a superuser's update of %s answered %d %s, want 400 with \"Books keeps this value.\"", field, code, body)
			}
		})
	}
	if after, _ := e.app.CountRecords(inventoryAdjustmentsCollection); after != before {
		t.Errorf("%d adjustments after the refused creates, want %d", after, before)
	}
	stored := reload(t, e.app, inventoryAdjustmentsCollection, draft.Id)
	if stored.GetInt("value_change") != 0 || stored.GetString("replaced_by") != "" {
		t.Errorf("the draft holds value_change %d and replaced_by %q after the refused updates, want 0 and none",
			stored.GetInt("value_change"), stored.GetString("replaced_by"))
	}
}

// Spec §3.4: the correction posts in one server transaction. A refused post of
// the correction leaves the replaced adjustment posted, with its stock.
func TestInventoryAdjustment_AFailedCorrectionLeavesTheOriginalPosted(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", adjustmentLineInput{Product: e.widget.Id, Quantity: 10, Value: 1000, Bin: e.aisle.Id})
	correction, err := saveNew(e.app, inventoryAdjustmentsCollection, map[string]any{
		"status": statusDraft, "kind": adjustmentKindManual, "date": "2026-07-02", "replaces": original.Id,
	})
	if err != nil {
		t.Fatalf("create the correction: %v", err)
	}
	// A revaluation only: with the replaced adjustment's moves gone, the widget
	// has no stock to revalue.
	if _, err := e.adjustmentLine(correction, 0, adjustmentLineInput{Product: e.widget.Id, Value: -500}); err != nil {
		t.Fatalf("save the correction's line: %v", err)
	}
	requireRefused(t, e.postAdjustment(correction.Id), "Widget has no stock to revalue on 2026-07-02.")

	old := reload(t, e.app, inventoryAdjustmentsCollection, original.Id)
	if old.GetString("status") != statusPosted || old.GetString("replaced_by") != "" || old.GetString("voided_by") != "" {
		t.Errorf("the original is %q, replaced_by %q, voided_by %q after the refused correction; want posted and neither",
			old.GetString("status"), old.GetString("replaced_by"), old.GetString("voided_by"))
	}
	if got := reload(t, e.app, "books_journal_entries", original.GetString("entry")).GetString("status"); got != statusPosted {
		t.Errorf("the original's entry is %q, want posted", got)
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, correction.Id).GetString("status"); got != statusDraft {
		t.Errorf("the correction is %q, want draft", got)
	}
	requireOnHand(t, e.app, e.widget, 10, 1000)
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), map[string]float64{e.aisle.Id: 10}, "after the refused correction")
}

// The seed's path: a superuser posts a correction with posted_by set. The
// request has no user for stampActor, so the replaced adjustment takes the new
// one's poster as voided_by.
func TestInventoryAdjustment_ASuperuserCorrectionVoidsAsItsPoster(t *testing.T) {
	e := newBinAdjustEnv(t)
	original := e.postLines(t, "2026-07-01", e.stockIn(10, 1000))
	rest := newRestClient(t, e.app)
	su := mkSuperuser(t, e.app)
	code, body := rest.send(t, su, http.MethodPost, adjustmentsURL, draftBody(fmt.Sprintf(`"replaces":%q`, original.Id)))
	if code != http.StatusOK {
		t.Fatalf("create the correction: %d %s", code, body)
	}
	id := recordIDOf(t, body)
	if _, err := e.adjustmentLine(reload(t, e.app, inventoryAdjustmentsCollection, id), 0, e.stockIn(4, 600)); err != nil {
		t.Fatalf("save the correction's line: %v", err)
	}
	post := fmt.Sprintf(`{"status":"posted","posted_by":%q}`, e.users.bookkeeper.Id)
	if code, body := rest.send(t, su, http.MethodPatch, adjustmentsURL+"/"+id, post); code != http.StatusOK {
		t.Fatalf("post the correction: %d %s", code, body)
	}
	old := reload(t, e.app, inventoryAdjustmentsCollection, original.Id)
	if old.GetString("status") != statusVoid || old.GetString("voided_by") != e.users.bookkeeper.Id || old.GetDateTime("voided_at").IsZero() {
		t.Errorf("the replaced adjustment is %q, voided_by %q, voided_at %v; want void, voided by the poster %q, with a time",
			old.GetString("status"), old.GetString("voided_by"), old.GetDateTime("voided_at"), e.users.bookkeeper.Id)
	}
	if got := reload(t, e.app, inventoryAdjustmentsCollection, id).GetString("posted_by"); got != e.users.bookkeeper.Id {
		t.Errorf("the correction's posted_by = %q, want the bookkeeper", got)
	}
}

// The delete guard wraps what it cannot read, as the line guard does.
func TestInventoryAdjustment_ADeleteWrapsAReadFailure(t *testing.T) {
	se := newAdjustmentEnv(t)
	draft := se.draftAdjustment(t, "2026-07-01")
	stale := reload(t, se.app, inventoryAdjustmentsCollection, draft.Id)
	if _, err := se.app.DB().NewQuery("DELETE FROM " + inventoryAdjustmentsCollection + " WHERE id = {:id}").
		Bind(dbx.Params{"id": draft.Id}).Execute(); err != nil {
		t.Fatalf("remove the row: %v", err)
	}
	requireRefused(t, se.app.Delete(stale), "books: read the adjustment to delete")
}
