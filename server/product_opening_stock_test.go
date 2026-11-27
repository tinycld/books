package books

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestInventoryItem_OpeningStockPostsAnOpeningAdjustment(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-01-01",
	}))
	if err != nil {
		t.Fatalf("save an item with opening stock: %v", err)
	}
	// The record the create answers with holds the totals, as the stored row.
	if widget.GetFloat("quantity_on_hand") != 10 || widget.GetInt("stock_value") != 4000 {
		t.Errorf("the saved record holds %v on hand worth %d, want 10 and 4000",
			widget.GetFloat("quantity_on_hand"), widget.GetInt("stock_value"))
	}
	requireOnHand(t, env.app, widget, 10, 4000)
	opening := openingOf(t, env.app, widget)
	if opening == nil {
		t.Fatal("no opening adjustment")
	}
	if opening.GetString("date") != "2026-01-01" || opening.GetString("memo") != "Opening stock of Widget" {
		t.Errorf("opening adjustment date %q memo %q", opening.GetString("date"), opening.GetString("memo"))
	}
	equity := reload(t, env.app, "books_accounts", opening.GetString("account"))
	if equity.GetString("name") != "Opening Balance Equity" || equity.GetString("type") != "equity" {
		t.Errorf("the opening posts against %q (%s), want Opening Balance Equity", equity.GetString("name"), equity.GetString("type"))
	}
	requireEntryLines(t, env.app, opening.GetString("entry"),
		entryLine{account: widget.GetString("asset_account"), debit: 4000},
		entryLine{account: equity.Id, credit: 4000},
	)
	moves, err := documentStockMoves(env.app, inventoryAdjustmentsCollection, opening.Id)
	if err != nil || len(moves) != 1 || moves[0].GetString("kind") != stockKindOpening {
		t.Fatalf("moves of the opening adjustment = %v (err %v), want one opening move", moves, err)
	}
	requireRefused(t, setFieldsOf(env.app, inventoryAdjustmentsCollection, opening.Id, map[string]any{"status": statusVoid}),
		"Books made Inventory adjustment IA-1.")
	requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_products", widget.Id)),
		"This product or service is on 1 inventory adjustment. Make it inactive instead.")
	other := mkAccount(t, env.app, "Stock room", "other_current_asset", "inventory")
	requireFieldRefusal(t, setFields(t, env.app, "books_products", widget.Id, map[string]any{"asset_account": other.Id}),
		"asset_account", "The inventory asset account cannot change after the item has stock transactions.")
}

// A change of the opening fields replaces the opening adjustment; a write that
// leaves them alone posts nothing.
func TestInventoryItem_OpeningStockChangeReplacesTheAdjustment(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-01-01",
	}))
	if err != nil {
		t.Fatal(err)
	}
	first := openingOf(t, env.app, widget)

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"name": "Blue widget"}); err != nil {
		t.Fatalf("rename: %v", err)
	}
	if got := openingOf(t, env.app, widget); got == nil || got.Id != first.Id {
		t.Error("a rename must leave the opening adjustment alone")
	}

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"opening_quantity": 4, "opening_value": 1000}); err != nil {
		t.Fatalf("change the opening stock: %v", err)
	}
	second := openingOf(t, env.app, widget)
	if second == nil || second.Id == first.Id {
		t.Fatal("the opening adjustment was not replaced")
	}
	if got := reload(t, env.app, inventoryAdjustmentsCollection, first.Id).GetString("status"); got != statusVoid {
		t.Errorf("the first opening adjustment is %s, want void", got)
	}
	if got := reload(t, env.app, "books_journal_entries", first.GetString("entry")).GetString("status"); got != statusVoid {
		t.Errorf("the entry of the first opening adjustment is %s, want void", got)
	}
	requireOnHand(t, env.app, widget, 4, 1000)

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"opening_quantity": 0, "opening_value": 0}); err != nil {
		t.Fatalf("clear the opening stock: %v", err)
	}
	if openingOf(t, env.app, widget) != nil {
		t.Error("an item with no opening quantity keeps no posted opening adjustment")
	}
	requireOnHand(t, env.app, widget, 0, 0)
}

// Spec §4: replaces names a posted manual adjustment, so only a person's
// correction links the two (TestInventoryAdjustment_ACorrectionReplacesItsOriginalInOnePost).
// The re-post Books makes for an opening-stock change links neither: the old
// opening adjustment is void with no replaced_by, the new one has no replaces.
func TestInventoryItem_OpeningStockRepostLinksNoReplacement(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-01-01",
	}))
	if err != nil {
		t.Fatal(err)
	}
	first := openingOf(t, env.app, widget)
	if first == nil {
		t.Fatal("no opening adjustment")
	}
	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"opening_quantity": 12}); err != nil {
		t.Fatalf("change the opening quantity: %v", err)
	}
	second := openingOf(t, env.app, widget)
	if second == nil || second.Id == first.Id {
		t.Fatal("the opening adjustment was not replaced")
	}
	old := reload(t, env.app, inventoryAdjustmentsCollection, first.Id)
	if old.GetString("status") != statusVoid {
		t.Errorf("the first opening adjustment is %s, want void", old.GetString("status"))
	}
	if got := old.GetString("replaced_by"); got != "" {
		t.Errorf("the void opening adjustment has replaced_by %q, want empty (Books made the re-post)", got)
	}
	if got := reload(t, env.app, inventoryAdjustmentsCollection, second.Id).GetString("replaces"); got != "" {
		t.Errorf("the new opening adjustment has replaces %q, want empty (Books made the re-post)", got)
	}
	requireOnHand(t, env.app, widget, 12, 4000)
}

// The opening adjustment is a posting: the close date holds for it, and a
// refused opening leaves no item behind.
func TestInventoryItem_OpeningStockInAClosedPeriodIsRefused(t *testing.T) {
	env := newItemEnv(t)
	if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"close_date": "2026-03-31"}); err != nil {
		t.Fatal(err)
	}
	_, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-01-01",
	}))
	requireRefused(t, err, "The books are closed through 2026-03-31.")
	if n, _ := env.app.CountRecords("books_products"); n != 0 {
		t.Errorf("%d products after the refused opening, want none", n)
	}
}

// removalOf posts a manual adjustment that takes units of the item out.
func removalOf(t testing.TB, env *ledgerEnv, product *core.Record, date string, units float64) *core.Record {
	t.Helper()
	var out *core.Record
	err := env.app.RunInTransaction(func(tx core.App) error {
		var err error
		out, err = newSystemAdjustment(tx, systemAdjustment{
			Kind: adjustmentKindManual, Date: date, Actor: env.users.bookkeeper.Id,
			Lines: []adjustmentLineInput{{Product: product.Id, Quantity: -units}},
		})
		return err
	})
	if err != nil {
		t.Fatalf("take %v out: %v", units, err)
	}
	return out
}

// The new opening adjustment takes the old one's place in one replay: a void
// and then a post would re-cost the later removal two times.
func TestInventoryItem_OpeningStockChangeRecostsALaterRemovalOnce(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, map[string]any{
		"opening_quantity": 10, "opening_value": 4000, "opening_date": "2026-01-01",
	}))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 5)
	requireOnHand(t, env.app, widget, 5, 2000)

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"opening_value": 6000}); err != nil {
		t.Fatalf("change the opening value: %v", err)
	}
	recosts := recostsOf(t, env.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	if recosts[0].GetString("status") != statusPosted || recosts[0].GetString("date") != "2026-02-01" {
		t.Errorf("the re-cost is %s on %s, want posted on 2026-02-01", recosts[0].GetString("status"), recosts[0].GetString("date"))
	}
	requireOnHand(t, env.app, widget, 5, 3000)
}

// The cost is the last known cost of an item with no stock-in: a change of it
// re-costs the removal it priced in the same write.
func TestInventoryItem_CostChangeRecostsWhatItPriced(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 4)
	requireOnHand(t, env.app, widget, -4, -2000)

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"cost": 700}); err != nil {
		t.Fatalf("change the cost: %v", err)
	}
	if n := len(recostsOf(t, env.app, out)); n != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", n)
	}
	requireOnHand(t, env.app, widget, -4, -2800)
	if got := reload(t, env.app, "books_products", widget.Id).GetInt("cost"); got != 700 {
		t.Errorf("cost = %d, want 700", got)
	}

	// A change that prices nothing posts nothing.
	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"cost": 700, "name": "Blue widget"}); err != nil {
		t.Fatalf("rename: %v", err)
	}
	if n := len(recostsOf(t, env.app, out)); n != 1 {
		t.Errorf("%d re-costs after a rename, want 1", n)
	}
}

// One write that changes the cost and the opening stock re-costs the removal
// once, for the net change.
func TestInventoryItem_CostAndOpeningChangeRecostOnce(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 4)

	err = setFields(t, env.app, "books_products", widget.Id, map[string]any{
		"cost": 700, "opening_quantity": 10, "opening_value": 6000, "opening_date": "2026-01-01",
	})
	if err != nil {
		t.Fatalf("change the cost and the opening stock: %v", err)
	}
	if n := len(recostsOf(t, env.app, out)); n != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", n)
	}
	requireOnHand(t, env.app, widget, 6, 3600)
}

// The opening adjustment names the person whose request saved the item.
func TestInventoryItem_OpeningAdjustmentNamesWhoSavedTheItem(t *testing.T) {
	env := newItemEnv(t)
	body := fmt.Sprintf(`{"type":"inventory","name":"Widget","income_account":%q,"cost":500,"opening_quantity":10,"opening_value":4000,"opening_date":"2026-01-01"}`, env.revenue.Id)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_products/records",
		token: tokenFor(t, env.users.bookkeeper), body: body, want: 200,
		after: func(t testing.TB, app *tests.TestApp) {
			widget, err := app.FindFirstRecordByData("books_products", "name", "Widget")
			if err != nil {
				t.Fatalf("read the item: %v", err)
			}
			opening := openingOf(t, app, widget)
			if opening == nil {
				t.Fatal("no opening adjustment")
			}
			if got := opening.GetString("posted_by"); got != env.users.bookkeeper.Id {
				t.Errorf("posted_by = %q, want the bookkeeper %q", got, env.users.bookkeeper.Id)
			}
		},
	}.run(t, env.app)
}

// An update request keeps its own person too: the re-cost of a cost change
// names the admin who sent the update, not the bookkeeper who posted the
// removal. This pins that the request's record is the one the model hooks get.
func TestInventoryItem_CostChangeRecostNamesWhoSentTheUpdate(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 4)
	apiReq{
		method: http.MethodPatch, url: "/api/collections/books_products/records/" + widget.Id,
		token: tokenFor(t, env.users.admin), body: `{"cost":700}`, want: 200,
		after: func(t testing.TB, app *tests.TestApp) {
			recosts := recostsOf(t, app, out)
			if len(recosts) != 1 {
				t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
			}
			if got := recosts[0].GetString("posted_by"); got != env.users.admin.Id {
				t.Errorf("re-cost posted_by = %q, want the admin %q", got, env.users.admin.Id)
			}
		},
	}.run(t, env.app)
}

// A cost change that re-costs a removal in a closed period posts the re-cost
// on the day of the change.
func TestInventoryItem_CostChangeRecostsAClosedPeriodOnTheDayOfTheChange(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 4)
	if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"close_date": "2026-03-31"}); err != nil {
		t.Fatal(err)
	}

	if err := setFields(t, env.app, "books_products", widget.Id, map[string]any{"cost": 700}); err != nil {
		t.Fatalf("change the cost: %v", err)
	}
	recosts := recostsOf(t, env.app, out)
	if len(recosts) != 1 {
		t.Fatalf("%d re-costs of the removal, want 1", len(recosts))
	}
	if got, want := recosts[0].GetString("date"), todayUTC(time.Now()); got != want {
		t.Errorf("re-cost date = %s, want the day of the change %s", got, want)
	}
	requireOnHand(t, env.app, widget, -4, -2800)
}

// A refused re-cost leaves the old cost stored: storeItemCost writes the new
// cost inside the write's transaction, which the refusal rolls back. Here
// the day of the change is in the closed period too, so the refusal names
// the document and the item.
func TestInventoryItem_CostChangeInAClosedPeriodKeepsTheOldCost(t *testing.T) {
	env := newItemEnv(t)
	widget, err := newProduct(env.app, inventoryItem(env, nil))
	if err != nil {
		t.Fatal(err)
	}
	out := removalOf(t, env, widget, "2026-02-01", 4)
	if err := setFields(t, env.app, "books_settings", settingsID, map[string]any{"close_date": "2999-12-31"}); err != nil {
		t.Fatal(err)
	}

	err = setFields(t, env.app, "books_products", widget.Id, map[string]any{"cost": 700})
	requireRefused(t, err, "The books are closed through 2999-12-31, so Books cannot re-cost Inventory adjustment IA-1 for "+
		widget.GetString("name")+" on "+todayUTC(time.Now())+".")
	if got := reload(t, env.app, "books_products", widget.Id).GetInt("cost"); got != 500 {
		t.Errorf("cost = %d after the refused change, want 500", got)
	}
	if n := len(recostsOf(t, env.app, out)); n != 0 {
		t.Errorf("%d re-costs after the refusal, want none", n)
	}
	requireOnHand(t, env.app, widget, -4, -2000)
}

// A superuser's request names no one: the opening adjustment is posted with an
// empty posted_by, as a Go caller's write is.
func TestInventoryItem_ASuperuserSavesAnOpeningWithNoPerson(t *testing.T) {
	env := newItemEnv(t)
	body := fmt.Sprintf(`{"type":"inventory","name":"Widget","income_account":%q,"cost":500,"opening_quantity":10,"opening_value":4000,"opening_date":"2026-01-01"}`, env.revenue.Id)
	apiReq{
		method: http.MethodPost, url: "/api/collections/books_products/records",
		token: tokenFor(t, mkSuperuser(t, env.app)), body: body, want: 200,
		after: func(t testing.TB, app *tests.TestApp) {
			widget, err := app.FindFirstRecordByData("books_products", "name", "Widget")
			if err != nil {
				t.Fatalf("read the item: %v", err)
			}
			opening := openingOf(t, app, widget)
			if opening == nil {
				t.Fatal("no opening adjustment")
			}
			if got := opening.GetString("posted_by"); got != "" {
				t.Errorf("posted_by = %q, want empty", got)
			}
			if got := opening.GetString("status"); got != statusPosted {
				t.Errorf("status = %q, want posted", got)
			}
			requireOnHand(t, app, widget, 10, 4000)
		},
	}.run(t, env.app)
}
