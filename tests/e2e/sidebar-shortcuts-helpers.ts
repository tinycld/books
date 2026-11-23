import { expect, type Locator, type Page } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, isPhone, swipeFromLeftEdge } from './account-register-helpers'

// The Shortcuts section of the Books sidebar and its Customize shortcuts dialog. The
// sidebar's own rows are `books-shortcut-<kind>-<ref>`; the dialog's rows are
// `books-shortcuts-row-<kind>-<ref>`, so a read of one never counts the other.

export type ShortcutKind = 'screen' | 'new' | 'report' | 'register'

// What a user with no stored list gets (lib/sidebar-shortcuts.ts DEFAULT_SHORTCUTS), as
// the slugs (`<kind>-<ref>`) of the rows.
export const DEFAULT_SLUGS = [
    'screen-customers',
    'screen-vendors',
    'screen-products',
    'report-books-profit-and-loss',
    'report-books-balance-sheet',
]

const ROW_PREFIX = 'books-shortcut-'
const ADD_OPTION_PREFIX = 'books-shortcuts-add-option-'

// Signs nothing in: the page is logged in. Opens Books on the dashboard at `size`. The
// package rail exists only at the desktop width, so the size is set after the navigation.
export async function openBooksAt(page: Page, size: { width: number; height: number }) {
    await page.setViewportSize(DESKTOP)
    await navigateToPackage(page, 'books')
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
    await page.getByTestId('dashboard-screen').filter({ visible: true }).waitFor()
    await page.setViewportSize(size)
}

// Puts the Books sidebar on screen. On a wide screen it is there. On a phone it is the
// drawer: the helper waits until the drawer rests (open or closed), then opens a closed one.
export async function showSidebar(page: Page): Promise<void> {
    if (!isPhone(page)) return
    const panel = page.getByTestId('mobile-drawer-panel')
    await panel.waitFor({ state: 'attached' })
    const rest = async () => {
        const box = await panel.boundingBox()
        if (!box) return 'moving'
        if (box.x === 0) return 'open'
        return box.x + box.width <= 0 ? 'closed' : 'moving'
    }
    await expect.poll(rest).not.toBe('moving')
    if ((await rest()) === 'open') return
    await swipeFromLeftEdge(page)
    await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
}

export function shortcutRow(page: Page, slug: string): Locator {
    return page.getByTestId(`${ROW_PREFIX}${slug}`).filter({ visible: true })
}

// The slugs of the sidebar's shortcut rows, from the top.
export async function shortcutSlugs(page: Page): Promise<string[]> {
    const ids = await page
        .locator(`[data-testid^="${ROW_PREFIX}"]`)
        .filter({ visible: true })
        .evaluateAll(rows => rows.map(row => row.getAttribute('data-testid') ?? ''))
    return ids.map(id => id.slice(ROW_PREFIX.length))
}

export async function expectShortcuts(page: Page, slugs: readonly string[]): Promise<void> {
    await showSidebar(page)
    await expect.poll(() => shortcutSlugs(page)).toEqual(slugs)
}

// Shows the sidebar and presses a shortcut. The caller checks where it lands.
export async function pressShortcut(page: Page, slug: string): Promise<void> {
    await showSidebar(page)
    await shortcutRow(page, slug).click()
}

export function customizeDialog(page: Page): Locator {
    return page.getByTestId('books-shortcuts-dialog')
}

export async function openCustomize(page: Page): Promise<void> {
    await showSidebar(page)
    await page.getByTestId('books-shortcuts-customize').filter({ visible: true }).click()
    await expect(customizeDialog(page)).toBeVisible()
}

export function dialogRow(page: Page, slug: string): Locator {
    return customizeDialog(page).getByTestId(`books-shortcuts-row-${slug}`)
}

// The dialog is open. Searches Add shortcut for `search` and picks the choice of `kind`
// whose label is `label`. Returns the slug of the row the pick adds.
export async function addShortcut(
    page: Page,
    kind: ShortcutKind,
    search: string,
    label: string = search
): Promise<string> {
    await page.getByTestId('books-shortcuts-add').filter({ visible: true }).click()
    const field = page.getByTestId('books-shortcuts-add-search')
    await expect(field).toBeFocused()
    await field.fill(search)
    const prefix = `${ADD_OPTION_PREFIX}${kind}:`
    const option = page
        .getByRole('menuitem', { name: label, exact: true })
        .and(page.locator(`[data-testid^="${prefix}"]`))
    await expect(option).toBeVisible()
    const id = (await option.getAttribute('data-testid')) ?? ''
    const slug = `${kind}-${id.slice(prefix.length).replace(/[^a-zA-Z0-9]/g, '-')}`
    await option.click()
    await expect(dialogRow(page, slug)).toBeVisible()
    return slug
}

// The dialog is open with a change in it. Saves and waits until the dialog is gone.
export async function saveShortcuts(page: Page): Promise<void> {
    await page.getByTestId('books-shortcuts-save').click()
    await expect(customizeDialog(page)).toHaveCount(0)
}

export async function cancelCustomize(page: Page): Promise<void> {
    await customizeDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(customizeDialog(page)).toHaveCount(0)
}
