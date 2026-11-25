package cli

import (
	"fmt"
	"maps"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// refusedf is an error for a call the CLI knows the server refuses, from what
// it has read: exit 6, as the server's own refusal.
func refusedf(format string, a ...any) error {
	return exitcode.New(exitcode.Refused, fmt.Errorf(format, a...))
}

// createOps are the writes that create a document: the header with its first
// status (a draft; pending for a quote), then every row with the document's
// id and its place. replaces is the id of the posted document this one
// corrects, or "".
func createOps(doc *document, id string, in documentInput, replaces string) []batchOp {
	header := maps.Clone(in.header)
	for name, value := range doc.Fixed {
		header[name] = value
	}
	header["id"] = id
	header["status"] = doc.initialStatus()
	if replaces != "" {
		header["replaces"] = replaces
	}
	ops := []batchOp{createOp(doc.Collection, doc.Singular, header)}
	return append(ops, lineOps(doc, id, in.lines)...)
}

// lineOps are the creates of the rows of every line table in the input, in the
// order of documents.json.
func lineOps(doc *document, id string, lines map[string][]map[string]any) []batchOp {
	ops := []batchOp{}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		for position, row := range lines[table.Key] {
			body := maps.Clone(row)
			body[table.Parent] = id
			body["position"] = position
			ops = append(ops, createOp(table.Collection, fmt.Sprintf("%s[%d]", table.Key, position), body))
		}
	}
	return ops
}

// postOp posts a draft. The server takes a change of a draft only with the
// revision it will have: the stored one plus one, or 1 in the batch that
// creates the document (server/revision.go counts once for each transaction).
// A type with no revision field sends none.
func postOp(doc *document, id string, revision int64) batchOp {
	body := map[string]any{"status": statusPosted}
	if doc.hasRevision() {
		body["revision"] = revision
	}
	return updateOp(doc.Collection, id, "post", body)
}

// storedError marks an error whose text says that the write was stored. With
// --json its text is the document's message, not the server's own message.
type storedError struct{ error }

func (e *storedError) Unwrap() error { return e.error }

// readBack reads a document after a write that the server accepted. A failure
// here must not read as a failed write: the caller would send it again.
func readBack(cmd *cobra.Command, c *client.Client, doc *document, id, done string) (record, error) {
	rec, err := fetchDocument(cmd.Context(), c, doc, id)
	if err != nil {
		return record{}, storedReadError(doc, id, done, err)
	}
	return rec, nil
}

// storedReadError words the failure of a read after a write the server stored.
func storedReadError(doc *document, id, done string, err error) error {
	err = &storedError{fmt.Errorf("%s %s was %s, and then it could not be read: %w", doc.Singular, id, done, err)}
	// Exit 5 would tell a script that the document does not exist, and it
	// would send the write again: it is stored.
	if exitcode.Of(exitcode.Classify(err)) == exitcode.NotFound {
		return exitcode.New(exitcode.Failed, err)
	}
	return err
}

func newDocumentAddCmd(c *client.Client, doc *document) *cobra.Command {
	var input string
	var post bool
	posts := doc.hasDraft()
	first := "It is a draft unless --post is given. The header and the lines are stored in\n" +
		"one step: when Books refuses one of them, nothing is stored.\n\n"
	switch doc.Lifecycle {
	case lifecycleQuote:
		first = "It is pending, and Books numbers it at once. The header and the lines are\n" +
			"stored in one step: when Books refuses one of them, nothing is stored.\n\n"
	case lifecyclePosted:
		first = "It has no draft: Books posts and numbers it at once, and it counts in the\n" +
			"books. The header and the lines are stored in one step: when Books refuses\n" +
			"one of them, nothing is stored.\n\n"
	}
	cmd := newCommand(commandDef{
		Name:  "add",
		Short: "Add one " + doc.Singular + " with its lines from a JSON object",
		Long: "Add one " + doc.Singular + ". --input names a JSON file that holds it, with its\n" +
			"lines as an array, or - to read it from standard input.\n\n" + first +
			"`tinycld books schema " + doc.Name + " add` prints the fields.",
		Aliases: []string{"new", "create"},
		Input:   documentInputSchema(doc, true),
		Output:  documentSchema(doc),
	}, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		in, err := checkDocumentInput(doc, cmd.Parent().CommandPath(), body, true)
		if err != nil {
			return err
		}
		id := newRecordID()
		ops := createOps(doc, id, in, "")
		// A type created posted has no draft to post: its create posts it.
		done := "added"
		if post || doc.Lifecycle == lifecyclePosted {
			done = "added and posted"
		}
		if post {
			ops = append(ops, postOp(doc, id, 1))
		}
		if err := sendBatch(cmd.Context(), c, ops); err != nil {
			return err
		}
		rec, err := readBack(cmd, c, doc, id, done)
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "%s %s %s (%s)", done, doc.Singular, rec.label(&doc.resource), rec.id())
		return writeDocument(cmd, o, doc, rec)
	})
	bindInput(cmd, &input)
	if posts {
		cmd.Flags().BoolVar(&post, "post", false, "post the "+doc.Singular+" in the same step; without it, it is a draft")
	}
	return cmd
}
