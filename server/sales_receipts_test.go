package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"tinycld.org/core/forms"
)

// The refusal texts of the sales receipt guards, as the client gets them
// (PocketBase adds a final period). Written out here, not read from the
// consts, so a change of wording fails this file too.
const (
	wantReceiptTotalNegative  = "A sales receipt total cannot be below zero. Use a refund receipt."
	wantReceiptTotalTooLarge  = "The sales receipt total is more than Books can store."
	wantReceiptTooManyLines   = "A sales receipt can have at most 250 lines."
	wantReceiptLineStays      = "A line stays on its sales receipt."
	wantReceiptLineNotDraft   = "Only the lines of a draft sales receipt can change."
	wantReceiptDeleteNotDraft = "Only a draft sales receipt can be deleted."
	wantReceiptZeroTotal      = "A sales receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
	wantReceiptEntryFromPost  = "A sales receipt entry comes only from posting its sales receipt."
	// The invoice's own texts, which the receipt reuses for its date and tax rate.
	wantDocumentDay         = "Enter a date that exists, in the form YYYY-MM-DD."
	wantDocumentTaxInactive = "The tax rate is inactive. Choose an active rate."
	wantDepositInvalid      = "Choose an active bank or Undeposited funds account."
	wantDepositNone         = "Add a bank account or an Undeposited funds account to the chart of accounts."
	receiptTestDay          = "2026-11-04"
	receiptSequenceID       = "booksseqsalesrc"
)

// bindSalesDocHosts binds the generated forms hosts of both sales document
// kinds in one call, as the server does at boot: core keeps one set of bound
// hosts per app, so a second BindHooks call would replace the first.
func bindSalesDocHosts(t *testing.T, app core.App) {
	t.Helper()
	defs, err := forms.LoadHosts(generatedHostsPath)
	if err != nil {
		t.Fatalf("load the generated forms hosts: %v", err)
	}
	var hosts []forms.Host
	seen := map[string]bool{}
	for _, key := range []string{invoiceKind.HostKey, salesReceiptKind.HostKey} {
		if seen[key] {
			continue
		}
		seen[key] = true
		host := defs.Host(key)
		if host == nil {
			t.Fatalf("%s has no %s host: run `pnpm run packages:generate` in the tinycld repo", generatedHostsPath, key)
		}
		hosts = append(hosts, *host)
	}
	forms.BindHooks(app, &forms.Defs{Hosts: hosts})
}

// receiptEnv is a migrated app with the ledger hooks and the sales receipt
// guards bound, on the accounts of the e2e book a receipt reads (1000 Business
// Checking, 1010 Business Savings, 1100 Accounts receivable, 1200 Undeposited
// funds, 3900 Retained earnings, 4000 Consulting Income) plus a hardware income account, Harborview
// Dental, the products a receipt names, and a Denver combined group whose
// three components belong to three agencies, each with its own liability.
type receiptEnv struct {
	*ledgerEnv
	savings, receivable, undeposited, hardware *core.Record
	customer                                   *core.Record
	service, accessPoint, retired              *core.Record
	stateTax, rtdTax, cityTax                  *core.Record
	state, rtd, city, denver                   *core.Record
	stateDOR, rtdAgency, cityDept              *core.Record
}

func newReceiptEnv(t *testing.T) *receiptEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerSalesDocGuards(app, salesReceiptKind)
	bindSalesDocHosts(t, app)
	return receiptEnvOn(t, app)
}

// receiptEnvOn adds the e2e accounts, users, products, tax rates and the
// customer to an app whose hooks are already bound, so they pass through them.
func receiptEnvOn(t *testing.T, app *tests.TestApp) *receiptEnv {
	t.Helper()
	env := &ledgerEnv{
		app:      app,
		users:    newLevelUsers(t, app),
		checking: mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		revenue:  mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income"),
		rent:     mkNumberedAccount(t, app, "Rent", "6100", "expense", "rent_lease"),
	}
	re := &receiptEnv{
		ledgerEnv:   env,
		savings:     mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		receivable:  mkNumberedAccount(t, app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		undeposited: mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
		hardware:    mkNumberedAccount(t, app, "Hardware sales", "4100", "income", "product_sales"),
	}
	// The e2e chart has 3900 Retained earnings; without it the ledger's own
	// retained-earnings rule would add an account on the first P&L post.
	mkRetainedEarnings(t, app, "3900")
	product := func(name, productType string, income *core.Record, taxable bool) *core.Record {
		t.Helper()
		r, err := newProduct(app, map[string]any{"type": productType, "name": name, "income_account": income.Id, "taxable": taxable})
		if err != nil {
			t.Fatalf("save product %s: %v", name, err)
		}
		return r
	}
	re.service = product("Monthly bookkeeping", "service", env.revenue, true)
	re.accessPoint = product("Wireless access point", "non_inventory", re.hardware, true)
	re.retired = product("Old retainer", "service", env.revenue, false)
	makeProductInactive(t, app, re.retired)

	re.stateTax = mkLiabilityAccount(t, app, "State sales tax payable")
	re.rtdTax = mkLiabilityAccount(t, app, "RTD tax payable")
	re.cityTax = mkLiabilityAccount(t, app, "Denver tax payable")
	re.stateDOR = mkTaxAgency(t, app, "State DOR", re.stateTax)
	re.rtdAgency = mkTaxAgency(t, app, "RTD district", re.rtdTax)
	re.cityDept = mkTaxAgency(t, app, "Denver treasury", re.cityTax)
	re.state = mkTaxRate(t, app, "Colorado state", 29000, re.stateDOR)
	re.rtd = mkTaxRate(t, app, "RTD transit", 10000, re.rtdAgency)
	re.city = mkTaxRate(t, app, "Denver city", 48100, re.cityDept)
	re.denver = mkTaxGroup(t, app, "Denver combined", re.state, re.rtd, re.city)

	re.customer = mkCustomer(t, app, "Harborview Dental", "")
	if err := setCustomer(t, app, re.customer.Id, map[string]any{"default_tax_rate": re.denver.Id}); err != nil {
		t.Fatalf("give Harborview Dental its default rate: %v", err)
	}
	return re
}

// newReceipt saves a draft sales receipt through the app, so every guard runs,
// with the fields given over a valid default (Harborview Dental, deposited to
// 1200 Undeposited funds), and returns what the guards said.
func (re *receiptEnv) newReceipt(fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"customer": re.customer.Id, "status": "draft", "date": receiptTestDay, "deposit_to": re.undeposited.Id,
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(re.app, "books_sales_receipts", all)
}

func (re *receiptEnv) mkReceipt(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := re.newReceipt(fields)
	if err != nil {
		t.Fatalf("save a draft sales receipt: %v", err)
	}
	return r
}

// newReceiptLine saves one line of receipt at position through the app, so
// every guard and the restatement run.
func newReceiptLine(app core.App, receipt *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"sales_receipt": receipt.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_sales_receipt_lines", all)
}

func mkReceiptLine(t testing.TB, app core.App, receipt *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newReceiptLine(app, receipt, position, fields)
	if err != nil {
		t.Fatalf("save receipt line %d: %v", position+1, err)
	}
	return r
}

func requireReceiptTotals(t testing.TB, app core.App, id string, subtotal, tax, total int) {
	t.Helper()
	r := reload(t, app, "books_sales_receipts", id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("tax_total"), r.GetInt("total")}; got != [3]int{subtotal, tax, total} {
		t.Errorf("receipt subtotal/tax_total/total = %v, want %v", got, [3]int{subtotal, tax, total})
	}
}

func requireReceiptLineCount(t testing.TB, app core.App, receipt *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_sales_receipt_lines", dbx.HashExp{"sales_receipt": receipt.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the sales receipt, want %d", n, want)
	}
}

// setReceiptStatus writes status straight to the table, past every hook, so a
// line guard test holds a posted receipt without posting it.
func setReceiptStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_sales_receipts SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set sales receipt %s %s: %v", id, status, err)
	}
}

func TestSalesReceipt_DraftWithNoCustomerSaves(t *testing.T) {
	re := newReceiptEnv(t)
	r, err := re.newReceipt(map[string]any{"customer": ""})
	if err != nil {
		t.Fatalf("a draft sales receipt with no customer was refused: %v", err)
	}
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	stored := reload(t, re.app, "books_sales_receipts", r.Id)
	if stored.GetString("customer") != "" || stored.GetString("status") != statusDraft {
		t.Errorf("stored customer %q status %q, want none and draft", stored.GetString("customer"), stored.GetString("status"))
	}
	requireReceiptTotals(t, re.app, r.Id, 45000, 0, 45000)
}

func TestSalesReceipt_RefusesInactiveCustomerWhenItChanges(t *testing.T) {
	re := newReceiptEnv(t)
	oldMill := mkCustomer(t, re.app, "Old Mill Bakery", "")
	if err := setCustomer(t, re.app, oldMill.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Old Mill Bakery inactive: %v", err)
	}
	_, err := re.newReceipt(map[string]any{"customer": oldMill.Id})
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts stored after the refusal, want 0", n)
	}

	// A stored draft keeps a customer that became inactive after it was chosen.
	riverside := mkCustomer(t, re.app, "Riverside Clinic", "")
	r := re.mkReceipt(t, map[string]any{"customer": riverside.Id})
	if err := setCustomer(t, re.app, riverside.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Riverside Clinic inactive: %v", err)
	}
	if err := setFields(t, re.app, "books_sales_receipts", r.Id, map[string]any{"memo": "Second visit"}); err != nil {
		t.Fatalf("a memo edit of a draft whose customer became inactive was refused: %v", err)
	}
	if got := reload(t, re.app, "books_sales_receipts", r.Id).GetString("memo"); got != "Second visit" {
		t.Errorf("memo = %q, want Second visit", got)
	}
}

func TestSalesReceipt_SchemaRefusesReferenceAndPaymentMethod(t *testing.T) {
	re := newReceiptEnv(t)
	_, err := re.newReceipt(map[string]any{"reference_no": strings.Repeat("x", 41)})
	requireSchemaRefusal(t, err, "reference_no")
	_, err = re.newReceipt(map[string]any{"payment_method": "cheque"})
	requireSchemaRefusal(t, err, "payment_method")
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts stored after the refusals, want 0", n)
	}

	r := re.mkReceipt(t, map[string]any{"reference_no": strings.Repeat("x", 40), "payment_method": "check"})
	stored := reload(t, re.app, "books_sales_receipts", r.Id)
	if stored.GetString("payment_method") != "check" || len(stored.GetString("reference_no")) != 40 {
		t.Errorf("stored payment_method %q reference_no %q, want check and 40 characters",
			stored.GetString("payment_method"), stored.GetString("reference_no"))
	}
}

func TestSalesReceiptLine_NamesItsReceiptAndStaysOnIt(t *testing.T) {
	re := newReceiptEnv(t)
	first := re.mkReceipt(t, nil)
	second := re.mkReceipt(t, nil)
	line := mkReceiptLine(t, re.app, first, 0, item(re.service, 2, 45000, false))

	if got := reload(t, re.app, "books_sales_receipt_lines", line.Id).GetString("sales_receipt"); got != first.Id {
		t.Errorf("line sales_receipt = %q, want the first receipt", got)
	}
	requireReceiptLineCount(t, re.app, first, 1)
	requireReceiptTotals(t, re.app, first.Id, 90000, 0, 90000)

	err := setFields(t, re.app, "books_sales_receipt_lines", line.Id, map[string]any{"sales_receipt": second.Id})
	requireRefusalText(t, err, wantReceiptLineStays)
	if got := reload(t, re.app, "books_sales_receipt_lines", line.Id).GetString("sales_receipt"); got != first.Id {
		t.Errorf("line sales_receipt = %q after the refusal, want the first receipt", got)
	}
	requireReceiptLineCount(t, re.app, second, 0)
}

func TestSalesReceiptLine_RefusedOnPostedReceipt(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, nil)
	line := mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 45000, false))
	setReceiptStatus(t, re.app, r.Id, statusPosted)

	err := setFields(t, re.app, "books_sales_receipt_lines", line.Id, map[string]any{"quantity": 2})
	requireRefusalText(t, err, wantReceiptLineNotDraft)
	_, err = newReceiptLine(re.app, r, 1, item(re.service, 1, 100, false))
	requireRefusalText(t, err, wantReceiptLineNotDraft)
	err = re.app.Delete(reload(t, re.app, "books_sales_receipt_lines", line.Id))
	requireRefusalText(t, err, wantReceiptLineNotDraft)

	requireReceiptLineCount(t, re.app, r, 1)
	if got := reload(t, re.app, "books_sales_receipt_lines", line.Id).GetFloat("quantity"); got != 1 {
		t.Errorf("quantity = %v after the refusal, want 1", got)
	}
}

func TestSalesReceipt_DeleteOnlyDraft(t *testing.T) {
	re := newReceiptEnv(t)
	posted := re.mkReceipt(t, nil)
	mkReceiptLine(t, re.app, posted, 0, item(re.service, 1, 45000, false))
	stale := reload(t, re.app, "books_sales_receipts", posted.Id)
	setReceiptStatus(t, re.app, posted.Id, statusPosted)

	requireRefusalText(t, re.app.Delete(stale), wantReceiptDeleteNotDraft)
	if _, err := re.app.FindRecordById("books_sales_receipts", posted.Id); err != nil {
		t.Fatalf("the posted sales receipt is gone: %v", err)
	}
	requireReceiptLineCount(t, re.app, posted, 1)

	draft := re.mkReceipt(t, nil)
	mkReceiptLine(t, re.app, draft, 0, item(re.service, 1, 45000, false))
	if err := re.app.Delete(reload(t, re.app, "books_sales_receipts", draft.Id)); err != nil {
		t.Fatalf("delete a draft sales receipt: %v", err)
	}
	requireReceiptLineCount(t, re.app, draft, 0)
}

func TestSalesReceipt_RefusesNegativeTotal(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, nil)
	mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 1000, false))

	_, err := newReceiptLine(re.app, r, 1, item(re.service, 1, -1001, false))
	requireRefusalText(t, err, wantReceiptTotalNegative)
	requireReceiptLineCount(t, re.app, r, 1)
	requireReceiptTotals(t, re.app, r.Id, 1000, 0, 1000)
}

func TestSalesReceipt_RefusesTooLargeTotal(t *testing.T) {
	re := newReceiptEnv(t)
	r := re.mkReceipt(t, nil)
	for i := 0; i < 9; i++ {
		mkReceiptLine(t, re.app, r, i, item(re.service, bigQty, bigRate, false))
	}
	requireReceiptTotals(t, re.app, r.Id, 9_000_000_000_000_000, 0, 9_000_000_000_000_000)

	_, err := newReceiptLine(re.app, r, 9, item(re.service, bigQty, bigRate, false))
	requireRefusalText(t, err, wantReceiptTotalTooLarge)
	requireReceiptLineCount(t, re.app, r, 9)
}

func TestSalesReceiptLine_RefusesTheLine251st(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	re := receiptEnvOn(t, app)
	// 249 lines written before the guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	r := saveRecord(t, app, "books_sales_receipts", map[string]any{
		"customer": re.customer.Id, "status": "draft", "date": receiptTestDay,
		"deposit_to": re.undeposited.Id, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		saveRecord(t, app, "books_sales_receipt_lines", map[string]any{
			"sales_receipt": r.Id, "kind": "description", "description": fmt.Sprintf("Note %d", i+1), "position": i,
		})
	}
	registerSalesDocGuards(app, salesReceiptKind)
	bindSalesDocHosts(t, app)

	mkReceiptLine(t, app, r, 249, descriptionLine("Note 250"))
	_, err := newReceiptLine(app, r, 250, descriptionLine("Note 251"))
	requireRefusalText(t, err, wantReceiptTooManyLines)
	requireReceiptLineCount(t, app, r, 250)
}

func TestSalesReceipt_RefusesABadDate(t *testing.T) {
	re := newReceiptEnv(t)
	_, err := re.newReceipt(map[string]any{"date": "2026-13-40"})
	requireFieldRefusal(t, err, "date", wantDocumentDay)
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts saved with a bad date, want 0", n)
	}
}

func TestSalesReceipt_RefusesInactiveTaxRate(t *testing.T) {
	re := newReceiptEnv(t)
	boulder := mkTaxRate(t, re.app, "Boulder city", 38600, re.cityDept)
	if err := setTaxRate(t, re.app, boulder.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Boulder city inactive: %v", err)
	}
	_, err := re.newReceipt(map[string]any{"tax_rate": boulder.Id})
	requireFieldRefusal(t, err, "tax_rate", wantDocumentTaxInactive)
	if n, _ := re.app.CountRecords("books_sales_receipts"); n != 0 {
		t.Errorf("%d sales receipts saved with an inactive tax rate, want 0", n)
	}
}
