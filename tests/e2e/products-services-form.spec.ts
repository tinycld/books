import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    afterNextFrames,
    createProduct,
    DESKTOP,
    discardDialog,
    field,
    isRecordsUrl,
    openChooser,
    openNewProduct,
    openProduct,
    pickOption,
    productEntry,
    productSurface,
    purchasesSwitch,
    searchProducts,
    selectItems,
    stampDigits,
    uniqueName,
} from './products-services-helpers'

// The product form: create, change of type, and the refusals of a save. Each test
// creates its products through the form with `uniqueName`; no seeded product is edited.
// Every test runs on desktop only: the form's create, type and refusal logic is the same
// code on a phone (the phone layout is checkpoint 10's test 4).
//
// Not covered here: read-only users (the disabled chooser, the reader's titles and the
// Close-only footer) cannot be driven, because no read-only Books member is seeded;
// `chosenProductType`, `productTitle` and `recordFooter` are unit-tested. The e2e book has
// no Product sales and no Cost of goods sold account, so the Non-inventory income default
// and the expense default are tests/product-defaults.test.ts.

const CONSULTING_INCOME = '4000 Consulting Income'
const SOFTWARE = '6200 Software Subscriptions'
const PURCHASE_FIELDS = ['purchase_description', 'cost', 'expense_account'] as const

async function openBooksAtDesktop(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function purchaseCells(page: Page) {
    return PURCHASE_FIELDS.map(key => page.getByTestId(`form-field-${key}`))
}

const NEW_URL = /\/books\/products\/new(\?|$)/

test.describe('products-services: product form', () => {
    test('creates a service through the chooser and Save and new keeps the type (desktop)', async ({
        page,
    }) => {
        await openBooksAtDesktop(page)
        const title = page.getByTestId('product-title')

        // The chooser's footer has Cancel only.
        await openChooser(page)
        await expect(page.getByTestId('product-cancel')).toBeVisible()
        await expect(page.getByTestId('product-save')).toHaveCount(0)

        // A row replaces the chooser with the form in place: Back returns to the list.
        await page.getByTestId('product-type-service').click()
        await expect(title).toHaveText('New service')
        expect(new URL(page.url()).pathname).toMatch(/\/books\/products\/new$/)
        expect(new URL(page.url()).searchParams.get('type')).toBe('service')
        await page.goBack()
        await expect(page.getByTestId('products-list')).toBeVisible()
        await expect(page).toHaveURL(/\/books\/products$/)
        await expect(page.getByTestId('product-type-chooser')).toBeHidden()

        await openNewProduct(page, 'service')
        await expect(page.getByTestId('form-input-type')).toContainText('Service')
        await expect(page.getByTestId('form-input-income_account')).toContainText(CONSULTING_INCOME)
        const name = uniqueName(page, 'Svc')
        await field(page, 'name').fill(name)
        await field(page, 'price').fill('1250')
        await field(page, 'price').press('Tab')
        await expect(field(page, 'price')).toHaveValue('1,250.00')

        const insert = page.waitForRequest(
            r => r.method() === 'POST' && isRecordsUrl(new URL(r.url()))
        )
        await page.getByTestId('product-save-new').click()
        const body = (await insert).postDataJSON()
        expect(body.type).toBe('service')
        expect(body.price).toBe(125000)
        expect(body.name).toBe(name)
        expect(body.income_account).toEqual(expect.any(String))
        expect(body.income_account).not.toBe('')
        expect(body.form).toEqual(expect.any(String))
        expect(body.form).not.toBe('')

        // Save and new stays on a new form of the same type, emptied.
        await expect(title).toHaveText('New service')
        await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('service')
        await expect(field(page, 'name')).toHaveValue('')
        await expect(field(page, 'price')).toHaveValue('')
        await expect(page.getByTestId('form-input-type')).toContainText('Service')

        await page.getByTestId('product-cancel').click()
        await expect(page.getByTestId('products-list')).toBeVisible()
        await searchProducts(page, name)
        const saved = productEntry(page, name)
        await expect(saved).toContainText('Service')
        await expect(saved).toContainText('$1,250.00')
    })

    test('changes Service to Non-inventory and shows the purchasing fields with the toggle (desktop)', async ({
        page,
    }) => {
        await openBooksAtDesktop(page)
        const title = page.getByTestId('product-title')
        const expense = page.getByTestId('form-input-expense_account')
        const expenseItems = selectItems(page, 'expense_account')

        await openNewProduct(page, 'service')
        const name = uniqueName(page, 'Part')
        const sku = `SKU-${stampDigits()}`
        await field(page, 'name').fill(name)
        await field(page, 'sku').fill(sku)

        // Purchasing off: the default rule hides the purchase fields.
        for (const cell of purchaseCells(page)) await expect(cell).toHaveCount(0)
        await purchasesSwitch(page).click()
        for (const cell of purchaseCells(page)) await expect(cell).toBeVisible()

        // The seed has no Cost of goods sold account, so the expense default is empty and
        // the account picked here is not a default.
        await expense.click()
        await expect(expenseItems.first()).toHaveText('None')
        await expect(expenseItems.filter({ hasText: SOFTWARE })).not.toHaveCount(0)
        await expect(expenseItems.filter({ hasText: '1100 Accounts receivable' })).toHaveCount(0)
        await expect(expenseItems.filter({ hasText: '6900 Old Petty Cash' })).toHaveCount(0)
        await expenseItems.filter({ hasText: new RegExp(`^\\s*${SOFTWARE}\\s*$`) }).click()
        await expect(expenseItems).toHaveCount(0)
        await expect(expense).toContainText(SOFTWARE)

        await field(page, 'cost').fill('310')
        await field(page, 'cost').press('Tab')
        await expect(field(page, 'cost')).toHaveValue('310.00')

        // Changing the type keeps every value, the picked expense account too.
        await pickOption(page, 'type', 'Non-inventory')
        await expect(title).toHaveText('New non-inventory item')
        await expect(field(page, 'name')).toHaveValue(name)
        await expect(field(page, 'sku')).toHaveValue(sku)
        await expect(page.getByTestId('form-input-income_account')).toContainText(CONSULTING_INCOME)
        for (const cell of purchaseCells(page)) await expect(cell).toBeVisible()
        await expect(field(page, 'cost')).toHaveValue('310.00')
        await expect(expense).toContainText(SOFTWARE)

        // Off hides the three; on again shows the values kept.
        await purchasesSwitch(page).click()
        for (const cell of purchaseCells(page)) await expect(cell).toHaveCount(0)
        await purchasesSwitch(page).click()
        await expect(field(page, 'cost')).toHaveValue('310.00')
        await expect(expense).toContainText(SOFTWARE)

        await page.getByTestId('product-save').click()
        await expect(page.getByTestId('products-list')).toBeVisible()

        await openProduct(page, name)
        await expect(title).toHaveText('Edit non-inventory item')
        await expect(page.getByTestId('form-input-type')).toContainText('Non-inventory')
        await expect(field(page, 'cost')).toHaveValue('310.00')
        await expect(expense).toContainText(SOFTWARE)
        await page.getByTestId('product-cancel').click()
    })

    test('refuses values the save must not write: a bad amount and a duplicate name (desktop)', async ({
        page,
    }) => {
        await openBooksAtDesktop(page)
        const name = uniqueName(page, 'Dup')
        await createProduct(page, { type: 'service', name })

        await openNewProduct(page, 'service')
        let posts = 0
        page.on('request', request => {
            if (request.method() === 'POST' && isRecordsUrl(new URL(request.url()))) posts += 1
        })
        const nameCell = page.getByTestId('form-field-name')
        const priceCell = page.getByTestId('form-field-price')
        const price = field(page, 'price')

        // Name is required.
        await page.getByTestId('product-save').click()
        await expect(nameCell).toContainText('Name is required')
        await expect(page).toHaveURL(NEW_URL)

        // A malformed amount blocks the save, and the input keeps the typed text.
        const upper = name.toUpperCase()
        await field(page, 'name').fill(upper)
        await price.fill('abc')
        await page.getByTestId('product-save').click()
        await afterNextFrames(page)
        expect(posts).toBe(0)
        await expect(priceCell).toContainText('Enter an amount such as 1,250.00')
        await expect(price).toHaveValue('abc')
        await expect(page).toHaveURL(NEW_URL)

        // A negative amount blocks the save too.
        await price.fill('-5')
        await page.getByTestId('product-save').click()
        await afterNextFrames(page)
        expect(posts).toBe(0)
        await expect(priceCell).toContainText('Enter an amount of 0 or more')

        await price.fill('12')
        await price.press('Tab')
        await expect(priceCell).not.toContainText('Enter an amount such as 1,250.00')
        await expect(priceCell).not.toContainText('Enter an amount of 0 or more')

        // The server refuses the duplicate name (any case) on the Name field.
        await page.getByTestId('product-save').click()
        await expect.poll(() => posts).toBe(1)
        await expect(nameCell).toContainText(
            `A product or service named “${upper}” already exists.`
        )
        await expect(page.getByTestId('form-error-summary')).toBeHidden()
        await expect(productSurface(page)).toBeVisible()

        await page.getByTestId('product-cancel').click()
        await discardDialog(page).discard.click()
        await expect(page.getByTestId('products-list')).toBeVisible()
    })
})
