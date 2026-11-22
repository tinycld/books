import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { REGISTER_TABLE_MIN_WIDTH } from '../../tinycld/books/lib/register-layout'
import { chooseViewRegister, openRegister, revealRegisterItem } from './account-register-helpers'

// The account register's table never scrolls sideways: it shrinks its columns to their
// minimums, and where the list is narrower than the table's own minimum width it draws cards.
// The spec reads the seeded register of 1000 Business Checking (seed.ts posts its entries
// through the server's posting hook, dated today) and writes nothing.

const ROWS = '[data-testid^="register-row-"]'
const ACCENT = /(^|\s)bg-accent(\s|$)/
const COLUMNS = ['date', 'ref', 'type', 'memo', 'account', 'status', 'debit', 'credit', 'balance']
const DESKTOP_TALL = { width: 1280, height: 900 }

// Runs in the page: every element in the register's list column that scrolls sideways. A one-line
// text cut with an ellipsis is `overflow: hidden`, so it is not counted.
async function sidewaysScrollers(page: Page) {
    return page.evaluate(() => {
        const main = Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid="register-main"]')
        ).filter(element => element.checkVisibility())
        if (main.length === 0) return ['no visible register-main']
        const found: string[] = []
        for (const root of main) {
            for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
                const overflowX = getComputedStyle(element).overflowX
                const scrolls = overflowX === 'auto' || overflowX === 'scroll'
                if (scrolls && element.scrollWidth > element.clientWidth) {
                    found.push(
                        `${element.getAttribute('data-testid') ?? element.tagName} ${element.scrollWidth}>${element.clientWidth}`
                    )
                }
            }
        }
        return found
    })
}

// Runs in the page, in one pass: each heading cell and each cell of the first mounted row whose
// left or right edge is outside the box of `register-table`, and the widths of the row's cells
// and of the heading cells.
async function tableCells(page: Page) {
    return page.evaluate(columns => {
        const table = document.querySelector('[data-testid="register-table"]')
        const row = document.querySelector('[data-testid^="register-row-"]')
        if (!table || !row) {
            return { outside: ['no table or no row'], widths: {}, headingWidths: {} }
        }
        const lineId = (row.getAttribute('data-testid') ?? '').replace('register-row-', '')
        const box = table.getBoundingClientRect()
        const outside: string[] = []
        const widths: Record<string, number> = {}
        const headingWidths: Record<string, number> = {}
        for (const column of columns) {
            for (const id of [`register-heading-${column}`, `register-cell-${column}-${lineId}`]) {
                const cell = document.querySelector(`[data-testid="${CSS.escape(id)}"]`)
                if (!cell) {
                    outside.push(`${id} missing`)
                    continue
                }
                const rect = cell.getBoundingClientRect()
                if (rect.left < box.left || rect.right > box.right) outside.push(id)
                if (id.startsWith('register-cell-')) widths[column] = rect.width
                else headingWidths[column] = rect.width
            }
        }
        return { outside, widths, headingWidths }
    }, COLUMNS)
}

// Runs in the page: where the first mounted item of the visible rows scroller starts in its
// scrolled content (0 when the list draws from its first item), and the scroller's position.
async function rowsStart(page: Page) {
    return page.evaluate(() => {
        const scroller = Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid="register-rows"]')
        ).find(element => element.checkVisibility())
        const first = scroller?.querySelector(
            '[data-testid^="register-row-"], [data-testid="register-opening-row"]'
        )
        if (!scroller || !first) return { offset: -1, scrollTop: -1 }
        const top = scroller.getBoundingClientRect().top
        return {
            offset: Math.round(first.getBoundingClientRect().top - top + scroller.scrollTop),
            scrollTop: Math.round(scroller.scrollTop),
        }
    })
}

function focusedTestId(page: Page) {
    return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
}

async function chooseRange(page: Page, name: string) {
    await page.getByTestId('register-range').filter({ visible: true }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
    await expect(page.getByTestId('register-range').filter({ visible: true })).toContainText(name)
    await expect(page.getByTestId('register-loading')).toHaveCount(0)
}

// The Books sidebar's Chart of Accounts link (desktop), not the register's back link: the
// sidebar pushes the chart over the register, so the register stays mounted and hidden.
async function openChartFromSidebar(page: Page) {
    const item = page.getByTestId('books-nav-accounts')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await toggle.waitFor({ state: 'attached' })
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('account-search').filter({ visible: true })).toBeVisible()
}

// This month, not a fiscal range: other specs change the fiscal start month on the shared DB,
// which reloads a fiscal-range register mid-test (as account-register-drawer.spec.ts does).
async function openChecking(page: Page, size: { width: number; height: number }) {
    await page.setViewportSize(size)
    await openRegister(page, 'Business Checking')
    await chooseRange(page, 'This month')
}

test.describe('reconcile: register table fit', () => {
    test('the table at its narrowest width, then cards', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        // Headless Chromium draws overlay scrollbars with no gutter; classic ones prove that the
        // table's measured gutter reaches the fit. The page is not loaded again, so this stays.
        await page.addStyleTag({ content: '::-webkit-scrollbar { width: 15px; height: 15px }' })
        await openChecking(page, { width: 1280, height: 800 })

        const table = page.getByTestId('register-table')
        await expect(table).toBeVisible()
        await expect.poll(() => sidewaysScrollers(page)).toEqual([])

        const main = page.getByTestId('register-main')
        const rows = page.getByTestId('register-rows')
        await expect(rows).toBeVisible()
        await expect
            .poll(() =>
                rows.evaluate((element: HTMLElement) => element.offsetWidth - element.clientWidth)
            )
            .toBe(15)
        const gutter = await rows.evaluate(
            (element: HTMLElement) => element.offsetWidth - element.clientWidth
        )
        const mainWidth = await main.evaluate(element =>
            Math.round(element.getBoundingClientRect().width)
        )
        const narrowest = 1280 - (mainWidth - (REGISTER_TABLE_MIN_WIDTH + gutter))
        expect(narrowest).toBeGreaterThan(1024)

        await page.setViewportSize({ width: narrowest, height: 800 })
        await expect
            .poll(() => main.evaluate(element => Math.round(element.getBoundingClientRect().width)))
            .toBe(REGISTER_TABLE_MIN_WIDTH + gutter)
        await expect(table).toBeVisible()
        await expect.poll(() => sidewaysScrollers(page)).toEqual([])
        await expect.poll(async () => (await tableCells(page)).outside).toEqual([])
        const { widths, headingWidths } = await tableCells(page)
        expect(widths.type).toBeGreaterThanOrEqual(72)
        expect(widths.memo).toBeGreaterThanOrEqual(88)
        expect(widths.account).toBeGreaterThanOrEqual(72)
        // The Status column (reconcile spec §3 "The account register") is a fixed cell of 96.
        expect(headingWidths.status).toBe(96)
        expect(widths.status).toBe(96)

        await page.setViewportSize({ width: narrowest - 1, height: 800 })
        await expect(page.getByTestId('register-cards')).toBeVisible()
        await expect(table).toHaveCount(0)
        await expect.poll(() => sidewaysScrollers(page)).toEqual([])
    })

    test('beside the open entry', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await openChecking(page, DESKTOP_TALL)

        // The last entry row above the opening row: far from the list's top, so a card list
        // that opened at its top would leave it out of view.
        const opening = page.getByTestId('register-opening-row')
        await revealRegisterItem(page, opening)
        const lastRow = page.locator(ROWS).last()
        const lineId = ((await lastRow.getAttribute('data-testid')) ?? '').replace(
            'register-row-',
            ''
        )
        expect(lineId).not.toBe('')
        const row = page.getByTestId(`register-row-${lineId}`)
        await row.focus()
        await page.keyboard.press('Enter')

        const drawer = page.getByTestId('register-entry-drawer')
        await expect(drawer).toBeVisible()
        await expect(page.getByRole('complementary', { name: /Entry/ })).toBeVisible()
        await expect(page.getByTestId('register-cards')).toBeVisible()
        await expect(page.getByTestId('register-table')).toHaveCount(0)
        await expect.poll(() => sidewaysScrollers(page)).toEqual([])
        await expect
            .poll(async () => {
                const mainBox = await page.getByTestId('register-main').boundingBox()
                const drawerBox = await drawer.boundingBox()
                if (!mainBox || !drawerBox) return Number.NaN
                return drawerBox.x - (mainBox.x + mainBox.width)
            })
            .toBeGreaterThanOrEqual(0)
        // Beside the drawer the header is about 576 wide: its buttons wrap, so the Reconcile
        // button is neither cut nor under the drawer.
        const reconcile = page.getByTestId('register-reconcile').filter({ visible: true })
        await expect(reconcile).toBeVisible()
        await expect
            .poll(async () => {
                const mainBox = await page.getByTestId('register-main').boundingBox()
                const buttonBox = await reconcile.boundingBox()
                if (!mainBox || !buttonBox) return 'no box'
                const inside =
                    buttonBox.x >= mainBox.x &&
                    buttonBox.y >= mainBox.y &&
                    buttonBox.x + buttonBox.width <= mainBox.x + mainBox.width &&
                    buttonBox.y + buttonBox.height <= mainBox.y + mainBox.height
                return inside ? 'inside' : JSON.stringify({ mainBox, buttonBox })
            })
            .toBe('inside')
        const card = page.getByTestId(`register-card-${lineId}`)
        await expect(card).toHaveClass(ACCENT)
        await expect(card).toBeInViewport()
        await expect(card).toBeFocused()

        await page.getByTestId('register-drawer-close').click()
        await expect(page.getByTestId('register-table')).toBeVisible()
        await expect(page.getByTestId('register-cards')).toHaveCount(0)
        await expect(row).toBeInViewport()
        await expect(row).toBeFocused()

        // The anchor does not outlive the visit.
        await openRegister(page, 'Accounts receivable')
        await expect(page.getByTestId('register-title').filter({ visible: true })).toContainText(
            'Accounts receivable'
        )
        await openRegister(page, 'Business Checking')
        await expect(page.getByTestId('register-title').filter({ visible: true })).toContainText(
            'Business Checking'
        )
        await expect(page.getByTestId('register-table').filter({ visible: true })).toBeVisible()
        await expect(page.locator(ROWS).filter({ visible: true }).first()).toBeVisible()
        await expect.poll(() => rowsStart(page)).toEqual({ offset: 0, scrollTop: 0 })
        expect(await focusedTestId(page)).not.toMatch(/^register-row-/)

        // Nor a range change: open and close the same row, then change the range and back.
        await chooseRange(page, 'This month')
        const again = page.getByTestId(`register-row-${lineId}`).filter({ visible: true })
        await revealRegisterItem(page, again)
        await again.focus()
        await page.keyboard.press('Enter')
        await expect(drawer.filter({ visible: true })).toBeVisible()
        await page.getByTestId('register-drawer-close').filter({ visible: true }).click()
        await expect(page.getByTestId('register-table').filter({ visible: true })).toBeVisible()
        await expect(again).toBeFocused()

        await chooseRange(page, 'Last fiscal year')
        await expect(
            page
                .getByTestId('register-empty-range')
                .or(page.getByTestId('register-table'))
                .filter({ visible: true })
        ).toBeVisible()
        await chooseRange(page, 'This month')
        await expect(page.getByTestId('register-table').filter({ visible: true })).toBeVisible()
        await expect(page.locator(ROWS).filter({ visible: true }).first()).toBeVisible()
        await expect.poll(() => rowsStart(page)).toEqual({ offset: 0, scrollTop: 0 })
        expect(await focusedTestId(page)).not.toMatch(/^register-row-/)

        // Nor a leave through the sidebar, which keeps the register mounted under the chart.
        await revealRegisterItem(page, again)
        await again.focus()
        await page.keyboard.press('Enter')
        await expect(drawer.filter({ visible: true })).toBeVisible()
        await page.getByTestId('register-drawer-close').filter({ visible: true }).click()
        await expect(again).toBeFocused()
        await openChartFromSidebar(page)
        await chooseViewRegister(page, 'Business Checking')
        await expect(page.getByTestId('register-title').filter({ visible: true })).toContainText(
            'Business Checking'
        )
        await expect(page.getByTestId('register-table').filter({ visible: true })).toBeVisible()
        await expect(page.locator(ROWS).filter({ visible: true }).first()).toBeVisible()
        await expect.poll(() => rowsStart(page)).toEqual({ offset: 0, scrollTop: 0 })
        expect(await focusedTestId(page)).not.toMatch(/^register-row-/)
    })
})
