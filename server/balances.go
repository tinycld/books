package books

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// applyToBalances adds one posted line to its account's month row. It runs
// inside the posting transaction, so the row and the line commit together.
// Saved through tx.Save rather than an UPSERT so realtime reaches every
// client reading the row.
func applyToBalances(tx core.App, account, day string, debit, credit int, currency string) error {
	period := periodOf(day)
	row, err := tx.FindFirstRecordByFilter("books_account_balances",
		"account = {:account} && period = {:period}", dbx.Params{"account": account, "period": period})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("books: read balance %s %s: %w", account, period, err)
	}
	if row == nil {
		col, err := tx.FindCachedCollectionByNameOrId("books_account_balances")
		if err != nil {
			return err
		}
		row = core.NewRecord(col)
		row.Set("account", account)
		row.Set("period", period)
		row.Set("currency", currency)
	}
	row.Set("debit_total", row.GetInt("debit_total")+debit)
	row.Set("credit_total", row.GetInt("credit_total")+credit)
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: save balance %s %s: %w", account, period, err)
	}
	return nil
}

type balanceKey struct{ account, period string }

type balanceTotals struct {
	debit, credit int
	currency      string
}

// ledgerTotals sums every line of every entry that was posted, by account and
// month. Void entries count too: a void keeps the original in the ledger and
// adds a reversal that cancels it, so both sides are needed to net to zero.
// This is the source of truth the balance rows must equal.
func ledgerTotals(app core.App) (map[balanceKey]balanceTotals, error) {
	var rows []struct {
		Account  string `db:"account"`
		Period   string `db:"period"`
		Debit    int    `db:"debit"`
		Credit   int    `db:"credit"`
		Currency string `db:"currency"`
	}
	err := app.DB().NewQuery(`
		SELECT l.account AS account,
		       substr(e.date, 1, 7) AS period,
		       CAST(SUM(l.debit) AS INTEGER) AS debit,
		       CAST(SUM(l.credit) AS INTEGER) AS credit,
		       MAX(e.currency) AS currency
		FROM books_journal_lines l
		JOIN books_journal_entries e ON e.id = l.entry
		WHERE e.status IN ('posted', 'void')
		GROUP BY l.account, substr(e.date, 1, 7)`).All(&rows)
	if err != nil {
		return nil, fmt.Errorf("books: sum the ledger: %w", err)
	}
	out := make(map[balanceKey]balanceTotals, len(rows))
	for _, r := range rows {
		out[balanceKey{r.Account, r.Period}] = balanceTotals{r.Debit, r.Credit, r.Currency}
	}
	return out, nil
}

// BalanceDrift is one month row that disagrees with the ledger.
type BalanceDrift struct {
	Account      string `json:"account"`
	Period       string `json:"period"`
	StoredDebit  int    `json:"storedDebit"`
	StoredCredit int    `json:"storedCredit"`
	LedgerDebit  int    `json:"ledgerDebit"`
	LedgerCredit int    `json:"ledgerCredit"`
}

func verifyBalances(app core.App) ([]BalanceDrift, error) {
	want, err := ledgerTotals(app)
	if err != nil {
		return nil, err
	}
	stored, err := app.FindAllRecords("books_account_balances")
	if err != nil {
		return nil, fmt.Errorf("books: read balance rows: %w", err)
	}
	var drifts []BalanceDrift
	seen := map[balanceKey]bool{}
	for _, row := range stored {
		key := balanceKey{row.GetString("account"), row.GetString("period")}
		seen[key] = true
		w := want[key]
		if row.GetInt("debit_total") != w.debit || row.GetInt("credit_total") != w.credit {
			drifts = append(drifts, BalanceDrift{key.account, key.period,
				row.GetInt("debit_total"), row.GetInt("credit_total"), w.debit, w.credit})
		}
	}
	for key, w := range want {
		if !seen[key] {
			drifts = append(drifts, BalanceDrift{key.account, key.period, 0, 0, w.debit, w.credit})
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

// rebuildBalances makes every month row equal the ledger, in one transaction,
// touching only the rows that differ. It returns how many it fixed.
func rebuildBalances(app core.App) (int, error) {
	fixed := 0
	err := app.RunInTransaction(func(tx core.App) error {
		drifts, err := verifyBalances(tx)
		if err != nil {
			return err
		}
		want, err := ledgerTotals(tx)
		if err != nil {
			return err
		}
		for _, d := range drifts {
			row, err := tx.FindFirstRecordByFilter("books_account_balances",
				"account = {:account} && period = {:period}", dbx.Params{"account": d.Account, "period": d.Period})
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			w, inLedger := want[balanceKey{d.Account, d.Period}]
			if !inLedger {
				if err := tx.Delete(row); err != nil {
					return fmt.Errorf("books: delete stray balance row: %w", err)
				}
				continue
			}
			if row == nil {
				col, err := tx.FindCachedCollectionByNameOrId("books_account_balances")
				if err != nil {
					return err
				}
				row = core.NewRecord(col)
				row.Set("account", d.Account)
				row.Set("period", d.Period)
				row.Set("currency", w.currency)
			}
			row.Set("debit_total", w.debit)
			row.Set("credit_total", w.credit)
			if err := tx.Save(row); err != nil {
				return fmt.Errorf("books: save rebuilt balance row: %w", err)
			}
		}
		fixed = len(drifts)
		return nil
	})
	return fixed, err
}

// bindBalanceRoutes mounts the one Books route: a maintenance action, not a
// data endpoint (the rows it fixes reach clients through their live queries).
// Session only: it is not in the OAuth registration, so a token cannot call it.
func bindBalanceRoutes(e *core.ServeEvent) {
	e.Router.POST("/api/books/balances/rebuild", func(re *core.RequestEvent) error {
		level, err := levelFor(re.App, re.Auth)
		if err != nil {
			return err
		}
		if !level.IsAdmin() {
			return re.ForbiddenError("Only a Books admin can rebuild balances.", nil)
		}
		fixed, err := rebuildBalances(re.App)
		if err != nil {
			return err
		}
		return re.JSON(http.StatusOK, map[string]int{"fixed": fixed})
	})
}
