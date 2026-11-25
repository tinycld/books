import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    CREDIT_MEMO_URL,
    creditMemoIdFromUrl,
    pickCreditMemoLineProduct,
} from './credit-memo-helpers'
import { createCustomer, customerPath, PHONE, uniqueName } from './customer-form-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import { nonTaxableService } from './receive-payment-helpers'
import { expectRecordUrl, recordIdFromUrl } from './record-key-helpers'
import {
    NEW_REFUND_RECEIPT_URL,
    openNewRefundReceipt,
    pickRefundCustomer,
    pickRefundLineProduct,
    postRefundReceipt,
    REFUND_RECEIPT_URL,
    refundLineRowId,
    refundReceiptIdFromUrl,
    saveRefundDraft,
    searchToRefundReceipt,
    visibleTestId,
} from './refund-receipt-helpers'
import {
    openRowMenu,
    openSales,
    openSalesTab,
    rowMenuActions,
    salesRow,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'

// Refund receipts elsewhere in Books (refund receipt spec §3.13, checkpoint 5): the Sales
// lists' Refund receipts tab and All sales, a customer page's Refunds chip, Open figure and
// New transaction menu, a credit memo's Refunded status after its credit is paid out, the
// Journal Entries list's Open and Edit, and the search palette's refund hit by reference
// no. Every refund and credit memo is made by driving its form with a unique memo and
// today's date; posted numbers are read from the titles. No seeded record is changed.
//
// Desktop, but for one phone test: the Sales tab's cards and the customer page's cards are
// the shared list and tab code, which the sales-lists and customer-pages specs drive at phone
// size. Only the refund's card draws an amount with a sign in front, which a long title must
// not wrap onto two lines (gate 2 of checkpoint 5), so that one card is checked at phone size.
//
// The posted row menu is the sales receipt's (sales lists design §Row menu: the read view's
// actions without Edit), so it holds Open, Void, Copy, View journal entry and Download PDF.

const MINUS = '−'
const ROW_ID = /^customer-transaction-([a-z0-9]{15})$/

function customerName(id: string) {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return row.display_name
}

const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// A figure in cents: "1,000.00" → 100000; "-250.00", "−250.00" and "(250.00)" negative;
// 0 for an empty cell.
function cents(text: string | undefined): number {
    const value = (text ?? '').trim()
    if (value === '') return 0
    const isNegative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value.replace(/[^0-9.]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`not an amount: "${text}"`)
    const [whole, fraction = ''] = digits.split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return isNegative ? -amount : amount
}

// The open customer page's Open figure, in cents.
async function openCents(page: Page): Promise<number> {
    return cents(await page.getByTestId('customer-balance-open').innerText())
}

function customerIdOfPage(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`customer-transaction-${id}`)
}

// The ids of the tab's rows, in screen order, in one snapshot.
function transactionIds(page: Page) {
    return page
        .getByTestId('customer-transactions')
        .locator('[data-testid^="customer-transaction-"]')
        .evaluateAll((els, pattern) => {
            const ids: string[] = []
            for (const el of els) {
                const match = new RegExp(pattern).exec(el.getAttribute('data-testid') ?? '')
                if (match?.[1] && !ids.includes(match[1])) ids.push(match[1])
            }
            return ids
        }, ROW_ID.source)
}

// A table row's cells keyed by their column heading, in one snapshot.
function rowCells(page: Page, id: string): Promise<Record<string, string>> {
    return page.getByTestId('customer-transactions').evaluate((root, rowId) => {
        const header = root.querySelector('[data-testid="customer-transactions-header"]')
        const row = root.querySelector(`[data-testid="customer-transaction-${rowId}"]`)
        const out: Record<string, string> = {}
        const titles = [...(header?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        const cells = [...(row?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        titles.forEach((title, index) => {
            out[title] = cells[index] ?? ''
        })
        return out
    }, id)
}

async function openTransactionsTab(page: Page) {
    const tab = page.getByTestId('customer-tab-transactions')
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

// Back from a document to the customer page kept under it, on its Transactions tab. The
// customers list is never opened from a document screen: the customers route under the
// document still holds a hidden list, and opening the list again stacks a second one.
async function backToCustomerTransactions(page: Page, customerId: string) {
    for (let step = 0; step < 4; step++) {
        if (customerPath(customerId).test(new URL(page.url()).pathname)) break
        await page.goBack()
    }
    await expect(page).toHaveURL(customerPath(customerId))
    await openTransactionsTab(page)
}

// From the open customer page, the header's New transaction menu → one item.
async function startTransaction(page: Page, item: string, path: string, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId(item).click()
    await expect(page).toHaveURL(new RegExp(`/books/${path}/new\\?customer=${customerId}$`))
}

async function titleNumber(page: Page, testId: string, noun: string): Promise<string> {
    const title = visibleTestId(page, testId)
    const pattern = new RegExp(`^${noun} (\\d+)$`)
    await expect(title).toHaveText(pattern)
    const number = pattern.exec(await title.innerText())?.[1]
    if (!number) throw new Error(`the ${noun} title has no number`)
    return number
}

// Posts the open refund form with this memo; leaves the page on its read view.
async function postOpenRefund(page: Page, memo: string) {
    await visibleTestId(page, 'form-input-memo').fill(memo)
    await visibleTestId(page, 'refund-receipt-post').click()
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
    await expect(visibleTestId(page, 'refund-receipt-read-only')).toBeVisible()
    const number = await titleNumber(page, 'refund-receipt-title', 'Refund receipt')
    return { id: await refundReceiptIdFromUrl(page), number }
}

// The journal entry read view's lines' names, in one snapshot.
function entryLineNames(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) =>
            (root.querySelector(`[data-testid="entry-line-party-${i}"]`)?.textContent ?? '').trim()
        )
    })
}

// How the text of an element draws: the number of line boxes its text takes, and whether
// the element clips its text (an ellipsis or a cut).
function textLayout(locator: Locator) {
    return locator.evaluate(el => {
        const range = document.createRange()
        range.selectNodeContents(el)
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
        const lines = new Set(rects.map(rect => Math.round(rect.top))).size
        return { lines, clipped: el.scrollWidth > el.clientWidth }
    })
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function entryIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'entries')
}

test.describe('refund-receipt-form: elsewhere', () => {
    test('refund receipts in the Sales lists', async ({ page }) => {
        const base = uniqueMemo('Refund list')
        const postedMemo = `${base} posted`
        const draftMemo = `${base} draft`
        await openBooks(page)
        const today = await localToday(page)
        const service = nonTaxableService()

        const posted = await postRefundReceipt(page, {
            customer: HARBORVIEW,
            product: service,
            rate: '150',
            memo: postedMemo,
        })
        const draftId = await saveRefundDraft(page, {
            customer: HARBORVIEW,
            product: service,
            rate: '150',
            memo: draftMemo,
        })

        // The Refund receipts tab, right after Credit memos.
        await openSales(page)
        const tabIds = await page
            .locator('[data-testid^="sales-tab-"]:visible')
            .evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
        expect(tabIds.indexOf('sales-tab-refund-receipts')).toBe(
            tabIds.indexOf('sales-tab-credit-memos') + 1
        )
        await openSalesTab(page, 'refund-receipts')
        await searchSales(page, base)

        // The posted row: today's date, its number, the customer, the signed amount, Refunded.
        const row = salesRow(page, posted.id)
        await expect(row).toBeVisible()
        await expect(row).toContainText(formatDay(today))
        await expect(row).toContainText(posted.number)
        await expect(row).toContainText(HARBORVIEW)
        await expect(row).toContainText(`${MINUS}$150.00`)
        await expect(visible(page, `sales-status-${posted.id}`)).toHaveText('Refunded')
        await expect(visible(page, `sales-status-${draftId}`)).toHaveText('Draft')

        // All sales lists both.
        await openSalesTab(page, 'all')
        await searchSales(page, base)
        await expect(salesRow(page, posted.id)).toBeVisible()
        await expect(salesRow(page, draftId)).toBeVisible()
        await expect(visible(page, `sales-status-${posted.id}`)).toHaveText('Refunded')

        // The posted row's menu is the sales receipt's; Void turns the chip to Void.
        await openSalesTab(page, 'refund-receipts')
        await searchSales(page, base)
        await openRowMenu(page, posted.id)
        await expect
            .poll(() => rowMenuActions(page))
            .toEqual(['open', 'send', 'void', 'copy', 'entry', 'pdf'])
        await visible(page, 'sales-row-action-void').click()
        await expect(visible(page, 'void-dialog')).toBeVisible()
        await visible(page, 'void-confirm').click()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(visible(page, `sales-status-${posted.id}`)).toHaveText('Void')

        // The draft's menu: Open and Delete draft; Delete draft removes the row.
        await openRowMenu(page, draftId)
        await expect.poll(() => rowMenuActions(page)).toEqual(['open', 'delete-draft'])
        await visible(page, 'sales-row-action-delete-draft').click()
        await expect(visible(page, 'sales-delete-dialog')).toBeVisible()
        await visible(page, 'sales-delete-confirm').click()
        await expect(page.getByTestId('sales-delete-dialog')).toHaveCount(0)
        await expect(salesRow(page, draftId)).toHaveCount(0)
        await expect(salesRow(page, posted.id)).toBeVisible()

        // The tab's New opens a new refund receipt.
        await expect(page).toHaveURL(salesTabUrl('refund-receipts'))
        const newButton = visible(page, 'sales-new')
        await expect(newButton).toHaveText('New refund receipt')
        await newButton.click()
        await expect(page).toHaveURL(NEW_REFUND_RECEIPT_URL)
        await expect(visibleTestId(page, 'refund-receipt-title')).toHaveText('New refund receipt')
    })

    test('phone: a refund card with a long customer name keeps its amount on one line', async ({
        page,
    }) => {
        await openBooks(page)
        const name = uniqueName('Refund card Rocky Mountain Regional Medical Partners')
        await createCustomer(page, { name })
        const memo = uniqueMemo('Refund card')
        const refund = await postRefundReceipt(page, {
            customer: name,
            product: nonTaxableService(),
            rate: '1250',
            memo,
        })

        await openSales(page)
        await openSalesTab(page, 'refund-receipts')
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'sales-cards')).toBeVisible()
        await searchSales(page, memo)
        const card = salesRow(page, refund.id)
        await expect(card).toBeVisible()
        await expect(card).toContainText(name.slice(0, 20))

        // The sign and the figure draw as one value on one line, in full; the title truncates.
        const amount = card.getByText(`${MINUS}$1,250.00`, { exact: true })
        await expect(amount).toBeVisible()
        await expect.poll(() => textLayout(amount)).toEqual({ lines: 1, clipped: false })
    })

    test('refunds and a refunded credit memo on the customer page', async ({ page }) => {
        await openBooks(page)
        const name = uniqueName('Refund page')
        await createCustomer(page, { name })
        const customerId = customerIdOfPage(page)
        await openTransactionsTab(page)
        const openBefore = await openCents(page)

        // A posted credit memo of 100.00, from the New transaction menu.
        await startTransaction(page, 'customer-new-credit-memo', 'credit-memos', customerId)
        const memoRow = await pickCreditMemoLineProduct(page, 0, nonTaxableService())
        await page.getByTestId(lineCellTestId(memoRow, 'rate')).fill('100.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Refund page memo'))
        await page.getByTestId('credit-memo-post').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
        const memoId = await creditMemoIdFromUrl(page)

        // A plain refund of 30.00, from the New transaction menu: the customer is filled.
        await backToCustomerTransactions(page, customerId)
        const openWithMemo = await openCents(page)
        expect(openWithMemo).toBe(openBefore - 10_000)
        await startTransaction(page, 'customer-new-refund-receipt', 'refund-receipts', customerId)
        await expect(page.getByTestId('form-input-customer')).toContainText(name)
        const plainRow = await pickRefundLineProduct(page, 0, nonTaxableService())
        await page.getByTestId(lineCellTestId(plainRow, 'rate')).fill('30.00')
        const plain = await postOpenRefund(page, uniqueMemo('Refund page plain'))

        // Open is unchanged by the plain refund; the memo reads Unapplied.
        await backToCustomerTransactions(page, customerId)
        await expect.poll(() => openCents(page)).toBe(openWithMemo)
        await expect.poll(async () => (await rowCells(page, memoId)).Status).toBe('Unapplied')

        // The Refunds chip, after Credit memos: the refund's type, signed total and status.
        const chips = await page
            .locator('[data-testid^="customer-transactions-filter-"]')
            .evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
        expect(chips.indexOf('customer-transactions-filter-refund-receipt')).toBe(
            chips.indexOf('customer-transactions-filter-credit-memo') + 1
        )
        const chip = page.getByTestId('customer-transactions-filter-refund-receipt')
        await expect(chip).toHaveText('Refunds')
        await chip.click()
        await expect(chip).toHaveAttribute('aria-pressed', 'true')
        await expect.poll(() => transactionIds(page)).toEqual([plain.id])
        await expect
            .poll(async () => {
                const cells = await rowCells(page, plain.id)
                return { type: cells.Type, total: cents(cells.Total), status: cells.Status }
            })
            .toEqual({ type: 'Refund receipt', total: -3_000, status: 'Refunded' })
        await expect(page.getByTestId(`customer-transaction-${plain.id}`)).toContainText(
            `${MINUS}$30.00`
        )
        await transaction(page, plain.id).click()
        await expectRecordUrl(page, 'refund-receipts', plain.id)
        await expect(visibleTestId(page, 'refund-receipt-read-only')).toBeVisible()

        // A payout of 40.00 (Refund credit): Open rises by 40.00; the memo stays Unapplied.
        // The page kept under the refund still has the Refunds chip pressed: back to All.
        await backToCustomerTransactions(page, customerId)
        const allChip = page.getByTestId('customer-transactions-filter-all')
        await allChip.click()
        await expect(allChip).toHaveAttribute('aria-pressed', 'true')
        await transaction(page, memoId).click()
        await expectRecordUrl(page, 'credit-memos', memoId)
        await visibleTestId(page, 'credit-memo-read-refund-credit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/refund-receipts/new\\?(?:[^#]*&)?credit_memo=${memoId}(?:[&#]|$)`)
        )
        const partRow = await refundLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(partRow, 'rate')).fill('40.00')
        await postOpenRefund(page, uniqueMemo('Refund page part'))
        await backToCustomerTransactions(page, customerId)
        await expect.poll(() => openCents(page)).toBe(openWithMemo + 4_000)
        await expect.poll(async () => (await rowCells(page, memoId)).Status).toBe('Unapplied')

        // A payout of the rest, 60.00: the memo reads Refunded and Open is back.
        await transaction(page, memoId).click()
        await expectRecordUrl(page, 'credit-memos', memoId)
        await visibleTestId(page, 'credit-memo-read-refund-credit').click()
        await expect(page).toHaveURL(NEW_REFUND_RECEIPT_URL)
        const restRow = await refundLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(restRow, 'rate')).fill('60.00')
        await postOpenRefund(page, uniqueMemo('Refund page rest'))
        await backToCustomerTransactions(page, customerId)
        await expect.poll(() => openCents(page)).toBe(openBefore)
        await expect.poll(async () => (await rowCells(page, memoId)).Status).toBe('Refunded')
    })

    test('a refund in the journal entries list and in search', async ({ page }) => {
        const memo = uniqueMemo('Refund entries')
        // A reference no. no other record holds, so the palette's hit is this refund's.
        const reference = `RR${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
        await openBooks(page)
        await openNewRefundReceipt(page)
        await pickRefundCustomer(page, HARBORVIEW)
        const rowId = await pickRefundLineProduct(page, 0, nonTaxableService())
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('80.00')
        await page.getByTestId('form-input-reference_no').fill(reference)
        const { id, number } = await postOpenRefund(page, memo)

        // J: the journal entry, whose lines name the customer.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entryId = await entryIdFromUrl(page)
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect
            .poll(async () => [...new Set(await entryLineNames(page))])
            .toEqual([HARBORVIEW])

        // The Journal Entries list: Type and number; Open and Edit, no Reverse.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Refund receipt')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-edit')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'refund-receipts', id)
        await expect(visibleTestId(page, 'refund-receipt-read-only')).toBeVisible()

        await openEntriesList(page)
        await searchEntries(page, memo)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(new RegExp(`/books/refund-receipts/new\\?replaces=${id}$`))
        await expect(page.getByTestId('refund-receipt-title')).toHaveText(`Edit ${number}`)
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(/\/books\/refund-receipts\/new/)

        // The search palette finds the refund by its reference no.
        const title = `Refund receipt ${number} · ${HARBORVIEW}`
        await searchToRefundReceipt(page, reference, new RegExp(`^${escapeRegExp(title)}`))
        await expectRecordUrl(page, 'refund-receipts', id)
        await expect(visibleTestId(page, 'refund-receipt-read-only')).toBeVisible()
    })
})
