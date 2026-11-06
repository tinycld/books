import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BANKING_DESKTOP,
    bankCard,
    chooseBankFile,
    connectAccount,
    createBankTestAccount,
    disconnectSelected,
    dropBankFiles,
    openBanking,
    statementFile,
} from './banking-helpers'
import { isDisabled } from './record-form-helpers'

// Each test connects its own number-less Bank account, uploads files with unique bytes to
// it, and removes them and disconnects it before it ends, so the seeded connections and
// their files stay as seeded.

const FILES_URL = '**/api/collections/books_bank_files/records'
const TRANSPORT_TEXT = 'The file could not be uploaded. Check your connection and try again.'
const WRITER_EMPTY = 'No files uploaded yet. Upload the statement you exported from your bank.'
const REMOVE_LINE = 'The uploaded file is deleted. Nothing in your books changes.'

function stampOf(label: string) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function fileRows(page: Page): Locator {
    return page
        .getByTestId('bank-files')
        .locator('[data-testid^="bank-file-"]:not([data-testid^="bank-file-remove-"])')
}

function fileRow(page: Page, name: string): Locator {
    return fileRows(page).filter({ has: page.getByText(name, { exact: true }) })
}

async function fileIdOf(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    return testId.slice('bank-file-'.length)
}

// Every POST that creates a bank file, from now on.
function filePosts(page: Page) {
    const posts: string[] = []
    page.on('request', request => {
        if (
            request.method() === 'POST' &&
            request.url().includes('/api/collections/books_bank_files/records')
        ) {
            posts.push(request.url())
        }
    })
    return posts
}

// Delays the next file POST (the real request, sent on at release); reads pass.
async function holdFilePost(page: Page) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    let arrive = () => {}
    const arrived = new Promise<void>(resolve => {
        arrive = resolve
    })
    await page.route(FILES_URL, async (route: Route) => {
        if (route.request().method() !== 'POST') return route.continue()
        arrive()
        await released
        await route.continue()
    })
    return {
        arrived,
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

// The day the server writes in a duplicate refusal: today in UTC.
function todayInUtc() {
    return new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

async function removeFile(page: Page, name: string) {
    const id = await fileIdOf(fileRow(page, name))
    await page.getByTestId(`bank-file-remove-${id}`).click()
    const dialog = page.getByTestId('bank-remove-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('bank-remove-dialog-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId(`bank-file-${id}`)).toHaveCount(0)
}

async function openConnectedAccount(page: Page, details?: { institution: string; mask: string }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(BANKING_DESKTOP)
    const name = await createBankTestAccount(page)
    await openBanking(page)
    await connectAccount(page, name, details)
    return name
}

test.describe('bank-connection: upload', () => {
    test('uploads a statement, refuses it again and a wrong type, and removes it', async ({
        page,
    }) => {
        const name = await openConnectedAccount(page, { institution: 'Upload Bank', mask: '4242' })
        const card = bankCard(page, name)
        const drop = page.getByTestId('bank-file-drop')
        await expect(
            drop.getByText('Drag the file you exported from your bank here, or choose it', {
                exact: true,
            })
        ).toBeVisible()
        await expect(
            drop.getByText('One CSV, OFX, QFX or QBO file at a time, up to 5 MB.', {
                exact: true,
            })
        ).toBeVisible()
        const posts = filePosts(page)
        const file = statementFile(stampOf('upload'))

        await page.route(FILES_URL, route =>
            route.request().method() === 'POST' ? route.abort() : route.continue()
        )
        await chooseBankFile(page, file)
        await expect(page.getByTestId('bank-upload-error')).toHaveText(TRANSPORT_TEXT)
        await expect(fileRows(page)).toHaveCount(0)
        await expect(page.getByTestId('bank-files-empty')).toHaveText(WRITER_EMPTY)
        await page.unrouteAll({ behavior: 'wait' })

        const held = await holdFilePost(page)
        await chooseBankFile(page, file)
        await held.arrived
        await expect(page.getByTestId('bank-upload-busy')).toHaveText(`Uploading ${file.name}…`)
        expect(await isDisabled(page.getByTestId('bank-choose-file'))).toBe(true)
        await held.release()

        await expect(page.getByTestId('bank-upload-done')).toHaveText(`${file.name} uploaded.`)
        const row = fileRow(page, file.name)
        await expect(row).toHaveCount(1)
        await expect(row.getByText('CSV', { exact: true })).toBeVisible()
        await expect(row.getByText('Waiting to import', { exact: true })).toBeVisible()
        await expect(card.getByText('1 file waiting', { exact: true })).toBeVisible()

        await chooseBankFile(page, file)
        const error = page.getByTestId('bank-upload-error')
        await expect(error).toHaveText(
            `${file.name} was already uploaded to ${name} on ${todayInUtc()}.`
        )
        await expect(error).toHaveAttribute('role', 'alert')
        await expect(fileRows(page)).toHaveCount(1)

        const postsBeforePdf = posts.length
        await chooseBankFile(page, {
            name: 'statement.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%statement\n'),
        })
        await expect(error).toHaveText('Choose a CSV, OFX, QFX or QBO file')
        expect(posts).toHaveLength(postsBeforePdf)

        const id = await fileIdOf(row)
        await page.getByTestId(`bank-file-remove-${id}`).click()
        const dialog = page.getByTestId('bank-remove-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(`Remove ${file.name}?`, { exact: true })).toBeVisible()
        await expect(dialog.getByText(REMOVE_LINE, { exact: true })).toBeVisible()
        await page.getByTestId('bank-remove-dialog-confirm').click()

        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId(`bank-file-${id}`)).toHaveCount(0)
        await expect(page.getByTestId('bank-files-empty')).toHaveText(WRITER_EMPTY)
        await expect(card.getByText('No files waiting', { exact: true })).toBeVisible()

        await disconnectSelected(page, name)
    })

    test('a drop takes one file, the newest file is first, and nothing uploads while the server takes no writes', async ({
        page,
    }) => {
        const name = await openConnectedAccount(page)
        const card = bankCard(page, name)
        await expect(card.getByText('No bank details', { exact: true })).toBeVisible()
        await expect(page.getByTestId('bank-panel-details')).toHaveText('No bank details')
        const posts = filePosts(page)

        await dropBankFiles(page, [
            {
                name: `${stampOf('two-a')}.csv`,
                text: statementFile(stampOf('a')).buffer.toString(),
            },
            {
                name: `${stampOf('two-b')}.csv`,
                text: statementFile(stampOf('b')).buffer.toString(),
            },
        ])
        await expect(page.getByTestId('bank-upload-error')).toHaveText('Drop one file at a time')
        expect(posts).toEqual([])
        await expect(fileRows(page)).toHaveCount(0)

        const ofx = statementFile(stampOf('drop'), 'ofx')
        await dropBankFiles(page, [{ name: ofx.name, text: ofx.buffer.toString() }])
        await expect(page.getByTestId('bank-upload-done')).toHaveText(`${ofx.name} uploaded.`)
        await expect(fileRow(page, ofx.name).getByText('OFX', { exact: true })).toBeVisible()

        const csv = statementFile(stampOf('newest'))
        await chooseBankFile(page, csv)
        await expect(page.getByTestId('bank-upload-done')).toHaveText(`${csv.name} uploaded.`)
        await expect(fileRows(page)).toHaveCount(2)
        await expect
            .poll(() =>
                page.evaluate(
                    names =>
                        Array.from(
                            document.querySelectorAll(
                                '[data-testid="bank-files"] [data-testid^="bank-file-"]:not([data-testid^="bank-file-remove-"])'
                            )
                        ).map(
                            node => names.find(name => node.textContent?.includes(name)) ?? 'other'
                        ),
                    [csv.name, ofx.name]
                )
            )
            .toEqual([csv.name, ofx.name])
        await expect(card.getByText('2 files waiting', { exact: true })).toBeVisible()
        const ids = [
            await fileIdOf(fileRow(page, csv.name)),
            await fileIdOf(fileRow(page, ofx.name)),
        ]

        await page.context().setOffline(true)
        await expect.poll(() => isDisabled(page.getByTestId('bank-choose-file'))).toBe(true)
        for (const id of ids) {
            expect(await isDisabled(page.getByTestId(`bank-file-remove-${id}`))).toBe(true)
        }
        await page.getByTestId('bank-panel-more').click()
        const disconnect = page.getByTestId('bank-menu-disconnect')
        await expect(disconnect).toBeVisible()
        expect(await isDisabled(disconnect)).toBe(true)
        await page.keyboard.press('Escape')
        await expect(disconnect).toHaveCount(0)

        const ignored = statementFile(stampOf('offline'))
        await dropBankFiles(page, [{ name: ignored.name, text: ignored.buffer.toString() }])
        await expect(page.getByTestId('bank-upload-done')).toHaveText(`${csv.name} uploaded.`)
        await expect(page.getByTestId('bank-upload-busy')).toHaveCount(0)
        expect(posts).toHaveLength(2)
        await expect(fileRows(page)).toHaveCount(2)
        await expect(fileRow(page, ignored.name)).toHaveCount(0)
        await page.context().setOffline(false)

        await expect.poll(() => isDisabled(page.getByTestId('bank-choose-file'))).toBe(false)
        await removeFile(page, csv.name)
        await removeFile(page, ofx.name)
        await disconnectSelected(page, name)
    })
})
