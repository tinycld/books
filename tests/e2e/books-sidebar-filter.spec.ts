import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { swipeFromLeftEdge } from './books-report-helpers'

// The filter box at the top of the Books sidebar. While it holds text, the sidebar draws
// one list of the navigation rows, New actions and reports that match, in place of its
// sections. Driven through the UI only: the seeded admin writes, so the New actions show.

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function matches(page: Page) {
    return page.locator('[data-testid^="books-sidebar-match-"]').filter({ visible: true })
}

async function openBooks(page: Page) {
    await login(page)
    await page.setViewportSize(DESKTOP)
    await navigateToPackage(page, 'books')
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
}

test.describe('books-sidebar-filter: find a row of the Books sidebar (desktop)', () => {
    test('shows only the matching rows, with the section of each, and Esc brings the sections back', async ({
        page,
    }) => {
        await openBooks(page)
        const filter = shown(page, 'books-sidebar-filter')

        await filter.fill('aging')

        await expect(matches(page)).toHaveText(['A/R AgingReport', 'A/P AgingReport'])
        await expect(shown(page, 'books-sidebar-new-toggle')).toHaveCount(0)
        await expect(shown(page, 'books-sidebar-reports-toggle')).toHaveCount(0)

        await filter.press('Escape')

        await expect(filter).toHaveValue('')
        await expect(matches(page)).toHaveCount(0)
        await expect(shown(page, 'books-sidebar-new-toggle')).toBeVisible()
        await expect(shown(page, 'books-nav-dashboard')).toBeVisible()
    })

    test('finds a New action and a folded Accounting row by every word, and opens the one pressed', async ({
        page,
    }) => {
        await openBooks(page)
        const filter = shown(page, 'books-sidebar-filter')

        await filter.fill('new inv')
        await expect(matches(page)).toHaveText(['InvoiceNew'])

        await filter.fill('reconcile')
        await expect(shown(page, 'books-sidebar-match-nav-reconcile')).toBeVisible()

        await filter.fill('invoice')
        await shown(page, 'books-sidebar-match-new-invoice').click()

        await expect(page).toHaveURL(/\/a\/books\/invoices\/new/)
        await expect(filter).toHaveValue('')
        await expect(shown(page, 'books-nav-dashboard')).toBeVisible()
    })

    test('says so when no row matches, and the clear button empties the box', async ({ page }) => {
        await openBooks(page)
        const filter = shown(page, 'books-sidebar-filter')

        await filter.fill('zzzz')
        await expect(shown(page, 'books-sidebar-filter-empty')).toHaveText('No matches')

        await shown(page, 'books-sidebar-filter-clear').click()

        await expect(filter).toHaveValue('')
        await expect(shown(page, 'books-sidebar-filter-empty')).toHaveCount(0)
    })

    test('the keyboard shortcut puts the focus in the box', async ({ page }) => {
        await openBooks(page)

        await page.keyboard.press('ControlOrMeta+/')

        await expect(shown(page, 'books-sidebar-filter')).toBeFocused()
    })
})

test.describe('books-sidebar-filter: find a row in the drawer (phone)', () => {
    test('a press on a match opens it and closes the drawer', async ({ page }) => {
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await page
            .getByTestId('dashboard-screen')
            .filter({ visible: true })
            .waitFor({ state: 'visible' })
        await page.getByTestId('mobile-drawer-panel').waitFor({ state: 'attached' })
        await swipeFromLeftEdge(page)
        const panel = page.getByTestId('mobile-drawer-panel')
        await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)

        await panel.getByTestId('books-sidebar-filter').fill('chart')
        await panel.getByTestId('books-sidebar-match-nav-accounts').click()

        await expect(page).toHaveURL(/\/a\/books\/accounts/)
        await expect
            .poll(async () => {
                const box = await panel.boundingBox()
                return box ? box.x + box.width : 0
            })
            .toBeLessThanOrEqual(0)
    })
})
