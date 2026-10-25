import { expect, type Locator, type Page, type Request, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { openRegister } from './account-register-helpers'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    createPostedEntry,
    DESKTOP,
    fillLine,
    holdRequests,
    isPhone,
    openEntriesList,
    PHONE,
    settleFrames,
} from './journal-entries-helpers'

// Edit (replacement draft), Reverse and Void on a posted entry's read-only view.
// Decisions that shape it (design gate): writers get Edit, Reverse and Void in the
// `entry-actions` bar on wide screens and `entry-edit` plus the `entry-more` menu
// (Reverse, Void) on a phone; Edit opens `entries/new?replaces=<id>`, a prefilled draft
// headed "Edit JE-n" that writes nothing until Save draft or Post; Reverse asks for a date
// and memo in `reverse-dialog` and posts the reversal; Void confirms in `void-dialog`;
// void reversals show read-only with no actions.
//
// Every test makes its own posted entry through the new-entry form with a unique memo.
// It does not cover: a read-only user (no read-only Books member is seeded, so "read-only
// users see none" is covered by `entryActions` in tests/entry-actions.test.ts); a
// closed-period refusal (no input provokes one, so the dialog's refusal display is shown
// with "already reversed" instead: Void on the seeded reversed original,
// `ENTRIES_SEED.reversed`, is refused by the server and the entry stays Posted); the
// Reverse delete-on-refusal path, which tests/use-entry-actions.test.tsx covers.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'
const NUMBER = /^JE-\d+$/
const VOID_TEXT = 'A reversing entry is posted in the original period. The number is kept.'

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
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

async function expectReverseOffered(page: Page, isOffered: boolean) {
    const count = isOffered ? 1 : 0
    if (isPhone(page)) {
        await page.getByTestId('entry-more').click()
        await expect(page.getByRole('menuitem', { name: 'Reverse', exact: true })).toHaveCount(
            count
        )
        await page.keyboard.press('Escape')
        return
    }
    const bar = page.getByTestId('entry-actions')
    await expect(bar.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(count)
}

function uniqueMemo(label: string, sizeName: string) {
    return `${label} ${sizeName} ${Date.now()}`
}

async function makePosted(page: Page, memo: string) {
    await createPostedEntry(page, {
        memo,
        amount: '$10.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
}

function entryIdOf(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

async function entryNumber(page: Page) {
    const title = (await page.getByTestId('entry-title').innerText()).trim()
    return title.replace(/^(Journal entry|Edit) /, '')
}

// The read-only view prints the date as "Oct 25, 2026"; the rule works on ISO days.
async function entryDay(page: Page) {
    const text = await page.getByTestId('entry-detail-date').innerText()
    const printed = text.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)?.[0] ?? ''
    return new Date(`${printed} UTC`).toISOString().slice(0, 10)
}

function addDays(day: string, days: number) {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

function nextMonthStart(day: string) {
    const [year, month] = day.split('-').map(Number)
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
}

function localToday(page: Page) {
    return page.evaluate(() => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    })
}

function listItems(page: Page, memo: string): Locator {
    return page.locator(isPhone(page) ? CARDS : ROWS).filter({ hasText: memo })
}

// The list is newest first and windowed while parallel workers add entries, so a row is
// found by searching for its memo.
async function searchList(page: Page, memo: string) {
    await page.getByTestId('entries-search').fill(memo)
}

// An in-app route change (no page load), the way openChart in account-register-helpers does it.
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

async function backToList(page: Page) {
    await page.getByTestId('entry-back').click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

async function listStatuses(page: Page, memo: string) {
    await searchList(page, memo)
    const items = listItems(page, memo)
    return items.locator('[data-testid^="entries-status-"]').allInnerTexts()
}

async function openSeeded(page: Page, memo: string) {
    await openEntriesList(page)
    await searchList(page, memo)
    await listItems(page, memo).filter({ hasNotText: 'Reversal of' }).first().click()
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

async function chooseAction(page: Page, name: 'Edit' | 'Reverse' | 'Void') {
    if (isPhone(page)) {
        if (name === 'Edit') return page.getByTestId('entry-edit').click()
        await page.getByTestId('entry-more').click()
        return page.getByRole('menuitem', { name, exact: true }).click()
    }
    return page.getByTestId('entry-actions').getByRole('button', { name, exact: true }).click()
}

type Cells = { debit: string; credit: string }

// Lines keyed by account label, so the check does not depend on line order.
async function readLines(page: Page): Promise<Record<string, Cells>> {
    const count = await page.locator('[data-testid^="entry-line-account-"]').count()
    const lines: Record<string, Cells> = {}
    for (let i = 0; i < count; i++) {
        const text = (id: string) => page.getByTestId(`${id}-${i}`).innerText()
        const account = (await text('entry-line-account')).trim()
        lines[account] = {
            debit: (await text('entry-line-debit')).trim(),
            credit: (await text('entry-line-credit')).trim(),
        }
    }
    return lines
}

async function waitForOtherEntry(page: Page, previousId: string) {
    await expect.poll(() => entryIdOf(page)).not.toBe(previousId)
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

async function cellValue(locator: Locator): Promise<string> {
    return locator.evaluate(el => {
        const value = (el as HTMLInputElement).value
        return (value ?? el.textContent ?? '').trim()
    })
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: edit, reverse, void (${sizeName})`, () => {
        test('actions: a posted entry offers Edit, Reverse and Void; void entries offer none', async ({
            page,
        }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Actions', sizeName))

            if (isPhone(page)) {
                await expect(page.getByTestId('entry-edit')).toBeVisible()
                await page.getByTestId('entry-more').click()
                await expect(
                    page.getByRole('menuitem', { name: 'Reverse', exact: true })
                ).toBeVisible()
                await expect(
                    page.getByRole('menuitem', { name: 'Void', exact: true })
                ).toBeVisible()
                await page.keyboard.press('Escape')
            } else {
                const bar = page.getByTestId('entry-actions')
                for (const name of ['Edit', 'Reverse', 'Void']) {
                    await expect(bar.getByRole('button', { name, exact: true })).toBeVisible()
                }
            }

            await backToList(page)
            await openSeeded(page, ENTRIES_SEED.voided)
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')
            await expect(page.getByTestId('entry-actions')).toHaveCount(0)
            await expect(page.getByTestId('entry-edit')).toHaveCount(0)
            await expect(page.getByTestId('entry-more')).toHaveCount(0)

            await page.getByTestId('entry-link-reversed-by').click()
            await expect(page.getByTestId('entry-link-reverses')).toBeVisible()
            await expect(page.getByTestId('entry-actions')).toHaveCount(0)
            await expect(page.getByTestId('entry-edit')).toHaveCount(0)
            await expect(page.getByTestId('entry-more')).toHaveCount(0)
        })

        test('reverse: the dialog validates the date, then posts a mirrored reversal', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Reverse me', sizeName)
            await makePosted(page, memo)
            const originalId = entryIdOf(page)
            const number = await entryNumber(page)
            expect(number).toMatch(NUMBER)
            const day = await entryDay(page)
            const today = await localToday(page)
            const next = nextMonthStart(day)
            const originalLines = await readLines(page)

            await chooseAction(page, 'Reverse')
            const dialog = page.getByTestId('reverse-dialog')
            await expect(dialog).toBeVisible()
            await expect(dialog.getByText(`Reverse ${number}`, { exact: true })).toBeVisible()
            await expect(page.getByTestId('reverse-memo')).toHaveValue(`Reversal of ${number}`)
            const defaultDate = today > next ? today : next
            await expect(page.getByTestId('reverse-date')).toHaveValue(defaultDate)

            await page.getByTestId('reverse-date').fill(addDays(day, -1))
            await page.getByTestId('reverse-confirm').click()
            await expect(dialog).toContainText('cannot be dated before the entry')
            await expect(dialog).toBeVisible()
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            expect(entryIdOf(page)).toBe(originalId)

            await page.getByTestId('reverse-date').fill(defaultDate)
            await page.getByTestId('reverse-confirm').click()
            await waitForOtherEntry(page, originalId)

            const reversalNumber = await entryNumber(page)
            expect(reversalNumber).toMatch(NUMBER)
            expect(reversalNumber).not.toBe(number)
            await expect(page.getByTestId('entry-title')).toHaveText(
                `Journal entry ${reversalNumber}`
            )
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-link-reverses')).toHaveText(`Reverses ${number}`)

            const reversalLines = await readLines(page)
            expect(Object.keys(reversalLines).sort()).toEqual(Object.keys(originalLines).sort())
            expect(originalLines[ACCOUNT_LABELS.checking].debit).toContain('$10.00')
            for (const [account, cells] of Object.entries(originalLines)) {
                expect(reversalLines[account]).toEqual({ debit: cells.credit, credit: cells.debit })
            }

            await page.getByTestId('entry-link-reverses').click()
            await expect.poll(() => entryIdOf(page)).toBe(originalId)
            await expect(page.getByTestId('entry-link-reversed-by')).toHaveText(
                `Reversed by ${reversalNumber}`
            )
            if (isPhone(page)) {
                await page.getByTestId('entry-more').click()
                await expect(
                    page.getByRole('menuitem', { name: 'Void', exact: true })
                ).toBeVisible()
                await expect(
                    page.getByRole('menuitem', { name: 'Reverse', exact: true })
                ).toHaveCount(0)
                await page.keyboard.press('Escape')
            } else {
                const bar = page.getByTestId('entry-actions')
                await expect(bar.getByRole('button', { name: 'Void', exact: true })).toBeVisible()
                await expect(bar.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(
                    0
                )
            }
        })

        test('void: Cancel keeps the entry, Void keeps the number and lists it as Void', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Void me', sizeName)
            await makePosted(page, memo)
            const id = entryIdOf(page)
            const number = await entryNumber(page)

            await chooseAction(page, 'Void')
            const dialog = page.getByTestId('void-dialog')
            await expect(dialog).toBeVisible()
            await expect(dialog.getByText(`Void ${number}?`, { exact: true })).toBeVisible()
            await expect(dialog).toContainText(VOID_TEXT)
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')

            await chooseAction(page, 'Void')
            await page.getByTestId('void-confirm').click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')
            await expect(page.getByTestId('entry-title')).toHaveText(`Journal entry ${number}`)
            expect(entryIdOf(page)).toBe(id)

            await backToList(page)
            await searchList(page, memo)
            const item = listItems(page, memo)
            await expect(item).toHaveCount(1)
            await expect(page.getByTestId(`entries-status-${id}`)).toHaveText('Void')
            await expect(item).toContainText(number)
        })

        test('void: the seeded reversed original refuses and the message shows in the dialog', async ({
            page,
        }) => {
            await start(page, size)
            await openSeeded(page, ENTRIES_SEED.reversed)
            const id = entryIdOf(page)

            await chooseAction(page, 'Void')
            const dialog = page.getByTestId('void-dialog')
            await page.getByTestId('void-confirm').click()
            await expect(dialog.getByTestId('entry-error-summary')).toContainText(/reversed/i)
            await expect(dialog).toBeVisible()

            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            expect(entryIdOf(page)).toBe(id)
        })

        test('edit: prefilled replacement form, leaving writes nothing, posting replaces under the same number', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Edit me', sizeName)
            await makePosted(page, memo)
            const originalId = entryIdOf(page)
            const number = await entryNumber(page)

            await chooseAction(page, 'Edit')
            await expect(page).toHaveURL(/\/entries\/new\?.*replaces=/)
            await expect(page.getByTestId('entry-title')).toHaveText(`Edit ${number}`)
            await expect(
                page.getByText(
                    `Posting this replaces ${number} under the same number. The original is voided.`
                )
            ).toBeVisible()
            await expect(page.getByTestId('entry-memo')).toHaveValue(memo)
            await expect
                .poll(() => cellValue(page.getByTestId('entry-line-account-0')))
                .toBe(ACCOUNT_LABELS.checking)
            await expect
                .poll(() => cellValue(page.getByTestId('entry-line-debit-0')))
                .toBe('$10.00')
            await expect
                .poll(() => cellValue(page.getByTestId('entry-line-account-1')))
                .toBe(ACCOUNT_LABELS.equity)
            await expect
                .poll(() => cellValue(page.getByTestId('entry-line-credit-1')))
                .toBe('$10.00')

            await page.getByTestId('entry-memo').fill(`${memo} changed`)
            await page.getByTestId('entry-cancel').click()
            await page.getByTestId('discard-confirm').click()
            await openEntriesList(page)
            await searchList(page, memo)
            await expect(listItems(page, memo)).toHaveCount(1)
            await expect(page.getByTestId(`entries-status-${originalId}`)).toHaveText('Posted')

            await listItems(page, memo).click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await chooseAction(page, 'Edit')
            await expect(page.getByTestId('entry-title')).toHaveText(`Edit ${number}`)
            await fillLine(page, 0, { debit: '$12.00' })
            await fillLine(page, 1, { credit: '$12.00' })
            await page.getByTestId('entry-post').click()

            await waitForOtherEntry(page, originalId)
            const replacementId = entryIdOf(page)
            await expect(page.getByTestId('entry-title')).toHaveText(`Journal entry ${number}`)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-link-replaces')).toHaveText(`Replaces ${number}`)

            await page.getByTestId('entry-link-replaces').click()
            await expect.poll(() => entryIdOf(page)).toBe(originalId)
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')

            await backToList(page)
            expect((await listStatuses(page, memo)).sort()).toEqual(['Posted', 'Void'])

            await listItems(page, memo)
                .filter({ has: page.getByTestId(`entries-status-${replacementId}`) })
                .click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await chooseAction(page, 'Edit')
            await page.getByTestId('entry-save-draft').click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
            await expect(page.getByTestId('entry-title')).toHaveText(`Edit ${number}`)
            await expect(page.getByTestId('entry-number')).toHaveText(number)
            await expect(
                page.getByText(
                    `Posting this replaces ${number} under the same number. The original is voided.`
                )
            ).toBeVisible()
            await page.getByTestId('entry-header-more').click()
            await page.getByRole('menuitem', { name: 'Delete draft', exact: true }).click()
            await page.getByTestId('delete-draft-confirm').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()

            expect((await listStatuses(page, memo)).sort()).toEqual(['Posted', 'Void'])
            await expect(page.getByTestId(`entries-status-${replacementId}`)).toHaveText('Posted')
        })

        test('reverse: voiding the posted reversal frees the original to be reversed again', async ({
            page,
        }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Unreverse', sizeName))
            const originalId = entryIdOf(page)
            const number = await entryNumber(page)

            await chooseAction(page, 'Reverse')
            await page.getByTestId('reverse-confirm').click()
            await waitForOtherEntry(page, originalId)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')

            await chooseAction(page, 'Void')
            await page.getByTestId('void-confirm').click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')

            await page.getByTestId('entry-link-reverses').click()
            await expect.poll(() => entryIdOf(page)).toBe(originalId)
            await expect(page.getByTestId('entry-title')).toHaveText(`Journal entry ${number}`)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
            await expect(page.getByTestId('entry-link-reversed-by')).toHaveCount(0)
            await expectReverseOffered(page, true)
            if (!isPhone(page)) await expect(page.getByTestId('entry-more')).toHaveCount(0)
        })

        test('reverse: Escape and a backdrop press keep the dialog open while the reverse is in flight', async ({
            page,
        }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Reverse busy', sizeName))
            const originalId = entryIdOf(page)

            await chooseAction(page, 'Reverse')
            const dialog = page.getByTestId('reverse-dialog')
            const held = await holdRequests(page, ENTRY_RECORDS, isStatusPost)
            await page.getByTestId('reverse-confirm').click()
            await held.firstHeld

            await page.keyboard.press('Escape')
            await expect(dialog).toBeVisible()
            await page.mouse.click(2, 2)
            await expect(dialog).toBeVisible()
            expect(entryIdOf(page)).toBe(originalId)

            held.release()
            await waitForOtherEntry(page, originalId)
            await expect(dialog).toHaveCount(0)
        })

        test('reverse: finishing after the user left the entry does not pull them to the reversal', async ({
            page,
        }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Reverse left', sizeName))
            const number = await entryNumber(page)
            const entryPath = new URL(page.url()).pathname

            const today = await localToday(page)

            await chooseAction(page, 'Reverse')
            // The default date is next month, past the list's default range ending today.
            await page.getByTestId('reverse-date').fill(today)
            const held = await holdRequests(page, ENTRY_RECORDS, isStatusPost)
            await page.getByTestId('reverse-confirm').click()
            await held.firstHeld

            await hopTo(page, booksPath(page, 'entries'))
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            held.release()
            await searchList(page, `Reversal of ${number}`)
            const reversal = listItems(page, `Reversal of ${number}`)
            await expect(reversal.locator('[data-testid^="entries-status-"]')).toHaveText('Posted')
            await settleFrames(page)
            await expect(page.getByTestId('entries-screen')).toBeVisible()
            expect(new URL(page.url()).pathname).toBe(booksPath(page, 'entries'))
            expect(new URL(page.url()).pathname).not.toBe(entryPath)
        })

        test('reverse: a refused reverse shows the message in the dialog and leaves no reversal draft', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Reverse refused', sizeName)
            await makePosted(page, memo)
            const originalId = entryIdOf(page)
            const number = await entryNumber(page)
            // No input makes the real server refuse a reverse here, so the posting PATCH is
            // answered with a 400. This covers the dialog and the cleanup, not the server rule.
            await page.route(ENTRY_RECORDS, route =>
                isStatusPost(route.request()) ? refuse(route, REFUSAL) : route.continue()
            )

            await chooseAction(page, 'Reverse')
            const dialog = page.getByTestId('reverse-dialog')
            await page.getByTestId('reverse-confirm').click()
            await expect(dialog.getByTestId('entry-error-summary')).toContainText(REFUSAL)
            await expect(dialog).toBeVisible()
            expect(entryIdOf(page)).toBe(originalId)

            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await expect(dialog).toHaveCount(0)
            await backToList(page)
            await searchList(page, memo)
            await expect(listItems(page, memo)).toHaveCount(1)
            await searchList(page, `Reversal of ${number}`)
            await settleFrames(page)
            await expect(page.getByTestId('entries-search')).toHaveValue(`Reversal of ${number}`)
            await expect(listItems(page, `Reversal of ${number}`)).toHaveCount(0)
        })

        test('reverse: the dialog shows a close control that dismisses it', async ({ page }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Reverse close', sizeName))

            await chooseAction(page, 'Reverse')
            const dialog = page.getByTestId('reverse-dialog')
            const close = dialog.getByRole('button', { name: 'Close', exact: true })
            await expect(close).toBeVisible()
            await close.click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
        })

        test('edit: the form keeps the journal number instead of "Assigned when posted"', async ({
            page,
        }) => {
            await start(page, size)
            await makePosted(page, uniqueMemo('Edit number', sizeName))
            const number = await entryNumber(page)

            await chooseAction(page, 'Edit')
            await expect(page.getByTestId('entry-title')).toHaveText(`Edit ${number}`)
            await expect(page.getByTestId('entry-number')).toHaveText(number)
        })

        test('edit: a draft opened for an original another edit already voided shows not-found', async ({
            page,
        }) => {
            await start(page, size)
            const memo = uniqueMemo('Edit twice', sizeName)
            await makePosted(page, memo)
            await chooseAction(page, 'Edit')
            await expect(page.getByTestId('entry-title')).toHaveText(/^Edit /)

            const other = await page.context().newPage()
            await start(other, size)
            await openEntriesList(other)
            await other.getByTestId('entries-search').fill(memo)
            await listItems(other, memo).first().click()
            await expect(other.getByTestId('entry-read-only')).toBeVisible()
            const originalId = entryIdOf(other)
            await chooseAction(other, 'Edit')
            await expect(other.getByTestId('entry-title')).toHaveText(/^Edit /)

            await page.getByTestId('entry-post').click()
            await expect(page.getByTestId('entry-read-only')).toBeVisible()

            // Opening the edit route again, in-app, for an original that is now void.
            await hopTo(other, booksPath(other, 'entries'))
            await expect(other.getByTestId('entries-screen')).toBeVisible()
            await hopTo(other, booksPath(other, `entries/new?replaces=${originalId}`))
            await expect(other).toHaveURL(new RegExp(`replaces=${originalId}`))
            await expect(other.getByTestId('entry-not-found')).toBeVisible()
            await other.close()
        })

        test('register: a posted entry shows, a draft does not, and a void keeps both lines', async ({
            page,
        }) => {
            await start(page, size)
            const draftMemo = uniqueMemo('Register draft', sizeName)
            const postedMemo = uniqueMemo('Register posted', sizeName)
            await createDraftEntry(page, {
                memo: draftMemo,
                amount: '$10.00',
                debitAccount: ACCOUNT_LABELS.checking,
                creditAccount: ACCOUNT_LABELS.equity,
            })
            await makePosted(page, postedMemo)
            const number = await entryNumber(page)

            // A second page opens Books fresh, so the register is reached from the landing
            // and stays open while the first page voids the entry.
            const other = await page.context().newPage()
            await start(other, size)
            const rowsFor = (memo: string) =>
                other
                    .locator('[data-testid^="register-row-"], [data-testid^="register-card-"]')
                    .filter({ hasText: memo })
            await openRegister(other, 'Business Checking')
            await other.getByTestId('register-range').click()
            await other.getByRole('menuitem', { name: 'This month', exact: true }).click()
            await expect(other.getByTestId('register-range')).toContainText('This month')
            await expect(rowsFor(postedMemo)).toHaveCount(1)
            await expect(rowsFor(draftMemo)).toHaveCount(0)

            await chooseAction(page, 'Void')
            await page.getByTestId('void-confirm').click()
            await expect(page.getByTestId('entry-badge')).toHaveText('Void')

            await expect(rowsFor(`Void of ${number}`)).toHaveCount(1)
            await expect(rowsFor(postedMemo)).toHaveCount(1)
            await other.close()
        })
    })
}
