package cli

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const undepositedCollection = "books_undeposited_items"

// undeposited is the banked book with three rows of the view of the money that
// waits in Undeposited funds, added out of order. The id of a row of the view is
// the id of its journal line.
func undeposited(t *testing.T) *fakeBooks {
	t.Helper()
	f := banked(t)
	row := func(id, date, docType, number, customer string, amount int, method, reference string) {
		f.addRow(undepositedCollection, id, map[string]any{
			"line": id, "entry": "entryinvoice001", "account": "acctundeposit01", "date": date, "doc_type": docType,
			"origin": "manual", "number": number, "document": "payposted000001", "customer": customer,
			"amount": cents(amount), "payment_method": method, "reference_no": reference, "memo": "",
		})
	}
	row("lineundep00003", "2026-11-04", "payment", "1002", "custacme0000001", 12500, "check", "4412")
	row("lineundep00001", "2026-11-02", "sales_receipt", "5", "", 800, "cash", "")
	row("lineundep00002", "2026-11-04", "payment", "1001", "custacme0000001", 30000, "check", "4411")
	f.addRow(undepositedCollection, "lineundep00004", map[string]any{
		"line": "lineundep00004", "entry": "entryinvoice001", "account": "acctundeposit02", "date": "2026-11-06", "doc_type": "vendor_refund",
		"origin": "manual", "number": "7", "document": "refposted000001", "vendor": "vendsummit00001", "amount": cents(4000), "payment_method": "check",
	})
	return f
}

func listedQueries(f *fakeBooks) []string {
	out := []string{}
	for _, query := range f.listed[undepositedCollection] {
		out = append(out, query.Get("filter")+" | "+query.Get("sort")+" | "+query.Get("page")+" | "+query.Get("perPage"))
	}
	return out
}

func idsOf(t *testing.T, out string) []string {
	t.Helper()
	var result struct {
		Items []struct {
			ID   string `json:"id"`
			Line string `json:"line"`
		} `json:"items"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		t.Fatalf("not a list result: %v\n%s", err, out)
	}
	ids := []string{}
	for _, item := range result.Items {
		if item.ID != item.Line {
			t.Errorf("the id %q of a row is not its line %q", item.ID, item.Line)
		}
		ids = append(ids, item.ID)
	}
	return ids
}

// The list sorts as the bank deposit form does: by date, then number, then the
// line, and asks for the whole view with no filter.
// server/cli_deposits_test.go sends a copy of the query.
func TestUndepositedListsInTheOrderOfTheForm(t *testing.T) {
	f := undeposited(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := strings.Join(listedQueries(f), ";"), ` | date,number,id | 1 | 200`; got != want {
		t.Errorf("the request = %q, want %q", got, want)
	}
	if got, want := strings.Join(idsOf(t, out), ","), "lineundep00001,lineundep00002,lineundep00003,lineundep00004"; got != want {
		t.Errorf("the rows = %s, want %s", got, want)
	}
	for _, want := range []string{`"payment_method": "check"`, `"reference_no": "4411"`, `"doc_type": "payment"`, `"amount": 30000`, `"line": "lineundep00002"`} {
		if !strings.Contains(out, want) {
			t.Errorf("the rows have no %s:\n%s", want, out)
		}
	}
	for _, request := range f.requests {
		if !strings.HasPrefix(request, "GET ") {
			t.Errorf("the list sent %s", request)
		}
	}
}

func TestUndepositedTablePrintsWhatAPersonChoosesBy(t *testing.T) {
	f := undeposited(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited")
	if err != nil {
		t.Fatal(err)
	}
	header := strings.Fields(strings.SplitN(out, "\n", 2)[0])
	want := []string{"DATE", "DOC_TYPE", "NUMBER", "CUSTOMER", "VENDOR", "AMOUNT", "PAYMENT_METHOD", "REFERENCE_NO", "LINE", "ID"}
	if strings.Join(header, ",") != strings.Join(want, ",") {
		t.Errorf("columns = %v, want %v", header, want)
	}
}

// A row of a view has no created and no updated. What the command prints and
// what `books schema` requires are the same keys, and neither has a timestamp.
func TestUndepositedRowHasNoTimestamps(t *testing.T) {
	f := undeposited(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &result); err != nil || len(result.Items) == 0 {
		t.Fatalf("not a list result: %v\n%s", err, out)
	}
	printed := []string{}
	for key := range result.Items[0] {
		printed = append(printed, key)
	}
	sort.Strings(printed)
	view := &findDocument("deposits").Views[0].resource
	schema := recordSchema(view)
	required := append([]string{}, schema["required"].([]string)...)
	sort.Strings(required)
	if strings.Join(printed, ",") != strings.Join(required, ",") {
		t.Errorf("the row prints %v, the schema requires %v", printed, required)
	}
	for _, key := range []string{"created", "updated"} {
		if _, ok := schema["properties"].(map[string]any)[key]; ok || slices.Contains(required, key) {
			t.Errorf("the schema of a view row has %q", key)
		}
		if strings.Contains(out, `"`+key+`"`) {
			t.Errorf("the row prints %q:\n%s", key, out)
		}
	}
}

// Each filter flag is bound through client.Filter, in the order of the
// definition.
func TestUndepositedFilters(t *testing.T) {
	cases := []struct {
		args []string
		want string
		ids  string
	}{
		{[]string{"--customer", "custacme0000001"}, `customer = "custacme0000001"`, "lineundep00002,lineundep00003"},
		{[]string{"--vendor", "vendsummit00001"}, `vendor = "vendsummit00001"`, "lineundep00004"},
		{[]string{"--account", "acctundeposit01"}, `account = "acctundeposit01"`, "lineundep00001,lineundep00002,lineundep00003"},
		{[]string{"--account", "acctundeposit02"}, `account = "acctundeposit02"`, "lineundep00004"},
		{[]string{"--doc-type", "sales_receipt"}, `doc_type = "sales_receipt"`, "lineundep00001"},
		{[]string{"--payment-method", "cash"}, `payment_method = "cash"`, "lineundep00001"},
		{[]string{"--search", "4411"}, `(number ~ "4411" || reference_no ~ "4411" || memo ~ "4411")`, "lineundep00002"},
		{[]string{"--customer", "custacme0000001", "--doc-type", "payment", "--search", "4412"},
			`customer = "custacme0000001" && doc_type = "payment" && (number ~ "4412" || reference_no ~ "4412" || memo ~ "4412")`, "lineundep00003"},
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			f := undeposited(t)
			out, _, err := runCmd(t, f.serve(), "", append([]string{"books", "deposits", "undeposited", "--json"}, tc.args...)...)
			if err != nil {
				t.Fatal(err)
			}
			if got, want := strings.Join(listedQueries(f), ";"), tc.want+` | date,number,id | 1 | 200`; got != want {
				t.Errorf("the request = %q, want %q", got, want)
			}
			if got := strings.Join(idsOf(t, out), ","); got != tc.ids {
				t.Errorf("the rows = %q, want %q", got, tc.ids)
			}
		})
	}
}

// A value with a quote in it is a value, never filter syntax.
func TestUndepositedBindsWhatTheCallerTypes(t *testing.T) {
	f := undeposited(t)
	f.rawFilter = true
	const typed = `x" || id != "`
	if _, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited", "--json", "--customer", typed, "--search", typed); err != nil {
		t.Fatal(err)
	}
	want := `customer = "x\" || id != \"" && (number ~ "x\" || id != \"" || reference_no ~ "x\" || id != \"" || memo ~ "x\" || id != \"")`
	if got := f.lastQuery.Get("filter"); got != want {
		t.Errorf("filter = %s\nwant     %s", got, want)
	}
}

func TestUndepositedRefusesADocTypeThatIsNotOne(t *testing.T) {
	f := undeposited(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited", "--doc-type", "paymnt")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "is not a value of doc_type") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused flag sent %v", f.requests)
	}
}

func TestUndepositedHasThePagingOfEveryList(t *testing.T) {
	f := undeposited(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "deposits", "undeposited", "--limit", "0")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--limit must be from 1 to 500") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused flag sent %v", f.requests)
	}
}

// The command is in `books schema` as other list commands are: with its flags
// and the schema of what it prints, and with no input.
func TestUndepositedIsInTheSchema(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "schema", "deposits", "undeposited")
	if err != nil {
		t.Fatal(err)
	}
	var spec commandSpec
	if err := json.Unmarshal([]byte(out), &spec); err != nil {
		t.Fatal(err)
	}
	if spec.Command != "tinycld books deposits undeposited" || string(spec.Input) != "null" {
		t.Errorf("command = %q, input = %s", spec.Command, spec.Input)
	}
	flags := []string{}
	for _, flag := range spec.Flags {
		flags = append(flags, flag.Name)
	}
	for _, want := range []string{"--customer", "--vendor", "--account", "--doc-type", "--payment-method", "--search", "--limit", "--page"} {
		found := false
		for _, name := range flags {
			found = found || name == want
		}
		if !found {
			t.Errorf("the schema has no %s: %v", want, flags)
		}
	}
	if !strings.Contains(string(spec.Output), `"line"`) || !strings.Contains(string(spec.Output), `"payment_method"`) {
		t.Errorf("the output schema: %s", spec.Output)
	}
}

func TestUndepositedHelpSaysWhatTheRowsAre(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "deposits", "undeposited", "--help")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`{"line": "<line>"}`, "no posted deposit holds", "tinycld books deposits undeposited --customer"} {
		if !strings.Contains(out, want) {
			t.Errorf("the help has no %q:\n%s", want, out)
		}
	}
}

// A command word of a type is one command of its group: no two commands of a
// group share a name.
func TestNoGroupHasTwoCommandsOfOneName(t *testing.T) {
	root := newTestRoot(nil)
	books, _, err := root.Find([]string{"books"})
	if err != nil {
		t.Fatal(err)
	}
	for _, group := range books.Commands() {
		seen := map[string]bool{}
		for _, cmd := range group.Commands() {
			if seen[cmd.Name()] {
				t.Errorf("%s has two commands named %q", group.Name(), cmd.Name())
			}
			seen[cmd.Name()] = true
		}
	}
}

func TestDepositsHasTheUndepositedView(t *testing.T) {
	doc := findDocument("deposits")
	if len(doc.Views) != 1 || doc.Views[0].Word != "undeposited" || doc.Views[0].Collection != undepositedCollection {
		t.Fatalf("views = %+v", doc.Views)
	}
	if got := findDocument("vendor-refunds").Views; len(got) != 0 {
		t.Errorf("vendor-refunds has views %+v", got)
	}
}

// A mistake in the definition of a view is a load error, as in the rest of
// documents.json.
func TestLoadDocumentsChecksAView(t *testing.T) {
	const viewObject = `{"word":"waiting","long":"The notes that wait.","name":"waiting notes","singular":"waiting note",` +
		`"summary":"List the notes that wait","collection":"books_waiting_notes","sort":"title,id","label":"","columns":["title"],` +
		`"search":["title"],"filters":[{"flag":"kind","field":"kind","help":"only this kind"}],"omit":[],"deleteHelp":"",` +
		`"fields":[{"name":"title","type":"string","help":"the title"},{"name":"kind","type":"string","help":"the kind"}]}`
	view := `"views":[` + viewObject + `],`
	valid := strings.Replace(minimalDocument, `"lines":[{"key"`, view+`"lines":[{"key"`, 1)
	if valid == minimalDocument {
		t.Fatal("the view was not added")
	}
	if _, err := loadDocuments([]byte(valid)); err != nil {
		t.Fatalf("the minimal view: %v", err)
	}
	cases := []struct{ name, old, new, want string }{
		{"no word", `"word":"waiting"`, `"word":""`, "a view needs a word and a long help text"},
		{"no long text", `"long":"The notes that wait."`, `"long":""`, "a view needs a word and a long help text"},
		{"a word that is not a word", `"word":"waiting"`, `"word":"Wait ing"`, `word "Wait ing"`},
		{"the word of list", `"word":"waiting"`, `"word":"list"`, `word "list" is the list command`},
		{"a sort on an unknown field", `"sort":"title,id"`, `"sort":"rank,id"`, `sort names "rank"`},
		{"a filter on an unknown field", `"field":"kind"`, `"field":"colour"`, `filters names "colour"`},
		{"a column that is not a field", `"columns":["title"]`, `"columns":["name"]`, `columns names "name"`},
		{"a ref that is nothing", `{"name":"kind","type":"string","help":"the kind"}`, `{"name":"kind","type":"id","ref":"nothing","help":"the kind"}`, `ref "nothing" is not a resource`},
		{"an unknown key", `"word":"waiting"`, `"word":"waiting","colour":"red"`, "unknown field"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if strings.Count(valid, tc.old) != 1 {
				t.Fatalf("the case does not change one place of the definition: %q", tc.old)
			}
			_, err := loadDocuments([]byte(strings.Replace(valid, tc.old, tc.new, 1)))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want one that says %q", err, tc.want)
			}
		})
	}
	withoutStamps := strings.Replace(valid, `"omit":[],"deleteHelp":"",`+`"fields":[{"name":"title"`, `"omit":[],"noTimestamps":true,"deleteHelp":"",`+`"fields":[{"name":"title"`, 1)
	if _, err := loadDocuments([]byte(withoutStamps)); err != nil || withoutStamps == valid {
		t.Errorf("a view with noTimestamps: err = %v, changed = %v", err, withoutStamps != valid)
	}
	onDocument := strings.Replace(minimalDocument, `"lines":[{"key"`, `"noTimestamps":true,"lines":[{"key"`, 1)
	if _, err := loadDocuments([]byte(onDocument)); err == nil || !strings.Contains(err.Error(), "noTimestamps is a key of a view") {
		t.Errorf("a document with noTimestamps: err = %v", err)
	}
	doubled := strings.Replace(valid, `"views":[`+viewObject+`]`, `"views":[`+viewObject+`,`+viewObject+`]`, 1)
	if _, err := loadDocuments([]byte(doubled)); err == nil || !strings.Contains(err.Error(), `word "waiting" is used twice`) {
		t.Errorf("two views with one word: err = %v", err)
	}
}
