package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const creditApplicationCasesFile = "testdata/credit_application_cases.json"

// creditApplicationCase is one row of the shared table the client's schema
// test reads too: a credit of one kind, a document, and one apply.
type creditApplicationCase struct {
	Name            string `json:"name"`
	Kind            string `json:"kind"`
	CreditDate      string `json:"creditDate"`
	CloseDate       string `json:"closeDate"`
	HasOverride     bool   `json:"hasOverride"`
	Date            string `json:"date"`
	CreditBalance   int64  `json:"creditBalance"`
	DocumentBalance int64  `json:"documentBalance"`
	Amount          int64  `json:"amount"`
	DocumentState   string `json:"documentState"`
	CreditState     string `json:"creditState"`
	GoField         string `json:"goField"`
	TSField         string `json:"tsField"`
	GoMessage       string `json:"goMessage"`
	TSMessage       string `json:"tsMessage"`
	GoOnly          bool   `json:"go"`
}

func readCreditApplicationCases(t *testing.T) []creditApplicationCase {
	t.Helper()
	raw, err := os.ReadFile(creditApplicationCasesFile)
	if err != nil {
		t.Fatalf("read %s: %v", creditApplicationCasesFile, err)
	}
	var cases []creditApplicationCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse %s: %v", creditApplicationCasesFile, err)
	}
	if len(cases) == 0 {
		t.Fatalf("%s holds no case", creditApplicationCasesFile)
	}
	return cases
}

// creditApplicationRun is one case's book: the credit and the document as
// the case states them, and how to apply and read back.
type creditApplicationRun struct {
	app        core.App
	collection string
	writer     *core.Record
	body       func(amount int64, day string) map[string]any
	send       func(t testing.TB, body string) restAnswer
	check      func(t testing.TB, creditBalance, documentBalance, applied int64)
}

func vendorCreditApplicationRun(t *testing.T, c creditApplicationCase) creditApplicationRun {
	t.Helper()
	bp := newApplyBook(t)
	actor := bp.users.bookkeeper.Id

	var credit *core.Record
	switch c.CreditState {
	case "posted":
		credit = bp.postedCredit(t, bp.pacificPower, c.CreditDate, billAmount{bp.rent, c.CreditBalance})
	case "draft":
		credit = mkVendorCreditOn(t, bp.app, bp.pacificPower, map[string]any{"date": c.CreditDate})
		mkVendorCreditLine(t, bp.app, credit, 0, accountLine(bp.rent, c.CreditBalance))
	case "void":
		credit = bp.postedCredit(t, bp.pacificPower, c.CreditDate, billAmount{bp.rent, c.CreditBalance})
		if err := voidVendorCreditAs(bp.app, credit.Id, actor); err != nil {
			t.Fatalf("void the credit: %v", err)
		}
	default:
		t.Fatalf("unknown creditState %q", c.CreditState)
	}

	var bill *core.Record
	switch c.DocumentState {
	case "open":
		bill = bp.postedBill(t, bp.pacificPower, c.DocumentBalance)
	case "draft":
		bill = mkBill(t, bp.app, bp.pacificPower, nil)
		mkBillLine(t, bp.app, bill, 0, accountLine(bp.software, c.DocumentBalance))
	case "void":
		bill = bp.postedBill(t, bp.pacificPower, c.DocumentBalance)
		if err := voidBillAs(bp.app, bill.Id, actor); err != nil {
			t.Fatalf("void the bill: %v", err)
		}
	case "paid":
		bill = bp.postedBill(t, bp.pacificPower, c.DocumentBalance)
		bp.pay(t, bp.pacificPower, nil, payLine{bill, c.DocumentBalance})
	case "other_party":
		bill = bp.postedBill(t, bp.summit, c.DocumentBalance)
	default:
		t.Fatalf("unknown documentState %q", c.DocumentState)
	}

	return creditApplicationRun{
		app: bp.app, collection: creditApplicationsCol, writer: bp.users.bookkeeper,
		body: func(amount int64, day string) map[string]any { return applicationBody(credit, bill, amount, day) },
		send: func(t testing.TB, body string) restAnswer {
			status, out := bp.rest(t).send(t, bp.users.bookkeeper, http.MethodPost, "/api/collections/"+creditApplicationsCol+"/records", body)
			return restAnswer{status: status, body: out}
		},
		check: func(t testing.TB, creditBalance, documentBalance, _ int64) {
			requireVendorCreditBalance(t, bp.app, credit.Id, int(creditBalance))
			requireBillBalance(t, bp.app, bill, int(documentBalance))
		},
	}
}

func memoApplicationRun(t *testing.T, c creditApplicationCase) creditApplicationRun {
	t.Helper()
	me := newMemoApplyEnv(t)
	actor := me.users.bookkeeper.Id

	var memo *core.Record
	switch c.CreditState {
	case "posted":
		memo = me.postedMemo(t, me.customer, c.CreditDate, c.CreditBalance)
	case "draft":
		memo = me.mkCreditMemo(t, map[string]any{"date": c.CreditDate})
		mkCreditMemoLine(t, me.app, memo, 0, item(me.service, 1, c.CreditBalance, false))
	case "void":
		memo = me.postedMemo(t, me.customer, c.CreditDate, c.CreditBalance)
		if err := voidCreditMemoAs(me.app, memo.Id, actor); err != nil {
			t.Fatalf("void the credit memo: %v", err)
		}
	default:
		t.Fatalf("unknown creditState %q", c.CreditState)
	}

	var inv *core.Record
	switch c.DocumentState {
	case "open":
		inv = me.invoice(t, me.customer, c.DocumentBalance)
	case "draft":
		draft, err := newInvoice(me.app, me.customer, map[string]any{"date": memoApplyInvoiceDay, "due_date": memoApplyInvoiceDay})
		if err != nil {
			t.Fatalf("save a draft invoice: %v", err)
		}
		mkInvoiceLine(t, me.app, draft, 0, item(me.service, 1, c.DocumentBalance, false))
		inv = draft
	case "void":
		inv = me.invoice(t, me.customer, c.DocumentBalance)
		if err := voidInvoiceAs(me.app, inv.Id, actor); err != nil {
			t.Fatalf("void the invoice: %v", err)
		}
	case "paid":
		inv = me.invoice(t, me.customer, c.DocumentBalance)
		me.wo.pay(t, inv, "2026-11-05", c.DocumentBalance)
	case "other_party":
		inv = me.invoice(t, me.riverside, c.DocumentBalance)
	default:
		t.Fatalf("unknown documentState %q", c.DocumentState)
	}

	return creditApplicationRun{
		app: me.app, collection: memoApplicationsCol, writer: me.users.bookkeeper,
		body: func(amount int64, day string) map[string]any {
			return map[string]any{"credit_memo": memo.Id, "invoice": inv.Id, "amount": amount, "date": day}
		},
		send: func(t testing.TB, body string) restAnswer {
			status, out := me.rest(t).send(t, me.users.bookkeeper, http.MethodPost, "/api/collections/"+memoApplicationsCol+"/records", body)
			return restAnswer{status: status, body: out}
		},
		check: func(t testing.TB, creditBalance, documentBalance, applied int64) {
			requireMemo(t, me.app, memo, int(creditBalance), int(applied))
			requireInvoiceBalance(t, me.app, inv, int(documentBalance))
		},
	}
}

// Each case of the shared table runs against the create guard of its kind,
// through REST, so the request hook stamps the writer as a person's create
// does. A taken case saves the row and moves both balances; a refused case
// names the case's field and, when the case quotes one, its exact text.
func TestCreditApplication_CreateRunsEveryCase(t *testing.T) {
	for _, c := range readCreditApplicationCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			var run creditApplicationRun
			switch c.Kind {
			case "vendor_credit":
				run = vendorCreditApplicationRun(t, c)
			case "credit_memo":
				run = memoApplicationRun(t, c)
			default:
				t.Fatalf("unknown kind %q", c.Kind)
			}
			if c.CloseDate != "" {
				setCloseDate(t, run.app, c.CloseDate)
			}
			if c.HasOverride {
				grantOverride(t, run.app, run.writer, time.Now().Add(time.Hour))
			}
			raw, err := json.Marshal(run.body(c.Amount, c.Date))
			if err != nil {
				t.Fatal(err)
			}
			answer := run.send(t, string(raw))

			if c.GoField == "" {
				if answer.status != http.StatusOK {
					t.Fatalf("a taken case answered %d; body: %s", answer.status, answer.body)
				}
				if n, err := run.app.CountRecords(run.collection); err != nil || n != 1 {
					t.Errorf("%d rows in %s (err %v), want 1", n, run.collection, err)
				}
				run.check(t, c.CreditBalance-c.Amount, c.DocumentBalance-c.Amount, c.Amount)
				requireNoDocumentDrift(t, run.app)
				requireNoDrift(t, run.app)
				return
			}

			if c.GoMessage != "" {
				answer.requireField(t, c.GoField, c.GoMessage)
			} else {
				answer.requireNamesField(t, c.GoField)
			}
			if n, err := run.app.CountRecords(run.collection); err != nil || n != 0 {
				t.Errorf("%d rows in %s after a refused case (err %v), want 0", n, run.collection, err)
			}
			requireNoDocumentDrift(t, run.app)
			requireNoDrift(t, run.app)
		})
	}
}

// The vendor credit kind keeps the keys and texts that
// vendor_credit_applications_test.go pins, and the credit memo kind has the
// spec's.
func TestCreditApplication_KindsKeepTheirKeysAndTexts(t *testing.T) {
	v := vendorCreditApplicationKind
	if v.Collection != creditApplicationsCol || v.CreditField != "vendor_credit" || v.DocumentField != "bill" ||
		v.PartyField != "vendor" || v.AppliedField != "" || v.AboveUnappliedKey != "amount" {
		t.Errorf("vendor kind = %+v, want collection %s, fields vendor_credit/bill, party vendor, no applied field, above-unapplied key amount",
			v, creditApplicationsCol)
	}
	if v.Msgs.CreditNotPosted != wantApplyCreditNotPosted {
		t.Errorf("vendor CreditNotPosted = %q, want %q", v.Msgs.CreditNotPosted, wantApplyCreditNotPosted)
	}
	if v.Msgs.DraftDocumentNotOpen != wantApplyDraftBillNotOpen {
		t.Errorf("vendor DraftDocumentNotOpen = %q, want %q", v.Msgs.DraftDocumentNotOpen, wantApplyDraftBillNotOpen)
	}
	if got := fmt.Sprintf(v.Msgs.DocumentNotOpen, "1001"); got != wantApplyBillNotOpen("1001") {
		t.Errorf("vendor DocumentNotOpen = %q, want %q", got, wantApplyBillNotOpen("1001"))
	}
	if got := fmt.Sprintf(v.Msgs.AboveDocumentBalance, "1001", "$30.00"); got != wantApplyAboveBillBalance("1001", "$30.00") {
		t.Errorf("vendor AboveDocumentBalance = %q, want %q", got, wantApplyAboveBillBalance("1001", "$30.00"))
	}

	app := newBooksApp(t)
	credits, err := app.FindCollectionByNameOrId("books_vendor_credits")
	if err != nil {
		t.Fatal(err)
	}
	credit := core.NewRecord(credits)
	credit.Set("number", "1001")
	if got := v.Msgs.AboveUnapplied(credit, "$20.00"); got != wantApplyAboveUnapplied("$20.00") {
		t.Errorf("vendor AboveUnapplied = %q, want %q", got, wantApplyAboveUnapplied("$20.00"))
	}

	m := creditMemoApplicationKind
	if m.Collection != memoApplicationsCol || m.CreditField != "credit_memo" || m.DocumentField != "invoice" ||
		m.PartyField != "customer" || m.AppliedField != "applied" || m.AboveUnappliedKey != "credit_memo" {
		t.Errorf("credit memo kind = %+v, want collection %s, fields credit_memo/invoice, party customer, applied field applied, above-unapplied key credit_memo",
			m, memoApplicationsCol)
	}
	if m.Msgs.CreditNotPosted != wantMemoApplyNotPosted || m.Msgs.DraftDocumentNotOpen != wantMemoApplyDraftInvoice {
		t.Errorf("credit memo CreditNotPosted/DraftDocumentNotOpen = %q/%q, want %q/%q",
			m.Msgs.CreditNotPosted, m.Msgs.DraftDocumentNotOpen, wantMemoApplyNotPosted, wantMemoApplyDraftInvoice)
	}
	memos, err := app.FindCollectionByNameOrId("books_credit_memos")
	if err != nil {
		t.Fatal(err)
	}
	memo := core.NewRecord(memos)
	memo.Set("number", "1001")
	if got := m.Msgs.AboveUnapplied(memo, "$250.00"); got != wantMemoApplyAboveUnapplied("1001", "$250.00") {
		t.Errorf("credit memo AboveUnapplied = %q, want %q", got, wantMemoApplyAboveUnapplied("1001", "$250.00"))
	}
}
