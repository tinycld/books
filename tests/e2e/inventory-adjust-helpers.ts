import { expect, type Locator, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { localToday } from './invoice-helpers'
import { newActionItem, openNewMenu } from './new-menu-helpers'
import {
    expectSavedToList,
    field,
    openNewProduct,
    openProductsList,
    pickOption,
    productEntry,
    searchProducts,
} from './products-services-helpers'

// A per-run memo (the same as the other document specs'), so an adjustment a test makes
// is found again by it.
export { uniqueMemo } from './invoice-helpers'

// The inventory adjustments list (inventory-adjust spec §3.5) and its read view. The list
// is a tab of Products and services; a screen that a later screen covers stays mounted,
// hidden, under it, so every locator here counts only the visible match.

// An adjustment's own screen: `books/inventory-adjustments/<key>`, never `.../new`.
export const ADJUSTMENT_URL = /\/books\/inventory-adjustments\/(?!new(?:[?#]|$))[^/?#]+$/

// The list itself: `books/inventory-adjustments`, with no adjustment open.
export const ADJUSTMENTS_URL = /\/books\/inventory-adjustments$/

export type InventoryTab = 'Products and services' | 'Inventory adjustments' | 'Bin locations'

export function shown(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// The rows (wide) or cards (phone) of the list, in screen order.
export function adjustmentEntries(page: Page): Locator {
    const prefix = isPhone(page) ? 'inventory-adjustments-card-' : 'inventory-adjustments-row-'
    return page.locator(`[data-testid^="${prefix}"]`).filter({ visible: true })
}

// The row (wide) or card (phone) of one adjustment, by its id.
export function adjustmentEntry(page: Page, id: string): Locator {
    const prefix = isPhone(page) ? 'inventory-adjustments-card-' : 'inventory-adjustments-row-'
    return shown(page, `${prefix}${id}`)
}

// The row (wide) or card (phone) that holds a text whose whole text is `text` (a cell or a
// card line, never a part of a longer one).
export function adjustmentRow(page: Page, text: string | RegExp): Locator {
    return adjustmentEntries(page).filter({ has: page.getByText(text, { exact: true }) })
}

// The test ids of the shown rows or cards, top to bottom, in one snapshot.
export async function adjustmentEntryIds(page: Page): Promise<string[]> {
    const entries = adjustmentEntries(page)
    return entries.evaluateAll(nodes =>
        nodes
            .map(node => ({
                id: node.getAttribute('data-testid') ?? '',
                top: node.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
            .map(row => row.id)
    )
}

// The list waits until its query has answered: the frame keeps the last rows while a new
// query loads, with aria-busy set.
export async function listSettled(page: Page) {
    await expect(shown(page, 'inventory-adjustments-list')).not.toHaveAttribute('aria-busy', 'true')
}

// From anywhere in Books: the Products and services list, then the tab.
export async function openInventoryTab(page: Page, tab: InventoryTab) {
    await openProductsList(page)
    const button = page.getByRole('tab', { name: tab, exact: true }).filter({ visible: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-selected', 'true')
}

// Clicks the field first, so a layer over the list that takes the pointer fails here.
export async function searchAdjustments(page: Page, text: string) {
    const input = shown(page, 'inventory-adjustments-search')
    await input.click()
    await input.fill(text)
    await expect(input).toHaveValue(text)
    await listSettled(page)
}

// Presses a chip of the list (all, draft, posted, void) and waits for its rows.
export async function pressStatusChip(page: Page, chip: 'all' | 'draft' | 'posted' | 'void') {
    const button = shown(page, `inventory-adjustments-chip-${chip}`)
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await listSettled(page)
}

// ---- The adjustment form (inventory-adjust spec §3.2 to §3.4) ----

// A new adjustment's form: `books/inventory-adjustments/new`, with or without a query.
export const NEW_ADJUSTMENT_URL = /\/books\/inventory-adjustments\/new(?:[?#].*)?$/

/**
 * Makes an Inventory item through the product form, from anywhere in Books, with its
 * opening stock dated today (`quantity` "10", `value` "50.00"), and, given `bin`, the bin
 * location's name as its Default bin. Leaves the page on the products list.
 */
export async function makeInventoryItem(
    page: Page,
    item: { name: string; quantity: string; value: string; bin?: string }
) {
    await openNewProduct(page, 'inventory')
    await field(page, 'name').fill(item.name)
    await field(page, 'opening_quantity').fill(item.quantity)
    await field(page, 'opening_quantity').press('Tab')
    await field(page, 'opening_value').fill(item.value)
    await field(page, 'opening_value').press('Tab')
    await field(page, 'opening_date').fill(await localToday(page))
    if (item.bin !== undefined) await pickOption(page, 'default_bin', item.bin)
    await page.getByTestId('product-save').click()
    await expectSavedToList(page)
}

// ---- The item page (inventory-adjust spec §3.6) ----

// A product's own screen: `books/products/<code or id>`, never `.../new`.
export const PRODUCT_URL = /\/books\/products\/(?!new(?:[?#]|$))[^/?#]+(?:\?[^#]*)?$/

// The shown item page.
export function itemPage(page: Page): Locator {
    return shown(page, 'item-page')
}

// A tab of the shown item page, by its label.
export function itemTab(page: Page, label: 'Stock' | 'Bins' | 'Details'): Locator {
    return itemPage(page).getByRole('tab', { name: label, exact: true })
}

/**
 * From anywhere in Books where the products list can open (Books open, no item page
 * shown): the Products and services list, a search for `name`, and a press on its row or
 * card. Waits for the item page of that Inventory item.
 */
export async function openItem(page: Page, name: string) {
    await openProductsList(page)
    await searchProducts(page, name)
    await productEntry(page, name).click()
    await expect(page).toHaveURL(PRODUCT_URL)
    await expect(itemPage(page)).toBeVisible()
}

// The item page must be shown. Presses its Details tab and waits for the product form in it.
export async function openItemDetails(page: Page) {
    const tab = itemTab(page, 'Details')
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(itemPage(page).getByTestId('form-input-name')).toBeVisible()
}

// Books must be open. The Inventory adjustments tab (unless it is the shown screen), then
// + New → Inventory adjustment (on a phone the round New button opens the New sheet).
// Waits for the new form.
export async function openNewAdjustment(page: Page) {
    if (!(await shown(page, 'inventory-adjustments').isVisible())) {
        await openInventoryTab(page, 'Inventory adjustments')
    }
    await openNewMenu(page)
    await newActionItem(page, 'inventory_adjustment').click()
    await expect(page).toHaveURL(NEW_ADJUSTMENT_URL)
    await expect(shown(page, 'inventory-adjustment-form')).toBeVisible()
}

export type AdjustmentLineCell = 'item' | 'bin' | 'on-hand' | 'new' | 'change' | 'value' | 'menu'

// A cell of the shown form's line `index` (0 for line 1): `inventory-adjustment-line-<cell>-<n>`.
export function adjustmentLineCell(page: Page, index: number, cell: AdjustmentLineCell): Locator {
    return shown(page, `inventory-adjustment-line-${cell}-${index}`)
}

// The number of lines (rows or cards) of the shown form: `inventory-adjustment-line-<n>`.
export function adjustmentLineCount(page: Page): Promise<number> {
    return shown(page, 'inventory-adjustment-form')
        .locator('[data-testid^="inventory-adjustment-line-"]')
        .evaluateAll(
            nodes =>
                nodes.filter(node =>
                    /^inventory-adjustment-line-\d+$/.test(node.getAttribute('data-testid') ?? '')
                ).length
        )
}

// The adjustment's number in the shown title "Inventory adjustment <number>".
export async function adjustmentNumberOf(page: Page): Promise<string> {
    const title = shown(page, 'inventory-adjustment-title')
    await expect(title).toHaveText(/^Inventory adjustment \S+$/)
    return (await title.innerText()).replace('Inventory adjustment ', '')
}

// A row of an open picker menu whose whole label is `label`.
export function adjustmentMenuOption(page: Page, label: string): Locator {
    return page
        .locator('[role="menuitem"], [role="menuitemcheckbox"]')
        .filter({ has: page.getByText(label, { exact: true }), visible: true })
}

// The Item picker search text of a line (spec §3.3 "Item: a picker of active Inventory
// items"; the reference's text).
export const ITEM_SEARCH_PLACEHOLDER = 'Search items'

// The shown form must hold line `index`. Opens its Item picker by a press, searches and
// presses the item.
export async function pickAdjustmentItem(page: Page, index: number, name: string) {
    const trigger = adjustmentLineCell(page, index, 'item')
    await trigger.click()
    const search = page.getByTestId(`inventory-adjustment-line-item-${index}-search`)
    await expect(search).toBeFocused()
    // The picker lists Inventory items only, and says so.
    await expect(search).toHaveAttribute('placeholder', ITEM_SEARCH_PLACEHOLDER)
    await search.fill(name)
    await adjustmentMenuOption(page, name).click()
    await expect(trigger).toContainText(name)
}

// The id in the URL of the shown adjustment's own screen (`…/inventory-adjustments/<id>`).
export function adjustmentIdFromUrl(page: Page): string {
    const match = /\/books\/inventory-adjustments\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    if (!match?.[1] || match[1] === 'new') {
        throw new Error(`the URL ${page.url()} is no saved inventory adjustment`)
    }
    return match[1]
}

// Presses Post on the shown form and waits for the posted adjustment's read view. Returns
// its number.
export async function postAdjustment(page: Page): Promise<string> {
    await shown(page, 'inventory-adjustment-post').click()
    await expect(page).toHaveURL(ADJUSTMENT_URL)
    await expect(shown(page, 'inventory-adjustment-read')).toBeVisible()
    await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
    return adjustmentNumberOf(page)
}
