package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// newActiveCmd is `deactivate` (inactive true) or `activate` (inactive
// false): the way to retire a record that the server will not delete because
// transactions use it.
func newActiveCmd(c *client.Client, res *resource, inactive bool) *cobra.Command {
	name, short, done := "activate", "Make an inactive "+res.Singular+" active again", "activated"
	if inactive {
		name, short, done = "deactivate", "Make one "+res.Singular+" inactive: hidden from pickers, history kept", "deactivated"
	}
	return newCommand(commandDef{
		Name:   name,
		Short:  short,
		Args:   idArg(res),
		Output: recordSchema(res),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return patchRecord(cmd, c, res, o, args[0], map[string]any{"inactive": inactive}, done)
	})
}
