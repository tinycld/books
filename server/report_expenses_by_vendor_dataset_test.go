package books

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ebvCashColumns are the columns of books_cash_basis_lines (all of them), for
// the shared row writer.
var ebvCashColumns = map[string][]string{
	cashLinesCollection: {"account", "bill", "card_payment", "created", "credit", "credit_memo", "currency", "customer",
		"date", "debit", "doc_type", "document_kind", "entry", "id", "invoice", "memo", "payment_entry", "position", "posted",
		"updated", "vendor", "vendor_credit", "write_off"},
}

// ebvPayerKey names a balance payer by its lines collection and the field that
// names the paid document; ebvPayerKeys are the payers the A/P book writes.
type ebvPayerKey struct{ lines, field string }

var ebvPayerKeys = map[ebvPayerKey]bool{
	{apPaymentLines, "bill"}:          true,
	{apApplications, "bill"}:          true,
	{apApplications, "vendor_credit"}: true,
	{apRefundLines, "vendor_credit"}:  true,
}

// writeEBVDataset is the Expenses by Vendor's scale book (plan decision D7):
// the A/P Aging's book as writeAPDataset writes it, then, in one transaction,
// a bulk pass through the shared row writer that writes the
// books_cash_basis_lines rows posting writes for each bill and vendor credit
// (cash_basis.go's take-out and share rows, derived from data.plan and the ids
// in data.docs, not read back per document), then rebuildCashBalances for the
// stored cash months. It never calls rebuildCashBasis: its payer reads cost
// O(posted entries) per document, so on the L book it did not end in 60
// minutes. writeAPDataset is not changed,
// so the A/P Aging's and the Vendor Balance's datasets stay as they are.
func writeEBVDataset(t *testing.T, b apBook, size apSize) apDataset {
	t.Helper()
	data := writeAPDataset(t, b, size)
	err := b.app.RunInTransaction(func(tx core.App) error {
		sequences, err := ebvEntrySequences(tx)
		if err != nil {
			return err
		}
		copies, err := ebvEntryCopies(tx)
		if err != nil {
			return err
		}
		payers := ebvPayerIndex(data.plan)
		w := newARWriter(t, tx, ebvCashColumns)
		for i, d := range data.plan {
			deferral, ok := ebvDeferralOf(d.kind)
			if !ok {
				continue
			}
			payments := ebvDocPayments(t, deferral, data, i, payers, sequences, copies)
			rows := ebvDocCashRows(t, deferral, data, i, payments, copies, b)
			ebvWriteCashRows(w, deferral, data.docs[i].id, d.date, rows)
		}
		w.finish()
		_, err = rebuildCashBalances(tx)
		return err
	})
	if err != nil {
		t.Fatalf("%s: write the cash-basis rows: %v", size.name, err)
	}
	return data
}

// ebvEntrySequences are the sequence of every origin-document entry by id, in
// one read: a share row's payments sort by their entry's sequence.
func ebvEntrySequences(tx core.App) (map[string]int, error) {
	var rows []struct {
		ID       string `db:"id"`
		Sequence int    `db:"sequence"`
	}
	err := tx.DB().NewQuery("SELECT id, CAST(sequence AS INTEGER) AS sequence FROM books_journal_entries WHERE origin = {:origin}").
		Bind(dbx.Params{"origin": originDocument}).All(&rows)
	if err != nil {
		return nil, fmt.Errorf("read the entry sequences: %w", err)
	}
	out := make(map[string]int, len(rows))
	for _, r := range rows {
		out[r.ID] = r.Sequence
	}
	return out, nil
}

// ebvEntryCopies are the card mark and the doc type of every entry by id, in
// one read: a cash row holds its entry's (a share row its payment entry's), as
// cash_basis.go reads them from the entry, so the bulk rows stay right when the
// A/P writer writes a card entry.
func ebvEntryCopies(tx core.App) (map[string]arEntryCopy, error) {
	var rows []struct {
		ID          string `db:"id"`
		CardPayment bool   `db:"card_payment"`
		DocType     string `db:"doc_type"`
	}
	if err := tx.DB().NewQuery("SELECT id, card_payment, doc_type FROM books_journal_entries").All(&rows); err != nil {
		return nil, fmt.Errorf("read the entries' card marks and doc types: %w", err)
	}
	out := make(map[string]arEntryCopy, len(rows))
	for _, r := range rows {
		out[r.ID] = arEntryCopy{card: r.CardPayment, docType: r.DocType}
	}
	return out, nil
}

// ebvCopyOf is entry's card mark and doc type; an entry the read did not find
// fails the test, so a missing entry is not read as false and blank.
func ebvCopyOf(t *testing.T, copies map[string]arEntryCopy, entry string) arEntryCopy {
	t.Helper()
	c, ok := copies[entry]
	if !ok {
		t.Fatalf("the bulk writer writes a cash row of entry %q, which the book does not hold", entry)
	}
	return c
}

// ebvDeferralOf is the deferred kind of a plan document; payments, refunds,
// applications and journal entries are none.
func ebvDeferralOf(kind string) (cashDeferral, bool) {
	switch kind {
	case apKindBill:
		return billCashDeferral, true
	case apKindCredit:
		return vendorCreditCashDeferral, true
	}
	return cashDeferral{}, false
}

// ebvPayerIndex is, for each payer key, the plan indexes of the payments,
// refunds and applications that name each plan document, in plan order.
func ebvPayerIndex(plan []apDoc) map[ebvPayerKey]map[int][]int {
	index := map[ebvPayerKey]map[int][]int{}
	add := func(key ebvPayerKey, doc, payer int) {
		if index[key] == nil {
			index[key] = map[int][]int{}
		}
		list := index[key][doc]
		if len(list) > 0 && list[len(list)-1] == payer {
			return
		}
		index[key][doc] = append(list, payer)
	}
	for j, o := range plan {
		switch o.kind {
		case apKindPayment:
			for _, p := range o.parts {
				add(ebvPayerKey{apPaymentLines, "bill"}, p.doc, j)
			}
		case apKindRefund:
			for _, p := range o.parts {
				add(ebvPayerKey{apRefundLines, "vendor_credit"}, p.doc, j)
			}
		case apKindApplication:
			add(ebvPayerKey{apApplications, "bill"}, o.bill, j)
			add(ebvPayerKey{apApplications, "vendor_credit"}, o.credit, j)
		}
	}
	return index
}

// ebvDocPayments are what pays plan document i, as documentPayments reads
// them: for each payer of the deferral's balance kind, each posted payment or
// refund (its entry, the sum of its lines on the document) and each
// application (the vendor credit's posted entry, at the apply date), with the
// payer's memo; sorted by date, then entry sequence, then id.
func ebvDocPayments(t *testing.T, d cashDeferral, data apDataset, i int, index map[ebvPayerKey]map[int][]int, sequences map[string]int, copies map[string]arEntryCopy) []cashPayment {
	t.Helper()
	var payments []cashPayment
	for _, p := range d.Balance.Payers {
		if p.NoCash {
			continue
		}
		key := ebvPayerKey{p.LinesCollection, p.LineField}
		if !ebvPayerKeys[key] {
			t.Fatalf("the %s balance has a payer %v the A/P book does not write", d.Kind, key)
		}
		for _, j := range index[key][i] {
			o := data.plan[j]
			if p.PaymentCollection != "" {
				if o.void {
					continue
				}
				var amount int64
				for _, part := range o.parts {
					if part.doc == i {
						amount += int64(part.cents)
					}
				}
				entry := data.docs[j].entry
				c := ebvCopyOf(t, copies, entry)
				payments = append(payments, cashPayment{
					ID: entry, Entry: entry, Date: o.date, Sequence: sequences[entry], Amount: amount, Memo: p.CashMemo,
					CardPayment: c.card, DocType: c.docType,
				})
				continue
			}
			if p.EntryField != "vendor_credit" {
				t.Fatalf("the %s balance's application payer names the entry of %s, want vendor_credit", d.Kind, p.EntryField)
			}
			if data.plan[o.credit].void {
				continue
			}
			entry := data.docs[o.credit].entry
			c := ebvCopyOf(t, copies, entry)
			payments = append(payments, cashPayment{
				ID: data.docs[j].id, Entry: entry, Date: o.date, Sequence: sequences[entry], Amount: int64(o.cents), Memo: p.CashMemo,
				CardPayment: c.card, DocType: c.docType,
			})
		}
	}
	sort.SliceStable(payments, func(x, y int) bool {
		a, c := payments[x], payments[y]
		if a.Date != c.Date {
			return a.Date < c.Date
		}
		if a.Sequence != c.Sequence {
			return a.Sequence < c.Sequence
		}
		return a.ID < c.ID
	})
	return payments
}

// ebvDocLines are the lines apWriteDoc posts for a bill or a vendor credit,
// in position order: the Accounts payable line (the control line), then the
// expense line.
func ebvDocLines(t *testing.T, d apDoc, b apBook) []arJELine {
	t.Helper()
	switch d.kind {
	case apKindBill:
		return []arJELine{
			{account: b.payable.Id, credit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, debit: d.cents, vendor: d.vendor},
		}
	case apKindCredit:
		return []arJELine{
			{account: b.payable.Id, debit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, credit: d.cents, vendor: d.vendor},
		}
	}
	t.Fatalf("plan kind %s has no cash-basis rows", d.kind)
	return nil
}

// ebvDocCashRows are plan document i's cash-basis rows as wantCashRows derives
// them: a take-out row for each posted line of its entry and of its void
// reversal (in that order, by position), then for each payment a share of each
// non-control line of its posted entry by largestRemainder over the cumulative
// amount paid and the control line's row of the payment's amount; each row's
// position is its index.
func ebvDocCashRows(t *testing.T, d cashDeferral, data apDataset, i int, payments []cashPayment, copies map[string]arEntryCopy, b apBook) []cashLine {
	t.Helper()
	doc, wr := data.plan[i], data.docs[i]
	jl := ebvDocLines(t, doc, b)
	var lines []cashSourceLine
	add := func(entry, status, origin string, reversed bool) {
		c := ebvCopyOf(t, copies, entry)
		for pos, l := range jl {
			debit, credit := int64(l.debit), int64(l.credit)
			if reversed {
				debit, credit = credit, debit
			}
			lines = append(lines, cashSourceLine{
				Entry: entry, Status: status, Origin: origin, Number: wr.number, Account: l.account,
				Debit: debit, Credit: credit, Date: doc.date, Position: pos, Vendor: l.vendor, Customer: l.customer,
				Currency: "USD", CardPayment: c.card, DocType: c.docType,
			})
		}
	}
	status := statusPosted
	if doc.void {
		status = statusVoid
	}
	add(wr.entry, status, originDocument, false)
	if doc.void {
		add(wr.reversal, statusPosted, originVoidReversal, true)
	}

	var rows []cashLine
	var current []cashSourceLine
	for _, l := range lines {
		rows = append(rows, cashLine{
			Entry: l.Entry, Account: l.Account, Vendor: l.Vendor, Customer: l.Customer,
			Date: l.Date, Memo: d.UnpaidMemo, Currency: l.Currency,
			Debit: l.Credit, Credit: l.Debit, CardPayment: l.CardPayment, DocType: l.DocType,
		})
		if l.Status == statusPosted && l.Origin == originDocument {
			current = append(current, l)
		}
	}
	rows = append(rows, ebvShareRows(d, current, payments)...)
	for k := range rows {
		rows[k].Position = k
	}
	return rows
}

// ebvShareRows are the rows payments bring back over the current entry's lines
// (in position order), as paymentShareRows derives them.
func ebvShareRows(d cashDeferral, current []cashSourceLine, payments []cashPayment) []cashLine {
	if len(current) == 0 {
		return nil
	}
	control, others := current[0], current[1:]
	sign, total := int64(1), control.Credit
	if control.Debit > 0 {
		sign, total = -1, control.Debit
	}
	if total == 0 {
		return nil
	}
	amounts := make([]int64, len(others))
	for k, l := range others {
		amounts[k] = sign * (l.Debit - l.Credit)
	}
	memoOf := func(p cashPayment) string {
		if p.Memo != "" {
			return fmt.Sprintf(p.Memo, control.Number)
		}
		return fmt.Sprintf(d.PaidMemo, control.Number)
	}
	row := func(l cashSourceLine, p cashPayment, signed int64) cashLine {
		r := cashLine{
			Entry: p.Entry, PaymentEntry: p.Entry, Account: l.Account, Vendor: l.Vendor, Customer: l.Customer,
			Date: p.Date, Memo: memoOf(p), Currency: l.Currency, CardPayment: p.CardPayment, DocType: p.DocType,
		}
		if signed > 0 {
			r.Debit = signed
		} else {
			r.Credit = -signed
		}
		return r
	}
	var rows []cashLine
	var paid int64
	before := make([]int64, len(others))
	for _, p := range payments {
		paid += p.Amount
		after := largestRemainder(amounts, paid, total)
		for k, l := range others {
			if share := after[k] - before[k]; share != 0 {
				rows = append(rows, row(l, p, sign*share))
			}
		}
		rows = append(rows, row(control, p, -sign*p.Amount))
		before = after
	}
	return rows
}

// ebvWriteCashRows writes one document's rows as syncCashLineRows saves them:
// the document_kind and the field of its kind name the document, the other
// kinds' fields are empty, and every row is posted.
func ebvWriteCashRows(w *arWriter, d cashDeferral, docID, date string, rows []cashLine) {
	w.t.Helper()
	stamp := date + " 12:00:00.000Z"
	for _, r := range rows {
		values := map[string]any{
			"id": w.id("k"), "created": stamp, "updated": stamp, "document_kind": d.Kind,
			"bill": "", "invoice": "", "vendor_credit": "", "credit_memo": "", "write_off": "",
			"entry": r.Entry, "payment_entry": r.PaymentEntry, "account": r.Account, "vendor": r.Vendor,
			"customer": r.Customer, "debit": r.Debit, "credit": r.Credit, "date": r.Date, "posted": true,
			"memo": r.Memo, "currency": r.Currency, "position": r.Position,
			"card_payment": r.CardPayment, "doc_type": r.DocType,
		}
		values[d.Kind] = docID
		w.row(cashLinesCollection, values)
	}
}

// ebvRunsTable is the Runs table of expenses-by-vendor-perf-results.md (plan
// D11 item 4): one row per run of names, from its statement count, its S and L
// medians (medians[apS.name], medians[apL.name]) and the failures the run
// recorded. A run is "pass" only when it recorded no failure (a run error, a
// refusal with another status or message, a plan bar) and its medians meet
// its bars: runs 1 to 7 at L within apBar and 15 times S, the export run
// (export[name]) within apBar at S and at L. The recorded failures follow the
// table, one line each.
func ebvRunsTable(names []string, export map[string]bool, statements map[string]int, medians map[string]map[string]time.Duration, failures map[string][]string) string {
	var out strings.Builder
	fmt.Fprintf(&out, "| Run | Statements | S median | L median | Ratio | Bar | Result |\n|---|---|---|---|---|---|---|\n")
	for _, name := range names {
		s, l := medians[apS.name][name], medians[apL.name][name]
		bar := apBar(export[name])
		failed := len(failures[name]) > 0
		if export[name] {
			result := ebvPassFail(failed || l > bar || s <= 0 || s > bar)
			lCell := fmt.Sprintf("%s (refused: %q)", l, ebvExportCap)
			if failed {
				lCell = fmt.Sprintf("%s (see the recorded failures)", l)
			}
			fmt.Fprintf(&out, "| %s | %d | %s | %s | n/a | %s at S, Total = run 1's; at L refused with %q, %s | %s |\n",
				name, statements[name], s, lCell, bar, ebvExportCap, bar, result)
			continue
		}
		ratio := 0.0
		if s > 0 {
			ratio = float64(l) / float64(s)
		}
		result := ebvPassFail(failed || l > bar || s <= 0 || ratio > 15)
		fmt.Fprintf(&out, "| %s | %d | %s | %s | %.1f | %s, ratio 15 | %s |\n", name, statements[name], s, l, ratio, bar, result)
	}
	var recorded []string
	for _, name := range names {
		for _, f := range failures[name] {
			recorded = append(recorded, fmt.Sprintf("- run %s: %s", name, f))
		}
	}
	if len(recorded) > 0 {
		fmt.Fprintf(&out, "\nRecorded failures:\n\n%s\n", strings.Join(recorded, "\n"))
	}
	return out.String()
}

// ebvPassFail is a Runs table result: "fail" when failed, else "pass".
func ebvPassFail(failed bool) string {
	if failed {
		return "fail"
	}
	return "pass"
}
