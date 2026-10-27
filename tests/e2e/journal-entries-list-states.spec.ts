import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today, so the default "This fiscal year" range shows them on
// any date). That is the seeded-fixture exception: the interaction under test
// (chips, search, range and states) is driven through the UI; only the
// pre-existing ledger state is seeded. The error and empty states intercept the
// list request with `route.fulfill`, which writes nothing. The filters are shared
// by the table and the phone card list, so they run at desktop width; the phone
// run covers the phone-only New button.
//
// It does not cover a read-only user: the seed has no read-only Books member,
// so no spec can log in as one. The New button gating is covered by the
// `newEntryVisible` unit test and the pure access tests, not here.

const JOURNAL_ENTRIES = '**/api/collections/books_journal_entries/records*'
const REALTIME = '**/api/realtime*'
const OTHER_MEMOS = [
    ENTRIES_SEED.posted,
    ENTRIES_SEED.reversed,
    ENTRIES_SEED.voided,
    ENTRIES_SEED.auto,
]
const ALL_MEMOS = [ENTRIES_SEED.draft, ...OTHER_MEMOS]

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

// Wide: the Accounting group of the Books sidebar. Phone: the Lists hub card.
async function openEntries(page: Page) {
    if (isPhone(page)) {
        await page.getByTestId('books-list-card-entries').click()
    } else {
        const item = page.getByTestId('books-nav-entries')
        const toggle = page.getByTestId('books-nav-accounting-toggle')
        await toggle.waitFor({ state: 'attached' })
        if (!(await item.isVisible())) await toggle.click()
        await item.click()
    }
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

// Other specs add entries dated today to the shared database, and the list sorts newest first,
// so the seeded rows sink below the rows a phone mounts (the list renders a window). Every seed memo
// starts with this text, and search reads the whole collection, so it keeps them on screen at any volume.
async function showSeededEntries(page: Page) {
    await page.getByTestId('entries-search').fill('Entries seed')
}

async function expectMemos(page: Page, memos: string[], count: number) {
    for (const memo of memos) {
        await expect(page.getByText(memo, { exact: true })).toHaveCount(count)
    }
}

async function chooseRange(page: Page, label: string) {
    await page.getByTestId('entries-range').click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByTestId('entries-range')).toContainText(label)
}

test.describe('journal-entries: list header and states (phone)', () => {
    test('the New button on the entries list opens the New menu with Journal entry', async ({
        page,
    }) => {
        await start(page, PHONE)
        await openEntries(page)

        await page.getByLabel('New', { exact: true }).click()
        await expect(page.getByTestId('books-new-journal-entry')).toHaveText('Journal entry')
    })
})

test.describe('journal-entries: list header and states (desktop)', () => {
    test('the Draft chip shows only the draft entry and All restores the rest', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)
        await expectMemos(page, ALL_MEMOS, 1)

        await page.getByTestId('entries-chip-draft').click()
        await expectMemos(page, [ENTRIES_SEED.draft], 1)
        await expectMemos(page, OTHER_MEMOS, 0)

        await page.getByTestId('entries-chip-all').click()
        await expectMemos(page, ALL_MEMOS, 1)
    })

    test('search narrows by memo regardless of case, no-match, and Clear filters restores', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)

        const search = page.getByTestId('entries-search')
        await search.fill(ENTRIES_SEED.posted.toLowerCase())
        await expectMemos(page, [ENTRIES_SEED.posted], 1)
        await expectMemos(page, [ENTRIES_SEED.draft], 0)

        await search.fill('zzzz-no-such')
        await expect(page.getByTestId('entries-no-match')).toContainText('No entries match')
        await expectMemos(page, ALL_MEMOS, 0)

        await page.getByTestId('entries-clear-filters').click()
        await expect(search).toHaveValue('')
        await expect(page.getByTestId('entries-no-match')).toHaveCount(0)
        await showSeededEntries(page)
        await expectMemos(page, ALL_MEMOS, 1)
    })

    test('an error shows the alert and Retry reloads the rows', async ({ page }) => {
        await start(page, DESKTOP)
        await page.route(JOURNAL_ENTRIES, route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
        await openEntries(page)

        const error = page.getByTestId('entries-error')
        await expect(error).toContainText('Could not load journal entries')
        await expect(page.getByRole('alert')).toContainText('Could not load journal entries')

        await page.unroute(JOURNAL_ENTRIES)
        await page.getByTestId('entries-retry').click()
        await expect(error).toHaveCount(0)
        await showSeededEntries(page)
        await expectMemos(page, ALL_MEMOS, 1)
    })

    test('All dates keeps the seeded rows and Last fiscal year hides them', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await expect(page.getByTestId('entries-range')).toContainText('This fiscal year')

        await showSeededEntries(page)
        await chooseRange(page, 'All dates')
        await expectMemos(page, ALL_MEMOS, 1)

        await chooseRange(page, 'Last fiscal year')
        await expectMemos(page, ALL_MEMOS, 0)
        await expect(page.getByTestId('entries-no-match')).toContainText('No entries match')
        await expect(page.getByTestId('entries-empty')).toHaveCount(0)

        await page.getByTestId('entries-clear-filters').click()
        await expect(page.getByTestId('entries-range')).toContainText('This fiscal year')
        await showSeededEntries(page)
        await expectMemos(page, ALL_MEMOS, 1)
    })

    test('an empty list response shows the none state with a New button', async ({ page }) => {
        await start(page, DESKTOP)
        // Specs running in parallel create entries in this database, and the realtime stream
        // would file those rows into the list under the faked empty response.
        await page.route(REALTIME, route => route.abort())
        await page.route(JOURNAL_ENTRIES, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    items: [],
                    page: 1,
                    perPage: 30,
                    totalItems: 0,
                    totalPages: 0,
                }),
            })
        )
        await openEntries(page)

        const empty = page.getByTestId('entries-empty')
        await expect(empty).toContainText('No journal entries yet')
        await expect(empty.getByTestId('entries-new')).toBeVisible()
        await expect(page.getByTestId('entries-no-match')).toHaveCount(0)
    })
})
