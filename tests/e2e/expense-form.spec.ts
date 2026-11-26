import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { EXPENSE_REFUSALS } from '../../tinycld/books/lib/expense-form-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    accountItem,
    createAccount,
    DESKTOP,
    openChart,
    openRegister,
    PHONE,
} from './account-register-helpers'
import { openPurchasesSettings, SETTINGS_ROW_PATH, setPurchaseLines } from './bill-helpers'
import { batchAnswered, refuseBatchWrite } from './document-batch-helpers'
import {
    clickNewExpense,
    EXPENSE_URL,
    expenseAccountLineRows,
    expenseCellTestId,
    expenseIdFromUrl,
    expenseItemLineRows,
    expenseLineRowId,
    NEW_EXPENSE_URL,
    openExpenseBySearch,
    openNewExpense,
    pickExpenseLineAccount,
    pickExpenseLineProduct,
    pickExpenseVendor,
    pickPaidFrom,
    pickSelectOption,
    postExpense,
    reopenExpenseByBack,
    searchToExpense,
} from './expense-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { batchOperations, openEntriesList, searchEntries } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import { isDisabled } from './record-form-helpers'
import { expectNotRecordUrl, expectRecordUrl, recordIdFromUrl } from './record-key-helpers'
import { leaveSettings, visibleTestId } from './sales-receipt-helpers'

// The expense form and its read view (expense spec §3.1–§3.9), checkpoint 3. Every expense
// is made by driving the form with a unique memo (and a unique Ref no. where a check
// number matters); the spec never edits, posts, voids or deletes a seeded expense, vendor,
// product or account, never asserts a fixed expense number and posts every expense on the
// default payment date (today). Transfers, sales receipts and bills post to 1000 and 2100
// from other workers, so their balance lines are checked by format only; the one exact
// balance is a credit card account the test creates.
//
// The keyboard tests press no click after the form opens: focus starts in Vendor, Tab
// moves between fields, a picker opens by typing, a select by Enter, ⌘S / ⌘↵ / ⌘⇧↵ / Esc /
// ⌘⌫ are Save draft / Post / Post & new / Cancel / Delete draft, ⌥↵ / ⌥P add an account /
// product line.
//
// One phone test: the phone form is other code (the band stacks every cell full width,
// each line is a card, and the bar moves Post & new and Delete draft into More). Not
// driven here: native-only behavior, loading, not-found, cannot-edit, offline and
// no-access (unit: tests/document-screen-state.test.ts), the reader's read view (unit:
// tests/document-actions.test.ts), the client zod rules (unit:
// tests/document-schema-expense.test.ts), the Cash default of a Cash on hand account and
// the empty-chart Paid from error (unit: tests/paid-from.test.ts).

const SUMMIT = 'Summit IT Services'

// The Vendor menu shows only this search's matches (and the No vendor row above them).
// ↓ then waits on nothing: it moves into the options the menu shows, so it must reach the
// first match, not the No vendor row (the keys picked No vendor when the search had settled
// before ↓, and Summit when it had not).
async function expectOnlySummitListed(page: Page) {
    const others = page
        .getByRole('menuitem')
        .filter({ visible: true })
        .filter({ hasNotText: /Summit|No vendor/ })
    await expect(others).toHaveCount(0)
}
const OFFICE_SUPPLY = 'Office Supply World'
const PACIFIC_POWER = 'Pacific Power'
const CHECKING = '1000 Business Checking'
const CARD = '2100 Company Card'
const ACCESS_POINT = 'Wireless access point'
const ACCESS_POINT_DESCRIPTION = 'Wi-Fi 6E access point, ceiling mount, PoE powered.'
const PATCH_CABLE = 'Cat6 patch cable, 10 ft'
const REF_HINT = 'Check number or card reference'
const MEMO_HINT = 'Only your team sees this. Saved as the journal entry memo.'
// The delete dialog's title and body are separate elements.
const DELETE_TITLE = 'Delete this draft expense?'
const DELETE_BODY = "This can't be undone."
const NO_LINES = 'Add at least one account or product line'
// The balance line under Paid from, for an account other workers also post to.
const BALANCE_FORMAT = /^Balance -?\$[\d,]+\.\d\d$/

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

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// Tab until the target has focus: for a test whose Tab order another test pins.
async function tabUntil(page: Page, target: Locator) {
    for (let press = 0; press < 12; press++) {
        if (await target.evaluate(el => el === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

// A focused core SelectInput, by keys only: Enter opens it, ArrowDown moves through its
// rows until the focused one is `label`, Enter picks it.
async function pickFocusedSelect(page: Page, trigger: Locator, label: string) {
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toBeVisible()
    for (let press = 0; press < 12; press++) {
        if (await item.evaluate(el => el === document.activeElement)) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
    // Core gives focus back to the trigger one animation frame after the menu closes; a
    // Tab in that frame would start from the body.
    await expect(trigger).toBeFocused()
}

function cellOf(page: Page, table: 'account_lines' | 'item_lines', rowId: string) {
    return (column: string) => page.getByTestId(expenseCellTestId(table, rowId, column))
}

// Every write of an expense or its lines the page sends: a request of its own, or a batch
// (a save) with an operation on them.
function expenseWrites(page: Page): Request[] {
    const writes: Request[] = []
    page.on('request', request => {
        const path = new URL(request.url()).pathname
        const isExpenseWrite =
            request.method() !== 'GET' &&
            /^\/api\/collections\/books_expense(s|_lines)\/records/.test(path)
        const isExpenseBatch = batchOperations(request).some(operation =>
            /\/api\/collections\/books_expense(s|_lines)\/records/.test(operation.url)
        )
        if (isExpenseWrite || isExpenseBatch) writes.push(request)
    })
    return writes
}

// Answers every write to this expense's row with a refusal, as the server would: the
// header write of a save's batch, and an update of its own (the post).
async function refuseExpenseWrites(
    page: Page,
    id: string,
    body: { message: string; data: object }
) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route(`**/api/collections/books_expenses/records/${id}*`, route =>
        route.request().method() === 'PATCH'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify(body),
              })
            : route.fallback()
    )
    await refuseBatchWrite(page, 'books_expenses', 'PATCH', body)
}

const messageRefusal = (message: string) => ({ message, data: {} })

const fieldRefusal = (field: string, message: string) => ({
    message: 'Failed to update record.',
    data: { [field]: { code: 'validation_invalid', message } },
})

test.describe('expense-form: keyboard', () => {
    test('creates and posts an expense from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Expense keyboard create')
        const ref = uniqueRef('KB')
        await openBooks(page)
        await openNewExpense(page)
        const today = await localToday(page)

        // An expense has no address, no Edit vendor link, no message, and no tabs.
        await expect(page.getByTestId('expense-title')).toHaveText('New expense')
        await expect(page.getByTestId('expense-mailing-address')).toHaveCount(0)
        await expect(page.getByTestId('expense-edit-vendor')).toHaveCount(0)
        await expect(page.getByText('Edit vendor', { exact: true })).toHaveCount(0)
        await expect(page.getByTestId('form-input-message')).toHaveCount(0)
        await expect(page.getByText(REF_HINT, { exact: true })).toBeVisible()
        await expect(page.getByText(MEMO_HINT, { exact: true })).toBeVisible()

        // The wide bar: Cancel, Save draft, Post, Post & new, left to right; no Delete
        // draft on a new expense.
        const boxOf = async (testId: string) => {
            const box = await page.getByTestId(testId).boundingBox()
            if (!box) throw new Error(`${testId} has no box`)
            return box
        }
        await expect
            .poll(async () => {
                const lefts: number[] = []
                for (const id of [
                    'expense-cancel',
                    'expense-save-draft',
                    'expense-post',
                    'expense-post-new',
                ]) {
                    lefts.push((await boxOf(id)).x)
                }
                return lefts.every((left, index) => index === 0 || left > lefts[index - 1])
            })
            .toBe(true)
        await expect(page.getByTestId('expense-delete-draft')).toHaveCount(0)

        // ⇧? lists the form's keys under "Expense"; Escape closes only the list.
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await page.keyboard.press('Shift+?')
        const list = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(list).toBeVisible()
        const group = list.getByText('Expense', { exact: true }).locator('..')
        for (const label of ['Post', 'Post & new', 'Save draft', 'Cancel']) {
            await expect(group.getByText(label, { exact: true }), label).toBeVisible()
        }
        // Core files every table's row-kind key under its own group "Lines", with the
        // core row keys of the focused line.
        const lines = list.getByText('Lines', { exact: true }).locator('..')
        for (const label of ['Add account line', 'Add product line']) {
            await expect(lines.getByText(label, { exact: true }), label).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await expect(page.getByTestId('expense-form')).toBeVisible()

        // From here on, no click.
        await expect(vendor).toBeFocused()
        await page.keyboard.type('Summit')
        await expect(page.getByTestId('form-input-vendor-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: SUMMIT, exact: true })).toBeVisible()
        await expectOnlySummitListed(page)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(vendor).toContainText(SUMMIT)

        // A pick moves focus to Paid from; picking 1000 sets Payment method to Check and
        // shows the account's balance.
        const paidFrom = page.getByTestId('form-input-paid_from')
        await expect(paidFrom).toBeFocused()
        await pickFocusedSelect(page, paidFrom, CHECKING)
        await expect(page.getByTestId('expense-paid-from-balance')).toHaveText(BALANCE_FORMAT)
        const method = page.getByTestId('form-input-payment_method')
        await expect(method).toContainText('Check')

        const date = page.getByTestId('form-input-date')
        await tabTo(page, date)
        await expect(date).toHaveValue(today)
        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, method)
        await tabTo(page, page.getByTestId('form-input-reference_no'))
        await page.keyboard.type(ref)

        // Account line 1 already holds Summit's default expense account.
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await tabTo(page, account1('account'))
        await expect(account1('account')).toContainText('6200 Software Subscriptions')
        await tabTo(page, account1('description'))
        await page.keyboard.type('Managed services, November')
        await tabTo(page, account1('amount'))
        await page.keyboard.type('125.00')
        await page.keyboard.press('Enter')

        // Enter in the last account line's Amount adds a line and focuses its Account.
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        const line2 = await expenseLineRowId(page, 'account_lines', 1)
        const account2 = cellOf(page, 'account_lines', line2)
        // Core addOnSubmit opens the new line's Account picker with its search focused.
        await expect(
            page.getByTestId(`${expenseCellTestId('account_lines', line2, 'account')}-search`)
        ).toBeFocused()
        await page.keyboard.type('Rent')
        await expect(page.getByRole('menuitem', { name: '6100 Rent', exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(account2('account')).toContainText('6100 Rent')
        await expect(account2('description')).toBeFocused()
        await tabTo(page, account2('amount'))
        await page.keyboard.type('-25.00')
        await tabTo(page, page.getByTestId(`form-table-account_lines-menu-${line2}`))
        await tabTo(page, page.getByTestId('form-table-account_lines-add'))
        // The product table shows with no line yet: its add button is the next stop.
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))
        await expect(expenseItemLineRows(page)).toHaveCount(0)

        // ⌥P adds a product line and focuses its Product picker.
        await page.keyboard.press('Alt+p')
        await expect(expenseItemLineRows(page)).toHaveCount(1)
        const product1 = await expenseLineRowId(page, 'item_lines', 0)
        const item1 = cellOf(page, 'item_lines', product1)
        await page.keyboard.type('Wireless')
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(item1('product')).toContainText(ACCESS_POINT)
        await expect(item1('description')).toHaveValue(ACCESS_POINT_DESCRIPTION)
        await expect(item1('rate')).toHaveValue('121.40')
        await expect(item1('description')).toBeFocused()
        await tabTo(page, item1('quantity'))
        await page.keyboard.type('2')
        await tabTo(page, item1('rate'))
        await page.keyboard.press('Enter')

        // Enter in the last product line's Rate adds a line with its picker open; Escape
        // closes only the picker.
        await expect(expenseItemLineRows(page)).toHaveCount(2)
        const product2 = await expenseLineRowId(page, 'item_lines', 1)
        const item2 = cellOf(page, 'item_lines', product2)
        const search2 = page.getByTestId(
            `${expenseCellTestId('item_lines', product2, 'product')}-search`
        )
        await expect(search2).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search2).toHaveCount(0)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(item2('product')).toBeFocused()
        await tabTo(page, item2('description'))
        await tabTo(page, item2('quantity'))
        await tabTo(page, item2('rate'))
        await tabTo(page, page.getByTestId(`form-table-item_lines-menu-${product2}`))
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.keyboard.type(memo)
        // Attach files follows Memo (a new expense has no attachment rows), then the bar.
        await tabTo(page, page.getByTestId('expense-attachments-attach'))
        await tabTo(page, page.getByTestId('expense-cancel'))

        // Post; the empty product line 2 is dropped.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(EXPENSE_URL)
        const readView = page.getByTestId('expense-read-only')
        await expect(readView).toBeVisible()
        await expect(page.getByTestId('expense-title')).toHaveText(/^Expense \d+$/)
        await expect(page.getByTestId('expense-badge')).toHaveText('Posted')
        await expect(page.getByTestId('expense-detail-vendor')).toContainText(SUMMIT)
        await expect(readView).toContainText(CHECKING)
        await expect(page.getByTestId('expense-detail-date')).toContainText(formatDay(today))
        await expect(page.getByTestId('expense-detail-payment')).toContainText(`Check · ${ref}`)
        await expect(page.getByTestId('expense-mailing-address')).toHaveCount(0)
        await expect(page.getByTestId('expense-bill-to')).toHaveCount(0)
        await expect(readView).toContainText('Managed services, November')
        await expect(readView).toContainText(money(12_500))
        await expect(readView).toContainText(money(-2_500))
        await expect(readView.getByText(ACCESS_POINT, { exact: true })).toHaveCount(1)
        await expect(readView).toContainText(money(24_280))
        await expect(page.getByTestId('expense-total-account-lines')).toContainText('Account lines')
        await expect(page.getByTestId('expense-total-account-lines')).toContainText(money(10_000))
        await expect(page.getByTestId('expense-total-item-lines')).toContainText(
            'Products and services'
        )
        await expect(page.getByTestId('expense-total-item-lines')).toContainText(money(24_280))
        await expect(page.getByTestId('expense-total')).toContainText(money(34_280))
        await expect(page.getByTestId('expense-amount-paid')).toContainText(money(34_280))
        await expect(readView).toContainText(memo)
    })

    test('edits a draft expense from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Expense keyboard edit')
        await openBooks(page)
        await openNewExpense(page)
        await pickPaidFrom(page, CARD)
        const line1 = await pickExpenseLineAccount(page, 0, '6100 Rent')
        const account1 = cellOf(page, 'account_lines', line1)
        await account1('amount').fill('80.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-title')).toHaveText('Draft expense')
        const id = await expenseIdFromUrl(page)

        // The draft opens with focus in Vendor (spec §3.2); from here on, no click.
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText('No vendor')
        const paidFrom = page.getByTestId('form-input-paid_from')
        await tabTo(page, paidFrom)
        await expect(paidFrom).toContainText(CARD)
        await tabTo(page, page.getByTestId('form-input-date'))
        await tabTo(page, page.getByTestId('form-input-date-open'))
        const method = page.getByTestId('form-input-payment_method')
        await tabTo(page, method)
        await expect(method).toContainText('Credit card')
        await pickFocusedSelect(page, method, 'Debit card')
        const refInput = page.getByTestId('form-input-reference_no')
        await tabTo(page, refInput)
        await page.keyboard.type('Visa 4417')
        const amount1 = account1('amount')
        await tabUntil(page, amount1)
        // Tab into Amount selects its text (lesson 25), so typing replaces 80.00.
        await page.keyboard.type('95.50')
        await expect(amount1).toHaveValue('95.50')

        // ⌥↵ adds an account line with its picker open; Escape closes only the picker.
        await page.keyboard.press('Alt+Enter')
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        const line2 = await expenseLineRowId(page, 'account_lines', 1)
        const search2 = page.getByTestId(
            `${expenseCellTestId('account_lines', line2, 'account')}-search`
        )
        await expect(search2).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search2).toHaveCount(0)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)

        const saved = batchAnswered(page, 'books_expenses', 'PATCH', 200)
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expectRecordUrl(page, 'expenses', id)

        // The empty trailing account line was dropped at save.
        await reopenExpenseByBack(page)
        await expect(method).toContainText('Debit card')
        await expect(refInput).toHaveValue('Visa 4417')
        await expect(expenseAccountLineRows(page)).toHaveCount(1)
        await expect(amount1).toHaveValue('95.50')
        await expect(page.getByTestId('expense-total')).toContainText(money(9_550))
        await expect(page.getByTestId('expense-amount-paid')).toContainText(money(9_550))
        await expect(page.getByTestId('expense-total-item-lines')).toHaveCount(0)

        // Post & new: a fresh new form, with no vendor (this form was not opened with one).
        await vendor.focus()
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/expenses\/new\?fresh=[^&#]+$/)
        await expect(page.getByTestId('expense-title')).toHaveText('New expense')
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText('No vendor')

        await page.keyboard.type('Summit')
        await expect(page.getByRole('menuitem', { name: SUMMIT, exact: true })).toBeVisible()
        await expectOnlySummitListed(page)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(vendor).toContainText(SUMMIT)
        await page.keyboard.press('Escape')
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(NEW_EXPENSE_URL)
        await expect(page.getByTestId('expense-form')).toHaveCount(0)
    })
})

test.describe('expense-form: form', () => {
    test('saves and posts an expense with account and product lines', async ({ page }) => {
        const memo = uniqueMemo('Expense form lines')
        const cardName = uniqueMemo('Expense card')
        await openBooks(page)
        // A credit card account no other test posts to, so its balance is exact.
        await openChart(page)
        await createAccount(page, cardName, { type: 'Credit card', detailType: 'Credit card' })
        await page.getByTestId('books-nav-lists').click()
        await openNewExpense(page)
        const today = await localToday(page)

        const method = page.getByTestId('form-input-payment_method')
        const balance = page.getByTestId('expense-paid-from-balance')

        // Post with Paid from and Payment method empty shows "required" under Payment
        // method; a Paid from pick sets a method, which clears that error.
        const methodError = page.getByTestId('form-field-payment_method-error')
        await page.getByTestId('expense-post').click()
        await expect(methodError).toBeVisible()
        await expect(page).toHaveURL(NEW_EXPENSE_URL)
        await pickPaidFrom(page, CHECKING)
        await expect(method).toContainText('Check')
        await expect(methodError).toHaveCount(0)

        // Each Paid from pick sets Payment method again.
        await pickPaidFrom(page, CARD)
        await expect(method).toContainText('Credit card')
        await expect(balance).toHaveText(BALANCE_FORMAT)
        await pickPaidFrom(page, CHECKING)
        await expect(method).toContainText('Check')
        await pickSelectOption(page, 'form-input-payment_method', 'Cash')
        await pickPaidFrom(page, cardName)
        await expect(method).toContainText('Credit card')
        await expect(balance).toHaveText('Balance $0.00')

        // A vendor pick fills only the first account line, never the band.
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        const paidFrom = page.getByTestId('form-input-paid_from')
        const refInput = page.getByTestId('form-input-reference_no')
        await pickExpenseVendor(page, OFFICE_SUPPLY)
        await expect(account1('account')).toContainText('6210 Design Tools')
        await expect(paidFrom).toContainText(cardName)
        await expect(method).toContainText('Credit card')
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        await expect(refInput).toHaveValue('')
        await pickExpenseVendor(page, PACIFIC_POWER)
        await expect(account1('account')).toContainText('6210 Design Tools')

        // "No vendor" empties the picker, which shows its muted placeholder.
        const vendor = page.getByTestId('form-input-vendor')
        await vendor.click()
        await page.getByTestId('form-input-vendor-none').click()
        const noVendor = vendor.getByText('No vendor', { exact: true })
        await expect(noVendor).toBeVisible()
        await expect(noVendor).toHaveClass(/text-muted-foreground/)
        await account1('amount').fill('50.00')

        await expect(expenseItemLineRows(page)).toHaveCount(0)
        await page.getByTestId('form-table-item_lines-add').click()
        await expect(expenseItemLineRows(page)).toHaveCount(1)
        const product1 = await expenseLineRowId(page, 'item_lines', 0)
        const item1 = cellOf(page, 'item_lines', product1)

        // The Product picker lists only products I purchase.
        await item1('product').click()
        const search = page.getByTestId(
            `${expenseCellTestId('item_lines', product1, 'product')}-search`
        )
        await expect(search).toBeFocused()
        await search.fill('Printer paper')
        await expect(page.getByRole('menuitem', { name: /Printer paper/ })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(search).toHaveCount(0)

        // A typed Description stays; the empty Rate fills with the cost.
        await item1('description').fill('Lobby AP')
        await pickExpenseLineProduct(page, 0, ACCESS_POINT)
        await expect(item1('description')).toHaveValue('Lobby AP')
        await expect(item1('rate')).toHaveValue('121.40')
        await item1('quantity').fill('4')
        await expect(item1('amount')).toContainText(money(48_560))
        await expect(page.getByTestId('expense-total-account-lines')).toContainText(money(5_000))
        await expect(page.getByTestId('expense-total-item-lines')).toContainText(money(48_560))
        await expect(page.getByTestId('expense-total')).toContainText(money(53_560))
        await expect(page.getByTestId('expense-amount-paid')).toContainText(money(53_560))
        await expect(page.getByTestId('expense-total-balance')).toHaveCount(0)
        await page.getByTestId('form-input-memo').fill(memo)

        await page.getByTestId('expense-save-draft').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-title')).toHaveText('Draft expense')
        await expect(page.getByTestId('expense-badge')).toHaveText('Draft')
        await page.getByTestId('expense-more').click()
        await expect(page.getByTestId('expense-delete-draft')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('expense-delete-draft')).toHaveCount(0)

        // Offline: the bar's write buttons disable while writes are unavailable; Cancel stays.
        const saveDraft = page.getByTestId('expense-save-draft')
        const post = page.getByTestId('expense-post')
        const postNew = page.getByTestId('expense-post-new')
        const cancel = page.getByTestId('expense-cancel')
        await page.context().setOffline(true)
        await expect.poll(() => isDisabled(saveDraft)).toBe(true)
        await expect.poll(() => isDisabled(post)).toBe(true)
        await expect.poll(() => isDisabled(postNew)).toBe(true)
        await expect.poll(() => isDisabled(cancel)).toBe(false)
        await page.context().setOffline(false)
        await expect.poll(() => isDisabled(saveDraft)).toBe(false)
        await expect.poll(() => isDisabled(post)).toBe(false)
        await expect.poll(() => isDisabled(postNew)).toBe(false)

        await postExpense(page)
        const readView = page.getByTestId('expense-read-only')
        await expect(page.getByTestId('expense-badge')).toHaveText('Posted')
        await expect(page.getByTestId('expense-detail-vendor')).toContainText('No vendor')
        await expect(readView).toContainText(cardName)
        const payment = page.getByTestId('expense-detail-payment')
        await expect(payment).toContainText('Credit card')
        await expect(payment).not.toContainText('·')
        await expect(readView).toContainText('Account details')
        await expect(readView).toContainText('Product and service details')
        await expect(readView).toContainText('Lobby AP')
        await expect(page.getByTestId('expense-total-account-lines')).toContainText(money(5_000))
        await expect(page.getByTestId('expense-total-item-lines')).toContainText(money(48_560))
        await expect(page.getByTestId('expense-total')).toContainText(money(53_560))
        await expect(page.getByTestId('expense-amount-paid')).toContainText(money(53_560))
        await expect(page.getByTestId('expense-posted-by')).toContainText('Posted by')
        await expect(readView).toContainText(memo)

        // A credit to a credit card raises its own balance.
        await openNewExpense(page)
        await pickPaidFrom(page, cardName)
        await expect
            .poll(async () => (await balance.innerText()).trim())
            .toBe(`Balance ${money(53_560)}`)
    })

    test('shows server refusals under their fields', async ({ page }) => {
        await openBooks(page)

        // A refused accounts-with-balances read is the screen's load error, with Retry.
        await page.route('**/api/collections/books_account_balances/records*', route =>
            route.fulfill({ status: 400 })
        )
        await clickNewExpense(page)
        await expect(page.getByTestId('expense-error')).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('expense-retry').click()
        await expect(page.getByTestId('expense-form')).toBeVisible()

        // A posted expense by check from 1000 with a unique Ref no.
        const ref = uniqueRef('CHK')
        await pickExpenseVendor(page, SUMMIT)
        await pickPaidFrom(page, CHECKING)
        await expect(page.getByTestId('form-input-payment_method')).toContainText('Check')
        await page.getByTestId('form-input-reference_no').fill(ref)
        const firstLine = await expenseLineRowId(page, 'account_lines', 0)
        await page
            .getByTestId(expenseCellTestId('account_lines', firstLine, 'amount'))
            .fill('40.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Expense refusals first'))
        const number = await postExpense(page)

        // A second check from 1000 with the same number: refused under Ref no.
        await openNewExpense(page)
        await pickPaidFrom(page, CHECKING)
        const refInput = page.getByTestId('form-input-reference_no')
        await refInput.fill(ref)
        const line = await pickExpenseLineAccount(page, 0, '6100 Rent')
        const account = cellOf(page, 'account_lines', line)
        await account('amount').fill('60.00')
        const memo = uniqueMemo('Expense refusals second')
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(memo)

        // A refused first insert of a NEW expense stores nothing: the empty trailing
        // account line dropped at save comes back.
        await page.getByTestId('form-table-account_lines-add').click()
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        await refuseBatchWrite(
            page,
            'books_expenses',
            'POST',
            messageRefusal(EXPENSE_REFUSALS.closeDate)
        )
        await page.getByTestId('expense-save-draft').click()
        await expect(page.getByTestId('expense-error-summary')).toContainText(
            EXPENSE_REFUSALS.closeDate
        )
        await expect(page).toHaveURL(NEW_EXPENSE_URL)
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        await expect(account('amount')).toHaveValue('60.00')
        await page.unrouteAll({ behavior: 'wait' })

        await page.getByTestId('expense-save-draft').click()
        await expect(page.getByTestId('form-field-reference_no-error')).toHaveText(
            `Check no. ${ref} from ${CHECKING} is already on Expense ${number}.`
        )
        await expect(page).toHaveURL(NEW_EXPENSE_URL)

        // Not a check: the same Ref no. saves.
        await pickSelectOption(page, 'form-input-payment_method', 'Credit card')
        await page.getByTestId('expense-save-draft').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-title')).toHaveText('Draft expense')
        const id = await expenseIdFromUrl(page)

        // An inactive Paid from shows under Paid from; the draft and its values stay.
        await refuseExpenseWrites(
            page,
            id,
            fieldRefusal('paid_from', EXPENSE_REFUSALS.inactivePaidFrom)
        )
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('form-field-paid_from-error')).toHaveText(
            EXPENSE_REFUSALS.inactivePaidFrom
        )
        await expectRecordUrl(page, 'expenses', id)
        await expect(page.getByTestId('expense-title')).toHaveText('Draft expense')
        await expect(refInput).toHaveValue(ref)
        await expect(memoInput).toHaveValue(memo)
        await expect(account('amount')).toHaveValue('60.00')
        await expect(page.getByTestId('form-input-payment_method')).toContainText('Credit card')

        // An account line refusal shows under that line, and the empty trailing line added
        // before the Post comes back.
        await page.getByTestId('form-table-account_lines-add').click()
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        const accountRefusal = 'Account line 1: Rent is inactive. Choose an active account.'
        await refuseExpenseWrites(page, id, messageRefusal(accountRefusal))
        await page.getByTestId('expense-post').click()
        await expect(
            expenseAccountLineRows(page).nth(0).getByText(accountRefusal, { exact: true })
        ).toBeVisible()
        await expect(expenseAccountLineRows(page)).toHaveCount(2)
        await expectRecordUrl(page, 'expenses', id)

        // A product line refusal shows under that product line.
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('form-table-item_lines-add').click()
        const product = await pickExpenseLineProduct(page, 0, PATCH_CABLE)
        await page.getByTestId(expenseCellTestId('item_lines', product, 'quantity')).fill('1')
        const productRefusal = `Product line 1: ${PATCH_CABLE} is inactive. Choose an active product or service.`
        await refuseExpenseWrites(page, id, messageRefusal(productRefusal))
        await page.getByTestId('expense-post').click()
        await expect(
            expenseItemLineRows(page).nth(0).getByText(productRefusal, { exact: true })
        ).toBeVisible()
        await expectRecordUrl(page, 'expenses', id)

        // An inactive vendor refusal shows under Vendor.
        const vendorRefusal = `${SUMMIT} is inactive. Choose an active vendor.`
        await refuseExpenseWrites(page, id, messageRefusal(vendorRefusal))
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('form-field-vendor-error')).toHaveText(vendorRefusal)
        await expectRecordUrl(page, 'expenses', id)

        // Field refusals on Payment date and Payment method show under those fields.
        const dateRefusal = 'Enter a payment date.'
        await refuseExpenseWrites(page, id, fieldRefusal('date', dateRefusal))
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('form-field-date-error')).toHaveText(dateRefusal)
        await expectRecordUrl(page, 'expenses', id)
        const methodRefusal = 'Choose a payment method.'
        await refuseExpenseWrites(page, id, fieldRefusal('payment_method', methodRefusal))
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('form-field-payment_method-error')).toHaveText(methodRefusal)
        await expectRecordUrl(page, 'expenses', id)

        // Anything else (the close date) shows in the error summary.
        await refuseExpenseWrites(page, id, messageRefusal(EXPENSE_REFUSALS.closeDate))
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('expense-error-summary')).toContainText(
            EXPENSE_REFUSALS.closeDate
        )
        await expectRecordUrl(page, 'expenses', id)
        await page.unrouteAll({ behavior: 'wait' })

        // Out of the text fields, so ⌘⌫ is the screen's Delete draft.
        await page.getByTestId('expense-title').click()
        await page.keyboard.press('ControlOrMeta+Backspace')
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(DELETE_TITLE)
        await expect(dialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expectNotRecordUrl(page, 'expenses', id)
        await expect(page.getByTestId('expense-form')).toHaveCount(0)

        // Post with no lines (the one empty account line): the line-count rule under the
        // tables, and no write.
        await openNewExpense(page)
        await pickPaidFrom(page, CHECKING)
        const writes = expenseWrites(page)
        await page.getByTestId('expense-post').click()
        await expect(page.getByTestId('expense-line-error')).toHaveText(NO_LINES)
        await expect(page).toHaveURL(NEW_EXPENSE_URL)
        expect(writes).toEqual([])
    })

    test('corrects and copies a posted expense', async ({ page }) => {
        const memo = uniqueMemo('Expense correction')
        const ref = uniqueRef('COR')
        await openBooks(page)
        await openNewExpense(page)
        const today = await localToday(page)
        await pickExpenseVendor(page, SUMMIT)
        await pickPaidFrom(page, CHECKING)
        await page.getByTestId('form-input-reference_no').fill(ref)
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        await page.getByTestId(expenseCellTestId('account_lines', line1, 'amount')).fill('200.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postExpense(page)
        const originalId = await expenseIdFromUrl(page)

        // E: a correction that keeps the number and the Ref no.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/expenses/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('expense-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('expense-replace-note')).toBeVisible()
        await expect(page.getByTestId('form-input-vendor')).toBeFocused()
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue(ref)
        const line = await expenseLineRowId(page, 'account_lines', 0)
        await page.getByTestId(expenseCellTestId('account_lines', line, 'amount')).fill('210.00')

        // Post: no duplicate check number against its own original.
        await page.getByTestId('expense-post').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        expect(await expenseIdFromUrl(page)).not.toBe(originalId)
        await expect(page.getByTestId('expense-title')).toHaveText(`Expense ${number}`)
        await expect(page.getByTestId('expense-total')).toContainText(money(21_000))
        const correctionId = await expenseIdFromUrl(page)

        // C: a copy of the correction, dated today with an empty Ref no.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/expenses/new\\?copy=${correctionId}$`))
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText(SUMMIT)
        await expect(page.getByTestId('form-input-paid_from')).toContainText(CHECKING)
        await expect(page.getByTestId('form-input-payment_method')).toContainText('Check')
        const copyLine = await expenseLineRowId(page, 'account_lines', 0)
        await expect(
            page.getByTestId(expenseCellTestId('account_lines', copyLine, 'amount'))
        ).toHaveValue('210.00')
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue('')
    })
})

test.describe('expense-form: phone', () => {
    test('keeps a draft expense on a phone and deletes it', async ({ page }) => {
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewExpense(page)

        // The band stacks Vendor, Paid from, Payment date, Payment method and Ref no., each
        // full width, in Tab order.
        const boxOf = async (testId: string) => {
            const box = await page.getByTestId(testId).boundingBox()
            if (!box) throw new Error(`${testId} has no box`)
            return box
        }
        const BAND = ['vendor', 'paid_from', 'date', 'payment_method', 'reference_no']
        await expect
            .poll(async () => {
                const boxes: { x: number; y: number; width: number }[] = []
                for (const key of BAND) boxes.push(await boxOf(`form-field-${key}`))
                const [first] = boxes
                return boxes.every(
                    (box, index) =>
                        Math.abs(box.x - first.x) < 2 &&
                        Math.abs(box.width - first.width) < 2 &&
                        (index === 0 || box.y > boxes[index - 1].y)
                )
            })
            .toBe(true)

        // Account line 1 is a card: kind label, then Account, Description and Amount
        // stacked, with the row menu at the top right.
        await expect(page.getByTestId('form-table-account_lines-cards')).toBeVisible()
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        const cell = cellOf(page, 'account_lines', line1)
        await expect(page.getByTestId(`form-table-account_lines-kind-${line1}`)).toHaveText(
            'Account line'
        )
        await expect
            .poll(async () => {
                const account = await boxOf(expenseCellTestId('account_lines', line1, 'account'))
                const description = await boxOf(
                    expenseCellTestId('account_lines', line1, 'description')
                )
                const amount = await boxOf(expenseCellTestId('account_lines', line1, 'amount'))
                const menu = await boxOf(`form-table-account_lines-menu-${line1}`)
                return {
                    stacked: description.y > account.y && amount.y > description.y,
                    menuTopRight: menu.y < account.y && menu.x > account.x,
                }
            })
            .toEqual({ stacked: true, menuTopRight: true })
        await expect(cell('amount')).toHaveCSS('text-align', 'right')
        await expect(page.getByTestId('form-table-account_lines-grid')).toHaveCount(0)

        // The phone bar: Cancel, Save draft, Post and More.
        for (const id of ['expense-cancel', 'expense-save-draft', 'expense-post', 'expense-more']) {
            await expect(page.getByTestId(id)).toBeVisible()
        }
        await expect(page.getByTestId('expense-post-new')).not.toBeVisible()

        await pickPaidFrom(page, CHECKING)
        await pickExpenseLineAccount(page, 0, '6100 Rent')
        await cell('amount').fill('35.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Expense phone draft'))
        await page.getByTestId('expense-save-draft').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-title')).toHaveText('Draft expense')
        const draftId = await expenseIdFromUrl(page)

        await page.getByTestId('expense-more').click()
        await expect(page.getByText('Post & new', { exact: true })).toBeVisible()
        const deleteRow = page.getByText('Delete draft', { exact: true })
        await expect(deleteRow).toBeVisible()
        await deleteRow.click()
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(DELETE_TITLE)
        await expect(dialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expectNotRecordUrl(page, 'expenses', draftId)
        await expect(page.getByTestId('expense-form')).toHaveCount(0)
    })
})

// Expenses across Books (expense spec §3.6, §3.8, §3.11), checkpoint 4: search, the
// revision conflict, the journal entry's links back to the expense, and void.
const EXPENSE_CONFLICT =
    'This expense changed after you opened it. Load the current expense, then review it before you save or post.'
const VOID_BODY = 'A reversing entry is posted in the original period. The number is kept.'
// The Journal Entries list's rows, without their row menu buttons.
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

async function entryIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'entries')
}

// The entry read view's lines, in one snapshot: account label, debit, credit and name.
function readEntryLines(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const text = (id: string) =>
            (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) => ({
            account: text(`entry-line-account-${i}`),
            debit: text(`entry-line-debit-${i}`),
            credit: text(`entry-line-credit-${i}`),
            name: text(`entry-line-party-${i}`),
        }))
    })
}

// The Journal Entries list row of this memo's entries whose Type cell is exactly `type`
// and whose status is `status`; returns its entry id.
async function entryRowId(page: Page, type: RegExp, status: RegExp): Promise<string> {
    const row = page
        .locator(ROWS)
        .filter({ has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: type }) })
        .filter({ has: page.locator('[data-testid^="entries-status-"]', { hasText: status }) })
    await expect(row).toHaveCount(1)
    return ((await row.getAttribute('data-testid')) ?? '').replace(/^entries-row-/, '')
}

// The row id of account line `index` inside one mounted expense form (the stack may keep
// an earlier form of the same draft mounted and hidden).
async function formLineRowId(form: Locator, index: number): Promise<string> {
    const prefix = 'form-table-account_lines-row-'
    const testId = await form
        .locator(`[data-testid^="${prefix}"]`)
        .nth(index)
        .getAttribute('data-testid')
    if (!testId) throw new Error(`no account line ${index + 1}`)
    return testId.slice(prefix.length)
}

// A second session opens the draft by its memo, sets account line 1's amount to 50.00
// and saves it.
async function saveOtherAmount(other: Page, memo: string) {
    await openBooks(other)
    await openExpenseBySearch(other, memo)
    const form = other.getByTestId('expense-form').filter({ visible: true })
    await expect(form.getByTestId('form-input-memo')).toHaveValue(memo)
    const otherLine = await expenseLineRowId(other, 'account_lines', 0)
    await other.getByTestId(expenseCellTestId('account_lines', otherLine, 'amount')).fill('50.00')
    await form.getByTestId('expense-title').click()
    await expect(form.getByTestId('expense-total')).toContainText(money(5_000))
    const saved = batchAnswered(other, 'books_expenses', 'PATCH', 200)
    await form.getByTestId('expense-save-draft').click()
    await saved
}

test.describe('expense-form: across Books', () => {
    test('finds expenses through search', async ({ page, browser }) => {
        const postedMemo = uniqueMemo('Expense search posted')
        const draftMemo = uniqueMemo('Expense search draft')
        const ref = uniqueRef('SRCH')
        await openBooks(page)

        await openNewExpense(page)
        await pickExpenseVendor(page, SUMMIT)
        await pickPaidFrom(page, CHECKING)
        await page.getByTestId('form-input-reference_no').fill(ref)
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        await page.getByTestId(expenseCellTestId('account_lines', line1, 'amount')).fill('72.00')
        await page.getByTestId('form-input-memo').fill(postedMemo)
        const number = await postExpense(page)
        const postedId = await expenseIdFromUrl(page)

        // A draft with no vendor.
        await openNewExpense(page)
        await pickPaidFrom(page, CHECKING)
        await pickExpenseLineAccount(page, 0, '6100 Rent')
        const draftLine = await expenseLineRowId(page, 'account_lines', 0)
        await page
            .getByTestId(expenseCellTestId('account_lines', draftLine, 'amount'))
            .fill('30.00')
        await page.getByTestId('form-input-memo').fill(draftMemo)
        await page.getByTestId('expense-save-draft').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        const draftForm = page.getByTestId('expense-form')
        await expect(draftForm.getByTestId('expense-title')).toHaveText('Draft expense')
        const draftId = await expenseIdFromUrl(page)

        // By the posted expense's Ref no.: its read view. Out of the text fields first, so
        // `/` opens the search palette.
        await draftForm.getByTestId('expense-title').click()
        await searchToExpense(page, ref, `Expense ${number} · ${SUMMIT}`)
        await expectRecordUrl(page, 'expenses', postedId)
        // The draft's form stays mounted under the pushed read view: scope to the screen.
        const readView = page.getByTestId('expense-read-only')
        await expect(readView).toBeVisible()
        await expect(readView.getByTestId('expense-title')).toHaveText(`Expense ${number}`)

        // By the draft's memo: its form.
        await searchToExpense(page, draftMemo, 'Draft expense')
        await expectRecordUrl(page, 'expenses', draftId)
        const form = page.getByTestId('expense-form').filter({ visible: true })
        await expect(form).toBeVisible()
        await expect(form.getByTestId('form-input-memo')).toHaveValue(draftMemo)

        // The revision conflict: a second session saves the draft after this one opened it.
        const ownLine = await formLineRowId(form, 0)
        const ownAmount = form.getByTestId(expenseCellTestId('account_lines', ownLine, 'amount'))
        await expect(ownAmount).toHaveValue('30.00')

        // This session changes its memo first: what it typed stays from here.
        const changedMemo = `${draftMemo} changed`
        await form.getByTestId('form-input-memo').fill(changedMemo)
        await form.getByTestId('expense-title').click()
        const context = await browser.newContext()
        try {
            await saveOtherAmount(await context.newPage(), draftMemo)

            // This session saves: refused, with its URL and typed memo kept.
            await form.getByTestId('expense-save-draft').click()
            const conflict = page.getByTestId('expense-conflict').filter({ visible: true })
            await expect(conflict).toContainText(EXPENSE_CONFLICT)
            await expectRecordUrl(page, 'expenses', draftId)
            await expect(form.getByTestId('form-input-memo')).toHaveValue(changedMemo)

            // Load the current expense: the notice goes and the stored expense replaces what was typed.
            const reload = page.getByTestId('expense-conflict-reload').filter({ visible: true })
            await expect(reload).toHaveText('Load the current expense')
            await reload.click()
            await expect(conflict).toHaveCount(0)
            const reloadedLine = await formLineRowId(form, 0)
            await expect(
                form.getByTestId(expenseCellTestId('account_lines', reloadedLine, 'amount'))
            ).toHaveValue('50.00')
            await expect(form.getByTestId('expense-total')).toContainText(money(5_000))
            await expect(form.getByTestId('form-input-memo')).toHaveValue(draftMemo)
        } finally {
            await context.close()
        }
    })

    test("links an expense's journal entry back to the expense", async ({ page }) => {
        const memo = uniqueMemo('Expense entry link')
        await openBooks(page)
        await openNewExpense(page)
        await pickExpenseVendor(page, SUMMIT)
        await pickPaidFrom(page, CHECKING)
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await expect(account1('account')).toContainText('6200 Software Subscriptions')
        await account1('amount').fill('150.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postExpense(page)
        const id = await expenseIdFromUrl(page)

        // J: the entry, typed Expense with the expense's number; it debits 6200 and credits
        // 1000 Business Checking, each line naming the vendor.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entryId = await entryIdFromUrl(page)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry).toBeVisible()
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Expense')
        await expect(page.getByTestId('entry-title')).toHaveText(`Journal entry ${number}`)
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                const expense = lines.find(l => l.account === '6200 Software Subscriptions')
                const paidFrom = lines.find(l => l.account === CHECKING)
                return {
                    count: lines.length,
                    expenseDebit: expense?.debit,
                    paidFromCredit: paidFrom?.credit,
                    names: [...new Set(lines.map(l => l.name))],
                }
            })
            .toEqual({
                count: 2,
                expenseDebit: money(15_000),
                paidFromCredit: money(15_000),
                names: [SUMMIT],
            })

        // Journal Entries: Type and No.; the row menu offers Open and Edit, and no Reverse.
        // Open goes to the expense.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Expense')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-edit')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'expenses', id)
        await expect(page.getByTestId('expense-read-only')).toBeVisible()

        // Edit opens the correction; Post it with $160.00.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        const editUrl = new RegExp(`/books/expenses/new\\?replaces=${id}$`)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(editUrl)
        await expect(page.getByTestId('expense-title')).toHaveText(`Edit ${number}`)
        const line = await expenseLineRowId(page, 'account_lines', 0)
        await page.getByTestId(expenseCellTestId('account_lines', line, 'amount')).fill('160.00')
        await page.getByTestId('expense-post').click()
        await expect(page).toHaveURL(EXPENSE_URL)
        expect(await expenseIdFromUrl(page)).not.toBe(id)
        await expect(page.getByTestId('expense-title')).toHaveText(`Expense ${number}`)
        await expect(page.getByTestId('expense-total')).toContainText(money(16_000))

        // The search keeps the rows of this memo (the original and the correction); the
        // original is the Void one typed "Expense", and Open reaches it.
        await openEntriesList(page)
        await searchEntries(page, memo)
        const originalEntry = await entryRowId(page, /^Expense$/, /^Void$/)
        await page.getByTestId(`entries-row-menu-${originalEntry}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'expenses', id)
        await expect(page.getByTestId('expense-badge')).toHaveText('Void')
        await expect(page.getByTestId('expense-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )
    })

    test('voids a posted expense', async ({ page }) => {
        const memo = uniqueMemo('Expense void')
        const cardName = uniqueMemo('Expense void card')
        await openBooks(page)
        // A credit card account no other test posts to, so its register holds only this
        // expense's entry and its void reversal.
        await openChart(page)
        await createAccount(page, cardName, { type: 'Credit card', detailType: 'Credit card' })
        await page.getByTestId('books-nav-lists').click()
        await openNewExpense(page)
        await pickExpenseVendor(page, SUMMIT)
        await pickPaidFrom(page, cardName)
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        await page.getByTestId(expenseCellTestId('account_lines', line1, 'amount')).fill('64.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postExpense(page)

        // V: the void dialog; confirming voids the expense.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_BODY)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('expense-badge')).toHaveText('Void')
        await expect(page.getByTestId('expense-voided-by')).toContainText('Voided by')

        // A void expense offers Copy and View journal entry only.
        await expect(page.getByTestId('expense-read-copy')).toBeVisible()
        await expect(page.getByTestId('expense-read-entry')).toBeVisible()
        await expect(page.getByTestId('expense-read-edit')).toHaveCount(0)
        await expect(page.getByTestId('expense-read-void')).toHaveCount(0)

        // The void reversal of this expense's entry names its number and links back to the expense.
        const expenseId = await recordIdFromUrl(page, 'expenses')
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\//)
        await page.getByTestId('entry-link-reversed-by').click()
        await expect(page.getByTestId('entry-detail-type')).toContainText('Void reversal')
        const reverses = page.getByTestId('entry-link-reverses')
        await expect(reverses).toHaveText(`Reverses ${number}`)
        await reverses.click()
        await expectRecordUrl(page, 'expenses', expenseId)
        await expect(page.getByTestId('expense-badge')).toHaveText('Void')

        // The Paid from account's register names the reversal "Void reversal of <n>" (spec
        // §3.11).
        await openRegister(page, cardName)
        const reversalType = page
            .locator('[data-testid^="register-cell-type-"]')
            .filter({ hasText: new RegExp(`^Void reversal of ${number}$`) })
        await expect(reversalType).toHaveCount(1)

        // Delete on the Paid from account of a void expense: the dialog gives the expense
        // text, not the journal-lines one (spec §3.11, server order).
        await openChart(page)
        await accountItem(page, cardName).locator('[data-testid^="account-menu-"]').click()
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
        await expect(page.getByTestId('delete-account-dialog-body')).toContainText(
            'This account paid 1 expense and cannot be deleted. Make it inactive instead.'
        )
    })
})

// Settings → Purchases → Purchase lines (expense spec §3.10). The setting is the shared
// books_settings row: these tests and bill-form.spec.ts's "lines setting" tests run in
// their own Playwright project before every other test (playwright.config.ts), in file
// order on one worker, and each stores "Accounts and products" again in `afterEach` (a
// `finally` would not run once a step waits out the test timeout).
const SAVE_REFUSAL = 'Books could not save this setting.'
const ITEM_HEADING = 'Product and service details'
const PURCHASE_LINES_NOTE =
    'Which line tables new bills, expenses and vendor credits show. A form still shows a table its record already has lines in.'

// Every line row of a table anywhere on the page, so a table that is not drawn counts 0.
function anyLineRows(page: Page, table: 'account_lines' | 'item_lines') {
    return page.locator(`[data-testid^="form-table-${table}-row-"]`)
}

test.describe('expense-form: purchase lines setting', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
        await page.setViewportSize(DESKTOP)
        await setPurchaseLines(page, 'Accounts and products')
    })

    test("Accounts only hides the product table but keeps an expense's product lines", async ({
        page,
    }) => {
        const memo = uniqueMemo('Purchase lines accounts only')
        await openBooks(page)
        // Under the default: a posted expense with one product line (no vendor, so account
        // line 1 stays empty and is dropped).
        await openNewExpense(page)
        await pickPaidFrom(page, CHECKING)
        await page.getByTestId('form-table-item_lines-add').click()
        const productLine = await pickExpenseLineProduct(page, 0, PATCH_CABLE)
        const item = cellOf(page, 'item_lines', productLine)
        await expect(item('rate')).toHaveValue('3.10')
        await item('quantity').fill('5')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postExpense(page)
        const originalId = await expenseIdFromUrl(page)
        await expect(page.getByTestId('expense-read-only')).toContainText(PATCH_CABLE)

        // The card, the select and the note name bills, expenses and vendor credits.
        await openPurchasesSettings(page)
        await expect(
            page
                .getByText('Bills, expenses and vendor credits', { exact: true })
                .filter({ visible: true })
        ).toBeVisible()
        await expect(
            page.getByText('Purchase lines', { exact: true }).filter({ visible: true })
        ).toBeVisible()
        await expect(
            page.getByText(PURCHASE_LINES_NOTE, { exact: true }).filter({ visible: true })
        ).toBeVisible()

        // A refused save shows the server's text and keeps the chosen value.
        const select = visibleTestId(page, 'books-settings-purchase-lines')
        const save = visibleTestId(page, 'books-settings-purchase-lines-save')
        await expect(select).toContainText('Accounts and products')
        await page.route(`**${SETTINGS_ROW_PATH}*`, route =>
            route.request().method() === 'PATCH'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ message: SAVE_REFUSAL, data: {} }),
                  })
                : route.fallback()
        )
        await select.click()
        const accountsOnly = page.getByRole('menuitem', { name: 'Accounts only', exact: true })
        await accountsOnly.click()
        await expect(accountsOnly).toHaveCount(0)
        await save.click()
        await expect(visibleTestId(page, 'books-settings-purchase-lines-error')).toContainText(
            SAVE_REFUSAL
        )
        await expect(select).toContainText('Accounts only')

        // Saved once the server answers.
        await page.unrouteAll({ behavior: 'wait' })
        const stored = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname === SETTINGS_ROW_PATH
        )
        await save.click()
        expect((await stored).status()).toBe(200)
        await expect(save).toBeDisabled()

        // The section list (the phone rows; the wide rail draws no summaries).
        await page.setViewportSize(PHONE)
        await visibleTestId(page, 'books-settings-back').click()
        await expect(visibleTestId(page, 'books-settings-section-purchases')).toContainText(
            'Purchase lines: Accounts only'
        )
        await page.setViewportSize(DESKTOP)
        await leaveSettings(page)

        // New → Expense: Account details with one empty account line, no product table.
        await openNewExpense(page)
        await expect(page.getByTestId('expense-account-lines-heading')).toHaveText(
            'Account details'
        )
        await expect(expenseAccountLineRows(page)).toHaveCount(1)
        const line1 = await expenseLineRowId(page, 'account_lines', 0)
        await expect(cellOf(page, 'account_lines', line1)('amount')).toHaveValue('')
        await expect(page.getByTestId('expense-item-lines-heading')).toHaveCount(0)
        await expect(
            page.getByTestId('expense-form').getByText(ITEM_HEADING, { exact: true })
        ).toHaveCount(0)
        await expect(page.getByTestId('form-table-item_lines-add')).toHaveCount(0)

        // ⌥P adds nothing: the product table registers no keys while it is not shown.
        const rowMenu = page.getByTestId(`form-table-account_lines-menu-${line1}`)
        await rowMenu.focus()
        await expect(rowMenu).toBeFocused()
        await page.keyboard.press('Alt+p')
        await expect(anyLineRows(page, 'item_lines')).toHaveCount(0)
        await expect(page.getByTestId('expense-item-lines-heading')).toHaveCount(0)
        await expect(expenseAccountLineRows(page)).toHaveCount(1)

        // Tab from the row menu: Add account line, then Memo (no product table stops).
        const addAccount = page.getByTestId('form-table-account_lines-add')
        await tabTo(page, addAccount)
        await expect(addAccount).toContainText('Add account line')
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.getByTestId('expense-cancel').click()
        await expect(page).not.toHaveURL(NEW_EXPENSE_URL)

        // The earlier expense's read view shows every table that has lines.
        await openExpenseBySearch(page, memo)
        const readView = page.getByTestId('expense-read-only')
        await expect(readView).toBeVisible()
        await expect(readView).toContainText(ITEM_HEADING)
        await expect(readView).toContainText(PATCH_CABLE)

        // E: the correction still shows the product table with its line.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/expenses/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('expense-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('expense-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(expenseItemLineRows(page)).toHaveCount(1)
        const correctionLine = await expenseLineRowId(page, 'item_lines', 0)
        await expect(cellOf(page, 'item_lines', correctionLine)('product')).toContainText(
            PATCH_CABLE
        )

        // Once shown in a form session a table stays shown, even after its last line is
        // removed.
        await page.getByTestId(`form-table-item_lines-menu-${correctionLine}`).click()
        await page.getByRole('menuitem', { name: /^Remove/ }).click()
        await expect(expenseItemLineRows(page)).toHaveCount(0)
        await expect(page.getByTestId('expense-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(page.getByTestId('form-table-item_lines-add')).toContainText(
            'Add product line'
        )
    })
})
