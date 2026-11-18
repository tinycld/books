import { expect, type Page, test } from '@playwright/test'
import { openBooks } from './customer-form-helpers'
import { DESKTOP, openNewEntry, settleFrames } from './journal-entries-helpers'
import {
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRowAmount,
    vendorWithBills,
} from './pay-bills-helpers'
import {
    fillTransfer,
    openNewTransfer,
    TRANSFER_LABELS,
    TRANSFER_URL,
    uniqueMemo,
} from './transfer-helpers'

// Leaving a dirty form asks first (eval revise 1 of sales-lists, lesson 62): every Books
// transaction form wires core `useLeaveGuard` and shows its confirm in the form's Discard
// dialog (`discard-dialog`, Keep editing / `discard-confirm`). These tests leave the forms
// that do not open beside a list (a journal entry, a transfer, Pay Bills) by the browser's
// Back (web), which the guard holds; and they check that the guard does not ask a second
// time after Cancel's own question, nor at a Post that navigates. Each test makes its own
// rows, with unique memos. The sales documents beside the list and the phone run are in
// sales-lists-leave-guard.spec.ts.
//
// Not covered by e2e (accepted, revise 1):
// - a reload or a tab close (`beforeunload`): the browser's own prompt, which core's
//   `useLeaveGuard` registers; it is the same hook for every form;
// - a move while another screen covers the form (a sidebar push, the search palette): it
//   goes through by core's design and keeps the edits mounted;
// - the Android path (no browser Back).

const ENTRIES_URL = /\/books\/entries$/
const NEW_ENTRY_URL = /\/books\/entries\/new$/
const NEW_TRANSFER_URL = /\/books\/transfers\/new$/

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function discardDialog(page: Page) {
    return page.getByTestId('discard-dialog')
}

function keepEditing(page: Page) {
    return page.getByRole('button', { name: 'Keep editing' })
}

async function blurField(page: Page) {
    await page.evaluate(() => {
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
    })
}

// The form was left for the Journal Entries list, and no second question opened.
async function expectLeftToEntries(page: Page) {
    await expect(page).toHaveURL(ENTRIES_URL)
    await expect(visible(page, 'entries-screen')).toBeVisible()
    await settleFrames(page)
    await expect(discardDialog(page)).toHaveCount(0)
}

test.describe('sales-lists: leave guard on the forms', () => {
    test('the browser Back from a dirty journal entry asks first', async ({ page }) => {
        await openBooks(page, DESKTOP)
        await openNewEntry(page)
        const memo = page.getByTestId('entry-memo')
        const typed = uniqueMemo('Unsaved entry')
        await memo.fill(typed)
        await blurField(page)

        // Keep editing keeps the form and the typed memo.
        await page.goBack()
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_ENTRY_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_ENTRY_URL)
        await expect(memo).toHaveValue(typed)

        // Discard goes on back to the list.
        await page.goBack()
        await expect(discardDialog(page)).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expectLeftToEntries(page)
        await expect(page.getByTestId('entry-memo')).toHaveCount(0)
    })

    test('a dirty transfer asks at the browser Back, once at Cancel, and not at Post', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const input = {
            from: TRANSFER_LABELS.checking,
            to: TRANSFER_LABELS.savings,
            amount: '12.00',
        }
        await openNewTransfer(page)
        const typed = uniqueMemo('Unsaved transfer')
        await fillTransfer(page, { ...input, memo: typed })
        await blurField(page)

        // The browser's Back asks; Keep editing keeps the form as it was.
        await page.goBack()
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_TRANSFER_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_TRANSFER_URL)
        await expect(page.getByTestId('transfer-memo')).toHaveValue(typed)

        // Cancel asks once: its Discard leaves with no second question.
        await page.getByTestId('transfer-cancel').click()
        await expect(discardDialog(page)).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expectLeftToEntries(page)

        // A Post that navigates to the posted transfer asks nothing.
        await openNewTransfer(page)
        await fillTransfer(page, { ...input, memo: uniqueMemo('Posted transfer') })
        await page.getByTestId('transfer-post').click()
        await expect(page).toHaveURL(TRANSFER_URL)
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-title')).toHaveText(/^Transfer TR-\d+$/)
        await settleFrames(page)
        await expect(discardDialog(page)).toHaveCount(0)
    })

    test('the browser Back from Pay Bills with a payment entered asks first', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '60.00', due: await localDay(page, 5) }],
        })
        const [bill] = bills
        if (!bill) throw new Error('no bill posted')

        await openPayBills(page)
        await filterToVendor(page, vendor)
        const amount = payBillsRowAmount(page, bill.id)
        await amount.fill('60.00')
        await blurField(page)

        await page.goBack()
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(amount).toHaveValue('60.00')
        await page.getByTestId('discard-confirm').click()
        await expectLeftToEntries(page)
        await expect(page.getByTestId('pay-bills-form')).toHaveCount(0)
    })
})
