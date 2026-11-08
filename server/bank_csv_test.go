package books

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func requireRows(t *testing.T, got bankContent, wantColumns int, want []bankRow) {
	t.Helper()
	if got.Columns != wantColumns {
		t.Errorf("columns = %d, want %d", got.Columns, wantColumns)
	}
	if !reflect.DeepEqual(got.Rows, want) {
		t.Errorf("rows =\n%#v\nwant\n%#v", got.Rows, want)
	}
}

func TestParseBankCSV_TheSample(t *testing.T) {
	got, err := parseBankCSV([]byte(bankCSV))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Rows) != 7 || got.Columns != 3 {
		t.Fatalf("%d rows, %d columns; want 7 rows, 3 columns", len(got.Rows), got.Columns)
	}
	if want := (bankRow{Line: 1, Cells: []string{"Date", "Description", "Amount"}}); !reflect.DeepEqual(got.Rows[0], want) {
		t.Errorf("row 0 = %#v, want %#v", got.Rows[0], want)
	}
	if want := (bankRow{Line: 3, Cells: []string{"2026-09-05", "Card purchase - Office Depot", "-86.47"}}); !reflect.DeepEqual(got.Rows[2], want) {
		t.Errorf("row 2 = %#v, want %#v", got.Rows[2], want)
	}
	if got.StatementBalance != nil || got.StatementDate != "" {
		t.Errorf("a CSV file has no statement balance, got %v %q", got.StatementBalance, got.StatementDate)
	}
}

func TestParseBankCSV_QuotedFields(t *testing.T) {
	data := "Date,Description,Amount\r\n" +
		"2026-09-02,\"Deposit, Harbor \"\"Design\"\"\",4250.00\r\n" +
		"2026-09-03,\"Two\nlines\",-1.00\r\n" +
		"2026-09-04,After,-2.00\r\n"
	got, err := parseBankCSV([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{
		{Line: 1, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 2, Cells: []string{"2026-09-02", `Deposit, Harbor "Design"`, "4250.00"}},
		{Line: 3, Cells: []string{"2026-09-03", "Two\nlines", "-1.00"}},
		{Line: 5, Cells: []string{"2026-09-04", "After", "-2.00"}},
	})
}

func TestParseBankCSV_Delimiters(t *testing.T) {
	cases := []struct {
		name, data string
		rows       int
		want       []string
	}{
		{"semicolon", "Datum;Omschrijving;Bedrag\n02-09-2026;Koffie, groot;1.234,56\n", 2, []string{"02-09-2026", "Koffie, groot", "1.234,56"}},
		{"tab", "Date\tDescription\tAmount\n2026-09-02\tDeposit, cash\t4250.00\n", 2, []string{"2026-09-02", "Deposit, cash", "4250.00"}},
		{"comma wins a tie", "a,b;c\n1,2;3\n", 2, []string{"1", "2;3"}},
		{"quoted delimiters do not count", "\"a;b;c\",d\n1,2\n", 2, []string{"1", "2"}},
		{"a preamble line has no delimiter", "Rekening 4821\nDatum;Bedrag\n02-09-2026;12,50\n", 3, []string{"02-09-2026", "12,50"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := parseBankCSV([]byte(c.data))
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Rows) != c.rows || !reflect.DeepEqual(got.Rows[c.rows-1].Cells, c.want) {
				t.Errorf("rows = %#v, want %d rows, the last %#v", got.Rows, c.rows, c.want)
			}
		})
	}
}

func TestParseBankCSV_BOMAndWindows1252(t *testing.T) {
	t.Run("BOM", func(t *testing.T) {
		got, err := parseBankCSV([]byte("\xef\xbb\xbfDate,Amount\n2026-09-02,1.00\n"))
		if err != nil {
			t.Fatal(err)
		}
		if got.Rows[0].Cells[0] != "Date" {
			t.Errorf("first cell = %q, want Date without the BOM", got.Rows[0].Cells[0])
		}
	})
	t.Run("Windows-1252", func(t *testing.T) {
		got, err := parseBankCSV([]byte("2026-09-02,Caf\xe9 Lumi\xe8re \x80,-4.50\n"))
		if err != nil {
			t.Fatal(err)
		}
		if want := "Café Lumière €"; got.Rows[0].Cells[1] != want {
			t.Errorf("cell = %q, want %q", got.Rows[0].Cells[1], want)
		}
	})
	t.Run("UTF-8 stays", func(t *testing.T) {
		got, err := parseBankCSV([]byte("2026-09-02,Café,-4.50\n"))
		if err != nil {
			t.Fatal(err)
		}
		if got.Rows[0].Cells[1] != "Café" {
			t.Errorf("cell = %q, want Café", got.Rows[0].Cells[1])
		}
	})
}

func TestParseBankCSV_SkipsBlankRowsAndTrailingCells(t *testing.T) {
	data := "Account: 4821\n\nDate,Description,Amount,\n,,,\n  \n2026-09-02, Deposit ,4250.00,\n2026-09-03,Fee,-1.00,,\n"
	got, err := parseBankCSV([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{
		{Line: 1, Cells: []string{"Account: 4821"}},
		{Line: 3, Cells: []string{"Date", "Description", "Amount"}},
		{Line: 6, Cells: []string{"2026-09-02", "Deposit", "4250.00"}},
		{Line: 7, Cells: []string{"2026-09-03", "Fee", "-1.00"}},
	})
}

func TestParseBankCSV_RowLimit(t *testing.T) {
	var b strings.Builder
	b.WriteString("Date,Description,Amount\n")
	for i := range maxBankRows - 1 {
		fmt.Fprintf(&b, "2026-09-02,Row %d,1.00\n", i)
	}
	got, err := parseBankCSV([]byte(b.String()))
	if err != nil {
		t.Fatalf("exactly %d rows: %v", maxBankRows, err)
	}
	if len(got.Rows) != maxBankRows {
		t.Fatalf("%d rows, want %d", len(got.Rows), maxBankRows)
	}
	b.WriteString("2026-09-02,One too many,1.00\n")
	_, err = parseBankCSV([]byte(b.String()))
	requireRefused(t, err, "This file has more than 10,000 rows. Export a shorter date range from your bank.")
}

func TestParseBankCSV_HeaderOnly(t *testing.T) {
	got, err := parseBankCSV([]byte("Date,Description,Amount\n"))
	if err != nil {
		t.Fatal(err)
	}
	requireRows(t, got, 3, []bankRow{{Line: 1, Cells: []string{"Date", "Description", "Amount"}}})
}
