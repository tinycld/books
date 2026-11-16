import { expect, type Locator, type Page } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import { AUDIT_LOG_TITLE } from '~/tinycld/books/lib/audit-log-fixture'
import { PRODUCT_IDS, PRODUCTS } from '~/tinycld/books/lib/products-services-fixture'
import { openBooksReports } from './books-report-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
} from './invoice-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'

// A seeded active product an invoice line can take (invoice-form-post.spec.ts uses it too).
function invoiceProduct(): string {
    const product = PRODUCTS.find(p => p.id === PRODUCT_IDS.accessPoint)
    if (!product) throw new Error(`no seeded product ${PRODUCT_IDS.accessPoint} in the fixture`)
    return product.name
}

const PHONE = { width: 390, height: 844 }
const WIDE = { width: 1280, height: 800 }

// Shared steps of the audit-log e2e specs (spec §6). The Audit Log runs in core's report
// view; a row is labelled by its Date changed and holds the cells user, event, type and
// record (server/report_audit_log.go).

// One detail row of the Audit Log as the screen draws it.
export type AuditRowText = {
    // The row's id in core's table (d:<audit row id>).
    id: string
    // The Date changed, in the reader's zone.
    label: string
    user: string
    event: string
    type: string
    record: string
}

// The shipped Audit Log from the Books hub, reached through the viewer share Books keeps on
// every shipped Books report (openSalesTaxLiability's pattern). Waits for its table.
export async function openAuditLog(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, AUDIT_LOG_TITLE).click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-table')).toBeVisible()
}

// Every mounted detail row of the report table, top to bottom, read in ONE pass so no
// re-render lands between two reads. Core's wrapping cell draws a zero-width space after
// each colon (core reports/lib/text-width.ts) so a long label can break there; the text
// returned here has those removed, so callers compare plain labels.
export function auditRows(page: Page): Promise<AuditRowText[]> {
    return page.evaluate(() => {
        const table = document.querySelector('[data-testid="report-table"]')
        if (!table) return []
        // Written by its code point: a literal zero-width space is invisible in review.
        const zeroWidthSpace = new RegExp(String.fromCharCode(0x200b), 'g')
        const textOf = (element: Element | null) =>
            ((element as HTMLElement | null)?.innerText ?? '').replace(zeroWidthSpace, '').trim()
        const cell = (column: string, id: string) =>
            textOf(table.querySelector(`[data-testid="report-cell-${column}-${id}"]`))
        return [...table.querySelectorAll('[data-testid^="report-row-d:"]')]
            .map(element => ({
                id: (element.getAttribute('data-testid') ?? '').slice('report-row-'.length),
                label: textOf(element),
                top: element.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
            .map(({ id, label }) => ({
                id,
                label,
                user: cell('user', id),
                event: cell('event', id),
                type: cell('type', id),
                record: cell('record', id),
            }))
    })
}

// Polls the rows until one has this record and event, and returns it. The report is live:
// a change made elsewhere reaches it with no reload.
export async function waitForAuditRow(
    page: Page,
    match: { record: string; event: string }
): Promise<AuditRowText> {
    const found: { row: AuditRowText | undefined } = { row: undefined }
    await expect
        .poll(
            async () => {
                found.row = (await auditRows(page)).find(
                    row => row.record === match.record && row.event === match.event
                )
                return found.row !== undefined
            },
            { message: `an Audit Log row "${match.record}" · ${match.event}` }
        )
        .toBe(true)
    if (!found.row) throw new Error(`no Audit Log row "${match.record}" · ${match.event}`)
    return found.row
}

// Waits for the row with this record and event, presses its Date changed link (the row's
// label, core `report-row-<row id>`) and waits for the record's history as a screen:
// `history-screen` on top and the URL `books/history/<collection>/<id>`.
export async function openHistoryFromRow(
    page: Page,
    match: { record: string; event: string }
): Promise<void> {
    const row = await waitForAuditRow(page, match)
    await page.getByTestId(`report-row-${row.id}`).click()
    await expect(page.getByTestId('history-screen').filter({ visible: true })).toBeVisible()
    await expect(page).toHaveURL(/\/books\/history\/books_[a-z_]+\/[a-z0-9]{15}$/)
}

// Opens the shown More trigger of a record screen (a covered screen stays mounted, hidden)
// and returns the open menu's rows, top to bottom.
export async function openMoreMenu(page: Page, moreTestId: string): Promise<Locator> {
    const trigger = page.getByTestId(moreTestId).filter({ visible: true })
    await expect(trigger, `the ${moreTestId} trigger`).toBeVisible()
    await trigger.click()
    const items = page.getByRole('menuitem')
    await expect(items.first()).toBeVisible()
    return items
}

// Presses the open More menu's Audit history row and waits for the record's history as
// its own screen: the URL `books/history/<collection>/<id>` and, when given, its title.
export async function openHistoryFromMore(
    page: Page,
    historyTestId: string,
    record: { collection: string; id: string; title?: string }
): Promise<void> {
    await page.getByTestId(historyTestId).click()
    await expect(page).toHaveURL(new RegExp(`/books/history/${record.collection}/${record.id}$`))
    await expect(page.getByTestId('history-screen').filter({ visible: true })).toBeVisible()
    if (record.title === undefined) return
    await expect(page.getByTestId('history-title').filter({ visible: true })).toHaveText(
        record.title
    )
}

// Books must be open. Posts a new invoice for this customer with one seeded product line
// and this memo, and leaves the page on its read view; returns its id and number.
export async function postInvoiceFor(
    page: Page,
    customer: string,
    memo: string
): Promise<{ id: string; number: string }> {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, customer)
    await pickLineProduct(page, 0, invoiceProduct())
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    const title = page.getByTestId('invoice-title')
    await expect(title).toHaveText(/^Invoice \d+$/)
    const text = await title.innerText()
    const number = /^Invoice (\d+)$/.exec(text)?.[1]
    if (!number) throw new Error(`no invoice number in the title "${text}"`)
    return { id: invoiceIdFromUrl(page), number }
}

// The id of the record whose screen is open, read from the URL's last segment.
export function openRecordId(page: Page): string {
    const id = /\/([a-z0-9]{15})$/.exec(new URL(page.url()).pathname)?.[1]
    if (!id) throw new Error(`no record id at the end of ${page.url()}`)
    return id
}

// The record's read view (or saved draft) is open at 1280. At a phone width its More holds
// the rows the wide bar shows as buttons, then Audit history last, which opens the record's
// history as a screen; Back returns to the record, and the page is set to 1280 again.
export async function expectPhoneMoreHistory(
    page: Page,
    more: { trigger: string; history: string; before: (string | RegExp)[] },
    record: { collection: string; id: string; title?: string }
): Promise<void> {
    await page.setViewportSize(PHONE)
    const items = await openMoreMenu(page, more.trigger)
    await expect(items).toHaveText([...more.before, /Audit history/])
    await openHistoryFromMore(page, more.history, record)
    await page.getByTestId('history-back').filter({ visible: true }).click()
    await expect(page).not.toHaveURL(/\/books\/history\//)
    await page.setViewportSize(WIDE)
}

// Books must be open. Finds the entry with this memo through the entries list search and
// opens it by its row.
export async function openEntryFromList(page: Page, memo: string, id: string): Promise<void> {
    await openEntriesList(page)
    await searchEntries(page, memo)
    await page.getByTestId(`entries-row-${id}`).click()
    await expect(page).toHaveURL(new RegExp(`/books/entries/${id}$`))
}

// The events of the history on screen, newest first.
export function historyEvents(page: Page) {
    return page
        .getByTestId('history-events')
        .filter({ visible: true })
        .locator('[data-testid^="history-event-"]')
}

// The browser's "Nov 14, 2026, 4:07 PM" for now (or `minutesAgo` minutes before now), in
// the page's own zone, as the report writes a Date changed.
export function localMinute(page: Page, minutesAgo = 0): Promise<string> {
    return page.evaluate(
        ago =>
            new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            }).format(new Date(Date.now() - ago * 60_000)),
        minutesAgo
    )
}

// The page's clock now, in ms: pass it to localMinutesSince before the writes a test checks.
export function pageNow(page: Page): Promise<number> {
    return page.evaluate(() => Date.now())
}

// Every minute from `since` (a pageNow) to now, as localMinute writes them, in one read:
// a row written between the two reads carries one of them, however long the steps took.
export function localMinutesSince(page: Page, since: number): Promise<string[]> {
    return page.evaluate(start => {
        const format = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
        const now = Date.now()
        const minutes = new Set<string>()
        for (let at = start; at < now; at += 60_000) minutes.add(format.format(new Date(at)))
        minutes.add(format.format(new Date(now)))
        return [...minutes]
    }, since)
}
