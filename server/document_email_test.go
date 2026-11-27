package books

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Email-share spec §3.4: the starting subject and message of each kind, pinned
// by one vector file that the TypeScript mirror (lib/document-email.ts) reads
// too; the sanitizer step, the frame and the text part of every document email.

type documentEmailCase struct {
	Name     string          `json:"name"`
	Input    json.RawMessage `json:"input"`
	Subject  string          `json:"subject"`
	BodyHTML string          `json:"bodyHtml"`
}

func documentEmailCases(t *testing.T) []documentEmailCase {
	t.Helper()
	raw, err := os.ReadFile("testdata/document_email_cases.json")
	if err != nil {
		t.Fatalf("read the document email cases: %v", err)
	}
	var cases []documentEmailCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse the document email cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("the document email case table is empty")
	}
	return cases
}

// decodeDocumentEmailInput reads one case's input into documentEmailInput.
// The vector file is the struct's JSON, so TypeScript reads the same shape: a
// key the struct does not have is refused, and the struct written back holds
// exactly the keys of the case.
func decodeDocumentEmailInput(t *testing.T, raw json.RawMessage) documentEmailInput {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var in documentEmailInput
	if err := dec.Decode(&in); err != nil {
		t.Fatalf("decode the input %s into documentEmailInput: %v", raw, err)
	}
	back, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("encode documentEmailInput: %v", err)
	}
	if got, want := jsonKeys(t, back), jsonKeys(t, raw); !reflect.DeepEqual(got, want) {
		t.Fatalf("documentEmailInput writes the keys %v, the case has %v", got, want)
	}
	return in
}

func jsonKeys(t *testing.T, raw []byte) []string {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("parse %s: %v", raw, err)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// Every case of the shared vector file: the subject and the message HTML,
// byte for byte.
func TestDocumentEmail_Cases(t *testing.T) {
	kinds := map[string]bool{}
	for _, c := range documentEmailCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			in := decodeDocumentEmailInput(t, c.Input)
			var shape struct {
				Kind string `json:"kind"`
			}
			if err := json.Unmarshal(c.Input, &shape); err != nil {
				t.Fatal(err)
			}
			kinds[shape.Kind] = true
			got := documentEmail(in)
			if got.Subject != c.Subject {
				t.Errorf("subject =\n%q\nwant\n%q", got.Subject, c.Subject)
			}
			if got.BodyHTML != c.BodyHTML {
				t.Errorf("message HTML =\n%s\nwant\n%s", got.BodyHTML, c.BodyHTML)
			}
		})
	}
	for _, kind := range []string{"invoice", "estimate", "sales_receipt", "credit_memo", "refund_receipt", "purchase_order"} {
		if !kinds[kind] {
			t.Errorf("the vector file has no %s case", kind)
		}
	}
}

// wantInput is the input a case of the vector file would hold, as the struct.
func wantInput(t *testing.T, fields map[string]any) documentEmailInput {
	t.Helper()
	raw, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return decodeDocumentEmailInput(t, raw)
}

// documentEmailInputOf fills the input from a stored document: the number, the
// days through formatDay, the money through formatMoney, the customer's name,
// the business, the document's message, and the customer link from the server
// address and the row's public_token (none for a kind without a link).
func TestDocumentEmailInputOf_StoredDocuments(t *testing.T) {
	env := newDSEnv(t)
	business := documentBusiness{Name: dsBusiness, Phone: dsPhone, Email: dsBusinessEmail}
	inputOf := func(t *testing.T, kind string, record *core.Record) documentEmailInput {
		t.Helper()
		in, err := documentEmailInputOf(env.app, kind, record, business)
		if err != nil {
			t.Fatalf("documentEmailInputOf(%s): %v", kind, err)
		}
		return in
	}
	requireStored := func(t *testing.T, record *core.Record, fields ...string) {
		t.Helper()
		for _, f := range fields {
			if record.GetString(f) == "" {
				t.Fatalf("the stored %s has no %s", record.Collection().Name, f)
			}
		}
	}

	t.Run("a posted invoice", func(t *testing.T) {
		inv := env.doc(t, "invoice", "posted", map[string]any{
			"date": "2026-11-02", "due_date": "2026-12-02", "message": "Thank you.\nPay by check.",
		})
		requireStored(t, inv, "number", "public_token")
		money := formatMoney(45000, inv.GetString("currency"))
		want := wantInput(t, map[string]any{
			"kind": "invoice", "number": inv.GetString("number"), "customerName": "Harborview Dental",
			"businessName": dsBusiness, "businessPhone": dsPhone,
			"date": "Nov 2, 2026", "dueDate": "Dec 2, 2026", "expirationDate": "",
			"total": money, "balance": money, "balanceIsZero": false,
			"message":    "Thank you.\nPay by check.",
			"link":       dsAppURL + "/p/books/invoices/" + inv.GetString("public_token"),
			"canRespond": false,
		})
		if got := inputOf(t, "invoice", inv); !reflect.DeepEqual(got, want) {
			t.Errorf("input =\n%+v\nwant\n%+v", got, want)
		}
	})

	t.Run("a pending estimate that has not expired", func(t *testing.T) {
		expires := time.Now().AddDate(0, 0, 30).Format(time.DateOnly)
		est := env.doc(t, "estimate", "pending", map[string]any{
			"expiration_date": expires, "message": "Prices hold for 30 days.",
		})
		requireStored(t, est, "public_token")
		want := wantInput(t, map[string]any{
			"kind": "estimate", "number": est.GetString("number"), "customerName": "Harborview Dental",
			"businessName": dsBusiness, "businessPhone": dsPhone,
			"date": formatDay(estimateTestDay), "dueDate": "", "expirationDate": formatDay(expires),
			"total": formatMoney(45000, est.GetString("currency")), "balance": "", "balanceIsZero": false,
			"message":    "Prices hold for 30 days.",
			"link":       dsAppURL + "/p/books/estimates/" + est.GetString("public_token"),
			"canRespond": true,
		})
		if got := inputOf(t, "estimate", est); !reflect.DeepEqual(got, want) {
			t.Errorf("input =\n%+v\nwant\n%+v", got, want)
		}
	})

	t.Run("a posted credit memo has no link", func(t *testing.T) {
		memo := env.doc(t, "credit_memo", "posted", nil)
		requireStored(t, memo, "number")
		money := formatMoney(45000, memo.GetString("currency"))
		want := wantInput(t, map[string]any{
			"kind": "credit_memo", "number": memo.GetString("number"), "customerName": "Harborview Dental",
			"businessName": dsBusiness, "businessPhone": dsPhone,
			"date": formatDay(memo.GetString("date")), "dueDate": "", "expirationDate": "",
			"total": money, "balance": money, "balanceIsZero": false,
			"message": "", "link": "", "canRespond": false,
		})
		if got := inputOf(t, "credit_memo", memo); !reflect.DeepEqual(got, want) {
			t.Errorf("input =\n%+v\nwant\n%+v", got, want)
		}
	})

	// A walk-in sale names no customer (2100000011_create_books_sales_receipts.js
	// "Optional: a walk-in sale names no customer"): its email names nobody.
	t.Run("a posted walk-in sales receipt names no customer", func(t *testing.T) {
		receipt := env.doc(t, "sales_receipt", "posted", map[string]any{
			"customer": "", "email": "counter@walkin.example",
		})
		requireStored(t, receipt, "number")
		if got := receipt.GetString("customer"); got != "" {
			t.Fatalf("the stored receipt names customer %q", got)
		}
		in := inputOf(t, "sales_receipt", receipt)
		if in.CustomerName != "" {
			t.Errorf("customerName = %q, want \"\"", in.CustomerName)
		}
		if in.Number != receipt.GetString("number") {
			t.Errorf("number = %q, want %q", in.Number, receipt.GetString("number"))
		}
	})
}

// The sanitizer step (spec §3.4 step 1): a script, an event handler, an
// image, a table, a class and a javascript: link are gone and the text around
// them stays; every tag of the Books allowlist stays as it is; a mailto link
// stays; an href on any tag but a is dropped.
func TestSanitizeDocumentMessage(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"a script and its body", `<p>Hello</p><script>alert("x")</script><p>there</p>`, `<p>Hello</p><p>there</p>`},
		{"an event handler", `<p onclick="steal()">Hello</p>`, `<p>Hello</p>`},
		{"an image", `<p>Logo: <img src="https://x.example/logo.png" alt="logo">here</p>`, `<p>Logo: here</p>`},
		{"a table keeps its text", `<table><tbody><tr><td>Cell one</td><td>Cell two</td></tr></tbody></table>`, `Cell oneCell two`},
		{"a class", `<p class="tiptap-paragraph editor-p">Hello</p>`, `<p>Hello</p>`},
		{"a javascript: link keeps its text", `<p><a href="javascript:alert(1)">Click</a></p>`, `<p><a>Click</a></p>`},
		{"a mailto link stays", `<p><a href="mailto:a@b.example">Write to us</a></p>`, `<p><a href="mailto:a@b.example">Write to us</a></p>`},
		{"an href on a p is dropped", `<p href="https://x.example/">Hello</p>`, `<p>Hello</p>`},
		{
			"every allowed tag stays",
			`<h1>One</h1><h2>Two</h2><h3>Three</h3><p><strong>s</strong> <b>b</b> <em>e</em> <i>i</i> <u>u</u> <s>x</s> <code>c</code><br>next</p>` +
				`<ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre>pre</pre><hr><p><a href="https://x.example/page">link</a></p>`,
			`<h1>One</h1><h2>Two</h2><h3>Three</h3><p><strong>s</strong> <b>b</b> <em>e</em> <i>i</i> <u>u</u> <s>x</s> <code>c</code><br>next</p>` +
				`<ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre>pre</pre><hr><p><a href="https://x.example/page">link</a></p>`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := sanitizeDocumentMessage(c.in)
			if err != nil {
				t.Fatalf("sanitizeDocumentMessage: %v", err)
			}
			if got != c.want {
				t.Errorf("sanitized =\n%s\nwant\n%s", got, c.want)
			}
		})
	}
	if documentEmailAllowlist.ClassPrefix != "books-email-" || !documentEmailAllowlist.AllowHrefMailto {
		t.Errorf("documentEmailAllowlist ClassPrefix %q, AllowHrefMailto %v; want \"books-email-\" and true",
			documentEmailAllowlist.ClassPrefix, documentEmailAllowlist.AllowHrefMailto)
	}
}

var dsTextBusiness = documentBusiness{Name: "Cedar Ledger Co", Phone: "214 555 1234", Email: "books@cedarledger.example"}

const dsTextFooter = "Cedar Ledger Co · 214 555 1234 · books@cedarledger.example"

// emailText (spec §3.4 step 3): one block a paragraph, blocks joined by a blank
// line, a <br> a line break, a line for each list item, a link's text only,
// and the footer line after a blank line; no header line.
func TestEmailText(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"two paragraphs", `<p>One</p><p>Two</p>`, "One\n\nTwo\n\n" + dsTextFooter},
		{"a line break", `<p>Line one<br>Line two</p>`, "Line one\nLine two\n\n" + dsTextFooter},
		{"a bullet list", `<p>Covers:</p><ul><li>a</li><li>b</li></ul>`, "Covers:\n\n- a\n- b\n\n" + dsTextFooter},
		{"a numbered list", `<ol><li>a</li><li>b</li></ol>`, "1. a\n2. b\n\n" + dsTextFooter},
		{"a link prints its text", `<p>See <a href="https://x.example/p">the page</a> now</p>`, "See the page now\n\n" + dsTextFooter},
		{"a blockquote and an h2", `<h2>Title</h2><blockquote><p>Quoted</p></blockquote>`, "Title\n\nQuoted\n\n" + dsTextFooter},
		{
			"the starting message's blocks",
			`<p>Hello Aspen,</p><p>Invoice date: Nov 2, 2026<br><strong>Balance due: $450.00</strong></p><p>Fern &amp; Ledger</p>`,
			"Hello Aspen,\n\nInvoice date: Nov 2, 2026\nBalance due: $450.00\n\nFern & Ledger\n\n" + dsTextFooter,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := emailText(c.in, dsTextBusiness); got != c.want {
				t.Errorf("emailText =\n%q\nwant\n%q", got, c.want)
			}
		})
	}
	t.Run("the footer drops an empty part", func(t *testing.T) {
		for _, b := range []struct {
			business documentBusiness
			footer   string
		}{
			{documentBusiness{Name: "Cedar Ledger Co", Email: "books@cedarledger.example"}, "Cedar Ledger Co · books@cedarledger.example"},
			{documentBusiness{Name: "Cedar Ledger Co", Phone: "214 555 1234"}, "Cedar Ledger Co · 214 555 1234"},
			{documentBusiness{Name: "Cedar Ledger Co"}, "Cedar Ledger Co"},
		} {
			if got, want := emailText(`<p>One</p>`, b.business), "One\n\n"+b.footer; got != want {
				t.Errorf("emailText with %+v =\n%q\nwant\n%q", b.business, got, want)
			}
		}
	})
	t.Run("no header line", func(t *testing.T) {
		got := emailText(`<p>One</p>`, dsTextBusiness)
		if strings.HasPrefix(got, dsTextBusiness.Name) {
			t.Errorf("emailText = %q starts with the business name, want no header line", got)
		}
	})
}

// documentEmailFrame (spec §3.4 step 2): the business name in the header,
// the sanitized message unchanged, the footer line, no image, and the business
// name escaped.
func TestDocumentEmailFrame(t *testing.T) {
	message := `<p>Hello <strong>Aspen</strong>,</p><ul><li>a</li></ul>`
	business := documentBusiness{Name: "Cedar <Ledger> & Co", Phone: "214 555 1234", Email: "books@cedarledger.example"}
	got, err := documentEmailFrame(business, message)
	if err != nil {
		t.Fatalf("documentEmailFrame: %v", err)
	}
	escaped := "Cedar &lt;Ledger&gt; &amp; Co"
	footer := escaped + " · 214 555 1234 · books@cedarledger.example"
	at := strings.Index(got, message)
	if at < 0 {
		t.Fatalf("the frame does not hold the message unchanged:\n%s", got)
	}
	if header := strings.Index(got, escaped); header < 0 || header > at {
		t.Errorf("the business name %q is not in a header before the message:\n%s", escaped, got)
	}
	if foot := strings.LastIndex(got, footer); foot < at+len(message) {
		t.Errorf("the footer line %q does not follow the message:\n%s", footer, got)
	}
	if strings.Contains(got, "Cedar <Ledger>") {
		t.Errorf("the frame holds the business name unescaped:\n%s", got)
	}
	if strings.Contains(got, "<img") {
		t.Errorf("the frame holds an image:\n%s", got)
	}
	plain, err := documentEmailFrame(documentBusiness{Name: "Cedar Ledger Co"}, message)
	if err != nil {
		t.Fatalf("documentEmailFrame: %v", err)
	}
	if strings.Contains(plain, " · ") {
		t.Errorf("a business with no phone and no email has a separator in its footer:\n%s", plain)
	}
}
