import { expect, type Locator, type Page } from '@playwright/test'
import { accountItem, createAccount, openChart } from './account-register-helpers'
import { boxOf, type HeldWrite, holdWrite } from './record-form-helpers'
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

// Creates a number-less Expense account through the Chart of Accounts panel and returns
// its id, read from its chart row. Called at the desktop viewport (rows, not cards).
export async function createExpenseAccount(page: Page, name: string): Promise<string> {
    await openChart(page)
    await createAccount(page, name, { type: 'Expense', detailType: 'Advertising and marketing' })
    const testId = await accountItem(page, name).first().getAttribute('data-testid')
    const id = (testId ?? '').replace(/^account-row-/, '')
    expect(id).not.toBe('')
    return id
}

// True when `right` starts at or after the right edge of `left` and their vertical ranges
// overlap, so a label centred beside a taller control passes (`sideBySide` needs equal tops).
export async function besideCentered(left: Locator, right: Locator): Promise<boolean> {
    const [a, b] = await Promise.all([boxOf(left), boxOf(right)])
    if (!a || !b) return false
    const after = b.x >= a.x + a.width - 1
    const overlaps = a.y < b.y + b.height && b.y < a.y + a.height
    return after && overlaps
}

// The account's box select trigger in the 1099s section.
export function boxSelect(page: Page, id: string): Locator {
    return visible(page, `books-1099-box-select-${id}`)
}

// Opens the account's box select and presses the item whose text is `label`. Core
// SelectInput is a popover Menu: its items exist only while it is open.
export async function chooseBox(page: Page, id: string, label: string): Promise<void> {
    await boxSelect(page, id).click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toHaveCount(1)
    await item.click()
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0)
}

// The REST path of one account, where its update PATCHes.
export function accountRecordPath(id: string): string {
    return `/api/collections/books_accounts/records/${id}`
}

// Holds the next PATCH of one account (`holdWrite`).
export function holdAccountWrite(page: Page, id: string): Promise<HeldWrite> {
    return holdWrite(page, `**${accountRecordPath(id)}`, 'PATCH')
}

// Collects the body of every PATCH of one account the page sends from now on, held or not.
export function accountPatches(page: Page, id: string): string[] {
    const bodies: string[] = []
    page.on('request', request => {
        if (request.method() !== 'PATCH') return
        if (!new URL(request.url()).pathname.endsWith(accountRecordPath(id))) return
        bodies.push(request.postData() ?? '')
    })
    return bodies
}

// The visible 1099 vendors card read in one snapshot, because other specs track vendors
// too: the count line, the row ids and names in DOM order, and how many chips show
// Missing tax ID.
export async function trackedVendorsSnapshot(
    page: Page
): Promise<{ summary: string; names: string[]; ids: string[]; missing: number }> {
    const card = visible(page, 'books-1099-vendors')
    await expect(card).toHaveCount(1)
    return card.evaluate(el => {
        const all = (prefix: string) =>
            Array.from(el.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`))
        const rowPrefix = 'books-1099-vendor-row-'
        return {
            summary:
                el.querySelector('[data-testid="books-1099-vendors-summary"]')?.textContent ?? '',
            ids: all(rowPrefix).map(row => (row.dataset.testid ?? '').slice(rowPrefix.length)),
            names: all('books-1099-vendor-name-').map(name => name.textContent ?? ''),
            missing: all('books-1099-vendor-missing-').length,
        }
    })
}

export const EMPTY_LIST = { page: 1, perPage: 500, totalItems: 0, totalPages: 0, items: [] }

// Answers every list of `collection` with no rows. Realtime is aborted, so no event from
// other specs refills the collection after the empty answer lands.
export async function fakeEmptyList(page: Page, collection: string): Promise<void> {
    await page.route('**/api/realtime*', route => route.abort())
    await page.route(`**/api/collections/${collection}/records**`, async route => {
        if (route.request().method() !== 'GET') return route.continue()
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(EMPTY_LIST),
        })
    })
}
