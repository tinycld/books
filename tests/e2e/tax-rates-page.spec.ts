import { expect, type Locator, test } from '@playwright/test'
import {
    agencyCardByName,
    DESKTOP,
    fakeReadOnlyAccess,
    holdAgenciesLoad,
    openBooksPage,
    openTaxes,
    rowByName,
} from './tax-rates-helpers'

// The Sales tax page, read-only parts (checkpoint 4). These tests write nothing: they
// read the seeded agencies, rates and groups (lib/tax-rates-fixture.ts) and never
// assume which agency card comes first, because other specs add agencies. The order
// and the names are read in one page.evaluate snapshot. The loading, error and
// read-only states are forced on a fresh page with page.route, before it loads.

const COLORADO = 'Colorado Department of Revenue'
const DENVER = 'City and County of Denver'
const OLD_AGENCY = 'Old county agency'

// The id at the end of an agency card's test id (`tax-agency-card-<id>`).
async function agencyIdOf(card: Locator): Promise<string> {
    const testId = (await card.getAttribute('data-testid')) ?? ''
    expect(testId).toMatch(/^tax-agency-card-./)
    return testId.slice('tax-agency-card-'.length)
}

function caseless(names: readonly string[]) {
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

test.describe('tax-rates: Sales tax page', () => {
    test('shows each agency with its rates and the groups, and Show inactive reveals inactive ones', async ({
        page,
    }) => {
        await openTaxes(page)
        await expect(page.getByTestId('taxes-title')).toHaveText('Sales tax')

        const colorado = agencyCardByName(page, COLORADO)
        const denver = agencyCardByName(page, DENVER)
        await expect(colorado).toBeVisible()
        await expect(denver).toBeVisible()

        const titles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid^="tax-agency-card-"]')).map(
                card =>
                    card.querySelector('[data-testid^="tax-agency-title-"]')?.textContent?.trim() ??
                    ''
            )
        )
        expect(titles).toEqual(caseless(titles))
        expect(titles).toContain(DENVER)
        expect(titles.indexOf(DENVER)).toBeLessThan(titles.indexOf(COLORADO))

        await expect(colorado.locator('[data-testid^="tax-agency-account-"]')).toHaveText(
            'Tax goes to 2200 Sales tax payable'
        )
        await expect(
            rowByName(colorado, 'Exempt food sales (state)').locator(
                '[data-testid^="tax-percent-"]'
            )
        ).toHaveText('0%')
        await expect(
            rowByName(denver, 'Denver lodging').locator('[data-testid^="tax-percent-"]')
        ).toHaveText('8.875%')

        const groups = page.getByTestId('tax-groups-card')
        await expect(
            rowByName(groups, 'Denver combined').locator('[data-testid^="tax-components-"]')
        ).toHaveText('Colorado state 2.9% + Denver city 4.81% + RTD transit 1%')
        await expect(
            rowByName(groups, 'Adams County combined').locator('[data-testid^="tax-percent-"]')
        ).toHaveText('3.65%')

        const oldAgency = agencyCardByName(page, OLD_AGENCY)
        const oldRate = rowByName(oldAgency, 'Old county rate')
        const retired = rowByName(denver, 'Retired rate')
        const oldCombined = rowByName(groups, 'Old combined')
        await expect(oldAgency).toHaveCount(0)
        await expect(retired).toHaveCount(0)
        await expect(oldCombined).toHaveCount(0)

        const showInactive = page.getByTestId('taxes-show-inactive')
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await expect(oldAgency).toBeVisible()
        await expect(oldAgency.locator('[data-testid^="tax-agency-inactive-"]')).toBeVisible()
        await expect(oldRate.locator('[data-testid^="tax-inactive-badge-"]')).toBeVisible()
        await expect(retired.locator('[data-testid^="tax-inactive-badge-"]')).toBeVisible()
        await expect(oldCombined.locator('[data-testid^="tax-inactive-badge-"]')).toBeVisible()

        // A new rate cannot go to an inactive agency (the server refuses it), so only
        // an active agency's card offers Add rate.
        const coloradoId = await agencyIdOf(colorado)
        const oldAgencyId = await agencyIdOf(oldAgency)
        await expect(page.getByTestId(`tax-agency-add-rate-${coloradoId}`)).toBeVisible()
        await expect(page.getByTestId(`tax-agency-add-rate-${oldAgencyId}`)).toHaveCount(0)

        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await expect(oldAgency).toHaveCount(0)
        await expect(oldRate).toHaveCount(0)
        await expect(retired).toHaveCount(0)
        await expect(oldCombined).toHaveCount(0)
    })

    test('shows a loading state, then a load error with Retry, and Retry loads the page', async ({
        page,
    }) => {
        // Set by the intercept, which runs before the fresh page loads anything.
        let load = { fail: () => {} }
        const fresh = await openBooksPage(page, DESKTOP, async p => {
            load = await holdAgenciesLoad(p)
        })
        await fresh.getByTestId('books-nav-taxes').click()

        await expect(fresh.getByTestId('taxes-loading')).toBeVisible()
        await expect(fresh.locator('[data-testid^="tax-agency-card-"]')).toHaveCount(0)

        load.fail()
        const banner = fresh.getByTestId('taxes-banner')
        await expect(banner).toContainText('Sales tax could not be loaded.')
        await expect(fresh.getByTestId('taxes-retry')).toBeVisible()
        await expect(fresh.getByTestId('taxes-loading')).toHaveCount(0)

        await fresh.unrouteAll({ behavior: 'wait' })
        await fresh.getByTestId('taxes-retry').click()
        await expect(banner).toHaveCount(0)
        await expect(agencyCardByName(fresh, COLORADO)).toBeVisible()
    })

    test('a read-only user sees the page without actions, menus or the default picker', async ({
        page,
    }) => {
        const fresh = await openBooksPage(page, DESKTOP, fakeReadOnlyAccess)
        await fresh.getByTestId('books-nav-taxes').click()

        await expect(agencyCardByName(fresh, COLORADO)).toBeVisible()
        await expect(agencyCardByName(fresh, DENVER)).toBeVisible()
        // The default shows as text, with no picker. Another spec moves the default for a
        // few seconds, so only its presence is read, not which row it names.
        await expect(fresh.getByTestId('tax-default-text')).toHaveText(/\S/)
        await expect(fresh.getByTestId('tax-default-select')).toHaveCount(0)
        await expect(fresh.getByTestId('taxes-add-agency')).toHaveCount(0)
        await expect(fresh.locator('[data-testid^="tax-agency-add-rate-"]')).toHaveCount(0)
        await expect(fresh.getByTestId('taxes-actions')).toHaveCount(0)
        await expect(fresh.getByTestId('taxes-show-inactive')).toHaveCount(0)
        await expect(fresh.locator('[data-testid^="tax-menu-"]')).toHaveCount(0)
        await expect(fresh.locator('[data-testid^="tax-agency-menu-"]')).toHaveCount(0)
    })
})
