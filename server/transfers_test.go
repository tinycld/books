package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

const msgTransferAccountType = " cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account."

// requireStillDraft checks that a refused post left the entry a draft with no number.
func requireStillDraft(t testing.TB, app core.App, entryID string) {
	t.Helper()
	if e := reload(t, app, "books_journal_entries", entryID); e.GetString("status") != statusDraft || e.GetString("number") != "" {
		t.Errorf("entry after a refused post: %v", e.PublicExport())
	}
}

func TestTransfer_PostsWithItsOwnNumbers(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	sale := mustPost(t, env.app, env.sale(t, "2026-05-01", 1000).Id, env.users.bookkeeper.Id)
	if sale.GetString("number") != "1" {
		t.Fatalf("journal number %s, want 1", sale.GetString("number"))
	}
	first := transferDraft(t, env.app, "2026-05-10", env.checking, savings, 2500)
	if err := setStatus(env.app, first.Id, statusPosted, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the transfer: %v", err)
	}
	posted := reload(t, env.app, "books_journal_entries", first.Id)
	if posted.GetString("number") != "TR-1" || posted.GetInt("sequence") != 1 || posted.GetInt("total") != 2500 {
		t.Fatalf("transfer number %q sequence %d total %d, want TR-1, 1, 2500",
			posted.GetString("number"), posted.GetInt("sequence"), posted.GetInt("total"))
	}
	second := transferDraft(t, env.app, "2026-06-02", env.checking, savings, 100)
	if err := setStatus(env.app, second.Id, statusPosted, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("post the second transfer: %v", err)
	}
	if n := reload(t, env.app, "books_journal_entries", second.Id).GetString("number"); n != "TR-2" {
		t.Fatalf("second transfer number %s, want TR-2", n)
	}
	// The sale debited checking 1000 in May; the transfer credits it 2500.
	requireBalance(t, env.app, env.checking, "2026-05", 1000, 2500)
	requireBalance(t, env.app, savings, "2026-05", 2500, 0)
	requireNoDrift(t, env.app)
}

func TestTransfer_RefusesAnythingButTwoLines(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	card := mkAccount(t, env.app, "Visa", "credit_card", "credit_card")
	entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "transfer", "origin": "manual", "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": env.checking.Id, "credit": 100, "position": 0, "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": savings.Id, "debit": 50, "position": 1, "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": card.Id, "debit": 50, "position": 2, "currency": "USD",
	})
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id),
		"A transfer has two lines: the account the money comes from and the account it goes to.")
	requireStillDraft(t, env.app, entry.Id)
}

func TestTransfer_RefusesLineOneAsADebit(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "transfer", "origin": "manual", "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": env.checking.Id, "debit": 100, "position": 0, "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": savings.Id, "credit": 100, "position": 1, "currency": "USD",
	})
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id),
		"Line 1: a transfer moves money out of this account, so it takes a credit.")
	requireStillDraft(t, env.app, entry.Id)
}

func TestTransfer_RefusesTheSameAccountTwice(t *testing.T) {
	env := newLedgerEnv(t)
	entry := transferDraft(t, env.app, "2026-05-10", env.checking, env.checking, 100)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id),
		"Line 2: choose an account other than the one the money comes from.")
	requireStillDraft(t, env.app, entry.Id)
}

func TestTransfer_RefusesAccountTypesOutsideTheList(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	toRent := transferDraft(t, env.app, "2026-05-10", env.checking, env.rent, 100)
	requireRefused(t, setStatus(env.app, toRent.Id, statusPosted, env.users.bookkeeper.Id),
		"Line 2: Rent"+msgTransferAccountType)
	requireStillDraft(t, env.app, toRent.Id)

	receivable := mkAccount(t, env.app, "Accounts receivable", "accounts_receivable", "accounts_receivable")
	fromReceivable := transferDraft(t, env.app, "2026-05-10", receivable, savings, 100)
	requireRefused(t, setStatus(env.app, fromReceivable.Id, statusPosted, env.users.bookkeeper.Id),
		"Line 1: Accounts receivable"+msgTransferAccountType)
	requireStillDraft(t, env.app, fromReceivable.Id)
}

func TestTransfer_AcceptsEveryListedType(t *testing.T) {
	if len(transferAccountTypes) != 8 {
		t.Fatalf("transferAccountTypes has %d types, want 8: %v", len(transferAccountTypes), transferAccountTypes)
	}
	for _, key := range transferAccountTypes {
		t.Run(key, func(t *testing.T) {
			env := newLedgerEnv(t)
			savings := mkAccount(t, env.app, "Savings", "bank", "savings")
			at, ok := accountType(key)
			if !ok {
				t.Fatalf("%s is not an account type", key)
			}
			from := mkAccount(t, env.app, "From "+key, key, at.DetailTypes[0].Key)
			entry := transferDraft(t, env.app, "2026-05-10", from, savings, 100)
			if err := setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id); err != nil {
				t.Fatalf("a transfer from a %s account was refused: %v", key, err)
			}
			if s := reload(t, env.app, "books_journal_entries", entry.Id).GetString("status"); s != statusPosted {
				t.Fatalf("status %s, want posted", s)
			}
		})
	}
}

func TestTransfer_RefusesAutoReverse(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	entry := reload(t, env.app, "books_journal_entries",
		transferDraft(t, env.app, "2026-05-10", env.checking, savings, 100).Id)
	entry.Set("auto_reverse_on", "2026-06-10")
	if err := env.app.Save(entry); err != nil {
		t.Fatalf("set the auto-reverse date on the draft: %v", err)
	}
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, env.users.bookkeeper.Id),
		"A transfer cannot reverse automatically.")
	requireStillDraft(t, env.app, entry.Id)
}

func TestTransfer_RefusesAnOpeningBalanceOrigin(t *testing.T) {
	env := newLedgerEnv(t)
	_, err := saveNew(env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "transfer", "origin": "opening_balance", "currency": "USD",
	})
	requireRefused(t, err, "An opening balance entry cannot be a transfer.")
	if n, err := env.app.CountRecords("books_journal_entries"); err != nil || n != 0 {
		t.Fatalf("%d entries after the refusal (err %v), want 0", n, err)
	}
}

// A void's reversal mirrors the transfer, so its line 1 is a debit; the void
// succeeds only if the transfer rules skip a reversal.
func TestTransfer_VoidPostsATransferReversal(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	transfer := mustPost(t, env.app, transferDraft(t, env.app, "2026-05-10", env.checking, savings, 2500).Id, env.users.bookkeeper.Id)
	if err := setStatus(env.app, transfer.Id, statusVoid, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the transfer: %v", err)
	}
	if s := reload(t, env.app, "books_journal_entries", transfer.Id).GetString("status"); s != statusVoid {
		t.Fatalf("transfer status %s, want void", s)
	}
	rev, err := postedReversalOf(env.app, transfer.Id)
	if err != nil || rev == nil {
		t.Fatalf("posted reversal %v (err %v), want one", rev, err)
	}
	if rev.GetString("doc_type") != docTypeTransfer || rev.GetString("origin") != originVoidReversal || rev.GetString("number") != "TR-1" {
		t.Fatalf("reversal doc_type %q origin %q number %q, want transfer, void_reversal, TR-1",
			rev.GetString("doc_type"), rev.GetString("origin"), rev.GetString("number"))
	}
	requireBalance(t, env.app, env.checking, "2026-05", 2500, 2500)
	requireBalance(t, env.app, savings, "2026-05", 2500, 2500)
}

func TestTransfer_CorrectionKeepsTheNumber(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	original := mustPost(t, env.app, transferDraft(t, env.app, "2026-05-10", env.checking, savings, 2500).Id, env.users.bookkeeper.Id)
	if original.GetString("number") != "TR-1" {
		t.Fatalf("original number %s, want TR-1", original.GetString("number"))
	}
	correction := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-12", "status": "draft", "doc_type": "transfer", "origin": "manual", "currency": "USD",
		"replaces": original.Id,
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": correction.Id, "account": env.checking.Id, "credit": 3000, "position": 0, "currency": "USD",
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{
		"entry": correction.Id, "account": savings.Id, "debit": 3000, "position": 1, "currency": "USD",
	})
	corrected := mustPost(t, env.app, correction.Id, env.users.bookkeeper.Id)
	if corrected.GetString("number") != "TR-1" || corrected.GetInt("total") != 3000 {
		t.Fatalf("correction number %q total %d, want TR-1, 3000", corrected.GetString("number"), corrected.GetInt("total"))
	}
	if s := reload(t, env.app, "books_journal_entries", original.Id).GetString("status"); s != statusVoid {
		t.Fatalf("original status %s, want void", s)
	}

	journal := correctionDraft(t, env, corrected, "2026-05-13", 100)
	requireRefused(t, setStatus(env.app, journal.Id, statusPosted, env.users.bookkeeper.Id),
		"A correction must have the same document type as the entry it replaces.")
	if s := reload(t, env.app, "books_journal_entries", corrected.Id).GetString("status"); s != statusPosted {
		t.Fatalf("the transfer's status %s after a refused journal correction, want posted", s)
	}
}

func TestTransfer_NamesAndAuditLabels(t *testing.T) {
	env := newLedgerEnv(t)
	savings := mkAccount(t, env.app, "Savings", "bank", "savings")
	posted := mustPost(t, env.app, transferDraft(t, env.app, "2026-05-10", env.checking, savings, 100).Id, env.users.bookkeeper.Id)
	draft := reload(t, env.app, "books_journal_entries", transferDraft(t, env.app, "2026-11-04", env.checking, savings, 100).Id)
	journal := mustPost(t, env.app, env.sale(t, "2026-05-11", 100).Id, env.users.bookkeeper.Id)
	journalDraft := reload(t, env.app, "books_journal_entries", env.sale(t, "2026-11-05", 100).Id)
	cases := []struct {
		name            string
		entry           *core.Record
		wantName, label string
	}{
		{"posted transfer", posted, "Transfer TR-1", "Transfer TR-1"},
		{"transfer draft", draft, "This transfer", "Draft transfer 2026-11-04"},
		{"posted journal entry", journal, "Journal entry 1", "Journal entry 1"},
		{"journal draft", journalDraft, "This journal entry", "Draft journal entry 2026-11-05"},
	}
	for _, tc := range cases {
		if got := entryName(tc.entry); got != tc.wantName {
			t.Errorf("%s: entryName = %q, want %q", tc.name, got, tc.wantName)
		}
		if got := entryLabel(tc.entry); got != tc.label {
			t.Errorf("%s: entryLabel = %q, want %q", tc.name, got, tc.label)
		}
	}
}

func TestTransferAccountTypes_AreAccountTypes(t *testing.T) {
	want := []string{
		"bank", "other_current_asset", "fixed_asset", "other_asset",
		"credit_card", "other_current_liability", "long_term_liability", "equity",
	}
	if !slices.Equal(transferAccountTypes, want) {
		t.Fatalf("transferAccountTypes = %v, want %v", transferAccountTypes, want)
	}
	for _, key := range transferAccountTypes {
		if _, ok := accountType(key); !ok {
			t.Errorf("%s is not an account type", key)
		}
		if !isTransferAccountType(key) {
			t.Errorf("isTransferAccountType(%q) = false, want true", key)
		}
	}
	for _, key := range []string{"accounts_receivable", "accounts_payable", "income", "expense"} {
		if isTransferAccountType(key) {
			t.Errorf("isTransferAccountType(%q) = true, want false", key)
		}
	}
}
