package cli

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type listFilterCase struct {
	Name     string `json:"name"`
	Resource string `json:"resource"`
	// View is the command word of a view of the transaction type that Resource
	// names (`deposits undeposited`); empty for the `list` of Resource.
	View   string   `json:"view"`
	Args   []string `json:"args"`
	Filter string   `json:"filter"`
	Sort   string   `json:"sort"`
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
		// Core's collection: no resource file names it, so the fake does not
		// know it until a test gives it rows.
		f.rows[reportsCollection] = []rawRecord{}
		word := "list"
		if tc.View != "" {
			word = tc.View
		}
		listJSON(t, f, append([]string{"books", tc.Resource, word}, tc.Args...)...)
		if got := f.lastQuery.Get("filter"); got != tc.Filter {
			t.Errorf("%s: filter =\n  %s\nwant\n  %s", tc.Name, got, tc.Filter)
		}
		if got := f.lastQuery.Get("sort"); got != tc.Sort {
			t.Errorf("%s: sort = %q, want %q", tc.Name, got, tc.Sort)
		}
	}
}

// listTarget is one list of the CLI: a resource's `list`, a transaction type's
// `list`, or a view of a transaction type (`deposits undeposited`).
type listTarget struct {
	name, view string
	res        *resource
}

func listTargets() []listTarget {
	targets := []listTarget{}
	for i := range resources {
		targets = append(targets, listTarget{name: resources[i].Name, res: &resources[i]})
	}
	for i := range documents {
		doc := &documents[i]
		targets = append(targets, listTarget{name: doc.Name, res: &doc.resource})
		for j := range doc.Views {
			targets = append(targets, listTarget{name: doc.Name, view: doc.Views[j].Word, res: &doc.Views[j].resource})
		}
	}
	// A list that is built in Go, not read from a file.
	targets = append(targets, listTarget{name: reportsResource.Name, res: &reportsResource})
	// The lists of `banking`: `list` is the group's own, the others are views.
	for word, res := range bankingResources() {
		view := word
		if word == "list" {
			view = ""
		}
		targets = append(targets, listTarget{name: "banking", view: view, res: res})
	}
	targets = append(targets, listTarget{name: "reconcile", res: &reconciliationsResource})
	// The lists of `inventory` are both views: the group has no `list`.
	for word, res := range inventoryResources() {
		targets = append(targets, listTarget{name: "inventory", view: word, res: res})
	}
	return targets
}

// The server test sends every case, so each list (of a resource, of a
// transaction type, and of a view) needs one that uses all of its filter flags
// and --search. A scoped type needs one with no flag, which shows its scope.
func TestListFilterFixtureHasACaseWithEveryFlagOfEveryList(t *testing.T) {
	cases := loadListFilterCases(t)
	for _, target := range listTargets() {
		want := []string{}
		for _, flt := range target.res.Filters {
			want = append(want, "--"+flt.Flag)
		}
		if len(target.res.Search) > 0 {
			want = append(want, "--search")
		}
		found := slices.ContainsFunc(cases, func(tc listFilterCase) bool {
			return tc.Resource == target.name && tc.View == target.view && !slices.ContainsFunc(want, func(flag string) bool {
				return !slices.Contains(tc.Args, flag)
			})
		})
		if !found {
			t.Errorf("%s %s: testdata/list-filters.json has no case with %v", target.name, target.view, want)
		}
		if len(target.res.scope) == 0 {
			continue
		}
		if !slices.ContainsFunc(cases, func(tc listFilterCase) bool {
			return tc.Resource == target.name && tc.View == target.view && len(tc.Args) == 0
		}) {
			t.Errorf("%s: a scoped type has no case with no flag in testdata/list-filters.json", target.name)
		}
	}
}
