package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"slices"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
)

// resendWaits are the pauses before each resend of a write whose answer was
// lost: three resends, about seven seconds in all. It is a variable so a test
// can take the pauses out.
var resendWaits = []time.Duration{time.Second, 2 * time.Second, 4 * time.Second}

// lostAnswer reports whether err says that the answer to a write did not come
// back: the connection failed or timed out, or a proxy answered 502, 503 or
// 504 for a server it could not reach. Such a write may be stored or not. A 500
// and every 4xx are the server's own answer, and the caller's cancel is not a
// failure of the server.
func lostAnswer(err error) bool {
	var api *client.APIError
	if errors.As(err, &api) {
		return slices.Contains([]int{502, 503, 504}, api.Status)
	}
	if errors.Is(err, context.Canceled) {
		return false
	}
	var netErr net.Error
	return errors.As(err, &netErr) || errors.Is(err, context.DeadlineExceeded)
}

// sendResent sends one write, and sends the same write again after each pause
// while its answer is lost. The write names the id of each record it creates,
// so the server cannot store it twice: it refuses a create of an id it holds.
// So a resend that is refused may be the answer to a write an earlier send
// stored; stored reads what the server holds and says whether that is so, and
// then the write is done. The refusal of the first send is returned as it is:
// no earlier send can explain it.
func sendResent(ctx context.Context, send func() error, stored func() (bool, error)) error {
	err := send()
	for sent := 1; err != nil; sent++ {
		if !lostAnswer(err) {
			if sent == 1 {
				return err
			}
			done, checkErr := stored()
			if checkErr != nil {
				return &unansweredError{sends: sent, err: fmt.Errorf("a resend was refused (%v), and the read that checks for an earlier send failed: %w", err, checkErr)}
			}
			if done {
				return nil
			}
			return err
		}
		if sent > len(resendWaits) || ctx.Err() != nil {
			return &unansweredError{sends: sent, err: err}
		}
		select {
		case <-ctx.Done():
			return &unansweredError{sends: sent, err: err}
		case <-time.After(resendWaits[sent-1]):
		}
		err = send()
	}
	return nil
}

// unansweredError is a write whose answer never came back, so it may be stored
// or not. Its text names the write and the next step (explain sets both); with
// --json it is the message, not the proxy's page.
type unansweredError struct {
	sends      int
	err        error
	what, next string
}

func (e *unansweredError) Error() string {
	return fmt.Sprintf("the answer to %s was lost (%d sends; the last: %v): it may be stored or not. %s", e.what, e.sends, e.err, e.next)
}

func (e *unansweredError) Unwrap() error { return e.err }

// explain gives a lost write its words, and exit 7: the same call can succeed
// later. Any other error is returned as it is.
func explain(err error, what, next string) error {
	var lost *unansweredError
	if !errors.As(err, &lost) {
		return err
	}
	lost.what, lost.next = what, next
	return exitcode.New(exitcode.Unavailable, lost)
}

// checkThenResend is the next step after a lost create: show it, or send the
// same command again with its id, which Books refuses if it is stored.
func checkThenResend(show, id string) string {
	return "Check with `" + show + "`. " + resendWithID(id)
}

// resendWithID is the resend step alone. It is safe to follow without a check:
// Books refuses an id that is stored.
func resendWithID(id string) string {
	return "To send it again, run the same command with --id " + id +
		": when the first one was stored, Books refuses the second and nothing is written twice."
}

// sendCreate sends the batch that creates document id, and its resends. A
// refused resend is the answer to an earlier send when the document is stored.
func sendCreate(ctx context.Context, c *client.Client, doc *document, id string, ops []batchOp) error {
	return sendResent(ctx,
		func() error { return sendBatch(ctx, c, ops) },
		func() (bool, error) { return recordExists(ctx, c, doc.Collection, id) })
}

// recordExists reports whether the server holds the record.
func recordExists(ctx context.Context, c *client.Client, collection, id string) (bool, error) {
	_, err := client.GetRecord[rawRecord](ctx, c, collection, id)
	if err == nil {
		return true, nil
	}
	if exitcode.Of(exitcode.Classify(err)) == exitcode.NotFound {
		return false, nil
	}
	return false, err
}

// bindID adds --id to a command that creates a record: the caller names its
// id, so a run sent again after a lost answer cannot store it twice.
func bindID(cmd *cobra.Command, id *string, help string) {
	cmd.Flags().StringVar(id, "id", "", help+": exactly 15 characters, each a-z or 0-9; a second run with an id that is stored writes nothing (exit 6)")
}

// checkIDFlag refuses an --id the server would refuse, before anything is
// sent.
func checkIDFlag(cmd *cobra.Command, id string) error {
	if !cmd.Flags().Changed("id") {
		return nil
	}
	if len(id) != recordIDLength {
		return usagef("--id must be exactly %d characters, each a-z or 0-9; %q has %d", recordIDLength, id, len(id))
	}
	for _, r := range id {
		if !slices.Contains([]rune(recordIDAlphabet), r) {
			return usagef("--id must be exactly %d characters, each a-z or 0-9; %q has %q", recordIDLength, id, r)
		}
	}
	return nil
}

// chosenID is the id of the record a command creates: the --id of the caller,
// or a new one.
func chosenID(cmd *cobra.Command, id string) string {
	if cmd.Flags().Changed("id") {
		return id
	}
	return newRecordID()
}

// refuseStoredID refuses an --id that names a stored record: the run that
// stored it was the first one. With no --id there is nothing to read.
func refuseStoredID(cmd *cobra.Command, c *client.Client, collection, id, what, show string) error {
	if !cmd.Flags().Changed("id") {
		return nil
	}
	exists, err := recordExists(cmd.Context(), c, collection, id)
	if err != nil {
		return err
	}
	if exists {
		return refusedf("%s %s already exists: show it with `%s`; nothing was written", what, id, show)
	}
	return nil
}

// holdsEdit reports whether a draft holds what an edit asked for: each header
// field of the input, and each table the input names, row by row. A resend of
// an edit the first send stored is refused (it states a revision that is
// taken, or creates a row id that is stored); when the draft holds the edit,
// the edit is done. A draft that another caller changed to the very same
// values reads as done too, and that is true of what it holds.
func holdsEdit(doc *document, rec record, in documentInput) bool {
	for name, value := range in.header {
		if !sameValue(value, rec.values[name]) {
			return false
		}
	}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		rows, given := in.lines[table.Key]
		if !given {
			continue
		}
		stored := linesOf(rec, table.Key)
		if len(stored) != len(rows) {
			return false
		}
		for position, row := range rows {
			if !sameRow(table, position, stored[position], row) {
				return false
			}
		}
	}
	return true
}

// sameValue reports whether a stored value is the one an input gave: null is
// the empty value, and numbers compare as numbers.
func sameValue(given, have any) bool {
	if given == nil {
		return slices.Contains([]string{"", "0", "no"}, cellText(have))
	}
	if cellText(given) == cellText(have) {
		return true
	}
	g, gok := given.(json.Number)
	h, hok := have.(json.Number)
	if !gok || !hok {
		return false
	}
	gf, gerr := g.Float64()
	hf, herr := h.Float64()
	return gerr == nil && herr == nil && gf == hf
}
