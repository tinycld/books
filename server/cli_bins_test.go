package books

import (
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"
)

// Inventory-adjust spec §3.11: the bin commands of the Books CLI against the
// real PocketBase API with an access token. The server test cannot import the
// CLI module, so each body here is a copy of what cli/bins_test.go asserts:
// when one changes, change the other. The field declarations are read from
// cli/resources.json and cli/documents.json, and the filter and sort of
// `inventory bin-stock` from cli/testdata/list-filters.json (its case
// "inventory-bin-stock-of-a-product", `--product prodwidget00001`).

func cliResourceNamed(t testing.TB, name string) cliResource {
	t.Helper()
	for _, res := range loadCLIResources(t) {
		if res.Name == name {
			return res
		}
	}
	t.Fatalf("cli/resources.json has no resource %q", name)
	return cliResource{}
}

func cliDocumentNamed(t testing.TB, name string) cliDocument {
	t.Helper()
	for _, doc := range loadCLIDocuments(t) {
		if doc.Name == name {
			return doc
		}
	}
	t.Fatalf("cli/documents.json has no document %q", name)
	return cliDocument{}
}

// requireCLIDeclares fails unless the CLI declares the field, not in omit, read
// only or not as readOnly says, with the ref when ref is not empty.
func requireCLIDeclares(t testing.TB, label string, fields []cliField, omit []string, name string, readOnly bool, ref string) {
	t.Helper()
	i := slices.IndexFunc(fields, func(f cliField) bool { return f.Name == name })
	if i < 0 || slices.Contains(omit, name) {
		t.Fatalf("%s: the CLI does not declare %q (omit %v)", label, name, omit)
	}
	if fields[i].ReadOnly != readOnly {
		t.Errorf("%s.%s: readOnly = %v, want %v", label, name, fields[i].ReadOnly, readOnly)
	}
	if ref != "" && fields[i].Ref != ref {
		t.Errorf("%s.%s: ref = %q, want %q", label, name, fields[i].Ref, ref)
	}
}

// addCLIBin is `bins add` of a bin with a name: the body cli/bins_test.go
// asserts. It returns the id the server gave.
func addCLIBin(t testing.TB, env *cliBankEnv, name string) string {
	t.Helper()
	answer := env.call(t, env.writer, http.MethodPost, collectionURL(binsCollection), fmt.Sprintf(`{"name":%q}`, name))
	answer.requireStatus(t, http.StatusOK)
	return answer.id(t)
}

// cliBinStockOf is `inventory bin-stock --product <id>`: the quantity of each
// bin of the item, by bin id ("" is No bin), as the command reads it.
func cliBinStockOf(t testing.TB, env *cliBankEnv, product string) map[string]float64 {
	t.Helper()
	c := listFilterCaseNamed(t, "inventory-bin-stock-of-a-product")
	if c.Resource != "inventory" || c.View != "bin-stock" || !strings.Contains(c.Filter, "prodwidget00001") {
		t.Fatalf("the case %q is not `inventory bin-stock --product prodwidget00001`: %+v", c.Name, c)
	}
	filter := strings.ReplaceAll(c.Filter, "prodwidget00001", product)
	got := map[string]float64{}
	for _, row := range env.list(t, binStockCollection, filter, c.Sort).items(t) {
		if row["product"] != product {
			t.Errorf("bin-stock of %s printed a row of %v", product, row["product"])
		}
		bin, _ := row["bin"].(string)
		quantity, _ := row["quantity"].(float64)
		got[bin] = quantity
	}
	return got
}

// adjustCLI is `inventory-adjustments add --post` with one line: the header,
// the line and the post in one batch, as cli/document_adjust_test.go asserts.
// header is the inside of the header's JSON object after its id.
func adjustCLI(t testing.TB, env *cliBankEnv, id, header, line string) apiAnswer {
	t.Helper()
	return env.call(t, env.writer, http.MethodPost, "/api/batch", batchBody(
		cliOp("POST", inventoryAdjustmentsCollection, "", `{"id":"`+id+`",`+header+`,"kind":"manual","status":"draft"}`),
		rowOp(inventoryAdjustmentLinesCollection, "adjustment", id, 0, line),
		cliOp("PATCH", inventoryAdjustmentsCollection, id, `{"status":"posted"}`),
	))
}

// `bins add`, a duplicate name, `list --search`, `edit`, `deactivate`,
// `activate` and `delete`: the requests of the other lists, on books_bins.
func TestCLIBins_ATokenAddsChangesAndDeletesABin(t *testing.T) {
	env := newCLIBankEnv(t)
	res := cliResourceNamed(t, "bins")
	if res.Collection != binsCollection {
		t.Fatalf("bins is over %q, want %s", res.Collection, binsCollection)
	}
	added := env.call(t, env.writer, http.MethodPost, collectionURL(binsCollection), `{"name":"Aisle 3, shelf B","note":"by the door"}`)
	added.requireStatus(t, http.StatusOK)
	aisle := added.id(t)
	if got := added.json(t); got["name"] != "Aisle 3, shelf B" || got["note"] != "by the door" || got["inactive"] != false {
		t.Errorf("the added bin = %s", added.body)
	}
	counter := addCLIBin(t, env, "Front counter")
	env.call(t, env.reader, http.MethodPost, collectionURL(binsCollection), `{"name":"Back room"}`).requireStatus(t, http.StatusForbidden)

	// A name is unique without regard to case: the CLI prints the server's text.
	duplicate := env.call(t, env.writer, http.MethodPost, collectionURL(binsCollection), `{"name":"front counter"}`)
	duplicate.requireRefusal(t, binText(t, "nameTaken", "front counter"))
	data, _ := duplicate.json(t)["data"].(map[string]any)
	if field, _ := data["name"].(map[string]any); field["message"] != binText(t, "nameTaken", "front counter") {
		t.Errorf("the refusal names the fields %v, want name with the server's text", data)
	}

	if rows := env.list(t, binsCollection, `inactive = false && (name ~ "aisle")`, res.Sort).items(t); len(rows) != 1 || rows[0]["id"] != aisle {
		t.Errorf("bins list --search aisle = %v", rows)
	}
	one := collectionURL(binsCollection) + "/" + counter
	if got := env.call(t, env.writer, http.MethodPatch, one, `{"note":"top shelf"}`).json(t); got["note"] != "top shelf" || got["name"] != "Front counter" {
		t.Errorf("bins edit = %v", got)
	}
	env.call(t, env.writer, http.MethodPatch, one, `{"inactive":true}`).requireStatus(t, http.StatusOK)
	if rows := env.list(t, binsCollection, "inactive = false", res.Sort).items(t); len(rows) != 1 || rows[0]["id"] != aisle {
		t.Errorf("bins list after the deactivate = %v", rows)
	}
	env.call(t, env.writer, http.MethodPatch, one, `{"inactive":false}`).requireStatus(t, http.StatusOK)
	env.call(t, env.writer, http.MethodDelete, one, "").requireStatus(t, http.StatusNoContent)
	env.call(t, env.writer, http.MethodGet, one, "").requireStatus(t, http.StatusNotFound)
}

// `products add` with a default_bin: the opening stock, which names no bin,
// goes to it (spec §3.1). `products show` prints default_bin and low_stock,
// and Books refuses a write of low_stock, which the CLI declares read-only.
func TestCLIBins_AnItemTakesADefaultBinAndBooksKeepsLowStock(t *testing.T) {
	env, _ := newCLIStockEnv(t)
	products := cliResourceNamed(t, "products")
	requireCLIDeclares(t, "products", products.Fields, products.Omit, "default_bin", false, "bins")
	requireCLIDeclares(t, "products", products.Fields, products.Omit, "low_stock", true, "")
	aisle := addCLIBin(t, env, "Aisle 3, shelf B")

	added := env.call(t, env.writer, http.MethodPost, collectionURL("books_products"),
		fmt.Sprintf(`{"default_bin":%q,"income_account":%q,"name":"Label printer","opening_date":"2026-09-01","opening_quantity":10,"opening_value":5000,"reorder_point":12,"type":"inventory"}`,
			aisle, env.revenue.Id))
	added.requireStatus(t, http.StatusOK)
	item := added.id(t)
	if got := added.json(t); got["default_bin"] != aisle {
		t.Errorf("the added item = %s, want default_bin %s", added.body, aisle)
	}
	if got := cliBinStockOf(t, env, item); len(got) != 1 || got[aisle] != 10 {
		t.Errorf("bin-stock of the item = %v, want 10 in the default bin", got)
	}

	shown := env.call(t, env.reader, http.MethodGet, collectionURL("books_products")+"/"+item, "").json(t)
	if shown["default_bin"] != aisle || shown["low_stock"] != true || shown["quantity_on_hand"] != float64(10) {
		t.Errorf("products show = default_bin %v, low_stock %v, on hand %v; want %s, true (10 at a reorder point of 12), 10",
			shown["default_bin"], shown["low_stock"], shown["quantity_on_hand"], aisle)
	}
	env.call(t, env.writer, http.MethodPatch, collectionURL("books_products")+"/"+item, `{"low_stock":false}`).requireRefusal(t, msgBooksKeepsValue)
}

// `inventory-adjustments add --post` with a line `bin`: `inventory bin-stock`
// prints that bin's quantity, `inventory moves` prints the bin and the number,
// `show` prints value_change, and Books refuses a write of value_change.
func TestCLIBins_AnAdjustmentLineMovesStockInItsBin(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	doc := cliDocumentNamed(t, "inventory-adjustments")
	if len(doc.Lines) != 1 {
		t.Fatalf("inventory-adjustments has %d line tables, want 1", len(doc.Lines))
	}
	requireCLIDeclares(t, "inventory-adjustments.lines", doc.Lines[0].Fields, doc.Lines[0].Omit, "bin", false, "bins")
	requireCLIDeclares(t, "inventory-adjustments", doc.Fields, doc.Omit, "value_change", true, "")
	aisle := addCLIBin(t, env, "Aisle 3, shelf B")
	const id = "cliadjust000022"

	adjustCLI(t, env, id, `"date":"2026-09-05","memo":"count"`,
		fmt.Sprintf(`"bin":%q,"product":%q,"quantity":10,"value":5000,"value_given":true`, aisle, widget.Id)).requireStatus(t, http.StatusOK)
	if got := cliBinStockOf(t, env, widget.Id); len(got) != 1 || got[aisle] != 10 {
		t.Errorf("bin-stock of the widget = %v, want 10 in Aisle 3", got)
	}
	header := env.call(t, env.writer, http.MethodGet, collectionURL(inventoryAdjustmentsCollection)+"/"+id, "").json(t)
	if header["status"] != "posted" || header["value_change"] != float64(5000) {
		t.Errorf("inventory-adjustments show = status %v, value_change %v; want posted, 5000", header["status"], header["value_change"])
	}
	moves := env.list(t, stockMovesCollection, fmt.Sprintf(`product = %q`, widget.Id), "-date,-seq,id").items(t)
	if len(moves) != 1 || moves[0]["bin"] != aisle || moves[0]["document_number"] != header["number"] || header["number"] == "" {
		t.Errorf("inventory moves = %v, want one move in %s with the number %v", moves, aisle, header["number"])
	}

	// The CLI refuses value_change before it sends anything; the server refuses
	// it too: the create rule, and the update rule, which hides the draft.
	const draft = "cliadjust000023"
	drafts := collectionURL(inventoryAdjustmentsCollection)
	env.call(t, env.writer, http.MethodPost, drafts,
		`{"date":"2026-09-05","id":"`+draft+`","kind":"manual","status":"draft","value_change":100}`).requireStatus(t, http.StatusBadRequest)
	env.call(t, env.writer, http.MethodPost, drafts, `{"date":"2026-09-05","id":"`+draft+`","kind":"manual","status":"draft"}`).requireStatus(t, http.StatusOK)
	env.call(t, env.writer, http.MethodPatch, drafts+"/"+draft, `{"value_change":100}`).requireStatus(t, http.StatusNotFound)
	if got := env.call(t, env.writer, http.MethodGet, drafts+"/"+draft, "").json(t); got["value_change"] != float64(0) {
		t.Errorf("the draft's value_change = %v after the refused writes, want 0", got["value_change"])
	}
}

// `bin-transfers add` moves a quantity: `inventory bin-stock` prints both
// rows. A move above what the From bin holds is refused with the "holds" text.
func TestCLIBins_ATokenMovesStockBetweenBins(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	aisle := addCLIBin(t, env, "Aisle 3, shelf B")
	counter := addCLIBin(t, env, "Front counter")
	adjustCLI(t, env, "cliadjust000024", `"date":"2026-09-05","memo":"count"`,
		fmt.Sprintf(`"bin":%q,"product":%q,"quantity":10,"value":5000,"value_given":true`, aisle, widget.Id)).requireStatus(t, http.StatusOK)

	transfer := func(auth string, quantity int) apiAnswer {
		return env.call(t, auth, http.MethodPost, collectionURL(binTransfersCollection),
			fmt.Sprintf(`{"from_bin":%q,"memo":"to the counter","product":%q,"quantity":%d,"to_bin":%q}`, aisle, widget.Id, quantity, counter))
	}
	transfer(env.reader, 4).requireStatus(t, http.StatusForbidden)
	moved := transfer(env.writer, 4)
	moved.requireStatus(t, http.StatusOK)
	if got := moved.json(t); got["created_by"] == "" || got["created"] == "" || got["quantity"] != float64(4) || got["memo"] != "to the counter" {
		t.Errorf("bin-transfers add printed %s", moved.body)
	}
	if got := cliBinStockOf(t, env, widget.Id); len(got) != 2 || got[aisle] != 6 || got[counter] != 4 {
		t.Errorf("bin-stock after the move = %v, want 6 in Aisle 3 and 4 in Front counter", got)
	}
	transfer(env.writer, 7).requireRefusal(t, binText(t, "holds", "Aisle 3, shelf B", "6", "6"))
	if got := cliBinStockOf(t, env, widget.Id); got[aisle] != 6 || got[counter] != 4 {
		t.Errorf("bin-stock after the refused move = %v", got)
	}
}

// `inventory-adjustments add --post` with `replaces` (the batch of
// TestInventoryAdjustmentAddWithABinAndReplaces): the first adjustment is void
// and `show` of it prints replaced_by; the bins hold only the correction.
func TestCLIBins_ACorrectionWithABinVoidsTheOriginal(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	doc := cliDocumentNamed(t, "inventory-adjustments")
	requireCLIDeclares(t, "inventory-adjustments", doc.Fields, doc.Omit, "replaces", false, "inventory-adjustments")
	requireCLIDeclares(t, "inventory-adjustments", doc.Fields, doc.Omit, "replaced_by", true, "inventory-adjustments")
	aisle := addCLIBin(t, env, "Aisle 3, shelf B")
	counter := addCLIBin(t, env, "Front counter")
	const first, second = "cliadjust000025", "cliadjust000026"

	adjustCLI(t, env, first, `"date":"2026-09-05","memo":"count"`,
		fmt.Sprintf(`"bin":%q,"product":%q,"quantity":10,"value":5000,"value_given":true`, aisle, widget.Id)).requireStatus(t, http.StatusOK)
	adjustCLI(t, env, second, `"date":"2026-09-06","memo":"recount","replaces":"`+first+`"`,
		fmt.Sprintf(`"bin":%q,"product":%q,"quantity":4,"value":600,"value_given":true`, counter, widget.Id)).requireStatus(t, http.StatusOK)

	old := env.call(t, env.writer, http.MethodGet, collectionURL(inventoryAdjustmentsCollection)+"/"+first, "").json(t)
	if old["status"] != "void" || old["replaced_by"] != second {
		t.Errorf("show of the first = status %v, replaced_by %v; want void, %s", old["status"], old["replaced_by"], second)
	}
	correction := env.call(t, env.writer, http.MethodGet, collectionURL(inventoryAdjustmentsCollection)+"/"+second, "").json(t)
	if correction["status"] != "posted" || correction["replaces"] != first {
		t.Errorf("show of the correction = status %v, replaces %v; want posted, %s", correction["status"], correction["replaces"], first)
	}
	if got := cliBinStockOf(t, env, widget.Id); got[aisle] != 0 || got[counter] != 4 {
		t.Errorf("bin-stock after the correction = %v, want 0 in Aisle 3 and 4 in Front counter", got)
	}
}

// `inventory-adjustments edit` of a posted adjustment of free stock (5 units
// with the value 0 given, spec §3.3): the correction batch of
// TestInventoryAdjustmentCorrectionKeepsAFreeStockLine, header with the stored
// writable fields and `replaces`, the stored line copied with its bin and its
// value_given, then the post. The original is void with replaced_by, and the
// correction's line keeps its bin, value_given and a posted value of 0.
func TestCLIBins_ACorrectionOfFreeStockKeepsItsValue(t *testing.T) {
	env, widget := newCLIStockEnv(t)
	doc := cliDocumentNamed(t, "inventory-adjustments")
	if i := slices.IndexFunc(doc.Fields, func(f cliField) bool { return f.Name == "replaces" }); i < 0 || !doc.Fields[i].CreateOnly || doc.Fields[i].ReadOnly {
		t.Errorf("cli/documents.json: inventory-adjustments.replaces is not createOnly: `edit` would take it")
	}
	aisle := addCLIBin(t, env, "Aisle 3, shelf B")
	const first, second = "cliadjust000027", "cliadjust000028"
	freeStock := fmt.Sprintf(`"bin":%q,"product":%q,"quantity":5,"value":0,"value_given":true`, aisle, widget.Id)
	adjustCLI(t, env, first, `"date":"2026-09-05","memo":"count"`, freeStock).requireStatus(t, http.StatusOK)
	one := collectionURL(inventoryAdjustmentsCollection) + "/"
	original := env.call(t, env.writer, http.MethodGet, one+first, "").json(t)
	if original["status"] != "posted" || original["value_change"] != float64(0) {
		t.Fatalf("the original = status %v, value_change %v; want posted, 0", original["status"], original["value_change"])
	}

	// The CLI copies the stored account (the fake's stored one is "").
	account, _ := original["account"].(string)
	env.call(t, env.writer, http.MethodPost, "/api/batch", batchBody(
		cliOp("POST", inventoryAdjustmentsCollection, "", fmt.Sprintf(`{"account":%q,"date":"2026-09-05","id":%q,"kind":"manual","memo":"recount","replaces":%q,"status":"draft"}`, account, second, first)),
		rowOp(inventoryAdjustmentLinesCollection, "adjustment", second, 0, freeStock),
		cliOp("PATCH", inventoryAdjustmentsCollection, second, `{"status":"posted"}`),
	)).requireStatus(t, http.StatusOK)

	old := env.call(t, env.writer, http.MethodGet, one+first, "").json(t)
	if old["status"] != "void" || old["replaced_by"] != second {
		t.Errorf("show of the original = status %v, replaced_by %v; want void, %s", old["status"], old["replaced_by"], second)
	}
	correction := env.call(t, env.writer, http.MethodGet, one+second, "").json(t)
	if correction["status"] != "posted" || correction["replaces"] != first || correction["value_change"] != float64(0) {
		t.Errorf("show of the correction = status %v, replaces %v, value_change %v; want posted, %s, 0", correction["status"], correction["replaces"], correction["value_change"], first)
	}
	lines := env.list(t, inventoryAdjustmentLinesCollection, fmt.Sprintf(`adjustment = %q`, second), "position,id").items(t)
	if len(lines) != 1 || lines[0]["bin"] != aisle || lines[0]["value_given"] != true || lines[0]["posted_value"] != float64(0) {
		t.Errorf("the correction's lines = %v, want one line in %s with value_given true and posted_value 0", lines, aisle)
	}
	if got := cliBinStockOf(t, env, widget.Id); len(got) != 1 || got[aisle] != 5 {
		t.Errorf("bin-stock after the correction = %v, want 5 in Aisle 3", got)
	}
}
