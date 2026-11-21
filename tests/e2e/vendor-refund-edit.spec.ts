import { expect, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { shiftTabTo, tabTo } from './keyboard-helpers'
import { VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import {
    openBooks,
    postRefundOn,
    refundCell,
    refundUnappliedCell,
    searchToRefundTitled,
    searchToVendorRefund,
    shownRefund,
    VENDOR_REFUND_URL,
    vendorRefundIdFromUrl,
    vendorWithCredits,
} from './vendor-refund-helpers'

// A posted vendor refund edited as a correction from the keyboard only (spec §3.2, §3.6,
// §3.7). The vendor, its $650.00 credit and a posted refund of $150.00 are made first
// through the UI, and the refund is opened by search; from the read view on, no click:
// E opens the correction, Tab moves between fields and ⌘↵ posts. The correction keeps the
// number and voids the original. The checks after the post open the original and the
// credit with the pointer. Desktop only.

test.describe('vendor-refund: keyboard edit', () => {
    test('a posted refund is edited as a correction from the keyboard only', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund keyboard edit')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = credits
        const original = await postRefundOn(page, {
            vendor: vendor.name,
            creditId: credit.id,
            amount: '150.00',
            memo,
        })

        // Back to the Journal Entries list, then the refund by search.
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await searchToVendorRefund(page, memo)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()

        // From here no click. E opens the correction of this refund.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-refunds/new\\?replaces=${original.id}$`)
        )
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${original.number}`
        )

        // A correction keeps its vendor: the Vendor trigger has focus, shows the vendor and
        // opens neither on Enter nor on typing.
        const vendorField = shownRefund(page, 'vendor-refund-vendor')
        await expect(vendorField).toBeFocused()
        await expect(vendorField).toContainText(vendor.name)
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('vendor-refund-vendor-search')).toHaveCount(0)
        await page.keyboard.type('x')
        await expect(page.getByTestId('vendor-refund-vendor-search')).toHaveCount(0)
        await expect(vendorField).toBeFocused()
        await expect(vendorField).toContainText(vendor.name)

        // The correction has the form's bar.
        await expect(shownRefund(page, 'vendor-refund-save-draft')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-post')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-post-new')).toBeVisible()

        // The credit's row is open for its balance plus the original's line, with the
        // original's refund on it.
        await expect(refundUnappliedCell(page, credit.id)).toHaveText('$650.00')
        const cell = refundCell(page, credit.id).filter({ visible: true })
        await expect(cell).toHaveValue('150.00')

        // The Tab order to Amount refunded: Refund date (with core DateField's own "Open
        // calendar" button), Payment method, Reference no., Refunded to.
        const amount = shownRefund(page, 'vendor-refund-amount')
        const reference = shownRefund(page, 'vendor-refund-reference')
        await tabTo(page, shownRefund(page, 'vendor-refund-date'))
        await tabTo(page, shownRefund(page, 'vendor-refund-date-open'))
        await tabTo(page, shownRefund(page, 'vendor-refund-method'))
        await tabTo(page, reference)
        await tabTo(page, shownRefund(page, 'vendor-refund-account'))
        await tabTo(page, amount)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('200.00')

        // Tab: the typed amount is placed on the credit.
        await tabTo(page, cell)
        await expect(cell).toHaveValue('200.00')

        // Shift+Tab back to Reference no.
        await shiftTabTo(page, amount)
        await shiftTabTo(page, shownRefund(page, 'vendor-refund-account'))
        await shiftTabTo(page, reference)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('20999')

        // ⌘↵ posts the correction: a new refund with the original's number.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(page).not.toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        const correctionId = vendorRefundIdFromUrl(page)
        expect(correctionId).not.toBe(original.id)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Vendor refund ${original.number}`
        )
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Posted')
        await expect(shownRefund(page, 'vendor-refund-figure')).toContainText('$200.00')
        await expect(shownRefund(page, 'vendor-refund-detail-payment')).toContainText('20999')
        await expect(shownRefund(page, `vendor-refund-applied-${credit.id}`)).toContainText(
            '$200.00'
        )

        // The original, opened by search (the void one of the two results): Void, replaced
        // by the correction, and only View journal entry on its bar.
        await searchToRefundTitled(
            page,
            memo,
            new RegExp(`^Vendor refund ${original.number} \\(void\\) · `)
        )
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Void')
        await expect(shownRefund(page, 'vendor-refund-replaced-by')).toHaveText(
            `Replaced by ${original.number} (edited)`
        )
        await expect(shownRefund(page, 'vendor-refund-read-entry')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-read-edit')).toHaveCount(0)
        await expect(shownRefund(page, 'vendor-refund-read-void')).toHaveCount(0)

        // The credit: $650.00 less the correction's $200.00.
        await shownRefund(page, `vendor-refund-read-link-${credit.id}`).click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/${credit.id}$`))
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$450.00')
    })
})
