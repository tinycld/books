import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// The help topics that carry screenshots must render the committed images, and
// the dark app theme must pick the dark variant.

const TOPICS = [
    { title: 'Chart of Accounts', image: 'chart-of-accounts-1' },
    { title: 'Account register', image: 'account-register-1' },
]

async function openTopic(page: Page, title: string) {
    await page.getByTestId('nav-help').click()
    await page.getByPlaceholder('Search help topics').fill(title)
    await page.getByText(title, { exact: true }).first().click()
}

async function loadedImageSrc(page: Page, image: string) {
    const img = page.locator(`img[src*="${image}"]`).first()
    await expect(img).toBeVisible()
    await expect
        .poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
    return (await img.getAttribute('src')) ?? ''
}

test.describe('books help screenshots', () => {
    for (const { title, image } of TOPICS) {
        test(`${title} shows its image in light and dark`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await openTopic(page, title)
            const lightSrc = await loadedImageSrc(page, image)
            expect(lightSrc).not.toContain('.dark.')

            await page.emulateMedia({ colorScheme: 'dark' })
            await expect
                .poll(async () => (await loadedImageSrc(page, image)).includes('.dark.'))
                .toBe(true)
        })

        test(`${title} shows its image at a phone width`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await openTopic(page, title)
            await page.setViewportSize({ width: 390, height: 844 })
            await loadedImageSrc(page, image)
        })
    }
})
