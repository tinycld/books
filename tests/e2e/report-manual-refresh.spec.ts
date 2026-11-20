import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { createAccount, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    figureDigits,
    holdReportRuns,
    MANUAL_NOTE,
    manualBand,
    nextReportRun,
    openBooksReports,
    openEntriesFromSidebar,
    openTransactionDetail,
    postEntryOn,
    snapshotWhen,
    tdLinesOf,
    tdSnapshot,
    tdSubtotalOf,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// A report that reads every journal line is not live (report engine scale, the human's
// decision of 2026-11-20): it shows a note and Refresh, and new postings show only after
// Refresh. The report here is Transaction Detail by Account; each of the other five
// (General Ledger, Trial Balance, Balance Sheet, Journal, Profit and Loss by Month) is
// the same core band, and four of them press Refresh in their own spec. The report that
// stays live and has no band is pinned in profit-and-loss.spec.ts ("the open report
// re-runs on a post from another page") and, beside a panel that is not live, in
// report-drill-panel.spec.ts.
//
// The phone test runs the builder's Preview: on a phone the builder is a sheet that
// draws its own preview (core SheetSurface), so its band is other code than the
// report's. The report's own band is the same code at every width, so it has no phone
// run.

const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const JOURNAL_LINES_SOURCE = 'books.journal_lines'
const REFRESHING = 'Refreshing…'
const UPDATING = 'Updating…'

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

test.describe('report-manual-refresh', () => {
    test('a report that is not live shows the note, and Refresh by press and by the R key brings in new postings', async ({
        page,
        browser,
    }) => {
        await startBooks(page)
        const expense = uniqueName('RMR expense')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        const today = await browserToday(page)

        await openTransactionDetail(page, { accounts: [expense] })
        await expect(page.getByTestId('report-param-accounts')).toContainText(expense)
        await expect(page.getByTestId('report-empty-message')).toBeVisible()
        const { band, note, refresh } = manualBand(page)
        await expect(band).toBeVisible()
        await expect(note).toHaveText(MANUAL_NOTE)
        await expect(refresh).toBeEnabled()
        await page.evaluate(() => {
            ;(window as unknown as { rmrNotReloaded?: boolean }).rmrNotReloaded = true
        })

        // A second browser context signed in as the same user posts through its own
        // session. postEntryOn returns when the server has numbered the entry.
        const otherContext = await browser.newContext()
        try {
            const other = await otherContext.newPage()
            await startBooks(other)
            await openEntriesFromSidebar(other)
            await postEntryOn(other, {
                date: today,
                memo: uniqueName('RMR first'),
                lines: [
                    { account: expense, debit: '21.00' },
                    { account: ACCOUNT_LABELS.checking, credit: '21.00' },
                ],
            })

            // The press starts a run: while it is held the button is off and says so,
            // and the header says "Updating…".
            const release = await holdReportRuns(page)
            try {
                await refresh.click()
                await expect(refresh).toBeDisabled()
                await expect(refresh).toContainText(REFRESHING)
                await expect(page.getByTestId('report-updating')).toHaveText(UPDATING)
            } finally {
                release()
                await page.unrouteAll({ behavior: 'wait' })
            }
            const first = await snapshotWhen(
                page,
                tdSnapshot,
                s => tdLinesOf(s, expense).length === 1 && tdSubtotalOf(s, expense) !== undefined,
                `${expense}'s first line after the Refresh press`
            )
            expect(figureDigits(tdLinesOf(first, expense)[0].cells.amount)).toBe('21.00')
            await expect(refresh).toBeEnabled()
            await expect(refresh).not.toContainText(REFRESHING)
            await expect(page.getByTestId('report-updating')).toHaveCount(0)
            await expect(note).toHaveText(MANUAL_NOTE)

            await postEntryOn(other, {
                date: today,
                memo: uniqueName('RMR second'),
                lines: [
                    { account: expense, debit: '9.00' },
                    { account: ACCOUNT_LABELS.checking, credit: '9.00' },
                ],
            })
        } finally {
            await otherContext.close()
        }

        // The key R, with no modifier, runs the report as the press does. Only the
        // reader's own Refresh makes the button read "Refreshing…" (a run that another
        // worker's share starts does not), so the held run proves the key started it.
        const releaseKey = await holdReportRuns(page)
        try {
            await page.keyboard.press('r')
            await expect(refresh).toBeDisabled()
            await expect(refresh).toContainText(REFRESHING)
        } finally {
            releaseKey()
            await page.unrouteAll({ behavior: 'wait' })
        }
        const second = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 2,
            `${expense}'s second line after the R key`
        )
        expect(figureDigits(tdSubtotalOf(second, expense)?.cells.amount)).toBe('30.00')
        const notReloaded = await page.evaluate(
            () => (window as unknown as { rmrNotReloaded?: boolean }).rmrNotReloaded
        )
        expect(notReloaded).toBe(true)
    })

    test('on a phone the Preview of a draft over journal lines shows the note, and Refresh runs the draft again', async ({
        page,
    }) => {
        await startBooks(page)
        // navigateToPackage and the Books sidebar are the desktop layout's: the hub is
        // opened at the default viewport, then the window becomes a phone.
        await openBooksReports(page)
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('reports-hub')).toBeVisible()

        await page.getByTestId('reports-hub-new').click()
        await page.getByTestId(`reports-new-source-${JOURNAL_LINES_SOURCE}`).click()
        const builder = page.getByTestId('report-builder')
        await expect(builder).toBeVisible()
        await expect(builder.getByTestId('report-builder-mode-design')).toBeVisible()
        await builder.getByTestId('report-builder-mode-preview').click()

        const note = builder.getByTestId('report-builder-manual-note')
        const refresh = builder.getByTestId('report-builder-refresh')
        await expect(builder.getByTestId('report-builder-manual-band')).toBeVisible()
        await expect(note).toHaveText(MANUAL_NOTE)
        await expect(builder.getByTestId('report-table')).toBeVisible()
        await expect(refresh).toBeEnabled()

        // The band fits the phone: the note sits beside the button, and neither is cut. It
        // does not check how the note wraps.
        await expect
            .poll(async () => {
                const noteBox = await note.boundingBox()
                const buttonBox = await refresh.boundingBox()
                if (!noteBox || !buttonBox) return null
                return {
                    noteInView: noteBox.x >= 0,
                    buttonInView: buttonBox.x + buttonBox.width <= PHONE.width,
                    apart: noteBox.x + noteBox.width <= buttonBox.x,
                }
            })
            .toEqual({ noteInView: true, buttonInView: true, apart: true })

        const release = await holdReportRuns(page)
        try {
            const [request] = await Promise.all([nextReportRun(page), refresh.click()])
            await expect(refresh).toBeDisabled()
            await expect(refresh).toContainText(REFRESHING)
            await expect(builder.getByTestId('report-updating')).toHaveText(UPDATING)
            // The source shows the run is the draft's; the disabled and "Refreshing…"
            // assertions prove the press started it (a refetch of the Preview sends the
            // same body).
            const body = request.postDataJSON() as { spec?: { source?: string } }
            expect(body.spec?.source).toBe(JOURNAL_LINES_SOURCE)
        } finally {
            release()
            await page.unrouteAll({ behavior: 'wait' })
        }
        await expect(refresh).toBeEnabled()
        await expect(refresh).not.toContainText(REFRESHING)
        await expect(builder.getByTestId('report-updating')).toHaveCount(0)
        await expect(note).toHaveText(MANUAL_NOTE)
        await expect(builder.getByTestId('report-table')).toBeVisible()
    })
})
