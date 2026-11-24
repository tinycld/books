package cli

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// probeRoot is a root with one command built by newCommand under the books
// group, so the constructor is tested without a resource.
func probeRoot(def commandDef, fn runFunc) *cobra.Command {
	root := newTestRoot(nil)
	books, _, _ := root.Find([]string{"books"})
	books.AddCommand(newCommand(def, fn))
	return root
}

var probeDef = commandDef{
	Name:   "probe",
	Short:  "A test command",
	Args:   []argSpec{{Name: "id", Help: "the record id"}},
	Output: map[string]any{"type": "object"},
}

func TestNewCommandPassesArgsAndOptions(t *testing.T) {
	var gotArgs []string
	var gotFormat output.Format
	var gotYes bool
	root := probeRoot(probeDef, func(_ *cobra.Command, args []string, o output.Options, yes bool) error {
		gotArgs, gotFormat, gotYes = args, o.Format, yes
		return nil
	})
	if _, _, err := runRoot(t, root, "", "books", "probe", "abc", "--json", "--yes"); err != nil {
		t.Fatal(err)
	}
	if len(gotArgs) != 1 || gotArgs[0] != "abc" {
		t.Errorf("args = %v, want [abc]", gotArgs)
	}
	if gotFormat != output.JSON || !gotYes {
		t.Errorf("format = %q, yes = %v; want json, true", gotFormat, gotYes)
	}
}

func TestNewCommandUseNamesTheArgs(t *testing.T) {
	cmd := newCommand(probeDef, func(*cobra.Command, []string, output.Options, bool) error { return nil })
	if cmd.Use != "probe <id>" {
		t.Fatalf("Use = %q, want %q", cmd.Use, "probe <id>")
	}
}

func TestWrongArgumentCountIsAUsageError(t *testing.T) {
	ran := false
	root := probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error {
		ran = true
		return nil
	})
	for _, args := range [][]string{
		{"books", "probe"},
		{"books", "probe", "a", "b"},
	} {
		_, _, err := runRoot(t, root, "", args...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%v: exit = %d, want 2; err: %v", args, got, err)
		}
		if err == nil || !strings.Contains(err.Error(), "<id>") {
			t.Errorf("%v: the message must name the argument: %v", args, err)
		}
	}
	if ran {
		t.Error("the command body ran with a wrong argument count")
	}
}

// `books acounts list` must not print the help and exit 0: a script would
// read a typing mistake as success.
func TestUnknownCommandInAGroupIsAUsageError(t *testing.T) {
	root := probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error { return nil })
	out, _, err := runRoot(t, root, "", "books", "prob", "abc", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), `unknown command "prob"`) || !strings.Contains(err.Error(), "probe") {
		t.Errorf("the message must name the word and the commands: %v", err)
	}
	var doc errorDoc
	if jsonErr := json.Unmarshal([]byte(out), &doc); jsonErr != nil {
		t.Fatalf("stdout is not the JSON error document: %v\n%s", jsonErr, out)
	}
	if doc.Error.Code != "usage" || doc.Error.Exit != 2 {
		t.Errorf("error document = %+v, want code usage, exit 2", doc.Error)
	}
}

func TestBareGroupPrintsHelp(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "Usage:") {
		t.Errorf("`tinycld books` did not print the help:\n%s", out)
	}
}

func TestAnInvalidOutputFlagIsAUsageError(t *testing.T) {
	root := probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error { return nil })
	_, _, err := runRoot(t, root, "", "books", "probe", "abc", "--output", "xml")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
}

// The shell refuses a flag it cannot parse before the command runs, so the
// output format is not known: exit 2, and nothing on stdout, with --json too.
// This is the one failure with no JSON error document.
func TestAFlagThatCannotBeParsedIsExit2WithNoDocument(t *testing.T) {
	ran := false
	root := probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error {
		ran = true
		return nil
	})
	out, _, err := runRoot(t, root, "", "books", "probe", "abc", "--bogus", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if out != "" || ran {
		t.Errorf("stdout = %q, ran = %v; want nothing printed and nothing run", out, ran)
	}
}

func TestACommandErrorKeepsItsOwnExitCode(t *testing.T) {
	root := probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error {
		return usagef("bad %s", "input")
	})
	_, _, err := runRoot(t, root, "", "books", "probe", "abc")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2", got)
	}
	root = probeRoot(probeDef, func(*cobra.Command, []string, output.Options, bool) error {
		return errors.New("something else")
	})
	_, _, err = runRoot(t, root, "", "books", "probe", "abc")
	if got := exitcode.Of(err); got != exitcode.Failed {
		t.Fatalf("exit = %d, want 1", got)
	}
}

func TestNewCommandRefusesADefWithoutOutput(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("a command with no output schema must not be built")
		}
	}()
	newCommand(commandDef{Name: "bare"}, func(*cobra.Command, []string, output.Options, bool) error { return nil })
}
