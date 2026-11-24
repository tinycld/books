package cli

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

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

// The pages and the code are one contract. A group, a command word or an
// exit code that a page does not name is a command nobody can find.
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
	for _, path := range []string{"../docs/cli.md", "../help/command-line.md"} {
		page := readDoc(t, path)
		for _, group := range groups {
			if !strings.Contains(page, "`tinycld "+strings.TrimPrefix(group, "tinycld ")+"`") {
				t.Errorf("%s does not name the group `%s`", path, group)
			}
		}
		code := codeText(page)
		for word := range words {
			// In a code span, or on a line of a code block.
			shown := regexp.MustCompile(`(?m)(^|[^a-z-])` + word + `($|[^a-z-])`)
			if !shown.MatchString(code) {
				t.Errorf("%s does not show the command %q", path, word)
			}
		}
	}
}

func TestDocsHaveEveryExitCode(t *testing.T) {
	for _, path := range []string{"../docs/cli.md", "../docs/cli-conventions.md"} {
		page := readDoc(t, path)
		for _, exit := range exitCodes {
			row := fmt.Sprintf("| %d | `%s` |", exit.Code, exit.Name)
			if !strings.Contains(page, row) {
				t.Errorf("%s has no exit code row %q", path, row)
			}
		}
	}
	help := readDoc(t, "../help/command-line.md")
	for code := exitcode.Usage; code <= exitcode.Unavailable; code++ {
		if !strings.Contains(help, fmt.Sprintf("`%d`", code)) {
			t.Errorf("the help topic does not explain exit code %d", code)
		}
	}
}

// The conventions page states the limits the code enforces.
func TestConventionsMatchTheCode(t *testing.T) {
	page := readDoc(t, "../docs/cli-conventions.md")
	for _, want := range []string{
		fmt.Sprintf("the default `limit` is %d and the largest %d", defaultListLimit, maxListLimit),
		fmt.Sprintf("over %d MiB", maxInputBytes>>20),
		"`--input <file>`", "`--input -`", "`--json`", "`--quiet`", "`--yes`", "`tinycld books schema`",
		"`newCommand`", "`newGroup`", "`usagef`", "`bindInput`", "`readInput`", "`report`",
		"`cli/resources.json`", "`server/cli_resources_test.go`", "`server/oauth_scopes.go`",
	} {
		if !strings.Contains(page, want) {
			t.Errorf("docs/cli-conventions.md does not say %q", want)
		}
	}
	for _, key := range []string{"code", "exit", "message", "status", "fields"} {
		if !strings.Contains(page, `"`+key+`"`) {
			t.Errorf("docs/cli-conventions.md does not name the error key %q", key)
		}
	}
}

func TestHelpTopicFrontmatter(t *testing.T) {
	help := readDoc(t, "../help/command-line.md")
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
