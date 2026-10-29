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

// A row on wide screens, a card on phones.
export function accountItem(page: Page, name: string): Locator {
    const prefix = isPhone(page) ? 'account-card-' : 'account-row-'
    return page.locator(`[data-testid^="${prefix}"]`).filter({ hasText: name })
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
// phone through the Lists card, on desktop through the Books sidebar.
export async function openChart(page: Page) {
    const back = page.getByTestId('register-back')
    const landing = isPhone(page)
        ? page.getByTestId('books-list-card-accounts')
        : page.getByTestId('books-nav-accounting-toggle')
    // A fresh page restores the last route (lastPackageHref), which can be an entry screen
    // that has neither a register back link nor the hub card on a phone.
    const entryBack = page.getByTestId('entry-back')
    await entryBack.or(back).or(landing).first().waitFor({ state: 'attached' })
    if (await entryBack.isVisible()) {
        await entryBack.click()
        const list = page.getByTestId('entries-screen')
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
    await expect(page.getByTestId('account-search')).toBeVisible()
}

// The Chart of Accounts must already be open. Chooses "View register" from the
// account's row or card menu.
export async function chooseViewRegister(page: Page, accountName: string) {
    if ((await accountItem(page, accountName).count()) === 0) await revealInactive(page)
    const item = accountItem(page, accountName)
    await item.locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'View register', exact: true }).click()
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

// Returns the element's box once it has held still for several frames. A sheet, drawer or panel
// scales in on mount, so a box read straight after `toBeVisible` can be mid-transform (a 44px
// minHeight reads as 43.9999). Waiting for a stable rect is deterministic; a tolerance is not.
export async function settledBox(locator: Locator) {
    await locator.evaluate(
        el =>
            new Promise<void>(resolve => {
                let last = ''
                let still = 0
                let frames = 0
                const tick = () => {
                    const box = el.getBoundingClientRect()
                    const key = [box.x, box.y, box.width, box.height].join()
                    still = key === last ? still + 1 : 0
                    last = key
                    frames += 1
                    if (still >= 8 || frames > 240) resolve()
                    else requestAnimationFrame(tick)
                }
                tick()
            })
    )
    return locator.boundingBox()
}
