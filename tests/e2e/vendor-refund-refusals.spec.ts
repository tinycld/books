import { expect, type Page, test } from '@playwright/test'
import { uniqueMemo } from './invoice-helpers'
import { localDay } from './receive-payment-helpers'
import {
    NEW_VENDOR_REFUND_URL,
    openBooks,
    openNewVendorRefund,
    pickRefundVendor,
    refundCell,
    VENDOR_REFUND_URL,
    vendorWithCredits,
} from './vendor-refund-helpers'

// The form's refusals (spec §3.5, §3.6): the zod rules under their fields, a server
// refusal of a line under that line's cell, a root refusal in the error summary, and Post
// & new. The server refusals are forced with route.fulfill on the posting PATCH, after the
// draft is written. Desktop; the test makes its own vendor and credit through the UI.

const REFUND_RECORDS_URL = '**/api/collections/books_vendor_refunds/records/*'
const ROOT_REFUSAL = 'The books are closed for this refund date.'

// Answers the posting PATCH (status → posted) with a 400 that carries `data`; every
// other request goes through.
async function refusePost(page: Page, message: string, data: Record<string, unknown>) {
    await page.route(REFUND_RECORDS_URL, route => {
        const request = route.request()
        const body = request.postDataJSON() as { status?: string } | null
        if (request.method() !== 'PATCH' || body?.status !== 'posted') return route.fallback()
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ status: 400, message, data }),
        })
    })
}

test.describe('vendor-refund: refusals and post & new', () => {
    test('refuses each rule under its field, shows server refusals, then posts & new', async ({
        page,
    }) => {
        await openBooks(page)
        const today = await localDay(page, 0)
        const { vendor, credits } = await vendorWithCredits(page, [
            { amount: '650.00', date: await localDay(page, -5) },
        ])
        const [credit] = credits
        const vendorField = page.getByTestId('vendor-refund-vendor')
        const date = page.getByTestId('vendor-refund-date')
        const amount = page.getByTestId('vendor-refund-amount')
        const cell = refundCell(page, credit.id)
        const rowError = page.getByTestId(`vendor-refund-row-error-${credit.id}`)
        const post = page.getByTestId('vendor-refund-post')

        await openNewVendorRefund(page)

        // Save draft runs the same schema as Post (spec §3.5): a refused input shows the same
        // refusal on ⌘S as on Post, and nothing is saved. Every create of a refund is counted.
        let refundCreates = 0
        page.on('request', request => {
            if (
                request.method() === 'POST' &&
                request.url().includes('/api/collections/books_vendor_refunds/records')
            ) {
                refundCreates += 1
            }
        })

        // No vendor: ⌘S first, on a form not yet submitted, so the refusal is ⌘S's own.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('vendor-refund-vendor-error')).toHaveText('Choose a vendor')
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)

        // No vendor, on Post.
        await post.click()
        await expect(page.getByTestId('vendor-refund-vendor-error')).toHaveText('Choose a vendor')
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)

        // A cell above its credit's unapplied amount.
        await pickRefundVendor(page, vendor.name)
        await expect(page.getByTestId('vendor-refund-vendor-error')).toHaveCount(0)
        await cell.fill('700.00')
        await post.click()
        await expect(rowError).toHaveText('More than the unapplied credit of $650.00')

        // A refund date before the credit's date.
        await cell.fill('100.00')
        await date.fill(await localDay(page, -10))
        await post.click()
        await expect(rowError).toHaveText(
            `Vendor credit ${credit.number} is dated after the refund date.`
        )
        // The same input on ⌘S: the same refusal under the cell, and no save (the count
        // and the URL are checked again at the amount of 0, after later round trips).
        await page.keyboard.press('ControlOrMeta+s')
        await expect(rowError).toHaveText(
            `Vendor credit ${credit.number} is dated after the refund date.`
        )
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        await date.fill(today)
        await expect(rowError).toHaveCount(0)

        // An amount of 0.
        await cell.fill('')
        await amount.fill('0')
        await post.click()
        await expect(page.getByTestId('vendor-refund-amount-error')).toHaveText(
            'Enter the amount refunded'
        )
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        // The same input on ⌘S: the same refusal, and no ⌘S above or here saved a refund.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('vendor-refund-amount-error')).toHaveText(
            'Enter the amount refunded'
        )
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        expect(refundCreates).toBe(0)

        // The server refuses the post's first line: the draft stays, the refusal under the
        // row it names, with its final period.
        await amount.fill('100.00')
        await expect(cell).toHaveValue('100.00')
        await page.getByTestId('vendor-refund-memo').fill(uniqueMemo('Vendor refund refused'))
        const lineRefusal = `Vendor credit ${credit.number}: the refund is more than its unapplied credit of $650.00.`
        await refusePost(page, 'Failed to update record.', {
            'lines.0': { code: 'validation_refused', message: lineRefusal },
        })
        await post.click()
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(page.getByTestId('vendor-refund-title')).toHaveText('Draft vendor refund')
        await expect(rowError).toHaveText(lineRefusal)

        // A refusal with a message only: the error summary shows it, the draft stays.
        await page.unrouteAll({ behavior: 'wait' })
        await refusePost(page, ROOT_REFUSAL, {})
        await post.click()
        await expect(page.getByTestId('vendor-refund-error-summary')).toContainText(ROOT_REFUSAL)
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(page.getByTestId('vendor-refund-title')).toHaveText('Draft vendor refund')

        // With the routes removed, ⌘⇧↵ posts and opens a fresh refund with no vendor.
        await page.unrouteAll({ behavior: 'wait' })
        const posted = page.waitForResponse(
            r =>
                r.url().includes('/api/collections/books_vendor_refunds/records/') &&
                r.request().method() === 'PATCH' &&
                (r.request().postDataJSON() as { status?: string } | null)?.status === 'posted'
        )
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        expect((await posted).ok()).toBe(true)
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        const fresh = new URL(page.url())
        expect(fresh.searchParams.has('vendor')).toBe(false)
        expect(fresh.searchParams.has('credit')).toBe(false)
        await expect(page.getByTestId('vendor-refund-title')).toHaveText('Vendor refund')
        await expect(vendorField).toBeFocused()
        await expect(vendorField).not.toContainText(vendor.name)
        await expect(page.getByTestId('vendor-refund-list-prompt')).toBeVisible()
        await expect(amount).toHaveValue('')
    })
})
