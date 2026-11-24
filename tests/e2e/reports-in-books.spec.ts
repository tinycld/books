import type { Page } from '@playwright/test'
import { expect, login, pressToolbar, rowOf, test } from '@tinycld/core/e2e-helpers'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { createAccount, DESKTOP, isPhone, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    openBooksMenu,
    openEntriesFromSidebar,
    openReportsSection,
    postEntryOn,
    pressFigure,
    sectionTopKey,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { openBooksAt, showSidebar } from './sidebar-shortcuts-helpers'

// Books' reports inside Books (unit p1-sidebar-shortcuts, added item (a)): the Reports
// section of the Books sidebar opens a report on the Books route (/a/books/reports/<id>),
// where the Books sidebar stays. Core's Reports hub stays for the full list (All reports).
// No test here writes the user's shortcut list; the report shortcut is in
// sidebar-shortcuts.spec.ts.
//
// The Save as test makes a report named "Trial Balance copy …" and keeps it. In the shared
// e2e user's hub that row would also match the specs that open "Trial Balance" by its title,
// so the test takes core's `freshMember`: a member of its own, whose reports no other user
// reads. The other tests save no report and use the shared e2e user.
//
// The phone runs: opening a report and All reports go through the drawer (different code).
// The drill, Save as and the builder run the same route code at every width and are run at
// the desktop width only; the phone drill itself is tests/e2e/report-drill-phone.spec.ts.
//
// Not covered by e2e: the note for a report of another package opened on the Books route
// (no other package's report is in the Books e2e database; tests/books-report-route.test.tsx
// holds its condition).

const BOOKS_REPORT_URL = /\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const EXPENSES = 'Expenses'
const PL_TITLE = 'Profit and Loss'

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// The report's row in the Reports section, by its exact title ("Profit and Loss by Month"
// holds "Profit and Loss").
function reportRow(page: Page, title: string) {
    return page
        .locator('[data-testid^="books-sidebar-report-"]')
        .filter({ visible: true })
        .filter({ has: page.getByText(title, { exact: true }) })
}

// Books must be open. Opens `title` from the Reports section of the Books sidebar.
async function openFromReportsSection(page: Page, title: string) {
    await showSidebar(page)
    await openReportsSection(page)
    await reportRow(page, title).click()
    await expect(page).toHaveURL(BOOKS_REPORT_URL)
    await expect(shown(page, 'report-title')).toHaveText(title)
}

function reportIdOf(page: Page): string {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

test.describe('reports-in-books: the Reports section', () => {
    for (const size of [DESKTOP, PHONE]) {
        test(`a report opens inside Books and All reports opens the hub, at ${size.width}`, async ({
            page,
        }) => {
            await login(page)
            await openBooksAt(page, size)
            await openFromReportsSection(page, 'Trial Balance')
            await expect(shown(page, 'report-table').or(shown(page, 'report-empty'))).toBeVisible()

            // The Books sidebar is still the sidebar: on a phone, the drawer of this route.
            if (isPhone(page)) await openBooksMenu(page)
            const row = reportRow(page, 'Trial Balance')
            await expect(row).toBeVisible()
            await expect(shown(page, 'books-shortcuts-customize')).toBeVisible()
            await expect(shown(page, 'books-nav-settings')).toBeVisible()

            await shown(page, 'books-sidebar-reports-all').click()
            await expect(page).toHaveURL(/\/a\/reports\?package=books/)
            await expect(page.getByTestId('reports-hub')).toBeVisible()
        })
    }
})

test.describe('reports-in-books: the Books route', () => {
    test.use({ viewport: DESKTOP })

    test('a figure opens its report on the Books route, and Back returns to the statement', async ({
        page,
    }) => {
        await login(page)
        await openBooksAt(page, DESKTOP)
        // Named from sectionTopKey, the account sorts at the top of Expenses, so its row
        // mounts when the section opens.
        const expense = uniqueName(`${sectionTopKey()} Books route expense`)
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('Books route entry'),
            lines: [
                { account: expense, debit: '41.00' },
                { account: ACCOUNT_LABELS.checking, credit: '41.00' },
            ],
        })

        await openFromReportsSection(page, PL_TITLE)
        const statementId = reportIdOf(page)
        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await expect(rowOf(page, EXPENSES)).toHaveAttribute('aria-expanded', 'false')
        await rowOf(page, EXPENSES).click()
        await expect(rowOf(page, expense)).toBeVisible()

        // 1280 px is under the side panel's width, so the figure opens a screen.
        await pressFigure(page, 'amount', expense)
        await expect(shown(page, 'report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        expect(reportIdOf(page)).not.toBe(statementId)
        await expect(shown(page, 'books-sidebar-reports-toggle')).toBeVisible()

        await expect(shown(page, 'report-back')).toHaveText(PL_TITLE)
        await shown(page, 'report-back').click()
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        expect(reportIdOf(page)).toBe(statementId)

        // After a reload the stack holds this report only: Back goes to the Books report
        // base, `/a/books/reports`. That is the Books reports screen: the user stays in
        // Books, with the Books sidebar, and core's hub does not open.
        await page.reload()
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        await shown(page, 'report-back').click()
        await expect(page).toHaveURL(/\/a\/books\/reports(\?|$)/)
        await expect(shown(page, 'books-reports-screen')).toBeVisible()
        await expect(shown(page, 'books-reports-all')).toBeVisible()
        await expect(shown(page, 'books-sidebar-reports-toggle')).toBeVisible()
        await expect(page.getByTestId('reports-hub')).toHaveCount(0)

        // The screen lists the Books reports; a row opens the report on the Books route.
        await shown(page, 'books-reports-screen').getByText(PL_TITLE, { exact: true }).click()
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        expect(reportIdOf(page)).toBe(statementId)
    })

    test('Save as opens the copy on the Books route, and builder text stays when the reports list fails and recovers', async ({
        freshMember,
    }) => {
        const { page } = freshMember
        await openBooksAt(page, DESKTOP)
        await openFromReportsSection(page, 'Trial Balance')
        const shippedId = reportIdOf(page)

        const copyTitle = uniqueName('Trial Balance copy')
        await pressToolbar(page, 'report-save-as', 'Save as…')
        const prompt = page.getByRole('textbox', { name: 'Save as', exact: true })
        await prompt.fill(copyTitle)
        await prompt.press('Enter')
        await expect(shown(page, 'report-title')).toHaveText(copyTitle)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        const copyId = reportIdOf(page)
        expect(copyId).not.toBe(shippedId)
        // The saved copy is a Books report: the section lists it.
        await expect(shown(page, `books-sidebar-report-${copyId}`)).toBeVisible()

        // Only the Books list read (it filters on `source`) fails; core's read of the one
        // report (by id) is answered. The list fails on the reload, before the builder opens.
        await page.route('**/api/collections/reports/records**', route => {
            const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
            const failing = filter.includes('source')
            return failing ? route.fulfill({ status: 400, json: {} }) : route.continue()
        })
        await page.reload()
        await expect(shown(page, 'report-title')).toHaveText(copyTitle)
        await expect(shown(page, 'books-sidebar-reports-error')).toBeVisible()

        await pressToolbar(page, 'report-edit-open', 'Edit report')
        const title = page.getByTestId('report-builder-title')
        const typed = uniqueName('Typed while the list failed')
        await title.fill(typed)

        // The list recovers: the report view under the builder is not rebuilt, so the
        // text is still there.
        await page.unrouteAll({ behavior: 'wait' })
        await shown(page, 'books-sidebar-reports-retry').click()
        await expect(shown(page, `books-sidebar-report-${copyId}`)).toBeVisible()
        await expect(shown(page, 'books-sidebar-reports-error')).toHaveCount(0)
        await expect(title).toHaveValue(typed)
    })
})
