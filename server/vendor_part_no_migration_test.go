package books

import (
	"testing"

	"github.com/pocketbase/dbx"

	"tinycld.org/core/rlstest"
)

const vendorPartNoMigration = "2100000047_rename_books_products_sku.js"

// A product's SKU becomes its vendor part number, with its value, and the search index
// finds it under the new column.
func TestVendorPartNo_RenameKeepsTheValueAndSearch(t *testing.T) {
	app, after := appBeforeMigration(t, vendorPartNoMigration)
	saveRecord(t, app, "books_products", map[string]any{
		"id": "prod00000000001", "name": "Access point", "name_key": "access point",
		"code": "AP", "sku": "HW-WAP-6E", "type": "service", "currency": "USD",
	})

	rlstest.Apply(t, app, after)

	product := reload(t, app, "books_products", "prod00000000001")
	if got := product.GetString("vendor_part_no"); got != "HW-WAP-6E" {
		t.Fatalf("vendor_part_no = %q, want HW-WAP-6E", got)
	}
	col, err := app.FindCollectionByNameOrId("books_products")
	if err != nil {
		t.Fatal(err)
	}
	if col.Fields.GetByName("sku") != nil {
		t.Fatal("the sku field must be gone")
	}
	var hits []string
	if err := app.DB().NewQuery("SELECT record_id FROM fts_books_products WHERE fts_books_products MATCH {:q}").
		Bind(dbx.Params{"q": `vendor_part_no:"HW"`}).Column(&hits); err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 {
		t.Fatalf("fts vendor_part_no hits = %v, want 1", hits)
	}
}
