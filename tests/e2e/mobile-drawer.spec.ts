import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { swipeFromLeftEdge } from './books-report-helpers'

// MobileDrawer is the left slide-in package sidebar on phones. It opens from a
// pan that starts in the 20px strip at the left edge; react-native-gesture-handler
// also listens for the mouse on web, so a mouse drag drives it (swipeFromLeftEdge).

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

async function boxOf(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} has no layout box`)
    return box
}

// Books has a sidebar, so it gets a drawer. The package rail links only exist
// at desktop width, so navigate there, then shrink: the workspace keeps the
// screen mounted across the breakpoint. Wait for the redirect and the closed
// panel (the drawer's mount) before the swipe.
async function openBooksOnPhone(page: Page) {
    await page.setViewportSize(DESKTOP)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(PHONE)
    // The books index redirects to the dashboard; this is the suite's check of that redirect.
    // ActivePkgSync closes the drawer on every route change, so a swipe that
    // lands before the redirect settles is undone by it.
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
    await page
        .getByTestId('dashboard-screen')
        .filter({ visible: true })
        .waitFor({ state: 'visible' })
    await page.getByTestId('mobile-drawer-panel').waitFor({ state: 'attached' })
}

async function expectDrawerOpen(page: Page) {
    await expect.poll(async () => (await boxOf(page, 'mobile-drawer-panel')).x).toBe(0)
}

test.describe('mobile-drawer: package sidebar on phones', () => {
    test('an edge swipe opens the drawer with the package sidebar, and a backdrop tap closes it', async ({
        page,
    }) => {
        await login(page)
        await openBooksOnPhone(page)

        await swipeFromLeftEdge(page)
        await expectDrawerOpen(page)

        const panel = page.getByTestId('mobile-drawer-panel')
        // The drawer is the whole Books sidebar: the filter box, the Shortcuts, the fixed
        // navigation, then the New and Reports sections.
        await expect(panel.getByTestId('books-sidebar-filter')).toBeVisible()
        await expect(panel.getByTestId('books-shortcuts-customize')).toBeVisible()
        await expect(panel.getByTestId('books-shortcut-screen-customers')).toBeVisible()
        await expect(panel.getByTestId('books-sidebar-new-toggle')).toBeVisible()
        await expect(panel.getByTestId('books-sidebar-reports-toggle')).toBeVisible()
        await expect(panel.getByTestId('books-nav-accounts')).toBeVisible()

        await page.mouse.click(PHONE.width - 20, PHONE.height / 2)

        await expect
            .poll(async () => {
                const box = await boxOf(page, 'mobile-drawer-panel')
                return box.x + box.width
            })
            .toBeLessThanOrEqual(0)
    })
})
