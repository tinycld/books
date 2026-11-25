package cli

import (
	"maps"
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
		Input:  documentInputSchema(to, false),
		Output: documentSchema(to),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		// An empty object is not "nothing to change": the dates are missing.
		given := documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}
		if len(body) > 0 {
			if given, err = checkDocumentInput(to, cmd.Parent().Parent().CommandPath()+" "+to.Name, body, false); err != nil {
				return err
			}
		}
		source, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		if source.cell("status") == statusClosed {
			return closedSourceRefusal(cmd, doc, to, source)
		}
		in := conversionInput(doc, to, source, given)
		// The whole header is checked as that of a new document: a required
		// field neither the source nor the input gives is named here.
		if err := checkInput(&to.resource, in.header, true); err != nil {
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
