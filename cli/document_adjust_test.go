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

// An inventory adjustment is a posting document with no `replaces`: Books has
// no correction of one.
func TestInventoryAdjustmentsIsAPostingDocumentThatIsNotCorrected(t *testing.T) {
	doc := findDocument("inventory-adjustments")
	if doc == nil {
		t.Fatal("documents.json has no inventory-adjustments")
	}
	if !doc.hasDraft() || doc.corrects() || doc.hasRevision() || doc.Scoped {
		t.Errorf("hasDraft = %v, corrects = %v, hasRevision = %v, scoped = %v", doc.hasDraft(), doc.corrects(), doc.hasRevision(), doc.Scoped)
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
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000001","position":0,"product":"` + stockWidget + `","quantity":10,"value":5000}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"cliadjust000001","position":1,"product":"` + stockWidget + `","quantity":-2.5}},` +
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

// Books answers "not found" to the change of a posted adjustment. The command
// sends nothing and names the way: void it, then add a new one.
func TestInventoryAdjustmentEditOfAPostedOneIsRefused(t *testing.T) {
	f := adjustments(t)
	_, _, err := runCmd(t, f.serve(), `{"memo": "x"}`, "books", "inventory-adjustments", "edit", adjustPosted, "--input", "-")
	want := "inventory adjustment " + adjustPosted + " is posted: it cannot be changed; void it with `tinycld books inventory-adjustments void " + adjustPosted + "`, then add a new one with `tinycld books inventory-adjustments add`"
	if got := exitcode.Of(err); got != exitcode.Refused || err.Error() != want {
		t.Fatalf("exit = %d, err = %v\nwant %s", got, err, want)
	}
	if len(f.batches) != 0 {
		t.Errorf("batches = %v, want none", f.batches)
	}
	cmd, _, findErr := newTestRoot(nil).Find([]string{"books", "inventory-adjustments", "edit"})
	if findErr != nil {
		t.Fatal(findErr)
	}
	if cmd.Flags().Lookup("id") != nil || strings.Contains(cmd.Long, "replaces") {
		t.Errorf("the edit of a type that is not corrected has no --id and names no `replaces`:\n%s", cmd.Long)
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
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustment_lines/records/lnjustdraft0001","body":{"position":0,"product":"` + stockWidget + `","quantity":12,"value":6000}},` +
		`{"method":"POST","url":"/api/collections/books_inventory_adjustment_lines/records","body":{"adjustment":"` + adjustDraft + `","id":"cliadjline00002","position":1,"product":"` + stockWidget + `","value":-300}},` +
		`{"method":"PATCH","url":"/api/collections/books_inventory_adjustments/records/` + adjustDraft + `","body":{"memo":"stock count"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
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
