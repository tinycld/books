package books

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	corehtml "tinycld.org/core/html"
	"tinycld.org/core/mailer"
	"tinycld.org/core/ratelimit"
	"tinycld.org/core/reports"
)

// The document send route (email-share spec §4.4): POST
// /api/books/documents/send emails each sales document to its customer with
// its PDF, and stores one books_document_sends row for each sent email. Like
// the PDF routes it is session only: it is not in the OAuth registration, so
// core's grant middleware denies it to every token.

// The whole-request and per-document texts of the route.
const (
	msgDocumentTooMany          = "Select at most 200 documents."
	msgDocumentEmailLimit       = "You have sent 500 document emails in the last hour. Try again later."
	msgDocumentNotFound         = "Document not found."
	msgDocumentDraft            = "A draft cannot be sent."
	msgDocumentVoid             = "A void document cannot be sent."
	msgDocumentClosed           = "A closed estimate cannot be sent."
	msgDocumentAddress          = "Enter a valid email address."
	msgDocumentBatchText        = "A batch send cannot carry a subject or a message."
	msgDocumentSubject          = "Enter a subject."
	msgDocumentSubjectLong      = "Use 300 characters or fewer."
	msgDocumentMessageLong      = "The message is too long. Shorten it and send again."
	msgDocumentMessage          = "Enter a message."
	msgDocumentFileTooLarge     = "The PDF is larger than 10 MB."
	msgDocumentNoAccess         = "You do not have write access to Books."
	msgDocumentEmailNotSetUp    = "Email sending is not set up."
	msgDocumentNotSent          = "The email could not be sent. Try again."
	msgDocumentRecipientRefused = "The email server refused %s. Correct the address and send again."
	msgDocumentSentNotSaved     = "The email was sent, but the send could not be recorded."
	msgDocumentBadRequest       = "The request is not valid."
	msgDocumentSignIn           = "Sign in to send documents."
)

// maxDocumentsPerRequest bounds one send (MAX_SEND_DOCUMENTS in
// lib/document-send.ts).
const maxDocumentsPerRequest = 200

// The bounds of a single send's texts, counted in UTF-16 code units as the
// client's schema counts a string's length (lib/document-send.ts). The stored
// row's body and body_text hold at most maxSanitizedMessage characters.
const (
	maxDocumentCc       = 5
	maxDocumentSubject  = 300
	maxDocumentMessage  = 20_000
	maxSanitizedMessage = 50_000
	documentSendPath    = "/api/books/documents/send"
)

// maxDocumentFileBytes is the largest document PDF the send attaches. A var
// so a test can lower it.
var maxDocumentFileBytes = 10 << 20

// documentEmailLimiter allows each user 500 document emails an hour.
var documentEmailLimiter = ratelimit.NewPerApp("books.documents.send", 500, time.Hour)

// documentDeliveryTexts are the document texts of one delivery
// (email_delivery.go).
var documentDeliveryTexts = emailDeliveryTexts{
	NotSent: msgDocumentNotSent, RecipientRefused: msgDocumentRecipientRefused,
}

func bindDocumentSendRoutes(e *core.ServeEvent) {
	e.Router.POST(documentSendPath, serveDocumentSend)
}

// documentSendItem is one document of a send. Subject and Body are given
// together, and only in a request of one document.
type documentSendItem struct {
	Kind    string   `json:"kind"`
	ID      string   `json:"id"`
	To      string   `json:"to"`
	Cc      []string `json:"cc"`
	Subject *string  `json:"subject"`
	Body    *string  `json:"body"`
}

type documentSendBody struct {
	Documents []documentSendItem `json:"documents"`
}

type documentSendFailure struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Message string `json:"message"`
}

// sendableStatus is "" when a document of kind in status can be sent (spec
// §3.1), else the refusal: a posting kind sends when posted, an estimate when
// pending, accepted or rejected.
func sendableStatus(kind, status string) string {
	if kind == docTypeEstimate {
		switch status {
		case statusPending, statusAccepted, statusRejected:
			return ""
		}
		return msgDocumentClosed
	}
	switch status {
	case statusPosted:
		return ""
	case statusVoid:
		return msgDocumentVoid
	}
	return msgDocumentDraft
}

// serveDocumentSend emails each document to its address with its PDF, and
// stores a send row for each email. A document that fails is listed with its
// message and the others go on.
func serveDocumentSend(re *core.RequestEvent) error {
	if err := requireBooksWriter(re, msgDocumentSignIn, msgDocumentNoAccess); err != nil {
		return err
	}
	info, err := re.RequestInfo()
	if err != nil {
		return err
	}
	var body documentSendBody
	if err := decodeBooksBody(re, &body, msgDocumentBadRequest); err != nil {
		return err
	}
	switch {
	case len(body.Documents) == 0:
		return re.BadRequestError(msgDocumentBadRequest, nil)
	case len(body.Documents) > maxDocumentsPerRequest:
		return re.BadRequestError(msgDocumentTooMany, nil)
	}
	for _, item := range body.Documents {
		if !sendDocTypes[item.Kind] || item.ID == "" {
			return re.BadRequestError(msgDocumentBadRequest, nil)
		}
	}
	sent := []*core.Record{}
	failed := []documentSendFailure{}
	// A batch sends the starting texts of each document (spec §3.3 "Batch").
	if len(body.Documents) > 1 && carriesText(body.Documents) {
		for _, item := range body.Documents {
			failed = append(failed, documentSendFailure{Kind: item.Kind, ID: item.ID, Message: msgDocumentBatchText})
		}
		return re.JSON(http.StatusOK, map[string]any{"sent": sent, "failed": failed})
	}
	sender, ok := emailSetUp(re.App)
	if !ok {
		return re.BadRequestError(msgDocumentEmailNotSetUp, nil)
	}
	business, err := loadDocumentBusiness(re.App)
	if err != nil {
		return err
	}
	// Once one document has failed all its tries, the outage is known: each
	// later document gets one try, so a request of 200 answers inside the
	// server's write timeout (statements spec §3.5 "Retries").
	tries := emailSendTries
	for _, item := range body.Documents {
		row, msg, outage := sendDocument(re, info, sender, business, item, tries)
		if outage {
			tries = 1
		}
		if msg != "" {
			failed = append(failed, documentSendFailure{Kind: item.Kind, ID: item.ID, Message: msg})
			continue
		}
		sent = append(sent, row)
	}
	if err := apis.EnrichRecords(re, sent); err != nil {
		return re.InternalServerError("", err)
	}
	return re.JSON(http.StatusOK, map[string]any{"sent": sent, "failed": failed})
}

func carriesText(items []documentSendItem) bool {
	for _, item := range items {
		if item.Subject != nil || item.Body != nil {
			return true
		}
	}
	return false
}

// documentSendTexts are what one document's email sends: the subject, the
// sanitized message, the frame and the text part.
type documentSendTexts struct {
	subject, message, frame, text string
}

// sendDocument sends one document, trying its delivery at most tries times,
// and stores its send row; a message is its failure. outage is true when every
// try of the delivery failed with a sender error. Every check comes before the
// limiter's token, so only a document that reaches the send counts against the
// hour's 500 emails.
func sendDocument(
	re *core.RequestEvent, info *core.RequestInfo, sender mailer.FullSender,
	business documentBusiness, item documentSendItem, tries int,
) (row *core.Record, msg string, outage bool) {
	ctx := re.Request.Context()
	kind := documentKinds[item.Kind]
	doc, err := reports.FindViewableRecord(re.App, info, kind.Collection, item.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, msgDocumentNotFound, false
	}
	if err != nil {
		log.ErrorContext(ctx, "read a document to send", "kind", item.Kind, "document", item.ID, "err", err)
		return nil, msgDocumentNotSent, false
	}
	if msg := sendableStatus(item.Kind, doc.GetString("status")); msg != "" {
		return nil, msg, false
	}
	to := strings.TrimSpace(item.To)
	cc, ok := documentCc(item.Cc)
	if !isOneBareAddress(to) || !ok {
		return nil, msgDocumentAddress, false
	}
	texts, msg := documentTextsOf(re.App, item, doc, business)
	if msg != "" {
		return nil, msg, false
	}
	row, msg = newDocumentSendRow(ctx, re, item.Kind, doc, to, cc, texts)
	if msg != "" {
		return nil, msg, false
	}
	pdfDoc, err := kind.Build(re.App, doc)
	if err != nil {
		log.ErrorContext(ctx, "build a document to send", "kind", item.Kind, "document", item.ID, "err", err)
		return nil, msgDocumentNotSent, false
	}
	pdf, err := renderDocumentsPDF(re, []pdfDocument{pdfDoc})
	if err != nil {
		log.ErrorContext(ctx, "render a document to send", "kind", item.Kind, "document", item.ID, "err", err)
		return nil, msgDocumentNotSent, false
	}
	if len(pdf) > maxDocumentFileBytes {
		return nil, msgDocumentFileTooLarge, false
	}
	if !documentEmailLimiter.For(re.App).Allow(re.Auth.Id) {
		return nil, msgDocumentEmailLimit, false
	}
	request := &mailer.SendRequest{
		From:     (&mail.Address{Name: oneLine(business.Name), Address: mailer.FromAddress(re.App)}).String(),
		To:       []mailer.Recipient{{Email: to}},
		Cc:       recipientsOf(cc),
		ReplyTo:  re.Auth.Email(),
		Subject:  texts.subject,
		HTMLBody: texts.frame,
		TextBody: texts.text,
		Attachments: []mailer.Attachment{{
			// The name of the PDF route's download (pdf_routes.go writePDF).
			Name:        kind.FileName(pdfDoc) + ".pdf",
			ContentType: "application/pdf",
			Content:     base64.StdEncoding.EncodeToString(pdf),
		}},
	}
	msg, outage = deliverEmail(ctx, sender, request, documentDeliveryTexts, item.ID, to, tries)
	if msg != "" {
		return nil, msg, outage
	}
	if err := saveDocumentSend(re, row); err != nil {
		log.ErrorContext(ctx, "save a document send", "kind", item.Kind, "document", item.ID, "err", err)
		return nil, msgDocumentSentNotSaved, false
	}
	return row, "", false
}

// documentCc is the trimmed Cc addresses, and false when there are more than
// maxDocumentCc or one is not one bare address.
func documentCc(given []string) ([]string, bool) {
	if len(given) > maxDocumentCc {
		return nil, false
	}
	cc := make([]string, 0, len(given))
	for _, address := range given {
		address = strings.TrimSpace(address)
		if !isOneBareAddress(address) {
			return nil, false
		}
		cc = append(cc, address)
	}
	return cc, true
}

func recipientsOf(addresses []string) []mailer.Recipient {
	if len(addresses) == 0 {
		return nil
	}
	out := make([]mailer.Recipient, len(addresses))
	for i, address := range addresses {
		out[i] = mailer.Recipient{Email: address}
	}
	return out
}

// documentTextsOf takes the subject and the message from the item, or the
// starting ones of documentEmail when the item carries neither, checks them
// (spec §3.4) and runs the server's three steps: the sanitizer, the frame and
// the text part.
func documentTextsOf(app core.App, item documentSendItem, doc *core.Record, business documentBusiness) (documentSendTexts, string) {
	var subject, message string
	switch {
	case item.Subject == nil && item.Body == nil:
		in, err := documentEmailInputOf(app, item.Kind, doc, business)
		if err != nil {
			log.Error("fill a document's starting email", "kind", item.Kind, "document", doc.Id, "err", err)
			return documentSendTexts{}, msgDocumentNotSent
		}
		starting := documentEmail(in)
		subject, message = starting.Subject, starting.BodyHTML
	case item.Body == nil:
		return documentSendTexts{}, msgDocumentMessage
	case item.Subject == nil:
		return documentSendTexts{}, msgDocumentSubject
	default:
		subject, message = *item.Subject, *item.Body
	}
	subject = strings.TrimSpace(oneLine(subject))
	switch {
	case subject == "":
		return documentSendTexts{}, msgDocumentSubject
	case utf16Length(subject) > maxDocumentSubject:
		return documentSendTexts{}, msgDocumentSubjectLong
	case utf16Length(message) > maxDocumentMessage:
		return documentSendTexts{}, msgDocumentMessageLong
	}
	sanitized, err := sanitizeDocumentMessage(message)
	if err != nil {
		log.Warn("sanitize a document email's message", "document", doc.Id, "err", err)
		return documentSendTexts{}, msgDocumentMessage
	}
	switch {
	case utf16Length(sanitized) > maxSanitizedMessage:
		return documentSendTexts{}, msgDocumentMessageLong
	case corehtml.PlainText(sanitized) == "":
		return documentSendTexts{}, msgDocumentMessage
	}
	frame, err := documentEmailFrame(business, sanitized)
	if err != nil {
		log.Error("frame a document email", "document", doc.Id, "err", err)
		return documentSendTexts{}, msgDocumentNotSent
	}
	return documentSendTexts{
		subject: subject, message: sanitized, frame: frame, text: emailText(sanitized, business),
	}, ""
}

// utf16Length is the length of s as JavaScript counts it.
func utf16Length(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// newDocumentSendRow is the send row of one email, before its send. Its text
// fields are checked by their own validators (the to, cc, subject, body and
// body_text maxes) for their own refusals, then the whole row by the record
// validation that App.Save runs, so a row that cannot be stored is refused
// before its email is sent and never fails the save after it.
func newDocumentSendRow(
	ctx context.Context, re *core.RequestEvent, kind string, doc *core.Record, to string, cc []string,
	texts documentSendTexts,
) (*core.Record, string) {
	collection, err := re.App.FindCachedCollectionByNameOrId(documentSendsCollection)
	if err != nil {
		log.ErrorContext(ctx, "read the document sends collection", "err", err)
		return nil, msgDocumentNotSent
	}
	row := core.NewRecord(collection)
	row.Set("doc_type", kind)
	row.Set("document", doc.Id)
	row.Set("number", doc.GetString("number"))
	row.Set("customer", doc.GetString("customer"))
	row.Set("to", to)
	row.Set("cc", strings.Join(cc, ", "))
	row.Set("subject", texts.subject)
	row.Set("body", texts.message)
	row.Set("body_text", texts.text)
	row.Set("sent_by", re.Auth.Id)
	refusals := map[string]string{
		"to": msgDocumentAddress, "cc": msgDocumentAddress, "subject": msgDocumentSubjectLong,
		"body": msgDocumentMessageLong, "body_text": msgDocumentMessageLong,
	}
	for _, name := range []string{"to", "cc", "subject", "body", "body_text"} {
		field := collection.Fields.GetByName(name)
		if field == nil {
			log.ErrorContext(ctx, "the document sends collection has no field", "field", name)
			return nil, msgDocumentNotSent
		}
		if err := field.ValidateValue(ctx, re.App, row); err != nil {
			return nil, refusals[name]
		}
	}
	if err := re.App.ValidateWithContext(ctx, row); err != nil {
		log.ErrorContext(ctx, "validate a document send", "kind", kind, "document", doc.Id, "err", err)
		return nil, msgDocumentNotSent
	}
	return row, ""
}

// saveDocumentSend creates the send row as the app through the create-request
// hook chain, as the record API does, so the audit hook bound there writes the
// "created" row with the sender as its actor; a plain app.Save writes no
// audit row.
func saveDocumentSend(re *core.RequestEvent, row *core.Record) error {
	event := new(core.RecordRequestEvent)
	event.RequestEvent = re
	event.Collection = row.Collection()
	event.Record = row
	return re.App.OnRecordCreateRequest(documentSendsCollection).Trigger(event, func(e *core.RecordRequestEvent) error {
		return e.App.Save(e.Record)
	})
}
