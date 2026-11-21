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

// applyToBalances adds the posted debits and credits of one account (a line,
// or an entry's lines of that account) to the account's month row. It runs
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
		if row, err = newBalanceRow(tx, account, period, currency); err != nil {
			return err
		}
	}
	debitTotal, creditTotal := row.GetInt("debit_total")+debit, row.GetInt("credit_total")+credit
	if debitTotal > maxStoredAmount || creditTotal > maxStoredAmount {
		return balanceOverflow(tx, account, period)
	}
	row.Set("debit_total", debitTotal)
	row.Set("credit_total", creditTotal)
	if err := tx.Save(row); err != nil {
		return fmt.Errorf("books: save balance %s %s: %w", account, period, err)
	}
	return nil
}

// firstDayOf is the first day of a month row's month ("2026-05" gives
// "2026-05-01"). A report reads it as the row's date (the source field
// month_start), because the report engine compares days, not months.
func firstDayOf(period string) string {
	return period + "-01"
}

// newBalanceRow is the month row of account for period, with no totals yet.
// Posting and the rebuild both make a row here, so month_start always agrees
// with period.
func newBalanceRow(tx core.App, account, period, currency string) (*core.Record, error) {
	col, err := tx.FindCachedCollectionByNameOrId("books_account_balances")
	if err != nil {
		return nil, err
	}
	row := core.NewRecord(col)
	row.Set("account", account)
	row.Set("period", period)
	row.Set("month_start", firstDayOf(period))
	row.Set("currency", currency)
	return row, nil
}

// balanceOverflow refuses a post that would take a month row past what a
// number field stores exactly (see maxStoredAmount).
func balanceOverflow(tx core.App, accountID, period string) error {
	name := accountID
	if account, err := tx.FindRecordById("books_accounts", accountID); err == nil {
		name = account.GetString("name")
	}
	return refuse("Posting this entry would take the balance of %s for %s past the largest amount Books can store (%s).",
		name, period, formatMinor(maxStoredAmount))
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
	// StoredMonthStart is the stored row's day, so a drift whose totals agree
	// still shows what differs.
	StoredMonthStart string `json:"storedMonthStart"`
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
		// A row whose month_start is not its month's first day is a drift too:
		// the totals agree, but a report that reads the row by its day (the
		// General Ledger's beginning balance) leaves it out or misplaces it.
		if row.GetInt("debit_total") != w.debit || row.GetInt("credit_total") != w.credit ||
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

// LineDrift is one journal line whose posting stamp disagrees with its entry.
type LineDrift struct {
	Line        string `db:"line" json:"line"`
	Entry       string `db:"entry" json:"entry"`
	EntryStatus string `db:"entry_status" json:"entryStatus"`
	Posted      bool   `db:"posted" json:"posted"`
	Date        string `db:"date" json:"date"`
	EntryDate   string `db:"entry_date" json:"entryDate"`
}

// verifyLinesSQL selects every line whose posted flag or date disagrees with
// its entry, and every line whose entry row is gone.
const verifyLinesSQL = `
	SELECT l.id AS line, l.entry AS entry, COALESCE(e.status, '') AS entry_status,
	       l.posted AS posted, l.date AS date, COALESCE(e.date, '') AS entry_date
	FROM books_journal_lines l
	LEFT JOIN books_journal_entries e ON e.id = l.entry
	WHERE e.id IS NULL
	   OR (e.status IN ({:posted}, {:void}) AND (l.posted = {:unstamped} OR l.date != e.date))
	   OR (e.status = {:draft} AND (l.posted = {:stamped} OR l.date != ''))
	ORDER BY l.entry, l.position, l.id`

// verifyLines reports every line whose posted flag or date disagrees with its
// entry: a line of a posted or void entry that is not stamped or carries
// another date, a line of a draft that is stamped or carries a date, and a
// line whose entry row is gone (its EntryStatus and EntryDate are empty).
// verifyBalances cannot see these: it sums by the entry's status and date,
// while every report and register selects lines by the line's own stamp. The
// line guard (checkLineStamp) lets only a post write the stamp, so a row here
// was written past the hooks.
func verifyLines(app core.App) ([]LineDrift, error) {
	drifts := []LineDrift{}
	err := app.DB().NewQuery(verifyLinesSQL).Bind(dbx.Params{
		"posted": statusPosted, "void": statusVoid, "draft": statusDraft,
		"stamped": true, "unstamped": false,
	}).All(&drifts)
	if err != nil {
		return nil, fmt.Errorf("books: compare the lines with their entries: %w", err)
	}
	return drifts, nil
}

// maxLineDriftsReported bounds the lines the rebuild route lists: a large
// drift (a bad import past the hooks) must not make one response of every line.
const maxLineDriftsReported = 100

// lineDriftReport is what the rebuild route answers: the first
// maxLineDriftsReported drifts and the count of all of them.
func lineDriftReport(drifts []LineDrift) (listed []LineDrift, count int) {
	if len(drifts) > maxLineDriftsReported {
		return drifts[:maxLineDriftsReported], len(drifts)
	}
	return drifts, len(drifts)
}

// cashDriftReport is the cash-basis part of the rebuild route's answer: the
// first maxLineDriftsReported documents that drifted and the count of all.
func cashDriftReport(drifts []CashBasisDrift) (listed []CashBasisDrift, count int) {
	if len(drifts) > maxLineDriftsReported {
		return drifts[:maxLineDriftsReported], len(drifts)
	}
	return drifts, len(drifts)
}

// receivableDriftReport is the stored-receivable part of the rebuild route's
// answer: the first maxReceivableDriftsReported rows that drifted and the count
// of all.
func receivableDriftReport(drifts []ReceivableDrift) (listed []ReceivableDrift, count int) {
	if len(drifts) > maxReceivableDriftsReported {
		return drifts[:maxReceivableDriftsReported], len(drifts)
	}
	return drifts, len(drifts)
}

// rebuildBalances makes every month row equal the ledger, every invoice's and
// bill's balance equal its total less the posted payments that pay it (the
// verify part of the document balances is verifyDocumentBalances), and every
// cash-basis row equal what the entries and payments give (rebuildCashBasis;
// its verify part is verifyCashBasis), and every stored cash month equal its
// cash rows (rebuildCashBalances; its verify part is verifyCashBalances), in
// one transaction, touching only the rows that differ. It returns how many
// month rows, document balances, cash-basis rows and cash months it fixed. It
// also rebuilds the stored receivable rows when they disagree with the book
// (repairReceivables); those rows are not in the count.
func rebuildBalances(app core.App) (int, error) {
	fixed := 0
	err := app.RunInTransaction(func(tx core.App) error {
		documents, err := rebuildDocumentBalances(tx)
		if err != nil {
			return err
		}
		cash, err := rebuildCashBasis(tx)
		if err != nil {
			return err
		}
		cashMonths, err := rebuildCashBalances(tx)
		if err != nil {
			return err
		}
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
				if row, err = newBalanceRow(tx, d.Account, d.Period, w.currency); err != nil {
					return err
				}
			}
			row.Set("month_start", firstDayOf(d.Period))
			row.Set("debit_total", w.debit)
			row.Set("credit_total", w.credit)
			if err := tx.Save(row); err != nil {
				return fmt.Errorf("books: save rebuilt balance row: %w", err)
			}
		}
		fixed = len(drifts) + documents + cash + cashMonths
		return repairReceivables(tx)
	})
	return fixed, err
}

// bindBalanceRoutes mounts a Books route: a maintenance action, not a
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
		// Read before the rebuild repairs them: every write path rebuilds its
		// documents' cash-basis rows, so a drift here means one missed it. The answer lists them.
		cashDrifts, err := verifyCashBasis(re.App)
		if err != nil {
			return err
		}
		if len(cashDrifts) > 0 {
			log.ErrorContext(re.Request.Context(), "cash-basis rows disagree with their documents", "count", len(cashDrifts))
		}
		// Read before the rebuild repairs them, as the cash-basis rows above.
		receivableDrifts, err := verifyReceivables(re.App)
		if err != nil {
			return err
		}
		if len(receivableDrifts) > 0 {
			log.ErrorContext(re.Request.Context(), "receivable rows disagree with the book", "count", len(receivableDrifts))
		}
		// Every write path keeps a document's balance and an invoice's
		// written_off with its payers, so a drift here means one missed it.
		// The answer lists each with the field that drifted.
		documentDrifts, err := verifyDocumentBalances(re.App)
		if err != nil {
			return err
		}
		if len(documentDrifts) > 0 {
			log.ErrorContext(re.Request.Context(), "document balances disagree with their payers",
				"count", len(documentDrifts), "fields", documentDriftFields(documentDrifts))
		}
		fixed, err := rebuildBalances(re.App)
		if err != nil {
			return err
		}
		// The rebuild repairs month rows, document balances and cash-basis rows. A line that disagrees with
		// its entry is reported, and logged as an error so it reaches
		// Sentry: no write through the hooks makes one.
		lineDrifts, err := verifyLines(re.App)
		if err != nil {
			return err
		}
		if len(lineDrifts) > 0 {
			log.ErrorContext(re.Request.Context(), "journal lines disagree with their entries", "count", len(lineDrifts))
		}
		listed, count := lineDriftReport(lineDrifts)
		cashListed, cashCount := cashDriftReport(cashDrifts)
		receivableListed, receivableCount := receivableDriftReport(receivableDrifts)
		documentListed, documentCount := documentDriftReport(documentDrifts)
		return re.JSON(http.StatusOK, map[string]any{
			"fixed": fixed, "lineDrifts": listed, "lineDriftCount": count,
			"cashDrifts": cashListed, "cashDriftCount": cashCount,
			"receivableDrifts": receivableListed, "receivableDriftCount": receivableCount,
			"documentDrifts": documentListed, "documentDriftCount": documentCount,
		})
	})
}

// documentDriftReport is the document part of the rebuild route's answer: the
// first maxLineDriftsReported drifts, each naming its field (balance or
// written_off), and the count of all.
func documentDriftReport(drifts []DocumentBalanceDrift) (listed []DocumentBalanceDrift, count int) {
	if len(drifts) > maxLineDriftsReported {
		return drifts[:maxLineDriftsReported], len(drifts)
	}
	return drifts, len(drifts)
}

// documentDriftFields lists the drifted fields once each, in the order found,
// as "invoice.balance", for the log.
func documentDriftFields(drifts []DocumentBalanceDrift) []string {
	var fields []string
	seen := map[string]bool{}
	for _, d := range drifts {
		name := d.Kind + "." + d.Field
		if !seen[name] {
			seen[name] = true
			fields = append(fields, name)
		}
	}
	return fields
}
