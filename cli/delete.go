package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/cli/ui"
)

// deleteResult is what `delete` prints with --json.
type deleteResult struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// confirm is a variable so tests can answer the prompt: core's Interactive
// flag reads the real os.Stdin, which a test cannot drive.
var confirm = ui.Confirm

// canPrompt is a variable for the same reason: a test cannot make stdin a
// terminal.
var canPrompt = func(o output.Options) bool { return o.Interactive }

// newDeleteCmd deletes a record for good. Books has no trash: the server
// refuses to delete a record that transactions or other records use, and says
// so. The command asks first; without a terminal it needs --yes.
func newDeleteCmd(c *client.Client, res *resource) *cobra.Command {
	return newGuardedDeleteCmd(c, res, nil)
}

// newGuardedDeleteCmd is newDeleteCmd with a check of the record before the
// question: guard refuses a record the command must not delete (a posted
// document). A nil guard refuses nothing.
func newGuardedDeleteCmd(c *client.Client, res *resource, guard func(record) error) *cobra.Command {
	long := "Delete one " + res.Singular + ". This cannot be undone.\n\n" +
		"The command asks before it deletes. Without a terminal, pass --yes."
	if res.DeleteHelp != "" {
		long += "\n\n" + res.DeleteHelp
	}
	return newCommand(commandDef{
		Name:    "delete",
		Short:   "Delete one " + res.Singular + " for good",
		Long:    long,
		Aliases: []string{"rm", "remove"},
		Args:    idArg(res),
		Output: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id":      map[string]any{"type": "string", "description": "the id of the deleted record"},
				"deleted": map[string]any{"type": "boolean", "description": "true when the record was deleted; false when the question was answered with no"},
			},
			"required": []string{"id", "deleted"},
		},
	}, func(cmd *cobra.Command, args []string, o output.Options, yes bool) error {
		if !yes && !canPrompt(o) {
			return usagef("refusing to prompt without a terminal; pass --yes to delete")
		}
		rec, err := fetchRecord(cmd.Context(), c, res, args[0])
		if err != nil {
			return err
		}
		if guard != nil {
			if err := guard(rec); err != nil {
				return err
			}
		}
		question := fmt.Sprintf("Delete %s %q for good? This cannot be undone.", res.Singular, rec.label(res))
		ok, err := confirm(o, yes, cmd.InOrStdin(), cmd.ErrOrStderr(), question)
		if err != nil {
			// With a terminal, an error is a failed read (EOF, a closed pipe),
			// which alone would print as a bare "EOF".
			return usagef("no answer read; pass --yes to delete without asking")
		}
		result := deleteResult{ID: rec.id(), Deleted: ok}
		if ok {
			if err := client.DeleteRecord(cmd.Context(), c, res.Collection, rec.id()); err != nil {
				return prefixID(res, rec.id(), err)
			}
			o.Info(cmd.ErrOrStderr(), "deleted %s %s (%s)", res.Singular, rec.label(res), rec.id())
		} else {
			o.Info(cmd.ErrOrStderr(), "not deleted")
		}
		return o.Write(cmd.OutOrStdout(), []string{"ID", "DELETED"},
			[][]string{{result.ID, cellText(result.Deleted)}}, result)
	})
}
