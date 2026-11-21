package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Customer statements (statements spec §3.1, §4.2, §4.8). A statement posts
// nothing: it records one customer's statement of a type and its dates, the
// amount due when it was made, and its number from the statement sequence.
const (
	statementsCollection        = "books_statements"
	docTypeStatement            = "statement"
	statementTypeBalanceForward = "balance_forward"
	statementTypeOpenItems      = "open_items"
)

// The date texts of the statement date rule. The client's statementOptionsSchema
// gives the same texts from the same case table
// (testdata/statement_date_cases.json); PocketBase adds the final period.
const (
	msgStatementDayInvalid    = "Enter a valid date"
	msgStatementDayRequired   = "Enter a date"
	msgStatementStartAfterEnd = "Start date can't be after End date"
	msgStatementEndAfterDate  = "End date can't be after Statement date"
	msgStatementNoPeriod      = "An open items statement has no period"
)

// statementServerFields are set by Books only: the number and the amount due
// at create, the sent fields by the send route. A create that carries a value
// in one of them is refused.
var statementServerFields = []string{"number", "sequence", "balance", "currency", "sent_at", "sent_to"}

// registerStatementGuards binds the create guard of books_statements. It is a
// model hook, so it holds for every create (REST, a batch, Go). It runs inside
// serialized: allocateNumber needs the transaction, and a refusal or a failed
// write rolls the sequence back, so a refused create takes no number.
func registerStatementGuards(app core.App) {
	app.OnRecordCreate(statementsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return createStatement(tx, e.Record) })
	})
}

// createStatement checks a new statement and sets its server fields. The
// number is taken last, after every check.
func createStatement(tx core.App, r *core.Record) error {
	if err := checkNewStatement(r); err != nil {
		return err
	}
	statementType := r.GetString("type")
	if err := checkStatementDates(statementType, r.GetString("statement_date"), r.GetString("start_date"), r.GetString("end_date")); err != nil {
		return err
	}
	day := r.GetString("statement_date")
	if statementType == statementTypeBalanceForward {
		day = r.GetString("end_date")
	}
	balance, err := statementBalance(tx, r.GetString("customer"), day)
	if err != nil {
		return err
	}
	s, err := loadSettings(tx)
	if err != nil {
		return err
	}
	r.Set("balance", balance)
	r.Set("currency", s.Currency)
	r.Set("sent_at", "")
	r.Set("sent_to", "")
	sequence, number, err := allocateNumber(tx, docTypeStatement)
	if err != nil {
		return err
	}
	r.Set("sequence", sequence)
	r.Set("number", number)
	return nil
}

// checkNewStatement refuses a create that carries a server field, as
// checkNewSalesDoc does: a field is set when its value is not the empty value
// of its type (an empty number field reads "0").
func checkNewStatement(r *core.Record) error {
	var set []string
	for _, name := range statementServerFields {
		field := r.Collection().Fields.GetByName(name)
		if field == nil {
			continue
		}
		empty := ""
		if field.Type() == core.FieldTypeNumber {
			empty = "0"
		}
		if v := r.GetString(name); v != "" && v != empty {
			set = append(set, name)
		}
	}
	return refuseServerFields(set)
}

// checkStatementDates is the date rule of a statement: each day is a real day,
// a Balance forward statement has a Start and an End date with Start <= End <=
// Statement date, and an Open items statement has no period. Each refusal
// names its field.
func checkStatementDates(statementType, statementDate, startDate, endDate string) error {
	if statementDate == "" {
		return refuseField("statement_date", msgStatementDayRequired)
	}
	if _, err := parseDay(statementDate); err != nil {
		return refuseField("statement_date", msgStatementDayInvalid)
	}
	if statementType != statementTypeBalanceForward {
		if startDate != "" {
			return refuseField("start_date", msgStatementNoPeriod)
		}
		if endDate != "" {
			return refuseField("end_date", msgStatementNoPeriod)
		}
		return nil
	}
	if startDate == "" {
		return refuseField("start_date", msgStatementDayRequired)
	}
	if _, err := parseDay(startDate); err != nil {
		return refuseField("start_date", msgStatementDayInvalid)
	}
	if endDate == "" {
		return refuseField("end_date", msgStatementDayRequired)
	}
	if _, err := parseDay(endDate); err != nil {
		return refuseField("end_date", msgStatementDayInvalid)
	}
	// YYYY-MM-DD days compare as text.
	if startDate > endDate {
		return refuseField("start_date", msgStatementStartAfterEnd)
	}
	if endDate > statementDate {
		return refuseField("end_date", msgStatementEndAfterDate)
	}
	return nil
}

// statementBalanceSQL is the customer's receivable balance at the end of a
// day: the sum of debit - credit of its stored receivable rows dated on or
// before it. A sub-customer's rows carry its own id, so they are not its
// parent's.
const statementBalanceSQL = "SELECT CAST(COALESCE(SUM(debit - credit), 0) AS INTEGER) FROM " + receivableItemsCollection +
	" WHERE customer = {:customer} AND date <= {:day}"

// statementBalance is the amount due of a statement of customerID on day.
func statementBalance(tx core.App, customerID, day string) (int64, error) {
	var balance int64
	err := tx.DB().
		NewQuery(statementBalanceSQL).
		Bind(dbx.Params{"customer": customerID, "day": day}).
		Row(&balance)
	if err != nil {
		return 0, fmt.Errorf("books: read the statement balance: %w", err)
	}
	return balance, nil
}
