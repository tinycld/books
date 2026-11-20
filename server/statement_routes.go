package books

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"

	"tinycld.org/core/mailer"
	"tinycld.org/core/ratelimit"
	"tinycld.org/core/reports"
)

// The statement preview and send routes (statements spec §3.5, §4.4). Like
// the PDF routes they are session only: they are not in the OAuth
// registration, so core's grant middleware denies them to every token.

// The whole-request and per-statement texts of the routes.
const (
	msgStatementTooMany       = "Select at most 200 customers. Narrow the list with Customer balance."
	msgStatementEmailLimit    = "You have sent 500 statement emails in the last hour. Try again later."
	msgStatementEmailNotSetUp = "Email sending is not set up."
	msgStatementFileTooLarge  = "The statement PDF is larger than 10 MB."
	msgStatementNotSent       = "The email could not be sent. Try again."
	msgStatementAddress       = "Enter a valid email address."
	msgStatementNoAccess      = "You do not have write access to Books."
	msgStatementNoCustomer    = "Select at least one customer."
	msgStatementNoStatement   = "Select at least one statement."
	msgStatementType          = "Choose Balance forward or Open items"
	msgStatementNotFound      = "Document not found."
	msgStatementSentNotSaved  = "The email was sent, but the statement could not be marked as sent."
	msgStatementBadRequest    = "The request is not valid."
)

// maxStatementsPerRequest bounds one preview or send.
const maxStatementsPerRequest = 200

// maxStatementFileBytes is the largest statement PDF the send attaches. A var
// so a test can lower it.
var maxStatementFileBytes = 10 << 20

// statementSender is the sender of statement emails; a test replaces it.
var statementSender = mailer.DefaultSender

// statementEmailLimiter allows each user 500 statement emails an hour.
var statementEmailLimiter = ratelimit.NewPerApp("books.statements.send", 500, time.Hour)

func bindStatementRoutes(e *core.ServeEvent) {
	e.Router.POST("/api/books/statements/preview", serveStatementPreview)
	e.Router.POST("/api/books/statements/send", serveStatementSend)
}

// requireStatementWriter refuses a caller with no session, a disabled account
// or no Books write access.
func requireStatementWriter(re *core.RequestEvent) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Sign in to use statements.", nil)
	}
	// A token minted before the account was disabled still authenticates, and a
	// raw route has no collection rule to refuse it (servePDF).
	if re.Auth.GetBool("disabled") {
		return re.ForbiddenError("Your account is disabled.", nil)
	}
	level, err := levelFor(re.App, re.Auth)
	if err != nil {
		return err
	}
	if !level.CanWrite() {
		return re.ForbiddenError(msgStatementNoAccess, nil)
	}
	return nil
}

// decodeStatementBody reads one JSON object with no unknown field and nothing
// after it.
func decodeStatementBody(re *core.RequestEvent, into any) error {
	dec := json.NewDecoder(re.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		log.WarnContext(re.Request.Context(), "decode a statement request", "err", err)
		return re.BadRequestError(msgStatementBadRequest, nil)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		log.WarnContext(re.Request.Context(), "decode a statement request: data after the first object", "err", err)
		return re.BadRequestError(msgStatementBadRequest, nil)
	}
	return nil
}

type statementPreviewBody struct {
	Type          string   `json:"type"`
	StatementDate string   `json:"statement_date"`
	StartDate     string   `json:"start_date"`
	EndDate       string   `json:"end_date"`
	Customers     []string `json:"customers"`
}

// serveStatementPreview answers one PDF of the statements of the customers
// with the options given, each on a new page, with no number; nothing is
// stored.
func serveStatementPreview(re *core.RequestEvent) error {
	if err := requireStatementWriter(re); err != nil {
		return err
	}
	info, err := re.RequestInfo()
	if err != nil {
		return err
	}
	var body statementPreviewBody
	if err := decodeStatementBody(re, &body); err != nil {
		return err
	}
	if body.Type != statementTypeBalanceForward && body.Type != statementTypeOpenItems {
		return refuseField("type", msgStatementType)
	}
	if err := checkStatementDates(body.Type, body.StatementDate, body.StartDate, body.EndDate); err != nil {
		return err
	}
	switch {
	case len(body.Customers) == 0:
		return re.BadRequestError(msgStatementNoCustomer, nil)
	case len(body.Customers) > maxStatementsPerRequest:
		return re.BadRequestError(msgStatementTooMany, nil)
	}
	ctx := re.Request.Context()
	docs := make([]pdfDocument, 0, len(body.Customers))
	for _, id := range body.Customers {
		customer, err := reports.FindViewableRecord(re.App, info, "books_customers", id)
		if errors.Is(err, sql.ErrNoRows) {
			return re.NotFoundError("Customer not found.", nil)
		}
		if err != nil {
			return err
		}
		data, err := buildStatementData(ctx, re.App, re.Auth, statementInput{
			Type: body.Type, StatementDate: body.StatementDate, StartDate: body.StartDate, EndDate: body.EndDate,
			Customer: customer,
		})
		if err != nil {
			return re.InternalServerError("Could not create the PDF.", err)
		}
		docs = append(docs, statementPDFDocument(data))
	}
	pdf, err := renderDocumentsPDF(re, docs)
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	return sendPDF(re, "statements-preview-"+body.StatementDate, pdf)
}

type statementSendItem struct {
	ID string `json:"id"`
	To string `json:"to"`
}

type statementSendBody struct {
	Statements []statementSendItem `json:"statements"`
}

type statementSendFailure struct {
	ID      string `json:"id"`
	Message string `json:"message"`
}

// serveStatementSend emails each statement to its address with its PDF, and
// saves the sent fields. A statement that fails is listed with its message
// and the others go on.
func serveStatementSend(re *core.RequestEvent) error {
	if err := requireStatementWriter(re); err != nil {
		return err
	}
	info, err := re.RequestInfo()
	if err != nil {
		return err
	}
	var body statementSendBody
	if err := decodeStatementBody(re, &body); err != nil {
		return err
	}
	switch {
	case len(body.Statements) == 0:
		return re.BadRequestError(msgStatementNoStatement, nil)
	case len(body.Statements) > maxStatementsPerRequest:
		return re.BadRequestError(msgStatementTooMany, nil)
	}
	// CaptureLogOn first: CanDeliver asks the provider for its token.
	if !mailer.CaptureLogOn() && !mailer.CanDeliver(re.App) {
		return re.BadRequestError(msgStatementEmailNotSetUp, nil)
	}
	sender, ok := statementSender(re.App).(mailer.FullSender)
	if !ok {
		return re.BadRequestError(msgStatementEmailNotSetUp, nil)
	}
	business, err := loadStatementBusiness(re.App)
	if err != nil {
		return err
	}
	sent := []*core.Record{}
	failed := []statementSendFailure{}
	for _, item := range body.Statements {
		record, msg := sendStatement(re, info, sender, business, item)
		if msg != "" {
			failed = append(failed, statementSendFailure{ID: item.ID, Message: msg})
			continue
		}
		sent = append(sent, record)
	}
	if err := apis.EnrichRecords(re, sent); err != nil {
		return re.InternalServerError("", err)
	}
	return re.JSON(http.StatusOK, map[string]any{"sent": sent, "failed": failed})
}

// sendStatement sends one statement and saves its sent fields; a message is
// its failure.
func sendStatement(
	re *core.RequestEvent, info *core.RequestInfo, sender mailer.FullSender,
	business statementBusiness, item statementSendItem,
) (*core.Record, string) {
	ctx := re.Request.Context()
	record, err := reports.FindViewableRecord(re.App, info, statementsCollection, item.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, msgStatementNotFound
	}
	if err != nil {
		log.ErrorContext(ctx, "read a statement to send", "statement", item.ID, "err", err)
		return nil, msgStatementNotSent
	}
	to := strings.TrimSpace(item.To)
	if !isOneBareAddress(to) || !statementFieldsTake(ctx, re.App, record, to) {
		return nil, msgStatementAddress
	}
	data, err := buildStoredStatementData(ctx, re.App, re.Auth, record)
	if err != nil {
		log.ErrorContext(ctx, "build a statement to send", "statement", item.ID, "err", err)
		return nil, msgStatementNotSent
	}
	doc := statementPDFDocument(data)
	pdf, err := renderDocumentsPDF(re, []pdfDocument{doc})
	if err != nil {
		log.ErrorContext(ctx, "render a statement to send", "statement", item.ID, "err", err)
		return nil, msgStatementNotSent
	}
	if len(pdf) > maxStatementFileBytes {
		return nil, msgStatementFileTooLarge
	}
	// The token is taken here, so only a statement that reaches the send counts
	// against the hour's 500 emails.
	if !statementEmailLimiter.For(re.App).Allow(re.Auth.Id) {
		return nil, msgStatementEmailLimit
	}
	message := statementEmail(data, business)
	result, err := sender.SendFull(ctx, &mailer.SendRequest{
		From:     (&mail.Address{Name: oneLine(business.Name), Address: mailer.FromAddress(re.App)}).String(),
		To:       []mailer.Recipient{{Email: to}},
		ReplyTo:  re.Auth.Email(),
		Subject:  message.Subject,
		TextBody: message.Text,
		Attachments: []mailer.Attachment{{
			Name:        doc.FileStem + ".pdf",
			ContentType: "application/pdf",
			Content:     base64.StdEncoding.EncodeToString(pdf),
		}},
	})
	if err == nil && result != nil && len(result.FailedRecipients) > 0 {
		err = errors.New(result.FailedRecipients[0].Reason)
	}
	if err != nil {
		log.ErrorContext(ctx, "send a statement", "statement", item.ID, "err", err)
		return nil, msgStatementNotSent
	}
	if err := saveStatementSent(re, record, to); err != nil {
		log.ErrorContext(ctx, "save a sent statement", "statement", item.ID, "err", err)
		var apiErr *router.ApiError
		if errors.As(err, &apiErr) {
			return nil, apiErr.Message
		}
		return nil, msgStatementSentNotSaved
	}
	return record, ""
}

// isOneBareAddress is true for one email address with no display name and a
// dot in its domain (testdata/statement_email_cases.json).
func isOneBareAddress(to string) bool {
	addr, err := mail.ParseAddress(to)
	if err != nil || addr.Name != "" || addr.Address != to {
		return false
	}
	at := strings.LastIndexByte(to, '@')
	return at > 0 && strings.Contains(to[at+1:], ".")
}

// statementFieldsTake is true when the statement's email and sent_to fields
// each take to, by their own validators (the sent_to max of 320 characters,
// PocketBase's email format), so an address is refused before its email is
// sent and never fails the save after it.
func statementFieldsTake(ctx context.Context, app core.App, record *core.Record, to string) bool {
	probe := core.NewRecord(record.Collection())
	for _, name := range []string{"email", "sent_to"} {
		field := record.Collection().Fields.GetByName(name)
		if field == nil {
			return false
		}
		probe.Set(name, to)
		if err := field.ValidateValue(ctx, app, probe); err != nil {
			return false
		}
	}
	return true
}

// saveStatementSent sets the sent fields and saves the row through the
// update-request hook chain, as the record API does, so the audit hook bound
// there writes the "updated" row with the changes; a plain app.Save writes no
// audit row.
func saveStatementSent(re *core.RequestEvent, record *core.Record, to string) error {
	record.Set("email", to)
	record.Set("sent_at", types.NowDateTime())
	record.Set("sent_to", to)
	event := new(core.RecordRequestEvent)
	event.RequestEvent = re
	event.Collection = record.Collection()
	event.Record = record
	return re.App.OnRecordUpdateRequest(statementsCollection).Trigger(event, func(e *core.RecordRequestEvent) error {
		return e.App.Save(e.Record)
	})
}
