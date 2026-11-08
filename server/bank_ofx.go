// Parsing an OFX bank file (also .qfx and .qbo). OFX 1 is SGML, where a value
// tag is not closed (<NAME>Harbor Design) and an aggregate is; OFX 2 is XML,
// where every tag is closed. One reader serves both: a value is the text after
// a tag up to the next "<", and closing tags of values are ignored.

package books

import (
	"html"
	"strings"
)

const (
	msgOFXNoStatement    = "This OFX file holds no bank or credit card statement."
	msgOFXManyStatements = "This file holds statements for %d accounts. Export one account at a time."
)

// ofxColumns are the cells of an OFX row, in order. The import reads them with
// ofxMapping (server/bank_import_map.go); tinycld/books/lib/bank-import.ts
// mirrors them as OFX_COLUMNS for the mapping screen.
var ofxColumns = []string{"Date", "Description", "Memo", "Amount", "Transaction ID", "Check number", "Type"}

// ofxTxn is one STMTTRN aggregate as it is read.
type ofxTxn struct {
	line                                         int
	date, name, memo, amount, fitid, check, kind string
}

func (t *ofxTxn) set(tag, value string) {
	switch tag {
	case "DTPOSTED":
		t.date = ofxDay(value)
	case "NAME":
		t.name = value
	case "MEMO":
		t.memo = value
	case "TRNAMT":
		t.amount = value
	case "FITID":
		t.fitid = value
	case "CHECKNUM":
		t.check = value
	case "TRNTYPE":
		t.kind = value
	}
}

func (t *ofxTxn) cells() []string {
	description, memo := t.name, t.memo
	if description == "" {
		description, memo = memo, ""
	}
	return []string{t.date, description, memo, t.amount, t.fitid, t.check, t.kind}
}

// ofxDay turns an OFX date-time (YYYYMMDD, then an optional time and zone)
// into YYYY-MM-DD, the day as the bank wrote it. Text that does not start with
// eight digits is kept, so the import shows it in its row error.
func ofxDay(s string) string {
	if len(s) < 8 || !isASCIIDigits(s[:8]) {
		return s
	}
	return s[:4] + "-" + s[4:6] + "-" + s[6:8]
}

// parseBankOFX reads the transactions and the ledger balance of the one bank
// (STMTRS) or credit card (CCSTMTRS) statement of an OFX file. A file with no
// statement, or with statements for several accounts, is refused: a file
// belongs to one connection.
func parseBankOFX(data []byte) (bankContent, error) {
	text := decodeBankText(data)
	content := bankContent{Columns: len(ofxColumns)}
	var (
		statements    int
		txn           *ofxTxn
		inLedger      bool
		balance, asOf string
		line          = 1
		counted       int
	)
	flush := func() error {
		if txn == nil {
			return nil
		}
		if len(content.Rows) == maxBankRows {
			return refuse(msgBankTooManyRows)
		}
		content.Rows = append(content.Rows, bankRow{Line: txn.line, Cells: txn.cells()})
		txn = nil
		return nil
	}
	for pos := 0; ; {
		open := strings.IndexByte(text[pos:], '<')
		if open < 0 {
			break
		}
		open += pos
		end := strings.IndexByte(text[open:], '>')
		if end < 0 {
			break
		}
		end += open
		line += strings.Count(text[counted:open], "\n")
		counted = open
		tag := strings.ToUpper(strings.TrimSpace(text[open+1 : end]))
		valueEnd := len(text)
		if next := strings.IndexByte(text[end+1:], '<'); next >= 0 {
			valueEnd = end + 1 + next
		}
		value := strings.TrimSpace(html.UnescapeString(text[end+1 : valueEnd]))
		pos = end + 1
		switch tag {
		case "STMTRS", "CCSTMTRS":
			statements++
		case "STMTTRN":
			if err := flush(); err != nil {
				return bankContent{}, err
			}
			txn = &ofxTxn{line: line}
		case "/STMTTRN", "/BANKTRANLIST", "/STMTRS", "/CCSTMTRS", "/OFX":
			if err := flush(); err != nil {
				return bankContent{}, err
			}
		case "LEDGERBAL":
			inLedger = true
		case "/LEDGERBAL":
			inLedger = false
		case "BALAMT":
			if inLedger {
				balance = value
			}
		case "DTASOF":
			if inLedger {
				asOf = value
			}
		default:
			if txn != nil {
				txn.set(tag, value)
			}
		}
	}
	if err := flush(); err != nil {
		return bankContent{}, err
	}
	if statements == 0 {
		return bankContent{}, refuse(msgOFXNoStatement)
	}
	if statements > 1 {
		return bankContent{}, refuse(msgOFXManyStatements, statements)
	}
	if cents, err := parseBankAmount(balance); err == nil {
		if day, err := parseBankDate(ofxDay(asOf), "YYYY-MM-DD"); err == nil {
			content.StatementBalance = &cents
			content.StatementDate = day
		}
	}
	return content, nil
}
