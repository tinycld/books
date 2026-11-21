import { expect, type Page, test } from '@playwright/test'
import {
    drawerShows,
    openCategorizeDrawer,
    openEntryByMemo,
    pickAccount,
    startCategorizeAccount,
} from './bank-categorize-helpers'
import { inBanking, todayDigits, visibleRow, visibleTestId } from './bank-match-helpers'
import { BANKING_PHONE } from './banking-helpers'
import { tabTo } from './keyboard-helpers'

// The split of a bank transaction over several accounts. Each test connects its own
// number-less account and imports its own OFX file (stamped descriptions, per-run cents,
// dated today). The posting accounts are the seeded 4000 Consulting Income, 6100 Rent and
// 6200 Software Subscriptions; no spec asserts a current-month total of any of them.

const CONSULTING = '4000 Consulting Income'
const RENT = '6100 Rent'
const SOFTWARE = '6200 Software Subscriptions'
const SUBMIT_KEY = 'ControlOrMeta+Enter'
const ADD_LINE_KEY = 'Alt+Enter'
const REMOVE_LINE_KEY = 'ControlOrMeta+Backspace'
const ADDED_ENTRY = /^Added Journal entry (\S+)\.$/
// The split cards, not their memo fields (`bank-cat-line-memo-<n>`).
const LINE_CARDS = '[data-testid^="bank-cat-line-"]:not([data-testid^="bank-cat-line-memo-"])'

const label = (stamp: string, which: string) => `${stamp} split ${which}`
// `whole` dollars and the run's own cents, as the OFX amount and the form show them.
const cents = (stamp: string) => stamp.slice(-2)
const dollars = (stamp: string, whole: number) => `${whole}.${cents(stamp)}`

const drawer = (page: Page) => visibleTestId(page, 'bank-txn-drawer')
const result = (page: Page) => inBanking(page, 'bank-review-result')

// With the focus on the account picker `triggerId`: typing opens it with the search
// filled, Enter picks the first option.
async function typePick(page: Page, triggerId: string, name: string): Promise<void> {
    await expect(page.getByTestId(triggerId)).toBeFocused()
    await page.keyboard.type(name)
    await expect(page.getByTestId(`${triggerId}-search`)).toHaveValue(name)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId(triggerId)).toContainText(name)
}

// The entry read view's lines, in one snapshot: account label, debit, credit and memo.
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
            }))
        })
}

// The number of the posted entry the result line names.
async function addedNumber(page: Page): Promise<string> {
    const line = await result(page)
    await expect(line).toHaveText(ADDED_ENTRY)
    return ADDED_ENTRY.exec((await line.innerText()).trim())?.[1] ?? ''
}

test.describe('bank-categorize: split', () => {
    test('splits a Received row over three accounts from the keyboard', async ({ page }) => {
        const { accountName, stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: dollars(s, 970), name: label(s, 'keys') },
        ])
        const description = label(stamp, 'keys')
        const bank = dollars(stamp, 970)
        const bankMoney = `$${bank}`
        const lineMemo = label(stamp, 'fee memo')
        const totals = page.getByTestId('bank-cat-totals')
        const submit = page.getByTestId('bank-cat-submit')
        const cards = page.locator(LINE_CARDS).filter({ visible: true })
        const row = await visibleRow(page, description)

        // J focuses the only row; Enter opens it on Categorize, with the focus in Account.
        await page.keyboard.press('Escape')
        await page.keyboard.press('j')
        await expect(row).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('Enter')
        await expect(drawerShows(page, description)).toBeVisible()
        await typePick(page, 'bank-cat-account-0', CONSULTING)

        // ⌥↵, the first press: Split. Line 1 holds the bank amount, line 2 is empty and
        // its account has the focus.
        await page.keyboard.press(ADD_LINE_KEY)
        await expect(cards).toHaveCount(2)
        await expect(page.getByTestId('bank-cat-amount-0')).toHaveValue(bank)
        await expect(page.getByTestId('bank-cat-amount-1')).toHaveValue('')
        await expect(page.getByTestId('bank-cat-account-1')).toBeFocused()

        // Line 1 at the bank amount plus 50.00: over by $50.00, and Categorize is disabled.
        const amount0 = page.getByTestId('bank-cat-amount-0')
        await tabTo(page, amount0, { max: 3, key: 'Shift+Tab' })
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(dollars(stamp, 1020))
        await expect(totals).toContainText('Over by $50.00')
        await expect(submit).toBeDisabled()

        // Line 2: 6200, -30.00 and a memo: over by $20.00.
        await tabTo(page, page.getByTestId('bank-cat-account-1'), { max: 4 })
        await typePick(page, 'bank-cat-account-1', SOFTWARE)
        await tabTo(page, page.getByTestId('bank-cat-amount-1'), { max: 3 })
        await page.keyboard.type('-30.00')
        await tabTo(page, page.getByTestId('bank-cat-line-memo-1'), { max: 3 })
        await page.keyboard.type(lineMemo)
        await expect(totals).toContainText('Over by $20.00')

        // ⌥↵ adds line 3 with the amount that remains and the focus in its account.
        await page.keyboard.press(ADD_LINE_KEY)
        await expect(cards).toHaveCount(3)
        await expect(page.getByTestId('bank-cat-amount-2')).toHaveValue('-20.00')
        await typePick(page, 'bank-cat-account-2', RENT)
        await expect(totals).toContainText(`Split ${bankMoney} of ${bankMoney}`)
        await expect(totals).not.toContainText('Remaining')
        await expect(totals).not.toContainText('Over by')
        await expect(submit).toBeEnabled()

        // ⌥↵ adds line 4; ⌘⌫ removes the line that holds the focus.
        await page.keyboard.press(ADD_LINE_KEY)
        await expect(cards).toHaveCount(4)
        await expect(page.getByTestId('bank-cat-account-3')).toBeFocused()
        await page.keyboard.press(REMOVE_LINE_KEY)
        await expect(cards).toHaveCount(3)
        await expect(page.getByTestId('bank-cat-line-3')).toHaveCount(0)

        await page.keyboard.press(SUBMIT_KEY)
        const number = await addedNumber(page)

        // The entry: the bank debited for the bank amount, 4000 credited for the larger
        // amount, 6200 debited 30.00 with the line memo, 6100 debited 20.00.
        await openEntryByMemo(page, description)
        await expect(page.getByTestId('entry-title').filter({ visible: true })).toHaveText(
            `Journal entry ${number}`
        )
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                const on = (account: string) => lines.find(line => line.account === account)
                return {
                    count: lines.length,
                    bankDebit: on(accountName)?.debit,
                    consultingCredit: on(CONSULTING)?.credit,
                    softwareDebit: on(SOFTWARE)?.debit,
                    softwareMemo: on(SOFTWARE)?.memo,
                    rentDebit: on(RENT)?.debit,
                }
            })
            .toEqual({
                count: 4,
                bankDebit: bankMoney,
                consultingCredit: `$1,020.${cents(stamp)}`,
                softwareDebit: '$30.00',
                softwareMemo: lineMemo,
                rentDebit: '$20.00',
            })
    })

    test('splits a Spent row in the phone sheet', async ({ page }) => {
        const { stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-${dollars(s, 150)}`, name: label(s, 'phone') },
        ])
        const description = label(stamp, 'phone')
        await page.setViewportSize(BANKING_PHONE)
        await expect(await inBanking(page, 'bank-review-cards')).toBeVisible()

        // A tap on the card opens the sheet with the way switch and Categorize.
        await openCategorizeDrawer(page, description)
        await expect(visibleTestId(page, 'bank-way')).toBeVisible()
        await expect(visibleTestId(page, 'bank-cat-section')).toBeVisible()
        await pickAccount(page, 'bank-cat-account-0', RENT)

        await visibleTestId(page, 'bank-cat-split').click()
        await expect(page.locator(LINE_CARDS).filter({ visible: true })).toHaveCount(2)
        await visibleTestId(page, 'bank-cat-amount-0').fill('100.00')
        await pickAccount(page, 'bank-cat-account-1', SOFTWARE)
        await visibleTestId(page, 'bank-cat-amount-1').fill(`50.${cents(stamp)}`)
        await expect(visibleTestId(page, 'bank-cat-totals')).toContainText(
            `Split $${dollars(stamp, 150)} of $${dollars(stamp, 150)}`
        )

        // The remove button is a 44 pt target named for its line.
        const remove = visibleTestId(page, 'bank-cat-remove-1')
        await expect(remove).toHaveAttribute('aria-label', 'Remove line 2')
        await expect
            .poll(async () => {
                const box = await remove.boundingBox()
                return (box?.width ?? 0) >= 44 && (box?.height ?? 0) >= 44
            })
            .toBe(true)

        await visibleTestId(page, 'bank-cat-submit').click()
        await addedNumber(page)
        await expect(drawer(page)).toHaveCount(0)
    })
})
