import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    DESKTOP,
    openingItemIsFirst,
    openRegister,
    REGISTER_SEED,
    revealRegisterItem,
    scrollRegisterToTop,
} from './account-register-helpers'

// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries it reads are posted by
// `seed.ts` through the server's posting hook (dated relative to today, so the
// spec never depends on the calendar). That is the seeded-fixture exception:
// the interaction under test (reading and sorting the register table) is
// driven through the UI; only the pre-existing ledger state is seeded. The
// spec writes nothing. It does not cover the phone layout or keyboard
// activation of a row (checkpoint 5), a blank Ref no. (every seeded entry has
// a number) or a negative running balance (the seeded Business Checking
// balance never goes below zero). All data is read through the UI.

const MONEY = /\$[\d,]+\.\d{2}/
const ROWS = '[data-testid^="register-row-"]'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no layout box')
    return box
}

function cents(text: string): number {
    const match = text.match(/\$([\d,]+)\.(\d{2})/)
    if (!match) return 0
    const value = Number(match[1].replace(/,/g, '')) * 100 + Number(match[2])
    return /[-−]/.test(text) ? -value : value
}

// This month, not a fiscal range: books-settings.spec.ts and the setup wizard spec change the
// fiscal start month on the shared DB, and that reloads a fiscal-range register mid-test.
async function openChecking(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
    await openRegister(page, 'Business Checking')
    await page.getByTestId('register-range').click()
    await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
    await expect(page.getByTestId('register-range')).toContainText('This month')
    await expect(page.getByTestId('register-table')).toBeVisible()
}

function rows(page: Page) {
    return page.locator(ROWS)
}

// Seeded entries can sit below the register's mounted window, so each lookup scrolls to them.
async function rowByMemo(page: Page, memo: string) {
    const row = rows(page).filter({ hasText: memo })
    await revealRegisterItem(page, row)
    return row
}

async function rowIdByMemo(page: Page, memo: string) {
    return (await (await rowByMemo(page, memo)).getAttribute('data-testid')) ?? ''
}

// Reads every mounted row, the ending balance and the opening row in one evaluate. The register
// mounts only a window of its rows, and other specs post entries dated today on Business
// Checking on the shared DB, so rows can shift out of the window between separate reads.
async function registerSnapshot(page: Page) {
    const raw = await page.evaluate(selector => {
        const textOf = (testId: string) => {
            const el = document.querySelector(`[data-testid="${testId}"]`)
            return el instanceof HTMLElement ? el.innerText.trim() : ''
        }
        const rows = Array.from(document.querySelectorAll(selector)).map(el => {
            const id = el.getAttribute('data-testid') ?? ''
            const line = id.replace('register-row-', '')
            return {
                id,
                memo: textOf(`register-cell-memo-${line}`),
                date: textOf(`register-cell-date-${line}`),
                debit: textOf(`register-cell-debit-${line}`),
                credit: textOf(`register-cell-credit-${line}`),
                balance: textOf(`register-cell-balance-${line}`),
            }
        })
        return {
            rows,
            ending: textOf('register-ending-balance'),
            opening: textOf('register-opening-row'),
        }
    }, ROWS)
    return {
        ending: raw.ending,
        opening: raw.opening,
        rows: raw.rows.map(row => ({
            id: row.id,
            memo: row.memo,
            day: Date.parse(row.date),
            debit: cents(row.debit),
            credit: cents(row.credit),
            balance: cents(row.balance),
        })),
    }
}

type Row = Awaited<ReturnType<typeof registerSnapshot>>['rows'][number]

// The mounted rows are contiguous. Returns how many different days they hold.
function expectDatesInOrder(rows: Row[], order: 'newest' | 'oldest') {
    expect(rows.length).toBeGreaterThan(1)
    const days = rows.map(row => row.day)
    const sorted = [...days].sort((a, b) => (order === 'newest' ? b - a : a - b))
    expect(days).toEqual(sorted)
    return new Set(days).size
}

// Each row's balance differs from the row before it in time by that row's debit minus credit.
function expectRunningBalance(rows: Row[], order: 'newest' | 'oldest') {
    expect(rows.length).toBeGreaterThan(1)
    for (let i = 0; i < rows.length - 1; i++) {
        const [newer, older] = order === 'newest' ? [rows[i], rows[i + 1]] : [rows[i + 1], rows[i]]
        expect(newer.balance - older.balance).toBe(newer.debit - newer.credit)
    }
}

// Rows another spec posts while the test runs join the newest end, so an order is compared on
// the rows both reads hold: those keep their relative order.
function expectSameOrder(before: Row[], after: Row[]) {
    const afterIds = new Set(after.map(row => row.id))
    const shared = before.map(row => row.id).filter(id => afterIds.has(id))
    expect(shared.length).toBeGreaterThan(1)
    const sharedIds = new Set(shared)
    expect(after.map(row => row.id).filter(id => sharedIds.has(id))).toEqual(shared)
}

// Flips the date sort and waits for the new order: oldest first puts the opening row at the
// top of the list, newest first puts an entry row there.
async function toggleSort(page: Page, order: 'newest' | 'oldest') {
    await page.getByTestId('register-sort-date').click()
    await scrollRegisterToTop(page)
    await expect.poll(() => openingItemIsFirst(page)).toBe(order === 'oldest')
}

async function cell(page: Page, column: string, rowTestId: string) {
    const lineId = rowTestId.replace('register-row-', '')
    return page.getByTestId(`register-cell-${column}-${lineId}`)
}

async function cellText(page: Page, column: string, rowTestId: string) {
    return (await (await cell(page, column, rowTestId)).innerText()).trim()
}

test.describe('account-register: wide table', () => {
    test("the table shows each seeded entry's cells: plain, split, void, reversal and corrected", async ({
        page,
    }) => {
        await openChecking(page)

        for (const memo of [
            REGISTER_SEED.sale,
            REGISTER_SEED.split,
            REGISTER_SEED.voidOriginal,
            REGISTER_SEED.corrected,
        ]) {
            await expect(await rowByMemo(page, memo)).toHaveCount(1)
        }

        const saleId = await rowIdByMemo(page, REGISTER_SEED.sale)
        expect(await cellText(page, 'ref', saleId)).toMatch(/\S/)
        expect(await cellText(page, 'type', saleId)).toBe('Journal entry')
        expect(await cellText(page, 'account', saleId)).toBe('Accounts receivable')
        expect(await cellText(page, 'debit', saleId)).toMatch(MONEY)
        expect(await cellText(page, 'credit', saleId)).toBe('')

        const splitId = await rowIdByMemo(page, REGISTER_SEED.split)
        expect(await cellText(page, 'account', splitId)).toBe('-Split-')
        expect(await cellText(page, 'credit', splitId)).toMatch(MONEY)

        const voidId = await rowIdByMemo(page, REGISTER_SEED.voidOriginal)
        expect(await cellText(page, 'type', voidId)).toContain('Void')

        const voidReversal = rows(page).filter({
            has: page.locator('[data-testid^="register-cell-type-"]', {
                hasText: /^Void reversal of /,
            }),
        })
        await revealRegisterItem(page, voidReversal.first())
        await expect(voidReversal).not.toHaveCount(0)

        const correctedId = await rowIdByMemo(page, REGISTER_SEED.corrected)
        expect(await cellText(page, 'type', correctedId)).toBe('Journal entry')
    })

    test('sorting by date reverses rows and moves the opening row, and running balances chain from opening to ending', async ({
        page,
    }) => {
        await openChecking(page)
        const newestTop = await registerSnapshot(page)
        expectDatesInOrder(newestTop.rows, 'newest')
        expectRunningBalance(newestTop.rows, 'newest')
        expect(newestTop.rows[0].balance).toBe(cents(newestTop.ending))

        // Newest first, the opening row is the last item: it is reached by scrolling to the end.
        // That end is stable while other specs post, because their entries are dated today and
        // sort to the newest end.
        const opening = page.getByTestId('register-opening-row')
        await revealRegisterItem(page, opening)
        await expect(opening).toBeVisible()
        expect((await boxOf(opening)).y).toBeGreaterThan((await boxOf(rows(page).last())).y)
        const oldestEnd = await registerSnapshot(page)
        const daysAtEnd = expectDatesInOrder(oldestEnd.rows, 'newest')
        expectRunningBalance(oldestEnd.rows, 'newest')
        // seed.ts dates this row the 1st of the month and skips it when it runs on the 1st, so
        // when the range holds it, the oldest end holds two different days.
        if (oldestEnd.rows.some(row => row.memo === REGISTER_SEED.monthStart)) {
            expect(daysAtEnd).toBeGreaterThan(1)
        }
        const oldestAtEnd = oldestEnd.rows[oldestEnd.rows.length - 1]
        expect(oldestAtEnd.balance).toBe(
            cents(oldestEnd.opening) + oldestAtEnd.debit - oldestAtEnd.credit
        )

        // Oldest first, the opening row is the first item, above the oldest entry, and the rows
        // below it are the bottom rows of newest first, reversed.
        await toggleSort(page, 'oldest')
        await expect(opening).toBeVisible()
        expect((await boxOf(opening)).y).toBeLessThan((await boxOf(rows(page).first())).y)
        const oldestTop = await registerSnapshot(page)
        expectDatesInOrder(oldestTop.rows, 'oldest')
        expectRunningBalance(oldestTop.rows, 'oldest')
        const compared = Math.min(oldestTop.rows.length, oldestEnd.rows.length)
        expect(compared).toBeGreaterThan(1)
        expect(oldestTop.rows.slice(0, compared).map(row => row.id)).toEqual(
            [...oldestEnd.rows]
                .reverse()
                .slice(0, compared)
                .map(row => row.id)
        )

        // Back to newest first, the rows at the top come back in their first order.
        await toggleSort(page, 'newest')
        const newestAgain = await registerSnapshot(page)
        expectDatesInOrder(newestAgain.rows, 'newest')
        expectRunningBalance(newestAgain.rows, 'newest')
        expectSameOrder(newestTop.rows, newestAgain.rows)
    })
})
