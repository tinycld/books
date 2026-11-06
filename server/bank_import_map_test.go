package books

import (
	"strings"
	"testing"
)

// bankRowVector is one row case of testdata/bank_import_vectors.json.
type bankRowVector struct {
	Name    string      `json:"name"`
	Cells   []string    `json:"cells"`
	Mapping bankMapping `json:"mapping"`
	Txn     *bankTxn    `json:"txn"`
	Error   string      `json:"error"`
}

func TestMapBankRow_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Rows) == 0 {
		t.Fatal("no row vectors")
	}
	for _, c := range v.Rows {
		t.Run(c.Name, func(t *testing.T) {
			got, err := mapBankRow(c.Cells, c.Mapping)
			if c.Error != "" {
				if err == nil || err.Error() != c.Error {
					t.Errorf("mapBankRow = %#v, %v; want error %q", got, err, c.Error)
				}
				return
			}
			if err != nil || c.Txn == nil || got != *c.Txn {
				t.Errorf("mapBankRow = %#v, %v; want %#v", got, err, c.Txn)
			}
		})
	}
}

func TestOFXMapping_MatchesTheVectors(t *testing.T) {
	if v := loadBankVectors(t); v.OFXMapping != ofxMapping {
		t.Errorf("ofxMapping = %#v, vectors say %#v", ofxMapping, v.OFXMapping)
	}
}

func TestMapBankRow_CutsLongText(t *testing.T) {
	long := strings.Repeat("é", 600)
	m := ofxMapping
	got, err := mapBankRow([]string{"2026-10-03", long, long, "-1.00", strings.Repeat("f", 300), strings.Repeat("9", 40)}, m)
	if err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(got.Description)); n != 500 {
		t.Errorf("description has %d runes, want 500", n)
	}
	if n := len([]rune(got.Memo)); n != 500 {
		t.Errorf("memo has %d runes, want 500", n)
	}
	if len(got.FitID) != 255 || len(got.CheckNumber) != 32 {
		t.Errorf("fitid %d, check %d; want 255 and 32", len(got.FitID), len(got.CheckNumber))
	}
}

func csvMapping() bankMapping {
	return bankMapping{HeaderRow: true, DateColumn: 1, DateFormat: "YYYY-MM-DD", DescriptionColumn: 2,
		AmountColumns: "one", AmountColumn: 3, AmountSign: "in_positive"}
}

func TestCheckMapping_Refusals(t *testing.T) {
	cases := []struct {
		name  string
		edit  func(m *bankMapping)
		field string
		want  string
	}{
		{"no date column", func(m *bankMapping) { m.DateColumn = 0 }, "date_column", "Choose the column that holds the date."},
		{"date column past the file", func(m *bankMapping) { m.DateColumn = 9 }, "date_column", "Column 9 is not in this file."},
		{"no date format", func(m *bankMapping) { m.DateFormat = "" }, "date_format", "Choose the date format of your file."},
		{"no description column", func(m *bankMapping) { m.DescriptionColumn = 0 }, "description_column", "Choose the column that holds the description."},
		{"no amount layout", func(m *bankMapping) { m.AmountColumns = "" }, "amount_columns", "Choose how many columns show amounts."},
		{"no amount column", func(m *bankMapping) { m.AmountColumn = 0 }, "amount_column", "Choose the column that holds the amount."},
		{"amount column past the file", func(m *bankMapping) { m.AmountColumn = 4 }, "amount_column", "Column 4 is not in this file."},
		{"bad sign", func(m *bankMapping) { m.AmountSign = "sideways" }, "amount_sign", "Choose whether a positive amount is money in or money out."},
		{"no money in", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyOutColumn = 3 }, "money_in_column", "Choose the column that holds money in."},
		{"no money out", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyInColumn = 3 }, "money_out_column", "Choose the column that holds money out."},
		{"in and out the same", func(m *bankMapping) { m.AmountColumns = "two"; m.MoneyInColumn = 3; m.MoneyOutColumn = 3 }, "money_out_column", "Money in and money out must be different columns."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m := csvMapping()
			c.edit(&m)
			requireFieldRefusal(t, checkMapping(m, 3), c.field, c.want)
		})
	}
	if err := checkMapping(csvMapping(), 3); err != nil {
		t.Errorf("a complete mapping was refused: %v", err)
	}
	two := csvMapping()
	two.AmountColumns, two.AmountColumn, two.MoneyInColumn, two.MoneyOutColumn = "two", 0, 3, 2
	if err := checkMapping(two, 3); err != nil {
		t.Errorf("a two-column mapping was refused: %v", err)
	}
	if err := checkMapping(ofxMapping, len(ofxColumns)); err != nil {
		t.Errorf("ofxMapping was refused: %v", err)
	}
}

func TestMapBankRows_HeaderAndErrors(t *testing.T) {
	rows := []bankRow{
		{Line: 1, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 2, Cells: []string{"2026-09-02", "Deposit", "4250.00"}},
		{Line: 4, Cells: []string{"2026-02-30", "Bad", "1.00"}},
	}
	header, results := mapBankRows(rows, csvMapping())
	if header != 1 || len(results) != 2 {
		t.Fatalf("header %d, %d results; want 1 and 2", header, len(results))
	}
	if results[0].Line != 2 || results[0].Err != "" || results[0].Txn.Amount != 425000 {
		t.Errorf("result 0 = %#v", results[0])
	}
	if results[1].Line != 4 || results[1].Err != `"2026-02-30" is not a date in the YYYY-MM-DD format.` {
		t.Errorf("result 1 = %#v", results[1])
	}
	noHeader := csvMapping()
	noHeader.HeaderRow = false
	header, results = mapBankRows(rows, noHeader)
	if header != 0 || len(results) != 3 || results[0].Err == "" {
		t.Errorf("without a header: header %d, results %#v", header, results)
	}
	if header, results := mapBankRows(nil, csvMapping()); header != 0 || len(results) != 0 {
		t.Errorf("no rows: header %d, results %#v", header, results)
	}
}

func TestBankRowHashes(t *testing.T) {
	ok := func(line int, date string, amount int64, description, fitid string) bankRowResult {
		return bankRowResult{Line: line, Txn: bankTxn{Date: date, Amount: amount, Description: description, FitID: fitid}}
	}
	file := []bankRowResult{
		ok(2, "2026-09-06", -2000, "Starbucks", ""),
		ok(3, "2026-09-06", -2000, "STARBUCKS  ", ""),
		{Line: 4, Err: "There is no amount."},
		ok(5, "2026-09-07", -2000, "Starbucks", ""),
		ok(6, "2026-10-03", -25000, "Smith & Sons", "A1"),
	}
	h := bankRowHashes("conn1", file)
	if len(h) != 4 {
		t.Fatalf("%d hashes, want 4 (none for the error row): %v", len(h), h)
	}
	if h[2] == h[3] {
		t.Error("two identical rows of one file share a hash; the second must count as a second occurrence")
	}
	if h[2] == h[5] {
		t.Error("rows on different days share a hash")
	}
	if len(h[2]) != 64 {
		t.Errorf("hash %q is not hex sha256", h[2])
	}
	// The same rows in another file (an overlapping statement) hash the same.
	again := bankRowHashes("conn1", []bankRowResult{ok(10, "2026-09-06", -2000, "starbucks", ""), ok(11, "2026-09-06", -2000, "Starbucks", "")})
	if again[10] != h[2] || again[11] != h[3] {
		t.Error("the same two rows in another file hash differently")
	}
	// A FITID decides alone: the bank's id names the transaction.
	renamed := bankRowHashes("conn1", []bankRowResult{ok(7, "2026-10-04", -25000, "Smith and Sons", "A1")})
	if renamed[7] != h[6] {
		t.Error("an OFX transaction with the same FITID hashes differently")
	}
	// Another connection never matches.
	if other := bankRowHashes("conn2", file); other[2] == h[2] || other[6] == h[6] {
		t.Error("a row hashes the same on another connection")
	}
}
