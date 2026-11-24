package cli

import (
	"encoding/json"
	"testing"
)

// The printed record has the declared keys in the declared order, whatever
// the server sent: a column this CLI does not know is dropped, a missing one
// is null.
func TestProjectGivesOneShape(t *testing.T) {
	res := findResource("accounts")
	var raw rawRecord
	if err := json.Unmarshal([]byte(`{"updated":"u","zzz_new_column":1,"name":"Cash","id":"acct1","inactive":false}`), &raw); err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(project(res, raw))
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"acct1","name":"Cash","number":null,"type":null,"detail_type":null,"description":null,"parent":null,"inactive":false,"form_1099_box":null,"full_name":null,"currency":null,"created":null,"updated":"u"}`
	if string(out) != want {
		t.Errorf("record =\n  %s\nwant\n  %s", out, want)
	}
}

func TestRawRecordKeepsLargeIntegers(t *testing.T) {
	var raw rawRecord
	if err := json.Unmarshal([]byte(`{"price": 9007199254740991}`), &raw); err != nil {
		t.Fatal(err)
	}
	if got := cellText(raw["price"]); got != "9007199254740991" {
		t.Errorf("price = %q, want the digits the server sent", got)
	}
}

func TestCellText(t *testing.T) {
	for _, tc := range []struct {
		value any
		want  string
	}{
		{nil, ""},
		{"Cash", "Cash"},
		{true, "yes"},
		{false, "no"},
		{json.Number("12.5"), "12.5"},
		{[]any{"a", "b"}, "a,b"},
		{map[string]any{"line1": "1 Main St", "city": "Springfield", "region": ""}, "Springfield, 1 Main St"},
	} {
		if got := cellText(tc.value); got != tc.want {
			t.Errorf("cellText(%#v) = %q, want %q", tc.value, got, tc.want)
		}
	}
}
