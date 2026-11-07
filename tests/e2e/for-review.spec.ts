import { expect, type Locator, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { fileRowByName } from './bank-import-helpers'
import { BANKING_DESKTOP, bankCard, connectionIdOf, openBanking } from './banking-helpers'
import { importReviewStatement, openReviewTab, reviewRow } from './for-review-helpers'

// Test 1 connects its own number-less account and imports its own OFX file through the UI.
// Test 2 only reads the seeded connections: 1000 Business Checking, whose seeded
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
