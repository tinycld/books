import { expect, type Page } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import { VENDOR_BALANCE_TITLE } from '~/tinycld/books/lib/vendor-balance-fixture'
import {
    csvRecords,
    exportReport,
    openBooksReports,
    type ReportSnapshot,
} from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'

// Steps and row readers of the Vendor Balance e2e (vendor-balance plan, checkpoint 1): they
// import the report helpers of books-report-helpers.ts and centsOf of
// customer-balance-helpers.ts, and leave each of them unchanged.

// The shipped Vendor Balance from the Books hub, reached as openApAging reaches the A/P
// Aging: Reports in the Books sidebar, then the hub row, through the viewer share Books
// keeps. It has an empty state, so the table or the empty text shows.
export async function openVendorBalance(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, VENDOR_BALANCE_TITLE).filter({
        has: page.getByText(VENDOR_BALANCE_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${VENDOR_BALANCE_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
    await expect(page.getByTestId('report-document-title').filter({ visible: true })).toHaveText(
        VENDOR_BALANCE_TITLE
    )
}

// The Balance of the vendor row labelled exactly `label`, in cents; null when the snapshot
// has no such row.
export function vendorRowCents(snapshot: ReportSnapshot, label: string): number | null {
    const row = snapshot.rows.find(r => r.kind === 'group' && r.label === label)
    if (!row) return null
    return centsOf(row.cells.balance ?? '')
}

// A CSV record of an opened line: its label starts with the line's ISO day (the detail
// label "<date> · <type> <number> · <description>").
const LINE_RECORD = /^\d{4}-\d{2}-\d{2} · /

// The records of the open report's CSV after its heading line (label, then Balance), with
// the line records taken out: the CSV opens every vendor, so each vendor record is followed
// by its lines. Core's table mounts only the rows near the viewport, so a test reads the
// whole report here.
export async function vendorBalanceCsv(page: Page): Promise<string[][]> {
    const { bytes } = await exportReport(page, 'csv')
    return csvRecords(bytes)
        .slice(1)
        .filter(record => !LINE_RECORD.test(record[0] ?? ''))
}

// The Balance of the Total row, in cents; null when the snapshot has no Total row.
export function totalCents(snapshot: ReportSnapshot): number | null {
    const row = snapshot.rows.find(r => r.kind === 'total')
    if (!row) return null
    return centsOf(row.cells.balance ?? '')
}
