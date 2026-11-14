package books

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// The books_party_balances view (spec §4): one row per customer with posted
// lines on an accounts-receivable account, balance = debits minus credits in
// integer cents. The view is read the way the records API reads it, by its
// collection name, so a wrong query or a missing migration fails here.

const partyBalancesName = "books_party_balances"

// partyEnv is a ledger env with an A/R account.
type partyEnv struct {
	*ledgerEnv
	receivable *core.Record
}

func newPartyEnv(t *testing.T) *partyEnv {
	t.Helper()
	env := newLedgerEnv(t)
	return &partyEnv{
		ledgerEnv:  env,
		receivable: mkAccount(t, env.app, "Accounts receivable", "accounts_receivable", "accounts_receivable"),
	}
}

// partyLineSpec is one line of an entry these tests write, with the customer
// it names ("" for none).
type partyLineSpec struct {
	account       *core.Record
	debit, credit int
	customer      string
}

// draftWith saves a draft entry and its lines through the app, so every line
// guard runs.
func (pe *partyEnv) draftWith(t testing.TB, lines ...partyLineSpec) *core.Record {
	t.Helper()
	entry := draftEntry(t, pe.app, "2026-08-04")
	for i, l := range lines {
		_, err := saveNew(pe.app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"position": i, "currency": "USD", "customer": l.customer,
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

// partyBalances reads every row of the view: customer id -> balance. It also
// checks each row's id is its customer.
func partyBalances(t testing.TB, app core.App) map[string]int {
	t.Helper()
	rows, err := app.FindAllRecords(partyBalancesName)
	if err != nil {
		t.Fatalf("read %s: %v", partyBalancesName, err)
	}
	out := map[string]int{}
	for _, r := range rows {
		if r.Id != r.GetString("customer") {
			t.Errorf("row id %q is not its customer %q", r.Id, r.GetString("customer"))
		}
		out[r.GetString("customer")] = r.GetInt("balance")
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
