import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP, PHONE } from './account-register-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import {
    accountIdOf,
    accountRow,
    bandFigure,
    createReconcileAccount,
    daysAgo,
    focusAccountRow,
    openReconcile,
    postDatedEntry,
    startReconciliation,
} from './reconcile-helpers'
import { openBooksPage, uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconcile spec §2 (the sidebar entry), §3 "The accounts screen", "The start dialog" and
// the work screen's header, summary band and states; §4 "Writes" (start). Each test makes
// its own account and drives every write through the UI.

const WORK_URL = /\/books\/reconcile\/[a-z0-9]{15}\/?$/

// Every request that would create a reconciliation: a POST of books_reconciliations, alone
// or inside a batch.
function startWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', request => {
        if (request.method() !== 'POST') return
        const url = request.url()
        const isBatch = url.includes('/api/batch')
        if (url.includes('/api/collections/books_reconciliations/records')) writes.push(url)
        else if (isBatch && (request.postData() ?? '').includes('books_reconciliations')) {
            writes.push(url)
        }
    })
    return writes
}

function refuseLoad(route: Route) {
    return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
    })
}

function cutRealtime(page: Page) {
    return page.route('**/api/realtime*', route => route.abort())
}

test.describe('reconcile: accounts screen and start', () => {
    test('start: the sidebar opens the accounts screen, the dialog refuses, the band shows the start', async ({
        page,
    }) => {
        const today = daysAgo(0)
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = await createReconcileAccount(page, 'cash')
        await postDatedEntry(page, {
            memo: uniqueName('Reconcile start deposit'),
            amount: '500.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: today,
        })

        await openReconcile(page)
        const id = await accountIdOf(page, name)
        const row = accountRow(page, name)
        await expect(row).toContainText('Never')
        const start = row.getByTestId(`reconcile-start-${id}`)
        await expect(start).toBeVisible()

        const writes = startWrites(page)
        await start.click()
        const dialog = page.getByTestId('reconcile-start-dialog')
        await expect(dialog).toBeVisible()
        const balance = dialog.getByTestId('reconcile-ending-balance')
        const date = dialog.getByTestId('reconcile-ending-date')
        const submit = dialog.getByTestId('reconcile-start-submit')
        await expect(balance).toBeFocused()
        // No bank connection: nothing comes from a statement file.
        await expect(balance).toHaveValue('')
        await expect(date).toHaveValue(today)
        await expect(dialog).not.toContainText('Check them against your statement.')

        // An empty balance is refused in the form; the dialog stays.
        await submit.click()
        await expect(dialog.getByTestId('reconcile-ending-balance-error')).toHaveText(
            /^Enter the statement ending balance\.?$/
        )
        await expect(dialog).toBeVisible()

        // A date after today is refused in the form.
        await balance.fill('500.00')
        await date.fill(daysAgo(-1))
        await submit.click()
        await expect(dialog).toContainText('The date cannot be after today.')
        await expect(dialog).toBeVisible()
        expect(writes).toEqual([])

        await date.fill(today)
        await submit.click()
        await expect(page).toHaveURL(WORK_URL)
        expect(writes).toHaveLength(1)
        const work = await visibleScreen(page, 'reconcile-screen')
        const title = work.getByTestId('reconcile-title')
        await expect(title).toContainText(name)
        await expect(title).toContainText(`Statement ending ${formatDay(today)}`)
        const summary = work.getByTestId('reconcile-summary')
        await expect(bandFigure(summary, 'Statement ending balance')).toContainText('$500.00')
        await expect(bandFigure(summary, 'Cleared balance')).toContainText('$0.00')
        await expect(bandFigure(summary, 'Beginning balance')).toContainText('$0.00')
        const difference = summary.getByTestId('reconcile-difference')
        await expect(difference).toContainText('$500.00')
        await expect(difference).toContainText('Not balanced')

        await work.getByTestId('reconcile-back').click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        const resumed = accountRow(page, name)
        await expect(resumed.getByTestId(`reconcile-resume-${id}`)).toBeVisible()
        await expect(resumed.getByTestId(`reconcile-start-${id}`)).toHaveCount(0)
        await expect(resumed).toContainText(`In progress · statement of ${formatDay(today)}`)
    })

    test('start from the keyboard only: J and ↵ open the dialog, Tab fills it, ⌘↵ starts, Esc cancels', async ({
        page,
    }) => {
        const statementDay = daysAgo(3)
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = await createReconcileAccount(page, 'bank')
        const otherName = await createReconcileAccount(page, 'bank')
        await openReconcile(page)
        const id = await accountIdOf(page, name)
        const otherId = await accountIdOf(page, otherName)
        const writes = startWrites(page)
        const dialog = page.getByTestId('reconcile-start-dialog')
        const balance = dialog.getByTestId('reconcile-ending-balance')

        // No click from here on. A zero balance and a zero total keep "0.00" when the focus
        // leaves them (an empty field would be refused); Esc closes the dialog with nothing
        // created.
        await focusAccountRow(page, otherId)
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(balance).toBeFocused()
        await page.keyboard.type('0.00')
        const otherOut = dialog.getByTestId('reconcile-statement-out')
        await tabTo(page, otherOut, { max: 5 })
        await expect(balance).toHaveValue('0.00')
        await page.keyboard.type('0')
        await tabTo(page, dialog.getByTestId('reconcile-statement-in'))
        await expect(otherOut).toHaveValue('0.00')
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(page.getByTestId(`reconcile-start-${otherId}`)).toBeVisible()
        await expect(page.getByTestId(`reconcile-resume-${otherId}`)).toHaveCount(0)
        expect(writes).toEqual([])

        await focusAccountRow(page, id)
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(balance).toBeFocused()
        await page.keyboard.type('1234.56')
        const date = dialog.getByTestId('reconcile-ending-date')
        await tabTo(page, date)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(statementDay)
        await tabTo(page, dialog.getByTestId('reconcile-statement-out'), { max: 4 })
        await page.keyboard.type('100')
        await tabTo(page, dialog.getByTestId('reconcile-statement-in'))
        await page.keyboard.type('200')
        await page.keyboard.press('ControlOrMeta+Enter')

        await expect(page).toHaveURL(WORK_URL)
        expect(writes).toHaveLength(1)
        const work = await visibleScreen(page, 'reconcile-screen')
        await expect(work.getByTestId('reconcile-title')).toContainText(
            `Statement ending ${formatDay(statementDay)}`
        )
        const summary = work.getByTestId('reconcile-summary')
        await expect(bandFigure(summary, 'Statement ending balance')).toContainText('$1,234.56')
        await expect(summary).toContainText('of $100.00 on the statement')
        await expect(summary).toContainText('of $200.00 on the statement')
    })

    // A fresh page for each failing read, with its routes in before it loads anything: a row
    // already in the store sends no request, so the routed failure would never happen
    // (lessons 1 and 39). Realtime is cut on each fresh page.
    test('load errors: the accounts screen and the work screen show Retry, and Retry loads them', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = await createReconcileAccount(page, 'bank')

        const first = await openBooksPage(page, DESKTOP, async fresh => {
            await cutRealtime(fresh)
            await fresh.route('**/api/collections/books_accounts/records*', refuseLoad)
        })
        const accounts = await openReconcile(first)
        await expect(accounts).toContainText('Books could not load the accounts.')
        await expect(accountRow(first, name)).toHaveCount(0)
        await first.unrouteAll({ behavior: 'wait' })
        await cutRealtime(first)
        await accounts.getByText('Retry', { exact: true }).click()
        await expect(accountRow(first, name)).toBeVisible()
        await expect(accounts).not.toContainText('Books could not load the accounts.')
        await first.close()

        const reconciliationId = await startReconciliation(page, name, {
            balance: '10.00',
            date: daysAgo(0),
        })
        // The fresh page's first load is the work screen itself (login's `startAt`), so no
        // screen before it has put the reconciliation in the store and the work screen's own
        // read of the row is a request. Every read of books_reconciliations fails.
        const workPath = `/a/books/reconcile/${reconciliationId}`
        const second = await page.context().newPage()
        await cutRealtime(second)
        await second.route('**/api/collections/books_reconciliations/records*', refuseLoad)
        await login(second, { startAt: workPath })
        await second.setViewportSize(DESKTOP)
        await expect(second).toHaveURL(new RegExp(`/books/reconcile/${reconciliationId}/?$`))
        const work = await visibleScreen(second, 'reconcile-screen')
        await expect(work.getByTestId('reconcile-error')).toContainText(
            'Books could not load this reconciliation.'
        )
        await expect(work.getByTestId('reconcile-back')).toBeVisible()
        await expect(work.getByTestId('reconcile-summary')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await cutRealtime(second)
        await work.getByTestId('reconcile-retry').click()
        const summary = work.getByTestId('reconcile-summary')
        await expect(summary).toBeVisible()
        await expect(bandFigure(summary, 'Statement ending balance')).toContainText('$10.00')
        await expect(work.getByTestId('reconcile-error')).toHaveCount(0)
        await second.close()
    })

    test('phone: cards, the start sheet and the compact band that opens and closes', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = await createReconcileAccount(page, 'bank')
        await openReconcile(page)
        const id = await accountIdOf(page, name)

        await page.setViewportSize(PHONE)
        const cards = page.getByTestId('reconcile-accounts-cards').filter({ visible: true })
        await expect(cards).toBeVisible()
        await expect(
            page.getByTestId('reconcile-accounts-table').filter({ visible: true })
        ).toHaveCount(0)
        const card = accountRow(page, name)
        await expect(cards.locator(`[data-testid="reconcile-account-${id}"]`)).toBeVisible()
        await card.getByTestId(`reconcile-start-${id}`).click()

        // Core Dialog is a Sheet with no dialog role on a phone: located by its test id.
        const sheet = page.getByTestId('reconcile-start-dialog')
        await expect(sheet).toBeVisible()
        await sheet.getByTestId('reconcile-ending-balance').fill('500.00')
        await sheet.getByTestId('reconcile-ending-date').fill(daysAgo(0))
        await sheet.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(WORK_URL)
        const work = await visibleScreen(page, 'reconcile-screen')

        const summary = work.getByTestId('reconcile-summary')
        const toggle = summary.getByTestId('reconcile-summary-toggle')
        await expect(toggle).toBeVisible()
        await expect(toggle).toHaveAccessibleName('Show the balances')
        const difference = summary.getByTestId('reconcile-difference')
        await expect(difference).toContainText('$500.00')
        await expect(difference).toContainText('Not balanced')
        await expect(difference).toContainText('Cleared $0.00 of $500.00')
        await expect(summary.getByText('Beginning balance', { exact: true })).toHaveCount(0)

        await toggle.click()
        await expect(summary.getByText('Beginning balance', { exact: true })).toBeVisible()
        await expect(toggle).toHaveAccessibleName('Hide the balances')
        await toggle.click()
        await expect(summary.getByText('Beginning balance', { exact: true })).toHaveCount(0)
        await expect(toggle).toHaveAccessibleName('Show the balances')
    })
})
