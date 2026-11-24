package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

func TestShow(t *testing.T) {
	f := chart(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "show", "acctsavings0001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatal(err)
	}
	if got["id"] != "acctsavings0001" || got["name"] != "Savings" || got["currency"] != "USD" {
		t.Errorf("record = %v", got)
	}
	if !strings.HasPrefix(strings.TrimSpace(out), `{`+"\n"+`    "id": "acctsavings0001",`+"\n"+`    "name": "Savings",`) {
		t.Errorf("the keys must come in the declared order, id first:\n%s", out)
	}

	table, _, err := runCmd(t, f.serve(), "", "books", "account", "show", "acctsavings0001")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"FIELD", "detail_type", "savings", "full_name"} {
		if !strings.Contains(table, want) {
			t.Errorf("the table has no %q:\n%s", want, table)
		}
	}
}

func TestShowOfAMissingRecordIsExit5(t *testing.T) {
	out, _, err := runCmd(t, chart(t).serve(), "", "books", "accounts", "show", "nope", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Fatalf("exit = %d, want 5; err: %v", got, err)
	}
	if !strings.Contains(err.Error(), "account nope") {
		t.Errorf("the message must name what was not found: %v", err)
	}
	if !strings.Contains(out, `"code": "not_found"`) {
		t.Errorf("error document:\n%s", out)
	}
}
