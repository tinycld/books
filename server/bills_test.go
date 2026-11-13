package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The bill's guards (spec §3.6, §4): the bill is the fourth kind of the sales
// document layer, with the vendor as its party, two line tables (account lines
// with a typed amount, product lines Books prices) and no tax.

// The refusal texts of the bill guards, as the client gets them (PocketBase
// adds a final period to a text that has none). Written out here, not read
// from the consts, so a change of wording fails this file too.
const (
	wantBillDueBeforeDate   = "Due date can't be before the bill date."
	wantBillTotalNegative   = "A bill total cannot be below zero. Use a vendor credit."
	wantBillTotalTooLarge   = "The bill total is more than Books can store."
	wantBillTooManyLines    = "A bill holds at most 250 lines."
	wantBillNotExpense      = "Account line %d: %s is not an expense account. Choose an expense or cost of goods account."
	wantBillAmountNotZero   = "Account line %d: Enter an amount other than 0."
	wantBillProductInactive = "Product line %d: %s is inactive. Choose an active product or service."
	wantBillLineUnknownKind = "Line %d: a bill line is an account line or a product line."
	wantBillLineStays       = "A line stays on its bill."
	wantBillLineNotDraft    = "Only the lines of a draft bill can change."
	wantBillDeleteNotDraft  = "Only a draft bill can be deleted."
	wantLineAmountByBooks   = "Books computes a line's amount."

	wantBillAccountLineCells   = "Account line 1: An account line has no product, quantity or rate."
	wantBillProductLineAccount = "Product line 1: A product line has no account."
)

func wantVendorInactive(name string) string {
	return name + " is inactive. Choose an active vendor."
}

func wantDuplicateRef(vendor, ref, other string) string {
	return fmt.Sprintf("%s already has bill no. %s (%s).", vendor, ref, other)
}

const (
	billDay    = "2026-11-04"
	billDueDay = "2026-12-04"
)

// billEnv is a ledger env with the bill guards and the generated books:bill
// forms host bound, and the part of the e2e book a bill names (seed.ts,
// lib/seed-accounts.ts, lib/vendor-form-fixture.ts,
// lib/products-services-fixture.ts): 1500 Office Equipment (a fixed asset),
// 6200 Software Subscriptions and 6210 Design Tools (expenses), 6900 Old Petty
// Cash (an inactive other expense); the vendors Summit IT Services, Office
// Supply World and Pacific Power; the purchased products Wireless access point
// and Cat6 patch cable, 10 ft, and Old retainer, a purchased product made
// inactive.
type billEnv struct {
	*ledgerEnv
	equipment, software, designTools, pettyCash *core.Record
	summit, officeSupply, pacificPower          *core.Record
	accessPoint, patchCable, retired            *core.Record
}

func newBillEnv(t *testing.T) *billEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	bindHostsByKey(t, env.app, billKind.HostKey)
	return billEnvOn(t, env)
}

func billEnvOn(t *testing.T, env *ledgerEnv) *billEnv {
	t.Helper()
	app := env.app
	be := &billEnv{
		ledgerEnv:    env,
		equipment:    mkNumberedAccount(t, app, "Office Equipment", "1500", "fixed_asset", "machinery_equipment"),
		software:     mkNumberedAccount(t, app, "Software Subscriptions", "6200", "expense", "dues_subscriptions"),
		designTools:  mkNumberedAccount(t, app, "Design Tools", "6210", "expense", "dues_subscriptions"),
		pettyCash:    mkNumberedAccount(t, app, "Old Petty Cash", "6900", "other_expense", "other_misc_expense"),
		summit:       mkVendor(t, app, "Summit IT Services"),
		officeSupply: mkVendor(t, app, "Office Supply World"),
		pacificPower: mkVendor(t, app, "Pacific Power"),
	}
	purchased := func(name string, cost int, expense *core.Record) *core.Record {
		t.Helper()
		r, err := newProduct(app, map[string]any{
			"type": "non_inventory", "name": name, "income_account": env.revenue.Id,
			"purchases": true, "expense_account": expense.Id, "cost": cost,
		})
		if err != nil {
			t.Fatalf("save product %q: %v", name, err)
		}
		return r
	}
	be.accessPoint = purchased("Wireless access point", 12140, be.software)
	be.patchCable = purchased("Cat6 patch cable, 10 ft", 310, be.designTools)
	be.retired = purchased("Old retainer", 5000, be.software)
	makeProductInactive(t, app, be.retired)
	makeAccountInactive(t, app, be.pettyCash)
	makeVendorInactive(t, app, be.pacificPower)
	return be
}

// newBill saves a draft bill through the app, so every guard runs, with the
// fields given over a valid default, and returns what the guards said.
func newBill(app core.App, vendor *core.Record, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"vendor": vendor.Id, "status": "draft", "date": billDay, "due_date": billDueDay}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_bills", all)
}

func mkBill(t testing.TB, app core.App, vendor *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newBill(app, vendor, fields)
	if err != nil {
		t.Fatalf("save a draft bill for %s: %v", vendor.GetString("display_name"), err)
	}
	return r
}

// newBillLine saves one line of bill at position through the app, so every
// guard and the restatement run, and returns what they said.
func newBillLine(app core.App, bill *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"bill": bill.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_bill_lines", all)
}

func mkBillLine(t testing.TB, app core.App, bill *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newBillLine(app, bill, position, fields)
	if err != nil {
		t.Fatalf("save bill line %d: %v", position+1, err)
	}
	return r
}

func accountLine(account *core.Record, amount int64) map[string]any {
	return map[string]any{"kind": "account", "account": account.Id, "amount": amount}
}

func productLine(product *core.Record, qty float64, rate int64) map[string]any {
	return map[string]any{"kind": "item", "product": product.Id, "quantity": qty, "rate": rate}
}

// requireBillTotal checks the stored subtotal and total: a bill has no tax,
// so they are one figure.
func requireBillTotal(t testing.TB, app core.App, id string, total int) {
	t.Helper()
	r := reload(t, app, "books_bills", id)
	if got := [2]int{r.GetInt("subtotal"), r.GetInt("total")}; got != [2]int{total, total} {
		t.Errorf("subtotal/total = %v, want %v", got, [2]int{total, total})
	}
}

func requireBillLineCount(t testing.TB, app core.App, bill *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_bill_lines", dbx.HashExp{"bill": bill.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the bill, want %d", n, want)
	}
}

func requireBillCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_bills"); err != nil || n != want {
		t.Errorf("%d bills stored (err %v), want %d", n, err, want)
	}
}

// setBillStatus writes status straight to the table, past every hook, so the
// line and delete guards can be held to a posted bill without posting it.
func setBillStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_bills SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set bill %s %s: %v", id, status, err)
	}
}

// postBillAs posts a draft bill as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postBillAs(app core.App, billID, actor string) error {
	r, err := app.FindRecordById("books_bills", billID)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostBill(t testing.TB, app core.App, billID, actor string) *core.Record {
	t.Helper()
	if err := postBillAs(app, billID, actor); err != nil {
		t.Fatalf("post bill %s: %v", billID, err)
	}
	return reload(t, app, "books_bills", billID)
}

// voidBillAs voids a posted bill as actor.
func voidBillAs(app core.App, billID, actor string) error {
	r, err := app.FindRecordById("books_bills", billID)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

func TestBill_DraftSaves(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.summit, map[string]any{"memo": "October managed services"})
	mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))

	got := reload(t, be.app, "books_bills", bill.Id)
	if got.GetString("status") != statusDraft || got.GetString("vendor") != be.summit.Id ||
		got.GetString("number") != "" || got.GetString("currency") != "USD" {
		t.Errorf("bill status %q vendor %q number %q currency %q, want a USD draft of Summit IT Services with no number",
			got.GetString("status"), got.GetString("vendor"), got.GetString("number"), got.GetString("currency"))
	}
	requireBillTotal(t, be.app, bill.Id, 12500)
}

func TestBill_RefusesAnInactiveVendorWhenItChanges(t *testing.T) {
	be := newBillEnv(t)

	_, err := newBill(be.app, be.pacificPower, nil)
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Pacific Power"))
	requireBillCount(t, be.app, 0)

	// A stored draft keeps a vendor that became inactive after it was chosen.
	bill := mkBill(t, be.app, be.summit, nil)
	makeVendorInactive(t, be.app, be.summit)
	if err := setFields(t, be.app, "books_bills", bill.Id, map[string]any{"memo": "Second visit"}); err != nil {
		t.Fatalf("a memo edit of a draft whose vendor became inactive was refused: %v", err)
	}

	// Choosing an inactive vendor again is a change, so it is refused.
	err = setFields(t, be.app, "books_bills", bill.Id, map[string]any{"vendor": be.pacificPower.Id})
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Pacific Power"))
	if got := reload(t, be.app, "books_bills", bill.Id).GetString("vendor"); got != be.summit.Id {
		t.Errorf("vendor = %s after the refusal, want Summit IT Services", got)
	}
}

func TestBill_SchemaRefusesALongRefNo(t *testing.T) {
	be := newBillEnv(t)
	_, err := newBill(be.app, be.summit, map[string]any{"ref_no": strings.Repeat("7", 41)})
	requireSchemaRefusal(t, err, "ref_no")
	requireBillCount(t, be.app, 0)

	bill := mkBill(t, be.app, be.summit, map[string]any{"ref_no": strings.Repeat("7", 40)})
	if got := len(reload(t, be.app, "books_bills", bill.Id).GetString("ref_no")); got != 40 {
		t.Errorf("ref_no has %d characters, want 40", got)
	}
}

func TestBill_RefusesDueBeforeDate(t *testing.T) {
	be := newBillEnv(t)
	_, err := newBill(be.app, be.summit, map[string]any{"date": billDay, "due_date": "2026-11-03"})
	requireFieldRefusal(t, err, "due_date", wantBillDueBeforeDate)
	requireBillCount(t, be.app, 0)

	bill := mkBill(t, be.app, be.summit, map[string]any{"date": billDay, "due_date": billDay})
	err = setFields(t, be.app, "books_bills", bill.Id, map[string]any{"date": "2026-11-05"})
	requireFieldRefusal(t, err, "due_date", wantBillDueBeforeDate)
	if got := reload(t, be.app, "books_bills", bill.Id).GetString("date"); got != billDay {
		t.Errorf("date = %s after the refusal, want %s", got, billDay)
	}
}

// Every save refuses an account line whose account is not an expense, other
// expense or cost of goods sold account; an inactive one of those types is
// kept on a draft (Post refuses it).
func TestBillLine_AccountMustBeAnExpense(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.summit, nil)

	_, err := newBillLine(be.app, bill, 0, accountLine(be.equipment, 12500))
	requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 1, "Office Equipment"))
	requireBillLineCount(t, be.app, bill, 0)

	line := mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
	err = setFields(t, be.app, "books_bill_lines", line.Id, map[string]any{"account": be.equipment.Id})
	requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 1, "Office Equipment"))
	if got := reload(t, be.app, "books_bill_lines", line.Id).GetString("account"); got != be.software.Id {
		t.Errorf("account = %s after the refusal, want 6200 Software Subscriptions", got)
	}

	draft := mkBill(t, be.app, be.summit, nil)
	mkBillLine(t, be.app, draft, 0, accountLine(be.pettyCash, 41286))
	requireBillTotal(t, be.app, draft.Id, 41286)
}

func TestBillLine_AccountAmountIsNotZero(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.summit, nil)

	_, err := newBillLine(be.app, bill, 0, accountLine(be.software, 0))
	requireRefusalText(t, err, fmt.Sprintf(wantBillAmountNotZero, 1))
	_, err = newBillLine(be.app, bill, 0, map[string]any{"kind": "account", "account": be.software.Id})
	requireRefusalText(t, err, fmt.Sprintf(wantBillAmountNotZero, 1))
	requireBillLineCount(t, be.app, bill, 0)
}

// An account line keeps the amount the person typed, a negative one too, and
// the bill's total is the sum of the lines.
func TestBillLine_AccountLineKeepsItsTypedAmount(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 18745))
	credit := mkBillLine(t, be.app, bill, 1, accountLine(be.designTools, -3890))

	if got := reload(t, be.app, "books_bill_lines", credit.Id).GetInt("amount"); got != -3890 {
		t.Errorf("line 2 amount = %d, want -3890", got)
	}
	requireBillTotal(t, be.app, bill.Id, 14855)

	if err := setFields(t, be.app, "books_bill_lines", credit.Id, map[string]any{"amount": -4000}); err != nil {
		t.Fatalf("an edit of an account line's amount was refused: %v", err)
	}
	requireBillTotal(t, be.app, bill.Id, 14745)
}

// A refusal names a line by its table and its place among that table's lines,
// not by its place among all the bill's lines.
func TestBillLine_RefusalsNumberLinesPerTable(t *testing.T) {
	be := newBillEnv(t)

	t.Run("the second account line", func(t *testing.T) {
		bill := mkBill(t, be.app, be.officeSupply, nil)
		mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
		mkBillLine(t, be.app, bill, 1, productLine(be.accessPoint, 3, 12140))
		_, err := newBillLine(be.app, bill, 2, accountLine(be.equipment, 5000))
		requireRefusalText(t, err, fmt.Sprintf(wantBillNotExpense, 2, "Office Equipment"))
		requireBillLineCount(t, be.app, bill, 2)
	})

	t.Run("the first product line", func(t *testing.T) {
		bill := mkBill(t, be.app, be.officeSupply, nil)
		mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
		mkBillLine(t, be.app, bill, 1, accountLine(be.designTools, 5000))
		_, err := newBillLine(be.app, bill, 2, productLine(be.retired, 1, 5000))
		requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Old retainer"))
		requireBillLineCount(t, be.app, bill, 2)
	})
}

// lineWith is a line's fields with extra cells added over them.
func lineWith(base, extra map[string]any) map[string]any {
	all := map[string]any{}
	for k, v := range base {
		all[k] = v
	}
	for k, v := range extra {
		all[k] = v
	}
	return all
}

// A line keeps only the cells of its own row kind: an account line has no
// product, quantity or rate, and a product line has no account. Core checks
// only the required cells, so the bill guard refuses the others, on a create
// and on an update.
func TestBillLine_KeepsOnlyTheCellsOfItsKind(t *testing.T) {
	be := newBillEnv(t)

	t.Run("an account line with a product, a quantity or a rate", func(t *testing.T) {
		bill := mkBill(t, be.app, be.officeSupply, nil)
		others := map[string]map[string]any{
			"product":  {"product": be.accessPoint.Id},
			"quantity": {"quantity": 2},
			"rate":     {"rate": 500},
		}
		for name, extra := range others {
			_, err := newBillLine(be.app, bill, 0, lineWith(accountLine(be.software, 12500), extra))
			if err == nil {
				t.Errorf("an account line with a %s was saved", name)
				continue
			}
			requireRefusalText(t, err, wantBillAccountLineCells)
		}
		requireBillLineCount(t, be.app, bill, 0)

		line := mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
		for name, extra := range others {
			err := setFields(t, be.app, "books_bill_lines", line.Id, extra)
			if err == nil {
				t.Errorf("an update that gave an account line a %s was saved", name)
				continue
			}
			requireRefusalText(t, err, wantBillAccountLineCells)
		}
		got := reload(t, be.app, "books_bill_lines", line.Id)
		if got.GetString("product") != "" || got.GetFloat("quantity") != 0 || got.GetInt("rate") != 0 {
			t.Errorf("account line product %q quantity %v rate %d after the refusals, want none",
				got.GetString("product"), got.GetFloat("quantity"), got.GetInt("rate"))
		}
	})

	t.Run("a product line with an account", func(t *testing.T) {
		bill := mkBill(t, be.app, be.officeSupply, nil)
		_, err := newBillLine(be.app, bill, 0, lineWith(productLine(be.accessPoint, 3, 12140), map[string]any{"account": be.software.Id}))
		requireRefusalText(t, err, wantBillProductLineAccount)
		_, err = newBillLine(be.app, bill, 0, lineWith(productLine(be.accessPoint, 3, 12140), map[string]any{"account": be.equipment.Id}))
		requireRefusalText(t, err, wantBillProductLineAccount)
		requireBillLineCount(t, be.app, bill, 0)

		line := mkBillLine(t, be.app, bill, 0, productLine(be.accessPoint, 3, 12140))
		err = setFields(t, be.app, "books_bill_lines", line.Id, map[string]any{"account": be.equipment.Id})
		requireRefusalText(t, err, wantBillProductLineAccount)
		if got := reload(t, be.app, "books_bill_lines", line.Id).GetString("account"); got != "" {
			t.Errorf("product line account = %q after the refusal, want none", got)
		}
	})
}

// Rate is money of zero or more; a discount is a negative account line.
func TestBillLine_SchemaRefusesANegativeRate(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	// An account line first, so the bill total stays above zero and the
	// total guard (which runs before the schema) passes the line on.
	mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
	_, err := newBillLine(be.app, bill, 1, productLine(be.accessPoint, 1, -1))
	requireSchemaRefusal(t, err, "rate")
	requireBillLineCount(t, be.app, bill, 1)
	requireBillTotal(t, be.app, bill.Id, 12500)
}

// The audit names a bill's line as the form and the refusals do: by its table
// and its place among that table's lines.
func TestBillLine_AuditLabelNumbersLinesPerTable(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.software, 12500))
	product := mkBillLine(t, be.app, bill, 1, productLine(be.accessPoint, 3, 12140))
	second := mkBillLine(t, be.app, bill, 2, accountLine(be.designTools, 5000))

	if got := billLineLabel(be.app, second); got != "Draft bill: Account line 2" {
		t.Errorf("second account line label = %q, want %q", got, "Draft bill: Account line 2")
	}
	if got := billLineLabel(be.app, product); got != "Draft bill: Product line 1" {
		t.Errorf("first product line label = %q, want %q", got, "Draft bill: Product line 1")
	}

	posted := mustPostBill(t, be.app, bill.Id, be.users.bookkeeper.Id)
	want := "Bill " + posted.GetString("number") + ": Account line 2"
	if got := billLineLabel(be.app, reload(t, be.app, "books_bill_lines", second.Id)); got != want {
		t.Errorf("posted bill's second account line label = %q, want %q", got, want)
	}
}

func TestBillLine_ProductAmountIsBooks(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)

	// A create may not carry an amount either: Books computes it.
	_, err := newBillLine(be.app, bill, 0, lineWith(productLine(be.accessPoint, 3, 12140), map[string]any{"amount": 500}))
	requireRefusalText(t, err, wantLineAmountByBooks)
	requireBillLineCount(t, be.app, bill, 0)

	line := mkBillLine(t, be.app, bill, 0, productLine(be.accessPoint, 3, 12140))
	if got := reload(t, be.app, "books_bill_lines", line.Id).GetInt("amount"); got != 36420 {
		t.Errorf("product line amount = %d, want 3 x 12140 = 36420", got)
	}

	err = setFields(t, be.app, "books_bill_lines", line.Id, map[string]any{"amount": 99999})
	requireRefusalText(t, err, wantLineAmountByBooks)
	if got := reload(t, be.app, "books_bill_lines", line.Id).GetInt("amount"); got != 36420 {
		t.Errorf("amount = %d after the refusal, want 36420", got)
	}
	requireBillTotal(t, be.app, bill.Id, 36420)
}

func TestBill_RefusesNegativeTotal(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 1000))

	_, err := newBillLine(be.app, bill, 1, accountLine(be.designTools, -1001))
	requireRefusalText(t, err, wantBillTotalNegative)
	requireBillLineCount(t, be.app, bill, 1)
	requireBillTotal(t, be.app, bill.Id, 1000)
}

func TestBill_RefusesTooLargeTotal(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	for i := 0; i < 9; i++ {
		mkBillLine(t, be.app, bill, i, accountLine(be.software, maxAmount))
	}
	requireBillTotal(t, be.app, bill.Id, 9_000_000_000_000_000)

	_, err := newBillLine(be.app, bill, 9, accountLine(be.software, maxAmount))
	requireRefusalText(t, err, wantBillTotalTooLarge)
	requireBillLineCount(t, be.app, bill, 9)
}

// The bound counts the lines of both tables together.
func TestBillLine_RefusesTheLine251st(t *testing.T) {
	env := newLedgerEnv(t)
	be := billEnvOn(t, env)
	// 249 lines written before the bill guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	bill := saveRecord(t, env.app, "books_bills", map[string]any{
		"vendor": be.officeSupply.Id, "status": "draft", "date": billDay, "due_date": billDueDay, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		fields := map[string]any{"bill": bill.Id, "position": i, "kind": "account", "account": be.software.Id, "amount": 100}
		if i%2 == 1 {
			fields = map[string]any{"bill": bill.Id, "position": i, "kind": "item", "product": be.accessPoint.Id, "quantity": 1, "rate": 100}
		}
		saveRecord(t, env.app, "books_bill_lines", fields)
	}
	registerSalesDocGuards(env.app, billKind)
	bindHostsByKey(t, env.app, billKind.HostKey)

	mkBillLine(t, env.app, bill, 249, accountLine(be.software, 100))
	_, err := newBillLine(env.app, bill, 250, productLine(be.accessPoint, 1, 100))
	requireRefusalText(t, err, wantBillTooManyLines)
	requireBillLineCount(t, env.app, bill, 250)
}

func TestBillLine_RefusesAKindThatIsNotABillLine(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	_, err := newBillLine(be.app, bill, 0, map[string]any{"kind": "percent", "product": be.accessPoint.Id, "percent_ppm": -100000})
	requireRefusalText(t, err, fmt.Sprintf(wantBillLineUnknownKind, 1))
	requireBillLineCount(t, be.app, bill, 0)
}

// Two bills of one vendor cannot carry the same vendor's bill no. while the
// first is not void; the number is compared after trimming. Another vendor's
// bill and an empty number never clash.
func TestBill_RefusesADuplicateRefNo(t *testing.T) {
	be := newBillEnv(t)
	first := mkBill(t, be.app, be.officeSupply, map[string]any{"ref_no": "88412"})
	mkBillLine(t, be.app, first, 0, accountLine(be.designTools, 18745))

	if err := setFields(t, be.app, "books_bills", first.Id, map[string]any{"memo": "Q4 supplies"}); err != nil {
		t.Fatalf("an edit of the bill that holds the number was refused: %v", err)
	}

	_, err := newBill(be.app, be.officeSupply, map[string]any{"ref_no": " 88412 "})
	requireFieldRefusal(t, err, "ref_no", wantDuplicateRef("Office Supply World", "88412", "a draft bill"))
	requireBillCount(t, be.app, 1)

	other := mkBill(t, be.app, be.summit, map[string]any{"ref_no": "88412"})
	if got := reload(t, be.app, "books_bills", other.Id).GetString("ref_no"); got != "88412" {
		t.Errorf("another vendor's bill ref_no = %q, want 88412", got)
	}

	second := mkBill(t, be.app, be.officeSupply, map[string]any{"ref_no": "88413"})
	err = setFields(t, be.app, "books_bills", second.Id, map[string]any{"ref_no": "88412"})
	requireFieldRefusal(t, err, "ref_no", wantDuplicateRef("Office Supply World", "88412", "a draft bill"))

	posted := mustPostBill(t, be.app, first.Id, be.users.bookkeeper.Id)
	_, err = newBill(be.app, be.officeSupply, map[string]any{"ref_no": "88412"})
	requireFieldRefusal(t, err, "ref_no",
		wantDuplicateRef("Office Supply World", "88412", "Bill "+posted.GetString("number")))

	if err := voidBillAs(be.app, first.Id, be.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the first bill: %v", err)
	}
	mkBill(t, be.app, be.officeSupply, map[string]any{"ref_no": "88412"})

	mkBill(t, be.app, be.officeSupply, map[string]any{"ref_no": ""})
	mkBill(t, be.app, be.officeSupply, map[string]any{"ref_no": ""})
}

func TestBillLine_StaysOnItsBill(t *testing.T) {
	be := newBillEnv(t)
	first := mkBill(t, be.app, be.officeSupply, nil)
	second := mkBill(t, be.app, be.officeSupply, nil)
	line := mkBillLine(t, be.app, first, 0, accountLine(be.designTools, 18745))
	if got := reload(t, be.app, "books_bill_lines", line.Id).GetString("bill"); got != first.Id {
		t.Fatalf("line bill = %q, want the first bill", got)
	}

	err := setFields(t, be.app, "books_bill_lines", line.Id, map[string]any{"bill": second.Id})
	requireRefusalText(t, err, wantBillLineStays)
	if got := reload(t, be.app, "books_bill_lines", line.Id).GetString("bill"); got != first.Id {
		t.Errorf("line bill = %q after the refusal, want the first bill", got)
	}
	requireBillLineCount(t, be.app, second, 0)
}

func TestBillLine_RefusedOnPostedBill(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	line := mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 18745))
	setBillStatus(t, be.app, bill.Id, statusPosted)

	err := setFields(t, be.app, "books_bill_lines", line.Id, map[string]any{"amount": 20000})
	requireRefusalText(t, err, wantBillLineNotDraft)
	_, err = newBillLine(be.app, bill, 1, accountLine(be.designTools, 100))
	requireRefusalText(t, err, wantBillLineNotDraft)
	err = be.app.Delete(reload(t, be.app, "books_bill_lines", line.Id))
	requireRefusalText(t, err, wantBillLineNotDraft)
	requireBillLineCount(t, be.app, bill, 1)
	requireBillTotal(t, be.app, bill.Id, 18745)
}

func TestBill_DeleteOnlyDraft(t *testing.T) {
	be := newBillEnv(t)
	bill := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, bill, 0, accountLine(be.designTools, 18745))
	setBillStatus(t, be.app, bill.Id, statusPosted)

	err := be.app.Delete(reload(t, be.app, "books_bills", bill.Id))
	requireRefusalText(t, err, wantBillDeleteNotDraft)
	if _, err := be.app.FindRecordById("books_bills", bill.Id); err != nil {
		t.Fatalf("the posted bill is gone: %v", err)
	}
	requireBillLineCount(t, be.app, bill, 1)

	draft := mkBill(t, be.app, be.officeSupply, nil)
	mkBillLine(t, be.app, draft, 0, accountLine(be.designTools, 100))
	if err := be.app.Delete(reload(t, be.app, "books_bills", draft.Id)); err != nil {
		t.Fatalf("delete a draft bill: %v", err)
	}
	requireBillLineCount(t, be.app, draft, 0)
}

// A bill's entry is named "Bill 1003" ("This bill", "Draft bill"), and its
// doc type is one only posting the document writes.
func TestBill_EntryNounsAndDocType(t *testing.T) {
	if noun, this, draft := entryNouns("bill"); [3]string{noun, this, draft} != [3]string{"Bill", "This bill", "Draft bill"} {
		t.Errorf("entryNouns(bill) = %q, %q, %q; want Bill, This bill, Draft bill", noun, this, draft)
	}
	if docTypeBill != "bill" || !documentDocTypes[docTypeBill] {
		t.Errorf("docTypeBill %q in documentDocTypes %v, want bill and true", docTypeBill, documentDocTypes[docTypeBill])
	}
}
