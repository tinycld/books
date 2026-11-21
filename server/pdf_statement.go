package books

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// A customer statement as printed and as emailed (statements spec §3.5, §3.6,
// §4.4). buildStatementData reads one run of the type's shipped report as the
// reader; the PDF (statementPDFDocument), the email (statementEmail) and the
// file name (statementFileName) all read that one value, so they cannot
// differ, and none runs the report again.

// statementInput is one statement to build: a stored row's fields, or a
// preview's options for one customer (Number "": a preview has no number).
type statementInput struct {
	Type, StatementDate, StartDate, EndDate string
	Customer                                *core.Record
	Number                                  string
}

// statementLine is one line of a statement. A Balance forward line has its
// amount and the running balance after it; an Open items line has its due day
// and its open amount (Amount).
type statementLine struct {
	Date, Activity, Due string
	Amount, Balance     int64
}

// statementData is one statement's figures, from one report run.
type statementData struct {
	Type, Number, Currency            string
	StatementDate, StartDate, EndDate string
	CustomerName                      string
	Party                             pdfParty
	Company                           pdfCompany
	Lines                             []statementLine
	// Balance forward: the balance before the start day, and the sums of the
	// period's positive (Charges) and negative (Credits) line amounts.
	Opening, Charges, Credits int64
	AmountDue                 int64
	// Open items: the sum of the four past-due aging figures, the earliest due
	// day before the statement date of a line with an open amount above zero,
	// and the line count.
	PastDue   int64
	OldestDue string
	ItemCount int
	// Aging is the five aging figures of an Open items statement, in
	// agingBands order.
	Aging []pdfAmount
}

// The statement table's texts.
const (
	statementEmptyForward   = "No activity in this period."
	statementEmptyOpenItems = "Nothing is open on this day."
	statementOpeningLabel   = "Balance forward"
)

var (
	statementForwardColumns   = []string{"Date", "Activity", "Amount", "Balance"}
	statementOpenItemsColumns = []string{"Date", "Activity", "Due date", "Open amount"}
)

// buildStatementData runs the statement's shipped report for its one customer
// as auth, so the lines are the ones auth may read, and maps the rows: the
// opening, the lines and the customer's balance for Balance forward; the item
// rows and the customer row's aging figures for Open items.
func buildStatementData(ctx context.Context, app core.App, auth *core.Record, in statementInput) (statementData, error) {
	if in.Customer == nil {
		return statementData{}, fmt.Errorf("books: statement: no customer")
	}
	settingsRecord, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return statementData{}, fmt.Errorf("books: read settings: %w", err)
	}
	party, err := customerPDFParty(in.Customer, "To", in.Customer.GetString("billing_address"), "the customer's billing address")
	if err != nil {
		return statementData{}, err
	}
	data := statementData{
		Type: in.Type, Number: in.Number, Currency: settingsRecord.GetString("currency"),
		StatementDate: in.StatementDate, StartDate: in.StartDate, EndDate: in.EndDate,
		CustomerName: in.Customer.GetString("display_name"),
		Party:        party,
		Company:      documentPDFCompany(settingsRecord),
	}
	customers := mustJSON([]string{in.Customer.Id})
	switch in.Type {
	case statementTypeBalanceForward:
		res, err := reportRowsFor(ctx, app, auth, statementBalanceForwardSpec(), map[string]json.RawMessage{
			"period":    mustJSON(map[string]string{"from": in.StartDate, "to": in.EndDate}),
			"customers": customers,
		}, in.StatementDate)
		if err != nil {
			return statementData{}, fmt.Errorf("books: statement: run the balance forward report: %w", err)
		}
		err = data.readForward(res, in.Customer.Id)
		return data, err
	case statementTypeOpenItems:
		res, err := reportRowsFor(ctx, app, auth, statementOpenItemsSpec(), map[string]json.RawMessage{
			"asOf":      mustJSON(in.StatementDate),
			"customers": customers,
		}, in.StatementDate)
		if err != nil {
			return statementData{}, fmt.Errorf("books: statement: run the open items report: %w", err)
		}
		err = data.readOpenItems(res, in.Customer.Id)
		return data, err
	default:
		return statementData{}, fmt.Errorf("books: statement: unknown type %q", in.Type)
	}
}

// readForward maps a Balance forward run: the customer's group row, then its
// opening, detail and subtotal rows. A run with no group for the customer (a
// reader who may not read its lines) gives no line and zero figures.
func (d *statementData) readForward(res *reports.Result, customerID string) error {
	group, ok := statementGroupRow(res, 1, customerID)
	if !ok {
		return nil
	}
	for _, r := range res.Rows {
		if r.Section != group.ID {
			continue
		}
		switch r.Kind {
		case reports.KindOpening:
			opening, err := cellCents(r, "balance")
			if err != nil {
				return err
			}
			d.Opening = opening
		case reports.KindDetail:
			line, err := forwardLine(r)
			if err != nil {
				return err
			}
			d.Lines = append(d.Lines, line)
			if line.Amount > 0 {
				d.Charges += line.Amount
			} else {
				d.Credits += line.Amount
			}
		case reports.KindSubtotal:
			due, err := cellCents(r, "balance")
			if err != nil {
				return err
			}
			d.AmountDue = due
		}
	}
	return d.checkLineCount()
}

func forwardLine(r reports.Row) (statementLine, error) {
	date, err := statementCellText(r, "date")
	if err != nil {
		return statementLine{}, err
	}
	activity, err := statementCellText(r, "activity")
	if err != nil {
		return statementLine{}, err
	}
	amount, err := cellCents(r, "amount")
	if err != nil {
		return statementLine{}, err
	}
	balance, err := cellCents(r, "balance")
	if err != nil {
		return statementLine{}, err
	}
	return statementLine{Date: date, Activity: activity, Amount: amount, Balance: balance}, nil
}

// readOpenItems maps an Open items run: the customer row (level 1) gives the
// aging figures and the amount due, each item row (level 2) a line.
func (d *statementData) readOpenItems(res *reports.Result, customerID string) error {
	d.Aging = make([]pdfAmount, len(agingBands))
	for i, band := range agingBands {
		d.Aging[i] = pdfAmount{Label: band.label}
	}
	row, ok := statementGroupRow(res, 1, customerID)
	if !ok {
		return nil
	}
	for i, band := range agingBands {
		cents, err := cellCents(row, band.id)
		if err != nil {
			return err
		}
		d.Aging[i].Cents = cents
		if band.id != "current" {
			d.PastDue += cents
		}
	}
	due, err := cellCents(row, "total")
	if err != nil {
		return err
	}
	d.AmountDue = due
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 2 {
			continue
		}
		if own, _ := r.GroupKey[0].(string); own != customerID {
			continue
		}
		line, err := openItemLine(r)
		if err != nil {
			return err
		}
		d.Lines = append(d.Lines, line)
		if line.Amount > 0 && line.Due != "" && line.Due < d.StatementDate && (d.OldestDue == "" || line.Due < d.OldestDue) {
			d.OldestDue = line.Due
		}
	}
	d.ItemCount = len(d.Lines)
	return d.checkLineCount()
}

func openItemLine(r reports.Row) (statementLine, error) {
	date, err := statementCellText(r, "date")
	if err != nil {
		return statementLine{}, err
	}
	due, err := statementCellText(r, "due")
	if err != nil {
		return statementLine{}, err
	}
	amount, err := cellCents(r, "total")
	if err != nil {
		return statementLine{}, err
	}
	return statementLine{Date: date, Activity: r.Label, Due: due, Amount: amount}, nil
}

func (d *statementData) checkLineCount() error {
	if len(d.Lines) > maxPDFLines {
		return fmt.Errorf("books: statement: %d lines is more than %d", len(d.Lines), maxPDFLines)
	}
	return nil
}

// statementGroupRow is the group row of level whose own key is id.
func statementGroupRow(res *reports.Result, level int, id string) (reports.Row, bool) {
	for _, r := range res.Rows {
		if r.Kind != reports.KindGroup || r.Level != level || len(r.GroupKey) < level {
			continue
		}
		if own, _ := r.GroupKey[level-1].(string); own == id {
			return r, true
		}
	}
	return reports.Row{}, false
}

// cellCents reads a money cell: int64 minor units, 0 for a blank cell.
func cellCents(r reports.Row, col string) (int64, error) {
	cell := r.Cells[col]
	if cell == nil {
		return 0, nil
	}
	v, ok := cell.(int64)
	if !ok {
		return 0, fmt.Errorf("books: statement: %q cell %s is a %T, want minor units", r.Label, col, cell)
	}
	return v, nil
}

// statementCellText reads a text or day cell: "" for a blank cell.
func statementCellText(r reports.Row, col string) (string, error) {
	cell := r.Cells[col]
	if cell == nil {
		return "", nil
	}
	v, ok := cell.(string)
	if !ok {
		return "", fmt.Errorf("books: statement: %q cell %s is a %T, want text", r.Label, col, cell)
	}
	return v, nil
}

// statementPDFDocument prints a statement with the Books document template:
// the title and number, the statement date and the period, the customer, the
// amount due, and the type's table.
func statementPDFDocument(data statementData) pdfDocument {
	doc := pdfDocument{
		Title:     "Statement",
		Number:    data.Number,
		Currency:  data.Currency,
		Dates:     []pdfDate{{Label: "Statement date", Day: data.StatementDate}},
		Company:   data.Company,
		Parties:   []pdfParty{data.Party},
		BigAmount: pdfAmount{Label: "Amount due", Cents: data.AmountDue},
		FileStem:  statementFileName(data),
	}
	table := &pdfStatement{}
	if data.Type == statementTypeBalanceForward {
		doc.Period = formatDay(data.StartDate) + " to " + formatDay(data.EndDate)
		table.Columns = statementForwardColumns
		table.Opening = &pdfAmount{Label: statementOpeningLabel, Cents: data.Opening}
		table.Empty = statementEmptyForward
		for _, l := range data.Lines {
			table.Rows = append(table.Rows, pdfStatementRow{
				Date: l.Date, Activity: l.Activity, AmountCents: l.Amount, BalanceCents: l.Balance, HasBalance: true,
			})
		}
	} else {
		table.Columns = statementOpenItemsColumns
		table.Empty = statementEmptyOpenItems
		table.Aging = data.Aging
		for _, l := range data.Lines {
			table.Rows = append(table.Rows, pdfStatementRow{Date: l.Date, Activity: l.Activity, Due: l.Due, AmountCents: l.Amount})
		}
	}
	doc.Statement = table
	return doc
}

// statementFileName names a statement's file, without ".pdf":
// "statement-st-1001-aspen-ridge-landscaping". A part with no letter or digit
// adds nothing.
func statementFileName(data statementData) string {
	parts := []string{"statement"}
	for _, s := range []string{data.Number, data.CustomerName} {
		if stem := fileStem(s); stem != "" {
			parts = append(parts, stem)
		}
	}
	return strings.Join(parts, "-")
}

// fileStem is the rule of core's fileNameStem (core/server/reports/export.go),
// which core does not export: lower case; a letter, mark or digit is kept; a
// run of spaces or "-" between two kept runes becomes one "-"; anything else
// is dropped; the result is cut at maxFileStemRunes runes and trimmed of "-".
// Unlike core it has no "report" fallback: an empty stem adds nothing to a
// statement's name.
func fileStem(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case unicode.IsSpace(r) || r == '-':
			dash = true
		case unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsDigit(r):
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
		}
	}
	stem := b.String()
	if utf8.RuneCountInString(stem) > maxFileStemRunes {
		stem = string([]rune(stem)[:maxFileStemRunes])
	}
	return strings.Trim(stem, "-")
}

// maxFileStemRunes is core's maxFileNameRunes (core/server/reports/export.go).
const maxFileStemRunes = 80

// buildStatementDocument is the "statement" document kind: the stored
// statement's PDF, built from the ledger as it is now for the statement's
// dates, as the reader.
func buildStatementDocument(ctx context.Context, app core.App, auth *core.Record, record *core.Record) (pdfDocument, error) {
	data, err := buildStoredStatementData(ctx, app, auth, record)
	if err != nil {
		return pdfDocument{}, err
	}
	return statementPDFDocument(data), nil
}

// buildStoredStatementData builds a stored statement's data: its customer,
// type, dates and number.
func buildStoredStatementData(ctx context.Context, app core.App, auth *core.Record, record *core.Record) (statementData, error) {
	customer, err := app.FindRecordById("books_customers", record.GetString("customer"))
	if err != nil {
		return statementData{}, fmt.Errorf("books: read the statement's customer: %w", err)
	}
	return buildStatementData(ctx, app, auth, statementInput{
		Type:          record.GetString("type"),
		StatementDate: record.GetString("statement_date"),
		StartDate:     record.GetString("start_date"),
		EndDate:       record.GetString("end_date"),
		Customer:      customer,
		Number:        record.GetString("number"),
	})
}
