package cli

import (
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// Inventory-adjust spec §3.11: the bin locations, the moves between them and
// the quantity of each item in each bin, against the fake. The server half,
// with the same bodies, is server/cli_bins_test.go.

const (
	binAisle    = "binaisle3000001"
	binCounter  = "bincounter00001"
	binBackRoom = "binbackroom0001"
)

// binsFake has the three bins of the spec's seed: Aisle 3, shelf B and Front
// counter are active, Back room is inactive.
func binsFake(t *testing.T) *fakeBooks {
	t.Helper()
	f := newFakeBooks(t)
	for _, b := range []struct {
		id, name, note, sortKey string
		inactive                bool
	}{
		{binAisle, "Aisle 3, shelf B", "by the door", "a", false},
		{binCounter, "Front counter", "", "b", false},
		{binBackRoom, "Back room", "", "c", true},
	} {
		f.add("books_bins", b.id, map[string]any{"name": b.name, "note": b.note, "inactive": b.inactive, "sort_key": b.sortKey})
	}
	return f
}

// `bins` has the commands and the list flags of the other lists with an
// inactive field (tax-agencies in cli/resources_test.go).
func TestBinsHaveTheCommandsOfTheOtherLists(t *testing.T) {
	res := findResource("bins")
	if res == nil {
		t.Fatal("cli/resources.json has no resource bins")
	}
	if res.Collection != "books_bins" {
		t.Errorf("bins is over %q, want books_bins", res.Collection)
	}
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "bins"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), " "); got != "activate add deactivate delete edit list show" {
		t.Errorf("bins commands = %q", got)
	}
	list, _, _ := root.Find([]string{"books", "bins", "list"})
	flags := []string{}
	for _, spec := range flagSpecs(list.LocalFlags()) {
		flags = append(flags, strings.TrimPrefix(spec.Name, "--"))
	}
	slices.Sort(flags)
	if want := []string{"all", "inactive", "limit", "page", "search"}; !slices.Equal(flags, want) {
		t.Errorf("bins list flags = %v, want %v", flags, want)
	}
}

// `bins list` searches the name and leaves the inactive bins out; `--all`
// lists them too.
func TestBinsListSearchesTheNameAndLeavesInactiveBinsOut(t *testing.T) {
	f := binsFake(t)
	if got := itemIDs(listJSON(t, f, "books", "bins", "list")); got != "["+binAisle+" "+binCounter+"]" {
		t.Errorf("bins list = %s, want the two active bins", got)
	}
	if got := f.lastQuery.Get("filter"); got != "inactive = false" {
		t.Errorf("bins list filter = %q, want the active filter", got)
	}
	if got := itemIDs(listJSON(t, f, "books", "bins", "list", "--search", "aisle")); got != "["+binAisle+"]" {
		t.Errorf("bins list --search aisle = %s", got)
	}
	if got := f.lastQuery.Get("filter"); got != `inactive = false && (name ~ "aisle")` {
		t.Errorf("bins list --search filter = %q, want a search of the name only", got)
	}
	if got := itemIDs(listJSON(t, f, "books", "bins", "list", "--all")); got != "["+binAisle+" "+binCounter+" "+binBackRoom+"]" {
		t.Errorf("bins list --all = %s, want the inactive bin too", got)
	}
}

// add, show, edit, deactivate, activate and delete send what the other lists
// send: the input as given, the fields named, `inactive`, a DELETE.
func TestBinsLifeCycle(t *testing.T) {
	f := newFakeBooks(t)
	f.rows["books_bins"] = []rawRecord{}
	c := f.serve()
	const id = "rec000000000001"

	out, errOut, err := runCmd(t, c, `{"name": "Aisle 3, shelf B", "note": "by the door"}`, "books", "bins", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatalf("bins add: %v", err)
	}
	if got := sentJSON(f.lastCreate); got != `{"name":"Aisle 3, shelf B","note":"by the door"}` {
		t.Errorf("bins add sent %s", got)
	}
	if !strings.Contains(errOut, "added ") || !strings.Contains(errOut, "Aisle 3, shelf B") {
		t.Errorf("bins add: stderr %q does not name the added bin", errOut)
	}
	if got := decodeRecord(t, out); got["name"] != "Aisle 3, shelf B" || got["inactive"] != false {
		t.Errorf("bins add printed %v", got)
	}

	out, _, err = runCmd(t, c, "", "books", "bins", "show", id, "--json")
	if err != nil || decodeRecord(t, out)["note"] != "by the door" {
		t.Errorf("bins show: %v\n%s", err, out)
	}
	if last := f.requests[len(f.requests)-1]; last != "GET /api/collections/books_bins/records/"+id {
		t.Errorf("bins show sent %q", last)
	}

	if _, _, err = runCmd(t, c, `{"note": "top shelf"}`, "books", "bins", "edit", id, "--input", "-", "--json"); err != nil {
		t.Fatalf("bins edit: %v", err)
	}
	if got := sentJSON(f.lastPatch); got != `{"note":"top shelf"}` {
		t.Errorf("bins edit sent %s, want only the named field", got)
	}

	if _, _, err = runCmd(t, c, "", "books", "bins", "deactivate", id); err != nil {
		t.Fatalf("bins deactivate: %v", err)
	}
	if got := sentJSON(f.lastPatch); got != `{"inactive":true}` {
		t.Errorf("bins deactivate sent %s", got)
	}
	if _, _, err = runCmd(t, c, "", "books", "bins", "activate", id); err != nil {
		t.Fatalf("bins activate: %v", err)
	}
	if got := sentJSON(f.lastPatch); got != `{"inactive":false}` {
		t.Errorf("bins activate sent %s", got)
	}

	if _, _, err = runCmd(t, c, "", "books", "bins", "delete", id, "--yes"); err != nil {
		t.Fatalf("bins delete: %v", err)
	}
	if !slices.Equal(f.deleted, []string{id}) || len(f.rows["books_bins"]) != 0 {
		t.Errorf("bins delete: deleted %v, rows left %v", f.deleted, f.rows["books_bins"])
	}
}

// A move between bins is never changed: the group has `list`, `show` and
// `add` only, and `edit` and `delete` are unknown words that send nothing.
func TestBinTransfersHaveNoEditAndNoDelete(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "bin-transfers"})
	if err != nil || group.Name() != "bin-transfers" {
		t.Fatalf("books has no group bin-transfers: %v", err)
	}
	if got := strings.Join(subcommandNames(group), " "); got != "add list show" {
		t.Fatalf("bin-transfers commands = %q, want add list show", got)
	}
	f := newFakeBooks(t)
	f.rows["books_bin_transfers"] = []rawRecord{}
	for _, args := range [][]string{
		{"books", "bin-transfers", "edit", "rec000000000001", "--input", "-", "--json"},
		{"books", "bin-transfers", "delete", "rec000000000001", "--yes", "--json"},
	} {
		_, _, err := runCmd(t, f.serve(), `{"memo": "x"}`, args...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%v: exit = %d, want 2; err: %v", args[2:3], got, err)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("an unknown command sent %v", f.requests)
	}
}

// `bin-transfers add` sends the five fields of a move; created_by is the
// server's and is refused before anything is sent.
func TestBinTransfersAddSendsTheMove(t *testing.T) {
	f := newFakeBooks(t)
	f.rows["books_bin_transfers"] = []rawRecord{}
	input := `{"product": "` + stockWidget + `", "from_bin": "` + binAisle + `", "to_bin": "` + binCounter + `", "quantity": 4, "memo": "to the counter"}`
	out, _, err := runCmd(t, f.serve(), input, "books", "bin-transfers", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatalf("bin-transfers add: %v", err)
	}
	if f.lastCreate == nil {
		t.Fatal("bin-transfers add sent no create")
	}
	if last := f.requests[0]; last != "POST /api/collections/books_bin_transfers/records" {
		t.Errorf("bin-transfers add sent %q", last)
	}
	// The tool may name the id of the record it creates (conventions §15).
	sent := maps.Clone(f.lastCreate)
	delete(sent, "id")
	want := `{"from_bin":"` + binAisle + `","memo":"to the counter","product":"` + stockWidget + `","quantity":4,"to_bin":"` + binCounter + `"}`
	if got := sentJSON(sent); got != want {
		t.Errorf("bin-transfers add sent\n%s\nwant\n%s", got, want)
	}
	if got := decodeRecord(t, out); got["from_bin"] != binAisle || got["to_bin"] != binCounter || got["quantity"] != float64(4) {
		t.Errorf("bin-transfers add printed %v", got)
	}

	for _, refused := range []string{"created_by", "created"} {
		f := newFakeBooks(t)
		f.rows["books_bin_transfers"] = []rawRecord{}
		input := `{"product": "` + stockWidget + `", "from_bin": "", "to_bin": "` + binAisle + `", "quantity": 1, "` + refused + `": "x"}`
		_, _, err := runCmd(t, f.serve(), input, "books", "bin-transfers", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"`+refused+`" is set by the server`) {
			t.Errorf("bin-transfers add with %s: exit = %d, err = %v, want 2 and %q is set by the server", refused, got, err, refused)
		}
		if len(f.requests) != 0 {
			t.Errorf("bin-transfers add with %s sent %v", refused, f.requests)
		}
	}
}

// binStockFake has the bin stock of two items: the widget in Aisle 3, in
// Front counter and in No bin, the gadget in Aisle 3.
func binStockFake(t *testing.T) *fakeBooks {
	t.Helper()
	f := newFakeBooks(t)
	for _, r := range []struct {
		id, product, bin, quantity string
	}{
		{"binstockrow0001", stockWidget, binAisle, "6"},
		{"binstockrow0002", stockWidget, "", "2"},
		{"binstockrow0003", stockGadget, binAisle, "3"},
		{"binstockrow0004", stockWidget, binCounter, "4"},
	} {
		f.add("books_bin_stock", r.id, map[string]any{"product": r.product, "bin": r.bin, "quantity": json.Number(r.quantity)})
	}
	return f
}

// `inventory bin-stock --product p --bin b` sends both filters and prints the
// item, the bin and the quantity.
func TestInventoryBinStockFiltersByProductAndBin(t *testing.T) {
	f := binStockFake(t)
	got := listJSON(t, f, "books", "inventory", "bin-stock", "--product", stockWidget, "--bin", binAisle)
	if f.lastQuery.Get("filter") != `product = "`+stockWidget+`" && bin = "`+binAisle+`"` {
		t.Errorf("bin-stock filter = %q", f.lastQuery.Get("filter"))
	}
	if ids := itemIDs(got); ids != "[binstockrow0001]" {
		t.Fatalf("bin-stock of the widget in Aisle 3 = %s", ids)
	}
	if row := got.Items[0]; row["product"] != stockWidget || row["bin"] != binAisle || row["quantity"] != float64(6) {
		t.Errorf("the row = %v", row)
	}

	out, _, err := runCmd(t, f.serve(), "", "books", "inventory", "bin-stock", "--product", stockWidget, "--bin", binAisle)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 2 {
		t.Fatalf("want a header and one row:\n%s", out)
	}
	if header := strings.Fields(lines[0]); len(header) < 3 || strings.Join(header[:3], " ") != "PRODUCT BIN QUANTITY" {
		t.Errorf("header = %v, want PRODUCT BIN QUANTITY first", header)
	}
	if row := strings.Fields(lines[1]); len(row) < 3 || strings.Join(row[:3], " ") != stockWidget+" "+binAisle+" 6" {
		t.Errorf("row = %v", row)
	}
}

// An empty `--bin ""` is No bin: it filters the rows with no bin.
func TestInventoryBinStockEmptyBinIsNoBin(t *testing.T) {
	f := binStockFake(t)
	got := listJSON(t, f, "books", "inventory", "bin-stock", "--bin", "")
	if f.lastQuery.Get("filter") != `bin = ""` {
		t.Errorf("bin-stock --bin \"\" filter = %q, want the rows of No bin", f.lastQuery.Get("filter"))
	}
	if ids := itemIDs(got); ids != "[binstockrow0002]" {
		t.Errorf("bin-stock of No bin = %s", ids)
	}
}

// `inventory moves` prints the bin a move went to and the number of its
// transaction, both read-only.
func TestInventoryMovesPrintTheBinAndTheDocumentNumber(t *testing.T) {
	f := newFakeBooks(t)
	f.add(stockMovesCollection, "stockmove000001", map[string]any{
		"product": stockWidget, "date": "2026-09-05", "kind": "adjustment", "seq": json.Number("1"),
		"quantity": json.Number("4"), "value": json.Number("600"), "bin": binAisle, "document_number": "IA-12",
	})
	got := listJSON(t, f, "books", "inventory", "moves", "--product", stockWidget)
	if len(got.Items) != 1 || got.Items[0]["bin"] != binAisle || got.Items[0]["document_number"] != "IA-12" {
		t.Errorf("inventory moves printed %v, want bin %s and document_number IA-12", got.Items, binAisle)
	}
	for _, name := range []string{"bin", "document_number"} {
		i := slices.IndexFunc(stockMovesResource.Fields, func(fld field) bool { return fld.Name == name })
		if i < 0 || !stockMovesResource.Fields[i].ReadOnly {
			t.Errorf("inventory moves has no read-only field %q", name)
		}
	}
}

// `products` prints the item's default bin and whether it is low; the tool
// takes default_bin and refuses low_stock, which Books keeps.
func TestProductsTakeADefaultBinAndRefuseLowStock(t *testing.T) {
	f := newFakeBooks(t)
	f.addRow("books_products", "prodwidget00001", map[string]any{
		"type": "inventory", "name": "Widget", "default_bin": binAisle, "low_stock": true, "sort_key": "a",
	})
	out, _, err := runCmd(t, f.serve(), "", "books", "products", "show", "prodwidget00001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeRecord(t, out); got["default_bin"] != binAisle || got["low_stock"] != true {
		t.Errorf("products show printed default_bin %v, low_stock %v", got["default_bin"], got["low_stock"])
	}

	input := `{"type": "inventory", "name": "Gadget", "income_account": "acctincome00001", "default_bin": "` + binCounter + `"}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "products", "add", "--input", "-", "--json"); err != nil {
		t.Fatalf("products add with a default_bin: %v", err)
	}
	if f.lastCreate["default_bin"] != binCounter {
		t.Errorf("products add sent %s, want the default_bin", sentJSON(f.lastCreate))
	}

	before := len(f.requests)
	_, _, err = runCmd(t, f.serve(), `{"low_stock": false}`, "books", "products", "edit", "prodwidget00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"low_stock" is set by the server`) {
		t.Errorf("products edit with low_stock: exit = %d, err = %v", got, err)
	}
	if len(f.requests) != before {
		t.Errorf("products edit with low_stock sent %v", f.requests[before:])
	}
}

// An adjustment line names its bin, and `add` takes `replaces`: the batch of
// `add --post` (TestCLIBins_ACorrectionWithABinVoidsTheOriginal sends the same
// writes). value_change and replaced_by are Books' and are refused.
func TestInventoryAdjustmentAddWithABinAndReplaces(t *testing.T) {
	f := adjustments(t)
	input := `{"date": "2026-09-06", "memo": "recount", "replaces": "` + adjustPosted + `", "lines": [{"product": "` + stockWidget + `", "bin": "` + binAisle + `", "quantity": 4, "value": 600}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "inventory-adjustments", "add", "--input", "-", "--id", "cliadjust000002", "--post", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustments/records","body":{"date":"2026-09-06","id":"cliadjust000002","kind":"manual","memo":"recount","replaces":"` + adjustPosted + `","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000002","bin":"` + binAisle + `","position":0,"product":"` + stockWidget + `","quantity":4,"value":600,"value_given":true}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/cliadjust000002","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}

	for refused, value := range map[string]string{"value_change": "600", "replaced_by": `"` + adjustPosted + `"`} {
		f := adjustments(t)
		input := `{"date": "2026-09-06", "` + refused + `": ` + value + `, "lines": [{"product": "` + stockWidget + `", "quantity": 1}]}`
		_, _, err := runCmd(t, f.serve(), input, "books", "inventory-adjustments", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"`+refused+`" is set by the server`) {
			t.Errorf("inventory-adjustments add with %s: exit = %d, err = %v", refused, got, err)
		}
		if len(f.batches) != 0 {
			t.Errorf("inventory-adjustments add with %s sent a batch", refused)
		}
	}
}
