import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// MobileDrawer is the left slide-in package sidebar on phones. It opens from a
// pan that starts in the 20px strip at the left edge; react-native-gesture-handler
// also listens for the mouse on web, so a real mouse drag drives it.

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

async function swipeOpenFromEdge(page: Page) {
    const y = PHONE.height / 2
    await page.mouse.move(5, y)
    await page.mouse.down()
    await page.mouse.move(100, y, { steps: 8 })
    await page.mouse.move(200, y, { steps: 8 })
    await page.mouse.up()
}

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
    // The books index redirects to the Lists hub; this is the suite's check of that redirect.
    // ActivePkgSync closes the drawer on every route change, so a swipe that
    // lands before the redirect settles is undone by it.
    await expect(page).toHaveURL(/\/a\/books\/lists/)
    await page.getByText('Chart of accounts', { exact: true }).waitFor({ state: 'visible' })
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

        await swipeOpenFromEdge(page)
        await expectDrawerOpen(page)

        const panel = page.getByTestId('mobile-drawer-panel')
        await expect(panel.getByTestId('books-nav-accounting-toggle')).toBeVisible()

        await page.mouse.click(PHONE.width - 20, PHONE.height / 2)

        await expect
            .poll(async () => {
                const box = await boxOf(page, 'mobile-drawer-panel')
                return box.x + box.width
            })
            .toBeLessThanOrEqual(0)
    })
})
