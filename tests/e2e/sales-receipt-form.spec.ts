import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { DESKTOP, openRegister, revealRegisterItem } from './account-register-helpers'
import {
    lineCellTestId,
    localToday,
    openNewInvoice,
    pickInvoiceCustomer,
    uniqueMemo,
} from './invoice-helpers'
import { openEntriesList, PHONE, searchEntries } from './journal-entries-helpers'
import { isDisabled } from './record-form-helpers'
import {
    chooseReceiptSelect,
    NEW_SALES_RECEIPT_URL,
    openNewSalesReceipt,
    pickNoCustomer,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    receiptLineRowId,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
    salesReceiptUrlOf,
    searchToSalesReceipt,
} from './sales-receipt-helpers'

// The sales receipt form and its read view (spec §3.2–§3.10). Every receipt is made by
// driving the form with a unique memo and the default date (today, after the close date
// books-settings.spec.ts holds); receipts are found again through the URL a save lands on
// or by search. No seeded receipt, customer, product or account is changed.
//
// "Sales deposited to" and the default message are shared settings: every test that
// depends on them lives in sales-receipt-form-settings.spec.ts. These tests never assert
// Deposit to's visibility, never pick a deposit account, never Tab past Reference no. and
// never assert an empty message; a receipt they post with the default deposit account
// lands on 1200 Undeposited funds in either mode.
//
// The void-and-copy test runs at phone size only: the read view's actions sit in a More
// menu (a Sheet) there, other code than the wide bar. Not driven here: the reader's read
// view, the loading, not-found, cannot-edit and no-access states (unit-tested
// documentReadActions / documentScreenState), native keys.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

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

// Harborview: Denver combined as its default tax. Northwind Traders: tax exempt
// (CUSTOMER_TAX_PATCHES). Wireless access point: a taxable seeded product.
function productDescription(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.sales_description
}

const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const NORTHWIND = customerName(CUSTOMER_IDS.northwind)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const TAX_PREP = productName(PRODUCT_IDS.taxPrep)
const WALK_IN_MESSAGE = 'Thank you for your business! Returns are accepted within 30 days.'
const REFERENCE_TOO_LONG = 'Reference no. can be at most 40 characters'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The number in the read view's title, "Sales receipt <n>".
async function receiptNumber(page: Page): Promise<string> {
    const title = page.getByTestId('sales-receipt-title')
    await expect(title).toHaveText(/^Sales receipt \d+$/)
    const number = /^Sales receipt (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

function taxableSwitch(page: Page, rowId: string) {
    return page.getByTestId(lineCellTestId(rowId, 'taxable')).getByRole('switch')
}

// Bill to's first line, whether the band draws the address as text or as the
// "Edit address" inputs.
async function billToText(page: Page): Promise<string> {
    const line1 = page.getByTestId('form-input-bill_to-line1')
    if ((await line1.count()) > 0) return line1.inputValue()
    return page.getByTestId('sales-receipt-bill-to').innerText()
}

// Books must already be open. Saves a new draft for Harborview with one Wireless access
// point line and this memo; leaves the page on the draft.
async function saveReceiptDraft(page: Page, memo: string): Promise<string> {
    await openNewSalesReceipt(page)
    await pickReceiptCustomer(page, HARBORVIEW)
    await pickReceiptLineProduct(page, 0, ACCESS_POINT)
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('sales-receipt-save-draft').click()
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
    await expect(page.getByTestId('sales-receipt-title')).toHaveText('Draft sales receipt')
    return salesReceiptIdFromUrl(page)
}

test.describe('sales-receipt-form: form and read view', () => {
    test('a walk-in sale with no customer is saved, posted and opened from its entry', async ({
        page,
    }) => {
        await openBooks(page)
        await page.setViewportSize(DESKTOP)
        await openNewSalesReceipt(page)

        // Reference no.'s hint draws under its input, so at 1280 the input lines up with
        // the Payment method trigger in the same row (human, revise 1).
        const topOf = async (testId: string) =>
            (await page.getByTestId(testId).boundingBox())?.y ?? Number.NaN
        const referenceDrop = async () =>
            (await topOf('form-input-reference_no')) - (await topOf('form-input-payment_method'))
        await expect.poll(referenceDrop).toBe(0)

        // An exempt customer shows the hint, and its pick turns the line's taxable off.
        await pickReceiptCustomer(page, NORTHWIND)
        await expect(page.getByTestId('sales-receipt-customer-exempt')).toHaveText('Tax exempt')
        await expect(page.getByTestId('sales-receipt-edit-customer')).toBeVisible()
        await expect(page.getByTestId('sales-receipt-email')).toContainText('@')
        const rowId = await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        await expect(taxableSwitch(page, rowId)).not.toBeChecked()

        // A second product line, and the message typed right after its pick: each keeps
        // its own text through the draft save below.
        await page.getByTestId('form-table-lines-add').click()
        const secondRowId = await pickReceiptLineProduct(page, 1, TAX_PREP)
        await page.getByTestId('form-input-message').fill(WALK_IN_MESSAGE)

        // Tax off the default rate by hand, so "No customer" has to set it back.
        await chooseReceiptSelect(page, 'tax_rate', 'None')
        await expect(page.getByTestId('sales-receipt-tax')).not.toContainText('Denver combined')

        // "No customer" clears Bill to and Email, sets the default rate, keeps the line's
        // taxable flag, and drops the customer-only parts.
        await pickNoCustomer(page)
        await expect(page.getByTestId('sales-receipt-bill-to')).toContainText('No customer')
        await expect(page.getByTestId('sales-receipt-email')).not.toContainText('@')
        await expect(page.getByTestId('sales-receipt-tax')).toContainText('Denver combined')
        await expect(taxableSwitch(page, rowId)).not.toBeChecked()
        await expect(page.getByTestId('sales-receipt-edit-customer')).toHaveCount(0)
        await expect(page.getByTestId('sales-receipt-customer-exempt')).toHaveCount(0)

        // Edit address still works with no customer.
        const street = `${Date.now()} Counter Street`
        await page.getByTestId('sales-receipt-edit-address').click()
        await page.getByTestId('form-input-bill_to-line1').fill(street)
        await chooseReceiptSelect(page, 'payment_method', 'Cash')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Receipt walk-in draft'))

        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('sales-receipt-pdf-unsaved')).toContainText(
            'Save a draft to see the PDF'
        )
        await page.keyboard.press('Alt+1')
        await page.getByTestId('sales-receipt-save-draft').click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        const id = salesReceiptIdFromUrl(page)
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('Draft sales receipt')
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await expect.poll(() => billToText(page)).toContain(street)
        await expect(page.getByTestId('form-input-message')).toHaveValue(WALK_IN_MESSAGE)
        await expect(page.getByTestId(lineCellTestId(rowId, 'description'))).toHaveValue(
            productDescription(PRODUCT_IDS.accessPoint)
        )
        await expect(page.getByTestId(lineCellTestId(secondRowId, 'description'))).toHaveValue(
            productDescription(PRODUCT_IDS.taxPrep)
        )
        await page.getByTestId('sales-receipt-more').click()
        await expect(page.getByTestId('sales-receipt-delete-draft')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('sales-receipt-delete-draft')).toHaveCount(0)

        // An unsaved edit: the PDF tab shows the saved version, fetched for this receipt.
        const memo = uniqueMemo('Receipt walk-in')
        await page.getByTestId('form-input-memo').fill(memo)
        const pdf = page.waitForResponse(r =>
            r.url().includes(`/api/books/pdf/sales_receipt/${id}`)
        )
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('sales-receipt-pdf-stale')).toHaveText(
            'Shows the last saved version'
        )
        expect((await pdf).status()).toBe(200)
        await page.keyboard.press('Alt+1')

        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        const number = await receiptNumber(page)
        await expect(page.getByTestId('sales-receipt-detail-customer')).toContainText('No customer')
        await expect(page.getByTestId('sales-receipt-detail-payment')).toHaveText(
            /^Cash · deposited to /
        )

        // The entry names no customer on any line.
        await page.getByTestId('sales-receipt-read-entry').click()
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Sales receipt')
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBeGreaterThanOrEqual(2)
        await expect.poll(async () => [...new Set(await names.allInnerTexts())]).toEqual([''])

        // Journal Entries: Type and number; the row menu has no Reverse; Open goes back
        // to the receipt.
        await openEntriesList(page)
        await searchEntries(page, memo)
        const row = page.locator(ROWS).filter({
            has: page.locator('[data-testid^="entries-cell-type-"]', {
                hasText: /^Sales receipt$/,
            }),
        })
        await expect(row).toHaveCount(1)
        const entryId = ((await row.getAttribute('data-testid')) ?? '').replace(/^entries-row-/, '')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()

        // The invoice's shared Customer field shows the exempt hint too.
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, NORTHWIND)
        await expect(page.getByTestId('invoice-customer-exempt')).toHaveText('Tax exempt')
        await page.getByTestId('invoice-cancel').click()
        await page.getByTestId('discard-confirm').click()
        await expect(page).not.toHaveURL(/\/books\/invoices\/new/)

        // Last, as it leaves the Chart of Accounts pushed over Journal Entries: the register
        // of the account the receipt was deposited to. Its entry drawer names no customer on
        // any line, offers no Reverse, and its Open goes back to the receipt.
        await openRegister(page, 'Undeposited funds')
        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('This month')
        const registerRow = page.locator('[data-testid^="register-row-"]').filter({ hasText: memo })
        await revealRegisterItem(page, registerRow)
        await registerRow.click()
        const drawer = page.getByTestId('register-entry-drawer')
        await expect(drawer).toBeVisible()
        await expect(drawer.getByTestId('register-drawer-field-type')).toContainText(
            'Sales receipt'
        )
        const drawerNames = drawer.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => drawerNames.count()).toBeGreaterThanOrEqual(2)
        await expect.poll(async () => [...new Set(await drawerNames.allInnerTexts())]).toEqual([''])
        await expect(drawer.getByText(/Reverse/)).toHaveCount(0)
        await drawer.getByTestId('register-drawer-open-entry').click()
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
    })

    test('a zero total is refused and posts once it has an amount', async ({ page }) => {
        const refusal =
            'A sales receipt with a total of zero cannot be posted. Add an amount or keep it as a draft.'
        await openBooks(page)
        await openNewSalesReceipt(page)
        const save = page.getByTestId('sales-receipt-save-draft')
        const post = page.getByTestId('sales-receipt-post')

        await page.context().setOffline(true)
        await expect.poll(() => isDisabled(save)).toBe(true)
        await expect.poll(() => isDisabled(post)).toBe(true)
        await page.context().setOffline(false)
        await expect.poll(() => isDisabled(save)).toBe(false)
        await expect.poll(() => isDisabled(post)).toBe(false)

        const rowId = await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        const rate = page.getByTestId(lineCellTestId(rowId, 'rate'))
        await rate.fill('0')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Receipt zero total'))

        // A Reference no. over 40 characters is refused under the field with the
        // receipt's own text, before anything is sent.
        const reference = page.getByTestId('form-input-reference_no')
        await reference.fill('R'.repeat(41))
        await page.getByTestId('sales-receipt-save-draft').click()
        const tooLong = page.getByText(REFERENCE_TOO_LONG, { exact: true })
        await expect(tooLong).toBeVisible()
        await expect(page.getByText('Reference no. is too long')).toHaveCount(0)
        await expect
            .poll(async () => {
                const [field, error] = [await reference.boundingBox(), await tooLong.boundingBox()]
                return field !== null && error !== null && error.y >= field.y + field.height
            })
            .toBe(true)
        await expect(page).toHaveURL(NEW_SALES_RECEIPT_URL)
        await reference.fill('R'.repeat(40))
        await expect(tooLong).toHaveCount(0)

        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-error-summary')).toContainText(refusal)
        await expect(page).toHaveURL(NEW_SALES_RECEIPT_URL)
        await expect(page.getByTestId('sales-receipt-form')).toBeVisible()
        await expect(page.getByTestId('sales-receipt-title')).toHaveText(
            /^(Draft|New) sales receipt$/
        )

        await rate.fill('25')
        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await receiptNumber(page)
        await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Posted')
    })

    // A fresh page per load: on a page that already showed the receipt, pbtsdb's grace
    // window serves the held rows with no request, so the routed failure never happens.
    // Each route goes in before openBooks: the rail opens Books at the context's last
    // Books screen, which is this draft, so the receipt loads during openBooks.
    test('a load failure shows Retry, and Retry loads the draft', async ({ context }) => {
        const memo = uniqueMemo('Receipt retry')
        const first = await context.newPage()
        await openBooks(first)
        const id = await saveReceiptDraft(first, memo)

        // The receipt's own read fails.
        const second = await context.newPage()
        await second.route('**/api/collections/books_sales_receipts/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(second)
        await searchToSalesReceipt(second, memo)
        await expect(second).toHaveURL(salesReceiptUrlOf(id))
        await expect(second.getByTestId('sales-receipt-error')).toContainText(
            'Books could not load this sales receipt.'
        )
        await expect(second.getByTestId('sales-receipt-retry')).toBeVisible()
        await expect(second.getByTestId('sales-receipt-form')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.getByTestId('sales-receipt-retry').click()
        await expect(second.getByTestId('sales-receipt-form')).toBeVisible()
        await expect(second.getByTestId('form-input-memo')).toHaveValue(memo)

        // The deposit accounts' read fails: the screen owns it, with the same Retry.
        const third = await context.newPage()
        await third.route('**/api/collections/books_accounts/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(third)
        await searchToSalesReceipt(third, memo)
        await expect(third).toHaveURL(salesReceiptUrlOf(id))
        await expect(third.getByTestId('sales-receipt-error')).toBeVisible()
        await expect(third.getByTestId('sales-receipt-form')).toHaveCount(0)
        await third.unrouteAll({ behavior: 'wait' })
        await third.getByTestId('sales-receipt-retry').click()
        await expect(third.getByTestId('sales-receipt-form')).toBeVisible()
        await expect(third.getByTestId('form-input-memo')).toHaveValue(memo)
    })

    test('a posted receipt is voided and copied from More on a phone', async ({ page }) => {
        const memo = uniqueMemo('Receipt void copy')
        const message = `Thank you ${memo}`
        await openBooks(page)
        await openNewSalesReceipt(page)
        await pickReceiptCustomer(page, HARBORVIEW)
        await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        await chooseReceiptSelect(page, 'payment_method', 'Check')
        await page.getByTestId('form-input-reference_no').fill('43567')
        await page.getByTestId('form-input-message').fill(message)
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        const id = salesReceiptIdFromUrl(page)
        const number = await receiptNumber(page)

        await page.setViewportSize(PHONE)
        await page.getByTestId('sales-receipt-read-more').click()
        await page.getByTestId('sales-receipt-read-void').click()
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(number)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Void')
        await expect(page.getByTestId('sales-receipt-voided-by')).toBeVisible()

        await page.getByTestId('sales-receipt-read-more').click()
        await expect(page.getByTestId('sales-receipt-read-void')).toHaveCount(0)
        await page.getByTestId('sales-receipt-read-copy').click()
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/new\\?copy=${id}$`))
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('New sales receipt')
        await expect(page.getByTestId('form-input-customer')).toContainText(HARBORVIEW)
        const rowId = await receiptLineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await expect(page.getByTestId('form-input-message')).toHaveValue(message)
        await expect(page.getByTestId('form-input-payment_method')).toContainText('Check')
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue('')
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))

        // The phone action bar: Cancel, Save draft, Post and More; More holds Post & new
        // and Download PDF.
        for (const action of ['cancel', 'save-draft', 'post', 'more']) {
            await expect(page.getByTestId(`sales-receipt-${action}`)).toBeVisible()
        }
        await expect(page.getByTestId('sales-receipt-post-new')).toHaveCount(0)
        await page.getByTestId('sales-receipt-more').click()
        await expect(page.getByTestId('sales-receipt-post-new')).toBeVisible()
        await expect(page.getByTestId('sales-receipt-download-pdf')).toBeVisible()
    })
})
