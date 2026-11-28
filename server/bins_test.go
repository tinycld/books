package books

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/offboard"
)

// Inventory-adjust spec §3.7, §3.8 and §4: the bin guard (a name unique without
// regard to case, no delete while anything names the bin) and the guard of a
// move between bins. A text both sides say is in testdata/bin_messages.json,
// which tests/bin-messages.test.ts reads too.

// loadBinMessages reads the shared texts, each with its %s slots.
func loadBinMessages(t testing.TB) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "bin_messages.json"))
	if err != nil {
		t.Fatalf("read the bin messages: %v", err)
	}
	var out map[string]string
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("parse the bin messages: %v", err)
	}
	return out
}

func binText(t testing.TB, key string, parts ...any) string {
	t.Helper()
	text, ok := loadBinMessages(t)[key]
	if !ok {
		t.Fatalf("bin_messages.json has no %q", key)
	}
	return fmt.Sprintf(text, parts...)
}

// The texts of the spec (§3.7, §3.8 and the plan's message list), so a changed
// word in the shared file fails here as well as in the TypeScript test.
func TestBinMessages_AreTheSpecTexts(t *testing.T) {
	want := map[string]string{
		"nameTaken": "A bin location named %s exists.",
		"inUse":     "%s has stock or history. Make it inactive instead.",
		"sameBins":  "Choose two different bin locations.",
		"holds":     "%s holds %s. Move %s or fewer.",
		"holdsNone": "%s holds none of this item.",
	}
	got := loadBinMessages(t)
	if len(got) != len(want) {
		t.Errorf("bin_messages.json has %d texts, want %d: %v", len(got), len(want), got)
	}
	for key, text := range want {
		if got[key] != text {
			t.Errorf("%s = %q, want %q", key, got[key], text)
		}
	}
	if s := binText(t, "holds", "Aisle 3", "12", "12"); s != "Aisle 3 holds 12. Move 12 or fewer." {
		t.Errorf("holds formats as %q", s)
	}
	if s := fmt.Sprintf(loadBinMessages(t)["holdsNone"], "Aisle 3"); s != "Aisle 3 holds none of this item." {
		t.Errorf("holdsNone formats as %q", s)
	}
}

// binEnv is a ledger with the inventory adjustment and bin guards and three
// bins (Back room inactive).
type binEnv struct {
	*stockEnv
	aisle, counter, backRoom *core.Record
	client                   *restClient
}

func newBinEnv(t *testing.T) *binEnv {
	t.Helper()
	se := newStockEnv(t)
	registerInventoryAdjustmentGuards(se.app)
	registerBinGuards(se.app)
	return &binEnv{
		stockEnv: se,
		aisle:    mkBin(t, se.app, "Aisle 3", false),
		counter:  mkBin(t, se.app, "Front counter", false),
		backRoom: mkBin(t, se.app, "Back room", true),
	}
}

// stockTheWidget brings 10 into No bin, then 12 into Aisle 3, by two receipts
// that name their bin.
func (e *binEnv) stockTheWidget(t testing.TB) {
	t.Helper()
	intoAisle := e.receipt("billaisle000001", "2026-07-02", 12, 1200)
	intoAisle.Bin = e.aisle.Id
	e.mustMoveStock(t, e.receipt("billnobin000001", "2026-07-01", 10, 1000), intoAisle)
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{"": 10, e.aisle.Id: 12}, "after the stock-in")
}

func (e *binEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if e.client == nil {
		e.client = newRestClient(t, e.app)
	}
	return e.client
}

// transferAnswer is what the API answered to a move between bins.
type transferAnswer struct {
	code    int
	id      string
	message string
	body    string
}

// postTransfer sends a move between bins as the bookkeeper's request.
func (e *binEnv) postTransfer(t testing.TB, fields map[string]any) transferAnswer {
	t.Helper()
	body, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	code, answer := e.rest(t).send(t, e.users.bookkeeper, http.MethodPost, "/api/collections/books_bin_transfers/records", string(body))
	var parsed struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal([]byte(answer), &parsed)
	return transferAnswer{code: code, id: parsed.ID, message: parsed.Message, body: answer}
}

// rawInsert writes one row with no hook and no validation, so a test can make
// one reference to a bin alone. Every value is bound.
func rawInsert(t testing.TB, app core.App, table string, row dbx.Params) {
	t.Helper()
	if _, err := app.DB().Insert(table, row).Execute(); err != nil {
		t.Fatalf("insert a %s row: %v", table, err)
	}
}

func TestBin_NameIsUniqueWithoutRegardToCase(t *testing.T) {
	e := newBinEnv(t)
	if got := reload(t, e.app, "books_bins", mkBin(t, e.app, "  Shelf C  ", false).Id).GetString("name"); got != "Shelf C" {
		t.Errorf("the bin is stored as %q, want the trimmed name", got)
	}
	_, err := saveNew(e.app, "books_bins", map[string]any{"name": "Aisle 3"})
	requireFieldRefusal(t, err, "name", binText(t, "nameTaken", "Aisle 3"))
	_, err = saveNew(e.app, "books_bins", map[string]any{"name": " aisle 3 "})
	requireFieldRefusal(t, err, "name", binText(t, "nameTaken", "aisle 3"))
	requireFieldRefusal(t, setFields(t, e.app, "books_bins", e.counter.Id, map[string]any{"name": "AISLE 3"}),
		"name", binText(t, "nameTaken", "AISLE 3"))
	if got := reload(t, e.app, "books_bins", e.counter.Id).GetString("name"); got != "Front counter" {
		t.Errorf("the refused rename left the name %q", got)
	}
	if err := setFields(t, e.app, "books_bins", e.aisle.Id, map[string]any{"name": "AISLE 3"}); err != nil {
		t.Errorf("a bin refuses a new case of its own name: %v", err)
	}
	if n, _ := e.app.CountRecords("books_bins"); n != 4 {
		t.Errorf("%d bins after the refusals, want 4", n)
	}
}

// Spec §3.7: delete is refused while anything names the bin. Each case makes
// one reference alone.
func TestBin_DeleteIsRefusedWhileAnythingNamesIt(t *testing.T) {
	cases := []struct {
		name string
		mk   func(t *testing.T, e *binEnv, bin string)
	}{
		{"a bin stock row", func(t *testing.T, e *binEnv, bin string) {
			rawInsert(t, e.app, "books_bin_stock", dbx.Params{"id": "bstkrawrow00001", "product": e.widget.Id, "bin": bin, "quantity": 3})
		}},
		{"a stock move", func(t *testing.T, e *binEnv, bin string) {
			rawInsert(t, e.app, stockMovesCollection, dbx.Params{
				"id": "smoverawrow0001", "product": e.widget.Id, "bin": bin, "kind": stockKindReceipt, "date": "2026-07-01",
				"seq": 1, "source": "books_bills", "document": "billrawrow00001", "quantity": 1, "currency": "USD",
			})
		}},
		{"an adjustment line", func(t *testing.T, e *binEnv, bin string) {
			draft := e.draftAdjustment(t, "2026-07-01")
			if _, err := saveNew(e.app, inventoryAdjustmentLinesCollection, map[string]any{
				"adjustment": draft.Id, "product": e.widget.Id, "quantity": 2, "value": 200, "position": 0, "bin": bin,
			}); err != nil {
				t.Fatalf("save an adjustment line in the bin: %v", err)
			}
		}},
		{"a move between bins from it", func(t *testing.T, e *binEnv, bin string) {
			rawInsert(t, e.app, "books_bin_transfers", dbx.Params{"id": "bxfrrawfrom0001", "product": e.widget.Id, "from_bin": bin, "to_bin": "", "quantity": 1})
		}},
		{"a move between bins to it", func(t *testing.T, e *binEnv, bin string) {
			rawInsert(t, e.app, "books_bin_transfers", dbx.Params{"id": "bxfrrawto000001", "product": e.widget.Id, "from_bin": "", "to_bin": bin, "quantity": 1})
		}},
		{"an item's default bin", func(t *testing.T, e *binEnv, bin string) {
			setDefaultBin(t, e.app, e.widget, bin)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := newBinEnv(t)
			tc.mk(t, e, e.aisle.Id)
			requireMessageOnlyRefusal(t, e.app.Delete(reload(t, e.app, "books_bins", e.aisle.Id)), binText(t, "inUse", "Aisle 3"))
			reload(t, e.app, "books_bins", e.aisle.Id)
		})
	}
	t.Run("a bin nothing names", func(t *testing.T) {
		e := newBinEnv(t)
		if err := e.app.Delete(reload(t, e.app, "books_bins", e.counter.Id)); err != nil {
			t.Fatalf("delete a bin nothing names: %v", err)
		}
		if _, err := e.app.FindRecordById("books_bins", e.counter.Id); err == nil {
			t.Error("the bin is still there after its delete")
		}
	})
}

// Spec §3.8: the server refuses a move between bins the dialog refuses, and
// the refusal changes nothing.
func TestBinTransfer_GuardRefusals(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	service := mkService(t, e.app, "Setup", e.revenue)
	before := binStockOf(t, e.app, e.widget.Id)
	cases := []struct {
		name   string
		fields map[string]any
		want   string // "" when the spec gives the refusal no text
	}{
		{"a Service product", map[string]any{"product": service.Id, "from_bin": "", "to_bin": e.aisle.Id, "quantity": 1},
			"Only an Inventory item has stock to move."},
		{"the same bin", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.aisle.Id, "quantity": 1},
			binText(t, "sameBins")},
		{"an inactive To bin", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.backRoom.Id, "quantity": 1},
			"Back room is inactive. Choose another bin location."},
		{"a bin that does not exist", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": "missing00000000", "quantity": 1}, ""},
		{"more than the From bin holds", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 13},
			binText(t, "holds", "Aisle 3", "12", "12")},
		{"a quantity of 0", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 0}, ""},
		{"a quantity with 3 decimals", map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 1.005}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := e.postTransfer(t, tc.fields)
			if got.code != http.StatusBadRequest {
				t.Fatalf("status %d (%s), want 400", got.code, got.body)
			}
			if tc.want != "" && got.message != tc.want {
				t.Errorf("message = %q, want %q", got.message, tc.want)
			}
			requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), before, "after the refusal")
			if n, _ := e.app.CountRecords("books_bin_transfers"); n != 0 {
				t.Errorf("%d moves between bins after the refusal, want none", n)
			}
		})
	}
}

// Spec §3.8: a move between bins changes the two bins' quantities and nothing
// else: no stock move, no journal entry, no quantity on hand or stock value.
func TestBinTransfer_MovesBetweenTwoBinsAndNothingElse(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	moves, _ := e.app.CountRecords(stockMovesCollection)
	entries, _ := e.app.CountRecords("books_journal_entries")
	stored := reload(t, e.app, "books_products", e.widget.Id)

	got := e.postTransfer(t, map[string]any{
		"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 5, "memo": "Counter stock",
	})
	if got.code != http.StatusOK {
		t.Fatalf("move 5 between bins: %d %s", got.code, got.body)
	}
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{"": 10, e.aisle.Id: 7, e.counter.Id: 5}, "after the move")
	if by := reload(t, e.app, "books_bin_transfers", got.id).GetString("created_by"); by != e.users.bookkeeper.Id {
		t.Errorf("created_by = %q, want the bookkeeper who sent it", by)
	}
	if n, _ := e.app.CountRecords(stockMovesCollection); n != moves {
		t.Errorf("%d stock moves after the move between bins, want %d", n, moves)
	}
	if n, _ := e.app.CountRecords("books_journal_entries"); n != entries {
		t.Errorf("%d journal entries after the move between bins, want %d", n, entries)
	}
	requireOnHand(t, e.app, e.widget, stored.GetFloat("quantity_on_hand"), stored.GetInt("stock_value"))
}

// Spec §4: the two bin stock rows change in the transaction of the move. The
// write of the To bin fails after the From bin's row is written: the From row
// is as it was and no move is stored.
func TestBinTransfer_BinStockCommitsWithTheMove(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	before := binStockOf(t, e.app, e.widget.Id)
	fromWritten, toReached := false, false
	failTheToBin := func(ev *core.RecordEvent) error {
		switch ev.Record.GetString("bin") {
		case e.aisle.Id:
			fromWritten = true
		case e.counter.Id:
			toReached = true
			return errors.New("the write of the To bin fails")
		}
		return ev.Next()
	}
	e.app.OnRecordCreate(binStockCollection).BindFunc(failTheToBin)
	e.app.OnRecordUpdate(binStockCollection).BindFunc(failTheToBin)
	got := e.postTransfer(t, map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 5})
	if got.code == http.StatusOK {
		t.Fatalf("the move was saved though the write of its To bin failed: %s", got.body)
	}
	if !toReached {
		t.Fatalf("the move failed before the write of its To bin (%d %s); the test needs one the guard accepts", got.code, got.body)
	}
	if !fromWritten {
		t.Fatal("the To bin was written before the From bin; the test needs the From row written first")
	}
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), before, "after the failed write")
	if n, _ := e.app.CountRecords(binTransfersCollection); n != 0 {
		t.Errorf("%d moves between bins after the failed write, want none", n)
	}
}

// Spec §8 lets a bin go below zero. A From bin that holds 0 or less refuses a
// move with holdsNone, not with "Move -3 or fewer". Front counter holds 0 after
// a receipt of 3 and a sale of 3, then -3 after another sale of 3.
func TestBinTransfer_AFromBinThatHoldsNoneIsRefused(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	inCounter := func(m stockMoveInput) stockMoveInput {
		m.Bin = e.counter.Id
		return m
	}
	e.mustMoveStock(t, inCounter(e.receipt("billcounter0001", "2026-07-03", 3, 300)),
		inCounter(e.sold("invcounter00001", "2026-07-04", 3)))
	refuse := func(t *testing.T, holds float64) {
		t.Helper()
		before := binStockOf(t, e.app, e.widget.Id)
		if got := before[e.counter.Id]; qtyHundredths(got) != qtyHundredths(holds) {
			t.Fatalf("Front counter holds %v, the case needs %v", got, holds)
		}
		got := e.postTransfer(t, map[string]any{"product": e.widget.Id, "from_bin": e.counter.Id, "to_bin": e.aisle.Id, "quantity": 1})
		if got.code != http.StatusBadRequest {
			t.Fatalf("status %d (%s), want 400", got.code, got.body)
		}
		// The holdsNone text of bin_messages.json, which TestBinMessages_AreTheSpecTexts pins.
		if want := "Front counter holds none of this item."; got.message != want {
			t.Errorf("message = %q, want %q", got.message, want)
		}
		requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id), before, "after the refusal")
		if n, _ := e.app.CountRecords(binTransfersCollection); n != 0 {
			t.Errorf("%d moves between bins after the refusal, want none", n)
		}
	}
	t.Run("a From bin at 0", func(t *testing.T) { refuse(t, 0) })
	e.mustMoveStock(t, inCounter(e.sold("invcounter00002", "2026-07-05", 3)))
	t.Run("a From bin at -3 after a sale", func(t *testing.T) { refuse(t, -3) })
}

// Inventory-adjust spec §4: offboarding with a successor reassigns a move
// between bins' created_by, as it does a purchase order's. The move has no
// update rule, so the offboard writes it by bound SQL; a move another user
// made keeps its stamp.
func TestOffboard_ReassignsBinTransferCreatedBy(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	offboard.ResetHandlersForTesting()
	offboard.ResetReassignableForTesting()
	t.Cleanup(offboard.ResetHandlersForTesting)
	t.Cleanup(offboard.ResetReassignableForTesting)
	registerOffboard()
	leaver, other := e.users.bookkeeper, e.users.admin
	successor := mkUser(t, e.app, "member")
	moved := func(user *core.Record, qty float64) string {
		t.Helper()
		body, err := json.Marshal(map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": qty})
		if err != nil {
			t.Fatal(err)
		}
		code, answer := e.rest(t).send(t, user, http.MethodPost, "/api/collections/books_bin_transfers/records", string(body))
		if code != http.StatusOK {
			t.Fatalf("move %v between bins: %d %s", qty, code, answer)
		}
		var parsed struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal([]byte(answer), &parsed); err != nil {
			t.Fatal(err)
		}
		return parsed.ID
	}
	leaversMove, othersMove := moved(leaver, 2), moved(other, 1)
	if by := reload(t, e.app, binTransfersCollection, leaversMove).GetString("created_by"); by != leaver.Id {
		t.Fatalf("the leaver's move has created_by %q before the offboard, want the leaver", by)
	}

	if _, err := offboard.OffboardUser(e.app, leaver.Id, offboard.Plan{Mode: offboard.ModeReassign, SuccessorUserID: successor.Id}, ""); err != nil {
		t.Fatalf("offboard: %v", err)
	}
	if by := reload(t, e.app, binTransfersCollection, leaversMove).GetString("created_by"); by != successor.Id {
		t.Errorf("the leaver's move between bins has created_by %q after the offboard, want the successor %q", by, successor.Id)
	}
	if by := reload(t, e.app, binTransfersCollection, othersMove).GetString("created_by"); by != other.Id {
		t.Errorf("another user's move between bins has created_by %q after the offboard, want %q kept", by, other.Id)
	}
}

// Spec §3.8: a move from No bin and a move to No bin both work.
func TestBinTransfer_NoBinIsABinOnEitherSide(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	if got := e.postTransfer(t, map[string]any{"product": e.widget.Id, "from_bin": "", "to_bin": e.counter.Id, "quantity": 4}); got.code != http.StatusOK {
		t.Fatalf("move 4 from No bin: %d %s", got.code, got.body)
	}
	if got := e.postTransfer(t, map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": "", "quantity": 2.5}); got.code != http.StatusOK {
		t.Fatalf("move 2.5 to No bin: %d %s", got.code, got.body)
	}
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{"": 8.5, e.aisle.Id: 9.5, e.counter.Id: 4}, "after the two moves")
	requireBinsAddUp(t, e.app, e.widget.Id)
}

// Spec §3.8: a move between bins cannot be edited or deleted (no update and no
// delete rule); a move back corrects it.
func TestBinTransfer_CannotBeEditedOrDeletedThroughTheAPI(t *testing.T) {
	e := newBinEnv(t)
	e.stockTheWidget(t)
	got := e.postTransfer(t, map[string]any{"product": e.widget.Id, "from_bin": e.aisle.Id, "to_bin": e.counter.Id, "quantity": 5})
	if got.code != http.StatusOK {
		t.Fatalf("move 5 between bins: %d %s", got.code, got.body)
	}
	url := "/api/collections/books_bin_transfers/records/" + got.id
	for _, user := range []*core.Record{e.users.bookkeeper, e.users.admin} {
		if code, body := e.rest(t).send(t, user, http.MethodPatch, url, `{"quantity": 1, "memo": "changed"}`); code != http.StatusForbidden {
			t.Errorf("an edit of the move answered %d %s, want 403", code, body)
		}
		if code, body := e.rest(t).send(t, user, http.MethodDelete, url, ""); code != http.StatusForbidden {
			t.Errorf("a delete of the move answered %d %s, want 403", code, body)
		}
	}
	kept := reload(t, e.app, "books_bin_transfers", got.id)
	if kept.GetFloat("quantity") != 5 || kept.GetString("memo") != "" {
		t.Errorf("the move holds %v and memo %q, want 5 and no memo", kept.GetFloat("quantity"), kept.GetString("memo"))
	}
	requireSameBinStock(t, binStockOf(t, e.app, e.widget.Id),
		map[string]float64{"": 10, e.aisle.Id: 7, e.counter.Id: 5}, "after the refused edit and delete")
}
