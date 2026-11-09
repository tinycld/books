package books

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The refusal texts of the line party guards (plan P7). They are written out
// here, not read from the consts, so a change of wording fails this file too.
const (
	wantLineBothParties = "A line can name a customer or a vendor, not both."
)

func wantPartyInactive(name string) string {
	return name + " is inactive. Choose an active customer or vendor."
}

func wantPartyOnLines(name string) string {
	return name + " is on journal lines. Make it inactive instead."
}

// partyLine saves one line of entry on account through the app, so every line
// guard runs, with the extra fields (customer, vendor, memo) given.
func partyLine(app core.App, entry, account *core.Record, position int, extra map[string]any) (*core.Record, error) {
	fields := map[string]any{
		"entry": entry.Id, "account": account.Id, "debit": 1000, "credit": 0,
		"position": position, "currency": "USD",
	}
	for k, v := range extra {
		fields[k] = v
	}
	return saveNew(app, "books_journal_lines", fields)
}

func mustPartyLine(t testing.TB, app core.App, entry, account *core.Record, position int, extra map[string]any) *core.Record {
	t.Helper()
	line, err := partyLine(app, entry, account, position, extra)
	if err != nil {
		t.Fatalf("save line %d: %v", position, err)
	}
	return line
}

// draftEntry saves an empty manual draft entry.
func draftEntry(t testing.TB, app core.App, date string) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD",
	})
}

// postedWithParties posts a balanced entry: a checking debit that names
// customer and a revenue credit that names vendor (” for none).
func postedWithParties(t testing.TB, env *ledgerEnv, customer, vendor string) *core.Record {
	t.Helper()
	entry := draftEntry(t, env.app, "2026-08-04")
	mustPartyLine(t, env.app, entry, env.checking, 0, map[string]any{"customer": customer})
	_, err := saveNew(env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": env.revenue.Id, "debit": 0, "credit": 1000,
		"position": 1, "currency": "USD", "vendor": vendor,
	})
	if err != nil {
		t.Fatalf("save credit line: %v", err)
	}
	return mustPost(t, env.app, entry.Id, "")
}

func makeCustomerInactive(t testing.TB, app core.App, customer *core.Record) {
	t.Helper()
	if err := setCustomer(t, app, customer.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make customer %s inactive: %v", customer.GetString("display_name"), err)
	}
}

func makeVendorInactive(t testing.TB, app core.App, vendor *core.Record) {
	t.Helper()
	if err := setFields(t, app, "books_vendors", vendor.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make vendor %s inactive: %v", vendor.GetString("display_name"), err)
	}
}

func linesOf(t testing.TB, app core.App, entryID string) []*core.Record {
	t.Helper()
	lines, err := app.FindAllRecords("books_journal_lines", dbx.HashExp{"entry": entryID})
	if err != nil {
		t.Fatalf("lines of %s: %v", entryID, err)
	}
	return lines
}

func TestLinePartyBoth(t *testing.T) {
	env := newLedgerEnv(t)
	cust := mkCustomer(t, env.app, "Northwind Traders", "")
	vend := mkVendor(t, env.app, "Summit IT Services")
	entry := draftEntry(t, env.app, "2026-08-04")

	_, err := partyLine(env.app, entry, env.checking, 0, map[string]any{"customer": cust.Id, "vendor": vend.Id})
	requireRefused(t, err, wantLineBothParties)

	line := mustPartyLine(t, env.app, entry, env.checking, 0, map[string]any{"customer": cust.Id})
	requireRefused(t, setFields(t, env.app, "books_journal_lines", line.Id, map[string]any{"vendor": vend.Id}), wantLineBothParties)
	if got := reload(t, env.app, "books_journal_lines", line.Id).GetString("vendor"); got != "" {
		t.Fatalf("refused update stored vendor %q", got)
	}
}

func TestLinePartyInactive(t *testing.T) {
	t.Run("a new line naming an inactive customer", func(t *testing.T) {
		env := newLedgerEnv(t)
		cust := mkCustomer(t, env.app, "Dormant Customer", "")
		makeCustomerInactive(t, env.app, cust)
		entry := draftEntry(t, env.app, "2026-08-04")
		_, err := partyLine(env.app, entry, env.checking, 0, map[string]any{"customer": cust.Id})
		requireRefused(t, err, wantPartyInactive("Dormant Customer"))
	})

	t.Run("a new line naming an inactive vendor", func(t *testing.T) {
		env := newLedgerEnv(t)
		vend := mkVendor(t, env.app, "Dormant Vendor")
		makeVendorInactive(t, env.app, vend)
		entry := draftEntry(t, env.app, "2026-08-04")
		_, err := partyLine(env.app, entry, env.checking, 0, map[string]any{"vendor": vend.Id})
		requireRefused(t, err, wantPartyInactive("Dormant Vendor"))
	})

	t.Run("an update that changes the party to an inactive one", func(t *testing.T) {
		env := newLedgerEnv(t)
		active := mkCustomer(t, env.app, "Active Customer", "")
		dormant := mkCustomer(t, env.app, "Dormant Customer", "")
		makeCustomerInactive(t, env.app, dormant)
		entry := draftEntry(t, env.app, "2026-08-04")
		line := mustPartyLine(t, env.app, entry, env.checking, 0, map[string]any{"customer": active.Id})
		if got := reload(t, env.app, "books_journal_lines", line.Id).GetString("customer"); got != active.Id {
			t.Fatalf("stored customer = %q, want %q", got, active.Id)
		}
		err := setFields(t, env.app, "books_journal_lines", line.Id, map[string]any{"customer": dormant.Id})
		requireRefused(t, err, wantPartyInactive("Dormant Customer"))
	})

	t.Run("a memo change keeps a customer that became inactive after the save", func(t *testing.T) {
		env := newLedgerEnv(t)
		cust := mkCustomer(t, env.app, "Later Dormant", "")
		entry := draftEntry(t, env.app, "2026-08-04")
		line := mustPartyLine(t, env.app, entry, env.checking, 0, map[string]any{"customer": cust.Id})
		makeCustomerInactive(t, env.app, cust)
		if err := setFields(t, env.app, "books_journal_lines", line.Id, map[string]any{"memo": "new memo"}); err != nil {
			t.Fatalf("memo-only update refused: %v", err)
		}
		stored := reload(t, env.app, "books_journal_lines", line.Id)
		if stored.GetString("memo") != "new memo" || stored.GetString("customer") != cust.Id {
			t.Fatalf("stored memo %q customer %q, want %q and %q",
				stored.GetString("memo"), stored.GetString("customer"), "new memo", cust.Id)
		}
	})

	t.Run("a replacement draft keeps the replaced entry's inactive party only", func(t *testing.T) {
		env := newLedgerEnv(t)
		kept := mkCustomer(t, env.app, "Kept Customer", "")
		other := mkCustomer(t, env.app, "Other Dormant", "")
		original := postedWithParties(t, env, kept.Id, "")
		makeCustomerInactive(t, env.app, kept)
		makeCustomerInactive(t, env.app, other)
		replacement := saveRecord(t, env.app, "books_journal_entries", map[string]any{
			"date": "2026-08-05", "status": "draft", "doc_type": "journal", "origin": "manual",
			"replaces": original.Id, "currency": "USD",
		})

		line, err := partyLine(env.app, replacement, env.checking, 0, map[string]any{"customer": kept.Id})
		if err != nil {
			t.Fatalf("a replacement line naming the replaced entry's party was refused: %v", err)
		}
		if got := reload(t, env.app, "books_journal_lines", line.Id).GetString("customer"); got != kept.Id {
			t.Fatalf("replacement line customer = %q, want %q", got, kept.Id)
		}
		_, err = partyLine(env.app, replacement, env.revenue, 1, map[string]any{"customer": other.Id})
		requireRefused(t, err, wantPartyInactive("Other Dormant"))
	})
}

func TestLinePartyMissing(t *testing.T) {
	env := newLedgerEnv(t)
	entry := draftEntry(t, env.app, "2026-08-04")
	_, err := partyLine(env.app, entry, env.checking, 0, map[string]any{"customer": "nocustomer00001"})
	requireSchemaRefusal(t, err, "customer")
}

func TestLinePartyFrozenAtPost(t *testing.T) {
	env := newLedgerEnv(t)
	first := mkCustomer(t, env.app, "First Customer", "")
	second := mkCustomer(t, env.app, "Second Customer", "")
	posted := postedWithParties(t, env, first.Id, "")

	var line *core.Record
	for _, l := range linesOf(t, env.app, posted.Id) {
		if l.GetInt("position") == 0 {
			line = l
		}
	}
	if line == nil {
		t.Fatal("posted entry has no line at position 0")
	}
	if got := line.GetString("customer"); got != first.Id {
		t.Fatalf("posted line customer = %q, want %q", got, first.Id)
	}
	err := setFields(t, env.app, "books_journal_lines", line.Id, map[string]any{"customer": second.Id})
	requireRefused(t, err, "is posted, so its lines cannot change")
	if got := reload(t, env.app, "books_journal_lines", line.Id).GetString("customer"); got != first.Id {
		t.Fatalf("after the refused change the customer is %q, want %q", got, first.Id)
	}
}

func TestReversalCopiesParty(t *testing.T) {
	for _, inactiveFirst := range []bool{false, true} {
		name := "active customer"
		if inactiveFirst {
			name = "customer made inactive before the void"
		}
		t.Run(name, func(t *testing.T) {
			env := newLedgerEnv(t)
			cust := mkCustomer(t, env.app, "Northwind Traders", "")
			vend := mkVendor(t, env.app, "Summit IT Services")
			posted := postedWithParties(t, env, cust.Id, vend.Id)
			if inactiveFirst {
				makeCustomerInactive(t, env.app, cust)
			}
			if err := setStatus(env.app, posted.Id, statusVoid, env.users.bookkeeper.Id); err != nil {
				t.Fatalf("void: %v", err)
			}
			rev := findReversal(t, env.app, posted.Id)
			byPosition := map[int]*core.Record{}
			for _, l := range linesOf(t, env.app, rev.Id) {
				byPosition[l.GetInt("position")] = l
			}
			if len(byPosition) != 2 {
				t.Fatalf("reversal has %d lines, want 2", len(byPosition))
			}
			if got := byPosition[0].GetString("customer"); got != cust.Id {
				t.Errorf("reversal line 0 customer = %q, want %q", got, cust.Id)
			}
			if got := byPosition[0].GetString("vendor"); got != "" {
				t.Errorf("reversal line 0 vendor = %q, want none", got)
			}
			if got := byPosition[1].GetString("vendor"); got != vend.Id {
				t.Errorf("reversal line 1 vendor = %q, want %q", got, vend.Id)
			}
			if got := byPosition[1].GetString("customer"); got != "" {
				t.Errorf("reversal line 1 customer = %q, want none", got)
			}
		})
	}
}

func TestPartyDeleteGuards(t *testing.T) {
	t.Run("a customer on a draft line", func(t *testing.T) {
		env := newLedgerEnv(t)
		cust := mkCustomer(t, env.app, "Draft Customer", "")
		mustPartyLine(t, env.app, draftEntry(t, env.app, "2026-08-04"), env.checking, 0, map[string]any{"customer": cust.Id})
		requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_customers", cust.Id)), wantPartyOnLines("Draft Customer"))
		reload(t, env.app, "books_customers", cust.Id)
	})

	t.Run("a customer on a posted line", func(t *testing.T) {
		env := newLedgerEnv(t)
		cust := mkCustomer(t, env.app, "Posted Customer", "")
		postedWithParties(t, env, cust.Id, "")
		requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_customers", cust.Id)), wantPartyOnLines("Posted Customer"))
		reload(t, env.app, "books_customers", cust.Id)
	})

	t.Run("a vendor on a draft line", func(t *testing.T) {
		env := newLedgerEnv(t)
		vend := mkVendor(t, env.app, "Draft Vendor")
		mustPartyLine(t, env.app, draftEntry(t, env.app, "2026-08-04"), env.checking, 0, map[string]any{"vendor": vend.Id})
		requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_vendors", vend.Id)), wantPartyOnLines("Draft Vendor"))
		reload(t, env.app, "books_vendors", vend.Id)
	})

	t.Run("a vendor on a posted line", func(t *testing.T) {
		env := newLedgerEnv(t)
		vend := mkVendor(t, env.app, "Posted Vendor")
		postedWithParties(t, env, "", vend.Id)
		requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_vendors", vend.Id)), wantPartyOnLines("Posted Vendor"))
		reload(t, env.app, "books_vendors", vend.Id)
	})

	t.Run("a customer and a vendor on no line delete", func(t *testing.T) {
		env := newLedgerEnv(t)
		named := mkCustomer(t, env.app, "Named Customer", "")
		postedWithParties(t, env, named.Id, "")
		cust := mkCustomer(t, env.app, "Unused Customer", "")
		vend := mkVendor(t, env.app, "Unused Vendor")
		if err := env.app.Delete(reload(t, env.app, "books_customers", cust.Id)); err != nil {
			t.Fatalf("delete a customer on no line: %v", err)
		}
		if err := env.app.Delete(reload(t, env.app, "books_vendors", vend.Id)); err != nil {
			t.Fatalf("delete a vendor on no line: %v", err)
		}
	})

	t.Run("the sub-customer refusal wins", func(t *testing.T) {
		env := newLedgerEnv(t)
		top := mkCustomer(t, env.app, "Parent Customer", "")
		mkCustomer(t, env.app, "Child Customer", top.Id)
		mustPartyLine(t, env.app, draftEntry(t, env.app, "2026-08-04"), env.checking, 0, map[string]any{"customer": top.Id})
		requireMessageOnlyRefusal(t, env.app.Delete(reload(t, env.app, "books_customers", top.Id)), msgDeleteHasSubs)
	})
}
