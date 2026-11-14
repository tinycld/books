import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { createIncomeAccount, openChart } from './account-register-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    lineRowId,
    lineRows,
    localToday,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
    saveInvoiceDraft,
    uniqueMemo,
} from './invoice-helpers'
import {
    makeAccountInactiveElsewhere,
    openEntriesList,
    PHONE,
    searchEntries,
} from './journal-entries-helpers'
import { createProduct } from './products-services-helpers'

// Posting an invoice, its read view, and what it posts to the ledger (spec §3.5, §3.6, §3.9).
// Every invoice is made by driving the form with a unique memo and the default date (today,
// after the close date books-settings.spec.ts holds); invoices are found again through the
// URL a post lands on or `entries-search`. No seeded invoice, customer or product is changed.
//
// The void test runs at phone size only: there the form's Post & new and the read view's
// Void and Copy sit in More menus (Sheets), other code than the wide bars. Not driven here:
// a reader's read view (unit-tested `invoiceReadActions`), the loading state, native keys.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const VOID_BODY = 'A reversing entry is posted in the original period. The number is kept.'

// The seeded customer with Net 30 terms and Denver combined as its default tax, and two
// active seeded products ("Wireless access point" is taxable).
function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const PATCH_CABLE = productName(PRODUCT_IDS.patchCable)

function invoiceUrlOf(id: string) {
    return new RegExp(`/books/invoices/${id}$`)
}

function entryIdFromUrl(page: Page): string {
    const match = /\/books\/entries\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id) throw new Error(`Not on a journal entry: ${page.url()}`)
    return id
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The number in the read view's title, "Invoice <n>".
async function invoiceNumber(page: Page): Promise<string> {
    const title = page.getByTestId('invoice-title')
    await expect(title).toHaveText(/^Invoice \d+$/)
    const number = /^Invoice (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

// A new invoice for the seeded customer with one Wireless access point line and this memo.
async function fillNewInvoice(page: Page, memo: string) {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, seededCustomer())
    await pickLineProduct(page, 0, ACCESS_POINT)
    await page.getByTestId('form-input-memo').fill(memo)
}

test.describe('invoice-form: post and read', () => {
    test('posting shows the read view and the journal entry opens back to it', async ({ page }) => {
        const customer = seededCustomer()
        const memo = uniqueMemo('Invoice post read')
        await openBooks(page)
        const message = `Thank you ${memo}`
        await fillNewInvoice(page, memo)
        await page.getByTestId('form-input-message').fill(message)

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        const id = invoiceIdFromUrl(page)
        const number = await invoiceNumber(page)
        await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
        await expect(page.getByTestId('invoice-posted-by')).toHaveText(/^Posted by /)
        await expect(page.getByTestId('invoice-total-tax')).toContainText('Denver combined (8.71%)')
        // Revise 1 item 4: the read view names the two notes as the form does.
        const messageDetail = page.getByTestId('invoice-detail-message')
        await expect(
            messageDetail.getByText('Message to customer (printed)', { exact: true })
        ).toBeVisible()
        await expect(messageDetail.getByText(message, { exact: true })).toBeVisible()
        const memoDetail = page.getByTestId('invoice-detail-memo')
        await expect(
            memoDetail.getByText('Internal memo (not printed)', { exact: true })
        ).toBeVisible()
        await expect(memoDetail.getByText(memo, { exact: true })).toBeVisible()

        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entryId = entryIdFromUrl(page)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Invoice')
        // Spec Q21: every line of the invoice's entry names the customer.
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBeGreaterThanOrEqual(2)
        await expect.poll(async () => [...new Set(await names.allInnerTexts())]).toEqual([customer])

        const editUrl = new RegExp(`/books/invoices/new\\?replaces=${id}$`)
        await page.getByTestId('entry-edit').click()
        await expect(page).toHaveURL(editUrl)
        await expect(page.getByTestId('invoice-title')).toHaveText(`Edit ${number}`)
        await page.getByTestId('invoice-cancel').click()
        await expect(page).not.toHaveURL(editUrl)

        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Invoice')
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(invoiceUrlOf(id))
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    })

    // The server writes a percent line's amount one time, after the last line of the
    // save's batch (server/sales_document_deferral.go), so the batch's own answer for that
    // line carries 0. The read view must show the stored amount.
    test('the read view shows the amount of a percent line after the post', async ({ page }) => {
        const accessPoint = PRODUCTS.find(p => p.id === PRODUCT_IDS.accessPoint)
        if (!accessPoint) throw new Error('no access point in the fixture')
        const surcharge = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(Math.round(accessPoint.price / 10) / 100)
        await openBooks(page)
        await fillNewInvoice(page, uniqueMemo('Invoice percent read'))
        const item = await lineRowId(page, 0)
        await page.getByTestId(`form-table-lines-menu-${item}`).focus()
        await page.getByTestId('form-table-lines-add-more').click()
        await page.getByTestId('form-table-lines-add-percent').click()
        await expect(lineRows(page)).toHaveCount(2)
        const percent = await lineRowId(page, 1)
        await pickLineProduct(page, 1, 'Discount')
        await page.getByTestId(lineCellTestId(percent, 'percent')).fill('10')
        await expect(page.getByTestId(lineCellTestId(percent, 'amount'))).toContainText(surcharge)

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
        await expect(page.getByTestId(`invoice-line-${percent}`)).toContainText(surcharge)
    })

    test('a posted invoice is voided and copied from More', async ({ page }) => {
        const customer = seededCustomer()
        await openBooks(page)
        const id = await saveInvoiceDraft(page, {
            customer,
            product: ACCESS_POINT,
            memo: uniqueMemo('Invoice void copy'),
        })
        await page.setViewportSize(PHONE)

        // Phone: Post & new and Delete draft sit in the form's More menu.
        await page.getByTestId('invoice-more').click()
        await expect(page.getByTestId('invoice-post-new')).toBeVisible()
        await expect(page.getByTestId('invoice-delete-draft')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('invoice-post-new')).toHaveCount(0)

        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page).toHaveURL(invoiceUrlOf(id))
        const number = await invoiceNumber(page)

        await page.getByTestId('invoice-read-more').click()
        await page.getByTestId('invoice-read-void').click()
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Void invoice ${number}?`)
        await expect(dialog).toContainText(VOID_BODY)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')
        await expect(page.getByTestId('invoice-voided-by')).toBeVisible()

        await page.getByTestId('invoice-read-more').click()
        await expect(page.getByTestId('invoice-read-copy')).toBeVisible()
        await expect(page.getByTestId('invoice-read-void')).toHaveCount(0)
        await expect(page.getByTestId('invoice-read-edit')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('invoice-read-copy')).toHaveCount(0)

        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?copy=${id}$`))
        await expect(page.getByTestId('invoice-title')).toHaveText('New invoice')
        await expect(page.getByTestId('form-input-customer')).toContainText(customer)
        const rowId = await lineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
    })

    test('editing a posted invoice keeps its number and voids the original', async ({ page }) => {
        const memo = uniqueMemo('Invoice correction')
        await openBooks(page)
        await fillNewInvoice(page, memo)
        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page).toHaveURL(INVOICE_URL)
        const id = invoiceIdFromUrl(page)
        const number = await invoiceNumber(page)

        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?replaces=${id}$`))
        await expect(page.getByTestId('invoice-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('invoice-replace-note')).toBeVisible()
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        const rowId = await lineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill('3')

        await page.getByTestId('invoice-post').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page).not.toHaveURL(invoiceUrlOf(id))
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${number}`)

        await openEntriesList(page)
        await searchEntries(page, memo)
        // The search keeps the rows of this memo: the original, its void reversal and the
        // correction. The original is the Void one typed "Invoice".
        const original = page
            .locator(ROWS)
            .filter({
                has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: /^Invoice$/ }),
            })
            .filter({
                has: page.locator('[data-testid^="entries-status-"]', { hasText: /^Void$/ }),
            })
        await expect(original).toHaveCount(1)
        const entryId = ((await original.getAttribute('data-testid')) ?? '').replace(
            /^entries-row-/,
            ''
        )
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(invoiceUrlOf(id))
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')
        await expect(page.getByTestId('invoice-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )
    })

    test('a refused post keeps the draft, and Post & new starts a fresh form', async ({ page }) => {
        // The server's own refusal of the post (server/sales_document_posting.go
        // msgLineIncomeAccountInactive). The test's own product posts to the test's own
        // income account, which another tab makes inactive once the line chose the product:
        // the draft and its lines are accepted (a product keeps an account that became
        // inactive), and the status write is refused.
        const account = uniqueMemo('Retired income')
        const ownProduct = uniqueMemo('Retired income product')
        const refusal = `Line 2: the income account of ${ownProduct} is inactive. Choose an active one on the product or service.`
        await openBooks(page)
        await openChart(page)
        await createIncomeAccount(page, account)
        await page.getByTestId('books-nav-lists').click()
        await createProduct(page, {
            type: 'service',
            name: ownProduct,
            price: '25.00',
            incomeAccount: account,
        })
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, seededCustomer())
        await pickLineProduct(page, 0, PATCH_CABLE)
        await page.getByTestId('form-table-lines-add').click()
        await expect(lineRows(page)).toHaveCount(2)
        const secondRow = await pickLineProduct(page, 1, ownProduct)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Invoice refused post'))
        await makeAccountInactiveElsewhere(page, account)

        const refused = page.waitForResponse(
            r =>
                r.request().method() === 'PATCH' &&
                r.url().includes('/api/collections/books_invoices/records/') &&
                r.status() === 400
        )
        await page.getByTestId('invoice-post').click()
        await refused

        const row = page
            .getByTestId('invoice-lines')
            .getByTestId(`form-table-lines-row-${secondRow}`)
        await expect(row).toContainText(refusal)
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
        await expect(page.getByTestId('invoice-form')).toBeVisible()

        // With a product whose income account is active on line 2, the post goes through.
        await pickLineProduct(page, 1, ACCESS_POINT)
        await page.getByTestId('invoice-title').click()
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/invoices\/new\?fresh=[^&]+$/)
        expect(new URL(page.url()).searchParams.has('customer')).toBe(false)
        await expect(page.getByTestId('invoice-title')).toHaveText('New invoice')
        await expect(lineRows(page)).toHaveCount(1)
        const freshRow = await lineRowId(page, 0)
        const product = page.getByTestId(lineCellTestId(freshRow, 'product'))
        await expect(product).not.toContainText(PATCH_CABLE)
        await expect(product).not.toContainText(ACCESS_POINT)
        await expect(product).not.toContainText(ownProduct)
        await expect(page.getByTestId(lineCellTestId(freshRow, 'description'))).toHaveValue('')
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
    })
})
