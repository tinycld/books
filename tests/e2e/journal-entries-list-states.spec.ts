import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today, so the default "This fiscal year" range shows them on
// any date). That is the seeded-fixture exception: the interaction under test
// (the list header, chips, search, range and states) is driven through the UI;
// only the pre-existing ledger state is seeded. The error and empty states
// intercept the list request with `route.fulfill`, which writes nothing.
//
// It does not cover a read-only user: the seed has no read-only Books member,
// so no spec can log in as one. The New button gating is covered by the
// `newEntryVisible` unit test and the pure access tests, not here.

const JOURNAL_ENTRIES = '**/api/collections/books_journal_entries/records*'
const REALTIME = '**/api/realtime*'
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const
const CHIPS = [
    ['all', 'All'],
    ['draft', 'Draft'],
    ['posted', 'Posted'],
    ['void', 'Void'],
] as const
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

async function hasScrollingAncestor(page: Page, testId: string) {
    return page.getByTestId(testId).evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') return true
        }
        return false
    })
}

async function chooseRange(page: Page, label: string) {
    await page.getByTestId('entries-range').click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByTestId('entries-range')).toContainText(label)
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: list header and states (${sizeName})`, () => {
        test('the sidebar or Lists hub reaches Journal entries and the New menu lists it', async ({
            page,
        }) => {
            await start(page, size)
            await openEntries(page)
            await expect(page).toHaveURL(/\/a\/books\/entries$/)
            await showSeededEntries(page)
            await expectMemos(page, ALL_MEMOS, 1)

            if (isPhone(page)) {
                await page.getByLabel('New', { exact: true }).click()
                await expect(page.getByTestId('books-new-journal-entry')).toHaveText(
                    'Journal entry'
                )
            }
        })

        test('the header shows the title, New button, search and four chips outside the scroller', async ({
            page,
        }) => {
            await start(page, size)
            await openEntries(page)

            await expect(page.getByTestId('entries-title')).toHaveText('Journal entries')
            await expect(page.getByTestId('entries-new')).toHaveText('New journal entry')
            await expect(page.getByTestId('entries-search')).toBeVisible()
            for (const [id, label] of CHIPS) {
                const chip = page.getByTestId(`entries-chip-${id}`)
                await expect(chip).toHaveText(label)
                const box = await chip.boundingBox()
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
                expect(await hasScrollingAncestor(page, `entries-chip-${id}`)).toBe(false)
            }
            expect(await hasScrollingAncestor(page, 'entries-title')).toBe(false)
        })

        test('the Draft chip shows only the draft entry and All restores the rest', async ({
            page,
        }) => {
            await start(page, size)
            await openEntries(page)
            await showSeededEntries(page)
            await expectMemos(page, ALL_MEMOS, 1)

            await page.getByTestId('entries-chip-draft').click()
            await expectMemos(page, [ENTRIES_SEED.draft], 1)
            await expectMemos(page, OTHER_MEMOS, 0)

            await page.getByTestId('entries-chip-all').click()
            await expectMemos(page, ALL_MEMOS, 1)
        })

        test('search narrows to the typed memo and Clear filters restores the rows', async ({
            page,
        }) => {
            await start(page, size)
            await openEntries(page)

            const search = page.getByTestId('entries-search')
            await search.fill(ENTRIES_SEED.posted)
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

        test('search matches the memo regardless of case', async ({ page }) => {
            await start(page, size)
            await openEntries(page)

            await page.getByTestId('entries-search').fill(ENTRIES_SEED.posted.toLowerCase())
            await expectMemos(page, [ENTRIES_SEED.posted], 1)
            await expectMemos(page, [ENTRIES_SEED.draft], 0)
        })

        test('an error shows the alert and Retry reloads the rows', async ({ page }) => {
            await start(page, size)
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

        test('All dates keeps the seeded rows and Last fiscal year hides them', async ({
            page,
        }) => {
            await start(page, size)
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
            await start(page, size)
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
            await expect(empty.getByTestId('entries-new')).toHaveText('New journal entry')
            await expect(page.getByTestId('entries-no-match')).toHaveCount(0)
        })
    })
}
