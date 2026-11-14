import { expect, type Locator, type Page, type Response, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ESTIMATE_IDS } from '../../tinycld/books/lib/estimate-form-fixture'
import {
    LONG_DECLINE_REASON,
    UNKNOWN_TOKEN,
} from '../../tinycld/books/lib/estimate-public-link-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    ESTIMATE_URL,
    estimateIdFromUrl,
    estimateNumberOf,
    openNewEstimate,
    pickEstimateCustomer,
    pickEstimateLineProduct,
} from './estimate-helpers'
import {
    ACCESS_POINT,
    booksContact,
    chooseSelect,
    createLinkedEstimate,
    HARBORVIEW,
    LINK_COPIED,
    openPublicPage,
    PUBLIC_LINK_PATTERN,
    publicCard,
    publicLinkOf,
    seededEstimateToken,
    tokenOfLink,
} from './estimate-public-link-helpers'
import { uniqueMemo } from './invoice-helpers'

// The customer's page of an estimate and the Books action that copies its link
// (estimate-public-link spec §3.1, §3.2, §3.4). Every estimate a test acts on is made by
// driving the estimate form with a unique memo; a test that only looks at a seeded
// estimate's page reads its token with a read-only signed-in GET. The business name,
// email and phone are shared settings (books-settings.spec.ts changes them): no test
// asserts their values, only what the page shows of them against what it reads.
//
// The public page runs the same code at every width, so its only phone run is the Books
// phone bar, where Copy customer link is a More row. Not driven here: the org logo with a
// logo set (the e2e deployment has none), native, light and dark (gate 2).

const MONEY = /-?\$[\d,]+\.\d{2}/
const PUBLIC_PDF = /^\/api\/books\/public\/estimates\/([^/]+)\/pdf$/
const PRIVATE_COLLECTIONS =
    /(?:^|[^a-z_])(books_estimates|books_estimate_lines|books_customers|books_settings|books_estimate_responses)(?![a-z_])/

// The record keys of books_estimate_public: its columns and PocketBase's own two
// (server/estimate_public_test.go publicViewKeys).
const PUBLIC_VIEW_KEYS = [
    'accepted_by',
    'accepted_date',
    'business_email',
    'business_name',
    'business_phone',
    'collectionId',
    'collectionName',
    'currency',
    'customer_name',
    'date',
    'expiration_date',
    'id',
    'message',
    'number',
    'status',
    'token',
    'total',
]

const OUTCOME_IDS = [
    'estimate-public-accepted',
    'estimate-public-declined',
    'estimate-public-closed',
    'estimate-public-expired',
]

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

// What the card draws above the business name: its own text and any image. With no logo
// the page draws neither an image nor core's initials avatar there.
function aboveBusiness(card: Locator) {
    return card.evaluate(root => {
        const business = root.querySelector('[data-testid="estimate-public-business"]')
        if (!business) return null
        let text = ''
        let images = 0
        for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el === business || el.contains(business)) continue
            if (!(business.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) continue
            if (el.tagName === 'IMG') images += 1
            for (const node of Array.from(el.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? ''
            }
        }
        return { text: text.trim(), images }
    })
}

function isLinkButton(locator: Locator) {
    return locator.evaluate(el => el.closest('[role="button"], [role="link"], a, button') !== null)
}

test.describe('estimate-public-link: customer page', () => {
    test('copy and open the link', async ({ page, browser }) => {
        const memo = uniqueMemo('Estimate public copy')
        const message = `Thanks for the walk-through ${memo}`
        await openBooks(page)
        await openNewEstimate(page)
        await pickEstimateCustomer(page, HARBORVIEW.name)
        await pickEstimateLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-message').fill(message)
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(memo)

        // A new, unsaved estimate has no link to copy.
        await expect(page.getByTestId('estimate-cancel')).toBeVisible()
        await expect(page.getByTestId('estimate-copy-link')).toHaveCount(0)

        await memoInput.focus()
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(ESTIMATE_URL)
        const number = await estimateNumberOf(page)
        await expect(page.getByTestId('estimate-copy-link')).toBeVisible()
        const total = await moneyIn(page.getByTestId('estimate-total-figure'))

        // ⌥L copies the link and says so.
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.evaluate(() => navigator.clipboard.writeText(''))
        await page.keyboard.press('Alt+l')
        await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toMatch(PUBLIC_LINK_PATTERN)
        const link = await page.evaluate(() => navigator.clipboard.readText())
        expect(new URL(link).origin).toBe(new URL(page.url()).origin)

        // Core's list names the key under the Estimate group.
        await page.getByTestId('estimate-cancel').focus()
        await page.keyboard.press('Shift+?')
        const list = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(list).toBeVisible()
        const group = list.getByText('Estimate', { exact: true }).locator('..')
        await expect(group.getByText('Copy customer link', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)

        const contact = await booksContact(page)
        const customer = await openPublicPage(browser, link)
        try {
            const q = customer.page
            const card = publicCard(q)
            await expect(card).toBeVisible()

            // Outside the app shell: no rail, no Books sidebar, no sign-in form.
            await expect(q.getByTestId('nav-home')).toHaveCount(0)
            await expect(q.getByTestId('nav-more')).toHaveCount(0)
            await expect(q.getByTestId('books-nav-accounting-toggle')).toHaveCount(0)
            await expect(q.getByTestId('identifier')).toHaveCount(0)
            await expect(q.getByPlaceholder('Password')).toHaveCount(0)

            const businessNode = q.getByTestId('estimate-public-business')
            await expect(businessNode).not.toHaveText('')
            const business = (await businessNode.innerText()).trim()
            expect(business).not.toBe('')

            await expect(q.getByTestId('estimate-public-heading')).toHaveText(
                `Estimate ${number} for ${HARBORVIEW.name}`
            )
            await expect(q.getByTestId('estimate-public-total')).toHaveText(total)
            await expect(q.getByTestId('estimate-public-dates')).toHaveText(/^Estimate date /)
            await expect(q.getByTestId('estimate-public-message')).toHaveText(message)
            await expect
                .poll(() => q.title())
                .toMatch(
                    new RegExp(
                        `Estimate ${number} · ${business.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
                    )
                )

            // No logo is set on the e2e deployment: nothing is drawn above the business name.
            expect(await aboveBusiness(card)).toEqual({ text: '', images: 0 })

            // The contact line shows exactly when Books has an email or a phone.
            const contactLine = q.getByTestId('estimate-public-contact')
            if (contact.email || contact.phone) {
                await expect(contactLine).toContainText(`Questions? Contact ${business}`)
                for (const value of [contact.email, contact.phone].filter(Boolean)) {
                    const button = contactLine.getByText(value, { exact: true })
                    await expect(button).toBeVisible()
                    expect(await isLinkButton(button)).toBe(true)
                }
            } else {
                await expect(contactLine).toHaveCount(0)
            }

            // At 1280 the card is at most 560 wide and centred.
            await expect
                .poll(async () => (await card.boundingBox())?.width ?? Number.NaN)
                .toBeLessThanOrEqual(560)
            await expect
                .poll(async () => {
                    const box = await card.boundingBox()
                    const pageWidth = await q.evaluate(() => document.documentElement.clientWidth)
                    if (!box) return Number.NaN
                    return Math.abs(box.x + box.width / 2 - pageWidth / 2)
                })
                .toBeLessThanOrEqual(2)
        } finally {
            await customer.close()
        }
    })

    test('phone: Copy customer link from More', async ({ page, browser }) => {
        const memo = uniqueMemo('Estimate public phone')
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewEstimate(page)
        await pickEstimateCustomer(page, HARBORVIEW.name)
        await pickEstimateLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(memo)

        await page.getByTestId('estimate-more').click()
        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        const number = await estimateNumberOf(page)

        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.evaluate(() => navigator.clipboard.writeText(''))
        await page.getByTestId('estimate-more').click()
        const row = page.getByRole('menuitem').filter({ hasText: 'Copy customer link' })
        await expect(row).toBeVisible()
        await page.getByTestId('estimate-copy-link').click()
        await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toMatch(PUBLIC_LINK_PATTERN)
        const link = await page.evaluate(() => navigator.clipboard.readText())

        const customer = await openPublicPage(browser, link, { viewport: PHONE })
        try {
            const q = customer.page
            await expect(q.getByTestId('estimate-public-heading')).toHaveText(
                new RegExp(`^Estimate ${number} for `)
            )
            // Full width minus the page padding.
            await expect
                .poll(async () => (await publicCard(q).boundingBox())?.width ?? 0)
                .toBeGreaterThan(340)
        } finally {
            await customer.close()
        }
    })

    test('the signed-out page leaks nothing', async ({ page, browser }) => {
        const phrase = uniqueMemo('Ceiling run behind the lobby soffit')
        await openBooks(page)
        const first = await createLinkedEstimate(page, { lineDescription: phrase })
        await page.getByTestId('estimate-cancel').click()
        await expect(page).not.toHaveURL(ESTIMATE_URL)
        const second = await createLinkedEstimate(page)
        expect(second.id).not.toBe(first.id)

        const context = await browser.newContext({ baseURL: new URL(first.link).origin })
        try {
            const q = await context.newPage()
            const paths: string[] = []
            const bodies: Promise<{ path: string; body: string }>[] = []
            // The realtime connection is a streamed fetch (text/event-stream) that stays
            // open while the page lives, so its response body never ends and
            // `response.text()` never settles: read its chunks as they arrive through the
            // DevTools protocol instead.
            const streamed: string[] = []
            const streams = new Set<string>()
            const cdp = await context.newCDPSession(q)
            await cdp.send('Network.enable')
            cdp.on('Network.responseReceived', event => {
                if (event.response.mimeType !== 'text/event-stream') return
                streams.add(event.requestId)
                void cdp
                    .send('Network.streamResourceContent', { requestId: event.requestId })
                    .then(({ bufferedData }) => {
                        streamed.push(Buffer.from(bufferedData, 'base64').toString())
                    })
                    // A stream that ends with the context has nothing left to read; the
                    // PB_CONNECT poll below fails if the capture never started.
                    .catch(() => undefined)
            })
            cdp.on('Network.dataReceived', event => {
                if (!streams.has(event.requestId) || !event.data) return
                streamed.push(Buffer.from(event.data, 'base64').toString())
            })
            q.on('response', (response: Response) => {
                const url = new URL(response.url())
                if (!url.pathname.startsWith('/api/')) return
                paths.push(`${url.pathname}${url.search}`)
                const type = response.headers()['content-type'] ?? ''
                if (type.includes('text/event-stream')) return
                bodies.push(
                    response
                        .text()
                        .catch(() => '')
                        .then(body => ({ path: url.pathname, body }))
                )
            })
            await q.goto(first.link)
            await expect(publicCard(q)).toBeVisible()
            await expect(q.getByTestId('estimate-public-heading')).toHaveText(
                new RegExp(`^Estimate ${first.number} for `)
            )

            expect(paths.length).toBeGreaterThan(0)
            for (const path of paths) {
                expect(decodeURIComponent(path)).not.toMatch(PRIVATE_COLLECTIONS)
            }
            // The stream's first message (PB_CONNECT) proves the capture is live.
            await expect.poll(() => streamed.join('')).toContain('PB_CONNECT')
            const seen = [
                ...(await Promise.all(bodies)),
                ...streamed.map(body => ({ path: '/api/realtime (stream)', body })),
            ]
            for (const { path, body } of seen) {
                for (const secret of [first.memo, phrase, HARBORVIEW.email, second.id]) {
                    expect(body, `${path} carries ${secret}`).not.toContain(secret)
                }
            }
            const viewReads = seen.filter(
                ({ path }) => path === '/api/collections/books_estimate_public/records'
            )
            expect(viewReads.length).toBeGreaterThan(0)
            for (const { body } of viewReads) {
                const items = (JSON.parse(body) as { items: Record<string, unknown>[] }).items
                expect(items).toHaveLength(1)
                expect(Object.keys(items[0] ?? {}).sort()).toEqual(PUBLIC_VIEW_KEYS)
                expect(items[0]?.id).toBe(first.id)
            }

            // The view lists nothing without a token, and one token never reaches
            // another estimate's row.
            const bare = await context.request.get('/api/collections/books_estimate_public/records')
            expect(((await bare.json()) as { totalItems: number }).totalItems).toBe(0)
            const filter = { filter: `id="${first.id}"` }
            const crossed = await context.request.get(
                '/api/collections/books_estimate_public/records',
                { params: filter, headers: { 'X-Share-Token': tokenOfLink(second.link) } }
            )
            expect(((await crossed.json()) as { totalItems: number }).totalItems).toBe(0)
            const own = await context.request.get(
                '/api/collections/books_estimate_public/records',
                {
                    params: filter,
                    headers: { 'X-Share-Token': tokenOfLink(first.link) },
                }
            )
            expect(((await own.json()) as { totalItems: number }).totalItems).toBe(1)
        } finally {
            await context.close()
        }
    })

    test('Download PDF', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)
        const token = tokenOfLink(estimate.link)
        const path = `/api/books/public/estimates/${token}/pdf`

        const customer = await openPublicPage(browser, estimate.link)
        try {
            const q = customer.page
            await expect(publicCard(q)).toBeVisible()
            const download = q.waitForEvent('download')
            await q.getByTestId('estimate-public-pdf').click()
            const file = await download
            expect(file.suggestedFilename()).toBe(`estimate-${estimate.number}.pdf`)
            expect(new URL(file.url()).pathname).toMatch(PUBLIC_PDF)
            expect(new URL(file.url()).pathname).toBe(path)
            expect(await file.failure()).toBeNull()

            // The context never signed in: the token alone serves the PDF.
            const served = await q.context().request.get(path)
            expect(served.status()).toBe(200)
            expect(served.headers()['content-type']).toContain('application/pdf')

            const last = token.slice(-1)
            const wrong = `${token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
            const refused = await q
                .context()
                .request.get(`/api/books/public/estimates/${wrong}/pdf`)
            expect(refused.status()).toBe(404)
        } finally {
            await customer.close()
        }
    })

    test('outcomes without a decision', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const customer = await openPublicPage(browser, estimate.link)
        try {
            const q = customer.page
            await expect(publicCard(q)).toBeVisible()
            for (const id of OUTCOME_IDS) await expect(q.getByTestId(id)).toHaveCount(0)

            // The business accepts it in Books; the next read of the page shows it.
            await chooseSelect(page, 'status', 'Accepted')
            await page.getByTestId('form-input-accepted_by').fill('Dana Whitfield')
            await page.getByTestId('estimate-save').click()
            await expect(page.getByTestId('estimate-badge')).toHaveText('Accepted')
            expect(estimateIdFromUrl(page)).toBe(estimate.id)
            const acceptedDate = await page.getByTestId('form-input-accepted_date').inputValue()
            expect(acceptedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

            await q.reload()
            const accepted = q.getByTestId('estimate-public-accepted')
            await expect(accepted).toContainText(
                `You accepted this estimate on ${formatDay(acceptedDate)}.`
            )
            await expect(accepted).toContainText('Accepted by Dana Whitfield.')
            await expect(q.getByTestId('estimate-public-accept')).toHaveCount(0)
            await expect(q.getByTestId('estimate-public-decline')).toHaveCount(0)

            // Seeded 1004, rejected by hand: declined, and no reason on the page.
            await q.goto(publicLinkOf(page, await seededEstimateToken(page, ESTIMATE_IDS.rejected)))
            await expect(q.getByTestId('estimate-public-declined')).toHaveText(
                'You declined this estimate.'
            )
            await expect(publicCard(q)).not.toContainText('Reason')
            await expect(publicCard(q)).not.toContainText(LONG_DECLINE_REASON.slice(0, 40))
            await expect(q.getByTestId('estimate-public-accept')).toHaveCount(0)

            // Seeded 1005, made into an invoice.
            await q.goto(publicLinkOf(page, await seededEstimateToken(page, ESTIMATE_IDS.closed)))
            await expect(q.getByTestId('estimate-public-closed')).toHaveText(
                /has turned this estimate into an invoice\.$/
            )
            await expect(q.getByTestId('estimate-public-accept')).toHaveCount(0)

            // Seeded 1002, pending but expired on Oct 31, 2026.
            await q.goto(publicLinkOf(page, await seededEstimateToken(page, ESTIMATE_IDS.expired)))
            await expect(q.getByTestId('estimate-public-expired')).toHaveText(
                /^This estimate expired on Oct 31, 2026\. Contact /
            )
            await expect(q.getByTestId('estimate-public-accept')).toHaveCount(0)
            await expect(q.getByTestId('estimate-public-decline')).toHaveCount(0)

            // A token no estimate has: Not found, and nothing about any business.
            await q.goto(publicLinkOf(page, UNKNOWN_TOKEN))
            const notFound = q.getByTestId('estimate-public-not-found')
            await expect(notFound).toContainText('This link is not valid.')
            await expect(notFound).toContainText('Ask the business that sent it for a new link.')
            await expect(q.getByTestId('estimate-public-business')).toHaveCount(0)
        } finally {
            await customer.close()
        }
    })

    test('load error and Try again', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const context = await browser.newContext({ baseURL: new URL(estimate.link).origin })
        try {
            const q = await context.newPage()
            const VIEW_READ = '**/api/collections/books_estimate_public/records*'
            const fail = (route: Route) => route.fulfill({ status: 400 })
            await q.route(VIEW_READ, fail)
            await q.goto(estimate.link)
            await expect(q.getByTestId('estimate-public-error')).toContainText(
                'The estimate could not load.'
            )
            await expect(q.getByTestId('estimate-public-retry')).toBeVisible()
            await expect(publicCard(q)).toHaveCount(0)

            // Hold the next read, then lift the failure: Try again shows Loading while the
            // read is held, then the card.
            const release: { open: () => void } = { open: () => {} }
            const held = new Promise<void>(resolve => {
                release.open = resolve
            })
            let heldReads = 0
            await q.route(VIEW_READ, async route => {
                heldReads += 1
                await held
                await route.continue()
            })
            await q.unroute(VIEW_READ, fail)
            await q.getByTestId('estimate-public-retry').click()
            await expect(q.getByTestId('estimate-public-loading')).toContainText(
                'Loading estimate…'
            )
            await expect.poll(() => heldReads).toBeGreaterThan(0)
            release.open()
            await expect(q.getByTestId('estimate-public-heading')).toHaveText(
                new RegExp(`^Estimate ${estimate.number} for `)
            )
            await expect(q.getByTestId('estimate-public-loading')).toHaveCount(0)
            await q.unrouteAll({ behavior: 'wait' })
        } finally {
            await context.close()
        }
    })
})
