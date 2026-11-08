import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BANKING_DESKTOP,
    BANKING_PHONE,
    bankCard,
    bankCards,
    bankStrip,
    connectionIdOf,
    openBanking,
    openFilesTab,
    selectedCard,
} from './banking-helpers'
import { navigateInApp } from './record-form-helpers'

// The Banking page reads the seeded connections only (1000 Business Checking with one
// uploaded file, checking-2026-09.csv, and the imported checking-2026-10.ofx; 2100 Company
// Card with one uploaded OFX statement, card-2026-10.ofx) and writes nothing, so it needs no account of its own. Other banking
// specs add number-less accounts, which sort after these two.

const CHECKING = '1000 Business Checking'
const CARD = '2100 Company Card'
const SEED_FILE = 'checking-2026-09.csv'
const REVIEW_SEED_FILE = 'checking-2026-10.ofx'
const CARD_FILE = 'card-2026-10.ofx'
const UPLOADED_DAY_BY = /[A-Z][a-z]{2} \d{1,2}, \d{4} by /

function fileItems(page: Page): Locator {
    return page
        .getByTestId('bank-files')
        .locator(
            '[data-testid^="bank-file-"]:not([data-testid^="bank-file-remove-"]):not([data-testid^="bank-file-import-"])'
        )
}

// The ids of the Books sidebar's nav items, in rendered order.
function sidebarNavIds(page: Page) {
    return page
        .getByTestId('package-sidebar-mounted')
        .locator('[data-testid^="books-nav-"]')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')))
}

// Holds every files read whose filter names `connectionId`; other reads pass.
async function holdFilesOf(page: Page, connectionId: string) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    const held: string[] = []
    await page.route('**/api/collections/books_bank_files/records*', async (route: Route) => {
        const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
        if (!filter.includes(connectionId)) {
            await route.continue()
            return
        }
        held.push(filter)
        await released
        await route.continue()
    })
    return {
        held,
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

// The element that scrolls sideways: the strip itself or the first scroller inside it.
function stripScroll(page: Page) {
    return bankStrip(page).evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
        const scroller = scrolls(el) ? el : Array.from(el.querySelectorAll('*')).find(scrolls)
        return { scrollWidth: scroller?.scrollWidth ?? 0, clientWidth: scroller?.clientWidth ?? 0 }
    })
}

function scrollStripToStart(page: Page) {
    return bankStrip(page).evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
        const scroller = scrolls(el) ? el : Array.from(el.querySelectorAll('*')).find(scrolls)
        if (scroller) scroller.scrollLeft = 0
    })
}

// True when the card's box lies inside the strip's box.
async function cardInsideStrip(page: Page, card: Locator) {
    const [strip, box] = await Promise.all([bankStrip(page).boundingBox(), card.boundingBox()])
    if (!strip || !box) return false
    return box.x >= strip.x - 0.5 && box.x + box.width <= strip.x + strip.width + 0.5
}

test.describe('bank-connection: page', () => {
    test("shows the connected accounts and the selected account's files", async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await expect
            .poll(async () => (await sidebarNavIds(page)).slice(0, 2))
            .toEqual(['books-nav-banking', 'books-nav-lists'])
        await openBanking(page)

        const checking = bankCard(page, CHECKING)
        const card = bankCard(page, CARD)
        await expect(checking.getByText('Bank', { exact: true })).toBeVisible()
        await expect(checking.getByText('In Books', { exact: true })).toBeVisible()
        await expect(
            checking.getByText('First Community Bank ••4821', { exact: true })
        ).toBeVisible()
        await expect(card.getByText('Credit card', { exact: true })).toBeVisible()
        await expect(
            card.getByText('Northwind Card Services ••0937', { exact: true })
        ).toBeVisible()

        const checkingId = await connectionIdOf(checking)
        const cardId = await connectionIdOf(card)
        const order = await bankCards(page).evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('data-testid'))
        )
        expect(order.indexOf(`bank-card-${checkingId}`)).toBeGreaterThanOrEqual(0)
        expect(order.indexOf(`bank-card-${checkingId}`)).toBeLessThan(
            order.indexOf(`bank-card-${cardId}`)
        )
        await expect(selectedCard(page)).toHaveCount(1)
        await expect(bankCards(page).first()).toHaveAttribute('aria-selected', 'true')

        await checking.click()
        await expect(page).toHaveURL(new RegExp(`[?&]account=${checkingId}(&|$)`))
        await expect(page.getByTestId('bank-panel-title')).toHaveText(CHECKING)
        await expect(page.getByTestId('bank-panel-details')).toHaveText(
            'First Community Bank ••4821'
        )
        await openFilesTab(page)
        await expect(fileItems(page)).toHaveCount(2)
        const seedRow = fileItems(page).filter({ hasText: SEED_FILE })
        await expect(seedRow).toHaveCount(1)
        await expect(seedRow.getByText('CSV', { exact: true })).toBeVisible()
        await expect(seedRow.getByText('Waiting to import', { exact: true })).toBeVisible()
        await expect(seedRow).toContainText(UPLOADED_DAY_BY)
        const reviewSeedRow = fileItems(page).filter({
            has: page.getByText(REVIEW_SEED_FILE, { exact: true }),
        })
        await expect(reviewSeedRow).toHaveCount(1)
        await expect(
            reviewSeedRow.getByText('Imported: 12 transactions', { exact: true })
        ).toBeVisible()
        await expect(checking.getByText('1 file waiting', { exact: true })).toBeVisible()

        const hold = await holdFilesOf(page, cardId)
        await card.click()
        const panel = page.getByTestId('bank-panel')
        await expect(panel.getByTestId('bank-panel-loading')).toBeVisible()
        await expect(bankStrip(page)).toBeVisible()
        await expect(checking).toBeVisible()
        await expect(page.getByTestId('bank-connect')).toBeVisible()
        await expect(page.getByTestId('bank-loading')).toHaveCount(0)
        await expect.poll(() => hold.held.length).toBeGreaterThan(0)
        await hold.release()

        await expect(page.getByTestId('bank-panel-title')).toHaveText(CARD)
        const cardFile = fileItems(page).filter({
            has: page.getByText(CARD_FILE, { exact: true }),
        })
        await expect(cardFile).toHaveCount(1)
        await expect(cardFile.getByText('OFX', { exact: true })).toBeVisible()
        await expect(cardFile.getByText('Waiting to import', { exact: true })).toBeVisible()
        await expect(page.getByTestId('bank-files-empty')).toHaveCount(0)
        await expect(card.getByText('1 file waiting', { exact: true })).toBeVisible()

        await page.getByTestId('bank-panel-more').click()
        await expect(page.getByRole('menuitem')).toHaveText([
            'Edit bank details',
            'View register',
            'Disconnect',
        ])
        await page.getByRole('menuitem', { name: 'View register', exact: true }).click()
        await expect(page.getByTestId('register-title')).toContainText('Company Card')
    })

    test('the strip scrolls sideways and keeps the selected card in view', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await openBanking(page)
        await page.setViewportSize(BANKING_PHONE)

        await expect
            .poll(async () => {
                const { scrollWidth, clientWidth } = await stripScroll(page)
                return clientWidth > 0 && scrollWidth > clientWidth
            })
            .toBe(true)
        await expect
            .poll(async () => {
                const widths = await bankCards(page).evaluateAll(nodes =>
                    nodes.map(node => Math.round(node.getBoundingClientRect().width))
                )
                return widths.length >= 2 && widths.every(width => width === 240)
            })
            .toBe(true)

        const checking = bankCard(page, CHECKING)
        const card = bankCard(page, CARD)
        const cardId = await connectionIdOf(card)
        await scrollStripToStart(page)
        await expect.poll(() => cardInsideStrip(page, card)).toBe(false)

        const { pathname } = new URL(page.url())
        await navigateInApp(page, `${pathname}?account=${cardId}`)
        await expect(card).toHaveAttribute('aria-selected', 'true')
        await expect.poll(() => cardInsideStrip(page, card)).toBe(true)

        await checking.click()
        await openFilesTab(page)
        const seedFile = fileItems(page).filter({ hasText: SEED_FILE })
        await expect(seedFile).toHaveCount(1)
        await expect(seedFile.getByText(/^Uploaded [A-Z][a-z]{2} \d{1,2}, \d{4} by /)).toBeVisible()

        const connect = page.getByTestId('bank-connect')
        await expect(connect).toBeVisible()
        await expect(connect).toHaveAccessibleName('Connect account')
        await expect(connect).not.toContainText('Connect account')
    })

    test('an error offers Retry, which loads the accounts', async ({ page }) => {
        await page.route('**/api/collections/books_bank_connections/records*', route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: '{"status":400,"message":"Something went wrong.","data":{}}',
            })
        )
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const error = page.getByTestId('bank-error')
        await expect(error).toContainText('Books could not load your bank accounts.')
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('bank-retry').click()

        await expect(bankCard(page, CHECKING)).toBeVisible()
        await expect(error).toHaveCount(0)
    })
})
