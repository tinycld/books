package books

import (
	"bytes"
	"fmt"
	"html"
	"html/template"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"tinycld.org/core/branding"
	corehtml "tinycld.org/core/html"
	// pdf_render_test.go declares a func render in this package.
	corerender "tinycld.org/core/render"
)

// The email of a sales document (email-share spec §3.4): its starting subject
// and message, the sanitizer step, the frame and the text part. TS
// lib/document-email.ts mirrors documentEmail; testdata/document_email_cases.json
// pins both.

// documentBusiness is the sender of a document email: the name it signs with,
// and the phone and the email address its closing sentence and footer name.
type documentBusiness struct {
	Name, Phone, Email string
}

// loadDocumentBusiness reads the business name (books_settings.business_name,
// else the organization's name), the business phone and the business email.
func loadDocumentBusiness(app core.App) (documentBusiness, error) {
	s, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return documentBusiness{}, fmt.Errorf("books: read settings: %w", err)
	}
	name := strings.TrimSpace(s.GetString("business_name"))
	if name == "" {
		name = strings.TrimSpace(branding.Load(app).Name)
	}
	return documentBusiness{
		Name:  name,
		Phone: strings.TrimSpace(s.GetString("phone")),
		Email: strings.TrimSpace(s.GetString("email")),
	}, nil
}

// documentEmailInput is the plain data of one document's starting email, every
// value printed already. Its JSON is the input of a case of
// testdata/document_email_cases.json, which TypeScript reads too.
type documentEmailInput struct {
	Kind           string `json:"kind"`
	Number         string `json:"number"`
	CustomerName   string `json:"customerName"`
	BusinessName   string `json:"businessName"`
	BusinessPhone  string `json:"businessPhone"`
	Date           string `json:"date"`
	DueDate        string `json:"dueDate"`
	ExpirationDate string `json:"expirationDate"`
	Total          string `json:"total"`
	Balance        string `json:"balance"`
	BalanceIsZero  bool   `json:"balanceIsZero"`
	Message        string `json:"message"`
	Link           string `json:"link"`
	// CanRespond is true for an estimate that is pending and not expired: the
	// link asks the customer to accept or decline it.
	CanRespond bool `json:"canRespond"`
}

// documentMessage is a document email's subject and message HTML.
type documentMessage struct {
	Subject, BodyHTML string
}

// documentEmailWords are a kind's word at the start of the subject and its
// word inside a sentence.
var documentEmailWords = map[string]struct{ title, noun string }{
	docTypeInvoice:       {"Invoice", "invoice"},
	docTypeEstimate:      {"Estimate", "estimate"},
	docTypeSalesReceipt:  {"Sales receipt", "sales receipt"},
	docTypeCreditMemo:    {"Credit memo", "credit memo"},
	docTypeRefundReceipt: {"Refund receipt", "refund receipt"},
	docTypePurchaseOrder: {"Purchase order", "purchase order"},
}

// messageLineBreaks turns each line break of the document's (escaped) message
// into a <br>.
var messageLineBreaks = strings.NewReplacer("\r\n", "<br>", "\n", "<br>", "\r", "<br>")

// greeting is "Hello <name>,", or "Hello," for a document that names no
// customer (a walk-in sale), so no space comes before the comma.
func greeting(name string) string {
	if name == "" {
		return "Hello,"
	}
	return "Hello " + name + ","
}

// documentEmail builds the starting subject and message of in (spec §3.4).
// Each block is one <p>, a line break inside a block is a <br>, and every
// filled value is HTML-escaped.
func documentEmail(in documentEmailInput) documentMessage {
	words := documentEmailWords[in.Kind]
	name := oneLine(in.BusinessName)
	esc := html.EscapeString
	var b strings.Builder
	block := func(lines ...string) {
		b.WriteString("<p>")
		b.WriteString(strings.Join(lines, "<br>"))
		b.WriteString("</p>")
	}
	link := func(lead string) {
		href := esc(in.Link)
		block(lead, `<a href="`+href+`">`+href+`</a>`)
	}
	// A name that ends with a period ends the sentence (plan decision 10).
	period := "."
	if strings.HasSuffix(name, ".") {
		period = ""
	}
	block(greeting(esc(oneLine(in.CustomerName))))
	block("Attached is " + words.noun + " " + esc(in.Number) + " from " + esc(name) + period)
	closing := "To ask about this " + words.noun + ", reply to this email"
	switch in.Kind {
	case docTypeInvoice:
		balance := "Balance due: " + esc(in.Balance)
		if in.BalanceIsZero {
			balance += ". No payment is due."
		} else {
			closing = "To pay, or to ask about this invoice, reply to this email"
		}
		block("Invoice date: "+esc(in.Date), "Due date: "+esc(in.DueDate), "Total: "+esc(in.Total),
			"<strong>"+balance+"</strong>")
	case docTypeEstimate:
		lines := []string{"Estimate date: " + esc(in.Date)}
		if in.ExpirationDate != "" {
			lines = append(lines, "Expires: "+esc(in.ExpirationDate))
		}
		block(append(lines, "Total: "+esc(in.Total))...)
	case docTypeSalesReceipt:
		block("Date: "+esc(in.Date), "Total: "+esc(in.Total), "Paid. No payment is due.")
	case docTypeCreditMemo:
		block("Date: "+esc(in.Date), "Credit: "+esc(in.Total), "Unapplied credit: "+esc(in.Balance))
	case docTypeRefundReceipt:
		block("Date: "+esc(in.Date), "Refund: "+esc(in.Total))
	}
	if in.Message != "" {
		block(messageLineBreaks.Replace(esc(in.Message)))
	}
	switch {
	case in.Kind == docTypeInvoice:
		link("View this invoice online:")
	case in.Kind == docTypeEstimate && in.CanRespond:
		link("To accept or decline this estimate, open:")
	case in.Kind == docTypeEstimate:
		link("View this estimate online:")
	}
	if phone := oneLine(in.BusinessPhone); phone != "" {
		closing += " or call " + esc(phone)
	}
	block(closing + ".")
	return documentMessage{
		Subject:  words.title + " " + oneLine(in.Number) + " from " + name,
		BodyHTML: b.String(),
	}
}

// documentLinkPaths are the public page paths of the kinds with a customer
// link (TS lib/document-link.ts).
var documentLinkPaths = map[string]string{
	docTypeInvoice:  "/p/books/invoices/",
	docTypeEstimate: "/p/books/estimates/",
}

// documentEmailInputOf fills the input of record's starting email: the money
// through formatMoney in the document's currency (else the book's, as the PDF
// prints it), the days through formatDay, the party's display name (the
// vendor of a purchase order, else the customer; an empty name for a document
// with no customer), and the customer link from the server address and the
// row's public_token. A purchase order has no link: the vendor gets the PDF.
func documentEmailInputOf(app core.App, kind string, record *core.Record, business documentBusiness) (documentEmailInput, error) {
	if _, ok := documentEmailWords[kind]; !ok {
		return documentEmailInput{}, fmt.Errorf("books: no document email for kind %q", kind)
	}
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return documentEmailInput{}, fmt.Errorf("books: read settings: %w", err)
	}
	customerName, err := documentPartyName(app, kind, record)
	if err != nil {
		return documentEmailInput{}, err
	}
	currency := record.GetString("currency")
	if currency == "" {
		currency = settings.GetString("currency")
	}
	money := func(field string) string { return formatMoney(int64(record.GetInt(field)), currency) }
	in := documentEmailInput{
		Kind:          kind,
		Number:        record.GetString("number"),
		CustomerName:  customerName,
		BusinessName:  business.Name,
		BusinessPhone: business.Phone,
		Date:          formatDay(record.GetString("date")),
		Total:         money("total"),
		Message:       strings.TrimSpace(record.GetString("message")),
	}
	if path, ok := documentLinkPaths[kind]; ok {
		in.Link = strings.TrimRight(app.Settings().Meta.AppURL, "/") + path + record.GetString("public_token")
	}
	switch kind {
	case docTypeInvoice:
		in.DueDate = formatDay(record.GetString("due_date"))
		in.Balance = money("balance")
		in.BalanceIsZero = record.GetInt("balance") == 0
	case docTypeCreditMemo:
		in.Balance = money("balance")
		in.BalanceIsZero = record.GetInt("balance") == 0
	case docTypeEstimate:
		expiration := record.GetString("expiration_date")
		if expiration != "" {
			in.ExpirationDate = formatDay(expiration)
		}
		in.CanRespond = record.GetString("status") == statusPending && !estimateExpired(expiration, time.Now())
	}
	return in, nil
}

// documentPartyName is the display name of the party a document's email
// greets: a purchase order's vendor, else the document's customer. A walk-in
// sales or refund receipt names no customer (2100000011 "Optional: a walk-in
// sale names no customer"): its email names nobody.
func documentPartyName(app core.App, kind string, record *core.Record) (string, error) {
	collection, field := "books_customers", "customer"
	if kind == docTypePurchaseOrder {
		collection, field = "books_vendors", "vendor"
	}
	id := record.GetString(field)
	if id == "" {
		return "", nil
	}
	party, err := app.FindRecordById(collection, id)
	if err != nil {
		return "", fmt.Errorf("books: read the document's %s: %w", field, err)
	}
	return party.GetString("display_name"), nil
}

// estimateExpired is true when expiration is a day before now's day (UTC), as
// the response guard reads it (checkEstimateResponse). No expiration never
// expires.
func estimateExpired(expiration string, now time.Time) bool {
	if expiration == "" {
		return false
	}
	day, err := parseDay(expiration)
	if err != nil {
		return false
	}
	return day.Format(dayLayout) < todayUTC(now)
}

// documentEmailAllowlist is what a document email's message keeps (spec §3.4
// step 1). No editor class starts with the prefix, so every class is dropped.
var documentEmailAllowlist = corerender.Allowlist{
	Tags: map[string]struct{}{
		"p": {}, "br": {}, "strong": {}, "b": {}, "em": {}, "i": {}, "u": {}, "s": {},
		"ul": {}, "ol": {}, "li": {}, "blockquote": {}, "h1": {}, "h2": {}, "h3": {},
		"code": {}, "pre": {}, "hr": {}, "a": {},
	},
	Attrs:           map[string]map[string]struct{}{"a": {"href": {}}},
	ClassPrefix:     "books-email-",
	AllowHrefMailto: true,
}

// sanitizeDocumentMessage is the message HTML that a document email sends.
func sanitizeDocumentMessage(message string) (string, error) {
	return corerender.Sanitize(message, documentEmailAllowlist)
}

// documentFooterLine signs a document email: "<name>[ · <phone>][ · <email>]".
func documentFooterLine(business documentBusiness) string {
	return strings.Join(nonEmpty(oneLine(business.Name), oneLine(business.Phone), oneLine(business.Email)), " · ")
}

// documentEmailFrameTemplate is the HTML part of a document email. Its styles
// are fixed light values of the email, as the PDF template has; the message
// is sanitized before it gets here.
var documentEmailFrameTemplate = template.Must(template.New("document-email").Parse(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
<div style="padding: 24px 12px; background-color: #f4f4f5; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; color: #18181b; font-size: 15px; line-height: 1.5;">
<div style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #18181b;">{{.Name}}</div>
<div>{{.Message}}</div>
<div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #71717a;">{{.Footer}}</div>
</div>
</div>
</body>
</html>
`))

// documentEmailFrame puts the frame around a sanitized message (spec §3.4
// step 2): the business name as the header, the message, the footer line.
func documentEmailFrame(business documentBusiness, messageHTML string) (string, error) {
	var b bytes.Buffer
	err := documentEmailFrameTemplate.Execute(&b, struct {
		Name    string
		Message template.HTML
		Footer  string
	}{
		Name: oneLine(business.Name),
		// The message is sanitized by sanitizeDocumentMessage.
		Message: template.HTML(messageHTML),
		Footer:  documentFooterLine(business),
	})
	if err != nil {
		return "", fmt.Errorf("books: frame a document email: %w", err)
	}
	return b.String(), nil
}

// emailText is the text part of a sanitized message (spec §3.4 step 3): each
// top-level block its own paragraph, a <br> a line break, a line for each list
// item ("- " in a ul, "1. " in an ol), each line through core
// html.PlainText, the blocks joined by a blank line, and the footer line after
// a blank line.
func emailText(messageHTML string, business documentBusiness) string {
	var blocks []string
	nodes, err := nethtml.ParseFragment(strings.NewReader(messageHTML),
		&nethtml.Node{Type: nethtml.ElementNode, DataAtom: atom.Body, Data: "body"})
	if err != nil {
		// The sanitizer wrote messageHTML, so the parser takes it; this keeps
		// the text of a fragment it would not.
		blocks = nonEmpty(corehtml.PlainText(messageHTML))
	}
	var inline textLines
	flushInline := func() {
		blocks = append(blocks, inline.block()...)
		inline = textLines{}
	}
	for _, n := range nodes {
		if !isTextBlock(n) {
			inline.add(n)
			continue
		}
		flushInline()
		var lines textLines
		lines.add(n)
		blocks = append(blocks, lines.block()...)
	}
	flushInline()
	return strings.Join(append(blocks, documentFooterLine(business)), "\n\n")
}

// textBlocks are the elements that start a line of their own in the text part.
var textBlocks = map[atom.Atom]bool{
	atom.P: true, atom.Blockquote: true, atom.H1: true, atom.H2: true, atom.H3: true,
	atom.Pre: true, atom.Hr: true, atom.Ul: true, atom.Ol: true, atom.Li: true, atom.Div: true,
}

func isTextBlock(n *nethtml.Node) bool {
	return n.Type == nethtml.ElementNode && textBlocks[n.DataAtom]
}

// textLines gathers the lines of one block of the text part. cur holds the
// escaped text of the line being written; each line goes through
// html.PlainText when it ends.
type textLines struct {
	lines []string
	cur   strings.Builder
	pre   bool
}

// end finishes the current line; an empty one is kept only for a <br>.
func (t *textLines) end(keepEmpty bool) {
	line := corehtml.PlainText(t.cur.String())
	t.cur.Reset()
	if line != "" || keepEmpty {
		t.lines = append(t.lines, line)
	}
}

// add writes n and its children.
func (t *textLines) add(n *nethtml.Node) {
	switch n.Type {
	case nethtml.TextNode:
		if !t.pre {
			t.cur.WriteString(html.EscapeString(n.Data))
			return
		}
		for i, part := range strings.Split(n.Data, "\n") {
			if i > 0 {
				t.end(true)
			}
			t.cur.WriteString(html.EscapeString(part))
		}
		return
	case nethtml.ElementNode:
	default:
		return
	}
	switch n.DataAtom {
	case atom.Br:
		t.end(true)
	case atom.Ul, atom.Ol:
		t.end(false)
		number := 0
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type != nethtml.ElementNode {
				continue
			}
			number++
			prefix := "- "
			if n.DataAtom == atom.Ol {
				prefix = fmt.Sprintf("%d. ", number)
			}
			var item textLines
			item.add(c)
			lines := item.trimmed()
			if len(lines) == 0 {
				continue
			}
			lines[0] = prefix + lines[0]
			t.lines = append(t.lines, lines...)
		}
	default:
		if !isTextBlock(n) {
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				t.add(c)
			}
			return
		}
		t.end(false)
		wasPre := t.pre
		t.pre = t.pre || n.DataAtom == atom.Pre
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			t.add(c)
		}
		t.pre = wasPre
		t.end(false)
	}
}

// trimmed ends the current line and is the lines with no empty line at
// either end.
func (t *textLines) trimmed() []string {
	t.end(false)
	lines := t.lines
	for len(lines) > 0 && lines[0] == "" {
		lines = lines[1:]
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// block is the block's text, or nothing when it has none.
func (t *textLines) block() []string {
	lines := t.trimmed()
	if len(lines) == 0 {
		return nil
	}
	return []string{strings.Join(lines, "\n")}
}
