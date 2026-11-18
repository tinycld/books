import { expect, type Page } from '@playwright/test'

/**
 * Picks `label` in a Books SearchPicker: the trigger opens a menu whose search field
 * takes the term, and each option is a menu item named by its label, with the test id
 * `<trigger>-option-<id>`. A form pushed over another form of the same kind keeps the
 * lower one mounted but hidden, so only the visible trigger is the top form's.
 *
 * The options follow the search only after a short delay (`SEARCH_DELAY_MS`), and the
 * menu then moves to fit its shorter list. An option of the full list can already carry
 * the label, so a click right after typing can press it as the list changes under the
 * pointer, and the press is lost. The pick waits until every option holds the typed
 * label (each picker matches its options on their label), that is until the list shows
 * this search.
 *
 * The options are found by their test id, not inside `role="menu"`: on a phone the menu
 * is a sheet with no menu role, and the picker's none item ("No vendor", "None") is a
 * menu item that never holds the label.
 */
export async function pickFromSearchPicker(page: Page, triggerTestId: string, label: string) {
    const trigger = page.getByTestId(triggerTestId).filter({ visible: true })
    await trigger.click()
    const search = page.getByTestId(`${triggerTestId}-search`)
    await expect(search).toBeFocused()
    await search.fill(label)
    const options = page
        .getByRole('menuitem')
        .and(page.locator(`[data-testid^="${triggerTestId}-option-"]`))
    await expect(options.filter({ hasNotText: label })).toHaveCount(0)
    const option = options.and(page.getByRole('menuitem', { name: label, exact: true }))
    await option.click()
    await expect(option).toHaveCount(0)
    await expect(trigger).toContainText(label)
}
