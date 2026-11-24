package cli

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// runFunc is the body of a command. It gets the output options and the --yes
// answer already resolved, and returns a plain error: newCommand gives the
// error its exit code and prints the JSON error document.
type runFunc func(cmd *cobra.Command, args []string, o output.Options, yes bool) error

// argSpec names one positional argument.
type argSpec struct {
	Name string `json:"name"`
	Help string `json:"help"`
}

// commandDef is everything a command declares about itself. `books schema`
// prints it, so what an agent reads is what the command checks.
type commandDef struct {
	// Name is the command word. Use is built from it and Args.
	Name    string
	Short   string
	Long    string
	Aliases []string
	Args    []argSpec
	// Input is the JSON Schema of the --input document; nil when the command
	// reads none.
	Input map[string]any
	// Output is the JSON Schema of the document the command writes to stdout
	// with --json. Every command has one.
	Output map[string]any
}

// The annotations `books schema` reads back from the command tree.
const (
	annotationArgs   = "books.args"
	annotationInput  = "books.input"
	annotationOutput = "books.output"
)

// newCommand is the one constructor for a Books command that does work. It
// checks the argument count, resolves the output options, runs fn, and passes
// the result through report.
//
// Args is cobra.ArbitraryArgs on purpose: a cobra validator fails before RunE,
// so its error would get exit 1 and no JSON error document.
func newCommand(def commandDef, fn runFunc) *cobra.Command {
	if def.Output == nil {
		panic("books cli: command " + def.Name + " declares no output schema")
	}
	if def.Args == nil {
		def.Args = []argSpec{}
	}
	use := def.Name
	for _, a := range def.Args {
		use += " <" + a.Name + ">"
	}
	return &cobra.Command{
		Use:         use,
		Short:       def.Short,
		Long:        def.Long,
		Aliases:     def.Aliases,
		Args:        cobra.ArbitraryArgs,
		Annotations: schemaAnnotations(def.Args, def.Input, def.Output),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, yes, err := output.FromCommand(cmd)
			if err != nil {
				return exitcode.New(exitcode.Usage, err)
			}
			if len(args) != len(def.Args) {
				return report(cmd, o, usagef("%s", argCountMessage(cmd, def.Args, len(args))))
			}
			return report(cmd, o, fn(cmd, args, o, yes))
		},
	}
}

// newGroup is a command that only holds other commands. Without a RunE cobra
// prints the help and exits 0 for `books acounts list`, so a typing mistake
// would look like success to a script. The group refuses an unknown word with
// a usage error.
func newGroup(name, short string) *cobra.Command {
	return &cobra.Command{
		Use:   name,
		Short: short,
		Args:  cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return exitcode.New(exitcode.Usage, err)
			}
			return report(cmd, o, usagef("unknown command %q for %q; commands: %s",
				args[0], cmd.CommandPath(), strings.Join(subcommandNames(cmd), ", ")))
		},
	}
}

// schemaAnnotations stores what `books schema` prints for a command. A
// command that newCommand cannot build (one with a variable argument count)
// sets them itself.
func schemaAnnotations(args []argSpec, input, output map[string]any) map[string]string {
	return map[string]string{
		annotationArgs:   mustJSON(args),
		annotationInput:  mustJSON(input),
		annotationOutput: mustJSON(output),
	}
}

func subcommandNames(cmd *cobra.Command) []string {
	names := []string{}
	for _, sub := range cmd.Commands() {
		if !sub.Hidden {
			names = append(names, sub.Name())
		}
	}
	return names
}

func argCountMessage(cmd *cobra.Command, want []argSpec, got int) string {
	if len(want) == 0 {
		return fmt.Sprintf("%q takes no arguments, got %d", cmd.CommandPath(), got)
	}
	names := make([]string, len(want))
	for i, a := range want {
		names[i] = "<" + a.Name + ">"
	}
	return fmt.Sprintf("%q takes %s, got %d arguments", cmd.CommandPath(), strings.Join(names, " "), got)
}

func mustJSON(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		panic("books cli: " + err.Error())
	}
	return string(data)
}
