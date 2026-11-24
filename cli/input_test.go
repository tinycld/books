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
	got, err := readWith(t,
		`{"price": 9007199254740991, "huge": 9007199254740993, "quantity": 2.50}`, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if got["price"] != json.Number("9007199254740991") ||
		got["huge"] != json.Number("9007199254740993") ||
		got["quantity"] != json.Number("2.50") {
		t.Errorf("numbers were changed: %#v", got)
	}
	sent, _ := json.Marshal(got)
	for _, want := range []string{`"price":9007199254740991`, `"huge":9007199254740993`, `"quantity":2.50`} {
		if !strings.Contains(string(sent), want) {
			t.Errorf("the number is not sent as written (%s): %s", want, sent)
		}
	}
}

// The limit is on the document: exactly maxInputBytes is read, one byte more
// is refused.
func TestReadInputSizeBoundary(t *testing.T) {
	const frame = len(`{"notes": ""}`)
	exact := `{"notes": "` + strings.Repeat("x", maxInputBytes-frame) + `"}`
	if len(exact) != maxInputBytes {
		t.Fatalf("test document is %d bytes, want %d", len(exact), maxInputBytes)
	}
	got, err := readWith(t, exact, "--input", "-")
	if err != nil {
		t.Fatalf("a document of exactly 1 MiB was refused: %v", err)
	}
	if len(got["notes"].(string)) != maxInputBytes-frame {
		t.Errorf("notes were cut: %d bytes", len(got["notes"].(string)))
	}
	_, err = readWith(t, exact+" ", "--input", "-")
	if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), "larger than 1 MiB") {
		t.Errorf("one byte over: err = %v", err)
	}
}

// A repeated name is refused at every depth: encoding/json would keep the
// last one in an address as silently as at the top.
func TestReadInputRefusesANameTwiceAtAnyDepth(t *testing.T) {
	for _, tc := range []struct{ name, doc, want string }{
		{"nested", `{"address": {"city": "Oslo", "city": "Bergen"}}`, `names "address.city" twice`},
		{"deep", `{"a": {"b": {"c": 1, "c": 2}}}`, `names "a.b.c" twice`},
		{"in an array", `{"lines": [{"qty": 1}, {"qty": 1, "qty": 2}]}`, `names "lines[1].qty" twice`},
	} {
		_, err := readWith(t, tc.doc, "--input", "-")
		if exitcode.Of(err) != exitcode.Usage {
			t.Errorf("%s: exit = %d, want 2; err: %v", tc.name, exitcode.Of(err), err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.name, err.Error(), tc.want)
		}
	}
}

// The top object is level 1: exactly maxInputDepth levels are read, one more
// is refused as a usage error.
func TestReadInputDepthBoundary(t *testing.T) {
	nested := func(levels int) string {
		return strings.Repeat(`{"a":`, levels-1) + `{}` + strings.Repeat("}", levels-1)
	}
	if _, err := readWith(t, nested(maxInputDepth), "--input", "-"); err != nil {
		t.Fatalf("%d levels were refused: %v", maxInputDepth, err)
	}
	_, err := readWith(t, nested(maxInputDepth+1), "--input", "-")
	if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), "nested too deeply") {
		t.Errorf("%d levels: err = %v", maxInputDepth+1, err)
	}
	arrays := `{"a":` + strings.Repeat("[", maxInputDepth) + strings.Repeat("]", maxInputDepth) + `}`
	_, err = readWith(t, arrays, "--input", "-")
	if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), "nested too deeply") {
		t.Errorf("arrays past the limit: err = %v", err)
	}
}

// A document of nothing but opening brackets, as large as the size limit
// allows, is refused at the depth limit and does not recurse a million levels.
func TestReadInputRefusesAMegabyteOfBrackets(t *testing.T) {
	head := `{"a":`
	doc := head + strings.Repeat("[", maxInputBytes-len(head))
	_, err := readWith(t, doc, "--input", "-")
	if exitcode.Of(err) != exitcode.Usage || !strings.Contains(err.Error(), "nested too deeply") {
		t.Errorf("err = %v", err)
	}
}

// The same name under different parents is not a repeat.
func TestReadInputAllowsTheSameNameUnderDifferentParents(t *testing.T) {
	got, err := readWith(t, `{"billing": {"city": "Oslo"}, "shipping": {"city": "Bergen"}}`, "--input", "-")
	if err != nil {
		t.Fatal(err)
	}
	if got["billing"].(map[string]any)["city"] != "Oslo" || got["shipping"].(map[string]any)["city"] != "Bergen" {
		t.Errorf("parsed = %v", got)
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
