package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

// newResourceCmd builds the command group of one resource of resources.json.
func newResourceCmd(c *client.Client, res *resource) *cobra.Command {
	group := newGroup(res.Name, res.Summary)
	group.Aliases = []string{res.Singular}
	group.AddCommand(
		newListCmd(c, res),
		newShowCmd(c, res),
		newAddCmd(c, res),
		newEditCmd(c, res),
	)
	return group
}
