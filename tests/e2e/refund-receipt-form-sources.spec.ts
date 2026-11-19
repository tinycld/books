import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import { creditMemoUrlOf, openCreditMemoBySearch, postCreditMemo } from './credit-memo-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import {
    pickRefundCustomer,
    pickRefundLineProduct,
    pushPath,
    REFUND_RECEIPT_URL,
    refundLineRowId,
    refundLineRows,
    refundReceiptIdFromUrl,
    refundReceiptUrlOf,
    visibleTestId,
} from './refund-receipt-helpers'
import {
    chooseReceiptSelect,
    openNewSalesReceipt,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
    salesReceiptUrlOf,
} from './sales-receipt-helpers'

// The two sources of a refund receipt (refund receipt spec §3.2, §3.3, §3.8, §3.11,
// §3.12): Refund (R) on a posted sales receipt and Refund credit (R) on a posted credit
// memo, the form each starts, the link row, the payout's locked customer, cap and date
// rule, the stored link on the refund's read view and on its correction, the two read
// sections, and the credit memo's Refunded and Unapplied credit rows. Every sales receipt,
// credit memo and refund is made by driving its form with a unique memo and the default
// date; no seeded record and no setting is changed.
//
// The sales receipts are posted with the default Deposit to and never pick it: "Sales
// deposited to" is a shared setting (sales-receipt-form-settings.spec.ts) that hides the
// field, and in either mode the receipt lands on 1200 Undeposited funds, so the test reads
// the account from the receipt's read view.
//
// The credit memos are Northwind Traders' (tax exempt), so a payout's amounts are the
// lines' amounts with no tax.
//
// The last test runs at phone size: Refund and Refund credit are More rows there, the
// band stacks, the lines are cards and the section draws cards, other code than the wide
// layout. Not driven here: a reader's read views, the cannot-refund state of a credit
// memo, loading (unit-tested documentScreenState and sourceAllowed), the server's link
// refusals and the credit memo correction's refusals (Go tests), native keys.

const MONEY = /\$[\d,]+\.\d{2}/
const MINUS = '−'
const PAYOUT_NOTICE =
    'This refund pays out a credit. It lowers what Books owes the customer; income and sales tax were lowered by the credit memo.'
const PAYOUT_VOID_TEXT = "The credit memo's credit is unapplied again."
const MEMO_VOID_REFUSAL = 'A refund receipt is recorded on this credit memo. Void the refund first.'

function customerName(id: string) {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const NORTHWIND = customerName(CUSTOMER_IDS.northwind)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const PATCH_CABLE = productName(PRODUCT_IDS.patchCable)

// The receipt's two lines, as the refund form shows them again.
const RECEIPT_LINES = [
    { product: ACCESS_POINT, quantity: '2', rate: '100', shownRate: '100.00' },
    { product: PATCH_CABLE, quantity: '3', rate: '15', shownRate: '15.00' },
] as const

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function shown(page: Page, testId: string): Locator {
    return visibleTestId(page, testId)
}

function centsOf(text: string): number {
    const amount = MONEY.exec(text)?.[0]
    if (!amount) throw new Error(`no amount in "${text}"`)
    return Math.round(Number(amount.replace(/[$,]/g, '')) * 100)
}

async function centsIn(locator: Locator): Promise<number> {
    return centsOf(await locator.innerText())
}

function money(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function dayBefore(day: string): string {
    const [year, month, date] = day.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, date - 1))
    return d.toISOString().slice(0, 10)
}

async function titleNumber(title: Locator, noun: string): Promise<string> {
    const pattern = new RegExp(`^${noun} (\\d+)$`)
    await expect(title).toHaveText(pattern)
    const number = pattern.exec(await title.innerText())?.[1]
    if (!number) throw new Error(`the ${noun} title has no number`)
    return number
}

function fromSalesReceiptUrlOf(id: string) {
    return new RegExp(`/books/refund-receipts/new\\?(?:[^#]*&)?sales_receipt=${id}(?:[&#]|$)`)
}

function fromCreditMemoUrlOf(id: string) {
    return new RegExp(`/books/refund-receipts/new\\?(?:[^#]*&)?credit_memo=${id}(?:[&#]|$)`)
}

// The rows of a linked-documents section: `<section>-row-<id>`.
function sectionRows(section: Locator, sectionId: string) {
    return section.locator(`[data-testid^="${sectionId}-row-"]`)
}

// Books must already be open. Posts a sales receipt of Harborview, Check, with the two
// lines and this memo, and leaves the page on its read view.
async function postSalesReceipt(page: Page, memo: string) {
    await openNewSalesReceipt(page)
    await pickReceiptCustomer(page, HARBORVIEW)
    for (const [index, line] of RECEIPT_LINES.entries()) {
        if (index > 0) await page.getByTestId('form-table-lines-add').click()
        const rowId = await pickReceiptLineProduct(page, index, line.product)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill(line.quantity)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(line.rate)
    }
    await chooseReceiptSelect(page, 'payment_method', 'Check')
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('sales-receipt-post').click()
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
    await expect(shown(page, 'sales-receipt-read-only')).toBeVisible()
    const id = salesReceiptIdFromUrl(page)
    const number = await titleNumber(shown(page, 'sales-receipt-title'), 'Sales receipt')
    return { id, number }
}

// Posts the open refund form with this memo and leaves the page on its read view.
async function postRefund(page: Page, memo: string) {
    await shown(page, 'form-input-memo').fill(memo)
    await shown(page, 'refund-receipt-post').click()
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
    await expect(shown(page, 'refund-receipt-read-only')).toBeVisible()
    const number = await titleNumber(shown(page, 'refund-receipt-title'), 'Refund receipt')
    return { id: refundReceiptIdFromUrl(page), number }
}

// Removes the refund line at `index` with its row key (⌘⌥⌫ from a cell of the row).
async function removeRefundLine(page: Page, index: number) {
    const before = await refundLineRows(page).count()
    const rowId = await refundLineRowId(page, index)
    await page.getByTestId(lineCellTestId(rowId, 'quantity')).focus()
    await page.keyboard.press('ControlOrMeta+Alt+Backspace')
    await expect(refundLineRows(page)).toHaveCount(before - 1)
    await expect(page.getByTestId(`form-table-lines-row-${rowId}`)).toHaveCount(0)
}

// Books must already be open. Posts a credit memo of Northwind (tax exempt) with one
// Wireless access point line at $100.00 and leaves the page on its read view.
async function postNorthwindMemo(page: Page, memo: string) {
    const posted = await postCreditMemo(page, {
        customer: NORTHWIND,
        product: ACCESS_POINT,
        rate: '100',
        memo,
    })
    const total = await centsIn(shown(page, 'credit-memo-total-credit'))
    return { ...posted, total }
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

async function shiftTabTo(page: Page, target: Locator) {
    await page.keyboard.press('Shift+Tab')
    await expect(target).toBeFocused()
}

// Shift+Tab until focus leaves the band's first row (Customer, Bill to, Email); the
// Customer is never focused on the way.
async function walkOutOfBandFirstRow(page: Page, customer: Locator) {
    const firstRow = page.getByTestId('refund-receipt-band-form')
    const inFirstRow = () => firstRow.evaluate(row => row.contains(row.ownerDocument.activeElement))
    for (let step = 0; step < 6 && (await inFirstRow()); step++) {
        await page.keyboard.press('Shift+Tab')
        await expect(customer).not.toBeFocused()
    }
    expect(await inFirstRow()).toBe(false)
}

test.describe('refund-receipt-form: sources', () => {
    test('a sales receipt is refunded from its read view', async ({ page }) => {
        const receiptMemo = uniqueMemo('Refund source receipt')
        const refundMemo = uniqueMemo('Refund of a receipt')
        const unlinkedMemo = uniqueMemo('Refund unlinked by customer')
        await openBooks(page)
        const receipt = await postSalesReceipt(page, receiptMemo)
        const deposit = /deposited to (.+)$/.exec(
            await shown(page, 'sales-receipt-detail-payment').innerText()
        )?.[1]
        if (!deposit) throw new Error('the receipt read view names no deposit account')
        const receivedBefore = await centsIn(shown(page, 'sales-receipt-total-received'))
        const totalBefore = await centsIn(shown(page, 'sales-receipt-total'))
        // No refund names the receipt yet: no section.
        await expect(page.getByTestId('sales-receipt-refunds')).toHaveCount(0)

        // R opens the refund form started from the receipt, Customer focused.
        await page.keyboard.press('r')
        await expect(page).toHaveURL(fromSalesReceiptUrlOf(receipt.id))
        await expect(page.getByTestId('refund-receipt-title')).toHaveText('New refund receipt')
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()
        await expect(customer).toContainText(HARBORVIEW)
        await expect(refundLineRows(page)).toHaveCount(RECEIPT_LINES.length)
        for (const [index, line] of RECEIPT_LINES.entries()) {
            const rowId = await refundLineRowId(page, index)
            await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(
                line.product
            )
            await expect(page.getByTestId(lineCellTestId(rowId, 'quantity'))).toHaveValue(
                line.quantity
            )
            await expect(page.getByTestId(lineCellTestId(rowId, 'rate'))).toHaveValue(
                line.shownRate
            )
        }
        await expect(page.getByTestId('form-input-payment_method')).toContainText('Check')
        await expect(page.getByTestId('form-input-refund_from')).toContainText(deposit)
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue('')
        await expect(page.getByTestId('form-input-message')).toHaveValue('')
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))
        const link = page.getByTestId('refund-receipt-source-link')
        await expect(link).toHaveText(`Refund of sales receipt ${receipt.number}`)

        // Tab order (spec §3.4): Customer → Edit address → Edit customer → the link →
        // Remove link → Refund date.
        await tabTo(page, page.getByTestId('refund-receipt-edit-address'))
        await tabTo(page, page.getByTestId('refund-receipt-edit-customer'))
        await tabTo(page, link)
        await tabTo(page, page.getByTestId('refund-receipt-remove-link'))
        await tabTo(page, page.getByTestId('form-input-date'))

        // The second line is not refunded: removed with its row key.
        await removeRefundLine(page, 1)
        const posted = await postRefund(page, refundMemo)
        await expect(shown(page, 'refund-receipt-source-link')).toHaveText(
            `Refund of sales receipt ${receipt.number}`
        )

        // E: the correction keeps the link, in the form and after it posts.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(
            new RegExp(`/books/refund-receipts/new\\?replaces=${posted.id}$`)
        )
        await expect(page.getByTestId('refund-receipt-title')).toHaveText(`Edit ${posted.number}`)
        await expect(page.getByTestId('refund-receipt-source-link')).toHaveText(
            `Refund of sales receipt ${receipt.number}`
        )
        await page.getByTestId('refund-receipt-post').click()
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page).not.toHaveURL(refundReceiptUrlOf(posted.id))
        await expect(shown(page, 'refund-receipt-read-only')).toBeVisible()
        await expect(shown(page, 'refund-receipt-title')).toHaveText(
            `Refund receipt ${posted.number}`
        )
        const correctionId = refundReceiptIdFromUrl(page)
        const correctionLink = shown(page, 'refund-receipt-source-link')
        await expect(correctionLink).toHaveText(`Refund of sales receipt ${receipt.number}`)
        const amount = money(await centsIn(shown(page, 'refund-receipt-total-refunded')))

        // Enter on the link opens the receipt: its section lists the refund; its totals
        // are unchanged.
        await correctionLink.focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(salesReceiptUrlOf(receipt.id))
        const section = shown(page, 'sales-receipt-refunds')
        await expect(section).toBeVisible()
        await expect(section).toContainText('Refund receipts')
        await expect(sectionRows(section, 'sales-receipt-refunds')).toHaveCount(1)
        const row = section.getByTestId(`sales-receipt-refunds-row-${correctionId}`)
        await expect(row).toContainText(posted.number)
        await expect(row).toContainText(formatDay(await localToday(page)))
        await expect(row).toContainText(amount)
        await expect(row).not.toContainText(MINUS)
        await expect(row).toContainText('Refunded')
        await expect
            .poll(() => centsIn(shown(page, 'sales-receipt-total-received')))
            .toBe(receivedBefore)
        await expect.poll(() => centsIn(shown(page, 'sales-receipt-total'))).toBe(totalBefore)

        // A second refund of the same receipt: another customer drops the link, and it
        // posts with none.
        await page.keyboard.press('r')
        await expect(page).toHaveURL(fromSalesReceiptUrlOf(receipt.id))
        await expect(page.getByTestId('refund-receipt-source-link')).toBeVisible()
        await pickRefundCustomer(page, NORTHWIND)
        await expect(page.getByTestId('refund-receipt-source-link')).toHaveCount(0)
        await expect(page.getByTestId('refund-receipt-link-row')).toHaveCount(0)
        await expect(page.getByTestId('refund-receipt-remove-link')).toHaveCount(0)
        await postRefund(page, unlinkedMemo)
        await expect(shown(page, 'refund-receipt-detail-customer')).toContainText(NORTHWIND)
        await expect(shown(page, 'refund-receipt-source-link')).toHaveCount(0)
    })

    test("a credit memo's credit is paid out in part, then in full", async ({ page }) => {
        const memoMemo = uniqueMemo('Payout source memo')
        const partMemo = uniqueMemo('Payout part')
        const restMemo = uniqueMemo('Payout rest')
        await openBooks(page)
        const memo = await postNorthwindMemo(page, memoMemo)
        const today = await localToday(page)

        // R opens the payout form: Refund date focused, the customer locked, no Remove
        // link, the unapplied credit beside the link and the notice under it.
        await expect(shown(page, 'credit-memo-read-refund-credit')).toBeVisible()
        await page.keyboard.press('r')
        await expect(page).toHaveURL(fromCreditMemoUrlOf(memo.id))
        await expect(page.getByTestId('refund-receipt-title')).toHaveText('New refund receipt')
        await expect(page.getByTestId('form-input-date')).toBeFocused()
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toContainText(NORTHWIND)
        await expect(customer).toHaveAttribute('aria-disabled', 'true')
        // The locked Customer is no Tab stop (spec §3.3): Shift+Tab from Refund date walks
        // the link, then Edit customer, and leaves the band's first row without stopping
        // on Customer.
        await shiftTabTo(page, page.getByTestId('refund-receipt-source-link'))
        await shiftTabTo(page, page.getByTestId('refund-receipt-edit-customer'))
        await walkOutOfBandFirstRow(page, customer)
        await page.getByTestId('form-input-date').focus()
        await expect(page.getByTestId('form-input-date')).toBeFocused()
        await expect(page.getByTestId('refund-receipt-remove-link')).toHaveCount(0)
        await expect(page.getByTestId('refund-receipt-link-row')).toContainText(
            `Pays out credit memo ${memo.number} · ${money(memo.total)} unapplied`
        )
        // Only the memo's words are the link; the unapplied credit is plain text beside it.
        await expect(page.getByTestId('refund-receipt-source-link')).toHaveText(
            `Pays out credit memo ${memo.number}`
        )
        await expect(page.getByTestId('refund-receipt-payout-notice')).toHaveText(PAYOUT_NOTICE)
        await expect(page.getByTestId('form-input-payment_method')).not.toContainText('Check')
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue('')
        await expect(refundLineRows(page)).toHaveCount(1)

        // Every line kept and a second line added: over the unapplied credit. Post shows the
        // cap under the link row and writes nothing.
        let writes = 0
        page.on('request', request => {
            if (request.method() === 'GET') return
            const path = new URL(request.url()).pathname
            if (path === '/api/batch' || path.startsWith('/api/collections/books_refund_receipts'))
                writes++
        })
        await page.getByTestId('form-table-lines-add').click()
        const added = await pickRefundLineProduct(page, 1, PATCH_CABLE)
        await page.getByTestId(lineCellTestId(added, 'rate')).fill('40')
        await page.getByTestId('form-input-memo').fill(partMemo)
        await page.getByTestId('refund-receipt-post').click()
        await expect(page.getByTestId('refund-receipt-source-error')).toHaveText(
            `The refund is more than the unapplied credit of ${money(memo.total)} on credit memo ${memo.number}.`
        )

        // Dated one day before the memo: the date rule under Refund date.
        await page.getByTestId('form-input-date').fill(dayBefore(today))
        await page.getByTestId('refund-receipt-post').click()
        await expect(page.getByTestId('form-field-date-error')).toHaveText(
            `Date the refund on or after the credit memo's date, ${formatDay(today)}.`
        )
        expect(writes).toBe(0)
        await expect(page).toHaveURL(fromCreditMemoUrlOf(memo.id))

        // The memo's own line removed and the date restored: the part posts.
        await removeRefundLine(page, 0)
        await page.getByTestId('form-input-date').fill(today)
        const first = await postRefund(page, partMemo)
        await expect(shown(page, 'refund-receipt-source-link')).toHaveText(
            `Pays out credit memo ${memo.number}`
        )
        const part = await centsIn(shown(page, 'refund-receipt-total-refunded'))
        expect(part).toBeGreaterThan(0)
        expect(part).toBeLessThan(memo.total)

        // E: the correction's row shows the unapplied credit plus what the original pays
        // out, and the correction keeps the link.
        const unappliedAfterPart = memo.total - part
        await page.keyboard.press('e')
        await expect(page).toHaveURL(
            new RegExp(`/books/refund-receipts/new\\?replaces=${first.id}$`)
        )
        await expect(page.getByTestId('refund-receipt-link-row')).toContainText(
            `Pays out credit memo ${memo.number} · ${money(unappliedAfterPart + part)} unapplied`
        )
        await page.getByTestId('refund-receipt-post').click()
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page).not.toHaveURL(refundReceiptUrlOf(first.id))
        await expect(shown(page, 'refund-receipt-read-only')).toBeVisible()
        const correctionId = refundReceiptIdFromUrl(page)
        await expect(shown(page, 'refund-receipt-source-link')).toHaveText(
            `Pays out credit memo ${memo.number}`
        )

        // Its void dialog names the credit; Escape keeps it posted.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(PAYOUT_VOID_TEXT)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)

        // The memo: Refunded and Unapplied credit after "Credit amount", the Refunds
        // section, and Refund credit still offered.
        await shown(page, 'refund-receipt-source-link').click()
        await expect(page).toHaveURL(creditMemoUrlOf(memo.id))
        const credit = shown(page, 'credit-memo-total-credit')
        const refunded = shown(page, 'credit-memo-total-refunded')
        const unapplied = shown(page, 'credit-memo-total-unapplied')
        await expect(refunded).toContainText(`${MINUS}${money(part)}`)
        await expect(unapplied).toContainText(money(memo.total - part))
        await expect(credit).toContainText(money(memo.total))
        const topOf = async (locator: Locator) => (await locator.boundingBox())?.y ?? Number.NaN
        await expect
            .poll(async () => [
                (await topOf(refunded)) > (await topOf(credit)),
                (await topOf(unapplied)) > (await topOf(refunded)),
            ])
            .toEqual([true, true])
        const section = shown(page, 'credit-memo-refunds')
        await expect(section).toContainText('Refunds')
        await expect(sectionRows(section, 'credit-memo-refunds')).toHaveCount(1)
        const row = section.getByTestId(`credit-memo-refunds-row-${correctionId}`)
        await expect(row).toContainText(first.number)
        await expect(row).toContainText(money(part))
        await expect(row).toContainText('Refunded')
        await expect(shown(page, 'credit-memo-read-refund-credit')).toBeVisible()

        // A second payout of the rest: the memo has no unapplied credit left and offers no
        // Refund credit.
        const rest = memo.total - part
        await page.keyboard.press('r')
        await expect(page).toHaveURL(fromCreditMemoUrlOf(memo.id))
        await expect(page.getByTestId('refund-receipt-link-row')).toContainText(
            `Pays out credit memo ${memo.number} · ${money(rest)} unapplied`
        )
        const restRow = await refundLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(restRow, 'rate')).fill((rest / 100).toFixed(2))
        await postRefund(page, restMemo)
        await expect(shown(page, 'refund-receipt-badge')).toHaveText('Posted')
        await shown(page, 'refund-receipt-source-link').click()
        await expect(page).toHaveURL(creditMemoUrlOf(memo.id))
        await expect(shown(page, 'credit-memo-total-unapplied')).toContainText('$0.00')
        await expect(shown(page, 'credit-memo-total-refunded')).toContainText(
            `${MINUS}${money(memo.total)}`
        )
        await expect(
            sectionRows(shown(page, 'credit-memo-refunds'), 'credit-memo-refunds')
        ).toHaveCount(2)
        await expect(shown(page, 'credit-memo-read-refund-credit')).toHaveCount(0)
    })

    test('a refunded credit memo cannot be voided until its refund is', async ({ page }) => {
        const memoMemo = uniqueMemo('Payout void memo')
        const payoutMemo = uniqueMemo('Payout to void')
        const draftMemo = uniqueMemo('Refund draft receipt source')
        await openBooks(page)
        const memo = await postNorthwindMemo(page, memoMemo)
        await page.keyboard.press('r')
        await expect(page).toHaveURL(fromCreditMemoUrlOf(memo.id))
        const payout = await postRefund(page, payoutMemo)

        // V on the memo: refused while the payout is posted; the memo stays Posted.
        await shown(page, 'refund-receipt-source-link').click()
        await expect(page).toHaveURL(creditMemoUrlOf(memo.id))
        await expect(shown(page, 'credit-memo-read-refund-credit')).toHaveCount(0)
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(MEMO_VOID_REFUSAL)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Posted')

        // The payout is voided from its read view (opened from the memo's section).
        const section = shown(page, 'credit-memo-refunds')
        await section
            .getByTestId(`credit-memo-refunds-row-${payout.id}`)
            .getByText(payout.number, { exact: true })
            .click()
        await expect(page).toHaveURL(refundReceiptUrlOf(payout.id))
        await expect(shown(page, 'refund-receipt-badge')).toHaveText('Posted')
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(PAYOUT_VOID_TEXT)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'refund-receipt-badge')).toHaveText('Void')

        // The memo: no Refunded or Unapplied credit row, Refund credit again, the refund
        // listed as Void; and now it voids.
        await shown(page, 'refund-receipt-source-link').click()
        await expect(page).toHaveURL(creditMemoUrlOf(memo.id))
        await expect(shown(page, 'credit-memo-read-refund-credit')).toBeVisible()
        await expect(shown(page, 'credit-memo-total-refunded')).toHaveCount(0)
        await expect(shown(page, 'credit-memo-total-unapplied')).toHaveCount(0)
        const voided = shown(page, 'credit-memo-refunds').getByTestId(
            `credit-memo-refunds-row-${payout.id}`
        )
        await expect(voided).toContainText(payout.number)
        await expect(voided).toContainText('Void')
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Void')

        // `?sales_receipt` of a draft receipt cannot be refunded.
        await openNewSalesReceipt(page)
        await pickReceiptCustomer(page, HARBORVIEW)
        await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(draftMemo)
        await page.getByTestId('sales-receipt-save-draft').click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('Draft sales receipt')
        const draftId = salesReceiptIdFromUrl(page)
        await pushPath(page, `/a/books/refund-receipts/new?sales_receipt=${draftId}`)
        await expect(page).toHaveURL(fromSalesReceiptUrlOf(draftId))
        const notice = shown(page, 'refund-receipt-cannot-refund')
        await expect(notice).toContainText('This sales receipt cannot be refunded')
        await expect(notice.getByTestId('entry-back')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-form')).toHaveCount(0)
    })

    test('phone: refund a sales receipt from More', async ({ page }) => {
        const memoMemo = uniqueMemo('Phone refund credit memo')
        const receiptMemo = uniqueMemo('Phone refund receipt source')
        const refundMemo = uniqueMemo('Phone refund')
        await openBooks(page)
        await postNorthwindMemo(page, memoMemo)
        const receipt = await postSalesReceipt(page, receiptMemo)
        await page.setViewportSize(PHONE)
        // The phone layout first: the read view's More button.
        await expect(shown(page, 'sales-receipt-read-more')).toBeVisible()

        await shown(page, 'sales-receipt-read-more').click()
        const refundRow = page.getByTestId('sales-receipt-read-refund')
        await expect(refundRow).toBeVisible()
        // The shared More row draws a plain-letter key in lower case.
        await expect(refundRow).toContainText(/Refund\s*r$/)
        await refundRow.click()
        await expect(page).toHaveURL(fromSalesReceiptUrlOf(receipt.id))
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(page.getByTestId('form-table-lines-cards')).toBeVisible()
        await expect(refundLineRows(page)).toHaveCount(RECEIPT_LINES.length)
        await expect(page.getByTestId('refund-receipt-source-link')).toHaveText(
            `Refund of sales receipt ${receipt.number}`
        )

        // The stacked band: the link row above Refund date; the Payment row's cells one
        // under another.
        const box = async (testId: string) => {
            const b = await page.getByTestId(testId).boundingBox()
            if (!b) return { top: Number.NaN, bottom: Number.NaN, left: Number.NaN }
            return { top: b.y, bottom: b.y + b.height, left: b.x }
        }
        await expect
            .poll(async () => {
                const linkRow = await box('refund-receipt-link-row')
                const date = await box('form-input-date')
                const method = await box('form-input-payment_method')
                const reference = await box('form-input-reference_no')
                const from = await box('form-input-refund_from')
                return [
                    linkRow.bottom <= date.top,
                    method.bottom <= reference.top,
                    reference.bottom <= from.top,
                ]
            })
            .toEqual([true, true, true])

        // The phone bar: Cancel, Save draft, Post and More; More holds Post & new.
        for (const action of ['cancel', 'save-draft', 'post', 'more']) {
            await expect(page.getByTestId(`refund-receipt-${action}`)).toBeVisible()
        }
        await expect(page.getByTestId('refund-receipt-post-new')).toHaveCount(0)
        await page.getByTestId('refund-receipt-more').click()
        await expect(page.getByTestId('refund-receipt-post-new')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('refund-receipt-post-new')).toHaveCount(0)

        // Post from the bar; the receipt's section draws cards.
        const refund = await postRefund(page, refundMemo)
        await shown(page, 'refund-receipt-source-link').click()
        await expect(page).toHaveURL(salesReceiptUrlOf(receipt.id))
        const cards = shown(page, 'sales-receipt-refunds-cards')
        await expect(cards).toBeVisible()
        await expect(
            page.locator('[data-testid="sales-receipt-refunds-table"]:visible')
        ).toHaveCount(0)
        const card = cards.getByTestId(`sales-receipt-refunds-row-${refund.id}`)
        await expect(card).toContainText(refund.number)
        await expect(card).toContainText('Refunded')

        // A posted credit memo's More lists Refund credit with its key.
        await openCreditMemoBySearch(page, memoMemo)
        await expect(shown(page, 'credit-memo-read-more')).toBeVisible()
        await shown(page, 'credit-memo-read-more').click()
        const creditRow = page.getByTestId('credit-memo-read-refund-credit')
        await expect(creditRow).toBeVisible()
        await expect(creditRow).toContainText(/Refund credit\s*r$/)
    })
})
