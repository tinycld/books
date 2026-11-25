import { expect, type Page, test } from '@playwright/test'
import { PHONE } from './account-register-helpers'
import { openMoreMenu } from './audit-log-helpers'
import {
    depositIdFromUrl,
    openBooks,
    openDepositBySearch,
    SEEDED_DEPOSIT,
    searchToDeposit,
    shownDeposit,
} from './bank-deposit-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { SALES_RECEIPT_URL } from './sales-receipt-helpers'

// The deposit read view (bank deposit spec §3.8, §3.9, §3.2): the seeded posted deposit
// opened through Books search, its header, details, items, other funds, totals, memo and
// stamp; its keys in the ⇧? list; J to its journal entry; the item's link to its sales
// receipt; the phone layout; the load error with Retry; the Void dialog's own key scope;
// and the back link to Journal entries. The seeded deposit is only read: no test voids or
// edits it, and no step posts a seeded item.

// The read view's deposit read (pbtsdb), and only it: items and lines are other
// collections (books_deposit_items, books_deposit_lines).
const DEPOSIT_READ = '**/api/collections/books_deposits/records**'

const LOAD_ERROR = 'Books could not load this deposit.'

// The entry read view's lines, in one snapshot: account label, debit and credit.
function readEntryLines(page: Page) {
    return page
        .getByTestId('entry-read-only')
        .filter({ visible: true })
        .evaluate(root => {
            const text = (id: string) =>
                (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
            const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
            return Array.from({ length: count }, (_, i) => ({
                account: text(`entry-line-account-${i}`),
                debit: text(`entry-line-debit-${i}`),
                credit: text(`entry-line-credit-${i}`),
            }))
        })
}

// Whether any scroller of the read view (or the page itself) scrolls sideways.
function scrollsSideways(page: Page) {
    return shownDeposit(page, 'deposit-read-only').evaluate(root => {
        const scrollers = [
            document.documentElement,
            root,
            ...Array.from(root.querySelectorAll<HTMLElement>('*')).filter(el => {
                const overflow = getComputedStyle(el).overflowX
                return overflow === 'auto' || overflow === 'scroll'
            }),
        ]
        return scrollers.some(el => el.scrollWidth > el.clientWidth)
    })
}

test.describe('bank-deposit: read view', () => {
    test('a writer reads the seeded deposit, its keys, its entry and its item, wide and at 390', async ({
        page,
    }) => {
        await openBooks(page)
        await openDepositBySearch(page, SEEDED_DEPOSIT.memo)
        const id = await depositIdFromUrl(page)
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()

        // Header: "Deposit <n>", Posted, the Deposit total; Deposit to.
        const title = shownDeposit(page, 'deposit-title')
        await expect(title).toHaveText(/^Deposit \d+$/)
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Posted')
        await expect(shownDeposit(page, 'deposit-figure')).toContainText(SEEDED_DEPOSIT.total)
        await expect(shownDeposit(page, 'deposit-detail-account')).toContainText(
            SEEDED_DEPOSIT.depositTo
        )

        // Items deposited: one row, the sales receipt, with its link.
        const grid = shownDeposit(page, 'deposit-read-items-grid')
        const items = grid.locator('[data-testid^="deposit-read-item-"]')
        await expect(items).toHaveCount(1)
        await expect(items).toContainText(SEEDED_DEPOSIT.itemAmount)
        const receiptLink = items.getByRole('link', { name: /^Sales receipt \d+$/ })
        await expect(receiptLink).toBeVisible()

        // Other funds: the one interest line.
        const linesTable = shownDeposit(page, 'deposit-read-lines-table')
        const lines = linesTable.locator('[data-testid^="deposit-read-line-"]')
        await expect(lines).toHaveCount(1)
        await expect(lines).toContainText(SEEDED_DEPOSIT.lineDescription)
        await expect(lines).toContainText(SEEDED_DEPOSIT.lineAmount)

        // Selected items, Other funds, Deposit total; the memo; Posted by.
        await expect(shownDeposit(page, 'deposit-total-items')).toContainText(
            SEEDED_DEPOSIT.itemAmount
        )
        await expect(shownDeposit(page, 'deposit-total-lines')).toContainText(
            SEEDED_DEPOSIT.lineAmount
        )
        await expect(shownDeposit(page, 'deposit-total')).toContainText(SEEDED_DEPOSIT.total)
        await expect(shownDeposit(page, 'deposit-memo-text')).toContainText(SEEDED_DEPOSIT.memo)
        await expect(shownDeposit(page, 'deposit-posted-by')).toHaveText(/^Posted by \S/)

        // A writer on a posted deposit: Edit, Void and View journal entry.
        await expect(shownDeposit(page, 'deposit-read-edit')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-entry')).toBeVisible()

        // ⇧? lists the read view's keys under "Bank deposit"; Escape closes only the list.
        await page.keyboard.press('Shift+?')
        const shortcutList = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(shortcutList).toBeVisible()
        const group = shortcutList.getByText('Bank deposit', { exact: true }).locator('..')
        await expect(group.getByText('Edit', { exact: true })).toBeVisible()
        await expect(group.getByText('Void', { exact: true })).toBeVisible()
        await expect(group.getByText('View journal entry', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shortcutList).toHaveCount(0)
        await expectRecordUrl(page, 'deposits', id)

        // J: the deposit's journal entry debits 1000 Business Checking for the total.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        await expect
            .poll(async () =>
                (await readEntryLines(page)).some(
                    line =>
                        line.account.includes(SEEDED_DEPOSIT.depositTo) &&
                        line.debit === SEEDED_DEPOSIT.total
                )
            )
            .toBe(true)
        // The entry's back link names the deposit and returns to it.
        const entryBack = page.getByTestId('entry-back').filter({ visible: true })
        await expect(entryBack).toContainText('Deposit')
        await entryBack.click()
        await expectRecordUrl(page, 'deposits', id)
        await expect(title).toHaveText(/^Deposit \d+$/)

        // The item's Transaction link opens its sales receipt, whose back link names the
        // deposit and returns to it.
        await receiptLink.click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(shownDeposit(page, 'sales-receipt-read-only')).toBeVisible()
        const receiptBack = page.getByTestId('entry-back').filter({ visible: true })
        await expect(receiptBack).toContainText('Deposit')
        await receiptBack.click()
        await expectRecordUrl(page, 'deposits', id)
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()

        // At 390: items and other funds as cards, no grid, no sideways scroll, and Void in
        // the phone bar's More.
        await page.setViewportSize(PHONE)
        await expect(shownDeposit(page, 'deposit-read-items-cards')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-lines-cards')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-items-grid')).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-read-lines-table')).toHaveCount(0)
        await expect.poll(() => scrollsSideways(page)).toBe(false)
        const moreItems = await openMoreMenu(page, 'deposit-read-more')
        await expect(moreItems.filter({ hasText: /^Void/ })).toHaveCount(1)
    })

    test('a refused read shows the error with Retry; the Void dialog holds the keys; back goes to Journal entries', async ({
        page,
    }) => {
        await openBooks(page)

        // Opened by search while its read fails: the load error with Retry.
        await page.route(DEPOSIT_READ, route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
        await searchToDeposit(page, SEEDED_DEPOSIT.memo)
        const id = await depositIdFromUrl(page)
        await expect(shownDeposit(page, 'deposit-message')).toContainText(LOAD_ERROR)
        const retry = shownDeposit(page, 'deposit-retry')
        await expect(retry).toBeVisible()

        // With the read let through, Retry shows the read view.
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-message')).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Posted')

        // V opens the Void dialog with the deposit's text; while it is open J does nothing,
        // and Escape closes only the dialog: the deposit stays posted.
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(
            'A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again.'
        )
        await page.keyboard.press('j')
        await expect(dialog).toBeVisible()
        await expectRecordUrl(page, 'deposits', id)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expectRecordUrl(page, 'deposits', id)
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Posted')
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()

        // The header's back link returns to Journal entries.
        const back = shownDeposit(page, 'deposit-back')
        await expect(back).toContainText('Journal entries')
        await back.click()
        await expect(page).toHaveURL(/\/books\/entries$/)
        await expect(page.getByTestId('entries-screen').filter({ visible: true })).toBeVisible()
    })
})
