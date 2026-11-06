package books

import (
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// saveConnection connects an account the way a Go caller does, and returns
// the save's error so a racing goroutine can read it.
func saveConnection(app core.App, accountID string) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_bank_connections")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("account", accountID)
	if err := app.Save(r); err != nil {
		return nil, err
	}
	return r, nil
}

func requireConnectionCount(t testing.TB, app core.App, accountID string, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_bank_connections", dbx.HashExp{"account": accountID})
	if err != nil {
		t.Fatalf("count connections: %v", err)
	}
	if n != want {
		t.Errorf("%d connections on account %s, want %d", n, accountID, want)
	}
}

func requireRecordExists(t testing.TB, app core.App, collection, id string) {
	t.Helper()
	if _, err := app.FindRecordById(collection, id); err != nil {
		t.Errorf("%s/%s is gone, want it kept: %v", collection, id, err)
	}
}

func requireRecordGone(t testing.TB, app core.App, collection, id string) {
	t.Helper()
	if _, err := app.FindRecordById(collection, id); err == nil {
		t.Errorf("%s/%s still exists, want it deleted", collection, id)
	}
}

// uploadDay is the day a duplicate refusal names: the stored row's created,
// in UTC.
func uploadDay(t testing.TB, app core.App, fileID string) string {
	t.Helper()
	return reload(t, app, "books_bank_files", fileID).GetDateTime("created").Time().UTC().Format("Jan 2, 2006")
}

func TestBankConnection_OnlyActiveBankOrCardAccounts(t *testing.T) {
	const notConnectable = "Only an active bank or credit card account can be connected."
	env := newBankEnv(t)
	inactiveBank := saveRecord(t, env.app, "books_accounts", map[string]any{
		"name": "Old Checking", "number": "1020", "type": "bank", "detail_type": "checking",
		"currency": "USD", "inactive": true,
	})
	expense := saveRecord(t, env.app, "books_accounts", map[string]any{
		"name": "Rent", "number": "6100", "type": "expense", "detail_type": "rent_lease", "currency": "USD",
	})
	for _, c := range []struct{ label, accountID string }{
		{"inactive bank account", inactiveBank.Id},
		{"expense account", expense.Id},
		{"unknown account", "zzzzzzzzzzzzzzz"},
	} {
		t.Run(c.label, func(t *testing.T) {
			_, err := saveConnection(env.app, c.accountID)
			requireRefused(t, err, notConnectable)
			requireConnectionCount(t, env.app, c.accountID, 0)
		})
	}
	t.Run("active credit card account", func(t *testing.T) {
		card := saveRecord(t, env.app, "books_accounts", map[string]any{
			"name": "Northwind Card", "number": "2100", "type": "credit_card", "detail_type": "credit_card", "currency": "USD",
		})
		if _, err := saveConnection(env.app, card.Id); err != nil {
			t.Fatalf("connect an active credit card account: %v", err)
		}
		requireConnectionCount(t, env.app, card.Id, 1)
	})
}

func TestBankConnection_OnePerAccount(t *testing.T) {
	env := newBankEnv(t)
	savings := env.savings(t)
	first, err := saveConnection(env.app, savings.Id)
	if err != nil {
		t.Fatalf("connect savings: %v", err)
	}
	_, err = saveConnection(env.app, savings.Id)
	requireRefused(t, err, "1010 Business Savings is already connected.")
	rows, err := env.app.FindAllRecords("books_bank_connections", dbx.HashExp{"account": savings.Id})
	if err != nil {
		t.Fatalf("find connections: %v", err)
	}
	if len(rows) != 1 || rows[0].Id != first.Id {
		t.Errorf("savings has %d connections, want only the first %s", len(rows), first.Id)
	}
}

func TestBankConnection_DisconnectDeletesWaitingFiles(t *testing.T) {
	env := newBankEnv(t)
	a := mustSaveBankFile(t, env.app, env.connection.Id, "sep-2026.csv", "h-sep", bankFileStatusUploaded)
	b := mustSaveBankFile(t, env.app, env.connection.Id, "oct-2026.csv", "h-oct", bankFileStatusUploaded)
	before := reload(t, env.app, "books_accounts", env.checking.Id)
	if err := env.app.Delete(reload(t, env.app, "books_bank_connections", env.connection.Id)); err != nil {
		t.Fatalf("disconnect with only uploaded files: %v", err)
	}
	requireRecordGone(t, env.app, "books_bank_connections", env.connection.Id)
	requireRecordGone(t, env.app, "books_bank_files", a.Id)
	requireRecordGone(t, env.app, "books_bank_files", b.Id)
	after := reload(t, env.app, "books_accounts", env.checking.Id)
	for _, field := range []string{"name", "number", "type", "detail_type", "inactive", "updated"} {
		if got, want := after.Get(field), before.Get(field); got != want {
			t.Errorf("account %s = %v after the disconnect, want %v", field, got, want)
		}
	}
}

func TestBankConnection_DisconnectRefusedOnceAFileIsImported(t *testing.T) {
	for _, status := range []string{"imported", "failed"} {
		t.Run(status, func(t *testing.T) {
			env := newBankEnv(t)
			waiting := mustSaveBankFile(t, env.app, env.connection.Id, "sep-2026.csv", "h-sep", bankFileStatusUploaded)
			done := mustSaveBankFile(t, env.app, env.connection.Id, "oct-2026.csv", "h-oct", status)
			err := env.app.Delete(reload(t, env.app, "books_bank_connections", env.connection.Id))
			requireRefused(t, err, "1000 Business Checking has imported transactions, so it cannot be disconnected.")
			requireRecordExists(t, env.app, "books_bank_connections", env.connection.Id)
			requireRecordExists(t, env.app, "books_bank_files", waiting.Id)
			requireRecordExists(t, env.app, "books_bank_files", done.Id)
		})
	}
}

func TestBankFile_RefusesAMissingConnection(t *testing.T) {
	env := newBankEnv(t)
	_, err := saveBankFile(env.app, "zzzzzzzzzzzzzzz", "oct-2026.csv", "h-oct", bankFileStatusUploaded)
	requireRefused(t, err, "The bank account connection does not exist.")
	if n, err := env.app.CountRecords("books_bank_files"); err != nil || n != 0 {
		t.Errorf("%d bank files after a refused create (err %v), want 0", n, err)
	}
}

func TestBankFile_RefusesTheSameBytesTwice(t *testing.T) {
	env := newBankEnv(t)
	savings := env.savings(t)
	other, err := saveConnection(env.app, savings.Id)
	if err != nil {
		t.Fatalf("connect savings: %v", err)
	}
	const hash = "h-oct-2026"
	stored := mustSaveBankFile(t, env.app, env.connection.Id, "oct-2026.csv", hash, bankFileStatusUploaded)
	_, err = saveBankFile(env.app, other.Id, "copy.csv", hash, bankFileStatusUploaded)
	requireRefused(t, err, "oct-2026.csv was already uploaded to 1000 Business Checking on "+uploadDay(t, env.app, stored.Id)+".")
	if n, err := env.app.CountRecords("books_bank_files", dbx.HashExp{"content_hash": hash}); err != nil || n != 1 {
		t.Errorf("%d files with the hash (err %v), want only the stored one", n, err)
	}
	if _, err := saveBankFile(env.app, other.Id, "nov-2026.csv", "h-nov-2026", bankFileStatusUploaded); err != nil {
		t.Errorf("a file with another hash was refused: %v", err)
	}
}

// Two uploads of the same bytes: the second must see the first and be refused
// with the message, not reach the unique index.
func TestRace_TheSameFileUploadedTwice(t *testing.T) {
	env := newBankEnv(t)
	raced := bindRace(t, env.app.OnRecordCreate("books_bank_files"), func() error {
		_, err := saveBankFile(env.app, env.connection.Id, "b.csv", "h1", bankFileStatusUploaded)
		return err
	})
	if _, err := saveBankFile(env.app, env.connection.Id, "a.csv", "h1", bankFileStatusUploaded); err != nil {
		t.Fatalf("the first upload: %v", err)
	}
	requireRefused(t, raced(), "a.csv was already uploaded to")
	if n, err := env.app.CountRecords("books_bank_files", dbx.HashExp{"content_hash": "h1"}); err != nil || n != 1 {
		t.Errorf("%d files with hash h1 (err %v), want 1", n, err)
	}
}

// Two connects of one account: the second must see the first and be refused
// with the message, not reach the unique index.
func TestRace_TheSameAccountConnectedTwice(t *testing.T) {
	env := newBankEnv(t)
	savings := env.savings(t)
	raced := bindRace(t, env.app.OnRecordCreate("books_bank_connections"), func() error {
		_, err := saveConnection(env.app, savings.Id)
		return err
	})
	if _, err := saveConnection(env.app, savings.Id); err != nil {
		t.Fatalf("the first connect: %v", err)
	}
	requireRefused(t, raced(), "1010 Business Savings is already connected.")
	requireConnectionCount(t, env.app, savings.Id, 1)
}

func TestAccountGuards_RefuseAConnectedAccount(t *testing.T) {
	env := newBankEnv(t)
	app := env.app
	id := env.checking.Id

	retyped := reload(t, app, "books_accounts", id)
	retyped.Set("type", "other_current_asset")
	retyped.Set("detail_type", "other_current_asset")
	requireRefused(t, app.Save(retyped),
		"1000 Business Checking is connected to Banking, so its type cannot change. Disconnect it first.")
	if got := reload(t, app, "books_accounts", id).GetString("type"); got != "bank" {
		t.Errorf("type = %q after a refused change, want bank", got)
	}

	inactive := reload(t, app, "books_accounts", id)
	inactive.Set("inactive", true)
	requireRefused(t, app.Save(inactive),
		"1000 Business Checking is connected to Banking. Disconnect it before making it inactive.")
	if reload(t, app, "books_accounts", id).GetBool("inactive") {
		t.Error("the connected account was made inactive")
	}

	requireRefused(t, app.Delete(reload(t, app, "books_accounts", id)),
		"1000 Business Checking is connected to Banking. Disconnect it before deleting it.")
	requireRecordExists(t, app, "books_accounts", id)

	if err := app.Delete(reload(t, app, "books_bank_connections", env.connection.Id)); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	inactive = reload(t, app, "books_accounts", id)
	inactive.Set("inactive", true)
	if err := app.Save(inactive); err != nil {
		t.Fatalf("make the disconnected account inactive: %v", err)
	}
	if err := app.Delete(reload(t, app, "books_accounts", id)); err != nil {
		t.Fatalf("delete the disconnected account: %v", err)
	}
	requireRecordGone(t, app, "books_accounts", id)
}

func TestBankAccountTypes_AreAccountTypes(t *testing.T) {
	if want := []string{"bank", "credit_card"}; !slices.Equal(bankAccountTypes, want) {
		t.Errorf("bankAccountTypes = %v, want %v", bankAccountTypes, want)
	}
	for _, key := range bankAccountTypes {
		if _, ok := accountType(key); !ok {
			t.Errorf("bank account type %q is not an account type", key)
		}
		if !isBankAccountType(key) {
			t.Errorf("isBankAccountType(%q) = false, want true", key)
		}
	}
	for _, key := range []string{"other_current_asset", "expense", ""} {
		if isBankAccountType(key) {
			t.Errorf("isBankAccountType(%q) = true, want false", key)
		}
	}
}
