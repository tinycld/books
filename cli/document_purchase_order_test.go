package cli

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"tinycld.org/cli/exitcode"
)

// The purchase order commands (purchase-orders spec §3.13): the lifecycle
// order (open, then closed by Books or by an admin), with list, show, add,
// edit, delete, close, reopen and copy-to-bill. copy-to-bill is the engine's
// convert with the three keys word, lineLink and partial: one order makes
// many bills, and each bill line names its order line (po_line).

const (
	poOpenID   = "poopen000000001"
	poClosedID = "poclosed0000001"
	poItemLine = "poline000000001"
	poAcctLine = "poline000000002"
	poDoneLine = "poline000000003"
	poBillID   = "billfrompo00001"
	poBillDate = `"date": "2026-11-06", "due_date": "2026-12-06"`
	wantPOShut = "Purchase order 1002 is closed. Reopen it to copy it to a bill."
)

// ordered is the sales book with two purchase orders of Summit IT Services:
//
//	poopen000000001  open, number 1001, revision 2: a product line of 10
//	                 Widgets at 5.00 with 4 received (6 open, 30.00 open),
//	                 an account line of 300.00 on Software with 120.00 billed
//	                 (180.00 open), and an account line of 40.00 that is all
//	                 billed (not open)
//	poclosed0000001  closed by an admin, number 1002, revision 4: one account
//	                 line of 50.00, all open
func ordered(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_purchase_orders", poOpenID, map[string]any{
		"vendor": "vendsummit00001", "date": "2026-11-03", "status": "open", "number": "1001",
		"ship_to": "Harbor Lane Design LLC", "total": cents(39000), "open_amount": cents(21000), "revision": cents(2),
	})
	line := func(id, order string, position int, values map[string]any) {
		row := map[string]any{"purchase_order": order, "position": cents(position)}
		for k, v := range values {
			row[k] = v
		}
		f.addRow("books_purchase_order_lines", id, row)
	}
	line(poItemLine, poOpenID, 0, map[string]any{
		"kind": "item", "product": "prodwidget00001", "description": "Widgets", "quantity": cents(10), "rate": cents(500),
		"amount": cents(5000), "received": cents(4), "billed": cents(2000), "open_quantity": cents(6), "open_amount": cents(3000),
	})
	line(poAcctLine, poOpenID, 1, map[string]any{
		"kind": "account", "account": "acctsoftware001", "description": "Design tools", "amount": cents(30000),
		"billed": cents(12000), "open_amount": cents(18000),
	})
	line(poDoneLine, poOpenID, 2, map[string]any{
		"kind": "account", "account": "acctsoftware001", "description": "Icon set", "amount": cents(4000),
		"billed": cents(4000), "open_amount": cents(0),
	})
	f.addRow("books_purchase_orders", poClosedID, map[string]any{
		"vendor": "vendsummit00001", "date": "2026-11-04", "status": "closed", "closed_reason": "manual", "number": "1002",
		"total": cents(5000), "open_amount": cents(0), "revision": cents(4),
	})
	line("poline000000004", poClosedID, 0, map[string]any{
		"kind": "account", "account": "acctsoftware001", "description": "Support", "amount": cents(5000), "open_amount": cents(5000),
	})
	return f
}

// requireBody fails unless body holds every key of want with an equal value
// (compared as JSON), and none of the keys of absent.
func requireBody(t *testing.T, what string, body map[string]any, want map[string]any, absent ...string) {
	t.Helper()
	for k, v := range want {
		got, ok := body[k]
		if !ok || mustJSON(got) != mustJSON(v) {
			t.Errorf("%s: %s = %s (sent %v), want %s; body %s", what, k, mustJSON(got), ok, mustJSON(v), mustJSON(body))
		}
	}
	for _, k := range absent {
		if _, ok := body[k]; ok {
			t.Errorf("%s: sends %s; body %s", what, k, mustJSON(body))
		}
	}
}

// opsTo are the writes of batch that go to collection, in order.
func opsTo(batch []batchOp, method, collection string) []batchOp {
	var out []batchOp
	for _, op := range batch {
		if op.Method == method && strings.HasPrefix(op.URL, "/api/collections/"+collection+"/records") {
			out = append(out, op)
		}
	}
	return out
}

func TestPurchaseOrderHasTheOrderCommands(t *testing.T) {
	group, _, err := newTestRoot(nil).Find([]string{"books", "purchase-orders"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,close,copy-to-bill,delete,edit,list,reopen,show" {
		t.Errorf("purchase-orders commands = %s, want add,close,copy-to-bill,delete,edit,list,reopen,show", got)
	}
	if found, _, err := newTestRoot(nil).Find([]string{"books", "purchase-order", "show"}); err != nil || found.Name() != "show" {
		t.Errorf("the alias purchase-order: %v", err)
	}
	// estimates convert is unchanged: the word of a quote's convert stays convert.
	estimates, _, _ := newTestRoot(nil).Find([]string{"books", "estimates"})
	if got := strings.Join(subcommandNames(estimates), ","); got != "accept,add,convert,delete,edit,list,reject,reopen,show" {
		t.Errorf("estimates commands = %s", got)
	}
}

func TestPurchaseOrderListAndShow(t *testing.T) {
	f := ordered(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "purchase-orders", "list", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, poOpenID) || !strings.Contains(out, poClosedID) {
		t.Errorf("list does not print both orders:\n%s", out)
	}
	out, _, err = runCmd(t, f.serve(), "", "books", "purchase-orders", "show", poOpenID, "--json")
	if err != nil {
		t.Fatal(err)
	}
	var shown map[string]any
	if err := json.Unmarshal([]byte(out), &shown); err != nil {
		t.Fatalf("show printed no JSON object: %v\n%s", err, out)
	}
	if shown["status"] != "open" || shown["number"] != "1001" || mustJSON(shown["open_amount"]) != "21000" {
		t.Errorf("show header = status %v number %v open_amount %v", shown["status"], shown["number"], shown["open_amount"])
	}
	lines, _ := shown["lines"].([]any)
	if len(lines) != 3 {
		t.Fatalf("show prints %d lines, want 3:\n%s", len(lines), out)
	}
	first, _ := lines[0].(map[string]any)
	for k, want := range map[string]string{"id": `"` + poItemLine + `"`, "received": "4", "billed": "2000", "open_quantity": "6", "open_amount": "3000"} {
		if got := mustJSON(first[k]); got != want {
			t.Errorf("line 1 %s = %s, want %s", k, got, want)
		}
	}
	if _, ok := first["purchase_order"]; ok {
		t.Errorf("a printed line holds its parent purchase_order: %v", first)
	}
}

func TestPurchaseOrderAddIsOpenAtOnce(t *testing.T) {
	f := ordered(t)
	fixedIDs(t, "ponew0000000001")
	input := `{"vendor": "vendsummit00001", "date": "2026-11-05", "ship_to": "Harbor Lane Design LLC", "lines": [
		{"kind": "account", "account": "acctsoftware001", "description": "Design tools", "amount": 4500},
		{"kind": "item", "product": "prodwidget00001", "quantity": 4, "rate": 500}]}`
	_, errOut, err := runCmd(t, f.serve(), input, "books", "purchase-orders", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	batch := f.batches[0]
	headers := opsTo(batch, "POST", "books_purchase_orders")
	if len(headers) != 1 {
		t.Fatalf("the batch creates %d orders, want 1: %s", len(headers), sentBatch(t, f, 0))
	}
	requireBody(t, "the order", headers[0].Body, map[string]any{
		"id": "ponew0000000001", "vendor": "vendsummit00001", "date": "2026-11-05", "status": "open",
	}, "number", "total", "open_amount", "closed_reason")
	lines := opsTo(batch, "POST", "books_purchase_order_lines")
	if len(lines) != 2 {
		t.Fatalf("the batch creates %d lines, want 2: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "line 1", lines[0].Body, map[string]any{"purchase_order": "ponew0000000001", "position": 0, "kind": "account", "amount": 4500})
	requireBody(t, "line 2", lines[1].Body, map[string]any{"purchase_order": "ponew0000000001", "position": 1, "kind": "item", "quantity": 4, "rate": 500}, "amount")
	// An order never posts: no write sets a status after the create.
	if len(opsTo(batch, "PATCH", "books_purchase_orders")) != 0 {
		t.Errorf("add patches the order: %s", sentBatch(t, f, 0))
	}
	if !strings.Contains(errOut, "added purchase order") {
		t.Errorf("stderr = %q", errOut)
	}
}

// What Books keeps is not an input: the header's status, number, total, open
// amount and closed reason, and the lines' received, billed, open quantity and
// open amount. The CLI refuses them before it sends anything.
func TestPurchaseOrderReadOnlyFieldsAreRefusedAtTheCLI(t *testing.T) {
	f := ordered(t)
	for _, name := range []string{"status", "number", "total", "open_amount", "closed_reason"} {
		input := `{"vendor": "vendsummit00001", "date": "2026-11-05", "` + name + `": "x"}`
		_, _, err := runCmd(t, f.serve(), input, "books", "purchase-orders", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), `"`+name+`" is set by the server`) {
			t.Errorf("%s in an add: exit = %d, err = %v", name, got, err)
		}
	}
	for _, name := range []string{"received", "billed", "open_quantity", "open_amount"} {
		input := `{"vendor": "vendsummit00001", "date": "2026-11-05", "lines": [{"kind": "item", "product": "prodwidget00001", "quantity": 4, "rate": 500, "` + name + `": 1}]}`
		_, _, err := runCmd(t, f.serve(), input, "books", "purchase-orders", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), `lines[0]: "`+name+`" is set by the server`) {
			t.Errorf("%s on a line: exit = %d, err = %v", name, got, err)
		}
	}
	_, _, err := runCmd(t, f.serve(), `{"open_amount": 0}`, "books", "purchase-orders", "edit", poOpenID, "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), `"open_amount" is set by the server`) {
		t.Errorf("open_amount in an edit: exit = %d, err = %v", got, err)
	}
	if len(f.batches) != 0 || f.lastPatch != nil || f.lastCreate != nil {
		t.Errorf("a refused input was sent: %d batches, patch %v, create %v", len(f.batches), f.lastPatch, f.lastCreate)
	}
}

// An open order is changed in place, with the next revision.
func TestPurchaseOrderEditChangesAnOpenOrderInPlace(t *testing.T) {
	f := ordered(t)
	fixedIDs(t)
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Changed"}`, "books", "purchase-orders", "edit", poOpenID, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[{"method":"PATCH","url":"/api/collections/books_purchase_orders/records/` + poOpenID + `","body":{"memo":"Changed","revision":3}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if len(opsTo(f.batches[0], "POST", "books_purchase_orders")) != 0 {
		t.Errorf("edit of an open order makes a new order: %s", sentBatch(t, f, 0))
	}
}

func TestPurchaseOrderDelete(t *testing.T) {
	f := ordered(t)
	if _, _, err := runCmd(t, f.serve(), "", "books", "purchase-orders", "delete", poOpenID, "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(f.requests, "DELETE /api/collections/books_purchase_orders/records/"+poOpenID) {
		t.Errorf("delete sent %v, want a DELETE of the order", f.requests)
	}
}

// close sends status closed with the next revision; reopen sends status open.
// Books stamps the close and checks that the user is a Books admin.
func TestPurchaseOrderCloseAndReopen(t *testing.T) {
	f := ordered(t)
	_, errOut, err := runCmd(t, f.serve(), "", "books", "purchase-orders", "close", poOpenID, "--yes", "--json")
	if err != nil {
		t.Fatal(err)
	}
	requireBody(t, "close", f.lastPatch, map[string]any{"status": "closed", "revision": 3}, "closed_reason", "closed_by", "closed_at")
	if !strings.Contains(errOut, "closed purchase order 1001") {
		t.Errorf("close stderr = %q", errOut)
	}
	f.lastPatch = nil
	_, errOut, err = runCmd(t, f.serve(), "", "books", "purchase-orders", "reopen", poClosedID, "--json")
	if err != nil {
		t.Fatal(err)
	}
	// A closed order is not editable: the reopen states no revision
	// (server/cli_documents_test.go TestCLIDocuments_PurchaseOrderRoundTrip).
	requireBody(t, "reopen", f.lastPatch, map[string]any{"status": "open"}, "revision", "closed_reason", "closed_by", "closed_at")
	if !strings.Contains(errOut, "reopened purchase order 1002") {
		t.Errorf("reopen stderr = %q", errOut)
	}
}

// Without lines in --input, the bill takes every open line at its open
// quantity (a product line) or open amount (an account line), each naming its
// order line; a line with nothing open is left out. The bill names the order
// and bills its vendor. The order is not closed: one order makes many bills.
func TestPurchaseOrderCopyToBillTakesEveryOpenLine(t *testing.T) {
	f := ordered(t)
	fixedIDs(t, poBillID)
	out, errOut, err := runCmd(t, f.serve(), `{`+poBillDate+`}`, "books", "purchase-orders", "copy-to-bill", poOpenID, "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	batch := f.batches[0]
	bills := opsTo(batch, "POST", "books_bills")
	if len(bills) != 1 {
		t.Fatalf("the batch creates %d bills, want 1: %s", len(bills), sentBatch(t, f, 0))
	}
	requireBody(t, "the bill", bills[0].Body, map[string]any{
		"id": poBillID, "vendor": "vendsummit00001", "purchase_order": poOpenID, "status": "draft",
		"date": "2026-11-06", "due_date": "2026-12-06",
	})
	lines := opsTo(batch, "POST", "books_bill_lines")
	if len(lines) != 2 {
		t.Fatalf("the bill has %d lines, want the 2 open ones: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "bill line 1", lines[0].Body, map[string]any{
		"bill": poBillID, "position": 0, "kind": "item", "product": "prodwidget00001", "quantity": 6, "rate": 500, "po_line": poItemLine,
	}, "amount")
	requireBody(t, "bill line 2", lines[1].Body, map[string]any{
		"bill": poBillID, "position": 1, "kind": "account", "account": "acctsoftware001", "amount": 18000, "po_line": poAcctLine,
	})
	if strings.Contains(sentBatch(t, f, 0), poDoneLine) {
		t.Errorf("the bill takes the line with nothing open:\n%s", sentBatch(t, f, 0))
	}
	// Nothing is written to the order, and nothing posts.
	if n := len(opsTo(batch, "PATCH", "books_purchase_orders")) + len(opsTo(batch, "PATCH", "books_bills")); n != 0 {
		t.Errorf("copy-to-bill patches the order or posts the bill: %s", sentBatch(t, f, 0))
	}
	if !strings.Contains(out, `"purchase_order": "`+poOpenID+`"`) || !strings.Contains(out, `"po_line": "`+poItemLine+`"`) {
		t.Errorf("the printed bill:\n%s", out)
	}
	if !strings.Contains(errOut, "added bill "+poBillID) {
		t.Errorf("stderr = %q", errOut)
	}
	// The order stays open for the next bill.
	if f.find("books_purchase_orders", poOpenID)["status"] != "open" {
		t.Errorf("the order is %v after copy-to-bill, want open", f.find("books_purchase_orders", poOpenID)["status"])
	}
}

// --input is optional (spec §3.13 "[--input <file>]"): with none, the bill is
// dated today, takes every open line at its open quantity or open amount, and
// takes the vendor's terms with the due date they give, as Copy to bill in the
// app does (lib/bill-values.ts billValuesFromOrder: dueDateFor(today, terms)).
func TestPurchaseOrderCopyToBillWithNoInput(t *testing.T) {
	f := ordered(t)
	f.addRow("books_vendors", "vendsummit00001", map[string]any{"display_name": "Summit IT Services", "terms": "net_30"})
	fixedIDs(t, poBillID)
	before := time.Now()
	_, _, err := runCmd(t, f.serve(), "", "books", "purchase-orders", "copy-to-bill", poOpenID, "--json")
	after := time.Now()
	if err != nil {
		t.Fatalf("copy-to-bill with no --input: %v", err)
	}
	if len(f.batches) != 1 {
		t.Fatalf("copy-to-bill sent %d batches, want 1", len(f.batches))
	}
	bills := opsTo(f.batches[0], "POST", "books_bills")
	if len(bills) != 1 {
		t.Fatalf("the batch creates %d bills, want 1: %s", len(bills), sentBatch(t, f, 0))
	}
	body := bills[0].Body
	// The run may cross midnight: the day of its start or of its end.
	date, _ := body["date"].(string)
	var start time.Time
	switch date {
	case before.Format(time.DateOnly):
		start = before
	case after.Format(time.DateOnly):
		start = after
	default:
		t.Fatalf("the bill's date = %q, want today (%s)", date, before.Format(time.DateOnly))
	}
	requireBody(t, "the bill", body, map[string]any{
		"vendor": "vendsummit00001", "purchase_order": poOpenID, "status": "draft",
		"terms": "net_30", "due_date": start.AddDate(0, 0, 30).Format(time.DateOnly),
	})
	lines := opsTo(f.batches[0], "POST", "books_bill_lines")
	if len(lines) != 2 {
		t.Fatalf("the bill has %d lines, want the 2 open ones: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "bill line 1", lines[0].Body, map[string]any{
		"kind": "item", "product": "prodwidget00001", "quantity": 6, "rate": 500, "po_line": poItemLine,
	}, "amount")
	requireBody(t, "bill line 2", lines[1].Body, map[string]any{
		"kind": "account", "account": "acctsoftware001", "amount": 18000, "po_line": poAcctLine,
	})
}

// The bill takes the order's mailing address (convert.copy), as it takes the
// vendor.
func TestPurchaseOrderCopyToBillTakesTheOrderAddress(t *testing.T) {
	f := ordered(t)
	address := map[string]any{
		"line1": "12 Harbor Lane", "line2": "Suite 4", "city": "Portland",
		"region": "OR", "postal_code": "97201", "country": "US",
	}
	f.find("books_purchase_orders", poOpenID)["mailing_address"] = address
	fixedIDs(t, poBillID)
	if _, _, err := runCmd(t, f.serve(), `{`+poBillDate+`}`, "books", "purchase-orders", "copy-to-bill", poOpenID, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	bills := opsTo(f.batches[0], "POST", "books_bills")
	if len(bills) != 1 {
		t.Fatalf("the batch creates %d bills, want 1: %s", len(bills), sentBatch(t, f, 0))
	}
	requireBody(t, "the bill", bills[0].Body, map[string]any{"vendor": "vendsummit00001", "mailing_address": address})
}

// --input lines name order lines (po_line) with a quantity or an amount: the
// bill takes only those, with the product or account, description and rate of
// the order line.
func TestPurchaseOrderCopyToBillInPart(t *testing.T) {
	f := ordered(t)
	fixedIDs(t, poBillID)
	input := `{` + poBillDate + `, "ref_no": "S-90", "lines": [{"po_line": "` + poItemLine + `", "quantity": 4}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "purchase-orders", "copy-to-bill", poOpenID, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	batch := f.batches[0]
	requireBody(t, "the bill", opsTo(batch, "POST", "books_bills")[0].Body, map[string]any{"purchase_order": poOpenID, "ref_no": "S-90"})
	lines := opsTo(batch, "POST", "books_bill_lines")
	if len(lines) != 1 {
		t.Fatalf("the bill has %d lines, want the 1 the input names: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "the bill line", lines[0].Body, map[string]any{
		"kind": "item", "product": "prodwidget00001", "description": "Widgets", "quantity": 4, "rate": 500, "po_line": poItemLine,
	}, "amount")

	// An account line takes an amount.
	f = ordered(t)
	fixedIDs(t, poBillID)
	input = `{` + poBillDate + `, "lines": [{"po_line": "` + poAcctLine + `", "amount": 5000}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "purchase-orders", "copy-to-bill", poOpenID, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	lines = opsTo(f.batches[0], "POST", "books_bill_lines")
	if len(lines) != 1 {
		t.Fatalf("the bill has %d lines, want 1: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "the account bill line", lines[0].Body, map[string]any{
		"kind": "account", "account": "acctsoftware001", "amount": 5000, "po_line": poAcctLine,
	})
}

// --post posts the bill in the same batch.
func TestPurchaseOrderCopyToBillPosts(t *testing.T) {
	f := ordered(t)
	fixedIDs(t, poBillID)
	_, errOut, err := runCmd(t, f.serve(), `{`+poBillDate+`}`, "books", "purchase-orders", "copy-to-bill", poOpenID, "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	batch := f.batches[0]
	patches := opsTo(batch, "PATCH", "books_bills")
	if len(patches) != 1 || batch[len(batch)-1].Method != "PATCH" {
		t.Fatalf("the batch does not end with the bill's post: %s", sentBatch(t, f, 0))
	}
	requireBody(t, "the post", patches[0].Body, map[string]any{"status": "posted", "revision": 1})
	if !strings.Contains(errOut, "posted bill") {
		t.Errorf("stderr = %q", errOut)
	}
}

// A closed order makes no bill: the refusal is the server's text.
func TestPurchaseOrderCopyToBillOfAClosedOrder(t *testing.T) {
	f := ordered(t)
	fixedIDs(t, poBillID)
	f.refuse("POST", 400, `{"data":{},"message":"`+wantPOShut+`","status":400}`)
	_, _, err := runCmd(t, f.serve(), `{`+poBillDate+`}`, "books", "purchase-orders", "copy-to-bill", poClosedID, "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || err == nil || !strings.Contains(err.Error(), wantPOShut) {
		t.Errorf("copy-to-bill of a closed order: exit = %d, err = %v, want %d with %q", got, err, exitcode.Refused, wantPOShut)
	}
	if f.find("books_bills", poBillID) != nil {
		t.Error("a bill was stored from a closed order")
	}
}

// A bill line names its order line (po_line, a caller sets it); the bill's
// purchase_order is Books' (copy-to-bill sets it).
func TestBillsReadThePurchaseOrderLinks(t *testing.T) {
	bills := findDocument("bills")
	if f := bills.field("purchase_order"); f == nil || !f.ReadOnly || f.Type != typeID || f.Ref != "purchase-orders" {
		t.Errorf("bills purchase_order = %+v, want a read-only id of purchase-orders", f)
	}
	lines := bills.table("lines")
	if f := lines.asResource().field("po_line"); f == nil || f.ReadOnly || f.Type != typeID || f.Ref != rowRef("purchase-orders", "lines") {
		t.Errorf("bills lines po_line = %+v, want a writable id of purchase-orders.lines", f)
	}
	f := ordered(t)
	_, _, err := runCmd(t, f.serve(), `{"vendor": "vendsummit00001", "date": "2026-11-04", "due_date": "2026-12-04", "purchase_order": "`+poOpenID+`"}`,
		"books", "bills", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || err == nil || !strings.Contains(err.Error(), `"purchase_order" is set by the server`) {
		t.Errorf("purchase_order in a bills add: exit = %d, err = %v", got, err)
	}
}

// An edit of a posted bill made from an order is a correction that carries
// the links (spec §3.8 "the correction carries the links; the server moves
// them when it posts"): the header names the order (bills keep
// purchase_order), and each line its order line. Without the order on the
// header, the server refuses the lines (server/purchase_order_bills.go "Line 1
// names a line of another purchase order.").
func TestBillCorrectionKeepsThePurchaseOrderLinks(t *testing.T) {
	f := ordered(t)
	f.addRow("books_bills", poBillID, map[string]any{
		"vendor": "vendsummit00001", "date": "2026-11-06", "due_date": "2026-12-06", "status": "posted", "number": "1001",
		"purchase_order": poOpenID, "total": cents(32000), "revision": cents(1),
	})
	f.addRow("books_bill_lines", "billpoline00001", map[string]any{
		"bill": poBillID, "position": cents(0), "kind": "item", "product": "prodwidget00001",
		"quantity": cents(4), "rate": cents(500), "amount": cents(2000), "po_line": poItemLine,
	})
	f.addRow("books_bill_lines", "billpoline00002", map[string]any{
		"bill": poBillID, "position": cents(1), "kind": "account", "account": "acctsoftware001",
		"description": "Design tools", "amount": cents(30000), "po_line": poAcctLine,
	})
	fixedIDs(t, "billcorrect0001")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Corrected"}`, "books", "bills", "edit", poBillID, "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	batch := f.batches[0]
	bills := opsTo(batch, "POST", "books_bills")
	if len(bills) != 1 {
		t.Fatalf("the correction creates %d bills, want 1: %s", len(bills), sentBatch(t, f, 0))
	}
	requireBody(t, "the correction", bills[0].Body, map[string]any{
		"id": "billcorrect0001", "replaces": poBillID, "purchase_order": poOpenID, "vendor": "vendsummit00001",
	})
	lines := opsTo(batch, "POST", "books_bill_lines")
	if len(lines) != 2 {
		t.Fatalf("the correction has %d lines, want 2: %s", len(lines), sentBatch(t, f, 0))
	}
	requireBody(t, "correction line 1", lines[0].Body, map[string]any{"bill": "billcorrect0001", "po_line": poItemLine})
	requireBody(t, "correction line 2", lines[1].Body, map[string]any{"bill": "billcorrect0001", "po_line": poAcctLine})
}

// documentsWith is documents.json with change applied to the decoded file,
// encoded again.
func documentsWith(t *testing.T, change func(docs []map[string]any)) []byte {
	t.Helper()
	var file map[string]any
	if err := json.Unmarshal(documentsJSON, &file); err != nil {
		t.Fatal(err)
	}
	raw, _ := file["documents"].([]any)
	docs := make([]map[string]any, len(raw))
	for i, d := range raw {
		docs[i], _ = d.(map[string]any)
	}
	change(docs)
	out, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func docNamed(t *testing.T, docs []map[string]any, name string) map[string]any {
	t.Helper()
	for _, d := range docs {
		if d["name"] == name {
			return d
		}
	}
	t.Fatalf("documents.json has no document %q", name)
	return nil
}

// The convert rule's keys are named and checked at load: an unknown key, a
// partial convert with no lineLink, an order's convert that is not partial,
// and a convert of a lifecycle other than quote or order each fail with an
// error that names the mistake.
func TestLoadDocumentsChecksTheOrderConvertKeys(t *testing.T) {
	if _, err := loadDocuments(documentsWith(t, func([]map[string]any) {})); err != nil {
		t.Fatalf("documents.json encoded again does not load: %v", err)
	}
	convertOf := func(t *testing.T, docs []map[string]any) map[string]any {
		t.Helper()
		conv, ok := docNamed(t, docs, "purchase-orders")["convert"].(map[string]any)
		if !ok {
			t.Fatal("purchase-orders has no convert rule")
		}
		return conv
	}
	cases := []struct {
		name   string
		change func(t *testing.T, docs []map[string]any)
		want   []string
	}{
		{"the order's rule", func(t *testing.T, docs []map[string]any) {
			conv := convertOf(t, docs)
			if conv["word"] != "copy-to-bill" || conv["lineLink"] != "po_line" || conv["partial"] != true || conv["to"] != "bills" || conv["link"] != "purchase_order" {
				t.Errorf("purchase-orders convert = %v, want to bills, link purchase_order, word copy-to-bill, lineLink po_line, partial", conv)
			}
			docNamed(t, docs, "purchase-orders")["lifecycle"] = "order"
		}, nil},
		{"an unknown key", func(t *testing.T, docs []map[string]any) {
			convertOf(t, docs)["each"] = true
		}, []string{`"each"`}},
		{"partial with no lineLink", func(t *testing.T, docs []map[string]any) {
			delete(convertOf(t, docs), "lineLink")
		}, []string{"partial", "lineLink"}},
		{"an order's convert that is not partial", func(t *testing.T, docs []map[string]any) {
			delete(convertOf(t, docs), "partial")
		}, []string{"partial"}},
		{"a convert of a posting document", func(t *testing.T, docs []map[string]any) {
			docNamed(t, docs, "bills")["convert"] = map[string]any{"to": "invoices", "link": "estimate", "copy": []any{}}
		}, []string{`convert is only for a document with the lifecycle "quote" or "order"`}},
		{"a lifecycle that is no lifecycle", func(t *testing.T, docs []map[string]any) {
			docNamed(t, docs, "purchase-orders")["lifecycle"] = "standing"
		}, []string{`unknown lifecycle "standing"`}},
		{"a word that is a command of the group", func(t *testing.T, docs []map[string]any) {
			convertOf(t, docs)["word"] = "close"
		}, []string{"word", `"close"`}},
		{"a lineLink the bill line does not have", func(t *testing.T, docs []map[string]any) {
			convertOf(t, docs)["lineLink"] = "order_line"
		}, []string{"lineLink", `"order_line"`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := documentsWith(t, func(docs []map[string]any) { tc.change(t, docs) })
			_, err := loadDocuments(data)
			if tc.want == nil {
				if err != nil {
					t.Errorf("the order's rule does not load: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("loaded, want an error that says %q", tc.want)
			}
			for _, w := range tc.want {
				if !strings.Contains(err.Error(), w) {
					t.Errorf("err = %v, want one that says %q", err, w)
				}
			}
		})
	}
}

// The order commands' words are in the help topic, on the purchase-orders lines.
func TestHelpNamesThePurchaseOrderCommands(t *testing.T) {
	page := readDoc(t, helpPage)
	if !strings.Contains(page, "\n- `tinycld books purchase-orders`") {
		t.Error("the list of transaction types has no line for `tinycld books purchase-orders`")
	}
	code := codeText(page)
	for _, word := range []string{"close", "reopen", "copy-to-bill"} {
		if !strings.Contains(code, "tinycld books purchase-orders "+word) {
			t.Errorf("the help topic does not show `tinycld books purchase-orders %s`", word)
		}
	}
	// A line of code that shows copy-to-bill shows its --post, so a reader
	// finds the one-step bill.
	shownPost := false
	for _, line := range strings.Split(code, "\n") {
		if strings.Contains(line, "purchase-orders copy-to-bill") && strings.Contains(line, "--post") {
			shownPost = true
		}
	}
	if !shownPost {
		t.Error("the help topic shows no `tinycld books purchase-orders copy-to-bill … --post`")
	}
}
