import { expect, type Page } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import { AUDIT_LOG_TITLE } from '~/tinycld/books/lib/audit-log-fixture'
import { openBooksReports } from './books-report-helpers'

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
