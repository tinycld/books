import { expect, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { BATCH_WRITE, batchOperations, refuseBatchOperation } from './journal-entries-helpers'
import {
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRow,
    payBillsRowAmount,
    pickSelect,
    uniqueCheckNo,
    vendorWithBills,
} from './pay-bills-helpers'

// What Pay Bills shows when a Pay is refused, when the open bills cannot load, and when the
// user leaves (spec §3.5). A server refusal is forced on the batch with
// `refuseBatchOperation`: the server's own over-balance and not-open refusals need a bill
// paid between the list read and Pay, which one page cannot make without a raw write;
// bill_payments_test.go covers the server rules and this spec covers their display. Each
// test makes its own vendor and bills.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The place of the first payment create in a Pay's batch; -1 for any other request.
function firstPaymentIndex(request: Request): number {
    return batchOperations(request).findIndex(
        operation =>
            operation.method === 'POST' &&
            /\/api\/collections\/books_bill_payments\/records/.test(operation.url)
    )
}

// Refuses the first payment create of every Pay batch with `response`; every other
// request passes. Replaces any earlier refusal.
async function refusePayment(page: Page, response: object) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route(BATCH_WRITE, route => {
        const index = firstPaymentIndex(route.request())
        if (index < 0) return route.continue()
        return refuseBatchOperation(route, index, response)
    })
}

function fieldRefusal(field: string, message: string) {
    return {
        status: 400,
        message: 'Failed to create record.',
        data: { [field]: { code: 'validation_refused', message } },
    }
}

test.describe('pay-bills: refusals, load error and discard', () => {
    test('a refused Pay shows each refusal where it belongs and keeps the typed values', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '300.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        const start = uniqueCheckNo()
        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await expect(page.getByTestId('pay-bills-method')).toContainText('Check')
        await page.getByTestId('pay-bills-check-no').fill(start)
        await filterToVendor(page, vendor)
        const amount = payBillsRowAmount(page, bill.id)
        await amount.fill('120.00')
        const pay = page.getByTestId('pay-bills-pay')

        // A line refusal (data lines.0 of the payment) goes under that bill's cell. The
        // batch is held first: while the Pay runs, the Due chip is disabled (core PickMenu
        // `isDisabled`): it is no Tab stop, and neither a press nor Enter opens its menu.
        const lineText = `Bill ${bill.number}: the payment is more than its open balance of $50.00.`
        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.unrouteAll({ behavior: 'wait' })
        await page.route(BATCH_WRITE, async route => {
            const index = firstPaymentIndex(route.request())
            if (index < 0) return route.continue()
            await held
            return refuseBatchOperation(route, index, fieldRefusal('lines.0', lineText))
        })
        const batchSent = page.waitForRequest(request => firstPaymentIndex(request) >= 0)
        await pay.click()
        await batchSent
        const dueFilter = page.getByTestId('pay-bills-due-filter')
        const overdue = page.getByTestId('pay-bills-due-filter-overdue')
        await expect(dueFilter).toHaveAttribute('aria-disabled', 'true')
        await dueFilter.click({ force: true })
        await expect(overdue).toHaveCount(0)
        expect(await dueFilter.evaluate(el => (el as HTMLElement).tabIndex)).toBeLessThan(0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await dueFilter.focus()
        await page.keyboard.press('Enter')
        await expect(overdue).toHaveCount(0)
        release()
        await expect(page.getByTestId(`pay-bills-row-error-${bill.id}`)).toHaveText(lineText)
        await expect(overdue).toHaveCount(0)
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(amount).toHaveValue('120.00')
        await expect(page.getByTestId('pay-bills-check-no')).toHaveValue(start)
        await expect(page.getByTestId('pay-bills-paid-from')).toContainText(CHECKING)

        // A taken check number goes under Starting check no.
        const checkText = `Check no. ${start} from ${CHECKING} is already on Bill payment 1006.`
        await refusePayment(page, fieldRefusal('reference_no', checkText))
        await pay.click()
        await expect(page.getByTestId('pay-bills-check-no-error')).toHaveText(checkText)
        await expect(amount).toHaveValue('120.00')

        // A refusal with no field goes in the error summary.
        const rootText = 'The books are closed through 2026-06-30.'
        await refusePayment(page, { status: 400, message: rootText, data: {} })
        await pay.click()
        await expect(page.getByTestId('pay-bills-error-summary')).toContainText(rootText)
        await expect(amount).toHaveValue('120.00')
        await expect(payBillsRow(page, bill.id)).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('Pay checks the rows before it writes', async ({ page }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '300.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await filterToVendor(page, vendor)
        const batches: Request[] = []
        page.on('request', request => {
            if (firstPaymentIndex(request) >= 0) batches.push(request)
        })
        const pay = page.getByTestId('pay-bills-pay')

        // No row paid.
        await pay.click()
        await expect(page.getByTestId('pay-bills-error-summary')).toContainText(
            'Select at least one bill to pay.'
        )

        // A row above its open amount.
        await payBillsRowAmount(page, bill.id).fill('999.00')
        await pay.click()
        await expect(page.getByTestId(`pay-bills-row-error-${bill.id}`)).toHaveText(
            'More than the open balance of $300.00'
        )
        await expect(page).toHaveURL(PAY_BILLS_URL)
        expect(batches).toEqual([])
    })

    test('a failed load of the open bills shows Retry, which loads them', async ({ page }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '75.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        await page.route('**/api/collections/books_bills/records*', route =>
            route.request().method() === 'GET'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ status: 400, message: 'Refused.', data: {} }),
                  })
                : route.fallback()
        )
        await openPayBills(page)
        const message = page.getByTestId('pay-bills-message')
        await expect(message).toContainText('Books could not load the open bills.')
        const retry = page.getByTestId('pay-bills-retry')
        await expect(retry).toBeVisible()
        await expect(page.getByTestId('pay-bills-form')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(message).toHaveCount(0)
        await filterToVendor(page, vendor)
        await expect(payBillsRow(page, bill.id)).toBeVisible()
    })

    test('leaving asks first only when a payment is entered', async ({ page }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '60.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        const discard = page.getByTestId('discard-dialog')

        // With nothing entered, Cancel leaves at once.
        await openPayBills(page)
        await page.getByTestId('pay-bills-cancel').click()
        await expect(page).not.toHaveURL(PAY_BILLS_URL)
        await expect(discard).toHaveCount(0)

        // With a payment, Esc asks; Esc again closes only the question; Discard leaves.
        await openPayBills(page)
        await filterToVendor(page, vendor)
        const amount = payBillsRowAmount(page, bill.id)
        await amount.fill('60.00')
        await page.keyboard.press('Escape')
        await expect(discard).toBeVisible()
        await expect(discard).toContainText('Discard this payment? The bills stay open.')
        await page.keyboard.press('Escape')
        await expect(discard).toHaveCount(0)
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(amount).toHaveValue('60.00')
        await page.keyboard.press('Escape')
        await expect(discard).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).not.toHaveURL(PAY_BILLS_URL)
        await expect(page.getByTestId('pay-bills-form')).toHaveCount(0)
    })
})
