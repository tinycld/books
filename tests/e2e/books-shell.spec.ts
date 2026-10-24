import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

test.describe('books-shell: navigation', () => {
    test('opening Books lands on the Lists hub with the Accounts card and no New button', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await expect(page).toHaveURL(/\/books\/lists$/)
        await expect(page.getByTestId('books-list-card-accounts')).toBeVisible()
        await expect(page.getByText('No lists yet')).toHaveCount(0)
        await expect(page.getByTestId('books-nav-lists')).toBeVisible()
        await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0)
    })
})
