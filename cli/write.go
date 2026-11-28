package cli

import (
	"encoding/json"
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// inputSchema is the JSON Schema of the --input document of `add` (create)
// or `edit`. It is what checkInput enforces.
func inputSchema(res *resource, create bool) map[string]any {
	props := map[string]any{}
	required := []string{}
	for _, f := range res.writable() {
		if f.CreateOnly && !create {
			continue
		}
		prop := fieldSchema(f)
		if f.Required {
			required = append(required, f.Name)
		} else {
			allowNull(prop)
		}
		narrowToInput(f, prop)
		props[f.Name] = prop
	}
	schema := map[string]any{
		"type":                 "object",
		"properties":           props,
		"additionalProperties": false,
	}
	if create {
		schema["required"] = required
	} else {
		schema["minProperties"] = 1
	}
	return schema
}

// narrowToInput states in the schema what checkValue refuses and JSON Schema
// would accept: "" for a required string or id, and an integer written with a
// fraction or an exponent, or beyond 64 bits. The shared fieldSchema stays as it
// is, because show and list print values that were stored.
func narrowToInput(f *field, prop map[string]any) {
	switch f.Type {
	case typeString, typeID:
		if f.Required {
			prop["minLength"] = 1
		}
	case typeInteger:
		note := "a whole number written without a fraction or an exponent, within the 64-bit range"
		prop["description"] = strings.TrimSpace(f.Help + " (" + note + ")")
	}
}

// allowNull adds null to the schema of a field's value: in an input, null
// clears a field that is not required (checkValue).
func allowNull(schema map[string]any) {
	switch kind := schema["type"].(type) {
	case string:
		schema["type"] = []string{kind, "null"}
	case []string:
		if !slices.Contains(kind, "null") {
			schema["type"] = append(slices.Clone(kind), "null")
		}
	}
	if values, ok := schema["enum"].([]string); ok {
		withNull := make([]any, 0, len(values)+1)
		for _, value := range values {
			withNull = append(withNull, value)
		}
		schema["enum"] = append(withNull, nil)
	}
}

// checkInput refuses an --input document the server would refuse for its
// shape, before anything is sent, and names the mistake: an unknown field, a
// field the server sets, a value of the wrong JSON type, a value outside a
// select, a missing required field. Rules that need the data (a unique name, an
// active parent) stay with the server.
func checkInput(res *resource, body map[string]any, create bool) error {
	names := make([]string, 0, len(body))
	for name := range body {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		f := res.field(name)
		if f == nil {
			if slices.Contains(systemFields, name) {
				return usagef("%q is set by the server: leave it out of --input", name)
			}
			return usagef("%s has no field %q; fields: %s", res.Name, name, strings.Join(writableNames(res), ", "))
		}
		if f.ReadOnly {
			return usagef("%q is set by the server: leave it out of --input", name)
		}
		if f.CreateOnly && !create {
			return usagef("%q is taken by `add` only: `edit` does not change it", name)
		}
		if err := checkValue(f, body[name]); err != nil {
			return err
		}
	}
	if !create {
		if len(body) == 0 {
			return usagef("nothing to change: --input is an empty object")
		}
		return nil
	}
	for _, f := range res.writable() {
		if _, given := body[f.Name]; f.Required && !given {
			return usagef("%q is required", f.Name)
		}
	}
	return nil
}

func writableNames(res *resource) []string {
	names := []string{}
	for _, f := range res.writable() {
		names = append(names, f.Name)
	}
	return names
}

// checkValue checks one value against its field's type. null clears a field
// that is not required.
func checkValue(f *field, value any) error {
	if value == nil {
		if f.Required {
			return usagef("%q is required: it cannot be null", f.Name)
		}
		return nil
	}
	switch f.Type {
	case typeString, typeID:
		text, ok := value.(string)
		if !ok {
			return usagef("%q must be a string", f.Name)
		}
		if f.Required && text == "" {
			return usagef("%q is required: it cannot be empty", f.Name)
		}
		if len(f.Enum) > 0 && text != "" && !slices.Contains(f.Enum, text) {
			return usagef("%q must be one of: %s", f.Name, strings.Join(f.Enum, ", "))
		}
	case typeBool:
		if _, ok := value.(bool); !ok {
			return usagef("%q must be true or false", f.Name)
		}
	case typeInteger:
		number, ok := value.(json.Number)
		if !ok {
			return usagef("%q must be a whole number", f.Name)
		}
		if _, err := number.Int64(); err != nil {
			if strings.ContainsAny(number.String(), ".eE") {
				return usagef("%q must be a whole number, without a fraction or an exponent", f.Name)
			}
			return usagef("%q is too large: a whole number within the 64-bit range", f.Name)
		}
	case typeNumber:
		if _, ok := value.(json.Number); !ok {
			return usagef("%q must be a number", f.Name)
		}
	case typeIDs:
		list, ok := value.([]any)
		if !ok {
			return usagef("%q must be an array of ids", f.Name)
		}
		for _, item := range list {
			if _, ok := item.(string); !ok {
				return usagef("%q must be an array of ids: each one a string", f.Name)
			}
		}
	case typeAddress:
		parts, ok := value.(map[string]any)
		if !ok {
			return usagef("%q must be an object with the keys %s, or null", f.Name, strings.Join(addressKeys, ", "))
		}
		keys := make([]string, 0, len(parts))
		for key := range parts {
			keys = append(keys, key)
		}
		slices.Sort(keys)
		for _, key := range keys {
			part := parts[key]
			if !slices.Contains(addressKeys, key) {
				return usagef("%q has no key %q; keys: %s", f.Name, key, strings.Join(addressKeys, ", "))
			}
			if _, ok := part.(string); !ok {
				return usagef("%q: %q must be a string", f.Name, key)
			}
		}
		// The server takes an address only whole (server/address.go): a part
		// with no value is "". Its refusal does not name the missing key.
		for _, key := range addressKeys {
			if _, ok := parts[key]; !ok {
				return usagef("%q has no %q: an address names every key (%s); a part with no value is \"\"", f.Name, key, strings.Join(addressKeys, ", "))
			}
		}
	}
	return nil
}

func newAddCmd(c *client.Client, res *resource) *cobra.Command {
	var input string
	cmd := newCommand(commandDef{
		Name:  "add",
		Short: "Add one " + res.Singular + " from a JSON object",
		Long: "Add one " + res.Singular + ". --input names a JSON file that holds the record,\n" +
			"or - to read it from standard input.\n\n" +
			"`tinycld books schema " + res.Name + " add` prints the fields.",
		Aliases: []string{"new", "create"},
		Input:   inputSchema(res, true),
		Output:  recordSchema(res),
	}, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(res, body, true); err != nil {
			return err
		}
		raw, err := client.CreateRecord[rawRecord](cmd.Context(), c, res.Collection, body)
		if err != nil {
			return err
		}
		rec := project(res, raw)
		o.Info(cmd.ErrOrStderr(), "added %s %s (%s)", res.Singular, rec.label(res), rec.id())
		return writeRecord(cmd, o, rec)
	})
	bindInput(cmd, &input)
	return cmd
}

func newEditCmd(c *client.Client, res *resource) *cobra.Command {
	var input string
	cmd := newCommand(commandDef{
		Name:  "edit",
		Short: "Change fields of one " + res.Singular + " from a JSON object",
		Long: "Change one " + res.Singular + ". Only the fields in --input change; the others keep\n" +
			"their values. null clears a field.\n\n" +
			"`tinycld books schema " + res.Name + " edit` prints the fields.",
		Aliases: []string{"update", "set"},
		Args:    idArg(res),
		Input:   inputSchema(res, false),
		Output:  recordSchema(res),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(res, body, false); err != nil {
			return err
		}
		return patchRecord(cmd, c, res, o, args[0], body, "updated")
	})
	bindInput(cmd, &input)
	return cmd
}

// patchRecord sends one change and prints the record the server answers with.
// `edit`, `activate` and `deactivate` share it.
func patchRecord(cmd *cobra.Command, c *client.Client, res *resource, o output.Options, id string, body map[string]any, done string) error {
	raw, err := client.UpdateRecord[rawRecord](cmd.Context(), c, res.Collection, id, body)
	if err != nil {
		return prefixID(res, id, err)
	}
	rec := project(res, raw)
	o.Info(cmd.ErrOrStderr(), "%s %s %s (%s)", done, res.Singular, rec.label(res), rec.id())
	return writeRecord(cmd, o, rec)
}
