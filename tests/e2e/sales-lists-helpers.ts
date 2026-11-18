import { expect, type Page } from '@playwright/test'
import { salesTabOf } from '../../tinycld/books/lib/sales-lists'
import {
    localToday,
    openNewInvoice,
    pickInvoiceCustomer,
    saveInvoiceDraft,
} from './invoice-helpers'
import { fillInvoice, nonTaxableService, postInvoice } from './receive-payment-helpers'

// Shared steps of the sales-lists specs (spec docs/specs/sales-lists-design.md). Every test
// makes its own customer and documents with a unique memo and finds its rows through the
// list's search field, never by position in the shared list.

const ENTRIES_URL = /\/books\/entries$/

// The URL of a Sales tab, e.g. `/books/invoices` for `invoices`, `/books/sales` for `all`.
export function salesTabUrl(tabKey: string): RegExp {
    return new RegExp(`/${salesTabOf(tabKey).path}$`)
}

// A list screen stays mounted and hidden under a pushed document, so a lookup takes the
// visible one.
function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// Books must be open at a width that draws the sidebar. Opens All sales.
export async function openSales(page: Page) {
    await page.getByTestId('books-nav-sales').click()
    await expect(page).toHaveURL(salesTabUrl('all'))
    await expect(visible(page, 'sales-list')).toBeVisible()
}

// A press on a tab of the open Sales header.
export async function openSalesTab(page: Page, tabKey: string) {
    await visible(page, `sales-tab-${tabKey}`).click()
    await expect(page).toHaveURL(salesTabUrl(tabKey))
    await expect(visible(page, `sales-tab-${tabKey}`)).toHaveAttribute('aria-selected', 'true')
}

// Types `text` in the visible list's search field.
export async function searchSales(page: Page, text: string) {
    const field = visible(page, 'sales-search')
    await field.fill(text)
    await expect(field).toHaveValue(text)
}

// Picks a customer in the visible list's customer picker by its search field.
export async function pickSalesCustomer(page: Page, input: { name: string; id: string }) {
    await visible(page, 'sales-customer').click()
    const search = page.getByTestId('sales-customer-search').filter({ visible: true })
    await expect(search).toBeVisible()
    await search.fill(input.name)
    await page.getByTestId(`sales-customer-option-${input.id}`).filter({ visible: true }).click()
    await expect(search).toBeHidden()
    await expect(visible(page, 'sales-customer')).toContainText(input.name)
}

// Opens the row menu ("More actions") of a document; the list stays on screen.
export async function openRowMenu(page: Page, id: string) {
    await visible(page, `sales-row-menu-${id}`).click()
    await expect(page.getByTestId('sales-row-action-open').filter({ visible: true })).toBeVisible()
}

// The actions of the open row menu, in menu order (`open`, `receive-payment`, …), read
// in one snapshot.
export function rowMenuActions(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const pattern =
            /^sales-row-action-(open|receive-payment|void|copy|credit-memo|entry|invoice|pdf|delete-draft|edit)$/
        return Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid^="sales-row-action-"]')
        )
            .filter(el => el.checkVisibility())
            .map(el => pattern.exec(el.dataset.testid ?? '')?.[1])
            .filter((action): action is string => action !== undefined)
    })
}

// The row (table) or card of a document, by its id.
export function salesRow(page: Page, id: string) {
    return visible(page, `sales-row-${id}`)
}

// Books must be open at desktop width. Saves a draft invoice for the customer, with one
// line of the seeded non-taxable service and `memo`, then returns to the Journal Entries
// list it was started from. Returns the draft's id.
export async function draftInvoiceFor(
    page: Page,
    customerName: string,
    memo: string
): Promise<string> {
    const id = await saveInvoiceDraft(page, {
        customer: customerName,
        product: nonTaxableService(),
        memo,
    })
    await page.goBack()
    await expect(page).toHaveURL(ENTRIES_URL)
    return id
}

// Books must be open at desktop width. Posts an invoice for the customer, dated and due
// today, with `memo`, then returns to the Journal Entries list it was started from.
// Returns the invoice's id.
export async function postedInvoiceFor(
    page: Page,
    customerName: string,
    memo: string
): Promise<string> {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, customerName)
    await page.getByTestId('form-input-memo').fill(memo)
    await fillInvoice(page, { dueDate: await localToday(page), rate: '150.00' })
    const { id } = await postInvoice(page)
    await page.goBack()
    await expect(page).toHaveURL(ENTRIES_URL)
    return id
}
