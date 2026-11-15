import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { openEstimateBySearch } from './estimate-helpers'
import {
    acceptOnPage,
    createLinkedEstimate,
    declineOnPage,
    openPublicPage,
    publicCard,
    setEstimateStatus,
} from './estimate-public-link-helpers'

// The customer's decision on the public page (estimate-public-link spec §3.3, §3.5): the
// Accept and Decline steps, the response write, its refusals and network failure, and what
// Books shows after. Every estimate is made by driving the estimate form with a unique memo.
// The business name is shared state: it is read from `estimate-public-business` on the
// same page, never asserted by value. The page runs the same code at every width, so it
// has no phone run.

const RESPONSES = '**/api/collections/books_estimate_responses/records*'
const RESPONSES_PATH = '/api/collections/books_estimate_responses/records'
const VIEW_PATH = '/api/collections/books_estimate_public/records'
const NOT_PENDING = 'This estimate is no longer waiting for an answer.'
const NETWORK = 'Could not send. Check your connection and try again.'
const GENERIC_TOAST = 'Something went wrong'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// Counts the requests the page sends to the responses collection.
function countResponseWrites(page: Page): () => number {
    let count = 0
    page.on('request', request => {
        if (new URL(request.url()).pathname === RESPONSES_PATH) count += 1
    })
    return () => count
}

// A route that holds every response write until `release` runs, then continues or aborts it.
async function holdResponses(page: Page, finish: (route: Route) => Promise<void>) {
    const gate: { open: () => void } = { open: () => {} }
    const held = new Promise<void>(resolve => {
        gate.open = resolve
    })
    let seen = 0
    const handler = async (route: Route) => {
        seen += 1
        await held
        await finish(route)
    }
    await page.route(RESPONSES, handler)
    return { handler, release: () => gate.open(), seen: () => seen }
}

// Runs in the customer's page before its scripts. Chromium's offline emulation
// (`setOffline`) fails new requests but leaves an open realtime stream (a streamed fetch)
// running, where a real network loss ends it. This wraps `fetch` so that a test can end
// the page's open realtime streams the way a lost network does.
function cuttableRealtimeStreams() {
    const open = new Set<AbortController>()
    const platformFetch = window.fetch.bind(window)
    const target = window as unknown as { __cutRealtimeStreams: () => void }
    target.__cutRealtimeStreams = () => {
        for (const controller of open) controller.abort(new TypeError('network error'))
        open.clear()
    }
    window.fetch = (input, init) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!new URL(url, location.href).pathname.endsWith('/api/realtime')) {
            return platformFetch(input, init)
        }
        if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return platformFetch(input, init)
        const controller = new AbortController()
        init?.signal?.addEventListener('abort', () => controller.abort(init.signal?.reason))
        open.add(controller)
        return platformFetch(input, { ...init, signal: controller.signal })
    }
}

// The network goes away and comes back: the browser goes offline (the `offline` event),
// the open realtime stream ends, then the browser is online again (the `online` event).
async function dropNetwork(page: Page) {
    await page.context().setOffline(true)
    await page.evaluate(() =>
        (window as unknown as { __cutRealtimeStreams: () => void }).__cutRealtimeStreams()
    )
    await page.context().setOffline(false)
}

async function businessOf(page: Page): Promise<string> {
    const node = page.getByTestId('estimate-public-business')
    await expect(node).not.toHaveText('')
    const business = (await node.innerText()).trim()
    expect(business).not.toBe('')
    return business
}

// How far the width of `button` is from the card's content width (its box less its borders
// and padding).
async function widthsInCard(card: Locator, button: Locator) {
    return card.evaluate(
        (root, buttonEl) => {
            const style = getComputedStyle(root)
            const sides = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
            const inset = sides.reduce(
                (sum, side) => sum + Number.parseFloat(style[side as 'paddingLeft'] || '0'),
                0
            )
            const content = root.getBoundingClientRect().width - inset
            return Math.abs(content - (buttonEl as Element).getBoundingClientRect().width)
        },
        await button.elementHandle()
    )
}

// Whether `below` starts at or under the bottom of `above`.
async function isBelow(above: Locator, below: Locator): Promise<boolean> {
    const a = await above.boundingBox()
    const b = await below.boundingBox()
    if (!a || !b) return false
    return b.y >= a.y + a.height - 1
}

test.describe('estimate-public-link: customer decision', () => {
    test('accept', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const customer = await openPublicPage(browser, estimate.link)
        try {
            const q = customer.page
            const writes = countResponseWrites(q)
            const card = publicCard(q)
            await expect(card).toBeVisible()
            const business = await businessOf(q)

            const decide = q.getByTestId('estimate-public-decide')
            await expect(decide).toContainText(
                `To move forward, select Accept and ${business} will reach out with next steps.`
            )
            const accept = q.getByTestId('estimate-public-accept')
            const decline = q.getByTestId('estimate-public-decline')
            await expect(accept).toBeVisible()
            await expect(decline).toBeVisible()
            await expect.poll(() => widthsInCard(card, accept)).toBeLessThanOrEqual(2)
            await expect.poll(() => widthsInCard(card, decline)).toBeLessThanOrEqual(2)

            // Accept opens the step with the name focused.
            await accept.click()
            const step = q.getByTestId('estimate-public-accept-step')
            await expect(step).toBeVisible()
            const name = q.getByTestId('estimate-public-name-input')
            await expect(name).toBeFocused()

            // Enter on the empty name: the error under the field, and no write.
            await name.press('Enter')
            const nameField = q.getByTestId('estimate-public-name')
            await expect(nameField).toContainText('Enter your name.')
            await expect
                .poll(() => isBelow(name, nameField.getByText('Enter your name.')))
                .toBe(true)
            expect(writes()).toBe(0)

            await name.fill('n'.repeat(201))
            await name.press('Enter')
            await expect(nameField).toContainText('Use 200 characters or fewer.')
            expect(writes()).toBe(0)

            // Back closes the step and discards what was typed.
            await q.getByTestId('estimate-public-back').click()
            await expect(step).toHaveCount(0)
            await expect(accept).toBeVisible()
            await accept.click()
            await expect(step).toBeVisible()
            await expect(name).toHaveValue('')

            await name.fill('  Dana Whitfield  ')
            const hold = await holdResponses(q, route => route.continue())
            await name.press('Enter')
            const confirm = q.getByTestId('estimate-public-accept-confirm')
            const back = q.getByTestId('estimate-public-back')
            await expect(confirm).toContainText('Accepting…')
            await expect.poll(() => confirm.isDisabled()).toBe(true)
            await expect.poll(() => back.isDisabled()).toBe(true)
            await expect.poll(hold.seen).toBe(1)

            // The Books form, still open, gets an unsaved change before the answer is written.
            const memo = page.getByTestId('form-input-memo')
            await memo.fill(`${estimate.memo} edited`)
            hold.release()

            const accepted = q.getByTestId('estimate-public-accepted')
            await expect(accepted).toContainText(/You accepted this estimate on .+\./)
            await expect(accepted).toContainText('Accepted by Dana Whitfield.')
            await expect(accept).toHaveCount(0)
            await expect(decline).toHaveCount(0)
            await expect(q.getByText(GENERIC_TOAST)).toHaveCount(0)
            const pageDate = /You accepted this estimate on (.+?)\./.exec(
                await accepted.innerText()
            )?.[1]
            await q.unrouteAll({ behavior: 'wait' })

            // Saving that unsaved change after the answer is refused with the revision
            // conflict, and loading the current estimate shows the answer.
            await memo.focus()
            await page.keyboard.press('ControlOrMeta+s')
            await expect(page.getByTestId('estimate-conflict')).toBeVisible()
            await page.getByTestId('estimate-conflict-reload').click()
            await expect(page.getByTestId('estimate-conflict')).toHaveCount(0)
            await expect(page.getByTestId('form-input-status')).toContainText('Accepted')
            await expect(page.getByTestId('form-input-accepted_by')).toHaveValue('Dana Whitfield')
            const formDate = await page.getByTestId('form-input-accepted_date').inputValue()
            expect(formDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(pageDate).toBe(formatDay(formDate))
        } finally {
            await customer.close()
        }
    })

    test('decline with a reason', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const customer = await openPublicPage(browser, estimate.link)
        try {
            const q = customer.page
            const writes = countResponseWrites(q)
            await expect(publicCard(q)).toBeVisible()
            const business = await businessOf(q)

            const decline = q.getByTestId('estimate-public-decline')
            await expect(decline).toBeVisible()
            await decline.click()
            const step = q.getByTestId('estimate-public-decline-step')
            await expect(step).toContainText(
                `Decline this estimate? ${business} will see that you declined.`
            )
            const reason = q.getByTestId('estimate-public-reason-input')
            await expect(reason).toBeVisible()
            await expect(reason).not.toBeFocused()

            // Back closes the step and discards what was typed.
            await reason.fill('x')
            await q.getByTestId('estimate-public-back').click()
            await expect(step).toHaveCount(0)
            await decline.click()
            await expect(step).toBeVisible()
            await expect(reason).toHaveValue('')

            // Too long: the error under the field, and no write.
            const confirm = q.getByTestId('estimate-public-decline-confirm')
            await reason.fill('r'.repeat(1001))
            await confirm.click()
            const tooLong = q
                .getByTestId('estimate-public-reason')
                .getByText('Use 1000 characters or fewer.')
            await expect(tooLong).toBeVisible()
            await expect.poll(() => isBelow(reason, tooLong)).toBe(true)
            expect(writes()).toBe(0)

            // Enter in the reason is a line break, not a submit.
            await reason.fill('')
            await reason.pressSequentially('First line')
            await reason.press('Enter')
            await reason.pressSequentially('Second line')
            await expect(reason).toHaveValue('First line\nSecond line')
            await expect(step).toBeVisible()
            expect(writes()).toBe(0)

            await confirm.click()
            await expect(q.getByTestId('estimate-public-declined')).toHaveText(
                'You declined this estimate.'
            )
            await expect(publicCard(q)).not.toContainText('First line')
            await expect(publicCard(q)).not.toContainText('Second line')

            // Books: the estimate is Rejected, with no acceptance fields.
            await page.getByTestId('estimate-title').click()
            await openEstimateBySearch(page, estimate.memo)
            await expect(page.getByTestId('estimate-badge').filter({ visible: true })).toHaveText(
                'Rejected'
            )
            for (const id of ['estimate-accepted-by', 'estimate-accepted-date']) {
                await expect(page.getByTestId(id).filter({ visible: true })).toHaveCount(0)
            }
        } finally {
            await customer.close()
        }
    })

    test('refusal, then Pending again', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const customer = await openPublicPage(browser, estimate.link, {
            initScript: cuttableRealtimeStreams,
        })
        try {
            const q = customer.page
            await expect(q.getByTestId('estimate-public-decide')).toBeVisible()

            // The business rejects it while the page still offers the decision.
            await setEstimateStatus(page, 'Rejected')

            await acceptOnPage(q, 'Dana Whitfield')
            const refusal = q.getByTestId('estimate-public-refusal')
            await expect(refusal).toHaveText(NOT_PENDING)
            const declined = q.getByTestId('estimate-public-declined')
            await expect(declined).toBeVisible()
            await expect.poll(() => isBelow(refusal, declined)).toBe(true)
            await expect(q.getByText(GENERIC_TOAST)).toHaveCount(0)
            await expect(q.getByTestId('estimate-public-accept')).toHaveCount(0)

            // Set back to Pending, the link offers the decision again on the page's next
            // read, without a page reload. On web that read is the network coming back:
            // core useReloadOnResume reconnects realtime, and a signed-out (guest) client
            // never resumes its realtime session, so pbtsdb reloads the view.
            await setEstimateStatus(page, 'Pending')
            const reread = q.waitForResponse(
                response =>
                    new URL(response.url()).pathname === VIEW_PATH && response.status() === 200
            )
            await dropNetwork(q)
            await reread
            await expect(q.getByTestId('estimate-public-accept')).toBeVisible()
            await expect(q.getByTestId('estimate-public-decline')).toBeVisible()
            await expect(q.getByTestId('estimate-public-refusal')).toHaveCount(0)
            await expect(q.getByTestId('estimate-public-accept-step')).toHaveCount(0)
            await expect(q.getByTestId('estimate-public-decline-step')).toHaveCount(0)
            await expect(q.getByText(NOT_PENDING)).toHaveCount(0)

            // A new answer then counts, and no old refusal shows above its outcome.
            await acceptOnPage(q, 'Dana Whitfield')
            const accepted = q.getByTestId('estimate-public-accepted')
            await expect(accepted).toContainText('Accepted by Dana Whitfield.')
            await expect(q.getByTestId('estimate-public-refusal')).toHaveCount(0)
            await expect(q.getByText(NOT_PENDING)).toHaveCount(0)
        } finally {
            await customer.close()
        }
    })

    test('in flight and network failure', async ({ page, browser }) => {
        await openBooks(page)
        const estimate = await createLinkedEstimate(page)

        const customer = await openPublicPage(browser, estimate.link)
        try {
            const q = customer.page
            await expect(publicCard(q)).toBeVisible()
            const step = q.getByTestId('estimate-public-decline-step')
            const reason = q.getByTestId('estimate-public-reason-input')
            const confirm = q.getByTestId('estimate-public-decline-confirm')
            const back = q.getByTestId('estimate-public-back')

            const hold = await holdResponses(q, route => route.abort())
            await declineOnPage(q, 'Went with another bid')
            await expect(confirm).toContainText('Declining…')
            await expect.poll(() => confirm.isDisabled()).toBe(true)
            await expect.poll(() => back.isDisabled()).toBe(true)
            await expect.poll(hold.seen).toBe(1)
            hold.release()

            await expect(step).toContainText(NETWORK)
            await expect(step).toBeVisible()
            await expect(reason).toHaveValue('Went with another bid')
            await expect.poll(() => confirm.isDisabled()).toBe(false)
            await expect.poll(() => back.isDisabled()).toBe(false)
            await expect(confirm).toContainText('Decline estimate')

            await q.unroute(RESPONSES, hold.handler)
            await confirm.click()
            await expect(q.getByTestId('estimate-public-declined')).toHaveText(
                'You declined this estimate.'
            )
            await q.unrouteAll({ behavior: 'wait' })
        } finally {
            await customer.close()
        }
    })
})
