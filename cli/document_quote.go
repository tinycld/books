package cli

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// quoteChange is one status a person gives a quote with a command of its own.
type quoteChange struct {
	name, status, done, short, long string
}

var (
	quoteReject = quoteChange{"reject", statusRejected, "rejected", "Mark one %s as rejected",
		"Mark one %s as rejected: the customer said no. `reopen` makes it pending again."}
	quoteReopen = quoteChange{"reopen", statusPending, "reopened", "Make one %s pending again",
		"Make one accepted or rejected %s pending again. Books clears who accepted it and when."}
)

// openQuote reads a quote for a status change. Books closes a quote when an
// invoice is made from it, and then a person cannot change it: the server
// answers such a change with 404, so the command says what the status is.
func openQuote(cmd *cobra.Command, c *client.Client, doc *document, id string) (record, int64, error) {
	current, err := fetchHeader(cmd, c, doc, id)
	if err != nil {
		return record{}, 0, err
	}
	if current.cell("status") == statusClosed {
		return record{}, 0, refusedf("%s %s is closed: an invoice was made from it, so it cannot change", doc.Singular, current.id())
	}
	revision, err := revisionOf(doc, current)
	return current, revision, err
}

func newQuoteStatusCmd(c *client.Client, doc *document, change quoteChange) *cobra.Command {
	return newCommand(commandDef{
		Name:   change.name,
		Short:  fmt.Sprintf(change.short, doc.Singular),
		Long:   fmt.Sprintf(change.long, doc.Singular),
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		current, revision, err := openQuote(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		body := map[string]any{"status": change.status, "revision": revision + 1}
		return patchStatus(cmd, c, doc, o, current.id(), body, change.done)
	})
}

func newQuoteAcceptCmd(c *client.Client, doc *document) *cobra.Command {
	var date, by string
	cmd := newCommand(commandDef{
		Name:  "accept",
		Short: "Mark one " + doc.Singular + " as accepted",
		Long: "Mark one " + doc.Singular + " as accepted: the customer said yes. --date is the day\n" +
			"the customer accepted it; --by is who accepted it.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		// The CLI has no clock of the books: the caller states the day.
		if _, err := time.Parse(time.DateOnly, date); err != nil {
			return usagef("--date is required, as YYYY-MM-DD: the day the customer accepted the %s", doc.Singular)
		}
		current, revision, err := openQuote(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		body := map[string]any{"status": statusAccepted, "accepted_date": date, "accepted_by": by, "revision": revision + 1}
		return patchStatus(cmd, c, doc, o, current.id(), body, "accepted")
	})
	cmd.Flags().StringVar(&date, "date", "", "the day the customer accepted it, as YYYY-MM-DD (required)")
	cmd.Flags().StringVar(&by, "by", "", "who accepted it")
	return cmd
}

// newQuoteDeleteCmd deletes a quote that is not closed. The server answers the
// delete of a closed one with 404, which reads as "no such record", so the
// command says what the status is.
func newQuoteDeleteCmd(c *client.Client, doc *document) *cobra.Command {
	return newGuardedDeleteCmd(c, &doc.resource, func(rec record) error {
		if rec.cell("status") == statusClosed {
			return refusedf("%s %s is closed: it cannot be deleted", doc.Singular, rec.id())
		}
		return nil
	})
}
