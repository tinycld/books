import { describe, expect, it } from 'vitest'
import type { CreditApplicationRow } from '../tinycld/books/hooks/useCreditApplications'
import { creditUseRows } from '../tinycld/books/lib/credit-uses'
import { publishedRow } from './live-rows'

// A vendor credit's Applied to block (vendor refund spec §3.9): the credit's applications to
// bills and the posted vendor refunds that name it, as one list in date order. A refund and
// an application on one day keep the application first. Only an application row is
// removable: a refund is voided or edited on its own page, so its row has no Remove.
//
// Each row keeps the fields of the row it came from (its `id`, `date`, `amount`, …) and
// adds `kind` ('application' or 'refund') and `removable`.

// The hooks hand on live query rows, which carry TanStack DB's virtual props.
function application(id: string, date: string, amount: number): CreditApplicationRow {
    return publishedRow(
        {
            id,
            amount,
            date,
            documentId: `bill${id}`,
            creditId: 'creditone000001',
            documentNumber: '1003',
            creditNumber: '1002',
        },
        'books_vendor_credit_applications'
    )
}

// A posted refund's line on the credit, as useCreditRefunds gives it.
function refund(id: string, date: string, amount: number) {
    return publishedRow(
        { id, refundId: `refund${id}`, number: '1001', date, amount },
        'books_vendor_refund_lines'
    )
}

describe('creditUseRows', () => {
    it('orders applications and refunds by date, an application first on a shared day', () => {
        const applications = [
            application('app000000000001', '2026-11-10', 3_000),
            application('app000000000002', '2026-11-17', 2_000),
        ]
        const refunds = [
            refund('ref000000000001', '2026-11-05', 1_500),
            refund('ref000000000002', '2026-11-17', 5_000),
        ]
        const rows = creditUseRows(applications, refunds)
        expect(rows.map(row => [row.kind, row.id, row.date])).toEqual([
            ['refund', 'ref000000000001', '2026-11-05'],
            ['application', 'app000000000001', '2026-11-10'],
            ['application', 'app000000000002', '2026-11-17'],
            ['refund', 'ref000000000002', '2026-11-17'],
        ])
    })

    it('keeps the application first on a shared day even when the refund is listed first', () => {
        const rows = creditUseRows(
            [application('app000000000003', '2026-11-17', 2_000)],
            [refund('ref000000000003', '2026-11-17', 5_000)]
        )
        expect(rows.map(row => row.id)).toEqual(['app000000000003', 'ref000000000003'])
    })

    it('marks only applications removable', () => {
        const rows = creditUseRows(
            [application('app000000000004', '2026-11-12', 1_000)],
            [
                refund('ref000000000004', '2026-11-11', 4_000),
                refund('ref000000000005', '2026-11-13', 6_000),
            ]
        )
        expect(rows.map(row => [row.id, row.removable])).toEqual([
            ['ref000000000004', false],
            ['app000000000004', true],
            ['ref000000000005', false],
        ])
    })

    it("keeps each source row's amount", () => {
        const rows = creditUseRows(
            [application('app000000000006', '2026-11-12', 1_234)],
            [refund('ref000000000006', '2026-11-14', 5_678)]
        )
        expect(rows.map(row => [row.id, row.amount])).toEqual([
            ['app000000000006', 1_234],
            ['ref000000000006', 5_678],
        ])
    })

    it('gives refunds alone, and applications alone, in date order', () => {
        expect(
            creditUseRows(
                [],
                [
                    refund('ref000000000007', '2026-11-01', 100),
                    refund('ref000000000008', '2026-11-02', 200),
                ]
            ).map(row => [row.kind, row.id])
        ).toEqual([
            ['refund', 'ref000000000007'],
            ['refund', 'ref000000000008'],
        ])
        expect(
            creditUseRows([application('app000000000009', '2026-11-03', 300)], []).map(row => [
                row.kind,
                row.id,
            ])
        ).toEqual([['application', 'app000000000009']])
        expect(creditUseRows([], [])).toEqual([])
    })
})
