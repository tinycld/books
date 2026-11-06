package books

import (
	"fmt"
	"strings"
	"testing"
)

// ofxStatement is an OFX 1 (SGML) file of one bank statement around trns.
func ofxStatement(trns string) string {
	return "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX>\n" +
		"<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<CURDEF>USD\n<BANKTRANLIST>\n" +
		trns +
		"</BANKTRANLIST>\n" +
		"<LEDGERBAL><BALAMT>-1234.56<DTASOF>20261031120000[-5:EST]</LEDGERBAL>\n" +
		"</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n"
}

// lineOf is the 1-based line of the n-th (0-based) occurrence of tag in data.
func lineOf(data, tag string, n int) int {
	at := 0
	for range n + 1 {
		i := strings.Index(data[at:], tag)
		if i < 0 {
			return -1
		}
		at += i + len(tag)
	}
	return strings.Count(data[:at-len(tag)], "\n") + 1
}

func TestParseBankOFX_TheSample(t *testing.T) {
	got, err := parseBankOFX([]byte(bankOFX))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(bankOFX, "<STMTTRN>", 0), Cells: []string{"2026-10-01", "Harbor Design", "", "3100.00", "2026000001", "", "CREDIT"}},
	})
}

func TestParseBankOFX_SGMLFields(t *testing.T) {
	data := ofxStatement(
		"<STMTTRN>\n<TRNTYPE>CHECK\n<DTPOSTED>20261003\n<TRNAMT>-250.00\n<FITID>A1\n<CHECKNUM>1001\n<NAME>Smith &amp; Sons\n<MEMO>Invoice 1042\n</STMTTRN>\n" +
			"<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261004000000.000[-5:EST]\n<TRNAMT>-12.00\n<FITID>A2\n<PAYEE><NAME>Office Depot<ADDR1>1 Main St</PAYEE>\n" +
			"<STMTTRN>\n<TRNTYPE>FEE\n<DTPOSTED>2026\n<TRNAMT>-1.00\n<FITID>A3\n<MEMO>Monthly fee\n</STMTTRN>\n")
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(data, "<STMTTRN>", 0), Cells: []string{"2026-10-03", "Smith & Sons", "Invoice 1042", "-250.00", "A1", "1001", "CHECK"}},
		{Line: lineOf(data, "<STMTTRN>", 1), Cells: []string{"2026-10-04", "Office Depot", "", "-12.00", "A2", "", "DEBIT"}},
		{Line: lineOf(data, "<STMTTRN>", 2), Cells: []string{"2026", "Monthly fee", "", "-1.00", "A3", "", "FEE"}},
	})
	if got.StatementBalance == nil || *got.StatementBalance != -123456 || got.StatementDate != "2026-10-31" {
		t.Errorf("statement = %v %q, want -123456 2026-10-31", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankOFX_XML(t *testing.T) {
	data := `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261005</DTPOSTED><TRNAMT>-49.00</TRNAMT><FITID>C1</FITID><NAME>Clean Getaway Car</NAME></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-3410.17</BALAMT><DTASOF>20261031</DTASOF></LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>
`
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 7, []bankRow{
		{Line: lineOf(data, "<STMTTRN>", 0), Cells: []string{"2026-10-05", "Clean Getaway Car", "", "-49.00", "C1", "", "DEBIT"}},
	})
	if got.StatementBalance == nil || *got.StatementBalance != -341017 || got.StatementDate != "2026-10-31" {
		t.Errorf("statement = %v %q, want -341017 2026-10-31", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankOFX_LowercaseAndNoTransactions(t *testing.T) {
	got, err := parseBankOFX([]byte("<ofx>\n<bankmsgsrsv1><stmttrnrs><stmtrs>\n<curdef>USD\n</stmtrs></stmttrnrs></bankmsgsrsv1>\n</ofx>\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Rows) != 0 || got.Columns != 7 || got.StatementBalance != nil {
		t.Errorf("got %#v, want no rows, 7 columns, no balance", got)
	}
}

func TestParseBankOFX_Windows1252(t *testing.T) {
	data := ofxStatement("<STMTTRN>\n<DTPOSTED>20261003\n<TRNAMT>-4.50\n<FITID>B1\n<NAME>Caf\xe9\n</STMTTRN>\n")
	got, err := parseBankOFX([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	if got.Rows[0].Cells[1] != "Café" {
		t.Errorf("name = %q, want Café", got.Rows[0].Cells[1])
	}
}

func TestParseBankOFX_Refusals(t *testing.T) {
	two := "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>" +
		"<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST></BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>"
	_, err := parseBankOFX([]byte(two))
	requireRefused(t, err, "This file holds statements for 2 accounts. Export one account at a time.")

	_, err = parseBankOFX([]byte("OFXHEADER:100\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</STATUS></SONRS></SIGNONMSGSRSV1></OFX>"))
	requireRefused(t, err, "This OFX file holds no bank or credit card statement.")

	var b strings.Builder
	for i := range maxBankRows + 1 {
		fmt.Fprintf(&b, "<STMTTRN><DTPOSTED>20261003<TRNAMT>-1.00<FITID>F%d</STMTTRN>\n", i)
	}
	_, err = parseBankOFX([]byte(ofxStatement(b.String())))
	requireRefused(t, err, "This file has more than 10,000 rows.")
}
