// Parsing a stored bank file into rows of text cells. The file is parsed once,
// when it is stored (server/banking.go); the import maps the cells later with
// the columns the person chose (server/bank_import.go).

package books

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
)

const (
	// maxBankRows bounds one file's rows: a year of a busy account fits, and the
	// mapping screen shows every row.
	maxBankRows        = 10000
	msgBankTooManyRows = "This file has more than 10,000 rows. Export a shorter date range from your bank."
)

// bankRow is one row of a bank file: its first line number in the file
// (1-based) and its cells, trimmed.
type bankRow struct {
	Line  int      `json:"line"`
	Cells []string `json:"cells"`
}

// bankContent is a parsed bank file. Columns is the widest row. An OFX file
// also states its ledger balance (minor units, as the bank states it) and the
// day of that balance; a CSV file has neither.
type bankContent struct {
	Columns          int
	Rows             []bankRow
	StatementBalance *int64
	StatementDate    string
}

// decodeBankText returns the file as text. A file that is not valid UTF-8 is
// read as Windows-1252, the encoding of most bank exports that are not UTF-8
// (an OFX 1 file says CHARSET:1252).
func decodeBankText(data []byte) string {
	if utf8.Valid(data) {
		return string(data)
	}
	text, err := charmap.Windows1252.NewDecoder().Bytes(data)
	if err != nil {
		// Windows-1252 maps every byte, so this does not happen; keep the bytes
		// with invalid sequences replaced rather than refuse the file.
		return strings.ToValidUTF8(string(data), "�")
	}
	return string(text)
}

// parseBankCSV reads every record of a CSV file. Blank records (no cell with
// text) are skipped, cells are trimmed, and empty cells at the end of a row
// are dropped, since many banks end every line with a delimiter.
func parseBankCSV(data []byte) (bankContent, error) {
	text := strings.TrimPrefix(decodeBankText(data), utf8BOM)
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = csvDelimiter(text)
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	var content bankContent
	for {
		record, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return bankContent{}, fmt.Errorf("books: read the CSV file: %w", err)
		}
		line, _ := r.FieldPos(0)
		cells := trimBankCells(record)
		if len(cells) == 0 {
			continue
		}
		if len(content.Rows) == maxBankRows {
			return bankContent{}, refuse(msgBankTooManyRows)
		}
		content.Rows = append(content.Rows, bankRow{Line: line, Cells: cells})
		content.Columns = max(content.Columns, len(cells))
	}
	return content, nil
}

// trimBankCells trims every cell and drops the empty cells at the end; a
// record with no text has no cells.
func trimBankCells(record []string) []string {
	cells := make([]string, len(record))
	last := -1
	for i, c := range record {
		cells[i] = trimBankText(c)
		if cells[i] != "" {
			last = i
		}
	}
	return cells[:last+1]
}

// csvDelimiter picks the delimiter of the first line that has one (a bank's
// preamble line such as "Account: 4821" has none).
func csvDelimiter(text string) rune {
	for line := range strings.SplitSeq(text, "\n") {
		if d, ok := bankLineDelimiter(line); ok {
			return d
		}
	}
	return ','
}

// bankLineDelimiter is the one of ",", ";" and tab that appears most often
// outside quotes in line, "," on a tie; ok is false when none appears.
func bankLineDelimiter(line string) (rune, bool) {
	counts := map[rune]int{}
	quoted := false
	for _, c := range line {
		switch {
		case c == '"':
			quoted = !quoted
		case !quoted && (c == ',' || c == ';' || c == '\t'):
			counts[c]++
		}
	}
	if len(counts) == 0 {
		return ',', false
	}
	best := ','
	for _, d := range []rune{';', '\t'} {
		if counts[d] > counts[best] {
			best = d
		}
	}
	return best, true
}
