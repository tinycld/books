import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { chooseTaxIdType, trackSwitch } from './vendor-1099-helpers'
import {
    DESKTOP,
    field,
    insertAnswered,
    openNewVendor,
    openVendor,
    openVendorsList,
    patchAnswered,
    searchVendors,
    uniqueName,
    vendorIdOf,
    vendorSurface,
} from './vendor-form-helpers'

// The vendor form's Track payments for 1099 toggle and the Legal name, Tax ID type and
// Tax ID fields it shows and hides, saved through the vendor form.
//
// Every vendor is created through the form with a unique name; no seeded vendor is
// edited. Desktop only: the form is the same code at every size (the core cell pair
// stacks by width, which the design review checks).
//
// Not covered here: read-only users cannot be driven in this file (checkpoint 7's
// read-only test is in books-settings.spec.ts, which owns the collaborator). The
// client does not check the tax ID's format; the server decides, so this spec reads
// the server's refusals. The field order, half widths, hints and option labels are
// tests/vendor-host.test.ts, tests/tax-id.test.ts and the design review; the discard
// question is the vendor form's, driven by the vendor-form: specs.

const REFUSAL_DIGITS = 'A tax ID has 9 digits.'
const REFUSAL_TYPE = 'Choose whether the tax ID is an EIN or an SSN.'
const DETAIL_KEYS = ['legal_name', 'tax_id_type', 'tax_id'] as const

const cell = (page: Page, key: string) => vendorSurface(page).getByTestId(`form-field-${key}`)

async function expectDetailsHidden(page: Page) {
    for (const key of DETAIL_KEYS) await expect(cell(page, key)).toHaveCount(0)
}

async function expectDetailsShown(page: Page) {
    for (const key of DETAIL_KEYS) await expect(cell(page, key)).toBeVisible()
}

async function expectListShown(page: Page) {
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(vendorSurface(page)).toBeHidden()
}

async function openBooksAtDesktop(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('vendor-1099: vendor form', () => {
    test('tracks a vendor for 1099 and stores its tax ID dashed', async ({ page }) => {
        await openBooksAtDesktop(page)
        await openNewVendor(page)
        const name = uniqueName(page, 'Tracked form')
        await field(page, 'display_name').fill(name)

        // Off by default: the switch shows, the 1099 details do not.
        await expect(trackSwitch(page)).toBeVisible()
        await expectDetailsHidden(page)

        // Turning tracking on shows the details at once.
        await trackSwitch(page).click()
        await expectDetailsShown(page)
        // react-native-web draws the number-pad keyboard as inputmode numeric.
        await expect(field(page, 'tax_id')).toHaveAttribute('inputmode', 'numeric')

        await chooseTaxIdType(page, 'EIN (business)')
        await field(page, 'legal_name').fill(`  ${name} LLC  `)
        await field(page, 'tax_id').fill('12 345-6789')
        const inserted = insertAnswered(page)
        await page.getByTestId('vendor-save').click()
        expect((await inserted).status()).toBe(200)
        await expectListShown(page)

        // Read after the server answered, so the optimistic row cannot stand in for the
        // stored, normalized one.
        await openVendorsList(page)
        await searchVendors(page, name)
        const id = await vendorIdOf(page, name)
        await openVendor(page, name)
        await expect(field(page, 'tax_id')).toHaveValue('12-3456789')
        await expect(field(page, 'legal_name')).toHaveValue(`${name} LLC`)
        await expect(field(page, 'tax_id_type')).toContainText('EIN (business)')

        // Tracking off hides the details; the save keeps tracking off.
        await trackSwitch(page).click()
        await expectDetailsHidden(page)
        const patched = patchAnswered(page, id)
        await page.getByTestId('vendor-save').click()
        expect((await patched).status()).toBe(200)
        await expectListShown(page)

        await openVendor(page, name)
        await expect(trackSwitch(page)).toBeVisible()
        await expectDetailsHidden(page)

        // The stored details were kept while hidden.
        await trackSwitch(page).click()
        await expectDetailsShown(page)
        await expect(field(page, 'tax_id')).toHaveValue('12-3456789')
        await expect(field(page, 'legal_name')).toHaveValue(`${name} LLC`)
    })

    test('refuses a tax ID that is not 9 digits or has no type', async ({ page }) => {
        await openBooksAtDesktop(page)
        await openNewVendor(page)
        const name = uniqueName(page, 'Refused form')
        await field(page, 'display_name').fill(name)
        await trackSwitch(page).click()
        await expectDetailsShown(page)

        await field(page, 'tax_id').fill('12345')
        await page.getByTestId('vendor-save').click()
        await expect(cell(page, 'tax_id')).toContainText(REFUSAL_DIGITS)
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page).toHaveURL(/\/books\/vendors\/new$/)

        await field(page, 'tax_id').fill('123456789')
        await page.getByTestId('vendor-save').click()
        await expect(cell(page, 'tax_id_type')).toContainText(REFUSAL_TYPE)
        await expect(vendorSurface(page)).toBeVisible()
        // The new answer replaces the last one.
        await expect(cell(page, 'tax_id')).not.toContainText(REFUSAL_DIGITS)

        // Tracking off hides the details but keeps their values, so the server still
        // refuses the tax ID; with no cell to show it, the form's summary does.
        await field(page, 'tax_id').fill('12345')
        await trackSwitch(page).click()
        await expectDetailsHidden(page)
        await page.getByTestId('vendor-save').click()
        await expect(vendorSurface(page).getByTestId('form-error-summary')).toContainText(
            REFUSAL_DIGITS
        )
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page).toHaveURL(/\/books\/vendors\/new$/)

        await trackSwitch(page).click()
        await expectDetailsShown(page)
        await field(page, 'tax_id').fill('123456789')
        await chooseTaxIdType(page, 'SSN or ITIN (person)')
        const inserted = insertAnswered(page)
        await page.getByTestId('vendor-save').click()
        expect((await inserted).status()).toBe(200)
        await expectListShown(page)

        await openVendor(page, name)
        await expect(field(page, 'tax_id')).toHaveValue('123-45-6789')
    })
})
