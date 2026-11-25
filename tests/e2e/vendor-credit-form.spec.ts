import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP, PHONE } from './account-register-helpers'
import { PURCHASES_CARD_TITLE, setPurchaseLines } from './bill-helpers'
import { batchAnswered } from './document-batch-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { tabTo } from './keyboard-helpers'
import { moneyCents, shown } from './pay-bills-helpers'
import { leaveSettings } from './sales-receipt-helpers'
import {
    creditAccountLineRows,
    creditCellTestId,
    creditItemLineRows,
    creditLineRowId,
    NEW_VENDOR_CREDIT_URL,
    openNewVendorCredit,
    openVendorCreditBySearch,
    pickCreditLineAccount,
    pickCreditVendor,
    searchToVendorCredit,
    VENDOR_CREDIT_URL,
    vendorCreditIdFromUrl,
    vendorCreditNumberOf,
} from './vendor-credit-helpers'

// The vendor credit form and its read view (vendor credit spec §3.1–§3.9, §3.11),
// checkpoint 3. Every credit is made by driving the form with a unique memo (and a unique
// Vendor's credit no. where the number matters), on the default credit date (today), and
// reopened through search. The spec never edits, posts, voids or deletes a seeded credit,
// bill, vendor, product or account, and reads a posted number from the title only.
//
// The keyboard tests press no click after the form opens: focus starts in Vendor, Tab
// moves between fields, a picker opens by typing, ⌘S / ⌘↵ / ⌘⇧↵ / Esc are Save draft /
// Post / Post & new / Cancel, ⌥↵ / ⌥P add an account / product line, and a dialog's
// action is ⌘↵ (core DIALOG_SUBMIT_SHORTCUT).
//
// One phone test: the phone form is other code (the band stacks, each line is a card,
// and the bar moves Post & new and Delete draft into More; the read bar keeps Edit and
// moves the rest into More). Not driven here: native-only behavior, loading, not found,
// cannot edit, no access and the reader's views (tests/document-screen-state.test.ts,
// tests/document-actions.test.ts), offline disabling (core), the client zod rules beyond
// the ones a test types (tests/document-schema-vendor-credit.test.ts).

const PACIFIC_POWER = 'Pacific Power'
const SUMMIT = 'Summit IT Services'
const ACCESS_POINT = 'Wireless access point'
const ACCESS_POINT_DESCRIPTION = 'Wi-Fi 6E access point, ceiling mount, PoE powered.'
const RENT = '6100 Rent'
const SOFTWARE = '6200 Software Subscriptions'
const NO_LINES = 'Add at least one account or product line'
const VOID_BODY = 'A reversing entry is posted in the original period. The number is kept.'
const ITEM_HEADING = 'Product and service details'
const PURCHASE_LINES_NOTE =
    'Which line tables new bills, expenses and vendor credits show. A form still shows a table its record already has lines in.'
// The seeded credits (seed.ts seedVendorCredits), found by their memos.
const UNAPPLIED_MEMO = 'Meter 4471 was read twice in October'
const PARTLY_MEMO = 'Return authorised by Dana, RMA 5521'
const MINUS = '−'

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

function uniqueRef(label: string): string {
    return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

const CREDIT_URL_OF = (id: string) => new RegExp(`/books/vendor-credits/${id}$`)

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// Tab (or Shift+Tab) until the target has focus: for a test whose Tab order another test
// pins.
async function tabUntil(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab') {
    for (let press = 0; press < 12; press++) {
        if (await target.evaluate(el => el === document.activeElement)) return
        await page.keyboard.press(key)
    }
    await expect(target).toBeFocused()
}

function cellOf(page: Page, table: 'account_lines' | 'item_lines', rowId: string) {
    return (column: string) => page.getByTestId(creditCellTestId(table, rowId, column))
}

// Picks a focused search picker's option by keys only: type, then the one matching row.
async function pickByKeys(page: Page, typed: string, option: string | RegExp) {
    await page.keyboard.type(typed)
    const item =
        typeof option === 'string'
            ? page.getByRole('menuitem', { name: option, exact: true })
            : page.getByRole('menuitem', { name: option })
    await expect(item).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(item).toHaveCount(0)
}

// The right edge of what an element shows: an input's content box, or the glyphs of the
// last text node in it (a Range), so alignment is what the eye sees.
function shownRight(target: Locator) {
    return target.evaluate(root => {
        const input =
            root instanceof HTMLInputElement ? root : root.querySelector('input, textarea')
        if (input) {
            const box = input.getBoundingClientRect()
            const style = getComputedStyle(input)
            return (
                box.right -
                Number.parseFloat(style.paddingRight) -
                Number.parseFloat(style.borderRightWidth)
            )
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let last: Node | null = null
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (/\S/.test(node.textContent ?? '')) last = node
        }
        if (!last) return Number.NaN
        const range = document.createRange()
        range.selectNodeContents(last)
        return range.getBoundingClientRect().right
    })
}

async function boxOf(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} has no box`)
    return box
}

// The entry read view's lines, in one snapshot: account label, debit and credit.
function readEntryLines(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const text = (id: string) =>
            (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) => ({
            account: text(`entry-line-account-${i}`),
            debit: text(`entry-line-debit-${i}`),
            credit: text(`entry-line-credit-${i}`),
        }))
    })
}

// Desktop. Reopens the saved draft on screen: leaves through the sidebar's Journal
// Entries item, then Back (a same-document popstate) returns to the draft's form.
async function reopenCreditByBack(page: Page) {
    const url = page.url()
    const navItem = page.getByTestId('books-nav-entries')
    await navItem.click()
    // A sidebar push leaves the earlier screen mounted and hidden: the pushed list is last.
    await expect(page.getByTestId('entries-screen').last()).toBeVisible()
    await expect(page.getByTestId('vendor-credit-form')).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('vendor-credit-form')).toBeVisible()
}

// Every line row of a table anywhere on the page, so a table that is not drawn counts 0.
function anyLineRows(page: Page, table: 'account_lines' | 'item_lines') {
    return page.locator(`[data-testid^="form-table-${table}-row-"]`)
}

test.describe('vendor-credit-form: keyboard', () => {
    test('creates and posts a vendor credit from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Vendor credit keyboard create')
        const ref = uniqueRef('VC')
        await openBooks(page)
        await openNewVendorCredit(page)
        const today = await localToday(page)

        // From here on, no click.
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await pickByKeys(page, PACIFIC_POWER, PACIFIC_POWER)
        await expect(vendor).toContainText(PACIFIC_POWER)

        // A pick moves focus to Credit date and fills nothing else: Pacific Power's
        // default expense account (6900) is inactive, so line 1 stays empty.
        const date = page.getByTestId('form-input-date')
        await expect(date).toBeFocused()
        await expect(date).toHaveValue(today)
        const refInput = page.getByTestId('form-input-ref_no')
        await expect(refInput).toHaveValue('')
        const line1 = await creditLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await expect(account1('account')).not.toContainText(/\d{4} /)
        await expect(account1('amount')).toHaveValue('')

        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, refInput)
        await page.keyboard.type(ref)

        await tabTo(page, account1('account'))
        await pickByKeys(page, '6100', RENT)
        await expect(account1('account')).toContainText(RENT)
        await expect(account1('description')).toBeFocused()
        await page.keyboard.type('Meter refund, November')
        await tabTo(page, account1('amount'))
        await page.keyboard.type('50')
        await page.keyboard.press('Enter')

        // Enter in the last account line's Amount adds a line and focuses its Account.
        await expect(creditAccountLineRows(page)).toHaveCount(2)
        const line2 = await creditLineRowId(page, 'account_lines', 1)
        const account2 = cellOf(page, 'account_lines', line2)
        await expect(
            page.getByTestId(`${creditCellTestId('account_lines', line2, 'account')}-search`)
        ).toBeFocused()
        await pickByKeys(page, '6200', SOFTWARE)
        await expect(account2('account')).toContainText(SOFTWARE)
        await expect(account2('description')).toBeFocused()
        await tabTo(page, account2('amount'))
        await page.keyboard.type('-10')

        // ⌥P adds a product line and focuses its Product picker; the pick fills
        // Description and Rate from the product's purchase side.
        await page.keyboard.press('Alt+p')
        await expect(creditItemLineRows(page)).toHaveCount(1)
        const product1 = await creditLineRowId(page, 'item_lines', 0)
        const item1 = cellOf(page, 'item_lines', product1)
        await expect(
            page.getByTestId(`${creditCellTestId('item_lines', product1, 'product')}-search`)
        ).toBeFocused()
        await pickByKeys(page, 'Wireless', ACCESS_POINT)
        await expect(item1('product')).toContainText(ACCESS_POINT)
        await expect(item1('description')).toHaveValue(ACCESS_POINT_DESCRIPTION)
        await expect(item1('rate')).toHaveValue('121.40')
        await expect(item1('description')).toBeFocused()
        await tabTo(page, item1('quantity'))
        await page.keyboard.type('2')

        // 50.00 − 10.00 + 2 × 121.40 = 282.80.
        await expect(page.getByTestId('vendor-credit-total-account-lines')).toContainText(
            money(4_000)
        )
        await expect(page.getByTestId('vendor-credit-total-item-lines')).toContainText(
            money(24_280)
        )
        await expect(page.getByTestId('vendor-credit-total')).toContainText(money(28_280))
        await expect(page.getByTestId('vendor-credit-credit-amount')).toContainText(money(28_280))
        await expect(item1('amount')).toContainText(money(24_280))

        // One shared Amount column: the Amount header, a typed Amount, a computed Amount
        // and the Total figure end on one right edge.
        await expect
            .poll(async () => {
                const edges = [
                    await shownRight(page.getByTestId('form-table-account_lines-head-amount')),
                    await shownRight(account1('amount')),
                    await shownRight(item1('amount')),
                    await shownRight(page.getByTestId('vendor-credit-total')),
                ]
                return Math.max(...edges) - Math.min(...edges)
            })
            .toBeLessThanOrEqual(1)

        await tabTo(page, item1('rate'))
        await tabTo(page, page.getByTestId(`form-table-item_lines-menu-${product1}`))
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.keyboard.type(memo)

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        const readView = page.getByTestId('vendor-credit-read-only')
        await expect(readView).toBeVisible()
        await vendorCreditNumberOf(page)
        await expect(page.getByTestId('vendor-credit-badge')).toHaveText('Posted')
        await expect(page.getByTestId('vendor-credit-detail-vendor')).toContainText(PACIFIC_POWER)
        await expect(page.getByTestId('vendor-credit-detail-date')).toContainText(formatDay(today))
        await expect(readView).toContainText(ref)
        await expect(readView).toContainText('Meter refund, November')
        await expect(readView).toContainText(RENT)
        await expect(readView).toContainText(SOFTWARE)
        await expect(readView).toContainText(money(5_000))
        await expect(readView).toContainText(money(-1_000))
        await expect(readView.getByText(ACCESS_POINT, { exact: true })).toHaveCount(1)
        await expect(page.getByTestId('vendor-credit-total-account-lines')).toContainText(
            money(4_000)
        )
        await expect(page.getByTestId('vendor-credit-total-item-lines')).toContainText(
            money(24_280)
        )
        await expect(page.getByTestId('vendor-credit-total')).toContainText(money(28_280))
        await expect(page.getByTestId('vendor-credit-credit-amount')).toContainText(money(28_280))
        // Nothing is applied: Unapplied credit is the whole Total, and no Applied row.
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText(
            'Unapplied credit'
        )
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText(money(28_280))
        await expect(page.getByTestId('vendor-credit-total-applied')).toHaveCount(0)
        await expect(readView).toContainText(memo)

        // J: the entry debits Accounts payable for the Total.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                return lines.find(l => /Accounts payable$/.test(l.account))?.debit
            })
            .toBe(money(28_280))
    })

    test('edits a draft vendor credit from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Vendor credit keyboard edit')
        const ref = uniqueRef('VE')
        await openBooks(page)
        await openNewVendorCredit(page)
        await pickCreditVendor(page, SUMMIT)
        const first = await pickCreditLineAccount(page, 0, RENT)
        await page.getByTestId(creditCellTestId('account_lines', first, 'amount')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-title')).toHaveText('Draft vendor credit')
        const id = vendorCreditIdFromUrl(page)

        // Save draft replaces the new form with the draft's own route, which opens with
        // focus in Vendor (spec §3.2). (Search over the same draft would push a second
        // mount of it; search reopens the draft once it is posted, below.) From here on,
        // no click.
        await expect(page.getByTestId('vendor-credit-title')).toHaveText('Draft vendor credit')
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        const line1 = await creditLineRowId(page, 'account_lines', 0)
        const amount1 = cellOf(page, 'account_lines', line1)('amount')
        await tabUntil(page, amount1)
        // A numeric cell selects its whole value on focus, so typing replaces 40.00.
        await expect
            .poll(() =>
                amount1.evaluate(el => {
                    const input = el as HTMLInputElement
                    return [input.selectionStart, input.selectionEnd, input.value.length]
                })
            )
            .toEqual([0, 5, 5])
        await page.keyboard.type('75')

        // ⌥↵ adds an account line and focuses its Account picker.
        await page.keyboard.press('Alt+Enter')
        await expect(creditAccountLineRows(page)).toHaveCount(2)
        const line2 = await creditLineRowId(page, 'account_lines', 1)
        const account2 = cellOf(page, 'account_lines', line2)
        await expect(
            page.getByTestId(`${creditCellTestId('account_lines', line2, 'account')}-search`)
        ).toBeFocused()
        await pickByKeys(page, '6210', /^6210 /)
        await expect(account2('account')).toContainText('6210')
        await expect(account2('description')).toBeFocused()
        await tabTo(page, account2('amount'))
        await page.keyboard.type('5')

        const refInput = page.getByTestId('form-input-ref_no')
        await tabUntil(page, refInput, 'Shift+Tab')
        await page.keyboard.type(ref)

        const saved = batchAnswered(page, 'books_vendor_credits', 'PATCH', 200)
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expect(page).toHaveURL(CREDIT_URL_OF(id))

        // Reopened through Back, the draft holds what was saved.
        await reopenCreditByBack(page)
        await expect(refInput).toHaveValue(ref)
        await expect(creditAccountLineRows(page)).toHaveCount(2)
        await expect(amount1).toHaveValue('75.00')
        await expect(account2('amount')).toHaveValue('5.00')
        await expect(page.getByTestId('vendor-credit-total')).toContainText(money(8_000))

        // Post & new: the draft posts and a fresh, empty new form opens with focus in
        // Vendor.
        await vendor.focus()
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(NEW_VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-title')).toHaveText('New vendor credit')
        await expect(vendor).toBeFocused()
        await expect(vendor).not.toContainText(SUMMIT)
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(refInput).toHaveValue('')

        // Escape on a new form with edits opens the discard dialog; its action leaves.
        await pickByKeys(page, 'Summit', SUMMIT)
        await expect(vendor).toContainText(SUMMIT)
        await page.keyboard.press('Escape')
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(NEW_VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-form')).toHaveCount(0)

        // Search finds the credit posted, with its number and Total.
        await openVendorCreditBySearch(page, memo)
        await expect(page).toHaveURL(CREDIT_URL_OF(id))
        await expect(shown(page, 'vendor-credit-read-only')).toBeVisible()
        await expect(shown(page, 'vendor-credit-title')).toHaveText(/^Vendor credit \d+$/)
        await expect(shown(page, 'vendor-credit-total')).toContainText(money(8_000))
    })
})

// Books open, with a posted $60.00 Summit credit of a unique Vendor's credit no. and memo on
// screen.
async function postSummitCredit(page: Page, label: string) {
    const ref = uniqueRef('DUP')
    const memo = uniqueMemo(label)
    await openBooks(page)
    await openNewVendorCredit(page)
    await pickCreditVendor(page, SUMMIT)
    await page.getByTestId('form-input-ref_no').fill(ref)
    const line = await pickCreditLineAccount(page, 0, RENT)
    await page.getByTestId(creditCellTestId('account_lines', line, 'amount')).fill('60.00')
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('vendor-credit-post').click()
    await expect(page).toHaveURL(VENDOR_CREDIT_URL)
    const posted = { number: await vendorCreditNumberOf(page) }
    return { ref, memo, posted, firstId: vendorCreditIdFromUrl(page) }
}

// Each test posts its own credit: one test for all three ran close to the test timeout on
// CI.
test.describe('vendor-credit-form: refusals and read actions', () => {
    test('refuses a duplicate credit no. and a credit with no line', async ({ page }) => {
        const { ref, posted } = await postSummitCredit(page, 'Vendor credit duplicate no.')
        const refInput = page.getByTestId('form-input-ref_no')

        // A second credit of the vendor with the same number: refused under Vendor's
        // credit no.; the form keeps its values, and the summary does not repeat it.
        await openNewVendorCredit(page)
        await pickCreditVendor(page, SUMMIT)
        await refInput.fill(ref)
        const line = await pickCreditLineAccount(page, 0, RENT)
        const amount = page.getByTestId(creditCellTestId('account_lines', line, 'amount'))
        await amount.fill('25.00')
        const secondMemo = uniqueMemo('Vendor credit duplicate')
        await page.getByTestId('form-input-memo').fill(secondMemo)
        await page.getByTestId('vendor-credit-post').click()
        const duplicate = `${SUMMIT} already has credit no. ${ref} (Vendor credit ${posted.number}).`
        await expect(page.getByTestId('form-field-ref_no-error')).toHaveText(duplicate)
        await expect(page.getByTestId('vendor-credit-form')).toBeVisible()
        await expect(refInput).toHaveValue(ref)
        await expect(amount).toHaveValue('25.00')
        await expect(page.getByTestId('form-input-memo')).toHaveValue(secondMemo)
        await expect(
            page.getByTestId('vendor-credit-error-summary').filter({ hasText: duplicate })
        ).toHaveCount(0)

        // No credit no. and no line amount (account line 1 removed through its row
        // actions, so the form has no line): the line-count rule.
        await refInput.fill('')
        await page.getByTestId(`form-table-account_lines-menu-${line}`).click()
        await page.getByRole('menuitem', { name: /^Remove/ }).click()
        await expect(amount).toHaveCount(0)
        await page.getByTestId('vendor-credit-post').click()
        await expect(page.getByTestId('vendor-credit-line-error')).toHaveText(NO_LINES)
        await expect(page.getByTestId('vendor-credit-form')).toBeVisible()
        await expect(page).toHaveURL(NEW_VENDOR_CREDIT_URL)

        // Leave the unsaved form (Cancel, then the discard dialog's action), so no form
        // stays mounted under the screens below.
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('vendor-credit-form')).toHaveCount(0)
    })

    test('a refused read of a credit shows the load error, and Retry loads it', async ({
        page,
    }) => {
        const { memo, posted, firstId } = await postSummitCredit(page, 'Vendor credit refused read')

        // A refused read of the credit is the screen's load error; Retry loads it. The
        // credit is already in this page's store (it posted it), so the read is made on a
        // fresh page of the same context, whose store does not hold it.
        const second = await page.context().newPage()
        await second.route('**/api/realtime*', route => route.abort())
        await second.route('**/api/collections/books_vendor_credits/records*', route =>
            route.request().method() === 'GET' ? route.fulfill({ status: 400 }) : route.fallback()
        )
        await openBooks(second)
        await searchToVendorCredit(second, memo, `Vendor credit ${posted.number} · ${SUMMIT}`)
        await expect(second).toHaveURL(CREDIT_URL_OF(firstId))
        await expect(second.getByTestId('vendor-credit-error')).toBeVisible()
        await expect(second.getByTestId('vendor-credit-read-only')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.route('**/api/realtime*', route => route.abort())
        await second.getByTestId('vendor-credit-retry').click()
        await expect(shown(second, 'vendor-credit-read-only')).toBeVisible()
        await second.close()
    })

    test('copies, corrects and voids a credit', async ({ page }) => {
        const { ref, memo, posted, firstId } = await postSummitCredit(
            page,
            'Vendor credit read actions'
        )
        const today = await localToday(page)
        const refInput = page.getByTestId('form-input-ref_no')
        // Screens pushed over a read view keep it mounted and hidden: read the shown one.
        const readView = shown(page, 'vendor-credit-read-only')
        await expect(readView).toBeVisible()

        // C: a copy with the vendor, the lines and the memo; today's date, no credit no.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/new\\?copy=${firstId}$`))
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText(SUMMIT)
        const copyLine = await creditLineRowId(page, 'account_lines', 0)
        await expect(cellOf(page, 'account_lines', copyLine)('account')).toContainText(RENT)
        await expect(cellOf(page, 'account_lines', copyLine)('amount')).toHaveValue('60.00')
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        await expect(refInput).toHaveValue('')
        // Copy replaces the read view, so Escape leaves the copy for the screen below it;
        // the read view is reached again through search.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-form')).toHaveCount(0)
        await searchToVendorCredit(page, memo, `Vendor credit ${posted.number} · ${SUMMIT}`)
        await expect(page).toHaveURL(CREDIT_URL_OF(firstId))
        await expect(shown(page, 'vendor-credit-read-only')).toBeVisible()

        // E: a correction that keeps the number; Post shows the new total.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/new\\?replaces=${firstId}$`))
        await expect(shown(page, 'vendor-credit-title')).toHaveText(`Edit ${posted.number}`)
        await expect(refInput).toHaveValue(ref)
        const editLine = await creditLineRowId(page, 'account_lines', 0)
        await cellOf(page, 'account_lines', editLine)('amount').fill('70.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        expect(vendorCreditIdFromUrl(page)).not.toBe(firstId)
        await expect(shown(page, 'vendor-credit-title')).toHaveText(
            `Vendor credit ${posted.number}`
        )
        await expect(shown(page, 'vendor-credit-total')).toContainText(money(7_000))
        const correctionId = vendorCreditIdFromUrl(page)

        // The original, through search, reads Replaced by.
        await searchToVendorCredit(page, memo, `Vendor credit ${posted.number} (void) · ${SUMMIT}`)
        await expect(page).toHaveURL(CREDIT_URL_OF(firstId))
        await expect(shown(page, 'vendor-credit-replaced-by')).toHaveText(
            `Replaced by ${posted.number} (edited)`
        )

        // V on the correction: the void dialog; confirming voids it.
        await searchToVendorCredit(page, memo, `Vendor credit ${posted.number} · ${SUMMIT}`)
        await expect(page).toHaveURL(CREDIT_URL_OF(correctionId))
        await expect(readView).toBeVisible()
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_BODY)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Void')

        // A void credit offers Copy and View journal entry only.
        const actions = shown(page, 'vendor-credit-read-actions')
        await expect(actions.getByTestId('vendor-credit-read-copy')).toBeVisible()
        await expect(actions.getByTestId('vendor-credit-read-entry')).toBeVisible()
        await expect(actions.getByTestId('vendor-credit-read-edit')).toHaveCount(0)
        await expect(actions.getByTestId('vendor-credit-read-void')).toHaveCount(0)
    })
})

test.describe('vendor-credit-form: phone', () => {
    test('keeps, posts and reads a vendor credit on a phone', async ({ page }) => {
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewVendorCredit(page)
        await expect(page.getByTestId('vendor-credit-form')).toBeVisible()

        // The band stacks Vendor, Credit date and Vendor's credit no., each full width,
        // in Tab order.
        const BAND = ['vendor', 'date', 'ref_no']
        await expect
            .poll(async () => {
                const boxes: { x: number; y: number; width: number }[] = []
                for (const key of BAND) boxes.push(await boxOf(page, `form-field-${key}`))
                const [first] = boxes
                return boxes.every(
                    (box, index) =>
                        Math.abs(box.x - first.x) < 2 &&
                        Math.abs(box.width - first.width) < 2 &&
                        (index === 0 || box.y > boxes[index - 1].y)
                )
            })
            .toBe(true)

        // Account line 1 is a card.
        await expect(page.getByTestId('form-table-account_lines-cards')).toBeVisible()
        const line1 = await creditLineRowId(page, 'account_lines', 0)
        await expect(page.getByTestId(`form-table-account_lines-kind-${line1}`)).toHaveText(
            'Account line'
        )
        await expect(page.getByTestId('form-table-account_lines-grid')).toHaveCount(0)

        // The phone bar: Cancel, Save draft, Post and More.
        for (const id of [
            'vendor-credit-cancel',
            'vendor-credit-save-draft',
            'vendor-credit-post',
            'vendor-credit-more',
        ]) {
            await expect(page.getByTestId(id)).toBeVisible()
        }
        await expect(page.getByTestId('vendor-credit-post-new')).not.toBeVisible()

        await pickCreditVendor(page, SUMMIT)
        await expect(cellOf(page, 'account_lines', line1)('account')).toContainText(SOFTWARE)
        await cellOf(page, 'account_lines', line1)('amount').fill('35.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Vendor credit phone'))
        await page.getByTestId('vendor-credit-save-draft').click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-title')).toHaveText('Draft vendor credit')

        // More holds Post & new and Delete draft.
        await page.getByTestId('vendor-credit-more').click()
        await expect(page.getByText('Post & new', { exact: true })).toBeVisible()
        await expect(page.getByText('Delete draft', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByText('Delete draft', { exact: true })).toHaveCount(0)

        await page.getByTestId('vendor-credit-post').click()
        await expect(page.getByTestId('vendor-credit-read-only')).toBeVisible()
        await vendorCreditNumberOf(page)

        // The unapplied credit offers Apply to bills: the read bar keeps it and moves Edit,
        // Void, Copy and View journal entry into More.
        await expect(page.getByTestId('vendor-credit-read-apply')).toBeVisible()
        await expect(page.getByTestId('vendor-credit-read-more')).toBeVisible()
        await expect(page.getByTestId('vendor-credit-read-edit')).not.toBeVisible()
        await expect(page.getByTestId('vendor-credit-read-void')).not.toBeVisible()
        await page.getByTestId('vendor-credit-read-more').click()
        for (const label of ['Edit', 'Void', 'Copy', 'View journal entry']) {
            await expect(
                // A menu item's name ends with its shortcut hint, when it has one.
                page.getByRole('menuitem', { name: new RegExp(`^${label}( \\S)?$`) }),
                label
            ).toBeVisible()
        }
        await page.keyboard.press('Escape')

        // The totals end in Unapplied credit, under Total.
        await expect(page.getByTestId('vendor-credit-total-unapplied')).toContainText(money(3_500))
        await expect(page.getByTestId('vendor-credit-total-applied')).toHaveCount(0)
        await expect
            .poll(async () => {
                const total = await boxOf(page, 'vendor-credit-total')
                const unapplied = await boxOf(page, 'vendor-credit-total-unapplied')
                return unapplied.y > total.y
            })
            .toBe(true)
    })
})

// Settings → Purchases → Purchase lines is the shared books_settings row: this test runs
// in the purchase-lines-setting project (playwright.config.ts) and stores "Accounts and
// products" again in `afterEach`.
test.describe('vendor-credit-form: purchase lines setting', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
        await page.setViewportSize(DESKTOP)
        await setPurchaseLines(page, 'Accounts and products')
    })

    test('Products only shows only the product table on a new credit', async ({ page }) => {
        await openBooks(page)
        await setPurchaseLines(page, 'Products only')
        // The card and its note name all three forms (spec §3.8).
        await expect(
            page.getByText(PURCHASES_CARD_TITLE, { exact: true }).filter({ visible: true })
        ).toBeVisible()
        await expect(
            page.getByText(PURCHASE_LINES_NOTE, { exact: true }).filter({ visible: true })
        ).toBeVisible()
        await leaveSettings(page)

        // New → Vendor credit: one empty product line and no account table.
        await openNewVendorCredit(page)
        await expect(page.getByTestId('vendor-credit-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(creditItemLineRows(page)).toHaveCount(1)
        await expect(page.getByTestId('vendor-credit-account-lines-heading')).toHaveCount(0)
        await expect(anyLineRows(page, 'account_lines')).toHaveCount(0)
        await expect(page.getByTestId('form-table-account_lines-add')).toHaveCount(0)

        // ⌥↵ adds nothing; Tab from Vendor's credit no. lands on the product line.
        const refInput = page.getByTestId('form-input-ref_no')
        await tabTo(page, page.getByTestId('form-input-date'))
        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, refInput)
        await page.keyboard.press('Alt+Enter')
        await expect(anyLineRows(page, 'account_lines')).toHaveCount(0)
        const product1 = await creditLineRowId(page, 'item_lines', 0)
        // No key takes ⌥↵ here, so its Enter blurs the single-line ref_no (react-native-web
        // TextInput blurs on Enter); Tab goes on from where the focus was.
        await tabTo(page, cellOf(page, 'item_lines', product1)('product'), { fromBody: true })

        // Cancel leaves the unedited form, so `/` opens search from the list.
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('vendor-credit-form')).toHaveCount(0)

        // The seeded credit 1001 has an account line: its read view shows Account
        // details whatever the setting.
        await openVendorCreditBySearch(page, UNAPPLIED_MEMO)
        // A read view pushed over another keeps the lower one mounted and hidden: read the
        // shown one.
        const readView = shown(page, 'vendor-credit-read-only')
        await expect(readView).toBeVisible()
        await expect(readView.getByTestId('vendor-credit-account-lines')).toBeVisible()
        await expect(readView).toContainText('Account details')
        await expect(readView).toContainText(RENT)

        // The seeded partly applied credit: Credit amount is its Total, Applied −$30.00,
        // and Unapplied credit the Total less $30.00.
        await openVendorCreditBySearch(page, PARTLY_MEMO)
        await expect(readView).toBeVisible()
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')
        const total = moneyCents(await shown(page, 'vendor-credit-total').innerText())
        await expect(shown(page, 'vendor-credit-credit-amount')).toContainText(money(total))
        await expect(shown(page, 'vendor-credit-total-applied')).toContainText(`${MINUS}$30.00`)
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText(
            money(total - 3_000)
        )
    })
})
