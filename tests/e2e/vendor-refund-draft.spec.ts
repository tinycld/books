import { expect, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { openVendorCreditBySearch } from './vendor-credit-helpers'
import {
    openBooks,
    openNewVendorRefund,
    pickRefundVendor,
    refundCell,
    searchToVendorRefund,
    searchVendorRefunds,
    VENDOR_REFUND_URL,
    vendorWithCredits,
} from './vendor-refund-helpers'

// A draft vendor refund's life (spec §3.6, §3.8, §3.11): ⌘S saves it, search reopens it in
// the form as saved, Esc asks before it drops an edit, ⌘⌫ deletes it. A draft moves no
// money, so its credit's Unapplied credit never changes. Desktop; the test makes its own
// vendor and credit through the UI.

const DELETE_BODY = "Delete this draft vendor refund? This can't be undone."

test.describe('vendor-refund: draft', () => {
    test('saves, reopens, guards an edit and deletes a draft refund', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund draft')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = credits
        const vendorField = page.getByTestId('vendor-refund-vendor')
        const amount = page.getByTestId('vendor-refund-amount')
        const reference = page.getByTestId('vendor-refund-reference')

        await openNewVendorRefund(page)
        await pickRefundVendor(page, vendor.name)
        await amount.fill('200.00')
        await expect(refundCell(page, credit.id)).toHaveValue('200.00')
        await page.getByTestId('vendor-refund-memo').fill(memo)

        // ⌘S saves the draft and moves to its own URL.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(page.getByTestId('vendor-refund-title')).toHaveText('Draft vendor refund')

        // Esc with no edits leaves at once.
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page).not.toHaveURL(/\/books\/vendor-refunds\//)

        // Search finds it as a draft and opens it in the form, as saved, focus on Vendor.
        const title = await searchToVendorRefund(page, memo)
        expect(title).toBe(`Draft vendor refund · ${vendor.name}`)
        await expect(page.getByTestId('vendor-refund-form')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-title')).toHaveText('Draft vendor refund')
        await expect(vendorField).toContainText(vendor.name)
        await expect(amount).toHaveValue('200.00')
        await expect(refundCell(page, credit.id)).toHaveValue('200.00')
        await expect(vendorField).toBeFocused()

        // An edit, then Esc: the Discard dialog; keeping the edit stays on the draft.
        await reference.fill('R-77')
        const discard = page.getByTestId('discard-dialog')
        await page.keyboard.press('Escape')
        await expect(discard).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(discard).toHaveCount(0)
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(reference).toHaveValue('R-77')

        // ⌘⌫ asks to delete the draft; confirming leaves the form.
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toBeVisible()
        await expect(deleteDialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(/\/books\/vendor-refunds\//)
        await expect(page.getByTestId('vendor-refund-form')).toHaveCount(0)

        // The search no longer finds the memo.
        const options = await searchVendorRefunds(page, memo)
        await expect(options).toHaveCount(0)
        await page.keyboard.press('Escape')

        // The draft never refunded the credit.
        await openVendorCreditBySearch(page, credit.memo)
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$650.00')
    })
})
