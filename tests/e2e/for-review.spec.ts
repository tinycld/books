import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openChart } from './account-register-helpers'
import { fileRowByName } from './bank-import-helpers'
import { BANKING_DESKTOP, bankCard, connectionIdOf, openBanking } from './banking-helpers'
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
