import { expect, type Locator, type Page } from '@playwright/test'
import { TEST_COLLABORATOR_EMAIL } from '@tinycld/core/e2e-helpers'

// The shared collaborator's Books level, set and read through Settings → Access as the
// owner. The level is one row of the shared e2e database: every test that changes it, or
// signs in as the collaborator, runs in the one-worker `books-access-level` project
// (playwright.config.ts) and puts the level back in `afterEach` (lesson 35).

export const DESCRIPTIONS = {
    none: 'Cannot open Books.',
    read_only: 'Can see everything and change nothing.',
    bookkeeper: 'Can enter and post entries and manage accounts. Cannot change settings.',
    admin: 'Everything a bookkeeper can do, plus settings, access, and close-date overrides.',
} as const

export const LABELS = {
    none: 'None',
    read_only: 'Read-only',
    bookkeeper: 'Bookkeeper',
    admin: 'Admin',
} as const

export type Level = keyof typeof DESCRIPTIONS
export const LEVELS = Object.keys(DESCRIPTIONS) as Level[]

const ROW_PREFIX = 'books-settings-access-row-'

// A screen that is covered in the navigation stack stays mounted but hidden, so only the visible match counts.
function shown(page: Page, testId: string) {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

export function accessRow(page: Page, email: string) {
    return page.locator(`[data-testid^="${ROW_PREFIX}"]:visible`).filter({ hasText: email })
}

export async function userIdOf(row: Locator) {
    const testId = await row.getAttribute('data-testid')
    return (testId ?? '').replace(ROW_PREFIX, '')
}

export function chipOf(page: Page, userId: string) {
    return shown(page, `books-settings-access-chip-${userId}`)
}

const SETTINGS_PATH = /\/books\/settings(\/|$)/
const ACCESS_PATH = /\/books\/settings\/access\/?$/

// From anywhere in Books to Settings → Access; on the Access section already, nothing. On a
// phone, another section shows no rail, so call it from outside Settings or from the list.
// The route decides, not what is painted: right after a rail click the old screen is gone and
// the new one has not painted, so a check of the screen would open Access a second time. When
// the route is not yet Access, a rail click replaces whatever section shows, so it never stacks.
async function openAccess(page: Page) {
    const path = new URL(page.url()).pathname
    if (!SETTINGS_PATH.test(path)) await shown(page, 'books-nav-settings').click()
    if (!ACCESS_PATH.test(path)) {
        await expect(shown(page, 'books-settings')).toBeVisible()
        await shown(page, 'books-settings-section-access').click()
    }
    await expect(shown(page, 'books-settings-access-search')).toBeVisible()
}

// Leaving and re-opening the section remounts the rows, so they show the saved level.
async function reopenAccess(page: Page) {
    if ((page.viewportSize()?.width ?? 0) < 768) {
        await shown(page, 'books-settings-back').click()
        await shown(page, 'books-settings-section-access').click()
    } else {
        await shown(page, 'books-settings-section-numbering').click()
        await expect(shown(page, 'books-settings-numbering')).toBeVisible()
        await shown(page, 'books-settings-section-access').click()
    }
    await expect(shown(page, 'books-settings-access-search')).toBeVisible()
}

async function levelOf(row: Locator): Promise<Level> {
    const note = row.locator('[data-testid^="books-settings-access-note-"]')
    const text = (await note.textContent()) ?? ''
    const found = LEVELS.find(level => DESCRIPTIONS[level] === text.trim())
    if (!found) throw new Error(`row shows no level description: ${text}`)
    return found
}

// The page is the owner's, in Books. Opens Settings → Access when it is not open, sets the
// collaborator's level, and waits until the level shows again after the rows remount.
export async function setCollaboratorLevel(page: Page, level: Level): Promise<void> {
    await openAccess(page)
    const row = accessRow(page, TEST_COLLABORATOR_EMAIL)
    const userId = await userIdOf(row)
    await shown(page, `books-settings-access-level-${userId}`).click()
    await shown(page, `books-settings-access-level-${userId}-${level}`).click()
    await expect(chipOf(page, userId)).toHaveText(LABELS[level])
    await expect(shown(page, `books-settings-access-level-${userId}`)).toBeEnabled()
    await reopenAccess(page)
    await expect(chipOf(page, userId)).toHaveText(LABELS[level])
    await expect(row.getByText(DESCRIPTIONS[level], { exact: true })).toBeVisible()
}

// The page is the owner's, in Books. Opens Settings → Access when it is not open and reads
// the collaborator's level from their row.
export async function collaboratorLevel(page: Page): Promise<Level> {
    await openAccess(page)
    const row = accessRow(page, TEST_COLLABORATOR_EMAIL)
    await expect(row).toBeVisible()
    return levelOf(row)
}
