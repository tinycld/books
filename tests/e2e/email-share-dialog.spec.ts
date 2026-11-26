import { expect, type Page, test } from '@playwright/test'
import { waitForEmailTo } from '@tinycld/core/e2e-helpers'
import { openHistoryFromMore, openMoreMenu } from './audit-log-helpers'
import {
    afterNextFrames,
    createCustomer,
    DESKTOP,
    openBooks,
    uniqueName,
} from './customer-form-helpers'
import {
    businessName,
    countSendRequests,
    DOCUMENT_SEND_PATH,
    EMAIL_STATUS_PATH,
    emailBody,
    openSendDialog,
    postedInvoiceWithEmail,
    sendDialog,
    toast,
    todayWords,
} from './email-share-helpers'
import { invoiceIdFromUrl, openInvoiceBySearch, uniqueMemo } from './invoice-helpers'
import { nonTaxableService } from './receive-payment-helpers'
import {
    openNewSalesReceipt,
    openSalesReceiptBySearch,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    SALES_RECEIPT_URL,
} from './sales-receipt-helpers'
import { uniqueEmail } from './statements-helpers'

// The Send dialog on a document's read view (email-share spec §3.2, §3.3, §3.6; plan
// checkpoint 3). Every test makes its own customer with a unique name and email address and
// its own posted document with a unique memo, opens it through search, and reads the email
// it sent from the e2e capture log by that address (the e2e server captures email, so the
// email status answers that the server can send).
//
// Not covered here: the phone Sheet and More rows (checkpoint 5's phone test), the dialog's
// loading and load-error states (plan decision 21: unit cases of sendDialogStatus), a
// refused send (checkpoint 4), native keys.

const LINK_COPIED = 'Customer link copied.'
const INVOICE_LINK = /\/p\/books\/invoices\/[A-Za-z0-9_-]{43}$/
const NOT_SET_UP =
    'Email sending is not set up. Share the customer link or the PDF with your customer.'

// Books must be open at desktop width. Creates a customer with a unique name and email and
// posts one sales receipt for it with one non-taxable service and a unique memo; goes back
// off the receipt and returns the memo, the number and the address.
async function postedSalesReceiptWithEmail(
    page: Page
): Promise<{ memo: string; number: string; email: string }> {
    const customer = uniqueName('Send receipt')
    const email = uniqueEmail('send-receipt')
    await createCustomer(page, { name: customer, email })
    await openNewSalesReceipt(page)
    await pickReceiptCustomer(page, customer)
    await pickReceiptLineProduct(page, 0, nonTaxableService())
    const memo = uniqueMemo('Send receipt')
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('sales-receipt-post').click()
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
    await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
    const title = page.getByTestId('sales-receipt-title')
    await expect(title).toHaveText(/^Sales receipt \d+$/)
    const number = /^Sales receipt (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    await page.goBack()
    await expect(page).not.toHaveURL(/\/books\/sales-receipts\//)
    return { memo, number, email }
}

test.describe('email-share: send dialog', () => {
    test('S opens the dialog with the starting texts, and ⌘↵ sends the invoice with its PDF', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        const business = await businessName(page)
        await openInvoiceBySearch(page, invoice.memo)

        // A key registers only after its section loads.
        await expect(page.getByTestId('invoice-read-send').filter({ visible: true })).toBeVisible()
        await page.keyboard.press('s')
        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByText(`Send invoice ${invoice.number}`, { exact: true })
        ).toBeVisible()
        const to = dialog.getByTestId('document-send-to')
        await expect(to).toBeFocused()
        await expect(to).toHaveValue(invoice.email)
        const subject = `Invoice ${invoice.number} from ${business}`
        await expect(dialog.getByTestId('document-send-subject')).toHaveValue(subject)
        await expect(emailBody(page)).toContainText(`Attached is invoice ${invoice.number}`)
        await expect(emailBody(page).locator('strong', { hasText: 'Balance due:' })).toBeVisible()
        await expect(
            dialog.getByText(`Attachment: invoice-${invoice.number}.pdf`, { exact: true })
        ).toBeVisible()

        // No click from here: To's text is selected at open, so the typed address replaces it.
        const cc = uniqueEmail('send-cc')
        await page.keyboard.type(invoice.email)
        await page.keyboard.press('Tab')
        await expect(dialog.getByTestId('document-send-cc')).toBeFocused()
        await page.keyboard.type(cc)

        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route(`**${DOCUMENT_SEND_PATH}`, async route => {
            await held
            await route.continue()
        })
        const answered = page.waitForResponse(r => r.url().includes(DOCUMENT_SEND_PATH))
        await page.keyboard.press('ControlOrMeta+Enter')
        const submit = dialog.getByTestId('document-send-submit')
        await expect(submit).toContainText('Sending…')
        await expect(submit).toBeDisabled()
        await expect(dialog.getByTestId('document-send-cancel')).toBeDisabled()
        await page.keyboard.press('Escape')
        await afterNextFrames(page)
        await expect(dialog).toBeVisible()
        await expect(submit).toContainText('Sending…')
        release()
        expect((await answered).status()).toBe(200)

        await expect(
            toast(page, `Invoice ${invoice.number} sent to ${invoice.email}`)
        ).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(page.getByTestId('invoice-sent-line').filter({ visible: true })).toHaveText(
            `Sent ${await todayWords(page)} to ${invoice.email}`
        )

        const email = await waitForEmailTo(invoice.email)
        expect(email.subject).toBe(subject)
        expect((email.cc ?? []).map(r => r.email)).toContain(cc)
        expect(email.attachment_names).toEqual([`invoice-${invoice.number}.pdf`])
        expect(email.html ?? '').toContain(business)
        expect(email.text ?? '').toContain('Balance due:')
    })

    test('an edited subject and a formatted message sent from the body show in the email and the Audit history', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        await openInvoiceBySearch(page, invoice.memo)
        const invoiceId = await invoiceIdFromUrl(page)
        const dialog = await openSendDialog(page)

        const subject = uniqueMemo('Your invoice')
        await dialog.getByTestId('document-send-subject').fill(subject)

        const body = emailBody(page)
        const toolbar = dialog.getByTestId('document-send-toolbar')
        await body.click()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('Thank you')
        await page.keyboard.press('Enter')
        await page.keyboard.type('Pay online')

        // Bold on the first paragraph: the toolbar's focus guard keeps the editor focused,
        // so the format applies to the selection.
        await body.getByText('Thank you', { exact: true }).click({ clickCount: 3 })
        await toolbar.getByRole('button', { name: 'Bold', exact: true }).click()
        await expect(body).toBeFocused()
        await expect(body.locator('strong')).toHaveText('Thank you')

        // Link on the second paragraph, through the Link dialog.
        await body.getByText('Pay online', { exact: true }).click({ clickCount: 3 })
        await toolbar.getByRole('button', { name: 'Link', exact: true }).click()
        const linkInput = page.getByRole('textbox', { name: 'Link', exact: true })
        await expect(linkInput).toBeFocused()
        await linkInput.fill('https://example.com/pay')
        await page
            .getByRole('button', { name: /^Apply/ })
            .filter({ visible: true })
            .click()
        await expect(linkInput).toBeHidden()
        await expect(body.locator('a[href="https://example.com/pay"]')).toHaveText('Pay online')

        // ⌘↵ with the caret in the body sends, once.
        await body.locator('strong').click()
        await expect(body).toBeFocused()
        const requests = countSendRequests(page)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(
            toast(page, `Invoice ${invoice.number} sent to ${invoice.email}`)
        ).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)

        const email = await waitForEmailTo(invoice.email)
        expect(email.subject).toBe(subject)
        expect(email.html ?? '').toContain('<strong>Thank you</strong>')
        expect(email.html ?? '').toContain('href="https://example.com/pay"')
        expect(email.text ?? '').toContain('Thank you')
        expect(requests.count()).toBe(1)

        await openMoreMenu(page, 'invoice-read-more')
        await openHistoryFromMore(page, 'invoice-read-history', {
            collection: 'books_invoices',
            id: invoiceId,
        })
        const sent = page
            .getByTestId('history-events')
            .filter({ visible: true })
            .locator('[data-testid^="history-event-"]')
            .filter({ has: page.getByText(`Sent to ${invoice.email}`, { exact: true }) })
        await expect(sent).toHaveCount(1)
        await expect(sent).toContainText('Subject')
        await expect(sent).toContainText(subject)
        await expect(sent).toContainText('Message')
        await expect(sent).toContainText('Thank you')
    })

    test('empty fields are refused inline, and Reset message puts the starting texts back, on a sales receipt', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const receipt = await postedSalesReceiptWithEmail(page)
        const business = await businessName(page)
        await openSalesReceiptBySearch(page, receipt.memo)
        const send = page.getByTestId('sales-receipt-read-send').filter({ visible: true })
        await expect(send).toBeVisible()
        await send.click()

        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByText(`Send sales receipt ${receipt.number}`, { exact: true })
        ).toBeVisible()
        const body = emailBody(page)
        await expect(body).toContainText('Paid. No payment is due.')
        await expect(dialog.getByTestId('document-send-copy-link')).toHaveCount(0)
        await expect(dialog.getByTestId('document-send-download')).toBeVisible()

        const requests = countSendRequests(page)
        const to = dialog.getByTestId('document-send-to')
        const subject = dialog.getByTestId('document-send-subject')
        const submit = dialog.getByTestId('document-send-submit')
        await subject.fill('')
        await body.click()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('Backspace')
        await submit.click()
        await expect(dialog.getByText('Enter a subject.', { exact: true })).toBeVisible()
        await expect(dialog.getByTestId('document-send-body-error')).toHaveText('Enter a message.')
        await expect(dialog).toBeVisible()
        expect(requests.count()).toBe(0)

        await to.fill('')
        await submit.click()
        await expect(dialog.getByText('Enter an email address.', { exact: true })).toBeVisible()
        expect(requests.count()).toBe(0)

        // ⌥R from the subject field puts the starting subject and message back.
        await subject.click()
        await expect(subject).toBeFocused()
        await page.keyboard.press('Alt+r')
        await expect(subject).toHaveValue(`Sales receipt ${receipt.number} from ${business}`)
        await expect(body).toContainText(`Attached is sales receipt ${receipt.number}`)
        await expect(body).toContainText('Paid. No payment is due.')

        await to.fill(receipt.email)
        await submit.click()
        await expect(
            toast(page, `Sales receipt ${receipt.number} sent to ${receipt.email}`)
        ).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(
            page.getByTestId('sales-receipt-sent-line').filter({ visible: true })
        ).toHaveText(`Sent ${await todayWords(page)} to ${receipt.email}`)
    })

    test('with email not set up the dialog offers the customer link and the PDF, and copies the link', async ({
        page,
    }) => {
        // The one read that says whether the server can send, answered before Books loads.
        await page.route(
            url => url.pathname === EMAIL_STATUS_PATH,
            route => route.fulfill({ json: { canSend: false } })
        )
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        await openInvoiceBySearch(page, invoice.memo)
        const dialog = await openSendDialog(page)

        await expect(dialog.getByTestId('document-send-not-set-up')).toContainText(NOT_SET_UP)
        for (const absent of [
            'document-send-to',
            'document-send-toolbar',
            'document-send-body',
            'document-send-submit',
            'document-send-cancel',
        ]) {
            await expect(dialog.getByTestId(absent), absent).toHaveCount(0)
        }
        await expect(dialog.getByTestId('document-send-download')).toBeVisible()
        await expect(dialog.getByTestId('document-send-close')).toBeVisible()

        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.evaluate(() => navigator.clipboard.writeText(''))
        const copy = dialog.getByTestId('document-send-copy-link')
        await expect(copy).toBeVisible()
        await copy.click()
        await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toMatch(INVOICE_LINK)
    })
})
