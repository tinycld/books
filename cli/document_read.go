package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// newDocumentCmd builds the command group of one transaction type of
// documents.json.
func newDocumentCmd(c *client.Client, doc *document) *cobra.Command {
	group := newGroup(doc.Name, doc.Summary)
	group.Aliases = []string{strings.ReplaceAll(doc.Singular, " ", "-")}
	group.AddCommand(
		newListCmd(c, &doc.resource),
		newDocumentShowCmd(c, doc),
		newDocumentAddCmd(c, doc),
	)
	for i := range doc.Views {
		group.AddCommand(newViewListCmd(c, &doc.Views[i]))
	}
	switch doc.Lifecycle {
	case lifecycleQuote:
		group.AddCommand(newDocumentEditCmd(c, doc), newQuoteAcceptCmd(c, doc), newQuoteStatusCmd(c, doc, quoteReject), newQuoteStatusCmd(c, doc, quoteReopen), newQuoteDeleteCmd(c, doc))
	case lifecycleOrder:
		// Books refuses the delete of an order that documents were made from,
		// with the text that says to close it.
		group.AddCommand(newDocumentEditCmd(c, doc), newOrderCloseCmd(c, doc), newOrderReopenCmd(c, doc), newGuardedDeleteCmd(c, &doc.resource, nil))
	case lifecyclePosted:
		// No draft: nothing to post and nothing to delete.
		if doc.corrects() {
			group.AddCommand(newDocumentEditCmd(c, doc))
		}
		group.AddCommand(newDocumentVoidCmd(c, doc))
	default:
		group.AddCommand(newDocumentEditCmd(c, doc), newDocumentPostCmd(c, doc), newDocumentVoidCmd(c, doc), newDocumentDeleteCmd(c, doc))
	}
	if doc.Entry != "" {
		group.AddCommand(newDocumentEntryCmd(c, doc))
	}
	if doc.Convert != nil {
		group.AddCommand(newDocumentConvertCmd(c, doc))
	}
	if table := doc.applyTable(); table != nil {
		group.AddCommand(newDocumentApplyCmd(c, doc, table), newDocumentUnapplyCmd(c, doc, table))
	}
	return group
}

// fetchDocument reads one document with its lines.
func fetchDocument(ctx context.Context, c *client.Client, doc *document, id string) (record, error) {
	raw, err := client.GetRecord[rawRecord](ctx, c, doc.Collection, id)
	if err != nil {
		return record{}, prefixID(&doc.resource, id, err)
	}
	return withLines(ctx, c, doc, raw)
}

// withLines turns a header the server sent into the document the commands
// print: the header's keys, then each line table as an array of records in
// their order. The totals in it are the ones the server stored, so a command
// reads the document after its last write.
func withLines(ctx context.Context, c *client.Client, doc *document, raw rawRecord) (record, error) {
	rec := project(&doc.resource, raw)
	for i := range doc.Lines {
		table := &doc.Lines[i]
		filter := client.Filter(table.Parent+" = {:id}", map[string]any{"id": rec.id()})
		rows, err := client.ListAll[rawRecord](ctx, c, table.Collection, filter, table.Sort)
		if err != nil {
			return record{}, fmt.Errorf("the %s of %s %s: %w", table.Key, doc.Singular, rec.id(), err)
		}
		res := table.asResource()
		lines := make([]record, 0, len(rows))
		for _, row := range rows {
			line := project(res, row)
			// Not printed (it is not a key): an edit of a draft keeps a row of a
			// table that refuses updates only when it already is at its place.
			line.values["position"] = row["position"]
			// Not printed either: a correction copies each stored flag of a row
			// (writableRows), as Books cannot work it out again from the values.
			for _, flag := range table.Flags {
				if value, ok := row[flag.Field]; ok {
					line.values[flag.Field] = value
				}
			}
			lines = append(lines, line)
		}
		rec.keys = append(rec.keys, table.Key)
		rec.values[table.Key] = lines
	}
	return rec, nil
}

// linesOf is the rows of one line table of a document that withLines built.
func linesOf(rec record, key string) []record {
	lines, _ := rec.values[key].([]record)
	return lines
}

// writeDocument prints one document. With --json it is one object with the
// lines inside. As a table or CSV it is the header as FIELD / VALUE, then one
// block for each line table.
func writeDocument(cmd *cobra.Command, o output.Options, doc *document, rec record) error {
	out := cmd.OutOrStdout()
	if o.Format == output.JSON {
		return o.Write(out, nil, nil, rec)
	}
	rows := [][]string{}
	for _, key := range recordKeys(&doc.resource) {
		rows = append(rows, []string{key, rec.cell(key)})
	}
	if err := o.Write(out, []string{"FIELD", "VALUE"}, rows, nil); err != nil {
		return err
	}
	// CSV has no nesting: each line table follows the header as its own block,
	// the way the table prints, so no format drops the lines.
	for i := range doc.Lines {
		table := &doc.Lines[i]
		headers := []string{}
		for j := range table.Fields {
			headers = append(headers, strings.ToUpper(table.Fields[j].Name))
		}
		headers = append(headers, "ID")
		lineRows := [][]string{}
		for _, line := range linesOf(rec, table.Key) {
			row := []string{}
			for j := range table.Fields {
				row = append(row, line.cell(table.Fields[j].Name))
			}
			lineRows = append(lineRows, append(row, line.id()))
		}
		fmt.Fprintf(out, "\n%s\n", strings.ToUpper(table.Key))
		if err := o.Write(out, headers, lineRows, nil); err != nil {
			return err
		}
	}
	return nil
}

func newDocumentShowCmd(c *client.Client, doc *document) *cobra.Command {
	return newCommand(commandDef{
		Name:    "show",
		Short:   "Show one " + doc.Singular + " with its lines",
		Aliases: []string{"view", "get"},
		Args:    idArg(&doc.resource),
		Output:  documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		rec, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		// `journal-entries show` prints the entry of every transaction; a
		// scoped type shows only its own records.
		if doc.Scoped {
			if err := checkFixed(cmd, doc, rec); err != nil {
				return err
			}
		}
		return writeDocument(cmd, o, doc, rec)
	})
}
