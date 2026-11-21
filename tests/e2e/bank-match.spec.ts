import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { expectNextRowShown, shownOrder } from './bank-categorize-helpers'
import {
    inBanking,
    matchOption,
    matchOptionIds,
    openMatchDrawer,
    postMatchTransfer,
    reviewRowId,
    signInWide,
    startMatchAccount,
    todayDigits,
    todayText,
    visibleRow,
    visibleTestId,
} from './bank-match-helpers'
import { bankCard, fakeReadOnlyAccess, openBanking } from './banking-helpers'
import { EXPENSE_URL } from './expense-helpers'
import { openReviewTab } from './for-review-helpers'
import { tabTo } from './keyboard-helpers'
import { uniqueMemo } from './transfer-helpers'

// The drawer group connects its own number-less account and imports one OFX file with a
// row for each of its tests, dated today; each test posts its own transfers from that
// account to 1010 Business Savings, dated today. The seeded-book group only reads
// 1000 Business Checking, whose PACIFIC POWER AUTOPAY row has one suggestion: the
// seeded Expense 1002 of Oct 5, 2026.

const CHECKING = '1000 Business Checking'
const PACIFIC = 'PACIFIC POWER AUTOPAY'
const PACIFIC_MEMO = 'Account 4471-220'
const PACIFIC_MARK = '1 match · Expense 1002 · Oct 5, 2026'
const MATCHES_URL = '**/api/collections/books_bank_matches/records*'
const SUGGESTIONS_URL = '**/api/collections/books_bank_match_suggestions/records*'
const TRANSPORT_TEXT = 'The match could not be sent. Check your connection and try again.'
const ALREADY_MATCHED = 'Transfer 9 is already matched to another bank transaction.'

type Group = { account: string; stamp: string }
let group: Group | null = null

function drawerGroup(): Group {
    if (!group) throw new Error('the first test of the group connects the account')
    return group
}

const name = (stamp: string, which: string) => `${stamp} match ${which}`
const groupNames = (stamp: string) =>
    ['one', 'two', 'three', 'four'].map(which => name(stamp, which))
const memo = (stamp: string, which: string) => `${stamp} memo ${which}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')
const boxes = (page: Page) => page.locator('[data-testid^="bank-match-box-"]')

// The row's mark: the one-suggestion text or the chip.
function markOf(row: Locator): Locator {
    return row.locator(
        '[data-testid^="bank-review-suggestion-"], [data-testid^="bank-review-matches-"]'
    )
}

// Moves the list's focus stripe to `row` with J, from no focused row.
async function focusRowByKeys(page: Page, row: Locator): Promise<void> {
    const rowId = await reviewRowId(row)
    const index = await page.evaluate(
        id =>
            Array.from(
                document.querySelectorAll(
                    '[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]'
                )
            )
                .filter(node => (node as HTMLElement).offsetParent !== null)
                .findIndex(node => node.getAttribute('data-testid') === `bank-review-row-${id}`),
        rowId
    )
    expect(index).toBeGreaterThanOrEqual(0)
    await page.keyboard.press('Escape')
    for (let i = 0; i <= index; i += 1) await page.keyboard.press('j')
    await expect(row).toHaveAttribute('data-focused', 'true')
}

test.describe
    .serial('bank-match: drawer', () => {
        test('matches the suggested transfer from the drawer', async ({ page }) => {
            const { accountName, stamp } = await startMatchAccount(page, s => [
                {
                    day: todayDigits(),
                    amount: '-151.10',
                    name: name(s, 'one'),
                    memo: memo(s, 'one'),
                },
                { day: todayDigits(), amount: '-152.20', name: name(s, 'two') },
                { day: todayDigits(), amount: '-153.30', name: name(s, 'three') },
                {
                    day: todayDigits(),
                    amount: '-154.40',
                    name: name(s, 'four'),
                    memo: memo(s, 'four'),
                },
            ])
            group = { account: accountName, stamp }
            const transfer = await postMatchTransfer(
                page,
                accountName,
                '151.10',
                uniqueMemo('bank-match one')
            )

            const one = await visibleRow(page, name(stamp, 'one'))
            const four = await visibleRow(page, name(stamp, 'four'))
            const oneId = await reviewRowId(one)

            // The row's mark replaces its memo line; the row has no match action.
            await expect(await inBanking(page, `bank-review-suggestion-${oneId}`)).toHaveText(
                `1 match · Transfer ${transfer.number} · ${todayText()}`
            )
            await expect(one.getByText(memo(stamp, 'one'), { exact: true })).toHaveCount(0)
            await expect(one.getByRole('button', { name: /^(Match|Review)\b/ })).toHaveCount(0)
            await expect(four.getByText(memo(stamp, 'four'), { exact: true })).toBeVisible()
            await expect(markOf(four)).toHaveCount(0)

            // The drawer: the one suggestion starts chosen, the totals agree, the link opens it.
            await openMatchDrawer(page, name(stamp, 'one'))
            const [lineId] = await matchOptionIds(page, 1)
            await expect(page.getByTestId(`bank-match-box-${lineId}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
            await expect(page.getByTestId('bank-match-totals')).toHaveText(
                'Chosen $151.10 of $151.10'
            )
            await expect(page.getByTestId(`bank-match-link-${lineId}`)).toHaveAttribute(
                'href',
                new RegExp(`books/transfers/${transfer.id}$`)
            )

            // After the match the drawer shows the next For review row.
            const order = await shownOrder(page, groupNames(stamp))
            await page.getByTestId('bank-match-submit').click()
            await expectNextRowShown(page, order, name(stamp, 'one'))
            await expect(await result(page)).toHaveText('Matched 1 transaction.')
            await expect(one).toHaveCount(0)
            // The next row after a match takes no focus, so Escape closes the drawer.
            await page.keyboard.press('Escape')
            await expect(drawer(page)).toHaveCount(0)

            // A row with no suggestion opens on Categorize with the focus in its Account:
            // Escape leaves the field, ⇧M shows the empty text and Find other matches.
            await openMatchDrawer(page, name(stamp, 'four'))
            await expect(page.getByTestId('bank-cat-account-0')).toBeFocused()
            await page.keyboard.press('Escape')
            await page.keyboard.press('Shift+M')
            await expect(page.getByTestId('bank-match-section')).toContainText(
                `Books found no transaction of $154.40 near ${todayText()}.`
            )
            await expect(page.getByTestId('bank-match-find')).toBeVisible()
        })

        test('chooses one of two suggestions with the keyboard', async ({ page }) => {
            const { account, stamp } = drawerGroup()
            await signInWide(page)
            await postMatchTransfer(page, account, '152.20', uniqueMemo('bank-match two a'))
            await postMatchTransfer(page, account, '152.20', uniqueMemo('bank-match two b'))

            const two = await visibleRow(page, name(stamp, 'two'))
            const twoId = await reviewRowId(two)
            const submit = page.getByTestId('bank-match-submit')
            const totals = page.getByTestId('bank-match-totals')
            await expect(await inBanking(page, `bank-review-matches-${twoId}`)).toHaveText(
                '2 matches'
            )

            // M on a focused row does nothing: a row has no match action.
            await focusRowByKeys(page, two)
            await page.keyboard.press('m')
            await expect(drawer(page)).toHaveCount(0)
            await expect(two).toHaveCount(1)

            // Enter opens it: with two suggestions none starts chosen, and Match is disabled.
            await page.keyboard.press('Enter')
            await expect(
                page.getByTestId('bank-txn-field-description').getByText(name(stamp, 'two'), {
                    exact: true,
                })
            ).toBeVisible()
            await matchOptionIds(page, 2)
            await expect(boxes(page).nth(0)).toHaveAttribute('aria-checked', 'false')
            await expect(boxes(page).nth(1)).toHaveAttribute('aria-checked', 'false')
            await expect(submit).toBeDisabled()
            await page.keyboard.press('m')
            await expect(drawer(page)).toBeVisible()
            await expect(page.getByTestId('bank-txn-status')).toHaveText('For review')
            await expect(two).toHaveCount(1)

            // Tab to the first box; Space toggles it, not the list's row.
            const first = boxes(page).nth(0)
            // J, Enter and M put no element in focus: the focus is on the body.
            await tabTo(page, first, { max: 80, fromBody: true })
            await page.keyboard.press('Space')
            await expect(first).toHaveAttribute('aria-checked', 'true')
            await expect(await inBanking(page, `bank-review-check-${twoId}`)).toHaveAttribute(
                'aria-checked',
                'false'
            )
            await expect(totals).toHaveText('Chosen $152.20 of $152.20')
            await expect(submit).toBeEnabled()

            await page.keyboard.press('Space')
            await expect(first).toHaveAttribute('aria-checked', 'false')
            await expect(totals).toContainText('Chosen $0.00 of $152.20')
            await expect(totals).toContainText('Difference $152.20')
            await expect(submit).toBeDisabled()

            await page.keyboard.press('Space')
            await expect(first).toHaveAttribute('aria-checked', 'true')
            const order = await shownOrder(page, groupNames(stamp))
            await page.keyboard.press('m')
            await expectNextRowShown(page, order, name(stamp, 'two'))
            await expect(await result(page)).toHaveText('Matched 1 transaction.')
            await expect(two).toHaveCount(0)
        })

        test('keeps the drawer open when the match fails', async ({ page }) => {
            const { account, stamp } = drawerGroup()
            await signInWide(page)
            await postMatchTransfer(page, account, '153.30', uniqueMemo('bank-match three'))

            const three = await visibleRow(page, name(stamp, 'three'))
            const submit = page.getByTestId('bank-match-submit')
            const refusal = page.getByTestId('bank-match-refusal')
            await openMatchDrawer(page, name(stamp, 'three'))
            const [lineId] = await matchOptionIds(page, 1)
            const box = page.getByTestId(`bank-match-box-${lineId}`)
            await expect(box).toHaveAttribute('aria-checked', 'true')

            // A create that never reaches the server.
            await page.route(MATCHES_URL, (route: Route) =>
                route.request().method() === 'POST' ? route.abort() : route.continue()
            )
            await submit.click()
            await expect(refusal).toHaveText(TRANSPORT_TEXT)
            await expect(drawer(page)).toBeVisible()
            await page.unrouteAll({ behavior: 'wait' })

            // A create the server refuses.
            await page.route(MATCHES_URL, (route: Route) =>
                route.request().method() === 'POST'
                    ? route.fulfill({
                          status: 400,
                          json: { status: 400, message: ALREADY_MATCHED, data: {} },
                      })
                    : route.continue()
            )
            await submit.click()
            await expect(refusal).toHaveText(ALREADY_MATCHED)
            await expect(refusal).toHaveAttribute('role', 'alert')
            await expect(drawer(page)).toBeVisible()
            await expect(box).toHaveAttribute('aria-checked', 'true')
            await page.unrouteAll({ behavior: 'wait' })

            // A change of the choice drops the old server message.
            await box.click()
            await expect(box).toHaveAttribute('aria-checked', 'false')
            await box.click()
            await expect(box).toHaveAttribute('aria-checked', 'true')
            await expect(refusal).toHaveCount(0)

            // A create held in flight: only the drawer is read while it is held.
            let held: Route | null = null
            await page.route(MATCHES_URL, (route: Route) => {
                if (route.request().method() !== 'POST') return route.continue()
                held = route
            })
            await submit.click()
            await expect.poll(() => held !== null).toBe(true)
            await expect(submit).toContainText('Matching…')
            await expect(submit).toBeDisabled()
            await expect(box).toBeDisabled()
            const exclude = page.getByTestId('bank-txn-exclude')
            await expect(exclude).toBeDisabled()
            await expect(exclude).not.toContainText('Excluding…')

            const release = held as Route | null
            if (!release) throw new Error('the create was not held')
            const order = await shownOrder(page, groupNames(stamp))
            await release.continue()
            await expectNextRowShown(page, order, name(stamp, 'three'))
            await expect(await result(page)).toHaveText('Matched 1 transaction.')
            await expect(matchOption(page, lineId)).toHaveCount(0)
            await expect(three).toHaveCount(0)
            await page.unrouteAll({ behavior: 'wait' })
        })
    })

// Opens 1000 Business Checking's For review tab; Books must be open.
async function openCheckingReview(page: Page): Promise<void> {
    await openBanking(page)
    const checking = bankCard(page, CHECKING)
    await checking.click()
    await expect(checking).toHaveAttribute('aria-selected', 'true')
    await openReviewTab(page, 'review')
}

test.describe('bank-match: seeded book', () => {
    test('shows a load error with Retry', async ({ page }) => {
        // A fresh page: no suggestion row is in its store, so each read is a request.
        await page.route('**/api/realtime*', route => route.abort())
        await page.route(SUGGESTIONS_URL, (route: Route) =>
            route.fulfill({ status: 400, json: { status: 400, message: 'Bad request.', data: {} } })
        )
        await signInWide(page)
        await openCheckingReview(page)

        const pacific = await visibleRow(page, PACIFIC)
        const pacificId = await reviewRowId(pacific)
        await expect(pacific.getByText(PACIFIC_MEMO, { exact: true })).toBeVisible()
        await expect(page.locator('[data-testid^="bank-review-suggestion-"]')).toHaveCount(0)

        // With the drawer closed the list is a table.
        await expect(await inBanking(page, 'bank-review-table')).toBeVisible()

        await openMatchDrawer(page, PACIFIC)
        // With the inline drawer open the list's panel is narrower than the table's
        // minimum width, so the list shows cards and no column is out of view.
        await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()
        await expect(await inBanking(page, 'bank-review-table')).toHaveCount(0)
        await expect(page.getByTestId('bank-match-error')).toContainText(
            'Books could not load the matches.'
        )
        await expect(
            page.getByTestId('bank-txn-field-description').getByText(PACIFIC, { exact: true })
        ).toBeVisible()

        await page.unrouteAll({ behavior: 'wait' })
        await page.route('**/api/realtime*', route => route.abort())
        await page.getByTestId('bank-match-retry').click()
        await matchOptionIds(page, 1)
        await expect(page.getByTestId('bank-match-error')).toHaveCount(0)

        await page.getByTestId('bank-txn-close').click()
        await expect(drawer(page)).toHaveCount(0)
        await expect(page.getByTestId(`bank-review-suggestion-${pacificId}`)).toHaveText(
            PACIFIC_MARK
        )
    })

    test('a reader sees the marks and links only', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await signInWide(page)
        await openCheckingReview(page)

        const pacific = await visibleRow(page, PACIFIC)
        const pacificId = await reviewRowId(pacific)
        await expect(page.getByTestId(`bank-review-suggestion-${pacificId}`)).toHaveText(
            PACIFIC_MARK
        )

        await openMatchDrawer(page, PACIFIC)
        const [lineId] = await matchOptionIds(page, 1)
        const link = page.getByTestId(`bank-match-link-${lineId}`)
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', /books\/expenses\/[^/?#]+$/)
        await expect(boxes(page)).toHaveCount(0)
        await expect(page.getByTestId('bank-match-submit')).toHaveCount(0)
        await expect(page.getByTestId('bank-match-find')).toHaveCount(0)
        // A reader chooses nothing, so the drawer shows no totals and no refusal.
        await expect(page.getByTestId('bank-match-totals')).toHaveCount(0)
        await expect(page.getByTestId('bank-match-refusal')).toHaveCount(0)

        // M and F are not registered for a reader.
        await page.keyboard.press('m')
        await page.keyboard.press('f')
        await expect(matchOption(page, lineId)).toBeVisible()
        await expect(page.getByTestId('bank-match-back')).toHaveCount(0)
        await expect(drawer(page)).toBeVisible()

        await link.click()
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-title').filter({ visible: true })).toHaveText(
            'Expense 1002'
        )
        // The page's title holds only the type and number; the vendor is in its details.
        await expect(
            page.getByTestId('expense-detail-vendor').filter({ visible: true })
        ).toContainText('Pacific Power')
        await page.unrouteAll({ behavior: 'wait' })
    })
})
