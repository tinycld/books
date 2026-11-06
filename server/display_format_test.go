package books

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// displayVectors is testdata/display_format_vectors.json, which
// tests/display-format.test.ts also runs against the TS formatters.
type displayVectors struct {
	Money []struct {
		Cents    int64  `json:"cents"`
		Currency string `json:"currency"`
		Text     string `json:"text"`
	} `json:"money"`
	Day []struct {
		Day  string `json:"day"`
		Text string `json:"text"`
	} `json:"day"`
	Percent []struct {
		Ppm  int64  `json:"ppm"`
		Text string `json:"text"`
	} `json:"percent"`
	Address []struct {
		Address *postalAddress `json:"address"`
		Lines   []string       `json:"lines"`
	} `json:"address"`
}

func TestDisplayFormat_Vectors(t *testing.T) {
	src, err := os.ReadFile("testdata/display_format_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v displayVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Money) == 0 || len(v.Day) == 0 || len(v.Percent) == 0 || len(v.Address) == 0 {
		t.Fatal("a vector section is empty")
	}
	for _, row := range v.Money {
		if got := formatMoney(row.Cents, row.Currency); got != row.Text {
			t.Errorf("formatMoney(%d, %s) = %q, want %q", row.Cents, row.Currency, got, row.Text)
		}
	}
	for _, row := range v.Day {
		if got := formatDay(row.Day); got != row.Text {
			t.Errorf("formatDay(%s) = %q, want %q", row.Day, got, row.Text)
		}
	}
	for _, row := range v.Percent {
		if got := ratePercentText(row.Ppm); got != row.Text {
			t.Errorf("ratePercentText(%d) = %q, want %q", row.Ppm, got, row.Text)
		}
	}
	for _, row := range v.Address {
		if got := formatAddressLines(row.Address); !slices.Equal(got, row.Lines) {
			t.Errorf("formatAddressLines(%+v) = %q, want %q", row.Address, got, row.Lines)
		}
	}
}

// A day that does not parse prints as stored rather than as a wrong date. This
// case is outside the shared vectors on purpose: the TS formatter rolls
// "2026-02-30" over to a neighbouring date, but validate() refuses such days,
// so a stored document never holds one.
func TestDisplayFormat_UnparsableDayPrintsAsStored(t *testing.T) {
	if got := formatDay("2026-02-30"); got != "2026-02-30" {
		t.Errorf("formatDay = %q", got)
	}
}
