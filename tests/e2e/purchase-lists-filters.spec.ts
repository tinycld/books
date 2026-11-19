import { expect, type Page, test } from '@playwright/test'
import { PURCHASE_LIST_SEED } from '../../tinycld/books/lib/purchase-lists-fixture'
import { uniqueMemo } from './invoice-helpers'
import {
    openPurchases,
    openPurchaseTab,
    pickPurchaseVendor,
    purchaseRow,
    searchPurchases,
} from './purchase-lists-helpers'
import { DESKTOP, openBooks, PHONE } from './record-form-helpers'

// The Expenses list's filters and sort (purchase-lists checkpoint 3, spec §3 "Search and
// filters" and "Sort"): the vendor picker (inactive vendors included), the status chips,
// search on number, reference and memo but not the vendor's name, the date-range menu,
// Clear filters, the per-tab state, the sortable headers with the signed amount order,
// and the cards' Sort menu on a phone. The tests only read the seeded rows
// (PURCHASE_LIST_SEED) and find them through the vendor picker.
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

const NW_PAPER = 'Northwest Paper Co.'
const NW_PAPER_ID = 'vendnwpaper0001'
const BRIGHTWAVE = 'Brightwave Marketing'
const OLD_TOWN = 'Old Town Print Shop'

const DRAFT_BILL = 'plbill00000draf'
const DRAFT_CREDIT = 'plvc0000000draf'
const DRAFT_REFUND = 'plvr0000000draf'
const CREDIT_31 = 'plvc00000000031'
const BILL_1054 = 'plbill000001054'
const NW_ROWS = [DRAFT_BILL, DRAFT_CREDIT, DRAFT_REFUND, CREDIT_31]

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^purchases-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// The ids of the visible rows (or cards), in screen order, read in one snapshot.
function rowOrder(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const pattern = /^purchases-row-([a-z0-9]{15})$/
        return Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-row-"]'))
            .filter(el => el.checkVisibility())
            .map(el => pattern.exec(el.dataset.testid ?? '')?.[1])
            .filter((id): id is string => id !== undefined)
    })
}

// The test ids of the open Sort menu's items, in menu order.
function sortItems(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-sort-"]'))
            .filter(el => el.checkVisibility())
            .map(el => el.dataset.testid ?? '')
            .filter(id => /^purchases-sort-[a-z]+-(up|down)$/.test(id))
    )
}

// Northwest Paper Co.'s seeded rows, ordered by the amount All purchases shows: a vendor
// credit counts negative, a vendor refund's amount is its `amount`.
function nwRowsBySignedAmount(): string[] {
    const amounts: [string, number][] = [
        ...PURCHASE_LIST_SEED.bills.map(row => [row.id, row.total] as [string, number]),
        ...PURCHASE_LIST_SEED.vendorCredits.map(row => [row.id, -row.total] as [string, number]),
        ...PURCHASE_LIST_SEED.vendorRefunds.map(row => [row.id, row.amount] as [string, number]),
    ]
    return amounts
        .filter(([id]) => NW_ROWS.includes(id))
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id)
}

function pickerOption(page: Page, name: string) {
    return page
        .getByTestId(/^purchases-vendor-option-[a-z0-9]{15}$/)
        .filter({ visible: true })
        .filter({ has: page.getByText(name, { exact: true }) })
}

async function pickChip(page: Page, chip: string) {
    await visible(page, `purchases-chip-${chip}`).click()
    await expect(visible(page, `purchases-chip-${chip}`)).toHaveAttribute('aria-pressed', 'true')
}

async function pickRange(page: Page, id: string, label: string) {
    await visible(page, 'purchases-range').click()
    await page.getByTestId(`purchases-range-${id}`).click()
    await expect(visible(page, 'purchases-range')).toContainText(label)
}

test.describe('purchase-lists: filters and sort', () => {
    test('narrows the list by vendor, chip, search and date range, and clears', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openPurchases(page)

        // The picker searches by display name, offers inactive vendors, and says when
        // nothing matches.
        await visible(page, 'purchases-vendor').click()
        const search = page.getByTestId('purchases-vendor-search').filter({ visible: true })
        await search.fill('Northwest')
        await expect(pickerOption(page, NW_PAPER)).toBeVisible()
        await search.fill(uniqueMemo('No vendor holds'))
        await expect(page.getByTestId('purchases-vendor-option-empty')).toBeVisible()
        await search.fill('Old Town')
        await expect(pickerOption(page, OLD_TOWN)).toBeVisible()
        await search.fill(NW_PAPER)
        await page.getByTestId(`purchases-vendor-option-${NW_PAPER_ID}`).click()
        await expect(search).toBeHidden()
        await expect(visible(page, 'purchases-vendor')).toContainText(NW_PAPER)

        // Northwest Paper Co.: its three drafts and its posted credit.
        for (const id of NW_ROWS) await expect(purchaseRow(page, id)).toBeVisible()
        await expect(listRows(page)).toHaveCount(4)

        // Draft leaves the posted credit out.
        await pickChip(page, 'draft')
        await expect(purchaseRow(page, CREDIT_31)).toHaveCount(0)
        await expect(listRows(page)).toHaveCount(3)

        // "rebate" matches the credit's memo and the draft refund's, not the draft bill.
        await pickChip(page, 'all')
        await searchPurchases(page, 'rebate')
        await expect(purchaseRow(page, CREDIT_31)).toBeVisible()
        await expect(purchaseRow(page, DRAFT_REFUND)).toBeVisible()
        await expect(listRows(page)).toHaveCount(2)
        await expect(purchaseRow(page, DRAFT_BILL)).toHaveCount(0)

        // Search does not match the vendor's name.
        await searchPurchases(page, 'Northwest')
        await expect(visible(page, 'purchases-no-match')).toContainText(
            'No purchase transactions match'
        )
        await expect(listRows(page)).toHaveCount(0)

        // Clear filters resets the search and the vendor.
        await visible(page, 'purchases-clear-filters').click()
        await expect(visible(page, 'purchases-vendor')).toContainText('All vendors')
        await expect(visible(page, 'purchases-search')).toHaveValue('')
        await expect(visible(page, 'purchases-chip-all')).toHaveAttribute('aria-pressed', 'true')
        await expect(visible(page, 'purchases-range')).toContainText('All dates')
        await expect(visible(page, 'purchases-no-match')).toHaveCount(0)
        await expect(listRows(page).first()).toBeVisible()
        await pickPurchaseVendor(page, NW_PAPER)
        for (const id of NW_ROWS) await expect(purchaseRow(page, id)).toBeVisible()

        // Brightwave Marketing: Overdue lists its bill, Draft lists nothing.
        await pickPurchaseVendor(page, BRIGHTWAVE)
        await pickChip(page, 'overdue')
        await expect(purchaseRow(page, BILL_1054)).toBeVisible()
        await expect(listRows(page)).toHaveCount(1)
        await pickChip(page, 'draft')
        await expect(visible(page, 'purchases-no-match')).toBeVisible()
        await expect(listRows(page)).toHaveCount(0)

        // The bill's fixed past date is never in the running month; All dates lists it.
        await pickChip(page, 'all')
        await pickRange(page, 'this-month', 'This month')
        await expect(visible(page, 'purchases-no-match')).toBeVisible()
        await expect(purchaseRow(page, BILL_1054)).toHaveCount(0)
        await pickRange(page, 'all-dates', 'All dates')
        await expect(purchaseRow(page, BILL_1054)).toBeVisible()

        // Each tab keeps its own filters.
        await searchPurchases(page, 'Autumn')
        await pickChip(page, 'overdue')
        await expect(purchaseRow(page, BILL_1054)).toBeVisible()
        await openPurchaseTab(page, 'bills')
        await expect(visible(page, 'purchases-search')).toHaveValue('')
        await expect(visible(page, 'purchases-chip-all')).toHaveAttribute('aria-pressed', 'true')
        await openPurchaseTab(page, 'all')
        await expect(visible(page, 'purchases-search')).toHaveValue('Autumn')
        await expect(visible(page, 'purchases-chip-overdue')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect(visible(page, 'purchases-vendor')).toContainText(BRIGHTWAVE)
        await expect(purchaseRow(page, BILL_1054)).toBeVisible()
    })

    test('sorts by a header, and by the Sort menu when the list draws cards', async ({ page }) => {
        const ascending = nwRowsBySignedAmount()
        expect(ascending[0]).toBe(CREDIT_31)

        await openBooks(page, DESKTOP)
        await openPurchases(page)
        await pickPurchaseVendor(page, NW_PAPER)
        for (const id of NW_ROWS) await expect(purchaseRow(page, id)).toBeVisible()

        // Amount ascending by the signed value, then descending.
        const amount = visible(page, 'purchases-header-amount')
        await amount.click()
        await expect(amount).toHaveAttribute('aria-sort', 'ascending')
        await expect.poll(() => rowOrder(page)).toEqual(ascending)
        await amount.click()
        await expect(amount).toHaveAttribute('aria-sort', 'descending')
        const descending = [...ascending].reverse()
        await expect.poll(() => rowOrder(page)).toEqual(descending)

        // Vendor and Category do not sort.
        for (const key of ['vendor', 'category']) {
            const header = visible(page, `purchases-header-${key}`)
            await expect(header).toBeVisible()
            await expect(header).not.toHaveAttribute('aria-sort')
            await header.click()
            await expect(amount).toHaveAttribute('aria-sort', 'descending')
            await expect.poll(() => rowOrder(page)).toEqual(descending)
        }

        // Cards have no header; the Sort menu lists Date, No. and Amount both ways.
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'purchases-cards')).toBeVisible()
        await expect(page.getByTestId('purchases-header')).toHaveCount(0)
        await visible(page, 'purchases-sort').click()
        await expect
            .poll(async () => [...(await sortItems(page))].sort())
            .toEqual(
                [
                    'purchases-sort-date-up',
                    'purchases-sort-date-down',
                    'purchases-sort-number-up',
                    'purchases-sort-number-down',
                    'purchases-sort-amount-up',
                    'purchases-sort-amount-down',
                ].sort()
            )
        await page.getByTestId('purchases-sort-amount-up').click()
        await expect.poll(() => rowOrder(page)).toEqual(ascending)
    })
})
