package books

import (
	"context"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/mailer"
)

// The delivery code the statements route and the document send route share
// (email-share spec §4.4): one email's tries, the address check and the
// email-set-up check. Each route keeps its own texts and its own limiter.

// emailSendTries is how many times one email's delivery is tried when the
// sender returns an error: the first try and 2 retries (statements spec §3.5).
const emailSendTries = 3

// emailSendRetryPause is the pause between two tries of one delivery. A var
// so a test can set it to 0.
var emailSendRetryPause = 2 * time.Second

// emailSender is the sender of statement and document emails; a test
// replaces it.
var emailSender = mailer.DefaultSender

// emailDeliveryTexts are a route's failure texts of one delivery.
// RecipientRefused is a format with the refused address.
type emailDeliveryTexts struct {
	NotSent, RecipientRefused string
}

// emailSetUp is the sender of the route's emails, and false when email
// sending is not set up: no capture log and no provider, or a sender that
// cannot attach a file.
func emailSetUp(app core.App) (mailer.FullSender, bool) {
	// CaptureLogOn first: CanDeliver asks the provider for its token.
	if !mailer.CaptureLogOn() && !mailer.CanDeliver(app) {
		return nil, false
	}
	sender, ok := emailSender(app).(mailer.FullSender)
	return sender, ok
}

// deliverEmail hands one email to the sender, and tries again after a pause
// when the sender returns an error (a transport or provider error, which can
// pass), at most tries times in all. An error that comes after the provider
// accepted the message is retried too, so in that rare case the customer can
// get the email twice (statements spec §3.5). A recipient the email server
// refused is a permanent refusal: it fails at once. A message is the failure;
// "" is a delivery. outage is true when every try failed with a sender error.
// id names the record the email is of in the log.
func deliverEmail(
	ctx context.Context, sender mailer.FullSender, request *mailer.SendRequest, texts emailDeliveryTexts,
	id, to string, tries int,
) (msg string, outage bool) {
	for try := 1; ; try++ {
		result, err := sender.SendFull(ctx, request)
		if err == nil {
			if result != nil && len(result.FailedRecipients) > 0 {
				log.WarnContext(ctx, "the email server refused an email's recipient",
					"id", id, "reason", result.FailedRecipients[0].Reason)
				return fmt.Sprintf(texts.RecipientRefused, to), false
			}
			return "", false
		}
		if try >= tries {
			log.ErrorContext(ctx, "send an email", "id", id, "try", try, "err", err)
			return texts.NotSent, true
		}
		log.WarnContext(ctx, "send an email, will try again", "id", id, "try", try, "err", err)
		if !pauseBeforeRetry(ctx) {
			log.ErrorContext(ctx, "send an email: the request ended before a retry",
				"id", id, "try", try, "err", ctx.Err())
			return texts.NotSent, false
		}
	}
}

// pauseBeforeRetry waits emailSendRetryPause, and is false when the request's
// context ends first.
func pauseBeforeRetry(ctx context.Context) bool {
	timer := time.NewTimer(emailSendRetryPause)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// isOneBareAddress is true for one email address with no display name and a
// dot in its domain (testdata/statement_email_cases.json,
// testdata/document_send_cases.json).
func isOneBareAddress(to string) bool {
	addr, err := mail.ParseAddress(to)
	if err != nil || addr.Name != "" || addr.Address != to {
		return false
	}
	at := strings.LastIndexByte(to, '@')
	return at > 0 && strings.Contains(to[at+1:], ".")
}
