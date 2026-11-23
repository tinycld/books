import { expect, type Locator, type Page } from '@playwright/test'

// Shared by the account-register e2e specs.
//
// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries the register reads are
// posted by `seed.ts` through the server's posting hook (dated relative to
// today, so no spec depends on the calendar). That is the seeded-fixture
// exception: the interaction under test (reading and navigating the register)
// is driven through the UI; only the pre-existing ledger state is seeded.

export const DESKTOP = { width: 1280, height: 800 }
export const PHONE = { width: 390, height: 844 }

// Memos of the entries seed.ts posts on Business Checking (checkpoint 3, Do 2).
export const REGISTER_SEED = {
    sale: 'Register sale',
    split: 'Register split payment',
    // Dated the 1st of this month; not posted when the seed runs on the 1st.
    monthStart: 'Register month start',
    voidOriginal: 'Register void original',
    corrected: 'Register corrected',
} as const

export function isPhone(page: Page) {
    return (page.viewportSize()?.width ?? DESKTOP.width) < 700
}

// MobileDrawer opens from a pan that starts in the 20px strip at the left edge;
// react-native-gesture-handler listens for the mouse on web, so a drag drives it.
// The pan's end decides open or closed from react-native-gesture-handler's fling
// velocity, a quadratic fit of the last moves' event timestamps. Moves sent by
// page.mouse are stamped when the browser takes them, so a busy machine (a stall
// of more than 40ms, then two moves 1ms apart) gives the fit a large negative
// velocity and the drawer closes. The moves go through CDP with their own evenly
// spaced timestamps (16ms, 5 -> 200 in 16 steps: about 800px/s), so the fling the
// gesture sees is the same on every run.
export async function swipeFromLeftEdge(page: Page): Promise<void> {
    const y = (page.viewportSize()?.height ?? 844) / 2
    const xs = [
        ...Array.from({ length: 8 }, (_, i) => 5 + (95 * (i + 1)) / 8),
        ...Array.from({ length: 8 }, (_, i) => 100 + (100 * (i + 1)) / 8),
    ]
    const cdp = await page.context().newCDPSession(page)
    let seconds = Date.now() / 1000
    const send = (type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number) =>
        cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            button: 'left',
            buttons: type === 'mouseReleased' ? 0 : 1,
            clickCount: 1,
            timestamp: seconds,
        })
    await send('mouseMoved', 5)
    await send('mousePressed', 5)
    for (const x of xs) {
        seconds += 0.016
        await send('mouseMoved', x)
    }
    seconds += 0.004
    await send('mouseReleased', 200)
    await cdp.detach()
}

// The Books landing, the dashboard, when it is the screen on top.
function shownDashboard(page: Page): Locator {
    return page.getByTestId('dashboard-screen').filter({ visible: true })
}

// From the dashboard to the Lists hub, the user's way: the sidebar's Lists entry on a wide
// screen, the same entry in the Books menu (the drawer, opened with a swipe from the left
// edge) on a phone. On any other screen it does nothing.
export async function showListsHub(page: Page) {
    if (!(await shownDashboard(page).isVisible())) return
    if (isPhone(page)) {
        const panel = page.getByTestId('mobile-drawer-panel')
        await panel.waitFor({ state: 'attached' })
        await swipeFromLeftEdge(page)
        await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
        await panel.getByTestId('books-nav-lists').click()
    } else {
        await page.getByTestId('books-nav-lists').click()
    }
    await expect(
        page.getByTestId('books-list-card-accounts').filter({ visible: true })
    ).toBeVisible()
}

// A row on wide screens, a card on phones. Only the visible chart's: the stack keeps an
// earlier chart mounted but hidden under a screen the sidebar opened on top of it. The
// name text matches exactly: `hasText` is a caseless substring of the whole row.
export function accountItem(page: Page, name: string): Locator {
    const prefix = isPhone(page) ? 'account-card-' : 'account-row-'
    return page
        .locator(`[data-testid^="${prefix}"]`)
        .filter({ has: page.getByText(name, { exact: true }), visible: true })
}

function chartSearch(page: Page) {
    return page.getByTestId('account-search').filter({ visible: true })
}

async function revealInactive(page: Page) {
    if (isPhone(page)) {
        await page.getByTestId('account-filter-button').click()
        await page.getByTestId('account-show-inactive').click()
        await page.keyboard.press('Escape')
        return
    }
    await page.getByTestId('account-show-inactive').click()
}

// Opens the Chart of Accounts: from a register through its back link, on a
// phone through the Lists card (from the dashboard, through the Lists hub first), on
// desktop through the Books sidebar.
export async function openChart(page: Page) {
    // Only the visible screen's links count: the stack keeps screens a later one was
    // pushed over mounted but hidden, each with its own back link.
    const back = page.getByTestId('register-back').filter({ visible: true })
    const landing = isPhone(page)
        ? page.getByTestId('books-list-card-accounts')
        : page.getByTestId('books-nav-accounting-toggle')
    // A fresh page restores the last route (lastPackageHref), which can be an entry screen
    // that has neither a register back link nor the hub card on a phone. Books lands on
    // the dashboard, which has no hub card.
    const entryBack = page.getByTestId('entry-back').filter({ visible: true })
    await entryBack
        .or(back)
        .or(landing)
        .or(shownDashboard(page))
        .first()
        .waitFor({ state: 'attached' })
    if (isPhone(page)) await showListsHub(page)
    if (await entryBack.isVisible()) {
        await entryBack.click()
        const list = page.getByTestId('entries-screen').filter({ visible: true })
        await back.or(landing).or(list).first().waitFor({ state: 'attached' })
        // On a phone the entries list has no way up to the Lists hub, and the tab bar restores
        // the last route, so route to the hub in-app (no page load) the way the not-found spec does.
        if (isPhone(page) && (await list.isVisible())) {
            await page.evaluate(url => {
                window.history.pushState({}, '', url)
                window.dispatchEvent(new PopStateEvent('popstate'))
            }, '/a/books/lists')
            await landing.waitFor({ state: 'visible' })
        }
    }
    if (await back.isVisible()) {
        await back.click()
    } else if (isPhone(page)) {
        await page.getByTestId('books-list-card-accounts').click()
    } else {
        const item = page.getByTestId('books-nav-accounts')
        const toggle = page.getByTestId('books-nav-accounting-toggle')
        await toggle.waitFor({ state: 'attached' })
        if (!(await item.isVisible())) await toggle.click()
        await item.click()
    }
    await expect(chartSearch(page)).toBeVisible()
}

// The Chart of Accounts must already be open. Chooses "View register" from the
// account's row or card menu.
export async function chooseViewRegister(page: Page, accountName: string) {
    if ((await accountItem(page, accountName).count()) === 0) await revealInactive(page)
    const item = accountItem(page, accountName)
    await item.locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'View register', exact: true }).click()
}

// The Chart of Accounts must already be open. Chooses "Make inactive" from the active
// account's row or card menu and waits for the server to store it: the chart drops the row
// before the server answers.
export async function makeAccountInactive(page: Page, accountName: string) {
    const stored = page.waitForResponse(
        response =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname.includes('/api/collections/books_accounts/records/')
    )
    await accountItem(page, accountName).locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'Make inactive', exact: true }).click()
    expect((await stored).status()).toBe(200)
    await expect(accountItem(page, accountName)).toHaveCount(0)
}

export async function openRegister(page: Page, accountName: string) {
    await openChart(page)
    await chooseViewRegister(page, accountName)
}

// Every item the register list mounts: entry cards and rows, and the opening balance item,
// which is last when the newest entry is on top and first in oldest-first order.
const REGISTER_ITEMS = [
    '[data-testid^="register-card-"]',
    '[data-testid^="register-row-"]',
    '[data-testid="register-opening-card"]',
    '[data-testid="register-opening-row"]',
].join(', ')

type RegisterMove = { move: 'top' | 'step' | 'stay'; items: string }

function registerMove(move: RegisterMove['move']): RegisterMove {
    return { move, items: REGISTER_ITEMS }
}

// Runs in the page. Finds the register's vertical scroller from the last mounted item and
// moves it. It looks the items up itself, in one synchronous pass, so a re-render cannot
// detach the item it measures (a handle resolved earlier can be gone by then). `mounted` is
// false while the list shows no item (it is loading). `offset` is where the first mounted
// item starts in the scrolled content: 0 when the list renders from its first item, in either
// sort order. A 'step' brings the last mounted item to the top edge, so a step never passes an
// item that has not mounted yet, even when a render lags behind the scroll. `atEnd` is true
// when a step could not move the list and the mounted items already reach its end (the
// spacer after the last one has no height).
function moveRegisterList({ move, items }: RegisterMove) {
    const mountedItems = document.querySelectorAll(items)
    const first = mountedItems[0]
    const last = mountedItems[mountedItems.length - 1]
    let list = last?.parentElement ?? null
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) {
        list = list.parentElement
    }
    if (!first || !last || !list) return { mounted: false, offset: -1, atEnd: false }
    const top = list.getBoundingClientRect().top
    const before = list.scrollTop
    if (move === 'top') list.scrollTop = 0
    if (move === 'step') list.scrollTop += last.getBoundingClientRect().top - top
    const spacerAfterLast = last.nextElementSibling?.getBoundingClientRect().height ?? 0
    return {
        mounted: true,
        offset: Math.round(first.getBoundingClientRect().top - top + list.scrollTop),
        atEnd: move === 'step' && list.scrollTop === before && spacerAfterLast === 0,
    }
}

// Waits two animation frames, so a render the last scroll started can land.
async function nextFrames(page: Page) {
    await page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

function lastRegisterItem(page: Page) {
    return page.locator(REGISTER_ITEMS).last()
}

// Scrolls the register list to its top and waits until it renders from its first item.
export async function scrollRegisterToTop(page: Page) {
    await expect(lastRegisterItem(page)).toBeAttached()
    await expect
        .poll(async () => (await page.evaluate(moveRegisterList, registerMove('top'))).offset)
        .toBe(0)
}

// True when the first item the register list mounts is the opening balance item, which is
// the case only in oldest-first order with the list at its top.
export async function openingItemIsFirst(page: Page) {
    return page.evaluate(items => {
        const id = document.querySelector(items)?.getAttribute('data-testid') ?? ''
        return id.startsWith('register-opening-')
    }, REGISTER_ITEMS)
}

// The register mounts only the items near its scroll position (useRowWindow). Other specs on
// the shared DB post entries dated today on Business Checking, and those sort above the seeded
// entries of the same day, so a seeded item can sit below the mounted items. Scroll the list
// from its top, as a user would, until the item mounts, then bring it into view.
export async function revealRegisterItem(page: Page, item: Locator) {
    await expect(lastRegisterItem(page)).toBeAttached()
    if ((await item.count()) === 0) {
        await scrollRegisterToTop(page)
        while ((await item.count()) === 0) {
            const { atEnd } = await page.evaluate(moveRegisterList, registerMove('step'))
            // A render can land between the count and the step, so count once more first.
            if (atEnd && (await item.count()) === 0) {
                throw new Error(
                    'The register list scrolled to its end and the item never mounted: it is not in this register and range.'
                )
            }
            await nextFrames(page)
        }
    }
    await item.scrollIntoViewIfNeeded()
}

// The Chart of Accounts must already be open. Creates an account of the given type and
// detail type (their menu labels) through the account panel, number-less unless a
// number is given.
export async function createAccount(
    page: Page,
    name: string,
    kind: { type: string; detailType: string },
    number?: string
): Promise<void> {
    await page.getByTestId(isPhone(page) ? 'account-new-header' : 'account-new-toolbar').click()
    const panel = page.getByTestId('account-panel')
    await expect(panel).toBeVisible()
    await page.getByLabel('Account name').fill(name)
    if (number !== undefined) await panel.getByLabel('Account number', { exact: true }).fill(number)
    await panel.getByTestId('account-type').click()
    await page.getByRole('menuitem', { name: kind.type, exact: true }).click()
    await panel.getByTestId('account-detail-type').click()
    await page.getByRole('menuitem', { name: kind.detailType, exact: true }).click()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(accountItem(page, name)).toBeVisible()
}

// The Chart of Accounts must already be open. Creates a number-less Income account
// through the account panel.
export async function createIncomeAccount(page: Page, name: string) {
    await createAccount(page, name, { type: 'Income', detailType: 'Service income' })
}
