import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import { batchWriteIndex } from './document-batch-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { BATCH_WRITE, refuseBatchOperation, settleFrames } from './journal-entries-helpers'
import { localDay, shown, vendorWithBills } from './pay-bills-helpers'
import {
    applyAmountCell,
    applyCreditToBill,
    applyDialog,
    openApplyDialog,
    postVendorCredit,
    searchToVendorCredit,
} from './vendor-credit-helpers'

// Applying a posted vendor credit to its vendor's open bills (vendor credit spec §3.7,
// §3.9), checkpoint 4: the read view's Apply to bills action (A) and notice, the apply
// dialog (a Sheet of cards on a phone), the Applied to block and Remove. Every test makes
// its own vendor with posted bills (`vendorWithBills`), so no other worker's bill is in its
// dialog and no seeded bill's balance moves, and its own posted credit with a unique memo,
// reopened through search. A server refusal is forced on the applications' create: the
// server's own refusals need a bill paid between the dialog's read and the write, which
// one page cannot make without a raw write; vendor_credit_applications_test.go covers
// them and this spec covers their display.
//
// One phone test: on a phone the dialog is a Sheet, the bills are cards, and the read bar
// keeps Apply to bills beside More. Not driven here: native-only behavior (no autofocus,
// no keys), the reader's view (tests/document-actions.test.ts), offline disabling (core
// Dialog.ActionButton), the zod rules beyond the ones a test types
// (tests/apply-credit-schema.test.ts).

const RENT = '6100 Rent'
const MINUS = '−'
const NOT_BEFORE_CREDIT = "The apply date can't be before the credit date."
const LOAD_FAILED = 'Books could not load the open bills.'
const APPLICATIONS_LOAD_FAILED = 'Books could not load where this credit is applied.'
const APPLICATIONS = 'books_vendor_credit_applications'
const REMOVE_BUTTONS = '[data-testid^="vendor-credit-application-remove-"]'
const APPLICATION_ROWS =
    '[data-testid^="vendor-credit-application-"]:not([data-testid^="vendor-credit-application-remove-"])'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function noticeText(vendor: string, bills: number) {
    const count = bills === 1 ? '1 open bill' : `${bills} open bills`
    return `${vendor} has ${count}. Apply this credit to lower what you pay.`
}

function removeText(billNumber: string, amount: string) {
    return `Remove this credit from Bill ${billNumber}? The bill's balance goes up by ${amount} and the credit is unapplied again.`
}

// The Applied to block's rows (not their Remove buttons).
function applicationRows(block: Locator) {
    return block.locator(APPLICATION_ROWS)
}

// Tab until the target has focus, from wherever focus is.
async function tabUntil(page: Page, target: Locator, presses = 12) {
    for (let press = 0; press < presses; press++) {
        if (await target.evaluate(el => el === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

// A create of an application: inside a batch, or a request of its own.
function isApplicationCreate(request: Request): boolean {
    if (batchWriteIndex(request, APPLICATIONS, 'POST') >= 0) return true
    return (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith(`/api/collections/${APPLICATIONS}/records`)
    )
}

// Refuses every application create with `response`, as PocketBase answers it (a batch's
// refused operation, or a create of its own); every other request passes. Replaces any
// earlier refusal.
async function refuseApplicationCreate(page: Page, response: object) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route(BATCH_WRITE, route => {
        const index = batchWriteIndex(route.request(), APPLICATIONS, 'POST')
        if (index < 0) return route.continue()
        return refuseBatchOperation(route, index, response)
    })
    await page.route(`**/api/collections/${APPLICATIONS}/records*`, route =>
        route.request().method() === 'POST'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify(response),
              })
            : route.fallback()
    )
}

// A refused GET of a collection's records; every other request passes.
async function refuseReads(page: Page, collection: string) {
    await page.route(`**/api/collections/${collection}/records*`, route =>
        route.request().method() === 'GET'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ status: 400, message: 'Refused.', data: {} }),
              })
            : route.fallback()
    )
}

// A second page of the same context, with realtime cut before login (lesson 22) and the
// given reads refused. Its store holds nothing yet, so the reads are made.
async function pageWithRefusedReads(page: Page, collection: string) {
    const other = await page.context().newPage()
    await other.route('**/api/realtime*', route => route.abort())
    await refuseReads(other, collection)
    await openBooks(other)
    return other
}

test.describe('vendor-credit-form: apply from the keyboard', () => {
    test('spreads a credit over two bills, applies it and removes one row, with no click', async ({
        page,
    }) => {
        const memo = uniqueMemo('Vendor credit apply keyboard')
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '30.00', due: await localDay(page, 5) },
                { amount: '100.00', due: await localDay(page, 20) },
            ],
        })
        const [first, second] = bills
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: RENT,
            amount: '50.00',
            memo,
        })
        const today = formatDay(await localToday(page))
        await expect(page.getByTestId('vendor-credit-apply-notice')).toContainText(
            noticeText(vendor.name, 2)
        )

        // From here on, no click. A: the dialog opens with the credit spread oldest due
        // first, and focus in the first Credit to apply cell.
        await page.keyboard.press('a')
        const dialog = applyDialog(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Apply vendor credit ${credit.number}`)
        // The figure (apply credit spec §3.2): the label "Unapplied credit" over the value.
        await expect(dialog).toContainText('Unapplied credit')
        await expect(page.getByTestId('apply-credit-figure')).toContainText('$50.00')
        const cell1 = applyAmountCell(page, first.id)
        const cell2 = applyAmountCell(page, second.id)
        await expect(cell1).toBeFocused()
        await expect(cell1).toHaveValue('30.00')
        await expect(cell2).toHaveValue('20.00')
        const summary = page.getByTestId('apply-credit-summary')
        await expect(summary).toHaveText('Applying $50.00 to 2 bills · $0.00 stays unapplied')

        // The cell's whole value is selected, so typing replaces it.
        await expect
            .poll(() =>
                cell1.evaluate(el => {
                    const input = el as HTMLInputElement
                    return [input.selectionStart, input.selectionEnd, input.value.length]
                })
            )
            .toEqual([0, 5, 5])
        await page.keyboard.type('10')
        await expect(cell1).toHaveValue('10')
        await expect(summary).toHaveText('Applying $30.00 to 2 bills · $20.00 stays unapplied')

        // ⌥↵ in the second cell unticks it, then ticks it to the lesser of its open
        // balance ($100.00) and the credit not yet placed ($40.00).
        await tabUntil(page, cell2)
        await page.keyboard.press('Alt+Enter')
        await expect(cell2).toHaveValue('')
        await expect(summary).toHaveText('Applying $10.00 to 1 bill · $40.00 stays unapplied')
        await page.keyboard.press('Alt+Enter')
        await expect(cell2).toHaveValue('40.00')
        await expect(summary).toHaveText('Applying $50.00 to 2 bills · $0.00 stays unapplied')

        // ⌘↵: Apply credit.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByText('Applied $50.00 to 2 bills', { exact: true })).toBeVisible()
        await expect(page.getByTestId('vendor-credit-badge')).toHaveText('Applied')
        await expect(page.getByTestId('vendor-credit-total-applied')).toContainText(
            `${MINUS}$50.00`
        )
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$0.00')
        const block = page.getByTestId('vendor-credit-applications')
        await expect(applicationRows(block)).toHaveCount(2)
        await expect(block).toContainText(`Bill ${first.number} · ${today} · $10.00`)
        await expect(block).toContainText(`Bill ${second.number} · ${today} · $40.00`)

        // Applied in full: no notice, no Apply to bills, and A opens nothing.
        await expect(page.getByTestId('vendor-credit-apply-notice')).toHaveCount(0)
        await expect(page.getByTestId('vendor-credit-read-apply')).toHaveCount(0)
        await page.keyboard.press('a')
        await settleFrames(page)
        await expect(dialog).toHaveCount(0)

        // Tab to the first row's Remove, Enter opens the confirm, Enter confirms.
        const firstRemove = block.locator(REMOVE_BUTTONS).first()
        await tabUntil(page, firstRemove, 60)
        await page.keyboard.press('Enter')
        const confirmText = page.getByText(removeText(first.number, '$10.00'), { exact: true })
        await expect(confirmText).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(confirmText).toHaveCount(0)
        await expect(applicationRows(block)).toHaveCount(1)
        await expect(block).not.toContainText(`Bill ${first.number} ·`)
        await expect(block).toContainText(`Bill ${second.number} · ${today} · $40.00`)
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$10.00')
        await expect(page.getByTestId('vendor-credit-badge')).toHaveText('Partly applied')
    })

    // Its own vendor and credit: the spread test above ran close to the test timeout on CI.
    test('Escape closes the dialog and applies nothing', async ({ page }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '30.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        await postVendorCredit(page, {
            vendor: vendor.name,
            account: RENT,
            amount: '20.00',
            memo: uniqueMemo('Vendor credit apply escape'),
        })
        await page.keyboard.press('a')
        const dialog = applyDialog(page)
        await expect(dialog).toBeVisible()
        await expect(applyAmountCell(page, bill.id)).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Posted')
        await expect(shown(page, 'vendor-credit-applications')).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText('$20.00')
    })
})

test.describe('vendor-credit-form: apply refusals', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('checks the rows and the date before it writes, and shows each refusal where it belongs', async ({
        page,
    }) => {
        const memo = uniqueMemo('Vendor credit apply refusals')
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '30.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        await postVendorCredit(page, { vendor: vendor.name, account: RENT, amount: '50.00', memo })
        const today = await localToday(page)
        const yesterday = await localDay(page, -1)
        const writes: string[] = []
        page.on('request', request => {
            if (isApplicationCreate(request)) writes.push(request.url())
        })

        await openApplyDialog(page)
        const dialog = applyDialog(page)
        const cell = applyAmountCell(page, bill.id)
        await expect(cell).toBeFocused()
        await expect(cell).toHaveValue('30.00')
        const submit = page.getByTestId('apply-credit-submit')
        const rowError = page.getByTestId(`apply-credit-row-error-${bill.id}`)
        const summary = page.getByTestId('apply-credit-error-summary')

        // A row above its open balance: under its cell, and nothing is written.
        await cell.fill('45')
        await submit.click()
        await expect(rowError).toHaveText('More than the open balance of $30.00')
        await expect(dialog).toBeVisible()
        expect(writes).toEqual([])

        // Unticked, no row is above zero.
        const tick = page.getByTestId(`apply-credit-row-tick-${bill.id}`)
        await tick.click()
        await expect(cell).toHaveValue('')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(summary).toContainText('Select at least one bill.')
        await expect(dialog).toBeVisible()
        expect(writes).toEqual([])

        // The day before the credit date: under the date.
        await tick.click()
        await expect(cell).toHaveValue('30.00')
        const date = page.getByTestId('apply-credit-date')
        await expect(date).toHaveValue(today)
        await date.fill(yesterday)
        await submit.click()
        const dateError = dialog.getByText(NOT_BEFORE_CREDIT, { exact: true })
        await expect(dateError).toBeVisible()
        await expect
            .poll(async () => {
                const field = await date.boundingBox()
                const error = await dateError.boundingBox()
                return field !== null && error !== null && error.y >= field.y + field.height - 1
            })
            .toBe(true)
        expect(writes).toEqual([])

        // The date's calendar stays inside the dialog (lesson 2): the first, the shown and
        // the 28th day of the month.
        await page.getByTestId('apply-credit-date-open').click()
        const month = yesterday.slice(0, 8)
        const days = [`${month}01`, yesterday, `${month}28`].map(day =>
            page.getByLabel(day, { exact: true }).first()
        )
        await expect(days[1]).toBeVisible()
        await expect
            .poll(async () => {
                const bounds = await dialog.boundingBox()
                if (!bounds) return false
                for (const day of days) {
                    const box = await day.boundingBox()
                    if (!box) return false
                    const inside =
                        box.x >= bounds.x - 1 &&
                        box.y >= bounds.y - 1 &&
                        box.x + box.width <= bounds.x + bounds.width + 1 &&
                        box.y + box.height <= bounds.y + bounds.height + 1
                    if (!inside) return false
                }
                return true
            })
            .toBe(true)
        // A press inside the dialog, away from the calendar, closes the calendar only.
        const bounds = await dialog.boundingBox()
        if (!bounds) throw new Error('the apply dialog has no box')
        await page.mouse.click(bounds.x + 8, bounds.y + 8)
        await expect(days[1]).toBeHidden()
        await expect(dialog).toBeVisible()
        await date.fill(today)
        await expect(dateError).toHaveCount(0)
        await expect(cell).toHaveValue('30.00')

        // A refusal keyed `bill` goes under the row's cell; the dialog keeps the amount.
        const notOpen = `Bill ${bill.number} is not open. Clear it to continue.`
        await refuseApplicationCreate(page, {
            status: 400,
            message: 'Failed to create record.',
            data: { bill: { code: 'validation_refused', message: notOpen } },
        })
        await submit.click()
        await expect(rowError).toHaveText(notOpen)
        await expect(dialog).toBeVisible()
        await expect(cell).toHaveValue('30.00')

        // A refusal with no field goes in the dialog's error summary.
        const rootText = 'The books are closed through 2026-06-30.'
        await refuseApplicationCreate(page, { status: 400, message: rootText, data: {} })
        await submit.click()
        await expect(summary).toContainText(rootText)
        await expect(dialog).toBeVisible()
        await expect(cell).toHaveValue('30.00')

        // With the refusals gone, ⌘↵ applies it.
        await page.unrouteAll({ behavior: 'wait' })
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('vendor-credit-badge')).toHaveText('Partly applied')
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText('$20.00')

        // The row's link opens the bill, paid in full by the credit.
        const row = applicationRows(page.getByTestId('vendor-credit-applications'))
        await expect(row).toHaveCount(1)
        await row.getByText(new RegExp(`^Bill ${bill.number} · `)).click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${bill.id}$`))
        await expect(shown(page, 'bill-badge')).toHaveText('Paid')
    })
})

// Books open on a vendor with one open bill of $30.00 and a posted $50.00 credit, whose
// read view is on screen. With `applied`, the credit pays the bill in full.
async function creditWithOneBill(page: Page, label: string, applied: boolean) {
    const memo = uniqueMemo(label)
    await openBooks(page)
    const { vendor, bills } = await vendorWithBills(page, {
        bills: [{ amount: '30.00', due: await localDay(page, 5) }],
    })
    const [bill] = bills
    const credit = await postVendorCredit(page, {
        vendor: vendor.name,
        account: RENT,
        amount: '50.00',
        memo,
    })
    const title = `Vendor credit ${credit.number} · ${vendor.name}`
    if (applied) {
        await applyCreditToBill(page, { memo, billId: bill.id, amount: '30.00' })
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')
    }
    return { memo, vendor, bill, title }
}

// Each test makes its own vendor, bill and credit: the four states are independent, and
// one test for all of them ran past the test timeout on CI.
test.describe('vendor-credit-form: remove and empty states', () => {
    test('a refused applications read shows the load notice, and Retry loads the row', async ({
        page,
    }) => {
        const { memo, bill, title } = await creditWithOneBill(
            page,
            'Vendor credit apply failed read',
            true
        )
        const today = formatDay(await localToday(page))

        // A refused applications read: the block shows its load notice with Retry, no
        // rows, and Retry loads the row.
        const failed = await pageWithRefusedReads(page, APPLICATIONS)
        await searchToVendorCredit(failed, memo, title)
        await expect(shown(failed, 'vendor-credit-read-only')).toBeVisible()
        const failedBlock = shown(failed, 'vendor-credit-applications')
        const blockBanner = failedBlock.getByTestId('vendor-credit-applications-banner')
        const blockRetry = failedBlock.getByTestId('vendor-credit-applications-retry')
        await expect(blockBanner).toContainText(APPLICATIONS_LOAD_FAILED)
        await expect(blockRetry).toBeVisible()
        await expect(applicationRows(failedBlock)).toHaveCount(0)
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.route('**/api/realtime*', route => route.abort())
        await blockRetry.click()
        await expect(applicationRows(failedBlock)).toHaveCount(1)
        await expect(blockBanner).toHaveCount(0)
        await expect(failedBlock).toContainText(`Bill ${bill.number} · ${today} · $30.00`)
        await failed.close()
    })

    test('no open bill: A opens the empty dialog and New bill; Remove asks first and gives the credit back', async ({
        page,
    }) => {
        const { memo, vendor, bill, title } = await creditWithOneBill(
            page,
            'Vendor credit apply remove',
            true
        )

        // The vendor's only bill is paid: no notice, but A still opens the dialog, with
        // the empty text, a New bill button and no Apply credit to press.
        await expect(page.getByTestId('vendor-credit-apply-notice')).toHaveCount(0)
        await page.keyboard.press('a')
        const dialog = applyDialog(page)
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('apply-credit-empty')).toContainText(
            `${vendor.name} has no open bills. The credit stays on the vendor until you post a bill or record a refund.`
        )
        const submit = page.getByTestId('apply-credit-submit')
        if ((await submit.count()) > 0) await expect(submit).toBeDisabled()

        // New bill opens the bill form with the vendor filled.
        await page.getByTestId('apply-credit-new-bill').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/bills/new\\?(?:.*&)?vendor=${vendor.id}(?:&.*)?$`)
        )
        await expect(shown(page, 'bill-form')).toBeVisible()
        await expect(shown(page, 'form-input-vendor')).toContainText(vendor.name)
        await page.keyboard.press('Escape')
        const discard = page.getByTestId('discard-dialog')
        await expect
            .poll(
                async () =>
                    (await discard.isVisible()) ||
                    (await page.getByTestId('bill-form').count()) === 0
            )
            .toBe(true)
        if (await discard.isVisible()) await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('bill-form')).toHaveCount(0)

        // Back on the credit: Remove asks first; Cancel keeps the row.
        await searchToVendorCredit(page, memo, title)
        const block = shown(page, 'vendor-credit-applications')
        await expect(applicationRows(block)).toHaveCount(1)
        const confirm = page
            .getByRole('dialog')
            .filter({ hasText: removeText(bill.number, '$30.00') })
        await block.locator(REMOVE_BUTTONS).first().click()
        await expect(confirm).toBeVisible()
        await confirm.getByRole('button', { name: /^Cancel/ }).click()
        await expect(confirm).toHaveCount(0)
        await expect(applicationRows(block)).toHaveCount(1)

        // Remove and confirm: the block is gone and the credit is whole again.
        await block.locator(REMOVE_BUTTONS).first().click()
        await expect(confirm).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(confirm).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-applications')).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Posted')
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText('$50.00')
        await expect(shown(page, 'vendor-credit-apply-notice')).toContainText(
            noticeText(vendor.name, 1)
        )
    })

    test('a held open-bills read shows no notice until it lands', async ({ page }) => {
        const { memo, vendor, title } = await creditWithOneBill(
            page,
            'Vendor credit apply held read',
            false
        )

        // A held open-bills read on a fresh page (realtime cut, lesson 22): no notice
        // while it is pending, the notice once it lands.
        const pending = await page.context().newPage()
        await pending.route('**/api/realtime*', route => route.abort())
        await openBooks(pending)
        let releaseBills = () => {}
        const billsHeld = new Promise<void>(resolve => {
            releaseBills = resolve
        })
        await pending.route('**/api/collections/books_bills/records*', async route => {
            if (route.request().method() !== 'GET') return route.fallback()
            await billsHeld
            return route.fallback()
        })
        await searchToVendorCredit(pending, memo, title)
        await expect(shown(pending, 'vendor-credit-read-only')).toBeVisible()
        await expect(shown(pending, 'vendor-credit-total-unapplied')).toContainText('$50.00')
        await settleFrames(pending)
        await expect(pending.getByTestId('vendor-credit-apply-notice')).toHaveCount(0)
        releaseBills()
        await expect(shown(pending, 'vendor-credit-apply-notice')).toContainText(
            noticeText(vendor.name, 1)
        )
        await pending.unrouteAll({ behavior: 'wait' })
        await pending.close()
    })

    test('a refused open-bills read: the dialog shows the load error, and Retry loads the bill', async ({
        page,
    }) => {
        const { memo, vendor, bill, title } = await creditWithOneBill(
            page,
            'Vendor credit apply refused read',
            false
        )

        // A refused open-bills read: no notice, and the dialog shows the load error with
        // Apply credit disabled.
        const refused = await pageWithRefusedReads(page, 'books_bills')
        await searchToVendorCredit(refused, memo, title)
        await expect(shown(refused, 'vendor-credit-read-only')).toBeVisible()
        await expect(refused.getByTestId('vendor-credit-apply-notice')).toHaveCount(0)
        await refused.keyboard.press('a')
        await expect(applyDialog(refused)).toBeVisible()
        await expect(refused.getByTestId('apply-credit-load-error')).toContainText(LOAD_FAILED)
        await expect(refused.getByTestId('apply-credit-submit')).toBeDisabled()

        // Retry with the read held: three skeleton rows and still no notice, then the bill.
        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await refused.unrouteAll({ behavior: 'wait' })
        await refused.route('**/api/realtime*', route => route.abort())
        await refused.route('**/api/collections/books_bills/records*', async route => {
            if (route.request().method() !== 'GET') return route.fallback()
            await held
            return route.fallback()
        })
        await refused.getByTestId('apply-credit-load-retry').click()
        const loading = refused.getByTestId('apply-credit-loading')
        await expect(loading).toBeVisible()
        await expect(loading.locator(':scope > *')).toHaveCount(3)
        await expect(refused.getByTestId('vendor-credit-apply-notice')).toHaveCount(0)
        release()
        await expect(applyAmountCell(refused, bill.id)).toBeVisible()
        await expect(loading).toHaveCount(0)
        await expect(refused.getByTestId('apply-credit-load-error')).toHaveCount(0)

        // The dialog's Retry recovered the read view's open-bills read too: closed, the
        // read view shows the notice.
        await refused.keyboard.press('Escape')
        await expect(applyDialog(refused)).toHaveCount(0)
        await expect(shown(refused, 'vendor-credit-apply-notice')).toContainText(
            noticeText(vendor.name, 1)
        )
        await refused.unrouteAll({ behavior: 'wait' })
        await refused.close()
    })
})

test.describe('vendor-credit-form: apply on a phone', () => {
    test('applies a credit from the Sheet of cards', async ({ page }) => {
        const memo = uniqueMemo('Vendor credit apply phone')
        await openBooks(page)
        const firstDue = await localDay(page, 5)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '30.00', due: firstDue },
                { amount: '100.00', due: await localDay(page, 20) },
            ],
        })
        const [first, second] = bills
        await postVendorCredit(page, { vendor: vendor.name, account: RENT, amount: '50.00', memo })
        await page.setViewportSize(PHONE)

        // The phone bar keeps Apply to bills beside More; Edit, Void, Copy and View
        // journal entry are in More.
        const more = page.getByTestId('vendor-credit-read-more')
        await expect(more).toBeVisible()
        await expect(page.getByTestId('vendor-credit-read-apply')).toBeVisible()
        await expect(page.getByTestId('vendor-credit-read-edit')).not.toBeVisible()
        await more.click()
        for (const label of ['Edit', 'Void', 'Copy', 'View journal entry']) {
            await expect(
                // A menu item's name ends with its shortcut hint, when it has one.
                page.getByRole('menuitem', { name: new RegExp(`^${label}( \\S)?$`) }),
                label
            ).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menuitem', { name: /^Void/ })).toHaveCount(0)

        // Apply to bills opens a Sheet of cards: no grid, no header tick box, and focus in
        // the first card's Credit to apply cell (web, at every width).
        await openApplyDialog(page)
        const card1 = page.getByTestId(`apply-credit-card-${first.id}`)
        const tick1 = page.getByTestId(`apply-credit-row-tick-${first.id}`)
        const tick2 = page.getByTestId(`apply-credit-row-tick-${second.id}`)
        const cell1 = applyAmountCell(page, first.id)
        const cell2 = applyAmountCell(page, second.id)
        await expect(page.getByTestId('apply-credit-cards')).toBeVisible()
        await expect(cell1).toBeFocused()
        await expect(page.getByTestId('apply-credit-grid')).toHaveCount(0)
        await expect(page.getByTestId('apply-credit-tick-all')).toHaveCount(0)
        await expect(card1).toContainText(`Bill ${first.number}`)
        await expect(card1).toContainText(formatDay(firstDue))
        await expect(card1).toContainText('Open balance')
        await expect(card1).toContainText('$30.00')
        await expect(card1).not.toContainText('Bill total')
        // The tick box and the bill on top; the Credit to apply input at full width.
        await expect
            .poll(async () => {
                const card = await card1.boundingBox()
                const tick = await tick1.boundingBox()
                const input = await cell1.boundingBox()
                if (!card || !tick || !input) return false
                return tick.y + tick.height <= input.y && input.width >= card.width * 0.8
            })
            .toBe(true)
        await expect(cell1).toHaveValue('30.00')
        await expect(cell2).toHaveValue('20.00')

        // Untick clears a card; tick sets the lesser of its open balance and the credit
        // not yet placed; with nothing left a tick sets nothing.
        await tick2.click()
        await expect(cell2).toHaveValue('')
        await tick2.click()
        await expect(cell2).toHaveValue('20.00')
        await tick1.click()
        await expect(cell1).toHaveValue('')
        await tick2.click()
        await expect(cell2).toHaveValue('')
        await tick2.click()
        await expect(cell2).toHaveValue('50.00')
        await tick1.click()
        await expect(cell1).toHaveValue('')

        // Clear empties every card.
        await page.getByTestId('apply-credit-clear').click()
        await expect(cell1).toHaveValue('')
        await expect(cell2).toHaveValue('')

        // Tick one and apply: the Sheet closes and the block shows the row, with a
        // Remove of at least 44 px.
        await tick1.click()
        await expect(cell1).toHaveValue('30.00')
        await page.getByTestId('apply-credit-submit').click()
        await expect(applyDialog(page)).toHaveCount(0)
        const block = page.getByTestId('vendor-credit-applications')
        await expect(applicationRows(block)).toHaveCount(1)
        await expect(block).toContainText(`Bill ${first.number}`)
        const remove = block.locator(REMOVE_BUTTONS)
        await expect(remove).toHaveCount(1)
        await expect
            .poll(async () => (await remove.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(44)
    })
})
