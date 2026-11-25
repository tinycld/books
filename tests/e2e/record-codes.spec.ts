import { expect, type Page, test } from '@playwright/test'
import {
    customerHelpers,
    DESKTOP,
    navigateInApp,
    openBooks,
    PHONE,
    uniqueName,
} from './customer-form-helpers'
import { openNewInvoice } from './invoice-helpers'
import { openNewProduct, field as productField } from './products-services-helpers'
import { recordIdFromUrl } from './record-key-helpers'
import { openNewVendor, field as vendorField } from './vendor-form-helpers'

// Record codes (help: customers, vendors, products-services): the name of a new record
// suggests its code, a taken code is refused on its field, pickers find a record by its
// code, and a code URL opens the record and follows a code change.

const CODE = /^[A-Z0-9][A-Z0-9-]{1,14}$/

// Codes are unique per collection and the run shares one database, so each name starts
// two words with letters no seeded record or other spec puts first: its initials are QZ.
function qzName(tag: string) {
    const stamp = uniqueName(tag).replace(/\W/g, '')
    return `Qa${stamp} Zb${stamp}`
}

async function shownCode(page: Page) {
    const code = page.getByTestId('customer-code').filter({ visible: true })
    await expect(code).toHaveText(CODE)
    return ((await code.textContent()) ?? '').trim()
}

test.describe('record codes', () => {
    test.beforeEach(async ({ page }) => {
        await openBooks(page, DESKTOP)
    })

    test('a new customer suggests a code and the next one skips it', async ({ page }) => {
        await customerHelpers.openNew(page)
        await customerHelpers.field(page, 'display_name').fill(qzName('one'))
        const code = customerHelpers.field(page, 'code')
        await expect(code).toHaveValue(/^QZ(-\d+)?$/)
        const first = await code.inputValue()
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(new RegExp(`/books/customers/${first}(\\?|$)`))
        await expect(page.getByTestId('customer-code').filter({ visible: true })).toHaveText(first)

        await customerHelpers.openNew(page)
        await customerHelpers.field(page, 'display_name').fill(qzName('two'))
        await expect(customerHelpers.field(page, 'code')).toHaveValue(/^QZ-\d+$/)
        await expect(customerHelpers.field(page, 'code')).not.toHaveValue(first)
    })

    test('a code the user typed stays when the name changes', async ({ page }) => {
        await customerHelpers.openNew(page)
        const name = customerHelpers.field(page, 'display_name')
        const code = customerHelpers.field(page, 'code')
        await name.fill(qzName('typed'))
        await expect(code).toHaveValue(/^QZ/)
        await code.fill('mine-1')
        await expect(code).toHaveValue('MINE-1')
        await name.fill(qzName('renamed'))
        await expect(code).toHaveValue('MINE-1')
        await code.fill('')
        await name.fill(qzName('again'))
        await expect(code).toHaveValue(/^QZ/)
    })

    test('a taken code shows the field error', async ({ page }) => {
        await customerHelpers.create(page, { name: qzName('taken') })
        const taken = await shownCode(page)
        await customerHelpers.openNew(page)
        await customerHelpers.field(page, 'display_name').fill(uniqueName('Other'))
        await customerHelpers.field(page, 'code').fill(taken)
        await page.getByTestId('customer-save').click()
        await expect(
            page.getByText(`Another customer has the code ${taken}.`).first()
        ).toBeVisible()
    })

    test('changing a code moves the URL to the new code', async ({ page }) => {
        await customerHelpers.create(page, { name: qzName('edit') })
        const id = await recordIdFromUrl(page, 'customers')
        const fresh = `QY${Date.now().toString(36).toUpperCase()}`.slice(0, 15)
        await page.getByTestId('customer-tab-details').filter({ visible: true }).click()
        await customerHelpers.field(page, 'code').fill(fresh)
        await page.getByTestId('customer-save').filter({ visible: true }).click()
        await customerHelpers.expectEditSaved(page)
        await expect(page).toHaveURL(new RegExp(`/books/customers/${fresh}(\\?|$)`))
        await expect(page.getByTestId('customer-code').filter({ visible: true })).toHaveText(fresh)
        expect(await recordIdFromUrl(page, 'customers')).toBe(id)
    })

    test('a lowercase code URL opens the record', async ({ page }) => {
        await customerHelpers.create(page, { name: qzName('lower') })
        const code = await shownCode(page)
        const base = customerHelpers.base(page)
        await customerHelpers.openList(page)
        await navigateInApp(page, `${base}/${code.toLowerCase()}`)
        await expect(page).toHaveURL(new RegExp(`/books/customers/${code}(\\?|$)`, 'i'))
        await expect(page.getByTestId('customer-code').filter({ visible: true })).toHaveText(code)
    })

    test('the invoice customer picker finds a customer by its code', async ({ page }) => {
        const name = qzName('pick')
        await customerHelpers.create(page, { name })
        const code = await shownCode(page)
        await openNewInvoice(page)
        await page.getByTestId('form-input-customer').filter({ visible: true }).click()
        const search = page.getByTestId('form-input-customer-search')
        await expect(search).toBeFocused()
        await search.fill(code.toLowerCase())
        await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
    })

    test('a new vendor shows a suggested code', async ({ page }) => {
        await openNewVendor(page)
        await vendorField(page, 'display_name').fill(qzName('vendor'))
        await expect(vendorField(page, 'code')).toHaveValue(CODE)
    })

    test('a new product shows a suggested code', async ({ page }) => {
        await openNewProduct(page, 'service')
        await productField(page, 'name').fill(qzName('product'))
        await expect(productField(page, 'code')).toHaveValue(CODE)
    })

    test('the customer cards show the code at phone width', async ({ page }) => {
        const name = qzName('phone')
        await customerHelpers.create(page, { name })
        const code = await shownCode(page)
        await customerHelpers.openList(page)
        await page.setViewportSize(PHONE)
        await customerHelpers.search(page, code)
        const id = await customerHelpers.idOf(page, name)
        await expect(page.getByTestId(`customer-code-${id}`)).toHaveText(code)
    })
})
