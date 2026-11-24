package cli

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

type staticStore struct{ tok client.TokenSet }

func (s *staticStore) Load() (client.TokenSet, error) { return s.tok, nil }
func (s *staticStore) Save(t client.TokenSet) error   { s.tok = t; return nil }

// clientFor serves handler on a test server and returns a signed-in client of
// it.
func clientFor(t *testing.T, handler http.Handler) *client.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	store := &staticStore{tok: client.TokenSet{
		AccessToken: "test-token", RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour),
	}}
	return client.New(srv.URL, store, srv.Client())
}

// newTestRoot mirrors the shell root (tinycld/cli/root.go newRootCmd): its
// persistent flag set (the contract output.FromCommand reads), its flag error
// func and its check of --output before any command runs, each a usage error.
// It then registers the books group.
func newTestRoot(c *client.Client) *cobra.Command {
	root := &cobra.Command{Use: "tinycld", SilenceUsage: true, SilenceErrors: true}
	root.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return exitcode.New(exitcode.Usage, err)
	})
	root.PersistentPreRunE = func(cmd *cobra.Command, _ []string) error {
		format, _ := cmd.Flags().GetString("output")
		if _, err := output.ParseFormat(format); err != nil {
			return exitcode.New(exitcode.Usage, err)
		}
		return nil
	}
	pf := root.PersistentFlags()
	pf.String("output", "table", "output format: table or json")
	pf.Bool("json", false, "shorthand for --output json")
	pf.String("context", "", "name of the server context to use")
	pf.Bool("quiet", false, "suppress progress text")
	pf.Bool("no-color", false, "turn off colored output")
	pf.Bool("yes", false, "answer yes to confirmation prompts")
	Register(root, c)
	return root
}

// runCmd runs one command line. stdin is what the command reads from standard
// input ("" is an empty stdin).
func runCmd(t *testing.T, c *client.Client, stdin string, args ...string) (string, string, error) {
	t.Helper()
	return runRoot(t, newTestRoot(c), stdin, args...)
}

func runRoot(t *testing.T, root *cobra.Command, stdin string, args ...string) (string, string, error) {
	t.Helper()
	var out, errBuf bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errBuf)
	root.SetIn(strings.NewReader(stdin))
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), errBuf.String(), err
}
