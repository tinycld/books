import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { RECONCILE_SEED } from '../../tinycld/books/lib/reconcile-fixture'
import { DESKTOP } from './account-register-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { ACCOUNT_LABELS, openOtherBooksPage } from './journal-entries-helpers'
import {
    accountIdOf,
    bandFigure,
    createReconcileAccount,
    daysAgo,
    expectDifference,
    lineBox,
    lineIdOf,
    lineRow,
    openReconcile,
    openWorkScreen,
    postEntryLines,
    pressRow,
    shownLineIds,
    startReconciliation,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconcile spec §3 "Toolbar", "The list (wide)", "Clearing", "Keys" and the read-only
// state; §4 "Writes" (clear, unclear, the two batches). The serial group reads one bank
// account of its own, made in beforeAll through the UI: three payments and two deposits on
// two days, posted as two journal entries against 3000 Owner's Equity, and one
// reconciliation of a statement of $500.00 dated today. Each test leaves every row of it
// not cleared. The read-only test only reads the seeded reconciliation of 1010.

type Account = {
    name: string
    // The memo of each row, as the list shows it.
    p1: string
    p2: string
    p3: string
    d1: string
    d2: string
}

let account: Account | null = null

function group(): Account {
    if (!account) throw new Error('beforeAll made no account')
    return account
}

// Every request that would clear or unclear a row.
function clearWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', request => {
        const method = request.method()
        if (method !== 'POST' && method !== 'DELETE') return
        const url = request.url()
        const isBatch = url.includes('/api/batch')
        if (url.includes('/api/collections/books_reconciliation_lines/records')) {
            writes.push(`${method} ${url}`)
        } else if (isBatch && (request.postData() ?? '').includes('books_reconciliation_lines')) {
            writes.push(`${method} ${url}`)
        }
    })
    return writes
}

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function search(page: Page) {
    return page.getByTestId('reconcile-search').filter({ visible: true })
}

function sideTab(page: Page, side: 'all' | 'out' | 'in') {
    return page.getByTestId(`reconcile-side-tab-${side}`).filter({ visible: true })
}

function rowById(page: Page, lineId: string) {
    return page.getByTestId(`reconcile-row-${lineId}`).filter({ visible: true })
}

function boxById(page: Page, lineId: string) {
    return page.getByTestId(`reconcile-check-${lineId}`).filter({ visible: true })
}

async function expectShown(page: Page, ids: string[]): Promise<void> {
    await expect.poll(async () => (await shownLineIds(page)).sort()).toEqual([...ids].sort())
}

// The line ids of the group's five rows, read from the work screen.
async function rowIds(page: Page) {
    const a = group()
    return {
        p1: await lineIdOf(lineRow(page, a.p1)),
        p2: await lineIdOf(lineRow(page, a.p2)),
        p3: await lineIdOf(lineRow(page, a.p3)),
        d1: await lineIdOf(lineRow(page, a.d1)),
        d2: await lineIdOf(lineRow(page, a.d2)),
    }
}

test.describe('reconcile: clear transactions', () => {
    test.describe
        .serial('one account', () => {
            test.beforeAll(async ({ browser }) => {
                const page = await browser.newPage()
                await signIn(page)
                const stamp = uniqueName('rc')
                const name = await createReconcileAccount(page, 'bank')
                const made: Account = {
                    name,
                    p1: `${stamp} alpha rent`,
                    p2: `${stamp} alpha supplies`,
                    p3: `${stamp} beta fuel`,
                    d1: `${stamp} gamma deposit`,
                    d2: `${stamp} alpha refund`,
                }
                // The oldest row: one payment of $100.00, the entry's memo on its line.
                await postEntryLines(page, {
                    date: daysAgo(5),
                    memo: made.p1,
                    lines: [
                        { account: ACCOUNT_LABELS.equity, debit: '100.00' },
                        { account: name, credit: '100.00' },
                    ],
                })
                // Two payments and two deposits on one later day, each with its own line memo.
                await postEntryLines(page, {
                    date: daysAgo(1),
                    memo: `${stamp} batch`,
                    lines: [
                        { account: name, credit: '120.00', memo: made.p2 },
                        { account: name, credit: '130.00', memo: made.p3 },
                        { account: name, debit: '200.00', memo: made.d1 },
                        { account: name, debit: '75.00', memo: made.d2 },
                        { account: ACCOUNT_LABELS.equity, credit: '25.00' },
                    ],
                })
                await startReconciliation(page, name, { balance: '500.00', date: daysAgo(0) })
                account = made
                await page.close()
            })

            test('clear one by one: a row press clears, the box unclears, the link opens, realtime', async ({
                page,
            }) => {
                const a = group()
                await signIn(page)
                const work = await openWorkScreen(page, a.name)
                const summary = work.getByTestId('reconcile-summary')
                const box = lineBox(page, a.p1)
                await expect(box).toHaveAttribute('aria-checked', 'false')
                await expectDifference(page, '$500.00')

                // A press on the row, not on its link, clears it; the band follows at once.
                await pressRow(page, a.p1)
                await expect(box).toHaveAttribute('aria-checked', 'true')
                await expect(bandFigure(summary, 'Cleared balance')).toContainText('-$100.00')
                await expectDifference(page, '$600.00')
                await expect(summary.getByText('1 payment', { exact: true })).toBeVisible()

                // A press on the box of the same row unclears it.
                await box.click()
                await expect(box).toHaveAttribute('aria-checked', 'false')
                await expect(bandFigure(summary, 'Cleared balance')).toContainText('$0.00')
                await expectDifference(page, '$500.00')
                await expect(summary.getByText('1 payment', { exact: true })).toHaveCount(0)

                // The link opens the entry and does not clear the row.
                const p1 = await lineIdOf(lineRow(page, a.p1))
                await page.getByTestId(`reconcile-link-${p1}`).filter({ visible: true }).click()
                await expect(page).toHaveURL(/\/books\/entries\/[a-z0-9]{15}\/?$/)
                await expect(
                    page.getByTestId('entry-read-only').filter({ visible: true })
                ).toContainText(a.p1)
                await page.getByTestId('entry-back').filter({ visible: true }).click()
                await visibleScreen(page, 'reconcile-screen')
                await expect(lineBox(page, a.p1)).toHaveAttribute('aria-checked', 'false')
                await expectDifference(page, '$500.00')

                // A second page on the same work screen sees the press with no reload.
                const other = await openOtherBooksPage(page)
                await openWorkScreen(other, a.name)
                await expect(lineBox(other, a.p1)).toHaveAttribute('aria-checked', 'false')
                await pressRow(page, a.p1)
                await expect(lineBox(page, a.p1)).toHaveAttribute('aria-checked', 'true')
                await expect(lineBox(other, a.p1)).toHaveAttribute('aria-checked', 'true')
                await expectDifference(other, '$600.00')
                await other.close()

                await pressRow(page, a.p1)
                await expect(lineBox(page, a.p1)).toHaveAttribute('aria-checked', 'false')
            })

            test('clear all shown: the header box follows the side and the search; no match, Show and the date order', async ({
                page,
            }) => {
                const a = group()
                await signIn(page)
                await openWorkScreen(page, a.name)
                const ids = await rowIds(page)
                const all = Object.values(ids)
                const selectAll = page.getByTestId('reconcile-select-all').filter({ visible: true })
                const result = page.getByTestId('reconcile-result').filter({ visible: true })

                // Payments and "alpha": two of the three payments (the deposit "alpha refund" is
                // on the other side).
                await sideTab(page, 'out').click()
                await search(page).fill('alpha')
                await expectShown(page, [ids.p1, ids.p2])
                await expect(selectAll).toHaveAttribute('aria-checked', 'false')
                await selectAll.click()
                await expect(result).toHaveText('Cleared 2 transactions.')
                await expect(boxById(page, ids.p1)).toHaveAttribute('aria-checked', 'true')
                await expect(boxById(page, ids.p2)).toHaveAttribute('aria-checked', 'true')

                await page.getByTestId('reconcile-clear-filters').filter({ visible: true }).click()
                await expectShown(page, all)
                for (const id of [ids.p3, ids.d1, ids.d2]) {
                    await expect(boxById(page, id)).toHaveAttribute('aria-checked', 'false')
                }
                await expect(boxById(page, ids.p1)).toHaveAttribute('aria-checked', 'true')
                await expect(boxById(page, ids.p2)).toHaveAttribute('aria-checked', 'true')

                // The same filters: every shown row is cleared, so the box unclears them.
                await sideTab(page, 'out').click()
                await search(page).fill('alpha')
                await expectShown(page, [ids.p1, ids.p2])
                await expect(selectAll).toHaveAttribute('aria-checked', 'true')
                await selectAll.click()
                await expect(result).toHaveText('Uncleared 2 transactions.')
                await expect(boxById(page, ids.p1)).toHaveAttribute('aria-checked', 'false')
                await expect(boxById(page, ids.p2)).toHaveAttribute('aria-checked', 'false')

                // One of the two cleared by a row press: the box is mixed.
                await pressRow(page, a.p1)
                await expect(boxById(page, ids.p1)).toHaveAttribute('aria-checked', 'true')
                await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')

                // A search with no result, and its Clear filters.
                await search(page).fill('nothing-matches-this')
                const noMatch = page.getByTestId('reconcile-no-match').filter({ visible: true })
                await expect(noMatch).toContainText('No transactions match these filters.')
                await noMatch.getByTestId('reconcile-no-match-clear').click()
                await expectShown(page, all)
                await expect(search(page)).toHaveValue('')

                // Show: only the cleared row, then the four others.
                const show = page.getByTestId('reconcile-show').filter({ visible: true })
                await show.click()
                await page.getByRole('menuitem', { name: 'Cleared', exact: true }).click()
                await expectShown(page, [ids.p1])
                await show.click()
                await page.getByRole('menuitem', { name: 'Not cleared', exact: true }).click()
                await expectShown(page, [ids.p2, ids.p3, ids.d1, ids.d2])
                await page.getByTestId('reconcile-clear-filters').filter({ visible: true }).click()
                await expectShown(page, all)

                // The oldest row is first; the Date header puts it last, a second press first.
                await expect.poll(async () => (await shownLineIds(page))[0]).toBe(ids.p1)
                const sortDate = page.getByTestId('reconcile-sort-date').filter({ visible: true })
                await sortDate.click()
                await expect.poll(async () => (await shownLineIds(page))[4]).toBe(ids.p1)
                await sortDate.click()
                await expect.poll(async () => (await shownLineIds(page))[0]).toBe(ids.p1)

                await pressRow(page, a.p1)
                await expect(boxById(page, ids.p1)).toHaveAttribute('aria-checked', 'false')
            })

            test('a refused press returns the row and shows the server’s message', async ({
                page,
            }) => {
                const a = group()
                await signIn(page)
                const work = await openWorkScreen(page, a.name)
                const summary = work.getByTestId('reconcile-summary')
                await expect(lineBox(page, a.p3)).toHaveAttribute('aria-checked', 'false')
                await expect(bandFigure(summary, 'Cleared balance')).toContainText('$0.00')
                await expectDifference(page, '$500.00')

                await page.route(
                    '**/api/collections/books_reconciliation_lines/records*',
                    (route: Route) => {
                        if (route.request().method() !== 'POST') return route.fallback()
                        return route.fulfill({
                            status: 400,
                            contentType: 'application/json',
                            body: JSON.stringify({
                                status: 400,
                                message: 'Journal entry 12 is void.',
                                data: {},
                            }),
                        })
                    }
                )
                const answer = page.waitForResponse(
                    response =>
                        response
                            .url()
                            .includes('/api/collections/books_reconciliation_lines/records') &&
                        response.request().method() === 'POST'
                )
                await pressRow(page, a.p3)
                await answer

                await expect(lineBox(page, a.p3)).toHaveAttribute('aria-checked', 'false')
                await expect(bandFigure(summary, 'Cleared balance')).toContainText('$0.00')
                await expectDifference(page, '$500.00')
                await expect(
                    page.getByTestId('reconcile-result').filter({ visible: true })
                ).toHaveText('Journal entry 12 is void.')
                await page.unrouteAll({ behavior: 'wait' })
            })

            test('keys: J and K move, X and Space clear, 1–3 pick the side, / and Esc search, A clears all, O opens', async ({
                page,
            }) => {
                const a = group()
                await signIn(page)
                await openWorkScreen(page, a.name)
                const ids = await rowIds(page)
                await expectShown(page, Object.values(ids))
                const order = await shownLineIds(page)
                expect(order[0]).toBe(ids.p1)

                // No mouse from here on.
                await page.keyboard.press('j')
                await expect(rowById(page, order[0])).toHaveAttribute('data-focused', 'true')
                await page.keyboard.press('j')
                await expect(rowById(page, order[1])).toHaveAttribute('data-focused', 'true')
                await expect(rowById(page, order[0])).not.toHaveAttribute('data-focused', 'true')
                await page.keyboard.press('k')
                await expect(rowById(page, order[0])).toHaveAttribute('data-focused', 'true')

                await page.keyboard.press('x')
                await expect(boxById(page, order[0])).toHaveAttribute('aria-checked', 'true')
                await page.keyboard.press('Space')
                await expect(boxById(page, order[0])).toHaveAttribute('aria-checked', 'false')

                await page.keyboard.press('2')
                await expect(sideTab(page, 'out')).toHaveAttribute('aria-selected', 'true')
                await expectShown(page, [ids.p1, ids.p2, ids.p3])
                await page.keyboard.press('3')
                await expect(sideTab(page, 'in')).toHaveAttribute('aria-selected', 'true')
                await expectShown(page, [ids.d1, ids.d2])
                await page.keyboard.press('1')
                await expect(sideTab(page, 'all')).toHaveAttribute('aria-selected', 'true')
                await expectShown(page, order)

                await page.keyboard.press('/')
                await expect(search(page)).toBeFocused()
                await page.keyboard.type('beta')
                await expectShown(page, [ids.p3])
                await page.keyboard.press('Escape')
                await expect(search(page)).toHaveValue('')
                await expect(search(page)).not.toBeFocused()
                await expectShown(page, order)

                const result = page.getByTestId('reconcile-result').filter({ visible: true })
                await page.keyboard.press('a')
                await expect(result).toHaveText('Cleared 5 transactions.')
                for (const id of order) {
                    await expect(boxById(page, id)).toHaveAttribute('aria-checked', 'true')
                }
                await page.keyboard.press('a')
                await expect(result).toHaveText('Uncleared 5 transactions.')
                for (const id of order) {
                    await expect(boxById(page, id)).toHaveAttribute('aria-checked', 'false')
                }

                // K at the first row stays there, so five presses focus it from any row.
                for (let press = 0; press < order.length; press++) await page.keyboard.press('k')
                await expect(rowById(page, order[0])).toHaveAttribute('data-focused', 'true')
                await page.keyboard.press('o')
                await expect(page).toHaveURL(/\/books\/entries\/[a-z0-9]{15}\/?$/)
                await expect(
                    page.getByTestId('entry-read-only').filter({ visible: true })
                ).toContainText(a.p1)
            })
        })

    test('read-only user: no boxes, a check mark on the cleared row, only the movement and filter keys', async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await signIn(page)
        const writes = clearWrites(page)
        const accounts = await openReconcile(page)
        await expect(
            accounts.locator('[data-testid^="reconcile-start-"]').filter({ visible: true })
        ).toHaveCount(0)
        const savingsId = await accountIdOf(page, '1010 Business Savings')
        const view = page.getByTestId(`reconcile-view-${savingsId}`).filter({ visible: true })
        await expect(view).toBeVisible()
        await view.click()
        await expect(page).toHaveURL(
            new RegExp(`/books/reconcile/${RECONCILE_SEED.inProgress.id}/?$`)
        )
        const work = await visibleScreen(page, 'reconcile-screen')
        // A reader's header has no action.
        for (const id of [
            'reconcile-edit-info',
            'reconcile-later',
            'reconcile-finish',
            'reconcile-more',
            'reconcile-finish-bar',
        ]) {
            await expect(page.getByTestId(id).filter({ visible: true })).toHaveCount(0)
        }

        const clearedMemo = RECONCILE_SEED.entries[RECONCILE_SEED.inProgress.clears[0]].memo
        const openMemo = RECONCILE_SEED.entries[3].memo
        const clearedRow = lineRow(page, clearedMemo)
        const openRow = lineRow(page, openMemo)
        // The seed's older uncleared lines on 1010 fill the first window of the list (oldest
        // first), so a reader reaches the two seeded rows through the search, as a user would.
        await search(page).fill('Reconcile seed')
        await expect(clearedRow).toBeVisible()
        await expect(openRow).toBeVisible()
        const clearedId = await lineIdOf(clearedRow)

        // The seeded statement is $15.00 above the cleared balance, and the fee refund of
        // $15.00 is not cleared: the one-transaction hint names it, with no Show for a reader.
        const openId = await lineIdOf(openRow)
        const openLabel = (
            (await page
                .getByTestId(`reconcile-link-${openId}`)
                .filter({ visible: true })
                .textContent()) ?? ''
        ).trim()
        // The entry number has the book's prefix ("Journal entry JE-29").
        expect(openLabel).toMatch(/^Journal entry \S+$/)
        const hints = work.getByTestId('reconcile-hints')
        await expect(hints).toContainText(
            `Clearing ${openLabel} ($15.00) makes the difference zero.`
        )
        await expect(work.getByTestId('reconcile-hint-action-one')).toHaveCount(0)

        await expect(work.locator('[data-testid^="reconcile-check-"]')).toHaveCount(0)
        await expect(work.getByTestId('reconcile-select-all')).toHaveCount(0)
        await expect(work.getByTestId('reconcile-clear-matched')).toHaveCount(0)
        const mark = clearedRow.getByTestId(`reconcile-cleared-mark-${clearedId}`)
        await expect(mark).toBeVisible()
        await expect(openRow.locator('[data-testid^="reconcile-cleared-mark-"]')).toHaveCount(0)

        // A press on a row changes nothing.
        await openRow.getByText(openMemo, { exact: true }).click()
        await expect(openRow.locator('[data-testid^="reconcile-cleared-mark-"]')).toHaveCount(0)
        await expect(work.locator('[data-testid^="reconcile-check-"]')).toHaveCount(0)

        // J moves the focus; X changes nothing; 2 filters. The row press took the focus out
        // of the search, so the keys reach the screen.
        await expect(search(page)).not.toBeFocused()
        const order = await shownLineIds(page)
        await page.keyboard.press('j')
        await expect(rowById(page, order[0])).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('x')
        await expect(mark).toBeVisible()
        await expect(openRow.locator('[data-testid^="reconcile-cleared-mark-"]')).toHaveCount(0)
        await page.keyboard.press('2')
        await expect(sideTab(page, 'out')).toHaveAttribute('aria-selected', 'true')
        // Both seeded rows are deposits.
        await expect(openRow).toHaveCount(0)
        await expect(clearedRow).toHaveCount(0)
        expect(writes).toEqual([])
    })
})
