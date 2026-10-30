import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    choosePreset,
    DESKTOP,
    hasNoPageScrollX,
    openAccountPicker,
    openTrialBalance,
    PHONE,
    setAsOfDate,
} from './report-shell-helpers'

// Filter chips, the "Add filter" menu, the account picker and the "Clear filters" empty
// action, read through the Trial Balance and its one `accounts` filter.
//
// Nothing here writes data. The "Today" preset has rows on any date, and a Custom date in
// 2000 has none. Other specs add accounts and post entries on the shared database, so no
// assertion names an amount or counts the accounts; it names only seeded accounts:
// "1000 Business Checking" (active) and "Old Petty Cash" (inactive).

const GROUP_LABELS = [
    'All asset accounts',
    'All liability accounts',
    'All equity accounts',
    'All income accounts',
    'All expense accounts',
]

const OPTION_ROWS = '[data-testid^="report-filter-option-"]'
const GROUP_ROWS = '[data-testid^="report-filter-option-group:"]'
const TABLE_ROWS = '[data-testid^="report-row-"]'

function optionRow(picker: Locator, label: string) {
    return picker.locator(OPTION_ROWS).filter({ hasText: label })
}

async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    return { width: box?.width ?? 0, height: box?.height ?? 0 }
}

// The distinct tops of the chips in the control row: one value when the row is one line.
async function chipTops(page: Page) {
    return page.getByTestId('report-controls').evaluate(row => {
        const chips = row.querySelectorAll(
            '[data-testid="report-period"], [data-testid^="report-filter-chip-"], [data-testid="report-add-filter"]'
        )
        return [
            ...new Set(Array.from(chips).map(chip => Math.round(chip.getBoundingClientRect().top))),
        ]
    })
}

async function controlRowOverflows(page: Page) {
    return page.getByTestId('report-controls').evaluate(row => row.scrollWidth > row.clientWidth)
}

// Whether the picker's list scrolls inside itself (its nearest vertical scroller is taller
// inside than out) while the Apply button's box stays inside the viewport.
async function pickerLayout(page: Page) {
    return page.evaluate(() => {
        const first = document.querySelector('[data-testid^="report-filter-option-"]')
        const apply = document.querySelector('[data-testid="report-filter-apply"]')
        let listScrolls = false
        for (let node = first?.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') {
                listScrolls = node.scrollHeight > node.clientHeight
                break
            }
        }
        const box = apply?.getBoundingClientRect()
        const applyInView = box !== undefined && box.top >= 0 && box.bottom <= window.innerHeight
        return { listScrolls, applyInView }
    })
}

async function isFullyInViewport(page: Page, locator: Locator) {
    const box = await locator.boundingBox()
    const width = page.viewportSize()?.width ?? 0
    if (!box) return false
    return box.x >= 0 && box.x + box.width <= width
}

test.describe('report-shell: filter chips', () => {
    test('add, edit and remove the account filter, at desktop and phone', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)
        await choosePreset(page, 'today')

        // An invalid period edit does not survive a surface change: the Add filter menu
        // replaces the period popover, and the period control reopens on the last valid date.
        const periodChip = page.getByTestId('report-period')
        const periodPopover = page.getByTestId('report-period-popover')
        const asOf = page.getByTestId('report-period-as-of')
        const periodError = page.getByTestId('report-period-error')
        await periodChip.click()
        await expect(periodPopover).toBeVisible()
        await expect(asOf).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
        const validDate = await asOf.inputValue()
        await setAsOfDate(page, '2026-02-30')
        await expect(periodError).toBeVisible()

        const addFilter = page.getByTestId('report-add-filter')
        const addMenu = page.getByTestId('report-add-filter-menu')
        await addFilter.click()
        await expect(addMenu).toBeVisible()
        await expect(periodPopover).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(addMenu).toHaveCount(0)

        await periodChip.click()
        await expect(periodPopover).toBeVisible()
        await expect(periodError).toHaveCount(0)
        await expect(asOf).toHaveValue(validDate)
        await expect(page.getByTestId('report-period-preset-today')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await page.keyboard.press('Escape')
        await expect(periodPopover).toHaveCount(0)

        // The menu lists the one inactive filter.
        await addFilter.click()
        await expect(addMenu).toBeVisible()
        await expect(addMenu.getByRole('menuitem')).toHaveText(['Account'])
        await expect(page.getByTestId('report-add-filter-account')).toHaveText('Account')
        await page.getByTestId('report-add-filter-account').click()

        // The picker: the five groups, then the active accounts; Apply waits for a choice.
        const picker = page.getByTestId('report-filter-picker')
        const apply = page.getByTestId('report-filter-apply')
        await expect(picker).toBeVisible()
        await expect(picker.getByText('Account groups', { exact: true })).toBeVisible()
        await expect(picker.getByText('Accounts', { exact: true })).toBeVisible()
        await expect(picker.locator(GROUP_ROWS)).toHaveText(GROUP_LABELS)
        const checking = optionRow(picker, '1000 Business Checking')
        await expect(checking).toHaveCount(1)
        await expect(optionRow(picker, 'Old Petty Cash')).toHaveCount(0)
        await expect(apply).toBeDisabled()

        await checking.click()
        await expect(checking).toHaveAttribute('aria-checked', 'true')
        await expect(apply).toBeEnabled()
        await apply.click()
        await expect(picker).toHaveCount(0)

        const accountChip = page.getByTestId('report-filter-chip-account')
        await expect(accountChip).toHaveText('Account: 1000 Business Checking')
        await expect.poll(() => page.url()).toContain('filter-account=')
        await expect(page.locator(TABLE_ROWS)).toHaveText(['1000 Business Checking', 'Total'])
        // Every filter of the Trial Balance is active, so there is nothing left to add.
        await expect(addFilter).toHaveCount(0)

        // The chip reopens its picker with the applied value checked; closing without Apply
        // changes nothing.
        const chipLabel = accountChip.getByRole('button', { name: /^Account: / })
        const income = page.getByTestId('report-filter-option-group:income')
        await chipLabel.click()
        await expect(picker).toBeVisible()
        await expect(checking).toHaveAttribute('aria-checked', 'true')
        await expect(income).toHaveAttribute('aria-checked', 'false')
        await income.click()
        await expect(income).toHaveAttribute('aria-checked', 'true')
        await page.keyboard.press('Escape')
        await expect(picker).toHaveCount(0)
        await expect(accountChip).toHaveText('Account: 1000 Business Checking')
        await expect.poll(() => page.url()).not.toContain('group')

        await chipLabel.click()
        await expect(picker).toBeVisible()
        await expect(income).toHaveAttribute('aria-checked', 'false')
        await expect(checking).toHaveAttribute('aria-checked', 'true')
        await income.click()
        await apply.click()
        await expect(picker).toHaveCount(0)
        await expect(accountChip).toHaveText('Account: 2 selections')

        // Unchecking every value disables Apply. Closing without Apply and reopening shows the
        // applied values checked again, and Apply enabled for them.
        await chipLabel.click()
        await expect(picker).toBeVisible()
        await checking.click()
        await income.click()
        await expect(checking).toHaveAttribute('aria-checked', 'false')
        await expect(income).toHaveAttribute('aria-checked', 'false')
        await expect(apply).toBeDisabled()
        await page.keyboard.press('Escape')
        await expect(picker).toHaveCount(0)
        await chipLabel.click()
        await expect(picker).toBeVisible()
        await expect(checking).toHaveAttribute('aria-checked', 'true')
        await expect(income).toHaveAttribute('aria-checked', 'true')
        await expect(apply).toBeEnabled()
        await page.keyboard.press('Escape')
        await expect(picker).toHaveCount(0)
        await expect(accountChip).toHaveText('Account: 2 selections')

        // The remove control is its own 44pt target and applies at once. Pressed while the
        // filter's picker is open, it closes that picker too: no picker stays open for a
        // filter that is gone, and none reopens under the Add filter chip.
        const remove = page.getByTestId('report-filter-remove-account')
        await expect(remove).toHaveAccessibleName('Remove Account filter')
        await expect.poll(async () => (await boxOf(remove)).width).toBeGreaterThanOrEqual(44)
        await expect.poll(async () => (await boxOf(remove)).height).toBeGreaterThanOrEqual(44)
        await chipLabel.click()
        await expect(picker).toBeVisible()
        await remove.click()
        await expect(picker).toHaveCount(0)
        await expect(accountChip).toHaveCount(0)
        await expect(addFilter).toBeVisible()
        await expect(picker).toHaveCount(0)
        await expect.poll(() => page.url()).not.toContain('filter-account')
        await expect.poll(() => page.locator(TABLE_ROWS).count()).toBeGreaterThan(2)

        // The draft survives a breakpoint change: a group checked in the desktop popover is
        // still checked in the phone sheet the picker becomes, titled "Account". Its list
        // scrolls and Apply stays in view; Apply applies the draft. The control row stays
        // one line.
        // The new filter's picker starts empty, so Apply waits for a choice again.
        const expense = page.getByTestId('report-filter-option-group:expense')
        await openAccountPicker(page)
        await expect(expense).toHaveAttribute('aria-checked', 'false')
        await expect(apply).toBeDisabled()
        await expense.click()
        await expect(expense).toHaveAttribute('aria-checked', 'true')
        await page.setViewportSize(PHONE)
        await expect(picker.getByText('Account', { exact: true })).toBeVisible()
        await expect(expense).toHaveAttribute('aria-checked', 'true')
        await expect(apply).toBeEnabled()
        await expect
            .poll(() => pickerLayout(page))
            .toEqual({ listScrolls: true, applyInView: true })
        await apply.click()
        await expect(picker).toHaveCount(0)
        await expect(accountChip).toHaveText('Account: All expense accounts')
        await expect.poll(async () => (await chipTops(page)).length).toBe(1)
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)
    })

    test('clear filters on an empty report, at phone', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)
        await page.setViewportSize(PHONE)

        const periodChip = page.getByTestId('report-period')
        await setAsOfDate(page, '2000-01-31')
        await expect(periodChip).toHaveText('Custom · Jan 31, 2000')
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('report-period-popover')).toHaveCount(0)

        await openAccountPicker(page)
        const picker = page.getByTestId('report-filter-picker')
        await page.getByTestId('report-filter-option-group:income').click()
        await page.getByTestId('report-filter-apply').click()
        await expect(picker).toHaveCount(0)
        const accountChip = page.getByTestId('report-filter-chip-account')
        await expect(accountChip).toHaveText('Account: All income accounts')

        // The two chips are wider than the phone: the row scrolls sideways, never wraps.
        const controls = page.getByTestId('report-controls')
        const remove = page.getByTestId('report-filter-remove-account')
        await expect.poll(() => controlRowOverflows(page)).toBe(true)
        await expect.poll(async () => (await chipTops(page)).length).toBe(1)
        await expect.poll(() => isFullyInViewport(page, remove)).toBe(false)
        await controls.hover()
        await page.mouse.wheel(400, 0)
        await expect.poll(() => isFullyInViewport(page, remove)).toBe(true)
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)

        const emptyMessage = page.getByTestId('report-empty-message')
        const emptyAction = page.getByTestId('report-empty-action')
        await expect(emptyMessage).toHaveText('No balances as of January 31, 2000')
        await expect(emptyAction).toHaveText('Clear filters')
        await expect.poll(async () => (await boxOf(emptyAction)).height).toBeGreaterThanOrEqual(44)
        await emptyAction.click()
        await expect(accountChip).toHaveCount(0)
        await expect.poll(() => page.url()).not.toContain('filter-account')
        await expect(emptyAction).toHaveText('Show end of last fiscal year')
    })
})
