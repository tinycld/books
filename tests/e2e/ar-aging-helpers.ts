import { expect, type Page } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import { AR_AGING_TITLE } from '~/tinycld/books/lib/ar-aging-fixture'
import {
    openBooksReports,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'

// Steps of the A/R Aging e2e (ar-aging plan): they import books-report-helpers.ts and
// customer-balance-helpers.ts and leave both unchanged.

// The fixed days of the e2e (plan: no document before 2026-07-01, As of set to fixed days).
// An invoice dated `invoice` and due `due` is 40 days past due on `aged40` (31 - 60), one
// day on `aged1` (1 - 30), not yet past due on `due` (Current), and not open on
// `beforeInvoice`.
export const AR_DAY = {
    invoice: '2026-09-01',
    due: '2026-10-01',
    aged40: '2026-11-10',
    aged1: '2026-10-02',
    beforeInvoice: '2026-08-31',
} as const

// The shipped A/R Aging from the Books hub, reached as openCustomerBalance reaches the
// Customer Balance: Reports in the Books sidebar, then the hub row, through the viewer share
// Books keeps. It has an empty state, so the table or the empty text shows.
export async function openArAging(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, AR_AGING_TITLE).filter({
        has: page.getByText(AR_AGING_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${AR_AGING_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// Presses the group row labelled exactly `label` (a customer or an item) and waits, in one
// snapshot, until the row right after it is one depth or more deeper: its items or lines.
export async function openAgingRow(page: Page, label: string): Promise<void> {
    await page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .filter({ has: page.getByText(label, { exact: true }) })
        .click()
    await snapshotWhen(
        page,
        reportSnapshot,
        snapshot => {
            const at = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
            const next = snapshot.rows[at + 1]
            return at >= 0 && next !== undefined && next.depth > snapshot.rows[at].depth
        },
        `the row ${label} opens`
    )
}

// The one mounted row labelled exactly `label`; throws when none or more than one.
export function agingRow(snapshot: ReportSnapshot, label: string): ReportSnapshot['rows'][number] {
    const found = snapshot.rows.filter(row => row.label === label)
    if (found.length !== 1) {
        throw new Error(
            `${found.length} rows labelled "${label}", want one; rows ${JSON.stringify(
                snapshot.rows.map(row => row.label)
            )}`
        )
    }
    return found[0]
}

export type AgedCents = Record<'current' | 'd30' | 'd60' | 'd90' | 'd91' | 'total', number | null>

// A row's five age cells and Total in cents; a blank cell is null.
export function agedCents(row: ReportSnapshot['rows'][number]): AgedCents {
    const cents = (text: string | undefined) =>
        text === undefined || text.trim() === '' ? null : centsOf(text)
    return {
        current: cents(row.cells.current),
        d30: cents(row.cells.d30),
        d60: cents(row.cells.d60),
        d90: cents(row.cells.d90),
        d91: cents(row.cells.d91),
        total: cents(row.cells.total),
    }
}
