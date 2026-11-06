// The import's mapping: which column of a bank file's rows holds what, and how
// a row becomes a bank transaction. Pure functions; server/bank_import.go
// reads the rows and writes the transactions. The import preview
// (tinycld/books/lib/bank-import.ts) maps rows the same way, and the row
// vectors in testdata/bank_import_vectors.json run on both sides.

package books

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const (
	// bankHashVersion starts every dedupe key, so a later change of the key
	// can tell old hashes from new ones.
	bankHashVersion         = "books-bank-v1"
	maxBankDescriptionRunes = 500
	maxBankFitIDRunes       = 255
	maxBankCheckRunes       = 32

	msgBankZeroAmount            = "The amount is 0."
	msgBankTwoAmounts            = "Both money in and money out have an amount."
	msgImportChooseDate          = "Choose the column that holds the date."
	msgImportChooseFormat        = "Choose the date format of your file."
	msgImportChooseDescription   = "Choose the column that holds the description."
	msgImportChooseAmountColumns = "Choose how many columns show amounts."
	msgImportChooseAmount        = "Choose the column that holds the amount."
	msgImportChooseIn            = "Choose the column that holds money in."
	msgImportChooseOut           = "Choose the column that holds money out."
	msgImportSameInOut           = "Money in and money out must be different columns."
	msgImportChooseSign          = "Choose whether a positive amount is money in or money out."
	msgImportNoColumn            = "Column %d is not in this file."
)

// bankMapping says which 1-based column holds what (0: none). The first nine
// fields are books_bank_imports fields; memo, FITID and check number are read
// only from an OFX file, whose columns are fixed (ofxMapping).
type bankMapping struct {
	HeaderRow         bool   `json:"header_row"`
	DateColumn        int    `json:"date_column"`
	DateFormat        string `json:"date_format"`
	DescriptionColumn int    `json:"description_column"`
	AmountColumns     string `json:"amount_columns"`
	AmountColumn      int    `json:"amount_column"`
	MoneyInColumn     int    `json:"money_in_column"`
	MoneyOutColumn    int    `json:"money_out_column"`
	AmountSign        string `json:"amount_sign"`
	MemoColumn        int    `json:"memo_column"`
	FitIDColumn       int    `json:"fitid_column"`
	CheckColumn       int    `json:"check_column"`
}

// ofxMapping reads the fixed columns of an OFX row (ofxColumns). OFX amounts
// are signed with money in positive.
var ofxMapping = bankMapping{
	DateColumn: 1, DateFormat: "YYYY-MM-DD", DescriptionColumn: 2, MemoColumn: 3,
	AmountColumns: "one", AmountColumn: 4, AmountSign: "in_positive", FitIDColumn: 5, CheckColumn: 6,
}

// mappingFromRecord is the import row's mapping, or ofxMapping for an OFX
// file, whatever the row says. A blank amount_sign means money in is positive.
func mappingFromRecord(r *core.Record, format string) bankMapping {
	if format == "ofx" {
		return ofxMapping
	}
	m := bankMapping{
		HeaderRow:         r.GetBool("header_row"),
		DateColumn:        r.GetInt("date_column"),
		DateFormat:        r.GetString("date_format"),
		DescriptionColumn: r.GetInt("description_column"),
		AmountColumns:     r.GetString("amount_columns"),
		AmountColumn:      r.GetInt("amount_column"),
		MoneyInColumn:     r.GetInt("money_in_column"),
		MoneyOutColumn:    r.GetInt("money_out_column"),
		AmountSign:        r.GetString("amount_sign"),
	}
	if m.AmountSign == "" {
		m.AmountSign = "in_positive"
	}
	return m
}

// writeTo records the mapping the import used on its row.
func (m bankMapping) writeTo(r *core.Record) {
	r.Set("header_row", m.HeaderRow)
	r.Set("date_column", m.DateColumn)
	r.Set("date_format", m.DateFormat)
	r.Set("description_column", m.DescriptionColumn)
	r.Set("amount_columns", m.AmountColumns)
	r.Set("amount_column", m.AmountColumn)
	r.Set("money_in_column", m.MoneyInColumn)
	r.Set("money_out_column", m.MoneyOutColumn)
	r.Set("amount_sign", m.AmountSign)
}

// checkMapping refuses a mapping that does not name every column it needs, or
// names one past the file's widest row, on the field the mapping form shows.
func checkMapping(m bankMapping, columns int) error {
	if err := checkBankColumn("date_column", m.DateColumn, columns, msgImportChooseDate); err != nil {
		return err
	}
	if !slices.Contains(bankDateFormats, m.DateFormat) {
		return refuseField("date_format", "%s", msgImportChooseFormat)
	}
	if err := checkBankColumn("description_column", m.DescriptionColumn, columns, msgImportChooseDescription); err != nil {
		return err
	}
	switch m.AmountColumns {
	case "one":
		if err := checkBankColumn("amount_column", m.AmountColumn, columns, msgImportChooseAmount); err != nil {
			return err
		}
		if m.AmountSign != "in_positive" && m.AmountSign != "out_positive" {
			return refuseField("amount_sign", "%s", msgImportChooseSign)
		}
	case "two":
		if err := checkBankColumn("money_in_column", m.MoneyInColumn, columns, msgImportChooseIn); err != nil {
			return err
		}
		if err := checkBankColumn("money_out_column", m.MoneyOutColumn, columns, msgImportChooseOut); err != nil {
			return err
		}
		if m.MoneyInColumn == m.MoneyOutColumn {
			return refuseField("money_out_column", "%s", msgImportSameInOut)
		}
	default:
		return refuseField("amount_columns", "%s", msgImportChooseAmountColumns)
	}
	return nil
}

func checkBankColumn(field string, column, columns int, choose string) error {
	if column < 1 {
		return refuseField(field, "%s", choose)
	}
	if column > columns {
		return refuseField(field, msgImportNoColumn, column)
	}
	return nil
}

// bankTxn is a row read as a bank transaction: amount in signed minor units,
// money in positive.
type bankTxn struct {
	Date        string `json:"date"`
	Description string `json:"description"`
	Memo        string `json:"memo"`
	Amount      int64  `json:"amount"`
	FitID       string `json:"fitid"`
	CheckNumber string `json:"checkNumber"`
}

// bankRowResult is one row mapped: its transaction, or the row's error.
type bankRowResult struct {
	Line int
	Txn  bankTxn
	Err  string
}

// mapBankRows maps every row but the header. header is the header row's line,
// 0 when the mapping has none or the file has no rows.
func mapBankRows(rows []bankRow, m bankMapping) (header int, results []bankRowResult) {
	if m.HeaderRow && len(rows) > 0 {
		header = rows[0].Line
		rows = rows[1:]
	}
	results = make([]bankRowResult, 0, len(rows))
	for _, row := range rows {
		txn, err := mapBankRow(row.Cells, m)
		res := bankRowResult{Line: row.Line, Txn: txn}
		if err != nil {
			res.Err = err.Error()
		}
		results = append(results, res)
	}
	return header, results
}

// mapBankRow reads one row: the date first, then the amount. Text is cut to
// what the transaction fields hold.
func mapBankRow(cells []string, m bankMapping) (bankTxn, error) {
	date, err := parseBankDate(bankCell(cells, m.DateColumn), m.DateFormat)
	if err != nil {
		return bankTxn{}, err
	}
	amount, err := bankRowAmount(cells, m)
	if err != nil {
		return bankTxn{}, err
	}
	return bankTxn{
		Date:        date,
		Description: truncateRunes(bankCell(cells, m.DescriptionColumn), maxBankDescriptionRunes),
		Memo:        truncateRunes(bankCell(cells, m.MemoColumn), maxBankDescriptionRunes),
		Amount:      amount,
		FitID:       truncateRunes(bankCell(cells, m.FitIDColumn), maxBankFitIDRunes),
		CheckNumber: truncateRunes(bankCell(cells, m.CheckColumn), maxBankCheckRunes),
	}, nil
}

// bankCell is the trimmed cell of a 1-based column, "" past the row's end.
func bankCell(cells []string, column int) string {
	if column < 1 || column > len(cells) {
		return ""
	}
	return strings.TrimSpace(cells[column-1])
}

// bankRowAmount is the row's signed amount. Two columns: money in minus money
// out, their signs ignored (banks write money out either way). One column:
// signed as written, flipped when positive means money out.
func bankRowAmount(cells []string, m bankMapping) (int64, error) {
	var amount int64
	if m.AmountColumns == "two" {
		in, out := bankCell(cells, m.MoneyInColumn), bankCell(cells, m.MoneyOutColumn)
		if in == "" && out == "" {
			return 0, errors.New(msgBankNoAmount)
		}
		var inCents, outCents int64
		if in != "" {
			v, err := parseBankAmount(in)
			if err != nil {
				return 0, err
			}
			inCents = absCents(v)
		}
		if out != "" {
			v, err := parseBankAmount(out)
			if err != nil {
				return 0, err
			}
			outCents = absCents(v)
		}
		if inCents != 0 && outCents != 0 {
			return 0, errors.New(msgBankTwoAmounts)
		}
		amount = inCents - outCents
	} else {
		v, err := parseBankAmount(bankCell(cells, m.AmountColumn))
		if err != nil {
			return 0, err
		}
		amount = v
		if m.AmountSign == "out_positive" {
			amount = -amount
		}
	}
	if amount == 0 {
		return 0, errors.New(msgBankZeroAmount)
	}
	return amount, nil
}

func absCents(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

// bankRowHashes keys each mapped row (by line) for dedupe on the connection.
// An OFX transaction is its FITID: the bank's own id. Any other row is its
// date, amount and description (case and spacing folded) and its occurrence
// among the identical rows before it in the file, so two real purchases alike
// in one file stay two, and the same two in an overlapping statement match.
// Error rows have no key.
func bankRowHashes(connectionID string, results []bankRowResult) map[int]string {
	hashes := make(map[int]string, len(results))
	seen := map[string]int{}
	for _, res := range results {
		if res.Err != "" {
			continue
		}
		var key string
		if res.Txn.FitID != "" {
			key = strings.Join([]string{bankHashVersion, connectionID, "fitid", res.Txn.FitID}, "\x1f")
		} else {
			base := strings.Join([]string{
				bankHashVersion, connectionID, "row", res.Txn.Date,
				strconv.FormatInt(res.Txn.Amount, 10), foldBankDescription(res.Txn.Description),
			}, "\x1f")
			seen[base]++
			key = base + "\x1f" + strconv.Itoa(seen[base])
		}
		sum := sha256.Sum256([]byte(key))
		hashes[res.Line] = hex.EncodeToString(sum[:])
	}
	return hashes
}

// foldBankDescription ignores case and spacing, which differ between a bank's
// exports of one transaction.
func foldBankDescription(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}
