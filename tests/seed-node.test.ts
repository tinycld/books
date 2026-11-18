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
import { AR_AGING_SEED } from '../tinycld/books/lib/ar-aging-fixture'
import { CUSTOMER_BALANCE_SEED } from '../tinycld/books/lib/customer-balance-fixture'
import { CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { VENDOR_REFUND_VENDOR_IDS } from '../tinycld/books/lib/vendor-refund-fixture'
import * as seedModule from '../tinycld/books/seed'
import { seedArAging } from '../tinycld/books/seed'

const packageRoot = path.resolve(__dirname, '..')
const seedPath = path.resolve(__dirname, '../tinycld/books/seed.ts')

type Write = {
    op: 'create' | 'update'
    collection: string
    id: string
    data: Record<string, unknown>
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
// server's filter does. It does not run the server's posting.
function servedPb() {
    const writes: Write[] = []
    const rows = new Map<string, Record<string, unknown>>()
    let next = 0
    const answer = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        })
    const serve = async (input: RequestInfo | URL, config?: RequestInit) => {
        const url = new URL(String(input))
        const route = /^\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?$/.exec(url.pathname)
        const name = route?.[1]
        if (!name) return answer(404, { message: `servedPb: no route ${url.pathname}` })
        const id = route[2]
        const method = config?.method ?? 'GET'
        const data: Record<string, unknown> =
            typeof config?.body === 'string' ? JSON.parse(config.body) : {}
        if (method === 'POST' && id === undefined) {
            next += 1
            const created =
                typeof data.id === 'string' ? data.id : `rec${String(next).padStart(12, '0')}`
            const row = { revision: 0, ...data, id: created }
            rows.set(`${name}/${created}`, row)
            writes.push({ op: 'create', collection: name, id: created, data })
            return answer(200, row)
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
