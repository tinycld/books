package books

import (
	"strings"
	"testing"
)

// The statement email (spec §3.5): statementEmail is a pure function of one
// statementData and the business, so each case compares the whole subject and
// the whole text with a literal. The text ends with the business name, as the
// spec's block does.

const (
	seBusiness = "Cedar Ledger Co"
	sePhone    = "+1 214 555 1234"
	seCustomer = "Aspen Ridge Landscaping"
)

func seBusinessWithPhone() statementBusiness {
	return statementBusiness{Name: seBusiness, Phone: sePhone}
}

// seAging is the five aging figures in agingBands order.
func seAging(current, d30, d60, d90, d91 int64) []pdfAmount {
	cents := []int64{current, d30, d60, d90, d91}
	out := make([]pdfAmount, len(agingBands))
	for i, b := range agingBands {
		out[i] = pdfAmount{Label: b.label, Cents: cents[i]}
	}
	return out
}

// seOpenItems is an Open items statement of Aspen Ridge Landscaping on
// 2026-11-20 with the lines given; the figures are the caller's.
func seOpenItems(lines []statementLine, amountDue, pastDue int64, oldestDue string, aging []pdfAmount) statementData {
	return statementData{
		Type: statementTypeOpenItems, Number: "ST-1001", Currency: "USD",
		StatementDate: "2026-11-20", CustomerName: seCustomer,
		Lines: lines, AmountDue: amountDue, PastDue: pastDue, OldestDue: oldestDue,
		ItemCount: len(lines), Aging: aging,
	}
}

// seForward is a Balance forward statement of Aspen Ridge Landscaping for
// 2026-10-21 to 2026-11-20.
func seForward(opening, charges, credits, amountDue int64, lines []statementLine) statementData {
	return statementData{
		Type: statementTypeBalanceForward, Number: "ST-1002", Currency: "USD",
		StatementDate: "2026-11-20", StartDate: "2026-10-21", EndDate: "2026-11-20",
		CustomerName: seCustomer, Lines: lines,
		Opening: opening, Charges: charges, Credits: credits, AmountDue: amountDue,
	}
}

func requireEmail(t *testing.T, got statementMessage, subject, text string) {
	t.Helper()
	if got.Subject != subject {
		t.Errorf("subject = %q, want %q", got.Subject, subject)
	}
	if got.Text != text {
		t.Errorf("text =\n%s\n---- want ----\n%s\n---- (quoted) got %q", got.Text, text, got.Text)
	}
}

// Two past-due items and one current item: the full text of the spec's block.
func TestStatementEmail_OpenItemsWithPastDueItems(t *testing.T) {
	lines := []statementLine{
		{Date: "2026-09-15", Activity: "Invoice 1001", Due: "2026-10-15", Amount: 50000},
		{Date: "2026-10-02", Activity: "Invoice 1002", Due: "2026-11-01", Amount: 40000},
		{Date: "2026-11-01", Activity: "Invoice 1003", Due: "2026-12-01", Amount: 30000},
	}
	data := seOpenItems(lines, 120000, 90000, "2026-10-15", seAging(30000, 40000, 50000, 0, 0))
	requireEmail(t, statementEmail(data, seBusinessWithPhone()),
		"Statement ST-1001 from Cedar Ledger Co",
		"Hello Aspen Ridge Landscaping,\n"+
			"\n"+
			"Attached is statement ST-1001 from Cedar Ledger Co.\n"+
			"\n"+
			"Statement date: Nov 20, 2026\n"+
			"Amount due: $1,200.00\n"+
			"Past due: $900.00 (oldest due date Oct 15, 2026)\n"+
			"Open items: 3\n"+
			"\n"+
			"The attached PDF lists each open item.\n"+
			"\n"+
			"To pay, or to ask about this statement, reply to this email or call +1 214 555 1234.\n"+
			"\n"+
			"Cedar Ledger Co")
}

// Nothing past due, and a past-due sum below zero (a credit older than the
// invoices): the past-due line reads "Nothing is past due.".
func TestStatementEmail_OpenItemsNothingPastDue(t *testing.T) {
	want := func(amountDue, count string) string {
		return "Hello Aspen Ridge Landscaping,\n" +
			"\n" +
			"Attached is statement ST-1001 from Cedar Ledger Co.\n" +
			"\n" +
			"Statement date: Nov 20, 2026\n" +
			"Amount due: " + amountDue + "\n" +
			"Nothing is past due.\n" +
			"Open items: " + count + "\n" +
			"\n" +
			"The attached PDF lists each open item.\n" +
			"\n" +
			"To pay, or to ask about this statement, reply to this email or call +1 214 555 1234.\n" +
			"\n" +
			"Cedar Ledger Co"
	}
	t.Run("zero past due", func(t *testing.T) {
		lines := []statementLine{
			{Date: "2026-11-10", Activity: "Invoice 1004", Due: "2026-12-10", Amount: 25000},
		}
		data := seOpenItems(lines, 25000, 0, "", seAging(25000, 0, 0, 0, 0))
		requireEmail(t, statementEmail(data, seBusinessWithPhone()), "Statement ST-1001 from Cedar Ledger Co", want("$250.00", "1"))
	})
	t.Run("past due below zero", func(t *testing.T) {
		lines := []statementLine{
			{Date: "2026-08-01", Activity: "Credit memo 7", Due: "2026-08-01", Amount: -40000},
			{Date: "2026-11-01", Activity: "Invoice 1005", Due: "2026-11-15", Amount: 10000},
			{Date: "2026-11-12", Activity: "Invoice 1006", Due: "2026-12-12", Amount: 35000},
		}
		// The credit is 91 and over (−400.00), the invoice 1 - 30 (100.00):
		// past due is −300.00, so nothing is past due.
		data := seOpenItems(lines, 5000, -30000, "2026-11-15", seAging(35000, 10000, 0, 0, -40000))
		requireEmail(t, statementEmail(data, seBusinessWithPhone()), "Statement ST-1001 from Cedar Ledger Co", want("$50.00", "3"))
	})
}

// No open item: "Open items: none", an amount due of zero and the short
// closing.
func TestStatementEmail_OpenItemsWithNoItem(t *testing.T) {
	data := seOpenItems(nil, 0, 0, "", seAging(0, 0, 0, 0, 0))
	requireEmail(t, statementEmail(data, statementBusiness{Name: seBusiness}),
		"Statement ST-1001 from Cedar Ledger Co",
		"Hello Aspen Ridge Landscaping,\n"+
			"\n"+
			"Attached is statement ST-1001 from Cedar Ledger Co.\n"+
			"\n"+
			"Statement date: Nov 20, 2026\n"+
			"Amount due: $0.00. No payment is due.\n"+
			"Nothing is past due.\n"+
			"Open items: none\n"+
			"\n"+
			"The attached PDF lists each open item.\n"+
			"\n"+
			"To ask about this statement, reply to this email.\n"+
			"\n"+
			"Cedar Ledger Co")
}

// Balance forward: the period block; the payments and credits print with
// their minus sign as formatMoney prints it.
func TestStatementEmail_BalanceForward(t *testing.T) {
	lines := []statementLine{
		{Date: "2026-10-25", Activity: "Invoice 1007", Amount: 100000, Balance: 125000},
		{Date: "2026-11-05", Activity: "Payment 12", Amount: -30000, Balance: 95000},
	}
	data := seForward(25000, 100000, -30000, 95000, lines)
	requireEmail(t, statementEmail(data, seBusinessWithPhone()),
		"Statement ST-1002 from Cedar Ledger Co",
		"Hello Aspen Ridge Landscaping,\n"+
			"\n"+
			"Attached is statement ST-1002 from Cedar Ledger Co.\n"+
			"\n"+
			"Statement date: Nov 20, 2026\n"+
			"Period: Oct 21, 2026 to Nov 20, 2026\n"+
			"Balance forward: $250.00\n"+
			"New charges: $1,000.00\n"+
			"Payments and credits: -$300.00\n"+
			"Amount due: $950.00\n"+
			"\n"+
			"The attached PDF lists the activity of the period.\n"+
			"\n"+
			"To pay, or to ask about this statement, reply to this email or call +1 214 555 1234.\n"+
			"\n"+
			"Cedar Ledger Co")
}

// A period with no charge and no payment prints both sums as $0.00.
func TestStatementEmail_BalanceForwardQuietPeriod(t *testing.T) {
	data := seForward(25000, 0, 0, 25000, nil)
	requireEmail(t, statementEmail(data, seBusinessWithPhone()),
		"Statement ST-1002 from Cedar Ledger Co",
		"Hello Aspen Ridge Landscaping,\n"+
			"\n"+
			"Attached is statement ST-1002 from Cedar Ledger Co.\n"+
			"\n"+
			"Statement date: Nov 20, 2026\n"+
			"Period: Oct 21, 2026 to Nov 20, 2026\n"+
			"Balance forward: $250.00\n"+
			"New charges: $0.00\n"+
			"Payments and credits: $0.00\n"+
			"Amount due: $250.00\n"+
			"\n"+
			"The attached PDF lists the activity of the period.\n"+
			"\n"+
			"To pay, or to ask about this statement, reply to this email or call +1 214 555 1234.\n"+
			"\n"+
			"Cedar Ledger Co")
}

// A credit balance of −125.00, both types: "Credit balance: $125.00. No
// payment is due." and the short closing.
func TestStatementEmail_CreditBalance(t *testing.T) {
	t.Run("open items", func(t *testing.T) {
		lines := []statementLine{{Date: "2026-11-02", Activity: "Payment 14", Due: "2026-11-02", Amount: -12500}}
		data := seOpenItems(lines, -12500, -12500, "", seAging(0, -12500, 0, 0, 0))
		requireEmail(t, statementEmail(data, seBusinessWithPhone()),
			"Statement ST-1001 from Cedar Ledger Co",
			"Hello Aspen Ridge Landscaping,\n"+
				"\n"+
				"Attached is statement ST-1001 from Cedar Ledger Co.\n"+
				"\n"+
				"Statement date: Nov 20, 2026\n"+
				"Credit balance: $125.00. No payment is due.\n"+
				"Nothing is past due.\n"+
				"Open items: 1\n"+
				"\n"+
				"The attached PDF lists each open item.\n"+
				"\n"+
				"To ask about this statement, reply to this email or call +1 214 555 1234.\n"+
				"\n"+
				"Cedar Ledger Co")
	})
	t.Run("balance forward", func(t *testing.T) {
		lines := []statementLine{{Date: "2026-11-02", Activity: "Payment 14", Amount: -37500, Balance: -12500}}
		data := seForward(25000, 0, -37500, -12500, lines)
		requireEmail(t, statementEmail(data, seBusinessWithPhone()),
			"Statement ST-1002 from Cedar Ledger Co",
			"Hello Aspen Ridge Landscaping,\n"+
				"\n"+
				"Attached is statement ST-1002 from Cedar Ledger Co.\n"+
				"\n"+
				"Statement date: Nov 20, 2026\n"+
				"Period: Oct 21, 2026 to Nov 20, 2026\n"+
				"Balance forward: $250.00\n"+
				"New charges: $0.00\n"+
				"Payments and credits: -$375.00\n"+
				"Credit balance: $125.00. No payment is due.\n"+
				"\n"+
				"The attached PDF lists the activity of the period.\n"+
				"\n"+
				"To ask about this statement, reply to this email or call +1 214 555 1234.\n"+
				"\n"+
				"Cedar Ledger Co")
	})
}

// With no business phone the closing has no " or call" part.
func TestStatementEmail_NoBusinessPhone(t *testing.T) {
	lines := []statementLine{{Date: "2026-11-10", Activity: "Invoice 1004", Due: "2026-12-10", Amount: 25000}}
	data := seOpenItems(lines, 25000, 0, "", seAging(25000, 0, 0, 0, 0))
	got := statementEmail(data, statementBusiness{Name: seBusiness})
	requireEmail(t, got, "Statement ST-1001 from Cedar Ledger Co",
		"Hello Aspen Ridge Landscaping,\n"+
			"\n"+
			"Attached is statement ST-1001 from Cedar Ledger Co.\n"+
			"\n"+
			"Statement date: Nov 20, 2026\n"+
			"Amount due: $250.00\n"+
			"Nothing is past due.\n"+
			"Open items: 1\n"+
			"\n"+
			"The attached PDF lists each open item.\n"+
			"\n"+
			"To pay, or to ask about this statement, reply to this email.\n"+
			"\n"+
			"Cedar Ledger Co")
	if strings.Contains(got.Text, "or call") {
		t.Errorf("text holds \"or call\" with no business phone:\n%s", got.Text)
	}
}

// A line break in the business name becomes a space.
func TestStatementEmail_BusinessNameWithALineBreak(t *testing.T) {
	lines := []statementLine{{Date: "2026-11-10", Activity: "Invoice 1004", Due: "2026-12-10", Amount: 25000}}
	data := seOpenItems(lines, 25000, 0, "", seAging(25000, 0, 0, 0, 0))
	got := statementEmail(data, statementBusiness{Name: "Aspen Ridge\nLandscaping"})
	if want := "Statement ST-1001 from Aspen Ridge Landscaping"; got.Subject != want {
		t.Errorf("subject = %q, want %q", got.Subject, want)
	}
	if !strings.Contains(got.Text, "Attached is statement ST-1001 from Aspen Ridge Landscaping.\n") ||
		!strings.HasSuffix(got.Text, "\n\nAspen Ridge Landscaping") {
		t.Errorf("text does not name the business on one line:\n%s", got.Text)
	}
}

// The attachment's name: "statement-" + the number's stem + "-" + the
// customer name's stem; a name with no letter or digit adds nothing.
func TestStatementFileName(t *testing.T) {
	for _, c := range []struct{ customer, want string }{
		{"Aspen Ridge Landscaping", "statement-st-1001-aspen-ridge-landscaping"},
		{"?!/...", "statement-st-1001"},
	} {
		data := seOpenItems(nil, 0, 0, "", seAging(0, 0, 0, 0, 0))
		data.CustomerName = c.customer
		if got := statementFileName(data); got != c.want {
			t.Errorf("statementFileName(ST-1001, %q) = %q, want %q", c.customer, got, c.want)
		}
	}
}
