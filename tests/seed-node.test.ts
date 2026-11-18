// @vitest-environment node
// Core's scripts/seed-db.ts runs a package seed with tsx in plain node, while vitest
// aliases react-native to a stub. Only a real node run catches a seed graph that
// reaches react-native or core UI (for example a value import of lib/transfer.ts,
// which imports zod through @tinycld/core/ui/form), so this test spawns one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { VENDOR_REFUND_VENDOR_IDS } from '../tinycld/books/lib/vendor-refund-fixture'
import * as seedModule from '../tinycld/books/seed'

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
