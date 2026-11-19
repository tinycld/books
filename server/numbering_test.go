package books

import (
	"errors"
	"slices"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func allocate(t testing.TB, app core.App) (int, string) {
	t.Helper()
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "journal")
		return err
	})
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}
	return seq, number
}

func TestAllocateNumber_ConcurrentCallersGetDistinctContiguousNumbers(t *testing.T) {
	app := newBooksApp(t)
	const n = 20
	got := make(chan int, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := app.RunInTransaction(func(tx core.App) error {
				seq, _, err := allocateNumber(tx, "journal")
				if err == nil {
					got <- seq
				}
				return err
			})
			if err != nil {
				t.Errorf("allocate: %v", err)
			}
		}()
	}
	wg.Wait()
	close(got)
	seen := map[int]bool{}
	for seq := range got {
		if seen[seq] {
			t.Errorf("number %d issued twice", seq)
		}
		seen[seq] = true
	}
	for i := 1; i <= n; i++ {
		if !seen[i] {
			t.Errorf("number %d skipped", i)
		}
	}
}

func TestAllocateNumber_RolledBackPostConsumesNoNumber(t *testing.T) {
	app := newBooksApp(t)
	refused := errors.New("refused")
	err := app.RunInTransaction(func(tx core.App) error {
		if _, _, err := allocateNumber(tx, "journal"); err != nil {
			return err
		}
		return refused
	})
	if !errors.Is(err, refused) {
		t.Fatalf("err = %v", err)
	}
	if seq, _ := allocate(t, app); seq != 1 {
		t.Fatalf("after a rollback the next number is %d, want 1", seq)
	}
}

func TestAllocateNumber_UsesThePrefixAndStart(t *testing.T) {
	app := newBooksApp(t)
	seqRow := reload(t, app, "books_doc_sequences", "booksseqjournal")
	seqRow.Set("prefix", "JE-")
	seqRow.Set("next_number", 41)
	if err := app.Save(seqRow); err != nil {
		t.Fatal(err)
	}
	if seq, number := allocate(t, app); seq != 41 || number != "JE-41" {
		t.Fatalf("got %d %q, want 41 JE-41", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 42 {
		t.Fatalf("next_number = %d, want 42", next)
	}
}

func TestAllocateNumber_TransferSequenceStartsAtTR1(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqtransfr")
	if got := row.GetString("doc_type"); got != "transfer" {
		t.Fatalf("doc_type = %q, want transfer", got)
	}
	if got := row.GetString("prefix"); got != "TR-" {
		t.Fatalf("prefix = %q, want TR-", got)
	}
	if got := row.GetInt("next_number"); got != 1 {
		t.Fatalf("next_number = %d, want 1", got)
	}

	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "transfer")
		return err
	})
	if err != nil {
		t.Fatalf("allocate a transfer number: %v", err)
	}
	if seq != 1 || number != "TR-1" {
		t.Fatalf("got %d %q, want 1 TR-1", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqtransfr").GetInt("next_number"); next != 2 {
		t.Fatalf("transfer next_number = %d, want 2", next)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 1 {
		t.Fatalf("journal next_number = %d, want 1 (a transfer must not take a journal number)", next)
	}
}

func TestAllocateNumber_InvoiceSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqinvoice")
	if got := row.GetString("doc_type"); got != "invoice" {
		t.Fatalf("doc_type = %q, want invoice", got)
	}
	if got := row.GetString("prefix"); got != "" {
		t.Fatalf("prefix = %q, want none", got)
	}
	if got := row.GetInt("next_number"); got != 1001 {
		t.Fatalf("next_number = %d, want 1001", got)
	}

	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "invoice")
		return err
	})
	if err != nil {
		t.Fatalf("allocate an invoice number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); next != 1002 {
		t.Fatalf("invoice next_number = %d, want 1002", next)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 1 {
		t.Fatalf("journal next_number = %d, want 1 (an invoice must not take a journal number)", next)
	}
}

// Spec §3.11: the estimate sequence is seeded as booksseqestimat, with no
// prefix, starting at 1001.
func TestAllocateNumber_EstimateSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqestimat")
	if got := row.GetString("doc_type"); got != "estimate" {
		t.Fatalf("doc_type = %q, want estimate", got)
	}
	if got := row.GetString("prefix"); got != "" {
		t.Fatalf("prefix = %q, want none", got)
	}
	if got := row.GetInt("next_number"); got != 1001 {
		t.Fatalf("next_number = %d, want 1001", got)
	}
}

// Receive payment spec §4.2 and the Numbering card "Payments (no prefix, next
// 1001)": the payment sequence is seeded as booksseqpayment, and a payment
// number does not take another kind's.
func TestAllocateNumber_PaymentSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqpayment")
	if got := row.GetString("doc_type"); got != "payment" {
		t.Fatalf("doc_type = %q, want payment", got)
	}
	if got := row.GetString("prefix"); got != "" {
		t.Fatalf("prefix = %q, want none", got)
	}
	if got := row.GetInt("next_number"); got != 1001 {
		t.Fatalf("next_number = %d, want 1001", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "payment")
		return err
	})
	if err != nil {
		t.Fatalf("allocate a payment number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); next != 1001 {
		t.Fatalf("invoice next_number = %d, want 1001 (a payment must not take an invoice number)", next)
	}
}

// Pay-bills spec §4.1 and the Numbering card "Bill payments (no prefix, next
// 1001)": the bill payment sequence is seeded as booksseqbillpay, and a bill
// payment number takes neither a payment's nor a bill's.
func TestAllocateNumber_BillPaymentSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqbillpay")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"bill_payment", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [bill_payment  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "bill_payment")
		return err
	})
	if err != nil {
		t.Fatalf("allocate a bill payment number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	for _, other := range []string{"booksseqpayment", "booksseqbill000"} {
		if next := reload(t, app, "books_doc_sequences", other).GetInt("next_number"); next != 1001 {
			t.Fatalf("%s next_number = %d, want 1001 (a bill payment must not take its number)", other, next)
		}
	}
}

// Credit memo spec §4.1: the credit memo sequence is seeded as booksseqcreditm,
// with no prefix, starting at 1001, and a credit memo number takes no invoice's.
func TestAllocateNumber_CreditMemoSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqcreditm")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"credit_memo", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [credit_memo  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, docTypeCreditMemo)
		return err
	})
	if err != nil {
		t.Fatalf("allocate a credit memo number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); next != 1001 {
		t.Fatalf("invoice next_number = %d, want 1001 (a credit memo must not take an invoice number)", next)
	}
}

// Vendor credit spec §3.12, §4: the vendor credit sequence is seeded as
// booksseqvcredit, with no prefix, starting at 1001, and a vendor credit number
// takes no bill's.
func TestAllocateNumber_VendorCreditSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqvcredit")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"vendor_credit", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [vendor_credit  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, docTypeVendorCredit)
		return err
	})
	if err != nil {
		t.Fatalf("allocate a vendor credit number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqbill000").GetInt("next_number"); next != 1001 {
		t.Fatalf("bill next_number = %d, want 1001 (a vendor credit must not take a bill number)", next)
	}
}

// Vendor refund spec §3.11, §4: the vendor refund sequence is seeded as
// booksseqvrefund, with no prefix, starting at 1001, and a vendor refund
// number takes no vendor credit's.
func TestAllocateNumber_VendorRefundSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqvrefund")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"vendor_refund", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [vendor_refund  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, docTypeVendorRefund)
		return err
	})
	if err != nil {
		t.Fatalf("allocate a vendor refund number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if docTypeVendorRefund != "vendor_refund" {
		t.Errorf("docTypeVendorRefund = %q, want vendor_refund", docTypeVendorRefund)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqvcredit").GetInt("next_number"); next != 1001 {
		t.Fatalf("vendor credit next_number = %d, want 1001 (a vendor refund must not take a vendor credit number)", next)
	}
}

// Refund receipt spec §4.2, Q6: the refund receipt sequence is seeded as
// booksseqrefundr, with no prefix, starting at 1001, and a refund receipt
// number takes no sales receipt's or credit memo's.
func TestAllocateNumber_RefundReceiptSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqrefundr")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"refund_receipt", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [refund_receipt  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, docTypeRefundReceipt)
		return err
	})
	if err != nil {
		t.Fatalf("allocate a refund receipt number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	for _, other := range []string{"booksseqsalesrc", "booksseqcreditm"} {
		if next := reload(t, app, "books_doc_sequences", other).GetInt("next_number"); next != 1001 {
			t.Fatalf("%s next_number = %d, want 1001 (a refund receipt must not take its number)", other, next)
		}
	}
}

// Write-off spec §4.2, Q6: the write-off sequence is seeded as
// booksseqwriteof, with no prefix, starting at 1001, and a write-off number
// takes no invoice's or payment's.
func TestAllocateNumber_WriteOffSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqwriteof")
	if got := [3]any{row.GetString("doc_type"), row.GetString("prefix"), row.GetInt("next_number")}; got != [3]any{"write_off", "", 1001} {
		t.Fatalf("doc_type/prefix/next_number = %v, want [write_off  1001]", got)
	}
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, docTypeWriteOff)
		return err
	})
	if err != nil {
		t.Fatalf("allocate a write-off number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if docTypeWriteOff != "write_off" {
		t.Errorf("docTypeWriteOff = %q, want write_off", docTypeWriteOff)
	}
	for _, other := range []string{"booksseqinvoice", "booksseqpayment"} {
		if next := reload(t, app, "books_doc_sequences", other).GetInt("next_number"); next != 1001 {
			t.Fatalf("%s next_number = %d, want 1001 (a write-off must not take its number)", other, next)
		}
	}
}

func TestJournalEntryOrigin_HasDocument(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("origin").(*core.SelectField)
	if !ok {
		t.Fatal("books_journal_entries.origin is not a select field")
	}
	if !slices.Contains(field.Values, "document") {
		t.Fatalf("origin values = %v, want document among them", field.Values)
	}
}

func TestDocTypes_MatchTheMigrations(t *testing.T) {
	app := newBooksApp(t)
	// Estimates never post, so only the sequences know the estimate doc type.
	// The lists are compared sorted: where a new doc type lands in the select
	// is not a rule.
	entryTypes := []string{"journal", "transfer", "invoice", "sales_receipt", "bill", "expense", "payment", "bill_payment", "credit_memo", "vendor_credit", "vendor_refund", "refund_receipt", "write_off"}
	want := map[string][]string{
		"books_journal_entries": slices.Sorted(slices.Values(entryTypes)),
		"books_doc_sequences":   slices.Sorted(slices.Values(append(slices.Clone(entryTypes), "estimate"))),
	}
	for _, name := range []string{"books_journal_entries", "books_doc_sequences"} {
		want := want[name]
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatalf("find %s: %v", name, err)
		}
		field, ok := col.Fields.GetByName("doc_type").(*core.SelectField)
		if !ok {
			t.Fatalf("%s.doc_type is not a select field", name)
		}
		if !slices.Equal(slices.Sorted(slices.Values(field.Values)), want) {
			t.Fatalf("%s.doc_type values = %v, want %v", name, field.Values, want)
		}
	}
}

func TestAllocateNumber_UnknownTypeFails(t *testing.T) {
	app := newBooksApp(t)
	err := app.RunInTransaction(func(tx core.App) error {
		_, _, err := allocateNumber(tx, "no_such_doc_type")
		return err
	})
	if err == nil {
		t.Fatal("an unknown document type got a number")
	}
}
