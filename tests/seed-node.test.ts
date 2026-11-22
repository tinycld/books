// @vitest-environment node
// Core's scripts/seed-db.ts runs a package seed with tsx in plain node, while vitest
// aliases react-native to a stub. Only a real node run catches a seed graph that
// reaches react-native or core UI (for example a value import of lib/transfer.ts,
// which imports zod through @tinycld/core/ui/form), so this test spawns one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import PocketBase, { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { AP_AGING_SEED } from '../tinycld/books/lib/ap-aging-fixture'
import { APPLY_CREDIT_SEED } from '../tinycld/books/lib/apply-credit-fixture'
import { AR_AGING_SEED } from '../tinycld/books/lib/ar-aging-fixture'
import { DEPOSIT_SEED } from '../tinycld/books/lib/bank-deposit-fixture'
import { CUSTOMER_BALANCE_SEED } from '../tinycld/books/lib/customer-balance-fixture'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { REVIEW_SEED_ENTRIES, REVIEW_SEED_STATEMENT } from '../tinycld/books/lib/for-review-fixture'
import { GENERAL_LEDGER_LONG_SECTION } from '../tinycld/books/lib/general-ledger-fixture'
import { RECONCILE_SEED } from '../tinycld/books/lib/reconcile-fixture'
import {
    REFUND_FROM_ACCOUNTS,
    REFUND_RECEIPT_IDS,
    REFUND_RECEIPT_LINES,
    REFUND_RECEIPT_SEED_DRAFT_ID,
    REFUND_RECEIPTS,
    REFUND_SEED_CREDIT_MEMO,
    REFUND_SEED_CREDIT_MEMO_LINES,
    REFUND_SEED_PAYOUT,
    REFUND_SEED_PAYOUT_LINES,
} from '../tinycld/books/lib/refund-receipt-form-fixture'
import * as fixture1099 from '../tinycld/books/lib/report-1099-fixture'
import {
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPT_SEED_IDS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { STATEMENT_SEED } from '../tinycld/books/lib/statements-fixture'
import { ACCOUNT_BOXES } from '../tinycld/books/lib/vendor-1099-fixture'
import { VENDOR_BALANCE_SEED } from '../tinycld/books/lib/vendor-balance-fixture'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import { VENDOR_REFUND_VENDOR_IDS } from '../tinycld/books/lib/vendor-refund-fixture'
import {
    WRITE_OFF_INVOICES,
    WRITE_OFF_SEED,
    WRITE_OFFS,
} from '../tinycld/books/lib/write-off-fixture'
import * as seedModule from '../tinycld/books/seed'
import { seedArAging } from '../tinycld/books/seed'

const packageRoot = path.resolve(__dirname, '..')
const seedPath = path.resolve(__dirname, '../tinycld/books/seed.ts')

type Write = {
    op: 'create' | 'update'
    collection: string
    id: string
    data: Record<string, unknown>
    // The /api/batch call that made the write, counted from 1; absent for a single call.
    batch?: number
}

// A PocketBase stand-in that stores and records every write the seed makes, in order. It
// answers a read with what was written; it does not run the server's posting, so the
// balance a run leaves is read from the writes by the rule of vendor refund spec §3.9.
function recordingPb() {
    const writes: Write[] = []
    const rows = new Map<string, Record<string, unknown>>()
    let next = 0
    const ofCollection = (name: string) =>
        [...rows.entries()].filter(([key]) => key.startsWith(`${name}/`)).map(([, row]) => row)
    const collection = (name: string) => ({
        create: async (data: Record<string, unknown>) => {
            next += 1
            const id =
                typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
            const row = { revision: 0, ...data, id }
            rows.set(`${name}/${id}`, row)
            writes.push({ op: 'create', collection: name, id, data })
            return row
        },
        update: async (id: string, data: Record<string, unknown>) => {
            const row = { ...(rows.get(`${name}/${id}`) ?? { id }), ...data }
            rows.set(`${name}/${id}`, row)
            writes.push({ op: 'update', collection: name, id, data })
            return row
        },
        getOne: async (id: string) => rows.get(`${name}/${id}`) ?? { id, revision: 0 },
        getFirstListItem: async () => {
            const all = ofCollection(name)
            const last = all[all.length - 1]
            if (!last) throw new Error(`recordingPb: no ${name} row to read`)
            return last
        },
        getFullList: async () => ofCollection(name),
    })
    const pb = { collection, filter: (raw: string) => raw }
    return { pb, writes }
}

const USER = { id: 'usrseed00000001', email: 'seed@example.com', name: 'Seed' }

function seededAccounts(): Map<string, string> {
    return new Map(
        SEED_ACCOUNTS.map(account => [account.number, `acct${account.number}`.padEnd(15, '0')])
    )
}

function finalStatus(writes: Write[], collection: string, id: string): unknown {
    return writes
        .filter(w => w.collection === collection && w.id === id && 'status' in w.data)
        .map(w => w.data.status)
        .pop()
}

describe('seed graph', () => {
    it('loads in plain node through tsx, as core seed-db.ts runs it', () => {
        const cli = createRequire(import.meta.url).resolve('tsx/cli')
        const output = execFileSync(
            process.execPath,
            [
                cli,
                '--eval',
                `import(${JSON.stringify(seedPath)}).then(m => console.log(typeof m.default))`,
            ],
            { cwd: packageRoot, encoding: 'utf8' }
        )
        expect(output.trim()).toBe('function')
    }, 30_000)
})

// Vendor refund spec §4 (seed): Cascade Fuel & Fleet gets one posted vendor credit of
// $425.00 on 6100, then a posted refund of $150.00 to 1000 dated 2026-11-10, a refund of
// $100.00 dated 2026-11-11 that is posted and voided, and a draft refund of $275.00 to
// 1200, in that order, after the vendor credit applications.
describe('seedVendorRefunds', () => {
    it('runs after the vendor credit applications in the seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const applications = body.indexOf('seedVendorCreditApplications(')
        const refunds = body.indexOf('seedVendorRefunds(')
        expect(applications).toBeGreaterThan(-1)
        expect(refunds).toBeGreaterThan(applications)
    })

    it('posts the credit, then posts, voids and drafts the refunds, leaving 275.00 unapplied', async () => {
        const seedVendorRefunds = (seedModule as Record<string, unknown>).seedVendorRefunds
        expect(typeof seedVendorRefunds).toBe('function')
        if (typeof seedVendorRefunds !== 'function') return
        const { pb, writes } = recordingPb()
        const accounts = seededAccounts()
        await seedVendorRefunds(pb, { user: USER }, accounts)

        const credits = writes.filter(
            w => w.collection === 'books_vendor_credits' && w.op === 'create'
        )
        expect(credits).toHaveLength(1)
        const credit = credits[0]
        if (!credit) return
        expect(credit.data).toMatchObject({
            vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
            status: 'draft',
        })
        const creditLines = writes.filter(w => w.collection === 'books_vendor_credit_lines')
        expect(creditLines.map(w => w.data)).toEqual([
            expect.objectContaining({
                vendor_credit: credit.id,
                account: accounts.get('6100'),
                amount: 42_500,
            }),
        ])
        expect(finalStatus(writes, 'books_vendor_credits', credit.id)).toBe('posted')

        const refunds = writes.filter(
            w => w.collection === 'books_vendor_refunds' && w.op === 'create'
        )
        expect(
            refunds.map(w => ({
                vendor: w.data.vendor,
                status: w.data.status,
                amount: w.data.amount,
                refunded_to: w.data.refunded_to,
            }))
        ).toEqual([
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'draft',
                amount: 15_000,
                refunded_to: accounts.get('1000'),
            },
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'draft',
                amount: 10_000,
                refunded_to: accounts.get('1000'),
            },
            {
                vendor: VENDOR_REFUND_VENDOR_IDS.cascade,
                status: 'draft',
                amount: 27_500,
                refunded_to: accounts.get('1200'),
            },
        ])
        expect(refunds.map(w => String(w.data.date).slice(0, 10)).slice(0, 2)).toEqual([
            '2026-11-10',
            '2026-11-11',
        ])
        expect(refunds.map(w => finalStatus(writes, 'books_vendor_refunds', w.id))).toEqual([
            'posted',
            'void',
            'draft',
        ])

        // Each refund's line names the seeded credit for the refund's amount, after the
        // refund's draft and before its post, and each refund comes after the one before.
        const lines = writes.filter(w => w.collection === 'books_vendor_refund_lines')
        expect(lines.map(w => [w.data.refund, w.data.vendor_credit, w.data.amount])).toEqual(
            refunds.map(w => [w.id, credit.id, w.data.amount])
        )
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const creditPost = writes.find(
            w =>
                w.collection === 'books_vendor_credits' &&
                w.op === 'update' &&
                w.data.status === 'posted'
        )
        expect(at(refunds[0])).toBeGreaterThan(at(creditPost))
        refunds.forEach((refund, i) => {
            const line = lines.find(w => w.data.refund === refund.id)
            expect(at(line)).toBeGreaterThan(at(refund))
            const post = writes.find(
                w =>
                    w.collection === 'books_vendor_refunds' &&
                    w.id === refund.id &&
                    w.data.status === 'posted'
            )
            if (i < 2) {
                expect(post?.data.posted_by).toBe(USER.id)
                expect(at(post)).toBeGreaterThan(at(line))
            }
            if (i > 0)
                expect(at(refund)).toBeGreaterThan(
                    at(lines.find(w => w.data.refund === refunds[i - 1]?.id))
                )
        })
        const voided = writes.find(
            w =>
                w.collection === 'books_vendor_refunds' &&
                w.id === refunds[1]?.id &&
                w.data.status === 'void'
        )
        expect(voided?.data.voided_by).toBe(USER.id)

        // The server lowers the credit by the lines of posted refunds only.
        const refunded = lines
            .filter(
                w => finalStatus(writes, 'books_vendor_refunds', String(w.data.refund)) === 'posted'
            )
            .reduce((sum, w) => sum + Number(w.data.amount), 0)
        expect(42_500 - refunded).toBe(27_500)
    })
})

// One `field = 'value'` or `field = "value"` clause of a filter, as pb.filter writes a
// string param (single quotes, `\'` escaped) or as the filter text holds a literal.
const FILTER_CLAUSE = /^\s*(\w+)\s*=\s*(['"])((?:\\.|(?!\2).)*)\2\s*$/

function filterClauses(filter: string): [string, string][] {
    if (filter.trim() === '') return []
    return filter.split('&&').map(clause => {
        const match = FILTER_CLAUSE.exec(clause)
        if (!match?.[1] || match[3] === undefined) {
            throw new Error(`servedPb: cannot read filter clause ${JSON.stringify(clause)}`)
        }
        return [match[1], match[3].replace(/\\(.)/g, '$1')]
    })
}

// A real PocketBase client whose requests a stand-in server in this file answers. The
// seed runs through the SDK as it does against the server (its routes, pb.filter's
// text), every write is stored and recorded in order, and a list read keeps only the
// rows that match EVERY clause of the filter (`status = "posted"` too), as the
// server's filter does. A batch (pb.createBatch) runs its creates in order and records
// each with the batch's number. It does not run the server's posting; `afterUpdate`, when
// given, stands in for the part of it a seed reads back (it stores rows unrecorded).
type Store = (name: string, row: Record<string, unknown> & { id: string }) => void
type RowsOf = (name: string) => Record<string, unknown>[]

function servedPb(
    afterUpdate?: (name: string, row: Record<string, unknown>, store: Store, rowsOf: RowsOf) => void
) {
    const writes: Write[] = []
    const rows = new Map<string, Record<string, unknown>>()
    let next = 0
    let batches = 0
    const answer = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        })
    const create = (name: string, data: Record<string, unknown>, batch?: number) => {
        next += 1
        const created =
            typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
        const row = { revision: 0, ...data, id: created }
        rows.set(`${name}/${created}`, row)
        writes.push({ op: 'create', collection: name, id: created, data, batch })
        return row
    }
    const serveBatch = (body: unknown) => {
        const payload = body instanceof FormData ? body.get('@jsonPayload') : null
        if (typeof payload !== 'string') {
            return answer(400, { message: 'servedPb: a batch with no @jsonPayload' })
        }
        const { requests } = JSON.parse(payload) as {
            requests: { method: string; url: string; body?: Record<string, unknown> }[]
        }
        batches += 1
        const results = requests.map(request => {
            const name = /^\/api\/collections\/([^/]+)\/records$/.exec(request.url)?.[1]
            if (request.method !== 'POST' || !name) {
                throw new Error(`servedPb: no batch ${request.method} ${request.url}`)
            }
            return { status: 200, body: create(name, request.body ?? {}, batches) }
        })
        return answer(200, results)
    }
    const serve = async (input: RequestInfo | URL, config?: RequestInit) => {
        const url = new URL(String(input))
        if (url.pathname === '/api/batch' && config?.method === 'POST') {
            return serveBatch(config.body)
        }
        const route = /^\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?$/.exec(url.pathname)
        const name = route?.[1]
        if (!name) return answer(404, { message: `servedPb: no route ${url.pathname}` })
        const id = route[2]
        const method = config?.method ?? 'GET'
        const data: Record<string, unknown> =
            typeof config?.body === 'string' ? JSON.parse(config.body) : {}
        if (method === 'POST' && id === undefined) {
            return answer(200, create(name, data))
        }
        if (method === 'PATCH' && id !== undefined) {
            const row = { ...(rows.get(`${name}/${id}`) ?? { id }), ...data }
            rows.set(`${name}/${id}`, row)
            writes.push({ op: 'update', collection: name, id, data })
            afterUpdate?.(
                name,
                row,
                (into, stored) => rows.set(`${into}/${stored.id}`, stored),
                of =>
                    [...rows.entries()]
                        .filter(([key]) => key.startsWith(`${of}/`))
                        .map(([, stored]) => stored)
            )
            return answer(200, rows.get(`${name}/${id}`) ?? row)
        }
        if (method === 'GET' && id !== undefined) {
            const row = rows.get(`${name}/${id}`)
            return row ? answer(200, row) : answer(404, { message: 'not found' })
        }
        if (method === 'GET') {
            const clauses = filterClauses(url.searchParams.get('filter') ?? '')
            const matching = [...rows.entries()]
                .filter(([key]) => key.startsWith(`${name}/`))
                .map(([, row]) => row)
                .filter(row => clauses.every(([field, value]) => String(row[field]) === value))
            const perPage = Number(url.searchParams.get('perPage') ?? 30)
            return answer(200, {
                page: 1,
                perPage,
                totalItems: matching.length,
                totalPages: Math.ceil(matching.length / perPage),
                items: matching.slice(0, perPage),
            })
        }
        return answer(405, { message: `servedPb: no ${method} ${url.pathname}` })
    }
    const pb = new PocketBase('http://seed.test')
    pb.autoCancellation(false)
    pb.beforeSend = (url, options) => ({ url, options: { ...options, fetch: serve } })
    return { pb, writes }
}

// Each customer-form fixture id mapped to a created id, as seedCustomers returns them.
function createdCustomerIds(): Map<string, string> {
    return new Map(CUSTOMERS.map((c, i) => [c.id, `cust${String(i).padStart(11, '0')}`]))
}

function createdIdOf(customerIds: Map<string, string>, displayName: string): string | undefined {
    const fixture = CUSTOMERS.find(c => c.display_name === displayName)
    return fixture === undefined ? undefined : customerIds.get(fixture.id)
}

// A/R Aging spec §4 Seed (Q16): a part payment on the seeded gala invoice, one payment
// applied to no invoice, and one more posted invoice, last among the document seeds.
describe('seedArAging', () => {
    it('runs after the sales reports seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const salesReports = body.indexOf('seedSalesReports(')
        const arAging = body.indexOf('seedArAging(')
        expect(salesReports).toBeGreaterThan(-1)
        expect(arAging).toBeGreaterThan(salesReports)
    })

    it('posts the invoice and the two payments, applying only the part payment to the gala invoice', async () => {
        const { pb, writes } = servedPb()
        const customerIds = createdCustomerIds()
        const gala = customerIds.get(CUSTOMER_BALANCE_SEED.galaInvoice.customer)
        const galaInvoice = await pb.collection('books_invoices').create({
            id: 'galainvoice0001',
            customer: gala,
            memo: CUSTOMER_BALANCE_SEED.galaInvoice.memo,
            status: 'posted',
            total: CUSTOMER_BALANCE_SEED.galaInvoice.cents,
        })
        const before = writes.length
        await seedArAging(pb, { user: USER }, seededAccounts(), customerIds)
        const seeded = writes.slice(before)

        const invoices = seeded.filter(w => w.collection === 'books_invoices' && w.op === 'create')
        expect(invoices).toHaveLength(1)
        const invoice = invoices[0]
        if (!invoice) return
        expect(invoice.data).toMatchObject({
            customer: createdIdOf(customerIds, AR_AGING_SEED.invoice.customer),
            date: AR_AGING_SEED.invoice.date,
            due_date: AR_AGING_SEED.invoice.due_date,
            memo: AR_AGING_SEED.invoice.memo,
        })
        expect(finalStatus(writes, 'books_invoices', invoice.id)).toBe('posted')

        const payments = seeded.filter(w => w.collection === 'books_payments' && w.op === 'create')
        const fixtures = [AR_AGING_SEED.partPayment, AR_AGING_SEED.unappliedPayment]
        expect(
            payments.map(w => ({
                customer: w.data.customer,
                date: w.data.date,
                memo: w.data.memo,
                amount: w.data.amount,
            }))
        ).toEqual(
            fixtures.map(f => ({
                customer: createdIdOf(customerIds, f.customer),
                date: f.date,
                memo: f.memo,
                amount: f.cents,
            }))
        )
        expect(payments.map(w => finalStatus(writes, 'books_payments', w.id))).toEqual([
            'posted',
            'posted',
        ])

        const applications = seeded.filter(w => w.collection === 'books_payment_applications')
        expect(applications.map(w => w.data)).toEqual([
            expect.objectContaining({
                payment: payments[0]?.id,
                invoice: galaInvoice.id,
                amount: AR_AGING_SEED.partPayment.cents,
            }),
        ])
    })

    it('applies the part payment to the posted gala invoice, never to a draft with its memo', async () => {
        const { pb, writes } = servedPb()
        const customerIds = createdCustomerIds()
        const gala = customerIds.get(CUSTOMER_BALANCE_SEED.galaInvoice.customer)
        // The draft is written first, so a read that ignored the status clause would
        // find it before the posted invoice.
        const invoices = pb.collection('books_invoices')
        const draft = await invoices.create({
            customer: gala,
            memo: CUSTOMER_BALANCE_SEED.galaInvoice.memo,
            status: 'draft',
            total: CUSTOMER_BALANCE_SEED.galaInvoice.cents,
        })
        const posted = await invoices.create({
            customer: gala,
            memo: CUSTOMER_BALANCE_SEED.galaInvoice.memo,
            status: 'posted',
            total: CUSTOMER_BALANCE_SEED.galaInvoice.cents,
        })
        expect(draft.id).not.toBe(posted.id)
        const before = writes.length
        await seedArAging(pb, { user: USER }, seededAccounts(), customerIds)

        const applications = writes
            .slice(before)
            .filter(w => w.collection === 'books_payment_applications')
        expect(applications.map(w => w.data.invoice)).toEqual([posted.id])
    })

    it('throws when a customer it names was not created', async () => {
        const { pb } = servedPb()
        const customerIds = createdCustomerIds()
        // The gala invoice exists, so the missing customer is the only cause.
        await pb.collection('books_invoices').create({
            customer: customerIds.get(CUSTOMER_BALANCE_SEED.galaInvoice.customer),
            memo: CUSTOMER_BALANCE_SEED.galaInvoice.memo,
            status: 'posted',
            total: CUSTOMER_BALANCE_SEED.galaInvoice.cents,
        })
        const aspen = CUSTOMERS.find(c => c.display_name === AR_AGING_SEED.invoice.customer)
        if (aspen) customerIds.delete(aspen.id)
        await expect(
            seedArAging(pb, { user: USER }, seededAccounts(), customerIds)
        ).rejects.toThrow()
    })
})

// Write-off spec §4.5 (seed): the WRITE_OFF_SEED invoice is created and posted through the
// writes a fixture invoice takes, with no sales tax, then its write-off is created posted
// to 6050 Bad debts for the invoice's whole total, through the dialog's one write.
describe('seedWriteOffs', () => {
    it('runs after the refund receipts in the seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const refunds = body.indexOf('seedRefundReceipts(')
        const writeOffs = body.indexOf('seedWriteOffs(')
        expect(refunds).toBeGreaterThan(-1)
        expect(writeOffs).toBeGreaterThan(refunds)
    })

    // The seed chart has no 6000, so 6050 sorts directly before 6100 Rent.
    it('seeds 6050 Bad debts directly before 6100', () => {
        const numbers = SEED_ACCOUNTS.map(account => account.number)
        expect(SEED_ACCOUNTS.find(account => account.number === '6050')).toMatchObject({
            name: 'Bad debts',
            type: 'expense',
            detail_type: 'bad_debts',
        })
        expect(numbers.indexOf('6050')).toBeGreaterThan(-1)
        expect(numbers.indexOf('6100')).toBe(numbers.indexOf('6050') + 1)
    })

    it('posts the seed invoice, then writes it off whole to 6050', async () => {
        const seedWriteOffs = (seedModule as Record<string, unknown>).seedWriteOffs
        expect(typeof seedWriteOffs).toBe('function')
        if (typeof seedWriteOffs !== 'function') return
        const { pb, writes } = recordingPb()
        const accounts = seededAccounts()
        const customerIds = new Map(
            CUSTOMERS.map((row, i) => [row.id, `cust${String(i).padStart(11, '0')}`])
        )
        await seedWriteOffs(pb, { user: USER }, accounts, customerIds)

        const invoiceFixture = WRITE_OFF_INVOICES.find(row => row.id === WRITE_OFF_SEED.invoice)
        const writeOffFixture = WRITE_OFFS.find(row => row.id === WRITE_OFF_SEED.writeOff)
        if (!invoiceFixture || !writeOffFixture) throw new Error('no seed pair in the fixture')

        const invoices = writes.filter(w => w.collection === 'books_invoices' && w.op === 'create')
        expect(invoices.map(w => w.id)).toEqual([invoiceFixture.id])
        const invoice = invoices[0]
        if (!invoice) return
        expect(invoice.data).toMatchObject({
            customer: customerIds.get(invoiceFixture.customer),
            status: 'draft',
            date: invoiceFixture.date,
        })
        expect(invoice.data.tax_rate ?? '').toBe('')
        const lines = writes.filter(
            w => w.collection === 'books_invoice_lines' && w.data.invoice === invoice.id
        )
        expect(
            lines.reduce((sum, w) => sum + Number(w.data.quantity) * Number(w.data.rate), 0)
        ).toBe(invoiceFixture.total)
        expect(finalStatus(writes, 'books_invoices', invoice.id)).toBe('posted')

        const writeOffs = writes.filter(w => w.collection === 'books_write_offs')
        expect(writeOffs.map(w => [w.op, w.data])).toEqual([
            [
                'create',
                {
                    id: writeOffFixture.id,
                    invoice: invoice.id,
                    date: writeOffFixture.date,
                    account: accounts.get('6050'),
                    amount: invoiceFixture.total,
                    memo: writeOffFixture.memo,
                    status: 'posted',
                    // The seed runs as a superuser, which stampActor skips, so the
                    // body names the poster as every other seeded document does.
                    posted_by: USER.id,
                },
            ],
        ])
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const invoicePost = writes.find(
            w =>
                w.collection === 'books_invoices' &&
                w.id === invoice.id &&
                w.data.status === 'posted'
        )
        expect(at(writeOffs[0])).toBeGreaterThan(at(invoicePost))
    })
})

// Apply credit spec §4.5 (seed, plan note 12): Fox Hollow Vineyards gets one new invoice
// and one credit memo made from it, both posted through the writes a form makes, then one
// application of $150.00 on 2026-11-16 through the dialog's one write, after the A/R Aging
// seed.
describe('seedApplyCredit', () => {
    it('runs after the A/R Aging seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const arAging = body.indexOf('seedArAging(')
        const applyCredit = body.indexOf('seedApplyCredit(')
        expect(arAging).toBeGreaterThan(-1)
        expect(applyCredit).toBeGreaterThan(arAging)
    })

    it('posts one invoice and one credit memo made from it, then applies $150.00 of the memo to it', async () => {
        const seedApplyCredit = (seedModule as Record<string, unknown>).seedApplyCredit
        expect(typeof seedApplyCredit).toBe('function')
        if (typeof seedApplyCredit !== 'function') return
        const { pb, writes } = recordingPb()
        const customerIds = new Map(
            CUSTOMERS.map((row, i) => [row.id, `cust${String(i).padStart(11, '0')}`])
        )
        await seedApplyCredit(pb, { user: USER }, customerIds)

        const invoices = writes.filter(w => w.collection === 'books_invoices' && w.op === 'create')
        expect(invoices).toHaveLength(1)
        const invoice = invoices[0]
        if (!invoice) return
        expect(invoice.id).toBe(APPLY_CREDIT_SEED.invoice)
        expect(finalStatus(writes, 'books_invoices', invoice.id)).toBe('posted')

        const memos = writes.filter(w => w.collection === 'books_credit_memos' && w.op === 'create')
        expect(memos).toHaveLength(1)
        const memo = memos[0]
        if (!memo) return
        expect(memo.data).toMatchObject({ status: 'draft', invoice: invoice.id })
        expect(memo.data.customer).toBe(invoice.data.customer)
        expect(finalStatus(writes, 'books_credit_memos', memo.id)).toBe('posted')

        const applications = writes.filter(w => w.collection === 'books_credit_memo_applications')
        expect(applications).toHaveLength(1)
        const application = applications[0]
        if (!application) return
        expect(application.op).toBe('create')
        expect(application.data).toMatchObject({
            credit_memo: memo.id,
            invoice: invoice.id,
            amount: 15000,
            date: '2026-11-16',
            // The seed runs as a superuser, which the request hook does not stamp.
            applied_by: USER.id,
        })
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const posted = (collection: string, id: string) =>
            writes.find(
                w => w.collection === collection && w.id === id && w.data.status === 'posted'
            )
        expect(at(application)).toBeGreaterThan(at(posted('books_invoices', invoice.id)))
        expect(at(application)).toBeGreaterThan(at(posted('books_credit_memos', memo.id)))
    })
})

// A/P Aging spec §4.5 Seed, plan decision D2: Harbor Freight Logistics gets one posted bill
// of 860.00 on 6200, a part payment of 137.25 on it by check 1061 from 1000, and a posted
// vendor credit of 200.00 on 6200 with 120.00 of it applied to the bill. It runs after the
// apply credit seed and before the bank match seed, which must see every seeded document.
describe('seedApAging', () => {
    it('runs after the apply credit seed and before the bank match seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const applyCredit = body.indexOf('seedApplyCredit(')
        const apAging = body.indexOf('seedApAging(')
        const bankMatch = body.indexOf('seedBankMatch(')
        expect(applyCredit).toBeGreaterThan(-1)
        expect(apAging).toBeGreaterThan(applyCredit)
        expect(bankMatch).toBeGreaterThan(apAging)
    })

    it('posts the bill, pays 137.25 of it in one batch, posts the credit and applies 120.00 of it to the bill', async () => {
        const seedApAging = (seedModule as Record<string, unknown>).seedApAging
        expect(typeof seedApAging).toBe('function')
        if (typeof seedApAging !== 'function') return
        const { pb, writes } = servedPb()
        const accounts = seededAccounts()
        await seedApAging(pb, { user: USER }, accounts)

        const vendor = VENDORS.find(row => row.id === AP_AGING_SEED.bill.vendor)
        expect(vendor).toBeDefined()
        const bills = writes.filter(w => w.collection === 'books_bills' && w.op === 'create')
        expect(bills).toHaveLength(1)
        const bill = bills[0]
        if (!bill) return
        expect(bill.data).toMatchObject({
            vendor: AP_AGING_SEED.bill.vendor,
            status: 'draft',
            date: AP_AGING_SEED.bill.date,
            due_date: AP_AGING_SEED.bill.due_date,
            ref_no: AP_AGING_SEED.bill.ref_no,
            memo: AP_AGING_SEED.bill.memo,
            terms: vendor?.terms,
            mailing_address: vendor?.address,
        })
        expect(writes.filter(w => w.collection === 'books_bill_lines').map(w => w.data)).toEqual([
            expect.objectContaining({
                bill: bill.id,
                kind: 'account',
                account: accounts.get('6200'),
                amount: 86_000,
            }),
        ])
        expect(finalStatus(writes, 'books_bills', bill.id)).toBe('posted')

        const payments = writes.filter(
            w => w.collection === 'books_bill_payments' && w.op === 'create'
        )
        expect(payments).toHaveLength(1)
        const payment = payments[0]
        if (!payment) return
        expect(payment.data).toMatchObject({
            vendor: AP_AGING_SEED.bill.vendor,
            status: 'posted',
            date: '2026-11-04',
            payment_method: 'check',
            reference_no: '1061',
            paid_from: accounts.get('1000'),
        })
        const paymentLines = writes.filter(w => w.collection === 'books_bill_payment_lines')
        expect(paymentLines.map(w => w.data)).toEqual([
            expect.objectContaining({
                payment: payment.id,
                bill: bill.id,
                amount: 13_725,
                position: 0,
            }),
        ])
        expect(payment.batch).toBeDefined()
        expect(paymentLines.map(w => w.batch)).toEqual([payment.batch])

        const credits = writes.filter(
            w => w.collection === 'books_vendor_credits' && w.op === 'create'
        )
        expect(credits).toHaveLength(1)
        const credit = credits[0]
        if (!credit) return
        expect(credit.data).toMatchObject({
            vendor: AP_AGING_SEED.credit.vendor,
            status: 'draft',
            date: AP_AGING_SEED.credit.date,
            ref_no: AP_AGING_SEED.credit.ref_no,
            memo: AP_AGING_SEED.credit.memo,
        })
        expect(
            writes.filter(w => w.collection === 'books_vendor_credit_lines').map(w => w.data)
        ).toEqual([
            expect.objectContaining({
                vendor_credit: credit.id,
                kind: 'account',
                account: accounts.get('6200'),
                amount: AP_AGING_SEED.credit.cents,
            }),
        ])
        expect(finalStatus(writes, 'books_vendor_credits', credit.id)).toBe('posted')

        const applications = writes.filter(w => w.collection === 'books_vendor_credit_applications')
        expect(applications.map(w => [w.op, w.data])).toEqual([
            [
                'create',
                expect.objectContaining({
                    vendor_credit: credit.id,
                    bill: bill.id,
                    amount: 12_000,
                    date: '2026-10-20',
                    applied_by: USER.id,
                }),
            ],
        ])

        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const posted = (collection: string, id: string) =>
            writes.find(
                w => w.collection === collection && w.id === id && w.data.status === 'posted'
            )
        expect(at(payment)).toBeGreaterThan(at(posted('books_bills', bill.id)))
        expect(at(credit)).toBeGreaterThan(at(payment))
        expect(at(applications[0])).toBeGreaterThan(at(posted('books_vendor_credits', credit.id)))
    })

    it('throws when its vendor is not in VENDORS', async () => {
        const seedApAging = (seedModule as Record<string, unknown>).seedApAging
        expect(typeof seedApAging).toBe('function')
        if (typeof seedApAging !== 'function') return
        const { pb } = servedPb()
        const saved = { bill: AP_AGING_SEED.bill.vendor, credit: AP_AGING_SEED.credit.vendor }
        AP_AGING_SEED.bill.vendor = 'novendor0000000'
        AP_AGING_SEED.credit.vendor = 'novendor0000000'
        try {
            await expect(seedApAging(pb, { user: USER }, seededAccounts())).rejects.toThrow(
                'seed: A/P aging vendor novendor0000000 is not in VENDORS'
            )
        } finally {
            AP_AGING_SEED.bill.vendor = saved.bill
            AP_AGING_SEED.credit.vendor = saved.credit
        }
    })
})

// Bank categorize (cp1): after it matches ONLINE BILL PAY 0915, seedBankMatch categorizes
// the review statement's last row to 6200 through one books_bank_categorizations create,
// for the row's description and its absolute amount in cents.
describe('seedBankMatch', () => {
    it('matches the matched row, then categorizes the last review row to 6200 in one create', async () => {
        const seedBankMatch = (seedModule as Record<string, unknown>).seedBankMatch
        expect(typeof seedBankMatch).toBe('function')
        if (typeof seedBankMatch !== 'function') return
        const { pb, writes } = servedPb()
        const accounts = seededAccounts()
        const statement = REVIEW_SEED_STATEMENT
        // The rows the review import and the match suggester leave before seedBankMatch.
        const txnOf = async (fitid: string) =>
            (await pb.collection('books_bank_transactions').create({ fitid, status: 'for_review' }))
                .id
        const suggested = await txnOf(statement.suggestedFitid)
        const matched = await txnOf(statement.matchedFitid)
        const categorized = await txnOf(statement.categorizedFitid)
        await pb
            .collection('books_bank_match_suggestions')
            .create({ bank_transaction: suggested, line: 'line00000000001' })
        await pb
            .collection('books_bank_match_suggestions')
            .create({ bank_transaction: matched, line: 'line00000000002' })
        const before = writes.length

        await seedBankMatch(pb, { user: USER }, accounts)

        const made = writes.slice(before)
        const matches = made.filter(w => w.collection === 'books_bank_matches')
        expect(matches.map(w => [w.op, w.data])).toEqual([
            [
                'create',
                expect.objectContaining({ bank_transaction: matched, lines: ['line00000000002'] }),
            ],
        ])
        const last = REVIEW_SEED_ENTRIES[REVIEW_SEED_ENTRIES.length - 1]
        expect(last).toBeDefined()
        if (!last) return
        const [, signedAmount, description] = last
        const cents = Math.round(Math.abs(Number(signedAmount)) * 100)
        const categorizations = made.filter(w => w.collection === 'books_bank_categorizations')
        expect(categorizations.map(w => [w.op, w.data])).toEqual([
            [
                'create',
                {
                    bank_transaction: categorized,
                    kind: 'categorize',
                    memo: description,
                    lines: [
                        expect.objectContaining({
                            account: accounts.get(statement.categorizedAccountNumber),
                            amount: cents,
                        }),
                    ],
                    created_by: USER.id,
                },
            ],
        ])
        const at = (w: Write | undefined) => (w ? made.indexOf(w) : -1)
        const matchAt = at(matches[0])
        expect(matchAt).toBeGreaterThanOrEqual(0)
        expect(matchAt).toBeLessThan(at(categorizations[0]))
    })
})

type VendorBalanceCall =
    | { op: 'read'; collection: string; filter: string }
    | { op: 'create' | 'update'; collection: string; id: string; data: Record<string, unknown> }

type VendorBalanceWrite = Exclude<VendorBalanceCall, { op: 'read' }>

const isVendorBalanceWrite = (c: VendorBalanceCall): c is VendorBalanceWrite => c.op !== 'read'

const VB_PAYABLE = 'acctpayable0000'

// A PocketBase stand-in for seedVendorBalance: it records every read and write in order,
// answers the books_accounts read of the Accounts payable account with `payable`, and
// rejects every other first-item read as PocketBase does when no row matches (404).
function vendorBalancePb(payable: string | null) {
    const calls: VendorBalanceCall[] = []
    const sdk = new PocketBase('http://127.0.0.1')
    let next = 0
    const notFound = (name: string) =>
        new ClientResponseError({
            url: `http://127.0.0.1/api/collections/${name}/records`,
            status: 404,
            response: { code: 404, message: "The requested resource wasn't found.", data: {} },
        })
    const collection = (name: string) => ({
        create: async (data: Record<string, unknown>) => {
            next += 1
            const id =
                typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
            calls.push({ op: 'create', collection: name, id, data })
            return { revision: 0, ...data, id }
        },
        update: async (id: string, data: Record<string, unknown>) => {
            calls.push({ op: 'update', collection: name, id, data })
            return { id, ...data }
        },
        getOne: async (id: string) => ({ id, revision: 0 }),
        getFirstListItem: async (filter: string) => {
            calls.push({ op: 'read', collection: name, filter })
            if (
                name === 'books_accounts' &&
                filter === "type = 'accounts_payable'" &&
                payable !== null
            ) {
                return { id: payable }
            }
            throw notFound(name)
        },
    })
    const pb = {
        collection,
        filter: (raw: string, params?: Record<string, unknown>) => sdk.filter(raw, params),
    }
    return { pb, calls }
}

// Vendor Balance plan D2, D3: one posted journal entry on Accounts payable with no vendor,
// then one that names the inactive Old Town Print Shop, which is made active for its post
// and inactive again after it. The payable account is read by its type, because the seed
// chart has none: the server makes it on the first bill post.
describe('seedVendorBalance', () => {
    it('runs after the A/P Aging seed and before the bank match seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const apAging = body.indexOf('seedApAging(')
        const vendorBalance = body.indexOf('seedVendorBalance(')
        const bankMatch = body.indexOf('seedBankMatch(')
        expect(apAging).toBeGreaterThan(-1)
        expect(vendorBalance).toBeGreaterThan(apAging)
        expect(bankMatch).toBeGreaterThan(vendorBalance)
    })

    it('posts the entry with no vendor, then the entry for Old Town Print Shop, which it makes active for the post and inactive again', async () => {
        const seedVendorBalance = (seedModule as Record<string, unknown>).seedVendorBalance
        expect(typeof seedVendorBalance).toBe('function')
        if (typeof seedVendorBalance !== 'function') return
        const { pb, calls } = vendorBalancePb(VB_PAYABLE)
        const accounts = seededAccounts()
        await seedVendorBalance(pb, { user: USER }, accounts)

        const { noVendorEntry, inactiveEntry } = VENDOR_BALANCE_SEED
        const oldTown = VENDORS.find(row => row.id === inactiveEntry.vendor)
        expect(oldTown?.display_name).toBe('Old Town Print Shop')
        const other = accounts.get('6200')
        expect(other).toBeDefined()

        expect(calls[0]).toEqual({
            op: 'read',
            collection: 'books_accounts',
            filter: "type = 'accounts_payable'",
        })
        const writes = calls.filter(isVendorBalanceWrite)
        const entries = writes.filter(
            c => c.op === 'create' && c.collection === 'books_journal_entries'
        )
        expect(entries.map(c => ({ date: c.data.date, memo: c.data.memo }))).toEqual([
            { date: noVendorEntry.date, memo: noVendorEntry.memo },
            { date: inactiveEntry.date, memo: inactiveEntry.memo },
        ])
        const entryIds = entries.map(c => c.id)
        const linesOf = (entry: string) =>
            writes
                .filter(
                    c =>
                        c.op === 'create' &&
                        c.collection === 'books_journal_lines' &&
                        c.data.entry === entry
                )
                .map(c => ({
                    account: c.data.account,
                    debit: c.data.debit,
                    credit: c.data.credit,
                    customer: c.data.customer ?? '',
                    vendor: c.data.vendor ?? '',
                }))
        expect(linesOf(entryIds[0] ?? '')).toEqual([
            {
                account: VB_PAYABLE,
                debit: 0,
                credit: noVendorEntry.cents,
                customer: '',
                vendor: '',
            },
            { account: other, debit: noVendorEntry.cents, credit: 0, customer: '', vendor: '' },
        ])
        expect(linesOf(entryIds[1] ?? '')).toEqual([
            {
                account: VB_PAYABLE,
                debit: 0,
                credit: inactiveEntry.cents,
                customer: '',
                vendor: inactiveEntry.vendor,
            },
            { account: other, debit: inactiveEntry.cents, credit: 0, customer: '', vendor: '' },
        ])

        const at = (keep: (c: VendorBalanceCall) => boolean) => calls.findIndex(keep)
        const created = (id: string) =>
            at(c => c.op === 'create' && c.collection === 'books_journal_entries' && c.id === id)
        const posted = (id: string) =>
            at(
                c =>
                    c.op === 'update' &&
                    c.collection === 'books_journal_entries' &&
                    c.id === id &&
                    c.data.status === 'posted'
            )
        const firstLine = (id: string) =>
            at(
                c =>
                    c.op === 'create' &&
                    c.collection === 'books_journal_lines' &&
                    c.data.entry === id
            )
        const [first = '', second = ''] = entryIds
        expect(posted(first)).toBeGreaterThan(firstLine(first))
        expect(posted(second)).toBeGreaterThan(firstLine(second))

        const vendorWrites = calls.filter(c => c.collection === 'books_vendors')
        expect(vendorWrites).toEqual([
            {
                op: 'update',
                collection: 'books_vendors',
                id: inactiveEntry.vendor,
                data: { inactive: false },
            },
            {
                op: 'update',
                collection: 'books_vendors',
                id: inactiveEntry.vendor,
                data: { inactive: true },
            },
        ])
        const activate = calls.indexOf(vendorWrites[0] as VendorBalanceCall)
        const retire = calls.indexOf(vendorWrites[1] as VendorBalanceCall)
        expect(created(first)).toBeGreaterThan(0)
        expect(posted(first)).toBeLessThan(activate)
        expect(activate).toBeLessThan(created(second))
        expect(retire).toBeGreaterThan(posted(second))
    })

    it('throws when the book has no Accounts payable account', async () => {
        const seedVendorBalance = (seedModule as Record<string, unknown>).seedVendorBalance
        expect(typeof seedVendorBalance).toBe('function')
        if (typeof seedVendorBalance !== 'function') return
        const { pb, calls } = vendorBalancePb(null)
        await expect(seedVendorBalance(pb, { user: USER }, seededAccounts())).rejects.toThrow(
            'seed: vendor balance entries need an Accounts payable account, and no bill has made one'
        )
        expect(calls.filter(c => c.op !== 'read')).toEqual([])
    })

    it('throws when account 6200 was not created', async () => {
        const seedVendorBalance = (seedModule as Record<string, unknown>).seedVendorBalance
        expect(typeof seedVendorBalance).toBe('function')
        if (typeof seedVendorBalance !== 'function') return
        const { pb, calls } = vendorBalancePb(VB_PAYABLE)
        const accounts = seededAccounts()
        accounts.delete('6200')
        await expect(seedVendorBalance(pb, { user: USER }, accounts)).rejects.toThrow(
            `seed: vendor balance entry "${VENDOR_BALANCE_SEED.noVendorEntry.memo}" names an account that was not created`
        )
        expect(calls.filter(c => c.collection === 'books_journal_entries')).toEqual([])
    })
})

// A PocketBase stand-in for seedExpensesByVendor: as recordingPb it stores and records
// every write in order, but its books_vendors table holds only the VENDORS rows named in
// `vendors`, and a read of any other vendor fails as PocketBase does when no row matches
// (404). With `failPost`, the post of a journal entry (the update to status posted) fails.
function expensesByVendorPb(vendors: readonly string[], failPost = false) {
    const writes: Write[] = []
    const rows = new Map<string, Record<string, unknown>>()
    const sdk = new PocketBase('http://127.0.0.1')
    let next = 0
    const vendorRows = VENDORS.filter(row => vendors.includes(row.id)).map(row => ({ ...row }))
    const notFound = (name: string) =>
        new ClientResponseError({
            url: `http://127.0.0.1/api/collections/${name}/records`,
            status: 404,
            response: { code: 404, message: "The requested resource wasn't found.", data: {} },
        })
    const vendorCollection = {
        update: async (id: string, data: Record<string, unknown>) => {
            const row = vendorRows.find(r => r.id === id)
            if (row === undefined) throw notFound('books_vendors')
            writes.push({ op: 'update', collection: 'books_vendors', id, data })
            return { ...row, ...data }
        },
        getOne: async (id: string) => {
            const row = vendorRows.find(r => r.id === id)
            if (row === undefined) throw notFound('books_vendors')
            return row
        },
        getFirstListItem: async (filter: string) => {
            const row = vendorRows.find(r => filter.includes(r.id))
            if (row === undefined) throw notFound('books_vendors')
            return row
        },
        getFullList: async (options?: { filter?: string }) => {
            const filter = options?.filter
            return filter === undefined ? vendorRows : vendorRows.filter(r => filter.includes(r.id))
        },
        getList: async (_page = 1, _perPage = 30, options?: { filter?: string }) => {
            const filter = options?.filter
            const items =
                filter === undefined ? vendorRows : vendorRows.filter(r => filter.includes(r.id))
            return {
                page: 1,
                perPage: items.length,
                totalItems: items.length,
                totalPages: 1,
                items,
            }
        },
    }
    const collection = (name: string) => {
        if (name === 'books_vendors') return vendorCollection
        return {
            create: async (data: Record<string, unknown>) => {
                next += 1
                const id =
                    typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
                const row = { revision: 0, ...data, id }
                rows.set(`${name}/${id}`, row)
                writes.push({ op: 'create', collection: name, id, data })
                return row
            },
            update: async (id: string, data: Record<string, unknown>) => {
                if (failPost && name === 'books_journal_entries' && data.status === 'posted') {
                    throw new ClientResponseError({
                        url: `http://127.0.0.1/api/collections/${name}/records/${id}`,
                        status: 400,
                        response: { code: 400, message: 'the post failed', data: {} },
                    })
                }
                const row = { ...(rows.get(`${name}/${id}`) ?? { id }), ...data }
                rows.set(`${name}/${id}`, row)
                writes.push({ op: 'update', collection: name, id, data })
                return row
            },
            getOne: async (id: string) => rows.get(`${name}/${id}`) ?? { id, revision: 0 },
        }
    }
    const pb = {
        collection,
        filter: (raw: string, params?: Record<string, unknown>) => sdk.filter(raw, params),
    }
    return { pb, writes }
}

const EBV_VENDORS = [VENDOR_IDS.coastalCoffee, VENDOR_IDS.willamette]

// Expenses by Vendor plan D5: one posted journal entry on 6200 Software Subscriptions with
// a debit naming the inactive Coastal Coffee Roasters, a debit naming Willamette Valley
// and a credit naming no vendor. The line guard refuses a new line for an inactive vendor,
// so Coastal Coffee Roasters is made active for the post and inactive again after it.
describe('seedExpensesByVendor', () => {
    it('runs directly after the Vendor Balance seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const start = source.indexOf('export default async function seed(')
        const body = source.slice(start, source.indexOf('\n}\n', start))
        const calls = [...body.matchAll(/\bseed[A-Z]\w*\(/g)].map(match => match[0])
        const vendorBalance = calls.indexOf('seedVendorBalance(')
        expect(vendorBalance).toBeGreaterThan(-1)
        expect(calls[vendorBalance + 1]).toBe('seedExpensesByVendor(')
    })

    it('posts one entry with the three D5 lines, with Coastal Coffee Roasters active only for the post', async () => {
        const seedExpensesByVendor = (seedModule as Record<string, unknown>).seedExpensesByVendor
        expect(typeof seedExpensesByVendor).toBe('function')
        if (typeof seedExpensesByVendor !== 'function') return
        const { pb, writes } = expensesByVendorPb(EBV_VENDORS)
        const accounts = seededAccounts()
        await seedExpensesByVendor(pb, { user: USER }, accounts)

        const software = accounts.get('6200')
        expect(software).toBeDefined()
        const coastal = VENDORS.find(row => row.id === VENDOR_IDS.coastalCoffee)
        expect(coastal?.display_name).toBe('Coastal Coffee Roasters')
        expect(coastal?.inactive).toBe(true)

        const entries = writes.filter(
            w => w.collection === 'books_journal_entries' && w.op === 'create'
        )
        expect(entries.map(w => ({ date: w.data.date, memo: w.data.memo }))).toEqual([
            { date: '2026-09-16', memo: 'Seed expenses by vendor: software by vendor' },
        ])
        const entry = entries[0]
        if (!entry) return
        const lines = writes.filter(
            w => w.collection === 'books_journal_lines' && w.data.entry === entry.id
        )
        expect(
            lines.map(w => ({
                account: w.data.account,
                debit: w.data.debit,
                credit: w.data.credit,
                customer: w.data.customer,
                vendor: w.data.vendor ?? '',
            }))
        ).toEqual([
            {
                account: software,
                debit: 9600,
                credit: 0,
                customer: '',
                vendor: VENDOR_IDS.coastalCoffee,
            },
            {
                account: software,
                debit: 18400,
                credit: 0,
                customer: '',
                vendor: VENDOR_IDS.willamette,
            },
            { account: software, debit: 0, credit: 28000, customer: '', vendor: '' },
        ])
        expect(finalStatus(writes, 'books_journal_entries', entry.id)).toBe('posted')

        const vendorWrites = writes.filter(w => w.collection === 'books_vendors')
        expect(vendorWrites.map(w => [w.op, w.id, w.data])).toEqual([
            ['update', VENDOR_IDS.coastalCoffee, { inactive: false }],
            ['update', VENDOR_IDS.coastalCoffee, { inactive: true }],
        ])
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const post = writes.find(
            w =>
                w.collection === 'books_journal_entries' &&
                w.id === entry.id &&
                w.data.status === 'posted'
        )
        expect(at(vendorWrites[0])).toBeLessThan(at(lines[0]))
        expect(at(vendorWrites[1])).toBeGreaterThan(at(post))
    })

    it('throws when account 6200 was not created', async () => {
        const seedExpensesByVendor = (seedModule as Record<string, unknown>).seedExpensesByVendor
        expect(typeof seedExpensesByVendor).toBe('function')
        if (typeof seedExpensesByVendor !== 'function') return
        const { pb, writes } = expensesByVendorPb(EBV_VENDORS)
        const accounts = seededAccounts()
        accounts.delete('6200')
        await expect(seedExpensesByVendor(pb, { user: USER }, accounts)).rejects.toThrow()
        expect(writes.filter(w => w.collection === 'books_journal_entries')).toEqual([])
    })

    it.each([
        ['Coastal Coffee Roasters', VENDOR_IDS.coastalCoffee, VENDOR_IDS.willamette],
        ['Willamette', VENDOR_IDS.willamette, VENDOR_IDS.coastalCoffee],
    ])('throws its own error before any write when %s was not created in the database', async (_name, missing, present) => {
        const seedExpensesByVendor = (seedModule as Record<string, unknown>).seedExpensesByVendor
        expect(typeof seedExpensesByVendor).toBe('function')
        if (typeof seedExpensesByVendor !== 'function') return
        // The vendor is still in the VENDORS fixture; only its database row is missing.
        expect(VENDORS.some(row => row.id === missing)).toBe(true)
        const { pb, writes } = expensesByVendorPb([present])
        const failure = seedExpensesByVendor(pb, { user: USER }, seededAccounts())
        await expect(failure).rejects.toThrow(/^seed: expenses by vendor/)
        await expect(failure).rejects.toThrow(missing)
        await expect(failure).rejects.not.toBeInstanceOf(ClientResponseError)
        expect(writes).toEqual([])
    })

    it('makes Coastal Coffee Roasters inactive again when the post fails', async () => {
        const seedExpensesByVendor = (seedModule as Record<string, unknown>).seedExpensesByVendor
        expect(typeof seedExpensesByVendor).toBe('function')
        if (typeof seedExpensesByVendor !== 'function') return
        const { pb, writes } = expensesByVendorPb(EBV_VENDORS, true)
        await expect(seedExpensesByVendor(pb, { user: USER }, seededAccounts())).rejects.toThrow(
            'the post failed'
        )
        const vendorWrites = writes.filter(w => w.collection === 'books_vendors')
        expect(vendorWrites.map(w => [w.op, w.id, w.data])).toEqual([
            ['update', VENDOR_IDS.coastalCoffee, { inactive: false }],
            ['update', VENDOR_IDS.coastalCoffee, { inactive: true }],
        ])
        expect(writes[writes.length - 1]).toEqual(vendorWrites[1])
    })
})

const METRO = 'vendmetroprop01'
const GREENLINE = 'vendgreenline01'
const F1099_VENDORS = [VENDOR_IDS.okafor, GREENLINE, VENDOR_IDS.oldTownPrint, METRO]

function seedForm1099Fn(): unknown {
    return (seedModule as Record<string, unknown>).seedForm1099
}

// 1099 report plan D5: one posted journal entry of ten lines on 2026-09-23 that gives the
// 1099 vendors their payments by box, and one posted expense of Jamal Okafor by credit card
// from 2100. The line guard refuses a new line for an inactive vendor, so Old Town Print
// Shop is made active for the post and inactive again after it.
describe('seedForm1099', () => {
    it('runs directly after the Expenses by Vendor seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const start = source.indexOf('export default async function seed(')
        const body = source.slice(start, source.indexOf('\n}\n', start))
        const calls = [...body.matchAll(/\bseed[A-Z]\w*\(/g)].map(match => match[0])
        const ebv = calls.indexOf('seedExpensesByVendor(')
        expect(ebv).toBeGreaterThan(-1)
        expect(calls[ebv + 1]).toBe('seedForm1099(')
    })

    it('posts one entry with the ten D5 lines, each account netting as D5 says', async () => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS)
        const accounts = seededAccounts()
        await seedForm1099(pb, { user: USER }, accounts)

        const acct = (number: string) => accounts.get(number)
        const entries = writes.filter(
            w => w.collection === 'books_journal_entries' && w.op === 'create'
        )
        expect(entries.map(w => ({ date: w.data.date, memo: w.data.memo }))).toEqual([
            { date: '2026-09-23', memo: 'Seed 1099: payments by box' },
        ])
        const entry = entries[0]
        if (!entry) return
        const lines = writes
            .filter(w => w.collection === 'books_journal_lines' && w.data.entry === entry.id)
            .map(w => ({
                account: w.data.account,
                debit: w.data.debit,
                credit: w.data.credit,
                vendor: w.data.vendor ?? '',
            }))
        expect(lines).toEqual([
            { account: acct('6210'), debit: 240000, credit: 0, vendor: VENDOR_IDS.okafor },
            { account: acct('6100'), debit: 65000, credit: 0, vendor: VENDOR_IDS.okafor },
            { account: acct('6200'), debit: 31000, credit: 0, vendor: VENDOR_IDS.okafor },
            { account: acct('6210'), debit: 125000, credit: 0, vendor: GREENLINE },
            { account: acct('6210'), debit: 200000, credit: 0, vendor: VENDOR_IDS.oldTownPrint },
            { account: acct('6100'), debit: 90000, credit: 0, vendor: METRO },
            { account: acct('2100'), debit: 48000, credit: 0, vendor: '' },
            { account: acct('6210'), debit: 0, credit: 613000, vendor: '' },
            { account: acct('6100'), debit: 0, credit: 155000, vendor: '' },
            { account: acct('6200'), debit: 0, credit: 31000, vendor: '' },
        ])
        const sum = (key: 'debit' | 'credit') =>
            lines.reduce((total, line) => total + Number(line[key]), 0)
        expect([sum('debit'), sum('credit')]).toEqual([799000, 799000])
        const net = (number: string) =>
            lines
                .filter(line => line.account === acct(number))
                .reduce((total, line) => total + Number(line.debit) - Number(line.credit), 0)
        expect(['6210', '6100', '6200', '2100'].map(net)).toEqual([-48000, 0, 0, 48000])
        expect(finalStatus(writes, 'books_journal_entries', entry.id)).toBe('posted')
    })

    it("posts Jamal Okafor's expense by credit card from 2100 through the expense form's writes", async () => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS)
        const accounts = seededAccounts()
        await seedForm1099(pb, { user: USER }, accounts)

        const expenses = writes.filter(w => w.collection === 'books_expenses' && w.op === 'create')
        expect(expenses.map(w => w.data)).toEqual([
            expect.objectContaining({
                vendor: VENDOR_IDS.okafor,
                status: 'draft',
                date: '2026-09-23',
                paid_from: accounts.get('2100'),
                payment_method: 'credit_card',
            }),
        ])
        const expense = expenses[0]
        if (!expense) return
        const lines = writes.filter(
            w => w.collection === 'books_expense_lines' && w.data.expense === expense.id
        )
        expect(lines.map(w => w.data)).toEqual([
            expect.objectContaining({
                kind: 'account',
                account: accounts.get('6210'),
                amount: 48000,
                description: 'Seed 1099: design software by card',
            }),
        ])
        expect(finalStatus(writes, 'books_expenses', expense.id)).toBe('posted')
    })

    it('makes Old Town Print Shop active only for the post', async () => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        const oldTown = VENDORS.find(row => row.id === VENDOR_IDS.oldTownPrint)
        expect(oldTown?.inactive).toBe(true)
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS)
        await seedForm1099(pb, { user: USER }, seededAccounts())

        const vendorWrites = writes.filter(w => w.collection === 'books_vendors')
        expect(vendorWrites.map(w => [w.op, w.id, w.data])).toEqual([
            ['update', VENDOR_IDS.oldTownPrint, { inactive: false }],
            ['update', VENDOR_IDS.oldTownPrint, { inactive: true }],
        ])
        const entry = writes.find(
            w => w.collection === 'books_journal_entries' && w.op === 'create'
        )
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const firstLine = writes.find(
            w => w.collection === 'books_journal_lines' && w.data.entry === entry?.id
        )
        const post = writes.find(
            w =>
                w.collection === 'books_journal_entries' &&
                w.id === entry?.id &&
                w.data.status === 'posted'
        )
        expect(at(firstLine)).toBeGreaterThan(-1)
        expect(at(post)).toBeGreaterThan(-1)
        expect(at(vendorWrites[0])).toBeLessThan(at(firstLine))
        expect(at(vendorWrites[1])).toBeGreaterThan(at(post))
    })

    it('makes Old Town Print Shop inactive again when the post fails', async () => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS, true)
        await expect(seedForm1099(pb, { user: USER }, seededAccounts())).rejects.toThrow(
            'the post failed'
        )
        const vendorWrites = writes.filter(w => w.collection === 'books_vendors')
        expect(vendorWrites.map(w => [w.op, w.id, w.data])).toEqual([
            ['update', VENDOR_IDS.oldTownPrint, { inactive: false }],
            ['update', VENDOR_IDS.oldTownPrint, { inactive: true }],
        ])
        expect(writes[writes.length - 1]).toEqual(vendorWrites[1])
    })

    it.each([
        '6210',
        '6100',
        '6200',
        '2100',
    ])('throws its own error when account %s was not created', async number => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS)
        const accounts = seededAccounts()
        accounts.delete(number)
        const failure = seedForm1099(pb, { user: USER }, accounts)
        await expect(failure).rejects.toThrow(/^seed: /)
        await expect(failure).rejects.toThrow(number)
        await expect(failure).rejects.not.toBeInstanceOf(ClientResponseError)
        expect(
            writes.filter(
                w => w.collection === 'books_journal_entries' || w.collection === 'books_expenses'
            )
        ).toEqual([])
    })

    it.each([
        ['Jamal Okafor', VENDOR_IDS.okafor],
        ['Greenline Landscaping', GREENLINE],
        ['Old Town Print Shop', VENDOR_IDS.oldTownPrint],
        ['Metro Commercial Properties', METRO],
    ])('throws its own error when %s was not created in the database', async (_name, missing) => {
        const seedForm1099 = seedForm1099Fn()
        expect(typeof seedForm1099).toBe('function')
        if (typeof seedForm1099 !== 'function') return
        // The vendor is still in the VENDORS fixture; only its database row is missing.
        expect(VENDORS.some(row => row.id === missing)).toBe(true)
        const { pb, writes } = expensesByVendorPb(F1099_VENDORS.filter(id => id !== missing))
        const failure = seedForm1099(pb, { user: USER }, seededAccounts())
        await expect(failure).rejects.toThrow(/^seed: /)
        await expect(failure).rejects.toThrow(missing)
        await expect(failure).rejects.not.toBeInstanceOf(ClientResponseError)
        expect(
            writes.filter(
                w => w.collection === 'books_journal_entries' || w.collection === 'books_expenses'
            )
        ).toEqual([])
    })
})

// The values of REPORT_1099_SEED under the keys that name an account, a vendor or a day.
function seedReferences(value: unknown, out: { key: string; value: unknown }[] = []) {
    if (Array.isArray(value)) {
        for (const item of value) seedReferences(item, out)
    } else if (value !== null && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
            if (['account', 'paid_from', 'vendor', 'date'].includes(key))
                out.push({ key, value: inner })
            else seedReferences(inner, out)
        }
    }
    return out
}

describe('REPORT_1099_SEED', () => {
    it('names only the boxed accounts and 2100, the D5 vendors and 2026-09-23', () => {
        const seed = (fixture1099 as Record<string, unknown>).REPORT_1099_SEED
        expect(seed).toBeDefined()
        const refs = seedReferences(seed)
        const accountNumbers = new Set([...ACCOUNT_BOXES.map(box => box.number), '2100'])
        const accountsNamed = refs.filter(r => r.key === 'account' || r.key === 'paid_from')
        const vendorsNamed = refs.filter(r => r.key === 'vendor')
        const daysNamed = refs.filter(r => r.key === 'date')
        expect(accountsNamed.length).toBeGreaterThan(0)
        expect(vendorsNamed.length).toBeGreaterThan(0)
        expect(daysNamed.length).toBeGreaterThan(0)
        for (const r of accountsNamed) expect(accountNumbers).toContain(r.value)
        const named = (v: unknown) => v !== '' && v !== null && v !== undefined
        for (const r of vendorsNamed.filter(r => named(r.value)))
            expect(F1099_VENDORS).toContain(r.value)
        for (const r of daysNamed) expect(r.value).toBe('2026-09-23')
        expect(new Set(vendorsNamed.map(r => r.value).filter(named))).toEqual(
            new Set(F1099_VENDORS)
        )
    })
})

// Refund receipt plan, decision "Seed pick" (spec §4.6): the refund of the seeded
// receipt 1004 is posted, then the seed-only credit memo of Aspen Ridge Dental is
// posted and the payout that names it is posted, then the draft stays a draft. Each
// goes through the writes the form makes: header create, lines in order, then the post.
describe('seedRefundReceipts', () => {
    it('runs after the sales receipts and the credit memos in the seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const receipts = body.indexOf('seedSalesReceipts(')
        const memos = body.indexOf('seedCreditMemos(')
        const refunds = body.indexOf('seedRefundReceipts(')
        expect(receipts).toBeGreaterThan(-1)
        expect(memos).toBeGreaterThan(-1)
        expect(refunds).toBeGreaterThan(receipts)
        expect(refunds).toBeGreaterThan(memos)
    })

    it('posts the refund of receipt 1004, posts the seed memo then its payout, and keeps the draft', async () => {
        const seedRefundReceipts = (seedModule as Record<string, unknown>).seedRefundReceipts
        expect(typeof seedRefundReceipts).toBe('function')
        if (typeof seedRefundReceipts !== 'function') return
        const { pb, writes } = recordingPb()
        const accounts = seededAccounts()
        const customerIds = new Map(
            CUSTOMERS.map((row, i) => [row.id, `cust${String(i).padStart(11, '0')}`])
        )
        const salesReceiptIds = new Map([
            [SALES_RECEIPT_IDS.posted, 'srseed000000004'],
            [SALES_RECEIPT_IDS.walkIn, 'srseed000000005'],
        ])
        await seedRefundReceipts(pb, { user: USER }, accounts, customerIds, salesReceiptIds)

        const accountOf = (refundFrom: string) =>
            accounts.get(REFUND_FROM_ACCOUNTS.find(row => row.id === refundFrom)?.number ?? '')
        const fixtureOf = (id: string) => {
            const row = REFUND_RECEIPTS.find(r => r.id === id)
            if (!row) throw new Error(`no refund fixture row ${id}`)
            return row
        }
        const posted = fixtureOf(REFUND_RECEIPT_IDS.posted)
        const draft = fixtureOf(REFUND_RECEIPT_SEED_DRAFT_ID)

        const memos = writes.filter(w => w.collection === 'books_credit_memos' && w.op === 'create')
        expect(memos).toHaveLength(1)
        const memo = memos[0]
        if (!memo) return
        expect(REFUND_SEED_CREDIT_MEMO.customer).toBe('cust_aspen_0001')
        expect(memo.data).toMatchObject({
            customer: customerIds.get(REFUND_SEED_CREDIT_MEMO.customer),
            status: 'draft',
            date: REFUND_SEED_CREDIT_MEMO.date,
            tax_rate: REFUND_SEED_CREDIT_MEMO.tax_rate,
        })
        expect(memo.data.invoice ?? '').toBe('')
        const memoLines = writes.filter(w => w.collection === 'books_credit_memo_lines')
        expect(memoLines.map(w => [w.data.credit_memo, w.data.rate, w.data.taxable])).toEqual(
            REFUND_SEED_CREDIT_MEMO_LINES.map(line => [memo.id, line.rate, line.taxable])
        )
        expect(finalStatus(writes, 'books_credit_memos', memo.id)).toBe('posted')

        const refunds = writes.filter(
            w => w.collection === 'books_refund_receipts' && w.op === 'create'
        )
        expect(
            refunds.map(w => ({
                customer: w.data.customer,
                status: w.data.status,
                date: String(w.data.date).slice(0, 10),
                refund_from: w.data.refund_from,
                sales_receipt: w.data.sales_receipt ?? '',
                credit_memo: w.data.credit_memo ?? '',
            }))
        ).toEqual([
            {
                customer: customerIds.get(posted.customer),
                status: 'draft',
                date: '2026-11-12',
                refund_from: accounts.get('1000'),
                sales_receipt: 'srseed000000004',
                credit_memo: '',
            },
            {
                customer: customerIds.get(REFUND_SEED_CREDIT_MEMO.customer),
                status: 'draft',
                date: '2026-11-17',
                refund_from: accounts.get('1000'),
                sales_receipt: '',
                credit_memo: memo.id,
            },
            {
                customer: customerIds.get(draft.customer),
                status: 'draft',
                date: String(draft.date).slice(0, 10),
                refund_from: accountOf(draft.refund_from),
                sales_receipt: draft.sales_receipt === '' ? '' : expect.any(String),
                credit_memo: '',
            },
        ])
        expect(refunds[1]?.data.payment_method).toBe(REFUND_SEED_PAYOUT.payment_method)
        expect(refunds.map(w => finalStatus(writes, 'books_refund_receipts', w.id))).toEqual([
            'posted',
            'posted',
            'draft',
        ])

        // Each refund's lines come in order after its header and before its post, and
        // the payout comes after the post of its memo.
        const fixtureLines = [
            REFUND_RECEIPT_LINES.filter(line => line.refund_receipt === REFUND_RECEIPT_IDS.posted),
            REFUND_SEED_PAYOUT_LINES,
            REFUND_RECEIPT_LINES.filter(
                line => line.refund_receipt === REFUND_RECEIPT_SEED_DRAFT_ID
            ),
        ]
        const lines = writes.filter(w => w.collection === 'books_refund_receipt_lines')
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const postOf = (collection: string, id: string | undefined) =>
            writes.find(
                w => w.collection === collection && w.id === id && w.data.status === 'posted'
            )
        refunds.forEach((refund, i) => {
            const own = lines.filter(w => w.data.refund_receipt === refund.id)
            expect(
                own.map(w => [w.data.position, w.data.kind, w.data.rate]),
                refund.id
            ).toEqual(
                [...(fixtureLines[i] ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map(line => [line.position, line.kind, line.rate])
            )
            for (const line of own) expect(at(line)).toBeGreaterThan(at(refund))
            const post = postOf('books_refund_receipts', refund.id)
            if (i < 2) {
                expect(post?.data.posted_by).toBe(USER.id)
                for (const line of own) expect(at(post)).toBeGreaterThan(at(line))
            }
        })
        expect(at(refunds[1])).toBeGreaterThan(at(postOf('books_credit_memos', memo.id)))
    })
})

// Bank deposit spec §4.6 (seed), checkpoint 1: 4900 Interest earned and 6300 Bank charges
// and fees join the chart, active. seedDeposits posts two sales receipts to 1200
// Undeposited funds ($180.00 by check, $64.00 by cash), each with the customer and one
// product line of the first seeded sales receipt, then one deposit `seeddeposit0001` to
// 1000 that holds the first receipt's 1200 line plus $12.40 on 4900 "October interest"
// (a bank line of $192.40), all dated the run day. The second receipt stays undeposited.
const SEED_DEPOSIT_ID = 'seeddeposit0001'

function runDay(): string {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Stands in for the server's posting of a sales receipt, as far as a seed reads it back:
// the entry, its debit line on the receipt's Deposit to account and the receipt's total.
function postSalesReceipts(
    name: string,
    row: Record<string, unknown>,
    store: Store,
    rowsOf: RowsOf
): void {
    if (name !== 'books_sales_receipts' || row.status !== 'posted' || row.entry) return
    const id = String(row.id)
    const total = rowsOf('books_sales_receipt_lines')
        .filter(line => line.sales_receipt === id)
        .reduce((sum, line) => sum + Number(line.quantity) * Number(line.rate), 0)
    const entry = `je${id.slice(2)}`
    store('books_journal_entries', {
        id: entry,
        status: 'posted',
        doc_type: 'sales_receipt',
        origin: 'document',
        document: id,
        date: row.date,
    })
    store('books_journal_lines', {
        id: `jl${id.slice(2)}`,
        entry,
        account: row.deposit_to,
        debit: total,
        credit: 0,
        position: 0,
    })
    store(name, { ...row, id, entry, total })
}

describe('seedDeposits', () => {
    it('seeds 4900 Interest earned and 6300 Bank charges and fees, both active', () => {
        expect(SEED_ACCOUNTS.find(account => account.number === '4900')).toMatchObject({
            name: 'Interest earned',
            type: 'other_income',
            detail_type: 'interest_earned',
        })
        expect(SEED_ACCOUNTS.find(account => account.number === '6300')).toMatchObject({
            name: 'Bank charges and fees',
            type: 'expense',
            detail_type: 'bank_charges',
        })
        for (const number of ['4900', '6300']) {
            expect(
                SEED_ACCOUNTS.find(account => account.number === number)?.inactive ?? false,
                number
            ).toBe(false)
        }
    })

    it('runs after the sales receipts in the seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const receipts = body.indexOf('seedSalesReceipts(')
        const deposits = body.indexOf('seedDeposits(')
        expect(receipts).toBeGreaterThan(-1)
        expect(deposits).toBeGreaterThan(receipts)
    })

    it('posts two receipts to 1200, then posts seeddeposit0001 holding the first plus $12.40 of interest, all dated today', async () => {
        const seedDeposits = (seedModule as Record<string, unknown>).seedDeposits
        expect(typeof seedDeposits).toBe('function')
        if (typeof seedDeposits !== 'function') return
        const { pb, writes } = servedPb(postSalesReceipts)
        const accounts = seededAccounts()
        // The first seeded sales receipt, as seedSalesReceipts leaves it.
        const firstFixture = SALES_RECEIPT_SEED_IDS[0]
        const firstLines = SALES_RECEIPT_LINES.filter(line => line.sales_receipt === firstFixture)
        const first = await pb.collection('books_sales_receipts').create({
            customer: 'custharborvw001',
            status: 'posted',
            deposit_to: accounts.get('1200'),
            payment_method: 'check',
        })
        for (const line of firstLines) {
            await pb
                .collection('books_sales_receipt_lines')
                .create({ ...line, id: undefined, sales_receipt: first.id })
        }
        const salesReceiptIds = new Map([[firstFixture, first.id]])
        const before = writes.length
        await seedDeposits(pb, { user: USER }, accounts, salesReceiptIds)
        const seeded = writes.slice(before)
        const today = runDay()
        const day = (value: unknown) => String(value).slice(0, 10)

        const receipts = seeded.filter(
            w => w.collection === 'books_sales_receipts' && w.op === 'create'
        )
        expect(
            receipts.map(w => ({
                customer: w.data.customer,
                status: w.data.status,
                deposit_to: w.data.deposit_to,
                payment_method: w.data.payment_method,
                date: day(w.data.date),
            }))
        ).toEqual(
            DEPOSIT_SEED.receipts.map(receipt => ({
                customer: 'custharborvw001',
                status: 'draft',
                deposit_to: accounts.get('1200'),
                payment_method: receipt.payment_method,
                date: today,
            }))
        )
        const products = new Set(firstLines.map(line => line.product).filter(id => id !== ''))
        const receiptTotals = receipts.map(receipt => {
            const lines = seeded.filter(
                w =>
                    w.collection === 'books_sales_receipt_lines' &&
                    w.data.sales_receipt === receipt.id
            )
            expect(lines, `the lines of receipt ${receipt.id}`).toHaveLength(1)
            const line = lines[0]?.data ?? {}
            expect(line.kind).toBe('item')
            expect(products.has(String(line.product)), String(line.product)).toBe(true)
            // No sales tax: the total is the line's amount.
            expect(Boolean(receipt.data.tax_rate) && line.taxable === true).toBe(false)
            return Number(line.quantity) * Number(line.rate)
        })
        expect(receiptTotals).toEqual(DEPOSIT_SEED.receipts.map(receipt => receipt.amount))
        expect(receipts.map(w => finalStatus(writes, 'books_sales_receipts', w.id))).toEqual([
            'posted',
            'posted',
        ])

        const deposits = seeded.filter(w => w.collection === 'books_deposits' && w.op === 'create')
        expect(deposits.map(w => w.id)).toEqual([SEED_DEPOSIT_ID])
        const deposit = deposits[0]
        if (!deposit) return
        expect(deposit.data).toMatchObject({
            status: 'draft',
            deposit_to: accounts.get('1000'),
            memo: DEPOSIT_SEED.deposit.memo,
        })
        expect(day(deposit.data.date)).toBe(today)

        // The item is the first new receipt's line on 1200, the one the server's posting
        // wrote; the second receipt's line is held by no item.
        const heldLine = `jl${String(receipts[0]?.id).slice(2)}`
        const items = seeded.filter(w => w.collection === 'books_deposit_items')
        expect(items.map(w => [w.op, w.data.deposit, w.data.line])).toEqual([
            ['create', SEED_DEPOSIT_ID, heldLine],
        ])
        const lines = seeded.filter(w => w.collection === 'books_deposit_lines')
        expect(lines.map(w => [w.op, w.data])).toEqual([
            [
                'create',
                expect.objectContaining({
                    deposit: SEED_DEPOSIT_ID,
                    account: accounts.get(DEPOSIT_SEED.deposit.line.accountNumber),
                    description: DEPOSIT_SEED.deposit.line.description,
                    amount: DEPOSIT_SEED.deposit.line.amount,
                }),
            ],
        ])
        // The bank line the server posts is the held receipt plus the other funds line.
        expect((receiptTotals[0] ?? 0) + Number(lines[0]?.data.amount)).toBe(19_240)

        // Posted after its item and its line, after both receipts were posted.
        expect(finalStatus(writes, 'books_deposits', SEED_DEPOSIT_ID)).toBe('posted')
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const post = writes.find(
            w =>
                w.collection === 'books_deposits' &&
                w.id === SEED_DEPOSIT_ID &&
                w.data.status === 'posted'
        )
        expect(at(post)).toBeGreaterThan(at(items[0]))
        expect(at(post)).toBeGreaterThan(at(lines[0]))
        const receiptPosts = receipts.map(receipt =>
            writes.find(
                w =>
                    w.collection === 'books_sales_receipts' &&
                    w.id === receipt.id &&
                    w.data.status === 'posted'
            )
        )
        expect(at(items[0])).toBeGreaterThan(at(receiptPosts[0]))
    })
})

// Statements spec §4.7 (seed): two unsent statements of Harborview Kitchen, stored
// through the collection's create, in their own block after every other seed. The server
// sets the number, the sequence, the balance, the currency and the sent fields.
const STATEMENT_SERVER_FIELDS = ['number', 'sequence', 'balance', 'currency', 'sent_at', 'sent_to']

describe('seedStatements', () => {
    it('is the last seed call of the seed body', () => {
        const source = readFileSync(seedPath, 'utf8')
        const start = source.indexOf('export default async function seed(')
        const body = source.slice(start, source.indexOf('\n}\n', start))
        const calls = [...body.matchAll(/\bseed[A-Z]\w*\(/g)].map(match => match[0])
        expect(calls.at(-1)).toBe('seedStatements(')
    })

    it('creates one statement per STATEMENT_SEED row and sends no server-set field', async () => {
        const seedStatements = (seedModule as Record<string, unknown>).seedStatements
        expect(typeof seedStatements).toBe('function')
        if (typeof seedStatements !== 'function') return
        const { pb, writes } = recordingPb()
        const customerIds = new Map(
            CUSTOMERS.map((row, i) => [row.id, `cust${String(i).padStart(11, '0')}`])
        )
        await seedStatements(pb, customerIds)

        const statements = writes.filter(w => w.collection === 'books_statements')
        expect(statements.map(w => w.op)).toEqual(['create', 'create'])
        expect(statements.map(w => w.data)).toEqual(
            STATEMENT_SEED.map(row => ({ ...row, customer: customerIds.get(row.customer) }))
        )
        for (const write of statements) {
            for (const field of STATEMENT_SERVER_FIELDS)
                expect(write.data).not.toHaveProperty(field)
        }
    })
})

// Reconcile spec §4 "Fixture and seed" (settled difference 10): four entries of its own on
// 1010 Business Savings (debit 1010, credit 3000 Owner's Equity), a finished reconciliation
// that clears the first two, and one in progress that clears the third and leaves the
// fourth. All through the collection API, so the Go hooks stamp the server fields; the
// reconciliations have fixed ids, which is how a second run knows it ran.
type SeedReconcile = (
    pb: PocketBase,
    ctx: { user: typeof USER },
    accountIds: Map<string, string>
) => Promise<void>

// The General Ledger's long section (seedLongSection, which runs before seedReconcile): two
// posted "Daily sweep" entries of 130 one-dollar debits to 1010 Business Savings and one
// credit to 3000 Owner's Equity each. The finished seed reconciliation clears its 260 lines
// on 1010 too (checkpoint 4 driver decision 1), so the reconciliation in progress opens on
// its own rows.
const SWEEP = GENERAL_LEDGER_LONG_SECTION
const SWEEP_CENTS = SWEEP.dates.length * SWEEP.linesPerEntry * SWEEP.cents

// A servedPb that holds the long section's entries and lines as the earlier seed step left
// them, with their writes taken out of `writes`. Returns the ids of the sweep lines on 1010
// and of the equity lines.
async function sweptPb(accounts: Map<string, string>) {
    const served = servedPb()
    const { pb, writes } = served
    const savings = accounts.get('1010')
    const equity = accounts.get('3000')
    const sweepLines: string[] = []
    const equityLines: string[] = []
    for (const date of SWEEP.dates) {
        const entry = await pb.collection('books_journal_entries').create({
            date,
            memo: SWEEP.memo,
            status: 'draft',
            doc_type: 'journal',
            origin: 'manual',
            created_by: USER.id,
        })
        for (let position = 0; position < SWEEP.linesPerEntry; position++) {
            const line = await pb.collection('books_journal_lines').create({
                entry: entry.id,
                account: savings,
                debit: SWEEP.cents,
                credit: 0,
                position,
            })
            sweepLines.push(line.id)
        }
        const offset = await pb.collection('books_journal_lines').create({
            entry: entry.id,
            account: equity,
            debit: 0,
            credit: SWEEP.linesPerEntry * SWEEP.cents,
            position: SWEEP.linesPerEntry,
        })
        equityLines.push(offset.id)
        await pb.collection('books_journal_entries').update(entry.id, {
            status: 'posted',
            posted_by: USER.id,
            revision: 1,
        })
    }
    writes.splice(0)
    return { ...served, sweepLines, equityLines }
}

const RECONCILE_STAMPED = [
    'beginning_balance',
    'cleared_out',
    'cleared_in',
    'cleared_out_count',
    'cleared_in_count',
    'created_by',
    'finished_by',
    'finished_at',
    'currency',
]

describe('seedReconcile', () => {
    it('runs after the bank match seed', () => {
        const source = readFileSync(seedPath, 'utf8')
        const body = source.slice(source.indexOf('export default async function seed('))
        const bankMatch = body.indexOf('seedBankMatch(')
        expect(bankMatch).toBeGreaterThan(-1)
        expect(body.indexOf('seedReconcile(')).toBeGreaterThan(bankMatch)
    })

    it('has four seed entries and two fixed 15-character reconciliation ids', () => {
        const seed = RECONCILE_SEED as unknown as {
            entries: { date: string; memo: string; amount: number }[]
            finished: { id: string; clears: number[] }
            inProgress: { id: string; statement_balance: number; clears: number[] }
        }
        expect(seed.entries).toHaveLength(4)
        expect(seed.entries[3]).toEqual({
            date: '2026-09-25',
            memo: 'Reconcile seed: fee refund',
            amount: 1_500,
        })
        expect(seed.finished.id).toMatch(/^[a-z0-9]{15}$/)
        expect(seed.inProgress.id).toMatch(/^[a-z0-9]{15}$/)
        expect(seed.inProgress.id).not.toBe(seed.finished.id)
        expect(seed.finished.clears).toEqual([0, 1])
        expect(seed.inProgress.clears).toEqual([2])
        expect(seed.inProgress.statement_balance).toBe(252_343 + SWEEP_CENTS)
    })

    it('the stamped figures balance with the sweep lines: the finish at $0.00, the one in progress $15.00 off', () => {
        const seed = RECONCILE_SEED as unknown as {
            entries: { amount: number }[]
            finished: { statement_balance: number; clears: number[] }
            inProgress: { statement_balance: number; clears: number[] }
        }
        expect(SWEEP_CENTS).toBe(26_000)
        const amount = (index: number) => seed.entries[index]?.amount ?? Number.NaN
        // From a beginning balance of 0, the finish clears the sweep and the first two entries.
        const finishedCleared =
            SWEEP_CENTS + seed.finished.clears.reduce((sum, i) => sum + amount(i), 0)
        expect(seed.finished.statement_balance).toBe(finishedCleared)
        expect(seed.finished.statement_balance).toBe(250_412 + SWEEP_CENTS)
        // The one in progress begins at the finished balance and clears the third entry; the
        // fourth, the fee refund of $15.00, is the difference.
        const progressCleared =
            seed.finished.statement_balance +
            seed.inProgress.clears.reduce((sum, i) => sum + amount(i), 0)
        expect(seed.inProgress.statement_balance - progressCleared).toBe(amount(3))
        expect(amount(3)).toBe(1_500)
    })

    it('the finished reconciliation clears the 260 sweep lines on 1010 too, and only those', async () => {
        const seedReconcile = (seedModule as Record<string, unknown>).seedReconcile as
            | SeedReconcile
            | undefined
        expect(typeof seedReconcile).toBe('function')
        if (typeof seedReconcile !== 'function') return
        const seed = RECONCILE_SEED as unknown as {
            entries: { amount: number }[]
            finished: { id: string; statement_balance: number }
            inProgress: { id: string }
        }
        const accounts = seededAccounts()
        const { pb, writes, sweepLines, equityLines } = await sweptPb(accounts)
        expect(sweepLines).toHaveLength(260)
        await seedReconcile(pb, { user: USER }, accounts)

        const cleared = writes.filter(
            w => w.collection === 'books_reconciliation_lines' && w.op === 'create'
        )
        const ofFinished = cleared
            .filter(w => w.data.reconciliation === seed.finished.id)
            .map(w => String(w.data.line))
        for (const line of sweepLines) expect(ofFinished).toContain(line)
        expect(ofFinished).toHaveLength(sweepLines.length + 2)
        expect(new Set(ofFinished).size).toBe(ofFinished.length)
        for (const line of equityLines) expect(ofFinished).not.toContain(line)
        const ofProgress = cleared
            .filter(w => w.data.reconciliation === seed.inProgress.id)
            .map(w => String(w.data.line))
        expect(ofProgress).toHaveLength(1)
        for (const line of sweepLines) expect(ofProgress).not.toContain(line)

        // The finished statement balance is the debits it clears (beginning balance 0).
        const lineDebit = new Map<string, number>()
        for (const w of writes) {
            if (w.collection === 'books_journal_lines' && w.op === 'create') {
                lineDebit.set(w.id, Number(w.data.debit))
            }
        }
        const sweepDebit = new Map(sweepLines.map(line => [line, SWEEP.cents]))
        const clearedDebits = ofFinished.reduce(
            (sum, line) => sum + (lineDebit.get(line) ?? sweepDebit.get(line) ?? Number.NaN),
            0
        )
        expect(clearedDebits).toBe(seed.finished.statement_balance)

        // Every clear of the finished reconciliation comes before its finish.
        const finish = writes.findIndex(
            w =>
                w.collection === 'books_reconciliations' &&
                w.op === 'update' &&
                w.id === seed.finished.id &&
                w.data.status === 'finished'
        )
        expect(finish).toBeGreaterThan(-1)
        const lastFinishedClear = Math.max(
            ...cleared
                .filter(w => w.data.reconciliation === seed.finished.id)
                .map(w => writes.indexOf(w))
        )
        expect(lastFinishedClear).toBeLessThan(finish)
    })

    it('posts the four entries, finishes one reconciliation over the first two and leaves one in progress over the third', async () => {
        const seedReconcile = (seedModule as Record<string, unknown>).seedReconcile as
            | SeedReconcile
            | undefined
        expect(typeof seedReconcile).toBe('function')
        if (typeof seedReconcile !== 'function') return
        const seed = RECONCILE_SEED as unknown as {
            entries: { date: string; memo: string; amount: number }[]
            finished: { id: string; statement_date: string; statement_balance: number }
            inProgress: { id: string; statement_date: string; statement_balance: number }
        }
        const accounts = seededAccounts()
        const { pb, writes, sweepLines } = await sweptPb(accounts)
        const savings = accounts.get('1010')
        const equity = accounts.get('3000')
        await seedReconcile(pb, { user: USER }, accounts)

        const entries = writes.filter(
            w => w.collection === 'books_journal_entries' && w.op === 'create'
        )
        expect(entries.map(w => [w.data.date, w.data.memo])).toEqual(
            seed.entries.map(entry => [entry.date, entry.memo])
        )
        const lines = writes.filter(
            w => w.collection === 'books_journal_lines' && w.op === 'create'
        )
        const savingsLines = entries.map((entry, i) => {
            const amount = seed.entries[i]?.amount
            const ofEntry = lines.filter(w => w.data.entry === entry.id)
            expect(ofEntry.map(w => [w.data.account, w.data.debit, w.data.credit])).toEqual([
                [savings, amount, 0],
                [equity, 0, amount],
            ])
            expect(finalStatus(writes, 'books_journal_entries', entry.id)).toBe('posted')
            return ofEntry.find(w => w.data.account === savings)?.id
        })

        const recs = writes.filter(w => w.collection === 'books_reconciliations')
        expect(recs.map(w => [w.op, w.id])).toEqual([
            ['create', seed.finished.id],
            ['update', seed.finished.id],
            ['create', seed.inProgress.id],
        ])
        expect(recs[0]?.data).toMatchObject({
            id: seed.finished.id,
            account: savings,
            statement_date: seed.finished.statement_date,
            statement_balance: seed.finished.statement_balance,
            status: 'in_progress',
        })
        expect(recs[1]?.data).toMatchObject({ status: 'finished' })
        expect(recs[2]?.data).toMatchObject({
            id: seed.inProgress.id,
            account: savings,
            statement_date: '2026-09-30',
            statement_balance: 252_343 + SWEEP_CENTS,
            status: 'in_progress',
        })
        // The seed writes as superuser, and stampActor keeps a superuser's
        // value, so the seed names its user as the starter and the finisher.
        expect(recs[0]?.data.created_by).toBe(USER.id)
        expect(recs[2]?.data.created_by).toBe(USER.id)
        expect(recs[1]?.data.finished_by).toBe(USER.id)
        const sentActor: Record<number, string> = {
            0: 'created_by',
            1: 'finished_by',
            2: 'created_by',
        }
        recs.forEach((write, i) => {
            for (const field of RECONCILE_STAMPED) {
                if (field !== sentActor[i]) expect(write.data).not.toHaveProperty(field)
            }
        })

        const cleared = writes.filter(w => w.collection === 'books_reconciliation_lines')
        const ofEntries = cleared.filter(w => !sweepLines.includes(String(w.data.line)))
        expect(ofEntries.map(w => [w.op, w.data.reconciliation, w.data.line])).toEqual([
            ['create', seed.finished.id, savingsLines[0]],
            ['create', seed.finished.id, savingsLines[1]],
            ['create', seed.inProgress.id, savingsLines[2]],
        ])
        expect(cleared).toHaveLength(sweepLines.length + 3)
        for (const write of cleared) {
            for (const field of ['account', 'entry', 'date', 'debit', 'credit', 'finished']) {
                expect(write.data).not.toHaveProperty(field)
            }
        }
        const at = (w: Write | undefined) => (w ? writes.indexOf(w) : -1)
        const lastPost = Math.max(
            ...entries.map(entry =>
                at(
                    writes.find(
                        w =>
                            w.collection === 'books_journal_entries' &&
                            w.id === entry.id &&
                            w.data.status === 'posted'
                    )
                )
            )
        )
        expect(at(recs[0])).toBeGreaterThan(lastPost)
        expect(at(ofEntries[1])).toBeLessThan(at(recs[1]))
        expect(at(recs[1])).toBeLessThan(at(recs[2]))
        expect(at(recs[2])).toBeLessThan(at(ofEntries[2]))
    })

    it('creates nothing on a second run', async () => {
        const seedReconcile = (seedModule as Record<string, unknown>).seedReconcile as
            | SeedReconcile
            | undefined
        expect(typeof seedReconcile).toBe('function')
        if (typeof seedReconcile !== 'function') return
        const accounts = seededAccounts()
        const { pb, writes } = await sweptPb(accounts)
        await seedReconcile(pb, { user: USER }, accounts)
        const before = writes.length
        expect(before).toBeGreaterThan(0)
        await seedReconcile(pb, { user: USER }, accounts)
        expect(writes.slice(before)).toEqual([])
    })
})
