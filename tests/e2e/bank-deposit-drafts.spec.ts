import { expect, type Page, test } from '@playwright/test'
import { openMoreMenu } from './audit-log-helpers'
import {
    DEPOSIT_URL,
    depositItemLineId,
    openBooks,
    openDepositBySearch,
    openNewDeposit,
    postUndepositedReceipt,
    shownDeposit,
    tickDepositItem,
    uniqueReference,
} from './bank-deposit-helpers'
import { uniqueMemo } from './invoice-helpers'

// Deposit drafts (bank deposit spec §3.3, §3.4, §3.7): ⌘S saves a draft that holds no item,
// a draft reopens through search with its ticks, a stored item another deposit took stays
// listed and ticked with the refusal under its row, and Delete draft removes the draft.
//
// The test posts its own sales receipts to Undeposited funds, dated today, with per-run
// reference nos., and finds drafts by their per-run memo. No seeded item is ticked.
//
// Not covered here: the form's selection, sort, keys and refusals (bank-deposit-form.spec.ts);
// a draft's Other funds lines (checkpoint 4).

const DRAFT_OPTION = /^Draft deposit/

function rate(cents: number) {
    return (cents / 100).toFixed(2)
}

// Searches the palette for the memo and leaves it open with its answer.
async function searchFor(page: Page, memo: string) {
    await page.keyboard.press('/')
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === memo
    )
    await page.keyboard.type(memo)
    await searched
}

test.describe('bank-deposit: drafts', () => {
    test('a writer saves, reopens, posts and deletes deposit drafts', async ({ page }) => {
        await openBooks(page)
        const refs = ['DA', 'DB', 'DC', 'DD'].map(uniqueReference)
        const [refA, refB, refC, refD] = refs as [string, string, string, string]
        const base = 20_000 + Math.floor(Math.random() * 9_000)
        for (const [index, ref] of refs.entries()) {
            await postUndepositedReceipt(page, {
                reference: ref,
                memo: uniqueMemo('Deposit draft receipt'),
                amount: rate(base + 211 * (index + 1)),
            })
        }

        // A draft with one item, deleted (⌘⌫ and More): the dialog asks, the confirm removes it,
        // search finds no such draft, and the item is still listed.
        const memoDeleted = uniqueMemo('Deposit draft deleted')
        await openNewDeposit(page)
        const lineA = await depositItemLineId(page, refA)
        await tickDepositItem(page, refA)
        await shownDeposit(page, 'deposit-memo').fill(memoDeleted)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')
        // ⌘⌫ asks first; Esc closes only the dialog.
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toContainText("Delete this draft deposit? This can't be undone.")
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')
        // The More row asks the same; the confirm deletes the draft.
        await openMoreMenu(page, 'deposit-more')
        await shownDeposit(page, 'deposit-delete-draft').click()
        await expect(deleteDialog).toContainText("Delete this draft deposit? This can't be undone.")
        await page.getByTestId('delete-draft-confirm').click()
        await expect(deleteDialog).toHaveCount(0)
        await expect(page).not.toHaveURL(DEPOSIT_URL)
        await searchFor(page, memoDeleted)
        await expect(page.getByRole('option').filter({ hasText: DRAFT_OPTION })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await openNewDeposit(page)
        await expect(shownDeposit(page, `deposit-item-tick-${lineA}`)).toHaveAttribute(
            'aria-checked',
            'false'
        )

        // ⌘S saves a draft with one ticked item and stays on it.
        const memoOne = uniqueMemo('Deposit draft one')
        await tickDepositItem(page, refA)
        await shownDeposit(page, 'deposit-memo').fill(memoOne)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')

        // A draft holds no item: a second new deposit still lists it, unticked.
        await openNewDeposit(page)
        await expect(shownDeposit(page, `deposit-item-tick-${lineA}`)).toHaveAttribute(
            'aria-checked',
            'false'
        )

        // Reopened through search: Deposit to has focus and the item is ticked; a second
        // tick, then Post.
        await openDepositBySearch(page, memoOne)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')
        await expect(shownDeposit(page, 'deposit-to')).toBeFocused()
        await expect(shownDeposit(page, `deposit-item-tick-${lineA}`)).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await tickDepositItem(page, refB)
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(/^Deposit \d+$/)

        // A second draft holds C; another deposit then posts C.
        const memoTwo = uniqueMemo('Deposit draft two')
        await openNewDeposit(page)
        const lineC = await depositItemLineId(page, refC)
        await tickDepositItem(page, refC)
        await shownDeposit(page, 'deposit-memo').fill(memoTwo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(DEPOSIT_URL)
        await expect(shownDeposit(page, 'deposit-title')).toHaveText('Draft deposit')

        await openNewDeposit(page)
        await tickDepositItem(page, refC)
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        const title = shownDeposit(page, 'deposit-title')
        await expect(title).toHaveText(/^Deposit \d+$/)
        const holder = /^Deposit (\d+)$/.exec(await title.innerText())?.[1]
        if (!holder) throw new Error('the posted deposit has no number')

        // The draft reopened: C is still listed and ticked, with the refusal under its row.
        await openDepositBySearch(page, memoTwo)
        await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
        const tickC = shownDeposit(page, `deposit-item-tick-${lineC}`)
        await expect(tickC).toHaveAttribute('aria-checked', 'true')
        await expect(shownDeposit(page, `deposit-item-error-${lineC}`)).toHaveText(
            new RegExp(`^Sales receipt \\d+ is already in Deposit ${holder}\\.$`)
        )

        // Untick C, tick the free D: Post works.
        await tickC.click()
        await expect(tickC).toHaveAttribute('aria-checked', 'false')
        await tickDepositItem(page, refD)
        await shownDeposit(page, 'deposit-post').click()
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
        await expect(shownDeposit(page, 'deposit-title')).toHaveText(/^Deposit \d+$/)
    })
})
