import { expect, test } from '@playwright/test'
import { localDay } from './receive-payment-helpers'
import {
    NEW_VENDOR_REFUND_URL,
    openBooks,
    openNewVendorRefund,
    pickRefundVendor,
    refundCell,
    refundRow,
    refundTick,
    vendorWithCredits,
} from './vendor-refund-helpers'

// How a refund is placed on a vendor's credits (spec §3.4, §3.5): ticks, the row keys, the
// typed amount spread oldest credit first, the Not placed line, the exact sum rule and a
// vendor change. Desktop; each test makes its own vendors and credits through the UI and
// writes nothing more (each Post is refused in the form). The vendor change is its own test,
// with one credit for each vendor, so the first test needs only one vendor.

const NOT_PLACED_20 =
    '$20.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.'
const ABOVE_180 = 'The refunds add up to $350.00, more than the $180.00 refunded'

test.describe('vendor-refund: allocation', () => {
    test('places the refund on the credits by tick, key and typed amount', async ({ page }) => {
        await openBooks(page)
        const first = await vendorWithCredits(page, [
            { amount: '100.00', date: await localDay(page, -10) },
            { amount: '250.00', date: await localDay(page, -5) },
        ])
        const [older, newer] = first.credits
        const amount = page.getByTestId('vendor-refund-amount')
        const olderCell = refundCell(page, older.id)
        const newerCell = refundCell(page, newer.id)

        await openNewVendorRefund(page)
        // Before a vendor is picked, the list prompts for one.
        await expect(page.getByTestId('vendor-refund-list-prompt')).toHaveText(
            'Choose a vendor to see their unapplied credits.'
        )

        await pickRefundVendor(page, first.vendor.name)
        await expect(refundRow(page, older.id)).toBeVisible()
        await expect(refundRow(page, newer.id)).toBeVisible()

        // Ticking the older credit refunds it in full; Amount refunded follows.
        await refundTick(page, older.id).click()
        await expect(olderCell).toHaveValue('100.00')
        await expect(amount).toHaveValue('100.00')

        // ⌥↵ in the newer cell refunds it in full; again clears it.
        await newerCell.focus()
        await page.keyboard.press('Alt+Enter')
        await expect(newerCell).toHaveValue('250.00')
        await expect(amount).toHaveValue('350.00')
        await page.keyboard.press('Alt+Enter')
        await expect(newerCell).toHaveValue('')
        await expect(amount).toHaveValue('100.00')

        // Typing in an unticked cell ticks its row; emptying the cell unticks it.
        const newerTick = refundTick(page, newer.id)
        await expect(newerTick).toHaveAttribute('aria-checked', 'false')
        await newerCell.fill('40.00')
        await expect(newerTick).toHaveAttribute('aria-checked', 'true')
        await expect(amount).toHaveValue('140.00')
        await newerCell.fill('')
        await expect(newerTick).toHaveAttribute('aria-checked', 'false')
        await expect(amount).toHaveValue('100.00')

        // A typed amount clears the rows and is spread oldest credit first.
        await amount.fill('180.00')
        await expect(olderCell).toHaveValue('100.00')
        await expect(newerCell).toHaveValue('80.00')

        // A row edit after a typed amount leaves the amount; the rest is Not placed, and
        // Post is refused under the list.
        await newerCell.fill('60.00')
        await expect(amount).toHaveValue('180.00')
        await expect(page.getByTestId('vendor-refund-not-placed')).toContainText('$20.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('vendor-refund-sum-error')).toHaveText(NOT_PLACED_20)
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)

        // ⌥⌫ clears every row and keeps the typed amount.
        await page.keyboard.press('Alt+Backspace')
        await expect(olderCell).toHaveValue('')
        await expect(newerCell).toHaveValue('')
        await expect(amount).toHaveValue('180.00')

        // ⌥A refunds every credit in full and keeps the typed amount: the rows are above it.
        await page.keyboard.press('Alt+a')
        await expect(olderCell).toHaveValue('100.00')
        await expect(newerCell).toHaveValue('250.00')
        await expect(amount).toHaveValue('180.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('vendor-refund-sum-error')).toHaveText(ABOVE_180)
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)

        // With every row ticked, the header tick box unticks them all.
        await page.getByTestId('vendor-refund-tick-all').click()
        await expect(olderCell).toHaveValue('')
        await expect(newerCell).toHaveValue('')
        await expect(refundTick(page, older.id)).toHaveAttribute('aria-checked', 'false')
        await expect(newerTick).toHaveAttribute('aria-checked', 'false')
    })

    test('a vendor change shows only the new vendor’s credits and places the typed amount on them', async ({
        page,
    }) => {
        await openBooks(page)
        const first = await vendorWithCredits(page, [{ amount: '100.00' }])
        const second = await vendorWithCredits(page, [{ amount: '500.00' }])
        const [earlier] = first.credits
        const [only] = second.credits
        const amount = page.getByTestId('vendor-refund-amount')

        await openNewVendorRefund(page)
        await pickRefundVendor(page, first.vendor.name)
        await expect(refundRow(page, earlier.id)).toBeVisible()
        await amount.fill('180.00')
        await expect(refundCell(page, earlier.id)).toHaveValue('100.00')

        // Another vendor: only its credit, and the kept 180.00 is placed on it.
        await pickRefundVendor(page, second.vendor.name)
        await expect(refundRow(page, only.id)).toBeVisible()
        await expect(refundRow(page, earlier.id)).toHaveCount(0)
        await expect(amount).toHaveValue('180.00')
        await expect(refundCell(page, only.id)).toHaveValue('180.00')
    })
})
