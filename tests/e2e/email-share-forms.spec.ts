import { expect, type Page, test } from '@playwright/test'
import { waitForEmailTo } from '@tinycld/core/e2e-helpers'
import {
    afterNextFrames,
    createCustomer,
    customerPath,
    DESKTOP,
    openBooks,
    uniqueName,
} from './customer-form-helpers'
import { countSendRequests, emailBody, sendDialog, toast, todayWords } from './email-share-helpers'
import {
    ESTIMATE_URL,
    estimateLineRowId,
    estimateNumberOf,
    openNewEstimate,
} from './estimate-helpers'
import {
    INVOICE_URL,
    lineCellTestId,
    lineRows,
    NEW_INVOICE_URL,
    openNewInvoice,
    pickInvoiceCustomer,
    uniqueMemo,
} from './invoice-helpers'
import { BATCH_WRITE, batchOperations, refuseBatchOperation } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import { fillInvoice, localDay, nonTaxableService } from './receive-payment-helpers'
import { uniqueEmail } from './statements-helpers'

// Send from a document's form (email-share spec §3.3 "Form", §3.6, §4.5; plan checkpoint 4):
// Post and send on an invoice opens the Send dialog on the posted invoice's read view, and a
// refused post (client or server) opens none, then or later; Save and send on an estimate,
// from the keyboard only, opens it on the saved estimate's form, and on a stored estimate
// with no change it opens with no save. Every test makes its own customer with a unique
// name and email address and its own documents with a unique memo, and reads the email it
// sent from the e2e capture log by that address.
//
// Not covered here: Post and send on the sales receipt, credit memo and refund receipt
// forms (the same `DocumentActionBar` action and the same queue, unit-tested), the phone
// More rows (checkpoint 5's phone test), native keys.

const INVOICES = 'books_invoices'
const ESTIMATE_LINK = /\/p\/books\/estimates\/[A-Za-z0-9_-]{43}/

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// Books must be open at desktop width. A customer with a unique name and email; leaves the
// page on the customer.
async function customerWithEmail(page: Page, label: string) {
    const name = uniqueName(label)
    const email = uniqueEmail('form-send')
    await createCustomer(page, { name, email })
    const id = new URL(page.url()).pathname.split('/').pop() ?? ''
    await expect(page).toHaveURL(customerPath(id))
    return { name, email, id }
}

function isInvoicePost(operation: { method: string; url: string; body?: unknown }) {
    const body = operation.body as { status?: string } | null | undefined
    return (
        operation.method === 'PATCH' &&
        operation.url.includes(`/api/collections/${INVOICES}/records/`) &&
        body?.status === 'posted'
    )
}

// Refuses the next write that posts an invoice once, as the server refuses an inactive
// customer at posting, with the refusal on the Customer field. The draft writes pass: a
// new invoice's post is its own PATCH after the create batch; a saved draft's post is the
// header PATCH of its batch. Every other request passes. `refused` settles once the
// refusal is answered.
async function refuseNextInvoicePost(
    page: Page,
    message: string
): Promise<{ refused: Promise<void> }> {
    let isRefused = false
    let answered = () => {}
    const refused = new Promise<void>(resolve => {
        answered = resolve
    })
    const response = {
        status: 400,
        message,
        data: { customer: { code: 'validation_books', message } },
    }
    const ownRecord = (url: URL) => url.pathname.startsWith(`/api/collections/${INVOICES}/records/`)
    await page.route(ownRecord, async route => {
        const request = route.request()
        const operation = {
            method: request.method(),
            url: request.url(),
            body: request.method() === 'PATCH' ? request.postDataJSON() : null,
        }
        if (isRefused || !isInvoicePost(operation)) return route.fallback()
        isRefused = true
        await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify(response),
        })
        answered()
    })
    await page.route(BATCH_WRITE, async route => {
        const index = batchOperations(route.request()).findIndex(isInvoicePost)
        if (isRefused || index < 0) return route.fallback()
        isRefused = true
        await refuseBatchOperation(route, index, response)
        answered()
    })
    return { refused }
}

// On a filled invoice form: Post and send with its post refused shows the refusal and
// opens no dialog; then a plain Post of the same draft shows the read view, and no stale
// queued send opens the dialog there.
async function refusedSendThenPost(page: Page, refusal: string) {
    const { refused } = await refuseNextInvoicePost(page, refusal)
    await visible(page, 'invoice-post-send').click()
    await refused
    await expect(page.getByTestId('form-field-customer-error')).toHaveText(refusal)
    await afterNextFrames(page)
    await expect(page.getByTestId('document-send-dialog')).toHaveCount(0)
    await page.unrouteAll({ behavior: 'wait' })

    await visible(page, 'invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(visible(page, 'invoice-read-only')).toBeVisible()
    await expect(visible(page, 'invoice-badge')).toHaveText('Posted')
    await afterNextFrames(page)
    await expect(page.getByTestId('document-send-dialog')).toHaveCount(0)
}

// Counts the page's writes of `books_estimates` from now on: its own requests and its
// operations inside a batch.
function countEstimateWrites(page: Page): { count: () => number } {
    let count = 0
    page.on('request', request => {
        const ownWrite =
            request.method() !== 'GET' &&
            request.url().includes('/api/collections/books_estimates/records')
        const inBatch = batchOperations(request).some(
            operation =>
                operation.method !== 'GET' &&
                operation.url.includes('/api/collections/books_estimates/records')
        )
        if (ownWrite || inBatch) count += 1
    })
    return { count: () => count }
}

test.describe('email-share: send from a form', () => {
    test.use({ viewport: DESKTOP })

    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('Post and send opens the dialog on the posted invoice, Cancel sends nothing, and a refused post opens none', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await customerWithEmail(page, 'Post send')
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-invoice').click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customer.id}$`))
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Post and send'))
        await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '180.00' })

        const sends = countSendRequests(page)
        await visible(page, 'invoice-post-send').click()
        // The post landed: the posted invoice's own URL and read view.
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        await expect(visible(page, 'invoice-badge')).toHaveText('Posted')
        const title = visible(page, 'invoice-title')
        await expect(title).toHaveText(/^Invoice \d+$/)
        const number = /^Invoice (\d+)$/.exec(await title.innerText())?.[1]
        if (!number) throw new Error('the read view title has no number')

        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(`Send invoice ${number}`, { exact: true })).toBeVisible()
        await expect(dialog.getByTestId('document-send-to')).toHaveValue(customer.email)

        // Cancel leaves the invoice posted and not sent.
        await dialog.getByTestId('document-send-cancel').click()
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        await expect(visible(page, 'invoice-badge')).toHaveText('Posted')
        await expect(page.getByTestId('invoice-sent-line')).toHaveCount(0)
        expect(sends.count()).toBe(0)
        // The dialog's opener (the form's Post and send) is gone: focus returns to the
        // screen's own send control, not to the page's body. Soft, so the refusals below
        // still run when it fails.
        await expect.soft(visible(page, 'invoice-read-send')).toBeFocused()

        // A client refusal: no line to post. Nothing is written, so nothing opens.
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, customer.name)
        await visible(page, 'invoice-post-send').click()
        await expect(page.getByTestId('form-field-lines-error')).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await afterNextFrames(page)
        await expect(page.getByTestId('document-send-dialog')).toHaveCount(0)

        // A server refusal of the post of a new invoice (its own request after the create
        // batch): the draft is written, the form keeps the refusal and opens no dialog, and
        // the plain Post of that draft after it opens none either.
        const refusal = `${customer.name} is inactive. Choose an active customer.`
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Post and send refused'))
        // The refused Post dropped the empty trailing Item line; add one to fill.
        await page.getByTestId('form-table-lines-add').click()
        await expect(lineRows(page)).toHaveCount(1)
        await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '95.00' })
        await refusedSendThenPost(page, refusal)

        // The same on a saved draft: its post is the header write of the update's batch.
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, customer.name)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Draft send refused'))
        await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '60.00' })
        await visible(page, 'invoice-save-draft').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(visible(page, 'invoice-title')).toHaveText('Draft invoice')
        await refusedSendThenPost(page, refusal)
        expect(sends.count()).toBe(0)
    })

    test('Save and send on an estimate, from the keyboard only, sends it, and again with no save', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await customerWithEmail(page, 'Save send')
        const memo = uniqueMemo('Save and send')
        await openNewEstimate(page)

        // No click from here: focus starts in Customer; type-to-open picks the customer.
        const customerField = page.getByTestId('form-input-customer')
        await expect(customerField).toBeFocused()
        await page.keyboard.type(customer.name)
        await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: customer.name, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(customerField).toContainText(customer.name)
        await expect(page.getByTestId('estimate-email')).toContainText(customer.email)

        const line = await estimateLineRowId(page, 0)
        const product = page.getByTestId(lineCellTestId(line, 'product'))
        await tabTo(page, product, { max: 20 })
        await page.keyboard.type(nonTaxableService())
        await expect(
            page.getByRole('menuitem', { name: nonTaxableService(), exact: true })
        ).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(product).toContainText(nonTaxableService())
        const memoField = page.getByTestId('form-input-memo')
        await tabTo(page, memoField, { max: 20 })
        await page.keyboard.type(memo)
        await expect(memoField).toHaveValue(memo)

        // ⌘⌥↵ from a text field: the save lands (the saved estimate's URL), then the dialog.
        await page.keyboard.press('ControlOrMeta+Alt+Enter')
        await expect(page).toHaveURL(ESTIMATE_URL)
        const number = await estimateNumberOf(page)
        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(`Send estimate ${number}`, { exact: true })).toBeVisible()
        await expect(emailBody(page)).toContainText('To accept or decline this estimate, open:')
        await expect(emailBody(page).locator('a').first()).toHaveAttribute('href', ESTIMATE_LINK)
        const to = dialog.getByTestId('document-send-to')
        await expect(to).toBeFocused()
        await expect(to).toHaveValue(customer.email)

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(toast(page, `Estimate ${number} sent to ${customer.email}`)).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)
        // The route replace unmounted the dialog's opener (the new form's bar): focus
        // returns to the saved form's own Save and send, not to the page's body. Soft, so
        // the steps below still run when it fails.
        await expect.soft(visible(page, 'estimate-save-send')).toBeFocused()
        await expect(visible(page, 'estimate-form')).toBeVisible()
        // The sent line is in the header band, under the band's fields (a pending estimate
        // draws no decline note).
        const band = visible(page, 'estimate-band')
        const sentLine = band.getByTestId('estimate-sent-line')
        await expect(sentLine).toHaveText(`Sent ${await todayWords(page)} to ${customer.email}`)
        await expect(page.getByTestId('estimate-decline-note')).toHaveCount(0)
        const bandFields = band.getByTestId('estimate-band-form')
        await expect
            .poll(async () => {
                const line = await sentLine.boundingBox()
                const fields = await bandFields.boundingBox()
                if (!line || !fields) return null
                return line.y >= fields.y + fields.height
            })
            .toBe(true)
        const email = await waitForEmailTo(customer.email)
        expect(email.attachment_names).toEqual([`estimate-${number}.pdf`])

        // The stored estimate with no change: ⌘⌥↵ opens the dialog with no save.
        const writes = countEstimateWrites(page)
        // Back from the focused Save and send (the bar under the form) to the memo field.
        await tabTo(page, memoField, { max: 30, key: 'Shift+Tab' })
        await expect(memoField).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Alt+Enter')
        await expect(sendDialog(page)).toBeVisible()
        await expect(sendDialog(page).getByTestId('document-send-to')).toBeFocused()
        expect(writes.count()).toBe(0)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(sentLine).toHaveText(/ · sent 2 times$/)
        expect(writes.count()).toBe(0)
    })
})
