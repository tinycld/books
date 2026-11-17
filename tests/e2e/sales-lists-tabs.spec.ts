import { expect, type Page, test } from '@playwright/test'
import { SALES_LIST_SEED_DRAFTS } from '../../tinycld/books/lib/sales-lists-fixture'
import { createCustomer, DESKTOP, openBooks, PHONE, uniqueName } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    draftInvoiceFor,
    openSales,
    openSalesTab,
    postedInvoiceFor,
    salesRow,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'

// The Sales area's tabs and rows (sales-lists checkpoint 2, spec §2 and §3 "Tabs and
// header", "Rows and columns", "Opening a document"): the Sales sidebar entry, a tab press
// that replaces the list route, a row's cells, the cards below the table's own minimum
// width, the All sales New menu, and a document opened from a list as a page or beside
// the 320 px names column. Every test creates its own customer and invoice with a unique
// memo and finds its row through the search field.
//
// Not covered by e2e (accepted, plan checkpoint 2):
// - the 50-row window growing: it needs 50+ documents and the screen's 12 tests are used;
//   the `mergeTransactions` and `documentListWindow` unit tests cover it, and
//   tests/e2e/list-paging.spec.ts is where a seeded case can go;
// - an inactive customer in the customer picker (the e2e uses a sub-customer);
// - the reader on a phone (gate 2, `read-only-phone-*`);
// - Download PDF from a row menu (the download leaves the page; the item's presence is
//   asserted);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const DASH = '—'
const WIDE = { width: 1440, height: 900 }
const MID = { width: 900, height: 800 }
const NEW_ITEMS = ['invoice', 'estimate', 'sales-receipt', 'payment', 'credit-memo']

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// The rows of the visible list whose test id is exactly `sales-row-<15 char id>`.
function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// A customer of this test and a document of it, made at desktop width.
async function customerAndMemo(page: Page, label: string) {
    const name = uniqueName(label)
    await createCustomer(page, { name })
    return { name, memo: uniqueMemo(label) }
}

test.describe('sales-lists: tabs and rows', () => {
    test('lists a draft on All sales and the Invoices tab, opens it, and comes back to the kept list', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { name, memo } = await customerAndMemo(page, 'Sales tabs')
        const id = await draftInvoiceFor(page, name, memo)

        // All sales: the one row of the memo, its cells and its Draft badge.
        await openSales(page)
        await searchSales(page, memo)
        const row = salesRow(page, id)
        await expect(row).toBeVisible()
        await expect(listRows(page)).toHaveCount(1)
        await expect(row).toContainText('Invoice')
        await expect(row).toContainText(DASH)
        await expect(row).toContainText(name)
        await expect(visible(page, `sales-status-${id}`)).toHaveText('Draft')

        // The Invoices tab keeps its own search, which starts empty.
        await openSalesTab(page, 'invoices')
        await expect(visible(page, 'sales-search')).toHaveValue('')
        await searchSales(page, memo)
        await expect(salesRow(page, id)).toBeVisible()

        // A row press opens the draft in its form; its back link names the list and
        // returns to it with the search and the row kept.
        await salesRow(page, id).click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${id}$`))
        await expect(visible(page, 'invoice-form')).toBeVisible()
        const back = visible(page, 'entry-back')
        await expect(back).toContainText('Invoices')
        await expect(back).not.toContainText('Journal entries')
        await back.click()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect(visible(page, 'sales-search')).toHaveValue(memo)
        await expect(salesRow(page, id)).toBeVisible()

        // The form's Cancel returns to the same list.
        await salesRow(page, id).click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${id}$`))
        await visible(page, 'invoice-cancel').click()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect(salesRow(page, id)).toBeVisible()

        // Below the table's own minimum width the list draws cards; above it, the table.
        await page.setViewportSize(MID)
        await expect(visible(page, 'sales-cards')).toBeVisible()
        await expect(visible(page, 'sales-table')).toHaveCount(0)
        await page.setViewportSize(DESKTOP)
        await expect(visible(page, 'sales-table')).toBeVisible()
        await expect(visible(page, 'sales-cards')).toHaveCount(0)

        // The tab press replaced All sales, so Back leaves the Sales area.
        await page.goBack()
        await expect(page).not.toHaveURL(/\/books\/(invoices|sales)(\/|$)/)
    })

    test('phone: All sales draws cards and its New menu opens a new estimate', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name, memo } = await customerAndMemo(page, 'Sales phone')
        const id = await draftInvoiceFor(page, name, memo)
        await openSales(page)
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'sales-cards')).toBeVisible()

        // The draft's card shows its type alone, with no "—" for the missing number.
        await searchSales(page, memo)
        const card = salesRow(page, id)
        await expect(card).toBeVisible()
        await expect(card).toContainText('Invoice')
        await expect(card).toContainText(name)
        await expect(card).not.toContainText(DASH)

        // New on All sales is a menu of the five kinds.
        const newButton = visible(page, 'sales-new')
        await expect(newButton).toHaveText('New')
        await newButton.click()
        for (const item of NEW_ITEMS) {
            await expect(page.getByTestId(`sales-new-${item}`)).toBeVisible()
        }
        await page.getByTestId('sales-new-estimate').click()
        await expect(page).toHaveURL(/\/books\/estimates\/new(?:[?#].*)?$/)
    })

    test('wide: a posted invoice opens beside the 320 px names column of the Invoices list', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { name, memo } = await customerAndMemo(page, 'Sales wide')
        const id = await postedInvoiceFor(page, name, memo)
        await page.setViewportSize(WIDE)
        await openSales(page)
        await searchSales(page, memo)
        await salesRow(page, id).click()

        // The invoice's own route, its read view beside the column, its row marked.
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${id}$`))
        const column = visible(page, 'sales-names')
        await expect(column).toBeVisible()
        await expect
            .poll(async () => Math.round((await column.boundingBox())?.width ?? 0))
            .toBe(320)
        await expect(column.getByTestId(`sales-name-row-${id}`)).toHaveAttribute(
            'aria-current',
            'true'
        )
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        const columnSearch = column.getByTestId('sales-search')
        await expect(columnSearch).toBeVisible()

        // A search the invoice does not match lists other invoices and marks none.
        const seededDraft = SALES_LIST_SEED_DRAFTS.invoices[0]
        if (!seededDraft) throw new Error('the e2e seed has no draft invoice')
        await columnSearch.fill(seededDraft.memo)
        await expect(column.getByTestId(`sales-name-row-${seededDraft.id}`)).toBeVisible()
        await expect(column.getByTestId(`sales-name-row-${id}`)).toHaveCount(0)
        await expect(column.locator('[aria-current="true"]')).toHaveCount(0)

        // The read view's back link returns to All sales.
        await visible(page, 'entry-back').click()
        await expect(page).toHaveURL(salesTabUrl('all'))
        await expect(visible(page, 'sales-list')).toBeVisible()
    })
})
