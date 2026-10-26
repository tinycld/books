import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'
import { ACCOUNT_LABELS, createDraftEntry } from './journal-entries-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today). That is the seeded-fixture exception: the interaction
// under test (reading, ordering and opening rows) is driven through the UI;
// only the pre-existing ledger state is seeded. The default-list test makes its
// own draft through the form. The row labels run at both sizes because phones
// render cards (`EntryCard`) instead of table rows.
//
// It does not cover: the row window past its first page (the seed has fewer
// rows than a window; `tests/use-row-window.test.tsx` covers the window), the
// created-time tiebreak (seed rows share a date; `tests/entries-query.test.ts`
// asserts the orderBy list), or a read-only user (the seed has no read-only
// Books member).

const MONEY = /\$[\d,]+\.\d{2}/
const NUMBER = /^JE-\d+/
const ROW_PREFIX = 'entries-row-'
const ROWS = `[data-testid^="${ROW_PREFIX}"]:not([data-testid^="entries-row-menu-"])`
const CARDS = '[data-testid^="entries-card-"]'
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

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

// Other specs add entries dated today to the shared database, and the list sorts newest first, so
// the seeded rows sink below the rows the list mounts (it renders a window). Every seed memo starts
// with this text, and search reads the whole collection, so it keeps them on screen at any volume.
async function showSeededEntries(page: Page) {
    await page.getByTestId('entries-search').fill('Entries seed')
}

function item(page: Page, memo: string): Locator {
    return page.locator(isPhone(page) ? CARDS : ROWS).filter({ hasText: memo })
}

async function idOf(locator: Locator): Promise<string> {
    const testId = await locator.getAttribute('data-testid')
    return (testId ?? '').replace(/^entries-(row|card)-/, '')
}

function cell(page: Page, column: string, id: string): Locator {
    return page.getByTestId(`entries-cell-${column}-${id}`)
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: list rows (${sizeName})`, () => {
        test('labels: draft, posted, void and reversal rows show their number, type and status', async ({
            page,
        }) => {
            await start(page, size)
            await openEntries(page)
            await showSeededEntries(page)

            const draft = item(page, ENTRIES_SEED.draft)
            const posted = item(page, ENTRIES_SEED.posted)
            const voided = item(page, ENTRIES_SEED.voided)
            const reversal = item(page, `Reversal of ${ENTRIES_SEED.reversed}`)
            await expect(draft).toHaveCount(1)
            await expect(reversal).toHaveCount(1)

            const draftId = await idOf(draft)
            const voidedId = await idOf(voided)
            await expect(page.getByTestId(`entries-status-${draftId}`)).toHaveText('Draft')
            await expect(page.getByTestId(`entries-status-${voidedId}`)).toHaveText('Void')
            await expect(posted).toContainText(MONEY)
            await expect(draft).toContainText(MONEY)
            await expect(draft).not.toContainText('$0.00')
            await expect(reversal).toContainText(/Reverses JE-\d+/)

            if (isPhone(page)) return

            await expect(cell(page, 'number', draftId)).toHaveText('Draft')
            await expect(cell(page, 'status', draftId)).toHaveText('Draft')
            await expect(cell(page, 'total', draftId)).toHaveText(MONEY)
            await expect(cell(page, 'total', draftId)).not.toHaveText('$0.00')

            const postedId = await idOf(posted)
            await expect(cell(page, 'number', postedId)).toHaveText(NUMBER)
            await expect(cell(page, 'type', postedId)).toContainText('Journal entry')
            await expect(cell(page, 'total', postedId)).toHaveText(MONEY)

            await expect(cell(page, 'status', voidedId)).toHaveText('Void')
            await expect(cell(page, 'number', voidedId)).toHaveText(/\S/)
            await expect(cell(page, 'number', voidedId)).not.toHaveText('Draft')

            const reversalId = await idOf(reversal)
            await expect(cell(page, 'type', reversalId)).toContainText('Reversal')
        })
    })
}

// The list mounts one page of rows. Another spec's entries can fill the shared database, so the
// default-list test reads the new entry's own position among the first rows.
const FIRST_ROWS = 10

test.describe('journal-entries: list rows (desktop)', () => {
    test('order: entry dates never increase down the list', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)

        const items = page.locator(ROWS)
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)
        const count = await items.count()
        expect(count).toBeGreaterThan(1)
        const times: number[] = []
        for (let i = 0; i < count; i++) {
            const id = await idOf(items.nth(i))
            const text = await cell(page, 'date', id).innerText()
            const time = Date.parse(`${text} UTC`)
            expect(Number.isNaN(time)).toBe(false)
            times.push(time)
        }
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeLessThanOrEqual(times[i - 1])
        }
    })

    test('press: Enter and Space on a focused row open entries/[id]', async ({ page }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)

        const posted = item(page, ENTRIES_SEED.posted)
        const id = await idOf(posted)
        const entryUrl = new RegExp(`/entries/${id}$`)

        await posted.focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(entryUrl)

        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await showSeededEntries(page)
        await posted.focus()
        await page.keyboard.press('Space')
        await expect(page).toHaveURL(entryUrl)
    })

    test('search: the lower-case number shows that row and hides the draft row', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)

        const posted = item(page, ENTRIES_SEED.posted)
        const number = (await cell(page, 'number', await idOf(posted)).innerText()).trim()
        expect(number).toMatch(NUMBER)

        await page.getByTestId('entries-search').fill(number.toLowerCase())
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)
        await expect(item(page, ENTRIES_SEED.draft)).toHaveCount(0)
    })

    test('a new entry dated today is among the first rows without searching', async ({ page }) => {
        await start(page, DESKTOP)
        const memo = `Default list ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await createDraftEntry(page, {
            memo,
            amount: '$10.00',
            debitAccount: ACCOUNT_LABELS.checking,
            creditAccount: ACCOUNT_LABELS.equity,
        })
        await page.getByTestId('entry-back').click()
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        await expect
            .poll(async () => {
                const texts = await page
                    .locator(ROWS)
                    .evaluateAll(
                        (els, count) => els.slice(0, count).map(el => el.textContent ?? ''),
                        FIRST_ROWS
                    )
                return texts.some(text => text.includes(memo))
            })
            .toBe(true)
    })
})
