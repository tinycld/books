import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    DEPOSIT_URL,
    depositIdFromUrl,
    depositItemLineId,
    depositItemRow,
    depositUrlOf,
    openBooks,
    openDepositBySearch,
    openNewDeposit,
    postUndepositedReceipt,
    shownDeposit,
    tickDepositItem,
    uniqueReference,
} from './bank-deposit-helpers'
import { uniqueMemo } from './invoice-helpers'
import { searchEntries, shownEntries } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'

// Edit and Void of a posted deposit (bank deposit spec §3.7, §3.8, §3.2): E opens the
// correction ("Edit deposit <n>", the shared DocumentBar with Cancel and Save) and its save
// keeps the number and voids the original; V voids the deposit and its items wait in
// Undeposited funds again.
//
// Each test posts its own sales receipts to Undeposited funds, dated today, with a per-run
// reference no. and memo, and deposits only those rows. No seeded deposit is edited or voided.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const VOID_TEXT =
    'A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again.'
const CORRECTION_URL = /\/books\/deposits\/new\?replaces=[^/?#&]+$/

function money(cents: number) {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function amountsOf(count: number) {
    const base = 10_000 + Math.floor(Math.random() * 9_000)
    return Array.from({ length: count }, (_, index) => base + 1_093 * (index + 1))
}

// Ticks the own row, types the memo and posts; returns the deposit's id and number.
async function postDeposit(page: Page, reference: string, memo: string) {
    await openNewDeposit(page)
    await tickDepositItem(page, reference)
    await shownDeposit(page, 'deposit-memo').fill(memo)
    await shownDeposit(page, 'deposit-post').click()
    await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
    await expect(page).toHaveURL(DEPOSIT_URL)
    const title = shownDeposit(page, 'deposit-title')
    await expect(title).toHaveText(/^Deposit \d+$/)
    const number = /^Deposit (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the deposit read view title has no number')
    return { id: depositIdFromUrl(page), number }
}

// The row of the Journal Entries list on top whose Type and status are these.
function entryRow(page: Page, type: RegExp, status: RegExp): Locator {
    return shownEntries(page)
        .locator(ROWS)
        .filter({
            has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: type }),
        })
        .filter({
            has: page.locator('[data-testid^="entries-status-"]', { hasText: status }),
        })
}

test.describe('bank-deposit: edit and void', () => {
    test('a writer edits a posted deposit from the keyboard only, and it keeps its number', async ({
        page,
    }) => {
        // Setup, by mouse: two own receipts, a deposit of the first.
        await openBooks(page)
        const [a, b] = amountsOf(2)
        const refA = uniqueReference('EA')
        const refB = uniqueReference('EB')
        for (const [reference, cents] of [
            [refA, a],
            [refB, b],
        ] as const) {
            await postUndepositedReceipt(page, {
                reference,
                memo: uniqueMemo('Deposit edit receipt'),
                amount: ((cents as number) / 100).toFixed(2),
            })
        }
        const memo = uniqueMemo('Deposit edit')
        const editedMemo = uniqueMemo('Deposit edited')
        const description = uniqueMemo('Interest')
        const original = await postDeposit(page, refA, memo)

        // Opened through search; no click or tap follows.
        await openDepositBySearch(page, memo)
        await expect(page).toHaveURL(depositUrlOf(original.id))
        await expect(shownDeposit(page, 'deposit-read-edit')).toBeVisible()

        // E: the correction, with the focus in Deposit to; the bar is Cancel and Save.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(CORRECTION_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(
            `Edit deposit ${original.number}`
        )
        await expect(shownDeposit(page, 'deposit-to')).toBeFocused()
        await expect(shownDeposit(page, 'deposit-cancel')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-save')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-save-draft')).toHaveCount(0)

        // The original's item is listed and ticked; Tab to the second own row, Space.
        const lineA = await depositItemLineId(page, refA)
        const lineB = await depositItemLineId(page, refB)
        await expect(shownDeposit(page, `deposit-item-tick-${lineA}`)).toHaveAttribute(
            'aria-checked',
            'true'
        )
        const tickB = shownDeposit(page, `deposit-item-tick-${lineB}`)
        await expect(tickB).toHaveAttribute('aria-checked', 'false')
        await tabTo(page, tickB, { max: 300 })
        await page.keyboard.press('Space')
        await expect(tickB).toHaveAttribute('aria-checked', 'true')

        // ⌥↵ adds a line with the focus in its Received from.
        await page.keyboard.press('Alt+Enter')
        await expect(shownDeposit(page, 'deposit-line-0')).toBeVisible()
        const party = shownDeposit(page, 'deposit-line-party-0')
        await expect(party).toBeFocused()

        // ↓ opens Received from; Esc closes only the picker.
        await page.keyboard.press('ArrowDown')
        const partySearch = shownDeposit(page, 'deposit-line-party-search-0')
        await expect(partySearch).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(partySearch).toHaveCount(0)
        await expect(page).toHaveURL(CORRECTION_URL)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(party).toBeFocused()

        // Tab to Account; typing opens it; Enter picks 4900.
        const account = shownDeposit(page, 'deposit-line-account-0')
        await tabTo(page, account)
        await page.keyboard.type('4900')
        const accountSearch = shownDeposit(page, 'deposit-line-account-search-0')
        await expect(accountSearch).toBeFocused()
        await expect(accountSearch).toHaveValue('4900')
        await expect(
            page
                .locator('[data-testid^="deposit-line-account-option-"]')
                .filter({ has: page.getByText('4900 Interest earned', { exact: true }) })
        ).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(accountSearch).toHaveCount(0)
        await expect(account).toContainText('4900 Interest earned')

        // Tab to Description, type; Tab to Amount, type 5.00.
        const lineDescription = shownDeposit(page, 'deposit-line-description-0')
        await tabTo(page, lineDescription, { max: 2 })
        await page.keyboard.type(description)
        const amount = shownDeposit(page, 'deposit-line-amount-0')
        await tabTo(page, amount)
        await page.keyboard.type('5.00')
        await expect(amount).toHaveValue('5.00')

        // ⌥↵ adds a second line; ⌘⌥⌫ with the focus inside it removes it.
        await page.keyboard.press('Alt+Enter')
        await expect(shownDeposit(page, 'deposit-line-1')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-line-party-1')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Alt+Backspace')
        await expect(shownDeposit(page, 'deposit-line-1')).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-line-0')).toBeVisible()

        // Tab to the memo and change it; ⌘↵ saves.
        const memoInput = shownDeposit(page, 'deposit-memo')
        await tabTo(page, memoInput, { max: 40 })
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(editedMemo)
        await expect(memoInput).toHaveValue(editedMemo)
        await page.keyboard.press('ControlOrMeta+Enter')

        // The correction's read view: the same number, both items, the line, the new total.
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(page).toHaveURL(DEPOSIT_URL)
        const correctionId = depositIdFromUrl(page)
        expect(correctionId).not.toBe(original.id)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(`Deposit ${original.number}`)
        const items = shownDeposit(page, 'deposit-read-items-grid')
        await expect(items).toContainText(money(a as number))
        await expect(items).toContainText(money(b as number))
        const lines = shownDeposit(page, 'deposit-read-lines-table')
        await expect(lines).toContainText(description)
        await expect(lines).toContainText('$5.00')
        await expect(shownDeposit(page, 'deposit-total')).toContainText(
            money((a as number) + (b as number) + 500)
        )
        await expect(shownDeposit(page, 'deposit-memo-text')).toContainText(editedMemo)

        // The original, opened from the Journal Entries list by its old memo: Void, replaced
        // by the correction.
        await shownDeposit(page, 'deposit-back').click()
        const list = shownEntries(page)
        await expect(list).toBeVisible()
        await searchEntries(page, memo)
        const voided = entryRow(page, /^Deposit$/, /^Void$/)
        await expect(voided).toHaveCount(1)
        const voidedId = ((await voided.getAttribute('data-testid')) ?? '').replace(
            /^entries-row-/,
            ''
        )
        await list.getByTestId(`entries-row-menu-${voidedId}`).click()
        await page.getByTestId('entries-menu-open').filter({ visible: true }).click()
        await expect(page).toHaveURL(depositUrlOf(original.id))
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Void')
        await expect(shownDeposit(page, 'deposit-replaced-by')).toHaveText(
            `Replaced by ${original.number} (edited)`
        )

        // The correction again: E, then Esc with no edit leaves at once.
        await openDepositBySearch(page, editedMemo)
        await expect(page).toHaveURL(depositUrlOf(correctionId))
        await expect(shownDeposit(page, 'deposit-read-edit')).toBeVisible()
        await page.keyboard.press('e')
        await expect(page).toHaveURL(CORRECTION_URL)
        await expect(shownDeposit(page, 'deposit-to')).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(depositUrlOf(correctionId))
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
    })

    test('a writer voids a posted deposit and its item waits in Undeposited funds again', async ({
        page,
    }) => {
        await openBooks(page)
        const [cents] = amountsOf(1)
        const reference = uniqueReference('VO')
        await postUndepositedReceipt(page, {
            reference,
            memo: uniqueMemo('Deposit void receipt'),
            amount: ((cents as number) / 100).toFixed(2),
        })
        const deposit = await postDeposit(page, reference, uniqueMemo('Deposit void'))

        // A writer on the posted deposit: Edit, Void and View journal entry.
        await expect(shownDeposit(page, 'deposit-read-edit')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-entry')).toBeVisible()
        const postedBy = await shownDeposit(page, 'deposit-posted-by').innerText()
        const user = /^Posted by (.+?), /.exec(postedBy)?.[1]
        if (!user) throw new Error(`no user in "${postedBy}"`)

        // V opens the dialog with the three sentences; Esc closes only the dialog.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_TEXT)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(depositUrlOf(deposit.id))
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Posted')

        // V and confirm: Void, View journal entry only, Voided by.
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Void')
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(`Deposit ${deposit.number}`)
        await expect(shownDeposit(page, 'deposit-voided-by')).toContainText(`Voided by ${user}`)
        await expect(shownDeposit(page, 'deposit-read-entry')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-read-void')).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-read-edit')).toHaveCount(0)

        // The void deposit's journal entry offers no Reverse.
        await page.keyboard.press('j')
        const entry = page.getByTestId('entry-read-only').filter({ visible: true })
        await expect(entry).toBeVisible()
        const entryBar = page.getByTestId('entry-actions').filter({ visible: true })
        await expect(entryBar).toBeVisible()
        await expect(entryBar.getByRole('button', { name: /^Reverse/ })).toHaveCount(0)

        // A new deposit lists the receipt again, not ticked.
        await openNewDeposit(page)
        await expect(depositItemRow(page, reference)).toBeVisible()
        const lineId = await depositItemLineId(page, reference)
        await expect(shownDeposit(page, `deposit-item-tick-${lineId}`)).toHaveAttribute(
            'aria-checked',
            'false'
        )
    })
})
