import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { DESKTOP, isPhone, PHONE, settledBox } from './account-register-helpers'
import { ACCOUNT_LABELS, createDraftEntry, searchEntries } from './journal-entries-helpers'

// Journal entries are created by the form in a later checkpoint, so this spec
// reads the one entry per lifecycle state that `seed.ts` posts through the
// server (dated today). That is the seeded-fixture exception: the interaction
// under test (reading, ordering, laying out and opening rows) is driven through
// the UI; only the pre-existing ledger state is seeded. The spec writes nothing.
//
// It does not cover: the row window past its first page (the seed has fewer
// rows than a window; `tests/use-row-window.test.tsx` covers the window), the
// created-time tiebreak (seed rows share a date; `tests/entries-query.test.ts`
// asserts the orderBy list), the sticky heading after a scroll when the seed
// is too short to scroll (checked only when the scroller can move 200px), or a
// read-only user (the seed has no read-only Books member). The `[id]` route
// renders in checkpoint 4, so a press is asserted by URL only.

const MONEY = /\$[\d,]+\.\d{2}/
const NUMBER = /^JE-\d+/
const HEADINGS = ['Date', 'No.', 'Type', 'Memo', 'Status', 'Total']
const ROW_PREFIX = 'entries-row-'
const ROWS = `[data-testid^="${ROW_PREFIX}"]:not([data-testid^="entries-row-menu-"])`
const CARDS = '[data-testid^="entries-card-"]'
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await settledBox(locator)
    if (!box) throw new Error('element has no layout box')
    return box
}

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
// searchEntries also selects All dates, which does not reload when another spec changes the fiscal
// start month.
async function showSeededEntries(page: Page) {
    await searchEntries(page, 'Entries seed')
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

async function textRightEdge(locator: Locator): Promise<number> {
    return locator.evaluate(el => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getBoundingClientRect().right
    })
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
            await expect(voided.getByText('Void', { exact: true })).toBeVisible()
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

        test('order: entry dates never increase down the list', async ({ page }) => {
            await start(page, size)
            await openEntries(page)
            await showSeededEntries(page)

            const items = page.locator(isPhone(page) ? CARDS : ROWS)
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

        test('press: a click opens entries/[id]', async ({ page }) => {
            await start(page, size)
            await openEntries(page)
            await showSeededEntries(page)

            const posted = item(page, ENTRIES_SEED.posted)
            const id = await idOf(posted)
            await posted.click()
            await expect(page).toHaveURL(new RegExp(`/entries/${id}$`))
        })
    })
}

test.describe('journal-entries: list rows (desktop table)', () => {
    test('headings read Date, No., Type, Memo, Status, Total in order above the first row', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)

        const table = page.getByTestId('entries-table')
        await expect(table).toBeVisible()
        const boxes: Box[] = []
        for (const heading of HEADINGS) {
            const label = table.getByText(heading, { exact: true }).first()
            await expect(label).toBeVisible()
            boxes.push(await boxOf(label))
        }
        for (let i = 1; i < boxes.length; i++) {
            expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
        }
        const first = await boxOf(page.locator(ROWS).first())
        for (const box of boxes) {
            expect(box.y + box.height).toBeLessThanOrEqual(first.y + 1)
        }
    })

    test('layout: Total cells align right, rows are 44pt, Memo is the widest cell', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)

        const rows = page.locator(ROWS)
        const count = await rows.count()
        expect(count).toBeGreaterThan(1)
        const totals: Box[] = []
        const edges: number[] = []
        for (let i = 0; i < count; i++) {
            const row = rows.nth(i)
            const id = await idOf(row)
            expect((await boxOf(row)).height).toBeGreaterThanOrEqual(44)
            const total = cell(page, 'total', id)
            const box = await boxOf(total)
            totals.push(box)
            edges.push(await textRightEdge(total))

            const memoWidth = (await boxOf(cell(page, 'memo', id))).width
            for (const column of ['date', 'number', 'type', 'status', 'total']) {
                expect(memoWidth).toBeGreaterThan((await boxOf(cell(page, column, id))).width)
            }
        }
        for (let i = 0; i < totals.length; i++) {
            expect(totals[i].width).toBeCloseTo(totals[0].width, 0)
            expect(totals[i].x + totals[i].width).toBeCloseTo(totals[0].x + totals[0].width, 0)
            expect(totals[i].x + totals[i].width - edges[i]).toBeLessThanOrEqual(16)
        }
    })

    test('the heading row sits inside a scroller and stays on top after a scroll', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)

        const heading = page.getByTestId('entries-table').getByText('Date', { exact: true }).first()
        const headingInScroller = await heading.evaluate(el => {
            for (let node = el.parentElement; node; node = node.parentElement) {
                const overflowY = getComputedStyle(node).overflowY
                if (overflowY === 'auto' || overflowY === 'scroll') return true
            }
            return false
        })
        expect(headingInScroller).toBe(true)

        const room = await heading.evaluate(el => {
            for (let node = el.parentElement; node; node = node.parentElement) {
                const overflowY = getComputedStyle(node).overflowY
                if (overflowY === 'auto' || overflowY === 'scroll') {
                    return node.scrollHeight - node.clientHeight
                }
            }
            return 0
        })
        if (room < 200) return
        const before = await boxOf(heading)
        await heading.evaluate(el => {
            for (let node = el.parentElement; node; node = node.parentElement) {
                const overflowY = getComputedStyle(node).overflowY
                if (overflowY === 'auto' || overflowY === 'scroll') {
                    node.scrollTop = 200
                    return
                }
            }
        })
        const after = await boxOf(heading)
        expect(after.y).toBeCloseTo(before.y, 0)
    })

    for (const key of ['Enter', 'Space']) {
        test(`press: focusing a row and pressing ${key} opens entries/[id]`, async ({ page }) => {
            await start(page, DESKTOP)
            await openEntries(page)
            await showSeededEntries(page)

            const posted = item(page, ENTRIES_SEED.posted)
            const id = await idOf(posted)
            await posted.focus()
            await page.keyboard.press(key)
            await expect(page).toHaveURL(new RegExp(`/entries/${id}$`))
        })
    }

    test('search: the lower-case number shows that row and hides the draft row', async ({
        page,
    }) => {
        await start(page, DESKTOP)
        await openEntries(page)
        await showSeededEntries(page)

        const posted = item(page, ENTRIES_SEED.posted)
        const number = (await cell(page, 'number', await idOf(posted)).innerText()).trim()
        expect(number).toMatch(NUMBER)

        await searchEntries(page, number.toLowerCase())
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)
        await expect(item(page, ENTRIES_SEED.draft)).toHaveCount(0)
    })
})

test.describe('journal-entries: list rows (phone cards)', () => {
    test('cards replace the table and show the Total under the memo', async ({ page }) => {
        await start(page, PHONE)
        await openEntries(page)
        await showSeededEntries(page)

        await expect(page.getByTestId('entries-table')).toHaveCount(0)
        const card = item(page, ENTRIES_SEED.posted)
        await expect(card).toHaveCount(1)
        expect((await boxOf(card)).height).toBeGreaterThanOrEqual(44)

        const memo = await boxOf(card.getByText(ENTRIES_SEED.posted, { exact: true }))
        const total = await boxOf(card.getByText(MONEY))
        expect(total.y).toBeGreaterThan(memo.y)
        expect(total.x + total.width).toBeGreaterThan(memo.x)
    })

    test('search: the lower-case number shows that card and hides the draft card', async ({
        page,
    }) => {
        await start(page, PHONE)
        await openEntries(page)
        await showSeededEntries(page)

        const text = await item(page, ENTRIES_SEED.posted).innerText()
        const number = text.match(/JE-\d+/)?.[0]
        expect(number).toBeDefined()

        await searchEntries(page, (number ?? '').toLowerCase())
        await expect(item(page, ENTRIES_SEED.posted)).toHaveCount(1)
        await expect(item(page, ENTRIES_SEED.draft)).toHaveCount(0)
    })
})

// The list mounts one page of rows (100) and loads the next page near the end. Another spec's
// entries can fill the shared database, so the first test reads the new entry's own position and
// the second checks growth only when the database holds a full page.
const FIRST_ROWS = 10
const PAGE_SIZE = 100

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: default list (${sizeName})`, () => {
        test('a new entry dated today is among the first rows without searching', async ({
            page,
        }) => {
            await start(page, size)
            const memo = `Default list ${sizeName} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            await createDraftEntry(page, {
                memo,
                amount: '$10.00',
                debitAccount: ACCOUNT_LABELS.checking,
                creditAccount: ACCOUNT_LABELS.equity,
            })
            await page.getByTestId('entry-back').click()
            await expect(page.getByTestId('entries-screen')).toBeVisible()

            const selector = isPhone(page) ? CARDS : ROWS
            await expect
                .poll(async () => {
                    const texts = await page
                        .locator(selector)
                        .evaluateAll(
                            (els, count) => els.slice(0, count).map(el => el.textContent ?? ''),
                            FIRST_ROWS
                        )
                    return texts.some(text => text.includes(memo))
                })
                .toBe(true)
        })
    })
}

test.describe('journal-entries: default list paging (phone)', () => {
    test('scrolling to the end of a full page loads more entries', async ({ page }) => {
        await start(page, PHONE)
        await openEntries(page)
        const scroller = page.getByTestId('entries-cards')
        await expect(page.locator(CARDS).first()).toBeVisible()

        const cardHeight = (await boxOf(page.locator(CARDS).first())).height
        const height = () => scroller.evaluate(el => el.scrollHeight)
        const before = await height()
        const loaded = Math.round(before / cardHeight)
        if (loaded < PAGE_SIZE) return

        await scroller.evaluate(el => {
            el.scrollTop = el.scrollHeight
        })
        await expect.poll(height).toBeGreaterThan(before)
    })
})
