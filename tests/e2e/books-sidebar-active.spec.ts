import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openReportsSection } from './books-report-helpers'
import { openNewMenu } from './new-menu-helpers'

// Presses every item of the Books sidebar in turn (the navigation, the New actions and the
// reports) and checks that each screen opens with no console error and that the pressed
// item is the one marked active (aria-current="page"). The Shortcuts are left out: a
// shortcut is never marked active, the fixed item for its screen is. All reports is left
// out too: it opens core's Reports hub, outside Books. The New actions are pressed one New
// group (Customers, Vendors, Other) per test, so a test stays bounded by its group and not
// by the whole New menu. Desktop only: the phone drawer draws the same items from the same
// component.

const DESKTOP = { width: 1280, height: 800 }

// Every console error and uncaught page error from the moment Books is open.
function collectErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(error.message))
    return errors
}

async function openBooks(page: Page) {
    await login(page)
    await page.setViewportSize(DESKTOP)
    await navigateToPackage(page, 'books')
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
}

// The test ids of the visible sidebar items whose test id starts with `prefix`, in sidebar
// order, read from the page so a new item is covered without a change here.
async function itemIds(page: Page, prefix: string, leaveOut: (id: string) => boolean) {
    const items = page.locator(`[data-testid^="${prefix}"]`).filter({ visible: true })
    await expect(items.first()).toBeVisible()
    const ids = await items.evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-testid') ?? '')
    )
    return ids.filter(id => !leaveOut(id))
}

// The test ids of the New actions inside one visible New group, in sidebar order, read from
// the page so a new action is covered without a change here.
async function newGroupItemIds(page: Page, group: string) {
    const groupView = page.getByTestId(`books-sidebar-new-group-${group}`).filter({ visible: true })
    const items = groupView.locator('[data-testid^="books-sidebar-new-"]').filter({ visible: true })
    await expect(items.first()).toBeVisible()
    return items.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid') ?? ''))
}

// Opens the New section and presses every action of one group. `holds` is an action the
// group must show, checked before the presses start.
async function pressNewGroup(page: Page, group: string, holds?: string) {
    await openBooks(page)
    const errors = collectErrors(page)
    await openNewMenu(page)
    const ids = await newGroupItemIds(page, group)
    if (holds) expect(ids).toContain(holds)
    for (const id of ids) await pressAndCheck(page, errors, id)
}

// Presses the item and checks it becomes the only active item of the sidebar, then that
// no error was logged on the way.
async function pressAndCheck(page: Page, errors: string[], testId: string) {
    const item = page.getByTestId(testId).filter({ visible: true })
    await item.click()
    await expect(item, `${testId} is active`).toHaveAttribute('aria-current', 'page')
    const active = page.locator('[aria-current="page"]').filter({ visible: true })
    await expect(active, `${testId} is the only active item`).toHaveCount(1)
    expect(errors, `console errors after ${testId}`).toEqual([])
}

test.describe('books-sidebar-active: every sidebar item opens cleanly and shows as active', () => {
    test('the navigation items', async ({ page }) => {
        await openBooks(page)
        const errors = collectErrors(page)
        const ids = await itemIds(page, 'books-nav-', () => false)
        expect(ids).toContain('books-nav-settings')
        for (const id of ids) await pressAndCheck(page, errors, id)
    })

    test('the New actions of the Customers group', async ({ page }) => {
        await pressNewGroup(page, 'customers', 'books-sidebar-new-invoice')
    })

    test('the New actions of the Vendors group', async ({ page }) => {
        await pressNewGroup(page, 'vendors')
    })

    test('the New actions of the Other group', async ({ page }) => {
        await pressNewGroup(page, 'other', 'books-sidebar-new-inventory-adjustment')
    })

    test('the reports', async ({ page }) => {
        await openBooks(page)
        const errors = collectErrors(page)
        await openReportsSection(page)
        const ids = await itemIds(page, 'books-sidebar-report-', () => false)
        expect(ids.length).toBeGreaterThan(10)
        for (const id of ids) await pressAndCheck(page, errors, id)
    })
})
