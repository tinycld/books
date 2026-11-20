package books

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// The performance acceptance of the A/P Aging (spec §9): a bulk writer that
// writes a book of payables as posting does, the seven runs of the report, and
// a check of each SQL statement's query plan against the A/R Aging's plan bars
// with this report's large tables. The plan check runs at a small size in
// every test run (TestAPAgingQueryPlans); the S and L sizes start only with
// BOOKS_SCALE=1 (TestAPAgingScale). The harness is report_scale_harness_test.go.

// apLastDay is the last day of every dataset and the reader's day of every
// run: the runs' default As of (Today) is the last day of the data.
const apLastDay = apToday

const (
	apKindBill        = "bill"
	apKindPayment     = "bill_payment"
	apKindCredit      = "vendor_credit"
	apKindApplication = "application" // a vendor credit application: no entry, no number
	apKindRefund      = "vendor_refund"
	apKindJournal     = "journal"
)

const (
	apBills        = "books_bills"
	apPayments     = "books_bill_payments"
	apPaymentLines = "books_bill_payment_lines"
	apCredits      = "books_vendor_credits"
	apApplications = "books_vendor_credit_applications"
	apRefunds      = "books_vendor_refunds"
	apRefundLines  = "books_vendor_refund_lines"
)

// apLargeTables are the A/P Aging's large tables (spec §9).
var apLargeTables = []string{"books_journal_lines", "books_journal_entries", apBills, apPayments, apPaymentLines, payableItemsCollection}

// apTableColumns are the columns of each table posting writes (all of them).
var apTableColumns = map[string][]string{
	arEntries: arTableColumns[arEntries],
	arLines:   arTableColumns[arLines],
	apBills: {"balance", "created", "currency", "date", "due_date", "entry", "fields", "form", "id", "mailing_address",
		"memo", "number", "posted_at", "posted_by", "ref_no", "replaced_by", "replaces", "revision", "sequence", "sort_key",
		"status", "subtotal", "terms", "total", "updated", "vendor", "voided_at", "voided_by"},
	apPayments: {"created", "currency", "date", "entry", "id", "number", "paid_from", "payment_method", "posted_at",
		"posted_by", "reference_no", "replaced_by", "replaces", "sequence", "sort_key", "status", "total", "updated",
		"vendor", "voided_at", "voided_by"},
	apPaymentLines: {"amount", "bill", "created", "id", "payment", "position", "updated"},
	apCredits: {"balance", "created", "currency", "date", "entry", "fields", "form", "id", "memo", "number", "posted_at",
		"posted_by", "ref_no", "replaced_by", "replaces", "revision", "sequence", "sort_key", "status", "subtotal", "total",
		"updated", "vendor", "voided_at", "voided_by"},
	apApplications: {"amount", "applied_by", "bill", "close_override", "created", "date", "id", "vendor_credit"},
	apRefunds: {"amount", "created", "currency", "date", "entry", "id", "memo", "number", "payment_method", "posted_at",
		"posted_by", "reference_no", "refunded_to", "replaced_by", "replaces", "sequence", "sort_key", "status", "updated",
		"vendor", "voided_at", "voided_by"},
	apRefundLines: {"amount", "created", "id", "position", "refund", "updated", "vendor_credit"},
}

// apSize is one dataset size, chosen so that the generated book has the row
// counts of the spec §9 table (apSpecTable) within 5 %: openBills stay open
// (partPaid of them part paid), closedBills are paid in full by one payment
// line each, pairPayments of the payments pay two bills of one vendor,
// voidPayments pay part of a closed bill and are voided; fullApplied credits
// are applied whole and partApplied in part to an open bill, refunded credits
// are refunded whole; manual are manual Accounts payable lines, one in ten
// with no vendor.
type apSize struct {
	name                                        string
	lines, vendors                              int
	openBills, partPaid, closedBills, voidBills int
	pairPayments, voidPayments                  int
	fullApplied, partApplied, refunded          int
	manual                                      int
	// plan, when set, is written as it is in place of a generated book.
	plan []apDoc
}

var (
	// apSmall is the plan check's book (about 500 lines) with every row kind
	// of the §9 table.
	apSmall = apSize{
		name: "small", lines: 500, vendors: 30,
		openBills: 15, partPaid: 3, closedBills: 80, voidBills: 2, pairPayments: 8, voidPayments: 3,
		fullApplied: 3, partApplied: 2, refunded: 2, manual: 10,
	}
	// Spec §9's counts cannot all hold at once: 10,000 bills with 9,000
	// payment lines leave about 850 or more open items, against "about 800".
	// So S and L write bills 3 % under the table (9,700 and 97,000), inside
	// arWithin's 5 %.
	apS = apSize{
		name: "S", lines: 50000, vendors: 200,
		openBills: 650, partPaid: 50, closedBills: 8950, voidBills: 100, pairPayments: 1100, voidPayments: 100,
		fullApplied: 100, partApplied: 50, refunded: 50, manual: 100,
	}
	apL = apSize{
		name: "L", lines: 500000, vendors: 2000,
		openBills: 6500, partPaid: 500, closedBills: 89500, voidBills: 1000, pairPayments: 11000, voidPayments: 1000,
		fullApplied: 1000, partApplied: 500, refunded: 500, manual: 1000,
	}
)

// apCounts are the row counts of the spec §9 table.
type apCounts struct {
	lines, vendors, bills, payments, paymentLines, credits, applications int
	refunds, manual, voidBills, voidPayments, openItems                  int
}

// apSpecTable is the spec §9 Dataset table.
var apSpecTable = map[string]apCounts{
	"S": {lines: 50000, vendors: 200, bills: 10000, payments: 8000, paymentLines: 9000, credits: 200, applications: 150,
		refunds: 50, manual: 100, voidBills: 100, voidPayments: 100, openItems: 800},
	"L": {lines: 500000, vendors: 2000, bills: 100000, payments: 80000, paymentLines: 90000, credits: 2000, applications: 1500,
		refunds: 500, manual: 1000, voidBills: 1000, voidPayments: 1000, openItems: 8000},
}

// apPart is cents of a payment line or a refund line on the plan document at
// index doc (a bill, a vendor credit).
type apPart struct{ doc, cents int }

// apDoc is one document of a dataset plan.
type apDoc struct {
	kind   string
	vendor string
	date   string
	due    string // a bill's due day
	// cents is a bill's or vendor credit's total, an application's amount.
	cents int
	parts []apPart // a bill payment's or vendor refund's lines
	// bill and credit are an application's bill and vendor credit (plan indexes).
	bill, credit int
	lines        []arJELine // a journal entry's lines, in position order
	memo         string     // a journal entry's memo
	void         bool       // voided, with its reversal entry
	actor        string     // who saved and posted it ("" for postJournal's entries)
	voider       string     // who voided it
}

// apWritten are the ids the writer gave one document of the plan.
type apWritten struct {
	kind, id, entry, number string
	lines, parts            []string
	reversal                string
	reversalLines           []string
}

// apItem is one open item of the writer's record: its vendor ("" for none)
// and what the business owes on it (a vendor credit is negative).
type apItem struct {
	vendor string
	owed   int
}

// apDataset is a written book: its days, its vendors, what the runs of spec §9
// pick from it, and the writer's record of the open items on the last and the
// middle day (item id → item).
type apDataset struct {
	size                      apSize
	firstDay, midDay, lastDay string
	vendors                   []string
	// picked are the five vendors of run 4.
	picked []string
	// busiest is the vendor with the most open items (run 5), busiestBill its
	// oldest open bill that has a payment (run 6).
	busiest, busiestBill string
	// vendorKey and itemKey are the group keys of the busiest vendor's row and
	// of busiestBill's row, as a run gives them.
	vendorKey, itemKey []any
	docs               []apWritten
	// plan is what the writer wrote, in the order of docs.
	plan              []apDoc
	openLast, openMid map[string]apItem
}

// writeAPDataset writes size's book to b in one transaction, straight to the
// tables through the shared row writer, with the columns posting writes:
// vendors through the app (their guards set the sort keys), every posted row
// by batched inserts, then the stored payable rows by payableItems.rebuild.
func writeAPDataset(t *testing.T, b apBook, size apSize) apDataset {
	t.Helper()
	data := apDataset{size: size, firstDay: arDay(0), midDay: arDay(arDayCount() / 2), lastDay: apLastDay}
	var plan []apDoc
	err := b.app.RunInTransaction(func(tx core.App) error {
		plan = size.plan
		busiestBill := -1
		if plan == nil {
			data.vendors = make([]string, size.vendors)
			for i := range data.vendors {
				data.vendors[i] = mkVendor(t, tx, arClip(fmt.Sprintf("Vendor %05d", i))).Id
			}
			plan, busiestBill = apGeneratePlan(t, b, size, &data)
		}
		w := newARWriter(t, tx, apTableColumns, apKindBill, apKindPayment, apKindCredit, apKindRefund, apKindJournal)
		data.docs = apWrite(w, plan, b)
		if busiestBill >= 0 {
			data.busiestBill = data.docs[busiestBill].id
		}
		w.finish()
		return payableItems.rebuild(tx)
	})
	if err != nil {
		t.Fatalf("write the %s dataset: %v", size.name, err)
	}
	data.plan = plan
	data.openLast = apRecord(plan, data.docs, b.payable.Id, data.lastDay)
	data.openMid = apRecord(plan, data.docs, b.payable.Id, data.midDay)
	if data.busiest != "" {
		apOpenKeys(t, b, &data)
	}
	return data
}

// apGeneratePlan builds size's documents from a fixed seed. It returns the
// plan and the plan index of the busiest vendor's oldest part-paid bill.
func apGeneratePlan(t testing.TB, b apBook, size apSize, data *apDataset) ([]apDoc, int) {
	t.Helper()
	rng := rand.New(rand.NewPCG(20261120, uint64(size.lines)))
	actor, voider := b.users.bookkeeper.Id, b.users.admin.Id
	vendors := data.vendors
	n := arDayCount()
	anyVendor := func() string { return vendors[rng.IntN(len(vendors))] }
	cents := func() int { return 5000 + rng.IntN(495000) }
	later := func(day, most int) int { return min(day+rng.IntN(most+1), n-1) }

	var plan []apDoc
	var days []int
	add := func(d apDoc, day int) int {
		d.date, d.actor = arDay(day), actor
		if d.void {
			d.voider = voider
		}
		plan = append(plan, d)
		days = append(days, day)
		return len(plan) - 1
	}
	bill := func(vendor string, day int, void bool) int {
		return add(apDoc{kind: apKindBill, vendor: vendor, due: arDay(day + 30), cents: cents(), void: void}, day)
	}
	payment := func(vendor string, day int, void bool, parts ...apPart) int {
		return add(apDoc{kind: apKindPayment, vendor: vendor, parts: parts, void: void}, day)
	}

	busiestOpen := min(size.openBills, max(size.openBills/20, 5))
	open := make([]int, size.openBills)
	for k := range open {
		v := anyVendor()
		if k < busiestOpen {
			v = vendors[0]
		}
		open[k] = bill(v, rng.IntN(n), false)
	}
	closed := make([]int, size.closedBills)
	for k := range closed {
		closed[k] = bill(anyVendor(), rng.IntN(n), false)
	}
	for range size.voidBills {
		bill(anyVendor(), rng.IntN(n), true)
	}

	partPaid := map[int]bool{}
	for _, bl := range open[:size.partPaid] {
		payment(plan[bl].vendor, later(days[bl], 30), false, apPart{doc: bl, cents: plan[bl].cents / 2})
		partPaid[bl] = true
	}

	byVendor := map[string][]int{}
	for _, bl := range closed {
		byVendor[plan[bl].vendor] = append(byVendor[plan[bl].vendor], bl)
	}
	pairsLeft := size.pairPayments
	var singles []int
	for _, v := range vendors {
		list := byVendor[v]
		for len(list) >= 2 && pairsLeft > 0 {
			x, y := list[0], list[1]
			list = list[2:]
			pairsLeft--
			payment(v, later(max(days[x], days[y]), 45), false,
				apPart{doc: x, cents: plan[x].cents}, apPart{doc: y, cents: plan[y].cents})
		}
		singles = append(singles, list...)
	}
	if pairsLeft > 0 || len(singles) < size.voidPayments {
		t.Fatalf("%s: the closed bills cannot make %d two-bill payments", size.name, size.pairPayments)
	}
	for _, bl := range singles {
		payment(plan[bl].vendor, later(days[bl], 45), false, apPart{doc: bl, cents: plan[bl].cents})
	}
	// A void payment paid part of a bill that a later payment closes: it reads
	// as never applied.
	for _, bl := range singles[:size.voidPayments] {
		payment(plan[bl].vendor, days[bl], true, apPart{doc: bl, cents: max(plan[bl].cents/3, 1)})
	}

	// Vendor credits: applied whole or in part to an open bill (never part
	// paid, so each application leaves the bill open), or refunded whole.
	applied := open[size.partPaid:]
	if len(applied) < size.fullApplied+size.partApplied {
		t.Fatalf("%s: %d open bills cannot take %d applications", size.name, len(applied), size.fullApplied+size.partApplied)
	}
	for k := range size.fullApplied + size.partApplied {
		target := applied[k]
		amount := 1000 + rng.IntN(4000)
		day := rng.IntN(n)
		credit := add(apDoc{kind: apKindCredit, vendor: plan[target].vendor, cents: amount}, day)
		part := amount
		if k >= size.fullApplied {
			part = amount / 2
		}
		add(apDoc{kind: apKindApplication, vendor: plan[target].vendor, cents: part, bill: target, credit: credit},
			later(max(day, days[target]), 30))
	}
	for range size.refunded {
		amount := 1000 + rng.IntN(4000)
		day := rng.IntN(n)
		credit := add(apDoc{kind: apKindCredit, vendor: anyVendor(), cents: amount}, day)
		add(apDoc{kind: apKindRefund, vendor: plan[credit].vendor, parts: []apPart{{doc: credit, cents: amount}}},
			later(day, 30))
	}

	for k := range size.manual {
		v := anyVendor()
		if k%10 == 9 {
			v = ""
		}
		amount := cents()
		ap := arJELine{account: b.payable.Id, credit: amount, vendor: v}
		other := arJELine{account: b.expense.Id, debit: amount}
		if rng.IntN(5) == 0 {
			ap.debit, ap.credit, other.debit, other.credit = amount, 0, 0, amount
		}
		add(apDoc{kind: apKindJournal, memo: arClip("A/P adjustment"), lines: []arJELine{ap, other}}, rng.IntN(n))
	}

	entries := 0
	for _, d := range plan {
		if d.kind == apKindApplication {
			continue
		}
		entries++
		if d.void {
			entries++
		}
	}
	rest := size.lines - 2*entries
	if rest < 0 || rest%2 != 0 {
		t.Fatalf("%s: %d entries leave %d journal lines for the other entries, want an even number of 0 or more", size.name, entries, rest)
	}
	for range rest / 2 {
		amount := cents()
		add(apDoc{kind: apKindJournal, memo: arClip("Rent"), lines: []arJELine{
			{account: b.expense.Id, debit: amount},
			{account: b.bank.Id, credit: amount},
		}}, rng.IntN(n))
	}

	// The busiest vendor and run 4's five vendors read the plan's own record
	// of the last day; the ids are not written yet, so the record is keyed by
	// plan index here.
	counts := map[string]int{}
	for _, it := range apPlanOpen(plan, b.payable.Id, data.lastDay) {
		counts[it.vendor]++
	}
	for _, v := range vendors {
		if counts[v] > counts[data.busiest] {
			data.busiest = v
		}
	}
	for _, v := range vendors[1:] {
		if len(data.picked) < 5 && counts[v] > 0 && v != data.busiest {
			data.picked = append(data.picked, v)
		}
	}
	if len(data.picked) < 5 {
		t.Fatalf("%s: fewer than five vendors have an open item", size.name)
	}
	oldest := -1
	for bl := range partPaid {
		if plan[bl].vendor == data.busiest && (oldest < 0 || days[bl] < days[oldest] || (days[bl] == days[oldest] && bl < oldest)) {
			oldest = bl
		}
	}
	if oldest < 0 {
		t.Fatalf("%s: the busiest vendor has no part-paid bill", size.name)
	}
	return plan, oldest
}

// apPlanOpen is the plan's open items on day, keyed by "<plan index>" for a
// document and "<plan index>/<position>" for a manual line.
func apPlanOpen(plan []apDoc, payable, day string) map[string]apItem {
	ids := make([]apWritten, len(plan))
	for i, d := range plan {
		ids[i] = apWritten{id: fmt.Sprint(i)}
		for pos := range d.lines {
			ids[i].lines = append(ids[i].lines, fmt.Sprintf("%d/%d", i, pos))
		}
	}
	return apRecord(plan, ids, payable, day)
}

// apRecord is the writer's record of the open items on day: a bill owes its
// total less its payment lines and applications dated on or before day, a
// vendor credit is minus its total less its applications and refund lines
// dated on or before day, and a manual Accounts payable line owes its credit
// less its debit. A void document and a void payment are none. An item that
// owes 0 is not open.
func apRecord(plan []apDoc, written []apWritten, payable, day string) map[string]apItem {
	owed := map[int]int{}
	for _, d := range plan {
		if d.void || d.date > day {
			continue
		}
		switch d.kind {
		case apKindPayment:
			for _, p := range d.parts {
				owed[p.doc] -= p.cents
			}
		case apKindRefund:
			for _, p := range d.parts {
				owed[p.doc] += p.cents
			}
		case apKindApplication:
			owed[d.bill] -= d.cents
			owed[d.credit] += d.cents
		}
	}
	out := map[string]apItem{}
	for i, d := range plan {
		if d.void || d.date > day {
			continue
		}
		switch d.kind {
		case apKindBill:
			if v := d.cents + owed[i]; v != 0 {
				out[written[i].id] = apItem{vendor: d.vendor, owed: v}
			}
		case apKindCredit:
			if v := -d.cents + owed[i]; v != 0 {
				out[written[i].id] = apItem{vendor: d.vendor, owed: v}
			}
		case apKindJournal:
			for pos, l := range d.lines {
				if l.account == payable && l.credit != l.debit {
					out[written[i].lines[pos]] = apItem{vendor: l.vendor, owed: l.credit - l.debit}
				}
			}
		}
	}
	return out
}

// apWrite writes plan with w and returns the ids it gave each document.
func apWrite(w *arWriter, plan []apDoc, b apBook) []apWritten {
	w.t.Helper()
	out := make([]apWritten, len(plan))
	for i, d := range plan {
		out[i] = apWritten{kind: d.kind}
		switch d.kind {
		case apKindBill:
			out[i].id = w.id("b")
		case apKindPayment:
			out[i].id = w.id("p")
		case apKindCredit:
			out[i].id = w.id("c")
		case apKindApplication:
			out[i].id = w.id("a")
			continue
		case apKindRefund:
			out[i].id = w.id("r")
		}
		out[i].entry = w.id("e")
		if out[i].id == "" {
			out[i].id = out[i].entry
		}
	}
	// What each bill and vendor credit has left: posting keeps a document's
	// balance, which a void payment does not move.
	used := map[int]int{}
	for _, d := range plan {
		switch {
		case d.void:
		case d.kind == apKindPayment || d.kind == apKindRefund:
			for _, p := range d.parts {
				used[p.doc] += p.cents
			}
		case d.kind == apKindApplication:
			used[d.bill] += d.cents
			used[d.credit] += d.cents
		}
	}
	for i, d := range plan {
		apWriteDoc(w, d, &out[i], out, used[i], b)
	}
	return out
}

// apWriteDoc writes one document as posting leaves it: the document row, its
// entry and lines, a payment's or refund's lines, and for a void the voided
// marks and the reversal entry with its lines. An application is its one row.
func apWriteDoc(w *arWriter, d apDoc, wr *apWritten, all []apWritten, used int, b apBook) {
	w.t.Helper()
	stamp := d.date + " 12:00:00.000Z"
	if d.kind == apKindApplication {
		w.row(apApplications, map[string]any{
			"id": wr.id, "amount": d.cents, "applied_by": d.actor, "bill": all[d.bill].id, "close_override": "",
			"created": stamp, "date": d.date, "vendor_credit": all[d.credit].id,
		})
		return
	}
	seq := w.next[d.kind]
	w.next[d.kind]++
	number := formatNumber(w.prefix[d.kind], seq)
	wr.number = number
	status, voidedAt, voidedBy := statusPosted, "", ""
	if d.void {
		status, voidedAt, voidedBy = statusVoid, stamp, d.voider
	}
	sortKey := fmt.Sprintf("%s %010d%s%s", d.date, seq, sortIDSep, wr.id)
	common := func(values map[string]any) map[string]any {
		values["id"], values["created"], values["updated"] = wr.id, stamp, stamp
		values["currency"], values["vendor"], values["date"], values["entry"] = "USD", d.vendor, d.date, wr.entry
		values["number"], values["sequence"], values["sort_key"] = number, seq, sortKey
		values["posted_at"], values["posted_by"], values["status"] = stamp, d.actor, status
		values["replaced_by"], values["replaces"], values["voided_at"], values["voided_by"] = "", "", voidedAt, voidedBy
		return values
	}
	// parts writes a payment's or refund's lines and returns their sum.
	parts := func(table, parent, docField string) int {
		sum := 0
		for pos, p := range d.parts {
			sum += p.cents
			id := w.id("q")
			wr.parts = append(wr.parts, id)
			w.row(table, map[string]any{
				"id": id, "amount": p.cents, "created": stamp, "updated": stamp,
				docField: all[p.doc].id, parent: wr.id, "position": pos,
			})
		}
		return sum
	}
	total, revision, origin, document, memo := d.cents, 1, "document", wr.id, ""
	var lines []arJELine
	switch d.kind {
	case apKindBill:
		balance := d.cents - used
		if d.void {
			balance = 0
		}
		lines = []arJELine{
			{account: b.payable.Id, credit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, debit: d.cents, vendor: d.vendor},
		}
		w.row(apBills, common(map[string]any{
			"balance": balance, "due_date": d.due, "fields": nil, "form": "", "mailing_address": nil, "memo": "",
			"ref_no": "", "revision": 3, "subtotal": d.cents, "terms": "", "total": d.cents,
		}))
	case apKindPayment:
		total = parts(apPaymentLines, "payment", "bill")
		names := make([]string, len(d.parts))
		for i, p := range d.parts {
			names[i] = "Bill " + all[p.doc].number
		}
		memo = "Payment of " + strings.Join(names, ", ")
		lines = []arJELine{
			{account: b.payable.Id, debit: total, vendor: d.vendor},
			{account: b.bank.Id, credit: total, vendor: d.vendor},
		}
		w.row(apPayments, common(map[string]any{
			"paid_from": b.bank.Id, "payment_method": "check", "reference_no": "", "total": total,
		}))
	case apKindCredit:
		balance := d.cents - used
		if d.void {
			balance = 0
		}
		lines = []arJELine{
			{account: b.payable.Id, debit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, credit: d.cents, vendor: d.vendor},
		}
		w.row(apCredits, common(map[string]any{
			"balance": balance, "fields": nil, "form": "", "memo": "", "ref_no": "", "revision": 3,
			"subtotal": d.cents, "total": d.cents,
		}))
	case apKindRefund:
		total = parts(apRefundLines, "refund", "vendor_credit")
		lines = []arJELine{
			{account: b.bank.Id, debit: total, vendor: d.vendor},
			{account: b.payable.Id, credit: total, vendor: d.vendor},
		}
		w.row(apRefunds, common(map[string]any{
			"amount": total, "memo": "", "payment_method": "", "reference_no": "", "refunded_to": b.bank.Id,
		}))
	default:
		lines, origin, document, memo = d.lines, "manual", "", d.memo
		total = 0
		for _, l := range lines {
			total += l.debit
		}
		// A manual entry is saved, then each line, then it posts: each step
		// moves its revision.
		revision = 2 + len(lines)
	}
	w.entry(map[string]any{
		"id": wr.entry, "created_by": d.actor, "date": d.date, "doc_type": d.kind, "document": document,
		"memo": memo, "number": number, "origin": origin, "posted_at": stamp, "posted_by": d.actor,
		"reverses": "", "revision": revision, "sequence": seq, "status": status, "total": total,
		"created": stamp, "updated": stamp, "voided_at": voidedAt, "voided_by": voidedBy,
	})
	wr.lines = w.lines(wr.entry, d.date, stamp, lines, false)
	if !d.void {
		return
	}
	wr.reversal = w.id("e")
	w.entry(map[string]any{
		"id": wr.reversal, "created_by": d.voider, "date": d.date, "doc_type": d.kind, "document": "",
		"memo": arClip("Void of " + number), "number": number, "origin": "void_reversal", "posted_at": stamp,
		"posted_by": d.voider, "reverses": wr.entry, "revision": 1, "sequence": seq, "status": statusPosted,
		"total": total, "created": stamp, "updated": stamp, "voided_at": "", "voided_by": "",
	})
	wr.reversalLines = w.lines(wr.reversal, d.date, stamp, lines, true)
}

// apRunErr runs the A/P Aging as b's reader with opts, as core's run endpoint does.
func apRunErr(t *testing.T, b apBook, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	return runAPErr(t, b.app, b.reader, params, opts)
}

// apOpenKeys reads the group keys runs 5 and 6 open, as the view does: the
// busiest vendor's key from the default run, its oldest part-paid bill's key
// from the run with that vendor opened.
func apOpenKeys(t *testing.T, b apBook, data *apDataset) {
	t.Helper()
	res, err := apRunErr(t, b, nil, reports.Options{Today: data.lastDay})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	row, found := cbGroupRow(res, 1, data.busiest)
	if !found {
		t.Fatalf("%s: the default run has no row for the busiest vendor %s", data.size.name, data.busiest)
	}
	data.vendorKey = row.GroupKey
	opened, err := apRunErr(t, b, nil, reports.Options{Today: data.lastDay, Expand: [][]any{row.GroupKey}, Collapse: [][]any{}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	item, found := apItemRow(opened, data.busiestBill)
	if !found {
		t.Fatalf("%s: the busiest vendor opened has no item row for %s", data.size.name, data.busiestBill)
	}
	data.itemKey = item.GroupKey
}

// apRuns are the seven runs of spec §9 on data.
func apRuns(b apBook, data apDataset) []arRun {
	vendor, item := data.vendorKey, data.itemKey
	day := reports.Options{Today: data.lastDay}
	return []arRun{
		{name: "1 default", opts: day, wholeBook: true},
		{name: "2 past day", params: map[string]any{"asOf": data.midDay}, opts: day, wholeBook: true},
		{name: "3 largest balance", params: map[string]any{"order": "balance"}, opts: day, wholeBook: true},
		{name: "4 five vendors", params: map[string]any{"vendors": data.picked}, opts: day, bound: true},
		{name: "5 vendor opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{vendor}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		{name: "6 item opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{vendor, item}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		{name: "7 CSV export", export: true, wholeBook: true},
	}
}

// apResult runs r (not the export) as the Books reader.
func apResult(t *testing.T, b apBook, r arRun) *reports.Result {
	t.Helper()
	res, err := apRunErr(t, b, r.params, r.opts)
	if err != nil {
		t.Fatalf("run %s: %v", r.name, err)
	}
	return res
}

// apExec runs r as the Books reader (run 7: the CSV export).
func apExec(t *testing.T, b apBook, r arRun) {
	t.Helper()
	if r.export {
		exportAPCSV(t, b, b.reader, r.params)
		return
	}
	apResult(t, b, r)
}

// recordAPRun runs r and returns each distinct SELECT it ran, in order. An
// export is run once first: its first call ships the report on the app.
func recordAPRun(t *testing.T, b apBook, r arRun) []string {
	t.Helper()
	if r.export {
		apExec(t, b, r)
	}
	var mu sync.Mutex
	seen := map[string]bool{}
	var out []string
	recordStatements(t, b.app, func(statement string) {
		s := strings.TrimSpace(statement)
		upper := strings.ToUpper(s)
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}, func() { apExec(t, b, r) })
	return out
}

// apCheckRuns records each run's statements and checks every plan under each
// reading against the bars with apLargeTables. The statements that runs 5 and
// 6 record and run 1 does not are bound. It fails a run that records no SELECT
// reading books_payable_items.
func apCheckRuns(t *testing.T, b apBook, runs []arRun, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat)) {
	t.Helper()
	base := map[string]bool{}
	for _, run := range runs {
		statements := recordAPRun(t, b, run)
		if run.name == runs[0].name {
			for _, s := range statements {
				base[s] = true
			}
		}
		for _, reading := range readings {
			var steps []planStep
			var stats []arStat
			if reading.stats == nil && !reading.analyze {
				steps = explainStatements(t, b.app, statements)
			} else {
				steps, stats = explainReading(t, b.app, reading, statements)
			}
			readsItems := false
			for i, s := range statements {
				own := arStepsOf(steps, i)
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, payableItemsCollection) }) {
					readsItems = true
				}
				r := run
				r.reading = reading.name
				r.bound = run.bound || (run.adds && !base[s])
				checkPlanBars(t, r, s, own, apLargeTables)
			}
			if !readsItems {
				t.Errorf("run %s, %s: none of its %d SELECTs reads books_payable_items: the statement recorder is wired wrong",
					run.name, reading.name, len(statements))
			}
			if record != nil {
				record(run, reading, statements, steps, stats)
			}
		}
	}
}

// apMapped is a bulk id as the posted id it stands for; an application's
// credit row id is the application's id followed by "c".
func apMapped(id string, idMap map[string]string) string {
	if m, ok := idMap[id]; ok {
		return m
	}
	if base, ok := strings.CutSuffix(id, "c"); ok {
		if m, ok := idMap[base]; ok {
			return m + "c"
		}
	}
	return id
}

func TestAPAgingBulkWriterMatchesPosters(t *testing.T) {
	// The posters' book.
	pb := newAPBook(t)
	v := apVendor(t, pb, "Mirror Supply")
	bill := apBill(t, pb, v, "2026-08-04", "2026-09-03", 100000)
	pay := apPayBills(t, pb, v, "2026-09-10", map[string]int{bill.Id: 30000})
	credit := apVendorCredit(t, pb, v, "2026-10-01", 50000)
	app := apApply(t, pb, credit, bill, "2026-10-05", 20000)
	refund := apRefund(t, pb, v, "2026-10-09", map[string]int{credit.Id: 5000})
	je := apJournal(t, pb, "2026-09-01", v, 0, 31000)

	// The bulk writer's book, a second app.
	bb := newAPBook(t)
	bv := apVendor(t, bb, "Mirror Supply")
	actor := bb.users.bookkeeper.Id
	data := writeAPDataset(t, bb, apSize{name: "mirror", plan: []apDoc{
		{kind: apKindBill, vendor: bv.Id, date: "2026-08-04", due: "2026-09-03", cents: 100000, actor: actor},
		{kind: apKindPayment, vendor: bv.Id, date: "2026-09-10", parts: []apPart{{doc: 0, cents: 30000}}, actor: actor},
		{kind: apKindCredit, vendor: bv.Id, date: "2026-10-01", cents: 50000, actor: actor},
		{kind: apKindApplication, vendor: bv.Id, date: "2026-10-05", cents: 20000, bill: 0, credit: 2, actor: actor},
		{kind: apKindRefund, vendor: bv.Id, date: "2026-10-09", parts: []apPart{{doc: 2, cents: 5000}}, actor: actor},
		{kind: apKindJournal, date: "2026-09-01", memo: "A/P adjustment", lines: []arJELine{
			{account: bb.payable.Id, credit: 31000, vendor: bv.Id},
			{account: bb.expense.Id, debit: 31000},
		}},
	}})

	// The records both books share by role: a bulk id maps to the posted one.
	idMap := map[string]string{
		bv.Id: v.Id, bb.payable.Id: pb.payable.Id, bb.expense.Id: pb.expense.Id, bb.bank.Id: pb.bank.Id,
		bb.users.bookkeeper.Id: pb.users.bookkeeper.Id, bb.users.admin.Id: pb.users.admin.Id,
	}
	type pair struct{ table, bulk, posted string }
	var pairs []pair
	match := func(table string, bulk, posted []string) {
		t.Helper()
		if len(bulk) != len(posted) {
			t.Fatalf("%s: the bulk writer wrote %d rows, posting wrote %d", table, len(bulk), len(posted))
		}
		for i := range bulk {
			pairs = append(pairs, pair{table, bulk[i], posted[i]})
			idMap[bulk[i]] = posted[i]
		}
	}
	posted := []struct {
		table   string
		doc     *core.Record
		entry   string
		partsOf string // the lines table of a payment or refund
		partsBy string
	}{
		{apBills, bill, bill.GetString("entry"), "", ""},
		{apPayments, pay, pay.GetString("entry"), apPaymentLines, "payment"},
		{apCredits, credit, credit.GetString("entry"), "", ""},
		{apApplications, app, "", "", ""},
		{apRefunds, refund, refund.GetString("entry"), apRefundLines, "refund"},
		{"", nil, je.Id, "", ""},
	}
	postedEntries := map[string]bool{}
	for i, p := range posted {
		w := data.docs[i]
		if p.doc != nil {
			match(p.table, []string{w.id}, []string{p.doc.Id})
		}
		if p.entry == "" {
			continue
		}
		postedEntries[p.entry] = true
		match(arEntries, []string{w.entry}, []string{p.entry})
		match(arLines, w.lines, arIDsWhere(t, pb.app, arLines, "entry", p.entry))
		if p.partsOf != "" {
			match(p.partsOf, w.parts, arIDsWhere(t, pb.app, p.partsOf, p.partsBy, p.doc.Id))
		}
	}

	ignored := map[string]bool{"id": true, "number": true, "sequence": true, "created": true, "updated": true, "posted_at": true}
	for _, p := range pairs {
		bulkRow, postedRow := arRawRow(t, bb.app, p.table, p.bulk), arRawRow(t, pb.app, p.table, p.posted)
		cols := make([]string, 0, len(postedRow))
		for col := range postedRow {
			cols = append(cols, col)
		}
		sort.Strings(cols)
		for _, col := range cols {
			if ignored[col] {
				continue
			}
			if _, ok := bulkRow[col]; !ok {
				t.Errorf("%s.%s: the bulk book has no such column", p.table, col)
				continue
			}
			got := arNormal(bulkRow, col, idMap)
			want := arNormal(postedRow, col, nil)
			if got != want {
				t.Errorf("%s.%s differs: the bulk writer wrote %s, posting wrote %s", p.table, col, got, want)
			}
		}
	}

	// The stored payable rows: the bulk writer's rebuild against the posters'
	// refreshes, ids mapped, numbers left out.
	var want, got []apRow
	for _, r := range apRows(t, pb.app, "") {
		if postedEntries[r.entry] {
			r.number, r.seq = "", 0
			want = append(want, r)
		}
	}
	for _, r := range apRows(t, bb.app, "") {
		r.id, r.vendor, r.entry, r.item = apMapped(r.id, idMap), apMapped(r.vendor, idMap), apMapped(r.entry, idMap), apMapped(r.item, idMap)
		if postedEntries[r.entry] {
			r.number, r.seq = "", 0
			got = append(got, r)
		}
	}
	byID := func(rows []apRow) { sort.Slice(rows, func(i, j int) bool { return rows[i].id < rows[j].id }) }
	byID(want)
	byID(got)
	if len(want) == 0 || !reflect.DeepEqual(got, want) {
		t.Errorf("the bulk payable rows (ids mapped to the posted ones) =\n%+v\nwant the posted rows\n%+v", got, want)
	}
}

func TestAPAgingQueryPlans(t *testing.T) {
	b := newAPBook(t)
	data := writeAPDataset(t, b, apSmall)
	runs := apRuns(b, data)

	t.Run("the bars name this report's large tables", func(t *testing.T) {
		whole := arRun{name: "1 default", wholeBook: true, reading: "hand-written"}
		for _, table := range []string{apBills, apPayments, apPaymentLines, payableItemsCollection} {
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, whole, "SELECT 1", []planStep{
				{ID: 2, Detail: "SCAN v", Tables: []string{"books_vendors"}},
				{ID: 3, Detail: "SCAN x", Tables: []string{table}},
			}, apLargeTables)
			if len(rec.errs) == 0 {
				t.Errorf("checkPlanBars passes a SCAN of %s inside a loop, want a failure", table)
			}
		}
	})

	apCheckRuns(t, b, runs, []arReading{{name: "no statistics"}}, nil)
	apCheckRuns(t, b, runs, []arReading{{name: "L statistics", stats: arLStats(t, "ap_aging_stat1.json")}}, nil)
}

// apOpenOf reads the open items of a run with every vendor row opened: item id
// → its vendor and its Total. It fails when the run's Total row is not the sum
// of the items.
func apOpenOf(t *testing.T, b apBook, params map[string]any, day string) map[string]apItem {
	t.Helper()
	closed, err := apRunErr(t, b, params, reports.Options{Today: day})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	var keys [][]any
	for _, r := range apVendorRows(closed) {
		keys = append(keys, r.GroupKey)
	}
	opened, err := apRunErr(t, b, params, reports.Options{Today: day, Expand: keys, Collapse: [][]any{}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	out := map[string]apItem{}
	sum := int64(0)
	for _, r := range opened.Rows {
		if r.Kind != reports.KindGroup || r.Level != 2 || len(r.GroupKey) < 2 {
			continue
		}
		vendor, _ := r.GroupKey[0].(string)
		item, _ := r.GroupKey[1].(string)
		v, _ := agedCell(t, r, "total")
		out[item] = apItem{vendor: vendor, owed: int(v)}
		sum += v
	}
	if got := amt(t, totalOf(t, opened), "total"); got != sum {
		t.Errorf("params %v: the Total row = %d, want %d, the sum of the item rows", params, got, sum)
	}
	return out
}

// apRequireRecord fails when the report's open items differ from the writer's
// record, naming each item that differs.
func apRequireRecord(t *testing.T, what string, got, want map[string]apItem) {
	t.Helper()
	if reflect.DeepEqual(got, want) {
		return
	}
	var diffs []string
	for id, w := range want {
		if g, ok := got[id]; !ok || g != w {
			diffs = append(diffs, fmt.Sprintf("%s: report %+v (shown %v), record %+v", id, g, ok, w))
		}
	}
	for id, g := range got {
		if _, ok := want[id]; !ok {
			diffs = append(diffs, fmt.Sprintf("%s: report %+v, not in the record", id, g))
		}
	}
	sort.Strings(diffs)
	t.Errorf("%s: %d open items differ from the writer's record (%d in the report, %d in the record):\n%s",
		what, len(diffs), len(got), len(want), strings.Join(diffs[:min(len(diffs), 20)], "\n"))
}

func TestAPAgingRunsAgreeWithSmallBook(t *testing.T) {
	b := newAPBook(t)
	data := writeAPDataset(t, b, apSmall)
	requireNoPayableDrift(t, b.app)
	runs := apRuns(b, data)

	if len(data.openLast) == 0 || len(data.openMid) == 0 {
		t.Fatalf("the writer's record has %d open items on the last day and %d on the middle day, want some on each",
			len(data.openLast), len(data.openMid))
	}
	apRequireRecord(t, "run 1 (the last day)", apOpenOf(t, b, nil, data.lastDay), data.openLast)
	apRequireRecord(t, "run 2 (the middle day)", apOpenOf(t, b, map[string]any{"asOf": data.midDay}, data.lastDay), data.openMid)

	first := apResult(t, b, runs[0])
	row, ok := cbGroupRow(first, 1, data.busiest)
	if !ok {
		t.Fatalf("run 1 has no row for the busiest vendor; rows %q", bsLabels(first))
	}
	if want := runs[4].opts.Expand[0]; !reflect.DeepEqual(row.GroupKey, want) {
		t.Errorf("run 1 keys the busiest vendor %#v; runs 5 and 6 open %#v", row.GroupKey, want)
	}

	// Run 3: every vendor of the record, in Largest balance order, with the
	// sum of its open items.
	largest := apResult(t, b, runs[2])
	if got, want := apVendorLinesOf(t, largest), apBalanceOrder(t, b, data.openLast); !reflect.DeepEqual(got, want) {
		t.Errorf("run 3 (Largest balance) vendor rows =\n%+v\nwant the record's, largest first, No vendor last, ties by name\n%+v", got, want)
	}
	if got, want := amt(t, totalOf(t, largest), "total"), int64(apSumOwed(data.openLast)); got != want {
		t.Errorf("run 3: the Total row = %d, want %d, the record's sum", got, want)
	}

	// Run 4: the five picked vendors only, each with the record's sum.
	picked := map[string]bool{}
	for _, v := range data.picked {
		picked[v] = true
	}
	wantFive := map[string]int{}
	for v, total := range apVendorTotals(data.openLast) {
		if picked[v] {
			wantFive[v] = total
		}
	}
	gotFive := map[string]int{}
	for _, l := range apVendorLinesOf(t, apResult(t, b, runs[3])) {
		gotFive[l.vendor] = l.total
	}
	if len(wantFive) != len(data.picked) || !reflect.DeepEqual(gotFive, wantFive) {
		t.Errorf("run 4 (vendors %v) vendor totals = %v, want the record's %v (one per picked vendor)", data.picked, gotFive, wantFive)
	}

	// Run 5: the busiest vendor opens into exactly its open items of the
	// record, each with its amount.
	opened := apResult(t, b, runs[4])
	vendorRow, ok := cbGroupRow(opened, 1, data.busiest)
	if !ok {
		t.Fatalf("run 5 has no row for the busiest vendor; rows %q", bsLabels(opened))
	}
	wantItems := map[string]int{}
	for id, it := range data.openLast {
		if it.vendor == data.busiest {
			wantItems[id] = it.owed
		}
	}
	gotItems := map[string]int{}
	for _, r := range apItemsOf(t, opened, vendorRow) {
		own, _ := r.GroupKey[1].(string)
		v, _ := agedCell(t, r, "total")
		gotItems[own] = int(v)
	}
	if !reflect.DeepEqual(gotItems, wantItems) {
		t.Errorf("run 5 opens the busiest vendor into items %v, want the record's %v", gotItems, wantItems)
	}

	// Run 6: the part-paid bill opens into its own line (its total) and one
	// line for each payment and application the writer wrote on it.
	item := apResult(t, b, runs[5])
	var gotLines []int
	for _, l := range arLinesOf(t, item, apRequireItemRow(t, item, data.busiestBill)) {
		v, _ := agedCell(t, l, "total")
		gotLines = append(gotLines, int(v))
	}
	sort.Ints(gotLines)
	if want := apBillLines(data, data.busiestBill); !reflect.DeepEqual(gotLines, want) {
		t.Errorf("run 6 opens the part-paid bill into line amounts %v, want %v (its total, less each payment and application)", gotLines, want)
	}

	// Run 7: the CSV holds every open item of the record under its vendor,
	// with its amount, and the record's Total.
	csvItems, csvTotal := apCSVItems(t, exportAPCSV(t, b, b.reader, runs[6].params))
	if want := apCSVRecord(t, b, data); !reflect.DeepEqual(csvItems, want) {
		var diffs []string
		for label, w := range want {
			if g, ok := csvItems[label]; !ok || g != w {
				diffs = append(diffs, fmt.Sprintf("%s: CSV %+v (shown %v), record %+v", label, g, ok, w))
			}
		}
		for label, g := range csvItems {
			if _, ok := want[label]; !ok {
				diffs = append(diffs, fmt.Sprintf("%s: CSV %+v, not in the record", label, g))
			}
		}
		sort.Strings(diffs)
		t.Errorf("run 7 (CSV): %d item lines differ from the writer's record (%d in the CSV, %d in the record):\n%s",
			len(diffs), len(csvItems), len(want), strings.Join(diffs[:min(len(diffs), 20)], "\n"))
	}
	if want := apSumOwed(data.openLast); csvTotal != want {
		t.Errorf("run 7 (CSV): the Total line = %d, want %d, the record's sum", csvTotal, want)
	}
}

// apVendorLine is one vendor row: its vendor id ("" for No vendor), its label
// and its Total.
type apVendorLine struct {
	vendor, name string
	total        int
}

// apVendorLinesOf are a run's vendor rows, in the run's order.
func apVendorLinesOf(t *testing.T, res *reports.Result) []apVendorLine {
	t.Helper()
	var out []apVendorLine
	for _, r := range apVendorRows(res) {
		vendor, _ := r.GroupKey[0].(string)
		v, _ := agedCell(t, r, "total")
		out = append(out, apVendorLine{vendor: vendor, name: r.Label, total: int(v)})
	}
	return out
}

// apVendorTotals is the record's sum of open items per vendor ("" for none).
func apVendorTotals(items map[string]apItem) map[string]int {
	out := map[string]int{}
	for _, it := range items {
		out[it.vendor] += it.owed
	}
	return out
}

func apSumOwed(items map[string]apItem) int {
	sum := 0
	for _, it := range items {
		sum += it.owed
	}
	return sum
}

// apVendorLabel is the label of vendor's row: its display name, or "No vendor".
func apVendorLabel(t *testing.T, b apBook, vendor string) string {
	t.Helper()
	if vendor == "" {
		return "No vendor"
	}
	r, err := b.app.FindRecordById("books_vendors", vendor)
	if err != nil {
		t.Fatalf("find vendor %s: %v", vendor, err)
	}
	return r.GetString("display_name")
}

// apBalanceOrder is the record's vendor rows in the Largest balance order of
// spec §4.4: No vendor last, then the Total largest first, then the name
// ignoring case.
func apBalanceOrder(t *testing.T, b apBook, items map[string]apItem) []apVendorLine {
	t.Helper()
	var out []apVendorLine
	for v, total := range apVendorTotals(items) {
		out = append(out, apVendorLine{vendor: v, name: apVendorLabel(t, b, v), total: total})
	}
	sort.Slice(out, func(i, j int) bool {
		a, c := out[i], out[j]
		if (a.vendor == "") != (c.vendor == "") {
			return c.vendor == ""
		}
		if a.total != c.total {
			return a.total > c.total
		}
		return strings.ToLower(a.name) < strings.ToLower(c.name)
	})
	return out
}

// apBillLines are the line amounts the record gives bill on the last day,
// smallest first: its total, less each payment line and application on it.
func apBillLines(data apDataset, bill string) []int {
	at := slices.IndexFunc(data.docs, func(w apWritten) bool { return w.id == bill })
	if at < 0 {
		return nil
	}
	out := []int{data.plan[at].cents}
	for _, d := range data.plan {
		if d.void || d.date > data.lastDay {
			continue
		}
		switch d.kind {
		case apKindPayment:
			for _, p := range d.parts {
				if p.doc == at {
					out = append(out, -p.cents)
				}
			}
		case apKindApplication:
			if d.bill == at {
				out = append(out, -d.cents)
			}
		}
	}
	sort.Ints(out)
	return out
}

// apCSVItem is one item line of the CSV: the label of the vendor line above
// it and its Total in cents.
type apCSVItem struct {
	vendor string
	owed   int
}

var (
	apCSVItemLabel = regexp.MustCompile(`^(Bill|Vendor credit|Journal entry) \S+$`)
	apCSVLineLabel = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} · `)
)

// apCSVItems reads the A/P Aging's CSV: each item line by its label, and the
// Total line's figure. A line that is no item, no opened line and not the
// Total is a vendor line.
func apCSVItems(t *testing.T, text string) (map[string]apCSVItem, int) {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\xef\xbb\xbf"))).ReadAll()
	if err != nil {
		t.Fatalf("read the CSV: %v", err)
	}
	if len(records) < 2 {
		t.Fatalf("the CSV has %d lines, want a heading and rows", len(records))
	}
	totalAt := slices.Index(records[0], "Total")
	if totalAt < 0 {
		t.Fatalf("the CSV heading %q has no Total", records[0])
	}
	items := map[string]apCSVItem{}
	vendor, total, sawTotal := "", 0, false
	for _, r := range records[1:] {
		switch label := r[0]; {
		case apCSVLineLabel.MatchString(label):
		case apCSVItemLabel.MatchString(label):
			if _, dup := items[label]; dup {
				t.Errorf("the CSV has two item lines %q", label)
			}
			items[label] = apCSVItem{vendor: vendor, owed: apCSVCents(t, r[totalAt])}
		case label == "Total":
			total, sawTotal = apCSVCents(t, r[totalAt]), true
		default:
			vendor = label
		}
	}
	if !sawTotal {
		t.Errorf("the CSV has no Total line")
	}
	return items, total
}

// apCSVCents reads a CSV money cell ("-1234.56") as cents.
func apCSVCents(t *testing.T, text string) int {
	t.Helper()
	whole, frac, ok := strings.Cut(text, ".")
	n, err := strconv.Atoi(whole + frac)
	if !ok || len(frac) != 2 || err != nil {
		t.Fatalf("CSV money cell %q is not <units>.<2 digits>", text)
	}
	return n
}

// apCSVRecord is the record's open items on the last day as the CSV labels
// them: "<type> <number>" → the vendor's label and the amount.
func apCSVRecord(t *testing.T, b apBook, data apDataset) map[string]apCSVItem {
	t.Helper()
	labels := map[string]string{}
	for i, w := range data.docs {
		switch data.plan[i].kind {
		case apKindBill:
			labels[w.id] = "Bill " + w.number
		case apKindCredit:
			labels[w.id] = "Vendor credit " + w.number
		case apKindJournal:
			for _, line := range w.lines {
				labels[line] = "Journal entry " + w.number
			}
		}
	}
	out := map[string]apCSVItem{}
	for id, it := range data.openLast {
		label, ok := labels[id]
		if !ok {
			t.Fatalf("the record's open item %s is no document or journal line the writer wrote", id)
		}
		out[label] = apCSVItem{vendor: apVendorLabel(t, b, it.vendor), owed: it.owed}
	}
	return out
}

// apCountsOf counts the dataset's rows as the §9 table counts them.
func apCountsOf(t *testing.T, b apBook, data apDataset) apCounts {
	t.Helper()
	count := func(sql string) int {
		t.Helper()
		var n int
		if err := b.app.DB().NewQuery(sql).Bind(dbx.Params{"day": data.lastDay}).Row(&n); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return n
	}
	const ap = "FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE a.type = 'accounts_payable'"
	return apCounts{
		lines:        count("SELECT COUNT(*) FROM books_journal_lines"),
		vendors:      count("SELECT COUNT(*) FROM books_vendors"),
		bills:        count("SELECT COUNT(*) FROM books_bills"),
		payments:     count("SELECT COUNT(*) FROM books_bill_payments"),
		paymentLines: count("SELECT COUNT(*) FROM books_bill_payment_lines"),
		credits:      count("SELECT COUNT(*) FROM books_vendor_credits"),
		applications: count("SELECT COUNT(*) FROM books_vendor_credit_applications"),
		refunds:      count("SELECT COUNT(*) FROM books_vendor_refunds"),
		manual:       count("SELECT COUNT(*) " + ap + " AND l.entry IN (SELECT id FROM books_journal_entries WHERE origin = 'manual')"),
		voidBills:    count("SELECT COUNT(*) FROM books_bills WHERE status = 'void'"),
		voidPayments: count("SELECT COUNT(*) FROM books_bill_payments WHERE status = 'void'"),
		openItems: count("SELECT COUNT(*) FROM (SELECT item FROM books_payable_items " +
			"WHERE date <= {:day} GROUP BY vendor, item HAVING SUM(credit - debit) != 0)"),
	}
}

// apRequireCounts fails a dataset whose rows are not the §9 table's:
// books_journal_lines exactly, every other count within 5 %.
func apRequireCounts(t *testing.T, size string, got apCounts) {
	t.Helper()
	want := apSpecTable[size]
	if got.lines != want.lines {
		t.Errorf("%s: books_journal_lines = %d, want exactly %d", size, got.lines, want.lines)
	}
	for _, c := range apCountRows {
		if g, w := c.get(got), c.get(want); !arWithin(g, w, 5) {
			t.Errorf("%s: %s = %d, want within 5%% of %d", size, c.name, g, w)
		}
	}
}

var apCountRows = []struct {
	name string
	get  func(apCounts) int
}{
	{"vendors", func(c apCounts) int { return c.vendors }},
	{"bills", func(c apCounts) int { return c.bills }},
	{"bill payments", func(c apCounts) int { return c.payments }},
	{"bill payment lines", func(c apCounts) int { return c.paymentLines }},
	{"vendor credits", func(c apCounts) int { return c.credits }},
	{"vendor credit applications", func(c apCounts) int { return c.applications }},
	{"vendor refunds", func(c apCounts) int { return c.refunds }},
	{"manual Accounts payable lines", func(c apCounts) int { return c.manual }},
	{"void bills", func(c apCounts) int { return c.voidBills }},
	{"void bill payments", func(c apCounts) int { return c.voidPayments }},
	{"open items on the last day", func(c apCounts) int { return c.openItems }},
}

// apBar is a run's time bar at L (spec §9): 5 s for the export, else 1 s.
func apBar(export bool) time.Duration {
	if export {
		return 5 * time.Second
	}
	return time.Second
}

func TestAPAgingScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the S and L runs of spec §9")
	}
	type planRec struct {
		run, reading string
		statements   []string
		steps        []planStep
	}
	medians := map[string]map[string]time.Duration{}
	counts := map[string]apCounts{}
	var plans []planRec
	var stat1 []arStat
	var runNames []string
	statementCount := map[string]int{}
	exportRun := map[string]bool{}

	for _, size := range []apSize{apS, apL} {
		t.Run(size.name, func(t *testing.T) {
			b := newAPBook(t)
			started := time.Now()
			data := writeAPDataset(t, b, size)
			t.Logf("%s: wrote the dataset in %s", size.name, time.Since(started))
			counts[size.name] = apCountsOf(t, b, data)
			apRequireCounts(t, size.name, counts[size.name])

			runs := apRuns(b, data)
			medians[size.name] = map[string]time.Duration{}
			for _, run := range runs {
				medians[size.name][run.name] = arMedian(func() { apExec(t, b, run) })
				t.Logf("%s run %s: median %s", size.name, run.name, medians[size.name][run.name])
			}
			if size.name != apL.name {
				return
			}

			runNames = nil
			for _, run := range runs {
				runNames = append(runNames, run.name)
				exportRun[run.name] = run.export
			}
			readings := []arReading{{name: "no statistics"}, {name: "after ANALYZE", analyze: true}}
			apCheckRuns(t, b, runs, readings, func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat) {
				statementCount[run.name] = len(statements)
				plans = append(plans, planRec{run: run.name, reading: reading.name, statements: statements, steps: steps})
				if reading.analyze {
					stat1 = stats
				}
			})
			for _, name := range runNames {
				l, s := medians[apL.name][name], medians[apS.name][name]
				if bar := apBar(exportRun[name]); l > bar {
					t.Errorf("run %s at L: median %s, want %s or less", name, l, bar)
				}
				if s > 0 && l > 15*s {
					t.Errorf("run %s: L median %s is %.1f times its S median %s, want 15 or less", name, l, float64(l)/float64(s), s)
				}
			}
		})
	}

	// The A/R Aging's seven runs at S and at L, after this report's L book is
	// closed: the engine extraction keeps them inside their bars (A/R spec
	// §9: at L 1 s, 5 s for the export, and each at most 15 times its S time).
	arMedians := map[string]map[string]time.Duration{}
	var arNames []string
	arExport := map[string]bool{}
	for _, size := range []arSize{arS, arL} {
		t.Run("A/R "+size.name, func(t *testing.T) {
			b := newARBook(t)
			arJournalPrefix(t, b)
			data := writeARDataset(t, b, size)
			arMedians[size.name] = map[string]time.Duration{}
			arNames = nil
			for _, run := range arRuns(b, data) {
				arNames = append(arNames, run.name)
				arExport[run.name] = run.export
				arMedians[size.name][run.name] = arMedian(func() { run.exec(t, b) })
				t.Logf("A/R %s run %s: median %s", size.name, run.name, arMedians[size.name][run.name])
			}
			if size.name != arL.name {
				return
			}
			for _, name := range arNames {
				l, s := arMedians[arL.name][name], arMedians[arS.name][name]
				if bar := apBar(arExport[name]); l > bar {
					t.Errorf("A/R Aging run %s at L: median %s, want %s or less", name, l, bar)
				}
				if s <= 0 {
					t.Errorf("A/R Aging run %s has no S median, want one to hold the L run to 15 times it", name)
				} else if l > 15*s {
					t.Errorf("A/R Aging run %s: L median %s is %.1f times its S median %s, want 15 or less", name, l, float64(l)/float64(s), s)
				}
			}
		})
	}

	if stat1 != nil {
		stats, err := json.MarshalIndent(stat1, "", "  ")
		if err != nil {
			t.Fatalf("encode sqlite_stat1: %v", err)
		}
		if err := os.WriteFile(filepath.Join("testdata", "ap_aging_stat1.json"), append(stats, '\n'), 0o644); err != nil {
			t.Fatalf("write testdata/ap_aging_stat1.json: %v", err)
		}
	}

	out := os.Getenv("BOOKS_SCALE_OUT")
	if out == "" {
		return
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatalf("make %s: %v", out, err)
	}
	commit := "unknown"
	if raw, err := exec.Command("git", "rev-parse", "HEAD").Output(); err == nil {
		commit = strings.TrimSpace(string(raw))
	}
	var res strings.Builder
	fmt.Fprintf(&res, "# A/P Aging performance results\n\n")
	fmt.Fprintf(&res, "- Machine: %s/%s, %d CPUs, %s\n- Date: %s\n- Commit: %s\n\n",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), time.Now().Format(time.DateTime), commit)
	fmt.Fprintf(&res, "## Row counts\n\n| | S | L |\n|---|---|---|\n")
	fmt.Fprintf(&res, "| books_journal_lines | %d | %d |\n", counts[apS.name].lines, counts[apL.name].lines)
	for _, c := range apCountRows {
		fmt.Fprintf(&res, "| %s | %d | %d |\n", c.name, c.get(counts[apS.name]), c.get(counts[apL.name]))
	}
	fmt.Fprintf(&res, "\n## Runs\n\n| Run | Statements | S median | L median | Ratio | Bar | Result |\n|---|---|---|---|---|---|---|\n")
	for _, name := range runNames {
		s, l := medians[apS.name][name], medians[apL.name][name]
		bar := apBar(exportRun[name])
		ratio := 0.0
		if s > 0 {
			ratio = float64(l) / float64(s)
		}
		result := "pass"
		if l > bar || ratio > 15 {
			result = "fail"
		}
		fmt.Fprintf(&res, "| %s | %d | %s | %s | %.1f | %s, ratio 15 | %s |\n", name, statementCount[name], s, l, ratio, bar, result)
	}
	fmt.Fprintf(&res, "\n## A/R Aging at S and L\n\n| Run | S median | L median | Ratio | Bar | Result |\n|---|---|---|---|---|---|\n")
	for _, name := range arNames {
		s, l := arMedians[arS.name][name], arMedians[arL.name][name]
		bar := apBar(arExport[name])
		ratio := 0.0
		if s > 0 {
			ratio = float64(l) / float64(s)
		}
		result := "pass"
		if l > bar || s <= 0 || ratio > 15 {
			result = "fail"
		}
		fmt.Fprintf(&res, "| %s | %s | %s | %.1f | %s, ratio 15 | %s |\n", name, s, l, ratio, bar, result)
	}
	fmt.Fprintf(&res, "\n## Statements (L)\n\n")
	var plansText strings.Builder
	fmt.Fprintf(&plansText, "# A/P Aging query plans (L)\n")
	for i := 0; i+1 < len(plans); i += 2 {
		before, after := plans[i], plans[i+1]
		for k, s := range before.statements {
			fmt.Fprintf(&res, "- run %s, statement %d: before ANALYZE: %s; after ANALYZE: %s\n",
				before.run, k+1, arReads(arStepsOf(before.steps, k)), arReads(arStepsOf(after.steps, k)))
			fmt.Fprintf(&plansText, "\n## Run %s, statement %d\n\n```sql\n%s\n```\n\n%s:\n\n```\n%s```\n\n%s:\n\n```\n%s```\n",
				before.run, k+1, s, before.reading, arPlanText(arStepsOf(before.steps, k)), after.reading, arPlanText(arStepsOf(after.steps, k)))
		}
	}
	for name, body := range map[string][]byte{
		"ap-perf-results.md": []byte(res.String()),
		"ap-perf-plans.md":   []byte(plansText.String()),
	} {
		if err := os.WriteFile(filepath.Join(out, name), body, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}
