package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/search"
)

func setMemo(t testing.TB, env *ledgerEnv, entryID, memo string) {
	t.Helper()
	e := reload(t, env.app, "books_journal_entries", entryID)
	e.Set("memo", memo)
	if err := env.app.Save(e); err != nil {
		t.Fatal(err)
	}
}

func rowIDs(rows []search.Row) string {
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return strings.Join(ids, ",")
}

func TestSearch_FindsAccountsAndEntries(t *testing.T) {
	env := newLedgerEnv(t)
	acct := mkAccount(t, env.app, "Office Supplies", "expense", "office_general")
	draft := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, draft.Id, "Office party deposit")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"office"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 || rowIDs(res.Rows) != "account:"+acct.Id+",entry:"+draft.Id {
		t.Fatalf("rows %s total %d", rowIDs(res.Rows), res.Total)
	}
	if res.Rows[0].Subtitle != "Expense" || res.Rows[1].Title != "Draft journal entry" || res.Rows[1].Meta != "2026-05-01" {
		t.Fatalf("row shapes: %+v", res.Rows)
	}
}

func mkSearchCustomer(t testing.TB, env *ledgerEnv, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newCustomer(env.app, fields)
	if err != nil {
		t.Fatalf("save customer %v: %v", fields, err)
	}
	return r
}

func customerRows(rows []search.Row) []search.Row {
	var out []search.Row
	for _, r := range rows {
		if strings.HasPrefix(r.ID, "customer:") {
			out = append(out, r)
		}
	}
	return out
}

func TestSearch_FindsCustomers(t *testing.T) {
	env := newLedgerEnv(t)
	withCompany := mkSearchCustomer(t, env, map[string]any{
		"display_name": "Zephyr Studio", "company": "Quillworks Ltd", "email": "Mira@Kestrel.example",
		"phone": "555-0199", "notes": "Prefers orchid invoices",
	})
	emailOnly := mkSearchCustomer(t, env, map[string]any{
		"display_name": "Basalt Goods", "email": "orders@Marrowfen.example",
	})
	find := func(term string) []search.Row {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		return customerRows(res.Rows)
	}
	for _, term := range []string{"ZEPHYR", "quillWORKS", "kestrel"} {
		rows := find(term)
		if rowIDs(rows) != "customer:"+withCompany.Id {
			t.Fatalf("%q found customers %q, want customer:%s", term, rowIDs(rows), withCompany.Id)
		}
		r := rows[0]
		if r.Title != "Zephyr Studio" || r.Subtitle != "Quillworks Ltd" || r.Meta != "Customer" {
			t.Fatalf("%q row title %q subtitle %q meta %q", term, r.Title, r.Subtitle, r.Meta)
		}
		if r.Fields["kind"] != "customer" || r.Fields["inactive"] != false {
			t.Fatalf("%q row fields %v", term, r.Fields)
		}
	}
	rows := find("marrowfen")
	if rowIDs(rows) != "customer:"+emailOnly.Id {
		t.Fatalf("email term found customers %q, want customer:%s", rowIDs(rows), emailOnly.Id)
	}
	if rows[0].Title != "Basalt Goods" || rows[0].Subtitle != "orders@Marrowfen.example" || rows[0].Meta != "Customer" {
		t.Fatalf("company-less row title %q subtitle %q meta %q", rows[0].Title, rows[0].Subtitle, rows[0].Meta)
	}
	for _, term := range []string{"0199", "orchid"} {
		if rows := find(term); len(rows) != 0 {
			t.Fatalf("phone or notes term %q found customers %s", term, rowIDs(rows))
		}
	}
}

// Two of each kind match "nimbus"; the first page takes one of each kind in
// turn, so no kind starves the others.
func TestSearch_InterleavesAllThreeKinds(t *testing.T) {
	env := newLedgerEnv(t)
	acctA := mkAccount(t, env.app, "Nimbus Alpha Fund", "bank", "checking")
	acctB := mkAccount(t, env.app, "Nimbus Beta Fund", "bank", "checking")
	newer := env.sale(t, "2026-05-02", 100)
	setMemo(t, env, newer.Id, "Nimbus deposit two")
	older := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, older.Id, "Nimbus deposit one")
	custA := mkCustomer(t, env.app, "Nimbus Analytics", "")
	custB := mkCustomer(t, env.app, "Nimbus Bakery", "")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"nimbus"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join([]string{
		"account:" + acctA.Id, "entry:" + newer.Id, "customer:" + custA.Id,
		"account:" + acctB.Id, "entry:" + older.Id, "customer:" + custB.Id,
	}, ",")
	if rowIDs(res.Rows) != want || res.Total != 6 {
		t.Fatalf("rows %s total %d, want %s total 6", rowIDs(res.Rows), res.Total, want)
	}
}

func mkSearchVendor(t testing.TB, env *ledgerEnv, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newVendor(env.app, fields)
	if err != nil {
		t.Fatalf("save vendor %v: %v", fields, err)
	}
	return r
}

func vendorRows(rows []search.Row) []search.Row {
	var out []search.Row
	for _, r := range rows {
		if strings.HasPrefix(r.ID, "vendor:") {
			out = append(out, r)
		}
	}
	return out
}

func TestSearch_FindsVendors(t *testing.T) {
	env := newLedgerEnv(t)
	withCompany := mkSearchVendor(t, env, map[string]any{
		"display_name": "Tamarind Paper", "company": "Halcyon Mills Ltd", "email": "Billing@Corvid.example",
		"phone": "555-0177", "account_number": "ACCT-88412", "notes": "Ships in saffron crates",
	})
	emailOnly := mkSearchVendor(t, env, map[string]any{
		"display_name": "Granite Freight", "email": "dispatch@Wrenfold.example",
	})
	dormant := mkSearchVendor(t, env, map[string]any{"display_name": "Obsidian Courier", "inactive": true})
	find := func(term string) []search.Row {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		return vendorRows(res.Rows)
	}
	for _, term := range []string{"TAMARIND", "halcyON", "corvid"} {
		rows := find(term)
		if rowIDs(rows) != "vendor:"+withCompany.Id {
			t.Fatalf("%q found vendors %q, want vendor:%s", term, rowIDs(rows), withCompany.Id)
		}
		r := rows[0]
		if r.Title != "Tamarind Paper" || r.Subtitle != "Halcyon Mills Ltd" || r.Meta != "Vendor" {
			t.Fatalf("%q row title %q subtitle %q meta %q", term, r.Title, r.Subtitle, r.Meta)
		}
		if r.Fields["kind"] != "vendor" || r.Fields["inactive"] != false {
			t.Fatalf("%q row fields %v", term, r.Fields)
		}
	}
	rows := find("wrenfold")
	if rowIDs(rows) != "vendor:"+emailOnly.Id {
		t.Fatalf("email term found vendors %q, want vendor:%s", rowIDs(rows), emailOnly.Id)
	}
	if rows[0].Title != "Granite Freight" || rows[0].Subtitle != "dispatch@Wrenfold.example" || rows[0].Meta != "Vendor" {
		t.Fatalf("company-less row title %q subtitle %q meta %q", rows[0].Title, rows[0].Subtitle, rows[0].Meta)
	}
	for _, term := range []string{"0177", "88412", "saffron"} {
		if rows := find(term); len(rows) != 0 {
			t.Fatalf("phone, account number or notes term %q found vendors %s", term, rowIDs(rows))
		}
	}
	rows = find("obsidian")
	if rowIDs(rows) != "vendor:"+dormant.Id {
		t.Fatalf("obsidian found vendors %q, want vendor:%s", rowIDs(rows), dormant.Id)
	}
	if rows[0].Fields["kind"] != "vendor" || rows[0].Fields["inactive"] != true {
		t.Fatalf("inactive vendor row fields %v", rows[0].Fields)
	}
}

// Two of each kind match "quokka"; the first page takes one of each kind in
// turn, vendors after customers, so no kind starves the others.
func TestSearch_InterleavesAllFourKinds(t *testing.T) {
	env := newLedgerEnv(t)
	acctA := mkAccount(t, env.app, "Quokka Alpha Fund", "bank", "checking")
	acctB := mkAccount(t, env.app, "Quokka Beta Fund", "bank", "checking")
	newer := env.sale(t, "2026-05-02", 100)
	setMemo(t, env, newer.Id, "Quokka deposit two")
	older := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, older.Id, "Quokka deposit one")
	custA := mkCustomer(t, env.app, "Quokka Analytics", "")
	custB := mkCustomer(t, env.app, "Quokka Bakery", "")
	vendA := mkVendor(t, env.app, "Quokka Cartage")
	vendB := mkVendor(t, env.app, "Quokka Dairy")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"quokka"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join([]string{
		"account:" + acctA.Id, "entry:" + newer.Id, "customer:" + custA.Id, "vendor:" + vendA.Id,
		"account:" + acctB.Id, "entry:" + older.Id, "customer:" + custB.Id, "vendor:" + vendB.Id,
	}, ",")
	if rowIDs(res.Rows) != want || res.Total != 8 {
		t.Fatalf("rows %s total %d, want %s total 8", rowIDs(res.Rows), res.Total, want)
	}
}

func mkSearchProduct(t testing.TB, env *ledgerEnv, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newProduct(env.app, fields)
	if err != nil {
		t.Fatalf("save product %v: %v", fields, err)
	}
	return r
}

func productRows(rows []search.Row) []search.Row {
	var out []search.Row
	for _, r := range rows {
		if strings.HasPrefix(r.ID, "product:") {
			out = append(out, r)
		}
	}
	return out
}

func TestSearch_FindsProducts(t *testing.T) {
	env := newLedgerEnv(t)
	income := mkIncomeAccount(t, env.app)
	withSku := mkSearchProduct(t, env, map[string]any{
		"type": "service", "name": "Zircon Consulting", "sku": "ZC-4471", "income_account": income.Id,
		"sales_description": "Quarterly tamarack review", "purchase_description": "Sourced from Wexford",
	})
	noSku := mkSearchProduct(t, env, map[string]any{
		"type": "non_inventory", "name": "Basalt Tiles", "income_account": income.Id,
	})
	dormant := mkService(t, env.app, "Obsidian Retainer", income)
	makeProductInactive(t, env.app, dormant)
	find := func(term string) []search.Row {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		return productRows(res.Rows)
	}
	for _, term := range []string{"ZIRCON", "zc-4471", "TamaRACK"} {
		rows := find(term)
		if rowIDs(rows) != "product:"+withSku.Id {
			t.Fatalf("%q found products %q, want product:%s", term, rowIDs(rows), withSku.Id)
		}
		r := rows[0]
		if r.Title != "Zircon Consulting" || r.Subtitle != "ZC-4471" || r.Meta != "Product or service" {
			t.Fatalf("%q row title %q subtitle %q meta %q", term, r.Title, r.Subtitle, r.Meta)
		}
		if r.Fields["kind"] != "product" || r.Fields["inactive"] != false {
			t.Fatalf("%q row fields %v", term, r.Fields)
		}
	}
	rows := find("basalt")
	if rowIDs(rows) != "product:"+noSku.Id {
		t.Fatalf("basalt found products %q, want product:%s", rowIDs(rows), noSku.Id)
	}
	if rows[0].Title != "Basalt Tiles" || rows[0].Subtitle != "Non-inventory" || rows[0].Meta != "Product or service" {
		t.Fatalf("SKU-less row title %q subtitle %q meta %q", rows[0].Title, rows[0].Subtitle, rows[0].Meta)
	}
	if rows := find("wexford"); len(rows) != 0 {
		t.Fatalf("purchase description term found products %s", rowIDs(rows))
	}
	rows = find("obsidian")
	if rowIDs(rows) != "product:"+dormant.Id {
		t.Fatalf("obsidian found products %q, want product:%s", rowIDs(rows), dormant.Id)
	}
	if rows[0].Fields["kind"] != "product" || rows[0].Fields["inactive"] != true {
		t.Fatalf("inactive product row fields %v", rows[0].Fields)
	}
}

// Two of each kind match "pangolin"; the first page takes one of each kind in
// turn, products after vendors, so no kind starves the others.
func TestSearch_InterleavesAllFiveKinds(t *testing.T) {
	env := newLedgerEnv(t)
	acctA := mkAccount(t, env.app, "Pangolin Alpha Fund", "bank", "checking")
	acctB := mkAccount(t, env.app, "Pangolin Beta Fund", "bank", "checking")
	newer := env.sale(t, "2026-05-02", 100)
	setMemo(t, env, newer.Id, "Pangolin deposit two")
	older := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, older.Id, "Pangolin deposit one")
	custA := mkCustomer(t, env.app, "Pangolin Analytics", "")
	custB := mkCustomer(t, env.app, "Pangolin Bakery", "")
	vendA := mkVendor(t, env.app, "Pangolin Cartage")
	vendB := mkVendor(t, env.app, "Pangolin Dairy")
	income := mkIncomeAccount(t, env.app)
	prodA := mkService(t, env.app, "Pangolin Editing", income)
	prodB := mkService(t, env.app, "Pangolin Framing", income)
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"pangolin"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join([]string{
		"account:" + acctA.Id, "entry:" + newer.Id, "customer:" + custA.Id, "vendor:" + vendA.Id, "product:" + prodA.Id,
		"account:" + acctB.Id, "entry:" + older.Id, "customer:" + custB.Id, "vendor:" + vendB.Id, "product:" + prodB.Id,
	}, ",")
	if rowIDs(res.Rows) != want || res.Total != 10 {
		t.Fatalf("rows %s total %d, want %s total 10", rowIDs(res.Rows), res.Total, want)
	}
}

func TestSearch_NoAccessFindsNothing(t *testing.T) {
	env := newLedgerEnv(t)
	mkSearchCustomer(t, env, map[string]any{
		"display_name": "Checking Partners", "company": "Checking Holdings", "email": "checking@example.com",
	})
	mkSearchVendor(t, env, map[string]any{
		"display_name": "Checking Supply", "company": "Checking Wholesale", "email": "checking@vendor.example",
	})
	mkSearchProduct(t, env, map[string]any{
		"type": "service", "name": "Checking Review", "sku": "CHECKING-1",
		"sales_description": "Checking account review", "income_account": mkIncomeAccount(t, env.app).Id,
	})
	res, err := searchBooks(env.app, env.users.none.Id, search.Query{Include: []string{"checking"}, Limit: 10})
	if err != nil || len(res.Rows) != 0 || res.Total != 0 {
		t.Fatalf("none level saw %s (total %d), err %v", rowIDs(res.Rows), res.Total, err)
	}
	if rows := productRows(res.Rows); len(rows) != 0 {
		t.Fatalf("none level saw products %s", rowIDs(rows))
	}
}

func TestSearch_ExcludesAndEscapesWildcards(t *testing.T) {
	env := newLedgerEnv(t)
	club := mkAccount(t, env.app, "100% Club", "expense", "other_business_expenses")
	mkAccount(t, env.app, "1000 Widgets", "cost_of_goods_sold", "supplies_materials")
	res, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"100%"}, Limit: 10})
	if rowIDs(res.Rows) != "account:"+club.Id {
		t.Fatalf("100%% matched %s", rowIDs(res.Rows))
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"income"}, Exclude: []string{"consulting"}, Limit: 10})
	if len(res.Rows) != 0 {
		t.Fatalf("exclude kept %s", rowIDs(res.Rows))
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"income"}, Limit: 10})
	if len(res.Rows) != 1 {
		t.Fatalf("without the exclude, income matched %s", rowIDs(res.Rows))
	}
}

func TestSearch_HidesVoidReversals(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
		t.Fatal(err)
	}
	res, _ := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 10})
	if rowIDs(res.Rows) != "entry:"+sale.Id || res.Rows[0].Title != "Journal entry 1 (void)" {
		t.Fatalf("rows %s %+v", rowIDs(res.Rows), res.Rows)
	}
}

// A query that matches many accounts still shows entries on its first page:
// accounts and entries take turns, so neither kind starves the other.
func TestSearch_AccountsDoNotCrowdOutEntries(t *testing.T) {
	env := newLedgerEnv(t)
	var accounts []string
	for _, n := range []string{"101", "102", "103"} {
		a := saveRecord(t, env.app, "books_accounts", map[string]any{
			"name": "Account " + n, "number": n, "type": "expense", "detail_type": "office_general", "currency": "USD",
		})
		accounts = append(accounts, "account:"+a.Id)
	}
	draft := env.sale(t, "2026-05-01", 100)
	setMemo(t, env, draft.Id, "Invoice 1")
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if want := accounts[0] + ",entry:" + draft.Id; rowIDs(res.Rows) != want || res.Total != 4 {
		t.Fatalf("rows %s total %d, want %s total 4", rowIDs(res.Rows), res.Total, want)
	}
	res, _ = searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"1"}, Limit: 10, Offset: 2})
	if want := accounts[1] + "," + accounts[2]; rowIDs(res.Rows) != want {
		t.Fatalf("second page %s, want %s", rowIDs(res.Rows), want)
	}
}

func TestSearch_LimitOffsetAndTheDefaultLimit(t *testing.T) {
	env := newLedgerEnv(t)
	var ids []string
	for i := range defaultSearchLimit + 5 {
		a := mkAccount(t, env.app, fmt.Sprintf("Fund %02d", i), "bank", "checking")
		ids = append(ids, "account:"+a.Id)
	}
	// Customers in the data that the term does not match leave the pages
	// unchanged; "fund" is only in a notes field, which search does not read.
	mkSearchCustomer(t, env, map[string]any{"display_name": "Harbor Goods", "notes": "Fund raiser every May"})
	mkSearchCustomer(t, env, map[string]any{"display_name": "Lantern Co", "company": "Lantern Holdings"})
	query := func(limit, offset int) search.Result {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"fund"}, Limit: limit, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	if res := query(0, 0); rowIDs(res.Rows) != strings.Join(ids[:defaultSearchLimit], ",") || res.Total != len(ids) {
		t.Fatalf("default limit: %d rows, total %d", len(res.Rows), res.Total)
	}
	if res := query(5, 3); rowIDs(res.Rows) != strings.Join(ids[3:8], ",") {
		t.Fatalf("limit 5 offset 3: %s", rowIDs(res.Rows))
	}
	if res := query(5, len(ids)); len(res.Rows) != 0 {
		t.Fatalf("offset past the end: %s", rowIDs(res.Rows))
	}
	// The aggregator clamps a negative offset; a source called directly
	// must not panic on one either.
	if res := query(5, -3); rowIDs(res.Rows) != strings.Join(ids[:5], ",") {
		t.Fatalf("negative offset: %s", rowIDs(res.Rows))
	}
}

// Two sub-customers share the name "Phase 1" under different parents; the
// hit title names the parent, as customerLabel does, so they are told apart.
func TestSearch_SubCustomerTitleNamesItsParent(t *testing.T) {
	env := newLedgerEnv(t)
	alder := mkSearchCustomer(t, env, map[string]any{"display_name": "Alder Farms"})
	birch := mkSearchCustomer(t, env, map[string]any{"display_name": "Birch Mills"})
	alderPhase := mkSearchCustomer(t, env, map[string]any{
		"display_name": "Phase 1", "parent": alder.Id, "email": "p1@north.example",
	})
	birchPhase := mkSearchCustomer(t, env, map[string]any{
		"display_name": "Phase 1", "parent": birch.Id, "email": "p1@south.example",
	})
	find := func(term string) map[string]search.Row {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{term}, Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		byID := map[string]search.Row{}
		for _, r := range customerRows(res.Rows) {
			byID[r.ID] = r
		}
		return byID
	}
	rows := find("phase")
	if len(rows) != 2 {
		t.Fatalf("phase found %d customer rows, want 2: %v", len(rows), rows)
	}
	if got := rows["customer:"+alderPhase.Id].Title; got != "Alder Farms : Phase 1" {
		t.Fatalf("Alder sub-customer title %q, want %q", got, "Alder Farms : Phase 1")
	}
	if got := rows["customer:"+birchPhase.Id].Title; got != "Birch Mills : Phase 1" {
		t.Fatalf("Birch sub-customer title %q, want %q", got, "Birch Mills : Phase 1")
	}
	if got := find("alder")["customer:"+alder.Id].Title; got != "Alder Farms" {
		t.Fatalf("top-level customer title %q, want %q", got, "Alder Farms")
	}
	// The parent join only labels the hit: a sub-customer whose own fields do
	// not match must not be found, or counted, through its parent's name.
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"alder"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if want := "customer:" + alder.Id; rowIDs(res.Rows) != want || res.Total != 1 {
		t.Fatalf("alder found rows %s total %d, want %s total 1", rowIDs(res.Rows), res.Total, want)
	}
}

// Page 1 and page 2 together are the whole interleaved list: no row repeats
// and none goes missing, even though the account list is longer than a page.
func TestSearch_PagesAcrossAllThreeKinds(t *testing.T) {
	env := newLedgerEnv(t)
	var accounts, entries, customers []string
	for i := range 7 {
		a := mkAccount(t, env.app, fmt.Sprintf("Wombat Fund %d", i), "bank", "checking")
		accounts = append(accounts, "account:"+a.Id)
	}
	for _, date := range []string{"2026-05-03", "2026-05-02"} {
		e := env.sale(t, date, 100)
		setMemo(t, env, e.Id, "Wombat deposit "+date)
		entries = append(entries, "entry:"+e.Id)
	}
	for _, name := range []string{"Wombat Analytics", "Wombat Bakery", "Wombat Cartage"} {
		c := mkCustomer(t, env.app, name, "")
		customers = append(customers, "customer:"+c.Id)
	}
	want := []string{
		accounts[0], entries[0], customers[0],
		accounts[1], entries[1], customers[1],
		accounts[2], customers[2],
		accounts[3], accounts[4], accounts[5], accounts[6],
	}
	const limit = 6
	query := func(offset int) search.Result {
		t.Helper()
		res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"wombat"}, Limit: limit, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	first, second := query(0), query(limit)
	if got := rowIDs(first.Rows); got != strings.Join(want[:limit], ",") {
		t.Fatalf("page 1 %s, want %s", got, strings.Join(want[:limit], ","))
	}
	if got := rowIDs(second.Rows); got != strings.Join(want[limit:], ",") {
		t.Fatalf("page 2 %s, want %s", got, strings.Join(want[limit:], ","))
	}
	if first.Total != len(want) || second.Total != len(want) {
		t.Fatalf("totals %d and %d, want %d", first.Total, second.Total, len(want))
	}
}

func TestSearch_FindsInactiveCustomers(t *testing.T) {
	env := newLedgerEnv(t)
	dormant := mkSearchCustomer(t, env, map[string]any{"display_name": "Juniper Hollow", "inactive": true})
	res, err := searchBooks(env.app, env.users.readOnly.Id, search.Query{Include: []string{"juniper"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	rows := customerRows(res.Rows)
	if rowIDs(rows) != "customer:"+dormant.Id {
		t.Fatalf("juniper found customers %q, want customer:%s", rowIDs(rows), dormant.Id)
	}
	if rows[0].Fields["kind"] != "customer" || rows[0].Fields["inactive"] != true {
		t.Fatalf("inactive customer row fields %v", rows[0].Fields)
	}
}
