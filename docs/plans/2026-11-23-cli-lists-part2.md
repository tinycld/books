# Books CLI Foundation and Lists Implementation Plan (part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the `tinycld books` command group: a `schema` command that describes every command, the six list resources after accounts (customers, vendors, products, bundle items, tax agencies, tax rates and groups), a server test that holds the CLI to the real collections, and the docs and help topic.

**Architecture:** Part 1 built the engine and proved it on accounts. Here, `schema` reads each command's description back from the command itself (the annotations that `newCommand` stored), so it cannot differ from what runs. The six other resources are data only: entries in `cli/resources.json`, with no Go code. `server/cli_resources_test.go` is the drift guard: it reads `cli/resources.json` from the server module's tests and checks it against the migrated collections, the OAuth registration and the real PocketBase API. The docs are held to the code by `cli/docs_test.go`.

**Tech Stack:** Go 1.27, cobra v1.10.2, pflag, `tinycld.org/cli/{client,output,exitcode}`, PocketBase test app (`tests.NewTestApp`, through the Books server test helpers), Markdown.

**Spec:** `/Users/nas/code/tinycld/docs/superpowers/specs/2026-10-21-books-design.md`, section "CLI" (lines 68-76). Unit `p8-cli-lists` of `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml`.

**Parts:** this file holds Tasks 9-12. Part 1 (`2026-11-23-cli-lists.md`, in the same folder) holds Tasks 1-8 and must be done first: every task here builds on its files. The outline of all tasks is `/Users/nas/tmp/tinycld/auto-helix-books/staging/p8-cli-lists/plan-outline.md`.

## Global Constraints

- Workspace root: `/Users/nas/tmp/tinycld/books-purchases`. Books repo: `/Users/nas/tmp/tinycld/books-purchases/books`, branch `books/p8-cli-lists`. Core repo: `/Users/nas/tmp/tinycld/books-purchases/tinycld`. No task of this part edits core.
- Spec: "`--json` on every command, record input as JSON on stdin or from a file, stable exit codes, and a `schema` command that describes each command's input and output."
- Spec: "It signs in through the core CLI client and the Books OAuth scopes". The scopes are `books:read` and `books:write` (`server/oauth_scopes.go`). No new scope, no new route, no CLI-only endpoint.
- The CLI module imports `tinycld.org/cli/...`, cobra and pflag only. It never imports the Books server module (`tinycld.org/packages/books`). The server test of Task 11 reads the CLI's files from disk (`../cli/resources.json`); it does not import the CLI module.
- Exit codes: 0 ok, 1 failed, 2 usage, 3 auth, 4 forbidden, 5 not_found, 6 refused, 7 unavailable. The numbers never change.
- With `--json`, standard output holds exactly one JSON document: the result, or `{"error": {...}}`. Two calls print no JSON, because the shell answers before a Books command runs: a call whose flags cannot be parsed (exit 2, text on stderr, nothing on stdout), and a call for help (`--help`, or a group with no command word: help text, exit 0).
- Money is a whole number of cents; a tax rate is a whole number of parts per million. Numbers pass through as written (`json.Number`); the CLI does no arithmetic.
- An address is an object with all six keys (`line1`, `line2`, `city`, `region`, `postal_code`, `country`), each a string, or `null`. The server refuses an address with fewer keys (`server/address.go`, measured 2026-11-23), so the CLI refuses it first (part 1, Task 7).
- No `os.Exit`, no `fmt.Print` to the real stdout in a command: write through `cmd.OutOrStdout()` / `cmd.ErrOrStderr()`.
- Go files pass `gofmt -l .` (no output) and `go vet ./...`.
- A commit message does not name an AI tool or a session.
- Run the Go commands of Tasks 9, 10 and 12 in `/Users/nas/tmp/tinycld/books-purchases/books/cli`. They take under 5 seconds.
- **The full `books/server` Go suite takes about 6.5 minutes. No task runs it.** Task 11 runs only `go test -run CLIResources .` (2.5 seconds) and hands the full suite back as `NEEDS-RUN`.
- The word "router" is reserved in this workspace: write "the PocketBase API" for the server's HTTP layer, in code comments and docs too.
- A help topic never names a deployment hostname: write `{{server-host}}`.
- Change a file with the Edit or Write tool, never with a scripted replace.

## Review Focus

Inputs and conditions the spec does not name, that a caller or a later unit will meet. Each one is pinned by a test in the task that owns the code.

1. A later unit adds a command without a schema, or a group that prints help and exits 0 for a mistyped word. Expected: the build goes red. Test: `TestEveryCommandHasASchema` (Task 9), which walks every command and sends an unknown word to every group.
2. `tinycld books schema` asked for a command that does not exist (`schema accounts post`). Expected: exit 2 and the error document, not an empty answer that a program reads as "no input needed". Test: `TestSchemaOfAnUnknownCommandIsAUsageError` (Task 9).
3. An input that has the right field with the wrong shape: a fraction of a cent, a rate as a percent (`8.875`), one id where a list is needed, an address as text or with some of its keys. Expected: exit 2, the field named, nothing sent. Test: `TestMoneyFieldsRefuseAFraction` (Task 10). That the server takes the right shapes: `TestCLIResources_EveryResourceRoundTrip` (Task 11).
4. A migration after this unit adds, renames, retypes or hides a column, or a new collection has no OAuth entry. Expected: a server test names the resource and the field. Tests: `TestCLIResources_MatchTheCollections`, `TestCLIResources_OAuthAllowsEveryCollection` (Task 11); Task 11 Step 3 proves the first one fails.
5. A caller whose Books access level is below the action, and text with a quote in `--search`, against the real PocketBase API. Expected: an `add` is 400 with no field, an `edit` is 404, and the quote is text. Tests: `TestCLIResources_RefusalShapes`, `TestCLIResources_AccountRoundTrip`, `TestCLIResources_ServerAcceptsEveryListQuery` (Task 11). The docs say the same: `docs/cli-conventions.md` (Task 12).

## File Structure

All under `/Users/nas/tmp/tinycld/books-purchases/books`:

| File | Purpose | Task |
|---|---|---|
| `cli/schema.go` (new) | `tinycld books schema [command…]`: `commandSpec`, `specOf`, `allSpecs`, the conventions and the exit code table | 9 |
| `cli/schema_test.go` (new) | its tests; `TestEveryCommandHasASchema`; `TestInputSchemaAgreesWithCheckInput` | 9 |
| `cli/register.go` (change) | adds `schema` to the `books` group | 9 |
| `cli/resources.json` (change) | from one resource (accounts) to seven | 10 |
| `cli/resources_test.go` (new) | command tests of the six other resources | 10 |
| `server/cli_resources_test.go` (new) | `cli/resources.json` against the collections, the OAuth registration and the real PocketBase API | 11 |
| `docs/cli.md` (new) | the CLI page: sign-in, groups, commands, examples, exit codes | 12 |
| `docs/cli-conventions.md` (new) | the conventions, for callers and for the authors of later commands | 12 |
| `help/command-line.md` (new) | the in-app help topic `books:command-line` | 12 |
| `cli/docs_test.go` (new) | the pages name every group, command and exit code | 12 |
| `README.md` (change) | two links in the "Docs" list | 12 |

---

### Task 9: The `schema` command

`tinycld books schema` prints, as JSON, what holds for every Books command and, for each command, its arguments, flags, the JSON Schema of its `--input` document and the JSON Schema of its `--json` result. `tinycld books schema accounts add` prints one command. Nothing is written twice: `newCommand` (part 1, Task 2) stored each command's schemas in the cobra annotations, and this command reads them back.

**Files (all under `/Users/nas/tmp/tinycld/books-purchases/books`):**
- Create: `cli/schema.go`
- Modify: `cli/register.go` (the whole file is replaced; it gains one line)
- Test: `cli/schema_test.go`

**Interfaces:**
- Consumes:
  - `tinycld.org/cli/exitcode` (Task 1): `exitcode.OK … exitcode.Unavailable`, `exitcode.Name(code int) string`, `exitcode.New(code int, err error) error`, `exitcode.Of(err error) int`.
  - Task 2: `type argSpec struct { Name, Help string }`; `newGroup(name, short string) *cobra.Command`; `schemaAnnotations(args []argSpec, input, output map[string]any) map[string]string`; the annotation keys `annotationArgs`, `annotationInput`, `annotationOutput`; `usagef(format string, a ...any) error`; `report(cmd *cobra.Command, o output.Options, err error) error`; test helpers `newTestRoot(c *client.Client) *cobra.Command`, `runCmd(t, c, stdin string, args ...string) (stdout, stderr string, err error)`.
  - Task 4: `var resources []resource`; `(*resource).field(name string) *field` (`field.Required bool`).
  - Task 5: `newResourceCmd(c *client.Client, res *resource) *cobra.Command`. Task 6: `newAccountTypesCmd() *cobra.Command`.
  - Task 7: `inputSchema(res *resource, create bool) map[string]any` (a field that is not required has `null` in its `type`, and in its `enum` when it has one); `checkInput(res *resource, body map[string]any, create bool) error`.
  - `tinycld.org/cli/output`: `output.FromCommand(cmd) (output.Options, bool, error)`.
- Produces:
  - `type flagSpec struct { Name, Type, Default, Help string }` (JSON `name`, `type`, `default`, `help`; `Name` has its dashes: `--limit`)
  - `type exitSpec struct { Code int; Name, Meaning string }` (JSON `code`, `name`, `meaning`)
  - `type commandSpec struct { Command, Summary string; Args []argSpec; Flags []flagSpec; Input, Output json.RawMessage }` (JSON `command`, `summary`, `args`, `flags`, `input`, `output`)
  - `type conventions struct { Output, Input, Errors string; GlobalFlags []flagSpec; ExitCodes []exitSpec; ErrorSchema map[string]any }`; `type schemaDoc struct { Conventions conventions; Commands []commandSpec }`
  - `var exitCodes []exitSpec` (the eight codes, in order; Task 12's `cli/docs_test.go` reads it)
  - `func flagSpecs(flags *pflag.FlagSet) []flagSpec` (in name order, without `--help` and hidden flags; Task 10's test uses it)
  - `func specOf(cmd *cobra.Command) (commandSpec, bool)`; `func allSpecs(books *cobra.Command) []commandSpec`
  - `func newSchemaCmd(books *cobra.Command) *cobra.Command`
  - `Register` adds `newSchemaCmd(books)` to the group.
  - Test helper `holds(keyword any, want any) bool`: whether a decoded JSON Schema keyword (a value or a list) has a value. Task 10's test uses it.

- [ ] **Step 1: Write the failing tests**

Create `/Users/nas/tmp/tinycld/books-purchases/books/cli/schema_test.go`:

```go
package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
)

type schemaOut struct {
	Conventions struct {
		Output      string         `json:"output"`
		Input       string         `json:"input"`
		Errors      string         `json:"errors"`
		GlobalFlags []flagSpec     `json:"globalFlags"`
		ExitCodes   []exitSpec     `json:"exitCodes"`
		ErrorSchema map[string]any `json:"errorSchema"`
	} `json:"conventions"`
	Commands []specOut `json:"commands"`
}

type specOut struct {
	Command string         `json:"command"`
	Summary string         `json:"summary"`
	Args    []argSpec      `json:"args"`
	Flags   []flagSpec     `json:"flags"`
	Input   map[string]any `json:"input"`
	Output  map[string]any `json:"output"`
}

func flagNames(flags []flagSpec) string {
	names := make([]string, len(flags))
	for i, f := range flags {
		names[i] = f.Name
	}
	return strings.Join(names, " ")
}

func stringsOf(v any) []string {
	list, _ := v.([]any)
	out := make([]string, len(list))
	for i, item := range list {
		out[i], _ = item.(string)
	}
	return out
}

// Every command that does work has a schema. A command a later unit adds
// without newCommand, or without a schema, fails here.
func TestEveryCommandHasASchema(t *testing.T) {
	root := newTestRoot(nil)
	books, _, _ := root.Find([]string{"books"})
	leaves := 0
	var walk func(cmd *cobra.Command)
	walk = func(cmd *cobra.Command) {
		if cmd.HasSubCommands() {
			for _, sub := range cmd.Commands() {
				walk(sub)
			}
			return
		}
		leaves++
		spec, ok := specOf(cmd)
		if !ok {
			t.Errorf("%q has no schema: build it with newCommand", cmd.CommandPath())
			return
		}
		if spec.Summary == "" {
			t.Errorf("%q has no summary", cmd.CommandPath())
		}
		var out map[string]any
		if err := json.Unmarshal(spec.Output, &out); err != nil || out["type"] == nil {
			t.Errorf("%q: the output schema has no type: %s", cmd.CommandPath(), spec.Output)
		}
		for _, f := range spec.Flags {
			if f.Help == "" {
				t.Errorf("%q: flag %s has no help text", cmd.CommandPath(), f.Name)
			}
		}
	}
	walk(books)
	// Every group refuses an unknown word. A group built without newGroup
	// prints the help and exits 0 for a typing mistake.
	var groups func(cmd *cobra.Command)
	groups = func(cmd *cobra.Command) {
		if !cmd.HasSubCommands() {
			return
		}
		words := append(strings.Fields(strings.TrimPrefix(cmd.CommandPath(), "tinycld ")), "no-such-word")
		_, _, err := runCmd(t, nil, "", words...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%q with an unknown word: exit = %d, want 2: build the group with newGroup", cmd.CommandPath(), got)
		}
		for _, sub := range cmd.Commands() {
			groups(sub)
		}
	}
	groups(books)
	if leaves != len(allSpecs(books)) {
		t.Errorf("%d commands, %d schemas", leaves, len(allSpecs(books)))
	}
	if leaves < 9 {
		t.Errorf("only %d commands were found: the walk is wrong", leaves)
	}
}

func TestSchemaOfEverything(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema")
	if err != nil {
		t.Fatal(err)
	}
	var doc schemaOut
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatalf("`books schema` must print JSON without --json: %v\n%s", err, out)
	}
	codes := []string{}
	for _, e := range doc.Conventions.ExitCodes {
		codes = append(codes, fmt.Sprintf("%d=%s", e.Code, e.Name))
		if e.Meaning == "" {
			t.Errorf("exit code %d has no meaning", e.Code)
		}
	}
	if got := strings.Join(codes, " "); got != "0=ok 1=failed 2=usage 3=auth 4=forbidden 5=not_found 6=refused 7=unavailable" {
		t.Errorf("exit codes = %s", got)
	}
	if got := flagNames(doc.Conventions.GlobalFlags); got != "--context --json --no-color --output --quiet --yes" {
		t.Errorf("global flags = %s", got)
	}
	if doc.Conventions.Output == "" || doc.Conventions.Input == "" || doc.Conventions.Errors == "" {
		t.Error("a convention text is empty")
	}
	if doc.Conventions.ErrorSchema["type"] != "object" {
		t.Errorf("error schema = %v", doc.Conventions.ErrorSchema)
	}
	commands := []string{}
	for _, c := range doc.Commands {
		commands = append(commands, strings.TrimPrefix(c.Command, "tinycld books "))
	}
	for _, want := range []string{"accounts list", "accounts show", "accounts add", "accounts edit",
		"accounts activate", "accounts deactivate", "accounts delete", "accounts types", "schema"} {
		found := false
		for _, have := range commands {
			found = found || have == want
		}
		if !found {
			t.Errorf("no schema for %q; have: %v", want, commands)
		}
	}
}

func TestSchemaOfOneCommand(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema", "accounts", "add", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var spec specOut
	if err := json.Unmarshal([]byte(out), &spec); err != nil {
		t.Fatal(err)
	}
	if spec.Command != "tinycld books accounts add" || len(spec.Args) != 0 || flagNames(spec.Flags) != "--input" {
		t.Errorf("spec = %+v", spec)
	}
	if got := strings.Join(stringsOf(spec.Input["required"]), " "); got != "name type detail_type" {
		t.Errorf("required = %q", got)
	}
	if spec.Input["additionalProperties"] != false {
		t.Error("the input schema must refuse unknown fields, as checkInput does")
	}
	props := spec.Input["properties"].(map[string]any)
	if _, ok := props["full_name"]; ok {
		t.Error("a field the server sets must not be in the input schema")
	}
	if _, ok := props["id"]; ok {
		t.Error("id must not be in the input schema")
	}
	outProps := spec.Output["properties"].(map[string]any)
	for _, key := range []string{"id", "full_name", "created"} {
		if _, ok := outProps[key]; !ok {
			t.Errorf("the output schema has no %q", key)
		}
	}
}

func TestSchemaOfEditListAndDelete(t *testing.T) {
	one := func(words ...string) specOut {
		out, _, err := runCmd(t, nil, "", append([]string{"books", "schema"}, words...)...)
		if err != nil {
			t.Fatalf("%v: %v", words, err)
		}
		var spec specOut
		if err := json.Unmarshal([]byte(out), &spec); err != nil {
			t.Fatal(err)
		}
		return spec
	}
	edit := one("accounts", "edit")
	if len(edit.Args) != 1 || edit.Args[0].Name != "id" || edit.Input["minProperties"] != float64(1) {
		t.Errorf("edit = %+v", edit)
	}
	if _, has := edit.Input["required"]; has {
		t.Error("edit must not require fields: the others keep their values")
	}
	list := one("accounts", "list")
	if got := flagNames(list.Flags); got != "--all --inactive --limit --page --parent --search --type" {
		t.Errorf("list flags = %s", got)
	}
	if list.Input != nil {
		t.Errorf("list reads no input, got %v", list.Input)
	}
	if got := strings.Join(stringsOf(list.Output["required"]), " "); got != "items page limit total" {
		t.Errorf("list output keys = %q", got)
	}
	del := one("accounts", "delete")
	if _, ok := del.Output["properties"].(map[string]any)["deleted"]; !ok {
		t.Errorf("delete output = %v", del.Output)
	}
}

func TestSchemaOfAnUnknownCommandIsAUsageError(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema", "accounts", "post", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), `"tinycld books accounts post" is not a command`) {
		t.Errorf("error = %v", err)
	}
	if !strings.Contains(out, `"code": "usage"`) {
		t.Errorf("no JSON error document:\n%s", out)
	}
}

// holds reports whether a JSON Schema keyword (a value or a list of values,
// as decoded from JSON) has want.
func holds(keyword any, want any) bool {
	if list, ok := keyword.([]any); ok {
		for _, item := range list {
			if item == want {
				return true
			}
		}
		return false
	}
	return keyword == want
}

// What the schema says the input is, checkInput enforces. A program that
// checks its document against the schema first must get the same answer as
// the command: null is in a property's type exactly when checkInput takes
// null, "" and null are in a select's values exactly when checkInput takes
// them, and a name outside the properties is refused.
func TestInputSchemaAgreesWithCheckInput(t *testing.T) {
	for i := range resources {
		res := &resources[i]
		raw, err := json.Marshal(inputSchema(res, false))
		if err != nil {
			t.Fatal(err)
		}
		var schema struct {
			Properties map[string]struct {
				Type any   `json:"type"`
				Enum []any `json:"enum"`
			} `json:"properties"`
		}
		if err := json.Unmarshal(raw, &schema); err != nil {
			t.Fatal(err)
		}
		if len(schema.Properties) == 0 {
			t.Errorf("%s: the input schema has no properties", res.Name)
		}
		for name, prop := range schema.Properties {
			takesNull := checkInput(res, map[string]any{name: nil}, false) == nil
			if holds(prop.Type, "null") != takesNull {
				t.Errorf("%s.%s: the schema type is %v, and checkInput takes null = %v", res.Name, name, prop.Type, takesNull)
			}
			if prop.Enum == nil {
				continue
			}
			takesEmpty := checkInput(res, map[string]any{name: ""}, false) == nil
			if holds(prop.Enum, "") != takesEmpty || holds(prop.Enum, nil) != takesNull {
				t.Errorf("%s.%s: the schema values are %v; checkInput takes \"\" = %v, null = %v", res.Name, name, prop.Enum, takesEmpty, takesNull)
			}
		}
		if err := checkInput(res, map[string]any{"no_such_field": nil}, false); err == nil {
			t.Errorf("%s: an unknown field was accepted", res.Name)
		}
	}
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && go test .`
Expected: FAIL to build. The first lines:

```
./schema_test.go:19:17: undefined: flagSpec
./schema_test.go:20:17: undefined: exitSpec
```

- [ ] **Step 3: Write `schema.go`**

Create `/Users/nas/tmp/tinycld/books-purchases/books/cli/schema.go`:

```go
package cli

import (
	"encoding/json"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// commandSpec describes one command to a program that calls it.
type commandSpec struct {
	// Command is the command line up to the arguments.
	Command string     `json:"command"`
	Summary string     `json:"summary"`
	Args    []argSpec  `json:"args"`
	Flags   []flagSpec `json:"flags"`
	// Input is the JSON Schema of the --input document, or null.
	Input json.RawMessage `json:"input"`
	// Output is the JSON Schema of the document on stdout with --json.
	Output json.RawMessage `json:"output"`
}

type flagSpec struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Default string `json:"default"`
	Help    string `json:"help"`
}

type exitSpec struct {
	Code    int    `json:"code"`
	Name    string `json:"name"`
	Meaning string `json:"meaning"`
}

// conventions is what holds for every Books command. docs/cli-conventions.md
// says the same in prose; cli/docs_test.go holds the two together.
type conventions struct {
	Output      string         `json:"output"`
	Input       string         `json:"input"`
	Errors      string         `json:"errors"`
	GlobalFlags []flagSpec     `json:"globalFlags"`
	ExitCodes   []exitSpec     `json:"exitCodes"`
	ErrorSchema map[string]any `json:"errorSchema"`
}

type schemaDoc struct {
	Conventions conventions   `json:"conventions"`
	Commands    []commandSpec `json:"commands"`
}

// exitCodes is the meaning of each exit code for a Books command.
var exitCodes = []exitSpec{
	{exitcode.OK, exitcode.Name(exitcode.OK), "The command did what was asked."},
	{exitcode.Failed, exitcode.Name(exitcode.Failed), "A failure of no other class."},
	{exitcode.Usage, exitcode.Name(exitcode.Usage), "The call is wrong: a flag, an argument or the --input document. Nothing was sent. Correct the call."},
	{exitcode.Auth, exitcode.Name(exitcode.Auth), "Not signed in, or the sign-in ended. Run `tinycld auth login <host>`."},
	{exitcode.Forbidden, exitcode.Name(exitcode.Forbidden), "The server refuses this caller: the token has no Books scope for the action."},
	{exitcode.NotFound, exitcode.Name(exitcode.NotFound), "No record has this id, or the caller's Books access level does not allow the action on it."},
	{exitcode.Refused, exitcode.Name(exitcode.Refused), "The server refused the data. `message` and `fields` say why. Change the input; the same call fails again. An `add` that a caller's Books access level does not allow is refused this way too, with no field."},
	{exitcode.Unavailable, exitcode.Name(exitcode.Unavailable), "The server did not answer, or is busy. The same call can succeed later."},
}

var errorSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"error": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"code":    map[string]any{"type": "string", "description": "the name of the exit code"},
				"exit":    map[string]any{"type": "integer", "description": "the process exit code"},
				"message": map[string]any{"type": "string", "description": "the server's message for a refusal, or the CLI's own"},
				"status":  map[string]any{"type": "integer", "description": "the HTTP status, when the server answered"},
				"fields": map[string]any{
					"type":        "object",
					"description": "for each field the server refused, its code and message",
					"additionalProperties": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"code":    map[string]any{"type": "string"},
							"message": map[string]any{"type": "string"},
						},
					},
				},
			},
			"required": []string{"code", "exit", "message"},
		},
	},
	"required": []string{"error"},
}

func flagSpecs(flags *pflag.FlagSet) []flagSpec {
	specs := []flagSpec{}
	flags.VisitAll(func(f *pflag.Flag) {
		if f.Hidden || f.Name == "help" {
			return
		}
		specs = append(specs, flagSpec{Name: "--" + f.Name, Type: f.Value.Type(), Default: f.DefValue, Help: f.Usage})
	})
	return specs
}

// specOf reads a command's description back from the command itself: the
// annotations newCommand stored, and the flags as cobra holds them. ok is
// false for a command with no schema (a group).
func specOf(cmd *cobra.Command) (commandSpec, bool) {
	out, has := cmd.Annotations[annotationOutput]
	if !has || out == "null" {
		return commandSpec{}, false
	}
	spec := commandSpec{
		Command: cmd.CommandPath(),
		Summary: cmd.Short,
		Flags:   flagSpecs(cmd.LocalFlags()),
		Input:   json.RawMessage(cmd.Annotations[annotationInput]),
		Output:  json.RawMessage(out),
	}
	if err := json.Unmarshal([]byte(cmd.Annotations[annotationArgs]), &spec.Args); err != nil || spec.Args == nil {
		spec.Args = []argSpec{}
	}
	return spec, true
}

// allSpecs lists every command under books that has a schema, in the order
// the help prints them.
func allSpecs(books *cobra.Command) []commandSpec {
	specs := []commandSpec{}
	var walk func(cmd *cobra.Command)
	walk = func(cmd *cobra.Command) {
		if spec, ok := specOf(cmd); ok {
			specs = append(specs, spec)
		}
		for _, sub := range cmd.Commands() {
			walk(sub)
		}
	}
	walk(books)
	return specs
}

// newSchemaCmd is `tinycld books schema [command…]`: with no words, the
// conventions and every command; with the words of one command (`accounts
// add`), that command alone. It prints JSON in every output mode: the
// document is for programs.
//
// It is not built by newCommand, which wants a fixed argument count.
func newSchemaCmd(books *cobra.Command) *cobra.Command {
	args := []argSpec{{Name: "command", Help: "the words of one command after `books`, for example `accounts add`; none for all commands"}}
	outputSchema := map[string]any{
		"description": "With no argument: {conventions, commands}. With the words of a command: that command's entry of `commands`.",
		"type":        "object",
	}
	cmd := &cobra.Command{
		Use:   "schema [command…]",
		Short: "Describe each command's arguments, flags, input and output as JSON",
		Long: "Print, as JSON, what holds for every Books command (output, input, errors,\n" +
			"exit codes) and for each command its arguments, flags, the JSON Schema of\n" +
			"its --input document and the JSON Schema of its --json result.\n\n" +
			"  tinycld books schema                 everything\n" +
			"  tinycld books schema accounts add    one command",
		Args:        cobra.ArbitraryArgs,
		Annotations: schemaAnnotations(args, nil, outputSchema),
	}
	cmd.RunE = func(cmd *cobra.Command, words []string) error {
		o, _, err := output.FromCommand(cmd)
		if err != nil {
			return exitcode.New(exitcode.Usage, err)
		}
		var doc any
		specs := allSpecs(books)
		if len(words) == 0 {
			doc = schemaDoc{
				Conventions: conventions{
					Output:      "With --json, stdout holds exactly one JSON document: the result of the command, or {\"error\": …} when it failed. Progress text goes to stderr; --quiet removes it. An id in a result is the id the other commands take. Two calls print no JSON: one whose flags cannot be parsed (exit 2, text on stderr only), and a call for help (--help, or a group with no command word: help text, exit 0).",
					Input:       "A command that takes a record reads one JSON object from --input <file>, or from standard input with --input -. `add` needs the required fields. `edit` changes only the fields that are named; null clears a field. Money is an integer of cents.",
					Errors:      "A failed command exits with a code of exitCodes, prints `Error: <message>` on stderr, and with --json prints the document of errorSchema on stdout. A call whose flags cannot be parsed exits 2 and prints no JSON.",
					GlobalFlags: flagSpecs(cmd.InheritedFlags()),
					ExitCodes:   exitCodes,
					ErrorSchema: errorSchema,
				},
				Commands: specs,
			}
		} else {
			want := books.CommandPath() + " " + strings.Join(words, " ")
			found := false
			for _, spec := range specs {
				if spec.Command == want {
					doc, found = spec, true
				}
			}
			if !found {
				return report(cmd, o, usagef("%q is not a command; `%s schema` lists them", want, books.CommandPath()))
			}
		}
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "    ")
		return report(cmd, o, enc.Encode(doc))
	}
	return cmd
}
```

- [ ] **Step 4: Add `schema` to the group**

Replace `/Users/nas/tmp/tinycld/books-purchases/books/cli/register.go` with:

```go
// Package cli contributes the `tinycld books` command group.
//
// Every command is an HTTP client of the PocketBase record API. Books has no
// CLI-only endpoint and must not grow one: the collection rules and the Go
// guards in server/ are the whole authorization and validation, so a write
// from here is checked exactly as a write from the app.
//
// The commands are built for agents. docs/cli-conventions.md is the contract:
// --json output, JSON input from --input, the exit codes of
// tinycld.org/cli/exitcode, and `books schema`. A new command goes through
// newCommand, which gives it all four.
package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

func Register(root *cobra.Command, c *client.Client) {
	books := newGroup("books", "Books: accounts, customers, vendors, products and sales tax")
	books.Aliases = []string{"book"}
	for i := range resources {
		group := newResourceCmd(c, &resources[i])
		if resources[i].Name == "accounts" {
			group.AddCommand(newAccountTypesCmd())
		}
		books.AddCommand(group)
	}
	books.AddCommand(newSchemaCmd(books))
	root.AddCommand(books)
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && gofmt -l . && go vet ./... && go test .`
Expected: no `gofmt` output, no `vet` output, `ok  	tinycld.org/packages/books/cli`.

If `TestEveryCommandHasASchema` says a group does not exit 2 for an unknown word, that group was built without `newGroup` in part 1: correct the group, not the test.

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-purchases/books
git add cli/schema.go cli/schema_test.go cli/register.go
git commit -m "feat(cli): books schema describes every command as JSON"
```

---

### Task 10: Customers, vendors, products, bundle items, tax agencies, tax rates and groups

Six resources more, as data. No Go code changes other than the test: `loadResources` (part 1, Task 4) checks the file when the program starts, and `newResourceCmd` builds each group from its entry.

What an entry says, for the implementer who has not read Task 4: `collection` is the PocketBase collection; `sort` is the `sort` parameter of `list`; `label` is the field a message names the record by (`""`: the id); `columns` are the table columns; `search` are the fields `--search` looks in; each `filters` entry is one `list` flag that is an exact match on a field; `omit` lists the collection fields the CLI leaves out on purpose (`form` and `fields` hold the custom-form answers of the app; `sort_key` is set by the server for sorting); a field with `readOnly` is set by the server and refused in an input; `ref` names the resource a relation points to. An entry with an `inactive` field gets `activate` and `deactivate`. `bundle-items` has none.

**Files (all under `/Users/nas/tmp/tinycld/books-purchases/books`):**
- Modify: `cli/resources.json` (the whole file is replaced: the accounts entry is unchanged, six entries follow it)
- Test: `cli/resources_test.go`

**Interfaces:**
- Consumes:
  - Task 2: `subcommandNames(cmd *cobra.Command) []string`, `newTestRoot`, `runCmd`.
  - Task 4: `var resources []resource` (`Name`, `Sort`), `findResource(name string) *resource`, `recordKeys(res *resource) []string`, `(*resource).hasInactive() bool`.
  - Task 5: `type rawRecord map[string]any`; the test fake `newFakeBooks(t) *fakeBooks` with `rows map[string][]rawRecord`, `add(collection, id string, fields map[string]any)`, `serve() *client.Client`, `find(collection, id string) rawRecord`, `lastCreate map[string]any`, `lastQuery url.Values`, `requests []string`. The fake gives a created record the id `rec000000000001` (the first of a test).
  - Task 6: test type `listOut struct { Items []map[string]any; Page, Limit, Total int }`.
  - Task 7: test helper `decodeRecord(t, out string) map[string]any`.
  - Task 7: `inputSchema(res *resource, create bool) map[string]any`.
  - Task 9: `flagSpecs(flags *pflag.FlagSet) []flagSpec`; test helper `holds(keyword any, want any) bool`.
- Produces:
  - `cli/resources.json` with the resources, in this order: `accounts`, `customers`, `vendors`, `products`, `bundle-items`, `tax-agencies`, `tax-rates`. Task 11 checks every entry against its collection; Task 12's pages name every group.
  - Test table `resourceCases []resourceCase` (one case for each resource other than accounts) and `TestEveryResourceHasACase`, which fails when a later unit adds a resource with no case.

- [ ] **Step 1: Write the failing tests**

Create `/Users/nas/tmp/tinycld/books-purchases/books/cli/resources_test.go`:

```go
package cli

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// resourceCase is one list resource other than accounts: an input `add`
// accepts, the body it must send, and what its commands look like.
type resourceCase struct {
	name       string
	collection string
	singular   string
	commands   string
	listFlags  []string
	input      string
	sent       string
	label      string
}

var resourceCases = []resourceCase{
	{
		name: "customers", collection: "books_customers", singular: "customer",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "parent", "search"},
		input: `{"display_name": "Acme Corp", "email": "ap@acme.example", "terms": "net_30",
			"billing_address": {"line1": "1 Main St", "line2": "", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "US"},
			"shipping_address": null, "tax_exempt": true, "exemption_reason": "resale", "exemption_number": "R-1"}`,
		sent: `{"billing_address":{"city":"Springfield","country":"US","line1":"1 Main St","line2":"","postal_code":"62701","region":"IL"},` +
			`"display_name":"Acme Corp","email":"ap@acme.example","exemption_number":"R-1","exemption_reason":"resale",` +
			`"shipping_address":null,"tax_exempt":true,"terms":"net_30"}`,
		label: "Acme Corp",
	},
	{
		name: "vendors", collection: "books_vendors", singular: "vendor",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search"},
		input: `{"display_name": "Paper Supply", "expense_account": "acctsupplies001",
			"address": {"line1": "9 Mill Rd", "line2": "", "city": "", "region": "", "postal_code": "", "country": ""},
			"track_1099": true, "legal_name": "Paper Supply LLC", "tax_id_type": "ein", "tax_id": "12-3456789"}`,
		sent: `{"address":{"city":"","country":"","line1":"9 Mill Rd","line2":"","postal_code":"","region":""},"display_name":"Paper Supply","expense_account":"acctsupplies001",` +
			`"legal_name":"Paper Supply LLC","tax_id":"12-3456789","tax_id_type":"ein","track_1099":true}`,
		label: "Paper Supply",
	},
	{
		name: "products", collection: "books_products", singular: "product",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search", "type"},
		input: `{"type": "service", "name": "Consulting hour", "sku": "CONS-1", "price": 15000,
			"income_account": "acctincome00001", "taxable": false}`,
		sent:  `{"income_account":"acctincome00001","name":"Consulting hour","price":15000,"sku":"CONS-1","taxable":false,"type":"service"}`,
		label: "Consulting hour",
	},
	{
		name: "bundle-items", collection: "books_bundle_items", singular: "bundle item",
		commands:  "add delete edit list show",
		listFlags: []string{"bundle", "limit", "page", "product"},
		input:     `{"bundle": "prodbundle00001", "product": "prodservice0001", "quantity": 2.5, "position": 0}`,
		sent:      `{"bundle":"prodbundle00001","position":0,"product":"prodservice0001","quantity":2.5}`,
		// A bundle item has no name: it is known by its id.
		label: "rec000000000001",
	},
	{
		name: "tax-agencies", collection: "books_tax_agencies", singular: "tax agency",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"all", "inactive", "limit", "page", "search"},
		input:     `{"name": "State Revenue", "account": "accttaxowed0001"}`,
		sent:      `{"account":"accttaxowed0001","name":"State Revenue"}`,
		label:     "State Revenue",
	},
	{
		name: "tax-rates", collection: "books_tax_rates", singular: "tax rate",
		commands:  "activate add deactivate delete edit list show",
		listFlags: []string{"agency", "all", "inactive", "limit", "page", "search", "type"},
		input:     `{"type": "group", "name": "City and state", "components": ["taxratestate001", "taxratecity0001"], "is_default": true}`,
		sent:      `{"components":["taxratestate001","taxratecity0001"],"is_default":true,"name":"City and state","type":"group"}`,
		label:     "City and state",
	},
}

func TestEveryResourceHasACase(t *testing.T) {
	have := []string{"accounts"}
	for _, tc := range resourceCases {
		have = append(have, tc.name)
	}
	want := []string{}
	for i := range resources {
		want = append(want, resources[i].Name)
	}
	if !slices.Equal(have, want) {
		t.Errorf("resources.json has %v; the cases cover %v", want, have)
	}
}

func TestResourceCommands(t *testing.T) {
	root := newTestRoot(nil)
	for _, tc := range resourceCases {
		group, _, err := root.Find([]string{"books", tc.name})
		if err != nil {
			t.Errorf("%s: %v", tc.name, err)
			continue
		}
		if got := strings.Join(subcommandNames(group), " "); got != tc.commands {
			t.Errorf("%s commands = %q, want %q", tc.name, got, tc.commands)
		}
		list, _, _ := root.Find([]string{"books", tc.name, "list"})
		flags := []string{}
		for _, spec := range flagSpecs(list.LocalFlags()) {
			flags = append(flags, strings.TrimPrefix(spec.Name, "--"))
		}
		slices.Sort(flags)
		if !slices.Equal(flags, tc.listFlags) {
			t.Errorf("%s list flags = %v, want %v", tc.name, flags, tc.listFlags)
		}
	}
}

// add sends the input as given, to the resource's own collection, and the
// record that comes back can be shown, listed, edited and deleted.
func TestResourceLifeCycle(t *testing.T) {
	for _, tc := range resourceCases {
		f := newFakeBooks(t)
		f.rows[tc.collection] = []rawRecord{}
		c := f.serve()
		const id = "rec000000000001"

		out, errOut, err := runCmd(t, c, tc.input, "books", tc.name, "add", "--input", "-", "--json")
		if err != nil {
			t.Errorf("%s add: %v", tc.name, err)
			continue
		}
		if sent, _ := json.Marshal(f.lastCreate); string(sent) != tc.sent {
			t.Errorf("%s add sent\n%s\nwant\n%s", tc.name, sent, tc.sent)
		}
		if want := "added " + tc.singular + " " + tc.label; !strings.Contains(errOut, want) {
			t.Errorf("%s add: stderr %q has no %q", tc.name, errOut, want)
		}
		added := decodeRecord(t, out)
		res := findResource(tc.name)
		if got, want := len(added), len(recordKeys(res)); got != want {
			t.Errorf("%s: the printed record has %d keys, the schema %d: %v", tc.name, got, want, added)
		}

		out, _, err = runCmd(t, c, "", "books", tc.name, "show", id, "--json")
		if err != nil || decodeRecord(t, out)["id"] != id {
			t.Errorf("%s show: %v\n%s", tc.name, err, out)
		}

		var listed listOut
		out, _, err = runCmd(t, c, "", "books", tc.name, "list", "--json")
		if err != nil {
			t.Errorf("%s list: %v", tc.name, err)
			continue
		}
		if jsonErr := json.Unmarshal([]byte(out), &listed); jsonErr != nil || listed.Total != 1 || len(listed.Items) != 1 {
			t.Errorf("%s list: %v\n%s", tc.name, jsonErr, out)
		}
		if f.lastQuery.Get("sort") != res.Sort {
			t.Errorf("%s list sort = %q, want %q", tc.name, f.lastQuery.Get("sort"), res.Sort)
		}
		if _, _, err = runCmd(t, c, "", "books", tc.name, "list"); err != nil {
			t.Errorf("%s list as a table: %v", tc.name, err)
		}

		if res.hasInactive() {
			if _, _, err = runCmd(t, c, "", "books", tc.name, "deactivate", id); err != nil {
				t.Errorf("%s deactivate: %v", tc.name, err)
			}
			if f.find(tc.collection, id)["inactive"] != true {
				t.Errorf("%s: deactivate did not set inactive", tc.name)
			}
			out, _, _ = runCmd(t, c, "", "books", tc.name, "list", "--json")
			if !strings.Contains(out, `"total": 0`) {
				t.Errorf("%s: an inactive record is in the default list:\n%s", tc.name, out)
			}
		}

		if _, _, err = runCmd(t, c, "", "books", tc.name, "delete", id, "--yes"); err != nil {
			t.Errorf("%s delete: %v", tc.name, err)
		}
		if len(f.rows[tc.collection]) != 0 {
			t.Errorf("%s: the record was not deleted", tc.name)
		}
	}
}

func TestBundleItemsHaveNoInactive(t *testing.T) {
	_, _, err := runCmd(t, nil, "", "books", "bundle-items", "deactivate", "x")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("exit = %d, want 2; err: %v", got, err)
	}
}

// Money and rates are whole numbers in the smallest unit. A fraction is a
// mistake the CLI catches, with the field's help in the message.
func TestMoneyFieldsRefuseAFraction(t *testing.T) {
	for _, tc := range []struct {
		resource, input, want string
	}{
		{"products", `{"type":"service","name":"A","price":12.5}`, `"price" must be a whole number, without a fraction`},
		{"products", `{"type":"service","name":"A","cost":"3"}`, `"cost" must be a whole number`},
		{"tax-rates", `{"type":"rate","name":"A","rate_ppm":8.875}`, `"rate_ppm" must be a whole number, without a fraction`},
		{"tax-rates", `{"type":"rate","name":"A","components":"taxratestate001"}`, `"components" must be an array of ids`},
		{"customers", `{"display_name":"A","billing_address":"1 Main St"}`, `"billing_address" must be an object`},
		{"customers", `{"display_name":"A","billing_address":{"line1":"1 Main St"}}`, `"billing_address" has no "line2": an address names every key`},
		{"customers", `{"display_name":"A","terms":"net_45"}`, `"terms" must be one of: due_on_receipt, net_10, net_15, net_30, net_60`},
		{"vendors", `{"display_name":"A","tax_id_type":"itin"}`, `"tax_id_type" must be one of: ein, ssn`},
		{"bundle-items", `{"bundle":"prodbundle00001"}`, `"product" is required`},
	} {
		f := newFakeBooks(t)
		_, _, err := runCmd(t, f.serve(), tc.input, "books", tc.resource, "add", "--input", "-")
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%s %s: exit = %d, want 2; err: %v", tc.resource, tc.input, got, err)
			continue
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: error %q does not contain %q", tc.resource, err.Error(), tc.want)
		}
		if len(f.requests) != 0 {
			t.Errorf("%s: a request was sent: %v", tc.resource, f.requests)
		}
	}
}

// The input schema of a real resource says what the server takes: an address
// with every key or null, and null for a field that `edit` can clear.
func TestInputSchemaOfACustomer(t *testing.T) {
	raw, err := json.Marshal(inputSchema(findResource("customers"), true))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Required   []string `json:"required"`
		Properties map[string]struct {
			Type                 any      `json:"type"`
			Required             []string `json:"required"`
			AdditionalProperties *bool    `json:"additionalProperties"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(schema.Required, []string{"display_name"}) {
		t.Errorf("required = %v", schema.Required)
	}
	address := schema.Properties["billing_address"]
	if !slices.Equal(address.Required, []string{"line1", "line2", "city", "region", "postal_code", "country"}) {
		t.Errorf("billing_address requires %v, want all six keys", address.Required)
	}
	if address.AdditionalProperties == nil || *address.AdditionalProperties {
		t.Error("billing_address must refuse a key that is no address part")
	}
	if !holds(address.Type, "null") || !holds(schema.Properties["email"].Type, "null") {
		t.Errorf("a field that can be cleared must allow null: %v, %v", address.Type, schema.Properties["email"].Type)
	}
	if holds(schema.Properties["display_name"].Type, "null") {
		t.Error("a required field must not allow null")
	}
}

// A list filter flag is an exact match on its field, bound as a value.
func TestResourceFilterFlags(t *testing.T) {
	f := newFakeBooks(t)
	f.add("books_tax_rates", "taxratestate001", map[string]any{"name": "State", "type": "rate", "agency": "agencystate0001", "inactive": false})
	f.add("books_tax_rates", "taxratecity0001", map[string]any{"name": "City", "type": "rate", "agency": "agencycity00001", "inactive": false})
	f.add("books_tax_rates", "taxrategroup001", map[string]any{"name": "Both", "type": "group", "agency": "", "inactive": false})
	c := f.serve()
	for _, tc := range []struct {
		args   []string
		filter string
		total  int
	}{
		{[]string{"--type", "rate"}, `inactive = false && type = "rate"`, 2},
		{[]string{"--agency", "agencycity00001"}, `inactive = false && agency = "agencycity00001"`, 1},
		{[]string{"--type", "group", "--search", "bo"}, `inactive = false && type = "group" && (name ~ "bo")`, 1},
		{[]string{"--agency", ""}, `inactive = false && agency = ""`, 1},
	} {
		out, _, err := runCmd(t, c, "", append([]string{"books", "tax-rates", "list", "--json"}, tc.args...)...)
		if err != nil {
			t.Fatalf("%v: %v", tc.args, err)
		}
		if got := f.lastQuery.Get("filter"); got != tc.filter {
			t.Errorf("%v: filter = %q, want %q", tc.args, got, tc.filter)
		}
		var listed listOut
		if jsonErr := json.Unmarshal([]byte(out), &listed); jsonErr != nil || listed.Total != tc.total {
			t.Errorf("%v: total = %d, want %d (%v)", tc.args, listed.Total, tc.total, jsonErr)
		}
	}
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && go test .`
Expected: FAIL. The first lines (`root.Find` answers the `books` group for a word it does not know, so the "commands" of `customers` are those of `books`):

```
--- FAIL: TestEveryResourceHasACase (0.00s)
    resources_test.go:95: resources.json has [accounts]; the cases cover [accounts customers vendors products bundle-items tax-agencies tax-rates]
--- FAIL: TestResourceCommands (0.00s)
    resources_test.go:108: customers commands = "accounts schema", want "activate add deactivate delete edit list show"
```

- [ ] **Step 3: Write the seven definitions**

Replace `/Users/nas/tmp/tinycld/books-purchases/books/cli/resources.json` with the file below. Each field list is the collection as migrated (`pb-migrations/`), in the order the record prints the fields; Task 11 fails for a field that differs. Type the file as it is here: the help texts are what `schema` and the usage errors print.

```json
{
    "resources": [
        {
            "name": "accounts",
            "singular": "account",
            "summary": "The chart of accounts",
            "collection": "books_accounts",
            "sort": "full_name,id",
            "label": "name",
            "columns": ["number", "name", "type", "detail_type", "inactive"],
            "search": ["name", "number"],
            "filters": [
                { "flag": "type", "field": "type", "help": "only accounts of this account type" },
                { "flag": "parent", "field": "parent", "help": "only the sub-accounts of this account id" }
            ],
            "omit": [],
            "deleteHelp": "The server refuses to delete an account that journal lines, products, tax agencies, sales or sub-accounts use. Make it inactive with `deactivate`.",
            "fields": [
                { "name": "name", "type": "string", "required": true, "help": "account name, unique under its parent" },
                { "name": "number", "type": "string", "help": "account number (letters, digits, . and -), unique when set" },
                {
                    "name": "type",
                    "type": "string",
                    "required": true,
                    "enum": [
                        "bank",
                        "accounts_receivable",
                        "other_current_asset",
                        "fixed_asset",
                        "other_asset",
                        "accounts_payable",
                        "credit_card",
                        "other_current_liability",
                        "long_term_liability",
                        "equity",
                        "income",
                        "other_income",
                        "cost_of_goods_sold",
                        "expense",
                        "other_expense"
                    ],
                    "help": "account type; a sub-account has the type of its parent"
                },
                { "name": "detail_type", "type": "string", "required": true, "help": "a detail type of the account type: `tinycld books accounts types` lists them" },
                { "name": "description", "type": "string", "help": "what the account is for" },
                { "name": "parent", "type": "id", "ref": "accounts", "help": "the account this one is a sub-account of; empty for a top-level account" },
                { "name": "inactive", "type": "bool", "help": "an inactive account is hidden from pickers and keeps its history" },
                {
                    "name": "form_1099_box",
                    "type": "string",
                    "enum": ["nec_1", "misc_1", "misc_2", "misc_3", "misc_5", "misc_6", "misc_8", "misc_9", "misc_10", "misc_11"],
                    "help": "the 1099 box that payments from this account report to; expense-group types only"
                },
                { "name": "full_name", "type": "string", "readOnly": true, "help": "the path from the top-level account, parts joined by a colon" },
                { "name": "currency", "type": "string", "readOnly": true, "help": "the currency of the books, set by the server" }
            ]
        },
        {
            "name": "customers",
            "singular": "customer",
            "summary": "The people and companies the business sells to",
            "collection": "books_customers",
            "sort": "sort_key,id",
            "label": "display_name",
            "columns": ["display_name", "company", "email", "phone", "inactive"],
            "search": ["display_name", "company", "email"],
            "filters": [{ "flag": "parent", "field": "parent", "help": "only the sub-customers of this customer id" }],
            "omit": ["form", "fields", "sort_key"],
            "deleteHelp": "The server refuses to delete a customer that has sub-customers or transactions. Make it inactive with `deactivate`.",
            "fields": [
                { "name": "display_name", "type": "string", "required": true, "help": "the name shown in lists and on documents, unique among its siblings" },
                { "name": "company", "type": "string", "help": "company name" },
                { "name": "first_name", "type": "string", "help": "first name of the contact person" },
                { "name": "last_name", "type": "string", "help": "last name of the contact person" },
                { "name": "email", "type": "string", "help": "email address" },
                { "name": "phone", "type": "string", "help": "phone number" },
                { "name": "mobile", "type": "string", "help": "mobile phone number" },
                { "name": "website", "type": "string", "help": "website URL, with its scheme (https://…)" },
                { "name": "billing_address", "type": "address", "help": "billing address" },
                { "name": "shipping_address", "type": "address", "help": "shipping address; null means the billing address" },
                { "name": "notes", "type": "string", "help": "internal notes" },
                { "name": "inactive", "type": "bool", "help": "an inactive customer is hidden from pickers and keeps its history" },
                {
                    "name": "terms",
                    "type": "string",
                    "enum": ["due_on_receipt", "net_10", "net_15", "net_30", "net_60"],
                    "help": "default payment terms of a new invoice; empty for none"
                },
                { "name": "parent", "type": "id", "ref": "customers", "help": "the top-level customer this one is a sub-customer of; empty for a top-level customer" },
                { "name": "tax_exempt", "type": "bool", "help": "sales to this customer are not taxed" },
                {
                    "name": "exemption_reason",
                    "type": "string",
                    "enum": [
                        "resale",
                        "federal_government",
                        "state_local_government",
                        "tribal_government",
                        "nonprofit",
                        "educational",
                        "agricultural",
                        "manufacturing",
                        "direct_pay",
                        "other"
                    ],
                    "help": "why the customer is exempt from sales tax"
                },
                { "name": "exemption_number", "type": "string", "help": "the number of the exemption certificate" },
                { "name": "default_tax_rate", "type": "id", "ref": "tax-rates", "help": "the tax rate or group a new sale to this customer starts with" }
            ]
        },
        {
            "name": "vendors",
            "singular": "vendor",
            "summary": "The people and companies the business buys from",
            "collection": "books_vendors",
            "sort": "sort_key,id",
            "label": "display_name",
            "columns": ["display_name", "company", "email", "phone", "inactive"],
            "search": ["display_name", "company", "email"],
            "filters": [],
            "omit": ["form", "fields", "sort_key"],
            "deleteHelp": "The server refuses to delete a vendor that has transactions. Make it inactive with `deactivate`.",
            "fields": [
                { "name": "display_name", "type": "string", "required": true, "help": "the name shown in lists and on documents, unique among vendors" },
                { "name": "company", "type": "string", "help": "company name" },
                { "name": "first_name", "type": "string", "help": "first name of the contact person" },
                { "name": "last_name", "type": "string", "help": "last name of the contact person" },
                { "name": "email", "type": "string", "help": "email address" },
                { "name": "phone", "type": "string", "help": "phone number" },
                { "name": "mobile", "type": "string", "help": "mobile phone number" },
                { "name": "website", "type": "string", "help": "website URL, with its scheme (https://…)" },
                { "name": "address", "type": "address", "help": "the vendor's address" },
                {
                    "name": "terms",
                    "type": "string",
                    "enum": ["due_on_receipt", "net_10", "net_15", "net_30", "net_60"],
                    "help": "default payment terms of a new bill; empty for none"
                },
                { "name": "account_number", "type": "string", "help": "the business's account number at this vendor" },
                { "name": "expense_account", "type": "id", "ref": "accounts", "help": "the account a new bill or expense line for this vendor starts with" },
                { "name": "notes", "type": "string", "help": "internal notes" },
                { "name": "track_1099", "type": "bool", "help": "payments to this vendor are reported on a 1099" },
                { "name": "legal_name", "type": "string", "help": "the name on the vendor's W-9" },
                { "name": "tax_id_type", "type": "string", "enum": ["ein", "ssn"], "help": "the kind of tax ID; empty for none" },
                { "name": "tax_id", "type": "string", "help": "the tax ID: nine digits, with or without dashes; stored as 12-3456789 (EIN) or 123-45-6789 (SSN)" },
                { "name": "inactive", "type": "bool", "help": "an inactive vendor is hidden from pickers and keeps its history" }
            ]
        },
        {
            "name": "products",
            "singular": "product",
            "summary": "Products and services: what the business sells and buys",
            "collection": "books_products",
            "sort": "sort_key,id",
            "label": "name",
            "columns": ["name", "type", "sku", "price", "inactive"],
            "search": ["name", "sku"],
            "filters": [{ "flag": "type", "field": "type", "help": "only products of this type: service, non_inventory or bundle" }],
            "omit": ["form", "fields", "sort_key"],
            "deleteHelp": "The server refuses to delete a product that a bundle or a transaction line uses. Make it inactive with `deactivate`.",
            "fields": [
                {
                    "name": "type",
                    "type": "string",
                    "required": true,
                    "enum": ["service", "non_inventory", "bundle"],
                    "help": "service, non_inventory or bundle; only a new product can be a bundle, and a bundle stays one"
                },
                { "name": "name", "type": "string", "required": true, "help": "the product name, unique among products" },
                { "name": "sku", "type": "string", "help": "stock keeping unit; may repeat" },
                { "name": "sales_description", "type": "string", "help": "the description a sales line starts with" },
                { "name": "price", "type": "integer", "help": "sales price in cents (1250 is 12.50); not for a bundle" },
                { "name": "income_account", "type": "id", "ref": "accounts", "help": "an active Income or Other income account; needed for a service or non_inventory product, not for a bundle" },
                { "name": "purchases", "type": "bool", "help": "the business also buys this product; then expense_account is needed" },
                { "name": "purchase_description", "type": "string", "help": "the description a purchase line starts with" },
                { "name": "cost", "type": "integer", "help": "purchase cost in cents; not for a bundle" },
                { "name": "expense_account", "type": "id", "ref": "accounts", "help": "the account a purchase of this product posts to; not Accounts receivable or Accounts payable" },
                { "name": "inactive", "type": "bool", "help": "an inactive product is hidden from pickers and keeps its history" },
                { "name": "taxable", "type": "bool", "help": "sales of this product are taxed" },
                { "name": "currency", "type": "string", "readOnly": true, "help": "the currency of the books, set by the server" }
            ]
        },
        {
            "name": "bundle-items",
            "singular": "bundle item",
            "summary": "The products inside a bundle",
            "collection": "books_bundle_items",
            "sort": "bundle,position,id",
            "label": "",
            "columns": ["bundle", "product", "quantity", "position"],
            "search": [],
            "filters": [
                { "flag": "bundle", "field": "bundle", "help": "only the items of this bundle (a product id)" },
                { "flag": "product", "field": "product", "help": "only the items that hold this product id" }
            ],
            "omit": [],
            "deleteHelp": "Deleting an item takes the product out of the bundle. Deleting the bundle deletes its items.",
            "fields": [
                { "name": "bundle", "type": "id", "ref": "products", "required": true, "help": "the bundle (a product of type bundle); it cannot change later" },
                { "name": "product", "type": "id", "ref": "products", "required": true, "help": "an active product that is not a bundle" },
                { "name": "quantity", "type": "number", "help": "how many of the product one bundle holds, from 0.01 to 1000000" },
                { "name": "position", "type": "integer", "help": "the item's place in the bundle, from 0" }
            ]
        },
        {
            "name": "tax-agencies",
            "singular": "tax agency",
            "summary": "The agencies the business pays sales tax to",
            "collection": "books_tax_agencies",
            "sort": "sort_key,id",
            "label": "name",
            "columns": ["name", "account", "inactive"],
            "search": ["name"],
            "filters": [],
            "omit": ["sort_key"],
            "deleteHelp": "The server refuses to delete an agency that has tax rates. Make it inactive with `deactivate`, after its rates.",
            "fields": [
                { "name": "name", "type": "string", "required": true, "help": "the agency name, unique among agencies" },
                { "name": "account", "type": "id", "ref": "accounts", "required": true, "help": "an active Other current liability account that holds the tax owed to the agency" },
                { "name": "inactive", "type": "bool", "help": "an inactive agency is hidden from pickers" }
            ]
        },
        {
            "name": "tax-rates",
            "singular": "tax rate",
            "summary": "Sales tax rates, and the groups that charge several rates as one",
            "collection": "books_tax_rates",
            "sort": "sort_key,id",
            "label": "name",
            "columns": ["name", "type", "rate_ppm", "is_default", "inactive"],
            "search": ["name"],
            "filters": [
                { "flag": "type", "field": "type", "help": "only rates (rate) or only groups (group)" },
                { "flag": "agency", "field": "agency", "help": "only the rates of this tax agency id" }
            ],
            "omit": ["sort_key"],
            "deleteHelp": "The server refuses to delete the default rate, a rate that an active group holds, and a rate that a sale used. Make it inactive with `deactivate`.",
            "fields": [
                { "name": "type", "type": "string", "required": true, "enum": ["rate", "group"], "help": "rate or group; it cannot change later" },
                { "name": "name", "type": "string", "required": true, "help": "the name, unique among rates and groups" },
                { "name": "rate_ppm", "type": "integer", "help": "the rate in parts per million of the taxable amount: 1% is 10000, 8.875% is 88750; 0 for a group" },
                { "name": "agency", "type": "id", "ref": "tax-agencies", "help": "the active agency a rate is paid to; empty for a group" },
                { "name": "components", "type": "ids", "ref": "tax-rates", "help": "for a group: its two to ten rates, none of them a group; empty for a rate" },
                { "name": "is_default", "type": "bool", "help": "the rate or group a new sale starts with; setting it clears the earlier default" },
                { "name": "inactive", "type": "bool", "help": "an inactive rate or group is hidden from pickers" }
            ]
        }
    ]
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && gofmt -l . && go vet ./... && go test .`
Expected: no `gofmt` output, no `vet` output, `ok  	tinycld.org/packages/books/cli`.

If the program panics at start with a `resources.json` message, `loadResources` found a mistake in the file (a `columns`, `search`, `filters` or `label` name that is no field, a `ref` that is no resource): the message names the entry.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-purchases/books
git add cli/resources.json cli/resources_test.go
git commit -m "feat(cli): customers, vendors, products, bundle items and sales tax lists"
```

---

### Task 11: Server tests for the CLI contract

The CLI's own tests run against a fake that has no schema, no rule and no scope table. This task adds the other half, in the Books server module's tests, where the real collections and the real PocketBase API are: seven tests that read the CLI's files from disk and send the CLI's requests. It adds no production code. With Tasks 4-10 done as written, every test passes at the first run (measured 2026-11-23: 2.5 seconds); Step 3 proves that the tests can fail.

**Files (all under `/Users/nas/tmp/tinycld/books-purchases/books`):**
- Test: `server/cli_resources_test.go` (package `books`)

**Interfaces:**
- Consumes (the server's test helpers and code; read each definition before use):
  - `server/env_test.go`: `newBooksApp(t testing.TB) *tests.TestApp`; `newLevelUsers(t testing.TB, app core.App) levelUsers` (fields `none`, `readOnly`, `bookkeeper`, `admin`, each `*core.Record`); `tokenFor(t testing.TB, u *core.Record) string`; `type apiReq struct { method, url, token, body string; want int; content []string; … }`; `apiSeq(t *testing.T, app *tests.TestApp, calls ...apiReq)` (runs the calls in order through one mux; stops at the first wrong status or missing text).
  - `server/settings_test.go`: `newGuardedApp(t *testing.T) *tests.TestApp` (the app with the Books guards registered).
  - `server/oauth_scopes.go`: `oauthPackage() oauth.Package` (`.Collections[name]` has `Read` and `Write`, each `[]string`), `scopeRead`, `scopeWrite`.
  - Files: `cli/resources.json` (Task 10), `cli/account_types.json` (Task 6), `server/account_types.json`.
- Produces: `TestCLIResources_MatchTheCollections`, `TestCLIResources_OAuthAllowsEveryCollection`, `TestCLIResources_AccountTypesAreTheServers`, `TestCLIResources_ServerAcceptsEveryListQuery`, `TestCLIResources_RefusalShapes`, `TestCLIResources_AccountRoundTrip`, `TestCLIResources_EveryResourceRoundTrip`. `docs/cli-conventions.md` (Task 12) names this file as the guard of `cli/resources.json`.

Measured against the real PocketBase API (2026-11-23), and asserted by the tests:

- A create with no `name`: 400 `{"data":{"name":{"code":"validation_required","message":"Cannot be blank."}},"message":"Failed to create record.","status":400}`.
- A Books guard runs before the schema check and answers with a sentence and no field: `{"data":{},"message":"Rent_lease is not a detail type of Bank accounts.","status":400}` (PocketBase makes the first letter a capital).
- A create by a read-only user: 400 `Failed to create record.` with no field. An update by a read-only user: 404.
- `PATCH` with `null` stores `""` for a text field and `null` for an address. `DELETE` answers 204. A missing record: 404 `The requested resource wasn't found.`.
- An address with fewer than its six keys: 400 `An address has only street, street line 2, city, state or region, postal code and country, each at most 200 characters.` This is why every address in the test has all six.
- A filter on a field the collection does not have: 400 `Something went wrong while processing your request.`

- [ ] **Step 1: Write the tests**

Create `/Users/nas/tmp/tinycld/books-purchases/books/server/cli_resources_test.go`:

```go
package books

import (
	"bytes"
	"encoding/json"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The Books CLI (cli/) is a separate Go module that only speaks HTTP. Its
// tests run against a fake server, which has no schema, no rule and no scope
// table. These tests are the other half: they read the CLI's own definitions
// (cli/resources.json) and hold them to the migrated collections, the OAuth
// registration and the real PocketBase API, so a renamed column, a new column the CLI
// does not know, or a collection a token cannot reach fails here.

type cliField struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	ReadOnly bool     `json:"readOnly"`
	Enum     []string `json:"enum"`
	Ref      string   `json:"ref"`
}

type cliResource struct {
	Name       string   `json:"name"`
	Collection string   `json:"collection"`
	Sort       string   `json:"sort"`
	Search     []string `json:"search"`
	Omit       []string `json:"omit"`
	Filters    []struct {
		Field string `json:"field"`
	} `json:"filters"`
	Fields []cliField `json:"fields"`
}

func (r cliResource) field(name string) *cliField {
	for i := range r.Fields {
		if r.Fields[i].Name == name {
			return &r.Fields[i]
		}
	}
	return nil
}

func loadCLIResources(t testing.TB) []cliResource {
	t.Helper()
	data, err := os.ReadFile("../cli/resources.json")
	if err != nil {
		t.Fatalf("read the CLI's resource definitions: %v", err)
	}
	var file struct {
		Resources []cliResource `json:"resources"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("cli/resources.json: %v", err)
	}
	if len(file.Resources) == 0 {
		t.Fatal("cli/resources.json has no resources")
	}
	return file.Resources
}

// cliTypeOf is the resources.json type a collection field must be declared
// as, with the field's required flag and select values.
func cliTypeOf(f core.Field) (cliType string, required bool, values []string) {
	switch field := f.(type) {
	case *core.TextField:
		return "string", field.Required, nil
	case *core.EmailField:
		return "string", field.Required, nil
	case *core.URLField:
		return "string", field.Required, nil
	case *core.SelectField:
		if field.MaxSelect > 1 {
			return "unsupported multi-select", field.Required, nil
		}
		return "string", field.Required, field.Values
	case *core.BoolField:
		return "bool", field.Required, nil
	case *core.NumberField:
		if field.OnlyInt {
			return "integer", field.Required, nil
		}
		return "number", field.Required, nil
	case *core.RelationField:
		if field.MaxSelect > 1 {
			return "ids", field.Required, nil
		}
		return "id", field.Required, nil
	case *core.JSONField:
		return "address", field.Required, nil
	default:
		return "unsupported " + f.Type(), false, nil
	}
}

func TestCLIResources_MatchTheCollections(t *testing.T) {
	app := newBooksApp(t)
	resources := loadCLIResources(t)
	collectionOf := map[string]string{}
	for _, res := range resources {
		collectionOf[res.Name] = res.Collection
	}
	for _, res := range resources {
		col, err := app.FindCollectionByNameOrId(res.Collection)
		if err != nil {
			t.Errorf("%s: collection %s: %v", res.Name, res.Collection, err)
			continue
		}
		for _, declared := range res.Fields {
			f := col.Fields.GetByName(declared.Name)
			if f == nil {
				t.Errorf("%s: the CLI declares %q, and %s has no such field", res.Name, declared.Name, res.Collection)
				continue
			}
			if f.GetHidden() {
				t.Errorf("%s.%s is hidden: the API never sends it, so the CLI must not declare it", res.Name, declared.Name)
			}
			wantType, required, values := cliTypeOf(f)
			if declared.Type != wantType {
				t.Errorf("%s.%s: the CLI says %q, the collection field is %q (%s)", res.Name, declared.Name, declared.Type, wantType, f.Type())
			}
			// A read-only field is set by the server, so the caller is never
			// asked for it, whatever the schema requires.
			if !declared.ReadOnly && declared.Required != required {
				t.Errorf("%s.%s: the CLI says required = %v, the collection says %v", res.Name, declared.Name, declared.Required, required)
			}
			if !slices.Equal(declared.Enum, values) {
				t.Errorf("%s.%s: the CLI's values %v are not the select's %v", res.Name, declared.Name, declared.Enum, values)
			}
			if rel, ok := f.(*core.RelationField); ok {
				target, err := app.FindCollectionByNameOrId(rel.CollectionId)
				if err != nil {
					t.Fatalf("%s.%s: %v", res.Name, declared.Name, err)
				}
				if collectionOf[declared.Ref] != target.Name {
					t.Errorf("%s.%s: ref %q is %s, the relation points to %s", res.Name, declared.Name, declared.Ref, collectionOf[declared.Ref], target.Name)
				}
			}
		}
		// Every column a caller can see is declared or left out on purpose.
		for _, f := range col.Fields {
			name := f.GetName()
			if f.GetHidden() || name == "id" || name == "created" || name == "updated" {
				continue
			}
			if res.field(name) == nil && !slices.Contains(res.Omit, name) {
				t.Errorf("%s has the field %q, which cli/resources.json neither declares for %q nor lists in its omit", res.Collection, name, res.Name)
			}
		}
		for _, name := range res.Omit {
			if col.Fields.GetByName(name) == nil {
				t.Errorf("%s: omit names %q, and %s has no such field", res.Name, name, res.Collection)
			}
		}
	}
}

// A token reaches a collection only when the OAuth registration names it. The
// CLI reads and writes each of its collections, so each needs both scopes.
func TestCLIResources_OAuthAllowsEveryCollection(t *testing.T) {
	collections := oauthPackage().Collections
	for _, res := range loadCLIResources(t) {
		access, ok := collections[res.Collection]
		if !ok {
			t.Errorf("%s: %s has no OAuth entry, so every CLI call on it would be refused", res.Name, res.Collection)
			continue
		}
		if !slices.Equal(access.Read, []string{scopeRead}) || !slices.Equal(access.Write, []string{scopeWrite}) {
			t.Errorf("%s: OAuth access of %s = %+v, want Read %s and Write %s", res.Name, res.Collection, access, scopeRead, scopeWrite)
		}
	}
}

// cli/account_types.json is the copy `tinycld books accounts types` prints.
func TestCLIResources_AccountTypesAreTheServers(t *testing.T) {
	server, err := os.ReadFile("account_types.json")
	if err != nil {
		t.Fatal(err)
	}
	cli, err := os.ReadFile("../cli/account_types.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(server, cli) {
		t.Error("cli/account_types.json differs from server/account_types.json: copy the server file over it")
	}
}

// listQuery is the query string `list` sends with every filter flag and
// --search given, as cli/list.go builds it.
func (r cliResource) listQuery() string {
	clauses := []string{}
	if r.field("inactive") != nil {
		clauses = append(clauses, "inactive = false")
	}
	for _, flt := range r.Filters {
		clauses = append(clauses, flt.Field+` = "nothinghasthis1"`)
	}
	if len(r.Search) > 0 {
		alternatives := []string{}
		for _, name := range r.Search {
			alternatives = append(alternatives, name+` ~ "x\" || id != \""`)
		}
		clauses = append(clauses, "("+strings.Join(alternatives, " || ")+")")
	}
	q := url.Values{}
	q.Set("filter", strings.Join(clauses, " && "))
	q.Set("sort", r.Sort)
	q.Set("page", "1")
	q.Set("perPage", "200")
	return q.Encode()
}

// The server accepts the filter and sort of every `list`, for a bookkeeper's
// token: each field named is one the caller may filter and sort on, and the
// server parses the quoting of client.Filter. That a quote stays text is
// proved on a record, in TestCLIResources_AccountRoundTrip.
func TestCLIResources_ServerAcceptsEveryListQuery(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	token := tokenFor(t, users.bookkeeper)
	calls := []apiReq{}
	for _, res := range loadCLIResources(t) {
		calls = append(calls, apiReq{
			method: "GET", url: "/api/collections/" + res.Collection + "/records?" + res.listQuery(),
			token: token, want: 200, content: []string{`"items":[]`, `"totalItems":0`},
		})
	}
	apiSeq(t, app, calls...)
}

// The shapes cli/errors.go reads, from the real PocketBase API: a schema refusal
// names its fields under data, a guard refusal has only a message, a missing
// record is 404. cli/errors_test.go uses these bodies.
func TestCLIResources_RefusalShapes(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	reader := tokenFor(t, users.readOnly)
	const accounts = "/api/collections/books_accounts/records"
	apiSeq(t, app,
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"type":"bank","detail_type":"cash_on_hand"}`,
			content: []string{`"message":"Failed to create record."`, `"name":{"code":"validation_required","message":"Cannot be blank."}`, `"status":400`}},
		// A Go guard runs before the schema check and answers with a sentence
		// and no field: here for a detail type, which the CLI cannot check.
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"rent_lease"}`,
			content: []string{`"data":{}`, `"message":"Rent_lease is not a detail type of Bank accounts."`}},
		// A field the server sets is refused by the create rule: the reason
		// cli/resources.json marks it readOnly and the CLI refuses it first.
		apiReq{method: "POST", url: accounts, token: writer, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand","full_name":"X"}`,
			content: []string{`"message":"Failed to create record."`, `"data":{}`}},
		// A caller with read access only: PocketBase answers a failed create
		// rule as a refusal (400), not as 403.
		apiReq{method: "POST", url: accounts, token: reader, want: 400,
			body:    `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand"}`,
			content: []string{`"message":"Failed to create record."`}},
		apiReq{method: "GET", url: accounts + "/nosuchaccount01", token: writer, want: 404,
			content: []string{`"message":"The requested resource wasn't found."`, `"status":404`}},
	)
}

// One account through the calls the CLI makes: add, edit with a null, a list
// that finds it, deactivate, delete. It pins what the server does with the
// bodies cli/write.go sends.
func TestCLIResources_AccountRoundTrip(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	reader := tokenFor(t, users.readOnly)
	const accounts = "/api/collections/books_accounts/records"
	const one = accounts + "/cliaccount00001"
	find := url.Values{}
	find.Set("filter", `inactive = false && type = "bank" && (name ~ "petty" || number ~ "petty")`)
	find.Set("sort", "full_name,id")
	find.Set("page", "1")
	find.Set("perPage", "200")
	// What `list --search 'x" || id != "'` sends. If the quote ended the text,
	// `id != ""` would match the account; as text, no name has it.
	quote := url.Values{}
	quote.Set("filter", `inactive = false && (name ~ "x\" || id != \"" || number ~ "x\" || id != \"")`)
	quote.Set("sort", "full_name,id")
	quote.Set("page", "1")
	quote.Set("perPage", "200")
	apiSeq(t, app,
		// The test names the id so the later calls can use it. The CLI does not.
		apiReq{method: "POST", url: accounts, token: writer, want: 200,
			body:    `{"id":"cliaccount00001","name":"Petty Cash","number":"1020","type":"bank","detail_type":"cash_on_hand","description":"Till"}`,
			content: []string{`"full_name":"Petty Cash"`, `"currency":"USD"`, `"inactive":false`, `"parent":""`}},
		apiReq{method: "GET", url: accounts + "?" + find.Encode(), token: reader, want: 200,
			content: []string{`"totalItems":1`, `"id":"cliaccount00001"`}},
		apiReq{method: "GET", url: accounts + "?" + quote.Encode(), token: reader, want: 200,
			content: []string{`"totalItems":0`, `"items":[]`}},
		// null clears a text field to "".
		apiReq{method: "PATCH", url: one, token: writer, want: 200,
			body:    `{"description":null,"number":null,"name":"Till"}`,
			content: []string{`"description":""`, `"number":""`, `"name":"Till"`, `"full_name":"Till"`}},
		// A caller with read access only cannot change it: the update rule
		// hides the record, so the answer is 404.
		apiReq{method: "PATCH", url: one, token: reader, want: 404, body: `{"inactive":true}`},
		apiReq{method: "PATCH", url: one, token: writer, want: 200,
			body: `{"inactive":true}`, content: []string{`"inactive":true`}},
		apiReq{method: "DELETE", url: one, token: writer, want: 204},
		apiReq{method: "GET", url: one, token: writer, want: 404},
	)
}

// One record of each other resource, with the bodies that the cases of
// cli/resources_test.go send: an address object, a null address, cents, a
// rate in parts per million, a list of ids. The fake of the CLI tests stores
// anything; this is the proof that the server takes these shapes. The ids are
// named so a later call can use them. The CLI does not name an id.
func TestCLIResources_EveryResourceRoundTrip(t *testing.T) {
	app := newGuardedApp(t)
	users := newLevelUsers(t, app)
	writer := tokenFor(t, users.bookkeeper)
	records := func(collection string) string { return "/api/collections/" + collection + "/records" }
	add := func(collection, body string, content ...string) apiReq {
		return apiReq{method: "POST", url: records(collection), token: writer, want: 200, body: body, content: content}
	}
	apiSeq(t, app,
		add("books_accounts", `{"id":"cliincome000001","name":"CLI Services","type":"income","detail_type":"service_income"}`),
		add("books_accounts", `{"id":"clisupplies0001","name":"CLI Supplies","type":"expense","detail_type":"advertising_marketing"}`),
		add("books_accounts", `{"id":"clitaxowed00001","name":"CLI Tax Owed","type":"other_current_liability","detail_type":"sales_tax_payable"}`),
		add("books_customers", `{"id":"clicustomer0001","display_name":"Acme Corp","email":"ap@acme.example","terms":"net_30",`+
			`"billing_address":{"line1":"1 Main St","line2":"","city":"Springfield","region":"IL","postal_code":"62701","country":"US"},`+
			`"shipping_address":null,"tax_exempt":true,"exemption_reason":"resale","exemption_number":"R-1"}`,
			`"display_name":"Acme Corp"`, `"line1":"1 Main St"`, `"shipping_address":null`, `"tax_exempt":true`, `"parent":""`),
		// null clears an address, as it clears a text field.
		apiReq{method: "PATCH", url: records("books_customers") + "/clicustomer0001", token: writer, want: 200,
			body: `{"billing_address":null,"terms":null}`, content: []string{`"billing_address":null`, `"terms":""`}},
		add("books_vendors", `{"id":"clivendor000001","display_name":"Paper Supply",`+
			`"address":{"line1":"9 Mill Rd","line2":"","city":"","region":"","postal_code":"","country":""},`+
			`"expense_account":"clisupplies0001","track_1099":true,"legal_name":"Paper Supply LLC","tax_id_type":"ein","tax_id":"12-3456789"}`,
			`"expense_account":"clisupplies0001"`, `"tax_id":"12-3456789"`),
		add("books_products", `{"id":"cliservice00001","type":"service","name":"Consulting hour","sku":"CONS-1","price":15000,`+
			`"income_account":"cliincome000001","taxable":false}`,
			`"price":15000`, `"currency":"USD"`, `"income_account":"cliincome000001"`),
		add("books_products", `{"id":"clibundle000001","type":"bundle","name":"Starter pack"}`, `"type":"bundle"`),
		add("books_bundle_items", `{"id":"clibundleitem01","bundle":"clibundle000001","product":"cliservice00001","quantity":2.5,"position":0}`,
			`"quantity":2.5`, `"position":0`),
		add("books_tax_agencies", `{"id":"cliagency000001","name":"State Revenue","account":"clitaxowed00001"}`, `"account":"clitaxowed00001"`),
		add("books_tax_rates", `{"id":"clirate00000001","type":"rate","name":"State","rate_ppm":62500,"agency":"cliagency000001"}`, `"rate_ppm":62500`),
		add("books_tax_rates", `{"id":"clirate00000002","type":"rate","name":"City","rate_ppm":26250,"agency":"cliagency000001"}`),
		add("books_tax_rates", `{"id":"cligroup0000001","type":"group","name":"City and state","components":["clirate00000001","clirate00000002"],"is_default":true}`,
			`"components":["clirate00000001","clirate00000002"]`, `"is_default":true`),
		// What `deactivate` and `delete` send, for a resource other than accounts.
		apiReq{method: "PATCH", url: records("books_vendors") + "/clivendor000001", token: writer, want: 200,
			body: `{"inactive":true}`, content: []string{`"inactive":true`}},
		apiReq{method: "DELETE", url: records("books_bundle_items") + "/clibundleitem01", token: writer, want: 204},
		apiReq{method: "DELETE", url: records("books_vendors") + "/clivendor000001", token: writer, want: 204},
	)
}
```

- [ ] **Step 2: Run the seven tests**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/server && gofmt -l cli_resources_test.go && go vet . && go test -count=1 -run CLIResources .`
Expected: no `gofmt` output, no `vet` output, `ok  	tinycld.org/packages/books` in about 3 seconds (the first run compiles the package first, which takes longer).

A test that fails here has found a difference between the CLI and the server. The server is right: correct `cli/resources.json` (a field, its type, `required`, `enum`, `ref`, `omit`, `search`, `sort`), then run `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && go test .` again, because `cli/resources_test.go` reads the same file. Do not change a migration, a rule, a guard or `server/oauth_scopes.go` to make a test pass. If the difference is in the server (for example a collection of this unit with no OAuth entry), stop and report it.

- [ ] **Step 3: Prove that the guard can fail**

In `/Users/nas/tmp/tinycld/books-purchases/books/cli/resources.json`, with the Edit tool, remove this line from the `accounts` entry:

```json
                { "name": "description", "type": "string", "help": "what the account is for" },
```

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/server && go test -count=1 -run CLIResources .`
Expected (measured 2026-11-23):

```
--- FAIL: TestCLIResources_MatchTheCollections
    cli_resources_test.go:155: books_accounts has the field "description", which cli/resources.json neither declares for "accounts" nor lists in its omit
```

Put the line back where it was, with the Edit tool (after the `detail_type` line, before the `parent` line).

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/server && go test -count=1 -run CLIResources . && cd /Users/nas/tmp/tinycld/books-purchases/books/cli && go test . && git -C /Users/nas/tmp/tinycld/books-purchases/books status --short cli/resources.json`
Expected: `ok` two times, and no line from `git status` (the file is as Task 10 committed it).

- [ ] **Step 4: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-purchases/books
git add server/cli_resources_test.go
git commit -m "test(cli): hold the CLI resource definitions to the collections and the API"
```

- [ ] **Step 5: Hand the full server suite back**

Do not run the full `books/server` suite: it takes about 6.5 minutes, and the driver runs it. Put this line in your report:

```
NEEDS-RUN: cd /Users/nas/tmp/tinycld/books-purchases/books/server && go test ./...
  needs: `ok` for every package (no count: Go prints no total). Prerequisites: `server/go.work` exists (the install writes it); `cli/resources.json` and `cli/account_types.json` exist (Tasks 6 and 10); no server and no seed is needed. This task adds one test file and no production code, so a failure outside `TestCLIResources_*` is not from this task: report it with its output.
```

---

### Task 12: Docs, conventions and the help topic

Three pages. `docs/cli.md` is the tour for a person. `docs/cli-conventions.md` is the contract: the rules a caller can rely on and the rules the author of a later command (transactions, purchase orders) follows. `help/command-line.md` is the in-app help topic `books:command-line`. A Go test holds the three to the code, so a command that a later unit adds and does not document fails the `Go CLI` step of CI.

**Files (all under `/Users/nas/tmp/tinycld/books-purchases/books`):**
- Create: `docs/cli.md`
- Create: `docs/cli-conventions.md`
- Create: `help/command-line.md`
- Modify: `README.md:90-91` (the "Docs" list)
- Test: `cli/docs_test.go`

**Interfaces:**
- Consumes: `newTestRoot(c *client.Client) *cobra.Command` (Task 2); `maxInputBytes` (Task 3, `1 << 20`); `defaultListLimit = 200`, `maxListLimit = 500` (Task 6); `var exitCodes []exitSpec` with `Code int` and `Name string` (Task 9); `exitcode.Usage`, `exitcode.Unavailable` (Task 1); the seven groups of Task 10. The manifest already has `help: { directory: 'help' }`.
- Produces: the pages; test helper `codeText(page string) string` (the code blocks and code spans of a page) with `TestCodeTextLeavesProseOut`; `TestDocsNameEveryCommand`, `TestDocsHaveEveryExitCode`, `TestConventionsMatchTheCode`, `TestHelpTopicFrontmatter`. Nothing later in this unit builds on them; the next CLI unit (`p8-cli-transactions`) follows `docs/cli-conventions.md`.

- [ ] **Step 1: Write the failing tests**

Create `/Users/nas/tmp/tinycld/books-purchases/books/cli/docs_test.go`:

````go
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
````

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && go test -count=1 -run 'TestDocs|TestConventions|TestHelpTopic' .`
Expected (measured 2026-11-23): four tests FAIL, each because its page does not exist:

```
--- FAIL: TestDocsNameEveryCommand (0.00s)
    docs_test.go:75: open ../docs/cli.md: no such file or directory
--- FAIL: TestDocsHaveEveryExitCode (0.00s)
    docs_test.go:94: open ../docs/cli.md: no such file or directory
--- FAIL: TestConventionsMatchTheCode (0.00s)
    docs_test.go:112: open ../docs/cli-conventions.md: no such file or directory
--- FAIL: TestHelpTopicFrontmatter (0.00s)
    docs_test.go:132: open ../help/command-line.md: no such file or directory
```

- [ ] **Step 3: Write the CLI page**

Create `/Users/nas/tmp/tinycld/books-purchases/books/docs/cli.md` with exactly this content (the outer fence is not part of the file):

````markdown
# Books from the command line

`tinycld books` is the Books part of the `tinycld` command line tool. It reads and changes the lists of the books: the chart of accounts, customers, vendors, products and services, and sales tax agencies, rates and groups.

The commands are made for programs and agents first. Every command prints JSON with `--json`, takes a record as JSON, and ends with an exit code that says what went wrong. [cli-conventions.md](cli-conventions.md) is the contract; this page is the tour.

## Sign in

```
tinycld auth login <host>
```

The sign-in is the tool's own (the device flow of the server). It asks for every scope the server offers; Books offers two:

| Scope | Allows |
|---|---|
| `books:read` | `list`, `show` |
| `books:write` | `add`, `edit`, `activate`, `deactivate`, `delete` |

A token acts as its user. The user's Books access level (Settings, Access) applies to a command as it does in the app: a user with read-only access can list and show, and no more.

## Commands

Each list is a command group with the same commands:

| Group | Records | Collection |
|---|---|---|
| `tinycld books accounts` | the chart of accounts | `books_accounts` |
| `tinycld books customers` | customers and sub-customers | `books_customers` |
| `tinycld books vendors` | vendors | `books_vendors` |
| `tinycld books products` | products, services and bundles | `books_products` |
| `tinycld books bundle-items` | the products inside a bundle | `books_bundle_items` |
| `tinycld books tax-agencies` | sales tax agencies | `books_tax_agencies` |
| `tinycld books tax-rates` | sales tax rates and groups | `books_tax_rates` |

| Command | Does |
|---|---|
| `list` | Lists the records, 200 to a page. Flags: `--limit`, `--page`, `--search`, `--inactive`, `--all`, and the filters of the group (`--type`, `--parent`, `--bundle`, `--product`, `--agency`). |
| `show <id>` | Prints one record. |
| `add --input <file>` | Adds the record in the JSON file. `--input -` reads standard input. |
| `edit <id> --input <file>` | Changes the fields the JSON names. Other fields keep their values. `null` clears a field. |
| `deactivate <id>` | Makes the record inactive: hidden from pickers, history kept. |
| `activate <id>` | Makes an inactive record active again. |
| `delete <id>` | Deletes the record. Asks first; `--yes` answers. The server refuses to delete a record that is in use: make it inactive. |

`bundle-items` has no `activate` and `deactivate`, and its `list` has no `--search`, `--inactive` or `--all`: a bundle item has no name, and it is in the bundle or it is not.

Two more commands:

- `tinycld books accounts types` lists the account types with their detail types. An account's `detail_type` must be one of its type's.
- `tinycld books schema` prints, as JSON, every command with its arguments, flags, the JSON Schema of its input and the JSON Schema of its `--json` output. `tinycld books schema accounts add` prints one command.

## Examples

List the bank accounts as JSON:

```
tinycld books accounts list --type bank --json
```

```json
{
    "items": [
        {
            "id": "k3j9x0a7b2c4d6e",
            "name": "Checking",
            "number": "1000",
            "type": "bank",
            "detail_type": "checking",
            "description": "",
            "parent": "",
            "inactive": false,
            "form_1099_box": "",
            "full_name": "Checking",
            "currency": "USD",
            "created": "2026-11-01 10:00:00.000Z",
            "updated": "2026-11-02 10:00:00.000Z"
        }
    ],
    "page": 1,
    "limit": 200,
    "total": 1
}
```

`total` counts the records that match on all pages. Ask for `--page 2` while `page × limit` is below it.

Add an account from standard input:

```
echo '{"name": "Petty Cash", "number": "1020", "type": "bank", "detail_type": "cash_on_hand"}' \
    | tinycld books accounts add --input - --json
```

Add a customer from a file:

```json
{
    "display_name": "Acme Corp",
    "email": "ap@acme.example",
    "terms": "net_30",
    "billing_address": { "line1": "1 Main St", "line2": "", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "US" }
}
```

An address names all six keys; a part with no value is `""`. `null` is no address.

```
tinycld books customers add --input acme.json
```

Add a product. Money is a whole number of cents: `15000` is 150.00.

```
echo '{"type": "service", "name": "Consulting hour", "price": 15000, "income_account": "<account id>"}' \
    | tinycld books products add --input -
```

Add a tax rate of 8.875%. A rate is in parts per million of the taxable amount:

```
echo '{"type": "rate", "name": "City", "rate_ppm": 88750, "agency": "<agency id>"}' \
    | tinycld books tax-rates add --input -
```

Change one field, and clear another:

```
echo '{"description": "Main account", "number": null}' \
    | tinycld books accounts edit k3j9x0a7b2c4d6e --input -
```

Make a vendor inactive, then delete a product with no question:

```
tinycld books vendors deactivate <id>
tinycld books products delete <id> --yes
```

## When a command fails

A failed command prints `Error: <message>` on standard error and ends with one of these exit codes. With `--json` it also prints one JSON document on standard output.

| Exit | Name | Meaning |
|---|---|---|
| 0 | `ok` | The command did what was asked. |
| 1 | `failed` | A failure of no other class. |
| 2 | `usage` | The call is wrong: a flag, an argument or the input. Nothing was sent. |
| 3 | `auth` | Not signed in, or the sign-in ended. Run `tinycld auth login <host>`. |
| 4 | `forbidden` | The token has no Books scope for the action. |
| 5 | `not_found` | No record has this id, or the user's access level does not allow the action on it. |
| 6 | `refused` | The server refused the data. The message says why. |
| 7 | `unavailable` | The server did not answer, or is busy. Try again later. |

```
$ echo '{"name": "Checking", "type": "bank", "detail_type": "checking", "number": "1000"}' \
    | tinycld books accounts add --input - --json
{
    "error": {
        "code": "refused",
        "exit": 6,
        "message": "Failed to create record.",
        "status": 400,
        "fields": {
            "number": {
                "code": "validation_not_unique",
                "message": "Value must be unique."
            }
        }
    }
}
Error: server error (HTTP 400): Failed to create record. (number: Value must be unique.)
```

The server's rules are the rules. The tool checks the shape of the input (field names, types, the values of a choice field) before it sends, so a spelling mistake costs no request. Every rule about the books themselves (an account type and its detail types, a group and its rates, what can be deleted) is the server's, and its message is passed on word for word.
````

- [ ] **Step 4: Write the conventions page**

Create `/Users/nas/tmp/tinycld/books-purchases/books/docs/cli-conventions.md` with exactly this content:

```markdown
# Books CLI conventions

The rules every `tinycld books` command follows. A unit that adds a command (transactions, purchase orders, an import) follows them; a caller (a script, an agent) can rely on them. `tinycld books schema` prints the same contract as JSON, and `cli/docs_test.go` holds this page to the code.

## For the caller

1. **`--json` on every command.** With `--json` (or `--output json`) standard output holds exactly one JSON document: the result, or `{"error": …}` when the command failed. Never two documents, never text before or after. Progress text ("added account …") goes to standard error, and `--quiet` removes it.
2. **A record is JSON in, JSON out.** A command that takes a record reads one JSON object from `--input <file>`, or from standard input with `--input -`. There is no flag for each field. The record a command prints has the same field names as the record it takes, and always every field: a field with no value is `""`, `false`, `0`, `[]` or `null`, never left out.
3. **`add` needs the required fields; `edit` changes only what is named.** A field that the `edit` input does not name keeps its value. `null` clears a field. A field the server sets (`id`, `created`, `updated`, and each field `schema` marks `readOnly`) is refused in an input.
4. **Money is a whole number of cents.** `1250` is 12.50. A tax rate is a whole number of parts per million: `88750` is 8.875%. A fraction is refused. Quantities are plain numbers.
5. **An id in a result is the id the other commands take.** A relation field holds the id of the other record (`parent`, `income_account`), or `""`; a multiple relation is an array of ids. An address is an object with all six keys (`line1`, `line2`, `city`, `region`, `postal_code`, `country`), each a string, or `null`.
6. **A list is a page.** `list` prints `{items, page, limit, total}`. `total` counts the records that match on all pages; the default `limit` is 200 and the largest 500. A list leaves inactive records out unless `--inactive` (only those) or `--all` is given.
7. **Exit codes are stable.**

    | Exit | Name | Meaning | Try again? |
    |---|---|---|---|
    | 0 | `ok` | The command did what was asked. | |
    | 1 | `failed` | A failure of no other class. | no |
    | 2 | `usage` | The call is wrong: a flag, an argument or the `--input` document. Nothing was sent. | after a correction |
    | 3 | `auth` | Not signed in, or the sign-in ended. | after `tinycld auth login <host>` |
    | 4 | `forbidden` | The token has no Books scope for the action. | no |
    | 5 | `not_found` | No record has this id, or the user's Books access level does not allow the action on it. | no |
    | 6 | `refused` | The server refused the data. `message` and `fields` say why. | after a change of the input |
    | 7 | `unavailable` | The server did not answer, or is busy. | yes, later |

8. **The error document.** `{"error": {"code", "exit", "message", "status", "fields"}}`. `code` is the name in the table and `exit` its number. `message` is the server's own sentence for a refusal. `status` is the HTTP status, when the server answered. `fields` has, for each field the server refused, its `code` and `message`. One case prints no JSON: a flag that cannot be parsed (`--limit abc`, an unknown flag) exits 2 with text only, because the output format is not yet known. A call for help (`--help`, or a group with no command word) prints help text and exits 0.
9. **A mistake is never a success.** An unknown command word (`tinycld books acounts list`) exits 2. A `delete` without `--yes` and without a terminal exits 2 and deletes nothing.
10. **`tinycld books schema` describes every command**: arguments, flags, the JSON Schema of the `--input` document and the JSON Schema of the `--json` result. It prints JSON in every output mode. An input schema allows `null` for a field that `edit` can clear.

The server can refuse what the tool accepted. The tool checks field names, types and choice values; the server checks everything else, and its answer is exit 6 with its message. One refusal has no helpful message: an `add` by a user whose Books access level does not allow it answers `Failed to create record.` with no field (PocketBase does not say which rule failed).

## For the author of a command

1. **A command is an HTTP client.** The module `cli/` imports `tinycld.org/cli/...` and cobra, never the Books server module. It calls the PocketBase record API and the Books routes that the app calls. Do not add a route for the CLI alone: the collection rules and the Go guards are the whole check, and a second path would need a second copy of them.
2. **Build every command with `newCommand`** (`cli/command.go`). It checks the argument count, resolves `--json`, passes each error through `report` (exit code, error document) and stores the schemas `books schema` prints. A command declares `Output`, and `Input` when it reads a record; `TestEveryCommandHasASchema` fails for a command that does not. A command with a variable argument count sets `schemaAnnotations` itself and calls `report`, as `schema` does.
3. **Build a group with `newGroup`**, so an unknown word under it is a usage error.
4. **Return plain errors.** Return the client's error as it is (wrap with `%w` to add the record: `fmt.Errorf("account %s: %w", id, err)`); `report` gives it its class through `exitcode.Classify`. Use `usagef` for a call that is wrong before anything is sent. Never call `os.Exit`, and never print an error yourself.
5. **Read a record with `bindInput` and `readInput`.** They refuse a document that is not one JSON object, that is over 1 MiB, or that names a field twice, and keep numbers as written. Do not add a flag for a field.
6. **Check the input in the tool only for shape.** Field names, types and choice values, from the same definition that `schema` prints. Leave each rule about the books to the server and pass its message on.
7. **A list resource is data.** A new list (one collection, plain fields) is an entry in `cli/resources.json`: no Go code. `server/cli_resources_test.go` fails when an entry and its collection differ, when a collection field is neither declared nor in `omit`, and when the OAuth registration (`server/oauth_scopes.go`) does not give the collection both scopes. A new collection that a command writes needs its OAuth entry first.
8. **A transaction command is code.** A document with lines (an invoice, a bill, a journal entry, a purchase order) does not fit `resources.json`. Write its command with `newCommand`, declare its input and output schemas by hand, keep rule 2 of the caller's list (the printed record has the field names of the input), and print lines as an array `lines` inside the document.
9. **Write to standard output only through `o.Write`** (table, JSON, CSV from one call) and progress text only through `o.Info` on standard error.
10. **Test each command twice.** In `cli/`, against `fakeBooks` (`cli/fakeserver_test.go`): what the command sends, what it prints, each exit code. In `server/`, against the real PocketBase API: that the server accepts what the command sends (`TestCLIResources_*`). The fake runs no rule, so the first test alone proves nothing about access. The server test cannot import the CLI module, so its request bodies and its filter text are copies of what the command sends: when a command changes what it sends, change the server test with it.
11. **Document it.** Add the command to [cli.md](cli.md) and to the help topic `help/command-line.md`. `cli/docs_test.go` fails for a group that the pages do not name.
```

- [ ] **Step 5: Write the help topic**

Create `/Users/nas/tmp/tinycld/books-purchases/books/help/command-line.md` with exactly this content. The file name is the topic id. `{{server-host}}` stays as written: the help viewer puts the reader's own host there. `order: 62` puts the topic after the Audit Log topic (61), the last one today.

````markdown
---
title: Books from the command line
summary: List and change accounts, customers, vendors, products and sales tax from a terminal or a script with the tinycld tool.
tags: [cli, command line, terminal, automation, scripts, agents, json]
order: 62
---

To work with your books from a terminal or a script, use the `tinycld` tool. Its `books` commands list, add, change and delete the lists of the books: accounts, customers, vendors, products and services, and sales tax.

## Before you start

Download the tool and sign in: see [Command line tool](help://core:command-line).

```
tinycld auth login {{server-host}}
```

A command can do what you can do in Books. If your access level is read-only, you can list and show, and no more.

## The lists

Each list has its own group of commands:

- `tinycld books accounts`: the [chart of accounts](help://books:chart-of-accounts)
- `tinycld books customers`: customers and sub-customers
- `tinycld books vendors`: vendors
- `tinycld books products`: products, services and bundles
- `tinycld books bundle-items`: the products inside a bundle
- `tinycld books tax-agencies`: the agencies you pay [sales tax](help://books:sales-tax) to
- `tinycld books tax-rates`: sales tax rates and groups

## To list and show records

```
tinycld books customers list
tinycld books customers list --search acme
tinycld books customers show <id>
```

A list shows active records, 200 to a page. Add `--inactive` for the inactive ones, `--all` for both, and `--page 2` for the next page. The last column is the record's id: the other commands take it.

## To add or change a record

Write the record as JSON, in a file or on standard input:

```
echo '{"display_name": "Acme Corp", "email": "ap@acme.example"}' | tinycld books customers add --input -
tinycld books customers edit <id> --input changes.json
```

`edit` changes only the fields that the JSON names. `null` clears a field. An amount of money is a whole number of cents: `1250` is 12.50.

To see the fields of a record, run `tinycld books schema customers add`. For an account, `tinycld books accounts types` lists the account types with their detail types.

## To make a record inactive, or delete it

```
tinycld books vendors deactivate <id>
tinycld books vendors activate <id>
tinycld books vendors delete <id>
```

An inactive record is hidden from pickers and keeps its history. `delete` asks first; `--yes` answers. Books refuses to delete a record that is in use (an account with transactions, a customer with invoices): make it inactive.

## For scripts and agents

- Add `--json` to any command: it prints one JSON document, the result or an error.
- The exit code says what went wrong: `2` the call is wrong, `3` sign in again, `4` the sign-in does not include Books, `5` no such record, `6` Books refused the data (the message says why), `7` the server did not answer.
- `tinycld books schema` prints every command with the JSON Schema of its input and output.
````

- [ ] **Step 6: Link the pages from the README**

In `/Users/nas/tmp/tinycld/books-purchases/books/README.md`, in the list under `## Docs`, after the line

```markdown
- [docs/adr/](docs/adr/): decisions and why we made them.
```

add:

```markdown
- [docs/cli.md](docs/cli.md): Books from the command line (`tinycld books`).
- [docs/cli-conventions.md](docs/cli-conventions.md): the rules every Books command follows, for scripts, agents and the authors of new commands.
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/nas/tmp/tinycld/books-purchases/books/cli && gofmt -l . && go vet ./... && go test -count=1 .`
Expected: no `gofmt` output, no `vet` output, `ok  	tinycld.org/packages/books/cli`.

When a docs test fails, the page and the code differ. Read the message: if the page is wrong (a typing mistake against this plan), correct the page. If the code has a group, a command or a limit that this plan's page does not name, stop and report it: an earlier task was not done as written.

- [ ] **Step 8: Generate, so the help topic is in the app**

No e2e run may be in progress in this lane while the generator runs.

Run: `cd /Users/nas/tmp/tinycld/books-purchases/tinycld && pnpm run packages:generate`
Expected: exit 0; the output has the line `Generated config for <n> feature package(s).`

Run: `command grep -c 'Books from the command line' /Users/nas/tmp/tinycld/books-purchases/tinycld/lib/generated/package-help.ts`
Expected: `1` (measured 2026-11-23). Print the count only: never print lines of a file under `lib/generated/`.

The generated files are ignored by git. Commit none of them.

- [ ] **Step 9: Commit**

```bash
cd /Users/nas/tmp/tinycld/books-purchases/books
git add docs/cli.md docs/cli-conventions.md help/command-line.md cli/docs_test.go README.md
git commit -m "docs(cli): the Books CLI page, its conventions and the help topic"
```

---

## After this part

The unit is complete: every `covers` item of `p8-cli-lists` has its tasks (the map is at the end of the outline file). Open for the driver:

- The `NEEDS-RUN` of Task 11 (the full `books/server` Go suite).
- The core PR of Task 1 (branch `books/p8-cli-lists` of the `tinycld` repo) merges before the Books PR.
- The project rule asks to offer the new help topic for the website docs. That is a question for the human, after the unit.
