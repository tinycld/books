import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { openEntriesList } from './journal-entries-helpers'

// An expense's own screen: `books/expenses/<id>`, never `books/expenses/new`.
export const EXPENSE_URL = /\/books\/expenses\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_EXPENSE_URL = /\/books\/expenses\/new(?:[?#].*)?$/

export type ExpenseTable = 'account_lines' | 'item_lines'

export function expenseIdFromUrl(page: Page): string {
    const match = /\/books\/expenses\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved expense: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) to the Expense item; leaves the click on
// it to the caller's next step.
export async function clickNewExpense(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-expense').click()
    await expect(page).toHaveURL(NEW_EXPENSE_URL)
}

// Books must already be open. New menu → Expense. A new expense's Vendor picker has focus
// (web, every width).
export async function openNewExpense(page: Page) {
    await clickNewExpense(page)
    await expect(page.getByTestId('expense-form')).toBeVisible()
    await expect(page.getByTestId('expense-title')).toHaveText('New expense')
    await expect(page.getByTestId('form-input-vendor')).toBeFocused()
}

// A Books SearchPicker: the trigger opens a menu whose search field takes the term, and
// each option is a menu item named by its label.
async function pickFromSearchPicker(page: Page, triggerTestId: string, label: string) {
    const trigger = page.getByTestId(triggerTestId)
    await trigger.click()
    const search = page.getByTestId(`${triggerTestId}-search`)
    await expect(search).toBeFocused()
    await search.fill(label)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

export async function pickExpenseVendor(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-vendor', name)
}

// A core SelectInput: the trigger opens a menu; each option is a menu item named by its
// label.
export async function pickSelectOption(page: Page, triggerTestId: string, label: string) {
    const trigger = page.getByTestId(triggerTestId)
    await trigger.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

// Paid from, by its "<number> <name>" label (the name alone for an account with no
// number).
export async function pickPaidFrom(page: Page, label: string) {
    await pickSelectOption(page, 'form-input-paid_from', label)
}

// Each table's rows (cards on a phone) in screen order; each row's id is in its test id.
function tableRows(page: Page, table: ExpenseTable) {
    const section = table === 'account_lines' ? 'expense-account-lines' : 'expense-item-lines'
    return page.getByTestId(section).locator(`[data-testid^="form-table-${table}-row-"]`)
}

export function expenseAccountLineRows(page: Page) {
    return tableRows(page, 'account_lines')
}

export function expenseItemLineRows(page: Page) {
    return tableRows(page, 'item_lines')
}

export async function expenseLineRowId(
    page: Page,
    table: ExpenseTable,
    index: number
): Promise<string> {
    const testId = await tableRows(page, table).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no ${table} line ${index + 1}`)
    return testId.slice(`form-table-${table}-row-`.length)
}

// An expense line cell's test id (core TableField): `form-table-<table>-<row id>-<column>`.
export function expenseCellTestId(table: ExpenseTable, rowId: string, column: string) {
    return `form-table-${table}-${rowId}-${column}`
}

export async function pickExpenseLineAccount(page: Page, index: number, label: string) {
    const rowId = await expenseLineRowId(page, 'account_lines', index)
    await pickFromSearchPicker(page, expenseCellTestId('account_lines', rowId, 'account'), label)
    return rowId
}

export async function pickExpenseLineProduct(page: Page, index: number, name: string) {
    const rowId = await expenseLineRowId(page, 'item_lines', index)
    await pickFromSearchPicker(page, expenseCellTestId('item_lines', rowId, 'product'), name)
    return rowId
}

// The number in a posted expense's read view title, "Expense <n>".
export async function expenseNumberOf(page: Page): Promise<string> {
    const title = page.getByTestId('expense-title')
    await expect(title).toHaveText(/^Expense \d+$/)
    const number = /^Expense (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the expense title has no number')
    return number
}

// The expense form must be open with a postable expense. Posts it with the bar's Post
// and returns the number the read view's title shows.
export async function postExpense(page: Page): Promise<string> {
    await page.getByTestId('expense-post').click()
    await expect(page).toHaveURL(EXPENSE_URL)
    await expect(page.getByTestId('expense-read-only')).toBeVisible()
    return expenseNumberOf(page)
}

// Desktop. Reopens the saved draft on screen without search: leaves through the sidebar's
// Journal Entries item, then Back (a same-document popstate) returns to the draft's form.
export async function reopenExpenseByBack(page: Page) {
    const url = page.url()
    const navItem = page.getByTestId('books-nav-entries')
    if (!(await navItem.isVisible())) {
        await page.getByTestId('books-nav-accounting-toggle').click()
    }
    await navItem.click()
    // A sidebar push leaves the earlier screen mounted and hidden, so the list may be
    // mounted twice: the pushed one is the last.
    await expect(page.getByTestId('entries-screen').last()).toBeVisible()
    await expect(page.getByTestId('expense-form')).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('expense-form')).toBeVisible()
}
