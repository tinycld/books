package books

import (
	"bytes"
	"encoding/json"
	"maps"
	"os"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The labels a reader sees in the General Ledger's Type column and the
// register's (spec §3): written out here, so a change of wording fails.
var wantOriginLabels = map[string]string{
	"manual":          "Journal entry",
	"reversal":        "Reversal",
	"void_reversal":   "Void reversal",
	"auto_reversal":   "Auto reversal",
	"opening_balance": "Opening balances",
}

func TestEntryTypeLabels_Parse(t *testing.T) {
	raw, err := os.ReadFile("entry_type_labels.json")
	if err != nil {
		t.Fatalf("read entry_type_labels.json: %v", err)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var file entryTypeLabelSet
	if err := dec.Decode(&file); err != nil {
		t.Fatalf("parse entry_type_labels.json: %v", err)
	}
	if !reflect.DeepEqual(file, entryTypeLabels) {
		t.Errorf("entryTypeLabels = %+v, want the file's %+v", entryTypeLabels, file)
	}
	if !reflect.DeepEqual(entryTypeLabels.Origins, wantOriginLabels) {
		t.Errorf("origin labels = %v, want %v", entryTypeLabels.Origins, wantOriginLabels)
	}
	if want := map[string]string{"transfer": "Transfer", "invoice": "Invoice", "sales_receipt": "Sales receipt", "bill": "Bill"}; !reflect.DeepEqual(entryTypeLabels.DocTypes, want) {
		t.Errorf("docTypes = %v, want %v", entryTypeLabels.DocTypes, want)
	}
	// The single "transfer" key is gone: docTypes replaces it, in the file and
	// in the parsed set.
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		t.Fatalf("parse entry_type_labels.json keys: %v", err)
	}
	if got := slices.Sorted(maps.Keys(keys)); !slices.Equal(got, []string{"docTypes", "origins", "reversalOrigins"}) {
		t.Errorf("entry_type_labels.json keys = %v, want docTypes, origins, reversalOrigins", got)
	}
	if _, ok := reflect.TypeOf(entryTypeLabels).FieldByName("Transfer"); ok {
		t.Error("entryTypeLabelSet still has the Transfer field")
	}
	if want := []string{"reversal", "void_reversal", "auto_reversal"}; !slices.Equal(entryTypeLabels.ReversalOrigins, want) {
		t.Errorf("reversalOrigins = %v, want %v", entryTypeLabels.ReversalOrigins, want)
	}
}

// Every origin the entries migration allows has a label, and the table names
// no origin the migration does not have. Origin document has no label of its
// own: a document's entry is named by its doc type (spec Q24).
func TestEntryTypeLabels_CoverEveryOrigin(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("origin").(*core.SelectField)
	if !ok {
		t.Fatal("books_journal_entries.origin is not a select field")
	}
	for _, origin := range field.Values {
		if origin != "document" && entryTypeLabels.Origins[origin] == "" {
			t.Errorf("origin %q has no label", origin)
		}
	}
	for origin := range entryTypeLabels.Origins {
		if !slices.Contains(field.Values, origin) {
			t.Errorf("label for %q, which is not an origin of the migration %v", origin, field.Values)
		}
	}
	for _, origin := range entryTypeLabels.ReversalOrigins {
		if !slices.Contains(field.Values, origin) {
			t.Errorf("reversal origin %q is not an origin of the migration %v", origin, field.Values)
		}
	}
	if len(field.Values) == 0 {
		t.Fatal("the migration lists no origins")
	}
}

// The report sources' doc_type options take their labels from docTypes, not
// from a copy: a changed label in the table changes the option.
func TestEntryDocTypeOptions_ReadDocTypes(t *testing.T) {
	saved := entryTypeLabels.DocTypes
	defer func() { entryTypeLabels.DocTypes = saved }()
	entryTypeLabels.DocTypes = map[string]string{"transfer": "Transfer (table)", "invoice": "Invoice (table)"}

	got := map[string]string{}
	for _, o := range entryDocTypeOptions() {
		got[o.Value] = o.Label
	}
	for docType, want := range entryTypeLabels.DocTypes {
		if got[docType] != want {
			t.Errorf("doc_type option %q label = %q, want the table's %q", docType, got[docType], want)
		}
	}
}
