package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// statusChange is one change of a record's status, the write of `banking
// exclude` / `restore` and `reconcile finish` / `undo`. Books answers "not
// found" to a change it does not let a caller make, so the command reads the
// status first: refuse says what to do for a status that cannot change, and
// nothing is sent when the status is the one asked for (a second run after a
// lost answer).
type statusChange struct {
	res *resource
	// status is the status to set, and state its word for messages.
	status, state string
	// done is the text for stderr after the change, with %s for the id.
	done string
	// refuse, when set, refuses a record whose status cannot change.
	refuse func(id string, rec record) error
	write  func(cmd *cobra.Command, c *client.Client, o output.Options, id string) error
}

func (s statusChange) run(cmd *cobra.Command, c *client.Client, o output.Options, id string) error {
	rec, err := fetchRecord(cmd.Context(), c, s.res, id)
	if err != nil {
		return err
	}
	if s.refuse != nil {
		if err := s.refuse(id, rec); err != nil {
			return err
		}
	}
	if rec.cell("status") == s.status {
		o.Info(cmd.ErrOrStderr(), "%s %s is %s already: nothing was changed", s.res.Singular, id, s.state)
		return s.write(cmd, c, o, id)
	}
	if _, err := client.UpdateRecord[rawRecord](cmd.Context(), c, s.res.Collection, id, map[string]any{"status": s.status}); err != nil {
		return prefixID(s.res, id, err)
	}
	o.Info(cmd.ErrOrStderr(), s.done, id)
	return s.write(cmd, c, o, id)
}
