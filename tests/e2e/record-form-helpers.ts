import { expect, type Locator, type Page, type Route, type ViewportSize } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Shared by the record-form e2e specs (customers, vendors). Records are created by
// driving the form, never by raw PocketBase writes. The database is shared by every
// spec file on two workers, so a spec never edits a seeded record, names its own rows
// with `uniqueName`, and finds rows through the list's search (the list renders a
// window of rows, so a row may be out of view without a search).

export { DESKTOP, isPhone, PHONE }

// The strings that tell one record kind's screens apart.
export type RecordKind = {
    // Test-id prefix of the record's surface, rows, cards and menus (`customer`).
    recordPrefix: string
    // Test-id prefix of the list screen, its toolbar, banner and empty states (`customers`).
    listPrefix: string
    // The URL segment after `/books/` (`customers`).
    pathSegment: string
    // The PocketBase collection (`books_customers`).
    collection: string
    // The Lists hub card that opens the list.
    listCard: string
    newTitle: string
    deleteTitle: string
    discardMessage: string
}

// Wide enough for the panel surface (DETAIL_PANEL_MIN_WINDOW is 1360).
export const WIDE = { width: 1600, height: 1000 }

// Still the tablet breakpoint (table, not cards). Its content area is 768 - 64 (rail) - 175
// (tablet sidebar) = 529 px, narrower than the table's 540 px minimum; at 800 it is 561 px.
export const TABLET = { width: 768, height: 900 }

export const CLASSIC_SCROLLBARS = '::-webkit-scrollbar { width: 15px; height: 15px; }'

// Core Settings, not Books' own /a/books/settings.
export const SETTINGS_URL = /\/a\/settings(\/|$)/

const PANEL_WIDTH = 480

function viewportName(page: Page) {
    const width = page.viewportSize()?.width ?? DESKTOP.width
    if (width >= WIDE.width) return 'wide'
    return isPhone(page) ? 'phone' : 'desktop'
}

// A name no other spec, viewport or earlier run can have.
export function uniqueName(page: Page, label: string) {
    return `${label} ${viewportName(page)} ${Date.now()}`
}

// Four digits that differ between runs, for phone numbers and emails.
export function stampDigits() {
    return String(Date.now() % 10000).padStart(4, '0')
}

// An in-app navigation (no reload), as a link from outside the list would make.
export async function navigateInApp(page: Page, path: string) {
    await page.evaluate(url => {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
}

// react-native-web marks a disabled Pressable with aria-disabled, a disabled input with
// the attribute.
export function isDisabled(locator: Locator) {
    return locator.evaluate(
        el => el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')
    )
}

export function boxOf(locator: Locator) {
    return locator.boundingBox()
}

// Edges rounded to whole pixels, for a stable comparison.
export async function edges(locator: Locator) {
    const box = await boxOf(locator)
    if (!box) return null
    return {
        left: Math.round(box.x),
        right: Math.round(box.x + box.width),
        top: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
    }
}

export async function leftEdgeOf(locator: Locator) {
    return (await edges(locator))?.left ?? Number.NaN
}

// The content area, with the Books sidebar open: from the right edge of the sidebar to
// the right edge of the window. A collapsed sidebar keeps its content laid out inside a
// zero-width box, so its edge is read only while it is open.
export async function contentArea(page: Page) {
    const sidebar = await boxOf(page.getByTestId('package-sidebar-mounted'))
    const width = page.viewportSize()?.width ?? WIDE.width
    if (!sidebar) return null
    return { left: sidebar.x + sidebar.width, right: width }
}

export async function sideBySide(left: Locator, right: Locator) {
    const [a, b] = await Promise.all([boxOf(left), boxOf(right)])
    if (!a || !b) return false
    return Math.abs(a.y - b.y) < 1 && b.x >= a.x + a.width - 1
}

// True when `lower` starts below the bottom of `upper` (they do not share a top).
export async function stacked(upper: Locator, lower: Locator) {
    const [a, b] = await Promise.all([boxOf(upper), boxOf(lower)])
    if (!a || !b) return false
    return b.y >= a.y + a.height - 1
}

// The type or inputmode the browser gives the input, for its on-screen keyboard.
export function inputKinds(locator: Locator) {
    return locator.evaluate(el => [el.getAttribute('type'), el.getAttribute('inputmode')])
}

// True when a click at the element's center reaches the element itself, not a layer above it.
export function takesClickAtCenter(locator: Locator) {
    return locator.evaluate(el => {
        const box = el.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return hit !== null && (hit === el || el.contains(hit))
    })
}

// The opacity the user sees on the element: its own times every ancestor's.
export function effectiveOpacity(locator: Locator) {
    return locator.evaluate(el => {
        let opacity = 1
        for (let node: Element | null = el; node; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity)
        }
        return opacity
    })
}

export function backgroundOf(locator: Locator) {
    return locator.evaluate(el => getComputedStyle(el).backgroundColor)
}

// `bg-accent` resolved in the page: tinycld/global.css declares `--accent` as an RGB
// triple per theme.
export function accentOf(page: Page, testId: string) {
    return page
        .getByTestId(testId)
        .evaluate(
            el =>
                `rgb(${getComputedStyle(el).getPropertyValue('--accent').trim().split(/\s+/).join(', ')})`
        )
}

export function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches an element whose whole text, trimmed, is `text`.
export function exactText(text: string) {
    return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`)
}

export async function textLeft(entry: Locator, name: string) {
    return (await entry.getByText(name, { exact: true }).boundingBox())?.x ?? 0
}

export async function textTop(scope: Locator, text: string) {
    return (await scope.getByText(text, { exact: true }).boundingBox())?.y ?? -1
}

export async function expectTextInsideCell(cell: Locator, text: string) {
    const label = cell.getByText(text, { exact: true })
    await expect(label).toBeVisible()
    await expect
        .poll(async () => {
            const [cellBox, labelBox] = await Promise.all([cell.boundingBox(), label.boundingBox()])
            if (!cellBox || !labelBox) return false
            return (
                labelBox.width > 40 &&
                labelBox.x + labelBox.width <= cellBox.x + cellBox.width + 0.5
            )
        })
        .toBe(true)
}

// Keys whose field cell starts above the cell before it (a pair may share a top).
export async function fieldCellsOutOfOrder(page: Page, keys: readonly string[]) {
    const tops = await Promise.all(
        keys.map(async key => (await boxOf(page.getByTestId(`form-field-${key}`)))?.y ?? -1)
    )
    return keys.filter((_key, i) => tops[i] < 0 || (i > 0 && tops[i] < tops[i - 1]))
}

// The app handles a server answer in the frames after it arrives: two frames later, a
// save's success or refusal handler has run.
export async function afterNextFrames(page: Page) {
    await page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

// Two frames and a task in the page, so work queued by a response that just arrived (a
// mutation's onSuccess and any navigation it starts) has run.
export function settle(page: Page) {
    return page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve)))
            )
    )
}

// Away from Books to core Settings: a tab of core's package switcher like any package,
// and present in every workspace (CI assembles Books alone, with no other package). The
// rail has a Settings link; a phone has no rail, and Settings is a row of the More drawer.
// The drawer has no test id, so its row is found next to its Sign out row: the Books
// sidebar has a Settings item too.
export async function leaveBooks(page: Page) {
    if (isPhone(page)) {
        await page.getByTestId('nav-more').click()
        const signOut = page.getByText('Sign out', { exact: true })
        await expect(signOut).toBeVisible()
        await signOut
            .locator('xpath=ancestor::*[.//text()[normalize-space()="Settings"]][1]')
            .getByText('Settings', { exact: true })
            .click()
        // The drawer slides out after the move; a row pressed while it moves is not stable.
        await expect(signOut).toBeHidden()
    } else {
        await page.getByTestId('nav-settings').click()
    }
    // Settings is not a package, so it has no pkg-active marker; its URL and its window
    // title show it.
    await expect(page).toHaveURL(SETTINGS_URL)
    await expect(page).toHaveTitle(/Settings/)
}

// Back to Books: a rail link, or on a phone the MobileTabBar's tab. With more packages
// than the tab bar holds, Books is a row of the More drawer instead.
export async function returnToBooks(page: Page) {
    if (isPhone(page)) {
        const books = page.getByTestId('nav-books')
        if ((await books.count()) === 0) await page.getByTestId('nav-more').click()
        await books.click()
    } else {
        await navigateToPackage(page, 'books')
    }
    await expect(page.getByTestId('pkg-active-books')).toBeVisible()
    await expect(page).toHaveURL(/\/books(\/|$)/)
}

// Holds every load of `url`, so what it answers is not ready. `held` lists the held
// loads; `release` lets them through.
export async function holdLoads(page: Page, url: string) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    const held: string[] = []
    const handler = async (route: Route) => {
        held.push(route.request().url())
        await released
        await route.continue()
    }
    await page.route(url, handler)
    return {
        held,
        // Waits for the held handlers: removing a route under a pending handler hands
        // its request on, and the handler's own `continue` then fails.
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

// Books open at the given viewport. The rail links that navigateToPackage clicks are
// absent below the phone breakpoint, so the viewport changes after it.
export async function openBooks(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

// A new page in this test's browser context, logged in, in Books, at `size`. `intercept`
// runs before the page loads anything, so its routes catch the page's first list request
// even when Books reopens at the list.
export async function openBooksPage(
    page: Page,
    size: ViewportSize,
    // Its result is ignored; `page.route` resolves to a Disposable.
    intercept: (fresh: Page) => Promise<unknown>
) {
    const fresh = await page.context().newPage()
    await intercept(fresh)
    await login(fresh)
    await navigateToPackage(fresh, 'books')
    await fresh.setViewportSize(size)
    return fresh
}

export type PatchAnswer = 'refuse' | 'pass'

// Answers each `method` request on the routed URL with a refusal (`message`) that names
// no field, or after `hold` waits for `release`, which refuses it or (`'pass'`) lets it
// reach the server. `urls` lists the requests seen.
export function refusedWrites(message: string, method: 'PATCH' | 'POST' | 'DELETE' = 'PATCH') {
    const urls: string[] = []
    let gate = Promise.resolve<PatchAnswer>('refuse')
    let open = (_answer: PatchAnswer) => {}
    const handler = async (route: Route) => {
        if (route.request().method() !== method) {
            await route.continue()
            return
        }
        urls.push(route.request().url())
        if ((await gate) === 'pass') {
            await route.continue()
            return
        }
        await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 400, message, data: {} }),
        })
    }
    return {
        urls,
        handler,
        hold: () => {
            gate = new Promise<PatchAnswer>(resolve => {
                open = resolve
            })
        },
        release: (answer: PatchAnswer = 'refuse') => open(answer),
    }
}

export type HeldWrite = { arrived: Promise<void>; release(): Promise<void> }

// Holds the next `method` request on the routed URL; every other request passes.
// `arrived` resolves once the write reaches the route; `release` sends it on to the
// server and removes the route once its handler is done.
export async function holdWrite(
    page: Page,
    url: string,
    method: 'PATCH' | 'DELETE'
): Promise<HeldWrite> {
    let openGate = () => {}
    const released = new Promise<void>(resolve => {
        openGate = resolve
    })
    let arrive = () => {}
    const arrived = new Promise<void>(resolve => {
        arrive = resolve
    })
    let finish = () => {}
    const finished = new Promise<void>(resolve => {
        finish = resolve
    })
    const handler = async (route: Route) => {
        if (route.request().method() !== method) return route.continue()
        arrive()
        await released
        await route.continue()
        finish()
    }
    await page.route(url, handler)
    return {
        arrived,
        release: async () => {
            openGate()
            await finished
            await page.unroute(url, handler)
        },
    }
}

export function refusalToast(page: Page, text: string) {
    return page.getByTestId('toast-card').filter({ hasText: text })
}

// The helpers that name one record kind's test ids, collection, path and copy.
export function recordFormHelpers(kind: RecordKind) {
    const { recordPrefix, listPrefix, collection } = kind
    const recordsPath = `/api/collections/${collection}/records`

    function entryPrefix(page: Page) {
        return isPhone(page) ? `${recordPrefix}-card-` : `${recordPrefix}-row-`
    }

    // Every row (desktop) or card (phone) in the list, in screen order.
    function entries(page: Page): Locator {
        return page
            .getByTestId(`${listPrefix}-list`)
            .locator(`[data-testid^="${entryPrefix(page)}"]`)
    }

    // The row (desktop) or card (phone) whose name is exactly `name`. Another row may
    // carry the name in its company line, so a substring match would find it too.
    function entry(page: Page, name: string): Locator {
        return entries(page).filter({ has: page.getByText(name, { exact: true }) })
    }

    // The record's page or panel, whichever is shown.
    function surface(page: Page): Locator {
        return page
            .getByTestId(`${recordPrefix}-page`)
            .or(page.getByTestId(`${recordPrefix}-panel`))
            .filter({ visible: true })
    }

    // From anywhere in Books to the list, with no record open.
    async function openList(page: Page) {
        const list = page.getByTestId(`${listPrefix}-list`)
        const pageBack = page.getByTestId(`${recordPrefix}-back`)
        const panelClose = page.getByTestId(`${recordPrefix}-close`)
        const notFoundBack = page.getByTestId(`${recordPrefix}-not-found-back`)
        const listCard = page.getByTestId(kind.listCard)
        // A fresh page may reopen Books at its last route (the list, or a record), and
        // pressing the nav item over either would stack a second screen.
        await expect(
            list.or(pageBack).or(panelClose).or(notFoundBack).or(listCard).first()
        ).toBeAttached()

        // The URL and the record's screen do not change together. A record arriving: the
        // list renders before the record's screen over it (a lazy route). A record leaving
        // (Cancel, then dismissTo): the screen goes before the URL leaves the record path.
        // So wait until the screen's way out shows or the URL no longer names a record,
        // reading both again on each poll, instead of trusting one read of the URL.
        const recordPath = new RegExp(`/books/${kind.pathSegment}/[^/]+$`)
        const wayOut = pageBack.or(panelClose).or(notFoundBack).filter({ visible: true }).first()
        await expect
            .poll(
                async () =>
                    (await wayOut.isVisible()) || !recordPath.test(new URL(page.url()).pathname)
            )
            .toBe(true)

        // A disabled way out means a save is in flight: the screen leaves, or enables the
        // control again, by itself. A click on it waits for an enabled control that may
        // detach first, so wait until it is hidden or enabled, then click only if it shows.
        // Counting a locator never waits on a detached element; isEnabled() would.
        const disabled = page.locator('[aria-disabled="true"], [disabled]')
        for (const leave of [pageBack, panelClose, notFoundBack]) {
            await expect(leave.and(disabled).filter({ visible: true })).toHaveCount(0)
            if (await leave.isVisible()) {
                await leave.click()
                await expect(leave).toBeHidden()
            }
        }
        if (await list.isVisible()) return

        if (!isPhone(page) && !(await listCard.isVisible())) {
            await page.getByTestId('books-nav-lists').click()
        }
        await listCard.click()
        await expect(list).toBeVisible()
    }

    // Clicks the field first, so a layer over the list that takes the pointer fails here.
    async function search(page: Page, text: string) {
        const input = page.getByTestId(`${listPrefix}-search`)
        await input.click()
        await input.fill(text)
        await expect(input).toHaveValue(text)
    }

    async function idOf(page: Page, name: string): Promise<string> {
        const found = entry(page, name)
        await expect(found).toHaveCount(1)
        const testId = await found.getAttribute('data-testid')
        const prefix = entryPrefix(page)
        if (!testId?.startsWith(prefix)) throw new Error(`no ${prefix}<id> test id for ${name}`)
        return testId.slice(prefix.length)
    }

    // The list must be reachable (Books open). Searches for the record and opens it from
    // its row or card.
    async function open(page: Page, name: string) {
        await openList(page)
        await search(page, name)
        await entry(page, name).click()
        await expect(surface(page)).toBeVisible()
    }

    // The input of a form field: core text kinds and ContactInput use `form-input-<key>`.
    function field(page: Page, key: string): Locator {
        return surface(page).getByTestId(`form-input-${key}`)
    }

    // From anywhere in Books to an empty New form, through the list header button.
    async function openNew(page: Page) {
        await openList(page)
        await page.getByTestId(`${recordPrefix}-new-header`).click()
        await expect(surface(page)).toBeVisible()
        await expect(page.getByTestId(`${recordPrefix}-title`)).toHaveText(kind.newTitle)
    }

    // Creates a record through the New form and waits for the list to show again.
    async function create(
        page: Page,
        values: { name: string; company?: string; email?: string; phone?: string }
    ) {
        await openNew(page)
        await field(page, 'display_name').fill(values.name)
        for (const [key, value] of [
            ['company', values.company],
            ['email', values.email],
            ['phone', values.phone],
        ] as const) {
            if (value !== undefined) await field(page, key).fill(value)
        }
        await page.getByTestId(`${recordPrefix}-save`).click()
        await expect(page.getByTestId(`${listPrefix}-list`)).toBeVisible()
        await expect(surface(page)).toBeHidden()
    }

    // The "Discard changes?" question. It is core ConfirmDialog, whose buttons have no test
    // ids (and a phone shows it as a sheet with no dialog role), so every part is found by
    // text.
    function discardDialog(page: Page) {
        return {
            title: page.getByText('Discard changes?', { exact: true }),
            message: page.getByText(kind.discardMessage, { exact: true }),
            keepEditing: page.getByText('Keep editing', { exact: true }),
            discard: page.getByText('Discard', { exact: true }),
        }
    }

    // `/a/.../books/<pathSegment>`, read from the current URL so an org segment is kept.
    function base(page: Page) {
        const { pathname } = new URL(page.url())
        return `${pathname.slice(0, pathname.indexOf('/books/'))}/books/${kind.pathSegment}`
    }

    function recordUrl(id: string) {
        return `**${recordsPath}/${id}`
    }

    // Holds the next PATCH or DELETE of one record (`holdWrite`).
    function holdRecordWrite(page: Page, id: string, method: 'PATCH' | 'DELETE') {
        return holdWrite(page, recordUrl(id), method)
    }

    // A click on the title moves focus off any input: react-native-web's TextInput stops
    // every keydown from reaching the window, where the Escape shortcut listens.
    async function pressEscapeOutsideInputs(page: Page) {
        await page.getByTestId(`${recordPrefix}-title`).click()
        await page.keyboard.press('Escape')
    }

    function isRecordUrl(id: string) {
        return (url: URL) => url.pathname.endsWith(`${recordsPath}/${id}`)
    }

    // The collection's records endpoint, where a create POSTs.
    function isRecordsUrl(url: URL) {
        return url.pathname.endsWith(recordsPath)
    }

    // A PATCH of the record that the server answered.
    function patchAnswered(page: Page, id: string) {
        const matches = isRecordUrl(id)
        return page.waitForResponse(
            r => r.request().method() === 'PATCH' && matches(new URL(r.url()))
        )
    }

    // A create of a record that the server answered.
    function insertAnswered(page: Page) {
        return page.waitForResponse(
            r => r.request().method() === 'POST' && isRecordsUrl(new URL(r.url()))
        )
    }

    // The horizontal scroller of the table: the test id's element, or the first one inside it.
    function tableScroll(page: Page) {
        return page.getByTestId(`${listPrefix}-table`).evaluate(el => {
            const scrolls = (node: Element) =>
                ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
            const scroller = scrolls(el) ? el : Array.from(el.querySelectorAll('*')).find(scrolls)
            return {
                scrollWidth: scroller?.scrollWidth ?? 0,
                clientWidth: scroller?.clientWidth ?? 0,
            }
        })
    }

    // The table's header row (it has no test id): the first child of the vertical
    // scroller's content, measured only when it holds the column titles.
    function headerRowWidth(page: Page) {
        return page.getByTestId(`${listPrefix}-table`).evaluate(el => {
            const scrolls = (node: Element) =>
                ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
            const scroller = Array.from(el.querySelectorAll('*')).find(scrolls)
            const row = scroller?.firstElementChild?.firstElementChild
            if (!row || !/Name.*Email.*Phone/is.test(row.textContent ?? '')) return 0
            return row.getBoundingClientRect().width
        })
    }

    async function expectEntriesInOrder(page: Page, names: readonly string[]) {
        const shown = entries(page)
        await expect(shown).toHaveCount(names.length)
        for (const [index, name] of names.entries()) {
            await expect(shown.nth(index).getByText(name, { exact: true })).toBeVisible()
        }
    }

    // The panel's width and where it sits against the content area and the list.
    async function panelPlacement(page: Page) {
        const [panel, list, content] = await Promise.all([
            edges(page.getByTestId(`${recordPrefix}-panel`)),
            edges(page.getByTestId(`${listPrefix}-list`)),
            contentArea(page),
        ])
        if (!panel || !list || !content) return null
        return {
            widthIs480: Math.abs(panel.width - PANEL_WIDTH) <= 1,
            atContentRight: Math.abs(panel.right - content.right) <= 1,
            listToItsLeft: list.right <= panel.left + 1 && list.width > 0,
        }
    }

    // True when the list fills the content area from edge to edge.
    async function listSpansContent(page: Page) {
        const [list, content] = await Promise.all([
            edges(page.getByTestId(`${listPrefix}-list`)),
            contentArea(page),
        ])
        if (!list || !content) return false
        return Math.abs(list.left - content.left) <= 1 && Math.abs(list.right - content.right) <= 1
    }

    // City, State or region and Postal code share a top, and none runs into the next or
    // past the address block (the core `min-w-0` fix on TextInput).
    async function cityLineFits(page: Page, fieldKey: string) {
        const part = (name: string) => boxOf(page.getByTestId(`form-input-${fieldKey}-${name}`))
        const [city, region, postal, block] = await Promise.all([
            part('city'),
            part('region'),
            part('postal_code'),
            boxOf(page.getByTestId(`address-${fieldKey}`)),
        ])
        if (!city || !region || !postal || !block) return null
        return {
            shareTop: Math.abs(city.y - region.y) < 1 && Math.abs(region.y - postal.y) < 1,
            cityBeforeRegion: city.x + city.width <= region.x + 0.5,
            regionBeforePostal: region.x + region.width <= postal.x + 0.5,
            postalInsideBlock: postal.x + postal.width <= block.x + block.width + 0.5,
        }
    }

    // From now on, records whether the not-found message or the Discard changes? question
    // ever appears, even for one frame.
    function watchForNotFoundAndDiscard(page: Page) {
        return page.evaluate(notFoundId => {
            const seen = { notFound: false, discard: false }
            new MutationObserver(() => {
                if (document.querySelector(`[data-testid="${notFoundId}"]`)) seen.notFound = true
                if (document.body.textContent?.includes('Discard changes?')) seen.discard = true
            }).observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
            })
            Object.assign(window, { __recordSeen: seen })
        }, `${recordPrefix}-not-found`)
    }

    function seenNotFoundOrDiscard(page: Page) {
        return page.evaluate(
            () => (window as unknown as { __recordSeen: Record<string, boolean> }).__recordSeen
        )
    }

    // To the Books Lists hub with the `t k` jump, the way out while a dialog's backdrop
    // takes the pointer off the sidebar, and waits until the hub shows.
    async function jumpToLists(page: Page) {
        await page.keyboard.press('t')
        await page.keyboard.press('k')
        await expect(page).toHaveURL(/\/books\/lists$/)
        await expect(page.getByTestId(kind.listCard)).toBeVisible()
    }

    // The button that opens a record from its row or card. Its accessible name carries
    // the display name; the row menu is a separate button beside it.
    function openButton(page: Page, name: string) {
        return page.getByTestId(`${listPrefix}-list`).getByRole('button', { name })
    }

    function menuItem(page: Page, item: string) {
        return page.getByTestId(`${recordPrefix}-menu-${item}`)
    }

    async function openMenu(page: Page, id: string) {
        await page.getByTestId(`${recordPrefix}-menu-${id}`).click()
        await expect(menuItem(page, 'edit')).toBeVisible()
    }

    async function closeMenu(page: Page) {
        await page.keyboard.press('Escape')
        await expect(menuItem(page, 'edit')).toHaveCount(0)
    }

    async function chooseFromMenu(page: Page, id: string, item: string) {
        await openMenu(page, id)
        await menuItem(page, item).click()
    }

    function deleteDialog(page: Page) {
        const prefix = `delete-${recordPrefix}`
        return {
            root: page.getByTestId(`${prefix}-dialog`),
            // A phone shows the dialog as a sheet with no dialog role; its title is text.
            title: page.getByText(kind.deleteTitle, { exact: true }),
            body: page.getByTestId(`${prefix}-dialog-body`),
            confirm: page.getByTestId(`${prefix}-confirm`),
            close: page.getByTestId(`${prefix}-close`),
        }
    }

    async function openDeleteDialog(page: Page, id: string) {
        await chooseFromMenu(page, id, 'delete')
        const dialog = deleteDialog(page)
        await expect(dialog.root).toBeVisible()
        await expect(dialog.title).toBeVisible()
        return dialog
    }

    function inactiveLabel(row: Locator) {
        return row.getByText('Inactive', { exact: true })
    }

    // Answers only the DELETE of the record with the server's 400; every other request
    // passes.
    async function refuseDelete(page: Page, id: string, message: string) {
        await page.route(recordUrl(id), route => {
            if (route.request().method() !== 'DELETE') return route.continue()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ code: 400, message, data: {} }),
            })
        })
    }

    return {
        entries,
        entry,
        surface,
        openList,
        search,
        idOf,
        open,
        field,
        openNew,
        create,
        discardDialog,
        base,
        holdRecordWrite,
        pressEscapeOutsideInputs,
        recordUrl,
        isRecordUrl,
        isRecordsUrl,
        patchAnswered,
        insertAnswered,
        tableScroll,
        headerRowWidth,
        expectEntriesInOrder,
        panelPlacement,
        listSpansContent,
        cityLineFits,
        watchForNotFoundAndDiscard,
        seenNotFoundOrDiscard,
        jumpToLists,
        openButton,
        menuItem,
        openMenu,
        closeMenu,
        chooseFromMenu,
        deleteDialog,
        openDeleteDialog,
        inactiveLabel,
        refuseDelete,
    }
}
