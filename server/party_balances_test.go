package books

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// The books_party_balances view (vendor pages spec §4): one row per customer
// with posted lines on an accounts-receivable account (balance = debits minus
// credits) and one row per vendor with posted lines on an accounts-payable
// account (balance = credits minus debits), in integer cents. A row's id is
// its party's id, and a row names one party only. The view is read the way the
// records API reads it, by its collection name, so a wrong query or a missing
// migration fails here.

const partyBalancesName = "books_party_balances"

// partyEnv is a ledger env with an A/R and an A/P account.
type partyEnv struct {
	*ledgerEnv
	receivable *core.Record
	payable    *core.Record
}

func newPartyEnv(t *testing.T) *partyEnv {
	t.Helper()
	env := newLedgerEnv(t)
	return &partyEnv{
		ledgerEnv:  env,
		receivable: mkAccount(t, env.app, "Accounts receivable", "accounts_receivable", "accounts_receivable"),
		payable:    mkAccount(t, env.app, "Accounts payable", "accounts_payable", "accounts_payable"),
	}
}

// partyLineSpec is one line of an entry these tests write, with the customer
// and the vendor it names ("" for none).
type partyLineSpec struct {
	account       *core.Record
	debit, credit int
	customer      string
	vendor        string
}

// draftWith saves a draft entry and its lines through the app, so every line
// guard runs.
func (pe *partyEnv) draftWith(t testing.TB, lines ...partyLineSpec) *core.Record {
	t.Helper()
	entry := draftEntry(t, pe.app, "2026-08-04")
	for i, l := range lines {
		_, err := saveNew(pe.app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"position": i, "currency": "USD", "customer": l.customer, "vendor": l.vendor,
		})
		if err != nil {
			t.Fatalf("save line %d: %v", i, err)
		}
	}
	return entry
}

func (pe *partyEnv) postWith(t testing.TB, lines ...partyLineSpec) *core.Record {
	t.Helper()
	entry := pe.draftWith(t, lines...)
	return mustPost(t, pe.app, entry.Id, pe.users.bookkeeper.Id)
}

// partyRows reads every row of the view.
func partyRows(t testing.TB, app core.App) []*core.Record {
	t.Helper()
	rows, err := app.FindAllRecords(partyBalancesName)
	if err != nil {
		t.Fatalf("read %s: %v", partyBalancesName, err)
	}
	return rows
}

// partyBalances reads every row of the view: party id -> balance, the party
// being the row's customer, else its vendor. It fails the test when a row
// names both parties or when a row's id is not its party's id.
func partyBalances(t testing.TB, app core.App) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, r := range partyRows(t, app) {
		customer, vendor := r.GetString("customer"), r.GetString("vendor")
		if customer != "" && vendor != "" {
			t.Errorf("row %q names both customer %q and vendor %q", r.Id, customer, vendor)
		}
		party := customer
		if party == "" {
			party = vendor
		}
		if r.Id != party {
			t.Errorf("row id %q is not its party %q (customer %q, vendor %q)", r.Id, party, customer, vendor)
		}
		out[party] = r.GetInt("balance")
	}
	return out
}

func requireBalances(t testing.TB, app core.App, want map[string]int) {
	t.Helper()
	if got := partyBalances(t, app); !reflect.DeepEqual(got, want) {
		t.Fatalf("party balances = %v, want %v", got, want)
	}
}

func TestPartyBalances_OneRowPerCustomerWithPostedReceivables(t *testing.T) {
	pe := newPartyEnv(t)
	harbor := mkCustomer(t, pe.app, "Harborview", "")
	northwind := mkCustomer(t, pe.app, "Northwind Traders", "")

	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 12000, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 12000})
	pe.postWith(t,
		partyLineSpec{account: pe.checking, debit: 2000},
		partyLineSpec{account: pe.receivable, credit: 2000, customer: harbor.Id})
	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 5000, customer: northwind.Id},
		partyLineSpec{account: pe.revenue, credit: 5000})

	requireBalances(t, pe.app, map[string]int{harbor.Id: 10000, northwind.Id: 5000})
}

// A draft line is not in the ledger yet: the view reads posted lines only.
func TestPartyBalances_DraftLineGivesNoRow(t *testing.T) {
	pe := newPartyEnv(t)
	harbor := mkCustomer(t, pe.app, "Harborview", "")
	alvarez := mkCustomer(t, pe.app, "Alvarez Builders", "")

	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 5000, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 5000})
	pe.draftWith(t,
		partyLineSpec{account: pe.receivable, debit: 7000, customer: alvarez.Id},
		partyLineSpec{account: pe.revenue, credit: 7000})

	requireBalances(t, pe.app, map[string]int{harbor.Id: 5000})
}

// A line on another account (income, bank) that names the customer is not
// what the customer owes.
func TestPartyBalances_NonReceivableLineIsLeftOut(t *testing.T) {
	pe := newPartyEnv(t)
	harbor := mkCustomer(t, pe.app, "Harborview", "")

	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 3000, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 3000, customer: harbor.Id})
	pe.postWith(t,
		partyLineSpec{account: pe.checking, debit: 700, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 700, customer: harbor.Id})

	requireBalances(t, pe.app, map[string]int{harbor.Id: 3000})
}

func TestPartyBalances_ReceivableLineWithNoCustomerGivesNoRow(t *testing.T) {
	pe := newPartyEnv(t)
	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 4000},
		partyLineSpec{account: pe.revenue, credit: 4000})

	requireBalances(t, pe.app, map[string]int{})
}

// A void writes a reversal that names the same customer, so the two cancel
// and the row stays with a balance of 0.
func TestPartyBalances_VoidedInvoiceNetsToZero(t *testing.T) {
	pe := newPostingEnv(t)
	inv := pe.everyKindInvoice(t, nil)
	mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
	requireBalances(t, pe.app, map[string]int{pe.customer.Id: 211177})

	if err := voidInvoiceAs(pe.app, inv.Id, pe.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	requireBalances(t, pe.app, map[string]int{pe.customer.Id: 0})
}

func TestPartyBalances_CreditIsNegative(t *testing.T) {
	pe := newPartyEnv(t)
	alvarez := mkCustomer(t, pe.app, "Alvarez Builders", "")
	pe.postWith(t,
		partyLineSpec{account: pe.checking, debit: 12000},
		partyLineSpec{account: pe.receivable, credit: 12000, customer: alvarez.Id})

	requireBalances(t, pe.app, map[string]int{alvarez.Id: -12000})
}

// PocketBase types a view column from its SQL; the CAST makes balance a number
// field, so the records API sends a JSON number, and customer a relation.
func TestPartyBalances_FieldTypes(t *testing.T) {
	pe := newPartyEnv(t)
	harbor := mkCustomer(t, pe.app, "Harborview", "")
	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 2781865, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 2781865})

	col, err := pe.app.FindCollectionByNameOrId(partyBalancesName)
	if err != nil {
		t.Fatalf("find %s: %v", partyBalancesName, err)
	}
	if col.Type != core.CollectionTypeView {
		t.Errorf("%s type = %q, want view", partyBalancesName, col.Type)
	}
	balance := col.Fields.GetByName("balance")
	if balance == nil || balance.Type() != core.FieldTypeNumber {
		t.Fatalf("balance field = %v, want a number field", balance)
	}
	customer, ok := col.Fields.GetByName("customer").(*core.RelationField)
	if !ok {
		t.Fatalf("customer field = %T, want a relation", col.Fields.GetByName("customer"))
	}
	customers, err := pe.app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		t.Fatal(err)
	}
	if customer.CollectionId != customers.Id {
		t.Errorf("customer relation points at %q, want books_customers (%q)", customer.CollectionId, customers.Id)
	}

	record, err := pe.app.FindRecordById(partyBalancesName, harbor.Id)
	if err != nil {
		t.Fatalf("read the balance row: %v", err)
	}
	raw, err := json.Marshal(record.PublicExport())
	if err != nil {
		t.Fatal(err)
	}
	var exported map[string]any
	if err := json.Unmarshal(raw, &exported); err != nil {
		t.Fatal(err)
	}
	got, isNumber := exported["balance"].(float64)
	if !isNumber {
		t.Fatalf("exported balance = %#v (%T), want a JSON number; row %s", exported["balance"], exported["balance"], raw)
	}
	if got != 2781865 {
		t.Errorf("exported balance = %v, want 2781865", got)
	}
}

// vendorBill posts a bill's ledger lines for vendor: the expense debited, A/P
// credited and naming the vendor.
func (pe *partyEnv) vendorBill(t testing.TB, vendor *core.Record, amount int) *core.Record {
	t.Helper()
	return pe.postWith(t,
		partyLineSpec{account: pe.rent, debit: amount},
		partyLineSpec{account: pe.payable, credit: amount, vendor: vendor.Id})
}

// The rewritten view must be one PocketBase accepts (the CASE id column) and
// must type both party columns as relations: the client collection and the
// page queries filter on them.
func TestPartyBalances_VendorFieldTypes(t *testing.T) {
	pe := newPartyEnv(t)
	office := mkVendor(t, pe.app, "Office Supply World")
	pe.vendorBill(t, office, 125000)

	col, err := pe.app.FindCollectionByNameOrId(partyBalancesName)
	if err != nil {
		t.Fatalf("find %s (did PocketBase refuse the view query?): %v", partyBalancesName, err)
	}
	if col.Type != core.CollectionTypeView {
		t.Errorf("%s type = %q, want view", partyBalancesName, col.Type)
	}

	vendors, err := pe.app.FindCollectionByNameOrId("books_vendors")
	if err != nil {
		t.Fatal(err)
	}
	vendor, ok := col.Fields.GetByName("vendor").(*core.RelationField)
	if !ok {
		t.Fatalf("vendor field = %T (%v), want a relation", col.Fields.GetByName("vendor"), col.Fields.GetByName("vendor"))
	}
	if vendor.CollectionId != vendors.Id {
		t.Errorf("vendor relation points at %q, want books_vendors (%q)", vendor.CollectionId, vendors.Id)
	}

	customers, err := pe.app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		t.Fatal(err)
	}
	customer, ok := col.Fields.GetByName("customer").(*core.RelationField)
	if !ok {
		t.Fatalf("customer field = %T, want a relation", col.Fields.GetByName("customer"))
	}
	if customer.CollectionId != customers.Id {
		t.Errorf("customer relation points at %q, want books_customers (%q)", customer.CollectionId, customers.Id)
	}

	balance := col.Fields.GetByName("balance")
	if balance == nil || balance.Type() != core.FieldTypeNumber {
		t.Fatalf("balance field = %v, want a number field", balance)
	}

	record, err := pe.app.FindRecordById(partyBalancesName, office.Id)
	if err != nil {
		t.Fatalf("read the vendor's balance row by the vendor id: %v", err)
	}
	if record.Id != office.Id {
		t.Errorf("vendor row id = %q, want the vendor id %q", record.Id, office.Id)
	}
	if got := record.GetString("vendor"); got != office.Id {
		t.Errorf("vendor row's vendor = %q, want %q", got, office.Id)
	}
	if got := record.GetString("customer"); got != "" {
		t.Errorf("vendor row's customer = %q, want ''", got)
	}
	if got := record.GetInt("balance"); got != 125000 {
		t.Errorf("vendor row's balance = %d, want 125000", got)
	}
}

// Bills raise what the business owes a vendor (A/P credits); a bill payment
// and a vendor credit lower it (A/P debits); a void's reversal cancels its
// bill and leaves the row at 0.
func TestPartyBalances_VendorRowsFollowBillsPaymentsCreditsAndVoids(t *testing.T) {
	pe := newPartyEnv(t)
	office := mkVendor(t, pe.app, "Office Supply World")
	pacific := mkVendor(t, pe.app, "Pacific Power")

	pe.vendorBill(t, office, 125000)
	pacificBill := pe.vendorBill(t, pacific, 30000)
	requireBalances(t, pe.app, map[string]int{office.Id: 125000, pacific.Id: 30000})
	for _, r := range partyRows(t, pe.app) {
		if got := r.GetString("customer"); got != "" {
			t.Errorf("vendor row %q has customer %q, want ''", r.Id, got)
		}
		if got := r.GetString("vendor"); got != r.Id {
			t.Errorf("vendor row %q has vendor %q, want its id", r.Id, got)
		}
	}

	// A bill payment: A/P debited for the vendor, paid from checking.
	pe.postWith(t,
		partyLineSpec{account: pe.payable, debit: 40000, vendor: office.Id},
		partyLineSpec{account: pe.checking, credit: 40000})
	requireBalances(t, pe.app, map[string]int{office.Id: 85000, pacific.Id: 30000})

	// A vendor credit: A/P debited for the vendor, the expense credited.
	pe.postWith(t,
		partyLineSpec{account: pe.payable, debit: 9900, vendor: office.Id},
		partyLineSpec{account: pe.rent, credit: 9900})
	requireBalances(t, pe.app, map[string]int{office.Id: 75100, pacific.Id: 30000})

	if err := setStatus(pe.app, pacificBill.Id, statusVoid, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the Pacific Power bill: %v", err)
	}
	requireBalances(t, pe.app, map[string]int{office.Id: 75100, pacific.Id: 0})
}

// Only an A/P line that names a vendor is a vendor balance. Each case also
// posts one real vendor bill, so an empty or vendor-less view cannot pass.
func TestPartyBalances_OnlyPayableLinesNamingAVendorGiveVendorRows(t *testing.T) {
	cases := []struct {
		name  string
		lines func(pe *partyEnv, vendor, customer *core.Record) []partyLineSpec
	}{
		{"an A/P line with no vendor", func(pe *partyEnv, _, _ *core.Record) []partyLineSpec {
			return []partyLineSpec{
				{account: pe.rent, debit: 4000},
				{account: pe.payable, credit: 4000},
			}
		}},
		{"an A/R line that names a vendor and no customer", func(pe *partyEnv, vendor, _ *core.Record) []partyLineSpec {
			return []partyLineSpec{
				{account: pe.receivable, debit: 4000, vendor: vendor.Id},
				{account: pe.revenue, credit: 4000},
			}
		}},
		{"an A/P line that names a customer and no vendor", func(pe *partyEnv, _, customer *core.Record) []partyLineSpec {
			return []partyLineSpec{
				{account: pe.rent, debit: 4000},
				{account: pe.payable, credit: 4000, customer: customer.Id},
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			pe := newPartyEnv(t)
			office := mkVendor(t, pe.app, "Office Supply World")
			stray := mkVendor(t, pe.app, "Summit IT Services")
			harbor := mkCustomer(t, pe.app, "Harborview", "")
			pe.vendorBill(t, office, 5625)

			pe.postWith(t, c.lines(pe, stray, harbor)...)

			requireBalances(t, pe.app, map[string]int{office.Id: 5625})
		})
	}
}

// A customer and a vendor never share a row, and each keeps its own sign:
// a customer row is debits minus credits, a vendor row credits minus debits.
func TestPartyBalances_CustomerAndVendorRowsStaySeparate(t *testing.T) {
	pe := newPartyEnv(t)
	harbor := mkCustomer(t, pe.app, "Harborview", "")
	office := mkVendor(t, pe.app, "Office Supply World")

	pe.postWith(t,
		partyLineSpec{account: pe.receivable, debit: 5000, customer: harbor.Id},
		partyLineSpec{account: pe.revenue, credit: 5000})
	pe.postWith(t,
		partyLineSpec{account: pe.checking, debit: 1000},
		partyLineSpec{account: pe.receivable, credit: 1000, customer: harbor.Id})
	pe.vendorBill(t, office, 7000)
	pe.postWith(t,
		partyLineSpec{account: pe.payable, debit: 2000, vendor: office.Id},
		partyLineSpec{account: pe.checking, credit: 2000})

	requireBalances(t, pe.app, map[string]int{harbor.Id: 4000, office.Id: 5000})

	byID := map[string]*core.Record{}
	for _, r := range partyRows(t, pe.app) {
		byID[r.Id] = r
	}
	if len(byID) != 2 {
		t.Fatalf("view rows = %v, want one customer row and one vendor row", byID)
	}
	if got := byID[harbor.Id].GetString("vendor"); got != "" {
		t.Errorf("customer row's vendor = %q, want ''", got)
	}
	if got := byID[harbor.Id].GetString("customer"); got != harbor.Id {
		t.Errorf("customer row's customer = %q, want %q", got, harbor.Id)
	}
	if got := byID[office.Id].GetString("customer"); got != "" {
		t.Errorf("vendor row's customer = %q, want ''", got)
	}
	if got := byID[office.Id].GetString("vendor"); got != office.Id {
		t.Errorf("vendor row's vendor = %q, want %q", got, office.Id)
	}
}

// A draft bill is not in the ledger yet: the view reads posted lines only.
func TestPartyBalances_DraftPayableLineGivesNoVendorRow(t *testing.T) {
	pe := newPartyEnv(t)
	office := mkVendor(t, pe.app, "Office Supply World")
	pacific := mkVendor(t, pe.app, "Pacific Power")

	pe.vendorBill(t, office, 18425)
	pe.draftWith(t,
		partyLineSpec{account: pe.rent, debit: 42000},
		partyLineSpec{account: pe.payable, credit: 42000, vendor: pacific.Id})

	requireBalances(t, pe.app, map[string]int{office.Id: 18425})
}

func TestPartyBalances_RegistersTheViewAndItsSources(t *testing.T) {
	changesignal.ResetForTesting()
	t.Cleanup(changesignal.ResetForTesting)
	if partyBalancesView != partyBalancesName {
		t.Fatalf("partyBalancesView = %q, want %q", partyBalancesView, partyBalancesName)
	}

	registerPartyBalances()

	want := []string{"books_accounts", "books_journal_lines"}
	if got := changesignal.RegisteredViews()[partyBalancesName]; !reflect.DeepEqual(got, want) {
		t.Fatalf("registered sources of %s = %v, want %v", partyBalancesName, got, want)
	}
	if err := changesignal.CheckViews(newBooksApp(t)); err != nil {
		t.Fatalf("CheckViews: %v", err)
	}
}

// Register, as production wires Books, must register the view, or no write
// to a line or an account would reach an open customer page.
func TestRegister_RegistersThePartyBalancesView(t *testing.T) {
	changesignal.ResetForTesting()
	newRegisteredApp(t)

	if _, ok := changesignal.RegisteredViews()[partyBalancesName]; !ok {
		t.Fatalf("Register did not register %s; registered views: %v", partyBalancesName, changesignal.RegisteredViews())
	}
}
