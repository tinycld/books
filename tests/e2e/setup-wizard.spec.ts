import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// The e2e database is shared and finishing completes setup, so the whole flow is one
// test that mutates it once. The seeded book already has accounts and the seed has no
// non-admin Books user or empty book, so the fresh-chart, creating, error and
// non-admin parts are covered by the hook tests, not here.
test.describe('setup-wizard: Books setup flow', () => {
    test('walks Business, Ownership and the populated-book notice, then finishes', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.getByTestId('books-setup-card').click()

        const partLabel = page.getByTestId('books-setup-part-label')
        const businessName = page.getByTestId('books-setup-business-name')
        const month = page.getByTestId('books-setup-month')
        const next = page.getByTestId('setup-continue')
        const back = page.getByTestId('books-setup-back')
        const ownershipCardBoxes = async () => {
            const owners = await page.getByTestId('books-setup-ownership-owners').boundingBox()
            const corporation = await page
                .getByTestId('books-setup-ownership-corporation')
                .boundingBox()
            if (!owners || !corporation) throw new Error('ownership cards are not rendered')
            return { owners, corporation }
        }

        await expect(partLabel).toHaveText('Part 1 of 3')

        await businessName.fill('')
        await next.click()
        await expect(page.getByText('Enter the legal business name')).toBeVisible()
        await expect(partLabel).toHaveText('Part 1 of 3')
        await expect(page.getByTestId('books-setup-ownership-owners')).toHaveCount(0)

        await businessName.fill('E2E Setup Co')
        await month.click()
        await page.getByTestId('books-setup-month-7').click()
        await expect(month).toContainText('July')
        await next.click()

        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByText('How is the business owned?')).toBeVisible()
        await page.getByTestId('books-setup-ownership-corporation').click()
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await expect
            .poll(async () => {
                const cards = await ownershipCardBoxes()
                return cards.corporation.x > cards.owners.x
            })
            .toBe(true)

        await back.click()
        await expect(partLabel).toHaveText('Part 1 of 3')
        await expect(businessName).toHaveValue('E2E Setup Co')
        await expect(month).toContainText('July')

        await next.click()
        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await next.click()
        await expect(page.getByTestId('books-setup-populated')).toBeVisible()
        await expect(page.getByText('This book already has')).toBeVisible()
        await expect(partLabel).toHaveText('Part 3 of 3')

        await page.setViewportSize({ width: 390, height: 844 })
        await back.click()
        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await expect
            .poll(async () => {
                const cards = await ownershipCardBoxes()
                return (
                    cards.corporation.x === cards.owners.x && cards.corporation.y > cards.owners.y
                )
            })
            .toBe(true)
        await next.click()
        await expect(page.getByTestId('books-setup-populated')).toBeVisible()

        await next.click()
        await expect(page.getByTestId('books-setup-done')).toBeVisible()
        await expect(page.getByText('Your books are ready')).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.getByTestId('books-setup-open-chart').click()
        await expect(page).toHaveURL(/\/books\/accounts$/)
        await page.getByTestId('books-nav-lists').click()
        await expect(page.getByTestId('books-setup-card')).toHaveCount(0)
    })
})
