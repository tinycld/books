import { expect, type Locator, type Page } from '@playwright/test'

// The one Tab helper of the Books e2e specs. Core puts the focus back one animation frame
// after a layer (dialog, menu, sheet) unmounts (core/ui/overlay/focus.ts); until then the
// focus is on the page body, and a Tab pressed in that frame starts at the top of the page.

export type TabKey = 'Tab' | 'Shift+Tab'

export function isFocused(target: Locator): Promise<boolean> {
    return target.evaluate(el => el === document.activeElement)
}

// Waits until an element of the page, not the body, holds the focus.
export async function waitForFocus(page: Page): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                () => document.activeElement !== null && document.activeElement !== document.body
            )
        )
        .toBe(true)
}

/**
 * Presses Tab (or `key`) until `target` holds the focus; no click. With no `max` it presses
 * once; with `max` it presses at most `max` times. It first waits until the focus is off
 * the body, unless `fromBody` says the step before leaves the focus on the body by design.
 */
export async function tabTo(
    page: Page,
    target: Locator,
    options: { max?: number; key?: TabKey; fromBody?: boolean } = {}
): Promise<void> {
    const key = options.key ?? 'Tab'
    if (!options.fromBody) await waitForFocus(page)
    if (options.max === undefined) {
        await page.keyboard.press(key)
    } else {
        for (let presses = 0; presses < options.max && !(await isFocused(target)); presses++) {
            await page.keyboard.press(key)
        }
    }
    await expect(target).toBeFocused()
}

export async function shiftTabTo(page: Page, target: Locator): Promise<void> {
    await tabTo(page, target, { key: 'Shift+Tab' })
}
