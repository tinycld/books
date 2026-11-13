import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    ESTIMATE_URL,
    estimateIdFromUrl,
    estimateLineRowId,
    estimateLineRows,
    estimateNumberOf,
    estimateUrlOf,
    NEW_ESTIMATE_URL,
    openNewEstimate,
    pickEstimateCustomer,
    pickEstimateLineProduct,
    pickSelectByLetters,
    searchToEstimate,
} from './estimate-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import { isDisabled } from './record-form-helpers'

// The estimate form, its Save bar and its states (spec §3.2–§3.10). Every estimate is made
// by driving the form with a unique memo and reopened through search; the spec never
// edits a seeded estimate, customer or product, never asserts a fixed estimate number (the
// seed numbers through the same sequence) and never asserts an empty message (the
// default message is a shared setting).
//
// The keyboard tests press no click after the form opens: focus starts in Customer, Tab
// moves between fields, a select opens with Enter and its letter keys move through the
// options, ⌘S / ⌘↵ / ⌘⇧↵ / Esc are Save / Save & close / Save & new / Cancel, and `/`
// opens core's search palette (core binds the palette to `/`, not ⌘K).
//
// One phone test: the phone bar is other code (Cancel, Save & close and More, with Save
// and Save & new as More rows) and the band stacks the Status row under Tax. Not driven
// here: the reader's read view and the reader at new (unit-tested documentScreenState and
// quoteReadActions), loading (transient), native keys.

// Harborview: Denver combined as its default tax (CUSTOMER_TAX_PATCHES). Wireless access
// point: a taxable seeded product.
function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row?.billing_address) throw new Error('no Harborview billing address in the fixture')
    return { name: row.display_name, email: row.email, line1: row.billing_address.line1 }
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const HARBORVIEW = seededCustomer()
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const MONEY = /-?\$[\d,]+\.\d{2}/

const EXPIRATION_BEFORE_DATE = "Expiration date can't be before the estimate date"
const ACCEPTED_DATE_REQUIRED = 'Enter the accepted date'
const PDF_UNSAVED = 'Save the estimate to see its PDF'
const LOAD_FAILED = 'Books could not load this estimate.'

// A day `days` after an ISO day (before it when negative).
function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

// Core SelectInput by pointer: the menu items exist only while the menu is open.
async function chooseSelect(page: Page, key: string, label: string) {
    const trigger = page.getByTestId(`form-input-${key}`)
    await trigger.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

// Books must already be open. A new estimate for Harborview with one Wireless access point
// line and this memo, not saved.
async function fillNewEstimate(page: Page, memo: string) {
    await openNewEstimate(page)
    await pickEstimateCustomer(page, HARBORVIEW.name)
    await pickEstimateLineProduct(page, 0, ACCESS_POINT)
    await page.getByTestId('form-input-memo').fill(memo)
}

// Waits for the estimate's own update, the write of Save on a saved estimate.
function estimateUpdated(page: Page, id: string) {
    return page.waitForResponse(
        r =>
            r.request().method() === 'PATCH' &&
            new URL(r.url()).pathname === `/api/collections/books_estimates/records/${id}` &&
            r.status() === 200
    )
}

function historyLength(page: Page): Promise<number> {
    return page.evaluate(() => history.length)
}

test.describe('estimate-form: form and save', () => {
    test('an estimate is created and saved from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Estimate keyboard create')
        const acceptedBy = `Dana Whitfield ${Date.now()}`
        await openBooks(page)
        await openNewEstimate(page)
        const today = await localToday(page)
        const expiration = addDays(today, 30)

        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()

        // Type-to-open the customer picker; a pick fills Bill to and Email and moves on.
        await page.keyboard.type('Harb')
        await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
        await expect(
            page.getByRole('menuitem', { name: HARBORVIEW.name, exact: true })
        ).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(customer).toContainText(HARBORVIEW.name)
        await expect(page.getByTestId('estimate-bill-to')).toContainText(HARBORVIEW.line1)
        await expect(page.getByTestId('estimate-email')).toContainText(HARBORVIEW.email)

        // The band's links are Tab stops right after Customer (lesson 28).
        const editAddress = page.getByTestId('estimate-edit-address')
        const editCustomer = page.getByTestId('estimate-edit-customer')
        await expect(page.getByTestId('form-input-date')).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(editCustomer).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(editAddress).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(customer).toBeFocused()
        await tabTo(page, editAddress)
        await tabTo(page, editCustomer)

        const date = page.getByTestId('form-input-date')
        await tabTo(page, date)
        await expect(date).toHaveValue(today)
        await tabTo(page, page.getByTestId('form-input-date-open'))
        const expirationInput = page.getByTestId('form-input-expiration_date')
        await tabTo(page, expirationInput)
        await page.keyboard.type(expiration)
        await expect(expirationInput).toHaveValue(expiration)
        await tabTo(page, page.getByTestId('form-input-expiration_date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))
        await tabTo(page, page.getByTestId('form-input-status'))
        await pickSelectByLetters(page, 'status', 'a', 'Accepted')

        const acceptedByInput = page.getByTestId('form-input-accepted_by')
        await tabTo(page, acceptedByInput)
        await page.keyboard.type(acceptedBy)
        const acceptedDate = page.getByTestId('form-input-accepted_date')
        await tabTo(page, acceptedDate)
        await expect(acceptedDate).toHaveValue(today)
        await tabTo(page, page.getByTestId('form-input-accepted_date-open'))

        const line1 = await estimateLineRowId(page, 0)
        const cell = (column: string) => page.getByTestId(lineCellTestId(line1, column))
        await tabTo(page, cell('product'))
        await page.keyboard.type(ACCESS_POINT)
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(cell('product')).toContainText(ACCESS_POINT)
        await expect(cell('description')).toBeFocused()
        await tabTo(page, cell('quantity'))
        await page.keyboard.type('2')
        await tabTo(page, cell('rate'))
        await page.keyboard.type('50')
        await expect(cell('rate')).toHaveValue('50')

        // After Rate, as on the invoice: the line's Taxable switch, its row menu once, the
        // add-line buttons, then the notes.
        await tabTo(page, cell('taxable').getByRole('switch'))
        await tabTo(page, page.getByTestId(`form-table-lines-menu-${line1}`))
        await tabTo(page, page.getByTestId('form-table-lines-add'))
        await tabTo(page, page.getByTestId('form-table-lines-add-more'))
        await tabTo(page, page.getByTestId('form-input-message'))
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.keyboard.type(memo)
        await expect(page.getByTestId('estimate-total-tax')).toContainText('Denver combined')

        // ⌘S creates the estimate and replaces the route: no new history entry.
        const before = await historyLength(page)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(ESTIMATE_URL)
        const id = estimateIdFromUrl(page)
        const number = await estimateNumberOf(page)
        expect(await historyLength(page)).toBe(before)
        await expect(page.getByTestId('estimate-badge')).toHaveText('Accepted')
        await expect(customer).toBeFocused()

        // ⌘↵ saves and closes.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(estimateUrlOf(id))

        await searchToEstimate(page, memo)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
        await expect(page.getByTestId('estimate-title')).toHaveText(`Estimate ${number}`)
        await expect(customer).toContainText(HARBORVIEW.name)
        await expect(expirationInput).toHaveValue(expiration)
        await expect(page.getByTestId('form-input-status')).toContainText('Accepted')
        await expect(acceptedByInput).toHaveValue(acceptedBy)
        await expect(acceptedDate).toHaveValue(today)
        await expect(estimateLineRows(page)).toHaveCount(1)
        const saved = await estimateLineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(saved, 'product'))).toContainText(ACCESS_POINT)
        await expect(page.getByTestId(lineCellTestId(saved, 'quantity'))).toHaveValue('2')
        await expect(page.getByTestId(lineCellTestId(saved, 'rate'))).toHaveValue('50.00')
        const total = await moneyIn(page.getByTestId('estimate-total'))
        expect(await moneyIn(page.getByTestId('estimate-total-figure'))).toBe(total)
        await expect(page.getByTestId('estimate-form')).not.toContainText('Balance due')
    })

    test('a saved estimate is edited from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Estimate keyboard edit')
        await openBooks(page)

        // Setup through the form (clicks allowed).
        await fillNewEstimate(page, memo)
        await page.getByTestId('estimate-save-close').click()
        await expect(page).not.toHaveURL(NEW_ESTIMATE_URL)

        // From here on, keys only.
        await searchToEstimate(page, memo)
        const id = estimateIdFromUrl(page)
        const number = await estimateNumberOf(page)
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()
        const date = await page.getByTestId('form-input-date').inputValue()
        const dayBefore = addDays(date, -1)
        const dayAfter = addDays(date, 10)

        await tabTo(page, page.getByTestId('estimate-edit-address'))
        await tabTo(page, page.getByTestId('estimate-edit-customer'))
        await tabTo(page, page.getByTestId('form-input-date'))
        await tabTo(page, page.getByTestId('form-input-date-open'))
        const expiration = page.getByTestId('form-input-expiration_date')
        await tabTo(page, expiration)
        await page.keyboard.type(dayBefore)
        await expect(expiration).toHaveValue(dayBefore)

        // The client refuses it under Expiration date; nothing is saved.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('form-field-expiration_date-error')).toHaveText(
            EXPIRATION_BEFORE_DATE
        )
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-title')).toHaveText(`Estimate ${number}`)

        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        await expect(expiration).toBeFocused()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(dayAfter)
        await expect(expiration).toHaveValue(dayAfter)
        await tabTo(page, page.getByTestId('form-input-expiration_date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))
        await tabTo(page, page.getByTestId('form-input-status'))
        await pickSelectByLetters(page, 'status', 'r', 'Rejected')
        await expect(page.getByTestId('estimate-accepted-by')).toHaveCount(0)
        await expect(page.getByTestId('estimate-accepted-date')).toHaveCount(0)

        const line1 = await estimateLineRowId(page, 0)
        const cell = (rowId: string, column: string) =>
            page.getByTestId(lineCellTestId(rowId, column))
        await tabTo(page, cell(line1, 'product'))
        await tabTo(page, cell(line1, 'description'))
        await tabTo(page, cell(line1, 'quantity'))
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('3')
        await expect(cell(line1, 'quantity')).toHaveValue('3')
        await tabTo(page, cell(line1, 'rate'))

        // Enter in Rate adds a line, as on the invoice; its picker opens and closes from the keys.
        await page.keyboard.press('Enter')
        await expect(estimateLineRows(page)).toHaveCount(2)
        const line2 = await estimateLineRowId(page, 1)
        await expect(cell(line2, 'product')).toBeFocused()
        const search = page.getByTestId(`${lineCellTestId(line2, 'product')}-search`)
        await page.keyboard.press('ArrowDown')
        await expect(search).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search).toHaveCount(0)
        await expect(cell(line2, 'product')).toBeFocused()

        // ⌘⇧↵ saves and opens a blank estimate with Customer focused.
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)
        await expect(page.getByTestId('estimate-title')).toHaveText('New estimate')
        await expect(customer).toBeFocused()
        await expect(customer).not.toContainText(HARBORVIEW.name)

        // Esc leaves the clean form; search reopens the edited estimate.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_ESTIMATE_URL)
        await searchToEstimate(page, memo)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('form-input-status')).toContainText('Rejected')
        await expect(expiration).toHaveValue(dayAfter)
        await expect(page.getByTestId('estimate-accepted-by')).toHaveCount(0)
        // The empty trailing line was dropped at the save.
        await expect(estimateLineRows(page)).toHaveCount(1)
        await expect(cell(line1, 'quantity')).toHaveValue('3')

        // Esc on the clean form is Cancel: it leaves the estimate.
        await expect(customer).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(estimateUrlOf(id))
    })

    test('status and acceptance save, Expired shows from the saved row, and the PDF opens', async ({
        page,
    }) => {
        const memo = uniqueMemo('Estimate status')
        await openBooks(page)
        await fillNewEstimate(page, memo)
        const today = await localToday(page)
        const yesterday = addDays(today, -1)
        const estimateDate = addDays(today, -7)
        const firstAccepted = addDays(today, -3)

        // On a desktop width the band's second row holds Status, not Customer.
        const secondRow = page.getByTestId('estimate-payment')
        await expect(secondRow.getByTestId('estimate-status')).toBeVisible()
        await expect(secondRow.getByTestId('form-input-customer')).toHaveCount(0)

        // Accepted shows Accepted by and Accepted date (today) in that row.
        await chooseSelect(page, 'status', 'Accepted')
        await expect(secondRow.getByTestId('estimate-accepted-by')).toBeVisible()
        await expect(secondRow.getByTestId('estimate-accepted-date')).toBeVisible()
        const acceptedBy = page.getByTestId('form-input-accepted_by')
        const acceptedDate = page.getByTestId('form-input-accepted_date')
        await expect(acceptedDate).toHaveValue(today)

        await acceptedDate.fill('')
        await page.getByTestId('estimate-save').click()
        await expect(page.getByTestId('form-field-accepted_date-error')).toHaveText(
            ACCEPTED_DATE_REQUIRED
        )
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)

        // Dated a week ago and expired yesterday: Expired on the saved estimate.
        await page.getByTestId('form-input-date').fill(estimateDate)
        await acceptedBy.fill('Dana Whitfield')
        await acceptedDate.fill(firstAccepted)
        await page.getByTestId('form-input-expiration_date').fill(yesterday)
        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        const id = estimateIdFromUrl(page)
        const number = await estimateNumberOf(page)
        const badge = page.getByTestId('estimate-badge')
        const expiredBadge = page.getByTestId('estimate-expired-badge')
        await expect(badge).toHaveText('Accepted')
        await expect(expiredBadge).toHaveText('Expired')
        await expect(page.getByTestId('estimate-expired-hint')).toHaveText(
            `Expired on ${formatDay(yesterday)}`
        )

        // Expired changes nothing the estimate can do.
        const line1 = await estimateLineRowId(page, 0)
        await expect(page.getByTestId('form-input-status')).toBeEnabled()
        await expect(page.getByTestId('form-input-memo')).toBeEnabled()
        await expect(page.getByTestId(lineCellTestId(line1, 'quantity'))).toBeEnabled()
        await page.getByTestId('form-input-memo').fill(`${memo} edited`)
        const memoSaved = estimateUpdated(page, id)
        await page.getByTestId('estimate-save').click()
        await memoSaved

        // The badges follow the saved row, not the unsaved Status.
        await chooseSelect(page, 'status', 'Rejected')
        await expect(badge).toHaveText('Accepted')
        await expect(expiredBadge).toHaveText('Expired')
        await page.getByTestId('estimate-save').click()
        await expect(badge).toHaveText('Rejected')
        await expect(expiredBadge).toHaveCount(0)

        // Pending saved clears the acceptance; Accepted again starts it empty, dated today.
        await chooseSelect(page, 'status', 'Pending')
        await page.getByTestId('estimate-save').click()
        await expect(badge).toHaveText('Pending')
        await chooseSelect(page, 'status', 'Accepted')
        await expect(acceptedBy).toHaveValue('')
        await expect(acceptedDate).toHaveValue(today)

        // On the saved estimate too, Accepted needs its date: the form refuses the save
        // inline and sends no update.
        let patches = 0
        const countPatch = (request: Request) => {
            if (
                request.method() === 'PATCH' &&
                new URL(request.url()).pathname === `/api/collections/books_estimates/records/${id}`
            ) {
                patches += 1
            }
        }
        page.on('request', countPatch)
        await acceptedDate.fill('')
        await page.getByTestId('estimate-save').click()
        await expect(page.getByTestId('form-field-accepted_date-error')).toHaveText(
            ACCEPTED_DATE_REQUIRED
        )
        expect(patches).toBe(0)
        page.off('request', countPatch)
        await acceptedDate.fill(today)
        const acceptedSaved = estimateUpdated(page, id)
        await page.getByTestId('estimate-save').click()
        await acceptedSaved
        await expect(badge).toHaveText('Accepted')

        // ⌥2 shows the saved estimate's PDF; ⌥1 goes back; ⌘P downloads it.
        const pdfServed = page.waitForResponse(
            r => new URL(r.url()).pathname === `/api/books/pdf/estimate/${id}`
        )
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('estimate-tab-pdf')).toHaveAttribute('aria-selected', 'true')
        expect((await pdfServed).status()).toBe(200)
        await expect(page.getByTestId('estimate-pdf')).toBeVisible()
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('estimate-tab-edit')).toHaveAttribute('aria-selected', 'true')
        const download = page.waitForEvent('download')
        await page.keyboard.press('ControlOrMeta+p')
        expect((await download).suggestedFilename()).toBe(`estimate-${number}.pdf`)
    })

    // A fresh page per load: on a page that already showed the estimate, pbtsdb's grace
    // window serves the held rows with no request, so the routed failure never happens.
    // Each route goes in before openBooks.
    test('offline, refusals and load errors leave the form recoverable', async ({ context }) => {
        const memo = uniqueMemo('Estimate refusals')
        const page = await context.newPage()
        await openBooks(page)
        await openNewEstimate(page)

        // The bar's write buttons idle while writes are unavailable.
        const writes = ['estimate-save', 'estimate-save-close', 'estimate-save-new'].map(id =>
            page.getByTestId(id)
        )
        await page.context().setOffline(true)
        for (const button of writes) await expect.poll(() => isDisabled(button)).toBe(true)
        await page.context().setOffline(false)
        for (const button of writes) await expect.poll(() => isDisabled(button)).toBe(false)

        // The PDF tab of an unsaved estimate asks for a save.
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('estimate-pdf-unsaved')).toContainText(PDF_UNSAVED)
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('estimate-tab-edit')).toHaveAttribute('aria-selected', 'true')

        await pickEstimateCustomer(page, HARBORVIEW.name)
        await pickEstimateLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(memo)

        // A field refusal lands under its field.
        const customerRefusal = `${HARBORVIEW.name} is inactive. Choose an active customer.`
        await page.route('**/api/collections/books_estimates/records*', route =>
            route.request().method() === 'POST'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({
                          message: customerRefusal,
                          data: {
                              customer: { code: 'validation_books', message: customerRefusal },
                          },
                      }),
                  })
                : route.fallback()
        )
        await page.getByTestId('estimate-save').click()
        await expect(page.getByTestId('form-field-customer-error')).toHaveText(customerRefusal)
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)
        await page.unrouteAll({ behavior: 'wait' })

        // A line refusal names its line.
        const lineRefusal = `Line 1: ${ACCESS_POINT} is inactive. Choose an active product or service.`
        await page.route('**/api/collections/books_estimate_lines/records*', route =>
            route.request().method() === 'POST'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ message: lineRefusal, data: {} }),
                  })
                : route.fallback()
        )
        await page.getByTestId('estimate-save').click()
        // The refusal lands under its own line, as the invoice's does: the row shows the
        // server's text once, with no second "Line 1:" label in front of it.
        const refusedRowId = await estimateLineRowId(page, 0)
        const refusedRow = page
            .getByTestId('estimate-lines')
            .getByTestId(`form-table-lines-row-${refusedRowId}`)
        await expect(refusedRow.getByText(lineRefusal, { exact: true })).toHaveCount(1)
        await expect(refusedRow).not.toContainText('Line 1: Line 1:')
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)
        await page.unrouteAll({ behavior: 'wait' })

        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        const id = estimateIdFromUrl(page)
        await estimateNumberOf(page)

        // The estimate's own read fails: Retry loads it.
        const second = await context.newPage()
        await second.route('**/api/collections/books_estimates/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(second)
        await searchToEstimate(second, memo)
        await expect(second).toHaveURL(estimateUrlOf(id))
        await expect(second.getByTestId('estimate-error')).toContainText(LOAD_FAILED)
        await expect(second.getByTestId('estimate-retry')).toBeVisible()
        await expect(second.getByTestId('estimate-form')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.getByTestId('estimate-retry').click()
        await expect(second.getByTestId('estimate-form')).toBeVisible()
        await expect(second.getByTestId('form-input-memo')).toHaveValue(memo)

        // Its lines' read fails: the same Retry loads them.
        const third = await context.newPage()
        await third.route('**/api/collections/books_estimate_lines/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(third)
        await searchToEstimate(third, memo)
        await expect(third).toHaveURL(estimateUrlOf(id))
        await expect(third.getByTestId('estimate-error')).toBeVisible()
        await expect(third.getByTestId('estimate-form')).toHaveCount(0)
        await third.unrouteAll({ behavior: 'wait' })
        await third.getByTestId('estimate-retry').click()
        await expect(third.getByTestId('estimate-form')).toBeVisible()
        await expect(estimateLineRows(third)).toHaveCount(1)
        const rowId = await estimateLineRowId(third, 0)
        await expect(third.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(
            ACCESS_POINT
        )
    })

    test('the phone bar keeps one row and More saves and starts a new estimate', async ({
        page,
    }) => {
        const memo = uniqueMemo('Estimate phone')
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewEstimate(page)

        // Cancel, Save & close and More, on one row; Save and Save & new are More rows.
        const bar = page.getByTestId('estimate-actions')
        const buttons = ['estimate-cancel', 'estimate-save-close', 'estimate-more'].map(id =>
            bar.getByTestId(id)
        )
        for (const button of buttons) await expect(button).toBeVisible()
        await expect(page.getByTestId('estimate-save')).toHaveCount(0)
        await expect(page.getByTestId('estimate-save-new')).toHaveCount(0)
        await expect
            .poll(async () => {
                const tops = await Promise.all(
                    buttons.map(async b => (await b.boundingBox())?.y ?? Number.NaN)
                )
                return Math.max(...tops) - Math.min(...tops)
            })
            .toBeLessThanOrEqual(2)
        await expect.poll(async () => (await bar.boundingBox())?.height ?? 999).toBeLessThan(80)

        await pickEstimateCustomer(page, HARBORVIEW.name)
        await pickEstimateLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(memo)

        await page.getByTestId('estimate-more').click()
        await expect(page.getByTestId('estimate-download-pdf')).toBeVisible()
        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        await estimateNumberOf(page)

        // The band stacks its second row (Status) under Tax.
        await expect
            .poll(async () => {
                const tax = await page.getByTestId('form-input-tax_rate').boundingBox()
                const row = await page.getByTestId('estimate-payment').boundingBox()
                if (!tax || !row) return Number.NaN
                return row.y - (tax.y + tax.height)
            })
            .toBeGreaterThan(0)

        await page.getByTestId('estimate-more').click()
        await page.getByTestId('estimate-save-new').click()
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)
        await expect(page.getByTestId('estimate-title')).toHaveText('New estimate')
    })
})
