// @vitest-environment node
// Core's scripts/seed-db.ts runs a package seed with tsx in plain node, while vitest
// aliases react-native to a stub. Only a real node run catches a seed graph that
// reaches react-native or core UI (for example a value import of lib/transfer.ts,
// which imports zod through @tinycld/core/ui/form), so this test spawns one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { AP_AGING_SEED } from '../tinycld/books/lib/ap-aging-fixture'
import { APPLY_CREDIT_SEED } from '../tinycld/books/lib/apply-credit-fixture'
import { AR_AGING_SEED } from '../tinycld/books/lib/ar-aging-fixture'
import { CUSTOMER_BALANCE_SEED } from '../tinycld/books/lib/customer-balance-fixture'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
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
import { SALES_RECEIPT_IDS } from '../tinycld/books/lib/sales-receipt-form-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
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
// each with the batch's number. It does not run the server's posting.
function servedPb() {
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
            return answer(200, row)
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
