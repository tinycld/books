package books

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// bankVectors is the shape of testdata/bank_import_vectors.json, which
// tests/bank-import.test.ts also runs, so the import preview and the server
// read a bank file's values the same way.
type bankVectors struct {
	Dates []struct {
		Text   string `json:"text"`
		Format string `json:"format"`
		Date   string `json:"date"`
		Error  string `json:"error"`
	} `json:"dates"`
	Amounts []struct {
		Text  string `json:"text"`
		Cents *int64 `json:"cents"`
		Error string `json:"error"`
	} `json:"amounts"`
}

func loadBankVectors(t *testing.T) bankVectors {
	t.Helper()
	src, err := os.ReadFile("testdata/bank_import_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v bankVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestParseBankDate_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Dates) == 0 {
		t.Fatal("no date vectors")
	}
	for _, c := range v.Dates {
		got, err := parseBankDate(c.Text, c.Format)
		if c.Error != "" {
			if err == nil || err.Error() != c.Error {
				t.Errorf("parseBankDate(%q, %q) = %q, %v; want error %q", c.Text, c.Format, got, err, c.Error)
			}
			continue
		}
		if err != nil || got != c.Date {
			t.Errorf("parseBankDate(%q, %q) = %q, %v; want %q", c.Text, c.Format, got, err, c.Date)
		}
	}
}

func TestParseBankAmount_Vectors(t *testing.T) {
	v := loadBankVectors(t)
	if len(v.Amounts) == 0 {
		t.Fatal("no amount vectors")
	}
	for _, c := range v.Amounts {
		got, err := parseBankAmount(c.Text)
		if c.Error != "" {
			if err == nil || err.Error() != c.Error {
				t.Errorf("parseBankAmount(%q) = %d, %v; want error %q", c.Text, got, err, c.Error)
			}
			continue
		}
		if c.Cents == nil {
			t.Fatalf("vector %q has neither cents nor error", c.Text)
		}
		if err != nil || got != *c.Cents {
			t.Errorf("parseBankAmount(%q) = %d, %v; want %d", c.Text, got, err, *c.Cents)
		}
	}
}

// The import row's date_format select offers exactly the formats Go reads.
func TestBankDateFormats_MatchTheSchema(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_bank_imports")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("date_format").(*core.SelectField)
	if !ok {
		t.Fatal("books_bank_imports.date_format is not a select field")
	}
	if !slices.Equal(field.Values, bankDateFormats) {
		t.Errorf("date_format values = %v, want bankDateFormats %v", field.Values, bankDateFormats)
	}
}
