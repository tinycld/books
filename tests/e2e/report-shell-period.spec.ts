import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BALANCES_ROUTE,
    choosePreset,
    DESKTOP,
    hasNoPageScrollX,
    openTrialBalance,
    PHONE,
    setAsOfDate,
    TABLET,
} from './report-shell-helpers'

// The period control (preset pills, the "As of" field, inline errors) and live apply: every
// valid change is written to the URL at once, with no history entry, and the empty state's
// action goes through the same form.
//
// Nothing here writes data. The Trial Balance is an as-of report, so only the as-of presets
// and the one "As of" field are reachable; the "Today" preset has rows or not by date, and a
// Custom date in 2000 has none, so only that empty state is asserted.

const AS_OF_PILLS = [
    'Today',
    'End of last month',
    'End of last quarter',
    'End of last fiscal year',
    'Custom',
]
const AS_OF_PRESET_IDS = [
    'today',
    'end-of-last-month',
    'end-of-last-quarter',
    'end-of-last-fiscal-year',
    'custom',
]

function presetPills(page: Page) {
    return page.locator('[data-testid^="report-period-preset-"]')
}

async function heightOf(locator: Locator) {
    return (await locator.boundingBox())?.height ?? 0
}

async function widthOf(locator: Locator) {
    return (await locator.boundingBox())?.width ?? 0
}

async function pillBoxes(page: Page) {
    return presetPills(page).evaluateAll(pills =>
        pills.map(pill => {
            const box = pill.getBoundingClientRect()
            return { top: Math.round(box.top), bottom: Math.round(box.bottom) }
        })
    )
}

const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

// The as-of chip ends with one day ("End of last quarter · Sep 30, 2026"); this is that day as
// the YYYY-MM-DD the "As of" field holds.
async function chipDay(page: Page) {
    const text = (await page.getByTestId('report-period').textContent()) ?? ''
    const match = /· ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(text)
    if (!match) return `unreadable chip: ${text}`
    const month = String(SHORT_MONTHS.indexOf(match[1]) + 1).padStart(2, '0')
    return `${match[3]}-${month}-${match[2].padStart(2, '0')}`
}

async function asOfFieldTop(page: Page) {
    return (await page.getByTestId('report-period-as-of').boundingBox())?.y ?? Number.NaN
}

test.describe('report-shell: period and live apply', () => {
    test('presets apply at once with no history entry, at desktop, tablet and phone', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)

        const chip = page.getByTestId('report-period')
        const popover = page.getByTestId('report-period-popover')
        await chip.click()
        await expect(popover).toBeVisible()
        await expect(presetPills(page)).toHaveText(AS_OF_PILLS)
        for (const id of AS_OF_PRESET_IDS) {
            await expect(page.getByTestId(`report-period-preset-${id}`)).toHaveAttribute(
                'aria-checked',
                id === 'end-of-last-month' ? 'true' : 'false'
            )
        }
        const asOf = page.getByTestId('report-period-as-of')
        await expect(asOf).toHaveCount(1)
        await expect(asOf).toHaveAccessibleName('As of')
        await expect(popover.getByText('As of', { exact: true })).toBeVisible()
        await expect(asOf).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
        await expect(page.getByTestId('report-period-from')).toHaveCount(0)

        await page.getByTestId('report-period-preset-today').click()
        await expect(popover).toHaveCount(0)
        await expect(chip).toHaveText(/^Today · /)
        await expect.poll(() => page.url()).toContain('preset=today')
        await expect(page.getByTestId('report-document-period')).toHaveText(/^As of /)

        await choosePreset(page, 'end-of-last-quarter')
        await expect.poll(() => page.url()).toContain('preset=end-of-last-quarter')
        await expect(chip).toHaveText(/^End of last quarter · /)
        const quarterEnd = await chipDay(page)

        // The form shows the applied preset: its pill is checked and "As of" holds the chip's day.
        await chip.click()
        await expect(popover).toBeVisible()
        await expect(asOf).toHaveValue(quarterEnd)
        await expect(page.getByTestId('report-period-preset-end-of-last-quarter')).toHaveAttribute(
            'aria-checked',
            'true'
        )

        // Closing the control while a date is invalid discards that edit: reopened, the form
        // shows the last valid period again.
        const error = page.getByTestId('report-period-error')
        await setAsOfDate(page, '2026-02-30')
        await expect(error).toHaveText('Enter a date as YYYY-MM-DD.')
        await page.keyboard.press('Escape')
        await expect(popover).toHaveCount(0)
        await expect(chip).toHaveText(/^End of last quarter · /)
        await chip.click()
        await expect(popover).toBeVisible()
        await expect(error).toHaveCount(0)
        await expect(asOf).toHaveValue(quarterEnd)
        await expect(page.getByTestId('report-period-preset-end-of-last-quarter')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await expect(page.getByTestId('report-period-preset-custom')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await page.keyboard.press('Escape')
        await expect(popover).toHaveCount(0)

        // The default preset is left out of the URL.
        await choosePreset(page, 'end-of-last-month')
        await expect.poll(() => page.url()).not.toContain('?')
        await expect(chip).toHaveText(/^End of last month · /)

        // The Trial Balance has no basis, so it has no method toggle.
        await expect(page.getByTestId('report-method')).toHaveCount(0)

        // Option changes add no history entries: Back returns to the hub.
        await choosePreset(page, 'today')
        await expect.poll(() => page.url()).toContain('preset=today')
        await page.goBack()
        await expect(page.getByTestId('report-hub')).toBeVisible()

        // Opening from the hub starts from the defaults.
        await page.getByTestId('report-hub-row-trial-balance').click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(chip).toHaveText(/^End of last month · /)
        await expect.poll(() => page.url()).not.toContain('?')

        // Tablet: a popover of its own width, not a full-width sheet. The new visit's form
        // starts from the default preset too.
        await page.setViewportSize(TABLET)
        await chip.click()
        await expect(popover).toBeVisible()
        await expect(page.getByTestId('report-period-preset-end-of-last-month')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await expect(asOf).toHaveValue(await chipDay(page))
        await expect.poll(() => widthOf(popover)).toBeGreaterThanOrEqual(360 - 24)
        await expect.poll(() => widthOf(popover)).toBeLessThanOrEqual(360 + 24)
        await expect.poll(() => widthOf(popover)).toBeLessThan(TABLET.width)
        await page.keyboard.press('Escape')
        await expect(popover).toHaveCount(0)

        // Phone: a bottom sheet titled "Report period"; the pills wrap and the field sits
        // below them.
        await page.setViewportSize(PHONE)
        await chip.click()
        const sheetTitle = page.getByText('Report period', { exact: true })
        await expect(sheetTitle).toBeVisible()
        await expect(presetPills(page)).toHaveText(AS_OF_PILLS)
        await expect
            .poll(async () => new Set((await pillBoxes(page)).map(box => box.top)).size)
            .toBeGreaterThanOrEqual(2)
        await expect
            .poll(async () => {
                const boxes = await pillBoxes(page)
                const last = boxes[boxes.length - 1]
                if (!last) return false
                return (await asOfFieldTop(page)) >= last.bottom
            })
            .toBe(true)
        await page.getByTestId('report-period-preset-today').click()
        await expect(sheetTitle).toHaveCount(0)
        await expect(chip).toHaveText(/^Today · /)
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)
    })

    test('custom dates while the report loads, the copied link and the empty action, at desktop and phone', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)

        const held: Route[] = []
        await page.route(BALANCES_ROUTE, route => {
            held.push(route)
        })

        await openTrialBalance(page)
        await expect(page.getByTestId('report-loading')).toBeVisible()

        // The controls stay usable while the figures load. Picked from the calendar:
        const chip = page.getByTestId('report-period')
        const popover = page.getByTestId('report-period-popover')
        const asOf = page.getByTestId('report-period-as-of')
        await chip.click()
        await expect(popover).toBeVisible()
        await expect(asOf).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
        const value = await asOf.inputValue()
        const picked = `${value.slice(0, 8)}15`
        await page.getByTestId('report-period-as-of-open').click()
        await page.getByRole('button', { name: picked, exact: true }).click()
        await expect(chip).toHaveText(/^Custom · [A-Z][a-z]{2} 15, \d{4}$/)
        await expect.poll(() => page.url()).toContain(`to=${picked}`)
        const pickedChip = (await chip.textContent()) ?? ''

        // Typed, invalid: the inline error shows and the report keeps the last valid period.
        await setAsOfDate(page, '2026-02-30')
        const error = page.getByTestId('report-period-error')
        await expect(error).toHaveText('Enter a date as YYYY-MM-DD.')
        await expect(error).toHaveAttribute('role', 'alert')
        await expect(page.getByTestId('report-period-preset-custom')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await expect(chip).toHaveText(pickedChip)
        await expect.poll(() => page.url()).toContain(`to=${picked}`)

        // Typed, valid: applies at once.
        await setAsOfDate(page, '2000-01-31')
        await expect(error).toHaveCount(0)
        await expect(chip).toHaveText('Custom · Jan 31, 2000')
        await expect.poll(() => page.url()).toContain('to=2000-01-31')
        await expect.poll(() => page.url()).not.toContain('preset')

        // Removing the handler releases every held request, so none that arrives meanwhile is
        // caught again.
        await page.unroute(BALANCES_ROUTE)

        await page.keyboard.press('Escape')
        await expect(popover).toHaveCount(0)
        const emptyMessage = page.getByTestId('report-empty-message')
        const emptyAction = page.getByTestId('report-empty-action')
        await expect(emptyMessage).toHaveText('No balances as of January 31, 2000')
        await expect(emptyAction).toHaveText('Show end of last fiscal year')
        await expect.poll(() => heightOf(emptyAction)).toBeGreaterThanOrEqual(44)

        // A copied link reopens the same report with the same options.
        const link = page.url()
        const second = await page.context().newPage()
        await login(second, { startAt: link })
        await expect(second.getByTestId('report-period')).toHaveText('Custom · Jan 31, 2000')
        await expect(second.getByTestId('report-empty-message')).toHaveText(
            'No balances as of January 31, 2000'
        )
        await second.getByTestId('report-period').click()
        await expect(second.getByTestId('report-period-popover')).toBeVisible()
        await expect(second.getByTestId('report-period-preset-custom')).toHaveAttribute(
            'aria-checked',
            'true'
        )
        await expect(second.getByTestId('report-period-as-of')).toHaveValue('2000-01-31')
        await second.close()

        // An invalid or unknown param falls back to its default.
        const third = await page.context().newPage()
        await login(third, { startAt: '/a/books/reports/trial-balance?preset=bogus&to=nope' })
        await expect(third.getByTestId('report-period')).toHaveText(/^End of last month · /)
        await third.close()

        await page.setViewportSize(PHONE)
        await expect(emptyMessage).toBeVisible()
        await expect(emptyAction).toBeVisible()
        await expect.poll(() => heightOf(emptyAction)).toBeGreaterThanOrEqual(44)
        await emptyAction.click()
        await expect(chip).toHaveText(/^End of last fiscal year · /)
        await expect.poll(() => page.url()).toContain('preset=end-of-last-fiscal-year')
        await expect(emptyAction).toHaveCount(0)
    })
})
