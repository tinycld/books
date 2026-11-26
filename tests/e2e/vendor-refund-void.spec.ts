import { expect, type Locator, type Page, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { searchEntries } from './journal-entries-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import { openBooks, postRefundOn, shownRefund, vendorWithCredits } from './vendor-refund-helpers'

// Void of a posted vendor refund and its journal entry (spec §3.6, §3.7, §3.11), at desktop
// width. In the Journal Entries list the refund's entry is Type "Vendor refund" with its
// number; its row menu has Edit (the correction form) and Open (the refund), never Reverse.
// V voids the refund: the number stays, the credit is unapplied again, and the list gains
// the entry's void reversal, whose lines name the vendor. The test makes its own vendor,
// credit and refund through the UI; the refund carries a unique memo.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const VOID_TEXT =
    'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.'

// The entries list rows whose Type cell holds this text.
function rowsOfType(page: Page, type: RegExp | string) {
    return page.locator(ROWS).filter({
        has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: type }),
    })
}

async function entryIdOf(row: Locator) {
    return ((await row.getAttribute('data-testid')) ?? '').replace(/^entries-row-/, '')
}

test.describe('vendor-refund: void and journal entry', () => {
    test('a posted refund is voided and its entries read in Journal Entries', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund void')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '480.00' }])
        const [credit] = credits
        const refund = await postRefundOn(page, {
            vendor: vendor.name,
            creditId: credit.id,
            amount: '137.45',
            memo,
        })

        // Journal Entries: the refund's entry reads Type Vendor refund with its number.
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await searchEntries(page, memo)
        const row = rowsOfType(page, /^Vendor refund$/)
        await expect(row).toHaveCount(1)
        const entryId = await entryIdOf(row)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Vendor refund')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(refund.number)

        // Its row menu's Edit opens the correction form; back without a change.
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-refunds/new\\?replaces=${refund.id}$`)
        )
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${refund.number}`
        )
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        // Open goes to the refund's read view, which a writer may Edit and Void.
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'vendor-refunds', refund.id)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-read-edit')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-read-void')).toBeVisible()

        // V opens the Void dialog with the refund's text; confirming voids it.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_TEXT)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Void')
        await expect(shownRefund(page, 'vendor-refund-voided-by')).toHaveText(/^Voided by \S/)
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Vendor refund ${refund.number}`
        )
        await expect(shownRefund(page, 'vendor-refund-read-edit')).toHaveCount(0)
        await expect(shownRefund(page, 'vendor-refund-read-void')).toHaveCount(0)
        await expect(shownRefund(page, 'vendor-refund-read-entry')).toBeVisible()

        // The refund's own entry: Type Vendor refund, and its lines name the vendor.
        await shownRefund(page, 'vendor-refund-read-entry').click()
        await expectRecordUrl(page, 'entries', entryId)
        const refundEntry = page.getByTestId('entry-read-only').filter({ visible: true })
        await expect(refundEntry).toBeVisible()
        await expect(refundEntry.getByTestId('entry-detail-type')).toContainText('Vendor refund')
        const refundNames = refundEntry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => refundNames.count()).toBe(2)
        await expect
            .poll(async () => [...new Set(await refundNames.allInnerTexts())])
            .toEqual([vendor.name])
        await page.goBack()
        await expectRecordUrl(page, 'vendor-refunds', refund.id)

        // The credit is unapplied again for its whole total.
        await shownRefund(page, `vendor-refund-read-link-${credit.id}`).click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expectRecordUrl(page, 'vendor-credits', credit.id)
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$480.00')

        // Back to the list: the voided entry keeps Type and number; its menu has Open (the
        // refund) and no Reverse.
        await page.goBack()
        await expectRecordUrl(page, 'vendor-refunds', refund.id)
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Vendor refund')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(refund.number)
        await expect(page.getByTestId(`entries-status-${entryId}`)).toHaveText('Void')
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'vendor-refunds', refund.id)
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Void')
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        // The void reversal ("Void of <number>"): Type Void reversal, reversing the refund's
        // number, for the refund's amount; its lines name the vendor.
        await searchEntries(page, `Void of ${refund.number}`)
        const reversal = rowsOfType(page, /^Void reversal/)
            .filter({
                has: page.locator('[data-testid^="entries-cell-type-"]', {
                    hasText: `Reverses ${refund.number}`,
                }),
            })
            .filter({
                has: page.locator('[data-testid^="entries-cell-total-"]', { hasText: '$137.45' }),
            })
        await expect(reversal).toHaveCount(1)
        await reversal.getByText(`Void of ${refund.number}`, { exact: true }).click()
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry).toBeVisible()
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Void reversal')
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBe(2)
        await expect
            .poll(async () => [...new Set(await names.allInnerTexts())])
            .toEqual([vendor.name])
    })
})
