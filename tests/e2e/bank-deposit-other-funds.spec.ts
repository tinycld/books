import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { depositLinesMinWidth } from '../../tinycld/books/lib/deposit-columns'
import { VENDORS } from '../../tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    addOtherFundsLine,
    DEPOSIT_URL,
    depositLineCount,
    depositLineOption,
    NEW_DEPOSIT_URL,
    openBooks,
    openDepositBySearch,
    openNewDeposit,
    pickDepositLineAccount,
    pickDepositLineParty,
    postUndepositedReceipt,
    shownDeposit,
    tickDepositItem,
    uniqueReference,
} from './bank-deposit-helpers'
import { uniqueMemo } from './invoice-helpers'
import { BATCH_WRITE, batchOperations, refuseBatchOperation } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import { LIST_MARGIN, sidewaysOverflow, viewportForListWidth } from './payment-grid-width-helpers'

// The Other funds section of the deposit form (bank deposit spec §3.5, §3.6, §3.2): Add line,
// the Account and Received from pickers, a signed Amount made negative with the field's own
// "±" control (the iOS decimal keyboard has no minus key, spec §6), Enter in an Amount, the
// select-on-focus of the Amount, the section total and the three totals, the zero and
// malformed amounts, Remove, a refused line write, the post and its journal entry, the table
// just above its least width, and the cards at 390.
//
// The test posts its own sales receipt to Undeposited funds, dated today, with a per-run
// reference no. and memo, and ticks only that row. The refused write is forced with
// route.fulfill(400).

const VENDOR = vendorName('vendblueridge01')
const INTEREST = '4900 Interest earned'
const FEES = '6300 Bank charges and fees'
const DEPOSIT_TO = '1000 Business Checking'
const MINUS = '−'
const REFUSED_ACCOUNT = 'Choose an account other than the Deposit to account.'

function vendorName(id: string) {
    const row = VENDORS.find(candidate => candidate.id === id)
    if (!row) throw new Error(`no vendor ${id} in the fixture`)
    return row.display_name
}

function money(cents: number) {
    const text = `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    return cents < 0 ? `${MINUS}${text}` : text
}

// The entry read view's lines, in one snapshot.
function readEntryLines(page: Page) {
    return page
        .getByTestId('entry-read-only')
        .filter({ visible: true })
        .evaluate(root => {
            const text = (id: string) =>
                (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
            const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
            return Array.from({ length: count }, (_, i) => ({
                account: text(`entry-line-account-${i}`),
                debit: text(`entry-line-debit-${i}`),
                credit: text(`entry-line-credit-${i}`),
                memo: text(`entry-line-memo-${i}`),
                party: text(`entry-line-party-${i}`),
            }))
        })
}

// Whether `lower` starts below the top of `upper` and overlaps it sideways: drawn under it.
async function isUnder(upper: Locator, lower: Locator) {
    const a = await upper.boundingBox()
    const b = await lower.boundingBox()
    if (!a || !b) return false
    return b.y >= a.y + a.height - 1 && b.x < a.x + a.width && b.x + b.width > a.x
}

// The line write of a save refused once with a 400 keyed `account`, as PocketBase answers
// a refused record: a lone record create, or that operation of a batch. Later writes pass.
async function refuseFirstLineWrite(page: Page) {
    let refused = 0
    const response = {
        status: 400,
        message: 'Failed to create record.',
        data: { account: { code: 'validation_refused', message: REFUSED_ACCOUNT } },
    }
    const refuse = (route: Route) => {
        if (refused > 0) return route.fallback()
        const request = route.request()
        const operations = batchOperations(request)
        if (operations.length > 0) {
            const index = operations.findIndex(
                operation =>
                    operation.method !== 'DELETE' && operation.url.includes('/books_deposit_lines/')
            )
            if (index < 0) return route.fallback()
            refused += 1
            return refuseBatchOperation(route, index, response)
        }
        if (request.method() !== 'POST') return route.fallback()
        refused += 1
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify(response),
        })
    }
    await page.route(BATCH_WRITE, refuse)
    await page.route('**/api/collections/books_deposit_lines/records**', refuse)
    return { refusedCount: () => refused }
}

test.describe('bank-deposit: other funds', () => {
    test('a writer adds interest and a negative fee line, fixes a refused line and posts the deposit', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Deposit other funds')
        const reference = uniqueReference('OF')
        const receiptCents = 20_000 + Math.floor(Math.random() * 9_000)
        await postUndepositedReceipt(page, {
            reference,
            memo: uniqueMemo('Deposit other funds receipt'),
            amount: (receiptCents / 100).toFixed(2),
        })
        const description = uniqueMemo('Interest')

        await openNewDeposit(page)
        await tickDepositItem(page, reference)
        await shownDeposit(page, 'deposit-memo').fill(memo)

        // The section starts with no line.
        const section = shownDeposit(page, 'deposit-other-funds')
        await expect(section).toContainText('Other funds')
        expect(await depositLineCount(page)).toBe(0)
        await expect(shownDeposit(page, 'deposit-lines-total')).toHaveCount(0)

        // Removing the only line leaves the focus on "Add line", not on the page body, so
        // keyboard entry goes on.
        await shownDeposit(page, 'deposit-add-line').click()
        await expect(shownDeposit(page, 'deposit-line-0')).toBeVisible()
        await shownDeposit(page, 'deposit-line-remove-0').click()
        expect(await depositLineCount(page)).toBe(0)
        await expect(shownDeposit(page, 'deposit-add-line')).toBeFocused()

        // Line 1: Account searched and picked, Description, Amount 12.40.
        const first = await addOtherFundsLine(page, {
            account: INTEREST,
            description,
            amount: '12.40',
        })
        expect(first).toBe(0)

        // Tab from a line's Amount goes to that line's Remove: the "±" is a press target only
        // (spec §3.2 Tab order "Amount → Remove").
        await shownDeposit(page, 'deposit-line-amount-0').focus()
        await page.keyboard.press('Tab')
        await expect(shownDeposit(page, 'deposit-line-remove-0')).toBeFocused()

        // Enter in the last line's Amount adds line 2, with the focus in its Received from.
        await shownDeposit(page, 'deposit-line-amount-0').press('Enter')
        await expect(shownDeposit(page, 'deposit-line-1')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-line-party-1')).toBeFocused()

        // Line 2: a vendor, 6300, 20.00 made negative with the field's "±".
        await pickDepositLineParty(page, 1, VENDOR)
        await pickDepositLineAccount(page, 1, FEES)
        const feeAmount = shownDeposit(page, 'deposit-line-amount-1')
        await feeAmount.fill('20.00')
        await shownDeposit(page, 'deposit-line-sign-1').click()
        await expect(feeAmount).toHaveValue('-20.00')
        await expect(feeAmount).toHaveClass(/text-danger/)

        // Enter in line 1's Amount, with line 2 there, moves to line 2's Received from and
        // adds no line.
        await shownDeposit(page, 'deposit-line-amount-0').focus()
        await page.keyboard.press('Enter')
        await expect(shownDeposit(page, 'deposit-line-party-1')).toBeFocused()
        expect(await depositLineCount(page)).toBe(2)

        // Back in line 1's Amount, its whole value is selected: typing replaces it.
        const interestAmount = shownDeposit(page, 'deposit-line-amount-0')
        await tabTo(page, interestAmount, { key: 'Shift+Tab', max: 4 })
        await page.keyboard.type('13.40')
        await expect(interestAmount).toHaveValue('13.40')

        // The section total and the three totals follow: 13.40 − 20.00 = −6.60.
        const linesCents = 1_340 - 2_000
        const totalCents = receiptCents + linesCents
        await expect(shownDeposit(page, 'deposit-lines-total')).toContainText(money(linesCents))
        await expect(shownDeposit(page, 'deposit-total-items')).toContainText(money(receiptCents))
        await expect(shownDeposit(page, 'deposit-total-lines')).toContainText(money(linesCents))
        await expect(shownDeposit(page, 'deposit-total')).toContainText(money(totalCents))
        await expect(shownDeposit(page, 'deposit-figure')).toContainText(money(totalCents))

        // The Deposit to account is not an Account option.
        await shownDeposit(page, 'deposit-line-account-0').click()
        const accountSearch = shownDeposit(page, 'deposit-line-account-search-0')
        await expect(accountSearch).toBeFocused()
        await expect(depositLineOption(page, 'account', INTEREST)).toBeVisible()
        await expect(depositLineOption(page, 'account', DEPOSIT_TO)).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(accountSearch).toHaveCount(0)

        // A third line with an Amount of 0 is refused under it; malformed text blanks the
        // figure; Remove ("Remove line 3") takes the line away and the figure comes back.
        const third = await addOtherFundsLine(page, { account: INTEREST, amount: '0' })
        expect(third).toBe(2)
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-line-2')).toContainText(
            'Enter an amount other than 0'
        )
        await expect(page).toHaveURL(NEW_DEPOSIT_URL)
        await shownDeposit(page, 'deposit-line-amount-2').fill('1.2.3')
        await expect(shownDeposit(page, 'deposit-figure')).toContainText('—')
        const remove = shownDeposit(page, 'deposit-line-remove-2')
        await expect(remove).toHaveAccessibleName('Remove line 3')
        await remove.click()
        await expect(shownDeposit(page, 'deposit-line-2')).toHaveCount(0)
        expect(await depositLineCount(page)).toBe(2)
        await expect(shownDeposit(page, 'deposit-figure')).toContainText(money(totalCents))

        // Just above the table's least width: the table (not the cards), no sideways scroll.
        await viewportForListWidth(page, 'deposit-other-funds', depositLinesMinWidth + LIST_MARGIN)
        const table = shownDeposit(page, 'deposit-lines-table')
        await expect(table).toBeVisible()
        await expect(shownDeposit(page, 'deposit-lines-cards')).toHaveCount(0)
        await expect.poll(() => sidewaysOverflow(table)).toEqual([])
        await expect.poll(() => table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await page.setViewportSize(DESKTOP)

        // A line write refused once, keyed `account`: the message under line 1's Account,
        // and the draft the save wrote stays, with its lines.
        const refusal = await refuseFirstLineWrite(page)
        await shownDeposit(page, 'deposit-post').click()
        const accountTrigger = shownDeposit(page, 'deposit-line-account-0')
        const message = shownDeposit(page, 'deposit-line-0').getByText(REFUSED_ACCOUNT, {
            exact: true,
        })
        await expect(message).toBeVisible()
        expect(refusal.refusedCount()).toBe(1)
        await expect.poll(() => isUnder(accountTrigger, message)).toBe(true)
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(accountTrigger).toContainText(INTEREST)
        await expect(shownDeposit(page, 'deposit-line-amount-1')).toHaveValue('-20.00')

        // Post: the read view lists both lines.
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        const readLines = shownDeposit(page, 'deposit-read-lines-table').locator(
            '[data-testid^="deposit-read-line-"]'
        )
        await expect(readLines).toHaveCount(2)
        await expect(readLines.filter({ hasText: description })).toContainText(money(1_340))
        await expect(readLines.filter({ hasText: VENDOR })).toContainText(money(-2_000))
        await expect(shownDeposit(page, 'deposit-total')).toContainText(money(totalCents))

        // The journal entry: a credit on 4900 with the description as its memo, a debit on
        // 6300 that names the vendor.
        await page.keyboard.press('j')
        await expect(page.getByTestId('entry-read-only').filter({ visible: true })).toBeVisible()
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                return {
                    interest: lines.filter(
                        line =>
                            line.account.includes(INTEREST) &&
                            line.credit === money(1_340) &&
                            line.memo === description
                    ).length,
                    fee: lines.filter(
                        line =>
                            line.account.includes(FEES) &&
                            line.debit === money(2_000) &&
                            line.party.includes(VENDOR)
                    ).length,
                }
            })
            .toEqual({ interest: 1, fee: 1 })

        // At 390 a saved draft with one stored line: a card with the fields stacked, Remove in
        // the card's first line, and the "±" a touch target that flips the sign.
        const draftMemo = uniqueMemo('Deposit other funds draft')
        await openNewDeposit(page)
        await shownDeposit(page, 'deposit-memo').fill(draftMemo)
        await addOtherFundsLine(page, { account: INTEREST, amount: '4.00' })
        await shownDeposit(page, 'deposit-save-draft').click()
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')
        await openNewDeposit(page)
        await openDepositBySearch(page, draftMemo)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')
        await expect(shownDeposit(page, 'deposit-line-account-0')).toContainText(INTEREST)
        await expect(shownDeposit(page, 'deposit-line-amount-0')).toHaveValue('4.00')
        await page.setViewportSize(PHONE)
        await expect(shownDeposit(page, 'deposit-lines-cards')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-lines-table')).toHaveCount(0)
        const party = shownDeposit(page, 'deposit-line-party-0')
        const account = shownDeposit(page, 'deposit-line-account-0')
        const lineDescription = shownDeposit(page, 'deposit-line-description-0')
        const amount = shownDeposit(page, 'deposit-line-amount-0')
        await expect.poll(() => isUnder(party, account)).toBe(true)
        await expect.poll(() => isUnder(account, lineDescription)).toBe(true)
        await expect.poll(() => isUnder(lineDescription, amount)).toBe(true)
        await expect
            .poll(() => isUnder(shownDeposit(page, 'deposit-line-remove-0'), party))
            .toBe(true)
        const sign = shownDeposit(page, 'deposit-line-sign-0')
        await sign.scrollIntoViewIfNeeded()
        const box = await sign.boundingBox()
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
        if (hasTouch) await sign.tap()
        else await sign.click()
        await expect(amount).toHaveValue('-4.00')
        await expect(amount).toHaveClass(/text-danger/)
    })
})
