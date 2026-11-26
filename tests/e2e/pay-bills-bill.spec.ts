import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    BILL_URL,
    billIdFromUrl,
    openBillBySearch,
    openNewBill,
    pickBillVendor,
} from './bill-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    BILL_PAYMENT_URL,
    CHECKING,
    DESKTOP,
    localDay,
    PAY_BILLS_URL,
    PHONE,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    shown,
    vendorWithBills,
} from './pay-bills-helpers'
import { expectRecordUrl } from './record-key-helpers'

// The bill after this unit (pay-bills spec §3.9, §2, §3.1): the read view's Balance due,
// Payments total line and Payments block, the Paid / Partly paid badge, Pay bill (P) to Pay
// Bills with the bill selected, and the void refusal while a payment pays the bill. Each
// test makes its own vendor and bills through the UI and opens them by their own vendor's
// bill no. (Ref no., indexed by search); no seeded bill or bill payment is read.
//
// Also cp 4 item D1: a draft bill opened by search over another draft bill goes Back (and
// Cancel) to that draft, with what the user typed in it, never past it to the list.

const VOID_REFUSED = 'Payments are applied to this bill. Void or edit those payments first.'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// A vendor's bill no. no other run takes: one search term matching one bill.
function uniqueBillNo(): string {
    return `PB${Date.now()}${Math.random().toString(36).slice(2, 6)}`
}

// The bar's action buttons in screen order (More excluded), read in one snapshot.
function barActionIds(page: Page): Promise<string[]> {
    return shown(page, 'bill-read-actions').evaluate(bar =>
        Array.from(bar.querySelectorAll('[data-testid^="bill-read-"]'))
            .map(el => el.getAttribute('data-testid') ?? '')
            .filter(id => !id.startsWith('bill-read-more'))
    )
}

// Pay Bills is open with the bill selected: pays it from 1000 Business Checking (no check
// number) and waits for the toast; returns the payment's number. Pay Bills goes back to
// the bill it was opened from.
async function payFromChecking(page: Page, billId: string): Promise<string> {
    await pickSelect(page, 'pay-bills-paid-from', CHECKING)
    await page.getByTestId('pay-bills-pay').click()
    const number = await postedNumber(page)
    await expectRecordUrl(page, 'bills', billId)
    await expect(shown(page, 'bill-read-only')).toBeVisible()
    return number
}

test.describe('pay-bills: bill balance and Pay bill', () => {
    test('a bill is paid in two steps from its read view', async ({ page }) => {
        await openBooks(page)
        const today = await localDay(page, 0)
        const billNo = uniqueBillNo()
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '500.00', due: await localDay(page, 10), billNo }],
        })
        const [bill] = bills

        // The read view: Balance due 500.00, Posted, no Payments, Pay bill first.
        await openBillBySearch(page, billNo)
        await expectRecordUrl(page, 'bills', bill.id)
        await expect(shown(page, 'bill-badge')).toHaveText('Posted')
        await expect(shown(page, 'bill-balance-due')).toHaveText('$500.00')
        await expect(shown(page, 'bill-total-payments')).toHaveCount(0)
        await expect(shown(page, 'bill-payments')).toHaveCount(0)
        await expect.poll(async () => (await barActionIds(page))[0]).toBe('bill-read-pay')

        // P: Pay Bills with this bill paid in full and its vendor filtered.
        await page.keyboard.press('p')
        await expect(page).toHaveURL(new RegExp(`/books/pay-bills\\?bill=${bill.id}$`))
        await expect(page.getByTestId('pay-bills-vendor-filter')).toContainText(vendor.name)
        await expect(payBillsRowAmount(page, bill.id)).toHaveValue('500.00')

        // Pay Bills' back link names the bill it goes back to, and goes there (the filled
        // payment asks to be discarded first). P opens Pay Bills again.
        const payBack = shown(page, 'entry-back')
        await expect(payBack).not.toContainText('Journal entries')
        await expect(payBack).toContainText('Bill')
        await payBack.click()
        await page.getByTestId('discard-confirm').click()
        await expectRecordUrl(page, 'bills', bill.id)
        await expect(shown(page, 'bill-read-only')).toBeVisible()
        await page.keyboard.press('p')
        await expect(page).toHaveURL(new RegExp(`/books/pay-bills\\?bill=${bill.id}$`))
        await expect(payBillsRowAmount(page, bill.id)).toHaveValue('500.00')

        // A part payment of 200.00.
        await payBillsRowAmount(page, bill.id).fill('200.00')
        const first = await payFromChecking(page, bill.id)

        // Back on the bill: Partly paid, Payments −200.00, Balance due 300.00, the payment
        // listed in the Payments block.
        await expect(shown(page, 'bill-badge')).toHaveText('Partly paid')
        await expect(shown(page, 'bill-total-payments')).toContainText('−$200.00')
        await expect(shown(page, 'bill-balance-due')).toHaveText('$300.00')
        const block = shown(page, 'bill-payments')
        await expect(block).toContainText(`Bill payment ${first} · ${formatDay(today)} · $200.00`)
        await expect(shown(page, 'bill-read-pay')).toBeVisible()

        // On a phone the bar's one button beside More is Pay bill, the primary action
        // (Edit moves to More).
        await page.setViewportSize(PHONE)
        await expect.poll(() => barActionIds(page)).toEqual(['bill-read-pay'])
        await expect(shown(page, 'bill-read-pay')).toBeVisible()
        await page.setViewportSize(DESKTOP)

        // The block's row opens the bill payment; its back link names the bill and
        // returns to it.
        const link = block.locator('[data-testid^="bill-payment-"]')
        await expect(link).toHaveCount(1)
        await link.click()
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        await expect(shown(page, 'bill-payment-title')).toHaveText(`Bill payment ${first}`)
        const paymentBack = shown(page, 'entry-back')
        await expect(paymentBack).not.toContainText('Journal entries')
        await expect(paymentBack).toContainText('Bill')
        await paymentBack.click()
        await expectRecordUrl(page, 'bills', bill.id)
        await expect(shown(page, 'bill-badge')).toHaveText('Partly paid')

        // Pay bill again: the rest, 300.00, in full.
        await shown(page, 'bill-read-pay').click()
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(payBillsRowAmount(page, bill.id)).toHaveValue('300.00')
        await payFromChecking(page, bill.id)

        // Paid: nothing open, and Pay bill is gone.
        await expect(shown(page, 'bill-badge')).toHaveText('Paid')
        await expect(shown(page, 'bill-balance-due')).toHaveText('$0.00')
        await expect(shown(page, 'bill-total-payments')).toContainText('−$500.00')
        await expect(shown(page, 'bill-read-pay')).toHaveCount(0)
        await expect.poll(async () => (await barActionIds(page))[0]).toBe('bill-read-edit')
    })
})

test.describe('pay-bills: bill void refusal', () => {
    test('a paid bill voids only after its payment is voided', async ({ page }) => {
        await openBooks(page)
        const billNo = uniqueBillNo()
        const { bills } = await vendorWithBills(page, {
            bills: [{ amount: '150.00', due: await localDay(page, 10), billNo }],
        })
        const [bill] = bills

        await openBillBySearch(page, billNo)
        const payBill = shown(page, 'bill-read-pay')
        await expect(payBill).toBeVisible()
        await payBill.click()
        await expect(payBillsRowAmount(page, bill.id)).toHaveValue('150.00')
        const number = await payFromChecking(page, bill.id)
        await expect(shown(page, 'bill-badge')).toHaveText('Paid')

        // Void is refused in the Void dialog, as the invoice's is; the bill stays Paid.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(VOID_REFUSED)
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'bill-badge')).toHaveText('Paid')

        // Void the payment from its read view (opened from the Payments block).
        await shown(page, 'bill-payments').locator('[data-testid^="bill-payment-"]').click()
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        await expect(shown(page, 'bill-payment-title')).toHaveText(`Bill payment ${number}`)
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'bill-payment-badge')).toHaveText('Void')

        // Back on the bill: open again, and now it voids.
        await page.goBack()
        await expectRecordUrl(page, 'bills', bill.id)
        await expect(shown(page, 'bill-badge')).toHaveText('Posted')
        await expect(shown(page, 'bill-payments')).toHaveCount(0)
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'bill-badge')).toHaveText('Void')
    })
})

test.describe('pay-bills: unsaved draft bill kept under a searched bill', () => {
    test('Back and Cancel on a searched draft return to the draft below with its typed value', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor } = await vendorWithBills(page, { bills: [] })
        const memoA = uniqueMemo('Kept draft A')
        const memoB = uniqueMemo('Searched draft B')
        const typed = `KEEP${Date.now()}`

        // Two saved drafts, A and B, each with its own memo.
        const ids: string[] = []
        for (const memo of [memoA, memoB]) {
            await openNewBill(page)
            await pickBillVendor(page, vendor.name)
            await page.getByTestId('form-input-memo').fill(memo)
            await page.getByTestId('bill-save-draft').click()
            await expect(page).toHaveURL(BILL_URL)
            await expect(shown(page, 'bill-title')).toHaveText('Draft bill')
            ids.push(await billIdFromUrl(page))
        }
        const [idA, idB] = ids

        // A, by search, with a value typed and not saved. The saved draft focuses its
        // Vendor picker, which takes typed keys: leave it so `/` opens the search palette.
        await shown(page, 'bill-title').click()
        await openBillBySearch(page, memoA)
        await expectRecordUrl(page, 'bills', idA)
        await shown(page, 'form-input-ref_no').fill(typed)
        // Leave the text field so `/` opens the search palette.
        await shown(page, 'bill-title').click()

        // B, by search over A; its back link names what it leads to and goes back to A.
        await openBillBySearch(page, memoB)
        await expectRecordUrl(page, 'bills', idB)
        await expect(shown(page, 'form-input-memo')).toHaveValue(memoB)
        const back = shown(page, 'entry-back')
        await expect(back).not.toContainText('Journal entries')
        await back.click()
        await expectRecordUrl(page, 'bills', idA)
        await expect(shown(page, 'form-input-memo')).toHaveValue(memoA)
        await expect(shown(page, 'form-input-ref_no')).toHaveValue(typed)

        // B again, and its Cancel: back to A, still with the typed value.
        await shown(page, 'bill-title').click()
        await openBillBySearch(page, memoB)
        await expectRecordUrl(page, 'bills', idB)
        await shown(page, 'bill-cancel').click()
        await expectRecordUrl(page, 'bills', idA)
        await expect(shown(page, 'form-input-memo')).toHaveValue(memoA)
        await expect(shown(page, 'form-input-ref_no')).toHaveValue(typed)
    })
})
