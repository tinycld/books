import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    payBillsCard,
    payBillsRow,
    payBillsRowAmount,
    vendorWithBills,
} from './pay-bills-helpers'
import {
    LIST_MARGIN,
    listWidth,
    rightEdge,
    sidewaysOverflow,
    viewportForListWidth,
} from './payment-grid-width-helpers'

// The Pay Bills grid against its list's own width (human, eval revise 1): every data column
// flexes with a least width of 95 px, so the grid needs tick 44 + 6 × 95 + 6 gaps of 12 +
// 2 × 8 padding = 702 px. A list a little wider shows the grid with no sideways scroll; a
// list a little narrower shows cards. The viewport for each list width is measured in the
// page (the layout decides the list's share), then Pay Bills is opened again at that
// viewport, so the screen is laid out at its width, not resized into it (lessons 16, 48).
// Each test makes its own vendor and bill.

const GRID_MIN_WIDTH = 44 + 6 * 95 + 6 * 12 + 2 * 8

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Opens Pay Bills, finds the viewport that gives its list `target` px, leaves, and opens
// Pay Bills again at that viewport.
async function openPayBillsWithListWidth(page: Page, target: number) {
    await openPayBills(page)
    const viewport = await viewportForListWidth(page, 'pay-bills-open', target)
    await page.goBack()
    await expect(page).not.toHaveURL(/\/books\/pay-bills/)
    await page.setViewportSize(viewport)
    await openPayBills(page)
    return viewport
}

test.describe('pay-bills: grid width', () => {
    test('a list a little wider than the grid’s least width shows the whole grid', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '410.00', due: await localDay(page, 6), billNo: '5521' }],
        })
        const [bill] = bills
        const viewport = await openPayBillsWithListWidth(page, GRID_MIN_WIDTH + LIST_MARGIN)
        await filterToVendor(page, vendor)

        await expect.poll(() => listWidth(page, 'pay-bills-open')).toBeGreaterThan(GRID_MIN_WIDTH)
        const grid = page.getByTestId('pay-bills-grid').filter({ visible: true })
        await expect(grid).toBeVisible()
        await expect(page.getByTestId('pay-bills-cards')).toHaveCount(0)
        await expect(payBillsRow(page, bill.id)).toBeVisible()

        // Nothing around the grid scrolls sideways: the grid fits its list.
        await expect.poll(() => sidewaysOverflow(grid)).toEqual([])

        // The Payment column is inside the viewport and inside the list.
        const amount = payBillsRowAmount(page, bill.id)
        await expect(amount).toBeVisible()
        const list = page.getByTestId('pay-bills-open').filter({ visible: true })
        await expect.poll(() => rightEdge(amount)).toBeLessThanOrEqual(viewport.width)
        await expect
            .poll(async () => (await rightEdge(amount)) <= (await rightEdge(list)) + 1)
            .toBe(true)
    })

    test('a list a little narrower than the grid’s least width shows cards', async ({ page }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '260.00', due: await localDay(page, 4) }],
        })
        const [bill] = bills
        await openPayBillsWithListWidth(page, GRID_MIN_WIDTH - LIST_MARGIN)
        await filterToVendor(page, vendor)

        await expect.poll(() => listWidth(page, 'pay-bills-open')).toBeLessThan(GRID_MIN_WIDTH)
        await expect(page.getByTestId('pay-bills-cards')).toBeVisible()
        await expect(page.getByTestId('pay-bills-grid')).toHaveCount(0)
        await expect(payBillsCard(page, bill.id)).toContainText(`Bill ${bill.number}`)
    })
})
