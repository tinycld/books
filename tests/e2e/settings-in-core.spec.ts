import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import { uniqueName } from './record-form-helpers'

// The Books settings sections in core Settings (unit p1-sidebar-shortcuts, added item
// (b)): Settings lists them under Books, a section opened there saves, and the Books
// settings screen shows what it saved (one implementation behind two entry points).
//
// The test saves the Company section, which is on the one shared books_settings row, so
// its title ends in "(company settings)" and it runs in the one-worker
// `purchase-lines-setting` project (playwright.config.ts). It changes only the website,
// which no other test reads, and puts the old value back. The seeded business name is
// blank and the schema requires one, so like books-settings.spec.ts it leaves
// 'E2E Company Co' when the name was blank.
//
// Not covered by e2e: a user who is not a core admin (core shows package panels to core
// admins only; core's own specs hold that), and the panel's no-access and admin-only notes
// (tests/section-panel.test.tsx).

const SECTION_SLUGS = [
    'company',
    'accounting',
    'sales',
    'purchases',
    'numbering',
    'form-1099',
    'access',
]

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

async function expectSaved(page: Page) {
    const toast = page.getByText('Saved.', { exact: true })
    await expect(toast.first()).toBeVisible()
    // Wait for the toast to leave so the next save cannot be confused with this one.
    await expect(toast).toHaveCount(0)
}

// Core Settings, then the Books panel `slug`. The settings rail item exists only at the
// desktop width.
async function openCorePanel(page: Page, slug: string) {
    await page.getByTestId('nav-settings').click()
    const index = page.getByTestId('settings-index')
    await index.waitFor({ state: 'visible' })
    await index.getByTestId(`settings-org-books-${slug}`).click()
    await expect(page).toHaveURL(new RegExp(`/a/settings/books/${slug}$`))
    await expect(shown(page, 'books-settings-panel')).toBeVisible()
}

// Core Settings and the Books settings screen both stay mounted once opened, and both
// hold a Company form: every field is read inside the panel or the Books screen.
function inPanel(page: Page, testId: string) {
    return shown(page, 'books-settings-panel').getByTestId(testId)
}

async function saveWebsite(page: Page, value: string) {
    const name = inPanel(page, 'books-settings-company-business-name')
    if ((await name.inputValue()) === '') await name.fill('E2E Company Co')
    await inPanel(page, 'books-settings-company-website').fill(value)
    const save = inPanel(page, 'books-settings-save')
    await save.scrollIntoViewIfNeeded()
    await save.click()
    await expectSaved(page)
}

test.describe('settings-in-core: Books sections in core Settings', () => {
    test.use({ viewport: DESKTOP })

    test('Settings lists the Books sections, one saves, and Books settings shows the value (company settings)', async ({
        page,
    }) => {
        await login(page)
        // Never press the rail during the redirect after the login: open a package first.
        await navigateToPackage(page, 'books')
        await page.getByTestId('nav-settings').click()
        const index = page.getByTestId('settings-index')
        await index.waitFor({ state: 'visible' })
        for (const slug of SECTION_SLUGS) {
            await expect(index.getByTestId(`settings-org-books-${slug}`)).toBeVisible()
        }
        await expect(index.getByTestId('settings-org-books-form-1099')).toContainText('1099s')

        await index.getByTestId('settings-org-books-company').click()
        await expect(page).toHaveURL(/\/a\/settings\/books\/company$/)
        const panel = shown(page, 'books-settings-panel')
        await expect(panel).toBeVisible()
        // The panel is the section alone: no Books settings shell, rail or back bar in it.
        await expect(page.getByTestId('books-settings')).toHaveCount(0)

        const website = inPanel(page, 'books-settings-company-website')
        await expect(website).toBeVisible()
        const original = await website.inputValue()
        const typed = `https://${uniqueName('core-settings').replace(/[^a-z0-9]/gi, '-')}.example`
        await saveWebsite(page, typed)

        // The Books settings screen reads the same row.
        await navigateToPackage(page, 'books')
        await shown(page, 'books-nav-settings').click()
        await expect(shown(page, 'books-settings')).toBeVisible()
        await expect(
            shown(page, 'books-settings').getByTestId('books-settings-company-website')
        ).toHaveValue(typed)

        // On a phone the panel fills the screen and scrolls: Save, the last control, is reached.
        await openCorePanel(page, 'company')
        await page.setViewportSize(PHONE)
        await expect(inPanel(page, 'books-settings-company-website')).toHaveValue(typed)
        await saveWebsite(page, original)
        await expect(inPanel(page, 'books-settings-company-website')).toHaveValue(original)
    })
})
