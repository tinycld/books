package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/security"

	"tinycld.org/core/offboard"
)

// The purchase order guards (spec §3.5, §3.6, §4): the purchase order is a kind
// of the shared document layer with the third lifecycle, order. It is open or
// closed, it never posts, and the server numbers it at the first save. Its
// lines are the bill's two tables.

// The refusal texts of the purchase order guards, as the client gets them
// (PocketBase adds a final period to a text that has none). Written out here,
// not read from the consts, so a change of wording fails this file too. The
// brief pins the texts of the closed order, the admin and the delete; the
// total, line-count and conflict texts follow the bill's and the estimate's.
const (
	wantPOTotalNegative  = "A purchase order total cannot be below zero."
	wantPOTooManyLines   = "A purchase order holds at most 250 lines."
	wantPOConflict       = "This purchase order changed after you opened it. Load it again, then review it before you save."
	wantPOClosedNoEdit   = "A closed purchase order cannot be edited."
	wantPOClosedLines    = "The lines of a closed purchase order cannot change."
	wantPOAdminOnly      = "Only a Books admin closes or reopens a purchase order."
	wantPOReceivedReopen = "A purchase order that closed because every line is received opens again from its bills."

	poDay        = "2026-11-03"
	poSequenceID = "booksseqpurchor"
)

func wantPOHasBills(number string) string {
	return "Purchase order " + number + " has bills. Close it instead."
}

// poEnv is the bill env's chart, vendors and products (billEnvOn) on an app
// with the ledger hooks, the purchase order guards and the generated
// books:purchase_order forms host bound, so the line guard reads its row kinds.
// A purchase order never posts: every test on it ends with no journal entry
// and no journal line.
type poEnv struct {
	*billEnv
	client *restClient
}

func newPOEnv(t *testing.T) *poEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, purchaseOrderKind)
	bindHostsByKey(t, env.app, purchaseOrderKind.HostKey)
	requireNoPostingAtEnd(t, env.app)
	return &poEnv{billEnv: billEnvOn(t, env)}
}

// rest builds the env's router on first use, for a test that sends many REST
// calls with Go checks between them. Do not mix it with apiReq on the same app.
func (pe *poEnv) rest(t testing.TB) *restClient {
	t.Helper()
	if pe.client == nil {
		pe.client = newRestClient(t, pe.app)
	}
	return pe.client
}

// requireNoPostingAtEnd fails the test when, at its end, the book holds any
// journal entry or journal line: spec §3.14, purchase orders never post, so no
// register line exists either.
func requireNoPostingAtEnd(t *testing.T, app core.App) {
	t.Helper()
	t.Cleanup(func() {
		for _, collection := range []string{"books_journal_entries", "books_journal_lines"} {
			n, err := app.CountRecords(collection)
			if err != nil || n != 0 {
				t.Errorf("%d %s (err %v) after purchase order writes, want 0: a purchase order never posts", n, collection, err)
			}
		}
	})
}

func poID() string {
	return security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
}

// newPO saves an open purchase order through the app, so every guard runs,
// with the fields given over a valid default, and returns what they said.
func newPO(app core.App, vendor *core.Record, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"vendor": vendor.Id, "status": "open", "date": poDay}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_purchase_orders", all)
}

func mkPO(t testing.TB, app core.App, vendor *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newPO(app, vendor, fields)
	if err != nil {
		t.Fatalf("save a purchase order for %s: %v", vendor.GetString("display_name"), err)
	}
	return r
}

// newPOLine saves one line of order at position through the app, so every
// guard, the restatement and the refresh run.
func newPOLine(app core.App, order *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"purchase_order": order.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_purchase_order_lines", all)
}

func mkPOLine(t testing.TB, app core.App, order *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newPOLine(app, order, position, fields)
	if err != nil {
		t.Fatalf("save purchase order line %d: %v", position+1, err)
	}
	return r
}

func requirePOCount(t testing.TB, app core.App, want int64) {
	t.Helper()
	if n, err := app.CountRecords("books_purchase_orders"); err != nil || n != want {
		t.Errorf("%d purchase orders stored (err %v), want %d", n, err, want)
	}
}

func requirePOLineCount(t testing.TB, app core.App, order *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_purchase_order_lines", dbx.HashExp{"purchase_order": order.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the purchase order, want %d", n, want)
	}
}

func poNextNumber(t testing.TB, app core.App) int {
	t.Helper()
	return reload(t, app, "books_doc_sequences", poSequenceID).GetInt("next_number")
}

// requirePOTotals checks the stored subtotal, total and open amount: an order
// has no tax, so subtotal and total are one figure.
func requirePOTotals(t testing.TB, app core.App, id string, total, open int) {
	t.Helper()
	r := reload(t, app, "books_purchase_orders", id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("total"), r.GetInt("open_amount")}; got != [3]int{total, total, open} {
		t.Errorf("subtotal/total/open_amount = %v, want %v", got, [3]int{total, total, open})
	}
}

// requirePOLineOpen checks a line's stored received, billed, open quantity
// and open amount.
func requirePOLineOpen(t testing.TB, app core.App, lineID string, received float64, billed int, openQty float64, openAmount int) {
	t.Helper()
	r := reload(t, app, "books_purchase_order_lines", lineID)
	if r.GetFloat("received") != received || r.GetInt("billed") != billed ||
		r.GetFloat("open_quantity") != openQty || r.GetInt("open_amount") != openAmount {
		t.Errorf("line received/billed/open_quantity/open_amount = %v/%d/%v/%d, want %v/%d/%v/%d",
			r.GetFloat("received"), r.GetInt("billed"), r.GetFloat("open_quantity"), r.GetInt("open_amount"),
			received, billed, openQty, openAmount)
	}
}

func requireOnPO(t testing.TB, app core.App, product *core.Record, want float64) {
	t.Helper()
	if got := reload(t, app, "books_products", product.Id).GetFloat("quantity_on_po"); got != want {
		t.Errorf("%s quantity_on_po = %v, want %v", product.GetString("name"), got, want)
	}
}

// requireCode fails the test when a REST call did not answer want.
func requireCode(t testing.TB, what string, code int, body string, want int) {
	t.Helper()
	if code != want {
		t.Fatalf("%s: status %d, want %d: %s", what, code, want, body)
	}
}

// poHeaderBody is the REST create body of an open order with id for vendor.
func poHeaderBody(id string, vendor *core.Record, extra string) string {
	return fmt.Sprintf(`{"id":%q,"vendor":%q,"status":"open","date":%q%s}`, id, vendor.Id, poDay, extra)
}

// oneOrder is an open order for Office Supply World with an account line of
// 180.00 on 6200 Software Subscriptions and a product line of 4 Wireless
// access points at 121.40: 180.00 + 485.60 = 665.60, all open.
func (pe *poEnv) oneOrder(t testing.TB) (order, account, item *core.Record) {
	t.Helper()
	order = mkPO(t, pe.app, pe.officeSupply, nil)
	account = mkPOLine(t, pe.app, order, 0, accountLine(pe.software, 18000))
	item = mkPOLine(t, pe.app, order, 1, productLine(pe.accessPoint, 4, 12140))
	requirePOTotals(t, pe.app, order.Id, 66560, 66560)
	return order, account, item
}

// Spec §3.5: the first save creates the order as Open with the next number of
// the purchase order sequence, in the same write; the creator is stamped from
// the request. A product line's amount is Qty x Rate, rounded by Books.
func TestPurchaseOrder_AWritersCreateTakesTheNextNumber(t *testing.T) {
	pe := newPOEnv(t)
	c := pe.rest(t)
	writer := pe.users.bookkeeper

	id, accountID, itemID := poID(), poID(), poID()
	code, body := c.send(t, writer, http.MethodPost, collectionURL("books_purchase_orders"), poHeaderBody(id, pe.officeSupply, ""))
	requireCode(t, "create the order", code, body, http.StatusOK)
	code, body = c.send(t, writer, http.MethodPost, collectionURL("books_purchase_order_lines"), fmt.Sprintf(
		`{"id":%q,"purchase_order":%q,"position":0,"kind":"account","account":%q,"amount":18000}`, accountID, id, pe.software.Id))
	requireCode(t, "add the account line", code, body, http.StatusOK)
	code, body = c.send(t, writer, http.MethodPost, collectionURL("books_purchase_order_lines"), fmt.Sprintf(
		`{"id":%q,"purchase_order":%q,"position":1,"kind":"item","product":%q,"quantity":2.5,"rate":1999}`, itemID, id, pe.accessPoint.Id))
	requireCode(t, "add the product line", code, body, http.StatusOK)

	stored := reload(t, pe.app, "books_purchase_orders", id)
	if stored.GetString("status") != "open" || stored.GetString("number") != "1001" || stored.GetInt("sequence") != 1001 {
		t.Errorf("status %q number %q sequence %d, want open, 1001, 1001",
			stored.GetString("status"), stored.GetString("number"), stored.GetInt("sequence"))
	}
	if got := stored.GetString("created_by"); got != writer.Id {
		t.Errorf("created_by = %q, want the writer %q", got, writer.Id)
	}
	if got := stored.GetString("closed_reason"); got != "" {
		t.Errorf("closed_reason = %q on a new order, want none", got)
	}
	// 2.5 x 19.99 = 49.975, stored as 49.98; 180.00 + 49.98 = 229.98.
	if got := reload(t, pe.app, "books_purchase_order_lines", itemID).GetInt("amount"); got != 4998 {
		t.Errorf("product line amount = %d, want 4998 (round(2.5 x 1999))", got)
	}
	requirePOTotals(t, pe.app, id, 22998, 22998)
	requirePOLineOpen(t, pe.app, itemID, 0, 0, 2.5, 4998)
	requirePOLineOpen(t, pe.app, accountID, 0, 0, 0, 18000)
	requireOnPO(t, pe.app, pe.accessPoint, 2.5)

	second := poID()
	code, body = c.send(t, writer, http.MethodPost, collectionURL("books_purchase_orders"), poHeaderBody(second, pe.summit, ""))
	requireCode(t, "create a second order", code, body, http.StatusOK)
	if got := reload(t, pe.app, "books_purchase_orders", second).GetString("number"); got != "1002" {
		t.Errorf("second order number = %q, want 1002", got)
	}
	if next := poNextNumber(t, pe.app); next != 1003 {
		t.Errorf("purchase order next_number = %d after two creates, want 1003", next)
	}
}

// The create rules pin the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestPurchaseOrder_ACreateThatSetsAServerFieldIsRefused(t *testing.T) {
	requireNoOrder := func(t testing.TB, app *tests.TestApp) {
		if n, _ := app.CountRecords("books_purchase_orders"); n != 0 {
			t.Errorf("%d purchase orders after a create that set a server field, want 0", n)
		}
		if next := poNextNumber(t, app); next != 1001 {
			t.Errorf("purchase order next_number = %d after a refused create, want 1001", next)
		}
	}

	t.Run("an order with no server field is created and numbered", func(t *testing.T) {
		pe := newPOEnv(t)
		apiReq{
			method: http.MethodPost, url: collectionURL("books_purchase_orders"),
			token: tokenFor(t, pe.users.bookkeeper), body: poHeaderBody(poID(), pe.officeSupply, ""),
			want: http.StatusOK, content: []string{`"number":"1001"`, `"status":"open"`},
		}.run(t, pe.app)
	})

	// A later key of a JSON object wins, so `"status":"closed"` after the
	// body's open is the status the request sends.
	for name, extra := range map[string]string{
		"number":         `,"number":"1001"`,
		"status: closed": `,"status":"closed"`,
		"open_amount":    `,"open_amount":100`,
	} {
		t.Run(name, func(t *testing.T) {
			pe := newPOEnv(t)
			body := poHeaderBody(poID(), pe.officeSupply, extra)
			apiReq{
				method: http.MethodPost, url: collectionURL("books_purchase_orders"),
				token: tokenFor(t, pe.users.bookkeeper), body: body, want: http.StatusBadRequest,
				after: requireNoOrder,
			}.run(t, pe.app)
		})
	}

	t.Run("a line's received", func(t *testing.T) {
		pe := newPOEnv(t)
		order := mkPO(t, pe.app, pe.officeSupply, nil)
		apiReq{
			method: http.MethodPost, url: collectionURL("books_purchase_order_lines"),
			token: tokenFor(t, pe.users.bookkeeper), want: http.StatusBadRequest,
			body: fmt.Sprintf(`{"purchase_order":%q,"position":0,"kind":"item","product":%q,"quantity":4,"rate":12140,"received":4}`,
				order.Id, pe.accessPoint.Id),
			after: func(t testing.TB, app *tests.TestApp) {
				requirePOLineCount(t, app, order, 0)
			},
		}.run(t, pe.app)
	})
}

func TestPurchaseOrder_AReaderCannotCreate(t *testing.T) {
	pe := newPOEnv(t)
	apiReq{
		method: http.MethodPost, url: collectionURL("books_purchase_orders"),
		token: tokenFor(t, pe.users.readOnly), body: poHeaderBody(poID(), pe.officeSupply, ""),
		want: http.StatusBadRequest,
		after: func(t testing.TB, app *tests.TestApp) {
			requirePOCount(t, app, 0)
			if next := poNextNumber(t, app); next != 1001 {
				t.Errorf("purchase order next_number = %d after a reader's create, want 1001", next)
			}
		},
	}.run(t, pe.app)
}

func TestPurchaseOrder_RefusesNoVendorAndNoDate(t *testing.T) {
	pe := newPOEnv(t)
	_, err := newPO(pe.app, pe.officeSupply, map[string]any{"vendor": ""})
	requireRefusedOnField(t, err, "vendor")
	_, err = newPO(pe.app, pe.officeSupply, map[string]any{"date": ""})
	requireRefusedOnField(t, err, "date")
	requirePOCount(t, pe.app, 0)
	if next := poNextNumber(t, pe.app); next != 1001 {
		t.Errorf("purchase order next_number = %d after refused creates, want 1001", next)
	}
}

func TestPurchaseOrder_RefusesATotalBelowZero(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	mkPOLine(t, pe.app, order, 0, accountLine(pe.designTools, 1000))

	_, err := newPOLine(pe.app, order, 1, accountLine(pe.designTools, -1001))
	requireRefusalText(t, err, wantPOTotalNegative)
	requirePOLineCount(t, pe.app, order, 1)
	requirePOTotals(t, pe.app, order.Id, 1000, 1000)
}

func TestPurchaseOrderLine_RefusesTheLine251st(t *testing.T) {
	env := newLedgerEnv(t)
	requireNoPostingAtEnd(t, env.app)
	be := billEnvOn(t, env)
	app := env.app
	// 249 lines written before the guards are bound, so the test does not wait
	// on 249 restatements; the guard counts what is stored.
	order := saveRecord(t, app, "books_purchase_orders", map[string]any{
		"vendor": be.officeSupply.Id, "status": "open", "date": poDay, "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		saveRecord(t, app, "books_purchase_order_lines", map[string]any{
			"purchase_order": order.Id, "kind": "account", "account": be.software.Id, "amount": 100, "position": i,
		})
	}
	registerSalesDocGuards(app, purchaseOrderKind)
	bindHostsByKey(t, app, purchaseOrderKind.HostKey)

	mkPOLine(t, app, order, 249, accountLine(be.software, 100))
	_, err := newPOLine(app, order, 250, accountLine(be.software, 100))
	requireRefusalText(t, err, wantPOTooManyLines)
	requirePOLineCount(t, app, order, 250)
}

// Spec §3.5: an inactive vendor, account or product is refused at save with
// the purchase texts, as on a bill's post.
func TestPurchaseOrder_RefusesAnInactiveVendorAccountOrProduct(t *testing.T) {
	pe := newPOEnv(t)

	_, err := newPO(pe.app, pe.pacificPower, nil)
	requireFieldRefusal(t, err, "vendor", wantVendorInactive("Pacific Power"))
	requirePOCount(t, pe.app, 0)

	order := mkPO(t, pe.app, pe.officeSupply, nil)
	_, err = newPOLine(pe.app, order, 0, accountLine(pe.pettyCash, 41286))
	requireRefusalText(t, err, wantAccountInactive(1, "Old Petty Cash"))
	_, err = newPOLine(pe.app, order, 0, productLine(pe.retired, 1, 5000))
	requireRefusalText(t, err, fmt.Sprintf(wantBillProductInactive, 1, "Old retainer"))
	requirePOLineCount(t, pe.app, order, 0)
	requirePOTotals(t, pe.app, order.Id, 0, 0)
}

// Spec §3.5: the order has a revision; a save that states a stale one is
// refused with the layer's notice. Each subtest has its own app: apiReq allows
// one call per app.
func TestPurchaseOrder_AStaleRevisionIsRefused(t *testing.T) {
	t.Run("a current save passes", func(t *testing.T) {
		pe := newPOEnv(t)
		order, _, _ := pe.oneOrder(t)
		saw := docRevision(t, pe.app, "books_purchase_orders", order.Id)
		patchDoc(t, pe.app, pe.users.bookkeeper, "books_purchase_orders", order.Id,
			fmt.Sprintf(`{"memo":"Rear dock","revision":%d}`, saw+1), http.StatusOK, `"memo":"Rear dock"`)
		if got := docRevision(t, pe.app, "books_purchase_orders", order.Id); got != saw+1 {
			t.Fatalf("revision = %d, want %d", got, saw+1)
		}
	})
	t.Run("a stale save is refused and changes nothing", func(t *testing.T) {
		pe := newPOEnv(t)
		order, _, _ := pe.oneOrder(t)
		saw := docRevision(t, pe.app, "books_purchase_orders", order.Id)
		// Another editor adds a line.
		mkPOLine(t, pe.app, order, 2, accountLine(pe.designTools, 500))
		patchDoc(t, pe.app, pe.users.bookkeeper, "books_purchase_orders", order.Id,
			fmt.Sprintf(`{"memo":"Rear dock","revision":%d}`, saw+1), http.StatusConflict, wantPOConflict)
		if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetString("memo"); got != "" {
			t.Fatalf("memo = %q after a stale save, want none", got)
		}
	})
}

// closePO closes order as user through REST, stating the revision the user
// saw, as the read view's Close does, and returns the answer.
func (pe *poEnv) closePO(t testing.TB, user *core.Record, orderID string) (int, string) {
	t.Helper()
	saw := docRevision(t, pe.app, "books_purchase_orders", orderID)
	return pe.rest(t).send(t, user, http.MethodPatch, collectionURL("books_purchase_orders")+"/"+orderID,
		fmt.Sprintf(`{"status":"closed","revision":%d}`, saw+1))
}

// reopenPO reopens order as user through REST. A closed order is not
// editable, so the call states no revision (as a void states none).
func (pe *poEnv) reopenPO(t testing.TB, user *core.Record, orderID string) (int, string) {
	t.Helper()
	return pe.rest(t).send(t, user, http.MethodPatch, collectionURL("books_purchase_orders")+"/"+orderID, `{"status":"open"}`)
}

// requireOpenOrder checks that order is open with no close stamp.
func requireOpenOrder(t testing.TB, app core.App, orderID string) {
	t.Helper()
	r := reload(t, app, "books_purchase_orders", orderID)
	if r.GetString("status") != "open" || r.GetString("closed_reason") != "" || r.GetString("closed_by") != "" ||
		!r.GetDateTime("closed_at").IsZero() {
		t.Errorf("status %q closed_reason %q closed_by %q closed_at %v, want open with no close stamp",
			r.GetString("status"), r.GetString("closed_reason"), r.GetString("closed_by"), r.GetDateTime("closed_at"))
	}
}

// Spec §3.6, §4: the update rule lets a writer change an order but not its
// status; only a Books admin closes. The refusal is the rule's (404) or the
// guard's admin text.
func TestPurchaseOrder_AWritersCloseIsRefused(t *testing.T) {
	pe := newPOEnv(t)
	order, _, _ := pe.oneOrder(t)
	code, body := pe.closePO(t, pe.users.bookkeeper, order.Id)
	if code != http.StatusNotFound && (code != http.StatusBadRequest || !strings.Contains(body, wantPOAdminOnly)) {
		t.Fatalf("a writer's Close answered %d %s, want 404 (the update rule) or 400 %q", code, body, wantPOAdminOnly)
	}
	requireOpenOrder(t, pe.app, order.Id)
	requirePOTotals(t, pe.app, order.Id, 66560, 66560)
}

// Spec §3.6 and driver ruling (d): an admin's Close stores closed, manual and
// the close stamp from the request; the header's open amount is 0 and the
// lines keep their open values as history. Reopen puts the order back.
func TestPurchaseOrder_AnAdminClosesAndReopens(t *testing.T) {
	pe := newPOEnv(t)
	order, account, item := pe.oneOrder(t)
	admin := pe.users.admin

	code, body := pe.closePO(t, admin, order.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)
	closed := reload(t, pe.app, "books_purchase_orders", order.Id)
	if closed.GetString("status") != "closed" || closed.GetString("closed_reason") != "manual" ||
		closed.GetString("closed_by") != admin.Id || closed.GetDateTime("closed_at").IsZero() {
		t.Errorf("status %q closed_reason %q closed_by %q closed_at %v, want closed, manual, the admin and a time",
			closed.GetString("status"), closed.GetString("closed_reason"), closed.GetString("closed_by"), closed.GetDateTime("closed_at"))
	}
	requirePOTotals(t, pe.app, order.Id, 66560, 0)
	requirePOLineOpen(t, pe.app, account.Id, 0, 0, 0, 18000)
	requirePOLineOpen(t, pe.app, item.Id, 0, 0, 4, 48560)

	code, body = pe.reopenPO(t, admin, order.Id)
	requireCode(t, "an admin's Reopen", code, body, http.StatusOK)
	requireOpenOrder(t, pe.app, order.Id)
	requirePOTotals(t, pe.app, order.Id, 66560, 66560)
	requirePOLineOpen(t, pe.app, item.Id, 0, 0, 4, 48560)
}

// Spec §4: writes are refused once the order is closed, the header's and the
// lines'.
func TestPurchaseOrder_AClosedOrderIsFrozen(t *testing.T) {
	pe := newPOEnv(t)
	order, account, item := pe.oneOrder(t)
	code, body := pe.closePO(t, pe.users.admin, order.Id)
	requireCode(t, "an admin's Close", code, body, http.StatusOK)

	err := setFields(t, pe.app, "books_purchase_orders", order.Id, map[string]any{"memo": "Changed after closing"})
	requireRefusalText(t, err, wantPOClosedNoEdit)
	err = setFields(t, pe.app, "books_purchase_order_lines", item.Id, map[string]any{"quantity": 5})
	requireRefusalText(t, err, wantPOClosedLines)
	_, err = newPOLine(pe.app, order, 2, accountLine(pe.designTools, 500))
	requireRefusalText(t, err, wantPOClosedLines)
	err = pe.app.Delete(reload(t, pe.app, "books_purchase_order_lines", account.Id))
	requireRefusalText(t, err, wantPOClosedLines)

	stored := reload(t, pe.app, "books_purchase_orders", order.Id)
	if stored.GetString("status") != "closed" || stored.GetString("memo") != "" {
		t.Errorf("status %q memo %q after the refusals, want closed and no memo", stored.GetString("status"), stored.GetString("memo"))
	}
	if got := reload(t, pe.app, "books_purchase_order_lines", item.Id).GetFloat("quantity"); got != 4 {
		t.Errorf("quantity = %v after the refusal, want 4", got)
	}
	requirePOLineCount(t, pe.app, order, 2)
	requirePOTotals(t, pe.app, order.Id, 66560, 0)
}

// Spec §3.6: an order that closed because every line is received has no
// Reopen; it opens again from its bills.
func TestPurchaseOrder_AReceivedOrderDoesNotReopen(t *testing.T) {
	pe := newPOEnv(t)
	order := mkPO(t, pe.app, pe.officeSupply, nil)
	item := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 2, 12140))
	bill := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1012")
	mkPOBillLine(t, pe.app, bill, 0, item, 2, 24280)
	refreshPO(t, pe.app, order.Id)
	if got := reload(t, pe.app, "books_purchase_orders", order.Id); got.GetString("status") != "closed" ||
		got.GetString("closed_reason") != "received" {
		t.Fatalf("status %q closed_reason %q after every line is received, want closed and received",
			got.GetString("status"), got.GetString("closed_reason"))
	}

	code, body := pe.reopenPO(t, pe.users.admin, order.Id)
	if code != http.StatusBadRequest || !strings.Contains(body, wantPOReceivedReopen) {
		t.Fatalf("an admin's Reopen of a received order answered %d %s, want 400 %q", code, body, wantPOReceivedReopen)
	}
	if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetString("status"); got != "closed" {
		t.Errorf("status = %q after the refused Reopen, want closed", got)
	}
}

// Spec §3.5: a writer deletes an order while no bill names it; its lines go
// with it.
func TestPurchaseOrder_AWriterDeletesAnOrderWithNoBill(t *testing.T) {
	pe := newPOEnv(t)
	order, _, _ := pe.oneOrder(t)
	apiReq{
		method: http.MethodDelete, url: collectionURL("books_purchase_orders") + "/" + order.Id,
		token: tokenFor(t, pe.users.bookkeeper), want: http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			requirePOCount(t, app, 0)
			requirePOLineCount(t, app, order, 0)
		},
	}.run(t, pe.app)
}

// Spec §3.5 (Q7): an order a bill names, draft or posted, cannot be deleted;
// the refusal names the order's number.
func TestPurchaseOrder_DeleteRefusedWhileABillNamesIt(t *testing.T) {
	for _, status := range []string{statusDraft, statusPosted} {
		t.Run("a "+status+" bill", func(t *testing.T) {
			pe := newPOEnv(t)
			order, _, item := pe.oneOrder(t)
			bill := mkPOBill(t, pe.app, pe.officeSupply, order, status, "")
			mkPOBillLine(t, pe.app, bill, 0, item, 1, 12140)
			refreshPO(t, pe.app, order.Id)

			err := pe.app.Delete(reload(t, pe.app, "books_purchase_orders", order.Id))
			requireRefusalText(t, err, wantPOHasBills("1001"))
			requirePOCount(t, pe.app, 1)
			requirePOLineCount(t, pe.app, order, 2)
		})
	}
}

// Spec §3.6: a closed order has no Delete, so its refusal is the closed text,
// also when a bill names it: "has bills. Close it instead." is advice that does
// not apply to an order that is closed already. The order closes by hand (a
// draft bill names it) or as received (a posted bill takes every line).
func TestPurchaseOrder_AClosedOrderWithABillIsRefusedWithTheClosedText(t *testing.T) {
	const wantPOClosedNoDelete = "A closed purchase order cannot be deleted."
	t.Run("closed by hand, a draft bill names it", func(t *testing.T) {
		pe := newPOEnv(t)
		order, _, item := pe.oneOrder(t)
		bill := mkPOBill(t, pe.app, pe.officeSupply, order, statusDraft, "")
		mkPOBillLine(t, pe.app, bill, 0, item, 1, 12140)
		refreshPO(t, pe.app, order.Id)
		code, body := pe.closePO(t, pe.users.admin, order.Id)
		requireCode(t, "an admin's Close", code, body, http.StatusOK)
		requirePOStatus(t, pe.app, order.Id, "closed", "manual")

		err := pe.app.Delete(reload(t, pe.app, "books_purchase_orders", order.Id))
		requireRefusalText(t, err, wantPOClosedNoDelete)
		requirePOCount(t, pe.app, 1)
		requirePOLineCount(t, pe.app, order, 2)
	})
	t.Run("closed as received, a posted bill names it", func(t *testing.T) {
		pe := newPOEnv(t)
		order := mkPO(t, pe.app, pe.officeSupply, nil)
		item := mkPOLine(t, pe.app, order, 0, productLine(pe.accessPoint, 2, 12140))
		bill := mkPOBill(t, pe.app, pe.officeSupply, order, statusPosted, "1012")
		mkPOBillLine(t, pe.app, bill, 0, item, 2, 24280)
		refreshPO(t, pe.app, order.Id)
		requirePOStatus(t, pe.app, order.Id, "closed", "received")

		err := pe.app.Delete(reload(t, pe.app, "books_purchase_orders", order.Id))
		requireRefusalText(t, err, wantPOClosedNoDelete)
		requirePOCount(t, pe.app, 1)
		requirePOLineCount(t, pe.app, order, 1)
	})
}

// Spec §3.3: Ship to holds at most 5 lines. The server refuses a sixth line,
// at create and at edit, with the client's text (SHIP_TO_MESSAGES.tooManyLines
// of lib/ship-to.ts; PocketBase adds the final period), and a 5-line Ship to
// saves. \n, \r\n and \r each end a line, as the client counts them.
func TestPurchaseOrder_ShipToHoldsAtMostFiveLines(t *testing.T) {
	const wantPOShipToLines = "Ship to can be at most 5 lines."
	pe := newPOEnv(t)
	five := "Harbor Freight dock\nAttn: Receiving\n1200 Pier Way\r\nUnit 4\rSeattle, WA 98101"

	order := mkPO(t, pe.app, pe.officeSupply, map[string]any{"ship_to": five})
	if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetString("ship_to"); got != five {
		t.Fatalf("ship_to = %q, want the 5 lines as sent", got)
	}

	for name, six := range map[string]string{
		"a sixth line after \\n":    five + "\nUSA",
		"a sixth line after \\r\\n": five + "\r\nUSA",
		"a sixth line after \\r":    five + "\rUSA",
	} {
		t.Run("create with "+name, func(t *testing.T) {
			_, err := newPO(pe.app, pe.officeSupply, map[string]any{"ship_to": six})
			requireRefusalText(t, err, wantPOShipToLines)
			requirePOCount(t, pe.app, 1)
		})
		t.Run("edit to "+name, func(t *testing.T) {
			err := setFields(t, pe.app, "books_purchase_orders", order.Id, map[string]any{"ship_to": six})
			requireRefusalText(t, err, wantPOShipToLines)
			if got := reload(t, pe.app, "books_purchase_orders", order.Id).GetString("ship_to"); got != five {
				t.Errorf("ship_to = %q after the refused edit, want the 5 lines", got)
			}
		})
	}
}

// Spec §3.14: a vendor on a purchase order cannot be deleted.
func TestVendor_DeleteRefusedWhileOnPurchaseOrders(t *testing.T) {
	pe := newPOEnv(t)
	mkPO(t, pe.app, pe.officeSupply, nil)
	requireMessageOnlyRefusal(t, pe.app.Delete(reload(t, pe.app, "books_vendors", pe.officeSupply.Id)),
		"Office Supply World is on purchase orders. Make it inactive instead.")
	reload(t, pe.app, "books_vendors", pe.officeSupply.Id)
}

// Spec §3.14: a product on a purchase order line cannot be deleted
// (productReferences); the count is of orders, not of lines.
func TestProduct_DeleteRefusedWhileOnPurchaseOrderLines(t *testing.T) {
	pe := newPOEnv(t)
	deleteCable := func() error {
		return pe.app.Delete(reload(t, pe.app, "books_products", pe.patchCable.Id))
	}
	first := mkPO(t, pe.app, pe.officeSupply, nil)
	mkPOLine(t, pe.app, first, 0, productLine(pe.patchCable, 40, 310))
	mkPOLine(t, pe.app, first, 1, productLine(pe.patchCable, 10, 310))
	requireMessageOnlyRefusal(t, deleteCable(), "This product or service is on 1 purchase order. Make it inactive instead.")

	second := mkPO(t, pe.app, pe.summit, nil)
	mkPOLine(t, pe.app, second, 0, productLine(pe.patchCable, 12, 310))
	requireMessageOnlyRefusal(t, deleteCable(), "This product or service is on 2 purchase orders. Make it inactive instead.")
	reload(t, pe.app, "books_products", pe.patchCable.Id)
}

// Spec §3.14: an account on a purchase order's account line cannot be
// deleted; the count is of orders, not of lines.
func TestAccount_DeleteRefusedWhileOnPurchaseOrderLines(t *testing.T) {
	pe := newPOEnv(t)
	utilities := mkNumberedAccount(t, pe.app, "Utilities", "6300", "expense", "utilities")
	deleteUtilities := func() error {
		return pe.app.Delete(reload(t, pe.app, "books_accounts", utilities.Id))
	}
	first := mkPO(t, pe.app, pe.officeSupply, nil)
	mkPOLine(t, pe.app, first, 0, accountLine(utilities, 8000))
	mkPOLine(t, pe.app, first, 1, accountLine(utilities, 2500))
	requireMessageOnlyRefusal(t, deleteUtilities(),
		"This account is on 1 purchase order and cannot be deleted. Make it inactive instead.")

	second := mkPO(t, pe.app, pe.summit, nil)
	mkPOLine(t, pe.app, second, 0, accountLine(utilities, 1500))
	requireMessageOnlyRefusal(t, deleteUtilities(),
		"This account is on 2 purchase orders and cannot be deleted. Make it inactive instead.")
	reload(t, pe.app, "books_accounts", utilities.Id)
}

// Spec §3.14: offboarding with a successor reassigns an order's created_by
// and closed_by. The stamps are written by SQL: Close stamps closed_by from a
// request, and this test is about the offboard, not the Close.
func TestOffboard_ReassignsPurchaseOrderStamps(t *testing.T) {
	t.Cleanup(offboard.ResetReassignableForTesting)
	app, _ := newRegisteredApp(t)
	c := newOffboardCase(t, app, mkUser(t, app, "member"), mkUser(t, app, "member"))
	vendor := mkVendor(t, app, "Office Supply World")
	order := mkPO(t, app, vendor, nil)
	if _, err := app.DB().NewQuery("UPDATE books_purchase_orders SET created_by = {:u}, closed_by = {:u} WHERE id = {:id}").
		Bind(dbx.Params{"u": c.leaver.Id, "id": order.Id}).Execute(); err != nil {
		t.Fatalf("stamp the order with the leaver: %v", err)
	}

	if _, err := offboard.OffboardUser(app, c.leaver.Id, offboard.Plan{Mode: offboard.ModeReassign, SuccessorUserID: c.stayer.Id}, ""); err != nil {
		t.Fatalf("offboard: %v", err)
	}
	after := reload(t, app, "books_purchase_orders", order.Id)
	if after.GetString("created_by") != c.stayer.Id || after.GetString("closed_by") != c.stayer.Id {
		t.Errorf("created_by %q closed_by %q after the offboard, want the successor %q in both",
			after.GetString("created_by"), after.GetString("closed_by"), c.stayer.Id)
	}
}
