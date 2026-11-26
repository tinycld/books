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

// conventions is what holds for every Books command. `tinycld books schema`
// prints it, and cli/schema_test.go holds it to the code.
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
					break
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
