import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openChart } from './account-register-helpers'
import { fileRowByName } from './bank-import-helpers'
import {
    BANKING_DESKTOP,
    BANKING_PHONE,
    bankCard,
    connectionIdOf,
    fakeReadOnlyAccess,
    openBanking,
} from './banking-helpers'
import { importReviewStatement, openReviewTab, reviewRow } from './for-review-helpers'

// The lists' first test and the filters test each connect their own number-less account and
// import their own OFX file through the UI; the filters test only presses the 1000 card.
// The load-error test only reads the seeded connections: 1000 Business Checking, whose seeded
// checking-2026-10.ofx import left 8 rows for review and 4 excluded, and 2100 Company
// Card, whose card-2026-10.ofx waits to import.

const CHECKING = '1000 Business Checking'
const CARD = '2100 Company Card'
const CARD_FILE = 'card-2026-10.ofx'
const SEEDED_EXCLUDED = [
    'TRADER JOES 118',
    'OFFICE DEPOT #2231',
    'ZELLE TO MARCO RUIZ',
    'NETFLIX.COM',
]
const TRANSACTIONS_URL = '**/api/collections/books_bank_transactions/records*'
const CANNOT_CHANGE = 'This transaction cannot be changed.'

function todayDigits(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}${month}${day}`
}

// The money texts of a row, each filed under the header column ("Spent" or "Received")
// whose right edge is nearest its own: both columns are right aligned on the same cells.
function amountColumns(row: Locator) {
    return row.evaluate(rowEl => {
        const texts = (root: Element) => {
            const out: { text: string; right: number }[] = []
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent?.trim() ?? ''
                if (!text) continue
                const range = document.createRange()
                range.selectNodeContents(node)
                out.push({ text, right: range.getBoundingClientRect().right })
            }
            return out
        }
        const header = document.querySelector('[data-testid="bank-review-header"]')
        const labels = header ? texts(header) : []
        const spent = labels.find(label => label.text === 'Spent')
        const received = labels.find(label => label.text === 'Received')
        const columns: { Spent: string[]; Received: string[] } = { Spent: [], Received: [] }
        if (!spent || !received) return null
        for (const cell of texts(rowEl)) {
            if (!/^-?\$/.test(cell.text)) continue
            const nearSpent = Math.abs(cell.right - spent.right)
            const nearReceived = Math.abs(cell.right - received.right)
            columns[nearSpent <= nearReceived ? 'Spent' : 'Received'].push(cell.text)
        }
        return columns
    })
}

test.describe('for-review: lists', () => {
    test('lands on For review after an import', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { connectionId, stamp, fileName } = await importReviewStatement(page, s => [
            {
                day: todayDigits(),
                amount: '-86.47',
                name: `${s} supplies`,
                memo: `${s} memo`,
                check: '2041',
            },
            { day: '20261002', amount: '4250.00', name: `${s} deposit` },
            { day: '20261001', amount: '-12.00', name: `${s} fee` },
        ])
        const names = [`${stamp} supplies`, `${stamp} deposit`, `${stamp} fee`]

        await expect(page).toHaveURL(/[?&]tab=review(&|$)/)
        await expect(page.getByTestId('bank-tab-body-review')).toBeVisible()
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (3)')
        await expect(page.getByTestId(`bank-review-count-${connectionId}`)).toHaveText(
            '3 to review'
        )

        await expect
            .poll(() =>
                page.evaluate(
                    list =>
                        Array.from(
                            document.querySelectorAll(
                                '[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]'
                            )
                        ).map(
                            node => list.find(name => node.textContent?.includes(name)) ?? 'other'
                        ),
                    names
                )
            )
            .toEqual(names)

        const supplies = reviewRow(page, `${stamp} supplies`)
        const deposit = reviewRow(page, `${stamp} deposit`)
        await expect(deposit.getByText('Oct 2, 2026', { exact: true })).toBeVisible()
        await expect(
            supplies.getByText(`${stamp} memo · Check 2041`, { exact: true })
        ).toBeVisible()
        await expect
            .poll(() => amountColumns(supplies))
            .toEqual({ Spent: ['$86.47'], Received: [] })
        await expect
            .poll(() => amountColumns(deposit))
            .toEqual({ Spent: [], Received: ['$4,250.00'] })

        await openReviewTab(page, 'reviewed')
        await expect(page.getByTestId('bank-review-empty')).toContainText(
            'No reviewed transactions yet. A transaction moves here when you match or categorize it.'
        )
        await openReviewTab(page, 'excluded')
        await expect(page.getByTestId('bank-review-empty')).toContainText(
            'No excluded transactions. Exclude a transaction in For review to keep it out of your books.'
        )

        await openReviewTab(page, 'files')
        const files = page.getByTestId('bank-tab-body-files')
        await expect(files.getByTestId('bank-file-drop')).toBeVisible()
        await expect(files.getByTestId('bank-files')).toBeVisible()
        await expect(
            fileRowByName(page, fileName).getByText('Imported: 3 transactions', { exact: true })
        ).toBeVisible()

        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('bank-panel-title')).toHaveText(CHECKING)
        await expect(page).toHaveURL(/[?&]tab=files(&|$)/)
        await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
    })

    test('shows a load error with Retry', async ({ page }) => {
        await page.route('**/api/realtime*', route => route.abort())
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        const checkingId = await connectionIdOf(checking)
        await expect(page).toHaveURL(new RegExp(`[?&]account=${checkingId}(&|$)`))

        await page.route(TRANSACTIONS_URL, (route: Route) =>
            decodeURIComponent(route.request().url()).includes('excluded')
                ? route.fulfill({
                      status: 400,
                      json: { status: 400, message: 'Bad request.', data: {} },
                  })
                : route.continue()
        )
        await openReviewTab(page, 'excluded')
        const error = page.getByTestId('bank-review-error')
        await expect(
            error.getByText('Books could not load these transactions.', { exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('bank-tabs-review')).toBeVisible()
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (8)')

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('bank-review-retry').click()
        await expect(page.locator('[data-testid^="bank-review-row-"]')).toHaveCount(4)
        for (const description of SEEDED_EXCLUDED) {
            await expect(reviewRow(page, description)).toHaveCount(1)
        }
        await expect(error).toHaveCount(0)

        const card = bankCard(page, CARD)
        await card.click()
        await expect(card).toHaveAttribute('aria-selected', 'true')
        await openReviewTab(page, 'review')
        await expect(
            page
                .getByTestId('bank-review-empty')
                .getByText('Nothing to review. 1 file is waiting to import.', { exact: true })
        ).toBeVisible()
        const goToFiles = page.getByTestId('bank-review-empty-action')
        await expect(goToFiles).toHaveText('Go to files')
        await goToFiles.click()
        await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
        await expect(page).toHaveURL(/[?&]tab=files(&|$)/)
        await expect(fileRowByName(page, CARD_FILE)).toHaveCount(1)
    })
})

// The names of `names` that the list shows, in screen order, read in one snapshot.
function shownNames(page: Page, names: string[]) {
    return page.evaluate(
        list =>
            Array.from(
                document.querySelectorAll(
                    '[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]'
                )
            )
                .filter(node => (node as HTMLElement).offsetParent !== null)
                .map(node => list.find(name => node.textContent?.includes(name)) ?? 'other'),
        names
    )
}

async function pickMenu(page: Page, testId: string, label: string) {
    await page.getByTestId(testId).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByTestId(testId)).toHaveText(label)
}

test.describe('for-review: filters', () => {
    test('finds transactions by text, amount, date and type', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { accountName, connectionId, stamp } = await importReviewStatement(page, s => [
            { day: todayDigits(), amount: '-123.45', name: `${s} hardware` },
            {
                day: todayDigits(),
                amount: '500.00',
                name: `${s} client`,
                memo: `${s} retainer`,
            },
            { day: '20250115', amount: '-40.00', name: `${s} old fee` },
            { day: '20250116', amount: '123.45', name: `${s} refund` },
        ])
        const hardware = `${stamp} hardware`
        const client = `${stamp} client`
        const oldFee = `${stamp} old fee`
        const refund = `${stamp} refund`
        const names = [hardware, client, oldFee, refund]
        const newestFirst = [hardware, client, refund, oldFee]
        const search = page.getByTestId('bank-review-search')
        const clear = page.getByTestId('bank-review-clear')
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)

        // By memo: the counts still count every for-review row.
        await search.fill(`${stamp} retainer`)
        await expect.poll(() => shownNames(page, names)).toEqual([client])
        await expect(clear).toBeVisible()
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (4)')
        await expect(page.getByTestId(`bank-review-count-${connectionId}`)).toHaveText(
            '4 to review'
        )
        await clear.click()
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)
        await expect(search).toHaveValue('')
        await expect(clear).toHaveCount(0)

        // By amount: spent and received.
        await search.fill('$123.45')
        await expect.poll(() => shownNames(page, names)).toEqual([hardware, refund])
        await search.fill('')
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)

        await pickMenu(page, 'bank-review-type', 'Money in')
        await expect.poll(() => shownNames(page, names)).toEqual([client, refund])
        await pickMenu(page, 'bank-review-dates', 'This month')
        await expect.poll(() => shownNames(page, names)).toEqual([client])

        // One set across tabs.
        await openReviewTab(page, 'excluded')
        await expect(search).toHaveValue('')
        await expect(page.getByTestId('bank-review-type')).toHaveText('Money in')
        await expect(page.getByTestId('bank-review-dates')).toHaveText('This month')
        await expect(
            page
                .getByTestId('bank-review-empty')
                .getByText('No transactions match these filters.', { exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('bank-review-empty-action')).toHaveText('Clear filters')

        // One set across accounts.
        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('bank-review-type')).toHaveText('Money in')
        await expect(page.getByTestId('bank-review-dates')).toHaveText('This month')
        const own = bankCard(page, accountName)
        await own.click()
        await expect(own).toHaveAttribute('aria-selected', 'true')

        // Leaving Banking resets them.
        await openChart(page)
        await openBanking(page)
        const visibleCard = page
            .getByTestId('bank-strip')
            .filter({ visible: true })
            .locator('[data-testid^="bank-card-"]')
            .filter({ has: page.getByText(accountName, { exact: true }) })
        await visibleCard.click()
        await expect(visibleCard).toHaveAttribute('aria-selected', 'true')
        await openReviewTab(page, 'review')
        const type = page.getByTestId('bank-review-type').filter({ visible: true })
        const dates = page.getByTestId('bank-review-dates').filter({ visible: true })
        const searchShown = search.filter({ visible: true })
        await expect(type).toHaveText('All transactions')
        await expect(dates).toHaveText('All dates')
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)

        // No match, and its Clear filters.
        await searchShown.fill(`zzz-${stamp}`)
        const empty = page.getByTestId('bank-review-empty').filter({ visible: true })
        await expect(
            empty.getByText('No transactions match these filters.', { exact: true })
        ).toBeVisible()
        await page.getByTestId('bank-review-empty-action').filter({ visible: true }).click()
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)
        await expect(searchShown).toHaveValue('')
        await expect(clear.filter({ visible: true })).toHaveCount(0)

        // Oldest first keeps file order inside one day.
        const sortDate = page.getByTestId('bank-review-sort-date').filter({ visible: true })
        await sortDate.click()
        await expect.poll(() => shownNames(page, names)).toEqual([oldFee, refund, hardware, client])
        await sortDate.click()
        await expect.poll(() => shownNames(page, names)).toEqual(newestFirst)
    })
})

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('for-review: drawer', () => {
    test('opens a transaction and excludes it, then moves it back', async ({ page }) => {
        // Realtime stays on: the imported rows and the file's status reach the client only
        // through it.
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { accountName, stamp, fileName } = await importReviewStatement(page, s => [
            {
                day: '20261027',
                amount: '-362.40',
                name: `${s} insurance`,
                memo: `${s} policy`,
                check: '1050',
            },
            { day: '20261028', amount: '75.00', name: `${s} refund` },
        ])
        const insurance = reviewRow(page, `${stamp} insurance`)
        const refund = reviewRow(page, `${stamp} refund`)
        const drawer = page.getByTestId('bank-txn-drawer')
        const field = (name: string) => page.getByTestId(`bank-txn-field-${name}`)
        // A field row holds its label and its value; the value is matched whole.
        const fieldValue = (name: string, value: string | RegExp) =>
            field(name).getByText(value, { exact: true })

        // The drawer's load error and Retry are covered in tests/bank-txn-detail.test.ts: the
        // list has filed the row, so pbtsdb serves the drawer's reads from the store with no
        // request to fake.
        await insurance.click()
        await expect(drawer).toBeVisible()
        await expect(fieldValue('check', '1050')).toBeVisible()

        // The facts of the open row.
        await expect(insurance).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('bank-txn-amount')).toHaveText('$362.40')
        await expect(page.getByTestId('bank-txn-direction')).toHaveText('Spent')
        await expect(page.getByTestId('bank-txn-status')).toHaveText('For review')
        await expect(fieldValue('date', 'Oct 27, 2026')).toBeVisible()
        await expect(fieldValue('description', `${stamp} insurance`)).toBeVisible()
        await expect(fieldValue('memo', `${stamp} policy`)).toBeVisible()
        await expect(fieldValue('account', accountName)).toBeVisible()
        await expect(
            fieldValue('file', new RegExp(`^${escapeRegExp(fileName)}, line \\d+$`))
        ).toBeVisible()
        await expect(fieldValue('imported', /^[A-Z][a-z]{2} \d{1,2}, \d{4} by \S/)).toBeVisible()

        // Another row shows that one; a field with no value is not drawn.
        await refund.click()
        await expect(page.getByTestId('bank-txn-amount')).toHaveText('$75.00')
        await expect(page.getByTestId('bank-txn-direction')).toHaveText('Received')
        await expect(fieldValue('description', `${stamp} refund`)).toBeVisible()
        await expect(field('memo')).toHaveCount(0)
        await expect(field('check')).toHaveCount(0)
        await expect(refund).toHaveAttribute('aria-selected', 'true')
        await expect(insurance).toHaveAttribute('aria-selected', 'false')

        await page.getByTestId('bank-txn-close').click()
        await expect(drawer).toHaveCount(0)

        // A tab change and an account change close the drawer.
        await refund.click()
        await expect(drawer).toBeVisible()
        await openReviewTab(page, 'excluded')
        await expect(drawer).toHaveCount(0)
        await openReviewTab(page, 'review')
        await refund.click()
        await expect(drawer).toBeVisible()
        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await expect(drawer).toHaveCount(0)
        const own = bankCard(page, accountName)
        await own.click()
        await expect(own).toHaveAttribute('aria-selected', 'true')

        // Exclude from the drawer.
        const result = page.getByTestId('bank-review-result')
        await insurance.click()
        await expect(page.getByTestId('bank-txn-status')).toHaveText('For review')
        await page.getByTestId('bank-txn-exclude').click()
        await expect(drawer).toHaveCount(0)
        await expect(insurance).toHaveCount(0)
        await expect(result).toHaveText('Excluded 1 transaction.')
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (1)')

        // Move it back from Excluded.
        await openReviewTab(page, 'excluded')
        await expect(result).toHaveCount(0)
        await expect(insurance).toHaveCount(1)
        await insurance.click()
        await expect(page.getByTestId('bank-txn-status')).toHaveText('Excluded')
        await expect(page.getByTestId('bank-txn-exclude')).toHaveCount(0)
        await page.getByTestId('bank-txn-restore').click()
        await expect(drawer).toHaveCount(0)
        await expect(insurance).toHaveCount(0)
        await expect(result).toHaveText('Moved 1 transaction to For review.')
        await openReviewTab(page, 'review')
        await expect(insurance).toHaveCount(1)
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (2)')

        // A refused exclude puts the row back and shows the server's message.
        await page.route('**/api/collections/books_bank_transactions/records/*', (route: Route) =>
            route.request().method() === 'PATCH'
                ? route.fulfill({
                      status: 400,
                      json: { status: 400, message: CANNOT_CHANGE, data: {} },
                  })
                : route.continue()
        )
        await insurance.click()
        await page.getByTestId('bank-txn-exclude').click()
        await expect(result).toHaveText(CANNOT_CHANGE)
        await expect(insurance).toHaveCount(1)
        await page.unrouteAll({ behavior: 'wait' })
    })
})

// The check box of the row (or card) that shows `text`.
function rowBox(page: Page, text: string): Locator {
    return reviewRow(page, text).locator('[data-testid^="bank-review-check-"]')
}

// The id that a row carries in its test id.
async function rowIdOf(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    if (!testId.startsWith('bank-review-row-')) throw new Error(`no row test id: ${testId}`)
    return testId.slice('bank-review-row-'.length)
}

test.describe('for-review: choosing', () => {
    test('excludes chosen rows and moves them back', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { accountName, stamp } = await importReviewStatement(page, s => [
            { day: todayDigits(), amount: '-86.47', name: `${s} supplies` },
            { day: todayDigits(), amount: '-125.83', name: `${s} fuel` },
            { day: todayDigits(), amount: '4250.00', name: `${s} deposit` },
        ])
        const supplies = `${stamp} supplies`
        const fuel = `${stamp} fuel`
        const deposit = `${stamp} deposit`
        const names = [supplies, fuel, deposit]
        const toolbar = page.getByTestId('bank-review-toolbar')
        const selection = page.getByTestId('bank-review-selection')
        const selectionText = page.getByTestId('bank-review-selection-text')
        const selectAll = page.getByTestId('bank-review-select-all')
        const result = page.getByTestId('bank-review-result')
        await expect(reviewRow(page, deposit)).toHaveCount(1)

        // Two boxes: the bar replaces the toolbar and sums the choice.
        await rowBox(page, supplies).click()
        await rowBox(page, fuel).click()
        await expect(selectionText).toHaveText('2 selected · Spent $212.30 · Received $0.00')
        await expect(toolbar).toHaveCount(0)
        await expect(page.getByTestId('bank-review-search')).toHaveCount(0)
        await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
        await expect(rowBox(page, supplies)).toHaveAttribute('aria-checked', 'true')
        await expect(rowBox(page, deposit)).toHaveAttribute('aria-checked', 'false')

        await page.getByTestId('bank-review-unselect').click()
        await expect(toolbar).toBeVisible()
        await expect(selection).toHaveCount(0)
        await expect(selectAll).toHaveAttribute('aria-checked', 'false')

        // Select all, then one box off again.
        await selectAll.click()
        await expect(selectionText).toHaveText('3 selected · Spent $212.30 · Received $4,250.00')
        await expect(selectAll).toHaveAttribute('aria-checked', 'true')
        await rowBox(page, deposit).click()
        await expect(selectionText).toHaveText('2 selected · Spent $212.30 · Received $0.00')

        await page.getByTestId('bank-review-exclude').click()
        await expect(result).toHaveText('Excluded 2 transactions.')
        await expect(reviewRow(page, supplies)).toHaveCount(0)
        await expect(reviewRow(page, fuel)).toHaveCount(0)
        await expect(toolbar).toBeVisible()
        await expect(selection).toHaveCount(0)
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (1)')

        // Select all on Excluded and move them back.
        await openReviewTab(page, 'excluded')
        await expect(reviewRow(page, fuel)).toHaveCount(1)
        await selectAll.click()
        await expect(selectionText).toHaveText('2 selected · Spent $212.30 · Received $0.00')
        await page.getByTestId('bank-review-restore').click()
        await expect(result).toHaveText('Moved 2 transactions to For review.')
        await expect(page.getByTestId('bank-review-empty')).toBeVisible()

        // A tab change clears the choice.
        await openReviewTab(page, 'review')
        await expect.poll(() => shownNames(page, names)).toEqual(names)
        await rowBox(page, fuel).click()
        await expect(selection).toBeVisible()
        await openReviewTab(page, 'reviewed')
        await openReviewTab(page, 'review')
        await expect(reviewRow(page, fuel)).toHaveCount(1)
        await expect(selection).toHaveCount(0)
        await expect(rowBox(page, fuel)).toHaveAttribute('aria-checked', 'false')

        // An account change clears the choice.
        await rowBox(page, fuel).click()
        await expect(selection).toBeVisible()
        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        const own = bankCard(page, accountName)
        await own.click()
        await expect(own).toHaveAttribute('aria-selected', 'true')
        await expect(reviewRow(page, fuel)).toHaveCount(1)
        await expect(selection).toHaveCount(0)
        await expect(rowBox(page, fuel)).toHaveAttribute('aria-checked', 'false')

        // Select all chooses only the rows the search shows.
        await page.getByTestId('bank-review-search').fill('$86.47')
        await expect.poll(() => shownNames(page, names)).toEqual([supplies])
        await selectAll.click()
        await expect(selectionText).toHaveText('1 selected · Spent $86.47 · Received $0.00')
        await expect(selectAll).toHaveAttribute('aria-checked', 'true')
        await page.getByTestId('bank-review-exclude').click()
        await expect(result).toHaveText('Excluded 1 transaction.')

        // The rows the search hid were not chosen, so they are still for review.
        await page.getByTestId('bank-review-search').fill('')
        await expect.poll(() => shownNames(page, names)).toEqual([fuel, deposit])
        await expect(page.getByTestId('bank-tabs-review')).toHaveText('For review (2)')
    })

    test('keeps refused rows chosen', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { accountName, stamp } = await importReviewStatement(page, s => [
            { day: todayDigits(), amount: '-10.00', name: `${s} first` },
            { day: todayDigits(), amount: '-20.00', name: `${s} second` },
            { day: todayDigits(), amount: '-30.00', name: `${s} third` },
            { day: todayDigits(), amount: '40.00', name: `${s} fourth` },
        ])
        const [first, second, third, fourth] = ['first', 'second', 'third', 'fourth'].map(
            word => `${stamp} ${word}`
        )
        const firstId = await rowIdOf(reviewRow(page, first))
        const secondId = await rowIdOf(reviewRow(page, second))
        const thirdId = await rowIdOf(reviewRow(page, third))
        const fourthId = await rowIdOf(reviewRow(page, fourth))
        const selectionText = page.getByTestId('bank-review-selection-text')
        const exclude = page.getByTestId('bank-review-exclude')

        // Every PATCH waits here until the test answers it.
        const held = new Map<string, Route>()
        await page.route('**/api/collections/books_bank_transactions/records/*', (route: Route) => {
            if (route.request().method() !== 'PATCH') return route.continue()
            const id = new URL(route.request().url()).pathname.split('/').pop() ?? ''
            held.set(id, route)
        })

        await rowBox(page, first).click()
        await rowBox(page, second).click()
        await rowBox(page, third).click()
        await expect(selectionText).toHaveText('3 selected · Spent $60.00 · Received $0.00')
        await exclude.click()

        // Optimistic: the rows leave at once while the bar stays busy.
        await expect(reviewRow(page, first)).toHaveCount(0)
        await expect(reviewRow(page, second)).toHaveCount(0)
        await expect(reviewRow(page, third)).toHaveCount(0)
        await expect(exclude).toHaveText('Excluding…')
        await expect(selectionText).toHaveText('3 selected · Spent $60.00 · Received $0.00')
        await expect(page.getByTestId('bank-review-unselect')).toBeDisabled()
        await expect(rowBox(page, fourth)).toHaveAttribute('aria-disabled', 'true')
        await expect(page.getByTestId('bank-review-select-all')).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        await expect
            .poll(() => [...held.keys()].sort())
            .toEqual([firstId, secondId, thirdId].sort())

        await held.get(firstId)?.continue()
        await held.get(secondId)?.fulfill({
            status: 400,
            json: { status: 400, message: 'This transaction is locked.', data: {} },
        })
        await held.get(thirdId)?.fulfill({
            status: 400,
            json: { status: 400, message: CANNOT_CHANGE, data: {} },
        })

        const result = page.getByTestId('bank-review-result')
        await expect(result).toHaveText('2 of 3 transactions could not be excluded. Try again.')
        await expect(result).toHaveClass(/text-danger/)
        await expect(rowBox(page, second)).toHaveAttribute('aria-checked', 'true')
        await expect(rowBox(page, third)).toHaveAttribute('aria-checked', 'true')
        await expect(rowBox(page, fourth)).toHaveAttribute('aria-checked', 'false')
        await expect(selectionText).toHaveText('2 selected · Spent $50.00 · Received $0.00')
        await expect(reviewRow(page, first)).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })

        // Another session excludes a chosen row: it leaves the list and the choice here.
        const other = await page.context().newPage()
        await login(other)
        await navigateToPackage(other, 'books')
        await other.setViewportSize(BANKING_DESKTOP)
        await openBanking(other)
        const otherCard = bankCard(other, accountName)
        await otherCard.click()
        await expect(otherCard).toHaveAttribute('aria-selected', 'true')
        await reviewRow(other, second).getByText(second, { exact: true }).click()
        await other.getByTestId('bank-txn-exclude').click()
        await expect(other.getByTestId('bank-txn-drawer')).toHaveCount(0)
        await expect(reviewRow(other, second)).toHaveCount(0)
        await other.close()

        await expect.poll(() => reviewRow(page, second).count()).toBe(0)
        await expect
            .poll(() => selectionText.textContent())
            .toBe('1 selected · Spent $30.00 · Received $0.00')

        // A tab change during a run clears the choice: a refusal that settles after the
        // change does not choose its row again. (The new tab's list cannot be read while
        // the run is held: TanStack DB commits no synced rows while a write persists.)
        const heldAgain = new Map<string, Route>()
        await page.route('**/api/collections/books_bank_transactions/records/*', (route: Route) => {
            if (route.request().method() !== 'PATCH') return route.continue()
            const id = new URL(route.request().url()).pathname.split('/').pop() ?? ''
            heldAgain.set(id, route)
        })
        await rowBox(page, fourth).click()
        await expect(selectionText).toHaveText('2 selected · Spent $30.00 · Received $40.00')
        await exclude.click()
        await expect(exclude).toHaveText('Excluding…')
        await expect.poll(() => [...heldAgain.keys()].sort()).toEqual([thirdId, fourthId].sort())

        await openReviewTab(page, 'excluded')
        await openReviewTab(page, 'review')

        await heldAgain.get(thirdId)?.continue()
        await heldAgain.get(fourthId)?.fulfill({
            status: 400,
            json: { status: 400, message: CANNOT_CHANGE, data: {} },
        })
        await expect(reviewRow(page, fourth)).toHaveCount(1)
        await expect(reviewRow(page, third)).toHaveCount(0)
        await expect(rowBox(page, fourth)).not.toHaveAttribute('aria-disabled', 'true')
        await expect(rowBox(page, fourth)).toHaveAttribute('aria-checked', 'false')
        await expect(page.getByTestId('bank-review-selection')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('a reader sees the queue without actions', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await openReviewTab(page, 'review')
        const rows = page.locator('[data-testid^="bank-review-row-"]')
        const boxes = page.locator('[data-testid^="bank-review-check-"]')
        const drawer = page.getByTestId('bank-txn-drawer')
        await expect(rows).toHaveCount(8)
        await expect(boxes).toHaveCount(0)
        await expect(page.getByTestId('bank-review-select-all')).toHaveCount(0)
        await expect(page.getByTestId('bank-review-search')).toBeVisible()

        await reviewRow(page, 'CHECK 1050').getByText('CHECK 1050', { exact: true }).click()
        await expect(drawer).toBeVisible()
        await expect(
            page.getByTestId('bank-txn-field-check').getByText('1050', { exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('bank-txn-exclude')).toHaveCount(0)

        await openReviewTab(page, 'excluded')
        await expect(rows).toHaveCount(4)
        await expect(boxes).toHaveCount(0)
        await expect(page.getByTestId('bank-review-select-all')).toHaveCount(0)
        const netflix = SEEDED_EXCLUDED[3]
        await reviewRow(page, netflix).getByText(netflix, { exact: true }).click()
        await expect(page.getByTestId('bank-txn-status')).toHaveText('Excluded')
        await expect(page.getByTestId('bank-txn-restore')).toHaveCount(0)

        const card = bankCard(page, CARD)
        await card.click()
        await expect(card).toHaveAttribute('aria-selected', 'true')
        await openReviewTab(page, 'review')
        await expect(
            page
                .getByTestId('bank-review-empty')
                .getByText('Nothing to review. 1 file is waiting to import.', { exact: true })
        ).toBeVisible()
        await expect(page.getByTestId('bank-review-empty-action')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
    })
})

// The names of `names` that the phone cards show, in screen order, read in one snapshot.
function cardNames(page: Page, names: string[]) {
    return page.evaluate(
        list =>
            Array.from(
                document.querySelectorAll(
                    '[data-testid="bank-review-cards"] [data-testid^="bank-review-row-"]'
                )
            ).map(node => list.find(name => node.textContent?.includes(name)) ?? 'other'),
        names
    )
}

test.describe('for-review: phone', () => {
    test('chooses and excludes on a phone', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        const { stamp } = await importReviewStatement(page, s => [
            { day: todayDigits(), amount: '-86.47', name: `${s} supplies`, check: '2041' },
            { day: '20261002', amount: '4250.00', name: `${s} deposit` },
        ])
        const supplies = `${stamp} supplies`
        const deposit = `${stamp} deposit`
        await page.setViewportSize(BANKING_PHONE)

        await expect(page.getByTestId('bank-review-cards')).toBeVisible()
        await expect(page.getByTestId('bank-review-table')).toHaveCount(0)
        const suppliesCard = reviewRow(page, supplies)
        const depositCard = reviewRow(page, deposit)
        await expect(suppliesCard.getByText('-$86.47', { exact: true })).toBeVisible()
        await expect(
            suppliesCard.getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · Check 2041$/)
        ).toBeVisible()
        await expect(depositCard.getByText('$4,250.00', { exact: true })).toBeVisible()

        const phoneBar = page.getByTestId('bank-review-phone-bar')
        const selectAll = phoneBar.getByTestId('bank-review-select-all')
        await expect(phoneBar.getByText('Select all', { exact: true })).toBeVisible()
        await selectAll.click()
        await expect(page.getByTestId('bank-review-selection-text')).toHaveText(
            '2 selected · Spent $86.47 · Received $4,250.00'
        )
        await selectAll.click()
        await expect(page.getByTestId('bank-review-selection')).toHaveCount(0)
        await expect(rowBox(page, supplies)).toHaveAttribute('aria-checked', 'false')
        await expect(rowBox(page, deposit)).toHaveAttribute('aria-checked', 'false')

        const sortDate = phoneBar.getByTestId('bank-review-sort-date')
        await sortDate.click()
        await expect(sortDate).toHaveText('Oldest first')
        await expect.poll(() => cardNames(page, [supplies, deposit])).toEqual([deposit, supplies])
        await sortDate.click()
        await expect(sortDate).toHaveText('Newest first')
        await expect.poll(() => cardNames(page, [supplies, deposit])).toEqual([supplies, deposit])

        // The drawer is a sheet across the bottom of the phone.
        await depositCard.getByText(deposit, { exact: true }).click()
        const drawer = page.getByTestId('bank-txn-drawer')
        await expect(drawer).toBeVisible()
        await expect
            .poll(async () => {
                const box = await drawer.boundingBox()
                return box !== null && box.y > 0 && box.y + box.height >= BANKING_PHONE.height - 1
            })
            .toBe(true)
        await page.getByTestId('bank-txn-exclude').click()
        await expect(drawer).toHaveCount(0)
        await expect(page.getByTestId('bank-review-result')).toHaveText('Excluded 1 transaction.')
        await expect(depositCard).toHaveCount(0)
        await expect
            .poll(() =>
                page
                    .locator('[data-testid="bank-review-cards"] [data-testid^="bank-review-row-"]')
                    .count()
            )
            .toBe(1)
    })
})

// The names of `names` whose row carries the focus stripe, read in one snapshot. ReviewRow
// writes data-focused="true" on the web for the row the keys focused.
function focusedNames(page: Page, names: string[]) {
    return page.evaluate(
        list =>
            Array.from(
                document.querySelectorAll('[data-testid^="bank-review-row-"][data-focused="true"]')
            )
                .filter(node => (node as HTMLElement).offsetParent !== null)
                .map(node => list.find(name => node.textContent?.includes(name)) ?? 'other'),
        names
    )
}

test.describe('for-review: keys', () => {
    test('works the queue from the keyboard', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)

        // Every name holds a "j", so a "j" typed in the search keeps all three rows shown.
        const { stamp } = await importReviewStatement(page, s => [
            { day: '20261020', amount: '-10.00', name: `${s} jam` },
            { day: '20261021', amount: '-20.00', name: `${s} jet` },
            { day: '20261022', amount: '30.00', name: `${s} joy` },
        ])
        const a = `${stamp} jam`
        const b = `${stamp} jet`
        const c = `${stamp} joy`
        const names = [a, b, c]
        const selection = page.getByTestId('bank-review-selection')
        const selectionText = page.getByTestId('bank-review-selection-text')
        const drawer = page.getByTestId('bank-txn-drawer')
        const result = page.getByTestId('bank-review-result')
        const drawerShows = (name: string) =>
            page.getByTestId('bank-txn-field-description').getByText(name, { exact: true })
        await expect.poll(() => shownNames(page, names)).toEqual([c, b, a])

        // Row focus: the first press focuses the first row, then the keys move it.
        await page.keyboard.press('Escape')
        await page.keyboard.press('j')
        await expect.poll(() => focusedNames(page, names)).toEqual([c])
        await page.keyboard.press('j')
        await expect.poll(() => focusedNames(page, names)).toEqual([b])
        await page.keyboard.press('k')
        await expect.poll(() => focusedNames(page, names)).toEqual([c])
        await page.keyboard.press('ArrowDown')
        await expect.poll(() => focusedNames(page, names)).toEqual([b])
        await page.keyboard.press('ArrowDown')
        await expect.poll(() => focusedNames(page, names)).toEqual([a])
        await page.keyboard.press('ArrowUp')
        await expect.poll(() => focusedNames(page, names)).toEqual([b])

        // Choose the focused row, then all.
        await page.keyboard.press('x')
        await expect(selectionText).toHaveText('1 selected · Spent $20.00 · Received $0.00')
        await page.keyboard.press('Space')
        await expect(selection).toHaveCount(0)
        await page.keyboard.press('a')
        await expect(selectionText).toHaveText('3 selected · Spent $30.00 · Received $30.00')
        await page.keyboard.press('a')
        await expect(selection).toHaveCount(0)

        // After a mouse press, ↵ and Space act on the striped row, not on the pressed row or
        // box that holds DOM focus. Two j presses land on a whether or not the press moved
        // the stripe (they clamp at the last row).
        await reviewRow(page, c).click()
        await expect(drawerShows(c)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(drawer).toHaveCount(0)
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await expect.poll(() => focusedNames(page, names)).toEqual([a])
        await page.keyboard.press('Enter')
        await expect(drawerShows(a)).toBeVisible()
        await expect(drawerShows(c)).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(drawer).toHaveCount(0)
        await rowBox(page, c).click()
        await expect(selectionText).toHaveText('1 selected · Spent $0.00 · Received $30.00')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await expect.poll(() => focusedNames(page, names)).toEqual([a])
        await page.keyboard.press('Space')
        await expect(selectionText).toHaveText('2 selected · Spent $10.00 · Received $30.00')
        await page.keyboard.press('Escape')
        await expect(selection).toHaveCount(0)
        await page.keyboard.press('k')
        await expect.poll(() => focusedNames(page, names)).toEqual([b])

        // Open the focused row; Esc closes it; E excludes the drawer's transaction.
        await page.keyboard.press('Enter')
        await expect(drawer).toBeVisible()
        await expect(drawerShows(b)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(drawer).toHaveCount(0)
        await page.keyboard.press('o')
        await expect(drawerShows(b)).toBeVisible()
        await page.keyboard.press('e')
        await expect(drawer).toHaveCount(0)
        await expect(result).toHaveText('Excluded 1 transaction.')
        await expect(reviewRow(page, b)).toHaveCount(0)

        // 3 opens Excluded; R moves the chosen row back.
        await page.keyboard.press('3')
        await expect(page).toHaveURL(/[?&]tab=excluded(&|$)/)
        await expect(page.getByTestId('bank-tab-body-excluded')).toBeVisible()
        await expect(reviewRow(page, b)).toHaveCount(1)
        await page.keyboard.press('j')
        await expect.poll(() => focusedNames(page, names)).toEqual([b])
        await page.keyboard.press('x')
        await expect(selectionText).toHaveText('1 selected · Spent $20.00 · Received $0.00')
        await page.keyboard.press('r')
        await expect(result).toHaveText('Moved 1 transaction to For review.')
        await expect(page.getByTestId('bank-review-empty')).toBeVisible()
        await page.keyboard.press('x')
        await expect(selection).toHaveCount(0)
        await expect(page.getByTestId('bank-review-empty')).toBeVisible()

        // The tab keys; on Files the review keys are not registered.
        await page.keyboard.press('2')
        await expect(page).toHaveURL(/[?&]tab=reviewed(&|$)/)
        await expect(page.getByTestId('bank-tab-body-reviewed')).toBeVisible()
        await page.keyboard.press('1')
        await expect(page).toHaveURL(/[?&]tab=review(&|$)/)
        await expect(page.getByTestId('bank-tab-body-review')).toBeVisible()
        await page.keyboard.press('4')
        await expect(page).toHaveURL(/[?&]tab=files(&|$)/)
        await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
        await page.keyboard.press('1')
        await expect(page).toHaveURL(/[?&]tab=files(&|$)/)
        await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
        await expect(page.getByTestId('bank-tab-body-review')).toHaveCount(0)
        await openReviewTab(page, 'review')
        await expect.poll(() => shownNames(page, names)).toEqual([c, b, a])

        // / focuses the search; a letter typed there stays text.
        await page.keyboard.press('/')
        const search = page.getByTestId('bank-review-search')
        await expect(search).toBeFocused()
        await page.keyboard.type('j')
        await expect(search).toHaveValue('j')
        await expect.poll(() => shownNames(page, names)).toEqual([c, b, a])
        expect(await focusedNames(page, names)).toEqual([])

        // Esc leaves the field; with the drawer closed Esc clears the choice.
        await page.keyboard.press('Escape')
        await expect(search).not.toBeFocused()
        await page.keyboard.press('a')
        await expect(selectionText).toHaveText('3 selected · Spent $30.00 · Received $30.00')
        await page.keyboard.press('Escape')
        await expect(selection).toHaveCount(0)

        // U opens the Files tab with the file chooser.
        const chooser = page.waitForEvent('filechooser')
        await page.keyboard.press('u')
        await chooser
        await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
        await expect(page).toHaveURL(/[?&]tab=files(&|$)/)
    })
})
