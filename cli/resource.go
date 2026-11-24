package cli

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
)

// resources.json is the one definition of the list resources: which
// collection a command group reads, and each field's name, type and rules. The
// commands, the input checks and `books schema` are all built from it, and
// server/cli_resources_test.go checks it against the migrated collections, so
// a field that a migration renames fails a test, not a user.
//
//go:embed resources.json
var resourcesJSON []byte

// The field types of resources.json.
const (
	typeString  = "string"  // text, email, url or a one-value select
	typeBool    = "bool"    // true or false
	typeInteger = "integer" // a whole number (money is integer cents)
	typeNumber  = "number"  // a number that may have a fraction
	typeID      = "id"      // the id of one record of the resource named by ref
	typeIDs     = "ids"     // a list of ids of records of the resource named by ref
	typeAddress = "address" // an object with every key of addressKeys, or null
)

// addressKeys are the keys the server accepts in an address (server/address.go).
var addressKeys = []string{"line1", "line2", "city", "region", "postal_code", "country"}

// The fields every record has. PocketBase sets them.
var systemFields = []string{"id", "created", "updated"}

type field struct {
	Name string `json:"name"`
	Type string `json:"type"`
	// Required: the server refuses a record without a value.
	Required bool `json:"required,omitempty"`
	// ReadOnly: the server sets the value; the CLI refuses it in --input.
	ReadOnly bool `json:"readOnly,omitempty"`
	// Enum lists the values of a select.
	Enum []string `json:"enum,omitempty"`
	// Ref names the resource an id or ids field points to.
	Ref  string `json:"ref,omitempty"`
	Help string `json:"help"`
}

// filterFlag is a `list` flag that keeps the rows whose field equals the
// flag's value.
type filterFlag struct {
	Flag  string `json:"flag"`
	Field string `json:"field"`
	Help  string `json:"help"`
}

type resource struct {
	// Name is the command group: `tinycld books <name>`.
	Name string `json:"name"`
	// Singular is the word for one record, for messages.
	Singular   string `json:"singular"`
	Summary    string `json:"summary"`
	Collection string `json:"collection"`
	// Sort is the PocketBase sort of `list`.
	Sort string `json:"sort"`
	// Label is the field that names a record in messages. Empty: the id.
	Label string `json:"label"`
	// Columns are the fields of the `list` table. The id is always the last.
	Columns []string `json:"columns"`
	// Search are the fields `list --search` looks in.
	Search  []string     `json:"search"`
	Filters []filterFlag `json:"filters"`
	// Omit names the collection's fields the CLI leaves out on purpose. The
	// server test fails for a collection field that is neither in Fields nor
	// here, so a new column cannot be forgotten.
	Omit []string `json:"omit"`
	// DeleteHelp says when the server refuses a delete and what to do then.
	DeleteHelp string  `json:"deleteHelp"`
	Fields     []field `json:"fields"`
}

func (r *resource) field(name string) *field {
	for i := range r.Fields {
		if r.Fields[i].Name == name {
			return &r.Fields[i]
		}
	}
	return nil
}

func (r *resource) hasInactive() bool {
	f := r.field("inactive")
	return f != nil && f.Type == typeBool
}

// writable lists the fields --input may hold, in their declared order.
func (r *resource) writable() []*field {
	out := []*field{}
	for i := range r.Fields {
		if !r.Fields[i].ReadOnly {
			out = append(out, &r.Fields[i])
		}
	}
	return out
}

var resources = mustLoadResources(resourcesJSON)

func findResource(name string) *resource {
	for i := range resources {
		if resources[i].Name == name {
			return &resources[i]
		}
	}
	return nil
}

func mustLoadResources(data []byte) []resource {
	loaded, err := loadResources(data)
	if err != nil {
		panic("books cli: resources.json: " + err.Error())
	}
	return loaded
}

// loadResources parses and checks the definitions. A mistake in the file is a
// programming error, found by the first test that loads the package.
func loadResources(data []byte) ([]resource, error) {
	var file struct {
		Resources []resource `json:"resources"`
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		return nil, err
	}
	names := map[string]bool{}
	for _, res := range file.Resources {
		names[res.Name] = true
	}
	seen := map[string]bool{}
	for i := range file.Resources {
		res := &file.Resources[i]
		if seen[res.Name] {
			return nil, fmt.Errorf("resource %q is defined twice", res.Name)
		}
		seen[res.Name] = true
		if err := checkResource(res, names); err != nil {
			return nil, fmt.Errorf("resource %q: %w", res.Name, err)
		}
	}
	return file.Resources, nil
}

func checkResource(res *resource, names map[string]bool) error {
	if res.Name == "" || res.Singular == "" || res.Summary == "" || res.Collection == "" || res.Sort == "" {
		return fmt.Errorf("name, singular, summary, collection and sort are required")
	}
	if len(res.Fields) == 0 {
		return fmt.Errorf("no fields")
	}
	fields := map[string]bool{}
	for i := range res.Fields {
		f := &res.Fields[i]
		if fields[f.Name] || slices.Contains(systemFields, f.Name) {
			return fmt.Errorf("field %q is defined twice or is a system field", f.Name)
		}
		fields[f.Name] = true
		if err := checkField(f, names); err != nil {
			return fmt.Errorf("field %q: %w", f.Name, err)
		}
	}
	uses := map[string][]string{"columns": res.Columns, "search": res.Search, "omit": nil}
	if res.Label != "" {
		uses["label"] = []string{res.Label}
	}
	for _, flt := range res.Filters {
		if flt.Flag == "" || flt.Help == "" {
			return fmt.Errorf("a filter needs a flag and a help text")
		}
		uses["filters"] = append(uses["filters"], flt.Field)
	}
	for where, list := range uses {
		for _, name := range list {
			if !fields[name] {
				return fmt.Errorf("%s names %q, which is not a field", where, name)
			}
		}
	}
	for _, name := range res.Search {
		if res.field(name).Type != typeString {
			return fmt.Errorf("search field %q is not a string", name)
		}
	}
	for _, name := range res.Omit {
		if fields[name] {
			return fmt.Errorf("omit names %q, which is a field", name)
		}
	}
	return nil
}

// fieldName is what a field name may be. Field names go into the filter and
// sort text of `list` as they are, so they are held to an identifier here;
// only values are bound.
var fieldName = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

func checkField(f *field, names map[string]bool) error {
	if !fieldName.MatchString(f.Name) {
		return fmt.Errorf("the name must be lower-case letters, digits and _")
	}
	if f.Help == "" {
		return fmt.Errorf("no help text")
	}
	switch f.Type {
	case typeString, typeBool, typeInteger, typeNumber, typeAddress:
		if f.Ref != "" {
			return fmt.Errorf("only an id or ids field has a ref")
		}
	case typeID, typeIDs:
		if !names[f.Ref] {
			return fmt.Errorf("ref %q is not a resource", f.Ref)
		}
	default:
		return fmt.Errorf("unknown type %q", f.Type)
	}
	if len(f.Enum) > 0 && f.Type != typeString {
		return fmt.Errorf("only a string field has an enum")
	}
	if f.Required && f.ReadOnly {
		return fmt.Errorf("a read-only field is set by the server and cannot be required of the caller")
	}
	return nil
}

// fieldSchema is the JSON Schema of one field's value.
func fieldSchema(f *field) map[string]any {
	schema := map[string]any{"description": f.Help}
	switch f.Type {
	case typeString:
		schema["type"] = "string"
		if len(f.Enum) > 0 {
			values := slices.Clone(f.Enum)
			if !f.Required {
				// A select with no value is "".
				values = append(values, "")
			}
			schema["enum"] = values
		}
	case typeBool:
		schema["type"] = "boolean"
	case typeInteger:
		schema["type"] = "integer"
	case typeNumber:
		schema["type"] = "number"
	case typeID:
		schema["type"] = "string"
		schema["description"] = f.Help + " (the id of a record of `books " + f.Ref + "`)"
	case typeIDs:
		schema["type"] = "array"
		schema["items"] = map[string]any{"type": "string"}
		schema["description"] = f.Help + " (ids of records of `books " + f.Ref + "`)"
	case typeAddress:
		parts := map[string]any{}
		for _, key := range addressKeys {
			parts[key] = map[string]any{"type": "string"}
		}
		schema["type"] = []string{"object", "null"}
		schema["properties"] = parts
		schema["required"] = addressKeys
		schema["additionalProperties"] = false
	}
	return schema
}

// recordSchema is the JSON Schema of a record as every command prints it: the
// id, the resource's fields in their declared order, created and updated.
func recordSchema(res *resource) map[string]any {
	props := map[string]any{
		"id":      map[string]any{"type": "string", "description": "the record id; the argument of show, edit, delete"},
		"created": map[string]any{"type": "string", "description": "when the record was created (UTC)"},
		"updated": map[string]any{"type": "string", "description": "when the record last changed (UTC)"},
	}
	for i := range res.Fields {
		props[res.Fields[i].Name] = fieldSchema(&res.Fields[i])
	}
	return map[string]any{
		"type":        "object",
		"description": "Every key is always present. A key that this server does not have (a server older than this CLI) is null.",
		"properties":  props,
		"required":    recordKeys(res),
	}
}

// listSchema is the JSON Schema of what `list` prints.
func listSchema(res *resource) map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"items": map[string]any{"type": "array", "items": recordSchema(res)},
			"page":  map[string]any{"type": "integer", "description": "the page that was asked for, from 1"},
			"limit": map[string]any{"type": "integer", "description": "the page size that was asked for"},
			"total": map[string]any{"type": "integer", "description": "the number of records that match, on all pages"},
		},
		"required": []string{"items", "page", "limit", "total"},
	}
}

// recordKeys is the key order of a printed record.
func recordKeys(res *resource) []string {
	keys := []string{"id"}
	for i := range res.Fields {
		keys = append(keys, res.Fields[i].Name)
	}
	return append(keys, "created", "updated")
}
