package cli

import (
	"maps"
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// conversionInput is the input of the document `convert` makes: the values
// the rule copies from the source, its lines, and the caller's input over
// both. The rows are those the target takes: its own writable fields, less
// what Books computes there.
func conversionInput(doc, to *document, source record, in documentInput) documentInput {
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
		if rows, given := in.lines[table.Key]; given {
			out.lines[table.Key] = rows
			continue
		}
		out.lines[table.Key] = writableRows(to.table(table.Key), linesOf(source, table.Key))
	}
	return out
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
	}
	return schema
}

// checkConvertBody checks the --input of `convert` as the fields of the new
// document. An empty object is not "nothing to change": the dates are missing.
func checkConvertBody(to *document, group string, body map[string]any) (documentInput, error) {
	if len(body) == 0 {
		return documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}, nil
	}
	return checkDocumentInput(to, group, body, false)
}

// checkConvertHeader checks the whole header as that of a new document: a
// required field neither the source nor the input gives is named here.
func checkConvertHeader(doc, to *document, source record, given documentInput) (documentInput, error) {
	in := conversionInput(doc, to, source, given)
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

func newDocumentConvertCmd(c *client.Client, doc *document) *cobra.Command {
	to := findDocument(doc.Convert.To)
	var input string
	cmd := newCommand(commandDef{
		Name:  "convert",
		Short: "Make one draft " + to.Singular + " from one " + doc.Singular,
		Long: "Make one draft " + to.Singular + " from one " + doc.Singular + ". The " + to.Singular + " takes these\n" +
			"fields of the " + doc.Singular + ": `" + strings.Join(doc.Convert.Copy, "`, `") + "`, and its lines.\n" +
			"No other field is copied. --input holds the other fields of the\n" +
			to.Singular + " (its dates), and can give any field or the lines again.\n\n" +
			"Books closes the " + doc.Singular + " in the same step, and one " + doc.Singular + " makes one\n" +
			to.Singular + ". The command prints the " + to.Singular + ": post it with `tinycld books " + to.Name + " post`.\n\n" +
			"`tinycld books schema " + doc.Name + " convert` prints the fields.",
		Args:   idArg(&doc.resource),
		Input:  convertInputSchema(doc, to),
		Output: documentSchema(to),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		given, err := checkConvertBody(to, cmd.Parent().Parent().CommandPath()+" "+to.Name, body)
		if err != nil {
			return err
		}
		source, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		if source.cell("status") == statusClosed {
			return closedSourceRefusal(cmd, doc, to, source)
		}
		in, err := checkConvertHeader(doc, to, source, given)
		if err != nil {
			return err
		}
		in.header[doc.Convert.Link] = source.id()
		id := newRecordID()
		if err := sendBatch(cmd.Context(), c, createOps(to, id, in, "")); err != nil {
			return prefixID(&doc.resource, source.id(), err)
		}
		rec, err := readBack(cmd, c, to, id, "added")
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "added %s %s from %s %s, which is now closed", to.Singular, rec.id(), doc.Singular, source.label(&doc.resource))
		return writeDocument(cmd, o, to, rec)
	})
	bindInput(cmd, &input)
	return cmd
}
