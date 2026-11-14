package books

import (
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// One small company through the whole ledger lifecycle: opening balances,
// entries in two fiscal years, a correction, a void, an automatic reversal and
// a close date. Every expected number below is written by hand, not computed
// by Books code: a rule that changes a posted number fails this test even when
// every other test agrees with the new rule.
//
// The company (fiscal years start in January; amounts are cents):
//
//	1. 2024-12-31  Opening balances       Checking Dr 500000; Opening Balance Equity Cr 500000
//	2. 2025-03-10  Sale                   Checking Dr 120000; Income Cr 120000
//	3. 2025-03-15  Rent                   Rent Dr 80000; Checking Cr 80000
//	4. 2025-03-15  Correction of 3        Rent Dr 90000; Checking Cr 90000
//	               (the post voids 3: a void reversal on 2025-03-15, Rent Cr 80000; Checking Dr 80000)
//	5. 2026-02-05  Sale                   Checking Dr 200000; Income Cr 200000
//	6. 2026-02-20  A mistake, then void   Rent Dr 5000; Checking Cr 5000, and the reverse on the same day
//	7. 2026-03-31  Accrual                Rent Dr 30000; Checking Cr 30000
//	               (reverses 2026-04-01: Rent Cr 30000; Checking Dr 30000)
//	8.             Close through 2026-03-31; a post dated 2026-03-15 is refused
//	9. 2026-05-10  Rent                   Rent Dr 40000; Checking Cr 40000
//
// A void entry and its reversal both stay in the month rows.

// lifecycleInput is what the "changed input" runs change, one at a time.
type lifecycleInput struct {
	// secondSaleToSavings books the 2026 sale to Savings and not to Checking.
	secondSaleToSavings bool
	// secondSaleDay is the day of the 2026 sale.
	secondSaleDay string
	// firstSaleAmount is the amount of the 2025 sale, in cents.
	firstSaleAmount int
}

var lifecycleDefault = lifecycleInput{secondSaleDay: "2026-02-05", firstSaleAmount: 120000}

type lifecycleCompany struct {
	book                                              tbBook
	checking, savings, equity, retained, income, rent *core.Record
}

// wantMonthRows are the stored month rows: "Account period" -> "debit/credit".
var wantMonthRows = map[string]string{
	"Checking 2024-12": "500000/0",
	// Dr 120000 (2) + 80000 (void of 3); Cr 80000 (3) + 90000 (4).
	"Checking 2025-03": "200000/170000",
	// Dr 200000 (5) + 5000 (void of 6); Cr 5000 (6).
	"Checking 2026-02":               "205000/5000",
	"Checking 2026-03":               "0/30000",
	"Checking 2026-04":               "30000/0",
	"Checking 2026-05":               "0/40000",
	"Opening Balance Equity 2024-12": "0/500000",
	"Consulting Income 2025-03":      "0/120000",
	"Consulting Income 2026-02":      "0/200000",
	// Dr 80000 (3) + 90000 (4); Cr 80000 (void of 3).
	"Rent 2025-03": "170000/80000",
	"Rent 2026-02": "5000/5000",
	"Rent 2026-03": "30000/0",
	"Rent 2026-04": "0/30000",
	"Rent 2026-05": "40000/0",
}

// wantTrialBalance is "Account" -> "debit/credit" as of 2026-12-31; "-" is an
// empty cell. The income and expense of 2025 are on Retained earnings: 120000
// income less 90000 rent.
var wantTrialBalance = map[string]string{
	// All debits 935000 less all credits 245000.
	"Checking":               "690000/-",
	"Opening Balance Equity": "-/500000",
	"Retained earnings":      "-/30000",
	// 2026 only.
	"Consulting Income": "-/200000",
	// 2026: 5000 - 5000 + 30000 - 30000 + 40000.
	"Rent":  "40000/-",
	"Total": "730000/730000",
}

func runLifecycle(t *testing.T, in lifecycleInput) *lifecycleCompany {
	t.Helper()
	b := newTBBook(t)
	c := &lifecycleCompany{
		book:     b,
		checking: b.account(t, "Checking", "1000", "bank", "checking"),
		savings:  b.account(t, "Savings", "1100", "bank", "savings"),
		equity:   b.account(t, "Opening Balance Equity", "3000", "equity", "opening_balance_equity"),
		retained: mkRetainedEarnings(t, b.app, "3900"),
		income:   b.account(t, "Consulting Income", "4000", "income", "service_income"),
		rent:     b.account(t, "Rent", "6000", "expense", "rent_lease"),
	}
	app := b.app

	// 1. Opening balances.
	mustPost(t, app, mkOpening(t, app, "2024-12-31", "", ln{c.checking, 500000, 0}, ln{c.equity, 0, 500000}).Id, "")

	// 2 and 3. The first fiscal year.
	b.post(t, "2025-03-10", ln{c.checking, in.firstSaleAmount, 0}, ln{c.income, 0, in.firstSaleAmount})
	rent := b.post(t, "2025-03-15", ln{c.rent, 80000, 0}, ln{c.checking, 0, 80000})

	// 4. A correction: the post voids entry 3 and takes its number.
	correction := saveRecord(t, app, "books_journal_entries", map[string]any{
		"date": "2025-03-15", "status": "draft", "doc_type": "journal", "origin": "manual", "replaces": rent.Id,
	})
	saveRecord(t, app, "books_journal_lines", map[string]any{"entry": correction.Id, "account": c.rent.Id, "debit": 90000, "position": 0})
	saveRecord(t, app, "books_journal_lines", map[string]any{"entry": correction.Id, "account": c.checking.Id, "credit": 90000, "position": 1})
	corrected := mustPost(t, app, correction.Id, "")
	if corrected.GetString("number") != rent.GetString("number") {
		t.Fatalf("the correction has number %q, want the original's %q", corrected.GetString("number"), rent.GetString("number"))
	}

	// 5. The second fiscal year.
	bank := c.checking
	if in.secondSaleToSavings {
		bank = c.savings
	}
	b.post(t, in.secondSaleDay, ln{bank, 200000, 0}, ln{c.income, 0, 200000})

	// 6. A mistake and its void.
	mistake := b.post(t, "2026-02-20", ln{c.rent, 5000, 0}, ln{c.checking, 0, 5000})
	if err := setStatus(app, mistake.Id, statusVoid, ""); err != nil {
		t.Fatalf("void the mistake: %v", err)
	}

	// 7. An accrual that reverses on the first day of the next month.
	accrued := mkDraft(t, app, "2026-03-31", ln{c.rent, 30000, 0}, ln{c.checking, 0, 30000})
	accrued.Set("auto_reverse_on", "2026-04-01")
	if err := app.Save(accrued); err != nil {
		t.Fatalf("set the auto-reverse date: %v", err)
	}
	mustPost(t, app, accrued.Id, "")
	requireSweep(t, app, at("2026-04-01", 1), 1)

	// 8. Close through March. A post into the closed period is refused.
	setCloseDate(t, app, "2026-03-31")
	late := mkDraft(t, app, "2026-03-15", ln{c.rent, 700, 0}, ln{c.checking, 0, 700})
	requireRefused(t, setStatus(app, late.Id, statusPosted, ""), "closed through 2026-03-31")

	// 9. An entry after the close date.
	b.post(t, "2026-05-10", ln{c.rent, 40000, 0}, ln{c.checking, 0, 40000})
	return c
}

func (c *lifecycleCompany) accounts() []*core.Record {
	return []*core.Record{c.checking, c.savings, c.equity, c.retained, c.income, c.rent}
}

func (c *lifecycleCompany) monthRows(t *testing.T) map[string]string {
	t.Helper()
	names := map[string]string{}
	for _, account := range c.accounts() {
		names[account.Id] = account.GetString("name")
	}
	rows, err := c.book.app.FindAllRecords("books_account_balances")
	if err != nil {
		t.Fatalf("read the month rows: %v", err)
	}
	out := map[string]string{}
	for _, row := range rows {
		key := names[row.GetString("account")] + " " + row.GetString("period")
		out[key] = fmt.Sprintf("%d/%d", row.GetInt("debit_total"), row.GetInt("credit_total"))
	}
	return out
}

func (c *lifecycleCompany) trialBalance(t *testing.T) map[string]string {
	t.Helper()
	res := runTB(t, c.book.app, c.book.reader, map[string]any{"asOf": "2026-12-31"}, reports.Options{Today: "2026-12-31"})
	cell := func(r reports.Row, col string) string {
		v, ok := moneyCell(t, r, col)
		if !ok {
			return "-"
		}
		return fmt.Sprint(v)
	}
	out := map[string]string{}
	for _, account := range c.accounts() {
		if !hasRowFor(t, res, account) {
			continue
		}
		r := rowFor(t, res, account)
		out[account.GetString("name")] = cell(r, "debit") + "/" + cell(r, "credit")
	}
	total := totalOf(t, res)
	out["Total"] = cell(total, "debit") + "/" + cell(total, "credit")
	return out
}

// differences lists every key whose value differs between got and want, in a
// fixed order.
func differences(got, want map[string]string) []string {
	keys := map[string]bool{}
	for k := range got {
		keys[k] = true
	}
	for k := range want {
		keys[k] = true
	}
	var out []string
	for k := range keys {
		if got[k] != want[k] {
			out = append(out, fmt.Sprintf("%s: got %q, want %q", k, got[k], want[k]))
		}
	}
	sort.Strings(out)
	return out
}

func TestLifecycle_ASmallCompany(t *testing.T) {
	c := runLifecycle(t, lifecycleDefault)
	if diff := differences(c.monthRows(t), wantMonthRows); len(diff) > 0 {
		t.Errorf("month rows:\n%s", strings.Join(diff, "\n"))
	}
	if diff := differences(c.trialBalance(t), wantTrialBalance); len(diff) > 0 {
		t.Errorf("trial balance:\n%s", strings.Join(diff, "\n"))
	}
	// The stored rows agree with the ledger, and each line with its entry.
	requireNoDrift(t, c.book.app)
}

// The expected numbers must be able to fail: one changed account, one changed
// day and one changed amount each give a ledger that the literals refuse.
func TestLifecycle_EachChangedInputFails(t *testing.T) {
	account, day, amount := lifecycleDefault, lifecycleDefault, lifecycleDefault
	account.secondSaleToSavings = true
	day.secondSaleDay = "2026-01-05"
	amount.firstSaleAmount = 120001

	for name, in := range map[string]lifecycleInput{"account": account, "day": day, "amount": amount} {
		t.Run(name, func(t *testing.T) {
			c := runLifecycle(t, in)
			if diff := differences(c.monthRows(t), wantMonthRows); len(diff) == 0 {
				t.Error("the month rows equal the expected rows after the input changed")
			}
			requireNoDrift(t, c.book.app)
		})
	}
	// A changed account or amount changes the trial balance too. A changed
	// day inside one fiscal year does not, so only those two are checked.
	for name, in := range map[string]lifecycleInput{"account": account, "amount": amount} {
		t.Run(name+" in the trial balance", func(t *testing.T) {
			c := runLifecycle(t, in)
			if diff := differences(c.trialBalance(t), wantTrialBalance); len(diff) == 0 {
				t.Error("the trial balance equals the expected one after the input changed")
			}
		})
	}
}
