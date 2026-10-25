import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    login,
    navigateToPackage,
    signInAsCollaborator,
    TEST_COLLABORATOR_EMAIL,
    TEST_COLLABORATOR_NAME,
    TEST_USER_EMAIL,
    TEST_USER_NAME,
} from '@tinycld/core/e2e-helpers'

// The e2e database is shared, so every test sets its own values through the UI and puts back
// what it changed. Nothing here reads or writes PocketBase directly.
// This is the only spec file that writes the shared books_settings row (the business name and
// setup completion), including the 'setup-wizard:' tests at the end. Playwright runs spec files
// in parallel workers, so tests that write the same row must live in one file. They run in
// declaration order in one worker: the 'books-settings:' tests first, the wizard tests last,
// because the wizard flow completes setup.
// Known consequence: the seeded business name is blank and the schema requires a name, so the
// Company tests leave 'E2E Company Co' in the shared database. The UI cannot put a blank back.
// The setup wizard ignores that name, because it resumes only when the setup_started marker,
// which only the wizard writes, is true. The 'setup-wizard: resume' tests assert that.

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

const DESCRIPTIONS = {
    none: 'Cannot open Books.',
    read_only: 'Can see everything and change nothing.',
    bookkeeper: 'Can enter and post entries and manage accounts. Cannot change settings.',
    admin: 'Everything a bookkeeper can do, plus settings, access, and close-date overrides.',
} as const

const LABELS = {
    none: 'None',
    read_only: 'Read-only',
    bookkeeper: 'Bookkeeper',
    admin: 'Admin',
} as const

type Level = keyof typeof DESCRIPTIONS
const LEVELS = Object.keys(DESCRIPTIONS) as Level[]

const ROW_PREFIX = 'books-settings-access-row-'

// A screen that is covered in the navigation stack stays mounted but hidden, so only the visible match counts.
function id(page: Page, testId: string) {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

async function openSettings(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await id(page, 'books-nav-settings').click()
    await expect(id(page, 'books-settings')).toBeVisible()
}

// The wide rail swaps sections in place; the index route shows Company without navigating.
async function openRailSection(page: Page, section: string) {
    await id(page, `books-settings-section-${section}`).click()
}

async function expectSaved(page: Page) {
    const toast = page.getByText('Saved.', { exact: true })
    await expect(toast.first()).toBeVisible()
    // Wait for the toast to leave so the next save cannot be confused with this one.
    await expect(toast).toHaveCount(0)
}

// The seeded book has no business name and the schema requires one, so a test that needs to
// type over the name and put it back first makes sure a name exists.
async function ensureBusinessName(page: Page) {
    const name = id(page, 'books-settings-company-business-name')
    await expect(name).toBeVisible()
    if ((await name.inputValue()) !== '') return
    await name.fill('E2E Company Co')
    await id(page, 'books-settings-save').click()
    await expectSaved(page)
}

async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
}

function accessRow(page: Page, email: string) {
    return page.locator(`[data-testid^="${ROW_PREFIX}"]`).filter({ hasText: email })
}

async function userIdOf(row: Locator) {
    const testId = await row.getAttribute('data-testid')
    return (testId ?? '').replace(ROW_PREFIX, '')
}

async function levelOf(row: Locator): Promise<Level> {
    const note = row.locator('[data-testid^="books-settings-access-note-"]')
    const text = (await note.textContent()) ?? ''
    const found = LEVELS.find(level => DESCRIPTIONS[level] === text.trim())
    if (!found) throw new Error(`row shows no level description: ${text}`)
    return found
}

async function chooseLevel(page: Page, email: string, level: Level) {
    const row = accessRow(page, email)
    const userId = await userIdOf(row)
    const select = id(page, `books-settings-access-level-${userId}`)
    // The select stays disabled until the row's access data has loaded, and a click on it then opens nothing.
    await expect(select).toBeEnabled()
    await select.click()
    await id(page, `books-settings-access-level-${userId}-${level}`).click()
    await expect(chipOf(page, userId)).toHaveText(LABELS[level])
    await expect(id(page, `books-settings-access-level-${userId}`)).toBeEnabled()
    await reopenAccess(page)
    await expect(chipOf(page, userId)).toHaveText(LABELS[level])
    await expect(row.getByText(DESCRIPTIONS[level], { exact: true })).toBeVisible()
}

function chipOf(page: Page, userId: string) {
    return id(page, `books-settings-access-chip-${userId}`)
}

// Leaving and re-opening the section remounts the rows, so they show the saved level.
async function reopenAccess(page: Page) {
    if ((page.viewportSize()?.width ?? 0) < 768) {
        await id(page, 'books-settings-back').click()
        await id(page, 'books-settings-section-access').click()
    } else {
        await openRailSection(page, 'numbering')
        await expect(id(page, 'books-settings-numbering')).toBeVisible()
        await openRailSection(page, 'access')
    }
    await expect(id(page, 'books-settings-access-search')).toBeVisible()
}

async function pickMenuItem(page: Page, trigger: string, item: string) {
    await id(page, trigger).click()
    await id(page, item).click()
}

async function pickGrantPerson(page: Page, name: string) {
    await id(page, 'books-settings-grant-user').click()
    await page
        .locator('[data-testid^="books-settings-grant-user-"]')
        .filter({ hasText: name })
        .click()
}

async function grantOverride(page: Page, name: string, reason: string) {
    await id(page, 'books-settings-grant').click()
    await expect(id(page, 'books-settings-grant-dialog')).toBeVisible()
    await pickGrantPerson(page, name)
    await id(page, 'books-settings-grant-reason').fill(reason)
    await pickMenuItem(page, 'books-settings-grant-lasts', 'books-settings-grant-lasts-24h')
    await id(page, 'books-settings-grant-submit').click()
    await expect(id(page, 'books-settings-grant-dialog')).toHaveCount(0)
}

function overrideRow(page: Page, reason: string) {
    return page.locator('[data-testid^="books-settings-override-"]').filter({ hasText: reason })
}

async function revokeOverride(page: Page, reason: string) {
    const row = overrideRow(page, reason)
    await row.getByRole('button', { name: 'Revoke' }).click()
    await id(page, 'books-settings-revoke-confirm').click()
    await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
}

async function setCloseDate(page: Page, date: string) {
    const toggle = id(page, 'books-settings-close-toggle')
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
    await id(page, 'books-settings-close-date').fill(date)
    await id(page, 'books-settings-close-save').click()
    await expectSaved(page)
}

async function clearCloseDate(page: Page) {
    await id(page, 'books-settings-close-toggle').click()
    await id(page, 'books-settings-close-save').click()
    await expect(page.getByText('Reopen closed periods?')).toBeVisible()
    await id(page, 'books-settings-reopen-confirm').click()
    await expectSaved(page)
}

// Runs every restore step even when an earlier one throws, then rethrows the first failure,
// so one broken restore cannot leave the shared database changed or hide the others.
async function runRestores(steps: Array<() => Promise<void>>) {
    let first: unknown
    let failed = false
    for (const step of steps) {
        try {
            await step()
        } catch (error) {
            if (!failed) {
                failed = true
                first = error
            }
        }
    }
    if (failed) throw first
}

test.describe('books-settings: Settings screens', () => {
    test('Company: validates, saves, and keeps values', async ({ page }) => {
        await openSettings(page)
        const name = id(page, 'books-settings-company-business-name')
        const taxId = id(page, 'books-settings-company-tax-id')
        const phone = id(page, 'books-settings-company-phone')
        const email = id(page, 'books-settings-company-email')
        const save = id(page, 'books-settings-save')
        await expect(name).toBeVisible()
        const original = {
            name: await name.inputValue(),
            taxId: await taxId.inputValue(),
            phone: await phone.inputValue(),
        }
        await expect(save).toBeDisabled()

        await email.fill('not-an-email')
        await save.click()
        await expect(page.getByText('Enter a valid email address')).toBeVisible()
        await expect(email).toHaveValue('not-an-email')
        await email.fill('')

        await name.fill('E2E Company Co')
        await taxId.fill('12-3456789')
        await phone.fill('+1 214 555 0100')
        await save.click()
        await expectSaved(page)
        await expect(save).toBeDisabled()

        await openRailSection(page, 'numbering')
        await expect(id(page, 'books-settings-numbering')).toBeVisible()
        await openRailSection(page, 'company')
        await expect(name).toHaveValue('E2E Company Co')
        await expect(taxId).toHaveValue('12-3456789')
        await expect(phone).toHaveValue('+1 214 555 0100')
        await expect(page.getByText('Currency: US dollars (USD)')).toBeVisible()
        await expect(page.getByText('Books uses one currency.')).toBeVisible()
        await expect(
            page.getByText('Your logo and brand color are set in the organization settings')
        ).toBeVisible()

        await name.fill(original.name || 'E2E Company Co')
        await taxId.fill(original.taxId)
        await phone.fill(original.phone)
        await save.click()
        await expectSaved(page)
    })

    test('Company: the phone list shows the saved name and opens the form', async ({ page }) => {
        await openSettings(page)
        await openRailSection(page, 'numbering')
        await openRailSection(page, 'company')
        const name = id(page, 'books-settings-company-business-name')
        await ensureBusinessName(page)
        const saved = await name.inputValue()

        await page.setViewportSize(PHONE)
        await id(page, 'books-settings-back').click()
        await expect(id(page, 'books-settings-section-company')).toContainText(saved)
        await id(page, 'books-settings-section-company').click()
        await expect(name).toHaveValue(saved)
    })

    test('Company: an empty legal name shows its message inline and a clean form cannot save', async ({
        page,
    }) => {
        await openSettings(page)
        // A phone shows the list for the bare Settings route, so land on the Company route first.
        await openRailSection(page, 'numbering')
        await openRailSection(page, 'company')
        const name = id(page, 'books-settings-company-business-name')
        const save = id(page, 'books-settings-save')
        await ensureBusinessName(page)
        const original = await name.inputValue()
        await expect(save).toBeDisabled()

        for (const size of [DESKTOP, PHONE]) {
            await page.setViewportSize(size)
            await name.fill('')
            await save.click()
            await expect(page.getByText('Enter the legal business name')).toHaveCount(1)
            await expect(name).toHaveValue('')
            await name.fill(original)
            await expect(save).toBeDisabled()
        }
    })

    test('Company: a changed legal name saves and a restored name saves again', async ({
        page,
    }) => {
        await openSettings(page)
        await openRailSection(page, 'numbering')
        await openRailSection(page, 'company')
        const name = id(page, 'books-settings-company-business-name')
        const save = id(page, 'books-settings-save')
        await ensureBusinessName(page)
        const original = await name.inputValue()
        await name.fill(`${original} Two`)
        await save.click()
        await expectSaved(page)
        await name.fill(original)
        await save.click()
        await expectSaved(page)
        await expect(save).toBeDisabled()
    })

    async function openAccounting(page: Page) {
        await openSettings(page)
        await openRailSection(page, 'accounting')
        await expect(id(page, 'books-settings-fiscal-month')).toBeVisible()
    }

    test('Accounting: fiscal year and close date validate and save', async ({ page }) => {
        await openAccounting(page)
        const fiscalSave = id(page, 'books-settings-fiscal-save')
        const dateInput = id(page, 'books-settings-close-date')
        const closeSave = id(page, 'books-settings-close-save')
        await expect(fiscalSave).toBeDisabled()
        let hasCloseDate = false

        try {
            await pickMenuItem(page, 'books-settings-fiscal-month', 'books-settings-fiscal-month-7')
            await expect(id(page, 'books-settings-fiscal-month')).toContainText('July')
            await fiscalSave.click()
            await expectSaved(page)
            await expect(fiscalSave).toBeDisabled()

            await id(page, 'books-settings-close-toggle').click()
            await dateInput.fill('2026-02-30')
            await closeSave.click()
            await expect(page.getByText('Enter a real date as YYYY-MM-DD')).toHaveCount(1)
            await expect(id(page, 'books-settings-close-date-error')).toHaveCount(1)
            await expect(page.getByText('close_date:', { exact: false })).toHaveCount(0)

            await dateInput.fill('2026-06-30')
            await closeSave.click()
            hasCloseDate = true
            await expectSaved(page)
            await expect(page.getByText('No one can post into the closed period.')).toBeVisible()
        } finally {
            await runRestores([
                async () => {
                    if (hasCloseDate) await clearCloseDate(page)
                },
                async () => {
                    await pickMenuItem(
                        page,
                        'books-settings-fiscal-month',
                        'books-settings-fiscal-month-1'
                    )
                    await fiscalSave.click()
                    await expectSaved(page)
                    await expect(id(page, 'books-settings-fiscal-month')).toContainText('January')
                },
            ])
        }
    })

    test('Accounting: override grant validates, shows, cancels and revokes', async ({ page }) => {
        await openAccounting(page)
        let hasCloseDate = false

        try {
            hasCloseDate = true
            await setCloseDate(page, '2026-06-30')

            await id(page, 'books-settings-grant').click()
            await expect(id(page, 'books-settings-grant-dialog')).toBeVisible()
            await pickGrantPerson(page, TEST_USER_NAME)
            await id(page, 'books-settings-grant-reason').fill('ab')
            await id(page, 'books-settings-grant-submit').click()
            await expect(page.getByText('Enter a reason of at least 3 characters')).toBeVisible()
            await id(page, 'books-settings-grant-reason').fill('E2E year-end adjustments')
            await pickMenuItem(page, 'books-settings-grant-lasts', 'books-settings-grant-lasts-24h')
            await expect(id(page, 'books-settings-grant-lasts')).toContainText('24 hours')
            await id(page, 'books-settings-grant-submit').click()
            await expect(id(page, 'books-settings-grant-dialog')).toHaveCount(0)

            const granted = overrideRow(page, 'E2E year-end adjustments')
            await expect(granted).toContainText(TEST_USER_NAME)
            await expect(granted).toContainText('Expires')
            await expect(granted).toContainText('Granted by')

            await granted.getByRole('button', { name: 'Revoke' }).click()
            await expect(page.getByText(`Revoke ${TEST_USER_NAME}'s override?`)).toBeVisible()
            await page.getByRole('button', { name: 'Cancel' }).click()
            await expect(granted.getByRole('button', { name: 'Revoke' })).toBeVisible()

            await granted.getByRole('button', { name: 'Revoke' }).click()
            await id(page, 'books-settings-revoke-confirm').click()
            await expect(id(page, 'books-settings-history-toggle')).toHaveText(
                'Show past overrides (1)'
            )
            await id(page, 'books-settings-history-toggle').click()
            const past = overrideRow(page, 'E2E year-end adjustments')
            await expect(past).toBeVisible()
            await expect(past.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
        } finally {
            await runRestores([
                async () => {
                    if (hasCloseDate) await clearCloseDate(page)
                },
            ])
        }
    })

    test('Accounting: the override sheet grants and revokes on a phone', async ({ page }) => {
        await openAccounting(page)
        let hasCloseDate = false

        try {
            hasCloseDate = true
            await setCloseDate(page, '2026-06-30')
            await page.setViewportSize(PHONE)
            await id(page, 'books-settings-grant').click()
            await expect(id(page, 'books-settings-grant-dialog')).toBeVisible()
            await pickGrantPerson(page, TEST_USER_NAME)
            await id(page, 'books-settings-grant-reason').fill('E2E phone sheet grant')
            await id(page, 'books-settings-grant-submit').click()
            await expect(id(page, 'books-settings-grant-dialog')).toHaveCount(0)
            await expect(overrideRow(page, 'E2E phone sheet grant')).toBeVisible()
            await revokeOverride(page, 'E2E phone sheet grant')
        } finally {
            await runRestores([
                () => page.setViewportSize(DESKTOP),
                async () => {
                    if (hasCloseDate) await clearCloseDate(page)
                },
            ])
        }
    })

    test('Accounting: moving the close date back asks before reopening periods', async ({
        page,
    }) => {
        await openAccounting(page)
        const dateInput = id(page, 'books-settings-close-date')
        const closeSave = id(page, 'books-settings-close-save')
        let hasCloseDate = false

        try {
            hasCloseDate = true
            await setCloseDate(page, '2026-06-30')

            await dateInput.fill('2026-05-31')
            await closeSave.click()
            await expect(page.getByText('Reopen closed periods?')).toBeVisible()
            await expect(page.getByText('People can post entries dated on or before')).toBeVisible()
            await expect(page.getByText('Jun 30, 2026', { exact: false })).toBeVisible()
            await id(page, 'books-settings-reopen-cancel').click()
            await expect(page.getByText('Reopen closed periods?')).toHaveCount(0)
            await expect(dateInput).toHaveValue('2026-05-31')
            await expect(closeSave).toBeEnabled()

            await closeSave.click()
            await id(page, 'books-settings-reopen-confirm').click()
            await expectSaved(page)

            await clearCloseDate(page)
            hasCloseDate = false
            await expect(page.getByText('Set a close date to grant overrides.')).toBeVisible()
            await expect(id(page, 'books-settings-grant')).toHaveCount(0)
        } finally {
            await runRestores([
                async () => {
                    if (hasCloseDate) await clearCloseDate(page)
                },
            ])
        }
    })

    test('Numbering: preview, server refusal, forward-only save, phone fit', async ({ page }) => {
        await openSettings(page)
        await openRailSection(page, 'numbering')
        const prefix = id(page, 'books-settings-seq-journal-prefix')
        const next = id(page, 'books-settings-seq-journal-next')
        const save = id(page, 'books-settings-seq-journal-save')
        const preview = id(page, 'books-settings-seq-journal-preview')
        await expect(preview).toContainText('Next entry:')

        await prefix.fill('JE-')
        await next.fill('1')
        await save.click()
        await expect(page.getByText('are already used', { exact: false })).toBeVisible()
        await expect(prefix).toHaveValue('JE-')
        await expect(next).toHaveValue('1')

        await next.fill('5000')
        await expect(preview).toHaveText('Next entry: JE-5000')
        await save.click()
        await expectSaved(page)
        await expect(
            page.getByText('A new prefix applies to entries posted from now on.', {
                exact: false,
            })
        ).toBeVisible()

        await page.setViewportSize(PHONE)
        await expectNoHorizontalScroll(page)
        const card = await id(page, 'books-settings-seq-journal').boundingBox()
        expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(PHONE.width)
        await prefix.fill('')
        await save.click()
        await expectSaved(page)
        await expect(next).toHaveValue('5000')
    })

    test('Access: owner row is locked and search filters the list', async ({ page }) => {
        await openSettings(page)
        const collaborator = await signInAsCollaborator(page)
        await collaborator.close()
        await openRailSection(page, 'access')
        const owner = accessRow(page, TEST_USER_EMAIL)
        await expect(owner).toBeVisible()
        const note = owner.locator('[data-testid^="books-settings-access-note-"]')
        await expect(note).toHaveText('Organization owner')
        await expect(owner.getByText('Admin', { exact: true })).toHaveCount(1)
        await expect(owner.getByText(DESCRIPTIONS.admin)).toHaveCount(0)

        const search = id(page, 'books-settings-access-search')
        await search.fill('zzzzqq')
        await expect(id(page, 'books-settings-access-empty')).toHaveText('No one matches zzzzqq.')
        await search.fill('')
        await expect(id(page, 'books-settings-access-empty')).toHaveCount(0)
        await expect(owner).toBeVisible()
        await expect(accessRow(page, TEST_COLLABORATOR_EMAIL)).toBeVisible()

        await search.fill(TEST_COLLABORATOR_EMAIL)
        await expect(owner).toHaveCount(0)
        await expect(accessRow(page, TEST_COLLABORATOR_EMAIL)).toBeVisible()
        await search.fill('')

        await page.setViewportSize(PHONE)
        await expect(owner).toBeVisible()
        await expectNoHorizontalScroll(page)
        const box = await owner.boundingBox()
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.width)
    })

    for (const size of [DESKTOP, PHONE]) {
        test(`Access: the owner changes the collaborator through the levels at ${size.width}px`, async ({
            page,
        }) => {
            await openSettings(page)
            const collaborator = await signInAsCollaborator(page)
            await collaborator.close()
            await openRailSection(page, 'access')
            const row = accessRow(page, TEST_COLLABORATOR_EMAIL)
            await expect(row).toBeVisible()
            const started = await levelOf(row)
            const userId = await userIdOf(row)
            await expect(id(page, `books-settings-access-level-${userId}`)).toBeVisible()
            await page.setViewportSize(size)
            const levels = size === PHONE ? (['read_only'] as Level[]) : LEVELS

            try {
                for (const level of levels) {
                    await chooseLevel(page, TEST_COLLABORATOR_EMAIL, level)
                    await expect(chipOf(page, userId)).toHaveText(LABELS[level])
                }
            } finally {
                await runRestores([
                    async () => {
                        if (size === PHONE) await page.setViewportSize(DESKTOP)
                    },
                    () => chooseLevel(page, TEST_COLLABORATOR_EMAIL, started),
                ])
            }
        })
    }

    for (const readerLevel of ['read_only', 'bookkeeper'] as const) {
        test(`Access: a ${readerLevel} reader sees read-only Settings`, async ({ page }) => {
            await openSettings(page)
            await openRailSection(page, 'access')
            const started = await levelOf(accessRow(page, TEST_COLLABORATOR_EMAIL))
            let hasCloseDate = false
            let hasOverride = false

            const checkReader = async () => {
                const reader = await signInAsCollaborator(page)
                try {
                    const view = reader.page
                    await navigateToPackage(view, 'books')
                    await id(view, 'books-nav-settings').click()
                    await expect(id(view, 'books-settings')).toBeVisible()
                    await expect(id(view, 'books-settings-section-access')).toHaveCount(0)

                    await expect(
                        view.getByText('Legal business name', { exact: true })
                    ).toBeVisible()
                    await expect(id(view, 'books-settings-save')).toHaveCount(0)
                    await expect(id(view, 'books-settings-company-business-name')).toHaveCount(0)

                    await openRailSection(view, 'accounting')
                    await expect(id(view, 'books-settings-fiscal-save')).toHaveCount(0)
                    await expect(id(view, 'books-settings-close-save')).toHaveCount(0)
                    const line = id(view, 'books-settings-own-override')
                    await expect(line).toContainText('You can post into the closed period until')
                    await expect(line).toContainText('E2E reader reason')

                    await openRailSection(view, 'numbering')
                    await expect(id(view, 'books-settings-seq-journal')).toBeVisible()
                    await expect(id(view, 'books-settings-seq-journal-save')).toHaveCount(0)
                    await expect(id(view, 'books-settings-seq-journal-prefix')).toHaveCount(0)

                    await view.setViewportSize(PHONE)
                    await id(view, 'books-settings-back').click()
                    await expect(id(view, 'books-settings-section-company')).toBeVisible()
                    await expect(id(view, 'books-settings-section-accounting')).toContainText(
                        'Fiscal year starts in'
                    )
                    await expect(id(view, 'books-settings-section-numbering')).toContainText(
                        'document type'
                    )
                    await expect(id(view, 'books-settings-section-access')).toHaveCount(0)
                    await id(view, 'books-settings-section-accounting').click()
                    await expect(id(view, 'books-settings-back')).toBeVisible()
                    await expect(id(view, 'books-settings-own-override')).toContainText(
                        'E2E reader reason'
                    )
                    await expect(id(view, 'books-settings-close-save')).toHaveCount(0)
                } finally {
                    await reader.close()
                }
            }

            try {
                await chooseLevel(page, TEST_COLLABORATOR_EMAIL, 'bookkeeper')
                await openRailSection(page, 'accounting')
                hasCloseDate = true
                await setCloseDate(page, '2026-06-30')
                hasOverride = true
                await grantOverride(page, TEST_COLLABORATOR_NAME, 'E2E reader reason')
                await expect(overrideRow(page, 'E2E reader reason')).toBeVisible()

                if (readerLevel !== 'bookkeeper') {
                    await openRailSection(page, 'access')
                    await chooseLevel(page, TEST_COLLABORATOR_EMAIL, readerLevel)
                }
                await checkReader()
            } finally {
                await runRestores([
                    () => page.setViewportSize(DESKTOP),
                    () => openRailSection(page, 'accounting'),
                    async () => {
                        if (
                            hasOverride &&
                            (await overrideRow(page, 'E2E reader reason').count()) > 0
                        ) {
                            await revokeOverride(page, 'E2E reader reason')
                        }
                    },
                    async () => {
                        if (hasCloseDate) await clearCloseDate(page)
                    },
                    () => openRailSection(page, 'access'),
                    () => chooseLevel(page, TEST_COLLABORATOR_EMAIL, started),
                ])
            }
        })
    }

    test('a dirty Company form keeps its edits across the breakpoint and a rail click', async ({
        page,
    }) => {
        await openSettings(page)
        // The index route shows Company without a section in the URL, and a click on the open
        // section is a no-op there, so visit another section first to land on the section route.
        await openRailSection(page, 'numbering')
        await openRailSection(page, 'company')
        const name = id(page, 'books-settings-company-business-name')
        const save = id(page, 'books-settings-save')
        await ensureBusinessName(page)
        const original = await name.inputValue()
        await name.fill(`${original} draft`)
        await expect(save).toBeEnabled()
        await name.evaluate(el => {
            ;(el as unknown as Record<string, boolean>).__dirtyProbe = true
        })
        const sameNode = () =>
            name.evaluate(el => (el as unknown as Record<string, boolean>).__dirtyProbe === true)

        for (const size of [PHONE, DESKTOP, PHONE, DESKTOP]) {
            await page.setViewportSize(size)
            await expect(name).toHaveValue(`${original} draft`)
            await expect(save).toBeEnabled()
            expect(await sameNode(), `same input at ${size.width}px`).toBe(true)
        }

        await openRailSection(page, 'company')
        await expect(name).toHaveValue(`${original} draft`)
        await expect(save).toBeEnabled()
        expect(await sameNode()).toBe(true)

        await name.fill(original)
        await expect(save).toBeDisabled()
    })

    test('rail clicks add no history entries and a phone row opens and returns', async ({
        page,
    }) => {
        await openSettings(page)
        const historyLength = () => page.evaluate(() => window.history.length)
        const before = await historyLength()
        for (const section of ['numbering', 'accounting', 'company', 'numbering']) {
            await openRailSection(page, section)
            await expect(page).toHaveURL(new RegExp(`/books/settings/${section}$`))
        }
        expect(await historyLength()).toBe(before)

        await page.setViewportSize(PHONE)
        await id(page, 'books-settings-back').click()
        await expect(page).toHaveURL(/\/books\/settings$/)
        await expect(id(page, 'books-settings-section-accounting')).toBeVisible()
        await id(page, 'books-settings-section-accounting').click()
        await expect(page).toHaveURL(/\/books\/settings\/accounting$/)
        await expect(id(page, 'books-settings-back')).toBeVisible()
        await expect(id(page, 'books-settings-fiscal-month')).toBeVisible()
        await id(page, 'books-settings-back').click()
        await expect(page).toHaveURL(/\/books\/settings$/)
        await expect(id(page, 'books-settings-section-company')).toBeVisible()
        await expect(id(page, 'books-settings-back')).toHaveCount(0)
    })

    test('the Settings sidebar entry is last and active on the Settings route', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const entries = page.locator('[data-testid^="books-nav-"]')
        await expect(id(page, 'books-nav-settings')).toBeVisible()
        await expect(entries.last()).toHaveAttribute('data-testid', 'books-nav-settings')

        const lists = id(page, 'books-nav-lists')
        const settings = id(page, 'books-nav-settings')
        await expect(settings).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await settings.click()
        await expect(page).toHaveURL(/\/a\/books\/settings/)
        await expect(settings).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(lists).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    })
})

async function openCompanySettings(page: Page) {
    await openSettings(page)
    await openRailSection(page, 'numbering')
    await openRailSection(page, 'company')
}

async function saveBusinessName(page: Page, value: string) {
    await id(page, 'books-settings-company-business-name').fill(value)
    await id(page, 'books-settings-save').click()
    await expectSaved(page)
}

// These tests share the one books_settings row with the finishing flow below, so they run
// before it. They never complete setup, and they put the business name back.
test.describe('setup-wizard: resume after a Settings save', () => {
    for (const size of [DESKTOP, PHONE]) {
        test(`a business name saved from Settings does not make the setup wizard resume at Part 3 at ${size.width}px`, async ({
            page,
        }) => {
            await openCompanySettings(page)
            const name = id(page, 'books-settings-company-business-name')
            await expect(name).toBeVisible()
            if ((await name.inputValue()) === '') await saveBusinessName(page, 'E2E Company Co')
            const original = await name.inputValue()
            const saved = 'E2E Wizard Resume Co'
            await saveBusinessName(page, saved)

            try {
                await id(page, 'books-nav-lists').click()
                await id(page, 'books-setup-card').click()
                await page.setViewportSize(size)
                await expect(page.getByTestId('books-setup-part-label')).toHaveText('Part 1 of 3')
                await expect(page.getByTestId('books-setup-business-name')).toHaveValue(saved)
                await expect(page.getByTestId('books-setup-populated')).toHaveCount(0)
            } finally {
                await runRestores([
                    async () => {
                        if (size === PHONE) await page.setViewportSize(DESKTOP)
                    },
                    async () => {
                        await id(page, 'books-nav-settings').click()
                        await openRailSection(page, 'numbering')
                        await openRailSection(page, 'company')
                        await saveBusinessName(page, original)
                    },
                ])
            }
        })
    }
})

// The e2e database is shared and finishing completes setup, so the whole flow is one
// test that mutates it once. The seeded book already has accounts and the seed has no
// non-admin Books user or empty book, so the fresh-chart, creating, error and
// non-admin parts are covered by the hook tests, not here.
test.describe('setup-wizard: Books setup flow', () => {
    test('walks Business, Ownership and the populated-book notice, then finishes', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.getByTestId('books-setup-card').click()

        const partLabel = page.getByTestId('books-setup-part-label')
        const businessName = page.getByTestId('books-setup-business-name')
        const month = page.getByTestId('books-setup-month')
        const next = page.getByTestId('setup-continue')
        const back = page.getByTestId('books-setup-back')
        const ownershipCardBoxes = async () => {
            const owners = await page.getByTestId('books-setup-ownership-owners').boundingBox()
            const corporation = await page
                .getByTestId('books-setup-ownership-corporation')
                .boundingBox()
            if (!owners || !corporation) throw new Error('ownership cards are not rendered')
            return { owners, corporation }
        }

        await expect(partLabel).toHaveText('Part 1 of 3')

        await businessName.fill('')
        await next.click()
        await expect(page.getByText('Enter the legal business name')).toBeVisible()
        await expect(partLabel).toHaveText('Part 1 of 3')
        await expect(page.getByTestId('books-setup-ownership-owners')).toHaveCount(0)

        await businessName.fill('E2E Setup Co')
        await month.click()
        await page.getByTestId('books-setup-month-7').click()
        await expect(month).toContainText('July')
        await next.click()

        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByText('How is the business owned?')).toBeVisible()
        await page.getByTestId('books-setup-ownership-corporation').click()
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await expect
            .poll(async () => {
                const cards = await ownershipCardBoxes()
                return cards.corporation.x > cards.owners.x
            })
            .toBe(true)

        await back.click()
        await expect(partLabel).toHaveText('Part 1 of 3')
        await expect(businessName).toHaveValue('E2E Setup Co')
        await expect(month).toContainText('July')

        await next.click()
        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await next.click()
        await expect(page.getByTestId('books-setup-populated')).toBeVisible()
        await expect(page.getByText('This book already has')).toBeVisible()
        await expect(partLabel).toHaveText('Part 3 of 3')

        await page.setViewportSize({ width: 390, height: 844 })
        await back.click()
        await expect(partLabel).toHaveText('Part 2 of 3')
        await expect(page.getByTestId('books-setup-ownership-corporation')).toHaveClass(
            /border-primary/
        )
        await expect
            .poll(async () => {
                const cards = await ownershipCardBoxes()
                return (
                    cards.corporation.x === cards.owners.x && cards.corporation.y > cards.owners.y
                )
            })
            .toBe(true)
        await next.click()
        await expect(page.getByTestId('books-setup-populated')).toBeVisible()

        await next.click()
        await expect(page.getByTestId('books-setup-done')).toBeVisible()
        await expect(page.getByText('Your books are ready')).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.getByTestId('books-setup-open-chart').click()
        await expect(page).toHaveURL(/\/books\/accounts$/)
        await page.getByTestId('books-nav-lists').click()
        await expect(page.getByTestId('books-setup-card')).toHaveCount(0)
    })
})
