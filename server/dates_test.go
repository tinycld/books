package books

import "testing"

// Each write boundary refuses a year before 1900, the client's bound.

func TestDayBound_APostRefusesAnEntryDateBefore1900(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "1899-12-31", 100)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""), `"1899-12-31" is before 1900`)
	if got := reload(t, env.app, "books_journal_entries", entry.Id).GetString("status"); got != statusDraft {
		t.Fatalf("status = %q, want draft", got)
	}
}

func TestDayBound_TheFirstDayOf1900Posts(t *testing.T) {
	env := newLedgerEnv(t)
	mustPost(t, env.app, env.sale(t, "1900-01-01", 100).Id, "")
	requireNoDrift(t, env.app)
}

func TestDayBound_TheCloseDate(t *testing.T) {
	env := newLedgerEnv(t)
	s := reload(t, env.app, "books_settings", settingsID)
	s.Set("close_date", "1899-12-31")
	requireRefused(t, env.app.Save(s), "is before 1900")
}

func TestDayBound_AnInvoice(t *testing.T) {
	ie := newInvoiceEnv(t)
	_, err := newInvoice(ie.app, ie.customer, map[string]any{"date": "1899-12-31", "due_date": "1900-01-15"})
	requireRefused(t, err, msgDocumentDayTooEarly)
	_, err = newInvoice(ie.app, ie.customer, map[string]any{"date": "1900-01-01", "due_date": "1899-12-31"})
	requireRefused(t, err, msgDocumentDayTooEarly)
	// A day that does not exist keeps its own text.
	_, err = newInvoice(ie.app, ie.customer, map[string]any{"date": "2026-02-30", "due_date": "2026-03-30"})
	requireRefused(t, err, "Enter a date that exists")
}

func TestDayBound_ASalesReceipt(t *testing.T) {
	re := newReceiptEnv(t)
	_, err := re.newReceipt(map[string]any{"date": "1899-12-31"})
	requireRefused(t, err, msgDocumentDayTooEarly)
}

func TestDayBound_AnEstimate(t *testing.T) {
	ee := newEstimateEnv(t)
	_, err := ee.newEstimate(map[string]any{"date": "1899-12-31"})
	requireRefused(t, err, msgDocumentDayTooEarly)
	_, err = ee.newEstimate(map[string]any{"expiration_date": "1899-12-31"})
	requireRefused(t, err, msgDocumentDayTooEarly)
	_, err = ee.newEstimate(map[string]any{"status": statusAccepted, "accepted_date": "1899-12-31"})
	requireRefused(t, err, msgDocumentDayTooEarly)
}
