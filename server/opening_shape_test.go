package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// An opening entry has one line for each account, on asset, liability and
// equity accounts only, with no customer or vendor: the opening form cannot
// keep any other shape, and its next save would write a different balance.

func requireOpeningRefused(t *testing.T, env *ledgerEnv, entry *core.Record, want string) {
	t.Helper()
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""), want)
	if got := reload(t, env.app, "books_journal_entries", entry.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q, want draft", got)
	}
	if n, err := env.app.CountRecords("books_account_balances"); err != nil || n != 0 {
		t.Fatalf("a refused post wrote %d balance rows (err %v)", n, err)
	}
}

// The review's reproduction: two bank debits and one equity credit.
func TestOpeningShape_ARepeatedAccountIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	equity := openingEquity(t, env.app)
	entry := mkOpening(t, env.app, "2025-12-31", "",
		ln{env.checking, 10000, 0}, ln{env.checking, 20000, 0}, ln{equity, 0, 30000})
	requireOpeningRefused(t, env, entry, "Opening balances: line 2 repeats Checking. Enter one amount for each account.")
}

// A debit and a credit on one account are two lines too, even when they net to zero.
func TestOpeningShape_MixedSidesOnOneAccountAreRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mkOpening(t, env.app, "2025-12-31", "", ln{env.checking, 500, 0}, ln{env.checking, 0, 500})
	requireOpeningRefused(t, env, entry, "line 2 repeats Checking")
}

func TestOpeningShape_AnIncomeOrExpenseAccountIsRefused(t *testing.T) {
	for name, account := range map[string]func(*ledgerEnv) *core.Record{
		"income":  func(env *ledgerEnv) *core.Record { return env.revenue },
		"expense": func(env *ledgerEnv) *core.Record { return env.rent },
	} {
		t.Run(name, func(t *testing.T) {
			env := newLedgerEnv(t)
			pl := account(env)
			entry := mkOpening(t, env.app, "2025-12-31", "", ln{env.checking, 5000, 0}, ln{pl, 0, 5000})
			requireOpeningRefused(t, env, entry,
				fmt.Sprintf("Opening balances: line 2 is on %s, an income or expense account.", pl.GetString("name")))
		})
	}
}

func TestOpeningShape_ACustomerOrAVendorIsRefused(t *testing.T) {
	for _, party := range []struct{ field, collection string }{
		{"customer", "books_customers"},
		{"vendor", "books_vendors"},
	} {
		t.Run(party.field, func(t *testing.T) {
			env := newLedgerEnv(t)
			who := saveRecord(t, env.app, party.collection, map[string]any{"display_name": "Northwind"})
			entry := saveRecord(t, env.app, "books_journal_entries", map[string]any{
				"date": "2025-12-31", "status": "draft", "doc_type": "journal", "origin": "opening_balance",
			})
			saveRecord(t, env.app, "books_journal_lines", map[string]any{
				"entry": entry.Id, "account": env.checking.Id, "debit": 5000, "position": 0, party.field: who.Id,
			})
			saveRecord(t, env.app, "books_journal_lines", map[string]any{
				"entry": entry.Id, "account": openingEquity(t, env.app).Id, "credit": 5000, "position": 1,
			})
			requireOpeningRefused(t, env, entry, "Opening balances: line 1 names a customer or a vendor.")
		})
	}
}

// The shape is checked before the correction voids its original.
func TestOpeningShape_ARefusedCorrectionLeavesTheOriginalPosted(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.opening(t, "2025-12-31", "", 5000).Id, "")
	equity := openingEquity(t, env.app)
	correction := mkOpening(t, env.app, "2025-12-31", original.Id,
		ln{env.checking, 1000, 0}, ln{env.checking, 2000, 0}, ln{equity, 0, 3000})
	requireRefused(t, setStatus(env.app, correction.Id, statusPosted, ""), "line 2 repeats Checking")
	requireStillPosted(t, env.app, original.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2025-12"); d != 5000 || c != 0 {
		t.Fatalf("checking = %d/%d, want the original 5000/0", d, c)
	}
	requireNoDrift(t, env.app)
}

// Another origin is not held to the shape: a journal entry may repeat an account.
func TestOpeningShape_AJournalEntryMayRepeatAnAccount(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mkDraft(t, env.app, "2026-05-10",
		ln{env.checking, 100, 0}, ln{env.checking, 200, 0}, ln{env.revenue, 0, 300})
	mustPost(t, env.app, entry.Id, "")
	requireNoDrift(t, env.app)
}

// One batch: a line write that makes the repeat, then the post. The post is
// refused and the line write rolls back with it.
func TestOpeningShape_ABatchThatMakesARepeatChangesNothing(t *testing.T) {
	env := newLedgerEnv(t)
	enableBatch(t, env.app)
	entry := env.opening(t, "2025-12-31", "", 5000)
	saw := revisionOf(t, env.app, entry.Id)
	credit := lineWith(t, mustLines(t, env.app, entry.Id), false)

	ops := []string{
		lineCreateOp(entry.Id, env.checking, 700, 0, 2),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_lines/records/%s","body":{"credit":5700}}`, credit.Id),
		fmt.Sprintf(`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/%s","body":{"status":"posted","revision":%d}}`, entry.Id, saw+1),
	}
	apiReq{
		method: http.MethodPost, url: "/api/batch", token: tokenFor(t, env.users.bookkeeper),
		body: batchBody(ops...), want: http.StatusBadRequest, content: []string{"repeats Checking"},
	}.run(t, env.app)

	if n := len(mustLines(t, env.app, entry.Id)); n != 2 {
		t.Fatalf("lines = %d, want the 2 the draft had", n)
	}
	if got := revisionOf(t, env.app, entry.Id); got != saw {
		t.Fatalf("revision = %d, want %d", got, saw)
	}
}
