import { expect, type Locator, type Page, test } from '@playwright/test'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { localToday, uniqueMemo } from './invoice-helpers'
import {
    filterToVendor,
    localDay,
    openPayBills,
    payBillsRow,
    shown,
    vendorWithBills,
} from './pay-bills-helpers'
import {
    applyDialog,
    openApplyDialog,
    openVendorCreditBySearch,
    postVendorCredit,
} from './vendor-credit-helpers'
import {
    openBooks,
    REFUND_CREDIT_ACCOUNT,
    refundCell,
    refundNumberOf,
    refundTick,
    searchToVendorRefund,
    shownRefund,
    VENDOR_REFUND_URL,
    vendorRefundIdFromUrl,
    vendorWithCredits,
} from './vendor-refund-helpers'

// The vendor credit's side of vendor refunds (vendor refund spec §3.9), checkpoint 5: the
// read view's Record refund (R) after Apply to bills, the refund form it opens with the
// credit ticked, the Refunded totals row, the refund rows of the Applied to block, the
// Refunded badge, the credit's void refusal, the Pay Bills notice after a full refund, and
// the apply dialog's no-open-bills state with its Record refund button. Every test makes
// its own vendor and posts its own vendor credit with a unique memo; no seeded credit or
// refund is read. The phone bar is vendor-refund-credit-phone.spec.ts.

const MINUS = '−'
const VOID_REFUSED = 'A vendor refund is recorded on this credit. Void the refund first.'
const APPLICATIONS_LOAD_FAILED = 'Books could not load where this credit is applied.'
const REFUND_LINES = 'books_vendor_refund_lines'

// The form a vendor credit's Record refund opens: `?vendor=<vendor>&credit=<credit>`.
function refundFormUrl(vendorId: string, creditId: string): RegExp {
    return new RegExp(`/books/vendor-refunds/new\\?vendor=${vendorId}&credit=${creditId}$`)
}

function creditUrl(creditId: string): RegExp {
    return new RegExp(`/books/vendor-credits/${creditId}$`)
}

// The read bar's Apply to bills, Record refund and Edit, in screen order.
function barOrder(bar: Locator): Promise<string[]> {
    const wanted = [
        'vendor-credit-read-apply',
        'vendor-credit-read-record-refund',
        'vendor-credit-read-edit',
    ]
    return bar.evaluate(
        (el, ids) =>
            Array.from(el.querySelectorAll('[data-testid]'))
                .map(node => node.getAttribute('data-testid') ?? '')
                .filter(id => ids.includes(id)),
        wanted
    )
}

// A refund's row in the credit's Applied to block.
function refundUseRow(page: Page, refundId: string): Locator {
    return shown(page, `vendor-credit-refund-${refundId}`)
}

// On the refund form a vendor credit's Record refund opened: the vendor is chosen, the
// credit's row is ticked for its unapplied credit and Amount refunded follows it.
async function expectFormForCredit(
    page: Page,
    input: { vendorName: string; creditId: string; amount: string }
) {
    await expect(shownRefund(page, 'vendor-refund-form')).toBeVisible()
    await expect(shownRefund(page, 'vendor-refund-vendor')).toContainText(input.vendorName)
    await expect(refundTick(page, input.creditId).filter({ visible: true })).toHaveAttribute(
        'aria-checked',
        'true'
    )
    await expect(refundCell(page, input.creditId).filter({ visible: true })).toHaveValue(
        input.amount
    )
    await expect(shownRefund(page, 'vendor-refund-amount')).toHaveValue(input.amount)
}

// From the posted refund's read view, opens the credit by the refund's row link.
async function openCreditFromRefund(page: Page, creditId: string) {
    await shownRefund(page, `vendor-refund-read-link-${creditId}`).click()
    await expect(page).toHaveURL(creditUrl(creditId))
    await expect(shown(page, 'vendor-credit-read-only')).toBeVisible()
}

test.describe('vendor-refund: vendor credit', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('Record refund refunds part and then the rest of a posted credit', async ({ page }) => {
        await openBooks(page)
        const creditMemo = uniqueMemo('Vendor refund credit record')
        // The vendor has an open bill, so Pay Bills lists the vendor and would show its
        // unapplied credits in the notice.
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '40.00', due: await localDay(page, 10) }],
        })
        const [bill] = bills
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: REFUND_CREDIT_ACCOUNT,
            amount: '300.00',
            memo: creditMemo,
        })
        const today = formatDay(await localToday(page))

        // Before any refund, Pay Bills filtered to the vendor lists the credit in its notice
        // of unapplied credits (so the notice's absence after the full refund is the refund's
        // doing, not a wrong id).
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await expect(payBillsRow(page, bill.id)).toBeVisible()
        await expect(page.getByTestId(`pay-bills-credit-${credit.id}`)).toBeVisible()
        await page.goBack()
        await openVendorCreditBySearch(page, creditMemo)
        await expect(page).toHaveURL(creditUrl(credit.id))

        // The bar shows Record refund right after Apply to bills.
        const bar = shown(page, 'vendor-credit-read-actions')
        await expect(shown(page, 'vendor-credit-read-apply')).toBeVisible()
        const recordRefund = shown(page, 'vendor-credit-read-record-refund')
        await expect(recordRefund).toBeVisible()
        await expect(recordRefund).toContainText('Record refund')
        await expect
            .poll(() => barOrder(bar))
            .toEqual([
                'vendor-credit-read-apply',
                'vendor-credit-read-record-refund',
                'vendor-credit-read-edit',
            ])

        // R opens the refund form with the vendor chosen and the credit ticked in full.
        await page.keyboard.press('r')
        await expect(page).toHaveURL(refundFormUrl(vendor.id, credit.id))
        await expectFormForCredit(page, {
            vendorName: vendor.name,
            creditId: credit.id,
            amount: '300.00',
        })

        // Typing 120.00 in Amount refunded places it on the credit; ⌘↵ posts.
        const firstMemo = uniqueMemo('Vendor refund credit part')
        await shownRefund(page, 'vendor-refund-amount').fill('120.00')
        await expect(refundCell(page, credit.id).filter({ visible: true })).toHaveValue('120.00')
        await shownRefund(page, 'vendor-refund-memo').fill(firstMemo)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        const firstRefundId = vendorRefundIdFromUrl(page)
        const firstNumber = await refundNumberOf(page)

        // The credit: Partly applied, Refunded −$120.00 above Unapplied credit $180.00, and
        // no Applied row, as nothing is applied to a bill.
        await openCreditFromRefund(page, credit.id)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')
        const refundedRow = shown(page, 'vendor-credit-refunded')
        await expect(refundedRow).toContainText('Refunded')
        await expect(refundedRow).toContainText(`${MINUS}$120.00`)
        const unapplied = shown(page, 'vendor-credit-total-unapplied')
        await expect(unapplied).toContainText('$180.00')
        await expect(shown(page, 'vendor-credit-total-applied')).toHaveCount(0)
        await expect
            .poll(async () => {
                const refunded = await refundedRow.boundingBox()
                const rest = await unapplied.boundingBox()
                return refunded !== null && rest !== null && refunded.y < rest.y
            })
            .toBe(true)

        // Applied to lists the refund as a link with no Remove.
        const block = shown(page, 'vendor-credit-applications')
        const row = refundUseRow(page, firstRefundId)
        await expect(row).toContainText(`Vendor refund ${firstNumber} · ${today} · $120.00`)
        await expect(row.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
        await expect(block.locator('[data-testid*="-remove-"]')).toHaveCount(0)

        // The row's link opens the refund. Reached refund → credit (the credit pushed over
        // the refund), the link goes back to the refund already on the stack, so Back from
        // it leaves both: a second pushed copy of the refund would go Back to the credit.
        const firstRefundUrl = new RegExp(`/books/vendor-refunds/${firstRefundId}$`)
        await page.goBack()
        await expect(page).not.toHaveURL(creditUrl(credit.id))
        await searchToVendorRefund(page, firstMemo)
        await expect(page).toHaveURL(firstRefundUrl)
        await openCreditFromRefund(page, credit.id)
        await refundUseRow(page, firstRefundId).getByRole('link').click()
        await expect(page).toHaveURL(firstRefundUrl)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        await page.goBack()
        await expect(page).not.toHaveURL(firstRefundUrl)
        await expect(page).not.toHaveURL(creditUrl(credit.id))

        // Back on the credit, opened by search over the list, so Pay Bills' Back at the end
        // lands on the list.
        await openVendorCreditBySearch(page, creditMemo)
        await expect(page).toHaveURL(creditUrl(credit.id))

        // V: the void of a credit a posted refund names is refused; it stays posted.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(VOID_REFUSED)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')
        await expect(shown(page, 'vendor-credit-title')).toHaveText(
            `Vendor credit ${credit.number}`
        )

        // R again: the rest, $180.00, is ticked; ⌘↵ posts it.
        await page.keyboard.press('r')
        await expect(page).toHaveURL(refundFormUrl(vendor.id, credit.id))
        await expectFormForCredit(page, {
            vendorName: vendor.name,
            creditId: credit.id,
            amount: '180.00',
        })
        await shownRefund(page, 'vendor-refund-memo').fill(uniqueMemo('Vendor refund credit rest'))
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        const secondRefundId = vendorRefundIdFromUrl(page)
        expect(secondRefundId).not.toBe(firstRefundId)

        // Refunded in full: the Refunded badge, no Record refund and no Apply to bills.
        await openCreditFromRefund(page, credit.id)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Refunded')
        await expect(shown(page, 'vendor-credit-refunded')).toContainText(`${MINUS}$300.00`)
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText('$0.00')
        await expect(refundUseRow(page, firstRefundId)).toBeVisible()
        await expect(refundUseRow(page, secondRefundId)).toBeVisible()
        await expect(shown(page, 'vendor-credit-read-record-refund')).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-read-apply')).toHaveCount(0)

        // Pay Bills, filtered to the vendor: its bill is listed, its credit is not in the
        // notice of unapplied credits.
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await expect(payBillsRow(page, bill.id)).toBeVisible()
        await expect(page.getByTestId(`pay-bills-credit-${credit.id}`)).toHaveCount(0)
        await expect(page.getByTestId('pay-bills-credits-notice')).toHaveCount(0)
    })

    test('no open bill: the apply dialog offers Record refund, and the refund rows recover from a failed read', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, credits } = await vendorWithCredits(page, [{ amount: '80.00' }])
        const [credit] = credits
        await openVendorCreditBySearch(page, credit.memo)

        // Apply to bills opens the empty state with New bill and Record refund.
        await openApplyDialog(page)
        const empty = page.getByTestId('apply-credit-empty')
        await expect(empty).toContainText(
            `${vendor.name} has no open bills. The credit stays on the vendor until you post a bill or record a refund.`
        )
        await expect(page.getByTestId('apply-credit-new-bill')).toContainText('New bill')
        const record = page.getByTestId('apply-credit-record-refund')
        await expect(record).toContainText('Record refund')

        // Record refund closes the dialog and opens the form with the credit ticked.
        await record.click()
        await expect(applyDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(refundFormUrl(vendor.id, credit.id))
        await expectFormForCredit(page, {
            vendorName: vendor.name,
            creditId: credit.id,
            amount: '80.00',
        })
        await shownRefund(page, 'vendor-refund-memo').fill(uniqueMemo('Vendor refund no bill'))
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_REFUND_URL)
        await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
        const refundId = vendorRefundIdFromUrl(page)
        const number = await refundNumberOf(page)
        const today = formatDay(await localToday(page))

        // A fresh page (its store holds no refund line) with realtime cut before login and
        // the refund lines read refused: the Applied to block shows its load error with
        // Retry and no row.
        const failed = await page.context().newPage()
        await failed.route('**/api/realtime*', route => route.abort())
        await failed.route(`**/api/collections/${REFUND_LINES}/records*`, route =>
            route.request().method() === 'GET'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ status: 400, message: 'Refused.', data: {} }),
                  })
                : route.fallback()
        )
        await openBooks(failed)
        await openVendorCreditBySearch(failed, credit.memo)
        const block = shown(failed, 'vendor-credit-applications')
        const banner = block.getByTestId('vendor-credit-applications-banner')
        const retry = block.getByTestId('vendor-credit-applications-retry')
        await expect(banner).toContainText(APPLICATIONS_LOAD_FAILED)
        await expect(retry).toBeVisible()
        await expect(failed.getByTestId(`vendor-credit-refund-${refundId}`)).toHaveCount(0)

        // Retry after the route is removed shows the refund row.
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.route('**/api/realtime*', route => route.abort())
        await retry.click()
        await expect(shown(failed, `vendor-credit-refund-${refundId}`)).toContainText(
            `Vendor refund ${number} · ${today} · $80.00`
        )
        await expect(banner).toHaveCount(0)
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.close()
    })
})
