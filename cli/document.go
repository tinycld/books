package cli

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// documents.json is the one definition of the transaction types: the
// collection of the document, the collections of its lines, and each field's
// name, type and rules. The commands, the input checks and `books schema` are
// built from it, and server/cli_documents_test.go checks it against the
// migrated collections.
//
//go:embed documents.json
var documentsJSON []byte

// The lifecycles of a document.
const (
	// lifecyclePosting is the life of a document that posts to the ledger: a
	// draft, then posted, then void.
	lifecyclePosting = "posting"
	// lifecycleQuote is the life of an offer that posts nothing: pending,
	// accepted or rejected as a person says, and closed by Books when an invoice
	// is made from it.
	lifecycleQuote = "quote"
)

// journalDocument is the type of the journal entry Books writes for a posted
// transaction.
const journalDocument = "journal-entries"

// The values of a document's status.
const (
	statusDraft  = "draft"
	statusPosted = "posted"
	statusVoid   = "void"

	statusPending  = "pending"
	statusAccepted = "accepted"
	statusRejected = "rejected"
	statusClosed   = "closed"
)

// maxDocumentLines is the most rows one line table of a document may have,
// unless the table states its own `max`. The server refuses more
// (server/sales_documents.go, server/entries.go).
const maxDocumentLines = 250

// lineTable is one kind of row a document has: the lines of a journal entry,
// the invoices a payment pays.
type lineTable struct {
	// Key is the name of the array in the input and in the output.
	Key string `json:"key"`
	// Singular is the word for one row, for messages.
	Singular   string `json:"singular"`
	Collection string `json:"collection"`
	// Parent is the field of a row that holds the document's id. The CLI sets
	// it, and `position` from the row's place in the array.
	Parent string `json:"parent"`
	// Sort is the PocketBase sort that puts the rows in their order.
	Sort string `json:"sort"`
	// Omit names the collection's fields the CLI leaves out. Parent and
	// position are always among them.
	Omit   []string `json:"omit"`
	Fields []field  `json:"fields"`
	// ReadOnly marks a table Books writes (the tax lines of an invoice). Its
	// rows are printed, and are never part of an input.
	ReadOnly bool `json:"readOnly"`
	// Computed names the writable fields Books computes on some rows: the
	// amount of an item line of a bill is its quantity times its rate, and the
	// amount of an account line is typed.
	Computed []computedField `json:"computed"`
	// Max is the most rows the table may have, when the server's limit for it
	// is not maxDocumentLines (a payment pays up to 500 invoices).
	Max int `json:"max"`
}

// maxRows is the most rows of the table one document may have.
func (t *lineTable) maxRows() int {
	if t.Max > 0 {
		return t.Max
	}
	return maxDocumentLines
}

// computedField says that Books computes Field on a row whose When field has
// one of the values of Is. The server refuses such a row that sends the field.
type computedField struct {
	Field string   `json:"field"`
	When  string   `json:"when"`
	Is    []string `json:"is"`
}

// computes reports whether Books computes the field on this row. value reads a
// field of the row as text.
func (t *lineTable) computes(name string, value func(string) string) bool {
	for _, rule := range t.Computed {
		if rule.Field == name && rule.matches(value) {
			return true
		}
	}
	return false
}

// matches reports whether the row is one the rule applies to.
func (r computedField) matches(value func(string) string) bool {
	return slices.Contains(r.Is, value(r.When))
}

// asResource is the table as a resource, for the functions that check, print
// and describe a record by its fields.
func (t *lineTable) asResource() *resource {
	return &resource{Name: t.Key, Singular: t.Singular, Collection: t.Collection, Omit: t.Omit, Fields: t.Fields}
}

// document is one transaction type: a header record and its line tables.
type document struct {
	resource
	Lifecycle string `json:"lifecycle"`
	// Fixed holds the header values every document of this type has. The CLI
	// sends them on a create; a caller cannot.
	Fixed map[string]string `json:"fixed"`
	// Entry names the header field that holds the id of the journal entry
	// Books writes when the document is posted. "": the type has no `entry`
	// command (a journal entry is its own entry).
	Entry string `json:"entry"`
	// Keep names the read-only header fields a correction copies from the
	// posted document it replaces (the estimate an invoice was made from: the
	// server refuses a correction that drops it).
	Keep []string `json:"keep"`
	// Convert says how `convert` makes a document of another type from one of
	// this type. nil: the type has no `convert` command.
	Convert *conversion `json:"convert"`
	Lines   []lineTable `json:"lines"`
}

// conversion is the rule of a `convert` command.
type conversion struct {
	// To is the name of the type of the document that is made.
	To string `json:"to"`
	// Link is the read-only field of the new document that holds the id of the
	// document it was made from. Books reads it to close the source.
	Link string `json:"link"`
	// Copy names the header fields that go from the source to the new
	// document. The line tables go as they are.
	Copy []string `json:"copy"`
}

// hasRevision reports whether the type counts its saves. The server takes a
// change of such a document only with the revision it will have; a type with
// no revision field (a payment) is changed without one.
func (d *document) hasRevision() bool {
	return d.field("revision") != nil
}

// initialStatus is the status the CLI gives a new document.
func (d *document) initialStatus() string {
	if d.Lifecycle == lifecycleQuote {
		return statusPending
	}
	return statusDraft
}

// editedInPlace reports whether `edit` changes a document with this status
// itself. A posted document is corrected by a new one; a quote is changed
// until it is closed.
func (d *document) editedInPlace(status string) bool {
	if d.Lifecycle == lifecycleQuote {
		return status != statusClosed
	}
	return status == statusDraft
}

func (d *document) table(key string) *lineTable {
	for i := range d.Lines {
		if d.Lines[i].Key == key {
			return &d.Lines[i]
		}
	}
	return nil
}

var documents = mustLoadDocuments(documentsJSON)

func findDocument(name string) *document {
	for i := range documents {
		if documents[i].Name == name {
			return &documents[i]
		}
	}
	return nil
}

func mustLoadDocuments(data []byte) []document {
	loaded, err := loadDocuments(data)
	if err != nil {
		panic("books cli: documents.json: " + err.Error())
	}
	return loaded
}

// loadDocuments parses and checks the definitions. A mistake in the file is a
// programming error, found by the first test that loads the package.
func loadDocuments(data []byte) ([]document, error) {
	var file struct {
		Documents []document `json:"documents"`
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		return nil, err
	}
	// A field of a document may point to a list resource or to a document.
	names := map[string]bool{}
	for i := range resources {
		names[resources[i].Name] = true
	}
	for i := range file.Documents {
		name := file.Documents[i].Name
		if findResource(name) != nil {
			return nil, fmt.Errorf("document %q is already a list resource", name)
		}
		if names[name] {
			return nil, fmt.Errorf("document %q is given to two documents", name)
		}
		names[name] = true
	}
	for i := range file.Documents {
		doc := &file.Documents[i]
		if err := checkDocument(doc, names); err != nil {
			return nil, fmt.Errorf("document %q: %w", doc.Name, err)
		}
	}
	for i := range file.Documents {
		doc := &file.Documents[i]
		if err := checkConversion(doc, file.Documents); err != nil {
			return nil, fmt.Errorf("document %q: convert: %w", doc.Name, err)
		}
	}
	return file.Documents, nil
}

func checkDocument(doc *document, names map[string]bool) error {
	if err := checkResource(&doc.resource, names); err != nil {
		return err
	}
	status := doc.field("status")
	switch doc.Lifecycle {
	case lifecyclePosting:
		if status == nil || !status.ReadOnly || !slices.Equal(status.Enum, []string{statusDraft, statusPosted, statusVoid}) {
			return fmt.Errorf("a posting document has a read-only status with the values draft, posted, void")
		}
		if replaces := doc.field("replaces"); replaces == nil || !replaces.ReadOnly || replaces.Type != typeID || replaces.Ref != doc.Name {
			return fmt.Errorf("a posting document has a read-only replaces, the id of a document of its own type")
		}
	case lifecycleQuote:
		if status == nil || !status.ReadOnly || !slices.Equal(status.Enum, []string{statusPending, statusAccepted, statusRejected, statusClosed}) {
			return fmt.Errorf("a quote has a read-only status with the values pending, accepted, rejected, closed")
		}
		// `accept` sets both; no other command does.
		for _, name := range []string{"accepted_by", "accepted_date"} {
			if f := doc.field(name); f == nil || !f.ReadOnly || f.Type != typeString {
				return fmt.Errorf("a quote has a read-only string %s", name)
			}
		}
		if doc.Entry != "" || len(doc.Fixed) > 0 {
			return fmt.Errorf("a quote posts nothing: it has no entry and no fixed value")
		}
		// Its status commands state the next revision.
		if !doc.hasRevision() {
			return fmt.Errorf("a quote has a read-only integer revision")
		}
	default:
		return fmt.Errorf("unknown lifecycle %q", doc.Lifecycle)
	}
	if revision := doc.field("revision"); revision != nil && (!revision.ReadOnly || revision.Type != typeInteger) {
		return fmt.Errorf("revision is a read-only integer")
	}
	for _, name := range doc.Keep {
		if f := doc.field(name); f == nil || !f.ReadOnly || doc.Lifecycle != lifecyclePosting {
			return fmt.Errorf("keep names %q, which is not a read-only field of a posting document", name)
		}
	}
	fixed := make([]string, 0, len(doc.Fixed))
	for name := range doc.Fixed {
		fixed = append(fixed, name)
	}
	slices.Sort(fixed)
	for _, name := range fixed {
		f := doc.field(name)
		if f == nil || !f.ReadOnly || f.Type != typeString {
			return fmt.Errorf("fixed names %q, which is not a read-only string field", name)
		}
		if value := doc.Fixed[name]; value == "" || (len(f.Enum) > 0 && !slices.Contains(f.Enum, value)) {
			return fmt.Errorf("fixed %q: %q is not a value of the field", name, value)
		}
	}
	if doc.Entry != "" {
		entry := doc.field(doc.Entry)
		if entry == nil || !entry.ReadOnly || entry.Type != typeID || entry.Ref != journalDocument {
			return fmt.Errorf("entry names %q, which is not a read-only id of %s", doc.Entry, journalDocument)
		}
	}
	keys := map[string]bool{}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		if !fieldName.MatchString(table.Key) || keys[table.Key] || doc.field(table.Key) != nil || slices.Contains(systemFields, table.Key) {
			return fmt.Errorf("line table key %q is not a name, is used twice, or is a field of the document", table.Key)
		}
		keys[table.Key] = true
		if err := checkLineTable(table, names); err != nil {
			return fmt.Errorf("line table %q: %w", table.Key, err)
		}
	}
	return nil
}

// checkConversion checks the rule of a `convert` command against the type it
// makes: every value the command copies has a place there.
func checkConversion(doc *document, all []document) error {
	conv := doc.Convert
	if conv == nil {
		return nil
	}
	// The command refuses a closed source, and only a quote closes.
	if doc.Lifecycle != lifecycleQuote {
		return fmt.Errorf("convert is only for a document with the lifecycle %q", lifecycleQuote)
	}
	var to *document
	for i := range all {
		if all[i].Name == conv.To {
			to = &all[i]
		}
	}
	if to == nil || to == doc {
		return fmt.Errorf("to names %q, which is not another document", conv.To)
	}
	if link := to.field(conv.Link); link == nil || !link.ReadOnly || link.Type != typeID || link.Ref != doc.Name {
		return fmt.Errorf("link names %q, which is not a read-only id of %s in %s", conv.Link, doc.Name, to.Name)
	}
	for _, name := range conv.Copy {
		from, into := doc.field(name), to.field(name)
		if from == nil || into == nil || from.ReadOnly || into.ReadOnly || from.Type != into.Type {
			return fmt.Errorf("copy names %q, which is not a writable field of one type in both", name)
		}
	}
	for i := range doc.Lines {
		table := &doc.Lines[i]
		if table.ReadOnly {
			continue
		}
		into := to.table(table.Key)
		if into == nil || into.ReadOnly {
			return fmt.Errorf("%s has no line table %q to copy to", to.Name, table.Key)
		}
		for _, f := range table.asResource().writable() {
			if g := into.asResource().field(f.Name); g == nil || g.ReadOnly || g.Type != f.Type {
				return fmt.Errorf("%s.%s has no writable field %q of the type %s", to.Name, table.Key, f.Name, f.Type)
			}
		}
	}
	// The input is checked against the target's tables, and the rows come
	// from the source's: a table the source lacks would drop the caller's rows.
	for i := range to.Lines {
		if table := &to.Lines[i]; !table.ReadOnly && doc.table(table.Key) == nil {
			return fmt.Errorf("%s.%s has no source line table in %s", to.Name, table.Key, doc.Name)
		}
	}
	return nil
}

func checkLineTable(table *lineTable, names map[string]bool) error {
	if table.Singular == "" || table.Collection == "" || table.Sort == "" {
		return fmt.Errorf("singular, collection and sort are required")
	}
	if !fieldName.MatchString(table.Parent) {
		return fmt.Errorf("parent %q is not a field name", table.Parent)
	}
	// The CLI sets both, so a caller never sends or reads them.
	for _, set := range []string{table.Parent, "position"} {
		if !slices.Contains(table.Omit, set) {
			return fmt.Errorf("omit must name %q: the CLI sets it", set)
		}
	}
	if len(table.Fields) == 0 {
		return fmt.Errorf("no fields")
	}
	if table.Max < 0 {
		return fmt.Errorf("max %d is below zero", table.Max)
	}
	fields := map[string]bool{}
	for i := range table.Fields {
		f := &table.Fields[i]
		if fields[f.Name] || slices.Contains(systemFields, f.Name) || slices.Contains(table.Omit, f.Name) {
			return fmt.Errorf("field %q is defined twice, is a system field, or is in omit", f.Name)
		}
		fields[f.Name] = true
		if err := checkField(f, names); err != nil {
			return fmt.Errorf("field %q: %w", f.Name, err)
		}
	}
	for _, name := range table.Omit {
		if !fieldName.MatchString(name) {
			return fmt.Errorf("omit names %q, which is not a field name", name)
		}
	}
	res := table.asResource()
	for _, rule := range table.Computed {
		if f := res.field(rule.Field); f == nil || f.ReadOnly || f.Required {
			return fmt.Errorf("computed names %q, which is not an optional field a caller may send", rule.Field)
		}
		when := res.field(rule.When)
		if when == nil {
			return fmt.Errorf("computed %q: when names %q, which is not a field", rule.Field, rule.When)
		}
		if len(rule.Is) == 0 {
			return fmt.Errorf("computed %q: is names no value", rule.Field)
		}
		for _, value := range rule.Is {
			if !slices.Contains(when.Enum, value) {
				return fmt.Errorf("computed %q: %q is not a value of %s", rule.Field, value, rule.When)
			}
		}
	}
	// The sort goes into PocketBase sort text as it is.
	for _, term := range strings.Split(table.Sort, ",") {
		name := strings.TrimLeft(term, "-+")
		known := fields[name] || slices.Contains(systemFields, name) || slices.Contains(table.Omit, name)
		if len(term)-len(name) > 1 || !known {
			return fmt.Errorf("sort names %q, which is not a field", term)
		}
	}
	return nil
}

// documentKeys is the key order of a printed document: the header's keys, then
// one key for each line table.
func documentKeys(doc *document) []string {
	keys := recordKeys(&doc.resource)
	for i := range doc.Lines {
		keys = append(keys, doc.Lines[i].Key)
	}
	return keys
}

// documentSchema is the JSON Schema of a document as show, add, edit, post and
// void print it: the header record, with each line table as an array inside.
func documentSchema(doc *document) map[string]any {
	schema := recordSchema(&doc.resource)
	props := schema["properties"].(map[string]any)
	for i := range doc.Lines {
		table := &doc.Lines[i]
		props[table.Key] = map[string]any{
			"type":        "array",
			"description": "every " + table.Singular + " of the " + doc.Singular + ", in order",
			"items":       recordSchema(table.asResource()),
		}
	}
	schema["required"] = documentKeys(doc)
	return schema
}

// documentInputSchema is the JSON Schema of the --input document of `add`
// (create) or `edit`. It is what checkDocumentInput enforces.
func documentInputSchema(doc *document, create bool) map[string]any {
	schema := inputSchema(&doc.resource, create)
	props := schema["properties"].(map[string]any)
	for i := range doc.Lines {
		table := &doc.Lines[i]
		if table.ReadOnly {
			continue
		}
		description := "every " + table.Singular + " of the " + doc.Singular + ", in order"
		if !create {
			description += "; when given, these rows replace all the rows the " + doc.Singular + " has"
		}
		props[table.Key] = map[string]any{
			"type":        "array",
			"description": description,
			"maxItems":    table.maxRows(),
			"items":       inputSchema(table.asResource(), true),
		}
	}
	return schema
}

// documentInput is a checked --input document, split into the header's fields
// and the rows of each line table.
type documentInput struct {
	header map[string]any
	// lines holds the rows of each line table the input names. A table the
	// input does not name is not in the map: an edit keeps its rows.
	lines map[string][]map[string]any
}

// checkDocumentInput refuses an --input document the server would refuse for
// its shape, before anything is sent, as checkInput does for a list record. A
// mistake in a row names the row: "lines[1]".
func checkDocumentInput(doc *document, body map[string]any, create bool) (documentInput, error) {
	in := documentInput{header: map[string]any{}, lines: map[string][]map[string]any{}}
	inputNames := writableNames(&doc.resource)
	for i := range doc.Lines {
		if !doc.Lines[i].ReadOnly {
			inputNames = append(inputNames, doc.Lines[i].Key)
		}
	}
	names := make([]string, 0, len(body))
	for name := range body {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if table := doc.table(name); table != nil {
			if table.ReadOnly {
				return in, usagef("%q is set by the server", name)
			}
			rows, err := checkLines(table, body[name])
			if err != nil {
				return in, err
			}
			in.lines[name] = rows
			continue
		}
		if doc.field(name) == nil && !slices.Contains(systemFields, name) {
			return in, usagef("%s has no field %q; fields: %s", doc.Name, name, strings.Join(inputNames, ", "))
		}
		in.header[name] = body[name]
	}
	if !create && len(in.header) == 0 {
		if len(in.lines) == 0 {
			return in, usagef("nothing to change: --input is an empty object")
		}
		return in, nil
	}
	return in, checkInput(&doc.resource, in.header, create)
}

func checkLines(table *lineTable, value any) ([]map[string]any, error) {
	list, ok := value.([]any)
	if !ok {
		return nil, usagef("%q must be an array of objects, one for each %s", table.Key, table.Singular)
	}
	if len(list) > table.maxRows() {
		return nil, usagef("%q has %d rows: the most is %d", table.Key, len(list), table.maxRows())
	}
	res := table.asResource()
	rows := make([]map[string]any, 0, len(list))
	for i, item := range list {
		row, ok := item.(map[string]any)
		if !ok {
			return nil, usagef("%s[%d] must be an object", table.Key, i)
		}
		if err := checkInput(res, row, true); err != nil {
			return nil, usagef("%s[%d]: %v", table.Key, i, err)
		}
		text := func(name string) string {
			s, _ := row[name].(string)
			return s
		}
		for _, rule := range table.Computed {
			if _, given := row[rule.Field]; given && rule.matches(text) {
				return nil, usagef("%s[%d]: Books computes %q of a row with the %s %q: leave it out", table.Key, i, rule.Field, rule.When, text(rule.When))
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}
