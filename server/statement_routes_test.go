package books

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/mailer"
	"tinycld.org/core/oauth"
	"tinycld.org/core/ratelimit"
	"tinycld.org/core/reports"
)

// The statement routes (spec §3.5, §3.6, §4.4): the saved statement's PDF at
// the document PDF route, the preview and the send. Every test runs on an app
// wired by Register with the e2e capture log on, and reads the messages back
// from that log.

const (
	srDay        = "2026-11-20"
	srBusiness   = "Cedar Ledger Co"
	srPhone      = "+1 214 555 1234"
	srAddress    = "billing@aspenridge.example"
	srPreviewURL = "/api/books/statements/preview"
	srSendURL    = "/api/books/statements/send"
)

type srEnv struct {
	app          *tests.TestApp
	pb           *pocketbase.PocketBase
	pe           *paymentEnv
	ar           arBook
	users        levelUsers
	aspen, birch *core.Record
	logPath      string
}

// newSREnv is a registered app with the invoice host bound, the payment book's
// accounts and users, the business named with a phone, and two customers
// with one posted invoice each: Aspen Ridge Landscaping (500.00, due
// 2026-10-31) and Birch Hollow Dental (300.00, due 2026-11-04).
func newSREnv(t *testing.T) *srEnv {
	t.Helper()
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	logPath := filepath.Join(t.TempDir(), "email.jsonl")
	t.Setenv("TINYCLD_EMAIL_LOG", logPath)
	app, pb := newRegisteredApp(t)
	bindInvoiceHost(t, app)
	pe := paymentEnvOn(t, app)
	env := &srEnv{
		app: app, pb: pb, pe: pe, users: pe.users, logPath: logPath,
		ar: arBook{
			app: app, reader: pe.users.readOnly, none: pe.users.none,
			receivable: pe.receivable, income: pe.revenue, docs: pe,
		},
	}
	env.setBusiness(t, srBusiness, srPhone)
	env.aspen = mkCustomer(t, app, "Aspen Ridge Landscaping", "")
	arInvoice(t, env.ar, env.aspen, "2026-10-01", "2026-10-31", 50000)
	env.birch = mkCustomer(t, app, "Birch Hollow Dental", "")
	arInvoice(t, env.ar, env.birch, "2026-10-05", "2026-11-04", 30000)
	return env
}

func (env *srEnv) setBusiness(t *testing.T, name, phone string) {
	t.Helper()
	s := reload(t, env.app, "books_settings", settingsID)
	s.Set("business_name", name)
	s.Set("phone", phone)
	if err := env.app.Save(s); err != nil {
		t.Fatalf("save the business name and phone: %v", err)
	}
}

// statement saves an Open items statement of customer on srDay through the
// registered create guard.
func (env *srEnv) statement(t *testing.T, customer *core.Record) *core.Record {
	t.Helper()
	r, err := saveNew(env.app, statementsCollection, map[string]any{
		"customer": customer.Id, "type": statementTypeOpenItems, "statement_date": srDay,
	})
	if err != nil {
		t.Fatalf("save a statement: %v", err)
	}
	return reload(t, env.app, statementsCollection, r.Id)
}

// srClient sends requests through the app's router and gives back the whole
// response (headers too). Build it after every hook a test binds: it runs
// OnServe once.
type srClient struct{ mux http.Handler }

func newSRClient(t *testing.T, app *tests.TestApp) *srClient {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	var mux http.Handler
	serve := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serve, func(e *core.ServeEvent) error {
		built, err := e.Router.BuildMux()
		mux = built
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return &srClient{mux: mux}
}

func (c *srClient) do(token, method, url, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	c.mux.ServeHTTP(rec, req)
	return rec
}

func srPreviewBody(statementType, statementDate, startDate, endDate string, customers ...string) string {
	if customers == nil {
		customers = []string{}
	}
	raw, _ := json.Marshal(map[string]any{
		"type": statementType, "statement_date": statementDate, "start_date": startDate,
		"end_date": endDate, "customers": customers,
	})
	return string(raw)
}

type srSendItem struct {
	ID string `json:"id"`
	To string `json:"to"`
}

func srSendBody(items ...srSendItem) string {
	if items == nil {
		items = []srSendItem{}
	}
	raw, _ := json.Marshal(map[string]any{"statements": items})
	return string(raw)
}

type srFailure struct {
	ID      string `json:"id"`
	Message string `json:"message"`
}

type srAnswer struct {
	Sent   []map[string]any `json:"sent"`
	Failed []srFailure      `json:"failed"`
}

func srAnswerOf(t *testing.T, rec *httptest.ResponseRecorder) srAnswer {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("send status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var out srAnswer
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("send answer is not JSON: %v (%s)", err, rec.Body.String())
	}
	if out.Sent == nil || out.Failed == nil {
		t.Errorf("send answer %s, want both a sent and a failed list", rec.Body.String())
	}
	return out
}

func (a srAnswer) sentRow(id string) map[string]any {
	for _, r := range a.Sent {
		if r["id"] == id {
			return r
		}
	}
	return nil
}

func (a srAnswer) failure(id string) (string, bool) {
	for _, f := range a.Failed {
		if f.ID == id {
			return f.Message, true
		}
	}
	return "", false
}

// srRequireRefusal asserts a refusal of the whole request with status and the
// message (PocketBase ends a message with a period).
func srRequireRefusal(t *testing.T, what string, rec *httptest.ResponseRecorder, status int, msg string) {
	t.Helper()
	if rec.Code != status {
		t.Errorf("%s: status = %d, want %d; body: %s", what, rec.Code, status, rec.Body.String())
		return
	}
	if msg == "" {
		return
	}
	want := msg
	if !strings.HasSuffix(want, ".") {
		want += "."
	}
	if got := refusalOf(t, callResult{status: rec.Code, body: rec.Body.String()}).Message; got != want {
		t.Errorf("%s: message = %q, want %q", what, got, want)
	}
}

type srCaptured struct {
	To []struct {
		Email string `json:"email"`
	} `json:"to"`
	From            string   `json:"from"`
	Subject         string   `json:"subject"`
	Text            string   `json:"text"`
	ReplyTo         string   `json:"reply_to"`
	AttachmentNames []string `json:"attachment_names"`
}

// captured reads every message of the capture log.
func (env *srEnv) captured(t *testing.T) []srCaptured {
	t.Helper()
	f, err := os.Open(env.logPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatalf("open the capture log: %v", err)
	}
	defer f.Close()
	var out []srCaptured
	scan := bufio.NewScanner(f)
	scan.Buffer(make([]byte, 1<<20), 1<<24)
	for scan.Scan() {
		var m srCaptured
		if err := json.Unmarshal(scan.Bytes(), &m); err != nil {
			t.Fatalf("a capture log line is not JSON: %v (%s)", err, scan.Text())
		}
		out = append(out, m)
	}
	if err := scan.Err(); err != nil {
		t.Fatalf("read the capture log: %v", err)
	}
	return out
}

func (env *srEnv) capturedTo(t *testing.T, address string) []srCaptured {
	t.Helper()
	var out []srCaptured
	for _, m := range env.captured(t) {
		if len(m.To) == 1 && m.To[0].Email == address {
			out = append(out, m)
		}
	}
	return out
}

// srSwap sets a package variable for one test.
func srSwap[T any](t *testing.T, target *T, value T) {
	t.Helper()
	old := *target
	*target = value
	t.Cleanup(func() { *target = old })
}

// srSendOnly is a mailer.Sender that is not a mailer.FullSender.
type srSendOnly struct{}

func (srSendOnly) Send(context.Context, *mailer.Message) error { return nil }

// srFailingSender sends through the capture log, except that it fails with an
// error for errorFor and reports rejectFor as a failed recipient.
type srFailingSender struct{ errorFor, rejectFor string }

func (f srFailingSender) Send(ctx context.Context, msg *mailer.Message) error {
	return (&mailer.LogSender{}).Send(ctx, msg)
}

func (f srFailingSender) SendFull(ctx context.Context, req *mailer.SendRequest) (*mailer.SendResult, error) {
	if len(req.To) == 1 {
		switch req.To[0].Email {
		case f.errorFor:
			return nil, errors.New("the provider is down")
		case f.rejectFor:
			return &mailer.SendResult{FailedRecipients: []mailer.RecipientFailure{{Email: f.rejectFor, Reason: "bounced"}}}, nil
		}
	}
	return (&mailer.LogSender{}).SendFull(ctx, req)
}

// srTwoPerHour stands in for statementEmailLimiter in the limit test.
var srTwoPerHour = ratelimit.NewPerApp("books.statements.send.test", 2, time.Hour)

type srEmailCase struct {
	To string `json:"to"`
	OK bool   `json:"ok"`
}

func srEmailCases(t *testing.T) []srEmailCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/statement_email_cases.json")
	if err != nil {
		t.Fatalf("read the statement email cases: %v", err)
	}
	var cases []srEmailCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse the statement email cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the statement email case table is empty")
	}
	return cases
}

// The file name rule of core's fileNameStem (reports/export.go), with no
// "report" fallback: an empty stem adds nothing to a statement's name.
func TestStatementFileStem_Cases(t *testing.T) {
	raw, err := os.ReadFile("testdata/file_stem_cases.json")
	if err != nil {
		t.Fatalf("read the file stem cases: %v", err)
	}
	var cases []struct {
		In  string `json:"in"`
		Out string `json:"out"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse the file stem cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the file stem case table is empty")
	}
	for _, c := range cases {
		if got := fileStem(c.In); got != c.Out {
			t.Errorf("fileStem(%q) = %q, want %q", c.In, got, c.Out)
		}
	}
}

// Every case of the shared address table as the to of one send: an ok case is
// sent to the trimmed address, every other case fails with msgStatementAddress.
func TestStatementSend_AddressCases(t *testing.T) {
	env := newSREnv(t)
	cases := srEmailCases(t)
	items := make([]srSendItem, len(cases))
	for i, c := range cases {
		items[i] = srSendItem{ID: env.statement(t, env.aspen).Id, To: c.To}
	}
	client := newSRClient(t, env.app)
	answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL, srSendBody(items...)))
	for i, c := range cases {
		id := items[i].ID
		if c.OK {
			row := answer.sentRow(id)
			if row == nil {
				t.Errorf("%q: not sent, want it sent; answer %+v", c.To, answer)
				continue
			}
			if got := row["sent_to"]; got != strings.TrimSpace(c.To) {
				t.Errorf("%q: sent_to = %v, want %q", c.To, got, strings.TrimSpace(c.To))
			}
			continue
		}
		msg, ok := answer.failure(id)
		if !ok || msg != msgStatementAddress {
			t.Errorf("%q: failure %q (listed %v), want %q", c.To, msg, ok, msgStatementAddress)
		}
		// A refused address is refused before the send: no message goes to it,
		// so a press after a failed save cannot email it twice.
		if n := len(env.capturedTo(t, strings.TrimSpace(c.To))); n != 0 {
			t.Errorf("%q: %d messages in the capture log, want none", c.To, n)
		}
		if got := reload(t, env.app, statementsCollection, id).GetString("sent_at"); got != "" {
			t.Errorf("%q: sent_at = %q after a refused address, want it empty", c.To, got)
		}
	}
}

// GET /api/books/pdf/statement/<id>: the saved statement's PDF for a reader,
// named by its number and customer, with the amount due now in a header; not
// found for a missing row and for a row the view rule hides; 401 with no
// session.
func TestStatementPDFRoute(t *testing.T) {
	env := newSREnv(t)
	stored := env.statement(t, env.aspen)
	if got := stored.GetInt("balance"); got != 50000 {
		t.Fatalf("stored balance = %d, want 50000", got)
	}
	// A back-dated invoice before the end day: the amount due now differs
	// from the stored balance.
	arInvoice(t, env.ar, env.aspen, "2026-11-10", "2026-12-10", 20000)
	url := "/api/books/pdf/statement/" + stored.Id
	reader := tokenFor(t, env.users.readOnly)
	client := newSRClient(t, env.app)

	rec := client.do(reader, http.MethodGet, url, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("a reader's download: status %d, want 200; body: %.300s", rec.Code, rec.Body.String())
	}
	if !strings.HasPrefix(rec.Body.String(), "%PDF-") {
		t.Errorf("the body is not a PDF: %.20q", rec.Body.String())
	}
	h := rec.Header()
	if got, want := h.Get("Content-Disposition"), `attachment; filename="statement-st-1001-aspen-ridge-landscaping.pdf"`; got != want {
		t.Errorf("Content-Disposition = %q, want %q", got, want)
	}
	if got := h.Get("X-Books-Statement-Amount-Due"); got != strconv.Itoa(70000) {
		t.Errorf("X-Books-Statement-Amount-Due = %q, want 70000 (the amount due now, not the stored 50000)", got)
	}
	exposed := strings.Join(h.Values("Access-Control-Expose-Headers"), ",")
	for _, name := range []string{"Content-Disposition", "X-Books-Statement-Amount-Due"} {
		if !strings.Contains(exposed, name) {
			t.Errorf("Access-Control-Expose-Headers = %q, want it to name %s", exposed, name)
		}
	}
	_, text := extractPDFText(t, rec.Body.Bytes())
	requireTextHolds(t, text, "Statement", "No. ST-1001", "Aspen Ridge Landscaping", formatMoney(70000, "USD"))

	if rec := client.do(reader, http.MethodGet, "/api/books/pdf/statement/doesnotexist123", ""); rec.Code != http.StatusNotFound {
		t.Errorf("a missing statement: status %d, want 404", rec.Code)
	}
	if rec := client.do("", http.MethodGet, url, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("no session: status %d, want 401", rec.Code)
	}
	col, err := env.app.FindCollectionByNameOrId(statementsCollection)
	if err != nil {
		t.Fatal(err)
	}
	rule := `id = "never"`
	col.ViewRule = &rule
	if err := env.app.Save(col); err != nil {
		t.Fatalf("save rule: %v", err)
	}
	if rec := client.do(reader, http.MethodGet, url, ""); rec.Code != http.StatusNotFound {
		t.Errorf("a statement the view rule hides: status %d, want 404", rec.Code)
	}
}

// The preview: one PDF of every customer's statement, stored nowhere, named
// by the statement date; each refusal of the whole request.
func TestStatementPreview(t *testing.T) {
	env := newSREnv(t)
	writer := tokenFor(t, env.users.bookkeeper)
	beforeCount, err := env.app.CountRecords(statementsCollection)
	if err != nil {
		t.Fatal(err)
	}
	beforeNext := statementNextNumber(t, env.app)
	client := newSRClient(t, env.app)

	rec := client.do(writer, http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id, env.birch.Id))
	if rec.Code != http.StatusOK {
		t.Fatalf("a writer's preview: status %d, want 200; body: %.300s", rec.Code, rec.Body.String())
	}
	h := rec.Header()
	for header, want := range map[string]string{
		"Content-Type":        "application/pdf",
		"Content-Disposition": `attachment; filename="statements-preview-2026-11-20.pdf"`,
		"Cache-Control":       "no-store",
	} {
		if got := h.Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
	pages, text := extractPDFText(t, rec.Body.Bytes())
	if pages < 2 {
		t.Errorf("%d pages, want each statement on its own page (2 or more)", pages)
	}
	requireTextHolds(t, text, "Aspen Ridge Landscaping", "Birch Hollow Dental")
	if strings.Contains(text, "No.") {
		t.Errorf("a preview prints a number:\n%s", text)
	}
	requireStatementCount(t, env.app, beforeCount)
	if got := statementNextNumber(t, env.app); got != beforeNext {
		t.Errorf("statement next_number = %d after a preview, want %d", got, beforeNext)
	}

	for _, tc := range statementDateCases(t) {
		if tc.Field == "" {
			continue
		}
		rec := client.do(writer, http.MethodPost, srPreviewURL,
			srPreviewBody(tc.Type, tc.StatementDate, tc.StartDate, tc.EndDate, env.aspen.Id))
		t.Run("date case "+tc.Name, func(t *testing.T) {
			requireRESTFieldRefusal(t, callResult{status: rec.Code, body: rec.Body.String()}, tc.Field, tc.Message+".")
		})
	}

	tooMany := make([]string, maxStatementsPerRequest+1)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf("missing%08d", i)
	}
	srRequireRefusal(t, "201 customers", client.do(writer, http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", tooMany...)), http.StatusBadRequest, msgStatementTooMany)
	srRequireRefusal(t, "no customer", client.do(writer, http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "")), http.StatusBadRequest, "")
	srRequireRefusal(t, "a read-only user", client.do(tokenFor(t, env.users.readOnly), http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id)), http.StatusForbidden, msgStatementNoAccess)
	srRequireRefusal(t, "no session", client.do("", http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id)), http.StatusUnauthorized, "")
	srRequireRefusal(t, "a missing customer", client.do(writer, http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", "doesnotexist123")), http.StatusNotFound, "")

	col, err := env.app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		t.Fatal(err)
	}
	rule := `id = "never"`
	col.ViewRule = &rule
	if err := env.app.Save(col); err != nil {
		t.Fatalf("save rule: %v", err)
	}
	srRequireRefusal(t, "a customer the view rule hides", client.do(writer, http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id)), http.StatusNotFound, "")
	requireStatementCount(t, env.app, beforeCount)
}

// A send: the sent row, the message in the capture log, and its text from
// the same statement data; a second send to another address replaces the
// sent fields.
func TestStatementSend_Success(t *testing.T) {
	env := newSREnv(t)
	stored := env.statement(t, env.aspen)
	writer := env.users.bookkeeper
	client := newSRClient(t, env.app)

	answer := srAnswerOf(t, client.do(tokenFor(t, writer), http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: srAddress})))
	if len(answer.Sent) != 1 || len(answer.Failed) != 0 {
		t.Fatalf("answer %+v, want one sent row and no failure", answer)
	}
	row := answer.Sent[0]
	if row["id"] != stored.Id || row["sent_to"] != srAddress || row["email"] != srAddress {
		t.Errorf("sent row id %v, sent_to %v, email %v; want %s, %s, %s", row["id"], row["sent_to"], row["email"], stored.Id, srAddress, srAddress)
	}
	firstAt, _ := row["sent_at"].(string)
	if firstAt == "" {
		t.Errorf("sent row has no sent_at: %v", row)
	}
	saved := reload(t, env.app, statementsCollection, stored.Id)
	if saved.GetString("sent_to") != srAddress || saved.GetString("email") != srAddress || saved.GetString("sent_at") == "" {
		t.Errorf("stored sent_to %q, email %q, sent_at %q; want the address twice and a time",
			saved.GetString("sent_to"), saved.GetString("email"), saved.GetString("sent_at"))
	}

	messages := env.capturedTo(t, srAddress)
	if len(messages) != 1 {
		t.Fatalf("%d messages to %s in the capture log, want 1", len(messages), srAddress)
	}
	m := messages[0]
	if m.Subject != "Statement ST-1001 from "+srBusiness {
		t.Errorf("subject = %q, want %q", m.Subject, "Statement ST-1001 from "+srBusiness)
	}
	data, err := buildStatementData(context.Background(), env.app, writer, statementInput{
		Type: statementTypeOpenItems, StatementDate: srDay, Customer: reload(t, env.app, "books_customers", env.aspen.Id), Number: "ST-1001",
	})
	if err != nil {
		t.Fatalf("buildStatementData: %v", err)
	}
	if want := statementEmail(data, statementBusiness{Name: srBusiness, Phone: srPhone}).Text; m.Text != want {
		t.Errorf("text =\n%s\nwant statementEmail's\n%s", m.Text, want)
	}
	if m.ReplyTo != writer.Email() {
		t.Errorf("reply_to = %q, want the sender's %q", m.ReplyTo, writer.Email())
	}
	if want := []string{"statement-st-1001-aspen-ridge-landscaping.pdf"}; strings.Join(m.AttachmentNames, "|") != strings.Join(want, "|") {
		t.Errorf("attachment_names = %q, want %q", m.AttachmentNames, want)
	}
	if !strings.Contains(m.From, srBusiness) || !strings.Contains(m.From, mailer.FromAddress(env.app)) {
		t.Errorf("from = %q, want the business name and the server's address %s", m.From, mailer.FromAddress(env.app))
	}

	// Sent again, to another address: the latest send shows.
	time.Sleep(5 * time.Millisecond)
	other := "accounts@aspenridge.example"
	again := srAnswerOf(t, client.do(tokenFor(t, writer), http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: other})))
	if len(again.Sent) != 1 {
		t.Fatalf("second send answer %+v, want one sent row", again)
	}
	secondAt, _ := again.Sent[0]["sent_at"].(string)
	if again.Sent[0]["sent_to"] != other || secondAt <= firstAt {
		t.Errorf("second send: sent_to %v, sent_at %q; want %s and later than %q", again.Sent[0]["sent_to"], secondAt, other, firstAt)
	}
	if got := reload(t, env.app, statementsCollection, stored.Id).GetString("sent_to"); got != other {
		t.Errorf("stored sent_to = %q after the second send, want %q", got, other)
	}
}

// With no business name the From name is the organization's name.
func TestStatementSend_FromIsTheOrganizationWithNoBusinessName(t *testing.T) {
	env := newSREnv(t)
	env.setBusiness(t, "", "")
	env.app.Settings().Meta.AppName = "Juniper Org"
	stored := env.statement(t, env.aspen)
	client := newSRClient(t, env.app)
	answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: srAddress})))
	if len(answer.Sent) != 1 {
		t.Fatalf("answer %+v, want one sent row", answer)
	}
	messages := env.capturedTo(t, srAddress)
	if len(messages) != 1 {
		t.Fatalf("%d messages, want 1", len(messages))
	}
	if !strings.Contains(messages[0].From, "Juniper Org") {
		t.Errorf("from = %q, want the organization's name Juniper Org", messages[0].From)
	}
	if want := "Statement ST-1001 from Juniper Org"; messages[0].Subject != want {
		t.Errorf("subject = %q, want %q", messages[0].Subject, want)
	}
}

// Refusals of the whole request: nothing is sent.
func TestStatementSend_RefusesTheRequest(t *testing.T) {
	t.Run("session, access and size", func(t *testing.T) {
		env := newSREnv(t)
		stored := env.statement(t, env.aspen)
		writer := tokenFor(t, env.users.bookkeeper)
		one := srSendBody(srSendItem{ID: stored.Id, To: srAddress})
		tooMany := make([]srSendItem, maxStatementsPerRequest+1)
		for i := range tooMany {
			tooMany[i] = srSendItem{ID: stored.Id, To: srAddress}
		}
		client := newSRClient(t, env.app)
		srRequireRefusal(t, "no session", client.do("", http.MethodPost, srSendURL, one), http.StatusUnauthorized, "")
		srRequireRefusal(t, "a read-only user", client.do(tokenFor(t, env.users.readOnly), http.MethodPost, srSendURL, one),
			http.StatusForbidden, msgStatementNoAccess)
		srRequireRefusal(t, "201 statements", client.do(writer, http.MethodPost, srSendURL, srSendBody(tooMany...)),
			http.StatusBadRequest, msgStatementTooMany)
		srRequireRefusal(t, "an empty list", client.do(writer, http.MethodPost, srSendURL, srSendBody()),
			http.StatusBadRequest, "")
		if n := len(env.captured(t)); n != 0 {
			t.Errorf("%d messages after refused requests, want 0", n)
		}
		if got := reload(t, env.app, statementsCollection, stored.Id).GetString("sent_at"); got != "" {
			t.Errorf("sent_at = %q after refused requests, want it empty", got)
		}
	})
	t.Run("a sender that cannot attach a file", func(t *testing.T) {
		env := newSREnv(t)
		srSwap(t, &statementSender, func(core.App) mailer.Sender { return srSendOnly{} })
		stored := env.statement(t, env.aspen)
		client := newSRClient(t, env.app)
		srRequireRefusal(t, "a sender that is not a FullSender", client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL,
			srSendBody(srSendItem{ID: stored.Id, To: srAddress})), http.StatusBadRequest, msgStatementEmailNotSetUp)
	})
	t.Run("no capture log and no provider", func(t *testing.T) {
		env := newSREnv(t)
		t.Setenv("TINYCLD_EMAIL_LOG", "")
		stored := env.statement(t, env.aspen)
		client := newSRClient(t, env.app)
		srRequireRefusal(t, "email not set up", client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL,
			srSendBody(srSendItem{ID: stored.Id, To: srAddress})), http.StatusBadRequest, msgStatementEmailNotSetUp)
		if got := reload(t, env.app, statementsCollection, stored.Id).GetString("sent_at"); got != "" {
			t.Errorf("sent_at = %q, want it empty", got)
		}
	})
}

// A part failure: each statement's refusal is collected and the others are
// sent.
func TestStatementSend_PartFailure(t *testing.T) {
	t.Run("a missing statement and a bad address", func(t *testing.T) {
		env := newSREnv(t)
		good := env.statement(t, env.aspen)
		bad := env.statement(t, env.birch)
		client := newSRClient(t, env.app)
		answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL, srSendBody(
			srSendItem{ID: "doesnotexist123", To: srAddress},
			srSendItem{ID: bad.Id, To: "not-an-address"},
			srSendItem{ID: good.Id, To: srAddress},
		)))
		if len(answer.Sent) != 1 || answer.sentRow(good.Id) == nil || len(answer.Failed) != 2 {
			t.Fatalf("answer %+v, want the good statement sent and two failures", answer)
		}
		if msg, _ := answer.failure("doesnotexist123"); msg != "Document not found." {
			t.Errorf("the missing statement's failure = %q, want \"Document not found.\"", msg)
		}
		if msg, _ := answer.failure(bad.Id); msg != msgStatementAddress {
			t.Errorf("the bad address's failure = %q, want %q", msg, msgStatementAddress)
		}
		if got := reload(t, env.app, statementsCollection, bad.Id).GetString("sent_at"); got != "" {
			t.Errorf("the failed statement's sent_at = %q, want it empty", got)
		}
	})
	t.Run("the sender fails for one address", func(t *testing.T) {
		env := newSREnv(t)
		srSwap(t, &statementSender, func(core.App) mailer.Sender {
			return srFailingSender{errorFor: "down@aspenridge.example", rejectFor: "bounce@aspenridge.example"}
		})
		down := env.statement(t, env.aspen)
		bounce := env.statement(t, env.aspen)
		good := env.statement(t, env.birch)
		client := newSRClient(t, env.app)
		answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL, srSendBody(
			srSendItem{ID: down.Id, To: "down@aspenridge.example"},
			srSendItem{ID: bounce.Id, To: "bounce@aspenridge.example"},
			srSendItem{ID: good.Id, To: srAddress},
		)))
		if len(answer.Sent) != 1 || answer.sentRow(good.Id) == nil {
			t.Errorf("sent %v, want only the good statement", answer.Sent)
		}
		for _, r := range []*core.Record{down, bounce} {
			if msg, _ := answer.failure(r.Id); msg != msgStatementNotSent {
				t.Errorf("failure of %s = %q, want %q", r.Id, msg, msgStatementNotSent)
			}
			if got := reload(t, env.app, statementsCollection, r.Id).GetString("sent_at"); got != "" {
				t.Errorf("a statement not sent has sent_at %q, want it empty", got)
			}
		}
	})
}

// The hourly limit per user: with a limit of 2, the third statement of one
// request fails and the first two are sent.
func TestStatementSend_Limit(t *testing.T) {
	env := newSREnv(t)
	srSwap(t, &statementEmailLimiter, srTwoPerHour)
	items := []srSendItem{}
	for range 3 {
		items = append(items, srSendItem{ID: env.statement(t, env.aspen).Id, To: srAddress})
	}
	client := newSRClient(t, env.app)
	answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL, srSendBody(items...)))
	if answer.sentRow(items[0].ID) == nil || answer.sentRow(items[1].ID) == nil || len(answer.Sent) != 2 {
		t.Errorf("sent %v, want the first two statements", answer.Sent)
	}
	if msg, _ := answer.failure(items[2].ID); msg != msgStatementEmailLimit {
		t.Errorf("the third statement's failure = %q, want %q", msg, msgStatementEmailLimit)
	}
	if n := len(env.capturedTo(t, srAddress)); n != 2 {
		t.Errorf("%d messages, want 2", n)
	}
}

// srPDFSize is the size of a saved statement's PDF from the document route.
func srPDFSize(t *testing.T, client *srClient, token string, stored *core.Record) int {
	t.Helper()
	rec := client.do(token, http.MethodGet, "/api/books/pdf/statement/"+stored.Id, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("the PDF of %s: status %d; body: %.300s", stored.Id, rec.Code, rec.Body.String())
	}
	return rec.Body.Len()
}

// The limit counts emails sent: a statement that fails before its email is
// sent (here its PDF is too large) takes no place of the limit, so with a limit
// of 2 the two statements after it are both sent.
func TestStatementSend_LimitCountsOnlySentEmails(t *testing.T) {
	env := newSREnv(t)
	many := mkCustomer(t, env.app, "Cedar Many Lines", "")
	for i := 0; i < 30; i++ {
		arInvoice(t, env.ar, many, fmt.Sprintf("2026-10-%02d", 1+i), "2026-12-31", 1000+i)
	}
	big := env.statement(t, many)
	first := env.statement(t, env.aspen)
	second := env.statement(t, env.birch)
	client := newSRClient(t, env.app)
	writer := tokenFor(t, env.users.bookkeeper)
	bigSize := srPDFSize(t, client, writer, big)
	small := max(srPDFSize(t, client, writer, first), srPDFSize(t, client, writer, second))
	if bigSize-small < 2000 {
		t.Fatalf("the long statement's PDF is %d bytes and the short one's %d: too close to set a limit between them", bigSize, small)
	}
	srSwap(t, &maxStatementFileBytes, small+(bigSize-small)/2)
	srSwap(t, &statementEmailLimiter, srTwoPerHour)

	answer := srAnswerOf(t, client.do(writer, http.MethodPost, srSendURL, srSendBody(
		srSendItem{ID: big.Id, To: "many@cedar.example"},
		srSendItem{ID: first.Id, To: srAddress},
		srSendItem{ID: second.Id, To: "billing@birchhollow.example"},
	)))
	if msg, _ := answer.failure(big.Id); msg != msgStatementFileTooLarge {
		t.Errorf("the long statement's failure = %q, want %q", msg, msgStatementFileTooLarge)
	}
	if answer.sentRow(first.Id) == nil || answer.sentRow(second.Id) == nil {
		t.Errorf("sent %v, failed %+v; want both short statements sent (the too-large one sent no email)", answer.Sent, answer.Failed)
	}
}

// With no session both routes answer 401 with one text that fits both.
func TestStatementRoutes_SignInText(t *testing.T) {
	env := newSREnv(t)
	stored := env.statement(t, env.aspen)
	client := newSRClient(t, env.app)
	srRequireRefusal(t, "a preview with no session", client.do("", http.MethodPost, srPreviewURL,
		srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id)), http.StatusUnauthorized, "Sign in to use statements.")
	srRequireRefusal(t, "a send with no session", client.do("", http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: srAddress})), http.StatusUnauthorized, "Sign in to use statements.")
}

// A body the routes cannot read gets one fixed text, with no decoder detail.
func TestStatementRoutes_BadBodyText(t *testing.T) {
	env := newSREnv(t)
	client := newSRClient(t, env.app)
	writer := tokenFor(t, env.users.bookkeeper)
	for url, body := range map[string]string{
		srPreviewURL: `{"type":"open_items","statement_date":"2026-11-20","customers":["` + env.aspen.Id + `"],"subject":"Hi"}`,
		srSendURL:    `{"statements":[],"subject":"Hi"}`,
	} {
		srRequireRefusal(t, url+" with an unknown field", client.do(writer, http.MethodPost, url, body),
			http.StatusBadRequest, "The request is not valid.")
	}
}

// A statement whose PDF is over the size limit fails with its own message.
func TestStatementSend_FileTooLarge(t *testing.T) {
	env := newSREnv(t)
	srSwap(t, &maxStatementFileBytes, 100)
	stored := env.statement(t, env.aspen)
	client := newSRClient(t, env.app)
	answer := srAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: srAddress})))
	if msg, _ := answer.failure(stored.Id); msg != msgStatementFileTooLarge || len(answer.Sent) != 0 {
		t.Errorf("answer %+v, want the statement failed with %q", answer, msgStatementFileTooLarge)
	}
	if n := len(env.captured(t)); n != 0 {
		t.Errorf("%d messages, want 0", n)
	}
}

// Plan note 8: a send writes the "updated" audit row with the sent fields in
// its changes; a create and a delete through the record API write theirs.
func TestStatementSend_AuditRows(t *testing.T) {
	env := newSREnv(t)
	stored := env.statement(t, env.aspen)
	writer := env.users.bookkeeper
	client := newSRClient(t, env.app)
	answer := srAnswerOf(t, client.do(tokenFor(t, writer), http.MethodPost, srSendURL,
		srSendBody(srSendItem{ID: stored.Id, To: srAddress})))
	if len(answer.Sent) != 1 {
		t.Fatalf("answer %+v, want one sent row", answer)
	}
	updated := awaitAuditRow(t, env.app, statementsCollection, "updated", stored.Id)
	if got := updated.GetString("actor"); got != writer.Id {
		t.Errorf("updated row actor = %q, want the sender %q", got, writer.Id)
	}
	changes := auditJSONField(t, updated, "changes")
	for _, field := range []string{"sent_at", "sent_to"} {
		if _, ok := changes[field]; !ok {
			t.Errorf("the updated row's changes %v hold no %s", changes, field)
		}
	}

	rec := client.do(tokenFor(t, writer), http.MethodPost, statementsURL,
		statementBody(env.birch.Id, statementTypeOpenItems, srDay, "", "", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("a writer's create: status %d; body: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("create body %s: %v", rec.Body.String(), err)
	}
	awaitAuditRow(t, env.app, statementsCollection, "created", created.ID)
	if rec := client.do(tokenFor(t, writer), http.MethodDelete, statementsURL+"/"+created.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("a writer's delete: status %d; body: %s", rec.Code, rec.Body.String())
	}
	awaitAuditRow(t, env.app, statementsCollection, "deleted", created.ID)
}

// The preview and the send are session only: a token with every Books scope,
// held by a Books admin, cannot call them (TestOAuth_TokenCannotRebuildBalances).
func TestStatementRoutes_TokenCannotCallThem(t *testing.T) {
	env := newSREnv(t)
	oauth.Register(env.pb)
	stored := env.statement(t, env.aspen)
	token := oauthToken(t, env.app, env.users.admin, scopeRead, scopeWrite)
	client := newSRClient(t, env.app)
	calls := []struct{ url, body string }{
		{srPreviewURL, srPreviewBody(statementTypeOpenItems, srDay, "", "", env.aspen.Id)},
		{srSendURL, srSendBody(srSendItem{ID: stored.Id, To: srAddress})},
	}
	for _, c := range calls {
		rec := client.do(token, http.MethodPost, c.url, c.body)
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "not available to API tokens") {
			t.Errorf("%s with an OAuth token: status %d, body %s; want 403 not available to API tokens", c.url, rec.Code, rec.Body.String())
		}
	}
	if n := len(env.captured(t)); n != 0 {
		t.Errorf("%d messages after token calls, want 0", n)
	}
	// The control: the same admin's session reaches both routes, so each 403
	// above is the token's, not a missing route's.
	session := tokenFor(t, env.users.admin)
	for _, c := range calls {
		if rec := client.do(session, http.MethodPost, c.url, c.body); rec.Code != http.StatusOK {
			t.Errorf("%s with the admin's session: status %d, want 200; body: %.200s", c.url, rec.Code, rec.Body.String())
		}
	}
}
