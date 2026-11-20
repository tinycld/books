import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { TEST_USER_NAME } from '@tinycld/core/e2e-helpers'
import {
    inBanking,
    matchOptionIds,
    openMatchAccount,
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
import { BANKING_PHONE, bankCard, fakeReadOnlyAccess, openBanking } from './banking-helpers'
import { openReviewTab } from './for-review-helpers'
import { openTransferFromList, uniqueMemo } from './transfer-helpers'

// The Reviewed tab of a matched transaction: its In Books link, the drawer's Matched to
// list and Undo match. The reviewed group connects its own number-less account and imports
// one OFX file with a row for each of its tests, dated today; each test posts its own
// transfer from that account to 1010 Business Savings, dated today. The reader test only
// reads 1000 Business Checking, whose seeded ONLINE BILL PAY 0915 row is matched to the
// seeded bill payment of $400.00.

const CHECKING = '1000 Business Checking'
const ONLINE_BILL_PAY = 'ONLINE BILL PAY 0915'
const MATCH_RECORD_URL = /\/api\/collections\/books_bank_matches\/records\/[^/?#]+/
const BOOKS_LOCKED = 'The books are locked.'
const UNDONE_TEXT = 'Match undone. The transaction is back in For review.'

type Group = { account: string; stamp: string }
let group: Group | null = null

function reviewedGroup(): Group {
    if (!group) throw new Error('the first test of the group connects the account')
    return group
}

const name = (stamp: string, which: string) => `${stamp} reviewed ${which}`
const memo = (stamp: string, which: string) => `${stamp} memo ${which}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')
const matchedSection = (page: Page) => page.getByTestId('bank-matched-section')
const matchedLinks = (page: Page) =>
    matchedSection(page).locator('[data-testid^="bank-match-link-"]')

// The row's For review mark: the one-suggestion text or the chip.
function markOf(row: Locator): Locator {
    return row.locator(
        '[data-testid^="bank-review-suggestion-"], [data-testid^="bank-review-matches-"]'
    )
}

// The scrollers inside the visible Reviewed tab body (and the body itself) whose content is
// wider than their box, so they scroll sideways. A clipped one-line text (overflow hidden,
// ellipsis) does not scroll, so it is not counted.
async function sidewaysScrollers(page: Page) {
    const reviewed = await inBanking(page, 'bank-tab-body-reviewed')
    return reviewed.evaluate(body => {
        const found: { id: string; scrollWidth: number; clientWidth: number }[] = []
        const nodes = [body, ...Array.from(body.querySelectorAll('*'))] as HTMLElement[]
        for (const node of nodes) {
            const overflowX = getComputedStyle(node).overflowX
            const scrolls = node === body || overflowX === 'auto' || overflowX === 'scroll'
            // One pixel of slack for sub-pixel widths.
            if (scrolls && node.scrollWidth > node.clientWidth + 1) {
                found.push({
                    id: node.getAttribute('data-testid') ?? node.tagName,
                    scrollWidth: node.scrollWidth,
                    clientWidth: node.clientWidth,
                })
            }
        }
        return found
    })
}

// Matches the open For review row's one suggestion from the drawer.
async function matchFromDrawer(page: Page, description: string): Promise<void> {
    await openMatchDrawer(page, description)
    await matchOptionIds(page, 1)
    await page.getByTestId('bank-match-submit').click()
    await expect(drawer(page)).toHaveCount(0)
    await expect(await result(page)).toHaveText('Matched 1 transaction.')
}

// The transfer's read view must be open. Voids it through its Void action and confirm.
async function voidOpenTransfer(page: Page): Promise<void> {
    await expect(page.getByTestId('transfer-badge')).toHaveText('Posted')
    await page
        .getByTestId('entry-actions')
        .getByRole('button', { name: 'Void', exact: true })
        .click()
    const dialog = page.getByTestId('void-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('void-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('transfer-badge')).toHaveText('Void')
    await expect(page.getByTestId('transfer-voided-by')).toBeVisible()
}

test.describe
    .serial('bank-match: reviewed', () => {
        test('undoes a match with Z', async ({ page }) => {
            const { accountName, stamp } = await startMatchAccount(page, s => [
                { day: todayDigits(), amount: '-171.10', name: name(s, 'one') },
                {
                    day: todayDigits(),
                    amount: '-172.20',
                    name: name(s, 'two'),
                    memo: memo(s, 'two'),
                },
            ])
            group = { account: accountName, stamp }
            const transfer = await postMatchTransfer(
                page,
                accountName,
                '171.10',
                uniqueMemo('bank-match reviewed one')
            )
            const one = await visibleRow(page, name(stamp, 'one'))
            const oneId = await reviewRowId(one)
            await matchFromDrawer(page, name(stamp, 'one'))

            // Reviewed: the In Books cell links to the matched transfer.
            await openReviewTab(page, 'reviewed')
            const inBooks = await inBanking(page, `bank-review-inbooks-${oneId}`)
            await expect(inBooks).toHaveText(`Matched · Transfer ${transfer.number}`)
            await expect(inBooks).toHaveAttribute(
                'href',
                new RegExp(`books/transfers/${transfer.id}$`)
            )
            await expect.poll(() => sidewaysScrollers(page)).toEqual([])

            // The drawer lists the one matched transfer and who matched it, when. With the
            // inline drawer open, nothing in the Reviewed list scrolls sideways.
            await openMatchDrawer(page, name(stamp, 'one'))
            await expect.poll(() => sidewaysScrollers(page)).toEqual([])
            await expect(matchedSection(page)).toBeVisible()
            await expect(matchedLinks(page)).toHaveCount(1)
            await expect(matchedLinks(page)).toHaveAttribute(
                'href',
                new RegExp(`books/transfers/${transfer.id}$`)
            )
            await expect(page.getByTestId('bank-matched-by')).toHaveText(
                `Matched ${todayText()} by ${TEST_USER_NAME}`
            )

            // A refused undo keeps the drawer open with the server's message.
            await page.route(MATCH_RECORD_URL, (route: Route) =>
                route.request().method() === 'DELETE'
                    ? route.fulfill({
                          status: 400,
                          json: { status: 400, message: BOOKS_LOCKED, data: {} },
                      })
                    : route.continue()
            )
            await page.keyboard.press('z')
            await expect(page.getByTestId('bank-match-refusal')).toHaveText(BOOKS_LOCKED)
            await expect(drawer(page)).toBeVisible()
            await expect(matchedSection(page)).toBeVisible()
            await page.unrouteAll({ behavior: 'wait' })

            // Z undoes it: the row leaves Reviewed and is back on For review with its mark.
            await page.keyboard.press('z')
            await expect(drawer(page)).toHaveCount(0)
            await expect(await result(page)).toHaveText(UNDONE_TEXT)
            await expect(await visibleRow(page, name(stamp, 'one'))).toHaveCount(0)
            await openReviewTab(page, 'review')
            await expect(await inBanking(page, `bank-review-suggestion-${oneId}`)).toHaveText(
                `1 match · Transfer ${transfer.number} · ${todayText()}`
            )
        })

        test('returns the bank transaction when its transfer is voided', async ({ page }) => {
            const { account, stamp } = reviewedGroup()
            await signInWide(page)
            const transferMemo = uniqueMemo('bank-match reviewed two')
            await postMatchTransfer(page, account, '172.20', transferMemo)
            await matchFromDrawer(page, name(stamp, 'two'))

            await openTransferFromList(page, transferMemo)
            await voidOpenTransfer(page)

            // A void transfer is no suggestion: the row is back with its memo line, no mark.
            await openMatchAccount(page, account)
            const two = await visibleRow(page, name(stamp, 'two'))
            await expect(two).toHaveCount(1)
            await expect(two.getByText(memo(stamp, 'two'), { exact: true })).toBeVisible()
            await expect(markOf(two)).toHaveCount(0)
            await openReviewTab(page, 'reviewed')
            await expect(await visibleRow(page, name(stamp, 'two'))).toHaveCount(0)
        })
    })

test.describe('bank-match: reviewed reader', () => {
    test('a reader sees the matched transaction on a phone', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await signInWide(page)
        await openBanking(page)
        const checking = bankCard(page, CHECKING)
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await openReviewTab(page, 'reviewed')
        await page.setViewportSize(BANKING_PHONE)
        await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()

        // The Reviewed card's third line names what the transaction was matched to.
        const card = await visibleRow(page, ONLINE_BILL_PAY)
        const cardId = await reviewRowId(card)
        await expect(card.getByTestId(`bank-review-inbooks-${cardId}`)).toHaveText(
            /^Matched · Bill payment/
        )

        // A tap opens the sheet with the Matched to list, and no Undo match for a reader.
        await card.getByText(ONLINE_BILL_PAY, { exact: true }).click()
        await expect(drawer(page)).toBeVisible()
        await expect(matchedSection(page)).toBeVisible()
        await expect(matchedLinks(page)).toHaveCount(1)
        await expect(page.getByTestId('bank-matched-by')).toHaveText(/^Matched /)
        await expect(page.getByTestId('bank-match-undo')).toHaveCount(0)

        // Z is not registered for a reader.
        await page.keyboard.press('z')
        await expect(matchedSection(page)).toBeVisible()
        await expect(drawer(page)).toBeVisible()
        await expect(card).toHaveCount(1)
        await page.unrouteAll({ behavior: 'wait' })
    })
})
