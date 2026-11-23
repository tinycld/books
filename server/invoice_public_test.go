package books

import (
	"fmt"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/changesignal"
)

// Email-share spec §3.5 and §4.3: every invoice has a server-set public token
// from its creation, and the books_invoice_public view shows a posted or void
// invoice to the holder of its token, with only the columns a customer reads.

const (
	invoicePublicURL     = "/api/collections/books_invoice_public/records"
	invoicePublicMemo    = "Privatememo invoice margin on the annex job"
	invoicePublicEmail   = "ap@harborview-dental.test"
	invoicePublicMessage = "Thank you for your business."
	invoicePublicStreet  = "41 Quarrybend Road"
	// A well-formed token no invoice has.
	invoicePublicUnknownToken = "nosuchinvoice000000000000000000000000000_-0"
)

// The columns of books_invoice_public (spec §4.3).
var invoicePublicColumns = []string{
	"balance", "business_email", "business_name", "business_phone", "credited", "currency",
	"customer_name", "date", "due_date", "id", "message", "number", "replaced_by_number",
	"replaced_by_token", "status", "token", "total", "written_off",
}

// invoicePublicEnv is the posting env with the settings row filled with the
// business name, email and phone, and Harborview Dental given an email.
type invoicePublicEnv struct {
	*postingEnv
}

func newInvoicePublicEnv(t *testing.T) *invoicePublicEnv {
	t.Helper()
	pe := newPostingEnv(t)
	if err := setFields(t, pe.app, "books_settings", settingsID, map[string]any{
		"business_name": publicBusinessName, "email": publicBusinessEmail, "phone": publicBusinessPhone,
	}); err != nil {
		t.Fatalf("fill the settings row: %v", err)
	}
	if err := setCustomer(t, pe.app, pe.customer.Id, map[string]any{"email": invoicePublicEmail}); err != nil {
		t.Fatalf("give Harborview Dental an email: %v", err)
	}
	return &invoicePublicEnv{postingEnv: pe}
}

// postedInvoice saves the every-kind invoice with a memo, a message, an email
// and a bill-to address, and posts it.
func (ip *invoicePublicEnv) postedInvoice(t testing.TB) *core.Record {
	t.Helper()
	inv := ip.everyKindInvoice(t, map[string]any{
		"memo": invoicePublicMemo, "message": invoicePublicMessage, "email": invoicePublicEmail,
		"bill_to": map[string]any{
			"line1": invoicePublicStreet, "line2": "", "city": "Lakewood",
			"region": "CO", "postal_code": "80226", "country": "USA",
		},
	})
	return mustPostInvoice(t, ip.app, inv.Id, ip.users.bookkeeper.Id)
}

func invoiceTokenOf(t testing.TB, app core.App, invoiceID string) string {
	t.Helper()
	return reload(t, app, "books_invoices", invoiceID).GetString("public_token")
}

func requireInvoiceToken(t testing.TB, what, token string) {
	t.Helper()
	if !publicTokenPattern.MatchString(token) {
		t.Errorf("%s public_token = %q, want 43 URL-safe characters", what, token)
	}
}

// Spec §3.5: a new invoice gets its token from the server in the create.
func TestInvoicePublic_ANewInvoiceGetsAToken(t *testing.T) {
	t.Run("a writer's REST create", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		body := fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04"}`, ie.customer.Id)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, ie.users.bookkeeper), body: body, want: http.StatusOK,
			content: []string{`"status":"draft"`},
			after: func(t testing.TB, app *tests.TestApp) {
				rows, err := app.FindAllRecords("books_invoices")
				if err != nil || len(rows) != 1 {
					t.Fatalf("%d invoices (err %v) after one create, want 1", len(rows), err)
				}
				requireInvoiceToken(t, "the created draft's", rows[0].GetString("public_token"))
			},
		}.run(t, ie.app)
	})
	t.Run("two invoices have different tokens", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		a := invoiceTokenOf(t, ie.app, ie.mkInvoice(t, nil).Id)
		b := invoiceTokenOf(t, ie.app, ie.mkInvoice(t, nil).Id)
		requireInvoiceToken(t, "invoice A's", a)
		requireInvoiceToken(t, "invoice B's", b)
		if a == b {
			t.Errorf("two invoices share the token %q", a)
		}
	})
}

// Spec §4.3: public_token is a server field; a create may not send one.
func TestInvoicePublic_ACreateCannotSetTheToken(t *testing.T) {
	t.Run("a Go save", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		_, err := newInvoice(ie.app, ie.customer, map[string]any{"public_token": invoicePublicUnknownToken})
		requireRefused(t, err, "Books sets these fields itself: public_token.")
		if n, _ := ie.app.CountRecords("books_invoices"); n != 0 {
			t.Errorf("%d invoices after a create that set public_token, want 0", n)
		}
	})
	t.Run("a writer's REST create", func(t *testing.T) {
		// The create rule (`public_token:isset = false`, migration 2100000010) refuses this before the Go guard runs, so the 400 cannot carry "Books sets these fields itself: public_token."; the Go save case asserts that text.
		ie := newInvoiceEnv(t)
		body := fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04","public_token":%q}`,
			ie.customer.Id, invoicePublicUnknownToken)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, ie.users.bookkeeper), body: body, want: http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_invoices"); n != 0 {
					t.Errorf("%d invoices after a REST create that set public_token, want 0", n)
				}
			},
		}.run(t, ie.app)
	})
}

// Spec §3.5: the token never changes: an update that sends another keeps the
// stored one, and posting, voiding and a correction keep each row's own token;
// the correction has a token of its own.
func TestInvoicePublic_WritesKeepTheToken(t *testing.T) {
	ip := newInvoicePublicEnv(t)
	draft := ip.everyKindInvoice(t, nil)
	stored := invoiceTokenOf(t, ip.app, draft.Id)
	requireInvoiceToken(t, "the draft's", stored)
	requireKept := func(t *testing.T, id, want, after string) {
		t.Helper()
		if got := invoiceTokenOf(t, ip.app, id); got != want {
			t.Errorf("public_token = %q after %s, want the stored %q", got, after, want)
		}
	}

	// Whether the guard refuses the field or puts the stored token back, the
	// stored token stays.
	_ = setFields(t, ip.app, "books_invoices", draft.Id, map[string]any{"public_token": invoicePublicUnknownToken})
	requireKept(t, draft.Id, stored, "an update that sent another token")

	mustPostInvoice(t, ip.app, draft.Id, ip.users.bookkeeper.Id)
	requireKept(t, draft.Id, stored, "the post")

	correction := ip.mkInvoice(t, map[string]any{"replaces": draft.Id, "memo": "Corrected"})
	mkInvoiceLine(t, ip.app, correction, 0, item(ip.service, 2, 45000, false))
	correctionToken := invoiceTokenOf(t, ip.app, correction.Id)
	requireInvoiceToken(t, "the correction's", correctionToken)
	if correctionToken == stored {
		t.Errorf("the correction has the original's token %q, want a new one", stored)
	}
	mustPostInvoice(t, ip.app, correction.Id, ip.users.bookkeeper.Id)
	if s := reload(t, ip.app, "books_invoices", draft.Id).GetString("status"); s != statusVoid {
		t.Fatalf("the original's status = %q after the correction's post, want void", s)
	}
	requireKept(t, draft.Id, stored, "the correction voided the original")
	requireKept(t, correction.Id, correctionToken, "the correction's post")

	other := ip.postedInvoice(t)
	otherToken := invoiceTokenOf(t, ip.app, other.Id)
	if err := voidInvoiceAs(ip.app, other.Id, ip.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	requireKept(t, other.Id, otherToken, "a void")
}

// Spec §4.3: the unique index refuses a second row with a stored token, also
// on a write that skips every hook.
func TestInvoicePublic_TheTokenIsUnique(t *testing.T) {
	ie := newInvoiceEnv(t)
	a := ie.mkInvoice(t, nil)
	tokenA := invoiceTokenOf(t, ie.app, a.Id)
	col, err := ie.app.FindCollectionByNameOrId("books_invoices")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(col.Indexes, func(index string) bool {
		return strings.Contains(index, "idx_books_invoices_public_token") && strings.Contains(strings.ToUpper(index), "UNIQUE")
	}) {
		t.Errorf("books_invoices indexes = %v, want the unique idx_books_invoices_public_token", col.Indexes)
	}
	insert := func(id, token string) error {
		_, err := ie.app.DB().NewQuery(
			"INSERT INTO books_invoices (id, customer, status, date, due_date, currency, public_token) " +
				"VALUES ({:id}, {:customer}, {:status}, {:date}, {:due}, {:currency}, {:token})",
		).Bind(dbx.Params{
			"id": id, "customer": ie.customer.Id, "status": statusDraft, "date": "2026-11-04",
			"due": "2026-12-04", "currency": "USD", "token": token,
		}).Execute()
		return err
	}
	// The control: an insert with a token of its own is taken, so the refusal
	// below is the index.
	fresh, err := newPublicToken()
	if err != nil {
		t.Fatal(err)
	}
	if err := insert("invoicesqlrow01", fresh); err != nil {
		t.Fatalf("an SQL insert with a fresh token: %v", err)
	}
	err = insert("invoicesqlrow02", tokenA)
	if err == nil || !strings.Contains(err.Error(), "UNIQUE") {
		t.Errorf("an SQL insert with A's token: %v, want a UNIQUE constraint refusal", err)
	}
}

// Spec §4.3: the view's columns are exactly the list; never memo, fields,
// form, bill_to, email, lines, tax, terms, the customer id or the entry.
func TestInvoicePublic_ViewColumns(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(invoicePublicCollection)
	if err != nil {
		t.Fatalf("the %s view does not exist: %v", invoicePublicCollection, err)
	}
	if col.Type != core.CollectionTypeView {
		t.Errorf("%s is a %s collection, want a view", invoicePublicCollection, col.Type)
	}
	names := make([]string, 0, len(col.Fields))
	for _, f := range col.Fields {
		names = append(names, f.GetName())
	}
	slices.Sort(names)
	if !reflect.DeepEqual(names, invoicePublicColumns) {
		t.Errorf("%s columns = %v, want exactly %v", invoicePublicCollection, names, invoicePublicColumns)
	}
}

// Spec §4.3: a draft has no row; a posted invoice shows its amounts, dates,
// message, customer and business; a void one shows void, and a replaced one
// names its replacement's token and number.
func TestInvoicePublic_ViewRows(t *testing.T) {
	ip := newInvoicePublicEnv(t)
	draft := ip.mkInvoice(t, nil)
	if _, err := ip.app.FindRecordById(invoicePublicCollection, draft.Id); err == nil {
		t.Errorf("the draft %s has a row in %s, want none", draft.Id, invoicePublicCollection)
	}

	posted := ip.postedInvoice(t)
	row, err := ip.app.FindRecordById(invoicePublicCollection, posted.Id)
	if err != nil {
		t.Fatalf("the posted invoice's row: %v", err)
	}
	for key, want := range map[string]string{
		"token":          invoiceTokenOf(t, ip.app, posted.Id),
		"number":         posted.GetString("number"),
		"status":         statusPosted,
		"date":           "2026-11-04",
		"due_date":       "2026-12-04",
		"message":        invoicePublicMessage,
		"customer_name":  "Harborview Dental",
		"currency":       "USD",
		"business_name":  publicBusinessName,
		"business_email": publicBusinessEmail,
		"business_phone": publicBusinessPhone,
	} {
		if got := row.GetString(key); got != want {
			t.Errorf("posted row %s = %q, want %q", key, got, want)
		}
	}
	if got := [2]int{row.GetInt("total"), row.GetInt("balance")}; got != [2]int{211177, 211177} {
		t.Errorf("posted row total, balance = %v, want 211177, 211177", got)
	}
	if got := [2]string{row.GetString("replaced_by_token"), row.GetString("replaced_by_number")}; got != [2]string{"", ""} {
		t.Errorf("posted row replaced_by_token, replaced_by_number = %q, want empty", got)
	}

	voided := ip.postedInvoice(t)
	if err := voidInvoiceAs(ip.app, voided.Id, ip.users.admin.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	voidRow, err := ip.app.FindRecordById(invoicePublicCollection, voided.Id)
	if err != nil {
		t.Fatalf("the void invoice's row: %v", err)
	}
	if got := voidRow.GetString("status"); got != statusVoid {
		t.Errorf("void row status = %q, want void", got)
	}
	if got := voidRow.GetString("replaced_by_token"); got != "" {
		t.Errorf("void row replaced_by_token = %q, want empty (not replaced)", got)
	}

	correction := ip.mkInvoice(t, map[string]any{"replaces": posted.Id, "memo": "Corrected"})
	mkInvoiceLine(t, ip.app, correction, 0, item(ip.service, 2, 45000, false))
	corrected := mustPostInvoice(t, ip.app, correction.Id, ip.users.bookkeeper.Id)
	replacedRow, err := ip.app.FindRecordById(invoicePublicCollection, posted.Id)
	if err != nil {
		t.Fatalf("the replaced invoice's row: %v", err)
	}
	if got, want := [3]string{replacedRow.GetString("status"), replacedRow.GetString("replaced_by_token"), replacedRow.GetString("replaced_by_number")},
		[3]string{statusVoid, invoiceTokenOf(t, ip.app, correction.Id), corrected.GetString("number")}; got != want {
		t.Errorf("replaced row status, replaced_by_token, replaced_by_number = %q, want %q", got, want)
	}
}

// Revise 1, item 3: the page says "Paid in full" only when payments cover the
// total, so the view carries what else lowered the balance: written_off (the
// invoice's posted write-offs) and credited (the sum of its credit memo
// applications, 0 with none).
func TestInvoicePublic_ViewRowsCarryWriteOffsAndCredits(t *testing.T) {
	me := newMemoApplyEnv(t)
	requireRow := func(t *testing.T, what string, inv *core.Record, want [3]int) {
		t.Helper()
		row, err := me.app.FindRecordById(invoicePublicCollection, inv.Id)
		if err != nil {
			t.Fatalf("the %s invoice's row: %v", what, err)
		}
		got := [3]int{row.GetInt("balance"), row.GetInt("written_off"), row.GetInt("credited")}
		if got != want {
			t.Errorf("%s row balance, written_off, credited = %v, want %v", what, got, want)
		}
		if raw := row.Get("credited"); raw == nil {
			t.Errorf("%s row has no credited column", what)
		}
	}

	open := me.invoice(t, me.customer, 40000)
	requireRow(t, "an open", open, [3]int{40000, 0, 0})

	paid := me.invoice(t, me.customer, 40000)
	me.wo.pay(t, paid, memoApplyDay, 40000)
	requireRow(t, "a paid", paid, [3]int{0, 0, 0})

	writtenOff := me.invoice(t, me.customer, 40000)
	me.wo.mkWriteOff(t, writtenOff, nil)
	requireRow(t, "a written-off", writtenOff, [3]int{0, 40000, 0})

	partCredited := me.invoice(t, me.customer, 40000)
	me.apply(t, me.postedMemo(t, me.customer, memoApplyCreditDay, 25000), partCredited, 25000, memoApplyDay)
	requireRow(t, "a part-credited", partCredited, [3]int{15000, 0, 25000})

	// Two applications add up; the rest is written off.
	creditedAndWrittenOff := me.invoice(t, me.customer, 40000)
	me.apply(t, me.postedMemo(t, me.customer, memoApplyCreditDay, 10000), creditedAndWrittenOff, 10000, memoApplyDay)
	me.apply(t, me.postedMemo(t, me.customer, memoApplyCreditDay, 12000), creditedAndWrittenOff, 12000, memoApplyDay)
	me.wo.mkWriteOff(t, creditedAndWrittenOff, map[string]any{"date": memoApplyDay})
	requireRow(t, "a credited and written-off", creditedAndWrittenOff, [3]int{0, 18000, 22000})
}

// Spec §4.3: the view lists a row only to the holder of its token, with only
// the view's columns; a filter on a private field finds nothing.
func TestInvoicePublic_ViewListsOnlyTheTokensRow(t *testing.T) {
	ip := newInvoicePublicEnv(t)
	posted := ip.postedInvoice(t)
	token := invoiceTokenOf(t, ip.app, posted.Id)
	wantKeys := append([]string{"collectionId", "collectionName"}, invoicePublicColumns...)
	slices.Sort(wantKeys)
	requireNoPrivate := func(t *testing.T, what string, res callResult) {
		t.Helper()
		for _, secret := range []string{invoicePublicMemo, invoicePublicEmail, invoicePublicStreet, ip.customer.Id} {
			if strings.Contains(res.body, secret) {
				t.Errorf("%s: the body holds %q: %s", what, secret, res.body)
			}
		}
	}
	serveCalls(t, ip.app, func(do func(apiReq) callResult) {
		if got := do(get(invoicePublicURL, "", "")).list(t); got.TotalItems != 0 || len(got.Items) != 0 {
			t.Errorf("no header: totalItems %d, %d items, want 0", got.TotalItems, len(got.Items))
		}
		if got := do(get(invoicePublicURL, invoicePublicUnknownToken, "")).list(t); got.TotalItems != 0 || len(got.Items) != 0 {
			t.Errorf("a token no invoice has: totalItems %d, %d items, want 0", got.TotalItems, len(got.Items))
		}

		res := do(get(invoicePublicURL, token, ""))
		got := res.list(t)
		if got.TotalItems != 1 || len(got.Items) != 1 {
			t.Fatalf("the right token: totalItems %d, %d items, want exactly one", got.TotalItems, len(got.Items))
		}
		if keys := keysOf(got.Items[0]); !reflect.DeepEqual(keys, wantKeys) {
			t.Errorf("row keys = %v, want exactly %v", keys, wantKeys)
		}
		if id := stringOf(t, got.Items[0], "id"); id != posted.Id {
			t.Errorf("row id = %q, want the invoice's %q", id, posted.Id)
		}
		requireNoPrivate(t, "the token's row", res)

		filtered := do(get(withQuery(invoicePublicURL, map[string]string{"filter": `memo~"x"`}), token, ""))
		switch filtered.status {
		case http.StatusOK:
			if got := filtered.list(t); got.TotalItems != 0 || len(got.Items) != 0 {
				t.Errorf("a memo filter: totalItems %d, %d items, want 0", got.TotalItems, len(got.Items))
			}
		case http.StatusBadRequest:
		default:
			t.Errorf("a memo filter: status %d, want 400 or an empty list; body: %.200s", filtered.status, filtered.body)
		}
		requireNoPrivate(t, "a memo filter", filtered)
	})
}

// Register declares the view's sources for change signals, and the view's SQL
// reads no table the declaration leaves out.
func TestInvoicePublic_ViewIsRegisteredForChangeSignals(t *testing.T) {
	t.Cleanup(changesignal.ResetForTesting)
	app, _ := newRegisteredApp(t)
	want := []string{"books_credit_memo_applications", "books_customers", "books_invoices", "books_settings"}
	if got := changesignal.RegisteredViews()[invoicePublicCollection]; !reflect.DeepEqual(got, want) {
		t.Errorf("%s sources = %v, want %v", invoicePublicCollection, got, want)
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}
}
