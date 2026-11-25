package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// fetchHeader reads a document without its lines, for a command that changes
// only the status.
func fetchHeader(cmd *cobra.Command, c *client.Client, doc *document, id string) (record, error) {
	raw, err := client.GetRecord[rawRecord](cmd.Context(), c, doc.Collection, id)
	if err != nil {
		return record{}, prefixID(&doc.resource, id, err)
	}
	rec := project(&doc.resource, raw)
	return rec, checkFixed(doc, rec)
}

// patchStatus sends one status change and prints the document the server then
// holds.
func patchStatus(cmd *cobra.Command, c *client.Client, doc *document, o output.Options, id string, body map[string]any, done string) error {
	raw, err := client.UpdateRecord[rawRecord](cmd.Context(), c, doc.Collection, id, body)
	if err != nil {
		return prefixID(&doc.resource, id, err)
	}
	rec, err := withLines(cmd.Context(), c, doc, raw)
	if err != nil {
		return storedReadError(doc, id, done, err)
	}
	o.Info(cmd.ErrOrStderr(), "%s %s %s (%s)", done, doc.Singular, rec.label(&doc.resource), rec.id())
	return writeDocument(cmd, o, doc, rec)
}

func newDocumentPostCmd(c *client.Client, doc *document) *cobra.Command {
	return newCommand(commandDef{
		Name:  "post",
		Short: "Post one draft " + doc.Singular,
		Long: "Post one draft " + doc.Singular + ": Books numbers it and it counts in the books.\n" +
			"A posted " + doc.Singular + " cannot go back to a draft.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		current, err := fetchHeader(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		if status := current.cell("status"); status != statusDraft {
			return refusedf("%s %s is %s: only a draft can be posted", doc.Singular, current.id(), status)
		}
		revision, err := revisionOf(doc, current)
		if err != nil {
			return err
		}
		return patchStatus(cmd, c, doc, o, current.id(), postOp(doc, current.id(), revision+1).Body, "posted")
	})
}

func newDocumentVoidCmd(c *client.Client, doc *document) *cobra.Command {
	return newCommand(commandDef{
		Name:  "void",
		Short: "Void one posted " + doc.Singular,
		Long: "Void one posted " + doc.Singular + ". It stays in the books with its number, and its\n" +
			"amounts no longer count. This cannot be undone.\n\n" +
			"The command asks before it voids. Without a terminal, pass --yes.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, yes bool) error {
		if !yes && !canPrompt(o) {
			return usagef("refusing to prompt without a terminal; pass --yes to void")
		}
		current, err := fetchHeader(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		if status := current.cell("status"); status != statusPosted {
			return refusedf("%s %s is %s: only a posted one can be voided; %s",
				doc.Singular, current.id(), status, voidNextStep(doc, status, cmd.Parent().CommandPath()))
		}
		question := fmt.Sprintf("Void %s %q? This cannot be undone.", doc.Singular, current.label(&doc.resource))
		ok, err := confirm(o, yes, cmd.InOrStdin(), cmd.ErrOrStderr(), question)
		if err != nil {
			return usagef("no answer read; pass --yes to void without asking")
		}
		if !ok {
			o.Info(cmd.ErrOrStderr(), "not voided")
			rec, err := fetchDocument(cmd.Context(), c, doc, current.id())
			if err != nil {
				return err
			}
			return writeDocument(cmd, o, doc, rec)
		}
		return patchStatus(cmd, c, doc, o, current.id(), map[string]any{"status": statusVoid}, "voided")
	})
}

// voidNextStep says what to do with a document that cannot be voided: only a
// draft has a next step, a delete.
func voidNextStep(doc *document, status, group string) string {
	if status == statusDraft && doc.hasDraft() {
		return "delete a draft with `" + group + " delete`"
	}
	return "it is already " + status
}

// newDocumentDeleteCmd deletes a draft. The server answers the delete of a
// posted document with 404, which reads as "no such record", so the command
// says what the status is.
func newDocumentDeleteCmd(c *client.Client, doc *document) *cobra.Command {
	var cmd *cobra.Command
	cmd = newGuardedDeleteCmd(c, &doc.resource, func(rec record) error {
		if err := checkFixed(doc, rec); err != nil {
			return err
		}
		if status := rec.cell("status"); status != statusDraft {
			return refusedf("%s %s is %s: only a draft can be deleted; void a posted one with `%s void`",
				doc.Singular, rec.id(), status, cmd.Parent().CommandPath())
		}
		return nil
	})
	return cmd
}
