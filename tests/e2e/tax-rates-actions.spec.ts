import { expect, type Page, test } from '@playwright/test'
import {
    agencyCardByName,
    agencyCards,
    chooseMenuItem,
    createAgency,
    createRate,
    dialogByTitle,
    idAfter,
    isDisabled,
    openAgencyMenu,
    openRowMenu,
    openTaxes,
    rowByName,
    uniqueName,
} from './tax-rates-helpers'

// Row menus, the default and refusals (checkpoint 7). The database is shared by every
// spec file on two workers. Each test adds its own agency and rate with `uniqueName`,
// with one exception: the default is one per book, so the first test moves it to its
// own rate and puts it back on the seeded "Denver combined"; no other spec asserts which
// row is the default. The refusal test names seeded rows and changes none of them: the
// server refuses the delete of "Denver city" (it is in "Denver combined", and no spec
// puts it in another group) and the Make inactive of "City and County of Denver" (it has
// two active rates, and no spec adds a rate to a seeded agency).

const DENVER = 'City and County of Denver'
const DEFAULT_HELP =
    'Invoices and sales receipts start with this tax unless the customer has its own default.'
const IN_GROUP = 'This rate is in the group “Denver combined”. Remove it from the group first.'
const ACTIVE_RATES_FIRST = 'Make its 2 active rates inactive first.'

function deleteDialog(page: Page) {
    return page.getByTestId('tax-delete-dialog')
}

test.describe('tax-rates: row actions', () => {
    test('changes the default from a row menu and the picker, and disables writes offline', async ({
        page,
    }) => {
        await openTaxes(page)
        const defaultCard = page.getByTestId('tax-default-card')
        await expect(defaultCard).toContainText(DEFAULT_HELP)
        await expect
            .poll(async () => {
                const [card, first] = await Promise.all([
                    defaultCard.boundingBox(),
                    agencyCards(page).first().boundingBox(),
                ])
                if (!card || !first) return false
                return card.y < first.y && card.y + card.height <= first.y + 1
            })
            .toBe(true)

        const agencyName = uniqueName(page, 'Tax agency default')
        const agencyId = await createAgency(page, agencyName)
        const rate = uniqueName(page, 'Default rate')
        const rateId = await createRate(page, agencyId, rate, '5')
        const badges = page.locator('[data-testid^="tax-default-badge-"]')
        const picker = page.getByTestId('tax-default-select')

        await openRowMenu(page, rateId)
        await expect(page.getByTestId('tax-item-default')).toHaveText('Make default')
        await chooseMenuItem(page, 'tax-item-default')
        await expect(page.getByTestId(`tax-default-badge-${rateId}`)).toHaveText('Default')
        await expect(badges).toHaveCount(1)
        await expect(picker).toHaveText(`${rate} 5%`)

        await openRowMenu(page, rateId)
        await expect(page.getByTestId('tax-item-default')).toHaveText('Remove default')
        await chooseMenuItem(page, 'tax-item-default')
        await expect(badges).toHaveCount(0)
        await expect(picker).toHaveText('None')

        // Back on the seeded default, through the picker's Groups heading.
        await picker.click()
        await expect(page.getByRole('group', { name: agencyName, exact: true })).toBeVisible()
        await expect(page.getByRole('group', { name: 'Groups', exact: true })).toBeVisible()
        await page.getByRole('menuitem', { name: 'Denver combined 8.71%', exact: true }).click()
        const denverCombined = rowByName(page.getByTestId('tax-groups-card'), 'Denver combined')
        await expect(denverCombined.locator('[data-testid^="tax-default-badge-"]')).toHaveText(
            'Default'
        )
        await expect(badges).toHaveCount(1)
        await expect(picker).toHaveText('Denver combined 8.71%')

        await page.context().setOffline(true)
        for (const testId of [
            'taxes-add-agency',
            'taxes-add-group',
            `tax-agency-add-rate-${agencyId}`,
            'tax-default-select',
        ]) {
            await expect.poll(() => isDisabled(page.getByTestId(testId))).toBe(true)
        }
        await openRowMenu(page, rateId)
        for (const testId of ['tax-item-default', 'tax-item-inactive', 'tax-item-delete']) {
            await expect.poll(() => isDisabled(page.getByTestId(testId))).toBe(true)
        }
        expect(await isDisabled(page.getByTestId('tax-item-edit'))).toBe(false)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('tax-item-edit')).toHaveCount(0)
        await page.context().setOffline(false)
    })

    test("refused row actions show the server's message, then the banner, which can be dismissed", async ({
        page,
    }) => {
        await openTaxes(page)
        const denver = agencyCardByName(page, DENVER)
        const denverCity = rowByName(denver, 'Denver city')
        await expect(denverCity).toBeVisible()
        const denverId = await idAfter(denver, 'tax-agency-card-')
        const denverCityId = await idAfter(denverCity, 'tax-row-')
        const banner = page.getByTestId('taxes-banner')

        await openRowMenu(page, denverCityId)
        await chooseMenuItem(page, 'tax-item-delete')
        await expect(deleteDialog(page)).toBeVisible()
        await expect(dialogByTitle(page, 'Delete rate “Denver city”?')).toBeVisible()
        await page.getByTestId('tax-delete-confirm').click()
        await expect(page.getByTestId('tax-delete-dialog-body')).toContainText(IN_GROUP)
        // The dialog about the refused row shows the refusal; the banner waits for it to close.
        await expect(banner).toHaveCount(0)

        await page.getByTestId('tax-delete-close').click()
        await expect(deleteDialog(page)).toBeHidden()
        await expect(banner).toContainText(IN_GROUP)
        await page.getByTestId('taxes-banner-dismiss').click()
        await expect(banner).toHaveCount(0)
        await expect(denverCity).toBeVisible()

        await openAgencyMenu(page, denverId)
        await expect(page.getByTestId('tax-item-inactive')).toHaveText('Make inactive')
        await chooseMenuItem(page, 'tax-item-inactive')
        await expect(banner).toContainText(ACTIVE_RATES_FIRST)
        await expect(denver).toBeVisible()
        await expect(page.getByTestId(`tax-agency-inactive-${denverId}`)).toHaveCount(0)
    })

    test('edits a rate, makes it inactive and active again, deletes it, then deletes its agency', async ({
        page,
    }) => {
        await openTaxes(page)
        const agencyName = uniqueName(page, 'Tax agency retire')
        const agencyId = await createAgency(page, agencyName)
        const rateName = uniqueName(page, 'Retire rate')
        const rateId = await createRate(page, agencyId, rateName, '1.25')
        const card = page.getByTestId(`tax-agency-card-${agencyId}`)
        const row = page.getByTestId(`tax-row-${rateId}`)
        const inactiveBadge = page.getByTestId(`tax-inactive-badge-${rateId}`)
        const noActiveRates = page.getByTestId(`tax-agency-no-active-rates-${agencyId}`)
        const noRates = page.getByTestId(`tax-agency-no-rates-${agencyId}`)

        await openRowMenu(page, rateId)
        await chooseMenuItem(page, 'tax-item-edit')
        const dialog = dialogByTitle(page, 'Edit rate')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('tax-rate-form-name')).toBeFocused()
        const percent = page.getByTestId('tax-rate-form-percent')
        // The dialog reads the stored rate with its own query; replace it only once it shows.
        await expect(percent).toHaveValue('1.25')
        const save = page.getByTestId('tax-rate-form-save')
        await expect(save).toHaveText('Save changes')
        await percent.fill('1.5')
        await save.click()
        await expect(dialog).toBeHidden()
        await expect(page.getByTestId(`tax-percent-${rateId}`)).toHaveText('1.5%')

        await openRowMenu(page, rateId)
        await expect(page.getByTestId('tax-item-inactive')).toHaveText('Make inactive')
        await chooseMenuItem(page, 'tax-item-inactive')
        await expect(row).toHaveCount(0)
        // Its only rate is inactive and hidden: the card says so, not that it has none.
        await expect(noActiveRates).toHaveText('No active rates.')
        await expect(noRates).toHaveCount(0)

        const showInactive = page.getByTestId('taxes-show-inactive')
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await expect(row).toBeVisible()
        await expect(inactiveBadge).toBeVisible()

        await openRowMenu(page, rateId)
        await expect(page.getByTestId('tax-item-inactive')).toHaveText('Make active')
        await chooseMenuItem(page, 'tax-item-inactive')
        await expect(inactiveBadge).toHaveCount(0)

        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await expect(row).toBeVisible()

        await openRowMenu(page, rateId)
        await chooseMenuItem(page, 'tax-item-delete')
        await expect(dialogByTitle(page, `Delete rate “${rateName}”?`)).toBeVisible()
        await page.getByTestId('tax-delete-confirm').click()
        await expect(deleteDialog(page)).toBeHidden()
        await expect(row).toHaveCount(0)
        await expect(noRates).toHaveText('No rates yet.')

        await openAgencyMenu(page, agencyId)
        await chooseMenuItem(page, 'tax-item-delete')
        await expect(dialogByTitle(page, `Delete agency “${agencyName}”?`)).toBeVisible()
        await page.getByTestId('tax-delete-confirm').click()
        await expect(deleteDialog(page)).toBeHidden()
        await expect(card).toHaveCount(0)
    })
})
