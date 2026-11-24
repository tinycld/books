package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func idArg(res *resource) []argSpec {
	return []argSpec{{Name: "id", Help: "the id of the " + res.Singular + ", as `list` prints it"}}
}

// prefixID puts the record before the server's error, so "Not found" says
// what was not found.
func prefixID(res *resource, id string, err error) error {
	return fmt.Errorf("%s %s: %w", res.Singular, id, err)
}

// fetchRecord reads one record.
func fetchRecord(ctx context.Context, c *client.Client, res *resource, id string) (record, error) {
	raw, err := client.GetRecord[rawRecord](ctx, c, res.Collection, id)
	if err != nil {
		return record{}, prefixID(res, id, err)
	}
	return project(res, raw), nil
}

// writeRecord prints one record: a FIELD / VALUE table, or the record as JSON.
func writeRecord(cmd *cobra.Command, o output.Options, rec record) error {
	rows := make([][]string, len(rec.keys))
	for i, key := range rec.keys {
		rows[i] = []string{key, rec.cell(key)}
	}
	return o.Write(cmd.OutOrStdout(), []string{"FIELD", "VALUE"}, rows, rec)
}

func newShowCmd(c *client.Client, res *resource) *cobra.Command {
	return newCommand(commandDef{
		Name:    "show",
		Short:   "Show one " + res.Singular + " in full",
		Aliases: []string{"view", "get"},
		Args:    idArg(res),
		Output:  recordSchema(res),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		rec, err := fetchRecord(cmd.Context(), c, res, args[0])
		if err != nil {
			return err
		}
		return writeRecord(cmd, o, rec)
	})
}
