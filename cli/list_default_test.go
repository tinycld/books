package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// thingsResource is a list whose --state flag has a default.
var thingsResource = resource{
	Name: "things", Singular: "thing", Summary: "Things", Collection: "books_things", Sort: "id",
	Columns: []string{"name", "state"},
	Filters: []filterFlag{
		{Flag: "state", Field: "state", Help: "the state: open, done, or all", Default: "open"},
		{Flag: "kind", Field: "kind", Help: "the kind"},
	},
	Fields: []field{
		{Name: "name", Type: typeString, Help: "the name"},
		{Name: "state", Type: typeString, Enum: []string{"open", "done"}, Help: "the state"},
		{Name: "kind", Type: typeString, Help: "the kind"},
	},
}

// thingsList runs `books things` with args over a fake that holds one open and
// one done thing.
func thingsList(t *testing.T, args ...string) (*fakeBooks, string, error) {
	t.Helper()
	f := newFakeBooks(t)
	f.add("books_things", "thingopen000001", map[string]any{"name": "A", "state": "open", "kind": "x"})
	f.add("books_things", "thingdone000001", map[string]any{"name": "B", "state": "done", "kind": "x"})
	c := f.serve()
	root := newTestRoot(c)
	books, _, err := root.Find([]string{"books"})
	if err != nil {
		t.Fatal(err)
	}
	books.AddCommand(buildListCmd(c, &thingsResource, commandDef{Name: "things", Short: "List things"}))
	out, _, err := runRoot(t, root, "", append([]string{"books", "things", "--json"}, args...)...)
	return f, out, err
}

// A filter flag with a default is on when the flag is not given, takes another
// value of the select, and is off with the value all.
func TestListFilterDefault(t *testing.T) {
	if err := checkResource(&thingsResource, map[string]bool{}); err != nil {
		t.Fatalf("the resource of this test must be valid: %v", err)
	}
	for _, tc := range []struct {
		args   []string
		filter string
		ids    string
	}{
		{nil, `state = "open"`, "[thingopen000001]"},
		{[]string{"--state", "done"}, `state = "done"`, "[thingdone000001]"},
		{[]string{"--state", "all"}, ``, "[thingdone000001 thingopen000001]"},
		{[]string{"--kind", "x"}, `state = "open" && kind = "x"`, "[thingopen000001]"},
		{[]string{"--state", "all", "--kind", "x"}, `kind = "x"`, "[thingdone000001 thingopen000001]"},
	} {
		f, out, err := thingsList(t, tc.args...)
		if err != nil {
			t.Fatalf("%v: %v", tc.args, err)
		}
		if got := f.lastQuery.Get("filter"); got != tc.filter {
			t.Errorf("%v: filter = %q, want %q", tc.args, got, tc.filter)
		}
		var listed listOut
		if err := json.Unmarshal([]byte(out), &listed); err != nil {
			t.Fatalf("%v: stdout is not one JSON document: %v\n%s", tc.args, err, out)
		}
		ids := []string{}
		for _, item := range listed.Items {
			ids = append(ids, fmt.Sprint(item["id"]))
		}
		if fmt.Sprint(ids) != tc.ids {
			t.Errorf("%v: listed %v, want %s", tc.args, ids, tc.ids)
		}
	}
}

// The refusal of a value outside the select names all as an allowed value.
func TestListFilterDefaultRefusesAnotherValue(t *testing.T) {
	f, _, err := thingsList(t, "--state", "closed")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), "open, done, all") {
		t.Errorf("the error must name the allowed values and all: %v", err)
	}
	if len(f.requests) != 0 {
		t.Errorf("requests = %v, want none", f.requests)
	}
}

// An empty value on a flag with a default is a usage error: all is the value
// that lists every row. A flag without a default keeps an empty value.
func TestListFilterDefaultRefusesEmptyValue(t *testing.T) {
	f, _, err := thingsList(t, "--state", "")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), "all") {
		t.Errorf("the error must name all: %v", err)
	}
	if len(f.requests) != 0 {
		t.Errorf("requests = %v, want none", f.requests)
	}
}

// The help of the flag shows the default.
func TestListFilterDefaultIsTheFlagDefault(t *testing.T) {
	cmd := buildListCmd(nil, &thingsResource, commandDef{Name: "things", Short: "List things"})
	if got := cmd.Flags().Lookup("state").DefValue; got != "open" {
		t.Errorf("default of --state = %q, want open", got)
	}
}
