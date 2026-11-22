package books

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// statementBusiness is the sender of a statement email: the name it signs
// with and the phone the closing sentence names.
type statementBusiness struct {
	Name, Phone string
}

// statementMessage is a statement email's subject and plain-text body.
type statementMessage struct {
	Subject, Text string
}

// loadStatementBusiness reads the business name (books_settings.business_name,
// else the organization's name) and the business phone, as a document email
// reads them (loadDocumentBusiness).
func loadStatementBusiness(app core.App) (statementBusiness, error) {
	business, err := loadDocumentBusiness(app)
	if err != nil {
		return statementBusiness{}, err
	}
	return statementBusiness{Name: business.Name, Phone: business.Phone}, nil
}

// statementEmail fills a statement email (statements spec §3.5) from the
// statement's data: a pure function of the same value the attached PDF
// prints, so the message and the attachment cannot differ.
func statementEmail(data statementData, business statementBusiness) statementMessage {
	name := oneLine(business.Name)
	money := func(cents int64) string { return formatMoney(cents, data.Currency) }
	var b strings.Builder
	line := func(s string) {
		b.WriteString(s)
		b.WriteByte('\n')
	}
	line("Hello " + oneLine(data.CustomerName) + ",")
	line("")
	line("Attached is statement " + data.Number + " from " + name + ".")
	line("")
	line("Statement date: " + formatDay(data.StatementDate))
	if data.Type == statementTypeBalanceForward {
		line("Period: " + formatDay(data.StartDate) + " to " + formatDay(data.EndDate))
		line("Balance forward: " + money(data.Opening))
		line("New charges: " + money(data.Charges))
		line("Payments and credits: " + money(data.Credits))
		line(amountDueLine(data.AmountDue, money))
		line("")
		line("The attached PDF lists the activity of the period.")
	} else {
		line(amountDueLine(data.AmountDue, money))
		line(pastDueLine(data, money))
		line(openItemsLine(data.ItemCount))
		line("")
		line("The attached PDF lists each open item.")
	}
	line("")
	line(closingLine(data.AmountDue, business.Phone))
	line("")
	b.WriteString(name)
	return statementMessage{
		Subject: "Statement " + data.Number + " from " + name,
		Text:    b.String(),
	}
}

// lineBreaks turns each line break of a name into a space.
var lineBreaks = strings.NewReplacer("\r\n", " ", "\n", " ", "\r", " ")

func oneLine(s string) string {
	return lineBreaks.Replace(s)
}

func amountDueLine(amountDue int64, money func(int64) string) string {
	switch {
	case amountDue == 0:
		return "Amount due: " + money(0) + ". No payment is due."
	case amountDue < 0:
		return "Credit balance: " + money(-amountDue) + ". No payment is due."
	default:
		return "Amount due: " + money(amountDue)
	}
}

func pastDueLine(data statementData, money func(int64) string) string {
	if data.PastDue <= 0 {
		return "Nothing is past due."
	}
	text := "Past due: " + money(data.PastDue)
	if data.OldestDue != "" {
		text += " (oldest due date " + formatDay(data.OldestDue) + ")"
	}
	return text
}

func openItemsLine(count int) string {
	if count == 0 {
		return "Open items: none"
	}
	return fmt.Sprintf("Open items: %d", count)
}

// closingLine asks the customer to reply; "To pay, or" only when something is
// due, and the business phone when it is set.
func closingLine(amountDue int64, phone string) string {
	text := "To ask about this statement, reply to this email"
	if amountDue > 0 {
		text = "To pay, or to ask about this statement, reply to this email"
	}
	if phone != "" {
		text += " or call " + phone
	}
	return text + "."
}
