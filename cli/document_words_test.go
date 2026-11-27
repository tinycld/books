package cli

import (
	"slices"
	"strings"
	"testing"
)

// groupWords is what checkConversion reads to refuse a convert word that is a
// command of the group already: it names exactly the words newDocumentCmd
// gives each type, less its convert.
func TestGroupWordsAreTheCommandsOfTheGroup(t *testing.T) {
	root := newTestRoot(nil)
	for i := range documents {
		doc := &documents[i]
		group, _, err := root.Find([]string{"books", doc.Name})
		if err != nil {
			t.Fatal(err)
		}
		built := subcommandNames(group)
		if doc.Convert != nil {
			built = slices.DeleteFunc(built, func(word string) bool { return word == doc.Convert.word() })
		}
		got := slices.Clone(groupWords(doc))
		slices.Sort(got)
		slices.Sort(built)
		if strings.Join(got, ",") != strings.Join(built, ",") {
			t.Errorf("%s: groupWords = %v, the group has %v", doc.Name, got, built)
		}
	}
}
