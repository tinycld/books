import { expect, type Locator, type Page } from '@playwright/test'
import {
    field,
    insertAnswered,
    openNewVendor,
    searchVendors,
    vendorIdOf,
    vendorSurface,
} from './vendor-form-helpers'

// Shared by the vendor-1099 e2e specs. Tracked vendors are created by driving the vendor
// form with a unique name; a spec never edits a seeded vendor.

// A screen covered in the navigation stack stays mounted but hidden, so only the visible
// match counts (as the settings spec's `id`).
export function visible(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// Opens Settings → 1099s at desktop through the rail, and waits for the section to show
// one of its parts: the section, its loading state or its load error.
export async function openForm1099(page: Page): Promise<void> {
    await visible(page, 'books-nav-settings').click()
    await visible(page, 'books-settings-section-form-1099').click()
    await expect(
        visible(page, 'books-1099-section')
            .or(visible(page, 'books-1099-loading'))
            .or(visible(page, 'books-1099-error'))
    ).toBeVisible()
}

// The Tax ID type options as the select draws them.
export const TAX_ID_TYPE_LABEL = { ein: 'EIN (business)', ssn: 'SSN or ITIN (person)' } as const

// The vendor form's Track payments for 1099 switch (core Toggle: role switch, named by
// its label).
export function trackSwitch(page: Page): Locator {
    return vendorSurface(page).getByRole('switch', { name: 'Track payments for 1099' })
}

// Opens the Tax ID type select and presses the item whose text is `label`. Core
// SelectInput is a popover Menu: its items exist only while it is open.
export async function chooseTaxIdType(page: Page, label: string): Promise<void> {
    await field(page, 'tax_id_type').click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toHaveCount(1)
    await item.click()
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0)
}

// Creates a vendor tracked for 1099 through the New vendor form, waits for the server
// to store it and for the list to show, and returns its id.
export async function createTrackedVendor(
    page: Page,
    values: {
        name: string
        legalName?: string
        taxIdType?: keyof typeof TAX_ID_TYPE_LABEL
        taxId?: string
    }
): Promise<string> {
    await openNewVendor(page)
    await field(page, 'display_name').fill(values.name)
    await trackSwitch(page).click()
    await expect(vendorSurface(page).getByTestId('form-field-tax_id')).toBeVisible()
    if (values.legalName !== undefined) await field(page, 'legal_name').fill(values.legalName)
    if (values.taxIdType !== undefined) {
        await chooseTaxIdType(page, TAX_ID_TYPE_LABEL[values.taxIdType])
    }
    if (values.taxId !== undefined) await field(page, 'tax_id').fill(values.taxId)
    const inserted = insertAnswered(page)
    await page.getByTestId('vendor-save').click()
    expect((await inserted).status()).toBe(200)
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(vendorSurface(page)).toBeHidden()
    await searchVendors(page, values.name)
    return vendorIdOf(page, values.name)
}
