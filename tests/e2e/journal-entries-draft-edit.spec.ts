import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { createIncomeAccount, openChart } from './account-register-helpers'
import {
    ACCOUNT_LABELS,
    BATCH_WRITE,
    createDraftEntry,
    DESKTOP,
    fillLine,
    holdRequests,
    isBatchOf,
    isPhone,
    makeAccountInactiveElsewhere,
    openEntriesList,
    PHONE,
    refuseEntryWrite,
    searchEntries,
    settleFrames,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

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
// A save, a post and a delete of a saved draft are each one batch request (the line
// writes and the entry write, all saved or none), and a save states the revision the
// form loaded, so the server refuses it when another session changed the draft.
//
// The refused post of an open draft is the server's own refusal: the draft's line 2
// uses an account the test created and then made inactive from another tab, so the
// post is refused with "Line 2: account <name> is inactive.". The refused delete uses
// `page.route` to answer the batch with PocketBase's batch error (a 400 that carries
// the refused entry write's own 400): the server refuses the delete of a posted or
// void entry only, Delete draft shows on a draft only, and a post made elsewhere
// flips the open screen to the read-only view, so no input makes the real server
// refuse it. That test covers how the dialog reacts to a refusal, not the server's
// rule (Go: TestImmutable_PostedRefusalsPointAtVoid). The held-request tests use
// `page.route` only to delay a batch and then pass it on to the real server.

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
    await searchEntries(page, memo)
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
    test.describe(`journal-entries: edit drafts (${sizeName})`, () => {
        test('edit: memo, an added line and a removed line persist in order', async ({ page }) => {
            await start(page, size)
            const memo = uniqueName(`Edit draft ${sizeName}`)
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
    })
}

test.describe('journal-entries: edit and delete drafts (desktop)', () => {
    const sizeName = 'desktop'
    const size = DESKTOP

    test('the seeded draft opens as an editable form with its saved values, never the read-only view first', async ({
        page,
    }) => {
        await start(page, size)
        await openEntriesList(page)
        await page.evaluate(() => {
            const seen = { readOnly: false }
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="entry-read-only"]')) seen.readOnly = true
            }).observe(document.body, { subtree: true, childList: true, attributes: true })
            Object.assign(window, { __entrySeen: seen })
        })

        await searchList(page, ENTRIES_SEED.draft)
        await listItems(page, ENTRIES_SEED.draft).first().click()

        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
        await expect(page.getByTestId('entry-memo')).toHaveValue(ENTRIES_SEED.draft)
        await expect(page.getByTestId('entry-actions')).toBeVisible()
        await expectCell(page.getByTestId('entry-line-account-1'), ACCOUNT_LABELS.checking)
        await expectCell(page.getByTestId('entry-line-credit-1'), '$250.00')
        await expect(page.getByTestId('entry-line-debit-0')).toBeEditable()
        const seen = await page.evaluate(
            () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
        )
        expect(seen).toEqual({ readOnly: false })
    })

    test("delete: the header menu's Cancel keeps the draft; Delete removes it without a not-found flash", async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Delete draft ${sizeName}`)
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
        await watchForNotFound(page)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByTestId('entry-not-found')).toHaveCount(0)
        await expect(listItems(page, memo)).toHaveCount(0)
        const seen = await page.evaluate(
            () => (window as unknown as { __entrySeen: Record<string, boolean> }).__entrySeen
        )
        expect(seen).toEqual({ notFound: false })
        await searchList(page, ENTRIES_SEED.draft)
        await expect(listItems(page, ENTRIES_SEED.draft).first()).toBeVisible()
    })

    test('realtime: a post in another session flips the open draft and the list row', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Realtime draft ${sizeName}`)
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
        await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
        await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
        await other.close()
    })

    test('realtime: a post in another session updates the open list row', async ({ page }) => {
        await start(page, size)
        const memo = uniqueName(`Realtime row ${sizeName}`)
        await makeDraft(page, memo)
        await backToList(page)
        await searchList(page, memo)
        const item = listItems(page, memo)
        const id = await idOf(item)
        await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Draft')
        await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText('Draft')

        const other = await page.context().newPage()
        await login(other)
        await navigateToPackage(other, 'books')
        await other.setViewportSize(size)
        await openEntriesList(other)
        await openDraft(other, memo)
        await other.getByTestId('entry-post').click()
        await expect(other.getByTestId('entry-read-only')).toBeVisible()

        await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Posted')
        await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText(/^JE-\d+$/)
        await other.close()
    })
})

// The invented text of the faked delete refusal; no server rule says it.
const REFUSAL = 'This draft cannot be deleted right now.'
const CONFLICT = 'This entry changed after you opened it.'

async function openSecondPage(page: Page, size: { width: number; height: number }) {
    const other = await page.context().newPage()
    await login(other)
    await navigateToPackage(other, 'books')
    await other.setViewportSize(size)
    await openEntriesList(other)
    return other
}

async function leaveWithDiscard(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('discard-dialog')).toBeVisible()
    await page.getByTestId('discard-confirm').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

test.describe('journal-entries: draft edit review fixes (desktop)', () => {
    const sizeName = 'desktop'
    const size = DESKTOP

    test('a refused post of an open draft brings the form back with the typed values and the message', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Refused open post ${sizeName}`)
        const account = `${memo} account`
        await openChart(page)
        await createIncomeAccount(page, account)
        await createDraftEntry(page, {
            memo,
            amount: '$10.00',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: account,
        })
        await makeAccountInactiveElsewhere(page, account)

        const typed = `${memo} typed`
        await page.getByTestId('entry-memo').fill(typed)
        await page.getByTestId('entry-post').click()

        const refusal = `Line 2: account ${account} is inactive.`
        await expect(page.getByTestId('entry-error-summary')).toContainText(refusal)
        await expect(page.getByTestId('entry-line-error-1')).toContainText(refusal)
        await expect(page.getByTestId('entry-read-only')).toHaveCount(0)
        await expect(page.getByTestId('entry-memo')).toHaveValue(typed)
        await expect(page.getByTestId('entry-actions')).toBeVisible()
    })

    test('Post & new, then the read-only back link while the post is held: the list stays', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Back mid post ${sizeName}`)
        await makeDraft(page, memo)
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('post'))

        await page.getByTestId('entry-post-new').click()
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

    test('delete: a refused delete keeps the dialog open with the message', async ({ page }) => {
        await start(page, size)
        const memo = uniqueName(`Refused delete ${sizeName}`)
        await makeDraft(page, memo)
        await refuseEntryWrite(page, 'delete', REFUSAL)

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
        const memo = uniqueName(`Held delete ${sizeName}`)
        await makeDraft(page, memo)
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('delete'))

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

    test('another session adds lines to the open draft: a memo-only save is refused, saves nothing and keeps them', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Two pages ${sizeName}`)
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
        const otherSaved = other.waitForResponse(
            res => res.url().includes('/api/batch') && res.status() === 200
        )
        await other.getByTestId('entry-save-draft').click()
        await otherSaved

        // This page still shows the two lines it loaded. Its save states the revision it
        // loaded, so the server refuses the whole batch: no line is deleted, no memo saved.
        const edited = `${memo} edited`
        await page.getByTestId('entry-memo').fill(edited)
        const refused = page.waitForResponse(res => res.url().includes('/api/batch'))
        await page.getByTestId('entry-save-draft').click()
        expect((await refused).status()).toBe(400)

        await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)
        // What was typed stays on the form.
        await expect(page.getByTestId('entry-memo')).toHaveValue(edited)
        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')

        // Load the current entry: the stored memo and the other session's lines show.
        await page.getByTestId('entry-conflict-reload').click()
        await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
        await expect(page.getByTestId('entry-memo')).toHaveValue(memo)
        await expectCell(page.getByTestId('entry-line-account-2'), ACCOUNT_LABELS.checking)
        await expect(page.getByTestId('entry-line-memo-2')).toHaveValue('page two line')
        await expectCell(page.getByTestId('entry-line-credit-3'), '$1.00')

        // The stored draft, opened again from the list: the typed memo was not saved and
        // the other session's lines are there.
        await other.close()
        await backToList(page)
        await searchList(page, edited)
        await expect(page.getByTestId('entries-no-match')).toBeVisible()
        await openDraft(page, memo)
        await expectCell(page.getByTestId('entry-line-account-2'), ACCOUNT_LABELS.checking)
        await expect(page.getByTestId('entry-line-memo-2')).toHaveValue('page two line')
        await expectCell(page.getByTestId('entry-line-credit-3'), '$1.00')
    })

    test('Save draft twice on one mount keeps one copy of an added line', async ({ page }) => {
        await start(page, size)
        const memo = uniqueName(`Save twice ${sizeName}`)
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

    test('back on the draft screen: leaves directly when clean, asks first when edited and discards the edit', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Back draft ${sizeName}`)
        await makeDraft(page, memo)

        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)

        await openDraft(page, memo)
        await page.getByTestId('entry-memo').fill(`${memo} typed`)
        await leaveWithDiscard(page)
        await searchList(page, memo)
        await expect(listItems(page, memo)).toHaveCount(1)
        await expect(listItems(page, `${memo} typed`)).toHaveCount(0)
    })
})

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

test.describe('journal-entries: draft edit second review fixes (desktop)', () => {
    const sizeName = 'desktop'
    const size = DESKTOP

    test('a draft deleted from another page shows entry-not-found, not an editable ghost', async ({
        page,
    }) => {
        await start(page, size)
        const memo = uniqueName(`Deleted elsewhere ${sizeName}`)
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
        const memo = uniqueName(`Delete during save ${sizeName}`)
        await makeDraft(page, memo)
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('save'))
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

    test('back while a save is held with a typed memo still asks to discard', async ({ page }) => {
        await start(page, size)
        const memo = uniqueName(`Back during save ${sizeName}`)
        await makeDraft(page, memo)
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('save'))

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
        const memo = uniqueName(`Remove during save ${sizeName}`)
        await makeDraft(page, memo)
        await page.getByTestId('entry-add-line').click()
        await fillLine(page, 2, { account: ACCOUNT_LABELS.checking, debit: '$1.00' })
        await page.getByTestId('entry-add-line').click()
        await fillLine(page, 3, { account: ACCOUNT_LABELS.equity, credit: '$1.00' })
        const held = await holdRequests(page, BATCH_WRITE, isBatchOf('save'))

        await page.getByTestId('entry-memo').fill(`${memo} saved`)
        await page.getByTestId('entry-save-draft').click()
        await held.firstHeld
        await page.getByTestId('entry-line-menu-3').click()
        await page.getByRole('menuitem', { name: 'Delete line', exact: true }).click()
        await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
        const afterRemoval = await lineIds(page)
        expect(afterRemoval).toHaveLength(3)

        const saved = page.waitForResponse(res => res.url().includes('/api/batch'))
        held.release()
        await saved
        await settleFrames(page)
        await expect(page.getByText('Something went wrong')).toHaveCount(0)
        expect(await lineIds(page)).toEqual(afterRemoval)
        await expect(page.getByTestId('entry-line-3')).toHaveCount(0)
    })
})
