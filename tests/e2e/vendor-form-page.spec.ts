import { expect, type Locator, type Page, test } from '@playwright/test'
import { VENDOR_IDS } from '../../tinycld/books/lib/vendor-form-fixture'
import {
    DESKTOP,
    discardDialog,
    field,
    navigateInApp,
    openBooks,
    openNewVendor,
    openVendor,
    openVendorsList,
    vendorsBase,
} from './vendor-form-helpers'

// The vendor page (the surface below 1360 px): one test per user goal that drives
// vendor-specific code. It reads the vendors `seed.ts` writes (lib/vendor-form-fixture.ts)
// and saves none of them: no form here is saved, so no test creates a row. Every test runs
// on desktop only, because none of them runs other code at a phone size.
//
// Pruned to fit the e2e budget (vendor-form-checkpoints.md, "E2E budget"): the New menu
// entry (tests/shell-nav.test.ts covers `NEW_ACTIONS`), the new-form layout (gate 2 and
// tests/vendor-host.test.ts's widths cover it), and Escape on a new vendor, the reload, and
// the deep link and Back (shared RecordChild / RecordByIdScreen behavior, which the
// customer-form specs drive through the same shared parts).
//
// Not covered here: a read-only user (the "Vendor" title and read-only fields) cannot be
// driven, because the seed has no read-only Books member; tests/record-display.test.ts
// covers `recordTitle`. The native keyboards (email, phone, URL) and the iOS swipe back
// and Android hardware back are native-only and are not run. Admin custom fields and the record's own form are covered by
// tests/vendor-host.test.ts (`insertCustomBefore: 'notes'`), core
// core/components/forms-builder/__tests__/canvas.test.tsx ("a new field lands before
// the host slot") and core core/ui/forms/__tests__/use-form-edit.test.tsx (`useFormEdit`
// edits on the form `record[host.formColumn]` names, and on the default form when that
// form is missing). The panel surface is checkpoint 9.

const OFFICE_SUPPLY = 'Office Supply World'
const PACIFIC_POWER = 'Pacific Power'
const DESIGN_TOOLS = '6210 Design Tools'
const SOFTWARE = '6200 Software Subscriptions'
const TERM_LABELS = ['None', 'Due on receipt', 'Net 10', 'Net 15', 'Net 30', 'Net 60']

function locators(page: Page) {
    return {
        title: page.getByTestId('vendor-title'),
        back: page.getByTestId('vendor-back'),
        terms: page.getByTestId('form-input-terms'),
        expense: page.getByTestId('form-input-expense_account'),
        termItems: selectItems(page, 'terms'),
        expenseItems: selectItems(page, 'expense_account'),
    }
}

async function expectListShown(page: Page) {
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(page.getByTestId('vendor-page')).toBeHidden()
}

// The items of a select menu, without its trigger: core SelectInput names each item
// `${testID}-${value}`.
function selectItems(page: Page, key: string) {
    return page.locator(`[data-testid^="form-input-${key}-"]`)
}

function itemTexts(items: Locator) {
    return items.evaluateAll(els => els.map(el => el.textContent ?? ''))
}

// Each item's text and the left edge of its label (the item's innermost element that
// holds text), so an indent drawn before the label shows as a larger left edge.
function itemLabels(items: Locator) {
    return items.evaluateAll(els =>
        els.map(el => {
            const label = [...el.querySelectorAll('*')].find(
                node => node.childElementCount === 0 && (node.textContent ?? '') !== ''
            )
            return {
                text: el.textContent ?? '',
                left: label ? label.getBoundingClientRect().left : null,
            }
        })
    )
}

// Where 6210 Design Tools sits against its parent, 6200: after it, with the plain label
// (no leading spaces), and inset by core's menu indent (12 px a level) rather than by text.
async function designToolsPlacement(items: Locator) {
    const labels = await itemLabels(items)
    const parentAt = labels.findIndex(item => item.text === SOFTWARE)
    const childAt = labels.findIndex(item => item.text.trim() === DESIGN_TOOLS)
    const parentLeft = labels[parentAt]?.left
    const childLeft = labels[childAt]?.left
    return {
        parentFound: parentAt >= 0,
        childAfterParent: childAt > parentAt,
        childText: labels[childAt]?.text,
        childInset: parentLeft != null && childLeft != null ? childLeft - parentLeft >= 12 : false,
    }
}

// Types first and last name, which makes the new form dirty.
async function typeNames(page: Page) {
    await page.getByTestId('form-input-first_name').fill('Grace')
    await page.getByTestId('form-input-last_name').fill('Liu')
    await page.getByTestId('form-input-last_name').press('Tab')
}

test.describe('vendor-form: vendor page and form', () => {
    // Steps (5), (7) and (8).
    test('fills a new vendor without filling Display name, and offers terms and expense accounts (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { title, terms, expense, termItems, expenseItems } = locators(page)
        await openNewVendor(page)

        // (5) Nothing fills Display name from the name parts.
        await typeNames(page)
        await expect(page.getByTestId('form-input-display_name')).toHaveValue('')

        // (7) Payment terms: None, then the terms in order. Escape closes the menu only:
        // the form is dirty from (5), so an Escape that reached the surface would ask.
        await expect(terms).toContainText('None')
        await terms.click()
        await expect(termItems.first()).toBeVisible()
        await expect.poll(() => itemTexts(termItems)).toEqual(TERM_LABELS)
        await page.keyboard.press('Escape')
        await expect(termItems).toHaveCount(0)
        await expect(discardDialog(page).title).toBeHidden()
        await expect(title).toHaveText('New vendor')

        // (8) Default expense account: None, then the active non-A/R accounts in chart
        // order, a child after its parent; the inactive account is not offered.
        await expect(expense).toContainText('None')
        await expense.click()
        await expect(expenseItems.first()).toHaveText('None')
        await expect(expenseItems.filter({ hasText: '1500 Office Equipment' })).toHaveCount(1)
        await expect(expenseItems.filter({ hasText: '6100 Rent' })).toHaveCount(1)
        await expect
            .poll(() => designToolsPlacement(expenseItems))
            .toEqual({
                parentFound: true,
                childAfterParent: true,
                childText: DESIGN_TOOLS,
                childInset: true,
            })
        await expect(expenseItems.filter({ hasText: '1100 Accounts receivable' })).toHaveCount(0)
        await expect(expenseItems.filter({ hasText: '6900 Old Petty Cash' })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(expenseItems).toHaveCount(0)
    })

    // Step (11).
    test('opens a seeded vendor from its row with its values (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { title, back, terms, expense } = locators(page)

        await openVendor(page, OFFICE_SUPPLY)
        await expect(page).toHaveURL(new RegExp(`/books/vendors/${VENDOR_IDS.officeSupply}$`))
        await expect(title).toHaveText('Edit vendor')
        await expect(field(page, 'display_name')).toHaveValue(OFFICE_SUPPLY)
        await expect(page.getByTestId('form-input-address-line1')).toHaveValue(
            '4120 Commerce Boulevard'
        )
        await expect(terms).toContainText('Net 15')
        await expect(field(page, 'account_number')).toHaveValue('1234567')
        // The trigger shows the plain label: the indent belongs to the menu only.
        await expect.poll(() => expense.textContent()).toBe(DESIGN_TOOLS)
        await expect(page.getByTestId('vendor-cancel')).toBeVisible()
        await expect(page.getByTestId('vendor-save')).toBeVisible()
        await expect(page.getByTestId('vendor-save-new')).toHaveCount(0)
        // Back keeps the list's search text.
        await back.click()
        await expectListShown(page)
        await expect(page.getByTestId('vendors-search')).toHaveValue(OFFICE_SUPPLY)
    })

    // Step (12).
    test('shows a stored expense account that became inactive without offering it (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { terms, expense, expenseItems } = locators(page)

        await openVendor(page, PACIFIC_POWER)
        await expect(expense).toContainText('6900 Old Petty Cash')
        await expect(terms).toContainText('Due on receipt')
        await expense.click()
        await expect(expenseItems.first()).toHaveText('None')
        await expect(expenseItems.filter({ hasText: '6900 Old Petty Cash' })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(expenseItems).toHaveCount(0)
        // Clean, so Cancel leaves with no question.
        await page.getByTestId('vendor-cancel').click()
        await expectListShown(page)
    })

    // Step (15).
    test('shows the not-found screen for an unknown vendor (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)

        await openVendorsList(page)
        await navigateInApp(page, `${vendorsBase(page)}/doesnotexist000`)
        await expect(page.getByTestId('vendor-not-found')).toContainText(
            "This vendor doesn't exist or was removed"
        )
        const notFoundBack = page.getByTestId('vendor-not-found-back')
        await expect(notFoundBack).toHaveText('Back to vendors')
        await notFoundBack.click()
        await expect(page.getByTestId('vendors-list')).toBeVisible()
        await expect(page.getByTestId('vendor-not-found')).toBeHidden()
    })
})
