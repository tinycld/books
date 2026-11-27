package books

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/hook"

	"tinycld.org/core/mailer"
	"tinycld.org/core/ratelimit"
	"tinycld.org/core/reports"
)

// Email-share spec §3.4 and §4.4: POST /api/books/documents/send sends each
// document's email with its PDF, stores one books_document_sends row for each
// sent email through the create-request hook chain, and answers
// { sent, failed }. Every test runs on an app wired by Register, with
// emailSender replaced by dsSender (it records each request), no pause between
// tries, and TINYCLD_EMAIL_LOG set to a temp file.

const (
	dsBusiness      = "Cedar Ledger Co"
	dsPhone         = "214 555 1234"
	dsBusinessEmail = "books@cedarledger.example"
	dsAppURL        = "https://books.example"
	dsTo            = "billing@harborview.example"
	dsSendURL       = "/api/books/documents/send"
)

type dsEnv struct {
	app     *tests.TestApp
	rr      *refundReceiptEnv
	users   levelUsers
	logPath string
	sender  *dsSender
	// The vendor and the expense account of the purchase orders doc saves,
	// made at the first one.
	orderVendor, orderAccount *core.Record
}

// newDSEnv is a registered app with the five sales document hosts and the
// purchase order host bound, the refund receipt book (Harborview Dental,
// Monthly bookkeeping, the bank and income accounts), one user per Books
// level, the business named with a phone and an email, and the server address
// set.
func newDSEnv(t *testing.T) *dsEnv {
	t.Helper()
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	logPath := filepath.Join(t.TempDir(), "email.jsonl")
	t.Setenv("TINYCLD_EMAIL_LOG", logPath)
	app, _ := newRegisteredApp(t)
	// Core keeps one set of bound hosts per app, so the six are bound in one call.
	bindHostsByKey(t, app, invoiceHostKey, estimateHostKey, salesReceiptHostKey, creditMemoHostKey, refundReceiptHostKey,
		purchaseOrderHostKey)
	rr := refundReceiptEnvOn(t, app)
	s := reload(t, app, "books_settings", settingsID)
	s.Set("business_name", dsBusiness)
	s.Set("phone", dsPhone)
	s.Set("email", dsBusinessEmail)
	if err := app.Save(s); err != nil {
		t.Fatalf("save the business: %v", err)
	}
	app.Settings().Meta.AppURL = dsAppURL
	env := &dsEnv{app: app, rr: rr, users: rr.users, logPath: logPath, sender: &dsSender{}}
	srSwap(t, &emailSendRetryPause, 0)
	srSwap(t, &emailSender, func(core.App) mailer.Sender { return env.sender })
	return env
}

// doc saves a document of kind in status for Harborview Dental with one
// non-taxable Monthly bookkeeping line of 450.00, through every guard; fields
// go on the header's create.
func (env *dsEnv) doc(t *testing.T, kind, status string, fields map[string]any) *core.Record {
	t.Helper()
	app, actor := env.app, env.users.bookkeeper.Id
	line := item(env.rr.service, 1, 45000, false)
	header := func(base map[string]any) map[string]any {
		for k, v := range fields {
			base[k] = v
		}
		return base
	}
	type steps struct {
		collection   string
		create       func() *core.Record
		post, void   func(id string) error
		draftOnly    bool
		estimateWord string
	}
	var s steps
	switch kind {
	case "invoice":
		s = steps{collection: "books_invoices", create: func() *core.Record {
			r, err := newInvoice(app, env.rr.customer, fields)
			if err != nil {
				t.Fatalf("save a draft invoice: %v", err)
			}
			mkInvoiceLine(t, app, r, 0, line)
			return r
		}, post: func(id string) error { return postInvoiceAs(app, id, actor) },
			void: func(id string) error { return voidInvoiceAs(app, id, actor) }}
	case "sales_receipt":
		s = steps{collection: "books_sales_receipts", create: func() *core.Record {
			r := env.rr.mkReceipt(t, fields)
			mkReceiptLine(t, app, r, 0, line)
			return r
		}, post: func(id string) error { return postReceiptAs(app, id, actor) },
			void: func(id string) error { return voidReceiptAs(app, id, actor) }}
	case "credit_memo":
		s = steps{collection: "books_credit_memos", create: func() *core.Record {
			r := env.rr.mkCreditMemo(t, fields)
			if _, err := newCreditMemoLine(app, r, 0, line); err != nil {
				t.Fatalf("save the credit memo line: %v", err)
			}
			return r
		}, post: func(id string) error { return postCreditMemoAs(app, id, actor) },
			void: func(id string) error { return voidCreditMemoAs(app, id, actor) }}
	case "refund_receipt":
		s = steps{collection: refundReceiptsCollection, create: func() *core.Record {
			r := env.rr.mkRefundReceipt(t, fields)
			mkRefundReceiptLine(t, app, r, 0, line)
			return r
		}, post: func(id string) error { return postRefundReceiptAs(app, id, actor) },
			void: func(id string) error { return voidRefundReceiptAs(app, id, actor) }}
	case "estimate":
		base := map[string]any{"customer": env.rr.customer.Id, "status": statusPending, "date": estimateTestDay}
		switch status {
		case statusAccepted:
			base["status"], base["accepted_by"], base["accepted_date"] = statusAccepted, "Dr. Lena Ortiz", "2026-11-05"
		case statusRejected:
			base["status"] = statusRejected
		}
		est, err := saveNew(app, "books_estimates", header(base))
		if err != nil {
			t.Fatalf("save a %s estimate: %v", status, err)
		}
		mkEstimateLine(t, app, est, 0, line)
		if status == statusClosed {
			// Books closes an estimate when an invoice is made from it.
			if _, err := newInvoice(app, env.rr.customer, map[string]any{"estimate": est.Id}); err != nil {
				t.Fatalf("convert the estimate: %v", err)
			}
		}
		got := reload(t, app, "books_estimates", est.Id)
		if got.GetString("status") != status {
			t.Fatalf("estimate status = %q, want %q", got.GetString("status"), status)
		}
		return got
	case "purchase_order":
		if env.orderVendor == nil {
			env.orderVendor = mkVendor(t, app, "Lakeside Office Goods")
			env.orderAccount = mkNumberedAccount(t, app, "Office Supplies", "6160", "expense", "dues_subscriptions")
		}
		order := mkPO(t, app, env.orderVendor, fields)
		mkPOLine(t, app, order, 0, accountLine(env.orderAccount, 45000))
		if status == statusClosed {
			closeOrderBySQL(t, app, order.Id)
		}
		got := reload(t, app, "books_purchase_orders", order.Id)
		if got.GetString("status") != status {
			t.Fatalf("purchase order status = %q, want %q", got.GetString("status"), status)
		}
		return got
	default:
		t.Fatalf("no document builder for kind %q", kind)
	}
	r := s.create()
	if status == "posted" || status == "void" {
		if err := s.post(r.Id); err != nil {
			t.Fatalf("post the %s: %v", kind, err)
		}
	}
	if status == "void" {
		if err := s.void(r.Id); err != nil {
			t.Fatalf("void the %s: %v", kind, err)
		}
	}
	got := reload(t, app, s.collection, r.Id)
	if got.GetString("status") != status {
		t.Fatalf("%s status = %q, want %q", kind, got.GetString("status"), status)
	}
	return got
}

// dsSender is a mailer.FullSender that records each request. The first
// errorTries calls fail with an error; a request to errorFor always fails with
// an error; a request to rejectFor is answered with that address as a refused
// recipient.
type dsSender struct {
	mu                  sync.Mutex
	requests            []mailer.SendRequest
	errorTries          int
	errorFor, rejectFor string
}

func (s *dsSender) Send(context.Context, *mailer.Message) error { return nil }

func (s *dsSender) SendFull(_ context.Context, req *mailer.SendRequest) (*mailer.SendResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests = append(s.requests, *req)
	to := ""
	if len(req.To) == 1 {
		to = req.To[0].Email
	}
	switch {
	case s.rejectFor != "" && to == s.rejectFor:
		return &mailer.SendResult{FailedRecipients: []mailer.RecipientFailure{{Email: to, Reason: "mailbox unavailable"}}}, nil
	case s.errorFor != "" && to == s.errorFor:
		return nil, errors.New("the provider is down")
	case len(s.requests) <= s.errorTries:
		return nil, errors.New("the provider is down for a moment")
	}
	return &mailer.SendResult{}, nil
}

func (s *dsSender) calls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.requests)
}

// to is every request whose one To address is address.
func (s *dsSender) to(address string) []mailer.SendRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []mailer.SendRequest
	for _, r := range s.requests {
		if len(r.To) == 1 && r.To[0].Email == address {
			out = append(out, r)
		}
	}
	return out
}

type dsItem struct {
	Kind    string   `json:"kind"`
	ID      string   `json:"id"`
	To      string   `json:"to"`
	Cc      []string `json:"cc"`
	Subject *string  `json:"subject,omitempty"`
	Body    *string  `json:"body,omitempty"`
}

func strp(s string) *string { return &s }

func dsBody(items ...dsItem) string {
	if items == nil {
		items = []dsItem{}
	}
	for i := range items {
		if items[i].Cc == nil {
			items[i].Cc = []string{}
		}
	}
	raw, _ := json.Marshal(map[string]any{"documents": items})
	return string(raw)
}

type dsFailure struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Message string `json:"message"`
}

type dsAnswer struct {
	Sent   []map[string]any `json:"sent"`
	Failed []dsFailure      `json:"failed"`
}

func dsAnswerOf(t *testing.T, rec *httptest.ResponseRecorder) dsAnswer {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("send status = %d, want 200; body: %.500s", rec.Code, rec.Body.String())
	}
	var out dsAnswer
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("send answer is not JSON: %v (%.500s)", err, rec.Body.String())
	}
	if out.Sent == nil || out.Failed == nil {
		t.Errorf("send answer %.500s, want both a sent and a failed list", rec.Body.String())
	}
	return out
}

func (a dsAnswer) failure(id string) (dsFailure, bool) {
	for _, f := range a.Failed {
		if f.ID == id {
			return f, true
		}
	}
	return dsFailure{}, false
}

// post sends the items as the bookkeeper (a Books writer) and reads the answer.
func (env *dsEnv) post(t *testing.T, items ...dsItem) dsAnswer {
	t.Helper()
	client := newSRClient(t, env.app)
	return dsAnswerOf(t, client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, dsSendURL, dsBody(items...)))
}

// requireFailed asserts the answer sent nothing and failed the one item with msg.
func requireFailed(t *testing.T, answer dsAnswer, item dsItem, msg string) {
	t.Helper()
	if len(answer.Sent) != 0 || len(answer.Failed) != 1 {
		t.Fatalf("answer %+v, want no row sent and one failure %q", answer, msg)
	}
	if want := (dsFailure{Kind: item.Kind, ID: item.ID, Message: msg}); answer.Failed[0] != want {
		t.Errorf("failed[0] = %+v, want %+v", answer.Failed[0], want)
	}
}

func requireSentOne(t *testing.T, answer dsAnswer, item dsItem) map[string]any {
	t.Helper()
	if len(answer.Sent) != 1 || len(answer.Failed) != 0 {
		t.Fatalf("answer %+v, want one row sent and no failure", answer)
	}
	row := answer.Sent[0]
	if row["doc_type"] != item.Kind || row["document"] != item.ID {
		t.Errorf("sent row doc_type %v, document %v; want %s, %s", row["doc_type"], row["document"], item.Kind, item.ID)
	}
	return row
}

type dsOfferCase struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Status  string `json:"status"`
	Offered bool   `json:"offered"`
	Message string `json:"message"`
}

type dsFieldCase struct {
	Name           string   `json:"name"`
	To             string   `json:"to"`
	Cc             []string `json:"cc"`
	Subject        string   `json:"subject"`
	BodyText       string   `json:"bodyText"`
	BodyHTMLLength int      `json:"bodyHtmlLength"`
	Field          string   `json:"field"`
	ClientMessage  string   `json:"clientMessage"`
	ServerMessage  string   `json:"serverMessage"`
}

func documentSendCases(t *testing.T) (offer []dsOfferCase, fields []dsFieldCase) {
	t.Helper()
	raw, err := os.ReadFile("testdata/document_send_cases.json")
	if err != nil {
		t.Fatalf("read the document send cases: %v", err)
	}
	var all struct {
		Offer  []dsOfferCase `json:"offer"`
		Fields []dsFieldCase `json:"fields"`
	}
	if err := json.Unmarshal(raw, &all); err != nil {
		t.Fatalf("parse the document send cases: %v", err)
	}
	if len(all.Offer) == 0 || len(all.Fields) == 0 {
		t.Fatal("a document send case list is empty")
	}
	return all.Offer, all.Fields
}

// dsCaseBody is a fields case's message: one paragraph of its text, padded
// with "a" to bodyHtmlLength characters of HTML when that is set.
func dsCaseBody(text string, length int) string {
	if length > 0 {
		text += strings.Repeat("a", length-len("<p></p>")-len(text))
	}
	return "<p>" + text + "</p>"
}

// Spec §3.1: each kind and status of the shared case table, through the route
// and through sendableStatus.
func TestDocumentSend_OfferCases(t *testing.T) {
	offer, _ := documentSendCases(t)
	env := newDSEnv(t)
	for _, c := range offer {
		t.Run(c.Name, func(t *testing.T) {
			if got := sendableStatus(c.Kind, c.Status); got != c.Message {
				t.Errorf("sendableStatus(%s, %s) = %q, want %q", c.Kind, c.Status, got, c.Message)
			}
			doc := env.doc(t, c.Kind, c.Status, nil)
			item := dsItem{Kind: c.Kind, ID: doc.Id, To: dsTo}
			answer := env.post(t, item)
			if c.Offered {
				requireSentOne(t, answer, item)
				return
			}
			requireFailed(t, answer, item, c.Message)
		})
	}
}

// Spec §3.2 and §3.4: each address, subject and message case of the shared
// case table, as a single send of a posted invoice.
func TestDocumentSend_FieldCases(t *testing.T) {
	_, fields := documentSendCases(t)
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	for _, c := range fields {
		t.Run(c.Name, func(t *testing.T) {
			item := dsItem{
				Kind: "invoice", ID: inv.Id, To: c.To, Cc: c.Cc,
				Subject: strp(c.Subject), Body: strp(dsCaseBody(c.BodyText, c.BodyHTMLLength)),
			}
			answer := env.post(t, item)
			if c.ServerMessage == "" {
				requireSentOne(t, answer, item)
				return
			}
			requireFailed(t, answer, item, c.ServerMessage)
		})
	}
}

// A single send carries the request's subject and message: the subject with
// its line break made a space, the frame around the sanitized message, its
// text part, To, Cc, Reply-To, From and the PDF.
func TestDocumentSend_SingleSendCarriesTheRequestTexts(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	body := `<p>Hello <strong>Ana</strong>,</p><p onclick="steal()">See <a href="https://x.example/a">the page</a>.</p><script>alert(1)</script>`
	cc := []string{"office@harborview.example", "owner@harborview.example"}
	item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo, Cc: cc, Subject: strp("Your invoice\nfrom Cedar Ledger Co"), Body: strp(body)}
	requireSentOne(t, env.post(t, item), item)

	requests := env.sender.to(dsTo)
	if len(requests) != 1 {
		t.Fatalf("%d requests to %s, want 1", len(requests), dsTo)
	}
	r := requests[0]
	if r.Subject != "Your invoice from Cedar Ledger Co" {
		t.Errorf("Subject = %q, want the line break as a space", r.Subject)
	}
	sanitized, err := sanitizeDocumentMessage(body)
	if err != nil {
		t.Fatalf("sanitizeDocumentMessage: %v", err)
	}
	business, err := loadDocumentBusiness(env.app)
	if err != nil {
		t.Fatalf("loadDocumentBusiness: %v", err)
	}
	if want := (documentBusiness{Name: dsBusiness, Phone: dsPhone, Email: dsBusinessEmail}); business != want {
		t.Errorf("loadDocumentBusiness = %+v, want %+v", business, want)
	}
	frame, err := documentEmailFrame(business, sanitized)
	if err != nil {
		t.Fatalf("documentEmailFrame: %v", err)
	}
	if r.HTMLBody != frame {
		t.Errorf("HTMLBody =\n%s\nwant the frame around the sanitized message\n%s", r.HTMLBody, frame)
	}
	if strings.Contains(r.HTMLBody, "<script") || strings.Contains(r.HTMLBody, "onclick") {
		t.Errorf("HTMLBody holds the unsanitized message:\n%s", r.HTMLBody)
	}
	if want := emailText(sanitized, business); r.TextBody != want {
		t.Errorf("TextBody =\n%q\nwant\n%q", r.TextBody, want)
	}
	if len(r.To) != 1 || r.To[0].Email != dsTo {
		t.Errorf("To = %+v, want %s alone", r.To, dsTo)
	}
	var gotCc []string
	for _, c := range r.Cc {
		gotCc = append(gotCc, c.Email)
	}
	if strings.Join(gotCc, ",") != strings.Join(cc, ",") {
		t.Errorf("Cc = %v, want %v", gotCc, cc)
	}
	if r.ReplyTo != env.users.bookkeeper.Email() {
		t.Errorf("ReplyTo = %q, want the sender's %q", r.ReplyTo, env.users.bookkeeper.Email())
	}
	from, err := mail.ParseAddress(r.From)
	if err != nil || from.Name != dsBusiness || from.Address != mailer.FromAddress(env.app) {
		t.Errorf("From = %q (%v), want %q <%s>", r.From, err, dsBusiness, mailer.FromAddress(env.app))
	}
	kind := documentKinds["invoice"]
	doc, err := kind.Build(env.app, reload(t, env.app, "books_invoices", inv.Id))
	if err != nil {
		t.Fatalf("build the invoice document: %v", err)
	}
	wantName := kind.FileName(doc) + ".pdf"
	if wantName != "invoice-"+inv.GetString("number")+".pdf" {
		t.Errorf("the PDF route names the file %q, want invoice-<number>.pdf", wantName)
	}
	if len(r.Attachments) != 1 {
		t.Fatalf("%d attachments, want 1", len(r.Attachments))
	}
	a := r.Attachments[0]
	if a.Name != wantName || a.ContentType != "application/pdf" {
		t.Errorf("attachment %q of type %q, want %q of type application/pdf", a.Name, a.ContentType, wantName)
	}
	if pdf, err := base64.StdEncoding.DecodeString(a.Content); err != nil || !strings.HasPrefix(string(pdf), "%PDF") {
		t.Errorf("the attachment is not a base64 PDF (err %v)", err)
	}
}

// Spec §4.4: an item carries both a subject and a message or neither; a
// message whose text is empty after the sanitizer, or that passes 50 000
// characters after it, is refused.
func TestDocumentSend_SubjectAndMessageRules(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	// Each "&" is one character in the request and five ("&amp;") after the
	// sanitizer: 19 990 of them are under 20 000 before and above 50 000 after.
	grows := "<p>" + strings.Repeat("&", 19_990) + "</p>"
	cases := []struct {
		name          string
		subject, body *string
		want          string
	}{
		{"a subject with no message", strp("Invoice 1001"), nil, msgDocumentMessage},
		{"a message with no subject", nil, strp("<p>Hello</p>"), msgDocumentSubject},
		{"a message of only an empty paragraph", strp("Invoice 1001"), strp("<p></p>"), msgDocumentMessage},
		{"a message of only a script", strp("Invoice 1001"), strp("<script>alert(1)</script>"), msgDocumentMessage},
		{"a message above 50 000 characters after the sanitizer", strp("Invoice 1001"), strp(grows), msgDocumentMessageLong},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo, Subject: c.subject, Body: c.body}
			requireFailed(t, env.post(t, item), item, c.want)
		})
	}
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent for refused items, want 0", n)
	}
	if msgDocumentMessage != "Enter a message." || msgDocumentSubject != "Enter a subject." ||
		msgDocumentMessageLong != "The message is too long. Shorten it and send again." {
		t.Errorf("the message texts are %q, %q, %q", msgDocumentMessage, msgDocumentSubject, msgDocumentMessageLong)
	}
}

// requireStartingTexts asserts the one request to address carries the
// starting subject and message documentEmail gives for record.
func (env *dsEnv) requireStartingTexts(t *testing.T, kind string, record *core.Record, address string) {
	t.Helper()
	requests := env.sender.to(address)
	if len(requests) != 1 {
		t.Fatalf("%d requests to %s, want 1", len(requests), address)
	}
	business, err := loadDocumentBusiness(env.app)
	if err != nil {
		t.Fatalf("loadDocumentBusiness: %v", err)
	}
	in, err := documentEmailInputOf(env.app, kind, reload(t, env.app, record.Collection().Name, record.Id), business)
	if err != nil {
		t.Fatalf("documentEmailInputOf: %v", err)
	}
	want := documentEmail(in)
	if requests[0].Subject != want.Subject {
		t.Errorf("%s: Subject = %q, want the starting %q", kind, requests[0].Subject, want.Subject)
	}
	sanitized, err := sanitizeDocumentMessage(want.BodyHTML)
	if err != nil {
		t.Fatalf("sanitizeDocumentMessage: %v", err)
	}
	if !strings.Contains(requests[0].HTMLBody, sanitized) {
		t.Errorf("%s: HTMLBody does not hold the starting message\n%s\ngot\n%s", kind, sanitized, requests[0].HTMLBody)
	}
}

// Spec §3.3 "Batch" and §4.4: a request of more than one document carries no
// subject and no message, and each document gets its own starting texts.
func TestDocumentSend_BatchTexts(t *testing.T) {
	t.Run("a subject in a request of two items fails both", func(t *testing.T) {
		env := newDSEnv(t)
		first := env.doc(t, "invoice", "posted", nil)
		second := env.doc(t, "sales_receipt", "posted", nil)
		items := []dsItem{
			{Kind: "invoice", ID: first.Id, To: dsTo, Subject: strp("Invoice"), Body: strp("<p>Hello</p>")},
			{Kind: "sales_receipt", ID: second.Id, To: "front@harborview.example"},
		}
		answer := env.post(t, items...)
		if len(answer.Sent) != 0 || len(answer.Failed) != 2 {
			t.Fatalf("answer %+v, want both items failed", answer)
		}
		for _, item := range items {
			if f, _ := answer.failure(item.ID); f != (dsFailure{Kind: item.Kind, ID: item.ID, Message: msgDocumentBatchText}) {
				t.Errorf("failure of %s = %+v, want %q", item.ID, f, msgDocumentBatchText)
			}
		}
		if n := env.sender.calls(); n != 0 {
			t.Errorf("%d emails sent, want 0", n)
		}
	})
	t.Run("two items with neither send the starting texts of each", func(t *testing.T) {
		env := newDSEnv(t)
		inv := env.doc(t, "invoice", "posted", nil)
		receipt := env.doc(t, "sales_receipt", "posted", nil)
		answer := env.post(t,
			dsItem{Kind: "invoice", ID: inv.Id, To: dsTo},
			dsItem{Kind: "sales_receipt", ID: receipt.Id, To: "front@harborview.example"},
		)
		if len(answer.Sent) != 2 || len(answer.Failed) != 0 {
			t.Fatalf("answer %+v, want both sent", answer)
		}
		env.requireStartingTexts(t, "invoice", inv, dsTo)
		env.requireStartingTexts(t, "sales_receipt", receipt, "front@harborview.example")
	})
	t.Run("a batch of one item with neither sends the starting texts", func(t *testing.T) {
		env := newDSEnv(t)
		est := env.doc(t, "estimate", "pending", nil)
		item := dsItem{Kind: "estimate", ID: est.Id, To: dsTo}
		requireSentOne(t, env.post(t, item), item)
		env.requireStartingTexts(t, "estimate", est, dsTo)
	})
	if msgDocumentBatchText != "A batch send cannot carry a subject or a message." {
		t.Errorf("msgDocumentBatchText = %q", msgDocumentBatchText)
	}
}

// Refusals of the whole request: more than 200 documents, no document, and a
// body with an unknown field.
func TestDocumentSend_RequestBounds(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	tooMany := make([]dsItem, maxDocumentsPerRequest+1)
	for i := range tooMany {
		tooMany[i] = dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
	}
	client := newSRClient(t, env.app)
	writer := tokenFor(t, env.users.bookkeeper)
	srRequireRefusal(t, "201 documents", client.do(writer, http.MethodPost, dsSendURL, dsBody(tooMany...)),
		http.StatusBadRequest, "Select at most 200 documents.")
	srRequireRefusal(t, "no document", client.do(writer, http.MethodPost, dsSendURL, dsBody()),
		http.StatusBadRequest, "The request is not valid.")
	srRequireRefusal(t, "an unknown field", client.do(writer, http.MethodPost, dsSendURL,
		`{"documents":[{"kind":"invoice","id":"`+inv.Id+`","to":"`+dsTo+`","cc":[],"bcc":["x@y.example"]}]}`),
		http.StatusBadRequest, "The request is not valid.")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent after refused requests, want 0", n)
	}
	if maxDocumentsPerRequest != 200 {
		t.Errorf("maxDocumentsPerRequest = %d, want 200", maxDocumentsPerRequest)
	}
}

// Spec §4.2 and §4.4: the stored row holds what was sent, the answer holds the
// row, and a second send of the same document is a second row with no change
// of the document.
func TestDocumentSend_StoredRow(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	updated := inv.GetString("updated")
	body := `<p class="x">Hello <em>Ana</em>,</p><p>Balance due</p>`
	item := dsItem{
		Kind: "invoice", ID: inv.Id, To: dsTo, Cc: []string{"office@harborview.example", "owner@harborview.example"},
		Subject: strp("Invoice " + inv.GetString("number")), Body: strp(body),
	}
	row := requireSentOne(t, env.post(t, item), item)
	id, _ := row["id"].(string)
	stored := reload(t, env.app, documentSendsCollection, id)
	sanitized, err := sanitizeDocumentMessage(body)
	if err != nil {
		t.Fatal(err)
	}
	business, err := loadDocumentBusiness(env.app)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"doc_type": "invoice", "document": inv.Id, "number": inv.GetString("number"),
		"customer": env.rr.customer.Id, "to": dsTo, "cc": "office@harborview.example, owner@harborview.example",
		"subject": "Invoice " + inv.GetString("number"), "body": sanitized,
		"body_text": emailText(sanitized, business), "sent_by": env.users.bookkeeper.Id,
	}
	for field, w := range want {
		if got := stored.GetString(field); got != w {
			t.Errorf("stored %s = %q, want %q", field, got, w)
		}
		if got, _ := row[field].(string); got != w {
			t.Errorf("answer's sent row %s = %q, want %q", field, got, w)
		}
	}
	if strings.Contains(stored.GetString("body"), dsBusiness) {
		t.Errorf("the stored body holds the frame: %q", stored.GetString("body"))
	}

	time.Sleep(5 * time.Millisecond)
	second := requireSentOne(t, env.post(t, item), item)
	if second["id"] == id {
		t.Errorf("the second send answered the first row %v, want a new row", id)
	}
	if n, _ := env.app.CountRecords(documentSendsCollection); n != 2 {
		t.Errorf("%d send rows after two sends, want 2", n)
	}
	if got := reload(t, env.app, "books_invoices", inv.Id).GetString("updated"); got != updated {
		t.Errorf("the invoice's updated moved from %q to %q: a send changed the document", updated, got)
	}
}

// Spec §3.6: a send is a "created" row of the Audit history with its actor.
func TestDocumentSend_AuditRow(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
	row := requireSentOne(t, env.post(t, item), item)
	id, _ := row["id"].(string)
	created := awaitAuditRow(t, env.app, documentSendsCollection, "created", id)
	if got := created.GetString("actor"); got != env.users.bookkeeper.Id {
		t.Errorf("created row actor = %q, want the sender %q", got, env.users.bookkeeper.Id)
	}
}

// Spec §3.7 and §4.4: only a Books writer with a session sends, and a
// document the user cannot read, or an id of another kind, is not found.
func TestDocumentSend_Access(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	one := dsBody(dsItem{Kind: "invoice", ID: inv.Id, To: dsTo})
	client := newSRClient(t, env.app)
	srRequireRefusal(t, "no session", client.do("", http.MethodPost, dsSendURL, one), http.StatusUnauthorized, "")
	srRequireRefusal(t, "a Books reader", client.do(tokenFor(t, env.users.readOnly), http.MethodPost, dsSendURL, one),
		http.StatusForbidden, "You do not have write access to Books.")
	srRequireRefusal(t, "no Books access", client.do(tokenFor(t, env.users.none), http.MethodPost, dsSendURL, one),
		http.StatusForbidden, "You do not have write access to Books.")
	// The token is minted before the account is disabled, as in production.
	disabled := tokenFor(t, env.users.admin)
	env.users.admin.Set("disabled", true)
	if err := env.app.Save(env.users.admin); err != nil {
		t.Fatalf("disable: %v", err)
	}
	srRequireRefusal(t, "a disabled account", client.do(disabled, http.MethodPost, dsSendURL, one), http.StatusForbidden, "")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent for refused requests, want 0", n)
	}

	otherKind := dsItem{Kind: "estimate", ID: inv.Id, To: dsTo}
	requireFailed(t, env.post(t, otherKind), otherKind, "Document not found.")

	rule := `id = "never"`
	col, err := env.app.FindCollectionByNameOrId("books_invoices")
	if err != nil {
		t.Fatal(err)
	}
	col.ViewRule = &rule
	if err := env.app.Save(col); err != nil {
		t.Fatalf("save the view rule: %v", err)
	}
	hidden := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
	requireFailed(t, env.post(t, hidden), hidden, "Document not found.")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent for documents not found, want 0", n)
	}
}

// Spec §4.4: with email not set up the request is refused.
func TestDocumentSend_EmailNotSetUp(t *testing.T) {
	t.Run("a sender that cannot attach a file", func(t *testing.T) {
		env := newDSEnv(t)
		srSwap(t, &emailSender, func(core.App) mailer.Sender { return srSendOnly{} })
		inv := env.doc(t, "invoice", "posted", nil)
		client := newSRClient(t, env.app)
		srRequireRefusal(t, "a sender that is not a FullSender", client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, dsSendURL,
			dsBody(dsItem{Kind: "invoice", ID: inv.Id, To: dsTo})), http.StatusBadRequest, "Email sending is not set up.")
	})
	t.Run("no capture log and no provider", func(t *testing.T) {
		env := newDSEnv(t)
		t.Setenv("TINYCLD_EMAIL_LOG", "")
		inv := env.doc(t, "invoice", "posted", nil)
		client := newSRClient(t, env.app)
		srRequireRefusal(t, "email not set up", client.do(tokenFor(t, env.users.bookkeeper), http.MethodPost, dsSendURL,
			dsBody(dsItem{Kind: "invoice", ID: inv.Id, To: dsTo})), http.StatusBadRequest, "Email sending is not set up.")
		if n := env.sender.calls(); n != 0 {
			t.Errorf("%d emails sent, want 0", n)
		}
		if n, _ := env.app.CountRecords(documentSendsCollection); n != 0 {
			t.Errorf("%d send rows, want 0", n)
		}
	})
}

// dsTwoPerHour stands in for documentEmailLimiter in the limit tests.
var dsTwoPerHour = ratelimit.NewPerApp("books.documents.send.test", 2, time.Hour)

// Spec §4.4: 500 document emails an hour for each user; an item refused before
// its send takes no token.
func TestDocumentSend_Limit(t *testing.T) {
	t.Run("at the bound every item fails", func(t *testing.T) {
		env := newDSEnv(t)
		srSwap(t, &documentEmailLimiter, dsTwoPerHour)
		limiter := dsTwoPerHour.For(env.app)
		for range 2 {
			if !limiter.Allow(env.users.bookkeeper.Id) {
				t.Fatal("the test limiter had no token to spend")
			}
		}
		first := env.doc(t, "invoice", "posted", nil)
		second := env.doc(t, "credit_memo", "posted", nil)
		answer := env.post(t,
			dsItem{Kind: "invoice", ID: first.Id, To: dsTo},
			dsItem{Kind: "credit_memo", ID: second.Id, To: dsTo},
		)
		want := "You have sent 500 document emails in the last hour. Try again later."
		for _, id := range []string{first.Id, second.Id} {
			if f, _ := answer.failure(id); f.Message != want {
				t.Errorf("failure of %s = %q, want %q", id, f.Message, want)
			}
		}
		if len(answer.Sent) != 0 || env.sender.calls() != 0 {
			t.Errorf("sent %d rows and %d emails, want none", len(answer.Sent), env.sender.calls())
		}
	})
	t.Run("a refused item takes no token", func(t *testing.T) {
		env := newDSEnv(t)
		srSwap(t, &documentEmailLimiter, dsTwoPerHour)
		draft := env.doc(t, "invoice", "draft", nil)
		badAddress := env.doc(t, "invoice", "posted", nil)
		first := env.doc(t, "sales_receipt", "posted", nil)
		second := env.doc(t, "refund_receipt", "posted", nil)
		answer := env.post(t,
			dsItem{Kind: "invoice", ID: draft.Id, To: dsTo},
			dsItem{Kind: "invoice", ID: badAddress.Id, To: "not-an-address"},
			dsItem{Kind: "sales_receipt", ID: first.Id, To: dsTo},
			dsItem{Kind: "refund_receipt", ID: second.Id, To: dsTo},
		)
		if len(answer.Sent) != 2 || len(answer.Failed) != 2 {
			t.Fatalf("answer %+v, want the two sent-able items sent with the limit of 2", answer)
		}
		if limiter := dsTwoPerHour.For(env.app); limiter.Allow(env.users.bookkeeper.Id) {
			t.Error("a token is left of 2 after two sends: a send took none")
		}
	})
}

// Spec §3.4 "Retries", the statements rule by the same code.
func TestDocumentSend_Retries(t *testing.T) {
	if emailSendTries != 3 {
		t.Errorf("emailSendTries = %d, want 3", emailSendTries)
	}
	t.Run("an error on the first two tries and a success on the third", func(t *testing.T) {
		env := newDSEnv(t)
		env.sender.errorTries = 2
		inv := env.doc(t, "invoice", "posted", nil)
		item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
		requireSentOne(t, env.post(t, item), item)
		if n := env.sender.calls(); n != 3 {
			t.Errorf("SendFull called %d times, want 3", n)
		}
	})
	t.Run("three errors fail, and each later item gets one try", func(t *testing.T) {
		env := newDSEnv(t)
		env.sender.errorTries = 1000
		items := []dsItem{}
		for _, kind := range []string{"invoice", "sales_receipt", "credit_memo"} {
			items = append(items, dsItem{Kind: kind, ID: env.doc(t, kind, "posted", nil).Id, To: dsTo})
		}
		answer := env.post(t, items...)
		if len(answer.Sent) != 0 || len(answer.Failed) != 3 {
			t.Fatalf("answer %+v, want all three failed", answer)
		}
		for _, item := range items {
			if f, _ := answer.failure(item.ID); f.Message != "The email could not be sent. Try again." {
				t.Errorf("failure of %s = %q, want \"The email could not be sent. Try again.\"", item.Kind, f.Message)
			}
		}
		if want := emailSendTries + 2; env.sender.calls() != want {
			t.Errorf("SendFull called %d times, want %d (3 tries, then one for each later item)", env.sender.calls(), want)
		}
	})
	t.Run("a refused recipient fails at once", func(t *testing.T) {
		env := newDSEnv(t)
		env.sender.rejectFor = "gone@harborview.example"
		inv := env.doc(t, "invoice", "posted", nil)
		item := dsItem{Kind: "invoice", ID: inv.Id, To: "gone@harborview.example"}
		requireFailed(t, env.post(t, item), item,
			"The email server refused gone@harborview.example. Correct the address and send again.")
		if n := env.sender.calls(); n != 1 {
			t.Errorf("SendFull called %d times, want 1", n)
		}
	})
}

// A part failure: the other items are sent.
func TestDocumentSend_PartFailure(t *testing.T) {
	env := newDSEnv(t)
	first := env.doc(t, "invoice", "posted", nil)
	draft := env.doc(t, "credit_memo", "draft", nil)
	third := env.doc(t, "estimate", "accepted", nil)
	answer := env.post(t,
		dsItem{Kind: "invoice", ID: first.Id, To: dsTo},
		dsItem{Kind: "credit_memo", ID: draft.Id, To: dsTo},
		dsItem{Kind: "estimate", ID: third.Id, To: dsTo},
	)
	if len(answer.Sent) != 2 || len(answer.Failed) != 1 {
		t.Fatalf("answer %+v, want two rows sent and one failure", answer)
	}
	if want := (dsFailure{Kind: "credit_memo", ID: draft.Id, Message: "A draft cannot be sent."}); answer.Failed[0] != want {
		t.Errorf("failed[0] = %+v, want %+v", answer.Failed[0], want)
	}
	documents := map[any]bool{answer.Sent[0]["document"]: true, answer.Sent[1]["document"]: true}
	if !documents[first.Id] || !documents[third.Id] {
		t.Errorf("sent rows %v, want the invoice and the estimate", answer.Sent)
	}
}

// Spec §4.4: when the email was sent and its row cannot be saved, the item
// says so.
func TestDocumentSend_SentButNotRecorded(t *testing.T) {
	env := newDSEnv(t)
	inv := env.doc(t, "invoice", "posted", nil)
	env.app.OnRecordCreateRequest(documentSendsCollection).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Priority: -1,
		Func: func(e *core.RecordRequestEvent) error {
			if _, err := e.App.DB().NewQuery("ALTER TABLE " + documentSendsCollection + " RENAME TO gone_" + documentSendsCollection).Execute(); err != nil {
				return err
			}
			return e.Next()
		},
	})
	item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
	requireFailed(t, env.post(t, item), item, "The email was sent, but the send could not be recorded.")
	if n := env.sender.calls(); n != 1 {
		t.Errorf("SendFull called %d times, want 1 (the email went out)", n)
	}
}

// Spec §4.2 "Each send is stored": a walk-in sales receipt names no customer
// (2100000011_create_books_sales_receipts.js), and its send is stored too, with
// an empty customer, so the read view's sent line and the history have a row.
func TestDocumentSend_WalkInReceiptIsStored(t *testing.T) {
	env := newDSEnv(t)
	const address = "counter@walkin.example"
	receipt := env.doc(t, "sales_receipt", "posted", map[string]any{"customer": "", "email": address})
	if got := receipt.GetString("customer"); got != "" {
		t.Fatalf("the stored receipt names customer %q, want a walk-in receipt", got)
	}
	item := dsItem{Kind: "sales_receipt", ID: receipt.Id, To: address}
	row := requireSentOne(t, env.post(t, item), item)
	if n := len(env.sender.to(address)); n != 1 {
		t.Errorf("%d emails to %s, want 1", n, address)
	}
	stored, err := env.app.FindRecordsByFilter(documentSendsCollection,
		"doc_type = 'sales_receipt' && document = {:id}", "", 0, 0, map[string]any{"id": receipt.Id})
	if err != nil {
		t.Fatalf("read the send rows: %v", err)
	}
	if len(stored) != 1 {
		t.Fatalf("%d stored send rows for the walk-in receipt, want 1", len(stored))
	}
	if got := stored[0].GetString("customer"); got != "" {
		t.Errorf("stored customer = %q, want \"\"", got)
	}
	if got := stored[0].GetString("to"); got != address {
		t.Errorf("stored to = %q, want %q", got, address)
	}
	if row["id"] != stored[0].Id {
		t.Errorf("answer's sent row id %v, want the stored row %q", row["id"], stored[0].Id)
	}
}

// Spec §4.4: a send row that cannot be stored stops the send before its
// email, so no email goes out that the history cannot show. The test makes the
// row's customer required again, so a walk-in receipt's row breaks a field
// rule of the collection.
func TestDocumentSend_InvalidRowSendsNoEmail(t *testing.T) {
	env := newDSEnv(t)
	const address = "counter@walkin.example"
	receipt := env.doc(t, "sales_receipt", "posted", map[string]any{"customer": "", "email": address})
	col, err := env.app.FindCollectionByNameOrId(documentSendsCollection)
	if err != nil {
		t.Fatal(err)
	}
	customer, ok := col.Fields.GetByName("customer").(*core.RelationField)
	if !ok {
		t.Fatalf("the send collection's customer field is %T, want a relation", col.Fields.GetByName("customer"))
	}
	customer.Required = true
	if err := env.app.Save(col); err != nil {
		t.Fatalf("make the customer required: %v", err)
	}
	item := dsItem{Kind: "sales_receipt", ID: receipt.Id, To: address}
	answer := env.post(t, item)
	if len(answer.Sent) != 0 || len(answer.Failed) != 1 {
		t.Fatalf("answer %+v, want no row sent and one failure", answer)
	}
	if f := answer.Failed[0]; f.ID != receipt.Id || f.Message == "" || f.Message == msgDocumentSentNotSaved {
		t.Errorf("failed[0] = %+v, want the receipt failed before its email, not %q", f, msgDocumentSentNotSaved)
	}
	if n := env.sender.calls(); n != 0 {
		t.Errorf("SendFull called %d times, want 0: a row that cannot be stored sent its email", n)
	}
	if n, _ := env.app.CountRecords(documentSendsCollection); n != 0 {
		t.Errorf("%d send rows, want 0", n)
	}
}

// Spec §4.4: a PDF above the size bound is refused before its email.
func TestDocumentSend_FileTooLarge(t *testing.T) {
	env := newDSEnv(t)
	srSwap(t, &maxDocumentFileBytes, 1)
	inv := env.doc(t, "invoice", "posted", nil)
	item := dsItem{Kind: "invoice", ID: inv.Id, To: dsTo}
	requireFailed(t, env.post(t, item), item, "The PDF is larger than 10 MB.")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("SendFull called %d times, want 0", n)
	}
}

type dsLogged struct {
	To []struct {
		Email string `json:"email"`
	} `json:"to"`
	Cc []struct {
		Email string `json:"email"`
	} `json:"cc"`
	Subject         string   `json:"subject"`
	HTML            string   `json:"html"`
	Text            string   `json:"text"`
	ReplyTo         string   `json:"reply_to"`
	AttachmentNames []string `json:"attachment_names"`
}

// Spec §4.6: through the real LogSender, the e2e capture log line of a send
// holds the PDF's name, the HTML and the text part, Cc and Reply-To.
func TestDocumentSend_CaptureLog(t *testing.T) {
	env := newDSEnv(t)
	srSwap(t, &emailSender, mailer.DefaultSender)
	inv := env.doc(t, "invoice", "posted", nil)
	item := dsItem{
		Kind: "invoice", ID: inv.Id, To: dsTo, Cc: []string{"office@harborview.example"},
		Subject: strp("Invoice " + inv.GetString("number")), Body: strp("<p>Hello <strong>Ana</strong></p>"),
	}
	requireSentOne(t, env.post(t, item), item)

	f, err := os.Open(env.logPath)
	if err != nil {
		t.Fatalf("open the capture log: %v", err)
	}
	defer f.Close()
	var lines []dsLogged
	scan := bufio.NewScanner(f)
	scan.Buffer(make([]byte, 1<<20), 1<<24)
	for scan.Scan() {
		var m dsLogged
		if err := json.Unmarshal(scan.Bytes(), &m); err != nil {
			t.Fatalf("a capture log line is not JSON: %v", err)
		}
		if len(m.To) == 1 && m.To[0].Email == dsTo {
			lines = append(lines, m)
		}
	}
	if len(lines) != 1 {
		t.Fatalf("%d capture log lines to %s, want 1", len(lines), dsTo)
	}
	m := lines[0]
	if want := []string{"invoice-" + inv.GetString("number") + ".pdf"}; strings.Join(m.AttachmentNames, "|") != strings.Join(want, "|") {
		t.Errorf("attachment_names = %q, want %q", m.AttachmentNames, want)
	}
	if !strings.Contains(m.HTML, "<p>Hello <strong>Ana</strong></p>") || !strings.Contains(m.HTML, dsBusiness) {
		t.Errorf("html = %q, want the frame with the message", m.HTML)
	}
	business, err := loadDocumentBusiness(env.app)
	if err != nil {
		t.Fatal(err)
	}
	if want := emailText("<p>Hello <strong>Ana</strong></p>", business); m.Text != want {
		t.Errorf("text = %q, want %q", m.Text, want)
	}
	if len(m.Cc) != 1 || m.Cc[0].Email != "office@harborview.example" {
		t.Errorf("cc = %+v, want office@harborview.example", m.Cc)
	}
	if m.ReplyTo != env.users.bookkeeper.Email() {
		t.Errorf("reply_to = %q, want %q", m.ReplyTo, env.users.bookkeeper.Email())
	}
}

// closeOrderBySQL closes the order as an admin's Close leaves it, written
// past the guards (the Close route is not what these tests check).
func closeOrderBySQL(t *testing.T, app core.App, orderID string) {
	t.Helper()
	if _, err := app.DB().NewQuery(
		"UPDATE books_purchase_orders SET status = 'closed', closed_reason = 'manual', open_amount = 0 WHERE id = {:id}").
		Bind(dbx.Params{"id": orderID}).Execute(); err != nil {
		t.Fatalf("close the order: %v", err)
	}
}

// dsOrderTo is the Email of the purchase order a send test saves.
const dsOrderTo = "orders@northwind-supply.example"

// purchaseOrder saves open order 1004 for Northwind Supply with its Email and
// one account line of 250.00 on 6150 Shop Supplies, through every guard.
func (env *dsEnv) purchaseOrder(t *testing.T) (order, vendor *core.Record) {
	t.Helper()
	if _, err := env.app.DB().NewQuery("UPDATE books_doc_sequences SET next_number = 1004 WHERE id = {:id}").
		Bind(dbx.Params{"id": poSequenceID}).Execute(); err != nil {
		t.Fatalf("move the purchase order sequence to 1004: %v", err)
	}
	vendor = mkVendor(t, env.app, "Northwind Supply")
	supplies := mkNumberedAccount(t, env.app, "Shop Supplies", "6150", "expense", "dues_subscriptions")
	order = mkPO(t, env.app, vendor, map[string]any{"email": dsOrderTo})
	mkPOLine(t, env.app, order, 0, accountLine(supplies, 25000))
	order = reload(t, env.app, "books_purchase_orders", order.Id)
	if order.GetString("number") != "1004" || order.GetString("status") != "open" {
		t.Fatalf("order number %q status %q, want open 1004", order.GetString("number"), order.GetString("status"))
	}
	return order, vendor
}

// Spec §3.6 Email: a purchase order is sent to its vendor: the stored row
// names the vendor and no customer, the subject is "Purchase order 1004 from
// <business name>", the order's PDF is the one attachment, and the email has
// no online link.
func TestDocumentSend_APurchaseOrderGoesToItsVendor(t *testing.T) {
	env := newDSEnv(t)
	order, vendor := env.purchaseOrder(t)
	item := dsItem{Kind: "purchase_order", ID: order.Id, To: dsOrderTo}
	row := requireSentOne(t, env.post(t, item), item)

	id, _ := row["id"].(string)
	stored := reload(t, env.app, documentSendsCollection, id)
	want := map[string]string{
		"doc_type": "purchase_order", "document": order.Id, "number": "1004",
		"vendor": vendor.Id, "customer": "", "to": dsOrderTo,
		"subject": "Purchase order 1004 from " + dsBusiness, "sent_by": env.users.bookkeeper.Id,
	}
	for field, w := range want {
		if got := stored.GetString(field); got != w {
			t.Errorf("stored %s = %q, want %q", field, got, w)
		}
	}

	requests := env.sender.to(dsOrderTo)
	if len(requests) != 1 {
		t.Fatalf("%d requests to %s, want 1", len(requests), dsOrderTo)
	}
	r := requests[0]
	if r.Subject != "Purchase order 1004 from "+dsBusiness {
		t.Errorf("Subject = %q, want %q", r.Subject, "Purchase order 1004 from "+dsBusiness)
	}
	if len(r.Attachments) != 1 {
		t.Fatalf("%d attachments, want the order's PDF alone", len(r.Attachments))
	}
	a := r.Attachments[0]
	if a.Name != "purchase-order-1004.pdf" || a.ContentType != "application/pdf" {
		t.Errorf("attachment %q of type %q, want purchase-order-1004.pdf of type application/pdf", a.Name, a.ContentType)
	}
	if pdf, err := base64.StdEncoding.DecodeString(a.Content); err != nil || !strings.HasPrefix(string(pdf), "%PDF") {
		t.Errorf("the attachment is not a base64 PDF (err %v)", err)
	}
	for part, body := range map[string]string{"HTMLBody": r.HTMLBody, "TextBody": r.TextBody} {
		if strings.Contains(body, dsAppURL) || strings.Contains(body, "href") || strings.Contains(body, order.Id) {
			t.Errorf("%s holds a link to the order:\n%s", part, body)
		}
	}
}

// Spec §3.6: Send… is offered on an open order only; the route refuses a
// closed order with no email and no stored row.
func TestDocumentSend_AClosedPurchaseOrderIsNotSent(t *testing.T) {
	env := newDSEnv(t)
	order, _ := env.purchaseOrder(t)
	closeOrderBySQL(t, env.app, order.Id)
	item := dsItem{Kind: "purchase_order", ID: order.Id, To: dsOrderTo}
	requireFailed(t, env.post(t, item), item, "A closed purchase order cannot be sent.")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent for a closed order, want 0", n)
	}
	if n, _ := env.app.CountRecords(documentSendsCollection); n != 0 {
		t.Errorf("%d send rows after the refusal, want 0", n)
	}
}

// Spec §3.7: a Books reader cannot send a purchase order.
func TestDocumentSend_AReaderCannotSendAPurchaseOrder(t *testing.T) {
	env := newDSEnv(t)
	order, _ := env.purchaseOrder(t)
	one := dsBody(dsItem{Kind: "purchase_order", ID: order.Id, To: dsOrderTo})
	client := newSRClient(t, env.app)
	srRequireRefusal(t, "a Books reader", client.do(tokenFor(t, env.users.readOnly), http.MethodPost, dsSendURL, one),
		http.StatusForbidden, "You do not have write access to Books.")
	if n := env.sender.calls(); n != 0 {
		t.Errorf("%d emails sent for a reader's send, want 0", n)
	}
	if n, _ := env.app.CountRecords(documentSendsCollection); n != 0 {
		t.Errorf("%d send rows after the refusal, want 0", n)
	}
}
