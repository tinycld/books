import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { PHONE } from './account-register-helpers'
import {
    CREDIT_MEMO_URL,
    creditMemoIdFromUrl,
    creditMemoLineRowId,
    creditMemoUrlOf,
    NEW_CREDIT_MEMO_URL,
    openNewCreditMemo,
    pickCreditMemoCustomer,
    pickCreditMemoLineProduct,
    postCreditMemo,
    saveCreditMemoDraft,
    searchToCreditMemo,
} from './credit-memo-helpers'
import { batchWriteIndex } from './document-batch-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import { isDisabled } from './record-form-helpers'

// The credit memo form and its read view (credit memo spec §3.2–§3.9). Every memo is
// made by driving the form with a unique memo text and the default date (today, after the
// close date books-settings.spec.ts holds); memos are found again through the URL a save
// lands on or by search (core's palette opens with `/`). No seeded memo, customer,
// product or account is changed; the Numbering card is only read.
//
// The void-and-copy test runs at phone size only: the lines draw as cards and the read
// view's and the form's actions sit in More menus (Sheets), other code than the wide bars.
// Not driven here: the reader's read view, the loading, not-found, cannot-edit and
// no-access states (unit-tested documentReadActions / documentScreenState), native keys.

const MONEY = /-?\$[\d,]+\.\d{2}/
const VOID_BODY = 'A reversing entry is posted in the original period. The number is kept.'
const NEED_ITEM_LINE = 'Add at least one product or service line'
const HELD_REFUSAL = 'The date is on or before the close date.'

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

// Harborview: Denver combined as its default tax. Wireless access point: a taxable
// seeded product.
const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

// The signed amount of a totals row in cents; a minus is "-" or "−" (U+2212).
async function centsIn(locator: Locator): Promise<number> {
    const match = /([-−]?)\$([\d,]+)\.(\d{2})/.exec(await locator.innerText())
    if (!match) throw new Error('no amount in the element')
    const cents = Number(match[2].replaceAll(',', '')) * 100 + Number(match[3])
    return match[1] ? -cents : cents
}

async function memoNumber(page: Page): Promise<string> {
    const title = page.getByTestId('credit-memo-title')
    await expect(title).toHaveText(/^Credit memo \d+$/)
    const number = /^Credit memo (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

function entryIdFromUrl(page: Page): string {
    const match = /\/books\/entries\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id) throw new Error(`Not on a journal entry: ${page.url()}`)
    return id
}

// The entry read view's lines, in one snapshot: account label, debit, credit and name.
function readEntryLines(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const text = (id: string) =>
            (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) => ({
            account: text(`entry-line-account-${i}`),
            debit: text(`entry-line-debit-${i}`),
            credit: text(`entry-line-credit-${i}`),
            name: text(`entry-line-party-${i}`),
        }))
    })
}

// Every write of this memo the page sends, held until `release`: a request of its own,
// or a batch with an operation on books_credit_memos. Each is then refused with
// `message`, as the server answers a refused write.
async function holdMemoWrites(page: Page, message: string) {
    let release = () => {}
    const released = new Promise<void>(resolve => {
        release = resolve
    })
    let reached = () => {}
    const held = new Promise<void>(resolve => {
        reached = resolve
    })
    await page.route('**/api/**', async route => {
        const request = route.request()
        if (request.method() === 'GET') return route.fallback()
        const path = new URL(request.url()).pathname
        const isMemoWrite =
            /^\/api\/collections\/books_credit_memos\/records/.test(path) ||
            batchWriteIndex(request, 'books_credit_memos', 'POST') >= 0 ||
            batchWriteIndex(request, 'books_credit_memos', 'PATCH') >= 0
        if (!isMemoWrite) return route.fallback()
        reached()
        await released
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message, data: {} }),
        })
    })
    return { held, release: () => release() }
}

test.describe('credit-memo-form: form and read view', () => {
    test('a posted credit memo is edited, keeps its number, and its entry credits Accounts receivable', async ({
        page,
    }) => {
        const memo = uniqueMemo('Credit memo correction')
        await openBooks(page)
        const { id, number } = await postCreditMemo(page, {
            customer: HARBORVIEW,
            product: ACCESS_POINT,
            qty: '1',
            rate: '100',
            memo,
        })
        await expect(page.getByTestId('credit-memo-total-tax')).toContainText('Denver combined')

        // The read view's tax row shows the memo's own tax, positive, as the invoice's
        // does: Total − Subtotal.
        await expect(page.getByTestId('credit-memo-total-subtotal')).toContainText('$100.00')
        const readTax = await centsIn(page.getByTestId('credit-memo-total-tax'))
        const readSubtotal = await centsIn(page.getByTestId('credit-memo-total-subtotal'))
        const readTotal = await centsIn(page.getByTestId('credit-memo-total'))
        expect(readTax).toBeGreaterThan(0)
        expect(readTax).toBe(readTotal - readSubtotal)

        // ⌥2: the PDF tab shows the stored memo's PDF.
        const pdf = page.waitForResponse(r =>
            new URL(r.url()).pathname.endsWith(`/api/books/pdf/credit_memo/${id}`)
        )
        await page.keyboard.press('Alt+2')
        const answer = await pdf
        expect(answer.status()).toBe(200)
        expect((await answer.body()).toString('latin1')).toMatch(/\/Type\s*\/Page(?!s)/)
        await expect(page.getByTestId('credit-memo-pdf')).toBeVisible()
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()

        // `e` opens the correction with Customer focused.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/credit-memos/new\\?replaces=${id}$`))
        await expect(page.getByTestId('credit-memo-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        const rowId = await creditMemoLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('120')
        await page.getByTestId('credit-memo-post').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page).not.toHaveURL(creditMemoUrlOf(id))
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
        await expect(page.getByTestId('credit-memo-title')).toHaveText(`Credit memo ${number}`)
        await expect(page.getByTestId('credit-memo-total-subtotal')).toContainText('$120.00')
        const correctionId = creditMemoIdFromUrl(page)
        const total = await moneyIn(page.getByTestId('credit-memo-total'))

        // `j`: the entry credits Accounts receivable for the total and debits income and
        // each tax component ("Denver combined" has three: one income and three tax debit
        // lines); every line names the customer.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entryId = entryIdFromUrl(page)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Credit memo')
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                const receivable = lines.filter(l => /Accounts receivable$/.test(l.account))
                return {
                    receivableCredits: receivable.map(l => l.credit),
                    receivableDebits: receivable.map(l => l.debit).filter(d => d !== ''),
                    debitLines: lines.filter(l => l.debit !== '').length,
                    names: [...new Set(lines.map(l => l.name))],
                }
            })
            .toEqual({
                receivableCredits: [total],
                receivableDebits: [],
                debitLines: 4,
                names: [HARBORVIEW],
            })
        await expect(page.getByTestId('entry-edit')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(0)

        // The Journal Entries list: Type and number, no Reverse, Open goes to the memo.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Credit memo')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(creditMemoUrlOf(correctionId))
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()

        // The original is void and names its correction.
        await searchToCreditMemo(page, memo, /^Credit memo \d+ \(void\) · /)
        await expect(page).toHaveURL(creditMemoUrlOf(id))
        // The correction's read view stays mounted under the pushed original.
        await expect(page.locator('[data-testid="credit-memo-badge"]:visible')).toHaveText('Void')
        await expect(page.getByTestId('credit-memo-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )

        // Settings → Numbering (read only): the credit memo's card.
        await page.locator('[data-testid="books-nav-settings"]:visible').click()
        await expect(page).toHaveURL(/\/books\/settings$/)
        await page.locator('[data-testid="books-settings-section-numbering"]:visible').click()
        await expect(page).toHaveURL(/\/books\/settings\/numbering$/)
        // The card's title sits in the SectionCard around the sequence's view.
        await expect(
            page.locator('[data-testid="books-settings-seq-credit_memo"]:visible').locator('..')
        ).toContainText('Credit memos')
    })

    test('refusals show under their fields and a held Post keeps the form', async ({ page }) => {
        await openBooks(page)
        await openNewCreditMemo(page)
        const save = page.getByTestId('credit-memo-save-draft')
        const post = page.getByTestId('credit-memo-post')

        // ⌥2 before a save: the PDF tab asks for a draft.
        await page.getByTestId('credit-memo-title').click()
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('credit-memo-pdf-unsaved')).toContainText(
            'Save a draft to see the PDF'
        )
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()

        // No customer: the refusal is under Customer; with field errors only, the
        // summary draws nothing.
        await post.click()
        await expect(page.getByTestId('form-field-customer-error')).toHaveText(
            'Customer is required'
        )
        const summary = page.getByTestId('credit-memo-error-summary')
        await expect(summary).toHaveCount(0)
        await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)

        // A customer and a Description line alone: Post's item-line rule shows under the
        // lines, not in the summary.
        await pickCreditMemoCustomer(page, HARBORVIEW)
        await page.getByTestId('form-table-lines-add-more').click()
        await page.getByTestId('form-table-lines-add-description').click()
        const descriptionRow = await creditMemoLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(descriptionRow, 'description')).fill('Returned goods')
        await post.click()
        await expect(page.getByTestId('form-field-lines-error')).toHaveText(NEED_ITEM_LINE)
        await expect(page.getByTestId('form-field-customer-error')).toHaveCount(0)
        await expect(summary).toHaveCount(0)
        await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)

        await page.getByTestId('form-table-lines-add').click()
        const rowId = await pickCreditMemoLineProduct(page, 1, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Credit memo held post'))

        // The post's write is held: the form stays, its actions disabled.
        const hold = await holdMemoWrites(page, HELD_REFUSAL)
        await post.click()
        await hold.held
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
        await expect.poll(() => isDisabled(save)).toBe(true)
        await expect.poll(() => isDisabled(post)).toBe(true)
        hold.release()

        await expect(summary).toContainText(HELD_REFUSAL)
        await expect(page.getByTestId('credit-memo-title')).toHaveText(/^(New|Draft) credit memo$/)
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await page.unrouteAll({ behavior: 'wait' })

        // Offline: Save draft and Post are disabled; back online, both are enabled.
        await page.context().setOffline(true)
        await expect.poll(() => isDisabled(save)).toBe(true)
        await expect.poll(() => isDisabled(post)).toBe(true)
        await page.context().setOffline(false)
        await expect.poll(() => isDisabled(save)).toBe(false)
        await expect.poll(() => isDisabled(post)).toBe(false)
    })

    // A fresh page per failing read: on a page that already showed the memo, pbtsdb's
    // grace window serves the held rows with no request, so the routed failure never
    // happens. Realtime is cut before login (lesson 22) on each page. Each route goes in
    // before openBooks: the rail opens Books at the context's last Books screen.
    test('a load failure shows Retry, and Retry loads the draft', async ({ context }) => {
        const memo = uniqueMemo('Credit memo retry')
        const first = await context.newPage()
        await first.route('**/api/realtime*', route => route.abort())
        await openBooks(first)
        const id = await saveCreditMemoDraft(first, {
            customer: HARBORVIEW,
            product: ACCESS_POINT,
            memo,
        })
        await openEntriesList(first)

        // The memo's own read fails.
        const second = await context.newPage()
        await second.route('**/api/realtime*', route => route.abort())
        await second.route('**/api/collections/books_credit_memos/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(second)
        await searchToCreditMemo(second, memo)
        await expect(second).toHaveURL(creditMemoUrlOf(id))
        await expect(second.getByTestId('credit-memo-error')).toContainText(
            'Books could not load this credit memo.'
        )
        await expect(second.getByTestId('credit-memo-retry')).toBeVisible()
        await expect(second.getByTestId('credit-memo-form')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.route('**/api/realtime*', route => route.abort())
        await second.getByTestId('credit-memo-retry').click()
        await expect(second.getByTestId('credit-memo-form')).toBeVisible()
        await expect(second.getByTestId('form-input-memo')).toHaveValue(memo)

        // The lines' read fails: the same error and Retry (lesson 14).
        const third = await context.newPage()
        await third.route('**/api/realtime*', route => route.abort())
        await third.route('**/api/collections/books_credit_memo_lines/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(third)
        await searchToCreditMemo(third, memo)
        await expect(third).toHaveURL(creditMemoUrlOf(id))
        await expect(third.getByTestId('credit-memo-error')).toContainText(
            'Books could not load this credit memo.'
        )
        await expect(third.getByTestId('credit-memo-form')).toHaveCount(0)
        await third.unrouteAll({ behavior: 'wait' })
        await third.route('**/api/realtime*', route => route.abort())
        await third.getByTestId('credit-memo-retry').click()
        await expect(third.getByTestId('credit-memo-form')).toBeVisible()
        const line = await creditMemoLineRowId(third, 0)
        await expect(third.getByTestId(lineCellTestId(line, 'product'))).toContainText(ACCESS_POINT)

        // An unsaved edit: the PDF tab shows the last saved version.
        const memoInput = third.getByTestId('form-input-memo')
        await memoInput.fill(`${memo} edited`)
        await third.getByTestId('credit-memo-title').click()
        await third.keyboard.press('Alt+2')
        await expect(third.getByTestId('credit-memo-pdf-stale')).toHaveText(
            'Shows the last saved version'
        )
        await third.keyboard.press('Alt+1')
        await expect(third.getByTestId('credit-memo-form')).toBeVisible()

        // ⌘⌫ deletes the draft; a search finds no credit memo for its memo text.
        await third.getByTestId('credit-memo-title').click()
        await third.keyboard.press('ControlOrMeta+Backspace')
        await expect(third.getByTestId('delete-draft-dialog')).toBeVisible()
        await third.getByTestId('delete-draft-confirm').click()
        await expect(third).not.toHaveURL(creditMemoUrlOf(id))
        await expect(third.getByTestId('credit-memo-form')).toHaveCount(0)

        await third.keyboard.press('/')
        const input = third.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
        await expect(input).toBeFocused()
        const searched = third.waitForResponse(
            r =>
                r.url().includes('/api/search') &&
                r.status() === 200 &&
                new URL(r.url()).searchParams.get('q') === memo
        )
        await third.keyboard.type(memo)
        await searched
        await expect(third.getByRole('option').filter({ hasText: /credit memo/i })).toHaveCount(0)
    })

    test('a posted credit memo is voided and copied from More on a phone', async ({ page }) => {
        const memo = uniqueMemo('Credit memo void copy')
        const message = `Credit for returned goods ${memo}`
        await openBooks(page)
        await page.setViewportSize(PHONE)
        // The phone layout first: core's FAB, which the wide layout does not draw.
        await expect(page.getByLabel('New', { exact: true })).toBeVisible()

        await openNewCreditMemo(page)
        await pickCreditMemoCustomer(page, HARBORVIEW)
        await pickCreditMemoLineProduct(page, 0, ACCESS_POINT)
        const postedLine = await creditMemoLineRowId(page, 0)
        // The phone form draws the lines as cards.
        await expect(page.getByTestId('form-table-lines-cards')).toBeVisible()
        await page.getByTestId('form-input-message').fill(message)
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('credit-memo-post').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-read-more')).toBeVisible()
        const id = creditMemoIdFromUrl(page)
        const number = await memoNumber(page)

        // The read lines draw as cards ("1 · <product>", "<qty> × <rate>"), not the grid
        // with its column header.
        const readLines = page.getByTestId('credit-memo-lines')
        const card = readLines.getByTestId(`credit-memo-line-${postedLine}`)
        await expect(card).toContainText(`1 · ${ACCESS_POINT}`)
        await expect(card).toContainText(/\b1 × \$[\d,]+\.\d{2}/)
        await expect(readLines.getByText('Product or service', { exact: true })).toHaveCount(0)

        await page.getByTestId('credit-memo-read-more').click()
        await page.getByTestId('credit-memo-read-void').click()
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(number)
        await expect(dialog).toContainText(VOID_BODY)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('credit-memo-badge')).toHaveText('Void')
        await expect(page.getByTestId('credit-memo-voided-by')).toBeVisible()

        await expect(page.getByTestId('credit-memo-read-more')).toBeVisible()
        await page.getByTestId('credit-memo-read-more').click()
        await expect(page.getByTestId('credit-memo-read-void')).toHaveCount(0)
        await page.getByTestId('credit-memo-read-copy').click()
        await expect(page).toHaveURL(new RegExp(`/books/credit-memos/new\\?copy=${id}$`))
        await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
        await expect(page.getByTestId('form-input-customer')).toContainText(HARBORVIEW)
        const rowId = await creditMemoLineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await expect(page.getByTestId('form-input-message')).toHaveValue(message)
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)

        // The phone action bar: Cancel, Save draft, Post and More on one row; More holds
        // Post & new and Download PDF.
        const bar = ['cancel', 'save-draft', 'post', 'more'].map(action =>
            page.getByTestId(`credit-memo-${action}`)
        )
        for (const button of bar) await expect(button).toBeVisible()
        // One row: the buttons differ in height, so their vertical centers are compared.
        await expect
            .poll(async () => {
                const centers = await Promise.all(
                    bar.map(async button => {
                        const box = await button.boundingBox()
                        return box ? box.y + box.height / 2 : Number.NaN
                    })
                )
                return Math.max(...centers) - Math.min(...centers) <= 2
            })
            .toBe(true)
        await expect(page.getByTestId('credit-memo-post-new')).toHaveCount(0)
        await page.getByTestId('credit-memo-more').click()
        await expect(page.getByTestId('credit-memo-post-new')).toBeVisible()
        await expect(page.getByTestId('credit-memo-download-pdf')).toBeVisible()
    })
})
