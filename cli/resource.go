package cli

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
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

// listFlags are the flags `list` has of its own; a filter flag may not reuse
// one. Task 6 builds the flags from these names.
var listFlags = []string{"limit", "page", "search", "inactive", "all"}

// shellFlags are the persistent flags of the tinycld root command.
var shellFlags = []string{"json", "output", "quiet", "yes", "context", "no-color", "help"}

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
	// Default is the value the list uses when the flag is not given. A filter
	// with a default is always on; the flag value filterAll turns it off.
	Default string `json:"default,omitempty"`
}

// filterAll is the value of a filter flag with a default that lists the rows
// of every value.
const filterAll = "all"

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
	// Timestamps names the stamps the collection has: "created" and/or
	// "updated". A record prints and the schema describes only those. Absent:
	// both. The server test checks the key against the migrated collection.
	Timestamps []string `json:"timestamps"`
	// DeleteHelp says when the server refuses a delete and what to do then.
	DeleteHelp string `json:"deleteHelp"`
	// NoEdit marks a list resource whose records Books never changes (a
	// statement is what was true on its date): the group has no `edit`.
	NoEdit bool    `json:"noEdit"`
	Fields []field `json:"fields"`
	// scope holds the field values every record of `list` has: the fixed
	// values of a scoped document. It is not read from the file.
	scope map[string]string
	// where is a fixed filter clause of `list`, a constant of the code. It is
	// not read from the file.
	where string
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
	if err := checkTimestamps(res.Timestamps); err != nil {
		return err
	}
	// `activate` and `deactivate` change a record.
	if res.NoEdit && res.hasInactive() {
		return fmt.Errorf("a resource with noEdit has no inactive field: its records are never changed")
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
	type use struct {
		where string
		names []string
	}
	uses := []use{{"columns", res.Columns}, {"search", res.Search}}
	if res.Label != "" {
		uses = append(uses, use{"label", []string{res.Label}})
	}
	flags := map[string]bool{}
	filterFields := []string{}
	for _, flt := range res.Filters {
		if flt.Flag == "" || flt.Help == "" {
			return fmt.Errorf("a filter needs a flag and a help text")
		}
		if slices.Contains(listFlags, flt.Flag) || slices.Contains(shellFlags, flt.Flag) {
			return fmt.Errorf("filter flag %q is taken by a list or shell flag", flt.Flag)
		}
		if flags[flt.Flag] {
			return fmt.Errorf("filter flag %q is used twice", flt.Flag)
		}
		flags[flt.Flag] = true
		// list binds a filter value as text, so only a text field can match it.
		if f := res.field(flt.Field); f != nil && f.Type != typeString && f.Type != typeID {
			return fmt.Errorf("filter field %q is not a string or an id", flt.Field)
		}
		if flt.Default != "" {
			f := res.field(flt.Field)
			if f == nil || !slices.Contains(f.Enum, flt.Default) {
				return fmt.Errorf("filter flag %q has the default %q, which is not an enum value of its field", flt.Flag, flt.Default)
			}
			if slices.Contains(f.Enum, filterAll) {
				return fmt.Errorf("filter flag %q has a default, and its field has the value %q, which the flag reads as every value", flt.Flag, filterAll)
			}
		}
		filterFields = append(filterFields, flt.Field)
	}
	uses = append(uses, use{"filters", filterFields})
	for _, u := range uses {
		for _, name := range u.names {
			if !fields[name] {
				return fmt.Errorf("%s names %q, which is not a field", u.where, name)
			}
		}
	}
	listed := map[string]bool{}
	for _, name := range res.Columns {
		if listed[name] {
			return fmt.Errorf("column %q is listed twice", name)
		}
		listed[name] = true
	}
	// Omitted names are sort text too (a server-set sort key), so they are
	// held to an identifier.
	for _, name := range res.Omit {
		if !fieldName.MatchString(name) {
			return fmt.Errorf("omit names %q, which is not a field name", name)
		}
	}
	// The sort goes into PocketBase sort text as it is.
	for _, term := range strings.Split(res.Sort, ",") {
		name := strings.TrimLeft(term, "-+")
		known := fields[name] || slices.Contains(systemFields, name) || slices.Contains(res.Omit, name)
		if len(term)-len(name) > 1 || !known {
			return fmt.Errorf("sort names %q, which is not a field", term)
		}
	}
	for _, name := range res.Search {
		if f := res.field(name); f == nil || f.Type != typeString {
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
	if slices.Contains(f.Enum, "") {
		return fmt.Errorf("an empty enum value: a select with no value is added by the schema")
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
		schema["description"] = refDescription(f, "the id of a record of", "the id of a row of")
	case typeIDs:
		schema["type"] = "array"
		schema["items"] = map[string]any{"type": "string"}
		schema["description"] = refDescription(f, "ids of records of", "ids of rows of")
	case typeAddress:
		parts := map[string]any{}
		for _, key := range addressKeys {
			parts[key] = map[string]any{"type": "string"}
		}
		schema["type"] = []string{"object", "null"}
		schema["properties"] = parts
		schema["required"] = slices.Clone(addressKeys)
		schema["additionalProperties"] = false
	}
	return schema
}

// refDescription is the description of an id or ids field: the words say what
// the ids point to. A ref with a dot names a line table of a document (rowRef),
// so its ids are rows, not records.
func refDescription(f *field, records, rows string) string {
	if owner, key, isRow := strings.Cut(f.Ref, "."); isRow {
		return f.Help + " (" + rows + " `" + key + "` of `books " + owner + "`)"
	}
	return f.Help + " (" + records + " `books " + f.Ref + "`)"
}

// recordSchema is the JSON Schema of a record as every command prints it: the
// id, the resource's fields in their declared order, created and updated.
func recordSchema(res *resource) map[string]any {
	props := map[string]any{
		"id": map[string]any{"type": "string", "description": "the record id; the argument of show, edit, delete"},
	}
	if slices.Contains(stamps(res.Timestamps), "created") {
		props["created"] = map[string]any{"type": "string", "description": "when the record was created (UTC)"}
	}
	if slices.Contains(stamps(res.Timestamps), "updated") {
		props["updated"] = map[string]any{"type": "string", "description": "when the record last changed (UTC)"}
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
	return append(keys, stamps(res.Timestamps)...)
}

// allStamps are the timestamps of a collection, in the order they print.
var allStamps = []string{"created", "updated"}

// stamps is the timestamps a collection has, in print order: all of them when
// the definition gives no `timestamps` key.
func stamps(given []string) []string {
	if given == nil {
		return allStamps
	}
	have := []string{}
	for _, stamp := range allStamps {
		if slices.Contains(given, stamp) {
			have = append(have, stamp)
		}
	}
	return have
}

// checkTimestamps refuses a `timestamps` key that names a stamp twice or one
// that is not created or updated.
func checkTimestamps(given []string) error {
	seen := map[string]bool{}
	for _, stamp := range given {
		if !slices.Contains(allStamps, stamp) {
			return fmt.Errorf("timestamps names %q: the values are created and updated", stamp)
		}
		if seen[stamp] {
			return fmt.Errorf("timestamps names %q twice", stamp)
		}
		seen[stamp] = true
	}
	return nil
}
