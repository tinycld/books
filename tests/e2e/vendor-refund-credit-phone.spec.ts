import { expect, test } from '@playwright/test'
import { PHONE } from './account-register-helpers'
import { shown } from './pay-bills-helpers'
import { openVendorCreditBySearch } from './vendor-credit-helpers'
import { openBooks, refundCell, vendorWithCredits } from './vendor-refund-helpers'

// The vendor credit read view's phone bar (vendor refund spec §3.9): one bar button and
// More, so other code runs than on the wide bar. Apply to bills stays the bar button;
// Record refund is a row of More with its key R, and it opens the refund form with the
// credit's card ticked. The vendor and its credit are made at desktop width; the credit
// then opens at 390 × 844.

function refundFormUrl(vendorId: string, creditId: string): RegExp {
    return new RegExp(`/books/vendor-refunds/new\\?vendor=${vendorId}&credit=${creditId}$`)
}

test.describe('vendor-refund: vendor credit phone', () => {
    test('More holds Record refund, which opens the form with the credit card ticked', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '90.00' }])
        const [credit] = credits
        await openVendorCreditBySearch(page, credit.memo)
        await page.setViewportSize(PHONE)

        // The phone bar: Apply to bills and More; Record refund is not a bar button.
        const more = shown(page, 'vendor-credit-read-more')
        await expect(more).toBeVisible()
        await expect(shown(page, 'vendor-credit-read-apply')).toBeVisible()
        await expect(shown(page, 'vendor-credit-read-record-refund')).toHaveCount(0)

        // More holds Record refund with its key R.
        await more.click()
        const item = page.getByRole('menuitem', { name: /^Record refund r$/i })
        await expect(item).toBeVisible()

        // Pressing it opens the refund form with the credit's card ticked for 90.00.
        await item.click()
        await expect(page).toHaveURL(refundFormUrl(vendor.id, credit.id))
        await expect(shown(page, 'vendor-refund-form')).toBeVisible()
        const card = shown(page, `vendor-refund-card-${credit.id}`)
        await expect(card).toBeVisible()
        await expect(card.getByTestId(`vendor-refund-row-tick-${credit.id}`)).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('90.00')
        await expect(shown(page, 'vendor-refund-amount')).toHaveValue('90.00')
    })
})
