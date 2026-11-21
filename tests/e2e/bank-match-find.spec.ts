import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import {
    inBanking,
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
import { BANKING_PHONE } from './banking-helpers'
import { tabTo } from './keyboard-helpers'

// One serial group: the first test connects its own number-less account and imports one
// OFX file with the five bank rows of the group, dated today; each test then posts its own
// transfers from that account to 1010 Business Savings. The amounts differ per test, so one
// test's transfer is never another test's suggestion. The first test runs on a phone: the
// list is cards, the mark is the card form and the drawer is the bottom sheet.

const MATCHES_URL = '**/api/collections/books_bank_matches/records*'
const OPTION_PREFIX = 'bank-match-option-'

type Group = { account: string; stamp: string }
let group: Group | null = null

function findGroup(): Group {
    if (!group) throw new Error('the first test of the group connects the account')
    return group
}

const name = (stamp: string, which: string) => `${stamp} find ${which}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')
const checkedBoxes = (page: Page) =>
    page.locator('[data-testid^="bank-match-box-"][aria-checked="true"]')

// A local day `offset` days from today, 'YYYY-MM-DD', as the date fields hold it.
function localDay(offset: number): string {
    const now = new Date()
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const month = String(day.getMonth() + 1).padStart(2, '0')
    const date = String(day.getDate()).padStart(2, '0')
    return `${day.getFullYear()}-${month}-${date}`
}

// The line ids of the Match section's option rows, in screen order, read in one snapshot.
function shownOptionIds(page: Page): Promise<string[]> {
    return page.evaluate(
        prefix =>
            Array.from(document.querySelectorAll(`[data-testid^="${prefix}"]`))
                .filter(node => (node as HTMLElement).offsetParent !== null)
                .map(node => (node.getAttribute('data-testid') ?? '').slice(prefix.length)),
        OPTION_PREFIX
    )
}

// The line id of the one option row that shows `amount` ('$100.00').
async function optionIdByAmount(page: Page, amount: string): Promise<string> {
    const option = page
        .locator(`[data-testid^="${OPTION_PREFIX}"]`)
        .filter({ has: page.getByText(amount, { exact: true }) })
    await expect(option).toHaveCount(1)
    const testId = (await option.getAttribute('data-testid')) ?? ''
    return testId.slice(OPTION_PREFIX.length)
}

// Whether `inner`'s right edge is at or left of `outer`'s right edge.
async function rightEdgeInside(inner: Locator, outer: Locator): Promise<boolean> {
    const innerBox = await inner.boundingBox()
    const outerBox = await outer.boundingBox()
    if (!innerBox || !outerBox) return false
    return innerBox.x + innerBox.width <= outerBox.x + outerBox.width + 0.5
}

// Whether `first` ends left of where `second` starts, on the same bar.
async function standsBefore(first: Locator, second: Locator): Promise<boolean> {
    const a = await first.boundingBox()
    const b = await second.boundingBox()
    if (!a || !b) return false
    return a.x + a.width <= b.x
}

test.describe
    .serial('bank-match: find and batch', () => {
        test('matches from the sheet on a phone', async ({ page }) => {
            const { accountName, stamp } = await startMatchAccount(page, s => [
                { day: todayDigits(), amount: '-300.00', name: name(s, 'three hundred') },
                { day: todayDigits(), amount: '-161.10', name: name(s, 'one') },
                { day: todayDigits(), amount: '-162.20', name: name(s, 'two') },
                { day: todayDigits(), amount: '-164.40', name: name(s, 'four') },
                { day: todayDigits(), amount: '-165.50', name: name(s, 'five') },
            ])
            group = { account: accountName, stamp }
            const transfer = await postMatchTransfer(page, accountName, '165.50', `${stamp} phone`)

            await page.setViewportSize(BANKING_PHONE)
            await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()

            // The card's second line: the day, then the mark without its date.
            const card = await visibleRow(page, name(stamp, 'five'))
            const cardId = await reviewRowId(card)
            await expect(await inBanking(page, `bank-review-suggestion-${cardId}`)).toHaveText(
                `1 match · Transfer ${transfer.number}`
            )
            await expect(card).toContainText(todayText())

            // A tap opens the sheet with the Match section.
            await card.getByText(name(stamp, 'five'), { exact: true }).click()
            await expect(drawer(page)).toBeVisible()
            await expect(page.getByTestId('bank-match-section')).toBeVisible()
            const [lineId] = await matchOptionIds(page, 1)

            // The hardware key F reaches the sheet and opens the find mode.
            await page.keyboard.press('f')
            await expect(page.getByTestId('bank-match-back')).toBeVisible()
            await expect(page.getByTestId(`bank-match-box-${lineId}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
            const from = page.getByTestId('bank-match-from')
            const to = page.getByTestId('bank-match-to')
            await expect(from).toBeVisible()
            await expect(to).toBeVisible()
            await expect.poll(() => rightEdgeInside(from, drawer(page))).toBe(true)
            await expect.poll(() => rightEdgeInside(to, drawer(page))).toBe(true)

            await page.getByTestId('bank-match-back').click()
            await expect(page.getByTestId('bank-match-back')).toHaveCount(0)
            await expect(page.getByTestId('bank-match-find')).toBeVisible()

            // The hardware key M matches from the sheet.
            await page.keyboard.press('m')
            await expect(drawer(page)).toHaveCount(0)
            await expect(await result(page)).toHaveText('Matched 1 transaction.')
        })

        test('finds two transfers that add up', async ({ page }) => {
            const { account, stamp } = findGroup()
            await signInWide(page)
            // Part one is a day older, so "newest first" puts part two above it.
            await postMatchTransfer(page, account, '100.00', `${stamp} part one`, localDay(-1))
            await postMatchTransfer(page, account, '200.00', `${stamp} part two`)

            const totals = page.getByTestId('bank-match-totals')
            const submit = page.getByTestId('bank-match-submit')
            const search = page.getByTestId('bank-match-search')
            const from = page.getByTestId('bank-match-from')
            const to = page.getByTestId('bank-match-to')

            await openMatchDrawer(page, name(stamp, 'three hundred'))
            await expect(page.getByTestId('bank-match-section')).toContainText(
                `Books found no transaction of $300.00 near ${todayText()}.`
            )

            // F: the find mode, 90 days before to 7 days after the bank date, newest first.
            await page.keyboard.press('f')
            await expect(page.getByTestId('bank-match-back')).toBeVisible()
            await expect(from).toHaveValue(localDay(-90))
            await expect(to).toHaveValue(localDay(7))
            const partOne = await optionIdByAmount(page, '$100.00')
            const partTwo = await optionIdByAmount(page, '$200.00')
            await expect.poll(() => shownOptionIds(page)).toEqual([partTwo, partOne])

            // Tab and Space choose part one: short of the bank amount. The inline drawer
            // narrows the list to cards (ReviewTabBody), so the clicked table row is gone and
            // the focus is on the body.
            await tabTo(page, page.getByTestId(`bank-match-box-${partOne}`), {
                max: 80,
                fromBody: true,
            })
            await page.keyboard.press('Space')
            await expect(page.getByTestId(`bank-match-box-${partOne}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
            await expect(totals).toContainText('Chosen $100.00 of $300.00')
            await expect(totals).toContainText('Difference $200.00')
            await expect(submit).toBeDisabled()

            // A search that hides part one keeps it listed at the top, as it is chosen.
            await search.fill(`${stamp} part two`)
            await expect.poll(() => shownOptionIds(page)).toEqual([partOne, partTwo])

            await tabTo(page, page.getByTestId(`bank-match-box-${partTwo}`), { max: 80 })
            await page.keyboard.press('Space')
            await expect(page.getByTestId(`bank-match-box-${partTwo}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
            await expect(totals).toHaveText('Chosen $300.00 of $300.00')
            await expect(submit).toBeEnabled()

            // From after To: the error, and the list keeps its rows.
            await from.fill(localDay(8))
            await expect(page.getByTestId('bank-match-range-error')).toHaveText(
                'From must be on or before To.'
            )
            await expect.poll(() => shownOptionIds(page)).toEqual([partOne, partTwo])
            await from.fill(localDay(-90))
            await expect(page.getByTestId('bank-match-range-error')).toHaveCount(0)

            // A search that fits nothing: the empty text under the two chosen rows.
            await search.fill(`${stamp} zzqx nothing`)
            await expect(page.getByTestId('bank-match-find-empty')).toHaveText(
                'No Books transaction matches this search.'
            )
            await expect.poll(() => shownOptionIds(page)).toEqual([partOne, partTwo])

            // Back to suggestions keeps the choice.
            await page.getByTestId('bank-match-back').click()
            await expect(page.getByTestId('bank-match-back')).toHaveCount(0)
            await expect(totals).toHaveText('Chosen $300.00 of $300.00')

            await page.keyboard.press('m')
            await expect(drawer(page)).toHaveCount(0)
            await expect(await result(page)).toHaveText('Matched 1 transaction.')

            // Another transaction's find mode starts afresh.
            await openMatchDrawer(page, name(stamp, 'four'))
            // F is registered only once the suggestions have loaded and the button shows.
            await expect(page.getByTestId('bank-match-find')).toBeVisible()
            await page.keyboard.press('f')
            await expect(page.getByTestId('bank-match-back')).toBeVisible()
            await expect(search).toHaveValue('')
            await expect(from).toHaveValue(localDay(-90))
            await expect(to).toHaveValue(localDay(7))
            await expect(checkedBoxes(page)).toHaveCount(0)
        })

        test('matches the chosen rows with M', async ({ page }) => {
            const { account, stamp } = findGroup()
            await signInWide(page)
            await postMatchTransfer(page, account, '161.10', `${stamp} batch one`)
            await postMatchTransfer(page, account, '162.20', `${stamp} batch two`)

            const one = await visibleRow(page, name(stamp, 'one'))
            const two = await visibleRow(page, name(stamp, 'two'))
            const four = await visibleRow(page, name(stamp, 'four'))
            const oneId = await reviewRowId(one)
            const twoId = await reviewRowId(two)
            const fourId = await reviewRowId(four)
            await expect(await inBanking(page, `bank-review-suggestion-${oneId}`)).toBeVisible()
            await expect(await inBanking(page, `bank-review-suggestion-${twoId}`)).toBeVisible()

            for (const id of [oneId, twoId, fourId]) {
                const check = await inBanking(page, `bank-review-check-${id}`)
                await check.click()
                await expect(check).toHaveAttribute('aria-checked', 'true')
            }
            const matchChosen = await inBanking(page, 'bank-review-match-chosen')
            const exclude = await inBanking(page, 'bank-review-exclude')
            await expect(matchChosen).toBeVisible()
            await expect(matchChosen).toBeEnabled()
            await expect.poll(() => standsBefore(matchChosen, exclude)).toBe(true)

            // The creates are held: only the bar is read while they are.
            const held: Route[] = []
            await page.route(MATCHES_URL, (route: Route) => {
                if (route.request().method() !== 'POST') return route.continue()
                held.push(route)
            })
            await page.keyboard.press('m')
            await expect.poll(() => held.length).toBe(2)
            await expect(matchChosen).toContainText('Matching…')
            await expect(exclude).toBeDisabled()

            for (const route of held) await route.continue()
            await page.unrouteAll({ behavior: 'wait' })
            const resultText = 'Matched 2 transactions. 1 needs a choice: open it to match.'
            await expect(await result(page)).toHaveText(resultText)
            await expect(one).toHaveCount(0)
            await expect(two).toHaveCount(0)
            await expect(four).toHaveCount(1)
            await expect(await inBanking(page, `bank-review-check-${fourId}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )

            // Only a row with no suggestion is chosen: Match is disabled and M does nothing.
            await expect(matchChosen).toBeDisabled()
            await page.keyboard.press('m')
            await expect(matchChosen).not.toContainText('Matching…')
            await expect(await result(page)).toHaveText(resultText)
            await expect(four).toHaveCount(1)
            await expect(await inBanking(page, `bank-review-check-${fourId}`)).toHaveAttribute(
                'aria-checked',
                'true'
            )
        })
    })
