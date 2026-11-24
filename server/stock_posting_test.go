package books

import (
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A correction names the document it replaces: that document's moves go, the
// correction's take their place, in one replay.
func TestPostDocumentStock_ReplacesTheOriginalsMoves(t *testing.T) {
	se := newStockEnv(t)
	original, correction := "bill00000000001", "bill00000000002"
	post := func(document, replaces string, units, value int64) []*core.Record {
		t.Helper()
		var own []*core.Record
		err := se.app.RunInTransaction(func(tx core.App) error {
			var err error
			own, err = postDocumentStock(tx, se.users.bookkeeper.Id, "books_bills", document, replaces,
				[]stockMoveInput{se.receipt(document, "2026-07-01", units, value)})
			return err
		})
		if err != nil {
			t.Fatalf("post the stock of %s: %v", document, err)
		}
		return own
	}
	post(original, "", 10, 1000)
	own := post(correction, original, 4, 600)

	if len(own) != 1 || own[0].GetInt("value") != 600 || own[0].GetInt("posted_value") != 600 {
		t.Fatalf("the correction's moves = %v, want one move of 600 the ledger holds", own)
	}
	if n, _ := se.app.CountRecords(stockMovesCollection, dbx.HashExp{"document": original}); n != 0 {
		t.Errorf("%d moves of the replaced document, want none", n)
	}
	requireOnHand(t, se.app, se.widget, 4, 600)
	if got, want := stockCostLines(own), []postingLine{{Account: se.asset.Id, Debit: 600}, {Account: se.cogs.Id, Credit: 600}}; !reflect.DeepEqual(got, want) {
		t.Errorf("cost lines = %+v, want %+v", got, want)
	}
}

func TestEnsureInventoryAccounts_CreateEachOnce(t *testing.T) {
	env := newLedgerEnv(t)
	cases := []struct {
		ensure                        func(tx core.App) (*core.Record, error)
		name, typ, detailType, number string
	}{
		{ensureInventoryAsset, "Inventory asset", "other_current_asset", "inventory", "1300"},
		{ensureCostOfGoodsSold, "Cost of goods sold", "cost_of_goods_sold", "supplies_materials", "5000"},
		{ensureInventoryShrinkage, "Inventory shrinkage", "cost_of_goods_sold", "inventory_shrinkage", "5100"},
		{ensureOpeningBalanceEquity, "Opening balance equity", "equity", "opening_balance_equity", "3000"},
	}
	for _, tc := range cases {
		first, err := tc.ensure(env.app)
		if err != nil {
			t.Fatalf("ensure %s: %v", tc.name, err)
		}
		got := [4]string{first.GetString("name"), first.GetString("type"), first.GetString("detail_type"), first.GetString("number")}
		if got != [4]string{tc.name, tc.typ, tc.detailType, tc.number} {
			t.Errorf("account = %v, want %s", got, tc.name)
		}
		again, err := tc.ensure(env.app)
		if err != nil || again.Id != first.Id {
			t.Errorf("the second ensure of %s made another account (err %v)", tc.name, err)
		}
	}
}
