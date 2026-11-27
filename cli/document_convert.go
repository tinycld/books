package cli

import (
	"context"
	"maps"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// conversionInput is the input of the document `convert` makes: the values
// the rule copies from the source, its lines, and the caller's input over
// both. The rows are those the target takes: its own writable fields, less
// what Books computes there. A partial conversion takes the source's open rows
// at what is open, or the rows the input gives, each filled from the source
// row it names (linkedRows).
func conversionInput(doc, to *document, source record, in documentInput) (documentInput, error) {
	out := documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}
	for _, name := range doc.Convert.Copy {
		if value := source.values[name]; value != nil {
			out.header[name] = value
		}
	}
	maps.Copy(out.header, in.header)
	for i := range doc.Lines {
		table := &doc.Lines[i]
		if table.ReadOnly {
			continue
		}
		into := to.table(table.Key)
		rows, given := in.lines[table.Key]
		switch {
		case doc.Convert.Partial && given:
			linked, err := linkedRows(doc, into, source, rows)
			if err != nil {
				return out, err
			}
			out.lines[table.Key] = linked
		case given:
			out.lines[table.Key] = rows
		case doc.Convert.Partial:
			out.lines[table.Key] = openRows(doc, into, linesOf(source, table.Key))
		default:
			out.lines[table.Key] = writableRows(into, linesOf(source, table.Key))
		}
	}
	return out, nil
}

// isOpen reports whether a row of an order has something left: its open
// quantity when Books computes its amount (a product line), else its open
// amount.
func isOpen(into *lineTable, line record) bool {
	name := openAmountField
	if into.computes("amount", line.cell) {
		name = openQuantityField
	}
	open, err := strconv.ParseFloat(line.cell(name), 64)
	return err == nil && open > 0
}

// fromSourceRow is a source row as a row of the new document, with nothing of
// what it bills: the values a caller may send less the quantity and the
// amount, and the field that names the source row.
func fromSourceRow(doc *document, into *lineTable, line record) map[string]any {
	row := writableRows(into, []record{line})[0]
	delete(row, "quantity")
	delete(row, "amount")
	row[doc.Convert.LineLink] = line.id()
	return row
}

// openRows are the open rows of the source, each at what is open: the open
// quantity of a row whose amount Books computes, the open amount of another.
func openRows(doc *document, into *lineTable, stored []record) []map[string]any {
	rows := []map[string]any{}
	for _, line := range stored {
		if !isOpen(into, line) {
			continue
		}
		row := fromSourceRow(doc, into, line)
		if into.computes("amount", line.cell) {
			row["quantity"] = line.values[openQuantityField]
		} else {
			row["amount"] = line.values[openAmountField]
		}
		rows = append(rows, row)
	}
	return rows
}

// linkedRows are the rows the input of a partial conversion gives. A row that
// names a source row in the line link takes the kind, the product or account,
// the description and the rate of that row, and gives its own quantity (a row
// whose amount Books computes) or amount; the input's other fields go over
// them. A row that names none is a row of its own. Each row is then checked
// whole, as a row of the new document.
func linkedRows(doc *document, into *lineTable, source record, rows []map[string]any) ([]map[string]any, error) {
	link := doc.Convert.LineLink
	stored := map[string]record{}
	for _, line := range linesOf(source, into.Key) {
		stored[line.id()] = line
	}
	merged := make([]any, 0, len(rows))
	for i, row := range rows {
		named, _ := row[link].(string)
		if named == "" {
			merged = append(merged, row)
			continue
		}
		line, ok := stored[named]
		if !ok {
			return nil, usagef("%s[%d]: %s %q is not a line of %s %s", into.Key, i, link, named, doc.Singular, source.label(&doc.resource))
		}
		filled := fromSourceRow(doc, into, line)
		maps.Copy(filled, row)
		what := "amount"
		if into.computes("amount", rowText(filled)) {
			what = "quantity"
		}
		if filled[what] == nil {
			return nil, usagef("%s[%d]: give the %s to bill of %s line %s", into.Key, i, what, doc.Singular, named)
		}
		merged = append(merged, filled)
	}
	return checkLines(into, merged)
}

// partialLinks are the line links of the partial conversions that make a
// document of the type: a row of its input that names one is filled from the
// source row before it is checked whole.
func partialLinks(to *document) []string {
	links := []string{}
	for i := range documents {
		if conv := documents[i].Convert; conv != nil && conv.Partial && conv.To == to.Name {
			links = append(links, conv.LineLink)
		}
	}
	return links
}

// convertInputSchema is the JSON Schema of the --input of `convert`: the fields
// of the new document, as `edit` of it takes them. Unlike `edit`, an empty
// input is a valid one when the source gives every required field, and the
// required fields are those of the new document that the rule does not copy
// (checkConvertHeader).
func convertInputSchema(doc, to *document) map[string]any {
	schema := documentInputSchema(to, false)
	delete(schema, "minProperties")
	required := []string{}
	for _, f := range to.writable() {
		if f.Required && !slices.Contains(doc.Convert.Copy, f.Name) {
			required = append(required, f.Name)
		}
	}
	schema["required"] = required
	props := schema["properties"].(map[string]any)
	for i := range to.Lines {
		table := &to.Lines[i]
		if table.ReadOnly {
			continue
		}
		rows := props[table.Key].(map[string]any)
		rows["description"] = "every " + table.Singular + " of the " + to.Singular + ", in order; when given, these rows " +
			"replace the " + table.Key + " of the " + doc.Singular + ", which the " + to.Singular + " takes otherwise"
		if doc.Convert.Partial {
			// A row that names a source row takes its required fields from it.
			delete(rows["items"].(map[string]any), "required")
			rows["description"] = "the " + table.Key + " of the " + to.Singular + ", in order; when given, the " + to.Singular +
				" takes only these rows, and not the open " + table.Key + " of the " + doc.Singular + ". A row that names a " +
				table.Singular + " of the " + doc.Singular + " in " + doc.Convert.LineLink + " takes its kind, product or account, " +
				"description and rate from it, and gives its own quantity (an item row) or amount; another row is a row of its own"
		}
	}
	return schema
}

// checkConvertBody checks the --input of `convert` as the fields of the new
// document. An empty object is not "nothing to change": the dates are missing.
// A row that names a source row in the line link of a partial conversion is
// checked for its names and types here, and whole once it is filled from the
// source row (linkedRows).
func checkConvertBody(to *document, group string, body map[string]any) (documentInput, error) {
	if len(body) == 0 {
		return documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}, nil
	}
	links := partialLinks(to)
	if len(links) == 0 {
		return checkDocumentInput(to, group, body, false)
	}
	header := maps.Clone(body)
	linked := map[string][]map[string]any{}
	for i := range to.Lines {
		table := &to.Lines[i]
		value, given := body[table.Key]
		if table.ReadOnly || !given {
			continue
		}
		rows, err := checkLinkedLines(table, value, links)
		if err != nil {
			return documentInput{}, err
		}
		linked[table.Key] = rows
		delete(header, table.Key)
	}
	in := documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}
	if len(header) > 0 {
		checked, err := checkDocumentInput(to, group, header, false)
		if err != nil {
			return in, err
		}
		in = checked
	}
	maps.Copy(in.lines, linked)
	return in, nil
}

// checkLinkedLines checks the rows of a partial conversion's input before the
// source is read: a row that names a source row has only the names and types
// of its fields checked; another row is checked whole.
func checkLinkedLines(table *lineTable, value any, links []string) ([]map[string]any, error) {
	list, ok := value.([]any)
	if !ok {
		return nil, usagef("%q must be an array of objects, one for each %s", table.Key, table.Singular)
	}
	if len(list) > table.maxRows() {
		return nil, usagef("%q has %d rows: the most is %d", table.Key, len(list), table.maxRows())
	}
	res := table.asResource()
	rows := make([]map[string]any, 0, len(list))
	for i, item := range list {
		row, ok := item.(map[string]any)
		if !ok {
			return nil, usagef("%s[%d] must be an object", table.Key, i)
		}
		names := false
		for _, link := range links {
			if named, _ := row[link].(string); named != "" {
				names = true
			}
		}
		if !names {
			if err := checkRow(table, i, row); err != nil {
				return nil, err
			}
		} else if err := checkInput(res, row, false); err != nil {
			return nil, usagef("%s[%d]: %v", table.Key, i, err)
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// checkConvertHeader checks the whole header as that of a new document: a
// required field neither the source nor the input gives is named here.
func checkConvertHeader(doc, to *document, source record, given documentInput) (documentInput, error) {
	in, err := conversionInput(doc, to, source, given)
	if err != nil {
		return in, err
	}
	return in, checkInput(&to.resource, in.header, true)
}

// closedSourceRefusal is the refusal of a source that is closed: Books made a
// document from it, and the server answers a second one with a refusal that
// does not say which. The next step is to show the document the record names.
func closedSourceRefusal(cmd *cobra.Command, doc, to *document, source record) error {
	next := ""
	for i := range doc.Fields {
		f := &doc.Fields[i]
		if made := source.cell(f.Name); f.ReadOnly && f.Type == typeID && f.Ref == to.Name && made != "" {
			next = "; show it with `" + cmd.Parent().Parent().CommandPath() + " " + to.Name + " show " + made + "`"
			break
		}
	}
	return refusedf("%s %s is closed: one %s was already made from it%s", doc.Singular, source.id(), to.Singular, next)
}

// convertHelp is the help text of `convert`.
func convertHelp(doc, to *document) (short, long string) {
	conv := doc.Convert
	if !conv.Partial {
		return "Make one draft " + to.Singular + " from one " + doc.Singular,
			"Make one draft " + to.Singular + " from one " + doc.Singular + ". The " + to.Singular + " takes these\n" +
				"fields of the " + doc.Singular + ": `" + strings.Join(conv.Copy, "`, `") + "`, and its lines.\n" +
				"No other field is copied. --input holds the other fields of the\n" +
				to.Singular + " (its dates), and can give any field or the lines again.\n\n" +
				"Books closes the " + doc.Singular + " in the same step, and one " + doc.Singular + " makes one\n" +
				to.Singular + ". The command prints the " + to.Singular + ": post it with `tinycld books " + to.Name + " post`.\n\n" +
				"`tinycld books schema " + doc.Name + " " + conv.word() + "` prints the fields."
	}
	return "Make one " + to.Singular + " from what is open on one " + doc.Singular,
		"Make one draft " + to.Singular + " from one " + doc.Singular + ", or post it with --post. The " + to.Singular + "\n" +
			"takes these fields of the " + doc.Singular + ": `" + strings.Join(conv.Copy, "`, `") + "`. Without `lines` in\n" +
			"--input it takes every open line at what is open: an item line at its\n" +
			"`" + openQuantityField + "`, another line at its `" + openAmountField + "`. Each line names the line it\n" +
			"was made from in `" + conv.LineLink + "`.\n\n" +
			"--input holds the other fields of the " + to.Singular + " (its dates, `ref_no`), and can give\n" +
			"`lines`: a row with `" + conv.LineLink + "` takes the kind, the product or account, the\n" +
			"description and the rate of that line, and gives its `quantity` (an item line)\n" +
			"or its `amount`. A row without it is a line of its own.\n\n" +
			"--input is optional: without it the " + to.Singular + " is dated today, takes the vendor's\n" +
			"`terms` and the `due_date` they give, and takes every open line.\n\n" +
			"The " + doc.Singular + " stays open: it makes one " + to.Singular + " after another, and Books\n" +
			"counts what a posted " + to.Singular + " takes from it.\n\n" +
			"`tinycld books schema " + doc.Name + " " + conv.word() + "` prints the fields."
}

func newDocumentConvertCmd(c *client.Client, doc *document) *cobra.Command {
	to := findDocument(doc.Convert.To)
	partial := doc.Convert.Partial
	var input, chosen string
	var post bool
	short, long := convertHelp(doc, to)
	// The engine's word stays a name of the command.
	var aliases []string
	if doc.Convert.word() != defaultConvertWord {
		aliases = []string{defaultConvertWord}
	}
	cmd := newCommand(commandDef{
		Name:    doc.Convert.word(),
		Short:   short,
		Long:    long,
		Aliases: aliases,
		Args:    idArg(&doc.resource),
		Input:   convertInputSchema(doc, to),
		Output:  documentSchema(to),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		// A partial conversion runs with no --input: the dates and the
		// terms are filled once the source is read (noInputHeader).
		body := map[string]any{}
		noInput := partial && input == ""
		if !noInput {
			read, err := readInput(cmd, input)
			if err != nil {
				return err
			}
			body = read
		}
		toGroup := cmd.Parent().Parent().CommandPath() + " " + to.Name
		given, err := checkConvertBody(to, toGroup, body)
		if err != nil {
			return err
		}
		// A run sent again after a stored one finds the source closed: the
		// stored id is the answer it needs.
		id := chosenID(cmd, chosen)
		show := toGroup + " show " + id
		if err := refuseStoredID(cmd, c, to.Collection, id, to.Singular, show); err != nil {
			return err
		}
		source, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		// A partial source that is closed is refused by the server, with the
		// text that says how to open it again.
		if !partial && source.cell("status") == statusClosed {
			return closedSourceRefusal(cmd, doc, to, source)
		}
		if noInput {
			header, err := noInputHeader(cmd.Context(), c, source, time.Now().Format(time.DateOnly))
			if err != nil {
				return err
			}
			given.header = header
		}
		in, err := checkConvertHeader(doc, to, source, given)
		if err != nil {
			return err
		}
		if partial && rowCount(in) == 0 {
			return refusedf("%s %s has no open line: nothing is left to make a %s from", doc.Singular, source.label(&doc.resource), to.Singular)
		}
		in.header[doc.Convert.Link] = source.id()
		ops := createOps(to, id, in, "")
		done := "added"
		if post {
			ops = append(ops, postOp(to, id, 1))
			done = "added and posted"
		}
		if err := sendCreate(cmd.Context(), c, to, id, ops); err != nil {
			return prefixID(&doc.resource, source.id(), explain(err, to.Singular+" "+id, checkThenResend(show, id)))
		}
		rec, err := readBack(cmd, c, to, id, done)
		if err != nil {
			return err
		}
		if partial {
			o.Info(cmd.ErrOrStderr(), "%s %s %s from %s %s", done, to.Singular, rec.id(), doc.Singular, source.label(&doc.resource))
		} else {
			o.Info(cmd.ErrOrStderr(), "added %s %s from %s %s, which is now closed", to.Singular, rec.id(), doc.Singular, source.label(&doc.resource))
		}
		return writeDocument(cmd, o, to, rec)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new "+to.Singular)
	if partial {
		cmd.Flags().BoolVar(&post, "post", false, "post the "+to.Singular+" in the same step; without it, it is a draft")
	}
	return cmd
}

// paymentTermDays are the days after its date that a document with the terms
// is due, as the app gives them (tinycld/books/lib/payment-terms.ts).
var paymentTermDays = map[string]int{
	"due_on_receipt": 0,
	"net_10":         10,
	"net_15":         15,
	"net_30":         30,
	"net_60":         60,
}

// dueDateFor is the due date of a document dated date (YYYY-MM-DD) with the
// terms; with no terms it is the date, as the app's Copy to bill gives it
// (lib/bill-values.ts billDueDate).
func dueDateFor(date, terms string) string {
	days, ok := paymentTermDays[terms]
	day, err := time.Parse(time.DateOnly, date)
	if !ok || err != nil {
		return date
	}
	return day.AddDate(0, 0, days).Format(time.DateOnly)
}

// noInputHeader is the header of a partial conversion run with no --input, as
// the app's Copy to bill starts it (lib/bill-values.ts billValuesFromOrder):
// dated today, with the vendor's terms and the due date they give. A vendor
// with no terms gives a bill due on its date.
func noInputHeader(ctx context.Context, c *client.Client, source record, today string) (map[string]any, error) {
	vendor, err := fetchRecord(ctx, c, findResource("vendors"), source.cell("vendor"))
	if err != nil {
		return nil, err
	}
	terms := vendor.cell("terms")
	header := map[string]any{"date": today, "due_date": dueDateFor(today, terms)}
	if terms != "" {
		header["terms"] = terms
	}
	return header, nil
}

// rowCount is the number of rows of every line table of an input.
func rowCount(in documentInput) int {
	n := 0
	for _, rows := range in.lines {
		n += len(rows)
	}
	return n
}
