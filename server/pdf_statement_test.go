package books

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The statement PDF (spec §3.6, §4.4): buildStatementData reads one run of the
// type's shipped report as the reader, and statementPDFDocument prints it with
// the Books document template. The ledger is checkpoint 1's report test
// (newSTBook, report_statements_test.go).

const psBusiness = "Cedar Ledger Co"

var psBilling = map[string]any{
	"line1": "4100 Ridge Rd", "line2": "Suite 12", "city": "Boulder", "region": "CO", "postal_code": "80301", "country": "",
}

// psPrepare names the business in the settings and gives Aspen Co a company
// and a billing address, and returns Aspen Co as stored.
func psPrepare(t *testing.T, b stBook) *core.Record {
	t.Helper()
	settings := reload(t, b.app, "books_settings", settingsID)
	settings.Set("business_name", psBusiness)
	if err := b.app.Save(settings); err != nil {
		t.Fatalf("save the business name: %v", err)
	}
	if err := setFields(t, b.app, "books_customers", b.aspen.Id, map[string]any{
		"company": "Aspen Holdings LLC", "billing_address": psBilling,
	}); err != nil {
		t.Fatalf("give Aspen Co a company and a billing address: %v", err)
	}
	return reload(t, b.app, "books_customers", b.aspen.Id)
}

func psBuild(t *testing.T, app core.App, auth *core.Record, in statementInput) statementData {
	t.Helper()
	data, err := buildStatementData(context.Background(), app, auth, in)
	if err != nil {
		t.Fatalf("buildStatementData: %v", err)
	}
	return data
}

// psText renders the statement's document and reads it back.
func psText(t *testing.T, data statementData) (int, string) {
	t.Helper()
	pdf, _ := render(t, statementPDFDocument(data), testOrg())
	return extractPDFText(t, pdf)
}

func requireTextHolds(t *testing.T, text string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(text, want) {
			t.Errorf("the PDF text has no %q:\n%s", want, text)
		}
	}
}

func psAddressLines() []string {
	return formatAddressLines(&postalAddress{
		Line1: "4100 Ridge Rd", Line2: "Suite 12", City: "Boulder", Region: "CO", PostalCode: "80301",
	})
}

// Balance forward: the opening, each line and the sums are the run's; the
// PDF prints the header, the party, the period and the table.
func TestStatementPDF_BalanceForward(t *testing.T) {
	b := newSTBook(t)
	aspen := psPrepare(t, b)
	g := stGroupOf(t, b.runForward(t, b.reader, stFrom, stToday, b.aspen), b.aspen)
	if g.opening == nil || g.total == nil || len(g.lines) == 0 {
		t.Fatalf("the run has no opening, total or line for Aspen Co: %v", g.kinds)
	}

	data := psBuild(t, b.app, b.reader, statementInput{
		Type: statementTypeBalanceForward, StatementDate: stToday, StartDate: stFrom, EndDate: stToday,
		Customer: aspen, Number: "ST-1001",
	})

	if want := stMoney(t, *g.opening, "balance"); data.Opening != want {
		t.Errorf("Opening = %d, want the run's %d", data.Opening, want)
	}
	if len(data.Lines) != len(g.lines) {
		t.Fatalf("%d lines, want the run's %d", len(data.Lines), len(g.lines))
	}
	var charges, credits int64
	for i, r := range g.lines {
		amount := stMoney(t, r, "amount")
		want := statementLine{
			Date:     stLineOf(t, b.app, r).GetString("date"),
			Activity: textCell(t, r, "activity"),
			Amount:   amount,
			Balance:  stMoney(t, r, "balance"),
		}
		if data.Lines[i] != want {
			t.Errorf("line %d = %+v, want %+v", i, data.Lines[i], want)
		}
		if amount > 0 {
			charges += amount
		} else {
			credits += amount
		}
	}
	if data.Charges != charges || data.Credits != credits {
		t.Errorf("Charges %d, Credits %d; want the line sums %d and %d", data.Charges, data.Credits, charges, credits)
	}
	if want := stMoney(t, *g.total, "balance"); data.AmountDue != want || want != -6000 {
		t.Errorf("AmountDue = %d, want the run's %d (-6000)", data.AmountDue, want)
	}

	pages, text := psText(t, data)
	if pages != 1 {
		t.Errorf("%d pages, want 1", pages)
	}
	requireTextHolds(t, text, "Statement", "No. ST-1001", "Statement date", formatDay(stToday),
		"Period", formatDay(stFrom), psBusiness, "To", "Aspen Co", "Aspen Holdings LLC")
	requireTextHolds(t, text, psAddressLines()...)
	requireTextHolds(t, text, "Amount due", formatMoney(-6000, "USD"), "Balance forward",
		"Date", "Activity", "Amount", "Balance", "Page 1 of 1")
	requireTextHolds(t, text, data.Lines[0].Activity)
}

// Open items: each item with its due date and open amount, the five aging
// figures, the past-due sum, the oldest past-due day and the item count.
func TestStatementPDF_OpenItems(t *testing.T) {
	b := newSTBook(t)
	aspen := psPrepare(t, b)
	row, items := stItems(t, b.runOpenItems(t, b.reader, stStatement, b.aspen), b.aspen)
	if len(items) == 0 {
		t.Fatal("the run has no item for Aspen Co")
	}

	data := psBuild(t, b.app, b.reader, statementInput{
		Type: statementTypeOpenItems, StatementDate: stStatement, Customer: aspen, Number: "ST-1002",
	})

	if len(data.Lines) != len(items) {
		t.Fatalf("%d lines, want the run's %d items", len(data.Lines), len(items))
	}
	oldest := ""
	for i, r := range items {
		want := statementLine{
			Date: fmt.Sprint(r.Cells["date"]), Activity: r.Label, Due: dueOf(r), Amount: stMoney(t, r, "total"),
		}
		if data.Lines[i] != want {
			t.Errorf("line %d = %+v, want %+v", i, data.Lines[i], want)
		}
		if want.Amount > 0 && want.Due < stStatement && (oldest == "" || want.Due < oldest) {
			oldest = want.Due
		}
	}
	if data.ItemCount != len(items) {
		t.Errorf("ItemCount = %d, want %d", data.ItemCount, len(items))
	}

	figure := func(col string) int64 {
		v, _ := moneyCell(t, row, col)
		return v
	}
	if len(data.Aging) != len(agingBands) {
		t.Fatalf("%d aging figures, want %d", len(data.Aging), len(agingBands))
	}
	var pastDue int64
	for i, band := range agingBands {
		want := pdfAmount{Label: band.label, Cents: figure(band.id)}
		if data.Aging[i] != want {
			t.Errorf("aging %d = %+v, want %+v", i, data.Aging[i], want)
		}
		if band.id != "current" {
			pastDue += want.Cents
		}
	}
	if data.PastDue != pastDue {
		t.Errorf("PastDue = %d, want the four past-due figures' sum %d", data.PastDue, pastDue)
	}
	// The one open item above zero is the invoice of 120.00 less the 30.00
	// applied, due on its date, before the statement date.
	if wantOldest := b.second.GetString("due_date"); data.OldestDue != oldest || oldest != wantOldest {
		t.Errorf("OldestDue = %q, want %q (computed %q)", data.OldestDue, wantOldest, oldest)
	}
	if want := figure("total"); data.AmountDue != want {
		t.Errorf("AmountDue = %d, want the customer row's Total %d", data.AmountDue, want)
	}

	_, text := psText(t, data)
	requireTextHolds(t, text, "No. ST-1002", "Date", "Activity", "Due date", "Open amount", "Amount due")
	for _, l := range data.Lines {
		requireTextHolds(t, text, l.Activity, formatDay(l.Due), formatMoney(l.Amount, "USD"))
	}
	// Each of the five bands prints its label with its own figure next to it,
	// a zero band's "$0.00" too.
	for _, a := range data.Aging {
		requireTextHolds(t, text, a.Label+" "+formatMoney(a.Cents, "USD"))
	}
}

// A statement of more rows than the engine's default page (200) still has
// every line and the run's whole figures: the run reads every row in one page.
func TestStatementPDF_MoreThanOnePageOfRows(t *testing.T) {
	b := newARBook(t)
	customer := mkCustomer(t, b.app, "Many Lines Co", "")
	const n = 205
	var sum int64
	for i := 0; i < n; i++ {
		cents := 1000 + i
		arInvoice(t, b, customer, fmt.Sprintf("2026-11-%02d", 1+i%28), "2026-12-15", cents)
		sum += int64(cents)
	}
	customer = reload(t, b.app, "books_customers", customer.Id)

	t.Run(statementTypeBalanceForward, func(t *testing.T) {
		data := psBuild(t, b.app, b.reader, statementInput{
			Type: statementTypeBalanceForward, StatementDate: "2026-11-30", StartDate: "2026-11-01", EndDate: "2026-11-30",
			Customer: customer, Number: "ST-1006",
		})
		if len(data.Lines) != n {
			t.Errorf("%d lines, want every one of the ledger's %d", len(data.Lines), n)
		}
		if data.Opening != 0 || data.Charges != sum || data.Credits != 0 || data.AmountDue != sum {
			t.Errorf("Opening %d, Charges %d, Credits %d, AmountDue %d; want 0, %d, 0, %d",
				data.Opening, data.Charges, data.Credits, data.AmountDue, sum, sum)
		}
	})
	t.Run(statementTypeOpenItems, func(t *testing.T) {
		data := psBuild(t, b.app, b.reader, statementInput{
			Type: statementTypeOpenItems, StatementDate: "2026-11-30", Customer: customer, Number: "ST-1007",
		})
		if len(data.Lines) != n || data.ItemCount != n {
			t.Errorf("%d lines, ItemCount %d; want every one of the ledger's %d items", len(data.Lines), data.ItemCount, n)
		}
		if data.AmountDue != sum || data.PastDue != 0 {
			t.Errorf("AmountDue %d, PastDue %d; want %d and 0", data.AmountDue, data.PastDue, sum)
		}
	})
}

// A statement with no line prints its header, the type's empty text and the
// amount due.
func TestStatementPDF_EmptyStatement(t *testing.T) {
	b := newSTBook(t)
	quiet := mkCustomer(t, b.app, "Quiet Co", "")
	for _, c := range []struct {
		in    statementInput
		empty string
	}{
		{statementInput{Type: statementTypeBalanceForward, StatementDate: stToday, StartDate: stFrom, EndDate: stToday,
			Customer: quiet, Number: "ST-1003"}, "No activity in this period."},
		{statementInput{Type: statementTypeOpenItems, StatementDate: stToday, Customer: quiet, Number: "ST-1004"},
			"Nothing is open on this day."},
	} {
		t.Run(c.in.Type, func(t *testing.T) {
			data := psBuild(t, b.app, b.reader, c.in)
			if len(data.Lines) != 0 || data.AmountDue != 0 || data.ItemCount != 0 {
				t.Errorf("lines %d, amount due %d, items %d; want none and 0", len(data.Lines), data.AmountDue, data.ItemCount)
			}
			_, text := psText(t, data)
			requireTextHolds(t, text, "Statement", "No. "+c.in.Number, "Quiet Co", c.empty, "Amount due", "$0.00")
		})
	}
}

// psLongData is an Open items statement of n lines, built with no ledger.
func psLongData(n int) statementData {
	data := statementData{
		Type: statementTypeOpenItems, Number: "ST-1005", Currency: "USD", StatementDate: "2026-11-20",
		CustomerName: "Long Co", Party: pdfParty{Label: "To", Name: "Long Co"},
		Company: pdfCompany{Name: psBusiness},
	}
	for i := 0; i < n; i++ {
		data.Lines = append(data.Lines, statementLine{
			Date: "2026-11-01", Activity: fmt.Sprintf("Invoice %d", 2000+i), Due: "2026-12-01", Amount: 1000,
		})
		data.AmountDue += 1000
	}
	data.ItemCount = n
	data.Aging = []pdfAmount{}
	for i, band := range agingBands {
		cents := int64(0)
		if i == 0 {
			cents = data.AmountDue
		}
		data.Aging = append(data.Aging, pdfAmount{Label: band.label, Cents: cents})
	}
	return data
}

// 80 lines take two pages; the table headings repeat on the second.
func TestStatementPDF_EightyLinesRepeatTheHeadings(t *testing.T) {
	pages, text := psText(t, psLongData(80))
	if pages != 2 {
		t.Errorf("%d pages, want 2", pages)
	}
	if n := strings.Count(text, "Open amount"); n != 2 {
		t.Errorf("the heading \"Open amount\" is in the text %d times, want 2 (once on each page):\n%s", n, text)
	}
	requireTextHolds(t, text, "Page 1 of 2", "Page 2 of 2")
}

// A preview has no number, so it prints no "No." line.
func TestStatementPDF_PreviewHasNoNumber(t *testing.T) {
	data := psLongData(2)
	data.Number = ""
	_, text := psText(t, data)
	requireTextHolds(t, text, "Statement", "Long Co")
	if strings.Contains(text, "No.") {
		t.Errorf("a preview prints a \"No.\" line:\n%s", text)
	}
}

// The run is the reader's: a user with no Books access gets no line and an
// amount due of 0, where a Books reader gets the ledger's.
func TestStatementPDF_RunsAsTheReader(t *testing.T) {
	b := newSTBook(t)
	aspen := reload(t, b.app, "books_customers", b.aspen.Id)
	for _, in := range []statementInput{
		{Type: statementTypeBalanceForward, StatementDate: stToday, StartDate: stFrom, EndDate: stToday, Customer: aspen},
		{Type: statementTypeOpenItems, StatementDate: stToday, Customer: aspen},
	} {
		t.Run(in.Type, func(t *testing.T) {
			if seen := psBuild(t, b.app, b.reader, in); len(seen.Lines) == 0 {
				t.Fatal("the Books reader gets no line, so the outsider's empty statement proves nothing")
			}
			data := psBuild(t, b.app, b.none, in)
			if len(data.Lines) != 0 || data.AmountDue != 0 || data.Opening != 0 {
				t.Errorf("a user with no Books access gets %d lines, opening %d, amount due %d; want none and 0",
					len(data.Lines), data.Opening, data.AmountDue)
			}
		})
	}
}
