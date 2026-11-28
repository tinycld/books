package cli

import (
	"encoding/json"
	"slices"
	"testing"
)

const (
	stockWidget = "prodwidget00001"
	stockGadget = "prodgadget00001"
)

// inventoryFake has the history of two Inventory items: the widget was
// received and sold, the gadget was adjusted.
func inventoryFake(t *testing.T) *fakeBooks {
	f := newFakeBooks(t)
	for _, m := range []struct {
		id, product, date, kind, seq, quantity, value string
	}{
		{"stockmove000001", stockWidget, "2026-09-01", "receipt", "1", "10", "5000"},
		{"stockmove000002", stockWidget, "2026-09-08", "sale", "2", "-4", "-2000"},
		{"stockmove000003", stockGadget, "2026-09-05", "adjustment", "3", "3", "900"},
		{"stockmove000004", stockWidget, "2026-08-20", "receipt", "4", "2", "800"},
	} {
		f.add(stockMovesCollection, m.id, map[string]any{
			"product": m.product, "date": m.date, "kind": m.kind, "seq": json.Number(m.seq),
			"quantity": json.Number(m.quantity), "value": json.Number(m.value),
		})
	}
	f.add(stockLayersCollection, "stocklayer00001", map[string]any{
		"product": stockWidget, "move": "stockmove000001", "date": "2026-09-01",
		"quantity": json.Number("6"), "value": json.Number("3000"), "position": json.Number("1"),
	})
	f.add(stockLayersCollection, "stocklayer00002", map[string]any{
		"product": stockGadget, "move": "stockmove000003", "date": "2026-09-05",
		"quantity": json.Number("3"), "value": json.Number("900"), "position": json.Number("3"),
	})
	// A receipt that was recorded later with an earlier date: Books takes
	// stock out of it first.
	f.add(stockLayersCollection, "stocklayer00003", map[string]any{
		"product": stockWidget, "move": "stockmove000004", "date": "2026-08-20",
		"quantity": json.Number("2"), "value": json.Number("800"), "position": json.Number("4"),
	})
	return f
}

func TestInventoryResourcesAreLegalDefinitions(t *testing.T) {
	names := map[string]bool{"products": true, "accounts": true, "inventory moves": true, "bins": true}
	// The lists of the group: `moves`, `layers` and `bin-stock`
	// (inventory-adjust spec §3.11).
	words := []string{}
	for word, res := range inventoryResources() {
		words = append(words, word)
		copied := *res
		if err := checkResource(&copied, names); err != nil {
			t.Errorf("%s: %v", word, err)
		}
	}
	slices.Sort(words)
	if want := []string{"bin-stock", "layers", "moves"}; !slices.Equal(words, want) {
		t.Errorf("inventory lists = %v, want %v", words, want)
	}
	// `bin-transfers` is a group of its own, built in Go too.
	copied := binTransfersResource
	if err := checkResource(&copied, names); err != nil {
		t.Errorf("bin-transfers: %v", err)
	}
}

func TestInventoryMoves(t *testing.T) {
	f := inventoryFake(t)
	if got := itemIDs(listJSON(t, f, "books", "inventory", "moves")); got != "[stockmove000002 stockmove000003 stockmove000001 stockmove000004]" {
		t.Errorf("moves = %s, want the newest first", got)
	}
	if got := itemIDs(listJSON(t, f, "books", "inventory", "moves", "--product", stockWidget, "--kind", "sale")); got != "[stockmove000002]" {
		t.Errorf("moves of the widget's sales = %s", got)
	}
}

func TestInventoryLayers(t *testing.T) {
	f := inventoryFake(t)
	got := listJSON(t, f, "books", "inventory", "layers", "--product", stockWidget)
	if ids := itemIDs(got); ids != "[stocklayer00003 stocklayer00001]" {
		t.Errorf("layers = %s, want the earliest date first", ids)
	}
	if got.Items[1]["quantity"] != float64(6) || got.Items[1]["value"] != float64(3000) {
		t.Errorf("the layer = %v", got.Items[1])
	}
}
