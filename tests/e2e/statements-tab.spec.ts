import { expect, type Page, test } from '@playwright/test'
import { DESKTOP, openBooks, openCustomer } from './customer-form-helpers'
import { newActionTestId } from './new-menu-helpers'
import { fillInvoice, localDay, postInvoice } from './receive-payment-helpers'
import {
    newStatementUrl,
    type StatementCustomer,
    type StoredStatement,
    statementCustomer,
    statementsOf,
    storeStatement,
    uniqueEmail,
} from './statements-helpers'
import { fakeReadOnlyAccess } from './tax-rates-helpers'

// The customer's Statements tab and the screen of one statement (statements spec §3.7,
// §3.8, §3.9; plan checkpoint 5). Every writer test makes its own customer with a unique
// name and email and one posted invoice, stores its statements through Create statements
// (⌘S), and reads the stored rows through the page's own fetch. The e2e server captures
// email, so a send succeeds. The reader test fakes the books_access read as read-only
// (lesson 32) and reads the two seeded statements of Harborview Kitchen.
//
// Not covered here (plan, "Not driven in e2e"): the tab's loading and load error, the
// statement's load error and its PDF error, and the email-not-set-up state of Send…
// (`statementActions`' unit test pins it); gate 2 compares each with its reference shot.

const PDF_PATH = '/api/books/pdf/statement/'
const PHONE = { width: 390, height: 844 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SEEDED_CUSTOMER = 'Harborview Kitchen'

// "Sep 21 – Oct 22, 2026"; both years when the period crosses a year end (spec §3.7).
function periodText(start: string, end: string): string {
    const part = (iso: string) => {
        const [year, month, day] = iso.split('-').map(Number)
        return { year, monthDay: `${MONTHS[month - 1]} ${day}` }
    }
    const a = part(start)
    const b = part(end)
    if (a.year === b.year) return `${a.monthDay} – ${b.monthDay}, ${b.year}`
    return `${a.monthDay}, ${a.year} – ${b.monthDay}, ${b.year}`
}

function toast(page: Page, text: string) {
    return page.getByTestId('toast-card').filter({ hasText: text })
}

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function tabUrl(customerId: string) {
    return new RegExp(`/books/customers/${customerId}\\?tab=statements$`)
}

function statementUrl(id: string) {
    return new RegExp(`/books/statements/${id}$`)
}

function pdfAnswered(page: Page, id: string) {
    return page.waitForResponse(response => response.url().includes(`${PDF_PATH}${id}`))
}

// The ids of the statement rows (or cards) the shown tab draws, in screen order.
function shownRowIds(page: Page) {
    return page
        .locator('[data-testid^="statement-row-"]')
        .filter({ visible: true })
        .evaluateAll(nodes =>
            nodes
                .map(node => node.getAttribute('data-testid') ?? '')
                .filter(id => /^statement-row-[a-z0-9]{15}$/.test(id))
                .map(id => id.replace('statement-row-', ''))
        )
}

async function openStatementsTab(page: Page, customer: StatementCustomer) {
    await page.keyboard.press('Alt+5')
    await expect(page.getByTestId('customer-tab-statements')).toHaveAttribute(
        'aria-selected',
        'true'
    )
    await expect(page).toHaveURL(tabUrl(customer.id))
    await expect(shown(page, 'customer-statements')).toBeVisible()
}

// From the shown tab, a press on the row opens the statement with its PDF page.
async function openStatement(page: Page, row: StoredStatement) {
    const pdf = pdfAnswered(page, row.id)
    await shown(page, `statement-row-${row.id}`).click()
    await expect(page).toHaveURL(statementUrl(row.id))
    await expect(shown(page, 'statement-title')).toHaveText(`Statement ${row.number}`)
    expect((await pdf).status()).toBe(200)
    await expect(shown(page, 'statement-pdf')).toBeVisible()
}

// Waits until the stored row holds the sent address (proof the send landed).
async function expectSentTo(page: Page, customer: StatementCustomer, id: string, to: string) {
    await expect
        .poll(async () => (await statementsOf(page, customer.id)).find(r => r.id === id)?.sent_to)
        .toBe(to)
}

test.describe('statements: tab and statement', () => {
    test('the tab lists the stored statement, a row press opens it with its PDF, Escape returns', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        const stored = await storeStatement(page, customer)

        // ⌥5 selects the tab; a press on the tab selects it too.
        await openStatementsTab(page, customer)
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('customer-tab-transactions')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await page.getByTestId('customer-tab-statements').click()
        await expect(page.getByTestId('customer-tab-statements')).toHaveAttribute(
            'aria-selected',
            'true'
        )

        expect(await shownRowIds(page)).toEqual([stored.id])
        const row = shown(page, `statement-row-${stored.id}`)
        await expect(row).toContainText(stored.number)
        await expect(row).toContainText('Balance forward')
        await expect(row).toContainText(periodText(stored.start_date, stored.end_date))
        await expect(row).toContainText('Not sent')

        await openStatement(page, stored)
        await expect(page.getByRole('link', { name: customer.name, exact: true })).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(tabUrl(customer.id))
        await expect(shown(page, `statement-row-${stored.id}`)).toBeVisible()
    })

    test('Send… from the statement from the keyboard, again from the row menu, and Download PDF', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        const stored = await storeStatement(page, customer)
        await openStatementsTab(page, customer)
        await openStatement(page, stored)

        // S opens the dialog with focus in To, filled with the statement's address.
        const dialog = shown(page, 'statement-send-dialog')
        const to = page.getByTestId('statement-send-to')
        await expect(shown(page, 'statement-send')).toBeEnabled()
        await page.keyboard.press('s')
        await expect(dialog).toBeVisible()
        await expect(to).toBeFocused()
        await expect(to).toHaveValue(customer.email)
        const stem = stored.number.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        await expect(
            dialog.getByText(new RegExp(`^Attachment: statement-${stem}-.+\\.pdf$`))
        ).toBeVisible()

        // An empty To is refused and the dialog stays.
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('Backspace')
        await expect(to).toHaveValue('')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog.getByText('Enter an email address.', { exact: true })).toBeVisible()
        await expect(dialog).toBeVisible()

        // A new address is sent: the dialog closes with the toast, the sent line follows.
        const first = uniqueEmail('resend')
        await page.keyboard.type(first)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(toast(page, `Statement sent to ${first}`)).toBeVisible()
        await expect(dialog).toHaveCount(0)
        await expectSentTo(page, customer, stored.id, first)
        await expect(shown(page, 'statement-sent')).toContainText(`to ${first}`)

        // Back on the tab the row's Sent cell holds the address.
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(tabUrl(customer.id))
        const row = shown(page, `statement-row-${stored.id}`)
        await expect(row).toContainText(first)

        // The row menu's Send… opens the same dialog for that row.
        await shown(page, `statement-row-menu-${stored.id}`).click()
        await shown(page, `statement-row-send-${stored.id}`).click()
        await expect(dialog).toBeVisible()
        await expect(to).toBeFocused()
        const second = uniqueEmail('again')
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(second)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(toast(page, `Statement sent to ${second}`)).toBeVisible()
        await expect(dialog).toHaveCount(0)
        await expectSentTo(page, customer, stored.id, second)
        await expect(row).toContainText(second)

        // The row menu's Download PDF reads the statement's PDF.
        await shown(page, `statement-row-menu-${stored.id}`).click()
        const pdf = pdfAnswered(page, stored.id)
        await shown(page, `statement-row-download-${stored.id}`).click()
        expect((await pdf).status()).toBe(200)
    })

    test('a back-dated change shows the stored amount, Delete asks first, and the tab empties', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        const first = await storeStatement(page, customer)
        const second = await storeStatement(page, customer)
        expect(first.balance).toBe(customer.invoiceCents)

        // Send the first from its screen: a sent statement can be deleted too.
        await openStatementsTab(page, customer)
        await openStatement(page, first)
        await expect(shown(page, 'statement-send')).toBeEnabled()
        await page.keyboard.press('s')
        await expect(page.getByTestId('statement-send-to')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(toast(page, `Statement sent to ${customer.email}`)).toBeVisible()
        await expectSentTo(page, customer, first.id, customer.email)

        // One more invoice for the customer, dated today.
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(tabUrl(customer.id))
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-invoice').click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customer.id}$`))
        await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '50.00' })
        await postInvoice(page)
        await page.goBack()
        await expect(page).toHaveURL(tabUrl(customer.id))

        // The first statement's PDF reads the ledger as it is now; the stored amount shows.
        await openStatement(page, first)
        await expect(shown(page, 'statement-amount-changed')).toHaveText(
            `The amount due was ${customer.invoiceAmount} when this statement was made.`
        )

        // More → Delete asks first; Cancel keeps the statement.
        await shown(page, 'statement-more').click()
        await shown(page, 'statement-delete').click()
        const confirm = page.getByRole('dialog')
        await expect(confirm.getByText(`Delete statement ${first.number}?`)).toBeVisible()
        await expect(
            confirm.getByText("The customer's balance does not change.", { exact: true })
        ).toBeVisible()
        await confirm.getByRole('button', { name: /^Cancel/ }).click()
        await expect(confirm).toHaveCount(0)
        await expect(page).toHaveURL(statementUrl(first.id))
        expect((await statementsOf(page, customer.id)).map(r => r.id)).toContain(first.id)

        // Delete: the screen pops back to the tab below it (no second tab entry is pushed),
        // with one row left.
        await shown(page, 'statement-more').click()
        await shown(page, 'statement-delete').click()
        await shown(page, 'statement-delete-confirm').click()
        await expect(page).toHaveURL(tabUrl(customer.id))
        await expect.poll(() => shownRowIds(page)).toEqual([second.id])

        // The deleted statement's screen is the forward history entry: it shows Not found.
        await page.goForward()
        await expect(page).toHaveURL(statementUrl(first.id))
        await expect(shown(page, 'statement-not-found')).toContainText(
            'This statement does not exist, or you cannot open it.'
        )

        // Back from there is the tab again. The second from its row menu: the tab is empty,
        // with Create statement.
        await page.goBack()
        await expect(page).toHaveURL(tabUrl(customer.id))
        await shown(page, `statement-row-menu-${second.id}`).click()
        await shown(page, `statement-row-delete-${second.id}`).click()
        await shown(page, 'statement-delete-confirm').click()
        const empty = shown(page, 'customer-statements-empty')
        await expect(empty).toContainText('No statements yet')
        await expect(empty).toContainText('Create a statement to show this customer what it owes.')
        await expect.poll(() => statementsOf(page, customer.id)).toEqual([])
        const create = shown(page, 'customer-statements-empty-new')
        await expect(create).toHaveText('Create statement')
        await create.click()
        await expect(page).toHaveURL(newStatementUrl(customer.id))
    })

    test('a read-only reader on a phone (390 × 844): cards in order, Open and Download PDF only, no write control', async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        const accessRead = page.waitForResponse(response =>
            response.url().includes('/api/collections/books_access/records')
        )
        await openBooks(page, DESKTOP)
        await accessRead

        await openCustomer(page, SEEDED_CUSTOMER)
        await expect(page.getByTestId('customer-new-transaction')).toHaveCount(0)
        await expect(page.getByTestId('customer-new-statement')).toHaveCount(0)
        await page.getByTestId('customer-tab-statements').click()
        await expect(shown(page, 'customer-statements')).toBeVisible()

        // A reader gets no New section at all (newMenuForAccess gives no column without
        // write access), so the sidebar offers no New → Statement: no fold button, no
        // round New button, no Statement action. The sidebar itself is drawn.
        await expect(shown(page, 'books-nav-lists')).toBeVisible()
        await expect(page.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
        await expect(page.getByLabel('New', { exact: true })).toHaveCount(0)
        await expect(page.getByTestId(newActionTestId('statement'))).toHaveCount(0)

        await page.setViewportSize(PHONE)
        const cards = shown(page, 'customer-statements-cards')
        await expect(cards).toBeVisible()

        // Two seeded statements of the same date: the Open items one, made second, first.
        await expect.poll(async () => (await shownRowIds(page)).length).toBe(2)
        const [top, bottom] = await shownRowIds(page)
        await expect(shown(page, `statement-row-${top}`)).toContainText('Open items')
        await expect(shown(page, `statement-row-${bottom}`)).toContainText('Balance forward')

        await expect(page.getByTestId('customer-statements-new')).toHaveCount(0)
        await expect(page.getByTestId('customer-statements-empty-new')).toHaveCount(0)
        await expect(page.getByText('Create statement').filter({ visible: true })).toHaveCount(0)

        // The row menu (a sheet) holds Open and Download PDF only.
        await shown(page, `statement-row-menu-${top}`).click()
        await expect(shown(page, `statement-row-open-${top}`)).toBeVisible()
        await expect(shown(page, `statement-row-download-${top}`)).toBeVisible()
        await expect(page.getByTestId(`statement-row-send-${top}`)).toHaveCount(0)
        await expect(page.getByTestId(`statement-row-delete-${top}`)).toHaveCount(0)

        // Open: the statement with its PDF page, Download PDF, no Send… and no More → Delete.
        await shown(page, `statement-row-open-${top}`).click()
        await expect(page).toHaveURL(statementUrl(top))
        await expect(shown(page, 'statement-pdf')).toBeVisible()
        await expect(shown(page, 'statement-download')).toBeVisible()
        await expect(page.getByTestId('statement-send')).toHaveCount(0)
        await expect(page.getByTestId('statement-more')).toHaveCount(0)
        await expect(page.getByTestId('statement-delete')).toHaveCount(0)
    })
})
