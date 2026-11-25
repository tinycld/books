package cli

import (
	"encoding/json"
	"fmt"
	"maps"
	"slices"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// checkFixed refuses a record that is not a document of this type: one whose
// fixed values differ. `journal-entries show` prints the entry Books wrote for
// an invoice; `journal-entries void` must not void it.
func checkFixed(doc *document, rec record) error {
	names := make([]string, 0, len(doc.Fixed))
	for name := range doc.Fixed {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if have := rec.cell(name); have != doc.Fixed[name] {
			// A scoped type does not have the record at all.
			if doc.Scoped {
				return exitcode.New(exitcode.NotFound, fmt.Errorf("%s %s: not found: the record with this id has the %s %q, so it is not a %s",
					doc.Singular, rec.id(), name, have, doc.Singular))
			}
			return refusedf("%s %s has the %s %q, not %q: Books made it for another transaction, so change that transaction",
				doc.Singular, rec.id(), name, have, doc.Fixed[name])
		}
	}
	return nil
}

// revisionOf is the revision the server stored for a document, or 0 for a type
// that has no revision field.
func revisionOf(doc *document, rec record) (int64, error) {
	if !doc.hasRevision() {
		return 0, nil
	}
	number, ok := rec.values["revision"].(json.Number)
	if !ok {
		return 0, fmt.Errorf("%s %s: the server sent no revision", doc.Singular, rec.id())
	}
	revision, err := number.Int64()
	if err != nil {
		return 0, fmt.Errorf("%s %s: the server sent the revision %q", doc.Singular, rec.id(), number)
	}
	return revision, nil
}

// draftEditOps are the writes that change a draft: for each line table the
// input names, its rows are removed and the rows of the input are created; the
// header change is last and states the next revision, so the server restates
// the totals one time and refuses the batch when another caller saved first.
func draftEditOps(doc *document, current record, in documentInput) ([]batchOp, error) {
	revision, err := revisionOf(doc, current)
	if err != nil {
		return nil, err
	}
	ops := []batchOp{}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		if _, given := in.lines[table.Key]; !given {
			continue
		}
		for position, line := range linesOf(current, table.Key) {
			ops = append(ops, deleteOp(table.Collection, line.id(), fmt.Sprintf("remove %s[%d]", table.Key, position)))
		}
	}
	ops = append(ops, lineOps(doc, current.id(), in.lines)...)
	header := maps.Clone(in.header)
	if doc.hasRevision() {
		header["revision"] = revision + 1
	}
	// A header with nothing to change is still written when the type counts
	// its saves. Without a revision, an input of only rows writes only rows.
	if len(header) == 0 {
		return ops, nil
	}
	return append(ops, updateOp(doc.Collection, current.id(), doc.Singular, header)), nil
}

// correctionInput is the input of the document that replaces a posted one:
// what the posted document holds, with the caller's changes over it.
func correctionInput(doc *document, current record, in documentInput) documentInput {
	out := documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}
	for _, f := range doc.writable() {
		if value := current.values[f.Name]; value != nil {
			out.header[f.Name] = value
		}
	}
	for _, name := range doc.Keep {
		if value := current.cell(name); value != "" {
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
		out.lines[table.Key] = writableRows(table, linesOf(current, table.Key))
	}
	return out
}

// writableRows are stored rows as the rows of an input: the values a caller
// may send, and nothing Books computes (a read-only field, or a field the
// table's `computed` names for this row).
func writableRows(table *lineTable, stored []record) []map[string]any {
	res := table.asResource()
	rows := []map[string]any{}
	for _, line := range stored {
		row := map[string]any{}
		for _, f := range res.writable() {
			if value := line.values[f.Name]; value != nil && !table.computes(f.Name, line.cell) {
				row[f.Name] = value
			}
		}
		rows = append(rows, row)
	}
	return rows
}

func newDocumentEditCmd(c *client.Client, doc *document) *cobra.Command {
	var input string
	how := "A draft is changed in place. A posted " + doc.Singular + " is never changed: Books\n" +
		"voids it and posts a new one with the changes, and the command prints the new\n" +
		"one. Its `replaces` is the id of the one it corrects.\n\n"
	switch doc.Lifecycle {
	case lifecycleQuote:
		how = "The " + doc.Singular + " is changed in place. A closed one cannot be changed.\n\n"
	case lifecyclePosted:
		how = "A " + doc.Singular + " is never changed: Books voids it and posts a new one with\n" +
			"the changes, and the command prints the new one. Its `replaces` is the id of\n" +
			"the one it corrects.\n\n"
	}
	cmd := newCommand(commandDef{
		Name:  "edit",
		Short: "Change one " + doc.Singular + " from a JSON object",
		Long: "Change one " + doc.Singular + ". Only the fields in --input change; null clears a\n" +
			"field. When --input names the lines, they replace all the lines.\n\n" + how +
			"`tinycld books schema " + doc.Name + " edit` prints the fields.",
		Aliases: []string{"update", "set"},
		Args:    idArg(&doc.resource),
		Input:   documentInputSchema(doc, false),
		Output:  documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		in, err := checkDocumentInput(doc, cmd.Parent().CommandPath(), body, false)
		if err != nil {
			return err
		}
		current, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		if err := checkFixed(doc, current); err != nil {
			return err
		}
		id, done, corrected := current.id(), "updated", false
		var ops []batchOp
		switch status := current.cell("status"); {
		case doc.editedInPlace(status):
			if ops, err = draftEditOps(doc, current, in); err != nil {
				return err
			}
		case doc.corrects() && status == statusPosted:
			// The new document is stored and the posted one is void: the read
			// after it must not say that the id it names was corrected.
			id, done, corrected = newRecordID(), "added and posted to replace "+current.id(), true
			ops = createOps(doc, id, correctionInput(doc, current, in), current.id())
			// A type with a draft creates the correction as one and posts it in
			// the same step; a type with none creates it posted.
			if doc.hasDraft() {
				ops = append(ops, postOp(doc, id, 1))
			}
		default:
			return refusedf("%s %s is %s: it cannot be changed; add a new %s with `%s add`",
				doc.Singular, current.id(), status, doc.Singular, cmd.Parent().CommandPath())
		}
		if err := sendBatch(cmd.Context(), c, ops); err != nil {
			return prefixID(&doc.resource, current.id(), err)
		}
		rec, err := readBack(cmd, c, doc, id, done)
		if err != nil {
			return err
		}
		if corrected {
			o.Info(cmd.ErrOrStderr(), "corrected %s %s: it is void, and %s (%s) is posted in its place",
				doc.Singular, current.label(&doc.resource), rec.label(&doc.resource), rec.id())
		} else {
			o.Info(cmd.ErrOrStderr(), "updated %s %s (%s)", doc.Singular, rec.label(&doc.resource), rec.id())
		}
		return writeDocument(cmd, o, doc, rec)
	})
	bindInput(cmd, &input)
	return cmd
}
