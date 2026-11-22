package books

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
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

// The performance acceptance of the A/R Aging (spec §9): a bulk writer that
// writes a book as posting does, the seven runs of the report, and a check of
// each SQL statement's SQLite query plan against the plan bars. The plan check
// runs at a small size in every test run (TestARAgingQueryPlans); the S and L
// sizes start only with BOOKS_SCALE=1 (TestARAgingScale).

// arLastDay is the last day of every dataset and the reader's day of every
// run: the runs' default As of (Today) is the last day of the data.
const arLastDay = arToday

const (
	arKindInvoice    = "invoice"
	arKindPayment    = "payment"
	arKindCreditMemo = "credit_memo"
	arKindJournal    = "journal"
)

// arSize is one dataset size. The counts are chosen so that the generated book
// has the row counts of the spec §9 table (arSpecTable) within the test's
// tolerance; the open items on the last day are the open invoices, the
// payments with a credit, the credit memos and the manual Accounts receivable
// lines.
type arSize struct {
	name                           string
	lines, customers, subCustomers int
	// voidInvoices are voided with their reversal; closedInvoices are paid in
	// full; openInvoices stay open (partPayments of them part paid).
	voidInvoices, closedInvoices, openInvoices int
	partPayments                               int
	// pairPayments each pay two closed invoices of one customer; the other
	// closed invoices take one payment each, creditPayments of which pay more
	// than the invoice (an unapplied part).
	pairPayments, creditPayments int
	// voidPayments are voided with their reversal; voidPaymentApps of them had
	// applied to an invoice that a later payment closes.
	voidPayments, voidPaymentApps int
	// memos are posted credit memos; manual are manual Accounts receivable
	// lines, one in ten with no customer.
	memos, manual int
	// plan, when set, is written as it is in place of a generated book.
	plan []arDoc
}

var (
	// arSmall is the plan check's book (about 500 lines) with every row kind
	// of the §9 table.
	arSmall = arSize{
		name: "small", lines: 500, customers: 30, subCustomers: 3,
		voidInvoices: 2, closedInvoices: 80, openInvoices: 15, partPayments: 3,
		pairPayments: 8, creditPayments: 3, voidPayments: 3, voidPaymentApps: 2,
		memos: 4, manual: 10,
	}
	arS = arSize{
		name: "S", lines: 50000, customers: 200, subCustomers: 20,
		voidInvoices: 100, closedInvoices: 9160, openInvoices: 550, partPayments: 8,
		pairPayments: 1268, creditPayments: 8, voidPayments: 100, voidPaymentApps: 6,
		memos: 198, manual: 99,
	}
	arL = arSize{
		name: "L", lines: 500000, customers: 2000, subCustomers: 200,
		voidInvoices: 1000, closedInvoices: 91600, openInvoices: 5500, partPayments: 80,
		pairPayments: 12680, creditPayments: 80, voidPayments: 1000, voidPaymentApps: 60,
		memos: 1980, manual: 990,
	}
)

// arCounts are the row counts of the spec §9 table.
type arCounts struct {
	lines, arLines, customers, invoices, payments, applications int
	memos, manual, voidInvoices, voidPayments, openItems        int
}

// arSpecTable is the spec §9 Dataset table.
var arSpecTable = map[string]arCounts{
	"S": {lines: 50000, arLines: 18500, customers: 200, invoices: 10000, payments: 8000, applications: 9000,
		memos: 200, manual: 100, voidInvoices: 100, voidPayments: 100, openItems: 800},
	"L": {lines: 500000, arLines: 185000, customers: 2000, invoices: 100000, payments: 80000, applications: 90000,
		memos: 2000, manual: 1000, voidInvoices: 1000, voidPayments: 1000, openItems: 8000},
}

// arDoc is one posted document of a dataset plan.
type arDoc struct {
	kind     string
	customer string
	date     string
	due      string // an invoice's due day
	// cents is an invoice's or credit memo's total, a payment's amount.
	cents  int
	apps   []arApp    // a payment's applications
	lines  []arJELine // a journal entry's lines, in position order
	memo   string     // a journal entry's memo
	void   bool       // voided, with its reversal entry
	actor  string     // who saved and posted it ("" for postJournal's entries)
	voider string     // who voided it
}

// arApp applies cents of a payment to the invoice at plan index invoice.
type arApp struct{ invoice, cents int }

// arWritten are the ids the writer gave one document of the plan.
type arWritten struct {
	kind, id, entry string
	lines, apps     []string
	reversal        string
	reversalLines   []string
}

// arDataset is a written book: its days, its customers and families, and what
// the runs of spec §9 pick from it.
type arDataset struct {
	size                      arSize
	firstDay, midDay, lastDay string
	customers                 []string
	families                  [][]string // the parent first
	// family is the family run 4 picks: the one with the most open items.
	family []string
	// busiest is the customer with the most open items (run 5), busiestTop its
	// family key, busiestInvoice its oldest open invoice that has a payment (run 6).
	busiest, busiestTop, busiestInvoice string
	// customerKey and itemKey are the group keys of the busiest customer's row
	// and of busiestInvoice's row, as a run gives them.
	customerKey, itemKey []any
	docs                 []arWritten
}

// arDayCount is the number of days of the five years that end on arLastDay.
func arDayCount() int {
	last, _ := time.Parse(time.DateOnly, arLastDay)
	first := last.AddDate(-5, 0, 1)
	return int(last.Sub(first).Hours()/24) + 1
}

// arDay is day i of the five years (0 the first; past the last day for a due day).
func arDay(i int) string {
	last, _ := time.Parse(time.DateOnly, arLastDay)
	return last.AddDate(0, 0, i-(arDayCount()-1)).Format(time.DateOnly)
}

// arClip bounds a text value: a raw write skips PocketBase's field validation.
func arClip(s string) string {
	const most = 200
	if len(s) > most {
		return s[:most]
	}
	return s
}

// writeARDataset writes size's book to b in one transaction, straight to the
// tables, with the columns posting writes: customers through the app (their
// guards set the sort keys), every posted row by batched inserts.
func writeARDataset(t testing.TB, b arBook, size arSize) arDataset {
	t.Helper()
	data, err := writeARDatasetKeys(t, b, size)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// writeARDatasetKeys is writeARDataset for a caller that records a refused key
// lookup (a run that passes core's time limit) instead of ending: the dataset
// is written either way, and the error says why the keys are missing.
func writeARDatasetKeys(t testing.TB, b arBook, size arSize) (arDataset, error) {
	t.Helper()
	data := arDataset{size: size, firstDay: arDay(0), midDay: arDay(arDayCount() / 2), lastDay: arLastDay}
	err := b.app.RunInTransaction(func(tx core.App) error {
		plan, busiestInvoice := size.plan, -1
		if plan == nil {
			data.customers, data.families = arWriteCustomers(t, tx, size)
			plan, busiestInvoice = arGeneratePlan(t, b, size, &data)
		}
		w := newARWriter(t, tx, arTableColumns, arKindInvoice, arKindPayment, arKindCreditMemo, arKindJournal)
		data.docs = w.write(plan, b)
		if busiestInvoice >= 0 {
			data.busiestInvoice = data.docs[busiestInvoice].id
		}
		w.finish()
		return receivableItems.rebuild(tx)
	})
	if err != nil {
		t.Fatalf("write the %s dataset: %v", size.name, err)
	}
	if data.busiest != "" {
		return data, arOpenKeysErr(t, b, &data)
	}
	return data, nil
}

// arReport runs arAgingSpec() as b's reader on the day data's last day, as
// core's run endpoint does.
func arReport(t testing.TB, b arBook, params map[string]any, opts reports.Options) *reports.Result {
	t.Helper()
	res, err := arReportErr(t, b, params, opts)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return res
}

// arReportErr is arReport that returns core's refusal of the run.
func arReportErr(t testing.TB, b arBook, params map[string]any, opts reports.Options) (*reports.Result, error) {
	t.Helper()
	spec, info, err := reports.Load(mustJSON(arAgingSpec()))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	given := map[string]json.RawMessage{}
	for id, v := range params {
		given[id] = mustJSON(v)
	}
	res, err := reports.Run(context.Background(), b.app, reports.Request{
		Spec: spec, Loaded: info, Params: given, Options: opts, Auth: b.reader,
		Headers: readerInfo(b.reader).Headers,
	})
	return res, err
}

// arOpenKeys reads the group keys runs 5 and 6 open, as the view does: the
// busiest customer's key from the default run, its oldest part-paid invoice's
// key from the run with that customer opened.
func arOpenKeys(t testing.TB, b arBook, data *arDataset) {
	t.Helper()
	if err := arOpenKeysErr(t, b, data); err != nil {
		t.Fatal(err)
	}
}

// arOpenKeysErr is arOpenKeys that returns what stopped it. A key it found
// before the error stays in data.
func arOpenKeysErr(t testing.TB, b arBook, data *arDataset) error {
	t.Helper()
	day := reports.Options{Today: data.lastDay}
	res, err := arReportErr(t, b, nil, day)
	if err != nil {
		return fmt.Errorf("Run: %w", err)
	}
	row, ok := cbGroupRow(res, 2, data.busiest)
	if !ok {
		return fmt.Errorf("%s: the default run has no row for the busiest customer %s", data.size.name, data.busiest)
	}
	data.customerKey = row.GroupKey
	opened, err := arReportErr(t, b, nil, reports.Options{Today: data.lastDay, Expand: [][]any{row.GroupKey}, Collapse: [][]any{}})
	if err != nil {
		return fmt.Errorf("Run: %w", err)
	}
	item, ok := arItemRow(opened, data.busiestInvoice)
	if !ok {
		return fmt.Errorf("%s: the busiest customer opened has no item row for %s", data.size.name, data.busiestInvoice)
	}
	data.itemKey = item.GroupKey
	return nil
}

// arWriteCustomers saves the customers: "Customer 00000" (plain, the busiest),
// then families of a parent and 1 to 5 sub-customers until subCustomers are
// placed, then plain customers.
func arWriteCustomers(t testing.TB, tx core.App, size arSize) ([]string, [][]string) {
	t.Helper()
	parentOf := make([]int, size.customers)
	for i := range parentOf {
		parentOf[i] = -1
	}
	var families [][]int
	next, left, subs := 1, size.subCustomers, 1
	for left > 0 {
		k := min(subs, left)
		if next+k >= size.customers {
			t.Fatalf("%s: %d customers cannot hold %d sub-customers", size.name, size.customers, size.subCustomers)
		}
		family := []int{next}
		for j := 1; j <= k; j++ {
			parentOf[next+j] = next
			family = append(family, next+j)
		}
		families = append(families, family)
		next, left, subs = next+k+1, left-k, subs%5+1
	}
	ids := make([]string, size.customers)
	for i := range ids {
		parent := ""
		if parentOf[i] >= 0 {
			parent = ids[parentOf[i]]
		}
		ids[i] = mkCustomer(t, tx, arClip(fmt.Sprintf("Customer %05d", i)), parent).Id
	}
	out := make([][]string, len(families))
	for i, family := range families {
		for _, c := range family {
			out[i] = append(out[i], ids[c])
		}
	}
	return ids, out
}

// arGeneratePlan builds size's documents from a fixed seed. It returns the
// plan and the plan index of the busiest customer's oldest part-paid invoice.
func arGeneratePlan(t testing.TB, b arBook, size arSize, data *arDataset) ([]arDoc, int) {
	t.Helper()
	rng := rand.New(rand.NewPCG(20261118, uint64(size.lines)))
	actor, voider := b.docs.users.bookkeeper.Id, b.docs.users.admin.Id
	custs := data.customers
	n := arDayCount()
	anyCustomer := func() string { return custs[rng.IntN(len(custs))] }
	cents := func() int { return 5000 + rng.IntN(495000) }
	later := func(day, most int) int { return min(day+rng.IntN(most+1), n-1) }

	var plan []arDoc
	var days []int
	add := func(d arDoc, day int) int {
		d.date, d.actor = arDay(day), actor
		if d.void {
			d.voider = voider
		}
		plan = append(plan, d)
		days = append(days, day)
		return len(plan) - 1
	}
	invoice := func(customer string, day int, void bool) int {
		return add(arDoc{kind: arKindInvoice, customer: customer, due: arDay(day + 30), cents: cents(), void: void}, day)
	}
	payment := func(customer string, day, amount int, void bool, apps ...arApp) int {
		return add(arDoc{kind: arKindPayment, customer: customer, cents: amount, apps: apps, void: void}, day)
	}

	busiestOpen := min(size.openInvoices, max(size.openInvoices/20, 5))
	open := make([]int, size.openInvoices)
	for k := range open {
		c := anyCustomer()
		if k < busiestOpen {
			c = custs[0]
		}
		open[k] = invoice(c, rng.IntN(n), false)
	}
	closed := make([]int, size.closedInvoices)
	for k := range closed {
		closed[k] = invoice(anyCustomer(), rng.IntN(n), false)
	}
	for range size.voidInvoices {
		invoice(anyCustomer(), rng.IntN(n), true)
	}

	partPaid := map[int]bool{}
	for _, inv := range open[:size.partPayments] {
		half := plan[inv].cents / 2
		payment(plan[inv].customer, later(days[inv], 30), half, false, arApp{invoice: inv, cents: half})
		partPaid[inv] = true
	}

	byCustomer := map[string][]int{}
	for _, inv := range closed {
		byCustomer[plan[inv].customer] = append(byCustomer[plan[inv].customer], inv)
	}
	pairsLeft := size.pairPayments
	var singles []int
	for _, c := range custs {
		list := byCustomer[c]
		for len(list) >= 2 && pairsLeft > 0 {
			x, y := list[0], list[1]
			list = list[2:]
			pairsLeft--
			payment(c, later(max(days[x], days[y]), 45), plan[x].cents+plan[y].cents, false,
				arApp{invoice: x, cents: plan[x].cents}, arApp{invoice: y, cents: plan[y].cents})
		}
		singles = append(singles, list...)
	}
	if pairsLeft > 0 || len(singles) < max(size.creditPayments, size.voidPaymentApps) {
		t.Fatalf("%s: the closed invoices cannot make %d two-invoice payments", size.name, size.pairPayments)
	}
	for k, inv := range singles {
		amount := plan[inv].cents
		if k < size.creditPayments {
			amount += 1000 + rng.IntN(49000)
		}
		payment(plan[inv].customer, later(days[inv], 45), amount, false, arApp{invoice: inv, cents: plan[inv].cents})
	}
	for k := range size.voidPayments {
		if k < size.voidPaymentApps {
			inv := singles[k]
			part := max(plan[inv].cents/3, 1)
			payment(plan[inv].customer, days[inv], part, true, arApp{invoice: inv, cents: part})
			continue
		}
		payment(anyCustomer(), rng.IntN(n), cents(), true)
	}

	for range size.memos {
		add(arDoc{kind: arKindCreditMemo, customer: anyCustomer(), cents: cents()}, rng.IntN(n))
	}
	for k := range size.manual {
		c := anyCustomer()
		if k%10 == 9 {
			c = ""
		}
		amount := cents()
		ar := arJELine{account: b.receivable.Id, debit: amount, customer: c}
		other := arJELine{account: b.income.Id, credit: amount}
		if rng.IntN(5) == 0 {
			ar.debit, ar.credit, other.debit, other.credit = 0, amount, amount, 0
		}
		add(arDoc{kind: arKindJournal, memo: arClip("A/R adjustment"), lines: []arJELine{ar, other}}, rng.IntN(n))
	}

	entries := 0
	for _, d := range plan {
		entries++
		if d.void {
			entries++
		}
	}
	rest := size.lines - 2*entries
	if rest < 0 || rest%2 != 0 {
		t.Fatalf("%s: %d documents leave %d journal lines for the other entries, want an even number of 0 or more", size.name, entries, rest)
	}
	for range rest / 2 {
		amount := cents()
		add(arDoc{kind: arKindJournal, memo: arClip("Rent"), lines: []arJELine{
			{account: b.docs.rent.Id, debit: amount},
			{account: b.docs.checking.Id, credit: amount},
		}}, rng.IntN(n))
	}

	counts := arOpenItems(plan, b.receivable.Id)
	for _, c := range custs {
		if counts[c] > counts[data.busiest] {
			data.busiest = c
		}
	}
	data.busiestTop = data.busiest
	most := 0
	for _, family := range data.families {
		items := 0
		for _, c := range family {
			items += counts[c]
			if c == data.busiest {
				data.busiestTop = family[0]
			}
		}
		if items > most {
			most, data.family = items, family
		}
	}
	if data.family == nil {
		t.Fatalf("%s: no family has an open item", size.name)
	}
	oldest := -1
	for inv := range partPaid {
		if plan[inv].customer == data.busiest && (oldest < 0 || days[inv] < days[oldest] || (days[inv] == days[oldest] && inv < oldest)) {
			oldest = inv
		}
	}
	if oldest < 0 {
		t.Fatalf("%s: the busiest customer has no part-paid invoice", size.name)
	}
	return plan, oldest
}

// arOpenItems counts each customer's open items on the last day of a plan: an
// invoice with a balance, a payment with an unapplied part, a credit memo, a
// manual Accounts receivable line.
func arOpenItems(plan []arDoc, receivable string) map[string]int {
	applied := map[int]int{}
	for _, d := range plan {
		if d.kind == arKindPayment && !d.void {
			for _, a := range d.apps {
				applied[a.invoice] += a.cents
			}
		}
	}
	out := map[string]int{}
	for i, d := range plan {
		if d.void {
			continue
		}
		switch d.kind {
		case arKindInvoice:
			if d.cents != applied[i] {
				out[d.customer]++
			}
		case arKindPayment:
			sum := 0
			for _, a := range d.apps {
				sum += a.cents
			}
			if d.cents != sum {
				out[d.customer]++
			}
		case arKindCreditMemo:
			out[d.customer]++
		case arKindJournal:
			for _, l := range d.lines {
				if l.account == receivable && l.customer != "" {
					out[l.customer]++
				}
			}
		}
	}
	return out
}

const (
	arInvoices = "books_invoices"
	arPayments = "books_payments"
	arApps     = "books_payment_applications"
	arMemos    = "books_credit_memos"
)

// arTableColumns are the columns of each table posting writes (all of them).
var arTableColumns = map[string][]string{
	arEntries: {"auto_reverse_on", "close_override", "created", "created_by", "currency", "date", "doc_type", "document",
		"id", "memo", "number", "origin", "posted_at", "posted_by", "replaces", "reverses", "revision", "sequence",
		"status", "total", "updated", "voided_at", "voided_by"},
	arLines: {"account", "created", "credit", "currency", "customer", "date", "debit", "entry", "id", "memo", "position",
		"posted", "updated", "vendor"},
	arInvoices: {"balance", "bill_to", "created", "currency", "customer", "date", "due_date", "email", "entry", "estimate",
		"fields", "form", "id", "memo", "message", "number", "posted_at", "posted_by", "public_token", "replaced_by", "replaces",
		"revision", "sequence", "sort_key", "status", "subtotal", "tax_rate", "tax_total", "terms", "total", "updated",
		"voided_at", "voided_by"},
	arPayments: {"amount", "applied", "created", "credited", "currency", "customer", "date", "deposit_to", "entry", "id",
		"memo", "number", "payment_method", "posted_at", "posted_by", "reference_no", "replaced_by", "replaces", "sequence",
		"sort_key", "status", "updated", "voided_at", "voided_by"},
	arApps: {"amount", "created", "id", "invoice", "payment", "position", "updated"},
	arMemos: {"balance", "bill_to", "created", "currency", "customer", "date", "email", "entry", "fields", "form", "id",
		"invoice", "memo", "message", "number", "posted_at", "posted_by", "replaced_by", "replaces", "revision", "sequence",
		"sort_key", "status", "subtotal", "tax_rate", "tax_total", "total", "updated", "voided_at", "voided_by"},
}

func (w *arWriter) write(plan []arDoc, b arBook) []arWritten {
	w.t.Helper()
	out := make([]arWritten, len(plan))
	for i, d := range plan {
		out[i] = arWritten{kind: d.kind, entry: w.id("e")}
		switch d.kind {
		case arKindInvoice:
			out[i].id = w.id("i")
		case arKindPayment:
			out[i].id = w.id("p")
		case arKindCreditMemo:
			out[i].id = w.id("m")
		default:
			out[i].id = out[i].entry
		}
	}
	applied := map[int]int{}
	for _, d := range plan {
		if d.kind == arKindPayment && !d.void {
			for _, a := range d.apps {
				applied[a.invoice] += a.cents
			}
		}
	}
	for i, d := range plan {
		w.doc(d, &out[i], out, applied[i], b)
	}
	return out
}

// doc writes one document as posting leaves it: the document row, its entry
// and lines, a payment's applications, and for a void the voided marks and
// the reversal entry with its lines.
func (w *arWriter) doc(d arDoc, wr *arWritten, all []arWritten, applied int, b arBook) {
	w.t.Helper()
	seq := w.next[d.kind]
	w.next[d.kind]++
	number := formatNumber(w.prefix[d.kind], seq)
	stamp := d.date + " 12:00:00.000Z"
	status, voidedAt, voidedBy := statusPosted, "", ""
	if d.void {
		status, voidedAt, voidedBy = statusVoid, stamp, d.voider
	}
	sortKey := fmt.Sprintf("%s %010d%s%s", d.date, seq, sortIDSep, wr.id)
	common := func(values map[string]any) map[string]any {
		values["id"], values["created"], values["updated"] = wr.id, stamp, stamp
		values["currency"], values["customer"], values["date"], values["entry"] = "USD", d.customer, d.date, wr.entry
		values["memo"], values["number"], values["sequence"], values["sort_key"] = "", number, seq, sortKey
		values["posted_at"], values["posted_by"], values["status"] = stamp, d.actor, status
		values["replaced_by"], values["replaces"], values["voided_at"], values["voided_by"] = "", "", voidedAt, voidedBy
		return values
	}
	total, revision, origin, document, memo := d.cents, 1, "document", wr.id, ""
	var lines []arJELine
	switch d.kind {
	case arKindInvoice:
		balance := d.cents - applied
		if d.void {
			balance = 0
		}
		lines = []arJELine{
			{account: b.receivable.Id, debit: d.cents, customer: d.customer},
			{account: b.income.Id, credit: d.cents, customer: d.customer},
		}
		// Each invoice has its own customer-link token, as the create guard
		// gives it (stampInvoiceToken); the unique index refuses a shared one.
		token, err := newPublicToken()
		if err != nil {
			w.t.Fatal(err)
		}
		w.row(arInvoices, common(map[string]any{
			"balance": balance, "bill_to": nil, "due_date": d.due, "email": "", "estimate": "", "fields": nil,
			"form": "", "message": "", "public_token": token, "revision": 3, "subtotal": d.cents, "tax_rate": "",
			"tax_total": 0, "terms": "", "total": d.cents,
		}))
	case arKindPayment:
		sum := 0
		for pos, a := range d.apps {
			sum += a.cents
			id := w.id("a")
			wr.apps = append(wr.apps, id)
			w.row(arApps, map[string]any{
				"id": id, "amount": a.cents, "created": stamp, "updated": stamp,
				"invoice": all[a.invoice].id, "payment": wr.id, "position": pos,
			})
		}
		lines = []arJELine{
			{account: b.docs.undeposited.Id, debit: d.cents, customer: d.customer},
			{account: b.receivable.Id, credit: d.cents, customer: d.customer},
		}
		w.row(arPayments, common(map[string]any{
			"amount": d.cents, "applied": sum, "credited": d.cents - sum, "deposit_to": b.docs.undeposited.Id,
			"payment_method": "", "reference_no": "",
		}))
	case arKindCreditMemo:
		lines = []arJELine{
			{account: b.receivable.Id, credit: d.cents, customer: d.customer},
			{account: b.income.Id, debit: d.cents, customer: d.customer},
		}
		w.row(arMemos, common(map[string]any{
			"balance": d.cents, "bill_to": nil, "email": "", "fields": nil, "form": "", "invoice": "", "message": "",
			"revision": 3, "subtotal": d.cents, "tax_rate": "", "tax_total": 0, "total": d.cents,
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

// arRun is a named run of spec §9. wholeBook permits one outermost SCAN of a
// large table (runs 1, 2, 3 and 7); bound forbids every SCAN of a large table
// (run 4); adds marks a run whose statements that run 1 does not record are
// bound (runs 5 and 6). reading names the plan reading a check reports.
type arRun struct {
	name                   string
	params                 map[string]any
	opts                   reports.Options
	export                 bool
	wholeBook, bound, adds bool
	reading                string
}

// arRuns are the seven runs of spec §9 on data.
func arRuns(b arBook, data arDataset) []arRun {
	customer, item := data.customerKey, data.itemKey
	day := reports.Options{Today: data.lastDay}
	return []arRun{
		{name: "1 default", opts: day, wholeBook: true},
		{name: "2 past day", params: map[string]any{"asOf": data.midDay}, opts: day, wholeBook: true},
		{name: "3 largest balance", params: map[string]any{"order": "balance"}, opts: day, wholeBook: true},
		{name: "4 one family", params: map[string]any{"customers": data.family}, opts: day, bound: true},
		{name: "5 customer opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{customer}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		{name: "6 item opened", opts: reports.Options{Today: data.lastDay, Expand: [][]any{customer, item}, Collapse: [][]any{}},
			wholeBook: true, adds: true},
		{name: "7 CSV export", export: true, wholeBook: true},
	}
}

func (r arRun) result(t *testing.T, b arBook) *reports.Result {
	t.Helper()
	return runAR(t, b.app, b.reader, r.params, r.opts)
}

// exec runs r as the Books reader (run 7: the CSV export, D11).
func (r arRun) exec(t *testing.T, b arBook) {
	t.Helper()
	if r.export {
		exportARCSV(t, b, b.reader, r.params)
		return
	}
	r.result(t, b)
}

// recordARRun runs r and returns each distinct SELECT it ran, in order. An
// export is run once first: its first call ships the report on the app.
func recordARRun(t *testing.T, b arBook, r arRun) []string {
	t.Helper()
	if r.export {
		r.exec(t, b)
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
	}, func() { r.exec(t, b) })
	return out
}

// arLargeTables are the A/R Aging's large tables (spec §9).
var arLargeTables = []string{"books_journal_lines", "books_journal_entries", "books_invoices", "books_payments", "books_payment_applications", "books_receivable_items"}

// arCheckRuns records each run's statements and checks every plan under
// each reading. The statements that run 5 and 6 record and run 1 does not are
// bound. It fails a run that records no SELECT reading books_receivable_items.
func arCheckRuns(t *testing.T, b arBook, runs []arRun, readings []arReading, record func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat)) {
	t.Helper()
	base := map[string]bool{}
	for _, run := range runs {
		statements := recordARRun(t, b, run)
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
				if slices.ContainsFunc(own, func(p planStep) bool { return slices.Contains(p.Tables, receivableItemsCollection) }) {
					readsItems = true
				}
				r := run
				r.reading = reading.name
				r.bound = run.bound || (run.adds && !base[s])
				checkPlanBars(t, r, s, own, arLargeTables)
			}
			if !readsItems {
				t.Errorf("run %s, %s: none of its %d SELECTs reads books_receivable_items: the statement recorder is wired wrong",
					run.name, reading.name, len(statements))
			}
			if record != nil {
				record(run, reading, statements, steps, stats)
			}
		}
	}
}

func TestARAgingBulkWriterMatchesPosters(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	c := mkCustomer(t, b.app, "Mirror Co", "")
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	pay := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})
	memo := arCreditMemo(t, b, c, "2026-10-20", 63500)
	je := postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 31000, position: 0, customer: c.Id},
		jnLine{account: b.income, credit: 31000, position: 1})

	actor := b.docs.users.bookkeeper.Id
	data := writeARDataset(t, b, arSize{name: "mirror", plan: []arDoc{
		{kind: arKindInvoice, customer: c.Id, date: "2026-08-04", due: "2026-09-03", cents: 100000, actor: actor},
		{kind: arKindPayment, customer: c.Id, date: "2026-09-10", cents: 70000, apps: []arApp{{invoice: 0, cents: 55000}}, actor: actor},
		{kind: arKindCreditMemo, customer: c.Id, date: "2026-10-20", cents: 63500, actor: actor},
		{kind: arKindJournal, date: "2026-09-01", memo: "A/R adjustment", lines: []arJELine{
			{account: b.receivable.Id, debit: 31000, customer: c.Id},
			{account: b.income.Id, credit: 31000},
		}},
	}})

	// Each table's bulk row and the posted row it stands for.
	type pair struct{ table, bulk, posted string }
	var pairs []pair
	idMap := map[string]string{}
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
		table string
		doc   *core.Record
		entry string
	}{
		{arInvoices, inv, inv.GetString("entry")},
		{arPayments, pay, pay.GetString("entry")},
		{arMemos, memo, memo.GetString("entry")},
		{"", nil, je.Id},
	}
	for i, p := range posted {
		w := data.docs[i]
		if p.doc != nil {
			match(p.table, []string{w.id}, []string{p.doc.Id})
		}
		match(arEntries, []string{w.entry}, []string{p.entry})
		match(arLines, w.lines, arIDsWhere(t, b.app, arLines, "entry", p.entry))
	}
	match(arApps, data.docs[1].apps, arIDsWhere(t, b.app, arApps, "payment", pay.Id))

	// public_token is random on each invoice, so no two rows share it.
	ignored := map[string]bool{
		"id": true, "number": true, "sequence": true, "created": true, "updated": true, "posted_at": true,
		"public_token": true,
	}
	for _, p := range pairs {
		bulkRow, postedRow := arRawRow(t, b.app, p.table, p.bulk), arRawRow(t, b.app, p.table, p.posted)
		cols := make([]string, 0, len(postedRow))
		for col := range postedRow {
			cols = append(cols, col)
		}
		sort.Strings(cols)
		for _, col := range cols {
			if ignored[col] {
				continue
			}
			got := arNormal(bulkRow, col, idMap)
			want := arNormal(postedRow, col, nil)
			if got != want {
				t.Fatalf("%s.%s differs: the bulk writer wrote %s, posting wrote %s", p.table, col, got, want)
			}
		}
	}

	// The stored rows of each source: the bulk writer's rebuild against the
	// posters' hooks.
	for _, source := range []string{receivableSourceLine, receivableSourceApplication} {
		postedEntries := map[string]bool{inv.GetString("entry"): true, pay.GetString("entry"): true, memo.GetString("entry"): true, je.Id: true}
		var want, got []arRow
		for _, r := range arRows(t, b.app, source) {
			switch {
			case postedEntries[r.entry]:
				r.number, r.seq = "", 0
				want = append(want, r)
			case idMap[r.entry] != "":
				r.id, r.entry, r.item = arMapped(r.id, idMap), idMap[r.entry], arMapped(r.item, idMap)
				r.number, r.seq = "", 0
				got = append(got, r)
			}
		}
		byID := func(rows []arRow) { sort.Slice(rows, func(i, j int) bool { return rows[i].id < rows[j].id }) }
		byID(want)
		byID(got)
		if len(want) == 0 || !reflect.DeepEqual(got, want) {
			t.Errorf("%s: the bulk rows (ids mapped to the posted ones) =\n%+v\nwant the posted rows\n%+v", source, got, want)
		}
	}
}

func arMapped(id string, idMap map[string]string) string {
	if m, ok := idMap[id]; ok {
		return m
	}
	return id
}

// arIDsWhere are the ids of table's rows whose field is value, by position.
func arIDsWhere(t *testing.T, app core.App, table, field, value string) []string {
	t.Helper()
	var ids []string
	if err := app.DB().Select("id").From(table).Where(dbx.HashExp{field: value}).OrderBy("position").Column(&ids); err != nil {
		t.Fatalf("read %s of %s %s: %v", table, field, value, err)
	}
	return ids
}

func arRawRow(t *testing.T, app core.App, table, id string) dbx.NullStringMap {
	t.Helper()
	row := dbx.NullStringMap{}
	if err := app.DB().Select("*").From(table).Where(dbx.HashExp{"id": id}).One(row); err != nil {
		t.Fatalf("read %s %s: %v", table, id, err)
	}
	return row
}

// arNormal is a column's value to compare: a bulk id mapped to the posted
// id, and a sort key with its row's own id and sequence taken out.
func arNormal(row dbx.NullStringMap, col string, idMap map[string]string) string {
	v := row[col]
	if !v.Valid {
		return "NULL"
	}
	s := arMapped(v.String, idMap)
	if col == "sort_key" {
		s = strings.Replace(s, row["id"].String, "<id>", 1)
		if seq, err := strconv.Atoi(row["sequence"].String); err == nil {
			s = strings.Replace(s, fmt.Sprintf(" %010d", seq), " <sequence>", 1)
		}
	}
	return strconv.Quote(s)
}

func TestARAgingQueryPlans(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	data := writeARDataset(t, b, arSmall)

	t.Run("the statistics reach the planner", func(t *testing.T) {
		probe := "SELECT l.id, c.display_name FROM books_journal_lines l JOIN books_customers c ON c.id = l.customer WHERE l.customer != ''"
		idx := func(s string) *string { return &s }
		stats := func(lines, customers string) []arStat {
			return []arStat{
				{Tbl: "books_journal_lines", Idx: idx("idx_books_jlines_customer"), Stat: lines},
				{Tbl: "books_journal_lines", Idx: idx("sqlite_autoindex_books_journal_lines_1"), Stat: lines},
				{Tbl: "books_customers", Idx: idx("sqlite_autoindex_books_customers_1"), Stat: customers},
			}
		}
		outer := func(reading arReading) string {
			steps, _ := explainReading(t, b.app, reading, []string{probe})
			for _, s := range steps {
				if verb, _ := stepVerb(s.Detail); s.Parent == 0 && (verb == "SCAN" || verb == "SEARCH") {
					return strings.Join(s.Tables, ",")
				}
			}
			t.Fatalf("%s: the probe's plan has no loop", reading.name)
			return ""
		}
		linesHuge := outer(arReading{name: "books_journal_lines huge", stats: stats("1000000 5", "10 1")})
		customersHuge := outer(arReading{name: "books_customers huge", stats: stats("10 1", "1000000 1")})
		if linesHuge == customersHuge {
			t.Errorf("the probe's outer loop reads %s under both hand-written statistics: the loaded sqlite_stat1 rows do not reach the planner", linesHuge)
		}
	})

	t.Run("each bar fails a plan that breaks it", func(t *testing.T) {
		lines, entries := []string{"books_journal_lines"}, []string{"books_journal_entries"}
		invoices, payments := []string{"books_invoices"}, []string{"books_payments"}
		apps, customers := []string{"books_payment_applications"}, []string{"books_customers"}
		whole := arRun{name: "1 default", wholeBook: true, reading: "hand-written"}
		family := arRun{name: "4 one family", bound: true, reading: "hand-written"}
		opened := arRun{name: "5 customer opened", wholeBook: true, bound: true, reading: "hand-written"}
		cases := []struct {
			bar   string
			run   arRun
			steps []planStep
		}{
			{"SCAN books_journal_lines", whole, []planStep{{ID: 2, Detail: "SCAN l", Tables: lines}}},
			{"a full index scan of books_journal_entries", whole, []planStep{
				{ID: 2, Detail: "SCAN e USING COVERING INDEX idx_books_je_date", Tables: entries}}},
			{"a SCAN of a large table on the inner side of a join", whole, []planStep{
				{ID: 2, Detail: "SCAN c", Tables: customers},
				{ID: 3, Detail: "SCAN i", Tables: invoices}}},
			{"a SCAN of a large table in a correlated subquery", whole, []planStep{
				{ID: 2, Detail: "SCAN c", Tables: customers},
				{ID: 5, Detail: "CORRELATED SCALAR SUBQUERY 1"},
				{ID: 7, Parent: 5, Detail: "SCAN p", Tables: payments}}},
			{"two outermost SCANs of large tables", whole, []planStep{
				{ID: 2, Detail: "SCAN i", Tables: invoices},
				{ID: 9, Detail: "SCALAR SUBQUERY 1"},
				{ID: 11, Parent: 9, Detail: "SCAN p", Tables: payments}}},
			{"an outermost SCAN in run 4", family, []planStep{{ID: 2, Detail: "SCAN i", Tables: invoices}}},
			{"an outermost SCAN in a statement run 5 adds", opened, []planStep{{ID: 2, Detail: "SCAN pa", Tables: apps}}},
			{"an AUTOMATIC index on a large table", whole, []planStep{
				{ID: 2, Detail: "SCAN c", Tables: customers},
				{ID: 3, Detail: "SEARCH pa USING AUTOMATIC COVERING INDEX (invoice=?)", Tables: apps}}},
			{"a MATERIALIZE of a large table scanned inside a loop", whole, []planStep{
				{ID: 2, Detail: "MATERIALIZE x"},
				{ID: 4, Parent: 2, Detail: "SEARCH p USING INDEX idx_books_payments_status_date (status=?)", Tables: payments},
				{ID: 9, Detail: "SCAN c", Tables: customers},
				{ID: 11, Detail: "SCAN x"}}},
			{"a CO-ROUTINE of a large table scanned inside a loop", whole, []planStep{
				{ID: 2, Detail: "CO-ROUTINE (subquery-1)"},
				{ID: 4, Parent: 2, Detail: "SEARCH i USING INDEX idx_books_invoices_status_date (status=?)", Tables: invoices},
				{ID: 9, Detail: "SCAN c", Tables: customers},
				{ID: 11, Detail: "SCAN (subquery-1)"}}},
			{"a MATERIALIZE of a large table scanned by its alias inside a loop", whole, []planStep{
				{ID: 2, Detail: "MATERIALIZE o1"},
				{ID: 4, Parent: 2, Detail: "SEARCH i USING INDEX idx_books_invoices_status_date (status=?)", Tables: invoices},
				{ID: 9, Detail: "SCAN c", Tables: customers},
				{ID: 11, Detail: "SCAN o", Subs: []string{"o1"}}}},
		}
		for _, c := range cases {
			rec := &arPlanRecorder{TB: t}
			checkPlanBars(rec, c.run, "SELECT 1", c.steps, arLargeTables)
			if len(rec.errs) == 0 {
				t.Errorf("checkPlanBars passes a plan with %s, want a failure", c.bar)
			}
		}
		good := []planStep{
			{ID: 2, Detail: "SCAN i", Tables: invoices},
			{ID: 3, Detail: "SEARCH l USING INDEX idx_books_jlines_entry (entry=?)", Tables: lines},
			{ID: 4, Detail: "SEARCH e USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?)", Tables: entries},
			{ID: 20, Detail: "USE TEMP B-TREE FOR GROUP BY"},
			{ID: 21, Detail: "USE TEMP B-TREE FOR ORDER BY"},
		}
		rec := &arPlanRecorder{TB: t}
		checkPlanBars(rec, whole, "SELECT 1", good, arLargeTables)
		if len(rec.errs) != 0 {
			t.Errorf("checkPlanBars fails a plan that meets every bar: %q", rec.errs)
		}
	})

	readings := []arReading{{name: "no statistics"}, {name: "L statistics", stats: arLStats(t, "ar_aging_stat1.json")}}
	arCheckRuns(t, b, arRuns(b, data), readings, nil)
}

func TestARAgingRunsAgreeWithSmallBook(t *testing.T) {
	b := newARBook(t)
	arJournalPrefix(t, b)
	data := writeARDataset(t, b, arSmall)
	runs := arRuns(b, data)

	var ledger int64
	if err := b.app.DB().NewQuery("SELECT COALESCE(SUM(l.debit - l.credit), 0) FROM books_journal_lines l " +
		"JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND a.type = 'accounts_receivable' AND l.date <= {:day}").
		Bind(dbx.Params{"day": data.lastDay}).Row(&ledger); err != nil {
		t.Fatalf("read the Accounts receivable lines: %v", err)
	}
	if ledger == 0 {
		t.Fatal("the small book's Accounts receivable lines net to 0: the dataset wrote no open item")
	}
	first := runs[0].result(t, b)
	if got := amt(t, totalOf(t, first), "total"); got != ledger {
		t.Errorf("run 1's Total = %d, want %d, the net of every posted Accounts receivable line", got, ledger)
	}
	row, ok := cbGroupRow(first, 2, data.busiest)
	if !ok {
		t.Fatalf("run 1 has no row for the busiest customer; rows %q", bsLabels(first))
	}
	if want := runs[4].opts.Expand[0]; !reflect.DeepEqual(row.GroupKey, want) {
		t.Errorf("run 1 keys the busiest customer %#v; runs 5 and 6 open %#v", row.GroupKey, want)
	}
	if top, _ := row.GroupKey[0].(string); top != data.busiestTop {
		t.Errorf("run 1 files the busiest customer under family %q, want %q", top, data.busiestTop)
	}

	picked := map[string]bool{}
	for _, c := range data.family {
		picked[c] = true
	}
	family := runs[3].result(t, b)
	if len(cbCustomerRows(family)) == 0 {
		t.Fatalf("run 4 (family %v) has no customer row; rows %q", data.family, bsLabels(family))
	}
	for _, r := range family.Rows {
		if r.Kind != reports.KindGroup || r.Level > 2 || len(r.GroupKey) < r.Level {
			continue
		}
		if own, _ := r.GroupKey[r.Level-1].(string); !picked[own] {
			t.Errorf("run 4 shows %q (level %d, key %#v), which is not of the picked family %v", r.Label, r.Level, r.GroupKey, data.family)
		}
	}

	opened := runs[4].result(t, b)
	customerRow, ok := cbGroupRow(opened, 2, data.busiest)
	if !ok {
		t.Fatalf("run 5 has no row for the busiest customer; rows %q", bsLabels(opened))
	}
	if items := arItemsOf(t, opened, customerRow); len(items) < 2 {
		t.Errorf("run 5 opens the busiest customer into %d items, want its open items (%q)", len(items), labelsOf(items))
	}
	item := runs[5].result(t, b)
	if lines := arLinesOf(t, item, requireItemRow(t, item, data.busiestInvoice)); len(lines) < 2 {
		t.Errorf("run 6 opens the part-paid invoice into %d lines, want the invoice and its payment (%q)", len(lines), labelsOf(lines))
	}
}

// arCountsOf counts the dataset's rows as the §9 table counts them.
func arCountsOf(t *testing.T, b arBook, data arDataset) arCounts {
	t.Helper()
	count := func(sql string) int {
		t.Helper()
		var n int
		if err := b.app.DB().NewQuery(sql).Bind(dbx.Params{"day": data.lastDay}).Row(&n); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return n
	}
	const ar = "FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE a.type = 'accounts_receivable'"
	return arCounts{
		lines:        count("SELECT COUNT(*) FROM books_journal_lines"),
		arLines:      count("SELECT COUNT(*) " + ar),
		customers:    count("SELECT COUNT(*) FROM books_customers"),
		invoices:     count("SELECT COUNT(*) FROM books_invoices"),
		payments:     count("SELECT COUNT(*) FROM books_payments"),
		applications: count("SELECT COUNT(*) FROM books_payment_applications"),
		memos:        count("SELECT COUNT(*) FROM books_credit_memos"),
		manual:       count("SELECT COUNT(*) " + ar + " AND l.entry IN (SELECT id FROM books_journal_entries WHERE origin = 'manual')"),
		voidInvoices: count("SELECT COUNT(*) FROM books_invoices WHERE status = 'void'"),
		voidPayments: count("SELECT COUNT(*) FROM books_payments WHERE status = 'void'"),
		openItems: count("SELECT COUNT(*) FROM (SELECT item FROM books_receivable_items " +
			"WHERE date <= {:day} GROUP BY item HAVING SUM(debit - credit) != 0)"),
	}
}

// arRequireCounts fails a dataset whose rows are not the §9 table's:
// books_journal_lines exactly, the other counts within 2%, the open items on
// the last day within 10%.
func arRequireCounts(t *testing.T, size string, got arCounts) {
	t.Helper()
	want := arSpecTable[size]
	if got.lines != want.lines {
		t.Errorf("%s: books_journal_lines = %d, want exactly %d", size, got.lines, want.lines)
	}
	for _, c := range []struct {
		name      string
		got, want int
	}{
		{"Accounts receivable lines", got.arLines, want.arLines},
		{"customers", got.customers, want.customers},
		{"invoices", got.invoices, want.invoices},
		{"payments", got.payments, want.payments},
		{"payment applications", got.applications, want.applications},
		{"credit memos", got.memos, want.memos},
		{"manual Accounts receivable lines", got.manual, want.manual},
		{"void invoices", got.voidInvoices, want.voidInvoices},
		{"void payments", got.voidPayments, want.voidPayments},
	} {
		if !arWithin(c.got, c.want, 2) {
			t.Errorf("%s: %s = %d, want within 2%% of %d", size, c.name, c.got, c.want)
		}
	}
	if !arWithin(got.openItems, want.openItems, 10) {
		t.Errorf("%s: open items on the last day = %d, want within 10%% of %d", size, got.openItems, want.openItems)
	}
}

func TestARAgingScale(t *testing.T) {
	if os.Getenv("BOOKS_SCALE") != "1" {
		t.Skip("BOOKS_SCALE=1 starts the S and L runs of spec §9")
	}
	type planRec struct {
		run, reading string
		statements   []string
		steps        []planStep
	}
	medians := map[string]map[string]time.Duration{}
	counts := map[string]arCounts{}
	cbTimes := map[string]time.Duration{}
	var plans []planRec
	var stat1 []arStat
	var runNames []string
	statementCount := map[string]int{}
	exportRun := map[string]bool{}

	for _, size := range []arSize{arS, arL} {
		t.Run(size.name, func(t *testing.T) {
			b := newARBook(t)
			arJournalPrefix(t, b)
			started := time.Now()
			data := writeARDataset(t, b, size)
			t.Logf("%s: wrote the dataset in %s", size.name, time.Since(started))
			counts[size.name] = arCountsOf(t, b, data)
			arRequireCounts(t, size.name, counts[size.name])

			runs := arRuns(b, data)
			medians[size.name] = map[string]time.Duration{}
			for _, run := range runs {
				medians[size.name][run.name] = arMedian(func() { run.exec(t, b) })
				t.Logf("%s run %s: median %s", size.name, run.name, medians[size.name][run.name])
			}
			cbTimes[size.name] = arMedian(func() {
				runCB(t, b.app, b.reader, map[string]any{"asOf": data.lastDay}, reports.Options{Today: data.lastDay})
			})
			if size.name != arL.name {
				return
			}

			runNames = nil
			for _, run := range runs {
				runNames = append(runNames, run.name)
				exportRun[run.name] = run.export
			}
			readings := []arReading{{name: "no statistics"}, {name: "after ANALYZE", analyze: true}}
			arCheckRuns(t, b, runs, readings, func(run arRun, reading arReading, statements []string, steps []planStep, stats []arStat) {
				statementCount[run.name] = len(statements)
				plans = append(plans, planRec{run: run.name, reading: reading.name, statements: statements, steps: steps})
				if reading.analyze {
					stat1 = stats
				}
			})
			for _, name := range runNames {
				l, s := medians[arL.name][name], medians[arS.name][name]
				bar := time.Second
				if exportRun[name] {
					bar = 5 * time.Second
				}
				if l > bar {
					t.Errorf("run %s at L: median %s, want %s or less", name, l, bar)
				}
				if s > 0 && l > 15*s {
					t.Errorf("run %s: L median %s is %.1f times its S median %s, want 15 or less", name, l, float64(l)/float64(s), s)
				}
			}
		})
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
	fmt.Fprintf(&res, "# A/R Aging performance results\n\n")
	fmt.Fprintf(&res, "- Machine: %s/%s, %d CPUs, %s\n- Date: %s\n- Commit: %s\n\n",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), time.Now().Format(time.DateTime), commit)
	fmt.Fprintf(&res, "## Row counts\n\n| | S | L |\n|---|---|---|\n")
	for _, c := range []struct {
		name string
		get  func(arCounts) int
	}{
		{"books_journal_lines", func(c arCounts) int { return c.lines }},
		{"lines on Accounts receivable", func(c arCounts) int { return c.arLines }},
		{"customers", func(c arCounts) int { return c.customers }},
		{"invoices", func(c arCounts) int { return c.invoices }},
		{"payments", func(c arCounts) int { return c.payments }},
		{"payment applications", func(c arCounts) int { return c.applications }},
		{"credit memos", func(c arCounts) int { return c.memos }},
		{"manual Accounts receivable lines", func(c arCounts) int { return c.manual }},
		{"void invoices", func(c arCounts) int { return c.voidInvoices }},
		{"void payments", func(c arCounts) int { return c.voidPayments }},
		{"open items on the last day", func(c arCounts) int { return c.openItems }},
	} {
		fmt.Fprintf(&res, "| %s | %d | %d |\n", c.name, c.get(counts[arS.name]), c.get(counts[arL.name]))
	}
	fmt.Fprintf(&res, "\n## Runs\n\n| Run | Statements | S median | L median | Ratio | Bar | Result |\n|---|---|---|---|---|---|---|\n")
	for _, name := range runNames {
		s, l := medians[arS.name][name], medians[arL.name][name]
		bar := time.Second
		if exportRun[name] {
			bar = 5 * time.Second
		}
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
	fmt.Fprintf(&res, "\nCustomer Balance, same day: S %s, L %s (no bar)\n\n## Statements (L)\n\n", cbTimes[arS.name], cbTimes[arL.name])
	var plansText strings.Builder
	fmt.Fprintf(&plansText, "# A/R Aging query plans (L)\n")
	for i := 0; i+1 < len(plans); i += 2 {
		before, after := plans[i], plans[i+1]
		for k, s := range before.statements {
			fmt.Fprintf(&res, "- run %s, statement %d: before ANALYZE: %s; after ANALYZE: %s\n",
				before.run, k+1, arReads(arStepsOf(before.steps, k)), arReads(arStepsOf(after.steps, k)))
			fmt.Fprintf(&plansText, "\n## Run %s, statement %d\n\n```sql\n%s\n```\n\n%s:\n\n```\n%s```\n\n%s:\n\n```\n%s```\n",
				before.run, k+1, s, before.reading, arPlanText(arStepsOf(before.steps, k)), after.reading, arPlanText(arStepsOf(after.steps, k)))
		}
	}
	stats, err := json.MarshalIndent(stat1, "", "  ")
	if err != nil {
		t.Fatalf("encode sqlite_stat1: %v", err)
	}
	for name, body := range map[string][]byte{
		"perf-results.md":     []byte(res.String()),
		"perf-plans.md":       []byte(plansText.String()),
		"ar_aging_stat1.json": append(stats, '\n'),
	} {
		if err := os.WriteFile(filepath.Join(out, name), body, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}
