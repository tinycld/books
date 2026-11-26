package cli

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// helpPage is the help topic of the CLI: the one page of the commands that is
// in this repository, so the one page a test can hold to the code.
const helpPage = "../help/command-line.md"

func readDoc(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// codeText is the code of a Markdown page: the lines of its code blocks and
// the text of its code spans. A command word in plain prose does not count as
// shown.
func codeText(page string) string {
	var code []string
	inBlock := false
	for _, line := range strings.Split(page, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inBlock = !inBlock
			continue
		}
		if inBlock {
			code = append(code, line)
			continue
		}
		// Every second part of a line split at backticks is a code span.
		for i, part := range strings.Split(line, "`") {
			if i%2 == 1 {
				code = append(code, part)
			}
		}
	}
	return strings.Join(code, "\n")
}

func TestCodeTextLeavesProseOut(t *testing.T) {
	got := codeText("`--yes` answers the delete question.\n\n```\ntinycld books accounts list\n```\nUse `show <id>` then.")
	if got != "--yes\ntinycld books accounts list\nshow <id>" {
		t.Errorf("codeText = %q", got)
	}
}

// The help topic and the code are one contract. A group, a command word or an
// exit code that the topic does not name is a command nobody can find.
func TestDocsNameEveryCommand(t *testing.T) {
	root := newTestRoot(nil)
	books, _, err := root.Find([]string{"books"})
	if err != nil {
		t.Fatal(err)
	}
	words := map[string]bool{}
	groups := []string{}
	for _, group := range books.Commands() {
		if len(group.Commands()) == 0 {
			words[group.Name()] = true
			continue
		}
		groups = append(groups, group.CommandPath())
		for _, sub := range group.Commands() {
			words[sub.Name()] = true
		}
	}
	page := readDoc(t, helpPage)
	for _, group := range groups {
		if !strings.Contains(page, "`tinycld "+strings.TrimPrefix(group, "tinycld ")+"`") {
			t.Errorf("the help topic does not name the group `%s`", group)
		}
	}
	code := codeText(page)
	for word := range words {
		// In a code span, or on a line of a code block.
		shown := regexp.MustCompile(`(?m)(^|[^a-z-])` + word + `($|[^a-z-])`)
		if !shown.MatchString(code) {
			t.Errorf("the help topic does not show the command %q", word)
		}
	}
}

// "The transactions" is the one list of the transaction types: a type that has
// only a section of its own further down is not found by a reader of the list.
func TestHelpListsEveryTransactionType(t *testing.T) {
	page := readDoc(t, helpPage)
	for i := range documents {
		if line := "\n- `tinycld books " + documents[i].Name + "`"; !strings.Contains(page, line) {
			t.Errorf("the list of transaction types in the help topic has no line for `tinycld books %s`", documents[i].Name)
		}
	}
}

func TestHelpExplainsEveryFailureExitCode(t *testing.T) {
	help := readDoc(t, helpPage)
	for code := exitcode.Usage; code <= exitcode.Unavailable; code++ {
		if !strings.Contains(help, fmt.Sprintf("`%d`", code)) {
			t.Errorf("the help topic does not explain exit code %d", code)
		}
	}
}

// A caller learns the page size from the help topic, so it states the largest one.
func TestHelpStatesTheLimitRange(t *testing.T) {
	want := fmt.Sprintf("`--limit` takes 1 to %d", maxListLimit)
	if !strings.Contains(readDoc(t, helpPage), want) {
		t.Errorf("the help topic does not say %q", want)
	}
}

// The command refuses a third line of a transfer before it sends anything
// (the table's `max`); Books refuses the other order and the account types at
// the post. The topic says which refuses what.
func TestHelpSaysWhoRefusesATransfersLines(t *testing.T) {
	want := "The command refuses a transfer with more than two lines before it sends anything. Books refuses a transfer when it is posted if the lines are in the other order, or if an account is an income or expense account."
	if !strings.Contains(readDoc(t, helpPage), want) {
		t.Errorf("the help topic does not say %q", want)
	}
}

// The scripts line of the help topic explains every exit code but 0.
func TestHelpExitLineHasEveryFailureCode(t *testing.T) {
	var line string
	for _, l := range strings.Split(readDoc(t, helpPage), "\n") {
		if strings.HasPrefix(l, "- The exit code") {
			line = l
		}
	}
	if line == "" {
		t.Fatal("the help topic has no line that starts with \"- The exit code\"")
	}
	for _, exit := range exitCodes {
		if exit.Code == exitcode.OK {
			continue
		}
		if !strings.Contains(line, fmt.Sprintf("`%d`", exit.Code)) {
			t.Errorf("the exit code line does not explain exit code %d (%s)", exit.Code, exit.Name)
		}
	}
}

func TestHelpTopicFrontmatter(t *testing.T) {
	help := readDoc(t, helpPage)
	if !strings.HasPrefix(help, "---\ntitle: Books from the command line\nsummary: ") {
		t.Error("help/command-line.md must start with the frontmatter: title, summary")
	}
	// The viewer puts the reader's own host in place of the token.
	if !strings.Contains(help, "tinycld auth login {{server-host}}") {
		t.Error("the help topic must show the sign-in with {{server-host}}")
	}
	if regexp.MustCompile(`auth login [a-z0-9.-]+\.[a-z]{2,}`).MatchString(help) {
		t.Error("the help topic names a host: write {{server-host}}")
	}
}
