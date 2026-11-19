import { expect, type Page, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import {
    openPurchases,
    openPurchaseTab,
    pickPurchaseVendor,
    purchaseRow,
    purchaseTabUrl,
    searchPurchases,
} from './purchase-lists-helpers'
import { DESKTOP, openBooks, PHONE } from './record-form-helpers'
import { openVendor } from './vendor-form-helpers'

// The Expenses area's tabs and rows (purchase-lists checkpoint 3, spec §2 and §3 "Tabs and
// header", "Rows and columns", "Opening a document"): the Expenses sidebar entry, a tab
// press that replaces the list route, a row's cells, the cards below the table's own
// minimum width, the All purchases New menu, and a document opened from a list as a page
// or beside the 320 px names column. The tests only read the seeded rows
// (PURCHASE_LIST_SEED) and find them by their vendor or their memo.
//
// Not covered by e2e (accepted, plan checkpoint 3):
// - the 50-row window growing (the hook test of checkpoint 1 covers it with 120 rows);
// - the "No bills yet" state (the shared e2e database always holds bills; `emptyTexts` is
//   unit-tested and gate 2 compares the `empty-*` shots);
// - the chip matrix beyond Draft and Overdue, the row menu of a void row, of an expense
//   and of a vendor refund, and the vendor refund's Void text (unit case tables);
// - the pending state of a confirm dialog (the shared dialog, proven by
//   tests/e2e/sales-lists-actions.spec.ts);
// - the vendor picker's load error with Retry (`SearchPicker`'s own state, proven for the
//   same component by tests/e2e/sales-lists-filters.spec.ts);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const DASH = '—'
const MINUS = '−'
const WIDE = { width: 1440, height: 900 }

const NW_PAPER = 'Northwest Paper Co.'
const ZENITH = 'Zenith Telecom'
const CREDIT_31 = 'plvc00000000031'
const DRAFT_BILL = 'plbill00000draf'
const DRAFT_REFUND = 'plvr0000000draf'
const BILL_1057 = 'plbill000001057'
// The product on the credit's one line, and on the draft bill's.
const ACCESS_POINT = 'Wireless access point'
const PAPER_CASE = 'Printer paper, case'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// The text of a row's cell in a column: the row's text pieces that sit under that
// column's header cell, read in one snapshot.
function cellUnder(page: Page, rowId: string, columnKey: string): Promise<string> {
    return page.evaluate(
        ({ rowId, columnKey }) => {
            const shown = (selector: string) =>
                Array.from(document.querySelectorAll<HTMLElement>(selector)).find(el =>
                    el.checkVisibility()
                )
            const header = shown(`[data-testid="purchases-header-${columnKey}"]`)
            const row = shown(`[data-testid="purchases-row-${rowId}"]`)
            if (!header || !row) return `missing ${header ? 'row' : 'header'}`
            const column = header.getBoundingClientRect()
            const pieces: string[] = []
            for (const el of Array.from(row.querySelectorAll<HTMLElement>('*'))) {
                const text = el.children.length === 0 ? (el.textContent ?? '').trim() : ''
                if (text === '') continue
                const box = el.getBoundingClientRect()
                const middle = box.left + box.width / 2
                if (middle >= column.left && middle <= column.right) pieces.push(text)
            }
            return pieces.join(' ')
        },
        { rowId, columnKey }
    )
}

// The keys of the visible table's header cells, in screen order.
function headerKeys(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-header-"]'))
            .filter(el => el.checkVisibility())
            .map(el => /^purchases-header-([a-z]+)$/.exec(el.dataset.testid ?? '')?.[1])
            .filter((key): key is string => key !== undefined)
    )
}

// The suffixes of the open New menu's items, in menu order.
function newMenuItems(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-new-"]'))
            .filter(el => el.checkVisibility())
            .map(el => /^purchases-new-([a-z-]+)$/.exec(el.dataset.testid ?? '')?.[1])
            .filter((item): item is string => item !== undefined)
    )
}

// How many `testId` elements a user can see or reach: shown, and under no `aria-hidden`
// or `inert` ancestor. A kind list stays mounted under a pushed page (Back returns to it
// with its scroll and filters), covered and marked `inert` + `aria-hidden`.
function reachableCount(page: Page, testId: string): Promise<number> {
    return page.evaluate(
        id =>
            Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)).filter(
                el => el.checkVisibility() && el.closest('[aria-hidden="true"], [inert]') === null
            ).length,
        testId
    )
}

// SidebarItem draws an active entry's label semibold.
function navLabel(page: Page) {
    return page.getByTestId('books-nav-expenses').getByText('Expenses', { exact: true })
}

test.describe('purchase-lists: tabs and rows', () => {
    test('opens the Expenses area, reads its rows and moves between tabs', async ({ page }) => {
        await openBooks(page, DESKTOP)
        // Books lands on the Lists hub (it replaces `/a/books`); that hub is the screen
        // before the area.
        await expect(page).toHaveURL(/\/books\/lists$/)
        await expect(visible(page, 'books-list-card-vendors')).toBeVisible()
        const before = page.url()

        // The sidebar entry opens All purchases and is marked active.
        await openPurchases(page)
        await expect(visible(page, 'purchases-title')).toHaveText('Expenses')
        await expect(navLabel(page)).toHaveClass(/font-semibold/)
        await expect(visible(page, 'purchases-table')).toBeVisible()

        // Northwest Paper Co.'s vendor credit: its type, its negative amount, its badge and
        // its line's product.
        await pickPurchaseVendor(page, NW_PAPER)
        await expect(purchaseRow(page, CREDIT_31)).toBeVisible()
        await expect.poll(() => cellUnder(page, CREDIT_31, 'type')).toBe('Vendor credit')
        await expect.poll(() => cellUnder(page, CREDIT_31, 'amount')).toBe(`${MINUS}$400.00`)
        await expect(visible(page, `purchases-status-${CREDIT_31}`)).toHaveText('Unapplied')
        await expect.poll(() => cellUnder(page, CREDIT_31, 'category')).toBe(ACCESS_POINT)

        // A draft has no number; a vendor refund has no category.
        await expect.poll(() => cellUnder(page, DRAFT_BILL, 'number')).toBe(DASH)
        await expect.poll(() => cellUnder(page, DRAFT_REFUND, 'category')).toBe(DASH)

        // A bill of two lines reads "Split".
        await pickPurchaseVendor(page, ZENITH)
        await expect(purchaseRow(page, BILL_1057)).toBeVisible()
        await expect.poll(() => cellUnder(page, BILL_1057, 'category')).toBe('Split')

        // The Bills tab: its own columns, its route, its New label; the entry stays active.
        await openPurchaseTab(page, 'bills')
        await expect
            .poll(() => headerKeys(page))
            .toEqual(['date', 'number', 'vendor', 'due', 'balance', 'total', 'status'])
        await expect(visible(page, 'purchases-header-category')).toHaveCount(0)
        await expect(page).toHaveURL(/\/books\/bills$/)
        await expect(navLabel(page)).toHaveClass(/font-semibold/)
        await expect(visible(page, 'purchases-new')).toHaveText('New bill')

        // All purchases' New is a menu of the five kinds, in NEW_ACTIONS order.
        await openPurchaseTab(page, 'all')
        const newButton = visible(page, 'purchases-new')
        await expect(newButton).toHaveText('New')
        await newButton.click()
        await expect
            .poll(() => newMenuItems(page))
            .toEqual(['bill', 'pay-bills', 'expense', 'vendor-credit', 'vendor-refund'])

        // Pay bills covers the list; Back returns to it.
        await page.getByTestId('purchases-new-pay-bills').click()
        await expect(page).toHaveURL(/\/books\/pay-bills(?:[?#].*)?$/)
        await expect(visible(page, 'pay-bills-form')).toBeVisible()
        await expect.poll(() => reachableCount(page, 'purchases-list')).toBe(0)
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect(visible(page, 'purchases-list')).toBeVisible()

        // The tab presses replaced the list route, so one more Back leaves the area.
        await page.goBack()
        await expect(page).toHaveURL(before)
    })

    test('draws cards on a phone and opens a draft as a page', async ({ page }) => {
        await openBooks(page, DESKTOP)
        await openPurchases(page)
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'purchases-cards')).toBeVisible()
        await expect(visible(page, 'purchases-table')).toHaveCount(0)

        // The draft bill's card: its type and vendor, and no category.
        await searchPurchases(page, 'Paper restock')
        const card = purchaseRow(page, DRAFT_BILL)
        await expect(card).toBeVisible()
        await expect(card).toContainText('Bill')
        await expect(card).toContainText(NW_PAPER)
        await expect(card).toContainText('$486.00')
        await expect(card).not.toContainText(PAPER_CASE)

        // A press opens the bill form as a page, with no list on screen.
        await card.click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${DRAFT_BILL}$`))
        await expect(visible(page, 'bill-form')).toBeVisible()
        await expect.poll(() => reachableCount(page, 'purchases-list')).toBe(0)

        // Back shows the cards with the search kept.
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect(visible(page, 'purchases-cards')).toBeVisible()
        await expect(visible(page, 'purchases-search')).toHaveValue('Paper restock')
        await expect(purchaseRow(page, DRAFT_BILL)).toBeVisible()
    })

    test("shows a document beside its kind's list", async ({ page }) => {
        await openBooks(page, DESKTOP)
        await openPurchases(page)
        // The Bills list beside the bill is its own tab's list: its search holds the bill's
        // memo, so the bill is among the column's rows on the shared database.
        await openPurchaseTab(page, 'bills')
        await searchPurchases(page, 'Hosted phone plan')
        await page.setViewportSize(WIDE)

        // From the Bills list, View journal entry takes the read view's place, so Back
        // returns to the Bills list with its search kept.
        await purchaseRow(page, BILL_1057).click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${BILL_1057}$`))
        await expect(visible(page, 'bill-read-only')).toBeVisible()
        await visible(page, 'bill-read-entry').click()
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = visible(page, 'entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Bill')
        // The entry's in-app back link names the Bills list and returns to it.
        const back = visible(page, 'entry-back')
        await expect(back.getByText('Bills', { exact: true })).toBeVisible()
        await back.click()
        await expect(page).toHaveURL(purchaseTabUrl('bills'))
        await expect.poll(() => reachableCount(page, 'purchases-list')).toBe(1)
        await expect(visible(page, 'purchases-search')).toHaveValue('Hosted phone plan')

        await openPurchaseTab(page, 'all')

        // From All purchases narrowed to Zenith Telecom: the bill lands on its own route,
        // beside the column, with its row marked.
        await pickPurchaseVendor(page, ZENITH)
        await purchaseRow(page, BILL_1057).click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${BILL_1057}$`))
        const column = visible(page, 'purchases-names')
        await expect(column).toBeVisible()
        const marked = column.getByTestId(`purchases-name-row-${BILL_1057}`)
        await expect(marked).toHaveAttribute('aria-current', 'true')
        await expect(visible(page, 'bill-read-only')).toBeVisible()

        // The column keeps the search field and draws no filter.
        const columnSearch = column.getByTestId('purchases-search')
        await expect(columnSearch).toBeVisible()
        await expect(visible(page, 'purchases-chip-all')).toHaveCount(0)
        await expect(visible(page, 'purchases-range')).toHaveCount(0)
        await expect(visible(page, 'purchases-vendor')).toHaveCount(0)

        // A search the bill does not match keeps the read view and marks no row.
        await columnSearch.fill('Paper restock')
        await expect(column.getByTestId(`purchases-name-row-${DRAFT_BILL}`)).toBeVisible()
        await expect(column.locator('[aria-current="true"]')).toHaveCount(0)
        await expect(visible(page, 'bill-read-only')).toBeVisible()

        // A search nothing matches: the no-match state, with no New button.
        await columnSearch.fill(uniqueMemo('Nothing holds'))
        await expect(column.getByTestId('purchases-no-match')).toBeVisible()
        await expect(visible(page, 'purchases-empty-new')).toHaveCount(0)
        await columnSearch.fill('Hosted phone plan')
        await expect(marked).toHaveAttribute('aria-current', 'true')

        // From the vendor page's Transactions tab the bill lands beside the column too.
        // openVendor starts from the shown Lists hub.
        await page.getByTestId('books-nav-lists').click()
        await expect(visible(page, 'books-list-card-vendors')).toBeVisible()
        await openVendor(page, ZENITH)
        await page.getByTestId('vendor-tab-transactions').click()
        await page.getByTestId(`vendor-transaction-${BILL_1057}`).click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${BILL_1057}$`))
        await expect(visible(page, 'purchases-names')).toBeVisible()
        await expect(
            visible(page, 'purchases-names').getByTestId(`purchases-name-row-${BILL_1057}`)
        ).toHaveAttribute('aria-current', 'true')

        // New in the column opens a new bill beside it; a row press over the typed memo
        // asks first, and Keep editing keeps the form and the memo.
        await visible(page, 'purchases-names').getByTestId('purchases-new').click()
        await expect(page).toHaveURL(/\/books\/bills\/new(?:[?#].*)?$/)
        await expect(visible(page, 'purchases-names')).toBeVisible()
        const memo = visible(page, 'form-input-memo')
        const typed = uniqueMemo('Unsaved beside')
        await memo.fill(typed)
        await visible(page, 'purchases-names')
            .getByTestId(`purchases-name-row-${BILL_1057}`)
            .click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByRole('button', { name: 'Keep editing' }).click()
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page).toHaveURL(/\/books\/bills\/new(?:[?#].*)?$/)
        await expect(visible(page, 'form-input-memo')).toHaveValue(typed)
    })
})
