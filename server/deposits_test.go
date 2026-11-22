package books

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The bank deposit guards (bank deposit spec §3.7, §4.1): a draft deposit
// names an active bank account and a real day; its items are posted lines on
// an Undeposited funds account, each once, at most 500; its other funds lines
// name an active account that is not Accounts receivable, Accounts payable or
// the Deposit to, a signed amount other than 0 within the stored limit and at
// most one party, at most 100; items and lines change only on a draft; the
// Books-written fields are the server's.

// The refusal texts of the deposit guards, as the client gets them (PocketBase
// adds a final period). Written out here, not read from the consts, so a change
// of wording fails this file too.
const (
	wantDepositTooManyItems   = "A deposit holds at most 500 items."
	wantDepositTooManyLines   = "A deposit holds at most 100 other funds lines."
	wantDepositAmountNotZero  = "Enter an amount other than 0."
	wantDepositTotalAboveZero = "The deposit total must be above $0.00."

	depositsCol       = "books_deposits"
	depositItemsCol   = "books_deposit_items"
	depositLinesCol   = "books_deposit_lines"
	undepositedView   = "books_undeposited_items"
	depositSequenceID = "booksseqdeposit"
	depositCasesFile  = "testdata/deposit_cases.json"
	depositItemDay    = "2026-11-10"
	depositDay        = "2026-11-16"
	depositMissingID  = "zzzzzzzzzzzzzzz"
)

// wantItemVoid is the posting refusal of an item whose entry is not posted or
// is a void reversal: "Payment 1004 is void."
func wantItemVoid(name string) string { return name + " is void." }

func wantItemInDeposit(name, deposit string) string {
	return fmt.Sprintf("%s is already in Deposit %s.", name, deposit)
}

func wantItemAfterDepositDate(name string) string {
	return name + " is dated after the deposit date."
}

// wantItemHeld is the deposited-item guard's refusal of a void or an edit.
func wantItemHeld(name, deposit string) string {
	return fmt.Sprintf("%s is in Deposit %s. Remove it from the deposit first.", name, deposit)
}

// sentText is a case text as PocketBase sends it: with a final period.
func sentText(s string) string {
	if strings.HasSuffix(s, ".") {
		return s
	}
	return s + "."
}

// depositEnv is a book with every ledger hook and the deposit guards bound, on
// the accounts of the e2e book a deposit reads: 1000 Business Checking and 1010
// Business Savings (banks), 1100 Accounts receivable, 1200 Undeposited funds,
// 1250 Cash to deposit (a second Undeposited funds account), 2000 Accounts
// payable, 3900 Retained earnings, 4000 Consulting Income, 4900 Interest
// earned, 6100 Rent and 6300 Bank charges and fees; Harborview Dental and
// Pacific Power.
type depositEnv struct {
	app                                    *tests.TestApp
	users                                  levelUsers
	checking, savings, receivable, payable *core.Record
	undeposited, undeposited2              *core.Record
	revenue, interest, rent, fees          *core.Record
	customer, vendor                       *core.Record
}

func newDepositEnv(t *testing.T) *depositEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	registerDepositGuards(app)
	return depositEnvOn(t, app)
}

func depositEnvOn(t *testing.T, app *tests.TestApp) *depositEnv {
	t.Helper()
	de := &depositEnv{
		app:          app,
		users:        newLevelUsers(t, app),
		checking:     mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking"),
		savings:      mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings"),
		receivable:   mkNumberedAccount(t, app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		undeposited:  mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds"),
		undeposited2: mkNumberedAccount(t, app, "Cash to deposit", "1250", "other_current_asset", "undeposited_funds"),
		payable:      mkNumberedAccount(t, app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
		revenue:      mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income"),
		interest:     mkNumberedAccount(t, app, "Interest earned", "4900", "other_income", "interest_earned"),
		rent:         mkNumberedAccount(t, app, "Rent", "6100", "expense", "rent_lease"),
		fees:         mkNumberedAccount(t, app, "Bank charges and fees", "6300", "expense", "bank_charges"),
	}
	mkRetainedEarnings(t, app, "3900")
	de.customer = mkCustomer(t, app, "Harborview Dental", "")
	de.vendor = mkVendor(t, app, "Pacific Power")
	return de
}

// undepositedItem posts a journal entry dated day with one line of amount on
// account (a debit when amount is above 0, a credit when below) naming the
// customer, and the other side on Consulting Income or Rent, and returns the
// line on account.
func (de *depositEnv) undepositedItem(t *testing.T, account *core.Record, day string, amount int, memo string) *core.Record {
	t.Helper()
	first := jnLine{account: account, memo: memo, customer: de.customer.Id}
	second := jnLine{position: 1}
	if amount >= 0 {
		first.debit = amount
		second.account, second.credit = de.revenue, amount
	} else {
		first.credit = -amount
		second.account, second.debit = de.rent, -amount
	}
	entry := postJournal(t, de.app, "", day, memo, first, second)
	return lineOn(t, de.app, entry.Id, account)
}

// journalName is a posted journal entry's name in a refusal: "Journal entry 3".
func journalName(t testing.TB, app core.App, line *core.Record) string {
	t.Helper()
	return "Journal entry " + reload(t, app, "books_journal_entries", line.GetString("entry")).GetString("number")
}

// newDeposit saves a draft deposit through the app, so every guard runs, with
// the fields given over a valid default (1000 Business Checking, depositDay),
// and returns what the guards said.
func (de *depositEnv) newDeposit(fields map[string]any) (*core.Record, error) {
	all := map[string]any{"status": statusDraft, "date": depositDay, "deposit_to": de.checking.Id}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(de.app, depositsCol, all)
}

func (de *depositEnv) mkDeposit(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := de.newDeposit(fields)
	if err != nil {
		t.Fatalf("save a draft deposit: %v", err)
	}
	return r
}

// newDepositItem saves one item of deposit for line at position through the
// app.
func newDepositItem(app core.App, deposit, line *core.Record, position int) (*core.Record, error) {
	return saveNew(app, depositItemsCol, map[string]any{"deposit": deposit.Id, "line": line.Id, "position": position})
}

func mkDepositItem(t testing.TB, app core.App, deposit, line *core.Record, position int) *core.Record {
	t.Helper()
	r, err := newDepositItem(app, deposit, line, position)
	if err != nil {
		t.Fatalf("save deposit item %d: %v", position+1, err)
	}
	return r
}

// newDepositLine saves one other funds line of deposit at position through the
// app, with the fields given (account, amount, description, customer, vendor).
func newDepositLine(app core.App, deposit *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"deposit": deposit.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, depositLinesCol, all)
}

func mkDepositLine(t testing.TB, app core.App, deposit *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newDepositLine(app, deposit, position, fields)
	if err != nil {
		t.Fatalf("save deposit line %d: %v", position+1, err)
	}
	return r
}

// postDepositAs posts a draft deposit as actor, as the client's PATCH
// {"status":"posted"} does once the request hook has stamped the poster.
func postDepositAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById(depositsCol, id)
	if err != nil {
		return err
	}
	r.Set("status", statusPosted)
	r.Set("posted_by", actor)
	return app.Save(r)
}

func mustPostDeposit(t testing.TB, app core.App, id, actor string) *core.Record {
	t.Helper()
	if err := postDepositAs(app, id, actor); err != nil {
		t.Fatalf("post deposit %s: %v", id, err)
	}
	return reload(t, app, depositsCol, id)
}

func voidDepositAs(app core.App, id, actor string) error {
	r, err := app.FindRecordById(depositsCol, id)
	if err != nil {
		return err
	}
	r.Set("status", statusVoid)
	r.Set("voided_by", actor)
	return app.Save(r)
}

// setDepositStatus writes status straight to the table, past every hook, so a
// guard test holds a posted or void deposit without posting it.
func setDepositStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_deposits SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set deposit %s %s: %v", id, status, err)
	}
}

// postedDepositOf saves a draft deposit to bank with one item per line and one
// other funds line per lines entry, and posts it as the bookkeeper.
func postedDepositOf(t testing.TB, app core.App, actor string, bank *core.Record, day string, items []*core.Record, lines ...map[string]any) *core.Record {
	t.Helper()
	d, err := saveNew(app, depositsCol, map[string]any{"status": statusDraft, "date": day, "deposit_to": bank.Id})
	if err != nil {
		t.Fatalf("save a draft deposit: %v", err)
	}
	for i, line := range items {
		mkDepositItem(t, app, d, line, i)
	}
	for i, l := range lines {
		mkDepositLine(t, app, d, i, l)
	}
	return mustPostDeposit(t, app, d.Id, actor)
}

func (de *depositEnv) postedDeposit(t testing.TB, items []*core.Record, lines ...map[string]any) *core.Record {
	t.Helper()
	return postedDepositOf(t, de.app, de.users.bookkeeper.Id, de.checking, depositDay, items, lines...)
}

func requireDepositCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords(depositsCol); err != nil || n != want {
		t.Errorf("%d deposits stored (err %v), want %d", n, err, want)
	}
}

func requireDepositRows(t testing.TB, app core.App, collection string, deposit *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords(collection, dbx.HashExp{"deposit": deposit.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d %s rows of the deposit, want %d", n, collection, want)
	}
}

// requireRefusedOnEither asserts a refusal keyed by one of two fields (a line
// that names both a customer and a vendor is refused on either).
func requireRefusedOnEither(t testing.TB, err error, a, b string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a refusal on %s or %s, got none", a, b)
	}
	var verrs validation.Errors
	if errors.As(err, &verrs) {
		if _, ok := verrs[a]; ok {
			return
		}
		if _, ok := verrs[b]; ok {
			return
		}
		t.Fatalf("schema refusal %v names neither %s nor %s", verrs, a, b)
	}
	apiErr := apiErrorOf(t, err)
	if _, ok := apiErr.Data[a]; ok {
		return
	}
	if _, ok := apiErr.Data[b]; !ok {
		t.Fatalf("refusal %q (data %v) names neither %s nor %s", apiErr.Message, apiErr.Data, a, b)
	}
}

// --- Deposit to and the date ---

func TestDeposit_DraftSaves(t *testing.T) {
	de := newDepositEnv(t)
	r := de.mkDeposit(t, map[string]any{"memo": "Friday bank run"})
	stored := reload(t, de.app, depositsCol, r.Id)
	if got, want := [5]any{stored.GetString("status"), stored.GetString("date"), stored.GetString("deposit_to"), stored.GetString("memo"), stored.GetString("number")},
		[5]any{statusDraft, depositDay, de.checking.Id, "Friday bank run", ""}; got != want {
		t.Errorf("stored status/date/deposit_to/memo/number = %v, want %v", got, want)
	}
}

func TestDeposit_DepositToIsAnActiveBankAccount(t *testing.T) {
	de := newDepositEnv(t)
	_, err := de.newDeposit(map[string]any{"deposit_to": depositMissingID})
	requireRefusedOnField(t, err, "deposit_to")

	oldBank := mkNumberedAccount(t, de.app, "Old Checking", "1020", "bank", "checking")
	makeAccountInactive(t, de.app, oldBank)
	_, err = de.newDeposit(map[string]any{"deposit_to": oldBank.Id})
	requireRefusedOnField(t, err, "deposit_to")

	for _, notBank := range []*core.Record{de.undeposited, de.revenue, de.receivable} {
		_, err = de.newDeposit(map[string]any{"deposit_to": notBank.Id})
		requireRefusedOnField(t, err, "deposit_to")
	}
	requireDepositCount(t, de.app, 0)

	// The guard holds on an update too.
	r := de.mkDeposit(t, map[string]any{"deposit_to": de.savings.Id})
	requireRefusedOnField(t, setFields(t, de.app, depositsCol, r.Id, map[string]any{"deposit_to": de.undeposited.Id}), "deposit_to")
	if got := reload(t, de.app, depositsCol, r.Id).GetString("deposit_to"); got != de.savings.Id {
		t.Errorf("deposit_to = %q after the refusal, want 1010 Business Savings", got)
	}
}

func TestDeposit_RefusesADateThatIsNotARealDay(t *testing.T) {
	de := newDepositEnv(t)
	for _, day := range []string{"2026-13-40", "2026-02-30", ""} {
		_, err := de.newDeposit(map[string]any{"date": day})
		requireRefusedOnField(t, err, "date")
	}
	requireDepositCount(t, de.app, 0)
}

// --- Items ---

// An item is a posted line on an Undeposited funds account, once per deposit.
func TestDepositItem_LineOnAnUndepositedFundsAccount(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	onFunds := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check from Harborview")
	onSecond := de.undepositedItem(t, de.undeposited2, depositItemDay, 2500, "Cash box")
	mkDepositItem(t, de.app, d, onFunds, 0)
	mkDepositItem(t, de.app, d, onSecond, 1)

	// The other side of the same entry is on Consulting Income.
	_, err := newDepositItem(de.app, d, lineOn(t, de.app, onFunds.GetString("entry"), de.revenue), 2)
	requireRefusedOnField(t, err, "items.2")

	// A line on a bank account is not an undeposited item.
	bankEntry := postJournal(t, de.app, "", depositItemDay, "Owner draw",
		jnLine{account: de.rent, debit: 700}, jnLine{account: de.checking, credit: 700, position: 1})
	_, err = newDepositItem(de.app, d, lineOn(t, de.app, bankEntry.Id, de.checking), 2)
	requireRefusedOnField(t, err, "items.2")
	requireDepositRows(t, de.app, depositItemsCol, d, 2)
}

func TestDepositItem_RefusesTheSameLineTwice(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check from Harborview")
	mkDepositItem(t, de.app, d, line, 0)
	_, err := newDepositItem(de.app, d, line, 1)
	requireRefusedOnField(t, err, "items.1")
	requireDepositRows(t, de.app, depositItemsCol, d, 1)

	// The same line on another draft is not a second item of this deposit.
	other := de.mkDeposit(t, nil)
	mkDepositItem(t, de.app, other, line, 0)
}

// A deposit's own entry and a void reversal are not undeposited items: the
// item guard refuses their lines.
func TestDepositItem_RefusesADepositsOwnEntryAndAVoidReversal(t *testing.T) {
	de := newDepositEnv(t)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check from Harborview")
	first := de.postedDeposit(t, []*core.Record{line})
	ownLine := lineOn(t, de.app, first.GetString("entry"), de.undeposited)

	d := de.mkDeposit(t, nil)
	_, err := newDepositItem(de.app, d, ownLine, 0)
	requireRefusedOnField(t, err, "items.0")

	voided := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Bounced check")
	voidEntryAs(t, de.app, voided.GetString("entry"), de.users.bookkeeper.Id)
	reversal := findReversal(t, de.app, voided.GetString("entry"))
	_, err = newDepositItem(de.app, d, lineOn(t, de.app, reversal.Id, de.undeposited), 0)
	requireRefusedOnField(t, err, "items.0")
	requireDepositRows(t, de.app, depositItemsCol, d, 0)
}

// The 501st item is refused. 499 items are written before the guards are
// bound, so the test does not post 501 entries through every hook; the guard
// counts what is stored.
func TestDepositItem_RefusesThe501st(t *testing.T) {
	app := newBooksApp(t)
	bank := mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking")
	funds := mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")
	revenue := mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income")
	entry := saveRecord(t, app, "books_journal_entries", map[string]any{
		"date": depositItemDay, "status": statusPosted, "doc_type": "journal", "origin": "manual",
		"number": "1", "sequence": 1, "total": 50100, "currency": "USD",
	})
	lines := make([]*core.Record, 501)
	for i := range lines {
		lines[i] = saveRecord(t, app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": funds.Id, "debit": 100, "position": i, "posted": true, "date": depositItemDay, "currency": "USD",
		})
	}
	saveRecord(t, app, "books_journal_lines", map[string]any{
		"entry": entry.Id, "account": revenue.Id, "credit": 50100, "position": 501, "posted": true, "date": depositItemDay, "currency": "USD",
	})
	d := saveRecord(t, app, depositsCol, map[string]any{"status": statusDraft, "date": depositDay, "deposit_to": bank.Id, "currency": "USD"})
	for i := 0; i < 499; i++ {
		saveRecord(t, app, depositItemsCol, map[string]any{"deposit": d.Id, "line": lines[i].Id, "position": i})
	}
	registerLedger(app)
	registerDepositGuards(app)

	mkDepositItem(t, app, d, lines[499], 499)
	_, err := newDepositItem(app, d, lines[500], 500)
	requireRefusalText(t, err, wantDepositTooManyItems)
	requireDepositRows(t, app, depositItemsCol, d, 500)
}

// The server copies an item's line, its entry and its source document onto the
// item when it is created, so the read view and a correction read one
// collection.
func TestDepositItem_CopiesTheLineEntryAndDocument(t *testing.T) {
	for _, kind := range depositSourceKinds {
		t.Run(kind, func(t *testing.T) {
			src := depositSourcePosters[kind](t)
			d, err := saveNew(src.app, depositsCol, map[string]any{"status": statusDraft, "date": depositDay, "deposit_to": src.bank.Id})
			if err != nil {
				t.Fatalf("save a draft deposit: %v", err)
			}
			item := reload(t, src.app, depositItemsCol, mkDepositItem(t, src.app, d, src.line, 0).Id)
			entry := src.entry
			got := map[string]any{
				"entry": item.GetString("entry"), "account": item.GetString("account"),
				"customer": item.GetString("customer"), "vendor": item.GetString("vendor"),
				"amount": item.GetInt("amount"), "date": item.GetString("date"),
				"doc_type": item.GetString("doc_type"), "number": item.GetString("number"),
				"document": item.GetString("document"), "payment_method": item.GetString("payment_method"),
				"reference_no": item.GetString("reference_no"), "posted": item.GetBool("posted"),
			}
			want := map[string]any{
				"entry": entry.Id, "account": src.undeposited.Id,
				"customer": src.customer, "vendor": src.vendor,
				"amount": src.amount, "date": entry.GetString("date"),
				"doc_type": kind, "number": entry.GetString("number"),
				"document": entry.GetString("document"), "payment_method": src.method,
				"reference_no": src.reference, "posted": false,
			}
			for k, w := range want {
				if got[k] != w {
					t.Errorf("item %s = %#v, want %#v", k, got[k], w)
				}
			}
		})
	}
}

// --- Other funds lines ---

func TestDepositLine_RefusesAMissingAccount(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	_, err := newDepositLine(de.app, d, 0, map[string]any{"account": depositMissingID, "amount": 1240})
	requireRefusedOnField(t, err, "lines.0.account")
	_, err = newDepositLine(de.app, d, 0, map[string]any{"account": "", "amount": 1240})
	requireRefusedOnEither(t, err, "lines.0.account", "account")
	requireDepositRows(t, de.app, depositLinesCol, d, 0)
}

// The key names the line's rank among the deposit's lines, not its position.
func TestDepositLine_KeyIsTheRankOfTheLine(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	mkDepositLine(t, de.app, d, 3, map[string]any{"account": de.interest.Id, "amount": 1240})
	_, err := newDepositLine(de.app, d, 7, map[string]any{"account": de.interest.Id, "amount": 0})
	requireFieldRefusal(t, err, "lines.1.amount", wantDepositAmountNotZero)
}

func TestDepositLine_AmountIsSignedAndWithinTheLimit(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	_, err := newDepositLine(de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 0})
	requireFieldRefusal(t, err, "lines.0.amount", wantDepositAmountNotZero)
	_, err = newDepositLine(de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": maxStoredAmount + 1})
	requireRefusedOnField(t, err, "lines.0.amount")
	_, err = newDepositLine(de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": -(maxStoredAmount + 1)})
	requireRefusedOnField(t, err, "lines.0.amount")
	requireDepositRows(t, de.app, depositLinesCol, d, 0)

	fee := mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.fees.Id, "amount": -2000, "description": "Cash kept back"})
	big := mkDepositLine(t, de.app, d, 1, map[string]any{"account": de.interest.Id, "amount": maxStoredAmount})
	if got := reload(t, de.app, depositLinesCol, fee.Id).GetInt("amount"); got != -2000 {
		t.Errorf("stored fee amount %d, want -2000", got)
	}
	if got := reload(t, de.app, depositLinesCol, big.Id).GetInt("amount"); got != maxStoredAmount {
		t.Errorf("stored amount %d, want maxStoredAmount", got)
	}
}

// A line names at most one party, and the party exists.
func TestDepositLine_Parties(t *testing.T) {
	de := newDepositEnv(t)
	d := de.mkDeposit(t, nil)
	_, err := newDepositLine(de.app, d, 0, map[string]any{
		"account": de.interest.Id, "amount": 1240, "customer": de.customer.Id, "vendor": de.vendor.Id,
	})
	requireRefusedOnEither(t, err, "lines.0.customer", "lines.0.vendor")
	_, err = newDepositLine(de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240, "customer": depositMissingID})
	requireRefusedOnField(t, err, "lines.0.customer")
	_, err = newDepositLine(de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240, "vendor": depositMissingID})
	requireRefusedOnField(t, err, "lines.0.vendor")
	requireDepositRows(t, de.app, depositLinesCol, d, 0)

	withCustomer := mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240, "customer": de.customer.Id})
	withVendor := mkDepositLine(t, de.app, d, 1, map[string]any{"account": de.fees.Id, "amount": -500, "vendor": de.vendor.Id})
	if reload(t, de.app, depositLinesCol, withCustomer.Id).GetString("customer") != de.customer.Id ||
		reload(t, de.app, depositLinesCol, withVendor.Id).GetString("vendor") != de.vendor.Id {
		t.Error("a line with one party did not keep it")
	}
}

// The 101st line is refused. 99 lines are written before the guards are bound.
func TestDepositLine_RefusesThe101st(t *testing.T) {
	app := newBooksApp(t)
	bank := mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking")
	interest := mkNumberedAccount(t, app, "Interest earned", "4900", "other_income", "interest_earned")
	d := saveRecord(t, app, depositsCol, map[string]any{"status": statusDraft, "date": depositDay, "deposit_to": bank.Id, "currency": "USD"})
	for i := 0; i < 99; i++ {
		saveRecord(t, app, depositLinesCol, map[string]any{"deposit": d.Id, "account": interest.Id, "amount": 100, "position": i})
	}
	registerLedger(app)
	registerDepositGuards(app)

	mkDepositLine(t, app, d, 99, map[string]any{"account": interest.Id, "amount": 100})
	_, err := newDepositLine(app, d, 100, map[string]any{"account": interest.Id, "amount": 100})
	requireRefusalText(t, err, wantDepositTooManyLines)
	requireDepositRows(t, app, depositLinesCol, d, 100)
}

// --- Items and lines change only on a draft ---

func TestDepositRows_FixedOnAPostedOrVoidDeposit(t *testing.T) {
	for _, status := range []string{statusPosted, statusVoid} {
		t.Run(status, func(t *testing.T) {
			de := newDepositEnv(t)
			first := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
			second := de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two")
			d := de.mkDeposit(t, nil)
			item := mkDepositItem(t, de.app, d, first, 0)
			line := mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240})
			setDepositStatus(t, de.app, d.Id, status)

			_, err := newDepositItem(de.app, d, second, 1)
			if err == nil {
				t.Error("an item was added to a " + status + " deposit")
			}
			if err := setFields(t, de.app, depositItemsCol, item.Id, map[string]any{"line": second.Id}); err == nil {
				t.Error("an item of a " + status + " deposit was changed")
			}
			if err := de.app.Delete(reload(t, de.app, depositItemsCol, item.Id)); err == nil {
				t.Error("an item of a " + status + " deposit was deleted")
			}
			_, err = newDepositLine(de.app, d, 1, map[string]any{"account": de.interest.Id, "amount": 500})
			if err == nil {
				t.Error("a line was added to a " + status + " deposit")
			}
			if err := setFields(t, de.app, depositLinesCol, line.Id, map[string]any{"amount": 9999}); err == nil {
				t.Error("a line of a " + status + " deposit was changed")
			}
			if err := de.app.Delete(reload(t, de.app, depositLinesCol, line.Id)); err == nil {
				t.Error("a line of a " + status + " deposit was deleted")
			}

			requireDepositRows(t, de.app, depositItemsCol, d, 1)
			requireDepositRows(t, de.app, depositLinesCol, d, 1)
			if got := reload(t, de.app, depositItemsCol, item.Id).GetString("line"); got != first.Id {
				t.Errorf("item line = %q after the refusals, want the first line", got)
			}
			if got := reload(t, de.app, depositLinesCol, line.Id).GetInt("amount"); got != 1240 {
				t.Errorf("line amount = %d after the refusals, want 1240", got)
			}
		})
	}
}

// A posted deposit changes only to void.
func TestDeposit_PostedIsNotChanged(t *testing.T) {
	de := newDepositEnv(t)
	d := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")})
	for name, fields := range map[string]map[string]any{
		"memo":       {"memo": "Changed"},
		"date":       {"date": "2026-11-20"},
		"deposit_to": {"deposit_to": de.savings.Id},
		"to draft":   {"status": statusDraft},
	} {
		if err := setFields(t, de.app, depositsCol, d.Id, fields); err == nil {
			t.Errorf("a posted deposit's %s change was saved", name)
		}
	}
	stored := reload(t, de.app, depositsCol, d.Id)
	if stored.GetString("status") != statusPosted || stored.GetString("date") != depositDay || stored.GetString("deposit_to") != de.checking.Id {
		t.Errorf("status %q date %q deposit_to %q after the refusals, want posted, %s, 1000",
			stored.GetString("status"), stored.GetString("date"), stored.GetString("deposit_to"), depositDay)
	}
}

// --- REST: the server fields, a reader, an item update and deletes ---

// The create rules pin the server fields for REST, and a reader cannot create.
func TestDeposit_ServerFieldsAreRefusedOverREST(t *testing.T) {
	de := newDepositEnv(t)
	client := newRestClient(t, de.app)
	line := de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")
	sale := postJournal(t, de.app, "", depositItemDay, "Other", jnLine{account: de.checking, debit: 100}, jnLine{account: de.revenue, credit: 100, position: 1})
	depositURL := collectionURL(depositsCol)
	body := func(extra string) string {
		return fmt.Sprintf(`{"status":"draft","date":%q,"deposit_to":%q%s}`, depositDay, de.checking.Id, extra)
	}

	status, out := client.send(t, de.users.bookkeeper, http.MethodPost, depositURL, body(""))
	if status != http.StatusOK {
		t.Fatalf("a bookkeeper's draft deposit answered %d; body: %s", status, out)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(out), &created); err != nil || created.ID == "" {
		t.Fatalf("the created deposit has no id: %s", out)
	}
	requireDepositCount(t, de.app, 1)

	for name, extra := range map[string]string{
		"number":      `,"number":"1001"`,
		"sequence":    `,"sequence":1001`,
		"total":       `,"total":5000`,
		"items_total": `,"items_total":5000`,
		"lines_total": `,"lines_total":5000`,
		"entry":       fmt.Sprintf(`,"entry":%q`, sale.Id),
		"posted_by":   fmt.Sprintf(`,"posted_by":%q`, de.users.admin.Id),
		"status":      `,"status":"posted"`,
	} {
		if status, out := client.send(t, de.users.bookkeeper, http.MethodPost, depositURL, body(extra)); status != http.StatusBadRequest {
			t.Errorf("a deposit create that writes %s answered %d, want 400; body: %s", name, status, out)
		}
	}
	requireDepositCount(t, de.app, 1)

	status, out = client.send(t, de.users.readOnly, http.MethodPost, depositURL, body(""))
	restAnswer{status: status, body: out}.requireRefused(t, "a reader's deposit create")
	requireDepositCount(t, de.app, 1)

	itemURL := collectionURL(depositItemsCol)
	itemBody := func(extra string) string {
		return fmt.Sprintf(`{"deposit":%q,"line":%q,"position":0%s}`, created.ID, line.Id, extra)
	}
	for name, extra := range map[string]string{
		"posted":         `,"posted":true`,
		"amount":         `,"amount":5000`,
		"entry":          fmt.Sprintf(`,"entry":%q`, line.GetString("entry")),
		"account":        fmt.Sprintf(`,"account":%q`, de.undeposited.Id),
		"customer":       fmt.Sprintf(`,"customer":%q`, de.customer.Id),
		"date":           fmt.Sprintf(`,"date":%q`, depositItemDay),
		"doc_type":       `,"doc_type":"payment"`,
		"number":         `,"number":"1004"`,
		"document":       `,"document":"aaaaaaaaaaaaaaa"`,
		"payment_method": `,"payment_method":"check"`,
		"reference_no":   `,"reference_no":"98765"`,
	} {
		if status, out := client.send(t, de.users.bookkeeper, http.MethodPost, itemURL, itemBody(extra)); status != http.StatusBadRequest {
			t.Errorf("an item create that writes %s answered %d, want 400; body: %s", name, status, out)
		}
	}
	if n, _ := de.app.CountRecords(depositItemsCol); n != 0 {
		t.Fatalf("%d items stored after the refused creates, want 0", n)
	}

	status, out = client.send(t, de.users.bookkeeper, http.MethodPost, itemURL, itemBody(""))
	if status != http.StatusOK {
		t.Fatalf("a bookkeeper's item create answered %d; body: %s", status, out)
	}
	var item struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(out), &item); err != nil || item.ID == "" {
		t.Fatalf("the created item has no id: %s", out)
	}

	// No client update of an item: the server writes its copy fields.
	status, out = client.send(t, de.users.bookkeeper, http.MethodPatch, itemURL+"/"+item.ID, `{"position":4}`)
	if status == http.StatusOK {
		t.Errorf("a client update of an item answered 200; body: %s", out)
	}
	if got := reload(t, de.app, depositItemsCol, item.ID).GetInt("position"); got != 0 {
		t.Errorf("item position = %d after the update, want 0", got)
	}
}

// The delete rule lets a writer delete a draft only; its items and lines go
// with it.
func TestDeposit_DeleteOnlyDraft(t *testing.T) {
	de := newDepositEnv(t)
	client := newRestClient(t, de.app)

	posted := de.postedDeposit(t, []*core.Record{de.undepositedItem(t, de.undeposited, depositItemDay, 5000, "Check one")},
		map[string]any{"account": de.interest.Id, "amount": 1240})
	status, out := client.send(t, de.users.bookkeeper, http.MethodDelete, collectionURL(depositsCol)+"/"+posted.Id, "")
	restAnswer{status: status, body: out}.requireRefused(t, "the delete of a posted deposit")
	reload(t, de.app, depositsCol, posted.Id)
	requireDepositRows(t, de.app, depositItemsCol, posted, 1)
	requireDepositRows(t, de.app, depositLinesCol, posted, 1)

	draft := de.mkDeposit(t, nil)
	mkDepositItem(t, de.app, draft, de.undepositedItem(t, de.undeposited, depositItemDay, 3000, "Check two"), 0)
	mkDepositLine(t, de.app, draft, 0, map[string]any{"account": de.interest.Id, "amount": 500})
	status, out = client.send(t, de.users.bookkeeper, http.MethodDelete, collectionURL(depositsCol)+"/"+draft.Id, "")
	if status != http.StatusNoContent {
		t.Fatalf("the delete of a draft deposit answered %d; body: %s", status, out)
	}
	if _, err := de.app.FindRecordById(depositsCol, draft.Id); err == nil {
		t.Error("the draft deposit is still there")
	}
	requireDepositRows(t, de.app, depositItemsCol, draft, 0)
	requireDepositRows(t, de.app, depositLinesCol, draft, 0)
}

// A person's REST create of a deposit entry is refused with the deposit's text.
func TestCreate_DepositEntryOverRESTIsRefused(t *testing.T) {
	de := newDepositEnv(t)
	status, body := newRestClient(t, de.app).send(t, de.users.bookkeeper, http.MethodPost,
		collectionURL("books_journal_entries"),
		`{"date":"2026-11-16","doc_type":"deposit","status":"draft","origin":"manual"}`)
	if want := "A deposit entry comes only from posting its deposit."; status != http.StatusBadRequest || !strings.Contains(body, want) {
		t.Errorf("a deposit entry create = %d %s, want 400 with %q", status, body, want)
	}
	if n, _ := de.app.CountRecords("books_journal_entries", dbx.HashExp{"doc_type": "deposit"}); n != 0 {
		t.Errorf("%d deposit entries stored, want 0", n)
	}
}

// --- Delete refusals of accounts, customers and vendors ---

func TestAccount_DeleteRefusedWhileDepositsGoToIt(t *testing.T) {
	de := newDepositEnv(t)
	operating := mkNumberedAccount(t, de.app, "Operating Checking", "1020", "bank", "checking")
	deleteOperating := func() error { return de.app.Delete(reload(t, de.app, "books_accounts", operating.Id)) }

	de.mkDeposit(t, map[string]any{"deposit_to": operating.Id})
	requireMessageOnlyRefusal(t, deleteOperating(),
		"This account is the deposit account of 1 deposit and cannot be deleted. Make it inactive instead.")
	de.mkDeposit(t, map[string]any{"deposit_to": operating.Id})
	requireMessageOnlyRefusal(t, deleteOperating(),
		"This account is the deposit account of 2 deposits and cannot be deleted. Make it inactive instead.")
	reload(t, de.app, "books_accounts", operating.Id)
}

func TestAccount_DeleteRefusedWhileOnDepositLines(t *testing.T) {
	de := newDepositEnv(t)
	other := mkNumberedAccount(t, de.app, "Other income", "4950", "other_income", "other_misc_income")
	deleteOther := func() error { return de.app.Delete(reload(t, de.app, "books_accounts", other.Id)) }

	d := de.mkDeposit(t, nil)
	mkDepositLine(t, de.app, d, 0, map[string]any{"account": other.Id, "amount": 1240})
	requireMessageOnlyRefusal(t, deleteOther(),
		"This account is on 1 deposit line and cannot be deleted. Make it inactive instead.")
	mkDepositLine(t, de.app, de.mkDeposit(t, nil), 0, map[string]any{"account": other.Id, "amount": 500})
	requireMessageOnlyRefusal(t, deleteOther(),
		"This account is on 2 deposit lines and cannot be deleted. Make it inactive instead.")
	reload(t, de.app, "books_accounts", other.Id)
}

func TestCustomerAndVendor_DeleteRefusedWhileOnDepositLines(t *testing.T) {
	for _, n := range []int{1, 2} {
		t.Run(fmt.Sprintf("on %d deposit lines", n), func(t *testing.T) {
			de := newDepositEnv(t)
			walkIn := mkCustomer(t, de.app, "Walk-in Clinic", "")
			bankCo := mkVendor(t, de.app, "First Harbor Bank")
			for i := 0; i < n; i++ {
				d := de.mkDeposit(t, nil)
				mkDepositLine(t, de.app, d, 0, map[string]any{"account": de.interest.Id, "amount": 1240, "customer": walkIn.Id})
				mkDepositLine(t, de.app, d, 1, map[string]any{"account": de.fees.Id, "amount": -500, "vendor": bankCo.Id})
			}
			requireMessageOnlyRefusal(t, de.app.Delete(reload(t, de.app, "books_customers", walkIn.Id)),
				"Walk-in Clinic is on deposits. Make it inactive instead.")
			reload(t, de.app, "books_customers", walkIn.Id)
			requireMessageOnlyRefusal(t, de.app.Delete(reload(t, de.app, "books_vendors", bankCo.Id)),
				"First Harbor Bank is on deposits. Make it inactive instead.")
			reload(t, de.app, "books_vendors", bankCo.Id)
		})
	}
}

// --- The shared case table ---

// depositCase is one validity row of deposit_cases.json, the table the
// TypeScript schema and the Go guards share.
type depositCase struct {
	Name  string `json:"name"`
	At    string `json:"at"`
	Date  string `json:"date"`
	Items []struct {
		Amount  int64  `json:"amount"`
		Date    string `json:"date"`
		DocType string `json:"docType"`
		Number  string `json:"number"`
	} `json:"items"`
	ItemCount int `json:"itemCount"`
	Lines     []struct {
		Account string `json:"account"`
		Amount  int64  `json:"amount"`
	} `json:"lines"`
	LineCount     int    `json:"lineCount"`
	Key           string `json:"key"`
	Message       string `json:"message"`
	ClientMessage string `json:"clientMessage"`
}

type depositNounCase struct {
	DocType string `json:"docType"`
	Number  string `json:"number"`
	Label   string `json:"label"`
}

type depositCases struct {
	Validity []depositCase     `json:"validity"`
	Nouns    []depositNounCase `json:"nouns"`
}

func loadDepositCases(t *testing.T) depositCases {
	t.Helper()
	raw, err := os.ReadFile(depositCasesFile)
	if err != nil {
		t.Fatalf("read %s: %v", depositCasesFile, err)
	}
	var cases depositCases
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse %s: %v", depositCasesFile, err)
	}
	if len(cases.Validity) < 12 || len(cases.Nouns) < 7 {
		t.Fatalf("%s holds %d validity and %d noun cases, want every case of the plan", depositCasesFile, len(cases.Validity), len(cases.Nouns))
	}
	// A refusal case states its text: a case with a key and no message would
	// check the key only, and the client test that reads the table would
	// have no text to match.
	for _, c := range cases.Validity {
		if c.Key != "" && c.Message == "" {
			t.Fatalf("%s: case %q has key %q and no message", depositCasesFile, c.Name, c.Key)
		}
	}
	return cases
}

// runDepositCase builds the case's deposit on a fresh book: every item and line
// is written before the guards are bound, except the row the case names (at
// item or line), which goes through the guards; at post, the post does.
func runDepositCase(t *testing.T, c depositCase) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	bank := mkNumberedAccount(t, app, "Business Checking", "1000", "bank", "checking")
	funds := mkNumberedAccount(t, app, "Undeposited funds", "1200", "other_current_asset", "undeposited_funds")
	revenue := mkNumberedAccount(t, app, "Consulting Income", "4000", "income", "service_income")
	accounts := map[string]*core.Record{
		"income":              mkNumberedAccount(t, app, "Interest earned", "4900", "other_income", "interest_earned"),
		"expense":             mkNumberedAccount(t, app, "Bank charges and fees", "6300", "expense", "bank_charges"),
		"accounts_receivable": mkNumberedAccount(t, app, "Accounts receivable", "1100", "accounts_receivable", "accounts_receivable"),
		"accounts_payable":    mkNumberedAccount(t, app, "Accounts payable", "2000", "accounts_payable", "accounts_payable"),
		"inactive":            mkNumberedAccount(t, app, "Old fees", "6900", "expense", "bank_charges"),
		"deposit_to":          bank,
	}
	if err := setFields(t, app, "books_accounts", accounts["inactive"].Id, map[string]any{"inactive": true}); err != nil {
		t.Fatal(err)
	}
	customer := mkCustomer(t, app, "Harborview Dental", "")

	itemCount, lineCount := c.ItemCount, c.LineCount
	if itemCount == 0 {
		itemCount = len(c.Items)
	}
	if lineCount == 0 {
		lineCount = len(c.Lines)
	}
	d := saveRecord(t, app, depositsCol, map[string]any{"status": statusDraft, "date": c.Date, "deposit_to": bank.Id, "currency": "USD"})

	// The items' lines: one posted entry each, of the case's doc type and number.
	itemLines := make([]*core.Record, itemCount)
	for i := range itemLines {
		spec := c.Items[min(i, len(c.Items)-1)]
		docType, origin, document, number := "journal", originManual, "", fmt.Sprint(i+1)
		if spec.DocType != "" {
			docType, origin, number = spec.DocType, originDocument, spec.Number
			document = mkPaymentRow(t, app, customer, map[string]any{
				"status": statusPosted, "date": spec.Date, "amount": spec.Amount, "number": spec.Number,
				"payment_method": "check", "deposit_to": funds.Id,
			}).Id
		}
		seq := 0
		fmt.Sscan(number, &seq)
		amount := spec.Amount
		entry := saveRecord(t, app, "books_journal_entries", map[string]any{
			"date": spec.Date, "status": statusPosted, "doc_type": docType, "origin": origin, "document": document,
			"number": number, "sequence": seq, "total": amount, "currency": "USD",
		})
		itemLines[i] = saveRecord(t, app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": funds.Id, "debit": amount, "position": 0, "posted": true,
			"date": spec.Date, "currency": "USD", "customer": customer.Id,
		})
		saveRecord(t, app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": revenue.Id, "credit": amount, "position": 1, "posted": true,
			"date": spec.Date, "currency": "USD", "customer": customer.Id,
		})
	}
	guardedItem, guardedLine := -1, -1
	switch c.At {
	case "item":
		guardedItem = itemCount - 1
	case "line":
		guardedLine = lineCount - 1
	}
	for i, l := range itemLines {
		if i != guardedItem {
			saveRecord(t, app, depositItemsCol, map[string]any{"deposit": d.Id, "line": l.Id, "position": i})
		}
	}
	lineFields := func(i int) map[string]any {
		spec := c.Lines[min(i, len(c.Lines)-1)]
		account, ok := accounts[spec.Account]
		if !ok {
			t.Fatalf("case line account %q is no kind this test knows", spec.Account)
		}
		return map[string]any{"account": account.Id, "amount": spec.Amount}
	}
	for i := 0; i < lineCount; i++ {
		if i != guardedLine {
			fields := lineFields(i)
			fields["deposit"], fields["position"] = d.Id, i
			saveRecord(t, app, depositLinesCol, fields)
		}
	}
	registerLedger(app)
	registerDepositGuards(app)

	var err error
	switch c.At {
	case "item":
		_, err = newDepositItem(app, d, itemLines[guardedItem], guardedItem)
	case "line":
		_, err = newDepositLine(app, d, guardedLine, lineFields(guardedLine))
	case "post":
		err = postDepositAs(app, d.Id, users.bookkeeper.Id)
	default:
		t.Fatalf("case at %q is no step this test knows", c.At)
	}

	if c.Key == "" && c.Message == "" {
		if err != nil {
			t.Fatalf("the case was refused: %v", err)
		}
		if c.At == "post" {
			if s := reload(t, app, depositsCol, d.Id).GetString("status"); s != statusPosted {
				t.Errorf("deposit status %q, want posted", s)
			}
		}
		return
	}
	if err == nil {
		t.Fatalf("the case was not refused, want key %q text %q", c.Key, c.Message)
	}
	if c.Key != "" {
		requireRefusedOnField(t, err, c.Key)
	}
	if c.Message != "" {
		requireRefusalText(t, err, sentText(c.Message))
	}
	switch c.At {
	case "item":
		requireDepositRows(t, app, depositItemsCol, d, int64(itemCount-1))
	case "line":
		requireDepositRows(t, app, depositLinesCol, d, int64(lineCount-1))
	case "post":
		if s := reload(t, app, depositsCol, d.Id).GetString("status"); s != statusDraft {
			t.Errorf("a refused post left status %q, want draft", s)
		}
	}
}

func TestDeposit_EveryValidityCase(t *testing.T) {
	for _, c := range loadDepositCases(t).Validity {
		t.Run(c.Name, func(t *testing.T) { runDepositCase(t, c) })
	}
}

// --- Undeposited items of each source document ---

// depositSource is one posted transaction with a line on Undeposited funds,
// in an app of its own with the deposit guards bound.
type depositSource struct {
	app               *tests.TestApp
	users             levelUsers
	bank, undeposited *core.Record
	// income is an account an other funds line can use, so a deposit of a
	// money-out item still totals above zero.
	income            *core.Record
	entry, line       *core.Record
	noun              string
	customer, vendor  string
	amount            int
	method, reference string
	// void voids the transaction; correct posts an edit that replaces it.
	void, correct func(t *testing.T) error
}

// name is the transaction's name in a refusal: "Payment 1001".
func (s depositSource) name(t testing.TB) string {
	t.Helper()
	return s.noun + " " + reload(t, s.app, "books_journal_entries", s.entry.Id).GetString("number")
}

var depositSourceKinds = []string{"payment", "sales_receipt", "vendor_refund", "refund_receipt", "journal", "transfer"}

var depositSourcePosters = map[string]func(t *testing.T) depositSource{
	"payment": func(t *testing.T) depositSource {
		pe := newPaymentEnv(t)
		registerDepositGuards(pe.app)
		actor := pe.users.bookkeeper.Id
		inv := pe.postedInvoice(t, pe.customer, 45000)
		p := pe.mkPayment(t, map[string]any{
			"amount": 45000, "deposit_to": pe.undeposited.Id, "payment_method": "check", "reference_no": "98765",
		})
		mkApplication(t, pe.app, p, inv, 0, 45000)
		p = mustPostPayment(t, pe.app, p.Id, actor)
		entry := reload(t, pe.app, "books_journal_entries", p.GetString("entry"))
		return depositSource{
			app: pe.app, users: pe.users, bank: pe.checking, undeposited: pe.undeposited, income: pe.revenue,
			entry: entry, line: lineOn(t, pe.app, entry.Id, pe.undeposited), noun: "Payment",
			customer: pe.customer.Id, amount: 45000, method: "check", reference: "98765",
			void: func(t *testing.T) error { return voidPaymentAs(pe.app, p.Id, actor) },
			correct: func(t *testing.T) error {
				c := pe.mkPayment(t, map[string]any{"replaces": p.Id, "amount": 45000, "deposit_to": pe.undeposited.Id})
				return postPaymentAs(pe.app, c.Id, actor)
			},
		}
	},
	"sales_receipt": func(t *testing.T) depositSource {
		re := newReceiptEnv(t)
		registerDepositGuards(re.app)
		actor := re.users.bookkeeper.Id
		r := re.mkReceipt(t, map[string]any{"payment_method": "credit_card", "reference_no": "4417"})
		mkReceiptLine(t, re.app, r, 0, item(re.service, 1, 18000, false))
		r = mustPostReceipt(t, re.app, r.Id, actor)
		entry := reload(t, re.app, "books_journal_entries", r.GetString("entry"))
		return depositSource{
			app: re.app, users: re.users, bank: re.checking, undeposited: re.undeposited, income: re.revenue,
			entry: entry, line: lineOn(t, re.app, entry.Id, re.undeposited), noun: "Sales receipt",
			customer: re.customer.Id, amount: 18000, method: "credit_card", reference: "4417",
			void: func(t *testing.T) error { return voidReceiptAs(re.app, r.Id, actor) },
			correct: func(t *testing.T) error {
				c := re.mkReceipt(t, map[string]any{"replaces": r.Id})
				mkReceiptLine(t, re.app, c, 0, item(re.service, 1, 18000, false))
				return postReceiptAs(re.app, c.Id, actor)
			},
		}
	},
	"vendor_refund": func(t *testing.T) depositSource {
		re := newRefundEnv(t)
		registerDepositGuards(re.app)
		actor := re.users.bookkeeper.Id
		credit := re.postedCredit(t, re.pacificPower, vendorCreditDay, billAmount{re.rent, 42500})
		r := re.mkRefund(t, map[string]any{
			"amount": 15000, "refunded_to": re.undeposited.Id, "payment_method": "check", "reference_no": "20417",
		})
		mkRefundLine(t, re.app, r, credit, 0, 15000)
		r = mustPostRefund(t, re.app, r.Id, actor)
		entry := reload(t, re.app, "books_journal_entries", r.GetString("entry"))
		return depositSource{
			app: re.app, users: re.users, bank: re.checking1000, undeposited: re.undeposited, income: re.revenue,
			entry: entry, line: lineOn(t, re.app, entry.Id, re.undeposited), noun: "Vendor refund",
			vendor: re.pacificPower.Id, amount: 15000, method: "check", reference: "20417",
			void: func(t *testing.T) error { return voidRefundAs(re.app, r.Id, actor) },
			correct: func(t *testing.T) error {
				c := re.mkRefund(t, map[string]any{"amount": 5000, "refunded_to": re.undeposited.Id, "replaces": r.Id})
				mkRefundLine(t, re.app, c, credit, 0, 5000)
				return postRefundAs(re.app, c.Id, actor)
			},
		}
	},
	"refund_receipt": func(t *testing.T) depositSource {
		rr := newRefundReceiptEnv(t)
		registerDepositGuards(rr.app)
		actor := rr.users.bookkeeper.Id
		r := rr.mkRefundReceipt(t, map[string]any{"refund_from": rr.undeposited.Id, "payment_method": "cash", "reference_no": "R-7"})
		mkRefundReceiptLine(t, rr.app, r, 0, item(rr.service, 1, 6000, false))
		r = mustPostRefundReceipt(t, rr.app, r.Id, actor)
		entry := reload(t, rr.app, "books_journal_entries", r.GetString("entry"))
		return depositSource{
			app: rr.app, users: rr.users, bank: rr.checking, undeposited: rr.undeposited, income: rr.revenue,
			entry: entry, line: lineOn(t, rr.app, entry.Id, rr.undeposited), noun: "Refund receipt",
			customer: rr.customer.Id, amount: -6000, method: "cash", reference: "R-7",
			void: func(t *testing.T) error { return voidRefundReceiptAs(rr.app, r.Id, actor) },
			correct: func(t *testing.T) error {
				c := rr.mkRefundReceipt(t, map[string]any{"refund_from": rr.undeposited.Id, "replaces": r.Id})
				mkRefundReceiptLine(t, rr.app, c, 0, item(rr.service, 1, 6000, false))
				return postRefundReceiptAs(rr.app, c.Id, actor)
			},
		}
	},
	"journal": func(t *testing.T) depositSource {
		de := newDepositEnv(t)
		actor := de.users.bookkeeper.Id
		entry := postJournal(t, de.app, "", depositItemDay, "Cash from the fair",
			jnLine{account: de.undeposited, debit: 2500, memo: "Cash from the fair", customer: de.customer.Id},
			jnLine{account: de.revenue, credit: 2500, position: 1})
		return depositSource{
			app: de.app, users: de.users, bank: de.checking, undeposited: de.undeposited, income: de.interest,
			entry: entry, line: lineOn(t, de.app, entry.Id, de.undeposited), noun: "Journal entry",
			customer: de.customer.Id, amount: 2500,
			void: func(t *testing.T) error { return setStatus(de.app, entry.Id, statusVoid, actor) },
			correct: func(t *testing.T) error {
				draft := saveRecord(t, de.app, "books_journal_entries", map[string]any{
					"date": depositItemDay, "status": statusDraft, "doc_type": "journal", "origin": originManual, "replaces": entry.Id,
				})
				saveRecord(t, de.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": de.undeposited.Id, "debit": 2600, "position": 0})
				saveRecord(t, de.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": de.revenue.Id, "credit": 2600, "position": 1})
				return setStatus(de.app, draft.Id, statusPosted, actor)
			},
		}
	},
	"transfer": func(t *testing.T) depositSource {
		de := newDepositEnv(t)
		actor := de.users.bookkeeper.Id
		entry := mustPost(t, de.app, transferDraft(t, de.app, depositItemDay, de.savings, de.undeposited, 3000).Id, actor)
		return depositSource{
			app: de.app, users: de.users, bank: de.checking, undeposited: de.undeposited, income: de.interest,
			entry: entry, line: lineOn(t, de.app, entry.Id, de.undeposited), noun: "Transfer", amount: 3000,
			void: func(t *testing.T) error { return setStatus(de.app, entry.Id, statusVoid, actor) },
			correct: func(t *testing.T) error {
				draft := saveRecord(t, de.app, "books_journal_entries", map[string]any{
					"date": depositItemDay, "status": statusDraft, "doc_type": "transfer", "origin": originManual,
					"replaces": entry.Id, "currency": "USD",
				})
				saveRecord(t, de.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": de.savings.Id, "credit": 3100, "position": 0, "currency": "USD"})
				saveRecord(t, de.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": de.undeposited.Id, "debit": 3100, "position": 1, "currency": "USD"})
				return setStatus(de.app, draft.Id, statusPosted, actor)
			},
		}
	},
}

// depositOf posts a deposit of the source's line, with an other funds line of
// 100.00 so a money-out item still totals above zero.
func (s depositSource) depositOf(t *testing.T) *core.Record {
	t.Helper()
	return postedDepositOf(t, s.app, s.users.bookkeeper.Id, s.bank, depositDay, []*core.Record{s.line},
		map[string]any{"account": s.income.Id, "amount": 10000})
}
