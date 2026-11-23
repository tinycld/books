import { expect, type Locator, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'

// The one place that knows how a spec reaches Books' New actions. Every helper and spec
// that starts a transaction from New goes through these, so a change of where the actions
// live changes this file only.
//
// The actions are the New section of the Books sidebar: `books-sidebar-new-<id>` items
// under a heading that folds. On a wide screen the sidebar is on screen. On a phone the
// sidebar is the drawer, and the round New button (core's FAB, which has no button role)
// opens the drawer with the section open.

// The test id of the action with this NEW_ACTIONS id (lib/new-actions.ts). A test id
// never holds an underscore: `sales_receipt` is `books-sidebar-new-sales-receipt`.
export function newActionTestId(id: string): string {
    return `books-sidebar-new-${id.replace(/_/g, '-')}`
}

// The fold button of the New section. A reader has none.
export function newSectionToggle(page: Page): Locator {
    return page.getByTestId('books-sidebar-new-toggle').filter({ visible: true })
}

// Books must be open on a screen that shows New (a list, not a form). Shows the New
// actions and leaves them shown. The fold state is kept across screens and reloads, so
// this opens a folded section and never presses the fold button of an open one.
export async function openNewMenu(page: Page): Promise<void> {
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
        const panel = page.getByTestId('mobile-drawer-panel')
        await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
    }
    const toggle = newSectionToggle(page)
    await toggle.waitFor()
    if ((await toggle.getAttribute('aria-label')) === 'Expand New') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse New')
}

// The action's item in the open New section.
export function newActionItem(page: Page, id: string): Locator {
    return page.getByTestId(newActionTestId(id)).filter({ visible: true })
}

// Shows the New actions and presses one. The caller checks where it lands.
export async function openNewAction(page: Page, id: string): Promise<void> {
    await openNewMenu(page)
    await newActionItem(page, id).click()
}
