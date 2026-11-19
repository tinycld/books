import { expect, type Page } from '@playwright/test'
import { purchaseTabOf } from '../../tinycld/books/lib/purchase-lists'

// Shared steps of the purchase-lists specs (spec docs/specs/purchase-lists-design.md). A
// seeded row is found by its test id after the list is narrowed to its vendor (vendor
// picker) or its memo (search field), never by its position in the shared list.

// The URL of an Expenses tab, e.g. `/books/bills` for `bills`, `/books/purchases` for `all`.
export function purchaseTabUrl(tabKey: string): RegExp {
    return new RegExp(`/${purchaseTabOf(tabKey).path}$`)
}

// A list screen stays mounted and hidden under a pushed document, so a lookup takes the
// visible one.
function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// Books must be open at a width that draws the sidebar. Opens All purchases.
export async function openPurchases(page: Page) {
    await page.getByTestId('books-nav-expenses').click()
    await expect(page).toHaveURL(purchaseTabUrl('all'))
    await expect(visible(page, 'purchases-list')).toBeVisible()
}

// A press on a tab of the open Expenses header.
export async function openPurchaseTab(page: Page, tabKey: string) {
    await visible(page, `purchases-tab-${tabKey}`).click()
    await expect(page).toHaveURL(purchaseTabUrl(tabKey))
    await expect(visible(page, `purchases-tab-${tabKey}`)).toHaveAttribute('aria-selected', 'true')
}

// Types `text` in the visible list's search field.
export async function searchPurchases(page: Page, text: string) {
    const field = visible(page, 'purchases-search')
    await field.fill(text)
    await expect(field).toHaveValue(text)
}

// Picks a vendor by its full display name in the visible list's vendor picker.
export async function pickPurchaseVendor(page: Page, name: string) {
    await visible(page, 'purchases-vendor').click()
    const search = page.getByTestId('purchases-vendor-search').filter({ visible: true })
    await expect(search).toBeVisible()
    await search.fill(name)
    await page
        .getByTestId(/^purchases-vendor-option-[a-z0-9]{15}$/)
        .filter({ visible: true })
        .filter({ has: page.getByText(name, { exact: true }) })
        .click()
    await expect(search).toBeHidden()
    await expect(visible(page, 'purchases-vendor')).toContainText(name)
}

// The row (table) or card of a document, by its id.
export function purchaseRow(page: Page, id: string) {
    return visible(page, `purchases-row-${id}`)
}
