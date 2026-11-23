package books

import (
	"maps"
	"net/http"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/subscriptions"

	"tinycld.org/core/changesignal"
)

// The books_reconciled_lines view (reconciliation report spec §4 Schema): one
// row for each cleared row of a finished reconciliation, with the journal
// line's position, the reconciliation's currency, the line's memo (else the
// entry's) and the payee. A reconciliation in progress, and one an undo
// returned to In progress, has no row; its second finish brings them back.

// rlRows are the view's rows of the reconciliation, by id.
func rlRows(t testing.TB, app core.App, reconciliation string) map[string]*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(reconciledLinesView, "reconciliation = {:r}", "", 0, 0,
		dbx.Params{"r": reconciliation})
	if err != nil {
		t.Fatalf("read %s: %v", reconciledLinesView, err)
	}
	out := map[string]*core.Record{}
	for _, row := range rows {
		out[row.Id] = row
	}
	return out
}

func TestReconciledLines_Rows(t *testing.T) {
	r := newRtEnv(t)
	customer := mkCustomer(t, r.app, "Harbor Cafe", "")
	vendor := mkVendor(t, r.app, "Summit Supply")
	fromCustomer := rvPosted(t, r.bankMatchEnv, "2026-09-05", "Entry memo",
		rvLine{account: r.savings, debit: 1000, memo: "Line memo", customer: customer},
		rvLine{account: r.revenue, credit: 1000})
	toVendor := rvPosted(t, r.bankMatchEnv, "2026-09-06", "Entry memo only",
		rvLine{account: r.rent, debit: 500}, rvLine{account: r.savings, credit: 500, vendor: vendor})
	nobody := rvPosted(t, r.bankMatchEnv, "2026-09-07", "Plain transfer",
		rvLine{account: r.savings, debit: 300}, rvLine{account: r.rent, credit: 300})
	lines := []*core.Record{
		lineOn(t, r.app, fromCustomer.Id, r.savings),
		lineOn(t, r.app, toVendor.Id, r.savings),
		lineOn(t, r.app, nobody.Id, r.savings),
	}

	id := r.mustStart(t, r.savings, "2026-09-30", 800)
	cleared := make([]string, len(lines))
	for i, l := range lines {
		cleared[i] = r.mustClear(t, id, l)
	}
	if got := rlRows(t, r.app, id); len(got) != 0 {
		t.Errorf("%d view rows of a reconciliation in progress, want 0", len(got))
	}

	r.mustFinish(t, id)

	currency := reload(t, r.app, rtRecons, id).GetString("currency")
	if currency == "" {
		t.Fatal("the finished reconciliation has no currency")
	}
	want := []map[string]any{
		{
			"reconciliation": id, "account": r.savings.Id, "entry": fromCustomer.Id, "date": "2026-09-05",
			"debit": 1000, "credit": 0, "position": 0, "currency": currency,
			"memo": "Line memo", "payee": "Harbor Cafe",
		},
		{
			"reconciliation": id, "account": r.savings.Id, "entry": toVendor.Id, "date": "2026-09-06",
			"debit": 0, "credit": 500, "position": 1, "currency": currency,
			"memo": "Entry memo only", "payee": "Summit Supply",
		},
		{
			"reconciliation": id, "account": r.savings.Id, "entry": nobody.Id, "date": "2026-09-07",
			"debit": 300, "credit": 0, "position": 0, "currency": currency,
			"memo": "Plain transfer", "payee": "",
		},
	}
	requireRows := func(t *testing.T, when string) {
		t.Helper()
		rows := rlRows(t, r.app, id)
		if got := slices.Sorted(maps.Keys(rows)); !slices.Equal(got, slices.Sorted(slices.Values(cleared))) {
			t.Fatalf("%s: view row ids = %v, want the cleared rows' ids %v", when, got, cleared)
		}
		for i, c := range cleared {
			row := rows[c]
			got := map[string]any{
				"reconciliation": row.GetString("reconciliation"), "account": row.GetString("account"),
				"entry": row.GetString("entry"), "date": row.GetString("date"),
				"debit": row.GetInt("debit"), "credit": row.GetInt("credit"), "position": row.GetInt("position"),
				"currency": row.GetString("currency"), "memo": row.GetString("memo"), "payee": row.GetString("payee"),
			}
			if !reflect.DeepEqual(got, want[i]) {
				t.Errorf("%s: row %d = %v, want %v", when, i, got, want[i])
			}
		}
	}
	t.Run("after the finish, one row for each cleared row", func(t *testing.T) { requireRows(t, "finished") })

	r.undo(t, r.users.admin, id).requireStatus(t, http.StatusOK)
	if got := rlRows(t, r.app, id); len(got) != 0 {
		t.Errorf("%d view rows after the undo, want 0", len(got))
	}

	r.mustFinish(t, id)
	t.Run("after the second finish, the rows are back", func(t *testing.T) { requireRows(t, "finished again") })
}

// Each column has the type the client and the report source read: the three
// ids stay relations, the day stays text (as books_reconciliation_lines.date),
// the amounts and the position are numbers, and the cast text columns are text.
func TestReconciledLines_ColumnTypes(t *testing.T) {
	if reconciledLinesView != "books_reconciled_lines" {
		t.Errorf("reconciledLinesView = %q, want books_reconciled_lines", reconciledLinesView)
	}
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(reconciledLinesView)
	if err != nil {
		t.Fatalf("the %s view does not exist: %v", reconciledLinesView, err)
	}
	if col.Type != core.CollectionTypeView {
		t.Fatalf("%s is a %s collection, want a view", reconciledLinesView, col.Type)
	}
	types := map[string]string{}
	for _, f := range col.Fields {
		types[f.GetName()] = f.Type()
	}
	want := map[string]string{
		"id":             core.FieldTypeText,
		"reconciliation": core.FieldTypeRelation,
		"account":        core.FieldTypeRelation,
		"entry":          core.FieldTypeRelation,
		"date":           core.FieldTypeText,
		"debit":          core.FieldTypeNumber,
		"credit":         core.FieldTypeNumber,
		"position":       core.FieldTypeNumber,
		"memo":           core.FieldTypeText,
		"payee":          core.FieldTypeText,
		"currency":       core.FieldTypeText,
	}
	if !reflect.DeepEqual(types, want) {
		t.Errorf("%s columns = %v, want %v", reconciledLinesView, types, want)
	}
	for rule, got := range map[string]*string{"create": col.CreateRule, "update": col.UpdateRule, "delete": col.DeleteRule} {
		if got != nil {
			t.Errorf("%s %s rule = %q, want nil (nobody writes the view)", reconciledLinesView, rule, *got)
		}
	}
}

// rlListener is a signed-in realtime client subscribed to one topic, as
// production attaches it (core changesignal's own tests listen the same way).
type rlListener struct {
	conn *subscriptions.ResumableConn
}

func rlListen(t *testing.T, app core.App, topic string, user *core.Record) *rlListener {
	t.Helper()
	client := subscriptions.NewResumableClient(subscriptions.ResumableOptions{})
	client.Set(apis.RealtimeClientAuthKey, user)
	client.Subscribe(topic)
	app.SubscriptionsBroker().Register(client)
	conn, ok := client.Attach(0)
	if !ok {
		t.Fatal("a new resumable client refused Attach(0)")
	}
	t.Cleanup(func() { app.SubscriptionsBroker().Unregister(client.Id()) })
	return &rlListener{conn: conn}
}

// drain discards what arrives within d: the signals of the writes before the
// one under test.
func (l *rlListener) drain(d time.Duration) {
	deadline := time.After(d)
	for {
		select {
		case <-l.conn.Channel():
		case <-deadline:
			return
		}
	}
}

func (l *rlListener) next(t *testing.T) subscriptions.Message {
	t.Helper()
	select {
	case msg := <-l.conn.Channel():
		return msg
	case <-time.After(5 * time.Second):
		t.Fatal("no message")
		return subscriptions.Message{}
	}
}

// The view is live through core's change signal over every collection its SQL
// reads, CheckViews accepts it on an app wired as production is, and a finish
// signals its topic.
func TestReconciledLines_IsLive(t *testing.T) {
	changesignal.ResetForTesting()
	app, _ := newRegisteredApp(t)
	changesignal.Register(app)
	env := ledgerEnvOn(t, app)
	savings := mkNumberedAccount(t, app, "Business Savings", "1010", "bank", "savings")
	entry := mkDraft(t, app, "2026-09-05", ln{savings, 1000, 0}, ln{env.revenue, 0, 1000})
	mustPost(t, app, entry.Id, env.users.bookkeeper.Id)
	line := lineOn(t, app, entry.Id, savings)
	recon := saveRecord(t, app, rtRecons, map[string]any{
		"account": savings.Id, "statement_date": "2026-09-30", "statement_balance": 1000, "status": reconcileInProgress,
	})
	saveRecord(t, app, rtCleared, map[string]any{"reconciliation": recon.Id, "line": line.Id})

	want := []string{
		"books_customers", "books_journal_entries", "books_journal_lines",
		"books_reconciliation_lines", "books_reconciliations", "books_vendors",
	}
	got, ok := changesignal.RegisteredViews()["books_reconciled_lines"]
	if !ok {
		t.Fatalf("Register did not register the books_reconciled_lines view; registered views: %v",
			slices.Sorted(maps.Keys(changesignal.RegisteredViews())))
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("registered sources of books_reconciled_lines = %v, want %v", got, want)
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}

	topic := changesignal.Topic("books_reconciled_lines")
	l := rlListen(t, app, topic, env.users.bookkeeper)
	l.drain(2*changesignal.Window + 200*time.Millisecond)
	finished := reload(t, app, rtRecons, recon.Id)
	finished.Set("status", reconcileFinished)
	if err := app.Save(finished); err != nil {
		t.Fatalf("finish: %v", err)
	}
	if msg := l.next(t); msg.Name != topic {
		t.Errorf("message %q after the finish, want %q", msg.Name, topic)
	}
}
