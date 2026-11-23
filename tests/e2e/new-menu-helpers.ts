import type { Locator, Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'

// The one place that knows how a spec reaches the actions of Books' New menu. Every
// helper and spec that starts a transaction from New goes through these three, so a
// change of where the actions live changes this file only.
//
// Today: the round New button (core's FAB, which has no button role) on a phone, the
// sidebar's New text on a wide screen; both open one menu of `books-new-<id>` items.

// The test id of the action with this NEW_ACTIONS id (lib/new-actions.ts). A test id
// never holds an underscore: `sales_receipt` is `books-new-sales-receipt`.
export function newActionTestId(id: string): string {
    return `books-new-${id.replace(/_/g, '-')}`
}

// Books must be open on a screen that shows New (a list, not a form). Opens the menu and
// leaves it open.
export async function openNewMenu(page: Page): Promise<void> {
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
}

// The action's item in the open menu.
export function newActionItem(page: Page, id: string): Locator {
    return page.getByTestId(newActionTestId(id))
}

// Opens the menu and presses the action. The caller checks where it lands.
export async function openNewAction(page: Page, id: string): Promise<void> {
    await openNewMenu(page)
    await newActionItem(page, id).click()
}
