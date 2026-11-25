import { expect, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { tabTo } from './keyboard-helpers'
import { CHECKING, pickFocusedSelect } from './pay-bills-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import {
    openBooks,
    openNewVendorRefund,
    refundCell,
    VENDOR_REFUND_URL,
    vendorRefundIdFromUrl,
    vendorWithCredits,
} from './vendor-refund-helpers'

// A vendor refund recorded and posted from the keyboard only (spec §3.2, §3.6, §3.7).
// The vendor and its one $650.00 credit are made first through the UI; the form opens from
// the New menu; from there no click: focus starts on Vendor, type-to-open picks, Tab moves
// between fields and ⌘↵ posts. The read view's J opens the journal entry; the credit is
// then opened by its link (a click is allowed there). Desktop only: the phone path is
// vendor-refund-phone.spec.ts.

const MEMO_HINT = 'Only your team sees this. Saved as the journal entry memo.'

test.describe('vendor-refund: keyboard create', () => {
    test('a refund on a vendor credit is entered and posted from the keyboard only', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund keyboard create')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = credits
        await openNewVendorRefund(page)

        // From here no click: Vendor has focus; typing opens the picker and Enter picks.
        const vendorField = page.getByTestId('vendor-refund-vendor')
        await expect(vendorField).toBeFocused()
        await page.keyboard.type(vendor.name)
        await expect(page.getByTestId('vendor-refund-vendor-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: vendor.name, exact: true })).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(vendorField).toContainText(vendor.name)

        // Picking a vendor moves focus to Refund date; then the spec's Tab order. Core
        // DateField's own "Open calendar" button is part of the Refund date field.
        await expect(page.getByTestId('vendor-refund-date')).toBeFocused()
        await tabTo(page, page.getByTestId('vendor-refund-date-open'))
        const method = page.getByTestId('vendor-refund-method')
        await tabTo(page, method)
        await pickFocusedSelect(page, method, 'Check')
        await tabTo(page, page.getByTestId('vendor-refund-reference'))
        await page.keyboard.type('20417')
        const account = page.getByTestId('vendor-refund-account')
        await tabTo(page, account)
        // Refunded to keeps its default, the first bank account in chart order.
        await expect(account).toContainText(CHECKING)
        await tabTo(page, page.getByTestId('vendor-refund-amount'))
        await page.keyboard.type('150.00')

        // The credit row's one Tab stop is its Refund cell; the typed amount is placed on it.
        const cell = refundCell(page, credit.id)
        await tabTo(page, cell)
        await expect(cell).toHaveValue('150.00')
        await tabTo(page, page.getByTestId('vendor-refund-clear'))
        await tabTo(page, page.getByTestId('vendor-refund-memo'))
        await page.keyboard.type(memo)

        // The refund form has no find field, and its memo is "Memo" with the spec's hint.
        const form = page.getByTestId('vendor-refund-form')
        await expect(page.getByTestId('vendor-refund-find')).toHaveCount(0)
        await expect(form).not.toContainText('Find invoice no.')
        await expect(form.getByText('Memo', { exact: true })).toBeVisible()
        await expect(page.getByTestId('vendor-refund-memo-hint')).toHaveText(MEMO_HINT)

        // ⌘↵ posts and opens the read view.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        const refundId = await vendorRefundIdFromUrl(page)
        await expect(page.getByTestId('vendor-refund-read-only')).toBeVisible()

        // A writer's posted refund offers Edit, Void and View journal entry.
        await expect(page.getByTestId('vendor-refund-read-entry')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-read-edit')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-read-void')).toBeVisible()

        await expect(page.getByTestId('vendor-refund-title')).toHaveText(/^Vendor refund \d+$/)
        await expect(page.getByTestId('vendor-refund-badge')).toHaveText('Posted')
        await expect(page.getByTestId('vendor-refund-figure')).toContainText('$150.00')
        await expect(page.getByTestId('vendor-refund-vendor-link')).toHaveText(vendor.name)
        await expect(page.getByTestId('vendor-refund-detail-payment')).toContainText(
            `Check · 20417 · refunded to ${CHECKING}`
        )
        const refunded = page.getByTestId(`vendor-refund-applied-${credit.id}`)
        await expect(refunded).toContainText(`Vendor credit ${credit.number}`)
        await expect(refunded).toContainText('$150.00')
        await expect(page.getByTestId('vendor-refund-memo-text')).toContainText(memo)
        await expect(page.getByTestId('vendor-refund-posted-by')).toHaveText(/^Posted by \S/)

        // J: the refund's journal entry, the vendor named on both lines.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry).toBeVisible()
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBe(2)
        await expect
            .poll(async () => [...new Set(await names.allInnerTexts())])
            .toEqual([vendor.name])

        // Back on the refund, its credit link opens the credit: $500.00 is still unapplied.
        await page.goBack()
        await expectRecordUrl(page, 'vendor-refunds', refundId)
        await page.getByTestId(`vendor-refund-read-link-${credit.id}`).click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expectRecordUrl(page, 'vendor-credits', credit.id)
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$500.00')
    })
})
