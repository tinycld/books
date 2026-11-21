import { expect, test } from '@playwright/test'
import {
    openCategorizeDrawer,
    openEntryByMemo,
    pickAccount,
    startCategorizeAccount,
} from './bank-categorize-helpers'
import { inBanking, todayDigits } from './bank-match-helpers'
import { TRANSFER_URL } from './transfer-helpers'

// The Transfer way: a Spent row recorded as a transfer to the seeded 2100 Company Card. The
// test connects its own number-less account and imports its own OFX file (a stamped
// description, per-run cents, dated today). The Reviewed drawer's link to the transfer is
// checkpoint 5's, so the transfer is opened from the Journal Entries list by its memo.

const CARD = '2100 Company Card'
const SUBMIT_KEY = 'ControlOrMeta+Enter'
const ADDED_TRANSFER = /^Added Transfer (\S+)\.$/

test.describe('bank-categorize: transfer', () => {
    test('records a Spent row as a transfer to the card account', async ({ page }) => {
        const { accountName, stamp } = await startCategorizeAccount(page, s => [
            { day: todayDigits(), amount: `-512.${s.slice(-2)}`, name: `${s} cat transfer` },
        ])
        const description = `${stamp} cat transfer`
        const amount = `$512.${stamp.slice(-2)}`

        // The row opens on Categorize with the focus in its Account picker, where a letter
        // is text: Escape leaves the field first, then T shows Transfer.
        await openCategorizeDrawer(page, description)
        await expect(page.getByTestId('bank-cat-account-0')).toBeFocused()
        await page.keyboard.press('Escape')
        await page.keyboard.press('t')
        await expect(page.getByTestId('bank-transfer-section')).toBeVisible()
        await expect(page.getByTestId('bank-transfer-account')).toBeFocused()
        await expect(page.getByTestId('bank-transfer-summary')).toHaveText(
            `A transfer of ${amount} from ${accountName}.`
        )
        await expect(page.getByTestId('bank-transfer-memo')).toHaveValue(description)

        await pickAccount(page, 'bank-transfer-account', CARD)
        await page.keyboard.press(SUBMIT_KEY)
        const line = await inBanking(page, 'bank-review-result')
        await expect(line).toHaveText(ADDED_TRANSFER)
        const number = ADDED_TRANSFER.exec((await line.innerText()).trim())?.[1] ?? ''

        // The transfer: from the test account to the card, for the bank amount.
        await openEntryByMemo(page, description)
        await expect(page).toHaveURL(TRANSFER_URL)
        await expect(page.getByTestId('transfer-title').filter({ visible: true })).toHaveText(
            `Transfer ${number}`
        )
        await expect(page.getByTestId('transfer-read-from').filter({ visible: true })).toHaveText(
            accountName
        )
        await expect(page.getByTestId('transfer-read-to').filter({ visible: true })).toHaveText(
            CARD
        )
        await expect(page.getByTestId('transfer-amount').filter({ visible: true })).toHaveText(
            amount
        )
    })
})
