import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    payBillsRowAmount,
    vendorWithBills,
} from './pay-bills-helpers'
import { uniqueName } from './vendor-form-helpers'

// Selecting bills, the filters and the header sorts on the wide grid (spec §3.3). The test
// makes two vendors with bills of its own and a third vendor with none; other workers'
// bills are listed too, so every check reads this test's rows only. Nothing is paid.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The given bills' ids in the order the grid lists them (other rows left out).
function orderOf(page: Page, billIds: readonly string[]) {
    return page.getByTestId('pay-bills-grid').evaluate(
        (grid, wanted) =>
            Array.from(grid.querySelectorAll('[data-testid^="pay-bills-row-"]'))
                .map(
                    el =>
                        /^pay-bills-row-([a-z0-9]{15})$/.exec(
                            el.getAttribute('data-testid') ?? ''
                        )?.[1]
                )
                .filter((id): id is string => id !== undefined && wanted.includes(id)),
        [...billIds]
    )
}

// A sort header marks its column with an arrow: an icon or an arrow glyph.
function hasArrow(header: Locator) {
    return header.evaluate(
        el => el.querySelector('svg') !== null || /[↑↓▲▼]/.test(el.textContent ?? '')
    )
}

test.describe('pay-bills: selection, filters and sort', () => {
    test('rows are selected, filtered and sorted', async ({ page }) => {
        await openBooks(page)
        const yesterday = await localDay(page, -1)
        const inTen = await localDay(page, 10)
        const inTwenty = await localDay(page, 20)
        // Names whose order is known: "PB Alpha …" before "PB Beta …".
        const alpha = await vendorWithBills(page, {
            name: uniqueName('PB Alpha'),
            bills: [
                { amount: '100.00', due: yesterday },
                { amount: '200.00', due: inTwenty },
            ],
        })
        const beta = await vendorWithBills(page, {
            name: uniqueName('PB Beta'),
            bills: [{ amount: '50.00', due: inTen }],
        })
        const idle = await vendorWithBills(page, { name: uniqueName('PB Idle'), bills: [] })
        const [a1, a2] = alpha.bills
        const [b1] = beta.bills
        const amountA1 = payBillsRowAmount(page, a1.id)
        const amountA2 = payBillsRowAmount(page, a2.id)
        const selected = page.getByTestId('pay-bills-selected')
        const figure = page.getByTestId('pay-bills-figure')

        await openPayBills(page)
        await filterToVendor(page, alpha.vendor)
        await expect(page.getByTestId('pay-bills-count')).toHaveText('2 open bills')

        // A tick pays the row's open balance; a second press clears it.
        const tickA1 = page.getByTestId(`pay-bills-row-tick-${a1.id}`)
        await tickA1.click()
        await expect(amountA1).toHaveValue('100.00')
        await expect(selected).toHaveText('1 bill selected · 1 vendor')
        await tickA1.click()
        await expect(amountA1).toHaveValue('')
        await expect(selected).toHaveText('No bills selected')

        // A typed amount ticks the row; 0 unticks it.
        await amountA1.fill('40.00')
        await expect(selected).toHaveText('1 bill selected · 1 vendor')
        await amountA1.fill('0')
        await expect(selected).toHaveText('No bills selected')

        // The header select box pays every shown row in full; again, it clears them.
        const tickAll = page.getByTestId('pay-bills-tick-all')
        await tickAll.click()
        await expect(amountA1).toHaveValue('100.00')
        await expect(amountA2).toHaveValue('200.00')
        await expect(figure).toContainText('$300.00')
        await tickAll.click()
        await expect(amountA1).toHaveValue('')
        await expect(amountA2).toHaveValue('')

        // ⌥A does the same from the keyboard.
        await page.keyboard.press('Alt+a')
        await expect(amountA1).toHaveValue('100.00')
        await expect(amountA2).toHaveValue('200.00')
        await page.keyboard.press('Alt+a')
        await expect(amountA1).toHaveValue('')
        await expect(amountA2).toHaveValue('')

        // ⌥⌫ and the Clear payments link each clear every row.
        await amountA2.fill('25.00')
        await expect(amountA2).toHaveValue('25.00')
        await page.keyboard.press('Alt+Backspace')
        await expect(amountA2).toHaveValue('')
        await expect(selected).toHaveText('No bills selected')
        await amountA1.fill('30.00')
        await page.getByTestId('pay-bills-clear').click()
        await expect(amountA1).toHaveValue('')
        await expect(selected).toHaveText('No bills selected')

        // Due → Overdue hides the bill not yet due, which keeps its payment and still counts.
        await page.getByTestId(`pay-bills-row-tick-${a2.id}`).click()
        await expect(amountA2).toHaveValue('200.00')

        // An amount that is not a number makes the figure "—" (spec §3.2); clearing it
        // restores the sum of the other rows.
        await expect(figure).toContainText('$200.00')
        await amountA1.fill('12.3.4')
        await expect(figure).toContainText('—')
        await expect(figure).not.toContainText('$')
        await amountA1.fill('')
        await expect(figure).toContainText('$200.00')
        await expect(figure).not.toContainText('—')

        const dueFilter = page.getByTestId('pay-bills-due-filter')
        await dueFilter.click()
        await page.getByRole('menuitem', { name: 'Overdue', exact: true }).click()
        await expect(dueFilter).toContainText('Overdue')
        await expect(page.getByTestId(`pay-bills-row-${a2.id}`)).toHaveCount(0)
        await expect(page.getByTestId(`pay-bills-row-${a1.id}`)).toBeVisible()
        await expect(page.getByTestId('pay-bills-count')).toHaveText('1 open bill')
        await expect(figure).toContainText('$200.00')
        await expect(selected).toHaveText('1 bill selected · 1 vendor')
        await expect(page.getByTestId('pay-bills-hidden')).toHaveText(
            '1 selected bill is hidden by the filter'
        )

        // Beta's only bill is not overdue: nothing matches; Clear filters lists every bill.
        await filterToVendor(page, beta.vendor)
        await expect(page.getByTestId('pay-bills-filter-empty')).toContainText(
            'No open bills match these filters.'
        )
        await page.getByTestId('pay-bills-clear-filters').click()
        await expect(page.getByTestId('pay-bills-vendor-filter')).toContainText('All vendors')
        await expect(dueFilter).toContainText('Any time')
        await expect(page.getByTestId(`pay-bills-row-${a2.id}`)).toBeVisible()
        await expect(amountA2).toHaveValue('200.00')
        await expect(page.getByTestId('pay-bills-hidden')).toHaveCount(0)

        // Order: due date ascending. The Vendor header sorts by vendor, then reverses; the
        // Due date header sorts by due date again.
        const sortVendor = page.getByTestId('pay-bills-sort-vendor')
        const sortDue = page.getByTestId('pay-bills-sort-due')
        const ours = [a1.id, a2.id, b1.id]
        await expect.poll(() => orderOf(page, ours)).toEqual([a1.id, b1.id, a2.id])
        await sortVendor.click()
        await expect.poll(() => orderOf(page, ours)).toEqual([a1.id, a2.id, b1.id])
        expect(await hasArrow(sortVendor)).toBe(true)
        expect(await hasArrow(sortDue)).toBe(false)
        await sortVendor.click()
        await expect.poll(() => orderOf(page, ours)).toEqual([b1.id, a2.id, a1.id])
        expect(await hasArrow(sortVendor)).toBe(true)
        await sortDue.click()
        await expect.poll(() => orderOf(page, ours)).toEqual([a1.id, b1.id, a2.id])
        expect(await hasArrow(sortDue)).toBe(true)
        expect(await hasArrow(sortVendor)).toBe(false)

        // A vendor with no open bill: nothing matches.
        await filterToVendor(page, idle.vendor)
        await expect(page.getByTestId('pay-bills-filter-empty')).toContainText(
            'No open bills match these filters.'
        )
        await expect(page.getByTestId('pay-bills-clear-filters')).toBeVisible()
    })
})
