import { expect, type Locator, test } from '@playwright/test'
import { PHONE } from './account-register-helpers'
import { uniqueMemo } from './invoice-helpers'
import { tabTo } from './pay-bills-helpers'
import { localDay } from './receive-payment-helpers'
import {
    openBooks,
    openNewVendorRefund,
    pickRefundVendor,
    refundCell,
    refundRow,
    VENDOR_REFUND_URL,
    vendorWithCredits,
} from './vendor-refund-helpers'

// The vendor refund at phone size (spec §3.3, §3.4, §3.7). The phone path runs other
// components: the stacked band, the credit cards (OutstandingCards) with their own
// "Refund all" tick box, the phone bar with More, and the read view's refunded cards.
// The vendor and its credits are made at desktop width; the form then runs at 390 × 844.

async function topOf(field: Locator): Promise<number> {
    const box = await field.boundingBox()
    if (!box) throw new Error('field is not drawn')
    return box.y
}

test.describe('vendor-refund: phone', () => {
    test('a refund is placed on credit cards and posted at phone size', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Vendor refund phone')
        const { vendor, credits } = await vendorWithCredits(page, [
            { amount: '300.00', date: await localDay(page, -10), creditNo: 'CM-101' },
            { amount: '200.00', date: await localDay(page, -5), creditNo: 'CM-202' },
        ])
        const [first, second] = credits
        await openNewVendorRefund(page)
        await page.setViewportSize(PHONE)
        // The phone bar is drawn: its More button is there.
        await expect(page.getByTestId('vendor-refund-more')).toBeVisible()

        // The band's fields stack in Tab order, Amount refunded last.
        const order = [
            page.getByTestId('vendor-refund-vendor'),
            page.getByTestId('vendor-refund-date'),
            page.getByTestId('vendor-refund-method'),
            page.getByTestId('vendor-refund-reference'),
            page.getByTestId('vendor-refund-account'),
            page.getByTestId('vendor-refund-amount'),
        ]
        const tops: number[] = []
        for (const field of order) tops.push(await topOf(field))
        for (let index = 1; index < tops.length; index++) {
            expect(tops[index], `field ${index} is below field ${index - 1}`).toBeGreaterThan(
                tops[index - 1]
            )
        }
        const [vendorField, date, method, reference, account, amount] = order
        await vendorField.focus()
        await tabTo(page, date)
        await tabTo(page, page.getByTestId('vendor-refund-date-open'))
        await tabTo(page, method)
        await tabTo(page, reference)
        await tabTo(page, account)
        await tabTo(page, amount)

        await pickRefundVendor(page, vendor.name)

        // One card per credit: its tick box, its title with the vendor's credit no., the
        // three label-value pairs and its Refund input; no grid rows.
        const card1 = page.getByTestId(`vendor-refund-card-${first.id}`)
        const card2 = page.getByTestId(`vendor-refund-card-${second.id}`)
        for (const [card, credit, no, total] of [
            [card1, first, 'CM-101', '$300.00'],
            [card2, second, 'CM-202', '$200.00'],
        ] as const) {
            await expect(card.getByTestId(`vendor-refund-row-tick-${credit.id}`)).toBeVisible()
            await expect(card).toContainText(`Vendor credit ${credit.number} · No. ${no}`)
            await expect(card).toContainText('Credit date')
            await expect(card).toContainText('Credit total')
            await expect(card).toContainText('Unapplied credit')
            await expect(card).toContainText(total)
            await expect(card.getByTestId(`vendor-refund-row-amount-${credit.id}`)).toBeVisible()
            await expect(refundRow(page, credit.id)).toHaveCount(0)
        }

        // "Refund all" ticks both cards, and Amount refunded follows.
        const tickAll = page.getByTestId('vendor-refund-tick-all')
        await expect(tickAll).toContainText('Refund all')
        await tickAll.click()
        await expect(refundCell(page, first.id)).toHaveValue('300.00')
        await expect(refundCell(page, second.id)).toHaveValue('200.00')
        await expect(amount).toHaveValue('500.00')
        await page.getByTestId('vendor-refund-memo').fill(memo)

        // The phone bar: Cancel, Save draft, Post and More; Post & new is a row of More.
        await expect(page.getByTestId('vendor-refund-cancel')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-save-draft')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-post')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-post-new')).toHaveCount(0)
        await page.getByTestId('vendor-refund-more').click()
        await expect(page.getByTestId('vendor-refund-post-new')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('vendor-refund-post-new')).toHaveCount(0)

        // Post saves; the read view lists the refunded credits as cards.
        await page.getByTestId('vendor-refund-post').click()
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(page.getByTestId('vendor-refund-read-only')).toBeVisible()
        for (const [credit, total] of [
            [first, '$300.00'],
            [second, '$200.00'],
        ] as const) {
            const applied = page.getByTestId(`vendor-refund-applied-${credit.id}`)
            await expect(applied).toContainText(`Vendor credit ${credit.number}`)
            await expect(applied).toContainText('Refunded')
            await expect(applied).toContainText(total)
        }
    })
})
