import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PHONE,
    payBillsCard,
    pickSelect,
    vendorWithBills,
} from './pay-bills-helpers'
import { uniqueName } from './vendor-form-helpers'

// Pay Bills at 390 (spec §3.2, §3.3, §3.4): the band stacks under the title with the figure,
// the open bills are cards with their own Pay all, and the bar moves Pay & new into More —
// other components than the wide grid and bar. Books opens at the default viewport (the
// desktop rail), then the page is sized to a phone. The test makes its own vendor and bills.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

async function boxOf(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} has no box`)
    return box
}

// The given bills' ids in the order their cards sit on screen, top to bottom (other cards
// left out). A card not drawn yet counts as missing.
function cardOrder(page: Page, billIds: readonly string[]) {
    return page.evaluate(
        wanted =>
            wanted
                .map(id => ({
                    id,
                    el: document.querySelector(`[data-testid="pay-bills-card-${id}"]`),
                }))
                .filter(card => card.el !== null)
                .map(card => ({ id: card.id, top: card.el?.getBoundingClientRect().top ?? 0 }))
                .sort((a, b) => a.top - b.top)
                .map(card => card.id),
        [...billIds]
    )
}

// Opens the cards' sort chip and picks a choice.
async function chooseSort(page: Page, label: 'Vendor' | 'Due date') {
    await page.getByTestId('pay-bills-sort').click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
}

test.describe('pay-bills: phone cards', () => {
    test('bills are paid from cards at phone size', async ({ page }) => {
        await openBooks(page)
        // Names whose order is known: "PB Phone Alpha …" before "PB Phone Beta …".
        const { vendor, bills } = await vendorWithBills(page, {
            name: uniqueName('PB Phone Alpha'),
            bills: [
                { amount: '300.00', due: await localDay(page, 3), billNo: '88412' },
                { amount: '200.00', due: await localDay(page, 9) },
            ],
        })
        const beta = await vendorWithBills(page, {
            name: uniqueName('PB Phone Beta'),
            bills: [{ amount: '40.00', due: await localDay(page, 1) }],
        })
        const [first, second] = bills
        const [betaBill] = beta.bills
        await openPayBills(page)
        // Paid from is set at desktop width (its menu is the same component at both sizes).
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await page.setViewportSize(PHONE)

        // The figure sits under the title; the band's fields stack in order.
        await expect
            .poll(async () => {
                const title = await boxOf(page, 'pay-bills-title')
                const figure = await boxOf(page, 'pay-bills-figure')
                return figure.y >= title.y + title.height
            })
            .toBe(true)
        await expect
            .poll(async () => {
                const tops: number[] = []
                for (const id of ['pay-bills-paid-from', 'pay-bills-date', 'pay-bills-method']) {
                    tops.push((await boxOf(page, id)).y)
                }
                return tops.every((top, index) => index === 0 || top > tops[index - 1])
            })
            .toBe(true)

        // Cards, not the grid.
        await expect(page.getByTestId('pay-bills-cards')).toBeVisible()
        await expect(page.getByTestId('pay-bills-grid')).toHaveCount(0)

        // The cards have a touch sort control: due date first; Vendor sorts by vendor name,
        // choosing it again reverses; Due date sorts by due date again.
        const ours = [first.id, second.id, betaBill.id]
        await expect.poll(() => cardOrder(page, ours)).toEqual([betaBill.id, first.id, second.id])
        await chooseSort(page, 'Vendor')
        await expect.poll(() => cardOrder(page, ours)).toEqual([first.id, second.id, betaBill.id])
        await chooseSort(page, 'Vendor')
        await expect.poll(() => cardOrder(page, ours)).toEqual([betaBill.id, second.id, first.id])
        await chooseSort(page, 'Due date')
        await expect.poll(() => cardOrder(page, ours)).toEqual([betaBill.id, first.id, second.id])

        await expect(page.getByTestId('pay-bills-paid-from')).toContainText(CHECKING)
        await filterToVendor(page, vendor)
        const card1 = payBillsCard(page, first.id)
        const card2 = payBillsCard(page, second.id)
        await expect(card1).toContainText(`Bill ${first.number} · No. 88412`)
        await expect(card1).toContainText(vendor.name)
        await expect(card2).toContainText(`Bill ${second.number}`)

        // Pay all ticks both cards.
        const amount1 = card1.getByTestId(`pay-bills-row-amount-${first.id}`)
        const amount2 = card2.getByTestId(`pay-bills-row-amount-${second.id}`)
        await page.getByTestId('pay-bills-tick-all').click()
        await expect(amount1).toHaveValue('300.00')
        await expect(amount2).toHaveValue('200.00')

        // A partial amount on card 1.
        await amount1.fill('125.00')
        await expect(page.getByTestId('pay-bills-figure')).toContainText('$325.00')

        // The phone bar: Cancel, Pay, More; Pay & new is a row of More.
        await expect(page.getByTestId('pay-bills-cancel')).toBeVisible()
        await expect(page.getByTestId('pay-bills-pay')).toBeVisible()
        await expect(page.getByTestId('pay-bills-pay-new')).toHaveCount(0)
        await page.getByTestId('pay-bills-more').click()
        await expect(page.getByTestId('pay-bills-pay-new')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('pay-bills-pay-new')).toHaveCount(0)

        await page.getByTestId('pay-bills-pay').click()
        await expect(page.getByText(/^Posted Bill payment \d+$/)).toBeVisible()
    })
})
