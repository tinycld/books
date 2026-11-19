import { expect, type Page } from '@playwright/test'
import { purchaseTabOf } from '../../tinycld/books/lib/purchase-lists'
import {
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    openNewBill,
    pickBillVendor,
    pickLineAccount,
    postBill,
} from './bill-helpers'
import { BILL_EXPENSE_ACCOUNT, historyIndex, localDay, returnTo } from './pay-bills-helpers'

// Shared steps of the purchase-lists specs (spec docs/specs/purchase-lists-design.md). A
// seeded row is found by its test id after the list is narrowed to its vendor (vendor
// picker) or its memo (search field), never by its position in the shared list.

// The URL of an Expenses tab, e.g. `/books/bills` for `bills`, `/books/purchases` for `all`.
export function purchaseTabUrl(tabKey: string): RegExp {
    return new RegExp(`/${purchaseTabOf(tabKey).path}$`)
}

// A list screen stays mounted and hidden under a pushed document, so a lookup takes the
// visible one.
function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// Books must be open at a width that draws the sidebar. Opens All purchases.
export async function openPurchases(page: Page) {
    await page.getByTestId('books-nav-expenses').click()
    await expect(page).toHaveURL(purchaseTabUrl('all'))
    await expect(visible(page, 'purchases-list')).toBeVisible()
}

// A press on a tab of the open Expenses header.
export async function openPurchaseTab(page: Page, tabKey: string) {
    await visible(page, `purchases-tab-${tabKey}`).click()
    await expect(page).toHaveURL(purchaseTabUrl(tabKey))
    await expect(visible(page, `purchases-tab-${tabKey}`)).toHaveAttribute('aria-selected', 'true')
}

// Types `text` in the visible list's search field.
export async function searchPurchases(page: Page, text: string) {
    const field = visible(page, 'purchases-search')
    await field.fill(text)
    await expect(field).toHaveValue(text)
}

// Picks a vendor by its full display name in the visible list's vendor picker.
export async function pickPurchaseVendor(page: Page, name: string) {
    await visible(page, 'purchases-vendor').click()
    const search = page.getByTestId('purchases-vendor-search').filter({ visible: true })
    await expect(search).toBeVisible()
    await search.fill(name)
    await page
        .getByTestId(/^purchases-vendor-option-[a-z0-9]{15}$/)
        .filter({ visible: true })
        .filter({ has: page.getByText(name, { exact: true }) })
        .click()
    await expect(search).toBeHidden()
    await expect(visible(page, 'purchases-vendor')).toContainText(name)
}

// The row (table) or card of a document, by its id.
export function purchaseRow(page: Page, id: string) {
    return visible(page, `purchases-row-${id}`)
}

// Opens the row menu ("More actions") of a document; the list stays on screen.
export async function openPurchaseRowMenu(page: Page, id: string) {
    await visible(page, `purchases-row-menu-${id}`).click()
    await expect(visible(page, 'purchases-row-action-open')).toBeVisible()
}

// The actions of the open row menu, in menu order (`open`, `pay-bill`, …), read in one
// snapshot. `edit` is matched too, so a menu that wrongly holds Edit shows it.
export function purchaseRowMenuActions(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const pattern =
            /^purchases-row-action-(open|pay-bill|apply-credit|record-refund|void|copy|entry|delete-draft|edit|pdf)$/
        return Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid^="purchases-row-action-"]')
        )
            .filter(el => el.checkVisibility())
            .map(el => pattern.exec(el.dataset.testid ?? '')?.[1])
            .filter((action): action is string => action !== undefined)
    })
}

// The bill form must be open on a new bill. Fills the vendor, the memo and one account line
// of 120.00 on a seeded expense account.
async function fillNewBill(page: Page, vendorName: string, memo: string) {
    await pickBillVendor(page, vendorName)
    await page.getByTestId('form-input-memo').fill(memo)
    await pickLineAccount(page, 0, BILL_EXPENSE_ACCOUNT)
    const line = await billLineRowId(page, 'account_lines', 0)
    await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('120.00')
}

/**
 * Books must be open at desktop width, on a screen with the sidebar. Saves a draft bill for
 * the vendor (dated today, `memo`, one line of 120.00) with the form's Save draft, then goes
 * back to the history entry it started on. Returns the draft's id.
 */
export async function draftBillFor(page: Page, vendorName: string, memo: string): Promise<string> {
    const start = await historyIndex(page)
    await openNewBill(page)
    await fillNewBill(page, vendorName, memo)
    await page.getByTestId('bill-save-draft').click()
    await expect(page).toHaveURL(/\/books\/bills\/(?!new(?:[?#]|$))[^/?#]+$/)
    await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
    const id = billIdFromUrl(page)
    await returnTo(page, start)
    return id
}

/**
 * Books must be open at desktop width, on a screen with the sidebar. Posts a bill for the
 * vendor (dated and due today, `memo`, one line of 120.00), then goes back to the history
 * entry it started on. Returns the bill's id.
 */
export async function postedBillFor(page: Page, vendorName: string, memo: string): Promise<string> {
    const start = await historyIndex(page)
    await openNewBill(page)
    await fillNewBill(page, vendorName, memo)
    await page.getByTestId('form-input-due_date').fill(await localDay(page, 0))
    await postBill(page)
    const id = billIdFromUrl(page)
    await returnTo(page, start)
    return id
}

/**
 * Answers the `method` write of one record of `collection` with a 400 that carries
 * `message`; every other request passes. The wait comes back inside an object, so awaiting
 * the call only installs the route; the test awaits `response` after the press that sends
 * the write. A void from a list is a plain PATCH of the record, a delete a DELETE.
 */
export async function refusePurchaseWrite(
    page: Page,
    collection: string,
    id: string,
    method: 'PATCH' | 'DELETE',
    message: string
) {
    const path = `/api/collections/${collection}/records/${id}`
    await page.route(`**${path}*`, route =>
        route.request().method() === method
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ status: 400, message, data: {} }),
              })
            : route.fallback()
    )
    return {
        response: page.waitForResponse(
            r => r.request().method() === method && r.url().includes(path) && r.status() === 400
        ),
    }
}
