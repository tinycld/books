package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// readWith runs a command that reads --input and returns the parsed object.
func readWith(t *testing.T, stdin string, flags ...string) (map[string]any, error) {
	t.Helper()
	var got map[string]any
	var path string
	root := newTestRoot(nil)
	books, _, _ := root.Find([]string{"books"})
	cmd := newCommand(commandDef{Name: "probe", Output: map[string]any{"type": "object"}},
		func(cmd *cobra.Command, _ []string, _ output.Options, _ bool) error {
			body, err := readInput(cmd, path)
			got = body
			return err
		})
	bindInput(cmd, &path)
	books.AddCommand(cmd)
	_, _, err := runRoot(t, root, stdin, append([]string{"books", "probe"}, flags...)...)
	return got, err
}

func TestReadInputFromStdin(t *testing.T) {
	got, err := readWith(t, `{"name": "Cash", "inactive": false}`, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if got["name"] != "Cash" || got["inactive"] != false {
		t.Errorf("parsed = %v", got)
	}
}

func TestReadInputFromAFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "account.json")
	if err := os.WriteFile(path, []byte(`{"name": "Cash"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := readWith(t, "", "--input", path)
	if err != nil {
		t.Fatal(err)
	}
	if got["name"] != "Cash" {
		t.Errorf("parsed = %v", got)
	}
}

// Cents are integers up to 2^53-1. A float64 round trip would be exact for
// them, but json.Number sends the digits as written, whatever their size.
func TestReadInputKeepsNumbersAsWritten(t *testing.T) {
	got, err := readWith(t, `{"price": 9007199254740991, "quantity": 2.50}`, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if got["price"] != json.Number("9007199254740991") || got["quantity"] != json.Number("2.50") {
		t.Errorf("numbers were changed: %#v", got)
	}
	sent, _ := json.Marshal(got)
	if !strings.Contains(string(sent), `"price":9007199254740991`) {
		t.Errorf("the number is not sent as written: %s", sent)
	}
}

func TestReadInputRefusals(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "none.json")
	big := `{"notes": "` + strings.Repeat("x", maxInputBytes) + `"}`
	for _, tc := range []struct {
		name  string
		stdin string
		flags []string
		want  string
	}{
		{"no flag", "", nil, "--input is required"},
		{"missing file", "", []string{"--input", missing}, "none.json"},
		{"empty stdin", "", []string{"--input", "-"}, "--input is empty"},
		{"only spaces", " \n", []string{"--input", "-"}, "--input is empty"},
		{"not JSON", `{"name": `, []string{"--input", "-"}, "--input is not JSON"},
		{"an array", `[{"name": "Cash"}]`, []string{"--input", "-"}, "must be one JSON object"},
		{"a string", `"Cash"`, []string{"--input", "-"}, "must be one JSON object"},
		{"two objects", `{"name": "Cash"} {"name": "Bank"}`, []string{"--input", "-"}, "nothing after it"},
		{"a name twice", `{"name": "Cash", "name": "Bank"}`, []string{"--input", "-"}, `names "name" twice`},
		{"too large", big, []string{"--input", "-"}, "larger than 1 MiB"},
	} {
		_, err := readWith(t, tc.stdin, tc.flags...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%s: exit = %d, want 2; err: %v", tc.name, got, err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.name, err.Error(), tc.want)
		}
	}
}
