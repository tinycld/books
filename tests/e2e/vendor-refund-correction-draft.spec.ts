import { expect, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import {
    openBooks,
    postRefundOn,
    refundCell,
    refundUnappliedCell,
    searchToRefundTitled,
    searchVendorRefunds,
    shownRefund,
    VENDOR_REFUND_URL,
    vendorRefundIdFromUrl,
    vendorWithCredits,
} from './vendor-refund-helpers'

// A correction saved as a draft (spec §3.6, §3.8, §3.11): a saved correction is a draft with
// `replaces`. It moves no money, so the original stays Posted and the credit keeps its
// unapplied credit; reopened by search it is the correction form again (read-only Vendor,
// the row open for the balance plus the original's line, Delete draft in More); its post
// keeps the original's number and voids the original. A correction draft saved before
// another correction of the same original posts is left with an original that is no
// longer posted: it opens as the cannot-edit notice, which still deletes the draft (the
// second test; its other correction posts straight from the form). Desktop; each test
// makes its own vendor, credit and refund through the UI.

const DELETE_BODY = "Delete this draft vendor refund? This can't be undone."

test.describe('vendor-refund: correction draft', () => {
    test('a correction saved as a draft reopens as the correction and posts', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund correction draft')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = credits
        const original = await postRefundOn(page, {
            vendor: vendor.name,
            creditId: credit.id,
            amount: '150.00',
            memo,
        })
        const postedTitle = new RegExp(`^Vendor refund ${original.number} · `)
        const voidTitle = new RegExp(`^Vendor refund ${original.number} \\(void\\) · `)

        // Edit opens the correction.
        await shownRefund(page, 'vendor-refund-read-edit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-refunds/new\\?replaces=${original.id}$`)
        )
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${original.number}`
        )

        // 120.00 and ⌘S: a draft at its own URL, still titled as the correction.
        await shownRefund(page, 'vendor-refund-amount').fill('120.00')
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('120.00')
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        const draftId = vendorRefundIdFromUrl(page)
        expect(draftId).not.toBe(original.id)
        await expect(shownRefund(page, 'vendor-refund-form')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${original.number}`
        )

        // Esc with no edits leaves the saved draft.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(new RegExp(`/books/vendor-refunds/${draftId}$`))

        // The original stays Posted, and its credit keeps $500.00 unapplied.
        await searchToRefundTitled(page, memo, postedTitle)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Posted')
        await shownRefund(page, `vendor-refund-read-link-${credit.id}`).click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/${credit.id}$`))
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$500.00')

        // The draft, reopened by search, is the correction form as saved.
        await searchToRefundTitled(
            page,
            memo,
            new RegExp(`^Draft vendor refund · ${escapeRegExp(vendor.name)}$`)
        )
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${draftId}$`))
        await expect(shownRefund(page, 'vendor-refund-form')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${original.number}`
        )
        const vendorField = shownRefund(page, 'vendor-refund-vendor')
        await expect(vendorField).toBeFocused()
        await expect(vendorField).toContainText(vendor.name)
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('vendor-refund-vendor-search')).toHaveCount(0)
        await expect(shownRefund(page, 'vendor-refund-amount')).toHaveValue('120.00')
        await expect(refundUnappliedCell(page, credit.id)).toHaveText('$650.00')
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('120.00')

        // More holds Delete draft.
        await shownRefund(page, 'vendor-refund-more').click()
        await expect(shownRefund(page, 'vendor-refund-delete-draft')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shownRefund(page, 'vendor-refund-delete-draft')).toHaveCount(0)

        // Post: the draft becomes the posted refund with the original's number.
        await shownRefund(page, 'vendor-refund-post').click()
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${draftId}$`))
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Vendor refund ${original.number}`
        )
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Posted')
        await expect(shownRefund(page, 'vendor-refund-figure')).toContainText('$120.00')

        // The original is Void and names its replacement.
        await searchToRefundTitled(page, memo, voidTitle)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        await expect(shownRefund(page, 'vendor-refund-badge')).toHaveText('Void')
        await expect(shownRefund(page, 'vendor-refund-replaced-by')).toHaveText(
            `Replaced by ${original.number} (edited)`
        )
    })

    test('a correction draft whose original was corrected meanwhile opens as the cannot-edit notice and deletes', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund correction second')
        const secondMemo = uniqueMemo('Second refund fix')
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = credits
        const original = await postRefundOn(page, {
            vendor: vendor.name,
            creditId: credit.id,
            amount: '150.00',
            memo,
        })
        const postedTitle = new RegExp(`^Vendor refund ${original.number} · `)

        // A correction draft of the original with its own memo (the search keeps it apart
        // from the original).
        await shownRefund(page, 'vendor-refund-read-edit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-refunds/new\\?replaces=${original.id}$`)
        )
        await shownRefund(page, 'vendor-refund-amount').fill('130.00')
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('130.00')
        await shownRefund(page, 'vendor-refund-memo').fill(secondMemo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        const secondDraftId = vendorRefundIdFromUrl(page)
        expect(secondDraftId).not.toBe(original.id)
        // The saved draft's own screen, before Esc leaves it.
        await expect(shownRefund(page, 'vendor-refund-form')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Edit vendor refund ${original.number}`
        )
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(new RegExp(`/books/vendor-refunds/${secondDraftId}$`))

        // Another correction of the same original posts straight from the form, so the
        // original is no longer posted.
        await searchToRefundTitled(page, memo, postedTitle)
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${original.id}$`))
        await shownRefund(page, 'vendor-refund-read-edit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-refunds/new\\?replaces=${original.id}$`)
        )
        await shownRefund(page, 'vendor-refund-amount').fill('120.00')
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('120.00')
        await shownRefund(page, 'vendor-refund-post').click()
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        await expect(shownRefund(page, 'vendor-refund-title')).toHaveText(
            `Vendor refund ${original.number}`
        )

        // The draft's original is no longer posted: it opens as the cannot-edit notice,
        // which still offers Delete draft; ⌘⌫ and the confirm delete it.
        await searchToRefundTitled(
            page,
            secondMemo,
            new RegExp(`^Draft vendor refund · ${escapeRegExp(vendor.name)}$`)
        )
        await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/${secondDraftId}$`))
        const notice = shownRefund(page, 'vendor-refund-cannot-edit')
        await expect(notice).toContainText('This vendor refund cannot be edited')
        await expect(notice.getByRole('button', { name: /Delete draft/ })).toBeVisible()
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toBeVisible()
        await expect(deleteDialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(new RegExp(`/books/vendor-refunds/${secondDraftId}$`))
        await expect(shownRefund(page, 'vendor-refund-cannot-edit')).toHaveCount(0)

        // The search no longer finds the second draft.
        const options = await searchVendorRefunds(page, secondMemo)
        await expect(options).toHaveCount(0)
        await page.keyboard.press('Escape')
    })
})

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
