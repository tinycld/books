import { expect, type Page, test } from '@playwright/test'
import {
    afterNextFrames,
    customerHelpers,
    customerPageUrl,
    customerSurface,
    DESKTOP,
    field,
    openBooks,
    openCustomer,
    openNewCustomer,
    sideBySide,
    uniqueName,
} from './customer-form-helpers'

// The sales tax fields of the customer form (checkpoint 8). The test creates its own
// customer through the form with `uniqueName` and edits no seeded row; it reads the
// seeded rates and groups (lib/tax-rates-fixture.ts) only to choose one. Desktop only:
// a phone runs the same form logic, and core SelectInput opens the same Menu.
//
// Not covered here: a stored inactive default (the options keep it: tests/
// tax-rate-options.test.ts), and the server's refusal of a missing or inactive default
// tax (Go tests).

const NEW_URL = /\/books\/customers\/new$/
const REASON_REQUIRED = 'Choose an exemption reason.'
const CERTIFICATE = 'CO-98-01234-0000'
// The client's words and the server's for a certificate number over 100 characters.
const TOO_LONG = /Exemption certificate number is too long|no more than 100/i

function exemptSwitch(page: Page) {
    return customerSurface(page).getByRole('switch', { name: 'This customer is tax exempt' })
}

// Every item of the open select of `key` (core names them `form-input-<key>-<value>`).
function selectItems(page: Page, key: string) {
    return page.locator(`[data-testid^="form-input-${key}-"]`)
}

test.describe('tax-rates: customer tax fields', () => {
    test('chooses a default sales tax, then marks the customer exempt, and the server asks for a reason', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openNewCustomer(page)
        const name = uniqueName('Exempt customer')
        await field(page, 'display_name').fill(name)

        const save = page.getByTestId('customer-save')
        const reasonCell = page.getByTestId('form-field-exemption_reason')
        const numberCell = page.getByTestId('form-field-exemption_number')
        const defaultCell = page.getByTestId('form-field-default_tax_rate')
        const defaultTax = page.getByTestId('form-input-default_tax_rate')
        const number = field(page, 'exemption_number')
        let posts = 0
        page.on('request', request => {
            const url = new URL(request.url())
            if (request.method() === 'POST' && customerHelpers.isRecordsUrl(url)) posts += 1
        })

        // Not exempt: no exemption fields; the default sales tax picker groups the rates
        // under their agency, then the groups, with None first.
        await expect(reasonCell).toHaveCount(0)
        await expect(numberCell).toHaveCount(0)
        await expect(defaultCell).toBeVisible()
        await defaultTax.click()
        await expect(
            page.getByRole('group', { name: 'Colorado Department of Revenue', exact: true })
        ).toBeVisible()
        await expect(page.getByRole('group', { name: 'Groups', exact: true })).toBeVisible()
        await expect(selectItems(page, 'default_tax_rate').first()).toHaveText('None')
        await page
            .getByRole('menuitem', { name: 'Adams County combined 3.65%', exact: true })
            .click()
        await expect(selectItems(page, 'default_tax_rate')).toHaveCount(0)
        await expect(defaultTax).toContainText('Adams County combined 3.65%')

        // Exempt: reason and certificate number side by side; no default sales tax.
        await exemptSwitch(page).click()
        await expect(exemptSwitch(page)).toBeChecked()
        await expect(reasonCell).toBeVisible()
        await expect(numberCell).toBeVisible()
        await expect.poll(() => sideBySide(reasonCell, numberCell)).toBe(true)
        await expect(defaultCell).toHaveCount(0)

        // Over 100 characters: the client stops the save, so the server is not asked for
        // a reason yet.
        const longNumber = 'A'.repeat(101)
        await number.fill(longNumber)
        await save.click()
        await expect(numberCell).toContainText(TOO_LONG)
        await afterNextFrames(page)
        expect(posts).toBe(0)
        await expect(reasonCell).not.toContainText(REASON_REQUIRED)
        await expect(page).toHaveURL(NEW_URL)

        // Not exempt again, the long number is hidden but still held. The server refuses
        // it, and the refusal shows where the user can see it, not only under the hidden
        // field.
        await exemptSwitch(page).click()
        await expect(exemptSwitch(page)).not.toBeChecked()
        await expect(numberCell).toHaveCount(0)
        await expect(customerSurface(page).getByText(TOO_LONG)).toHaveCount(0)
        await save.click()
        await expect(customerSurface(page).getByText(TOO_LONG).first()).toBeVisible()
        await expect(numberCell).toHaveCount(0)
        await expect(page).toHaveURL(NEW_URL)

        // Exempt with a valid number: the server refuses the save on the reason.
        await exemptSwitch(page).click()
        await expect(exemptSwitch(page)).toBeChecked()
        await expect(number).toHaveValue(longNumber)
        await number.fill(CERTIFICATE)
        await save.click()
        await expect(reasonCell).toContainText(REASON_REQUIRED)
        await expect(page).toHaveURL(NEW_URL)

        // With a reason, the save creates the customer and opens its page.
        await page.getByTestId('form-input-exemption_reason').click()
        await page.getByTestId('form-input-exemption_reason-resale').click()
        await expect(selectItems(page, 'exemption_reason')).toHaveCount(0)
        await expect(page.getByTestId('form-input-exemption_reason')).toContainText('Resale')
        await save.click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(page.getByTestId('customer-title')).toHaveText(name)

        await openCustomer(page, name)
        await expect(exemptSwitch(page)).toBeChecked()
        await expect(page.getByTestId('form-input-exemption_reason')).toContainText('Resale')
        await expect(number).toHaveValue(CERTIFICATE)
        await expect(defaultCell).toHaveCount(0)
    })
})
