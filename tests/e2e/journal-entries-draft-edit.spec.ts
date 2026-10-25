import { expect, type Locator, type Page, type Request, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    DESKTOP,
    fillLine,
    holdRequests,
    isPhone,
    openEntriesList,
    openNewEntry,
    PHONE,
    settleFrames,
} from './journal-entries-helpers'

// Edit, post and delete an existing draft at `entries/<id>`, and the screen
// following a status change made in another session. Decisions that shape it
// (design gate): the draft is the same form as a new entry, seeded from the saved
// rows; Delete draft lives in the header More menu (`entry-header-more`, the
// phone action-bar overflow stays `entry-more`) behind a confirm dialog; a post
// made elsewhere flips the open screen to the read-only view during render.
//
// Drafts are made by driving the new-entry form (`createDraftEntry`); nothing is
// written raw. The seeded `ENTRIES_SEED.draft` is only opened, never changed or
// deleted: every test that edits, posts or deletes works on a draft it created.
// It does not cover a draft opened by a second member (draft rules are not
// owner-scoped and `isEditable` depends only on status and `canWrite`, and no
// second member is seeded) or a read-only user (no such member is seeded).
//
// Server refusals (a refused post of an open draft, a refused delete) use
// `page.route` to answer the request with a 400: no input makes the real server
// refuse these. Those tests cover how the screen reacts to a refusal, not the
// server's own rule. The held-request tests use `page.route` only to delay a write
// and then pass it on to the real server.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

function uniqueMemo(label: string, sizeName: string) {
    return `${label} ${sizeName} ${Date.now()}`
}

function listItems(page: Page, memo: string): Locator {
    return page.locator(isPhone(page) ? CARDS : ROWS).filter({ hasText: memo })
}

async function idOf(item: Locator): Promise<string> {
    const testId = await item.getAttribute('data-testid')
    return (testId ?? '').replace(/^entries-(row|card)-/, '')
}

// A line's account trigger holds its label as text, an amount field as its value.
function cellText(locator: Locator): Promise<string> {
    return locator.evaluate(el => {
        const value = (el as HTMLInputElement).value
        return (value ?? el.textContent ?? '').trim()
    })
}

async function expectCell(locator: Locator, expected: string) {
    await expect.poll(() => cellText(locator)).toBe(expected)
}

async function backToList(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

// The list sorts newest first and mounts only a window of rows, while parallel workers keep
// adding entries, so a row is found by searching for its memo instead of by its position.
async function searchList(page: Page, memo: string) {
    await page.getByTestId('entries-search').fill(memo)
}

async function openDraft(page: Page, memo: string) {
    await searchList(page, memo)
    const item = listItems(page, memo)
    await expect(item).toHaveCount(1)
    await item.click()
    await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
    await expect(page.getByTestId('entry-memo')).toHaveValue(memo)
}

async function makeDraft(page: Page, memo: string) {
    await createDraftEntry(page, {
        memo,
        amount: '$10.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
}

async function chooseDeleteDraft(page: Page) {
    await page.getByTestId('entry-header-more').click()
    await page.getByRole('menuitem', { name: 'Delete draft', exact: true }).click()
    await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: edit and delete drafts (${sizeName})`, () => {
        test('the seeded draft opens as an editable form', async ({ page }) => {
            await start(page, size)
            await openEntriesList(page)
            await searchList(page, ENTRIES_SEED.draft)
            await listItems(page, ENTRIES_SEED.draft).first().click()

            await expect(page.getByTestId('entry-title')).toHaveText('Journal entry')
            await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
            await expect(page.getByTestId('entry-memo')).toHaveValue(ENTRIES_SEED.draft)
            await expect(page.getByTestId('entry-date')).toBeEditable()
            await expect(page.getByTestId('entry-number')).toHaveText('Assigned when posted')
            await expect(page.getByTestId('entry-actions')).toBeVisible()
            await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
            await expectCell(page.getByTestId('entry-line-account-1'), ACCOUNT_LABELS.checking)
            await expectCell(page.getByTestId('entry-line-credit-1'), '$250.00')
            await expect(page.getByTestId('entry-line-debit-0')).toBeEditable()
        })

        test('edit: memo, an added line and a removed line persist in order', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Edit draft', sizeName)
            await makeDraft(page, memo)

            const edited = `${memo} edited`
            await page.getByTestId('entry-memo').fill(edited)
            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 2, {
                account: ACCOUNT_LABELS.equity,
                credit: '$4.00',
                memo: 'added four',
            })
            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 3, { account: ACCOUNT_LABELS.equity, credit: '$6.00' })
            // Removes the saved credit line; debits $10.00 equal the two new credits.
            await page.getByTestId('entry-line-menu-1').click()
            await page.getByRole('menuitem', { name: 'Delete line', exact: true }).click()
            await page.getByTestId('entry-save-draft').click()

            await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
            await backToList(page)
            await openDraft(page, edited)

            await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
            await expectCell(page.getByTestId('entry-line-account-0'), ACCOUNT_LABELS.checking)
            await expectCell(page.getByTestId('entry-line-debit-0'), '$10.00')
            await expectCell(page.getByTestId('entry-line-account-1'), ACCOUNT_LABELS.equity)
            await expectCell(page.getByTestId('entry-line-credit-1'), '$4.00')
            await expect(page.getByTestId('entry-line-memo-1')).toHaveValue('added four')
            await expectCell(page.getByTestId('entry-line-account-2'), ACCOUNT_LABELS.equity)
            await expectCell(page.getByTestId('entry-line-credit-2'), '$6.00')
        })

        test('post: an existing draft posts and shows the read-only view with a number', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Post draft', sizeName)
            await makeDraft(page, memo)
            await backToList(page)
            await openDraft(page, memo)

            await page.getByTestId('entry-post').click()
            await expect(page.getByTestId('entry-read-only')).toBeVisible()
            await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-actions')).toHaveCount(0)

            await backToList(page)
            await searchList(page, memo)
            await expect(listItems(page, memo)).toHaveCount(1)
        })

        test('delete: the header menu deletes the draft, Cancel keeps it', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Delete draft', sizeName)
            await makeDraft(page, memo)

            await chooseDeleteDraft(page)
            await page
                .getByTestId('delete-draft-dialog')
                .getByRole('button', { name: 'Cancel', exact: true })
                .click()
            await expect(page.getByTestId('delete-draft-dialog')).toHaveCount(0)
            await expect(page.getByTestId('entry-memo')).toHaveValue(memo)
            await backToList(page)
            await searchList(page, memo)
            await expect(listItems(page, memo)).toHaveCount(1)

            await openDraft(page, memo)
            await chooseDeleteDraft(page)
            await page.getByTestId('delete-draft-confirm').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await expect(listItems(page, memo)).toHaveCount(0)
            await searchList(page, ENTRIES_SEED.draft)
            await expect(listItems(page, ENTRIES_SEED.draft).first()).toBeVisible()
        })

        test('realtime: a post in another session flips the open draft and the list row', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Realtime draft', sizeName)
            await makeDraft(page, memo)
            await expect(page.getByTestId('entry-actions')).toBeVisible()

            const other = await page.context().newPage()
            await login(other)
            await navigateToPackage(other, 'books')
            await other.setViewportSize(size)
            await openEntriesList(other)
            await openDraft(other, memo)
            await other.getByTestId('entry-post').click()
            await expect(other.getByTestId('entry-read-only')).toBeVisible()

            await expect(page.getByTestId('entry-read-only')).toBeVisible()
            await expect(page.getByTestId('entry-actions')).toHaveCount(0)
            await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await other.close()
        })

        test('realtime: a post in another session updates the open list row', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Realtime row', sizeName)
            await makeDraft(page, memo)
            await backToList(page)
            await searchList(page, memo)
            const item = listItems(page, memo)
            const id = await idOf(item)
            await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Draft')
            if (!isPhone(page)) {
                await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText('Draft')
            }

            const other = await page.context().newPage()
            await login(other)
            await navigateToPackage(other, 'books')
            await other.setViewportSize(size)
            await openEntriesList(other)
            await openDraft(other, memo)
            await other.getByTestId('entry-post').click()
            await expect(other.getByTestId('entry-read-only')).toBeVisible()

            await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Posted')
            if (!isPhone(page)) {
                await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText(/^JE-\d+$/)
            }
            await other.close()
        })
    })
}

const ENTRY_RECORDS = '**/api/collections/books_journal_entries/records/*'
const REFUSAL = 'Books are closed through 2026-09-30.'

function isStatusPost(request: Request) {
    return request.method() === 'PATCH' && (request.postData() ?? '').includes('"status":"posted"')
}

function refuse(route: Route, message: string) {
    return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message, data: {} }),
    })
}

async function openSecondPage(page: Page, size: { width: number; height: number }) {
    const other = await page.context().newPage()
    await login(other)
    await navigateToPackage(other, 'books')
    await other.setViewportSize(size)
    await openEntriesList(other)
    return other
}

async function pressPostAndNew(page: Page) {
    if (isPhone(page)) await page.getByTestId('entry-more').click()
    await page.getByTestId('entry-post-new').click()
}

async function leaveWithDiscard(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('discard-dialog')).toBeVisible()
    await page.getByTestId('discard-confirm').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: draft edit review fixes (${sizeName})`, () => {
        test('a refused post of an open draft brings the form back with the typed values and the message', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Refused open post', sizeName)
            await makeDraft(page, memo)
            await page.route(ENTRY_RECORDS, route =>
                isStatusPost(route.request()) ? refuse(route, REFUSAL) : route.continue()
            )

            const typed = `${memo} typed`
            await page.getByTestId('entry-memo').fill(typed)
            await page.getByTestId('entry-post').click()

            await expect(page.getByTestId('entry-error-summary')).toContainText(REFUSAL)
            await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
            await expect(page.getByTestId('entry-memo')).toHaveValue(typed)
            await expect(page.getByTestId('entry-actions')).toBeVisible()
        })

        test('Post & new, then the read-only back link while the post is held: the list stays', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Back mid post', sizeName)
            await makeDraft(page, memo)
            const held = await holdRequests(page, ENTRY_RECORDS, isStatusPost)

            await pressPostAndNew(page)
            await held.firstHeld
            await expect(page.getByTestId('entry-read-only')).toBeVisible()
            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await expect(page).toHaveURL(/\/entries$/)

            held.release()
            await settleFrames(page)
            await expect(page).toHaveURL(/\/entries$/)
            await expect(page.getByTestId('entries-screen')).toBeVisible()
        })

        test('delete: the entry is never reported missing while it is deleted', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Delete flash', sizeName)
            await makeDraft(page, memo)
            await chooseDeleteDraft(page)
            await page.evaluate(() => {
                const seen = { notFound: false }
                new MutationObserver(() => {
                    if (document.querySelector('[data-testid="entry-not-found"]'))
                        seen.notFound = true
                }).observe(document.body, { subtree: true, childList: true, attributes: true })
                Object.assign(window, { __entrySeen: seen })
            })

            await page.getByTestId('delete-draft-confirm').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await expect(page.getByTestId('entry-not-found')).toHaveCount(0)
            const seen = await page.evaluate(
                () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
            )
            expect(seen).toEqual({ notFound: false })
        })

        test('delete: a refused delete keeps the dialog open with the message', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Refused delete', sizeName)
            await makeDraft(page, memo)
            await page.route(ENTRY_RECORDS, route =>
                route.request().method() === 'DELETE' ? refuse(route, REFUSAL) : route.continue()
            )

            await chooseDeleteDraft(page)
            await page.getByTestId('delete-draft-confirm').click()

            await expect(page.getByTestId('delete-draft-dialog')).toContainText(REFUSAL)
            await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
            await expect(page).toHaveURL(/\/entries\/(?!new$)[^/]+$/)
            await expect(page.getByTestId('entry-screen')).toBeVisible()
        })

        test('delete: while held, Escape and the backdrop keep the dialog and a double click deletes once', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Held delete', sizeName)
            await makeDraft(page, memo)
            const held = await holdRequests(
                page,
                ENTRY_RECORDS,
                request => request.method() === 'DELETE'
            )

            await chooseDeleteDraft(page)
            await page.getByTestId('delete-draft-confirm').dblclick()
            await held.firstHeld
            await page.keyboard.press('Escape')
            await page.mouse.click(2, 2)
            await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()

            held.release()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await settleFrames(page)
            expect(held.count()).toBe(1)
        })

        test('another session adds lines to the open draft: a memo-only save keeps them', async ({
            page,
        }) => {
            await page.addInitScript(() => {
                // The app reads realtime events from a fetch stream. This copies that stream
                // into a log so the test can wait for the one it needs.
                const log: string[] = []
                Object.assign(window, { __sse: log })
                const original = window.fetch
                window.fetch = async (input, init) => {
                    const response = await original(input, init)
                    const url = input instanceof Request ? input.url : String(input)
                    const method = (init?.method ?? 'GET').toUpperCase()
                    if (url.includes('/api/realtime') && method === 'GET' && response.body) {
                        const reader = response.clone().body?.getReader()
                        const decoder = new TextDecoder()
                        const pump = async () => {
                            while (reader) {
                                const { done, value } = await reader.read()
                                if (done) return
                                log.push(decoder.decode(value))
                            }
                        }
                        pump().catch(() => {})
                    }
                    return response
                }
            })
            await start(page, size)
            const memo = uniqueMemo('Two pages', sizeName)
            await makeDraft(page, memo)

            const other = await openSecondPage(page, size)
            await openDraft(other, memo)
            await other.getByTestId('entry-add-line').click()
            await fillLine(other, 2, {
                account: ACCOUNT_LABELS.checking,
                debit: '$1.00',
                memo: 'page two line',
            })
            await other.getByTestId('entry-add-line').click()
            await fillLine(other, 3, { account: ACCOUNT_LABELS.equity, credit: '$1.00' })
            await other.getByTestId('entry-save-draft').click()

            await expect
                .poll(() =>
                    page.evaluate(() =>
                        (window as unknown as { __sse: string[] }).__sse.some(data =>
                            data.includes('page two line')
                        )
                    )
                )
                .toBe(true)

            const lineDeletes: string[] = []
            page.on('request', request => {
                if (request.method() === 'DELETE' && request.url().includes('books_journal_lines'))
                    lineDeletes.push(request.url())
            })
            const edited = `${memo} edited`
            await page.getByTestId('entry-memo').fill(edited)
            const saved = page.waitForResponse(
                res => res.request().method() === 'PATCH' && res.url().includes('journal_entries')
            )
            await page.getByTestId('entry-save-draft').click()
            await saved
            await settleFrames(page)

            expect(lineDeletes).toEqual([])
            await other.close()
            await backToList(page)
            await openDraft(page, edited)
            await expectCell(page.getByTestId('entry-line-account-2'), ACCOUNT_LABELS.checking)
            await expect(page.getByTestId('entry-line-memo-2')).toHaveValue('page two line')
            await expectCell(page.getByTestId('entry-line-credit-3'), '$1.00')
        })

        test('Save draft twice on one mount keeps one copy of an added line', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Save twice', sizeName)
            await makeDraft(page, memo)

            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 2, { account: ACCOUNT_LABELS.equity, credit: '$1.00' })
            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 3, { account: ACCOUNT_LABELS.checking, debit: '$1.00' })
            await page.getByTestId('entry-save-draft').click()
            await expect(page.getByTestId('entry-save-draft')).toBeEnabled()
            await page.getByTestId('entry-memo').fill(`${memo} again`)
            await page.getByTestId('entry-save-draft').click()
            await expect(page.getByTestId('entry-save-draft')).toBeEnabled()
            await settleFrames(page)

            await backToList(page)
            await openDraft(page, `${memo} again`)
            await expect(page.getByTestId('entry-line-3')).toBeVisible()
            await expect(page.getByTestId('entry-line-4')).toHaveCount(0)
            await expectCell(page.getByTestId('entry-line-credit-2'), '$1.00')
            await expectCell(page.getByTestId('entry-line-debit-3'), '$1.00')
        })

        test('back with unsaved edits asks first (draft screen)', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Back dirty draft', sizeName)
            await makeDraft(page, memo)

            await page.getByTestId('entry-memo').fill(`${memo} typed`)
            await leaveWithDiscard(page)
            await searchList(page, memo)
            await expect(listItems(page, memo)).toHaveCount(1)
            await expect(listItems(page, `${memo} typed`)).toHaveCount(0)
        })

        test('back with no edits leaves directly (draft screen)', async ({ page }) => {
            await start(page, size)
            await makeDraft(page, uniqueMemo('Back clean draft', sizeName))

            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        })

        test('back with unsaved edits asks first (new entry)', async ({ page }) => {
            await start(page, size)
            await openNewEntry(page)

            await page.getByTestId('entry-memo').fill(uniqueMemo('Back dirty new', sizeName))
            await leaveWithDiscard(page)
        })

        test('back with no edits leaves directly (new entry)', async ({ page }) => {
            await start(page, size)
            await openNewEntry(page)

            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        })

        test('opening a draft never shows the read-only view first', async ({ page }) => {
            await start(page, size)
            await openEntriesList(page)
            await page.evaluate(() => {
                const seen = { readOnly: false }
                new MutationObserver(() => {
                    if (document.querySelector('[data-testid="entry-read-only"]'))
                        seen.readOnly = true
                }).observe(document.body, { subtree: true, childList: true, attributes: true })
                Object.assign(window, { __entrySeen: seen })
            })

            await page.getByTestId('entries-search').fill(ENTRIES_SEED.draft)
            await listItems(page, ENTRIES_SEED.draft).first().click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
            await expect(page.getByTestId('entry-actions')).toBeVisible()
            const seen = await page.evaluate(
                () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
            )
            expect(seen).toEqual({ readOnly: false })
        })
    })
}

test.describe('journal-entries: draft header (phone)', () => {
    test('the badge shares the title row and the header stays compact', async ({ page }) => {
        await start(page, PHONE)
        await openEntriesList(page)
        await page.getByTestId('entries-search').fill(ENTRIES_SEED.draft)
        await listItems(page, ENTRIES_SEED.draft).first().click()
        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')

        const title = await page.getByTestId('entry-title').boundingBox()
        const badge = await page.getByTestId('entry-badge').boundingBox()
        const field = await page.getByTestId('entry-date').boundingBox()
        if (!title || !badge || !field) throw new Error('header elements are not laid out')
        const overlap =
            Math.min(title.y + title.height, badge.y + badge.height) - Math.max(title.y, badge.y)
        expect(overlap).toBeGreaterThan(0)
        expect(field.y - title.y).toBeLessThanOrEqual(100)
    })
})

function isDraftSave(request: Request) {
    return request.method() === 'PATCH' && !isStatusPost(request)
}

async function watchForNotFound(page: Page) {
    await page.evaluate(() => {
        const seen = { notFound: false }
        new MutationObserver(() => {
            if (document.querySelector('[data-testid="entry-not-found"]')) seen.notFound = true
        }).observe(document.body, { subtree: true, childList: true, attributes: true })
        Object.assign(window, { __entrySeen: seen })
    })
}

function lineIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const ids = new Set<string>()
        for (const el of document.querySelectorAll('[data-testid^="entry-line-"]')) {
            const id = el.getAttribute('data-testid') ?? ''
            if (/^entry-line-\d+$/.test(id)) ids.add(id)
        }
        return [...ids]
    })
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: draft edit second review fixes (${sizeName})`, () => {
        test('a draft deleted from another page shows entry-not-found, not an editable ghost', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Deleted elsewhere', sizeName)
            await makeDraft(page, memo)
            await expect(page.getByTestId('entry-actions')).toBeVisible()

            const other = await openSecondPage(page, size)
            await openDraft(other, memo)
            await chooseDeleteDraft(other)
            await other.getByTestId('delete-draft-confirm').click()
            await expect(other.getByTestId('entries-screen')).toBeVisible()

            await expect(page.getByTestId('entry-not-found')).toBeVisible()
            await expect(page.getByTestId('entry-actions')).toHaveCount(0)
            await expect(page.getByTestId('entry-memo')).toHaveCount(0)
            await other.close()
        })

        test('delete while a save is held never reports the entry missing', async ({ page }) => {
            await start(page, size)
            const memo = uniqueMemo('Delete during save', sizeName)
            await makeDraft(page, memo)
            const held = await holdRequests(page, ENTRY_RECORDS, isDraftSave)
            await watchForNotFound(page)

            await page.getByTestId('entry-memo').fill(`${memo} typed`)
            await page.getByTestId('entry-save-draft').click()
            await held.firstHeld
            await chooseDeleteDraft(page)
            await page.getByTestId('delete-draft-confirm').click()
            held.release()

            await expect(page.getByTestId('entries-screen')).toBeVisible()
            await settleFrames(page)
            const seen = await page.evaluate(
                () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
            )
            expect(seen).toEqual({ notFound: false })
        })

        test('back while a save is held with a typed memo still asks to discard', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Back during save', sizeName)
            await makeDraft(page, memo)
            const held = await holdRequests(page, ENTRY_RECORDS, isDraftSave)

            await page.getByTestId('entry-memo').fill(`${memo} saved`)
            await page.getByTestId('entry-save-draft').click()
            await held.firstHeld
            await page.getByTestId('entry-memo').fill(`${memo} typed after submit`)
            await page.getByTestId('entry-back').click()

            await expect(page.getByTestId('discard-dialog')).toBeVisible()
            held.release()
        })

        test('a line removed while a save is held leaves no blank ghost row after the save', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Remove during save', sizeName)
            await makeDraft(page, memo)
            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 2, { account: ACCOUNT_LABELS.checking, debit: '$1.00' })
            await page.getByTestId('entry-add-line').click()
            await fillLine(page, 3, { account: ACCOUNT_LABELS.equity, credit: '$1.00' })
            const held = await holdRequests(page, ENTRY_RECORDS, isDraftSave)

            await page.getByTestId('entry-memo').fill(`${memo} saved`)
            await page.getByTestId('entry-save-draft').click()
            await held.firstHeld
            await page.getByTestId('entry-line-menu-3').click()
            await page.getByRole('menuitem', { name: 'Delete line', exact: true }).click()
            await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
            const afterRemoval = await lineIds(page)
            expect(afterRemoval).toHaveLength(3)

            const saved = page.waitForResponse(
                res => res.request().method() === 'PATCH' && res.url().includes('journal_entries')
            )
            held.release()
            await saved
            await settleFrames(page)
            await expect(page.getByText('Something went wrong')).toHaveCount(0)
            expect(await lineIds(page)).toEqual(afterRemoval)
            await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
        })
    })
}

const LARGE_AMOUNT = '$12,345,678.90'
// Each side is storable alone; together they pass the largest storable amount.
const HALF_OF_TOO_LARGE = '$50,000,000,000,000.00'
const HEADER_MAX_HEIGHT = 110

async function expectBoundedHeader(page: Page) {
    const back = await page.getByTestId('entry-back').boundingBox()
    const title = page.getByTestId('entry-title')
    const rowBoxes = await Promise.all(
        ['entry-title', 'entry-badge', 'entry-big-total'].map(id =>
            page.getByTestId(id).boundingBox()
        )
    )
    if (!back || rowBoxes.some(box => !box)) throw new Error('header elements are not laid out')
    const bottom = Math.max(...rowBoxes.map(box => (box ? box.y + box.height : 0)))
    expect(bottom - back.y).toBeLessThanOrEqual(HEADER_MAX_HEIGHT)

    await expect(title).toHaveText('Journal entry')
    const fits = await title.evaluate(el => el.scrollWidth <= el.clientWidth)
    expect(fits).toBe(true)
}

test.describe('journal-entries: draft header with large totals (phone)', () => {
    test('a large amount keeps the header bounded and the title untruncated', async ({ page }) => {
        await start(page, PHONE)
        await makeDraft(page, uniqueMemo('Large header', 'phone'))

        await fillLine(page, 0, { debit: LARGE_AMOUNT })
        await fillLine(page, 1, { credit: LARGE_AMOUNT })
        await expect(page.getByTestId('entry-big-total')).toContainText('12,345,678.90')
        await expectBoundedHeader(page)
    })

    test('the Too large state keeps the header bounded and the title untruncated', async ({
        page,
    }) => {
        await start(page, PHONE)
        await makeDraft(page, uniqueMemo('Too large header', 'phone'))

        await fillLine(page, 0, { debit: HALF_OF_TOO_LARGE })
        await page.getByTestId('entry-add-line').click()
        await fillLine(page, 2, { account: ACCOUNT_LABELS.checking, debit: HALF_OF_TOO_LARGE })
        await expect(page.getByTestId('entry-big-total')).toHaveText('Too large')
        await expectBoundedHeader(page)
    })
})
