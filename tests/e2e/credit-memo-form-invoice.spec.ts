import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    CREDIT_MEMO_URL,
    createCreditMemoFromInvoice,
    creditMemoIdFromUrl,
    creditMemoLineRowId,
    creditMemoLineRows,
    creditMemoUrlOf,
    NEW_CREDIT_MEMO_URL,
    openCreditMemoBySearch,
    pickCreditMemoCustomer,
} from './credit-memo-helpers'
import { refuseBatchWrite } from './document-batch-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    localToday,
    openInvoiceBySearch,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
    uniqueMemo,
} from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'

// Credit memos from an invoice (credit memo spec §3.2, §3.3, §3.6, §3.10, Q2, Q18, Q20):
// "Create credit memo" (key M) on a posted invoice, the form started from the invoice with
// its link row and "Remove link", the link refusal under the row, and the invoice read
// view's "Credit memos" section. Each test posts its own invoice through the invoice form
// (two lines, a unique memo, the default date) and reads every number from a title; no
// seeded invoice, memo, customer or product is changed, and no setting.
//
// The last test runs at phone size: there "Create credit memo" is a More row and the
// section draws cards, other code than the wide bar and grid. Not driven here: the
// cannot-credit state (unit-tested documentScreenState), the invoice correction's link
// move and customer refusal (Go tests), native keys.

const MONEY = /\$[\d,]+\.\d{2}/
const LINK_REFUSAL = 'Choose a posted invoice of this customer.'

function customerOf(id: string) {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    const line1 = row.billing_address?.line1
    if (!line1) throw new Error(`no billing address for ${id} in the fixture`)
    return { name: row.display_name, line1 }
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

// Harborview: Denver combined as its default tax. Northwind: another active seeded
// customer, with an address of its own.
const HARBORVIEW = customerOf(CUSTOMER_IDS.harborview)
const NORTHWIND = customerOf(CUSTOMER_IDS.northwind)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const PATCH_CABLE = productName(PRODUCT_IDS.patchCable)

// The invoice's two lines, as the form shows them again on the credit memo.
const INVOICE_LINES = [
    { product: ACCESS_POINT, quantity: '2', rate: '100', shownRate: '100.00' },
    { product: PATCH_CABLE, quantity: '3', rate: '15', shownRate: '15.00' },
] as const

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The element of the screen on top: Books keeps an earlier screen mounted and hidden under
// a pushed one.
function shown(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

function invoiceUrlOf(id: string) {
    return new RegExp(`/books/invoices/${id}$`)
}

function fromInvoiceUrlOf(invoiceId: string) {
    return new RegExp(`/books/credit-memos/new\\?(?:[^#]*&)?invoice=${invoiceId}(?:[&#]|$)`)
}

// The section's rows: `invoice-credit-memo-<id>`, never the section's own
// `invoice-credit-memos-…` ids.
function sectionRows(section: Locator) {
    return section.locator('[data-testid^="invoice-credit-memo-"]')
}

async function titleNumber(title: Locator, noun: 'Invoice' | 'Credit memo'): Promise<string> {
    const pattern = new RegExp(`^${noun} (\\d+)$`)
    await expect(title).toHaveText(pattern)
    const number = pattern.exec(await title.innerText())?.[1]
    if (!number) throw new Error(`the ${noun} title has no number`)
    return number
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

// Books must already be open. Posts an invoice of Harborview with the two lines and this
// memo, and leaves the page on its read view.
async function postInvoice(page: Page, memo: string): Promise<{ id: string; number: string }> {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, HARBORVIEW.name)
    for (const [index, line] of INVOICE_LINES.entries()) {
        if (index > 0) await page.getByTestId('form-table-lines-add').click()
        const rowId = await pickLineProduct(page, index, line.product)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill(line.quantity)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(line.rate)
    }
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    const id = invoiceIdFromUrl(page)
    const number = await titleNumber(shown(page, 'invoice-title'), 'Invoice')
    return { id, number }
}

// Posts the open credit memo form with this memo and leaves the page on its read view.
async function postMemo(page: Page, memo: string): Promise<{ id: string; number: string }> {
    await shown(page, 'form-input-memo').fill(memo)
    await shown(page, 'credit-memo-post').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(shown(page, 'credit-memo-read-only')).toBeVisible()
    const number = await titleNumber(shown(page, 'credit-memo-title'), 'Credit memo')
    return { id: creditMemoIdFromUrl(page), number }
}

// Every write of a credit memo create, refused with `body` as the server refuses a field:
// a request of its own, or the memo's operation in a save's batch.
async function refuseMemoCreate(page: Page, body: { message: string; data: object }) {
    await page.route('**/api/collections/books_credit_memos/records*', route =>
        route.request().method() === 'POST'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify(body),
              })
            : route.fallback()
    )
    await refuseBatchWrite(page, 'books_credit_memos', 'POST', body)
}

// A credit memo write the server took: a request of its own, or a batch.
function memoWriteLanded(page: Page) {
    return page.waitForResponse(r => {
        if (r.request().method() === 'GET' || r.status() !== 200) return false
        const path = new URL(r.url()).pathname
        return (
            path.startsWith('/api/collections/books_credit_memos/records') || path === '/api/batch'
        )
    })
}

// Opens an invoice through core's search palette (`/`), void or not: "Invoice <n> · …" or
// "Invoice <n> (void) · …".
async function openAnyInvoiceBySearch(page: Page, memo: string) {
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
    await page
        .getByRole('option')
        .filter({ hasText: /^Invoice \d+( \(void\))? · / })
        .click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(shown(page, 'invoice-read-only')).toBeVisible()
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

test.describe('credit-memo-form: from an invoice', () => {
    test('a credit memo is made from an invoice and both records show it', async ({ page }) => {
        const invoiceMemo = uniqueMemo('Credit memo source invoice')
        const memo = uniqueMemo('Credit memo from invoice')
        await openBooks(page)
        const invoice = await postInvoice(page, invoiceMemo)
        const balanceDue = await shown(page, 'invoice-balance-due').innerText()
        expect(balanceDue).toMatch(MONEY)
        // No memo names the invoice yet: no section.
        await expect(page.getByTestId('invoice-credit-memos')).toHaveCount(0)

        // `m` opens the form started from the invoice, Customer focused.
        await page.keyboard.press('m')
        await expect(page).toHaveURL(fromInvoiceUrlOf(invoice.id))
        await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()
        await expect(customer).toContainText(HARBORVIEW.name)
        await expect(page.getByTestId('credit-memo-bill-to')).toContainText(HARBORVIEW.line1)
        await expect(page.getByTestId('credit-memo-tax')).toContainText('Denver combined')
        await expect(creditMemoLineRows(page)).toHaveCount(INVOICE_LINES.length)
        for (const [index, line] of INVOICE_LINES.entries()) {
            const rowId = await creditMemoLineRowId(page, index)
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
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))
        await expect(page.getByTestId('form-input-message')).toHaveValue('')
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        const link = page.getByTestId('credit-memo-invoice-link')
        await expect(link).toHaveText(`For invoice ${invoice.number}`)

        // Tab order (spec §3.3): Customer → Edit address → Edit customer → the link →
        // Remove link → Credit memo date.
        await tabTo(page, page.getByTestId('credit-memo-edit-address'))
        await tabTo(page, page.getByTestId('credit-memo-edit-customer'))
        await tabTo(page, link)
        await tabTo(page, page.getByTestId('credit-memo-remove-link'))
        await tabTo(page, page.getByTestId('form-input-date'))

        // The second line is not credited: removed from its row menu.
        const second = await creditMemoLineRowId(page, 1)
        await page.getByTestId(`form-table-lines-menu-${second}`).click()
        const remove = page.getByTestId('form-table-lines-menu-remove')
        await remove.click()
        await expect(remove).toHaveCount(0)
        await expect(creditMemoLineRows(page)).toHaveCount(1)

        const posted = await postMemo(page, memo)
        const total = await moneyIn(shown(page, 'credit-memo-total-credit'))
        await expect(shown(page, 'credit-memo-invoice-link')).toHaveText(
            `For invoice ${invoice.number}`
        )

        // The link opens the invoice: its section lists the memo; Balance due is unchanged.
        await shown(page, 'credit-memo-invoice-link').click()
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        const section = shown(page, 'invoice-credit-memos')
        await expect(section).toBeVisible()
        await expect(section).toContainText('Credit memos')
        await expect(sectionRows(section)).toHaveCount(1)
        const row = section.getByTestId(`invoice-credit-memo-${posted.id}`)
        await expect(row).toContainText(posted.number)
        await expect(row).toContainText(formatDay(await localToday(page)))
        await expect(row).toContainText(total)
        await expect(row).toContainText('Unapplied')
        await expect(shown(page, 'invoice-balance-due')).toHaveText(balanceDue)

        // The row's number opens the memo.
        await row.getByText(posted.number, { exact: true }).click()
        await expect(page).toHaveURL(creditMemoUrlOf(posted.id))
        await expect(shown(page, 'credit-memo-read-only')).toBeVisible()

        // A copy drops the link (spec §3.7, Q16).
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/credit-memos/new\\?copy=${posted.id}$`))
        await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
        await expect(page.getByTestId('form-input-customer')).toContainText(HARBORVIEW.name)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)
    })

    test('Remove link and a customer change drop the link', async ({ page }) => {
        const invoiceMemo = uniqueMemo('Credit memo unlink invoice')
        const draftMemo = uniqueMemo('Credit memo unlinked draft')
        const otherMemo = uniqueMemo('Credit memo other customer')
        await openBooks(page)
        const invoice = await postInvoice(page, invoiceMemo)

        await page.keyboard.press('m')
        await expect(page).toHaveURL(fromInvoiceUrlOf(invoice.id))
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
        await page.getByTestId('form-input-memo').fill(draftMemo)

        // The server refuses the link: the text shows under the link row, not in the summary.
        await refuseMemoCreate(page, {
            message: 'Failed to create record.',
            data: { invoice: { code: 'validation_invalid', message: LINK_REFUSAL } },
        })
        await page.getByTestId('credit-memo-save-draft').click()
        await expect(page.getByTestId('credit-memo-invoice-error')).toHaveText(LINK_REFUSAL)
        await expect(
            page.getByTestId('credit-memo-error-summary').filter({ hasText: LINK_REFUSAL })
        ).toHaveCount(0)
        await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveText(
            `For invoice ${invoice.number}`
        )
        await page.unrouteAll({ behavior: 'wait' })

        await page.getByTestId('credit-memo-save-draft').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-title')).toHaveText('Draft credit memo')
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveText(
            `For invoice ${invoice.number}`
        )

        // Remove link: the row goes, and the save stores the memo without it.
        await page.getByTestId('credit-memo-remove-link').click()
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)
        await expect(page.getByTestId('credit-memo-remove-link')).toHaveCount(0)
        const landed = memoWriteLanded(page)
        await page.getByTestId('credit-memo-save-draft').click()
        await landed
        // The stack is entries list → invoice → this draft: Back lands on the invoice, then
        // openEntriesList's one Back lands on the list.
        await shown(page, 'entry-back').click()
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        await expect(page.getByTestId('credit-memo-form')).toHaveCount(0)
        await expect(shown(page, 'invoice-read-only')).toBeVisible()
        await openEntriesList(page)
        await openCreditMemoBySearch(page, draftMemo)
        await expect(shown(page, 'credit-memo-form')).toBeVisible()
        await expect(shown(page, 'form-input-memo')).toHaveValue(draftMemo)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)

        // Another customer: the link goes (the invoice is Harborview's). The reopened form
        // focuses its first input, where `/` would be typed, not open the search palette.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await openInvoiceBySearch(page, invoiceMemo)
        await page.keyboard.press('m')
        await expect(page).toHaveURL(fromInvoiceUrlOf(invoice.id))
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveText(
            `For invoice ${invoice.number}`
        )
        await pickCreditMemoCustomer(page, NORTHWIND.name)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)
        await expect(shown(page, 'credit-memo-bill-to')).toContainText(NORTHWIND.line1)
        await postMemo(page, otherMemo)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)

        // No memo names the invoice: its read view has no section.
        await openInvoiceBySearch(page, invoiceMemo)
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        await expect(page.getByTestId('invoice-credit-memos')).toHaveCount(0)
    })

    test('a void invoice keeps its credit memos', async ({ page, context }) => {
        const invoiceMemo = uniqueMemo('Credit memo void invoice')
        const postedMemo = uniqueMemo('Credit memo of a void invoice')
        const draftMemo = uniqueMemo('Credit memo draft of a void invoice')
        await openBooks(page)
        const invoice = await postInvoice(page, invoiceMemo)

        // A posted memo and a draft memo, both from the invoice.
        await createCreditMemoFromInvoice(page)
        await expect(page).toHaveURL(fromInvoiceUrlOf(invoice.id))
        const posted = await postMemo(page, postedMemo)
        await shown(page, 'credit-memo-invoice-link').click()
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        await createCreditMemoFromInvoice(page)
        await page.getByTestId('form-input-memo').fill(draftMemo)
        await page.getByTestId('credit-memo-save-draft').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-title')).toHaveText('Draft credit memo')
        const draftId = creditMemoIdFromUrl(page)

        // `v` voids the invoice: no Create credit memo; the section still lists both memos.
        await shown(page, 'credit-memo-invoice-link').click()
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        await expect(shown(page, 'invoice-read-only')).toBeVisible()
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Void')
        await expect(page.getByTestId('invoice-read-credit-memo')).toHaveCount(0)
        const section = shown(page, 'invoice-credit-memos')
        await expect(sectionRows(section)).toHaveCount(2)
        await expect(section.getByTestId(`invoice-credit-memo-${posted.id}`)).toContainText(
            posted.number
        )
        // The draft's link itself, not its row: the row's status badge also reads "Draft".
        await expect(section.getByTestId(`invoice-credit-memos-open-${draftId}`)).toHaveText(
            'Draft'
        )

        // The draft's link reads void; Enter on it opens the invoice.
        const voidLink = `For invoice ${invoice.number} (void)`
        await openCreditMemoBySearch(page, draftMemo)
        await expect(page).toHaveURL(creditMemoUrlOf(draftId))
        const draftLink = shown(page, 'credit-memo-invoice-link')
        await expect(draftLink).toHaveText(voidLink)
        await draftLink.focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))

        // The posted memo's link reads void; its correction keeps the link and the number.
        await openCreditMemoBySearch(page, postedMemo)
        await expect(page).toHaveURL(creditMemoUrlOf(posted.id))
        await expect(shown(page, 'credit-memo-invoice-link')).toHaveText(voidLink)
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/credit-memos/new\\?replaces=${posted.id}$`))
        const rowId = await creditMemoLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('90')
        await page.getByTestId('credit-memo-post').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page).not.toHaveURL(creditMemoUrlOf(posted.id))
        await expect(shown(page, 'credit-memo-read-only')).toBeVisible()
        await expect(shown(page, 'credit-memo-title')).toHaveText(`Credit memo ${posted.number}`)
        const correctionId = creditMemoIdFromUrl(page)
        await expect(shown(page, 'credit-memo-invoice-link')).toHaveText(voidLink)

        // The invoice lists the correction and the draft, not the replaced original.
        await shown(page, 'credit-memo-invoice-link').click()
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        const after = shown(page, 'invoice-credit-memos')
        await expect(sectionRows(after)).toHaveCount(2)
        await expect(after.getByTestId(`invoice-credit-memo-${correctionId}`)).toBeVisible()
        await expect(after.getByTestId(`invoice-credit-memo-${draftId}`)).toBeVisible()
        await expect(after.getByTestId(`invoice-credit-memo-${posted.id}`)).toHaveCount(0)

        // A failed read of the section: a fresh page (on this one pbtsdb's grace window
        // serves the held rows with no request), realtime cut before login (lesson 22). The
        // rest of the invoice shows; Retry loads the rows.
        const second = await context.newPage()
        await second.route('**/api/realtime*', route => route.abort())
        await second.route('**/api/collections/books_credit_memos/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(second)
        await openAnyInvoiceBySearch(second, invoiceMemo)
        await expect(second).toHaveURL(invoiceUrlOf(invoice.id))
        await expect(shown(second, 'invoice-title')).toHaveText(`Invoice ${invoice.number}`)
        await expect(shown(second, 'invoice-badge')).toHaveText('Void')
        const failed = shown(second, 'invoice-credit-memos')
        await expect(failed.getByTestId('invoice-credit-memos-error')).toBeVisible()
        await expect(failed.getByTestId('invoice-credit-memos-retry')).toBeVisible()
        await expect(sectionRows(failed)).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.route('**/api/realtime*', route => route.abort())
        await failed.getByTestId('invoice-credit-memos-retry').click()
        await expect(failed.getByTestId('invoice-credit-memos-error')).toHaveCount(0)
        await expect(sectionRows(failed)).toHaveCount(2)
        await expect(failed.getByTestId(`invoice-credit-memo-${correctionId}`)).toBeVisible()
    })

    test('Create credit memo from More, and the section as cards, on a phone', async ({ page }) => {
        const invoiceMemo = uniqueMemo('Credit memo phone invoice')
        const memo = uniqueMemo('Credit memo phone')
        await openBooks(page)
        const invoice = await postInvoice(page, invoiceMemo)
        await page.setViewportSize(PHONE)
        // The phone layout first: the read view's More button.
        await expect(shown(page, 'invoice-read-more')).toBeVisible()

        await shown(page, 'invoice-read-more').click()
        const row = page.getByTestId('invoice-read-credit-memo')
        await expect(row).toBeVisible()
        // The shared More row draws a plain-letter key in lower case.
        await expect(row).toContainText(/Create credit memo\s*m$/)
        await row.click()
        await expect(page).toHaveURL(fromInvoiceUrlOf(invoice.id))
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
        await expect(page.getByTestId('form-table-lines-cards')).toBeVisible()
        await expect(creditMemoLineRows(page)).toHaveCount(INVOICE_LINES.length)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveText(
            `For invoice ${invoice.number}`
        )
        const posted = await postMemo(page, memo)
        const total = await moneyIn(shown(page, 'credit-memo-total-credit'))

        await openInvoiceBySearch(page, invoiceMemo)
        await expect(page).toHaveURL(invoiceUrlOf(invoice.id))
        const cards = shown(page, 'invoice-credit-memos-cards')
        await expect(cards).toBeVisible()
        await expect(
            page.locator('[data-testid="invoice-credit-memos-table"]:visible')
        ).toHaveCount(0)
        const card = cards.getByTestId(`invoice-credit-memo-${posted.id}`)
        await expect(card).toContainText(posted.number)
        await expect(card).toContainText(formatDay(await localToday(page)))
        await expect(card).toContainText(total)
        await expect(card).toContainText('Unapplied')

        // No sideways scroll: no scroller around the section is wider than its view.
        await expect
            .poll(() =>
                cards.evaluate(element => {
                    for (let node: Element | null = element; node; node = node.parentElement) {
                        const overflow = getComputedStyle(node).overflowX
                        const scrolls = overflow === 'auto' || overflow === 'scroll'
                        if (scrolls && node.scrollWidth > node.clientWidth) return false
                    }
                    const root = document.scrollingElement
                    return !root || root.scrollWidth <= root.clientWidth
                })
            )
            .toBe(true)
    })
})
