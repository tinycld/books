import { expect, test } from '@playwright/test'
import { checkRate, dialogByTitle, openTaxes, rowByName, uniqueName } from './tax-rates-helpers'

// The group dialog (checkpoint 6). The test adds its own group, named with `uniqueName`,
// from two seeded rates without editing them. It names neither Denver city nor any rate
// of "Denver combined", which the checkpoint 7 refusal test counts on.

const LODGING = 'Denver lodging 8.875% · City and County of Denver'
const CULTURAL_DISTRICT =
    'Scientific and Cultural Facilities District, seven-county Denver metro area 0.105% · Colorado Department of Revenue'

test.describe('tax-rates: tax groups', () => {
    test('adds a group of two rates, with the combined line rounded per rate', async ({ page }) => {
        await openTaxes(page)
        await page.getByTestId('taxes-add-group').click()
        const dialog = dialogByTitle(page, 'Add group')
        await expect(dialog).toBeVisible()

        const name = page.getByTestId('tax-group-form-name')
        await expect(name).toBeFocused()
        const groupName = uniqueName('Tax group')
        await name.fill(groupName)
        await checkRate(dialog, LODGING)

        const save = page.getByTestId('tax-group-form-save')
        await save.click()
        await expect(dialog.getByText('Choose at least two rates.', { exact: true })).toBeVisible()
        await expect(dialog).toBeVisible()

        await checkRate(dialog, CULTURAL_DISTRICT)
        // 8.875% of $100.00 is 887.5 cents (888) and 0.105% is 10.5 cents (11): $8.99,
        // where one rounding of 8.98% would give $8.98.
        await expect(page.getByTestId('tax-group-form-preview')).toHaveText(
            'Combined rate: 8.98% · Tax on $100.00: $8.99'
        )
        await save.click()
        await expect(dialog).toBeHidden()

        const row = rowByName(page.getByTestId('tax-groups-card'), groupName)
        await expect(row.locator('[data-testid^="tax-percent-"]')).toHaveText('8.98%')
        await expect(row.locator('[data-testid^="tax-components-"]')).toHaveText(
            'Denver lodging 8.875% + Scientific and Cultural Facilities District, seven-county Denver metro area 0.105%'
        )
    })
})
