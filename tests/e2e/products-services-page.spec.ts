import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    DESKTOP,
    expectSavedToList,
    field,
    isRecordUrl,
    navigateInApp,
    openProduct,
    openProductsList,
    productsBase,
    selectItems,
    stampDigits,
} from './products-services-helpers'

// The product page (the surface below 1360 px). Both tests run on desktop only: the page
// logic is the same code on a phone (the phone page is checkpoint 11's test 9).
//
// Test 10 uses the seeded business laptop (driver decision 4): a stored expense account
// that became inactive after the product was saved can be held only by the seed, not
// through the UI. The edit it saves changes only the laptop's purchase description, to a
// value unique to the test (`Laptop, refreshed <stampDigits>`); no other spec reads or
// writes the laptop. The PATCH it reads proves the stored account is not sent. The panel
// surface is checkpoint 11.

const LAPTOP = 'Business laptop, 14-inch, 32 GB memory, 1 TB storage, three-year on-site warranty'
const OLD_PETTY_CASH = '6900 Old Petty Cash'

async function openBooksAtDesktop(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('products-services: product page', () => {
    test('keeps a stored inactive expense account and saves without a refusal (desktop)', async ({
        page,
    }) => {
        await openBooksAtDesktop(page)
        const title = page.getByTestId('product-title')
        const expense = page.getByTestId('form-input-expense_account')
        const expenseItems = selectItems(page, 'expense_account')

        await openProduct(page, LAPTOP)
        await expect(title).toHaveText('Edit non-inventory item')
        await expect(expense).toContainText(OLD_PETTY_CASH)

        // The stored inactive account shows in the trigger but is not offered.
        await expense.click()
        await expect(expenseItems.first()).toBeVisible()
        await expect(expenseItems.filter({ hasText: OLD_PETTY_CASH })).toHaveCount(0)
        // Escape closes the menu only, not the form.
        await page.keyboard.press('Escape')
        await expect(expenseItems).toHaveCount(0)
        await expect(title).toHaveText('Edit non-inventory item')

        const id = new URL(page.url()).pathname.split('/').pop() ?? ''
        const patch = page.waitForRequest(
            r => r.method() === 'PATCH' && isRecordUrl(id)(new URL(r.url()))
        )
        const description = `Laptop, refreshed ${stampDigits()}`
        await field(page, 'purchase_description').fill(description)
        await page.getByTestId('product-save').click()
        expect(Object.keys((await patch).postDataJSON())).toEqual(['purchase_description'])

        await expectSavedToList(page)

        await openProduct(page, LAPTOP)
        await expect(field(page, 'purchase_description')).toHaveValue(description)
        await expect(expense).toContainText(OLD_PETTY_CASH)
        await page.getByTestId('product-cancel').click()
    })

    test('shows not found for an unknown product URL (desktop)', async ({ page }) => {
        await openBooksAtDesktop(page)

        await openProductsList(page)
        await navigateInApp(page, `${productsBase(page)}/doesnotexist000`)
        await expect(page.getByTestId('product-not-found')).toContainText(
            "This product or service doesn't exist or was removed"
        )
        const notFoundBack = page.getByTestId('product-not-found-back')
        await expect(notFoundBack).toHaveText('Back to products and services')
        await notFoundBack.click()
        await expect(page.getByTestId('products-list')).toBeVisible()
        await expect(page.getByTestId('product-not-found')).toBeHidden()
    })
})
