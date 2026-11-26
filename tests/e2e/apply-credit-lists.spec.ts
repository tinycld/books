import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { applyCell, applyDialogOf, customerWithInvoiceAndMemo } from './apply-credit-helpers'
import {
    CREDIT_MEMO_URL,
    creditMemoIdFromUrl,
    pickCreditMemoLineProduct,
} from './credit-memo-helpers'
import { customerPath } from './customer-form-helpers'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'
import { shown } from './pay-bills-helpers'
import {
    customerWithInvoices,
    localDay,
    nonTaxableService,
    openNewPayment,
    paymentRow,
    pickPaymentCustomer,
} from './receive-payment-helpers'
import { expectRecordUrl } from './record-key-helpers'
import {
    openRowMenu,
    openSales,
    openSalesTab,
    salesRow,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'

// Apply credit from the lists and on Receive payment (apply credit spec §3.1, §3.5, §3.8),
// checkpoint 5: the credit memo row's "Apply to invoices" on the Sales lists and on the
// customer page's Transactions tab, the Unapplied / Applied statuses and chips, the
// customer's Overdue and Open figures after an application, and the Receive payment notice
// of the customer's unapplied credit. Every test makes its own customer, invoices and memo
// through the UI with a unique name and memo, and finds its rows through search.
//
// No phone run: the row menus and the notice run the same code at 390; the dialog's phone
// path is apply-credit-invoice.spec.ts's run.

const ROW_ACTION = 'sales-row-action-'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The open row menu's visible items, in menu order, as test id and text, in one snapshot.
function menuItems(page: Page): Promise<{ id: string; text: string }[]> {
    return page.evaluate(prefix => {
        return Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`))
            .filter(el => el.checkVisibility())
            .map(el => ({ id: el.dataset.testid ?? '', text: (el.innerText ?? '').trim() }))
    }, ROW_ACTION)
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

// The header cells of Receive payment's open-invoices grid, in one snapshot: the row that
// holds the "Open balance" heading.
function outstandingHeader(page: Page): Promise<string[]> {
    return page.getByTestId('payment-outstanding').evaluate(root => {
        const heading = Array.from(root.querySelectorAll<HTMLElement>('*')).find(
            el => el.children.length === 0 && (el.textContent ?? '').trim() === 'Open balance'
        )
        const row = heading?.parentElement
        return [...(row?.children ?? [])]
            .map(cell => (cell.textContent ?? '').trim())
            .filter(text => text !== '')
    })
}

// From the open customer page: New transaction → Credit memo, one line of the seeded
// non-taxable service at `rate`, `memo`, Post. Leaves the page on the memo's read view.
async function postMemoFromCustomer(
    page: Page,
    customerId: string,
    input: { rate: string; memo: string }
): Promise<{ id: string; number: string }> {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-credit-memo').click()
    await expect(page).toHaveURL(new RegExp(`/books/credit-memos/new\\?customer=${customerId}$`))
    const rowId = await pickCreditMemoLineProduct(page, 0, nonTaxableService())
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('credit-memo-post').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
    const title = page.getByTestId('credit-memo-title')
    await expect(title).toHaveText(/^Credit memo \d+$/)
    const number = /^Credit memo (\d+)$/.exec(await title.innerText())?.[1] ?? ''
    return { id: await creditMemoIdFromUrl(page), number }
}

test.describe('apply-credit: lists and Receive payment', () => {
    test('Sales lists: the credit memo row applies its credit, and the chips follow', async ({
        page,
    }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply lists',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: 0 },
        })
        const [invoice] = invoices

        // The invoice's row menu does not change (Q4): no item starts with "Apply", while
        // its customer has unapplied credit.
        await openSales(page)
        await openSalesTab(page, 'invoices')
        await searchSales(page, invoice.memo)
        await expect(salesRow(page, invoice.id)).toBeVisible()
        await openRowMenu(page, invoice.id)
        const invoiceItems = await menuItems(page)
        expect(invoiceItems.map(item => item.id)).toContain(`${ROW_ACTION}open`)
        expect(invoiceItems.filter(item => /^Apply/.test(item.text))).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`${ROW_ACTION}open`)).toHaveCount(0)

        // The memo's row reads Unapplied; its menu starts with Apply to invoices.
        await openSalesTab(page, 'credit-memos')
        await searchSales(page, memo.memo)
        await expect(salesRow(page, memo.id)).toBeVisible()
        await expect(shown(page, `sales-status-${memo.id}`)).toHaveText('Unapplied')
        await openRowMenu(page, memo.id)
        await expect
            .poll(async () => (await menuItems(page))[0]?.id)
            .toBe(`${ROW_ACTION}apply-credit`)
        const apply = shown(page, `${ROW_ACTION}apply-credit`)
        await expect(apply).toContainText('Apply to invoices')

        // A press opens the memo's read view with its apply dialog open.
        await apply.click()
        await expectRecordUrl(page, 'credit-memos', memo.id)
        const dialog = applyDialogOf(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Apply credit memo ${memo.number}`)
        await expect(applyCell(page, invoice.id)).toHaveValue('250.00')

        // The whole credit applied there; back on the list the row reads Applied.
        await page.getByTestId('apply-credit-submit').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByText('Applied $250.00 to 1 invoice', { exact: true })).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(salesTabUrl('credit-memos'))
        await expect(shown(page, `sales-status-${memo.id}`)).toHaveText('Applied')

        // The Applied chip lists it; the Unapplied chip does not.
        await shown(page, 'sales-chip-applied').click()
        await expect(shown(page, 'sales-chip-applied')).toHaveAttribute('aria-pressed', 'true')
        await expect(salesRow(page, memo.id)).toBeVisible()
        await expect(shown(page, `sales-status-${memo.id}`)).toHaveText('Applied')
        await shown(page, 'sales-chip-unapplied').click()
        await expect(shown(page, 'sales-chip-unapplied')).toHaveAttribute('aria-pressed', 'true')
        await expect(shown(page, 'sales-no-match')).toBeVisible()
        await expect(salesRow(page, memo.id)).toHaveCount(0)
    })

    test('customer page: the memo row applies its credit; Overdue falls and Open stays', async ({
        page,
    }) => {
        await openBooks(page)
        // An overdue invoice of $200.00 (dated and due 10 days ago) and a memo of $200.00,
        // which the dialog spreads on it in full. Open is $200.00 − $200.00.
        const made = await customerWithInvoices(
            page,
            [{ rate: '200.00', dueDate: await localDay(page, -10) }],
            'Apply customer'
        )
        const [overdue] = made.invoices
        if (overdue === undefined) throw new Error('no invoice posted')
        const memo = await postMemoFromCustomer(page, made.customerId, {
            rate: '200.00',
            memo: uniqueMemo('Apply customer credit memo'),
        })
        await page.goBack()
        await expect(page).toHaveURL(await customerPath(page, made.customerId))
        await expect(page.getByTestId('customer-transactions')).toBeVisible()

        const open = page.getByTestId('customer-balance-open')
        const overdueFigure = page.getByTestId('customer-balance-overdue')
        await expect(open).toHaveText('$0.00')
        await expect(overdueFigure).toHaveText('$200.00')

        // The memo row's menu holds Apply to invoices; it opens the memo with its dialog.
        await page.getByTestId(`customer-transactions-row-menu-${memo.id}`).click()
        const apply = shown(page, `${ROW_ACTION}apply-credit`)
        await expect(apply).toContainText('Apply to invoices')
        await apply.click()
        await expectRecordUrl(page, 'credit-memos', memo.id)
        const dialog = applyDialogOf(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Apply credit memo ${memo.number}`)
        await expect(applyCell(page, overdue.id)).toHaveValue('200.00')
        await page.getByTestId('apply-credit-submit').click()
        await expect(dialog).toHaveCount(0)

        // Overdue falls by the overdue invoice's balance; Open does not move; the memo row
        // reads Applied.
        await page.goBack()
        await expect(page).toHaveURL(await customerPath(page, made.customerId))
        await expect(overdueFigure).toHaveText('$0.00')
        await expect(open).toHaveText('$0.00')
        await expect.poll(async () => (await rowCells(page, memo.id)).Status).toBe('Applied')

        // An application is no transaction kind: no filter chip names it.
        const chips = await page
            .locator('[data-testid^="customer-transactions-filter-"]')
            .evaluateAll(els =>
                els.map(el => ({
                    id: el.getAttribute('data-testid') ?? '',
                    text: (el.textContent ?? '').trim(),
                }))
            )
        expect(chips.length).toBeGreaterThan(0)
        expect(chips.filter(chip => /appl/i.test(chip.id) || /appl/i.test(chip.text))).toEqual([])
    })

    test('Receive payment lists the customer’s unapplied credit memos as links', async ({
        page,
    }) => {
        await openBooks(page)
        // A customer with an open invoice and no credit memo.
        const plain = await customerWithInvoices(
            page,
            [{ rate: '100.00', dueDate: await localDay(page, 30) }],
            'Apply no credit'
        )
        const [plainInvoice] = plain.invoices
        if (plainInvoice === undefined) throw new Error('no invoice posted')
        // A customer with an open invoice and a posted credit memo of $250.00.
        const { name, invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply notice',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: null },
        })
        const [invoice] = invoices

        // The customer with the memo: the notice, under its title, lists that memo only; the
        // grid has no credit column.
        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await expect(paymentRow(page, invoice.id)).toBeVisible()
        const notice = page.getByTestId('payment-credits-notice')
        await expect(notice).toBeVisible()
        await expect(page.getByTestId('payment-credits-notice-title')).toHaveText(
            'Unapplied credit'
        )
        const link = page.getByTestId(`payment-credit-${memo.id}`)
        await expect(link).toHaveText(`Credit memo ${memo.number} · $250.00 unapplied`)
        await expect(notice.locator('[data-testid^="payment-credit-"]')).toHaveCount(1)
        await expect
            .poll(() => outstandingHeader(page))
            .toEqual(['Invoice', 'Due date', 'Original amount', 'Open balance', 'Payment'])

        // Picking the customer with no credit memo takes the notice away; the grid keeps its
        // columns.
        await pickPaymentCustomer(page, plain.name)
        await expect(paymentRow(page, plainInvoice.id)).toBeVisible()
        await expect(notice).toHaveCount(0)
        await expect
            .poll(() => outstandingHeader(page))
            .toEqual(['Invoice', 'Due date', 'Original amount', 'Open balance', 'Payment'])

        // Back on the memo customer, the link opens the credit memo's read view.
        await pickPaymentCustomer(page, name)
        await expect(link).toBeVisible()
        await link.click()
        await expectRecordUrl(page, 'credit-memos', memo.id)
        await expect(shown(page, 'credit-memo-read-only')).toBeVisible()
        await expect(shown(page, 'credit-memo-title')).toHaveText(`Credit memo ${memo.number}`)
    })
})
