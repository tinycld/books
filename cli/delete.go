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

// newDeleteCmd deletes a record for good. Books has no trash: the server
// refuses to delete a record that transactions or other records use, and says
// so. The command asks first; without a terminal it needs --yes.
func newDeleteCmd(c *client.Client, res *resource) *cobra.Command {
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
		rec, err := fetchRecord(cmd.Context(), c, res, args[0])
		if err != nil {
			return err
		}
		question := fmt.Sprintf("Delete %s %q for good? This cannot be undone.", res.Singular, rec.label(res))
		ok, err := ui.Confirm(o, yes, cmd.InOrStdin(), cmd.ErrOrStderr(), question)
		if err != nil {
			// No terminal and no --yes, or an answer that could not be read:
			// the call is wrong, and nothing was deleted.
			return usagef("%v", err)
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
