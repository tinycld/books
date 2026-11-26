package cli

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The CLI does no arithmetic: every total, line amount and tax amount it
// prints is the server's, with the digits the server sent. That the server's
// numbers are the form's is proven in server/cli_document_totals_test.go.
func TestDocumentPrintsTheServersNumbersDigitForDigit(t *testing.T) {
	f := sales(t)
	// The largest amount Books stores (2^53-1), a quantity with decimals, and
	// totals that are not the sum of the lines: the CLI must not "correct" them.
	f.addRow("books_invoices", "invlarge0000001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-04", "due_date": "2026-12-04", "status": "posted", "number": "1002",
		"subtotal": json.Number("9007199254740991"), "tax_total": json.Number("61"), "total": json.Number("1000000000000000"),
		"balance": json.Number("-1"), "revision": cents(1),
	})
	f.addRow("books_invoice_lines", "invlargeline001", map[string]any{
		"invoice": "invlarge0000001", "position": cents(0), "kind": "item", "product": "prodservice0001",
		"quantity": json.Number("0.07"), "rate": cents(875), "amount": cents(61),
	})
	out, _, err := runCmd(t, f.serve(), "", "books", "invoices", "show", "invlarge0000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`"subtotal": 9007199254740991,`, `"tax_total": 61,`, `"total": 1000000000000000,`, `"balance": -1,`,
		`"quantity": 0.07,`, `"rate": 875,`, `"amount": 61,`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the invoice has no %s:\n%s", want, out)
		}
	}
	if strings.Contains(out, "e+") || strings.Contains(out, "E+") {
		t.Errorf("a number is printed with an exponent:\n%s", out)
	}
	table, _, err := runCmd(t, f.serve(), "", "books", "invoices", "show", "invlarge0000001")
	if err != nil || !strings.Contains(table, "9007199254740991") || !strings.Contains(table, "0.07") {
		t.Errorf("the table changes a number (%v):\n%s", err, table)
	}
}

// refuseComputedAmounts derives, from the lines the test sends, every amount the
// CLI would print if it did the form's arithmetic (quantity x rate, a percent of
// the line above, the line above less that percent), in cents and in dollars,
// and fails when one is in the output as a whole number. The fake computes none.
func refuseComputedAmounts(t *testing.T, input, out string) {
	t.Helper()
	var doc struct {
		Lines []struct {
			Kind       string  `json:"kind"`
			Quantity   float64 `json:"quantity"`
			Rate       float64 `json:"rate"`
			PercentPpm float64 `json:"percent_ppm"`
		} `json:"lines"`
	}
	if err := json.Unmarshal([]byte(input), &doc); err != nil {
		t.Fatal(err)
	}
	var products []float64
	above := 0.0
	for _, l := range doc.Lines {
		switch l.Kind {
		case "item":
			above = l.Quantity * l.Rate
			products = append(products, above)
		case "percent":
			pct := above * l.PercentPpm / 1e6
			products = append(products, pct, above+pct)
		}
	}
	if len(products) == 0 {
		t.Fatal("the input has no line to derive an amount from")
	}
	for _, p := range products {
		cents := []string{
			strconv.FormatFloat(p, 'f', -1, 64), strconv.FormatFloat(math.Round(p), 'f', -1, 64),
			strconv.FormatFloat(p, 'e', -1, 64), strconv.FormatFloat(p, 'g', -1, 64),
		}
		dollars := []string{strconv.FormatFloat(p/100, 'f', -1, 64), strconv.FormatFloat(p/100, 'f', 2, 64)}
		for _, s := range append(cents, dollars...) {
			s = strings.TrimPrefix(s, "-")
			if s == "0" || s == "0.00" {
				continue
			}
			if regexp.MustCompile(`(^|[^0-9.])` + regexp.QuoteMeta(s) + `($|[^0-9])`).MatchString(out) {
				t.Errorf("the CLI printed %s, an amount it computed from the lines:\n%s", s, out)
			}
		}
	}
}

// What `add` prints is read from the server after the write. The fake computes
// no total, so a total in the output could only be the CLI's own sum.
func TestDocumentAddPrintsNoTotalOfItsOwn(t *testing.T) {
	f := sales(t)
	fixedIDs(t, "invnew000000001")
	out, _, err := runCmd(t, f.serve(), newInvoice, "books", "invoices", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"subtotal": 0,`, `"tax_total": 0,`, `"total": 0,`, `"amount": 0,`} {
		if !strings.Contains(out, want) {
			t.Errorf("the invoice has no %s: the CLI computed a number\n%s", want, out)
		}
	}
	refuseComputedAmounts(t, newInvoice, out)
	// A quantity is sent with the digits the caller wrote.
	input := `{"customer": "custacme0000001", "date": "2026-11-04", "due_date": "2026-12-04", "lines": [
		{"kind": "item", "product": "prodservice0001", "quantity": 0.07, "rate": 875},
		{"kind": "item", "product": "prodservice0001", "quantity": 1000000, "rate": 1000000000}]}`
	fixedIDs(t, "invnew000000002")
	out, _, err = runCmd(t, f.serve(), input, "books", "invoices", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	refuseComputedAmounts(t, input, out)
	sent := sentBatch(t, f, 1)
	if !strings.Contains(sent, `"quantity":0.07,"rate":875`) || !strings.Contains(sent, `"quantity":1000000,"rate":1000000000`) {
		t.Errorf("the lines sent:\n%s", sent)
	}
}
