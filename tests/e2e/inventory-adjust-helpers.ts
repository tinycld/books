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

/**
 * From anywhere in Books to the Products and services list. On the bin list or the
 * adjustments list, the strip's Products and services tab goes there first: on a phone
 * `openProductsList` waits only for the products list, a record's way out, a Lists hub card
 * or the dashboard, and neither of these two tabs shows one.
 */
async function openProductsTab(page: Page) {
    const onOtherTab =
        (await shown(page, 'bins-list').isVisible()) ||
        (await shown(page, 'inventory-adjustments-list').isVisible())
    if (onOtherTab) {
        const productsTab = page
            .getByRole('tab', { name: 'Products and services', exact: true })
            .filter({ visible: true })
        await productsTab.click()
        await expect(productsTab).toHaveAttribute('aria-selected', 'true')
    }
    await openProductsList(page)
}

// From anywhere in Books: the Products and services list, then the tab.
export async function openInventoryTab(page: Page, tab: InventoryTab) {
    await openProductsTab(page)
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
 * From anywhere in Books (the bin list and the adjustments list too; no item page shown):
 * the Products and services list, a search for `name`, and a press on its row or card.
 * Waits for the item page of that Inventory item.
 */
export async function openItem(page: Page, name: string) {
    await openProductsTab(page)
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

// ---- The bin list and Move stock (inventory-adjust spec §3.7, §3.8) ----

// The Bin locations tab's own screen: `books/bins`.
export const BINS_URL = /\/books\/bins$/

// The shown bin list frame (the record list layer's `<listPrefix>-list`).
export function binsList(page: Page): Locator {
    return shown(page, 'bins-list')
}

// The list waits until its query has answered (aria-busy clears).
export async function binsSettled(page: Page) {
    await expect(binsList(page)).not.toHaveAttribute('aria-busy', 'true')
}

// The rows (wide) or cards (phone) of the bin list: `bins-row-<id>` / `bins-card-<id>`.
export function binEntries(page: Page): Locator {
    const prefix = isPhone(page) ? 'bins-card-' : 'bins-row-'
    return binsList(page).locator(`[data-testid^="${prefix}"]`)
}

// The row (wide) or card (phone) of the bin whose whole name is `name`.
export function binRow(page: Page, name: string): Locator {
    return binEntries(page).filter({ has: page.getByText(name, { exact: true }) })
}

/**
 * From anywhere in Books where the products list can open: Products and services, then the
 * tab Bin locations. Waits for the bin list.
 */
export async function openBins(page: Page) {
    await openInventoryTab(page, 'Bin locations')
    await expect(page).toHaveURL(BINS_URL)
    await expect(binsList(page)).toBeVisible()
    await binsSettled(page)
}

// The bin list must be shown. Clicks the search first, so a layer over the list fails here.
export async function searchBins(page: Page, text: string) {
    const input = shown(page, 'bins-search')
    await input.click()
    await input.fill(text)
    await expect(input).toHaveValue(text)
    await binsSettled(page)
}

// The bin dialog (a Sheet on a phone, so it is found by its test id).
export function binDialog(page: Page): Locator {
    return shown(page, 'bin-dialog')
}

// A create of a bin that the server answered.
export function binInserted(page: Page) {
    return page.waitForResponse(
        r =>
            r.request().method() === 'POST' &&
            /\/api\/collections\/books_bins\/records$/.test(new URL(r.url()).pathname)
    )
}

// A write (PATCH or DELETE) of one bin that the server answered.
export function binWritten(page: Page, method: 'PATCH' | 'DELETE') {
    return page.waitForResponse(
        r =>
            r.request().method() === method &&
            /\/api\/collections\/books_bins\/records\/[^/]+$/.test(new URL(r.url()).pathname)
    )
}

// The bin list must be shown. Presses New bin location and waits for the dialog, with the
// focus in Name.
export async function openNewBin(page: Page) {
    await binsList(page).getByRole('button', { name: 'New bin location', exact: true }).click()
    await expect(binDialog(page)).toBeVisible()
    await expect(page.getByTestId('bin-name')).toBeFocused()
}

/**
 * From anywhere in Books: the bin list (unless it is shown), New bin location, the name
 * (and a note), and the dialog's submit key. Waits for the saved bin's row or card, found by
 * a search for its name.
 */
export async function createBin(page: Page, name: string, note = '') {
    if (!(await binsList(page).isVisible())) await openBins(page)
    await openNewBin(page)
    await page.keyboard.type(name)
    if (note !== '') await page.getByTestId('bin-note').fill(note)
    const saved = binInserted(page)
    await page.keyboard.press('ControlOrMeta+Enter')
    expect((await saved).status()).toBe(200)
    await expect(binDialog(page)).toHaveCount(0)
    await searchBins(page, name)
    await expect(binRow(page, name)).toHaveCount(1)
}

// A row of an open menu or picker whose whole label is `label`.
export function menuOption(page: Page, label: string | RegExp): Locator {
    return page
        .locator('[role="menuitem"], [role="menuitemcheckbox"]')
        .filter({ has: page.getByText(label, { exact: true }), visible: true })
}

// The bin's row must be shown. Opens its row menu and presses the item `label`.
export async function chooseBinMenu(page: Page, name: string, label: string) {
    await binRow(page, name).locator('[data-testid^="bin-menu-"]').click()
    await menuOption(page, label).click()
}

// The Move stock dialog (a Sheet on a phone).
export function moveStockDialog(page: Page): Locator {
    return shown(page, 'move-stock-dialog')
}

/**
 * The item page must be shown, with the Bins tab built and a bin in the book. Opens Move
 * stock: the header's button on a wide window, the More menu on a phone.
 */
export async function openMoveStock(page: Page) {
    if (isPhone(page)) {
        await itemPage(page).getByTestId('item-more').click()
        await menuOption(page, 'Move stock').click()
    } else {
        await shown(page, 'item-move-stock').click()
    }
    await expect(moveStockDialog(page)).toBeVisible()
}

// The Move stock dialog must be open. Opens From and presses the option `label`
// ("<bin> · <quantity>").
export async function pickMoveFrom(page: Page, label: string | RegExp) {
    await page.getByTestId('move-stock-from').click()
    await menuOption(page, label).click()
    await expect(menuOption(page, label)).toHaveCount(0)
}

// The Move stock dialog must be open. Opens To (a bin picker), searches `name` and presses
// the bin.
export async function pickMoveTo(page: Page, name: string) {
    await page.getByTestId('move-stock-to').click()
    await page.getByTestId('move-stock-to-search').fill(name)
    await menuOption(page, name).click()
    await expect(page.getByTestId('move-stock-to')).toContainText(name)
}

// A move between bins that the server answered.
export function transferInserted(page: Page) {
    return page.waitForResponse(
        r =>
            r.request().method() === 'POST' &&
            /\/api\/collections\/books_bin_transfers\/records$/.test(new URL(r.url()).pathname)
    )
}

// The rows of the shown item page's Bins tab (`item-bin-<id>`), each as its texts in screen
// order joined by one space, top to bottom, in one snapshot.
export function itemBinRows(page: Page): Promise<string[]> {
    return shown(page, 'item-bins-tab')
        .locator('[data-testid^="item-bin-"]')
        .evaluateAll(nodes =>
            nodes
                .map(node => ({
                    top: node.getBoundingClientRect().top,
                    text: Array.from(node.querySelectorAll('*'))
                        .filter(el => el.children.length === 0)
                        .map(el => (el.textContent ?? '').trim())
                        .filter(text => text !== '')
                        .join(' '),
                }))
                .sort((a, b) => a.top - b.top)
                .map(row => row.text)
        )
}

// The item page must be shown. Presses the Bins tab (⌥2 from the keyboard, or a press) and
// waits for it.
export async function openItemBins(page: Page, by: 'key' | 'press') {
    const tab = itemTab(page, 'Bins')
    if (by === 'key') await page.keyboard.press('Alt+2')
    else await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(shown(page, 'item-bins-tab')).toBeVisible()
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
