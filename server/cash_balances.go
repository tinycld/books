package books

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The stored cash months. books_cash_basis_balances holds, for each account
// and month, the debit and credit totals of the posted books_cash_basis_lines
// rows of that month, as books_account_balances holds the ledger's. A Cash
// report reads the months before its period here, so that part of its cost
// does not grow with the cash rows. syncCashLineRows, the one writer of the
// cash rows, collects the months of the rows it deletes and writes, and its
// caller refreshes each of them one time, in the same transaction
// (syncCashDocuments, rebuildCashBasis); rebuildBalances repairs every month
// (rebuildCashBalances);
// verifyCashBalances is the check. A month with no cash row has no stored row.

const cashBalancesCollection = "books_cash_basis_balances"

// cashMonthSum is the posted cash rows of one account and month, added up.
type cashMonthSum struct {
	Rows     int    `db:"n"`
	Debit    int    `db:"debit"`
	Credit   int    `db:"credit"`
	Currency string `db:"currency"`
}

// cashMonthTotalsSQL sums every posted cash-basis row by account and month.
const cashMonthTotalsSQL = `
	SELECT account, substr(date, 1, 7) AS period,
	       CAST(SUM(debit) AS INTEGER) AS debit,
	       CAST(SUM(credit) AS INTEGER) AS credit,
	       MAX(currency) AS currency
	FROM books_cash_basis_lines
	WHERE posted = {:posted}
	GROUP BY account, substr(date, 1, 7)`

// cashMonthSumSQL sums the posted cash-basis rows of one account between two
// days.
const cashMonthSumSQL = `
	SELECT COUNT(*) AS n,
	       COALESCE(CAST(SUM(debit) AS INTEGER), 0) AS debit,
	       COALESCE(CAST(SUM(credit) AS INTEGER), 0) AS credit,
	       COALESCE(MAX(currency), '') AS currency
	FROM books_cash_basis_lines
	WHERE account = {:account} AND posted = {:posted} AND date >= {:from} AND date <= {:to}`

// cashMonthTotals sums every posted cash-basis row by account and month: what
// the stored cash months must equal.
func cashMonthTotals(app core.App) (map[balanceKey]balanceTotals, error) {
	var rows []struct {
		Account  string `db:"account"`
		Period   string `db:"period"`
		Debit    int    `db:"debit"`
		Credit   int    `db:"credit"`
		Currency string `db:"currency"`
	}
	err := app.DB().NewQuery(cashMonthTotalsSQL).Bind(dbx.Params{"posted": true}).All(&rows)
	if err != nil {
		return nil, fmt.Errorf("books: sum the cash-basis rows: %w", err)
	}
	out := make(map[balanceKey]balanceTotals, len(rows))
	for _, r := range rows {
		out[balanceKey{r.Account, r.Period}] = balanceTotals{r.Debit, r.Credit, r.Currency}
	}
	return out, nil
}

// refreshCashBalance makes the stored cash month of key equal the posted cash
// rows of that account and month: it writes the row, or deletes it when the
// month has no cash row left. It reads the rows again instead of adding a
// difference, so a month that had drifted is right after its next write.
func refreshCashBalance(tx core.App, key balanceKey) error {
	var sum cashMonthSum
	err := tx.DB().NewQuery(cashMonthSumSQL).
		Bind(dbx.Params{"account": key.account, "posted": true, "from": firstDayOf(key.period), "to": key.period + "-31"}).One(&sum)
	if err != nil {
		return fmt.Errorf("books: sum the cash-basis rows of %s %s: %w", key.account, key.period, err)
	}
	row, err := tx.FindFirstRecordByFilter(cashBalancesCollection,
		"account = {:account} && period = {:period}", dbx.Params{"account": key.account, "period": key.period})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("books: read cash month %s %s: %w", key.account, key.period, err)
	}
	if sum.Rows == 0 {
		if row == nil {
			return nil
		}
		if err := tx.Delete(row); err != nil {
			return fmt.Errorf("books: delete cash month %s %s: %w", key.account, key.period, err)
		}
		return nil
	}
	if sum.Debit > maxStoredAmount || sum.Credit > maxStoredAmount {
		return balanceOverflow(tx, key.account, key.period)
	}
	if row == nil {
		col, err := tx.FindCachedCollectionByNameOrId(cashBalancesCollection)
		if err != nil {
			return err
		}
		row = core.NewRecord(col)
		row.Set("account", key.account)
		row.Set("period", key.period)
	}
	// A cash row copies its journal line's currency; one written with none
	// takes its account's, because the stored month must name one.
	if sum.Currency == "" {
		account, err := tx.FindRecordById("books_accounts", key.account)
		if err != nil {
			return fmt.Errorf("books: read the account of cash month %s %s: %w", key.account, key.period, err)
		}
		sum.Currency = account.GetString("currency")
	}
	row.Set("month_start", firstDayOf(key.period))
	row.Set("debit_total", sum.Debit)
	row.Set("credit_total", sum.Credit)
	row.Set("currency", sum.Currency)
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: save cash month %s %s: %w", key.account, key.period, err)
	}
	return nil
}

// refreshCashBalances refreshes each month of months, in account then month
// order, so two writers take the rows in the same order.
func refreshCashBalances(tx core.App, months map[balanceKey]bool) error {
	keys := make([]balanceKey, 0, len(months))
	for k := range months {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].account != keys[j].account {
			return keys[i].account < keys[j].account
		}
		return keys[i].period < keys[j].period
	})
	for _, k := range keys {
		if err := refreshCashBalance(tx, k); err != nil {
			return err
		}
	}
	return nil
}

// verifyCashBalances reports every stored cash month that disagrees with the
// posted cash rows of its account and month: other totals, a month_start that
// is not the month's first day, a stored row whose month has no cash row, and
// a month with cash rows and no stored row (its stored fields are zero). The
// drift's Ledger fields hold the cash rows' sums.
func verifyCashBalances(app core.App) ([]BalanceDrift, error) {
	want, err := cashMonthTotals(app)
	if err != nil {
		return nil, err
	}
	stored, err := app.FindAllRecords(cashBalancesCollection)
	if err != nil {
		return nil, fmt.Errorf("books: read the cash months: %w", err)
	}
	var drifts []BalanceDrift
	seen := map[balanceKey]bool{}
	for _, row := range stored {
		key := balanceKey{row.GetString("account"), row.GetString("period")}
		seen[key] = true
		w, hasRows := want[key]
		if !hasRows || row.GetInt("debit_total") != w.debit || row.GetInt("credit_total") != w.credit ||
			row.GetString("month_start") != firstDayOf(key.period) {
			drifts = append(drifts, BalanceDrift{key.account, key.period,
				row.GetInt("debit_total"), row.GetInt("credit_total"), w.debit, w.credit, row.GetString("month_start")})
		}
	}
	for key, w := range want {
		if !seen[key] {
			drifts = append(drifts, BalanceDrift{key.account, key.period, 0, 0, w.debit, w.credit, ""})
		}
	}
	sort.Slice(drifts, func(i, j int) bool {
		if drifts[i].Account != drifts[j].Account {
			return drifts[i].Account < drifts[j].Account
		}
		return drifts[i].Period < drifts[j].Period
	})
	return drifts, nil
}

// rebuildCashBalances makes every stored cash month equal its cash rows,
// touching only the months that differ, and returns how many it fixed. It
// runs after rebuildCashBasis, which puts the cash rows right first.
func rebuildCashBalances(tx core.App) (int, error) {
	drifts, err := verifyCashBalances(tx)
	if err != nil {
		return 0, err
	}
	for _, d := range drifts {
		if err := refreshCashBalance(tx, balanceKey{d.Account, d.Period}); err != nil {
			return 0, err
		}
	}
	return len(drifts), nil
}
