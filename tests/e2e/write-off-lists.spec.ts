import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { salesTabOf } from '../../tinycld/books/lib/sales-lists'
import { DESKTOP, PHONE } from './account-register-helpers'
import { createCustomer, customerPath, uniqueName } from './customer-form-helpers'
import { invoiceIdFromUrl } from './invoice-helpers'
import { customerWithInvoices, localDay } from './receive-payment-helpers'
import {
    openRowMenu,
    openSales,
    openSalesTab,
    rowMenuActions,
    salesRow,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'
import { confirmWriteOff, invoiceToWriteOff, WRITE_OFF_URL } from './write-off-helpers'

// Write off from the lists (write-off spec §3.1, §3.6, checkpoint 4): the row menu's Write
// off on the Invoices tab and on the customer page's Transactions tab, the Written off status
// and chip, the customer's Write-off rows, and the phone path (the bar's More menu, the
// dialog as a Sheet, the Write-offs section as cards, the write-off page's stacked header).
// Every test makes its own customer and invoice through the UI with a unique name and memo,
// and every write-off keeps the dialog's default account, 6050 Bad debts (plan decision 10).
// No setting is changed.
//
// Not driven here (plan notes): the dialog's loading, load-error, no-account and offline
// states and the page's error states (unit-tested pure helpers), and a reader's lists
// (sales-lists-reader.spec.ts pins that a reader's row menu has no Write off).

const MINUS = '−'
const ROW_ID = /^customer-transaction-([a-z0-9]{15})$/

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The element of the screen on top: Books keeps an earlier screen mounted and hidden under
// a pushed one.
function shown(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// The cell texts of a Sales list row, in its tab's column order, in one snapshot.
function salesCells(page: Page, id: string): Promise<string[]> {
    return salesRow(page, id).evaluate(row =>
        Array.from(row.children).map(cell => (cell.textContent ?? '').trim())
    )
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`customer-transaction-${id}`)
}

// The ids of the customer's Transactions rows, in screen order, in one snapshot.
function transactionIds(page: Page): Promise<string[]> {
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

// A Transactions table row's cells keyed by their column heading, in one snapshot.
function rowCells(page: Page, id: string): Promise<Record<string, string>> {
    return page.getByTestId('customer-transactions').evaluate((root, rowId) => {
        const header = root.querySelector('[data-testid="customer-transactions-header"]')
        const row = root.querySelector(`[data-testid="customer-transaction-${rowId}"]`)
        const out: Record<string, string> = {}
        const titles = [...(header?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        const cells = [...(row?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        titles.forEach((title, index) => {
            if (title !== '') out[title] = cells[index] ?? ''
        })
        return out
    }, id)
}

// Sets the window to `width` and waits until the Transactions list has settled on a table or
// cards (it measures its own width, a frame or more after the resize); true for a table.
async function drawsTableAt(page: Page, width: number): Promise<boolean> {
    await page.setViewportSize({ width, height: DESKTOP.height })
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
    return page.evaluate(async () => {
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
        const shows = (testId: string) =>
            Array.from(document.querySelectorAll(`[data-testid="${testId}"]`)).some(el =>
                el.checkVisibility()
            )
        let last = ''
        let steady = 0
        for (let i = 0; i < 120 && steady < 6; i++) {
            await frame()
            const table = shows('customer-transactions-table')
            const cards = shows('customer-transactions-cards')
            const state = `${table}:${cards}`
            steady = table !== cards && state === last ? steady + 1 : 0
            last = state
        }
        return last === 'true:false'
    })
}

// The smallest window width at which the Transactions list still draws a table. Below the
// phone breakpoint it always draws cards, and at 1280 it draws a table.
async function tableEdge(page: Page): Promise<number> {
    let cards = 767
    let table = DESKTOP.width
    expect(await drawsTableAt(page, table)).toBe(true)
    while (table - cards > 1) {
        const middle = Math.floor((cards + table) / 2)
        if (await drawsTableAt(page, middle)) table = middle
        else cards = middle
    }
    return table
}

// The top edge of the phone's tab bar: the full-width box that holds its More button.
function tabBarTop(page: Page): Promise<number> {
    return page.getByTestId('nav-more').evaluate(button => {
        let el: Element | null = button
        while (el && el.getBoundingClientRect().width < window.innerWidth) el = el.parentElement
        return Math.round(el?.getBoundingClientRect().top ?? Number.NaN)
    })
}

function pageWidth(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth)
}

test.describe('write-off: lists', () => {
    test('writes off an invoice from the Invoices list', async ({ page }) => {
        await openBooks(page)
        const { memo, number } = await invoiceToWriteOff(page, 'Write-off list')
        const id = invoiceIdFromUrl(page)
        const balanceColumn = salesTabOf('invoices').columns.indexOf('balance')

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await searchSales(page, memo)
        await expect(salesRow(page, id)).toBeVisible()
        await expect(shown(page, `sales-status-${id}`)).toHaveText('Open')

        // Write off sits directly after Receive payment.
        await openRowMenu(page, id)
        await expect
            .poll(() => rowMenuActions(page))
            .toEqual([
                'open',
                'receive-payment',
                'write-off',
                'void',
                'copy',
                'credit-memo',
                'entry',
                'pdf',
            ])
        await expect(shown(page, 'sales-row-action-write-off')).toContainText('Write off')

        // The dialog opens over the list; the list stays.
        await shown(page, 'sales-row-action-write-off').click()
        await expect(page.getByTestId('write-off-dialog')).toBeVisible()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        expect(await confirmWriteOff(page, number)).toBe('$400.00')
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect(shown(page, `sales-status-${id}`)).toHaveText('Written off')
        await expect.poll(async () => (await salesCells(page, id))[balanceColumn]).toBe('$0.00')

        // Nothing is open: no Write off and no Receive payment.
        await openRowMenu(page, id)
        const actions = await rowMenuActions(page)
        expect(actions).not.toContain('write-off')
        expect(actions).not.toContain('receive-payment')
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('sales-row-action-open')).toHaveCount(0)

        // Written off keeps the row; Paid and Open do not show it.
        await shown(page, 'sales-chip-written-off').click()
        await expect(shown(page, 'sales-chip-written-off')).toHaveAttribute('aria-pressed', 'true')
        await expect(salesRow(page, id)).toBeVisible()
        await shown(page, 'sales-chip-paid').click()
        await expect(shown(page, 'sales-chip-paid')).toHaveAttribute('aria-pressed', 'true')
        await expect(shown(page, 'sales-no-match')).toBeVisible()
        await expect(salesRow(page, id)).toHaveCount(0)
        await shown(page, 'sales-chip-open').click()
        await expect(shown(page, 'sales-chip-open')).toHaveAttribute('aria-pressed', 'true')
        await expect(shown(page, 'sales-no-match')).toBeVisible()
        await expect(salesRow(page, id)).toHaveCount(0)

        // All sales reads the same status.
        await openSalesTab(page, 'all')
        await searchSales(page, memo)
        await expect(shown(page, `sales-status-${id}`)).toHaveText('Written off')
    })

    test('writes off from the customer page and lists the write-off', async ({ page }) => {
        await openBooks(page)

        // A customer with no write-off: the Write-offs chip names the kind.
        await createCustomer(page, { name: uniqueName('Write-off none') })
        const noneChip = page.getByTestId('customer-transactions-filter-write-off')
        await expect(noneChip).toHaveText('Write-offs')
        await noneChip.click()
        await expect(page.getByTestId('customer-transactions-no-match')).toHaveText(
            'No write-offs for this customer'
        )

        // A customer with one posted invoice of $400.00, not yet due.
        const made = await customerWithInvoices(page, [
            { rate: '400.00', dueDate: await localDay(page, 30) },
        ])
        const [invoice] = made.invoices
        if (invoice === undefined) throw new Error('no invoice was posted')
        const open = page.getByTestId('customer-balance-open')
        await expect(open).toHaveText('$400.00')

        // The invoice row's menu holds Write off; the dialog opens over the page.
        await page.getByTestId(`customer-transactions-row-menu-${invoice.id}`).click()
        const item = shown(page, 'sales-row-action-write-off')
        await expect(item).toContainText('Write off')
        await item.click()
        expect(await confirmWriteOff(page, invoice.number)).toBe('$400.00')
        await expect(page).toHaveURL(customerPath(made.customerId))

        // The invoice reads Written off, Open falls to $0.00, and a Write-off row shows.
        await expect.poll(async () => (await rowCells(page, invoice.id)).Status).toBe('Written off')
        await expect(open).toHaveText('$0.00')
        await expect.poll(() => transactionIds(page)).toHaveLength(2)
        const writeOffId = (await transactionIds(page)).find(id => id !== invoice.id) ?? ''
        await expect
            .poll(async () => {
                const cells = await rowCells(page, writeOffId)
                return { type: cells.Type, total: cells.Total, status: cells.Status }
            })
            .toEqual({ type: 'Write-off', total: `${MINUS}$400.00`, status: 'Written off' })

        // The chips: Write-offs after Refunds leaves only the write-off; Refunds has none.
        const chips = await page
            .locator('[data-testid^="customer-transactions-filter-"]')
            .evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
        expect(chips.indexOf('customer-transactions-filter-write-off')).toBe(
            chips.indexOf('customer-transactions-filter-refund-receipt') + 1
        )
        const writeOffChip = page.getByTestId('customer-transactions-filter-write-off')
        await expect(writeOffChip).toHaveText('Write-offs')
        await writeOffChip.click()
        await expect(writeOffChip).toHaveAttribute('aria-pressed', 'true')
        await expect.poll(() => transactionIds(page)).toEqual([writeOffId])
        await page.getByTestId('customer-transactions-filter-refund-receipt').click()
        await expect(page.getByTestId('customer-transactions-no-match')).toHaveText(
            'No refund receipts for this customer'
        )
        await page.getByTestId('customer-transactions-filter-all').click()
        await expect.poll(() => transactionIds(page)).toHaveLength(2)

        // With the row menu's column the table never scrolls sideways: at its own minimum
        // width it is a table, 1 px less draws cards, and the page is no wider than the window.
        const edge = await tableEdge(page)
        expect(await drawsTableAt(page, edge)).toBe(true)
        expect(await pageWidth(page)).toBeLessThanOrEqual(edge)
        expect(await drawsTableAt(page, edge - 1)).toBe(false)
        expect(await pageWidth(page)).toBeLessThanOrEqual(edge - 1)
        expect(await drawsTableAt(page, DESKTOP.width)).toBe(true)

        // The write-off row opens its page; the page's Void restores Open.
        await transaction(page, writeOffId).click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(shown(page, 'write-off-read-only')).toBeVisible()
        await shown(page, 'write-off-read-void').click()
        await expect(page.getByTestId('void-dialog')).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(shown(page, 'write-off-badge')).toHaveText('Void')
        await page.goBack()
        await expect(page).toHaveURL(customerPath(made.customerId))
        await expect.poll(async () => (await rowCells(page, writeOffId)).Status).toBe('Void')
        await expect(open).toHaveText('$400.00')
    })

    test('phone: More → Write off, the Sheet, cards and the stacked page', async ({ page }) => {
        await openBooks(page)
        const { number } = await invoiceToWriteOff(page, 'Write-off phone')
        await page.setViewportSize(PHONE)
        // The phone bar first: its More button.
        await expect(shown(page, 'invoice-read-more')).toBeVisible()

        // Write off is no bar button; More holds it with its key.
        await expect(
            shown(page, 'invoice-read-actions').getByTestId('invoice-read-write-off')
        ).toHaveCount(0)
        await shown(page, 'invoice-read-more').click()
        const row = page.getByTestId('invoice-read-write-off')
        await expect(row).toBeVisible()
        // The shared More row draws a plain-letter key in lower case.
        await expect(row).toContainText(/Write off\s*w$/)
        await row.click()

        // The dialog is a Sheet: it spans the window's width and rests on the tab bar (the
        // sheet host ends at the bar's top edge).
        const sheet = page.getByTestId('write-off-dialog')
        await expect(sheet).toBeVisible()
        await expect
            .poll(async () => {
                const box = await sheet.boundingBox()
                if (box === null) return null
                return {
                    left: Math.round(box.x),
                    width: Math.round(box.width),
                    bottom: Math.round(box.y + box.height),
                }
            })
            .toEqual({ left: 0, width: PHONE.width, bottom: await tabBarTop(page) })
        await confirmWriteOff(page, number)
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')

        // The Write-offs section draws a card, and nothing is wider than the phone.
        const section = shown(page, 'invoice-write-offs')
        await expect(section.getByTestId('invoice-write-offs-cards')).toBeVisible()
        await expect(section.getByTestId('invoice-write-offs-table')).toHaveCount(0)
        await expect.poll(() => pageWidth(page)).toBeLessThanOrEqual(PHONE.width)

        // The card's link opens the write-off page, its figure under the title.
        await section.locator('[data-testid^="invoice-write-offs-open-"]').first().click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(shown(page, 'write-off-read-only')).toBeVisible()
        const title = shown(page, 'write-off-title')
        const figure = shown(page, 'write-off-amount')
        await expect
            .poll(async () => {
                const top = await title.boundingBox()
                const below = await figure.boundingBox()
                if (top === null || below === null) return false
                return below.y > top.y + top.height
            })
            .toBe(true)
        await expect(shown(page, 'write-off-read-void')).toBeVisible()
        await shown(page, 'write-off-read-more').click()
        await expect(page.getByTestId('write-off-read-invoice')).toContainText('Open invoice')
        await expect(page.getByTestId('write-off-read-entry')).toContainText('View journal entry')
    })
})
