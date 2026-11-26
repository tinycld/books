import { expect, type Page, test } from '@playwright/test'
import { createCustomer, DESKTOP, openBooks, uniqueName } from './customer-form-helpers'
import { NEW_INVOICE_URL, uniqueMemo } from './invoice-helpers'
import { PHONE, settleFrames } from './journal-entries-helpers'
import { NEW_PAYMENT_URL, openNewPayment } from './receive-payment-helpers'
import { expectRecordUrl } from './record-key-helpers'
import {
    openSales,
    openSalesTab,
    postedInvoiceFor,
    salesRow,
    salesTabUrl,
    searchSales,
} from './sales-lists-helpers'

// Leaving a dirty form asks first (eval revise 1 of sales-lists, lesson 62): every Books
// transaction form wires core `useLeaveGuard` and shows its confirm in the form's Discard
// dialog (`discard-dialog`, Keep editing / `discard-confirm`).
// - At 1440 px a new invoice opens beside the Invoices list's 320 px column. A list key
//   that replaces the form (`3`, and `N`, which replaces an open document) and a press on
//   a row of the column ask; Keep editing keeps the form and its typed memo; Discard goes
//   on to the target (the row's invoice, then Estimates).
// - At 390 px a dirty Receive payment form asks at the browser's Back and at its header
//   Back; the header Back asks once, and Discard leaves to the list.
// Each test makes its own customer and documents, with unique memos.
//
// Not covered by e2e (accepted, revise 1):
// - a reload or a tab close (`beforeunload`): the browser's own prompt, which core's
//   `useLeaveGuard` registers; it is the same hook for every form;
// - a move while another screen covers the form (a sidebar push, the search palette, Edit
//   customer): it goes through by core's design and keeps the edits mounted;
// - the Android path (no list keys, no browser Back).

const WIDE = { width: 1440, height: 900 }
const ENTRIES_URL = /\/books\/entries$/

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function discardDialog(page: Page) {
    return page.getByTestId('discard-dialog')
}

function keepEditing(page: Page) {
    return page.getByRole('button', { name: 'Keep editing' })
}

// A list key typed in a field is text; the keys below must reach the list.
async function blurField(page: Page) {
    await page.evaluate(() => {
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
    })
}

test.describe('sales-lists: leave guard beside the list', () => {
    test('a list key and a row press beside a dirty new invoice ask first at 1440 px', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Leave guard')
        await createCustomer(page, { name })
        const word = `Leave${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
        const postedId = await postedInvoiceFor(page, name, word)

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await searchSales(page, word)
        await expect(salesRow(page, postedId)).toBeVisible()
        await page.setViewportSize(WIDE)
        await expect(salesRow(page, postedId)).toBeVisible()

        // N opens a new invoice beside the 320 px column, which keeps the search.
        await page.keyboard.press('Escape')
        await expect(visible(page, 'sales-search')).not.toBeFocused()
        await page.keyboard.press('n')
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        const column = visible(page, 'sales-names')
        await expect(column).toBeVisible()
        const postedName = column.getByTestId(`sales-name-row-${postedId}`)
        await expect(postedName).toBeVisible()

        const memo = visible(page, 'form-input-memo')
        const typed = uniqueMemo('Unsaved beside')
        await memo.fill(typed)
        await blurField(page)

        // 3 (Estimates) asks; Keep editing keeps the form and the typed memo.
        await page.keyboard.press('3')
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(memo).toHaveValue(typed)

        // N beside the open new invoice replaces it, so it asks too; Keep editing keeps it.
        await blurField(page)
        await page.keyboard.press('n')
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(memo).toHaveValue(typed)

        // A press on the posted invoice's row in the column asks too.
        await postedName.click()
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(memo).toHaveValue(typed)

        // The row again, and Discard opens that invoice, asking once.
        await postedName.click()
        await expect(discardDialog(page)).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expectRecordUrl(page, 'invoices', postedId)
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        await settleFrames(page)
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(visible(page, 'form-input-memo')).toHaveCount(0)

        // N beside the read view opens a new invoice with no question; dirty it again.
        await blurField(page)
        await page.keyboard.press('n')
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(discardDialog(page)).toHaveCount(0)
        const typedAgain = uniqueMemo('Unsaved again')
        await memo.fill(typedAgain)
        await expect(memo).toHaveValue(typedAgain)

        // 3, and Discard goes on to Estimates, asking once.
        await blurField(page)
        await page.keyboard.press('3')
        await expect(discardDialog(page)).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(salesTabUrl('estimates'))
        await expect(visible(page, 'sales-tab-estimates')).toHaveAttribute('aria-selected', 'true')
        await settleFrames(page)
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)
    })

    test('phone: a dirty payment asks at the browser Back and once at its header Back', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openNewPayment(page)
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'payment-form')).toBeVisible()

        const memo = visible(page, 'payment-memo')
        const typed = uniqueMemo('Unsaved payment')
        await memo.fill(typed)
        await blurField(page)

        // The browser's Back asks; Keep editing keeps the form and the typed memo.
        await page.goBack()
        await expect(discardDialog(page)).toBeVisible()
        await expect(page).toHaveURL(NEW_PAYMENT_URL)
        await keepEditing(page).click()
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page).toHaveURL(NEW_PAYMENT_URL)
        await expect(memo).toHaveValue(typed)

        // The header Back asks once; Discard leaves to the Journal Entries list.
        await visible(page, 'entry-back').click()
        await expect(discardDialog(page)).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(ENTRIES_URL)
        await expect(visible(page, 'entries-screen')).toBeVisible()
        await settleFrames(page)
        await expect(discardDialog(page)).toHaveCount(0)
        await expect(page.getByTestId('payment-form')).toHaveCount(0)
    })
})
