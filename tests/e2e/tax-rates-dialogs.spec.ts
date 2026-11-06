import { expect, type Locator, test } from '@playwright/test'
import {
    agencyCardByName,
    createAgency,
    DESKTOP,
    dialogByTitle,
    fakeEmptyAgencies,
    openBooksPage,
    openTaxes,
    PHONE,
    rowByName,
    uniqueName,
} from './tax-rates-helpers'

// The agency and rate dialogs (checkpoint 5). Each test adds its own agency and rate
// with `uniqueName`; the duplicate-name refusals name seeded rows ("Colorado state",
// "Colorado Department of Revenue") without editing them. The empty state is faked on
// a fresh page, because the shared database always has agencies.

const AGENCIES_PATH = '/api/collections/books_tax_agencies/records'

// The message shows directly under the input: below its bottom edge, within one line's
// gap, and starting at its left edge, so it is the field's own error and not the summary
// or another field's.
async function expectErrorUnder(scope: Locator, input: Locator, message: string) {
    const error = scope.getByText(message, { exact: true })
    await expect(error).toBeVisible()
    await expect
        .poll(async () => {
            const [field, text] = await Promise.all([input.boundingBox(), error.boundingBox()])
            if (!field || !text) return false
            const gap = text.y - (field.y + field.height)
            return gap >= 0 && gap <= 24 && Math.abs(text.x - field.x) <= 1
        })
        .toBe(true)
}

// Text that is not only white space: the preview line is blank while the rate is invalid.
function withText(locator: Locator) {
    return locator.filter({ hasText: /\S/ })
}

test.describe('tax-rates: agency and rate dialogs', () => {
    test('adds the first agency from the empty state', async ({ page }) => {
        const fresh = await openBooksPage(page, DESKTOP, fakeEmptyAgencies)
        await fresh.getByTestId('books-nav-taxes').click()
        await expect(fresh.getByTestId('taxes-empty')).toContainText(
            'Which agencies do you collect sales tax for?'
        )

        await fresh.getByTestId('taxes-empty-add-agency').click()
        const dialog = dialogByTitle(fresh, 'Add agency')
        await expect(dialog).toBeVisible()
        await expect(fresh.getByTestId('tax-agency-form-account')).toHaveText(
            '2200 Sales tax payable'
        )
        const name = fresh.getByTestId('tax-agency-form-name')
        await expect(name).toBeFocused()
        await name.fill(uniqueName('Tax agency empty'))

        const created = fresh.waitForResponse(
            response =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname.endsWith(AGENCIES_PATH)
        )
        await fresh.getByTestId('tax-agency-form-save').click()
        expect((await created).status()).toBe(200)
        await expect(dialog).toBeHidden()
    })

    test('adds a rate from an agency card, with the live tax line', async ({ page }) => {
        await openTaxes(page)
        const agencyName = uniqueName('Tax agency rate')
        const agencyId = await createAgency(page, agencyName)
        const card = page.getByTestId(`tax-agency-card-${agencyId}`)
        const noRates = card.getByTestId(`tax-agency-no-rates-${agencyId}`)
        await expect(noRates).toHaveText('No rates yet.')

        await page.getByTestId(`tax-agency-add-rate-${agencyId}`).click()
        const dialog = dialogByTitle(page, 'Add rate')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('tax-rate-form-agency')).toHaveText(agencyName)

        const name = page.getByTestId('tax-rate-form-name')
        await expect(name).toBeFocused()
        await name.fill('colorado state')
        const percent = page.getByTestId('tax-rate-form-percent')
        const preview = page.getByTestId('tax-rate-form-preview')
        await percent.fill('8.875')
        await expect(preview).toHaveText('Tax on $100.00: $8.88')
        await percent.fill('8.88888')
        await expect(withText(preview)).toHaveCount(0)
        await percent.fill('8.875')
        await expect(preview).toHaveText('Tax on $100.00: $8.88')

        const save = page.getByTestId('tax-rate-form-save')
        await save.click()
        await expectErrorUnder(
            dialog,
            name,
            'A tax rate or group named “colorado state” already exists.'
        )
        await expect(dialog).toBeVisible()

        const rateName = uniqueName('Card rate')
        await name.fill(rateName)
        await save.click()
        await expect(dialog).toBeHidden()
        await expect(rowByName(card, rateName).locator('[data-testid^="tax-percent-"]')).toHaveText(
            '8.875%'
        )
        await expect(noRates).toHaveCount(0)
    })

    // On a phone core Dialog renders a Sheet (other code than the wide dialog).
    test('adds a rate in a bottom sheet on a phone', async ({ page }) => {
        await openTaxes(page)
        const agencyId = await createAgency(page, uniqueName('Tax agency phone'))
        await page.setViewportSize(PHONE)

        const card = page.getByTestId(`tax-agency-card-${agencyId}`)
        await expect
            .poll(async () => {
                const box = await card.boundingBox()
                if (!box) return false
                return box.x >= 16 && box.x + box.width <= PHONE.width - 16
            })
            .toBe(true)

        const addRate = page.getByTestId(`tax-agency-add-rate-${agencyId}`)
        // Centered, so the page's floating New button never covers it.
        await addRate.evaluate(el => el.scrollIntoView({ block: 'center' }))
        await addRate.click()
        const sheet = dialogByTitle(page, 'Add rate')
        await expect(sheet).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)

        const name = page.getByTestId('tax-rate-form-name')
        await expect(name).toBeFocused()
        const rateName = uniqueName('Phone rate')
        await name.fill(rateName)
        // Many locales' decimal keypad has a comma as its decimal key.
        await page.getByTestId('tax-rate-form-percent').fill('0,75')
        await expect(page.getByTestId('tax-rate-form-preview')).toHaveText('Tax on $100.00: $0.75')
        await page.getByTestId('tax-rate-form-save').click()
        await expect(sheet).toBeHidden()
        await expect(rowByName(card, rateName).locator('[data-testid^="tax-percent-"]')).toHaveText(
            '0.75%'
        )
    })

    test('refuses a duplicate agency name under Name', async ({ page }) => {
        await openTaxes(page)
        await page.getByTestId('taxes-add-agency').click()
        const dialog = dialogByTitle(page, 'Add agency')
        await expect(dialog).toBeVisible()
        const name = page.getByTestId('tax-agency-form-name')
        await expect(name).toBeFocused()
        await name.fill('colorado department of revenue')
        await page.getByTestId('tax-agency-form-save').click()

        await expectErrorUnder(
            dialog,
            name,
            'An agency named “colorado department of revenue” already exists.'
        )
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('tax-agency-form-errors')).toBeHidden()
        await expect(agencyCardByName(page, 'colorado department of revenue')).toHaveCount(0)
    })
})
