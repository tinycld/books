import { expect, type Locator, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { openProductsList } from './products-services-helpers'

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
