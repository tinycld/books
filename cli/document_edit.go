package cli

import (
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strconv"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// checkFixed refuses a record that is not a document of this type: one whose
// fixed values differ. `journal-entries show` prints the entry Books wrote for
// an invoice; `journal-entries void` must not void it.
func checkFixed(cmd *cobra.Command, doc *document, rec record) error {
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
			next := "Books made it for another transaction, so change that transaction"
			if owner := scopedOwner(doc, rec); owner != nil {
				next = "it is a " + owner.Singular + ": use `" + cmd.Parent().Parent().CommandPath() + " " + owner.Name + " " + cmd.Name() + " " + rec.id() + "`"
			}
			return refusedf("%s %s has the %s %q, not %q: %s", doc.Singular, rec.id(), name, have, doc.Fixed[name], next)
		}
	}
	return nil
}

// scopedOwner is the scoped type of the same collection whose fixed values the
// record has (a transfer, for a journal entry), or nil. It is found from the
// data of documents.json, not by a type's name.
func scopedOwner(doc *document, rec record) *document {
	for i := range documents {
		owner := &documents[i]
		if !owner.Scoped || owner.Collection != doc.Collection {
			continue
		}
		matches := true
		for name, want := range owner.Fixed {
			matches = matches && rec.cell(name) == want
		}
		if matches {
			return owner
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

// draftEditOps are the writes that change a draft. For each line table the
// input names, the stored rows and the rows of the input are paired by their
// place: a pair is an update of the stored row, a stored row past the input's
// last is removed, and an input row past the last stored one is created. That
// is at most one write for each row of the table, so any edit fits in one
// batch (TestEveryDocumentWriteFitsInOneBatch). As the forms' save does
// (tablesWriteSteps), the removes of every table go first, because the server
// counts a document's rows at each create; then each table's updates and
// creates. The header change is last and states the next revision, so the
// server restates the totals one time and refuses the batch when another
// caller saved first.
func draftEditOps(doc *document, current record, in documentInput) ([]batchOp, error) {
	revision, err := revisionOf(doc, current)
	if err != nil {
		return nil, err
	}
	removes, writes := []batchOp{}, []batchOp{}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		rows, given := in.lines[table.Key]
		if !given {
			continue
		}
		stored := linesOf(current, table.Key)
		for position, line := range stored {
			if position >= len(rows) || (table.NoUpdate && !sameRow(table, position, line, rows[position])) {
				removes = append(removes, deleteOp(table.Collection, line.id(), "remove "+rowLabel(table, position)))
			}
		}
		for position, row := range rows {
			switch {
			case position >= len(stored):
				writes = append(writes, editRowCreateOp(table, current.id(), position, row))
			case !table.NoUpdate:
				writes = append(writes, updateOp(table.Collection, stored[position].id(), rowLabel(table, position), rowUpdate(table, position, row)))
			case !sameRow(table, position, stored[position], row):
				writes = append(writes, editRowCreateOp(table, current.id(), position, row))
			}
		}
	}
	ops := append(removes, writes...)
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

// editRowCreateOp is the create of a row of an edit, with an id the CLI
// chose. A type with no revision (a payment) has nothing else that refuses the
// resend of an edit the first send stored: the stored id makes the server
// refuse it, where a row id of the server's would be stored a second time.
func editRowCreateOp(table *lineTable, id string, position int, row map[string]any) batchOp {
	op := rowCreateOp(table, id, position, row)
	op.Body["id"] = newRecordID()
	return op
}

// rowUpdate is the body that turns a stored row into the input's row of the
// same place. The input's row replaces the stored one, so every writable field
// is sent: null for a field the row does not name, and the server stores the
// empty value, as for a create that leaves it out. A field Books computes for
// this row is not sent, as the server refuses it. The parent stays.
func rowUpdate(table *lineTable, position int, row map[string]any) map[string]any {
	text := func(name string) string {
		s, _ := row[name].(string)
		return s
	}
	body := map[string]any{"position": position}
	for _, f := range table.asResource().writable() {
		if table.computes(f.Name, text) {
			continue
		}
		body[f.Name] = row[f.Name]
	}
	return body
}

// sameRow reports whether a stored row already is the input's row of the
// same place: its place and every writable value. A value the input leaves
// out matches a stored empty one, as a create would store it.
func sameRow(table *lineTable, position int, stored record, row map[string]any) bool {
	if stored.cell("position") != strconv.Itoa(position) {
		return false
	}
	for _, f := range table.asResource().writable() {
		value, given := row[f.Name]
		have := stored.cell(f.Name)
		if !given && !slices.Contains([]string{"", "0", "no"}, have) {
			return false
		}
		if given && cellText(value) != have {
			return false
		}
	}
	return true
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
	var input, chosen string
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
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		group := cmd.Parent().CommandPath()
		in, err := checkDocumentInput(doc, group, body, false)
		if err != nil {
			return err
		}
		// A run sent again after a stored correction finds the original void:
		// the stored id is the answer it needs.
		if err := refuseStoredID(cmd, c, doc.Collection, chosen, doc.Singular, group+" show "+chosen); err != nil {
			return err
		}
		current, err := fetchDocument(cmd.Context(), c, doc, args[0])
		if err != nil {
			return err
		}
		if err := checkFixed(cmd, doc, current); err != nil {
			return err
		}
		id, done, corrected := current.id(), "updated", false
		var ops []batchOp
		var stored func() (bool, error)
		var what, next string
		switch status := current.cell("status"); {
		case doc.editedInPlace(status):
			if ops, err = draftEditOps(doc, current, in); err != nil {
				return err
			}
			stored = func() (bool, error) {
				rec, err := fetchDocument(cmd.Context(), c, doc, id)
				return err == nil && holdsEdit(doc, rec, in), err
			}
			what = "the change of " + doc.Singular + " " + id
			next = "Check with `" + group + " show " + id + "`: when it was stored, the " + doc.Singular + " holds the change."
		case doc.corrects() && status == statusPosted:
			// The new document is stored and the posted one is void: the read
			// after it must not say that the id it names was corrected.
			id, done, corrected = chosenID(cmd, chosen), "added and posted to replace "+current.id(), true
			ops = createOps(doc, id, correctionInput(doc, current, in), current.id())
			// A type with a draft creates the correction as one and posts it in
			// the same step; a type with none creates it posted.
			if doc.hasDraft() {
				ops = append(ops, postOp(doc, id, 1))
			}
			stored = func() (bool, error) { return recordExists(cmd.Context(), c, doc.Collection, id) }
			what = doc.Singular + " " + id
			next = checkThenResend(group+" show "+id, id)
		default:
			return refusedf("%s %s is %s: it cannot be changed; add a new %s with `%s add`",
				doc.Singular, current.id(), status, doc.Singular, group)
		}
		send := func() error { return sendBatch(cmd.Context(), c, ops) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return prefixID(&doc.resource, current.id(), explain(err, what, next))
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
	if doc.corrects() {
		bindID(cmd, &chosen, "the id of the new "+doc.Singular+" when the edit corrects a posted one (a draft keeps its id)")
	}
	return cmd
}
