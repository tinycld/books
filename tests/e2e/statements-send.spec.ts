import { expect, type Page, test } from '@playwright/test'
import { customerPath, DESKTOP, openBooks } from './customer-form-helpers'
import { localDay } from './receive-payment-helpers'
import {
    newStatementUrl,
    openNewStatementFor,
    type StatementCustomer,
    statementCustomer,
    statementsOf,
} from './statements-helpers'

// Preview, Save and send and the phone bar of Create statements (statements spec §3.3, §3.4,
// plan checkpoint 4). Every test makes its own customer with a unique name and email and one
// posted invoice, opens the screen from that customer's New transaction menu (Customer
// balance "All", only that customer ticked), and reads what it stored through the page's own
// fetch. The e2e server captures email, so a send succeeds.
//
// Not covered here (plan, "States with no e2e test"): a refused store (the useCreateStatements
// harness test), email not set up, "Preparing…" and "Sending…" (statementBarState's unit test).

const PREVIEW_PATH = '/api/books/statements/preview'
const SEND_PATH = '/api/books/statements/send'
const NOT_SENT = 'The email could not be sent. Try again.'
const TOO_MANY = 'Select at most 200 customers. Narrow the list with Customer balance.'
const PHONE = { width: 390, height: 844 }

// The same day of the month before, or that month's last day when it has no such day.
function dayOfMonthBefore(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number)
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${prevYear}-${pad(prevMonth)}-${pad(Math.min(day, lastDay))}`
}

function toast(page: Page, text: string) {
    return page.getByTestId('toast-card').filter({ hasText: text })
}

function screenParts(page: Page, customer: StatementCustomer) {
    return {
        type: page.getByTestId('statements-type'),
        title: page.getByTestId('statements-title'),
        caption: page.getByTestId('statements-total-caption'),
        total: page.getByTestId('statements-total'),
        tickAll: page.getByTestId('statements-tick-all'),
        card: page.getByTestId(`statements-card-${customer.id}`),
        tick: page.getByTestId(`statements-tick-${customer.id}`),
        address: page.getByTestId(`statements-email-${customer.id}`),
        addressError: page.getByTestId(`statements-address-error-${customer.id}`),
        more: page.getByTestId('statements-more'),
        save: page.getByTestId('statements-save'),
        previewDialog: page.getByTestId('statements-preview-dialog'),
        previewPage: page.getByTestId('statements-preview-page'),
        previewDownload: page.getByTestId('statements-preview-download'),
    }
}

// Whether the customer's row is mounted and shows inside the recipients' rows scroller.
function rowInView(page: Page, customer: StatementCustomer) {
    return page.getByTestId('statements-table-rows').evaluate((scroller, id) => {
        const row = scroller.querySelector(`[data-testid="statements-row-${id}"]`)
        if (row === null) return false
        const box = scroller.getBoundingClientRect()
        const rect = row.getBoundingClientRect()
        return rect.bottom > box.top && rect.top < box.bottom
    }, customer.id)
}

// Scrolls the recipients' rows to the end farther from the customer's row, so the row is
// out of view, and waits until the scroller is there.
async function scrollRowAway(page: Page, customer: StatementCustomer) {
    const rows = page.getByTestId('statements-table-rows')
    const target = await rows.evaluate((scroller, id) => {
        const row = scroller.querySelector(`[data-testid="statements-row-${id}"]`)
        const rowTop =
            row === null
                ? scroller.scrollTop
                : row.getBoundingClientRect().top -
                  scroller.getBoundingClientRect().top +
                  scroller.scrollTop
        const end = scroller.scrollHeight - scroller.clientHeight
        return rowTop > scroller.scrollHeight / 2 ? 0 : end
    }, customer.id)
    await rows.evaluate((scroller, y) => {
        scroller.scrollTop = y
    }, target)
    await expect.poll(() => rows.evaluate(scroller => Math.round(scroller.scrollTop))).toBe(target)
    await expect.poll(() => rowInView(page, customer)).toBe(false)
}

async function expectBackOnCustomer(page: Page, customer: StatementCustomer) {
    await expect(page).toHaveURL(await customerPath(page, customer.id))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

test.describe('statements: preview and send', () => {
    test('Preview: ⌥P shows the PDF of the run, Download names the file, nothing is stored, a refusal shows a toast', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)
        const today = await localDay(page, 0)

        await expect(parts.type).toBeFocused()
        const asked = page.waitForRequest(
            request => request.url().endsWith(PREVIEW_PATH) && request.method() === 'POST'
        )
        await page.keyboard.press('Alt+p')
        const request = await asked
        expect(request.postDataJSON()).toEqual({
            type: 'balance_forward',
            statement_date: today,
            start_date: dayOfMonthBefore(today),
            end_date: today,
            customers: [customer.id],
        })

        await expect(parts.previewDialog).toBeVisible()
        await expect(parts.previewDialog.getByText('Preview', { exact: true })).toBeVisible()
        await expect(parts.previewPage).toBeVisible()

        const downloaded = page.waitForEvent('download')
        await parts.previewDownload.click()
        expect((await downloaded).suggestedFilename()).toBe(`statements-preview-${today}.pdf`)

        await page.keyboard.press('Escape')
        await expect(parts.previewDialog).toHaveCount(0)
        await expect(page).toHaveURL(newStatementUrl(customer.id))
        expect(await statementsOf(page, customer.id)).toEqual([])

        await page.route(`**${PREVIEW_PATH}`, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: TOO_MANY, data: {} }),
            })
        )
        const refused = page.waitForResponse(response => response.url().endsWith(PREVIEW_PATH))
        await page.keyboard.press('Alt+p')
        await refused
        await expect(toast(page, TOO_MANY)).toBeVisible()
        await expect(parts.previewDialog).toHaveCount(0)

        // Preview uses the options on screen only (spec §3.4): an invalid typed address on the
        // ticked row does not block it.
        await page.unroute(`**${PREVIEW_PATH}`)
        await parts.address.fill('x@')
        await expect(parts.address).toHaveValue('x@')
        const askedAgain = page.waitForRequest(
            request => request.url().endsWith(PREVIEW_PATH) && request.method() === 'POST'
        )
        await page.keyboard.press('Alt+p')
        expect((await askedAgain).postDataJSON().customers).toEqual([customer.id])
        await expect(parts.previewPage).toBeVisible()
    })

    test('Save and send: ⌘↵ stores and sends the statement to the address and returns with "1 statement sent"', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)

        await expect(parts.type).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(toast(page, '1 statement sent')).toBeVisible()
        await expectBackOnCustomer(page, customer)

        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].sent_to).toBe(customer.email)
        expect(rows[0].sent_at).not.toBe('')
    })

    test('a blank address: Save and send refuses it under the field and stores nothing, Save stores it unsent', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)

        await parts.address.fill('')
        await expect(parts.address).toHaveValue('')

        // The refused row scrolls into view (spec §3.4), on each refused press.
        await scrollRowAway(page, customer)
        await parts.type.focus()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(parts.addressError).toHaveText('Enter an email address or clear the tick.')
        await expect(parts.addressError).toBeInViewport()

        await scrollRowAway(page, customer)
        await parts.type.focus()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(parts.addressError).toBeInViewport()
        await expect(page).toHaveURL(newStatementUrl(customer.id))
        expect(await statementsOf(page, customer.id)).toEqual([])

        await page.keyboard.press('ControlOrMeta+s')
        await expect(toast(page, '1 statement saved')).toBeVisible()
        await expectBackOnCustomer(page, customer)
        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].email).toBe('')
        expect(rows[0].sent_at).toBe('')
    })

    // Spec §3.4 "A failed send never makes a new statement" (human, 2026-11-20). The first
    // send answer is fulfilled with the row failed and never reaches the server, so the row
    // stays stored and unsent on the server; later sends go through.
    test('a failed send: the row keeps its saved statement, and a second ⌘↵ sends that same statement', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)

        const sendBodies: { statements: { id: string; to: string }[] }[] = []
        await page.route(`**${SEND_PATH}`, async route => {
            const body = route.request().postDataJSON() as (typeof sendBodies)[number]
            sendBodies.push(body)
            if (sendBodies.length > 1) return route.continue()
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sent: [],
                    failed: body.statements.map(item => ({ id: item.id, message: NOT_SENT })),
                }),
            })
        })

        await expect(parts.type).toBeFocused()
        const firstSend = page.waitForResponse(response => response.url().endsWith(SEND_PATH))
        await page.keyboard.press('ControlOrMeta+Enter')
        await firstSend
        await expect(page.getByTestId('statements-run-notice')).toContainText(
            '0 of 1 statements were sent.'
        )
        await expect(page).toHaveURL(newStatementUrl(customer.id))
        const [first] = await statementsOf(page, customer.id)
        expect(first.sent_at).toBe('')
        expect(first.id).toBe(sendBodies[0].statements[0].id)
        await expect(page.getByTestId(`statements-recipient-failed-${customer.id}`)).toHaveText(
            `${first.number} not sent: ${NOT_SENT}`
        )

        const secondSend = page.waitForResponse(response => response.url().endsWith(SEND_PATH))
        await page.keyboard.press('ControlOrMeta+Enter')
        await secondSend
        expect(sendBodies[1].statements.map(item => item.id)).toEqual([first.id])
        await expect(toast(page, '1 statement sent')).toBeVisible()
        await expectBackOnCustomer(page, customer)

        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(first.id)
        expect(rows[0].number).toBe(first.number)
        expect(rows[0].sent_to).toBe(customer.email)
        expect(rows[0].sent_at).not.toBe('')
    })

    test('phone (390 × 844): total first, cards with the address, Select all, and More → Save', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        await page.setViewportSize(PHONE)
        const parts = screenParts(page, customer)
        await expect(parts.card).toBeVisible()

        // The total is the first block: under the title, at its left, above the options.
        await expect
            .poll(async () => {
                const [title, caption, type] = await Promise.all([
                    parts.title.boundingBox(),
                    parts.caption.boundingBox(),
                    parts.type.boundingBox(),
                ])
                if (!title || !caption || !type) return null
                return {
                    underTitle: caption.y >= title.y + title.height - 1,
                    atTitleLeft: Math.abs(caption.x - title.x) <= 2,
                    aboveOptions: caption.y + caption.height <= type.y,
                }
            })
            .toEqual({ underTitle: true, atTitleLeft: true, aboveOptions: true })

        await expect(parts.card.getByTestId(`statements-email-${customer.id}`)).toHaveValue(
            customer.email
        )

        // Only the customer is ticked: the first press ticks every card, the second unticks
        // every card.
        await expect(parts.caption).toHaveText('Total balance of 1 customer')
        await parts.tickAll.click()
        await expect(parts.caption).toHaveText(/^Total balance of \d+ customers$/)
        await parts.tickAll.click()
        await expect(parts.caption).toHaveText('No customer selected')

        await parts.tick.click()
        await expect(parts.caption).toHaveText('Total balance of 1 customer')
        await expect(parts.total).toHaveText(customer.invoiceAmount)

        await parts.more.click()
        await parts.save.click()
        await expect(toast(page, '1 statement saved')).toBeVisible()
        await expect(page).toHaveURL(await customerPath(page, customer.id))
        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].customer).toBe(customer.id)
    })
})
