import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    createPostedEntry,
    DESKTOP,
    holdRequests,
    isPhone,
    openEntriesList,
    PHONE,
    postOpenEntry,
    settleFrames,
} from './journal-entries-helpers'

// The per-row menu on the entries list (Open, Edit, Reverse, Void, Delete) and the dialogs it
// opens.
// Decisions that shape it (design gate): the menu trigger `entries-row-menu-<id>` sits in
// the row (wide) and the card (phone) and stops presses reaching the row; writers see the
// items `entryActions` allows for the entry's state (Edit, Reverse, Void for posted, Reverse
// hidden once a reversal exists, Delete for drafts only, Open always); Reverse, Void and
// Delete open their dialogs over the list; Open and Edit are the only items that navigate.
//
// Menu contents are read on the seeded rows (ENTRIES_SEED); every flow that changes data
// makes its own entry through the new-entry form with a unique memo, because the list is
// newest first, windowed, and shared with parallel workers.
// It does not cover: a read-only user, who gets only Open (no read-only Books member is
// seeded, so that is covered by `entryActions` in tests/entry-actions.test.ts).

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'
const NUMBER = /JE-\d+/
const ITEMS = ['open', 'edit', 'reverse', 'void', 'delete'] as const
type Item = (typeof ITEMS)[number]

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

function uniqueMemo(label: string, sizeName: string) {
    return `${label} ${sizeName} ${Date.now()}`
}

function entryInput(memo: string) {
    return {
        memo,
        amount: '$10.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    }
}

function listItems(page: Page, memo: string): Locator {
    return page.locator(isPhone(page) ? CARDS : ROWS).filter({ hasText: memo })
}

async function itemId(item: Locator) {
    const testId = (await item.getAttribute('data-testid')) ?? ''
    return testId.replace(/^entries-(row|card)-/, '')
}

function entryIdOf(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

async function backToList(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

// Finds the one list item with this memo (a reversal's memo differs, so seeds stay unique).
async function findItem(page: Page, memo: string) {
    await page.getByTestId('entries-search').fill(memo)
    const item = listItems(page, memo).filter({ hasNotText: 'Reversal of' }).first()
    await expect(item).toBeVisible()
    return { item, id: await itemId(item) }
}

async function seeded(page: Page, memo: string) {
    await openEntriesList(page)
    return findItem(page, memo)
}

async function openMenu(page: Page, id: string) {
    await page.getByTestId(`entries-row-menu-${id}`).click()
    await expect(page.getByTestId('entries-menu-open')).toBeVisible()
}

async function expectMenu(page: Page, id: string, offered: readonly Item[]) {
    await openMenu(page, id)
    for (const item of ITEMS) {
        await expect(page.getByTestId(`entries-menu-${item}`)).toHaveCount(
            offered.includes(item) ? 1 : 0
        )
    }
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('entries-menu-open')).toHaveCount(0)
    await expectStillOnList(page)
}

async function expectStillOnList(page: Page) {
    await settleFrames(page)
    expect(new URL(page.url()).pathname).toMatch(/\/entries$/)
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

async function chooseFromMenu(page: Page, id: string, item: Item) {
    await openMenu(page, id)
    await page.getByTestId(`entries-menu-${item}`).click()
}

async function cancelDialog(page: Page, testId: string) {
    const dialog = page.getByTestId(testId)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
}

async function entryNumber(page: Page) {
    const title = (await page.getByTestId('entry-title').innerText()).trim()
    return title.replace(/^(Journal entry|Edit) /, '')
}

async function entryDay(page: Page) {
    const text = await page.getByTestId('entry-detail-date').innerText()
    const printed = text.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)?.[0] ?? ''
    return new Date(`${printed} UTC`).toISOString().slice(0, 10)
}

async function hopTo(page: Page, path: string) {
    await page.evaluate(url => {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
}

function booksPath(page: Page, rest: string) {
    const pathname = new URL(page.url()).pathname
    return `${pathname.slice(0, pathname.indexOf('/entries'))}/${rest}`
}

// Leaves the list in-app (no page load) for another Books route, then comes back.
async function leaveAndReturn(page: Page) {
    const entriesPath = booksPath(page, 'entries')
    await hopTo(page, booksPath(page, 'accounts'))
    await expect(page.getByTestId('account-search')).toBeVisible()
    await expect(page.getByTestId('entries-screen')).toHaveCount(0)
    await hopTo(page, entriesPath)
    await expect(page.getByTestId('entries-screen')).toBeVisible()
    await settleFrames(page)
}

// A real router push from the list (the New journal entry button), so the list stays mounted
// under the pushed route. The button is pressed by event because an open dialog covers it.
async function pushAwayFromList(page: Page) {
    await page.getByTestId('entries-new').dispatchEvent('click')
    await expect(page).toHaveURL(/\/entries\/new$/)
    await expect(page.getByTestId('entry-title')).toBeVisible()
}

async function goBackToList(page: Page) {
    await page.goBack()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
    await settleFrames(page)
}

async function makePosted(page: Page, memo: string) {
    await createPostedEntry(page, entryInput(memo))
    return { id: entryIdOf(page), number: await entryNumber(page) }
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: row menu (${sizeName})`, () => {
        test('row menu: presses never open the row; Reverse, Void and Delete open dialogs over the list; Open and Edit navigate', async ({
            page,
        }) => {
            await start(page, size)
            const posted = await seeded(page, ENTRIES_SEED.posted)
            const number = (await posted.item.innerText()).match(NUMBER)?.[0] ?? ''
            expect(number).not.toBe('')

            await openMenu(page, posted.id)
            await expectStillOnList(page)
            await page.keyboard.press('Escape')

            await chooseFromMenu(page, posted.id, 'reverse')
            await expect(page.getByTestId('reverse-dialog')).toBeVisible()
            await expectStillOnList(page)
            await cancelDialog(page, 'reverse-dialog')
            await expectStillOnList(page)

            await chooseFromMenu(page, posted.id, 'void')
            await expect(page.getByTestId('void-dialog')).toBeVisible()
            await expectStillOnList(page)
            await cancelDialog(page, 'void-dialog')
            await expectStillOnList(page)

            const draft = await seeded(page, ENTRIES_SEED.draft)
            await chooseFromMenu(page, draft.id, 'delete')
            await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
            await expectStillOnList(page)
            await cancelDialog(page, 'delete-draft-dialog')
            await expectStillOnList(page)
            await expect(listItems(page, ENTRIES_SEED.draft)).toHaveCount(1)

            await findItem(page, ENTRIES_SEED.posted)
            await chooseFromMenu(page, posted.id, 'open')
            await expect(page.getByTestId('entry-read-only')).toBeVisible()
            expect(entryIdOf(page)).toBe(posted.id)

            await backToList(page)
            await findItem(page, ENTRIES_SEED.posted)
            await chooseFromMenu(page, posted.id, 'edit')
            await expect(page).toHaveURL(new RegExp(`/entries/new\\?replaces=${posted.id}$`))
            await expect(page.getByTestId('entry-title')).toHaveText(`Edit ${number}`)
        })
    })
}

test.describe('journal-entries: row menu and flows (desktop)', () => {
    const sizeName = 'desktop'
    const size = DESKTOP

    test('menu contents follow the entry state', async ({ page }) => {
        await start(page, size)
        const posted = await seeded(page, ENTRIES_SEED.posted)
        await expectMenu(page, posted.id, ['open', 'edit', 'reverse', 'void'])

        const draft = await seeded(page, ENTRIES_SEED.draft)
        await expectMenu(page, draft.id, ['open', 'delete'])

        const voided = await seeded(page, ENTRIES_SEED.voided)
        await expectMenu(page, voided.id, ['open'])

        const reversed = await seeded(page, ENTRIES_SEED.reversed)
        await expectMenu(page, reversed.id, ['open', 'edit', 'void'])
    })

    test('a dialog left open when the user leaves the list is gone on return (void)', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Stale void', sizeName)
        const entry = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, entry.id, 'void')
        await expect(page.getByTestId('void-dialog')).toBeVisible()

        await leaveAndReturn(page)
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
    })

    test('a reverse held in flight, then leaving and returning, shows no reverse dialog', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Stale reverse', sizeName)
        const entry = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, entry.id, 'reverse')
        await expect(page.getByTestId('reverse-dialog')).toBeVisible()
        const held = await holdRequests(
            page,
            '**/api/collections/books_journal_entries/records/*',
            request =>
                request.method() === 'PATCH' &&
                (request.postData() ?? '').includes('"status":"posted"')
        )
        await page.getByTestId('reverse-confirm').click()
        await held.firstHeld

        await leaveAndReturn(page)
        held.release()
        await settleFrames(page)
        await expect(page.getByTestId('reverse-dialog')).toHaveCount(0)
        await expectStillOnList(page)
    })

    test('a dialog left open under a pushed route is gone when the user comes back (void)', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Pushed void', sizeName)
        const entry = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, entry.id, 'void')
        await expect(page.getByTestId('void-dialog')).toBeVisible()

        await pushAwayFromList(page)
        await goBackToList(page)
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(page.getByTestId('reverse-dialog')).toHaveCount(0)
    })

    test('a reverse held in flight, then a push away, never pulls the user to the reversal', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Pushed reverse', sizeName)
        const entry = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, entry.id, 'reverse')
        await expect(page.getByTestId('reverse-dialog')).toBeVisible()
        const held = await holdRequests(
            page,
            '**/api/collections/books_journal_entries/records/*',
            request =>
                request.method() === 'PATCH' &&
                (request.postData() ?? '').includes('"status":"posted"')
        )
        await page.getByTestId('reverse-confirm').click()
        await held.firstHeld

        await pushAwayFromList(page)
        held.release()
        await settleFrames(page)
        expect(new URL(page.url()).pathname).toMatch(/\/entries\/new$/)
        await expect(page.getByTestId('entry-title')).toBeVisible()

        await goBackToList(page)
        await expect(page.getByTestId('reverse-dialog')).toHaveCount(0)
        await expectStillOnList(page)
    })

    test('a void held in flight closes only its own dialog, not a Reverse opened later on another row', async ({
        page,
    }) => {
        await start(page, size)
        const stamp = uniqueMemo('Targeted close', sizeName)
        const first = await makePosted(page, `${stamp} A`)
        await backToList(page)
        const second = await makePosted(page, `${stamp} B`)
        await backToList(page)
        await page.getByTestId('entries-search').fill(stamp)
        await expect(page.getByTestId(`entries-row-menu-${first.id}`)).toBeVisible()
        await expect(page.getByTestId(`entries-row-menu-${second.id}`)).toBeVisible()

        await chooseFromMenu(page, first.id, 'void')
        await expect(page.getByTestId('void-dialog')).toBeVisible()
        const held = await holdRequests(
            page,
            '**/api/collections/books_journal_entries/records/*',
            request =>
                request.method() === 'PATCH' &&
                (request.postData() ?? '').includes('"status":"void"')
        )
        await page.getByTestId('void-confirm').click()
        await held.firstHeld

        await leaveAndReturn(page)
        await expect(page.getByTestId(`entries-row-menu-${second.id}`)).toBeVisible()
        await chooseFromMenu(page, second.id, 'reverse')
        await expect(page.getByTestId('reverse-dialog')).toBeVisible()

        // The void must finish (its completion handler runs) before the dialog is checked.
        const voided = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                (response.request().postData() ?? '').includes('"status":"void"')
        )
        held.release()
        await voided
        await settleFrames(page)
        await expect(page.getByTestId('reverse-dialog')).toBeVisible()
        await expectStillOnList(page)
    })

    test('Enter and Space on the focused menu trigger open the menu, not the row', async ({
        page,
    }) => {
        await start(page, size)
        const posted = await seeded(page, ENTRIES_SEED.posted)
        for (const key of ['Enter', 'Space']) {
            await page.getByTestId(`entries-row-menu-${posted.id}`).focus()
            await page.keyboard.press(key)
            await expect(page.getByTestId('entries-menu-open')).toBeVisible()
            await expectStillOnList(page)
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('entries-menu-open')).toHaveCount(0)
        }
    })

    test('the reversed original never offers Reverse while the reversal lookup is pending', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Gate reversed', sizeName)
        const original = await makePosted(page, memo)
        const month = (await entryDay(page)).slice(0, 7)
        await backToList(page)
        await findItem(page, memo)
        // The default reversal date is next month, so "This month" lists the original
        // without its reversal: the reversal row is not in the store, and only the
        // lookup request can say the original is reversed.
        await chooseFromMenu(page, original.id, 'reverse')
        await page.getByTestId('reverse-confirm').click()
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect.poll(() => entryIdOf(page)).not.toBe(original.id)

        // Leave the reversal's own screen, which would load the reversal row on a reload.
        await backToList(page)
        // A reload empties the store. The default (fiscal year) list would load the reversal
        // row into it, so that request is held back; only the "This month" list, which
        // leaves the reversal out, and the held reversal lookup may answer.
        await page.reload()
        const held = await holdRequests(
            page,
            '**/api/collections/books_journal_entries/records?*',
            request => {
                const url = decodeURIComponent(request.url())
                if (url.includes('reverses')) return url.includes(original.id)
                return url.includes('date') && !url.includes(month)
            }
        )
        await openEntriesList(page)
        await page.getByTestId('entries-range').click()
        await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
        const item = listItems(page, memo).filter({ hasNotText: 'Reversal of' })
        await expect(item).toBeVisible()
        await expect(listItems(page, `Reversal of ${original.number}`)).toHaveCount(0)
        // The default list and the reversal lookup are both held.
        await expect.poll(() => held.count()).toBeGreaterThanOrEqual(2)

        await openMenu(page, original.id)
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await settleFrames(page)
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        held.release()
        await settleFrames(page)
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
    })

    test('Delete confirmed on a draft that was posted elsewhere refuses and never deletes the posted entry', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Stale delete', sizeName)
        await createDraftEntry(page, entryInput(memo))
        const id = entryIdOf(page)
        const draftUrl = page.url()
        await backToList(page)
        await findItem(page, memo)
        await chooseFromMenu(page, id, 'delete')
        await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()

        const other = await page.context().newPage()
        await start(other, size)
        await other.goto(draftUrl)
        await postOpenEntry(other)
        await other.close()

        await page.getByTestId('delete-draft-confirm').click()
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('alert').filter({ hasText: /is posted/ })).toBeVisible()
        await cancelDialog(page, 'delete-draft-dialog')

        await findItem(page, memo)
        await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Posted')
        await expect(listItems(page, memo)).toHaveCount(1)
    })

    test('Reverse from the menu opens the dialog over the list and opens the reversal', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueMemo('Menu reverse', sizeName)
        const original = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, original.id, 'reverse')
        const dialog = page.getByTestId('reverse-dialog')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByTestId('reverse-memo')).toHaveValue(`Reversal of ${original.number}`)
        await page.getByTestId('reverse-confirm').click()

        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect.poll(() => entryIdOf(page)).not.toBe(original.id)
        await expect(page.getByTestId('entry-link-reverses')).toHaveText(
            `Reverses ${original.number}`
        )

        await backToList(page)
        await findItem(page, memo)
        await expectMenu(page, original.id, ['open', 'edit', 'void'])
    })

    test('Void from the menu returns the row to Void in place', async ({ page }) => {
        await start(page, size)
        const memo = uniqueMemo('Menu void', sizeName)
        const entry = await makePosted(page, memo)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, entry.id, 'void')
        await expect(page.getByTestId('void-dialog')).toBeVisible()
        await page.getByTestId('void-confirm').click()

        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(page.getByTestId(`entries-status-${entry.id}`)).toHaveText('Void')
        await expectStillOnList(page)
        await expectMenu(page, entry.id, ['open'])
    })

    test('Delete on a draft asks, then removes the row', async ({ page }) => {
        await start(page, size)
        const memo = uniqueMemo('Menu delete', sizeName)
        await createDraftEntry(page, entryInput(memo))
        const id = entryIdOf(page)
        await backToList(page)
        await findItem(page, memo)

        await chooseFromMenu(page, id, 'delete')
        await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
        await page.getByTestId('delete-draft-confirm').click()

        await expect(page.getByTestId('delete-draft-dialog')).toHaveCount(0)
        await expect(listItems(page, memo)).toHaveCount(0)
        await expectStillOnList(page)
    })
})
