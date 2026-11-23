import { expect, type Page, type Route, test } from '@playwright/test'
import { readEmailLog, waitForEmailTo } from '@tinycld/core/e2e-helpers'
import {
    createCustomer,
    customerPath,
    DESKTOP,
    openBooks,
    uniqueName,
} from './customer-form-helpers'
import {
    DOCUMENT_SEND_PATH,
    postedInvoiceWithEmail,
    sendDialog,
    toast,
} from './email-share-helpers'
import { INVOICE_URL, invoiceIdFromUrl, pickLineProduct, uniqueMemo } from './invoice-helpers'
import { fillInvoice, localDay, nonTaxableService, postInvoice } from './receive-payment-helpers'
import {
    openRowMenu,
    openSales,
    openSalesTab,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'
import { uniqueEmail } from './statements-helpers'

// Send from the sales list (email-share spec §3.3 "Sales list row menu" and "Batch"; plan
// checkpoint 4, decisions 6, 7 and 22): the row menu's Send… opens the Send dialog over the
// list, where a refused send stays and a second press sends; the Batch actions menu's Send
// offers itself only for a sent-able ticked row, counts and skips a row with no address,
// sends each document to its own address in one request with no subject and no message,
// reports a part failure in the list's banner with only the failed row kept ticked, and a
// second Send repeats only that row. Every test makes its own customer and documents with
// a unique memo, finds them through the list's search, and reads the emails it sent from
// the e2e capture log by addresses no other test uses.
//
// Not covered here: the batch limit of 200 and email not set up in the batch dialog (unit
// cases of batchSendCopy; gate 2's `batch-too-many` and `batch-no-email` shots), the
// phone path (the same Menu rows and dialog), native keys.

type SendItem = { kind: string; id: string; to: string; cc: string[]; subject?: string }

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

function tick(page: Page, id: string) {
    return visible(page, `sales-tick-${id}`)
}

function sendItems(route: Route): SendItem[] {
    const body: { documents?: SendItem[] } | null = route.request().postDataJSON()
    return body?.documents ?? []
}

// The one visible list row's document id.
async function onlyRowId(page: Page): Promise<string> {
    await expect(listRows(page)).toHaveCount(1)
    const testId = (await listRows(page).getAttribute('data-testid')) ?? ''
    return testId.slice('sales-row-'.length)
}

// On a customer's page: posts an invoice for it with `memo`, its Email set to `email` on
// the form ('' clears it) unless `email` is undefined, and goes back to the customer.
async function postFromCustomer(
    page: Page,
    customerId: string,
    memo: string,
    email?: string
): Promise<{ id: string; number: string }> {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
    await page.getByTestId('form-input-memo').fill(memo)
    if (email !== undefined) {
        await page.getByTestId('invoice-edit-address').click()
        const field = page.getByTestId('form-input-email')
        await expect(field).toBeVisible()
        await field.fill(email)
        await expect(field).toHaveValue(email)
    }
    await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '120.00' })
    const posted = await postInvoice(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    return posted
}

// On a customer's page: saves a draft invoice for it with `memo` and goes back.
async function draftFromCustomer(page: Page, customerId: string, memo: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
    await page.getByTestId('form-input-memo').fill(memo)
    await pickLineProduct(page, 0, nonTaxableService())
    await page.getByTestId('invoice-save-draft').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
    const id = invoiceIdFromUrl(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    return id
}

async function openBatchActions(page: Page) {
    await visible(page, 'sales-batch-actions').click()
    await expect(
        visible(page, 'sales-batch-void').or(visible(page, 'sales-batch-delete-drafts')).first()
    ).toBeVisible()
}

test.describe('email-share: send from the sales list', () => {
    test.use({ viewport: DESKTOP })

    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('the row menu’s Send… shows a refused send in the dialog, and a second press sends', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        await openSales(page)
        await openSalesTab(page, 'invoices')
        await searchSales(page, invoice.memo)
        const id = await onlyRowId(page)

        await openRowMenu(page, id)
        await visible(page, 'sales-row-action-send').click()
        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(
            dialog.getByText(`Send invoice ${invoice.number}`, { exact: true })
        ).toBeVisible()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        const to = dialog.getByTestId('document-send-to')
        await expect(to).toHaveValue(invoice.email)
        const subject = uniqueMemo('List send')
        await dialog.getByTestId('document-send-subject').fill(subject)

        // The send is answered once with a refusal of this document.
        const notSent = 'The email could not be sent. Try again.'
        await page.route(
            `**${DOCUMENT_SEND_PATH}`,
            route => {
                const [item] = sendItems(route)
                return route.fulfill({
                    json: {
                        sent: [],
                        failed: [{ kind: 'invoice', id: item?.id ?? id, message: notSent }],
                    },
                })
            },
            { times: 1 }
        )
        const refused = page.waitForResponse(r => r.url().includes(DOCUMENT_SEND_PATH))
        await dialog.getByTestId('document-send-submit').click()
        await refused
        await expect(dialog.getByTestId('document-send-errors')).toContainText(notSent)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('document-send-subject')).toHaveValue(subject)
        await expect(to).toHaveValue(invoice.email)
        await page.unrouteAll({ behavior: 'wait' })

        // A second press sends the same document, and the list stays under the dialog.
        await dialog.getByTestId('document-send-submit').click()
        await expect(
            toast(page, `Invoice ${invoice.number} sent to ${invoice.email}`)
        ).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect(visible(page, 'sales-list')).toBeVisible()
        const email = await waitForEmailTo(invoice.email)
        expect(email.subject).toBe(subject)
        expect(email.attachment_names).toEqual([`invoice-${invoice.number}.pdf`])
        const toAddress = readEmailLog().filter(sent =>
            sent.to.some(r => r.email.toLowerCase() === invoice.email.toLowerCase())
        )
        expect(toAddress).toHaveLength(1)
    })

    test('Batch Send skips a row with no address, reports a part failure, and repeats only the failed row', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const firstEmail = uniqueEmail('batch-a')
        const secondEmail = uniqueEmail('batch-b')
        const name = uniqueName('Batch send')
        await createCustomer(page, { name, email: firstEmail })
        const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
        const base = uniqueMemo('Batch send')
        const draft = await draftFromCustomer(page, customerId, `${base} draft`)
        const first = await postFromCustomer(page, customerId, `${base} one`)
        const second = await postFromCustomer(page, customerId, `${base} two`, secondEmail)
        const noAddress = await postFromCustomer(page, customerId, `${base} three`, '')
        const numberOf = new Map([
            [first.id, first.number],
            [second.id, second.number],
        ])
        const addressOf = new Map([
            [first.id, firstEmail],
            [second.id, secondEmail],
        ])

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await searchSales(page, base)
        await expect(listRows(page)).toHaveCount(4)

        // Only a draft ticked: the Batch actions menu offers no Send.
        await tick(page, draft).click()
        await expect(tick(page, draft)).toHaveAttribute('aria-checked', 'true')
        await openBatchActions(page)
        await expect(page.getByTestId('sales-batch-send')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('sales-batch-delete-drafts')).toHaveCount(0)
        await tick(page, draft).click()
        await expect(tick(page, draft)).toHaveAttribute('aria-checked', 'false')

        for (const id of [first.id, second.id, noAddress.id]) {
            await tick(page, id).click()
            await expect(tick(page, id)).toHaveAttribute('aria-checked', 'true')
        }
        await openBatchActions(page)
        await visible(page, 'sales-batch-send').click()
        const dialog = visible(page, 'batch-send-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('Send 3 documents?')
        await expect(dialog).toContainText('Each goes to the email address on the document.')
        await expect(dialog.getByTestId('batch-send-skipped')).toHaveText(
            '1 is skipped: 1 has no email address.'
        )
        const confirm = dialog.getByTestId('batch-send-confirm')
        await expect(confirm).toHaveText(/^Send 2(?!\d)/)
        await expect(confirm).toBeEnabled()

        // The real endpoint sends the first item only; the answer adds a refusal of the
        // second, as the server answers a refused recipient.
        const seen: { items: SendItem[] } = { items: [] }
        await page.route(
            `**${DOCUMENT_SEND_PATH}`,
            async route => {
                const items = sendItems(route)
                seen.items = items
                const [sent, failed] = items
                if (sent === undefined || failed === undefined) return route.continue()
                const response = await route.fetch({
                    postData: JSON.stringify({ documents: [sent] }),
                })
                const answer: { sent: unknown[]; failed: unknown[] } = await response.json()
                return route.fulfill({
                    response,
                    json: {
                        sent: answer.sent,
                        failed: [
                            ...answer.failed,
                            {
                                kind: 'invoice',
                                id: failed.id,
                                message: `The email server refused ${failed.to}. Correct the address and send again.`,
                            },
                        ],
                    },
                })
            },
            { times: 1 }
        )
        const answered = page.waitForResponse(r => r.url().includes(DOCUMENT_SEND_PATH))
        await confirm.click()
        await answered

        // One request, each document to its own address, no subject and no message.
        expect(seen.items).toHaveLength(2)
        expect(new Set(seen.items.map(item => item.id))).toEqual(new Set([first.id, second.id]))
        for (const item of seen.items) {
            expect(item.to).toBe(addressOf.get(item.id))
            expect(item.cc).toEqual([])
            expect(item).not.toHaveProperty('subject')
            expect(item).not.toHaveProperty('body')
        }
        const [sentItem, failedItem] = seen.items
        if (sentItem === undefined || failedItem === undefined) throw new Error('no items')

        await expect(page.getByTestId('batch-send-dialog')).toHaveCount(0)
        const banner = visible(page, 'batch-send-banner')
        await expect(banner).toContainText('1 of 2 documents were sent.')
        await expect(banner).toContainText(
            `Invoice ${numberOf.get(failedItem.id)}: The email server refused ${failedItem.to}. Correct the address and send again.`
        )
        await expect(tick(page, failedItem.id)).toHaveAttribute('aria-checked', 'true')
        await expect(tick(page, sentItem.id)).toHaveAttribute('aria-checked', 'false')
        await expect(tick(page, noAddress.id)).toHaveAttribute('aria-checked', 'false')
        await expect(tick(page, draft)).toHaveAttribute('aria-checked', 'false')
        await waitForEmailTo(sentItem.to)
        const toFailed = readEmailLog().filter(sent =>
            sent.to.some(r => r.email.toLowerCase() === failedItem.to.toLowerCase())
        )
        expect(toFailed).toHaveLength(0)
        await page.unrouteAll({ behavior: 'wait' })

        // A second Send repeats only the failed row.
        await openBatchActions(page)
        await visible(page, 'sales-batch-send').click()
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('Send 1 document?')
        await expect(dialog.getByTestId('batch-send-skipped')).toHaveCount(0)
        await expect(confirm).toHaveText(/^Send 1(?!\d)/)
        await confirm.click()
        await expect(toast(page, '1 document sent')).toBeVisible()
        await expect(page.getByTestId('batch-send-dialog')).toHaveCount(0)
        for (const id of [draft, first.id, second.id, noAddress.id]) {
            await expect(tick(page, id)).toHaveAttribute('aria-checked', 'false')
        }
        await expect(page.getByTestId('batch-send-banner')).toHaveCount(0)
        await waitForEmailTo(failedItem.to)
    })
})
