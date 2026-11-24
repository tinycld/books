package cli

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type listFilterCase struct {
	Name     string   `json:"name"`
	Resource string   `json:"resource"`
	Args     []string `json:"args"`
	Filter   string   `json:"filter"`
	Sort     string   `json:"sort"`
}

// testdata/list-filters.json is shared with server/cli_resources_test.go, which
// sends the same filter and sort texts to the real PocketBase API. This is the
// half that holds the fixture to the command: if list.go, its LIKE escaper or the
// client's value quoting changes what is sent, the fixture, and so the server
// test, would no longer describe the command.
func loadListFilterCases(t *testing.T) []listFilterCase {
	t.Helper()
	data, err := os.ReadFile("testdata/list-filters.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []listFilterCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("testdata/list-filters.json: %v", err)
	}
	return file.Cases
}

func TestListSendsTheTextsOfTheSharedFixture(t *testing.T) {
	for _, tc := range loadListFilterCases(t) {
		f := newFakeBooks(t)
		f.rawFilter = true
		listJSON(t, f, append([]string{"books", tc.Resource, "list"}, tc.Args...)...)
		if got := f.lastQuery.Get("filter"); got != tc.Filter {
			t.Errorf("%s: filter =\n  %s\nwant\n  %s", tc.Name, got, tc.Filter)
		}
		if got := f.lastQuery.Get("sort"); got != tc.Sort {
			t.Errorf("%s: sort = %q, want %q", tc.Name, got, tc.Sort)
		}
	}
}

// The server test sends every case, so each resource needs one that uses all of
// its filter flags and --search.
func TestListFilterFixtureHasACaseWithEveryFlagOfEveryResource(t *testing.T) {
	cases := loadListFilterCases(t)
	for _, res := range resources {
		want := []string{}
		for _, flt := range res.Filters {
			want = append(want, "--"+flt.Flag)
		}
		if len(res.Search) > 0 {
			want = append(want, "--search")
		}
		found := slices.ContainsFunc(cases, func(tc listFilterCase) bool {
			return tc.Resource == res.Name && !slices.ContainsFunc(want, func(flag string) bool {
				return !slices.Contains(tc.Args, flag)
			})
		})
		if !found {
			t.Errorf("%s: testdata/list-filters.json has no case with %v", res.Name, want)
		}
	}
}
