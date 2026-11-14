import { type Browser, expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    DESKTOP,
    fillLine,
    holdRequests,
    openEntriesList,
    PHONE,
    searchEntries,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// Two sessions on one draft (general ledger review, GL-01). The first session's view
// goes stale when the second one saves. Its Post must be refused, must keep what was
// typed, and must post only after it loaded the current entry.
//
// Every write goes through the form; nothing is written raw. The phone run changes the
// first session's viewport after it opened the draft, because the entry form has a
// different layout and action bar there.

const CONFLICT = 'This entry changed after you opened it.'
const RELOAD_FAILED = 'Books could not load this entry. Check your connection, then try again.'
// The body PocketBase answers a refused list request with.
const READ_REFUSED = {
    status: 400,
    message: 'Something went wrong while processing your request.',
    data: {},
}
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const CARDS = '[data-testid^="entries-card-"]'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function secondSession(browser: Browser): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await openBooks(page)
    return page
}

async function openDraft(page: Page, memo: string) {
    await openEntriesList(page)
    await searchEntries(page, memo)
    const item = page.locator(`${ROWS}, ${CARDS}`).filter({ hasText: memo })
    await expect(item).toHaveCount(1)
    await item.click()
    await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
    await expect(page.getByTestId('entry-memo')).toHaveValue(memo)
}

for (const [name, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const) {
    test(`a stale post is refused, keeps what was typed, and posts after a reload (${name})`, async ({
        page,
        browser,
    }) => {
        const memo = uniqueName(`Conflict ${name}`)
        await openBooks(page)
        await createDraftEntry(page, {
            memo,
            amount: '$100.00',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })

        // The first session opens the draft and keeps it on screen.
        await openDraft(page, memo)
        await page.setViewportSize(size)

        // The second session changes both sides to $200.00 and saves.
        const other = await secondSession(browser)
        await openDraft(other, memo)
        await fillLine(other, 0, { debit: '$200.00' })
        await fillLine(other, 1, { credit: '$200.00' })
        const saved = other.waitForResponse(
            res => res.url().includes('/api/batch') && res.status() === 200
        )
        await other.getByTestId('entry-save-draft').click()
        await saved

        // The first session still shows $100.00, types a new memo, and posts.
        await page.getByTestId('entry-memo').fill(`${memo} reviewed`)
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)
        // Nothing was posted, and the typed memo is still there.
        await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
        await expect(page.getByTestId('entry-memo')).toHaveValue(`${memo} reviewed`)

        // Load the current entry: the other session's amounts show.
        await page.getByTestId('entry-conflict-reload').click()
        await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
        await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/200\.00/)
        await expect(page.getByTestId('entry-memo')).toHaveValue(memo)

        // Now the post is a reviewed one.
        await page.getByTestId('entry-post').click()
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
        await other.context().close()
    })
}

// The header is not changed here. A save that sends only lines carries no revision, so
// the form itself must see that the stored draft moved on.
test('a stale save that changes only amounts is refused and overwrites nothing', async ({
    page,
    browser,
}) => {
    const memo = uniqueName('Conflict lines only')
    await openBooks(page)
    await createDraftEntry(page, {
        memo,
        amount: '$100.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
    await openDraft(page, memo)

    const other = await secondSession(browser)
    await openDraft(other, memo)
    await fillLine(other, 0, { debit: '$200.00' })
    await fillLine(other, 1, { credit: '$200.00' })
    const saved = other.waitForResponse(
        res => res.url().includes('/api/batch') && res.status() === 200
    )
    await other.getByTestId('entry-save-draft').click()
    await saved

    await fillLine(page, 0, { debit: '$300.00' })
    await fillLine(page, 1, { credit: '$300.00' })
    await page.getByTestId('entry-save-draft').click()
    await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/300\.00/)

    // The other session's amounts are still the stored ones.
    await page.getByTestId('entry-conflict-reload').click()
    await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/200\.00/)
    await other.context().close()
})

// The reload reads the rows again before it mounts a new form. When that read fails, a
// new form would show the rows this session already has (the stale ones) in place of
// what was typed, so the form stays and says the entry could not be loaded.
test('a reload that cannot read the entry keeps the form and what was typed, and says so', async ({
    page,
    browser,
}) => {
    const memo = uniqueName('Conflict failed reload')
    await openBooks(page)
    await createDraftEntry(page, {
        memo,
        amount: '$100.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
    await openDraft(page, memo)

    const other = await secondSession(browser)
    await openDraft(other, memo)
    await fillLine(other, 0, { debit: '$200.00' })
    await fillLine(other, 1, { credit: '$200.00' })
    const saved = other.waitForResponse(
        res => res.url().includes('/api/batch') && res.status() === 200
    )
    await other.getByTestId('entry-save-draft').click()
    await saved

    await fillLine(page, 0, { debit: '$300.00' })
    await fillLine(page, 1, { credit: '$300.00' })
    await page.getByTestId('entry-save-draft').click()
    await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)

    // The server refuses to read the entry and its lines. (A read that gets no answer at
    // all is tried again until it gets one, so it does not fail.)
    const READS = '**/api/collections/books_journal_*/records*'
    const refused = page.waitForResponse(
        response => response.url().includes('books_journal_') && response.status() === 400
    )
    await page.route(READS, route =>
        route.request().method() === 'GET'
            ? route.fulfill({ status: 400, json: READ_REFUSED })
            : route.fallback()
    )
    await page.getByTestId('entry-conflict-reload').click()
    await refused
    await expect(page.getByText(RELOAD_FAILED)).toBeVisible()
    // The notice, with its action, and what was typed are still on the screen.
    await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/300\.00/)

    // The read works again: the reload shows the other session's amounts, and no message.
    await page.unroute(READS)
    await page.getByTestId('entry-conflict-reload').click()
    await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
    await expect(page.getByText(RELOAD_FAILED)).toHaveCount(0)
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/200\.00/)
    await other.context().close()
})

// A read that gets no answer is tried again until it gets one, so the reload can take
// a long time. The button then says so and takes no second press.
test('while the reload reads the entry, its button shows Loading and is disabled', async ({
    page,
    browser,
}) => {
    const memo = uniqueName('Conflict slow reload')
    await openBooks(page)
    await createDraftEntry(page, {
        memo,
        amount: '$100.00',
        debitAccount: ACCOUNT_LABELS.checking,
        creditAccount: ACCOUNT_LABELS.equity,
    })
    await openDraft(page, memo)

    const other = await secondSession(browser)
    await openDraft(other, memo)
    await fillLine(other, 0, { debit: '$200.00' })
    await fillLine(other, 1, { credit: '$200.00' })
    const saved = other.waitForResponse(
        res => res.url().includes('/api/batch') && res.status() === 200
    )
    await other.getByTestId('entry-save-draft').click()
    await saved

    await fillLine(page, 0, { debit: '$300.00' })
    await fillLine(page, 1, { credit: '$300.00' })
    await page.getByTestId('entry-save-draft').click()
    await expect(page.getByTestId('entry-conflict')).toContainText(CONFLICT)

    const held = await holdRequests(
        page,
        '**/api/collections/books_journal_*/records*',
        request => request.method() === 'GET'
    )
    const reload = page.getByTestId('entry-conflict-reload')
    await reload.click()
    await held.firstHeld
    await expect(reload).toHaveText('Loading…')
    await expect(reload).toBeDisabled()
    // What was typed stays until the entry is read.
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/300\.00/)

    held.release()
    await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
    await expect(page.getByTestId('entry-line-debit-0')).toHaveValue(/200\.00/)
    await other.context().close()
})
