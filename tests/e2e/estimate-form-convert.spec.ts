import { expect, type Page, type Request, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    convertEstimate,
    ESTIMATE_URL,
    estimateIdFromUrl,
    estimateIdOfInvoiceUrl,
    estimateLineRowId,
    estimateLineRows,
    estimateNumberOf,
    estimateUrlOf,
    INVOICE_FROM_ESTIMATE_URL,
    NEW_ESTIMATE_URL,
    openEstimateBySearch,
    openInvoiceFromEstimateLink,
    openNewEstimate,
    pickEstimateCustomer,
    pickEstimateLineProduct,
} from './estimate-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    lineRowId,
    lineRows,
    localToday,
    uniqueMemo,
} from './invoice-helpers'

// Convert to invoice, Delete estimate and undoing a conversion (spec §3.6–§3.8). Every
// estimate is made by driving the form with a unique memo and reopened through search;
// the spec never converts, edits or deletes a seeded estimate, invoice, customer or
// product, and reads every number from a title (the seed numbers through the same
// sequences). An invoice a spec posts keeps today's date.
//
// One phone test: Convert to invoice and Delete estimate are rows of the phone bar's More
// menu (other code than the wide bar's buttons), and the invoice's band stacks the
// read-only Customer and its "From estimate" link. Not driven here: the reader's read view
// (unit-tested quoteReadActions and documentScreenState), native keys.

// Harborview: a seeded active customer. Wireless access point: a seeded active product.
function seededCustomerName() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const HARBORVIEW = seededCustomerName()
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)

// A day `days` after an ISO day (before it when negative).
function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

function invoiceUrlOf(id: string) {
    return new RegExp(`/books/invoices/${id}$`)
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The number in a posted invoice's title, "Invoice <n>".
async function invoiceNumberOf(page: Page): Promise<string> {
    const title = page.getByTestId('invoice-title')
    await expect(title).toHaveText(/^Invoice \d+$/)
    const number = /^Invoice (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the invoice title has no number')
    return number
}

// Core SelectInput by pointer: the menu items exist only while the menu is open. The
// trigger is the visible one: a lower screen of the same record may stay mounted, hidden.
async function chooseSelect(page: Page, key: string, label: string) {
    const trigger = page.getByTestId(`form-input-${key}`).filter({ visible: true })
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
    await pickEstimateCustomer(page, HARBORVIEW)
    await pickEstimateLineProduct(page, 0, ACCESS_POINT)
    await page.getByTestId('form-input-memo').fill(memo)
}

async function saveNewEstimate(page: Page) {
    await page.getByTestId('estimate-save').click()
    await expect(page).toHaveURL(ESTIMATE_URL)
    return { id: estimateIdFromUrl(page), number: await estimateNumberOf(page) }
}

// A server refusal under Customer for the estimate's create; every other request goes on.
function refuseEstimateCreate(message: string) {
    return (route: Route) =>
        route.request().method() === 'POST'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({
                      message,
                      data: { customer: { code: 'validation_books', message } },
                  }),
              })
            : route.continue()
}

test.describe('estimate-form: convert and delete', () => {
    test('convert and undo by delete', async ({ page }) => {
        const memo = uniqueMemo('Estimate convert')
        const message = `Thank you for the walk-through ${Date.now()}`
        const note = 'Cabling runs to the annex office'
        await openBooks(page)
        await openNewEstimate(page)
        const today = await localToday(page)
        const yesterday = addDays(today, -1)

        await pickEstimateCustomer(page, HARBORVIEW)
        const line1 = await pickEstimateLineProduct(page, 0, ACCESS_POINT)
        // ⌥T on the item line: a Description line right after it.
        await page.getByTestId(lineCellTestId(line1, 'description')).focus()
        await page.keyboard.press('Alt+t')
        await expect(estimateLineRows(page)).toHaveCount(2)
        const line2 = await estimateLineRowId(page, 1)
        await page.getByTestId(lineCellTestId(line2, 'description')).fill(note)
        await page.getByTestId('form-input-message').fill(message)
        // Dated a week ago and expired yesterday: Expired does not block Convert.
        await page.getByTestId('form-input-date').fill(addDays(today, -7))
        await page.getByTestId('form-input-expiration_date').fill(yesterday)
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(memo)

        // A refused save stays on the form and does not convert.
        const refusal = `${HARBORVIEW} is inactive. Choose an active customer.`
        await page.route(
            '**/api/collections/books_estimates/records*',
            refuseEstimateCreate(refusal)
        )
        await expect(memoInput).toBeFocused()
        await page.keyboard.press('Alt+i')
        await expect(page.getByTestId('form-field-customer-error')).toHaveText(refusal)
        await expect(page).toHaveURL(NEW_ESTIMATE_URL)
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })

        // ⌥I with unsaved changes saves the estimate first, then opens the invoice form.
        await memoInput.focus()
        await expect(memoInput).toBeFocused()
        await page.keyboard.press('Alt+i')
        await expect(page).toHaveURL(INVOICE_FROM_ESTIMATE_URL)
        const id = estimateIdOfInvoiceUrl(page)
        // The saved estimate stays mounted under the pushed invoice (Books stack), so the
        // shared field ids are read inside the invoice form.
        const invoiceForm = page.getByTestId('invoice-form')
        await expect(invoiceForm).toBeVisible()

        // Customer is read-only text, not a Tab stop: the first focus is the invoice date.
        const date = invoiceForm.getByTestId('form-input-date')
        await expect(date).toHaveValue(today)
        await expect(date).toBeFocused()

        await expect(page.getByTestId('invoice-customer-read-only')).toContainText(HARBORVIEW)
        const link = page.getByTestId('invoice-from-estimate')
        await expect(link).toHaveText(/^From estimate \d+$/)
        const number = /^From estimate (\d+)$/.exec(await link.innerText())?.[1]
        await expect(lineRows(page)).toHaveCount(2)
        const invoiceLine1 = await lineRowId(page, 0)
        const invoiceLine2 = await lineRowId(page, 1)
        await expect(
            invoiceForm.getByTestId(lineCellTestId(invoiceLine1, 'product'))
        ).toContainText(ACCESS_POINT)
        await expect(
            invoiceForm.getByTestId(lineCellTestId(invoiceLine2, 'description'))
        ).toHaveValue(note)
        await expect(invoiceForm.getByTestId(lineCellTestId(invoiceLine2, 'product'))).toHaveCount(
            0
        )
        await expect(invoiceForm.getByTestId('form-input-message')).toHaveValue(message)
        await expect(invoiceForm.getByTestId('form-input-memo')).toHaveValue('')

        // The link is the Tab stop right after the read-only Customer (lesson 28): Tab from
        // it goes to the band's next control, the first Bill to link, and Shift+Tab back.
        const editAddress = invoiceForm.getByTestId('invoice-edit-address')
        await link.focus()
        await expect(link).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(editAddress).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(link).toBeFocused()

        // Convert replaced the new route with the saved estimate's before it pushed the
        // invoice form, so Back is the saved estimate.
        await page.goBack()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
        await expect(page.getByTestId('estimate-title')).toHaveText(`Estimate ${number}`)
        await page.goForward()
        await expect(page).toHaveURL(INVOICE_FROM_ESTIMATE_URL)
        await expect(page.getByTestId('invoice-form')).toBeVisible()

        // The invoice's first save closes the estimate.
        await page.getByTestId('invoice-save-draft').click()
        await expect(page).toHaveURL(INVOICE_URL)
        const invoiceId = invoiceIdFromUrl(page)
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')

        await openInvoiceFromEstimateLink(page)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-read-only')).toBeVisible()
        await expect(page.getByTestId('estimate-badge')).toHaveText('Closed')
        await expect(page.getByTestId('estimate-converted-to')).toHaveText(
            'Converted to a draft invoice'
        )
        await expect(page.getByTestId('estimate-detail-expiration')).toContainText(
            formatDay(yesterday)
        )
        await expect(page.getByTestId('estimate-detail-status')).toContainText('Closed')

        // I opens the invoice; deleting its draft reopens the estimate as Pending.
        await page.keyboard.press('i')
        await expect(page).toHaveURL(invoiceUrlOf(invoiceId))
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await page.getByTestId('invoice-more').click()
        await page.getByTestId('invoice-delete-draft').click()
        await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(invoiceUrlOf(invoiceId))

        await openEstimateBySearch(page, memo)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
        await expect(page.getByTestId('estimate-badge')).toHaveText('Pending')
        await expect(page.getByTestId('estimate-converted-to')).toHaveCount(0)
    })

    test('accepted, posted, voided, delete refused', async ({ page }) => {
        const memo = uniqueMemo('Estimate post void')
        const acceptedBy = `Dana Whitfield ${Date.now()}`
        await openBooks(page)
        await fillNewEstimate(page, memo)
        const today = await localToday(page)
        await chooseSelect(page, 'status', 'Accepted')
        await page.getByTestId('form-input-accepted_by').fill(acceptedBy)
        const { id, number } = await saveNewEstimate(page)
        await expect(page.getByTestId('estimate-badge')).toHaveText('Accepted')

        await convertEstimate(page)
        expect(estimateIdOfInvoiceUrl(page)).toBe(id)
        await expect(page.getByTestId('invoice-form')).toBeVisible()

        // After a reload nothing is below the invoice form; Cancel still returns to the
        // estimate it was made from (lesson 15: replace when the target is not below).
        await page.reload()
        await expect(page).toHaveURL(INVOICE_FROM_ESTIMATE_URL)
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await page.getByTestId('invoice-cancel').click()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
        await expect(page.getByTestId('estimate-badge')).toHaveText('Accepted')

        await convertEstimate(page)
        await expect(page.getByTestId('invoice-form')).toBeVisible()

        // A refused Post after the draft header was written (the server closed the
        // estimate on that write) keeps the invoice form with the refusal, not the
        // "cannot be converted" notice.
        const closedBooks = 'The books are closed through Jun 30, 2026.'
        await page.route('**/api/collections/books_invoices/records/*', route =>
            route.request().method() === 'PATCH'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ message: closedBooks, data: {} }),
                  })
                : route.continue()
        )
        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('invoice-error-summary')).toContainText(closedBooks)
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await expect(page.getByTestId('invoice-cannot-convert')).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })

        // That write made a draft that names the estimate. Cancel goes back to the closed
        // estimate; a later mount of the same `?estimate` route did not write the draft, so
        // it cannot convert the estimate again.
        await page.getByTestId('invoice-cancel').click()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-read-only').filter({ visible: true })).toBeVisible()
        const draftLink = page.getByTestId('estimate-converted-to').filter({ visible: true })
        await expect(draftLink).toHaveText('Converted to a draft invoice')
        await page.goForward()
        await expect(page).toHaveURL(INVOICE_FROM_ESTIMATE_URL)
        await expect(page.getByTestId('invoice-cannot-convert')).toContainText(
            'This estimate cannot be converted to an invoice'
        )
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)

        // Post the draft from the estimate's "Converted to a draft invoice" link.
        await page.goBack()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await draftLink.click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-form').filter({ visible: true })).toBeVisible()
        await page.getByTestId('invoice-post').filter({ visible: true }).click()
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page).toHaveURL(INVOICE_URL)
        const invoiceId = invoiceIdFromUrl(page)
        const invoiceNumber = await invoiceNumberOf(page)

        // The posted invoice names its estimate under the Posted-by stamp.
        const link = page.getByTestId('invoice-from-estimate')
        await expect(link).toHaveText(`From estimate ${number}`)
        await expect
            .poll(async () => {
                const stamp = await page.getByTestId('invoice-posted-by').boundingBox()
                const box = await link.boundingBox()
                if (!stamp || !box) return Number.NaN
                return box.y - (stamp.y + stamp.height)
            })
            .toBeGreaterThanOrEqual(0)

        await openInvoiceFromEstimateLink(page)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-read-only')).toBeVisible()
        await expect(page.getByTestId('estimate-converted-to')).toHaveText(
            `Converted to invoice ${invoiceNumber}`
        )
        await expect(page.getByTestId('estimate-converted-to')).toHaveRole('link')
        await expect(page.getByTestId('estimate-detail-accepted-by')).toContainText(acceptedBy)
        await expect(page.getByTestId('estimate-detail-accepted-date')).toContainText(
            formatDay(today)
        )
        await expect(page.getByTestId('estimate-read-invoice')).toBeVisible()

        // C copies the closed estimate into a new Pending one.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/estimates/new\\?copy=${id}$`))
        await expect(page.getByTestId('estimate-title')).toHaveText('New estimate')
        await expect(page.getByTestId('form-input-customer')).toContainText(HARBORVIEW)
        const copied = await estimateLineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(copied, 'product'))).toContainText(
            ACCESS_POINT
        )
        await expect(page.getByTestId('form-input-status')).toContainText('Pending')
        await expect(page.getByTestId('estimate-accepted-by')).toHaveCount(0)
        await expect(page.getByTestId('estimate-accepted-date')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_ESTIMATE_URL)

        // ⌘P downloads the closed estimate's PDF from its read view.
        await openEstimateBySearch(page, memo)
        await expect(page.getByTestId('estimate-read-only')).toBeVisible()
        const download = page.waitForEvent('download')
        await page.keyboard.press('ControlOrMeta+p')
        expect((await download).suggestedFilename()).toBe(`estimate-${number}.pdf`)

        // The "Converted to invoice" line is a link to the invoice's read view.
        const convertedTo = page.getByTestId('estimate-converted-to').filter({ visible: true })
        await expect(convertedTo).toHaveRole('link')
        await convertedTo.click()
        await expect(page).toHaveURL(invoiceUrlOf(invoiceId))

        // Voiding the invoice reopens the estimate as Accepted, Accepted by kept.
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        // The wide read bar has a Void button; only a phone's bar puts Void in More.
        await page.getByTestId('invoice-read-void').click()
        await expect(page.getByTestId('void-dialog')).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')

        // The void invoice still names its estimate. The estimate is reopened by search; a
        // lower screen of the same estimate may stay mounted, hidden, in the Books stack, so
        // the form locators below are scoped to the visible (top) screen.
        await expect(page.getByTestId('invoice-from-estimate')).toHaveText(
            `From estimate ${number}`
        )
        await openEstimateBySearch(page, memo)
        await expect(page).toHaveURL(estimateUrlOf(id))
        const form = page.getByTestId('estimate-form').filter({ visible: true })
        await expect(form).toBeVisible()
        await expect(form.getByTestId('estimate-badge')).toHaveText('Accepted')
        await expect(form.getByTestId('form-input-accepted_by')).toHaveValue(acceptedBy)

        // Rejected is not converted; Delete is refused while the void invoice names it.
        await chooseSelect(page, 'status', 'Rejected')
        await form.getByTestId('estimate-save').click()
        await expect(form.getByTestId('estimate-badge')).toHaveText('Rejected')
        await expect(form.getByTestId('estimate-convert')).toHaveCount(0)
        await form.getByTestId('estimate-delete').click()
        const dialog = page.getByTestId('estimate-delete-dialog')
        await expect(dialog).toContainText(`Delete estimate ${number}?`)
        await expect(dialog).toContainText("This can't be undone.")
        await page.getByTestId('estimate-delete-confirm').click()
        await expect(page.getByTestId('estimate-delete-refusal')).toHaveText(
            `Estimate ${number} has invoice ${invoiceNumber}. Set it to Rejected instead.`
        )
        await expect(dialog).toBeVisible()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(form.getByTestId('estimate-title')).toHaveText(`Estimate ${number}`)
    })

    test('delete and the number gap', async ({ page }) => {
        const memo = uniqueMemo('Estimate delete')
        await openBooks(page)
        await fillNewEstimate(page, memo)
        const { id, number } = await saveNewEstimate(page)
        const dialog = page.getByTestId('estimate-delete-dialog')

        // ⌘⌫ opens the confirm; Escape closes it and deletes nothing.
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Delete estimate ${number}?`)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-title')).toHaveText(`Estimate ${number}`)

        // ⌘⌫ again and the dialog's ⌘↵ (DIALOG_SUBMIT_SHORTCUT) delete it.
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(dialog).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toHaveCount(0)

        // Numbers are never reused. Other specs may take numbers in between.
        await fillNewEstimate(page, uniqueMemo('Estimate after delete'))
        const next = await saveNewEstimate(page)
        expect(Number(next.number)).toBeGreaterThan(Number(number))
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(estimateUrlOf(next.id))

        // Search no longer finds the deleted estimate.
        await page.keyboard.press('/')
        const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
        await expect(input).toBeFocused()
        const searched = page.waitForResponse(
            r =>
                r.url().includes('/api/search') &&
                r.status() === 200 &&
                new URL(r.url()).searchParams.get('q') === memo
        )
        await page.keyboard.type(memo)
        await searched
        await expect(page.getByRole('option').filter({ hasText: /^Estimate \d+ · / })).toHaveCount(
            0
        )
    })

    test('convert on a phone', async ({ page }) => {
        const memo = uniqueMemo('Estimate phone convert')
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await fillNewEstimate(page, memo)
        await page.getByTestId('estimate-more').click()
        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        const id = estimateIdFromUrl(page)
        const number = await estimateNumberOf(page)

        // The saved estimate's bar keeps three buttons on one row; Convert and Delete are
        // More rows.
        const bar = page.getByTestId('estimate-actions')
        const buttons = ['estimate-cancel', 'estimate-save-close', 'estimate-more'].map(testId =>
            bar.getByTestId(testId)
        )
        for (const button of buttons) await expect(button).toBeVisible()
        await expect(page.getByTestId('estimate-convert')).toHaveCount(0)
        await expect(page.getByTestId('estimate-delete')).toHaveCount(0)
        await expect
            .poll(async () => {
                const tops = await Promise.all(
                    buttons.map(async b => (await b.boundingBox())?.y ?? Number.NaN)
                )
                return Math.max(...tops) - Math.min(...tops)
            })
            .toBeLessThanOrEqual(2)

        // The saved estimate has no changes, so Convert writes nothing; the invoice's read
        // of its estimate's lines fails and offers Retry. The estimate row itself is already
        // in the store (the estimate screen below holds it), so only the lines read fetches.
        let estimateWrites = 0
        const countWrite = (request: Request) => {
            if (
                request.method() !== 'GET' &&
                new URL(request.url()).pathname.startsWith('/api/collections/books_estimate')
            ) {
                estimateWrites += 1
            }
        }
        page.on('request', countWrite)
        await page.route('**/api/collections/books_estimate_lines/records*', route =>
            route.request().method() === 'GET' ? route.fulfill({ status: 400 }) : route.continue()
        )
        expect(await convertEstimate(page)).toBe(id)
        await expect(page.getByTestId('invoice-error')).toBeVisible()
        await expect(page.getByTestId('invoice-retry')).toBeVisible()
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)
        expect(estimateWrites).toBe(0)
        page.off('request', countWrite)
        await page.unrouteAll({ behavior: 'wait' })

        // Retry: the invoice form from the estimate, its read-only Customer above the link.
        await page.getByTestId('invoice-retry').click()
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        const customer = page.getByTestId('invoice-customer-read-only')
        const link = page.getByTestId('invoice-from-estimate')
        await expect(customer).toContainText(HARBORVIEW)
        await expect(link).toHaveText(`From estimate ${number}`)
        await expect
            .poll(async () => {
                const top = await customer.boundingBox()
                const below = await link.boundingBox()
                if (!top || !below) return Number.NaN
                return below.y - (top.y + top.height)
            })
            .toBeGreaterThanOrEqual(0)

        // Cancel changes nothing and returns to the saved estimate.
        await page.getByTestId('invoice-cancel').click()
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
        await expect(page.getByTestId('estimate-badge')).toHaveText('Pending')

        // The phone's Delete estimate is a More row.
        await page.getByTestId('estimate-more').click()
        await page.getByTestId('estimate-delete').click()
        const dialog = page.getByTestId('estimate-delete-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Delete estimate ${number}?`)
        await dialog.getByText('Cancel', { exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(estimateUrlOf(id))
        await expect(page.getByTestId('estimate-form')).toBeVisible()
    })
})
