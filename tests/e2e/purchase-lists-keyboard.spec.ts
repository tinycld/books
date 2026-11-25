import { expect, type Page, test } from '@playwright/test'
import {
    openPurchases,
    pickPurchaseVendor,
    purchaseRow,
    purchaseTabUrl,
} from './purchase-lists-helpers'
import { DESKTOP, openBooks } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'

// The purchase list keys (purchase-lists checkpoint 4, spec §3 "Keyboard"): after the
// Expenses area opens and Northwest Paper Co. is picked, the test uses the keyboard only.
// `/` focuses the search field and Escape leaves it; J and K move the row focus; X ticks
// the focused row and A ticks, then clears, every loaded row; 2 and 1 switch tabs; N on
// Bills opens a new bill; Enter opens the focused row; the ⇧? list shows the keys in the
// group "Expenses" with the area's tab labels. The test only reads the seeded rows of
// Northwest Paper Co. (PURCHASE_LIST_SEED). "A key is registered only while its action is
// offered" is proven by tests/list-shortcuts.test.ts (checkpoint 2).
//
// Not covered by e2e (accepted, plan checkpoint 4):
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

const NW_PAPER = 'Northwest Paper Co.'
// Where each seeded kind of Northwest Paper Co.'s rows opens, by its id's prefix.
const ROUTE_OF_PREFIX: [RegExp, string][] = [
    [/^plbill/, 'bills'],
    [/^plvc/, 'vendor-credits'],
    [/^plvr/, 'vendor-refunds'],
]

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^purchases-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// The ids of the visible rows, in list order, read in one snapshot.
function rowIdsInOrder(page: Page): Promise<string[]> {
    return listRows(page).evaluateAll(rows =>
        rows.map(row => (row.getAttribute('data-testid') ?? '').replace(/^purchases-row-/, ''))
    )
}

// The id of the row that holds the row focus (`aria-current="true"`), or null.
function focusedRowId(page: Page): Promise<string | null> {
    return listRows(page).evaluateAll(rows => {
        const row = rows.find(el => el.getAttribute('aria-current') === 'true')
        return row ? (row.getAttribute('data-testid') ?? '').replace(/^purchases-row-/, '') : null
    })
}

function documentRoute(id: string): string {
    const route = ROUTE_OF_PREFIX.find(([prefix]) => prefix.test(id))?.[1]
    if (route === undefined) throw new Error(`no route for ${id}`)
    return route
}

async function pressTab(page: Page, key: string, tabKey: string) {
    await page.keyboard.press(key)
    await expect(page).toHaveURL(purchaseTabUrl(tabKey))
    await expect(visible(page, `purchases-tab-${tabKey}`)).toHaveAttribute('aria-selected', 'true')
}

async function expectFocusedRow(page: Page, focused: string, other: string) {
    await expect(purchaseRow(page, focused)).toHaveAttribute('aria-current', 'true')
    await expect(purchaseRow(page, other)).not.toHaveAttribute('aria-current', 'true')
}

async function expectTicked(page: Page, id: string, ticked: boolean) {
    await expect(visible(page, `purchases-tick-${id}`)).toHaveAttribute(
        'aria-checked',
        ticked ? 'true' : 'false'
    )
}

function shortcutList(page: Page) {
    return page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
}

test.describe('purchase-lists: keys', () => {
    test('runs the list from the keyboard', async ({ page }) => {
        await openBooks(page, DESKTOP)
        await openPurchases(page)
        await pickPurchaseVendor(page, NW_PAPER)
        await expect(listRows(page)).toHaveCount(4)
        const ids = await rowIdsInOrder(page)
        const [first, second] = ids
        if (first === undefined || second === undefined) throw new Error('rows not listed')

        // From here on, no click. The pick gives the focus back to the closed vendor picker's
        // trigger; the list keys must still win over its type-to-open, so `/` right after the
        // pick focuses the search field. Escape leaves it.
        const search = visible(page, 'purchases-search')
        await page.keyboard.press('/')
        await expect(search).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search).not.toBeFocused()

        // J and K move the row focus between the first two rows.
        await page.keyboard.press('j')
        await expectFocusedRow(page, first, second)
        await page.keyboard.press('j')
        await expectFocusedRow(page, second, first)
        await page.keyboard.press('k')
        await expectFocusedRow(page, first, second)

        // X ticks the focused row; A ticks every row, A again clears them.
        await page.keyboard.press('x')
        await expectTicked(page, first, true)
        await expectTicked(page, second, false)
        await page.keyboard.press('a')
        for (const id of ids) await expectTicked(page, id, true)
        await page.keyboard.press('a')
        for (const id of ids) await expectTicked(page, id, false)

        // The ⇧? list shows the list keys in the group "Expenses", with the area's tab
        // labels, and no group "Sales".
        await page.keyboard.press('Shift+?')
        const list = shortcutList(page)
        await expect(list).toBeVisible()
        const billsKey = list.getByText('Bills', { exact: true })
        await expect(billsKey).toHaveCount(1)
        // A key row's parent is its group, whose first child is the group's name.
        const group = billsKey.locator('xpath=../..')
        await expect(group.locator('xpath=./*[1]')).toHaveText('Expenses')
        await expect(list.getByText('Sales', { exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)

        // 2 shows Bills and 1 All purchases.
        await pressTab(page, '2', 'bills')
        await pressTab(page, '1', 'all')

        // N on Bills opens a new bill.
        await pressTab(page, '2', 'bills')
        await page.keyboard.press('n')
        await expect(page).toHaveURL(/\/books\/bills\/new(?:[?#].*)?$/)
        await expect(visible(page, 'bill-form')).toBeVisible()

        // Back on the list, Enter opens the focused row's document.
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('bills'))
        await pressTab(page, '1', 'all')
        await expect(listRows(page)).toHaveCount(4)
        await page.keyboard.press('j')
        await expect.poll(() => focusedRowId(page)).not.toBeNull()
        const focused = await focusedRowId(page)
        if (focused === null) throw new Error('no row focused')
        await page.keyboard.press('Enter')
        await expectRecordUrl(page, documentRoute(focused), focused)
    })
})
