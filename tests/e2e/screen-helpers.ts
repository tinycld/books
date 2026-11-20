import { expect, type Locator, type Page } from '@playwright/test'

// Expo Router keeps earlier screens stacked and hidden under the one on top (lesson 5), so
// a screen's test id can match more than once. Waits for exactly one visible match and
// returns it; fails, naming the test id, when none or more than one is visible.
export async function visibleScreen(page: Page, testId: string): Promise<Locator> {
    const screens = page.getByTestId(testId).filter({ visible: true })
    await expect(
        screens,
        `expected one visible "${testId}": 0 means it is not open, 2 or more means a stacked screen is visible too`
    ).toHaveCount(1)
    return screens
}
