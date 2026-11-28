package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

const (
	adjustDraft   = "adjustdraft0001"
	adjustPosted  = "adjustposted001"
	adjustOpening = "adjustopening01"
)

// adjustments has a draft and a posted inventory adjustment of the widget,
// and the adjustment that Books made for the opening stock of the widget.
func adjustments(t *testing.T) *fakeBooks {
	t.Helper()
	f := chart(t)
	for id, status := range map[string]string{adjustDraft: "draft", adjustPosted: "posted"} {
		f.add("books_inventory_adjustments", id, map[string]any{
			"date": "2026-09-05", "account": "", "memo": "count", "status": status, "kind": "manual",
			"number": "", "source": "", "document": "", "currency": "USD", "entry": "",
		})
		f.add("books_inventory_adjustment_lines", "ln"+id[2:], map[string]any{
			"adjustment": id, "product": stockWidget, "quantity": json.Number("10"), "value": json.Number("5000"), "position": json.Number("0"),
		})
	}
	f.add("books_inventory_adjustments", adjustOpening, map[string]any{
		"date": "2026-09-01", "status": "posted", "kind": "opening", "number": "IA-1",
		"source": "books_products", "document": stockWidget, "currency": "USD",
	})
	return f
}

// An inventory adjustment is a posting document that is corrected
// (inventory-adjust spec §3.4, §3.11): `add` takes `replaces`, and Books writes
// `replaced_by` on the one it replaces.
func TestInventoryAdjustmentsIsAPostingDocumentThatIsCorrected(t *testing.T) {
	doc := findDocument("inventory-adjustments")
	if doc == nil {
		t.Fatal("documents.json has no inventory-adjustments")
	}
	if !doc.hasDraft() || !doc.corrects() || doc.hasRevision() || doc.Scoped {
		t.Errorf("hasDraft = %v, corrects = %v, hasRevision = %v, scoped = %v; want a draft, a correction, no revision, no scope", doc.hasDraft(), doc.corrects(), doc.hasRevision(), doc.Scoped)
	}
	if f := doc.field("replaces"); f == nil || f.ReadOnly || f.Ref != "inventory-adjustments" {
		t.Errorf("replaces = %+v, want a writable ref to inventory-adjustments", f)
	}
	if f := doc.field("replaced_by"); f == nil || !f.ReadOnly || f.Ref != "inventory-adjustments" {
		t.Errorf("replaced_by = %+v, want a read-only ref to inventory-adjustments", f)
	}
	if journalEntries := findDocument("journal-entries"); !journalEntries.corrects() {
		t.Error("a journal entry has `replaces`: its edit still corrects")
	}
}

// `add --post` is one batch: the header as a draft of the kind manual, the
// lines, and the post, which states no revision
// (TestCLIInventory_ATokenAddsPostsAndVoidsAnAdjustment sends the same writes).
func TestInventoryAdjustmentAddAndPost(t *testing.T) {
	f := adjustments(t)
	_, _, err := runCmd(t, f.serve(), `{"date": "2026-09-05", "memo": "count", "lines": [{"product": "`+stockWidget+`", "quantity": 10, "value": 5000}, {"product": "`+stockWidget+`", "quantity": -2.5}]}`,
		"books", "inventory-adjustments", "add", "--input", "-", "--id", "cliadjust000001", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustments/records","body":{"date":"2026-09-05","id":"cliadjust000001","kind":"manual","memo":"count","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000001","position":0,"product":"` + stockWidget + `","quantity":10,"value":5000,"value_given":true}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000001","position":1,"product":"` + stockWidget + `","quantity":-2.5,"value_given":false}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/cliadjust000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
}

func TestInventoryAdjustmentEditOfADraftChangesItInPlace(t *testing.T) {
	f := adjustments(t)
	out, _, err := runCmd(t, f.serve(), `{"memo": "stock count"}`, "books", "inventory-adjustments", "edit", adjustDraft, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/` + adjustDraft + `","body":{"memo":"stock count"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"memo": "stock count"`) {
		t.Errorf("printed %s", out)
	}
}

// Books never changes a posted adjustment: the edit of one is a correction, as
// the app's Edit (inventory-adjust spec §3.4, Q3). One batch creates the new
// adjustment as a draft with `replaces`, with the posted one's lines (the bin
// too) under the caller's changes, and posts it; the server voids the replaced
// one (TestCLIBins_ACorrectionWithABinVoidsTheOriginal sends this batch shape,
// from `add` with `replaces`, to the real API).
func TestInventoryAdjustmentEditOfAPostedOneIsACorrection(t *testing.T) {
	f := adjustments(t)
	f.find("books_inventory_adjustment_lines", "lnjustposted001")["bin"] = binAisle
	fixedIDs(t, "cliadjust000002")
	_, errOut, err := runCmd(t, f.serve(), `{"memo": "recount"}`, "books", "inventory-adjustments", "edit", adjustPosted, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustments/records","body":{"account":"","date":"2026-09-05","id":"cliadjust000002","kind":"manual","memo":"recount","replaces":"` + adjustPosted + `","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000002","bin":"` + binAisle + `","position":0,"product":"` + stockWidget + `","quantity":10,"value":5000,"value_given":true}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/cliadjust000002","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(errOut, "corrected inventory adjustment") || !strings.Contains(errOut, "it is void") {
		t.Errorf("stderr %q does not say that the posted one is corrected", errOut)
	}
	cmd, _, findErr := newTestRoot(nil).Find([]string{"books", "inventory-adjustments", "edit"})
	if findErr != nil {
		t.Fatal(findErr)
	}
	if cmd.Flags().Lookup("id") == nil || !strings.Contains(cmd.Long, "replaces") {
		t.Errorf("the edit of a corrected type takes --id and names `replaces`:\n%s", cmd.Long)
	}
}

// A posted line of free stock (an increase whose value the writer gave as 0,
// spec §3.3 "the cost of the added quantity, 0 or more") keeps its stored
// value_given in the correction: Books copies the stored line, it does not work
// the flag out again from the value, or the server would take the last known
// cost for the 5 units (TestCLIBins_ACorrectionOfFreeStockKeepsItsValue sends
// this batch to the real API).
func TestInventoryAdjustmentCorrectionKeepsAFreeStockLine(t *testing.T) {
	f := adjustments(t)
	stored := f.find("books_inventory_adjustment_lines", "lnjustposted001")
	stored["quantity"] = json.Number("5")
	stored["value"] = json.Number("0")
	stored["value_given"] = true
	fixedIDs(t, "cliadjust000002")
	if _, _, err := runCmd(t, f.serve(), `{"memo":"recount"}`, "books", "inventory-adjustments", "edit", adjustPosted, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustments/records","body":{"account":"","date":"2026-09-05","id":"cliadjust000002","kind":"manual","memo":"recount","replaces":"` + adjustPosted + `","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000002","position":0,"product":"` + stockWidget + `","quantity":5,"value":0,"value_given":true}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/cliadjust000002","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction of a free-stock line:\n%s\nwant:\n%s", got, want)
	}
}

// `replaces` is create-only: `add` takes it, and `edit` refuses it before it
// sends anything, of a draft (which would PATCH it) and of a posted one (whose
// correction sets its own). The edit schema leaves it out; the add schema has it.
func TestInventoryAdjustmentEditRefusesReplaces(t *testing.T) {
	for _, id := range []string{adjustDraft, adjustPosted} {
		f := adjustments(t)
		_, _, err := runCmd(t, f.serve(), `{"replaces":"adjustother0001"}`, "books", "inventory-adjustments", "edit", id, "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), "replaces") || !strings.Contains(err.Error(), "add") {
			t.Errorf("edit %s with replaces: exit = %d, err = %v; want a usage refusal that says `add` takes replaces", id, got, err)
		}
		if len(f.requests) != 0 {
			t.Errorf("edit %s with replaces sent %v, want nothing", id, f.requests)
		}
	}
	props := func(command string) map[string]any {
		out, _, err := runCmd(t, nil, "", "books", "schema", "inventory-adjustments", command, "--json")
		if err != nil {
			t.Fatalf("schema %s: %v", command, err)
		}
		var spec specOut
		if err := json.Unmarshal([]byte(out), &spec); err != nil {
			t.Fatal(err)
		}
		return spec.Input["properties"].(map[string]any)
	}
	if _, ok := props("edit")["replaces"]; ok {
		t.Error("schema inventory-adjustments edit lists replaces, which only add takes")
	}
	if _, ok := props("add")["replaces"]; !ok {
		t.Error("schema inventory-adjustments add does not list replaces")
	}
}

func TestInventoryAdjustmentVoid(t *testing.T) {
	f := adjustments(t)
	if _, _, err := runCmd(t, f.serve(), "", "books", "inventory-adjustments", "void", adjustPosted, "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
	if got := sentJSON(f.lastPatch); got != `{"status":"void"}` {
		t.Errorf("sent %s", got)
	}
}

// The lines of a draft change in place: the stored row is updated, the new
// row is created, then the header. No write states a revision
// (TestCLIInventory_ATokenChangesTheLinesOfADraft sends the same writes).
func TestInventoryAdjustmentEditOfADraftChangesItsLines(t *testing.T) {
	f := adjustments(t)
	fixedIDs(t, "cliadjline00002")
	_, _, err := runCmd(t, f.serve(), `{"memo": "stock count", "lines": [{"product": "`+stockWidget+`", "quantity": 12, "value": 6000}, {"product": "`+stockWidget+`", "value": -300}]}`,
		"books", "inventory-adjustments", "edit", adjustDraft, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustment_lines/records/lnjustdraft0001","body":{"bin":null,"position":0,"product":"` + stockWidget + `","quantity":12,"value":6000,"value_given":true}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"` + adjustDraft + `","id":"cliadjline00002","position":1,"product":"` + stockWidget + `","value":-300,"value_given":false}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/` + adjustDraft + `","body":{"memo":"stock count"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
}

// The app stores `value_given: true` on a line whose Value change the user
// typed. A CLI edit PATCHes that stored line, so it must state value_given
// itself: the line help says that on an increase "0 or left out takes the last
// known cost", and the server values an increase at 0 when value_given is true
// (server/inventory_adjustments.go). After the edit and the post, the stored
// line is an increase whose value nobody gave.
func TestInventoryAdjustmentEditOfAnAppLineFollowsTheLineHelp(t *testing.T) {
	for name, line := range map[string]string{
		"value 0":       `{"product": "` + stockWidget + `", "quantity": 5, "value": 0}`,
		"value omitted": `{"product": "` + stockWidget + `", "quantity": 5}`,
	} {
		t.Run(name, func(t *testing.T) {
			f := adjustments(t)
			stored := f.find("books_inventory_adjustment_lines", "lnjustdraft0001")
			stored["quantity"] = json.Number("5")
			stored["value"] = json.Number("300")
			stored["value_given"] = true
			if _, _, err := runCmd(t, f.serve(), `{"lines": [`+line+`]}`,
				"books", "inventory-adjustments", "edit", adjustDraft, "--input", "-", "--json"); err != nil {
				t.Fatal(err)
			}
			if _, _, err := runCmd(t, f.serve(), "", "books", "inventory-adjustments", "post", adjustDraft, "--json"); err != nil {
				t.Fatal(err)
			}
			row := f.find("books_inventory_adjustment_lines", "lnjustdraft0001")
			if got, ok := row["value_given"].(bool); !ok || got {
				t.Errorf("the stored line has value_given = %v (%T), want false: the 5 units take the last known cost, as the line help says", row["value_given"], row["value_given"])
			}
			if got := f.find("books_inventory_adjustments", adjustDraft)["status"]; got != "posted" {
				t.Errorf("status = %v, want posted", got)
			}
		})
	}
}

// Books made the adjustments of the kinds opening and recost. `list` and
// `show` print them; a command that changes one sends nothing.
func TestInventoryAdjustmentOfBooksIsNotChanged(t *testing.T) {
	want := "inventory adjustment " + adjustOpening + ` has the kind "opening", not "manual": Books made it, and no command changes it`
	for _, args := range [][]string{
		{"edit", adjustOpening, "--input", "-"},
		{"post", adjustOpening},
		{"void", adjustOpening, "--yes"},
		{"delete", adjustOpening, "--yes"},
	} {
		f := adjustments(t)
		_, _, err := runCmd(t, f.serve(), `{"memo": "x"}`, append([]string{"books", "inventory-adjustments"}, args...)...)
		if got := exitcode.Of(err); got != exitcode.Refused || err == nil || err.Error() != want {
			t.Errorf("%s: exit = %d, err = %v\nwant %s", args[0], got, err, want)
		}
		if len(f.batches) != 0 || f.lastPatch != nil || len(f.deleted) != 0 {
			t.Errorf("%s: sent %v, %v, %v; want nothing", args[0], f.batches, f.lastPatch, f.deleted)
		}
	}
	f := adjustments(t)
	if out, _, err := runCmd(t, f.serve(), "", "books", "inventory-adjustments", "show", adjustOpening, "--json"); err != nil || !strings.Contains(out, `"kind": "opening"`) {
		t.Errorf("show printed %s, %v", out, err)
	}
}
